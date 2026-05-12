"""Semantic Scholar API verification for reference entries.

Semantic Scholar (https://www.semanticscholar.org/) indexes academic papers
across all disciplines.  This module uses the Semantic Scholar Academic Graph
API to match references that Crossref, PubMed, Google Books, and CiNii cannot
handle.

API documentation: https://api.semanticscholar.org/api-docs/graph

Usage:
    result = verify_semantic_scholar(references_split, api_key="YOUR_KEY")
"""

import html as _html
import json
import re as _re
import time
import urllib.request
import urllib.parse
import urllib.error

_TAG_RE = _re.compile(r"<[^>]+>")
_CHAR_CLEANUP = str.maketrans({"€": "-"})


def _clean_text(text):
    """Decode HTML entities and strip tags for display."""
    if not text:
        return ""
    text = text.translate(_CHAR_CLEANUP)
    decoded = text
    for _ in range(3):
        prev = decoded
        decoded = _html.unescape(decoded)
        if decoded == prev:
            break
    return " ".join(_TAG_RE.sub("", decoded).split())


# ── API endpoints ─────────────────────────────────────────────────────────

SEMANTIC_SCHOLAR_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"

REQUEST_DELAY = 1.0  # seconds between requests (free tier: 1/sec without key)
MAX_RETRIES = 3
FIELDS = "title,authors,year,journal,externalIds,publicationTypes"


# ── Public entry point ─────────────────────────────────────────────────────

def verify_semantic_scholar(references_split, api_key=None):
    """Verify references against Semantic Scholar Academic Graph API.

    Only processes references that are currently unmatched (no DOI, no PMID).
    Searches by title + first author surname + year.

    Args:
        references_split: dict from references_split.json with items list.
        api_key: Semantic Scholar API key (optional, improves rate limits).

    Returns:
        dict with total_verified, matched_count, unmatched_count, items.
    """
    items = references_split.get("items", [])
    # Only process unmatched references (no DOI, no PMID)
    targets = [
        ref for ref in items
        if not ref.get("parsed", {}).get("doi")
        and not ref.get("parsed", {}).get("pmid")
    ]

    results = []
    matched = 0
    unmatched = 0

    for i, ref in enumerate(items):
        ref_id = ref["reference_id"]
        parsed = ref.get("parsed", {})

        # Skip references that already have DOI/PMID
        if ref not in targets:
            results.append({
                "reference_id": ref_id,
                "status": "unmatched",
                "method": "skipped",
                "db_source": "Semantic Scholar",
                "original": ref,
                "ss_result": None,
                "comparison": {
                    "exists": False,
                    "matched_by": None,
                    "title_match": "unknown",
                    "authors_match": "unknown",
                    "year_match": "unknown",
                    "journal_match": "unknown",
                    "metadata_errors": [],
                },
                "error": None,
            })
            unmatched += 1
            continue

        result = _verify_single(ref, parsed, api_key)

        if result["status"] == "matched":
            matched += 1
        else:
            unmatched += 1

        results.append(result)

        if i < len(items) - 1:
            time.sleep(REQUEST_DELAY)

    return {
        "total_verified": len(results),
        "matched_count": matched,
        "unmatched_count": unmatched,
        "items": results,
    }


# ── Single reference verification ──────────────────────────────────────────

def _verify_single(ref, parsed, api_key):
    """Verify a single reference against Semantic Scholar."""
    ref_id = ref["reference_id"]
    title = (parsed.get("title") or "").strip()
    authors = parsed.get("authors") or []
    year = parsed.get("year")
    first_author = _extract_first_surname(authors) if authors else None

    # Strategy 1: title + first author surname + year
    if title and first_author and year:
        query = f"{title} {first_author} {year}"
        result = _search_ss(ref_id, ref, query, api_key, method="title_author_year")
        if result["status"] == "matched":
            return result

    # Strategy 2: title + year
    if title and year:
        query = f"{title} {year}"
        result = _search_ss(ref_id, ref, query, api_key, method="title_year")
        if result["status"] == "matched":
            return result

    # Strategy 3: title only
    if title:
        result = _search_ss(ref_id, ref, title, api_key, method="title")
        if result["status"] == "matched":
            return result

    return _unmatched_result(ref_id, ref, method="title",
                             message="No search terms available (missing title)")


def _search_ss(ref_id, ref, query, api_key, method):
    """Search Semantic Scholar and build a result for the best match."""
    params = {
        "query": query,
        "limit": 5,
        "fields": FIELDS,
    }
    url = f"{SEMANTIC_SCHOLAR_SEARCH_URL}?{urllib.parse.urlencode(params)}"
    status_code, body = _http_get(url, api_key)

    if status_code is None:
        return _error_result(ref_id, ref, method,
                             f"Request failed after {MAX_RETRIES} retries")

    if status_code != 200:
        return _error_result(ref_id, ref, method,
                             f"HTTP {status_code} from Semantic Scholar")

    if not body or not body.strip():
        return _unmatched_result(ref_id, ref, method,
                                 "Empty response from Semantic Scholar")

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return _error_result(ref_id, ref, method,
                             "Could not parse Semantic Scholar response as JSON")

    papers = data.get("data", [])
    if not papers:
        return _unmatched_result(ref_id, ref, method,
                                 "No results found on Semantic Scholar")

    best = papers[0]
    ss_result = _extract_ss_fields(best)

    comparison = _compare(ref, ss_result, method)

    return {
        "reference_id": ref_id,
        "status": "matched",
        "method": method,
        "db_source": "Semantic Scholar",
        "original": ref,
        "ss_result": ss_result,
        "comparison": comparison,
        "error": None,
    }


def _extract_ss_fields(paper):
    """Extract standardized fields from a Semantic Scholar paper object."""
    title = paper.get("title")
    year = paper.get("year")

    authors = []
    for a in paper.get("authors", []):
        name = a.get("name", "")
        if name:
            authors.append(name)

    journal = None
    j = paper.get("journal")
    if isinstance(j, dict):
        journal = j.get("name")

    doi = None
    ext_ids = paper.get("externalIds") or {}
    doi = ext_ids.get("DOI")

    pub_types = paper.get("publicationTypes") or []

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "journal": journal,
        "doi": doi,
        "paperId": paper.get("paperId"),
        "publicationTypes": pub_types,
    }


# ── Comparison logic ───────────────────────────────────────────────────────

def _compare(ref, ss, method):
    """Compare original reference with Semantic Scholar result."""
    parsed = ref.get("parsed", {})

    title_match = _compare_title(
        parsed.get("title"), ss.get("title"))
    authors_match = _compare_authors(
        parsed.get("authors", []), ss.get("authors", []))
    year_match = _compare_year(
        parsed.get("year"), ss.get("year"))
    journal_match = _compare_title(
        parsed.get("journal"), ss.get("journal"))

    metadata_errors = []
    if title_match == "mismatch":
        metadata_errors.append(
            f"Title mismatch: original='{_clean_text(parsed.get('title') or '')}', "
            f"ss='{_clean_text(ss.get('title') or '')}'")
    if authors_match == "mismatch":
        metadata_errors.append("Authors mismatch")
    if year_match is False:
        metadata_errors.append(
            f"Year mismatch: original={parsed.get('year')}, ss={ss.get('year')}")
    if journal_match == "mismatch":
        metadata_errors.append(
            f"Journal mismatch: original='{_clean_text(parsed.get('journal') or '')}', "
            f"ss='{_clean_text(ss.get('journal') or '')}'")

    return {
        "exists": True,
        "matched_by": method,
        "title_match": title_match,
        "authors_match": authors_match,
        "year_match": year_match if year_match is not None else "unknown",
        "journal_match": journal_match,
        "metadata_errors": metadata_errors,
    }


# ── Text comparison helpers ────────────────────────────────────────────────

def _normalize(text):
    if not text:
        return ""
    text = text.translate(_CHAR_CLEANUP)
    for _ in range(3):
        prev = text
        text = _TAG_RE.sub("", _html.unescape(text))
        if text == prev:
            break
    text = text.lower().strip()
    result = []
    for ch in text:
        if ch.isalnum() or ch.isspace():
            result.append(ch)
    return " ".join("".join(result).split())


def _jaccard(text1, text2):
    words1 = set(text1.split())
    words2 = set(text2.split())
    if not words1 and not words2:
        return 1.0
    if not words1 or not words2:
        return 0.0
    return len(words1 & words2) / len(words1 | words2)


def _compare_title(orig_title, ss_title):
    if not orig_title or not ss_title:
        return "unknown"
    norm_orig = _normalize(orig_title)
    norm_ss = _normalize(ss_title)
    if norm_orig == norm_ss:
        return "exact"
    if norm_orig in norm_ss or norm_ss in norm_orig:
        return "fuzzy"
    jac = _jaccard(norm_orig, norm_ss)
    if jac >= 0.7:
        return "fuzzy"
    return "mismatch"


def _compare_authors(orig_authors, ss_authors):
    if not orig_authors or not ss_authors:
        return "unknown"
    orig_surnames = _extract_surnames(orig_authors)
    ss_surnames = _extract_surnames(ss_authors)
    if not orig_surnames or not ss_surnames:
        return "unknown"
    matched = [s for s in orig_surnames if s in ss_surnames]
    if len(matched) == len(orig_surnames) == len(ss_surnames):
        return "exact"
    if len(matched) > 0:
        return "partial"
    return "mismatch"


def _extract_surnames(authors):
    surnames = set()
    for author in authors:
        if not isinstance(author, str):
            continue
        parts = author.lower().split()
        for part in parts:
            if len(part) >= 2 and not part.endswith("."):
                surnames.add(part)
            elif len(part) >= 3:
                surnames.add(part)
        if parts:
            surnames.add(parts[0])
    return surnames


def _extract_first_surname(authors):
    if not authors:
        return None
    first = authors[0]
    if not isinstance(first, str):
        return None
    parts = first.lower().split()
    for part in parts:
        if len(part) >= 2 and not part.endswith("."):
            return part
    return parts[0] if parts else None


def _compare_year(orig_year, ss_year):
    if orig_year is None or ss_year is None:
        return None
    try:
        return int(orig_year) == int(ss_year)
    except (ValueError, TypeError):
        return None


# ── Result builders ────────────────────────────────────────────────────────

def _unmatched_result(ref_id, ref, method, message):
    return {
        "reference_id": ref_id,
        "status": "unmatched",
        "method": method,
        "db_source": "Semantic Scholar",
        "original": ref,
        "ss_result": None,
        "comparison": {
            "exists": False,
            "matched_by": method,
            "title_match": "unknown",
            "authors_match": "unknown",
            "year_match": "unknown",
            "journal_match": "unknown",
            "metadata_errors": [message],
        },
        "error": None,
    }


def _error_result(ref_id, ref, method, error_message):
    return {
        "reference_id": ref_id,
        "status": "error",
        "method": method,
        "db_source": "Semantic Scholar",
        "original": ref,
        "ss_result": None,
        "comparison": {
            "exists": "unknown",
            "matched_by": method,
            "title_match": "unknown",
            "authors_match": "unknown",
            "year_match": "unknown",
            "journal_match": "unknown",
            "metadata_errors": [error_message],
        },
        "error": error_message,
    }


# ── HTTP helper ────────────────────────────────────────────────────────────

def _http_get(url, api_key=None):
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent",
                          "PeerReviewAssistant/0.1 (mailto:dev@example.com)")
            if api_key:
                req.add_header("x-api-key", api_key)
            with urllib.request.urlopen(req, timeout=15) as resp:
                return (resp.status, resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500:
                return (e.code, None)
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
        except (urllib.error.URLError, OSError):
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)

    return (None, None)
