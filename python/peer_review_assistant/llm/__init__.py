"""LLM provider abstraction and connection testing.

Supports any OpenAI-compatible chat completions API endpoint.
"""

import json
import time
import urllib.request
import urllib.error


def _sanitize_single_line(value: str) -> str:
    """Remove control characters (CR, LF, TAB, etc.) and strip whitespace."""
    return "".join(ch for ch in str(value).strip() if ch >= " " and ch not in "\r\n\t")


class LLMProvider:
    """Configuration for one LLM endpoint."""

    def __init__(self, name, provider, base_url, model, api_key):
        self.name = _sanitize_single_line(name)
        self.provider = _sanitize_single_line(provider)
        self.base_url = _sanitize_single_line(base_url).rstrip("/")
        self.model = _sanitize_single_line(model)
        self.api_key = api_key


def _normalize_temperature(provider, base_url, model, temperature):
    """Normalize temperature for providers with special requirements.

    Kimi / Moonshot only supports temperature=1.
    Returns the (possibly adjusted) temperature value.
    """
    provider_l = (provider or "").lower()
    base_l = (base_url or "").lower()
    model_l = (model or "").lower()

    if "moonshot" in provider_l or "moonshot.ai" in base_l or "kimi" in model_l:
        return 1.0

    return temperature


def chat_completion(provider, messages, max_tokens=1024, temperature=None,
                    timeout_seconds=30, thinking_enabled=False):
    """Send a chat completion request.

    Uses OpenAI-compatible API format: POST {base_url}/chat/completions

    Args:
        provider: LLMProvider instance
        messages: list of {"role": str, "content": str} dicts
        max_tokens: int
        temperature: float or None. If None, omitted from the request body.
            If provided, normalized per-provider (e.g. Kimi → 1.0).
        timeout_seconds: float, HTTP timeout (default 30)
        thinking_enabled: bool, if True adds "thinking": {"type": "enabled"}
            to the request body (used by Moonshot/Kimi K2.6 and similar
            providers that toggle reasoning via a thinking parameter rather
            than separate model names).

    Returns:
        dict with keys: ok (bool), content (str|null), model (str|null),
            usage (dict|null), error (str|null), latency_ms (int),
            reasoning_content (str|null)
    """
    base = (provider.base_url or "").strip()
    if not base or not base.startswith("http"):
        return {
            "ok": False,
            "content": None,
            "model": None,
            "usage": None,
            "error": f"Invalid base_url: {base!r}. Must be a full URL starting with http:// or https://.",
            "latency_ms": 0,
            "reasoning_content": None,
        }
    url = f"{base}/chat/completions"
    body = {
        "model": provider.model,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    if temperature is not None:
        body["temperature"] = _normalize_temperature(
            provider.provider, provider.base_url, provider.model, temperature
        )
    if thinking_enabled:
        body["thinking"] = {"type": "enabled"}

    t0 = time.time()
    status, resp_body = _http_post(url, provider.api_key, body, timeout_seconds)
    latency_ms = int((time.time() - t0) * 1000)

    if status is None:
        return {
            "ok": False,
            "content": None,
            "model": None,
            "usage": None,
            "error": f"Connection failed (timeout={timeout_seconds}s): {resp_body}" if resp_body else f"Connection failed (timeout={timeout_seconds}s): network error or timeout",
            "latency_ms": latency_ms,
        }

    if resp_body is None:
        return {
            "ok": False,
            "content": None,
            "model": None,
            "usage": None,
            "error": f"HTTP {status}: empty response",
            "latency_ms": latency_ms,
        }

    try:
        data = json.loads(resp_body)
    except json.JSONDecodeError:
        return {
            "ok": False,
            "content": None,
            "model": None,
            "usage": None,
            "error": "Invalid JSON in response",
            "latency_ms": latency_ms,
        }

    if status == 401 or status == 403:
        return {
            "ok": False,
            "content": None,
            "model": None,
            "usage": None,
            "error": "Authentication failed. Check your API key.",
            "latency_ms": latency_ms,
        }

    if status != 200:
        error_msg = data.get("error", {}).get("message", f"HTTP {status}")
        return {
            "ok": False,
            "content": None,
            "model": None,
            "usage": None,
            "error": str(error_msg),
            "latency_ms": latency_ms,
        }

    choices = data.get("choices", [])
    if not choices:
        return {
            "ok": False,
            "content": None,
            "model": data.get("model"),
            "usage": data.get("usage"),
            "error": "No choices in response",
            "latency_ms": latency_ms,
        }

    content = choices[0].get("message", {}).get("content", "")
    reasoning_content = choices[0].get("message", {}).get("reasoning_content")

    return {
        "ok": True,
        "content": content,
        "model": data.get("model"),
        "usage": data.get("usage"),
        "error": None,
        "latency_ms": latency_ms,
        "reasoning_content": reasoning_content,
    }


def test_connection(provider, thinking_enabled=False, temperature=None):
    """Test an LLM connection with a minimal ping.

    Args:
        provider: LLMProvider instance
        thinking_enabled: bool, pass thinking: {type: enabled} in the request
        temperature: float or None, passed through to chat_completion

    Returns:
        dict with keys: ok (bool), model (str|null),
            response_sample (str|null), latency_ms (int), error (str|null),
            reasoning_content (str|null)
    """
    result = chat_completion(
        provider,
        messages=[{"role": "user", "content": "Hello"}],
        max_tokens=50,
        thinking_enabled=thinking_enabled,
        temperature=temperature,
    )

    return {
        "ok": result["ok"],
        "model": result["model"],
        "response_sample": result["content"][:200] if result["content"] else None,
        "latency_ms": result["latency_ms"],
        "error": result["error"],
        "reasoning_content": result.get("reasoning_content"),
    }


def _http_post(url, api_key, body_dict, timeout_seconds=30):
    """POST JSON to an API endpoint.

    Returns:
        (status_code, body) tuple. status_code is None on network failure.
        body is response text or error string.
    """
    json_data = json.dumps(body_dict).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=json_data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "User-Agent": "PeerReviewAssistant/0.1",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
            return (resp.status, resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8")
        except Exception:
            body = None
        return (e.code, body)
    except (urllib.error.URLError, OSError) as e:
        return (None, str(e))
