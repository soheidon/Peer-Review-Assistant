# Peer Review Assistant / 査読アシスタント

学術雑誌の査読者が受け取った原稿を読み、査読コメントを作成する作業を支援するデスクトップアプリケーションです。

## 概要

- docx 原稿と、Word から保存した行番号付き PDF を入力します
- 原稿の構成、表現、方法・統計、引用文献、先行研究との関係を点検します
- 複数の LLM と文献データベース（PubMed, Semantic Scholar, Crossref, OpenAlex）を組み合わせて分析します
- 行番号付きまたは段落・文番号付きの査読コメントを Markdown 形式で出力します

本ツールは査読者の判断を代替しません。査読者が原稿を理解し、問題点を整理し、著者向けコメントおよび編集者向けコメントを作成するための補助ツールです。

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

1. 査読用 docx を Word で開き、行番号付き PDF として保存する
2. Peer Review Assistant を起動する
3. 作業フォルダを作成する
4. 前処理画面で docx と PDF を指定し、前処理を実行する
5. API 設定画面で LLM の接続設定を行う
6. 各チェック項目（構成、表現、方法・統計、引用文献、類似性・新規性）を実行する
7. 最終マージを実行し、査読コメントを出力する

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

> 未定

## 開発ドキュメント

- [SPEC.md](SPEC.md) — 全体仕様
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — 実装フェーズ別仕様
- [docs/SPEC_CLI.md](docs/SPEC_CLI.md) — Python CLI 詳細仕様
- [docs/SPEC_PROJECT_STRUCTURE.md](docs/SPEC_PROJECT_STRUCTURE.md) — リポジトリ・作業フォルダ構成
- [docs/implementation_logs/](docs/implementation_logs/) — 実装ログ
