interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface SettingsPanelProps {
  llmSlots: LlmSlot[];
  llmTestResults: Record<string, string>;
  onUpdateSlot: (slotName: string, field: string, value: string) => void;
  onTestSlot: (slotName: string) => void;
  onTestAll: () => void;
}

export default function SettingsPanel({
  llmSlots,
  llmTestResults,
  onUpdateSlot,
  onTestSlot,
  onTestAll,
}: SettingsPanelProps) {
  const allConfigured = llmSlots.every(
    (s) => s.provider.trim() && s.baseUrl.trim() && s.model.trim() && s.apiKey.trim()
  );

  return (
    <div>
      <section className="panel">
        <h2>API Settings</h2>
        {llmSlots.map((slot) => (
          <div key={slot.name} className="llm-slot-row">
            <div className="llm-slot-header">
              <span className="llm-slot-label">{slot.name}</span>
              {llmTestResults[slot.name] &&
                llmTestResults[slot.name] !== "testing" && (
                  <span
                    className={`status-chip ${llmTestResults[slot.name] === "ok" ? "ok" : "err"}`}
                  >
                    {llmTestResults[slot.name] === "ok" ? "OK" : "Error"}
                  </span>
                )}
              {llmTestResults[slot.name] === "testing" && (
                <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
                  Testing...
                </span>
              )}
            </div>
            <div className="llm-slot-fields">
              <input
                type="text"
                value={slot.provider}
                onChange={(e) => onUpdateSlot(slot.name, "provider", e.target.value)}
                placeholder="Provider (e.g., openai, deepseek)"
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
                placeholder="Model"
                className="llm-input"
              />
              <input
                type="password"
                value={slot.apiKey}
                onChange={(e) => onUpdateSlot(slot.name, "apiKey", e.target.value)}
                placeholder="API Key"
                className="llm-input"
              />
              <button
                onClick={() => onTestSlot(slot.name)}
                disabled={llmTestResults[slot.name] === "testing"}
              >
                Test
              </button>
            </div>
          </div>
        ))}
        <div className="row">
          <button onClick={onTestAll} disabled={!allConfigured}>
            Test All Connections
          </button>
        </div>
      </section>
    </div>
  );
}
