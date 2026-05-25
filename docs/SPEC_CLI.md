# SPEC_CLI.md

# Python CLI 詳細仕様

## 0. この文書の位置づけ

本書は、`SPEC.md` のセクション2.3〜2.4 で定義された Python CLI エンジンの詳細仕様である。CLI の起動方式、JSON Lines 通信プロトコル、各コマンドの入出力、エラーコード体系を定義する。

本CLIは Tauri デスクトップアプリから subprocess として呼び出されることを前提とするが、単体でのターミナル実行にも対応する。

---

## 1. CLI の役割

Python CLI は Peer Review Assistant の**処理エンジン**であり、以下の全処理を担当する。

- 作業フォルダの初期化
- 原稿（docx / PDF）の前処理・行番号抽出
- LLM 呼び出し（5チェック項目 × 3スロット）
- 文献データベース照会
- チェック項目内マージ
- 最終マージ・査読コメント出力

GUI（Tauri）は表示・操作・ファイル選択に徹し、解析ロジックは持たない。

---

## 2. 全体方針

### 2.1 フレームワーク

- **言語**: Python 3.11 以上
- **CLI フレームワーク**: Click 8.x
- **パッケージ管理**: pyproject.toml + setuptools
- **エントリポイント**: `pra-cli`（console_scripts → `peer_review_assistant.cli:main`）

### 2.2 通信プロトコル

CLI と GUI 間の通信は、**標準出力への JSON Lines（NDJSON）**で行う。各行が 1 つの JSON オブジェクトであり、イベント駆動で進捗・結果・エラーを通知する。

標準エラー出力は使用しない（エラーも JSON Lines で stdout に出力する）。

### 2.3 終了コード

| 終了コード | 意味 |
|---|---|
| `0` | 正常終了 |
| `1` | エラー終了（エラー内容は JSON Lines で通知済み） |

### 2.4 インストール

```bash
pip install -e python/
```

---

## 3. stdout JSON Lines 仕様

### 3.1 基本形式

```json
{"event": "<イベント種別>", "<key>": "<value>", ...}
```

すべての JSON オブジェクトは `event` フィールドを持つ。

### 3.2 イベント種別

| event | 用途 | 追加フィールド |
|---|---|---|
| `progress` | 処理の進捗通知 | `task`, `step`, `percent` |
| `done` | 処理の正常完了 | `task`, コマンド固有の結果フィールド |
| `error` | エラー通知 | `code`, `message` |
| `healthcheck` | ヘルスチェック応答 | `status`, `python_version`, `package_version` |

### 3.3 progress イベント

処理の途中経過を通知する。GUI は `percent` をプログレスバー等に表示できる。

```json
{"event":"progress","task":"init-project","step":"validate","percent":0}
{"event":"progress","task":"init-project","step":"create_dirs","percent":10}
{"event":"progress","task":"init-project","step":"create_logs","percent":40}
{"event":"progress","task":"init-project","step":"create_json","percent":60}
{"event":"progress","task":"init-project","step":"create_status","percent":80}
```

`percent` は 0〜100 の整数。100 は `done` イベントで代替されるため、progress では通常 80〜90 が上限。

### 3.4 done イベント

処理の正常完了を通知する。コマンドに応じた結果フィールドを含む。

```json
{"event":"done","task":"init-project","project":"C:\\Users\\...\\test001","message":"Project folder created successfully."}
```

### 3.5 error イベント

エラー発生を通知する。必ず `code`（エラーコード）と `message`（人間可読な説明）を含む。error イベントの直後に CLI は終了コード `1` で終了する。

```json
{"event":"error","code":"RELEASE_FOLDER_REJECTED","message":"Project folder must not be inside a release/ directory."}
```

### 3.6 文字コード

UTF-8（`ensure_ascii=False`）。非 ASCII 文字（日本語ファイル名等）はエスケープせずにそのまま出力する。

---

## 4. healthcheck コマンド

### 4.1 目的

CLI が正常に動作することを確認する。依存パッケージの読み込み、Python バージョン、パッケージバージョンを返す。

### 4.2 呼び出し

```bash
pra-cli healthcheck
```

### 4.3 出力

```json
{"event":"healthcheck","status":"ok","python_version":"3.12.11","package_version":"0.1.0"}
```

### 4.4 終了コード

`0`（常に正常終了。Click のグループコマンドとして実行されるため、基本的に失敗しない）

---

## 5. init-project コマンド

### 5.1 目的

指定されたパスに査読作業フォルダを作成し、必要なサブディレクトリ・空ログファイル・初期設定ファイルを生成する。

### 5.2 呼び出し

```bash
pra-cli init-project --project <作業フォルダのパス>
```

### 5.3 パラメータ

| パラメータ | 必須 | 型 | 説明 |
|---|---|---|---|
| `--project` | はい | PATH（ディレクトリ） | 作成する作業フォルダの絶対パスまたは相対パス |

### 5.4 検証ステップ（percent: 0）

1. **release/ チェック**: パスに `release` が含まれている場合、`RELEASE_FOLDER_REJECTED` エラー
2. **既存プロジェクトチェック**: パスに `project.json` が既に存在する場合、`PROJECT_EXISTS` エラー

### 5.5 ディレクトリ作成（percent: 10）

以下のサブディレクトリを作成する。

```
<project>/
  source/
  sections/
  citations/
  lines/
  prompts/
  outputs/
    structure/
    expression/
    methods_stats/
    citation/
    originality/
    final/
  status/
  logs/
```

### 5.6 ログファイル作成（percent: 40）

以下の空ログファイルを `logs/` に作成する。

- `preprocess.log`
- `llm_calls.log`
- `citation_db.log`
- `errors.log`

### 5.7 project.json 作成（percent: 60）

初期スキーマの `project.json` を作成する。全タイムスタンプは JST（UTC+9）の ISO 8601 形式。

```json
{
  "project_id": "<フォルダのベース名>",
  "created_at": "2026-05-07T04:27:50.945084+09:00",
  "updated_at": "2026-05-07T04:27:50.945084+09:00",
  "source": {
    "original_docx_path": null,
    "original_pdf_path": null,
    "docx_path": null,
    "pdf_path": null,
    "docx_sha256": null,
    "pdf_sha256": null,
    "docx_size_bytes": null,
    "pdf_size_bytes": null,
    "input_validation_status": "not_started",
    "source_mode": "docx_only",
    "line_numbers_available": false
  },
  "manuscript": {
    "title": null,
    "language": null,
    "article_type": null,
    "journal": null
  },
  "preprocess": {
    "status": "not_started",
    "docx_pdf_match_ratio": null,
    "line_extraction_status": "not_started",
    "line_alignment_confidence": null,
    "location_mode": "paragraph_sentence"
  },
  "settings": {
    "location_display": "both",
    "secure_mode": false
  }
}
```

### 5.8 task_status.json 作成（percent: 80）

全タスクの初期ステータスを `not_started` に設定した `status/task_status.json` を作成する。

```json
{
  "preprocess": "not_started",
  "citation_db": "not_started",
  "summary": "not_started",
  "checks": {
    "structure":      {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"},
    "expression":     {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"},
    "methods_stats":  {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"},
    "citation":       {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"},
    "originality":    {"llm01":"not_started","llm02":"not_started","llm03":"not_started","manual":"not_used","merged":"not_started"}
  },
  "final_merge": "not_started"
}
```

### 5.9 done イベント（percent: —）

全ステップ完了後、done イベントを出力して正常終了する。

```json
{"event":"done","task":"init-project","project":"<絶対パス>","message":"Project folder created successfully."}
```

---

## 6. validate-input コマンド

### 6.1 目的

選択された docx と PDF ファイルが、前処理を開始するための基本条件を満たしているか検証する。ファイルのコピーは行わない。

### 6.2 呼び出し

```bash
pra-cli validate-input --docx <file.docx> [--pdf <file.pdf>]
```

### 6.3 パラメータ

| パラメータ | 必須 | 型 | 説明 |
|---|---|---|---|
| `--docx` | はい | FILE（.docx） | 検証する docx ファイルのパス |
| `--pdf` | いいえ | FILE（.pdf） | 検証する PDF ファイルのパス（任意。省略時は PDF 関連の検証をスキップ） |

### 6.4 検証項目

1. docx ファイルが存在するか
2. docx の拡張子が `.docx` か
3. docx のファイルサイズが 0 より大きいか
4. PDF が指定された場合のみ: PDF ファイルの存在、拡張子 `.pdf`、サイズ > 0
5. docx の SHA256 を計算（PDF が指定された場合は PDF も）

### 6.5 成功時の出力

```json
{"event":"progress","task":"validate-input","step":"check_files","percent":0}
{"event":"progress","task":"validate-input","step":"compute_hash","percent":50}
{"event":"done","task":"validate-input","docx_path":"<絶対パス>","pdf_path":"<絶対パス>","docx_sha256":"abc...","pdf_sha256":"def...","docx_size_bytes":123456,"pdf_size_bytes":234567,"message":"Input files are valid."}
```

### 6.6 失敗時の出力

```json
{"event":"error","code":"INPUT_VALIDATION_FAILED","message":"docx file extension is not .docx: ...; PDF file is empty: ..."}
```

### 6.7 終了コード

成功 `0` / 失敗 `1`

---

## 7. attach-source コマンド

### 7.1 目的

検証済みの docx と PDF を `work/source/` に標準名でコピーし、`project.json` に元パス・作業コピーパス・SHA256・ファイルサイズを記録する。

### 7.2 呼び出し

```bash
pra-cli attach-source --project <project_folder> --docx <file.docx> [--pdf <file.pdf>]
```

### 7.3 パラメータ

| パラメータ | 必須 | 型 | 説明 |
|---|---|---|---|
| `--project` | はい | PATH（ディレクトリ） | 作業フォルダのパス（init-project で作成済みであること） |
| `--docx` | はい | FILE（.docx） | 原本 docx ファイルのパス |
| `--pdf` | いいえ | FILE（.pdf） | 原本 PDF ファイルのパス（任意。省略時は `source_mode: "docx_only"` となる） |

### 7.4 処理ステップ

| percent | step | 内容 |
|---|---|---|
| 0 | validate | project.json の存在確認、release/ チェック |
| 10 | validate_inputs | docx/PDF の存在・拡張子・サイズ検証 |
| 30 | compute_hash | SHA256 とファイルサイズを計算 |
| 50 | check_existing | work/source/ に既存ファイルがないか確認 |
| 70 | copy_files | work/source/manuscript.docx と manuscript_line_numbered.pdf にコピー |
| 85 | update_project_json | project.json の source セクションを更新 |

### 7.5 work/source/ 既存ファイルの扱い

`source/manuscript.docx` または `source/manuscript_line_numbered.pdf` が既に存在する場合、`SOURCE_EXISTS` エラーで拒否する。上書きしたい場合はユーザーが手動で削除する必要がある（Phase 2 暫定仕様）。

### 7.6 project.json 更新内容

`source` セクションに以下を書き込む。PDF が省略された場合、`pdf_path`、`pdf_sha256`、`pdf_size_bytes` は `null` となり、`source_mode` は `"docx_only"`、`line_numbers_available` は `false` となる。

```json
{
  "source": {
    "original_docx_path": "D:/.../original/received_manuscript.docx",
    "original_pdf_path": "D:/.../original/received_manuscript_line_numbered.pdf",
    "docx_path": "source/manuscript.docx",
    "pdf_path": "source/manuscript_line_numbered.pdf",
    "docx_sha256": "abc123...",
    "pdf_sha256": "def456...",
    "docx_size_bytes": 123456,
    "pdf_size_bytes": 234567,
    "input_validation_status": "ok",
    "source_mode": "docx_with_pdf",
    "line_numbers_available": false
  }
}
```

`source_mode` は以下のいずれか:

| 値 | 条件 |
|---|---|
| `docx_only` | PDF が指定されなかった |
| `docx_with_pdf` | PDF が指定されたが行番号抽出は未実行 |
| `docx_with_line_numbered_pdf` | 行番号抽出に成功（将来実装） |

### 7.7 done イベント

```json
{"event":"done","task":"attach-source","docx_path":"source/manuscript.docx","pdf_path":"source/manuscript_line_numbered.pdf","docx_sha256":"abc...","pdf_sha256":"def...","message":"Source files attached successfully."}
```

---

## 8. エラーコード一覧

| エラーコード | 発生コマンド | 説明 |
|---|---|---|
| `RELEASE_FOLDER_REJECTED` | `init-project`, `attach-source` | 指定パスが `release/` 以下である |
| `PROJECT_EXISTS` | `init-project` | 指定パスに既に `project.json` が存在する（メッセージは日本語: 「このフォルダには既にプロジェクトがあります。別のフォルダを選ぶか、GUIの「既存プロジェクトを開く」を使用してください。」） |
| `INPUT_VALIDATION_FAILED` | `validate-input`, `attach-source` | docx/PDF が検証条件を満たさない |
| `SOURCE_EXISTS` | `attach-source` | work/source/ に既にファイルが存在する |
| `NO_PROJECT` | `attach-source` | project.json が見つからない（init-project 未実行） |

---

## 9. release/ 以下拒否仕様

### 9.1 判定ロジック

```python
def is_under_release(path):
    target = os.path.abspath(path).replace("\\", "/").lower()
    parts = target.split("/")
    return "release" in parts
```

- パスを絶対パスに変換
- バックスラッシュをスラッシュに統一
- 小文字化してパスセグメントに分割
- いずれかのセグメントが `release` と完全一致するか判定

### 9.2 二重保護

**クライアントサイド（App.tsx）**: フォルダ選択時にパスを検査し、release/ 以下なら CLI 呼び出し前にブロックする。

**CLI サイド（cli.py）**: `init-project` の検証ステップで再度検査する。クライアントサイドの検査をすり抜けた場合の防御線。

---

## 10. Tauri からの subprocess 呼び出し

### 10.1 呼び出しパターン

```typescript
const { Command } = await import("@tauri-apps/plugin-shell");
const cmd = Command.create("pra-cli", ["healthcheck"]);
const output = await cmd.execute();
// output.stdout を行単位で JSON.parse
```

### 10.2 スコープ許可

Tauri v2 では、実行可能なコマンドを capabilities で明示的に許可する必要がある。

```json
{
  "identifier": "shell:allow-execute",
  "allow": [
    {
      "name": "pra-cli",
      "cmd": "pra-cli",
      "args": true
    }
  ]
}
```

### 10.3 注意事項

- `tauri.conf.json` の `plugins.shell` には `open` のみを記述し、スコープは capabilities で定義する（Tauri v2.3.x の仕様）
- subprocess の stdout をテキストとして取得し、改行で分割して各行を JSON.parse する
- パースに失敗した行は無視せず、生テキストとしてログに表示する
- エラー終了（exit code ≠ 0）時は `output.stderr` ではなく、stdout 内の `{"event":"error",...}` を表示する

---

## 11. 実装状況

### 11.1 実装済み

| コマンド | 説明 |
|---|---|
| `pra-cli healthcheck` | ヘルスチェック |
| `pra-cli init-project` | プロジェクト初期化 |
| `pra-cli validate-input` | 入力ファイル検証 |
| `pra-cli attach-source` | 原稿取り込み |
| `pra-cli preprocess` | docx本文抽出 |
| `pra-cli numbering` | 段落・文番号作成 |
| `pra-cli sections` | セクション分割 |
| `pra-cli extract-citations` | 引用文献抽出・分割 |
| `pra-cli citation-db-crossref` | Crossref 照合 |
| `pra-cli citation-db-pubmed` | PubMed 照合 |
| `pra-cli citation-db-google-books` | Google Books 書籍候補検索 |
| `pra-cli citation-db-semantic-scholar` | Semantic Scholar 照合（最終手段） |
| `pra-cli citation-db-cinii` | CiNii 論文照合（日本語文献） |
| `pra-cli citation-viewer-data` | 文献確認ビューアデータ生成 |
| `pra-cli llm-reference-repair` | LLM文献再パース |
| `pra-cli llm-reference-flags` | LLM文献フラグ生成 |
| `pra-cli llm-reference-process` | LLM文献情報整理（パース+フラグ） |
| `pra-cli search-references-llm` | LLM文献検索 |
| `pra-cli manual-search` | 手動文献検索 |
| `pra-cli unmatched-export` | 未照合文献CSV出力 |
| `pra-cli llm-search-log` | LLM検索ログ出力 |
| `pra-cli test-llm` | LLM 接続テスト |
| `pra-cli config-manage --list` | LLM設定一覧表示 |
| **ジャーナル分析** | |
| `pra-cli journal-profile` | ジャーナルプロファイル生成（LLMで40+フィールド構造化） |
| **新規性チェック** | |
| `pra-cli novelty-summarize` | 論文概要生成（8角度の新規性候補を抽出） |
| `pra-cli novelty-deep-research-prompt` | Deep Research プロンプト生成（広範囲探索用+批判的検証用） |
| `pra-cli novelty-merge-research` | 2つのDeep Research結果をLLMで比較・統合 |
| `pra-cli novelty-assess` | 新規性・ジャーナル適合性評価（ジャーナルプロファイル連携） |
| `pra-cli novelty-review-comment-candidates` | 査読コメント候補生成（12項目、将来の自動化用） |
| `pra-cli novelty-review-comment-compose` | 選択候補から査読コメント統合（将来の自動化用） |
| `pra-cli novelty-review-comment-auto` | 全自動査読コメント生成（将来の自動化用） |
| **査読チェック・マージ** | |
| `pra-cli run-structure-check` | 構成チェック（IMRaD整合性など） |
| `pra-cli run-expression-check` | 表現チェック（文法・学術表現・過剰主張） |
| `pra-cli run-methods-stats-check` | 方法・統計チェック（研究デザイン・統計手法・倫理） |
| `pra-cli run-citation-check` | 引用文献チェック（文献実在性・引用妥当性） |
| `pra-cli merge-check-section` | チェック項目内マージ（構成/表現/方法統計） |
| `pra-cli final-merge` | 最終マージ・査読コメント出力（`--format md,docx,txt,all` `--lang en,ja`） |

### 11.2 今後実装予定

| コマンド | 説明 |
|---|---|
| `pra-cli make-manual-prompt` | 手動入力用プロンプト生成 |
| `pra-cli import-manual-result` | 手動入力結果のインポート |
| `pra-cli auto-pipeline` | 全自動解析モード（ワンクリック全パイプライン実行） |

### 11.3 final-merge 詳細

```
pra-cli final-merge --project <project_folder> [--lang en|ja] [--format md,docx,txt,all]
```

最終査読コメント文書を生成する。全チェック項目のマージ結果、ユーザー選択状態、全体所感、採否判定を統合して出力する。

**パラメータ**:

| オプション | 必須 | 既定値 | 説明 |
|---|---|---|---|
| `--project` | はい | — | 作業フォルダのパス |
| `--lang` | いいえ | `en` | 出力言語（`en`=英語、`ja`=日本語） |
| `--format` | いいえ | `all` | 出力形式（カンマ区切り可）。`md`/`docx`/`txt`/`all` |

**出力ファイル**:

| パス | 説明 |
|---|---|
| `outputs/final/final_review.md` | 全体版 Markdown（英語） |
| `outputs/final/final_review_jp.md` | 全体版 Markdown（日本語） |
| `outputs/final/final_review.docx` | Word 形式（英語、`--format docx` 時） |
| `outputs/final/final_review_jp.docx` | Word 形式（日本語、`--format docx` 時） |
| `outputs/final/final_review.txt` | テキスト形式（英語、`--format txt` 時） |
| `outputs/final/final_review_jp.txt` | テキスト形式（日本語、`--format txt` 時） |
| `outputs/final/_data/comments_to_authors.md` | 著者向けコメント（英日バイリンガル） |
| `outputs/final/_data/confidential_comments_to_editor.md` | 編集者向けコメント |
| `outputs/final/_data/recommendation.md` | 推奨判定と理由 |
| `outputs/final/_data/audit_trail.json` | 処理記録 |

**出力形式の詳細**:

- **Markdown**（常に出力）: H2/H3 見出し、`**Label**:` 形式の太字ラベル。マスター形式。
- **テキスト**（`txt_writer.py`）: H2 → `━━━ Title ━━━`、H3 → `┄┄ Title ┄┄`、太字ラベル → `[Label] text`。Unicode 罫線文字使用。
- **Word**（`docx_writer.py`、python-docx）: A4 判、Times New Roman / Yu Mincho フォント。H2=14pt、H3=12pt の太字見出し。

**日本語訳保存**: `comments_to_authors.md` が英日バイリンガル形式（`# 査読コメント\n...\n\n---\n\n# Comments to Authors\n...`）の場合、再実行時に日本語部が保存される。

---

## 12. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様
- [SPEC_PROJECT_STRUCTURE.md](SPEC_PROJECT_STRUCTURE.md) — 作業フォルダ構成・設定ファイルスキーマ
