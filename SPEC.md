# SPEC.md

# Peer Review Assistant / 査読アシスタント 全体仕様書

## 0. この仕様書の位置づけ

本仕様書は、**Peer Review Assistant / 査読アシスタント** の全体仕様を定義する。

本ツールは、学術雑誌の査読者が受け取った原稿を読み、査読コメントを作成する作業を支援するデスクトップアプリケーションである。docx 原稿と、Word から手作業で出力した行番号付き PDF を入力し、原稿本文、セクション、行番号、段落番号、文番号、引用文献、本文中引用を前処理したうえで、複数 LLM、文献データベース、手入力結果を統合し、査読意見を Markdown 形式で出力する。

実装は以下を前提とする。

```text
GUI: Tauri + TypeScript (React)
処理エンジン: Python CLI (Click)
対象OS: Windows 11 を主対象とする
入力原稿: docx + Wordから保存した行番号付きPDF
出力: Markdown / JSON / 作業フォルダ
```

ドキュメント構成：

```text
SPEC.md                         全体仕様（本書）
docs/SPEC_PROJECT_STRUCTURE.md  リポジトリ・作業フォルダ構成・設定ファイルスキーマ
docs/SPEC_PREPROCESS.md         docx/PDF前処理仕様
docs/SPEC_CLI.md                Python CLI仕様
docs/SPEC_CITATION_EXTRACTION.md 引用文献・本文中引用抽出仕様
docs/SPEC_CITATION_DB.md        文献DB照合仕様
docs/SPEC_LLM.md                LLM接続・実行仕様
```

---

## 1. 名称

### 1.1 正式名称

**Peer Review Assistant**

### 1.2 日本語名

**査読アシスタント**

### 1.3 説明文

Peer Review Assistant は、査読者が受け取った学術論文原稿について、構成、表現、方法・統計、引用文献、先行研究との関係を点検し、行番号付きまたは段落・文番号付きの査読コメント作成を支援するツールである。

本ツールは査読者の判断を代替しない。査読者が原稿を理解し、問題点を整理し、著者向けコメントおよび編集者向けコメントを作成するための補助ツールである。

---

## 2. アーキテクチャ

### 2.1 採用技術

```text
Tauri v2 + React TypeScript + Python CLI
```

| 層 | 技術 | 役割 |
|---|---|---|
| GUI | Tauri v2 + React + TypeScript | 画面表示、ファイル選択、状態管理、CLI 呼び出し |
| 処理エンジン | Python 3.11+ + Click | docx/PDF前処理、文献DB照合、LLM呼び出し、マージ、出力 |
| 通信 | subprocess + NDJSON | CLI を subprocess として起動し、標準出力で JSON Lines を授受 |

### 2.2 Tauri GUI の役割

- 画面表示（サイドバー + パネル切替）
- ファイル選択（docx, PDF, プロジェクトフォルダ）
- プロジェクト作成・開く・状態復元
- API設定画面（LLMスロット設定、接続テスト）
- 各処理ボタン（前処理、文献DB照合、チェック実行、マージ）
- 進捗表示（プログレスバー、ステータスチップ）
- Markdown 結果表示
- Python CLI の subprocess 呼び出し
- 処理ログ表示（ボトムログペイン）
- 状態管理（全 state は App.tsx に集約）

### 2.3 Python CLI の役割

- docx 本文抽出
- PDF 行番号抽出
- docx本文とPDF行番号の対応づけ
- 段落番号・文番号作成
- セクション分割
- References 抽出
- 本文中引用抽出
- 文献DB API照合
- LLM API呼び出し
- 手入力結果の取り込み
- 各チェック項目内マージ
- 最終マージ
- Markdown査読コメント生成

### 2.4 通信プロトコル

Tauri から Python CLI を subprocess として起動し、標準出力で JSON Lines（NDJSON）を授受する。

```text
Tauri GUI
↓
Python CLI を subprocess として起動
↓
入力は CLI引数 で渡す
↓
処理結果は作業フォルダ内の JSON / Markdown に保存
↓
進捗とエラーは stdout の JSON Lines で通知
↓
Tauri が stdout をパースして画面更新
```

各イベントは `event` フィールドを持つ JSON オブジェクト：

```json
{"event":"progress","task":"preprocess","step":"extract_docx","percent":20}
{"event":"done","task":"preprocess","paragraphs":291,"chars":70835}
{"event":"error","code":"INPUT_VALIDATION_FAILED","message":"..."}
{"event":"healthcheck","status":"ok","python_version":"3.12.11","package_version":"0.1.0"}
```

| event | 用途 |
|---|---|
| `progress` | 処理の進捗通知 |
| `done` | 処理の正常完了 |
| `error` | エラー通知 |
| `healthcheck` | ヘルスチェック応答 |

詳細は [docs/SPEC_CLI.md](docs/SPEC_CLI.md) 参照。

### 2.5 UTF-8 エンコーディング

Windows 環境では Python の `sys.stdout` がシステムコードページ（cp932）に設定される。Tauri plugin-shell の Rust 側は strict UTF-8 デコードを行うため、日本語文字を含む出力で `"invalid utf-8 sequence"` エラーが発生する。

**対策**: `cli.py` の冒頭で stdout/stderr を UTF-8 に再設定する。

```python
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")
os.environ.setdefault("PYTHONIOENCODING", "utf-8")
os.environ.setdefault("PYTHONUTF8", "1")
```

### 2.6 Word COM 非依存

本ツールでは Word COM による自動PDF化は実装しない。ユーザーが Word から手作業で行番号付き PDF を保存し、アプリに入力する。これにより Word COM への依存を避け、実装と配布を軽量化する。

---

## 3. プロジェクト管理

### 3.1 プロジェクトフォルダ構成

作業フォルダはリポジトリ外にユーザーが任意の場所を指定する。`project.json` の存在によりプロジェクトフォルダであることを識別する。

```text
project_folder/
  project.json
  manuscript_full.txt
  manuscript_full.json

  source/
    manuscript.docx
    manuscript_line_numbered.pdf

  sections/
    abstract.txt / introduction.txt / aim_objective.txt
    methods.txt / results.txt / discussion.txt
    conclusion.txt / references.txt
    tables.txt / figure_captions.txt

  citations/
    in_text_citations.json / references_split.json
    citation_contexts.json / db_verified_references.json
    db_unmatched_references.json / db_search_log.json

  lines/
    pdf_line_text.json / line_map.json
    line_numbered_text.txt / paragraph_sentence_map.json
    alignment_report.json

  prompts/
    structure_check_prompt.txt / expression_check_prompt.txt
    methods_stats_check_prompt.txt / citation_check_prompt.txt
    originality_check_prompt.txt / final_merge_prompt.txt

  outputs/
    structure/ / expression/ / methods_stats/
    citation/ / originality/ / final/

  status/
    task_status.json

  logs/
    preprocess.log / llm_calls.log / citation_db.log / errors.log
```

### 3.2 project.json スキーマ

`project.json` は作業フォルダ全体のメタ情報を保持する中心ファイルである。API Key は保存しない。

```json
{
  "project_id": "e2e_test_project",
  "created_at": "2026-05-07T08:03:32+09:00",
  "updated_at": "2026-05-07T13:44:36+09:00",
  "source": {
    "original_docx_path": "D:/.../original/manuscript.docx",
    "original_pdf_path": "D:/.../original/manuscript_line_numbered.pdf",
    "docx_path": "source/manuscript.docx",
    "pdf_path": "source/manuscript_line_numbered.pdf",
    "docx_sha256": "abc123...",
    "pdf_sha256": "def456...",
    "docx_size_bytes": 11421914,
    "pdf_size_bytes": 5725328,
    "input_validation_status": "ok",
    "source_mode": "docx_with_pdf",
    "line_numbers_available": false
  },
  "manuscript": {
    "title": null,
    "language": null,
    "article_type": null,
    "journal": null
  },
  "preprocess": {
    "status": "done",
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

| フィールド | 説明 |
|---|---|
| `source.source_mode` | `docx_only` / `docx_with_pdf` / `docx_with_line_numbered_pdf` |
| `source.line_numbers_available` | PDFからの行番号抽出が成功したか |
| `source.input_validation_status` | `not_started` / `ok` |
| `preprocess.status` | `not_started` / `in_progress` / `done` |
| `preprocess.location_mode` | `paragraph_sentence` / `line_with_paragraph_fallback` / `line` |

### 3.3 task_status.json

全タスクのステータスを一元管理する。

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

ステータス値: `not_started` / `in_progress` / `done` / `partial` / `failed` / `not_used`

### 3.4 プロジェクトの作成と復元

**新規作成** (`pra-cli init-project`): 空フォルダに作業ディレクトリ構成、空ログファイル、初期 `project.json` と `task_status.json` を作成する。`release/` 以下のパスは拒否する。

**既存プロジェクト開く**: GUI の「既存プロジェクトを開く」ボタンで `project.json` を読み込み、`docxPath`、`pdfPath`、`validationOk`、`sourceAttached`、`preprocessDone` 等の状態を復元する。Tauri の `invoke("read_text_file")` でファイルを読み取り、JSON をパースして state に反映する。

---

## 4. 入力ファイル

### 4.1 入力モード

PDF は必須ではなく、以下の 3 モードをサポートする。

| モード | docx | PDF | 行番号 | 説明 |
|---|---|---|---|---|
| `docx_only` | 必須 | なし | なし | 段落・文番号のみでコメント位置を表示 |
| `docx_with_pdf` | 必須 | あり | 未確認 | PDF はあるが行番号抽出が未実行または失敗 |
| `docx_with_line_numbered_pdf` | 必須 | あり | あり | 行番号抽出に成功（将来実装） |

モードは `project.json` の `source.source_mode` に保存される。PDF が選択されていない場合は GUI に警告を表示する。

### 4.2 ファイル検証 (`validate-input`)

選択された docx と PDF（任意）が処理可能かを検証する。

検証項目:
- docx ファイルの存在確認
- docx 拡張子が `.docx` か
- docx ファイルサイズ > 0
- PDF が指定された場合: 存在、拡張子 `.pdf`、サイズ > 0
- 両方の SHA256 を計算

```bash
pra-cli validate-input --docx <file.docx> [--pdf <file.pdf>]
```

### 4.3 ファイル取り込み (`attach-source`)

検証済みファイルを `work/source/` に標準名でコピーし、`project.json` を更新する。

```bash
pra-cli attach-source --project <project_folder> --docx <file.docx> [--pdf <file.pdf>]
```

コピー先:
- `source/manuscript.docx`
- `source/manuscript_line_numbered.pdf`

`project.json` に元パスと作業コピーパスの両方を記録する。原本は変更しない。

---

## 5. 前処理パイプライン

### 5.1 概要

前処理では docx と PDF を解析し、後続処理に必要な中間ファイルを作成する。処理は以下の順で実行する。

```
1. docx本文抽出      → manuscript_full.json, manuscript_full.txt
2. 段落・文番号作成   → paragraph_sentence_map.json
3. セクション分割     → sections/*.txt
4. PDF行番号抽出     → line_map.json（PDFがある場合）
5. 引用文献抽出       → references_split.json, in_text_citations.json
```

各ステップは独立した CLI コマンドとして実装する。

### 5.2 docx 本文抽出

`source/manuscript.docx` から全文テキスト、段落、見出し候補、表テキスト、図表キャプションを抽出する。

出力: `manuscript_full.json`, `manuscript_full.txt`

### 5.3 段落番号・文番号作成

docx 本文から段落・文を識別し、番号を付与する。

```text
docx本文 → 段落分割 → paragraph_id 付与 → 文分割 → sentence_id 付与
```

出力: `paragraph_sentence_map.json`

### 5.4 セクション分割

見出しベースのルールでセクションを分割する。

対象見出し: Abstract, Introduction, Background, Aim/Aims/Objective/Objectives, Methods/Materials and Methods, Results, Discussion, Conclusion, References

Aim/Objective が独立見出しとして存在しない場合は、Introduction または Methods 冒頭から目的文候補を抽出する。セクション分割が不完全な場合でも処理は停止しない。

### 5.5 PDF 行番号抽出

`source/manuscript_line_numbered.pdf` から行番号を抽出し、docx 本文と対応づける。

```text
PDFから行番号付き本文行を取得
↓
docx本文と類似度で対応づけ
↓
line_map.json を作成
```

信頼度指標:
- `docx_pdf_match_ratio`: docx本文とPDF本文の一致率（< 0.85 → 警告）
- `line_detection_rate`: 行番号検出率（< 0.70 → 行番号取得失敗）
- `line_alignment_confidence`: 対応づけ信頼度（< 0.80 → 段落・文番号フォールバック）

PDF行番号抽出は技術的に不安定なため、失敗時は段落・文番号にフォールバックする。

### 5.6 Location オブジェクト

内部データでは位置情報を統一フォーマットで扱う。

```json
{
  "location": {
    "preferred": "line",
    "section": "Methods",
    "line_start": 128, "line_end": 131,
    "paragraph_start": 12, "paragraph_end": 13,
    "sentence_start": 2, "sentence_end": 4,
    "text_excerpt": "The intervention consisted of..."
  }
}
```

優先順位: Word行番号 > 段落・文番号。両方ある場合は行番号を主表示し、段落・文番号も保持する。

---

## 6. 引用文献処理

### 6.1 References 抽出

docx 本文から References セクションを特定し、個別文献に分割する。

出力: `references_split.json`

### 6.2 本文中引用抽出

本文中の引用箇所（`(Author, Year)` や `[1]` 等）を抽出し、どの文献のどの主張を支えているかを記録する。

出力: `in_text_citations.json`, `citation_contexts.json`

### 6.3 文献DB照合

抽出した引用文献を外部DBで検証する。MVPでは以下に対応:

| DB | 優先分野 | 用途 |
|---|---|---|
| PubMed / NCBI E-utilities | 医学・生命科学 | 文献実在確認、メタデータ取得 |
| Crossref | 全分野 | DOI検証、書誌情報正規化 |
| Semantic Scholar | 心理・教育・情報 | 引用・被引用、類似論文 |
| OpenAlex | 学際 | 補完的検索 |

照合フロー:

```text
References分割 → DOI/PMID抽出 → タイトル検索
→ 著者・年・雑誌名照合 → 抄録・論文タイプ取得
→ db_verified_references.json / db_unmatched_references.json 出力
```

### 6.4 文献確認ビューア

GUI の「文献確認」パネルでは、照合結果をタブで表示する。

- **サマリータブ**: 確認済/未照合/要確認の統計
- **確認済タブ**: DB照合に成功した文献一覧（DOI、タイトル、著者）
- **未照合タブ**: DBで見つからなかった文献
- **要確認タブ**: 照合結果に疑義がある文献（著者名不一致、年不一致など）

---

## 7. LLM チェック実行

### 7.1 チェック項目

| チェック項目 | 主な確認内容 |
|---|---|
| **構成** (Structure) | IMRaD構成、Abstract整合性、MethodsとResultsの対応、Discussionの過剰拡大解釈 |
| **表現** (Expression) | 英語文法、冠詞、時制、学術表現、曖昧表現、過剰主張 |
| **方法・統計** (Methods/Stats) | 研究デザイン、介入内容、統計手法、サンプルサイズ、欠測値処理、倫理審査 |
| **引用文献** (Citation) | 文献実在性、引用の妥当性、不適切引用・孫引き検出 |
| **先行研究** (Originality) | 類似研究との重複、新規性の妥当性、重要先行研究の不足 |

### 7.2 LLM スロット

| スロット | 役割 |
|---|---|
| まとめLLM (summary) | マージ処理、最終査読コメント整形 |
| 解析者1 (reviewer1) | 各チェック項目の個別分析 |
| 解析者2 (reviewer2) | 解析者1とは独立した分析（異なるモデル推奨） |
| 解析者3 (reviewer3) | 第3の分析（任意） |

解析者1のみ設定の場合はマージ不要（結果をそのまま採用）。解析者2以上ありの場合はまとめLLMが比較・統合する。

### 7.3 手入力モード

各チェック項目は API 実行と手入力の両方に対応する。手入力モードでは:

1. ツールがプロンプトを生成
2. ユーザーが ChatGPT/Claude 等の Web チャットに貼り付け
3. 得られた結果を GUI に貼り戻し
4. JSON として取り込み

### 7.4 API 設定

各 LLM スロットに以下を設定する:

- 表示名
- Provider（OpenAI, Anthropic, Google Gemini, DeepSeek, OpenRouter, Ollama, LM Studio, OpenAI-Compatible, Custom）
- Base URL
- Model
- API Key（OSの資格情報ストアに保存、平文保存禁止）

接続テストはスロットごとに実行可能。全スロット一括テストも可能。

---

## 8. マージパイプライン

### 8.1 処理の三層構造

```text
第1層：個別 LLM または手入力による分析
第2層：各チェック項目内でのマージ・査読コメント候補作成
第3層：全体マージ・最終査読意見作成
```

### 8.2 チェック項目内マージ

LLM01/02/03 と手入力結果を統合し、チェック項目ごとの査読コメント候補を作成する。

マージ方針:
- 複数LLMが同じ問題を指摘 → 信頼度高
- 1つだけ指摘 → 根拠が明確なら採用候補
- LLM間で矛盾 → conflict として記録（多数決しない）
- 不確実な指摘 → 断定を避け clarify/consider 表現に

出力: `outputs/{check}/merged.section.json`, `merged.section.md`

### 8.3 最終マージ

全チェック項目の統合結果、原稿要約、line_map、paragraph_sentence_map を統合し、最終査読コメントを生成する。

```bash
pra-cli final-merge --project <project_folder>
```

---

## 9. 査読コメント出力

### 9.1 出力ファイル

```text
outputs/final/
  final_review.md                   全体版（著者向け + 編集者向け）
  comments_to_authors.md            著者向けコメントのみ
  confidential_comments_to_editor.md 編集者向けコメントのみ
  recommendation.md                 推奨判定と理由
  citation_report.md                文献チェックレポート
  originality_report.md             先行研究比較レポート
  audit_trail.json                  処理記録
```

### 9.2 出力形式

```markdown
# Peer Review

## 1. Brief Summary
[原稿の内容を2〜5文で要約]

## 2. General Assessment
[全体評価]

## 3. Major Comments
1. **[Category: Methods / Lines 128-131]**
   [問題点] / [なぜ重要か] / [著者に求める修正]

## 4. Minor Comments

## 5. Citation and Literature Concerns

## 6. Originality and Overlap

## 7. Confidential Comments to the Editor

## 8. Recommendation
[Accept / Minor Revision / Major Revision / Reject]
```

### 9.3 Location 表記

| モード | 表記例 |
|---|---|
| 行番号あり | `Lines 128-131` |
| 段落・文のみ | `Paragraph 12, Sentence 2` |
| 両方 | `Lines 128-131; Paragraph 12, Sentences 2-4` |

### 9.4 重大度分類

**Major Comment**: 研究目的と方法の不一致、再現不能な方法説明、統計手法の誤り、結果と結論の不一致、主要先行研究の欠落、重大な倫理的懸念

**Minor Comment**: 英語表現の軽微な不自然さ、語句の曖昧さ、表記揺れ、図表タイトル修正、引用形式の不備

---

## 10. GUI アーキテクチャ

### 10.1 画面構成

```
┌──────────┬──────────────────────────────────────┐
│ Sidebar  │ Progress Bar (ステップ表示)           │
│          ├──────────────────────────────────────┤
│ ホーム   │ 現在のプロジェクト: /path/to/project  │
│ プロジェクト├──────────────────────────────────────┤
│ 前処理   │                                      │
│ 文献確認 │ Active Panel                         │
│ 査読チェック│ (home/project/preprocess/          │
│ 結果     │  citations/review/results/settings)  │
│ 設定     │                                      │
│          ├──────────────────────────────────────┤
│          │ ▼ ログ (collapsible bottom pane)     │
└──────────┴──────────────────────────────────────┘
```

### 10.2 サイドバー

7 メニュー項目。アクティブ項目は青ハイライト + 左ボーダー。

| 項目 | キー | アイコン |
|---|---|---|
| ホーム | home | 🏠 |
| プロジェクト | project | 📁 |
| 前処理 | preprocess | ⚙️ |
| 文献確認 | citations | 📚 |
| 査読チェック | review | ✓ |
| 結果 | results | 📄 |
| 設定 | settings | 🔧 |

### 10.3 プログレスバー

8 ステップの水平ステップインジケーター。各ステップは丸 + ラベルで表示。完了ステップは緑、現在ステップは青、未着手は灰色。

クリックで該当パネルに遷移可能。

```text
①プロジェクト作成 → ②入力ファイル取込 → ③docx本文抽出 → ④引用文献抽出
→ ⑤文献DB照合 → ⑥文献確認 → ⑦査読チェック → ⑧最終出力
```

### 10.4 パネル一覧

| パネル | コンポーネント | 主な機能 |
|---|---|---|
| HomePanel | `panels/HomePanel.tsx` | システムヘルスチェック、進捗サマリー、次ステップ提案 |
| ProjectPanel | `panels/ProjectPanel.tsx` | プロジェクト作成/開く、docx/PDF選択、ファイル検証・取り込み |
| PreprocessPanel | `panels/PreprocessPanel.tsx` | docx本文抽出、段落・文番号作成、セクション分割、引用文献抽出、Crossref照合、文献確認データ作成 |
| CitationReviewPanel | `panels/CitationReviewPanel.tsx` | 文献照合結果のタブ表示（サマリー/確認済/未照合/要確認）、要確認アラート |
| ReviewChecksPanel | `panels/ReviewChecksPanel.tsx` | 評価者1/2/3 のLLMチェック実行、チェック項目内マージ、最終出力 |
| ResultsPanel | `panels/ResultsPanel.tsx` | 出力ファイルの選択表示（最終査読/著者向け/編集者向け/推奨判定/処理記録） |
| SettingsPanel | `panels/SettingsPanel.tsx` | LLMスロット設定、APIキー、接続テスト |

### 10.5 ボトムログペイン

常時表示の折りたたみ可能なログ領域。
- 展開時: 高さ 150px、全ログ行を表示、「ログを消去」ボタン
- 折りたたみ時: 高さ 28px、ログ件数バッジを表示
- ヘッダークリックで展開/折りたたみ切替

### 10.6 状態管理

全状態は `App.tsx` に `useState` で集約（30+ state）。React Context 不使用。各パネルは純粋なプレゼンテーションコンポーネントで、必要な props のみ受け取る。

主な状態カテゴリ:
- **ナビゲーション**: `activeView`
- **プロジェクト**: `projectPath`, `projectCreated`, `docxPath`, `pdfPath`
- **進捗フラグ**: `validationOk`, `sourceAttached`, `preprocessDone`, `numberingDone`, `sectionsDone`, `citationExtractionDone`, `crossrefDone`, `viewerDataReady`, `structureMergeDone`, `expressionMergeDone`, `methodsStatsMergeDone`, `finalMergeDone`
- **実行中フラグ**: `validateRunning`, `attachRunning`, `preprocessRunning`, `numberingRunning`, `sectionsRunning`, `citationExtractionRunning`, `crossrefRunning`, `viewerDataGenerating`, `structureMergeRunning`, `expressionMergeRunning`, `methodsStatsMergeRunning`, `finalMergeRunning`
- **フィードバック**: `statusMessage`（8秒で自動消去）, `preprocessResults`, `crossrefSummary`
- **LLM設定**: `llmSlots`, `llmTestResults`
- **結果表示**: `selectedResultFile`, `resultFileContent`, `resultFileLoading`
- **ログ**: `logs`, `logExpanded`

### 10.7 ステータス表示パターン

各操作行は以下の統一パターンで表示する:

```
[操作名]  [実行ボタン]  [状態チップ]  [補足情報]
```

**ステータスチップの種類**:

| 状態 | ラベル | CSS class |
|---|---|---|
| 未実行 | 未実行 | `status-chip.unrun` (灰) |
| 実行中 | 実行中... | `status-chip.running` (青) |
| 完了 | 完了 | `status-chip.ok` (緑) |
| 要確認 | 要確認 | `status-chip.warn` (橙) |
| エラー | エラー | `status-chip.err` (赤) |

**ボタンテキスト変化**（実行中は「〜中...」に変化）:

| 通常 | 実行中 |
|---|---|
| 入力ファイルを確認 | 確認中... |
| プロジェクトに取り込み | 取り込み中... |
| docx本文抽出 | 抽出中... |
| 段落・文番号作成 | 作成中... |
| セクション分割 | 分割中... |
| 引用文献抽出 | 抽出中... |
| Crossref照合 | 照合中... |
| 文献確認データ作成 | 作成中... |

**ステータスメッセージバナー**: 各パネル上部に表示。成功（緑）/ エラー（赤）/ 情報（青）。8秒で自動消去。

**無効ボタンの理由表示**: 無効化されたボタンの下に小さな灰色テキストで理由を表示。
例: 「先にdocx本文抽出を実行してください」「LLM設定と接続確認が必要です」

**次ステップ提案**: 各パネル下部に次の推奨アクションを橙色テキストで表示。

**補足情報**: 処理完了後、同じ行にサマリー情報を表示。
例: `291段落、70,835文字`（docx本文抽出後）、`23件確認、49件未照合`（Crossref照合後）

---

## 11. セキュリティ

### 11.1 基本方針

査読対象原稿は機密情報である。

### 11.2 通常APIモード

- ジャーナル/編集部が AI 利用を許可している場合に使用
- 外部 API に原稿全文を送信する可能性がある
- プロバイダーのデータ利用ポリシー（学習・品質改善・ログ保存への利用有無）をユーザーが確認する前提

### 11.3 セキュアモード

- 原稿全文を外部 API に送らない
- ローカル LLM を使用
- 外部 DB には DOI、PMID、タイトル、著者名などの文献情報のみ送信
- Deep Research には抽象化した PICO、キーワードのみ送信

### 11.4 APIキー管理

- OS の資格情報ストア（Windows Credential Manager / DPAPI）に保存
- `project.json` や平文設定ファイルには保存しない
- Python CLI へは環境変数または一時ファイルで受け渡し（一時ファイルは処理終了後に削除）

### 11.5 注意文言（アプリ内表示）

```
本ツールは査読者の判断を代替しません。
査読対象原稿を外部 API へ送信する場合は、当該ジャーナル・出版社・編集部・所属機関の AI 利用ポリシーに従ってください。
機密性の高い原稿については、ローカル LLM または所属機関が許可した閉域環境での利用を推奨します。
```

---

## 12. エラー処理

### 12.1 部分失敗時の基本方針

1. 1つの処理が失敗してもプロジェクト全体を破棄しない
2. 成功した出力は保存し再利用可能にする
3. 失敗した処理だけを再実行可能にする
4. 全自動解析モードでも可能な限り後続処理を継続
5. 最終マージは利用可能なチェック結果のみで実行可能

### 12.2 フォールバック

| 失敗 | フォールバック |
|---|---|
| PDF行番号抽出失敗 | 段落・文番号にフォールバック |
| LLM01失敗、LLM02成功 | LLM02の結果だけでマージ |
| PubMed失敗、Crossref成功 | 成功したDB結果のみでレポート作成 |
| セクション分割不完全 | 警告表示、処理継続 |

### 12.3 リトライ

外部API呼び出しは最大3回の自動リトライ（指数バックオフ: 2秒 → 5秒 → 10秒）。3回失敗で `failed` として記録。

### 12.4 エラーコード一覧

| エラーコード | コマンド | 説明 |
|---|---|---|
| `RELEASE_FOLDER_REJECTED` | `init-project`, `attach-source` | パスが `release/` 以下 |
| `PROJECT_EXISTS` | `init-project` | 既に `project.json` が存在 |
| `INPUT_VALIDATION_FAILED` | `validate-input`, `attach-source` | ファイル検証失敗 |
| `SOURCE_EXISTS` | `attach-source` | `source/` に既存ファイルあり |
| `NO_PROJECT` | `attach-source` | `project.json` が見つからない |

---

## 13. MVP 範囲と実装状況

### 13.1 実装済み（v0.1.0）

| 機能 | 状況 |
|---|---|
| Tauri v2 + React TypeScript GUI | ✅ |
| サイドバーナビゲーション（7画面） | ✅ |
| プログレスバー（クリック可能8ステップ） | ✅ |
| ボトムログペイン | ✅ |
| プロジェクトヘッダー表示 | ✅ |
| Python CLI (Click) subprocess 実行 | ✅ |
| `healthcheck` コマンド | ✅ |
| `init-project` コマンド | ✅ |
| `validate-input` コマンド（PDF任意） | ✅ |
| `attach-source` コマンド（PDF任意） | ✅ |
| 3入力モード（docx_only/docx_with_pdf/docx_with_line_numbered_pdf） | ✅ |
| 既存プロジェクト開く（project.json 読み取り） | ✅ |
| UTF-8 エンコーディング対応 | ✅ |
| ホームパネル（ヘルスチェック、進捗サマリー） | ✅ |
| プロジェクトパネル（作成/開く/ファイル選択/検証/取り込み） | ✅ |
| 前処理パネル（6ステップ、ステータス表示） | ✅ |
| 文献確認パネル（タブ表示） | ✅ |
| 査読チェックパネル（評価者1/2/3） | ✅ |
| 結果パネル（出力ファイル表示） | ✅ |
| 設定パネル（LLMスロット設定、接続テスト） | ✅ |
| 全ボタン日本語ラベル | ✅ |
| ステータスチップ（未実行/実行中/完了/エラー） | ✅ |
| ステータスメッセージバナー（8秒自動消去） | ✅ |
| 無効ボタン理由表示 | ✅ |
| 次ステップ提案 | ✅ |
| 補足情報表示（段落数、文献数等） | ✅ |

### 13.2 未実装（将来フェーズ）

| 機能 | 優先度 |
|---|---|
| docx 本文抽出 (preprocess CLI) | 次フェーズ |
| 段落・文番号作成 CLI | 次フェーズ |
| セクション分割 CLI | 次フェーズ |
| 引用文献抽出 CLI | 次フェーズ |
| Crossref / PubMed 照合 CLI | 次フェーズ |
| 文献確認ビューアデータ生成 CLI | 次フェーズ |
| LLM チェック実行 CLI | 将来 |
| チェック項目内マージ CLI | 将来 |
| 最終マージ CLI | 将来 |
| 手入力モード | 将来 |
| APIキー暗号化保存 | 将来 |
| セキュアモード | 将来 |
| 全自動解析モード | 将来 |
| macOS 対応 | 将来 |

### 13.3 MVP で後回しにするもの

- Word COM による自動PDF化
- PDF原稿のみからの直接処理
- docxへのコメント埋め込み
- 投稿システム連携
- 査読フォーム自動入力
- チーム共有機能
- クラウド同期
- iThenticate / Turnitin 連携

---

## 14. 推奨プロジェクト構成

```text
peer-review-assistant/
  README.md
  SPEC.md
  LICENSE

  app/
    package.json
    src/
      main.tsx
      App.tsx
      App.css
      Sidebar.tsx
      ProgressBar.tsx
      panels/
        HomePanel.tsx
        ProjectPanel.tsx
        PreprocessPanel.tsx
        CitationReviewPanel.tsx
        ReviewChecksPanel.tsx
        ResultsPanel.tsx
        SettingsPanel.tsx
        LogPanel.tsx
    src-tauri/
      tauri.conf.json
      Cargo.toml
      src/

  python/
    peer_review_assistant/
      __init__.py
      cli.py
      project/
      preprocess/
      citations/
      llm/
      merge/
      output/
      utils/
    pyproject.toml

  docs/
    SPEC_CLI.md
    SPEC_PROJECT_STRUCTURE.md
    SPEC_PREPROCESS.md
    SPEC_CITATION_EXTRACTION.md
    SPEC_CITATION_DB.md
    SPEC_LLM.md

  e2e_test_project/
  examples/
  tests/
```

---

## 15. 開発ドキュメント構成

| ファイル | 対象 | 内容 |
|---|---|---|
| `README.md` | 全員 | 概要、インストール、使い方、注意事項、ライセンス |
| `SPEC.md`（本書） | 開発者 | 全体仕様、アーキテクチャ、全機能の概要 |
| `docs/SPEC_CLI.md` | 開発者 | Python CLI 全コマンド、JSON Lines プロトコル、エラーコード |
| `docs/SPEC_PROJECT_STRUCTURE.md` | 開発者 | リポジトリ構成、作業フォルダ構成、project.json/task_status.json スキーマ |
| `docs/SPEC_PREPROCESS.md` | 開発者 | docx/PDF 前処理の詳細アルゴリズム |
| `docs/SPEC_CITATION_EXTRACTION.md` | 開発者 | 引用文献抽出・本文中引用抽出の詳細 |
| `docs/SPEC_CITATION_DB.md` | 開発者 | 文献DB（PubMed/Crossref/Semantic Scholar/OpenAlex）照合の詳細 |
| `docs/SPEC_LLM.md` | 開発者 | LLM接続、プロンプト設計、マージ方針の詳細 |

### ドキュメント間の関係

```
SPEC.md ─── 全体地図、アーキテクチャ、全機能概要
  ├── docs/SPEC_CLI.md ─── CLI コマンド・プロトコル詳細
  ├── docs/SPEC_PROJECT_STRUCTURE.md ─── ファイル配置・スキーマ詳細
  ├── docs/SPEC_PREPROCESS.md ─── 前処理アルゴリズム詳細
  ├── docs/SPEC_CITATION_EXTRACTION.md ─── 引用抽出詳細
  ├── docs/SPEC_CITATION_DB.md ─── DB照合詳細
  └── docs/SPEC_LLM.md ─── LLM実行・マージ詳細
```

---

## 16. 設計上の重要リスク

1. **PDF行番号抽出は失敗しうる** → 信頼度閾値と段落・文番号フォールバックを用意
2. **Tauri-Python連携は subprocess + NDJSON** → ファイル監視やHTTPサーバー方式は採用しない
3. **LLM出力の矛盾は多数決で消さない** → conflict として保持し、査読者の判断に委ねる
4. **部分失敗時に処理を継続** → 失敗タスクだけ再実行可能、「完璧な全成功」を前提としない
5. **API Key は平文保存禁止** → OS資格情報ストアを使用
6. **セクション分割は見出しベース** → 不完全な場合は警告とフォールバックで処理継続
7. **原稿要約は独立ステップ** → 最終マージ前に実行
8. **Windows cp932 と UTF-8 の不一致** → `sys.stdout.reconfigure(encoding="utf-8")` で強制
