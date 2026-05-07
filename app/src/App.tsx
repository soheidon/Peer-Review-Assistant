import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import Sidebar from "./Sidebar";
import ProgressBar from "./ProgressBar";
import HomePanel from "./panels/HomePanel";
import ProjectPanel from "./panels/ProjectPanel";
import PreprocessPanel from "./panels/PreprocessPanel";
import CitationReviewPanel from "./panels/CitationReviewPanel";
import ReviewChecksPanel from "./panels/ReviewChecksPanel";
import ResultsPanel from "./panels/ResultsPanel";
import SettingsPanel from "./panels/SettingsPanel";
import LogPanel from "./panels/LogPanel";

interface LogEntry {
  event: string;
  [key: string]: unknown;
}

function App() {
  const [activeView, setActiveView] = useState("home");
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
  const [viewerDataReady, setViewerDataReady] = useState(false);
  const [viewerDataGenerating, setViewerDataGenerating] = useState(false);
  const [structureCheckResults, setStructureCheckResults] = useState<Record<string, string>>({});
  const [structureMergeDone, setStructureMergeDone] = useState(false);
  const [structureMergeRunning, setStructureMergeRunning] = useState(false);
  const [expressionCheckResults, setExpressionCheckResults] = useState<Record<string, string>>({});
  const [methodsStatsCheckResults, setMethodsStatsCheckResults] = useState<Record<string, string>>({});
  const [methodsStatsMergeDone, setMethodsStatsMergeDone] = useState(false);
  const [methodsStatsMergeRunning, setMethodsStatsMergeRunning] = useState(false);
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

  const runViewerData = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setViewerDataGenerating(true);
    addLog({ event: "info", message: "Generating citation viewer data..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "citation-viewer-data",
        "--project",
        projectPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) setViewerDataReady(true);
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
    } finally {
      setViewerDataGenerating(false);
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

  const runMergeMethodsStats = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    if (llmSlots.filter((s) => s.name.startsWith("reviewer")).every(
      (s) => methodsStatsCheckResults[s.name] !== "done"
    )) {
      addLog({ event: "error", message: "At least one reviewer must complete a methods/stats check first." });
      return;
    }

    setMethodsStatsMergeRunning(true);
    addLog({ event: "info", message: "Merging methods/stats check results..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "merge-section",
        "--project", projectPath,
        "--check", "methods_stats",
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setMethodsStatsMergeDone(true);
        setMethodsStatsMergeRunning(false);
      } else {
        setMethodsStatsMergeRunning(false);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setMethodsStatsMergeRunning(false);
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

  const progressProps = {
    projectPath,
    sourceAttached,
    preprocessDone,
    citationExtractionDone,
    crossrefDone,
    viewerDataReady,
    structureMergeDone,
    finalMergeDone,
  };

  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <div className="app-main">
        <ProgressBar {...progressProps} />
        <div className="app-content">
          {activeView === "home" && (
            <HomePanel
              projectPath={projectPath}
              healthcheckStatus={healthcheckStatus}
              projectCreated={projectCreated}
              sourceAttached={sourceAttached}
              preprocessDone={preprocessDone}
              citationExtractionDone={citationExtractionDone}
              crossrefDone={crossrefDone}
              viewerDataReady={viewerDataReady}
              structureMergeDone={structureMergeDone}
              finalMergeDone={finalMergeDone}
              onRunHealthcheck={runHealthcheck}
            />
          )}

          {activeView === "project" && (
            <ProjectPanel
              projectPath={projectPath}
              projectCreated={projectCreated}
              docxPath={docxPath}
              pdfPath={pdfPath}
              validationOk={validationOk}
              sourceAttached={sourceAttached}
              onProjectPathChange={setProjectPath}
              onBrowseFolder={browseFolder}
              onCreateProject={createProject}
              onDocxPathChange={setDocxPath}
              onBrowseDocx={browseDocx}
              onPdfPathChange={setPdfPath}
              onBrowsePdf={browsePdf}
              onValidateInput={validateInput}
              onAttachSource={attachSource}
              onPreprocessSource={preprocessSource}
            />
          )}

          {activeView === "preprocess" && (
            <PreprocessPanel
              preprocessDone={preprocessDone}
              numberingDone={numberingDone}
              sectionsDone={sectionsDone}
              citationExtractionDone={citationExtractionDone}
              crossrefDone={crossrefDone}
              viewerDataGenerating={viewerDataGenerating}
              viewerDataReady={viewerDataReady}
              onNumbering={runNumbering}
              onSections={runSections}
              onExtractCitations={runExtractCitations}
              onCrossrefDb={runCrossrefDb}
              onViewerData={runViewerData}
            />
          )}

          {activeView === "citations" && (
            <CitationReviewPanel
              projectPath={projectPath}
              crossrefDone={crossrefDone}
              viewerDataReady={viewerDataReady}
              viewerDataGenerating={viewerDataGenerating}
              onViewerData={runViewerData}
            />
          )}

          {activeView === "review" && (
            <ReviewChecksPanel
              crossrefDone={crossrefDone}
              llmSlots={llmSlots}
              structureCheckResults={structureCheckResults}
              expressionCheckResults={expressionCheckResults}
              methodsStatsCheckResults={methodsStatsCheckResults}
              structureMergeDone={structureMergeDone}
              structureMergeRunning={structureMergeRunning}
              expressionMergeDone={expressionMergeDone}
              expressionMergeRunning={expressionMergeRunning}
              methodsStatsMergeDone={methodsStatsMergeDone}
              methodsStatsMergeRunning={methodsStatsMergeRunning}
              finalMergeDone={finalMergeDone}
              finalMergeRunning={finalMergeRunning}
              onStructureCheck={runStructureCheck}
              onExpressionCheck={runExpressionCheck}
              onMethodsStatsCheck={runMethodsStatsCheck}
              onMergeStructure={runMergeStructure}
              onMergeExpression={runMergeExpression}
              onMergeMethodsStats={runMergeMethodsStats}
              onFinalMerge={runFinalMerge}
            />
          )}

          {activeView === "results" && (
            <ResultsPanel
              projectPath={projectPath}
              selectedResultFile={selectedResultFile}
              resultFileContent={resultFileContent}
              resultFileLoading={resultFileLoading}
              onLoadResultFile={loadResultFile}
              onReloadResults={reloadResults}
              onOpenOutputFolder={openOutputFolder}
            />
          )}

          {activeView === "settings" && (
            <SettingsPanel
              llmSlots={llmSlots}
              llmTestResults={llmTestResults}
              onUpdateSlot={updateSlot}
              onTestSlot={testLlmSlot}
              onTestAll={testAllLlm}
            />
          )}

          {activeView === "log" && (
            <LogPanel
              logs={logs}
              onClearLogs={clearLogs}
              logLineStyle={logLineStyle}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
