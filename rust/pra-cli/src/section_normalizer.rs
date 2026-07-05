/// Section heading normalization for structure check.
///
/// Port of `python/peer_review_assistant/preprocess/section_normalizer.py`.
/// Resolves manuscript section headings to canonical names using journal-specific
/// aliases and position-based disambiguation rules.
use serde_json::Value;

/// Normalize section headings to canonical names using journal aliases & rules.
///
/// `section_map` is a JSON value with a `"sections"` list.
/// `journal_profile` is an optional JSON value with `manuscript_structure`.
///
/// Returns a JSON value with keys `sections`, `canonical_order`, `classifications`.
pub fn normalize_sections(section_map: &Value, journal_profile: Option<&Value>) -> Value {
    let sections = section_map
        .get("sections")
        .and_then(|s| s.as_array())
        .cloned()
        .unwrap_or_default();

    if sections.is_empty() {
        return serde_json::json!({
            "sections": [],
            "canonical_order": [],
            "classifications": {}
        });
    }

    let ms = journal_profile
        .and_then(|jp| jp.get("manuscript_structure"));

    // Step 1: Build alias_to_canonical lookup
    // aliases is Map<String, Value> mapping canonical name → array of alias strings
    let mut alias_to_canonical: Vec<(String, String)> = Vec::new();
    if let Some(aliases) = ms.and_then(|m| m.get("section_aliases")).and_then(|a| a.as_object()) {
        for (canonical, alias_list) in aliases {
            if let Some(aliases_arr) = alias_list.as_array() {
                for alias in aliases_arr {
                    if let Some(a) = alias.as_str() {
                        let key = a.to_lowercase().trim().to_string();
                        if !key.is_empty() {
                            alias_to_canonical.push((key, canonical.clone()));
                        }
                    }
                }
            }
        }
    }

    // Step 2: Parse rules into lookup
    let rules = ms.and_then(|m| m.get("section_alias_rules")).and_then(|r| r.as_array()).cloned().unwrap_or_default();
    let mut rule_lookup: Vec<(String, Vec<(String, String)>)> = Vec::new();
    for rule in &rules {
        let key = rule
            .get("alias")
            .and_then(|a| a.as_str())
            .map(|s| s.to_lowercase().trim().to_string())
            .unwrap_or_default();
        let canon = rule
            .get("canonical")
            .and_then(|c| c.as_str())
            .unwrap_or("");
        let condition = rule
            .get("condition")
            .and_then(|c| c.as_str())
            .unwrap_or("");
        if !key.is_empty() && !canon.is_empty() {
            let mut found = false;
            for (rk, entries) in rule_lookup.iter_mut() {
                if rk == &key {
                    entries.push((canon.to_string(), condition.to_string()));
                    found = true;
                    break;
                }
            }
            if !found {
                rule_lookup.push((key, vec![(canon.to_string(), condition.to_string())]));
            }
        }
    }

    // Extract config lists for classification
    let main_text_order: Vec<String> = ms.and_then(|m| m.get("main_text_order")).and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase().trim().to_string())).collect())
        .unwrap_or_default();
    let front_matter: Vec<String> = ms.and_then(|m| m.get("front_matter_sections")).and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase().trim().to_string())).collect())
        .unwrap_or_default();
    let back_matter: Vec<String> = ms.and_then(|m| m.get("back_matter_sections")).and_then(|a| a.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(|s| s.to_lowercase().trim().to_string())).collect())
        .unwrap_or_default();

    // Step 3: First pass — resolve canonical names via aliases
    let mut normalized: Vec<Value> = Vec::new();
    for sec in &sections {
        let heading = sec
            .get("heading")
            .and_then(|h| h.as_str())
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let heading_lower = heading.to_lowercase();
        let mut canonical: Option<String> = None;

        // 3a. Exact alias match
        for (alias_lower, canon_name) in &alias_to_canonical {
            if heading_lower == *alias_lower {
                canonical = Some(canon_name.clone());
                break;
            }
        }

        // 3b. Substring alias match — longest wins
        if canonical.is_none() && !heading_lower.is_empty() {
            let mut best_len = 0usize;
            let mut best_canon: Option<&str> = None;
            for (alias_lower, canon_name) in &alias_to_canonical {
                if heading_lower.contains(alias_lower.as_str()) && alias_lower.len() > best_len {
                    best_canon = Some(canon_name.as_str());
                    best_len = alias_lower.len();
                }
            }
            canonical = best_canon.map(String::from);
        }

        // 3c. Fall back to section_map's existing name
        if canonical.is_none() {
            canonical = sec.get("name").and_then(|n| n.as_str()).map(String::from);
        }

        let mut sec_val = sec.clone();
        if let Some(obj) = sec_val.as_object_mut() {
            obj.insert(
                "canonical_name".to_string(),
                Value::String(canonical.unwrap_or_default()),
            );
        }
        normalized.push(sec_val);
    }

    // Step 4: Second pass — apply position-based rules
    // Collect overrides first (needs immutable access to normalized for condition checks)
    let mut overrides: Vec<(usize, String)> = Vec::new();
    for (i, sec) in normalized.iter().enumerate() {
        let heading = sec
            .get("heading")
            .and_then(|h| h.as_str())
            .map(|s| s.trim().to_string())
            .unwrap_or_default();
        let heading_lower = heading.to_lowercase();

        let rules_for_heading: Vec<(String, String)> = rule_lookup
            .iter()
            .find(|(k, _)| k == &heading_lower)
            .map(|(_, entries)| entries.clone())
            .unwrap_or_default();

        for (canon, condition) in &rules_for_heading {
            if condition_holds(condition, i, &normalized) {
                overrides.push((i, canon.clone()));
                break;
            }
        }
    }

    // Apply overrides
    for (i, canon) in &overrides {
        if let Some(obj) = normalized[*i].as_object_mut() {
            obj.insert(
                "canonical_name".to_string(),
                Value::String(canon.clone()),
            );
        }
    }

    // Step 5: Classify each section
    let mut classifications: serde_json::Map<String, Value> = serde_json::Map::new();
    for sec in &normalized {
        let canon = sec
            .get("canonical_name")
            .and_then(|c| c.as_str())
            .unwrap_or("");
        let name = sec.get("name").and_then(|n| n.as_str()).unwrap_or("");

        let class = if is_front_matter(canon, &front_matter) {
            "front_matter"
        } else if is_back_matter(canon, &back_matter) {
            "back_matter"
        } else if is_main_text(canon, &main_text_order) {
            "main_text"
        } else {
            "main_text"
        };
        classifications.insert(name.to_string(), Value::String(class.to_string()));
    }

    // Step 6: Build canonical_order (deduplicated)
    let mut canonical_order: Vec<Value> = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for sec in &normalized {
        let cn = sec
            .get("canonical_name")
            .and_then(|c| c.as_str())
            .unwrap_or("");
        if !cn.is_empty() && seen.insert(cn.to_string()) {
            canonical_order.push(Value::String(cn.to_string()));
        }
    }

    serde_json::json!({
        "sections": normalized,
        "canonical_order": canonical_order,
        "classifications": Value::Object(classifications),
    })
}

// ── Condition evaluators ──

fn condition_holds(condition: &str, idx: usize, sections: &[Value]) -> bool {
    if condition == "before_introduction" {
        for prev in sections.iter().take(idx) {
            if prev
                .get("canonical_name")
                .and_then(|c| c.as_str())
                .map_or(false, |cn| cn == "introduction")
            {
                return false;
            }
        }
        return true;
    }

    if condition == "inside_or_immediately_after_discussion" {
        let parent = sections[idx]
            .get("parent_section")
            .and_then(|p| p.as_str());
        if let Some(parent_name) = parent {
            if canonical_of_parent(parent_name, sections)
                .as_deref()
                == Some("discussion")
            {
                return true;
            }
        }
        if idx > 0
            && sections[idx - 1]
                .get("canonical_name")
                .and_then(|c| c.as_str())
                .map_or(false, |cn| cn == "discussion")
        {
            return true;
        }
        return false;
    }

    if condition == "inside_methods" {
        let parent = sections[idx]
            .get("parent_section")
            .and_then(|p| p.as_str());
        if let Some(parent_name) = parent {
            if canonical_of_parent(parent_name, sections).as_deref() == Some("methods") {
                return true;
            }
        }
        return false;
    }

    false
}

fn canonical_of_parent(parent_name: &str, sections: &[Value]) -> Option<String> {
    for sec in sections {
        if sec.get("name").and_then(|n| n.as_str()) == Some(parent_name) {
            return sec
                .get("canonical_name")
                .and_then(|c| c.as_str())
                .map(String::from);
        }
    }
    None
}

// ── Classification helpers ──

fn normalize_for_classification(canonical: &str) -> String {
    let mut s = canonical.to_string();
    for suffix in &["_subsection", "_or_conclusion"] {
        if let Some(pos) = s.find(suffix) {
            s = s[..pos].to_string();
        }
    }
    s.to_lowercase().trim().to_string()
}

fn is_front_matter(canonical: &str, front_list: &[String]) -> bool {
    let base = normalize_for_classification(canonical);
    front_list.iter().any(|f| f.as_str() == base.as_str())
}

fn is_back_matter(canonical: &str, back_list: &[String]) -> bool {
    let base = normalize_for_classification(canonical);
    back_list.iter().any(|b| b.as_str() == base.as_str())
}

fn is_main_text(canonical: &str, main_text_order: &[String]) -> bool {
    let base = normalize_for_classification(canonical);
    main_text_order
        .iter()
        .any(|m| m.as_str() == base.as_str())
}
