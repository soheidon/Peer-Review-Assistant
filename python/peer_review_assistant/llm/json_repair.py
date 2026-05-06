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
