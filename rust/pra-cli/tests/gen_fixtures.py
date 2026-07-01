"""Generate JSON fixtures from Python json_repair for Rust comparison tests."""
import json
import sys
sys.path.insert(0, '../../../python/peer_review_assistant')
from llm.json_repair import parse_llm_json

cases = [
    # Strategy 1: raw parse
    ('{"key": "value"}', 'raw_object'),
    ('[{"a": 1}, {"b": 2}]', 'raw_array'),
    ('{"status": "ok", "count": 42}', 'raw_nested'),
    # Strategy 2: json code block
    ('Here is the result:\n```json\n{"status": "ok", "count": 42}\n```\nDone.', 'fence_json'),
    ('```json\n{"findings": [{"id": 1}]}\n```', 'fence_json_only'),
    # Strategy 3: generic code block
    ('```\n{"data": [1, 2, 3]}\n```', 'fence_generic'),
    # Strategy 4: outermost braces
    ('The answer is {"score": 95, "pass": true}. Hope this helps!', 'outer_braces'),
    ('Results: [{"id": 1}, {"id": 2}] end.', 'outer_array'),
    # Strategy 5: truncation repair
    ('{"findings": [{"issue": "needs work", "severity": "major"', 'truncated_braces'),
    ('{"title": "Introduction to', 'truncated_string'),
    # Edge cases
    ('', 'empty'),
    ('   ', 'whitespace_only'),
    ('not json at all', 'no_json'),
    ('still not { valid', 'unrepairable'),
]

fixtures = []
for text, name in cases:
    result = parse_llm_json(text)
    fixtures.append({
        'name': name,
        'input': text,
        'output': result,
    })

with open('fixtures.json', 'w', encoding='utf-8') as f:
    json.dump(fixtures, f, indent=2, ensure_ascii=False)

print(f"Generated {len(fixtures)} fixtures")
