import { useState, useEffect } from "react";
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
  const [citationExtractionDone, setCitationExtractionDone] = useState(false);
  const [crossrefDone, setCrossrefDone] = useState(false);
  const [structureCheckResults, setStructureCheckResults] = useState<Record<string, string>>({});
  const [structureMergeDone, setStructureMergeDone] = useState(false);
  const [structureMergeRunning, setStructureMergeRunning] = useState(false);
  const [expressionCheckResults, setExpressionCheckResults] = useState<Record<string, string>>({});
  const [methodsStatsCheckResults, setMethodsStatsCheckResults] = useState<Record<string, string>>({});
  const [expressionMergeDone, setExpressionMergeDone] = useState(false);
  const [expressionMergeRunning, setExpressionMergeRunning] = useState(false);
  const [finalMergeDone, setFinalMergeDone] = useState(false);
  const [finalMergeRunning, setFinalMergeRunning] = useState(false);
  const [selectedResultFile, setSelectedResultFile] = useState("final_review.md");
  const [resultFileContent, setResultFileContent] = useState("");
  const [resultFileLoading, setResultFileLoading] = useState(false);

  const defaultSlots = [
    { name: "summary", provider: "", baseUrl: "", model: "", apiKey: "" },
    { name: "reviewer1", provider: "", baseUrl: "", model: "", apiKey: "" },
    { name: "reviewer2", provider: "", baseUrl: "", model: "", apiKey: "" },
    { name: "reviewer3", provider: "", baseUrl: "", model: "", apiKey: "" },
  ];
  const [llmSlots, setLlmSlots] = useState(defaultSlots);
  const [llmTestResults, setLlmTestResults] = useState<Record<string, string>>({});

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

  const runExtractCitations = async () => {
    setCitationExtractionDone(false);
    addLog({ event: "info", message: "Extracting citations..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "extract-citations",
        "--project",
        projectPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) setCitationExtractionDone(true);
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const runCrossrefDb = async () => {
    setCrossrefDone(false);
    addLog({ event: "info", message: "Checking Crossref database..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "citation-db-crossref",
        "--project",
        projectPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) setCrossrefDone(true);
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
    }
  };

  const updateSlot = (slotName: string, field: string, value: string) => {
    setLlmSlots((prev) =>
      prev.map((s) => (s.name === slotName ? { ...s, [field]: value } : s))
    );
  };

  const testLlmSlot = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim()) {
      addLog({ event: "error", message: `${slotName}: Please fill in provider, base URL, and model.` });
      return;
    }
    if (!slot.apiKey.trim()) {
      addLog({ event: "error", message: `${slotName}: Please enter an API key.` });
      return;
    }

    setLlmTestResults((prev) => ({ ...prev, [slotName]: "testing" }));
    addLog({ event: "info", message: `Testing LLM connection for ${slotName}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "test-llm",
        "--slot", slotName,
        "--provider", slot.provider,
        "--base-url", slot.baseUrl,
        "--model", slot.model,
        "--api-key", slot.apiKey,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setLlmTestResults((prev) => ({ ...prev, [slotName]: "ok" }));
      } else {
        setLlmTestResults((prev) => ({ ...prev, [slotName]: "error" }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setLlmTestResults((prev) => ({ ...prev, [slotName]: "error" }));
    }
  };

  const testAllLlm = async () => {
    for (const slot of llmSlots) {
      await testLlmSlot(slot.name);
    }
  };

  const runStructureCheck = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim() || !slot.apiKey.trim()) {
      addLog({ event: "error", message: `${slotName}: Please configure provider, base URL, model, and API key in API Settings.` });
      return;
    }

    setStructureCheckResults((prev) => ({ ...prev, [slotName]: "running" }));
    addLog({ event: "info", message: `Running structure check with ${slotName}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "run-check",
        "--project", projectPath,
        "--check", "structure",
        "--slot", slotName,
        "--provider", slot.provider,
        "--base-url", slot.baseUrl,
        "--model", slot.model,
        "--api-key", slot.apiKey,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setStructureCheckResults((prev) => ({ ...prev, [slotName]: "done" }));
      } else {
        setStructureCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStructureCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
    }
  };

  const runExpressionCheck = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim() || !slot.apiKey.trim()) {
      addLog({ event: "error", message: `${slotName}: Please configure provider, base URL, model, and API key in API Settings.` });
      return;
    }

    setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "running" }));
    addLog({ event: "info", message: `Running expression check with ${slotName}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "run-check",
        "--project", projectPath,
        "--check", "expression",
        "--slot", slotName,
        "--provider", slot.provider,
        "--base-url", slot.baseUrl,
        "--model", slot.model,
        "--api-key", slot.apiKey,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "done" }));
      } else {
        setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
    }
  };

  const runMethodsStatsCheck = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim() || !slot.apiKey.trim()) {
      addLog({ event: "error", message: `${slotName}: Please configure provider, base URL, model, and API key in API Settings.` });
      return;
    }

    setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "running" }));
    addLog({ event: "info", message: `Running methods/stats check with ${slotName}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "run-check",
        "--project", projectPath,
        "--check", "methods_stats",
        "--slot", slotName,
        "--provider", slot.provider,
        "--base-url", slot.baseUrl,
        "--model", slot.model,
        "--api-key", slot.apiKey,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "done" }));
      } else {
        setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
    }
  };

  const runMergeStructure = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    if (llmSlots.filter((s) => s.name.startsWith("reviewer")).every(
      (s) => structureCheckResults[s.name] !== "done"
    )) {
      addLog({ event: "error", message: "At least one reviewer must complete a structure check first." });
      return;
    }

    setStructureMergeRunning(true);
    addLog({ event: "info", message: "Merging structure check results..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "merge-section",
        "--project", projectPath,
        "--check", "structure",
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setStructureMergeDone(true);
        setStructureMergeRunning(false);
      } else {
        setStructureMergeRunning(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStructureMergeRunning(false);
    }
  };

  const runMergeExpression = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    if (llmSlots.filter((s) => s.name.startsWith("reviewer")).every(
      (s) => expressionCheckResults[s.name] !== "done"
    )) {
      addLog({ event: "error", message: "At least one reviewer must complete an expression check first." });
      return;
    }

    setExpressionMergeRunning(true);
    addLog({ event: "info", message: "Merging expression check results..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "merge-section",
        "--project", projectPath,
        "--check", "expression",
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setExpressionMergeDone(true);
        setExpressionMergeRunning(false);
      } else {
        setExpressionMergeRunning(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setExpressionMergeRunning(false);
    }
  };

  const runFinalMerge = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setFinalMergeRunning(true);
    addLog({ event: "info", message: "Generating final review..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "final-merge",
        "--project", projectPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setFinalMergeDone(true);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
    } finally {
      setFinalMergeRunning(false);
    }
  };

  const loadResultFile = async (filename: string) => {
    if (!projectPath.trim()) return;
    const filePath = `${projectPath.replace(/\\/g, "/")}/outputs/final/${filename}`;
    setResultFileLoading(true);
    setSelectedResultFile(filename);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const content = await invoke<string>("read_text_file", { path: filePath });
      setResultFileContent(content);
    } catch {
      setResultFileContent("(File not found or could not be read)");
    } finally {
      setResultFileLoading(false);
    }
  };

  const reloadResults = () => {
    loadResultFile(selectedResultFile);
  };

  const openOutputFolder = async () => {
    if (!projectPath.trim()) return;
    try {
      const { open: shellOpen } = await import("@tauri-apps/plugin-shell");
      const finalDir = `${projectPath.replace(/\\/g, "/")}/outputs/final`;
      await shellOpen(`file:///${finalDir}`);
    } catch {
      // ignore - folder may not exist
    }
  };

  useEffect(() => {
    if (finalMergeDone && projectPath.trim()) {
      loadResultFile("final_review.md");
    }
  }, [finalMergeDone]);

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
        <h2>API Settings</h2>
        {llmSlots.map((slot) => (
          <div key={slot.name} className="llm-slot-row">
            <div className="llm-slot-header">
              <span className="llm-slot-label">{slot.name}</span>
              {llmTestResults[slot.name] && llmTestResults[slot.name] !== "testing" && (
                <span className={`status-chip ${llmTestResults[slot.name] === "ok" ? "ok" : "err"}`}>
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
                onChange={(e) => updateSlot(slot.name, "provider", e.target.value)}
                placeholder="Provider (e.g., openai, deepseek)"
                className="llm-input"
              />
              <input
                type="text"
                value={slot.baseUrl}
                onChange={(e) => updateSlot(slot.name, "baseUrl", e.target.value)}
                placeholder="Base URL"
                className="llm-input llm-input-wide"
              />
              <input
                type="text"
                value={slot.model}
                onChange={(e) => updateSlot(slot.name, "model", e.target.value)}
                placeholder="Model"
                className="llm-input"
              />
              <input
                type="password"
                value={slot.apiKey}
                onChange={(e) => updateSlot(slot.name, "apiKey", e.target.value)}
                placeholder="API Key"
                className="llm-input"
              />
              <button
                onClick={() => testLlmSlot(slot.name)}
                disabled={llmTestResults[slot.name] === "testing"}
              >
                Test
              </button>
            </div>
          </div>
        ))}
        <div className="row">
          <button onClick={testAllLlm} disabled={llmSlots.some((s) => !s.provider.trim() || !s.baseUrl.trim() || !s.model.trim() || !s.apiKey.trim())}>
            Test All Connections
          </button>
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
        <div className="row">
          <button onClick={runExtractCitations} disabled={!sectionsDone}>
            Extract Citations
          </button>
          {citationExtractionDone && <span className="status-chip ok">Done</span>}
        </div>
        <div className="row">
          <button onClick={runCrossrefDb} disabled={!citationExtractionDone}>
            Crossref DB Check
          </button>
          {crossrefDone && <span className="status-chip ok">Done</span>}
        </div>
      </section>

      <section className="panel">
        <h2>Review Checks</h2>
        <div className="row">
          <span className="llm-slot-label">Structure</span>
          {llmSlots.filter((s) => s.name.startsWith("reviewer")).map((slot) => (
            <div key={slot.name} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                onClick={() => runStructureCheck(slot.name)}
                disabled={!crossrefDone || structureCheckResults[slot.name] === "running"}
              >
                {slot.name}
              </button>
              {structureCheckResults[slot.name] && structureCheckResults[slot.name] !== "running" && (
                <span className={`status-chip ${structureCheckResults[slot.name] === "done" ? "ok" : "err"}`}>
                  {structureCheckResults[slot.name] === "done" ? "Done" : "Failed"}
                </span>
              )}
              {structureCheckResults[slot.name] === "running" && (
                <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
                  Running...
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="row">
          <span className="llm-slot-label">Expression</span>
          {llmSlots.filter((s) => s.name.startsWith("reviewer")).map((slot) => (
            <div key={slot.name} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                onClick={() => runExpressionCheck(slot.name)}
                disabled={!crossrefDone || expressionCheckResults[slot.name] === "running"}
              >
                {slot.name}
              </button>
              {expressionCheckResults[slot.name] && expressionCheckResults[slot.name] !== "running" && (
                <span className={`status-chip ${expressionCheckResults[slot.name] === "done" ? "ok" : "err"}`}>
                  {expressionCheckResults[slot.name] === "done" ? "Done" : "Failed"}
                </span>
              )}
              {expressionCheckResults[slot.name] === "running" && (
                <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
                  Running...
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="row">
          <span className="llm-slot-label">Methods/Stats</span>
          {llmSlots.filter((s) => s.name.startsWith("reviewer")).map((slot) => (
            <div key={slot.name} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                onClick={() => runMethodsStatsCheck(slot.name)}
                disabled={!crossrefDone || methodsStatsCheckResults[slot.name] === "running"}
              >
                {slot.name}
              </button>
              {methodsStatsCheckResults[slot.name] && methodsStatsCheckResults[slot.name] !== "running" && (
                <span className={`status-chip ${methodsStatsCheckResults[slot.name] === "done" ? "ok" : "err"}`}>
                  {methodsStatsCheckResults[slot.name] === "done" ? "Done" : "Failed"}
                </span>
              )}
              {methodsStatsCheckResults[slot.name] === "running" && (
                <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
                  Running...
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="row">
          <button
            onClick={runMergeStructure}
            disabled={
              structureMergeDone ||
              structureMergeRunning ||
              llmSlots.filter((s) => s.name.startsWith("reviewer")).every(
                (s) => structureCheckResults[s.name] !== "done"
              )
            }
          >
            Merge Structure Results
          </button>
          {structureMergeDone && <span className="status-chip ok">Merged</span>}
          {structureMergeRunning && (
            <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
              Merging...
            </span>
          )}
        </div>
        <div className="row">
          <button
            onClick={runMergeExpression}
            disabled={
              expressionMergeDone ||
              expressionMergeRunning ||
              llmSlots.filter((s) => s.name.startsWith("reviewer")).every(
                (s) => expressionCheckResults[s.name] !== "done"
              )
            }
          >
            Merge Expression Results
          </button>
          {expressionMergeDone && <span className="status-chip ok">Merged</span>}
          {expressionMergeRunning && (
            <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
              Merging...
            </span>
          )}
        </div>
        <div className="row">
          <button
            onClick={runFinalMerge}
            disabled={!structureMergeDone || finalMergeDone || finalMergeRunning}
          >
            Generate Final Review
          </button>
          {finalMergeDone && <span className="status-chip ok">Generated</span>}
          {finalMergeRunning && (
            <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
              Generating...
            </span>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Results</h2>
        <div className="row">
          {[
            { file: "final_review.md", label: "Final Review" },
            { file: "comments_to_authors.md", label: "Comments to Authors" },
            { file: "confidential_comments_to_editor.md", label: "Confidential to Editor" },
            { file: "recommendation.md", label: "Recommendation" },
            { file: "audit_trail.json", label: "Audit Trail" },
          ].map(({ file, label }) => (
            <button
              key={file}
              onClick={() => loadResultFile(file)}
              disabled={!projectPath.trim()}
              style={
                selectedResultFile === file
                  ? { fontWeight: "bold", backgroundColor: "#d0e4f7" }
                  : {}
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="row">
          <button onClick={reloadResults} disabled={!projectPath.trim()}>
            Reload Results
          </button>
          <button onClick={openOutputFolder} disabled={!projectPath.trim()}>
            Open Output Folder
          </button>
          {resultFileLoading && (
            <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
              Loading...
            </span>
          )}
        </div>
        <pre className="result-content">
          {resultFileContent || "Select a file to view results."}
        </pre>
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
