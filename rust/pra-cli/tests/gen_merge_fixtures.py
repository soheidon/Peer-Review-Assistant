"""Generate merge fixtures from Python merge/__init__.py.

Creates sample .raw.json files for each test case, runs merge_section(),
and saves input snapshots + output (merged.section.json and merged.md).

Re-run safe: produces identical output each time.
"""
import json
import os
import shutil
import sys

sys.path.insert(0, '../../../python/peer_review_assistant')
from merge import merge_section
from merge import _build_markdown

HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURES_DIR = os.path.join(HERE, 'merge_fixtures')

# ── Case definitions ─────────────────────────────────────────────────────

def case_single_reviewer():
    """One reviewer with 3 findings — no merging needed."""
    return {
        "source": "gpt-4o",
        "status": "done",
        "model": "gpt-4o",
        "summary": "The structure is generally sound.",
        "findings": [
            {
                "finding_id": "S001",
                "severity": "major",
                "category": "Structure",
                "location": {"section": "Introduction"},
                "issue": "Missing clear research question.",
                "suggested_comment": "Add an explicit research question at the end of the introduction.",
                "confidence": "high",
            },
            {
                "finding_id": "S002",
                "severity": "minor",
                "category": "Structure",
                "location": {"section": "Methods"},
                "issue": "Sample size justification is unclear.",
                "suggested_comment": "Provide a power analysis or reference for sample size.",
                "confidence": "medium",
            },
            {
                "finding_id": "S003",
                "severity": "minor",
                "category": "Formatting",
                "location": {"section": "Results"},
                "issue": "Table 2 lacks a descriptive caption.",
                "suggested_comment": "Add a caption describing what the table shows.",
                "confidence": "high",
            },
        ],
    }


def case_multi_reviewer_overlap():
    """Two reviewers flagging the same issue with different wording.

    Their findings about 'Introduction/sample size' share the same section
    and similar phrasing, so they should be merged into one comment.
    """
    r1 = {
        "source": "gpt-4o",
        "status": "done",
        "model": "gpt-4o",
        "findings": [
            {
                "finding_id": "R1_01",
                "severity": "major",
                "category": "Structure",
                "location": {"section": "Introduction"},
                "issue": "The research gap is not stated in the introduction.",
                "suggested_comment": "Add a clear research gap statement.",
                "confidence": "high",
            },
            {
                "finding_id": "R1_02",
                "severity": "minor",
                "category": "Expression",
                "location": {"section": "Discussion"},
                "issue": "Sentences are too long and hard to follow.",
                "suggested_comment": "Break long sentences into shorter ones.",
                "confidence": "medium",
            },
        ],
    }
    r2 = {
        "source": "claude-opus",
        "status": "done",
        "model": "claude-opus-4",
        "findings": [
            {
                "finding_id": "R2_01",
                "severity": "major",
                "category": "Structure",
                "location": {"section": "Introduction"},
                "issue": "The research gap is missing from the introduction.",
                "suggested_comment": "State what gap this study addresses.",
                "confidence": "high",
            },
            {
                "finding_id": "R2_02",
                "severity": "minor",
                "category": "Expression",
                "location": {"section": "Discussion"},
                "issue": "Long sentences make the text hard to follow.",
                "suggested_comment": "Consider revising for clarity.",
                "confidence": "medium",
            },
        ],
    }
    return [r1, r2]


def case_multi_reviewer_no_overlap():
    """Two reviewers flagging completely different sections.

    No findings should be merged because they reference different sections.
    """
    r1 = {
        "source": "gpt-4o",
        "status": "done",
        "model": "gpt-4o",
        "findings": [
            {
                "finding_id": "R1_01",
                "severity": "major",
                "category": "Structure",
                "location": {"section": "Introduction"},
                "issue": "Missing clear research question.",
                "suggested_comment": "Add an explicit research question.",
                "confidence": "high",
            },
        ],
    }
    r2 = {
        "source": "claude-opus",
        "status": "done",
        "model": "claude-opus-4",
        "findings": [
            {
                "finding_id": "R2_01",
                "severity": "major",
                "category": "Methods",
                "location": {"section": "Methods"},
                "issue": "Sample size justification is missing.",
                "suggested_comment": "Add power analysis.",
                "confidence": "high",
            },
        ],
    }
    return [r1, r2]


def case_intra_reviewer_duplicate():
    """Same reviewer has two similar findings about the same section.

    The merge logic must NOT merge findings from the same reviewer.
    They should appear as separate comments.
    """
    return {
        "source": "gpt-4o",
        "status": "done",
        "model": "gpt-4o",
        "findings": [
            {
                "finding_id": "S001",
                "severity": "major",
                "category": "Structure",
                "location": {"section": "Introduction"},
                "issue": "The introduction lacks a clear research gap.",
                "suggested_comment": "Add research gap statement.",
                "confidence": "high",
            },
            {
                "finding_id": "S002",
                "severity": "major",
                "category": "Structure",
                "location": {"section": "Introduction"},
                "issue": "The introduction needs a clearer research gap statement.",
                "suggested_comment": "Clarify what gap this study addresses.",
                "confidence": "high",
            },
        ],
    }


def case_severity_conflict():
    """Two reviewers disagree on severity for the same issue.

    The merged comment should flag a conflict (severity disagreement).
    """
    r1 = {
        "source": "gpt-4o",
        "status": "done",
        "model": "gpt-4o",
        "findings": [
            {
                "finding_id": "R1_01",
                "severity": "major",
                "category": "Methods",
                "location": {"section": "Methods"},
                "issue": "The statistical method is not appropriate for the study design.",
                "suggested_comment": "Consider using a mixed-effects model instead of ANOVA.",
                "confidence": "high",
            },
        ],
    }
    r2 = {
        "source": "claude-opus",
        "status": "done",
        "model": "claude-opus-4",
        "findings": [
            {
                "finding_id": "R2_01",
                "severity": "minor",
                "category": "Methods",
                "location": {"section": "Methods"},
                "issue": "The statistical method choice could be questioned.",
                "suggested_comment": "Justify the choice of ANOVA or consider alternatives.",
                "confidence": "medium",
            },
        ],
    }
    return [r1, r2]


def case_empty_findings():
    """A reviewer with no findings.

    Should still appear in sources but not affect comments.
    """
    r1 = {
        "source": "gpt-4o",
        "status": "done",
        "model": "gpt-4o",
        "findings": [
            {
                "finding_id": "S001",
                "severity": "major",
                "category": "Structure",
                "location": {"section": "Introduction"},
                "issue": "Missing clear research question.",
                "suggested_comment": "Add an explicit research question.",
                "confidence": "high",
            },
        ],
    }
    r2 = {
        "source": "claude-opus",
        "status": "done",
        "model": "claude-opus-4",
        "summary": "No issues found.",
        "findings": [],
    }
    return [r1, r2]


CASES = {
    "single_reviewer": case_single_reviewer,
    "multi_reviewer_overlap": case_multi_reviewer_overlap,
    "multi_reviewer_no_overlap": case_multi_reviewer_no_overlap,
    "intra_reviewer_duplicate": case_intra_reviewer_duplicate,
    "severity_conflict": case_severity_conflict,
    "empty_findings": case_empty_findings,
}

CHECK_NAME = "structure"


def generate():
    """Generate all fixtures."""
    for case_name, case_fn in CASES.items():
        case_dir = os.path.join(FIXTURES_DIR, case_name)
        os.makedirs(case_dir, exist_ok=True)

        raw_data = case_fn()

        # Normalize: raw_data can be a single dict or a list of dicts
        reviewers = raw_data if isinstance(raw_data, list) else [raw_data]

        # Build a temp project directory
        tmp = os.path.join(case_dir, "_tmp_project")
        outputs_dir = os.path.join(tmp, "outputs", CHECK_NAME)
        os.makedirs(outputs_dir, exist_ok=True)

        # Write each reviewer's .raw.json
        for r in reviewers:
            src = r.get("source", "unknown")
            path = os.path.join(outputs_dir, f"{src}.raw.json")
            with open(path, "w", encoding="utf-8") as f:
                json.dump(r, f, indent=2, ensure_ascii=False)

        # Run merge
        result = merge_section(CHECK_NAME, tmp)

        # Write output snapshots
        merged_json_path = os.path.join(case_dir, "merged.section.json")
        with open(merged_json_path, "w", encoding="utf-8") as f:
            json.dump(result["merged"], f, indent=2, ensure_ascii=False)

        md_text = _build_markdown(result["merged"])
        merged_md_path = os.path.join(case_dir, "merged.md")
        with open(merged_md_path, "w", encoding="utf-8") as f:
            f.write(md_text)

        # Write input snapshots (for reference)
        for r in reviewers:
            src = r.get("source", "unknown")
            input_path = os.path.join(case_dir, f"{src}.raw.json")
            with open(input_path, "w", encoding="utf-8") as f:
                json.dump(r, f, indent=2, ensure_ascii=False)

        # Cleanup temp project
        shutil.rmtree(tmp, ignore_errors=True)

        print(f"  [{case_name}] source_count={result['source_count']} "
              f"total_findings={result['total_findings']} "
              f"merged_count={result['merged_count']}")


if __name__ == "__main__":
    print("Generating merge fixtures...")
    generate()
    print("Done.")
