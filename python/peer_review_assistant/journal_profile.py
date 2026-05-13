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
    },
    "review_policy": {
        "novelty_requirement": "",
        "methodological_requirements": "",
        "statistical_reporting_expectations": "",
        "reporting_guidelines": [],
        "reviewer_guidance": "",
        "editorial_policy_summary": "",
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
        "journal_position_summary": "",
    },
    # ── Metrics ──
    "metrics": {
        "impact_factor": "",
        "five_year_impact_factor": "",
        "cite_score": "",
        "sjr": "",
        "snip": "",
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
    "funding_statement_policy": "string"
  },
  "review_policy": {
    "novelty_requirement": "string",
    "methodological_requirements": "string",
    "statistical_reporting_expectations": "string",
    "reporting_guidelines": ["string"],
    "reviewer_guidance": "string",
    "editorial_policy_summary": "string"
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
    "journal_position_summary": "string (1-2 sentence summary)"
  },
  "metrics": {
    "impact_factor": "string (number or empty if unknown)",
    "five_year_impact_factor": "string",
    "cite_score": "string",
    "sjr": "string (SCImago Journal Rank)",
    "snip": "string (Source Normalized Impact per Paper)",
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
  "sources": [{"url": "string", "title": "string", "accessed_at": "string (ISO datetime)", "retrieved_text_summary": "string"}],
  "notes": "string (free notes)"
}"""

JOURNAL_PROFILE_SYSTEM_PROMPT = """\
You are a scholarly publishing expert. Your task is to research a target journal
and produce structured information about its submission guidelines, citation style,
review policies, publication criteria, journal positioning, and metrics.

IMPORTANT RULES:
- Only include information you are confident about. Use null, empty strings, or "unknown" for unknown fields.
- DO NOT fabricate or guess information. If you don't know, say so with null/empty/"unknown".
- Prioritize information from the journal's official submission guidelines page, aims & scope, and guide to referees.
- For the publication_criteria section, determine whether this journal emphasizes thematic novelty/impact OR technical soundness/methodological rigor. Some journals (e.g. Scientific Reports, PLOS ONE) explicitly state they prioritize soundness over novelty.
- For rating fields (novelty_required, impact_required, significance_required), use "high"/"moderate"/"low"/"not_explicitly_required"/"unknown".
- For boolean fields, use "true"/"false"/"unknown".
- Search for journal metrics (Impact Factor, CiteScore, SJR, quartile, etc.) using your knowledge. Fill in what you know.
- For the submission_strategy section, provide actionable guidance based on the journal's known editorial preferences.
- Use your knowledge of the journal. If uncertain, mark as "unknown" rather than guessing.
- Output ONLY valid JSON — no markdown, no explanations, no code fences.

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
    ]

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
        f"- **Summary**: {jp.get('journal_position_summary', '') or '(not set)'}",
        "",
        "## Metrics",
        "",
        f"- **Impact Factor**: {mx.get('impact_factor') or '(not set)'}",
        f"- **5-Year IF**: {mx.get('five_year_impact_factor') or '(not set)'}",
        f"- **CiteScore**: {mx.get('cite_score') or '(not set)'}",
        f"- **SJR**: {mx.get('sjr') or '(not set)'}",
        f"- **SNIP**: {mx.get('snip') or '(not set)'}",
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
