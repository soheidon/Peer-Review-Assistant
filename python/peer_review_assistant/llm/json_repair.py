"""JSON extraction and repair for LLM responses.

LLMs often wrap JSON in markdown code blocks or add trailing text.
This module provides robust extraction.
"""

import json
import re


def parse_llm_json(response_text):
    """Extract valid JSON from an LLM response string.

    Tries multiple strategies in order:
    1. Raw json.loads on the entire string
    2. Extract from ```json ... ``` markdown code block
    3. Extract from ``` ... ``` generic code block
    4. Find outermost { ... } braces

    Returns:
        Parsed dict, or None if all strategies fail.
    """
    if not response_text or not response_text.strip():
        return None

    text = response_text.strip()

    # Strategy 1: raw parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Strategy 2: extract from ```json ... ``` block
    json_block = _extract_code_block(text, "json")
    if json_block is not None:
        return json_block

    # Strategy 3: extract from ``` ... ``` generic block
    json_block = _extract_code_block(text, None)
    if json_block is not None:
        return json_block

    # Strategy 4: find outermost braces
    try:
        start = text.index("{")
        end = text.rindex("}") + 1
        candidate = text[start:end]
        return json.loads(candidate)
    except (ValueError, json.JSONDecodeError):
        pass

    # Strategy 5: truncation repair — close unclosed brackets/quotes
    result = _repair_truncated_json(text)
    if result is not None:
        return result

    return None


def _repair_truncated_json(text):
    """Attempt to salvage truncated JSON by closing unclosed brackets and quotes.

    Handles common LLM truncation patterns:
    - Missing closing braces/brackets for objects and arrays
    - Unclosed string values
    - Trailing comma before truncation

    Returns parsed dict or None.
    """
    # Find the outermost object start
    try:
        start = text.index("{")
    except ValueError:
        return None

    truncated = text[start:]

    # Try progressively: close strings, then brackets
    # Strategy A: just try to append missing closers based on bracket counting
    depth = 0
    in_string = False
    escape = False
    for ch in truncated:
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch in "{[":
            depth += 1
        elif ch in "}]":
            depth -= 1

    if depth <= 0:
        return None  # balanced already, or negative — can't be truncated

    # If inside a string, close the string first
    if in_string:
        truncated += '"'

    # Close remaining brackets (stack-based: use a simple reverse match)
    # Re-scan from the first unclosed position
    stack = []
    in_string = False
    escape = False
    for i, ch in enumerate(truncated):
        if escape:
            escape = False
            continue
        if ch == "\\":
            escape = True
            continue
        if ch == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if ch == "{":
            stack.append("}")
        elif ch == "[":
            stack.append("]")
        elif ch in "}]":
            if stack and stack[-1] == ch:
                stack.pop()

    # Append closing brackets in reverse order
    closers = "".join(reversed(stack))
    repaired = truncated + closers

    try:
        return json.loads(repaired)
    except json.JSONDecodeError:
        pass

    # Strategy B: try removing the last incomplete field (trailing comma + partial)
    # Find the last valid value end (last ] or } or " or digit or true/false/null)
    # and append closers from there
    try:
        # Find last comma and truncate there, then close
        last_comma = repaired.rfind(",")
        if last_comma > 0:
            cut = repaired[:last_comma]
            # Rebuild closers for the truncated version
            stack2 = []
            in_string2 = False
            escape2 = False
            for ch in cut:
                if escape2:
                    escape2 = False
                    continue
                if ch == "\\":
                    escape2 = True
                    continue
                if ch == '"':
                    in_string2 = not in_string2
                    continue
                if in_string2:
                    continue
                if ch == "{":
                    stack2.append("}")
                elif ch == "[":
                    stack2.append("]")
                elif ch in "}]":
                    if stack2 and stack2[-1] == ch:
                        stack2.pop()
            cut += "".join(reversed(stack2))
            return json.loads(cut)
    except (json.JSONDecodeError, ValueError):
        pass

    return None


def _extract_code_block(text, language):
    """Extract JSON from a markdown code block.

    Args:
        text: Full response text
        language: Language tag to match (e.g. "json"), or None to match any block

    Returns:
        Parsed dict, or None if no valid block found.
    """
    if language:
        pattern = rf"```{language}\s*\n(.*?)```"
    else:
        pattern = r"```\w*\s*\n(.*?)```"

    matches = re.findall(pattern, text, re.DOTALL)
    for match in matches:
        try:
            return json.loads(match.strip())
        except json.JSONDecodeError:
            # Check if there's JSON inside the match (e.g. markdown within block)
            try:
                brace_start = match.index("{")
                brace_end = match.rindex("}") + 1
                return json.loads(match[brace_start:brace_end])
            except (ValueError, json.JSONDecodeError):
                continue

    return None
