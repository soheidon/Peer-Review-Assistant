/** Shared utility functions for text processing and JSON extraction. */

// ── Section-relative paragraph numbering ──

export interface SectionInfo {
  name: string;
  heading: string | null;
  start_paragraph: number;  // 0-based index
  end_paragraph: number;    // 0-based index
  level: number | null;
  parent_section: string | null;
}

export interface RelativeParagraphInfo {
  sectionName: string;
  relativeNumber: number;   // 1-based position within the section (body paragraphs only; heading is skipped)
  isHeading: boolean;       // true if this paragraph IS the section heading itself
}

/**
 * Convert a global paragraph_number (1-based, as returned by LLM) into
 * section-relative info.  Finds the deepest section containing the paragraph
 * and computes its 1-based position within that section's *body* paragraphs
 * (the heading paragraph, if present, is skipped).
 *
 * Returns null when the paragraph falls outside all known sections.
 */
export function getRelativeParagraphInfo(
  globalParagraphNumber: number,
  sections: SectionInfo[],
): RelativeParagraphInfo | null {
  const idx = globalParagraphNumber - 1; // convert to 0-based index

  // Find the deepest section that contains this paragraph index
  let best: SectionInfo | null = null;
  let bestLevel = -1;
  for (const sec of sections) {
    if (sec.start_paragraph == null || sec.end_paragraph == null) continue;
    if (idx >= sec.start_paragraph && idx <= sec.end_paragraph) {
      const lv = sec.level ?? 0;
      if (lv >= bestLevel) {
        bestLevel = lv;
        best = sec;
      }
    }
  }

  if (!best) return null;

  // Sections at level >= 1 start with a heading paragraph.
  // The heading occupies the first paragraph — body paragraphs start after it.
  const hasHeading = best.level != null && best.level >= 1;
  const isHeading = hasHeading && idx === best.start_paragraph;

  // Relative position: count from the first *body* paragraph.
  // If the section has a heading, body starts at start_paragraph + 1.
  const bodyStart = hasHeading ? best.start_paragraph + 1 : best.start_paragraph;
  const relativeNumber = hasHeading
    ? idx - best.start_paragraph  // heading = 0, first body = 1, second body = 2, …
    : idx - best.start_paragraph + 1; // no heading → 1-based from first paragraph

  return {
    sectionName: best.name,
    relativeNumber: isHeading ? 0 : relativeNumber,
    isHeading,
  };
}

/**
 * Format section-relative paragraph location for display.
 * Returns a string like "from Discussion, Paragraph 2, Line 281" or null.
 *
 * Uses section_map-based relative numbering when available; falls back to
 * global paragraph numbers when the section info is missing or the range
 * spans multiple sections.
 */
export function formatParagraphLocation(
  section: string | undefined,
  pStart: number | undefined,
  pEnd: number | undefined,
  sectionMap: SectionInfo[],
  lineStart: number | undefined,
  lineEnd: number | undefined,
): string | null {
  const parts: string[] = [];

  // Compute relative info for start (and end, if different)
  const relStart = pStart != null ? getRelativeParagraphInfo(pStart, sectionMap) : null;
  const relEnd = pEnd != null && pEnd !== pStart ? getRelativeParagraphInfo(pEnd, sectionMap) : relStart;

  // Section name: prefer the section_map canonical name, fall back to LLM's name
  const displaySection = relStart?.sectionName || section;
  if (displaySection && displaySection.trim()) {
    parts.push(`from ${displaySection}`);
  }

  // Paragraph number
  if (pStart != null && relStart) {
    if (relStart.isHeading) {
      // Heading paragraph — skip the "Paragraph N" since it's the heading itself.
      // The section name already indicates where we are.
    } else if (relStart.relativeNumber > 0) {
      // Check if start and end are in the same section (consistent relative numbering)
      const sameSection = relEnd && relEnd.sectionName === relStart.sectionName;
      if (pStart === pEnd || pEnd == null) {
        parts.push(`Paragraph ${relStart.relativeNumber}`);
      } else if (sameSection) {
        const relEndNum = relEnd!.relativeNumber;
        parts.push(`Paragraph ${relStart.relativeNumber === relEndNum ? relStart.relativeNumber : `${relStart.relativeNumber}–${relEndNum}`}`);
      } else {
        // Cross-section range — fall back to global numbering
        parts.push(`Paragraph ${pStart}–${pEnd}`);
      }
    }
  } else if (pStart != null) {
    // Fallback: no section info, use global number
    parts.push(`Paragraph ${pStart === pEnd ? pStart : `${pStart}–${pEnd}`}`);
  }

  // Line number
  if (lineStart != null || lineEnd != null) {
    parts.push(`Line ${lineStart || "?"}${lineEnd && lineEnd !== lineStart ? `–${lineEnd}` : ""}`);
  }

  return parts.length > 0 ? parts.join(", ") : null;
}

/** Strip CR, LF, TAB, and trim whitespace from a single-line field.
 *  Use for provider, baseUrl, model, env names — any field that must
 *  never contain control characters.  Does NOT touch API key values
 *  (which may legitimately contain any printable character). */
export function sanitizeSingleLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, "").trim();
}

/** Sanitize a URL field: remove all control characters + trim + strip trailing slash. */
export function sanitizeUrl(value: string): string {
  return sanitizeSingleLine(value).replace(/\/+$/, "");
}

/** Result of parseLooseJsonObject — always returns a value or an error reason. */
export interface LooseParseResult {
  ok: boolean;
  value?: Record<string, unknown>;
  warnings: string[];
  error?: string;
  /** If JSON.parse threw, the original error message for diagnostics. */
  parseError?: string;
}

// Top-level fields for model lookup JSON (lightweight fallback)
const MODEL_LOOKUP_FIELDS = [
  "provider",
  "base_url",
  "pro_model",
  "flash_model",
  "recommended_api_key_env",
  "notes",
];

// Top-level fields for journal profile (used in parseExternalResult fallback).
// These are the root keys — nested objects are recovered via deepMerge with defaults.
const JOURNAL_PROFILE_FIELDS = [
  "journal_name",
  "journal_url",
  "publisher",
  "article_type",
  "source",
  "source_details",
  "updated_at",
  "notes",
];

/** Extract valid JSON from text that may contain markdown, explanations, etc. */
export function extractJson(text: string): string {
  // 1. Try ```json ... ``` code block first
  const codeBlock = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    const inner = codeBlock[1].trim();
    try { JSON.parse(inner); return inner; } catch { /* fall through */ }
  }
  // 2. Try { ... } range (first { to last })
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1);
  }
  // 3. Return original
  return text;
}

/**
 * Normalize Markdown links to plain URL strings.
 * [label](url) → url
 */
export function replaceMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (_match, _label, url) => {
    return url;
  });
}

/** Replace smart/curly quotes with straight ASCII quotes. */
function fixSmartQuotes(text: string): string {
  return text
    .replace(/[“”„‟″‶]/g, '"')  // double quotes
    .replace(/[‘’‚‛′‵]/g, "'"); // single quotes
}

/** Remove trailing commas before } or ] (common LLM output artifact). */
function removeTrailingCommas(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Escape raw newlines (and other control characters) that appear inside
 * JSON string literals.  Walks the text character by character, tracking
 * whether we are currently inside a double-quoted string.
 */
function escapeNewlinesInStrings(text: string): string {
  const out: string[] = [];
  let inString = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (ch === '"' && (i === 0 || text[i - 1] !== '\\')) {
      // Toggle string state on unescaped double quote
      inString = !inString;
      out.push(ch);
    } else if (inString) {
      if (ch === '\n') {
        out.push('\\n');
      } else if (ch === '\r') {
        // skip \r (or replace with \\r)
        if (i + 1 < text.length && text[i + 1] === '\n') {
          // \r\n → \n
          out.push('\\n');
          i++; // skip the \n
        } else {
          out.push('\\n');
        }
      } else if (ch === '\t') {
        out.push('\\t');
      } else if (ch === '\\' && i + 1 < text.length) {
        // Preserve existing escape sequences
        const next = text[i + 1];
        if ('"\\/bfnrtu'.includes(next)) {
          out.push(ch);
        } else {
          // Unknown escape — keep as-is
          out.push(ch);
        }
      } else {
        out.push(ch);
      }
    } else {
      out.push(ch);
    }
    i++;
  }

  return out.join('');
}

/**
 * Last-resort: extract known JSON fields via regex.
 * Returns a partial object with whatever fields could be found.
 * Accepts an optional field list; defaults to MODEL_LOOKUP_FIELDS.
 */
function extractKnownFields(
  text: string,
  fields: string[] = MODEL_LOOKUP_FIELDS,
): Record<string, string> {
  const result: Record<string, string> = {};

  // Normalize markdown links first
  const normalized = replaceMarkdownLinks(text);
  // Also fix smart quotes
  const cleaned = fixSmartQuotes(normalized);

  for (const field of fields) {
    // Match "field": "value" — value may contain escaped chars but capture
    // everything between the first and last unescaped quote
    const regex = new RegExp(
      `"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`,
      's'
    );
    const match = cleaned.match(regex);
    if (match) {
      // Unescape common JSON escapes within the captured value
      result[field] = match[1]
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
    }
  }
  return result;
}

/**
 * Extract top-level journal profile fields as a best-effort fallback.
 * Used by JournalPanel's parseExternalResult when JSON.parse fails.
 */
export function extractJournalProfileFields(text: string): Record<string, unknown> {
  return extractKnownFields(text, JOURNAL_PROFILE_FIELDS);
}

/**
 * Robustly parse a JSON object from LLM output that may contain:
 * - Markdown code fences
 * - Markdown link syntax [url](url)
 * - Smart/curly quotes
 * - Raw newlines inside string values
 * - Trailing commas
 *
 * Returns { ok: true, value, warnings } on success or partial success.
 * Returns { ok: false, error } only when absolutely nothing could be recovered.
 */
export function parseLooseJsonObject(text: string): LooseParseResult {
  const warnings: string[] = [];
  let parseError: string | undefined;

  // Step 1: Extract JSON block from surrounding text
  let jsonText = extractJson(text);

  // Step 2: Try raw parse first (markdown links are valid inside JSON strings!)
  try {
    const value = JSON.parse(jsonText);
    return { ok: true, value, warnings };
  } catch (e) {
    parseError = e instanceof Error ? e.message : String(e);
    // continue to rescue
  }

  // Step 3: Try after markdown link normalization (may fix some edge cases but
  // can also break valid JSON — hence only used as fallback)
  let mdFixed = replaceMarkdownLinks(jsonText);
  try {
    const value = JSON.parse(mdFixed);
    warnings.push("MarkdownリンクをURLに変換しました。");
    return { ok: true, value, warnings };
  } catch {
    // continue to rescue
  }

  // Step 4: Fix smart quotes on the original (not md-fixed) text
  let rescued = fixSmartQuotes(jsonText);

  // Step 5: Escape raw newlines inside strings
  rescued = escapeNewlinesInStrings(rescued);

  // Step 6: Remove trailing commas
  rescued = removeTrailingCommas(rescued);

  // Step 7: Try parsing the rescued text
  try {
    const value = JSON.parse(rescued);
    warnings.push("JSON内の改行・特殊文字を修正しました。");
    return { ok: true, value, warnings };
  } catch (e) {
    if (!parseError) {
      parseError = e instanceof Error ? e.message : String(e);
    }
    // continue to fallback
  }

  // Step 8: Fallback — regex extraction of known fields (model lookup)
  const partial = extractKnownFields(text);
  const foundFields = Object.keys(partial).filter(k => partial[k] !== undefined && partial[k] !== "");
  if (foundFields.length > 0) {
    warnings.push(
      `JSONパースに失敗したため、正規表現で抽出可能なフィールドのみ復元しました（${foundFields.length}件）。`
    );
    return { ok: true, value: partial, warnings, parseError };
  }

  // Step 9: Complete failure
  return {
    ok: false,
    error: "JSONをパースできませんでした。貼り付けたテキストを確認してください。",
    warnings,
    parseError,
  };
}

/**
 * Walk a parsed JSON object/array and normalize markdown links in all string values.
 * [label](url) → url
 * This is safe because it operates on already-parsed data, not raw JSON text.
 */
export function normalizeMarkdownLinksInObject(obj: unknown): void {
  if (Array.isArray(obj)) {
    for (const item of obj) normalizeMarkdownLinksInObject(item);
  } else if (obj !== null && typeof obj === "object") {
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const val = (obj as Record<string, unknown>)[key];
      if (typeof val === "string") {
        (obj as Record<string, unknown>)[key] = replaceMarkdownLinks(val);
      } else if (typeof val === "object") {
        normalizeMarkdownLinksInObject(val);
      }
    }
  }
}

/** Simple Markdown-to-HTML renderer for viewer content.
 *  Line-by-line approach handling headings, bold, lists, code blocks, links, and paragraphs. */
export function renderMarkdown(md: string): string {
  if (!md) return "";

  const lines = md.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  let inCodeBlock = false;
  let codeContent = "";
  let codeLang = "";
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let listOrdered = false;
  let tableRows: string[] = [];
  let inTable = false;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      out.push("<p>" + inlineFormat(paragraph.join("\n")) + "</p>");
      paragraph = [];
    }
  };

  const flushList = () => {
    if (listItems.length > 0) {
      const tag = listOrdered ? "ol" : "ul";
      const items = listItems.map(item => "<li>" + inlineFormat(item) + "</li>").join("");
      out.push(`<${tag}>${items}</${tag}>`);
      listItems = [];
      listOrdered = false;
    }
  };

  const flushTable = () => {
    if (tableRows.length < 2) {
      tableRows = [];
      inTable = false;
      return;
    }
    const html: string[] = ["<table>"];
    // First row is header
    const headerCells = tableRows[0].split("|").filter(c => c.trim() !== "");
    html.push("<thead><tr>");
    for (const cell of headerCells) {
      html.push("<th>" + inlineFormat(cell.trim()) + "</th>");
    }
    html.push("</tr></thead>");
    // Skip separator row (index 1), process body rows from index 2
    html.push("<tbody>");
    for (let r = 2; r < tableRows.length; r++) {
      const cells = tableRows[r].split("|").filter(c => c.trim() !== "");
      html.push("<tr>");
      for (const cell of cells) {
        html.push("<td>" + inlineFormat(cell.trim()) + "</td>");
      }
      html.push("</tr>");
    }
    html.push("</tbody></table>");
    out.push(html.join(""));
    tableRows = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code block fence
    if (line.trim().startsWith("```")) {
      if (!inCodeBlock) {
        flushParagraph();
        flushList();
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
        codeContent = "";
      } else {
        out.push(`<pre><code>${escapeHtml(codeContent.trim())}</code></pre>`);
        inCodeBlock = false;
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += (codeContent ? "\n" : "") + line;
      continue;
    }

    // GFM pipe table
    const isTableLine = /^\|.+\|$/.test(line.trim());
    if (isTableLine) {
      if (!inTable) {
        flushParagraph();
        flushList();
        inTable = true;
      }
      tableRows.push(line.trim());
      continue;
    }
    if (inTable && !isTableLine) {
      flushTable();
      // fall through to process this line normally
    }

    // Blank line — flush accumulated blocks
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    // Heading
    const hMatch = line.match(/^(#{1,4}) (.+)$/);
    if (hMatch) {
      flushParagraph();
      flushList();
      const level = hMatch[1].length;
      out.push(`<h${level}>${inlineFormat(hMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^---\s*$/.test(line)) {
      flushParagraph();
      flushList();
      out.push("<hr>");
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^- (.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listOrdered) flushList();
      listItems.push(ulMatch[1]);
      listOrdered = false;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\. (.+)$/);
    if (olMatch) {
      flushParagraph();
      if (!listOrdered && listItems.length > 0) flushList();
      listItems.push(olMatch[1]);
      listOrdered = true;
      continue;
    }

    // Regular text — accumulate paragraph
    flushList();
    paragraph.push(line);
  }

  flushTable();
  flushParagraph();
  flushList();

  return out.join("\n");
}

/** Escape HTML and apply inline formatting (bold, italic, code, links). */
function inlineFormat(text: string): string {
  // Step 1: Extract and protect inline code spans BEFORE HTML escaping.
  // This prevents <>& inside code from being double-escaped.
  const codeSpans: string[] = [];
  let html = text.replace(/`([^`]+)`/g, (_match, code) => {
    codeSpans.push(code);
    return `\x00CODE${codeSpans.length - 1}\x00`;
  });

  // Step 2: Escape HTML special characters in the rest of the text
  html = escapeHtml(html);

  // Step 3: Bold (before italic so ** doesn't conflict with *)
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Step 4: Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Step 5: Links [text](url)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');

  // Step 6: Restore code spans (escape their content for safety)
  html = html.replace(/\x00CODE(\d+)\x00/g, (_match, idx) => {
    return `<code>${escapeHtml(codeSpans[parseInt(idx, 10)])}</code>`;
  });

  return html;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
