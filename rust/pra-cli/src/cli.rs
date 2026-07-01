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
}
