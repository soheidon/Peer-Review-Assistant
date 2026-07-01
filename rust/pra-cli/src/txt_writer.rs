/// Markdown-to-plain-text converter for final review documents.
///
/// Converts the markdown output of `_generate_final_review_md()` into a
/// plain-text representation with Unicode box-drawing characters for
/// headings and bracket labels for emphasis.
///
/// Ported from `python/peer_review_assistant/output/txt_writer.py`.

use regex::Regex;

// ── Regex patterns for markdown line detection (lazily initialized) ─────
fn h1_re() -> &'static Regex {
    static H1: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    H1.get_or_init(|| Regex::new(r"^#{1,2}\s+(.+)$").unwrap())
}

fn h3_re() -> &'static Regex {
    static H3: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    H3.get_or_init(|| Regex::new(r"^#{3,4}\s+(.+)$").unwrap())
}

fn bold_label_re() -> &'static Regex {
    static BL: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    BL.get_or_init(|| Regex::new(r"^\*\*(.+?)\*\*:\s*(.*)$").unwrap())
}

fn quote_re() -> &'static Regex {
    static Q: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    Q.get_or_init(|| Regex::new(r#"^"(.*)"$"#).unwrap())
}

// ── Main converter ──────────────────────────────────────────────────────

/// Convert a final review markdown string to plain text.
///
/// H1/H2 headings  → `━━━ Title ━━━`
/// H3/H4 headings  → `┄┄ Title ┄┄`
/// Bold labels     → `[Label] text`
/// Quotes          → `"text"` (preserved as-is)
/// Body text       → as-is, consecutive lines joined
///
/// Spacing rules (all inter-block gaps are exactly 1 blank line):
/// - No blank line after any heading — content follows immediately.
/// - One blank line before every block except the very first.
///
/// `lang` is reserved for future use (currently unused, matching Python).
pub fn convert_md_to_txt(md_text: &str, _lang: &str) -> String {
    let lines_in: Vec<&str> = md_text.lines().collect();
    let n = lines_in.len();
    let mut out: Vec<String> = Vec::new();
    let mut i = 0;
    let mut first_block = true;
    let mut after_heading = false;

    while i < n {
        let line = lines_in[i];
        let stripped = line.trim();

        // Blank line in source: skip (we manage spacing ourselves)
        if stripped.is_empty() {
            i += 1;
            continue;
        }

        // H1/H2 heading
        if let Some(m) = h1_re().captures(stripped) {
            if !first_block {
                out.push(String::new());
            }
            out.push(format!("━━━ {} ━━━", &m[1]));
            first_block = false;
            after_heading = true;
            i += 1;
            continue;
        }

        // H3/H4 heading
        if let Some(m) = h3_re().captures(stripped) {
            if !first_block {
                out.push(String::new());
            }
            out.push(format!("┄┄ {} ┄┄", &m[1]));
            first_block = false;
            after_heading = true;
            i += 1;
            continue;
        }

        // Quoted excerpt ("...")
        if let Some(m) = quote_re().captures(stripped) {
            if !first_block && !after_heading {
                out.push(String::new());
            }
            out.push(format!("\"{}\"", &m[1]));
            first_block = false;
            after_heading = false;
            i += 1;
            continue;
        }

        // Bold label + text (**Label**: text)
        if let Some(m) = bold_label_re().captures(stripped) {
            if !first_block && !after_heading {
                out.push(String::new());
            }
            out.push(format!("[{}] {}", &m[1], &m[2]));
            first_block = false;
            after_heading = false;
            i += 1;
            continue;
        }

        // Regular paragraph: accumulate non-blank lines
        let mut para_lines: Vec<&str> = Vec::new();
        while i < n && !lines_in[i].trim().is_empty() {
            para_lines.push(lines_in[i].trim());
            i += 1;
        }
        if !para_lines.is_empty() {
            if !first_block && !after_heading {
                out.push(String::new());
            }
            out.push(para_lines.join(" "));
            first_block = false;
            after_heading = false;
        }
    }

    // Remove trailing blank line if present
    while out.last().map_or(false, |s| s.is_empty()) {
        out.pop();
    }

    out.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Heading tests ──────────────────────────────────────────────────

    #[test]
    fn h1_heading() {
        let input = "# Introduction\n\nBody text.";
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, "━━━ Introduction ━━━\nBody text.");
    }

    #[test]
    fn h2_heading() {
        let input = "## Methods\n\nBody text.";
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, "━━━ Methods ━━━\nBody text.");
    }

    #[test]
    fn h3_heading() {
        let input = "### Results\n\nBody text.";
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, "┄┄ Results ┄┄\nBody text.");
    }

    #[test]
    fn h4_heading() {
        let input = "#### Details\n\nBody text.";
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, "┄┄ Details ┄┄\nBody text.");
    }

    // ── Block spacing tests ────────────────────────────────────────────

    #[test]
    fn no_blank_line_after_heading() {
        let input = "## Title\nContent line.";
        let output = convert_md_to_txt(input, "en");
        // No blank line between heading and content
        assert_eq!(output, "━━━ Title ━━━\nContent line.");
    }

    #[test]
    fn blank_line_between_paragraphs() {
        let input = "First paragraph.\n\nSecond paragraph.";
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, "First paragraph.\n\nSecond paragraph.");
    }

    #[test]
    fn blank_line_before_heading() {
        let input = "Some text.\n\n## New Section\n\nContent.";
        let output = convert_md_to_txt(input, "en");
        assert!(
            output.contains("\n\n━━━ New Section ━━━"),
            "Expected blank line before heading"
        );
    }

    // ── Bold label tests ───────────────────────────────────────────────

    #[test]
    fn bold_label() {
        let input = "**Issue**: The sample size is too small.";
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, "[Issue] The sample size is too small.");
    }

    #[test]
    fn bold_label_with_colons_in_value() {
        let input = "**Note**: See section 3.1: methods.";
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, "[Note] See section 3.1: methods.");
    }

    // ── Quote tests ────────────────────────────────────────────────────

    #[test]
    fn quoted_excerpt() {
        let input = r#""This is a quoted passage.""#;
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, r#""This is a quoted passage.""#);
    }

    // ── Paragraph joining ──────────────────────────────────────────────

    #[test]
    fn consecutive_lines_joined() {
        let input = "Line one.\nLine two.\nLine three.";
        let output = convert_md_to_txt(input, "en");
        assert_eq!(output, "Line one. Line two. Line three.");
    }

    // ── Edge cases ─────────────────────────────────────────────────────

    #[test]
    fn empty_input() {
        let output = convert_md_to_txt("", "en");
        assert_eq!(output, "");
    }

    #[test]
    fn whitespace_only() {
        let output = convert_md_to_txt("   \n\n  \n", "en");
        assert_eq!(output, "");
    }

    // ── Python compatibility: text-level comparison ────────────────────

    #[test]
    fn py_compat_simple_document() {
        let input = "\
# Paper Review

## Major Comments

**Issue**: Small sample size.
**Confidence**: high

## Minor Comments

The formatting of Table 2 needs improvement.
Consider adding a figure legend.\
";
        let output = convert_md_to_txt(input, "en");
        // This matches what Python convert_md_to_txt would produce
        let expected = "\
━━━ Paper Review ━━━

━━━ Major Comments ━━━
[Issue] Small sample size.

[Confidence] high

━━━ Minor Comments ━━━
The formatting of Table 2 needs improvement. Consider adding a figure legend.";

        assert_eq!(output, expected);
    }
}
