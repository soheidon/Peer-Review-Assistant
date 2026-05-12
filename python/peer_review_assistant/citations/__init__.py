"""Citation reference splitting and in-text citation extraction."""

import re


# ── Reference splitting ──────────────────────────────────────────────

_REF_LINE_RE = re.compile(
    r"^(.+?)\s*\((\d{4}[a-z]?)\)\.?\s*(.*)$"
)

_VOL_ISSUE_PAGES_RE = re.compile(
    r"(\d+)\s*\((\d+)\)\s*,?\s*(\d+[–\-]\d+|\d+)"
)

# Fallback for journal references that use "volume, pages" format
# WITHOUT an issue number in parentheses (e.g. "Ann Zool Fenn 38, 287-296").
# Anchored at end-of-string to avoid false positives with years or other numbers.
_VOL_PAGES_NO_ISSUE_RE = re.compile(
    r"(\d+)\s*[,，]\s*(\d+[–\-–]\d+|\d+)\.?\s*$"
)

_DOI_CLEAN_RE = re.compile(r"[.,;)\]\)\'\"»]+$")

_DOI_RE = re.compile(r"\b(10\.\d{4,}/[^\s]+)")

_PMID_RE = re.compile(r"\bPMID:?\s*(\d{8})\b", re.IGNORECASE)


def _clean_doi(raw):
    """Strip trailing punctuation that is not part of the DOI.

    DOIs can contain internal periods, slashes, hyphens, parentheses etc.
    but a period/comma/semicolon at the very end of the match is typically
    sentence/reference-list punctuation, not part of the identifier.
    """
    doi = raw.strip()
    # Repeatedly strip trailing characters that are reference-list delimiters
    prev = None
    while prev != doi:
        prev = doi
        doi = _DOI_CLEAN_RE.sub("", doi)
    return doi


def split_references(references_text):
    """Split raw References section text into individual entries.

    Args:
        references_text: Full text of the references section, one entry per line.

    Returns:
        dict with total_references (int), items (list of dict).
    """
    lines = [line.strip() for line in references_text.strip().split("\n")
             if line.strip()]
    items = []

    for i, line in enumerate(lines):
        ref_id = f"R{i + 1:03d}"
        parsed = _parse_reference_line(line)
        items.append({
            "reference_id": ref_id,
            "raw_text": line,
            "parsed": parsed,
            "parse_confidence": _confidence(parsed),
        })

    return {"total_references": len(items), "items": items}


def _parse_reference_line(line):
    """Parse a single reference line into bibliographic fields."""
    result = {
        "authors": [], "year": None, "title": None,
        "journal": None, "volume": None, "issue": None,
        "pages": None, "doi": None, "pmid": None,
    }

    m = _REF_LINE_RE.match(line)
    if not m:
        return result

    authors_str = m.group(1).strip()
    year_str = m.group(2)
    rest = m.group(3).strip()

    result["year"] = int(year_str.rstrip("ab"))
    result["authors"] = _split_authors(authors_str)

    doi_m = _DOI_RE.search(rest)
    if doi_m:
        result["doi"] = _clean_doi(doi_m.group(1))

    pmid_m = _PMID_RE.search(rest)
    if pmid_m:
        result["pmid"] = pmid_m.group(1)

    # Strip DOI/PMID from rest so volume/pages regexes can match correctly.
    # The _VOL_PAGES_NO_ISSUE_RE pattern is anchored at end-of-string ($),
    # so a trailing DOI (e.g. "159, 1133-1145. 10.1176/...") would prevent
    # the match.  We slice the string at the DOI/PMID position before
    # attempting volume/page extraction.
    rest_stripped = rest
    if doi_m:
        rest_stripped = rest[:doi_m.start()].rstrip("., ")
    elif pmid_m:
        rest_stripped = rest[:pmid_m.start()].rstrip("., ")

    vip_m = _VOL_ISSUE_PAGES_RE.search(rest_stripped)
    if vip_m:
        result["volume"] = vip_m.group(1)
        result["issue"] = vip_m.group(2)
        result["pages"] = vip_m.group(3)
        journal_end = vip_m.start()
        journal_part = rest_stripped[:journal_end].rstrip("., ")
        result["journal"] = _extract_journal_name(journal_part)
        title_part = journal_part
        if result["journal"] and result["journal"] in title_part:
            title_part = title_part[:title_part.rindex(result["journal"])].rstrip("., ")
        if title_part:
            result["title"] = title_part
    else:
        # Fallback: "volume, pages" format without issue in parentheses
        vp_m = _VOL_PAGES_NO_ISSUE_RE.search(rest_stripped)
        if vp_m:
            result["volume"] = vp_m.group(1)
            result["pages"] = vp_m.group(2)
            journal_end = vp_m.start()
            journal_part = rest_stripped[:journal_end].rstrip("., ")
            result["journal"] = _extract_journal_name(journal_part)
            title_part = journal_part
            if result["journal"] and result["journal"] in title_part:
                title_part = title_part[:title_part.rindex(result["journal"])].rstrip("., ")
            if title_part:
                result["title"] = title_part
        else:
            result["title"] = rest_stripped.rstrip(".")

    return result


def _split_authors(authors_str):
    """Split authors string into a list of individual author names."""
    authors_str = re.sub(
        r",?\s*et\s+al\.?\s*$", "", authors_str.strip(),
        flags=re.IGNORECASE)

    parts = [p.strip() for p in authors_str.split(",") if p.strip()]

    result = []
    for part in parts:
        if re.match(r"^[A-Z]\.?$", part) and result:
            result[-1] = result[-1] + " " + part
        else:
            result.append(part)

    return result


def _extract_journal_name(text):
    """Extract journal name from text that may include a title prefix."""
    text = text.strip("., ")
    if not text:
        return None
    parts = re.split(r"\.\s+(?=[A-Z])", text)
    if len(parts) > 1:
        return parts[-1].strip()
    return text


def _confidence(parsed):
    """Assign parse confidence based on how many fields were extracted."""
    filled = sum(1 for v in parsed.values()
                 if v is not None and v != [] and v != "")
    if filled >= 6:
        return "high"
    if filled >= 3:
        return "medium"
    return "low"


# ── In-text citation extraction ──────────────────────────────────────

_NUMBERED_CITE_RE = re.compile(r"\[(\d+(?:[-,]\d+)*)\]")

_PAREN_CITE_RE = re.compile(r"\(([^()]*?\d{4}[a-z]?)\)")

_AUTHOR_BARE_RE = re.compile(
    r"([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?)\s*\((\d{4}[a-z]?)\)"
)


def _is_author_like(text):
    """Check if text looks like author names rather than other text with a year."""
    if not text or not text[0].isupper():
        return False
    has_author_pattern = (
        "," in text
        or "et al" in text.lower()
        or re.search(r"[A-Z][a-z]+\s+[A-Z][a-z]+", text)
    )
    return has_author_pattern


def _looks_like_statistic(text):
    """Heuristic to filter statistical notation from citation candidates."""
    stat_patterns = [
        r"[FNtT]\s*\(\d+",
        r"\b[MS]D\s*=",
        r"\bp\s*[<>=]",
        r"\bn\s*=",
        r"\bdf\s*=",
        r"^\d+[\.,]\d+$",
        r"^\d+$",
    ]
    return any(re.search(p, text, re.IGNORECASE) for p in stat_patterns)


def extract_in_text_citations(paragraph_sentence_map, section_map):
    """Scan body sections for citation markers.

    Args:
        paragraph_sentence_map: dict from paragraph_sentence_map.json
        section_map: dict from section_map.json

    Returns:
        dict with total_citations (int), items (list of dict).
    """
    references_range = _find_references_range(section_map)
    paragraphs = paragraph_sentence_map["paragraphs"]
    items = []
    citation_counter = 0

    for para in paragraphs:
        p_idx = para["index"]

        if references_range and references_range[0] <= p_idx <= references_range[1]:
            continue

        style = para.get("style") or ""
        if style != "Normal":
            continue

        full_text = para.get("text", "")
        section_name = _find_section_for_paragraph(p_idx, section_map)

        # Numbered citations
        for nm in _NUMBERED_CITE_RE.finditer(full_text):
            citation_counter += 1
            marker_text = nm.group(0)
            sent_num = _find_sentence_for_position(para, nm.start())
            items.append({
                "citation_id": f"C{citation_counter:03d}",
                "marker_text": marker_text,
                "format": "numbered",
                "section": section_name,
                "paragraph_number": para["paragraph_number"],
                "sentence_number": sent_num,
            })

        # Author-year citations in parentheses
        for pm in _PAREN_CITE_RE.finditer(full_text):
            inner = pm.group(1).strip()
            if not _is_author_like(inner):
                continue
            if _looks_like_statistic(inner):
                continue
            citation_counter += 1
            sent_num = _find_sentence_for_position(para, pm.start())
            items.append({
                "citation_id": f"C{citation_counter:03d}",
                "marker_text": f"({inner})",
                "format": "author_year",
                "section": section_name,
                "paragraph_number": para["paragraph_number"],
                "sentence_number": sent_num,
            })

        # Author (Year) bare style
        for bm in _AUTHOR_BARE_RE.finditer(full_text):
            marker_text = bm.group(0)
            before = full_text[:bm.start()]
            open_parens = before.count("(") - before.count(")")
            if open_parens > 0:
                continue
            citation_counter += 1
            sent_num = _find_sentence_for_position(para, bm.start())
            items.append({
                "citation_id": f"C{citation_counter:03d}",
                "marker_text": marker_text,
                "format": "author_year",
                "section": section_name,
                "paragraph_number": para["paragraph_number"],
                "sentence_number": sent_num,
            })

    return {"total_citations": len(items), "items": items}


def _find_references_range(section_map):
    """Find the paragraph index range of the references section."""
    for sec in section_map.get("sections", []):
        if sec.get("name") == "references":
            return (sec["start_paragraph"], sec["end_paragraph"])
    return None


def _find_section_for_paragraph(para_index, section_map):
    """Find which section a paragraph belongs to."""
    for sec in section_map.get("sections", []):
        if sec["start_paragraph"] <= para_index <= sec["end_paragraph"]:
            return sec["name"]
    return "unknown"


def _find_sentence_for_position(para, char_pos):
    """Determine which sentence number a character position falls in."""
    sentences = para.get("sentences", [])
    offset = 0
    for s in sentences:
        sent_len = len(s["text"])
        if char_pos < offset + sent_len + 1:
            return s["sentence_number"]
        offset += sent_len
    if sentences:
        return sentences[-1]["sentence_number"]
    return 1


# ── Citation contexts ─────────────────────────────────────────────────

def build_citation_contexts(references_split, in_text_citations,
                            paragraph_sentence_map, section_map):
    """Cross-reference references with in-text citations, building contexts.

    Args:
        references_split: output of split_references()
        in_text_citations: output of extract_in_text_citations()
        paragraph_sentence_map: dict from paragraph_sentence_map.json
        section_map: dict from section_map.json

    Returns:
        dict with items (list of {reference_id, in_text_citations[], reference_text}).
    """
    result_items = []
    for ref in references_split["items"]:
        ref_citations = _match_citations(ref, in_text_citations["items"])
        contexts = []
        for cit in ref_citations:
            ctx = _build_single_context(cit, paragraph_sentence_map)
            if ctx:
                contexts.append(ctx)

        result_items.append({
            "reference_id": ref["reference_id"],
            "in_text_citations": contexts,
            "reference_text": ref["raw_text"],
        })

    return {"items": result_items}


def _match_citations(ref, all_citations):
    """Match a reference to its in-text citations."""
    parsed = ref.get("parsed", {})
    ref_year = parsed.get("year")
    ref_authors = parsed.get("authors", [])

    matched = []
    for cit in all_citations:
        if cit["format"] == "numbered":
            num = _extract_citation_number(cit["marker_text"])
            if num is not None and ref["reference_id"] == f"R{num:03d}":
                matched.append(cit)
        else:
            if _author_year_matches(cit["marker_text"], ref_authors, ref_year):
                matched.append(cit)

    return matched


def _extract_citation_number(marker_text):
    """Extract the first number from a numbered citation marker."""
    m = re.search(r"(\d+)", marker_text)
    return int(m.group(1)) if m else None


def _author_year_matches(marker_text, ref_authors, ref_year):
    """Check if an author-year citation marker matches reference details."""
    year_m = re.search(r"(\d{4})", marker_text)
    if not year_m:
        return False
    marker_year = int(year_m.group(1))
    if ref_year and marker_year != ref_year:
        return False

    marker_lower = marker_text.lower()
    for author in ref_authors:
        surname = author.split(",")[0].strip().lower()
        surname_first = surname.split()[0] if surname.split() else surname
        if len(surname_first) >= 3 and surname_first in marker_lower:
            return True
        if len(surname) >= 3 and surname in marker_lower:
            return True

    return False


def _build_single_context(cit, paragraph_sentence_map):
    """Build a single citation context entry with surrounding text."""
    p_num = cit["paragraph_number"]
    s_num = cit["sentence_number"]

    para = None
    for p in paragraph_sentence_map["paragraphs"]:
        if p["paragraph_number"] == p_num:
            para = p
            break
    if not para:
        return None

    sentences = para.get("sentences", [])
    if not sentences:
        return None

    s_idx = s_num - 1
    if s_idx < 0 or s_idx >= len(sentences):
        return None

    cited_sentence = sentences[s_idx]["text"]

    context_before = sentences[s_idx - 1]["text"] if s_idx > 0 else ""
    context_after = sentences[s_idx + 1]["text"] if s_idx < len(sentences) - 1 else ""

    full_sentence = cited_sentence
    if context_after and (
        context_after.strip().startswith(",")
        or context_after.strip().startswith("et al")
    ):
        full_sentence = cited_sentence.rstrip() + context_after
        context_after = sentences[s_idx + 2]["text"] if s_idx + 2 < len(sentences) else ""

    return {
        "section": cit.get("section", "unknown"),
        "line_start": None,
        "line_end": None,
        "paragraph_start": p_num,
        "sentence_start": s_num,
        "citation_marker": cit["marker_text"],
        "sentence": full_sentence,
        "context_before": context_before,
        "context_after": context_after,
        "claim_type": None,
        "claim_summary": None,
        "strength_of_claim": None,
    }
