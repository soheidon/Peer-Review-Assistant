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
    "docx_path": null,
    "pdf_path": null,
    "docx_sha256": null,
    "pdf_sha256": null
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

## 6. エラーコード一覧

| エラーコード | 発生コマンド | 説明 |
|---|---|---|
| `RELEASE_FOLDER_REJECTED` | `init-project` | 指定パスが `release/` 以下である |
| `PROJECT_EXISTS` | `init-project` | 指定パスに既に `project.json` が存在する |

今後、各フェーズの実装に伴いエラーコードを追加する。

---

## 7. release/ 以下拒否仕様

### 7.1 判定ロジック

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

### 7.2 二重保護

**クライアントサイド（App.tsx）**: フォルダ選択時にパスを検査し、release/ 以下なら CLI 呼び出し前にブロックする。

**CLI サイド（cli.py）**: `init-project` の検証ステップで再度検査する。クライアントサイドの検査をすり抜けた場合の防御線。

---

## 8. Tauri からの subprocess 呼び出し

### 8.1 呼び出しパターン

```typescript
const { Command } = await import("@tauri-apps/plugin-shell");
const cmd = Command.create("pra-cli", ["healthcheck"]);
const output = await cmd.execute();
// output.stdout を行単位で JSON.parse
```

### 8.2 スコープ許可

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

### 8.3 注意事項

- `tauri.conf.json` の `plugins.shell` には `open` のみを記述し、スコープは capabilities で定義する（Tauri v2.3.x の仕様）
- subprocess の stdout をテキストとして取得し、改行で分割して各行を JSON.parse する
- パースに失敗した行は無視せず、生テキストとしてログに表示する
- エラー終了（exit code ≠ 0）時は `output.stderr` ではなく、stdout 内の `{"event":"error",...}` を表示する

---

## 9. 実装状況

### 9.1 実装済み（Phase 1）

| コマンド | 状況 |
|---|---|
| `pra-cli healthcheck` | 実装済み |
| `pra-cli init-project` | 実装済み |

### 9.2 今後実装予定

| コマンド | フェーズ | 説明 |
|---|---|---|
| `pra-cli preprocess` | Phase 2 | docx/PDF 前処理・行番号抽出 |
| `pra-cli extract-citations` | Phase 3 | 引用文献の抽出 |
| `pra-cli citation-db` | Phase 4 | 文献データベース照会 |
| `pra-cli test-llm` | Phase 5 | LLM 接続テスト |
| `pra-cli test-db` | Phase 4 | 文献 DB 接続テスト |
| `pra-cli run-check` | Phase 6 | チェック項目の LLM 実行 |
| `pra-cli make-manual-prompt` | Phase 6 | 手動入力用プロンプト生成 |
| `pra-cli import-manual-result` | Phase 6 | 手動入力結果のインポート |
| `pra-cli merge-section` | Phase 7 | チェック項目内マージ |
| `pra-cli summarize-manuscript` | Phase 8 | 原稿要約 |
| `pra-cli final-merge` | Phase 9 | 最終マージ・査読コメント出力 |

---

## 10. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様（セクション2.3〜2.4）
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) — 実装フェーズ別仕様
- [SPEC_PROJECT_STRUCTURE.md](SPEC_PROJECT_STRUCTURE.md) — 作業フォルダ構成・設定ファイルスキーマ
- [implementation_logs/2026-05-07_phase1-implementation.md](implementation_logs/2026-05-07_phase1-implementation.md) — Phase 1 実装ログ
