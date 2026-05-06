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


def split_sections(paragraphs):
    """Split paragraphs into sections based on heading styles.

    Args:
        paragraphs: list of dicts with index, text, style

    Returns:
        dict with section_count, sections (list of {name, heading, paragraphs[]})
    """
    heading_styles = {"Title", "Heading 1", "Heading 2", "Heading 3"}

    sections = []
    current_section = {
        "name": "preamble",
        "heading": None,
        "paragraphs": [],
        "start_paragraph": 0,
    }

    for para in paragraphs:
        style = para.get("style") or ""
        text = para.get("text", "")

        is_heading = style in heading_styles and text.strip()

        if is_heading and current_section["paragraphs"]:
            sections.append(current_section)
            section_name = _classify_section(text) or _safe_section_name(text)
            current_section = {
                "name": section_name,
                "heading": text.strip(),
                "paragraphs": [],
                "start_paragraph": para["index"],
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

    return {
        "section_count": len(sections),
        "sections": sections,
    }


def _safe_section_name(heading_text):
    """Convert heading text to a safe filename fragment."""
    name = heading_text.strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    name = name.strip("_")
    return name or "section"
