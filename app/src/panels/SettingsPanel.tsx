import React from "react";
import { SLOT_LABELS, SLOT_DESCRIPTIONS, slotDisplayName } from "../slotLabels";
import { parseLooseJsonObject, sanitizeSingleLine } from "../utils";

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  proModel: string;
  flashModel: string;
  reasoningMode: "separate_models" | "same_model_with_thinking" | "none_or_unknown";
  apiKey: string;
  apiKeyMode: "direct" | "env_var";
  apiKeyEnvName: string;
  apiKeyStorage: "none" | "windows_hello";
  enabled: boolean;
}

interface SettingsPanelProps {
  llmSlots: LlmSlot[];
  llmProTestResults: Record<string, string>;
  llmFlashTestResults: Record<string, string>;
  llmEnvCheckResults: Record<string, string>;
  llmProReasoningResults: Record<string, boolean>;
  llmTestErrorMessages: Record<string, string>;
  windowsHelloAvailable: boolean;
  windowsHelloStatus: Record<string, "not_saved" | "saved">;
  windowsHelloDecrypted: Set<string>;
  onLockSecrets: () => void;
  onWindowsHelloSave: (slotName: string, apiKey: string) => Promise<boolean>;
  onWindowsHelloDecrypt: (slotName: string) => Promise<string | null>;
  onWindowsHelloDelete: (slotName: string) => Promise<boolean>;
  onUpdateSlot: (slotName: string, field: string, value: string | boolean) => void;
  onTestSlot: (slotName: string, modelVariant: "pro" | "flash") => void;
  onCheckLlmEnv: (slotName: string) => void;
  onTestAll: () => void;
  testAllProgress: string;
  onSaveAppSettings: () => void;
  // Google Books
  googleBooksApiKey: string;
  onGoogleBooksApiKeyChange: (value: string) => void;
  googleBooksApiKeyMode: "direct" | "env_var";
  onGoogleBooksApiKeyModeChange: (mode: "direct" | "env_var") => void;
  googleBooksApiKeyEnvName: string;
  onGoogleBooksApiKeyEnvNameChange: (name: string) => void;
  gbEnvCheckResult: string;
  onCheckGbEnv: () => void;
  gbConnectionTestResult: string;
  onTestGbConnection: () => void;
  googleBooksEnabled: boolean;
  onGoogleBooksEnabledChange: (v: boolean) => void;
  // Semantic Scholar
  semanticScholarApiKey: string;
  onSemanticScholarApiKeyChange: (value: string) => void;
  semanticScholarApiKeyMode: "direct" | "env_var";
  onSemanticScholarApiKeyModeChange: (mode: "direct" | "env_var") => void;
  semanticScholarApiKeyEnvName: string;
  onSemanticScholarApiKeyEnvNameChange: (name: string) => void;
  ssEnvCheckResult: string;
  onCheckSsEnv: () => void;
  ssConnectionTestResult: string;
  onTestSsConnection: () => void;
  semanticScholarEnabled: boolean;
  onSemanticScholarEnabledChange: (v: boolean) => void;
  // PubMed / NCBI
  pubmedApiKey: string;
  onPubmedApiKeyChange: (value: string) => void;
  pubmedApiKeyMode: "direct" | "env_var";
  onPubmedApiKeyModeChange: (mode: "direct" | "env_var") => void;
  pubmedApiKeyEnvName: string;
  onPubmedApiKeyEnvNameChange: (name: string) => void;
  pubmedEnvCheckResult: string;
  onCheckPubmedEnv: () => void;
  pubmedConnectionTestResult: string;
  onTestPubmedConnection: () => void;
  pubmedEnabled: boolean;
  onPubmedEnabledChange: (v: boolean) => void;
  // CiNii Research
  ciniiAppid: string;
  onCiniiAppidChange: (appid: string) => void;
  ciniiEnabled: boolean;
  onCiniiEnabledChange: (v: boolean) => void;
}

/* ── Tiny helpers ─────────────────────────────────────────────────── */

function TestChip({ result, showReasoning, hasReasoning, errorMessage }: {
  result: string | undefined;
  showReasoning?: boolean;
  hasReasoning?: boolean;
  errorMessage?: string;
}) {
  if (!result) return <span className="status-chip unrun">未確認</span>;
  if (result === "testing") return <span className="status-chip running">確認中...</span>;
  if (result === "ok") {
    if (showReasoning && hasReasoning) return <span className="status-chip ok">接続可・推論あり</span>;
    if (showReasoning && hasReasoning === false) return <span className="status-chip ok">接続可・推論未確認</span>;
    return <span className="status-chip ok">接続可</span>;
  }
  // Show detailed error when available
  if (errorMessage) {
    return <span className="status-chip err" title={errorMessage}>接続不可：{errorMessage}</span>;
  }
  return <span className="status-chip err">接続不可</span>;
}

/* ── Model lookup modal ───────────────────────────────────────────── */

function ModelLookupModal({
  slotName,
  onClose,
  onApplyToSlot,
}: {
  slotName: string;
  onClose: () => void;
  onApplyToSlot: (slotName: string, fields: Record<string, string>) => void;
}) {
  const [input, setInput] = React.useState("");
  const [prompt, setPrompt] = React.useState("");
  const [pasteText, setPasteText] = React.useState("");
  const [preview, setPreview] = React.useState<Record<string, string> | null>(null);
  const [error, setError] = React.useState("");

  const generatePrompt = () => {
    if (!input.trim()) return;
    const p = [
      `次のLLMサービスについて、OpenAI-compatible APIで使用するための設定を調べてください。`,
      ``,
      `サービス名・モデル系列：`,
      `${input.trim()}`,
      ``,
      `調べる項目：`,
      `1. provider名として設定すべき短い識別子`,
      `2. OpenAI-compatible Base URL`,
      `3. Pro / reasoning / 高精度モデル名`,
      `4. Flash / fast / 低コストモデル名`,
      `5. APIキー環境変数名の推奨`,
      `6. 注意点`,
      ``,
      `出力は以下のJSONのみとしてください。`,
      ``,
      `\`\`\`json`,
      JSON.stringify({
        provider: "",
        base_url: "",
        pro_model: "",
        flash_model: "",
        recommended_api_key_env: "",
        notes: "",
      }, null, 2),
      `\`\`\``,
      ``,
      `不明な項目は unknown としてください。`,
      `推測で埋めないでください。`,
      `公式ドキュメントまたは提供元情報を優先してください。`,
    ].join("\n");
    setPrompt(p);
  };

  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(prompt); } catch { /* ignore */ }
  };

  const parseResult = () => {
    const text = pasteText.trim();
    if (!text) {
      setError("結果を貼り付けてください。");
      return;
    }
    const result = parseLooseJsonObject(text);
    if (result.ok && result.value) {
      const parsed = result.value;
      setPreview({
        provider: typeof parsed.provider === "string" ? parsed.provider : "",
        baseUrl: typeof parsed.base_url === "string" ? parsed.base_url : "",
        proModel: typeof parsed.pro_model === "string" ? parsed.pro_model : "",
        flashModel: typeof parsed.flash_model === "string" ? parsed.flash_model : "",
        apiKeyEnvName: typeof parsed.recommended_api_key_env === "string" ? parsed.recommended_api_key_env : "",
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
      });
      setError(result.warnings.length > 0 ? result.warnings.join("\n") : "");
    } else {
      setError(result.error || "JSONパースに失敗しました。");
    }
  };

  const applyToSlot = () => {
    if (!preview) return;
    onApplyToSlot(slotName, preview);
  };

  const clearAll = () => {
    setPasteText("");
    setPreview(null);
    setError("");
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.35)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const modalStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 8, padding: 20,
    width: 660, maxHeight: "85vh", overflowY: "auto",
    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>プロバイダ・モデル名検索支援</h3>
          <button onClick={onClose} style={{ fontSize: 11 }}>閉じる</button>
        </div>
        <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px 0" }}>
          適用先スロット: <strong>{SLOT_LABELS[slotName] || slotName}</strong>
        </p>

        {/* Input */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 600 }}>サービス名・モデル系列</label>
          <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="例: OpenAI GPT-4.1, Claude Sonnet, Gemini 2.5 Pro, Kimi K2.6"
              style={{ flex: 1, fontSize: 11, padding: "4px 8px" }}
            />
            <button onClick={generatePrompt} disabled={!input.trim()} style={{ fontSize: 11, whiteSpace: "nowrap" }}>
              外部AI用プロンプトを作成
            </button>
          </div>
        </div>

        {/* Prompt */}
        {prompt && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600 }}>プロンプト</span>
              <button onClick={copyPrompt} style={{ fontSize: 11, padding: "2px 8px" }}>コピー</button>
            </div>
            <pre style={{
              background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 4,
              padding: 8, fontSize: 11, maxHeight: 160, overflowY: "auto",
              whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
            }}>
              {prompt}
            </pre>
          </div>
        )}

        {/* Paste area — always editable */}
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 600 }}>回答を貼り付け</label>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="ChatGPT/Geminiなどで取得した結果を貼り付けてください（JSON以外の説明文が混ざっていても抽出します）..."
            style={{ width: "100%", minHeight: 80, fontSize: 11, marginTop: 2 }}
          />
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
            <button onClick={parseResult} disabled={!pasteText.trim()} style={{ fontSize: 11 }}>
              パース
            </button>
            <button onClick={clearAll} style={{ fontSize: 11 }}>クリア</button>
            {error && (
              <span style={{ fontSize: 11, color: "#c42b1c", whiteSpace: "pre-wrap", flex: 1 }}>
                {error}
              </span>
            )}
          </div>
        </div>

        {/* Preview — stays visible after first parse until close */}
        {preview && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "#107c10", marginBottom: 4 }}>
              プレビュー
            </div>
            <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
              <tbody>
                {([
                  ["Provider", "provider"],
                  ["Base URL", "baseUrl"],
                  ["Proモデル", "proModel"],
                  ["Flashモデル", "flashModel"],
                  ["環境変数名", "apiKeyEnvName"],
                  ["備考", "notes"],
                ] as [string, string][]).map(([label, key]) => (
                  <tr key={key}>
                    <td style={{ padding: "2px 8px 2px 0", fontWeight: 600, color: "#555", whiteSpace: "nowrap" }}>{label}</td>
                    <td style={{ padding: "2px 0" }}>{preview[key] || "(空欄)"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={applyToSlot} style={{ marginTop: 8, fontSize: 11, fontWeight: 600 }}>
              現在のスロットに反映
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Windows Hello storage section (per-slot) ────────────────────── */

function WindowsHelloStorageSection({
  slotName,
  apiKey,
  status,
  decrypted,
  onSave,
  onDecrypt,
  onDelete,
}: {
  slotName: string;
  apiKey: string;
  status: "not_saved" | "saved";
  decrypted: boolean;
  onSave: (slotName: string, apiKey: string) => Promise<boolean>;
  onDecrypt: (slotName: string) => Promise<string | null>;
  onDelete: (slotName: string) => Promise<boolean>;
}) {
  const [saving, setSaving] = React.useState(false);
  const [decrypting, setDecrypting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const statusText = decrypted && apiKey.trim()
    ? "復号済み（メモリ上）"
    : status === "saved"
      ? "Windows Helloで保護・保存済み"
      : "未保存";

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <button
          onClick={async () => { setSaving(true); await onSave(slotName, apiKey); setSaving(false); }}
          disabled={saving || !apiKey.trim()}
          style={{ fontSize: 11, whiteSpace: "nowrap" }}
        >
          {saving ? "保存中..." : "Windows Helloで保存"}
        </button>
        <button
          onClick={async () => { setDecrypting(true); await onDecrypt(slotName); setDecrypting(false); }}
          disabled={decrypting || status !== "saved"}
          style={{ fontSize: 11, whiteSpace: "nowrap" }}
        >
          {decrypting ? "復号中..." : "Windows Helloで復号"}
        </button>
        <button
          onClick={async () => { setDeleting(true); await onDelete(slotName); setDeleting(false); }}
          disabled={deleting || status !== "saved"}
          style={{ fontSize: 11, color: "#c42b1c", whiteSpace: "nowrap" }}
        >
          {deleting ? "削除中..." : "保存済みAPIキーを削除"}
        </button>
      </div>
      <p style={{
        fontSize: 12, fontWeight: 600, margin: "4px 0 0 0",
        color: decrypted ? "#1a73e8" : status === "saved" ? "#107c10" : "#888",
      }}>
        {statusText}
      </p>
      <p style={{ fontSize: 10, color: "#888", margin: "2px 0 0 0" }}>
        保存時・復号時にWindows Hello / PIN / パスキー確認が要求されます。
      </p>
    </div>
  );
}

/* ── One slot card (compact) ──────────────────────────────────────── */

function SlotCard({
  slot,
  proTestResult,
  flashTestResult,
  envCheckResult,
  hasReasoning,
  helloStatus,
  helloAvailable,
  helloDecrypted,
  proTestError,
  flashTestError,
  reasoningWarning,
  onUpdateSlot,
  onTestSlot,
  onCheckLlmEnv,
  onOpenLookup,
  onWindowsHelloSave,
  onWindowsHelloDecrypt,
  onWindowsHelloDelete,
}: {
  slot: LlmSlot;
  proTestResult: string | undefined;
  flashTestResult: string | undefined;
  envCheckResult: string | undefined;
  hasReasoning: boolean | undefined;
  helloStatus: "not_saved" | "saved";
  helloAvailable: boolean;
  helloDecrypted: boolean;
  proTestError?: string;
  flashTestError?: string;
  reasoningWarning?: string;
  onUpdateSlot: (slotName: string, field: string, value: string | boolean) => void;
  onTestSlot: (slotName: string, modelVariant: "pro" | "flash") => void;
  onCheckLlmEnv: (slotName: string) => void;
  onOpenLookup: (slotName: string) => void;
  onWindowsHelloSave: (slotName: string, apiKey: string) => Promise<boolean>;
  onWindowsHelloDecrypt: (slotName: string) => Promise<string | null>;
  onWindowsHelloDelete: (slotName: string) => Promise<boolean>;
}) {
  const slotDisabled = !slot.enabled;
  const isSameModel = slot.reasoningMode === "same_model_with_thinking";

  // Kimi/Moonshot detection for warning
  const isKimiMoonshot = (
    /kimi|moonshot/i.test(slot.provider) ||
    /moonshot\.ai/i.test(slot.baseUrl)
  );
  const showKimiWarning = isKimiMoonshot && !isSameModel;

  const inputS: React.CSSProperties = {
    fontSize: 12, padding: "3px 6px", border: "1px solid #ccc", borderRadius: 3,
  };

  const testBtnS: React.CSSProperties = {
    fontSize: 11, padding: "2px 8px", whiteSpace: "nowrap",
  };

  const labelS: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, display: "block", marginBottom: 1,
  };

  const faint = slotDisabled ? { opacity: 0.45, pointerEvents: "none" as const } : undefined;

  /** When same_model_with_thinking, keep proModel and flashModel in sync. */
  const updateModel = (value: string) => {
    onUpdateSlot(slot.name, "proModel", value);
    onUpdateSlot(slot.name, "flashModel", value);
  };

  return (
    <div
      style={{
        border: "1px solid #e0e0e0",
        borderRadius: 6,
        padding: "10px 14px",
        marginBottom: 10,
        background: "#fff",
        opacity: slotDisabled ? 0.5 : 1,
      }}
    >
      {/* ── Row 1: header ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={slot.enabled}
            onChange={(e) => onUpdateSlot(slot.name, "enabled", e.target.checked)}
          />
          <span style={{ fontSize: 13, fontWeight: 700 }}>
            {SLOT_LABELS[slot.name] || slot.name}
          </span>
        </label>
        <span style={{ fontSize: 11, color: "#888", flex: 1 }}>
          {SLOT_DESCRIPTIONS[slot.name]}
        </span>
        <button
          style={{ fontSize: 11, padding: "1px 8px", whiteSpace: "nowrap" }}
          onClick={() => onOpenLookup(slot.name)}
        >
          モデル名を調べる
        </button>
      </div>

      <div style={faint}>
        {/* ── Row 2: Provider + Base URL ── */}
        <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
          <input
            type="text"
            value={slot.provider}
            onChange={(e) => onUpdateSlot(slot.name, "provider", sanitizeSingleLine(e.target.value))}
            placeholder="プロバイダ"
            style={{ ...inputS, flex: 1 }}
          />
          <input
            type="text"
            value={slot.baseUrl}
            onChange={(e) => onUpdateSlot(slot.name, "baseUrl", sanitizeSingleLine(e.target.value))}
            placeholder="Base URL"
            style={{ ...inputS, flex: 3 }}
          />
        </div>

        {/* ── Row 2.5: モデル切替方式 ── */}
        <div style={{
          border: "1px solid #eee", borderRadius: 4,
          padding: "4px 10px", background: "#fafafa", marginBottom: 6,
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#555", marginRight: 10 }}>
            モデル切替方式
          </span>
          <label style={{ fontSize: 12, cursor: "pointer", marginRight: 10, display: "inline-flex", alignItems: "center", gap: 2 }}>
            <input
              type="radio"
              name={`${slot.name}-reasoning`}
              value="separate_models"
              checked={slot.reasoningMode === "separate_models"}
              onChange={() => onUpdateSlot(slot.name, "reasoningMode", "separate_models")}
            />
            Pro/Flashで別モデル名
          </label>
          <label style={{ fontSize: 12, cursor: "pointer", marginRight: 10, display: "inline-flex", alignItems: "center", gap: 2 }}>
            <input
              type="radio"
              name={`${slot.name}-reasoning`}
              value="same_model_with_thinking"
              checked={slot.reasoningMode === "same_model_with_thinking"}
              onChange={() => onUpdateSlot(slot.name, "reasoningMode", "same_model_with_thinking")}
            />
            同一モデル + thinking
          </label>
          <label style={{ fontSize: 12, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2 }}>
            <input
              type="radio"
              name={`${slot.name}-reasoning`}
              value="none_or_unknown"
              checked={slot.reasoningMode === "none_or_unknown"}
              onChange={() => onUpdateSlot(slot.name, "reasoningMode", "none_or_unknown")}
            />
            不明
          </label>
          {showKimiWarning && (
            <div style={{
              marginTop: 6, padding: "4px 8px",
              background: "#fff3cd", border: "1px solid #ffc107", borderRadius: 4,
              fontSize: 12, fontWeight: 600, color: "#856404",
            }}>
              ⚠ Kimi / Moonshot は「同一モデル + thinking」方式です。「同一モデル + thinking」を選択してください。
            </div>
          )}
        </div>

        {/* ── Row 3: Model name(s) ── */}
        {isSameModel ? (
          /* ── same_model_with_thinking: single input ── */
          <div style={{ marginBottom: 8 }}>
            <label style={{ ...labelS, color: "#333" }}>
              共通モデル名
            </label>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="text"
                value={slot.proModel}
                onChange={(e) => updateModel(sanitizeSingleLine(e.target.value))}
                placeholder="例: gpt-4.1"
                style={{ ...inputS, flex: 1, minWidth: 0 }}
              />
              <button
                style={testBtnS}
                onClick={() => onTestSlot(slot.name, "pro")}
                disabled={proTestResult === "testing" || !slot.proModel.trim()}
              >
                Pro確認 (thinking)
              </button>
              <TestChip result={proTestResult} showReasoning={true} hasReasoning={hasReasoning} errorMessage={proTestError || reasoningWarning} />
              <button
                style={testBtnS}
                onClick={() => onTestSlot(slot.name, "flash")}
                disabled={flashTestResult === "testing" || !slot.flashModel.trim()}
              >
                Flash確認
              </button>
              <TestChip result={flashTestResult} errorMessage={flashTestError} />
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 3 }}>
              Pro実行時は thinking: {`{ type: "enabled" }`} を付加、Flash実行時は thinking なし
            </div>
          </div>
        ) : (
          /* ── separate_models / none_or_unknown: two columns ── */
          <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ ...labelS, color: "#107c10" }}>
                Pro / reasoning モデル名
              </label>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="text"
                  value={slot.proModel}
                  onChange={(e) => onUpdateSlot(slot.name, "proModel", sanitizeSingleLine(e.target.value))}
                  placeholder="例: gpt-4.1"
                  style={{ ...inputS, flex: 1, minWidth: 0 }}
                />
                <button
                  style={testBtnS}
                  onClick={() => onTestSlot(slot.name, "pro")}
                  disabled={proTestResult === "testing" || !slot.proModel.trim()}
                >
                  Pro確認
                </button>
                <TestChip result={proTestResult} errorMessage={proTestError} />
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <label style={{ ...labelS, color: "#1a73e8" }}>
                Flash / fast モデル名
              </label>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="text"
                  value={slot.flashModel}
                  onChange={(e) => onUpdateSlot(slot.name, "flashModel", sanitizeSingleLine(e.target.value))}
                  placeholder="例: gpt-4.1-mini"
                  style={{ ...inputS, flex: 1, minWidth: 0 }}
                />
                <button
                  style={testBtnS}
                  onClick={() => onTestSlot(slot.name, "flash")}
                  disabled={flashTestResult === "testing" || !slot.flashModel.trim()}
                >
                  Flash確認
                </button>
                <TestChip result={flashTestResult} errorMessage={flashTestError} />
              </div>
            </div>
          </div>
        )}

        {/* ── Row 4: APIキー設定 ── */}
        <div style={{
          border: "1px solid #eee", borderRadius: 4,
          padding: "6px 10px", background: "#fafafa",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>APIキー設定</span>
            <label style={{ fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
              <input
                type="radio"
                name={`${slot.name}-key-mode`}
                value="direct"
                checked={slot.apiKeyMode === "direct"}
                onChange={() => onUpdateSlot(slot.name, "apiKeyMode", "direct")}
              />
              直接入力
            </label>
            <label style={{ fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
              <input
                type="radio"
                name={`${slot.name}-key-mode`}
                value="env_var"
                checked={slot.apiKeyMode === "env_var"}
                onChange={() => onUpdateSlot(slot.name, "apiKeyMode", "env_var")}
              />
              環境変数
            </label>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <input
                type="password"
                value={slot.apiKey}
                onChange={(e) => onUpdateSlot(slot.name, "apiKey", e.target.value.trim())}
                placeholder="APIキー"
                style={{ ...inputS, width: "100%" }}
                disabled={slot.apiKeyMode !== "direct"}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                <input
                  type="text"
                  value={slot.apiKeyEnvName}
                  onChange={(e) => onUpdateSlot(slot.name, "apiKeyEnvName", sanitizeSingleLine(e.target.value))}
                  placeholder="PRA_LLM_KEY_SUMMARY"
                  style={{ ...inputS, flex: 1, minWidth: 0 }}
                  disabled={slot.apiKeyMode !== "env_var"}
                />
                <button
                  style={{ ...testBtnS }}
                  onClick={() => onCheckLlmEnv(slot.name)}
                  disabled={slot.apiKeyMode !== "env_var" || !slot.apiKeyEnvName.trim()}
                >
                  確認
                </button>
              </div>
              {envCheckResult && (
                <span
                  className={`status-chip ${envCheckResult === "set" ? "ok" : "err"}`}
                  style={{ fontSize: 11, marginTop: 2 }}
                >
                  {envCheckResult === "set" ? "設定済み" : "未設定"}
                </span>
              )}
            </div>
          </div>

          {/* ── Storage mode (only for direct input) ── */}
          {slot.apiKeyMode === "direct" && (
            <div style={{
              borderTop: "1px solid #e0e0e0", marginTop: 6, paddingTop: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>APIキー保存方式</span>
                <label style={{ fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2 }}>
                  <input
                    type="radio"
                    name={`${slot.name}-storage`}
                    value="none"
                    checked={slot.apiKeyStorage === "none"}
                    onChange={() => onUpdateSlot(slot.name, "apiKeyStorage", "none")}
                  />
                  保存しない
                </label>
                {helloAvailable && (
                  <label style={{ fontSize: 11, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2 }}>
                    <input
                      type="radio"
                      name={`${slot.name}-storage`}
                      value="windows_hello"
                      checked={slot.apiKeyStorage === "windows_hello"}
                      onChange={() => onUpdateSlot(slot.name, "apiKeyStorage", "windows_hello")}
                    />
                    Windows Helloで保護 <span style={{ color: "#107c10", fontSize: 10 }}>推奨</span>
                  </label>
                )}
              </div>

              {/* Contextual UI per storage mode */}
              {slot.apiKeyStorage === "windows_hello" && (
                <WindowsHelloStorageSection
                  slotName={slot.name}
                  apiKey={slot.apiKey}
                  status={helloStatus}
                  decrypted={helloDecrypted}
                  onSave={onWindowsHelloSave}
                  onDecrypt={onWindowsHelloDecrypt}
                  onDelete={onWindowsHelloDelete}
                />
              )}
              {slot.apiKeyStorage === "none" && (
                <p style={{ fontSize: 12, fontWeight: 600, color: "#888", margin: "4px 0 0 0" }}>
                  未保存
                </p>
              )}
            </div>
          )}

          {/* ── Env var status ── */}
          {slot.apiKeyMode === "env_var" && (
            <p style={{ fontSize: 12, fontWeight: 600, color: envCheckResult === "set" ? "#107c10" : "#888", margin: "4px 0 0 0" }}>
              環境変数を使用
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

export default function SettingsPanel(props: SettingsPanelProps) {
  const {
    llmSlots, llmProTestResults, llmFlashTestResults, llmEnvCheckResults,
    llmProReasoningResults, llmTestErrorMessages,
    windowsHelloAvailable, windowsHelloStatus, windowsHelloDecrypted,
    onUpdateSlot, onTestSlot, onCheckLlmEnv, onTestAll, testAllProgress, onSaveAppSettings,
    onLockSecrets,
    onWindowsHelloSave, onWindowsHelloDecrypt, onWindowsHelloDelete,
    googleBooksApiKey, onGoogleBooksApiKeyChange,
    googleBooksApiKeyMode, onGoogleBooksApiKeyModeChange,
    googleBooksApiKeyEnvName, onGoogleBooksApiKeyEnvNameChange,
    gbEnvCheckResult, onCheckGbEnv,
    gbConnectionTestResult, onTestGbConnection,
    googleBooksEnabled, onGoogleBooksEnabledChange,
    semanticScholarApiKey, onSemanticScholarApiKeyChange,
    semanticScholarApiKeyMode, onSemanticScholarApiKeyModeChange,
    semanticScholarApiKeyEnvName, onSemanticScholarApiKeyEnvNameChange,
    ssEnvCheckResult, onCheckSsEnv,
    ssConnectionTestResult, onTestSsConnection,
    semanticScholarEnabled, onSemanticScholarEnabledChange,
    pubmedApiKey, onPubmedApiKeyChange,
    pubmedApiKeyMode, onPubmedApiKeyModeChange,
    pubmedApiKeyEnvName, onPubmedApiKeyEnvNameChange,
    pubmedEnvCheckResult, onCheckPubmedEnv,
    pubmedConnectionTestResult, onTestPubmedConnection,
    pubmedEnabled, onPubmedEnabledChange,
    ciniiAppid, onCiniiAppidChange,
    ciniiEnabled, onCiniiEnabledChange,
  } = props;

  // Tab keys: each LLM slot name + "db"
  const tabKeys = [...llmSlots.map((s) => s.name), "db"] as const;
  const [activeTab, setActiveTab] = React.useState<string>(tabKeys[0]);

  // Auto-save settings when switching tabs (skip first render)
  const tabSwitchRef = React.useRef(false);
  React.useEffect(() => {
    if (!tabSwitchRef.current) {
      tabSwitchRef.current = true;
      return;
    }
    onSaveAppSettings();
  }, [activeTab]);

  // Model lookup modal state
  const [lookupSlot, setLookupSlot] = React.useState<string | null>(null);

  const handleApplyLookup = (slotName: string, fields: Record<string, string>) => {
    if (fields.provider) onUpdateSlot(slotName, "provider", fields.provider);
    if (fields.baseUrl) onUpdateSlot(slotName, "baseUrl", fields.baseUrl);
    if (fields.proModel) onUpdateSlot(slotName, "proModel", fields.proModel);
    if (fields.flashModel) onUpdateSlot(slotName, "flashModel", fields.flashModel);
    if (fields.apiKeyEnvName) onUpdateSlot(slotName, "apiKeyEnvName", fields.apiKeyEnvName);
  };

  const enabledSlots = llmSlots.filter((s) => s.enabled);
  const allConfigured = enabledSlots.every((s) => {
    const hasKey =
      s.apiKeyMode === "direct" ? !!s.apiKey.trim() : !!s.apiKeyEnvName.trim();
    return s.provider.trim() && s.baseUrl.trim() && (s.proModel.trim() || s.flashModel.trim()) && hasKey;
  });

  // Collapsible state for DB API cards
  const [dbExpanded, setDbExpanded] = React.useState<Record<string, boolean>>({
    pubmed: false, googleBooks: false, semanticScholar: false, cinii: false,
  });
  const toggleDb = (key: string) =>
    setDbExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const dbChip = (enabled: boolean, testResult: string, checkResult: string) => {
    if (!enabled) return <span className="status-chip unrun">未使用</span>;
    if (testResult === "testing") return <span className="status-chip running">接続確認中...</span>;
    if (testResult === "ok") return <span className="status-chip ok">接続可</span>;
    if (testResult === "error") return <span className="status-chip err">接続不可</span>;
    if (checkResult === "set") return <span className="status-chip ok">設定済み</span>;
    if (checkResult === "not_set" || checkResult === "error") return <span className="status-chip unrun">未設定</span>;
    return <span className="status-chip unrun">未確認</span>;
  };

  const dbCardHeaderBase: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 10,
    padding: "10px 12px", background: "#f7f7f7",
    border: "1px solid #e0e0e0", borderRadius: 6,
    cursor: "pointer", userSelect: "none",
  };
  const dbCardBodyStyle: React.CSSProperties = {
    padding: "10px 12px", border: "1px solid #e0e0e0",
    borderTop: "none", borderRadius: "0 0 6px 6px",
    marginTop: -1, marginBottom: 12, background: "#fff",
  };

  const tabBtnBase: React.CSSProperties = {
    padding: "4px 10px",
    border: "1px solid #ccc",
    background: "#f0f0f0",
    cursor: "pointer",
    fontSize: 11,
    fontWeight: 600,
    borderRadius: "4px 4px 0 0",
    marginRight: 1,
  };

  /** Tab label: "LLM API {label}" for slots, "文献DB API" for db */
  const tabLabel = (key: string) => {
    if (key === "db") return "文献DB API";
    return (SLOT_LABELS[key] || key);
  };

  /* ── Render ──────────────────────────────────────────────────────── */
  return (
    <div>
      {/* Tab switcher */}
      <div style={{ display: "flex", marginBottom: 0, flexWrap: "wrap" }}>
        {tabKeys.map((key) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              style={{
                ...tabBtnBase,
                background: isActive ? "#fff" : "#f0f0f0",
                borderBottom: isActive ? "2px solid #0078d4" : "1px solid #ccc",
                color: isActive ? "#0078d4" : "#555",
              }}
              onClick={() => setActiveTab(key)}
            >
              {tabLabel(key)}
            </button>
          );
        })}
        <div style={{ flex: 1, borderBottom: "1px solid #ccc", minWidth: 20 }} />
      </div>

      {/* Tab content */}
      <section className="panel" style={{ borderRadius: "0 6px 6px 6px" }}>
        {/* Save button — shown on all tabs */}
        <div style={{ marginBottom: 12, display: "flex", gap: 12, alignItems: "center" }}>
          <button onClick={onSaveAppSettings} style={{ fontWeight: 600 }}>
            設定を保存
          </button>
          <span style={{ fontSize: 11, color: "#888" }}>
            APIキーは「Windows Helloで保存」を押した場合のみapp_settings.secrets.jsonにDPAPIで保護して保存されます。
          </span>
          <button
            onClick={() => {
              if (window.confirm(
                "復号済みAPIキーをメモリから消去します。\n" +
                "再度APIを使うには、Windows Helloで復号してください。\n" +
                "続行しますか？"
              )) {
                onLockSecrets();
              }
            }}
            style={{ fontSize: 11, padding: "2px 10px", whiteSpace: "nowrap", marginLeft: "auto" }}
          >
            復号済みAPIキーをロック
          </button>
        </div>

        {/* ── LLM slot tabs ── */}
        {activeTab !== "db" && (() => {
          const slot = llmSlots.find((s) => s.name === activeTab);
          if (!slot) return null;
          return (
            <div>
              <SlotCard
                slot={slot}
                proTestResult={llmProTestResults[slot.name]}
                flashTestResult={llmFlashTestResults[slot.name]}
                envCheckResult={llmEnvCheckResults[slot.name]}
                hasReasoning={llmProReasoningResults[slot.name]}
                helloStatus={windowsHelloStatus[slot.name] || "not_saved"}
                helloAvailable={windowsHelloAvailable}
                helloDecrypted={windowsHelloDecrypted.has(slot.name)}
                proTestError={llmTestErrorMessages[`${slot.name}_pro`]}
                flashTestError={llmTestErrorMessages[`${slot.name}_flash`]}
                reasoningWarning={llmTestErrorMessages[`${slot.name}_pro_reasoning`]}
                onUpdateSlot={onUpdateSlot}
                onTestSlot={onTestSlot}
                onCheckLlmEnv={onCheckLlmEnv}
                onOpenLookup={(name) => setLookupSlot(name)}
                onWindowsHelloSave={onWindowsHelloSave}
                onWindowsHelloDecrypt={onWindowsHelloDecrypt}
                onWindowsHelloDelete={onWindowsHelloDelete}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={onTestAll}
                  disabled={enabledSlots.length === 0 || !allConfigured}
                  style={{ fontSize: 11 }}
                >
                  すべて接続確認
                </button>
                {testAllProgress && (
                  <span style={{ fontSize: 10, color: "#0078d4", whiteSpace: "nowrap" }}>{testAllProgress}</span>
                )}
              </div>
            </div>
          );
        })()}

        {/* ── DB tab ── */}
        {activeTab === "db" && (
          <div>
            {/* PubMed */}
            {(() => {
              const key = "pubmed"; const isExp = dbExpanded[key];
              return (
                <div>
                  <div style={{ ...dbCardHeaderBase, borderRadius: isExp ? "6px 6px 0 0" : 6, marginBottom: isExp ? 0 : 6 }}
                    onClick={() => toggleDb(key)}>
                    <input type="checkbox" checked={pubmedEnabled}
                      onChange={(e) => { e.stopPropagation(); onPubmedEnabledChange(e.target.checked); }}
                      onClick={(e) => e.stopPropagation()} style={{ margin: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>PubMed / NCBI API</span>
                    {dbChip(pubmedEnabled, pubmedConnectionTestResult, pubmedEnvCheckResult)}
                    <span style={{ fontSize: 11, color: "#888" }}>{isExp ? "▼ 折りたたむ" : "▶ 展開"}</span>
                  </div>
                  {isExp && (
                    <div style={dbCardBodyStyle} onClick={(e) => e.stopPropagation()}>
                      {!pubmedEnabled ? (
                        <p style={{ fontSize: 12, color: "#888", margin: 0 }}>PubMed / NCBI APIは未使用です。使用する場合はチェックを入れてください。</p>
                      ) : (
                        <div>
                          <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px 0" }}>PubMed検索・書誌情報取得に使用。APIキーなしでも利用可。NCBI_API_KEYでレート制限緩和。</p>
                          <div className="api-key-mode-row">
                            <label className="api-key-mode-label">APIキー設定方式</label>
                            <label className="api-key-radio-label"><input type="radio" name="pubmed-key-mode" value="direct" checked={pubmedApiKeyMode === "direct"} onChange={() => onPubmedApiKeyModeChange("direct")} />APIキーを直接入力</label>
                            <label className="api-key-radio-label"><input type="radio" name="pubmed-key-mode" value="env_var" checked={pubmedApiKeyMode === "env_var"} onChange={() => onPubmedApiKeyModeChange("env_var")} />環境変数名を指定</label>
                          </div>
                          {pubmedApiKeyMode === "direct" ? (
                            <>
                              <input type="password" className="llm-input llm-input-wide" style={{ marginTop: 8 }} placeholder="APIキーを入力" value={pubmedApiKey} onChange={(e) => onPubmedApiKeyChange(e.target.value)} />
                              <div className="api-key-action-row"><button onClick={onTestPubmedConnection}>接続確認</button>
                                {pubmedConnectionTestResult && <span className={`status-chip ${pubmedConnectionTestResult === "ok" ? "ok" : pubmedConnectionTestResult === "testing" ? "running" : "err"}`}>{pubmedConnectionTestResult === "ok" ? "接続可" : pubmedConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}</span>}
                              </div>
                            </>
                          ) : (
                            <>
                              <input type="text" className="llm-input llm-input-wide" style={{ marginTop: 8 }} placeholder="NCBI_API_KEY" value={pubmedApiKeyEnvName} onChange={(e) => onPubmedApiKeyEnvNameChange(e.target.value)} />
                              <div className="api-key-action-row">
                                <button onClick={onCheckPubmedEnv} disabled={!pubmedApiKeyEnvName.trim()}>環境変数を確認</button>
                                {pubmedEnvCheckResult && <span className={`status-chip ${pubmedEnvCheckResult === "set" ? "ok" : "err"}`}>{pubmedEnvCheckResult === "set" ? "設定済み" : "未設定"}</span>}
                                <button onClick={onTestPubmedConnection}>接続確認</button>
                                {pubmedConnectionTestResult && <span className={`status-chip ${pubmedConnectionTestResult === "ok" ? "ok" : pubmedConnectionTestResult === "testing" ? "running" : "err"}`}>{pubmedConnectionTestResult === "ok" ? "接続可" : pubmedConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}</span>}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Google Books */}
            {(() => {
              const key = "googleBooks"; const isExp = dbExpanded[key];
              return (
                <div>
                  <div style={{ ...dbCardHeaderBase, borderRadius: isExp ? "6px 6px 0 0" : 6, marginBottom: isExp ? 0 : 6 }}
                    onClick={() => toggleDb(key)}>
                    <input type="checkbox" checked={googleBooksEnabled}
                      onChange={(e) => { e.stopPropagation(); onGoogleBooksEnabledChange(e.target.checked); }}
                      onClick={(e) => e.stopPropagation()} style={{ margin: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Google Books API</span>
                    {dbChip(googleBooksEnabled, gbConnectionTestResult, gbEnvCheckResult)}
                    <span style={{ fontSize: 11, color: "#888" }}>{isExp ? "▼ 折りたたむ" : "▶ 展開"}</span>
                  </div>
                  {isExp && (
                    <div style={dbCardBodyStyle} onClick={(e) => e.stopPropagation()}>
                      {!googleBooksEnabled ? (
                        <p style={{ fontSize: 12, color: "#888", margin: 0 }}>Google Books APIは未使用です。使用する場合はチェックを入れてください。</p>
                      ) : (
                        <div>
                          <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px 0" }}>APIキー設定でレート制限緩和。未設定でも基本検索は利用可能。</p>
                          <div className="api-key-mode-row">
                            <label className="api-key-mode-label">APIキー設定方式</label>
                            <label className="api-key-radio-label"><input type="radio" name="gb-key-mode" value="direct" checked={googleBooksApiKeyMode === "direct"} onChange={() => onGoogleBooksApiKeyModeChange("direct")} />APIキーを直接入力</label>
                            <label className="api-key-radio-label"><input type="radio" name="gb-key-mode" value="env_var" checked={googleBooksApiKeyMode === "env_var"} onChange={() => onGoogleBooksApiKeyModeChange("env_var")} />環境変数名を指定</label>
                          </div>
                          {googleBooksApiKeyMode === "direct" ? (
                            <>
                              <input type="password" className="llm-input llm-input-wide" style={{ marginTop: 8 }} placeholder="APIキーを入力" value={googleBooksApiKey} onChange={(e) => onGoogleBooksApiKeyChange(e.target.value)} />
                              <div className="api-key-action-row"><button onClick={onTestGbConnection}>接続確認</button>
                                {gbConnectionTestResult && <span className={`status-chip ${gbConnectionTestResult === "ok" ? "ok" : gbConnectionTestResult === "testing" ? "running" : "err"}`}>{gbConnectionTestResult === "ok" ? "接続可" : gbConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}</span>}
                              </div>
                            </>
                          ) : (
                            <>
                              <input type="text" className="llm-input llm-input-wide" style={{ marginTop: 8 }} placeholder="GOOGLE_BOOKS_API_KEY" value={googleBooksApiKeyEnvName} onChange={(e) => onGoogleBooksApiKeyEnvNameChange(e.target.value)} />
                              <div className="api-key-action-row">
                                <button onClick={onCheckGbEnv} disabled={!googleBooksApiKeyEnvName.trim()}>環境変数を確認</button>
                                {gbEnvCheckResult && <span className={`status-chip ${gbEnvCheckResult === "set" ? "ok" : "err"}`}>{gbEnvCheckResult === "set" ? "設定済み" : "未設定"}</span>}
                                <button onClick={onTestGbConnection}>接続確認</button>
                                {gbConnectionTestResult && <span className={`status-chip ${gbConnectionTestResult === "ok" ? "ok" : gbConnectionTestResult === "testing" ? "running" : "err"}`}>{gbConnectionTestResult === "ok" ? "接続可" : gbConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}</span>}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* CiNii Research (Japanese papers) */}
            {(() => {
              const key = "cinii"; const isExp = dbExpanded[key];
              const ciniiCheckResult = ciniiAppid.trim() ? "set" : "not_set";
              return (
                <div>
                  <div style={{ ...dbCardHeaderBase, borderRadius: isExp ? "6px 6px 0 0" : 6, marginBottom: isExp ? 0 : 6 }}
                    onClick={() => toggleDb(key)}>
                    <input type="checkbox" checked={ciniiEnabled}
                      onChange={(e) => { e.stopPropagation(); onCiniiEnabledChange(e.target.checked); }}
                      onClick={(e) => e.stopPropagation()} style={{ margin: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>CiNii Research API</span>
                    {dbChip(ciniiEnabled, ""/*no test*/, ciniiCheckResult)}
                    <span style={{ fontSize: 11, color: "#888" }}>{isExp ? "▼ 折りたたむ" : "▶ 展開"}</span>
                  </div>
                  {isExp && (
                    <div style={dbCardBodyStyle} onClick={(e) => e.stopPropagation()}>
                      {!ciniiEnabled ? (
                        <p style={{ fontSize: 12, color: "#888", margin: 0 }}>CiNii Research APIは未使用です。使用する場合はチェックを入れてください。</p>
                      ) : (
                        <div>
                          <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px 0" }}>
                            日本の学術論文の照合に使用します。CiNii Research APIのappidを入力してください。
                            <a href="https://support.nii.ac.jp/ja/cinii/api/developer" target="_blank" rel="noopener noreferrer" style={{ marginLeft: 4 }}>デベロッパー登録</a>
                          </p>
                          <div className="api-key-mode-row">
                            <label className="api-key-mode-label">AppID</label>
                          </div>
                          <input
                            type="text"
                            className="llm-input llm-input-wide"
                            style={{ marginTop: 8 }}
                            placeholder="CiNii Research API application ID"
                            value={ciniiAppid}
                            onChange={(e) => onCiniiAppidChange(e.target.value.trim())}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Semantic Scholar */}
            {(() => {
              const key = "semanticScholar"; const isExp = dbExpanded[key];
              return (
                <div>
                  <div style={{ ...dbCardHeaderBase, borderRadius: isExp ? "6px 6px 0 0" : 6, marginBottom: isExp ? 0 : 6 }}
                    onClick={() => toggleDb(key)}>
                    <input type="checkbox" checked={semanticScholarEnabled}
                      onChange={(e) => { e.stopPropagation(); onSemanticScholarEnabledChange(e.target.checked); }}
                      onClick={(e) => e.stopPropagation()} style={{ margin: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>Semantic Scholar API</span>
                    {dbChip(semanticScholarEnabled, ssConnectionTestResult, ssEnvCheckResult)}
                    <span style={{ fontSize: 11, color: "#888" }}>{isExp ? "▼ 折りたたむ" : "▶ 展開"}</span>
                  </div>
                  {isExp && (
                    <div style={dbCardBodyStyle} onClick={(e) => e.stopPropagation()}>
                      {!semanticScholarEnabled ? (
                        <p style={{ fontSize: 12, color: "#888", margin: 0 }}>Semantic Scholar APIは未使用です。使用する場合はチェックを入れてください。</p>
                      ) : (
                        <div>
                          <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px 0" }}>Crossref/PubMedで見つからない論文、DOIなし文献、古い文献などの検索候補取得に使用。</p>
                          <div className="api-key-mode-row">
                            <label className="api-key-mode-label">APIキー設定方式</label>
                            <label className="api-key-radio-label"><input type="radio" name="ss-key-mode" value="direct" checked={semanticScholarApiKeyMode === "direct"} onChange={() => onSemanticScholarApiKeyModeChange("direct")} />APIキーを直接入力</label>
                            <label className="api-key-radio-label"><input type="radio" name="ss-key-mode" value="env_var" checked={semanticScholarApiKeyMode === "env_var"} onChange={() => onSemanticScholarApiKeyModeChange("env_var")} />環境変数名を指定</label>
                          </div>
                          {semanticScholarApiKeyMode === "direct" ? (
                            <>
                              <input type="password" className="llm-input llm-input-wide" style={{ marginTop: 8 }} placeholder="APIキーを入力" value={semanticScholarApiKey} onChange={(e) => onSemanticScholarApiKeyChange(e.target.value)} />
                              <div className="api-key-action-row"><button onClick={onTestSsConnection}>接続確認</button>
                                {ssConnectionTestResult && <span className={`status-chip ${ssConnectionTestResult === "ok" ? "ok" : ssConnectionTestResult === "testing" ? "running" : "err"}`}>{ssConnectionTestResult === "ok" ? "接続可" : ssConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}</span>}
                              </div>
                            </>
                          ) : (
                            <>
                              <input type="text" className="llm-input llm-input-wide" style={{ marginTop: 8 }} placeholder="SEMANTIC_SCHOLAR_API_KEY" value={semanticScholarApiKeyEnvName} onChange={(e) => onSemanticScholarApiKeyEnvNameChange(e.target.value)} />
                              <div className="api-key-action-row">
                                <button onClick={onCheckSsEnv} disabled={!semanticScholarApiKeyEnvName.trim()}>環境変数を確認</button>
                                {ssEnvCheckResult && <span className={`status-chip ${ssEnvCheckResult === "set" ? "ok" : "err"}`}>{ssEnvCheckResult === "set" ? "設定済み" : "未設定"}</span>}
                                <button onClick={onTestSsConnection}>接続確認</button>
                                {ssConnectionTestResult && <span className={`status-chip ${ssConnectionTestResult === "ok" ? "ok" : ssConnectionTestResult === "testing" ? "running" : "err"}`}>{ssConnectionTestResult === "ok" ? "接続可" : ssConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}</span>}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </section>

      {/* Model lookup modal */}
      {lookupSlot && (
        <ModelLookupModal
          slotName={lookupSlot}
          onClose={() => setLookupSlot(null)}
          onApplyToSlot={handleApplyLookup}
        />
      )}
    </div>
  );
}
