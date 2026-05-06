"""Crossref database verification for reference entries."""

import json
import time
import urllib.request
import urllib.parse
import urllib.error

CROSSREF_WORKS_URL = "https://api.crossref.org/works/"
CROSSREF_SEARCH_URL = "https://api.crossref.org/works"

REQUEST_DELAY = 1.0
MAX_RETRIES = 3


def verify_crossref(references_split):
    """Verify references against the Crossref API.

    Args:
        references_split: dict from references_split.json (items with
            reference_id, raw_text, parsed).

    Returns:
        dict with total_verified, matched_count, unmatched_count, items.
    """
    items = references_split.get("items", [])
    results = []
    matched = 0
    unmatched = 0

    for i, ref in enumerate(items):
        ref_id = ref["reference_id"]
        parsed = ref.get("parsed", {})
        doi = parsed.get("doi")

        if doi:
            result = _verify_by_doi(ref_id, doi, ref)
        else:
            result = _verify_by_search(ref_id, parsed, ref)

        if result["status"] == "matched":
            matched += 1
        else:
            unmatched += 1

        results.append(result)

        # Rate limiting: delay between requests
        if i < len(items) - 1:
            time.sleep(REQUEST_DELAY)

    return {
        "total_verified": len(results),
        "matched_count": matched,
        "unmatched_count": unmatched,
        "items": results,
    }


def _verify_by_doi(ref_id, doi, ref):
    """Look up a reference by DOI on Crossref."""
    url = CROSSREF_WORKS_URL + urllib.parse.quote(doi, safe="")
    status_code, body = _http_get(url)

    if status_code is None:
        return _error_result(ref_id, ref, "doi",
                            f"Request failed after {MAX_RETRIES} retries")

    if status_code == 404:
        return {
            "reference_id": ref_id,
            "status": "unmatched",
            "method": "doi",
            "db_source": "Crossref",
            "original": ref,
            "crossref_result": None,
            "comparison": {
                "exists": False,
                "matched_by": "doi",
                "title_match": "unknown",
                "authors_match": "unknown",
                "year_match": "unknown",
                "journal_match": "unknown",
                "metadata_errors": ["DOI not found on Crossref"],
            },
            "error": None,
        }

    if body is None:
        return _error_result(ref_id, ref, "doi", "Failed to parse Crossref response")

    try:
        data = json.loads(body)
        message = data.get("message", {})
    except (json.JSONDecodeError, KeyError) as e:
        return _error_result(ref_id, ref, "doi", f"Parse error: {e}")

    crossref_result = _extract_crossref_fields(message)
    comparison = _compare(ref, crossref_result, "doi")

    return {
        "reference_id": ref_id,
        "status": "matched",
        "method": "doi",
        "db_source": "Crossref",
        "original": ref,
        "crossref_result": crossref_result,
        "comparison": comparison,
        "error": None,
    }


def _verify_by_search(ref_id, parsed, ref):
    """Search Crossref by title, journal, and author."""
    title = parsed.get("title") or ""
    journal = parsed.get("journal") or ""
    authors = parsed.get("authors", [])
    author_str = " ".join(authors) if authors else ""
    year = parsed.get("year")

    # Prefer title as primary query; fall back to journal
    primary = title or journal
    if not primary:
        return _error_result(ref_id, ref, "title_search",
                            "No title or journal to search with")

    query_parts = [urllib.parse.quote(primary)]
    # Add first author surname as secondary query term
    if authors:
        surname = authors[0].split()[-1].rstrip(".")
        if len(surname) >= 2:
            query_parts.append(urllib.parse.quote(surname))

    query = "+".join(query_parts)
    params = f"?query={query}&rows=3"
    if year:
        params += f"&filter=year:{year}"

    url = CROSSREF_SEARCH_URL + params
    status_code, body = _http_get(url)

    if status_code is None:
        return _error_result(ref_id, ref, "title_search",
                            f"Request failed after {MAX_RETRIES} retries")

    if status_code != 200:
        return {
            "reference_id": ref_id,
            "status": "unmatched",
            "method": "title_search",
            "db_source": "Crossref",
            "original": ref,
            "crossref_result": None,
            "comparison": {
                "exists": False,
                "matched_by": "title_search",
                "title_match": "unknown",
                "authors_match": "unknown",
                "year_match": "unknown",
                "journal_match": "unknown",
                "metadata_errors": [f"Crossref search returned HTTP {status_code}"],
            },
            "error": None,
        }

    if body is None:
        return _error_result(ref_id, ref, "title_search",
                            "Failed to parse Crossref response")

    try:
        data = json.loads(body)
        items = data.get("message", {}).get("items", [])
    except (json.JSONDecodeError, KeyError) as e:
        return _error_result(ref_id, ref, "title_search",
                            f"Parse error: {e}")

    if not items:
        return {
            "reference_id": ref_id,
            "status": "unmatched",
            "method": "title_search",
            "db_source": "Crossref",
            "original": ref,
            "crossref_result": None,
            "comparison": {
                "exists": False,
                "matched_by": "title_search",
                "title_match": "unknown",
                "authors_match": "unknown",
                "year_match": "unknown",
                "journal_match": "unknown",
                "metadata_errors": ["No results found on Crossref"],
            },
            "error": None,
        }

    # Use the first (best) match
    best = items[0]
    crossref_result = _extract_crossref_fields(best)
    comparison = _compare(ref, crossref_result, "title_search")

    return {
        "reference_id": ref_id,
        "status": "matched",
        "method": "title_search",
        "db_source": "Crossref",
        "original": ref,
        "crossref_result": crossref_result,
        "comparison": comparison,
        "error": None,
    }


def _http_get(url):
    """Perform an HTTP GET with retries and exponential backoff.

    Returns:
        (status_code, body) tuple. status_code is None on network failure.
        body is None for non-2xx responses.
    """
    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent",
                          "PeerReviewAssistant/0.1 (mailto:dev@example.com)")
            with urllib.request.urlopen(req, timeout=15) as resp:
                return (resp.status, resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            # 4xx errors are client errors — don't retry
            if 400 <= e.code < 500:
                return (e.code, None)
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
        except (urllib.error.URLError, OSError):
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)

    return (None, None)


def _extract_crossref_fields(message):
    """Extract standardized fields from a Crossref message dict."""
    title = None
    title_list = message.get("title")
    if title_list and len(title_list) > 0:
        title = title_list[0]

    authors = []
    for author in message.get("author", []):
        family = author.get("family", "")
        given = author.get("given", "")
        if family:
            name = family
            if given:
                name += " " + given
            authors.append(name)

    published = message.get("published-print") or message.get("published-online")
    year = None
    if published and "date-parts" in published:
        parts = published["date-parts"]
        if parts and len(parts[0]) > 0:
            year = parts[0][0]

    journal = None
    container = message.get("container-title")
    if container and len(container) > 0:
        journal = container[0]

    volume = message.get("volume")
    issue = message.get("issue")
    pages = message.get("page")

    doi = message.get("DOI")

    pub_type = message.get("type")

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "journal": journal,
        "volume": volume,
        "issue": issue,
        "pages": pages,
        "doi": doi,
        "type": pub_type,
    }


def _compare(ref, crossref, method):
    """Compare original reference with Crossref result."""
    parsed = ref.get("parsed", {})

    title_match = _compare_title(
        parsed.get("title"), crossref.get("title"))
    authors_match = _compare_authors(
        parsed.get("authors", []), crossref.get("authors", []))
    year_match = _compare_year(
        parsed.get("year"), crossref.get("year"))
    journal_match = _compare_title(
        parsed.get("journal"), crossref.get("journal"))

    metadata_errors = []
    if title_match == "mismatch":
        metadata_errors.append(
            f"Title mismatch: original='{parsed.get('title')}', "
            f"crossref='{crossref.get('title')}'")
    if authors_match == "mismatch":
        metadata_errors.append("Authors mismatch")
    if year_match is False:
        metadata_errors.append(
            f"Year mismatch: original={parsed.get('year')}, "
            f"crossref={crossref.get('year')}")
    if journal_match == "mismatch":
        metadata_errors.append(
            f"Journal mismatch: original='{parsed.get('journal')}', "
            f"crossref='{crossref.get('journal')}'")

    return {
        "exists": True,
        "matched_by": method,
        "title_match": title_match,
        "authors_match": authors_match,
        "year_match": year_match if year_match is not None else "unknown",
        "journal_match": journal_match,
        "metadata_errors": metadata_errors,
    }


def _normalize(text):
    """Normalize text for comparison: lowercase, strip punctuation, collapse
    whitespace."""
    if not text:
        return ""
    text = text.lower().strip()
    # Remove punctuation except spaces
    result = []
    for ch in text:
        if ch.isalnum() or ch.isspace():
            result.append(ch)
    return " ".join("".join(result).split())


def _jaccard(text1, text2):
    """Compute Jaccard similarity of word sets."""
    words1 = set(text1.split())
    words2 = set(text2.split())
    if not words1 and not words2:
        return 1.0
    if not words1 or not words2:
        return 0.0
    return len(words1 & words2) / len(words1 | words2)


def _compare_title(orig_title, crossref_title):
    """Compare two titles. Returns: exact / fuzzy / mismatch / unknown."""
    if not orig_title or not crossref_title:
        return "unknown"

    norm_orig = _normalize(orig_title)
    norm_cr = _normalize(crossref_title)

    if norm_orig == norm_cr:
        return "exact"

    # Check substring relationship
    if norm_orig in norm_cr or norm_cr in norm_orig:
        return "fuzzy"

    jac = _jaccard(norm_orig, norm_cr)
    if jac >= 0.7:
        return "fuzzy"

    return "mismatch"


def _compare_authors(orig_authors, crossref_authors):
    """Compare author lists. Returns: exact / partial / mismatch / unknown."""
    if not orig_authors or not crossref_authors:
        return "unknown"

    orig_surnames = _extract_surnames(orig_authors)
    cr_surnames = _extract_surnames(crossref_authors)

    if not orig_surnames or not cr_surnames:
        return "unknown"

    matched = [s for s in orig_surnames if s in cr_surnames]

    if len(matched) == len(orig_surnames) == len(cr_surnames):
        return "exact"
    if len(matched) > 0:
        return "partial"
    return "mismatch"


def _extract_surnames(authors):
    """Extract lowercased surname-like tokens from an author list."""
    surnames = set()
    for author in authors:
        # "Smith J." → surname is "smith"
        # "Smith John" → surname is "smith"
        parts = author.lower().split()
        for part in parts:
            # Filter initials
            if len(part) >= 2 and not part.endswith("."):
                surnames.add(part)
            elif len(part) >= 3:
                surnames.add(part)
        # Also add the first token (typically surname)
        if parts:
            surnames.add(parts[0])
    return surnames


def _compare_year(orig_year, crossref_year):
    """Compare years. Returns: True / False / None (unknown)."""
    if orig_year is None or crossref_year is None:
        return None
    try:
        return int(orig_year) == int(crossref_year)
    except (ValueError, TypeError):
        return None


def _error_result(ref_id, ref, method, error_message):
    """Build a result entry for a failed request."""
    return {
        "reference_id": ref_id,
        "status": "error",
        "method": method,
        "db_source": "Crossref",
        "original": ref,
        "crossref_result": None,
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
