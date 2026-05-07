"""LLM-based reference re-parsing for unmatched and suspicious references.

Reads raw reference text from references_split.json and sends it to an LLM
for structured re-parsing. The LLM does NOT search external databases — it
only extracts structured fields from the text the human wrote.

Outputs:
  - references_repaired_llm.json  (machine-readable structured data)
  - references_repaired_llm.md    (human-readable report)
"""

import json
import os
import time
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

# ── Batch size ──────────────────────────────────────────────────────────
_BATCH_SIZE = 10


# ── Public entry point ──────────────────────────────────────────────────

def generate_llm_repairs(project_dir, provider_obj):
    """Run LLM-based reference re-parsing on unmatched and suspicious references.

    Args:
        project_dir: Path to the project working folder.
        provider_obj: LLMProvider instance configured for the target slot.

    Returns:
        dict with summary counts (total_processed, repaired, etc.).
    """
    from peer_review_assistant.llm import chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.llm.prompts import build_repair_references_messages

    citations_dir = os.path.join(project_dir, "citations")

    # ── Load inputs ──────────────────────────────────────────────────
    refs_path = os.path.join(citations_dir, "references_split.json")
    viewer_path = os.path.join(citations_dir, "citation_viewer_data.json")

    if not os.path.isfile(refs_path):
        raise FileNotFoundError(
            "references_split.json not found. Run extract-citations first."
        )

    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)

    viewer_data = _load_json_opt(viewer_path)
    viewer_cards = viewer_data.get("cards", {}) if viewer_data else {}

    # ── Filter to target references ──────────────────────────────────
    targets = []
    for ref in refs["items"]:
        rid = ref["reference_id"]
        card = viewer_cards.get(rid, {})

        # Include unmatched, suspicious, or low parse confidence
        status = card.get("status", "unmatched")
        parse_conf = ref.get("parse_confidence", "low")

        if status in ("unmatched", "suspicious", "error") or parse_conf == "low":
            targets.append({
                "reference_id": rid,
                "raw_text": ref["raw_text"],
                "parsed": ref.get("parsed", {}),
                "status": status,
                "parse_confidence": parse_conf,
            })

    if not targets:
        return {"total_processed": 0, "repaired": 0, "message": "No targets found."}

    # ── Process in batches ───────────────────────────────────────────
    all_repaired = []
    total_batches = (len(targets) + _BATCH_SIZE - 1) // _BATCH_SIZE

    for batch_idx in range(total_batches):
        start = batch_idx * _BATCH_SIZE
        end = min(start + _BATCH_SIZE, len(targets))
        batch = targets[start:end]

        messages = build_repair_references_messages(batch)
        result = chat_completion(
            provider_obj,
            messages,
            max_tokens=4096,
            temperature=0.0,
            timeout_seconds=120,
        )

        if not result["ok"]:
            # If LLM call fails, keep raw entries with error flag
            for t in batch:
                all_repaired.append({
                    "reference_id": t["reference_id"],
                    "raw_reference_text": t["raw_text"],
                    "parsed": t["parsed"],
                    "flags": {"needs_human_review": True},
                    "warnings": [f"LLM call failed: {result.get('error', 'Unknown')}"],
                    "confidence": "low",
                    "_error": result.get("error"),
                })
            continue

        parsed = parse_llm_json(result["content"])

        if parsed is None:
            # JSON parse failed — store raw response for debugging
            for t in batch:
                all_repaired.append({
                    "reference_id": t["reference_id"],
                    "raw_reference_text": t["raw_text"],
                    "parsed": t["parsed"],
                    "flags": {"needs_human_review": True},
                    "warnings": ["LLM response could not be parsed as JSON"],
                    "confidence": "low",
                })
            continue

        # Accept either a "references" key (batched) or a single reference dict
        repaired_items = parsed.get("references") or []
        if not repaired_items and isinstance(parsed, dict) and "reference_id" in parsed:
            repaired_items = [parsed]

        # Build lookup from batch IDs
        batch_ids = {t["reference_id"]: t for t in batch}

        for item in repaired_items:
            rid = item.get("reference_id", "")
            if rid not in batch_ids:
                continue
            t = batch_ids[rid]
            all_repaired.append({
                "reference_id": rid,
                "raw_reference_text": t["raw_text"],
                "parsed": item.get("parsed", t["parsed"]),
                "flags": item.get("flags", {}),
                "warnings": item.get("warnings", []),
                "confidence": item.get("confidence", "medium"),
            })

        # Add any missing batch items (LLM skipped them)
        returned_ids = {item.get("reference_id", "") for item in repaired_items}
        for t in batch:
            if t["reference_id"] not in returned_ids:
                all_repaired.append({
                    "reference_id": t["reference_id"],
                    "raw_reference_text": t["raw_text"],
                    "parsed": t["parsed"],
                    "flags": {"needs_human_review": True},
                    "warnings": ["LLM did not return this reference"],
                    "confidence": "low",
                })

        # Small delay between batches to be gentle on API
        if batch_idx < total_batches - 1:
            time.sleep(0.5)

    # ── Save outputs ──────────────────────────────────────────────────
    _save_json(citations_dir, all_repaired, targets)
    _save_markdown(citations_dir, all_repaired)

    # Count stats
    n_repaired = sum(
        1 for r in all_repaired
        if r.get("confidence") != "low" and "_error" not in r
    )
    n_with_url = sum(
        1 for r in all_repaired
        if r.get("parsed", {}).get("url")
    )
    n_likely_book = sum(
        1 for r in all_repaired
        if r.get("flags", {}).get("likely_book")
    )
    n_missing_doi = sum(
        1 for r in all_repaired
        if r.get("flags", {}).get("possible_missing_doi")
    )

    return {
        "total_processed": len(targets),
        "repaired": n_repaired,
        "with_url": n_with_url,
        "likely_book": n_likely_book,
        "possible_missing_doi": n_missing_doi,
        "batches": total_batches,
        "message": (
            f"LLM repair complete: {len(targets)} references processed "
            f"in {total_batches} batch(es). {n_repaired} repaired, "
            f"{n_with_url} with URL, {n_likely_book} likely book, "
            f"{n_missing_doi} possible missing DOI."
        ),
    }


# ── File writers ──────────────────────────────────────────────────────

def _save_json(citations_dir, all_repaired, targets):
    """Write references_repaired_llm.json."""
    out_path = os.path.join(citations_dir, "references_repaired_llm.json")
    output = {
        "generated_at": datetime.now(JST).isoformat(),
        "total_targets": len(targets),
        "total_repaired": len(all_repaired),
        "items": all_repaired,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)


def _save_markdown(citations_dir, all_repaired):
    """Write references_repaired_llm.md — human-readable report."""
    lines = [
        "# LLM Reference Re-Parsing Report",
        "",
        f"**Generated**: {datetime.now(JST).isoformat()}",
        "",
        f"**Total repaired**: {len(all_repaired)}",
        "",
        "---",
        "",
    ]

    # Group by publication type
    by_type = {}
    for r in all_repaired:
        ptype = r.get("parsed", {}).get("publication_type") or "unknown"
        by_type.setdefault(ptype, []).append(r)

    for ptype in ["journal_article", "book", "edited_book", "book_chapter",
                   "report", "government_document", "web_document",
                   "conference_paper", "manual", "unknown", "other"]:
        items = by_type.pop(ptype, [])
        if not items:
            continue
        lines.append(f"## {_type_label(ptype)} ({len(items)})")
        lines.append("")
        for r in items:
            parsed = r.get("parsed", {})
            flags = r.get("flags", {})
            warnings = r.get("warnings", [])
            authors = "; ".join(parsed.get("authors", []) or [])
            year = parsed.get("year", "?")
            title = parsed.get("title") or parsed.get("book_title") or "?"
            publisher = parsed.get("publisher")
            journal = parsed.get("journal")
            url = parsed.get("url")
            doi = parsed.get("doi")
            confidence = r.get("confidence", "?")

            lines.append(f"### {r['reference_id']} — confidence: {confidence}")
            lines.append("")
            lines.append(f"**Raw**: {r['raw_reference_text'][:200]}")
            lines.append("")
            lines.append(f"**Authors**: {authors or '?'}")
            lines.append(f"**Year**: {year}")
            lines.append(f"**Title**: {title}")
            if journal:
                lines.append(f"**Journal**: {journal}")
            if publisher:
                lines.append(f"**Publisher**: {publisher}")
            if url:
                lines.append(f"**URL**: {url}")
            if doi:
                lines.append(f"**DOI**: {doi}")
            if parsed.get("volume"):
                lines.append(f"**Volume**: {parsed['volume']}")
            if parsed.get("issue"):
                lines.append(f"**Issue**: {parsed['issue']}")
            if parsed.get("pages"):
                lines.append(f"**Pages**: {parsed['pages']}")
            if parsed.get("editor"):
                lines.append(f"**Editor**: {', '.join(parsed['editor']) if isinstance(parsed['editor'], list) else parsed['editor']}")
            if parsed.get("isbn"):
                lines.append(f"**ISBN**: {parsed['isbn']}")
            lines.append("")

            if flags:
                active_flags = [k for k, v in flags.items() if v]
                if active_flags:
                    lines.append(f"**Flags**: {', '.join(active_flags)}")
                    lines.append("")

            if warnings:
                lines.append("**Warnings**:")
                for w in warnings:
                    lines.append(f"- {w}")
                lines.append("")

            lines += ["---", ""]

    # Remaining types
    for ptype, items in sorted(by_type.items()):
        lines.append(f"## {_type_label(ptype)} ({len(items)})")
        lines.append("")
        for r in items:
            lines.append(f"- {r['reference_id']}: {r['raw_reference_text'][:120]}")
        lines.append("")

    path = os.path.join(citations_dir, "references_repaired_llm.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _type_label(ptype):
    """Human-readable label for publication type."""
    labels = {
        "journal_article": "Journal Articles",
        "book": "Books",
        "edited_book": "Edited Books",
        "book_chapter": "Book Chapters",
        "report": "Reports",
        "government_document": "Government Documents",
        "web_document": "Web Documents",
        "conference_paper": "Conference Papers",
        "manual": "Manuals / Guidelines",
        "unknown": "Unknown Type",
        "other": "Other",
    }
    return labels.get(ptype, ptype.replace("_", " ").title())


# ── Helpers ──────────────────────────────────────────────────────────

def _load_json_opt(path):
    """Load JSON file if it exists, otherwise return None."""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None
