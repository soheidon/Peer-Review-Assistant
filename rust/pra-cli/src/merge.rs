use std::collections::HashSet;
use std::fs;
use std::path::Path;

use anyhow::Context;
use regex::Regex;
use serde::{Deserialize, Serialize};

// ── Data types ──

#[derive(Debug, Deserialize)]
#[serde(rename_all = "snake_case")]
pub struct RawResult {
    pub source: String,
    pub status: String,
    pub model: Option<String>,
    pub summary: Option<String>,
    #[serde(default)]
    pub findings: Vec<Finding>,
}

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "snake_case")]
pub struct Finding {
    pub finding_id: String,
    pub severity: Option<String>,
    pub category: Option<String>,
    pub location: Option<Location>,
    pub issue: Option<String>,
    pub suggested_comment: Option<String>,
    pub confidence: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub struct Location {
    #[serde(default)]
    pub section: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct SourceInfo {
    pub source: String,
    pub status: String,
    pub model: Option<String>,
    pub finding_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct MergedComment {
    pub comment_id: String,
    pub severity: String,
    pub category: String,
    pub location: Location,
    pub issue: String,
    pub evidence: String,
    pub suggested_author_comment: String,
    pub reviewer_note: String,
    pub confidence: String,
    pub conflict: bool,
    pub source_findings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct Conflict {
    pub conflict_id: String,
    pub description: String,
    pub resolution: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub struct MergedOutput {
    pub check_name: String,
    pub status: String,
    pub generated_at: Option<String>,
    pub sources: Vec<SourceInfo>,
    pub summary: String,
    pub comments: Vec<MergedComment>,
    pub conflicts: Vec<Conflict>,
}

// ── Internal: finding + source attribution ──

struct AnnFinding {
    finding_id: String,
    severity: String,
    category: String,
    location: Location,
    issue: String,
    suggested_comment: String,
    confidence: String,
    source: String,
}

impl AnnFinding {
    fn from_finding(f: &Finding, source: &str) -> Self {
        AnnFinding {
            finding_id: f.finding_id.clone(),
            severity: f.severity.clone().unwrap_or_else(|| "minor".to_string()),
            category: f.category.clone().unwrap_or_else(|| "Structure".to_string()),
            location: f.location.clone().unwrap_or(Location { section: None }),
            issue: f.issue.clone().unwrap_or_default(),
            suggested_comment: f.suggested_comment.clone().unwrap_or_default(),
            confidence: f.confidence.clone().unwrap_or_else(|| "low".to_string()),
            source: source.to_string(),
        }
    }

    fn section(&self) -> String {
        self.location.section.clone().unwrap_or_default()
    }
}

// ── Main entry point ──

pub fn merge_section(project_dir: &Path, check_name: &str) -> anyhow::Result<MergedOutput> {
    let raw_results = load_raw_results(project_dir, check_name)?;
    if raw_results.is_empty() {
        anyhow::bail!("No raw.json files found in outputs/{}/", check_name);
    }

    // Build sources summary
    let mut sources: Vec<SourceInfo> = Vec::new();
    for r in &raw_results {
        sources.push(SourceInfo {
            source: r.source.clone(),
            status: r.status.clone(),
            model: r.model.clone(),
            finding_count: r.findings.len(),
        });
    }

    // Collect all findings with source attribution
    let mut all_findings: Vec<AnnFinding> = Vec::new();
    for r in &raw_results {
        for f in &r.findings {
            all_findings.push(AnnFinding::from_finding(f, &r.source));
        }
    }

    // Cluster findings by token overlap (section-aware fuzzy dedup)
    let clusters = cluster_findings(&all_findings, 0.25);

    // Merge each cluster into a comment
    let mut merged_comments: Vec<MergedComment> = Vec::new();
    for cluster in &clusters {
        let group: Vec<&AnnFinding> = cluster.iter().map(|&i| &all_findings[i]).collect();
        merged_comments.push(merge_finding_group(&group, check_name, merged_comments.len() + 1));
    }

    // Sort: major first, then by confidence within severity
    let severity_key = |s: &str| -> u8 {
        match s {
            "major" => 0,
            _ => 1,
        }
    };
    let confidence_key = |c: &str| -> u8 {
        match c {
            "high" => 0,
            "medium" => 1,
            _ => 2,
        }
    };
    merged_comments.sort_by(|a, b| {
        severity_key(&a.severity)
            .cmp(&severity_key(&b.severity))
            .then_with(|| confidence_key(&a.confidence).cmp(&confidence_key(&b.confidence)))
    });

    // Re-assign sequential IDs after sort
    for (i, c) in merged_comments.iter_mut().enumerate() {
        c.comment_id = format!("{}_{:03}", check_name, i + 1);
    }

    // Detect cross-comment conflicts
    let conflicts = detect_conflicts(&merged_comments, check_name);

    // Build combined summary
    let summaries: Vec<&str> = raw_results
        .iter()
        .filter_map(|r| r.summary.as_deref())
        .filter(|s| !s.is_empty())
        .collect();
    let strip_part_label = Regex::new(r"^\s*\[Part [AB]\]\s*").unwrap();
    let cleaned: Vec<String> = summaries
        .iter()
        .map(|s| strip_part_label.replace_all(s, "").to_string())
        .collect();
    let combined_summary = if cleaned.is_empty() {
        "No summary available.".to_string()
    } else {
        cleaned.join("\n\n")
    };

    Ok(MergedOutput {
        check_name: check_name.to_string(),
        status: "done".to_string(),
        generated_at: None,
        sources,
        summary: combined_summary,
        comments: merged_comments,
        conflicts,
    })
}

// ── Load raw results ──

fn load_raw_results(project_dir: &Path, check_name: &str) -> anyhow::Result<Vec<RawResult>> {
    let out_dir = project_dir.join("outputs").join(check_name);
    if !out_dir.is_dir() {
        return Ok(Vec::new());
    }

    let mut entries: Vec<_> = fs::read_dir(&out_dir)
        .context("Failed to read outputs directory")?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.file_name()
                .to_string_lossy()
                .ends_with(".raw.json")
        })
        .collect();
    entries.sort_by_key(|e| e.file_name().to_string_lossy().to_string());

    let mut results = Vec::new();
    for entry in entries {
        let data = fs::read_to_string(entry.path()).context("Failed to read raw.json file")?;
        let parsed: RawResult =
            serde_json::from_str(&data).context("Failed to parse raw.json")?;
        if parsed.status == "done" {
            results.push(parsed);
        }
    }

    Ok(results)
}

// ── Normalize text ──

fn normalize_text(finding: &AnnFinding) -> String {
    let section = finding.location.section.clone().unwrap_or_default();
    let category = &finding.category;
    let issue = &finding.issue;
    let suggestion = &finding.suggested_comment;

    let text = format!("{} {} {} {}", section, category, issue, suggestion);
    let text = text.to_lowercase();

    let re_punct = Regex::new(r"[^\w\s]").unwrap();
    let text = re_punct.replace_all(&text, "").to_string();

    let re_ws = Regex::new(r"\s+").unwrap();
    re_ws.replace_all(&text, " ").trim().to_string()
}

// ── Jaccard token overlap ──

fn token_overlap(text1: &str, text2: &str) -> f64 {
    let tokens1: HashSet<&str> = text1.split_whitespace().collect();
    let tokens2: HashSet<&str> = text2.split_whitespace().collect();

    if tokens1.is_empty() && tokens2.is_empty() {
        return 1.0;
    }
    if tokens1.is_empty() || tokens2.is_empty() {
        return 0.0;
    }

    let intersection = tokens1.intersection(&tokens2).count();
    let union = tokens1.union(&tokens2).count();
    intersection as f64 / union as f64
}

// ── Cluster findings (greedy, section-aware, no intra-reviewer merge) ──

fn cluster_findings(all_findings: &[AnnFinding], threshold: f64) -> Vec<Vec<usize>> {
    let normalized: Vec<String> = all_findings.iter().map(normalize_text).collect();
    let mut clusters: Vec<Vec<usize>> = Vec::new();

    for (i, finding) in all_findings.iter().enumerate() {
        let sec_i = finding.section();
        let src_i = &finding.source;

        let mut best_idx: Option<usize> = None;
        let mut best_score = 0.0_f64;

        for (j, cluster_indices) in clusters.iter().enumerate() {
            let rep = &all_findings[cluster_indices[0]];
            let cluster_sec = rep.section();
            let cluster_src = &rep.source;

            // Hard constraint: same section
            if sec_i != cluster_sec {
                continue;
            }

            // Hard constraint: different source (no intra-reviewer merging)
            if src_i == cluster_src {
                continue;
            }

            // Compare against representative (first finding in cluster)
            let score = token_overlap(&normalized[i], &normalize_text(rep));
            if score > best_score {
                best_score = score;
                best_idx = Some(j);
            }
        }

        match best_idx {
            Some(idx) if best_score >= threshold => clusters[idx].push(i),
            _ => clusters.push(vec![i]),
        }
    }

    clusters
}

// ── Merge finding group into a single comment ──

fn merge_finding_group(
    group: &[&AnnFinding],
    check_name: &str,
    index: usize,
) -> MergedComment {
    // Sort by detail length (issue + suggested_comment), descending.
    // This reordering is observable: source_findings inherits this order.
    let detail_len = |f: &&AnnFinding| -> usize { f.issue.len() + f.suggested_comment.len() };
    let mut sorted: Vec<&&AnnFinding> = group.iter().collect();
    sorted.sort_by_key(|f| std::cmp::Reverse(detail_len(f)));
    let best = sorted[0];

    // Severity: pick highest (major beats minor)
    let severity = if group.iter().any(|f| f.severity == "major") {
        "major"
    } else {
        "minor"
    };

    // Confidence: pick highest
    let conf_val = |c: &str| -> u8 {
        match c {
            "high" => 0,
            "medium" => 1,
            _ => 2,
        }
    };
    let confidence = group
        .iter()
        .min_by_key(|f| conf_val(&f.confidence))
        .map(|f| f.confidence.as_str())
        .unwrap_or("low");

    // Source finding IDs — ordered by descending detail_len (Python sort-is-in-place)
    let source_ids: Vec<String> = sorted.iter().map(|f| f.finding_id.clone()).collect();

    // Source names (sorted, deduplicated)
    let mut source_names: Vec<&str> = group.iter().map(|f| f.source.as_str()).collect();
    source_names.sort();
    source_names.dedup();

    // Evidence string
    let evidence = match source_names.len() {
        1 => format!("{} flagged this issue.", source_names[0]),
        2 => format!(
            "{} and {} both flagged this issue.",
            source_names[0], source_names[1]
        ),
        _ => {
            let (last, rest) = source_names.split_last().unwrap();
            format!(
                "{}, and {} all flagged this issue.",
                rest.join(", "),
                last
            )
        }
    };

    // Conflict detection within group: severities differ
    let severities: Vec<&str> = group.iter().map(|f| f.severity.as_str()).collect();
    let conflict = !severities.is_empty() && severities.iter().any(|s| *s != severities[0]);

    // Build reviewer note using detail_len order (Python sorts group in place
    // before building notes, so the iteration order is the sorted order)
    let reviewer_note = if conflict {
        let notes: Vec<String> = sorted
            .iter()
            .map(|f| format!("{}: severity={}", f.source, f.severity))
            .collect();
        format!(
            "Severity disagreement between reviewers: {}",
            notes.join("; ")
        )
    } else {
        String::new()
    };

    MergedComment {
        comment_id: format!("{}_{:03}", check_name, index),
        severity: severity.to_string(),
        category: best.category.clone(),
        location: best.location.clone(),
        issue: best.issue.clone(),
        evidence,
        suggested_author_comment: best.suggested_comment.clone(),
        reviewer_note,
        confidence: confidence.to_string(),
        conflict,
        source_findings: source_ids,
    }
}

// ── Detect cross-comment conflicts ──

fn detect_conflicts(merged_comments: &[MergedComment], check_name: &str) -> Vec<Conflict> {
    let mut conflicts = Vec::new();

    for (i, c1) in merged_comments.iter().enumerate() {
        let sec1 = c1.location.section.clone().unwrap_or_default();
        if sec1.is_empty() {
            continue;
        }

        for c2 in merged_comments.iter().skip(i + 1) {
            let sec2 = c2.location.section.clone().unwrap_or_default();
            if sec1 == sec2 && c1.severity != c2.severity {
                conflicts.push(Conflict {
                    conflict_id: format!("{}_conflict_{:03}", check_name, conflicts.len() + 1),
                    description: format!(
                        "Different severity opinions for {}: one reviewer assessed as {}, another as {}.",
                        sec1, c1.severity, c2.severity
                    ),
                    resolution: "Flagged for reviewer confirmation.".to_string(),
                });
                break;
            }
        }
    }

    conflicts
}

// ── Build markdown ──

pub fn build_markdown(merged: &MergedOutput) -> String {
    let check_name = &merged.check_name;
    let mut lines: Vec<String> = Vec::new();

    // Title
    let title = title_case(check_name);
    lines.push(format!("# {} Check — Merged Results\n", title));
    // Summary
    lines.push("## Summary\n".to_string());
    lines.push(format!("{}\n", merged.summary));

    // Sources
    let sources = &merged.sources;
    if !sources.is_empty() {
        lines.push("## Sources\n".to_string());
        for s in sources {
            let model_str = if let Some(ref m) = s.model {
                format!(" ({})", m)
            } else {
                String::new()
            };
            lines.push(format!(
                "- **{}**{}: {} findings",
                s.source, model_str, s.finding_count
            ));
        }
        lines.push(String::new());
    }

    // Major comments
    let major: Vec<&MergedComment> = merged
        .comments
        .iter()
        .filter(|c| c.severity == "major")
        .collect();
    if !major.is_empty() {
        lines.push("## Major Comments\n".to_string());
        for c in &major {
            let section = c.location.section.clone().unwrap_or_else(|| "?".to_string());
            lines.push(format!("### {}: {}\n", c.comment_id, section));
            lines.push(format!("**Issue**: {}\n", c.issue));
            lines.push(format!("**Evidence**: {}\n", c.evidence));
            lines.push(format!(
                "**Suggestion**: {}\n",
                c.suggested_author_comment
            ));
            lines.push(format!("**Confidence**: {}\n", c.confidence));
            if c.conflict {
                lines.push(format!("**Note**: {}\n", c.reviewer_note));
            }
            lines.push(String::new());
        }
    }

    // Minor comments
    let minor: Vec<&MergedComment> = merged
        .comments
        .iter()
        .filter(|c| c.severity != "major")
        .collect();
    if !minor.is_empty() {
        lines.push("## Minor Comments\n".to_string());
        for c in &minor {
            let section = c.location.section.clone().unwrap_or_else(|| "?".to_string());
            lines.push(format!("### {}: {}\n", c.comment_id, section));
            lines.push(format!("**Issue**: {}\n", c.issue));
            lines.push(format!(
                "**Suggestion**: {}\n",
                c.suggested_author_comment
            ));
            lines.push(format!("**Confidence**: {}\n", c.confidence));
            lines.push(String::new());
        }
    }

    // Conflicts (only if non-empty)
    let conflicts = &merged.conflicts;
    if !conflicts.is_empty() {
        lines.push("## Conflicts\n".to_string());
        for c in conflicts {
            lines.push(format!("- **{}**: {}", c.conflict_id, c.description));
            lines.push(format!("  - Resolution: {}\n", c.resolution));
        }
        lines.push(String::new());
    }

    // Reviewer notes
    let notes: Vec<&str> = merged
        .comments
        .iter()
        .filter_map(|c| {
            if c.reviewer_note.is_empty() {
                None
            } else {
                Some(c.reviewer_note.as_str())
            }
        })
        .collect();
    if !notes.is_empty() {
        lines.push("## Reviewer Notes\n".to_string());
        for n in &notes {
            lines.push(format!("- {}", n));
        }
        lines.push(String::new());
    }

    lines.join("\n")
}

/// Mimics Python's `str.title()`: capitalizes the first letter after each
/// non-alphanumeric boundary.
fn title_case(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut new_word = true;
    for ch in s.chars() {
        if new_word && ch.is_alphanumeric() {
            result.extend(ch.to_uppercase());
            new_word = false;
        } else {
            result.push(ch);
            if !ch.is_alphanumeric() {
                new_word = true;
            }
        }
    }
    result
}
