import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { slotDisplayName } from "./slotLabels";
import { sanitizeSingleLine, sanitizeUrl } from "./utils";

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
import NoveltyCheckPanel from "./panels/NoveltyCheckPanel";

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  proModel: string;
  flashModel: string;
  reasoningMode: "separate_models" | "same_model_with_thinking" | "none_or_unknown";
  apiKey: string;
  apiKeyMode: "direct" | "env_var";
  apiKeyEnvName: string;
  apiKeyStorage: "none" | "windows_hello";
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
  // DB cascade state
  const [pubmedDone, setPubmedDone] = useState(false);
  const [pubmedRunning, setPubmedRunning] = useState(false);
  const [dbCascadeRunning, setDbCascadeRunning] = useState(false);
  const [llmFlagsDone, setLlmFlagsDone] = useState(false);
  const [llmFlagsGenerating, setLlmFlagsGenerating] = useState(false);
  const [unmatchedExportGenerating, setUnmatchedExportGenerating] = useState(false);
  const [searchReferencesDone, setSearchReferencesDone] = useState(false);
  const [searchReferencesGenerating, setSearchReferencesGenerating] = useState(false);

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

  // Translation state
  const [translateJaRunning, setTranslateJaRunning] = useState(false);
  const [translateJaDone, setTranslateJaDone] = useState(false);
  const [translateJaProgress, setTranslateJaProgress] = useState<{
    section: string; heading: string; index: number; total: number;
  } | null>(null);
  const translateJaChildRef = useRef<{ kill: () => Promise<void> } | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  // Trigger SectionViewerPanel to reload translations from disk
  const [translationReloadKey, setTranslationReloadKey] = useState(0);
  // Font size for section viewer text panes (saved to app_settings.json)
  const [sectionViewerFontSize, setSectionViewerFontSize] = useState<"small" | "normal" | "large" | "xlarge">("normal");
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
  const [cniiDone, setCniiDone] = useState(false);
  const [cniiRunning, setCniiRunning] = useState(false);
  const [ciniiAppid, setCiniiAppid] = useState("");
  const [semanticScholarDone, setSemanticScholarDone] = useState(false);
  const [semanticScholarRunning, setSemanticScholarRunning] = useState(false);

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

  // Check Windows Hello availability on mount
  useEffect(() => {
    const check = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const available = await invoke<boolean>("windows_hello_available");
        setWindowsHelloAvailable(available);
      } catch {
        setWindowsHelloAvailable(false);
      }
    };
    check();
  }, []);

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
    publication_criteria: {
      novelty_required: "unknown",
      impact_required: "unknown",
      significance_required: "unknown",
      technical_soundness_focus: "unknown",
      methodological_rigour_focus: "unknown",
      statistical_rigour_focus: "unknown",
      conclusion_supported_by_data_focus: "unknown",
      ethical_robustness_focus: "unknown",
      data_availability_focus: "unknown",
      reproducibility_transparency_focus: "unknown",
    },
    research_type_acceptance: {
      accepts_incremental_research: "unknown",
      accepts_confirmatory_research: "unknown",
      accepts_replication: "unknown",
      accepts_negative_or_null_results: "unknown",
      accepts_niche_scope: "unknown",
      accepts_multidisciplinary_work: "unknown",
    },
    journal_position: {
      multidisciplinary_mega_journal: "unknown",
      broad_scope_journal: "unknown",
      field_specific_high_impact_journal: "unknown",
      clinical_high_impact_journal: "unknown",
      society_journal: "unknown",
      journal_position_summary: "",
    },
    metrics: {
      impact_factor: "",
      five_year_impact_factor: "",
      cite_score: "",
      sjr: "",
      snip: "",
      quartile: "",
      category_rankings: "",
      indexing: "",
      acceptance_rate_if_available: "",
    },
    submission_strategy: {
      suitable_novelty_strategy: "",
      suitable_framing_strategy: "",
      unsuitable_claims: "",
      claims_to_avoid: "",
      reviewer_likely_concerns: "",
      manuscript_strengths_to_emphasize: "",
      manuscript_weaknesses_to_control: "",
    },
    sources: [],
    notes: "",
    source: "manual",
    source_details: "",
    updated_at: "",
  };
  const [journalProfile, setJournalProfile] = useState<JournalProfile>(structuredClone(defaultJournalProfile));
  const [journalLoaded, setJournalLoaded] = useState(false);
  const [journalLlmRunning, setJournalLlmRunning] = useState(false);
  const [journalLoading, setJournalLoading] = useState(false);
  const [journalSaved, setJournalSaved] = useState(true);
  const [journalLlmPreview, setJournalLlmPreview] = useState<JournalProfile | null>(null);

  const defaultSlotEnvNames: Record<string, string> = {
    summary: "PRA_LLM_KEY_SUMMARY",
    reviewer1: "PRA_LLM_KEY_REVIEWER1",
    reviewer2: "PRA_LLM_KEY_REVIEWER2",
    reviewer3: "PRA_LLM_KEY_REVIEWER3",
  };
  const defaultSlots: LlmSlot[] = [
    { name: "summary", provider: "", baseUrl: "", model: "", proModel: "", flashModel: "", reasoningMode: "separate_models", apiKey: "", apiKeyMode: "env_var", apiKeyEnvName: "PRA_LLM_KEY_SUMMARY", apiKeyStorage: "none", enabled: true },
    { name: "reviewer1", provider: "", baseUrl: "", model: "", proModel: "", flashModel: "", reasoningMode: "separate_models", apiKey: "", apiKeyMode: "env_var", apiKeyEnvName: "PRA_LLM_KEY_REVIEWER1", apiKeyStorage: "none", enabled: true },
    { name: "reviewer2", provider: "", baseUrl: "", model: "", proModel: "", flashModel: "", reasoningMode: "separate_models", apiKey: "", apiKeyMode: "env_var", apiKeyEnvName: "PRA_LLM_KEY_REVIEWER2", apiKeyStorage: "none", enabled: true },
    { name: "reviewer3", provider: "", baseUrl: "", model: "", proModel: "", flashModel: "", reasoningMode: "separate_models", apiKey: "", apiKeyMode: "env_var", apiKeyEnvName: "PRA_LLM_KEY_REVIEWER3", apiKeyStorage: "none", enabled: false },
  ];
  const [llmSlots, setLlmSlots] = useState(defaultSlots);
  const [llmProTestResults, setLlmProTestResults] = useState<Record<string, string>>({});
  const [llmFlashTestResults, setLlmFlashTestResults] = useState<Record<string, string>>({});
  const [llmEnvCheckResults, setLlmEnvCheckResults] = useState<Record<string, string>>({});
  const [llmProReasoningResults, setLlmProReasoningResults] = useState<Record<string, boolean>>({});
  const [llmTestErrorMessages, setLlmTestErrorMessages] = useState<Record<string, string>>({});
  const [windowsHelloAvailable, setWindowsHelloAvailable] = useState(false);
  const [windowsHelloStatus, setWindowsHelloStatus] = useState<Record<string, "not_saved" | "saved">>({});
  const [windowsHelloDecrypted, setWindowsHelloDecrypted] = useState<Set<string>>(new Set());

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
            if (parsed.task === "translate-sections-ja") {
              setTranslateJaDone(true);
              setTranslateJaProgress(null);
            }
          }
          // Translation progress
          if (parsed.event === "progress" && parsed.task === "translate-sections-ja") {
            if (parsed.step === "translating" || parsed.step === "skipping") {
              setTranslateJaProgress({
                section: parsed.section as string,
                heading: (parsed.heading || parsed.section) as string,
                index: parsed.index as number,
                total: parsed.total as number,
              });
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
    // Save current settings before switching projects
    await saveAppSettings();

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
        if (await checkFile("translations/section_translations_ja.json")) setTranslateJaDone(true);

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
          setJournalSaved(true);
        } catch { /* journal_profile.json not found — that's fine */ }

        // Restore novelty check state from persisted files
        const noveltyDir = "outputs/novelty";
        try {
          // Phase 1: Paper summary
          if (await checkFile(`${noveltyDir}/novelty_summary.json`)) {
            const raw = await invoke<string>("read_text_file", { path: `${base}/${noveltyDir}/novelty_summary.json` });
            setNoveltySummaryContent(raw);
            setNoveltySummaryDone(true);
          }
        } catch { /* novelty_summary.json not found */ }
        try {
          // Phase 2: Deep Research prompts
          const hasBroad = await checkFile(`${noveltyDir}/deep_research_prompt_broad.md`);
          const hasCritical = await checkFile(`${noveltyDir}/deep_research_prompt_critical.md`);
          if (hasBroad || hasCritical) {
            if (hasBroad) {
              const raw = await invoke<string>("read_text_file", { path: `${base}/${noveltyDir}/deep_research_prompt_broad.md` });
              setNoveltyPromptBroad(raw);
            }
            if (hasCritical) {
              const raw = await invoke<string>("read_text_file", { path: `${base}/${noveltyDir}/deep_research_prompt_critical.md` });
              setNoveltyPromptCritical(raw);
            }
            setNoveltyPromptDone(true);
          }
        } catch { /* prompts not found */ }
        try {
          // Phase 3: Deep Research results
          if (await checkFile(`${noveltyDir}/deep_research_meta.json`)) {
            const metaRaw = await invoke<string>("read_text_file", { path: `${base}/${noveltyDir}/deep_research_meta.json` });
            const meta = JSON.parse(metaRaw);
            if (meta.a) {
              let aText = "";
              try { aText = await invoke<string>("read_text_file", { path: `${base}/${noveltyDir}/deep_research_a.txt` }); } catch { /* ok */ }
              setNoveltyDrA({ source_name: meta.a.source_name || "", executed_at: meta.a.executed_at || "", text: aText, notes: meta.a.notes || "" });
            }
            if (meta.b) {
              let bText = "";
              try { bText = await invoke<string>("read_text_file", { path: `${base}/${noveltyDir}/deep_research_b.txt` }); } catch { /* ok */ }
              setNoveltyDrB({ source_name: meta.b.source_name || "", executed_at: meta.b.executed_at || "", text: bText, notes: meta.b.notes || "" });
            }
            setNoveltyDrSaved(true);
          }
        } catch { /* deep research results not found */ }
        try {
          // Phase 4: Merge result
          if (await checkFile(`${noveltyDir}/deep_research_merged.md`)) {
            const raw = await invoke<string>("read_text_file", { path: `${base}/${noveltyDir}/deep_research_merged.md` });
            setNoveltyMergeContent(raw);
            setNoveltyMergeDone(true);
          }
        } catch { /* not found */ }
        try {
          // Phase 5: Assessment
          if (await checkFile(`${noveltyDir}/novelty_assessment.md`)) {
            const raw = await invoke<string>("read_text_file", { path: `${base}/${noveltyDir}/novelty_assessment.md` });
            setNoveltyAssessmentContent(raw);
            setNoveltyAssessDone(true);
          }
        } catch { /* not found */ }

        // Restore app settings (LLM slot config, DB API config — no API keys)
        // Pass explicit path since React state hasn't updated yet
        await loadAppSettings(selected);

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
    // Save current settings before creating a new project (projectPath may change)
    await saveAppSettings();

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
        setTranslateJaDone(false);
        // Try to load existing app settings for this project
        await loadAppSettings();
        // Persist current session settings to the new project
        await saveAppSettings();
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

  const runPubmedDb = async () => {
    setPubmedDone(false);
    setPubmedRunning(true);
    addLog({ event: "info", message: "Checking PubMed database..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "citation-db-pubmed",
        "--project", projectPath,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        setPubmedDone(true);
        return true;
      }
      return false;
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setPubmedRunning(false);
    }
  };

  const runDbCascade = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    setDbCascadeRunning(true);
    setStatusMessage({text: "文献DB一括照合: Crossref...", type: "info"});
    addLog({ event: "info", message: "Starting DB cascade: Crossref → PubMed → Google Books → Semantic Scholar → CiNii" });

    let crossrefOk = false;
    let pubmedOk = false;
    let gbooksOk = false;
    let semanticScholarOk = false;
    let ciniiOk = false;

    try {
      // ── Step 1: Crossref (always) ──────────────────────────────────
      setCrossrefDone(false);
      setCrossrefRunning(true);
      try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const crCmd = Command.create("pra-cli", [
          "citation-db-crossref", "--project", projectPath,
        ]);
        const crOut = await crCmd.execute();
        parseOutput(crOut.stdout);
        if (crOut.stderr) addLog({ event: "stderr", message: crOut.stderr });
        if (crOut.code === 0) { setCrossrefDone(true); crossrefOk = true; }
      } catch (e: unknown) {
        addLog({ event: "error", message: `Crossref: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        setCrossrefRunning(false);
      }

      // ── Step 2: PubMed (if NCBI key available) ─────────────────────
      setStatusMessage({text: "文献DB一括照合: PubMed...", type: "info"});
      setPubmedDone(false);
      setPubmedRunning(true);
      try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const pmCmd = Command.create("pra-cli", [
          "citation-db-pubmed", "--project", projectPath,
        ]);
        const pmOut = await pmCmd.execute();
        parseOutput(pmOut.stdout);
        if (pmOut.stderr) addLog({ event: "stderr", message: pmOut.stderr });
        if (pmOut.code === 0) { setPubmedDone(true); pubmedOk = true; }
      } catch (e: unknown) {
        addLog({ event: "error", message: `PubMed: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        setPubmedRunning(false);
      }

      // ── Step 3: Google Books (if key configured) ───────────────────
      const gbKeyOk = googleBooksApiKey.trim() || (
        googleBooksApiKeyMode === "env_var" && googleBooksApiKeyEnvName.trim()
      );
      if (gbKeyOk) {
        setStatusMessage({text: "文献DB一括照合: Google Books...", type: "info"});
        setGoogleBooksDone(false);
        setGoogleBooksGenerating(true);
        try {
          const { Command } = await import("@tauri-apps/plugin-shell");
          const gbArgs: string[] = [
            "citation-db-google-books", "--project", projectPath,
          ];
          if (googleBooksApiKeyMode === "direct" && googleBooksApiKey.trim()) {
            gbArgs.push("--api-key", googleBooksApiKey.trim());
          } else if (googleBooksApiKeyMode === "env_var" && googleBooksApiKeyEnvName.trim()) {
            gbArgs.push("--api-key-env", googleBooksApiKeyEnvName.trim());
          }
          const gbCmd = Command.create("pra-cli", gbArgs);
          const gbOut = await gbCmd.execute();
          parseOutput(gbOut.stdout);
          if (gbOut.stderr) addLog({ event: "stderr", message: gbOut.stderr });
          if (gbOut.code === 0) {
            setGoogleBooksDone(true); gbooksOk = true;
            const lines = gbOut.stdout.trim().split("\n");
            for (const line of lines) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.event === "done" && parsed.candidates_found != null) {
                  setGoogleBooksCandidateCount(parsed.candidates_found as number);
                }
              } catch { /* not JSON */ }
            }
          }
        } catch (e: unknown) {
          addLog({ event: "error", message: `Google Books: ${e instanceof Error ? e.message : String(e)}` });
        } finally {
          setGoogleBooksGenerating(false);
        }
      } else {
        addLog({ event: "info", message: "Google Books: API key not configured, skipping." });
      }

      // ── Step 4: Semantic Scholar (if key configured) ──────────────────
      const ssKeyOk = semanticScholarApiKey.trim() || (
        semanticScholarApiKeyMode === "env_var" && semanticScholarApiKeyEnvName.trim()
      );
      if (ssKeyOk) {
        setStatusMessage({text: "文献DB一括照合: Semantic Scholar...", type: "info"});
        setSemanticScholarDone(false);
        setSemanticScholarRunning(true);
        try {
          const { Command } = await import("@tauri-apps/plugin-shell");
          const ssArgs: string[] = [
            "citation-db-semantic-scholar", "--project", projectPath,
          ];
          if (semanticScholarApiKeyMode === "direct" && semanticScholarApiKey.trim()) {
            ssArgs.push("--api-key", semanticScholarApiKey.trim());
          } else if (semanticScholarApiKeyMode === "env_var" && semanticScholarApiKeyEnvName.trim()) {
            ssArgs.push("--api-key-env", semanticScholarApiKeyEnvName.trim());
          }
          const ssCmd = Command.create("pra-cli", ssArgs);
          const ssOut = await ssCmd.execute();
          parseOutput(ssOut.stdout);
          if (ssOut.stderr) addLog({ event: "stderr", message: ssOut.stderr });
          if (ssOut.code === 0) { setSemanticScholarDone(true); semanticScholarOk = true; }
        } catch (e: unknown) {
          addLog({ event: "error", message: `Semantic Scholar: ${e instanceof Error ? e.message : String(e)}` });
        } finally {
          setSemanticScholarRunning(false);
        }
      } else {
        addLog({ event: "info", message: "Semantic Scholar: API key not configured, skipping." });
      }

      // ── Step 5: CiNii (if appid configured) ────────────────────────
      const cniiAppid = ciniiAppid.trim();
      if (cniiAppid) {
        setStatusMessage({text: "文献DB一括照合: CiNii...", type: "info"});
        setCniiDone(false);
        setCniiRunning(true);
        try {
          const { Command } = await import("@tauri-apps/plugin-shell");
          const cnCmd = Command.create("pra-cli", [
            "citation-db-cinii", "--project", projectPath, "--appid", cniiAppid,
          ]);
          const cnOut = await cnCmd.execute();
          parseOutput(cnOut.stdout);
          if (cnOut.stderr) addLog({ event: "stderr", message: cnOut.stderr });
          if (cnOut.code === 0) { setCniiDone(true); ciniiOk = true; }
        } catch (e: unknown) {
          addLog({ event: "error", message: `CiNii: ${e instanceof Error ? e.message : String(e)}` });
        } finally {
          setCniiRunning(false);
        }
      } else {
        addLog({ event: "info", message: "CiNii: appid not configured, skipping." });
      }

      // ── Step 6: Auto-generate viewer data ──────────────────────────
      setStatusMessage({text: "文献確認データを作成中...", type: "info"});
      setViewerDataGenerating(true);
      let viewerOk = false;
      try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const vCmd = Command.create("pra-cli", [
          "citation-viewer-data", "--project", projectPath,
        ]);
        const vOut = await vCmd.execute();
        parseOutput(vOut.stdout);
        if (vOut.stderr) addLog({ event: "stderr", message: vOut.stderr });
        if (vOut.code === 0) {
          setViewerDataReady(true);
          setViewerDataVersion(v => v + 1);
          viewerOk = true;
        }
      } catch (e: unknown) {
        addLog({ event: "error", message: `Viewer data: ${e instanceof Error ? e.message : String(e)}` });
      } finally {
        setViewerDataGenerating(false);
      }

      const matchedDbs: string[] = [];
      if (crossrefOk) matchedDbs.push("Crossref");
      if (pubmedOk) matchedDbs.push("PubMed");
      if (gbooksOk) matchedDbs.push("Google Books");
      if (semanticScholarOk) matchedDbs.push("Semantic Scholar");
      if (ciniiOk) matchedDbs.push("CiNii");

      setStatusMessage({
        text: `文献DB一括照合が完了しました (${matchedDbs.join(" → ")}${viewerOk ? " → 文献確認データ作成済" : ""})`,
        type: "ok",
      });
    } catch (e: unknown) {
      addLog({ event: "error", message: `DB cascade error: ${e instanceof Error ? e.message : String(e)}` });
      setStatusMessage({text: "文献DB一括照合でエラーが発生しました。", type: "error"});
    } finally {
      setDbCascadeRunning(false);
    }
  };

  const runCiniiDb = async () => {
    const appid = ciniiAppid.trim();
    if (!appid) {
      setStatusMessage({text: "CiNii API appidが設定されていません。Settingsで設定してください。", type: "error"});
      return;
    }
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setCniiDone(false);
    setCniiRunning(true);
    setStatusMessage(null);
    addLog({ event: "info", message: "Searching CiNii Research for Japanese papers..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "citation-db-cinii",
        "--project",
        projectPath,
        "--appid",
        appid,
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        setCniiDone(true);
        setStatusMessage({text: "CiNii照合が完了しました。文献確認データを再作成してください。", type: "ok"});
      } else {
        setStatusMessage({text: "CiNii照合に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "CiNii照合でエラーが発生しました。", type: "error"});
    } finally {
      setCniiRunning(false);
    }
  };

  const runSemanticScholarDb = async () => {
    const ssKeyOk = semanticScholarApiKey.trim() || (
      semanticScholarApiKeyMode === "env_var" && semanticScholarApiKeyEnvName.trim()
    );
    if (!ssKeyOk) {
      setStatusMessage({text: "Semantic Scholar APIキーが設定されていません。Settingsで設定してください。", type: "error"});
      return;
    }
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setSemanticScholarDone(false);
    setSemanticScholarRunning(true);
    setStatusMessage(null);
    addLog({ event: "info", message: "Searching Semantic Scholar..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const ssArgs: string[] = [
        "citation-db-semantic-scholar",
        "--project", projectPath,
      ];
      if (semanticScholarApiKeyMode === "direct" && semanticScholarApiKey.trim()) {
        ssArgs.push("--api-key", semanticScholarApiKey.trim());
      } else if (semanticScholarApiKeyMode === "env_var" && semanticScholarApiKeyEnvName.trim()) {
        ssArgs.push("--api-key-env", semanticScholarApiKeyEnvName.trim());
      }
      const cmd = Command.create("pra-cli", ssArgs);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        setSemanticScholarDone(true);
        setStatusMessage({text: "Semantic Scholar照合が完了しました。文献確認データを再作成してください。", type: "ok"});
      } else {
        setStatusMessage({text: "Semantic Scholar照合に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "Semantic Scholar照合でエラーが発生しました。", type: "error"});
    } finally {
      setSemanticScholarRunning(false);
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
    if (!slot || !slot.provider.trim() || !slot.baseUrl.trim() || !slot.flashModel.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured (flash model required).` });
      return;
    }

    setLlmRepairGenerating(true);
    setStatusMessage(null);
    addLog({ event: "info", message: `Running LLM reference repair on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "repair-references-llm",
        "--project", projectPath,
        "--slot", slotName,
      ], slot.flashModel, "flash");
      const cmd = Command.create("pra-cli", args);
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

  const runUnmatchedExport = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setUnmatchedExportGenerating(true);
    setStatusMessage(null);
    addLog({ event: "info", message: "未照合文献をCSV出力中..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "citation-db-unmatched-export",
        "--project", projectPath,
        "--format", "csv",
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        // Extract output path from done event
        let outPath = "";
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "done" && parsed.output) {
                outPath = parsed.output as string;
              }
            } catch { /* not JSON */ }
          }
        }
        setStatusMessage({text: outPath ? `未照合文献を出力しました: ${outPath}` : "未照合文献をCSV出力しました。", type: "ok"});
      } else {
        setStatusMessage({text: "未照合文献のCSV出力に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "未照合文献のCSV出力でエラーが発生しました。", type: "error"});
    } finally {
      setUnmatchedExportGenerating(false);
    }
  };

  const runSearchReferences = async (slotName: string) => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot || !slot.provider.trim() || !slot.baseUrl.trim() || !slot.proModel.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured (pro model required).` });
      return;
    }

    setSearchReferencesGenerating(true);
    setStatusMessage(null);
    addLog({ event: "info", message: `Running LLM reference search on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "search-references-llm",
        "--project", projectPath,
        "--slot", slotName,
      ], slot.proModel, "pro");
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
      if (output.code === 0) {
        setSearchReferencesDone(true);
        setStatusMessage({text: `LLM文献検索が完了しました (${slotDisplayName(slotName)})。文献確認データを再作成してください。`, type: "ok"});
      } else {
        setStatusMessage({text: "LLM文献検索に失敗しました。", type: "error"});
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({text: "LLM文献検索でエラーが発生しました。", type: "error"});
    } finally {
      setSearchReferencesGenerating(false);
    }
  };

  const openSearchLog = async () => {
    if (!projectPath.trim()) return;
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "citation-open-log",
        "--project", projectPath,
        "--log-name", "llm_search",
      ]);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });
    } catch (e: unknown) {
      addLog({ event: "error", message: `ログファイルを開けませんでした: ${e instanceof Error ? e.message : String(e)}` });
    }
  };

  const runLlmFlags = async (slotName: string) => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot || !slot.provider.trim() || !slot.baseUrl.trim() || !slot.proModel.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured (pro model required).` });
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
      ], slot.proModel, "pro");
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

  // Add state for the combined process
  const [llmReferenceProcessRunning, setLlmReferenceProcessRunning] = useState(false);

  // ── Novelty check states ──
  // ── Novelty check states (7-phase pipeline) ─────────────────────────
  // Phase 1: Paper summary
  const [noveltySummaryDone, setNoveltySummaryDone] = useState(false);
  const [noveltySummaryRunning, setNoveltySummaryRunning] = useState(false);
  const [noveltySummaryContent, setNoveltySummaryContent] = useState("");
  // Phase 2: Deep Research prompts
  const [noveltyPromptBroad, setNoveltyPromptBroad] = useState("");
  const [noveltyPromptCritical, setNoveltyPromptCritical] = useState("");
  const [noveltyPromptDone, setNoveltyPromptDone] = useState(false);
  // Phase 3: Deep Research results (A/B)
  const defaultDrEntry = { source_name: "", executed_at: "", text: "", notes: "" };
  const [noveltyDrA, setNoveltyDrA] = useState<{ source_name: string; executed_at: string; text: string; notes: string }>({ ...defaultDrEntry });
  const [noveltyDrB, setNoveltyDrB] = useState<{ source_name: string; executed_at: string; text: string; notes: string }>({ ...defaultDrEntry });
  const [noveltyDrSaved, setNoveltyDrSaved] = useState(false);
  // Phase 4: Merge
  const [noveltyMergeDone, setNoveltyMergeDone] = useState(false);
  const [noveltyMergeRunning, setNoveltyMergeRunning] = useState(false);
  const [noveltyMergeContent, setNoveltyMergeContent] = useState("");
  // Phase 5: Assessment
  const [noveltyAssessDone, setNoveltyAssessDone] = useState(false);
  const [noveltyAssessRunning, setNoveltyAssessRunning] = useState(false);
  const [noveltyAssessmentContent, setNoveltyAssessmentContent] = useState("");

  /** Run LLM re-parse + flags + viewer data refresh in one operation.
   *  Human decisions in human_reference_decisions.json are automatically
   *  reflected during flag generation. */
  const runLlmReferenceProcess = async (slotName: string) => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    setLlmReferenceProcessRunning(true);
    setStatusMessage(null);
    addLog({ event: "info", message: `LLMで文献情報を整理中 (${slotDisplayName(slotName)})...` });

    // Run all three steps sequentially. Each step handles its own errors
    // and sets its own state flags (llmRepairDone / llmFlagsDone).
    // If a step fails, subsequent steps will still run (idempotent — they'll
    // work with whatever data is available from previous steps).
    await runLlmRepair(slotName);
    await runLlmFlags(slotName);
    await runSearchReferences(slotName);
    await runViewerData();

    setLlmReferenceProcessRunning(false);
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
    setJournalSaved(false);
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
      setJournalSaved(true);
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
      setJournalSaved(true);
      setStatusMessage({ text: "ジャーナル情報を読み込みました。", type: "ok" });
    } catch {
      setStatusMessage({ text: "journal_profile.json が見つかりません。", type: "error" });
    } finally {
      setJournalLoading(false);
    }
  };

  /** Run LLM journal profile generation via CLI. Sets journalLlmPreview on success. */
  const runJournalLlm = async (slotName: string) => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot || !slot.provider.trim() || !slot.baseUrl.trim() || !slot.proModel.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured (pro model required).` });
      return;
    }

    setJournalLlmRunning(true);
    setJournalLlmPreview(null);
    setStatusMessage(null);
    addLog({ event: "info", message: `Running journal profile generation on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "generate-journal-profile",
        "--project", projectPath,
        "--slot", slotName,
        "--journal-name", journalProfile.journal_name.trim(),
      ], slot.proModel, "pro");
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
        // Read the generated profile into preview (do NOT auto-load into main profile)
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const jsonPath = `${projectPath.replace(/\\/g, "/")}/journal_profile.json`;
          const raw = await invoke<string>("read_text_file", { path: jsonPath });
          const parsed = JSON.parse(raw);
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
          setJournalLlmPreview(merged as JournalProfile);
          setStatusMessage({ text: `LLMでジャーナル情報を取得しました (${slotDisplayName(slotName)})。内容を確認して「取り込む」を押してください。`, type: "ok" });
        } catch {
          setStatusMessage({ text: "ジャーナル情報の生成は成功しましたが、ファイルの読み込みに失敗しました。", type: "error" });
        }
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

  /** Apply a journal profile preview (from LLM or external AI) to the main profile state. */
  const applyJournalPreview = (profile: JournalProfile) => {
    setJournalProfile(profile);
    setJournalSaved(false);
  };

  /** Clear the LLM-generated preview. */
  const clearLlmPreview = () => {
    setJournalLlmPreview(null);
  };

  /** Persist API settings (enabled, provider, model, roles — NOT api keys unless encrypted). */
  const saveAppSettings = async () => {
    if (!projectPath.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const settingsPath = `${projectPath.replace(/\\/g, "/")}/app_settings.json`;
      const payload = {
        section_viewer_font_size: sectionViewerFontSize,
        llm_slots: Object.fromEntries(
          llmSlots.map((s) => [s.name, {
            enabled: s.enabled,
            provider: sanitizeSingleLine(s.provider),
            base_url: sanitizeUrl(s.baseUrl),
            reasoning_mode: s.reasoningMode,
            pro_model: sanitizeSingleLine(s.proModel),
            flash_model: sanitizeSingleLine(s.flashModel),
            api_key_mode: s.apiKeyMode,
            api_key_env_name: sanitizeSingleLine(s.apiKeyEnvName),
            api_key_storage: s.apiKeyStorage,
          }])
        ),
        literature_databases: {
          pubmed: {
            enabled: pubmedEnabled,
            api_key_mode: pubmedApiKeyMode,
            api_key_env_name: pubmedApiKeyEnvName,
          },
          google_books: {
            enabled: googleBooksEnabled,
            api_key_mode: googleBooksApiKeyMode,
            api_key_env_name: googleBooksApiKeyEnvName,
          },
          semantic_scholar: {
            enabled: semanticScholarEnabled,
            api_key_mode: semanticScholarApiKeyMode,
            api_key_env_name: semanticScholarApiKeyEnvName,
          },
          cinii: {
            appid: ciniiAppid,
          },
        },
      };
      await invoke("write_text_file", { path: settingsPath, content: JSON.stringify(payload, null, 2) });

      addLog({
        event: "app_settings_save",
        path: settingsPath,
        project_path: projectPath,
        slot_count: llmSlots.length,
        saved: true,
      });

      // Check for Windows Hello secrets
      let helloSlots: string[] = [];
      for (const [k, v] of Object.entries(windowsHelloStatus)) {
        if (v === "saved") helloSlots.push(k);
      }
      const helloNote = helloSlots.length > 0
        ? `\nAPIキーはWindows Helloで保護され、app_settings.secrets.jsonに暗号化保存されています。`
        : "";

      setStatusMessage({
        text: `API設定を保存しました: ${settingsPath}${helloNote}`,
        type: "ok",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setStatusMessage({ text: "API設定の保存に失敗しました。", type: "error" });
    }
  };

  /** Load API settings from app_settings.json (restore enabled, provider, model, env names — NOT api keys).
   *  Accepts optional pathOverride to work around React state staleness during project open. */
  const loadAppSettings = async (pathOverride?: string) => {
    const effectivePath = pathOverride || projectPath;
    if (!effectivePath.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const settingsPath = `${effectivePath.replace(/\\/g, "/")}/app_settings.json`;
      const raw = await invoke<string>("read_text_file", { path: settingsPath });
      const data = JSON.parse(raw);

      addLog({
        event: "app_settings_load",
        path: settingsPath,
        found: true,
        loaded_slots: data.llm_slots ? Object.keys(data.llm_slots) : [],
      });

      // Restore font size preference
      if (data.section_viewer_font_size === "small" ||
          data.section_viewer_font_size === "normal" ||
          data.section_viewer_font_size === "large" ||
          data.section_viewer_font_size === "xlarge") {
        setSectionViewerFontSize(data.section_viewer_font_size);
      }

      // Restore LLM slots (merge onto defaults to keep all fields)
      if (data.llm_slots && typeof data.llm_slots === "object") {
        setLlmSlots((prev) =>
          prev.map((s) => {
            const saved = data.llm_slots[s.name];
            if (saved && typeof saved === "object") {
              return {
                ...s,
                enabled: typeof saved.enabled === "boolean" ? saved.enabled : s.enabled,
                provider: typeof saved.provider === "string" ? sanitizeSingleLine(saved.provider) : s.provider,
                baseUrl: typeof saved.base_url === "string" ? sanitizeUrl(saved.base_url) : s.baseUrl,
                reasoningMode: (saved.reasoning_mode === "separate_models" || saved.reasoning_mode === "same_model_with_thinking" || saved.reasoning_mode === "none_or_unknown") ? saved.reasoning_mode : s.reasoningMode,
                proModel: typeof saved.pro_model === "string" ? sanitizeSingleLine(saved.pro_model) : s.proModel,
                flashModel: typeof saved.flash_model === "string" ? sanitizeSingleLine(saved.flash_model) : s.flashModel,
                apiKeyMode: (saved.api_key_mode === "direct" || saved.api_key_mode === "env_var") ? saved.api_key_mode : s.apiKeyMode,
                apiKeyEnvName: typeof saved.api_key_env_name === "string" ? sanitizeSingleLine(saved.api_key_env_name) : s.apiKeyEnvName,
                apiKeyStorage: (saved.api_key_storage === "none" || saved.api_key_storage === "windows_hello") ? saved.api_key_storage : "none",
              };
            }
            return s;
          })
        );
      }

      // Restore DB API settings
      const dbs = data.literature_databases;
      if (dbs && typeof dbs === "object") {
        const restoreDb = (dbData: unknown, setEnabled: (v: boolean) => void, setMode: (v: "direct" | "env_var") => void, setEnv: (v: string) => void) => {
          if (dbData && typeof dbData === "object") {
            const d = dbData as Record<string, unknown>;
            if (typeof d.enabled === "boolean") setEnabled(d.enabled);
            if (d.api_key_mode === "direct" || d.api_key_mode === "env_var") setMode(d.api_key_mode);
            if (typeof d.api_key_env_name === "string") setEnv(d.api_key_env_name);
          }
        };
        restoreDb(dbs.pubmed, setPubmedEnabled, setPubmedApiKeyMode, setPubmedApiKeyEnvName);
        restoreDb(dbs.google_books, setGoogleBooksEnabled, setGoogleBooksApiKeyMode, setGoogleBooksApiKeyEnvName);
        restoreDb(dbs.semantic_scholar, setSemanticScholarEnabled, setSemanticScholarApiKeyMode, setSemanticScholarApiKeyEnvName);
        // Restore CiNii appid (simple string)
        if (dbs.cinii && typeof dbs.cinii === "object") {
          const c = dbs.cinii as Record<string, unknown>;
          if (typeof c.appid === "string") setCiniiAppid(c.appid);
        }
      }

      // Check for Windows Hello-protected secrets
      const helloStatus: Record<string, "not_saved" | "saved"> = {};
      const dpapiEntries: string[] = [];
      try {
        const secretsPath = `${effectivePath.replace(/\\/g, "/")}/app_settings.secrets.json`;
        const secretsRaw = await invoke<string>("read_text_file", { path: secretsPath });
        const secretsData = JSON.parse(secretsRaw);

        for (const [key, value] of Object.entries(secretsData)) {
          if (value && typeof value === "object" && (value as Record<string, unknown>).type === "dpapi") {
            const slotName = key.startsWith("llm_") ? key.slice(4) : null;
            if (slotName) {
              helloStatus[slotName] = "saved";
              dpapiEntries.push(key);
            }
          }
        }
        setWindowsHelloStatus(helloStatus);
        setWindowsHelloDecrypted(new Set());

        if (dpapiEntries.length > 0) {
          addLog({
            event: "app_settings_secrets_load",
            path: secretsPath,
            dpapi_entries: dpapiEntries,
          });
          setStatusMessage({ text: "API設定を読み込みました。Windows Helloで保護されたAPIキーがあります（「Windows Helloで復号」でメモリに復元してください）。", type: "info" });
        } else {
          setStatusMessage({ text: "API設定を読み込みました。", type: "info" });
        }
      } catch {
        // No secrets file — fine
        setStatusMessage({ text: "API設定を読み込みました。", type: "info" });
      }
    } catch {
      // app_settings.json not found — that's fine, use defaults
    }
  };

  /** Clear decrypted keys from memory. */
  const lockSecrets = () => {
    // Clear apiKey fields from all slots (keep other settings)
    setLlmSlots((prev) => prev.map((s) => ({ ...s, apiKey: "" })));
    setPubmedApiKey("");
    setGoogleBooksApiKey("");
    setSemanticScholarApiKey("");
    setWindowsHelloDecrypted(new Set());
    setStatusMessage({ text: "APIキーをロックしました。", type: "info" });
  };

  /** Windows Hello: Save API key with DPAPI protection. */
  const windowsHelloSaveKey = async (slotName: string, apiKey: string): Promise<boolean> => {
    if (!projectPath.trim() || !apiKey.trim()) return false;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const encrypted = await invoke<string>("windows_hello_protect", {
        data: apiKey,
        keyName: `llm.${slotName}`,
      });

      // Read existing secrets, merge in DPAPI blob, write back
      const base = projectPath.replace(/\\/g, "/");
      const secretsPath = `${base}/app_settings.secrets.json`;
      let secrets: Record<string, unknown> = {};
      try {
        const raw = await invoke<string>("read_text_file", { path: secretsPath });
        secrets = JSON.parse(raw);
      } catch { /* file doesn't exist yet */ }

      secrets[`llm_${slotName}`] = { type: "dpapi", blob: encrypted };
      await invoke("write_text_file", { path: secretsPath, content: JSON.stringify(secrets, null, 2) });

      setWindowsHelloStatus((prev) => ({ ...prev, [slotName]: "saved" }));
      setStatusMessage({ text: `${slotDisplayName(slotName)}のAPIキーをWindows Helloで保護して保存しました。`, type: "ok" });
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: `Windows Hello protect failed for ${slotName}: ${msg}` });
      setStatusMessage({ text: "Windows Helloでの保存に失敗しました。", type: "error" });
      return false;
    }
  };

  /** Windows Hello: Decrypt API key into memory. */
  const windowsHelloDecryptKey = async (slotName: string): Promise<string | null> => {
    if (!projectPath.trim()) return null;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const base = projectPath.replace(/\\/g, "/");
      const secretsPath = `${base}/app_settings.secrets.json`;
      const raw = await invoke<string>("read_text_file", { path: secretsPath });
      const secrets = JSON.parse(raw);
      const entry = secrets[`llm_${slotName}`];
      if (!entry || entry.type !== "dpapi" || !entry.blob) {
        setStatusMessage({ text: "保存されたDPAPIデータが見つかりません。", type: "error" });
        return null;
      }

      const plaintext = await invoke<string>("windows_hello_unprotect", {
        encryptedBase64: entry.blob,
        keyName: `llm.${slotName}`,
      });

      // Populate the apiKey field in memory only
      setLlmSlots((prev) => prev.map((s) => s.name === slotName ? { ...s, apiKey: plaintext } : s));
      setWindowsHelloDecrypted((prev) => new Set(prev).add(slotName));
      setStatusMessage({ text: `${slotDisplayName(slotName)}のAPIキーを復号しました（メモリ上のみ保持）。`, type: "ok" });
      return plaintext;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: `Windows Hello unprotect failed for ${slotName}: ${msg}` });
      setStatusMessage({ text: "Windows Helloでの復号に失敗しました。", type: "error" });
      return null;
    }
  };

  /** Windows Hello: Delete DPAPI-protected key after verification. */
  const windowsHelloDeleteKey = async (slotName: string): Promise<boolean> => {
    if (!projectPath.trim()) return false;
    try {
      const { invoke } = await import("@tauri-apps/api/core");

      // Verify identity first
      const verified = await invoke<boolean>("windows_hello_verify", {
        message: "保存済みAPIキーを削除するために本人確認が必要です",
      });
      if (!verified) {
        setStatusMessage({ text: "本人確認がキャンセルされました。", type: "error" });
        return false;
      }

      const base = projectPath.replace(/\\/g, "/");
      const secretsPath = `${base}/app_settings.secrets.json`;
      let secrets: Record<string, unknown> = {};
      try {
        const raw = await invoke<string>("read_text_file", { path: secretsPath });
        secrets = JSON.parse(raw);
      } catch { return false; }

      delete secrets[`llm_${slotName}`];
      await invoke("write_text_file", { path: secretsPath, content: JSON.stringify(secrets, null, 2) });

      setWindowsHelloStatus((prev) => ({ ...prev, [slotName]: "not_saved" }));
      // Clear in-memory key and decrypted flag for this slot
      setLlmSlots((prev) => prev.map((s) => s.name === slotName ? { ...s, apiKey: "" } : s));
      setWindowsHelloDecrypted((prev) => { const next = new Set(prev); next.delete(slotName); return next; });
      setStatusMessage({ text: `${slotDisplayName(slotName)}の保存済みAPIキーを削除しました。`, type: "info" });
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: `Windows Hello delete failed for ${slotName}: ${msg}` });
      setStatusMessage({ text: "保存済みAPIキーの削除に失敗しました。", type: "error" });
      return false;
    }
  };

  const updateSlot = (slotName: string, field: string, value: string | boolean) => {
    setLlmSlots((prev) =>
      prev.map((s) => (s.name === slotName ? { ...s, [field]: value } : s))
    );
  };

  /** Build LLM CLI args for a slot, respecting apiKeyMode (direct vs env_var).
   *  Pass `model` to override which model name is used (e.g. slot.proModel or slot.flashModel).
   *  Pass `modelVariant` to control --thinking-enabled for same_model_with_thinking providers. */
  const buildLlmArgs = (slot: LlmSlot, cmd: string[], model?: string, modelVariant?: "pro" | "flash"): string[] => {
    const args = [...cmd];
    args.push("--provider", sanitizeSingleLine(slot.provider));
    args.push("--base-url", sanitizeUrl(slot.baseUrl));
    args.push("--model", sanitizeSingleLine(model || slot.model));
    if (slot.apiKeyMode === "direct" && slot.apiKey.trim()) {
      args.push("--api-key", slot.apiKey.trim());
    } else if (slot.apiKeyMode === "env_var" && slot.apiKeyEnvName.trim()) {
      args.push("--api-key-env", sanitizeSingleLine(slot.apiKeyEnvName));
    } else {
      args.push("--api-key", slot.apiKey); // fallback
    }
    // Enable thinking for same_model_with_thinking providers when in pro mode
    if (slot.reasoningMode === "same_model_with_thinking" && modelVariant === "pro") {
      args.push("--thinking-enabled");
    }
    // Kimi/Moonshot requires temperature=1
    const isKimiMoonshot = (
      /kimi|moonshot/i.test(slot.provider) ||
      /moonshot\.ai/i.test(slot.baseUrl)
    );
    if (isKimiMoonshot) {
      args.push("--temperature", "1");
    }
    return args;
  };

  const testLlmSlot = async (slotName: string, modelVariant: "pro" | "flash") => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    const variantLabel = modelVariant === "pro" ? "Pro" : "Flash";
    const modelName = modelVariant === "pro" ? slot.proModel : slot.flashModel;
    const setResults = modelVariant === "pro" ? setLlmProTestResults : setLlmFlashTestResults;
    const label = slotDisplayName(slotName);
    const thinkingEnabled = slot.reasoningMode === "same_model_with_thinking" && modelVariant === "pro";

    if (!slot.provider.trim() || !slot.baseUrl.trim() || !modelName.trim()) {
      addLog({ event: "error", message: `${label} (${variantLabel}): プロバイダ、Base URL、モデルを入力してください。` });
      return;
    }
    if (slot.apiKeyMode === "direct" && !slot.apiKey.trim()) {
      addLog({ event: "error", message: `${label} (${variantLabel}): APIキーが未入力です。` });
      setResults((prev) => ({ ...prev, [slotName]: "error" }));
      setLlmTestErrorMessages((prev) => ({ ...prev, [`${slotName}_${modelVariant}`]: "APIキーが未入力です。" }));
      return;
    }
    if (slot.apiKeyMode === "env_var" && !slot.apiKeyEnvName.trim()) {
      addLog({ event: "error", message: `${label} (${variantLabel}): 環境変数名を入力してください。` });
      return;
    }

    const errorKey = `${slotName}_${modelVariant}`;
    setResults((prev) => ({ ...prev, [slotName]: "testing" }));
    setLlmTestErrorMessages((prev) => { const next = {...prev}; delete next[errorKey]; return next; });
    addLog({ event: "info", message: `${label} (${variantLabel}) の接続をテスト中...` });

    // Log test config (no API key values)
    const isKimiMoonshot = (
      /kimi|moonshot/i.test(slot.provider) ||
      /moonshot\.ai/i.test(slot.baseUrl)
    );
    const testTemperature = isKimiMoonshot ? 1 : undefined;
    addLog({
      event: "llm_test_config",
      slot: slotName,
      provider: slot.provider,
      base_url: slot.baseUrl,
      endpoint: `${sanitizeUrl(slot.baseUrl)}/chat/completions`,
      model: modelName,
      api_key_mode: slot.apiKeyMode,
      api_key_env_name: slot.apiKeyMode === "env_var" ? slot.apiKeyEnvName : undefined,
      api_key_present: slot.apiKeyMode === "direct" ? !!slot.apiKey.trim() : undefined,
      reasoning_mode: slot.reasoningMode,
      thinking_enabled: thinkingEnabled,
      temperature: testTemperature,
    });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "test-llm",
        "--slot", slotName,
      ], modelName, modelVariant);
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setResults((prev) => ({ ...prev, [slotName]: "ok" }));
        setLlmTestErrorMessages((prev) => { const next = {...prev}; delete next[errorKey]; return next; });
        setSettingsConfigured(true);

        // Detect reasoning_content for same_model_with_thinking Pro tests
        if (modelVariant === "pro" && slot.reasoningMode === "same_model_with_thinking") {
          let hasReasoning: boolean | undefined;
          const lines = output.stdout.trim().split("\n");
          for (const line of lines) {
            if (line.trim()) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.event === "done") {
                  hasReasoning = parsed.reasoning_content_present === true;
                  setLlmProReasoningResults((prev) => ({
                    ...prev,
                    [slotName]: hasReasoning,
                  }));
                }
              } catch { /* skip non-JSON line */ }
            }
          }
          // If reasoning not confirmed, set a warning
          if (hasReasoning === false) {
            setLlmTestErrorMessages((prev) => ({
              ...prev,
              [`${slotName}_pro_reasoning`]: "応答は返っていますが reasoning_content がありません。thinkingが有効か確認してください。",
            }));
          }
        }
      } else {
        // Parse error details from CLI output
        let errorMsg = "接続に失敗しました。";
        const lines = output.stdout.trim().split("\n");
        for (const line of lines) {
          if (line.trim()) {
            try {
              const parsed = JSON.parse(line);
              if (parsed.event === "error") {
                if (parsed.code === "NO_API_KEY") {
                  errorMsg = `環境変数 ${slot.apiKeyEnvName || "?"} が未設定です。`;
                } else if (parsed.message) {
                  const msg = parsed.message as string;
                  if (msg.includes("429") || msg.includes("rate limit")) {
                    errorMsg = "429 Rate Limit — リクエスト制限に達しました。";
                  } else if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("authentication")) {
                    errorMsg = "認証エラー — APIキーまたは権限を確認してください。";
                  } else if (msg.includes("404") || msg.includes("not found")) {
                    errorMsg = "Base URLまたはモデル名が正しくない可能性があります。";
                  } else if (msg.includes("temperature")) {
                    errorMsg = "Kimi K2.6 は temperature=1 のみ対応しています。設定を自動調整してください。";
                  } else {
                    errorMsg = msg;
                  }
                }
              }
            } catch { /* skip non-JSON */ }
          }
        }
        setResults((prev) => ({ ...prev, [slotName]: "error" }));
        setLlmTestErrorMessages((prev) => ({ ...prev, [errorKey]: errorMsg }));
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      setResults((prev) => ({ ...prev, [slotName]: "error" }));
      setLlmTestErrorMessages((prev) => ({ ...prev, [errorKey]: "CLI実行中にエラーが発生しました。" }));
    }
  };

  const testAllLlm = async () => {
    for (const slot of llmSlots) {
      if (slot.enabled) {
        if (slot.proModel.trim()) await testLlmSlot(slot.name, "pro");
        if (slot.flashModel.trim()) await testLlmSlot(slot.name, "flash");
      }
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

  // ── Novelty check handlers ────────────────────────────────────────────────

  const runNoveltySummarize = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.proModel.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured (pro model required).` });
      return;
    }

    setNoveltySummaryRunning(true);
    setNoveltySummaryDone(false);
    setNoveltySummaryContent("");
    setNoveltyPromptDone(false);
    setNoveltyPromptBroad("");
    setNoveltyPromptCritical("");
    setNoveltyDrSaved(false);
    setNoveltyMergeDone(false);
    setNoveltyMergeContent("");
    setNoveltyAssessDone(false);
    setNoveltyAssessmentContent("");
    setStatusMessage(null);
    addLog({ event: "info", message: `Running novelty summarize on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "novelty-summarize",
        "--project", projectPath,
        "--slot", slotName,
      ], slot.proModel, "pro");
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setNoveltySummaryDone(true);
        // Load the summary content
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const path = `${projectPath.replace(/\\/g, "/")}/outputs/novelty/novelty_summary.json`;
          const raw = await invoke<string>("read_text_file", { path });
          setNoveltySummaryContent(raw);
        } catch {
          // File might not be readable immediately
        }
        setStatusMessage({ text: "論文概要を生成しました。", type: "ok" });
      } else {
        setStatusMessage({ text: "論文概要の生成に失敗しました。", type: "error" });
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({ text: "論文概要の生成でエラーが発生しました。", type: "error" });
    } finally {
      setNoveltySummaryRunning(false);
    }
  };

  const runNoveltyDeepResearchPrompt = async () => {
    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }

    setNoveltyPromptDone(false);
    setNoveltyPromptBroad("");
    setNoveltyPromptCritical("");
    setStatusMessage(null);
    addLog({ event: "info", message: "Generating Deep Research prompts (broad + critical)..." });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = ["novelty-deep-research-prompt", "--project", projectPath, "--prompt-kind", "both"];
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setNoveltyPromptDone(true);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const broadPath = `${projectPath.replace(/\\/g, "/")}/outputs/novelty/deep_research_prompt_broad.md`;
          const criticalPath = `${projectPath.replace(/\\/g, "/")}/outputs/novelty/deep_research_prompt_critical.md`;
          const broad = await invoke<string>("read_text_file", { path: broadPath });
          const critical = await invoke<string>("read_text_file", { path: criticalPath });
          setNoveltyPromptBroad(broad);
          setNoveltyPromptCritical(critical);
        } catch { /* File might not be readable immediately */ }
        setStatusMessage({ text: "Deep Researchプロンプトを生成しました（広範囲探索用 + 批判的検証用）。", type: "ok" });
      } else {
        setStatusMessage({ text: "Deep Researchプロンプトの生成に失敗しました。", type: "error" });
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({ text: "Deep Researchプロンプト生成でエラーが発生しました。", type: "error" });
    }
  };

  const saveDeepResearch = async (slot: "A" | "B", data: { source_name: string; executed_at: string; text: string; notes: string }) => {
    if (!projectPath.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const base = `${projectPath.replace(/\\/g, "/")}/outputs/novelty`;
      // Save individual text file
      const txtPath = slot === "A" ? `${base}/deep_research_a.txt` : `${base}/deep_research_b.txt`;
      await invoke("write_text_file", { path: txtPath, content: data.text });
      // Save/update meta JSON
      const metaPath = `${base}/deep_research_meta.json`;
      let meta: Record<string, unknown> = {};
      try {
        const existing = await invoke<string>("read_text_file", { path: metaPath });
        meta = JSON.parse(existing);
      } catch { /* file doesn't exist yet */ }
      meta[slot === "A" ? "a" : "b"] = {
        source_name: data.source_name,
        executed_at: data.executed_at,
        notes: data.notes,
        saved_at: new Date().toISOString(),
      };
      await invoke("write_text_file", { path: metaPath, content: JSON.stringify(meta, null, 2) });

      if (slot === "A") setNoveltyDrA(data); else setNoveltyDrB(data);
      setNoveltyDrSaved(true);
      setStatusMessage({ text: `Deep Research結果${slot}を保存しました。`, type: "ok" });
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({ text: "保存に失敗しました。", type: "error" });
    }
  };

  const runNoveltyAssess = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.proModel.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured (pro model required).` });
      return;
    }

    setNoveltyAssessRunning(true);
    setNoveltyAssessDone(false);
    setNoveltyAssessmentContent("");
    setStatusMessage(null);
    addLog({ event: "info", message: `Running novelty assess on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "novelty-assess",
        "--project", projectPath,
        "--slot", slotName,
      ], slot.proModel, "pro");
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setNoveltyAssessDone(true);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const path = `${projectPath.replace(/\\/g, "/")}/outputs/novelty/novelty_assessment.md`;
          const raw = await invoke<string>("read_text_file", { path });
          setNoveltyAssessmentContent(raw);
        } catch {
          // File might not be readable immediately
        }
        setStatusMessage({ text: "新規性評価が完了しました。", type: "ok" });
      } else {
        setStatusMessage({ text: "新規性評価に失敗しました。", type: "error" });
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({ text: "新規性評価でエラーが発生しました。", type: "error" });
    } finally {
      setNoveltyAssessRunning(false);
    }
  };

  const runNoveltyMerge = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.proModel.trim()) {
      addLog({ event: "error", message: `LLM slot ${slotName} is not configured (pro model required).` });
      return;
    }

    setNoveltyMergeRunning(true);
    setNoveltyMergeDone(false);
    setNoveltyMergeContent("");
    setNoveltyAssessDone(false);
    setNoveltyAssessmentContent("");
    setStatusMessage(null);
    addLog({ event: "info", message: `Running novelty merge on ${slotDisplayName(slotName)}...` });

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = buildLlmArgs(slot, [
        "novelty-merge-research",
        "--project", projectPath,
        "--slot", slotName,
      ], slot.proModel, "pro");
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      parseOutput(output.stdout);
      if (output.stderr) addLog({ event: "stderr", message: output.stderr });

      if (output.code === 0) {
        setNoveltyMergeDone(true);
        try {
          const { invoke } = await import("@tauri-apps/api/core");
          const path = `${projectPath.replace(/\\/g, "/")}/outputs/novelty/deep_research_merged.md`;
          const raw = await invoke<string>("read_text_file", { path });
          setNoveltyMergeContent(raw);
        } catch { /* File might not be readable immediately */ }
        setStatusMessage({ text: "Deep Research結果を統合しました。", type: "ok" });
      } else {
        setStatusMessage({ text: "Deep Research統合に失敗しました。", type: "error" });
      }
    } catch (e: unknown) {
      addLog({ event: "error", message: e instanceof Error ? e.message : String(e) });
      setStatusMessage({ text: "Deep Research統合でエラーが発生しました。", type: "error" });
    } finally {
      setNoveltyMergeRunning(false);
    }
  };

  // ── Review check handlers ──────────────────────────────────────────────────

  const runStructureCheck = async (slotName: string) => {
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return;

    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return;
    }
    const hasKey = slot.apiKeyMode === "direct" ? !!slot.apiKey.trim() : !!slot.apiKeyEnvName.trim();
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.proModel.trim() || !hasKey) {
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
      ], slot.proModel, "pro");
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
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.flashModel.trim() || !hasKey) {
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
      ], slot.flashModel, "flash");
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
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !slot.proModel.trim() || !hasKey) {
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
      ], slot.proModel, "pro");
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

  /** Common validation and arg-building for translation commands.
   *  Returns { slot, modelToUse } or null (already sets error messages). */
  const prepTranslateJa = (): {
    slot: typeof llmSlots[number]; modelToUse: string;
  } | null => {
    const slotName = "summary";
    const slot = llmSlots.find((s) => s.name === slotName);
    if (!slot) return null;

    if (!projectPath.trim()) {
      addLog({ event: "error", message: "Please create a project first." });
      return null;
    }

    const modelToUse = slot.proModel.trim();
    const hasKey = slot.apiKeyMode === "direct" ? !!slot.apiKey.trim() : !!slot.apiKeyEnvName.trim();
    if (!slot.provider.trim() || !slot.baseUrl.trim() || !modelToUse || !hasKey) {
      addLog({ event: "error", message: "統括AIのProモデルのAPI設定が不完全です。" });
      setStatusMessage({ text: "統括AIのProモデルを設定してください。", type: "error" });
      return null;
    }
    return { slot, modelToUse };
  };

  /** Internal: spawn CLI, buffer output, and handle completion/error/cancel. */
  const spawnTranslateJa = async (cliArgs: string[]) => {
    const prep = prepTranslateJa();
    if (!prep) return;
    const { slot, modelToUse } = prep;

    setTranslateJaRunning(true);
    setTranslateJaDone(false);
    setTranslateJaProgress(null);
    setStatusMessage(null);

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const fullArgs = buildLlmArgs(slot, cliArgs, modelToUse, "pro");
      const cmd = Command.create("pra-cli", fullArgs);

      // Collect stdout/stderr
      let stdout = "";
      let stderr = "";
      cmd.stdout.on("data", (line: string) => { stdout += line; });
      cmd.stderr.on("data", (line: string) => { stderr += line; });

      const child = await cmd.spawn();
      translateJaChildRef.current = child;

      // Wait for close
      const [code] = await new Promise<[number | null]>((resolve) => {
        cmd.on("close", (data: { code: number | null; signal: number | null }) => {
          resolve([data.code]);
        });
        cmd.on("error", () => {
          resolve([null]);
        });
      });

      translateJaChildRef.current = null;

      // Process buffered output
      parseOutput(stdout);
      if (stderr) addLog({ event: "stderr", message: stderr });

      if (code === 0) {
        setTranslateJaDone(true);
        setTranslationReloadKey((k) => k + 1);
        setStatusMessage({ text: "日本語訳が完了しました。", type: "ok" });
      } else if (code === null) {
        // Killed / cancelled
        addLog({ event: "info", message: "翻訳を中止しました。完了済みの翻訳は保存されています。" });
        setStatusMessage({ text: "翻訳を中止しました。", type: "info" });
      } else {
        setStatusMessage({ text: "日本語訳の作成に失敗しました。完了済みの翻訳は保存されています。", type: "error" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("abort") || msg.includes("cancel")) {
        // kill() called by user — already handled above
      } else if (msg.includes("shell scope") || msg.includes("not allowed")) {
        addLog({ event: "error", message: `Shell scope error: ${msg}` });
        setStatusMessage({
          text: "翻訳コマンドを実行できません。pra-cli がTauriの実行許可に含まれていない可能性があります。",
          type: "error",
        });
      } else {
        addLog({ event: "error", message: msg });
        setStatusMessage({ text: "日本語訳の作成でエラーが発生しました。", type: "error" });
      }
    } finally {
      setTranslateJaRunning(false);
      translateJaChildRef.current = null;
    }
  };

  /** Translate the currently selected section only. */
  const runTranslateOneSection = async (sectionName: string) => {
    addLog({ event: "info", message: `セクション「${sectionName}」の日本語訳を作成中...` });
    await spawnTranslateJa([
      "translate-sections-ja",
      "--project", projectPath,
      "--slot", "summary",
      "--section-id", sectionName,
    ]);
  };

  /** Translate all sections that have text. */
  const runTranslateSectionsJa = async () => {
    addLog({ event: "info", message: "全セクションの日本語訳を作成中..." });
    await spawnTranslateJa([
      "translate-sections-ja",
      "--project", projectPath,
      "--slot", "summary",
    ]);
  };

  /** Cancel a running translation. Already-completed sections are preserved. */
  const cancelTranslateJa = async () => {
    if (translateJaChildRef.current) {
      try {
        await translateJaChildRef.current.kill();
      } catch {
        // ignore kill errors
      }
      translateJaChildRef.current = null;
    }
  };

  /** Delete translation for a specific section via CLI. */
  const deleteSectionTranslation = async (sectionName: string) => {
    if (!projectPath.trim()) return;
    addLog({ event: "info", message: `セクション「${sectionName}」の翻訳を削除中...` });
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = [
        "delete-section-translation-ja",
        "--project", projectPath,
        "--section-id", sectionName,
      ];
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      if (output.code === 0) {
        setTranslationReloadKey((k) => k + 1);
        setStatusMessage({ text: `セクション「${sectionName}」の翻訳を削除しました。`, type: "ok" });
      } else {
        setStatusMessage({ text: "翻訳の削除に失敗しました。", type: "error" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      if (msg.includes("shell scope") || msg.includes("not allowed")) {
        setStatusMessage({
          text: "削除コマンドを実行できません。pra-cli がTauriの実行許可に含まれていない可能性があります。",
          type: "error",
        });
      } else {
        setStatusMessage({ text: "翻訳の削除でエラーが発生しました。", type: "error" });
      }
    }
  };

  /** Delete ALL section translations via CLI. */
  const deleteAllSectionTranslations = async () => {
    if (!projectPath.trim()) return;
    addLog({ event: "info", message: "全セクションの翻訳を削除中..." });
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = [
        "delete-all-section-translations-ja",
        "--project", projectPath,
      ];
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      if (output.code === 0) {
        setTranslationReloadKey((k) => k + 1);
        setStatusMessage({ text: "全セクションの翻訳を削除しました。", type: "ok" });
      } else {
        setStatusMessage({ text: "翻訳の削除に失敗しました。", type: "error" });
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      addLog({ event: "error", message: msg });
      if (msg.includes("shell scope") || msg.includes("not allowed")) {
        setStatusMessage({
          text: "削除コマンドを実行できません。pra-cli がTauriの実行許可に含まれていない可能性があります。",
          type: "error",
        });
      } else {
        setStatusMessage({ text: "翻訳の削除でエラーが発生しました。", type: "error" });
      }
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
    novelty: "novelty",
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
    noveltyAssessDone,
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
              journalSaved={journalSaved}
              journalLlmRunning={journalLlmRunning}
              journalLoading={journalLoading}
              journalLlmPreview={journalLlmPreview}
              llmSlots={llmSlots}
              onUpdateField={updateJournalField}
              onSave={saveJournal}
              onLoad={loadJournal}
              onLlmGenerate={runJournalLlm}
              onApplyJournalPreview={applyJournalPreview}
              onClearLlmPreview={clearLlmPreview}
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
              pubmedDone={pubmedDone}
              pubmedRunning={pubmedRunning}
              googleBooksDone={googleBooksDone}
              googleBooksGenerating={googleBooksGenerating}
              cniiDone={cniiDone}
              cniiRunning={cniiRunning}
              semanticScholarDone={semanticScholarDone}
              semanticScholarRunning={semanticScholarRunning}
              dbCascadeRunning={dbCascadeRunning}
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
              onPubmedDb={runPubmedDb}
              onGoogleBooksDb={runGoogleBooksDb}
              onSemanticScholarDb={runSemanticScholarDb}
              onCiniiDb={runCiniiDb}
              onDbCascade={runDbCascade}
              onViewerData={runViewerData}
              statusMessage={statusMessage}
            />
          )}

          {activeView === "sections" && (() => {
            const summarySlot = llmSlots.find(s => s.name === "summary");
            const summaryProConfigured = summarySlot
              ? !!(summarySlot.proModel.trim() && summarySlot.baseUrl.trim() &&
                (summarySlot.apiKeyMode === "direct" ? !!summarySlot.apiKey.trim() : !!summarySlot.apiKeyEnvName.trim()))
              : false;
            return (
              <SectionViewerPanel
                projectPath={projectPath}
                sectionsDone={sectionsDone}
                statusMessage={statusMessage}
                translateJaDone={translateJaDone}
                translateJaRunning={translateJaRunning}
                translateJaProgress={translateJaProgress}
                summaryProConfigured={summaryProConfigured}
                selectedSection={selectedSection}
                onSelectSection={setSelectedSection}
                onTranslateSection={runTranslateOneSection}
                onTranslateAll={runTranslateSectionsJa}
                onCancelTranslate={cancelTranslateJa}
                onReloadTranslations={() => setTranslationReloadKey((k) => k + 1)}
                translationReloadKey={translationReloadKey}
                sectionViewerFontSize={sectionViewerFontSize}
                onFontSizeChange={setSectionViewerFontSize}
                onDeleteTranslation={deleteSectionTranslation}
                onDeleteAllTranslations={deleteAllSectionTranslations}
              />
            );
          })()}

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
              llmReferenceProcessRunning={llmReferenceProcessRunning}
              onLlmReferenceProcess={runLlmReferenceProcess}
              onUnmatchedExport={runUnmatchedExport}
              unmatchedExportGenerating={unmatchedExportGenerating}
              searchReferencesDone={searchReferencesDone}
              searchReferencesGenerating={searchReferencesGenerating}
              onSearchReferences={runSearchReferences}
              onOpenSearchLog={openSearchLog}
              cniiDone={cniiDone}
              cniiRunning={cniiRunning}
              cniiEnabled={!!ciniiAppid.trim()}
              onCiniiDb={runCiniiDb}
              semanticScholarDone={semanticScholarDone}
              semanticScholarRunning={semanticScholarRunning}
              semanticScholarEnabled={semanticScholarEnabled}
              onSemanticScholarDb={runSemanticScholarDb}
              statusMessage={statusMessage}
            />
          )}

          {activeView === "novelty" && (
            <NoveltyCheckPanel
              projectPath={projectPath}
              sectionsDone={sectionsDone}
              viewerDataReady={viewerDataReady}
              llmSlots={llmSlots}
              journalProfile={journalProfile}
              journalLoaded={journalLoaded}
              noveltySummaryDone={noveltySummaryDone}
              noveltySummaryRunning={noveltySummaryRunning}
              noveltySummaryContent={noveltySummaryContent}
              onNoveltySummarize={runNoveltySummarize}
              noveltyPromptBroad={noveltyPromptBroad}
              noveltyPromptCritical={noveltyPromptCritical}
              noveltyPromptDone={noveltyPromptDone}
              onNoveltyDeepResearchPrompt={runNoveltyDeepResearchPrompt}
              noveltyDrA={noveltyDrA}
              noveltyDrB={noveltyDrB}
              noveltyDrSaved={noveltyDrSaved}
              onSaveDeepResearch={saveDeepResearch}
              noveltyMergeDone={noveltyMergeDone}
              noveltyMergeRunning={noveltyMergeRunning}
              noveltyMergeContent={noveltyMergeContent}
              onNoveltyMerge={runNoveltyMerge}
              noveltyAssessDone={noveltyAssessDone}
              noveltyAssessRunning={noveltyAssessRunning}
              noveltyAssessmentContent={noveltyAssessmentContent}
              onNoveltyAssess={runNoveltyAssess}
              onNavigateToSettings={() => setActiveView("settings")}
              statusMessage={statusMessage}
            />
          )}

          {activeView === "review" && (
            <ReviewChecksPanel
              projectPath={projectPath}
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
              llmProTestResults={llmProTestResults}
              llmFlashTestResults={llmFlashTestResults}
              llmEnvCheckResults={llmEnvCheckResults}
              llmProReasoningResults={llmProReasoningResults}
              llmTestErrorMessages={llmTestErrorMessages}
              windowsHelloAvailable={windowsHelloAvailable}
              windowsHelloStatus={windowsHelloStatus}
              windowsHelloDecrypted={windowsHelloDecrypted}
              onUpdateSlot={updateSlot}
              onTestSlot={testLlmSlot}
              onCheckLlmEnv={checkLlmEnv}
              onTestAll={testAllLlm}
              onLockSecrets={lockSecrets}
              onWindowsHelloSave={windowsHelloSaveKey}
              onWindowsHelloDecrypt={windowsHelloDecryptKey}
              onWindowsHelloDelete={windowsHelloDeleteKey}
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
              ciniiAppid={ciniiAppid}
              onCiniiAppidChange={setCiniiAppid}
              onSaveAppSettings={saveAppSettings}
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
