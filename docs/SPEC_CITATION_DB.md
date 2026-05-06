# SPEC_CITATION_DB.md

# 文献DB照合 詳細仕様

## 0. この文書の位置づけ

本書は、`SPEC.md` のセクション11.4で定義された引用チェック機能のうち、Phase 4（文献DB照合）の詳細仕様である。Phase 3（引用抽出）の出力 `references_split.json` を入力とし、各文献の実在性と書誌情報の正確性を外部DBで確認する。

Phase 4 は以下のサブフェーズに分割する。

| フェーズ | 内容 | 状態 |
|---|---|---|
| 4A | Crossref 照合 | 実装済 |
| 4B | PubMed 照合 | 予定 |
| 4C | Semantic Scholar 照合 | 予定 |
| 4D | OpenAlex 照合 | 予定 |
| 4E | 統合 db_verified_references.json 生成 | 予定 |

---

## 1. Phase 4A: Crossref 照合

### 1.1 目的

`references_split.json` の各文献について、Crossref API で実在性を確認し、書誌情報の正確性を検証する。

### 1.2 CLI コマンド

```bash
pra-cli citation-db-crossref --project <project_folder>
```

### 1.3 入力

- `citations/references_split.json`（Phase 3 の出力）

### 1.4 照合ロジック

各 reference について、以下の優先順位で照合する。

1. **DOI 照合**: `parsed.doi` が存在する場合 → `GET https://api.crossref.org/works/{doi}`
2. **タイトル検索**: DOI がない場合 → `GET https://api.crossref.org/works?query={title}+{author}&rows=3&filter=year:{year}`

#### 比較判定

| フィールド | 判定値 | 条件 |
|---|---|---|
| `exists` | true / false / unknown | Crossref にレコードが存在するか |
| `matched_by` | "doi" / "title_search" / "none" | 照合方法 |
| `title_match` | "exact" / "fuzzy" / "mismatch" / "unknown" | 正規化後の文字列比較 + Jaccard 類似度 |
| `authors_match` | "exact" / "partial" / "mismatch" / "unknown" | 姓の集合比較 |
| `year_match` | true / false / unknown | 年号の一致 |
| `journal_match` | "exact" / "fuzzy" / "mismatch" / "unknown" | ジャーナル名の正規化比較 |
| `metadata_errors` | string[] | 不一致項目の説明文リスト |

#### タイトル比較詳細

- 正規化: 小文字化、句読点除去、連続空白の圧縮
- exact: 正規化後文字列が完全一致
- fuzzy: 一方が他方の部分文字列、または Jaccard 類似度（単語集合）≧ 0.7
- mismatch: 上記以外
- unknown: いずれかのタイトルが null

#### 著者比較詳細

- 姓の抽出: "Smith", "Smith John", "Smith J." → surname="smith"
- exact: 双方の姓集合が完全一致
- partial: 少なくとも1つの姓が一致
- mismatch: 姓が1つも一致しない
- unknown: いずれかの著者リストが空

### 1.5 出力ファイル

#### citations/db_crossref_results.json

全照合結果（matched + unmatched + error）。

```json
{
  "total_verified": 2,
  "matched_count": 1,
  "unmatched_count": 1,
  "items": [
    {
      "reference_id": "R001",
      "status": "matched",
      "method": "title_search",
      "db_source": "Crossref",
      "original": { "reference_id": "R001", "raw_text": "...", "parsed": {...}, "parse_confidence": "high" },
      "crossref_result": {
        "title": "Online music intervention for children with anxiety",
        "authors": ["Smith John", "Brown Kate"],
        "year": 2021,
        "journal": "Journal Name",
        "volume": "10",
        "issue": "2",
        "pages": "100-110",
        "doi": "10.1234/example",
        "type": "journal-article"
      },
      "comparison": {
        "exists": true,
        "matched_by": "title_search",
        "title_match": "exact",
        "authors_match": "partial",
        "year_match": true,
        "journal_match": "exact",
        "metadata_errors": []
      },
      "error": null
    }
  ]
}
```

#### citations/db_verified_references.json（matched のみ）

```json
{
  "items": [ ... ]
}
```

#### citations/db_unmatched_references.json（unmatched + error）

```json
{
  "items": [ ... ]
}
```

### 1.6 レート制限とリトライ

- リクエスト間隔: 1.0秒
- 最大リトライ回数: 3回
- バックオフ: 指数（2^attempt 秒）
- タイムアウト: 15秒
- HTTP 404 はリトライしない（有効なレスポンスとして扱う）

### 1.7 エラーコード

| コード | 条件 |
|---|---|
| `NO_PROJECT` | `project.json` が存在しない |
| `NO_REFERENCES_SPLIT` | `citations/references_split.json` が存在しない |
| `CROSSREF_REQUEST_FAILED` | ネットワークエラー（3回リトライ後） |
| `CROSSREF_PARSE_ERROR` | Crossref レスポンスのJSONパース失敗 |

### 1.8 ステータス更新

#### task_status.json

```json
{ "citation_db": "done" }
```

#### citation_db.log

```
[2026-05-07T...] citation-db-crossref: matched=1, unmatched=1
```

---

## 2. Phase 4B: PubMed 照合（予定）

PMID または title + author で PubMed E-utilities API に問い合わせる。

---

## 3. Phase 4C: Semantic Scholar 照合（予定）

DOI または title で Semantic Scholar API に問い合わせる。

---

## 4. Phase 4D: OpenAlex 照合（予定）

DOI または title で OpenAlex API に問い合わせる。

---

## 5. Phase 4E: 統合 db_verified_references.json（予定）

4つのDB照合結果を統合し、最終的な `db_verified_references.json` を生成する。

- `sources` フィールドに全DBの結果を集約
- 複数DBで確認された項目は信頼度を上げる
- DB間で矛盾がある場合は `metadata_errors` に記録

---

## 6. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様（セクション11.4）
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) — Phase 4 実装計画
- [SPEC_CLI.md](SPEC_CLI.md) — CLI コマンド仕様
- [SPEC_CITATION_EXTRACTION.md](SPEC_CITATION_EXTRACTION.md) — 引用抽出仕様（Phase 3）
