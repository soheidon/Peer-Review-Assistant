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
  "notes": "string (free notes)"
}"""

JOURNAL_PROFILE_SYSTEM_PROMPT = """\
You are a scholarly publishing expert. Your task is to research a target journal
and produce structured information about its submission guidelines, citation style,
and review policies.

IMPORTANT RULES:
- Only include information you are confident about. Use null or empty strings for unknown fields.
- DO NOT fabricate or guess information. If you don't know, say so with null/empty.
- Prioritize information from the journal's official submission guidelines page.
- Focus especially on: in-text citation format, reference list format, DOI/URL handling,
  data availability policy, ethics policy, and methodological/statistical reporting requirements.
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
