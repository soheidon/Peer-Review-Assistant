"""Final check report generation.

Reads merged section results (merged.section.json) and generates the
final human-readable check reports in outputs/final/.
"""

import json
import os

from peer_review_assistant.output.docx_writer import convert_md_to_docx
from peer_review_assistant.output.txt_writer import convert_md_to_txt

# Translation map: key -> {"en": ..., "ja": ...}
_T = {
    "general_assessment": {"en": "General Assessment", "ja": "総合評価"},
    "verdict": {"en": "Submission Readiness", "ja": "投稿準備状況"},
    "verdict_label": {"en": "Readiness", "ja": "準備状況"},
    "key_strengths": {"en": "Key Strengths", "ja": "主な強み"},
    "key_concerns": {"en": "Key Concerns", "ja": "主な懸念"},
    "general_impressions": {"en": "General Impressions", "ja": "全体所感"},
    "structure": {"en": "Structure", "ja": "構造"},
    "expression": {"en": "Expression", "ja": "表現"},
    "methods_stats": {"en": "Methods and Statistics", "ja": "方法と統計"},
    "logic_argument": {"en": "Logic and Argument", "ja": "論理と議論"},
    "figure_table": {"en": "Figures and Tables", "ja": "図表"},
    "ethics": {"en": "Ethics and Conflict of Interest", "ja": "倫理と利益相反"},
    "recommendation_major": {"en": "Needs Major Revision", "ja": "大幅修正が必要"},
    "recommendation_minor": {"en": "Minor Improvements Suggested", "ja": "軽微な改善を提案"},
    "issue": {"en": "Suggestion", "ja": "改善提案"},
    "no_issues": {"en": "No issues were identified.", "ja": "問題は見つかりませんでした。"},
    "no_structural": {"en": "No structural issues were identified.", "ja": "構造上の問題は見つかりませんでした。"},
    "no_ms": {"en": "No methods/statistics issues were identified.", "ja": "方法・統計上の問題は見つかりませんでした。"},
    "no_la": {"en": "No logic/argument issues were identified.", "ja": "論理・議論上の問題は見つかりませんでした。"},
    "no_ft": {"en": "No figure/table issues were identified.", "ja": "図表上の問題は見つかりませんでした。"},
    "no_ethics": {"en": "No ethics or conflict of interest issues were identified.", "ja": "倫理・利益相反上の問題は見つかりませんでした。"},
    "not_assessed_expression": {
        "en": "Expression and language quality was not assessed in this run. Run expression check to include language quality comments.",
        "ja": "表現と言語の品質は今回評価されていません。表現チェックを実行すると言語品質のコメントが含まれます。",
    },
    "not_assessed_ms": {
        "en": "Methods and statistical quality was not assessed in this run. Run methods_stats check to include methodological quality comments.",
        "ja": "方法と統計の品質は今回評価されていません。methods_statsチェックを実行すると方法論的品質のコメントが含まれます。",
    },
    "not_assessed_la": {
        "en": "Logic and argument quality was not assessed in this run. Run logic_argument check to include logical quality comments.",
        "ja": "論理と議論の品質は今回評価されていません。logic_argumentチェックを実行すると論理的品質のコメントが含まれます。",
    },
    "not_assessed_ft": {
        "en": "Figure and table quality was not assessed in this run. Run figure_table check to include figure/table quality comments.",
        "ja": "図表の品質は今回評価されていません。figure_tableチェックを実行すると図表品質のコメントが含まれます。",
    },
    "not_assessed_ethics": {
        "en": "Ethics and conflict of interest were not assessed in this run. Run ethics check to include ethics/COI comments.",
        "ja": "倫理と利益相反は今回評価されていません。ethicsチェックを実行すると倫理・COIのコメントが含まれます。",
    },
}


def _t(key, lang="en"):
    """Look up a translated string."""
    entry = _T.get(key, {})
    return entry.get(lang, entry.get("en", key))


def _filter_comments(comments, selected_ids):
    """Filter comments to only include those with comment_id in selected_ids.

    If selected_ids is None, return all comments (no filtering).
    """
    if selected_ids is None:
        return comments
    return [c for c in comments if c.get("comment_id") in selected_ids]


def _load_selection(project_dir, check_name):
    """Load selection.json for a check type. Returns set of selected IDs or None."""
    sel_path = os.path.join(project_dir, "outputs", check_name, "selection.json")
    if not os.path.isfile(sel_path):
        return None
    with open(sel_path, "r", encoding="utf-8") as f:
        data = json.load(f)
    ids = data.get("selected_ids", [])
    if not ids:
        return None  # empty selection = select none (but treat as explicit)
    return set(ids)


def _load_external_check(project_dir, check_name):
    """Load external_check.json. Returns dict of comment_id -> verdict info, or None."""
    path = os.path.join(project_dir, "outputs", check_name, "external_check.json")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    verdicts = data.get("verdicts", [])
    if not verdicts:
        return None
    return {v["comment_id"]: v for v in verdicts}


def _filter_external_disagree(comments, external_check):
    """Remove comments that were judged 'disagree' by external LLM review.

    NOTE: This function is intentionally NOT called in final_merge().
    External evaluation is treated as advisory, not automatic filtering.
    The function remains available for future use if needed.
    """
    if external_check is None:
        return comments
    disagree_ids = {
        cid for cid, v in external_check.items()
        if v.get("verdict") == "disagree"
    }
    if not disagree_ids:
        return comments
    return [c for c in comments if c.get("comment_id") not in disagree_ids]


def _load_reevaluation(project_dir, check_name):
    """Load reevaluation.json. Returns dict of comment_id -> verdict info, or None."""
    path = os.path.join(project_dir, "outputs", check_name, "reevaluation.json")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    verdicts = data.get("verdicts", [])
    if not verdicts:
        return None
    return {v["comment_id"]: v for v in verdicts}


def _load_checked_comment_ids(project_dir):
    """Load checked comment IDs from comment_card_checked.json.

    The JSON has keys like "check_structure::structure_001": true/false.
    We extract the comment_id part (after "::") for keys whose source
    starts with "check_" or is "novelty_achievement" and whose value is true.

    Returns:
        set of comment_id strings, or None if the file doesn't exist.
    """
    path = os.path.join(project_dir, "outputs", "final", "_data", "comment_card_checked.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return None

    if not isinstance(data, dict):
        return None

    checked_ids = set()
    for key, is_checked in data.items():
        if not is_checked:
            continue
        # Key format: "source::comment_id"
        parts = key.split("::", 1)
        if len(parts) != 2:
            continue
        source, cid = parts
        if source.startswith("check_") or source == "novelty_achievement":
            checked_ids.add(cid)

    return checked_ids if checked_ids else None


def _load_verdict_checks(project_dir):
    """Load verdict section check states from comment_card_checked.json.

    Returns dict like {"verdict": True, "reasoning": True, "strengths": False, "concerns": False}.
    Defaults to True for any key not found.
    """
    path = os.path.join(project_dir, "outputs", "final", "_data", "comment_card_checked.json")
    if not os.path.isfile(path):
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return {}

    checks = {}
    for key, is_checked in data.items():
        if key.startswith("verdict::"):
            sub = key.split("::", 1)[1]
            checks[sub] = is_checked
    return checks


def _prepare_author_comments(comments, reevaluation):
    """Filter out dismissed comments and attach author-facing text.

    Returns a new list of comment dicts, each with '_author_text' set.
    Comments where the re-evaluation verdict is 'external_correct' and
    no author_comment was provided are excluded (dismissed).
    """
    result = []
    for c in comments:
        cid = c.get("comment_id", "")
        author_text = _get_author_facing_comment(c, reevaluation)
        if author_text is None:
            continue
        c_copy = dict(c)
        c_copy["_author_text"] = author_text
        result.append(c_copy)
    return result


def final_merge(project_dir, lang="en", output_format=None):
    """Load merged section results and generate all final output documents.

    Reads comment_card_checked.json to filter comments to only those the user
    has checked in the 査読コメント panel.

    Args:
        project_dir: Path to the project working folder.
        lang: Output language ("en" or "ja").
        output_format: List of output formats to generate, e.g. ["md", "docx"].
                       "all" in the list means generate everything. Default: ["all"].

    Returns:
        dict with keys:
            content: dict of {final_review_md, final_review_docx (or None),
                     final_review_txt (or None), comments_to_authors_md,
                     confidential_comments_md, recommendation_md, audit_trail}
            total_comments: int
            major_count: int
            minor_count: int
            recommendation: dict with level_en, level_ja, rationale

    Raises:
        FileNotFoundError: if outputs/structure/merged.section.json is missing.
    """
    if output_format is None:
        output_format = ["all"]
    fmt_set = set(output_format)
    _want = lambda f: "all" in fmt_set or f in fmt_set
    merged = _load_merged_structure(project_dir)
    abstract = _load_abstract_text(project_dir)

    # Load selection filters (if saved by the frontend)
    structure_sel = _load_selection(project_dir, "structure")
    expression_sel = _load_selection(project_dir, "expression")
    methods_stats_sel = _load_selection(project_dir, "methods_stats")
    logic_argument_sel = _load_selection(project_dir, "logic_argument")
    figure_table_sel = _load_selection(project_dir, "figure_table")
    ethics_sel = _load_selection(project_dir, "ethics")

    # Load external evaluation verdicts (advisory only, not auto-filtering)
    structure_ec = _load_external_check(project_dir, "structure")
    expression_ec = _load_external_check(project_dir, "expression")
    methods_stats_ec = _load_external_check(project_dir, "methods_stats")
    logic_argument_ec = _load_external_check(project_dir, "logic_argument")
    figure_table_ec = _load_external_check(project_dir, "figure_table")
    ethics_ec = _load_external_check(project_dir, "ethics")

    # Load re-evaluation verdicts (adjudication by reviewer1 for disputed items)
    structure_re = _load_reevaluation(project_dir, "structure")
    expression_re = _load_reevaluation(project_dir, "expression")
    methods_stats_re = _load_reevaluation(project_dir, "methods_stats")
    logic_argument_re = _load_reevaluation(project_dir, "logic_argument")
    figure_table_re = _load_reevaluation(project_dir, "figure_table")
    ethics_re = _load_reevaluation(project_dir, "ethics")

    comments = merged.get("comments", [])
    if structure_sel is not None:
        comments = _filter_comments(comments, structure_sel)
    major = [c for c in comments if c.get("severity") == "major"]
    minor = [c for c in comments if c.get("severity") != "major"]

    expression_comments = []
    expression_available = False
    if _merged_expression_exists(project_dir):
        expr_merged = _load_merged_expression(project_dir)
        expression_comments = expr_merged.get("comments", [])
        if expression_sel is not None:
            expression_comments = _filter_comments(expression_comments, expression_sel)
        expression_available = True

    ms_comments = []
    ms_available = False
    if _merged_methods_stats_exists(project_dir):
        ms_merged = _load_merged_methods_stats(project_dir)
        ms_comments = ms_merged.get("comments", [])
        if methods_stats_sel is not None:
            ms_comments = _filter_comments(ms_comments, methods_stats_sel)
        ms_available = True

    ms_major = [c for c in ms_comments if c.get("severity") == "major"]
    ms_minor = [c for c in ms_comments if c.get("severity") != "major"]

    la_comments = []
    la_available = False
    if _merged_logic_argument_exists(project_dir):
        la_merged = _load_merged_logic_argument(project_dir)
        la_comments = la_merged.get("comments", [])
        if logic_argument_sel is not None:
            la_comments = _filter_comments(la_comments, logic_argument_sel)
        la_available = True

    la_major_orig = [c for c in la_comments if c.get("severity") == "major"]
    la_minor_orig = [c for c in la_comments if c.get("severity") != "major"]

    ft_comments = []
    ft_available = False
    if _merged_figure_table_exists(project_dir):
        ft_merged = _load_merged_figure_table(project_dir)
        ft_comments = ft_merged.get("comments", [])
        if figure_table_sel is not None:
            ft_comments = _filter_comments(ft_comments, figure_table_sel)
        ft_available = True

    ft_major_orig = [c for c in ft_comments if c.get("severity") == "major"]
    ft_minor_orig = [c for c in ft_comments if c.get("severity") != "major"]

    ethics_comments = []
    ethics_available = False
    if _merged_ethics_exists(project_dir):
        ethics_merged = _load_merged_ethics(project_dir)
        ethics_comments = ethics_merged.get("comments", [])
        if ethics_sel is not None:
            ethics_comments = _filter_comments(ethics_comments, ethics_sel)
        ethics_available = True

    ethics_major_orig = [c for c in ethics_comments if c.get("severity") == "major"]
    ethics_minor_orig = [c for c in ethics_comments if c.get("severity") != "major"]

    # Filter by checked IDs from comment_card_checked.json
    checked_set = _load_checked_comment_ids(project_dir)
    if checked_set is not None:
        def _by_checked(c):
            cid = c.get("comment_id", "")
            return cid in checked_set
        comments = [c for c in comments if _by_checked(c)]
        expression_comments = [c for c in expression_comments if _by_checked(c)]
        ms_comments = [c for c in ms_comments if _by_checked(c)]
        la_comments = [c for c in la_comments if _by_checked(c)]
        ft_comments = [c for c in ft_comments if _by_checked(c)]
        ethics_comments = [c for c in ethics_comments if _by_checked(c)]

    # Prepare author-facing versions (filter dismissed, attach _author_text)
    major_auth = _prepare_author_comments(major, structure_re)
    minor_auth = _prepare_author_comments(minor, structure_re)
    expression_comments_auth = _prepare_author_comments(expression_comments, expression_re)
    ms_comments_auth = _prepare_author_comments(ms_comments, methods_stats_re)
    ms_major_auth = [c for c in ms_comments_auth if c.get("severity") == "major"]
    la_comments_auth = _prepare_author_comments(la_comments, logic_argument_re)
    la_major_auth = [c for c in la_comments_auth if c.get("severity") == "major"]
    ft_comments_auth = _prepare_author_comments(ft_comments, figure_table_re)
    ft_major_auth = [c for c in ft_comments_auth if c.get("severity") == "major"]
    ethics_comments_auth = _prepare_author_comments(ethics_comments, ethics_re)
    ethics_major_auth = [c for c in ethics_comments_auth if c.get("severity") == "major"]

    all_major = major + la_major_orig + ms_major + ft_major_orig + ethics_major_orig
    all_major_auth = major_auth + [c for c in ms_comments_auth if c.get("severity") == "major"] + [c for c in la_comments_auth if c.get("severity") == "major"] + [c for c in ft_comments_auth if c.get("severity") == "major"] + [c for c in ethics_comments_auth if c.get("severity") == "major"]

    # Load user's verdict from the 採否決定 panel (takes precedence over count-based)
    user_verdict = _load_user_verdict(project_dir)
    recommendation = _get_recommendation(len(all_major_auth), len(minor_auth), user_verdict)

    # Load Review_comments.md content (verdict reasoning, strengths, concerns)
    review_comments = _load_review_comments(project_dir, lang)

    # Load language-appropriate overall assessment
    overall_assessment = _load_overall_assessment(project_dir, lang)

    # Load PDF line number mappings (from get-line-numbers command)
    line_numbers = _load_line_numbers(project_dir)

    total = len(comments) + len(expression_comments) + len(ms_comments) + len(la_comments) + len(ft_comments) + len(ethics_comments)
    total_auth = len(major_auth) + len(minor_auth) + len(expression_comments_auth) + len(ms_comments_auth) + len(la_comments_auth) + len(ft_comments_auth) + len(ethics_comments_auth)

    final_review_md = _generate_final_review_md(
        merged, major_auth, minor_auth, expression_comments_auth,
        ms_comments_auth, ms_available, la_comments_auth, la_available,
        ft_comments_auth, ft_available,
        ethics_comments_auth, ethics_available,
        abstract, recommendation, project_dir, lang,
        structure_ec, expression_ec, methods_stats_ec, logic_argument_ec,
        figure_table_ec, ethics_ec,
        structure_re, expression_re, methods_stats_re, logic_argument_re,
        figure_table_re, ethics_re,
        overall_assessment=overall_assessment,
        review_comments=review_comments,
        line_numbers=line_numbers,
    )
    comments_to_authors_md = _generate_comments_to_authors_md(
        major_auth, minor_auth, expression_comments_auth, ms_comments_auth,
        la_comments_auth, ft_comments_auth, ethics_comments_auth,
        structure_ec, expression_ec, methods_stats_ec, logic_argument_ec,
        figure_table_ec, ethics_ec,
        structure_re, expression_re, methods_stats_re, logic_argument_re,
        figure_table_re, ethics_re,
    )
    confidential_md = _generate_confidential_comments_md(
        expression_available, ms_available, la_available, ft_available,
        ethics_available,
    )
    recommendation_md = _generate_recommendation_md(
        len(major_auth), len(minor_auth), total_auth,
        len(expression_comments_auth), expression_available,
        len(ms_comments_auth), len(ms_major_auth), ms_available,
        len(la_comments_auth), len(la_major_auth), la_available,
        len(ft_comments_auth), len(ft_major_auth), ft_available,
        len(ethics_comments_auth), len(ethics_major_auth), ethics_available,
        user_verdict=user_verdict,
    )
    # Count external check disagree verdicts
    ec_disagree_structure = sum(1 for v in (structure_ec or {}).values() if v.get("verdict") == "disagree")
    ec_disagree_expression = sum(1 for v in (expression_ec or {}).values() if v.get("verdict") == "disagree")
    ec_disagree_ms = sum(1 for v in (methods_stats_ec or {}).values() if v.get("verdict") == "disagree")
    ec_disagree_la = sum(1 for v in (logic_argument_ec or {}).values() if v.get("verdict") == "disagree")
    ec_disagree_ft = sum(1 for v in (figure_table_ec or {}).values() if v.get("verdict") == "disagree")
    ec_disagree_ethics = sum(1 for v in (ethics_ec or {}).values() if v.get("verdict") == "disagree")
    ec_disagree_total = ec_disagree_structure + ec_disagree_expression + ec_disagree_ms + ec_disagree_la + ec_disagree_ft + ec_disagree_ethics

    audit_trail = _build_audit_trail(
        merged, len(major_auth), len(minor_auth), recommendation,
        abstract is not None, expression_available, len(expression_comments_auth),
        ms_available, len(ms_comments_auth), len(ms_major_auth),
        la_available, len(la_comments_auth), len(la_major_auth),
        ft_available, len(ft_comments_auth), len(ft_major_auth),
        ethics_available, len(ethics_comments_auth), len(ethics_major_auth),
        ec_disagree_structure=ec_disagree_structure,
        ec_disagree_expression=ec_disagree_expression,
        ec_disagree_ms=ec_disagree_ms,
        ec_disagree_la=ec_disagree_la,
        ec_disagree_ft=ec_disagree_ft,
        ec_disagree_ethics=ec_disagree_ethics,
        ec_disagree_total=ec_disagree_total,
    )

    # Generate DOCX and TXT from the markdown content (conditional on output_format)
    final_review_docx = None
    final_review_txt = None
    if _want("docx"):
        final_review_docx = convert_md_to_docx(final_review_md, lang)
    if _want("txt"):
        final_review_txt = convert_md_to_txt(final_review_md, lang)

    return {
        "content": {
            "final_review_md": final_review_md,
            "final_review_docx": final_review_docx,
            "final_review_txt": final_review_txt,
            "comments_to_authors_md": comments_to_authors_md,
            "confidential_comments_md": confidential_md,
            "recommendation_md": recommendation_md,
            "audit_trail": audit_trail,
        },
        "total_comments": total_auth,
        "major_count": len(all_major_auth),
        "minor_count": len(minor_auth) + len(expression_comments_auth) + len([c for c in ms_comments_auth if c.get("severity") != "major"]) + len([c for c in la_comments_auth if c.get("severity") != "major"]) + len([c for c in ft_comments_auth if c.get("severity") != "major"]) + len([c for c in ethics_comments_auth if c.get("severity") != "major"]),
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


def _load_overall_assessment(project_dir, lang="en"):
    """Load outputs/final/overall_assessment.md if it exists.

    Returns the assessment text in the requested language, or None.
    """
    path = os.path.join(project_dir, "outputs", "final", "_data", "overall_assessment.md")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if lang == "en":
        # Extract English part: after "# General Impressions" to end
        marker = "# General Impressions"
        idx = content.find(marker)
        if idx >= 0:
            text = content[idx + len(marker):].strip()
            return text if text else None
        return None

    # Japanese: between "# 全体所感" and "---" / "# General Impressions"
    lines = content.strip().split("\n")
    assessment_lines = []
    in_assessment = False
    for line in lines:
        if line.startswith("# 全体所感"):
            in_assessment = True
            continue
        if in_assessment:
            if line.startswith("---") or line.startswith("# General Impressions"):
                break
            assessment_lines.append(line)
    text = "\n".join(assessment_lines).strip()
    return text if text else None


def _load_review_comments(project_dir, lang="en"):
    """Load Review_comments.md and extract sections in the requested language.

    Returns dict with verdict, reasoning, strengths, concerns, or None.
    """
    path = os.path.join(project_dir, "outputs", "final", "_data", "Review_comments.md")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    result = {}
    if lang == "en":
        # Extract English sections
        import re
        # Verdict
        m = re.search(r'## Verdict\s*\n\s*\*\*Verdict:\s*(.+?)\*\*', content)
        if m:
            result["verdict"] = m.group(1).strip()
        # Reasoning
        m = re.search(r'## Reasoning\s*\n(.+?)(?=\n## |\Z)', content, re.DOTALL)
        if m:
            result["reasoning"] = m.group(1).strip()
        # Key Strengths
        m = re.search(r'## Key Strengths\s*\n(.+?)(?=\n## Key Concerns|\Z)', content, re.DOTALL)
        if m:
            result["strengths"] = m.group(1).strip()
        # Key Concerns
        m = re.search(r'## Key Concerns\s*\n(.+?)(?=\n---|\Z)', content, re.DOTALL)
        if m:
            result["concerns"] = m.group(1).strip()
    else:
        # Japanese sections
        import re
        m = re.search(r'## 判定\s*\n\s*\*\*判定:\s*(.+?)\*\*', content)
        if m:
            result["verdict"] = m.group(1).strip()
        m = re.search(r'## 理由\s*\n(.+?)(?=\n## 主な強み|\Z)', content, re.DOTALL)
        if m:
            result["reasoning"] = m.group(1).strip()
        m = re.search(r'## 主な強み\s*\n(.+?)(?=\n## 主な懸念|\Z)', content, re.DOTALL)
        if m:
            result["strengths"] = m.group(1).strip()
        m = re.search(r'## 主な懸念\s*\n(.+?)(?=\n---|\Z)', content, re.DOTALL)
        if m:
            result["concerns"] = m.group(1).strip()

    return result if result else None


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


def _merged_methods_stats_exists(project_dir):
    """Check if outputs/methods_stats/merged.section.json exists."""
    path = os.path.join(
        project_dir, "outputs", "methods_stats", "merged.section.json"
    )
    return os.path.isfile(path)


def _load_merged_methods_stats(project_dir):
    """Load and return outputs/methods_stats/merged.section.json."""
    path = os.path.join(
        project_dir, "outputs", "methods_stats", "merged.section.json"
    )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _merged_logic_argument_exists(project_dir):
    """Check if outputs/logic_argument/merged.section.json exists."""
    path = os.path.join(
        project_dir, "outputs", "logic_argument", "merged.section.json"
    )
    return os.path.isfile(path)


def _load_merged_logic_argument(project_dir):
    """Load and return outputs/logic_argument/merged.section.json."""
    path = os.path.join(
        project_dir, "outputs", "logic_argument", "merged.section.json"
    )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _merged_figure_table_exists(project_dir):
    """Check if outputs/figure_table/merged.section.json exists."""
    path = os.path.join(
        project_dir, "outputs", "figure_table", "merged.section.json"
    )
    return os.path.isfile(path)


def _load_merged_figure_table(project_dir):
    """Load and return outputs/figure_table/merged.section.json."""
    path = os.path.join(
        project_dir, "outputs", "figure_table", "merged.section.json"
    )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _merged_ethics_exists(project_dir):
    """Check if outputs/ethics/merged.section.json exists."""
    path = os.path.join(
        project_dir, "outputs", "ethics", "merged.section.json"
    )
    return os.path.isfile(path)


def _load_merged_ethics(project_dir):
    """Load and return outputs/ethics/merged.section.json."""
    path = os.path.join(
        project_dir, "outputs", "ethics", "merged.section.json"
    )
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def _load_user_verdict(project_dir):
    """Load user's selected verdict from confidence_distribution.json.

    Returns:
        dict with level_en, level_ja or None if no user verdict found.
    """
    path = os.path.join(project_dir, "outputs", "final", "_data", "confidence_distribution.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        selected = data.get("selectedVerdict")
        if not selected:
            return None
        verdict_map = {
            "Ready for Submission": {"level_en": "Ready for Submission", "level_ja": "投稿可能"},
            "Ready with Minor Changes": {"level_en": "Ready with Minor Changes", "level_ja": "軽微な修正で投稿可能"},
            "Needs Revision Before Submission": {"level_en": "Needs Revision Before Submission", "level_ja": "投稿前に修正が必要"},
            "Major Rework Recommended": {"level_en": "Major Rework Recommended", "level_ja": "大幅な改訂を推奨"},
        }
        return verdict_map.get(selected)
    except (json.JSONDecodeError, KeyError):
        return None


def _get_recommendation(major_count, minor_count, user_verdict=None):
    """Return recommendation dict based on severity counts.

    If user_verdict is provided (from the 採否決定 panel), it takes precedence
    over the count-based heuristic. The rationale still includes the counts.

    Args:
        major_count: Number of major issues.
        minor_count: Number of minor issues.
        user_verdict: Optional dict with level_en/level_ja from user selection.

    Returns:
        dict with keys:
            - level_en: "Accept" | "Minor Revision" | "Major Revision" | "Reject"
            - level_ja: "アクセプト" | "軽微修正" | "大幅修正" | "リジェクト"
            - rationale: brief explanation string
            - source: "user" if user_verdict was used, "auto" if count-based
    """
    # Build count-based rationale regardless
    if major_count == 0 and minor_count == 0:
        auto = {
            "level_en": "Accept",
            "level_ja": "アクセプト",
            "rationale": "No significant issues identified across all review dimensions.",
        }
    elif major_count == 0:
        auto = {
            "level_en": "Minor Revision",
            "level_ja": "軽微修正",
            "rationale": (
                f"{minor_count} minor issue(s) identified. "
                "The manuscript requires minor revisions before publication."
            ),
        }
    elif major_count <= 5:
        auto = {
            "level_en": "Major Revision",
            "level_ja": "大幅修正",
            "rationale": (
                f"{major_count} major and {minor_count} minor issue(s) identified. "
                "Substantial revisions are required across multiple dimensions."
            ),
        }
    else:
        auto = {
            "level_en": "Reject",
            "level_ja": "リジェクト",
            "rationale": (
                f"{major_count} major and {minor_count} minor issue(s) identified. "
                "The number and severity of issues suggest the manuscript "
                "is not suitable for publication in its current form."
            ),
        }

    if user_verdict:
        # Use user's verdict but keep the count info in the rationale
        count_info = (
            f"{major_count} major and {minor_count} minor issue(s) identified. "
        )
        return {
            "level_en": user_verdict["level_en"],
            "level_ja": user_verdict["level_ja"],
            "rationale": count_info + (
                f"Verdict selected by reviewer (auto-suggestion was {auto['level_en']})."
            ),
            "source": "user",
        }

    auto["source"] = "auto"
    return auto


def _load_line_numbers(project_dir):
    """Load line number mappings from lines/paragraph_line_map.json.

    Returns:
        dict with keys "by_comment" ({comment_id: line_number}) and
        "by_paragraph" ({paragraph_number: line_number}), or None.
    """
    path = os.path.join(project_dir, "lines", "paragraph_line_map.json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError):
        return None
    return {
        "by_comment": data.get("comment_line_map", {}),
        "by_paragraph": {int(k): v for k, v in data.get("mapping", {}).items()},
    }


def _load_comments_to_authors_jp(project_dir):
    """Load Japanese translations from translated comments_to_authors.md.

    Expects the bilingual format produced by translate-result-content:
        # 著者へのコメント
        ### 1. ...
        (Japanese text)
        ---
        # Comments to Authors
        ### 1. ...
        (English text)

    Parses both sections in parallel (same item order) and builds a
    mapping from English body text (stripped) to Japanese body text.

    Returns:
        dict mapping English text (str) -> Japanese text (str),
        or None if the file doesn't exist or has no Japanese section.
    """
    import re
    path = os.path.join(project_dir, "outputs", "final", "_data",
                        "comments_to_authors.md")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
    except IOError:
        return None

    # Split JA and EN sections
    sep_match = re.search(r"\n\n---\n\n", content)
    if not sep_match:
        return None  # Not bilingual yet

    ja_part = content[:sep_match.start()].strip()
    en_part = content[sep_match.end():].strip()

    # Check Japanese section exists (may start with either header)
    if not (ja_part.startswith("# 著者へのコメント") or
            ja_part.startswith("# 査読コメント") or
            ja_part.startswith("# 修正提案")):
        return None

    def _parse_items(text):
        """Parse ### N. heading + body items from a section."""
        items = []
        heading_pattern = re.compile(r"^###\s+\d+\.\s+.+$", re.MULTILINE)
        matches = list(heading_pattern.finditer(text))
        for idx, m in enumerate(matches):
            start = m.end()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(text)
            body = text[start:end].strip()
            # Remove trailing separator
            body = re.sub(r"\n*---\s*$", "", body)
            if body:
                items.append(body)
        return items

    ja_items = _parse_items(ja_part)
    en_items = _parse_items(en_part)

    if not ja_items or not en_items:
        return None

    # Build mapping: English text -> Japanese text (paired by position)
    result = {}
    for en_text, jp_text in zip(en_items, ja_items):
        en_stripped = en_text.strip()
        if en_stripped:
            result[en_stripped] = jp_text.strip()

    return result if result else None


def _format_location(location, line_number=None):
    """Format a location dict as a display string.

    {'section': 'Introduction', 'paragraph_start': 3, 'paragraph_end': 5}
    -> 'Introduction, Paragraphs 3-5, Line 42'
    """
    if not location:
        return "Unknown location"
    section = location.get("section", "Unknown")
    p_start = location.get("paragraph_start")
    p_end = location.get("paragraph_end")

    parts = []
    if p_start is not None and p_end is not None:
        if p_start == p_end:
            parts.append(f"{section}, Paragraph {p_start}")
        else:
            parts.append(f"{section}, Paragraphs {p_start}-{p_end}")
    elif p_start is not None:
        parts.append(f"{section}, Paragraph {p_start}")
    else:
        parts.append(section)

    if line_number is not None:
        parts.append(f"Line {line_number}")

    return ", ".join(parts) if len(parts) > 1 else parts[0]


def _ext_annotation_lines(comment_id, external_check, reevaluation):
    """Build annotation lines for external evaluation and re-evaluation."""
    lines = []
    if external_check:
        v = external_check.get(comment_id)
        if v:
            verdict_ja = {"agree": "同意", "disagree": "否認", "partial": "一部同意"}.get(
                v.get("verdict", ""), v.get("verdict", ""))
            lines.append("")
            lines.append(f"> **外部評価**: {verdict_ja}")
            lines.append(f"> {v.get('reasoning', '')}")
    if reevaluation:
        v = reevaluation.get(comment_id)
        if v:
            verdict_ja = {"tool_correct": "ツールの指摘を支持",
                          "external_correct": "外部評価の意見を支持",
                          "partial": "一部支持"}.get(
                v.get("verdict", ""), v.get("verdict", ""))
            lines.append("")
            lines.append(f"> **再評価（評価AI 1）**: {verdict_ja}")
            lines.append(f"> {v.get('reasoning', '')}")
    return lines


def _get_author_facing_comment(comment, reevaluation):
    """Get the author-facing comment text for a single comment.

    Prefers the re-evaluation's author_comment if available.
    Returns None if the comment was dismissed (verdict: external_correct
    with no author_comment), meaning it should be omitted from author output.
    """
    if reevaluation:
        cid = comment.get("comment_id", "")
        rv = reevaluation.get(cid)
        if rv:
            # If external_correct, the criticism was dismissed
            if rv.get("verdict") == "external_correct":
                return None
            # If author_comment is available, use it
            if rv.get("author_comment"):
                return rv["author_comment"]
    # Fall back to the tool's original issue text
    return comment.get("issue", "")


def _append_comment_list(lines, comments, section_num, start_num=1,
                        line_numbers=None, lang="en", jp_texts=None):
    """Append formatted comment items to lines list.

    Args:
        jp_texts: Optional dict mapping English _author_text -> Japanese text.
                  When provided and lang=="ja", the Japanese text replaces
                  the English _author_text for the **指摘** line.
    """
    for i, c in enumerate(comments, start_num):
        # Look up line number: comment_id first, then paragraph_start fallback
        line_num = None
        if line_numbers:
            cid = c.get("comment_id", "")
            line_num = line_numbers.get("by_comment", {}).get(cid)
            if line_num is None:
                p_start = c.get("location", {}).get("paragraph_start")
                if p_start is not None:
                    line_num = line_numbers.get("by_paragraph", {}).get(p_start)

        loc = _format_location(c.get("location"), line_num)
        lines.append(f"### {section_num}.{i}. {loc}")
        lines.append("")

        # Excerpt (quoted text from the paper)
        excerpt = (c.get("location") or {}).get("text_excerpt", "")
        if excerpt:
            lines.append(f'"{excerpt}"')
            lines.append("")

        sev = c.get("severity", "")
        if sev == "major":
            lines.append(f"**Recommendation**: {_t('recommendation_major', lang)}")
        elif sev == "minor":
            lines.append(f"**Recommendation**: {_t('recommendation_minor', lang)}")
        if sev:
            lines.append("")

        author_text = c.get('_author_text', '')
        # Use Japanese translation if available
        if lang == "ja" and jp_texts:
            jp = jp_texts.get(author_text.strip())
            if jp:
                author_text = jp
        lines.append(f"**{_t('issue', lang)}**: {author_text}")
        lines.append("")


def _generate_final_review_md(merged, major, minor, expression_comments,
                              ms_comments, ms_available,
                              la_comments, la_available,
                              ft_comments, ft_available,
                              ethics_comments, ethics_available,
                              abstract, recommendation,
                              project_dir, lang="en",
                              structure_ec=None, expression_ec=None,
                              methods_stats_ec=None, logic_argument_ec=None,
                              figure_table_ec=None, ethics_ec=None,
                              structure_re=None, expression_re=None,
                              methods_stats_re=None, logic_argument_re=None,
                              figure_table_re=None, ethics_re=None,
                              overall_assessment=None,
                              review_comments=None,
                              line_numbers=None):
    """Generate the complete final_review.md."""
    lines = []

    # Load Japanese translations for author-facing comments (lang="ja" only)
    jp_texts = _load_comments_to_authors_jp(project_dir) if lang == "ja" else None

    # Section 1: General Assessment
    heading = _t("general_assessment", lang)
    lines.append(f"## 1. {heading}")
    lines.append("")

    # Load verdict check states from comment_card_checked.json
    verdict_checks = _load_verdict_checks(project_dir)

    # Verdict section (from 採否決定/Review_comments.md) — comes first
    if review_comments:
        verdict_text = review_comments.get("verdict", "")
        reasoning_text = review_comments.get("reasoning", "")
        strengths_text = review_comments.get("strengths", "")
        concerns_text = review_comments.get("concerns", "")

        show_verdict = verdict_checks.get("verdict", True) and bool(verdict_text)
        show_reasoning = verdict_checks.get("reasoning", True) and bool(reasoning_text)
        show_strengths = verdict_checks.get("strengths", True) and bool(strengths_text)
        show_concerns = verdict_checks.get("concerns", True) and bool(concerns_text)

        if show_verdict or show_reasoning or show_strengths or show_concerns:
            lines.append(f"## {_t('verdict', lang)}")
            lines.append("")
            if show_verdict:
                lines.append(f"**{_t('verdict_label', lang)}**: {verdict_text}")
                lines.append("")
            if show_reasoning:
                lines.append(reasoning_text)
                lines.append("")

            if show_strengths:
                lines.append(f"### {_t('key_strengths', lang)}")
                lines.append("")
                lines.append(strengths_text)
                lines.append("")

            if show_concerns:
                lines.append(f"### {_t('key_concerns', lang)}")
                lines.append("")
                lines.append(concerns_text)
                lines.append("")

    # General assessment text
    if overall_assessment:
        lines.append(f"## {_t('general_impressions', lang)}")
        lines.append("")
        lines.append(overall_assessment)
    else:
        lines.append(merged.get("summary", "No assessment available."))
    lines.append("")

    # Section 2: Structure
    lines.append(f"## 2. {_t('structure', lang)}")
    lines.append("")
    _append_comment_list(lines, major, 2, start_num=1,
                        line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
    _append_comment_list(lines, minor, 2, start_num=len(major) + 1,
                        line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
    if not major and not minor:
        lines.append(_t("no_structural", lang))
        lines.append("")

    # Section 3: Expression
    lines.append(f"## 3. {_t('expression', lang)}")
    lines.append("")
    if expression_comments:
        _append_comment_list(lines, expression_comments, 3,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
    else:
        lines.append(_t("not_assessed_expression", lang))
        lines.append("")

    # Section 4: Methods and Statistics
    lines.append(f"## 4. {_t('methods_stats', lang)}")
    lines.append("")
    if ms_available and ms_comments:
        ms_major = [c for c in ms_comments if c.get("severity") == "major"]
        ms_minor = [c for c in ms_comments if c.get("severity") != "major"]
        _append_comment_list(lines, ms_major, 4, start_num=1,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
        _append_comment_list(lines, ms_minor, 4, start_num=len(ms_major) + 1,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
        if not ms_major and not ms_minor:
            lines.append(_t("no_ms", lang))
            lines.append("")
    elif ms_available and not ms_comments:
        lines.append(_t("no_ms", lang))
        lines.append("")
    else:
        lines.append(_t("not_assessed_ms", lang))
        lines.append("")

    # Section 5: Logic and Argument
    lines.append(f"## 5. {_t('logic_argument', lang)}")
    lines.append("")
    if la_available and la_comments:
        la_major = [c for c in la_comments if c.get("severity") == "major"]
        la_minor = [c for c in la_comments if c.get("severity") != "major"]
        _append_comment_list(lines, la_major, 5, start_num=1,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
        _append_comment_list(lines, la_minor, 5, start_num=len(la_major) + 1,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
        if not la_major and not la_minor:
            lines.append(_t("no_la", lang))
            lines.append("")
    elif la_available and not la_comments:
        lines.append(_t("no_la", lang))
        lines.append("")
    else:
        lines.append(_t("not_assessed_la", lang))
        lines.append("")

    # Section 6: Figures and Tables
    lines.append(f"## 6. {_t('figure_table', lang)}")
    lines.append("")
    if ft_available and ft_comments:
        ft_major = [c for c in ft_comments if c.get("severity") == "major"]
        ft_minor = [c for c in ft_comments if c.get("severity") != "major"]
        _append_comment_list(lines, ft_major, 6, start_num=1,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
        _append_comment_list(lines, ft_minor, 6, start_num=len(ft_major) + 1,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
        if not ft_major and not ft_minor:
            lines.append(_t("no_ft", lang))
            lines.append("")
    elif ft_available and not ft_comments:
        lines.append(_t("no_ft", lang))
        lines.append("")
    else:
        lines.append(_t("not_assessed_ft", lang))
        lines.append("")

    # Section 7: Ethics and Conflict of Interest
    lines.append(f"## 7. {_t('ethics', lang)}")
    lines.append("")
    if ethics_available and ethics_comments:
        ethics_major = [c for c in ethics_comments if c.get("severity") == "major"]
        ethics_minor = [c for c in ethics_comments if c.get("severity") != "major"]
        _append_comment_list(lines, ethics_major, 7, start_num=1,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
        _append_comment_list(lines, ethics_minor, 7, start_num=len(ethics_major) + 1,
                            line_numbers=line_numbers, lang=lang, jp_texts=jp_texts)
        if not ethics_major and not ethics_minor:
            lines.append(_t("no_ethics", lang))
            lines.append("")
    elif ethics_available and not ethics_comments:
        lines.append(_t("no_ethics", lang))
        lines.append("")
    else:
        lines.append(_t("not_assessed_ethics", lang))
        lines.append("")

    return "\n".join(lines)


def _generate_comments_to_authors_md(major, minor, expression_comments,
                                     ms_comments=None, la_comments=None,
                                     ft_comments=None, ethics_comments=None,
                                     structure_ec=None, expression_ec=None,
                                     methods_stats_ec=None, logic_argument_ec=None,
                                     figure_table_ec=None, ethics_ec=None,
                                     structure_re=None, expression_re=None,
                                     methods_stats_re=None, logic_argument_re=None,
                                     figure_table_re=None, ethics_re=None):
    """Generate comments_to_authors.md — author-facing only, no internal annotations."""
    lines = ["# Fix Suggestions", ""]

    all_comments = (list(major) + list(minor) + list(expression_comments)
                    + list(ms_comments or []) + list(la_comments or [])
                    + list(ft_comments or []) + list(ethics_comments or []))

    # Determine which reevaluation data to use based on comment_id prefix
    def _pick_re(comment_id):
        if comment_id.startswith("structure_"):
            return structure_re
        elif comment_id.startswith("expression_"):
            return expression_re
        elif comment_id.startswith("methods_stats_"):
            return methods_stats_re
        elif comment_id.startswith("logic_argument_"):
            return logic_argument_re
        elif comment_id.startswith("figure_table_"):
            return figure_table_re
        elif comment_id.startswith("ethics_"):
            return ethics_re
        return None

    idx = 0
    for c in all_comments:
        cid = c.get("comment_id", "")
        re_ = _pick_re(cid)
        author_text = _get_author_facing_comment(c, re_)
        # Skip comments dismissed by re-evaluation (external_correct with no author_comment)
        if author_text is None:
            continue
        idx += 1
        loc = _format_location(c.get("location"))
        category = c.get("category", "Structure")
        lines.append(f"### {idx}. {category} / {loc}")
        lines.append("")
        lines.append(author_text)
        lines.append("")

    if idx == 0:
        lines.append(
            "No comments were generated. "
            "Please see the full review for context."
        )

    return "\n".join(lines)


def _generate_confidential_comments_md(expression_available=False,
                                       ms_available=False,
                                       la_available=False,
                                       ft_available=False,
                                       ethics_available=False):
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
    ]
    if expression_available:
        scope_lines.append("- Expression quality and language")
    else:
        not_assessed.append("- Expression quality and language")
    if ms_available:
        scope_lines.append("- Methods and statistical methodology")
    else:
        not_assessed.append("- Methods and statistical methodology")
    if la_available:
        scope_lines.append("- Logic and argument quality")
    else:
        not_assessed.append("- Logic and argument quality")
    if ft_available:
        scope_lines.append("- Figure and table quality")
    else:
        not_assessed.append("- Figure and table quality")
    if ethics_available:
        scope_lines.append("- Ethics and conflict of interest")
    else:
        not_assessed.append("- Ethics and conflict of interest")

    return "\n".join([
        "# Submission Readiness Summary",
        "",
        "This report was generated using automated analysis via "
        "the Academic Paper Checker. The assessment was performed by "
        "independent LLM checkers.",
        "",
    ] + scope_lines + [
        "",
        "**Not assessed in this run:**",
    ] + not_assessed + [
        "",
        "The author should review all findings and make their own "
        "judgment about revisions before submission.",
        "",
        "**Checker confidence**: Overall confidence varies by finding; see "
        "individual items in the main report for per-item confidence "
        "levels.",
        "",
    ])


def _generate_recommendation_md(major_count, minor_count, total_count,
                                expression_count=0, expression_available=False,
                                ms_count=0, ms_major_count=0,
                                ms_available=False,
                                la_count=0, la_major_count=0,
                                la_available=False,
                                ft_count=0, ft_major_count=0,
                                ft_available=False,
                                ethics_count=0, ethics_major_count=0,
                                ethics_available=False,
                                user_verdict=None):
    """Generate recommendation.md with verdict and justification."""
    rec = _get_recommendation(major_count + ms_major_count + la_major_count + ft_major_count + ethics_major_count,
                              minor_count, user_verdict)

    checks = ["structure"]
    if expression_available:
        checks.append("expression")
    if ms_available:
        checks.append("methods_stats")
    if la_available:
        checks.append("logic_argument")
    if ft_available:
        checks.append("figure_table")
    if ethics_available:
        checks.append("ethics")

    lines = [
        "# Submission Readiness Assessment",
        "",
        f"**評価 / Assessment**: {rec['level_ja']} ({rec['level_en']})",
        "",
        f"**根拠 / Basis**: {rec['rationale']}",
        "",
        f"This assessment is based on {total_count} "
        f"finding(s) from {', '.join(checks)} check(s):",
        f"- {major_count} major issue(s) (structure)",
        f"- {minor_count} minor issue(s) (structure)",
    ]
    if expression_available:
        lines.append(f"- {expression_count} minor issue(s) (expression)")
    if ms_available:
        lines.append(f"- {ms_count} issue(s) (methods/stats: "
                     f"{ms_major_count} major)")
    if la_available:
        lines.append(f"- {la_count} issue(s) (logic/argument: "
                     f"{la_major_count} major)")
    if ft_available:
        lines.append(f"- {ft_count} issue(s) (figures/tables: "
                     f"{ft_major_count} major)")
    if ethics_available:
        lines.append(f"- {ethics_count} issue(s) (ethics/COI: "
                     f"{ethics_major_count} major)")
    lines += [
        "",
        "**Note**: This is a preliminary automated assessment. "
        "The author should review all findings and exercise their own judgment.",
        "",
    ]

    if total_count == 0:
        lines.append(
            "No issues were identified. A complete assessment "
            "requires running the full set of check items (expression, "
            "methods, citations, originality)."
        )
        lines.append("")

    return "\n".join(lines)


def _build_audit_trail(merged, major_count, minor_count, recommendation,
                       abstract_available, expression_available=False,
                       expression_comment_count=0,
                       ms_available=False, ms_comment_count=0,
                       ms_major_count=0,
                       la_available=False, la_comment_count=0,
                       la_major_count=0,
                       ft_available=False, ft_comment_count=0,
                       ft_major_count=0,
                       ethics_available=False, ethics_comment_count=0,
                       ethics_major_count=0,
                       ec_disagree_structure=0,
                       ec_disagree_expression=0,
                       ec_disagree_ms=0,
                       ec_disagree_la=0,
                       ec_disagree_ft=0,
                       ec_disagree_ethics=0,
                       ec_disagree_total=0):
    """Build the audit_trail.json data structure."""
    from datetime import datetime, timezone, timedelta

    JST = timezone(timedelta(hours=9))
    now = datetime.now(JST)

    assessed = ["structure"]
    not_assessed = ["citation", "originality"]
    inputs = {
        "merged_structure": "outputs/structure/merged.section.json",
        "abstract_available": abstract_available,
    }
    if expression_available:
        assessed.append("expression")
        inputs["merged_expression"] = "outputs/expression/merged.section.json"
    else:
        not_assessed.append("expression")
    if ms_available:
        assessed.append("methods_stats")
        inputs["merged_methods_stats"] = "outputs/methods_stats/merged.section.json"
    else:
        not_assessed.append("methods_stats")
    if la_available:
        assessed.append("logic_argument")
        inputs["merged_logic_argument"] = "outputs/logic_argument/merged.section.json"
    else:
        not_assessed.append("logic_argument")
    if ft_available:
        assessed.append("figure_table")
        inputs["merged_figure_table"] = "outputs/figure_table/merged.section.json"
    else:
        not_assessed.append("figure_table")
    if ethics_available:
        assessed.append("ethics")
        inputs["merged_ethics"] = "outputs/ethics/merged.section.json"
    else:
        not_assessed.append("ethics")

    total = len(merged.get("comments", [])) + expression_comment_count + ms_comment_count + la_comment_count + ft_comment_count + ethics_comment_count
    comment_counts = {
        "total": total,
        "major": major_count,
        "minor": minor_count,
    }
    if expression_available:
        comment_counts["structure_minor"] = minor_count
        comment_counts["expression_minor"] = expression_comment_count
    if ms_available:
        comment_counts["structure_minor"] = minor_count
        comment_counts["expression_minor"] = expression_comment_count
        comment_counts["ms_count"] = ms_comment_count
        comment_counts["ms_major"] = ms_major_count
        comment_counts["ms_minor"] = ms_comment_count - ms_major_count
    if la_available:
        comment_counts["la_count"] = la_comment_count
        comment_counts["la_major"] = la_major_count
        comment_counts["la_minor"] = la_comment_count - la_major_count
    if ft_available:
        comment_counts["ft_count"] = ft_comment_count
        comment_counts["ft_major"] = ft_major_count
        comment_counts["ft_minor"] = ft_comment_count - ft_major_count
    if ethics_available:
        comment_counts["ethics_count"] = ethics_comment_count
        comment_counts["ethics_major"] = ethics_major_count
        comment_counts["ethics_minor"] = ethics_comment_count - ethics_major_count

    if expression_available and ms_available and la_available and ft_available:
        phase = "9E"
        description = (
            "Final review generation with structure, expression, "
            "methods_stats, logic_argument, and figure_table checks"
        )
    elif expression_available and ms_available and la_available:
        phase = "9D"
        description = (
            "Final review generation with structure, expression, "
            "methods_stats, and logic_argument checks"
        )
    elif expression_available and ms_available:
        phase = "9C"
        description = (
            "Final review generation with structure, expression, "
            "and methods_stats checks"
        )
    elif expression_available:
        phase = "9B"
        description = (
            "Final review generation with structure and expression checks"
        )
    elif ms_available:
        phase = "9C"
        description = (
            "Final review generation with structure and methods_stats checks"
        )
    else:
        phase = "9A"
        description = "Structure-only final review generation"

    return {
        "generated_at": now.isoformat(),
        "phase": phase,
        "description": description,
        "inputs": inputs,
        "check_items_assessed": assessed,
        "check_items_not_assessed": not_assessed,
        "comment_counts": comment_counts,
        "external_check": {
            "disagree_excluded_total": ec_disagree_total,
            "disagree_structure": ec_disagree_structure,
            "disagree_expression": ec_disagree_expression,
            "disagree_methods_stats": ec_disagree_ms,
            "disagree_logic_argument": ec_disagree_la,
        } if ec_disagree_total > 0 else None,
        "recommendation": recommendation,
        "output_files": [
            "outputs/final/final_review.md",
            "outputs/final/_data/comments_to_authors.md",
            "outputs/final/_data/confidential_comments_to_editor.md",
            "outputs/final/_data/recommendation.md",
            "outputs/final/_data/audit_trail.json",
        ],
    }
