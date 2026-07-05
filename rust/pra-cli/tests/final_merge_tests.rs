/// Fixture-based integration tests for final_merge loader functions.
///
/// Each test points at a fixture directory under final_merge_fixtures/
/// and verifies that the loader reads (or correctly skips) the expected data.

use pra_cli_rs::final_merge;
use std::path::PathBuf;

fn fixture_dir(name: &str) -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("tests")
        .join("final_merge_fixtures")
        .join(name)
}

// ── load_merged ─────────────────────────────────────────────────────────

#[test]
fn load_merged_structure_only() {
    let proj = fixture_dir("structure_only");
    let merged = final_merge::load_merged(&proj, "structure")
        .expect("merged.section.json should exist");
    assert_eq!(merged["check_name"], "structure");
    assert_eq!(merged["comments"].as_array().unwrap().len(), 3);
}

#[test]
fn load_merged_all_checks() {
    let proj = fixture_dir("all_checks");
    for ck in &final_merge::CHECK_NAMES {
        let merged = final_merge::load_merged(&proj, ck)
            .unwrap_or_else(|| panic!("merged.section.json should exist for {}", ck));
        assert_eq!(merged["check_name"], *ck);
        assert!(!merged["comments"].as_array().unwrap().is_empty(),
                "{} should have comments", ck);
    }
}

#[test]
fn load_merged_no_comments() {
    let proj = fixture_dir("no_comments");
    for ck in &final_merge::CHECK_NAMES {
        let merged = final_merge::load_merged(&proj, ck)
            .unwrap_or_else(|| panic!("merged should exist for {}", ck));
        assert_eq!(merged["comments"].as_array().unwrap().len(), 0,
                   "{} should have zero comments", ck);
    }
}

#[test]
fn load_merged_missing_check_returns_none() {
    let proj = fixture_dir("structure_only");
    // "expression" was never run in this scenario
    assert!(final_merge::load_merged(&proj, "expression").is_none());
}

// ── load_selection ──────────────────────────────────────────────────────

#[test]
fn load_selection_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_selection(&proj, "structure").is_none());
}

// ── load_external_check / load_reevaluation ─────────────────────────────

#[test]
fn load_external_check_with_external_eval() {
    let proj = fixture_dir("with_external_eval");
    let ec = final_merge::load_external_check(&proj, "structure")
        .expect("external_check.json should exist");
    assert_eq!(ec.len(), 2);
    assert!(ec.contains_key("structure_001"));
    assert!(ec.contains_key("structure_002"));
    assert_eq!(ec["structure_001"]["verdict"], "agree");
    assert_eq!(ec["structure_002"]["verdict"], "partial");
}

#[test]
fn load_reevaluation_with_external_eval() {
    let proj = fixture_dir("with_external_eval");
    let re = final_merge::load_reevaluation(&proj, "structure")
        .expect("reevaluation.json should exist");
    assert_eq!(re.len(), 2);
    assert!(re.contains_key("structure_001"));
    assert!(re.contains_key("structure_002"));
    assert_eq!(re["structure_001"]["verdict"], "tool_correct");
    assert_eq!(re["structure_002"]["verdict"], "external_correct");
}

#[test]
fn load_external_check_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_external_check(&proj, "structure").is_none());
}

#[test]
fn load_reevaluation_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_reevaluation(&proj, "structure").is_none());
}

// ── optional files: return None when missing ────────────────────────────

#[test]
fn load_checked_comment_ids_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_checked_comment_ids(&proj).is_none());
}

#[test]
fn load_verdict_checks_missing_returns_empty() {
    let proj = fixture_dir("structure_only");
    let checks = final_merge::load_verdict_checks(&proj);
    assert!(checks.is_empty());
}

#[test]
fn load_user_verdict_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_user_verdict(&proj).is_none());
}

#[test]
fn load_review_comments_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_review_comments(&proj, "en").is_none());
    assert!(final_merge::load_review_comments(&proj, "ja").is_none());
}

#[test]
fn load_overall_assessment_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_overall_assessment(&proj, "en").is_none());
    assert!(final_merge::load_overall_assessment(&proj, "ja").is_none());
}

#[test]
fn load_line_numbers_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_line_numbers(&proj).is_none());
}

#[test]
fn load_comments_to_authors_jp_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_comments_to_authors_jp(&proj).is_none());
}

#[test]
fn load_abstract_text_missing_returns_none() {
    let proj = fixture_dir("structure_only");
    assert!(final_merge::load_abstract_text(&proj).is_none());
}

// ── CHECK_NAMES constant ────────────────────────────────────────────────

#[test]
fn check_names_constant_is_correct() {
    assert_eq!(
        final_merge::CHECK_NAMES,
        ["structure", "expression", "methods_stats", "logic_argument", "figure_table", "ethics"]
    );
}

// ══════════════════════════════════════════════════════════════════════════
// Markdown generation tests
// ══════════════════════════════════════════════════════════════════════════

use serde_json::Value;
use std::collections::HashMap;
use std::fs;

/// Read a fixture output file, normalizing CRLF → LF for cross-platform matching.
fn read_fixture_md(dir: &str, rel_path: &str) -> String {
    let p = fixture_dir(dir).join(rel_path);
    fs::read_to_string(&p)
        .unwrap_or_else(|e| panic!("Cannot read {}: {}", p.display(), e))
        .replace("\r\n", "\n")
}

// ── Scenario helpers ────────────────────────────────────────────────────

/// Prepared state for a final_merge scenario.
struct Scenario {
    merged: Value,
    major: Vec<Value>,
    minor: Vec<Value>,
    expression_comments: Vec<Value>,
    expression_available: bool,
    ms_comments: Vec<Value>,
    ms_available: bool,
    la_comments: Vec<Value>,
    la_available: bool,
    ft_comments: Vec<Value>,
    ft_available: bool,
    ethics_comments: Vec<Value>,
    ethics_available: bool,
    structure_re: Option<HashMap<String, Value>>,
    expression_re: Option<HashMap<String, Value>>,
    methods_stats_re: Option<HashMap<String, Value>>,
    logic_argument_re: Option<HashMap<String, Value>>,
    figure_table_re: Option<HashMap<String, Value>>,
    ethics_re: Option<HashMap<String, Value>>,
    expression_count: usize,
    ms_count: usize,
    ms_major_count: usize,
    la_count: usize,
    la_major_count: usize,
    ft_count: usize,
    ft_major_count: usize,
    ethics_count: usize,
    ethics_major_count: usize,
    lang: &'static str,
    jp_texts: Option<HashMap<String, String>>,
}

/// Load and prepare comments for a check. Returns (comments, available).
fn load_check(
    proj: &std::path::Path,
    check_name: &str,
    re: Option<HashMap<String, Value>>,
) -> (Vec<Value>, bool) {
    match final_merge::load_merged(proj, check_name) {
        Some(merged) => {
            let raw: Vec<Value> = merged
                .get("comments")
                .and_then(|v| v.as_array())
                .map(|a| a.clone())
                .unwrap_or_default();
            let prepared = final_merge::prepare_author_comments(&raw, re.as_ref());
            (prepared, true)
        }
        None => (vec![], false),
    }
}

impl Scenario {
    fn prepare(dir: &str, lang: &'static str) -> Self {
        let proj = fixture_dir(dir);

        let merged = final_merge::load_merged(&proj, "structure")
            .expect("structure merged must exist");

        let structure_re = final_merge::load_reevaluation(&proj, "structure");
        let expression_re = final_merge::load_reevaluation(&proj, "expression");
        let methods_stats_re = final_merge::load_reevaluation(&proj, "methods_stats");
        let logic_argument_re = final_merge::load_reevaluation(&proj, "logic_argument");
        let figure_table_re = final_merge::load_reevaluation(&proj, "figure_table");
        let ethics_re = final_merge::load_reevaluation(&proj, "ethics");

        // Structure comments: load, prepare, split
        let raw_struct: Vec<Value> = merged
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.clone())
            .unwrap_or_default();
        let struct_prepared =
            final_merge::prepare_author_comments(&raw_struct, structure_re.as_ref());
        let major: Vec<Value> = struct_prepared
            .iter()
            .filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major"))
            .cloned()
            .collect();
        let minor: Vec<Value> = struct_prepared
            .iter()
            .filter(|c| c.get("severity").and_then(|v| v.as_str()) != Some("major"))
            .cloned()
            .collect();

        // Expression
        let (expression_comments, expression_available) = load_check(&proj, "expression", expression_re.clone());

        let (ms_comments, ms_available) = load_check(&proj, "methods_stats", methods_stats_re.clone());
        let ms_major_count = ms_comments.iter().filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major")).count();

        let (la_comments, la_available) = load_check(&proj, "logic_argument", logic_argument_re.clone());
        let la_major_count = la_comments.iter().filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major")).count();

        let (ft_comments, ft_available) = load_check(&proj, "figure_table", figure_table_re.clone());
        let ft_major_count = ft_comments.iter().filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major")).count();

        let (ethics_comments, ethics_available) = load_check(&proj, "ethics", ethics_re.clone());
        let ethics_major_count = ethics_comments.iter().filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major")).count();

        let jp_texts = if lang == "ja" {
            final_merge::load_comments_to_authors_jp(&proj)
        } else {
            None
        };

        Scenario {
            merged,
            major,
            minor,
            expression_comments: expression_comments.clone(),
            expression_available,
            ms_comments: ms_comments.clone(),
            ms_available,
            la_comments: la_comments.clone(),
            la_available,
            ft_comments: ft_comments.clone(),
            ft_available,
            ethics_comments: ethics_comments.clone(),
            ethics_available,
            structure_re,
            expression_re,
            methods_stats_re,
            logic_argument_re,
            figure_table_re,
            ethics_re,
            expression_count: expression_comments.len(),
            ms_count: ms_comments.len(),
            ms_major_count,
            la_count: la_comments.len(),
            la_major_count,
            ft_count: ft_comments.len(),
            ft_major_count,
            ethics_count: ethics_comments.len(),
            ethics_major_count,
            lang,
            jp_texts,
        }
    }
}

/// Generate all 4 markdown outputs for a scenario and compare with fixtures.
fn assert_markdown_match(dir: &str, s: &Scenario) {
    // 1. final_review.md
    let review = final_merge::generate_final_review_md(
        &s.merged,
        &s.major,
        &s.minor,
        &s.expression_comments,
        &s.ms_comments,
        s.ms_available,
        &s.la_comments,
        s.la_available,
        &s.ft_comments,
        s.ft_available,
        &s.ethics_comments,
        s.ethics_available,
        s.lang,
        None,                         // line_numbers
        None,                         // overall_assessment
        None,                         // review_comments
        &HashMap::new(),              // verdict_checks
        s.jp_texts.as_ref(),
    );
    let expected = read_fixture_md(dir, "outputs/final/final_review.md");
    assert_eq!(review, expected, "final_review.md mismatch for {dir}");

    // 2. comments_to_authors.md
    let cta = final_merge::generate_comments_to_authors_md(
        &s.major,
        &s.minor,
        &s.expression_comments,
        &s.ms_comments,
        &s.la_comments,
        &s.ft_comments,
        &s.ethics_comments,
        s.structure_re.as_ref(),
        s.expression_re.as_ref(),
        s.methods_stats_re.as_ref(),
        s.logic_argument_re.as_ref(),
        s.figure_table_re.as_ref(),
        s.ethics_re.as_ref(),
    );
    let expected = read_fixture_md(dir, "outputs/final/_data/comments_to_authors.md");
    assert_eq!(cta, expected, "comments_to_authors.md mismatch for {dir}");

    // 3. confidential_comments_to_editor.md
    let conf = final_merge::generate_confidential_comments_md(
        s.expression_comments.is_empty() == false || final_merge::load_merged(&fixture_dir(dir), "expression").is_some(),
        s.ms_available,
        s.la_available,
        s.ft_available,
        s.ethics_available,
    );
    let expected = read_fixture_md(dir, "outputs/final/_data/confidential_comments_to_editor.md");
    assert_eq!(conf, expected, "confidential_comments_to_editor.md mismatch for {dir}");

    // 4. recommendation.md
    let rec = final_merge::generate_recommendation_md(
        s.major.len(),
        s.minor.len(),
        s.major.len() + s.minor.len() + s.expression_count + s.ms_count + s.la_count + s.ft_count + s.ethics_count,
        s.expression_count,
        final_merge::load_merged(&fixture_dir(dir), "expression").is_some(),
        s.ms_count,
        s.ms_major_count,
        s.ms_available,
        s.la_count,
        s.la_major_count,
        s.la_available,
        s.ft_count,
        s.ft_major_count,
        s.ft_available,
        s.ethics_count,
        s.ethics_major_count,
        s.ethics_available,
        None, // user_verdict
    );
    let expected = read_fixture_md(dir, "outputs/final/_data/recommendation.md");
    assert_eq!(rec, expected, "recommendation.md mismatch for {dir}");
}

// ── 7 scenarios × 4 outputs = 28 assertions across 7 tests ──────────────

#[test]
fn markdown_structure_only() {
    let s = Scenario::prepare("structure_only", "en");
    assert_markdown_match("structure_only", &s);
}

#[test]
fn markdown_structure_only_ja() {
    let s = Scenario::prepare("structure_only_ja", "ja");
    assert_markdown_match("structure_only_ja", &s);
}

#[test]
fn markdown_all_checks() {
    let s = Scenario::prepare("all_checks", "en");
    assert_markdown_match("all_checks", &s);
}

#[test]
fn markdown_all_checks_ja() {
    let s = Scenario::prepare("all_checks_ja", "ja");
    assert_markdown_match("all_checks_ja", &s);
}

#[test]
fn markdown_no_comments() {
    let s = Scenario::prepare("no_comments", "en");
    assert_markdown_match("no_comments", &s);
}

#[test]
fn markdown_with_conflicts() {
    let s = Scenario::prepare("with_conflicts", "en");
    assert_markdown_match("with_conflicts", &s);
}

#[test]
fn markdown_with_external_eval() {
    let s = Scenario::prepare("with_external_eval", "en");
    assert_markdown_match("with_external_eval", &s);
}

// ══════════════════════════════════════════════════════════════════════════
// Audit trail tests
// ══════════════════════════════════════════════════════════════════════════

/// Compare audit_trail.json output, excluding the generated_at key.
fn assert_audit_trail_match(dir: &str, s: &Scenario) {
    let counts = final_merge::compute_counts(
        &s.major,
        &s.minor,
        &s.expression_comments,
        &s.ms_comments,
        &s.la_comments,
        &s.ft_comments,
        &s.ethics_comments,
    );

    let total_major = counts.major
        + counts.ms_major
        + counts.la_major
        + counts.ft_major
        + counts.ethics_major;
    let rec = final_merge::get_recommendation(total_major, counts.minor, None);

    let abstract_available =
        final_merge::load_abstract_text(&fixture_dir(dir)).is_some();

    let mut actual = final_merge::build_audit_trail(
        &s.merged,
        &counts,
        &rec,
        abstract_available,
        s.expression_available,
        s.ms_available,
        s.la_available,
        s.ft_available,
        s.ethics_available,
        0, // ec_disagree_total
        0, // ec_disagree_structure
        0, // ec_disagree_expression
        0, // ec_disagree_ms
        0, // ec_disagree_la
        "2024-01-01T00:00:00+09:00",
    );

    // Remove generated_at from both
    actual.as_object_mut().unwrap().remove("generated_at");

    let fixture_path = fixture_dir(dir)
        .join("outputs")
        .join("final")
        .join("_data")
        .join("audit_trail.json");
    let raw = fs::read_to_string(&fixture_path)
        .unwrap_or_else(|e| panic!("Cannot read {}: {}", fixture_path.display(), e))
        .replace("\r\n", "\n");
    let mut expected: Value = serde_json::from_str(&raw)
        .unwrap_or_else(|e| panic!("Cannot parse {}: {}", fixture_path.display(), e));
    expected.as_object_mut().unwrap().remove("generated_at");

    assert_eq!(actual, expected, "audit_trail.json mismatch for {dir}");
}

#[test]
fn audit_trail_structure_only() {
    let s = Scenario::prepare("structure_only", "en");
    assert_audit_trail_match("structure_only", &s);
}

#[test]
fn audit_trail_structure_only_ja() {
    let s = Scenario::prepare("structure_only_ja", "ja");
    assert_audit_trail_match("structure_only_ja", &s);
}

#[test]
fn audit_trail_all_checks() {
    let s = Scenario::prepare("all_checks", "en");
    assert_audit_trail_match("all_checks", &s);
}

#[test]
fn audit_trail_all_checks_ja() {
    let s = Scenario::prepare("all_checks_ja", "ja");
    assert_audit_trail_match("all_checks_ja", &s);
}

#[test]
fn audit_trail_no_comments() {
    let s = Scenario::prepare("no_comments", "en");
    assert_audit_trail_match("no_comments", &s);
}

#[test]
fn audit_trail_with_conflicts() {
    let s = Scenario::prepare("with_conflicts", "en");
    assert_audit_trail_match("with_conflicts", &s);
}

#[test]
fn audit_trail_with_external_eval() {
    let s = Scenario::prepare("with_external_eval", "en");
    assert_audit_trail_match("with_external_eval", &s);
}

// ══════════════════════════════════════════════════════════════════════════
// Full final_merge() integration tests
// ══════════════════════════════════════════════════════════════════════════

/// Run final_merge() on a fixture directory and compare all outputs.
fn assert_final_merge_match(dir: &str, lang: &str) {
    let proj = fixture_dir(dir);
    let result = final_merge::final_merge(&proj, lang, "2024-01-01T00:00:00+09:00")
        .expect("final_merge should succeed");

    // 1. final_review.md — exact string match
    let expected_review = read_fixture_md(dir, "outputs/final/final_review.md");
    assert_eq!(
        result.final_review_md, expected_review,
        "final_review.md mismatch for {dir}"
    );

    // 2. comments_to_authors.md — exact string match
    let expected_cta = read_fixture_md(dir, "outputs/final/_data/comments_to_authors.md");
    assert_eq!(
        result.comments_to_authors_md, expected_cta,
        "comments_to_authors.md mismatch for {dir}"
    );

    // 3. confidential_comments_to_editor.md — exact string match
    let expected_conf =
        read_fixture_md(dir, "outputs/final/_data/confidential_comments_to_editor.md");
    assert_eq!(
        result.confidential_comments_md, expected_conf,
        "confidential_comments_to_editor.md mismatch for {dir}"
    );

    // 4. recommendation.md — exact string match
    let expected_rec = read_fixture_md(dir, "outputs/final/_data/recommendation.md");
    assert_eq!(
        result.recommendation_md, expected_rec,
        "recommendation.md mismatch for {dir}"
    );

    // 5. audit_trail.json — Value comparison (exclude generated_at)
    let mut actual_at = result.audit_trail.clone();
    actual_at.as_object_mut().unwrap().remove("generated_at");
    let at_path = fixture_dir(dir)
        .join("outputs")
        .join("final")
        .join("_data")
        .join("audit_trail.json");
    let at_raw = fs::read_to_string(&at_path)
        .unwrap_or_else(|e| panic!("Cannot read {}: {}", at_path.display(), e))
        .replace("\r\n", "\n");
    let mut expected_at: Value =
        serde_json::from_str(&at_raw)
            .unwrap_or_else(|e| panic!("Cannot parse {}: {}", at_path.display(), e));
    expected_at.as_object_mut().unwrap().remove("generated_at");
    assert_eq!(
        actual_at, expected_at,
        "audit_trail.json mismatch for {dir}"
    );
}

/// Smoke test: TXT output matches fixture.
fn assert_txt_smoke(dir: &str, lang: &str, result: &final_merge::FinalMergeResult) {
    let txt = pra_cli_rs::txt_writer::convert_md_to_txt(&result.final_review_md, lang);
    let txt_path = fixture_dir(dir)
        .join("outputs")
        .join("final")
        .join("final_review.txt");
    let expected_txt = fs::read_to_string(&txt_path)
        .unwrap_or_else(|e| panic!("Cannot read {}: {}", txt_path.display(), e))
        .replace("\r\n", "\n");
    assert_eq!(txt, expected_txt, "final_review.txt mismatch for {dir}");

    // DOCX: verify our generated DOCX is valid (can be opened as ZIP)
    let docx_bytes = pra_cli_rs::docx_writer::convert_md_to_docx(&result.final_review_md, lang);
    let cursor = std::io::Cursor::new(&docx_bytes);
    let mut zip = zip::ZipArchive::new(cursor).expect("Generated DOCX should be valid ZIP");
    assert!(
        zip.by_name("word/document.xml").is_ok(),
        "Generated DOCX should contain word/document.xml for {dir}"
    );
}

#[test]
fn final_merge_structure_only() {
    let dir = "structure_only";
    assert_final_merge_match(dir, "en");
}

#[test]
fn final_merge_structure_only_ja() {
    let dir = "structure_only_ja";
    assert_final_merge_match(dir, "ja");
}

#[test]
fn final_merge_all_checks() {
    let dir = "all_checks";
    assert_final_merge_match(dir, "en");
    // TXT/DOCX smoke test on representative scenario
    let proj = fixture_dir(dir);
    let result = final_merge::final_merge(&proj, "en", "2024-01-01T00:00:00+09:00").unwrap();
    assert_txt_smoke(dir, "en", &result);
}

#[test]
fn final_merge_all_checks_ja() {
    let dir = "all_checks_ja";
    assert_final_merge_match(dir, "ja");
    // TXT/DOCX smoke test on Japanese scenario
    let proj = fixture_dir(dir);
    let result = final_merge::final_merge(&proj, "ja", "2024-01-01T00:00:00+09:00").unwrap();
    assert_txt_smoke(dir, "ja", &result);
}

#[test]
fn final_merge_no_comments() {
    let dir = "no_comments";
    assert_final_merge_match(dir, "en");
}

#[test]
fn final_merge_with_conflicts() {
    let dir = "with_conflicts";
    assert_final_merge_match(dir, "en");
}

#[test]
fn final_merge_with_external_eval() {
    let dir = "with_external_eval";
    assert_final_merge_match(dir, "en");
}
