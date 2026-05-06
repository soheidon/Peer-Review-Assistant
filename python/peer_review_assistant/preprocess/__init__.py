"""docx/PDF preprocessing."""

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
