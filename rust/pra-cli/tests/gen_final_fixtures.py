"""Generate final_merge test fixtures from Python output/final.py.

Creates per-scenario fixture directories under final_merge_fixtures/ with
all input files and expected output files.  Idempotent — re-running
produces identical output.
"""
import json
import os
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(HERE)))
sys.path.insert(0, os.path.join(PROJ_ROOT, "python"))

from peer_review_assistant.output.final import final_merge

FIXTURES_DIR = os.path.join(HERE, "final_merge_fixtures")

# ── Shared helpers ───────────────────────────────────────────────────────

CHECKS = ["structure", "expression", "methods_stats",
          "logic_argument", "figure_table", "ethics"]

def _make_comment(cid, severity, section,
                  issue="Issue text",
                  author_comment="Suggested author comment",
                  category="Structure",
                  excerpt=None,
                  conflict=False,
                  reviewer_note=None):
    """Build a single MergedComment dict (subset used by final_merge)."""
    c = {
        "comment_id": cid,
        "severity": severity,
        "category": category,
        "location": {
            "section": section,
            "paragraph_start": 1,
            "paragraph_end": 2,
        },
        "issue": issue,
        "suggested_author_comment": author_comment,
        "evidence": "Reviewer A flagged this issue.",
        "confidence": "high",
        "conflict": conflict,
        "source_findings": [f"{cid}_src1"],
    }
    if excerpt:
        c["location"]["text_excerpt"] = excerpt
    if reviewer_note:
        c["reviewer_note"] = reviewer_note
    return c


def _make_merged(check_name, comments):
    """Build a merged.section.json dict."""
    return {
        "check_name": check_name,
        "status": "success",
        "generated_at": None,
        "sources": [
            {"source": "gpt-4o", "status": "done",
             "model": "gpt-4o", "finding_count": len(comments)}
        ],
        "summary": f"{check_name} check completed.",
        "comments": comments,
        "conflicts": [c for c in comments if c.get("conflict")],
    }


def write_json(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)


def write_text(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)


def build(proj_dir, check_files=None, extra_files=None, lang="en"):
    """Set up project_dir with input files, run final_merge, return results.

    check_files: dict check_name -> merged_output dict
    extra_files: dict path_relative_to_proj -> str content (optional)
    """
    outputs = os.path.join(proj_dir, "outputs")
    os.makedirs(outputs, exist_ok=True)

    if check_files:
        for ck, merged in check_files.items():
            ck_dir = os.path.join(outputs, ck)
            os.makedirs(ck_dir, exist_ok=True)
            with open(os.path.join(ck_dir, "merged.section.json"),
                      "w", encoding="utf-8") as f:
                json.dump(merged, f, indent=2, ensure_ascii=False)

    if extra_files:
        for rel, content in extra_files.items():
            path = os.path.join(proj_dir, rel)
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)

    result = final_merge(proj_dir, lang=lang, output_format=["md", "txt", "docx"])
    return result


# ── Scenario builders ────────────────────────────────────────────────────

def scenario_structure_only(proj_dir):
    """Only structure check available; no other checks."""
    comments = [
        _make_comment("structure_001", "major", "Introduction",
                      issue="The research question is missing from the introduction.",
                      author_comment="Add a clear research question at the end of the introduction.",
                      excerpt="Previous studies have shown..."),
        _make_comment("structure_002", "minor", "Methods",
                      issue="Sample size justification is unclear.",
                      author_comment="Provide a power analysis or cite a reference for sample size.",
                      excerpt="We recruited 30 participants."),
        _make_comment("structure_003", "minor", "Results",
                      issue="Table 2 lacks a descriptive caption.",
                      author_comment="Add a descriptive caption for Table 2."),
    ]
    return build(proj_dir, check_files={"structure": _make_merged("structure", comments)})


def scenario_structure_only_ja(proj_dir):
    """Structure only, Japanese output."""
    comments = [
        _make_comment("structure_001", "major", "Introduction",
                      issue="研究課題が導入部に明記されていません。",
                      author_comment="導入部の最後に明確な研究課題を追加してください。",
                      excerpt="先行研究では..."),
        _make_comment("structure_002", "minor", "Methods",
                      issue="サンプルサイズの正当性が不明確です。",
                      author_comment="検出力分析を行うか、サンプルサイズの参考文献を引用してください。"),
    ]
    return build(proj_dir, check_files={"structure": _make_merged("structure", comments)}, lang="ja")


def scenario_all_checks(proj_dir):
    """All 6 checks available with mixed severities."""
    struct = [
        _make_comment("structure_001", "major", "Introduction",
                      issue="Missing research gap statement.",
                      author_comment="Add research gap statement.",
                      excerpt="Many researchers have studied..."),
        _make_comment("structure_002", "minor", "Discussion",
                      issue="Discussion could be more concise.",
                      author_comment="Tighten discussion section."),
    ]
    expr = [
        _make_comment("expression_001", "minor", "Abstract",
                      issue="Awkward phrasing in abstract.",
                      author_comment="Revise for clarity."),
    ]
    ms_ = [
        _make_comment("methods_stats_001", "major", "Methods",
                      issue="Statistical test choice is inappropriate.",
                      author_comment="Use a non-parametric alternative.",
                      excerpt="We used a t-test to compare groups."),
    ]
    la = [
        _make_comment("logic_argument_001", "minor", "Results",
                      issue="Conclusion does not follow from results.",
                      author_comment="Soften the claim or add supporting evidence."),
    ]
    ft = [
        _make_comment("figure_table_001", "minor", "Results",
                      issue="Figure 3 resolution is too low.",
                      author_comment="Provide a higher resolution version."),
    ]
    ethics = [
        _make_comment("ethics_001", "major", "Methods",
                      issue="IRB approval number is missing.",
                      author_comment="Add the IRB approval number."),
    ]
    files = {
        "structure": _make_merged("structure", struct),
        "expression": _make_merged("expression", expr),
        "methods_stats": _make_merged("methods_stats", ms_),
        "logic_argument": _make_merged("logic_argument", la),
        "figure_table": _make_merged("figure_table", ft),
        "ethics": _make_merged("ethics", ethics),
    }
    return build(proj_dir, check_files=files)


def scenario_all_checks_ja(proj_dir):
    """All 6 checks, Japanese output."""
    struct = [
        _make_comment("structure_001", "major", "Introduction",
                      issue="研究のギャップが明示されていません。",
                      author_comment="研究ギャップの記述を追加してください。"),
        _make_comment("structure_002", "minor", "Discussion",
                      issue="考察が冗長です。",
                      author_comment="考察セクションを簡潔にしてください。"),
    ]
    expr = [
        _make_comment("expression_001", "minor", "Abstract",
                      issue="要旨の表現が不自然です。",
                      author_comment="明確さのために修正してください。"),
    ]
    ms_ = [
        _make_comment("methods_stats_001", "major", "Methods",
                      issue="統計検定の選択が不適切です。",
                      author_comment="ノンパラメトリック検定を使用してください。"),
    ]
    la = [
        _make_comment("logic_argument_001", "minor", "Results",
                      issue="結論が結果から導かれていません。",
                      author_comment="主張を和らげるか、補足証拠を追加してください。"),
    ]
    ft = [
        _make_comment("figure_table_001", "minor", "Results",
                      issue="図3の解像度が低すぎます。",
                      author_comment="高解像度版を提供してください。"),
    ]
    ethics = [
        _make_comment("ethics_001", "major", "Methods",
                      issue="IRB承認番号が記載されていません。",
                      author_comment="IRB承認番号を追加してください。"),
    ]
    files = {
        "structure": _make_merged("structure", struct),
        "expression": _make_merged("expression", expr),
        "methods_stats": _make_merged("methods_stats", ms_),
        "logic_argument": _make_merged("logic_argument", la),
        "figure_table": _make_merged("figure_table", ft),
        "ethics": _make_merged("ethics", ethics),
    }
    return build(proj_dir, check_files=files, lang="ja")


def scenario_no_comments(proj_dir):
    """All checks exist but have empty comment lists."""
    return build(proj_dir, check_files={
        ck: _make_merged(ck, []) for ck in CHECKS
    })


def scenario_with_conflicts(proj_dir):
    """Comments with severity conflicts."""
    comments = [
        _make_comment("structure_001", "major", "Methods",
                      issue="Statistical approach is questionable.",
                      author_comment="Justify the statistical method choice.",
                      conflict=True,
                      reviewer_note="SEVERITY CONFLICT: gpt-4o rated major, "
                                    "claude-opus rated minor."),
        _make_comment("structure_002", "minor", "Introduction",
                      issue="Minor typo in abstract.",
                      author_comment="Fix the typo."),
    ]
    return build(proj_dir, check_files={"structure": _make_merged("structure", comments)})


def scenario_with_external_eval(proj_dir):
    """External evaluation and re-evaluation data present."""
    comments = [
        _make_comment("structure_001", "major", "Introduction",
                      issue="The research gap is missing.",
                      author_comment="Add a research gap statement."),
        _make_comment("structure_002", "minor", "Methods",
                      issue="Sample description is incomplete.",
                      author_comment="Add full sample demographics."),
    ]
    # External check (advisory disagree votes)
    ec = {
        "verdicts": [
            {"comment_id": "structure_001", "verdict": "agree",
             "reasoning": "The research gap is indeed missing."},
            {"comment_id": "structure_002", "verdict": "partial",
             "reasoning": "Sample demographics are partially described."},
        ]
    }
    # Re-evaluation (adjudication by reviewer1)
    reeval = {
        "verdicts": [
            {"comment_id": "structure_001", "verdict": "tool_correct",
             "reasoning": "Agreed — the gap statement is needed.",
             "author_comment": "Please explicitly state what gap this study addresses in the introduction."},
            {"comment_id": "structure_002", "verdict": "external_correct",
             "reasoning": "The sample IS sufficiently described.",
             "author_comment": ""},  # empty → dismissed
        ]
    }
    check_files = {"structure": _make_merged("structure", comments)}
    write_json(os.path.join(proj_dir, "outputs", "structure", "external_check.json"), ec)
    write_json(os.path.join(proj_dir, "outputs", "structure", "reevaluation.json"), reeval)
    return build(proj_dir, check_files=check_files)


# ── Main ─────────────────────────────────────────────────────────────────

SCENARIOS = {
    "structure_only":           scenario_structure_only,
    "structure_only_ja":        scenario_structure_only_ja,
    "all_checks":               scenario_all_checks,
    "all_checks_ja":            scenario_all_checks_ja,
    "no_comments":              scenario_no_comments,
    "with_conflicts":           scenario_with_conflicts,
    "with_external_eval":       scenario_with_external_eval,
}


def generate():
    os.makedirs(FIXTURES_DIR, exist_ok=True)

    for name, fn in SCENARIOS.items():
        case_dir = os.path.join(FIXTURES_DIR, name)
        tmp = os.path.join(case_dir, "_tmp_project")

        # Clean previous runs
        if os.path.isdir(case_dir):
            shutil.rmtree(case_dir)
        os.makedirs(tmp)

        print(f"  [{name}]", end=" ", flush=True)
        result = fn(tmp)

        # Write output files from the returned result dict
        content = result["content"]
        out_final = os.path.join(case_dir, "outputs", "final")
        out_data = os.path.join(out_final, "_data")
        os.makedirs(out_data, exist_ok=True)

        # Markdown outputs
        write_text(os.path.join(out_final, "final_review.md"), content["final_review_md"])
        write_text(os.path.join(out_data, "comments_to_authors.md"), content["comments_to_authors_md"])
        write_text(os.path.join(out_data, "confidential_comments_to_editor.md"), content["confidential_comments_md"])
        write_text(os.path.join(out_data, "recommendation.md"), content["recommendation_md"])

        # Binary outputs (DOCX)
        if content["final_review_docx"] is not None:
            with open(os.path.join(out_final, "final_review.docx"), "wb") as f:
                f.write(content["final_review_docx"])

        # Text output
        if content["final_review_txt"] is not None:
            write_text(os.path.join(out_final, "final_review.txt"), content["final_review_txt"])

        # audit_trail.json
        write_json(os.path.join(out_data, "audit_trail.json"), content["audit_trail"])

        # Save the metadata returned by final_merge (excluding content bytes)
        meta = {
            "total_comments": result["total_comments"],
            "major_count": result["major_count"],
            "minor_count": result["minor_count"],
            "recommendation": result["recommendation"],
        }
        write_json(os.path.join(case_dir, "result_meta.json"), meta)

        # Copy input merged files for reference / loader tests
        for ck in CHECKS:
            src = os.path.join(tmp, "outputs", ck, "merged.section.json")
            if os.path.isfile(src):
                dst = os.path.join(case_dir, "outputs", ck)
                write_json(os.path.join(dst, "merged.section.json"),
                          json.load(open(src, encoding="utf-8")))

        # Copy other input files (selection, external_check, reevaluation, etc.)
        for ck in CHECKS:
            ck_dir = os.path.join(tmp, "outputs", ck)
            if not os.path.isdir(ck_dir):
                continue
            for fname in os.listdir(ck_dir):
                if fname == "merged.section.json":
                    continue
                src = os.path.join(ck_dir, fname)
                dst = os.path.join(case_dir, "outputs", ck, fname)
                write_json(dst, json.load(open(src, encoding="utf-8")))

        # Copy abstract.txt if present
        abs_src = os.path.join(tmp, "sections", "abstract.txt")
        if os.path.isfile(abs_src):
            write_text(os.path.join(case_dir, "sections", "abstract.txt"),
                      open(abs_src, encoding="utf-8").read())

        # Cleanup
        shutil.rmtree(tmp, ignore_errors=True)

        print(f"comments={result['total_comments']} major={result['major_count']}")


def _copytree(src, dst):
    """Copy entire directory tree, writing files."""
    if not os.path.isdir(src):
        return
    for root, dirs, files in os.walk(src):
        for fn in files:
            sp = os.path.join(root, fn)
            dp = os.path.join(dst, os.path.relpath(sp, src))
            os.makedirs(os.path.dirname(dp), exist_ok=True)
            # Copy binary files directly, text files as-is
            mode = "rb" if fn.endswith(".docx") else "r"
            enc = None if mode == "rb" else "utf-8"
            with open(sp, mode) as f:
                data = f.read()
            wmode = "wb" if mode == "rb" else "w"
            wenc = None if wmode == "wb" else "utf-8"
            with open(dp, wmode) as f:
                if wenc:
                    f.write(data)
                else:
                    f.write(data)


if __name__ == "__main__":
    print("Generating final_merge fixtures...")
    generate()
    print("Done.")
