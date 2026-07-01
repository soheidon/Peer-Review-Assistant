"""Prompt templates for LLM review checks."""

import json


def get_provider_system_hints(provider):
    """Return provider-specific instructions to inject into the system prompt.

    Some LLM providers have tokenizer limitations with Unicode math symbols
    (e.g., DeepSeek drops U+03C9 ω from its output). These hints tell the
    model to skip mathematical/statistical notation that it cannot reliably
    process, preventing false-positive findings with empty or garbled excerpts.

    Args:
        provider: Provider name string (e.g. "deepseek", "kimi", "openai")

    Returns:
        Hint string to append to the system prompt, or "" if none needed.
    """
    provider_lower = (provider or "").lower()

    if "deepseek" in provider_lower:
        return (
            "\n\n"
            "CRITICAL PROVIDER-SPECIFIC RULE: "
            "Do NOT flag any issue whose text_excerpt contains or refers to "
            "mathematical/statistical notation. This includes: "
            "Greek letters (alpha, beta, gamma, delta, epsilon, eta, theta, "
            "mu, sigma, tau, chi, omega), "
            "statistical measures (omega-squared, eta-squared, Cohen's d, "
            "Hedges' g, etc.), "
            "operators (+/-, >=, <=), and "
            "superscripts (^1, ^2, ^3). "
            "These are standard in scientific writing and MUST be treated as "
            "correct. If a finding would involve any of these symbols, omit "
            "that finding entirely from your response."
        )

    return ""


def build_structure_check_messages(manuscript_data, section_texts, section_map,
                                   journal_profile=None, normalized_sections=None,
                                   novelty_data=None):
    """Build system + user messages for the structure check.

    Args:
        manuscript_data: dict from manuscript_full.json (paragraphs with text, style, index)
        section_texts: dict mapping section name (e.g. "abstract") to text content
        section_map: dict from section_map.json (sections with name, heading, level, parent_section)
        journal_profile: optional dict from journal_profile.json
        normalized_sections: optional dict from normalize_sections()

    Returns:
        list of {"role": str, "content": str} messages
    """
    # Build journal-aware section structure guidance
    ms = journal_profile.get("manuscript_structure", {}) if journal_profile else {}
    sg = journal_profile.get("submission_guidelines", {}) if journal_profile else {}
    expected_order = ms.get("expected_section_order") if ms else None
    main_text_order = ms.get("main_text_order", []) if ms else []
    front_matter = ms.get("front_matter_sections", []) if ms else []
    back_matter = ms.get("back_matter_sections", []) if ms else []

    # Fallback: try submission_guidelines.recommended_manuscript_structure
    if (not expected_order or not isinstance(expected_order, list) or len(expected_order) == 0) and sg:
        expected_order = sg.get("recommended_manuscript_structure")

    section_order_str = ""
    if sg:
        section_order_str = sg.get("section_order", "")
        if not section_order_str and expected_order and len(expected_order) > 0:
            section_order_str = " → ".join(expected_order)
    elif expected_order and len(expected_order) > 0:
        section_order_str = " → ".join(expected_order)

    methods_position = sg.get("methods_position", "") if sg else ""
    if not methods_position and ms:
        methods_position = ms.get("methods_position", "")

    # ── Build alias guidance ──
    alias_guidance = _build_alias_guidance(journal_profile)

    # ── Build classification guidance ──
    classification_guidance = ""
    if front_matter or back_matter or main_text_order:
        fm_str = ", ".join(front_matter) if front_matter else "(none specified)"
        bm_str = ", ".join(back_matter) if back_matter else "(none specified)"
        mt_str = " → ".join(main_text_order) if main_text_order else "(none specified)"
        classification_guidance = (
            f"**Section classification**: The manuscript sections have been classified as follows:\n"
            f"- Main text sections (evaluate ordering): {mt_str}\n"
            f"- Front matter sections (ignore ordering): {fm_str}\n"
            f"- Back matter sections (ignore ordering): {bm_str}\n\n"
            f"Only flag ordering issues for main text sections. "
            f"Missing or misplaced front/back matter sections are NOT structural errors.\n\n"
        )

    section_order_guidance = ""
    if expected_order and isinstance(expected_order, list) and len(expected_order) > 0:
        order_str = " → ".join(expected_order)
        methods_note = f" (Methods: {methods_position})" if methods_position else ""
        section_order_guidance = (
            f"The target journal expects the following section order: **{order_str}**{methods_note}. "
            f"Evaluate whether the manuscript follows this order. "
            f"Only flag a section-ordering issue if the manuscript deviates from the journal's expected order. "
            f"Do NOT assume a generic IMRaD (Introduction→Methods→Results→Discussion) order if the journal uses a different convention.\n\n"
        )
    elif expected_order is not None and (not isinstance(expected_order, list) or len(expected_order) == 0):
        section_order_guidance = (
            "No journal-specific section order was found in the profile. "
            "Evaluate using the standard IMRaD (Introduction→Methods→Results→Discussion) convention as a default.\n\n"
        )
    else:
        section_order_guidance = (
            "Evaluate using the standard IMRaD (Introduction→Methods→Results→Discussion) convention. "
            "Note that some journals (especially Nature Publishing Group) place Methods AFTER Discussion — "
            "if the target journal is unknown, note any deviation from IMRaD but do not flag it as a major issue "
            "without being certain of the journal's expectations.\n\n"
        )

    system_prompt = f"""You are a pre-submission manuscript checker helping authors improve their manuscript before submission. Your task is to assess the structural quality of an academic manuscript. Your task is to assess:

1. **Section ordering compliance**: {section_order_guidance}
{_indent_guidance(alias_guidance)}
{_indent_guidance(classification_guidance)}
2. **Abstract consistency**: Does the abstract accurately summarize the background, aim, methods, results, and conclusion? Are there claims in the abstract that are not supported in the body?

3. **Research gap**: Is a clear gap or limitation in existing literature stated in the Introduction? Is the rationale for the study well-justified? **If Prior Research Context is provided** (see user message): verify that the gap claimed by the authors is genuine. If prior research already fills this gap, flag it — the authors should acknowledge overlapping prior work and articulate what differentiates their study.

4. **Aim/Objective clarity**: Is the study aim or objective explicitly stated? Is it specific, measurable, and appropriately scoped?

5. **Methods-Results alignment**: Do the Results correspond to the Methods? Are all analyses described in Methods reported in Results? Are there results presented that lack methodological description?

6. **Discussion overreach**: Does the Discussion interpret results appropriately, or does it go beyond what the data support? Are limitations acknowledged?

7. **Conclusion overreach**: Are the conclusions proportionate to the evidence? Is there overstatement of significance, generalizability, or clinical relevance?

For each issue found, provide:
- severity: "major" (affects validity/interpretation) or "minor" (presentation issue)
- A clear description of the issue
- A specific location (section name, paragraph numbers from [P{n}] markers in the text)
- A suggested author-facing comment: a concise, actionable description of what is wrong and what should be changed. Write this in the constructive, helpful tone suggesting improvements to the author. For section-ordering issues, describe the expected order and where the problematic section should move.
- A confidence level: "high" (clear-cut), "medium" (reasonable concern), "low" (speculative)

If no issues are found for a category, note this in your summary.

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON. The JSON must follow this exact structure:

{{
  "summary": "2-4 sentence overall assessment of the manuscript structure",
  "findings": [
    {{
      "severity": "major",
      "category": "Structure",
      "location": {{
        "section": "Introduction",
        "paragraph_start": 3,
        "paragraph_end": 5,
        "text_excerpt": "brief quote from the manuscript"
      }},
      "issue": "Clear description of the structural problem",
      "suggested_comment": "Author-facing description of the issue and suggested fix",
      "confidence": "high"
    }}
  ]
}}

Use the [P{n}] markers in the text. Use null for paragraph_start/paragraph_end only when the issue spans the entire section or the location is impossible to pinpoint to specific paragraphs. The findings array may be empty if no issues are found."""

    user_parts = ["# Manuscript for Structure Review\n"]

    # Inject journal profile information if available
    if journal_profile:
        jp_name = journal_profile.get("journal_name", "Unknown")
        user_parts.append("## Journal Information\n")
        user_parts.append(f"- Journal: {jp_name}")
        if section_order_str:
            user_parts.append(f"- Expected section order: {section_order_str}")
        if methods_position:
            user_parts.append(f"- Methods section position: {methods_position}")
        rp = journal_profile.get("review_policy", {}) if journal_profile else {}
        if rp.get("technical_soundness_oriented") == "true":
            user_parts.append("- This journal is technical-soundness oriented (does not assess importance/impact)")
        user_parts.append("")

    # ── Section Order display (use normalized sections if available) ──
    if normalized_sections and "sections" in normalized_sections:
        user_parts.append("## Section Order (normalized)\n")
        for sec in normalized_sections["sections"]:
            indent = "  " * (sec.get("level") or 0)
            parent = f" (under {sec['parent_section']})" if sec.get("parent_section") else ""
            canonical = sec.get("canonical_name", sec.get("name"))
            heading = sec.get("heading", "")
            # Show both canonical name and original heading when they differ
            if canonical != sec.get("name") and heading:
                display = f"{canonical} ← '{heading}'"
            elif heading:
                display = f"{canonical}: {heading}"
            else:
                display = f"{canonical}"
            user_parts.append(f"{indent}- {display}{parent}")
        user_parts.append("")
    elif section_map and "sections" in section_map:
        user_parts.append("## Section Order\n")
        for sec in section_map["sections"]:
            indent = "  " * (sec.get("level") or 0)
            parent = f" (under {sec['parent_section']})" if sec.get("parent_section") else ""
            user_parts.append(f"{indent}- {sec['name']}: {sec.get('heading', '')}{parent}")
        user_parts.append("")

    # ── Section Content (dynamic list from normalized sections) ──
    if section_texts:
        user_parts.append("## Section Content\n")
        section_names_to_render = []
        if normalized_sections and "canonical_order" in normalized_sections:
            # Use original section_map names to key into section_texts
            for sec in normalized_sections["sections"]:
                name = sec.get("name")
                if name and name not in section_names_to_render:
                    section_names_to_render.append(name)
        else:
            section_names_to_render = ["abstract", "introduction", "aim_objective", "methods",
                                       "results", "discussion", "conclusion"]
        for name in section_names_to_render:
            text = section_texts.get(name, "")
            if text and text.strip():
                # Show canonical name if available
                display_name = name
                if normalized_sections:
                    for sec in normalized_sections["sections"]:
                        if sec.get("name") == name and sec.get("canonical_name") != name:
                            display_name = f"{sec['canonical_name']} ({name})"
                            break
                user_parts.append(f"### {display_name}\n")
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

    # Inject prior research context from novelty assessment (for research gap evaluation)
    if novelty_data:
        context_block = _build_novelty_context_block(
            novelty_summary=novelty_data.get("summary"),
            novelty_assessment=novelty_data.get("assessment"),
        )
        if context_block:
            user_parts.append(context_block)
            user_parts.append("")

    user_message = "\n".join(user_parts)

    if len(user_message) > 120000:
        user_message = user_message[:120000] + "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def _build_alias_guidance(journal_profile):
    """Build human-readable alias guidance text for the system prompt."""
    if not journal_profile:
        return ""
    ms = journal_profile.get("manuscript_structure", {})
    aliases = ms.get("section_aliases", {}) if ms else {}
    rules = ms.get("section_alias_rules", []) if ms else []

    if not aliases and not rules:
        return ""

    lines = ["**Heading name conventions**: Section headings have been mapped to canonical names using these rules:"]
    for canonical, alias_list in aliases.items():
        if alias_list:
            lines.append(f"- {canonical}: accepts headings like {', '.join(alias_list[:5])}")
    for rule in rules:
        lines.append(
            f"- '{rule.get('alias', rule)}' resolves to '{rule.get('canonical', '')}' "
            f"when condition '{rule.get('condition', '')}' is met"
        )
    return "\n".join(lines) + "\n"


def _indent_guidance(text):
    """Indent guidance text for system prompt inclusion."""
    if not text:
        return ""
    return "\n".join("    " + line for line in text.split("\n")) + "\n"


def _extract_assessment_section(assessment_text, section_name):
    """Extract a named section from the novelty assessment Markdown.

    Looks for '## N. Section Name' pattern and extracts content until
    the next '##' heading.

    Args:
        assessment_text: full novelty_assessment.md text
        section_name: e.g. "Overlap with Existing Research"

    Returns:
        str or None: extracted section text, or None if not found
    """
    import re
    pattern = rf'##\s+\d+\.\s+{re.escape(section_name)}\s*\n(.*?)(?=\n##\s+\d+\.|\Z)'
    match = re.search(pattern, assessment_text, re.DOTALL)
    if match:
        return match.group(1).strip()
    return None


def _build_novelty_context_block(novelty_summary, novelty_assessment=None):
    """Build a concise 'Prior Research Context' block for review check prompts.

    Extracts the most actionable novelty information relevant to review checks:
    overlap with existing research, what can be strongly claimed vs cautiously,
    and clear differentiators from prior work.

    Args:
        novelty_summary: dict from novelty_summary.json
        novelty_assessment: optional str, full text of novelty_assessment.md

    Returns:
        str or None: Markdown block for appending to user message,
                     or None if no useful novelty data is available.
    """
    if not novelty_summary:
        return None

    parts = []
    parts.append("## Prior Research Context (Novelty Assessment)\n")

    # 1. Claimed contributions
    claimed = novelty_summary.get("claimed_contributions", "")
    if claimed and claimed.strip():
        parts.append(f"The authors claim the following contributions: {claimed}\n")

    # 2. Extract key sections from assessment.md if available
    if novelty_assessment:
        overlap_text = _extract_assessment_section(
            novelty_assessment, "Overlap with Existing Research"
        )
        if overlap_text:
            parts.append("### Overlap with Existing Research\n")
            parts.append(overlap_text)
            parts.append("")

        diff_text = _extract_assessment_section(
            novelty_assessment, "Clear Differentiation from Existing Research"
        )
        if diff_text:
            parts.append("### Clear Differentiation from Existing Research\n")
            parts.append(diff_text)
            parts.append("")

        strong_claims = _extract_assessment_section(
            novelty_assessment, "Points That Can Be Strongly Claimed"
        )
        if strong_claims:
            parts.append("### Points That Can Be Strongly Claimed\n")
            parts.append(strong_claims)
            parts.append("")

        cautious_claims = _extract_assessment_section(
            novelty_assessment, "Points to State Cautiously"
        )
        if cautious_claims:
            parts.append("### Points to State Cautiously\n")
            parts.append(cautious_claims)
            parts.append("")
    else:
        # Fallback: synthesize from novelty_summary.json fields
        novelty_fields = []
        for key in ["novelty_theme", "novelty_sample", "novelty_methods",
                     "novelty_statistics", "novelty_data_rarity",
                     "novelty_practical_significance"]:
            val = novelty_summary.get(key, "")
            if val and isinstance(val, str) and "No particular novelty" not in val and val.strip():
                label = key.replace("novelty_", "").replace("_", " ").title()
                novelty_fields.append(f"- **{label}**: {val}")
        if novelty_fields:
            parts.append("### Novelty Assessment\n")
            parts.extend(novelty_fields)
            parts.append("")

    # 3. Summary of manuscript (for cross-reference)
    research_topic = novelty_summary.get("research_topic", "")
    findings = novelty_summary.get("findings", "")
    if research_topic or findings:
        parts.append("### Manuscript Summary (from novelty assessment)\n")
        if research_topic:
            parts.append(f"- **Topic**: {research_topic}")
        if findings:
            parts.append(f"- **Main findings**: {findings}")
        parts.append("")

    # 4. Guidance for the review check
    parts.append(
        "Use the above prior research context when evaluating the manuscript. "
        "Specifically:\n"
        "- If the manuscript makes claims already established in prior research, "
        "flag them as potential overstatements or insufficient novelty acknowledgment.\n"
        "- If the manuscript fails to cite or discuss key overlapping prior work, "
        "flag this as a discussion quality or research gap issue.\n"
        "- Adjust confidence levels: if prior research clearly contradicts a manuscript "
        "claim, confidence can be 'high'; if the relationship is ambiguous, use 'medium' or 'low'.\n"
    )

    block = "\n".join(parts)
    if len(block) > 8000:
        block = block[:8000] + "\n\n[Prior research context truncated due to length]"

    return block


def build_expression_check_messages(manuscript_data, section_texts, section_map, journal_profile=None):
    """Build system + user messages for the expression/language check.

    Args:
        manuscript_data: dict from manuscript_full.json
        section_texts: dict mapping section name to text content
        section_map: dict from section_map.json
        journal_profile: optional dict from journal_profile.json (reserved for future use)

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are a pre-submission manuscript checker helping authors improve their manuscript before submission. Your task is to assess the English expression and academic writing quality of a manuscript. Your task is to assess:

1. **Grammar and mechanics**: Are there errors in grammar, article usage (a/an/the), prepositions, verb tense, subject-verb agreement, or punctuation?

2. **Academic style**: Does the writing use appropriate academic register? Are there colloquialisms, contractions, or informal phrasing unsuitable for a scientific paper?

3. **Clarity and precision**: Are sentences clear and unambiguous? Are there vague quantifiers ("very", "quite", "rather") or imprecise terminology that should be tightened?

4. **Overstatement and hedging**: Does the manuscript overstate findings? Are causal claims made where only associations are shown? Is appropriate hedging used ("may", "suggest", "indicate" vs. "prove", "demonstrate", "establish")?

5. **Wordiness and redundancy**: Are there unnecessarily wordy constructions, redundant phrases, or sentences that could be tightened?

6. **Sentence structure**: Are there run-on sentences, fragments, or overly complex constructions that impede readability?

For each issue found, provide:
- severity: "major" (misleading or harms scientific accuracy) or "minor" (stylistic improvement)
- A clear description of the issue
- A specific location (section name, paragraph numbers from [P{n}] markers in the text)
- The exact text excerpt containing the issue
- A suggested comment for the author: describe the problem and show the corrected text. Write in the constructive, helpful tone suggesting improvements to the author.
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
      "suggested_comment": "Author-facing description of the problem and suggested correction",
      "confidence": "high"
    }
  ]
}

Use the [P{n}] markers in the text. Use null for paragraph_start/paragraph_end only when the issue spans the entire section or the location is impossible to pinpoint to specific paragraphs. The findings array may be empty if no issues are found. Focus on issues that affect meaning or scientific communication — do not flag trivial stylistic preferences."""

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


def build_methods_stats_check_messages(manuscript_data, section_texts, section_map, journal_profile=None, novelty_data=None):
    """Build system + user messages for the methods/statistics check.

    Args:
        manuscript_data: dict from manuscript_full.json
        section_texts: dict mapping section name to text content
        section_map: dict from section_map.json
        journal_profile: optional dict from journal_profile.json (reserved for future use)

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are a pre-submission manuscript checker helping authors improve their manuscript before submission. Your task is to assess the methodological and statistical quality of an academic manuscript. Your task is to assess:

1. **Study design clarity**: Is the study design clearly stated (e.g., cross-sectional, cohort, case-control, RCT)? Is the design appropriate for the research question? **If Prior Research Context is provided** (see user message): note which methods are standard in this field vs. novel — apply stricter scrutiny to novel methods.

2. **Participants and eligibility**: Are inclusion and exclusion criteria clearly defined? Is the sampling method described? Is the sample size justified (power analysis or rationale)?

3. **Interventions, procedures, and measures**: Are interventions or measurement procedures described in sufficient detail to allow replication? Are instruments validated or referenced?

4. **Primary and secondary outcomes**: Are primary and secondary outcomes explicitly defined? Are they measured with appropriate instruments?

5. **Statistical analysis description**: Are the statistical methods clearly described? Are they appropriate for the study design and data type? Is the significance threshold stated?

6. **Missing data handling**: Is there any mention of how missing data were handled? If missing data exist, is the approach appropriate (complete case, imputation, sensitivity analysis)?

7. **Effect sizes and confidence intervals**: Are effect sizes reported alongside p-values? Are confidence intervals provided? Is clinical/practical significance discussed separately from statistical significance?

8. **Multiple comparisons**: If multiple tests were performed, is there correction for multiple comparisons (Bonferroni, FDR, etc.)? Is the risk of inflated Type I error acknowledged?

9. **Methods-Results correspondence**: Do the Results correspond to the Methods? Are all analyses described in Methods reported in Results? Are there post-hoc analyses presented without being described in Methods?

For each issue found, provide:
- severity: "major" (methodological flaw that affects validity/reproducibility) or "minor" (incomplete reporting or clarification needed)
- A clear description of the issue
- A specific location (section name, paragraph numbers from [P{n}] markers in the text)
- A suggested comment for the author: describe the problem and what should be done to fix it. Write in the constructive, helpful tone suggesting improvements to the author.
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
      "suggested_comment": "Author-facing description of the problem and suggested fix",
      "confidence": "high"
    }
  ]
}

Use the [P{n}] markers in the text. Use null for paragraph_start/paragraph_end only when the issue spans the entire section or the location is impossible to pinpoint to specific paragraphs. The findings array may be empty if no issues are found."""

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

    # Inject prior research context from novelty assessment
    if novelty_data:
        context_block = _build_novelty_context_block(
            novelty_summary=novelty_data.get("summary"),
            novelty_assessment=novelty_data.get("assessment"),
        )
        if context_block:
            user_parts.append(context_block)
            user_parts.append("")

    user_message = "\n".join(user_parts)

    if len(user_message) > 120000:
        user_message = user_message[:120000] + "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_logic_argument_check_messages(manuscript_data, section_texts, section_map, journal_profile=None, novelty_data=None, methods_stats_context=None):
    """Build system + user messages for the logic/argument validity check.

    Args:
        manuscript_data: dict from manuscript_full.json
        section_texts: dict mapping section name to text content
        section_map: dict from section_map.json
        journal_profile: optional dict from journal_profile.json
        novelty_data: optional dict with "summary" and "assessment" keys
        methods_stats_context: optional str, summary of findings already covered
            by the methods/stats check (to avoid duplicate comments)

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are a pre-submission manuscript checker helping authors improve their manuscript before submission. Your task is to assess the logical and argumentative quality of an academic manuscript. Your task is to assess the soundness of reasoning independent of statistical methods (which are assessed separately).

IMPORTANT — Avoid Duplicate Findings: The Methods/Stats check already covers study design adequacy, sample size justification, statistical method appropriateness, and measurement validity. If a "Methods/Stats Findings (Already Covered)" section is provided in the user message, do NOT raise findings that duplicate those already flagged by the methods/stats check. Focus exclusively on logical argumentation: reasoning quality, evidence-to-claim correspondence, discussion interpretation, and conclusion validity. If you are unsure whether a finding belongs to methods/stats or logic/argument, lean toward omitting it — methods/stats issues are already handled.

Evaluate the following categories:

1. **Problem setting and rationale**: Is the research problem clearly stated and well-motivated? Does the introduction establish why this problem matters? Is there a clear gap in the literature that this study addresses?

2. **Logical coherence of study design**: Given the research question, is the overall approach logically sound? Are the chosen subjects/populations appropriate for the question? Does the design follow logically from the problem statement? (Note: adequacy of sample size and statistical power are methods/stats issues — focus on whether the design logically matches the question.)

3. **Clarity of hypothesis / research question**: Are hypotheses or research questions explicitly and clearly stated? Are they specific, testable, and logically derived from the background?

4. **Logical flow of argument**: Does the manuscript present a coherent narrative? Are the ideas connected logically from introduction through discussion? Are there gaps or leaps in reasoning?

5. **Evidence-to-claim correspondence**: Do the claims made in the discussion and conclusion follow from the evidence presented? Are there unsupported assertions or overstatements? Is the strength of claims proportionate to the strength of evidence? **Cross-reference with Prior Research Context** (provided in the user message if available): if the manuscript makes claims already well-established in prior literature, this may not be an overstatement — the authors are reporting known phenomena. Focus criticism on claims that go beyond what the prior research context supports. If the manuscript fails to acknowledge overlapping prior work, flag this as a discussion quality issue.

6. **Discussion quality and interpretation**: Does the discussion interpret results in context of the research question? Are alternative explanations considered? Are findings compared appropriately with prior literature? Is the argumentation balanced?

7. **Acknowledgement of limitations**: Are limitations of the study design, data, and analysis acknowledged? Are they discussed in appropriate depth? Is the impact of limitations on conclusions addressed?

8. **Validity of conclusions**: Are the conclusions warranted by the results? Do they address the original research question? Are practical or theoretical implications stated appropriately without overreach?

For each issue found, provide:
- severity: "major" (logical flaw that undermines the argument) or "minor" (unclear reasoning or incomplete justification)
- A clear description of the logical issue
- A specific location (section name, paragraph numbers from [P{n}] markers in the text)
- A suggested comment for the author: describe the logical problem and what should be reconsidered. Write in the constructive, helpful tone suggesting improvements to the author.
- A confidence level: "high" (clear logical error), "medium" (reasonable concern), "low" (speculative)

If no issues are found for a category, note this in your summary.

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON. The JSON must follow this exact structure:

{
  "summary": "2-4 sentence overall assessment of the logical and argumentative quality",
  "findings": [
    {
      "severity": "major",
      "category": "Logic and Argument",
      "location": {
        "section": "Discussion",
        "paragraph_start": 3,
        "paragraph_end": 5,
        "text_excerpt": "brief quote from the manuscript"
      },
      "issue": "Clear description of the logical problem",
      "suggested_comment": "Author-facing description of the problem and suggested fix",
      "confidence": "high"
    }
  ]
}

Use the [P{n}] markers in the text. Use null for paragraph_start/paragraph_end only when the issue spans the entire section or the location is impossible to pinpoint to specific paragraphs. The findings array may be empty if no issues are found."""

    user_parts = ["# Manuscript for Logic & Argument Review\n"]

    if section_map and "sections" in section_map:
        user_parts.append("## Section Order\n")
        for sec in section_map["sections"]:
            indent = "  " * (sec.get("level") or 0)
            parent = f" (under {sec['parent_section']})" if sec.get("parent_section") else ""
            user_parts.append(f"{indent}- {sec['name']}: {sec.get('heading', '')}{parent}")
        user_parts.append("")

    if section_texts:
        user_parts.append("## Section Content\n")
        # Logic/argument evaluation needs full manuscript context
        for name in ["introduction", "aim_objective", "methods", "results", "discussion", "conclusion"]:
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

    # Inject prior research context from novelty assessment
    if novelty_data:
        context_block = _build_novelty_context_block(
            novelty_summary=novelty_data.get("summary"),
            novelty_assessment=novelty_data.get("assessment"),
        )
        if context_block:
            user_parts.append(context_block)
            user_parts.append("")

    # Inject methods/stats findings to avoid duplicate comments
    if methods_stats_context:
        user_parts.append("## Methods/Stats Findings (Already Covered — Do NOT Duplicate)\n")
        user_parts.append("The following issues have already been identified by the Methods/Stats check.")
        user_parts.append("Do NOT raise these same issues again. Focus only on logical argumentation aspects.\n")
        user_parts.append(methods_stats_context)
        user_parts.append("")

    user_message = "\n".join(user_parts)

    if len(user_message) > 120000:
        user_message = user_message[:120000] + "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_figure_table_check_messages(manuscript_data, section_texts, section_map, journal_profile=None, supplemental_texts=None):
    """Build system + user messages for the figure/table quality check.

    Args:
        manuscript_data: dict from manuscript_full.json
        section_texts: dict mapping section name to text content
        section_map: dict from section_map.json
        journal_profile: optional dict from journal_profile.json
        supplemental_texts: optional dict mapping filename to extracted text

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are a pre-submission manuscript checker helping authors improve their manuscript before submission. Your task is to assess the quality of figures and tables in an academic manuscript. Your task is to assess the clarity, labeling, captions, and appropriateness of figures and tables based on the manuscript text.

Evaluate the following categories:

1. **Figure/Table labeling and numbering**: Are figures and tables numbered sequentially and consistently? Are they correctly referenced in the text? Are there any numbering gaps or mismatches between in-text references and actual figures/tables?

2. **Caption quality and informativeness**: Are captions self-contained and informative? Do they describe what is shown without requiring the reader to refer to the main text? Are abbreviations defined? Are statistical details (e.g., sample size, units) included where appropriate?

3. **Figure/Table clarity and self-containedness**: Based on textual descriptions and captions, do the figures and tables appear clear and interpretable? Are legends, axis labels, units, and footnotes described or implied? Would a reader understand each figure/table independently?

4. **Redundant figures/tables**: Is there evidence of redundant presentation? Are the same data presented in both a figure and a table unnecessarily? Are there figures/tables that duplicate information already described adequately in the text?

5. **Appropriateness of in-text references**: Are all figures and tables cited in the text? Are they discussed at appropriate points (not just mentioned in passing)? Does the text interpretation align with what the figure/table caption describes?

6. **Supplemental figure/table quality** (if supplemental materials are provided): Are supplemental figures and tables appropriately labeled and captioned? Do they provide necessary supporting information without being excessive? Are they referenced in the main text?

For each issue found, provide:
- severity: "major" (serious problem that affects understanding or data interpretation) or "minor" (stylistic or formatting issue)
- A clear description of the issue
- A specific location (section name, paragraph numbers from [P{n}] markers in the text, figure/table number if identifiable)
- A suggested comment for the author: describe the figure/table issue and what should be corrected. Write in the constructive, helpful tone suggesting improvements to the author.
- A confidence level: "high" (clearly identifiable problem), "medium" (likely problem), "low" (speculative)

If no issues are found for a category, note this in your summary.

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON. The JSON must follow this exact structure:

{
  "summary": "2-4 sentence overall assessment of the figure and table quality",
  "findings": [
    {
      "severity": "major",
      "category": "Figures and Tables",
      "location": {
        "section": "Results",
        "paragraph_start": 3,
        "paragraph_end": 5,
        "text_excerpt": "brief quote from the manuscript"
      },
      "issue": "Clear description of the figure/table problem",
      "suggested_comment": "Author-facing description of the problem and suggested fix",
      "confidence": "high"
    }
  ]
}

Use the [P{n}] markers in the text. Use null for paragraph_start/paragraph_end only when the issue spans the entire section or the location is impossible to pinpoint to specific paragraphs. The findings array may be empty if no issues are found."""

    user_parts = ["# Manuscript for Figure & Table Quality Review\n"]

    if section_map and "sections" in section_map:
        user_parts.append("## Section Order\n")
        for sec in section_map["sections"]:
            indent = "  " * (sec.get("level") or 0)
            parent = f" (under {sec['parent_section']})" if sec.get("parent_section") else ""
            user_parts.append(f"{indent}- {sec['name']}: {sec.get('heading', '')}{parent}")
        user_parts.append("")

    if section_texts:
        user_parts.append("## Section Content\n")
        # Evaluate sections where figures/tables are typically referenced
        for name in ["abstract", "methods", "results", "discussion"]:
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

    # Append supplemental file texts if provided
    if supplemental_texts:
        user_parts.append("## Supplemental Material\n")
        for filename, text in supplemental_texts.items():
            user_parts.append(f"### Supplemental File: {filename}\n")
            if text.strip():
                # Truncate very long supplemental texts to 20000 chars each
                truncated = text[:20000] + ("\n\n[...truncated...]" if len(text) > 20000 else "")
                user_parts.append(truncated)
            else:
                user_parts.append("[No extractable text content — image or binary file]")
            user_parts.append("")

    user_message = "\n".join(user_parts)

    if len(user_message) > 120000:
        user_message = user_message[:120000] + "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_ethics_check_messages(manuscript_data, section_texts, section_map, journal_profile=None):
    """Build system + user messages for the ethics & conflict of interest check.

    Args:
        manuscript_data: dict from manuscript_full.json
        section_texts: dict mapping section name to text content
        section_map: dict from section_map.json
        journal_profile: optional dict from journal_profile.json

    Returns:
        list of {"role": str, "content": str} messages
    """
    sg = journal_profile.get("submission_guidelines", {}) if journal_profile else {}
    ms = journal_profile.get("manuscript_structure", {}) if journal_profile else {}

    # Build journal requirements section for the system prompt
    journal_req_parts = []
    if sg:
        ethics_req = sg.get("ethics_review_required", "unknown")
        consent_req = sg.get("informed_consent_required", "unknown")
        coi_req = sg.get("coi_disclosure_required", "unknown")
        ethics_policy = sg.get("ethics_policy", "")
        consent_policy = sg.get("informed_consent_policy", "")
        coi_policy = sg.get("conflict_of_interest_policy", "")
        funding_policy = sg.get("funding_statement_policy", "")

        journal_req_parts.append("## Journal Requirements (from journal profile)")
        journal_req_parts.append(f"- Ethics review/IRB approval required: **{ethics_req}**")
        journal_req_parts.append(f"- Informed consent statement required: **{consent_req}**")
        journal_req_parts.append(f"- Conflict of interest disclosure required: **{coi_req}**")
        if ethics_policy:
            journal_req_parts.append(f"- Ethics policy: {ethics_policy}")
        if consent_policy:
            journal_req_parts.append(f"- Informed consent policy: {consent_policy}")
        if coi_policy:
            journal_req_parts.append(f"- COI disclosure policy: {coi_policy}")
        if funding_policy:
            journal_req_parts.append(f"- Funding statement policy: {funding_policy}")
        # Include COI heading aliases from manuscript_structure
        section_aliases_ms = ms.get("section_aliases", {})
        coi_aliases = section_aliases_ms.get("competing_interests", [])
        if coi_aliases:
            aliases_str = ", ".join(f'"{a}"' for a in coi_aliases)
            journal_req_parts.append(
                f"- **COI heading(s) accepted by this journal**: {aliases_str}\n"
                f"  The manuscript's COI section heading does NOT need to match exactly; "
                f"any of the above headings (or close equivalents) are acceptable. "
                f"Do NOT flag a heading mismatch as an issue — only flag missing or "
                f"empty COI content."
            )
    else:
        journal_req_parts.append("## Journal Requirements")
        journal_req_parts.append("No journal profile available. Evaluate based on general academic standards.")

    journal_requirements = "\n".join(journal_req_parts)

    system_prompt = f"""You are a pre-submission manuscript checker helping authors improve their manuscript before submission. Your task is to assess the ethics and conflict of interest declarations in an academic manuscript. Your task is to assess whether the manuscript meets ethical standards and journal requirements for ethics review, informed consent, and conflict of interest disclosure.

Evaluate the following categories:

1. **Ethics review presence and documentation**: Does the manuscript include a statement about ethics review/IRB approval? Is the ethics committee name and approval number provided? For studies that did not require ethics approval, is the reason stated? Are appropriate ethics standards referenced (e.g., Declaration of Helsinki)?

2. **Informed consent documentation**: Does the manuscript describe how informed consent was obtained from participants? For studies using opt-out consent, is the justification provided and appropriate? Are consent procedures adequately described? For studies not requiring consent, is this stated with justification?

3. **Conflict of interest disclosure**: Does the manuscript include a COI statement? Are all relevant interests disclosed (financial, personal, institutional)? Is the disclosure format appropriate and complete? Are there any missing COI declarations that should be present based on author affiliations or funding sources?

4. **Alignment with journal requirements**: Compare the manuscript's ethics/COI statements against the journal's specific requirements (provided below). Flag any gaps between what the journal requires and what the manuscript provides.

{journal_requirements}

For each issue found, provide:
- severity: "major" (missing required ethics/COI statement, serious ethical concern) or "minor" (incomplete disclosure, formatting issue)
- A clear description of the issue
- A specific location (section name, paragraph numbers from [P{n}] markers in the text)
- A suggested comment for the author: describe the ethics/COI issue and what needs to be added or corrected. Write in the constructive, helpful tone suggesting improvements to the author.
- A confidence level: "high" (clearly identifiable problem), "medium" (likely problem), "low" (speculative)

If no issues are found for a category, note this in your summary.

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON. The JSON must follow this exact structure:

{{
  "summary": "2-4 sentence overall assessment of the ethics and COI declarations",
  "findings": [
    {{
      "severity": "major",
      "category": "Ethics and Conflict of Interest",
      "location": {{
        "section": "Methods",
        "paragraph_start": 3,
        "paragraph_end": 5,
        "text_excerpt": "brief quote from the manuscript"
      }},
      "issue": "Clear description of the ethics/COI problem",
      "suggested_comment": "Author-facing description of the problem and suggested fix",
      "confidence": "high"
    }}
  ]
}}

Use the [P{n}] markers in the text. Use null for paragraph_start/paragraph_end only when the issue spans the entire section or the location is impossible to pinpoint to specific paragraphs. The findings array may be empty if no issues are found."""

    user_parts = ["# Manuscript for Ethics & Conflict of Interest Review\n"]

    if section_map and "sections" in section_map:
        user_parts.append("## Section Order\n")
        for sec in section_map["sections"]:
            indent = "  " * (sec.get("level") or 0)
            parent = f" (under {sec['parent_section']})" if sec.get("parent_section") else ""
            user_parts.append(f"{indent}- {sec['name']}: {sec.get('heading', '')}{parent}")
        user_parts.append("")

    if section_texts:
        user_parts.append("## Section Content\n")
        # Evaluate sections where ethics/COI statements typically appear
        for name in ["methods", "introduction", "discussion",
                     "conflict_of_interest", "funding", "acknowledgments",
                     "author_contributions", "data_and_code_availability"]:
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

    # Include manuscript-level metadata that may contain COI/ethics info
    md_fields = []
    for field in ["conflict_of_interest", "competing_interests", "coi_statement", "ethics_statement",
                   "ethics_approval", "informed_consent", "funding",
                   "acknowledgments", "author_contributions"]:
        val = manuscript_data.get(field, "")
        if val and str(val).strip():
            md_fields.append(f"### Manuscript metadata: {field}\n{val}\n")
    if md_fields:
        user_parts.append("## Declarations & Metadata\n")
        user_parts.extend(md_fields)

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

**CRITICAL**: If a book title ends with a publisher name in parentheses, you MUST:
1. Set "publisher" to the content of the parentheses (e.g., "Oxford University Press")
2. Set "book_title" WITHOUT the parenthetical publisher (e.g., "The Parental Brain" NOT "The Parental Brain (Oxford University Press)")
3. Do NOT include the publisher in both book_title and publisher fields

Common publisher keywords: Press, University Press, Routledge, Springer, Wiley, Elsevier, Sage, Guilford, APA, McGraw-Hill, Pearson, Macmillan, Basic Books, Jossey-Bass, Lippincott, Cengage, Norton, Harper, Penguin, Blackwell, Academic Press.

## Government / official document detection

If the reference contains a URL from a government domain, classify as government_document:
- .go.jp, .gov, mhlw.go.jp, e-stat.go.jp
- who.int, cdc.gov, .nhs.uk, europa.eu
- oecd.org, unicef.org, undp.org, worldbank.org, .un.org

For government documents with URLs, set:
- publication_type: "government_document"
- likely_report_or_government_document: true
- needs_human_review: true (these should be verified by human)

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


# ── Journal name disambiguation ────────────────────────────────────────

def build_resolve_journals_messages(pairs):
    """Build system + user messages for journal name disambiguation.

    Args:
        pairs: list of {"original": str, "db": str} — unique
               (original_text_journal, database_journal) pairs.

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """You are an expert in academic journal names and their abbreviations. Your task is to determine whether two journal names refer to the same journal.

## Background
- The "original" name comes from free-text reference parsing and may contain abbreviations, misspellings, or non-standard shortenings.
- The "db" name comes from a bibliographic database (Crossref or PubMed) and is typically the official name or a standard abbreviation.
- We need to know: do these two names refer to the **same** journal?

## Output categories

### identity
The two names are the **same journal name** — one may be an uncommon abbreviation, a misspelling, or a partial rendering of the full name, but they clearly denote the same publication.

Examples:
- "Ann Zool Fenn" vs "Annales Zoologici Fennici" → identity (uncommon abbreviation)
- "Phil Trans R Soc" vs "Philosophical Transactions of the Royal Society" → identity
- "J Biol Chem" vs "Journal of Biological Chemistry" → identity
- "Proc Natl Acad Sci" vs "Proceedings of the National Academy of Sciences" → identity

### style
The two names refer to the **same journal** but use **different standard abbreviation styles**. Use this when both names are standard/recognised forms of the same journal.

Abbreviation styles:
- **nlm**: National Library of Medicine style (e.g., "JAMA", "N Engl J Med", "J Biol Chem")
- **iso**: ISO 4 abbreviation (e.g., "J. Am. Med. Assoc.", "N. Engl. J. Med.")
- **full**: The complete, unabbreviated journal name (e.g., "Journal of the American Medical Association")
- **vancouver**: Vancouver-style abbreviation (similar to NLM but sometimes differs)

Examples:
- "J Am Med Assoc" vs "JAMA" → style, nlm (both NLM abbreviations for JAMA)
- "New England Journal of Medicine" vs "N Engl J Med" → style, nlm
- "Lancet" vs "The Lancet" → style, full

### mismatch
The two names refer to **different journals** — they are distinct publications.

Examples:
- "Nature" vs "Nature Communications" → mismatch (different journals)
- "Science" vs "Scientific Reports" → mismatch
- "J Biol Chem" vs "J Cell Biol" → mismatch

## Rules
1. If you're not sure, say "mismatch" — it's better to keep a false negative than introduce a false positive.
2. Pay attention to common abbreviation patterns: dropping vowels, truncating words, using initials.
3. Some journals have very similar names — be careful to distinguish them.
4. A name that is a substring of another is not necessarily the same journal (e.g., "Nature" vs "Nature Communications").

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON.

The JSON must follow this exact structure:
{
  "results": [
    {
      "i": 0,
      "identity": "identity",
      "style": null,
      "reasoning": "Brief explanation (1 sentence)"
    }
  ]
}"""

    user_parts = ["Determine whether each journal name pair refers to the same journal:\n"]
    for i, pair in enumerate(pairs):
        user_parts.append(json.dumps({
            "i": i,
            "original": pair["original"],
            "db": pair["db"],
        }, ensure_ascii=False))

    user_message = "\n".join(user_parts)

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# ── Reference search / identification ──────────────────────────────────

def build_search_references_messages(targets):
    """Build system + user messages for LLM-based reference identification.

    Args:
        targets: list of dicts with reference_id, raw_text, parsed

    Returns:
        list of {"role": str, "content": str} messages
    """
    import json

    system_prompt = """You are an expert academic librarian and citation specialist. Your task is to identify references that could not be matched by Crossref or PubMed.

For each reference, use your training knowledge to determine what publication it refers to. You may recognise:
- **Books**: by author, title, year, publisher. Provide corrected author names, full title, publisher, and ISBN if known.
- **Journal articles**: by author, year, title, and journal abbreviation. Expand abbreviated journal names to their full official names. Provide DOI if known.
- **Government / statistical reports**: by issuing organization, title, year. Provide the correct organization name and URL.
- **Web documents**: by URL and title. Describe what the document is.

## Output format

For each reference, return a JSON object with:

- **reference_id**: the same ID from the input
- **confidence**: "high" (certain), "medium" (reasonably sure), "low" (best guess), "none" (cannot identify)
- **publication_type**: one of "journal_article", "book", "edited_book", "book_chapter", "report", "government_document", "web_document", "conference_paper", "other"
- **corrected**: corrected bibliographic fields (only include fields you can confidently provide):
  - authors: list of strings (full names)
  - year: integer or string (e.g. "1984/2017" for reprints)
  - title: full corrected title
  - journal: full journal name (NOT abbreviated)
  - book_title: for books/book chapters
  - editor: list of strings (for edited books)
  - publisher: publisher name
  - volume: string
  - issue: string
  - pages: string
  - doi: string (if known)
  - isbn: string (if known)
  - url: string (if known)
- **notes**: brief explanation (1-3 sentences) — what this reference is, any caveats
- **source_urls**: list of URLs where this publication can be found or verified

## Rules

1. If you are NOT confident, set confidence to "low" or "none" and explain why in notes.
2. For books, provide publisher and ISBN if known.
3. For journal articles with abbreviated names, always provide the FULL journal name in the "journal" field.
4. **Government documents, reports, and web documents**: You MUST search your knowledge for the URL. Provide the URL both in `corrected.url` AND in `source_urls`. These documents are defined by their URLs — without a URL, the identification is incomplete.
   - For Japanese government (MEXT, MHLW, etc.) documents: construct the URL from the ministry name and document title.
   - For international organizations (WHO, UN, OECD, etc.): provide the official publication URL.
   - For statistical reports and white papers: provide the direct PDF or landing page URL.
5. **If publication_type is government_document, report, or web_document, you MUST include at least one URL.** If you truly cannot find a URL, set confidence to "low" and explain why in notes.
6. Do NOT invent DOIs or ISBNs — only provide them if you know them with certainty.
7. If a reference has no DOI (e.g., it's a manual, report, or older book), do NOT make one up — simply omit the doi field.

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON.

The JSON must follow this exact structure:
{
  "references": [
    {
      "reference_id": "R001",
      "confidence": "high",
      "publication_type": "edited_book",
      "corrected": {
        "authors": ["Helfer, R. E.", "Kempe, C. H."],
        "year": 1968,
        "title": "The Battered Child",
        "publisher": "University of Chicago Press",
        "isbn": "978-0226327204"
      },
      "notes": "Classic edited volume on child abuse.",
      "source_urls": ["https://press.uchicago.edu/ucp/books/book/chicago/B/bo3683497.html"]
    }
  ]
}"""

    user_parts = [
        "The following references could not be matched by Crossref or PubMed.",
        "Please identify each one using your knowledge of academic literature.",
        "",
    ]

    for t in targets:
        rid = t["reference_id"]
        raw = t["raw_text"]
        parsed = t.get("parsed", {})
        user_parts.append(f"## {rid}")
        user_parts.append("```")
        user_parts.append(raw)
        user_parts.append("```")
        if parsed.get("title"):
            user_parts.append(f"Parsed title: {parsed['title']}")
        if parsed.get("journal"):
            user_parts.append(f"Parsed journal: {parsed['journal']}")
        if parsed.get("year"):
            user_parts.append(f"Parsed year: {parsed['year']}")
        user_parts.append("")

    user_message = "\n".join(user_parts)

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_solution_suggestion_messages(finding, manuscript_excerpt, default_prompt, additional_prompt=None, system_prompt_override=None):
    """Build system + user messages for per-finding solution suggestion.

    Args:
        finding: dict with issue, suggested_comment, category, severity, location
        manuscript_excerpt: str, relevant section text for context
        default_prompt: str, the default prompt (editable)
        additional_prompt: str or None, user's additional instructions
        system_prompt_override: str or None, if provided, use this as the system
            prompt instead of the default (allows UI-level customization)

    Returns:
        list of {"role": str, "content": str} messages
    """
    if system_prompt_override and system_prompt_override.strip():
        system_prompt = system_prompt_override.strip()
    else:
        system_prompt = """You are an expert academic advisor helping authors improve their manuscript.
Your task is to suggest possible approaches to address a specific manuscript check finding.

CRITICAL — Tone and Framing:
- This is NOT a prescription or instruction. You are offering possible directions for the authors to consider.
- Use tentative, suggestive language: "might consider", "could explore", "one possible approach is", "it may be helpful to".
- In Japanese, use: 「〜が考えられます」「〜してみるとよいかもしれません」「〜という方向性があります」「〜を検討されてもよいでしょう」「〜の方が読者に伝わりやすくなるかもしれません」.
- NEVER use imperative/command forms. NEVER say "do this" or "you should". Frame everything as options and possibilities.
- The final decision always rests with the authors. You are a thought partner, not an authority.

IMPORTANT — Statistical Method Suggestions:
- Do NOT suggest switching to Bayesian methods (e.g., Bayesian regression, Bayesian hierarchical modeling, MCMC, Bayes factors) unless the manuscript already explicitly uses them. These methods are not universally accepted across all research fields, and suggesting them in a field where they are uncommon may be unhelpful or alienating to the authors.
- When suggesting statistical improvements, prefer refinements to the existing analytical framework (e.g., additional diagnostic checks, robustness analyses, sensitivity analyses, effect size reporting) over paradigm shifts in statistical philosophy.
- When discussing analytical methods, also examine whether the current method is fundamentally appropriate for the research question, not just how to improve it.

Guidelines:
1. Suggest possible directions rather than definitive solutions — frame as options to explore.
2. Consider multiple angles: additional data/experiments, analysis refinements, restructuring, or writing revisions.
3. Tailor suggestions to the severity of the finding (major vs minor).
4. Write in a constructive, supportive tone — this is for the authors, not a criticism.
5. If the finding suggests a fundamental flaw, suggest how the authors might reframe or address it, while acknowledging the difficulty.
6. Keep suggestions concise but complete — aim for 3-8 sentences in each language.

IMPORTANT: Respond ONLY with a JSON object. No markdown, no explanation outside the JSON.
The JSON must follow this exact structure:
{
  "solution": "Possible approaches in English (tentative, suggestive tone)",
  "solution_ja": "日本語での考えられる方向性（「〜が考えられます」「〜かもしれません」等の婉曲表現を用いる）"
}"""

    # Build user message
    user_parts = []
    user_parts.append("## Manuscript Check Finding")
    user_parts.append(f"- **Severity**: {finding.get('severity', 'unknown')}")
    user_parts.append(f"- **Category**: {finding.get('category', '')}")
    user_parts.append(f"- **Issue**: {finding.get('issue', '')}")
    if finding.get("suggested_comment"):
        user_parts.append(f"- **Suggested revision**: {finding['suggested_comment']}")
    if finding.get("location"):
        loc = finding["location"]
        if loc.get("section"):
            user_parts.append(f"- **Location**: {loc['section']}")
        if loc.get("text_excerpt"):
            user_parts.append(f"- **Excerpt**: 「{loc['text_excerpt']}」")
    user_parts.append("")

    if manuscript_excerpt and manuscript_excerpt.strip():
        user_parts.append("## Manuscript Context (Relevant Section)")
        # Truncate section text to avoid overwhelming the model
        excerpt = manuscript_excerpt.strip()
        if len(excerpt) > 4000:
            excerpt = excerpt[:4000] + "\n...(truncated)"
        user_parts.append(excerpt)
        user_parts.append("")

    user_parts.append("## Instructions")
    user_parts.append(default_prompt)
    if additional_prompt and additional_prompt.strip():
        user_parts.append("")
        user_parts.append("### Additional Instructions from the Reviewer")
        user_parts.append(additional_prompt.strip())

    # CRITICAL: JSON format reminder at the end of the user message —
    # some models prioritize the last instruction they see over the system prompt.
    user_parts.append("")
    user_parts.append("## Output Format (REQUIRED)")
    user_parts.append(
        "You MUST respond with ONLY a valid JSON object. "
        "Do NOT include markdown headings, bullet points, or any text outside the JSON. "
        "The JSON object must have exactly two keys: \"solution\" (English) and \"solution_ja\" (Japanese). "
        "Example: {\"solution\": \"Possible approaches in English...\", \"solution_ja\": \"日本語での考えられる方向性...\"}"
    )

    user_message = "\n".join(user_parts)

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_overall_assessment_candidates_messages(
    abstract: str | None,
    check_data: list[dict],
    novelty_summary: dict | None = None,
    novelty_assessment: str | None = None,
    journal_profile: dict | None = None,
    volume: str = "standard",
) -> list[dict]:
    """Build messages to generate candidate blocks for the overall assessment (全体所感).

    Generates candidates for three sections:
    1. テーマ性・新規性 (Theme and Novelty) — 3-5 topics
    2. 投稿ジャーナル適合性 (Journal Fit) — 2-3 topics
    3. 主要問題点 (Key Issues) — top 5 major-severity findings

    Args:
        abstract: str or None — manuscript abstract
        check_data: list of dicts from merged.section.json files
        novelty_summary: dict or None — from novelty_summary.json
        novelty_assessment: str or None — from novelty_assessment.md
        journal_profile: dict or None — from journal_profile.json
        volume: "brief" (~1 line), "standard" (~2 lines), or "detailed" (~3 lines)

    Returns:
        list of {"role": str, "content": str} messages
    """
    volume_map = {
        "brief": "ALL candidates must be a single short, simple sentence. Half a line. "
                 "Strip all elaboration — state only the absolute core.",
        "standard": "ALL candidates should be 1-2 short sentences (~1 line). "
                    "Keep it tight and focused.",
        "detailed": "ALL candidates should be 2 short sentences (~1-2 lines). "
                     "Be succinct; include only essential reasoning.",
    }
    volume_instruction = volume_map.get(volume, volume_map["standard"])

    system_prompt = """\
You are an experienced manuscript check assistant preparing candidate assessment blocks
for a manuscript check. Your task is to generate candidate text blocks
for FOUR distinct sections of an overall assessment (全体所感). The user will
later select which candidates to include in the final assessment.

For each section, generate candidate items with BOTH English and Japanese text,
written in a collegial, constructive constructive, collegial check style.

CRITICAL — Volume:
{VOLUME_INSTRUCTION}

CRITICAL — Tone:
- Use tentative, constructive, collegial language
- NEVER use imperative/command forms. Instead use: "might benefit from",
  "could consider", "may wish to", "it would be helpful to"
- In Japanese: use 「〜が考えられます」「〜するとよいかもしれません」
  「〜という印象を受けます」— never 「〜すべきだ」「〜しなさい」

---

## Section 1: テーマ性・新規性 (Theme and Novelty)
Generate 3-5 candidate topics covering different aspects of the manuscript's
thematic contribution and novelty. Consider:
- The core research question and its originality
- How the work advances or differs from existing literature
- The significance and timeliness of the topic
- Whether novelty claims are well-supported
- Cautions about overclaiming (if applicable)

Each candidate should focus on ONE aspect. Avoid overlap between candidates.

## Section 2: 投稿ジャーナル適合性 (Journal Fit)
Generate 2-3 candidate topics assessing how well the manuscript fits the
target journal's scope, standards, and evaluation criteria. Consider:
- Alignment with the journal's stated scope and priorities
- Whether the contribution level matches the journal's expectations
- Methodological standards relative to journal norms
- Readership and audience fit

CRITICAL — Soundness-oriented journals (e.g., Scientific Reports, PLOS ONE):
These journals explicitly evaluate scientific validity and technical soundness
rather than novelty or perceived importance. Editors are instructed NOT to
reject based on lack of novelty. For such journals (technical_soundness_focus=true
AND novelty_required=low/not_explicitly_required):
- DO NOT evaluate novelty — the journal does not consider it a criterion.
  Instead, assess whether the manuscript meets soundness criteria: scientifically
  valid, technically sound, methods adequately described for reproducibility,
  and conclusions fully supported by the presented data.
- Use the journal's official language: "scientifically valid," "technically sound,"
  "conclusions are [fully/partially/not] supported by the data."
- Reference the journal's explicit policy that methodological rigour and
  reproducibility are the acceptance criteria, not novelty or impact.
- Frame candidates around: (a) whether methodological standards are met,
  (b) whether data reporting is complete and transparent, (c) whether
  conclusions are appropriately calibrated to the evidence.

Each candidate should focus on ONE aspect.

## Section 3: 達成点 (Achieved Points / Strengths)
This is a pre-submission check overall assessment. Generate 5 candidate variations of
the achievements/strengths assessment, where each candidate varies along TWO
axes — YOU decide the best combinations:

**Axis A — Length / verbosity:**
- 簡潔 (brief): 1 sentence, ~1 line
- 標準 (standard): 2-3 sentences, ~2 lines
- 詳細 (detailed): 3-4 sentences, ~3 lines

**Axis B — Emphasis / focus (where to place the weight):**
- 研究デザイン寄り (research-design-leaning)
- データ・分析寄り (data/analysis-leaning)
- 理論・文献寄り (theory/literature-leaning)
- 学術的貢献寄り (contribution/significance-leaning)
- バランス型 (balanced — covers multiple aspects evenly)

Choose 5 distinct, useful combinations. For example: brief+balanced,
standard+design, detailed+contribution, brief+data, standard+theory.
Do NOT repeat the same combination.

Each candidate must include a `style` object with `ja` and `en` labels
describing the variant (e.g. "簡潔・バランス型" / "Brief · Balanced").

Use ids: achievement_1 through achievement_5.

---

## Section 4: 主要問題点 (Key Issues)
This is a pre-submission check overall assessment. Generate 5 candidate variations of
the key issues assessment, where each candidate varies along TWO axes — YOU
decide the best combinations:

**Axis A — Length / verbosity:**
- 簡潔 (brief): 1 sentence, ~1 line
- 標準 (standard): 2-3 sentences, ~2 lines
- 詳細 (detailed): 3-4 sentences, ~3 lines

**Axis B — Emphasis / focus (where to place the weight):**
- 統計・解析寄り (statistics/analysis-leaning)
- 論理・立論寄り (logic/argumentation-leaning)
- 論文執筆の完成度寄り (writing/completeness-leaning — reporting gaps, transparency)
- データと結論の整合性寄り (data-conclusion alignment-leaning)
- バランス型 (balanced — covers multiple aspects evenly)

Choose 5 distinct, useful combinations. For example: brief+stats,
standard+logic, detailed+writing, brief+alignment, standard+balanced.
Do NOT repeat the same combination.

Each candidate must include a `style` object with `ja` and `en` labels
describing the variant (e.g. "標準・統計寄り" / "Standard · Stats-leaning").

Use ids: issue_1 through issue_5.

---

OUTPUT FORMAT (REQUIRED):
Respond with ONLY a valid JSON object. No markdown, no explanation outside JSON.

{
  "sections": {
    "novelty_theme": {
      "label_ja": "テーマ性・新規性",
      "label_en": "Theme and Novelty",
      "candidates": [
        {
          "id": "novelty_1",
          "text_ja": "日本語テキスト（2〜4文、チェックレポート調）",
          "text_en": "English text (2-4 sentences, review comment style)",
          "strength": "strong|moderate|cautious",
          "recommendation": "high|medium|low"
        }
      ]
    },
    "journal_fit": {
      "label_ja": "投稿ジャーナル適合性",
      "label_en": "Journal Fit",
      "candidates": [
        {
          "id": "journal_fit_1",
          "text_ja": "...",
          "text_en": "...",
          "strength": "strong|moderate|cautious",
          "recommendation": "high|medium|low"
        }
      ]
    },
    "achievements": {
      "label_ja": "達成点",
      "label_en": "Achieved Points",
      "candidates": [
        {
          "id": "achievement_1",
          "style": { "ja": "簡潔・バランス型", "en": "Brief · Balanced" },
          "text_ja": "...",
          "text_en": "...",
          "strength": "strong|moderate|cautious",
          "recommendation": "high|medium|low"
        }
      ]
    },
    "key_issues": {
      "label_ja": "主要問題点",
      "label_en": "Key Issues",
      "candidates": [
        {
          "id": "issue_1",
          "style": { "ja": "標準・統計寄り", "en": "Standard · Stats-leaning" },
          "text_ja": "...",
          "text_en": "...",
          "strength": "strong|moderate|cautious",
          "recommendation": "high|medium|low"
        }
      ]
    }
  }
}

IMPORTANT:
- novelty_theme: 3-5 candidates
- journal_fit: 2-3 candidates
- achievements: exactly 5 candidates (achievement_1 through achievement_5)
  Each must have a `style` field with `ja` and `en` labels describing the variant.
  Each candidate must use a DISTINCT length×emphasis combination.
- key_issues: exactly 5 candidates (issue_1 through issue_5)
  Each must have a `style` field with `ja` and `en` labels describing the variant.
  Each candidate must use a DISTINCT length×emphasis combination.
- achievements and key_issues are OVERALL ASSESSMENT summaries, not detailed findings
- Each id must be unique across all sections"""

    system_prompt = system_prompt.replace("{VOLUME_INSTRUCTION}", volume_instruction)

    user_parts = []

    # ── Manuscript abstract ──
    user_parts.append("## Manuscript Abstract")
    user_parts.append("")
    if abstract and abstract.strip():
        ab = abstract.strip()
        if len(ab) > 2000:
            ab = ab[:2000] + "\n...(truncated)"
        user_parts.append(ab)
    else:
        user_parts.append("No abstract available.")
    user_parts.append("")

    # ── Novelty data (for sections 1 & 2) ──
    if novelty_summary:
        user_parts.append("## Novelty Summary")
        user_parts.append("")
        user_parts.append("```json")
        user_parts.append(json.dumps(novelty_summary, ensure_ascii=False, indent=2))
        user_parts.append("```")
        user_parts.append("")

    if novelty_assessment:
        user_parts.append("## Novelty Assessment")
        user_parts.append("")
        na = novelty_assessment.strip()
        if len(na) > 4000:
            na = na[:4000] + "\n...(truncated)"
        user_parts.append(na)
        user_parts.append("")

    # ── Journal profile (for section 2) ──
    if journal_profile:
        user_parts.append("## Target Journal Profile")
        user_parts.append("")
        jp = journal_profile
        user_parts.append(f"- Journal: {jp.get('journal_name', 'Unknown')}")
        user_parts.append("")
        # Evaluation axis (most important for journal fit)
        rp = jp.get("review_policy", {})
        if rp:
            nr = rp.get("novelty_requirement", "")
            if nr:
                user_parts.append(f"**Official novelty policy**: {nr}")
                user_parts.append("")
            rg = rp.get("reviewer_guidance", "")
            if rg:
                user_parts.append(f"**Reviewer guidance**: {rg}")
                user_parts.append("")
        # Publication criteria
        pc = jp.get("publication_criteria", {})
        if pc:
            user_parts.append("**Publication criteria**:")
            for key, val in pc.items():
                user_parts.append(f"- {key}: {val}")
        user_parts.append("")

    # ── Review checks completed ──
    user_parts.append("## Review Checks Completed")
    user_parts.append("")
    for cd in check_data:
        user_parts.append(f"- {cd['label_ja']} ({cd['check_name']})")
    user_parts.append("")

    # ── Per-check summaries ──
    user_parts.append("## Per-Check Summaries and Key Findings")
    user_parts.append("")
    for cd in check_data:
        user_parts.append(f"### {cd['label_ja']} ({cd['check_name']})")
        user_parts.append("")
        user_parts.append(f"**Summary**: {cd.get('summary', 'No summary available.')}")
        user_parts.append("")
        user_parts.append(
            f"**Stats**: {cd['total']} findings total "
            f"({cd['major']} major, {cd['minor']} minor)"
        )
        user_parts.append("")
        # Major/high-confidence findings with IDs
        kfs = cd.get("key_findings", [])
        if kfs:
            user_parts.append("**Major findings (high confidence):**")
            for kf in kfs:
                section = kf.get("section", "N/A")
                category = kf.get("category", "")
                issue = kf.get("issue", "")
                cid = kf.get("comment_id", "")
                prefix = f"[{category}] " if category else ""
                id_suffix = f" (ID: {cid})" if cid else ""
                user_parts.append(f"- {prefix}{section}: {issue}{id_suffix}")
        user_parts.append("")

    # ── Output format reminder ──
    user_parts.append("## Output Format (REQUIRED)")
    user_parts.append(
        "Generate candidate blocks following the JSON schema above. "
        "Respond with ONLY the JSON object."
    )

    user_message = "\n".join(user_parts)

    # Truncate if too long
    if len(user_message) > 80_000:
        user_message = user_message[:80_000]
        user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_single_section_candidates_messages(
    section_key: str,
    abstract: str | None,
    check_data: list[dict],
    novelty_summary: dict | None = None,
    novelty_assessment: str | None = None,
    journal_profile: dict | None = None,
    volume: str = "standard",
    focus: list[str] | None = None,
    novelty_achievement: str | None = None,
    tone: str = "neutral",
) -> list[dict]:
    """Build messages to regenerate candidates for a single section.

    Args:
        section_key: one of "novelty_theme", "journal_fit", "achievements", "key_issues"
        focus: list of focus keys (e.g. ["theme", "data"]). When set and not just ["general"],
               generates a single focused candidate instead of multiple variations.
        novelty_achievement: content of novelty_achievement.md (for novelty_theme section)
        tone: tone of the assessment — "positive", "mild_positive", "neutral",
              "mild_negative", "negative"
    """
    volume_map = {
        "brief": "candidates must be a single short, simple sentence. Half a line. Be extremely concise.",
        "standard": "candidates should be 1-2 short sentences (~1 line). Keep it tight.",
        "detailed": "candidates should be 2 short sentences (~1-2 lines). Be succinct.",
    }
    volume_instruction = volume_map.get(volume, volume_map["standard"])

    tone_map = {
        "positive": "FILTER: List ONLY the paper's positive/strong points — "
                    "what it does well, its strengths, merits, and contributions. "
                    "Exclude anything negative, critical, or problematic.",
        "mild_positive": "FILTER: List the paper's mildly positive aspects — "
                         "things that are decent or promising but not outstanding. "
                         "Exclude strong praise and exclude criticism.",
        "neutral": "FILTER: List neutral, factual observations about the paper. "
                   "State what exists without evaluating whether it is good or bad.",
        "mild_negative": "FILTER: List the paper's mildly negative or questionable points — "
                         "minor weaknesses, small concerns, or areas that could be improved. "
                         "Exclude strong criticism and exclude praise.",
        "negative": "FILTER: List ONLY the paper's problems, weaknesses, limitations, "
                    "and shortcomings. Exclude anything positive or praiseworthy.",
    }
    tone_instruction = tone_map.get(tone, tone_map["neutral"])

    # Focus mode: if focus is provided and not just ["general"], generate 1 focused candidate
    focus_labels = {
        "theme": "テーマ性・新規性 (Theme & Novelty)",
        "data": "データの質・妥当性 (Data Quality & Validity)",
        "analysis": "分析手法・解析 (Analysis Methods)",
        "writing": "論述・表現 (Writing & Argumentation)",
        "general": "全般 (General)",
    }
    is_focused = focus and focus != ["general"] and len(focus) > 0
    if is_focused:
        focus_names = [focus_labels.get(f, f) for f in focus]
        focus_str = "・".join(focus_names)

    section_info = {
        "novelty_theme": {
            "label_ja": "新規性",
            "label_en": "Novelty",
            "count": "3-5 candidates",
            "ids": "novelty_1 through novelty_5",
            "guidance": """Generate 3-5 candidate topics covering different aspects of the manuscript's
thematic contribution and novelty. Consider: originality, advancement over
existing literature, significance, whether novelty claims are well-supported,
and cautions about overclaiming. Each candidate should focus on ONE aspect.""",
        },
        "journal_fit": {
            "label_ja": "適合性",
            "label_en": "Journal Fit",
            "count": "2-3 candidates",
            "ids": "journal_fit_1 through journal_fit_3",
            "guidance": """Generate 2-3 candidate topics assessing how well the manuscript fits the
target journal's scope, standards, and evaluation criteria.
ONE candidate MUST state the journal's editorial policy / acceptance criteria
as a plain factual description (e.g. "Scientific Reports prioritizes technical
soundness and methodological rigour as primary acceptance criteria, without
requiring high novelty or impact."). Extract this from the Target Journal
Profile. This policy-statement candidate should be the FIRST candidate.
If the journal is soundness-oriented (technical_soundness_focus=true,
novelty_required=low/not_explicitly_required), DO NOT evaluate novelty —
assess methodological soundness, reproducibility, and whether conclusions
are supported by data. Use the journal's official language.
Each candidate should focus on ONE aspect.""",
        },
        "achievements": {
            "label_ja": "達成点",
            "label_en": "Achieved Points",
            "count": "exactly 5 candidates",
            "ids": "achievement_1 through achievement_5",
            "guidance": """Generate 5 candidate variations of the achievements/strengths assessment.
Vary along TWO axes (YOU choose the best 5 distinct combinations):
- Length: brief (1 line) / standard (2 lines) / detailed (3 lines)
- Emphasis: research-design / data-analysis / theory-literature / contribution-significance / balanced
Each candidate MUST include a 'style' object with 'ja' and 'en' labels
(e.g. {"ja": "簡潔・バランス型", "en": "Brief · Balanced"}).""",
        },
        "key_issues": {
            "label_ja": "問題点",
            "label_en": "Key Issues",
            "count": "exactly 5 candidates",
            "ids": "issue_1 through issue_5",
            "guidance": """Generate 5 candidate variations of the key issues assessment.
Vary along TWO axes (YOU choose the best 5 distinct combinations):
- Length: brief (1 line) / standard (2 lines) / detailed (3 lines)
- Emphasis: statistics-analysis / logic-argumentation / writing-completeness / data-conclusion-alignment / balanced
Each candidate MUST include a 'style' object with 'ja' and 'en' labels
(e.g. {"ja": "標準・統計寄り", "en": "Standard · Stats-leaning"}).""",
        },
    }

    info = section_info[section_key]

    # Override for focused mode: single candidate
    if is_focused:
        focus_guidance_map = {
            "theme": "Focus on thematic contribution and novelty claims — originality, advancement over literature, significance.",
            "data": "Focus on data quality, validity, sample size, measurement appropriateness.",
            "analysis": "Focus on analytical methods, statistical rigor, interpretation validity.",
            "writing": "Focus on argumentation clarity, logical structure, writing completeness.",
        }
        focus_guidance_parts = [focus_guidance_map.get(f, f"Focus on {f} aspects.") for f in focus]
        focus_guidance = " ".join(focus_guidance_parts)
        # Per-section focused guidance additions
        section_focus_extra = ""
        if section_key == "journal_fit":
            section_focus_extra = (
                "\n\nCRITICAL for journal_fit: ONE candidate MUST be a plain statement "
                "of the journal's editorial policy / acceptance criteria, extracted from "
                "the Target Journal Profile in the input. This is the journal's own "
                "stated standards (e.g. \"Scientific Reports prioritizes technical "
                "soundness and methodological rigour as primary acceptance criteria, "
                "without requiring high novelty or impact.\"). "
                "State it as a factual description — do NOT evaluate whether the "
                "manuscript meets these criteria. This policy-statement candidate "
                "should be the FIRST candidate."
            )
        elif section_key == "key_issues":
            section_focus_extra = (
                "\n\nCRITICAL for key_issues: Draw each observation DIRECTLY from the "
                "Problems Identified in Review Checks section of the input. Each candidate "
                "should correspond to a concrete problem found in the expression, "
                "methods/statistics, or logic/argument checks. Reference the specific "
                "finding (comment ID, section) when stating the issue. "
                "State what the problem IS — do NOT add evaluation of its severity or impact."
            )

        info_override = {
            "count": "exactly 3-5 candidates (ONE per observation)",
            "ids": f"{section_key}_obs_1 through {section_key}_obs_5",
            "guidance": f"Filter for: {focus_str}.\n{focus_guidance}\n\n"
                        f"Generate 3-5 candidates. Each candidate is ONE plain observation — "
                        f"a single short sentence stating a fact, finding, or characteristic of the paper. "
                        f"CRITICAL: State ONLY the observation itself. Do NOT append any value judgment, "
                        f"evaluation, or conclusion about its significance. "
                        f"NEVER end with phrases like 「〜として注目されます」「〜が大きな新規性です」"
                        f"「〜が評価できます」「〜は重要である」「〜と言える」「〜が認められる」"
                        f"「〜と考えられます」「〜という印象を受けます」「〜かもしれません」. "
                        f"If the observation is a positive point, state WHAT the paper does — "
                        f"do NOT add that it is 'good' or 'notable' or 'significant'. "
                        f"The fact that it's listed already conveys the evaluation. "
                        f"Do NOT write flowing prose or paragraphs. "
                        f"Each candidate = 1 short, flat, value-neutral statement of what the paper does/shows/has."
                        + section_focus_extra,
        }
        effective_info = {**info, **info_override}
    else:
        effective_info = info

    if is_focused:
        lang_instr = "Write ONLY in English. Set text_ja to empty string \"\" — a separate translation step will fill it."
        tone_instr = """- Write plain, factual observations — NOT evaluative prose; write constructive, specific observations
- State ONLY what the paper does/shows/has. Do NOT append value judgments.
- NEVER use 「〜として注目されます」「〜が大きな新規性です」「〜が評価できる」
  「〜は重要である」「〜と言える」「〜が認められる」「〜点が特筆される」
- NEVER use 「〜と考えられます」「〜という印象を受けます」「〜かもしれません」
- NEVER use 「〜すべきだ」「〜しなさい」
- Each candidate is one short, flat, value-neutral statement"""
        style_instr = "Write plain, factual observations. State WHAT is, not whether it is GOOD."
    else:
        lang_instr = "Write BOTH English and Japanese text."
        tone_instr = """- Use tentative, constructive, collegial language
- NEVER use imperative/command forms
- In Japanese: use 「〜が考えられます」「〜するとよいかもしれません」
  「〜という印象を受けます」— never 「〜すべきだ」「〜しなさい」"""
        style_instr = "Write in a collegial, constructive constructive, collegial check style."

    system_prompt = f"""\
You are an experienced manuscript check assistant. {'Generate' if is_focused else 'Regenerate ONLY the candidates for'}
the "{effective_info['label_ja']} / {effective_info['label_en']}" section of a pre-submission check overall assessment.

Generate {effective_info['count']} ({effective_info['ids']}). {lang_instr}
{style_instr}

{"" if is_focused else f"CRITICAL — Volume:\n{volume_instruction}\n"}
CRITICAL — Tone (assessment stance):
{tone_instruction}

CRITICAL — Language Tone:
{tone_instr}

{effective_info['guidance']}

OUTPUT FORMAT (REQUIRED):
Respond with ONLY a valid JSON object:
{{
  "sections": {{
    "{section_key}": {{
      "label_ja": "{effective_info['label_ja']}",
      "label_en": "{effective_info['label_en']}",
      "candidates": [
        {{
          "id": "...",
          "text_ja": "...",
          "text_en": "...",
          "strength": "strong|moderate|cautious",
          "recommendation": "high|medium|low"
        }}
      ]
    }}
  }}
}}
{'''For achievements and key_issues, each candidate must also include:
"style": {{ "ja": "...", "en": "..." }}''' if not is_focused and section_key in ("achievements", "key_issues") else ""}"""

    user_parts = []

    if abstract and abstract.strip():
        ab = abstract.strip()
        if len(ab) > 2000:
            ab = ab[:2000] + "\n...(truncated)"
        user_parts.append("## Manuscript Abstract\n\n" + ab + "\n")

    if novelty_summary:
        user_parts.append("## Novelty Summary\n```json\n" +
                          json.dumps(novelty_summary, ensure_ascii=False, indent=2) +
                          "\n```\n")

    if novelty_assessment:
        na = novelty_assessment.strip()
        if len(na) > 4000:
            na = na[:4000] + "\n...(truncated)"
        user_parts.append("## Novelty Assessment\n\n" + na + "\n")

    if section_key in ("novelty_theme", "achievements") and novelty_achievement:
        na = novelty_achievement.strip()
        if len(na) > 4000:
            na = na[:4000] + "\n...(truncated)"
        user_parts.append("## Novelty Achievement Evaluation (新規性達成度)\n\n" + na + "\n")

    if journal_profile:
        jp = journal_profile
        user_parts.append("## Target Journal Profile\n")
        user_parts.append(f"- Journal: {jp.get('journal_name', 'Unknown')}\n")
        rp = jp.get("review_policy", {})
        if rp.get("novelty_requirement"):
            user_parts.append(f"**Official novelty policy**: {rp['novelty_requirement']}\n")
        if rp.get("reviewer_guidance"):
            user_parts.append(f"**Reviewer guidance**: {rp['reviewer_guidance']}\n")
        pc = jp.get("publication_criteria", {})
        if pc:
            user_parts.append("**Publication criteria**:\n")
            for key, val in pc.items():
                user_parts.append(f"- {key}: {val}\n")
        user_parts.append("")

    for cd in check_data:
        user_parts.append(f"### {cd['label_ja']} ({cd['check_name']})\n")
        user_parts.append(f"**Summary**: {cd.get('summary', 'No summary.')}\n")
        user_parts.append(f"**Stats**: {cd['total']} findings ({cd['major']} major, {cd['minor']} minor)\n")
        # For focused mode with positive/negative tone, suppress or emphasize findings
        if is_focused and tone in ("positive",):
            # positive: skip findings entirely — only show summary
            pass
        elif is_focused and tone in ("negative",):
            # negative: show findings prominently
            kfs = cd.get("key_findings", [])
            if kfs:
                user_parts.append("**Critical problems to emphasize:**\n")
                for kf in kfs:
                    cat = f"[{kf['category']}] " if kf.get("category") else ""
                    cid = f" (ID: {kf['comment_id']})" if kf.get("comment_id") else ""
                    user_parts.append(f"- {cat}{kf['section']}: {kf['issue']}{cid}\n")
        else:
            kfs = cd.get("key_findings", [])
            if kfs:
                user_parts.append("**Major findings (high confidence):**\n")
                for kf in kfs:
                    cat = f"[{kf['category']}] " if kf.get("category") else ""
                    cid = f" (ID: {kf['comment_id']})" if kf.get("comment_id") else ""
                    user_parts.append(f"- {cat}{kf['section']}: {kf['issue']}{cid}\n")
        user_parts.append("")

    user_parts.append("## Output Requirement\n")
    if is_focused:
        user_parts.append(f"Content filter: {focus_str}. Tone filter: {tone}. "
                          "Generate 3-5 candidates — each is ONE plain observation. "
                          "Output exactly the JSON format specified above.")
    else:
        user_parts.append(f"Regenerate ONLY the '{effective_info['label_ja']}' section. "
                          "Output exactly the JSON format specified above.")

    user_message = "\n".join(user_parts)

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_overall_assessment_compose_messages(
    selected_candidates_json: str,
    abstract: str | None = None,
    free_text: str | None = None,
) -> list[dict]:
    """Build messages to compose the final overall assessment from selected candidates.

    Takes the user-selected candidates (as JSON), optional free text,
    and generates a cohesive overall assessment (全体所感) in English.
    A separate translation step will produce the Japanese version.

    Args:
        selected_candidates_json: JSON string of selected candidates
        abstract: str or None — manuscript abstract for context
        free_text: str or None — user's free text notes to incorporate

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """\
You are an experienced manuscript check assistant composing the final overall assessment
for a manuscript check. You have been given user-selected candidate text
blocks across four sections (novelty, journal fit, achievements, key issues)
plus optional free-text notes from the reviewer. Your task is to arrange and
integrate them into a cohesive, flowing assessment.

CRITICAL: Write in ENGLISH only. A separate step will handle Japanese translation.

The assessment should flow naturally as a single integrated text — do NOT
output separate sections or bullet points. The text should read as a
professional check report.

ARRANGEMENT RULES:
- Order the content to tell a coherent story, NOT necessarily in section order.
- A natural flow might be: (1) theme/novelty context, (2) journal fit,
  (3) what the manuscript does well, (4) what needs improvement,
  (5) free-text remarks woven in naturally.
- Merge related points from different sections where they overlap.
- The free text should be blended in naturally — do NOT quote it verbatim
  or label it as "free text".

Structure the assessment as follows:
1. Open with an overall impression that incorporates the theme/novelty and
   journal fit assessments naturally
2. Present achievements and strengths
3. Transition into key issues, organizing them thematically
4. Integrate any free-text remarks where they fit naturally
5. End with a brief summary paragraph on the overall state of the manuscript

CRITICAL — Tone:
- Use tentative, constructive, collegial language
- NEVER use imperative/command forms. Instead use: "might benefit from",
  "could consider", "may wish to", "it would be helpful to"

IMPORTANT:
- Use ONLY the selected candidates and free text; do not introduce new content
- Remove redundancies and integrate smoothly
- Aim for 3-5 paragraphs
- This is a PEER REVIEW assessment, not a cover letter or editor's note

OUTPUT FORMAT (REQUIRED):
Respond with ONLY a valid JSON object:

{
  "assessment_en": "English overall assessment (3-5 paragraphs, integrated flow)",
  "summary_en": "1-2 sentence summary in English (used as basis for final verdict)"
}"""

    user_parts = []

    if abstract and abstract.strip():
        ab = abstract.strip()
        if len(ab) > 1500:
            ab = ab[:1500] + "\n...(truncated)"
        user_parts.append("## Manuscript Abstract (for context)")
        user_parts.append("")
        user_parts.append(ab)
        user_parts.append("")

    user_parts.append("## Selected Candidate Blocks")
    user_parts.append("")
    user_parts.append(selected_candidates_json)
    user_parts.append("")

    if free_text:
        ft = free_text.strip()
        if len(ft) > 3000:
            ft = ft[:3000] + "\n...(truncated)"
        user_parts.append("## Reviewer's Free-Text Notes")
        user_parts.append("")
        user_parts.append(ft)
        user_parts.append("")

    user_parts.append("## Instructions")
    user_parts.append(
        "Compose the final overall assessment using ONLY the selected candidates "
        "and free-text notes above. Arrange them into a logically flowing narrative "
        "that reads as a cohesive check report. Do NOT simply concatenate"
        "sections — reorder and merge related points for coherence. "
        "The output must be JSON with assessment_en and summary_en keys."
    )

    user_message = "\n".join(user_parts)

    if len(user_message) > 60_000:
        user_message = user_message[:60_000]

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_overall_assessment_translate_messages(
    assessment_en: str,
) -> list[dict]:
    """Build messages to translate the English overall assessment to Japanese.

    Args:
        assessment_en: English assessment text

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """\
You are a professional academic translator. Translate the following English
pre-submission check overall assessment into natural, fluent Japanese.

CRITICAL — Tone in Japanese:
- Use tentative, constructive, collegial language
- Use 「〜が考えられます」「〜するとよいかもしれません」
  「〜という印象を受けます」
- NEVER use 「〜すべきだ」「〜しなさい」
- Maintain the original meaning precisely
- The output should read as a natural Japanese academic text

CRITICAL — Output ONLY the Japanese translation. Do NOT include the original
English, any explanations, or any markdown formatting beyond plain paragraphs."""

    user_message = (
        "Translate the following English overall assessment into Japanese. "
        "Output ONLY the Japanese text, no English, no explanations:\n\n"
        + assessment_en
    )

    if len(user_message) > 40_000:
        user_message = user_message[:40_000]

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
