"""Generate text fixtures from Python txt_writer for Rust comparison tests."""
import sys
sys.path.insert(0, '../../../python/peer_review_assistant')
from output.txt_writer import convert_md_to_txt

cases = [
    ('h1_simple', '# Introduction\n\nBody text.', 'en'),
    ('h2_simple', '## Methods\n\nBody text.', 'en'),
    ('h3_simple', '### Results\n\nBody text.', 'en'),
    ('h4_simple', '#### Details\n\nBody text.', 'en'),
    ('bold_label', '**Issue**: The sample size is too small.', 'en'),
    ('bold_label_with_colons', '**Note**: See section 3.1: methods.', 'en'),
    ('quote', '"This is a quoted passage."', 'en'),
    ('consecutive_lines', 'Line one.\nLine two.\nLine three.', 'en'),
    ('empty', '', 'en'),
    ('whitespace', '   \n\n  \n', 'en'),
    ('full_document', '''# Paper Review

## Major Comments

**Issue**: Small sample size.
**Confidence**: high

## Minor Comments

The formatting of Table 2 needs improvement.
Consider adding a figure legend.''', 'en'),
    ('heading_spacing', '## Title\nContent line.', 'en'),
    ('para_spacing', 'First paragraph.\n\nSecond paragraph.', 'en'),
    ('with_ja_lang', '# はじめに\n\n本文です。', 'ja'),
]

import json
fixtures = []
for name, md_text, lang in cases:
    result = convert_md_to_txt(md_text, lang)
    fixtures.append({
        'name': name,
        'input': md_text,
        'lang': lang,
        'output': result,
    })

with open('txt_fixtures.json', 'w', encoding='utf-8') as f:
    json.dump(fixtures, f, indent=2, ensure_ascii=False)

print(f"Generated {len(fixtures)} txt fixtures")
