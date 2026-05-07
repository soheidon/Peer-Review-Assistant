"""Unified citation viewer data generator.

Reads all citation verification data and produces a single JSON file
for the References Review Viewer GUI component.
"""

import json
import os
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))


# ── public entry point ───────────────────────────────────────────────────

def generate_viewer_data(project_dir):
    """Generate unified viewer data from all citation sources.

    Args:
        project_dir: Path to the project working folder.

    Returns:
        dict with summary, tabs (reference_id lists per tab), and cards
        (per-reference display objects keyed by reference_id).
    """
    citations_dir = os.path.join(project_dir, "citations")

    # Load inputs
    refs_path = os.path.join(citations_dir, "references_split.json")
    crossref_path = os.path.join(citations_dir, "db_crossref_results.json")
    pubmed_path = os.path.join(citations_dir, "db_pubmed_results.json")
    verified_path = os.path.join(citations_dir, "db_verified_references.json")

    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)

    crossref_results = _load_json_opt(crossref_path)
    pubmed_results = _load_json_opt(pubmed_path)
    verified_results = _load_json_opt(verified_path)

    # Build lookup maps
    cr_map = _build_map(crossref_results)
    pm_map = _build_map(pubmed_results)

    # Reuse classification and suspicious detection from unmatched_report
    from peer_review_assistant.citations.unmatched_report import (
        classify_reference, find_suspicious_matches,
    )

    suspicious = find_suspicious_matches(
        pubmed_results or {"items": []},
        crossref_results or {"items": []},
    )
    suspicious_ids = set(s["reference_id"] for s in suspicious)

    # Get verified IDs (excluding suspicious)
    verified_ids = set()
    if verified_results:
        for it in verified_results.get("items", []):
            rid = it["reference_id"]
            if rid not in suspicious_ids:
                verified_ids.add(rid)

    # Build cards
    cards = {}
    tab_verified = []
    tab_unmatched = []
    tab_suspicious = []
    tab_repaired = []
    tab_crossref = []
    tab_pubmed = []

    cr_matched_count = 0
    pm_matched_count = 0

    for ref in refs["items"]:
        rid = ref["reference_id"]
        cr_item = cr_map.get(rid)
        pm_item = pm_map.get(rid)

        card = _build_card(ref, cr_item, pm_item, suspicious_ids, verified_ids)

        # Crossref matched count
        if cr_item and cr_item.get("status") == "matched":
            cr_matched_count += 1
            tab_crossref.append(rid)
        # PubMed matched count
        if pm_item and pm_item.get("status") == "matched":
            pm_matched_count += 1
            tab_pubmed.append(rid)

        cards[rid] = card

        # Tab categorization
        if rid in suspicious_ids:
            tab_suspicious.append(rid)
        elif card["status"] == "verified":
            tab_verified.append(rid)
        else:
            tab_unmatched.append(rid)

    # Count unmatched by suspected reason (for summary)
    unmatched_breakdown = {}
    for rid in tab_unmatched:
        reason = cards[rid].get("suspected_reason") or "unknown"
        unmatched_breakdown[reason] = unmatched_breakdown.get(reason, 0) + 1

    summary = {
        "total": len(refs["items"]),
        "verified": len(tab_verified),
        "unmatched": len(tab_unmatched),
        "suspicious": len(tab_suspicious),
        "repaired": len(tab_repaired),
        "crossref_matched": cr_matched_count,
        "pubmed_matched": pm_matched_count,
        "unmatched_breakdown": unmatched_breakdown,
        "generated_at": datetime.now(JST).isoformat(),
    }

    return {
        "summary": summary,
        "tabs": {
            "verified": tab_verified,
            "unmatched": tab_unmatched,
            "suspicious": tab_suspicious,
            "repaired": tab_repaired,
            "crossref": tab_crossref,
            "pubmed": tab_pubmed,
        },
        "cards": cards,
    }


# ── card builder ─────────────────────────────────────────────────────────

def _build_card(ref, cr_item, pm_item, suspicious_ids, verified_ids):
    """Build a single ViewerCard dict for a reference."""
    rid = ref["reference_id"]
    parsed = ref.get("parsed", {})

    # Determine status
    if rid in suspicious_ids:
        status = "suspicious"
    elif rid in verified_ids:
        status = "verified"
    else:
        # Check if there's an error
        if cr_item and cr_item.get("status") == "error":
            status = "error"
        elif pm_item and pm_item.get("status") == "error":
            status = "error"
        else:
            status = "unmatched"

    # Best source DB
    best_source_db = _best_source(cr_item, pm_item)

    # Confidence
    confidence = _compute_confidence(cr_item, pm_item, status)

    # Method
    method = _best_method(cr_item, pm_item)

    # Original parsed fields
    authors = parsed.get("authors") or []
    year = parsed.get("year")
    title = parsed.get("title")
    journal = parsed.get("journal")
    volume = parsed.get("volume")
    issue = parsed.get("issue")
    pages = parsed.get("pages")
    doi = parsed.get("doi")
    original_text = ref.get("raw_text", "")
    parse_confidence = ref.get("parse_confidence", "low")

    # Correct reference candidate (from best matching DB result)
    correct_candidate = _build_correct_candidate(cr_item, pm_item)

    # Warnings
    warnings = _build_warnings(ref, cr_item, pm_item, suspicious_ids)

    # Metadata mismatches
    metadata_mismatches = _build_mismatches(cr_item, pm_item)

    # Classification for unmatched / error
    suspected_reason = None
    if status in ("unmatched", "error"):
        from peer_review_assistant.citations.unmatched_report import (
            classify_reference,
        )
        classification = classify_reference(ref, cr_item, pm_item)
        suspected_reason = classification["suspected_reason"] or "possible_reference_error"

    # Match quality fields
    title_match = _pick_comparison_field(cr_item, pm_item, "title_match")
    authors_match = _pick_comparison_field(cr_item, pm_item, "authors_match")
    year_match = _pick_comparison_field(cr_item, pm_item, "year_match")
    journal_match = _pick_comparison_field(cr_item, pm_item, "journal_match")

    # DB-specific status
    crossref_status = cr_item.get("status") if cr_item else None
    crossref_method = cr_item.get("method") if cr_item else None
    pubmed_status = pm_item.get("status") if pm_item else None
    pubmed_method = pm_item.get("method") if pm_item else None

    return {
        "reference_id": rid,
        "status": status,
        "best_source_db": best_source_db,
        "confidence": confidence,
        "method": method,
        "authors": authors,
        "year": year,
        "title": title,
        "journal": journal,
        "volume": volume,
        "issue": issue,
        "pages": pages,
        "doi": doi,
        "original_text": original_text,
        "parse_confidence": parse_confidence,
        "correct_candidate": correct_candidate,
        "warnings": warnings,
        "metadata_mismatches": metadata_mismatches,
        "suspected_reason": suspected_reason,
        "title_match": title_match,
        "authors_match": authors_match,
        "year_match": year_match,
        "journal_match": journal_match,
        "crossref_status": crossref_status,
        "crossref_method": crossref_method,
        "pubmed_status": pubmed_status,
        "pubmed_method": pubmed_method,
    }


# ── helpers ──────────────────────────────────────────────────────────────

def _load_json_opt(path):
    """Load JSON file if it exists, otherwise return None."""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def _build_map(results):
    """Build a reference_id → item lookup map from results."""
    if not results:
        return {}
    return {it["reference_id"]: it for it in results.get("items", [])}


def _best_source(cr_item, pm_item):
    """Determine the best source database for this reference."""
    cr_matched = cr_item and cr_item.get("status") == "matched"
    pm_matched = pm_item and pm_item.get("status") == "matched"

    if cr_matched and pm_matched:
        return "Crossref + PubMed"
    if cr_matched:
        return "Crossref"
    if pm_matched:
        return "PubMed"
    return None


def _compute_confidence(cr_item, pm_item, status):
    """Compute confidence level for the match."""
    if status != "verified":
        return None

    # Gather match qualities
    title_quality = _pick_comparison_field(cr_item, pm_item, "title_match")
    authors_quality = _pick_comparison_field(cr_item, pm_item, "authors_match")
    year_ok = _pick_comparison_field(cr_item, pm_item, "year_match")

    # Both databases confirm → high
    cr_matched = cr_item and cr_item.get("status") == "matched"
    pm_matched = pm_item and pm_item.get("status") == "matched"
    if cr_matched and pm_matched:
        return "high"

    # Exact title + exact authors + year match → high
    if (title_quality == "exact" and authors_quality == "exact"
            and year_ok is True):
        return "high"

    # Exact or fuzzy title → medium
    if title_quality in ("exact", "fuzzy"):
        return "medium"

    return "low"


def _best_method(cr_item, pm_item):
    """Get the best matching method used."""
    cr_method = cr_item.get("method") if cr_item else None
    pm_method = pm_item.get("method") if pm_item else None

    # Prefer DOI-based over title-based
    if cr_method == "doi" or pm_method == "doi":
        return "doi"
    if cr_method == "pmid" or pm_method == "pmid":
        return "pmid"
    return cr_method or pm_method or None


def _pick_comparison_field(cr_item, pm_item, field):
    """Pick the best (most informative) comparison field value.

    Prefers non-null/non-unknown values. Prefers Crossref over PubMed
    when both are available (since Crossref is the primary source).
    """
    cr_val = None
    pm_val = None

    if cr_item:
        comp = cr_item.get("comparison", {})
        cr_val = comp.get(field)
    if pm_item:
        comp = pm_item.get("comparison", {})
        pm_val = comp.get(field)

    # Pick non-null, non-unknown value
    def _quality(v):
        if v is None or v == "unknown":
            return 0
        if v == "exact" or v is True:
            return 3
        if v == "fuzzy" or v == "partial":
            return 2
        if v == "mismatch" or v is False:
            return 1
        return 0

    if _quality(cr_val) >= _quality(pm_val):
        return cr_val
    return pm_val


def _build_correct_candidate(cr_item, pm_item):
    """Build the correct reference candidate from the best DB match."""
    # Prefer Crossref result (richer metadata), fallback to PubMed
    result = None
    source_item = None

    if cr_item and cr_item.get("status") == "matched":
        source_item = cr_item
        result = cr_item.get("crossref_result") or {}
    elif pm_item and pm_item.get("status") == "matched":
        source_item = pm_item
        result = pm_item.get("pubmed_result") or {}

    if not result:
        return None

    return {
        "title": result.get("title"),
        "authors": result.get("authors") or [],
        "year": result.get("year"),
        "journal": result.get("journal"),
        "volume": result.get("volume"),
        "issue": result.get("issue"),
        "pages": result.get("pages"),
        "doi": result.get("doi"),
        "type": result.get("type"),
        "source_db": source_item.get("db_source") if source_item else None,
    }


def _build_warnings(ref, cr_item, pm_item, suspicious_ids):
    """Build a list of human-readable warnings for the card."""
    warnings = []
    rid = ref["reference_id"]
    parsed = ref.get("parsed", {})
    doi = parsed.get("doi")

    if cr_item:
        comp = cr_item.get("comparison", {})
        cr_method = cr_item.get("method", "")

        # DOI truncation: matched by DOI but title mismatch
        if cr_method == "doi" and comp.get("title_match") == "mismatch":
            cr_result = cr_item.get("crossref_result") or {}
            cr_doi = cr_result.get("doi", "")
            if doi and cr_doi and doi != cr_doi:
                warnings.append(
                    "DOIが途中で切れている可能性がある "
                    f"(原稿: {doi}, DB: {cr_doi})"
                )

        # Title-only match
        if cr_method == "title" or cr_method == "title_search":
            warnings.append("タイトルのみの一致（DOI未照合）")

        # Weak match indicators
        if comp.get("authors_match") == "mismatch":
            warnings.append("著者が一致しない")
        if comp.get("year_match") is False:
            warnings.append("出版年が一致しない")
        if comp.get("journal_match") == "mismatch":
            warnings.append("雑誌名が一致しない")

    if pm_item:
        comp = pm_item.get("comparison", {})
        pm_method = pm_item.get("method", "")

        # PubMed title-only match
        if pm_method == "title" and comp.get("title_match") != "exact":
            if "タイトルのみの一致（DOI未照合）" not in warnings:
                warnings.append("タイトルのみの一致（DOI未照合）")

    # Parse confidence warning
    if ref.get("parse_confidence") == "low":
        warnings.append("文献情報の解析精度が低い")

    # Deduplicate
    seen = set()
    unique = []
    for w in warnings:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return unique


def _build_mismatches(cr_item, pm_item):
    """Build a list of metadata mismatch descriptions."""
    mismatches = []

    def _collect(item, db):
        if not item:
            return
        comp = item.get("comparison", {})
        for err in comp.get("metadata_errors", []):
            if err not in mismatches:
                mismatches.append(err)

    _collect(cr_item, "Crossref")
    _collect(pm_item, "PubMed")

    return mismatches
