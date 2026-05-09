import { SLOT_LABELS, SLOT_DESCRIPTIONS } from "../slotLabels";
import ApiKeySettingBlock from "../ApiKeySettingBlock";

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyMode: "direct" | "env_var";
  apiKeyEnvName: string;
  enabled: boolean;
}

interface SettingsPanelProps {
  llmSlots: LlmSlot[];
  llmTestResults: Record<string, string>;
  llmEnvCheckResults: Record<string, string>;
  onUpdateSlot: (slotName: string, field: string, value: string | boolean) => void;
  onTestSlot: (slotName: string) => void;
  onCheckLlmEnv: (slotName: string) => void;
  onTestAll: () => void;
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
}

/** Render a status chip for LLM slot connection test, respecting enabled. */
function SlotConnectionChip({
  enabled,
  testResult,
}: {
  enabled: boolean;
  testResult: string | undefined;
}) {
  if (!enabled) {
    return <span className="status-chip unrun">未使用</span>;
  }
  if (!testResult) {
    return <span className="status-chip unrun">未確認</span>;
  }
  if (testResult === "testing") {
    return <span className="status-chip running">接続確認中...</span>;
  }
  if (testResult === "ok") {
    return <span className="status-chip ok">接続可</span>;
  }
  return <span className="status-chip err">接続不可</span>;
}

export default function SettingsPanel({
  llmSlots,
  llmTestResults,
  llmEnvCheckResults,
  onUpdateSlot,
  onTestSlot,
  onCheckLlmEnv,
  onTestAll,
  googleBooksApiKey,
  onGoogleBooksApiKeyChange,
  googleBooksApiKeyMode,
  onGoogleBooksApiKeyModeChange,
  googleBooksApiKeyEnvName,
  onGoogleBooksApiKeyEnvNameChange,
  gbEnvCheckResult,
  onCheckGbEnv,
  gbConnectionTestResult,
  onTestGbConnection,
  googleBooksEnabled,
  onGoogleBooksEnabledChange,
  semanticScholarApiKey,
  onSemanticScholarApiKeyChange,
  semanticScholarApiKeyMode,
  onSemanticScholarApiKeyModeChange,
  semanticScholarApiKeyEnvName,
  onSemanticScholarApiKeyEnvNameChange,
  ssEnvCheckResult,
  onCheckSsEnv,
  ssConnectionTestResult,
  onTestSsConnection,
  semanticScholarEnabled,
  onSemanticScholarEnabledChange,
  pubmedApiKey,
  onPubmedApiKeyChange,
  pubmedApiKeyMode,
  onPubmedApiKeyModeChange,
  pubmedApiKeyEnvName,
  onPubmedApiKeyEnvNameChange,
  pubmedEnvCheckResult,
  onCheckPubmedEnv,
  pubmedConnectionTestResult,
  onTestPubmedConnection,
  pubmedEnabled,
  onPubmedEnabledChange,
}: SettingsPanelProps) {
  const enabledSlots = llmSlots.filter((s) => s.enabled);
  const allConfigured = enabledSlots.every((s) => {
    const hasKey =
      s.apiKeyMode === "direct" ? !!s.apiKey.trim() : !!s.apiKeyEnvName.trim();
    return s.provider.trim() && s.baseUrl.trim() && s.model.trim() && hasKey;
  });

  const disabledStyle: React.CSSProperties = {
    opacity: 0.45,
    pointerEvents: "none",
  };

  return (
    <div>
      {/* ================================================================ */}
      {/* Section 1: LLM API Settings                                      */}
      {/* ================================================================ */}
      <section className="panel">
        <h2>LLM API 設定</h2>
        {llmSlots.map((slot) => {
          const slotDisabled = !slot.enabled;
          return (
          <div key={slot.name} className="llm-slot-row" style={slotDisabled ? { opacity: 0.5 } : undefined}>
            <div className="llm-slot-header">
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={slot.enabled}
                  onChange={(e) => onUpdateSlot(slot.name, "enabled", e.target.checked)}
                />
                <span className="llm-slot-label">{SLOT_LABELS[slot.name] || slot.name}</span>
              </label>
              <SlotConnectionChip
                enabled={slot.enabled}
                testResult={llmTestResults[slot.name]}
              />
            </div>
            {SLOT_DESCRIPTIONS[slot.name] && (
              <div className="disabled-reason" style={{ marginBottom: 4 }}>
                {SLOT_DESCRIPTIONS[slot.name]}
              </div>
            )}

            {/* Provider, Base URL, Model row */}
            <div className="llm-slot-fields" style={slotDisabled ? disabledStyle : undefined}>
              <input
                type="text"
                value={slot.provider}
                onChange={(e) => onUpdateSlot(slot.name, "provider", e.target.value)}
                placeholder="プロバイダ (例: openai)"
                className="llm-input"
                disabled={slotDisabled}
              />
              <input
                type="text"
                value={slot.baseUrl}
                onChange={(e) => onUpdateSlot(slot.name, "baseUrl", e.target.value)}
                placeholder="Base URL"
                className="llm-input llm-input-wide"
                disabled={slotDisabled}
              />
              <input
                type="text"
                value={slot.model}
                onChange={(e) => onUpdateSlot(slot.name, "model", e.target.value)}
                placeholder="モデル"
                className="llm-input"
                disabled={slotDisabled}
              />
              <button
                onClick={() => onTestSlot(slot.name)}
                disabled={slotDisabled || llmTestResults[slot.name] === "testing"}
              >
                {llmTestResults[slot.name] === "testing" ? "確認中..." : "接続確認"}
              </button>
            </div>

            {/* API key mode + input row */}
            <div className="api-key-mode-row" style={{ marginTop: 6, ...(slotDisabled ? disabledStyle : {}) }}>
              <label className="api-key-radio-label">
                <input
                  type="radio"
                  name={`${slot.name}-key-mode`}
                  value="direct"
                  checked={slot.apiKeyMode === "direct"}
                  onChange={() => onUpdateSlot(slot.name, "apiKeyMode", "direct")}
                  disabled={slotDisabled}
                />
                APIキーを直接入力
              </label>
              <label className="api-key-radio-label">
                <input
                  type="radio"
                  name={`${slot.name}-key-mode`}
                  value="env_var"
                  checked={slot.apiKeyMode === "env_var"}
                  onChange={() => onUpdateSlot(slot.name, "apiKeyMode", "env_var")}
                  disabled={slotDisabled}
                />
                環境変数名を指定
              </label>
            </div>
            {slot.apiKeyMode === "direct" ? (
              <input
                type="password"
                value={slot.apiKey}
                onChange={(e) => onUpdateSlot(slot.name, "apiKey", e.target.value)}
                placeholder="APIキー"
                className="llm-input llm-input-wide"
                style={{ marginTop: 4, ...(slotDisabled ? disabledStyle : {}) }}
                disabled={slotDisabled}
              />
            ) : (
              <div style={{ marginTop: 4, ...(slotDisabled ? disabledStyle : {}) }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    value={slot.apiKeyEnvName}
                    onChange={(e) => onUpdateSlot(slot.name, "apiKeyEnvName", e.target.value)}
                    placeholder="PRA_LLM_KEY_SUMMARY"
                    className="llm-input llm-input-wide"
                    disabled={slotDisabled}
                  />
                  <button
                    onClick={() => onCheckLlmEnv(slot.name)}
                    disabled={slotDisabled || !slot.apiKeyEnvName.trim()}
                    style={{ whiteSpace: "nowrap", fontSize: 12 }}
                  >
                    環境変数を確認
                  </button>
                </div>
                {llmEnvCheckResults[slot.name] && !slotDisabled && (
                  <span
                    className={`status-chip ${llmEnvCheckResults[slot.name] === "set" ? "ok" : "err"}`}
                    style={{ marginTop: 4 }}
                  >
                    {llmEnvCheckResults[slot.name] === "set" ? "設定済み" : "未設定"}
                  </span>
                )}
              </div>
            )}
          </div>
        );
        })}
        <div className="row">
          <button
            onClick={onTestAll}
            disabled={enabledSlots.length === 0 || !allConfigured}
          >
            すべて接続確認
          </button>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 2: Literature DB API Settings                            */}
      {/* ================================================================ */}
      <section className="panel" style={{ marginTop: 12 }}>
        <h2>文献データベースAPI設定</h2>

        {/* PubMed */}
        <div style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={pubmedEnabled}
                onChange={(e) => onPubmedEnabledChange(e.target.checked)}
              />
              PubMed / NCBI API を使用する
            </label>
            {!pubmedEnabled && <span className="status-chip unrun">未使用</span>}
          </div>
          {pubmedEnabled && (
            <ApiKeySettingBlock
              title="PubMed / NCBI API"
              description="PubMed検索・書誌情報取得に使用します。APIキーがなくても利用できますが、NCBI_API_KEY を設定するとレート制限が緩和されます。"
              keyMode={pubmedApiKeyMode}
              apiKey={pubmedApiKey}
              envName={pubmedApiKeyEnvName}
              defaultEnvName="NCBI_API_KEY"
              onModeChange={onPubmedApiKeyModeChange}
              onApiKeyChange={onPubmedApiKeyChange}
              onEnvNameChange={onPubmedApiKeyEnvNameChange}
              onCheckEnv={onCheckPubmedEnv}
              onTestConnection={onTestPubmedConnection}
              checkResult={pubmedEnvCheckResult}
              testResult={pubmedConnectionTestResult}
            />
          )}
        </div>

        {/* Google Books */}
        <div style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={googleBooksEnabled}
                onChange={(e) => onGoogleBooksEnabledChange(e.target.checked)}
              />
              Google Books API を使用する
            </label>
            {!googleBooksEnabled && <span className="status-chip unrun">未使用</span>}
          </div>
          {googleBooksEnabled && (
            <ApiKeySettingBlock
              title="Google Books API"
              description="Google Books APIキーを設定すると、レート制限が緩和され、より多くのリクエストが可能になります。未設定でも基本検索は利用可能です。"
              keyMode={googleBooksApiKeyMode}
              apiKey={googleBooksApiKey}
              envName={googleBooksApiKeyEnvName}
              defaultEnvName="GOOGLE_BOOKS_API_KEY"
              onModeChange={onGoogleBooksApiKeyModeChange}
              onApiKeyChange={onGoogleBooksApiKeyChange}
              onEnvNameChange={onGoogleBooksApiKeyEnvNameChange}
              onCheckEnv={onCheckGbEnv}
              onTestConnection={onTestGbConnection}
              checkResult={gbEnvCheckResult}
              testResult={gbConnectionTestResult}
            />
          )}
        </div>

        {/* Semantic Scholar */}
        <div style={{ marginBottom: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
              <input
                type="checkbox"
                checked={semanticScholarEnabled}
                onChange={(e) => onSemanticScholarEnabledChange(e.target.checked)}
              />
              Semantic Scholar API を使用する
            </label>
            {!semanticScholarEnabled && <span className="status-chip unrun">未使用</span>}
          </div>
          {semanticScholarEnabled && (
            <ApiKeySettingBlock
              title="Semantic Scholar API"
              description="Crossref/PubMedで見つからない論文、DOIなし文献、古い文献などの検索候補取得に使用します。"
              keyMode={semanticScholarApiKeyMode}
              apiKey={semanticScholarApiKey}
              envName={semanticScholarApiKeyEnvName}
              defaultEnvName="SEMANTIC_SCHOLAR_API_KEY"
              onModeChange={onSemanticScholarApiKeyModeChange}
              onApiKeyChange={onSemanticScholarApiKeyChange}
              onEnvNameChange={onSemanticScholarApiKeyEnvNameChange}
              onCheckEnv={onCheckSsEnv}
              onTestConnection={onTestSsConnection}
              checkResult={ssEnvCheckResult}
              testResult={ssConnectionTestResult}
            />
          )}
        </div>
      </section>
    </div>
  );
}
