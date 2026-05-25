"""Markdown-to-plain-text converter for final review documents.

Converts the markdown output of _generate_final_review_md() into a
plain-text representation with Unicode box-drawing characters for
headings and bracket labels for emphasis.
"""

import re

# ── Regex patterns for markdown line detection ──────────────────────────

_H1_RE = re.compile(r"^# (.+)$")
_H2_RE = re.compile(r"^## (.+)$")
_H3_RE = re.compile(r"^### (.+)$")
_H4_RE = re.compile(r"^#### (.+)$")
_BOLD_LABEL_RE = re.compile(r"^\*\*(.+?)\*\*:\s*(.*)$")
_QUOTE_RE = re.compile(r'^"(.*)"$')


# ── Main converter ──────────────────────────────────────────────────────

def convert_md_to_txt(md_text: str, lang: str) -> str:
    """Convert a final review markdown string to plain text.

    H2 headings  → ━━━ Title ━━━
    H3 headings  → ┄┄ Title ┄┄
    H4 headings  → ┄┄ Title ┄┄ (defensive; no longer used)
    Bold labels  → [Label] text
    Quotes       → "text" (preserved as-is)
    Body text    → as-is, consecutive lines joined

    Spacing rules (all inter-block gaps are exactly 1 blank line):
    - No blank line after any heading — content follows immediately.
    - One blank line before every block except the very first.

    Args:
        md_text: The markdown content from _generate_final_review_md().
        lang: Language code ("en" or "ja") — reserved for future use.

    Returns:
        str: Plain-text representation.
    """
    lines_in = md_text.split("\n")
    out = []
    i = 0
    n = len(lines_in)
    first_block = True  # suppress leading blank before first element
    after_heading = False  # suppress blank before first content after heading

    while i < n:
        line = lines_in[i]
        stripped = line.strip()

        # ── Blank line in source: skip (we manage spacing ourselves) ──
        if not stripped:
            i += 1
            continue

        # ── H1 (# heading) — defensive ──
        m = _H1_RE.match(stripped)
        if m:
            if not first_block:
                out.append("")
            out.append(f"━━━ {m.group(1)} ━━━")
            first_block = False
            after_heading = True
            i += 1
            continue

        # ── H2 (## heading) ──
        m = _H2_RE.match(stripped)
        if m:
            if not first_block:
                out.append("")
            out.append(f"━━━ {m.group(1)} ━━━")
            first_block = False
            after_heading = True
            i += 1
            continue

        # ── H3 (### heading) ──
        m = _H3_RE.match(stripped)
        if m:
            if not first_block:
                out.append("")
            out.append(f"┄┄ {m.group(1)} ┄┄")
            first_block = False
            after_heading = True
            i += 1
            continue

        # ── H4 (#### heading) — defensive, same as H3 ──
        m = _H4_RE.match(stripped)
        if m:
            if not first_block:
                out.append("")
            out.append(f"┄┄ {m.group(1)} ┄┄")
            first_block = False
            after_heading = True
            i += 1
            continue

        # ── Quoted excerpt ("...") ──
        m = _QUOTE_RE.match(stripped)
        if m:
            if not first_block and not after_heading:
                out.append("")
            out.append(f'"{m.group(1)}"')
            first_block = False
            after_heading = False
            i += 1
            continue

        # ── Bold label + text (**Label**: text) ──
        m = _BOLD_LABEL_RE.match(stripped)
        if m:
            if not first_block and not after_heading:
                out.append("")
            label = m.group(1)
            body = m.group(2)
            out.append(f"[{label}] {body}")
            first_block = False
            after_heading = False
            i += 1
            continue

        # ── Regular paragraph: accumulate until blank line ──
        para_lines = []
        while i < n and lines_in[i].strip():
            para_lines.append(lines_in[i].strip())
            i += 1
        if para_lines:
            if not first_block and not after_heading:
                out.append("")
            out.append(" ".join(para_lines))
            first_block = False
            after_heading = False

    # Remove trailing blank line if present
    while out and out[-1] == "":
        out.pop()

    return "\n".join(out)
