"""LLM-based reference search and identification for unmatched references.

When Crossref and PubMed cannot match a reference, this module sends the
raw reference text to an LLM and asks it to identify the publication using
its training knowledge.  The LLM can recognise:

  - Academic books by title, author, year, publisher
  - Journal articles where only the abbreviation is given (e.g. "Ann Zool Fenn")
  - Government reports, statistical publications, web documents
  - Corrected bibliographic details (full journal names, DOIs, ISBNs, URLs)

This is complementary to repair-references-llm (which only re-parses text):
here the LLM actively *identifies* the work.

Outputs:
  - references_searched_llm.json  (machine-readable structured data)
  - references_searched_llm.md    (human-readable report)
"""

import json
import os
import time
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

# ── Batch size (references per LLM call) ───────────────────────────────
_BATCH_SIZE = 5


# ── Public entry point ──────────────────────────────────────────────────

def search_references_llm(project_dir, provider_obj, progress_callback=None):
    """Use LLM to identify unmatched references.

    Args:
        project_dir: Path to the project working folder.
        provider_obj: LLMProvider instance.
        progress_callback: Optional callable(percent, message, data) called
            after each batch for incremental progress reporting.

    Returns:
        dict with summary counts.
    """
    from peer_review_assistant.llm import chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.llm.prompts import build_search_references_messages

    citations_dir = os.path.join(project_dir, "citations")

    # ── Load inputs ──────────────────────────────────────────────────
    refs_path = os.path.join(citations_dir, "references_split.json")
    unmatched_path = os.path.join(citations_dir, "db_unmatched_references.json")

    if not os.path.isfile(refs_path):
        raise FileNotFoundError(
            "references_split.json not found. Run extract-citations first."
        )

    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)

    unmatched_data = _load_json_opt(unmatched_path)
    unmatched_ids = set()
    if isinstance(unmatched_data, dict):
        for it in unmatched_data.get("items", []):
            if isinstance(it, dict):
                unmatched_ids.add(it.get("reference_id", ""))

    if not unmatched_ids:
        return {
            "total_processed": 0,
            "identified": 0,
            "uncertain": 0,
            "batches": 0,
            "message": "No unmatched references found.",
        }

    # Build ref lookup
    ref_map = {}
    for ref in refs.get("items", []):
        ref_map[ref["reference_id"]] = ref

    # ── Build targets ────────────────────────────────────────────────
    targets = []
    for rid in sorted(unmatched_ids):
        ref = ref_map.get(rid)
        if not ref:
            continue
        raw_text = ref.get("raw_text", "")
        parsed = ref.get("parsed", {})
        targets.append({
            "reference_id": rid,
            "raw_text": raw_text,
            "parsed": parsed,
        })

    if not targets:
        return {
            "total_processed": 0,
            "identified": 0,
            "uncertain": 0,
            "batches": 0,
            "message": "No unmatched references to process.",
        }

    # ── Set up logging ──────────────────────────────────────────────
    logs_dir = os.path.join(project_dir, "logs")
    os.makedirs(logs_dir, exist_ok=True)
    log_path = os.path.join(logs_dir, "llm_search.log")

    def _log(msg):
        ts = datetime.now(JST).isoformat()
        line = f"[{ts}] {msg}\n"
        with open(log_path, "a", encoding="utf-8") as lf:
            lf.write(line)

    _log(f"LLM reference search started: {len(targets)} unmatched references in {(len(targets) + _BATCH_SIZE - 1) // _BATCH_SIZE} batch(es)")

    # ── Process in batches ───────────────────────────────────────────
    all_results = []
    total_batches = (len(targets) + _BATCH_SIZE - 1) // _BATCH_SIZE

    for batch_idx in range(total_batches):
        start = batch_idx * _BATCH_SIZE
        end = min(start + _BATCH_SIZE, len(targets))
        batch = targets[start:end]

        batch_ids = [t["reference_id"] for t in batch]
        _log(f"Batch {batch_idx + 1}/{total_batches}: {len(batch)} refs — {', '.join(batch_ids)}")

        messages = build_search_references_messages(batch)
        result = chat_completion(
            provider_obj,
            messages,
            max_tokens=8192,
            temperature=0.0,
            timeout_seconds=300,
        )

        if not result["ok"]:
            _log(f"  ERROR: LLM call failed — {result.get('error', 'unknown error')}")
            for t in batch:
                all_results.append({
                    "reference_id": t["reference_id"],
                    "raw_text": t["raw_text"],
                    "identified": False,
                    "confidence": "none",
                    "error": result.get("error", "LLM call failed"),
                })
            continue

        parsed = parse_llm_json(result["content"])
        _log(f"  LLM response latency: {result.get('latency_ms', '?')}ms")

        if parsed is None:
            _log(f"  ERROR: Could not parse LLM response as JSON")
            # Log raw response (first 500 chars) for debugging
            raw_content = result.get("content", "")
            _log(f"  Raw response (first 500 chars): {raw_content[:500]}")
            # Also write full response to a debug file
            debug_path = os.path.join(logs_dir, f"llm_search_debug_batch{batch_idx + 1}.txt")
            with open(debug_path, "w", encoding="utf-8") as df:
                df.write(f"=== LLM Raw Response (Batch {batch_idx + 1}) ===\n")
                df.write(f"Model: {getattr(provider_obj, 'model', '?')}\n")
                df.write(f"Latency: {result.get('latency_ms', '?')}ms\n\n")
                df.write(raw_content)
            _log(f"  Full response saved to: {debug_path}")
            for t in batch:
                all_results.append({
                    "reference_id": t["reference_id"],
                    "raw_text": t["raw_text"],
                    "identified": False,
                    "confidence": "none",
                    "error": "LLM response could not be parsed as JSON",
                })
            continue

        results_list = parsed.get("references") or []
        result_by_id = {}
        for r in results_list:
            rid = r.get("reference_id", "")
            if rid:
                result_by_id[rid] = r

        for t in batch:
            r = result_by_id.get(t["reference_id"], {})
            confidence = r.get("confidence", "medium")
            identified = confidence in ("high", "medium")
            ptype = r.get("publication_type", "?")
            corrected = r.get("corrected") or {}
            # Detect missing DOI — confirmed when identified but no DOI in corrected data
            missing_doi = (
                identified
                and confidence == "high"
                and (not corrected or not corrected.get("doi"))
                and ptype not in ("government_document", "web_document")
            )
            _log(f"  {t['reference_id']}: confidence={confidence}, identified={identified}, type={ptype}, title={corrected.get('title', '?')[:80]}, missing_doi={missing_doi}")
            all_results.append({
                "reference_id": t["reference_id"],
                "raw_text": t["raw_text"],
                "identified": identified,
                "confidence": confidence,
                "publication_type": ptype,
                "corrected": corrected,
                "missing_doi_confirmed": missing_doi,
                "notes": r.get("notes", ""),
                "source_urls": r.get("source_urls", []),
                "error": r.get("error"),
            })

        # ── Progress callback after each batch ──────────────────────
        if progress_callback:
            batch_identified = sum(1 for r in all_results
                                   if r["reference_id"] in {t["reference_id"] for t in batch}
                                   and r["identified"])
            batch_confidences = {}
            for r in all_results:
                if r["reference_id"] in {t["reference_id"] for t in batch}:
                    c = r.get("confidence", "none")
                    batch_confidences[c] = batch_confidences.get(c, 0) + 1
            pct = int((batch_idx + 1) / total_batches * 90)
            progress_callback(pct, {
                "batch": batch_idx + 1,
                "total_batches": total_batches,
                "batch_size": len(batch),
                "batch_identified": batch_identified,
                "cumulative_identified": sum(1 for r in all_results if r["identified"]),
                "confidences": batch_confidences,
            })

        if batch_idx < total_batches - 1:
            time.sleep(0.5)

    # ── Save JSON output ─────────────────────────────────────────────
    out_path = os.path.join(citations_dir, "references_searched_llm.json")
    output = {
        "generated_at": datetime.now(JST).isoformat(),
        "total_targets": len(targets),
        "items": all_results,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    # ── Save Markdown report ─────────────────────────────────────────
    _save_markdown(citations_dir, all_results)

    # ── Count stats ──────────────────────────────────────────────────
    n_identified = sum(1 for r in all_results if r["identified"])
    n_uncertain = sum(1 for r in all_results
                      if not r["identified"] and r.get("confidence") != "none")

    _log(f"Search complete: {n_identified} identified, {n_uncertain} uncertain, "
         f"{len(targets) - n_identified - n_uncertain} not found")
    _log(f"Log written to: {log_path}")

    return {
        "total_processed": len(targets),
        "identified": n_identified,
        "uncertain": n_uncertain,
        "batches": total_batches,
        "message": (
            f"LLM reference search complete: {len(targets)} references "
            f"in {total_batches} batch(es). "
            f"{n_identified} identified, {n_uncertain} uncertain."
        ),
    }


# ── Markdown report ────────────────────────────────────────────────────

def _save_markdown(citations_dir, all_results):
    """Write references_searched_llm.md — human-readable report."""
    lines = [
        "# LLM Reference Search Report",
        "",
        f"**Generated**: {datetime.now(JST).isoformat()}",
        "",
        f"**Total searched**: {len(all_results)}",
        "",
        "---",
        "",
    ]

    # Group by confidence
    for confidence in ["high", "medium", "low", "none"]:
        items = [r for r in all_results if r.get("confidence") == confidence]
        if not items:
            continue
        label = {"high": "高確度で特定", "medium": "中確度",
                 "low": "低確度（参考情報）", "none": "特定できず"}[confidence]
        lines.append(f"## {label} ({len(items)}件)")
        lines.append("")

        for r in items:
            rid = r["reference_id"]
            lines.append(f"### {rid}")
            lines.append("")
            lines.append(f"**元のテキスト**: {r['raw_text'][:200]}")
            lines.append("")

            corrected = r.get("corrected") or {}
            if corrected:
                lines.append("**修正候補**:")
                lines.append("")
                if corrected.get("authors"):
                    authors = "; ".join(corrected["authors"]) if isinstance(corrected["authors"], list) else corrected["authors"]
                    lines.append(f"- 著者: {authors}")
                if corrected.get("year"):
                    lines.append(f"- 年: {corrected['year']}")
                if corrected.get("title"):
                    lines.append(f"- タイトル: {corrected['title']}")
                if corrected.get("journal"):
                    lines.append(f"- 雑誌名: {corrected['journal']}")
                if corrected.get("book_title"):
                    lines.append(f"- 書名: {corrected['book_title']}")
                if corrected.get("publisher"):
                    lines.append(f"- 出版社: {corrected['publisher']}")
                if corrected.get("volume"):
                    lines.append(f"- 巻: {corrected['volume']}")
                if corrected.get("issue"):
                    lines.append(f"- 号: {corrected['issue']}")
                if corrected.get("pages"):
                    lines.append(f"- ページ: {corrected['pages']}")
                if corrected.get("doi"):
                    lines.append(f"- DOI: {corrected['doi']}")
                if corrected.get("isbn"):
                    lines.append(f"- ISBN: {corrected['isbn']}")
                if corrected.get("url"):
                    lines.append(f"- URL: {corrected['url']}")
                lines.append("")

            ptype = r.get("publication_type")
            if ptype:
                ptype_labels = {
                    "journal_article": "雑誌論文",
                    "book": "書籍",
                    "edited_book": "編集書籍",
                    "book_chapter": "書籍の章",
                    "report": "報告書",
                    "government_document": "政府文書",
                    "web_document": "Web文書",
                    "conference_paper": "会議録",
                    "other": "その他",
                }
                lines.append(f"- 文献タイプ: {ptype_labels.get(ptype, ptype)}")

            notes = r.get("notes", "")
            if notes:
                lines.append(f"- 備考: {notes}")

            source_urls = r.get("source_urls") or []
            if source_urls:
                lines.append("- 情報源:")
                for u in source_urls:
                    lines.append(f"  - {u}")

            error = r.get("error", "")
            if error:
                lines.append(f"- エラー: {error}")

            lines.append("")
            lines.append("---")
            lines.append("")

    out_path = os.path.join(citations_dir, "references_searched_llm.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ── Helpers ──────────────────────────────────────────────────────────────

def search_single_reference_llm(project_dir, reference_id, provider_obj):
    """Use LLM to identify a single unmatched reference.

    Args:
        project_dir: Path to the project working folder.
        reference_id: Reference ID (e.g., "R032").
        provider_obj: LLMProvider instance.

    Returns:
        dict with the LLM search result for this reference, in the same shape
        as items in references_searched_llm.json.
    """
    from peer_review_assistant.llm import chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.llm.prompts import build_search_references_messages

    citations_dir = os.path.join(project_dir, "citations")
    refs_path = os.path.join(citations_dir, "references_split.json")

    if not os.path.isfile(refs_path):
        raise FileNotFoundError(
            "references_split.json not found. Run extract-citations first."
        )

    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)

    ref = None
    for r in refs.get("items", []):
        if r.get("reference_id") == reference_id:
            ref = r
            break

    if not ref:
        raise ValueError(f"Reference {reference_id} not found in references_split.json")

    target = {
        "reference_id": reference_id,
        "raw_text": ref.get("raw_text", ""),
        "parsed": ref.get("parsed", {}),
    }

    # Use existing batch prompt builder with single-item batch
    messages = build_search_references_messages([target])
    result = chat_completion(
        provider_obj,
        messages,
        max_tokens=4096,
        temperature=0.0,
        timeout_seconds=120,
    )

    if not result["ok"]:
        return {
            "reference_id": reference_id,
            "raw_text": target["raw_text"],
            "identified": False,
            "confidence": "none",
            "error": result.get("error", "LLM call failed"),
        }

    parsed = parse_llm_json(result["content"])

    if parsed is None:
        return {
            "reference_id": reference_id,
            "raw_text": target["raw_text"],
            "identified": False,
            "confidence": "none",
            "error": "LLM response could not be parsed as JSON",
        }

    results_list = parsed.get("references") or []
    r = results_list[0] if results_list else {}
    confidence = r.get("confidence", "medium")
    identified = confidence in ("high", "medium")
    ptype = r.get("publication_type", "?")
    corrected = r.get("corrected") or {}
    missing_doi = (
        identified
        and confidence == "high"
        and (not corrected or not corrected.get("doi"))
        and ptype not in ("government_document", "web_document")
    )

    item = {
        "reference_id": reference_id,
        "raw_text": target["raw_text"],
        "identified": identified,
        "confidence": confidence,
        "publication_type": ptype,
        "corrected": corrected,
        "missing_doi_confirmed": missing_doi,
        "notes": r.get("notes", ""),
        "source_urls": r.get("source_urls", []),
        "error": r.get("error"),
    }

    # ── Save per-reference file ──────────────────────────────────────
    slot_name = getattr(provider_obj, "name", "unknown")
    single_dir = os.path.join(citations_dir, "llm_search_single")
    os.makedirs(single_dir, exist_ok=True)
    single_path = os.path.join(single_dir, f"{reference_id}_{slot_name}.json")
    single_output = {
        "generated_at": datetime.now(JST).isoformat(),
        "reference_id": reference_id,
        "slot": slot_name,
        "item": item,
    }
    with open(single_path, "w", encoding="utf-8") as f:
        json.dump(single_output, f, indent=2, ensure_ascii=False)

    # ── Merge into references_searched_llm.json ──────────────────────
    _upsert_searched_llm(citations_dir, item)

    return item


def _upsert_searched_llm(citations_dir, item):
    """Upsert a single reference result into references_searched_llm.json."""
    out_path = os.path.join(citations_dir, "references_searched_llm.json")
    existing = _load_json_opt(out_path)
    if existing is None:
        existing = {"generated_at": datetime.now(JST).isoformat(),
                    "total_targets": 0, "items": []}

    # Remove existing entry for this reference_id (idempotent)
    rid = item["reference_id"]
    existing["items"] = [
        it for it in existing.get("items", [])
        if it.get("reference_id") != rid
    ]
    existing["items"].append(item)
    existing["total_targets"] = len(existing["items"])
    existing["generated_at"] = datetime.now(JST).isoformat()

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)


def _load_json_opt(path):
    """Load JSON file if it exists, otherwise return None."""
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        if not isinstance(data, (dict, list)):
            return None
        return data
    except (json.JSONDecodeError, ValueError, OSError):
        return None
