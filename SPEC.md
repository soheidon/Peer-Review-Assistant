# SPEC.md

# Peer Review Assistant / 査読アシスタント 全体仕様書

## 0. この仕様書の位置づけ

本仕様書は、**Peer Review Assistant / 査読アシスタント** の全体仕様を定義する `SPEC.md` である。

本ツールは、学術雑誌の査読者が受け取った原稿を読み、査読コメントを作成する作業を支援するデスクトップアプリケーションである。docx 原稿と、Word から手作業で出力した行番号付き PDF を入力し、原稿本文、セクション、行番号、段落番号、文番号、引用文献、本文中引用を前処理したうえで、複数 LLM、文献データベース、手入力結果を統合し、査読意見を Markdown 形式で出力する。

実装は以下を前提とする。

```text
GUI: Tauri + TypeScript
処理エンジン: Python CLI
対象OS: Windows 11 を主対象とする
入力原稿: docx + Wordから保存した行番号付きPDF
出力: Markdown / JSON / 作業フォルダ
```

今後、以下のようにドキュメントを構成する。全体仕様は `SPEC.md`、実装順序は `IMPLEMENTATION_PLAN.md`、機能別詳細仕様は `docs/` に配置する。

```text
SPEC.md                         全体仕様書
IMPLEMENTATION_PLAN.md          実装フェーズ別仕様書
docs/SPEC_PREPROCESS.md         docx/PDF前処理仕様
docs/SPEC_GUI.md                Tauri GUI仕様
docs/SPEC_CLI.md                Python CLI仕様
docs/SPEC_LLM.md                LLM接続・実行仕様
docs/SPEC_CITATION_DB.md        文献DB照合仕様
docs/SPEC_REVIEW_OUTPUT.md      査読コメント出力仕様
docs/SPEC_SECURITY.md           セキュリティ・守秘義務仕様
docs/SPEC_PROJECT_STRUCTURE.md  ディレクトリ・ファイル構成仕様
```

本ファイルでは、全体構成、処理フロー、主要画面、保存ファイル、処理単位、MVP範囲を定義する。

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

## 2. 開発方針

### 2.1 採用技術

本プロジェクトでは、以下の構成を採用する。

```text
Tauri + TypeScript + Python CLI
```

### 2.2 Tauri + TypeScript の役割

Tauri / TypeScript 側は、主に GUI と状態管理を担当する。

担当範囲：

* 画面表示
* ファイル選択
* フォルダ選択
* 作業フォルダ読み込み
* API設定画面
* 接続テストボタン
* 各処理ボタン
* 手入力欄
* 進捗表示
* 完了ステータス表示
* Markdown結果表示
* Python CLI の呼び出し
* 処理ログ表示
* 設定ファイルの読み書き

### 2.3 Python CLI の役割

Python 側は、実際の解析処理を担当する。

担当範囲：

* docx 本文抽出
* PDF から行番号付きテキスト抽出
* docx本文とPDF行番号の対応づけ
* 段落番号・文番号作成
* セクション分割
* References 抽出
* 本文中引用抽出
* 文献DB API照合
* LLM API呼び出し
* 手入力結果の取り込み
* 各チェック項目のJSON生成
* 各チェック項目内マージ
* 最終マージ
* Markdown査読コメント生成

### 2.4 Tauri と Python CLI の連携方針

Tauri から Python 処理エンジンを呼び出す方式は、MVPでは **subprocess 実行 + JSONファイル連携 + 標準出力による進捗通知** を基本とする。

MVPではローカルHTTPサーバー方式は採用しない。理由は、ポート管理、常駐プロセス管理、セキュリティ設定が増えるためである。

基本方針：

```text
Tauri GUI
↓
Python CLI を subprocess / sidecar として起動
↓
入力は project_folder と command name で渡す
↓
処理結果は project_folder 内の JSON / Markdown に保存
↓
進捗とエラーは stdout の JSON Lines と log ファイルに出力
↓
Tauri が status/task_status.json と stdout を監視して画面更新
```

Python環境の配布方針は、MVP段階では以下の2段階で考える。

```text
開発段階：
  ユーザーまたは開発者の Python 仮想環境を利用する。

配布段階：
  PyInstaller 等で Python CLI を standalone exe 化し、Tauri sidecar として同梱する。
```

Python CLI は、各処理を独立コマンドとして提供する。

例：

```text
pra-cli preprocess --project <project_folder> --docx <file.docx> --pdf <file.pdf>
pra-cli citation-db --project <project_folder>
pra-cli run-check --project <project_folder> --check structure --slot llm01
pra-cli merge-section --project <project_folder> --check structure
pra-cli final-merge --project <project_folder>
```

処理中の進捗通知は、標準出力に JSON Lines で出す。

```json
{"event":"progress","task":"preprocess","step":"extract_docx","percent":20}
{"event":"done","task":"preprocess","output":"project_folder/manuscript_full.json"}
{"event":"error","task":"preprocess","code":"PDF_LINE_EXTRACTION_FAILED","message":"Line-number extraction confidence was below threshold."}
```

詳細は `SPEC_CLI.md` と `SPEC_PROJECT_STRUCTURE.md` で定義する。

### 2.5 Word COM を使わない方針

本ツールの MVP では、Word COM による自動PDF化は実装しない。

Word の行番号機能で表示された行番号を扱うため、ユーザーが手作業で Word から PDF を保存し、前処理画面で docx と PDF の両方を指定する。

```text
docx原稿
+ Wordから保存した行番号付きPDF
↓
Peer Review Assistant に入力
```

この方針により、Word COM への依存を避け、実装と配布を軽量化する。

---

## 3. 基本コンセプト

### 3.1 対象

本ツールの対象は、査読者が受け取った学術論文原稿である。

主対象：

* docx 形式の査読用原稿
* Word の行番号機能により行番号が表示された原稿
* Word から保存した行番号付き PDF

### 3.2 ユーザー作業の前提

ユーザーは、前処理前に以下を行う。

```text
1. 査読用 docx を Word で開く
2. Word の行番号が表示されていることを確認する
3. Word から PDF として保存する
4. Peer Review Assistant の前処理画面で docx と PDF を指定する
```

### 3.3 ツールの主な目的

* 原稿の全体構成を把握する
* IMRaD構成の不備を指摘する
* 英語表現・学術表現の問題を指摘する
* 研究方法・統計解析の不備を整理する
* 引用文献の実在性を確認する
* 本文中での引用の使われ方が妥当か確認する
* 先行研究との重複・類似性・独自性を検討する
* 行番号付きまたは段落・文番号付きの査読コメントを作成する
* Comments to Authors と Confidential Comments to Editor の下書きを作成する

---

## 4. 全体処理フロー

### 4.1 大きな流れ

```text
1. 前処理
   docx + PDF を入力し、作業フォルダを作成する

2. 作業フォルダ読み込み
   前処理済みファイル群をGUIで読み込む

3. 文献DB前処理
   Referencesを分割し、PubMed / Semantic Scholar / Crossref / OpenAlexで照合する

4. 個別チェック
   構成、表現、方法・統計、引用、類似性・新規性を個別に処理する

5. 各チェック項目内マージ
   LLM01、LLM02、LLM03、手入力結果をチェック項目ごとに統合する

6. 全体マージ
   各チェック項目の統合結果をさらに統合する

7. 査読意見出力
   final_review.md などを生成する
```

### 4.2 処理の三層構造

本ツールの LLM 処理は以下の三層で構成する。

```text
第1層：個別 LLM または手入力による分析
第2層：各チェック項目内でのマージ・査読コメント候補作成
第3層：全体マージ・最終査読意見作成
```

単に複数 LLM の結果を並べるのではなく、各チェック項目ごとに統合し、さらに最終段階で査読意見として再構成する。

---

## 5. 入力ファイル

### 5.1 必須入力

前処理画面で以下を指定する。

```text
原稿docx：
[docxを選択]

Wordから保存した行番号付きPDF：
[pdfを選択]

出力フォルダ：
[フォルダを選択]
```

### 5.2 任意入力

将来的には以下を任意入力として扱う。

* 査読フォーム
* 投稿規定
* 著者向けガイドライン
* 分野別チェックリスト
* 編集部からの特記事項

### 5.3 docx と PDF の一致確認

docx と PDF が同じ原稿に由来するかを確認するため、前処理時に本文一致率を算出する。

出力例：

```text
docx本文とPDF本文の一致率：94.2%
```

一致率が低い場合は警告する。

```text
警告：docxとPDFの本文対応率が低いです。
別のPDFが指定されているか、PDF化後に原稿が変更された可能性があります。
```

---

## 6. 作業フォルダ構成

前処理後、指定フォルダに以下のようなファイル群を作成する。

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

  status/
    task_status.json

  logs/
    preprocess.log
    llm_calls.log
    citation_db.log
    errors.log
```

---

## 6.1 project.json

`project.json` は作業フォルダ全体のメタ情報を保持する中心ファイルである。

最低限、以下を保存する。

```json
{
  "project_id": "20260507_033000_sample",
  "created_at": "2026-05-07T03:30:00+09:00",
  "updated_at": "2026-05-07T03:35:00+09:00",
  "source": {
    "docx_path": "source/manuscript.docx",
    "pdf_path": "source/manuscript_line_numbered.pdf",
    "docx_sha256": "...",
    "pdf_sha256": "..."
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

`project.json` には API Key などの秘密情報を保存しない。

---

## 7. 前処理仕様

### 7.1 前処理の目的

前処理では、docx と PDF を解析し、後続処理に必要な中間ファイルを作成する。

### 7.2 前処理画面

```text
前処理

原稿 docx：
[docxを選択]

Wordから保存した行番号付きPDF：
[pdfを選択]

出力フォルダ：
[フォルダを選択]

処理内容：
☑ docxから本文抽出
☑ PDFからWord行番号を抽出
☑ docx本文とPDF行番号を対応づける
☑ 段落番号・文番号作成
☑ セクション分割
☑ Abstract抽出
☑ Introduction抽出
☑ Aim / Objective抽出
☑ Methods抽出
☑ Results抽出
☑ Discussion抽出
☑ Conclusion抽出
☑ References抽出
☑ 本文中引用抽出
☑ 表・図キャプション抽出

[前処理を実行]
```

### 7.3 入力ファイルの扱い

ユーザーは GUI で任意のファイル名の docx と PDF を選択する。アプリは以下の手順で検証・取り込みを行う。

1. **ファイル選択**: ユーザーが `original/` などから任意名の docx と PDF を選択
2. **入力チェック** (`validate-input`): 存在確認、拡張子確認、ファイルサイズ確認、SHA256 計算
3. **作業コピー** (`attach-source`): チェック OK 後、`work/source/manuscript.docx` と `work/source/manuscript_line_numbered.pdf` に標準名でコピー
4. **パス記録**: `project.json` に元ファイルパス (`original_docx_path`, `original_pdf_path`) と作業コピーパス (`docx_path`, `pdf_path`) の両方を記録

原本 (`original/`) はアプリが変更せず、作業コピー (`work/source/`) のみを処理対象とする。

### 7.4 docx から抽出する情報

Python CLI で `source/manuscript.docx` から以下を抽出する。

* 全文テキスト
* 段落
* 見出し候補
* セクション候補
* References
* 表テキスト
* 図表キャプション
* 本文中引用候補

### 7.5 PDF から抽出する情報

`source/manuscript_line_numbered.pdf` から以下を抽出する。

* ページ番号
* 表示行番号
* 行ごとの本文テキスト
* 行番号と本文行の座標情報
* PDF由来の行番号付きテキスト

### 7.5 行番号取得

PDF 上の行番号を抽出し、docx 由来の本文と対応づける。

```text
PDFから行番号付き本文行を取得
↓
docx本文と類似度で対応づけ
↓
line_map.jsonを作成
```

### 7.6 段落番号・文番号取得

行番号取得に加えて、docx本文から段落番号と文番号を作成する。

```text
docx本文
↓
段落単位に分割
↓
各段落に paragraph_id を付与
↓
文単位に分割
↓
各文に sentence_id を付与
↓
paragraph_sentence_map.json を作成
```

### 7.7 PDF行番号抽出のリスクと失敗判定

PDFからの行番号抽出は技術的に不安定になりうる。特に以下の場合は失敗または低信頼として扱う。

* PDFに行番号がテキストレイヤーとして存在しない
* 行番号が画像または描画オブジェクトとして埋め込まれている
* 2段組みで行番号と本文の対応が崩れる
* 表・図・脚注・ヘッダー・フッターと本文が混在する
* ページをまたぐ段落で行番号の対応が不安定になる
* 行番号がページごとにリセットされているが、本文との対応が取れない
* docxとPDFの本文一致率が低い

MVPでは、前処理時に以下の指標を計算する。

```text
docx_pdf_match_ratio:
  docx本文とPDF本文の一致率

line_detection_rate:
  PDF上で行番号らしい数字を検出できた割合

line_alignment_confidence:
  PDF行とdocx段落・文の対応づけ信頼度
```

初期閾値は以下とする。

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

MVPでは、2段組み原稿は非推奨とする。前処理画面に以下のガイドを表示する。

```text
推奨：1段組み、標準余白、行番号あり、Wordから直接保存したPDF。
2段組み、複雑な表・図配置、スキャンPDFでは行番号取得が不安定になる可能性があります。
```

### 7.8 Location の優先順位

査読コメントの位置情報は以下の優先順位で扱う。

```text
1. Word行番号が取得できる場合
   → Lines xx–yy を使う

2. Word行番号が不安定または取得不能な場合
   → Paragraph x, Sentence y を使う

3. 両方ある場合
   → Lines xx–yy を主表示し、内部データには paragraph/sentence も保持する
```

### 7.9 Location オブジェクト

内部データでは、位置情報を `location` オブジェクトで統一する。

```json
{
  "location": {
    "preferred": "line",
    "section": "Methods",
    "page_start": 4,
    "page_end": 4,
    "line_start": 128,
    "line_end": 131,
    "paragraph_start": 12,
    "paragraph_end": 13,
    "sentence_start": 2,
    "sentence_end": 4,
    "text_excerpt": "The intervention consisted of..."
  },
  "category": "Methods",
  "severity": "major",
  "comment": "The intervention details are insufficient."
}
```

行番号が取得できない場合：

```json
{
  "location": {
    "preferred": "paragraph_sentence",
    "section": "Methods",
    "paragraph_start": 12,
    "paragraph_end": 12,
    "sentence_start": 2,
    "sentence_end": 2,
    "text_excerpt": "The intervention consisted of..."
  },
  "category": "Methods",
  "severity": "major",
  "comment": "The intervention details are insufficient."
}
```

### 7.10 セクション分割の方針

セクション分割は、まず見出しベースのルールで実行する。

対象見出し例：

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

Aim / Objective は独立見出しとして存在しない場合が多いため、以下の扱いとする。

```text
1. 独立見出しがある場合
   → aim_objective.txt として抽出する。

2. Introduction 内に目的文が含まれる場合
   → introduction.txt に保持したまま、目的文候補を aim_objective.txt にコピーする。

3. Methods 冒頭に目的文がある場合
   → methods.txt に保持したまま、目的文候補を aim_objective.txt にコピーする。

4. 抽出できない場合
   → aim_objective.txt は空ファイルまたは未作成とし、statusに warning を記録する。
```

セクション分割が不完全な場合でも処理は停止しない。GUI上で警告を表示し、将来的にはユーザーがセクション範囲を手動修正できる画面を追加する。

MVPでは、LLMによるセクション分割補正は任意機能とし、初期実装では見出しベースを優先する。

---

## 8. GUI 画面構成

### 8.1 画面一覧

MVP では以下の画面を用意する。

```text
1. ホーム画面
2. 前処理画面
3. 作業フォルダ読み込み画面
4. API設定画面
5. 構成チェック画面
6. 表現チェック画面
7. 方法・統計チェック画面
8. 文献DB前処理画面
9. 引用文献チェック画面
10. 先行研究・類似性・オリジナリティチェック画面
11. 最終マージ画面
12. 結果表示画面
13. ログ画面
```

### 8.2 作業フォルダ読み込み画面

```text
Peer Review Assistant / 査読アシスタント

作業フォルダ：
[フォルダを選択]

読み込み状況：
☑ manuscript_full.json
☑ line_map.json
☑ paragraph_sentence_map.json
☑ sections/
☑ citations/
☑ references_split.json

モード：
○ 全自動解析モード
○ 個別処理モード

[作業フォルダを読み込む]
```

### 8.3 各チェック項目の共通画面

各チェック項目には以下を用意する。

```text
LLM01
[LLM処理] ☑ 完了
[結果を見る]

LLM02
[LLM処理] □ 未処理
[結果を見る]

LLM03
[LLM処理] □ 未処理
[結果を見る]

手入力
[手入力処理] □ 未入力
[プロンプトをコピー]
[結果を貼り付け]

統合結果
[セクション内マージ処理] □ 未処理
[結果を見る]
```

### 8.4 ステータス表示

```text
☑ 完了
□ 未処理
△ エラー
－ 不使用
```

ステータスは `status/task_status.json` に保存する。

---

## 9. API 設定仕様

### 9.1 LLM スロット

以下の LLM スロットを設定できる。

* まとめ LLM
* 解析者1
* 解析者2
* 解析者3

### 9.2 マージ条件

```text
解析者1のみ設定：
→ 各チェック結果をそのまま採用
→ マージ不要

解析者1 + 解析者2：
→ 2つの結果をまとめLLMが比較・統合

解析者1 + 解析者2 + 解析者3：
→ 3つの結果をまとめLLMが比較・統合

手入力結果あり：
→ 手入力結果も統合対象に含める
```

### 9.3 Provider

Provider はプリセット選択に加え、自由入力を許可する。

```text
Provider preset:
- OpenAI
- Anthropic
- Google Gemini
- DeepSeek
- OpenRouter
- Ollama
- LM Studio
- OpenAI-Compatible
- Custom
```

### 9.4 API設定項目

各 LLM スロットには以下を設定する。

```text
表示名
Provider
Base URL
Model
API Key
Headers / Optional
```

### 9.5 接続テスト

接続テストは、LLMスロットおよび文献DBごとに個別に行う。

```text
まとめLLM
[接続テスト] ☑ OK 最終確認：2026-05-07 03:20

解析者1
[接続テスト] ☑ OK 最終確認：2026-05-07 03:20

解析者2
[接続テスト] □ 未確認

解析者3
[接続テスト] △ エラー：認証失敗

PubMed
[接続テスト] ☑ OK

Semantic Scholar
[接続テスト] ☑ OK

Crossref
[接続テスト] □ 未確認

[すべて接続テスト]
[すべて再チェック]
[OK履歴をクリア]
```

### 9.6 APIキー保存方針

API Key は平文の設定ファイルや `project.json` には保存しない。

MVPでは、以下の優先順位で保存する。

```text
第1候補：OSの安全な資格情報ストア
  Windows: Credential Manager / DPAPI

第2候補：ユーザーが毎回入力

第3候補：ローカル設定ファイルに暗号化保存
  ただし平文保存は禁止
```

Tauri側では、可能であれば OS キーチェーンまたは Windows Credential Manager を利用する。Python CLI へは、実行時に環境変数または一時ファイルで渡す。一時ファイルを使う場合は処理終了後に削除する。

`config_hash` は接続確認キャッシュ用であり、API Key本体ではない。

### 9.7 接続確認キャッシュ

過去に OK が出た接続設定は 7 日間保持する。

以下の場合は再チェックする。

* API Key を変更した
* Base URL を変更した
* Model 名を変更した
* Provider を変更した
* ユーザーが「すべて再チェック」を押した
* 前回エラーだった

API Key 自体ではなく、設定値のハッシュを保存する。

```json
{
  "slot": "reviewer_1",
  "provider": "openai-compatible",
  "base_url": "https://api.deepseek.com/v1",
  "model": "deepseek-chat",
  "config_hash": "xxxxx",
  "last_checked_at": "2026-05-07T03:20:00+09:00",
  "status": "ok",
  "valid_until": "2026-05-14T03:20:00+09:00"
}
```

### 9.8 接続確認キャッシュのMVP優先度

7日間キャッシュは便利機能であるため、MVPの必須要件ではなく **MVP+** とする。

MVPでは、少なくとも以下を実装する。

```text
- 個別接続テスト
- すべて接続テスト
- 接続結果の一時表示
```

7日間キャッシュ、OK履歴クリア、設定ハッシュ管理は、初期実装後の拡張として扱う。

---

## 10. 処理モード

### 10.1 全自動解析モード

全自動解析モードでは、有効化されているチェック項目を一括実行する。

MVPでの基本ポリシーは以下とする。

```text
- 有効な LLM01〜LLM03 を各チェック項目で使用する。
- 手入力処理は全自動解析モードでは使用しない。
- 文献DB照合は、設定済みのDBのみ実行する。
- エラーが発生した処理は failed として記録し、可能な限り次の処理へ進む。
- 最終マージは、成功したチェック項目だけでも実行可能にする。
```

全自動解析モードでは、以下を一括実行する。

```text
1. 作業フォルダ読み込み
2. 構成チェック
3. 表現チェック
4. 方法・統計チェック
5. 文献DB照合
6. 引用文献チェック
7. 先行研究・類似性・オリジナリティチェック
8. 各チェック項目内マージ
9. 全体マージ
10. 最終査読コメント生成
```

GUI：

```text
[全自動解析開始]
```

### 10.2 個別処理モード

個別処理モードでは、各チェック項目を独立して実行できる。

```text
構成チェックだけ実行
表現チェックだけ実行
方法・統計チェックだけ実行
引用文献DB照合だけ実行
先行研究チェックだけ手入力で実行
最後に統合だけ実行
```

MVPでは個別処理モードを重視する。

---

## 11. チェック項目

### 11.1 構成チェック

対象：

* Abstract
* Introduction
* Aim / Objective
* Methods
* Results
* Discussion
* Conclusion
* manuscript_full.json

チェック内容：

* IMRaD 構成が守られているか
* Abstract と本文が整合しているか
* Introduction に研究ギャップが明示されているか
* Aim / Objective が明確か
* Methods と Results が対応しているか
* Results に Methods で説明されていない分析が出ていないか
* Discussion が Results を超えていないか
* Conclusion が過剰主張になっていないか

### 11.2 表現チェック

チェック内容：

* 英語としておかしい箇所
* 文法誤り
* 冠詞の誤り
* 単数・複数の不一致
* 時制の不一致
* 前置詞の誤り
* 不自然な語順
* 日本語直訳調の英語
* 学術英語として不自然な表現
* 曖昧な表現
* 過剰主張
* 因果関係の断定
* 有意でない結果の強調

### 11.3 方法・統計チェック

チェック内容：

* 研究デザインの明確性
* 対象者の説明
* 選択基準・除外基準
* 介入内容
* 評価尺度
* 統計手法
* サンプルサイズ
* 欠測値処理
* 効果量
* 多重比較
* 交絡因子
* 倫理審査
* インフォームド・コンセント
* 利益相反

### 11.4 引用文献チェック

チェック内容：

* 文献の実在性
* DOI / PMID の確認
* 著者名、年、タイトル、雑誌名、巻号、ページの確認
* 本文中での引用箇所の抽出
* 本文での引用の使われ方の要約
* 文献DB上の抄録・メタデータとの照合
* 本文中の主張を文献が支持しているかの判定
* 不適切引用、過剰引用、孫引き疑いの検出

### 11.5 先行研究・類似性・オリジナリティチェック

チェック内容：

* 類似研究の有無
* 対象、介入、アウトカム、研究デザインの重複
* 重要な先行研究の不足
* 新規性の主張の妥当性
* 既存研究との差分
* Deep Research API または手入力結果の取り込み

---

## 12. 文献DB前処理仕様

### 12.1 使用DB

MVPでは以下に対応する。

* PubMed / NCBI E-utilities
* Semantic Scholar
* Crossref
* OpenAlex

### 12.2 優先方針

```text
医学・生命科学系：PubMed 優先
心理・教育・情報・学際系：Semantic Scholar / OpenAlex / Crossref 併用
DOI や書誌情報の正規化：Crossref 併用
引用・被引用や類似論文：Semantic Scholar 優先
```

### 12.3 文献DB前処理画面

```text
文献DB前処理

作業フォルダ：
[フォルダを選択]

入力：
☑ references_split.json
☑ citation_contexts.json

使用DB：
☑ PubMed
☑ Semantic Scholar
☑ Crossref
☑ OpenAlex

処理内容：
☑ DOI抽出
☑ PMID抽出
☑ タイトル検索
☑ 著者・年・雑誌名の照合
☑ 抄録取得
☑ 論文タイプ取得
☑ 引用・被引用情報取得
☑ 類似論文候補取得

[文献DB照合を実行]
```

### 12.4 文献チェックの流れ

```text
Referencesを1件ずつ分割
↓
本文中の引用箇所を抽出
↓
各引用文献について、本文中で何を支えるために使われているかをJSON化
↓
PubMed / Semantic Scholar / Crossref / OpenAlexで実在確認
↓
取得できる書誌情報・抄録・キーワード・論文タイプをJSONに追加
↓
LLMが「本文中の使われ方」と「DB上の内容」が整合するか判定
↓
まとめLLMが文献ごとの判定をマージ
```

---

## 13. API版と手入力版

### 13.1 基本方針

各チェック項目は API 版と手入力版の両方に対応する。全体設定ではなく、各パーツごとに API 実行または手入力を選択できるようにする。

### 13.2 API実行

```text
[LLM処理]
[文献DB照合]
[Deep Research API実行]
```

### 13.3 手入力実行

手入力実行では、ツールがプロンプトを生成し、ユーザーが ChatGPT、Claude、Gemini、Perplexity などの Web チャットサービスに貼り付ける。得られた結果を GUI に貼り戻し、JSON として取り込む。

GUI例：

```text
Step 1: 以下のプロンプトを ChatGPT Deep Research に貼り付けてください
[コピー]

Step 2: 結果をここに貼り付けてください
[テキストボックス]

Step 3: 読み込み
[JSONとして取り込み]
```

---

## 13.4 エラー処理・部分失敗時の基本方針

各処理は独立タスクとして扱い、成功・失敗・未処理を `status/task_status.json` に記録する。

基本方針：

```text
1. 1つの処理が失敗しても、原則としてプロジェクト全体を破棄しない。
2. 成功した出力は保存し、再利用できるようにする。
3. 失敗した処理だけを再実行できるようにする。
4. 全自動解析モードでも、可能な限り後続処理を継続する。
5. 最終マージは、利用可能なチェック結果のみで実行可能にする。
```

例：

```text
LLM01 成功、LLM02 タイムアウト、LLM03 未使用
→ LLM01 の結果だけでセクション内マージを実行できる。

PubMed 成功、Semantic Scholar 失敗、Crossref 成功
→ 成功したDB結果だけで citation report を作成し、失敗DBを report に明記する。

PDF行番号抽出失敗
→ paragraph_sentence_map.json にフォールバックする。
```

自動リトライは、外部APIについて最大3回までとする。リトライ間隔は指数バックオフを用いる。

```text
1回目失敗 → 2秒待機
2回目失敗 → 5秒待機
3回目失敗 → 10秒待機
それでも失敗 → failed として記録
```

詳細は `SPEC_CLI.md` で定義する。

---

## 14. 各チェック項目内マージ

### 14.1 目的

各チェック項目内マージでは、LLM01、LLM02、LLM03、手入力結果を統合し、そのチェック項目に関する査読コメント候補を作成する。

### 14.2 マージ方針

まとめLLMは、複数の解析結果を単純に多数決で処理しない。以下の方針で統合する。

```text
1. 複数のLLMが同じ問題を指摘した場合
   → 信頼度を高く扱う。

2. 1つのLLMだけが指摘した場合
   → 原稿本文・引用DB・行番号などの根拠が明確なら採用候補にする。

3. LLM間で矛盾がある場合
   → どちらか一方に自動決定せず、conflict として記録する。

4. 重大度が異なる場合
   → 最終コメントでは保守的に扱い、必要に応じて reviewer_note に残す。

5. 事実確認が必要な指摘
   → 文献DBや本文に根拠がある場合のみ強い表現にする。

6. 不確実な指摘
   → 著者向けコメントでは断定を避け、clarify / consider / please explain などの表現にする。
```

解析者1のみの場合も、まとめLLMが設定されていれば、単一結果の整形、重大度判定、査読コメント化に使える。

```text
解析者1のみ + まとめLLMなし
  → 解析者1の結果をそのまま採用

解析者1のみ + まとめLLMあり
  → まとめLLMで整形・重大度判定・査読コメント化

解析者2または3あり
  → まとめLLMで比較・統合・矛盾整理
```

### 14.3 マージ出力

各チェック項目内マージでは以下を出力する。

* 査読コメント候補
* 重大度
* 行番号または段落・文番号
* 根拠
* 著者向けコメント案
* 査読者内部メモ

### 14.4 merged.section.json の基本スキーマ

`merged.section.json` は、最終マージの入力となる構造化ファイルである。

最低限、以下の形式とする。

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
  "conflicts": [
    {
      "conflict_id": "methods_stats_conflict_001",
      "description": "LLM01 considered the statistical approach acceptable, whereas LLM02 questioned the handling of repeated measures.",
      "resolution": "Flagged for reviewer confirmation."
    }
  ]
}
```

### 14.5 保存構造

```text
outputs/
  structure/
    llm01.raw.json
    llm02.raw.json
    llm03.raw.json
    manual.raw.json
    merged.section.json
    merged.section.md

  expression/
    llm01.raw.json
    llm02.raw.json
    llm03.raw.json
    manual.raw.json
    merged.section.json
    merged.section.md

  methods_stats/
    llm01.raw.json
    llm02.raw.json
    llm03.raw.json
    manual.raw.json
    merged.section.json
    merged.section.md

  citation/
    llm01.raw.json
    llm02.raw.json
    llm03.raw.json
    manual.raw.json
    merged.section.json
    merged.section.md

  originality/
    llm01.raw.json
    llm02.raw.json
    llm03.raw.json
    manual.raw.json
    merged.section.json
    merged.section.md
```

---

## 14.6 原稿要約ステップ

最終出力の `Brief Summary` と最終マージ入力に用いるため、原稿要約を独立した処理として定義する。

```text
入力：
  manuscript_full.json
  sections/abstract.txt
  sections/introduction.txt
  sections/methods.txt
  sections/results.txt
  sections/discussion.txt

出力：
  outputs/final/manuscript_summary.json
  outputs/final/manuscript_summary.md
```

原稿要約は、以下のいずれかで生成する。

```text
1. Abstractをもとに機械的に初期要約を作る
2. まとめLLMで要約を生成する
3. ユーザーが手入力する
```

MVPでは、Abstractが存在する場合はそれを初期要約として使用し、必要に応じてまとめLLMで整形する。

---

## 15. 最終マージ

### 15.1 入力

最終マージでは以下を統合する。

* 構成チェック `merged.section.json`
* 表現チェック `merged.section.json`
* 方法・統計チェック `merged.section.json`
* 引用文献チェック `merged.section.json`
* 類似性・新規性チェック `merged.section.json`
* 原稿要約
* line_map.json
* paragraph_sentence_map.json
* 査読フォーム
* 投稿規定

### 15.2 出力

```text
outputs/final/
  final_review.md
  comments_to_authors.md
  confidential_comments_to_editor.md
  recommendation.md
  citation_report.md
  originality_report.md
  audit_trail.json
```

---

## 16. 査読意見の出力形式

### 16.1 デフォルト形式と分離ファイルの関係

MVPでは、`final_review.md` に査読全体をまとめて出力する。同時に、投稿システムに貼り付けやすいように、以下の分離ファイルも生成する。

```text
final_review.md
  → 全体版。Comments to Authors と Confidential Comments to Editor を含む。

comments_to_authors.md
  → 著者向けコメントのみ。

confidential_comments_to_editor.md
  → 編集者向けコメントのみ。

recommendation.md
  → 推奨判定と理由の下書き。
```

つまり、分離ファイルはオプション形式ではなく、MVPでも生成する補助出力である。

### 16.2 デフォルト形式

MVPでは以下を標準形式とする。

```markdown
# Peer Review

## 1. Brief Summary
[原稿の内容を2〜5文で要約]

## 2. General Assessment
[全体評価。意義、強み、主な懸念を簡潔に述べる]

## 3. Major Comments
1. **[Category: Methods / Lines xx–yy]**
   [問題点]
   [なぜ重要か]
   [著者に求める修正]

2. **[Category: Results / Lines xx–yy]**
   ...

## 4. Minor Comments
1. **[Line xx]**
   [軽微な表現・形式・明確化の指摘]

## 5. Citation and Literature Concerns
[引用文献の正確性、引用の使われ方、重要文献の不足]

## 6. Originality and Overlap
[類似研究との関係、新規性、重複性]

## 7. Confidential Comments to the Editor
[編集者向けの率直な評価。著者には見せない前提]

## 8. Recommendation
[Accept / Minor Revision / Major Revision / Reject]
```

### 16.3 Location 表記

行番号が取得できる場合：

```markdown
**[Category: Methods / Lines 128–131]**
```

行番号が取得できない場合：

```markdown
**[Category: Methods / Paragraph 12, Sentence 2]**
```

両方表示する場合：

```markdown
**[Category: Methods / Lines 128–131; Paragraph 12, Sentences 2–4]**
```

### 16.4 将来の形式オプション

```text
□ 標準型
□ Comments to Authors / Editor 分離型
□ チェックリスト型
□ 行番号中心型
□ 簡潔版
□ 詳細版
```

---

## 17. 査読コメントの重大度分類

### 17.1 Major Comment

Major comment とする条件：

* 研究目的と方法が対応していない
* 方法の説明不足で再現できない
* 統計解析が研究デザインと合っていない
* 結果と結論が一致していない
* 主要な先行研究が抜けている
* 引用が本文の主張を支持していない
* 倫理審査・同意・利益相反の記載が不十分
* 新規性の主張が弱い
* 研究の結論に影響する重大な不明点がある

### 17.2 Minor Comment

Minor comment とする条件：

* 英語表現の軽微な不自然さ
* 語句の曖昧さ
* 表記揺れ
* 図表タイトルの修正
* 引用形式の小さな不備
* 追加説明があるとよい程度の指摘

### 17.3 Line-specific Comment

Line-specific comment は、特定の行、段落、文に対応する指摘である。Minor に多いが、Major になる場合もある。

---

## 18. セキュリティ・守秘義務

### 18.1 基本方針

査読対象原稿は機密情報であるため、外部 API への送信は慎重に扱う。

### 18.2 通常 API モード

通常 API モードは、以下の場合に使う。

* ジャーナルまたは編集部が AI 利用を許可している場合
* 外部 API への送信が問題ない場合
* 著者本人の投稿前チェックなど、守秘義務上の問題がない場合

### 18.3 セキュアモード

セキュアモードでは、以下の制約を置く。

* 原稿全文を外部 API に送らない
* ローカル LLM を使う
* 外部 DB には DOI、PMID、タイトル、著者名などの文献情報のみ送る
* Deep Research には抽象化した PICO、キーワード、研究領域のみを送る
* 本文の機密部分は送らない

### 18.4 注意文言

アプリ内に以下を表示する。

```text
本ツールは査読者の判断を代替しません。
査読対象原稿を外部 API へ送信する場合は、当該ジャーナル・出版社・編集部・所属機関の AI 利用ポリシーに従ってください。
機密性の高い原稿については、ローカル LLM または所属機関が許可した閉域環境での利用を推奨します。
```

---

## 18.5 APIデータ利用に関する注意

通常APIモードでは、ユーザーが利用するLLMプロバイダーや文献DBの利用規約を確認する必要がある。

API設定画面には以下の注意を表示する。

```text
外部APIに送信したデータが、プロバイダーの学習・品質改善・ログ保存に利用されない設定であることを確認してください。
査読原稿を送信する場合は、ジャーナル・出版社・所属機関のAI利用ポリシーに従ってください。
```

主要プロバイダーの扱いは変わり得るため、本ツール内では特定プロバイダーを安全と断定しない。ユーザーが契約条件を確認する前提とする。

---

## 19. MVP範囲

### 19.1 MVPで実装するもの

MVPでは以下を実装する。

1. Tauri + TypeScript によるGUI
2. Python CLI 呼び出し
3. docx + PDF 入力
4. 作業フォルダ作成
5. docx本文抽出
6. PDF行番号抽出
7. docx本文とPDF行番号の対応づけ
8. 段落番号・文番号作成
9. セクション分割
10. References 抽出
11. 本文中引用抽出
12. API設定画面
13. 接続テスト
14. 接続テスト
15. 構成チェック
16. 表現チェック
17. 方法・統計チェック
18. PubMed / Semantic Scholar / Crossref / OpenAlex による文献実在確認
19. 引用文献チェック
20. 先行研究・類似性・オリジナリティチェック
21. 手入力モード
22. 各チェック項目内マージ
23. 最終マージ
24. Markdown査読コメント出力
25. 部分失敗時の再実行
26. ログ保存
27. ステータス保存

### 19.2 MVPでは後回しにするもの

以下は将来拡張とする。

* Word COM による自動PDF化
* PDF原稿のみからの直接処理
* docxへのコメント埋め込み
* 投稿システム連携
* 査読フォーム自動入力
* チーム共有機能
* クラウド同期
* 完全な類似文章・盗用検出
* iThenticate / Turnitin 連携
* macOS 対応

---

## 20. 推奨プロジェクト構成

```text
peer-review-assistant/
  SPEC.md
  README.md

  app/
    package.json
    src/
    src-tauri/

  python/
    peer_review_assistant/
      __init__.py
      cli.py
      preprocess/
      citations/
      llm/
      merge/
      output/
      utils/
    pyproject.toml

  docs/
    SPEC_PREPROCESS.md
    SPEC_GUI.md
    SPEC_CLI.md
    SPEC_LLM.md
    SPEC_CITATION_DB.md
    SPEC_REVIEW_OUTPUT.md
    SPEC_SECURITY.md
    SPEC_PROJECT_STRUCTURE.md

  examples/
    sample_project/

  tests/
    python/
    app/
```

---

## 21. ドキュメント構成

本セクションでは、プロジェクトのドキュメントファイルの構成、各ファイルの役割、およびドキュメント間の関係を定義する。

### 21.1 今回のおすすめ構成

最終的には、以下の構成とするのがよい。

```text
peer-review-assistant/
  README.md
  SPEC.md
  IMPLEMENTATION_PLAN.md

  docs/
    SPEC_PROJECT_STRUCTURE.md
    SPEC_PREPROCESS.md
    SPEC_CLI.md
    SPEC_GUI.md
    SPEC_LLM.md
    SPEC_CITATION_DB.md
    SPEC_REVIEW_OUTPUT.md
    SPEC_SECURITY.md

  release/
    README_RELEASE.md
    uploads/
    builds/
    checksums/
```

### 21.2 各ファイルの役割

**`README.md`**

外から見る人向け。

- 何のツールか
- インストール方法
- 最小限の使い方
- 注意事項

**`SPEC.md`**

全体仕様である。

- アプリの目的
- 全体アーキテクチャ
- 入力と出力
- 処理フロー
- MVP範囲
- セキュリティ方針
- 詳細仕様書一覧

**`IMPLEMENTATION_PLAN.md`**

開発者向けの実装順序である。

- Phaseごとの実装順
- Phaseごとの目的
- 実装対象
- CLIコマンド
- GUI
- 出力ファイル
- 完了条件

**`docs/SPEC_PROJECT_STRUCTURE.md`**

リポジトリ構成と作業フォルダ構成である。

- app/
- python/
- docs/
- release/
- workspacesはリポジトリ外
- project.json
- task_status.json

**`docs/SPEC_PREPROCESS.md`**

docx/PDF前処理の詳細である。

- docx抽出
- PDF行番号抽出
- 行番号信頼度
- 段落・文マップ
- 行マップ
- セクション分割

**`docs/SPEC_CLI.md`**

Python CLIの詳細である。

- コマンド一覧
- 引数
- 標準出力 JSON Lines
- 終了コード
- エラーコード
- ログ

**`docs/SPEC_GUI.md`**

Tauri GUIの詳細である。

- 画面一覧
- 画面遷移
- ボタン
- ステータス表示
- 作業フォルダ選択
- releaseフォルダを選ばせない

**`docs/SPEC_LLM.md`**

LLMまわりである。

- LLMスロット
- Provider自由入力
- APIキー
- 接続テスト
- プロンプト
- 手入力モード
- マージ方針

**`docs/SPEC_CITATION_DB.md`**

文献DBまわりである。

- PubMed
- Semantic Scholar
- Crossref
- OpenAlex
- references_split.json
- citation_contexts.json
- db_verified_references.json

**`docs/SPEC_REVIEW_OUTPUT.md`**

査読出力である。

- final_review.md
- comments_to_authors.md
- confidential_comments_to_editor.md
- recommendation.md
- 重大 / 軽微
- Location表記

**`docs/SPEC_SECURITY.md`**

守秘義務とキー管理である。

- APIキー保存
- 外部API送信警告
- セキュアモード
- ログに秘密情報を残さない

### 21.3 フェーズ仕様と詳細仕様の関係

ここが一番大事である。

`IMPLEMENTATION_PLAN.md` は、時間軸の文書である。

- Phase 1で何を作る
- Phase 2で何を作る
- Phase 3で何を作る

一方、`docs/SPEC_PREPROCESS.md` などは、機能単位の文書である。

- 前処理とは何か
- どう入力するか
- どう出力するか
- エラー時にどうするか

つまり、関係は以下の3層である。

```text
SPEC.md
  全体地図

IMPLEMENTATION_PLAN.md
  実装の順番

docs/SPEC_*.md
  機能ごとの詳細仕様
```

この3層が一番わかりやすい。

### 21.4 「細かいことは実装フェーズごとの仕様書に書く」の是非

開発中は実装フェーズ別仕様書に細かいことを書いた方が流れが見えて便利である。

ただし、長期的には注意が必要である。

たとえば、Phase 2 に `line_map.json` のスキーマを書き、別の `docs/SPEC_PREPROCESS.md` にも同じスキーマを書くと、後で片方だけ更新される危険がある。

そのため、おすすめは以下の方針である。

**実装初期**

`IMPLEMENTATION_PLAN.md` に細かく書く。開発の流れを優先する。

**仕様が固まってきたら**

詳細仕様を `docs/SPEC_PREPROCESS.md` などに移す。`IMPLEMENTATION_PLAN.md` には要約とリンクだけ残す。

たとえば、以下のようにする。

```text
Phase 2: docx/PDF前処理
  詳細仕様: docs/SPEC_PREPROCESS.md
  完了条件:
    - manuscript_full.json が生成される
    - line_map.json が生成される
    - paragraph_sentence_map.json が生成される
```

### 21.5 今やるべき整理

今の状態では、次のように整理するのがよい。

1. いまの全体仕様書を `SPEC.md` とする
2. いまの実装フェーズ別仕様書を `IMPLEMENTATION_PLAN.md` に改名する
3. 次に `docs/SPEC_PROJECT_STRUCTURE.md` を作る
4. その後、Phase 2 に進む前に `docs/SPEC_PREPROCESS.md` を作る

### 21.6 最終提案

ファイル名は以下で確定する。

```text
SPEC.md
IMPLEMENTATION_PLAN.md
docs/SPEC_PROJECT_STRUCTURE.md
docs/SPEC_PREPROCESS.md
docs/SPEC_CLI.md
docs/SPEC_GUI.md
docs/SPEC_LLM.md
docs/SPEC_CITATION_DB.md
docs/SPEC_REVIEW_OUTPUT.md
docs/SPEC_SECURITY.md
```

そして、役割は以下の通りである。

```text
SPEC.md
  全体仕様。思想、全体設計、MVP範囲。

IMPLEMENTATION_PLAN.md
  実装フェーズごとの仕様。開発順、各フェーズの完了条件。

docs/SPEC_*.md
  機能別の詳細仕様。仕様が固まったものを移す。
```

この構成なら、全体の流れと各フェーズの実装仕様の両方が見える。

最初は `IMPLEMENTATION_PLAN.md` に細かく書いておき、実装が進んで安定した部分を `docs/SPEC_*.md` に分解していくのがよい。

---

## 22. 反映済みの設計上の重要リスク

本仕様では、以下の技術的・運用的リスクを全体仕様レベルで明示する。

```text
1. PDF行番号抽出は失敗しうるため、信頼度閾値と段落・文番号フォールバックを用意する。
2. Tauri と Python は subprocess + JSONファイル連携 + JSON Lines進捗通知で接続する。
3. LLM出力の矛盾は多数決で消さず、conflict として保持する。
4. 部分失敗時にも処理を継続し、失敗タスクだけ再実行できるようにする。
5. API Keyは project.json や平文設定ファイルに保存しない。
6. 7日間接続確認キャッシュは MVP+ とし、MVP必須要件から外す。
7. セクション分割は見出しベースを基本とし、不完全な場合は警告とフォールバックで処理を継続する。
8. 原稿要約は独立ステップとして扱う。
```

---

## 23. 最終要約

Peer Review Assistant / 査読アシスタントは、Tauri + TypeScript + Python CLI で実装する Windows 向けデスクトップアプリケーションである。

ユーザーは査読用 docx を Word で開き、行番号付き PDF として保存する。アプリは docx と PDF を受け取り、作業フォルダ内に本文、セクション、行番号、段落番号、文番号、引用文献、本文中引用を分解して保存する。

その後、構成チェック、表現チェック、方法・統計チェック、引用文献チェック、先行研究・類似性・オリジナリティチェックを、LLM01、LLM02、LLM03、手入力処理のいずれかまたは複数で実行する。各チェック項目ごとに結果をマージし、最後に全体を統合して、Markdown形式の査読意見を出力する。

MVPでは、Word COM による自動PDF化は行わず、ユーザーが手作業で保存したPDFを利用する。これにより、実装を軽量化し、Pythonによる docx/PDF/文献DB/LLM 処理と、TauriによるGUIを明確に分離する。
