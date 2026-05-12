"""LLM-based journal name disambiguation for citation matching.

After Crossref/PubMed verification, some references have matching titles
but mismatched journals purely due to abbreviation differences (e.g.,
"Ann Zool Fenn" vs "Annales Zoologici Fennici").  The word-level Jaccard
similarity used by _compare_title() cannot resolve these.

This module sends unique (original, db) journal-name pairs to an LLM,
which can recognise abbreviation conventions (NLM, ISO, Vancouver, …)
and determine whether the two names refer to the same publication.

Outputs:
  - journal_resolve_llm.json  (machine-readable results)
"""

import json
import os
import time
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

# ── Batch size (journal pairs per LLM call) ─────────────────────────────
_BATCH_SIZE = 20


# ── Public entry point ──────────────────────────────────────────────────

def resolve_journals_llm(project_dir, provider_obj):
    """Use LLM to disambiguate journal names that appear to mismatch.

    Args:
        project_dir: Path to the project working folder.
        provider_obj: LLMProvider instance configured for the target slot.

    Returns:
        dict with summary counts (total_pairs, resolved_identity,
        resolved_style, still_mismatch, total_references_updated).
    """
    from peer_review_assistant.llm import chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json
    from peer_review_assistant.llm.prompts import build_resolve_journals_messages

    citations_dir = os.path.join(project_dir, "citations")

    # ── Load inputs ──────────────────────────────────────────────────
    refs_path = os.path.join(citations_dir, "references_split.json")
    crossref_path = os.path.join(citations_dir, "db_crossref_results.json")
    pubmed_path = os.path.join(citations_dir, "db_pubmed_results.json")

    if not os.path.isfile(refs_path):
        raise FileNotFoundError(
            "references_split.json not found. Run extract-citations first."
        )

    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)

    crossref_results = _load_json_opt(crossref_path)
    pubmed_results = _load_json_opt(pubmed_path)

    cr_map = _build_map(crossref_results)
    pm_map = _build_map(pubmed_results)

    # Build a ref_id → parsed lookup from references_split
    ref_parsed_map = {}
    for ref in refs.get("items", []):
        rid = ref.get("reference_id")
        if rid:
            ref_parsed_map[rid] = ref.get("parsed", {})

    # ── Collect unique (original_journal, db_journal) pairs ──────────
    # We only consider references where the DB has a matched result,
    # title_match is "exact" or "fuzzy" (so we're confident it's the
    # right reference), but journal_match is "mismatch" (candidate for
    # abbreviation/style disambiguation).

    pairs_set = {}  # (original_journal_lower, db_journal_lower) → {original, db}
    ref_journal_entries = []  # per-reference records for output

    for rid, ref_parsed in ref_parsed_map.items():
        original_journal = (ref_parsed.get("journal") or "").strip()
        if not original_journal:
            continue

        # Check Crossref
        cr_item = cr_map.get(rid)
        if cr_item and cr_item.get("status") == "matched":
            comp = cr_item.get("comparison", {})
            if (comp.get("title_match") in ("exact", "fuzzy")
                    and comp.get("journal_match") == "mismatch"):
                db_journal = (cr_item.get("result", {}).get("journal") or "").strip()
                if db_journal:
                    key = (original_journal.lower(), db_journal.lower())
                    if key not in pairs_set:
                        pairs_set[key] = {
                            "original": original_journal,
                            "db": db_journal,
                        }

        # Check PubMed
        pm_item = pm_map.get(rid)
        if pm_item and pm_item.get("status") == "matched":
            comp = pm_item.get("comparison", {})
            if (comp.get("title_match") in ("exact", "fuzzy")
                    and comp.get("journal_match") == "mismatch"):
                db_journal = (pm_item.get("result", {}).get("journal") or "").strip()
                if db_journal:
                    key = (original_journal.lower(), db_journal.lower())
                    if key not in pairs_set:
                        pairs_set[key] = {
                            "original": original_journal,
                            "db": db_journal,
                        }

    if not pairs_set:
        return {
            "total_pairs": 0,
            "resolved_identity": 0,
            "resolved_style": 0,
            "still_mismatch": 0,
            "total_references_updated": 0,
            "batches": 0,
            "message": "No journal mismatches found with matching titles.",
        }

    unique_pairs = list(pairs_set.values())

    # ── Process in batches ───────────────────────────────────────────
    all_results = []
    total_batches = (len(unique_pairs) + _BATCH_SIZE - 1) // _BATCH_SIZE

    for batch_idx in range(total_batches):
        start = batch_idx * _BATCH_SIZE
        end = min(start + _BATCH_SIZE, len(unique_pairs))
        batch = unique_pairs[start:end]

        messages = build_resolve_journals_messages(batch)
        result = chat_completion(
            provider_obj,
            messages,
            max_tokens=2048,
            temperature=0.0,
            timeout_seconds=60,
        )

        if not result["ok"]:
            # LLM call failed — mark all as mismatch (could not resolve)
            for pair in batch:
                all_results.append({
                    "original": pair["original"],
                    "db": pair["db"],
                    "identity": "mismatch",
                    "style": None,
                    "reasoning": f"LLM call failed: {result.get('error', 'Unknown')}",
                    "_error": result.get("error"),
                })
            continue

        parsed = parse_llm_json(result["content"])

        if parsed is None:
            # JSON parse failed — mark all as mismatch
            for pair in batch:
                all_results.append({
                    "original": pair["original"],
                    "db": pair["db"],
                    "identity": "mismatch",
                    "style": None,
                    "reasoning": "LLM response could not be parsed as JSON",
                })
            continue

        results_list = parsed.get("results") or []
        result_by_idx = {}
        for r in results_list:
            idx = r.get("i")
            if idx is not None:
                result_by_idx[idx] = r

        for i, pair in enumerate(batch):
            r = result_by_idx.get(i, {})
            identity = r.get("identity", "mismatch")
            if identity not in ("identity", "style", "mismatch"):
                identity = "mismatch"
            style = r.get("style")
            if style not in ("nlm", "iso", "full", "vancouver", None):
                style = None
            all_results.append({
                "original": pair["original"],
                "db": pair["db"],
                "identity": identity,
                "style": style,
                "reasoning": r.get("reasoning", ""),
            })

        # Small delay between batches
        if batch_idx < total_batches - 1:
            time.sleep(0.5)

    # ── Build pair lookup ────────────────────────────────────────────
    pair_result_map = {}
    for r in all_results:
        key = (r["original"].lower(), r["db"].lower())
        pair_result_map[key] = r

    # ── Build per-reference results ──────────────────────────────────
    ref_results = []
    for rid, ref_parsed in ref_parsed_map.items():
        original_journal = (ref_parsed.get("journal") or "").strip()
        if not original_journal:
            continue

        cr_match = None
        pm_match = None

        cr_item = cr_map.get(rid)
        if cr_item and cr_item.get("status") == "matched":
            comp = cr_item.get("comparison", {})
            if (comp.get("title_match") in ("exact", "fuzzy")
                    and comp.get("journal_match") == "mismatch"):
                db_journal = (cr_item.get("result", {}).get("journal") or "").strip()
                if db_journal:
                    key = (original_journal.lower(), db_journal.lower())
                    cr_match = pair_result_map.get(key)

        pm_item = pm_map.get(rid)
        if pm_item and pm_item.get("status") == "matched":
            comp = pm_item.get("comparison", {})
            if (comp.get("title_match") in ("exact", "fuzzy")
                    and comp.get("journal_match") == "mismatch"):
                db_journal = (pm_item.get("result", {}).get("journal") or "").strip()
                if db_journal:
                    key = (original_journal.lower(), db_journal.lower())
                    pm_match = pair_result_map.get(key)

        if cr_match or pm_match:
            # Pick the best: identity > style > mismatch
            def _score(m):
                if m is None:
                    return 0
                if m.get("identity") == "identity":
                    return 3
                if m.get("identity") == "style":
                    return 2
                return 1

            best = cr_match if _score(cr_match) >= _score(pm_match) else pm_match
            ref_results.append({
                "reference_id": rid,
                "original_journal": original_journal,
                "db_journal": best["db"],
                "identity": best["identity"],
                "style": best["style"],
                "reasoning": best.get("reasoning", ""),
                "source": "crossref" if _score(cr_match) >= _score(pm_match) else "pubmed",
            })

    # ── Count stats ──────────────────────────────────────────────────
    resolved_identity = sum(1 for r in all_results if r["identity"] == "identity")
    resolved_style = sum(1 for r in all_results if r["identity"] == "style")
    still_mismatch = sum(1 for r in all_results if r["identity"] == "mismatch")

    # ── Save outputs ─────────────────────────────────────────────────
    out_path = os.path.join(citations_dir, "journal_resolve_llm.json")
    output = {
        "generated_at": datetime.now(JST).isoformat(),
        "total_unique_pairs": len(unique_pairs),
        "pairs": all_results,
        "references": ref_results,
        "summary": {
            "resolved_identity": resolved_identity,
            "resolved_style": resolved_style,
            "still_mismatch": still_mismatch,
            "total_references_updated": len(ref_results),
        },
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    return {
        "total_pairs": len(unique_pairs),
        "resolved_identity": resolved_identity,
        "resolved_style": resolved_style,
        "still_mismatch": still_mismatch,
        "total_references_updated": len(ref_results),
        "batches": total_batches,
        "message": (
            f"Journal disambiguation complete: {len(unique_pairs)} unique pairs "
            f"in {total_batches} batch(es). "
            f"{resolved_identity} identity, {resolved_style} style, "
            f"{still_mismatch} still mismatch. "
            f"{len(ref_results)} references updated."
        ),
    }


# ── Helpers ──────────────────────────────────────────────────────────────

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


def _build_map(results):
    """Build a reference_id → item lookup dict from DB results."""
    if not isinstance(results, dict):
        return {}
    items = results.get("items") or []
    if not isinstance(items, list):
        return {}
    m = {}
    for it in items:
        if not isinstance(it, dict):
            continue
        rid = it.get("reference_id")
        if rid:
            m[rid] = it
    return m
