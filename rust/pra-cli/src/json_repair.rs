/// JSON extraction and repair for LLM responses.
///
/// LLMs often wrap JSON in markdown code blocks or add trailing text.
/// This module provides robust extraction, ported from
/// `python/peer_review_assistant/llm/json_repair.py`.
///
/// Strategies are tried in order:
/// 1. Raw `serde_json::from_str` on the entire string
/// 2. Extract from ```json ... ``` markdown code block
/// 3. Extract from ``` ... ``` generic code block
/// 4. Find outermost `{ ... }` or `[ ... ]` braces
/// 5. Truncation repair — close unclosed brackets/quotes

use serde_json::Value;

/// Extract valid JSON from an LLM response string.
///
/// Returns `None` if all strategies fail.
pub fn parse_llm_json(response_text: &str) -> Option<Value> {
    let text = response_text.trim();
    if text.is_empty() {
        return None;
    }

    // Strategy 1: raw parse
    if let Ok(v) = serde_json::from_str(text) {
        return Some(v);
    }

    // Strategy 2: extract from ```json ... ``` block
    if let Some(v) = extract_code_block(text, Some("json")) {
        return Some(v);
    }

    // Strategy 3: extract from ``` ... ``` generic block
    if let Some(v) = extract_code_block(text, None) {
        return Some(v);
    }

    // Strategy 4: find outermost { ... } or [ ... ]
    if let Some(v) = extract_outermost_braces(text) {
        return Some(v);
    }

    // Strategy 5: truncation repair
    repair_truncated_json(text)
}

/// Extract JSON from a markdown code block.
fn extract_code_block(text: &str, language: Option<&str>) -> Option<Value> {
    // Build pattern: ```LANG\n(.*?)```  or  ```\w*\n(.*?)```
    // We scan manually rather than using the regex crate (not yet a dependency).
    let lines: Vec<&str> = text.lines().collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i].trim();
        let is_fence = match language {
            Some(lang) => line == format!("```{}", lang) || line == format!("```{}", lang),
            None => line.starts_with("```"),
        };

        if is_fence {
            // Find matching closing fence
            let mut block_lines = Vec::new();
            let mut found_close = false;
            for j in (i + 1)..lines.len() {
                if lines[j].trim() == "```" {
                    found_close = true;
                    i = j + 1;
                    break;
                }
                block_lines.push(lines[j]);
            }
            if found_close {
                let block_content = block_lines.join("\n").trim().to_string();
                if let Ok(v) = serde_json::from_str(&block_content) {
                    return Some(v);
                }
                // Try extracting from braces inside the block
                if let Some(v) = extract_outermost_braces(&block_content) {
                    return Some(v);
                }
            }
        }
        i += 1;
    }

    None
}

/// Find the outermost `{ ... }` and try to parse it.
/// Note: matches Python behavior — arrays are NOT extracted here.
fn extract_outermost_braces(text: &str) -> Option<Value> {
    let start = text.find('{')?;
    let end = text.rfind('}')?;
    let candidate = &text[start..=end];
    serde_json::from_str(candidate).ok()
}

/// Attempt to salvage truncated JSON by closing unclosed brackets and quotes.
/// Note: matches Python behavior — only handles objects `{...}`, not arrays.
fn repair_truncated_json(text: &str) -> Option<Value> {
    // Find the outermost object start (Python only looks for '{')
    let start = text.find('{')?;
    let truncated = &text[start..];

    // Strategy A: close missing brackets
    let (in_string, stack) = scan_brackets(truncated);

    if stack.is_empty() && !in_string {
        return None; // already balanced — can't be a truncation issue
    }

    let mut repaired = String::from(truncated);

    // If inside a string, close it first
    if in_string {
        repaired.push('"');
    }

    // Close remaining brackets in reverse order
    let closers: String = stack.iter().rev().map(|&ch| closing_bracket(ch)).collect();
    repaired.push_str(&closers);

    if let Ok(v) = serde_json::from_str(&repaired) {
        return Some(v);
    }

    // Strategy B: remove last incomplete field (trailing comma + partial)
    // Find last comma and truncate there, then close
    if let Some(last_comma) = repaired.rfind(',') {
        let cut = &repaired[..last_comma];
        let (_, stack2) = scan_brackets(cut);
        let closers2: String = stack2.iter().rev().map(|&ch| closing_bracket(ch)).collect();
        let cut_repaired = format!("{}{}", cut, closers2);
        if let Ok(v) = serde_json::from_str(&cut_repaired) {
            return Some(v);
        }
    }

    None
}

/// Scan through a JSON fragment, tracking bracket depth and string state.
/// Returns (in_string, stack_of_open_brackets).
fn scan_brackets(s: &str) -> (bool, Vec<char>) {
    let mut stack: Vec<char> = Vec::new();
    let mut in_string = false;
    let mut escape = false;
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let ch = chars[i];

        if escape {
            escape = false;
            i += 1;
            continue;
        }

        if ch == '\\' {
            escape = true;
            i += 1;
            continue;
        }

        if in_string {
            if ch == '"' {
                in_string = false;
            }
            i += 1;
            continue;
        }

        match ch {
            '"' => in_string = true,
            '{' => stack.push('{'),
            '[' => stack.push('['),
            '}' => {
                if stack.last() == Some(&'{') {
                    stack.pop();
                }
            }
            ']' => {
                if stack.last() == Some(&'[') {
                    stack.pop();
                }
            }
            _ => {}
        }

        i += 1;
    }

    (in_string, stack)
}

fn closing_bracket(open: char) -> char {
    match open {
        '{' => '}',
        '[' => ']',
        _ => open,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── Strategy 1: raw parse ──────────────────────────────────────────

    #[test]
    fn raw_parse_valid_object() {
        let result = parse_llm_json(r#"{"key": "value"}"#);
        assert!(result.is_some());
        let v = result.unwrap();
        assert_eq!(v["key"], "value");
    }

    #[test]
    fn raw_parse_valid_array() {
        let result = parse_llm_json(r#"[{"a": 1}, {"b": 2}]"#);
        assert!(result.is_some());
        let v = result.unwrap();
        assert!(v.is_array());
        assert_eq!(v.as_array().unwrap().len(), 2);
    }

    #[test]
    fn empty_string_returns_none() {
        assert!(parse_llm_json("").is_none());
        assert!(parse_llm_json("   ").is_none());
    }

    // ── Strategy 2: ```json fence ──────────────────────────────────────

    #[test]
    fn extract_json_code_block() {
        let input = r#"Here is the result:
```json
{"status": "ok", "count": 42}
```
That's all."#;
        let result = parse_llm_json(input);
        assert!(result.is_some());
        let v = result.unwrap();
        assert_eq!(v["status"], "ok");
        assert_eq!(v["count"], 42);
    }

    // ── Strategy 3: ``` generic fence ──────────────────────────────────

    #[test]
    fn extract_generic_code_block() {
        let input = r#"```
{"data": [1, 2, 3]}
```"#;
        let result = parse_llm_json(input);
        assert!(result.is_some());
        let v = result.unwrap();
        assert_eq!(v["data"].as_array().unwrap().len(), 3);
    }

    // ── Strategy 4: outermost braces ───────────────────────────────────

    #[test]
    fn extract_with_trailing_text() {
        let input = r#"The answer is {"score": 95, "pass": true}. Hope this helps!"#;
        let result = parse_llm_json(input);
        assert!(result.is_some());
        let v = result.unwrap();
        assert_eq!(v["score"], 95);
        assert_eq!(v["pass"], true);
    }

    #[test]
    fn extract_outermost_array_not_supported() {
        // Python json_repair does NOT extract arrays from trailing text.
        // Strategy 4 only handles { ... }, and Strategy 5 only repairs { ... }.
        let input = r#"Results: [{"id": 1}, {"id": 2}] end."#;
        assert!(parse_llm_json(input).is_none());
    }

    // ── Strategy 5: truncation repair ──────────────────────────────────

    #[test]
    fn repair_truncated_missing_braces() {
        let input = r#"{"findings": [{"issue": "needs work", "severity": "major""#;
        let result = parse_llm_json(input);
        assert!(result.is_some());
        let v = result.unwrap();
        assert_eq!(
            v["findings"][0]["issue"],
            "needs work"
        );
    }

    #[test]
    fn repair_truncated_mid_string() {
        let input = r#"{"title": "Introduction to"#;
        let result = parse_llm_json(input);
        assert!(result.is_some());
    }

    #[test]
    fn repair_truncated_trailing_comma() {
        // Trailing comma before truncation — Strategy B kicks in
        let input = r#"{"items": ["a", "b", "#;
        let result = parse_llm_json(input);
        assert!(result.is_some());
    }

    #[test]
    fn unrepairable_returns_none() {
        assert!(parse_llm_json("not json at all").is_none());
        assert!(parse_llm_json("still not { valid").is_none());
    }

    // ── Value-level comparison tests ───────────────────────────────────
    // These match Python json_repair.parse_llm_json() behavior

    #[test]
    fn value_equality_object() {
        // Python would return the same parsed object
        let py_output: Value = serde_json::from_str(
            r#"{"a":1,"b":2}"#
        ).unwrap();
        let rs_output = parse_llm_json(r#"{"a":1,"b":2}"#).unwrap();
        // Compare as Value, not as string
        assert_eq!(rs_output, py_output);
    }

    #[test]
    fn value_equality_with_whitespace() {
        // Key order and whitespace don't matter
        let py_output: Value = serde_json::from_str(
            r#"{"a": 1,"b": 2}"#
        ).unwrap();
        let rs_output = parse_llm_json(r#"{
  "b": 2,
  "a": 1
}"#).unwrap();
        assert_eq!(rs_output, py_output);
    }

    #[test]
    fn value_equality_array() {
        let py_output: Value = serde_json::from_str(r#"[1,2,3]"#).unwrap();
        let rs_output = parse_llm_json(r#"[1, 2, 3]"#).unwrap();
        assert_eq!(rs_output, py_output);
    }
}
