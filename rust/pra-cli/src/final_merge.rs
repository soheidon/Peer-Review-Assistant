/// Final merge / review document generation.
///
/// Port of `python/peer_review_assistant/output/final.py`.
///
/// Commit 8a: data loading helpers — reads merged.section.json,
/// selection, external_check, reevaluation, and other ancillary files
/// that final_merge() consumes.

use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};

/// The six check types used across the application.
pub const CHECK_NAMES: [&str; 6] = [
    "structure",
    "expression",
    "methods_stats",
    "logic_argument",
    "figure_table",
    "ethics",
];

// ── Data types ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct ReviewComments {
    pub verdict: Option<String>,
    pub reasoning: Option<String>,
    pub strengths: Option<String>,
    pub concerns: Option<String>,
}

#[derive(Debug, Clone)]
pub struct LineNumbers {
    pub by_comment: HashMap<String, u64>,
    pub by_paragraph: HashMap<u64, u64>,
}

// ── File path helpers ───────────────────────────────────────────────────

fn outputs_dir(proj: &Path) -> PathBuf {
    proj.join("outputs")
}

fn check_dir(proj: &Path, check_name: &str) -> PathBuf {
    outputs_dir(proj).join(check_name)
}

fn final_data_dir(proj: &Path) -> PathBuf {
    outputs_dir(proj).join("final").join("_data")
}

/// Read a JSON file from `outputs/<check>/<filename>`. Returns None if missing.
fn read_check_json(proj: &Path, check_name: &str, filename: &str) -> Option<Value> {
    let path = check_dir(proj, check_name).join(filename);
    read_json_file(&path)
}

/// Read JSON from any path. Returns None if missing or unparseable.
fn read_json_file(path: &Path) -> Option<Value> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

// ── Loader functions ────────────────────────────────────────────────────

/// Load merged.section.json for a check. Returns None if the file doesn't exist.
pub fn load_merged(proj: &Path, check_name: &str) -> Option<Value> {
    read_check_json(proj, check_name, "merged.section.json")
}

/// Load selection.json for a check. Returns a set of selected comment IDs,
/// or None if no selection file exists or the set is empty.
///
/// Python: if selected_ids is empty list, return None (treat as explicit "select none").
pub fn load_selection(proj: &Path, check_name: &str) -> Option<HashSet<String>> {
    let data = read_check_json(proj, check_name, "selection.json")?;
    let ids: Vec<String> = data
        .get("selected_ids")?
        .as_array()?
        .iter()
        .filter_map(|v| v.as_str().map(String::from))
        .collect();
    if ids.is_empty() {
        None
    } else {
        Some(ids.into_iter().collect())
    }
}

/// Load external_check.json. Returns a map of comment_id → verdict info, or None.
pub fn load_external_check(proj: &Path, check_name: &str) -> Option<HashMap<String, Value>> {
    let data = read_check_json(proj, check_name, "external_check.json")?;
    let verdicts = data.get("verdicts")?.as_array()?;
    if verdicts.is_empty() {
        return None;
    }
    let mut map = HashMap::new();
    for v in verdicts {
        if let Some(cid) = v.get("comment_id").and_then(|c| c.as_str()) {
            map.insert(cid.to_string(), v.clone());
        }
    }
    if map.is_empty() { None } else { Some(map) }
}

/// Load reevaluation.json. Returns a map of comment_id → verdict info, or None.
pub fn load_reevaluation(proj: &Path, check_name: &str) -> Option<HashMap<String, Value>> {
    let data = read_check_json(proj, check_name, "reevaluation.json")?;
    let verdicts = data.get("verdicts")?.as_array()?;
    if verdicts.is_empty() {
        return None;
    }
    let mut map = HashMap::new();
    for v in verdicts {
        if let Some(cid) = v.get("comment_id").and_then(|c| c.as_str()) {
            map.insert(cid.to_string(), v.clone());
        }
    }
    if map.is_empty() { None } else { Some(map) }
}

/// Load comment_card_checked.json. Returns a set of checked comment IDs.
///
/// Key format: "source::comment_id" → bool.  Extracts comment_id part
/// for keys whose source starts with "check_" or is "novelty_achievement"
/// and whose value is true.
pub fn load_checked_comment_ids(proj: &Path) -> Option<HashSet<String>> {
    let path = final_data_dir(proj).join("comment_card_checked.json");
    let data: Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    let obj = data.as_object()?;
    let mut ids = HashSet::new();
    for (key, val) in obj {
        if !val.as_bool().unwrap_or(false) {
            continue;
        }
        if let Some((source, cid)) = key.split_once("::") {
            if source.starts_with("check_") || source == "novelty_achievement" {
                ids.insert(cid.to_string());
            }
        }
    }
    if ids.is_empty() { None } else { Some(ids) }
}

/// Load verdict section check states from comment_card_checked.json.
///
/// Keys like "verdict::reasoning" → bool.  Defaults to true for any key not found.
/// Returns empty map if the file doesn't exist.
pub fn load_verdict_checks(proj: &Path) -> HashMap<String, bool> {
    let path = final_data_dir(proj).join("comment_card_checked.json");
    let data: Value = match fs::read_to_string(&path).ok().and_then(|s| serde_json::from_str(&s).ok()) {
        Some(v) => v,
        None => return HashMap::new(),
    };
    let obj = match data.as_object() {
        Some(o) => o,
        None => return HashMap::new(),
    };
    let mut checks = HashMap::new();
    for (key, val) in obj {
        if let Some(sub) = key.strip_prefix("verdict::") {
            checks.insert(sub.to_string(), val.as_bool().unwrap_or(false));
        }
    }
    checks
}

/// Load user's verdict from confidence_distribution.json.
pub fn load_user_verdict(proj: &Path) -> Option<HashMap<String, String>> {
    let path = final_data_dir(proj).join("confidence_distribution.json");
    let data: Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    let selected = data.get("selectedVerdict")?.as_str()?;
    let map: HashMap<&str, (&str, &str)> = HashMap::from([
        ("Ready for Submission", ("Ready for Submission", "投稿可能")),
        ("Ready with Minor Changes", ("Ready with Minor Changes", "軽微な修正で投稿可能")),
        ("Needs Revision Before Submission", ("Needs Revision Before Submission", "投稿前に修正が必要")),
        ("Major Rework Recommended", ("Major Rework Recommended", "大幅な改訂を推奨")),
    ]);
    map.get(selected).map(|(en, ja)| {
        let mut m = HashMap::new();
        m.insert("level_en".into(), en.to_string());
        m.insert("level_ja".into(), ja.to_string());
        m
    })
}

/// Load and parse Review_comments.md for the given language.
pub fn load_review_comments(proj: &Path, lang: &str) -> Option<ReviewComments> {
    let path = final_data_dir(proj).join("Review_comments.md");
    let content = fs::read_to_string(path).ok()?;
    let mut rc = ReviewComments {
        verdict: None,
        reasoning: None,
        strengths: None,
        concerns: None,
    };

    if lang == "en" {
        rc.verdict = extract_md_section_regex(&content, r##"## Verdict\s*\n\s*\*\*Verdict:\s*(.+?)\*\*"##);
        rc.reasoning = extract_md_section_body(&content, "## Reasoning");
        rc.strengths = extract_md_section_body_until(&content, "## Key Strengths", "## Key Concerns");
        rc.concerns = extract_md_section_body_to_end(&content, "## Key Concerns", "---");
    } else {
        rc.verdict = extract_md_section_regex(&content, r"## 判定\s*\n\s*\*\*判定:\s*(.+?)\*\*");
        rc.reasoning = extract_md_section_body_until(&content, "## 理由", "## 主な強み");
        rc.strengths = extract_md_section_body_until(&content, "## 主な強み", "## 主な懸念");
        rc.concerns = extract_md_section_body_to_end(&content, "## 主な懸念", "---");
    }

    // If nothing was extracted, return None
    if rc.verdict.is_none()
        && rc.reasoning.is_none()
        && rc.strengths.is_none()
        && rc.concerns.is_none()
    {
        return None;
    }
    Some(rc)
}

/// Extract first capture group from a regex match.
fn extract_md_section_regex(content: &str, pattern: &str) -> Option<String> {
    let re = regex::Regex::new(pattern).ok()?;
    re.captures(content)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().trim().to_string())
}

/// Extract body text under a markdown heading, bounded by the next heading or end.
fn extract_md_section_body(content: &str, heading: &str) -> Option<String> {
    let idx = content.find(heading)?;
    let start = idx + heading.len();
    let rest = &content[start..];
    // Find next "## " heading
    let end = rest.find("\n## ").unwrap_or(rest.len());
    let body = rest[..end].trim();
    if body.is_empty() { None } else { Some(body.to_string()) }
}

/// Extract body text between two headings.
fn extract_md_section_body_until(content: &str, heading: &str, next_heading: &str) -> Option<String> {
    let idx = content.find(heading)?;
    let start = idx + heading.len();
    let rest = &content[start..];
    let end = rest.find(next_heading).unwrap_or(rest.len());
    let body = rest[..end].trim();
    if body.is_empty() { None } else { Some(body.to_string()) }
}

/// Extract body text from a heading to a separator.
fn extract_md_section_body_to_end(content: &str, heading: &str, separator: &str) -> Option<String> {
    let idx = content.find(heading)?;
    let start = idx + heading.len();
    let rest = &content[start..];
    let end = rest.find(separator).unwrap_or(rest.len());
    let body = rest[..end].trim();
    if body.is_empty() { None } else { Some(body.to_string()) }
}

/// Load overall_assessment.md for the given language.
pub fn load_overall_assessment(proj: &Path, lang: &str) -> Option<String> {
    let path = final_data_dir(proj).join("overall_assessment.md");
    let content = fs::read_to_string(path).ok()?;

    if lang == "en" {
        let marker = "# General Impressions";
        let idx = content.find(marker)?;
        let text = content[idx + marker.len()..].trim();
        if text.is_empty() { None } else { Some(text.to_string()) }
    } else {
        // Japanese: between "# 全体所感" and "---" / "# General Impressions"
        let mut lines = content.lines();
        let mut in_assessment = false;
        let mut assessment_lines: Vec<&str> = Vec::new();
        while let Some(line) = lines.next() {
            if line.starts_with("# 全体所感") {
                in_assessment = true;
                continue;
            }
            if in_assessment {
                if line.starts_with("---") || line.starts_with("# General Impressions") {
                    break;
                }
                assessment_lines.push(line);
            }
        }
        let text = assessment_lines.join("\n").trim().to_string();
        if text.is_empty() { None } else { Some(text) }
    }
}

/// Load PDF line number mappings.
pub fn load_line_numbers(proj: &Path) -> Option<LineNumbers> {
    let path = proj.join("lines").join("paragraph_line_map.json");
    let data: Value = serde_json::from_str(&fs::read_to_string(path).ok()?).ok()?;
    let by_comment: HashMap<String, u64> = data
        .get("comment_line_map")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| v.as_u64().map(|n| (k.clone(), n)))
                .collect()
        })
        .unwrap_or_default();
    let by_paragraph: HashMap<u64, u64> = data
        .get("mapping")
        .and_then(|v| v.as_object())
        .map(|obj| {
            obj.iter()
                .filter_map(|(k, v)| {
                    k.parse::<u64>().ok().and_then(|n| v.as_u64().map(|m| (n, m)))
                })
                .collect()
        })
        .unwrap_or_default();

    if by_comment.is_empty() && by_paragraph.is_empty() {
        return None;
    }
    Some(LineNumbers { by_comment, by_paragraph })
}

/// Load comments_to_authors.md bilingual data and build English→Japanese map.
pub fn load_comments_to_authors_jp(proj: &Path) -> Option<HashMap<String, String>> {
    let path = final_data_dir(proj).join("comments_to_authors.md");
    let content = fs::read_to_string(path).ok()?;

    // Find the separator between JA and EN sections
    let sep = "\n\n---\n\n";
    let sep_idx = content.find(sep)?;
    let ja_part = &content[..sep_idx].trim();
    let en_part = content[sep_idx + sep.len()..].trim();

    // Check Japanese section exists
    if !(ja_part.starts_with("# 著者へのコメント")
        || ja_part.starts_with("# 査読コメント")
        || ja_part.starts_with("# 修正提案"))
    {
        return None;
    }

    let ja_items = parse_comment_items(ja_part);
    let en_items = parse_comment_items(en_part);
    if ja_items.is_empty() || en_items.is_empty() {
        return None;
    }

    let mut map = HashMap::new();
    for (en_text, jp_text) in en_items.iter().zip(ja_items.iter()) {
        let en_stripped = en_text.trim();
        if !en_stripped.is_empty() {
            map.insert(en_stripped.to_string(), jp_text.trim().to_string());
        }
    }
    if map.is_empty() { None } else { Some(map) }
}

/// Parse `### N. heading` + body items from a bilingual markdown section.
fn parse_comment_items(text: &str) -> Vec<String> {
    let re = regex::Regex::new(r"^###\s+\d+\.\s+.+$").unwrap();
    let mut items = Vec::new();
    let mut starts: Vec<usize> = Vec::new();
    for cap in re.find_iter(text) {
        starts.push(cap.end());
    }
    for i in 0..starts.len() {
        let begin = starts[i];
        let end = if i + 1 < starts.len() {
            starts[i + 1] - 1 // backtrack before the next heading's newline
        } else {
            text.len()
        };
        let body = text[begin..end].trim();
        // Remove trailing separator
        let body = body.trim_end_matches("---").trim();
        if !body.is_empty() {
            items.push(body.to_string());
        }
    }
    items
}

/// Load abstract text from sections/abstract.txt.
pub fn load_abstract_text(proj: &Path) -> Option<String> {
    let path = proj.join("sections").join("abstract.txt");
    let text = fs::read_to_string(path).ok()?;
    let trimmed = text.trim();
    if trimmed.is_empty() { None } else { Some(trimmed.to_string()) }
}

// ── Translation table ───────────────────────────────────────────────────

use std::sync::OnceLock;

type TranslationEntry = (&'static str, &'static str); // (en, ja)

fn translation_table() -> &'static HashMap<&'static str, TranslationEntry> {
    static T: OnceLock<HashMap<&str, TranslationEntry>> = OnceLock::new();
    T.get_or_init(|| {
        HashMap::from([
            ("general_assessment", ("General Assessment", "総合評価")),
            ("verdict", ("Submission Readiness", "投稿準備状況")),
            ("verdict_label", ("Readiness", "準備状況")),
            ("key_strengths", ("Key Strengths", "主な強み")),
            ("key_concerns", ("Key Concerns", "主な懸念")),
            ("general_impressions", ("General Impressions", "全体所感")),
            ("structure", ("Structure", "構造")),
            ("expression", ("Expression", "表現")),
            ("methods_stats", ("Methods and Statistics", "方法と統計")),
            ("logic_argument", ("Logic and Argument", "論理と議論")),
            ("figure_table", ("Figures and Tables", "図表")),
            ("ethics", ("Ethics and Conflict of Interest", "倫理と利益相反")),
            ("recommendation_major", ("Needs Major Revision", "大幅修正が必要")),
            ("recommendation_minor", ("Minor Improvements Suggested", "軽微な改善を提案")),
            ("issue", ("Suggestion", "改善提案")),
            ("no_issues", ("No issues were identified.", "問題は見つかりませんでした。")),
            ("no_structural", ("No structural issues were identified.", "構造上の問題は見つかりませんでした。")),
            ("no_ms", ("No methods/statistics issues were identified.", "方法・統計上の問題は見つかりませんでした。")),
            ("no_la", ("No logic/argument issues were identified.", "論理・議論上の問題は見つかりませんでした。")),
            ("no_ft", ("No figure/table issues were identified.", "図表上の問題は見つかりませんでした。")),
            ("no_ethics", ("No ethics or conflict of interest issues were identified.", "倫理・利益相反上の問題は見つかりませんでした。")),
            ("not_assessed_expression",
                ("Expression and language quality was not assessed in this run. Run expression check to include language quality comments.",
                 "表現と言語の品質は今回評価されていません。表現チェックを実行すると言語品質のコメントが含まれます。")),
            ("not_assessed_ms",
                ("Methods and statistical quality was not assessed in this run. Run methods_stats check to include methodological quality comments.",
                 "方法と統計の品質は今回評価されていません。methods_statsチェックを実行すると方法論的品質のコメントが含まれます。")),
            ("not_assessed_la",
                ("Logic and argument quality was not assessed in this run. Run logic_argument check to include logical quality comments.",
                 "論理と議論の品質は今回評価されていません。logic_argumentチェックを実行すると論理的品質のコメントが含まれます。")),
            ("not_assessed_ft",
                ("Figure and table quality was not assessed in this run. Run figure_table check to include figure/table quality comments.",
                 "図表の品質は今回評価されていません。figure_tableチェックを実行すると図表品質のコメントが含まれます。")),
            ("not_assessed_ethics",
                ("Ethics and conflict of interest were not assessed in this run. Run ethics check to include ethics/COI comments.",
                 "倫理と利益相反は今回評価されていません。ethicsチェックを実行すると倫理・COIのコメントが含まれます。")),
        ])
    })
}

/// Look up a translation key for the given language.
/// Falls back to "en" if the requested language is missing, then to the raw key.
pub fn t(key: &str, lang: &str) -> String {
    let entry = translation_table().get(key);
    match entry {
        Some((en, _)) if lang == "en" => en.to_string(),
        Some((_, ja)) if lang == "ja" => ja.to_string(),
        Some((en, _)) => en.to_string(),
        None => key.to_string(),
    }
}

// ── Recommendation ──────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct Recommendation {
    pub level_en: String,
    pub level_ja: String,
    pub rationale: String,
    pub source: String,
}

/// Determine recommendation based on major/minor counts.
/// If `user_verdict` is provided, its level_en/level_ja take precedence
/// over the count-based auto recommendation.
pub fn get_recommendation(
    major_count: usize,
    minor_count: usize,
    user_verdict: Option<&HashMap<String, String>>,
) -> Recommendation {
    let auto = if major_count == 0 && minor_count == 0 {
        Recommendation {
            level_en: "Accept".into(),
            level_ja: "アクセプト".into(),
            rationale: "No significant issues identified across all review dimensions.".into(),
            source: "auto".into(),
        }
    } else if major_count == 0 {
        Recommendation {
            level_en: "Minor Revision".into(),
            level_ja: "軽微修正".into(),
            rationale: format!(
                "{} minor issue(s) identified. The manuscript requires minor revisions before publication.",
                minor_count
            ),
            source: "auto".into(),
        }
    } else if major_count <= 5 {
        Recommendation {
            level_en: "Major Revision".into(),
            level_ja: "大幅修正".into(),
            rationale: format!(
                "{} major and {} minor issue(s) identified. Substantial revisions are required across multiple dimensions.",
                major_count, minor_count
            ),
            source: "auto".into(),
        }
    } else {
        Recommendation {
            level_en: "Reject".into(),
            level_ja: "リジェクト".into(),
            rationale: format!(
                "{} major and {} minor issue(s) identified. The number and severity of issues suggest the manuscript is not suitable for publication in its current form.",
                major_count, minor_count
            ),
            source: "auto".into(),
        }
    };

    if let Some(uv) = user_verdict {
        let auto_en = auto.level_en.clone();
        Recommendation {
            level_en: uv.get("level_en").cloned().unwrap_or(auto.level_en),
            level_ja: uv.get("level_ja").cloned().unwrap_or(auto.level_ja),
            rationale: format!(
                "{} (auto-suggestion was {})",
                auto.rationale, auto_en
            ),
            source: "user".into(),
        }
    } else {
        auto
    }
}

// ── FinalMergeCounts ─────────────────────────────────────────────────────

/// Aggregated comment counts for all checks.
///
/// `total` is the sum of all *prepared* comments across all checks.
/// `major`/`minor` are structure major/minor counts after re-evaluation.
#[derive(Debug, Clone)]
pub struct FinalMergeCounts {
    pub total: usize,
    pub major: usize,
    pub minor: usize,
    pub expression_count: usize,
    pub ms_count: usize,
    pub ms_major: usize,
    pub ms_minor: usize,
    pub la_count: usize,
    pub la_major: usize,
    pub la_minor: usize,
    pub ft_count: usize,
    pub ft_major: usize,
    pub ft_minor: usize,
    pub ethics_count: usize,
    pub ethics_major: usize,
    pub ethics_minor: usize,
}

/// Compute aggregated counts from prepared author-facing comments.
pub fn compute_counts(
    major_auth: &[Value],
    minor_auth: &[Value],
    expression_auth: &[Value],
    ms_auth: &[Value],
    la_auth: &[Value],
    ft_auth: &[Value],
    ethics_auth: &[Value],
) -> FinalMergeCounts {
    let major = major_auth.len();
    let minor = minor_auth.len();

    let expression_count = expression_auth.len();

    let ms_count = ms_auth.len();
    let ms_major = ms_auth
        .iter()
        .filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major"))
        .count();
    let ms_minor = ms_count - ms_major;

    let la_count = la_auth.len();
    let la_major = la_auth
        .iter()
        .filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major"))
        .count();
    let la_minor = la_count - la_major;

    let ft_count = ft_auth.len();
    let ft_major = ft_auth
        .iter()
        .filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major"))
        .count();
    let ft_minor = ft_count - ft_major;

    let ethics_count = ethics_auth.len();
    let ethics_major = ethics_auth
        .iter()
        .filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major"))
        .count();
    let ethics_minor = ethics_count - ethics_major;

    let total = major + minor + expression_count + ms_count + la_count + ft_count + ethics_count;

    FinalMergeCounts {
        total,
        major,
        minor,
        expression_count,
        ms_count,
        ms_major,
        ms_minor,
        la_count,
        la_major,
        la_minor,
        ft_count,
        ft_major,
        ft_minor,
        ethics_count,
        ethics_major,
        ethics_minor,
    }
}

// ── Location formatting ─────────────────────────────────────────────────

/// Format a location dict into a human-readable string.
pub fn format_location(location: Option<&Value>, line_number: Option<u64>) -> String {
    let loc = match location {
        None => return "Unknown location".into(),
        Some(l) => l,
    };
    let section = loc
        .get("section")
        .and_then(|v| v.as_str())
        .unwrap_or("Unknown");
    let p_start = loc.get("paragraph_start").and_then(|v| v.as_u64());
    let p_end = loc.get("paragraph_end").and_then(|v| v.as_u64());

    let mut parts: Vec<String> = Vec::new();
    match (p_start, p_end) {
        (Some(s), Some(e)) if s == e => {
            parts.push(format!("{}, Paragraph {}", section, s));
        }
        (Some(s), Some(e)) => {
            parts.push(format!("{}, Paragraphs {}-{}", section, s, e));
        }
        (Some(s), None) => {
            parts.push(format!("{}, Paragraph {}", section, s));
        }
        _ => {
            parts.push(section.to_string());
        }
    }

    if let Some(ln) = line_number {
        parts.push(format!("Line {}", ln));
    }

    if parts.len() > 1 {
        parts.join(", ")
    } else {
        parts.into_iter().next().unwrap_or_default()
    }
}

// ── Author-facing comment ───────────────────────────────────────────────

/// Get the author-facing text for a comment, considering re-evaluation.
///
/// Returns `None` if the comment is dismissed (external_correct verdict),
/// the re-evaluator's author_comment if provided,
/// or the original issue text as fallback.
pub fn get_author_facing_comment(
    comment: &Value,
    reevaluation: Option<&HashMap<String, Value>>,
) -> Option<String> {
    if let Some(reeval) = reevaluation {
        let cid = comment.get("comment_id").and_then(|v| v.as_str()).unwrap_or("");
        if let Some(rv) = reeval.get(cid) {
            if rv.get("verdict").and_then(|v| v.as_str()) == Some("external_correct") {
                return None;
            }
            if let Some(ac) = rv.get("author_comment").and_then(|v| v.as_str()) {
                if !ac.is_empty() {
                    return Some(ac.to_string());
                }
            }
        }
    }
    comment
        .get("issue")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

// ── Prepare author comments ─────────────────────────────────────────────

/// Filter out dismissed comments and attach `_author_text` to each remaining one.
/// Returns a new Vec of cloned Values (originals are not modified).
pub fn prepare_author_comments(
    comments: &[Value],
    reevaluation: Option<&HashMap<String, Value>>,
) -> Vec<Value> {
    let mut result = Vec::new();
    for c in comments {
        if let Some(author_text) = get_author_facing_comment(c, reevaluation) {
            let mut copy = c.clone();
            if let Some(obj) = copy.as_object_mut() {
                obj.insert(
                    "_author_text".into(),
                    serde_json::Value::String(author_text),
                );
            }
            result.push(copy);
        }
    }
    result
}

/// Filter comments by a set of selected IDs. If selection is None, return all.
pub fn filter_comments(comments: &[Value], selected_ids: Option<&HashSet<String>>) -> Vec<Value> {
    match selected_ids {
        None => comments.to_vec(),
        Some(ids) => comments
            .iter()
            .filter(|c| {
                c.get("comment_id")
                    .and_then(|v| v.as_str())
                    .map(|cid| ids.contains(cid))
                    .unwrap_or(false)
            })
            .cloned()
            .collect(),
    }
}

// ── Comment list rendering ──────────────────────────────────────────────

/// Append numbered comment items to `lines` in-place.
pub fn append_comment_list(
    lines: &mut Vec<String>,
    comments: &[Value],
    section_num: u32,
    start_num: usize,
    line_numbers: Option<&LineNumbers>,
    lang: &str,
    jp_texts: Option<&HashMap<String, String>>,
) {
    for (i, c) in comments.iter().enumerate() {
        let num = start_num + i;

        // Resolve line number
        let line_num = resolve_line_number(c, line_numbers);

        let loc = format_location(c.get("location"), line_num);
        lines.push(format!("### {}.{}. {}", section_num, num, loc));
        lines.push(String::new());

        // Excerpt
        let excerpt = c
            .get("location")
            .and_then(|l| l.get("text_excerpt"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        if !excerpt.is_empty() {
            lines.push(format!("\"{}\"", excerpt));
            lines.push(String::new());
        }

        // Severity line
        let sev = c.get("severity").and_then(|v| v.as_str()).unwrap_or("");
        if !sev.is_empty() {
            let rec_key = if sev == "major" {
                "recommendation_major"
            } else {
                "recommendation_minor"
            };
            lines.push(format!("**Recommendation**: {}", t(rec_key, lang)));
        }
        if !sev.is_empty() {
            lines.push(String::new());
        }

        // Suggestion line
        let mut author_text = c
            .get("_author_text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if lang == "ja" {
            if let Some(jp) = jp_texts.and_then(|m| m.get(author_text.trim())) {
                author_text = jp.clone();
            }
        }
        lines.push(format!("**{}**: {}", t("issue", lang), author_text));
        lines.push(String::new());
    }
}

fn resolve_line_number(comment: &Value, line_numbers: Option<&LineNumbers>) -> Option<u64> {
    let ln = line_numbers?;
    let cid = comment
        .get("comment_id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if let Some(n) = ln.by_comment.get(cid) {
        return Some(*n);
    }
    let p_start = comment
        .get("location")
        .and_then(|l| l.get("paragraph_start"))
        .and_then(|v| v.as_u64());
    if let Some(ps) = p_start {
        if let Some(n) = ln.by_paragraph.get(&ps) {
            return Some(*n);
        }
    }
    None
}

// ── Markdown document generators ────────────────────────────────────────

/// Generate the complete final_review.md (7 sections).
pub fn generate_final_review_md(
    merged: &Value,
    major: &[Value],
    minor: &[Value],
    expression_comments: &[Value],
    ms_comments: &[Value],
    ms_available: bool,
    la_comments: &[Value],
    la_available: bool,
    ft_comments: &[Value],
    ft_available: bool,
    ethics_comments: &[Value],
    ethics_available: bool,
    lang: &str,
    line_numbers: Option<&LineNumbers>,
    overall_assessment: Option<&str>,
    review_comments: Option<&ReviewComments>,
    verdict_checks: &HashMap<String, bool>,
    jp_texts: Option<&HashMap<String, String>>,
) -> String {
    let mut lines: Vec<String> = Vec::new();

    // Section 1: General Assessment
    lines.push(format!("## 1. {}", t("general_assessment", lang)));
    lines.push(String::new());

    // Verdict block (from Review_comments.md)
    if let Some(rc) = review_comments {
        let verdict_text = rc.verdict.as_deref().unwrap_or("");
        let reasoning_text = rc.reasoning.as_deref().unwrap_or("");
        let strengths_text = rc.strengths.as_deref().unwrap_or("");
        let concerns_text = rc.concerns.as_deref().unwrap_or("");

        let show_verdict = verdict_checks.get("verdict").copied().unwrap_or(true) && !verdict_text.is_empty();
        let show_reasoning = verdict_checks.get("reasoning").copied().unwrap_or(true) && !reasoning_text.is_empty();
        let show_strengths = verdict_checks.get("strengths").copied().unwrap_or(true) && !strengths_text.is_empty();
        let show_concerns = verdict_checks.get("concerns").copied().unwrap_or(true) && !concerns_text.is_empty();

        if show_verdict || show_reasoning || show_strengths || show_concerns {
            lines.push(format!("## {}", t("verdict", lang)));
            lines.push(String::new());
            if show_verdict {
                lines.push(format!(
                    "**{}**: {}",
                    t("verdict_label", lang),
                    verdict_text
                ));
                lines.push(String::new());
            }
            if show_reasoning {
                lines.push(reasoning_text.to_string());
                lines.push(String::new());
            }
            if show_strengths {
                lines.push(format!("### {}", t("key_strengths", lang)));
                lines.push(String::new());
                lines.push(strengths_text.to_string());
                lines.push(String::new());
            }
            if show_concerns {
                lines.push(format!("### {}", t("key_concerns", lang)));
                lines.push(String::new());
                lines.push(concerns_text.to_string());
                lines.push(String::new());
            }
        }
    }

    // General impressions / summary
    if let Some(oa) = overall_assessment {
        lines.push(format!("## {}", t("general_impressions", lang)));
        lines.push(String::new());
        lines.push(oa.to_string());
    } else {
        lines.push(
            merged
                .get("summary")
                .and_then(|v| v.as_str())
                .unwrap_or("No assessment available.")
                .to_string(),
        );
    }
    lines.push(String::new());

    // Section 2: Structure
    section_with_comments(
        &mut lines,
        2,
        "structure",
        major,
        minor,
        "no_structural",
        lang,
        line_numbers,
        jp_texts,
    );

    // Section 3: Expression (flat list, no major/minor split)
    lines.push(format!("## 3. {}", t("expression", lang)));
    lines.push(String::new());
    if !expression_comments.is_empty() {
        append_comment_list(
            &mut lines,
            expression_comments,
            3,
            1,
            line_numbers,
            lang,
            jp_texts,
        );
    } else {
        lines.push(t("not_assessed_expression", lang));
        lines.push(String::new());
    }

    // Sections 4-7: conditional three-branch pattern
    conditional_section(
        &mut lines,
        4,
        "methods_stats",
        ms_comments,
        ms_available,
        "no_ms",
        "not_assessed_ms",
        lang,
        line_numbers,
        jp_texts,
    );
    conditional_section(
        &mut lines,
        5,
        "logic_argument",
        la_comments,
        la_available,
        "no_la",
        "not_assessed_la",
        lang,
        line_numbers,
        jp_texts,
    );
    conditional_section(
        &mut lines,
        6,
        "figure_table",
        ft_comments,
        ft_available,
        "no_ft",
        "not_assessed_ft",
        lang,
        line_numbers,
        jp_texts,
    );
    conditional_section(
        &mut lines,
        7,
        "ethics",
        ethics_comments,
        ethics_available,
        "no_ethics",
        "not_assessed_ethics",
        lang,
        line_numbers,
        jp_texts,
    );

    lines.join("\n")
}

/// Render section 2 (structure) with major → minor ordering.
fn section_with_comments(
    lines: &mut Vec<String>,
    section_num: u32,
    check_key: &str,
    major: &[Value],
    minor: &[Value],
    no_key: &str,
    lang: &str,
    line_numbers: Option<&LineNumbers>,
    jp_texts: Option<&HashMap<String, String>>,
) {
    lines.push(format!(
        "## {}. {}",
        section_num,
        t(check_key, lang)
    ));
    lines.push(String::new());
    append_comment_list(lines, major, section_num, 1, line_numbers, lang, jp_texts);
    append_comment_list(
        lines,
        minor,
        section_num,
        major.len() + 1,
        line_numbers,
        lang,
        jp_texts,
    );
    if major.is_empty() && minor.is_empty() {
        lines.push(t(no_key, lang));
        lines.push(String::new());
    }
}

/// Render sections 4-7 with the three-branch pattern:
/// (comments present, available but no comments, not available).
fn conditional_section(
    lines: &mut Vec<String>,
    section_num: u32,
    check_key: &str,
    comments: &[Value],
    available: bool,
    no_key: &str,
    not_assessed_key: &str,
    lang: &str,
    line_numbers: Option<&LineNumbers>,
    jp_texts: Option<&HashMap<String, String>>,
) {
    lines.push(format!(
        "## {}. {}",
        section_num,
        t(check_key, lang)
    ));
    lines.push(String::new());

    if available && !comments.is_empty() {
        let major: Vec<Value> = comments
            .iter()
            .filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major"))
            .cloned()
            .collect();
        let minor: Vec<Value> = comments
            .iter()
            .filter(|c| c.get("severity").and_then(|v| v.as_str()) != Some("major"))
            .cloned()
            .collect();
        append_comment_list(lines, &major, section_num, 1, line_numbers, lang, jp_texts);
        append_comment_list(
            lines,
            &minor,
            section_num,
            major.len() + 1,
            line_numbers,
            lang,
            jp_texts,
        );
        if major.is_empty() && minor.is_empty() {
            lines.push(t(no_key, lang));
            lines.push(String::new());
        }
    } else if available {
        // available but no comments → no_* message
        lines.push(t(no_key, lang));
        lines.push(String::new());
    } else {
        lines.push(t(not_assessed_key, lang));
        lines.push(String::new());
    }
}

/// Generate comments_to_authors.md — author-facing only.
pub fn generate_comments_to_authors_md(
    major: &[Value],
    minor: &[Value],
    expression_comments: &[Value],
    ms_comments: &[Value],
    la_comments: &[Value],
    ft_comments: &[Value],
    ethics_comments: &[Value],
    structure_re: Option<&HashMap<String, Value>>,
    expression_re: Option<&HashMap<String, Value>>,
    methods_stats_re: Option<&HashMap<String, Value>>,
    logic_argument_re: Option<&HashMap<String, Value>>,
    figure_table_re: Option<&HashMap<String, Value>>,
    ethics_re: Option<&HashMap<String, Value>>,
) -> String {
    let mut lines = vec!["# Fix Suggestions".to_string(), String::new()];

    let all_comments: Vec<&Value> = major
        .iter()
        .chain(minor)
        .chain(expression_comments)
        .chain(ms_comments)
        .chain(la_comments)
        .chain(ft_comments)
        .chain(ethics_comments)
        .collect();

    let mut idx = 0usize;
    for c in all_comments {
        let cid = c.get("comment_id").and_then(|v| v.as_str()).unwrap_or("");
        let re_ = pick_re(cid, structure_re, expression_re, methods_stats_re, logic_argument_re, figure_table_re, ethics_re);
        let author_text = get_author_facing_comment(c, re_);
        if author_text.is_none() {
            continue;
        }
        idx += 1;
        let loc = format_location(c.get("location"), None);
        let category = c
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("Structure");
        lines.push(format!("### {}. {} / {}", idx, category, loc));
        lines.push(String::new());
        lines.push(author_text.unwrap());
        lines.push(String::new());
    }

    if idx == 0 {
        lines.push(
            "No comments were generated. "
                .to_string()
                + "Please see the full review for context.",
        );
    }

    lines.join("\n")
}

/// Pick the reevaluation dict that matches the comment_id prefix.
fn pick_re<'a>(
    comment_id: &str,
    structure_re: Option<&'a HashMap<String, Value>>,
    expression_re: Option<&'a HashMap<String, Value>>,
    methods_stats_re: Option<&'a HashMap<String, Value>>,
    logic_argument_re: Option<&'a HashMap<String, Value>>,
    figure_table_re: Option<&'a HashMap<String, Value>>,
    ethics_re: Option<&'a HashMap<String, Value>>,
) -> Option<&'a HashMap<String, Value>> {
    if comment_id.starts_with("structure_") {
        structure_re
    } else if comment_id.starts_with("expression_") {
        expression_re
    } else if comment_id.starts_with("methods_stats_") {
        methods_stats_re
    } else if comment_id.starts_with("logic_argument_") {
        logic_argument_re
    } else if comment_id.starts_with("figure_table_") {
        figure_table_re
    } else if comment_id.starts_with("ethics_") {
        ethics_re
    } else {
        None
    }
}

/// Generate confidential_comments_to_editor.md.
pub fn generate_confidential_comments_md(
    expression_available: bool,
    ms_available: bool,
    la_available: bool,
    ft_available: bool,
    ethics_available: bool,
) -> String {
    let mut scope_lines: Vec<String> = vec![
        "**Scope of this review:**".into(),
        "- Structure and organization of the manuscript".into(),
        "- IMRaD compliance (Introduction, Methods, Results, Discussion)".into(),
        "- Section completeness and logical flow".into(),
    ];
    let mut not_assessed: Vec<String> = vec![
        "- Citation accuracy and completeness".into(),
        "- Originality and overlap with existing literature".into(),
    ];

    let checks = [
        (expression_available, "- Expression quality and language"),
        (ms_available, "- Methods and statistical methodology"),
        (la_available, "- Logic and argument quality"),
        (ft_available, "- Figure and table quality"),
        (ethics_available, "- Ethics and conflict of interest"),
    ];
    for (avail, item) in checks {
        if avail {
            scope_lines.push(item.into());
        } else {
            not_assessed.push(item.into());
        }
    }

    let mut parts = vec![
        "# Submission Readiness Summary".to_string(),
        String::new(),
        "This report was generated using automated analysis via \
         the Academic Paper Checker. The assessment was performed by \
         independent LLM checkers."
            .to_string(),
        String::new(),
    ];
    parts.extend(scope_lines);
    parts.push(String::new());
    parts.push("**Not assessed in this run:**".into());
    parts.extend(not_assessed);
    parts.push(String::new());
    parts.push(
        "The author should review all findings and make their own \
         judgment about revisions before submission."
            .to_string(),
    );
    parts.push(String::new());
    parts.push(
        "**Checker confidence**: Overall confidence varies by finding; see \
         individual items in the main report for per-item confidence \
         levels."
            .to_string(),
    );
    parts.push(String::new());

    parts.join("\n")
}

/// Generate recommendation.md with verdict and counts.
pub fn generate_recommendation_md(
    major_count: usize,
    minor_count: usize,
    total_count: usize,
    expression_count: usize,
    expression_available: bool,
    ms_count: usize,
    ms_major_count: usize,
    ms_available: bool,
    la_count: usize,
    la_major_count: usize,
    la_available: bool,
    ft_count: usize,
    ft_major_count: usize,
    ft_available: bool,
    ethics_count: usize,
    ethics_major_count: usize,
    ethics_available: bool,
    user_verdict: Option<&HashMap<String, String>>,
) -> String {
    let total_major = major_count + ms_major_count + la_major_count + ft_major_count + ethics_major_count;
    let rec = get_recommendation(total_major, minor_count, user_verdict);

    let mut checks: Vec<&str> = vec!["structure"];
    if expression_available {
        checks.push("expression");
    }
    if ms_available {
        checks.push("methods_stats");
    }
    if la_available {
        checks.push("logic_argument");
    }
    if ft_available {
        checks.push("figure_table");
    }
    if ethics_available {
        checks.push("ethics");
    }

    let mut lines = vec![
        "# Submission Readiness Assessment".to_string(),
        String::new(),
        format!("**評価 / Assessment**: {} ({})", rec.level_ja, rec.level_en),
        String::new(),
        format!("**根拠 / Basis**: {}", rec.rationale),
        String::new(),
        format!(
            "This assessment is based on {} finding(s) from {} check(s):",
            total_count,
            checks.join(", ")
        ),
        format!("- {} major issue(s) (structure)", major_count),
        format!("- {} minor issue(s) (structure)", minor_count),
    ];

    if expression_available {
        lines.push(format!(
            "- {} minor issue(s) (expression)",
            expression_count
        ));
    }
    if ms_available {
        lines.push(format!(
            "- {} issue(s) (methods/stats: {} major)",
            ms_count, ms_major_count
        ));
    }
    if la_available {
        lines.push(format!(
            "- {} issue(s) (logic/argument: {} major)",
            la_count, la_major_count
        ));
    }
    if ft_available {
        lines.push(format!(
            "- {} issue(s) (figures/tables: {} major)",
            ft_count, ft_major_count
        ));
    }
    if ethics_available {
        lines.push(format!(
            "- {} issue(s) (ethics/COI: {} major)",
            ethics_count, ethics_major_count
        ));
    }

    lines.push(String::new());
    lines.push(
        "**Note**: This is a preliminary automated assessment. \
         The author should review all findings and exercise their own judgment."
            .to_string(),
    );
    lines.push(String::new());

    if total_count == 0 {
        lines.push(
            "No issues were identified. A complete assessment \
             requires running the full set of check items (expression, \
             methods, citations, originality)."
                .to_string(),
        );
        lines.push(String::new());
    }

    lines.join("\n")
}

// ── Audit trail ───────────────────────────────────────────────────────────

/// Build the audit_trail.json data structure.
///
/// `merged` is the raw structure merged.section.json (before re-evaluation).
/// `counts` provides per-check comment counts from prepared comments.
/// `generated_at` should be an ISO 8601 timestamp with timezone (JST).
pub fn build_audit_trail(
    merged: &Value,
    counts: &FinalMergeCounts,
    recommendation: &Recommendation,
    abstract_available: bool,
    expression_available: bool,
    ms_available: bool,
    la_available: bool,
    ft_available: bool,
    ethics_available: bool,
    ec_disagree_total: usize,
    ec_disagree_structure: usize,
    ec_disagree_expression: usize,
    ec_disagree_ms: usize,
    ec_disagree_la: usize,
    generated_at: &str,
) -> Value {
    let mut assessed: Vec<Value> = vec![Value::String("structure".into())];
    let mut not_assessed: Vec<Value> = vec![
        Value::String("citation".into()),
        Value::String("originality".into()),
    ];
    let mut inputs = serde_json::Map::new();
    inputs.insert(
        "merged_structure".into(),
        Value::String("outputs/structure/merged.section.json".into()),
    );
    inputs.insert(
        "abstract_available".into(),
        Value::Bool(abstract_available),
    );

    if expression_available {
        assessed.push(Value::String("expression".into()));
        inputs.insert(
            "merged_expression".into(),
            Value::String("outputs/expression/merged.section.json".into()),
        );
    } else {
        not_assessed.push(Value::String("expression".into()));
    }
    if ms_available {
        assessed.push(Value::String("methods_stats".into()));
        inputs.insert(
            "merged_methods_stats".into(),
            Value::String("outputs/methods_stats/merged.section.json".into()),
        );
    } else {
        not_assessed.push(Value::String("methods_stats".into()));
    }
    if la_available {
        assessed.push(Value::String("logic_argument".into()));
        inputs.insert(
            "merged_logic_argument".into(),
            Value::String("outputs/logic_argument/merged.section.json".into()),
        );
    } else {
        not_assessed.push(Value::String("logic_argument".into()));
    }
    if ft_available {
        assessed.push(Value::String("figure_table".into()));
        inputs.insert(
            "merged_figure_table".into(),
            Value::String("outputs/figure_table/merged.section.json".into()),
        );
    } else {
        not_assessed.push(Value::String("figure_table".into()));
    }
    if ethics_available {
        assessed.push(Value::String("ethics".into()));
        inputs.insert(
            "merged_ethics".into(),
            Value::String("outputs/ethics/merged.section.json".into()),
        );
    } else {
        not_assessed.push(Value::String("ethics".into()));
    }

    // total = raw structure comments + prepared per-check counts (Python behaviour)
    let raw_structure_count = merged
        .get("comments")
        .and_then(|v| v.as_array())
        .map(|a| a.len())
        .unwrap_or(0);
    let total = raw_structure_count
        + counts.expression_count
        + counts.ms_count
        + counts.la_count
        + counts.ft_count
        + counts.ethics_count;

    let mut comment_counts = serde_json::Map::new();
    comment_counts.insert("total".into(), Value::Number(total.into()));
    comment_counts.insert("major".into(), Value::Number(counts.major.into()));
    comment_counts.insert("minor".into(), Value::Number(counts.minor.into()));
    if expression_available {
        comment_counts.insert("structure_minor".into(), Value::Number(counts.minor.into()));
        comment_counts.insert(
            "expression_minor".into(),
            Value::Number(counts.expression_count.into()),
        );
    }
    if ms_available {
        comment_counts.insert("structure_minor".into(), Value::Number(counts.minor.into()));
        comment_counts.insert(
            "expression_minor".into(),
            Value::Number(counts.expression_count.into()),
        );
        comment_counts.insert("ms_count".into(), Value::Number(counts.ms_count.into()));
        comment_counts.insert("ms_major".into(), Value::Number(counts.ms_major.into()));
        comment_counts.insert("ms_minor".into(), Value::Number(counts.ms_minor.into()));
    }
    if la_available {
        comment_counts.insert("la_count".into(), Value::Number(counts.la_count.into()));
        comment_counts.insert("la_major".into(), Value::Number(counts.la_major.into()));
        comment_counts.insert("la_minor".into(), Value::Number(counts.la_minor.into()));
    }
    if ft_available {
        comment_counts.insert("ft_count".into(), Value::Number(counts.ft_count.into()));
        comment_counts.insert("ft_major".into(), Value::Number(counts.ft_major.into()));
        comment_counts.insert("ft_minor".into(), Value::Number(counts.ft_minor.into()));
    }
    if ethics_available {
        comment_counts.insert(
            "ethics_count".into(),
            Value::Number(counts.ethics_count.into()),
        );
        comment_counts.insert(
            "ethics_major".into(),
            Value::Number(counts.ethics_major.into()),
        );
        comment_counts.insert(
            "ethics_minor".into(),
            Value::Number(counts.ethics_minor.into()),
        );
    }

    // Phase determination
    let (phase, description) = if expression_available && ms_available && la_available && ft_available
    {
        (
            "9E",
            "Final review generation with structure, expression, \
             methods_stats, logic_argument, and figure_table checks",
        )
    } else if expression_available && ms_available && la_available {
        (
            "9D",
            "Final review generation with structure, expression, \
             methods_stats, and logic_argument checks",
        )
    } else if expression_available && ms_available {
        (
            "9C",
            "Final review generation with structure, expression, \
             and methods_stats checks",
        )
    } else if expression_available {
        (
            "9B",
            "Final review generation with structure and expression checks",
        )
    } else if ms_available {
        (
            "9C",
            "Final review generation with structure and methods_stats checks",
        )
    } else {
        ("9A", "Structure-only final review generation")
    };

    // external_check: null when total=0, detailed object otherwise
    let external_check = if ec_disagree_total > 0 {
        let mut ec = serde_json::Map::new();
        ec.insert(
            "disagree_excluded_total".into(),
            Value::Number(ec_disagree_total.into()),
        );
        ec.insert(
            "disagree_structure".into(),
            Value::Number(ec_disagree_structure.into()),
        );
        ec.insert(
            "disagree_expression".into(),
            Value::Number(ec_disagree_expression.into()),
        );
        ec.insert(
            "disagree_methods_stats".into(),
            Value::Number(ec_disagree_ms.into()),
        );
        ec.insert(
            "disagree_logic_argument".into(),
            Value::Number(ec_disagree_la.into()),
        );
        Value::Object(ec)
    } else {
        Value::Null
    };

    let mut rec_obj = serde_json::Map::new();
    rec_obj.insert(
        "level_en".into(),
        Value::String(recommendation.level_en.clone()),
    );
    rec_obj.insert(
        "level_ja".into(),
        Value::String(recommendation.level_ja.clone()),
    );
    rec_obj.insert(
        "rationale".into(),
        Value::String(recommendation.rationale.clone()),
    );
    rec_obj.insert(
        "source".into(),
        Value::String(recommendation.source.clone()),
    );

    let mut root = serde_json::Map::new();
    root.insert(
        "generated_at".into(),
        Value::String(generated_at.to_string()),
    );
    root.insert("phase".into(), Value::String(phase.to_string()));
    root.insert("description".into(), Value::String(description.to_string()));
    root.insert("inputs".into(), Value::Object(inputs));
    root.insert("check_items_assessed".into(), Value::Array(assessed));
    root.insert(
        "check_items_not_assessed".into(),
        Value::Array(not_assessed),
    );
    root.insert("comment_counts".into(), Value::Object(comment_counts));
    root.insert("external_check".into(), external_check);
    root.insert("recommendation".into(), Value::Object(rec_obj));
    root.insert(
        "output_files".into(),
        Value::Array(vec![
            Value::String("outputs/final/final_review.md".into()),
            Value::String("outputs/final/_data/comments_to_authors.md".into()),
            Value::String(
                "outputs/final/_data/confidential_comments_to_editor.md".into(),
            ),
            Value::String("outputs/final/_data/recommendation.md".into()),
            Value::String("outputs/final/_data/audit_trail.json".into()),
        ]),
    );

    Value::Object(root)
}

// ── Final merge orchestrator ──────────────────────────────────────────────

/// The result of a `final_merge()` run.
///
/// Contains all generated Markdown content and metadata.
/// DOCX/TXT are NOT included — the CLI layer generates those via
/// `docx_writer::convert_md_to_docx` / `txt_writer::convert_md_to_txt`.
pub struct FinalMergeResult {
    pub final_review_md: String,
    pub comments_to_authors_md: String,
    pub confidential_comments_md: String,
    pub recommendation_md: String,
    pub audit_trail: Value,
    pub recommendation: Recommendation,
    pub total_comments: usize,
    pub major_count: usize,
    pub minor_count: usize,
}

/// Run the full final merge pipeline — load inputs, apply filters,
/// prepare author-facing comments, generate all Markdown and audit trail.
///
/// Matches Python `final_merge()` in `output/final.py` step for step.
///
/// `generated_at` is the ISO 8601 timestamp used in `audit_trail.json`.
/// The CLI layer provides this; tests pass a fixed value.
pub fn final_merge(
    project_dir: &Path,
    lang: &str,
    generated_at: &str,
) -> Result<FinalMergeResult, String> {
    // ── Phase 1: mandatory inputs ──────────────────────────────────────
    let merged = load_merged(project_dir, "structure")
        .ok_or_else(|| "merged.section.json missing for structure".to_string())?;
    let abstract_available = load_abstract_text(project_dir).is_some();

    // ── Phase 2: selection.json for all checks ─────────────────────────
    let struct_sel = load_selection(project_dir, "structure");
    let expr_sel = load_selection(project_dir, "expression");
    let ms_sel = load_selection(project_dir, "methods_stats");
    let la_sel = load_selection(project_dir, "logic_argument");
    let ft_sel = load_selection(project_dir, "figure_table");
    let ethics_sel = load_selection(project_dir, "ethics");

    // ── Phase 3: external_check.json (advisory only — load for future) ─
    let _ec_structure = load_external_check(project_dir, "structure");
    let _ec_expression = load_external_check(project_dir, "expression");
    let _ec_ms = load_external_check(project_dir, "methods_stats");
    let _ec_la = load_external_check(project_dir, "logic_argument");
    let _ec_ft = load_external_check(project_dir, "figure_table");
    let _ec_ethics = load_external_check(project_dir, "ethics");

    // ── Phase 4: reevaluation.json for all checks ──────────────────────
    let structure_re = load_reevaluation(project_dir, "structure");
    let expression_re = load_reevaluation(project_dir, "expression");
    let methods_stats_re = load_reevaluation(project_dir, "methods_stats");
    let logic_argument_re = load_reevaluation(project_dir, "logic_argument");
    let figure_table_re = load_reevaluation(project_dir, "figure_table");
    let ethics_re = load_reevaluation(project_dir, "ethics");

    // ── Phase 5: structure comments — filter + split ───────────────────
    let raw_struct: Vec<Value> = merged
        .get("comments")
        .and_then(|v| v.as_array())
        .map(|a| a.clone())
        .unwrap_or_default();
    let raw_struct = filter_comments(&raw_struct, struct_sel.as_ref());
    let major: Vec<Value> = raw_struct
        .iter()
        .filter(|c| c.get("severity").and_then(|v| v.as_str()) == Some("major"))
        .cloned()
        .collect();
    let minor: Vec<Value> = raw_struct
        .iter()
        .filter(|c| c.get("severity").and_then(|v| v.as_str()) != Some("major"))
        .cloned()
        .collect();

    // ── Phase 6: load additional checks ────────────────────────────────
    let mut expression_comments: Vec<Value> = Vec::new();
    let mut ms_comments: Vec<Value> = Vec::new();
    let mut la_comments: Vec<Value> = Vec::new();
    let mut ft_comments: Vec<Value> = Vec::new();
    let mut ethics_comments: Vec<Value> = Vec::new();
    let mut ms_available = false;
    let mut la_available = false;
    let mut ft_available = false;
    let mut ethics_available = false;
    let mut expression_available = false;

    if let Some(expr_merged) = load_merged(project_dir, "expression") {
        expression_available = true;
        let raw: Vec<Value> = expr_merged
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.clone())
            .unwrap_or_default();
        expression_comments = filter_comments(&raw, expr_sel.as_ref());
    }

    if let Some(ms_merged) = load_merged(project_dir, "methods_stats") {
        ms_available = true;
        let raw: Vec<Value> = ms_merged
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.clone())
            .unwrap_or_default();
        ms_comments = filter_comments(&raw, ms_sel.as_ref());
    }
    if let Some(la_merged) = load_merged(project_dir, "logic_argument") {
        la_available = true;
        let raw: Vec<Value> = la_merged
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.clone())
            .unwrap_or_default();
        la_comments = filter_comments(&raw, la_sel.as_ref());
    }
    if let Some(ft_merged) = load_merged(project_dir, "figure_table") {
        ft_available = true;
        let raw: Vec<Value> = ft_merged
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.clone())
            .unwrap_or_default();
        ft_comments = filter_comments(&raw, ft_sel.as_ref());
    }
    if let Some(ethics_merged) = load_merged(project_dir, "ethics") {
        ethics_available = true;
        let raw: Vec<Value> = ethics_merged
            .get("comments")
            .and_then(|v| v.as_array())
            .map(|a| a.clone())
            .unwrap_or_default();
        ethics_comments = filter_comments(&raw, ethics_sel.as_ref());
    }

    // ── Phase 7: comment_card_checked.json filter ──────────────────────
    let checked_ids = load_checked_comment_ids(project_dir);
    let (major, minor, expression_comments, ms_comments, la_comments, ft_comments, ethics_comments) =
        apply_checked_ids(
            major,
            minor,
            expression_comments,
            ms_comments,
            la_comments,
            ft_comments,
            ethics_comments,
            checked_ids.as_ref(),
        );

    // ── Phase 8: prepare author-facing comments ────────────────────────
    let major_auth = prepare_author_comments(&major, structure_re.as_ref());
    let minor_auth = prepare_author_comments(&minor, structure_re.as_ref());
    let expression_auth = prepare_author_comments(&expression_comments, expression_re.as_ref());
    let ms_auth = prepare_author_comments(&ms_comments, methods_stats_re.as_ref());
    let la_auth = prepare_author_comments(&la_comments, logic_argument_re.as_ref());
    let ft_auth = prepare_author_comments(&ft_comments, figure_table_re.as_ref());
    let ethics_auth = prepare_author_comments(&ethics_comments, ethics_re.as_ref());

    // ── Phase 9: counts + supplementary data ───────────────────────────
    let counts = compute_counts(
        &major_auth,
        &minor_auth,
        &expression_auth,
        &ms_auth,
        &la_auth,
        &ft_auth,
        &ethics_auth,
    );

    let total_major = counts.major
        + counts.ms_major
        + counts.la_major
        + counts.ft_major
        + counts.ethics_major;
    let user_verdict = load_user_verdict(project_dir);
    let recommendation = get_recommendation(total_major, counts.minor, user_verdict.as_ref());
    let review_comments = load_review_comments(project_dir, lang);
    let overall_assessment = load_overall_assessment(project_dir, lang);
    let line_numbers = load_line_numbers(project_dir);
    let verdict_checks = load_verdict_checks(project_dir);
    let jp_texts = if lang == "ja" {
        load_comments_to_authors_jp(project_dir)
    } else {
        None
    };

    // ── Phase 10: generate Markdown ────────────────────────────────────
    let final_review_md = generate_final_review_md(
        &merged,
        &major_auth,
        &minor_auth,
        &expression_auth,
        &ms_auth,
        ms_available,
        &la_auth,
        la_available,
        &ft_auth,
        ft_available,
        &ethics_auth,
        ethics_available,
        lang,
        line_numbers.as_ref(),
        overall_assessment.as_deref(),
        review_comments.as_ref(),
        &verdict_checks,
        jp_texts.as_ref(),
    );

    let comments_to_authors_md = generate_comments_to_authors_md(
        &major_auth,
        &minor_auth,
        &expression_auth,
        &ms_auth,
        &la_auth,
        &ft_auth,
        &ethics_auth,
        structure_re.as_ref(),
        expression_re.as_ref(),
        methods_stats_re.as_ref(),
        logic_argument_re.as_ref(),
        figure_table_re.as_ref(),
        ethics_re.as_ref(),
    );

    let confidential_comments_md = generate_confidential_comments_md(
        expression_available,
        ms_available,
        la_available,
        ft_available,
        ethics_available,
    );

    let recommendation_md = generate_recommendation_md(
        counts.major,
        counts.minor,
        counts.total,
        counts.expression_count,
        expression_available,
        counts.ms_count,
        counts.ms_major,
        ms_available,
        counts.la_count,
        counts.la_major,
        la_available,
        counts.ft_count,
        counts.ft_major,
        ft_available,
        counts.ethics_count,
        counts.ethics_major,
        ethics_available,
        user_verdict.as_ref(),
    );

    // ── Phase 11: audit trail ──────────────────────────────────────────
    let audit_trail = build_audit_trail(
        &merged,
        &counts,
        &recommendation,
        abstract_available,
        expression_available,
        ms_available,
        la_available,
        ft_available,
        ethics_available,
        0, // ec_disagree_total
        0, // ec_disagree_structure
        0, // ec_disagree_expression
        0, // ec_disagree_ms
        0, // ec_disagree_la
        generated_at,
    );

    Ok(FinalMergeResult {
        final_review_md,
        comments_to_authors_md,
        confidential_comments_md,
        recommendation_md,
        audit_trail,
        recommendation,
        total_comments: counts.total,
        major_count: counts.major,
        minor_count: counts.minor,
    })
}

/// Apply `checked_ids` filter to all comment lists in one pass.
fn apply_checked_ids(
    major: Vec<Value>,
    minor: Vec<Value>,
    expression_comments: Vec<Value>,
    ms_comments: Vec<Value>,
    la_comments: Vec<Value>,
    ft_comments: Vec<Value>,
    ethics_comments: Vec<Value>,
    checked_ids: Option<&HashSet<String>>,
) -> (
    Vec<Value>,
    Vec<Value>,
    Vec<Value>,
    Vec<Value>,
    Vec<Value>,
    Vec<Value>,
    Vec<Value>,
) {
    let ids = match checked_ids {
        Some(ids) => ids,
        None => {
            return (
                major,
                minor,
                expression_comments,
                ms_comments,
                la_comments,
                ft_comments,
                ethics_comments,
            );
        }
    };
    let filter = |v: Vec<Value>| -> Vec<Value> {
        v.into_iter()
            .filter(|c| {
                c.get("comment_id")
                    .and_then(|id| id.as_str())
                    .map(|id| ids.contains(id))
                    .unwrap_or(false)
            })
            .collect()
    };
    (
        filter(major),
        filter(minor),
        filter(expression_comments),
        filter(ms_comments),
        filter(la_comments),
        filter(ft_comments),
        filter(ethics_comments),
    )
}
