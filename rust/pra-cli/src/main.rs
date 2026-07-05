use pra_cli_rs as lib;

mod cli;

use std::fs;
use std::path::Path;

use clap::Parser;
use cli::{Cli, Commands};

fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::ParseLlmJson { input, output } => {
            cmd_parse_llm_json(&input, &output);
        }
        Commands::ConvertMdToTxt {
            input,
            output,
            lang,
        } => {
            cmd_convert_md_to_txt(&input, &output, &lang);
        }
        Commands::MergeSection { project, check } => {
            cmd_merge_section(&project, &check);
        }
        Commands::NormalizeSections {
            input,
            output,
            journal,
        } => {
            cmd_normalize_sections(&input, &output, journal.as_deref());
        }
        Commands::ConvertMdToDocx {
            input,
            output,
            lang,
        } => {
            cmd_convert_md_to_docx(&input, &output, &lang);
        }
        Commands::FinalMerge {
            project,
            lang,
            format,
        } => {
            cmd_final_merge(&project, &lang, &format);
        }
    }
}

fn cmd_parse_llm_json(input_path: &str, output_path: &str) {
    // Validate that the output parent directory exists
    let output = Path::new(output_path);
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            lib::emit::fail(
                "output_dir_missing",
                "Parent directory for --output does not exist",
            );
        }
    }

    // Read input file
    let content = match fs::read_to_string(input_path) {
        Ok(c) => c,
        Err(e) => {
            lib::emit::fail("input_read_error", &format!("Failed to read --input: {}", e));
        }
    };

    // Parse JSON from the LLM response
    match lib::json_repair::parse_llm_json(&content) {
        Some(value) => {
            // Write parsed JSON to output file (pretty-printed for readability)
            let json_str = serde_json::to_string_pretty(&value)
                .expect("failed to serialize parsed JSON");
            if let Err(e) = fs::write(output_path, &json_str) {
                lib::emit::fail(
                    "output_write_error",
                    &format!("Failed to write --output: {}", e),
                );
            }
            lib::emit::done();
        }
        None => {
            lib::emit::fail(
                "json_parse_failed",
                "Could not parse LLM JSON response",
            );
        }
    }
}

fn cmd_normalize_sections(input_path: &str, output_path: &str, journal_path: Option<&str>) {
    // Validate that the output parent directory exists
    let output = Path::new(output_path);
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            lib::emit::fail(
                "output_dir_missing",
                "Parent directory for --output does not exist",
            );
        }
    }

    // Read section map input
    let section_map_str = match fs::read_to_string(input_path) {
        Ok(c) => c,
        Err(e) => {
            lib::emit::fail("input_read_error", &format!("Failed to read --input: {}", e));
        }
    };
    let section_map: serde_json::Value = match serde_json::from_str(&section_map_str) {
        Ok(v) => v,
        Err(e) => {
            lib::emit::fail(
                "json_parse_failed",
                &format!("Failed to parse --input as JSON: {}", e),
            );
        }
    };

    // Read journal profile (optional)
    let mut journal_profile_value: Option<serde_json::Value> = None;
    if let Some(jp) = journal_path {
        let jp_str = match fs::read_to_string(jp) {
            Ok(c) => c,
            Err(e) => {
                lib::emit::fail(
                    "input_read_error",
                    &format!("Failed to read --journal: {}", e),
                );
            }
        };
        match serde_json::from_str(&jp_str) {
            Ok(v) => journal_profile_value = Some(v),
            Err(e) => {
                lib::emit::fail(
                    "json_parse_failed",
                    &format!("Failed to parse --journal as JSON: {}", e),
                );
            }
        }
    }

    // Run normalization
    let result = lib::section_normalizer::normalize_sections(
        &section_map,
        journal_profile_value.as_ref(),
    );

    let json_str = serde_json::to_string_pretty(&result)
        .expect("failed to serialize normalized sections");
    if let Err(e) = fs::write(output_path, &json_str) {
        lib::emit::fail(
            "output_write_error",
            &format!("Failed to write --output: {}", e),
        );
    }

    lib::emit::done();
}

fn cmd_convert_md_to_docx(input_path: &str, output_path: &str, lang: &str) {
    // Validate that the output parent directory exists
    let output = Path::new(output_path);
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            lib::emit::fail(
                "output_dir_missing",
                "Parent directory for --output does not exist",
            );
        }
    }

    let md_text = match fs::read_to_string(input_path) {
        Ok(c) => c,
        Err(e) => {
            lib::emit::fail("input_read_error", &format!("Failed to read --input: {}", e));
        }
    };

    let docx_bytes = lib::docx_writer::convert_md_to_docx(&md_text, lang);

    if let Err(e) = fs::write(output_path, &docx_bytes) {
        lib::emit::fail(
            "output_write_error",
            &format!("Failed to write --output: {}", e),
        );
    }

    lib::emit::done();
}

fn cmd_convert_md_to_txt(input_path: &str, output_path: &str, lang: &str) {
    // Validate that the output parent directory exists
    let output = Path::new(output_path);
    if let Some(parent) = output.parent() {
        if !parent.as_os_str().is_empty() && !parent.exists() {
            lib::emit::fail(
                "output_dir_missing",
                "Parent directory for --output does not exist",
            );
        }
    }

    // Read input markdown
    let md_text = match fs::read_to_string(input_path) {
        Ok(c) => c,
        Err(e) => {
            lib::emit::fail("input_read_error", &format!("Failed to read --input: {}", e));
        }
    };

    // Convert to plain text
    let txt = lib::txt_writer::convert_md_to_txt(&md_text, lang);

    if let Err(e) = fs::write(output_path, &txt) {
        lib::emit::fail(
            "output_write_error",
            &format!("Failed to write --output: {}", e),
        );
    }

    lib::emit::done();
}

fn cmd_final_merge(project: &str, lang: &str, format: &str) {
    let project_dir = Path::new(project);

    // Parse format flags
    let formats: Vec<&str> = format
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect();
    let want_all = formats.iter().any(|f| *f == "all");
    let want = |f: &str| -> bool { want_all || formats.iter().any(|x| *x == f) };

    // Generate JST timestamp
    let generated_at = jst_iso_now();

    // Run final_merge
    let result = match lib::final_merge::final_merge(project_dir, lang, &generated_at) {
        Ok(r) => r,
        Err(e) => {
            lib::emit::fail("final_merge_failed", &e);
        }
    };

    // Create output directories
    let out_dir = project_dir.join("outputs").join("final");
    let data_dir = out_dir.join("_data");
    if let Err(e) = fs::create_dir_all(&data_dir) {
        lib::emit::fail(
            "output_dir_create_failed",
            &format!("Failed to create {}: {}", data_dir.display(), e),
        );
    }

    // Main review file — name depends on language
    let review_filename = if lang == "ja" {
        "final_review_jp.md"
    } else {
        "final_review.md"
    };

    let write_text = |path: &Path, content: &str| {
        if let Err(e) = fs::write(path, content) {
            lib::emit::fail(
                "output_write_error",
                &format!("Failed to write {}: {}", path.display(), e),
            );
        }
    };

    // Write main review Markdown
    write_text(&out_dir.join(review_filename), &result.final_review_md);

    // Write data files (always same names regardless of language)
    write_text(
        &data_dir.join("comments_to_authors.md"),
        &result.comments_to_authors_md,
    );
    write_text(
        &data_dir.join("confidential_comments_to_editor.md"),
        &result.confidential_comments_md,
    );
    write_text(
        &data_dir.join("recommendation.md"),
        &result.recommendation_md,
    );

    // Write audit_trail.json (pretty-printed)
    let at_json = serde_json::to_string_pretty(&result.audit_trail)
        .expect("failed to serialize audit_trail");
    write_text(&data_dir.join("audit_trail.json"), &at_json);

    // TXT output
    if want("txt") {
        let txt = lib::txt_writer::convert_md_to_txt(&result.final_review_md, lang);
        let txt_filename = if lang == "ja" {
            "final_review_jp.txt"
        } else {
            "final_review.txt"
        };
        write_text(&out_dir.join(txt_filename), &txt);
    }

    // DOCX output
    if want("docx") {
        let docx_bytes = lib::docx_writer::convert_md_to_docx(&result.final_review_md, lang);
        let docx_filename = if lang == "ja" {
            "final_review_jp.docx"
        } else {
            "final_review.docx"
        };
        if let Err(e) = fs::write(&out_dir.join(docx_filename), &docx_bytes) {
            lib::emit::fail(
                "output_write_error",
                &format!("Failed to write DOCX: {}", e),
            );
        }
    }

    lib::emit::done();
}

/// Generate an ISO 8601 timestamp in JST (UTC+9).
fn jst_iso_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let total_secs = dur.as_secs() + 9 * 3600; // JST = UTC+9
    let micros = dur.subsec_micros();

    // Days since epoch
    let days = total_secs / 86400;
    let time_of_day = total_secs % 86400;
    let hours = time_of_day / 3600;
    let minutes = (time_of_day % 3600) / 60;
    let seconds = time_of_day % 60;

    // Civil date from days since Unix epoch
    let (year, month, day) = civil_from_days(days as i64);

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}.{:06}+09:00",
        year, month, day, hours, minutes, seconds, micros
    )
}

/// Convert days since Unix epoch (1970-01-01) to (year, month, day).
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    // Shift epoch from 1970-01-01 to 0000-03-01
    let z = days + 719468;
    let era = if z >= 0 { z } else { z - 146096 } / 146097;
    let doe = (z - era * 146097) as u32; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i64 + era * 400;
    let doy = doe - (yoe * 365 + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    (y, m, d)
}

fn cmd_merge_section(project: &str, check: &str) {
    let project_dir = Path::new(project);

    // Perform the merge
    let output = match lib::merge::merge_section(project_dir, check) {
        Ok(o) => o,
        Err(e) => {
            lib::emit::fail("merge_failed", &format!("{}", e));
        }
    };

    // Ensure output directory exists (matching Python CLI behaviour)
    let out_dir = project_dir
        .join("results")
        .join("merge")
        .join(check);
    if let Err(e) = fs::create_dir_all(&out_dir) {
        lib::emit::fail(
            "output_dir_create_failed",
            &format!("Failed to create output directory {}: {}", out_dir.display(), e),
        );
    }

    // Write merged.section.json
    let json_str = serde_json::to_string_pretty(&output)
        .expect("failed to serialize merged output");
    let output_path = out_dir.join("merged.section.json");
    if let Err(e) = fs::write(&output_path, &json_str) {
        lib::emit::fail(
            "output_write_error",
            &format!("Failed to write {}: {}", output_path.display(), e),
        );
    }

    lib::emit::done();
}
