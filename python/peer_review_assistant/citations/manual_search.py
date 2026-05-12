"""Manual per-reference candidate search against Crossref, PubMed, Google Books.

Used by the GUI's per-card search builder. Each function takes a single reference
and selected field keys, builds a query, and returns a list of candidate dicts.
"""

import hashlib
import json
import os
import re as _re
import time
import urllib.request
import urllib.parse
import urllib.error

from peer_review_assistant.citations.google_books import (
    _search_volumes,
    _extract_volume_fields,
    _score_candidate,
    _rule_extract_book_info,
    GOOGLE_BOOKS_URL,
    REQUEST_DELAY as GB_REQUEST_DELAY,
)

# ── Helpers ──────────────────────────────────────────────────────────────

def _load_ref(project_dir, reference_id):
    """Load a single reference from references_split.json."""
    refs_path = os.path.join(project_dir, "citations", "references_split.json")
    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)
    for ref in refs["items"]:
        if ref["reference_id"] == reference_id:
            return ref
    return None


def _load_llm_item(project_dir, reference_id):
    """Load LLM repair data for a reference if available."""
    llm_path = os.path.join(project_dir, "citations",
                            "references_repaired_llm.json")
    if not os.path.isfile(llm_path):
        return None
    with open(llm_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    for item in data.get("items", []):
        if item["reference_id"] == reference_id:
            return item
    return None


def _get_field_value(ref, llm_item, field_key):
    """Extract a field value from reference data, preferring LLM-parsed.

    Returns the value as a string (or None if not available).
    """
    llm_parsed = llm_item.get("parsed") or {} if llm_item else {}
    ref_parsed = ref.get("parsed", {})

    if field_key == "author":
        authors = llm_parsed.get("authors") or ref_parsed.get("authors") or []
        if not authors:
            return None
        first = authors[0].strip()
        # Extract surname: "Smith, J." → "Smith", "19.\tWhelan R." → "Whelan"
        parts = first.replace(",", " ").split()
        for part in parts:
            if _re.match(r"^[A-Z][a-z]{2,}", part):
                return part
        return parts[-1] if parts else first
    if field_key == "year":
        val = llm_parsed.get("year") or ref_parsed.get("year")
        return str(val) if val is not None else None
    if field_key == "title":
        return llm_parsed.get("title") or ref_parsed.get("title") or None
    if field_key == "journal":
        return llm_parsed.get("journal") or ref_parsed.get("journal") or None
    if field_key == "book_title":
        return llm_parsed.get("book_title") or None
    if field_key == "publisher":
        return llm_parsed.get("publisher") or None
    if field_key == "doi":
        return llm_parsed.get("doi") or ref_parsed.get("doi") or None
    if field_key == "url":
        return llm_parsed.get("url") or None
    if field_key == "isbn":
        return llm_parsed.get("isbn") or None
    return None


def _fields_hash(source, fields_str):
    """Short hash of source+fields for filename deduplication."""
    raw = f"{source}:{fields_str}"
    return hashlib.md5(raw.encode()).hexdigest()[:8]


def _extract_first_author_surname(llm_parsed):
    """Extract first author surname from parsed data."""
    authors = llm_parsed.get("authors", [])
    if not authors:
        return ""
    first = authors[0].strip()
    parts = first.replace(",", " ").split()
    for part in parts:
        if _re.match(r"^[A-Z][a-z]{2,}", part):
            return part
    return parts[0] if parts else ""


# ── HTTP helpers (replicating patterns from db_verify.py / db_pubmed.py) ─

def _http_get_json(url, timeout=15, retries=3):
    """HTTP GET returning parsed JSON dict, or None on failure."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent",
                           "PeerReviewAssistant/0.1 (mailto:dev@example.com)")
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.HTTPError:
            return None
        except (urllib.error.URLError, OSError):
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
        except json.JSONDecodeError:
            return None
    return None


# ── Crossref search ──────────────────────────────────────────────────────

CROSSREF_WORKS_URL = "https://api.crossref.org/works/"
CROSSREF_SEARCH_URL = "https://api.crossref.org/works"


def _search_crossref_candidates(ref, llm_item, field_keys, max_results):
    """Search Crossref for a single reference.

    Strategies (in priority order):
      1. DOI lookup (if doi in field_keys)
      2. title + author + year search
      3. title only search
    """
    candidates = []
    llm_parsed = llm_item.get("parsed") or {} if llm_item else {}
    ref_parsed = ref.get("parsed", {})

    doi = _get_field_value(ref, llm_item, "doi")
    title = _get_field_value(ref, llm_item, "title")
    author = _get_field_value(ref, llm_item, "author")
    year = _get_field_value(ref, llm_item, "year")

    # Strategy 1: DOI lookup
    if "doi" in field_keys and doi:
        url = CROSSREF_WORKS_URL + urllib.parse.quote(doi, safe="")
        data = _http_get_json(url)
        if data:
            message = data.get("message", {})
            if message:
                cand = _crossref_message_to_candidate(message)
                if cand:
                    candidates.append(cand)
                    return candidates[:max_results]

    # Strategy 2: title + author + year search
    if title and author and year:
        has_title = "title" in field_keys or "book_title" in field_keys
        has_author = "author" in field_keys
        has_year = "year" in field_keys
        if has_title and has_author and has_year:
            query_parts = [urllib.parse.quote(title)]
            surname = author.split()[-1].rstrip(".")
            if len(surname) >= 2:
                query_parts.append(urllib.parse.quote(surname))
            query = "+".join(query_parts)
            params = f"?query={query}&rows={max_results}&filter=year:{year}"
            url = CROSSREF_SEARCH_URL + params
            data = _http_get_json(url)
            if data:
                items = data.get("message", {}).get("items", [])
                for item in items:
                    cand = _crossref_message_to_candidate(item)
                    if cand:
                        candidates.append(cand)
                if candidates:
                    return candidates[:max_results]

    # Strategy 3: title only search
    if title and ("title" in field_keys or "book_title" in field_keys):
        query = urllib.parse.quote(title)
        url = CROSSREF_SEARCH_URL + f"?query={query}&rows={max_results}"
        data = _http_get_json(url)
        if data:
            items = data.get("message", {}).get("items", [])
            for item in items:
                cand = _crossref_message_to_candidate(item)
                if cand:
                    candidates.append(cand)

    return candidates[:max_results]


def _crossref_message_to_candidate(message):
    """Convert a Crossref message dict to a ManualSearchCandidate dict."""
    title = None
    title_list = message.get("title")
    if title_list and len(title_list) > 0:
        title = title_list[0]

    authors = []
    for a in message.get("author", []):
        family = a.get("family", "")
        given = a.get("given", "")
        if family:
            name = family
            if given:
                name += " " + given
            authors.append(name)

    published = (message.get("published-print") or
                 message.get("published-online"))
    year = None
    if published and "date-parts" in published:
        parts = published["date-parts"]
        if parts and len(parts[0]) > 0:
            year = parts[0][0]

    journal = None
    container = message.get("container-title")
    if container and len(container) > 0:
        journal = container[0]

    doi = message.get("DOI")
    pub_type = message.get("type")

    return {
        "candidate_id": f"crossref:{doi}" if doi else f"crossref:{title}",
        "source": "crossref",
        "title": title,
        "authors": authors,
        "year": year,
        "journal": journal,
        "publisher": message.get("publisher"),
        "volume": message.get("volume"),
        "issue": message.get("issue"),
        "pages": message.get("page"),
        "doi": doi,
        "isbn": None,
        "url": None,
        "type": pub_type,
        "score": None,
        "confidence": None,
        "match_reasons": [],
    }


# ── PubMed search ────────────────────────────────────────────────────────

ESEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
ESUMMARY_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi"


def _search_pubmed_candidates(ref, llm_item, field_keys, max_results):
    """Search PubMed for a single reference.

    Strategies (in priority order):
      1. DOI search
      2. title + author + year search
      3. title only search
    """
    candidates = []

    doi = _get_field_value(ref, llm_item, "doi")
    title = (_get_field_value(ref, llm_item, "title") or
             _get_field_value(ref, llm_item, "book_title"))
    author = _get_field_value(ref, llm_item, "author")
    year = _get_field_value(ref, llm_item, "year")

    # Resolve PubMed API key from environment
    api_key = _get_pubmed_api_key()

    # Strategy 1: DOI
    if "doi" in field_keys and doi:
        pmid = _pubmed_esearch_doi(doi, api_key)
        if pmid:
            cand = _pubmed_fetch_candidate(pmid, api_key)
            if cand:
                candidates.append(cand)
                return candidates[:max_results]

    # Strategy 2: title + author + year
    if title and author and year:
        has_title = "title" in field_keys or "book_title" in field_keys
        has_author = "author" in field_keys
        has_year = "year" in field_keys
        if has_title and has_author and has_year:
            query = f'"{title}"[ti] AND {author}[au] AND {year}[dp]'
            pmid_list = _pubmed_esearch(query, api_key, max_results)
            for pmid in pmid_list:
                cand = _pubmed_fetch_candidate(pmid, api_key)
                if cand:
                    candidates.append(cand)
            if candidates:
                return candidates[:max_results]

    # Strategy 3: title only
    if title and ("title" in field_keys or "book_title" in field_keys):
        query = f'"{title}"[ti]'
        pmid_list = _pubmed_esearch(query, api_key, max_results)
        for pmid in pmid_list:
            cand = _pubmed_fetch_candidate(pmid, api_key)
            if cand:
                candidates.append(cand)

    return candidates[:max_results]


def _get_pubmed_api_key():
    """Get PubMed API key with Windows registry fallback."""
    import sys
    val = os.environ.get("NCBI_API_KEY")
    if val:
        return val
    if sys.platform == "win32":
        try:
            import winreg
            with winreg.OpenKey(
                winreg.HKEY_CURRENT_USER, "Environment",
            ) as regkey:
                val, _ = winreg.QueryValueEx(regkey, "NCBI_API_KEY")
                return val if val else None
        except (OSError, ImportError):
            pass
    return None


def _pubmed_esearch(query, api_key, retmax=5):
    """Execute a PubMed ESearch query. Returns list of PMIDs."""
    params = {
        "db": "pubmed",
        "term": query,
        "retmode": "json",
        "retmax": str(retmax),
    }
    if api_key:
        params["api_key"] = api_key

    query_string = urllib.parse.urlencode(params)
    url = ESEARCH_URL + "?" + query_string

    for attempt in range(3):
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=30) as resp:
                body = resp.read().decode("utf-8")
                data = json.loads(body)
                return data.get("esearchresult", {}).get("idlist", [])
        except urllib.error.HTTPError:
            return []
        except (urllib.error.URLError, OSError, json.JSONDecodeError):
            if attempt < 2:
                time.sleep(2 ** attempt)
    return []


def _pubmed_esearch_doi(doi, api_key):
    """Search PubMed by DOI. Returns PMID or None."""
    return _pubmed_esearch(f'{doi}[doi]', api_key, 1)[:1]


def _pubmed_fetch_candidate(pmid, api_key):
    """Fetch a PubMed summary and convert to candidate dict."""
    params = {
        "db": "pubmed",
        "id": str(pmid),
        "retmode": "json",
    }
    if api_key:
        params["api_key"] = api_key

    query_string = urllib.parse.urlencode(params)
    url = ESUMMARY_URL + "?" + query_string

    data = _http_get_json(url, timeout=30)
    if not data:
        return None

    result = data.get("result", {})
    uids = result.get("uids", [])
    if not uids:
        return None

    summary = result.get(str(uids[0]))
    if not summary:
        return None

    # Extract fields from PubMed summary
    title = summary.get("title")
    doi = None
    for aid in summary.get("articleids", []):
        if aid.get("idtype") == "doi":
            doi = aid.get("value")
            break

    authors = []
    for a in summary.get("authors", []):
        name = a.get("name", "")
        if name:
            authors.append(name)

    pubdate = summary.get("pubdate", "")
    year = None
    year_m = _re.search(r"(\d{4})", pubdate)
    if year_m:
        year = int(year_m.group(1))

    journal = summary.get("source")
    volume = summary.get("volume")
    issue = summary.get("issue")
    pages = summary.get("pages")

    return {
        "candidate_id": f"pubmed:{pmid}",
        "source": "pubmed",
        "title": title,
        "authors": authors,
        "year": year,
        "journal": journal,
        "publisher": None,
        "volume": volume,
        "issue": issue,
        "pages": pages,
        "doi": doi,
        "isbn": None,
        "url": None,
        "type": None,
        "score": None,
        "confidence": None,
        "match_reasons": [],
    }


# ── Google Books search ──────────────────────────────────────────────────

def _search_gb_candidates(ref, llm_item, field_keys, max_results, api_key=None):
    """Search Google Books for a single reference.

    Uses existing _search_volumes, _extract_volume_fields, _score_candidate
    from google_books.py.

    Strategies (in priority order):
      1. book_title + author
      2. book_title + publisher
      3. book_title only
      4. title + author
      5. title only
    """
    candidates = []
    llm_parsed = llm_item.get("parsed") or {} if llm_item else {}
    ref_parsed = ref.get("parsed", {})

    # Use rule-based extraction to fill gaps (handles LLM parse failures)
    rule_info = _rule_extract_book_info(ref, llm_parsed if llm_item else None)

    book_title = _get_field_value(ref, llm_item, "book_title")
    title = _get_field_value(ref, llm_item, "title")
    author = _get_field_value(ref, llm_item, "author")
    publisher = _get_field_value(ref, llm_item, "publisher")

    # Fill missing values from rule extraction
    if not book_title and rule_info.get("book_title"):
        book_title = rule_info["book_title"]
    if not publisher and rule_info.get("publisher"):
        publisher = rule_info["publisher"]

    # Build query list in priority order
    queries = []

    # Priority 1: book_title + author
    if book_title and author and "book_title" in field_keys and "author" in field_keys:
        queries.append((f'intitle:"{book_title}" inauthor:"{author}"', "book_title_author"))

    # Priority 2: book_title + publisher
    if book_title and publisher and "book_title" in field_keys and "publisher" in field_keys:
        queries.append((f'intitle:"{book_title}" inpublisher:"{publisher}"', "book_title_publisher"))

    # Priority 3: book_title only
    if book_title and "book_title" in field_keys:
        queries.append((f'intitle:"{book_title}"', "book_title"))

    # Priority 4: title + author
    if title and author and "title" in field_keys and "author" in field_keys:
        queries.append((f'intitle:"{title}" inauthor:"{author}"', "title_author"))

    # Priority 5: title only
    if title and "title" in field_keys:
        queries.append((f'intitle:"{title}"', "title"))

    # Priority 6: free-text fallback (individual intitle words, handles & vs "and")
    search_title = book_title or title
    if search_title and author and ("title" in field_keys or "book_title" in field_keys):
        words = [w for w in search_title.split() if len(w) > 3]
        if len(words) >= 2:
            terms = " ".join(f'intitle:{w}' for w in words[:4])
            queries.append((f'{terms} inauthor:"{author}"', "free_text_title_author"))
    elif search_title and ("title" in field_keys or "book_title" in field_keys):
        words = [w for w in search_title.split() if len(w) > 3]
        if len(words) >= 2:
            terms = " ".join(f'intitle:{w}' for w in words[:4])
            queries.append((f'{terms}', "free_text_title"))

    # Search with first matching query
    query_used = None
    all_volumes = []
    seen_ids = set()

    for qs, qtype in queries:
        query_used = qs
        volumes = _search_volumes(qs, api_key, max_results)
        if volumes:
            for vol in volumes:
                vid = vol.get("id", "")
                if vid and vid not in seen_ids:
                    all_volumes.append(vol)
                    seen_ids.add(vid)
            break  # stop after first query that returns results

    # Extract and convert to candidate format
    for vol in all_volumes:
        extracted = _extract_volume_fields(vol)

        # Build augmented LLM parsed for scoring
        scoring_parsed = dict(llm_parsed)
        if book_title:
            scoring_parsed["book_title"] = book_title
        if publisher:
            scoring_parsed["publisher"] = publisher

        score_result = _score_candidate(extracted, ref_parsed, scoring_parsed)

        candidates.append({
            "candidate_id": f"google_books:{extracted.get('google_books_id', '')}",
            "source": "google_books",
            "title": extracted.get("title"),
            "authors": extracted.get("authors", []),
            "year": score_result.get("cand_year"),
            "journal": None,
            "publisher": extracted.get("publisher"),
            "volume": None,
            "issue": None,
            "pages": None,
            "doi": None,
            "isbn": extracted.get("isbn_13") or extracted.get("isbn_10"),
            "url": extracted.get("infoLink"),
            "type": "book",
            "score": score_result.get("score"),
            "confidence": score_result.get("confidence"),
            "match_reasons": score_result.get("match_reasons", []),
        })

    # Sort by score descending
    candidates.sort(
        key=lambda x: x.get("score") or 0,
        reverse=True,
    )
    return candidates[:max_results]


# ── Semantic Scholar search ───────────────────────────────────────────────

SEMANTIC_SCHOLAR_SEARCH_URL = (
    "https://api.semanticscholar.org/graph/v1/paper/search"
)
SEMANTIC_SCHOLAR_FIELDS = (
    "title,authors,year,journal,externalIds,url,publicationTypes,"
    "publicationDate,abstract"
)


def _ss_http_get_json(url, api_key, timeout=15, retries=3):
    """HTTP GET for Semantic Scholar API with x-api-key header."""
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url)
            req.add_header("User-Agent",
                           "PeerReviewAssistant/0.1 (mailto:dev@example.com)")
            if api_key:
                req.add_header("x-api-key", api_key)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8")
                return json.loads(body)
        except urllib.error.HTTPError as e:
            # 400/404/429 etc. — don't retry client errors
            if e.code and 400 <= e.code < 500:
                return None
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
        except (urllib.error.URLError, OSError):
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
        except json.JSONDecodeError:
            return None
    return None


def _search_semantic_scholar_candidates(
    ref, llm_item, field_keys, max_results, api_key=None
):
    """Search Semantic Scholar for a single reference.

    Strategies (in priority order):
      1. title + author + year search
      2. title + author search
      3. title only search

    Uses the /paper/search endpoint with x-api-key header.
    """
    candidates = []
    llm_parsed = llm_item.get("parsed") or {} if llm_item else {}

    title = (_get_field_value(ref, llm_item, "title") or
             _get_field_value(ref, llm_item, "book_title"))
    author = _get_field_value(ref, llm_item, "author")
    year = _get_field_value(ref, llm_item, "year")
    doi = _get_field_value(ref, llm_item, "doi")

    has_title = "title" in field_keys or "book_title" in field_keys
    has_author = "author" in field_keys
    has_year = "year" in field_keys

    # Strategy 1: title + author + year
    if title and author and year and has_title and has_author and has_year:
        # Build query: title wrapped for phrase matching + author surname + year
        query = f'"{title}" {author}'
        params = {
            "query": query,
            "limit": str(max_results),
            "fields": SEMANTIC_SCHOLAR_FIELDS,
        }
        qs = urllib.parse.urlencode(params)
        url = SEMANTIC_SCHOLAR_SEARCH_URL + "?" + qs
        data = _ss_http_get_json(url, api_key)
        if data:
            for paper in data.get("data", []):
                cand = _ss_paper_to_candidate(paper)
                if cand:
                    # Year filter: post-filter since API doesn't support year filter
                    if year and cand.get("year"):
                        if abs(int(cand["year"]) - int(year)) <= 2:
                            candidates.append(cand)
                    else:
                        candidates.append(cand)
            if candidates:
                return candidates[:max_results]

    # Strategy 2: title + author
    if title and author and has_title and has_author:
        query = f'"{title}" {author}'
        params = {
            "query": query,
            "limit": str(max_results),
            "fields": SEMANTIC_SCHOLAR_FIELDS,
        }
        qs = urllib.parse.urlencode(params)
        url = SEMANTIC_SCHOLAR_SEARCH_URL + "?" + qs
        data = _ss_http_get_json(url, api_key)
        if data:
            for paper in data.get("data", []):
                cand = _ss_paper_to_candidate(paper)
                if cand:
                    candidates.append(cand)
            if candidates:
                return candidates[:max_results]

    # Strategy 3: title only
    if title and has_title:
        query = f'"{title}"'
        params = {
            "query": query,
            "limit": str(max_results),
            "fields": SEMANTIC_SCHOLAR_FIELDS,
        }
        qs = urllib.parse.urlencode(params)
        url = SEMANTIC_SCHOLAR_SEARCH_URL + "?" + qs
        data = _ss_http_get_json(url, api_key)
        if data:
            for paper in data.get("data", []):
                cand = _ss_paper_to_candidate(paper)
                if cand:
                    candidates.append(cand)

    # If all strategies failed and we have a DOI, try a DOI-based title search
    # (Semantic Scholar doesn't have a direct DOI lookup, but we can try)
    if not candidates and doi and has_title and title:
        query = f'"{title}"'
        params = {
            "query": query,
            "limit": str(max_results),
            "fields": SEMANTIC_SCHOLAR_FIELDS,
        }
        qs = urllib.parse.urlencode(params)
        url = SEMANTIC_SCHOLAR_SEARCH_URL + "?" + qs
        data = _ss_http_get_json(url, api_key)
        if data:
            for paper in data.get("data", []):
                cand = _ss_paper_to_candidate(paper)
                if cand:
                    ext_doi = (paper.get("externalIds") or {}).get("DOI", "")
                    if ext_doi and doi.lower() == ext_doi.lower():
                        # DOI exact match — prepend
                        candidates.insert(0, cand)
                    else:
                        candidates.append(cand)

    return candidates[:max_results]


def _ss_paper_to_candidate(paper):
    """Convert a Semantic Scholar paper dict to a candidate dict."""
    title = paper.get("title")

    authors = []
    for a in paper.get("authors", []):
        name = a.get("name", "")
        if name:
            authors.append(name)

    year = paper.get("year")

    journal_info = paper.get("journal")
    journal = None
    volume = None
    pages = None
    if journal_info:
        journal = journal_info.get("name")
        volume = journal_info.get("volume")
        pages = journal_info.get("pages")

    external_ids = paper.get("externalIds") or {}
    doi = external_ids.get("DOI")
    pmid = external_ids.get("PubMed")

    paper_id = paper.get("paperId", "")
    url = paper.get("url") or (
        f"https://api.semanticscholar.org/paper/{paper_id}"
        if paper_id else None
    )

    pub_types = paper.get("publicationTypes", [])
    pub_type = pub_types[0] if pub_types else None

    return {
        "candidate_id": f"semantic_scholar:{paper_id}" if paper_id else "semantic_scholar:unknown",
        "source": "semantic_scholar",
        "title": title,
        "authors": authors,
        "year": year,
        "journal": journal,
        "publisher": None,
        "volume": volume,
        "issue": None,
        "pages": pages,
        "doi": doi,
        "isbn": None,
        "url": url,
        "type": pub_type,
        "score": None,
        "confidence": None,
        "match_reasons": [],
    }


# ── CiNii Research search ────────────────────────────────────────────────

CINII_OPENSEARCH_URL = "https://cir.nii.ac.jp/opensearch/v2/articles"


def _search_cinii_candidates(ref, llm_item, field_keys, max_results, appid):
    """Search CiNii Research for a single reference.

    Uses the CiNii Research OpenSearch API.  The appid is mandatory.
    """
    if not appid or not appid.strip():
        return []

    # Build query: priority goes title + author + year → title only
    title = (_get_field_value(ref, llm_item, "title") or
             _get_field_value(ref, llm_item, "book_title"))
    author = _get_field_value(ref, llm_item, "author")
    year = _get_field_value(ref, llm_item, "year")

    query_parts = []
    if title:
        query_parts.append(title)
    if author:
        query_parts.append(author)
    if year:
        query_parts.append(year)

    query = " ".join(query_parts[:3])  # max 3 parts
    if not query.strip():
        return []

    # Search CiNii Research
    params = urllib.parse.urlencode({
        "appid": appid,
        "format": "json",
        "q": query,
        "count": max_results,
    })
    url = f"{CINII_OPENSEARCH_URL}?{params}"

    candidates = []
    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent",
                       "PeerReviewAssistant/0.1 (mailto:dev@example.com)")
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8")
        data = json.loads(body)
    except Exception:
        return []

    # Parse @graph items
    graph = data.get("@graph", [])
    for item in graph:
        if not isinstance(item, dict):
            continue
        item_type = item.get("@type", "")
        if isinstance(item_type, list):
            types = item_type
        else:
            types = [item_type]
        is_resource = any(
            "bibliographicResource" in t for t in types
        )
        if not is_resource:
            continue

        # Extract fields (same logic as db_cinii._extract_cinii_fields)
        c_title = _pick_first(item.get("dc:title"))
        c_authors_raw = item.get("dc:creator", [])
        if isinstance(c_authors_raw, list):
            c_authors = [a for a in c_authors_raw if isinstance(a, str) and a.strip()]
        elif isinstance(c_authors_raw, str):
            c_authors = [c_authors_raw.strip()] if c_authors_raw.strip() else []
        else:
            c_authors = []

        date_str = (
            _pick_first(item.get("prism:publicationDate"))
            or _pick_first(item.get("dc:date"))
            or ""
        )
        c_year = _parse_year(date_str)

        c_journal = (
            _pick_first(item.get("prism:publicationName"))
            or _pick_first(item.get("dc:source"))
        )
        c_doi = _pick_first(item.get("dc:identifier"))
        if c_doi and not c_doi.startswith("10."):
            c_doi = None

        crid = None
        item_id = item.get("@id", "")
        if "crid/" in item_id:
            crid = item_id.rsplit("crid/", 1)[-1].rstrip(".json").strip("#")

        candidate_id = f"cinii:{crid}" if crid else f"cinii:{c_title}"

        # Build match reasons
        match_reasons = []
        if c_title and title:
            # Simple title match check
            t1 = (c_title or "").lower().strip()
            t2 = (title or "").lower().strip()
            if t1 == t2:
                match_reasons.append("title_exact")
            elif t1 in t2 or t2 in t1:
                match_reasons.append("title_contains")
            else:
                # Jaccard check
                w1 = set(t1.split())
                w2 = set(t2.split())
                if w1 and w2:
                    jac = len(w1 & w2) / len(w1 | w2)
                    if jac >= 0.7:
                        match_reasons.append("title_fuzzy")
        if author and c_authors:
            au = author.lower()
            for ca in c_authors:
                if au in ca.lower() or ca.lower() in au:
                    match_reasons.append("author_match")
                    break
        if year and c_year and str(year) == str(c_year):
            match_reasons.append("year_match")

        candidates.append({
            "candidate_id": candidate_id,
            "source": "cinii",
            "title": c_title,
            "authors": c_authors,
            "year": c_year,
            "journal": c_journal,
            "publisher": None,
            "volume": _pick_first(item.get("prism:volume")),
            "issue": _pick_first(item.get("prism:number")),
            "pages": _pick_first(item.get("prism:startingPage")),
            "doi": c_doi,
            "isbn": None,
            "url": f"https://cir.nii.ac.jp/crid/{crid}" if crid else None,
            "type": _pick_first(item.get("dc:type")) or "article",
            "score": None,
            "confidence": "high" if len(match_reasons) >= 2 else "medium" if match_reasons else "low",
            "match_reasons": match_reasons,
        })

    return candidates[:max_results]


def _pick_first(val):
    """If val is a list, return first element; otherwise return val."""
    if isinstance(val, list):
        return val[0] if val else None
    return val


def _parse_year(date_str):
    """Extract a 4-digit year from a date string."""
    if not date_str:
        return None
    match = _re.search(r"(\d{4})", str(date_str))
    if match:
        year = int(match.group(1))
        if 1800 <= year <= 2100:
            return year
    return None


# ── Public entry point ───────────────────────────────────────────────────

def search_manual(project_dir, reference_id, source, fields_str, max_results=5,
                  api_key=None):
    """Search a single reference and return candidates.

    Args:
        project_dir: Path to project working folder.
        reference_id: e.g. "R001"
        source: "crossref" | "pubmed" | "google_books" | "semantic_scholar"
        fields_str: Comma-separated field keys
        max_results: Max candidates to return
        api_key: Google Books API key (optional, for google_books source)

    Returns:
        list of candidate dicts
    """
    field_keys = [f.strip() for f in fields_str.split(",") if f.strip()]

    ref = _load_ref(project_dir, reference_id)
    if not ref:
        raise ValueError(
            f"Reference {reference_id} not found in references_split.json"
        )

    llm_item = _load_llm_item(project_dir, reference_id)

    if source == "crossref":
        return _search_crossref_candidates(ref, llm_item, field_keys, max_results)
    elif source == "pubmed":
        return _search_pubmed_candidates(ref, llm_item, field_keys, max_results)
    elif source == "google_books":
        return _search_gb_candidates(ref, llm_item, field_keys, max_results,
                                     api_key)
    elif source == "semantic_scholar":
        return _search_semantic_scholar_candidates(
            ref, llm_item, field_keys, max_results, api_key
        )
    elif source == "cinii":
        return _search_cinii_candidates(ref, llm_item, field_keys, max_results,
                                        api_key)
    else:
        raise ValueError(f"Unknown source: {source}")
