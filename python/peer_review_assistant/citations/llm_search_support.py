"""LLM-assisted search query generation for unmatched references.

Reads unmatched and suspicious references, sends them to an LLM for
search query generation across multiple sources (Semantic Scholar,
Google Scholar, Web search). The LLM does NOT fabricate reference data —
it only suggests search queries and sources.

Outputs:
  - llm_search_suggestions.json  (machine-readable)
  - llm_search_suggestions.md    (human-readable report)
"""

import json
import os
import time
from datetime import datetime, timezone, timedelta

JST = timezone(timedelta(hours=9))

_BATCH_SIZE = 10


def generate_search_suggestions(project_dir, provider_obj):
    """Run LLM-based search query generation for unmatched references.

    Args:
        project_dir: Path to the project working folder.
        provider_obj: LLMProvider instance configured for the target slot.

    Returns:
        dict with summary counts.
    """
    from peer_review_assistant.llm import chat_completion
    from peer_review_assistant.llm.json_repair import parse_llm_json

    citations_dir = os.path.join(project_dir, "citations")

    # ── Load inputs ──────────────────────────────────────────────────
    refs_path = os.path.join(citations_dir, "references_split.json")
    viewer_path = os.path.join(citations_dir, "citation_viewer_data.json")
    llm_repair_path = os.path.join(citations_dir, "references_repaired_llm.json")

    if not os.path.isfile(refs_path):
        raise FileNotFoundError(
            "references_split.json not found. Run extract-citations first."
        )

    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)

    viewer_data = _load_json_opt(viewer_path)
    viewer_cards = viewer_data.get("cards", {}) if viewer_data else {}
    llm_repair_data = _load_json_opt(llm_repair_path)
    llm_repair_map = {}
    if llm_repair_data:
        for it in llm_repair_data.get("items", []):
            llm_repair_map[it["reference_id"]] = it

    # ── Filter targets ───────────────────────────────────────────────
    targets = []
    for ref in refs["items"]:
        rid = ref["reference_id"]
        card = viewer_cards.get(rid, {})

        status = card.get("status", "unmatched")
        # Skip already verified
        if status == "verified":
            continue

        # Include unmatched, suspicious, error, or googlebooks-only
        llm_item = llm_repair_map.get(rid)
        llm_parsed = llm_item.get("parsed", {}) if llm_item else {}

        targets.append({
            "reference_id": rid,
            "raw_text": ref.get("raw_text", ""),
            "status": status,
            "llm_parsed": llm_parsed,
            "parse_confidence": ref.get("parse_confidence", "low"),
            "possible_missing_doi": (
                llm_item.get("flags", {}).get("possible_missing_doi", False)
                if llm_item else False
            ),
        })

    if not targets:
        return {
            "total_processed": 0,
            "with_suggestions": 0,
            "message": "No targets found — all references are already verified.",
        }

    # ── Process in batches ───────────────────────────────────────────
    all_suggestions = []
    total_batches = (len(targets) + _BATCH_SIZE - 1) // _BATCH_SIZE

    for batch_idx in range(total_batches):
        start = batch_idx * _BATCH_SIZE
        end = min(start + _BATCH_SIZE, len(targets))
        batch = targets[start:end]

        messages = _build_search_suggestions_messages(batch)
        result = chat_completion(
            provider_obj,
            messages,
            max_tokens=4096,
            temperature=0.2,
            timeout_seconds=120,
        )

        if not result["ok"]:
            for t in batch:
                all_suggestions.append({
                    "reference_id": t["reference_id"],
                    "parsed_reference": t["llm_parsed"],
                    "suggested_sources": [],
                    "search_queries": [],
                    "notes": [f"LLM call failed: {result.get('error', 'Unknown')}"],
                    "recommended_action": "defer",
                    "_error": result.get("error"),
                })
            continue

        parsed = parse_llm_json(result["content"])

        if parsed is None:
            for t in batch:
                all_suggestions.append({
                    "reference_id": t["reference_id"],
                    "parsed_reference": t["llm_parsed"],
                    "suggested_sources": [],
                    "search_queries": [],
                    "notes": ["LLM response could not be parsed as JSON"],
                    "recommended_action": "defer",
                })
            continue

        suggestion_items = parsed.get("references") or []
        if not suggestion_items and isinstance(parsed, dict) and "reference_id" in parsed:
            suggestion_items = [parsed]

        batch_ids = {t["reference_id"]: t for t in batch}
        for item in suggestion_items:
            rid = item.get("reference_id", "")
            if rid not in batch_ids:
                continue
            t = batch_ids[rid]
            all_suggestions.append({
                "reference_id": rid,
                "parsed_reference": item.get("parsed_reference", t["llm_parsed"]),
                "suggested_sources": item.get("suggested_sources", []),
                "search_queries": item.get("search_queries", []),
                "notes": item.get("notes", []),
                "recommended_action": item.get("recommended_action", "defer"),
            })

        # Add missing batch items
        returned_ids = {item.get("reference_id", "") for item in suggestion_items}
        for t in batch:
            if t["reference_id"] not in returned_ids:
                all_suggestions.append({
                    "reference_id": t["reference_id"],
                    "parsed_reference": t["llm_parsed"],
                    "suggested_sources": [],
                    "search_queries": [],
                    "notes": ["LLM did not return this reference"],
                    "recommended_action": "defer",
                })

        if batch_idx < total_batches - 1:
            time.sleep(0.5)

    # ── Save outputs ─────────────────────────────────────────────────
    _save_json(citations_dir, all_suggestions, targets)
    _save_markdown(citations_dir, all_suggestions)

    n_with_suggestions = sum(
        1 for s in all_suggestions
        if s.get("search_queries") and "_error" not in s
    )
    n_defer = sum(
        1 for s in all_suggestions
        if s.get("recommended_action") == "defer"
    )

    return {
        "total_processed": len(targets),
        "with_suggestions": n_with_suggestions,
        "deferred": n_defer,
        "batches": total_batches,
        "message": (
            f"LLM search suggestions complete: {len(targets)} references processed "
            f"in {total_batches} batch(es). {n_with_suggestions} with search queries, "
            f"{n_defer} deferred."
        ),
    }


# ── Prompt ──────────────────────────────────────────────────────────────

def _build_search_suggestions_messages(target_refs):
    """Build system + user messages for LLM search query generation."""
    system_prompt = """You are a bibliographic search specialist. Your task is to help find real publications in academic databases by generating effective search queries.

## What to do

For each reference, analyze the available bibliographic data and suggest:
1. Which databases/sources are most likely to have this reference
2. Specific search queries tailored to each source
3. Whether this reference can likely be found at all

## CRITICAL: Do NOT fabricate data

- Do NOT invent DOIs, ISBNs, or other identifiers
- Do NOT guess what the real title/author might be — work only with what's provided
- Your job is to generate SEARCH QUERIES, not to complete the reference

## Source options

Suggest from these sources based on reference characteristics:
- **semantic_scholar**: Best for journal articles, especially older ones, conference papers. Good coverage of life sciences, social sciences.
- **google_scholar**: Broad coverage. Good for hard-to-find articles, theses, reports, books.
- **web_search**: General web search. Good for government documents, reports, preprints, institutional repositories.
- **crossref**: DOI-based journal articles. Only suggest if the reference might have an unrecorded DOI.
- **pubmed**: Biomedical articles. Only suggest for medical/life science topics.
- **google_books**: Books and book chapters only.

## Search query construction

For each suggested source, create a query that:
- Uses exact phrases in double quotes for title fragments
- Includes author surnames
- Includes journal name if available
- Includes year if available
- Is appropriate for the source's search syntax
- Is concise but specific

## Assessing findability

For each reference, set recommended_action to one of:
- **search_semantic_scholar**: Likely findable on Semantic Scholar
- **search_google_scholar**: Likely findable on Google Scholar
- **search_web**: Likely findable via web search
- **search_multiple**: Try multiple sources
- **defer**: Too ambiguous or incomplete to search effectively; flag for human review later

## Output format

Respond ONLY with a JSON object:

```json
{
  "references": [
    {
      "reference_id": "R018",
      "parsed_reference": {
        "authors": ["Daly", "Wilson"],
        "year": 2001,
        "title": "An assessment of some proposed exceptions...",
        "journal": "Ann Zool Fenn",
        "volume": "38",
        "pages": "287-296",
        "doi": null
      },
      "suggested_sources": ["semantic_scholar", "google_scholar"],
      "search_queries": [
        {
          "source": "semantic_scholar",
          "query": "An assessment of some proposed exceptions to the phenomenon of nepotistic discrimination against stepchildren"
        },
        {
          "source": "google_scholar",
          "query": "\\"An assessment of some proposed exceptions\\" \\"Ann Zool Fenn\\" 2001"
        },
        {
          "source": "web_search",
          "query": "\\"Ann Zool Fenn\\" 38 287-296 Daly Wilson"
        }
      ],
      "notes": [
        "DOI not present in manuscript",
        "Older article (2001) — Semantic Scholar may have it even if Crossref does not"
      ],
      "recommended_action": "search_semantic_scholar"
    }
  ]
}
```

## Important rules

1. Always include the reference_id matching the input
2. search_queries should have concrete, copy-pasteable query strings
3. suggested_sources should only include sources where searching makes sense
4. If a reference has no usable fields (no title, no author, no journal), recommend "defer"
5. Respond ONLY with the JSON object — no markdown, no explanation outside the JSON"""

    user_parts = ["# References for Search Query Generation\n"]
    user_parts.append(
        "Below are unmatched references from the manuscript. "
        "For each one, suggest search queries and sources "
        "that could help a human find the real publication.\n"
    )

    for ref in target_refs:
        rid = ref["reference_id"]
        raw = ref.get("raw_text", "")
        status = ref.get("status", "unknown")
        llm_parsed = ref.get("llm_parsed", {})
        missing_doi = ref.get("possible_missing_doi", False)

        user_parts.append(f"## {rid} (status: {status})")
        user_parts.append(f"Original text: `{raw}`")
        if llm_parsed:
            user_parts.append(f"Parsed fields: {json.dumps(llm_parsed, ensure_ascii=False)}")
        if missing_doi:
            user_parts.append("Note: possible_missing_doi = true (journal article without DOI)")
        user_parts.append("")

    user_message = "\n".join(user_parts)

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# ── File writers ──────────────────────────────────────────────────────

def _load_json_opt(path):
    """Load a JSON file if it exists, else None."""
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return None


def _save_json(citations_dir, all_suggestions, targets):
    """Write llm_search_suggestions.json."""
    out_path = os.path.join(citations_dir, "llm_search_suggestions.json")
    output = {
        "generated_at": datetime.now(JST).isoformat(),
        "total_targets": len(targets),
        "total_suggestions": len(all_suggestions),
        "items": all_suggestions,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)


def _save_markdown(citations_dir, all_suggestions):
    """Write llm_search_suggestions.md — human-readable report."""
    lines = [
        "# LLM Search Suggestions Report",
        "",
        f"**Generated**: {datetime.now(JST).isoformat()}",
        "",
        f"**Total references**: {len(all_suggestions)}",
        "",
        "---",
        "",
    ]

    for s in all_suggestions:
        rid = s["reference_id"]
        lines.append(f"## {rid}")
        lines.append(f"**Recommended action**: {s.get('recommended_action', 'defer')}")
        lines.append("")

        parsed = s.get("parsed_reference", {})
        if parsed:
            lines.append("### Parsed Reference")
            if parsed.get("authors"):
                lines.append(f"- Authors: {', '.join(parsed['authors'])}")
            if parsed.get("year"):
                lines.append(f"- Year: {parsed['year']}")
            if parsed.get("title"):
                lines.append(f"- Title: {parsed['title']}")
            if parsed.get("journal"):
                lines.append(f"- Journal: {parsed['journal']}")
            lines.append("")

        sources = s.get("suggested_sources", [])
        if sources:
            lines.append("### Suggested Sources")
            for src in sources:
                lines.append(f"- {src}")
            lines.append("")

        queries = s.get("search_queries", [])
        if queries:
            lines.append("### Search Queries")
            for q in queries:
                lines.append(f"- **{q['source']}**: `{q['query']}`")
            lines.append("")

        notes = s.get("notes", [])
        if notes:
            lines.append("### Notes")
            for note in notes:
                lines.append(f"- {note}")
            lines.append("")

        lines.append("---")
        lines.append("")

    out_path = os.path.join(citations_dir, "llm_search_suggestions.md")
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
