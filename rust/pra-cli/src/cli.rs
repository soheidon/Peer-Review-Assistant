use clap::{Parser, Subcommand};

/// Academic Paper Checker — Rust CLI (pra-cli-rs)
///
/// Incrementally replaces the Python `pra-cli` backend.
/// Each migrated module becomes a subcommand here.
#[derive(Parser)]
#[command(name = "pra-cli-rs", version = env!("CARGO_PKG_VERSION"))]
pub struct Cli {
    #[command(subcommand)]
    pub command: Commands,
}

#[derive(Subcommand)]
pub enum Commands {
    /// Parse and repair JSON from an LLM response string.
    /// Reads the raw response from --input, writes parsed JSON to --output.
    ParseLlmJson {
        #[arg(long)]
        input: String,

        #[arg(long)]
        output: String,
    },

    /// Convert a markdown review document to plain text.
    /// Reads markdown from --input, writes plain text to --output.
    ConvertMdToTxt {
        #[arg(long)]
        input: String,

        #[arg(long)]
        output: String,

        #[arg(long, default_value = "en")]
        lang: String,
    },

    /// Merge individual reviewer raw.json files into a unified section result.
    /// Reads from <project>/outputs/<check>/, writes merged.section.json to
    /// <project>/results/merge/<check>/.
    MergeSection {
        #[arg(long)]
        project: String,

        #[arg(long)]
        check: String,
    },

    /// Normalize manuscript section headings to canonical names using
    /// journal-specific aliases and position-based disambiguation rules.
    /// Reads section map from --input and journal profile from --journal,
    /// writes normalized result to --output.
    NormalizeSections {
        #[arg(long)]
        input: String,

        #[arg(long)]
        output: String,

        /// Optional journal profile JSON file. If omitted, works without aliases.
        #[arg(long)]
        journal: Option<String>,
    },

    /// Convert final review markdown to a .docx file.
    /// Reads markdown from --input, writes .docx to --output.
    ConvertMdToDocx {
        #[arg(long)]
        input: String,

        #[arg(long)]
        output: String,

        #[arg(long, default_value = "en")]
        lang: String,
    },

    /// Generate the final review document from all check outputs.
    /// Reads merged.section.json from outputs/<check>/ and produces
    /// final_review.md, comments_to_authors.md, confidential_comments.md,
    /// recommendation.md, audit_trail.json, and optionally DOCX/TXT.
    FinalMerge {
        #[arg(long)]
        project: String,

        #[arg(long, default_value = "en")]
        lang: String,

        #[arg(long, default_value = "all")]
        format: String,
    },
}
