"""Unmatched references review report generator.

Reads Crossref and PubMed verification results and generates:
  - db_unmatched_references_review.md / .csv
  - db_suspicious_matches_review.md
  - db_verification_summary.md

Also updates db_verified_references.json to remove suspicious matches.
"""

import csv
import html as _html
import io
import json
import os
import re

_TAG_PATTERN = re.compile(r"<[^>]+>")
_CHAR_CLEANUP = str.maketrans({"€": "-"})


def _clean_text(text):
    """Decode HTML entities and strip tags for comparison.
    Handles double-encoded entities (e.g. &amp;ndash; → –) and encoding
    corruptions (e.g. € → -)."""
    if not text:
        return ""
    text = text.translate(_CHAR_CLEANUP)
    decoded = text
    for _ in range(3):
        prev = decoded
        decoded = _html.unescape(decoded)
        if decoded == prev:
            break
    return " ".join(_TAG_PATTERN.sub("", decoded).split())


def _word_overlap(text1, text2):
    """Measure word containment between two texts.

    Returns the fraction of words from the *shorter* text that also appear
    in the longer text.  High overlap (>0.7) with corroborating evidence
    (DOI + year + authors) indicates the same work despite title mismatch.

    Uses containment (not Jaccard) because original titles are often
    concatenated with journal/vol/pages/DOI by the regex parser, so the
    word-set sizes can be very different — Jaccard would unfairly penalise
    what is really just extra trailing metadata."""
    if not text1 and not text2:
        return 1.0
    if not text1 or not text2:
        return 0.0
    t1 = _clean_text(text1).lower()
    t2 = _clean_text(text2).lower()
    words1 = set(w.strip(".,;:()[]\"'!?") for w in t1.split())
    words2 = set(w.strip(".,;:()[]\"'!?") for w in t2.split())
    if not words1 or not words2:
        return 0.0
    shorter = words1 if len(words1) <= len(words2) else words2
    longer = words2 if len(words1) <= len(words2) else words1
    overlap = sum(1 for w in shorter if w in longer)
    return overlap / len(shorter)


# ── Classification rules ───────────────────────────────────────────────

# Patterns for identifying reference types
_BOOK_KEYWORDS = [
    "press", "publisher", "publishing", "ed.", "eds.", "edited by",
    "university", "institute", "college", "isbn",
    "book", "handbook", "monograph", "vol.", "pp.",
    "encyclopedia", "compendium",
]
_REPORT_KEYWORDS = [
    "report", "government", "ministry", "survey", "statistics",
    "white paper", "working paper", "technical report", "bulletin",
    "census", "annual report", "national",
    "oecd", "who ", "unicef", "unesco", "world bank",
    "committee", "commission", "department of",
    "prevention", "conference", "proceedings",
]
_CHAPTER_KEYWORDS = [
    "chapter", "in: ", "in press",
]


def classify_reference(ref, crossref_item=None, pubmed_item=None):
    """Classify why a reference went unmatched.

    Args:
        ref: reference item from references_split.json
        crossref_item: Crossref result item or None
        pubmed_item: PubMed result item or None

    Returns:
        dict with suspected_reason and recommended_action.
    """
    parsed = ref.get("parsed", {})
    raw = ref.get("raw_text", "")
    title = parsed.get("title") or ""
    doi = parsed.get("doi")
    authors = parsed.get("authors", [])
    year = parsed.get("year")

    text_lower = (raw + " " + title).lower()
    reasons = []

    # 1. Book or chapter — check FIRST (before no_doi)
    if _matches_any(text_lower, _BOOK_KEYWORDS):
        reasons.append("book_or_chapter")

    # 2. Report or government document
    if _matches_any(text_lower, _REPORT_KEYWORDS):
        reasons.append("report_or_government_document")

    # 3. Parse failures
    if not title or len(title.strip()) < 10:
        reasons.append("title_parse_failure")
    if not authors or all(len(a.strip()) < 2 for a in authors):
        reasons.append("author_parse_failure")
    if year is None or year == 0:
        reasons.append("year_parse_failure")

    # 4. No DOI at all (after more specific classifications)
    if not doi:
        if "book_or_chapter" not in reasons and "report_or_government_document" not in reasons:
            reasons.append("no_doi")

    # 5. Has DOI but unmatched → DB coverage gap
    if doi and "book_or_chapter" not in reasons:
        reasons.append("db_coverage_likely_missing")

    # 6. Has DOI but Crossref returned 404/error → possible reference error
    if crossref_item:
        cr_errs = crossref_item.get("comparison", {}).get("metadata_errors", [])
        if any("not found" in e.lower() or "400" in e for e in cr_errs) and doi:
            reasons.append("possible_reference_error")

    # 7. Journal article pattern without DOI (not book/report)
    if (re.search(r"\b\d+\s*\(\d+\)\s*[,:]\s*\d+", raw) and not doi
            and "book_or_chapter" not in reasons
            and "report_or_government_document" not in reasons):
        reasons.append("journal_article_without_doi")

    # Default if nothing matched
    if not reasons:
        if doi:
            reasons.append("db_coverage_likely_missing")
        else:
            reasons.append("possible_reference_error")

    # Deduplicate and pick primary
    primary = reasons[0] if reasons else "possible_reference_error"
    recommended = _recommended_action(primary, doi, crossref_item, pubmed_item)

    return {
        "suspected_reason": primary,
        "all_reasons": reasons,
        "recommended_action": recommended,
    }


def _matches_any(text_lower, keywords):
    """Check if any keyword appears in text."""
    return any(kw in text_lower for kw in keywords)


def _recommended_action(reason, doi, crossref_item, pubmed_item):
    """Recommend next action based on suspected reason."""
    actions = {
        "no_doi": (
            "Try OpenAlex or Semantic Scholar (broader coverage, books/chapters). "
            "If still unmatched, the reference may need manual look-up."
        ),
        "book_or_chapter": (
            "Books and chapters are rarely indexed in PubMed. "
            "Try OpenAlex (has book coverage) or manual Google Scholar search."
        ),
        "report_or_government_document": (
            "Government reports and statistical bulletins are often in gray literature. "
            "Check the URL if present, or search the agency website directly."
        ),
        "journal_article_without_doi": (
            "Journal article detected but no DOI in reference. "
            "Try title + author + year on Google Scholar or OpenAlex."
        ),
        "title_parse_failure": (
            "Reference parsing failed to extract a usable title. "
            "Review raw reference text and consider manual correction."
        ),
        "author_parse_failure": (
            "Author extraction may be incomplete. "
            "Review raw reference text for unusual formatting."
        ),
        "year_parse_failure": (
            "Year extraction failed. Check raw reference for date information."
        ),
        "possible_reference_error": (
            "Reference may contain errors (wrong DOI, misspelled title/author). "
            "Cross-check with the original source if possible."
        ),
        "db_coverage_likely_missing": (
            "Has DOI but not found in Crossref or PubMed. "
            "The work may not be indexed in these databases. Try OpenAlex."
        ),
    }
    return actions.get(reason, "Manual verification recommended.")


# ── Suspicious match detection ─────────────────────────────────────────

def find_suspicious_matches(pubmed_results, crossref_results):
    """Find matches that look suspicious (likely false positives).

    A match is suspicious when:
      - matched by title only (not DOI or PMID)
      - authors_match = mismatch
      - year_match = false (not just unknown)
      - or title is matched but authors/journal/year all mismatch

    Also checks Crossref results for similar patterns.

    Returns:
        list of dicts with reference_id, reason, match details.
    """
    suspicious = []

    def _check(result_items, db_source):
        for item in result_items:
            if item.get("status") != "matched":
                continue
            comp = item.get("comparison", {})
            method = item.get("method", "")
            ref_id = item["reference_id"]

            # Detect formatting-only mismatches (HTML tags, case, dashes)
            orig_item = item.get("original", {})
            orig_parsed = orig_item.get("parsed", {})
            matched = (
                item.get("pubmed_result") or
                item.get("crossref_result") or {}
            )

            title_formatting_only = False
            if comp.get("title_match") == "mismatch":
                orig_t = _clean_text(orig_parsed.get("title") or "")
                db_t = _clean_text(matched.get("title") or "")
                if orig_t.lower() == db_t.lower():
                    title_formatting_only = True
                # Also check substring: original may have journal/vol/pages/DOI
                # appended (regex parse concatenation).  If the DB title is
                # embedded in the original or vice versa, it's formatting-only.
                elif db_t and orig_t:
                    ot = orig_t.lower()
                    dt = db_t.lower()
                    if dt in ot or ot in dt:
                        title_formatting_only = True
                    # Fuzzy word-level check: when DOI matches and year + authors
                    # corroborate, use word overlap for lenient title match.
                    # Handles Crossref data corruption (e.g. € consuming both
                    # the hyphen AND the following character).
                    elif (method == "doi"
                          and comp.get("year_match") is True
                          and comp.get("authors_match") in ("exact", "partial")):
                        if _word_overlap(orig_t, db_t) >= 0.70:
                            title_formatting_only = True

            journal_formatting_only = False
            if comp.get("journal_match") == "mismatch":
                orig_j = _clean_text(orig_parsed.get("journal") or "")
                db_j = _clean_text(matched.get("journal") or "")
                if orig_j.lower() == db_j.lower():
                    journal_formatting_only = True

            reasons = []

            # Title-only match with weak corroboration
            if method == "title" and comp.get("authors_match") == "mismatch":
                reasons.append("title_only_with_author_mismatch")
            if method == "title" and comp.get("year_match") is False:
                reasons.append("title_only_with_year_mismatch")

            # DOI matched but title mismatch — skip if only formatting
            if method == "doi" and comp.get("title_match") == "mismatch":
                if not title_formatting_only:
                    reasons.append("doi_match_but_title_mismatch")

            # Multiple metadata mismatches (exclude formatting-only)
            mismatch_count = sum([
                comp.get("title_match") == "mismatch" and not title_formatting_only,
                comp.get("authors_match") == "mismatch",
                comp.get("year_match") is False,
                comp.get("journal_match") == "mismatch" and not journal_formatting_only,
            ])
            if mismatch_count >= 2:
                reasons.append(f"multiple_mismatches({mismatch_count})")
            if mismatch_count >= 1 and method == "title":
                reasons.append("weak_title_only_match")

            if reasons:
                suspicious.append({
                    "reference_id": ref_id,
                    "db_source": db_source,
                    "method": method,
                    "comparison": comp,
                    "suspicious_reasons": reasons,
                    "original": item.get("original", {}),
                    "matched_record": (
                        item.get("pubmed_result") or
                        item.get("crossref_result") or {}
                    ),
                })

    _check(pubmed_results.get("items", []), "PubMed")
    _check(crossref_results.get("items", []), "Crossref")

    return suspicious


# ── Report generators ──────────────────────────────────────────────────

def generate_reports(project_dir):
    """Generate all unmatched/suspicious/verification reports.

    Args:
        project_dir: Path to the project working folder.

    Returns:
        dict with summary counts.
    """
    citations_dir = os.path.join(project_dir, "citations")

    # Load inputs
    refs_path = os.path.join(citations_dir, "references_split.json")
    crossref_path = os.path.join(citations_dir, "db_crossref_results.json")
    pubmed_path = os.path.join(citations_dir, "db_pubmed_results.json")

    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)
    crossref_results = _load_json_opt(crossref_path)
    pubmed_results = _load_json_opt(pubmed_path)

    # Build lookup maps
    cr_map = {}
    if crossref_results:
        for it in crossref_results.get("items", []):
            cr_map[it["reference_id"]] = it

    pm_map = {}
    if pubmed_results:
        for it in pubmed_results.get("items", []):
            pm_map[it["reference_id"]] = it

    # Find unmatched
    unmatched = []
    for ref in refs["items"]:
        rid = ref["reference_id"]
        cr_item = cr_map.get(rid)
        pm_item = pm_map.get(rid)
        cr_status = cr_item["status"] if cr_item else "unknown"
        pm_status = pm_item["status"] if pm_item else "unknown"

        if cr_status != "matched" and pm_status != "matched":
            classification = classify_reference(ref, cr_item, pm_item)
            unmatched.append({
                "reference_id": rid,
                "raw_reference_text": ref.get("raw_text", ""),
                "parsed_title": ref["parsed"].get("title"),
                "parsed_authors": ref["parsed"].get("authors", []),
                "parsed_year": ref["parsed"].get("year"),
                "parsed_doi": ref["parsed"].get("doi"),
                "crossref_status": cr_status,
                "pubmed_status": pm_status,
                "suspected_reason": classification["suspected_reason"],
                "all_reasons": classification["all_reasons"],
                "recommended_action": classification["recommended_action"],
            })

    # Find suspicious matches
    suspicious = find_suspicious_matches(
        pubmed_results or {"items": []},
        crossref_results or {"items": []},
    )

    # Counts
    cr_matched = (crossref_results or {}).get("matched_count", 0)
    pm_matched = (pubmed_results or {}).get("matched_count", 0)

    # Both confirmed
    cr_matched_ids = set(
        it["reference_id"] for it in (crossref_results or {}).get("items", [])
        if it["status"] == "matched"
    )
    pm_matched_ids = set(
        it["reference_id"] for it in (pubmed_results or {}).get("items", [])
        if it["status"] == "matched"
    )
    # Exclude suspicious from verified
    suspicious_ids = set(s["reference_id"] for s in suspicious)
    verified_both = (cr_matched_ids & pm_matched_ids) - suspicious_ids
    verified_cr_only = (cr_matched_ids - pm_matched_ids) - suspicious_ids
    verified_pm_only = (pm_matched_ids - cr_matched_ids) - suspicious_ids

    # Count by primary suspected reason
    no_doi_count = sum(
        1 for u in unmatched
        if u["suspected_reason"] == "no_doi"
    )
    book_chapter_count = sum(
        1 for u in unmatched
        if u["suspected_reason"] == "book_or_chapter"
    )
    report_count = sum(
        1 for u in unmatched
        if u["suspected_reason"] == "report_or_government_document"
    )
    journal_no_doi_count = sum(
        1 for u in unmatched
        if u["suspected_reason"] == "journal_article_without_doi"
    )
    db_coverage_missing = sum(
        1 for u in unmatched
        if u["suspected_reason"] == "db_coverage_likely_missing"
    )
    parse_fail_count = sum(
        1 for u in unmatched
        if "parse_failure" in u["suspected_reason"]
    )
    # Items without ANY DOI (for reference)
    items_without_doi = sum(1 for u in unmatched if not u["parsed_doi"])

    # Generate all output files
    _write_unmatched_review_md(citations_dir, unmatched)
    _write_unmatched_review_csv(citations_dir, unmatched)
    _write_suspicious_matches_md(citations_dir, suspicious)
    _write_verification_summary_md(
        citations_dir, refs, cr_matched, pm_matched,
        verified_both, verified_cr_only, verified_pm_only,
        suspicious, unmatched,
        no_doi_count, book_chapter_count, report_count,
        journal_no_doi_count, db_coverage_missing,
        parse_fail_count, items_without_doi,
    )

    # Update db_verified_references.json — remove suspicious
    _clean_verified_references(citations_dir, suspicious_ids)

    summary = {
        "total": refs["total_references"],
        "verified_crossref_only": len(verified_cr_only),
        "verified_pubmed_only": len(verified_pm_only),
        "verified_both": len(verified_both),
        "total_verified": len(verified_both) + len(verified_cr_only) + len(verified_pm_only),
        "suspicious_matches": len(suspicious),
        "unmatched": len(unmatched),
        "no_doi_count": no_doi_count,
        "book_chapter_count": book_chapter_count,
        "report_count": report_count,
        "parse_failure_count": parse_fail_count,
    }

    return summary


# ── File writers ───────────────────────────────────────────────────────

def _write_unmatched_review_md(citations_dir, unmatched):
    """Write db_unmatched_references_review.md."""
    lines = [
        "# Unmatched References Review",
        "",
        f"**Total unmatched**: {len(unmatched)}",
        "",
        "These references could not be verified against Crossref or PubMed.",
        "",
        "## Summary by Suspected Reason",
        "",
    ]

    # Count by reason
    reasons = {}
    for u in unmatched:
        r = u["suspected_reason"]
        reasons[r] = reasons.get(r, 0) + 1

    for reason, count in sorted(reasons.items(), key=lambda x: -x[1]):
        label = reason.replace("_", " ").title()
        lines.append(f"- **{label}**: {count}")

    lines += [
        "",
        "## Detailed List",
        "",
    ]

    for u in unmatched:
        authors_str = "; ".join(u["parsed_authors"][:3]) if u["parsed_authors"] else "?"
        if len(u["parsed_authors"]) > 3:
            authors_str += " et al."
        year_str = str(u["parsed_year"]) if u["parsed_year"] else "?"
        title_str = (u["parsed_title"] or "?")[:120]
        reason_label = u["suspected_reason"].replace("_", " ").title()

        lines += [
            f"### {u['reference_id']} — {reason_label}",
            "",
            f"**Raw**: {u['raw_reference_text'][:200]}",
            "",
            f"**Parsed**: {authors_str} ({year_str}). {title_str}",
            "",
            f"**DOI**: {u['parsed_doi'] or 'None'}",
            f"**Crossref**: {u['crossref_status']} | **PubMed**: {u['pubmed_status']}",
            f"**Suspected Reason**: {reason_label}",
            f"**All Reasons**: {', '.join(u['all_reasons'])}",
            f"**Recommended Action**: {u['recommended_action']}",
            "",
            "---",
            "",
        ]

    path = os.path.join(citations_dir, "db_unmatched_references_review.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _write_unmatched_review_csv(citations_dir, unmatched):
    """Write db_unmatched_references_review.csv."""
    path = os.path.join(citations_dir, "db_unmatched_references_review.csv")
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "reference_id", "raw_reference_text", "parsed_title",
            "parsed_authors", "parsed_year", "parsed_doi",
            "crossref_status", "pubmed_status",
            "suspected_reason", "recommended_action",
        ])
        for u in unmatched:
            writer.writerow([
                u["reference_id"],
                u["raw_reference_text"],
                u["parsed_title"] or "",
                "; ".join(u["parsed_authors"]),
                u["parsed_year"] or "",
                u["parsed_doi"] or "",
                u["crossref_status"],
                u["pubmed_status"],
                u["suspected_reason"],
                u["recommended_action"],
            ])


def _write_suspicious_matches_md(citations_dir, suspicious):
    """Write db_suspicious_matches_review.md."""
    lines = [
        "# Suspicious Matches Review",
        "",
        f"**Total suspicious matches**: {len(suspicious)}",
        "",
        "These references were matched by Crossref or PubMed but the match "
        "quality is questionable (e.g., title-only match with author/year "
        "mismatch). They have been **excluded from verified references** and "
        "should be reviewed manually.",
        "",
        "---",
        "",
    ]

    if not suspicious:
        lines.append("No suspicious matches found.")
    else:
        for s in suspicious:
            orig = s.get("original", {})
            parsed = orig.get("parsed", {})
            matched = s.get("matched_record", {})

            lines += [
                f"## {s['reference_id']} — {s['db_source']} ({s['method']})",
                "",
                f"**Suspicious reasons**: {', '.join(s['suspicious_reasons'])}",
                "",
                f"**Original title**: {parsed.get('title', '?')[:200]}",
                f"**Original authors**: {', '.join(parsed.get('authors', [])[:5])}",
                f"**Original year**: {parsed.get('year', '?')}",
                f"**Original DOI**: {parsed.get('doi', 'None')}",
                "",
                f"**Matched title**: {matched.get('title', '?')[:200]}",
                f"**Matched authors**: {', '.join(matched.get('authors', [])[:5])}",
                f"**Matched year**: {matched.get('year', '?')}",
                f"**Matched DOI**: {matched.get('doi', 'None')}",
                f"**Matched PMID**: {matched.get('pmid', 'None')}",
                f"**Matched journal**: {matched.get('journal', 'None')}",
                "",
                "**Comparison**:",
                f"- title_match: {s['comparison'].get('title_match', 'unknown')}",
                f"- authors_match: {s['comparison'].get('authors_match', 'unknown')}",
                f"- year_match: {s['comparison'].get('year_match', 'unknown')}",
                f"- journal_match: {s['comparison'].get('journal_match', 'unknown')}",
                "",
                "---",
                "",
            ]

    path = os.path.join(citations_dir, "db_suspicious_matches_review.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _write_verification_summary_md(citations_dir, refs,
                                    cr_matched, pm_matched,
                                    verified_both, verified_cr_only,
                                    verified_pm_only,
                                    suspicious, unmatched,
                                    no_doi_count, book_chapter_count,
                                    report_count, journal_no_doi_count,
                                    db_coverage_missing,
                                    parse_fail_count, items_without_doi):
    """Write db_verification_summary.md."""
    total = refs["total_references"]
    total_verified = (len(verified_both) + len(verified_cr_only) +
                      len(verified_pm_only))
    total_unmatched = len(unmatched)
    total_suspicious = len(suspicious)

    lines = [
        "# Citation Verification Summary",
        "",
        f"**Generated**: Auto-generated from Crossref and PubMed results",
        "",
        "## Overview",
        "",
        f"| Category | Count | % |",
        f"|----------|-------|---|",
        f"| Total references | {total} | 100% |",
        f"| Verified (both DBs) | {len(verified_both)} | {_pct(len(verified_both), total)} |",
        f"| Verified (Crossref only) | {len(verified_cr_only)} | {_pct(len(verified_cr_only), total)} |",
        f"| Verified (PubMed only) | {len(verified_pm_only)} | {_pct(len(verified_pm_only), total)} |",
        f"| **Total verified** | **{total_verified}** | **{_pct(total_verified, total)}** |",
        f"| Suspicious matches | {total_suspicious} | {_pct(total_suspicious, total)} |",
        f"| Unmatched | {total_unmatched} | {_pct(total_unmatched, total)} |",
        "",
        "## Unmatched References Breakdown",
        "",
        f"| Suspected Reason | Count |",
        f"|------------------|-------|",
        f"| No DOI (journal, other) | {no_doi_count} |",
        f"| Likely book/chapter | {book_chapter_count} |",
        f"| Likely report/gov doc | {report_count} |",
        f"| Journal article without DOI | {journal_no_doi_count} |",
        f"| DB coverage likely missing | {db_coverage_missing} |",
        f"| Parse failure | {parse_fail_count} |",
        f"| **Total unmatched** | **{total_unmatched}** |",
        f"| _Items without DOI (any category)_ | _{items_without_doi}_ |",
        "",
        "## Database Coverage",
        "",
        f"| Database | Matched |",
        f"|----------|---------|",
        f"| Crossref | {cr_matched} |",
        f"| PubMed | {pm_matched} |",
        f"| Both | {len(verified_both)} |",
        "",
        "## Recommendations",
        "",
        "1. **Books/chapters/reports** — try OpenAlex or Semantic Scholar",
        "2. **References with DOI but unmatched** — may need Google Scholar manual look-up",
        "3. **References with no DOI** — prioritize title search on broader databases",
        "4. **Suspicious matches** — review manually before accepting",
        "5. **Parse failures** — review raw reference formatting",
        "",
        "## Output Files",
        "",
        "- `db_unmatched_references_review.md` — detailed unmatched list",
        "- `db_unmatched_references_review.csv` — spreadsheet-friendly",
        "- `db_suspicious_matches_review.md` — false positive review",
        "- `db_verification_summary.md` — this file",
        "",
    ]

    path = os.path.join(citations_dir, "db_verification_summary.md")
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


def _pct(part, whole):
    """Format percentage."""
    if whole == 0:
        return "0%"
    return f"{round(part / whole * 100)}%"


def _clean_verified_references(citations_dir, suspicious_ids):
    """Remove suspicious matches from db_verified_references.json."""
    verified_path = os.path.join(citations_dir, "db_verified_references.json")
    if not os.path.isfile(verified_path):
        return

    with open(verified_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    original_count = len(data.get("items", []))
    cleaned = [
        it for it in data.get("items", [])
        if it["reference_id"] not in suspicious_ids
    ]
    removed = original_count - len(cleaned)

    data["items"] = cleaned
    if removed > 0:
        data["suspicious_removed"] = list(suspicious_ids) if suspicious_ids else []
        data["suspicious_removed_count"] = removed

    with open(verified_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── Helpers ────────────────────────────────────────────────────────────

def _load_json_opt(path):
    """Load JSON file if it exists, otherwise return None."""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None
