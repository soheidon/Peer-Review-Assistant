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
