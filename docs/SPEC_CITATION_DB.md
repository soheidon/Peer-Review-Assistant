# SPEC_CITATION_DB.md

# 文献DB照合 詳細仕様

## 0. この文書の位置づけ

本書は、`SPEC.md` のセクション6.3で定義された文献DB照合機能の詳細仕様である。Phase 3（引用抽出）の出力 `references_split.json` を入力とし、各文献の実在性と書誌情報の正確性を外部DBで確認する。

Phase 4 は以下のサブフェーズに分割する。

| フェーズ | 内容 | 状態 |
|---|---|---|
| 4A | Crossref 照合 | 実装済 |
| 4B | PubMed 照合 | 実装済 |
| 4C | Google Books 書籍候補検索 | 実装済 |
| 4D | Semantic Scholar 照合 | 実装済 |
| 4E | CiNii Research 照合（日本語文献） | 実装済 |
| 4F | 文献確認データ生成（統合 viewer_data.json） | 実装済 |

### カスケード実行順序

```
Crossref → PubMed → Google Books → Semantic Scholar → CiNii → 文献確認データ生成
```

Semantic Scholar と CiNii は **最終手段** として動作する。Crossref/PubMed/Google Books で既に照合された文献はスキップし、未照合文献のみを対象とする（API負荷軽減のため）。

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

### 1.5 レート制限とリトライ

- リクエスト間隔: 1.0秒
- 最大リトライ回数: 3回
- バックオフ: 指数（2^attempt 秒）
- タイムアウト: 15秒
- HTTP 404 はリトライしない（有効なレスポンスとして扱う）

---

## 2. Phase 4B: PubMed 照合

### 2.1 目的

PMID または title + author で PubMed E-utilities API に問い合わせ、医学・生命科学分野の文献実在性を確認する。

### 2.2 CLI コマンド

```bash
pra-cli citation-db-pubmed --project <project_folder>
```

### 2.3 照合ロジック

1. **PMID 照合**: `parsed.pmid` が存在する場合 → `GET https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi`
2. **タイトル検索**: PMID がない場合 → `esearch.fcgi` でタイトル検索

DOI がある場合は DOI 経由でも検索する。

### 2.4 判定

Crossref と同様の比較判定（タイトル、著者、年、ジャーナル名）を実施する。

---

## 3. Phase 4C: Google Books 書籍候補検索

### 3.1 目的

学術書、政府文書、Web文書など、論文DBでは見つからない文献の実在性を Google Books API で確認する。

### 3.2 CLI コマンド

```bash
pra-cli citation-db-google-books --project <project_folder>
```

### 3.3 照合ロジック

LLMによる文献再パース結果を利用し、書籍と判定された文献（`suspected_reason: "book"`, `"gov_doc"`, `"web_doc"`）を対象に Google Books API でタイトル+著者検索を行う。

### 3.4 出力

- `citations/db_google_books_candidates.json`: 候補書籍のリスト（`best_candidate`, `all_candidates`）

---

## 4. Phase 4D: Semantic Scholar 照合（最終手段）

### 4.1 目的

Crossref、PubMed、Google Books で照合できなかった英語文献に対して、Semantic Scholar Academic Graph API で最終的な照合を試みる。

### 4.2 CLI コマンド

```bash
pra-cli citation-db-semantic-scholar --project <project_folder> [--api-key <key>] [--api-key-env <env_var>]
```

### 4.3 最終手段フィルタリング

Semantic Scholar の API 負荷を軽減するため、**既に照合済みの文献はスキップ**する：

1. `db_verified_references.json` に含まれる reference_id → スキップ
2. `db_google_books_candidates.json` に候補がある reference_id → スキップ
3. 残った未照合文献のみ API に問い合わせ

### 4.4 照合ロジック

DOI/PMID のない未照合文献を対象に、以下の戦略で検索：

1. title + first_author + year → 検索
2. title + year（1が失敗時）→ 検索
3. title only（2が失敗時）→ 検索

### 4.5 レート制限

- リクエスト間隔: 1.0秒
- APIフィールド: `title,authors,year,journal,externalIds,publicationTypes`

### 4.6 出力

- `citations/db_semantic_scholar_results.json`: 照合結果
- 照合成功時は `db_verified_references.json` にマージされる

---

## 5. Phase 4E: CiNii Research 照合（日本語文献）

### 5.1 目的

CiNii Research OpenSearch API を使用し、日本語文献の実在性を確認する。

### 5.2 CLI コマンド

```bash
pra-cli citation-db-cinii --project <project_folder> [--appid <app_id>] [--appid-env <env_var>]
```

### 5.3 最終手段フィルタリング

Semantic Scholar と同様に、既照合文献はスキップする。

### 5.4 照合ロジック

DOI/PMID のない未照合文献を対象に、タイトル+著者で CiNii Research OpenSearch API に問い合わせる。

### 5.5 出力

- `citations/db_cinii_results.json`: 照合結果
- 照合成功時は `db_verified_references.json` にマージされる

---

## 6. Phase 4F: 文献確認データ生成

### 6.1 目的

全DB照合結果、LLMパース結果、LLMフラグ、人手確認結果を統合し、GUIの文献確認ビューア用データを生成する。

### 6.2 CLI コマンド

```bash
pra-cli citation-viewer-data --project <project_folder>
```

### 6.3 入力

- `citations/references_split.json`
- `citations/db_verified_references.json`
- `citations/db_crossref_results.json`
- `citations/db_pubmed_results.json`
- `citations/db_google_books_candidates.json`
- `citations/db_semantic_scholar_results.json`
- `citations/db_cinii_results.json`
- `citations/llm_reference_repair_results.json`
- `citations/llm_reference_flags.json`
- `citations/human_verification_status.json`
- `citations/llm_search_results.json`

### 6.4 出力

- `outputs/citation_viewer_data.json`: ビューア用統合データ

### 6.5 ステータス判定の優先順位

```text
1. human_verification_status（人手確認）→ verified（最優先）
2. suspicious_ids（自動フラグ: DOI欠落、著者不一致等）→ suspicious
3. verified_ids（DB照合成功）→ verified
4. LLM検索 高信頼度 → verified
5. DB照合 error → error
6. DB照合 matched → verified
7. 上記以外 → unmatched
```

人手確認（`human_verification_status`）が `suspicious_ids` より優先されるため、要確認タブでチェックを入れると自動的に確認済タブに移動する。

### 6.6 タブ分類

| タブ | 条件 |
|---|---|
| 確認済 (verified) | `card["status"] == "verified"` |
| 要確認 (suspicious) | `status == "suspicious"` かつ verified でない |
| 未照合 (unmatched) | 上記いずれでもなく、保留でもない |
| LLM補正候補 (repaired) | `card.llm_candidate` あり |
| Google Books | `card.google_books_candidates` あり |
| Semantic Scholar | Semantic Scholar 照合あり |
| 後段LLM確認 (later_llm) | `llm_flags.needs_later_llm_check` |
| 保留 (deferred) | 保留マップに含まれる |

---

## 7. 出力ファイル一覧

| ファイル | 内容 |
|---|---|
| `citations/db_crossref_results.json` | Crossref 全照合結果 |
| `citations/db_pubmed_results.json` | PubMed 全照合結果 |
| `citations/db_google_books_candidates.json` | Google Books 書籍候補 |
| `citations/db_semantic_scholar_results.json` | Semantic Scholar 照合結果 |
| `citations/db_cinii_results.json` | CiNii 照合結果 |
| `citations/db_verified_references.json` | 全DB統合・照合成功文献 |
| `citations/db_unmatched_references.json` | 未照合文献 |
| `citations/db_search_log.json` | LLM文献検索ログ |
| `citations/llm_reference_repair_results.json` | LLM文献再パース結果 |
| `citations/llm_reference_flags.json` | LLM文献フラグ |
| `citations/llm_search_results.json` | LLM文献検索結果 |
| `citations/human_verification_status.json` | 人手確認ステータス |
| `outputs/citation_viewer_data.json` | ビューア用統合データ |

---

## 8. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様（セクション6.3-6.4）
- [SPEC_CLI.md](SPEC_CLI.md) — CLI コマンド仕様
- [SPEC_CITATION_EXTRACTION.md](SPEC_CITATION_EXTRACTION.md) — 引用抽出仕様（Phase 3）
