"""Journal profile generation via LLM.

Builds LLM messages for researching a target journal's submission guidelines,
citation style, and review policies. Outputs journal_profile.json.
"""

import json
import os
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

# ── Default journal profile schema ──────────────────────────────────────

DEFAULT_JOURNAL_PROFILE = {
    "journal_name": "",
    "journal_url": "",
    "publisher": "",
    "article_type": "Article",
    "reference_style": {
        "style_name": "",
        "in_text_citation": "numeric",
        "reference_list_order": "order_of_appearance",
        "doi_required": "recommended_or_required_if_available",
        "url_access_date_required": None,
        "journal_title_style": "abbreviated_or_full",
        "example_reference": "",
    },
    "submission_guidelines": {
        "word_limit": None,
        "abstract_limit": None,
        "figure_table_limits": None,
        "supplementary_material_policy": "",
        "data_availability_policy": "",
        "ethics_policy": "",
        "conflict_of_interest_policy": "",
        "funding_statement_policy": "",
        # ── Ethics & compliance ──
        "informed_consent_policy": "",
        "ethics_review_required": "unknown",
        "informed_consent_required": "unknown",
        "coi_disclosure_required": "unknown",
        # ── Manuscript structure / formatting ──
        "recommended_manuscript_structure": [],
        "section_order": "",
        "methods_position": "",
        "abstract_structure": "",
        "main_text_word_limit": None,
        "title_word_limit": None,
        "keyword_limit": None,
        "reference_limit": None,
        "display_item_limit": None,
        "figure_legend_limit": None,
        "line_numbers_recommended": None,
        "footnotes_allowed": None,
    },
    "review_policy": {
        "novelty_requirement": "",
        "methodological_requirements": "",
        "statistical_reporting_expectations": "",
        "reporting_guidelines": [],
        "reviewer_guidance": "",
        "editorial_policy_summary": "",
        # ── Journal evaluation axis / reviewer criteria ──
        "technical_soundness_oriented": "unknown",
        "importance_significance_impact_assessed": "unknown",
        "niche_scope_allowed": "unknown",
        "negative_results_allowed": "unknown",
        "replication_allowed": "unknown",
        "main_review_questions": [],
        "claims_must_be_supported_by_data": "unknown",
        "methods_analysis_interpretation_focus": "unknown",
    },
    # ── Publication criteria / evaluation axis ──
    "publication_criteria": {
        "novelty_required": "unknown",
        "impact_required": "unknown",
        "significance_required": "unknown",
        "technical_soundness_focus": "unknown",
        "methodological_rigour_focus": "unknown",
        "statistical_rigour_focus": "unknown",
        "conclusion_supported_by_data_focus": "unknown",
        "ethical_robustness_focus": "unknown",
        "data_availability_focus": "unknown",
        "reproducibility_transparency_focus": "unknown",
    },
    # ── Research type acceptance ──
    "research_type_acceptance": {
        "accepts_incremental_research": "unknown",
        "accepts_confirmatory_research": "unknown",
        "accepts_replication": "unknown",
        "accepts_negative_or_null_results": "unknown",
        "accepts_niche_scope": "unknown",
        "accepts_multidisciplinary_work": "unknown",
    },
    # ── Journal positioning ──
    "journal_position": {
        "multidisciplinary_mega_journal": "unknown",
        "broad_scope_journal": "unknown",
        "field_specific_high_impact_journal": "unknown",
        "clinical_high_impact_journal": "unknown",
        "society_journal": "unknown",
        "soundness_oriented_journal": "unknown",
        "selectivity_basis": "",
        "evaluation_axis_summary": "",
        "journal_position_summary": "",
    },
    # ── Metrics ──
    "metrics": {
        "impact_factor": "",
        "impact_factor_year": "",
        "five_year_impact_factor": "",
        "five_year_impact_factor_year": "",
        "cite_score": "",
        "cite_score_year": "",
        "sjr": "",
        "sjr_year": "",
        "snip": "",
        "snip_year": "",
        "quartile": "",
        "category_rankings": "",
        "indexing": "",
        "acceptance_rate_if_available": "",
    },
    # ── Submission strategy ──
    "submission_strategy": {
        "suitable_novelty_strategy": "",
        "suitable_framing_strategy": "",
        "unsuitable_claims": "",
        "claims_to_avoid": "",
        "reviewer_likely_concerns": "",
        "manuscript_strengths_to_emphasize": "",
        "manuscript_weaknesses_to_control": "",
    },
    # ── Manuscript structure ──
    "manuscript_structure": {
        "expected_section_order": [],
        "main_text_order": [],
        "front_matter_sections": [],
        "back_matter_sections": [],
        "section_aliases": {},
        "section_alias_rules": [],
        "requires_abstract": True,
        "allows_heading_variation": "unknown",
        "methods_position": "",
        "allows_conclusion_section": "unknown",
        "allows_research_highlights": "unknown",
        "allows_summary_instead_of_abstract": "unknown",
        "notes": "",
    },
    # ── Sources ──
    "sources": [],
    "notes": "",
    "source": "manual",
    "source_details": "",
    "updated_at": "",
}

JOURNAL_PROFILE_SCHEMA_DESC = """{
  "journal_name": "string",
  "journal_url": "string or null",
  "publisher": "string or null",
  "article_type": "string (Article | Original Article | Brief Report | Review | Case Report | Other)",
  "reference_style": {
    "style_name": "string (e.g. Nature/Springer numeric style, APA 7th, Vancouver, etc.)",
    "in_text_citation": "numeric | author_year | other",
    "reference_list_order": "order_of_appearance | alphabetical",
    "doi_required": "required | recommended_or_required_if_available | not_required | unknown",
    "url_access_date_required": true | false | null,
    "journal_title_style": "abbreviated | full | abbreviated_or_full | unknown",
    "example_reference": "string (example citation format, empty if unknown)"
  },
  "submission_guidelines": {
    "word_limit": number | null,
    "abstract_limit": number | null,
    "figure_table_limits": "string or null",
    "supplementary_material_policy": "string (empty if unknown)",
    "data_availability_policy": "string",
    "ethics_policy": "string",
    "conflict_of_interest_policy": "string",
    "funding_statement_policy": "string",
    "informed_consent_policy": "string (empty if unknown)",
    "ethics_review_required": "required | not_required | varies | unknown",
    "informed_consent_required": "required | not_required | varies | unknown",
    "coi_disclosure_required": "required | not_required | varies | unknown",
    "recommended_manuscript_structure": ["string (ordered list, e.g. 'Introduction', 'Results', 'Discussion', 'Methods')"],
    "section_order": "string (e.g. 'Introduction → Results → Discussion → Methods')",
    "methods_position": "string (e.g. 'After Discussion' | 'Before Results' | 'After Introduction' | '')",
    "abstract_structure": "string (e.g. 'Unstructured abstract; no headings or subheadings' | 'Structured abstract with Background, Methods, Results, Conclusions')",
    "main_text_word_limit": number | null,
    "title_word_limit": number | null,
    "keyword_limit": number | null,
    "reference_limit": number | null,
    "display_item_limit": number | null,
    "figure_legend_limit": number | null,
    "line_numbers_recommended": true | false | null,
    "footnotes_allowed": true | false | null
  },
  "review_policy": {
    "novelty_requirement": "string",
    "methodological_requirements": "string",
    "statistical_reporting_expectations": "string",
    "reporting_guidelines": ["string"],
    "reviewer_guidance": "string",
    "editorial_policy_summary": "string",
    "technical_soundness_oriented": "true | false | unknown (does the journal prioritize scientific validity and technical soundness over novelty/impact?)",
    "importance_significance_impact_assessed": "true | false | unknown (do reviewers assess importance/significance/impact?)",
    "niche_scope_allowed": "true | false | unknown",
    "negative_results_allowed": "true | false | unknown",
    "replication_allowed": "true | false | unknown",
    "main_review_questions": ["string (key questions reviewers are asked)"],
    "claims_must_be_supported_by_data": "true | false | unknown",
    "methods_analysis_interpretation_focus": "true | false | unknown"
  },
  "publication_criteria": {
    "novelty_required": "high | moderate | low | not_explicitly_required | unknown",
    "impact_required": "high | moderate | low | not_explicitly_required | unknown",
    "significance_required": "high | moderate | low | not_explicitly_required | unknown",
    "technical_soundness_focus": "true | false | unknown",
    "methodological_rigour_focus": "true | false | unknown",
    "statistical_rigour_focus": "true | false | unknown",
    "conclusion_supported_by_data_focus": "true | false | unknown",
    "ethical_robustness_focus": "true | false | unknown",
    "data_availability_focus": "true | false | unknown",
    "reproducibility_transparency_focus": "true | false | unknown"
  },
  "research_type_acceptance": {
    "accepts_incremental_research": "true | false | unknown",
    "accepts_confirmatory_research": "true | false | unknown",
    "accepts_replication": "true | false | unknown",
    "accepts_negative_or_null_results": "true | false | unknown",
    "accepts_niche_scope": "true | false | unknown",
    "accepts_multidisciplinary_work": "true | false | unknown"
  },
  "journal_position": {
    "multidisciplinary_mega_journal": "true | false | unknown",
    "broad_scope_journal": "true | false | unknown",
    "field_specific_high_impact_journal": "true | false | unknown",
    "clinical_high_impact_journal": "true | false | unknown",
    "society_journal": "true | false | unknown",
    "soundness_oriented_journal": "true | false | unknown (does the journal evaluate primarily on technical soundness rather than novelty/impact?)",
    "selectivity_basis": "string (e.g. 'technical soundness' | 'novelty and impact' | 'both')",
    "evaluation_axis_summary": "string (1-2 sentence summary of what the journal evaluates)",
    "journal_position_summary": "string (1-2 sentence summary)"
  },
  "metrics": {
    "impact_factor": "string (number or empty if unknown)",
    "impact_factor_year": "string (e.g. '2024')",
    "five_year_impact_factor": "string",
    "five_year_impact_factor_year": "string (e.g. '2024')",
    "cite_score": "string",
    "cite_score_year": "string (e.g. '2024')",
    "sjr": "string (SCImago Journal Rank)",
    "sjr_year": "string (e.g. '2024')",
    "snip": "string (Source Normalized Impact per Paper)",
    "snip_year": "string (e.g. '2024')",
    "quartile": "string (Q1 | Q2 | Q3 | Q4)",
    "category_rankings": "string (e.g. '15/120 in Neuroscience')",
    "indexing": "string (e.g. 'Scopus, Web of Science, PubMed, EMBASE')",
    "acceptance_rate_if_available": "string"
  },
  "submission_strategy": {
    "suitable_novelty_strategy": "string (how to position novelty for this journal)",
    "suitable_framing_strategy": "string (how to frame the contribution)",
    "unsuitable_claims": "string (what claims to avoid)",
    "claims_to_avoid": "string (specific claims that reviewers dislike)",
    "reviewer_likely_concerns": "string",
    "manuscript_strengths_to_emphasize": "string",
    "manuscript_weaknesses_to_control": "string"
  },
  "manuscript_structure": {
    "expected_section_order": ["string (ordered list of ALL sections including front/back matter)"],
    "main_text_order": ["string (ordered list of main body sections only: Introduction, Results, Discussion, Methods etc.)"],
    "front_matter_sections": ["string (sections before main text: Title, Abstract, Summary, Keywords, Research highlights)"],
    "back_matter_sections": ["string (sections after main text: Data Availability, References, Acknowledgements, Funding, Author Contributions, Competing Interests, AI declaration, Figure legends, Tables)"],
    "section_aliases": {
        "abstract": ["Abstract", "Summary"],
        "highlights": ["Research highlights", "Highlights", "Key points"],
        "introduction": ["Introduction", "Background", "Aim", "Aims", "Objectives"],
        "results": ["Results", "Findings"],
        "discussion": ["Discussion"],
        "conclusion": ["Conclusion", "Conclusions", "Concluding remarks"],
        "methods": ["Methods", "Materials and methods", "Participants and methods", "Statistical analyses"],
        "data_availability": ["Data availability", "Data and code availability"],
        "acknowledgements": ["Acknowledgements", "Acknowledgments"],
        "competing_interests": ["Competing interests", "Conflict of interest"],
        "references": ["References"],
        "figure_legends": ["Figure legends", "Figures"],
        "tables": ["Tables"]
    },
    "section_alias_rules": [
        {"alias": "Summary", "canonical": "abstract", "condition": "before_introduction"},
        {"alias": "Research highlights", "canonical": "highlights", "condition": "before_introduction"},
        {"alias": "Concluding remarks", "canonical": "discussion_subsection_or_conclusion", "condition": "inside_or_immediately_after_discussion"},
        {"alias": "Statistical Analyses", "canonical": "methods_subsection", "condition": "inside_methods"}
    ],
    "requires_abstract": true | false,
    "allows_heading_variation": "true | false | unknown",
    "methods_position": "string (e.g. 'after_discussion_before_references')",
    "allows_conclusion_section": "true | false | not_explicitly_specified | unknown",
    "allows_research_highlights": "true | false | unknown",
    "allows_summary_instead_of_abstract": "true | false | unknown",
    "notes": "string (e.g. 'Methods comes last in Nature/Scientific Reports')"
  },
  "sources": [{"url": "string (full URL of the page)", "title": "string (descriptive page title)", "accessed_at": "string (ISO datetime, e.g. 2026-05-20T12:00:00Z)", "retrieved_text_summary": "string (summary of what info was obtained from this page)"}],
  "notes": "string (free notes)"
}"""

JOURNAL_PROFILE_SYSTEM_PROMPT = """\
You are a scholarly publishing expert. Your task is to research a target journal
and produce structured information about its submission guidelines, citation style,
review policies, publication criteria, journal positioning, and metrics.

## CRITICAL: What pages to check

You MUST research the following types of information from the journal's official website:
1. **Author instructions / submission guidelines** — manuscript structure, word limits, abstract requirements
2. **Guide to referees** — what reviewers are asked to evaluate
3. **Editorial process** — how decisions are made
4. **Aims and scope / About the journal** — journal positioning and evaluation criteria
5. **Journal metrics page** — impact factor, etc. (if available)

## Manuscript structure & formatting (submission_guidelines)

Extract with HIGH priority:
- **recommended_manuscript_structure**: The recommended or required section order as an ordered list (e.g. ["Introduction", "Results", "Discussion", "Methods"] for Scientific Reports). This is critical for structure checking.
- **section_order**: Human-readable string (e.g. "Introduction → Results → Discussion → Methods")
- **methods_position**: Where Methods appears relative to other sections (e.g. "After Discussion", "After Introduction", "Before Results"). Nature Publishing Group journals (Nature, Nature Communications, Scientific Reports, etc.) typically place Methods AFTER Discussion. Standard IMRaD journals place Methods after Introduction.
- **abstract_structure**: Is the abstract structured (with Background/Methods/Results/Conclusions headings) or unstructured (no headings)? Include word limit if specified.
- **main_text_word_limit**: Total word limit for the main body.
- **title_word_limit**: Maximum title length (words or characters).
- **keyword_limit**: Maximum number of keywords allowed.
- **reference_limit**: Maximum number of references allowed.
- **display_item_limit**: Maximum number of figures + tables.
- **figure_legend_limit**: Maximum words per figure legend.
- **line_numbers_recommended**: Are line numbers required/recommended?
- **footnotes_allowed**: Are footnotes permitted?

## Ethics & compliance information (HIGH PRIORITY for ethics check)

Extract with HIGH priority:
- **ethics_review_required**: Does the journal require IRB/ethics committee approval statement?
  Values: "required" | "not_required" | "varies" (depends on study type) | "unknown"
- **informed_consent_required**: Does the journal require an informed consent statement?
  Values: "required" | "not_required" | "varies" (depends on study type) | "unknown"
- **coi_disclosure_required**: Does the journal require conflict of interest disclosure?
  Values: "required" | "not_required" | "varies" | "unknown"
- **ethics_policy**: Full text or summary of the journal's ethics policy (free-text).
  Include: which ethics committee standards are referenced (e.g., Declaration of Helsinki),
  what types of studies require ethics approval, and any specific formatting requirements.
- **informed_consent_policy**: Full text or summary of the journal's informed consent policy (free-text).
  Include: what types of studies require consent documentation, whether consent forms
  need to be uploaded, and any specific wording requirements.
- **conflict_of_interest_policy**: Full text or summary of COI disclosure requirements (free-text).
  Include: what types of interests must be disclosed (financial, personal, institutional),
  the required format/structure of COI statements, and any time period covered.
  ⚠ IMPORTANT for ethics check: Also capture the journal's expected COI heading name
  ("Competing interests" vs "Conflict of interest") and phrasing pattern
  (e.g., "The authors declare no competing interests." vs "None declared").
  Note whether a minimal statement is sufficient or a full individual-author declaration is required.
- **funding_statement_policy**: Any requirements for funding statements.

## Section heading taxonomy (manuscript_structure) — HIGH PRIORITY

Extract the journal's accepted and alternative section heading names:

- **section_aliases**: A dictionary mapping canonical section names to lists of acceptable alternative heading names used by the journal. For example, some journals accept "Background" as equivalent to "Introduction", or "Summary" as equivalent to "Abstract", or "Concluding remarks" as part of the Discussion. Build a mapping like:
  ```json
  "section_aliases": {
      "abstract": ["Abstract", "Summary"],
      "introduction": ["Introduction", "Background"],
      "discussion": ["Discussion"],
      "conclusion": ["Conclusion", "Conclusions", "Concluding remarks"],
      "methods": ["Methods", "Materials and methods", "Statistical analyses"],
      "competing_interests": ["Competing interests", "Conflict of interest"]
  }
  ```

- **section_alias_rules**: When the same heading name has DIFFERENT meanings depending on position in the manuscript, record the disambiguation rule. Example rules:
  - "Summary" before Introduction = abstract (synopsis)
  - "Research highlights" before Introduction = highlights (front matter), not a main text section
  - "Concluding remarks" inside or immediately after Discussion = Discussion subsection, NOT a standalone Conclusion
  - "Statistical Analyses" inside Methods = Methods subsection
  Format: [{"alias": "Summary", "canonical": "abstract", "condition": "before_introduction"}, ...]

- **front_matter_sections**: Sections that appear BEFORE the main text (Title, Abstract, Summary, Keywords, Research highlights). These are NOT evaluated for main text order compliance.
- **back_matter_sections**: Sections that appear AFTER the main text (Data Availability, References, Acknowledgements, Funding, Author Contributions, Competing Interests, AI declaration, Figure legends, Tables). These are NOT evaluated for main text order compliance.
- **main_text_order**: The expected order of main body sections (e.g. ["Introduction", "Results", "Discussion", "Methods"] for Scientific Reports).
- **expected_section_order**: The full expected order including front matter, main text, and back matter.

## Journal evaluation axis (review_policy + publication_criteria)

This is the MOST IMPORTANT section for peer review strategy. Determine:

- **technical_soundness_oriented**: Does the journal state explicitly that they evaluate scientific validity / technical soundness rather than perceived importance, significance, or impact? Journals like Scientific Reports and PLOS ONE are explicitly soundness-oriented.
- **importance_significance_impact_assessed**: Do reviewers assess whether the work is important/significant/high-impact? Many high-tier journals do; soundness-oriented journals explicitly do NOT.
- **niche_scope_allowed**: Does the journal accept niche/specialized research?
- **negative_results_allowed**: Does the journal accept negative or null results?
- **replication_allowed**: Does the journal accept replication studies?
- **main_review_questions**: List the key questions reviewers are asked (e.g. "Is the methodology sound?", "Are conclusions supported by data?").
- **claims_must_be_supported_by_data**: Does the journal require that all claims be directly supported by the presented data?
- **methods_analysis_interpretation_focus**: Does the journal emphasize that methods, analysis, and interpretation must be appropriate and rigorous?

Also populate publication_criteria with the same information using the standard fields:
- novelty_required, impact_required, significance_required: "high"/"moderate"/"low"/"not_explicitly_required"/"unknown"
- technical_soundness_focus, methodological_rigour_focus, etc.: "true"/"false"/"unknown"

Also populate research_type_acceptance with:
- accepts_incremental_research, accepts_confirmatory_research, accepts_replication, accepts_negative_or_null_results, accepts_niche_scope, accepts_multidisciplinary_work: "true"/"false"/"unknown"

## Journal positioning

- **soundness_oriented_journal**: Same as technical_soundness_oriented — does this journal primarily evaluate soundness?
- **selectivity_basis**: "technical soundness", "novelty and impact", or "both"
- **evaluation_axis_summary**: 1-2 sentence summary of the journal's evaluation philosophy
- Populate the standard journal_position fields (multidisciplinary_mega_journal, etc.)

IMPORTANT RULES:
- Only include information you are confident about. Use null, empty strings, or "unknown" for unknown fields.
- DO NOT fabricate or guess information. If you don't know, say so with null/empty/"unknown".
- For rating fields, use the prescribed enum values.
- For boolean fields, use "true"/"false"/"unknown". BUT NOTE: ethics_review_required, informed_consent_required, coi_disclosure_required are NOT boolean — they are enum strings: "required" | "not_required" | "varies" | "unknown". Do NOT use "true"/"false" for these fields.
- Search for journal metrics (Impact Factor, CiteScore, SJR, quartile, etc.) using your knowledge.
- For the submission_strategy section, provide actionable guidance based on the journal's known editorial preferences.
- For manuscript_structure.expected_section_order: provide the ordered list of sections as they should appear.
- Use your knowledge of the journal. If uncertain, mark as "unknown" rather than guessing.
- Output ONLY valid JSON — no markdown, no explanations, no code fences.

## CRITICAL: sources format

The "sources" field MUST be an array of OBJECTS (not strings!). Each object must have:
- url: the full URL of the page you used
- title: a descriptive title for the page (e.g. "Submission guidelines | Scientific Reports")
- accessed_at: ISO datetime string (e.g. "2026-05-20T12:00:00Z") — use the current date
- retrieved_text_summary: a short summary of what information was obtained from this page

Example:
"sources": [
  {
    "url": "https://www.nature.com/srep/author-instructions/submission-guidelines",
    "title": "Submission guidelines | Scientific Reports",
    "accessed_at": "2026-05-20T12:00:00Z",
    "retrieved_text_summary": "Manuscript structure, word limits, abstract requirements, ethics policy, COI requirements, display item limits"
  }
]

DO NOT output sources as a flat array of URL strings like ["https://...", "https://..."]. This will cause validation failure.

The output must match the following JSON schema exactly:"""


# ── public API ───────────────────────────────────────────────────────────

def build_journal_profile_messages(journal_name, journal_url="",
                                   article_type="Article"):
    """Build system+user messages for LLM journal profile generation.

    Args:
        journal_name: Target journal name (e.g. "Scientific Reports").
        journal_url: Journal homepage or submission guidelines URL.
        article_type: Article type being submitted.

    Returns:
        list of {"role": ..., "content": ...} dicts.
    """
    system_content = (
        JOURNAL_PROFILE_SYSTEM_PROMPT + "\n\n" +
        JOURNAL_PROFILE_SCHEMA_DESC
    )

    parts = [
        f"Please research the following journal and fill in the JSON profile:",
        f"",
        f"Journal Name: {journal_name or '(not provided — use best judgment)'}",
        f"Journal URL: {journal_url or '(not provided)'}",
        f"Article Type: {article_type}",
        f"",
        f"Produce the JSON object now.",
    ]
    user_content = "\n".join(parts)

    return [
        {"role": "system", "content": system_content},
        {"role": "user", "content": user_content},
    ]


def apply_defaults(profile_dict):
    """Deep-merge profile_dict with DEFAULT_JOURNAL_PROFILE defaults.

    Missing top-level keys and nested keys are filled from defaults.
    Existing values (including None and empty strings) are preserved.

    Args:
        profile_dict: Parsed LLM response dict (may be incomplete).

    Returns:
        Complete dict with all schema fields present.
    """
    if not isinstance(profile_dict, dict):
        return dict(DEFAULT_JOURNAL_PROFILE)

    def _merge(target, source):
        """Recursively merge source defaults into target."""
        for key, default_val in source.items():
            if key not in target:
                target[key] = default_val
            elif isinstance(default_val, dict) and isinstance(target.get(key), dict):
                _merge(target[key], default_val)
        return target

    return _merge(dict(profile_dict), DEFAULT_JOURNAL_PROFILE)


def _build_journal_markdown(profile):
    """Generate a human-readable markdown draft from a journal profile dict.

    Args:
        profile: Complete journal profile dict.

    Returns:
        str: Markdown content.
    """
    rs = profile.get("reference_style", {})
    sg = profile.get("submission_guidelines", {})
    rp = profile.get("review_policy", {})
    pc = profile.get("publication_criteria", {})
    rt = profile.get("research_type_acceptance", {})
    jp = profile.get("journal_position", {})
    mx = profile.get("metrics", {})
    ss = profile.get("submission_strategy", {})
    sources = profile.get("sources", [])

    lines = [
        f"# Journal Profile: {profile.get('journal_name', '(unknown)')}",
        "",
        f"- **URL**: {profile.get('journal_url') or '(not set)'}",
        f"- **Publisher**: {profile.get('publisher') or '(not set)'}",
        f"- **Article Type**: {profile.get('article_type', 'Article')}",
        f"- **Source**: {profile.get('source', 'manual')}",
        f"- **Updated**: {profile.get('updated_at', '')}",
        "",
        "## Reference Style",
        "",
        f"- **Style Name**: {rs.get('style_name') or '(unknown)'}",
        f"- **In-text Citation**: {rs.get('in_text_citation', 'numeric')}",
        f"- **Reference List Order**: {rs.get('reference_list_order', 'order_of_appearance')}",
        f"- **DOI Required**: {rs.get('doi_required', 'unknown')}",
        f"- **URL Access Date Required**: {rs.get('url_access_date_required')}",
        f"- **Journal Title Style**: {rs.get('journal_title_style', 'unknown')}",
        f"- **Example Reference**:",
        f"  ```",
        f"  {rs.get('example_reference', '') or '(not provided)'}",
        f"  ```",
        "",
        "## Submission Guidelines",
        "",
        f"- **Word Limit**: {sg.get('word_limit') or '(not set)'}",
        f"- **Abstract Limit**: {sg.get('abstract_limit') or '(not set)'}",
        f"- **Figure/Table Limits**: {sg.get('figure_table_limits') or '(not set)'}",
        "",
        "### Manuscript Structure",
        "",
        f"- **Recommended Structure**: {', '.join(sg.get('recommended_manuscript_structure', [])) or '(not set)'}",
        f"- **Section Order**: {sg.get('section_order') or '(not set)'}",
        f"- **Methods Position**: {sg.get('methods_position') or '(not set)'}",
        f"- **Abstract Structure**: {sg.get('abstract_structure') or '(not set)'}",
        "",
        "### Limits",
        "",
        f"- **Main Text**: {sg.get('main_text_word_limit') or '(not set)'} words",
        f"- **Title**: {sg.get('title_word_limit') or '(not set)'} words",
        f"- **Keywords**: max {sg.get('keyword_limit') or '(not set)'}",
        f"- **References**: max {sg.get('reference_limit') or '(not set)'}",
        f"- **Display Items**: max {sg.get('display_item_limit') or '(not set)'}",
        f"- **Figure Legends**: max {sg.get('figure_legend_limit') or '(not set)'} words",
        f"- **Line Numbers**: {sg.get('line_numbers_recommended')}",
        f"- **Footnotes**: {sg.get('footnotes_allowed')}",
        "",
        "### Policies",
        "",
        f"- **Supplementary Material**: {sg.get('supplementary_material_policy') or '(not set)'}",
        f"- **Data Availability**: {sg.get('data_availability_policy') or '(not set)'}",
        f"- **Ethics**: {sg.get('ethics_policy') or '(not set)'}",
        f"- **Conflict of Interest**: {sg.get('conflict_of_interest_policy') or '(not set)'}",
        f"- **Funding Statement**: {sg.get('funding_statement_policy') or '(not set)'}",
        "",
        "## Review Policy",
        "",
        f"- **Novelty Requirement**: {rp.get('novelty_requirement') or '(not set)'}",
        f"- **Methodological Requirements**: {rp.get('methodological_requirements') or '(not set)'}",
        f"- **Statistical Reporting**: {rp.get('statistical_reporting_expectations') or '(not set)'}",
        "",
        "### Evaluation Axis",
        "",
        f"- **Technical Soundness Oriented**: {rp.get('technical_soundness_oriented', 'unknown')}",
        f"- **Importance/Significance/Impact Assessed**: {rp.get('importance_significance_impact_assessed', 'unknown')}",
        f"- **Niche Scope Allowed**: {rp.get('niche_scope_allowed', 'unknown')}",
        f"- **Negative Results Allowed**: {rp.get('negative_results_allowed', 'unknown')}",
        f"- **Replication Allowed**: {rp.get('replication_allowed', 'unknown')}",
        f"- **Methods/Analysis/Interpretation Focus**: {rp.get('methods_analysis_interpretation_focus', 'unknown')}",
        f"- **Claims Must Be Supported by Data**: {rp.get('claims_must_be_supported_by_data', 'unknown')}",
    ]

    main_questions = rp.get("main_review_questions", [])
    if main_questions:
        lines.append("- **Main Review Questions**:")
        for q in main_questions:
            lines.append(f"  - {q}")
    else:
        lines.append("- **Main Review Questions**: (not set)")

    guidelines = rp.get("reporting_guidelines", [])
    if guidelines:
        lines.append(f"- **Reporting Guidelines**: {', '.join(guidelines)}")
    else:
        lines.append(f"- **Reporting Guidelines**: (not set)")

    lines.extend([
        f"- **Reviewer Guidance**: {rp.get('reviewer_guidance') or '(not set)'}",
        f"- **Editorial Policy Summary**: {rp.get('editorial_policy_summary') or '(not set)'}",
        "",
        "## Publication Criteria / Evaluation Axis",
        "",
        f"- **Novelty Required**: {pc.get('novelty_required', 'unknown')}",
        f"- **Impact Required**: {pc.get('impact_required', 'unknown')}",
        f"- **Significance Required**: {pc.get('significance_required', 'unknown')}",
        f"- **Technical Soundness Focus**: {pc.get('technical_soundness_focus', 'unknown')}",
        f"- **Methodological Rigour Focus**: {pc.get('methodological_rigour_focus', 'unknown')}",
        f"- **Statistical Rigour Focus**: {pc.get('statistical_rigour_focus', 'unknown')}",
        f"- **Conclusion-Supported-by-Data Focus**: {pc.get('conclusion_supported_by_data_focus', 'unknown')}",
        f"- **Ethical Robustness Focus**: {pc.get('ethical_robustness_focus', 'unknown')}",
        f"- **Data Availability Focus**: {pc.get('data_availability_focus', 'unknown')}",
        f"- **Reproducibility/Transparency Focus**: {pc.get('reproducibility_transparency_focus', 'unknown')}",
        "",
        "## Research Type Acceptance",
        "",
        f"- **Incremental Research**: {rt.get('accepts_incremental_research', 'unknown')}",
        f"- **Confirmatory Research**: {rt.get('accepts_confirmatory_research', 'unknown')}",
        f"- **Replication**: {rt.get('accepts_replication', 'unknown')}",
        f"- **Negative/Null Results**: {rt.get('accepts_negative_or_null_results', 'unknown')}",
        f"- **Niche Scope**: {rt.get('accepts_niche_scope', 'unknown')}",
        f"- **Multidisciplinary Work**: {rt.get('accepts_multidisciplinary_work', 'unknown')}",
        "",
        "## Journal Positioning",
        "",
        f"- **Multidisciplinary Mega-Journal**: {jp.get('multidisciplinary_mega_journal', 'unknown')}",
        f"- **Broad-Scope Journal**: {jp.get('broad_scope_journal', 'unknown')}",
        f"- **Field-Specific High-Impact**: {jp.get('field_specific_high_impact_journal', 'unknown')}",
        f"- **Clinical High-Impact**: {jp.get('clinical_high_impact_journal', 'unknown')}",
        f"- **Society Journal**: {jp.get('society_journal', 'unknown')}",
        f"- **Soundness-Oriented Journal**: {jp.get('soundness_oriented_journal', 'unknown')}",
        f"- **Selectivity Basis**: {jp.get('selectivity_basis') or '(not set)'}",
        f"- **Evaluation Axis**: {jp.get('evaluation_axis_summary') or '(not set)'}",
        f"- **Summary**: {jp.get('journal_position_summary', '') or '(not set)'}",
        "",
        "## Metrics",
        "",
        f"- **Impact Factor**: {mx.get('impact_factor') or '(not set)'} ({mx.get('impact_factor_year') or 'year unknown'})",
        f"- **5-Year IF**: {mx.get('five_year_impact_factor') or '(not set)'} ({mx.get('five_year_impact_factor_year') or 'year unknown'})",
        f"- **CiteScore**: {mx.get('cite_score') or '(not set)'} ({mx.get('cite_score_year') or 'year unknown'})",
        f"- **SJR**: {mx.get('sjr') or '(not set)'} ({mx.get('sjr_year') or 'year unknown'})",
        f"- **SNIP**: {mx.get('snip') or '(not set)'} ({mx.get('snip_year') or 'year unknown'})",
        f"- **Quartile**: {mx.get('quartile') or '(not set)'}",
        f"- **Category Rankings**: {mx.get('category_rankings') or '(not set)'}",
        f"- **Indexing**: {mx.get('indexing') or '(not set)'}",
        f"- **Acceptance Rate**: {mx.get('acceptance_rate_if_available') or '(not set)'}",
        "",
        "## Submission Strategy",
        "",
        f"- **Novelty Strategy**: {ss.get('suitable_novelty_strategy') or '(not set)'}",
        f"- **Framing Strategy**: {ss.get('suitable_framing_strategy') or '(not set)'}",
        f"- **Unsuitable Claims**: {ss.get('unsuitable_claims') or '(not set)'}",
        f"- **Claims to Avoid**: {ss.get('claims_to_avoid') or '(not set)'}",
        f"- **Reviewer Concerns**: {ss.get('reviewer_likely_concerns') or '(not set)'}",
        f"- **Strengths to Emphasize**: {ss.get('manuscript_strengths_to_emphasize') or '(not set)'}",
        f"- **Weaknesses to Control**: {ss.get('manuscript_weaknesses_to_control') or '(not set)'}",
        "",
    ])

    if sources:
        lines.append("## Sources")
        lines.append("")
        for src in sources:
            lines.append(f"- [{src.get('title', 'Untitled')}]({src.get('url', '')}) — accessed {src.get('accessed_at', '')}")
            if src.get('retrieved_text_summary'):
                lines.append(f"  {src['retrieved_text_summary']}")
        lines.append("")

    lines.extend([
        "## Notes",
        "",
        profile.get("notes", "") or "(none)",
        "",
    ])

    return "\n".join(lines)


def save_journal_profile(project_dir, profile):
    """Save journal profile to project directory.

    Args:
        project_dir: Path to project working folder.
        profile: Complete journal profile dict.

    Returns:
        tuple of (json_path, md_path)
    """
    profile["updated_at"] = datetime.now(JST).isoformat()

    json_path = os.path.join(project_dir, "journal_profile.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(profile, f, indent=2, ensure_ascii=False)

    md_path = os.path.join(project_dir, "journal_profile_draft.md")
    md_content = _build_journal_markdown(profile)
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)

    return json_path, md_path
