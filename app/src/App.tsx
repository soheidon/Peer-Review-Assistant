import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { slotDisplayName } from "./slotLabels";
import Sidebar from "./Sidebar";
import ProgressBar from "./ProgressBar";
import ProjectPanel from "./panels/ProjectPanel";
import PreprocessPanel from "./panels/PreprocessPanel";
import CitationReviewPanel from "./panels/CitationReviewPanel";
import ReviewChecksPanel from "./panels/ReviewChecksPanel";
import ResultsPanel from "./panels/ResultsPanel";
import SettingsPanel from "./panels/SettingsPanel";
import SectionViewerPanel from "./panels/SectionViewerPanel";
import JournalPanel, { JournalProfile } from "./panels/JournalPanel";

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

interface LogEntry {
  event: string;
  [key: string]: unknown;
}

function App() {
  const [activeView, setActiveView] = useState("project");
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
  const [viewerDataVersion, setViewerDataVersion] = useState(0);
  const [llmRepairDone, setLlmRepairDone] = useState(false);
  const [llmRepairGenerating, setLlmRepairGenerating] = useState(false);
  const [googleBooksDone, setGoogleBooksDone] = useState(false);
  const [googleBooksGenerating, setGoogleBooksGenerating] = useState(false);
  const [googleBooksApiKey, setGoogleBooksApiKey] = useState("");
  const [googleBooksApiKeyMode, setGoogleBooksApiKeyMode] = useState<"direct" | "env_var">("env_var");
  const [googleBooksApiKeyEnvName, setGoogleBooksApiKeyEnvName] = useState("GOOGLE_BOOKS_API_KEY");
  const [gbEnvCheckResult, setGbEnvCheckResult] = useState("");
  const [gbConnectionTestResult, setGbConnectionTestResult] = useState("");
  const [googleBooksCandidateCount, setGoogleBooksCandidateCount] = useState<number | undefined>(undefined);
  const [llmFlagsDone, setLlmFlagsDone] = useState(false);
  const [llmFlagsGenerating, setLlmFlagsGenerating] = useState(false);

  // Semantic Scholar API state
  const [semanticScholarApiKey, setSemanticScholarApiKey] = useState("");
  const [semanticScholarApiKeyMode, setSemanticScholarApiKeyMode] = useState<"direct" | "env_var">("env_var");
  const [semanticScholarApiKeyEnvName, setSemanticScholarApiKeyEnvName] = useState("SEMANTIC_SCHOLAR_API_KEY");
  const [ssEnvCheckResult, setSsEnvCheckResult] = useState("");
  const [ssConnectionTestResult, setSsConnectionTestResult] = useState("");

  // PubMed / NCBI API state
  const [pubmedApiKey, setPubmedApiKey] = useState("");
  const [pubmedApiKeyMode, setPubmedApiKeyMode] = useState<"direct" | "env_var">("env_var");
  const [pubmedApiKeyEnvName, setPubmedApiKeyEnvName] = useState("NCBI_API_KEY");
  const [pubmedEnvCheckResult, setPubmedEnvCheckResult] = useState("");
  const [pubmedConnectionTestResult, setPubmedConnectionTestResult] = useState("");

  // DB API enabled state
  const [pubmedEnabled, setPubmedEnabled] = useState(true);
  const [googleBooksEnabled, setGoogleBooksEnabled] = useState(false);
  const [semanticScholarEnabled, setSemanticScholarEnabled] = useState(false);

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
  const [logHeight, setLogHeight] = useState<"small"|"medium"|"large">("small");

  // Phase A: settings configured state
  const [settingsConfigured, setSettingsConfigured] = useState(false);

  // Phase B Step 1: preprocess-all state
  const [preprocessAllRunning, setPreprocessAllRunning] = useState(false);
  const [preprocessAllStep, setPreprocessAllStep] = useState("");

  // Auto-clear status message after 8 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Journal tab state
  const defaultJournalProfile: JournalProfile = {
    journal_name: "",
    journal_url: "",
    publisher: "",
    article_type: "Article",
    reference_style: {
      style_name: "",
      in_text_citation: "numeric",
      reference_list_order: "order_of_appearance",
      doi_required: "recommended_or_required_if_available",
      url_access_date_required: null,
      journal_title_style: "abbreviated_or_full",
      example_reference: "",
    },
    submission_guidelines: {
      word_limit: null,
      abstract_limit: null,
      figure_table_limits: null,
      supplementary_material_policy: "",
      data_availability_policy: "",
      ethics_policy: "",
      conflict_of_interest_policy: "",
      funding_statement_policy: "",
    },
    review_policy: {
      novelty_requirement: "",
      methodological_requirements: "",
      statistical_reporting_expectations: "",
      reporting_guidelines: [],
      reviewer_guidance: "",
      editorial_policy_summary: "",
    },
    notes: "",
    source: "manual",
    source_details: "",
    updated_at: "",
  };
  const [journalProfile, setJournalProfile] = useState<JournalProfile>(structuredClone(defaultJournalProfile));
  const [journalLoaded, setJournalLoaded] = useState(false);
  const [journalLlmRunning, setJournalLlmRunning] = useState(false);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalExternalPrompt, setJournalExternalPrompt] = useState("");
  const [journalImportText, setJournalImportText] = useState("");
  const [journalImportPreview, setJournalImportPreview] = useState<JournalProfile | null>(null);
  const [journalImportError, setJournalImportError] = useState("");

  const defaultSlotEnvNames: Record<string, string> = {
    summary: "PRA_LLM_KEY_SUMMARY",
    reviewer1: "PRA_LLM_KEY_REVIEWER1",
    reviewer2: "PRA_LLM_KEY_REVIEWER2",
    reviewer3: "PRA_LLM_KEY_REVIEWER3",
  };
  const defaultSlots: LlmSlot[] = [
    { name: "summary", provider: "", baseUrl: "", model: "", apiKey: "", apiKeyMode: "env_var", apiKeyEnvName: "PRA_LLM_KEY_SUMMARY", enabled: true },
    { name: "reviewer1", provider: "", baseUrl: "", model: "", apiKey: "", apiKeyMode: "env_var", apiKeyEnvName: "PRA_LLM_KEY_REVIEWER1", enabled: true },
    { name: "reviewer2", provider: "", baseUrl: "", model: "", apiKey: "", apiKeyMode: "env_var", apiKeyEnvName: "PRA_LLM_KEY_REVIEWER2", enabled: true },
    { name: "reviewer3", provider: "", baseUrl: "", model: "", apiKey: "", apiKeyMode: "env_var", apiKeyEnvName: "PRA_LLM_KEY_REVIEWER3", enabled: false },
  ];
  const [llmSlots, setLlmSlots] = useState(defaultSlots);
  const [llmTestResults, setLlmTestResults] = useState<Record<string, string>>({});
  const [llmEnvCheckResults, setLlmEnvCheckResults] = useState<Record<string, string>>({});

  const addLog = (entry: LogEntry) => {
    setLogs((prev) => [...prev, entry]);
  };

  const clearLogs = () => setLogs([]);

  const copyLogs = async () => {
    const text = logs.map((e) => JSON.stringify(e)).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setStatusMessage({text: "ログをクリップボードにコピーしました。", type: "info"});
    } catch {
      setStatusMessage({text: "クリップボードへのコピーに失敗しました。", type: "error"});
    }
  };

  const cycleLogHeight = () => {
    setLogHeight((prev) =>
      prev === "small" ? "medium" : prev === "medium" ? "large" : "small"
    );
  };

  const logHeightPx = { small: 150, medium: 300, large: 500 }[logHeight];

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

    const base = selected.replace(/\\/g, "/");
    const projJsonPath = `${base}/project.json`;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const raw = await invoke<string>("read_text_file", { path: projJsonPath });
      const proj = JSON.parse(raw);
      setProjectPath(selected);
      setProjectCreated(true);

      // Restore source info
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

      // Restore preprocess state
      if (proj.preprocess) {
        if (proj.preprocess.status === "done") setPreprocessDone(true);
      }

      // Restore pipeline state from generated files
      try {
        const files: string[] = [];
        try { files.push(await invoke<string>("read_text_file", { path: `${base}/manuscript_full.json` })); } catch {}
        if (files.length > 0 || proj.preprocess?.status === "done") {
          setPreprocessDone(true);
        }

        // Check for generated output files to infer pipeline progress
        const checkFile = async (p: string) => {
          try { await invoke<string>("read_text_file", { path: `${base}/${p}` }); return true; } catch { return false; }
        };

        if (await checkFile("lines/paragraph_sentence_map.json")) setNumberingDone(true);
        const hasSections = await checkFile("sections/introduction.txt");
        if (hasSections) setSectionsDone(true);
        if (await checkFile("citations/references_split.json")) setCitationExtractionDone(true);
        if (await checkFile("citations/db_verified_references.json")) setCrossrefDone(true);
        if (await checkFile("citations/citation_viewer_data.json")) setViewerDataReady(true);
        if (await checkFile("citations/references_repaired_llm.json")) setLlmRepairDone(true);
        if (await checkFile("citations/db_google_books_candidates.json")) setGoogleBooksDone(true);
        if (await checkFile("citations/reference_llm_flags.json")) setLlmFlagsDone(true);

        // Check for journal profile
        try {
          const jpRaw = await invoke<string>("read_text_file", { path: `${base}/journal_profile.json` });
          const jpParsed = JSON.parse(jpRaw);
          const merged = JSON.parse(JSON.stringify(defaultJournalProfile));
          const deepMerge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
            for (const key of Object.keys(source)) {
              if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key]) && typeof target[key] === "object" && target[key] !== null && !Array.isArray(target[key])) {
                deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
              } else if (source[key] !== undefined) {
                target[key] = source[key];
              }
            }
          };
          deepMerge(merged, jpParsed);
          setJournalProfile(merged as JournalProfile);
          setJournalLoaded(true);
        } catch { /* journal_profile.json not found — that's fine */ }

        // Check merge results
        if (await checkFile("outputs/structure/merged.section.json")) setStructureMergeDone(true);
        if (await checkFile("outputs/expression/merged.section.json")) setExpressionMergeDone(true);
        if (await checkFile("outputs/methods_stats/merged.section.json")) setMethodsStatsMergeDone(true);
        if (await checkFile("outputs/final/final_review.md")) setFinalMergeDone(true);
      } catch {
        // If file checks fail, still proceed — the project is opened
      }

      setStatusMessage({text: "既存プロジェクトを開きました。", type: "info"});
      addLog({event: "info", message: `Opened existing project: ${selected}`});
    } catch {
      // No project.json — set the path but warn
      setProjectPath(selected);
      setProjectCreated(false);
      setStatusMessage({
        text: "project.json が見つかりません。「新規プロジェクト作成」でプロジェクトを作成してください。",
        type: "error",
      });
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
    if (!docxPath.trim()) {
      addLog({ event: "error", message: "原稿docxを選択してください。" });
      return;
    }

    setValidationOk(false);
    setValidateRunning(true);
    setStatusMessage(null);
    addLog({ event: "info", message: "Validating input files..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = ["validate-input", "--docx", docxPath];
      if (pdfPath.trim()) {
        args.push("--pdf", pdfPath);
      }
      const cmd = Command.create("pra-cli", args);
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
      addLog({ event: "error", message: "プロジェクトフォルダを選択してください。" });
      return;
    }

    // Check that project.json exists before proceeding
    const projJsonPath = `${projectPath.replace(/\\/g, "/")}/project.json`;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke<string>("read_text_file", { path: projJsonPath });
    } catch {
      setStatusMessage({
        text: "project.json が見つかりません。「新規プロジェクト作成」または「既存プロジェクトを開く」を実行してください。",
        type: "error",
      });
      return;
    }

    setSourceAttached(false);
    setAttachRunning(true);
    setStatusMessage(null);
    addLog({ event: "info", message: "Attaching source files..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = [
        "attach-source",
        "--project", projectPath,
        "--docx", docxPath,
      ];
      if (pdfPath.trim()) {
        args.push("--pdf", pdfPath);
      }
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) {
        addLog({ event: "stderr", message: output.stderr });
      }

      if (output.code === 0) {
        setSourceAttached(true);
        setProjectCreated(true);
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

  const runPreprocessAll = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "プロジェクトを作成してください。" });
      return;
    }

    setPreprocessAllRunning(true);
    setStatusMessage(null);

    const steps = [
      { key: "preprocess-docx", label: "抽出中... (1/4)", done: "抽出完了", doneLabel: "docx本文抽出完了" },
      { key: "preprocess-numbering", label: "段落・文番号作成中... (2/4)", done: "番号作成完了", doneLabel: "段落・文番号作成完了" },
      { key: "preprocess-sections", label: "セクション分割中... (3/4)", done: "セクション分割完了", doneLabel: "セクション分割完了" },
      { key: "extract-citations", label: "引用文献抽出中... (4/4)", done: "引用文献抽出完了", doneLabel: "引用文献抽出完了" },
    ];

    const setDone = (key: string) => {
      if (key === "preprocess-docx") setPreprocessDone(true);
      else if (key === "preprocess-numbering") setNumberingDone(true);
      else if (key === "preprocess-sections") setSectionsDone(true);
      else if (key === "extract-citations") setCitationExtractionDone(true);
    };

    try {
      for (const step of steps) {
        setPreprocessAllStep(step.label);
        addLog({ event: "info", message: `Running ${step.key}...` });

        const { Command } = await import("@tauri-apps/plugin-shell");
        const cmd = Command.create("pra-cli", [
          step.key,
          "--project",
          projectPath,
        ]);
        const output = await cmd.execute();
        parseOutput(output.stdout);
        if (output.stderr) addLog({ event: "stderr", message: output.stderr });

        if (output.code !== 0) {
          setStatusMessage({
            text: `${step.key} が失敗しました（終了コード: ${output.code}）。処理を中断します。`,
            type: "error",
          });
          return;
        }
        setDone(step.key);
        addLog({ event: "info", message: `${step.done}` });
      }

      setPreprocessAllStep("");
      setStatusMessage({
        text: "前処理が完了しました。「本文分割」または「文献確認」メニューに進んでください。",
        type: "ok",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({
        text: "前処理でエラーが発生しました。処理を中断します。",
        type: "error",
      });
    } finally {
      setPreprocessAllRunning(false);
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
        setViewerDataVersion((v) => v + 1);
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

  const runLlmRepair = async (slotName: string) => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot || !slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured.` });
      return;
    }

    setLlmRepairGenerating(true);
    setStatusMessage(null);
    addLog({ event: "info", message: `Running LLM reference repair on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "repair-references-llm",
        "--project", projectPath,
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
        setLlmRepairDone(true);
        setStatusMessage({text: `LLM文献再パースが完了しました (${slotDisplayName(slotName)})。文献確認データを再作成してください。`, type: "ok"});
      } else {
        setStatusMessage({text: "LLM文献再パースに失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "LLM文献再パースでエラーが発生しました。", type: "error"});
    } finally {
      setLlmRepairGenerating(false);
    }
  };

  const runGoogleBooksDb = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setGoogleBooksDone(false);
    setGoogleBooksGenerating(true);
    setStatusMessage(null);
    addLog({ event: "info", message: "Searching Google Books for book-like references..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args: string[] = [
        "citation-db-google-books",
        "--project", projectPath,
      ];
      if (googleBooksApiKeyMode === "direct" && googleBooksApiKey.trim()) {
        args.push("--api-key", googleBooksApiKey.trim());
      } else if (googleBooksApiKeyMode === "env_var" && googleBooksApiKeyEnvName.trim()) {
        args.push("--api-key-env", googleBooksApiKeyEnvName.trim());
      }
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setGoogleBooksDone(true);
        // Extract candidate count from done event
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "done" && parsed.candidates_found != null) {
                setGoogleBooksCandidateCount(parsed.candidates_found as number);
              }
            } catch { /* not JSON */ }
          }
        }
        setStatusMessage({text: "Google Books候補検索が完了しました。文献確認データを再作成してください。", type: "ok"});
      } else {
        setStatusMessage({text: "Google Books候補検索に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "Google Books候補検索でエラーが発生しました。", type: "error"});
    } finally {
      setGoogleBooksGenerating(false);
    }
  };

  const runLlmFlags = async (slotName: string) => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot || !slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured.` });
      return;
    }

    setLlmFlagsGenerating(true);
    setStatusMessage(null);
    addLog({ event: "info", message: `Running LLM reference flags generation on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "generate-llm-reference-flags",
        "--project", projectPath,
        "--slot", slotName,
      ]);
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        setLlmFlagsDone(true);
        setStatusMessage({text: `LLM文献フラグ生成が完了しました (${slotDisplayName(slotName)})。文献確認データを再作成してください。`, type: "ok"});
      } else {
        setStatusMessage({text: "LLM文献フラグ生成に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "LLM文献フラグ生成でエラーが発生しました。", type: "error"});
    } finally {
      setLlmFlagsGenerating(false);
    }
  };

  // ── Journal tab handlers ────────────────────────────────────────────────

  /** Update a nested field in journalProfile using dot-notation path. */
  const updateJournalField = (path: string, value: unknown) => {
    setJournalProfile((prev) => {
      const next = JSON.parse(JSON.stringify(prev));
      const keys = path.split(".");
      let target: Record<string, unknown> = next;
      for (let i = 0; i < keys.length - 1; i++) {
        target = target[keys[i]] as Record<string, unknown>;
      }
      target[keys[keys.length - 1]] = value;
      return next;
    });
  };

  /** Save journal profile to project directory. */
  const saveJournal = async () => {
    if (!projectPath.trim()) return;
    setJournalLoading(true);
    setStatusMessage(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const jsonPath = `${projectPath.replace(/\\/g, "/")}/journal_profile.json`;
      const payload = { ...journalProfile, updated_at: new Date().toISOString() };
      await invoke("write_text_file", { path: jsonPath, content: JSON.stringify(payload, null, 2) });
      setJournalProfile(payload);
      setJournalLoaded(true);
      setStatusMessage({ text: "ジャーナル情報を保存しました。", type: "ok" });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({ text: "保存に失敗しました。", type: "error" });
    } finally {
      setJournalLoading(false);
    }
  };

  /** Load journal profile from project directory. */
  const loadJournal = async () => {
    if (!projectPath.trim()) return;
    setJournalLoading(true);
    setStatusMessage(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const jsonPath = `${projectPath.replace(/\\/g, "/")}/journal_profile.json`;
      const raw = await invoke<string>("read_text_file", { path: jsonPath });
      const parsed = JSON.parse(raw);
      // Deep merge with defaults
      const merged = JSON.parse(JSON.stringify(defaultJournalProfile));
      const deepMerge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
        for (const key of Object.keys(source)) {
          if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key]) && typeof target[key] === "object" && target[key] !== null && !Array.isArray(target[key])) {
            deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
          } else if (source[key] !== undefined) {
            target[key] = source[key];
          }
        }
      };
      deepMerge(merged, parsed);
      setJournalProfile(merged as JournalProfile);
      setJournalLoaded(true);
      setStatusMessage({ text: "ジャーナル情報を読み込みました。", type: "ok" });
    } catch {
      setStatusMessage({ text: "journal_profile.json が見つかりません。", type: "error" });
    } finally {
      setJournalLoading(false);
    }
  };

  /** Run LLM journal profile generation via CLI. */
  const runJournalLlm = async (slotName: string) => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot || !slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured.` });
      return;
    }

    setJournalLlmRunning(true);
    setStatusMessage(null);
    addLog({ event: "info", message: `Running journal profile generation on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "generate-journal-profile",
        "--project", projectPath,
        "--slot", slotName,
        "--journal-name", journalProfile.journal_name.trim(),
      ]);
      if (journalProfile.journal_url.trim()) {
        args.push("--journal-url", journalProfile.journal_url.trim());
      }
      if (journalProfile.article_type) {
        args.push("--article-type", journalProfile.article_type);
      }
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        // Load the generated profile
        setJournalLlmRunning(false);
        await loadJournal();
        setStatusMessage({ text: `LLMでジャーナル情報を取得しました (${slotDisplayName(slotName)})。`, type: "ok" });
        return;
      } else {
        setStatusMessage({ text: "LLMでのジャーナル情報取得に失敗しました。", type: "error" });
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({ text: "LLMでのジャーナル情報取得でエラーが発生しました。", type: "error" });
    } finally {
      setJournalLlmRunning(false);
    }
  };

  /** Generate a prompt string for external AI tools. */
  const generateExternalPrompt = () => {
    const jn = journalProfile.journal_name.trim();
    const ju = journalProfile.journal_url.trim();
    const at = journalProfile.article_type;
    const parts = [
      `Please research the following journal and produce a structured JSON profile:`,
      ``,
      `Journal Name: ${jn || "(please fill in)"}`,
      `Journal URL: ${ju || "(please fill in)"}`,
      `Article Type: ${at}`,
      ``,
      `The JSON must match this schema and contain accurate information from the journal's official submission guidelines:`,
      ``,
      `\`\`\`json`,
      JSON.stringify(defaultJournalProfile, null, 2),
      `\`\`\``,
      ``,
      `Output ONLY valid JSON — no markdown, no explanations, no code fences.`,
    ];
    setJournalExternalPrompt(parts.join("\n"));
  };

  /** Parse pasted JSON for import. */
  const parseImportJournal = () => {
    const text = journalImportText.trim();
    if (!text) {
      setJournalImportError("JSONを貼り付けてください。");
      return;
    }
    try {
      // Strip code fences if present
      let cleaned = text;
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
      }
      const parsed = JSON.parse(cleaned);
      const merged = JSON.parse(JSON.stringify(defaultJournalProfile));
      const deepMerge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
        for (const key of Object.keys(source)) {
          if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key]) && typeof target[key] === "object" && target[key] !== null && !Array.isArray(target[key])) {
            deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
          } else if (source[key] !== undefined) {
            target[key] = source[key];
          }
        }
      };
      deepMerge(merged, parsed);
      setJournalImportPreview(merged as JournalProfile);
      setJournalImportError("");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setJournalImportError(`JSONパースエラー: ${msg}`);
      setJournalImportPreview(null);
    }
  };

  /** Confirm import: merge preview into profile and save. */
  const confirmImportJournal = async () => {
    if (!journalImportPreview) return;
    setJournalProfile(journalImportPreview);
    setJournalImportPreview(null);
    setJournalImportText("");
    setJournalImportError("");
    // Save immediately
    if (projectPath.trim()) {
      setJournalLoading(true);
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const jsonPath = `${projectPath.replace(/\\/g, "/")}/journal_profile.json`;
        const payload = { ...journalImportPreview, updated_at: new Date().toISOString() };
        await invoke("write_text_file", { path: jsonPath, content: JSON.stringify(payload, null, 2) });
        setJournalProfile(payload);
        setJournalLoaded(true);
        setStatusMessage({ text: "外部AI結果を取り込み、保存しました。", type: "ok" });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        addLog({ event: "error", message: msg });
        setStatusMessage({ text: "保存に失敗しました。", type: "error" });
      } finally {
        setJournalLoading(false);
      }
    }
  };

  const updateSlot = (slotName: string, field: string, value: string | boolean) => {
    setLlmSlots((prev) =>
      prev.map((s) => (s.name === slotName ? { ...s, [field]: value } : s))
    );
  };

  /** Build LLM CLI args for a slot, respecting apiKeyMode (direct vs env_var). */
  const buildLlmArgs = (slot: LlmSlot, cmd: string[]): string[] => {
    const args = [...cmd];
    args.push("--provider", slot.provider);
    args.push("--base-url", slot.baseUrl);
    args.push("--model", slot.model);
    if (slot.apiKeyMode === "direct" && slot.apiKey.trim()) {
      args.push("--api-key", slot.apiKey.trim());
    } else if (slot.apiKeyMode === "env_var" && slot.apiKeyEnvName.trim()) {
      args.push("--api-key-env", slot.apiKeyEnvName.trim());
    } else {
      args.push("--api-key", slot.apiKey); // fallback
    }
    return args;
  };

  const testLlmSlot = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    const label = slotDisplayName(slotName);
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim()) {
      addLog({ event: "error", message: `${label}: プロバイダ、Base URL、モデルを入力してください。` });
      return;
    }
    if (slot.apiKeyMode === "direct" && !slot.apiKey.trim()) {
      addLog({ event: "error", message: `${label}: APIキーを入力してください。` });
      return;
    }
    if (slot.apiKeyMode === "env_var" && !slot.apiKeyEnvName.trim()) {
      addLog({ event: "error", message: `${label}: 環境変数名を入力してください。` });
      return;
    }

    setLlmTestResults((prev) => ({ ...prev, [slotName]: "testing" }));
    addLog({ event: "info", message: `${label} の接続をテスト中...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "test-llm",
        "--slot", slotName,
      ]);
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setLlmTestResults((prev) => ({ ...prev, [slotName]: "ok" }));
        setSettingsConfigured(true);
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

  const checkLlmEnv = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;
    const envName = slot.apiKeyEnvName.trim();
    if (!envName) return;
    setLlmEnvCheckResults((prev) => ({ ...prev, [slotName]: "" }));
    addLog({ event: "info", message: `環境変数 ${envName} を確認中...` });
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", ["check-env", "--name", envName]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "env_check") {
                setLlmEnvCheckResults((prev) => ({ ...prev, [slotName]: parsed.set ? "set" : "not_set" }));
              }
            } catch { /* skip */ }
          }
        }
      } else { setLlmEnvCheckResults((prev) => ({ ...prev, [slotName]: "error" })); }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setLlmEnvCheckResults((prev) => ({ ...prev, [slotName]: "error" }));
    }
  };

  const checkGbEnv = async () => {
    const envName = googleBooksApiKeyEnvName.trim();
    if (!envName) return;

    setGbEnvCheckResult("");
    addLog({ event: "info", message: `環境変数 ${envName} を確認中...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "check-env",
        "--name", envName,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        // Parse the env_check event
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "env_check") {
                setGbEnvCheckResult(parsed.set ? "set" : "not_set");
              }
            } catch { /* skip non-JSON */ }
          }
        }
      } else {
        setGbEnvCheckResult("error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setGbEnvCheckResult("error");
    }
  };

  const testGbConnection = async () => {
    setGbConnectionTestResult("testing");
    addLog({ event: "info", message: "Google Books API 接続をテスト中..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args: string[] = ["test-google-books"];
      if (googleBooksApiKeyMode === "direct" && googleBooksApiKey.trim()) {
        args.push("--api-key", googleBooksApiKey.trim());
      } else if (googleBooksApiKeyMode === "env_var" && googleBooksApiKeyEnvName.trim()) {
        args.push("--api-key-env", googleBooksApiKeyEnvName.trim());
      }
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        // Parse the done event
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "done" && parsed.task === "test-google-books") {
                setGbConnectionTestResult(parsed.status === "ok" ? "ok" : "error");
              }
            } catch { /* skip non-JSON */ }
          }
        }
      } else {
        setGbConnectionTestResult("error");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setGbConnectionTestResult("error");
    }
  };

  // ── Semantic Scholar handlers ──────────────────────────────────────────

  const checkSsEnv = async () => {
    const envName = semanticScholarApiKeyEnvName.trim();
    if (!envName) return;
    setSsEnvCheckResult("");
    addLog({ event: "info", message: `環境変数 ${envName} を確認中...` });
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", ["check-env", "--name", envName]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "env_check") {
                setSsEnvCheckResult(parsed.set ? "set" : "not_set");
              }
            } catch { /* skip */ }
          }
        }
      } else { setSsEnvCheckResult("error"); }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setSsEnvCheckResult("error");
    }
  };

  const testSsConnection = async () => {
    setSsConnectionTestResult("testing");
    addLog({ event: "info", message: "Semantic Scholar API 接続をテスト中..." });
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args: string[] = ["test-semantic-scholar"];
      if (semanticScholarApiKeyMode === "direct" && semanticScholarApiKey.trim()) {
        args.push("--api-key", semanticScholarApiKey.trim());
      } else if (semanticScholarApiKeyMode === "env_var" && semanticScholarApiKeyEnvName.trim()) {
        args.push("--api-key-env", semanticScholarApiKeyEnvName.trim());
      }
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "done" && parsed.task === "test-semantic-scholar") {
                setSsConnectionTestResult(parsed.status === "ok" ? "ok" : "error");
              }
            } catch { /* skip */ }
          }
        }
      } else { setSsConnectionTestResult("error"); }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setSsConnectionTestResult("error");
    }
  };

  // ── PubMed handlers ────────────────────────────────────────────────────

  const checkPubmedEnv = async () => {
    const envName = pubmedApiKeyEnvName.trim();
    if (!envName) return;
    setPubmedEnvCheckResult("");
    addLog({ event: "info", message: `環境変数 ${envName} を確認中...` });
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", ["check-env", "--name", envName]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "env_check") {
                setPubmedEnvCheckResult(parsed.set ? "set" : "not_set");
              }
            } catch { /* skip */ }
          }
        }
      } else { setPubmedEnvCheckResult("error"); }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setPubmedEnvCheckResult("error");
    }
  };

  const testPubmedConnection = async () => {
    setPubmedConnectionTestResult("testing");
    addLog({ event: "info", message: "PubMed API 接続をテスト中..." });
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args: string[] = ["test-pubmed"];
      if (pubmedApiKeyMode === "direct" && pubmedApiKey.trim()) {
        args.push("--api-key", pubmedApiKey.trim());
      } else if (pubmedApiKeyMode === "env_var" && pubmedApiKeyEnvName.trim()) {
        args.push("--api-key-env", pubmedApiKeyEnvName.trim());
      }
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "done" && parsed.task === "test-pubmed") {
                setPubmedConnectionTestResult(parsed.status === "ok" ? "ok" : "error");
              }
            } catch { /* skip */ }
          }
        }
      } else { setPubmedConnectionTestResult("error"); }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setPubmedConnectionTestResult("error");
    }
  };

  const runStructureCheck = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    const hasKey = slot.apiKeyMode === "direct" ? !!slot.apiKey.trim() : !!slot.apiKeyEnvName.trim();
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim() || !hasKey) {
      addLog({ event: "error", message: `${slotDisplayName(slotName)}: API設定が不完全です。「設定」画面を確認してください。` });
      return;
    }

    setStructureCheckResults((prev) => ({ ...prev, [slotName]: "running" }));
    setStatusMessage(null);
    addLog({ event: "info", message: `${slotDisplayName(slotName)} で構成チェックを実行中...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "run-check",
        "--project", projectPath,
        "--check", "structure",
        "--slot", slotName,
      ]);
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setStructureCheckResults((prev) => ({ ...prev, [slotName]: "done" }));
        setStatusMessage({text: `構成チェック（${slotDisplayName(slotName)}）が完了しました。`, type: "ok"});
      } else {
        setStructureCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
        setStatusMessage({text: `構成チェック（${slotDisplayName(slotName)}）に失敗しました。`, type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStructureCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      setStatusMessage({text: `構成チェック（${slotDisplayName(slotName)}）でエラーが発生しました。`, type: "error"});
    }
  };

  const runExpressionCheck = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    const hasKey = slot.apiKeyMode === "direct" ? !!slot.apiKey.trim() : !!slot.apiKeyEnvName.trim();
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim() || !hasKey) {
      addLog({ event: "error", message: `${slotDisplayName(slotName)}: API設定が不完全です。「設定」画面を確認してください。` });
      return;
    }

    setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "running" }));
    setStatusMessage(null);
    addLog({ event: "info", message: `${slotDisplayName(slotName)} で表現チェックを実行中...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "run-check",
        "--project", projectPath,
        "--check", "expression",
        "--slot", slotName,
      ]);
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "done" }));
        setStatusMessage({text: `表現チェック（${slotDisplayName(slotName)}）が完了しました。`, type: "ok"});
      } else {
        setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
        setStatusMessage({text: `表現チェック（${slotDisplayName(slotName)}）に失敗しました。`, type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setExpressionCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      setStatusMessage({text: `表現チェック（${slotDisplayName(slotName)}）でエラーが発生しました。`, type: "error"});
    }
  };

  const runMethodsStatsCheck = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    const hasKey = slot.apiKeyMode === "direct" ? !!slot.apiKey.trim() : !!slot.apiKeyEnvName.trim();
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.model.trim() || !hasKey) {
      addLog({ event: "error", message: `${slotDisplayName(slotName)}: API設定が不完全です。「設定」画面を確認してください。` });
      return;
    }

    setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "running" }));
    setStatusMessage(null);
    addLog({ event: "info", message: `${slotDisplayName(slotName)} で方法・統計チェックを実行中...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "run-check",
        "--project", projectPath,
        "--check", "methods_stats",
        "--slot", slotName,
      ]);
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "done" }));
        setStatusMessage({text: `方法・統計チェック（${slotDisplayName(slotName)}）が完了しました。`, type: "ok"});
      } else {
        setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
        setStatusMessage({text: `方法・統計チェック（${slotDisplayName(slotName)}）に失敗しました。`, type: "error"});
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setMethodsStatsCheckResults((prev) => ({ ...prev, [slotName]: "failed" }));
      setStatusMessage({text: `方法・統計チェック（${slotDisplayName(slotName)}）でエラーが発生しました。`, type: "error"});
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
    settings: "settings",
    journal: "journal",
    input: "project",
    preprocess: "preprocess",
    sections: "sections",
    citations: "preprocess",
    db_check: "preprocess",
    cite_review: "citations",
    review: "review",
    output: "results",
  };

  const handleStepClick = (viewKey: string) => {
    const target = stepToView[viewKey];
    if (target) setActiveView(target);
  };

  const progressProps = {
    projectPath,
    journalLoaded,
    sourceAttached,
    preprocessDone,
    numberingDone,
    sectionsDone,
    citationExtractionDone,
    crossrefDone,
    viewerDataReady,
    structureMergeDone,
    expressionMergeDone,
    methodsStatsMergeDone,
    finalMergeDone,
    settingsConfigured,
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

          {activeView === "journal" && (
            <JournalPanel
              projectPath={projectPath}
              journalProfile={journalProfile}
              journalLoaded={journalLoaded}
              journalLlmRunning={journalLlmRunning}
              journalLoading={journalLoading}
              journalExternalPrompt={journalExternalPrompt}
              journalImportText={journalImportText}
              journalImportPreview={journalImportPreview}
              journalImportError={journalImportError}
              llmSlots={llmSlots}
              onUpdateField={updateJournalField}
              onSave={saveJournal}
              onLoad={loadJournal}
              onLlmGenerate={runJournalLlm}
              onGenerateExternalPrompt={generateExternalPrompt}
              onImportTextChange={setJournalImportText}
              onImportParse={parseImportJournal}
              onImportConfirm={confirmImportJournal}
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
              onPreprocessAll={runPreprocessAll}
              preprocessAllRunning={preprocessAllRunning}
              preprocessAllStep={preprocessAllStep}
              onPreprocess={preprocessSource}
              onNumbering={runNumbering}
              onSections={runSections}
              onExtractCitations={runExtractCitations}
              onCrossrefDb={runCrossrefDb}
              onViewerData={runViewerData}
              statusMessage={statusMessage}
            />
          )}

          {activeView === "sections" && (
            <SectionViewerPanel
              projectPath={projectPath}
              sectionsDone={sectionsDone}
              statusMessage={statusMessage}
            />
          )}

          {activeView === "citations" && (
            <CitationReviewPanel
              projectPath={projectPath}
              crossrefDone={crossrefDone}
              viewerDataReady={viewerDataReady}
              viewerDataGenerating={viewerDataGenerating}
              viewerDataVersion={viewerDataVersion}
              onViewerData={runViewerData}
              llmRepairDone={llmRepairDone}
              llmRepairGenerating={llmRepairGenerating}
              onLlmRepair={runLlmRepair}
              llmSlots={llmSlots}
              googleBooksDone={googleBooksDone}
              googleBooksGenerating={googleBooksGenerating}
              googleBooksCandidateCount={googleBooksCandidateCount}
              googleBooksEnabled={googleBooksEnabled}
              onGoogleBooks={runGoogleBooksDb}
              llmFlagsDone={llmFlagsDone}
              llmFlagsGenerating={llmFlagsGenerating}
              onGenerateLlmFlags={runLlmFlags}
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
              llmEnvCheckResults={llmEnvCheckResults}
              onUpdateSlot={updateSlot}
              onTestSlot={testLlmSlot}
              onCheckLlmEnv={checkLlmEnv}
              onTestAll={testAllLlm}
              googleBooksApiKey={googleBooksApiKey}
              onGoogleBooksApiKeyChange={setGoogleBooksApiKey}
              googleBooksApiKeyMode={googleBooksApiKeyMode}
              onGoogleBooksApiKeyModeChange={setGoogleBooksApiKeyMode}
              googleBooksApiKeyEnvName={googleBooksApiKeyEnvName}
              onGoogleBooksApiKeyEnvNameChange={setGoogleBooksApiKeyEnvName}
              gbEnvCheckResult={gbEnvCheckResult}
              onCheckGbEnv={checkGbEnv}
              gbConnectionTestResult={gbConnectionTestResult}
              onTestGbConnection={testGbConnection}
              googleBooksEnabled={googleBooksEnabled}
              onGoogleBooksEnabledChange={setGoogleBooksEnabled}
              semanticScholarApiKey={semanticScholarApiKey}
              onSemanticScholarApiKeyChange={setSemanticScholarApiKey}
              semanticScholarApiKeyMode={semanticScholarApiKeyMode}
              onSemanticScholarApiKeyModeChange={setSemanticScholarApiKeyMode}
              semanticScholarApiKeyEnvName={semanticScholarApiKeyEnvName}
              onSemanticScholarApiKeyEnvNameChange={setSemanticScholarApiKeyEnvName}
              ssEnvCheckResult={ssEnvCheckResult}
              onCheckSsEnv={checkSsEnv}
              ssConnectionTestResult={ssConnectionTestResult}
              onTestSsConnection={testSsConnection}
              semanticScholarEnabled={semanticScholarEnabled}
              onSemanticScholarEnabledChange={setSemanticScholarEnabled}
              pubmedApiKey={pubmedApiKey}
              onPubmedApiKeyChange={setPubmedApiKey}
              pubmedApiKeyMode={pubmedApiKeyMode}
              onPubmedApiKeyModeChange={setPubmedApiKeyMode}
              pubmedApiKeyEnvName={pubmedApiKeyEnvName}
              onPubmedApiKeyEnvNameChange={setPubmedApiKeyEnvName}
              pubmedEnvCheckResult={pubmedEnvCheckResult}
              onCheckPubmedEnv={checkPubmedEnv}
              pubmedConnectionTestResult={pubmedConnectionTestResult}
              onTestPubmedConnection={testPubmedConnection}
              pubmedEnabled={pubmedEnabled}
              onPubmedEnabledChange={setPubmedEnabled}
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
              <div className="log-header-actions">
                <button onClick={cycleLogHeight} className="clear-btn" title="ログ領域の高さを切り替え">
                  {logHeight === "small" ? "▤ 小" : logHeight === "medium" ? "▤ 中" : "▤ 大"}
                </button>
                <button onClick={copyLogs} className="clear-btn">ログをコピー</button>
                <button onClick={clearLogs} className="clear-btn">ログを消去</button>
              </div>
            )}
          </div>
          {logExpanded && (
            <div
              className="app-log-area"
              style={{ maxHeight: logHeightPx }}
            >
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
