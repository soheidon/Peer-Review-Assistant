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

  // Running states for individual operations
  const [validateRunning, setValidateRunning] = useState(false);
  const [attachRunning, setAttachRunning] = useState(false);
  const [preprocessRunning, setPreprocessRunning] = useState(false);
  const [numberingRunning, setNumberingRunning] = useState(false);
  const [sectionsRunning, setSectionsRunning] = useState(false);
  const [citationExtractionRunning, setCitationExtractionRunning] = useState(false);
  const [crossrefRunning, setCrossrefRunning] = useState(false);

  // Status feedback
  const [statusMessage, setStatusMessage] = useState<{text: string; type: "ok"|"error"|"info"}|null>(null);
  const [preprocessResults, setPreprocessResults] = useState<Record<string, string>>({});
  const [crossrefSummary, setCrossrefSummary] = useState("");
  const [logExpanded, setLogExpanded] = useState(true);

  // Auto-clear status message after 8 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

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
          const parsed = JSON.parse(line);
          addLog(parsed);
          // Extract supplementary info from done events
          if (parsed.event === "done") {
            if (parsed.paragraphs != null) {
              setPreprocessResults((prev) => ({
                ...prev,
                preprocess: `${parsed.paragraphs}段落、${parsed.chars?.toLocaleString() ?? "?"}文字`,
              }));
            }
            if (parsed.sentences != null) {
              setPreprocessResults((prev) => ({
                ...prev,
                numbering: `${parsed.sentences}文`,
              }));
            }
            if (parsed.sections != null) {
              setPreprocessResults((prev) => ({
                ...prev,
                sections: `${parsed.sections}セクション`,
              }));
            }
            if (parsed.citations != null) {
              setPreprocessResults((prev) => ({
                ...prev,
                citations: `${parsed.citations}件`,
              }));
            }
            if (parsed.verified != null || parsed.unmatched != null) {
              const v = parsed.verified ?? 0;
              const u = parsed.unmatched ?? 0;
              setCrossrefSummary(`${v}件確認、${u}件未照合`);
              setPreprocessResults((prev) => ({
                ...prev,
                crossref: `${v}件確認、${u}件未照合`,
              }));
            }
            if (parsed.total != null) {
              const t = parsed.total ?? 0;
              const s = parsed.suspicious ?? 0;
              const parts = [`${t}件`];
              if (s > 0) parts.push(`要確認${s}件`);
              setPreprocessResults((prev) => ({
                ...prev,
                viewerData: parts.join("、"),
              }));
            }
          }
        } catch {
          addLog({ event: "stdout", message: line });
        }
      }
    }
  };

  const runHealthcheck = async () => {
    setHealthcheckStatus("running");
    setStatusMessage(null);
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
      title: "プロジェクトフォルダを選択",
    });
    if (selected && typeof selected === "string") {
      setProjectPath(selected);
    }
  };

  const openExistingProject = async () => {
    const selected = await open({
      directory: true,
      multiple: false,
      title: "既存プロジェクトフォルダを開く",
    });
    if (!selected || typeof selected !== "string") return;

    const projJsonPath = `${selected.replace(/\\/g, "/")}/project.json`;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("read_text_file", { path: projJsonPath });
      const proj = JSON.parse(raw);
      setProjectPath(selected);
      setProjectCreated(true);
      // Restore source info from project.json
      if (proj.source) {
        if (proj.source.docx_path) {
          setDocxPath(proj.source.original_docx_path || proj.source.docx_path);
        }
        if (proj.source.pdf_path) {
          setPdfPath(proj.source.original_pdf_path || proj.source.pdf_path);
        }
        if (proj.source.input_validation_status === "ok") {
          setValidationOk(true);
          setSourceAttached(true);
        }
      }
      if (proj.preprocess) {
        if (proj.preprocess.status === "done") setPreprocessDone(true);
      }
      setStatusMessage({text: "既存プロジェクトを開きました。", type: "info"});
      addLog({event: "info", message: `Opened existing project: ${selected}`});
    } catch {
      // No project.json — just set the path for new project creation
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
    setValidateRunning(true);
    setStatusMessage(null);
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
        setStatusMessage({text: "入力ファイルの確認が完了しました。", type: "ok"});
      } else {
        setStatusMessage({text: "入力ファイルの確認に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({text: "入力ファイルの確認でエラーが発生しました。", type: "error"});
    } finally {
      setValidateRunning(false);
    }
  };

  const attachSource = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setSourceAttached(false);
    setAttachRunning(true);
    setStatusMessage(null);
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
        setStatusMessage({text: "docxとPDFをプロジェクトに取り込みました。", type: "ok"});
      } else {
        setStatusMessage({text: "プロジェクトへの取り込みに失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({text: "プロジェクトへの取り込みでエラーが発生しました。", type: "error"});
    } finally {
      setAttachRunning(false);
    }
  };

  const preprocessSource = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setPreprocessDone(false);
    setPreprocessRunning(true);
    setStatusMessage(null);
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
        setStatusMessage({text: "docx本文抽出が完了しました。", type: "ok"});
      } else {
        setStatusMessage({text: "docx本文抽出に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({text: "docx本文抽出でエラーが発生しました。", type: "error"});
    } finally {
      setPreprocessRunning(false);
    }
  };

  const runNumbering = async () => {
    setNumberingDone(false);
    setNumberingRunning(true);
    setStatusMessage(null);
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
      if (output.code === 0) {
        setNumberingDone(true);
        setStatusMessage({text: "段落・文番号作成が完了しました。", type: "ok"});
      } else {
        setStatusMessage({text: "段落・文番号作成に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "段落・文番号作成でエラーが発生しました。", type: "error"});
    } finally {
      setNumberingRunning(false);
    }
  };

  const runSections = async () => {
    setSectionsDone(false);
    setSectionsRunning(true);
    setStatusMessage(null);
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
      if (output.code === 0) {
        setSectionsDone(true);
        setStatusMessage({text: "セクション分割が完了しました。", type: "ok"});
      } else {
        setStatusMessage({text: "セクション分割に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "セクション分割でエラーが発生しました。", type: "error"});
    } finally {
      setSectionsRunning(false);
    }
  };

  const runExtractCitations = async () => {
    setCitationExtractionDone(false);
    setCitationExtractionRunning(true);
    setStatusMessage(null);
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
      if (output.code === 0) {
        setCitationExtractionDone(true);
        setStatusMessage({text: "引用文献抽出が完了しました。", type: "ok"});
      } else {
        setStatusMessage({text: "引用文献抽出に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "引用文献抽出でエラーが発生しました。", type: "error"});
    } finally {
      setCitationExtractionRunning(false);
    }
  };

  const runCrossrefDb = async () => {
    setCrossrefDone(false);
    setCrossrefRunning(true);
    setStatusMessage(null);
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
      if (output.code === 0) {
        setCrossrefDone(true);
        setStatusMessage({text: "Crossref照合が完了しました。", type: "ok"});
      } else {
        setStatusMessage({text: "Crossref照合に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "Crossref照合でエラーが発生しました。", type: "error"});
    } finally {
      setCrossrefRunning(false);
    }
  };

  const runViewerData = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setViewerDataGenerating(true);
    setStatusMessage(null);
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
      if (output.code === 0) {
        setViewerDataReady(true);
        setStatusMessage({text: "文献確認データを作成しました。", type: "ok"});
      } else {
        setStatusMessage({text: "文献確認データ作成に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "文献確認データ作成でエラーが発生しました。", type: "error"});
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
    setStatusMessage(null);
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
        setStatusMessage({text: `構成チェック(${slotName})が完了しました。`, type: "ok"});
      } else {
        setStructureCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
        setStatusMessage({text: `構成チェック(${slotName})に失敗しました。`, type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStructureCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      setStatusMessage({text: `構成チェック(${slotName})でエラーが発生しました。`, type: "error"});
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
    setStatusMessage(null);
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
        setStatusMessage({text: `表現チェック(${slotName})が完了しました。`, type: "ok"});
      } else {
        setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
        setStatusMessage({text: `表現チェック(${slotName})に失敗しました。`, type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      setStatusMessage({text: `表現チェック(${slotName})でエラーが発生しました。`, type: "error"});
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
    setStatusMessage(null);
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
        setStatusMessage({text: `方法・統計チェック(${slotName})が完了しました。`, type: "ok"});
      } else {
        setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
        setStatusMessage({text: `方法・統計チェック(${slotName})に失敗しました。`, type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      setStatusMessage({text: `方法・統計チェック(${slotName})でエラーが発生しました。`, type: "error"});
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
    setStatusMessage(null);
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
        setStatusMessage({text: "構成チェック結果を統合しました。", type: "ok"});
      } else {
        setStatusMessage({text: "構成チェック結果の統合に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({text: "構成チェック結果の統合でエラーが発生しました。", type: "error"});
    } finally {
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
    setStatusMessage(null);
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
        setStatusMessage({text: "表現チェック結果を統合しました。", type: "ok"});
      } else {
        setStatusMessage({text: "表現チェック結果の統合に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({text: "表現チェック結果の統合でエラーが発生しました。", type: "error"});
    } finally {
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
    setStatusMessage(null);
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
        setStatusMessage({text: "方法・統計チェック結果を統合しました。", type: "ok"});
      } else {
        setStatusMessage({text: "方法・統計チェック結果の統合に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({text: "方法・統計チェック結果の統合でエラーが発生しました。", type: "error"});
    } finally {
      setMethodsStatsMergeRunning(false);
    }
  };

  const runFinalMerge = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setFinalMergeRunning(true);
    setStatusMessage(null);
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
        setStatusMessage({text: "最終査読コメントを生成しました。", type: "ok"});
      } else {
        setStatusMessage({text: "最終査読コメントの生成に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({text: "最終査読コメントの生成でエラーが発生しました。", type: "error"});
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

  const stepToView: Record<string, string> = {
    project: "project",
    input: "project",
    preprocess: "preprocess",
    citations: "preprocess",
    db_check: "preprocess",
    cite_review: "citations",
    review: "review",
    merge: "review",
    output: "results",
  };

  const handleStepClick = (viewKey: string) => {
    const target = stepToView[viewKey];
    if (target) setActiveView(target);
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
    onStepClick: handleStepClick,
  };

  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />
      <div className="app-main">
        <ProgressBar {...progressProps} />

        {/* Project info header */}
        <div className="app-header">
          <span className="app-header-label">現在のプロジェクト：</span>
          <span className="app-header-path">
            {projectPath || "未選択"}
          </span>
        </div>

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
              statusMessage={statusMessage}
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
              validateRunning={validateRunning}
              attachRunning={attachRunning}
              onProjectPathChange={setProjectPath}
              onBrowseFolder={browseFolder}
              onOpenExisting={openExistingProject}
              onCreateProject={createProject}
              onDocxPathChange={setDocxPath}
              onBrowseDocx={browseDocx}
              onPdfPathChange={setPdfPath}
              onBrowsePdf={browsePdf}
              onValidateInput={validateInput}
              onAttachSource={attachSource}
              statusMessage={statusMessage}
            />
          )}

          {activeView === "preprocess" && (
            <PreprocessPanel
              projectPath={projectPath}
              sourceAttached={sourceAttached}
              preprocessDone={preprocessDone}
              preprocessRunning={preprocessRunning}
              numberingDone={numberingDone}
              numberingRunning={numberingRunning}
              sectionsDone={sectionsDone}
              sectionsRunning={sectionsRunning}
              citationExtractionDone={citationExtractionDone}
              citationExtractionRunning={citationExtractionRunning}
              crossrefDone={crossrefDone}
              crossrefRunning={crossrefRunning}
              viewerDataGenerating={viewerDataGenerating}
              viewerDataReady={viewerDataReady}
              preprocessResults={preprocessResults}
              crossrefSummary={crossrefSummary}
              onPreprocess={preprocessSource}
              onNumbering={runNumbering}
              onSections={runSections}
              onExtractCitations={runExtractCitations}
              onCrossrefDb={runCrossrefDb}
              onViewerData={runViewerData}
              statusMessage={statusMessage}
            />
          )}

          {activeView === "citations" && (
            <CitationReviewPanel
              projectPath={projectPath}
              crossrefDone={crossrefDone}
              viewerDataReady={viewerDataReady}
              viewerDataGenerating={viewerDataGenerating}
              onViewerData={runViewerData}
              statusMessage={statusMessage}
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
              onNavigateToSettings={() => setActiveView("settings")}
              statusMessage={statusMessage}
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
              statusMessage={statusMessage}
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
        </div>

        {/* Bottom collapsible log pane */}
        <div className={`app-log-pane ${logExpanded ? "" : "collapsed"}`}>
          <div className="app-log-header">
            <button
              className="log-toggle-btn"
              onClick={() => setLogExpanded((v) => !v)}
            >
              {logExpanded ? "▼" : "▲"} ログ
              {logs.length > 0 && (
                <span className="log-count">{logs.length}</span>
              )}
            </button>
            {logExpanded && (
              <button onClick={clearLogs} className="clear-btn">ログを消去</button>
            )}
          </div>
          {logExpanded && (
            <div className="app-log-area">
              {logs.length === 0 && (
                <p className="log-empty-msg">
                  コマンドを実行するとログが表示されます。
                </p>
              )}
              {logs.map((entry, i) => (
                <pre key={i} style={logLineStyle(entry)} className="log-line">
                  {JSON.stringify(entry)}
                </pre>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
