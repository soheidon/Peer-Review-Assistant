"""Section heading normalization for structure check.

Resolves manuscript section headings to canonical names using journal-specific
aliases and position-based disambiguation rules.

Usage:
    from peer_review_assistant.preprocess.section_normalizer import normalize_sections

    result = normalize_sections(section_map, journal_profile)
    # result = {
    #     "sections": [...],        # original sections + canonical_name + classification
    #     "canonical_order": [...], # deduplicated canonical names in document order
    #     "classifications": {...}, # canonical_name -> "front_matter"|"main_text"|"back_matter"
    # }
"""


def normalize_sections(section_map, journal_profile=None):
    """Normalize section headings to canonical names using journal aliases & rules.

    Args:
        section_map: dict with "sections" list. Each section has "name", "heading",
                     "level", "parent_section", "start_paragraph", "end_paragraph".
        journal_profile: Optional dict with "manuscript_structure" containing
                         section_aliases, section_alias_rules, main_text_order,
                         front_matter_sections, back_matter_sections.

    Returns:
        dict with keys: sections (list of normalized section dicts),
        canonical_order (list of canonical_name strings in document order),
        classifications (dict mapping canonical_name to classification).
    """
    sections = section_map.get("sections", []) if section_map else []
    if not sections:
        return {"sections": [], "canonical_order": [], "classifications": {}}

    ms = (journal_profile or {}).get("manuscript_structure", {})
    aliases = ms.get("section_aliases", {}) or {}
    rules = ms.get("section_alias_rules", []) or []
    main_text_order = ms.get("main_text_order", []) or []
    front_matter = ms.get("front_matter_sections", []) or []
    back_matter = ms.get("back_matter_sections", []) or []

    # ── Step 1: Build alias lookup ──
    alias_to_canonical: dict[str, str] = {}
    if aliases:
        for canonical, alias_list in aliases.items():
            for alias in alias_list:
                alias_to_canonical[alias.lower().strip()] = canonical

    # ── Step 2: Parse rules into lookup ──
    rule_lookup: dict[str, list[tuple[str, str]]] = {}
    for rule in rules:
        key = (rule.get("alias") or "").lower().strip()
        canon = rule.get("canonical", "")
        cond = rule.get("condition", "")
        if key and canon:
            rule_lookup.setdefault(key, []).append((canon, cond))

    # ── Step 3: First pass — resolve canonical names via aliases ──
    normalized = []
    for sec in sections:
        heading = (sec.get("heading") or "").strip()
        heading_lower = heading.lower()
        canonical = None

        # 3a. Exact alias match
        if heading_lower in alias_to_canonical:
            canonical = alias_to_canonical[heading_lower]

        # 3b. Substring alias match (e.g. "2.1 Introduction")
        if canonical is None and heading_lower:
            best_len = 0
            for alias_lower, canon_name in alias_to_canonical.items():
                if alias_lower in heading_lower and len(alias_lower) > best_len:
                    canonical = canon_name
                    best_len = len(alias_lower)

        # 3c. Fall back to section_map's existing name
        if canonical is None:
            canonical = sec.get("name")

        normalized.append({
            **sec,
            "canonical_name": canonical,
        })

    # ── Step 4: Second pass — apply position-based rules ──
    for i, sec in enumerate(normalized):
        heading = (sec.get("heading") or "").strip()
        heading_lower = heading.lower()

        if heading_lower in rule_lookup:
            for canon, condition in rule_lookup[heading_lower]:
                if _condition_holds(condition, i, normalized):
                    sec["canonical_name"] = canon
                    break  # first matching rule wins

    # ── Step 5: Classify each section ──
    classifications: dict[str, str] = {}
    for sec in normalized:
        canon = sec["canonical_name"]
        if _is_front_matter(canon, front_matter):
            classifications[sec["name"]] = "front_matter"
        elif _is_back_matter(canon, back_matter):
            classifications[sec["name"]] = "back_matter"
        elif _is_main_text(canon, main_text_order):
            classifications[sec["name"]] = "main_text"
        else:
            classifications[sec["name"]] = "main_text"  # default

    # ── Step 6: Build canonical_order (deduplicated) ──
    canonical_order = []
    seen: set[str] = set()
    for sec in normalized:
        cn = sec["canonical_name"]
        if cn not in seen:
            canonical_order.append(cn)
            seen.add(cn)

    return {
        "sections": normalized,
        "canonical_order": canonical_order,
        "classifications": classifications,
    }


# ── Condition evaluators ─────────────────────────────────────────────────

def _condition_holds(condition: str, idx: int, sections: list[dict]) -> bool:
    """Evaluate a position condition against the current section's document context."""
    sec = sections[idx]

    if condition == "before_introduction":
        for prev in sections[:idx]:
            if prev.get("canonical_name") == "introduction":
                return False
        return True

    if condition == "inside_or_immediately_after_discussion":
        parent = sec.get("parent_section")
        if parent and _canonical_of_parent(parent, sections) == "discussion":
            return True
        if idx > 0 and sections[idx - 1].get("canonical_name") == "discussion":
            return True
        return False

    if condition == "inside_methods":
        parent = sec.get("parent_section")
        if parent and _canonical_of_parent(parent, sections) == "methods":
            return True
        return False

    return False


def _canonical_of_parent(parent_name: str, sections: list[dict]) -> str | None:
    """Find the canonical_name of a section with the given section_map name."""
    for sec in sections:
        if sec.get("name") == parent_name:
            return sec.get("canonical_name")
    return None


# ── Classification helpers ───────────────────────────────────────────────

def _normalize_for_classification(canonical: str) -> str:
    """Strip special suffixes from canonical names for classification matching."""
    for suffix in ("_subsection", "_or_conclusion"):
        if suffix in canonical:
            canonical = canonical.split(suffix)[0]
    return canonical.lower().strip()


def _is_front_matter(canonical: str, front_list: list[str]) -> bool:
    base = _normalize_for_classification(canonical)
    return base in [f.lower().strip() for f in front_list]


def _is_back_matter(canonical: str, back_list: list[str]) -> bool:
    base = _normalize_for_classification(canonical)
    return base in [b.lower().strip() for b in back_list]


def _is_main_text(canonical: str, main_text_order: list[str]) -> bool:
    base = _normalize_for_classification(canonical)
    return base in [m.lower().strip() for m in main_text_order]
