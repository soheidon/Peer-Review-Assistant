# Peer Review Assistant / 査読アシスタント

# 実装フェーズ別仕様書

## 0. この文書の位置づけ

本書は、`SPEC.md` で定義した全体仕様を、実装時点ごとの開発フローに分解した仕様書である。

目的は、開発を段階的に進めるために、各フェーズで以下を明確にすることである。

* その段階で実装する機能
* 入力と出力
* GUI上の操作
* Python CLI のコマンド
* 保存ファイル
* 完了条件
* その段階でまだ実装しないもの
* 次フェーズへの引き渡し

本書は、将来的に以下の個別仕様書へ分割する前提で作成する。

```text
SPEC_PROJECT_STRUCTURE.md  — 作成済み
SPEC_CLI.md                — 作成済み（Phase 1 実装反映済み）
SPEC_PREPROCESS.md
SPEC_GUI.md
SPEC_LLM.md
SPEC_CITATION_DB.md
SPEC_REVIEW_OUTPUT.md
SPEC_SECURITY.md
```

実装ログは `docs/implementation_logs/` に保存する。

---

# Phase 1. プロジェクト骨格作成

## 1.1 目的

Tauri + TypeScript + Python CLI の開発基盤を作る。まだ実際の原稿解析は行わず、GUI から Python CLI を呼び出し、作業フォルダを作成できるところまでを実装する。

## 1.2 実装対象

* リポジトリ構成
* Tauri アプリ初期化
* Python パッケージ初期化
* Python CLI エントリポイント
* GUI から Python CLI を subprocess として呼び出す仕組み
* JSON Lines による進捗通知の読み取り
* ログ保存
* 作業フォルダ作成
* release フォルダと作業フォルダの分離

## 1.3 推奨リポジトリ構成

リポジトリ内の `release/` は、配布用ファイルを置く専用フォルダとする。実際の解析で生成される作業フォルダ、文献情報JSON、LLM出力JSON、査読レポートなどは `release/` 以下に置かない。

```text
peer-review-assistant/
  SPEC.md
  README.md

  app/
    package.json
    src/
      main.tsx
      App.tsx
      components/
      pages/
      lib/
    src-tauri/
      tauri.conf.json
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
    SPEC_PROJECT_STRUCTURE.md
    SPEC_PREPROCESS.md
    SPEC_CLI.md
    SPEC_GUI.md
    SPEC_LLM.md
    SPEC_CITATION_DB.md
    SPEC_REVIEW_OUTPUT.md
    SPEC_SECURITY.md

  examples/
    sample_project/

  release/
    README_RELEASE.md
    uploads/
    builds/
    checksums/

  tests/
    python/
    app/
```

## 1.4 release フォルダの扱い

`release/` は、GitHub Release や手動配布時にアップロードする成果物の置き場とする。

```text
release/
  README_RELEASE.md
  uploads/
    PeerReviewAssistant-v0.1.0-windows-x64.zip
    PeerReviewAssistant-v0.1.0-installer.exe
  builds/
    win-x64/
  checksums/
    SHA256SUMS.txt
```

`release/` に置くもの：

```text
- インストーラ
- zip配布物
- Tauriビルド成果物
- Python sidecar 同梱済みバイナリ
- チェックサム
- リリースノート
```

`release/` に置かないもの：

```text
- project.json
- manuscript_full.json
- line_map.json
- paragraph_sentence_map.json
- references_split.json
- db_verified_references.json
- LLM出力JSON
- 査読結果Markdown
- 原稿docx / PDF
- APIキーや個人設定
- ユーザーの作業フォルダ
```

解析作業で生成されるファイルは、GUIでユーザーが指定した任意の作業フォルダに保存する。

推奨例：

```text
D:/PeerReviewProjects/project_001/
  project.json
  source/
  sections/
  citations/
  lines/
  outputs/
  status/
  logs/
```

したがって、開発中に実際の原稿で動作確認する場合も、生成ファイルは `release/` ではなく、GUIで選択したワークスペースに保存する。

## 1.5 Python CLI コマンド

この段階では、以下のコマンドのみ実装する。

```bash
pra-cli init-project --project <project_folder>
pra-cli healthcheck
```

## 1.6 `init-project` の仕様

### 入力

```bash
pra-cli init-project --project D:\pra_projects\sample001
```

### 出力

指定フォルダに以下を作成する。

```text
sample001/
  project.json
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
    task_status.json
  logs/
    preprocess.log
    llm_calls.log
    citation_db.log
    errors.log
```

## 1.7 `project.json` 初期スキーマ

```json
{
  "project_id": "sample001",
  "created_at": "2026-05-07T03:30:00+09:00",
  "updated_at": "2026-05-07T03:30:00+09:00",
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

## 1.8 `task_status.json` 初期スキーマ

```json
{
  "preprocess": "not_started",
  "citation_db": "not_started",
  "summary": "not_started",
  "checks": {
    "structure": {
      "llm01": "not_started",
      "llm02": "not_started",
      "llm03": "not_started",
      "manual": "not_used",
      "merged": "not_started"
    },
    "expression": {
      "llm01": "not_started",
      "llm02": "not_started",
      "llm03": "not_started",
      "manual": "not_used",
      "merged": "not_started"
    },
    "methods_stats": {
      "llm01": "not_started",
      "llm02": "not_started",
      "llm03": "not_started",
      "manual": "not_used",
      "merged": "not_started"
    },
    "citation": {
      "llm01": "not_started",
      "llm02": "not_started",
      "llm03": "not_started",
      "manual": "not_used",
      "merged": "not_started"
    },
    "originality": {
      "llm01": "not_started",
      "llm02": "not_started",
      "llm03": "not_started",
      "manual": "not_used",
      "merged": "not_started"
    }
  },
  "final_merge": "not_started"
}
```

## 1.9 GUI

最低限、以下の画面を作る。

```text
ホーム画面
  [新規プロジェクト作成]
  [既存プロジェクトを開く]
  [最近使った作業フォルダ]

新規プロジェクト作成画面
  作業フォルダ: [選択]
  ※ release フォルダ以下は選択不可、または警告表示
  [作成]

ログ表示欄
  Python CLI の stdout JSON Lines を表示
```

## 1.10 完了条件

* Tauri アプリが起動する
* GUI から `pra-cli healthcheck` を呼べる
* GUI から `pra-cli init-project` を呼べる
* 作業フォルダが仕様通り作成される
* `project.json` と `task_status.json` が作成される
* stdout JSON Lines を GUI が表示できる

## 1.11 この段階では実装しないもの

* docx解析
* PDF解析
* LLM呼び出し
* 文献DB照合
* 査読コメント生成

---

# Phase 2. docx/PDF 前処理

## 2.1 目的

docx 原稿と Word から保存した行番号付き PDF を読み込み、本文、段落、文、行番号、セクションを抽出する。

## 2.2 実装対象

* 任意名の docx/PDF を GUI で指定
* docx/PDF の入力検証（存在確認、拡張子、ファイルサイズ、SHA256）
* 検証済みファイルを work/source/ へ標準名でコピー
* `project.json` に元ファイルパスと作業コピー先パスの両方を記録
* docx ファイルの読み込み（source/manuscript.docx）
* PDF ファイルの読み込み（source/manuscript_line_numbered.pdf）
* docx本文抽出
* 段落番号付与
* 文番号付与
* PDF行番号抽出
* docx本文とPDF本文の一致率算出
* PDF行番号とdocx本文の対応づけ
* セクション分割
* 前処理レポート生成

## 2.3 入力ファイルの流れ

```text
1. ユーザーが original/ などから任意名の docx と PDF を GUI で選択
2. [入力ファイルをチェック] → validate-input で検証
3. OK なら [作業フォルダへ取り込み] → attach-source で work/source/ に標準名コピー
4. 取り込み完了後、前処理へ進む
```

### 2.3.1 work/source/ 既存ファイルの扱い（Phase 2 暫定）

`work/source/manuscript.docx` または `work/source/manuscript_line_numbered.pdf` が既に存在する場合、`attach-source` は `SOURCE_EXISTS` エラーで拒否する。上書きが必要な場合はユーザーが手動で削除する。

## 2.4 Python CLI コマンド

```bash
# ファイル検証のみ（コピーしない）
pra-cli validate-input --docx <file.docx> --pdf <file.pdf>

# 検証＋コピー＋project.json 更新
pra-cli attach-source \
  --project <project_folder> \
  --docx <file.docx> \
  --pdf <file.pdf>

# 前処理実行
pra-cli preprocess \
  --project <project_folder>
```

## 2.5 GUI

```text
前処理画面

原稿 docx:
[任意のパスを選択]

Wordから保存した行番号付きPDF:
[任意のパスを選択]

[入力ファイルをチェック]

チェック結果:
□ docx 存在確認
□ PDF 存在確認
□ 拡張子 (.docx / .pdf)
□ ファイルサイズ > 0
□ SHA256 計算

[作業フォルダへ取り込み]  ← チェックOK時のみ有効

取り込み後:
□ work/source/manuscript.docx
□ work/source/manuscript_line_numbered.pdf

[前処理を実行]

推奨設定:
- 1段組み
- 標準余白
- Wordから直接保存したPDF
- 行番号あり

前処理結果:
□ docx本文抽出
□ PDF行番号抽出
□ 段落・文番号作成
□ セクション分割
□ docx/PDF一致率
□ 行番号対応信頼度
```

## 2.5 出力ファイル

```text
source/
  manuscript.docx
  manuscript_line_numbered.pdf

manuscript_full.txt
manuscript_full.json

lines/
  pdf_line_text.json
  paragraph_sentence_map.json
  line_map.json
  line_numbered_text.txt
  alignment_report.json

sections/
  abstract.txt
  introduction.txt
  aim_objective.txt
  methods.txt
  results.txt
  discussion.txt
  conclusion.txt
  references.txt
  tables.txt
  figure_captions.txt
```

## 2.6 `paragraph_sentence_map.json` スキーマ

```json
{
  "items": [
    {
      "section": "Methods",
      "paragraph_id": 12,
      "sentence_id": 1,
      "text": "Participants were recruited from two child welfare facilities."
    },
    {
      "section": "Methods",
      "paragraph_id": 12,
      "sentence_id": 2,
      "text": "The intervention consisted of ten online music lessons."
    }
  ]
}
```

## 2.7 `line_map.json` スキーマ

```json
{
  "source": "word_pdf_manual_export",
  "line_number_source": "pdf_extraction",
  "docx_pdf_match_ratio": 0.94,
  "line_detection_rate": 0.86,
  "line_alignment_confidence": 0.88,
  "location_mode": "line_with_paragraph_fallback",
  "items": [
    {
      "page": 2,
      "line_number": 42,
      "text": "Previous studies have suggested that...",
      "section": "Introduction",
      "paragraph_id": 8,
      "sentence_ids": [14]
    }
  ]
}
```

## 2.8 PDF行番号抽出の閾値

```text
docx_pdf_match_ratio < 0.85
  → 警告。ユーザー確認を求める。

line_detection_rate < 0.70
  → Word行番号取得失敗として扱う。

line_alignment_confidence < 0.80
  → 行番号主表示を無効化し、段落・文番号を主表示にする。

line_alignment_confidence >= 0.80 かつ < 0.90
  → 行番号と段落・文番号を併記する。

line_alignment_confidence >= 0.90
  → 行番号を主表示する。
```

## 2.9 セクション分割

MVPでは見出しベースで分割する。

対応見出し例：

```text
Abstract
Introduction
Background
Aim
Aims
Objective
Objectives
Methods
Materials and Methods
Results
Discussion
Conclusion
References
```

Aim / Objective が独立していない場合：

```text
- Introduction 内の目的文候補を aim_objective.txt にコピー
- Methods 冒頭の目的文候補を aim_objective.txt にコピー
- 抽出できない場合は warning とする
```

## 2.10 完了条件

* docx と PDF が source にコピーされる
* `manuscript_full.txt` が生成される
* `paragraph_sentence_map.json` が生成される
* `line_map.json` が生成される、またはフォールバック状態が記録される
* `sections/` に主要ファイルが生成される
* `project.json` の preprocess が更新される
* `task_status.json` の preprocess が `done` または `partial` になる

## 2.11 この段階では実装しないもの

* LLMによるセクション補正
* 手動セクション編集画面
* PDFのみからの原稿処理

---

# Phase 3. 引用文献・本文中引用抽出

## 3.1 目的

前処理済み原稿から References を1件ずつ分割し、本文中引用との対応候補を作成する。

## 3.2 実装対象

* References セクションの分割
* 引用番号形式・著者年形式の暫定対応
* 本文中引用候補の抽出
* 本文中引用の前後文脈取得
* reference_id の付与
* citation_contexts.json の作成

## 3.3 Python CLI コマンド

```bash
pra-cli extract-citations --project <project_folder>
```

## 3.4 出力ファイル

```text
citations/
  references_split.json
  in_text_citations.json
  citation_contexts.json
```

## 3.5 `references_split.json` スキーマ

```json
{
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

## 3.6 `citation_contexts.json` スキーマ

```json
{
  "items": [
    {
      "reference_id": "R001",
      "in_text_citations": [
        {
          "section": "Introduction",
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

## 3.7 完了条件

* References が1件ずつ分割される
* 本文中引用候補が抽出される
* reference_id が付与される
* `citation_contexts.json` が作成される
* 不確実な対応には `parse_confidence` または warning が付与される

## 3.8 この段階では実装しないもの

* 文献DB照合
* LLMによる引用妥当性評価
* 孫引き検出

---

# Phase 4. 文献DB照合

## 4.1 目的

References の各文献について、PubMed、Semantic Scholar、Crossref、OpenAlex を使い、実在性と書誌情報の正確性を確認する。

## 4.2 実装対象

* PubMed 検索
* Crossref 検索
* Semantic Scholar 検索
* OpenAlex 検索
* DOI / PMID / タイトル / 著者 / 年による照合
* 抄録取得
* 論文タイプ取得
* 未一致文献の記録
* DB照合ログ
* Rate Limit 対策
* リトライ

## 4.3 Python CLI コマンド

```bash
pra-cli citation-db --project <project_folder>
```

## 4.4 GUI

```text
文献DB前処理

作業フォルダ:
[選択]

使用DB:
☑ PubMed
☑ Crossref
☑ Semantic Scholar
☑ OpenAlex

[文献DB照合を実行]

結果:
総文献数: 32
照合成功: 28
部分一致: 3
未照合: 1
```

## 4.5 出力ファイル

```text
citations/
  db_verified_references.json
  db_unmatched_references.json
  db_search_log.json

logs/
  citation_db.log
```

## 4.6 `db_verified_references.json` スキーマ

```json
{
  "items": [
    {
      "reference_id": "R001",
      "db_verification": {
        "exists": true,
        "sources": ["PubMed", "Crossref", "Semantic Scholar"],
        "matched_by": "doi",
        "doi": "10.xxxx/xxxxx",
        "pmid": "12345678",
        "title_match": "exact",
        "authors_match": "partial",
        "year_match": true,
        "journal_match": true,
        "metadata_errors": []
      },
      "db_content": {
        "title": "Online music intervention for children with anxiety",
        "abstract": "...",
        "publication_type": "randomized controlled trial",
        "journal": "Journal Name",
        "year": 2021,
        "authors": ["Smith J", "Brown K"],
        "main_fields": ["music intervention", "children", "anxiety"]
      }
    }
  ]
}
```

## 4.7 エラー処理

* API失敗時は最大3回リトライ
* リトライ間隔は指数バックオフ
* 1つのDBが失敗しても他のDBで処理継続
* 未照合文献は `db_unmatched_references.json` に記録

## 4.8 完了条件

* 各文献に照合結果が付与される
* 成功・部分一致・未照合が区別される
* DBごとの失敗がログに残る
* `task_status.json` の citation_db が `done` または `partial` になる

## 4.9 この段階では実装しないもの

* 本文中での引用の使われ方の妥当性評価
* Deep Research による不足文献探索

---

# Phase 5. API設定・LLM接続

## 5.1 目的

LLM Provider、Model、Base URL、API Key を設定し、GUIから接続テストできるようにする。

## 5.2 実装対象

* LLMスロット設定
* Provider自由入力
* Base URL入力
* Model入力
* API Key入力
* 個別接続テスト
* すべて接続テスト
* 文献DB API設定
* API Keyの安全な保存

## 5.3 LLMスロット

```text
まとめLLM
解析者1
解析者2
解析者3
```

## 5.4 GUI

```text
API設定

まとめLLM
表示名: [          ]
Provider: [OpenAI-Compatible ▼] または [自由入力]
Base URL: [          ]
Model: [          ]
API Key: [********]
[接続テスト]

解析者1
...

解析者2
...

解析者3
...

文献DB
PubMed Email: [          ]
Semantic Scholar API Key: [********]
Crossref Mailto: [          ]

[すべて接続テスト]
[保存]
```

## 5.5 Python CLI コマンド

```bash
pra-cli test-llm --slot reviewer1
pra-cli test-db --db pubmed
```

## 5.6 API Key 保存方針

* 平文設定ファイルには保存しない
* Windows Credential Manager / DPAPI を優先
* Python CLI には環境変数で渡す
* 一時ファイルを使う場合は処理終了後に削除する

## 5.7 MVPで実装するもの

* 個別接続テスト
* すべて接続テスト
* 接続結果表示
* API Keyの安全保存

## 5.8 MVP+ に回すもの

* 7日間接続確認キャッシュ
* OK履歴クリア
* 接続履歴一覧

## 5.9 完了条件

* GUIから各LLMの接続テストができる
* GUIから文献DBの接続テストができる
* API Keyが平文で保存されない
* 接続失敗時にエラー内容が表示される

---

# Phase 6. LLM個別チェック実行

## 6.1 目的

構成、表現、方法・統計、引用、類似性・新規性について、LLM01〜03または手入力で個別チェックを実行できるようにする。

## 6.2 実装対象

* プロンプト生成
* LLM実行
* 結果JSON保存
* 手入力プロンプト生成
* 手入力結果取り込み
* ステータス更新
* エラー処理

## 6.3 Python CLI コマンド

```bash
pra-cli run-check --project <project_folder> --check structure --slot llm01
pra-cli run-check --project <project_folder> --check expression --slot llm01
pra-cli run-check --project <project_folder> --check methods_stats --slot llm01
pra-cli run-check --project <project_folder> --check citation --slot llm01
pra-cli run-check --project <project_folder> --check originality --slot llm01
```

手入力用プロンプト生成：

```bash
pra-cli make-manual-prompt --project <project_folder> --check structure
```

手入力結果取り込み：

```bash
pra-cli import-manual-result --project <project_folder> --check structure --file <manual_result.json>
```

## 6.4 チェック項目

### 構成チェック

* IMRaD構成
* Abstractと本文の整合性
* Aim / Objective
* MethodsとResultsの対応
* Discussionの過剰解釈

### 表現チェック

* 英語としておかしい箇所
* 文法、冠詞、前置詞
* 学術英語として不自然な表現
* 曖昧表現
* 過剰主張

### 方法・統計チェック

* 研究デザイン
* 対象者
* 介入
* 評価尺度
* 統計解析
* 欠測値
* 効果量
* 倫理審査

### 引用文献チェック

* 本文での引用の使われ方
* 文献DB情報との整合性
* 引用が主張を支持するか

### 類似性・新規性チェック

* 類似研究
* 重要文献不足
* 既存研究との差分
* 新規性の妥当性

## 6.5 出力ファイル

```text
outputs/structure/llm01.raw.json
outputs/structure/llm02.raw.json
outputs/structure/llm03.raw.json
outputs/structure/manual.raw.json
```

他チェック項目も同様。

## 6.6 `llm01.raw.json` 基本スキーマ

```json
{
  "check_name": "structure",
  "source": "llm01",
  "status": "done",
  "generated_at": "2026-05-07T03:50:00+09:00",
  "model": "example-model",
  "summary": "The manuscript is generally structured as an IMRaD article, but the aim and discussion are not fully aligned.",
  "findings": [
    {
      "finding_id": "structure_llm01_001",
      "severity": "major",
      "category": "Structure",
      "location": {
        "preferred": "line",
        "section": "Introduction",
        "line_start": 45,
        "line_end": 72,
        "paragraph_start": 5,
        "text_excerpt": "..."
      },
      "issue": "The research gap is not clearly articulated.",
      "suggested_comment": "Lines 45–72: Please clarify the specific research gap addressed by this study.",
      "confidence": "medium"
    }
  ]
}
```

## 6.7 完了条件

* 各チェックで LLM01 を実行できる
* 必要に応じて LLM02 / LLM03 を実行できる
* 手入力プロンプトを生成できる
* 手入力結果を取り込める
* raw JSON が保存される
* status が更新される

---

# Phase 7. 各チェック項目内マージ

## 7.1 目的

LLM01、LLM02、LLM03、手入力結果をチェック項目ごとに統合し、査読コメント候補を作成する。

## 7.2 Python CLI コマンド

```bash
pra-cli merge-section --project <project_folder> --check structure
pra-cli merge-section --project <project_folder> --check expression
pra-cli merge-section --project <project_folder> --check methods_stats
pra-cli merge-section --project <project_folder> --check citation
pra-cli merge-section --project <project_folder> --check originality
```

## 7.3 マージ方針

* 多数決ではなく、根拠と一致度で統合する
* 複数LLMが同じ問題を指摘した場合は信頼度を高くする
* 1つのLLMのみの指摘でも根拠が明確なら採用候補とする
* 矛盾は削除せず `conflict` として保持する
* 不確実な指摘は断定しない表現にする

## 7.4 出力ファイル

```text
outputs/structure/merged.section.json
outputs/structure/merged.section.md
```

他チェック項目も同様。

## 7.5 `merged.section.json` スキーマ

```json
{
  "check_name": "methods_stats",
  "status": "done",
  "generated_at": "2026-05-07T03:40:00+09:00",
  "sources": [
    {"source": "llm01", "status": "done"},
    {"source": "llm02", "status": "failed", "error": "timeout"},
    {"source": "manual", "status": "not_used"}
  ],
  "summary": "The main methodological concerns relate to intervention fidelity and insufficient reporting of missing data.",
  "comments": [
    {
      "comment_id": "methods_stats_001",
      "severity": "major",
      "category": "Methods",
      "location": {
        "preferred": "line",
        "section": "Methods",
        "line_start": 128,
        "line_end": 131,
        "paragraph_start": 12,
        "sentence_start": 2,
        "text_excerpt": "The intervention consisted of..."
      },
      "issue": "The intervention description lacks sufficient detail.",
      "evidence": "LLM01 and LLM03 both noted insufficient information about intervention delivery and fidelity.",
      "suggested_author_comment": "Lines 128–131: Please clarify who delivered the intervention, whether a manual or protocol was used, and how intervention fidelity was assessed.",
      "reviewer_note": "This should likely be treated as a major comment because it affects reproducibility.",
      "confidence": "high",
      "conflict": false
    }
  ],
  "conflicts": []
}
```

## 7.6 完了条件

* raw JSON を統合できる
* `merged.section.json` が生成される
* `merged.section.md` が生成される
* 矛盾がある場合は conflicts に記録される
* status が更新される

---

# Phase 8. 原稿要約生成

## 8.1 目的

最終査読コメントの Brief Summary に使う原稿要約を作成する。

## 8.2 Python CLI コマンド

```bash
pra-cli summarize-manuscript --project <project_folder>
```

## 8.3 入力

* `sections/abstract.txt`
* `sections/introduction.txt`
* `sections/methods.txt`
* `sections/results.txt`
* `sections/discussion.txt`
* `manuscript_full.json`

## 8.4 出力

```text
outputs/final/manuscript_summary.json
outputs/final/manuscript_summary.md
```

## 8.5 方針

MVPでは、Abstract がある場合は Abstract を初期要約として使用する。まとめLLMが設定されている場合は、Abstractをもとに2〜5文の査読用要約へ整形する。

## 8.6 完了条件

* `manuscript_summary.md` が生成される
* `final_review.md` に転用できる形式になっている

---

# Phase 9. 最終マージ・査読コメント生成

## 9.1 目的

各チェック項目内マージ結果を統合し、最終的な査読意見を Markdown で出力する。

## 9.2 Python CLI コマンド

```bash
pra-cli final-merge --project <project_folder>
```

## 9.3 入力

```text
outputs/structure/merged.section.json
outputs/expression/merged.section.json
outputs/methods_stats/merged.section.json
outputs/citation/merged.section.json
outputs/originality/merged.section.json
outputs/final/manuscript_summary.json
lines/line_map.json
lines/paragraph_sentence_map.json
```

## 9.4 出力

```text
outputs/final/final_review.md
outputs/final/comments_to_authors.md
outputs/final/confidential_comments_to_editor.md
outputs/final/recommendation.md
outputs/final/citation_report.md
outputs/final/originality_report.md
outputs/final/audit_trail.json
```

## 9.5 `final_review.md` 形式

```markdown
# Peer Review

## 1. Brief Summary

## 2. General Assessment

## 3. Major Comments

## 4. Minor Comments

## 5. Citation and Literature Concerns

## 6. Originality and Overlap

## 7. Confidential Comments to the Editor

## 8. Recommendation
```

## 9.6 Location 表示

行番号が信頼できる場合：

```markdown
**[Category: Methods / Lines 128–131]**
```

段落・文番号にフォールバックする場合：

```markdown
**[Category: Methods / Paragraph 12, Sentence 2]**
```

両方表示する場合：

```markdown
**[Category: Methods / Lines 128–131; Paragraph 12, Sentences 2–4]**
```

## 9.7 完了条件

* `final_review.md` が生成される
* 著者向けコメントと編集者向けコメントが分離される
* 推奨判定の下書きが生成される
* audit trail が生成される
* GUIでMarkdown表示できる

---

# Phase 10. GUI統合・個別処理モード完成

## 10.1 目的

各Python CLI処理をGUIから個別に実行できるようにし、ステータス表示、結果表示、再実行を可能にする。

## 10.2 実装対象

* 前処理画面
* 作業フォルダ読み込み画面
* API設定画面
* 文献DB前処理画面
* 各チェック画面
* セクション内マージ画面
* 最終マージ画面
* 結果表示画面
* ログ画面
* 再実行ボタン

## 10.3 GUIの基本ルール

* 前処理未完了なら各チェック画面は実行不可
* citation_contexts.json がなければ引用チェックは実行不可
* db_verified_references.json がなければ引用妥当性評価では警告表示
* raw JSON がなければセクション内マージは実行不可
* merged.section.json がなければ最終マージでは警告表示
* 失敗タスクは個別再実行可能

## 10.4 完了条件

* GUIから全フェーズを個別に実行できる
* status が画面に反映される
* エラーが表示される
* 成功済み処理を再利用できる
* 失敗処理のみ再実行できる

---

# Phase 11. 全自動解析モード

## 11.1 目的

個別処理モードで安定した処理を、まとめて一括実行できるようにする。

## 11.2 実装対象

```text
[全自動解析開始]
```

処理順：

```text
1. 前処理確認
2. 引用抽出確認
3. 文献DB照合
4. 原稿要約
5. 構成チェック
6. 表現チェック
7. 方法・統計チェック
8. 引用文献チェック
9. 類似性・新規性チェック
10. 各チェック項目内マージ
11. 最終マージ
```

## 11.3 方針

* 手入力処理は全自動モードでは使わない
* 有効な LLM01〜03 を使用する
* 失敗した処理は failed として記録する
* 可能な範囲で後続処理を継続する
* 最終マージは成功したチェック項目だけでも実行可能

## 11.4 完了条件

* 一括処理が可能
* 部分失敗時にもログが残る
* 成功済み結果で最終レポートを作成できる

---

# Phase 12. セキュリティ・配布前整備

## 12.1 目的

MVP配布前に、APIキー管理、守秘義務注意、ログ、エラー処理、Python sidecar 配布を整備する。

## 12.2 実装対象

* API Key 平文保存禁止
* Windows Credential Manager / DPAPI 対応
* セキュアモード表示
* 外部API送信警告
* ログからAPI Keyを除外
* Python CLI の standalone exe 化
* Tauri sidecar 同梱
* エラー時の安全停止

## 12.3 GUI表示文

```text
本ツールは査読者の判断を代替しません。
査読対象原稿を外部 API へ送信する場合は、当該ジャーナル・出版社・編集部・所属機関の AI 利用ポリシーに従ってください。
外部 API に送信したデータが、プロバイダーの学習・品質改善・ログ保存に利用されない設定であることを確認してください。
機密性の高い原稿については、ローカル LLM または所属機関が許可した閉域環境での利用を推奨します。
```

## 12.4 完了条件

* API Key が平文保存されない
* ログに秘密情報が残らない
* Python CLI が sidecar として同梱できる
* 初回起動から前処理・解析・出力まで実行できる

---

# Phase 13. MVP完成判定

## 13.1 MVP完成条件

以下を満たした時点で MVP 完成とする。

```text
1. Tauri GUI が起動する
2. Python CLI を sidecar または subprocess で呼べる
3. docx + PDF を入力して前処理できる
4. 段落番号・文番号が作成される
5. PDF行番号抽出に成功またはフォールバックできる
6. References を分割できる
7. 文献DB照合ができる
8. LLM設定と接続テストができる
9. 構成チェックができる
10. 表現チェックができる
11. 方法・統計チェックができる
12. 引用文献チェックができる
13. 類似性・新規性チェックができる
14. 手入力結果を取り込める
15. 各チェック項目内マージができる
16. 最終マージができる
17. final_review.md が生成される
18. comments_to_authors.md が生成される
19. confidential_comments_to_editor.md が生成される
20. recommendation.md が生成される
21. 失敗タスクだけ再実行できる
22. API Key が平文保存されない
23. ログが保存される
24. GUIで結果を確認できる
25. releaseフォルダには配布物のみを置き、解析生成物が保存されない
```

---

# Phase 14. MVP後の拡張候補

MVP後に検討する機能は以下である。

```text
- Word COM による自動PDF化
- PDF原稿のみからの直接処理
- docxへのコメント埋め込み
- 手動セクション編集画面
- 行番号抽出精度の改善
- OCR対応
- iThenticate / Turnitin 連携
- 査読フォーム自動入力
- 7日間接続確認キャッシュ
- ローカルLLMプリセット
- Ollama / LM Studio 接続支援
- macOS対応
- 複数プロジェクト管理
- チーム共有
```

---

# 付録A. 開発時の作業フォルダ運用

開発中に実際の現バージョンを触って検証する場合、GUIで作業フォルダを明示的に指定する。

例：

```text
D:/PeerReviewAssistantDev/workspaces/test001/
D:/PeerReviewAssistantDev/workspaces/sample_manuscript_202605/
```

このフォルダに、前処理結果、文献DB照合結果、LLM出力、査読Markdownを保存する。

```text
workspaces/test001/
  project.json
  source/
  sections/
  citations/
  lines/
  outputs/
  status/
  logs/
```

`release/` はリリースアップロード用であり、開発中の生成物、実原稿、文献JSON、LLM出力を置かない。

GUI側では、作業フォルダ選択時に以下を行う。

```text
- release/ 以下が選ばれた場合は警告する
- 可能であれば release/ 以下を選択不可にする
- 作業フォルダは project.json を含むフォルダとして認識する
- 最近使った作業フォルダを記録する
```

最近使った作業フォルダの履歴は、アプリ設定に保存する。ただし、原稿本文や解析結果は履歴に含めない。

---

# 付録B. 実装順序の推奨

推奨実装順序は以下とする。

```text
1. Phase 1: プロジェクト骨格作成
2. Phase 2: docx/PDF 前処理
3. Phase 3: 引用文献・本文中引用抽出
4. Phase 4: 文献DB照合
5. Phase 5: API設定・LLM接続
6. Phase 6: LLM個別チェック実行
7. Phase 7: 各チェック項目内マージ
8. Phase 8: 原稿要約生成
9. Phase 9: 最終マージ・査読コメント生成
10. Phase 10: GUI統合・個別処理モード完成
11. Phase 11: 全自動解析モード
12. Phase 12: セキュリティ・配布前整備
13. Phase 13: MVP完成判定
```

この順序により、前処理、文献DB、LLM、マージ、GUI統合を段階的に検証できる。

---

# 付録C. 詳細仕様書への分割予定

本書をもとに、次の順で詳細仕様書を作成する。

```text
1. SPEC_PROJECT_STRUCTURE.md
2. SPEC_PREPROCESS.md
3. SPEC_CLI.md
4. SPEC_GUI.md
5. SPEC_LLM.md
6. SPEC_CITATION_DB.md
7. SPEC_REVIEW_OUTPUT.md
8. SPEC_SECURITY.md
```

各詳細仕様書では、本書の各 Phase に対応する処理を、実装可能な単位まで細分化する。
