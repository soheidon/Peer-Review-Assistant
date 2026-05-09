import type { ReactNode } from "react";

/* ── types ─────────────────────────────────────────────────────────────── */

export interface ApiKeySettingBlockProps {
  title: string;
  description?: string;
  keyMode: "direct" | "env_var";
  apiKey: string;
  envName: string;
  defaultEnvName: string;
  onModeChange: (mode: "direct" | "env_var") => void;
  onApiKeyChange: (value: string) => void;
  onEnvNameChange: (value: string) => void;
  onCheckEnv: () => void;
  onTestConnection: () => void;
  checkResult: string;   // "" | "set" | "not_set" | "error"
  testResult: string;    // "" | "ok" | "error" | "testing"
  extraFields?: ReactNode;
  showTestButton?: boolean;
}

/* ── component ─────────────────────────────────────────────────────────── */

export default function ApiKeySettingBlock({
  title,
  description,
  keyMode,
  apiKey,
  envName,
  defaultEnvName,
  onModeChange,
  onApiKeyChange,
  onEnvNameChange,
  onCheckEnv,
  onTestConnection,
  checkResult,
  testResult,
  extraFields,
  showTestButton = true,
}: ApiKeySettingBlockProps) {
  return (
    <section className="panel" style={{ marginTop: 12 }}>
      <h2>{title}</h2>
      {description && (
        <p className="disabled-reason" style={{ marginBottom: 8 }}>
          {description}
        </p>
      )}

      {/* Mode selection: direct or env_var */}
      <div className="api-key-mode-row">
        <label className="api-key-mode-label">
          APIキー設定方式
        </label>
        <label className="api-key-radio-label">
          <input
            type="radio"
            name={`${title}-key-mode`}
            value="direct"
            checked={keyMode === "direct"}
            onChange={() => onModeChange("direct")}
          />
          APIキーを直接入力
        </label>
        <label className="api-key-radio-label">
          <input
            type="radio"
            name={`${title}-key-mode`}
            value="env_var"
            checked={keyMode === "env_var"}
            onChange={() => onModeChange("env_var")}
          />
          環境変数名を指定
        </label>
      </div>

      {/* Direct input mode */}
      {keyMode === "direct" && (
        <div className="form-group">
          <label className="api-key-field-label">APIキー</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            placeholder="APIキーを入力"
            className="llm-input llm-input-wide"
          />
        </div>
      )}

      {/* Env var mode */}
      {keyMode === "env_var" && (
        <div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label className="api-key-field-label">環境変数名</label>
            <input
              type="text"
              value={envName}
              onChange={(e) => onEnvNameChange(e.target.value)}
              placeholder={defaultEnvName}
              className="llm-input llm-input-wide"
            />
          </div>

          {extraFields}

          <div className="api-key-action-row">
            <button onClick={onCheckEnv} disabled={!envName.trim()}>
              環境変数を確認
            </button>
            {checkResult && (
              <span
                className={`status-chip ${checkResult === "set" ? "ok" : "err"}`}
              >
                {checkResult === "set" ? "設定済み" : "未設定"}
              </span>
            )}
            {showTestButton && (
              <button onClick={onTestConnection}>
                接続確認
              </button>
            )}
            {testResult && (
              <span
                className={`status-chip ${testResult === "ok" ? "ok" : "err"} ${testResult === "testing" ? "running" : ""}`}
              >
                {testResult === "ok"
                  ? "接続可"
                  : testResult === "testing"
                  ? "接続確認中..."
                  : "接続不可"}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Direct mode: show test button below the key input */}
      {keyMode === "direct" && (
        <div className="api-key-action-row">
          {showTestButton && (
            <button onClick={onTestConnection}>
              接続確認
            </button>
          )}
          {testResult && (
            <span
              className={`status-chip ${testResult === "ok" ? "ok" : "err"} ${testResult === "testing" ? "running" : ""}`}
            >
              {testResult === "ok"
                ? "接続可"
                : testResult === "testing"
                ? "接続確認中..."
                : "接続不可"}
            </span>
          )}
        </div>
      )}
    </section>
  );
}
