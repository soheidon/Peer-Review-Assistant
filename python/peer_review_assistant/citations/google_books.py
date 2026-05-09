"""Google Books API candidate search for book-like reference entries."""

import html as _html
import json
import re as _re
import time
import urllib.request
import urllib.parse
import urllib.error

GOOGLE_BOOKS_URL = "https://www.googleapis.com/books/v1/volumes"

REQUEST_DELAY = 2.0  # seconds between requests (lower without API key)
MAX_RETRIES = 3
MAX_QUERY_LENGTH = 200  # truncate long titles for query

_TAG_RE = _re.compile(r"<[^>]+>")


def _clean_text(text):
    """Decode HTML entities and strip tags."""
    if not text:
        return ""
    decoded = text
    for _ in range(3):
        prev = decoded
        decoded = _html.unescape(decoded)
        if decoded == prev:
            break
    return " ".join(_TAG_RE.sub("", decoded).split())


# ── Rule-based publisher extraction ──────────────────────────────────────

_PUBLISHER_KEYWORDS = {
    "Press", "University", "Oxford", "Cambridge", "Sage",
    "Routledge", "Springer", "Wiley", "Elsevier", "McGraw-Hill",
    "Pearson", "Guilford", "MIT Press", "Harvard", "Princeton",
    "Chicago", "Palgrave", "Macmillan", "Basic Books", "Westview",
    "Lippincott", "Cengage", "American Psychological Association", "APA",
    "Jossey-Bass", "Brooks/Cole", "Wadsworth", "Pergamon", "Erlbaum",
    "Allyn", "Bacon", "Houghton", "Harcourt", "Norton",
    "Plenum", "Kluwer", "Academic Press", "Prentice", "Free Press",
    "Harper", "Simon", "Random", "Vintage", "Penguin",
    "Viking", "Doubleday", "Knopf", "Scribner", "Farrar",
    "Straus", "Giroux", "Bloomsbury", "Continuum", "Thieme",
    "Mosby", "Saunders", "Churchill", "Livingstone", "Bailliere",
    "Tindall", "Butterworth", "Heinemann", "Jessica Kingsley",
}


def _extract_publisher_from_title(title_text):
    """Extract publisher from trailing parenthetical in a title.

    E.g. "The battered child (University of Chicago Press)"
      → {"publisher": "University of Chicago Press",
         "is_edited": False,
         "cleaned_title": "The battered child"}

    Returns dict or None if no publisher detected.
    """
    if not title_text:
        return None

    title_stripped = title_text.strip()

    # Match trailing parenthetical content: last (...) at end of string
    m = _re.search(r"\s*\(([^)]+)\)\s*$", title_stripped)
    if not m:
        return None

    paren_content = m.group(1).strip()
    if not paren_content:
        return None

    # Check whether the parenthetical looks like publisher info
    has_publisher_kw = any(
        kw.lower() in paren_content.lower()
        for kw in _PUBLISHER_KEYWORDS
    )
    has_eds = bool(_re.search(
        r"\beds?\.\b", paren_content, _re.IGNORECASE
    ))
    has_year = bool(_re.search(r"\b\d{4}\b", paren_content))

    # It's a publisher if it contains a publisher keyword,
    # or editors marker, but NOT if it's just a year (e.g. "(2023)")
    is_publisher = has_publisher_kw or has_eds
    is_pure_year = not has_publisher_kw and not has_eds and has_year

    if not is_publisher or is_pure_year:
        return None

    # Also check for "eds." inside the parenthetical
    is_edited = bool(_re.search(
        r"\beds?\.?\b", paren_content, _re.IGNORECASE
    ))

    # Cleaned title = everything before the parenthetical
    cleaned_title = title_stripped[:m.start()].strip()

    return {
        "publisher": paren_content,
        "is_edited": is_edited,
        "cleaned_title": cleaned_title,
    }


def _rule_extract_book_info(ref, llm_parsed=None):
    """Extract book info from a reference using rules (no LLM required).

    Falls back to inspecting the reference's raw_text and title for
    publisher and editor markers when LLM data is unavailable.

    Args:
        ref: Reference dict from references_split.json.
        llm_parsed: LLM-parsed data (may be None).

    Returns:
        dict with book_title, publisher, is_edited_book, has_isbn.
    """
    ref_parsed = ref.get("parsed", {})
    raw_text = ref.get("raw_text", "")

    result = {
        "book_title": None,
        "publisher": None,
        "is_edited_book": False,
        "has_isbn": False,
    }

    # 1. Book title: prefer LLM, fall back to ref parsed title
    if llm_parsed:
        result["book_title"] = (
            llm_parsed.get("book_title")
            or llm_parsed.get("title")
        )
    if not result["book_title"]:
        result["book_title"] = ref_parsed.get("title") or ""

    # 2. Publisher: LLM first, then rule-based extraction from title
    if llm_parsed:
        result["publisher"] = llm_parsed.get("publisher")

    # Try extracting publisher from the title
    title_for_extract = ref_parsed.get("title") or raw_text
    extracted = _extract_publisher_from_title(title_for_extract)
    if extracted:
        if not result["publisher"]:
            result["publisher"] = extracted["publisher"]
        # Always prefer cleaned title when publisher was embedded
        cleaned = extracted.get("cleaned_title", "")
        if cleaned:
            result["book_title"] = cleaned
        if extracted.get("is_edited"):
            result["is_edited_book"] = True

    # 3. Edited book markers in raw text and title
    eds_patterns = [
        r"\beds?\.?\b", r"\beditors?\b", r"\bedited\s+by\b",
        r"\bherausgegeben\b", r"\bHg\.\b",
        r"\(Eds?\.?\)", r"\(eds?\.?\)",
    ]
    for pat in eds_patterns:
        if _re.search(pat, raw_text, _re.IGNORECASE):
            result["is_edited_book"] = True
            break
    if not result["is_edited_book"] and extracted:
        result["is_edited_book"] = extracted.get("is_edited", False)

    # 4. ISBN check
    if llm_parsed and llm_parsed.get("isbn"):
        result["has_isbn"] = True
    if not result["has_isbn"]:
        isbn_m = _re.search(
            r"\b\d{9}[\dXx]\b|\b\d{13}\b", raw_text
        )
        if isbn_m:
            result["has_isbn"] = True

    return result

_BOOK_PUBLICATION_TYPES = {
    "book", "edited_book", "book_chapter", "manual", "report",
}


def _is_book_candidate(ref, llm_item):
    """Check if a reference should be searched on Google Books.

    A reference is a book candidate when it:
      - Has book-like characteristics (LLM flags, publication type,
        book_title, publisher) OR rule-based book markers
      - Is NOT already matched by Crossref or PubMed
      - Has no DOI or has a DOI that returned 404

    Uses rule-based fallback when llm_item is None or LLM parse failed.

    Returns True if the reference should be searched.
    """
    llm_parsed = llm_item.get("parsed") or {} if llm_item else {}
    llm_flags = llm_item.get("flags") or {} if llm_item else {}

    # LLM-based check
    if llm_item is not None:
        is_book_like = (
            llm_flags.get("likely_book") is True
            or llm_parsed.get("publication_type") in _BOOK_PUBLICATION_TYPES
            or bool(llm_parsed.get("book_title"))
            or bool(llm_parsed.get("publisher"))
        )
        if is_book_like:
            title = llm_parsed.get("book_title") or llm_parsed.get("title") or ""
            if title.strip():
                return True

    # Rule-based fallback: check for book markers without LLM
    # 1. DOI presence strongly suggests a journal article, not a book
    ref_parsed = ref.get("parsed", {})
    if ref_parsed.get("doi"):
        return False

    # 2. Look for book-like signals in the reference
    rule_info = _rule_extract_book_info(ref, llm_parsed if llm_item else None)

    has_publisher = bool(rule_info.get("publisher"))
    has_isbn = rule_info.get("has_isbn", False)
    is_edited = rule_info.get("is_edited_book", False)
    book_title = rule_info.get("book_title") or ""

    # Must have a publisher or ISBN or editors marker to be a book candidate
    if not (has_publisher or has_isbn or is_edited):
        return False

    # Must have a searchable title
    if not book_title.strip():
        return False

    return True


# ── Query building ──────────────────────────────────────────────────────

def _first_author_surname(llm_parsed):
    """Extract surname of the first author from LLM-parsed data.

    Prefers LLM-parsed authors list; falls back to regex-parsed.
    """
    authors = llm_parsed.get("authors", [])
    if not authors:
        return ""
    first = authors[0].strip()
    # "Smith, J." → "Smith"
    # "Smith John" → "Smith"
    parts = first.replace(",", " ").split()
    for part in parts:
        if _re.match(r"^[A-Z][a-z]{2,}", part):
            return part
    return parts[0] if parts else ""


def _truncate_for_query(text, max_len=MAX_QUERY_LENGTH):
    """Truncate long text for Google Books query (API has URL length limits)."""
    if not text:
        return ""
    text = text.strip()
    if len(text) <= max_len:
        return text
    # Try to truncate at the last word boundary before max_len
    truncated = text[:max_len]
    last_space = truncated.rfind(" ")
    if last_space > max_len // 2:
        return truncated[:last_space]
    return truncated


def _build_queries(ref_parsed, llm_parsed):
    """Build prioritized search queries for Google Books.

    Returns list of (query_string, query_type) tuples in priority order.
    Stops being built after higher-priority queries — the caller stops
    searching after finding results.
    """
    queries = []

    book_title = llm_parsed.get("book_title") or ""
    title = llm_parsed.get("title") or ref_parsed.get("title") or ""
    publisher = llm_parsed.get("publisher") or ""
    isbn = llm_parsed.get("isbn") or ""
    first_author = _first_author_surname(llm_parsed)

    # Priority 1: ISBN
    if isbn:
        queries.append((f"isbn:{isbn}", "isbn"))

    # Priority 2: book_title + first author
    if book_title and first_author:
        bt = _truncate_for_query(book_title)
        queries.append((f'intitle:"{bt}" inauthor:"{first_author}"', "book_title_author"))

    # Priority 3: book_title + publisher
    if book_title and publisher:
        bt = _truncate_for_query(book_title)
        pub = _truncate_for_query(publisher)
        queries.append((f'intitle:"{bt}" inpublisher:"{pub}"', "book_title_publisher"))

    # Priority 4: title + first author
    if title and first_author:
        t = _truncate_for_query(title)
        queries.append((f'intitle:"{t}" inauthor:"{first_author}"', "title_author"))

    # Priority 5: book_title only
    if book_title:
        bt = _truncate_for_query(book_title)
        queries.append((f'intitle:"{bt}"', "book_title"))

    # Priority 6: title only (fallback)
    if title:
        t = _truncate_for_query(title)
        queries.append((f'intitle:"{t}"', "title"))

    # Priority 7: free-text search (no field specifiers, more lenient)
    # Splits title into individual intitle: terms to handle & vs "and" etc.
    if book_title and first_author:
        # Use the two most significant words from the title
        words = [w for w in book_title.split() if len(w) > 3]
        if len(words) >= 2:
            terms = " ".join(f'intitle:{w}' for w in words[:4])
            queries.append((f'{terms} inauthor:"{first_author}"', "free_text_title_author"))
    elif book_title:
        words = [w for w in book_title.split() if len(w) > 3]
        if len(words) >= 2:
            terms = " ".join(f'intitle:{w}' for w in words[:4])
            queries.append((f'{terms}', "free_text_title"))
    elif title and first_author:
        words = [w for w in title.split() if len(w) > 3]
        if len(words) >= 2:
            terms = " ".join(f'intitle:{w}' for w in words[:4])
            queries.append((f'{terms} inauthor:"{first_author}"', "free_text_title_author"))

    return queries


# ── Google Books API ────────────────────────────────────────────────────

def _http_get(url, api_key=None):
    """Perform HTTP GET to Google Books API with retry/backoff.

    Args:
        url: Full URL to fetch (without API key appended yet).
        api_key: Optional API key appended as &key= param.

    Returns:
        (status_code, body_str) tuple, or (None, None) on failure.
    """
    full_url = url
    if api_key:
        full_url = url + "&key=" + api_key

    for attempt in range(MAX_RETRIES):
        try:
            req = urllib.request.Request(full_url)
            with urllib.request.urlopen(req, timeout=15) as resp:
                body = resp.read().decode("utf-8")
                return (resp.status, body)
        except urllib.error.HTTPError as e:
            # 429 rate limit — use longer backoff
            if e.code == 429:
                if attempt < MAX_RETRIES - 1:
                    time.sleep(3 ** attempt)  # 1, 3, 9 seconds
                continue
            # 4xx client errors — don't retry
            if 400 <= e.code < 500:
                return (e.code, None)
            # 5xx server errors — retry
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)
        except (urllib.error.URLError, OSError):
            if attempt < MAX_RETRIES - 1:
                time.sleep(2 ** attempt)

    return (None, None)


def _search_volumes(query, api_key, max_results):
    """Search Google Books volumes with a query string.

    Returns list of raw volume dicts from the API response.
    """
    # Rate limiting: delay before every API call
    time.sleep(REQUEST_DELAY)

    params = {
        "q": query,
        "maxResults": str(max_results),
    }
    query_string = urllib.parse.urlencode(params)
    url = GOOGLE_BOOKS_URL + "?" + query_string

    status_code, body = _http_get(url, api_key)

    if status_code is None or body is None:
        return []

    if status_code != 200:
        return []

    try:
        data = json.loads(body)
        items = data.get("items", [])
        return items if items else []
    except (json.JSONDecodeError, KeyError):
        return []


# ── Field extraction ────────────────────────────────────────────────────

def _extract_volume_fields(volume):
    """Extract standardized fields from a Google Books volume dict.

    Returns dict with google_books_id, title, subtitle, authors,
    publisher, publishedDate, description, industryIdentifiers,
    ISBN_10, ISBN_13, pageCount, categories, language, infoLink,
    previewLink.
    """
    volume_info = volume.get("volumeInfo", {})

    # ID
    google_books_id = volume.get("id", "")

    # Title / subtitle
    title = volume_info.get("title")
    subtitle = volume_info.get("subtitle")

    # Authors
    authors = volume_info.get("authors", [])

    # Publisher
    publisher = volume_info.get("publisher")

    # Published date
    published_date = volume_info.get("publishedDate")

    # Description (truncate for storage)
    description = volume_info.get("description")
    if description and len(description) > 500:
        description = description[:500] + "..."

    # Industry identifiers → ISBNs
    identifiers = volume_info.get("industryIdentifiers", [])
    isbn_10 = None
    isbn_13 = None
    for ident in identifiers:
        id_type = ident.get("type", "")
        value = ident.get("identifier", "")
        if id_type == "ISBN_10":
            isbn_10 = value
        elif id_type == "ISBN_13":
            isbn_13 = value

    # Page count
    page_count = volume_info.get("pageCount")

    # Categories
    categories = volume_info.get("categories", [])

    # Language
    language = volume_info.get("language")

    # Links
    info_link = volume_info.get("infoLink")
    preview_link = volume_info.get("previewLink")

    return {
        "google_books_id": google_books_id,
        "title": title,
        "subtitle": subtitle,
        "authors": authors,
        "publisher": publisher,
        "publishedDate": published_date,
        "description": description,
        "industryIdentifiers": identifiers,
        "isbn_10": isbn_10,
        "isbn_13": isbn_13,
        "pageCount": page_count,
        "categories": categories,
        "language": language,
        "infoLink": info_link,
        "previewLink": preview_link,
    }


# ── Scoring ─────────────────────────────────────────────────────────────

def _normalize_for_compare(text):
    """Normalize text for comparison: lowercase, strip punctuation."""
    if not text:
        return ""
    text = text.lower().strip()
    result = []
    for ch in text:
        if ch.isalnum() or ch.isspace():
            result.append(ch)
    return " ".join("".join(result).split())


def _jaccard_words(text1, text2):
    """Compute Jaccard similarity of word sets."""
    words1 = set(text1.split())
    words2 = set(text2.split())
    if not words1 and not words2:
        return 1.0
    if not words1 or not words2:
        return 0.0
    return len(words1 & words2) / len(words1 | words2)


def _score_candidate(candidate, ref_parsed, llm_parsed):
    """Score a single Google Books candidate against a reference.

    Returns dict with score (0-1), confidence (high/medium/low),
    and match_reasons list.
    """
    score = 0.0
    reasons = []

    cand_title = candidate.get("title") or ""
    cand_authors = candidate.get("authors") or []
    cand_publisher = candidate.get("publisher") or ""
    cand_year_str = candidate.get("publishedDate") or ""
    cand_isbn10 = candidate.get("isbn_10") or ""
    cand_isbn13 = candidate.get("isbn_13") or ""

    # Reference fields
    ref_title = llm_parsed.get("book_title") or llm_parsed.get("title") or ref_parsed.get("title") or ""
    ref_publisher = llm_parsed.get("publisher") or ""
    ref_year = llm_parsed.get("year") or ref_parsed.get("year")
    ref_isbn = llm_parsed.get("isbn") or ""
    ref_first_author = _first_author_surname(llm_parsed).lower()

    # 1. Title comparison (weight 0.35)
    title_score = 0.0
    if cand_title and ref_title:
        nc = _normalize_for_compare(cand_title)
        nr = _normalize_for_compare(ref_title)
        if nc == nr:
            title_score = 1.0
            reasons.append("title_exact")
        elif nc in nr or nr in nc:
            title_score = 0.7
            reasons.append("title_contains")
        else:
            jac = _jaccard_words(nc, nr)
            if jac >= 0.8:
                title_score = 0.7
                reasons.append("title_fuzzy")
            elif jac >= 0.5:
                title_score = 0.4
                reasons.append("title_partial")
    score += title_score * 0.35

    # 2. First author comparison (weight 0.25)
    author_score = 0.0
    if ref_first_author and cand_authors:
        cand_first = cand_authors[0].lower() if cand_authors else ""
        # Extract surname from candidate's first author
        cand_surname_parts = cand_first.replace(",", " ").split()
        cand_surname = cand_surname_parts[-1] if cand_surname_parts else ""
        # Also try first part (sometimes "Smith, John" format)
        cand_first_part = cand_surname_parts[0] if cand_surname_parts else ""

        if ref_first_author == cand_surname or ref_first_author == cand_first_part:
            author_score = 1.0
            reasons.append("author_exact")
        elif cand_surname and (ref_first_author in cand_surname or cand_surname in ref_first_author):
            author_score = 0.7
            reasons.append("author_exact")
        elif cand_first_part and (ref_first_author in cand_first_part or cand_first_part in ref_first_author):
            author_score = 0.7
            reasons.append("author_exact")
        else:
            # Check if any candidate author matches
            for ca in cand_authors:
                ca_lower = ca.lower()
                if ref_first_author in ca_lower:
                    author_score = 0.5
                    reasons.append("author_partial")
                    break
    score += author_score * 0.25

    # 3. Year comparison (weight 0.20)
    year_score = 0.0
    cand_year = None
    year_diff = None
    if cand_year_str:
        year_m = _re.search(r"(\d{4})", cand_year_str)
        if year_m:
            cand_year = int(year_m.group(1))

    if ref_year is not None and cand_year is not None:
        try:
            ry = int(ref_year)
            diff = abs(ry - cand_year)
            year_diff = diff
            if diff == 0:
                year_score = 1.0
                reasons.append("year_match")
            elif diff == 1:
                year_score = 0.7
                reasons.append("year_near")
            elif diff <= 2:
                year_score = 0.4
                reasons.append("year_near")
            elif diff <= 5:
                year_score = 0.2
            else:
                # Large year difference: possible reprint/edition
                year_score = 0.05
                reasons.append("year_mismatch")
                reasons.append("year_near")  # keep compatibility
        except (ValueError, TypeError):
            pass
    score += year_score * 0.20

    # 4. Publisher comparison (weight 0.15)
    pub_score = 0.0
    if ref_publisher and cand_publisher:
        np_ref = _normalize_for_compare(ref_publisher)
        np_cand = _normalize_for_compare(cand_publisher)
        if np_ref == np_cand:
            pub_score = 1.0
            reasons.append("publisher_exact")
        elif np_ref in np_cand or np_cand in np_ref:
            pub_score = 0.7
            reasons.append("publisher_partial")
    score += pub_score * 0.15

    # 5. ISBN comparison (weight 0.05)
    isbn_score = 0.0
    if ref_isbn and (cand_isbn10 or cand_isbn13):
        ref_isbn_clean = ref_isbn.replace("-", "").replace(" ", "")
        if (cand_isbn10 and ref_isbn_clean == cand_isbn10.replace("-", "").replace(" ", "")) or \
           (cand_isbn13 and ref_isbn_clean == cand_isbn13.replace("-", "").replace(" ", "")):
            isbn_score = 1.0
            reasons.append("isbn_match")
    score += isbn_score * 0.05

    # Determine confidence
    if score >= 0.85 or (isbn_score > 0 and score >= 0.5):
        confidence = "high"
    elif score >= 0.60:
        confidence = "medium"
    elif score >= 0.30:
        confidence = "low"
    else:
        confidence = None  # will be filtered out

    return {
        "score": round(score, 3),
        "confidence": confidence,
        "match_reasons": reasons,
        "ref_year": ref_year,
        "cand_year": cand_year,
        "year_diff": year_diff,
    }


def _score_candidates(candidates, ref, llm_parsed):
    """Score all candidates for a reference and return sorted list.

    Filters out candidates below threshold and publisher-only matches.
    """
    ref_parsed = ref.get("parsed", {})
    scored = []

    for c in candidates:
        scoring = _score_candidate(c, ref_parsed, llm_parsed)
        if scoring["confidence"] is None:
            continue

        # Filter publisher-only matches
        reasons = scoring["match_reasons"]
        has_title_or_author = any(
            r in reasons for r in [
                "title_exact", "title_contains", "title_fuzzy", "title_partial",
                "author_exact", "author_partial",
            ]
        )
        has_isbn = "isbn_match" in reasons
        if not has_title_or_author and not has_isbn:
            continue

        entry = dict(c)
        entry.update(scoring)
        scored.append(entry)

    # Sort by score descending
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored


# ── Public entry point ──────────────────────────────────────────────────

def search_google_books(references_split, llm_repairs=None, api_key=None,
                        max_results=5):
    """Search Google Books for book-like references.

    Args:
        references_split: dict from references_split.json.
        llm_repairs: dict from references_repaired_llm.json (optional).
        api_key: Google Books API key (optional).
        max_results: Max candidates per reference.

    Returns:
        dict with total_searched, candidate_count, no_candidate_count, items.
    """
    # Build LLM lookup map
    llm_map = {}
    if llm_repairs:
        for item in llm_repairs.get("items", []):
            llm_map[item["reference_id"]] = item

    # Select book candidates
    ref_items = references_split.get("items", [])
    book_refs = []
    for ref in ref_items:
        rid = ref["reference_id"]
        llm_item = llm_map.get(rid)
        if _is_book_candidate(ref, llm_item):
            book_refs.append((ref, llm_item))

    if not book_refs:
        return {
            "total_searched": 0,
            "candidate_count": 0,
            "no_candidate_count": 0,
            "items": [],
        }

    # Search each book reference
    results = []
    candidate_count = 0
    no_candidate_count = 0

    for i, (ref, llm_item) in enumerate(book_refs):
        ref_id = ref["reference_id"]
        ref_parsed = ref.get("parsed", {})
        llm_parsed = llm_item.get("parsed") or {} if llm_item else {}

        # Augment with rule-extracted book info
        rule_info = _rule_extract_book_info(
            ref, llm_parsed if llm_item else None
        )
        if rule_info.get("book_title") and not llm_parsed.get("book_title"):
            llm_parsed["book_title"] = rule_info["book_title"]
        if rule_info.get("publisher") and not llm_parsed.get("publisher"):
            llm_parsed["publisher"] = rule_info["publisher"]
        if rule_info.get("is_edited_book") and not llm_parsed.get("publication_type"):
            llm_parsed["publication_type"] = "edited_book"

        # Build queries and search
        queries = _build_queries(ref_parsed, llm_parsed)
        all_volumes = []
        query_used = None
        query_type_used = None
        total_found = 0

        for qs, qtype in queries:
            volumes = _search_volumes(qs, api_key, max_results)
            if volumes:
                query_used = qs
                query_type_used = qtype
                total_found = len(volumes)
                # Deduplicate by google_books_id
                seen_ids = set()
                for vol in all_volumes:
                    seen_ids.add(vol.get("id", ""))
                for vol in volumes:
                    vid = vol.get("id", "")
                    if vid and vid not in seen_ids:
                        all_volumes.append(vol)
                        seen_ids.add(vid)
                break  # stop after first query that returns results

        if not all_volumes:
            no_candidate_count += 1
            results.append({
                "reference_id": ref_id,
                "query_used": query_used,
                "query_type": query_type_used,
                "total_results_found": 0,
                "candidates": [],
            })
            continue

        # Extract fields from volumes
        extracted = [_extract_volume_fields(vol) for vol in all_volumes]

        # Deduplicate extracted candidates by google_books_id
        seen = set()
        unique = []
        for c in extracted:
            gbid = c.get("google_books_id", "")
            if gbid and gbid not in seen:
                unique.append(c)
                seen.add(gbid)

        # Score and rank
        scored = _score_candidates(unique, ref, llm_parsed)
        top_n = scored[:max_results]

        if top_n:
            candidate_count += 1
        else:
            no_candidate_count += 1

        results.append({
            "reference_id": ref_id,
            "query_used": query_used,
            "query_type": query_type_used,
            "total_results_found": total_found,
            "candidates": top_n,
        })

    return {
        "total_searched": len(book_refs),
        "candidate_count": candidate_count,
        "no_candidate_count": no_candidate_count,
        "items": results,
    }
