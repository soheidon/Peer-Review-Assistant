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

const SLOT_LABELS: Record<string, string> = {
  summary: "Summary",
  reviewer1: "評価者1",
  reviewer2: "評価者2",
  reviewer3: "評価者3",
};

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
        <h2>API 設定</h2>
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
              <input
                type="password"
                value={slot.apiKey}
                onChange={(e) => onUpdateSlot(slot.name, "apiKey", e.target.value)}
                placeholder="APIキー"
                className="llm-input"
              />
              <button
                onClick={() => onTestSlot(slot.name)}
                disabled={llmTestResults[slot.name] === "testing"}
              >
                {llmTestResults[slot.name] === "testing" ? "確認中..." : "接続確認"}
              </button>
            </div>
          </div>
        ))}
        <div className="row">
          <button onClick={onTestAll} disabled={!allConfigured}>
            すべて接続確認
          </button>
        </div>
      </section>
    </div>
  );
}
