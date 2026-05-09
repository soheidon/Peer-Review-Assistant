"""PubMed / NCBI E-utilities database verification for reference entries."""

import html as _html
import json
import os
import sys
import time
import urllib.request
import urllib.parse
import urllib.error

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"

REQUEST_DELAY = 0.5  # seconds between requests (with API key: 10/sec limit)
MAX_RETRIES = 3


# ── environment helpers ────────────────────────────────────────────────

def _get_env(key):
    """Get env var with Windows registry fallback."""
    val = os.environ.get(key)
    if val:
        return val
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, "Environment",
            ) as regkey:
                val, _ = winreg.QueryValueEx(regkey, key)
                return val if val else ""
        except (OSError, ImportError):
            pass
    return ""


# ── public entry point ─────────────────────────────────────────────────

def verify_pubmed(references_split):
    """Verify references against PubMed / NCBI E-utilities.

    Args:
        references_split: dict from references_split.json (items with
            reference_id, raw_text, parsed).

    Returns:
        dict with total_verified, matched_count, unmatched_count, items.
    """
    api_key = _get_env("NCBI_API_KEY").strip()
    email = _get_env("NCBI_EMAIL").strip()
    tool = _get_env("NCBI_TOOL").strip()

    if not api_key:
        raise RuntimeError(
            "NCBI_API_KEY environment variable is not set. "
            "Set your NCBI API key to use PubMed verification."
        )

    items = references_split.get("items", [])
    results = []
    matched = 0
    unmatched = 0

    for i, ref in enumerate(items):
        ref_id = ref["reference_id"]
        parsed = ref.get("parsed", {})
        pmid = parsed.get("pmid")
        doi = parsed.get("doi")

        result = _verify_single(ref_id, parsed, ref, pmid, doi,
                                api_key, email, tool)
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


def _verify_single(ref_id, parsed, ref, pmid, doi, api_key, email, tool):
    """Verify a single reference against PubMed.

    Tries in priority order:
        1. PMID (direct efetch/esummary)
        2. DOI (esearch)
        3. title + first author surname + year (esearch)
        4. title only (esearch)
    """
    esearch_params = _base_params(api_key, email, tool)

    # Priority 1: PMID
    if pmid:
        summary = _fetch_summary(pmid, api_key, email, tool)
        if summary:
            pubmed_result = _extract_pubmed_fields(summary)
            comparison = _compare(ref, pubmed_result, "pmid")
            return _matched_result(ref_id, ref, "pmid", pubmed_result, comparison)

    # Priority 2: DOI
    if doi:
        pmid_hit = _esearch_by_doi(doi, esearch_params)
        if pmid_hit:
            summary = _fetch_summary(pmid_hit, api_key, email, tool)
            if summary:
                pubmed_result = _extract_pubmed_fields(summary)
                comparison = _compare(ref, pubmed_result, "doi")
                return _matched_result(ref_id, ref, "doi", pubmed_result, comparison)

    # Priority 3: title + first author + year
    title = parsed.get("title") or ""
    authors = parsed.get("authors", [])
    year = parsed.get("year")

    if title:
        # Build author surname for first author
        first_author = ""
        if authors:
            first_author = _first_author_surname(authors)

        pmid_hit = _esearch_by_title_author_year(
            title, first_author, year, esearch_params)
        if pmid_hit:
            summary = _fetch_summary(pmid_hit, api_key, email, tool)
            if summary:
                pubmed_result = _extract_pubmed_fields(summary)
                comparison = _compare(ref, pubmed_result, "title_author_year")
                return _matched_result(ref_id, ref, "title_author_year",
                                       pubmed_result, comparison)

        # Priority 4: title only
        pmid_hit = _esearch_by_title(title, esearch_params)
        if pmid_hit:
            summary = _fetch_summary(pmid_hit, api_key, email, tool)
            if summary:
                pubmed_result = _extract_pubmed_fields(summary)
                comparison = _compare(ref, pubmed_result, "title")
                return _matched_result(ref_id, ref, "title",
                                       pubmed_result, comparison)

    # All methods failed
    method = "pmid" if pmid else ("doi" if doi else
              ("title_author_year" if title else "none"))
    return _unmatched_result(ref_id, ref, method,
                             "No match found on PubMed")


# ── PubMed API helpers ─────────────────────────────────────────────────

def _base_params(api_key, email, tool):
    """Build base query params dict for PubMed E-utilities."""
    params = {"api_key": api_key}
    if email:
        params["email"] = email
    if tool:
        params["tool"] = tool
    return params


def _esearch_by_doi(doi, base_params):
    """Search PubMed by DOI. Returns PMID string or None."""
    params = dict(base_params)
    params.update({
        "db": "pubmed",
        "term": f'{doi}[doi]',
        "retmode": "json",
        "retmax": "1",
    })
    data = _eutils_get(ESEARCH_URL, params)
    if not data:
        return None
    idlist = data.get("esearchresult", {}).get("idlist", [])
    return idlist[0] if idlist else None


def _esearch_by_title_author_year(title, first_author, year, base_params):
    """Search PubMed by title + first author + year. Returns PMID or None."""
    # Build query: "title"[ti] AND "author"[au] AND year[dp]
    terms = [f'"{title}"[ti]']
    if first_author:
        terms.append(f'{first_author}[au]')
    if year:
        terms.append(f'{year}[dp]')

    query = " AND ".join(terms)
    return _do_esearch(query, base_params)


def _esearch_by_title(title, base_params):
    """Search PubMed by title only. Returns PMID or None."""
    query = f'"{title}"[ti]'
    return _do_esearch(query, base_params)


def _do_esearch(query, base_params):
    """Execute an esearch query and return PMID or None."""
    params = dict(base_params)
    params.update({
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": "1",
    })
    data = _eutils_get(ESEARCH_URL, params)
    if not data:
        return None
    idlist = data.get("esearchresult", {}).get("idlist", [])
    return idlist[0] if idlist else None


def _fetch_summary(pmid, api_key, email, tool):
    """Fetch PubMed summary for a PMID. Returns summary dict or None."""
    params = {
        "db": "pubmed",
        "id": str(pmid),
        "retmode": "json",
        "api_key": api_key,
    }
    if email:
        params["email"] = email
    if tool:
        params["tool"] = tool

    data = _eutils_get(ESUMMARY_URL, params)
    if not data:
        return None

    result = data.get("result", {})
    uids = result.get("uids", [])
    if not uids:
        return None

    return result.get(str(uids[0]))


def _eutils_get(url, params):
    """Perform an HTTP GET to NCBI E-utilities with retry/backoff.

    Returns parsed JSON dict, or None on failure.
    """
    # Build URL (api_key is in params, NOT logged)
    query_string = urllib.parse.urlencode(params)
    full_url = url + "?" + query_string

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(full_url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.HTTPError as e:
            if 400 <= e.code < 500:
                return None
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)

    return None


# ── field extraction ───────────────────────────────────────────────────

def _extract_pubmed_fields(summary):
    """Extract standardized fields from a PubMed esummary result dict."""
    # Title
    title = summary.get("title")

    # Authors
    authors = []
    for author in summary.get("authors", []):
        name = author.get("name")
        if name:
            authors.append(name)

    # Journal / source
    journal = summary.get("source")

    # Year from pubdate
    year = None
    pubdate = summary.get("pubdate", "")
    import re
    year_m = re.search(r"(\d{4})", pubdate or "")
    if year_m:
        year = int(year_m.group(1))

    volume = summary.get("volume")
    issue = summary.get("issue")
    pages = summary.get("pages")

    # DOI from articleids or elocationid
    doi = None
    eloc = summary.get("elocationid", "")
    doi_m = re.search(r"doi:\s*(10\.\d{4,}/[^\s]+)", eloc or "", re.IGNORECASE)
    if doi_m:
        doi = doi_m.group(1)

    if not doi:
        for aid in summary.get("articleids", []):
            if aid.get("idtype") == "doi":
                doi = aid.get("value")
                break

    pmid = str(summary.get("uid", ""))

    # Publication types
    pub_types = summary.get("pubtype", [])

    return {
        "pmid": pmid,
        "doi": doi,
        "title": title,
        "authors": authors,
        "journal": journal,
        "year": year,
        "volume": volume,
        "issue": issue,
        "pages": pages,
        "pubdate": pubdate or None,
        "publication_types": pub_types if pub_types else [],
    }


# ── comparison logic ───────────────────────────────────────────────────

def _first_author_surname(authors):
    """Extract surname of the first author."""
    if not authors:
        return ""
    first = authors[0].strip()
    # "Smith J." -> "Smith"
    # "Smith John" -> "Smith"
    # For format like "Smith, J." take the part before comma
    parts = first.replace(",", " ").split()
    for part in parts:
        if re.match(r"^[A-Z][a-z]{2,}", part):
            return part
    # Fallback: first token
    return parts[0] if parts else ""


import re as _re_module  # local name for internal use; re imported at top

re = _re_module  # prefer the real module for callers

_TAG_RE = _re_module.compile(r"<[^>]+>")
_CHAR_CLEANUP = str.maketrans({"€": "-"})


def _clean_text(text):
    """Decode HTML entities and strip tags for display in error messages.
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
    return " ".join(_TAG_RE.sub("", decoded).split())


def _compare(ref, pubmed_result, method):
    """Compare original reference with PubMed result."""
    parsed = ref.get("parsed", {})

    title_match = _compare_title(parsed.get("title"), pubmed_result.get("title"))
    authors_match = _compare_authors(
        parsed.get("authors", []), pubmed_result.get("authors", []))
    year_match = _compare_year(parsed.get("year"), pubmed_result.get("year"))
    journal_match = _compare_title(
        parsed.get("journal"), pubmed_result.get("journal"))

    metadata_errors = []
    if title_match == "mismatch":
        metadata_errors.append(
            f"Title mismatch: original='{_clean_text(parsed.get('title') or '')}', "
            f"pubmed='{_clean_text(pubmed_result.get('title') or '')}'")
    if authors_match == "mismatch":
        metadata_errors.append("Authors mismatch")
    if year_match is False:
        metadata_errors.append(
            f"Year mismatch: original={parsed.get('year')}, "
            f"pubmed={pubmed_result.get('year')}")
    if journal_match == "mismatch":
        metadata_errors.append(
            f"Journal mismatch: original='{_clean_text(parsed.get('journal') or '')}', "
            f"pubmed='{_clean_text(pubmed_result.get('journal') or '')}'")

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
    """Normalize text for comparison: decode HTML, lowercase, strip punctuation."""
    if not text:
        return ""
    # Step 0: Fix encoding corruptions + strip tags + decode HTML entities
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


def _compare_title(orig_title, pubmed_title):
    """Compare two titles. Returns: exact / fuzzy / mismatch / unknown."""
    if not orig_title or not pubmed_title:
        return "unknown"

    norm_orig = _normalize(orig_title)
    norm_db = _normalize(pubmed_title)

    if norm_orig == norm_db:
        return "exact"

    if norm_orig in norm_db or norm_db in norm_orig:
        return "fuzzy"

    jac = _jaccard(norm_orig, norm_db)
    if jac >= 0.7:
        return "fuzzy"

    return "mismatch"


def _compare_authors(orig_authors, pubmed_authors):
    """Compare author lists. Returns: exact / partial / mismatch / unknown."""
    if not orig_authors or not pubmed_authors:
        return "unknown"

    orig_surnames = _extract_surnames(orig_authors)
    db_surnames = _extract_surnames(pubmed_authors)

    if not orig_surnames or not db_surnames:
        return "unknown"

    matched = [s for s in orig_surnames if s in db_surnames]

    if len(matched) == len(orig_surnames) == len(db_surnames):
        return "exact"
    if len(matched) > 0:
        return "partial"
    return "mismatch"


def _extract_surnames(authors):
    """Extract lowercased surname-like tokens from an author list."""
    surnames = set()
    for author in authors:
        parts = author.lower().split()
        for part in parts:
            if len(part) >= 2 and not part.endswith("."):
                surnames.add(part)
            elif len(part) >= 3:
                surnames.add(part)
        if parts:
            surnames.add(parts[0])
    return surnames


def _compare_year(orig_year, pubmed_year):
    """Compare years. Returns: True / False / None (unknown)."""
    if orig_year is None or pubmed_year is None:
        return None
    try:
        return int(orig_year) == int(pubmed_year)
    except (ValueError, TypeError):
        return None


# ── result builders ────────────────────────────────────────────────────

def _matched_result(ref_id, ref, method, pubmed_result, comparison):
    """Build a matched result entry."""
    return {
        "reference_id": ref_id,
        "status": "matched",
        "method": method,
        "db_source": "PubMed",
        "original": ref,
        "pubmed_result": pubmed_result,
        "comparison": comparison,
        "error": None,
    }


def _unmatched_result(ref_id, ref, method, reason):
    """Build an unmatched result entry."""
    return {
        "reference_id": ref_id,
        "status": "unmatched",
        "method": method,
        "db_source": "PubMed",
        "original": ref,
        "pubmed_result": None,
        "comparison": {
            "exists": False,
            "matched_by": method,
            "title_match": "unknown",
            "authors_match": "unknown",
            "year_match": "unknown",
            "journal_match": "unknown",
            "metadata_errors": [reason],
        },
        "error": None,
    }
