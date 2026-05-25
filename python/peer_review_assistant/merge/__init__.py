"""Check result merging.

Merges individual reviewer raw.json outputs into merged.section.json
using rule-based deduplication and priority sorting.
"""

import json
import os
import re


def merge_section(check_name, project_dir):
    """Merge individual reviewer raw.json files into a unified section result.

    Args:
        check_name: str, e.g. "structure"
        project_dir: path to project folder

    Returns:
        dict with keys:
            merged: the merged output dict (check_name, status, sources, summary, comments, conflicts)
            source_count: int
            total_findings: int
            merged_count: int

    Raises:
        FileNotFoundError if no raw.json files exist
    """
    raw_results = _load_raw_results(check_name, project_dir)
    if not raw_results:
        raise FileNotFoundError(
            f"No raw.json files found in outputs/{check_name}/"
        )

    # Build sources summary
    sources = []
    for r in raw_results:
        sources.append({
            "source": r.get("source", "unknown"),
            "status": r.get("status", "unknown"),
            "model": r.get("model"),
            "finding_count": len(r.get("findings", [])),
        })

    # Collect all findings with source attribution
    all_findings = []
    for r in raw_results:
        source_name = r.get("source", "unknown")
        for f in r.get("findings", []):
            f_with_source = dict(f)
            f_with_source["_source"] = source_name
            all_findings.append(f_with_source)

    # Cluster findings by token overlap (section-aware fuzzy dedup)
    JACCARD_THRESHOLD = 0.25
    clusters = _cluster_findings(all_findings, threshold=JACCARD_THRESHOLD)

    # Merge each cluster into a comment
    merged_comments = []
    for cluster in clusters:
        comment = _merge_finding_group(cluster, check_name, len(merged_comments) + 1)
        merged_comments.append(comment)

    # Sort: major first, then by confidence within severity
    severity_order = {"major": 0, "minor": 1}
    confidence_order = {"high": 0, "medium": 1, "low": 2}
    merged_comments.sort(key=lambda c: (
        severity_order.get(c.get("severity", "minor"), 2),
        confidence_order.get(c.get("confidence", "low"), 3),
    ))

    # Re-assign sequential IDs after sort
    for i, c in enumerate(merged_comments):
        c["comment_id"] = f"{check_name}_{i + 1:03d}"

    # Detect conflicts
    conflicts = _detect_conflicts(all_findings, merged_comments, check_name)

    # Build combined summary
    summaries = [r.get("summary", "") for r in raw_results if r.get("summary")]
    # Strip [Part A]/[Part B] labels (leftover from split expression check old caches)
    cleaned = []
    for s in summaries:
        s = re.sub(r'^\s*\[Part [AB]\]\s*', '', s, flags=re.MULTILINE)
        cleaned.append(s)
    combined_summary = "\n\n".join(cleaned) if cleaned else "No summary available."

    merged = {
        "check_name": check_name,
        "status": "done",
        "generated_at": None,  # filled by caller
        "sources": sources,
        "summary": combined_summary,
        "comments": merged_comments,
        "conflicts": conflicts,
    }

    return {
        "merged": merged,
        "source_count": len(raw_results),
        "total_findings": len(all_findings),
        "merged_count": len(merged_comments),
    }


def _load_raw_results(check_name, project_dir):
    """Load all *.raw.json files from outputs/{check_name}/.

    Returns:
        list of parsed dicts, sorted by source name.
    """
    out_dir = os.path.join(project_dir, "outputs", check_name)
    if not os.path.isdir(out_dir):
        return []

    results = []
    for fname in sorted(os.listdir(out_dir)):
        if fname.endswith(".raw.json"):
            path = os.path.join(out_dir, fname)
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                if data.get("status") == "done":
                    results.append(data)

    return results


def _normalize_text(finding):
    """Create a normalized text fingerprint for fuzzy dedup matching.

    Combines section, category, issue, and suggested_comment into
    a single lowercased, punctuation-stripped token sequence.
    """
    section = (finding.get("location", {}) or {}).get("section", "") or ""
    category = finding.get("category", "") or ""
    issue = finding.get("issue", "") or ""
    suggestion = finding.get("suggested_comment", "") or ""

    text = f"{section} {category} {issue} {suggestion}".lower()
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _token_overlap(text1, text2):
    """Compute Jaccard similarity of word tokens between two normalized texts.

    Returns 0.0–1.0.
    """
    tokens1 = set(text1.split())
    tokens2 = set(text2.split())
    if not tokens1 and not tokens2:
        return 1.0
    if not tokens1 or not tokens2:
        return 0.0
    return len(tokens1 & tokens2) / len(tokens1 | tokens2)


def _cluster_findings(all_findings, threshold=0.25):
    """Group findings into clusters using greedy token-overlap clustering.

    Hard constraints:
    - Findings must reference the same section name to be merged.
    - Findings from the same source (reviewer) are never merged (a single
      reviewer does not submit duplicate findings about the same issue).

    Within the same section and across different sources, Jaccard token
    overlap on normalized issue+category+suggestion text determines
    cluster membership.

    Args:
        all_findings: list of finding dicts with _source key
        threshold: minimum Jaccard similarity for cluster membership

    Returns:
        list of [findings] groups
    """
    normalized = [_normalize_text(f) for f in all_findings]

    clusters = []  # list of [findings]

    for i, finding in enumerate(all_findings):
        sec_i = (finding.get("location", {}) or {}).get("section", "") or ""
        src_i = finding.get("_source", "")

        best_idx = -1
        best_score = 0.0

        for j, cluster_findings in enumerate(clusters):
            rep = cluster_findings[0]
            cluster_sec = (rep.get("location", {}) or {}).get("section", "") or ""
            cluster_src = rep.get("_source", "")

            # Hard constraint: same section
            if sec_i != cluster_sec:
                continue

            # Hard constraint: different source (no intra-reviewer merging)
            if src_i == cluster_src:
                continue

            # Compare against representative (first finding in cluster)
            score = _token_overlap(normalized[i], _normalize_text(rep))
            if score > best_score:
                best_score = score
                best_idx = j

        if best_score >= threshold:
            clusters[best_idx].append(finding)
        else:
            clusters.append([finding])

    return clusters


def _merge_finding_group(group, check_name, index):
    """Merge a group of related findings into a single comment.

    Args:
        group: list of finding dicts (with _source key added)
        check_name: str
        index: int, 1-based index for comment_id

    Returns:
        merged comment dict
    """
    # Pick representative: prefer one with most detail (longest issue+suggested_comment)
    def _detail_len(f):
        return len(f.get("issue", "")) + len(f.get("suggested_comment", ""))

    group.sort(key=_detail_len, reverse=True)
    best = group[0]

    # Severity: pick highest
    severity = "major" if any(f.get("severity") == "major" for f in group) else "minor"

    # Confidence: pick highest
    conf_order = {"high": 0, "medium": 1, "low": 2}
    group.sort(key=lambda f: conf_order.get(f.get("confidence", "low"), 3))
    confidence = group[0].get("confidence", "low")

    # Source findings reference
    source_ids = [f.get("finding_id", "?") for f in group]
    source_names = sorted(set(f.get("_source", "?") for f in group))

    # Evidence string
    if len(source_names) == 1:
        evidence = f"{source_names[0]} flagged this issue."
    elif len(source_names) == 2:
        evidence = f"{source_names[0]} and {source_names[1]} both flagged this issue."
    else:
        names = ", ".join(source_names[:-1])
        evidence = f"{names}, and {source_names[-1]} all flagged this issue."

    # Conflict detection within group: if severities differ
    severities = set(f.get("severity") for f in group)
    conflict = len(severities) > 1

    # Build reviewer note for conflicts
    reviewer_note = ""
    if conflict:
        notes = []
        for f in group:
            notes.append(f"{f['_source']}: severity={f.get('severity', '?')}")
        reviewer_note = "Severity disagreement between reviewers: " + "; ".join(notes)

    return {
        "comment_id": f"{check_name}_{index:03d}",
        "severity": severity,
        "category": best.get("category", "Structure"),
        "location": best.get("location", {}),
        "issue": best.get("issue", ""),
        "evidence": evidence,
        "suggested_author_comment": best.get("suggested_comment", ""),
        "reviewer_note": reviewer_note,
        "confidence": confidence,
        "conflict": conflict,
        "source_findings": source_ids,
    }


def _detect_conflicts(all_findings, merged_comments, check_name):
    """Detect conflicts across merged comments.

    A conflict exists when findings about the same section have
    opposite severity assessments from different reviewers.

    Returns:
        list of conflict dicts
    """
    conflicts = []
    # Check for same-location different-severity across different merged groups
    for i, c1 in enumerate(merged_comments):
        loc1 = c1.get("location", {}) or {}
        sec1 = loc1.get("section", "")
        if not sec1:
            continue
        for j, c2 in enumerate(merged_comments):
            if j <= i:
                continue
            loc2 = c2.get("location", {}) or {}
            sec2 = loc2.get("section", "")
            if sec1 == sec2 and c1["severity"] != c2["severity"]:
                conflicts.append({
                    "conflict_id": f"{check_name}_conflict_{len(conflicts) + 1:03d}",
                    "description": (
                        f"Different severity opinions for {sec1}: "
                        f"one reviewer assessed as {c1['severity']}, "
                        f"another as {c2['severity']}."
                    ),
                    "resolution": "Flagged for reviewer confirmation.",
                })
                break  # one conflict per pair

    return conflicts


def _build_markdown(merged):
    """Generate a human-readable markdown file from merged output.

    Args:
        merged: the merged output dict

    Returns:
        str: markdown content
    """
    check_name = merged.get("check_name", "unknown")
    lines = [
        f"# {check_name.title()} Check — Merged Results\n",
        "## Summary\n",
        merged.get("summary", "No summary.") + "\n",
    ]

    # Sources
    sources = merged.get("sources", [])
    if sources:
        lines.append("## Sources\n")
        for s in sources:
            model_str = f" ({s['model']})" if s.get("model") else ""
            lines.append(f"- **{s['source']}**{model_str}: {s.get('finding_count', 0)} findings")
        lines.append("")

    # Major comments
    major = [c for c in merged.get("comments", []) if c.get("severity") == "major"]
    if major:
        lines.append("## Major Comments\n")
        for c in major:
            loc = c.get("location", {}) or {}
            section = loc.get("section", "?")
            lines.append(f"### {c['comment_id']}: {section}\n")
            lines.append(f"**Issue**: {c.get('issue', '')}\n")
            lines.append(f"**Evidence**: {c.get('evidence', '')}\n")
            lines.append(f"**Suggestion**: {c.get('suggested_author_comment', '')}\n")
            lines.append(f"**Confidence**: {c.get('confidence', 'low')}\n")
            if c.get("conflict"):
                lines.append(f"**Note**: {c.get('reviewer_note', '')}\n")
            lines.append("")

    # Minor comments
    minor = [c for c in merged.get("comments", []) if c.get("severity") != "major"]
    if minor:
        lines.append("## Minor Comments\n")
        for c in minor:
            loc = c.get("location", {}) or {}
            section = loc.get("section", "?")
            lines.append(f"### {c['comment_id']}: {section}\n")
            lines.append(f"**Issue**: {c.get('issue', '')}\n")
            lines.append(f"**Suggestion**: {c.get('suggested_author_comment', '')}\n")
            lines.append(f"**Confidence**: {c.get('confidence', 'low')}\n")
            lines.append("")

    # Conflicts
    conflicts = merged.get("conflicts", [])
    if conflicts:
        lines.append("## Conflicts\n")
        for c in conflicts:
            lines.append(f"- **{c.get('conflict_id', '?')}**: {c.get('description', '')}")
            lines.append(f"  - Resolution: {c.get('resolution', '')}\n")
        lines.append("")

    # Reviewer notes
    notes = [c.get("reviewer_note") for c in merged.get("comments", []) if c.get("reviewer_note")]
    if notes:
        lines.append("## Reviewer Notes\n")
        for n in notes:
            lines.append(f"- {n}")
        lines.append("")

    return "\n".join(lines)
