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

## 6. Phase 6以降の拡張予定

Phase 6では、以下の機能が `llm/__init__.py` に追加される。

- プロンプトテンプレートシステム
- 5種類のチェック（構造・表現・方法統計・引用・独創性）ごとの専用プロンプト
- 応答の構造化パース（JSONスキーマ強制）
- リトライ・フォールバックロジック
- マルチLLM並列実行（reviewer1/2/3 同時実行）

---

## 7. 関連文書

- [SPEC.md](../SPEC.md) — 全体仕様（セクション10）
- [IMPLEMENTATION_PLAN.md](../IMPLEMENTATION_PLAN.md) — Phase 5-6 実装計画
- [SPEC_CLI.md](SPEC_CLI.md) — CLI コマンド仕様
