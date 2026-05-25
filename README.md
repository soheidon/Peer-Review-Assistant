# Peer Review Assistant / 査読アシスタント

学術雑誌の査読者が受け取った原稿を読み、査読コメントを作成する作業を支援するデスクトップアプリケーションです。

## 概要

- docx 原稿と、Word から保存した行番号付き PDF を入力します（PDF は任意）
- 原稿の構成、表現、方法・統計、引用文献、先行研究との関係を点検します
- 複数の LLM と文献データベース（PubMed, Semantic Scholar, Crossref, OpenAlex）を組み合わせて分析します
- 行番号付きまたは段落・文番号付きの査読コメントを Markdown / テキスト / Word 形式で出力します

本ツールは査読者の判断を代替しません。査読者が原稿を理解し、問題点を整理し、著者向けコメントおよび編集者向けコメントを作成するための補助ツールです。

## 現在の状態

**v0.3.0** — 査読チェックパイプラインが実装済み。以下の機能が利用可能です：

- プロジェクトの作成・開く・状態復元
- docx/PDF ファイルの検証と取り込み（3入力モード対応）
- システムヘルスチェック
- 前処理パイプライン（本文抽出・段落文番号・セクション分割）
- 引用文献抽出・文献DB照合（Crossref / PubMed / Google Books / Semantic Scholar / CiNii）
- 文献確認ビューア（9タブ、LLM文献情報整理、要確認→確認済自動移動）
- LLM スロット設定・接続テスト（OpenAI / Anthropic / DeepSeek / Gemini / OpenRouter / Ollama 対応）
- ジャーナルプロファイル設定（投稿先ジャーナルの評価基準を分析）
- 新規性チェック（5フェーズパイプライン）:
  1. 論文概要生成、2. Deep Research プロンプト生成（広範囲+批判的）、
  3. 外部AI結果貼り付け、4. Deep Research 統合、5. 新規性・適合性評価
- 査読チェック実行（構成・表現・方法統計・引用文献）
- マージパイプライン（チェック項目内マージ・最終マージ）
- 複数形式出力（Markdown / テキスト / Word）とフォーマット選択
- DeepSeek reasoning model（thinking enabled）対応
- 出力ファイルの永続化・プロジェクト再開時の自動復元

## インストール方法

> MVP 開発中のため、現在はソースコードからのビルドのみ対応しています。

```bash
# リポジトリをクローン
git clone <repository-url>
cd peer-review-assistant

# Tauri アプリのセットアップ
cd app
npm install

# Python CLI のセットアップ
cd ../python
pip install -e .
```

## 最小限の使い方

1. 査読用 docx を準備する（PDF は任意）
2. Peer Review Assistant を起動する
3. プロジェクト画面で作業フォルダを作成または開く
4. docx を選択し、「入力ファイルを確認」→「プロジェクトに取り込み」
5. 前処理画面で処理を実行
6. API 設定画面で LLM の接続設定を行う
7. 各チェック項目を実行
8. 最終出力を確認

## 入力モード

| モード | docx | PDF | 説明 |
|---|---|---|---|
| docx_only | 必須 | なし | 段落・文番号のみで位置表示 |
| docx_with_pdf | 必須 | あり | PDF あり、行番号抽出は未実行 |
| docx_with_line_numbered_pdf | 必須 | あり | 行番号抽出成功（将来実装） |

## 動作環境

- **OS**: Windows 11（主対象）
- **Python**: 3.11 以上
- **Node.js**: 20 以上
- **Rust**: Tauri のビルドに必要

## 注意事項

- **査読対象原稿は機密情報です。** 外部 API へ送信する場合は、当該ジャーナル・出版社・編集部・所属機関の AI 利用ポリシーに従ってください。
- 外部 API に送信したデータが、プロバイダーの学習・品質改善・ログ保存に利用されない設定であることを確認してください。
- 機密性の高い原稿については、ローカル LLM または所属機関が許可した閉域環境での利用を推奨します。
- Word の行番号機能で表示された行番号を利用するため、PDF は Word から直接保存してください。
- 2段組み、複雑な表・図配置、スキャン PDF では行番号取得が不安定になる可能性があります。

## ライセンス

本ソフトウェアは個人利用および非営利目的に限り使用が許可されています。
商用利用および改変は固く禁じられています。
これらの制限は、クリエイティブ・コモンズの **CC BY-NC-ND 4.0**（表示 — 非営利 — 改変禁止 4.0 国際）に準拠・相当します。

This software is licensed for personal and non-commercial use only.
Commercial use and any modifications of this software are strictly prohibited.
These restrictions are equivalent to the Creative Commons **CC BY-NC-ND 4.0**
(Attribution — NonCommercial — NoDerivatives 4.0 International) license.

詳細は [LICENSE](LICENSE) を参照してください。

## 開発ドキュメント

- [SPEC.md](SPEC.md) — 全体仕様（機能別）
- [docs/SPEC_CLI.md](docs/SPEC_CLI.md) — Python CLI 詳細仕様
- [docs/SPEC_PROJECT_STRUCTURE.md](docs/SPEC_PROJECT_STRUCTURE.md) — リポジトリ・作業フォルダ構成
- [docs/SPEC_PREPROCESS.md](docs/SPEC_PREPROCESS.md) — 前処理仕様
- [docs/SPEC_CITATION_EXTRACTION.md](docs/SPEC_CITATION_EXTRACTION.md) — 引用文献抽出仕様
- [docs/SPEC_CITATION_DB.md](docs/SPEC_CITATION_DB.md) — 文献DB照合仕様
- [docs/SPEC_LLM.md](docs/SPEC_LLM.md) — LLM接続・実行仕様
