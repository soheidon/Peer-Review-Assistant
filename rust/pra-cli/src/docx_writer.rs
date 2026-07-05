/// Markdown-to-DOCX converter.
///
/// Port of `python/peer_review_assistant/output/docx_writer.py`.
///
/// Generates a .docx file from Markdown via handwritten XML in a ZIP
/// container.  Does NOT aim for binary identity with the Python output
/// — verification uses structural analysis of word/document.xml.

use regex::Regex;
use std::io::{Cursor, Write};
use std::sync::OnceLock;
use zip::write::FileOptions;
use zip::ZipWriter;

// ── Regex patterns ──

fn h1_re() -> &'static Regex {
    static H1: OnceLock<Regex> = OnceLock::new();
    H1.get_or_init(|| Regex::new(r"^# (.+)$").unwrap())
}
fn h2_re() -> &'static Regex {
    static H2: OnceLock<Regex> = OnceLock::new();
    H2.get_or_init(|| Regex::new(r"^## (.+)$").unwrap())
}
fn h3_re() -> &'static Regex {
    static H3: OnceLock<Regex> = OnceLock::new();
    H3.get_or_init(|| Regex::new(r"^### (.+)$").unwrap())
}
fn h4_re() -> &'static Regex {
    static H4: OnceLock<Regex> = OnceLock::new();
    H4.get_or_init(|| Regex::new(r"^#### (.+)$").unwrap())
}
fn bold_label_re() -> &'static Regex {
    static BL: OnceLock<Regex> = OnceLock::new();
    BL.get_or_init(|| Regex::new(r"^\*\*(.+?)\*\*:\s*(.*)$").unwrap())
}
fn quote_re() -> &'static Regex {
    static Q: OnceLock<Regex> = OnceLock::new();
    Q.get_or_init(|| Regex::new(r#"^"(.*)"$"#).unwrap())
}

// ── Font selection ──

fn font_name(lang: &str) -> &str {
    if lang == "ja" { "Yu Mincho" } else { "Times New Roman" }
}

// ── Paragraph type ──

#[derive(Debug, Clone, PartialEq)]
pub enum Para {
    Heading { level: u8, text: String },
    Labeled { label: String, body: String },
    Quote { text: String },
    Body { text: String },
}

// ── XML escaping ──

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

// ── Unit conversion ──

fn cm_to_twips(cm: f64) -> u32 {
    (cm * 567.0) as u32
}

// ── Public API ──

/// Convert a final review markdown string to a .docx byte stream.
pub fn convert_md_to_docx(md_text: &str, lang: &str) -> Vec<u8> {
    let paragraphs = parse_md_to_paragraphs(md_text);
    build_docx_zip(&paragraphs, lang)
}

// ── Markdown parser ──

fn parse_md_to_paragraphs(md_text: &str) -> Vec<Para> {
    let lines: Vec<&str> = md_text.split('\n').collect();
    let mut paras: Vec<Para> = Vec::new();
    let n = lines.len();
    let mut i = 0;

    while i < n {
        let s = lines[i].trim();
        if s.is_empty() {
            i += 1;
            continue;
        }

        if let Some(c) = h1_re().captures(s) { paras.push(Para::Heading { level: 1, text: c[1].to_string() }); i += 1; continue; }
        if let Some(c) = h2_re().captures(s) { paras.push(Para::Heading { level: 2, text: c[1].to_string() }); i += 1; continue; }
        if let Some(c) = h3_re().captures(s) { paras.push(Para::Heading { level: 3, text: c[1].to_string() }); i += 1; continue; }
        if let Some(c) = h4_re().captures(s) { paras.push(Para::Heading { level: 4, text: c[1].to_string() }); i += 1; continue; }
        if let Some(c) = quote_re().captures(s) { paras.push(Para::Quote { text: c[1].to_string() }); i += 1; continue; }
        if let Some(c) = bold_label_re().captures(s) { paras.push(Para::Labeled { label: c[1].to_string(), body: c[2].to_string() }); i += 1; continue; }

        // Regular paragraph — accumulate until blank
        let mut acc: Vec<&str> = Vec::new();
        while i < n && !lines[i].trim().is_empty() {
            acc.push(lines[i].trim());
            i += 1;
        }
        if !acc.is_empty() {
            paras.push(Para::Body { text: acc.join(" ") });
        }
    }

    paras
}

// ── ZIP builder ──

fn build_docx_zip(paras: &[Para], lang: &str) -> Vec<u8> {
    let mut buf = Cursor::new(Vec::new());
    {
        let mut zip = ZipWriter::new(&mut buf);
        let opts = FileOptions::<()>::default()
            .compression_method(zip::CompressionMethod::Stored);

        zip.start_file("[Content_Types].xml", opts).unwrap();
        zip.write_all(CONTENT_TYPES_XML.as_bytes()).unwrap();

        zip.start_file("_rels/.rels", opts).unwrap();
        zip.write_all(RELS_XML.as_bytes()).unwrap();

        zip.start_file("word/document.xml", opts).unwrap();
        let doc_xml = build_document_xml(paras, lang);
        zip.write_all(doc_xml.as_bytes()).unwrap();

        zip.start_file("word/styles.xml", opts).unwrap();
        zip.write_all(build_styles_xml(lang).as_bytes()).unwrap();

        zip.finish().unwrap();
    }
    buf.into_inner()
}

// ── Static XML fragments ──

const CONTENT_TYPES_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>"#;

const RELS_XML: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="word/styles.xml"/>
</Relationships>"#;

// ── document.xml ──

fn build_document_xml(paras: &[Para], lang: &str) -> String {
    let font = font_name(lang);
    let mut body = String::new();

    for p in paras {
        match p {
            Para::Heading { level, text } => {
                let sz = match level { 1=>32, 2=>28, 3=>24, 4=>22, _=>22 };
                body.push_str(&heading_xml(font, sz, &escape_xml(text)));
            }
            Para::Labeled { label, body: text } => {
                body.push_str(&labeled_xml(font, label, text));
            }
            Para::Quote { text } => {
                body.push_str(&quote_xml(font, &escape_xml(text)));
            }
            Para::Body { text } => {
                body.push_str(&body_xml(font, &escape_xml(text)));
            }
        }
    }

    let sect = format!(r#"<w:sectPr>
    <w:pgSz w:w="{}" w:h="{}"/>
    <w:pgMar w:top="{}" w:right="{}" w:bottom="{}" w:left="{}" w:header="0" w:footer="0" w:gutter="0"/>
  </w:sectPr>"#,
        cm_to_twips(21.0), cm_to_twips(29.7),
        cm_to_twips(2.54), cm_to_twips(2.54),
        cm_to_twips(2.54), cm_to_twips(2.54),
    );

    format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas"
 xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
 xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"
 xmlns:v="urn:schemas-microsoft-com:vml"
 xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
 xmlns:w10="urn:schemas-microsoft-com:office:word"
 xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
 xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml">
  <w:body>
{}
{}</w:body>
</w:document>"#, body, sect)
}

// ── Paragraph XML builders ──

fn run_props(font: &str, sz: u32, bold: bool, italic: bool) -> String {
    let mut s = format!(
        r#"<w:rFonts w:eastAsia="{}" w:ascii="{}" w:hAnsi="{}"/><w:sz w:val="{}"/><w:szCs w:val="{}"/>"#,
        font, font, font, sz, sz
    );
    if bold   { s.push_str("<w:b/><w:bCs/>"); }
    if italic { s.push_str("<w:i/><w:iCs/>"); }
    s
}

fn heading_xml(font: &str, sz: u32, text: &str) -> String {
    format!(
        r#"<w:p><w:pPr><w:spacing w:before="240" w:after="80"/><w:rPr>{}</w:rPr></w:pPr><w:r><w:rPr>{}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        run_props(font, sz, true, false),
        run_props(font, sz, true, false),
        text
    )
}

fn body_xml(font: &str, text: &str) -> String {
    format!(
        r#"<w:p><w:pPr><w:spacing w:after="120"/><w:rPr>{}</w:rPr></w:pPr><w:r><w:rPr>{}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        run_props(font, 21, false, false),
        run_props(font, 21, false, false),
        text
    )
}

fn quote_xml(font: &str, text: &str) -> String {
    format!(
        r#"<w:p><w:pPr><w:ind w:left="{}" w:right="{}"/><w:rPr>{}</w:rPr></w:pPr><w:r><w:rPr>{}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
        cm_to_twips(1.0), cm_to_twips(1.0),
        run_props(font, 20, false, true),
        run_props(font, 20, false, true),
        text
    )
}

fn labeled_xml(font: &str, label: &str, body: &str) -> String {
    let label_full = format!("{}: ", label);
    if body.is_empty() {
        format!(
            r#"<w:p><w:pPr><w:spacing w:after="120"/><w:rPr>{}</w:rPr></w:pPr><w:r><w:rPr>{}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
            run_props(font, 21, true, false),
            run_props(font, 21, true, false),
            escape_xml(&label_full)
        )
    } else {
        format!(
            r#"<w:p><w:pPr><w:spacing w:after="120"/><w:rPr>{}</w:rPr></w:pPr><w:r><w:rPr>{}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r><w:r><w:rPr>{}</w:rPr><w:t xml:space="preserve">{}</w:t></w:r></w:p>"#,
            run_props(font, 21, true, false),
            run_props(font, 21, true, false),
            escape_xml(&label_full),
            run_props(font, 21, false, false),
            escape_xml(body)
        )
    }
}

// ── styles.xml ──

fn build_styles_xml(lang: &str) -> String {
    let font = font_name(lang);
    format!(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:rPr>
      <w:rFonts w:eastAsia="{font}" w:ascii="{font}" w:hAnsi="{font}"/>
      <w:sz w:val="21"/>
      <w:szCs w:val="21"/>
    </w:rPr>
  </w:style>
</w:styles>"#)
}
