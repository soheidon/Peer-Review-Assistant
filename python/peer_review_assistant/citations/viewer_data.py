"""Unified citation viewer data generator.

Reads all citation verification data and produces a single JSON file
for the References Review Viewer GUI component.
"""

import html as _html
import json
import os
import re as _re
import sys as _sys
import traceback as _traceback
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

_TAG_PATTERN = _re.compile(r"<[^>]+>")
_DASH_PATTERN = _re.compile(r"[–—―]")  # en-dash, em-dash, horizontal bar

# Known character corruptions in Crossref API responses:
# € (U+20AC) often appears where a hyphen/dash should be
_CHAR_CLEANUP = str.maketrans({
    "€": "-",  # € → - (euro sign corrupted from hyphen)
})


# ── safe accessors ──────────────────────────────────────────────────────

def _as_dict(value):
    """Return value if it's a dict, otherwise return an empty dict.

    Prevents 'NoneType' object has no attribute 'get' crashes when
    JSON files contain null items or unexpected structures.
    """
    return value if isinstance(value, dict) else {}


def _as_list(value):
    """Return value if it's a list, otherwise return an empty list."""
    return value if isinstance(value, list) else []


def _as_str(value):
    """Return value if it's a string, otherwise return an empty string."""
    return value if isinstance(value, str) else ""


def _emit_warning(task, file_name, reference_id, message):
    """Emit a warning event to stdout. Never throws."""
    try:
        obj = {
            "event": "warning",
            "task": task,
            "file": file_name,
            "reference_id": reference_id,
            "message": message,
        }
        _sys.stdout.write(json.dumps(obj, ensure_ascii=False) + "\n")
        _sys.stdout.flush()
    except Exception:
        pass  # must not break the pipeline


def _normalize_html(text):
    """Decode HTML entities and strip HTML tags. Idempotent.

    Handles double-encoded entities (e.g. &amp;ndash; → –)
    and known encoding corruptions (e.g. € → -).
    Returns plain text suitable for display and comparison.
    """
    if not text:
        return ""
    # Fix known encoding corruptions first
    text = text.translate(_CHAR_CLEANUP)
    # Decode repeatedly until stable (handles double-encoding like &amp;ndash;)
    decoded = text
    for _ in range(3):
        prev = decoded
        decoded = _html.unescape(decoded)
        if decoded == prev:
            break
    stripped = _TAG_PATTERN.sub("", decoded)
    return " ".join(stripped.split())


def _classify_mismatch(original, candidate):
    """Classify the nature of a mismatch between original and candidate values.

    Returns:
        "substantive" — truly different content (different reference)
        "formatting"  — same content, different formatting (HTML, case, dashes)
        "none"        — identical after normalization
    """
    if not original and not candidate:
        return "none"
    if not original or not candidate:
        return "substantive"

    # Stage 1: HTML normalization
    orig = _normalize_html(original)
    cand = _normalize_html(candidate)
    if orig == cand:
        return "none"

    # Stage 2: Case-insensitive
    if orig.lower() == cand.lower():
        return "formatting"

    # Stage 3: Normalize dashes (en-dash, em-dash, horizontal bar → hyphen)
    orig_dashed = _DASH_PATTERN.sub("-", orig.lower())
    cand_dashed = _DASH_PATTERN.sub("-", cand.lower())
    if orig_dashed == cand_dashed:
        return "formatting"

    # Stage 4: Strip all punctuation, compare alphanumeric skeleton
    _punct_re = _re.compile(r"[^\w\s]")
    orig_clean = " ".join(_punct_re.sub(" ", orig_dashed).split())
    cand_clean = " ".join(_punct_re.sub(" ", cand_dashed).split())
    if orig_clean == cand_clean:
        return "formatting"

    return "substantive"


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

    # Load CiNii results if available
    cinii_path = os.path.join(citations_dir, "db_cinii_results.json")
    cinii_results = _load_json_opt(cinii_path)

    # Load Semantic Scholar results if available
    s2_path = os.path.join(citations_dir, "db_semantic_scholar_results.json")
    s2_results = _load_json_opt(s2_path)

    # Load LLM repair data if available
    llm_repair_path = os.path.join(citations_dir, "references_repaired_llm.json")
    llm_repair_data = _load_json_opt(llm_repair_path)
    llm_map = {}
    if isinstance(llm_repair_data, dict):
        for it in _as_list(llm_repair_data.get("items")):
            if not isinstance(it, dict):
                _emit_warning("viewer-data", "references_repaired_llm.json",
                              "", "Skipping non-dict item in items list.")
                continue
            rid = it.get("reference_id")
            if rid:
                llm_map[rid] = it

    # Load Google Books candidates if available
    gb_path = os.path.join(citations_dir, "db_google_books_candidates.json")
    gb_data = _load_json_opt(gb_path)
    gb_map = {}
    if isinstance(gb_data, dict):
        for it in _as_list(gb_data.get("items")):
            if not isinstance(it, dict):
                _emit_warning("viewer-data", "db_google_books_candidates.json",
                              "", "Skipping non-dict item in items list.")
                continue
            rid = it.get("reference_id")
            if rid:
                gb_map[rid] = it

    # Load human verified references if available
    hv_path = os.path.join(citations_dir, "human_verified_references.json")
    hv_data = _load_json_opt(hv_path)
    hv_map = {}
    if isinstance(hv_data, dict):
        for it in _as_list(hv_data.get("items")):
            if not isinstance(it, dict):
                _emit_warning("viewer-data", "human_verified_references.json",
                              "", "Skipping non-dict item in items list.")
                continue
            rid = it.get("reference_id")
            if rid:
                hv_map[rid] = it

    # Load LLM search suggestions if available
    ss_path = os.path.join(citations_dir, "llm_search_suggestions.json")
    ss_data = _load_json_opt(ss_path)
    ss_map = {}
    if isinstance(ss_data, dict):
        for it in _as_list(ss_data.get("items")):
            if not isinstance(it, dict):
                _emit_warning("viewer-data", "llm_search_suggestions.json",
                              "", "Skipping non-dict item in items list.")
                continue
            rid = it.get("reference_id")
            if rid:
                ss_map[rid] = it

    # Load deferred references (human decision: 後ほど検討)
    deferred_path = os.path.join(citations_dir, "deferred_references.json")
    deferred_data = _load_json_opt(deferred_path)
    deferred_map = {}
    if isinstance(deferred_data, dict):
        for it in _as_list(deferred_data.get("items")):
            if not isinstance(it, dict):
                _emit_warning("viewer-data", "deferred_references.json",
                              "", "Skipping non-dict item in items list.")
                continue
            rid = it.get("reference_id")
            if rid:
                deferred_map[rid] = it

    # Load LLM reference flags (LLM decision: 後段LLM確認)
    flags_path = os.path.join(citations_dir, "reference_llm_flags.json")
    flags_data = _load_json_opt(flags_path)
    llm_flags_map = {}
    if isinstance(flags_data, dict):
        for it in _as_list(flags_data.get("items")):
            if not isinstance(it, dict):
                _emit_warning("viewer-data", "reference_llm_flags.json",
                              "", "Skipping non-dict item in items list.")
                continue
            rid = it.get("reference_id")
            if rid:
                llm_flags_map[rid] = it

    # Load journal disambiguation results if available
    jr_path = os.path.join(citations_dir, "journal_resolve_llm.json")
    jr_data = _load_json_opt(jr_path)
    jr_map = {}
    if isinstance(jr_data, dict):
        for it in _as_list(jr_data.get("references")):
            if not isinstance(it, dict):
                _emit_warning("viewer-data", "journal_resolve_llm.json",
                              "", "Skipping non-dict item in references list.")
                continue
            rid = it.get("reference_id")
            if rid:
                jr_map[rid] = it

    # Load LLM reference search results if available
    sr_path = os.path.join(citations_dir, "references_searched_llm.json")
    sr_data = _load_json_opt(sr_path)
    sr_map = {}
    if isinstance(sr_data, dict):
        for it in _as_list(sr_data.get("items")):
            if not isinstance(it, dict):
                continue
            rid = it.get("reference_id")
            if rid:
                sr_map[rid] = it

    # Build lookup maps
    cr_map = _build_map(crossref_results)
    pm_map = _build_map(pubmed_results)
    cn_map = _build_map(cinii_results)
    s2_map = _build_map(s2_results)

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
    if isinstance(verified_results, dict):
        for it in _as_list(verified_results.get("items")):
            if not isinstance(it, dict):
                continue
            rid = it.get("reference_id")
            if rid and rid not in suspicious_ids:
                verified_ids.add(rid)

    # Build cards
    cards = {}
    tab_verified = []
    tab_unmatched = []
    tab_suspicious = []
    tab_repaired = []
    tab_crossref = []
    tab_pubmed = []
    tab_cinii = []
    tab_s2 = []
    tab_googlebooks = []
    tab_deferred = []
    tab_later_llm = []

    cr_matched_count = 0
    pm_matched_count = 0
    cn_matched_count = 0
    s2_matched_count = 0

    for ref in refs["items"]:
        rid = ref["reference_id"]
        cr_item = cr_map.get(rid)
        pm_item = pm_map.get(rid)
        cn_item = cn_map.get(rid)
        s2_item = s2_map.get(rid) if s2_map else None

        gb_item = gb_map.get(rid) if gb_map else None
        ss_item = ss_map.get(rid) if ss_map else None
        card = _build_card(ref, cr_item, pm_item, suspicious_ids,
                           verified_ids, llm_map, gb_item, hv_map,
                           ss_item=ss_item, deferred_entry=deferred_map.get(rid),
                           llm_flags_entry=llm_flags_map.get(rid),
                           jr_entry=jr_map.get(rid),
                           sr_entry=sr_map.get(rid),
                           cn_item=cn_item, s2_item=s2_item)

        # Crossref matched count
        if cr_item and cr_item.get("status") == "matched":
            cr_matched_count += 1
            tab_crossref.append(rid)
        # PubMed matched count
        if pm_item and pm_item.get("status") == "matched":
            pm_matched_count += 1
            tab_pubmed.append(rid)
        # CiNii matched count
        if cn_item and cn_item.get("status") == "matched":
            cn_matched_count += 1
            tab_cinii.append(rid)
        # Semantic Scholar matched count
        if s2_item and s2_item.get("status") == "matched":
            s2_matched_count += 1
            tab_s2.append(rid)

        cards[rid] = card

        # Tab categorization
        if rid in deferred_map:
            tab_deferred.append(rid)
        if _as_dict(card.get("llm_flags")).get("needs_later_llm_check"):
            tab_later_llm.append(rid)
        if card.get("llm_candidate"):
            tab_repaired.append(rid)
        if card.get("google_books_candidates"):
            tab_googlebooks.append(rid)
        if card["status"] == "verified":
            tab_verified.append(rid)
        elif rid in suspicious_ids:
            tab_suspicious.append(rid)
        elif rid not in deferred_map:
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
        "later_llm_check": len(tab_later_llm),
        "deferred": len(tab_deferred),
        "crossref_matched": cr_matched_count,
        "pubmed_matched": pm_matched_count,
        "cnii_matched": cn_matched_count,
        "s2_matched": s2_matched_count,
        "google_books_candidate_count": len(tab_googlebooks),
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
            "later_llm": tab_later_llm,
            "crossref": tab_crossref,
            "pubmed": tab_pubmed,
            "cnii": tab_cinii,
            "semanticscholar": tab_s2,
            "googlebooks": tab_googlebooks,
            "deferred": tab_deferred,
        },
        "cards": cards,
    }


# ── card builder ─────────────────────────────────────────────────────────

def _build_card(ref, cr_item, pm_item, suspicious_ids, verified_ids, llm_map,
                gb_item=None, hv_map=None, ss_item=None, deferred_entry=None,
                llm_flags_entry=None, jr_entry=None, sr_entry=None,
                cn_item=None, s2_item=None):
    """Build a single ViewerCard dict for a reference."""
    rid = ref["reference_id"]
    llm_item = llm_map.get(rid) if llm_map else None
    parsed = ref.get("parsed", {})
    hv_entry = hv_map.get(rid) if hv_map else None

    # Human verification override (highest priority)
    human_verification_status = None
    human_verification_source = None
    hv_entry_safe = _as_dict(hv_entry)
    if hv_entry_safe:
        hv_status = hv_entry_safe.get("status")
        hv_source = hv_entry_safe.get("source")
        # Composite: "human_verified" or "accepted_as_is"
        human_verification_status = hv_status
        # Source detail for chip display:
        # "human_selected", "llm_reparsed_reference", "manuscript_reference"
        human_verification_source = hv_source

    # LLM search result (for status upgrade)
    sr_entry_safe = _as_dict(sr_entry)
    sr_identified = sr_entry_safe.get("identified") if sr_entry_safe else False
    sr_confidence = sr_entry_safe.get("confidence") if sr_entry_safe else "none"

    # Determine status
    if human_verification_status:
        # Human-verified or accepted-as-is → confirmed (overrides suspicious flag)
        status = "verified"
    elif rid in suspicious_ids:
        status = "suspicious"
    elif rid in verified_ids:
        status = "verified"
    elif sr_identified and sr_confidence == "high":
        # LLM search identified this reference with high confidence
        status = "verified"
    else:
        # Check if there's an error
        if cr_item and cr_item.get("status") == "error":
            status = "error"
        elif pm_item and pm_item.get("status") == "error":
            status = "error"
        elif cn_item and cn_item.get("status") == "error":
            status = "error"
        elif s2_item and s2_item.get("status") == "error":
            status = "error"
        elif (cr_item and cr_item.get("status") == "matched") or \
             (pm_item and pm_item.get("status") == "matched") or \
             (cn_item and cn_item.get("status") == "matched") or \
             (s2_item and s2_item.get("status") == "matched"):
            # Matched by a DB and not suspicious → verified
            status = "verified"
        else:
            status = "unmatched"

    # Best source DB
    best_source_db = _best_source(cr_item, pm_item, cn_item, s2_item)

    # Confidence
    confidence = _compute_confidence(cr_item, pm_item, status, cn_item, s2_item)

    # Method
    method = _best_method(cr_item, pm_item, cn_item, s2_item)

    # Original parsed fields (normalize HTML entities/tags)
    authors = [_normalize_html(a) for a in (parsed.get("authors") or [])]
    year = parsed.get("year")
    title = _normalize_html(parsed.get("title") or "")
    journal = _normalize_html(parsed.get("journal") or "")
    volume = parsed.get("volume")
    issue = parsed.get("issue")
    pages = parsed.get("pages")
    doi = parsed.get("doi")
    original_text = ref.get("raw_text", "")
    parse_confidence = ref.get("parse_confidence", "low")

    # Prefer LLM-parsed fields over regex-parsed for manuscript-side display
    _using_llm_parsed = False
    llm_item_safe = _as_dict(llm_item)
    if llm_item_safe:
        llm_parsed = _as_dict(llm_item_safe.get("parsed"))
        if llm_parsed.get("authors"):
            authors = [_normalize_html(a) for a in llm_parsed["authors"]]
            _using_llm_parsed = True
        if llm_parsed.get("year") is not None:
            year = llm_parsed["year"]
        if llm_parsed.get("title"):
            title = _normalize_html(llm_parsed["title"] or "")
            _using_llm_parsed = True
        if llm_parsed.get("journal"):
            journal = _normalize_html(llm_parsed["journal"] or "")
        if llm_parsed.get("volume"):
            volume = llm_parsed["volume"]
        if llm_parsed.get("issue"):
            issue = llm_parsed["issue"]
        if llm_parsed.get("pages"):
            pages = llm_parsed["pages"]
        if llm_parsed.get("doi"):
            doi = llm_parsed["doi"]
        if llm_item_safe.get("confidence"):
            parse_confidence = llm_item_safe["confidence"]

    # ── Post-process LLM data: extract publisher from book_title/title ────
    if llm_item_safe:
        from peer_review_assistant.citations.google_books import (
            _extract_publisher_from_title,
        )
        llm_parsed = _as_dict(llm_item_safe.get("parsed"))
        # Extract publisher from book_title
        book_title_val = llm_parsed.get("book_title")
        if book_title_val:
            extracted = _extract_publisher_from_title(book_title_val)
            if extracted:
                if not llm_parsed.get("publisher"):
                    llm_parsed["publisher"] = extracted["publisher"]
                llm_parsed["book_title"] = extracted["cleaned_title"]
                if not parsed.get("publisher"):
                    parsed["publisher"] = extracted["publisher"]
        # Extract publisher from title (for books without separate book_title)
        title_val = llm_parsed.get("title")
        if title_val:
            extracted = _extract_publisher_from_title(title_val)
            if extracted and not llm_parsed.get("journal"):
                # Only move to publisher if not a journal article
                if not llm_parsed.get("publisher"):
                    llm_parsed["publisher"] = extracted["publisher"]
                llm_parsed["title"] = extracted["cleaned_title"]
                if not llm_parsed.get("book_title"):
                    llm_parsed["book_title"] = extracted["cleaned_title"]

    # Correct reference candidate (from best matching DB result)
    # Override with human-verified candidate if accepted
    hv_entry_safe2 = _as_dict(hv_entry)
    if hv_entry_safe2.get("status") == "human_verified":
        hv_source_type = hv_entry_safe2.get("source", "")
        if hv_source_type in ("llm_reparsed_reference", "llm_search_result"):
            # LLM-repaired or LLM search result accepted directly
            accepted = _as_dict(hv_entry_safe2.get("accepted_reference"))
        else:
            # DB candidate accepted (human_selected)
            accepted = _as_dict(hv_entry_safe2.get("candidate"))
        if accepted:
            correct_candidate = {
                "title": accepted.get("title"),
                "authors": accepted.get("authors", []),
                "year": accepted.get("year"),
                "journal": accepted.get("journal"),
                "publisher": accepted.get("publisher"),
                "volume": accepted.get("volume"),
                "issue": accepted.get("issue"),
                "pages": accepted.get("pages"),
                "doi": accepted.get("doi"),
                "type": accepted.get("type"),
                "source_db": hv_source_type,
            }
        else:
            correct_candidate = _build_correct_candidate(cr_item, pm_item, cn_item, s2_item)
    else:
        correct_candidate = _build_correct_candidate(cr_item, pm_item, cn_item, s2_item)

    # Override with LLM search result if DB has no candidate but search identified it
    if not correct_candidate and sr_identified and sr_confidence in ("high", "medium"):
        sr_corrected = sr_entry_safe.get("corrected") or {}
        if sr_corrected:
            correct_candidate = {
                "title": sr_corrected.get("title"),
                "authors": sr_corrected.get("authors", []),
                "year": sr_corrected.get("year"),
                "journal": sr_corrected.get("journal"),
                "publisher": sr_corrected.get("publisher"),
                "volume": sr_corrected.get("volume"),
                "issue": sr_corrected.get("issue"),
                "pages": sr_corrected.get("pages"),
                "doi": sr_corrected.get("doi"),
                "type": sr_entry_safe.get("publication_type"),
                "source_db": "llm_search",
            }

    # Per-field mismatch classification (substantive vs formatting vs none)
    mismatch_details = None
    if correct_candidate:
        mismatch_details = {
            "title": _classify_mismatch(title, correct_candidate.get("title")),
            "authors": _classify_mismatch(
                "; ".join(authors) if authors else "",
                "; ".join(correct_candidate.get("authors") or []),
            ),
            "year": _classify_mismatch(
                str(year) if year is not None else "",
                str(correct_candidate.get("year")) if correct_candidate.get("year") is not None else "",
            ),
            "journal": _classify_mismatch(journal, correct_candidate.get("journal")),
        }

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
    title_match = _pick_comparison_field(cr_item, pm_item, "title_match", cn_item, s2_item)
    authors_match = _pick_comparison_field(cr_item, pm_item, "authors_match", cn_item, s2_item)
    year_match = _pick_comparison_field(cr_item, pm_item, "year_match", cn_item, s2_item)
    journal_match = _pick_comparison_field(cr_item, pm_item, "journal_match", cn_item, s2_item)

    # Override journal_match and populate identity/style from LLM disambiguation
    journal_identity_match = None
    journal_style_match = None
    jr_entry_safe = _as_dict(jr_entry)
    if jr_entry_safe:
        identity = jr_entry_safe.get("identity")
        if identity in ("identity", "style", "mismatch"):
            journal_identity_match = identity
        style = jr_entry_safe.get("style")
        if style in ("nlm", "iso", "full", "vancouver"):
            journal_style_match = style
        # Upgrade journal_match if LLM says same journal
        if identity in ("identity", "style") and journal_match == "mismatch":
            journal_match = "fuzzy"

    # DB-specific status
    crossref_status = cr_item.get("status") if cr_item else None
    crossref_method = cr_item.get("method") if cr_item else None
    pubmed_status = pm_item.get("status") if pm_item else None
    pubmed_method = pm_item.get("method") if pm_item else None
    cnii_status = cn_item.get("status") if cn_item else None
    cnii_method = cn_item.get("method") if cn_item else None
    s2_status = s2_item.get("status") if s2_item else None
    s2_method = s2_item.get("method") if s2_item else None

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
        "using_llm_parsed": _using_llm_parsed,
        "correct_candidate": correct_candidate,
        "warnings": warnings,
        "metadata_mismatches": metadata_mismatches,
        "suspected_reason": suspected_reason,
        "mismatch_details": mismatch_details,
        "title_match": title_match,
        "authors_match": authors_match,
        "year_match": year_match,
        "journal_match": journal_match,
        "crossref_status": crossref_status,
        "crossref_method": crossref_method,
        "pubmed_status": pubmed_status,
        "pubmed_method": pubmed_method,
        "cnii_status": cnii_status,
        "cnii_method": cnii_method,
        "s2_status": s2_status,
        "s2_method": s2_method,
        "llm_candidate": _build_llm_candidate(llm_item),
        "human_verification_status": human_verification_status,
        "human_verification_source": human_verification_source,
        "llm_flags": _as_dict(llm_flags_entry).get("llm_flags") if llm_flags_entry else None,
        "later_check_targets": _as_dict(llm_flags_entry).get("later_check_targets") if llm_flags_entry else None,
        "journal_identity_match": journal_identity_match,  # "identity" | "style" | "mismatch"
        "journal_style_match": journal_style_match,        # "nlm" | "iso" | "vancouver" | None
        "google_books_candidates": _as_dict(gb_item).get("all_candidates") if gb_item else None,
        "best_google_books_candidate": _as_dict(gb_item).get("best_candidate") if gb_item else None,
        "google_books_candidate_count": (
            len(_as_list(_as_dict(gb_item).get("all_candidates")))
            if gb_item else 0
        ),
        "search_suggestions": {
            "suggested_sources": _as_list(_as_dict(ss_item).get("suggested_sources")),
            "search_queries": _as_list(_as_dict(ss_item).get("search_queries")),
            "notes": _as_list(_as_dict(ss_item).get("notes")),
            "recommended_action": _as_dict(ss_item).get("recommended_action"),
        } if ss_item else None,
        "deferred_info": {
            "reason": _as_dict(deferred_entry).get("reason"),
            "note": _as_dict(deferred_entry).get("note"),
            "deferred_at": _as_dict(deferred_entry).get("deferred_at"),
        } if deferred_entry else None,
        "llm_search": {
            "identified": sr_entry_safe.get("identified"),
            "confidence": sr_entry_safe.get("confidence"),
            "publication_type": sr_entry_safe.get("publication_type"),
            "corrected": sr_entry_safe.get("corrected"),
            "missing_doi_confirmed": sr_entry_safe.get("missing_doi_confirmed", False),
            "notes": sr_entry_safe.get("notes"),
            "source_urls": sr_entry_safe.get("source_urls"),
        } if (sr_entry_safe := _as_dict(sr_entry)) else None,
    }


# ── helpers ──────────────────────────────────────────────────────────────

def _load_json_opt(path):
    """Load JSON file if it exists, otherwise return None.

    Robust against empty files, invalid JSON, and non-dict/list top-level.
    Returns None on any load failure so the pipeline continues.
    """
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        if not raw.strip():
            _emit_warning("viewer-data", os.path.basename(path), "",
                          "File is empty; treating as missing.")
            return None
        data = json.loads(raw)
        if not isinstance(data, (dict, list)):
            _emit_warning("viewer-data", os.path.basename(path), "",
                          f"Unexpected JSON type {type(data).__name__}; treating as missing.")
            return None
        return data
    except (json.JSONDecodeError, ValueError) as e:
        _emit_warning("viewer-data", os.path.basename(path), "",
                      f"Invalid JSON ({e}); treating as missing.")
        return None
    except OSError as e:
        _emit_warning("viewer-data", os.path.basename(path), "",
                      f"Could not read file ({e}); treating as missing.")
        return None


def _build_llm_candidate(llm_item):
    """Build LLM candidate data dict from a repair_llm item."""
    if not isinstance(llm_item, dict):
        return None
    parsed = _as_dict(llm_item.get("parsed"))
    return {
        "title": _normalize_html(_as_str(parsed.get("title"))),
        "book_title": _normalize_html(_as_str(parsed.get("book_title"))),
        "authors": [_normalize_html(a) for a in _as_list(parsed.get("authors"))],
        "year": parsed.get("year"),
        "journal": _normalize_html(_as_str(parsed.get("journal"))),
        "volume": parsed.get("volume"),
        "issue": parsed.get("issue"),
        "pages": parsed.get("pages"),
        "doi": parsed.get("doi"),
        "url": parsed.get("url"),
        "publisher": _normalize_html(_as_str(parsed.get("publisher"))),
        "editor": [_normalize_html(e) for e in _as_list(parsed.get("editor"))] if parsed.get("editor") else None,
        "isbn": parsed.get("isbn"),
        "type": parsed.get("publication_type"),
        "confidence": llm_item.get("confidence"),
        "warnings": _as_list(llm_item.get("warnings")),
    }


def _build_map(results):
    """Build a reference_id → item lookup map from results."""
    if not isinstance(results, dict):
        return {}
    out = {}
    for it in _as_list(results.get("items")):
        if not isinstance(it, dict):
            continue
        rid = it.get("reference_id")
        if rid:
            out[rid] = it
    return out


def _best_source(cr_item, pm_item, cn_item=None, s2_item=None):
    """Determine the best source database for this reference."""
    cr_matched = cr_item and cr_item.get("status") == "matched"
    pm_matched = pm_item and pm_item.get("status") == "matched"
    cn_matched = cn_item and cn_item.get("status") == "matched"
    s2_matched = s2_item and s2_item.get("status") == "matched"

    parts = []
    if cr_matched:
        parts.append("Crossref")
    if pm_matched:
        parts.append("PubMed")
    if s2_matched:
        parts.append("Semantic Scholar")
    if cn_matched:
        parts.append("CiNii")
    if parts:
        return " + ".join(parts)
    return None


def _compute_confidence(cr_item, pm_item, status, cn_item=None, s2_item=None):
    """Compute confidence level for the match."""
    if status != "verified":
        return None

    # Gather match qualities
    title_quality = _pick_comparison_field(cr_item, pm_item, "title_match", cn_item, s2_item)
    authors_quality = _pick_comparison_field(cr_item, pm_item, "authors_match", cn_item, s2_item)
    year_ok = _pick_comparison_field(cr_item, pm_item, "year_match", cn_item, s2_item)

    # Multiple databases confirm → high
    cr_matched = cr_item and cr_item.get("status") == "matched"
    pm_matched = pm_item and pm_item.get("status") == "matched"
    cn_matched = cn_item and cn_item.get("status") == "matched"
    s2_matched = s2_item and s2_item.get("status") == "matched"
    match_count = sum(1 for v in (cr_matched, pm_matched, s2_matched, cn_matched) if v)
    if match_count >= 2:
        return "high"

    # Exact title + exact authors + year match → high
    if (title_quality == "exact" and authors_quality == "exact"
            and year_ok is True):
        return "high"

    # Exact or fuzzy title → medium
    if title_quality in ("exact", "fuzzy"):
        return "medium"

    return "low"


def _best_method(cr_item, pm_item, cn_item=None, s2_item=None):
    """Get the best matching method used."""
    cr_method = cr_item.get("method") if cr_item else None
    pm_method = pm_item.get("method") if pm_item else None
    cn_method = cn_item.get("method") if cn_item else None
    s2_method = s2_item.get("method") if s2_item else None

    # Prefer DOI-based over title-based
    if cr_method == "doi" or pm_method == "doi" or cn_method == "doi" or s2_method == "doi":
        return "doi"
    if cr_method == "pmid" or pm_method == "pmid":
        return "pmid"
    return cr_method or pm_method or s2_method or cn_method or None


def _pick_comparison_field(cr_item, pm_item, field, cn_item=None, s2_item=None):
    """Pick the best (most informative) comparison field value.

    Prefers non-null/non-unknown values. Prefers Crossref over PubMed
    over Semantic Scholar over CiNii when all are available.
    """
    cr_val = None
    pm_val = None
    cn_val = None
    s2_val = None

    if cr_item:
        comp = cr_item.get("comparison", {})
        cr_val = comp.get(field)
    if pm_item:
        comp = pm_item.get("comparison", {})
        pm_val = comp.get(field)
    if cn_item:
        comp = cn_item.get("comparison", {})
        cn_val = comp.get(field)
    if s2_item:
        comp = s2_item.get("comparison", {})
        s2_val = comp.get(field)

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

    best_val = None
    best_q = -1
    for v in (cr_val, pm_val, s2_val, cn_val):
        q = _quality(v)
        if q > best_q:
            best_q = q
            best_val = v
    return best_val


def _build_correct_candidate(cr_item, pm_item, cn_item=None, s2_item=None):
    """Build the correct reference candidate from the best DB match."""
    # Prefer Crossref (richest), then PubMed, then Semantic Scholar, then CiNii
    result = None
    source_item = None

    if cr_item and cr_item.get("status") == "matched":
        source_item = cr_item
        result = cr_item.get("crossref_result") or {}
    elif pm_item and pm_item.get("status") == "matched":
        source_item = pm_item
        result = pm_item.get("pubmed_result") or {}
    elif s2_item and s2_item.get("status") == "matched":
        source_item = s2_item
        result = s2_item.get("ss_result") or {}
    elif cn_item and cn_item.get("status") == "matched":
        source_item = cn_item
        result = cn_item.get("cinii_result") or {}

    if not result:
        return None

    return {
        "title": _normalize_html(result.get("title") or ""),
        "authors": [_normalize_html(a) for a in (result.get("authors") or [])],
        "year": result.get("year"),
        "journal": _normalize_html(result.get("journal") or ""),
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
        cr_result = cr_item.get("crossref_result") or {}

        # DOI truncation: matched by DOI but title mismatch
        if cr_method == "doi" and comp.get("title_match") == "mismatch":
            cr_doi = cr_result.get("doi", "")
            if doi and cr_doi and doi != cr_doi:
                warnings.append(
                    "DOIが途中で切れている可能性がある "
                    f"(原稿: {doi}, DB: {cr_doi})"
                )

        # Title-only match
        if cr_method == "title" or cr_method == "title_search":
            warnings.append("タイトルのみの一致（DOI未照合）")

        # Weak match indicators — distinguish substantive from formatting-only
        if comp.get("authors_match") == "mismatch":
            cr_authors = _normalize_html("; ".join(cr_result.get("authors") or []))
            ms_authors = _normalize_html("; ".join(parsed.get("authors") or []))
            if cr_authors.lower() == ms_authors.lower():
                warnings.append("著者: 表記ゆれのみ（内容は一致）")
            else:
                warnings.append("著者が一致しない")
        if comp.get("year_match") is False:
            warnings.append("出版年が一致しない")
        if comp.get("journal_match") == "mismatch":
            cr_journal = _normalize_html(cr_result.get("journal") or "")
            ms_journal = _normalize_html(parsed.get("journal") or "")
            if cr_journal.lower() == ms_journal.lower():
                warnings.append("雑誌名: 表記ゆれのみ（内容は一致）")
            else:
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
