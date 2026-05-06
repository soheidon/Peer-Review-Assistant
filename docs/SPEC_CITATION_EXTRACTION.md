# SPEC_CITATION_EXTRACTION.md

# 引用文献・本文中引用抽出 詳細仕様

## 0. この文書の位置づけ

本書は、`SPEC.md` のセクション11.4で定義された引用チェック機能のうち、Phase 3（引用文献分割と本文中引用抽出）の詳細仕様である。Phase 4（文献DB照合）は `SPEC_CITATION_DB.md` に記述する。

---

## 1. 目的

前処理済み原稿の References セクションから文献を1件ずつ分割し、本文中の引用マーカーとの対応候補を作成する。

---

## 2. CLI コマンド

```bash
pra-cli extract-citations --project <project_folder>
```

---

## 3. 入力

- `sections/references.txt` — Phase 2C で分割された References セクション
- `paragraph_sentence_map.json` — Phase 2B の段落・文番号データ
- `section_map.json` — Phase 2C のセクション境界データ

---

## 4. 出力ファイル

```text
citations/
  references_split.json
  in_text_citations.json
  citation_contexts.json
```

---

## 5. `references_split.json` スキーマ

References セクションのテキストを1件ずつの文献エントリに分割し、書誌情報をパースしたもの。

```json
{
  "total_references": 30,
  "items": [
    {
      "reference_id": "R001",
      "raw_text": "Smith J, Brown K. Online music intervention for children with anxiety. Journal Name. 2021;10(2):100-110.",
      "parsed": {
        "authors": ["Smith J", "Brown K"],
        "year": 2021,
        "title": "Online music intervention for children with anxiety",
        "journal": "Journal Name",
        "volume": "10",
        "issue": "2",
        "pages": "100-110",
        "doi": null,
        "pmid": null
      },
      "parse_confidence": "medium"
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `total_references` | int | 分割された文献総数 |
| `items[].reference_id` | string | `R001` 形式の一意識別子 |
| `items[].raw_text` | string | 分割された1文献の生テキスト |
| `items[].parsed` | object | パースされた書誌情報（未抽出フィールドは null） |
| `items[].parse_confidence` | string | パース信頼度（"high" / "medium" / "low"） |

### parsed フィールド

| フィールド | 型 | 説明 |
|---|---|---|
| `authors` | string[] | 著者名の配列 |
| `year` | int\|null | 発行年 |
| `title` | string\|null | 論文タイトル |
| `journal` | string\|null | ジャーナル名 |
| `volume` | string\|null | 巻 |
| `issue` | string\|null | 号 |
| `pages` | string\|null | ページ範囲 |
| `doi` | string\|null | DOI |
| `pmid` | string\|null | PubMed ID |

---

## 6. `in_text_citations.json` スキーマ

本文中から抽出された引用マーカー（[1], Smith et al., 2021 など）の一覧。

```json
{
  "total_citations": 45,
  "items": [
    {
      "citation_id": "C001",
      "marker_text": "Smith et al. (2021)",
      "format": "author_year",
      "section": "introduction",
      "paragraph_number": 3,
      "sentence_number": 2
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `total_citations` | int | 抽出された引用マーカー総数 |
| `items[].citation_id` | string | `C001` 形式の一意識別子 |
| `items[].marker_text` | string | 引用マーカーテキスト |
| `items[].format` | string | 引用形式（"numbered" / "author_year"） |
| `items[].section` | string | 出現セクション名 |
| `items[].paragraph_number` | int | 出現段落番号（1始まり） |
| `items[].sentence_number` | int | 出現文番号（段落内1始まり） |

---

## 7. `citation_contexts.json` スキーマ

References の各文献と本文中引用を対応づけ、引用文脈を付与したもの。

```json
{
  "items": [
    {
      "reference_id": "R001",
      "in_text_citations": [
        {
          "section": "introduction",
          "line_start": 42,
          "line_end": 45,
          "paragraph_start": 8,
          "sentence_start": 2,
          "citation_marker": "Smith et al. (2021)",
          "sentence": "Previous studies have suggested that online music interventions may reduce anxiety symptoms in children.",
          "context_before": "...",
          "context_after": "...",
          "claim_type": "background_evidence",
          "claim_summary": null,
          "strength_of_claim": null
        }
      ],
      "reference_text": "Smith J, Brown K. Online music intervention for children with anxiety..."
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `items[].reference_id` | string | 対応する References エントリの ID |
| `items[].in_text_citations` | array | 本文中の引用出現リスト |
| `items[].reference_text` | string | References の生テキスト（再掲） |
| `in_text_citations[].section` | string | 出現セクション名 |
| `in_text_citations[].citation_marker` | string | 引用マーカーテキスト |
| `in_text_citations[].sentence` | string | 引用を含む文全体 |
| `in_text_citations[].context_before` | string | 引用文の1文前 |
| `in_text_citations[].context_after` | string | 引用文の1文後 |
| `in_text_citations[].claim_type` | string | 主張タイプ（"background_evidence" / "method_reference" / "result_comparison" / "supporting" / "contradicting" / null） |
| `in_text_citations[].claim_summary` | string\|null | 主張要約（Phase 6 で LLM が埋める） |
| `in_text_citations[].strength_of_claim` | string\|null | 主張の強さ（Phase 6 で LLM が埋める） |

**注**: 行番号フィールド（`line_start`, `line_end`）は Phase 2F（docx/PDF 対応づけ）が完了するまで null となる。段落・文番号（`paragraph_start`, `sentence_start`）は Phase 2B のデータから即時設定可能。

---

## 8. 引用形式の暫定対応

Phase 3 では以下の2形式に対応する。

### 番号形式
- パターン: `[1]`, `[1,2]`, `[1-3]`, `[1,2,5]`
- 正規表現: `\[(\d+(?:[-,]\d+)*)\]`

### 著者年形式
- パターン: `Smith et al. (2021)`, `(Smith, 2021)`, `Smith and Brown (2021)`
- 簡易パターンマッチによる候補抽出

---

## 9. 対応づけロジック

1. `references_split.json` の各エントリから著者・年情報を抽出
2. `in_text_citations.json` の著者年形式マーカーと照合
3. 番号形式の場合は References の出現順と本文中の番号を照合
4. マッチしないものは `citation_contexts.json` に `parse_confidence: "low"` で記録
5. 1つの文献に複数の本文中引用がある場合は `in_text_citations` 配列にまとめる

---

## 10. 完了条件

- References が1件ずつ分割される
- 本文中引用候補が抽出される
- reference_id が付与される
- `citation_contexts.json` が作成される
- 不確実な対応には `parse_confidence` または warning が付与される

---

## 11. この段階では実装しないもの

- 文献DB照合（Phase 4）
- LLMによる引用妥当性評価（Phase 6）
- 孫引き検出

---

## 12. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様（セクション11.4）
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) — Phase 3 実装計画
- [SPEC_CLI.md](SPEC_CLI.md) — CLI コマンド仕様
- [SPEC_PROJECT_STRUCTURE.md](SPEC_PROJECT_STRUCTURE.md) — 作業フォルダ構成
- [SPEC_PREPROCESS.md](SPEC_PREPROCESS.md) — 前処理仕様（Phase 2）
