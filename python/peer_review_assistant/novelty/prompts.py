"""Prompts and templates for the novelty check module."""

import json

# =============================================================================
# Deep Research prompt templates (two types)
# =============================================================================

# ── A: Broad search prompt ──────────────────────────────────────────────

NOVELTY_DEEP_RESEARCH_PROMPT_BROAD = """\
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


# ── B: Critical verification prompt ─────────────────────────────────────

NOVELTY_DEEP_RESEARCH_PROMPT_CRITICAL = """\
あなたは医学・心理学・社会科学領域の文献調査に詳しい研究支援者です。
以下に示す投稿予定論文について、**批判的な立場から**新規性の主張が本当に成立するかを厳しめに検証してください。

目的は、この論文の新規性主張を鵜呑みにせず、「本当に新しいと言えるのか」を批判的に検討することです。

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

1. すでに同じことを示した研究はないか
   - 今回の論文の主要な結果と実質的に同じ結果を報告している研究を探してください。
   - 特に、著者が「新しい」と主張している点について、先行研究がないか厳しく確認してください。

2. 対象や方法がほぼ同じ研究はないか
   - 年齢層、疾患・症状、サンプルサイズ、研究デザイン、介入内容、評価尺度が近い研究を探してください。
   - 今回の論文と実質的に同じと言える研究があれば、具体的に指摘してください。

3. 新規性として主張しにくい点
   - テーマ、対象、方法、尺度、統計解析のそれぞれについて、「これは既存研究ですでに十分に示されている」と思われる点を挙げてください。
   - 著者が「新しい」と主張しているが、実際には先行研究の追試・確認に近い点を指摘してください。

4. 既存研究との重複
   - 今回の論文と重複している既存研究を具体的に挙げてください。
   - 重複の程度（ほぼ同一／部分的に重複／類似しているが異なる点もある）を評価してください。

5. サンプルサイズやデザイン上の弱点
   - サンプルサイズが小さすぎないか。
   - 研究デザインに根本的な弱点はないか（比較群の欠如、ランダム化の不備、追跡期間の短さ、交絡の未調整など）。

6. 統計解析上の弱点
   - 使用されている統計手法はデータ構造に対して適切か。
   - 多重比較の調整は行われているか。
   - 結果の解釈に無理がないか（例：相関を因果と解釈していないか、有意でない結果を軽視していないか）。

7. 投稿予定雑誌の基準と比べた不足点
   - 投稿予定雑誌の通常の掲載論文と比べて、サンプルサイズ、研究デザインの厳密さ、新規性の水準は十分か。
   - この雑誌の査読者が指摘しそうな問題点を予測してください。

8. 過剰主張になりやすい点
   - 著者がAbstractやDiscussionで過剰に主張しがちな点を予測してください。
   - 例：「世界で初めて」「有意に改善」「画期的な方法」などの表現が妥当かを検討してください。

9. 査読で突かれそうな点
   - 査読者が真っ先に指摘しそうな問題点をリストアップしてください。
   - 特に novelty-related comments で否定されそうな点を中心に。

10. 最終評価
   以下の形式でまとめてください。

   - 新規性として最も疑わしい点：
   - 先行研究と明確に重複している点：
   - この論文の最大の方法論的弱点：
   - 投稿予定雑誌とのミスマッチの有無：
   - 査読でリジェクトされるリスク（低・中・高）：
   - リジェクトを避けるために最低限補強すべき点：

出力では、可能な限り具体的な文献情報を示してください。
文献を挙げる場合は、著者名、年、タイトル、雑誌名、巻号、ページ、DOIまたはURLが分かる範囲で含めてください。
「これがなければリジェクト」という決定的な問題があれば、明示してください。
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
    journal_profile: dict | None = None,
    deep_research_count: int = 0,
    target_journal: str = "",
) -> list[dict]:
    """Build messages for the novelty-assess command (journal-aware).

    Takes the structured novelty summary, merged Deep Research results,
    and journal profile. Produces a comprehensive assessment that adapts
    to the journal's evaluation axis.
    """
    # Build journal evaluation axis summary
    journal_axis_desc = ""
    if journal_profile:
        jp = journal_profile
        pc = jp.get("publication_criteria", {})
        jp_pos = jp.get("journal_position", {})

        novelty_req = pc.get("novelty_required", "unknown")
        impact_req = pc.get("impact_required", "unknown")
        soundness = pc.get("technical_soundness_focus", "unknown")
        method_rigour = pc.get("methodological_rigour_focus", "unknown")
        stat_rigour = pc.get("statistical_rigour_focus", "unknown")
        conclusion_focus = pc.get("conclusion_supported_by_data_focus", "unknown")

        journal_name = jp.get("journal_name", "不明")

        # Determine journal type for guidance
        is_soundness_oriented = (
            soundness == "true"
            and novelty_req in ("low", "not_explicitly_required", "unknown")
        )
        is_high_impact = novelty_req == "high" or impact_req == "high"

        journal_axis_desc = f"""
## 対象ジャーナルの評価軸

- ジャーナル名: {journal_name}
- Novelty重視度: {novelty_req}
- Impact重視度: {impact_req}
- Technical soundness重視: {soundness}
- Methodological rigour重視: {method_rigour}
- Statistical rigour重視: {stat_rigour}
- Conclusion supported by data重視: {conclusion_focus}
"""

        if is_soundness_oriented:
            journal_axis_desc += """
**評価方針**: このジャーナルは technical soundness-oriented journal です。
テーマの大きな新規性や主観的インパクトよりも、以下の点を重視して評価してください：
- original research であること
- 方法が科学的に妥当であること
- 統計解析がデータ構造・サンプルサイズに対して適切であること
- 結論がデータから支持されていること
- 過剰な因果主張や一般化をしていないこと
- 対象、文脈、データ、方法、解析、実践的意義のいずれかに付加価値があること

避けるべき表現: highly novel, major conceptual advance, field-changing, groundbreaking, transformative
使いやすい表現: scientifically valid, methodologically sound, technically rigorous, statistically appropriate, conclusions supported by data, adds empirical evidence, examines underrepresented sample/context, contributes incremental but meaningful evidence
"""
        elif is_high_impact:
            journal_axis_desc += """
**評価方針**: このジャーナルは high-impact selective journal です。
以下の点を重視して評価してください：
- テーマ的新規性
- 理論的貢献
- 臨床的・社会的インパクト
- 国際的読者への関心
- 方法論的強さ
- 既存研究との明確な差分
- 分野を前進させる意義

避けるべき表現: merely adds data, incremental only, niche relevance only, limited local interest
使いやすい表現: advances the field, provides novel evidence, addresses an important gap, has broad implications
"""
        else:
            journal_axis_desc += """
**評価方針**: ジャーナルの評価軸が明確に判定できませんでした。
一般的な新規性評価と、このジャーナルで評価されやすい貢献の両方の観点から評価してください。
"""

    dr_note = ""
    if deep_research_count == 0:
        dr_note = "\n**注意**: 外部調査結果なしの暫定評価です。\n"
    elif deep_research_count == 1:
        dr_note = "\n**注意**: 1つの外部調査結果に基づく暫定評価です。\n"
    else:
        dr_note = "\n**注意**: 2つの外部調査結果を統合した評価です。\n"

    system_prompt = f"""\
あなたは学術論文の査読者です。
論文の概要、外部で実施された文献調査（Deep Research）の結果、および
投稿予定ジャーナルの特性情報をもとに、新規性とジャーナル適合性を評価してください。
{dr_note}

重要な指示：
- すべての回答は日本語で行ってください。
- 文献調査結果に具体的な文献が挙げられている場合は、それらを明示的に参照してください。
- 新規性を過大評価しないでください。
- ジャーナルの評価軸に合わせて、何を強調し何を避けるべきかを具体的に指示してください。
- 査読者が新規性に関するコメントを書く際に役立つ視点を提供してください。

以下のMarkdown形式で出力してください。

# 新規性・ジャーナル適合性評価

## 1. 対象ジャーナルの評価軸
[journalProfileに基づいて、このジャーナルが何を評価するかを簡潔に要約]

## 2. 論文の概要
[研究テーマ、対象、方法、解析、主な結果、著者が主張する貢献を簡潔に]

## 3. 一般的な意味での新規性

### 3.1 テーマの新規性
[具体的な先行研究を参照しながら評価]

### 3.2 対象・サンプルの新規性

### 3.3 方法・介入の新規性

### 3.4 尺度・アウトカムの新規性

### 3.5 統計解析の工夫

### 3.6 データの希少性

### 3.7 実践的・臨床的・社会的意義

### 3.8 理論的貢献

## 4. このジャーナルにおいて評価されやすい貢献
[journalProfileの評価軸に基づいて、このジャーナルで特に評価される点を評価]
- technical soundness-oriented journalの場合：科学的妥当性、方法論的妥当性、統計解析の適切性、結論とデータの整合性、underrepresented sample/context、incremental but meaningful evidence
- high-impact selective journalの場合：テーマ的新規性、理論的貢献、臨床的・社会的インパクト、国際的読者への重要性、分野への明確な貢献

## 5. 強く主張できる点
[根拠付きで列挙]

## 6. 慎重に述べるべき点
[過剰主張になりやすい点、デザインやサンプルサイズ上の制約、解析上の制約、一般化に注意すべき点]

## 7. 既存研究との重複
[既存研究と重なる点。どの文献とどのように重複しているか具体的に]

## 8. 既存研究との明確な差分
[既存研究にはない、この論文固有の貢献]

## 9. 投稿予定ジャーナルとの適合性

総合判定: [十分に適合 / やや適合 / やや不足 / かなり不足]

[判定の根拠を説明]

## 10. 投稿前に補強すべき点
- Introduction:
- Methods:
- Results:
- Discussion:
- Limitations:
- References:
- Supplementary materials:
- Data availability:
- Statistical reporting:

## 11. 査読コメントで使える方向性
- 強調すべき表現
- 避けるべき表現
- 日本語での推奨表現
- 英語での推奨表現"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# 論文概要\n",
        "```json",
        summary_json,
        "```\n",
    ]

    if journal_axis_desc:
        user_parts.append(journal_axis_desc)

    if target_journal and target_journal.strip():
        user_parts.append(f"\n## 投稿予定雑誌\n{target_journal.strip()}\n")

    user_parts.append("\n# 文献調査結果 (Deep Research統合)\n")
    user_parts.append(deep_research_text)

    user_message = "\n".join(user_parts)

    # Truncate if needed
    if len(user_message) > 120_000:
        cutoff = 120_000
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


# =============================================================================
# Phase 4 (NEW): Deep Research merge prompt
# =============================================================================

def build_novelty_merge_messages(
    novelty_summary: dict,
    deep_research_a_text: str,
    deep_research_b_text: str,
    deep_research_meta: dict | None = None,
    journal_profile: dict | None = None,
) -> list[dict]:
    """Build messages for the novelty-merge-research command.

    Takes two Deep Research results (A and B) and instructs the LLM to
    compare, integrate, and structure the findings.
    """
    system_prompt = """\
あなたは学術文献調査の専門家です。
2つの異なるAIで実施されたDeep Research（文献調査）の結果を比較・統合してください。

重要な指示：
- すべての回答は日本語で行ってください。
- 単純にAとBを連結するのではなく、内容を比較・整理してください。
- AとBで情報が矛盾する場合は、どちらかに決め打ちせず「要確認」としてください。
- 文献情報は可能な限り構造化してください（著者、年、タイトル、雑誌名、DOIなど）。
- 新規性判断・ジャーナル適合性判断に役立つ整理を心がけてください。

出力は以下のMarkdown形式で行ってください。Markdownの後に、統合された文献情報をJSONでも出力してください。

# Deep Research 統合結果

## 1. AとBで一致している情報

## 2. Aにのみ出てくる情報

## 3. Bにのみ出てくる情報

## 4. 文献情報の食い違い・要確認

## 5. 信頼できそうな情報

## 6. 要確認の情報

## 7. 新規性判断に使える情報

## 8. 新規性判断には使いにくい情報

## 9. 既存研究との重複を示す根拠

## 10. 新規性または付加価値を示す根拠

## 11. 投稿予定ジャーナルとの適合性判断に使える情報

## 12. 査読で突かれそうな点

```json
{
  "references": [
    {
      "authors": "...",
      "year": "...",
      "title": "...",
      "journal": "...",
      "volume": "...",
      "issue": "...",
      "pages": "...",
      "doi": "...",
      "url": "...",
      "source": "A | B | both",
      "relevance_to_current_manuscript": "high | medium | low",
      "supports_novelty": true,
      "weakens_novelty": false,
      "needs_verification": false
    }
  ],
  "agreement_summary": "...",
  "key_findings_for_assessment": ["..."],
  "items_needing_verification": ["..."],
  "overall_reliability": "high | medium | low"
}
```"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    meta_info = ""
    if deep_research_meta:
        meta_info = "\n## 調査メタデータ\n```json\n" + \
                    json.dumps(deep_research_meta, ensure_ascii=False, indent=2) + \
                    "\n```\n"

    journal_info = ""
    if journal_profile:
        jp = journal_profile
        pc = jp.get("publication_criteria", {})
        journal_info = f"""\n## 投稿予定ジャーナル情報
- ジャーナル名: {jp.get('journal_name', '不明')}
- Novelty重視度: {pc.get('novelty_required', 'unknown')}
- Technical soundness重視: {pc.get('technical_soundness_focus', 'unknown')}
"""

    user_parts = [
        "# 論文概要\n",
        "```json",
        summary_json,
        "```\n",
        meta_info,
        journal_info,
        "# Deep Research 結果 A\n",
        deep_research_a_text,
        "\n# Deep Research 結果 B\n",
        deep_research_b_text,
    ]

    user_message = "\n".join(user_parts)

    # Truncate if needed (keep A and B roughly balanced)
    if len(user_message) > 120_000:
        a_start = user_message.find("# Deep Research 結果 A")
        b_start = user_message.find("# Deep Research 結果 B")
        if a_start > 0 and b_start > a_start:
            preamble = user_message[:a_start]
            a_text = user_message[a_start:b_start]
            b_text = user_message[b_start:]
            available = 120_000 - len(preamble)
            half = available // 2
            user_message = preamble + a_text[:half] + "\n\n[Aの続きは省略]\n\n" + b_text[:half] + "\n\n[Bの続きは省略]"
        else:
            user_message = user_message[:120_000] + "\n\n[内容が長すぎるため省略]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 6: Review comment candidates prompt
# =============================================================================

def build_novelty_comment_candidates_messages(
    novelty_summary: dict,
    novelty_assessment: str,
    journal_profile: dict | None = None,
) -> list[dict]:
    """Build messages to generate per-item review comment candidates.

    Produces 12 candidate items with Japanese + English text, strength
    ratings, and recommendation levels. User selects which to include.
    """
    system_prompt = """\
あなたは学術論文の査読者です。
論文の概要と新規性評価の結果をもとに、最終査読コメントの「新規性と既存研究との重複」
セクションの候補文章を、項目別に生成してください。

これはカバーレターではなく、査読レポートに記載する文章の候補です。

重要な指示：
- すべての回答は日本語で行ってください（英語候補も含めること）。
- 各項目について、日本語候補と英語候補の両方を生成してください。
- 主張の強さ（strong / moderate / cautious / not_recommended）を付けてください。
- 採用推奨度（high / medium / low）を付けてください。
- ジャーナルの評価軸に合わせて表現を調整してください。
- 過剰主張になる項目は cautious または not_recommended としてください。
- 各候補は3〜5文程度で、学術的な査読レポートにふさわしい文体で書いてください。

以下のJSON形式で出力してください。JSON以外のテキストは一切出力しないでください。

```json
{
  "candidates": [
    {
      "id": "theme",
      "label_ja": "テーマの新規性",
      "label_en": "Novelty of Theme",
      "text_ja": "日本語候補（3〜5文）",
      "text_en": "English candidate (3-5 sentences)",
      "strength": "strong | moderate | cautious | not_recommended",
      "recommendation": "high | medium | low",
      "comment": "この候補についての補足コメント"
    },
    {
      "id": "sample",
      "label_ja": "対象・サンプルの新規性",
      "label_en": "Novelty of Sample",
      ...
    },
    ...
  ]
}
```"""

    # Build journal context
    journal_context = ""
    if journal_profile:
        jp = journal_profile
        pc = jp.get("publication_criteria", {})
        journal_context = f"""
## 投稿予定ジャーナルの評価軸
- ジャーナル名: {jp.get('journal_name', '不明')}
- Novelty重視度: {pc.get('novelty_required', 'unknown')}
- Impact重視度: {pc.get('impact_required', 'unknown')}
- Technical soundness重視: {pc.get('technical_soundness_focus', 'unknown')}
- Methodological rigour重視: {pc.get('methodological_rigour_focus', 'unknown')}
- Statistical rigour重視: {pc.get('statistical_rigour_focus', 'unknown')}

候補文章は、このジャーナルの評価軸に合わせてください。
"""

    summary_json = json.dumps(novelty_summary, ensure_ascii=False, indent=2)

    user_parts = [
        "# 論文概要\n",
        "```json",
        summary_json,
        "```\n",
        journal_context,
        "# 新規性評価\n",
        novelty_assessment,
    ]

    user_message = "\n".join(user_parts)

    if len(user_message) > 80_000:
        user_message = user_message[:80_000]
        user_message += "\n\n[内容が長すぎるため途中で切り捨てられました]"

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]


# =============================================================================
# Phase 7a: Compose final review comment from selected candidates
# =============================================================================

def build_novelty_comment_compose_messages(
    candidates_json: str,
    language: str = "both",
    journal_profile: dict | None = None,
) -> list[dict]:
    """Build messages to compose a final review comment from selected candidates.

    Takes only the user-selected candidates (as JSON) and generates a
    cohesive review comment section in the requested language(s).
    """
    lang_instr = {
        "ja": "日本語のみで出力してください。",
        "en": "英語のみで出力してください。",
        "both": "日本語と英語の両方で出力してください。",
    }.get(language, "日本語と英語の両方で出力してください。")

    system_prompt = f"""\
あなたは学術論文の査読者です。
選択された候補文章をもとに、最終査読コメントの「新規性と既存研究との重複」
セクションを統合して作成してください。

重要な指示：
- {lang_instr}
- 選択された候補だけを使い、選ばれなかった内容は含めないでください。
- 重複を除き、自然な流れの文章に統合してください。
- 過剰主張を避け、学術的な査読レポートにふさわしい文体で書いてください。
- 各言語3〜5段落程度でまとめてください。
- これはカバーレターではありません。査読レポートに記載する文章です。

以下のMarkdown形式で出力してください。

# 新規性と既存研究との重複 (Novelty and Overlap with Existing Literature)

## 日本語

[3〜5段落の日本語査読コメント]

## English

[3-5 paragraphs of English review comments]"""

    journal_note = ""
    if journal_profile:
        jp = journal_profile
        journal_note = f"\n投稿予定ジャーナル: {jp.get('journal_name', '不明')}\n"

    user_parts = [
        "# 選択された候補文章\n",
        journal_note,
        candidates_json,
    ]

    user_message = "\n".join(user_parts)

    if len(user_message) > 60_000:
        user_message = user_message[:60_000]

    return [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_message},
    ]
