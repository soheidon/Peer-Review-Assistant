"""docx/PDF preprocessing."""

import re

from docx import Document


def extract_docx_text(docx_path):
    """Extract full text and paragraph structure from a .docx file.

    Returns:
        dict with keys:
            paragraph_count (int)
            character_count (int)
            paragraphs (list of dicts: index, text, style)
    """
    doc = Document(docx_path)
    paragraphs = []
    char_count = 0

    for i, para in enumerate(doc.paragraphs):
        text = para.text
        char_count += len(text)
        paragraphs.append({
            "index": i,
            "text": text,
            "style": para.style.name if para.style else None,
        })

    return {
        "paragraph_count": len(paragraphs),
        "character_count": char_count,
        "paragraphs": paragraphs,
    }


_SENTENCE_RE = re.compile(
    r"[^。．.！!？?\n]+[。．.！!？?\n]?"
)


def _split_sentences(text):
    """Split text into sentences using punctuation boundaries."""
    if not text.strip():
        return [text]
    sentences = _SENTENCE_RE.findall(text)
    sentences = [s.strip() for s in sentences if s.strip()]
    if not sentences:
        return [text]
    return sentences


def number_paragraphs_and_sentences(paragraphs):
    """Add paragraph numbers and split each paragraph into sentences.

    Args:
        paragraphs: list of dicts with index, text, style

    Returns:
        dict with paragraph_count, sentence_count, paragraphs (with numbering)
    """
    result = []
    total_sentences = 0

    for i, para in enumerate(paragraphs):
        sentences_raw = _split_sentences(para["text"])
        sentences = [
            {"sentence_number": j + 1, "text": s}
            for j, s in enumerate(sentences_raw)
        ]
        total_sentences += len(sentences)
        result.append({
            "index": para["index"],
            "paragraph_number": i + 1,
            "text": para["text"],
            "style": para["style"],
            "sentence_count": len(sentences),
            "sentences": sentences,
        })

    return {
        "paragraph_count": len(result),
        "sentence_count": total_sentences,
        "paragraphs": result,
    }


SECTION_KEYWORDS = {
    "abstract": ["abstract", "概要", "要旨"],
    "introduction": ["introduction", "intro", "はじめに", "序論", "緒言"],
    "aim_objective": ["aim", "objective", "purpose", "目的", "目標"],
    "methods": ["method", "methods", "materials and methods",
                 "experimental", "方法", "実験", "手法"],
    "results": ["results", "result", "結果"],
    "discussion": ["discussion", "考察", "議論"],
    "conclusion": ["conclusion", "conclusions", "summary",
                   "結論", "まとめ", "総括"],
    "references": ["references", "bibliography",
                   "参考文献", "引用文献", "文献"],
    "tables": [],
    "figure_captions": [],
}


def _classify_section(heading_text):
    """Map heading text to a standard section name."""
    lower = heading_text.lower().strip()
    for name, keywords in SECTION_KEYWORDS.items():
        for kw in keywords:
            if kw in lower:
                return name
    return None


def _heading_level(style):
    """Map Word style name to integer heading level."""
    mapping = {"Title": 0, "Heading 1": 1, "Heading 2": 2, "Heading 3": 3}
    return mapping.get(style)


def split_sections(paragraphs):
    """Split paragraphs into sections based on heading styles.

    Tracks heading hierarchy via a stack so sub-sections (e.g. Heading 2
    under Heading 1) receive a parent_section reference.

    Args:
        paragraphs: list of dicts with index, text, style

    Returns:
        dict with section_count, sections (list of {name, heading, level,
        parent_section, start_paragraph, end_paragraph, paragraphs[]})
    """
    heading_styles = {"Title", "Heading 1", "Heading 2", "Heading 3"}
    heading_stack = []

    sections = []
    current_section = {
        "name": "preamble",
        "heading": None,
        "paragraphs": [],
        "start_paragraph": 0,
        "level": None,
        "parent_section": None,
    }

    for para in paragraphs:
        style = para.get("style") or ""
        text = para.get("text", "")

        is_heading = style in heading_styles and text.strip()

        # Split when we encounter a heading AND the current section either
        # has body paragraphs OR already has a heading (prevents swallowing
        # consecutive headings like "Results" H1 → "The Case group" H2).
        should_split = is_heading and (
            current_section["paragraphs"] or current_section.get("heading")
        )

        if should_split:
            sections.append(current_section)

            level = _heading_level(style)
            section_name = _classify_section(text) or _safe_section_name(text)

            # Pop ancestors at same or higher level to find parent
            while heading_stack and heading_stack[-1]["level"] >= level:
                heading_stack.pop()

            parent_section = heading_stack[-1]["name"] if heading_stack else None

            heading_stack.append({
                "level": level,
                "name": section_name,
                "heading": text.strip(),
            })

            current_section = {
                "name": section_name,
                "heading": text.strip(),
                "paragraphs": [],
                "start_paragraph": para["index"],
                "level": level,
                "parent_section": parent_section,
            }
        else:
            current_section["paragraphs"].append(para)
            if current_section["start_paragraph"] is None:
                current_section["start_paragraph"] = para["index"]

    sections.append(current_section)

    # Assign end_paragraph for each section
    for i, sec in enumerate(sections):
        if i < len(sections) - 1:
            sec["end_paragraph"] = sections[i + 1]["start_paragraph"] - 1
        else:
            sec["end_paragraph"] = paragraphs[-1]["index"] if paragraphs else 0

    sections = _resolve_implicit_subheadings(sections)

    return {
        "section_count": len(sections),
        "sections": sections,
    }


def _looks_like_subheading(text, index, all_paragraphs):
    """Check if a Normal-style paragraph looks like a subheading.

    Used to detect headings that were formatted with Normal style instead
    of Heading 2/3 in the original docx.

    Returns True when:
    - Text is short (< 120 chars)
    - Does NOT end with sentence-ending punctuation (. 。 ! ? etc.)
    - Is followed by at least one body-length paragraph
    """
    text = text.strip()
    if not text:
        return False

    # Must be short (subheadings are concise phrases, not full sentences)
    if len(text) > 120:
        return False

    # Must NOT end with sentence terminators
    if text.endswith((".", "。", "．", "!", "！", "?", "？")):
        return False

    # Must be followed by at least one paragraph of body-text length
    if index >= len(all_paragraphs) - 1:
        return False

    # The next paragraph should be substantial body text
    # (not just another short heading-like line)
    next_text = all_paragraphs[index + 1].get("text", "").strip()
    if len(next_text) < 50:
        # Might be back-to-back subheadings — check one more ahead
        if index + 2 < len(all_paragraphs):
            next_next = all_paragraphs[index + 2].get("text", "").strip()
            if len(next_next) < 50:
                return False
        else:
            return False

    # Additional: heading text should look like a noun phrase, not a sentence.
    # Check that it doesn't contain a verb-like pattern mid-text.
    # A sentence typically has a period somewhere in the middle or end.
    # Subheadings rarely do.
    if "." in text[:-1] or "。" in text[:-1]:
        # Has a period mid-text — likely a sentence, not a heading
        return False

    return True


def _resolve_implicit_subheadings(sections):
    """Detect Normal-style subheadings within section bodies and split them.

    When a Word document uses Normal style for subheading paragraphs
    (instead of Heading 2/3), they are merged into the parent section's
    body text. This function detects short, non-sentence paragraphs and
    promotes them to proper child sections.

    The heuristic is applied to any section whose heading maps to a known
    section type (e.g. "Results", "Discussion") and that has level >= 1,
    because these are the sections most likely to contain subheadings.
    """
    heading_styles = {"Title", "Heading 1", "Heading 2", "Heading 3"}
    expanded = []

    # Build a set of section names that already have heading-styled children
    has_styled_children = set()
    for s in sections:
        parent = s.get("parent_section")
        if parent:
            has_styled_children.add(parent)

    for sec in sections:
        paras = sec.get("paragraphs", [])
        parent_level = sec.get("level") or 0
        parent_name = sec["name"]

        # Only apply heuristic to sections with level >= 1 (proper headings)
        # and that either have heading-styled children or match known types
        if parent_level is None or parent_level < 1 or len(paras) < 2:
            expanded.append(sec)
            continue

        # Check if any paragraph is a heading style — if so, the normal
        # heading logic already handled it during the main loop, so skip
        has_heading_paras = any(
            (p.get("style") or "") in heading_styles for p in paras
        )
        if has_heading_paras:
            expanded.append(sec)
            continue

        # Group paragraphs: find implicit subheading boundaries
        groups = []  # list of (heading: str|None, paragraphs: list)
        current_heading = None
        current_paras = []

        for i, para in enumerate(paras):
            text = para.get("text", "")
            style = para.get("style") or ""

            if style in heading_styles:
                # Explicit heading — shouldn't happen here due to check above
                if current_paras or current_heading:
                    groups.append((current_heading, current_paras))
                current_heading = text.strip()
                current_paras = []
            elif _looks_like_subheading(text, i, paras):
                if current_paras or current_heading:
                    groups.append((current_heading, current_paras))
                current_heading = text.strip()
                current_paras = []
            else:
                current_paras.append(para)

        # Flush last group
        if current_paras or current_heading:
            groups.append((current_heading, current_paras))

        if len(groups) <= 1:
            # No implicit subheadings detected
            expanded.append(sec)
            continue

        # Update parent section: keep first group's paragraphs as body
        first_heading, first_paras = groups[0]
        sec["paragraphs"] = first_paras
        expanded.append(sec)

        # Create child sections for each subsequent group
        for heading, sub_paras in groups[1:]:
            if not sub_paras:
                continue
            if heading is None:
                heading = (
                    sub_paras[0].get("text", "")[:50] if sub_paras else "unnamed"
                )

            child_name = _safe_section_name(heading)
            # Avoid name collision: if child_name already exists as a section
            # (e.g. from heading-styled children), add a suffix
            existing_names = {s["name"] for s in expanded}
            base_name = child_name
            counter = 2
            while child_name in existing_names:
                child_name = f"{base_name}_{counter}"
                counter += 1

            child = {
                "name": child_name,
                "heading": heading,
                "paragraphs": sub_paras,
                "start_paragraph": sub_paras[0]["index"],
                "level": parent_level + 1,
                "parent_section": parent_name,
            }
            expanded.append(child)

    # Re-sort by start_paragraph to maintain document order
    expanded.sort(key=lambda s: s.get("start_paragraph", 0))

    # Recompute end_paragraph for all sections
    for i, sec in enumerate(expanded):
        if i < len(expanded) - 1:
            sec["end_paragraph"] = expanded[i + 1]["start_paragraph"] - 1
        else:
            if sec.get("paragraphs"):
                sec["end_paragraph"] = sec["paragraphs"][-1]["index"]
            else:
                # For sections with no paragraphs, use start_paragraph
                pass  # keep existing end_paragraph

    # Recompute section_count
    return expanded


def _safe_section_name(heading_text):
    """Convert heading text to a safe filename fragment."""
    name = heading_text.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    name = name.strip("_")
    return name or "section"


def build_parent_child_map(sections):
    """Compute parent-to-children relationships from a sections list.

    Args:
        sections: list of section dicts from split_sections(), each with
                  name, heading, level, parent_section, start_paragraph,
                  end_paragraph, paragraphs[]

    Returns:
        dict with:
            has_subsections: dict mapping section name -> bool
            children_of: dict mapping parent name -> list of child section dicts
    """
    has_subsections = {s["name"]: False for s in sections}
    children_of = {}

    for s in sections:
        parent = s.get("parent_section")
        if parent:
            has_subsections[parent] = True
            children_of.setdefault(parent, []).append(s)

    return {
        "has_subsections": has_subsections,
        "children_of": children_of,
    }
