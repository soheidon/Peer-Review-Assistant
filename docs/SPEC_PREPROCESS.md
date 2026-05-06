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

## 2. Phase 2B: 段落番号・文番号作成（予定）

### 2.1 目的

Phase 2A で抽出した各段落・文に番号を付与し、査読コメントの位置指定に使えるようにする。

### 2.2 出力ファイル

- `paragraph_sentence_map.json`

### 2.3 コマンド（予定）

```bash
pra-cli preprocess-numbering --project <project_folder>
```

---

## 3. Phase 2C: セクション分割（予定）

### 3.1 目的

見出しスタイル・フォントサイズ・太字情報からセクション境界を推定し、セクション単位に分割する。

### 3.2 出力ファイル

- `sections/*.txt`（abstract.txt, introduction.txt, methods.txt 等）

### 3.3 コマンド（予定）

```bash
pra-cli preprocess-sections --project <project_folder>
```

---

## 4. Phase 2D〜2F: PDF 関連（予定）

PDF テキスト抽出、行番号抽出、docx/PDF 対応づけ。難易度が高いため後回し。

---

## 5. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様（セクション7）
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) — Phase 2 実装計画
- [SPEC_CLI.md](SPEC_CLI.md) — CLI コマンド仕様
- [SPEC_PROJECT_STRUCTURE.md](SPEC_PROJECT_STRUCTURE.md) — 作業フォルダ構成
