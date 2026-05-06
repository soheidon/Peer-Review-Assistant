# SPEC_LLM.md

# LLM接続・実行 詳細仕様

## 0. この文書の位置づけ

本書は、`SPEC.md` のセクション10で定義されたLLM接続・実行機能の詳細仕様である。LLMプロバイダ抽象化レイヤー、接続テスト、プロンプト実行の仕様を定義する。

---

## 1. LLMスロット構成

査読システムは4つのLLMスロットを持つ。

| スロット | 用途 |
|---|---|
| `summary` | 抄録・全体要約生成、統合判断 |
| `reviewer1` | 査読者1（構造、表現など主担当） |
| `reviewer2` | 査読者2（方法・統計、引用など主担当） |
| `reviewer3` | 査読者3（独創性など主担当、バックアップ） |

各スロットは以下の設定項目を持つ。

| 項目 | 型 | 説明 |
|---|---|---|
| `provider` | string | プロバイダ名（openai, anthropic, deepseek, openrouter, ollama など） |
| `base_url` | string | Chat Completions API のベースURL |
| `model` | string | モデル名（例: gpt-4o, claude-opus-4-7, deepseek-v4-pro） |
| `api_key` | string | APIキー（保存不可、実行時指定） |

---

## 2. プロバイダ抽象化

### 2.1 API形式

OpenAI互換の Chat Completions API 形式を使用する。

```
POST {base_url}/chat/completions
Content-Type: application/json
Authorization: Bearer {api_key}

{
  "model": "{model}",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "max_tokens": 1024,
  "temperature": 0.0
}
```

### 2.2 対応プロバイダ

OpenAI互換APIを提供する全プロバイダが利用可能。

| プロバイダ | デフォルト base_url |
|---|---|
| openai | `https://api.openai.com/v1` |
| deepseek | `https://api.deepseek.com/v1` |
| openrouter | `https://openrouter.ai/api/v1` |
| ollama | `http://localhost:11434/v1` |
| lmstudio | `http://localhost:1234/v1` |
| anthropic (via OpenRouter) | `https://openrouter.ai/api/v1` |

注: Anthropic Messages API（ネイティブ）は非互換のため、OpenRouter 経由またはプロキシ経由で利用する。

### 2.3 LLMProvider クラス

```python
class LLMProvider:
    def __init__(self, name, provider, base_url, model, api_key):
        self.name = name       # スロット名 (summary, reviewer1, ...)
        self.provider = provider  # プロバイダ名
        self.base_url = base_url  # API base URL
        self.model = model        # モデル名
        self.api_key = api_key    # API key
```

---

## 3. 接続テスト

### 3.1 CLI コマンド

```bash
pra-cli test-llm \
  --slot reviewer1 \
  --provider openai \
  --base-url https://api.openai.com/v1 \
  --model gpt-4o \
  --api-key sk-xxxxxxxx
```

APIキーは環境変数 `PRA_LLM_KEY_<SLOT>` でも指定可能（`--api-key` が優先）。

### 3.2 テスト内容

1. 最小限のメッセージ `[{"role": "user", "content": "Hello"}]` を送信
2. `max_tokens=50` で応答を受信
3. レイテンシ（ms）を計測
4. モデル名、応答サンプルを返却

### 3.3 成功レスポンス

```json
{
  "event": "done",
  "task": "test-llm",
  "slot": "reviewer1",
  "model": "gpt-4o-2024-08-06",
  "latency_ms": 1234,
  "response_sample": "Hello! How can I assist you today?",
  "message": "Connection to reviewer1 (gpt-4o) successful."
}
```

### 3.4 エラーレスポンス

```json
{
  "event": "error",
  "task": "test-llm",
  "slot": "reviewer1",
  "code": "LLM_AUTH_FAILED",
  "message": "Authentication failed. Check your API key.",
  "latency_ms": 567
}
```

### 3.5 エラーコード

| コード | 条件 |
|---|---|
| `NO_API_KEY` | APIキーが未指定 |
| `LLM_CONNECTION_FAILED` | ネットワークエラー、タイムアウト（30秒） |
| `LLM_AUTH_FAILED` | HTTP 401 / 403 |
| `LLM_INVALID_RESPONSE` | JSONパース失敗、choices空 |
| `LLM_PROVIDER_ERROR` | プロバイダ側のエラー（HTTP 4xx/5xx） |

---

## 4. APIキー管理

### 4.1 保存ポリシー

APIキーは**平文保存禁止**。以下の方法で管理する。

- CLI: `--api-key` フラグまたは環境変数 `PRA_LLM_KEY_<SLOT>`
- GUI: セッション中のみメモリ保持、終了時に破棄
- 将来: Windows Credential Manager / DPAPI による暗号化保存（Phase 12）

### 4.2 環境変数

```bash
export PRA_LLM_KEY_SUMMARY=sk-...
export PRA_LLM_KEY_REVIEWER1=sk-...
export PRA_LLM_KEY_REVIEWER2=sk-...
export PRA_LLM_KEY_REVIEWER3=sk-...
```

---

## 5. chat_completion 関数

汎用の chat completion リクエスト関数。

```python
def chat_completion(provider, messages, max_tokens=1024, temperature=0.0):
```

**引数**:
- `provider`: LLMProvider インスタンス
- `messages`: `[{"role": "system"|"user"|"assistant", "content": "..."}]`
- `max_tokens`: 最大生成トークン数
- `temperature`: 温度パラメータ（0.0 = 決定論的）

**戻り値**:
```python
{
    "ok": True,
    "content": "...",
    "model": "gpt-4o-2024-08-06",
    "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15},
    "error": None,
    "latency_ms": 1234,
}
```

---

## 6. Phase 6A: Structure Check (実装済み)

### 6.1 CLI コマンド

```bash
pra-cli run-check \
  --project <project_folder> \
  --check structure \
  --slot reviewer1 \
  --provider openai \
  --base-url https://api.openai.com/v1 \
  --model gpt-4o \
  --api-key sk-xxxxxxxx
```

現在 `--check structure` のみ許可。それ以外は `CHECK_NOT_IMPLEMENTED` エラー。

### 6.2 入力

| ファイル | 必須 | 説明 |
|---|---|---|
| `project.json` | yes | プロジェクトメタデータ |
| `manuscript_full.json` | yes | 全段落構造 |
| `sections/abstract.txt` | no | Abstract テキスト |
| `sections/introduction.txt` | no | Introduction テキスト |
| `sections/aim_objective.txt` | no | Aim/Objective テキスト |
| `sections/methods.txt` | no | Methods テキスト |
| `sections/results.txt` | no | Results テキスト |
| `sections/discussion.txt` | no | Discussion テキスト |
| `sections/conclusion.txt` | no | Conclusion テキスト |
| `sections/_aggregated/*.txt` | no | 統合セクションテキスト（親セクション + 全子セクションの内容）。個別の .txt が空で `section_map.json` に `has_subsections: true` が記録されている場合にフォールバックとして使用される |
| `sections/section_map.json` | no | セクション階層情報 |

親セクションの個別 .txt ファイルが空で、かつ `section_map.json` に `has_subsections: true` が記録されている場合、`sections/_aggregated/` 配下の統合ファイルが代わりに読み込まれる。これにより、Discussion の見出し直下に本文がなくても、下位セクション（major_findings, limitations など）の内容が LLM に送られる。

### 6.3 プロンプト

`llm/prompts.py` の `build_structure_check_messages()` で生成。

**System prompt**: 7項目の構造チェック指示（IMRaD構成、Abstract整合性、研究ギャップ、Aim/Objective明確性、Methods-Results対応、Discussion過剰解釈、Conclusion過剰主張）。JSON形式での出力を強制。

**User message**: セクション一覧（階層付き）+ 各セクションの本文。120K文字上限で切り詰め。

### 6.4 JSON応答パース

`llm/json_repair.py` の `parse_llm_json()` で以下の手順で抽出:

1. 全体を直接 `json.loads` 試行
2. ```` ```json ... ``` ```` ブロックから抽出
3. ```` ``` ... ``` ```` 汎用ブロックから抽出  
4. 最も外側の `{ ... }` を抽出

### 6.5 出力

`outputs/structure/{slot}.raw.json`:

```json
{
  "check_name": "structure",
  "source": "reviewer1",
  "status": "done",
  "generated_at": "2026-05-07T12:00:00+09:00",
  "model": "gpt-4o-2024-08-06",
  "summary": "Overall assessment...",
  "findings": [
    {
      "finding_id": "structure_reviewer1_001",
      "severity": "major",
      "category": "Structure",
      "location": {
        "section": "Introduction",
        "paragraph_start": 3,
        "paragraph_end": 5,
        "text_excerpt": "..."
      },
      "issue": "The research gap is not clearly articulated.",
      "suggested_comment": "Lines 45-72: Please clarify...",
      "confidence": "high"
    }
  ]
}
```

### 6.6 エラーコード

| コード | 条件 |
|---|---|
| `NO_PROJECT` | project.json が存在しない |
| `CHECK_NOT_IMPLEMENTED` | structure 以外のチェックが指定された |
| `NO_API_KEY` | APIキー未指定（--api-keyも環境変数もなし） |
| `NO_MANUSCRIPT_JSON` | manuscript_full.json が存在しない |
| `LLM_CONNECTION_FAILED` | LLM呼び出し失敗（ネットワーク、認証等） |
| `LLM_INVALID_JSON` | LLM応答からJSONを抽出できなかった |

### 6.7 ログ

`logs/llm_calls.log` に追記。APIキーは先頭4文字+末尾4文字のみ記録（`key=sk-a...B1cD`）。

---

## 7. Phase 6B-6E 拡張予定

Phase 6A完了後、以下のチェックを順次追加:

- expression check（表現・文法・学術英語）
- methods_stats check（方法・統計）
- citation check（引用妥当性）
- originality check（独創性・類似性）

各チェックは `run-check --check <name>` で実行され、プロンプトは `llm/prompts.py` に追加される。

---

## 8. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様（セクション10）
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) — Phase 5-6 実装計画
- [SPEC_CLI.md](SPEC_CLI.md) — CLI コマンド仕様
