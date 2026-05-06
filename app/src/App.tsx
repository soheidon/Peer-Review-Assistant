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
  const [docxPath, setDocxPath] = useState("");
  const [pdfPath, setPdfPath] = useState("");
  const [validationOk, setValidationOk] = useState(false);
  const [sourceAttached, setSourceAttached] = useState(false);
  const [preprocessDone, setPreprocessDone] = useState(false);
  const [numberingDone, setNumberingDone] = useState(false);
  const [sectionsDone, setSectionsDone] = useState(false);

  const addLog = (entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  };

  const clearLogs = () => setLogs([]);

  const parseOutput = (stdout: string) => {
    const lines = stdout.trim().split("\n");
    for (const line of lines) {
      if (line.trim()) {
        try {
          addLog(JSON.parse(line));
        } catch {
          addLog({ event: "stdout", message: line });
        }
      }
    }
  };

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

  const browseDocx = async () => {
    const selected = await open({
      multiple: false,
      title: "Select manuscript .docx",
      filters: [{ name: "Word documents", extensions: ["docx"] }],
    });
    if (selected && typeof selected === "string") {
      setDocxPath(selected);
      setValidationOk(false);
      setSourceAttached(false);
    }
  };

  const browsePdf = async () => {
    const selected = await open({
      multiple: false,
      title: "Select line-numbered PDF",
      filters: [{ name: "PDF files", extensions: ["pdf"] }],
    });
    if (selected && typeof selected === "string") {
      setPdfPath(selected);
      setValidationOk(false);
      setSourceAttached(false);
    }
  };

  const createProject = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please select a project folder first." });
      return;
    }

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
      parseOutput(output.stdout);
      if (output.stderr) {
        addLog({ event: "stderr", message: output.stderr });
      }

      if (output.code === 0) {
        setProjectCreated(true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
    }
  };

  const validateInput = async () => {
    if (!docxPath.trim() || !pdfPath.trim()) {
      addLog({ event: "error", message: "Please select both docx and PDF files." });
      return;
    }

    setValidationOk(false);
    addLog({ event: "info", message: "Validating input files..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "validate-input",
        "--docx",
        docxPath,
        "--pdf",
        pdfPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) {
        addLog({ event: "stderr", message: output.stderr });
      }

      if (output.code === 0) {
        setValidationOk(true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
    }
  };

  const attachSource = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setSourceAttached(false);
    addLog({ event: "info", message: "Attaching source files..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "attach-source",
        "--project",
        projectPath,
        "--docx",
        docxPath,
        "--pdf",
        pdfPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) {
        addLog({ event: "stderr", message: output.stderr });
      }

      if (output.code === 0) {
        setSourceAttached(true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
    }
  };

  const preprocessSource = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setPreprocessDone(false);
    addLog({ event: "info", message: "Preprocessing docx..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "preprocess-docx",
        "--project",
        projectPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) {
        addLog({ event: "stderr", message: output.stderr });
      }

      if (output.code === 0) {
        setPreprocessDone(true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
    }
  };

  const runNumbering = async () => {
    setNumberingDone(false);
    addLog({ event: "info", message: "Running paragraph/sentence numbering..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "preprocess-numbering",
        "--project",
        projectPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) setNumberingDone(true);
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const runSections = async () => {
    setSectionsDone(false);
    addLog({ event: "info", message: "Splitting manuscript into sections..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "preprocess-sections",
        "--project",
        projectPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) setSectionsDone(true);
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const logLineStyle = (entry: LogEntry): React.CSSProperties => {
    let color = "#555";
    if (entry.event === "done" || entry.event === "healthcheck" || entry.status === "ok")
      color = "#107c10";
    else if (entry.event === "error") color = "#c42b1c";
    else if (entry.event === "progress") color = "#ca5010";
    return { color, margin: 0, fontSize: "12px", fontFamily: "monospace" };
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

      <section className="panel">
        <h2>Source</h2>
        <div className="row">
          <input
            type="text"
            value={docxPath}
            onChange={(e) => setDocxPath(e.target.value)}
            placeholder="Select manuscript .docx..."
            className="path-input"
          />
          <button onClick={browseDocx}>Browse</button>
        </div>
        <div className="row">
          <input
            type="text"
            value={pdfPath}
            onChange={(e) => setPdfPath(e.target.value)}
            placeholder="Select line-numbered PDF..."
            className="path-input"
          />
          <button onClick={browsePdf}>Browse</button>
        </div>
        <div className="row">
          <button onClick={validateInput}>Validate Input Files</button>
          {validationOk && <span className="status-chip ok">Valid</span>}
        </div>
        <div className="row">
          <button onClick={attachSource} disabled={!validationOk || !projectCreated}>
            Attach to Project
          </button>
          {sourceAttached && <span className="status-chip ok">Attached</span>}
        </div>
        <div className="row">
          <button onClick={preprocessSource} disabled={!sourceAttached}>
            Preprocess docx
          </button>
          {preprocessDone && <span className="status-chip ok">Done</span>}
        </div>
        <div className="row">
          <button onClick={runNumbering} disabled={!preprocessDone}>
            Paragraph & Sentence Numbering
          </button>
          {numberingDone && <span className="status-chip ok">Done</span>}
        </div>
        <div className="row">
          <button onClick={runSections} disabled={!preprocessDone}>
            Split Sections
          </button>
          {sectionsDone && <span className="status-chip ok">Done</span>}
        </div>
      </section>

      <section className="panel log-panel">
        <div className="log-header">
          <h2>Log</h2>
          <button onClick={clearLogs} className="clear-btn">Clear</button>
        </div>
        <div className="log-area">
          {logs.length === 0 && (
            <p style={{ color: "#999", fontSize: "12px", fontFamily: "monospace" }}>
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
