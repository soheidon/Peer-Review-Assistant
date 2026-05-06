# SPEC_PREPROCESS.md

# docx/PDF 前処理 詳細仕様

## 0. この文書の位置づけ

本書は、`SPEC.md` のセクション7で定義された前処理機能の詳細仕様である。docx 原稿と行番号付き PDF から本文・段落・文・行番号・セクションを抽出する処理を定義する。

前処理は以下のサブフェーズに分割して実装する。

| フェーズ | 内容 |
|---|---|
| 2A | docx 本文抽出・段落構造抽出 |
| 2B | 段落番号・文番号作成 |
| 2C | セクション分割 |
| 2D | PDF テキスト抽出 |
| 2E | PDF 行番号抽出 |
| 2F | docx/PDF 対応づけ |

---

## 1. Phase 2A: docx 本文抽出

### 1.1 目的

`work/source/manuscript.docx` から全文テキストと段落構造を抽出し、後続処理の基盤データを作成する。

### 1.2 使用ライブラリ

`python-docx` 1.0 以上

### 1.3 CLI コマンド

```bash
pra-cli preprocess-docx --project <project_folder>
```

### 1.4 入力

- `work/source/manuscript.docx` — `attach-source` でコピー済みの標準名 docx ファイル

### 1.5 出力ファイル

#### manuscript_full.txt

全段落テキストを改行で連結したプレーンテキストファイル。

#### manuscript_full.json

```json
{
  "paragraph_count": 42,
  "character_count": 12345,
  "paragraphs": [
    {"index": 0, "text": "Abstract text...", "style": "Normal"},
    {"index": 1, "text": "Introduction...", "style": "Heading 1"}
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `paragraph_count` | int | 総段落数 |
| `character_count` | int | 全文の文字数（空白含む） |
| `paragraphs` | array | 段落オブジェクトの配列 |
| `paragraphs[].index` | int | 0始まりの段落インデックス |
| `paragraphs[].text` | string | 段落テキスト |
| `paragraphs[].style` | string\|null | Word のスタイル名（例: "Normal", "Heading 1"） |

### 1.6 ステータス更新

#### task_status.json

```json
{
  "preprocess": "done"
}
```

#### preprocess.log

```
[2026-05-07T05:30:00.000000+09:00] preprocess-docx: paragraphs=42, chars=12345
```

#### project.json

`updated_at` を更新し、`preprocess.status` を `"done"` に設定する。

### 1.7 エラーコード

| コード | 条件 |
|---|---|
| `NO_PROJECT` | `project.json` が存在しない |
| `NO_SOURCE_FILE` | `source/manuscript.docx` が存在しない |
| `DOCX_READ_ERROR` | python-docx がファイルを読み取れない（破損・不正形式） |

---

## 2. Phase 2B: 段落番号・文番号作成

### 2.1 目的

Phase 2A で抽出した各段落・文に番号を付与し、査読コメントの位置指定に使えるようにする。

### 2.2 CLI コマンド

```bash
pra-cli preprocess-numbering --project <project_folder>
```

### 2.3 入力

- `manuscript_full.json`（Phase 2A の出力）

### 2.4 文分割ロジック

正規表現 `[^。。.!！?？\n]+[。。.!！?？\n]?` により文境界を検出する。

### 2.5 出力ファイル

`paragraph_sentence_map.json`

```json
{
  "paragraph_count": 18,
  "sentence_count": 32,
  "paragraphs": [
    {
      "index": 0,
      "paragraph_number": 1,
      "text": "...",
      "style": "Title",
      "sentence_count": 1,
      "sentences": [
        {"sentence_number": 1, "text": "..."}
      ]
    }
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `paragraph_count` | int | 総段落数 |
| `sentence_count` | int | 総文数 |
| `paragraphs[].paragraph_number` | int | 1始まりの段落番号 |
| `paragraphs[].sentence_count` | int | その段落内の文数 |
| `paragraphs[].sentences[].sentence_number` | int | 段落内での1始まり文番号 |

### 2.6 エラーコード

| コード | 条件 |
|---|---|
| `NO_PROJECT` | `project.json` が存在しない |
| `NO_MANUSCRIPT` | `manuscript_full.json` が存在しない |

---

## 3. Phase 2C: セクション分割

### 3.1 目的

見出しスタイル（Title, Heading 1〜3）からセクション境界を検出し、セクション単位に分割する。

### 3.2 CLI コマンド

```bash
pra-cli preprocess-sections --project <project_folder>
```

### 3.3 入力

- `manuscript_full.json`（Phase 2A の出力）

### 3.4 セクション分類ロジック

見出しテキストを小文字化し、キーワード照合で標準セクション名にマッピングする。

| 標準セクション名 | マッチするキーワード |
|---|---|
| `abstract` | abstract, 概要, 要旨 |
| `introduction` | introduction, intro, はじめに, 序論, 緒言 |
| `aim_objective` | aim, objective, purpose, 目的, 目標 |
| `methods` | method, methods, materials and methods, experimental, 方法, 実験, 手法 |
| `results` | results, result, 結果 |
| `discussion` | discussion, 考察, 議論 |
| `conclusion` | conclusion, conclusions, summary, 結論, まとめ, 総括 |
| `references` | references, bibliography, 参考文献, 引用文献, 文献 |

マッチしない場合は見出しテキストをファイル名用に変換したものを使用する。

### 3.5 出力ファイル

#### sections/<name>.txt

各セクションの段落テキストを改行で連結したファイル。

#### sections/_aggregated/<name>.txt

子セクションを持つ親セクション向けの統合テキストファイル。親セクションの見出し直下の本文が空で、下位セクションにのみ本文が存在する場合のフォールバックとして使用される。

ファイル内容は、親セクションの見出しテキスト + 各子セクションの見出し（Markdown の `#` プレフィックス付き）+ 子セクションの本文を連結したもの。

#### sections/section_map.json

```json
{
  "section_count": 8,
  "sections": [
    {"name": "abstract", "heading": "Abstract", "level": 1, "parent_section": null, "start_paragraph": 1, "end_paragraph": 2, "has_subsections": false, "aggregated_text_path": null},
    {"name": "procedure", "heading": "Procedure", "level": 2, "parent_section": "methods", "start_paragraph": 10, "end_paragraph": 12, "has_subsections": false, "aggregated_text_path": null},
    {"name": "methods", "heading": "Methods", "level": 1, "parent_section": null, "start_paragraph": 8, "end_paragraph": 14, "has_subsections": true, "aggregated_text_path": "sections/_aggregated/methods.txt"},
    {"name": "introduction", "heading": "Introduction", "level": 1, "parent_section": null, "start_paragraph": 3, "end_paragraph": 5, "has_subsections": false, "aggregated_text_path": null}
  ]
}
```

| フィールド | 型 | 説明 |
|---|---|---|
| `section_count` | int | セクション総数 |
| `sections[].name` | string | 分類された標準セクション名 |
| `sections[].heading` | string\|null | 元の見出しテキスト |
| `sections[].level` | int\|null | 見出しレベル（0=Title, 1=Heading 1, 2=Heading 2, 3=Heading 3, null=preamble） |
| `sections[].parent_section` | string\|null | 親セクションの `name`（上位レベルの見出しがない場合は null） |
| `sections[].start_paragraph` | int | セクション先頭段落のインデックス |
| `sections[].end_paragraph` | int | セクション末尾段落のインデックス |
| `sections[].has_subsections` | bool | 子セクションを持つかどうか |
| `sections[].aggregated_text_path` | string\|null | 統合テキストファイルのパス（例: `"sections/_aggregated/discussion.txt"`）。子セクションがない場合は null |

### 3.6 エラーコード

| コード | 条件 |
|---|---|
| `NO_PROJECT` | `project.json` が存在しない |
| `NO_MANUSCRIPT` | `manuscript_full.json` が存在しない |

---

## 4. Phase 2D〜2F: PDF 関連（予定）

PDF テキスト抽出、行番号抽出、docx/PDF 対応づけ。難易度が高いため後回し。

---

## 5. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様（セクション7）
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) — Phase 2 実装計画
- [SPEC_CLI.md](SPEC_CLI.md) — CLI コマンド仕様
- [SPEC_PROJECT_STRUCTURE.md](SPEC_PROJECT_STRUCTURE.md) — 作業フォルダ構成
