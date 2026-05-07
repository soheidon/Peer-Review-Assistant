"""Final review document generation.

Reads merged section results (merged.section.json) and generates the
final human-readable review documents in outputs/final/.
"""

import json
import os


def final_merge(project_dir):
    """Load merged section results and generate all final output documents.

    Args:
        project_dir: Path to the project working folder.

    Returns:
        dict with keys:
            content: dict of {final_review_md, comments_to_authors_md,
                     confidential_comments_md, recommendation_md, audit_trail}
            total_comments: int
            major_count: int
            minor_count: int
            recommendation: str

    Raises:
        FileNotFoundError: if outputs/structure/merged.section.json is missing.
    """
    merged = _load_merged_structure(project_dir)
    abstract = _load_abstract_text(project_dir)

    comments = merged.get("comments", [])
    major = [c for c in comments if c.get("severity") == "major"]
    minor = [c for c in comments if c.get("severity") != "major"]

    expression_comments = []
    expression_available = False
    if _merged_expression_exists(project_dir):
        expr_merged = _load_merged_expression(project_dir)
        expression_comments = expr_merged.get("comments", [])
        expression_available = True

    recommendation = _get_recommendation(len(major), len(minor))

    final_review_md = _generate_final_review_md(
        merged, major, minor, expression_comments, abstract, recommendation
    )
    comments_to_authors_md = _generate_comments_to_authors_md(
        major, minor, expression_comments
    )
    confidential_md = _generate_confidential_comments_md(expression_available)
    recommendation_md = _generate_recommendation_md(
        len(major), len(minor), len(comments) + len(expression_comments),
        len(expression_comments), expression_available,
    )
    audit_trail = _build_audit_trail(
        merged, len(major), len(minor), recommendation,
        abstract is not None, expression_available, len(expression_comments),
    )

    return {
        "content": {
            "final_review_md": final_review_md,
            "comments_to_authors_md": comments_to_authors_md,
            "confidential_comments_md": confidential_md,
            "recommendation_md": recommendation_md,
            "audit_trail": audit_trail,
        },
        "total_comments": len(comments) + len(expression_comments),
        "major_count": len(major),
        "minor_count": len(minor) + len(expression_comments),
        "recommendation": recommendation,
    }


def _load_merged_structure(project_dir):
    """Load and return outputs/structure/merged.section.json.

    Raises:
        FileNotFoundError: if the file does not exist.
    """
    path = os.path.join(
        project_dir, "outputs", "structure", "merged.section.json"
    )
    if not os.path.isfile(path):
        raise FileNotFoundError(
            "outputs/structure/merged.section.json not found. "
            "Run merge-section --check structure first."
        )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_abstract_text(project_dir):
    """Load sections/abstract.txt if present. Returns None if absent."""
    path = os.path.join(project_dir, "sections", "abstract.txt")
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            text = f.read().strip()
            return text if text else None
    return None


def _merged_expression_exists(project_dir):
    """Check if outputs/expression/merged.section.json exists."""
    path = os.path.join(
        project_dir, "outputs", "expression", "merged.section.json"
    )
    return os.path.isfile(path)


def _load_merged_expression(project_dir):
    """Load and return outputs/expression/merged.section.json."""
    path = os.path.join(
        project_dir, "outputs", "expression", "merged.section.json"
    )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _get_recommendation(major_count, minor_count):
    """Return recommendation string based on severity counts."""
    if major_count > 0:
        return "Major revision draft"
    if minor_count > 0:
        return "Minor revision draft"
    return "No recommendation generated"


def _format_location(location):
    """Format a location dict as a display string.

    {'section': 'Introduction', 'paragraph_start': 3, 'paragraph_end': 5}
    -> 'Introduction, Paragraphs 3-5'
    """
    if not location:
        return "Unknown location"
    section = location.get("section", "Unknown")
    p_start = location.get("paragraph_start")
    p_end = location.get("paragraph_end")
    if p_start is not None and p_end is not None:
        if p_start == p_end:
            return f"{section}, Paragraph {p_start}"
        return f"{section}, Paragraphs {p_start}-{p_end}"
    if p_start is not None:
        return f"{section}, Paragraph {p_start}"
    return section


def _generate_final_review_md(merged, major, minor, expression_comments,
                              abstract, recommendation):
    """Generate the complete final_review.md."""
    lines = ["# Peer Review", ""]

    # Section 1: Brief Summary
    lines.append("## 1. Brief Summary")
    lines.append("")
    if abstract:
        lines.append(abstract)
    else:
        lines.append(
            "This manuscript was reviewed using automated analysis "
            "as part of the Peer Review Assistant. "
            "A full review incorporating citation verification, originality "
            "assessment, and domain-specific evaluation was not performed."
        )
    lines.append("")

    # Section 2: General Assessment
    lines.append("## 2. General Assessment")
    lines.append("")
    lines.append(merged.get("summary", "No assessment available."))
    lines.append("")

    # Section 3: Major Comments
    lines.append("## 3. Major Comments")
    lines.append("")
    if major:
        for i, c in enumerate(major, 1):
            loc = _format_location(c.get("location"))
            category = c.get("category", "Structure")
            lines.append(f"### 3.{i}. {category} / {loc}")
            lines.append("")
            lines.append(f"**Issue**: {c.get('issue', '')}")
            lines.append("")
            lines.append(f"**Evidence**: {c.get('evidence', '')}")
            lines.append("")
            suggested = c.get("suggested_author_comment", "")
            if suggested:
                lines.append(f"**Suggested Revision**: {suggested}")
                lines.append("")
            lines.append(f"**Confidence**: {c.get('confidence', 'low')}")
            lines.append("")
    else:
        lines.append("No major structural issues were identified.")
        lines.append("")

    # Section 4: Minor Comments — Structure
    lines.append("## 4. Minor Comments — Structure")
    lines.append("")
    if minor:
        for i, c in enumerate(minor, 1):
            loc = _format_location(c.get("location"))
            category = c.get("category", "Structure")
            lines.append(f"### 4.{i}. {category} / {loc}")
            lines.append("")
            lines.append(f"**Issue**: {c.get('issue', '')}")
            lines.append("")
            suggested = c.get("suggested_author_comment", "")
            if suggested:
                lines.append(f"**Suggested Revision**: {suggested}")
                lines.append("")
            lines.append(f"**Confidence**: {c.get('confidence', 'low')}")
            lines.append("")
    else:
        lines.append("No minor structural issues were identified.")
        lines.append("")

    # Section 5: Minor Comments — Language and Expression
    lines.append("## 5. Minor Comments — Language and Expression")
    lines.append("")
    if expression_comments:
        for i, c in enumerate(expression_comments, 1):
            loc = _format_location(c.get("location"))
            category = c.get("category", "Expression")
            lines.append(f"### 5.{i}. {category} / {loc}")
            lines.append("")
            lines.append(f"**Issue**: {c.get('issue', '')}")
            lines.append("")
            suggested = c.get("suggested_author_comment", "")
            if suggested:
                lines.append(f"**Suggested Revision**: {suggested}")
                lines.append("")
            lines.append(f"**Confidence**: {c.get('confidence', 'low')}")
            lines.append("")
    else:
        lines.append(
            "Expression and language quality was not assessed in this run. "
            "Run expression check to include language quality comments."
        )
        lines.append("")

    # Section 6: Citation and Literature Concerns
    lines.append("## 6. Citation and Literature Concerns")
    lines.append("")
    lines.append(
        "Not assessed in the current run. Citation verification and "
        "literature completeness checks will be available in a future version."
    )
    lines.append("")

    # Section 7: Originality and Overlap
    lines.append("## 7. Originality and Overlap")
    lines.append("")
    lines.append(
        "Not assessed in the current run. Originality and overlap "
        "analysis will be available in a future version."
    )
    lines.append("")

    # Section 8: Confidential Comments to the Editor
    lines.append("## 8. Confidential Comments to the Editor")
    lines.append("")
    checks_run = ["structural organization", "IMRaD compliance"]
    if expression_comments:
        checks_run.append("expression and language quality")
    checks_run_str = ", ".join(checks_run)
    lines.append(
        f"This review assessed: {checks_run_str}. "
        "Citation verification, originality assessment, and statistical "
        "methodology review were not performed in this run. "
        "The human reviewer should supplement this assessment "
        "with their domain expertise and independent evaluation."
    )
    lines.append("")

    # Section 9: Recommendation
    lines.append("## 9. Recommendation")
    lines.append("")
    lines.append(f"**Verdict**: {recommendation}")
    lines.append("")
    if recommendation == "Major revision draft":
        lines.append(
            "The manuscript requires substantial revision before "
            "it can be considered for publication. Please see the Major "
            "Comments section for specific required changes."
        )
    elif recommendation == "Minor revision draft":
        lines.append(
            "The manuscript would benefit from minor improvements "
            "as noted in the comments above. These changes are not expected "
            "to require substantial reworking of the content."
        )
    else:
        lines.append(
            "No comments were generated, so no recommendation can "
            "be made. Additional review checks should be run to provide "
            "a complete assessment."
        )
    lines.append("")

    return "\n".join(lines)


def _generate_comments_to_authors_md(major, minor, expression_comments):
    """Generate comments_to_authors.md — only author-facing fields."""
    lines = ["# Comments to Authors", ""]

    all_comments = list(major) + list(minor) + list(expression_comments)

    if not all_comments:
        lines.append(
            "No comments were generated. "
            "Please see the full review for context."
        )
        return "\n".join(lines)

    for i, c in enumerate(all_comments, 1):
        loc = _format_location(c.get("location"))
        category = c.get("category", "Structure")
        lines.append(f"### {i}. {category} / {loc}")
        lines.append("")
        lines.append(c.get("issue", ""))
        lines.append("")
        suggested = c.get("suggested_author_comment", "")
        if suggested:
            lines.append(f"**Suggested revision**: {suggested}")
            lines.append("")

    return "\n".join(lines)


def _generate_confidential_comments_md(expression_available=False):
    """Generate confidential_comments_to_editor.md."""
    scope_lines = [
        "**Scope of this review:**",
        "- Structure and organization of the manuscript",
        "- IMRaD compliance (Introduction, Methods, Results, Discussion)",
        "- Section completeness and logical flow",
    ]
    not_assessed = [
        "- Citation accuracy and completeness",
        "- Originality and overlap with existing literature",
        "- Statistical methodology",
    ]
    if expression_available:
        scope_lines.append("- Expression quality and language")
    else:
        not_assessed.append("- Expression quality and language")

    return "\n".join([
        "# Confidential Comments to the Editor",
        "",
        "This review was generated using automated analysis as part of "
        "the Peer Review Assistant. The assessment was performed by "
        "independent LLM reviewers.",
        "",
    ] + scope_lines + [
        "",
        "**Not assessed in this run:**",
    ] + not_assessed + [
        "",
        "The human reviewer should supplement this assessment with their own "
        "evaluation of these aspects.",
        "",
        "**Reviewer confidence**: Overall confidence varies by comment; see "
        "individual comments in the main review for per-comment confidence "
        "levels.",
        "",
    ])


def _generate_recommendation_md(major_count, minor_count, total_count,
                                expression_count=0, expression_available=False):
    """Generate recommendation.md with verdict and justification."""
    recommendation = _get_recommendation(major_count, minor_count)

    checks = ["structure"]
    if expression_available:
        checks.append("expression")

    lines = [
        "# Recommendation",
        "",
        f"**Verdict**: {recommendation}",
        "",
        f"**Basis**: This recommendation is based on {total_count} "
        f"comment(s) from {', '.join(checks)} check(s):",
        f"- {major_count} major issue(s) (structure)",
        f"- {minor_count} minor issue(s) (structure)",
    ]
    if expression_available:
        lines.append(f"- {expression_count} minor issue(s) (expression)")
    lines += [
        "",
        "**Limitations**: Citation verification, originality assessment, "
        "and statistical methodology checks were not performed. "
        "The recommendation should be treated as a preliminary draft for "
        "the human reviewer to finalize.",
        "",
    ]

    if total_count == 0:
        lines.append(
            "No issues were identified. A complete recommendation "
            "requires running the full set of review checks (expression, "
            "methods, citations, originality)."
        )
        lines.append("")

    return "\n".join(lines)


def _build_audit_trail(merged, major_count, minor_count, recommendation,
                       abstract_available, expression_available=False,
                       expression_comment_count=0):
    """Build the audit_trail.json data structure."""
    from datetime import datetime, timezone, timedelta

    JST = timezone(timedelta(hours=9))
    now = datetime.now(JST)

    assessed = ["structure"]
    not_assessed = ["methods_stats", "citation", "originality"]
    inputs = {
        "merged_structure": "outputs/structure/merged.section.json",
        "abstract_available": abstract_available,
    }
    if expression_available:
        assessed.append("expression")
        inputs["merged_expression"] = "outputs/expression/merged.section.json"
    else:
        not_assessed.append("expression")

    comment_counts = {
        "total": len(merged.get("comments", [])) + expression_comment_count,
        "major": major_count,
        "minor": minor_count,
    }
    if expression_available:
        comment_counts["structure_minor"] = minor_count
        comment_counts["expression_minor"] = expression_comment_count

    return {
        "generated_at": now.isoformat(),
        "phase": "9B" if expression_available else "9A",
        "description": (
            "Final review generation with structure and expression checks"
            if expression_available else
            "Structure-only final review generation"
        ),
        "inputs": inputs,
        "check_items_assessed": assessed,
        "check_items_not_assessed": not_assessed,
        "comment_counts": comment_counts,
        "recommendation": recommendation,
        "output_files": [
            "outputs/final/final_review.md",
            "outputs/final/comments_to_authors.md",
            "outputs/final/confidential_comments_to_editor.md",
            "outputs/final/recommendation.md",
            "outputs/final/audit_trail.json",
        ],
    }
