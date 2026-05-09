import React from "react";
import { SLOT_LABELS, SLOT_DESCRIPTIONS } from "../slotLabels";

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

  // Collapsible state for DB API cards
  const [dbExpanded, setDbExpanded] = React.useState<Record<string, boolean>>({
    pubmed: false,
    googleBooks: false,
    semanticScholar: false,
  });
  const toggleDb = (key: string) =>
    setDbExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const disabledStyle: React.CSSProperties = {
    opacity: 0.45,
    pointerEvents: "none",
  };

  /** Status chip for DB API cards. */
  const dbChip = (
    enabled: boolean,
    testResult: string,
    checkResult: string,
  ) => {
    if (!enabled) {
      return <span className="status-chip unrun">未使用</span>;
    }
    if (testResult === "testing") {
      return <span className="status-chip running">接続確認中...</span>;
    }
    if (testResult === "ok") {
      return <span className="status-chip ok">接続可</span>;
    }
    if (testResult === "error") {
      return <span className="status-chip err">接続不可</span>;
    }
    if (checkResult === "set") {
      return <span className="status-chip ok">設定済み</span>;
    }
    if (checkResult === "not_set" || checkResult === "error") {
      return <span className="status-chip unrun">未設定</span>;
    }
    return <span className="status-chip unrun">未確認</span>;
  };

  const dbCardHeaderBase: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    background: "#f7f7f7",
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    cursor: "pointer",
    userSelect: "none",
  };

  const dbCardBodyStyle: React.CSSProperties = {
    padding: "10px 12px",
    border: "1px solid #e0e0e0",
    borderTop: "none",
    borderRadius: "0 0 6px 6px",
    marginTop: -1,
    marginBottom: 12,
    background: "#fff",
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
      {/* Section 2: Literature DB API Settings (collapsible cards)         */}
      {/* ================================================================ */}
      <section className="panel" style={{ marginTop: 12 }}>
        <h2>文献データベースAPI設定</h2>

        {/* ── PubMed card ── */}
        {(() => {
          const key = "pubmed";
          const isExp = dbExpanded[key];
          return (
            <div>
              <div
                style={{
                  ...dbCardHeaderBase,
                  borderRadius: isExp ? "6px 6px 0 0" : 6,
                  marginBottom: isExp ? 0 : 6,
                }}
                onClick={() => toggleDb(key)}
              >
                <input
                  type="checkbox"
                  checked={pubmedEnabled}
                  onChange={(e) => {
                    e.stopPropagation();
                    onPubmedEnabledChange(e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ margin: 0 }}
                />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                  PubMed / NCBI API
                </span>
                {dbChip(pubmedEnabled, pubmedConnectionTestResult, pubmedEnvCheckResult)}
                <span style={{ fontSize: 11, color: "#888" }}>
                  {isExp ? "▼ 折りたたむ" : "▶ 展開"}
                </span>
              </div>
              {isExp && (
                <div style={dbCardBodyStyle} onClick={(e) => e.stopPropagation()}>
                  {!pubmedEnabled ? (
                    <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                      PubMed / NCBI APIは未使用です。使用する場合はチェックを入れてください。
                    </p>
                  ) : (
                    <div>
                      <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px 0" }}>
                        PubMed検索・書誌情報取得に使用します。APIキーがなくても利用できますが、
                        NCBI_API_KEYを設定するとレート制限が緩和されます。
                      </p>
                      <div className="api-key-mode-row">
                        <label className="api-key-mode-label">APIキー設定方式</label>
                        <label className="api-key-radio-label">
                          <input type="radio" name="pubmed-key-mode" value="direct"
                            checked={pubmedApiKeyMode === "direct"}
                            onChange={() => onPubmedApiKeyModeChange("direct")} />
                          APIキーを直接入力
                        </label>
                        <label className="api-key-radio-label">
                          <input type="radio" name="pubmed-key-mode" value="env_var"
                            checked={pubmedApiKeyMode === "env_var"}
                            onChange={() => onPubmedApiKeyModeChange("env_var")} />
                          環境変数名を指定
                        </label>
                      </div>
                      {pubmedApiKeyMode === "direct" ? (
                        <>
                          <input type="password" className="llm-input llm-input-wide"
                            style={{ marginTop: 8 }} placeholder="APIキーを入力"
                            value={pubmedApiKey}
                            onChange={(e) => onPubmedApiKeyChange(e.target.value)} />
                          <div className="api-key-action-row">
                            <button onClick={onTestPubmedConnection}>接続確認</button>
                            {pubmedConnectionTestResult && (
                              <span className={`status-chip ${pubmedConnectionTestResult === "ok" ? "ok" : pubmedConnectionTestResult === "testing" ? "running" : "err"}`}>
                                {pubmedConnectionTestResult === "ok" ? "接続可" : pubmedConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <input type="text" className="llm-input llm-input-wide"
                            style={{ marginTop: 8 }}
                            placeholder="NCBI_API_KEY"
                            value={pubmedApiKeyEnvName}
                            onChange={(e) => onPubmedApiKeyEnvNameChange(e.target.value)} />
                          <div className="api-key-action-row">
                            <button onClick={onCheckPubmedEnv} disabled={!pubmedApiKeyEnvName.trim()}>
                              環境変数を確認
                            </button>
                            {pubmedEnvCheckResult && (
                              <span className={`status-chip ${pubmedEnvCheckResult === "set" ? "ok" : "err"}`}>
                                {pubmedEnvCheckResult === "set" ? "設定済み" : "未設定"}
                              </span>
                            )}
                            <button onClick={onTestPubmedConnection}>接続確認</button>
                            {pubmedConnectionTestResult && (
                              <span className={`status-chip ${pubmedConnectionTestResult === "ok" ? "ok" : pubmedConnectionTestResult === "testing" ? "running" : "err"}`}>
                                {pubmedConnectionTestResult === "ok" ? "接続可" : pubmedConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}
                              </span>
                            )}
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

        {/* ── Google Books card ── */}
        {(() => {
          const key = "googleBooks";
          const isExp = dbExpanded[key];
          return (
            <div>
              <div
                style={{
                  ...dbCardHeaderBase,
                  borderRadius: isExp ? "6px 6px 0 0" : 6,
                  marginBottom: isExp ? 0 : 6,
                }}
                onClick={() => toggleDb(key)}
              >
                <input
                  type="checkbox"
                  checked={googleBooksEnabled}
                  onChange={(e) => {
                    e.stopPropagation();
                    onGoogleBooksEnabledChange(e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ margin: 0 }}
                />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                  Google Books API
                </span>
                {dbChip(googleBooksEnabled, gbConnectionTestResult, gbEnvCheckResult)}
                <span style={{ fontSize: 11, color: "#888" }}>
                  {isExp ? "▼ 折りたたむ" : "▶ 展開"}
                </span>
              </div>
              {isExp && (
                <div style={dbCardBodyStyle} onClick={(e) => e.stopPropagation()}>
                  {!googleBooksEnabled ? (
                    <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                      Google Books APIは未使用です。使用する場合はチェックを入れてください。
                    </p>
                  ) : (
                    <div>
                      <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px 0" }}>
                        Google Books APIキーを設定すると、レート制限が緩和され、より多くのリクエストが可能になります。
                        未設定でも基本検索は利用可能です。
                      </p>
                      <div className="api-key-mode-row">
                        <label className="api-key-mode-label">APIキー設定方式</label>
                        <label className="api-key-radio-label">
                          <input type="radio" name="gb-key-mode" value="direct"
                            checked={googleBooksApiKeyMode === "direct"}
                            onChange={() => onGoogleBooksApiKeyModeChange("direct")} />
                          APIキーを直接入力
                        </label>
                        <label className="api-key-radio-label">
                          <input type="radio" name="gb-key-mode" value="env_var"
                            checked={googleBooksApiKeyMode === "env_var"}
                            onChange={() => onGoogleBooksApiKeyModeChange("env_var")} />
                          環境変数名を指定
                        </label>
                      </div>
                      {googleBooksApiKeyMode === "direct" ? (
                        <>
                          <input type="password" className="llm-input llm-input-wide"
                            style={{ marginTop: 8 }} placeholder="APIキーを入力"
                            value={googleBooksApiKey}
                            onChange={(e) => onGoogleBooksApiKeyChange(e.target.value)} />
                          <div className="api-key-action-row">
                            <button onClick={onTestGbConnection}>接続確認</button>
                            {gbConnectionTestResult && (
                              <span className={`status-chip ${gbConnectionTestResult === "ok" ? "ok" : gbConnectionTestResult === "testing" ? "running" : "err"}`}>
                                {gbConnectionTestResult === "ok" ? "接続可" : gbConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <input type="text" className="llm-input llm-input-wide"
                            style={{ marginTop: 8 }}
                            placeholder="GOOGLE_BOOKS_API_KEY"
                            value={googleBooksApiKeyEnvName}
                            onChange={(e) => onGoogleBooksApiKeyEnvNameChange(e.target.value)} />
                          <div className="api-key-action-row">
                            <button onClick={onCheckGbEnv} disabled={!googleBooksApiKeyEnvName.trim()}>
                              環境変数を確認
                            </button>
                            {gbEnvCheckResult && (
                              <span className={`status-chip ${gbEnvCheckResult === "set" ? "ok" : "err"}`}>
                                {gbEnvCheckResult === "set" ? "設定済み" : "未設定"}
                              </span>
                            )}
                            <button onClick={onTestGbConnection}>接続確認</button>
                            {gbConnectionTestResult && (
                              <span className={`status-chip ${gbConnectionTestResult === "ok" ? "ok" : gbConnectionTestResult === "testing" ? "running" : "err"}`}>
                                {gbConnectionTestResult === "ok" ? "接続可" : gbConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}
                              </span>
                            )}
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

        {/* ── Semantic Scholar card ── */}
        {(() => {
          const key = "semanticScholar";
          const isExp = dbExpanded[key];
          return (
            <div>
              <div
                style={{
                  ...dbCardHeaderBase,
                  borderRadius: isExp ? "6px 6px 0 0" : 6,
                  marginBottom: isExp ? 0 : 6,
                }}
                onClick={() => toggleDb(key)}
              >
                <input
                  type="checkbox"
                  checked={semanticScholarEnabled}
                  onChange={(e) => {
                    e.stopPropagation();
                    onSemanticScholarEnabledChange(e.target.checked);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{ margin: 0 }}
                />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>
                  Semantic Scholar API
                </span>
                {dbChip(semanticScholarEnabled, ssConnectionTestResult, ssEnvCheckResult)}
                <span style={{ fontSize: 11, color: "#888" }}>
                  {isExp ? "▼ 折りたたむ" : "▶ 展開"}
                </span>
              </div>
              {isExp && (
                <div style={dbCardBodyStyle} onClick={(e) => e.stopPropagation()}>
                  {!semanticScholarEnabled ? (
                    <p style={{ fontSize: 12, color: "#888", margin: 0 }}>
                      Semantic Scholar APIは未使用です。使用する場合はチェックを入れてください。
                    </p>
                  ) : (
                    <div>
                      <p style={{ fontSize: 11, color: "#888", margin: "0 0 10px 0" }}>
                        Crossref/PubMedで見つからない論文、DOIなし文献、古い文献などの
                        検索候補取得に使用します。
                      </p>
                      <div className="api-key-mode-row">
                        <label className="api-key-mode-label">APIキー設定方式</label>
                        <label className="api-key-radio-label">
                          <input type="radio" name="ss-key-mode" value="direct"
                            checked={semanticScholarApiKeyMode === "direct"}
                            onChange={() => onSemanticScholarApiKeyModeChange("direct")} />
                          APIキーを直接入力
                        </label>
                        <label className="api-key-radio-label">
                          <input type="radio" name="ss-key-mode" value="env_var"
                            checked={semanticScholarApiKeyMode === "env_var"}
                            onChange={() => onSemanticScholarApiKeyModeChange("env_var")} />
                          環境変数名を指定
                        </label>
                      </div>
                      {semanticScholarApiKeyMode === "direct" ? (
                        <>
                          <input type="password" className="llm-input llm-input-wide"
                            style={{ marginTop: 8 }} placeholder="APIキーを入力"
                            value={semanticScholarApiKey}
                            onChange={(e) => onSemanticScholarApiKeyChange(e.target.value)} />
                          <div className="api-key-action-row">
                            <button onClick={onTestSsConnection}>接続確認</button>
                            {ssConnectionTestResult && (
                              <span className={`status-chip ${ssConnectionTestResult === "ok" ? "ok" : ssConnectionTestResult === "testing" ? "running" : "err"}`}>
                                {ssConnectionTestResult === "ok" ? "接続可" : ssConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}
                              </span>
                            )}
                          </div>
                        </>
                      ) : (
                        <>
                          <input type="text" className="llm-input llm-input-wide"
                            style={{ marginTop: 8 }}
                            placeholder="SEMANTIC_SCHOLAR_API_KEY"
                            value={semanticScholarApiKeyEnvName}
                            onChange={(e) => onSemanticScholarApiKeyEnvNameChange(e.target.value)} />
                          <div className="api-key-action-row">
                            <button onClick={onCheckSsEnv} disabled={!semanticScholarApiKeyEnvName.trim()}>
                              環境変数を確認
                            </button>
                            {ssEnvCheckResult && (
                              <span className={`status-chip ${ssEnvCheckResult === "set" ? "ok" : "err"}`}>
                                {ssEnvCheckResult === "set" ? "設定済み" : "未設定"}
                              </span>
                            )}
                            <button onClick={onTestSsConnection}>接続確認</button>
                            {ssConnectionTestResult && (
                              <span className={`status-chip ${ssConnectionTestResult === "ok" ? "ok" : ssConnectionTestResult === "testing" ? "running" : "err"}`}>
                                {ssConnectionTestResult === "ok" ? "接続可" : ssConnectionTestResult === "testing" ? "接続確認中..." : "接続不可"}
                              </span>
                            )}
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
      </section>
    </div>
  );
}
