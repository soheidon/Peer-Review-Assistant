import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";

interface LogEntry {
  event: string;
  [key: string]: unknown;
}

function App() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [projectPath, setProjectPath] = useState("");
  const [healthcheckStatus, setHealthcheckStatus] = useState<string | null>(null);
  const [projectCreated, setProjectCreated] = useState(false);

  const addLog = (entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  };

  const clearLogs = () => setLogs([]);

  const runHealthcheck = async () => {
    setHealthcheckStatus("running");
    addLog({ event: "info", message: "Running healthcheck..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", ["healthcheck"]);
      const output = await cmd.execute();

      const lines = output.stdout.trim().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            addLog(parsed);
            if (parsed.event === "healthcheck") {
              setHealthcheckStatus(parsed.status);
            }
          } catch {
            addLog({ event: "stdout", message: line });
          }
        }
      }
      if (output.stderr) {
        addLog({ event: "stderr", message: output.stderr });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setHealthcheckStatus("error");
    }
  };

  const browseFolder = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "Select project folder",
    });
    if (selected && typeof selected === "string") {
      setProjectPath(selected);
    }
  };

  const createProject = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please select a project folder first." });
      return;
    }

    // Client-side release/ check
    const normalized = projectPath.replace(/\\/g, "/").toLowerCase();
    if (normalized.includes("/release/") || normalized.endsWith("/release")) {
      addLog({
        event: "error",
        message: "Project folder must not be inside a release/ directory.",
      });
      return;
    }

    setProjectCreated(false);
    addLog({ event: "info", message: `Creating project: ${projectPath}` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "init-project",
        "--project",
        projectPath,
      ]);
      const output = await cmd.execute();

      const lines = output.stdout.trim().split("\n");
      for (const line of lines) {
        if (line.trim()) {
          try {
            const parsed = JSON.parse(line);
            addLog(parsed);
            if (parsed.event === "done") {
              setProjectCreated(true);
            }
          } catch {
            addLog({ event: "stdout", message: line });
          }
        }
      }
      if (output.stderr) {
        addLog({ event: "stderr", message: output.stderr });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
    }
  };

  const logLineStyle = (entry: LogEntry): React.CSSProperties => {
    let color = "#ccc";
    if (entry.event === "done" || entry.event === "healthcheck" || entry.status === "ok")
      color = "#4f4";
    else if (entry.event === "error") color = "#f44";
    else if (entry.event === "progress") color = "#fa0";
    return { color, margin: 0, fontSize: "13px", fontFamily: "monospace" };
  };

  return (
    <div className="container">
      <header>
        <h1>Peer Review Assistant</h1>
        <p className="subtitle">査読アシスタント v0.1.0</p>
      </header>

      <section className="panel">
        <h2>System</h2>
        <button onClick={runHealthcheck} disabled={healthcheckStatus === "running"}>
          Python CLI healthcheck
        </button>
        {healthcheckStatus && healthcheckStatus !== "running" && (
          <span className={`status-chip ${healthcheckStatus === "ok" ? "ok" : "err"}`}>
            {healthcheckStatus === "ok" ? "OK" : "Error"}
          </span>
        )}
      </section>

      <section className="panel">
        <h2>Project</h2>
        <div className="row">
          <input
            type="text"
            value={projectPath}
            onChange={(e) => setProjectPath(e.target.value)}
            placeholder="Select a project folder..."
            className="path-input"
          />
          <button onClick={browseFolder}>Browse</button>
        </div>
        <div className="row">
          <button onClick={createProject}>Create New Project</button>
          {projectCreated && <span className="status-chip ok">Created</span>}
        </div>
      </section>

      <section className="panel log-panel">
        <div className="log-header">
          <h2>Log</h2>
          <button onClick={clearLogs} className="clear-btn">Clear</button>
        </div>
        <div className="log-area">
          {logs.length === 0 && (
            <p style={{ color: "#666", fontSize: "13px", fontFamily: "monospace" }}>
              Ready. Click a command above.
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

export default App;
