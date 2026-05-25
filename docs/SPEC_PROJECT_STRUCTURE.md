# SPEC_PROJECT_STRUCTURE.md

# リポジトリ構成・作業フォルダ構成 詳細仕様

## 0. この文書の位置づけ

本書は、`SPEC.md` のセクション6および20で定義されたプロジェクト構成を詳細化した仕様書である。リポジトリ内のファイル配置、作業フォルダの構造、設定ファイルのスキーマを定義する。

---

## 1. リポジトリ構成

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
        __init__.py
        final.py
        txt_writer.py
        docx_writer.py
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
    python/
    app/
```

### 1.1 各ディレクトリの役割

| ディレクトリ | 役割 |
|---|---|
| `app/` | Tauri + TypeScript による GUI アプリケーション |
| `python/` | Python CLI による処理エンジン |
| `docs/` | 機能別詳細仕様書 |
| `examples/` | サンプルプロジェクト（動作確認用） |
| `release/` | 配布用成果物（インストーラ、zip、チェックサム） |
| `tests/` | テストコード |

---

## 2. release フォルダ

`release/` は、GitHub Release や手動配布時にアップロードする成果物の置き場である。

### 2.1 構成

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

### 2.2 release/ に置くもの

- インストーラ
- zip配布物
- Tauriビルド成果物
- Python sidecar 同梱済みバイナリ
- チェックサム
- リリースノート

### 2.3 release/ に置かないもの

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

解析作業で生成されるファイルは、GUIでユーザーが指定した任意の作業フォルダに保存する。

---

## 3. ユーザー査読案件フォルダ構成（推奨運用例）

ユーザーは、1つの査読案件につき1つの案件フォルダを作成する。このフォルダの配下に `original/`、`work/`、`final/` の3領域を置くことを推奨する。

```text
D:\GoogleDrive\Documents\Paper\査読\2025-05-07-Scientific Reports\
  original/
    受け取った原本をそのまま保存する場所
    received_manuscript.docx
    received_manuscript_line_numbered.pdf
    reviewer_instructions.pdf
    journal_email.txt

  work/
    Peer Review Assistant の作業フォルダ
    project.json
    source/
      manuscript.docx                         ← アプリがコピーした標準名ファイル
      manuscript_line_numbered.pdf            ← アプリがコピーした標準名ファイル
    sections/
    citations/
    lines/
    outputs/
    status/
    logs/

  final/
    最終的に投稿・提出した査読コメントを保存する場所
    review_submitted.md
    comments_to_authors.md
    confidential_comments_to_editor.md
```

### 3.1 各領域の役割

| 領域 | 作成者 | 役割 |
|---|---|---|
| `original/` | ユーザー（手動） | 受け取った原本をそのまま保管。アプリは読み取りのみ行う |
| `work/` | アプリ（`init-project`） | アプリが処理に使う作業フォルダ。`project.json` をルートに持つ |
| `work/source/` | アプリ（`attach-source`） | アプリが原本からコピーした標準名ファイルを置く場所 |
| `final/` | ユーザー（手動） | 提出済みの査読コメントを保存。アプリは関与しない |

### 3.2 original/ と work/source/ の違い

- `original/` は**人間が原本を保管する場所**。ファイル名は任意。アプリはここに書き込まない。
- `work/source/` は**アプリが処理用にコピーしたファイルを置く場所**。ファイル名は `manuscript.docx` と `manuscript_line_numbered.pdf` に固定。
- 原本をそのまま残すことで、誤操作や上書きから保護する。

---

## 4. 作業フォルダ構成

作業フォルダはリポジトリ外にユーザーが任意の場所を指定する。

推奨パス例：

```text
D:/PeerReviewProjects/project_001/
```

### 4.1 作業フォルダのディレクトリ構造

前処理後、作業フォルダには以下のファイル群が作成される。

```text
project_folder/
  project.json
  manuscript_full.txt
  manuscript_full.json

  source/
    manuscript.docx
    manuscript_line_numbered.pdf

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

  citations/
    in_text_citations.json
    references_split.json
    citation_contexts.json
    db_verified_references.json
    db_unmatched_references.json
    db_search_log.json

  lines/
    pdf_line_text.json
    line_map.json
    line_numbered_text.txt
    paragraph_sentence_map.json
    alignment_report.json

  prompts/
    structure_check_prompt.txt
    expression_check_prompt.txt
    methods_stats_check_prompt.txt
    citation_check_prompt.txt
    originality_check_prompt.txt
    final_merge_prompt.txt

  outputs/
    structure/
    expression/
    methods_stats/
    citation/
    originality/
    final/
      _data/
        final_review.md
        comments_to_authors.md
        confidential_comments_to_editor.md
        recommendation.md
        citation_report.md
        originality_report.md
        audit_trail.json
      final_review.md
      final_review.docx
      final_review.txt
      final_review_jp.md
      final_review_jp.docx
      final_review_jp.txt

  status/
    task_status.json

  logs/
    preprocess.log
    llm_calls.log
    citation_db.log
    errors.log
```

### 4.2 作業フォルダと release/ の分離

GUI側では、作業フォルダ選択時に以下を行う。

- `release/` 以下が選ばれた場合は警告する
- 可能であれば `release/` 以下を選択不可にする
- 作業フォルダは `project.json` を含むフォルダとして認識する
- 最近使った作業フォルダを記録する（原稿本文や解析結果は履歴に含めない）

---

## 5. project.json

`project.json` は作業フォルダ全体のメタ情報を保持する中心ファイルである。API Key などの秘密情報は保存しない。

### 5.1 初期スキーマ

```json
{
  "project_id": "sample001",
  "created_at": "2026-05-07T03:30:00+09:00",
  "updated_at": "2026-05-07T03:30:00+09:00",
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

### 5.2 attach-source 完了後のスキーマ例

```json
{
  "project_id": "20260507_033000_sample",
  "created_at": "2026-05-07T03:30:00+09:00",
  "updated_at": "2026-05-07T03:35:00+09:00",
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
  },
  "manuscript": {
    "title": null,
    "language": "en",
    "article_type": "original_article",
    "journal": null
  },
  "preprocess": {
    "status": "done",
    "docx_pdf_match_ratio": 0.942,
    "line_extraction_status": "partial",
    "line_alignment_confidence": 0.88,
    "location_mode": "line_with_paragraph_fallback"
  },
  "settings": {
    "location_display": "both",
    "secure_mode": false
  }
}
```

`source_mode` は以下のいずれか:

| 値 | 条件 |
|---|---|
| `docx_only` | PDF が指定されなかった（`pdf_path` は `null`） |
| `docx_with_pdf` | PDF が指定されたが行番号抽出は未実行 |
| `docx_with_line_numbered_pdf` | 行番号抽出に成功（将来実装） |

`line_numbers_available` は PDF からの行番号抽出が成功した場合に `true` となる。

---

## 6. task_status.json

`task_status.json` は全処理のステータスを一元管理するファイルである。

### 6.1 ステータス値

```text
not_started  — 未着手
in_progress  — 実行中
done         — 正常完了
partial      — 一部成功（フォールバック）
failed       — 失敗
not_used     — 不使用（手入力未使用など）
```

### 6.2 初期スキーマ

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

---

## 7. GUI による作業フォルダ選択の制約

### 7.1 選択不可条件

- `release/` 以下のパスは選択不可または警告表示
- 既存の作業フォルダを開く場合は `project.json` の存在を確認する

### 7.2 最近使った作業フォルダ

- アプリ設定にパスのみを記録する
- 原稿本文や解析結果は履歴に含めない
- 最大10件まで保持する
