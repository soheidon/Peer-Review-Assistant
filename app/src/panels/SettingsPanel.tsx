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
}

interface SettingsPanelProps {
  llmSlots: LlmSlot[];
  llmTestResults: Record<string, string>;
  llmEnvCheckResults: Record<string, string>;
  onUpdateSlot: (slotName: string, field: string, value: string) => void;
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
}: SettingsPanelProps) {
  const allConfigured = llmSlots.every((s) => {
    const hasKey =
      s.apiKeyMode === "direct" ? !!s.apiKey.trim() : !!s.apiKeyEnvName.trim();
    return s.provider.trim() && s.baseUrl.trim() && s.model.trim() && hasKey;
  });

  return (
    <div>
      {/* ================================================================ */}
      {/* Section 1: LLM API Settings                                      */}
      {/* ================================================================ */}
      <section className="panel">
        <h2>LLM API 設定</h2>
        {llmSlots.map((slot) => (
          <div key={slot.name} className="llm-slot-row">
            <div className="llm-slot-header">
              <span className="llm-slot-label">{SLOT_LABELS[slot.name] || slot.name}</span>
              {llmTestResults[slot.name] &&
                llmTestResults[slot.name] !== "testing" && (
                  <span
                    className={`status-chip ${llmTestResults[slot.name] === "ok" ? "ok" : "err"}`}
                  >
                    {llmTestResults[slot.name] === "ok" ? "接続可" : "接続不可"}
                  </span>
                )}
              {llmTestResults[slot.name] === "testing" && (
                <span className="status-chip running">接続確認中...</span>
              )}
            </div>
            {SLOT_DESCRIPTIONS[slot.name] && (
              <div className="disabled-reason" style={{ marginBottom: 4 }}>
                {SLOT_DESCRIPTIONS[slot.name]}
              </div>
            )}

            {/* Provider, Base URL, Model row */}
            <div className="llm-slot-fields">
              <input
                type="text"
                value={slot.provider}
                onChange={(e) => onUpdateSlot(slot.name, "provider", e.target.value)}
                placeholder="プロバイダ (例: openai)"
                className="llm-input"
              />
              <input
                type="text"
                value={slot.baseUrl}
                onChange={(e) => onUpdateSlot(slot.name, "baseUrl", e.target.value)}
                placeholder="Base URL"
                className="llm-input llm-input-wide"
              />
              <input
                type="text"
                value={slot.model}
                onChange={(e) => onUpdateSlot(slot.name, "model", e.target.value)}
                placeholder="モデル"
                className="llm-input"
              />
              <button
                onClick={() => onTestSlot(slot.name)}
                disabled={llmTestResults[slot.name] === "testing"}
              >
                {llmTestResults[slot.name] === "testing" ? "確認中..." : "接続確認"}
              </button>
            </div>

            {/* API key mode + input row */}
            <div className="api-key-mode-row" style={{ marginTop: 6 }}>
              <label className="api-key-radio-label">
                <input
                  type="radio"
                  name={`${slot.name}-key-mode`}
                  value="direct"
                  checked={slot.apiKeyMode === "direct"}
                  onChange={() => onUpdateSlot(slot.name, "apiKeyMode", "direct")}
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
                style={{ marginTop: 4 }}
              />
            ) : (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="text"
                    value={slot.apiKeyEnvName}
                    onChange={(e) => onUpdateSlot(slot.name, "apiKeyEnvName", e.target.value)}
                    placeholder="PRA_LLM_KEY_SUMMARY"
                    className="llm-input llm-input-wide"
                  />
                  <button
                    onClick={() => onCheckLlmEnv(slot.name)}
                    disabled={!slot.apiKeyEnvName.trim()}
                    style={{ whiteSpace: "nowrap", fontSize: 12 }}
                  >
                    環境変数を確認
                  </button>
                </div>
                {llmEnvCheckResults[slot.name] && (
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
        ))}
        <div className="row">
          <button onClick={onTestAll} disabled={!allConfigured}>
            すべて接続確認
          </button>
        </div>
      </section>

      {/* ================================================================ */}
      {/* Section 2: Literature DB API Settings                            */}
      {/* ================================================================ */}
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
    </div>
  );
}
