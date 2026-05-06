"""Prompt templates for LLM review checks."""


def build_structure_check_messages(manuscript_data, section_texts, section_map):
    """Build system + user messages for the structure check.

    Args:
        manuscript_data: dict from manuscript_full.json (paragraphs with text, style, index)
        section_texts: dict mapping section name (e.g. "abstract") to text content
        section_map: dict from section_map.json (sections with name, heading, level, parent_section)

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are a peer reviewer evaluating the structural quality of an academic manuscript. Your task is to assess:

1. **IMRaD compliance**: Does the manuscript follow a clear Introduction → Methods → Results → Discussion structure? Are sections properly organized?

2. **Abstract consistency**: Does the abstract accurately summarize the background, aim, methods, results, and conclusion? Are there claims in the abstract that are not supported in the body?

3. **Research gap**: Is a clear gap or limitation in existing literature stated in the Introduction? Is the rationale for the study well-justified?

4. **Aim/Objective clarity**: Is the study aim or objective explicitly stated? Is it specific, measurable, and appropriately scoped?

5. **Methods-Results alignment**: Do the Results correspond to the Methods? Are all analyses described in Methods reported in Results? Are there results presented that lack methodological description?

6. **Discussion overreach**: Does the Discussion interpret results appropriately, or does it go beyond what the data support? Are limitations acknowledged?

7. **Conclusion overreach**: Are the conclusions proportionate to the evidence? Is there overstatement of significance, generalizability, or clinical relevance?

For each issue found, provide:
- severity: "major" (affects validity/interpretation) or "minor" (presentation issue)
- A clear description of the issue
- A specific location (section name, paragraph numbers if available)
- A suggested comment for the authors
- A confidence level: "high" (clear-cut), "medium" (reasonable concern), "low" (speculative)

If no issues are found for a category, note this in your summary.

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON. The JSON must follow this exact structure:

{
  "summary": "2-4 sentence overall assessment of the manuscript structure",
  "findings": [
    {
      "severity": "major",
      "category": "Structure",
      "location": {
        "section": "Introduction",
        "paragraph_start": 3,
        "paragraph_end": 5,
        "text_excerpt": "brief quote from the manuscript"
      },
      "issue": "Clear description of the structural problem",
      "suggested_comment": "Author-facing suggestion for improvement",
      "confidence": "high"
    }
  ]
}

Use null for paragraph_start/paragraph_end if you cannot determine specific paragraph numbers. The findings array may be empty if no issues are found."""

    user_parts = ["# Manuscript for Structure Review\n"]

    if section_map and "sections" in section_map:
        user_parts.append("## Section Order\n")
        for sec in section_map["sections"]:
            indent = "  " * (sec.get("level") or 0)
            parent = f" (under {sec['parent_section']})" if sec.get("parent_section") else ""
            user_parts.append(f"{indent}- {sec['name']}: {sec.get('heading', '')}{parent}")
        user_parts.append("")

    if section_texts:
        user_parts.append("## Section Content\n")
        for name in ["abstract", "introduction", "aim_objective", "methods",
                     "results", "discussion", "conclusion"]:
            text = section_texts.get(name, "")
            if text and text.strip():
                user_parts.append(f"### {name}\n")
                user_parts.append(text)
                user_parts.append("")

    if not section_texts and manuscript_data:
        user_parts.append("## Full Manuscript\n")
        for para in manuscript_data.get("paragraphs", []):
            pnum = para.get("paragraph_number", para.get("index", "?"))
            style = para.get("style", "")
            style_note = f" [{style}]" if style else ""
            user_parts.append(f"[P{pnum}{style_note}] {para['text']}")
        user_parts.append("")

    user_message = "\n".join(user_parts)

    if len(user_message) > 120000:
        user_message = user_message[:120000] + "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
