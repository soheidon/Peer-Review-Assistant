"""Generate section_normalizer test fixtures by running Python normalize_sections().

Creates section_normalizer_fixtures.json with diverse inputs and expected outputs.
Idempotent: re-running produces identical output.
"""
import json
import os
import sys

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(TESTS_DIR)))
sys.path.insert(0, os.path.join(PROJ_ROOT, "python"))

# The peer_review_assistant package lives under python/peer_review_assistant
from peer_review_assistant.preprocess.section_normalizer import normalize_sections

# --- Build a journal profile with aliases and rules ---

JOURNAL_PROFILE = {
    "manuscript_structure": {
        "section_aliases": {
            "abstract": ["Abstract", "Summary"],
            "highlights": ["Research highlights", "Highlights", "Key points"],
            "introduction": ["Introduction", "Background", "はじめに", "序論"],
            "methods": ["Methods", "Materials and Methods", "方法", "実験"],
            "results": ["Results", "Findings", "結果"],
            "discussion": ["Discussion", "考察", "議論"],
            "conclusion": ["Conclusion", "Concluding remarks", "結論"],
            "references": ["References", "参考文献"],
            "acknowledgements": ["Acknowledgements", "謝辞"],
            "data_availability": ["Data Availability", "Data and Code Availability"],
        },
        "section_alias_rules": [
            {"alias": "Summary", "canonical": "abstract", "condition": "before_introduction"},
            {"alias": "Research highlights", "canonical": "highlights", "condition": "before_introduction"},
            {"alias": "Concluding remarks", "canonical": "discussion_subsection_or_conclusion", "condition": "inside_or_immediately_after_discussion"},
            {"alias": "Statistical Analyses", "canonical": "methods_subsection", "condition": "inside_methods"},
        ],
        "main_text_order": [
            "introduction", "methods", "results", "discussion", "conclusion"
        ],
        "front_matter_sections": [
            "abstract", "highlights", "keywords"
        ],
        "back_matter_sections": [
            "references", "acknowledgements", "data_availability"
        ],
    }
}

# Minimal profile for single-section tests
MINIMAL_PROFILE = {
    "manuscript_structure": {
        "section_aliases": {
            "introduction": ["Introduction", "Background"],
            "methods": ["Methods", "Materials and Methods"],
        },
        "main_text_order": ["introduction", "methods", "results", "discussion"],
        "front_matter_sections": ["abstract"],
        "back_matter_sections": ["references"],
    }
}

fixtures = []

# ── 1. no_profile ──
fixtures.append({
    "name": "no_profile",
    "section_map": {
        "sections": [
            {"name": "introduction", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 5},
            {"name": "methods", "heading": "Methods",
             "level": 1, "parent_section": None, "start_paragraph": 6, "end_paragraph": 12},
            {"name": "results", "heading": "Results",
             "level": 1, "parent_section": None, "start_paragraph": 13, "end_paragraph": 18},
        ]
    },
    "journal_profile": None,
    "expected": normalize_sections(
        {"sections": [
            {"name": "introduction", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 5},
            {"name": "methods", "heading": "Methods",
             "level": 1, "parent_section": None, "start_paragraph": 6, "end_paragraph": 12},
            {"name": "results", "heading": "Results",
             "level": 1, "parent_section": None, "start_paragraph": 13, "end_paragraph": 18},
        ]},
        None
    ),
})

# ── 2. exact_alias_match ──
fixtures.append({
    "name": "exact_alias_match",
    "section_map": {
        "sections": [
            {"name": "s1", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
        ]
    },
    "journal_profile": MINIMAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "s1", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
        ]},
        MINIMAL_PROFILE,
    ),
})

# ── 3. substring_match ──
fixtures.append({
    "name": "substring_match",
    "section_map": {
        "sections": [
            {"name": "s1", "heading": "2.1 Introduction",
             "level": 2, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
        ]
    },
    "journal_profile": MINIMAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "s1", "heading": "2.1 Introduction",
             "level": 2, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
        ]},
        MINIMAL_PROFILE,
    ),
})

# ── 4. longest_substring_wins ──
profile_with_similar = {
    "manuscript_structure": {
        "section_aliases": {
            "introduction": ["Introduction", "Intro"],
            "methods": ["Methods and Materials", "Methods"],
        },
        "main_text_order": ["introduction", "methods"],
        "front_matter_sections": [],
        "back_matter_sections": [],
    }
}
fixtures.append({
    "name": "longest_substring_wins",
    "section_map": {
        "sections": [
            {"name": "s1", "heading": "Methods and Materials",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 5},
        ]
    },
    "journal_profile": profile_with_similar,
    "expected": normalize_sections(
        {"sections": [
            {"name": "s1", "heading": "Methods and Materials",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 5},
        ]},
        profile_with_similar,
    ),
})

# ── 5. position_before_introduction ──
fixtures.append({
    "name": "position_before_introduction",
    "section_map": {
        "sections": [
            {"name": "s1", "heading": "Summary",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 1},
            {"name": "s2", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 2, "end_paragraph": 5},
        ]
    },
    "journal_profile": JOURNAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "s1", "heading": "Summary",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 1},
            {"name": "s2", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 2, "end_paragraph": 5},
        ]},
        JOURNAL_PROFILE,
    ),
})

# ── 6. position_inside_discussion ──
fixtures.append({
    "name": "position_inside_discussion",
    "section_map": {
        "sections": [
            {"name": "discussion", "heading": "Discussion",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 8},
            {"name": "s2", "heading": "Concluding remarks",
             "level": 2, "parent_section": "discussion", "start_paragraph": 2, "end_paragraph": 4},
        ]
    },
    "journal_profile": JOURNAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "discussion", "heading": "Discussion",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 8},
            {"name": "s2", "heading": "Concluding remarks",
             "level": 2, "parent_section": "discussion", "start_paragraph": 2, "end_paragraph": 4},
        ]},
        JOURNAL_PROFILE,
    ),
})

# ── 7. position_immediately_after_discussion ──
fixtures.append({
    "name": "position_immediately_after_discussion",
    "section_map": {
        "sections": [
            {"name": "discussion", "heading": "Discussion",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 5},
            {"name": "s2", "heading": "Concluding remarks",
             "level": 1, "parent_section": None, "start_paragraph": 6, "end_paragraph": 7},
        ]
    },
    "journal_profile": JOURNAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "discussion", "heading": "Discussion",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 5},
            {"name": "s2", "heading": "Concluding remarks",
             "level": 1, "parent_section": None, "start_paragraph": 6, "end_paragraph": 7},
        ]},
        JOURNAL_PROFILE,
    ),
})

# ── 8. position_inside_methods ──
fixtures.append({
    "name": "position_inside_methods",
    "section_map": {
        "sections": [
            {"name": "methods", "heading": "Methods",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 8},
            {"name": "s2", "heading": "Statistical Analyses",
             "level": 2, "parent_section": "methods", "start_paragraph": 3, "end_paragraph": 5},
        ]
    },
    "journal_profile": JOURNAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "methods", "heading": "Methods",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 8},
            {"name": "s2", "heading": "Statistical Analyses",
             "level": 2, "parent_section": "methods", "start_paragraph": 3, "end_paragraph": 5},
        ]},
        JOURNAL_PROFILE,
    ),
})

# ── 9. japanese_headings ──
fixtures.append({
    "name": "japanese_headings",
    "section_map": {
        "sections": [
            {"name": "s1", "heading": "はじめに",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
            {"name": "s2", "heading": "方法",
             "level": 1, "parent_section": None, "start_paragraph": 4, "end_paragraph": 8},
            {"name": "s3", "heading": "結果",
             "level": 1, "parent_section": None, "start_paragraph": 9, "end_paragraph": 12},
            {"name": "s4", "heading": "考察",
             "level": 1, "parent_section": None, "start_paragraph": 13, "end_paragraph": 16},
        ]
    },
    "journal_profile": JOURNAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "s1", "heading": "はじめに",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
            {"name": "s2", "heading": "方法",
             "level": 1, "parent_section": None, "start_paragraph": 4, "end_paragraph": 8},
            {"name": "s3", "heading": "結果",
             "level": 1, "parent_section": None, "start_paragraph": 9, "end_paragraph": 12},
            {"name": "s4", "heading": "考察",
             "level": 1, "parent_section": None, "start_paragraph": 13, "end_paragraph": 16},
        ]},
        JOURNAL_PROFILE,
    ),
})

# ── 10. classification_mixed ──
fixtures.append({
    "name": "classification_mixed",
    "section_map": {
        "sections": [
            {"name": "abstract_sec", "heading": "Abstract",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 1},
            {"name": "intro", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 2, "end_paragraph": 5},
            {"name": "methods_sec", "heading": "Methods",
             "level": 1, "parent_section": None, "start_paragraph": 6, "end_paragraph": 10},
            {"name": "results_sec", "heading": "Results",
             "level": 1, "parent_section": None, "start_paragraph": 11, "end_paragraph": 14},
            {"name": "discussion_sec", "heading": "Discussion",
             "level": 1, "parent_section": None, "start_paragraph": 15, "end_paragraph": 18},
            {"name": "references_sec", "heading": "References",
             "level": 1, "parent_section": None, "start_paragraph": 19, "end_paragraph": 20},
        ]
    },
    "journal_profile": JOURNAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "abstract_sec", "heading": "Abstract",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 1},
            {"name": "intro", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 2, "end_paragraph": 5},
            {"name": "methods_sec", "heading": "Methods",
             "level": 1, "parent_section": None, "start_paragraph": 6, "end_paragraph": 10},
            {"name": "results_sec", "heading": "Results",
             "level": 1, "parent_section": None, "start_paragraph": 11, "end_paragraph": 14},
            {"name": "discussion_sec", "heading": "Discussion",
             "level": 1, "parent_section": None, "start_paragraph": 15, "end_paragraph": 18},
            {"name": "references_sec", "heading": "References",
             "level": 1, "parent_section": None, "start_paragraph": 19, "end_paragraph": 20},
        ]},
        JOURNAL_PROFILE,
    ),
})

# ── 11. dedup_canonical_order ──
fixtures.append({
    "name": "dedup_canonical_order",
    "section_map": {
        "sections": [
            {"name": "intro_a", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
            {"name": "intro_b", "heading": "Introduction subsection",
             "level": 2, "parent_section": "intro_a", "start_paragraph": 1, "end_paragraph": 2},
        ]
    },
    "journal_profile": MINIMAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "intro_a", "heading": "Introduction",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
            {"name": "intro_b", "heading": "Introduction subsection",
             "level": 2, "parent_section": "intro_a", "start_paragraph": 1, "end_paragraph": 2},
        ]},
        MINIMAL_PROFILE,
    ),
})

# ── 12. unknown_section ──
fixtures.append({
    "name": "unknown_section",
    "section_map": {
        "sections": [
            {"name": "custom_name", "heading": "Some Weird Heading",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
        ]
    },
    "journal_profile": MINIMAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "custom_name", "heading": "Some Weird Heading",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
        ]},
        MINIMAL_PROFILE,
    ),
})

# ── 13. empty_sections ──
fixtures.append({
    "name": "empty_sections",
    "section_map": {"sections": []},
    "journal_profile": JOURNAL_PROFILE,
    "expected": normalize_sections(
        {"sections": []},
        JOURNAL_PROFILE,
    ),
})

# ── 14. case_insensitive_alias ──
fixtures.append({
    "name": "case_insensitive_alias",
    "section_map": {
        "sections": [
            {"name": "s1", "heading": "INTRODUCTION",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
        ]
    },
    "journal_profile": MINIMAL_PROFILE,
    "expected": normalize_sections(
        {"sections": [
            {"name": "s1", "heading": "INTRODUCTION",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 3},
        ]},
        MINIMAL_PROFILE,
    ),
})

# ── 15. subsection_stripped_for_classification ──
profile_with_subsections = {
    "manuscript_structure": {
        "section_aliases": {
            "discussion": ["Discussion"],
            "conclusion": ["Conclusion"],
        },
        "section_alias_rules": [
            {"alias": "Concluding remarks", "canonical": "discussion_subsection_or_conclusion", "condition": "inside_or_immediately_after_discussion"},
        ],
        "main_text_order": ["discussion", "conclusion"],
        "front_matter_sections": [],
        "back_matter_sections": [],
    }
}
fixtures.append({
    "name": "subsection_stripped_for_classification",
    "section_map": {
        "sections": [
            {"name": "discussion", "heading": "Discussion",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 5},
            {"name": "s2", "heading": "Concluding remarks",
             "level": 2, "parent_section": "discussion", "start_paragraph": 3, "end_paragraph": 5},
        ]
    },
    "journal_profile": profile_with_subsections,
    "expected": normalize_sections(
        {"sections": [
            {"name": "discussion", "heading": "Discussion",
             "level": 1, "parent_section": None, "start_paragraph": 0, "end_paragraph": 5},
            {"name": "s2", "heading": "Concluding remarks",
             "level": 2, "parent_section": "discussion", "start_paragraph": 3, "end_paragraph": 5},
        ]},
        profile_with_subsections,
    ),
})

# ── Write fixtures ──
OUTPUT = os.path.join(TESTS_DIR, "section_normalizer_fixtures.json")
with open(OUTPUT, "w", encoding="utf-8") as f:
    json.dump(fixtures, f, indent=2, ensure_ascii=False)

print(f"Wrote {len(fixtures)} fixtures to {OUTPUT}")
print("Re-running to verify idempotency...")

# Verify idempotency by re-reading and re-running
with open(OUTPUT, "r", encoding="utf-8") as f:
    saved = json.load(f)

for entry in saved:
    sm = entry["section_map"]
    jp = entry["journal_profile"]
    actual = normalize_sections(sm, jp)
    expected = entry["expected"]

    # Normalize both for comparison (Python dicts may have key order differences)
    if json.dumps(actual, sort_keys=True) != json.dumps(expected, sort_keys=True):
        print(f"MISMATCH for {entry['name']}!")
        print(f"  actual:   {json.dumps(actual, sort_keys=True)}")
        print(f"  expected: {json.dumps(expected, sort_keys=True)}")
        sys.exit(1)

print("All fixtures are idempotent.")
