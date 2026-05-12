"""CiNii Research API verification for Japanese reference entries.

CiNii Research (https://cir.nii.ac.jp/) is a Japanese academic database
maintained by the National Institute of Informatics (NII).  It indexes:

  - Japanese journal articles (including English-language publications
    in Japanese journals)
  - Japanese books and book chapters
  - Conference proceedings
  - Dissertations

This module uses the CiNii Research OpenSearch API to match references
that Crossref and PubMed cannot handle (typically Japanese papers).

API documentation: https://support.nii.ac.jp/en/cir/r_opensearch

Usage:
    result = verify_cinii(references_split, appid="YOUR_APPID")
"""

import html as _html
import json
import re as _re
import time
import urllib.request
import urllib.parse
import urllib.error

_TAG_RE = _re.compile(r"<[^>]+>")
_CHAR_CLEANUP = str.maketrans({"€": "-"})  # € → -


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

CINII_OPENSEARCH_URL = "https://cir.nii.ac.jp/opensearch/v2/articles"
CINII_CRID_URL = "https://cir.nii.ac.jp/crid"

REQUEST_DELAY = 1.0  # seconds between requests
MAX_RETRIES = 3


# ── Public entry point ─────────────────────────────────────────────────────

def verify_cinii(references_split, appid):
    """Verify references against CiNii Research OpenSearch API.

    Only processes references that are currently unmatched (no DOI, no
    PMID).  Searches by title + first author surname + year.

    Args:
        references_split: dict from references_split.json with items list
            containing reference_id, raw_text, parsed dicts.
        appid: CiNii Research API application ID (required).

    Returns:
        dict with total_verified, matched_count, unmatched_count, items.
        Returns empty result if appid is None/empty.
    """
    if not appid or not appid.strip():
        return {
            "total_verified": 0,
            "matched_count": 0,
            "unmatched_count": 0,
            "items": [],
        }

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

        # Skip references that already have DOI/PMID (already handled by
        # Crossref/Pubmed) — but include them as "not processed" in results
        if ref not in targets:
            results.append({
                "reference_id": ref_id,
                "status": "unmatched",
                "method": "skipped",
                "db_source": "CiNii",
                "original": ref,
                "cinii_result": None,
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

        result = _verify_single(ref, parsed, appid)

        if result["status"] == "matched":
            matched += 1
        else:
            unmatched += 1

        results.append(result)

        # Rate limiting
        if i < len(items) - 1:
            time.sleep(REQUEST_DELAY)

    return {
        "total_verified": len(results),
        "matched_count": matched,
        "unmatched_count": unmatched,
        "items": results,
    }


# ── Single reference verification ──────────────────────────────────────────

def _verify_single(ref, parsed, appid):
    """Verify a single reference against CiNii Research.

    Tries in priority order:
        1. title + first author surname + year (most precise)
        2. title only (fallback)
    """
    ref_id = ref["reference_id"]
    title = (parsed.get("title") or "").strip()
    authors = parsed.get("authors") or []
    year = parsed.get("year")
    first_author = _extract_first_surname(authors) if authors else None

    # ── Strategy 1: title + first author surname + year ──────────────
    if title and first_author and year:
        query = f"{title} {first_author} {year}"
        result = _search_cinii(ref_id, ref, query, appid, method="title_author_year")
        if result["status"] == "matched":
            return result

    # ── Strategy 2: title only ───────────────────────────────────────
    if title:
        result = _search_cinii(ref_id, ref, title, appid, method="title")
        if result["status"] == "matched":
            return result

    # ── No search terms available ────────────────────────────────────
    return _unmatched_result(ref_id, ref, method="title",
                             message="No search terms available (missing title)")


def _search_cinii(ref_id, ref, query, appid, method):
    """Search CiNii Research and build a result for the best match."""
    # Search CiNii Research
    params = urllib.parse.urlencode({
        "appid": appid,
        "format": "json",
        "q": query,
        "count": 5,
    })
    url = f"{CINII_OPENSEARCH_URL}?{params}"
    status_code, body = _http_get(url)

    if status_code is None:
        return _error_result(ref_id, ref, method,
                             f"Request failed after {MAX_RETRIES} retries")

    if status_code != 200:
        return _error_result(ref_id, ref, method,
                             f"HTTP {status_code} from CiNii Research")

    if not body or not body.strip():
        return _unmatched_result(ref_id, ref, method,
                                 "Empty response from CiNii Research")

    # Parse JSON-LD response
    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return _error_result(ref_id, ref, method,
                             "Could not parse CiNii Research response as JSON")

    # Extract items from @graph
    items = _extract_graph_items(data)
    if not items:
        return _unmatched_result(ref_id, ref, method,
                                 "No results found on CiNii Research")

    # Use the first (best) match
    best = items[0]
    cinii_result = _extract_cinii_fields(best)

    # Fetch CRID detail for richer metadata (journal, pages, DOI)
    crid = cinii_result.get("crid")
    if crid:
        detail = _fetch_crid_detail(crid, appid)
        if detail:
            # Merge detail into cinii_result (detail takes precedence when
            # it provides fields the search result didn't have)
            cinii_result = _merge_detail(cinii_result, detail)

    comparison = _compare(ref, cinii_result, method)

    return {
        "reference_id": ref_id,
        "status": "matched",
        "method": method,
        "db_source": "CiNii",
        "original": ref,
        "cinii_result": cinii_result,
        "comparison": comparison,
        "error": None,
    }


# ── CiNii API response parsing ─────────────────────────────────────────────

def _extract_graph_items(data):
    """Extract bibliographic resource items from a CiNii JSON-LD @graph.

    CiNii Research returns a JSON-LD document with a @graph array
    containing items of various types.  We filter for dc: bibliographicResource
    items (articles, books, etc.).
    """
    graph = data.get("@graph", [])
    resources = []
    for item in graph:
        if not isinstance(item, dict):
            continue
        item_type = item.get("@type", "")
        # @type can be a string or list
        if isinstance(item_type, list):
            types = item_type
        else:
            types = [item_type]
        # Accept bibliographicResource and its sub-types
        is_resource = any(
            t in ("dc: bibliographicResource", "foaf: Document")
            or "bibliographicResource" in t
            for t in types
        )
        if is_resource:
            resources.append(item)
    return resources


def _extract_cinii_fields(item):
    """Extract standardized fields from a CiNii Research JSON-LD item.

    Uses Dublin Core (dc:), PRISM, and CiNii Research namespaces.
    """
    # CRID from @id
    crid = None
    item_id = item.get("@id", "")
    if "crid/" in item_id:
        crid = item_id.rsplit("crid/", 1)[-1].rstrip(".json").strip("#")

    # Title: dc:title can be string or list
    title = _pick_first(item.get("dc:title"))

    # Authors: dc:creator as list of strings (surname givenname format)
    authors_raw = _as_list(item.get("dc:creator", []))
    authors = [a for a in authors_raw if isinstance(a, str) and a.strip()]

    # Year: dc:date, prism:publicationDate, or foaf:date
    date_str = (
        _pick_first(item.get("prism:publicationDate"))
        or _pick_first(item.get("dc:date"))
        or _pick_first(item.get("foaf:date"))
        or ""
    )
    year = _parse_year(date_str)

    # Journal: dc:source or prism:publicationName
    journal = (
        _pick_first(item.get("prism:publicationName"))
        or _pick_first(item.get("dc:source"))
    )

    # Volume, issue, pages from PRISM namespace
    volume = item.get("prism:volume")
    issue = item.get("prism:number")
    pages = item.get("prism:startingPage")
    ending_page = item.get("prism:endingPage")
    if pages and ending_page:
        pages = f"{pages}-{ending_page}"

    # DOI
    doi = _pick_first(item.get("dc:identifier"))
    # dc:identifier may contain non-DOI values; check format
    if doi and not doi.startswith("10."):
        # Could be a CRID URI or other identifier; try to find a real DOI
        # from dc:subject which sometimes contains DOI links
        doi = None
        subjects = _as_list(item.get("dc:subject", []))
        for subj in subjects:
            if isinstance(subj, str) and "doi.org" in subj:
                doi = subj.split("doi.org/", 1)[-1].strip()
                break

    # Publication type
    pub_type = _pick_first(item.get("dc:type")) or "article"

    return {
        "title": title,
        "authors": authors,
        "year": year,
        "journal": journal,
        "volume": volume,
        "issue": issue,
        "pages": pages,
        "doi": doi,
        "crid": crid,
        "type": pub_type,
    }


def _fetch_crid_detail(crid, appid):
    """Fetch detailed metadata for a CRID from the detail endpoint.

    The detail endpoint returns richer metadata including journal name,
    volume, issue, pages, and sometimes DOI.

    Returns:
        dict with cinii_result fields, or None on failure.
    """
    url = f"{CINII_CRID_URL}/{crid}.json?appid={appid}"
    status_code, body = _http_get(url)

    if status_code != 200 or not body:
        return None

    try:
        data = json.loads(body)
    except json.JSONDecodeError:
        return None

    # The detail response may use @graph or be a single object
    if isinstance(data, dict) and "@graph" in data:
        items = _extract_graph_items(data)
        if items:
            return _extract_cinii_fields(items[0])
    elif isinstance(data, dict):
        return _extract_cinii_fields(data)

    return None


def _merge_detail(base, detail):
    """Merge CRID detail into the base cinii_result, preferring detail."""
    merged = dict(base)
    # Detail fields that are often richer:
    for field in ("journal", "volume", "issue", "pages", "doi"):
        if not merged.get(field) and detail.get(field):
            merged[field] = detail[field]
    # Authors: use detail if it has more
    if len(detail.get("authors") or []) > len(merged.get("authors") or []):
        merged["authors"] = detail["authors"]
    # Title: prefer detail if it's longer (more complete)
    if detail.get("title") and len(detail.get("title", "")) > len(merged.get("title", "")):
        merged["title"] = detail["title"]
    return merged


# ── Comparison logic ───────────────────────────────────────────────────────

def _compare(ref, cinii, method):
    """Compare original reference with CiNii result."""
    parsed = ref.get("parsed", {})

    title_match = _compare_title(
        parsed.get("title"), cinii.get("title"))
    authors_match = _compare_authors(
        parsed.get("authors", []), cinii.get("authors", []))
    year_match = _compare_year(
        parsed.get("year"), cinii.get("year"))
    journal_match = _compare_title(
        parsed.get("journal"), cinii.get("journal"))

    metadata_errors = []
    if title_match == "mismatch":
        metadata_errors.append(
            f"Title mismatch: original='{_clean_text(parsed.get('title') or '')}', "
            f"cinii='{_clean_text(cinii.get('title') or '')}'")
    if authors_match == "mismatch":
        metadata_errors.append("Authors mismatch")
    if year_match is False:
        metadata_errors.append(
            f"Year mismatch: original={parsed.get('year')}, "
            f"cinii={cinii.get('year')}")
    if journal_match == "mismatch":
        metadata_errors.append(
            f"Journal mismatch: original='{_clean_text(parsed.get('journal') or '')}', "
            f"cinii='{_clean_text(cinii.get('journal') or '')}'")

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
    """Normalize text for comparison: decode HTML, lowercase, strip
    punctuation, collapse whitespace."""
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
    """Compute Jaccard similarity of word sets."""
    words1 = set(text1.split())
    words2 = set(text2.split())
    if not words1 and not words2:
        return 1.0
    if not words1 or not words2:
        return 0.0
    return len(words1 & words2) / len(words1 | words2)


def _compare_title(orig_title, cinii_title):
    """Compare two titles. Returns: exact / fuzzy / mismatch / unknown."""
    if not orig_title or not cinii_title:
        return "unknown"

    norm_orig = _normalize(orig_title)
    norm_cr = _normalize(cinii_title)

    if norm_orig == norm_cr:
        return "exact"

    if norm_orig in norm_cr or norm_cr in norm_orig:
        return "fuzzy"

    jac = _jaccard(norm_orig, norm_cr)
    if jac >= 0.7:
        return "fuzzy"

    return "mismatch"


def _compare_authors(orig_authors, cinii_authors):
    """Compare author lists. Returns: exact / partial / mismatch / unknown."""
    if not orig_authors or not cinii_authors:
        return "unknown"

    orig_surnames = _extract_surnames(orig_authors)
    cr_surnames = _extract_surnames(cinii_authors)

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
    """Extract the surname of the first author."""
    if not authors:
        return None
    first = authors[0]
    if not isinstance(first, str):
        return None
    parts = first.lower().split()
    # Return the first non-initial token (longer than 1 char and no dot)
    for part in parts:
        if len(part) >= 2 and not part.endswith("."):
            return part
    return parts[0] if parts else None


def _compare_year(orig_year, cinii_year):
    """Compare years. Returns: True / False / None (unknown)."""
    if orig_year is None or cinii_year is None:
        return None
    try:
        return int(orig_year) == int(cinii_year)
    except (ValueError, TypeError):
        return None


# ── Result builders ────────────────────────────────────────────────────────

def _unmatched_result(ref_id, ref, method, message):
    """Build an unmatched result entry."""
    return {
        "reference_id": ref_id,
        "status": "unmatched",
        "method": method,
        "db_source": "CiNii",
        "original": ref,
        "cinii_result": None,
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
    """Build an error result entry."""
    return {
        "reference_id": ref_id,
        "status": "error",
        "method": method,
        "db_source": "CiNii",
        "original": ref,
        "cinii_result": None,
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


# ── HTTP & parsing helpers ─────────────────────────────────────────────────

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
            if 400 <= e.code < 500:
                return (e.code, None)
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
        except (urllib.error.URLError, OSError):
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)

    return (None, None)


def _pick_first(val):
    """If val is a list, return first element; otherwise return val."""
    if isinstance(val, list):
        return val[0] if val else None
    return val


def _as_list(val):
    """Ensure val is a list."""
    if isinstance(val, list):
        return val
    if val is None:
        return []
    return [val]


def _parse_year(date_str):
    """Extract a 4-digit year from a date string.

    Handles formats: '2023', '2023-01', '2023-01-15', '20230115'
    """
    if not date_str:
        return None
    # Try YYYY-MM-DD or YYYYMMDD
    match = _re.search(r"(\d{4})", str(date_str))
    if match:
        year = int(match.group(1))
        if 1800 <= year <= 2100:
            return year
    return None
