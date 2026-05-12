"""Prompts and templates for the novelty check module."""

import json

# =============================================================================
# Deep Research prompt template
# =============================================================================

NOVELTY_DEEP_RESEARCH_PROMPT_TEMPLATE = """\
あなたは医学・心理学・社会科学領域の文献調査に詳しい研究支援者です。
以下に示す投稿予定論文について、先行研究との比較に基づき、新規性、独自性、限界、投稿予定雑誌との適合性を評価してください。

目的は、単に「似た論文があるか」を調べることではありません。
この論文が、既存研究と比べてどの点で新しいのか、あるいは新しくないのかを、多面的に判断することです。

【投稿予定論文の概要】
以下の情報をもとに調査してください。

- 研究テーマ：
{research_topic}

- 研究目的：
{objective}

- 対象者・サンプル：
{sample_summary}

- 研究デザイン：
{design}

- 介入・調査・観察の内容：
{methods_summary}

- 使用した尺度・アウトカム：
{measures}

- 統計解析：
{statistics}

- 主な結果：
{findings}

- 著者が主張している貢献：
{claimed_contributions}

- 投稿予定雑誌：
{target_journal}

---

以下の観点から、可能な限り具体的な文献名を挙げて調査してください。

1. 同じ研究テーマを扱った主要な先行研究
   - 代表的な論文を挙げてください。
   - それぞれの研究目的、対象者、サンプルサイズ、国・地域、研究デザイン、主要アウトカム、主な結果を整理してください。

2. 類似した対象者・サンプルを扱った研究
   - 年齢層、疾患・症状、臨床群、施設、地域、文化的背景などが近い研究を探してください。
   - 今回の論文と比べて、対象者のどこが似ていて、どこが異なるかを示してください。

3. 類似した方法・介入・調査デザインを用いた研究
   - 同様の介入、観察、調査、実践、評価方法を用いた研究を探してください。
   - 今回の論文の方法が既存研究と比べて標準的なのか、工夫があるのか、珍しいのかを判断してください。

4. 類似したアウトカム・尺度を用いた研究
   - 今回の論文で使用されている尺度やアウトカムと近いものを用いた研究を探してください。
   - 既存研究ではどのようなアウトカムが重視されていたかを整理してください。

5. 類似した統計解析を行った研究
   - 小標本解析、縦断解析、混合モデル、GEE、ベイズ分析、効果量、感度分析など、今回の論文と近い分析を用いた研究を確認してください。
   - 今回の統計解析が、分野の標準的水準と比べて十分か、工夫があるか、不足があるかを評価してください。

6. 新規性の評価
   以下の観点ごとに、今回の論文の新規性を評価してください。

   - テーマの新規性
   - 対象者・サンプルの新規性
   - 方法・介入・調査手法の新規性
   - アウトカム・尺度の新規性
   - 統計解析の新規性
   - データの希少性
   - 臨床的・実践的・社会的意義
   - 理論的貢献
   - 国際的文脈での意義
   - 日本または特定地域のデータとしての意義

7. 重複性・弱点の評価
   - 既存研究ですでに十分に示されている点は何か。
   - 今回の論文が新規性を主張しにくい点は何か。
   - サンプルサイズ、研究デザイン、統計解析、追跡期間、比較群の有無などの観点から、弱点を具体的に指摘してください。

8. 投稿予定雑誌との適合性
   - 投稿予定雑誌のスコープ、読者層、掲載論文の傾向を確認してください。
   - 可能であれば、インパクトファクター、CiteScore、Scimago Journal Rank、Quartile、分野内ランキングなどの情報も確認してください。
   - 今回の論文の新規性、方法論的強さ、臨床的・社会的意義が、その雑誌の水準に合っているかを評価してください。
   - 「十分に適合」「やや適合」「やや不足」「かなり不足」などの判断を示してください。
   - 不足がある場合、どの点を補強すれば投稿可能性が高まるかを提案してください。

9. 代替投稿先の候補
   - 今回の論文により適している可能性がある雑誌があれば、候補を挙げてください。
   - 各候補について、スコープ、想定される読者、雑誌ランクの目安、今回の論文との相性を簡潔に説明してください。

10. 最終評価
   以下の形式でまとめてください。

   - この論文の最も強い新規性：
   - この論文の補助的な新規性：
   - 新規性を主張しにくい点：
   - 投稿予定雑誌との適合性：
   - 投稿前に補強すべき点：
   - アブストラクトやカバーレターで強調すべき点：
   - 総合判定：

出力では、可能な限り具体的な文献情報を示してください。
文献を挙げる場合は、著者名、年、タイトル、雑誌名、巻号、ページ、DOIまたはURLが分かる範囲で含めてください。
根拠が不確かな場合は、不確かであることを明記してください。
"""


# =============================================================================
# Phase 1: Paper summary + novelty extraction prompt
# =============================================================================

def build_novelty_summary_messages(
    manuscript_data: dict,
    section_texts: dict,
    section_map: dict | None,
    target_journal: str = "",
) -> list[dict]:
    """Build messages for the novelty-summarize command.

    Returns system and user messages instructing the LLM to read the full
    manuscript and produce a structured summary with multi-angle novelty
    identification.
    """
    system_prompt = """\
あなたは学術論文の査読を支援する専門家です。
与えられた論文原稿を読み、以下の観点から論文を要約・分析してください。

重要な指示：
- すべての回答は日本語で行ってください。
- 論文に記載されていない情報は「記載なし」としてください。
- 新規性の評価では、テーマの新規性だけでなく、対象者、方法、統計解析、データの希少性、実践的意義など、複数の角度から検討してください。
- 各項目について、具体的な根拠を論文本文から引用してください。
- 著者が主張している貢献と、あなたが客観的に見て新規性があると思われる点は区別してください。
- 新規性が特段認められない角度については「特段の新規性は認められない」と明記してください。
- 文献検索に役立つキーワードを5〜10個、英語で列挙してください。

以下のJSON形式で出力してください。JSON以外のテキストは一切出力しないでください。

```json
{
  "research_topic": "研究テーマ（1〜2文）",
  "objective": "研究目的（1〜2文）",
  "sample_summary": "対象者・サンプルの概要（年齢、性別、疾患、施設、地域、サンプルサイズを含む）",
  "design": "研究デザイン（RCT、横断、縦断、質的、混合など）",
  "methods_summary": "介入・調査・観察の方法の概要",
  "measures": "使用した尺度・アウトカム指標の一覧",
  "statistics": "使用した統計解析手法",
  "findings": "主な結果（主要アウトカムと副次的アウトカム）",
  "claimed_contributions": "著者が主張している貢献",
  "novelty_theme": "テーマの新規性評価と根拠",
  "novelty_sample": "対象者・サンプルの新規性評価と根拠",
  "novelty_methods": "方法・介入の新規性評価と根拠",
  "novelty_statistics": "統計解析の新規性評価と根拠",
  "novelty_data_rarity": "データの希少性評価と根拠",
  "novelty_practical_significance": "実践的・臨床的・社会的意義の評価と根拠",
  "target_journal_fit": "投稿予定雑誌との適合性の暫定評価（雑誌名が指定されている場合のみ）",
  "keywords_for_search": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
}
```"""

    # Build user message with sections
    user_parts = ["# 論文原稿\n"]

    journal_header = ""
    if target_journal and target_journal.strip():
        journal_header = f"\n## 投稿予定雑誌\n{target_journal.strip()}\n"

    # Prefer section texts if available
    if section_texts:
        user_parts.append(journal_header)
        section_order = [
            "abstract", "introduction", "aim_objective",
            "methods", "results", "discussion", "conclusion",
        ]
        for name in section_order:
            text = section_texts.get(name, "")
            if text:
                label = {
                    "abstract": "抄録",
                    "introduction": "はじめに",
                    "aim_objective": "目的",
                    "methods": "方法",
                    "results": "結果",
                    "discussion": "考察",
                    "conclusion": "結論",
                }.get(name, name)
                user_parts.append(f"## {label}\n{text}\n")
    else:
        # Fall back to manuscript paragraphs
        paragraphs = manuscript_data.get("paragraphs", [])
        if paragraphs:
            user_parts.append(journal_header)
            full_text = "\n\n".join(
                p.get("text", "") for p in paragraphs
            )
            user_parts.append(full_text)
        elif isinstance(manuscript_data, dict) and manuscript_data.get("full_text"):
            user_parts.append(journal_header)
            user_parts.append(manuscript_data["full_text"])

    user_message = "\n".join(user_parts)

    # Truncate if extremely long (120K chars)
    if len(user_message) > 120_000:
        user_message = user_message[:120_000] + "\n\n[本文は長すぎるため途中で切り捨てられました]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 4: Novelty assessment prompt
# =============================================================================

def build_novelty_assessment_messages(
    novelty_summary: dict,
    deep_research_text: str,
    target_journal: str = "",
) -> list[dict]:
    """Build messages for the novelty-assess command.

    Takes the structured novelty summary and the user's pasted Deep Research
    results, and instructs the LLM to produce a comprehensive assessment.
    """
    system_prompt = """\
あなたは学術論文の査読者です。
論文の概要と、外部で実施された文献調査（Deep Research）の結果をもとに、
以下の観点から論文の新規性と投稿雑誌との適合性を評価してください。

重要な指示：
- すべての回答は日本語で行ってください。
- 文献調査結果に具体的な文献が挙げられている場合は、それらを明示的に参照してください。
- 新規性を過大評価しないでください。「強く主張できる点」と「慎重に述べるべき点」を明確に分けてください。
- 既存研究との重複がある場合は、具体的にどの点が重複しているかを指摘してください。
- 査読者が新規性に関するコメントを書く際に役立つ視点を提供してください。

以下のMarkdown形式で出力してください。

# 新規性評価

## 総合評価
[strong / medium / weak] — [1〜2文の要約]

## 角度別評価

### テーマ (Theme)
[テーマの新規性評価。具体的な先行研究を参照しながら、どこが新しくどこが既存研究と重なるかを述べる]

### サンプル (Sample)
[対象者・サンプルの新規性評価]

### 手法 (Methods)
[方法・介入の新規性評価]

### 統計 (Statistics)
[統計解析の新規性評価]

### データの稀少性 (Data Rarity)
[データの希少性評価]

### 実践的意義 (Practical Significance)
[臨床的・実践的・社会的意義の評価]

## 既存研究との重複
[既存研究と明確に重複している点。どの文献とどのように重複しているか具体的に]

## 既存研究との明確な差分
[既存研究にはない、この論文固有の貢献]

## ターゲットジャーナル適合性
[投稿予定雑誌の水準と論文の新規性・方法論的強さの比較。適合度の判定を含む]

## 投稿前に補強すべき点
[Introduction, Methods, Results, Discussion の各セクションで補強できること]

## 推奨される位置づけ
[査読レポートで新規性について言及する際の推奨トーンと重点]"""

    # Build user message
    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# 論文概要\n",
        "```json",
        summary_json,
        "```\n",
    ]

    if target_journal and target_journal.strip():
        user_parts.append(f"## 投稿予定雑誌\n{target_journal.strip()}\n")

    user_parts.append("# 文献調査結果 (Deep Research)\n")
    user_parts.append(deep_research_text)

    user_message = "\n".join(user_parts)

    # Truncate if needed
    if len(user_message) > 120_000:
        cutoff = 120_000
        # Try to keep the deep research text as much as possible
        dr_start = user_message.find("# 文献調査結果")
        if dr_start > 0:
            summary_part = user_message[:dr_start]
            dr_part = user_message[dr_start:]
            available = cutoff - len(summary_part)
            if available > 5000:
                user_message = summary_part + dr_part[:available]
                user_message += "\n\n[文献調査結果は長すぎるため途中で切り捨てられました]"
            else:
                user_message = user_message[:cutoff]
                user_message += "\n\n[内容が長すぎるため途中で切り捨てられました]"
        else:
            user_message = user_message[:cutoff]
            user_message += "\n\n[内容が長すぎるため途中で切り捨てられました]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 5: Review comment generation prompt
# =============================================================================

def build_novelty_review_comment_messages(
    novelty_summary: dict,
    novelty_assessment: str,
    target_journal: str = "",
) -> list[dict]:
    """Build messages for the novelty-review-comment command.

    Generates the 'Originality and Overlap' section for the final review
    comments (NOT a cover letter). Output in both Japanese and English.
    """
    system_prompt = """\
あなたは学術論文の査読者です。
論文の概要と新規性評価の結果をもとに、**最終査読コメント**の「新規性と既存研究との重複」セクションを作成してください。

これはカバーレターではなく、査読者が査読レポートに記載するための文章です。

重要な指示：
- 査読者としての客観的な立場で書いてください。
- 「強く主張できる新規性」と「慎重に述べるべき点」を区別してください。
- 新規性を過大評価しないでください。
- 既存研究との重複がある場合は、正直に指摘してください。
- 日本語と英語の両方で出力してください（国際誌投稿を想定）。
- 各言語3〜5段落程度で、学術的な査読レポートにふさわしい文体で書いてください。

以下の形式で出力してください。

# 新規性と既存研究との重複 (Novelty and Overlap with Existing Literature)

## 日本語

[3〜5段落の日本語査読コメント]

## English

[3〜5 paragraphs of English review comments]"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# 論文概要\n",
        "```json",
        summary_json,
        "```\n",
        "# 新規性評価\n",
        novelty_assessment,
    ]

    if target_journal and target_journal.strip():
        user_parts.append(f"\n## 投稿予定雑誌\n{target_journal.strip()}\n")

    user_message = "\n".join(user_parts)

    if len(user_message) > 80_000:
        user_message = user_message[:80_000]
        user_message += "\n\n[内容が長すぎるため途中で切り捨てられました]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
