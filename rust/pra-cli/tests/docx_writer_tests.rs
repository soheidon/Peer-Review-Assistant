/// Structural verification tests for docx_writer.
///
/// We do NOT compare binary output with Python.  Instead we decompress
/// the generated .docx (a ZIP) and inspect word/document.xml for
/// paragraph count, type, text, bold, indentation, east-Asian font
/// attribute, and page settings.

use pra_cli_rs::docx_writer;
use regex::Regex;
use std::io::Read;

// ── Helpers ──────────────────────────────────────────────────────────────

/// Decompress a .docx byte array and return (document_xml, styles_xml).
fn extract_xml(docx: &[u8]) -> (String, String) {
    let cursor = std::io::Cursor::new(docx);
    let mut zip = zip::ZipArchive::new(cursor).expect("valid zip");
    let mut doc = String::new();
    let mut styles = String::new();
    zip.by_name("word/document.xml")
        .expect("document.xml present")
        .read_to_string(&mut doc)
        .unwrap();
    zip.by_name("word/styles.xml")
        .expect("styles.xml present")
        .read_to_string(&mut styles)
        .unwrap();
    (doc, styles)
}

/// Parse a single <w:p> ... </w:p> element and return structured info.
#[derive(Debug, PartialEq)]
struct ParsedPara {
    text: String,
    is_bold: bool,
    is_italic: bool,
    has_indent: bool,
    has_east_asia: bool,
    /// Font size in half-points from the first <w:r> run props, if any.
    sz: Option<u32>,
}

fn parse_paragraphs(document_xml: &str) -> Vec<ParsedPara> {
    let p_re = Regex::new(r#"<w:p[ >].*?</w:p>"#).unwrap();
    let r_re = Regex::new(r"<w:r[ >].*?</w:r>").unwrap();
    let t_re = Regex::new(r"<w:t[^>]*>([^<]*)</w:t>").unwrap();

    let bold_re = Regex::new(r"<w:b\s*/?>").unwrap();
    let italic_re = Regex::new(r"<w:i\s*/?>").unwrap();
    let ind_re = Regex::new(r"<w:ind\b").unwrap();
    let east_re = Regex::new(r#"w:eastAsia\s*=\s*"[^"]*""#).unwrap();
    let sz_re = Regex::new(r#"<w:sz\b[^>]*w:val\s*=\s*"(\d+)""#).unwrap();

    let mut out = Vec::new();
    for p_cap in p_re.captures_iter(document_xml) {
        let p_xml = &p_cap[0];
        let first_r = r_re.captures(p_xml);
        let text: String = t_re
            .captures_iter(p_xml)
            .filter_map(|c| c.get(1))
            .map(|m| m.as_str())
            .collect::<Vec<_>>()
            .join("");
        let sz = sz_re.captures(p_xml).and_then(|c| c[1].parse().ok());
        let is_bold = bold_re.is_match(p_xml);
        let is_italic = italic_re.is_match(p_xml);
        let has_indent = ind_re.is_match(p_xml);
        let first_r_str = first_r.as_ref().map(|c| c.get(0).map(|m| m.as_str()).unwrap_or("")).unwrap_or("");
        let has_east_asia = east_re.is_match(first_r_str);
        out.push(ParsedPara {
            text,
            is_bold,
            is_italic,
            has_indent,
            has_east_asia,
            sz,
        });
    }
    out
}

/// Build .docx and return parsed paragraphs.
fn docx_paras(md: &str, lang: &str) -> (Vec<ParsedPara>, String) {
    let bytes = docx_writer::convert_md_to_docx(md, lang);
    let (doc_xml, styles_xml) = extract_xml(&bytes);
    (parse_paragraphs(&doc_xml), styles_xml)
}

// ── Tests ────────────────────────────────────────────────────────────────

#[test]
fn empty_input_produces_valid_docx() {
    let bytes = docx_writer::convert_md_to_docx("", "en");
    let (doc_xml, _styles) = extract_xml(&bytes);
    let paras = parse_paragraphs(&doc_xml);
    // No body paragraphs expected (empty input), but the sectPr is present
    assert!(doc_xml.contains("<w:sectPr>"), "must contain sectPr");
    assert!(doc_xml.contains(r#"w:w="11907""#), "A4 width in twips");
    assert!(doc_xml.contains(r#"w:h="16839""#), "A4 height in twips");
    assert_eq!(paras.len(), 0, "empty input should have zero paragraphs");
}

#[test]
fn simple_headings_h1_h4() {
    let md = "# Heading One\n\
              ## Heading Two\n\
              ### Heading Three\n\
              #### Heading Four";
    let (paras, _) = docx_paras(md, "en");
    assert_eq!(paras.len(), 4);
    assert_eq!(paras[0].text, "Heading One");
    assert!(paras[0].is_bold);
    assert_eq!(paras[0].sz, Some(32)); // 16 pt

    assert_eq!(paras[1].text, "Heading Two");
    assert!(paras[1].is_bold);
    assert_eq!(paras[1].sz, Some(28)); // 14 pt

    assert_eq!(paras[2].text, "Heading Three");
    assert!(paras[2].is_bold);
    assert_eq!(paras[2].sz, Some(24)); // 12 pt

    assert_eq!(paras[3].text, "Heading Four");
    assert!(paras[3].is_bold);
    assert_eq!(paras[3].sz, Some(22)); // 11 pt
}

#[test]
fn bold_label() {
    let md = "**Recommendation**: Major Revision\n\
              **Strength**: Clear methodology";
    let (paras, _) = docx_paras(md, "en");
    assert_eq!(paras.len(), 2);
    // Label paragraph: bold label part + normal body part
    assert_eq!(paras[0].text, "Recommendation: Major Revision");
    assert!(paras[0].is_bold);
    assert_eq!(paras[1].text, "Strength: Clear methodology");
    assert!(paras[1].is_bold);
}

#[test]
fn quoted_excerpts() {
    let md = r#""This is a quoted passage from the manuscript""#;
    let (paras, _) = docx_paras(md, "en");
    assert_eq!(paras.len(), 1);
    assert_eq!(paras[0].text, "This is a quoted passage from the manuscript");
    assert!(paras[0].is_italic);
    assert!(paras[0].has_indent);
    assert_eq!(paras[0].sz, Some(20)); // 10 pt
}

#[test]
fn body_paragraphs_multiline() {
    let md = "This is the first line.\n\
              This is the second line.\n\
              \n\
              A new paragraph here.";
    let (paras, _) = docx_paras(md, "en");
    assert_eq!(paras.len(), 2);
    // Consecutive non-empty lines joined with space
    assert_eq!(paras[0].text, "This is the first line. This is the second line.");
    assert!(!paras[0].is_bold);
    assert!(!paras[0].is_italic);
    assert_eq!(paras[0].sz, Some(21)); // 10.5 pt

    assert_eq!(paras[1].text, "A new paragraph here.");
    assert!(!paras[1].is_bold);
}

#[test]
fn japanese_font_and_text() {
    let md = "# はじめに\n\
              本文の内容です。";
    let (paras, styles) = docx_paras(md, "ja");
    assert_eq!(paras.len(), 2);
    assert_eq!(paras[0].text, "はじめに");
    assert!(paras[0].is_bold);
    assert_eq!(paras[1].text, "本文の内容です。");

    // Every paragraph should have eastAsia font attribute
    for p in &paras {
        assert!(p.has_east_asia, "ja output must have w:eastAsia on every run");
    }
    // styles.xml should reference "Yu Mincho"
    assert!(
        styles.contains("Yu Mincho"),
        "ja styles.xml must contain Yu Mincho"
    );
}

#[test]
fn english_font_is_times_new_roman() {
    let md = "Some body text.\n\nMore text.";
    let (_paras, styles) = docx_paras(md, "en");
    assert!(
        styles.contains("Times New Roman"),
        "en styles.xml must contain Times New Roman"
    );
}

#[test]
fn page_settings_a4() {
    let bytes = docx_writer::convert_md_to_docx("# Test", "en");
    let (doc_xml, _) = extract_xml(&bytes);
    // A4: 21.0 cm × 29.7 cm → twips 11907 × 16838
    assert!(doc_xml.contains(r#"w:w="11907""#), "A4 width");
    assert!(doc_xml.contains(r#"w:h="16839""#), "A4 height");
    // Margins: 2.54 cm → twips 1440 (567 * 2.54 ≈ 1440.18, trunc to 1440)
    assert!(doc_xml.contains(r#"w:top="1440""#), "top margin 2.54 cm");
    assert!(doc_xml.contains(r#"w:right="1440""#), "right margin 2.54 cm");
    assert!(doc_xml.contains(r#"w:bottom="1440""#), "bottom margin 2.54 cm");
    assert!(doc_xml.contains(r#"w:left="1440""#), "left margin 2.54 cm");
}

#[test]
fn styles_xml_has_east_asia_on_normal() {
    let bytes = docx_writer::convert_md_to_docx("# Test", "ja");
    let (_, styles) = extract_xml(&bytes);
    assert!(styles.contains(r#"w:eastAsia"#), "Normal style must have w:eastAsia");
    assert!(styles.contains("Yu Mincho"), "ja Normal style font");
}

#[test]
fn complex_document_all_types() {
    let md = "# Review Report\n\
              \n\
              **Recommendation**: Major Revision\n\
              \n\
              ## Strengths\n\
              \n\
              The methodology is sound.\n\
              \n\
              \"direct quote from the paper\"\n\
              \n\
              **Weakness**: Sample size is small.\n\
              \n\
              ### Minor Points\n\
              \n\
              Figure 3 could be improved.";
    let (paras, _) = docx_paras(md, "en");
    // H1, Labeled, H2, Body, Quote, Labeled, H3, Body  = 8 paragraphs
    assert_eq!(paras.len(), 8, "8 paragraphs expected");

    // H1
    assert_eq!(paras[0].text, "Review Report");
    assert!(paras[0].is_bold);
    assert_eq!(paras[0].sz, Some(32));

    // Labeled: Recommendation
    assert_eq!(paras[1].text, "Recommendation: Major Revision");
    assert!(paras[1].is_bold);

    // H2
    assert_eq!(paras[2].text, "Strengths");
    assert!(paras[2].is_bold);
    assert_eq!(paras[2].sz, Some(28));

    // Body
    assert_eq!(paras[3].text, "The methodology is sound.");
    assert!(!paras[3].is_bold);

    // Quote
    assert_eq!(paras[4].text, "direct quote from the paper");
    assert!(paras[4].is_italic);
    assert!(paras[4].has_indent);

    // Labeled: Weakness
    assert_eq!(paras[5].text, "Weakness: Sample size is small.");
    assert!(paras[5].is_bold);

    // H3
    assert_eq!(paras[6].text, "Minor Points");
    assert!(paras[6].is_bold);

    // Body
    assert_eq!(paras[7].text, "Figure 3 could be improved.");
    assert!(!paras[7].is_bold);
}

#[test]
fn xml_escaping_prevents_injection() {
    let md = "**Tag**: <script>alert('xss')</script>\n\
              Some text with & ampersand.";
    let (paras, _) = docx_paras(md, "en");
    assert_eq!(paras.len(), 2);
    // XML special chars must be escaped
    let labeled = &paras[0].text;
    assert!(!labeled.contains('<'), "angle brackets must be escaped");
    assert!(labeled.contains("&lt;"), "must use &lt;");
    assert!(labeled.contains("&gt;"), "must use &gt;");
    assert!(!labeled.contains('\''), "single quotes must be escaped");  // wait - actually our text doesn't have single quotes, just checking
    let body = &paras[1].text;
    assert!(body.contains("&amp;"), "ampersand must be escaped");
}

/// Ensure that bold labels with empty body text still render correctly.
#[test]
fn bold_label_empty_body() {
    let md = "**Note**:";
    let (paras, _) = docx_paras(md, "en");
    assert_eq!(paras.len(), 1);
    assert_eq!(paras[0].text, "Note: ");
    assert!(paras[0].is_bold);
}
