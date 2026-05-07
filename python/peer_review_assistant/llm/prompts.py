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


def build_expression_check_messages(manuscript_data, section_texts, section_map):
    """Build system + user messages for the expression/language check.

    Args:
        manuscript_data: dict from manuscript_full.json
        section_texts: dict mapping section name to text content
        section_map: dict from section_map.json

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are a peer reviewer evaluating the English expression and academic writing quality of a manuscript. Your task is to assess:

1. **Grammar and mechanics**: Are there errors in grammar, article usage (a/an/the), prepositions, verb tense, subject-verb agreement, or punctuation?

2. **Academic style**: Does the writing use appropriate academic register? Are there colloquialisms, contractions, or informal phrasing unsuitable for a scientific paper?

3. **Clarity and precision**: Are sentences clear and unambiguous? Are there vague quantifiers ("very", "quite", "rather") or imprecise terminology that should be tightened?

4. **Overstatement and hedging**: Does the manuscript overstate findings? Are causal claims made where only associations are shown? Is appropriate hedging used ("may", "suggest", "indicate" vs. "prove", "demonstrate", "establish")?

5. **Wordiness and redundancy**: Are there unnecessarily wordy constructions, redundant phrases, or sentences that could be tightened?

6. **Sentence structure**: Are there run-on sentences, fragments, or overly complex constructions that impede readability?

For each issue found, provide:
- severity: "major" (misleading or harms scientific accuracy) or "minor" (stylistic improvement)
- A clear description of the issue
- A specific location (section name, paragraph numbers)
- The exact text excerpt containing the issue
- A suggested revision showing the corrected text
- A confidence level: "high" (clear error), "medium" (reasonable concern), "low" (stylistic preference)

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON. The JSON must follow this exact structure:

{
  "summary": "2-4 sentence overall assessment of the writing quality",
  "findings": [
    {
      "severity": "minor",
      "category": "Expression",
      "location": {
        "section": "Introduction",
        "paragraph_start": 3,
        "paragraph_end": 3,
        "text_excerpt": "the exact problematic text from the manuscript"
      },
      "issue": "Clear description of the expression problem",
      "suggested_comment": "Author-facing suggestion with a specific revised version",
      "confidence": "high"
    }
  ]
}

Use null for paragraph_start/paragraph_end if you cannot determine specific paragraph numbers. The findings array may be empty if no issues are found. Focus on issues that affect meaning or scientific communication — do not flag trivial stylistic preferences."""

    user_parts = ["# Manuscript for Expression Review\n"]

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
    else:
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


def build_methods_stats_check_messages(manuscript_data, section_texts, section_map):
    """Build system + user messages for the methods/statistics check.

    Args:
        manuscript_data: dict from manuscript_full.json
        section_texts: dict mapping section name to text content
        section_map: dict from section_map.json

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are a peer reviewer evaluating the methodological and statistical quality of an academic manuscript. Your task is to assess:

1. **Study design clarity**: Is the study design clearly stated (e.g., cross-sectional, cohort, case-control, RCT)? Is the design appropriate for the research question?

2. **Participants and eligibility**: Are inclusion and exclusion criteria clearly defined? Is the sampling method described? Is the sample size justified (power analysis or rationale)?

3. **Interventions, procedures, and measures**: Are interventions or measurement procedures described in sufficient detail to allow replication? Are instruments validated or referenced?

4. **Primary and secondary outcomes**: Are primary and secondary outcomes explicitly defined? Are they measured with appropriate instruments?

5. **Statistical analysis description**: Are the statistical methods clearly described? Are they appropriate for the study design and data type? Is the significance threshold stated?

6. **Missing data handling**: Is there any mention of how missing data were handled? If missing data exist, is the approach appropriate (complete case, imputation, sensitivity analysis)?

7. **Effect sizes and confidence intervals**: Are effect sizes reported alongside p-values? Are confidence intervals provided? Is clinical/practical significance discussed separately from statistical significance?

8. **Multiple comparisons**: If multiple tests were performed, is there correction for multiple comparisons (Bonferroni, FDR, etc.)? Is the risk of inflated Type I error acknowledged?

9. **Methods-Results correspondence**: Do the Results correspond to the Methods? Are all analyses described in Methods reported in Results? Are there post-hoc analyses presented without being described in Methods?

10. **Ethics, consent, and conflicts of interest**: Is ethics committee approval stated? Is informed consent described? Are conflicts of interest and funding sources declared?

For each issue found, provide:
- severity: "major" (methodological flaw that affects validity/reproducibility) or "minor" (incomplete reporting or clarification needed)
- A clear description of the issue
- A specific location (section name, paragraph numbers if available)
- A suggested comment for the authors
- A confidence level: "high" (clear-cut), "medium" (reasonable concern), "low" (speculative)

If no issues are found for a category, note this in your summary.

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON. The JSON must follow this exact structure:

{
  "summary": "2-4 sentence overall assessment of the methodological and statistical quality",
  "findings": [
    {
      "severity": "major",
      "category": "Methods and Statistics",
      "location": {
        "section": "Methods",
        "paragraph_start": 3,
        "paragraph_end": 5,
        "text_excerpt": "brief quote from the manuscript"
      },
      "issue": "Clear description of the methodological problem",
      "suggested_comment": "Author-facing suggestion for improvement",
      "confidence": "high"
    }
  ]
}

Use null for paragraph_start/paragraph_end if you cannot determine specific paragraph numbers. The findings array may be empty if no issues are found."""

    user_parts = ["# Manuscript for Methods/Statistics Review\n"]

    if section_map and "sections" in section_map:
        user_parts.append("## Section Order\n")
        for sec in section_map["sections"]:
            indent = "  " * (sec.get("level") or 0)
            parent = f" (under {sec['parent_section']})" if sec.get("parent_section") else ""
            user_parts.append(f"{indent}- {sec['name']}: {sec.get('heading', '')}{parent}")
        user_parts.append("")

    if section_texts:
        user_parts.append("## Section Content\n")
        # methods_stats focuses on Methods, Results, and Discussion
        for name in ["methods", "results", "discussion"]:
            text = section_texts.get(name, "")
            if text and text.strip():
                user_parts.append(f"### {name}\n")
                user_parts.append(text)
                user_parts.append("")
    else:
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


def build_repair_references_messages(target_refs):
    """Build system + user messages for LLM-based reference re-parsing.

    The LLM re-reads raw reference text and extracts structured fields.
    It does NOT search databases — it only structures what the human wrote.

    Args:
        target_refs: list of dicts with reference_id, raw_text, parsed, status

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are a bibliographic data extraction specialist. Your task is to read raw reference text from an academic manuscript and extract structured bibliographic fields.

## What to do

For each reference, carefully read the raw text and extract as many fields as possible. Do NOT invent or guess — if a field is not present in the text, set it to null.

## Publication type detection

Identify the publication type from these cues:
- **journal_article**: Has journal name, volume(issue), pages. Usually ends with "volume, pages" pattern.
- **book**: Has publisher name in parentheses, no journal/volume/issue. Often ends with "(Publisher)".
- **edited_book**: Has "ed." or "eds." after author names. Has publisher.
- **book_chapter**: Has "In:" followed by editor names and book title.
- **report**: Contains "report", "technical report", "working paper", "bulletin".
- **government_document**: Contains ministry/government names, "census", "statistics", government URLs.
- **web_document**: Has a URL and looks like a web page/article, not a journal paper.
- **conference_paper**: Contains "proceedings", "conference", "symposium", "presented at".
- **manual**: Contains "manual", "guideline", "guide", "version X.X".
- **other**: Doesn't fit any of the above.

## URL separation

If the reference text contains a URL (http/https), extract it into the "url" field. The URL should NOT be part of the title.

## Book title vs article title

- For books: use "book_title" field, leave "title" null
- For journal articles: use "title" field, leave "book_title" null
- For book chapters: "title" = chapter title, "book_title" = book title

## Publisher extraction

Look for publisher names often in parentheses at the end: "(Oxford)", "(University of Chicago Press)", "(Routledge)".

## Editor extraction

Look for "ed." or "eds." markers. Editor names should be extracted separately from authors.

## DOI flagging

If the reference looks like a journal article (has journal name, volume, pages) but has no DOI, set possible_missing_doi to true.

## Output format

Respond ONLY with a JSON object containing a "references" array:

```json
{
  "references": [
    {
      "reference_id": "R001",
      "parsed": {
        "authors": ["Surname, GivenName"],
        "year": 2020,
        "title": "Article title",
        "journal": "Journal Name",
        "book_title": null,
        "editor": [],
        "publisher": null,
        "volume": "10",
        "issue": "2",
        "pages": "100-120",
        "doi": "10.xxxx/xxxxx",
        "url": null,
        "isbn": null,
        "publication_type": "journal_article"
      },
      "flags": {
        "possible_missing_doi": false,
        "contains_url": false,
        "likely_book": false,
        "likely_report_or_government_document": false,
        "needs_human_review": false
      },
      "warnings": [],
      "confidence": "high"
    }
  ]
}
```

## Confidence levels

- **high**: All major fields clearly present in the text (authors, year, title, journal/publisher)
- **medium**: Some fields clear, some ambiguous or partially extracted
- **low**: Text is ambiguous, poorly formatted, or incomplete

## Important rules

1. Preserve original author name formatting as much as possible
2. Year should be an integer (not string), or null if not found
3. DOI should NOT have trailing punctuation (periods, commas, semicolons)
4. If the text is ambiguous between book and journal article, explain in warnings
5. Set needs_human_review: true if the text is very ambiguous or incomplete
6. Do NOT include the reference number prefix in author names (e.g., "52.\\tFisher" -> "Fisher")
7. For Japanese author names, preserve the original order and separators
8. Always include the reference_id matching the input
9. Respond ONLY with the JSON object — no markdown, no explanation outside the JSON"""

    user_parts = ["# References to Re-parse\n"]
    user_parts.append(
        "Below are reference texts from the manuscript's reference list. "
        "Parse each one into structured bibliographic data.\n"
    )

    for ref in target_refs:
        rid = ref["reference_id"]
        raw = ref.get("raw_text", "")
        status = ref.get("status", "unknown")
        parse_conf = ref.get("parse_confidence", "low")

        user_parts.append(f"## {rid} (current status: {status}, parse: {parse_conf})")
        user_parts.append(f"```\n{raw}\n```\n")

    user_message = "\n".join(user_parts)

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
