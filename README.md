# Peer Review Assistant / 査読アシスタント

学術雑誌の査読者が受け取った原稿を読み、査読コメントを作成する作業を支援するデスクトップアプリケーションです。

## 概要

- docx 原稿と、Word から保存した行番号付き PDF を入力します（PDF は任意）
- 原稿の構成、表現、方法・統計、引用文献、先行研究との関係を点検します
- 複数の LLM と文献データベース（PubMed, Semantic Scholar, Crossref, OpenAlex）を組み合わせて分析します
- 行番号付きまたは段落・文番号付きの査読コメントを Markdown 形式で出力します

本ツールは査読者の判断を代替しません。査読者が原稿を理解し、問題点を整理し、著者向けコメントおよび編集者向けコメントを作成するための補助ツールです。

## 現在の状態

**v0.1.0** — GUI 基盤とプロジェクト管理が実装済み。以下の機能が利用可能です：

- プロジェクトの作成・開く
- docx/PDF ファイルの検証と取り込み（3入力モード対応）
- システムヘルスチェック
- 進捗サマリー表示
- LLM スロット設定・接続テスト

前処理パイプライン、文献DB照合、LLM チェック実行は次フェーズで実装予定です。

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

MIT License — 詳細は [LICENSE](LICENSE) を参照してください。

## 開発ドキュメント

- [SPEC.md](SPEC.md) — 全体仕様（機能別）
- [docs/SPEC_CLI.md](docs/SPEC_CLI.md) — Python CLI 詳細仕様
- [docs/SPEC_PROJECT_STRUCTURE.md](docs/SPEC_PROJECT_STRUCTURE.md) — リポジトリ・作業フォルダ構成
- [docs/SPEC_PREPROCESS.md](docs/SPEC_PREPROCESS.md) — 前処理仕様
- [docs/SPEC_CITATION_EXTRACTION.md](docs/SPEC_CITATION_EXTRACTION.md) — 引用文献抽出仕様
- [docs/SPEC_CITATION_DB.md](docs/SPEC_CITATION_DB.md) — 文献DB照合仕様
- [docs/SPEC_LLM.md](docs/SPEC_LLM.md) — LLM接続・実行仕様
