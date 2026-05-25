"""Prompts and templates for the novelty check module."""

import json

# =============================================================================
# Deep Research prompt templates (two types)
# =============================================================================

# ── A: Broad search prompt ──────────────────────────────────────────────

NOVELTY_DEEP_RESEARCH_PROMPT_BROAD = """\
You are a research assistant specializing in literature surveys in medicine, psychology, and social sciences.
Based on the manuscript summary below, evaluate its novelty, originality, limitations, and fit with the target journal by comparing it against prior studies.

The goal is NOT simply to check "whether similar papers exist."
The goal is to make a multi-faceted judgment about what is truly new (or not new) about this manuscript relative to the existing literature.

【Manuscript Summary】
Use the following information for your investigation.

- Research Topic:
{research_topic}

- Objective:
{objective}

- Participants / Sample:
{sample_summary}

- Study Design:
{design}

- Intervention / Survey / Observation Details:
{methods_summary}

- Measures / Outcomes Used:
{measures}

- Statistical Analyses:
{statistics}

- Main Findings:
{findings}

- Contributions Claimed by Authors:
{claimed_contributions}

- Target Journal:
{target_journal}

---

Investigate the following perspectives, citing specific references wherever possible.

1. Key prior studies on the same research topic
   - List representative papers.
   - For each, summarize the objective, participants, sample size, country/region, study design, primary outcomes, and main findings.

2. Studies with similar participants / samples
   - Search for studies with similar age groups, diseases/symptoms, clinical populations, settings, regions, or cultural backgrounds.
   - Indicate where the participants overlap with and differ from the current manuscript.

3. Studies using similar methods / interventions / survey designs
   - Search for studies employing similar interventions, observations, surveys, practices, or evaluation methods.
   - Judge whether the manuscript's methods are standard, innovative, or unusual compared to prior work.

4. Studies using similar outcomes / measures
   - Search for studies using measures or outcomes similar to those in the current manuscript.
   - Summarize which outcomes were emphasized in prior research.

5. Studies using similar statistical analyses
   - Check for studies using similar approaches (small-sample analysis, longitudinal analysis, mixed models, GEE, Bayesian analysis, effect sizes, sensitivity analyses, etc.).
   - Evaluate whether the manuscript's statistical analyses are sufficient, innovative, or deficient relative to field standards.

6. Novelty Assessment
   Evaluate the manuscript's novelty from each of the following angles:

   - Novelty of theme
   - Novelty of participants / sample
   - Novelty of methods / intervention / survey approach
   - Novelty of outcomes / measures
   - Novelty of statistical analyses
   - Rarity of the data
   - Clinical / practical / societal significance
   - Theoretical contribution
   - International significance
   - Significance as data from Japan or a specific region

7. Overlap and Weakness Assessment
   - What has already been well-established in prior studies?
   - What aspects make it difficult for this manuscript to claim novelty?
   - Identify specific weaknesses regarding sample size, study design, statistical analysis, follow-up period, presence/absence of comparison groups, etc.

8. Fit with Target Journal
   - Check the target journal's scope, readership, and the profile of its published articles.
   - Where possible, check the impact factor, CiteScore, Scimago Journal Rank, quartile, and field rankings.
   - Assess whether the manuscript's novelty, methodological strength, and clinical/societal significance meet the journal's standards.
   - Indicate: "Strong fit" / "Moderate fit" / "Somewhat insufficient" / "Clearly insufficient."
   - If insufficient, suggest what could be strengthened to improve publishability.

9. Alternative Journal Candidates
   - If there are journals that might be a better fit, list candidates.
   - For each, briefly describe the scope, expected readership, approximate journal rank, and compatibility with the current manuscript.

10. Final Assessment
    Summarize using the following format:

    - Strongest novelty of this manuscript:
    - Supporting novelty of this manuscript:
    - Aspects where novelty is difficult to claim:
    - Fit with target journal:
    - Points to strengthen before submission:
    - Points to emphasize in the abstract or cover letter:
    - Overall judgment:

Provide as much specific reference information as possible in your output.
When citing references, include author names, year, title, journal name, volume, issue, pages, and DOI or URL to the extent available.
If evidence is uncertain, clearly state that it is uncertain.
"""


# ── B: Critical verification prompt ─────────────────────────────────────

NOVELTY_DEEP_RESEARCH_PROMPT_CRITICAL = """\
You are a research assistant specializing in literature surveys in medicine, psychology, and social sciences.
From a **critical standpoint**, rigorously verify whether the novelty claims of the manuscript below actually hold up.

The goal is not to take the manuscript's novelty claims at face value, but to critically examine "whether this can truly be called new."

【Manuscript Summary】
Use the following information for your investigation.

- Research Topic:
{research_topic}

- Objective:
{objective}

- Participants / Sample:
{sample_summary}

- Study Design:
{design}

- Intervention / Survey / Observation Details:
{methods_summary}

- Measures / Outcomes Used:
{measures}

- Statistical Analyses:
{statistics}

- Main Findings:
{findings}

- Contributions Claimed by Authors:
{claimed_contributions}

- Target Journal:
{target_journal}

---

Investigate the following perspectives, citing specific references wherever possible.

1. Are there studies that have already shown the same thing?
   - Search for studies reporting substantially the same results as this manuscript's main findings.
   - Pay particular attention to points the authors claim as "new" — check rigorously whether prior studies exist.

2. Are there studies with nearly identical participants or methods?
   - Search for studies with similar age groups, diseases/symptoms, sample sizes, study designs, interventions, and assessment measures.
   - If there are studies that are substantially equivalent to this manuscript, point them out specifically.

3. Aspects difficult to claim as novel
   - For each of theme, participants, methods, measures, and statistical analyses, identify points that "have already been sufficiently demonstrated in prior research."
   - Identify points the authors claim as "new" but which in reality are close to replication/confirmation of prior work.

4. Overlap with existing research
   - List specific prior studies that overlap with this manuscript.
   - Assess the degree of overlap (nearly identical / partially overlapping / similar but with some differences).

5. Weaknesses in sample size or study design
   - Is the sample size too small?
   - Are there fundamental weaknesses in the study design (lack of comparison group, inadequate randomization, short follow-up, unadjusted confounders, etc.)?

6. Weaknesses in statistical analyses
   - Are the statistical methods appropriate for the data structure?
   - Have corrections for multiple comparisons been applied?
   - Are there issues with interpretation of results (e.g., interpreting correlation as causation, downplaying non-significant results)?

7. Deficiencies relative to target journal standards
   - Compared to the target journal's typical published articles, are the sample size, study design rigor, and novelty level sufficient?
   - Predict issues that this journal's reviewers are likely to raise.

8. Points at risk of overclaiming
   - Predict points the authors may overclaim in the abstract or discussion.
   - Evaluate whether expressions like "first in the world," "significantly improved," or "groundbreaking method" would be justified.

9. Points likely to be targeted in peer review
   - List the problems reviewers would likely point out first.
   - Focus especially on points likely to be rejected in novelty-related comments.

10. Final Assessment
    Summarize using the following format:

    - Most questionable novelty claim:
    - Points clearly overlapping with prior research:
    - This manuscript's greatest methodological weakness:
    - Presence/absence of mismatch with target journal:
    - Risk of rejection in peer review (Low / Medium / High):
    - Minimum points to strengthen to avoid rejection:

Provide as much specific reference information as possible in your output.
When citing references, include author names, year, title, journal name, volume, issue, pages, and DOI or URL to the extent available.
If there is any decisive problem that "would lead to rejection without this," state it clearly.
If evidence is uncertain, clearly state that it is uncertain.
"""


# =============================================================================
# Phase 1: Paper summary + novelty extraction prompt
# =============================================================================

def build_novelty_summary_messages(
    manuscript_data: dict,
    section_texts: dict,
    section_map: dict | None,
    target_journal: str = "",
) -> list[dict]:
    """Build messages for the novelty-summarize command.

    Returns system and user messages instructing the LLM to read the full
    manuscript and produce a structured summary with multi-angle novelty
    identification.
    """
    system_prompt = """\
You are an expert assistant supporting peer review of academic manuscripts.
Read the manuscript provided and summarize/analyze it from the perspectives below.

Important instructions:
- All responses must be in English.
- If information is not stated in the manuscript, mark it as "Not stated."
- When evaluating novelty, consider not only thematic novelty but also multiple angles: participants, methods, statistical analyses, data rarity, practical significance, etc.
- For each item, provide specific evidence by quoting from the manuscript text.
- Distinguish between contributions claimed by the authors and points you objectively find to be novel.
- For angles where no particular novelty is recognized, clearly state "No particular novelty is recognized."
- List 5–10 keywords useful for literature searching, in English.

Output in the following JSON format. Do NOT output any text other than JSON.

```json
{
  "research_topic": "Research topic (1–2 sentences)",
  "objective": "Research objective (1–2 sentences)",
  "sample_summary": "Summary of participants/sample (including age, sex, disease, setting, region, sample size)",
  "design": "Study design (RCT, cross-sectional, longitudinal, qualitative, mixed methods, etc.)",
  "methods_summary": "Summary of intervention/survey/observation methods",
  "measures": "List of measures/outcome indicators used",
  "statistics": "Statistical analysis methods used",
  "findings": "Main results (primary and secondary outcomes)",
  "claimed_contributions": "Contributions claimed by the authors",
  "novelty_theme": "Novelty assessment of theme with evidence",
  "novelty_sample": "Novelty assessment of participants/sample with evidence",
  "novelty_methods": "Novelty assessment of methods/intervention with evidence",
  "novelty_statistics": "Novelty assessment of statistical analyses with evidence",
  "novelty_data_rarity": "Assessment of data rarity with evidence",
  "novelty_practical_significance": "Assessment of practical/clinical/societal significance with evidence",
  "target_journal_fit": "Preliminary assessment of fit with target journal (only if journal name is specified)",
  "keywords_for_search": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}
```"""

    # Build user message with sections
    user_parts = ["# 論文原稿\n"]

    journal_header = ""
    if target_journal and target_journal.strip():
        journal_header = f"\n## 投稿予定雑誌\n{target_journal.strip()}\n"

    # Prefer section texts if available
    if section_texts:
        user_parts.append(journal_header)
        section_order = [
            "abstract", "introduction", "aim_objective",
            "methods", "results", "discussion", "conclusion",
        ]
        for name in section_order:
            text = section_texts.get(name, "")
            if text:
                label = {
                    "abstract": "抄録",
                    "introduction": "はじめに",
                    "aim_objective": "目的",
                    "methods": "方法",
                    "results": "結果",
                    "discussion": "考察",
                    "conclusion": "結論",
                }.get(name, name)
                user_parts.append(f"## {label}\n{text}\n")
    else:
        # Fall back to manuscript paragraphs
        paragraphs = manuscript_data.get("paragraphs", [])
        if paragraphs:
            user_parts.append(journal_header)
            full_text = "\n\n".join(
                p.get("text", "") for p in paragraphs
            )
            user_parts.append(full_text)
        elif isinstance(manuscript_data, dict) and manuscript_data.get("full_text"):
            user_parts.append(journal_header)
            user_parts.append(manuscript_data["full_text"])

    user_message = "\n".join(user_parts)

    # Truncate if extremely long (120K chars)
    if len(user_message) > 120_000:
        user_message = user_message[:120_000] + "\n\n[本文は長すぎるため途中で切り捨てられました]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 4: Novelty assessment prompt
# =============================================================================

def build_novelty_assessment_messages(
    novelty_summary: dict,
    deep_research_text: str,
    journal_profile: dict | None = None,
    deep_research_count: int = 0,
    target_journal: str = "",
) -> list[dict]:
    """Build messages for the novelty-assess command (journal-aware).

    Takes the structured novelty summary, merged Deep Research results,
    and journal profile. Produces a comprehensive assessment that adapts
    to the journal's evaluation axis.
    """
    # Build journal evaluation axis summary
    journal_axis_desc = ""
    if journal_profile:
        jp = journal_profile
        pc = jp.get("publication_criteria", {})
        jp_pos = jp.get("journal_position", {})

        novelty_req = pc.get("novelty_required", "unknown")
        impact_req = pc.get("impact_required", "unknown")
        soundness = pc.get("technical_soundness_focus", "unknown")
        method_rigour = pc.get("methodological_rigour_focus", "unknown")
        stat_rigour = pc.get("statistical_rigour_focus", "unknown")
        conclusion_focus = pc.get("conclusion_supported_by_data_focus", "unknown")

        journal_name = jp.get("journal_name", "Unknown")

        # Determine journal type for guidance
        is_soundness_oriented = (
            soundness == "true"
            and novelty_req in ("low", "not_explicitly_required", "unknown")
        )
        is_high_impact = novelty_req == "high" or impact_req == "high"

        journal_axis_desc = f"""
## Target Journal's Evaluation Axis

- Journal name: {journal_name}
- Novelty emphasis: {novelty_req}
- Impact emphasis: {impact_req}
- Technical soundness emphasis: {soundness}
- Methodological rigour emphasis: {method_rigour}
- Statistical rigour emphasis: {stat_rigour}
- Conclusion-supported-by-data emphasis: {conclusion_focus}
"""

        if is_soundness_oriented:
            journal_axis_desc += """
**Assessment approach**: This journal is a technical soundness-oriented journal.
Rather than major thematic novelty or subjective impact, emphasize evaluating the following:
- It is original research
- The methods are scientifically valid
- Statistical analyses are appropriate for the data structure and sample size
- Conclusions are supported by the data
- No excessive causal claims or overgeneralization
- There is added value in one or more of: participants, context, data, methods, analysis, or practical significance

Expressions to avoid: highly novel, major conceptual advance, field-changing, groundbreaking, transformative
Preferred expressions: scientifically valid, methodologically sound, technically rigorous, statistically appropriate, conclusions supported by data, adds empirical evidence, examines underrepresented sample/context, contributes incremental but meaningful evidence
"""
        elif is_high_impact:
            journal_axis_desc += """
**Assessment approach**: This journal is a high-impact selective journal.
Emphasize evaluating the following:
- Thematic novelty
- Theoretical contribution
- Clinical / societal impact
- Interest to international readership
- Methodological strength
- Clear differentiation from existing research
- Significance in advancing the field

Expressions to avoid: merely adds data, incremental only, niche relevance only, limited local interest
Preferred expressions: advances the field, provides novel evidence, addresses an important gap, has broad implications
"""
        else:
            journal_axis_desc += """
**Assessment approach**: The journal's evaluation axis could not be clearly determined.
Evaluate from both a general novelty assessment perspective and what contributions this journal would likely value.
"""

    dr_note = ""
    if deep_research_count == 0:
        dr_note = "\n**Note**: This is a preliminary assessment without external research results.\n"
    elif deep_research_count == 1:
        dr_note = "\n**Note**: This is a preliminary assessment based on one external research result.\n"
    else:
        dr_note = "\n**Note**: This is an assessment integrating two external research results.\n"

    system_prompt = f"""\
You are a peer reviewer for an academic manuscript.
Based on the manuscript summary, the results of an external literature survey (Deep Research),
and the target journal profile information, evaluate the novelty and journal fit.
{dr_note}
CRITICAL LANGUAGE RULE:
- The literature survey input may be in English or Japanese (or a mix).
- Regardless of the input language, you MUST write ALL your response in English.
- Section headings, analysis, evaluation content, recommended expressions — everything must be in English.
- Never output Japanese text under any circumstances.

Other instructions:
- If specific references are cited in the literature survey results, refer to them explicitly.
- Do not overstate novelty.
- Adapt what to emphasize and what to avoid according to the journal's evaluation axis.
- Provide perspectives useful for reviewers when writing novelty-related comments.

Output in the following Markdown format.

# Novelty & Journal Fit Assessment

## 1. Target Journal's Evaluation Axis
[Based on journalProfile, briefly summarize what this journal evaluates]

## 2. Manuscript Summary
[Briefly summarize the research topic, participants, methods, analyses, main findings, and contributions claimed by the authors]

## 3. Novelty in a General Sense

### 3.1 Novelty of Theme
[Evaluate with reference to specific prior studies]

### 3.2 Novelty of Participants / Sample

### 3.3 Novelty of Methods / Intervention

### 3.4 Novelty of Measures / Outcomes

### 3.5 Innovation in Statistical Analyses

### 3.6 Rarity of Data

### 3.7 Practical / Clinical / Societal Significance

### 3.8 Theoretical Contribution

## 4. Contributions Likely Valued by This Journal
[Based on the journal's evaluation axis, evaluate what this journal would particularly value]
- For technical soundness-oriented journals: scientific validity, methodological adequacy, appropriate statistical analyses, conclusions supported by data, underrepresented sample/context, incremental but meaningful evidence
- For high-impact selective journals: thematic novelty, theoretical contribution, clinical/societal impact, importance to international readership, clear contribution to the field

## 5. Points That Can Be Strongly Claimed
[List with supporting evidence]

## 6. Points to State Cautiously
[Points at risk of overclaiming, limitations in design or sample size, analytical constraints, caveats regarding generalizability]

## 7. Overlap with Existing Research
[Points that overlap with existing studies. Specify which references and how they overlap]

## 8. Clear Differentiation from Existing Research
[Unique contributions of this manuscript not found in existing research]

## 9. Fit with Target Journal

Overall Judgment: [Strong fit / Moderate fit / Somewhat insufficient / Clearly insufficient]

[Explain the basis for this judgment]

## 10. Points to Strengthen Before Submission
- Introduction:
- Methods:
- Results:
- Discussion:
- Limitations:
- References:
- Supplementary materials:
- Data availability:
- Statistical reporting:

## 11. Directions Usable in Review Comments
- Expressions to emphasize
- Expressions to avoid
- Recommended expressions in English"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
    ]

    if journal_axis_desc:
        user_parts.append(journal_axis_desc)

    if target_journal and target_journal.strip():
        user_parts.append(f"\n## Target Journal\n{target_journal.strip()}\n")

    user_parts.append("\n# Literature Survey Results (Deep Research Integrated)\n")
    user_parts.append(deep_research_text)

    user_message = "\n".join(user_parts)

    # Truncate if needed
    if len(user_message) > 120_000:
        cutoff = 120_000
        dr_start = user_message.find("# Literature Survey Results")
        if dr_start > 0:
            summary_part = user_message[:dr_start]
            dr_part = user_message[dr_start:]
            available = cutoff - len(summary_part)
            if available > 5000:
                user_message = summary_part + dr_part[:available]
                user_message += "\n\n[Literature survey results truncated due to length]"
            else:
                user_message = user_message[:cutoff]
                user_message += "\n\n[Content truncated due to length]"
        else:
            user_message = user_message[:cutoff]
            user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Review checks panel: Novelty review section prompts
# =============================================================================

def build_novelty_review_journal_fit_messages(
    novelty_summary: dict,
    novelty_assessment: str,
    journal_profile: dict | None = None,
) -> list[dict]:
    """Build messages for the novelty-review-journal-fit command.

    Used by the ReviewChecksPanel's 新規性 tab (journal fit sub-tab).
    Takes the existing novelty assessment and produces a focused journal
    suitability evaluation with a top-level judgment block.
    """
    # Determine journal type
    journal_name = "Unknown"
    is_soundness_oriented = False
    is_high_impact = False

    if journal_profile:
        pc = journal_profile.get("publication_criteria", {})
        journal_name = journal_profile.get("journal_name", "Unknown")
        novelty_req = pc.get("novelty_required", "unknown")
        impact_req = pc.get("impact_required", "unknown")
        soundness = pc.get("technical_soundness_focus", "unknown")
        is_soundness_oriented = (
            soundness == "true"
            and novelty_req in ("low", "not_explicitly_required", "unknown")
        )
        is_high_impact = novelty_req == "high" or impact_req == "high"

    # Build journal context
    journal_context = ""
    if is_soundness_oriented:
        journal_context = (
            f"{journal_name} is a technical-soundness-oriented journal that does "
            f"not require major thematic novelty. Evaluation should emphasize "
            f"scientific validity and methodological adequacy rather than conceptual "
            f"breakthroughs. The Overall Judgment should note that the journal's "
            f"acceptance criteria are met as long as the research is technically sound."
        )
    elif is_high_impact:
        journal_context = (
            f"{journal_name} is a high-impact selective journal. Evaluation should "
            f"apply a strict standard for thematic novelty, theoretical contribution, "
            f"and significance to the field."
        )
    else:
        journal_context = (
            f"{journal_name}'s evaluation axis could not be clearly determined. "
            f"Evaluate from a general journal-fit perspective."
        )

    system_prompt = f"""\
You are a peer reviewer evaluating whether a manuscript is a good fit for its target journal.
Based on the manuscript summary, novelty assessment, and journal profile, produce a focused
journal-fit evaluation.

CRITICAL LANGUAGE RULE:
- All input may be in English or Japanese (or a mix).
- Regardless of the input language, you MUST write ALL your response in English.
- Never output Japanese text under any circumstances.

SCOPE:
- Evaluate ONLY thematic novelty and journal fit.
- Do NOT evaluate methods, statistics, logic/argumentation, figures, or ethics.
- Those dimensions are covered by separate review sections.

JOURNAL CONTEXT:
{journal_context}

Start with a clear Overall Journal Fit at the very top. Then provide detailed
rationale for each evaluation dimension below.

Output in the following Markdown format:

# A. ジャーナル適合評価

## Overall Journal Fit
[Strong / Moderate / Borderline / Weak]
[One-paragraph rationale explaining why this judgment was made]

## Fit with Journal Scope
- [Evaluate whether the research theme aligns with the journal's target areas,
  interdisciplinarity, specialist domains, and intended readership]
- [Note if the theme is too broad or too narrow for this journal]

## Fit with Journal Evaluation Criteria
- [Assess against what this journal explicitly values: novelty, importance,
  methodological rigor, technical validity, clinical significance, etc.]
- [For soundness-oriented journals like Scientific Reports, assess fit with
  soundness criteria rather than impact]

## Journal-Specific Strengths
- [Strengths that are specifically advantageous FOR THIS JOURNAL — not generic
  strengths, but points that make the manuscript a good match]
- [Examples: interdisciplinary scope, rare sample, proof-of-concept, niche but
  data-driven study]

## Journal-Specific Weaknesses or Risks
- [Weaknesses or concerns that are specific to THIS JOURNAL's expectations]
- [Focus on thematic/scope gaps and audience distance, not over-claiming
  or manuscript writing issues]

## Overall Fit Rationale
- [Final summary explaining WHY the manuscript is judged to fit or not fit
  this journal — a synthesis of the above dimensions, not a resubmission strategy]"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    journal_profile_json = ""
    if journal_profile:
        journal_profile_json = "\n## Journal Profile\n```json\n" + \
            json.dumps(journal_profile, ensure_ascii=False, indent=2) + \
            "\n```\n"

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
        journal_profile_json,
        "# Novelty Assessment\n",
        novelty_assessment,
    ]

    user_message = "\n".join(user_parts)

    # Truncate if needed (prioritize keeping summary + journal profile)
    if len(user_message) > 120_000:
        cutoff = 120_000
        assessment_start = user_message.find("# Novelty Assessment")
        if assessment_start > 0:
            preamble = user_message[:assessment_start]
            assessment_part = user_message[assessment_start:]
            available = cutoff - len(preamble)
            if available > 5000:
                user_message = preamble + assessment_part[:available]
                user_message += "\n\n[Novelty assessment truncated due to length]"
            else:
                user_message = user_message[:cutoff]
                user_message += "\n\n[Content truncated due to length]"
        else:
            user_message = user_message[:cutoff]
            user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_novelty_review_universal_messages(
    novelty_summary: dict,
    novelty_assessment: str,
) -> list[dict]:
    """Build messages for the novelty-review-universal command.

    Used by the ReviewChecksPanel's 新規性 tab (テーマ新規性評価 sub-tab).
    Produces a journal-agnostic thematic novelty evaluation.
    Journal tier estimation is handled by a separate evaluation.
    """
    system_prompt = """\
You are a peer reviewer performing a journal-agnostic evaluation of a manuscript's
thematic novelty. Your goal is to assess how novel the research theme and findings
are, independent of any specific target journal.

CRITICAL LANGUAGE RULE:
- All input may be in English or Japanese (or a mix).
- Regardless of the input language, you MUST write ALL your response in English.
- Never output Japanese text under any circumstances.

SCOPE (STRICT):
- Evaluate ONLY the thematic novelty of what the paper claims.
- Do NOT evaluate whether the theme was properly studied (methods, statistics).
- Do NOT evaluate the logical structure or strength of arguments.
- Do NOT evaluate figures, tables, ethics, or data availability.
- Those dimensions are covered by separate review sections.
- If methods/stats/logic concerns are mentioned in the source material,
  explicitly state that they are outside the scope of this assessment.

Output in the following Markdown format:

# B. テーマ新規性評価

## Overall Thematic Novelty
[High / Moderate / Limited / Low]
[One-paragraph summary of where the novelty lies]

## Central Theme
- [What is studied, in what population, using what theoretical framework or method]

## Prior Literature Landscape
- [Major research streams relevant to this theme and what is already established]
- [Examples: risk factor studies, theoretical work, meta-analyses, specific population studies]

## Closest Prior Work
- [The most similar prior studies or research groups and what they showed]
- [How the present study's theme differs from those]

## What Is New
- [The central point of novelty — not individual elements but their combination,
  population, theoretical framework, data, or methodological approach]
- [Clearly identify where the novelty is concentrated]

## What Is Not New
- [Elements already established in the literature — prevent over-claiming novelty]
- [Examples: individual risk factors, existing theories, established models]

## Type of Novelty
- [Categorize the type: theoretical integration, empirical application, rare sample,
  methodological novelty, cross-disciplinary synthesis, replication value, etc.]
- [Note whether this is discovery-type or synthesis-type novelty]

## Thematic Strengths
- [Strengths of the research theme itself — attractiveness as a topic, not empirical success]
- [Examples: rarity, cross-disciplinarity, theoretical organization, hypothesis-generation potential]

## Thematic Limitations
- [Limitations of the theme itself — NOT statistical or writing issues]
- [Examples: individual elements are known, theoretical framework is interpretive,
  generalizability is inherently limited]

## Contribution If Empirically Supported
- [If the empirical work succeeds, what academic contribution does the theme enable]
- [Theoretical contributions, cross-field bridging, data contributions, future research enablement]
- [Do NOT evaluate whether the empirical work actually succeeded]

## Novelty Judgment
- [Final summary: what is new, what is known, and the overall degree of contribution]

Note: Methods, statistics, and logical argumentation are evaluated in separate
review sections and are outside the scope of this thematic novelty assessment.
Journal tier estimation is provided in a separate "適正雑誌" evaluation."""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
        "# Novelty Assessment\n",
        novelty_assessment,
    ]

    user_message = "\n".join(user_parts)

    # Truncate if needed
    if len(user_message) > 120_000:
        cutoff = 120_000
        assessment_start = user_message.find("# Novelty Assessment")
        if assessment_start > 0:
            preamble = user_message[:assessment_start]
            assessment_part = user_message[assessment_start:]
            available = cutoff - len(preamble)
            if available > 5000:
                user_message = preamble + assessment_part[:available]
                user_message += "\n\n[Novelty assessment truncated due to length]"
            else:
                user_message = user_message[:cutoff]
                user_message += "\n\n[Content truncated due to length]"
        else:
            user_message = user_message[:cutoff]
            user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


def build_novelty_review_journal_tier_messages(
    novelty_summary: dict,
    novelty_assessment: str,
) -> list[dict]:
    """Build messages for the novelty-review-journal-tier command.

    Used by the ReviewChecksPanel's 新規性 tab (適正雑誌 sub-tab).
    Produces a journal-tier estimation based solely on thematic novelty,
    independent of any specific target journal.
    """
    system_prompt = """\
You are a peer reviewer estimating the appropriate journal tier for a manuscript,
based solely on its thematic novelty. Your role is to place the manuscript in the
right impact-factor band, independent of any specific target journal.

CRITICAL LANGUAGE RULE:
- All input may be in English or Japanese (or a mix).
- Regardless of the input language, you MUST write ALL your response in English.
- Never output Japanese text under any circumstances.

SCOPE (STRICT):
- Evaluate ONLY the thematic novelty of what the paper claims.
- Do NOT evaluate methods, statistics, logical structure, figures, tables, or ethics.
- Those dimensions are covered by separate review sections.

Output in the following Markdown format:

# C. 適正雑誌

## Estimated Journal Tier
[Top-tier (IF~10+) / High-tier (IF~5-10) / Mid-tier (IF~2-5) / Lower-tier (IF<2)]

- [Rationale: why this tier, based on novelty magnitude, rare samples, theoretical
  integration, and difference from existing work]
- [Why NOT a higher tier: specific limitations of the thematic novelty]
- [Why NOT a lower tier: specific strengths that justify this level]
- [Provide a balanced estimate — neither over-nor under-shooting the contribution]"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
        "# Novelty Assessment\n",
        novelty_assessment,
    ]

    user_message = "\n".join(user_parts)

    # Truncate if needed
    if len(user_message) > 120_000:
        cutoff = 120_000
        assessment_start = user_message.find("# Novelty Assessment")
        if assessment_start > 0:
            preamble = user_message[:assessment_start]
            assessment_part = user_message[assessment_start:]
            available = cutoff - len(preamble)
            if available > 5000:
                user_message = preamble + assessment_part[:available]
                user_message += "\n\n[Novelty assessment truncated due to length]"
            else:
                user_message = user_message[:cutoff]
                user_message += "\n\n[Content truncated due to length]"
        else:
            user_message = user_message[:cutoff]
            user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Journal Find: internal LLM direct search (single-call)
# =============================================================================

def build_novelty_find_journals_messages(
    novelty_summary: dict,
    tier_estimation: str,
) -> list[dict]:
    """Build messages for a single LLM call to find suitable journals directly.

    Used by the novelty-find-journals CLI command.
    The LLM receives the paper summary + tier estimation and returns
    a JSON array + Markdown table of candidate journals.
    This is the "internal method" — no external AI needed.
    """
    system_prompt = """\
You are a peer reviewer tasked with finding real, existing academic journals
that would be suitable submission targets for a manuscript, based on its
thematic novelty and estimated journal tier.

CRITICAL LANGUAGE RULE:
- All input may be in English or Japanese (or a mix).
- Regardless of the input language, you MUST write ALL your response in English.
- Never output Japanese text under any circumstances.

TASK:
1. Read the manuscript summary and the Journal Tier Estimation carefully.
2. Based on the paper's field, topic, novelty level, and estimated tier,
   identify 5–10 REAL, existing academic journals that would be good fits.
3. For each journal, provide ALL of the following fields:
   - journal_name: Full official journal name
   - publisher: Publisher name
   - impact_factor: The journal's impact factor (e.g. "5.2") or "N/A" if unknown
   - submission_fee: Typical article processing charge or submission fee
     (e.g. "$2,000", "Free", "$1,500–$3,000")
   - match_rate: Your estimated match percentage (e.g. "85%") reflecting how
     well the paper's topic, novelty level, and scope fit this journal
   - reason: A concise reason (1–2 sentences) why this journal is a good fit

4. Rank by match quality (best fit first). Select the top 10.
5. Ensure the journals span a realistic range within the estimated tier.
   Do NOT suggest journals far above or below the estimated tier band.

OUTPUT FORMAT — You MUST output exactly these two sections:

First, a JSON code fence containing the ranked array:
```json
[
  {
    "journal_name": "...",
    "publisher": "...",
    "impact_factor": "...",
    "submission_fee": "...",
    "match_rate": "...",
    "reason": "..."
  }
]
```

Then, a Markdown table summarizing the results:

| # | Journal Name | Publisher | IF | Submission Fee | Match | Reason |
|---|-------------|-----------|-----|---------------|-------|--------|
| 1 | ... | ... | ... | ... | ... | ... |

The table must have these exact columns in this order.
Number the journals from 1 to N in the first column."""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
        "# Journal Tier Estimation\n",
        tier_estimation,
    ]

    user_message = "\n".join(user_parts)

    # Truncate if needed (~120k chars)
    if len(user_message) > 120_000:
        user_message = user_message[:120_000]
        user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Journal Search: external AI prompt + parse (copy-paste flow, A/B merge)
# =============================================================================

JOURNAL_SEARCH_PROMPT_TEMPLATE = """\
You are a research assistant helping to find suitable academic journals for a manuscript.

## Manuscript Information
- Research Topic: {research_topic}
- Objective: {objective}
- Sample: {sample_summary}
- Design: {design}
- Methods: {methods_summary}
- Findings: {findings}

## Journal Tier Estimation
{tier_estimation}

## Task
Based on the manuscript's topic, novelty level, and estimated journal tier above,
search for 5-10 REAL academic journals that would be good submission targets.
For each journal, provide:

1. **Journal Name** — full official name
2. **Publisher**
3. **Impact Factor** — current IF (e.g. "5.2") or "N/A" if not available
4. **Submission Fee** — typical APC or submission fee (e.g. "$2,000", "Free")
5. **Match Rate** — estimated fit percentage (e.g. "85%")
6. **Reason** — 1-2 sentences why this journal fits

Please format as a numbered list or table.
Use your web search capability to find current, accurate information.
"""


def build_journal_search_parse_messages(
    novelty_summary: dict,
    tier_estimation: str,
    external_results_a: str,
    external_results_b: str = "",
) -> list[dict]:
    """Build messages for parsing/merging external AI journal search results.

    Used by the novelty-journal-search-parse CLI command.
    The coordinator LLM receives results from up to two external AIs (A and B),
    deduplicates, ranks by fit, and produces a structured JSON array + Markdown table.

    If external_results_b is empty, only slot A results are processed.
    """
    has_b = bool(external_results_b.strip())

    if has_b:
        merge_instruction = """\
4. Merge the two lists: identify duplicates (same journal in both A and B),
   keep the more detailed metadata, and combine reasons.
5. Exclude clearly unsuitable journals (wrong field, predatory publishers).
6. Rank by match quality (best fit first). Select the top 10."""
    else:
        merge_instruction = """\
4. Exclude clearly unsuitable journals (wrong field, predatory publishers).
5. Rank by match quality (best fit first). Select the top 10."""

    system_prompt = f"""\
You are a coordinating peer reviewer. Your task is to parse and merge academic
journal recommendations from external AI search results into a clean, ranked list.

CRITICAL LANGUAGE RULE:
- The input may contain English or Japanese content.
- You MUST output ALL journal metadata in English.
- Journal names, publisher names — all in English.

TASK:
1. Read the manuscript summary and tier estimation for context.
2. Read the external AI results carefully.
3. Extract every journal candidate found in the results.
4. For each journal, fill in ALL of these fields:
   - journal_name: Full official journal name (English)
   - publisher: Publisher name (English)
   - impact_factor: Impact factor (e.g. "5.2") or "N/A" if not found
   - submission_fee: APC or submission fee (e.g. "$2,000", "Free") or "N/A"
   - match_rate: Your estimated match percentage (e.g. "85%")
   - reason: 1-2 sentences why this journal fits the manuscript

{merge_instruction}

OUTPUT FORMAT — You MUST output exactly these two sections:

First, a JSON code fence containing the ranked array:
```json
[
  {{
    "journal_name": "...",
    "publisher": "...",
    "impact_factor": "...",
    "submission_fee": "...",
    "match_rate": "...",
    "reason": "..."
  }}
]
```

Then, a Markdown table summarizing the results:

| # | Journal Name | Publisher | IF | Submission Fee | Match | Reason |
|---|-------------|-----------|-----|---------------|-------|--------|
| 1 | ... | ... | ... | ... | ... | ... |

The table must have these exact columns in this order.
Number the journals from 1 to N in the first column."""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
        "# Journal Tier Estimation\n",
        tier_estimation,
        "\n# External AI A — Search Results\n",
        external_results_a,
    ]

    if has_b:
        user_parts.extend([
            "\n# External AI B — Search Results\n",
            external_results_b,
        ])

    user_message = "\n".join(user_parts)

    # Truncate if needed (~200k chars for dual-AI input)
    max_chars = 200_000 if has_b else 160_000
    if len(user_message) > max_chars:
        user_message = user_message[:max_chars]
        user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Journal table translation (Reason column → Japanese)
# =============================================================================

def build_journal_search_translate_messages(
    en_table: str,
) -> list[dict]:
    """Build messages for translating the journal candidates table Reason column to Japanese.

    The LLM receives the full Markdown table and translates only the Reason column,
    preserving the table structure and all other columns in English.
    """
    system_prompt = """\
You are a translation assistant. You will receive a Markdown table of journal candidates.

TASK:
- Translate ONLY the "Reason" column (the last column of the table) to Japanese.
- Keep ALL other columns (Journal Name, Publisher, IF, Submission Fee, Match) exactly as they are in English.
- Preserve the exact Markdown table format — pipe characters, alignment row, everything.
- Do NOT add any explanation, notes, or extra text before or after the table.
- Output ONLY the translated Markdown table."""

    user_message = f"# Journal Candidates Table (English)\n\n{en_table}"

    # Truncate if needed
    if len(user_message) > 80_000:
        user_message = user_message[:80_000]
        user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 5: Review comment generation prompt
# =============================================================================

def build_novelty_review_comment_messages(
    novelty_summary: dict,
    novelty_assessment: str,
    target_journal: str = "",
) -> list[dict]:
    """Build messages for the novelty-review-comment command.

    Generates the 'Originality and Overlap' section for the final review
    comments (NOT a cover letter). Output in both Japanese and English.
    """
    system_prompt = """\
You are a peer reviewer for an academic manuscript.
Based on the manuscript summary and novelty assessment results, write the "Novelty and Overlap with Existing Literature" section for the **final review comments**.

This is NOT a cover letter — it is text to be included in the reviewer's report.

Important instructions:
- Write from an objective reviewer's standpoint.
- Distinguish between "novelty that can be strongly claimed" and "points that should be stated cautiously."
- Do not overstate novelty.
- If there is overlap with existing research, point it out honestly.
- Output in both English and Japanese (for international journal submission).
- Approximately 3–5 paragraphs per language, in a style appropriate for an academic peer review report.

Output in the following format.

# Novelty and Overlap with Existing Literature (新規性と既存研究との重複)

## English

[3–5 paragraphs of English review comments]

## 日本語

[3〜5段落の日本語査読コメント]"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
        "# Novelty Assessment\n",
        novelty_assessment,
    ]

    if target_journal and target_journal.strip():
        user_parts.append(f"\n## Target Journal\n{target_journal.strip()}\n")

    user_message = "\n".join(user_parts)

    if len(user_message) > 80_000:
        user_message = user_message[:80_000]
        user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 4 (NEW): Deep Research merge prompt
# =============================================================================

def build_novelty_merge_messages(
    novelty_summary: dict,
    deep_research_a_text: str,
    deep_research_b_text: str,
    deep_research_meta: dict | None = None,
    journal_profile: dict | None = None,
) -> list[dict]:
    """Build messages for the novelty-merge-research command.

    Takes two Deep Research results (A and B) and instructs the LLM to
    compare, integrate, and structure the findings.
    """
    system_prompt = """\
You are an expert in academic literature surveys.
Compare and integrate the results of Deep Research (literature surveys) conducted by two different AIs.

CRITICAL LANGUAGE RULE:
- The Deep Research input may be in English or Japanese (or a mix).
- Regardless of the input language, you MUST write ALL your response in English.
- Section headings, analysis, reference information — everything must be in English.
- Never output Japanese text under any circumstances.

Other instructions:
- Do NOT simply concatenate A and B — compare and organize the content.
- If information from A and B is contradictory, mark it as "Needs verification" rather than arbitrarily choosing one side.
- Structure reference information as much as possible (authors, year, title, journal name, DOI, etc.).
- Organize the information to facilitate novelty judgment and journal fit assessment.

Output in the following Markdown format. After the Markdown, also output the integrated reference information in JSON.

# Deep Research Integration Results

## 1. Information consistent between A and B

## 2. Information appearing only in A

## 3. Information appearing only in B

## 4. Discrepancies in reference information / Needs verification

## 5. Likely reliable information

## 6. Information requiring verification

## 7. Information useful for novelty assessment

## 8. Information less useful for novelty assessment

## 9. Evidence indicating overlap with existing research

## 10. Evidence indicating novelty or added value

## 11. Information useful for target journal fit assessment

## 12. Points likely to be targeted in peer review

```json
{
  "references": [
    {
      "authors": "...",
      "year": "...",
      "title": "...",
      "journal": "...",
      "volume": "...",
      "issue": "...",
      "pages": "...",
      "doi": "...",
      "url": "...",
      "source": "A | B | both",
      "relevance_to_current_manuscript": "high | medium | low",
      "supports_novelty": true,
      "weakens_novelty": false,
      "needs_verification": false
    }
  ],
  "agreement_summary": "...",
  "key_findings_for_assessment": ["..."],
  "items_needing_verification": ["..."],
  "overall_reliability": "high | medium | low"
}
```"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    meta_info = ""
    if deep_research_meta:
        meta_info = "\n## Deep Research Metadata\n```json\n" + \
                    json.dumps(deep_research_meta, ensure_ascii=False, indent=2) + \
                    "\n```\n"

    journal_info = ""
    if journal_profile:
        jp = journal_profile
        pc = jp.get("publication_criteria", {})
        journal_info = f"""\n## Target Journal Information
- Journal name: {jp.get('journal_name', 'Unknown')}
- Novelty emphasis: {pc.get('novelty_required', 'unknown')}
- Technical soundness focus: {pc.get('technical_soundness_focus', 'unknown')}
"""

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
        meta_info,
        journal_info,
        "# Deep Research Result A\n",
        deep_research_a_text,
        "\n# Deep Research Result B\n",
        deep_research_b_text,
    ]

    user_message = "\n".join(user_parts)

    # Truncate if needed (keep A and B roughly balanced)
    if len(user_message) > 120_000:
        a_start = user_message.find("# Deep Research Result A")
        b_start = user_message.find("# Deep Research Result B")
        if a_start > 0 and b_start > a_start:
            preamble = user_message[:a_start]
            a_text = user_message[a_start:b_start]
            b_text = user_message[b_start:]
            available = 120_000 - len(preamble)
            half = available // 2
            user_message = preamble + a_text[:half] + "\n\n[Remainder of A omitted]\n\n" + b_text[:half] + "\n\n[Remainder of B omitted]"
        else:
            user_message = user_message[:120_000] + "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 6: Review comment candidates prompt
# =============================================================================

def build_novelty_comment_candidates_messages(
    novelty_summary: dict,
    novelty_assessment: str,
    journal_profile: dict | None = None,
) -> list[dict]:
    """Build messages to generate per-item review comment candidates.

    Produces 12 candidate items with Japanese + English text, strength
    ratings, and recommendation levels. User selects which to include.
    """
    system_prompt = """\
You are a peer reviewer for an academic manuscript.
Based on the manuscript summary and novelty assessment results, generate per-item candidate text for the "Novelty and Overlap with Existing Literature" section of the final review comments.

This is NOT a cover letter — these are candidate texts to be included in the reviewer's report.

Important instructions:
- Generate candidates with English as the primary text and Japanese as the translation.
- For each item, provide both English and Japanese candidates.
- Assign a strength rating (strong / moderate / cautious / not_recommended).
- Assign a recommendation level (high / medium / low).
- Adapt the wording to the journal's evaluation axis.
- Mark overclaiming items as cautious or not_recommended.
- Each candidate should be approximately 3–5 sentences in a style appropriate for an academic peer review report.

Output in the following JSON format. Do NOT output any text other than JSON.

```json
{
  "candidates": [
    {
      "id": "theme",
      "label_ja": "テーマの新規性",
      "label_en": "Novelty of Theme",
      "text_ja": "Japanese candidate (3–5 sentences)",
      "text_en": "English candidate (3-5 sentences)",
      "strength": "strong | moderate | cautious | not_recommended",
      "recommendation": "high | medium | low",
      "comment": "Supplementary comment about this candidate"
    },
    {
      "id": "sample",
      "label_ja": "対象・サンプルの新規性",
      "label_en": "Novelty of Sample",
      ...
    },
    ...
  ]
}
```"""

    # Build journal context
    journal_context = ""
    if journal_profile:
        jp = journal_profile
        pc = jp.get("publication_criteria", {})
        journal_context = f"""
## Target Journal Evaluation Axis
- Journal name: {jp.get('journal_name', 'Unknown')}
- Novelty emphasis: {pc.get('novelty_required', 'unknown')}
- Impact emphasis: {pc.get('impact_required', 'unknown')}
- Technical soundness emphasis: {pc.get('technical_soundness_focus', 'unknown')}
- Methodological rigour emphasis: {pc.get('methodological_rigour_focus', 'unknown')}
- Statistical rigour emphasis: {pc.get('statistical_rigour_focus', 'unknown')}

Adapt candidate text to this journal's evaluation axis.
"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# Manuscript Summary\n",
        "```json",
        summary_json,
        "```\n",
        journal_context,
        "# Novelty Assessment\n",
        novelty_assessment,
    ]

    user_message = "\n".join(user_parts)

    if len(user_message) > 80_000:
        user_message = user_message[:80_000]
        user_message += "\n\n[内容が長すぎるため途中で切り捨てられました]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 7a: Compose final review comment from selected candidates
# =============================================================================

def build_novelty_comment_compose_messages(
    candidates_json: str,
    language: str = "both",
    journal_profile: dict | None = None,
) -> list[dict]:
    """Build messages to compose a final review comment from selected candidates.

    Takes only the user-selected candidates (as JSON) and generates a
    cohesive review comment section in the requested language(s).
    """
    lang_instr = {
        "ja": "Output in Japanese only.",
        "en": "Output in English only.",
        "both": "Output in both English and Japanese.",
    }.get(language, "Output in both English and Japanese.")

    system_prompt = f"""\
You are a peer reviewer for an academic manuscript.
Based on the selected candidate texts, compose a cohesive "Novelty and Overlap with Existing Literature" section for the final review comments.

Important instructions:
- {lang_instr}
- Use only the selected candidates; do not include content that was not selected.
- Remove redundancies and integrate into a naturally flowing text.
- Avoid overclaiming; write in a style appropriate for an academic peer review report.
- Aim for approximately 3–5 paragraphs per language.
- This is NOT a cover letter — it is text to be included in the reviewer's report.

Output in the following Markdown format.

# Novelty and Overlap with Existing Literature (新規性と既存研究との重複)

## English

[3-5 paragraphs of English review comments]

## 日本語

[3〜5段落の日本語査読コメント]"""

    journal_note = ""
    if journal_profile:
        jp = journal_profile
        journal_note = f"\nTarget Journal: {jp.get('journal_name', 'Unknown')}\n"

    user_parts = [
        "# Selected Candidate Texts\n",
        journal_note,
        candidates_json,
    ]

    user_message = "\n".join(user_parts)

    if len(user_message) > 60_000:
        user_message = user_message[:60_000]

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Novelty Achievement Evaluation
# =============================================================================

def build_novelty_achievement_messages(
    novelty_summary: dict,
    novelty_assessment: str,
    check_findings: list[dict],
    top_journal: dict | None = None,
    abstract: str | None = None,
) -> list[dict]:
    """Build messages to evaluate whether the manuscript's claimed novelty
    is actually achieved, using check findings as evidence.

    Produces a 5-section evaluation:
    1. Assurance of Novelty
    2. Achieved Points
    3. Unachieved Points / Problems
    4. General Impressions
    5. Publication Prospects for the top-ranked journal

    Args:
        novelty_summary: dict from novelty_summary.json
        novelty_assessment: str from novelty_assessment.md
        check_findings: list of dicts, each from a merged.section.json check
            with keys: check_name, label_ja, findings (list of {comment_id,
            issue, section, category, confidence})
        top_journal: dict or None with {journal_name, impact_factor, rationale}
            from the #1 entry in novelty_find_journals_merged.json
        abstract: str or None — manuscript abstract

    Returns:
        list of {"role": str, "content": str} messages
    """
    system_prompt = """\
You are a peer reviewer evaluating whether a manuscript actually achieves the
novelty it claims. The novelty claims were assessed in a separate thematic
novelty evaluation (provided below). Your task is to cross-reference those
claims with concrete problems found in the manuscript's expression, methods,
statistics, logic, and argumentation.

IMPORTANT: Output in ENGLISH only. Do NOT output Japanese.

You will produce a structured evaluation with FIVE sections:

## 1. Assurance of Novelty
A concise overall judgment: does the manuscript convincingly demonstrate the
novelty it claims, or do the identified problems undermine that novelty?
Consider whether the claimed novelty is:
- Fully assured (problems do not affect the core novelty claims)
- Partially assured (some novelty claims are weakened but not invalidated)
- Not assured (fundamental problems undermine key novelty claims)
Explain your reasoning in 2-4 sentences.

## 2. Achieved Points
List specific aspects where the manuscript successfully achieves what it
claims. These are areas where:
- The check findings show no major problems, OR
- The problems found do not affect the novelty claims
Write as bullet points (2-5 items). Each bullet should reference the specific
novelty claim and explain why it remains valid.

## 3. Unachieved Points / Problems
List specific areas where problems identified in the review checks
(expression, methods, statistics, logic, argumentation) undermine or
invalidate the manuscript's novelty claims. For each point:
- State the problem clearly
- Reference the source check and finding ID
- Explain how this problem affects a specific novelty claim
Write as bullet points (at least 3 items if problems exist).

## 4. General Impressions
A 2-3 paragraph synthesis of sections 1-3. This should read as a coherent
assessment of whether the manuscript's novelty stands up to scrutiny.
Consider the balance of achieved vs. unachieved points and the severity
of the problems.

## 5. Publication Prospects for [Journal Name] (IF=[X.X])
Evaluate the likelihood that this manuscript would be accepted at the
top-ranked journal from the journal search. Consider:
- The journal's standards and prestige level
- The severity of the identified problems relative to the journal's bar
- Whether the novelty (even if partially achieved) meets the journal's threshold
End with a clear verdict on one line:
**Verdict: [Accept / Minor Revision / Major Revision / Reject]**

CRITICAL — Tone:
- Use constructive, collegial reviewer language
- Be honest but fair about problems
- Do NOT suggest solutions — this is assessment, not prescription
- Frame negative points as "the manuscript does not yet demonstrate..."
  rather than "the authors failed to..."
- Base all judgments on the evidence provided in the check findings"""

    user_parts = []

    # ── Abstract ──
    if abstract and abstract.strip():
        ab = abstract.strip()
        if len(ab) > 1500:
            ab = ab[:1500] + "\n...(truncated)"
        user_parts.append("## Manuscript Abstract")
        user_parts.append("")
        user_parts.append(ab)
        user_parts.append("")

    # ── Novelty summary ──
    user_parts.append("## Claimed Novelty (from novelty_summary.json)")
    user_parts.append("")
    user_parts.append("```json")
    user_parts.append(json.dumps(novelty_summary, ensure_ascii=False, indent=2))
    user_parts.append("```")
    user_parts.append("")

    # ── Novelty assessment ──
    user_parts.append("## Thematic Novelty Assessment (from novelty_assessment.md)")
    user_parts.append("")
    na = novelty_assessment.strip()
    if len(na) > 4000:
        na = na[:4000] + "\n...(truncated)"
    user_parts.append(na)
    user_parts.append("")

    # ── Check findings (problems from review checks) ──
    user_parts.append("## Problems Identified in Review Checks")
    user_parts.append("")
    user_parts.append(
        "The following are major-severity findings from the expression, "
        "methods/statistics, and logic/argument review checks. Use these as "
        "evidence to evaluate whether the manuscript's novelty claims are "
        "actually achieved."
    )
    user_parts.append("")

    has_findings = False
    for cf in check_findings:
        findings = cf.get("findings", [])
        if not findings:
            continue
        has_findings = True
        user_parts.append(f"### {cf['label_ja']} ({cf['check_name']})")
        user_parts.append("")
        for f in findings:
            cid = f.get("comment_id", "?")
            section = f.get("section", "N/A")
            category = f.get("category", "")
            issue = f.get("issue", "")
            prefix = f"[{category}] " if category else ""
            user_parts.append(f"- **{cid}** ({section}): {prefix}{issue}")
        user_parts.append("")

    if not has_findings:
        user_parts.append(
            "No major findings were identified in the review checks. "
            "This suggests the manuscript is methodologically and logically sound."
        )
        user_parts.append("")

    # ── Top journal ──
    if top_journal:
        user_parts.append("## Top-Ranked Journal from Journal Search")
        user_parts.append("")
        user_parts.append(f"- **Journal**: {top_journal.get('journal_name', 'Unknown')}")
        jif = top_journal.get("impact_factor", "N/A")
        user_parts.append(f"- **Impact Factor**: {jif}")
        rationale = top_journal.get("rationale", "")
        if rationale:
            if len(rationale) > 600:
                rationale = rationale[:600] + "..."
            user_parts.append(f"- **Match Rationale**: {rationale}")
        user_parts.append("")
    else:
        user_parts.append("## Top-Ranked Journal")
        user_parts.append("")
        user_parts.append(
            "No journal search results available. Skip Section 5 "
            "(Publication Prospects) or mark it as 'N/A — no journal data'."
        )
        user_parts.append("")

    # ── Instructions ──
    user_parts.append("## Instructions")
    user_parts.append("")
    user_parts.append(
        "Generate the 5-section evaluation following the format described "
        "in the system prompt. Use ONLY the evidence provided above. "
        "Write in English. Output as Markdown with the section headings "
        "exactly as specified."
    )

    user_message = "\n".join(user_parts)

    if len(user_message) > 80_000:
        user_message = user_message[:80_000]
        user_message += "\n\n[Content truncated due to length]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
