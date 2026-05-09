"""LLM-powered reference flag generation.

Analyzes unmatched/suspicious references with an LLM to determine which ones
need later checking for reference style, bibliographic accuracy, citation
context match, etc.

Outputs reference_llm_flags.json.
"""

import json
import os
import re as _re
from datetime import datetime, timezone, timedelta as _td

JST = timezone(_td(hours=9))


def generate_reference_flags(project_dir, llm_provider):
    """Generate per-reference LLM flags for unmatched references.

    Args:
        project_dir: Path to the project working folder.
        llm_provider: LLMProvider instance for making API calls.

    Returns:
        dict with items list, suitable for writing to reference_llm_flags.json.
    """
    from peer_review_assistant.llm import chat_completion

    citations_dir = os.path.join(project_dir, "citations")

    # Load references
    refs_path = os.path.join(citations_dir, "references_split.json")
    with open(refs_path, "r", encoding="utf-8") as f:
        refs = json.load(f)

    # Load verified IDs (skip already-verified references)
    verified_path = os.path.join(citations_dir, "db_verified_references.json")
    verified_ids = set()
    if os.path.isfile(verified_path):
        with open(verified_path, "r", encoding="utf-8") as f:
            vdata = json.load(f)
        for it in vdata.get("items", []):
            verified_ids.add(it["reference_id"])

    # Load human-verified IDs
    hv_path = os.path.join(citations_dir, "human_verified_references.json")
    hv_ids = set()
    if os.path.isfile(hv_path):
        with open(hv_path, "r", encoding="utf-8") as f:
            hv_data = json.load(f)
        for it in hv_data.get("items", []):
            hv_ids.add(it["reference_id"])

    # Load LLM repair data
    llm_repair_path = os.path.join(citations_dir, "references_repaired_llm.json")
    llm_map = {}
    if os.path.isfile(llm_repair_path):
        with open(llm_repair_path, "r", encoding="utf-8") as f:
            lr_data = json.load(f)
        for it in lr_data.get("items", []):
            llm_map[it["reference_id"]] = it

    # Find unmatched references (not verified, not human-verified)
    unmatched = []
    for ref in refs["items"]:
        rid = ref["reference_id"]
        if rid in verified_ids or rid in hv_ids:
            continue
        unmatched.append(ref)

    if not unmatched:
        return {
            "total_analyzed": 0,
            "items": [],
            "generated_at": datetime.now(JST).isoformat(),
        }

    # Build batch of references for LLM analysis
    ref_summaries = []
    for ref in unmatched:
        rid = ref["reference_id"]
        parsed = ref.get("parsed", {})
        llm_item = llm_map.get(rid, {})
        llm_parsed = llm_item.get("parsed", {})

        title = llm_parsed.get("title") or parsed.get("title") or ""
        authors = llm_parsed.get("authors") or parsed.get("authors") or []
        year = llm_parsed.get("year") or parsed.get("year") or ""
        doi = llm_parsed.get("doi") or parsed.get("doi") or ""
        book_title = llm_parsed.get("book_title") or ""
        publisher = llm_parsed.get("publisher") or ""
        url = llm_parsed.get("url") or ""
        ref_type = llm_parsed.get("type") or ""

        summary = f"{rid}: \"{title[:120]}\""
        if authors:
            summary += f" by {', '.join(authors[:3])}"
        if year:
            summary += f" ({year})"
        if doi:
            summary += f" DOI:{doi}"
        if book_title:
            summary += f" [book: {book_title[:80]}]"
        if publisher:
            summary += f" pub:{publisher}"
        if url:
            summary += f" url:{url[:80]}"
        if ref_type:
            summary += f" type:{ref_type}"
        ref_summaries.append(summary)

    # Build messages for LLM
    system_prompt = _FLAG_SYSTEM_PROMPT
    user_prompt = (
        "以下の未照合文献リストを分析し、各文献にフラグを設定してください。\n\n"
        + "\n".join(ref_summaries)
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    # Call LLM
    result = chat_completion(llm_provider, messages)

    if not result or not result.get("content"):
        return {
            "total_analyzed": 0,
            "items": [],
            "error": "LLM returned empty response",
            "generated_at": datetime.now(JST).isoformat(),
        }

    # Parse JSON from LLM response
    response_text = result["content"]
    items = _parse_flags_response(response_text, unmatched)

    return {
        "total_analyzed": len(unmatched),
        "items": items,
        "generated_at": datetime.now(JST).isoformat(),
    }


_FLAG_SYSTEM_PROMPT = """\
You are a bibliographic metadata analyst. For each reference in the list,
evaluate whether it needs later checking by another LLM pass.

Output a JSON object with an "items" array. Each item has:
- "reference_id": the reference ID (e.g., "R001")
- "llm_flags": object with these boolean fields:
  - "possible_missing_doi": DOI might be obtainable but is missing in current metadata
  - "likely_government_or_web_document": reference is probably a government or web document (has URL, gov domain, etc.)
  - "likely_book": reference is probably a book (has publisher, book title, ISBN, etc.)
  - "year_mismatch_possible_edition": year might be wrong due to edition/reprint differences
  - "metadata_incomplete": key metadata fields (author, year, title, journal, etc.) are missing or unclear
  - "reference_style_needs_check": reference format may not match the target journal's style
  - "bibliographic_accuracy_needs_check": author names, page numbers, volume/issue may have errors
  - "citation_context_needs_check": the citation's purpose in the paper text may not match
  - "needs_later_llm_check": overall flag — true if ANY of the above suggest later LLM review is warranted
- "later_check_targets": array of strings from:
  "reference_style", "bibliographic_accuracy", "metadata_completion", "citation_context_match"

Rules:
- Be conservative: only flag when there's clear evidence of a potential issue.
- For government/web documents with URLs: mark likely_government_or_web_document=true AND needs_later_llm_check=false (these are handled by human "accept as-is").
- For books with clear publisher info: mark likely_book=true. needs_later_llm_check only if other issues exist.
- For journal articles missing DOI: mark possible_missing_doi=true, needs_later_llm_check=true.
- For references where author/year/title all seem complete and correct: needs_later_llm_check=false.
- Output ONLY valid JSON, no markdown, no explanation text.
"""


def _parse_flags_response(response_text, unmatched_refs):
    """Parse LLM JSON response into items list."""
    # Try to extract JSON from the response
    json_str = response_text.strip()

    # Remove markdown code fences if present
    if json_str.startswith("```"):
        lines = json_str.split("\n")
        # Remove first line (```json or ```)
        if lines[0].startswith("```"):
            lines = lines[1:]
        # Remove last line if it's ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        json_str = "\n".join(lines)

    # Try to find JSON object
    match = _re.search(r'\{[\s\S]*\}', json_str)
    if match:
        json_str = match.group(0)

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError:
        # Fallback: return empty flags for all references
        items = []
        for ref in unmatched_refs:
            items.append({
                "reference_id": ref["reference_id"],
                "llm_flags": {
                    "possible_missing_doi": False,
                    "likely_government_or_web_document": False,
                    "likely_book": False,
                    "year_mismatch_possible_edition": False,
                    "metadata_incomplete": False,
                    "reference_style_needs_check": False,
                    "bibliographic_accuracy_needs_check": False,
                    "citation_context_needs_check": False,
                    "needs_later_llm_check": False,
                },
                "later_check_targets": [],
            })
        return items

    # Normalize items
    items = data.get("items", [])
    normalized = []
    for item in items:
        rid = item.get("reference_id", "")
        flags = item.get("llm_flags", {})
        targets = item.get("later_check_targets", [])

        # Ensure all flag fields exist with boolean values
        normalized_flags = {}
        for key in _FLAG_FIELDS:
            normalized_flags[key] = bool(flags.get(key, False))

        normalized.append({
            "reference_id": rid,
            "llm_flags": normalized_flags,
            "later_check_targets": targets,
        })

    return normalized


_FLAG_FIELDS = [
    "possible_missing_doi",
    "likely_government_or_web_document",
    "likely_book",
    "year_mismatch_possible_edition",
    "metadata_incomplete",
    "reference_style_needs_check",
    "bibliographic_accuracy_needs_check",
    "citation_context_needs_check",
    "needs_later_llm_check",
]
