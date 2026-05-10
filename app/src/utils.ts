/** Shared utility functions for text processing and JSON extraction. */

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
}

// Known fields for model lookup JSON
const KNOWN_FIELDS = [
  "provider",
  "base_url",
  "pro_model",
  "flash_model",
  "recommended_api_key_env",
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
 * Non-greedy string capture handles multi-line string values.
 */
function extractKnownFields(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  // Normalize markdown links first
  const normalized = replaceMarkdownLinks(text);
  // Also fix smart quotes
  const cleaned = fixSmartQuotes(normalized);

  for (const field of KNOWN_FIELDS) {
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

  // Step 1: Extract JSON block from surrounding text
  let jsonText = extractJson(text);

  // Step 2: Normalize markdown links
  jsonText = replaceMarkdownLinks(jsonText);

  // Step 3: Try strict parse
  try {
    const value = JSON.parse(jsonText);
    return { ok: true, value, warnings };
  } catch {
    // continue to rescue
  }

  // Step 4: Fix smart quotes
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
  } catch {
    // continue to fallback
  }

  // Step 8: Fallback — regex extraction of known fields
  const partial = extractKnownFields(text);
  const foundFields = Object.keys(partial).filter(k => partial[k] !== undefined);
  if (foundFields.length > 0) {
    warnings.push(
      `JSONパースに失敗したため、正規表現で抽出可能なフィールドのみ復元しました（${foundFields.length}件）。`
    );
    return { ok: true, value: partial, warnings };
  }

  // Step 9: Complete failure
  return {
    ok: false,
    error: "JSONをパースできませんでした。貼り付けたテキストを確認してください。",
    warnings,
  };
}
