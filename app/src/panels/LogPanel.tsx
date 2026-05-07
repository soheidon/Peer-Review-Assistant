import type { CSSProperties } from "react";

interface LogEntry {
  event: string;
  [key: string]: unknown;
}

interface LogPanelProps {
  logs: LogEntry[];
  onClearLogs: () => void;
  logLineStyle: (entry: LogEntry) => CSSProperties;
}

export default function LogPanel({
  logs,
  onClearLogs,
  logLineStyle,
}: LogPanelProps) {
  return (
    <div>
      <section className="panel log-panel">
        <div className="log-header">
          <h2>ログ</h2>
          <button onClick={onClearLogs} className="clear-btn">Clear</button>
        </div>
        <div className="log-area">
          {logs.length === 0 && (
            <p style={{ color: "#999", fontSize: "12px", fontFamily: "monospace" }}>
              コマンドを実行するとログが表示されます。
            </p>
          )}
          {logs.map((entry, i) => (
            <pre key={i} style={logLineStyle(entry)}>
              {JSON.stringify(entry)}
            </pre>
          ))}
        </div>
      </section>
    </div>
  );
}
