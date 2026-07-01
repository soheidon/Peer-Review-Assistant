import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from "react";
import { slotDisplayName } from "../slotLabels";
import { renderMarkdown, getRelativeParagraphInfo } from "../utils";
import type { SectionInfo } from "../utils";
import type { JournalProfile } from "./JournalPanel";

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  proModel?: string;
  reasoningMode?: "separate_models" | "same_model_with_thinking" | "none_or_unknown";
  apiKey: string;
  enabled?: boolean;
  apiKeyMode?: "direct" | "env_var";
  apiKeyEnvName?: string;
  apiKeyStorage?: "none" | "windows_hello";
}

interface CheckFinding {
  severity: string;
  category: string;
  location: {
    section?: string;
    paragraph_start?: number | null;
    paragraph_end?: number | null;
    text_excerpt?: string;
  };
  issue: string;
  suggested_comment: string;
  confidence: string;
  finding_id?: string;
  comment_id?: string;
}

interface CheckResult {
  check_name: string;
  source: string;
  status: string;
  generated_at: string;
  model: string;
  thinking_enabled?: boolean;
  reasoning_tokens?: number;
  summary: string;
  findings: CheckFinding[];
}

interface ReviewChecksPanelProps {
  projectPath: string;
  crossrefDone: boolean;
  windowsHelloStatus: Record<string, string>;
  llmSlots: LlmSlot[];
  structureCheckResults: Record<string, string>;
  expressionCheckResults: Record<string, string>;
  methodsStatsCheckResults: Record<string, string>;
  logicArgumentCheckResults: Record<string, string>;
  figureTableCheckResults: Record<string, string>;
  ethicsCheckResults: Record<string, string>;
  structureMergeDone: boolean;
  structureMergeRunning: boolean;
  expressionMergeDone: boolean;
  expressionMergeRunning: boolean;
  methodsStatsMergeDone: boolean;
  methodsStatsMergeRunning: boolean;
  logicArgumentMergeDone: boolean;
  logicArgumentMergeRunning: boolean;
  figureTableMergeDone: boolean;
  figureTableMergeRunning: boolean;
  ethicsMergeDone: boolean;
  ethicsMergeRunning: boolean;
  finalMergeDone: boolean;
  onStructureCheck: (slotName: string) => void;
  onExpressionCheck: (slotName: string) => void;
  onMethodsStatsCheck: (slotName: string) => void;
  onLogicArgumentCheck: (slotName: string) => void;
  onFigureTableCheck: (slotName: string) => void;
  onEthicsCheck: (slotName: string) => void;
  onBatchStructure: () => void;
  onBatchExpression: () => void;
  onBatchMethodsStats: () => void;
  onBatchLogicArgument: () => void;
  onBatchFigureTable: () => void;
  onBatchEthics: () => void;
  batchRunning: Record<string, boolean>;
  reevaluationRunning: Record<string, boolean>;
  onMergeStructure: () => void;
  onMergeExpression: () => void;
  onMergeMethodsStats: () => void;
  onMergeLogicArgument: () => void;
  onMergeFigureTable: () => void;
  onMergeEthics: () => void;
  onCancelCheck: (checkName: string, slotName: string) => void;
  onReEvaluate?: (checkName: string) => void;
  onTranslateExternalCheck?: (checkName: string) => void;
  onTranslateCardJa?: (checkName: string) => void;
  onNavigateToSettings: () => void;
  supplementalFiles: Array<{stored_path: string; filename: string; size_bytes: number}>;
  onAttachSupplemental: () => void;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
  onClearCheck: (checkName: string) => void;
  // Novelty review section
  noveltyAssessDone: boolean;
  journalProfile: JournalProfile | null;
  noveltyReviewJournalFitDone: boolean;
  noveltyReviewJournalFitRunning: boolean;
  noveltyReviewJournalFitContent: string;
  noveltyReviewUniversalDone: boolean;
  noveltyReviewUniversalRunning: boolean;
  noveltyReviewUniversalContent: string;
  onNoveltyReviewJournalFit: (slotName: string) => void;
  onNoveltyReviewUniversal: (slotName: string) => void;
  noveltyReviewJaContent: Record<string, string>;
  noveltyReviewTranslationLoading: boolean;
  onTranslateNoveltyReview: (kind: "journal_fit" | "universal" | "journal_tier" | "achievement") => void;
  onBatchNovelty: () => void;
  noveltyReviewJournalFitModel: string;
  noveltyReviewJournalFitGeneratedAt: string;
  noveltyReviewUniversalModel: string;
  noveltyReviewUniversalGeneratedAt: string;
  noveltyReviewJournalTierDone: boolean;
  noveltyReviewJournalTierRunning: boolean;
  noveltyReviewJournalTierContent: string;
  noveltyReviewJournalTierModel: string;
  noveltyReviewJournalTierGeneratedAt: string;
  onNoveltyReviewJournalTier: (slotName: string) => void;
  // Novelty achievement evaluation
  noveltyAchievementDone: boolean;
  noveltyAchievementRunning: boolean;
  noveltyAchievementContent: string;
  onNoveltyAchievement: () => void;
  // Journal search (internal + external methods)
  journalFindDone: boolean;
  journalFindRunning: boolean;
  journalFindMergeDone: boolean;
  journalFindMergeRunning: boolean;
  journalFindMergedContent: string;
  journalSearchPromptDone: boolean;
  journalSearchPromptContent: string;
  journalSearchExternalResultA: string;
  setJournalSearchExternalResultA: (value: string) => void;
  journalSearchExternalResultB: string;
  setJournalSearchExternalResultB: (value: string) => void;
  onFindJournals: () => void;
  onGenerateJournalSearchPrompt: () => void;
  onParseJournalSearchResults: () => void;
  journalFindMergedContentJa: string;
  journalFindLang: "en" | "ja";
  setJournalFindLang: (lang: "en" | "ja") => void;
  journalFindTranslateRunning: boolean;
  onTranslateJournalSearch: () => void;
  // Solution suggestion
  solutionRunning: Record<string, Record<string, boolean>>;
  onSuggestSolution: (checkName: string, findingId: string, defaultPrompt: string, additionalPrompt: string, includeInOutput: boolean, systemPrompt?: string) => void;
  onMoveFinding: (sourceCheck: string, destCheck: string, findingId: string) => void;
}

export interface ReviewChecksPanelHandle {
  loadReevaluation: (checkName: string) => Promise<void>;
  loadExternalCheck: (checkName: string) => Promise<void>;
  loadSolutions: (checkName: string) => Promise<void>;
  loadMergedResult: (checkName: string) => Promise<void>;
}

const CHECK_LABELS: Record<string, string> = {
  novelty: "新規性",
  structure: "構成",
  expression: "表現",
  methods_stats: "方法・統計",
  logic_argument: "論理・主張",
  figure_table: "図表",
  ethics: "倫理・利益相反",
};

const MOVE_TARGET_CHECKS: Array<{ key: string; label: string }> = [
  { key: "structure", label: "構成" },
  { key: "expression", label: "表現" },
  { key: "methods_stats", label: "方法・統計" },
  { key: "logic_argument", label: "論理・主張" },
  { key: "figure_table", label: "図表" },
  { key: "ethics", label: "倫理・利益相反" },
];

const ReviewChecksPanel = forwardRef<ReviewChecksPanelHandle, ReviewChecksPanelProps>(function ReviewChecksPanel({
  projectPath,
  crossrefDone,
  windowsHelloStatus,
  llmSlots,
  structureCheckResults,
  expressionCheckResults,
  methodsStatsCheckResults,
  logicArgumentCheckResults,
  figureTableCheckResults,
  ethicsCheckResults,
  structureMergeDone,
  structureMergeRunning,
  expressionMergeDone,
  expressionMergeRunning,
  methodsStatsMergeDone,
  methodsStatsMergeRunning,
  logicArgumentMergeDone,
  logicArgumentMergeRunning,
  figureTableMergeDone,
  figureTableMergeRunning,
  ethicsMergeDone,
  ethicsMergeRunning,
  finalMergeDone,
  onStructureCheck,
  onExpressionCheck,
  onMethodsStatsCheck,
  onLogicArgumentCheck,
  onFigureTableCheck,
  onEthicsCheck,
  onBatchStructure,
  onBatchExpression,
  onBatchMethodsStats,
  onBatchLogicArgument,
  onBatchFigureTable,
  onBatchEthics,
  batchRunning,
  reevaluationRunning,
  onMergeStructure,
  onMergeExpression,
  onMergeMethodsStats,
  onMergeLogicArgument,
  onMergeFigureTable,
  onMergeEthics,
  onCancelCheck,
  onReEvaluate,
  onTranslateExternalCheck,
  onTranslateCardJa,
  onNavigateToSettings,
  supplementalFiles,
  onAttachSupplemental,
  statusMessage,
  onClearCheck,
  // Novelty review section
  noveltyAssessDone,
  journalProfile,
  noveltyReviewJournalFitDone,
  noveltyReviewJournalFitRunning,
  noveltyReviewJournalFitContent,
  noveltyReviewUniversalDone,
  noveltyReviewUniversalRunning,
  noveltyReviewUniversalContent,
  onNoveltyReviewJournalFit,
  onNoveltyReviewUniversal,
  noveltyReviewJaContent,
  noveltyReviewTranslationLoading,
  onTranslateNoveltyReview,
  onBatchNovelty,
  noveltyReviewJournalFitModel,
  noveltyReviewJournalFitGeneratedAt,
  noveltyReviewUniversalModel,
  noveltyReviewUniversalGeneratedAt,
  noveltyReviewJournalTierDone,
  noveltyReviewJournalTierRunning,
  noveltyReviewJournalTierContent,
  noveltyReviewJournalTierModel,
  noveltyReviewJournalTierGeneratedAt,
  onNoveltyReviewJournalTier,
  noveltyAchievementDone,
  noveltyAchievementRunning,
  noveltyAchievementContent,
  onNoveltyAchievement,
  // Journal search (internal + external methods)
  journalFindDone,
  journalFindRunning,
  journalFindMergeDone,
  journalFindMergeRunning,
  journalFindMergedContent,
  journalSearchPromptDone,
  journalSearchPromptContent,
  journalSearchExternalResultA,
  setJournalSearchExternalResultA,
  journalSearchExternalResultB,
  setJournalSearchExternalResultB,
  onFindJournals,
  onGenerateJournalSearchPrompt,
  onParseJournalSearchResults,
  journalFindMergedContentJa,
  journalFindLang,
  setJournalFindLang,
  journalFindTranslateRunning,
  onTranslateJournalSearch,
  solutionRunning,
  onSuggestSolution,
  onMoveFinding,
}, ref) {
  // Viewer font size toggle
  const [viewerFontSize, setViewerFontSize] = useState(13); // 11 | 13 | 15

  // Paragraph → line number mapping
  const [paragraphLineMap, setParagraphPageMap] = useState<Record<number, number>>({});
  // comment_id → line number mapping (fallback for excerpts without paragraph_start)
  const [commentLineMap, setCommentLineMap] = useState<Record<string, number>>({});
  // comment_id → match detail for verification
  const [findingMatches, setFindingMatches] = useState<Record<string, {line:number;method:string;paragraph?:number|null;excerpt?:string}>>({});
  // comment_ids that are LLM meta-comments (not direct manuscript quotes)
  const [metaCommentIds, setMetaCommentIds] = useState<Set<string>>(new Set());
  const [getLineNumbersRunning, setGetPageNumbersRunning] = useState(false);
  const [lineMapStats, setLineMapStats] = useState<{ mapped: number; total: number }>({ mapped: 0, total: 0 });
  const [lineNumberError, setLineNumberError] = useState<string | null>(null);
  const [runLog, setRunLog] = useState<string[]>([]);
  const [logExpanded, setLogExpanded] = useState(false);

  // Load paragraph_line_map.json on mount and when project changes
  useEffect(() => {
    if (!projectPath.trim()) return;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const raw = await invoke<string>("read_text_file", {
          path: `${projectPath.replace(/\\/g, "/")}/lines/paragraph_line_map.json`,
        });
        const data = JSON.parse(raw);
        if (data.mapping) {
          const map: Record<number, number> = {};
          for (const [k, v] of Object.entries(data.mapping)) {
            map[Number(k)] = v as number;
          }
          setParagraphPageMap(map);
        }
        if (data.comment_line_map) {
          const cmap: Record<string, number> = {};
          for (const [k, v] of Object.entries(data.comment_line_map)) {
            cmap[k] = v as number;
          }
          setCommentLineMap(cmap);
        }
        if (data.finding_matches) {
          setFindingMatches(data.finding_matches as Record<string, {line:number;method:string;paragraph?:number|null;excerpt?:string}>);
        }
        if (data.meta_comment_ids) {
          setMetaCommentIds(new Set(data.meta_comment_ids as string[]));
        }
        setLineMapStats({
          mapped: data.mapped_count ?? Object.keys(data.mapping || {}).length,
          total: data.paragraph_count ?? 0,
        });
      } catch { /* file not found yet */ }
    })();
  }, [projectPath]);

  // Section map for relative paragraph numbering
  const [sectionMap, setSectionMap] = useState<SectionInfo[]>([]);
  useEffect(() => {
    if (!projectPath.trim()) return;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const raw = await invoke<string>("read_text_file", {
          path: `${projectPath.replace(/\\/g, "/")}/sections/section_map.json`,
        });
        const data = JSON.parse(raw);
        if (data.sections && Array.isArray(data.sections)) {
          setSectionMap(data.sections as SectionInfo[]);
        }
      } catch { /* file not found yet */ }
    })();
  }, [projectPath]);

  // Run get-line-numbers backend command
  const runGetLineNumbers = async () => {
    const t0 = performance.now();
    const log = (msg: string) => {
      console.log(msg);
      setRunLog(prev => [...prev, msg].slice(-50)); // keep last 50 lines
    };
    log("━━━━ 行番号取得 開始 " + new Date().toLocaleTimeString() + " ━━━━");
    log("projectPath: " + (projectPath || "(空)"));
    setGetPageNumbersRunning(true);
    setLineNumberError(null);
    setRunLog([]);  // clear previous log
    setLogExpanded(true);  // auto-expand on new run

    try {
      log("Step1: @tauri-apps/plugin-shell インポート中...");
      const shellMod = await import("@tauri-apps/plugin-shell");
      log("Step1: インポート成功");

      log("Step2: Command.create pra-cli get-line-numbers");
      const cmd = shellMod.Command.create("pra-cli", ["get-line-numbers", "--project", projectPath]);
      log("Step2: コマンド作成完了");

      cmd.on("close", (data: unknown) => {
        log("close: " + JSON.stringify(data));
      });
      cmd.on("error", (data: unknown) => {
        log("ERROR: " + JSON.stringify(data));
      });
      cmd.stderr.on("data", (line: string) => {
        if (!line.includes("progress")) {
          log("stderr: " + line.trim());
        }
      });
      cmd.stdout.on("data", (line: string) => {
        log("stdout: " + line.trim());
      });

      log("Step3: cmd.execute() 開始...");
      const output = await cmd.execute();
      const elapsed = ((performance.now() - t0) / 1000).toFixed(2);
      log(`Step3: 完了 (${elapsed}s) code=${output.code} signal=${output.signal || "none"}`);

      // Log Python stdout (extract "log" event messages for readability)
      if (output.stdout) {
        const lines = output.stdout.split("\n").filter(Boolean);
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (ev.event === "log") {
              log("  Python: " + (ev.message || ""));
            } else if (ev.event === "error") {
              log("  Python ERROR: " + (ev.message || ev.code || ""));
            }
          } catch {
            // non-JSON line, show truncated
            if (line.length < 120) log("  stdout: " + line);
          }
        }
      }
      if (output.stderr) {
        const stderrLines = output.stderr.split("\n").filter(Boolean);
        for (const line of stderrLines.slice(0, 10)) {
          log("  stderr: " + line.trim().substring(0, 200));
        }
      }

      if (output.code === 0) {
        log("Step4: 結果ファイル読み込み中...");
        const { invoke } = await import("@tauri-apps/api/core");
        const raw = await invoke<string>("read_text_file", {
          path: `${projectPath.replace(/\\/g, "/")}/lines/paragraph_line_map.json`,
        });
        const data = JSON.parse(raw);
        if (data.mapping) {
          const map: Record<number, number> = {};
          for (const [k, v] of Object.entries(data.mapping)) {
            map[Number(k)] = v as number;
          }
          setParagraphPageMap(map);
        }
        if (data.comment_line_map) {
          const cmap: Record<string, number> = {};
          for (const [k, v] of Object.entries(data.comment_line_map)) {
            cmap[k] = v as number;
          }
          setCommentLineMap(cmap);
        }
        if (data.finding_matches) {
          setFindingMatches(data.finding_matches as Record<string, {line:number;method:string;paragraph?:number|null;excerpt?:string}>);
        }
        if (data.meta_comment_ids) {
          setMetaCommentIds(new Set(data.meta_comment_ids as string[]));
        }
        setLineMapStats({
          mapped: data.mapped_count ?? Object.keys(data.mapping || {}).length,
          total: data.paragraph_count ?? 0,
        });
        log(`★ 完了: ${data.mapped_count}/${data.paragraph_count} 段落マッピング`);
      } else {
        log(`★ 異常終了 code=${output.code}`);
        setLineNumberError(`終了コード: ${output.code}`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log("★ 例外: " + msg);
      setLineNumberError(msg.substring(0, 200));
    } finally {
      setGetPageNumbersRunning(false);
      log("━━━━ 行番号取得 終了 ━━━━");
    }
  };

  // 親の crossrefDone が false でも実際にファイルがあれば OK とする自己防衛チェック
  const [crossrefFileOk, setCrossrefFileOk] = useState(false);
  useEffect(() => {
    if (!projectPath.trim()) return;
    const check = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const path = `${projectPath.replace(/\\/g, "/")}/citations/db_verified_references.json`;
        await invoke<string>("read_text_file", { path });
        setCrossrefFileOk(true);
      } catch {
        setCrossrefFileOk(false);
      }
    };
    check();
  }, [projectPath]);
  const crossrefReallyDone = crossrefDone || crossrefFileOk;

  interface CheckTranslation {
    check_name: string;
    source: string;
    translated_at: string;
    model: string;
    summary_ja: string;
    findings_ja: { finding_id: string; issue_ja: string; suggested_comment_ja: string }[];
  }

  const [viewerCheck, setViewerCheck] = useState<string | null>(null);
  const [viewerSlot, setViewerSlot] = useState<string | null>(null);
  const [viewerData, setViewerData] = useState<CheckResult | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [translationData, setTranslationData] = useState<CheckTranslation | null>(null);
  const [translationLoading, setTranslationLoading] = useState(false);
  const [showDetail, setShowDetail] = useState<Record<string, boolean>>({});
  const [showPasteWindow, setShowPasteWindow] = useState(false);
  const [showPromptDetail, setShowPromptDetail] = useState(false);
  const [showInternalMethod, setShowInternalMethod] = useState(false);
  const [showIndividualNovelty, setShowIndividualNovelty] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  // Selection state for findings to include in final output: checkName -> Set<finding_id>
  const [findingSelections, setFindingSelections] = useState<Record<string, Set<string>>>({});

  // Novelty review state
  const [noveltyReviewTab, setNoveltyReviewTab] = useState<"journal_fit" | "universal" | "journal_tier" | "achievement">("journal_fit");

  // Ref callback: EN column
  const noveltyEnRefCallback = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const content = noveltyReviewTab === "journal_fit"
      ? noveltyReviewJournalFitContent
      : noveltyReviewTab === "universal"
      ? noveltyReviewUniversalContent
      : noveltyReviewTab === "journal_tier"
      ? noveltyReviewJournalTierContent
      : noveltyAchievementContent;
    if (content) {
      el.innerHTML = renderMarkdown(content);
    }
  }, [noveltyReviewTab, noveltyReviewJournalFitContent, noveltyReviewUniversalContent, noveltyReviewJournalTierContent, noveltyAchievementContent]);

  // Ref callback: JA column
  const noveltyJaRefCallback = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const content = noveltyReviewJaContent[noveltyReviewTab];
    if (content) {
      el.innerHTML = renderMarkdown(content);
    }
  }, [noveltyReviewTab, noveltyReviewJaContent]);

  // External check state
  const [externalCheckModal, setExternalCheckModal] = useState<string | null>(null); // checkName or null
  const [externalCheckInput, setExternalCheckInput] = useState("");
  const [externalCheckSaveError, setExternalCheckSaveError] = useState<string | null>(null);
  const [externalCheckData, setExternalCheckData] = useState<Record<string, {
    generated_at: string; verdicts: {comment_id:string; verdict:string; reasoning:string; reasoning_ja?: string}[];
  } | null>>({});
  const [copyFeedback, setCopyFeedback] = useState<Record<string, boolean>>({});
  const [reevaluationData, setReevaluationData] = useState<Record<string, {
    generated_at: string; model: string; slot: string; verdicts: {comment_id:string; verdict:string; reasoning:string; reasoning_ja?: string; author_comment?: string; author_comment_ja?: string}[];
  } | null>>({});
  const [solutionData, setSolutionData] = useState<Record<string, {
    solutions: Array<{
      finding_id: string;
      default_prompt: string;
      additional_prompt: string;
      include_in_output: boolean;
      solution: string;
      solution_ja: string;
      generated_at: string;
    }>;
  }>>({});
  const [solutionOptions, setSolutionOptions] = useState<Record<string, {
    show: boolean;
    additionalPrompt: string;
    includeInOutput: boolean;
  }>>({});
  const [solutionGlobalPrompt, setSolutionGlobalPrompt] = useState(
    "この論文のこの分析において、著者向け指摘文が指摘している問題に対し、どのような改善の方向性が考えられるか、建設的な選択肢を提示してください。例えば追加データの収集、分析手法の再検討、実験デザインの見直し、文章改訂などの観点から、考えられる対応策を挙げてください。分析手法に関しては、現行の方法がそもそも妥当かどうかという根本的な検討も含めてください。なお、ベイズ統計学への移行を提案することはなるべく避けてください。回答は「〜が考えられます」「〜してみるとよいかもしれません」「〜という方向性があります」のような婉曲的な表現を用い、決して断定調（〜すべきだ、〜しなさい）にならないようにしてください。これらはあくまで検討材料であり、最終的な判断は著者に委ねられます。"
  );
  const SOLUTION_SYSTEM_PROMPT = `You are an expert academic advisor helping authors improve their manuscript.
Your task is to suggest possible approaches to address a specific manuscript check finding.

CRITICAL — Tone and Framing:
- This is NOT a prescription or instruction. You are offering possible directions for the authors to consider.
- Use tentative, suggestive language: "might consider", "could explore", "one possible approach is".
- In Japanese, use: 「〜が考えられます」「〜してみるとよいかもしれません」「〜という方向性があります」.
- NEVER use imperative/command forms. NEVER say "do this" or "you should".
- The final decision always rests with the authors.

IMPORTANT — Statistical Method Suggestions:
- Do NOT suggest switching to Bayesian methods unless the manuscript already uses them.
- Prefer refinements to the existing analytical framework over paradigm shifts.
- When discussing analytical methods, also examine whether the current method is fundamentally appropriate for the research question, not just how to improve it.`;
  const [showGlobalPromptEditor, setShowGlobalPromptEditor] = useState(false);
  const [solutionPromptDraft, setSolutionPromptDraft] = useState("");
  const [moveDropdown, setMoveDropdown] = useState<Record<string, boolean>>({});
  // ── Section click helpers ──

  function isInteractive(el: HTMLElement): boolean {
    const tag = el.tagName.toLowerCase();
    if (tag === 'button' || tag === 'input' || tag === 'select' || tag === 'textarea' || tag === 'a') return true;
    if (el.closest('button, input, select, textarea, a, [role="button"]')) return true;
    return false;
  }

  const ALL_CHECK_KEYS = ['novelty', 'structure', 'expression', 'methods_stats', 'logic_argument', 'figure_table', 'ethics'] as const;

  const accordionOpen = (checkName: string) => {
    const next: Record<string, boolean> = {};
    for (const k of ALL_CHECK_KEYS) next[k] = false;
    next[checkName] = true;
    setShowDetail(next);
  };

  const handleSectionClick = (e: React.MouseEvent, checkName: string, mergeDone: boolean) => {
    if (isInteractive(e.target as HTMLElement)) return;
    const isOpen = showDetail[checkName] === true;
    if (!isOpen) {
      accordionOpen(checkName);
      if (checkName === "novelty") {
        setViewerCheck("novelty");
        setViewerData(null);
      } else if (mergeDone) {
        loadMergedResult(checkName);
      } else {
        // Cache cleared or not yet generated — switch viewer to this check
        setViewerCheck(checkName);
        setViewerSlot(null);
        setViewerData(null);
        setViewerError(null);
        setTranslationData(null);
      }
    } else {
      setShowDetail(prev => ({ ...prev, [checkName]: false }));
    }
  };

  const handleH2Click = (e: React.MouseEvent, checkName: string, mergeDone: boolean) => {
    e.stopPropagation();
    const isOpen = showDetail[checkName] === true;
    if (!isOpen) {
      accordionOpen(checkName);
      if (checkName === "novelty") {
        setViewerCheck("novelty");
        setViewerData(null);
      } else if (mergeDone) {
        loadMergedResult(checkName);
      } else {
        // Cache cleared or not yet generated — switch viewer to this check
        setViewerCheck(checkName);
        setViewerSlot(null);
        setViewerData(null);
        setViewerError(null);
        setTranslationData(null);
      }
    } else {
      setShowDetail(prev => ({ ...prev, [checkName]: false }));
    }
  };

  // Persist selection to disk when it changes
  const saveSelectionToDisk = async (checkName: string, sel: Set<string>) => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const outDir = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}`;
      await invoke("write_text_file", {
        path: `${outDir}/selection.json`,
        content: JSON.stringify({ selected_ids: [...sel] }, null, 2),
      });
    } catch { /* disk write failure is non-critical */ }
  };

  // ── External check ──

  const loadExternalCheck = async (checkName: string) => {
    if (!projectPath.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const p = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}/external_check.json`;
      const raw = await invoke<string>("read_text_file", { path: p });
      const parsed = JSON.parse(raw);
      setExternalCheckData(prev => ({ ...prev, [checkName]: parsed }));
    } catch {
      setExternalCheckData(prev => ({ ...prev, [checkName]: null }));
    }
  };

  const loadReevaluation = async (checkName: string) => {
    if (!projectPath.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const p = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}/reevaluation.json`;
      const raw = await invoke<string>("read_text_file", { path: p });
      const parsed = JSON.parse(raw);
      setReevaluationData(prev => ({ ...prev, [checkName]: parsed }));
    } catch {
      setReevaluationData(prev => ({ ...prev, [checkName]: null }));
    }
  };

  const loadSolutions = async (checkName: string) => {
    if (!projectPath.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const p = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}/solutions.json`;
      const raw = await invoke<string>("read_text_file", { path: p });
      const parsed = JSON.parse(raw);
      setSolutionData(prev => ({ ...prev, [checkName]: parsed }));
    } catch {
      // No solutions yet — that's OK
    }
  };

  const buildAndCopyExternalPrompt = async (checkName: string) => {
    if (!projectPath.trim()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      // Load merged result
      const mergedPath = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}/merged.section.json`;
      const raw = await invoke<string>("read_text_file", { path: mergedPath });
      const merged = JSON.parse(raw);
      const comments = merged.comments || [];

      // Try to load abstract
      let abstract = "";
      try {
        const absPath = `${projectPath.replace(/\\/g, "/")}/sections/abstract.txt`;
        abstract = await invoke<string>("read_text_file", { path: absPath });
      } catch { /* no abstract, that's OK */ }

      // Load novelty data for prior research context
      let noveltyContext = "";
      try {
        const base = `${projectPath.replace(/\\/g, "/")}/outputs/novelty`;
        const summaryRaw = await invoke<string>("read_text_file", { path: `${base}/novelty_summary.json` });
        const summary = JSON.parse(summaryRaw);

        const parts: string[] = [];
        parts.push("## Prior Research Context (from novelty assessment)\n");

        // Claimed contributions
        const claimed = summary.claimed_contributions || "";
        if (claimed.trim()) {
          parts.push(`The authors claim the following contributions: ${claimed}\n`);
        }

        // Try to load assessment.md for richer context
        try {
          const assessmentRaw = await invoke<string>("read_text_file", { path: `${base}/novelty_assessment.md` });

          const extractSection = (text: string, name: string): string | null => {
            const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const re = new RegExp(`##\\s+\\d+\\.\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+\\d+\\.|$)`, 'i');
            const m = text.match(re);
            return m ? m[1].trim() : null;
          };

          const overlap = extractSection(assessmentRaw, "Overlap with Existing Research");
          if (overlap) {
            parts.push("### Overlap with Existing Research\n" + overlap + "\n");
          }
          const diff = extractSection(assessmentRaw, "Clear Differentiation from Existing Research");
          if (diff) {
            parts.push("### Clear Differentiation from Existing Research\n" + diff + "\n");
          }
          const strong = extractSection(assessmentRaw, "Points That Can Be Strongly Claimed");
          if (strong) {
            parts.push("### Points That Can Be Strongly Claimed\n" + strong + "\n");
          }
          const cautious = extractSection(assessmentRaw, "Points to State Cautiously");
          if (cautious) {
            parts.push("### Points to State Cautiously\n" + cautious + "\n");
          }
        } catch {
          // Fallback: synthesize from novelty_summary.json
          const noveltyFields: string[] = [];
          for (const key of ["novelty_theme", "novelty_sample", "novelty_methods",
                              "novelty_statistics", "novelty_data_rarity",
                              "novelty_practical_significance"]) {
            const val = summary[key] || "";
            if (val && typeof val === "string" && !val.includes("No particular novelty") && val.trim()) {
              const label = key.replace("novelty_", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
              noveltyFields.push(`- **${label}**: ${val}`);
            }
          }
          if (noveltyFields.length > 0) {
            parts.push("### Novelty Assessment\n" + noveltyFields.join("\n") + "\n");
          }
        }

        // Manuscript summary for cross-reference
        const topic = summary.research_topic || "";
        const findings = summary.findings || "";
        if (topic || findings) {
          parts.push("### Manuscript Summary\n");
          if (topic) parts.push(`- **Topic**: ${topic}`);
          if (findings) parts.push(`- **Main findings**: ${findings}`);
          parts.push("");
        }

        // Guidance
        parts.push(
          "When judging whether a criticism is valid, consider the above prior research context. " +
          "If the manuscript's claims are consistent with established findings in the field, " +
          "a criticism labeling them as overstatement may not be valid. " +
          "Conversely, if the manuscript makes claims that go beyond what prior research supports, " +
          "flagging overstatement is appropriate.\n"
        );

        noveltyContext = parts.join("\n");
      } catch { /* no novelty data, that's OK — proceed without it */ }

      const checkLabel = checkName === "structure" ? "構成 (Structure)"
        : checkName === "expression" ? "表現 (Expression)"
        : checkName === "methods_stats" ? "方法・統計 (Methods & Statistics)"
        : checkName === "logic_argument" ? "論理・主張 (Logic & Argument)"
        : "図表 (Figures & Tables)";

      let prompt = `You are a pre-submission manuscript checker. Below is a list of findings from an automated manuscript check. For each finding, judge whether the criticism is valid.

## Check Type: ${checkLabel}
`;
      if (abstract.trim()) {
        prompt += `## Abstract
${abstract.trim()}

`;
      }

      // Inject prior research context before the findings
      if (noveltyContext) {
        prompt += noveltyContext + "\n\n";
      }

      prompt += `## Findings
`;
      for (const c of comments) {
        const loc = c.location || {};
        const section = loc.section || "unknown";
        const pStart = loc.paragraph_start != null ? loc.paragraph_start : "?";
        const pEnd = loc.paragraph_end != null ? loc.paragraph_end : "?";
        prompt += `### ${c.comment_id}
- Severity: ${c.severity || "minor"}
- Category: ${c.category || ""}
- Location: ${section}, paragraph ${pStart}–${pEnd}
- Issue: ${c.issue || ""}
- Suggested revision: ${c.suggested_author_comment || c.suggested_comment || ""}

`;
      }

      prompt += `## Instructions
For each finding, return a verdict in the following JSON format.
Return a single JSON object containing all verdicts.

\`\`\`json
{
  "verdicts": [
    {
      "comment_id": "${comments[0]?.comment_id || "check_001"}",
      "verdict": "agree",
      "reasoning": "Brief explanation in English"
    }
  ]
}
\`\`\`

Notes:
- verdict must be "agree" (the criticism is valid), "disagree" (the criticism is unnecessary), or "partial" (partially agree)
- reasoning should be a concise explanation in English
- Include a verdict for every finding listed above`;

      await navigator.clipboard.writeText(prompt);
      setCopyFeedback(prev => ({ ...prev, [checkName]: true }));
      setTimeout(() => setCopyFeedback(prev => ({ ...prev, [checkName]: false })), 2000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("Failed to build/copy external check prompt:", msg);
      // Fallback: try execCommand
      try {
        const ta = document.createElement("textarea");
        ta.value = "Failed to build prompt. Please open merged result and copy manually.";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch { /* ignore */ }
    }
  };

  const saveExternalCheck = async () => {
    const checkName = externalCheckModal;
    if (!checkName || !projectPath.trim() || !externalCheckInput.trim()) return;
    setExternalCheckSaveError(null);
    try {
      const parsed = JSON.parse(externalCheckInput);
      if (!parsed.verdicts || !Array.isArray(parsed.verdicts)) {
        setExternalCheckSaveError("JSONに 'verdicts' 配列が必要です。");
        return;
      }
      for (const v of parsed.verdicts) {
        if (!v.comment_id || !v.verdict || !["agree","disagree","partial"].includes(v.verdict)) {
          setExternalCheckSaveError(`不正なverdict: comment_idとverdict (agree/disagree/partial) が必要です。問題: ${JSON.stringify(v)}`);
          return;
        }
      }
      const output = {
        check_name: checkName,
        generated_at: new Date().toISOString(),
        verdicts: parsed.verdicts,
      };
      const { invoke } = await import("@tauri-apps/api/core");
      const outDir = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}`;
      await invoke("write_text_file", {
        path: `${outDir}/external_check.json`,
        content: JSON.stringify(output, null, 2),
      });
      setExternalCheckData(prev => ({ ...prev, [checkName]: output }));
      setExternalCheckModal(null);
      setExternalCheckInput("");
      setExternalCheckSaveError(null);
      // Trigger Japanese translation of external check reasoning
      onTranslateExternalCheck?.(checkName);
    } catch (e: unknown) {
      if (e instanceof SyntaxError) {
        setExternalCheckSaveError("JSONの形式が正しくありません。形式を確認してください。");
      } else {
        setExternalCheckSaveError(`保存エラー: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  };

  // Load external evaluation and reevaluation data
  useEffect(() => {
    if (!projectPath.trim()) return;
    for (const checkName of ["structure", "expression", "methods_stats", "logic_argument", "figure_table", "ethics"]) {
      loadExternalCheck(checkName);
      loadReevaluation(checkName);
      loadSolutions(checkName);
    }
  }, [projectPath]);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  function isReviewerConfigured(s: LlmSlot): boolean {
    if (s.enabled === false) return false;
    if (!s.provider?.trim()) return false;
    if (!s.baseUrl?.trim()) return false;
    // apiKeyMode === "direct" かつ windows_hello なら apiKey 空でも OK
    if (s.apiKeyMode === "direct") {
      if (s.apiKeyStorage === "windows_hello") return true;
      return !!s.apiKey?.trim();
    }
    // apiKeyMode === "env_var" なら apiKeyEnvName があれば OK
    if (s.apiKeyMode === "env_var") {
      return !!s.apiKeyEnvName?.trim();
    }
    // fallback: apiKeyMode 未設定なら apiKey 直接チェック
    return !!s.apiKey?.trim();
  }

  function getReviewerDisabledReason(s: LlmSlot): string | null {
    if (!s) return "チェックAIスロットが見つかりません。";
    if (s.enabled === false) return "チェックAIスロットが無効です。";
    if (!s.provider?.trim()) return "プロバイダが未設定です。";
    if (!s.baseUrl?.trim()) return "API URLが未設定です。";
    if (s.apiKeyMode === "direct") {
      if (s.apiKeyStorage === "windows_hello" && windowsHelloStatus[s.name] === "saved" && !s.apiKey?.trim()) {
        return "Windows Helloで復号してください（設定画面）。";
      }
      if (!s.apiKey?.trim()) {
        return "APIキーが未入力です。";
      }
    }
    if (s.apiKeyMode === "env_var" && !s.apiKeyEnvName?.trim()) {
      return "APIキー環境変数名が未設定です。";
    }
    return null;
  }

  const reviewers = llmSlots.filter((s) => s.name.startsWith("reviewer") && s.enabled !== false);
  const allReviewersConfigured = reviewers.length > 0 && reviewers.every(isReviewerConfigured);
  const anyReviewerDone = (results: Record<string, string>) =>
    reviewers.some((s) => results[s.name] === "done");

  const loadViewerResult = async (checkName: string, slotName: string) => {
    if (!projectPath.trim()) return;
    setViewerCheck(checkName);
    setViewerSlot(slotName);
    setViewerLoading(true);
    setViewerError(null);
    setViewerData(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const filePath = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}/${slotName}.raw.json`;
      const raw = await invoke<string>("read_text_file", { path: filePath });
      const parsed = JSON.parse(raw) as CheckResult;
      // Fallback: old raw.json files lack thinking_enabled and reasoning_tokens.
      // Infer thinking from the slot's reasoningMode or model name.
      if (parsed.thinking_enabled === undefined && (parsed.reasoning_tokens ?? 0) === 0) {
        const slot = llmSlots.find(s => s.name === slotName);
        if (slot?.reasoningMode === "same_model_with_thinking") {
          parsed.thinking_enabled = true;
        } else if (/deepseek.*pro/i.test(parsed.model || "")) {
          // DeepSeek pro models think implicitly (not via explicit toggle)
          parsed.thinking_enabled = true;
        }
      }
      setViewerData(parsed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setViewerError(msg.includes("not found") || msg.includes("No such file")
        ? "結果ファイルが見つかりません。先にチェックを実行してください。"
        : `読み込みエラー: ${msg}`);
    } finally {
      setViewerLoading(false);
    }
    // Also try loading existing translation
    loadTranslationFile(checkName, slotName);
  };

  const loadMergedResult = async (checkName: string) => {
    if (!projectPath.trim()) return;
    setViewerCheck(checkName);
    setViewerSlot("merged");
    setViewerLoading(true);
    setViewerError(null);
    setViewerData(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const filePath = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}/merged.section.json`;
      const raw = await invoke<string>("read_text_file", { path: filePath });
      const parsed = JSON.parse(raw);
      // Map merged format (comments) to CheckResult format (findings)
      const result: CheckResult = {
        check_name: parsed.check_name || checkName,
        source: "merged",
        status: parsed.status || "done",
        generated_at: parsed.generated_at || "",
        model: (parsed.sources || []).map((s: {model?: string}) => s.model).filter(Boolean).join(", "),
        summary: parsed.summary || "",
        findings: (parsed.comments || []).map((c: Record<string, unknown>) => ({
          severity: c.severity || "minor",
          category: c.category || "",
          location: c.location || {},
          issue: c.issue || "",
          suggested_comment: c.suggested_author_comment || c.suggested_comment || "",
          confidence: c.confidence || "medium",
          finding_id: c.comment_id || "",
        })),
      };
      setViewerData(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setViewerError(msg.includes("not found") || msg.includes("No such file")
        ? "統合結果ファイルが見つかりません。先に統合を実行してください。"
        : `読み込みエラー: ${msg}`);
    } finally {
      setViewerLoading(false);
    }
    // Also try loading existing translation and solutions
    loadTranslationFile(checkName, "merged");
    loadSolutions(checkName);
  };

  useImperativeHandle(ref, () => ({
    loadReevaluation,
    loadExternalCheck,
    loadSolutions,
    loadMergedResult,
  }), [loadReevaluation, loadExternalCheck, loadSolutions, loadMergedResult]);

  const loadTranslationFile = async (checkName: string, slotName: string) => {
    if (!projectPath.trim()) return;
    setTranslationData(null);
    setTranslationError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const path = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}/${slotName}.translation.json`;
      const raw = await invoke<string>("read_text_file", { path });
      const parsed = JSON.parse(raw) as CheckTranslation;
      setTranslationData(parsed);
    } catch {
      // No translation yet — that's OK
    }
  };

  const runTranslation = async () => {
    if (!projectPath.trim() || !viewerCheck || !viewerSlot) return;
    // Find a configured reviewer slot for translation
    const slot = reviewers.find((s) => isReviewerConfigured(s));
    if (!slot) {
      setTranslationError("翻訳に使用できるLLMスロットが設定されていません。");
      return;
    }
    setTranslationLoading(true);
    setTranslationError(null);
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args: string[] = [
        "translate-check-result",
        "--project", projectPath,
        "--check", viewerCheck,
        "--slot", viewerSlot,
        "--provider", sanitize(slot.provider),
        "--base-url", sanitize(slot.baseUrl),
        "--model", sanitize(slot.proModel || slot.model),
      ];
      if (slot.apiKeyMode === "direct" && slot.apiKey.trim()) {
        args.push("--api-key", slot.apiKey.trim());
      } else if (slot.apiKeyMode === "env_var" && slot.apiKeyEnvName?.trim()) {
        args.push("--api-key-env", slot.apiKeyEnvName.trim());
      }
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      if (output.stderr) {
        // parseOutput not available, just log
        console.error("translate-check-result stderr:", output.stderr);
      }
      if (output.code === 0) {
        await loadTranslationFile(viewerCheck, viewerSlot);
      } else {
        setTranslationError("翻訳に失敗しました。ログを確認してください。");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setTranslationError(`翻訳エラー: ${msg}`);
    } finally {
      setTranslationLoading(false);
    }
  };

  const sanitize = (s: string) => (s || "").replace(/["\n\r]/g, "");

  /** Render a check section with batch button + collapsible individual reviewer buttons + merge row. */
  const renderCheckSection = (
    checkName: string,
    label: string,
    results: Record<string, string>,
    onCheck: (slotName: string) => void,
    onBatch: () => void,
    mergeDone: boolean,
    mergeRunning: boolean,
    onMerge: () => void,
    onClearCheck: (checkName: string) => void,
    detailExtra?: React.ReactNode,
  ) => {
    const isBatchRunning = batchRunning[checkName] === true;
    const anyRunning = reviewers.some(s => results[s.name] === "running") || mergeRunning || isBatchRunning;
    const detailOpen = showDetail[checkName] === true;

    return (
      <div>
        {/* Main row: batch + result + status */}
        <div className="row" style={{ gap: 6 }}>
          <button
            onClick={onBatch}
            disabled={!crossrefReallyDone || isBatchRunning || !allReviewersConfigured || anyRunning}
          >
            {isBatchRunning ? "一括実行中..." : "一括実行"}
          </button>
          {isBatchRunning && (() => {
            const runningSlot = reviewers.find(s => results[s.name] === "running");
            return (
              <>
                <span className="status-chip running">実行中...</span>
                <button
                  onClick={() => onCancelCheck(checkName, runningSlot?.name || "")}
                  style={{ fontSize: "11px", height: "22px", padding: "1px 6px", color: "#c00" }}
                >
                  取消
                </button>
              </>
            );
          })()}
          {/* Status summary chip */}
          {(() => {
            const doneCount = reviewers.filter(s => results[s.name] === "done").length;
            const total = reviewers.length;
            if (total === 0) return null;
            if (doneCount === total) return <span className="status-chip ok">完了</span>;
            if (doneCount > 0) return <span className="status-chip running">一部未完了</span>;
            const anyFailed = reviewers.some(s => results[s.name] === "failed");
            if (anyFailed) return <span className="status-chip err">失敗</span>;
            return <span className="status-chip" style={{color:"#aaa",borderColor:"#ccc"}}>未完了</span>;
          })()}
          {/* Re-evaluation status (always visible, even when detail collapsed) */}
          {reevaluationRunning[checkName] && <span className="status-chip running">再評価中...</span>}
          {!reevaluationRunning[checkName] && reevaluationData[checkName] && (
            <span className="status-chip ok">再評価済</span>
          )}
        </div>
        {/* Collapsible detail: expands below the main row — click section or h2 to toggle */}
        {detailOpen && (
          <div style={{
            marginTop: 6, padding: "8px 10px",
            background: "#f9f9fb", borderRadius: 6,
            border: "1px solid #e8e8ec",
          }}>
            {/* Status summary inside detail */}
            <div style={{ marginBottom: 6, fontSize: "11px", color: "#888" }}>
              {(() => {
                const doneCount = reviewers.filter(s => results[s.name] === "done").length;
                const total = reviewers.length;
                if (total === 0) return "チェックAI未設定";
                return `チェックAI状況: ${doneCount}/${total} 完了`;
              })()}
              {mergeDone && " · 統合済"}
            </div>
            {reviewers.map((slot) => {
              const result = results[slot.name];
              const isRunning = result === "running";
              const isDone = result === "done";
              return (
                <div key={slot.name} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: "12px", minWidth: 64, color: "#555" }}>{slotDisplayName(slot.name)}</span>
                  <button
                    onClick={() => onCheck(slot.name)}
                    disabled={!crossrefReallyDone || isRunning || !allReviewersConfigured}
                    style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                  >
                    {isRunning ? "実行中..." : isDone ? "再実行" : "実行"}
                  </button>
                  {result && result !== "running" && (
                    <span className={`status-chip ${isDone ? "ok" : "err"}`}>
                      {isDone ? "完了" : "失敗"}
                    </span>
                  )}
                  {isRunning && (
                    <>
                      <span className="status-chip running">実行中...</span>
                      <button
                        onClick={() => onCancelCheck(checkName, slot.name)}
                        style={{ fontSize: "11px", height: "22px", padding: "1px 6px", color: "#c00" }}
                      >
                        取消
                      </button>
                    </>
                  )}
                  {isDone && (
                    <button
                      onClick={() => loadViewerResult(checkName, slot.name)}
                      style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                    >
                      結果
                    </button>
                  )}
                </div>
              );
            })}
            {/* Merge row */}
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4, paddingTop: 4, borderTop: "1px solid #e0e0e6" }}>
              <span style={{ fontSize: "12px", minWidth: 64, color: "#555" }}>統合</span>
              <button
                onClick={onMerge}
                disabled={mergeRunning || !anyReviewerDone(results)}
                style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
              >
                {mergeRunning ? "統合中..." : mergeDone ? "再実行" : "実行"}
              </button>
              {mergeDone && <span className="status-chip ok">統合済</span>}
              {mergeRunning && <span className="status-chip running">統合中...</span>}
            </div>
            {!mergeDone && !mergeRunning && !anyReviewerDone(results) && (
              <div className="disabled-reason">先にチェック結果を生成してください</div>
            )}

            {/* External check row */}
            {mergeDone && (
              <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #e0e0e6" }}>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{ fontSize: "12px", minWidth: 64, color: "#555" }}>外部評価</span>
                  <button
                    onClick={() => buildAndCopyExternalPrompt(checkName)}
                    disabled={!mergeDone}
                    style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                  >
                    {copyFeedback[checkName] ? "コピーしました!" : "プロンプトをコピー"}
                  </button>
                  <button
                    onClick={() => { setExternalCheckModal(checkName); setExternalCheckInput(""); setExternalCheckSaveError(null); }}
                    style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                  >
                    結果を入力
                  </button>
                </div>
                {externalCheckData[checkName] && (() => {
                  const vd = externalCheckData[checkName]!.verdicts;
                  const agree = vd.filter(v => v.verdict === "agree").length;
                  const disagree = vd.filter(v => v.verdict === "disagree").length;
                  const partial = vd.filter(v => v.verdict === "partial").length;
                  return (
                    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                      <span className="status-chip ok" style={{ fontSize: "10px", padding: "0 5px", lineHeight: "16px" }}>評価済</span>
                      <span style={{ fontSize: "11px", color: "#666" }}>
                        同意:{agree}, 否認:{disagree}{partial > 0 ? `, 部分:${partial}` : ""}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Re-evaluation row (always shown when external check exists) */}
            {mergeDone && externalCheckData[checkName] && (() => {
              const vd = externalCheckData[checkName]!.verdicts;
              const disputed = vd.filter(v => v.verdict === "disagree" || v.verdict === "partial");
              const isRunning = reevaluationRunning[checkName] === true;
              const reData = reevaluationData[checkName];
              return (
                <div style={{ marginTop: 4, paddingTop: 4, borderTop: "1px solid #e0e0e6" }}>
                  {disputed.length === 0 && (
                    <div style={{ fontSize: "11px", color: "#888", marginBottom: 4 }}>
                      ツールと外部評価が一致したため再評価を実行する必要はありません
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ fontSize: "12px", minWidth: 64, color: "#555" }}>再評価</span>
                    <button
                      onClick={() => onReEvaluate?.(checkName)}
                      disabled={isRunning || !onReEvaluate}
                      style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                    >
                      {isRunning ? "再評価中..." : "再評価を実行"}
                    </button>
                    {isRunning && <span className="status-chip running">実行中...</span>}
                  </div>
                  {reData && (() => {
                    const rv = reData.verdicts;
                    const toolOk = rv.filter(v => v.verdict === "tool_correct").length;
                    const extOk = rv.filter(v => v.verdict === "external_correct").length;
                    const part = rv.filter(v => v.verdict === "partial").length;
                    return (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 3 }}>
                        <span className="status-chip ok" style={{ fontSize: "10px", padding: "0 5px", lineHeight: "16px" }}>再評価済</span>
                        <span style={{ fontSize: "11px", color: "#666" }}>
                          ツール支持:{toolOk}, 外部支持:{extOk}{part > 0 ? `, 部分:${part}` : ""}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              );
            })()}
            {/* Clear cache — reset all results for this check */}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e0e0e6" }}>
              <button
                onClick={() => {
                  setExternalCheckData(prev => ({ ...prev, [checkName]: null }));
                  setReevaluationData(prev => ({ ...prev, [checkName]: null }));
                  setFindingSelections(prev => { const next = { ...prev }; delete next[checkName]; return next; });
                  // Reset viewer if currently showing this check
                  if (viewerCheck === checkName) {
                    setViewerData(null);
                    setViewerCheck(null);
                    setViewerSlot(null);
                    setViewerError(null);
                    setTranslationData(null);
                  }
                  onClearCheck(checkName);
                }}
                disabled={anyRunning}
                title="このチェックの全実行結果・統合結果・外部評価・再評価を削除し、再実行可能な状態に戻す"
                style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
              >
                {label}の結果をすべてクリア
              </button>
            </div>
            {detailExtra}
          </div>
        )}

        {/* Disabled reasons (shown when batch button is disabled) */}
        {!crossrefReallyDone && (
          <div className="disabled-reason">先に文献DB照合を完了してください</div>
        )}
        {crossrefReallyDone && !allReviewersConfigured && (() => {
          const bad = reviewers.find((s) => !isReviewerConfigured(s));
          const reason = bad ? getReviewerDisabledReason(bad) : "LLM設定が未完了です。";
          return (
            <div className="disabled-reason">
              {reason}
              <button
                onClick={onNavigateToSettings}
                style={{ fontSize: "11px", height: "22px", padding: "1px 8px", marginLeft: 6 }}
              >
                設定を開く
              </button>
            </div>
          );
        })()}
      </div>
    );
  };

  const severityBadge = (s: string) => {
    if (s === "major") return <span className="status-chip err">重大</span>;
    if (s === "minor") return <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      fontSize: "11px", fontWeight: 600, background: "#f0ad4e", color: "#fff"
    }}>軽微</span>;
    return <span className="status-chip">{s}</span>;
  };

  const confidenceBadge = (c: string) => {
    const color = c === "high" ? "#5cb85c" : c === "medium" ? "#f0ad4e" : "#999";
    return <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      fontSize: "10px", fontWeight: 600, background: color, color: "#fff"
    }}>{c === "high" ? "高" : c === "medium" ? "中" : "低"}</span>;
  };

  /** Render one finding card. When ja is provided, shows EN original followed by JA translation in the same card. */
  const renderFindingCard = (f: CheckFinding, i: number, ja: CheckTranslation | null, sourceLabel: string) => {
    const fiJa = ja?.findings_ja?.[i];
    const enIssue = f.issue;
    const jaIssue = fiJa?.issue_ja || "";
    const hasJa = !!jaIssue;
    const fid = f.finding_id || "";
    if (!enIssue && !jaIssue) return null;
    // Selection state for this finding
    const isSelected = viewerCheck ? (!findingSelections[viewerCheck] || findingSelections[viewerCheck].has(fid)) : true;
    const toggleSelection = () => {
      if (!viewerCheck) return;
      setFindingSelections(prev => {
        const current = new Set(prev[viewerCheck] || []);
        if (current.has(fid)) {
          current.delete(fid);
        } else {
          current.add(fid);
        }
        const next = { ...prev, [viewerCheck]: current };
        saveSelectionToDisk(viewerCheck, current);
        return next;
      });
    };
    // Pre-compute external/re-evaluation verdicts for this finding
    const ec = viewerCheck ? externalCheckData[viewerCheck] : null;
    const ev = ec?.verdicts?.find(v => v.comment_id === fid);
    const re = viewerCheck ? reevaluationData[viewerCheck] : null;
    const rv = re?.verdicts?.find(v => v.comment_id === fid);

    // Two-column cell style
    const enCol: React.CSSProperties = hasJa
      ? { flex: "1 1 50%", minWidth: 0, paddingRight: 6 }
      : { flex: "1 1 100%", minWidth: 0 };
    const jaCol: React.CSSProperties = { flex: "1 1 50%", minWidth: 0, paddingLeft: 6, borderLeft: "1px solid #e0dcc0" };

    return (
      <div key={fid || i} style={{
        border: isSelected ? "1px solid #4caf50" : "1px solid #e0e0e0",
        borderRadius: 6, padding: "10px 12px",
        marginTop: 8, background: isSelected ? "#fafffa" : "#fff",
        opacity: isSelected ? 1 : 0.55,
      }}>
        {/* Header: checkbox + #N + severity + confidence + category + move button */}
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={toggleSelection}
            style={{ margin: 0, cursor: "pointer", width: 15, height: 15 }}
            title={isSelected ? "最終出力から除外" : "最終出力に含める"}
          />
          <strong>#{i + 1}</strong>
          {severityBadge(f.severity)}
          {confidenceBadge(f.confidence)}
          <span style={{ fontSize: "11px", color: "#555" }}>{f.category}</span>
          {/* Move to another block button (merged view only) */}
          {viewerSlot === "merged" && viewerCheck && (
            <>
              {!moveDropdown[fid] ? (
                <button
                  onClick={() => setMoveDropdown(prev => ({ ...prev, [fid]: true }))}
                  style={{
                    fontSize: "10px", padding: "2px 7px",
                    background: "transparent", border: "1px solid #9c27b0",
                    borderRadius: 3, color: "#9c27b0", cursor: "pointer",
                    fontWeight: 500, marginLeft: "auto",
                  }}
                >
                  ➡ 別のブロックに移動...
                </button>
              ) : (
                <button
                  onClick={() => setMoveDropdown(prev => ({ ...prev, [fid]: false }))}
                  style={{
                    fontSize: "10px", padding: "2px 8px",
                    background: "#9c27b0", border: "none",
                    borderRadius: 3, color: "#fff", cursor: "pointer",
                    fontWeight: 500, marginLeft: "auto",
                  }}
                >
                  ✕ 閉じる
                </button>
              )}
            </>
          )}
        </div>

        {/* Move destination selector (appears below header when active) */}
        {viewerSlot === "merged" && viewerCheck && moveDropdown[fid] && (
          <div style={{
            border: "1px solid #9c27b0", borderRadius: 4,
            padding: "5px 8px", marginBottom: 6, background: "#fce4ec",
            display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap",
          }}>
            <span style={{ fontSize: "11px", fontWeight: 600, color: "#6a1b9a", whiteSpace: "nowrap" }}>
              ➡ 移動先:
            </span>
            {MOVE_TARGET_CHECKS.filter(tc => tc.key !== viewerCheck).map(tc => (
              <button
                key={tc.key}
                onClick={() => {
                  setMoveDropdown(prev => ({ ...prev, [fid]: false }));
                  onMoveFinding(viewerCheck!, tc.key, fid);
                }}
                style={{
                  fontSize: "11px", padding: "3px 10px",
                  background: "#9c27b0", border: "none",
                  borderRadius: 4, color: "#fff", cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {tc.label}
              </button>
            ))}
          </div>
        )}

        {/* Location + text excerpt */}
        {f.location && (
          <div style={{ fontSize: "11px", color: "#666", marginBottom: 8 }}>
            {f.location.section && <span>📍 {f.location.section}</span>}
            {(() => {
              const pStart = f.location.paragraph_start;
              const pEnd = f.location.paragraph_end;
              const cid = f.finding_id;
              // Prefer paragraph_start lookup, fall back to comment_id lookup
              const lineStart = (pStart != null && typeof pStart === "number" && paragraphLineMap[pStart] != null)
                ? paragraphLineMap[pStart]
                : (cid ? commentLineMap[cid] : undefined);
              const lineEnd = (pEnd != null && typeof pEnd === "number" && paragraphLineMap[pEnd] != null)
                ? paragraphLineMap[pEnd]
                : undefined;
              const matchDetail = cid ? findingMatches[cid] : undefined;
              if (pStart == null && lineStart == null) return null;

              // Section-relative paragraph number
              const relInfo = pStart != null ? getRelativeParagraphInfo(pStart, sectionMap) : null;
              const effectivePnum = pStart ?? matchDetail?.paragraph;
              const relInfoEff = effectivePnum != null && effectivePnum !== pStart
                ? getRelativeParagraphInfo(effectivePnum, sectionMap) : relInfo;
              const paraLabel = relInfo && !relInfo.isHeading && relInfo.relativeNumber > 0
                ? `Paragraph ${relInfo.relativeNumber}`
                : relInfoEff && !relInfoEff.isHeading && relInfoEff.relativeNumber > 0
                  ? `Paragraph ${relInfoEff.relativeNumber}`
                  : effectivePnum != null ? `P${effectivePnum}` : null;

              return (
                <span> {paraLabel || ""}
                  {lineStart != null && (
                    <span style={{ color: "#888" }}>
                      {" "}(行 {lineStart}{lineEnd && lineEnd !== lineStart ? `–${lineEnd}` : ""})
                      {matchDetail?.method && matchDetail.method !== "none" && (
                        <span style={{ fontSize: "9px", color: "#aaa", marginLeft: 3 }}>[{matchDetail.method}]</span>
                      )}
                    </span>
                  )}
                </span>
              );
            })()}
            {f.location.text_excerpt && (() => {
              const cid = f.finding_id || "";
              const isMeta = metaCommentIds.has(cid);
              return (
                <div style={{
                  marginTop: 2, padding: "4px 8px", background: isMeta ? "#fff" : "#f9f9f9",
                  borderLeft: `3px solid ${isMeta ? "#ddd" : "#ccc"}`, fontSize: "11px",
                  color: isMeta ? "#888" : "#444",
                  fontStyle: isMeta ? "normal" : "italic",
                  borderRadius: "0 3px 3px 0",
                }}>
                  {isMeta ? f.location.text_excerpt : `"${f.location.text_excerpt}"`}
                </div>
              );
            })()}
          </div>
        )}

        {/* ── ツールの指摘 ── */}
        <div style={{
          border: "1px solid #d0d0d8", borderRadius: 4,
          marginBottom: 6, overflow: "hidden",
        }}>
          <div style={{
            fontSize: "11px", fontWeight: 600, color: "#444",
            background: "#f0f0f4", padding: "3px 8px",
            borderBottom: "1px solid #d0d0d8",
          }}>
            ツールの指摘（{sourceLabel}）
          </div>
          <div style={{ display: "flex", padding: "6px 8px", gap: 0 }}>
            {/* EN column */}
            <div style={enCol}>
              {enIssue && (
                <div style={{ fontSize: viewerFontSize, lineHeight: 1.5 }}>
                  {enIssue}
                </div>
              )}
            </div>
            {/* JA column */}
            {hasJa && (
              <div style={jaCol}>
                {jaIssue && (
                  <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#5a3e00" }}>
                    {jaIssue}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── 外部評価 ── */}
        {ev && (
          <div style={{
            border: `1px solid ${ev.verdict === "agree" ? "#a5d6a7" : ev.verdict === "disagree" ? "#ef9a9a" : "#ffe082"}`,
            borderRadius: 4, marginBottom: 6, overflow: "hidden",
          }}>
            <div style={{
              fontSize: "11px", fontWeight: 600, color: "#fff",
              background: ev.verdict === "agree" ? "#4caf50" : ev.verdict === "disagree" ? "#e74c3c" : "#f0ad4e",
              padding: "3px 8px",
            }}>
              外部評価: {ev.verdict === "agree" ? "同意" : ev.verdict === "disagree" ? "否認" : "一部同意"}
            </div>
            <div style={{ display: "flex", padding: "6px 8px", gap: 0 }}>
              <div style={enCol}>
                {ev.reasoning && (
                  <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#444" }}>
                    {ev.reasoning}
                  </div>
                )}
              </div>
              {ev.reasoning_ja && (
                <div style={jaCol}>
                  <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#5a3e00" }}>
                    {ev.reasoning_ja}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── 著者向け指摘文（再評価結果を統合）── */}
        {(rv || enIssue) && (
          <div style={{
            border: "2px solid #1b5e20",
            borderRadius: 4, marginBottom: 6, overflow: "hidden",
          }}>
            <div style={{
              fontSize: "11px", fontWeight: 600, color: "#fff",
              background: "#1b5e20",
              padding: "3px 8px",
            }}>
              ✎ 著者向け指摘文
              {rv && (
                rv.verdict === "tool_correct" ? " — 再評価でツールの指摘を採用" :
                rv.verdict === "external_correct" ? " — 再評価で外部評価を採用（指摘取下げ）" :
                " — 再評価で一部支持"
              )}
            </div>
            {/* Author-facing comment text */}
            <div style={{ display: "flex", padding: "6px 8px", gap: 0 }}>
              <div style={enCol}>
                <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#333" }}>
                  {rv?.author_comment || enIssue}
                </div>
              </div>
              {(rv?.author_comment_ja || jaIssue) && (
                <div style={jaCol}>
                  <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#1a3a00" }}>
                    {rv?.author_comment_ja || jaIssue}
                  </div>
                </div>
              )}
            </div>
            {/* Re-evaluation reasoning: collapsed by default (internal reference) */}
            {rv?.reasoning && (
              <details style={{ borderTop: "1px solid #c8e6c9", padding: "4px 8px", fontSize: "11px" }}>
                <summary style={{ color: "#555", cursor: "pointer" }}>
                  再評価の判断理由（内部参考）
                </summary>
                <div style={{ display: "flex", marginTop: 4, gap: 0 }}>
                  <div style={enCol}>
                    <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#444" }}>{rv.reasoning}</div>
                  </div>
                  {rv.reasoning_ja && (
                    <div style={jaCol}>
                      <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#5a3e00" }}>{rv.reasoning_ja}</div>
                    </div>
                  )}
                </div>
              </details>
            )}
          </div>
        )}

        {/* ── 解決策提示 ── */}
        {(() => {
          const solData = viewerCheck ? solutionData[viewerCheck] : null;
          const existingSol = solData?.solutions?.find(s => s.finding_id === fid);
          const opts = solutionOptions[fid] || { show: false, additionalPrompt: "", includeInOutput: true };
          const isRunning = viewerCheck ? (solutionRunning[viewerCheck]?.[fid] || false) : false;

          const setOpts = (updates: Partial<typeof opts>) => {
            setSolutionOptions(prev => ({
              ...prev,
              [fid]: { ...(prev[fid] || opts), ...updates },
            }));
          };

          return (
            <div style={{ marginTop: 6 }}>
              {/* Button to toggle option area */}
              {!opts.show && !existingSol && (
                <button
                  onClick={() => setOpts({ show: true })}
                  style={{
                    fontSize: "12px", padding: "4px 12px",
                    background: "#fff3e0", border: "1px solid #ff9800",
                    borderRadius: 4, cursor: "pointer", color: "#e65100",
                    fontWeight: 500,
                  }}
                >
                  💡 解決策提示
                </button>
              )}

              {/* Already has solution — show result + expand button */}
              {existingSol && !opts.show && (
                <button
                  onClick={() => setOpts({ show: true })}
                  style={{
                    fontSize: "12px", padding: "4px 12px",
                    background: "#e3f2fd", border: "1px solid #42a5f5",
                    borderRadius: 4, cursor: "pointer", color: "#1565c0",
                    fontWeight: 500,
                  }}
                >
                  💡 解決策提示（生成済み）
                </button>
              )}

              {/* Expanded option area */}
              {opts.show && (
                <div style={{
                  border: existingSol ? "2px solid #42a5f5" : "1px solid #ff9800",
                  borderRadius: 4, overflow: "hidden",
                }}>
                  <div
                    onClick={() => setOpts({ show: false })}
                    style={{
                      fontSize: "11px", fontWeight: 600, color: "#fff",
                      background: existingSol ? "#42a5f5" : "#ff9800",
                      padding: "3px 8px", display: "flex", justifyContent: "space-between", alignItems: "center",
                      cursor: "pointer",
                    }}
                    title="クリックで閉じる"
                  >
                    <span>💡 解決策提示{existingSol ? "（生成済み）" : ""}</span>
                    <span style={{ fontSize: "11px", opacity: 0.7 }}>▲</span>
                  </div>

                  <div style={{ padding: "8px" }}>
                    {/* Show existing solution if available */}
                    {existingSol && (
                      <div style={{
                        border: "1px solid #bbdefb", borderRadius: 4,
                        marginBottom: 8, overflow: "hidden",
                      }}>
                        <div style={{
                          fontSize: "11px", fontWeight: 600, color: "#1565c0",
                          background: "#e3f2fd", padding: "3px 8px",
                          borderBottom: "1px solid #bbdefb",
                        }}>
                          生成された解決策
                          {existingSol.include_in_output && (
                            <span style={{ marginLeft: 8, fontSize: "10px", color: "#888" }}>
                              （最終出力に含める）
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", padding: "6px 8px", gap: 0 }}>
                          <div style={enCol}>
                            <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#333" }}>
                              {existingSol.solution}
                            </div>
                          </div>
                          {existingSol.solution_ja && (
                            <div style={jaCol}>
                              <div style={{ fontSize: viewerFontSize, lineHeight: 1.5, color: "#1a3a00" }}>
                                {existingSol.solution_ja}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Additional prompt input */}
                    <div style={{ marginBottom: 6 }}>
                      <label style={{ fontSize: "11px", fontWeight: 600, color: "#555", display: "block", marginBottom: 2 }}>
                        追加プロンプト（任意）
                      </label>
                      <textarea
                        value={opts.additionalPrompt}
                        onChange={e => setOpts({ additionalPrompt: e.target.value })}
                        rows={2}
                        placeholder="例：特に統計手法の改善に焦点を当ててください..."
                        style={{
                          width: "100%", fontSize: "11px", padding: "4px 6px",
                          border: "1px solid #ccc", borderRadius: 3, resize: "vertical",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>

                    <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                      <label style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: "#555" }}>
                        <input
                          type="checkbox"
                          checked={opts.includeInOutput}
                          onChange={e => setOpts({ includeInOutput: e.target.checked })}
                          style={{ margin: 0 }}
                        />
                        最終出力に含める
                      </label>

                      <button
                        onClick={() => {
                          if (!viewerCheck || isRunning) return;
                          onSuggestSolution(viewerCheck, fid, solutionGlobalPrompt, opts.additionalPrompt, opts.includeInOutput, SOLUTION_SYSTEM_PROMPT);
                        }}
                        disabled={isRunning}
                        style={{
                          fontSize: "12px", padding: "4px 16px",
                          background: isRunning ? "#ccc" : "#1b5e20",
                          border: "none", borderRadius: 4,
                          color: "#fff", cursor: isRunning ? "not-allowed" : "pointer",
                          fontWeight: 600,
                        }}
                      >
                        {isRunning ? "生成中..." : existingSol ? "再生成" : "実行"}
                      </button>
                    </div>

                    {/* Additional prompt hint */}
                    {opts.additionalPrompt && (
                      <div style={{ fontSize: "10px", color: "#999", marginTop: 2 }}>
                        追加プロンプト: {opts.additionalPrompt.slice(0, 80)}{opts.additionalPrompt.length > 80 ? "..." : ""}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

      </div>
    );
  };

  // ── Novelty review viewer (2 sub-tabs) ───────────────────────────

  const renderNoveltyViewer = () => {
    const activeContent = noveltyReviewTab === "journal_fit"
      ? { done: noveltyReviewJournalFitDone, running: noveltyReviewJournalFitRunning, content: noveltyReviewJournalFitContent, label: "ジャーナル適合評価", model: noveltyReviewJournalFitModel, generatedAt: noveltyReviewJournalFitGeneratedAt }
      : noveltyReviewTab === "universal"
      ? { done: noveltyReviewUniversalDone, running: noveltyReviewUniversalRunning, content: noveltyReviewUniversalContent, label: "テーマ新規性評価", model: noveltyReviewUniversalModel, generatedAt: noveltyReviewUniversalGeneratedAt }
      : noveltyReviewTab === "journal_tier"
      ? { done: noveltyReviewJournalTierDone, running: noveltyReviewJournalTierRunning, content: noveltyReviewJournalTierContent, label: "適正雑誌", model: noveltyReviewJournalTierModel, generatedAt: noveltyReviewJournalTierGeneratedAt }
      : { done: noveltyAchievementDone, running: noveltyAchievementRunning, content: noveltyAchievementContent, label: "新規性達成度", model: "", generatedAt: "" };

    return (
      <div style={{ flex: 1, minWidth: 0, padding: "8px 12px", borderLeft: "1px solid #ccc", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* ── Title line ── */}
        {activeContent.done && activeContent.content && (
          <div style={{ flexShrink: 0, display: "flex", gap: 8, alignItems: "center", marginBottom: 4, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>
              新規性{" — "}{activeContent.label}
            </h3>
            {activeContent.model && (
              <span style={{ fontSize: "11px", color: "#888" }}>{activeContent.model}</span>
            )}
            {activeContent.generatedAt && (
              <span style={{ fontSize: "11px", color: "#888" }}>
                {new Date(activeContent.generatedAt).toLocaleString("ja-JP")}
              </span>
            )}
          </div>
        )}
        {/* ── Header: font size + translation ── */}
        <div style={{ flexShrink: 0, display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
          <span style={{ flex: 1 }} />
          {/* Font size toggle */}
          <div style={{ display: "flex", gap: 2, border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
            {([11, 13, 15] as const).map(size => (
              <button key={size}
                onClick={() => setViewerFontSize(size)}
                style={{
                  fontSize: 11, height: 24, padding: "0 8px",
                  border: "none", borderRadius: 0,
                  background: viewerFontSize === size ? "#1b5e20" : "#f5f5f5",
                  color: viewerFontSize === size ? "#fff" : "#555",
                  cursor: "pointer", fontWeight: viewerFontSize === size ? 600 : 400,
                }}
              >
                {size === 11 ? "小" : size === 13 ? "中" : "大"}
              </button>
            ))}
          </div>
          {/* Translate button */}
          {activeContent.done && activeContent.content && (() => {
            const hasJa = !!noveltyReviewJaContent[noveltyReviewTab];
            return (
              <>
                {!hasJa && (
                  <button
                    onClick={() => onTranslateNoveltyReview(noveltyReviewTab)}
                    disabled={noveltyReviewTranslationLoading}
                    style={{ fontSize: "12px", height: "26px", padding: "2px 12px" }}
                  >
                    {noveltyReviewTranslationLoading ? "翻訳中..." : "翻訳する"}
                  </button>
                )}
                {hasJa && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="status-chip ok" style={{ fontSize: "10px" }}>翻訳済</span>
                    <button
                      onClick={() => onTranslateNoveltyReview(noveltyReviewTab)}
                      disabled={noveltyReviewTranslationLoading}
                      style={{ fontSize: "11px", height: "24px", padding: "1px 8px" }}
                    >
                      {noveltyReviewTranslationLoading ? "翻訳中..." : "再翻訳"}
                    </button>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* ── Sub-tab bar ── */}
        <div style={{ flexShrink: 0, display: "flex", gap: 0, marginBottom: 8, borderBottom: "2px solid #1b5e20" }}>
          {(["journal_fit", "universal", "journal_tier", "achievement"] as const).map(tab => {
            const label = tab === "journal_fit" ? "ジャーナル適合評価" : tab === "universal" ? "テーマ新規性評価" : tab === "journal_tier" ? "適正雑誌" : "新規性達成度";
            const active = noveltyReviewTab === tab;
            return (
              <button key={tab}
                onClick={() => setNoveltyReviewTab(tab)}
                style={{
                  fontSize: 12, padding: "6px 14px", border: "none",
                  borderRadius: "4px 4px 0 0",
                  background: active ? "#1b5e20" : "#e8e8e8",
                  color: active ? "#fff" : "#555",
                  cursor: "pointer", fontWeight: active ? 600 : 400,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        {/* ── Content area ── */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", fontSize: viewerFontSize }}>
          {!noveltyAssessDone && (
            <div style={{ color: "#aaa", padding: 40, textAlign: "center", fontSize: 13 }}>
              先に「新規性チェック」メニューから新規性評価（Phase 5）を実行してください。
            </div>
          )}
          {noveltyAssessDone && activeContent.running && (
            <div style={{ color: "#888", padding: 20, textAlign: "center" }}>生成中...</div>
          )}
          {noveltyAssessDone && !activeContent.running && !activeContent.done && (
            <div style={{ color: "#aaa", padding: 40, textAlign: "center", fontSize: 13 }}>
              「生成する」をクリックして{activeContent.label}を実行してください。
            </div>
          )}
          {noveltyAssessDone && activeContent.done && activeContent.content && (() => {
            const hasJa = !!noveltyReviewJaContent[noveltyReviewTab];
            return (
              <>
                {/* Journal find table — full width, above EN/JA columns */}
                {noveltyReviewTab === "journal_tier" && journalFindMergeDone && journalFindMergedContent && (
                  <div style={{
                    marginBottom: 8, border: "2px solid #2e7d32", borderRadius: 6,
                    background: "#f1f8e9", overflow: "hidden",
                  }}>
                    <div style={{
                      background: "#2e7d32", color: "#fff", padding: "6px 12px",
                      fontSize: 13, fontWeight: 600,
                      display: "flex", alignItems: "center", justifyContent: "space-between",
                    }}>
                      <span>🏆 適切なジャーナル候補</span>
                      {journalFindMergedContentJa && (
                        <div style={{
                          display: "flex", gap: 0, border: "1px solid rgba(255,255,255,0.4)",
                          borderRadius: 4, overflow: "hidden", fontSize: 11,
                        }}>
                          <button
                            onClick={() => setJournalFindLang("en")}
                            style={{
                              padding: "2px 10px", border: "none", cursor: "pointer",
                              background: journalFindLang === "en" ? "rgba(255,255,255,0.25)" : "transparent",
                              color: "#fff", fontWeight: journalFindLang === "en" ? 600 : 400,
                              fontSize: 11, lineHeight: 1.4,
                            }}
                          >
                            EN
                          </button>
                          <button
                            onClick={() => setJournalFindLang("ja")}
                            style={{
                              padding: "2px 10px", border: "none", cursor: "pointer",
                              background: journalFindLang === "ja" ? "rgba(255,255,255,0.25)" : "transparent",
                              color: "#fff", fontWeight: journalFindLang === "ja" ? 600 : 400,
                              fontSize: 11, lineHeight: 1.4,
                            }}
                          >
                            JP
                          </button>
                        </div>
                      )}
                      {!journalFindMergedContentJa && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onTranslateJournalSearch(); }}
                          disabled={journalFindTranslateRunning}
                          style={{
                            fontSize: 10, padding: "2px 10px", height: 22,
                            background: "rgba(255,255,255,0.15)", color: "#fff",
                            border: "1px solid rgba(255,255,255,0.3)", borderRadius: 3,
                            cursor: "pointer",
                          }}
                        >
                          {journalFindTranslateRunning ? "翻訳中..." : "Reasonを日本語訳"}
                        </button>
                      )}
                    </div>
                    <div style={{ padding: "8px 12px" }}>
                      <div
                        className="novelty-md"
                        dangerouslySetInnerHTML={{ __html: renderMarkdown(
                          journalFindLang === "ja" && journalFindMergedContentJa
                            ? journalFindMergedContentJa
                            : journalFindMergedContent
                        ) }}
                        style={{ fontSize: 12 }}
                      />
                    </div>
                  </div>
                )}
                {/* EN / JA columns */}
                <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
                  <div style={hasJa ? { flex: 1, minWidth: 0, overflowY: "auto" } : { flex: 1, minWidth: 0, overflowY: "auto" }}>
                    {hasJa && <div style={{ fontSize: "10px", color: "#888", marginBottom: 4 }}>EN</div>}
                    <div
                      ref={noveltyEnRefCallback}
                      className="novelty-md"
                      style={{
                        padding: 12, background: "#f8f8f8", border: "1px solid #e0e0e0",
                        borderRadius: 4, lineHeight: 1.6,
                      }}
                    />
                  </div>
                  {hasJa && (
                    <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
                      <div style={{ fontSize: "10px", color: "#888", marginBottom: 4 }}>日本語</div>
                      <div
                        ref={noveltyJaRefCallback}
                        className="novelty-md"
                        style={{
                          padding: 12, background: "#fef9e7", border: "1px solid #e0e0e0",
                          borderRadius: 4, lineHeight: 1.6,
                        }}
                      />
                    </div>
                  )}
                </div>
              </>
            );
          })()}
          {noveltyAssessDone && activeContent.done && !activeContent.content && (
            <div style={{ color: "#c00", padding: 20, textAlign: "center", fontSize: 13 }}>
              生成に失敗しました。再度お試しください。
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Standard viewer ──────────────────────────────────────────────

  const renderViewer = () => {
    // Novelty section uses its own viewer
    if (viewerCheck === "novelty") return renderNoveltyViewer();

    const hasTranslation = !!translationData;
    const colStyle: React.CSSProperties = hasTranslation
      ? { flex: 1, minWidth: 0, overflowY: "auto", padding: "0 8px" }
      : { flex: 1, minWidth: 0, overflowY: "auto", padding: "0 8px" };

    return (
      <div style={{ flex: 1, minWidth: 0, padding: "8px 12px", borderLeft: "1px solid #ccc", overflowY: "auto", fontSize: viewerFontSize }}>
        {viewerLoading && <div style={{ color: "#888", padding: 20 }}>読み込み中...</div>}
        {viewerError && <div className="status-banner err" style={{ margin: 8 }}>{viewerError}</div>}
        {translationError && <div className="status-banner err" style={{ margin: 8 }}>{translationError}</div>}
        {viewerData && (
          <div>
            {/* Header with translate button + font size toggle */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>
                {CHECK_LABELS[viewerData.check_name] || viewerData.check_name}
                {" — "}{viewerData.source === "merged" ? "統合結果" : slotDisplayName(viewerData.source)}
              </h3>
              <span style={{ fontSize: "11px", color: "#888" }}>
                {viewerData.model}{(viewerData.thinking_enabled || (viewerData.reasoning_tokens ?? 0) > 0) ? "+thinking" : ""}
              </span>
              <span style={{ fontSize: "11px", color: "#888" }}>
                {new Date(viewerData.generated_at).toLocaleString("ja-JP")}
              </span>
              <div style={{ flex: 1 }} />
              {/* Page number extraction */}
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                border: "1px solid #bbb", borderRadius: 4,
                padding: "3px 8px", flexWrap: "wrap",
              }}>
                {(() => {
                  const findings = viewerData?.findings;
                  if (!findings || !Array.isArray(findings) || findings.length === 0) return null;
                  let cardsWithLineNumber = 0;
                  for (const f of findings) {
                    const ps = f?.location?.paragraph_start;
                    const cid = f?.comment_id || f?.finding_id;
                    if ((ps != null && typeof ps === "number" && paragraphLineMap[ps] != null) ||
                        (cid && commentLineMap[cid] != null)) {
                      cardsWithLineNumber++;
                    }
                  }
                  return (
                    <span style={{ fontSize: "11px", color: "#666", whiteSpace: "nowrap" }}>
                      {cardsWithLineNumber}/{findings.length} 取得
                    </span>
                  );
                })()}
                <button
                  type="button"
                  onClick={() => runGetLineNumbers()}
                  disabled={getLineNumbersRunning}
                  style={{
                    fontSize: "11px", height: "24px", padding: "0 10px",
                    border: "1px solid #ccc", borderRadius: 4,
                    background: "#f5f5f5", cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  {getLineNumbersRunning ? "取得中..." : "行番号取得"}
                </button>
                {lineNumberError && (
                  <span style={{ fontSize: "10px", color: "#c62828", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={lineNumberError}>
                    ⚠ {lineNumberError}
                  </span>
                )}
                {/* Run log toggle — inline */}
                {runLog.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setLogExpanded(!logExpanded)}
                    style={{
                      fontSize: "10px", height: "20px", padding: "0 8px",
                      border: "1px solid #ddd", borderRadius: 3,
                      background: "#f0f0f0", cursor: "pointer",
                      fontFamily: "monospace", color: "#555",
                    }}
                  >
                    {logExpanded ? "▼" : "▶"} 処理ログ ({runLog.length}行)
                  </button>
                )}
              </div>
              {/* Font size toggle */}
              <div style={{ display: "flex", gap: 2, border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
                {([11, 13, 15] as const).map(size => (
                  <button
                    key={size}
                    onClick={() => setViewerFontSize(size)}
                    style={{
                      fontSize: 11, height: 24, padding: "0 8px",
                      border: "none", borderRadius: 0,
                      background: viewerFontSize === size ? "#1b5e20" : "#f5f5f5",
                      color: viewerFontSize === size ? "#fff" : "#555",
                      cursor: "pointer", fontWeight: viewerFontSize === size ? 600 : 400,
                    }}
                  >
                    {size === 11 ? "小" : size === 13 ? "中" : "大"}
                  </button>
                ))}
              </div>
              {!hasTranslation && (
                <button
                  onClick={runTranslation}
                  disabled={translationLoading}
                  style={{ fontSize: "12px", height: "26px", padding: "2px 12px" }}
                >
                  {translationLoading ? "翻訳中..." : "翻訳する"}
                </button>
              )}
              {hasTranslation && (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className="status-chip ok" style={{ fontSize: "10px" }}>翻訳済</span>
                  <button
                    onClick={runTranslation}
                    disabled={translationLoading}
                    style={{ fontSize: "11px", height: "24px", padding: "1px 8px" }}
                  >
                    {translationLoading ? "翻訳中..." : "再翻訳"}
                  </button>
                </div>
              )}
              {/* Translate external/re-evaluation reasoning if untranslated */}
              {viewerCheck && (() => {
                const ec = externalCheckData[viewerCheck];
                const re = reevaluationData[viewerCheck];
                const ecMissing = ec?.verdicts?.some(v => v.reasoning && !v.reasoning_ja);
                const reMissing = re?.verdicts?.some(v => v.reasoning && !v.reasoning_ja);
                if (!ecMissing && !reMissing) return null;
                return (
                  <button
                    onClick={() => onTranslateCardJa?.(viewerCheck)}
                    disabled={translationLoading}
                    style={{ fontSize: "11px", height: "24px", padding: "1px 8px" }}
                  >
                    {translationLoading ? "翻訳中..." : "未翻訳部分を翻訳"}
                  </button>
                );
              })()}
            </div>

            {/* Run log expanded content — full width below header */}
            {runLog.length > 0 && logExpanded && (
              <div style={{
                marginBottom: 8, padding: "6px 10px",
                background: "#1e1e1e", color: "#0f0",
                fontFamily: "monospace", fontSize: "10px",
                borderRadius: 4, maxHeight: 200, overflowY: "auto",
                lineHeight: 1.4, whiteSpace: "pre-wrap", wordBreak: "break-all",
              }}>
                {runLog.join("\n")}
              </div>
            )}

            {/* Summary row — EN then JA in the same card */}
            <div style={{ marginBottom: 12 }}>
              <div style={{
                background: "#f5f5f5", padding: "10px 14px", borderRadius: 6,
                fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap", marginBottom: hasTranslation ? 6 : 0
              }}>
                <div style={{ fontSize: "10px", color: "#888", marginBottom: 4 }}>EN</div>
                {viewerData.summary}
              </div>
              {hasTranslation && (
                <div style={{
                  background: "#fef9e7", padding: "10px 14px", borderRadius: 6,
                  fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap"
                }}>
                  <div style={{ fontSize: "10px", color: "#888", marginBottom: 4 }}>日本語</div>
                  {translationData.summary_ja || "(翻訳なし)"}
                </div>
              )}
            </div>

            {/* Findings — all in single column, EN+JA combined per card */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: "12px" }}>指摘事項 ({viewerData.findings.length}件)</strong>
              {viewerData.findings.length > 0 && (() => {
                const sel = viewerCheck ? findingSelections[viewerCheck] : null;
                const selectedCount = sel ? sel.size : viewerData.findings.length;
                const allSelected = !sel || sel.size === viewerData.findings.length;
                const toggleAll = () => {
                  if (!viewerCheck) return;
                  if (allSelected) {
                    // Deselect all
                    const newSel = new Set<string>();
                    setFindingSelections(prev => ({ ...prev, [viewerCheck]: newSel }));
                    saveSelectionToDisk(viewerCheck, newSel);
                  } else {
                    // Select all
                    const newSel = new Set(viewerData.findings.map(f => f.finding_id || "").filter(Boolean));
                    setFindingSelections(prev => ({ ...prev, [viewerCheck]: newSel }));
                    saveSelectionToDisk(viewerCheck, newSel);
                  }
                };
                return (
                  <>
                    <span style={{ fontSize: "11px", color: "#888" }}>（選択中: {selectedCount}件）</span>
                    <button
                      onClick={toggleAll}
                      style={{ fontSize: "11px", height: "20px", padding: "0 6px" }}
                    >
                      {allSelected ? "すべて解除" : "すべて選択"}
                    </button>
                  </>
                );
              })()}
            </div>
            {viewerData.findings.length === 0 && (
              <div style={{ color: "#888", padding: "12px 0" }}>指摘事項はありません。</div>
            )}
            {viewerData.findings.map((f, i) => renderFindingCard(f, i, translationData,
              viewerData.source === "merged" ? "統合結果" : slotDisplayName(viewerData.source)
            ))}
          </div>
        )}
        {!viewerLoading && !viewerError && !viewerData && (
          <div style={{ color: "#aaa", padding: 20, textAlign: "center" }}>
            チェック完了後にブロックをクリックして結果を表示してください
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 100px)", overflow: "hidden" }}>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
        {/* Left: controls */}
        <div style={{ flex: "0 0 420px", overflowY: "auto", paddingRight: 4 }}>
          {/* ── 新規性 Section ── */}
          <section className="panel"
            onClick={(e) => handleSectionClick(e, "novelty", false)}
            style={{ cursor: !showDetail.novelty ? "pointer" : undefined }}
          >
            <h2
              onClick={(e) => handleH2Click(e, "novelty", false)}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="クリックで展開/折りたたみ"
            >
              {showDetail.novelty ? "▾" : "▸"} 新規性
            </h2>
            <div className="row" style={{ gap: 6 }}>
              <button
                onClick={onBatchNovelty}
                disabled={!noveltyAssessDone || noveltyReviewJournalFitRunning || noveltyReviewUniversalRunning || noveltyReviewJournalTierRunning || batchRunning["novelty"]}
              >
                {batchRunning["novelty"] ? "一括実行中..." : "一括実行"}
              </button>
              {noveltyReviewJournalFitDone && noveltyReviewUniversalDone && noveltyReviewJournalTierDone ? (
                <span className="status-chip ok">完了</span>
              ) : (
                <span className="status-chip" style={{ color: "#aaa", borderColor: "#ccc" }}>未完了</span>
              )}
            </div>
            {showDetail.novelty && (
              <div style={{
                marginTop: 6, padding: "8px 10px",
                background: "#f9f9fb", borderRadius: 6,
                border: "1px solid #e8e8ec",
              }}>
                {!noveltyAssessDone && (
                  <div className="disabled-reason">
                    先に「新規性チェック」メニューから新規性評価を実行してください
                  </div>
                )}
                {noveltyAssessDone && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {/* Individual generation toggle */}
                    <button
                      onClick={() => setShowIndividualNovelty(!showIndividualNovelty)}
                      style={{
                        fontSize: "10px", height: "20px", padding: "0 8px",
                        background: "none", border: "none",
                        color: "#888", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: 4,
                        alignSelf: "flex-start",
                      }}
                    >
                      {showIndividualNovelty ? "▾" : "▸"} 個別に生成する
                    </button>

                    {showIndividualNovelty && (
                      <>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: "12px", minWidth: 64, color: "#555" }}>ジャーナル適合</span>
                          <button
                            onClick={() => onNoveltyReviewJournalFit("summary")}
                            disabled={noveltyReviewJournalFitRunning}
                            style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                          >
                            {noveltyReviewJournalFitRunning ? "生成中..." : noveltyReviewJournalFitDone ? "再生成" : "生成"}
                          </button>
                          {noveltyReviewJournalFitRunning && <span className="status-chip running">実行中...</span>}
                          {noveltyReviewJournalFitDone && <span className="status-chip ok">完了</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: "12px", minWidth: 64, color: "#555" }}>テーマ新規性</span>
                          <button
                            onClick={() => onNoveltyReviewUniversal("summary")}
                            disabled={noveltyReviewUniversalRunning}
                            style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                          >
                            {noveltyReviewUniversalRunning ? "生成中..." : noveltyReviewUniversalDone ? "再生成" : "生成"}
                          </button>
                          {noveltyReviewUniversalRunning && <span className="status-chip running">実行中...</span>}
                          {noveltyReviewUniversalDone && <span className="status-chip ok">完了</span>}
                        </div>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontSize: "12px", minWidth: 64, color: "#555" }}>適正雑誌</span>
                          <button
                            onClick={() => onNoveltyReviewJournalTier("summary")}
                            disabled={noveltyReviewJournalTierRunning}
                            style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                          >
                            {noveltyReviewJournalTierRunning ? "生成中..." : noveltyReviewJournalTierDone ? "再生成" : "生成"}
                          </button>
                          {noveltyReviewJournalTierRunning && <span className="status-chip running">実行中...</span>}
                          {noveltyReviewJournalTierDone && <span className="status-chip ok">完了</span>}
                        </div>
                      </>
                    )}
                    {/* ── 適正雑誌検索 (grouped: external recommended + internal option) ── */}
                    {noveltyReviewJournalTierDone && (
                      <div style={{
                        marginTop: 10, border: "1px solid #1b5e20", borderRadius: 6,
                        overflow: "hidden",
                      }}>
                        {/* Group header */}
                        <div style={{
                          background: "#1b5e20", color: "#fff",
                          padding: "5px 10px", fontSize: 12, fontWeight: 600,
                        }}>
                          適正雑誌検索
                        </div>
                        <div style={{ padding: "8px 10px" }}>
                          {/* ── Method 1: External AI (recommended) ── */}
                          {/* Row 1: label + status */}
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <span style={{ fontSize: "11px", minWidth: 56, color: "#555" }}>外部AI</span>
                            {journalFindMergeRunning && <span className="status-chip running">解析中...</span>}
                            {journalFindMergeDone && !journalFindMergeRunning && <span className="status-chip ok">完了</span>}
                            {(!journalSearchPromptDone || !journalSearchPromptContent) && (
                              <span style={{ fontSize: "10px", color: "#999" }}>プロンプト生成中...</span>
                            )}
                          </div>
                          {/* Row 2: action buttons */}
                          {journalSearchPromptDone && journalSearchPromptContent && (
                            <div style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                              <button
                                onClick={() => navigator.clipboard.writeText(journalSearchPromptContent)}
                                style={{ fontSize: "11px", height: "22px", padding: "0 10px" }}
                              >
                                プロンプトコピー
                              </button>
                              <button
                                onClick={() => setShowPasteWindow(true)}
                                style={{ fontSize: "11px", height: "22px", padding: "0 10px" }}
                              >
                                貼り付け画面
                              </button>
                              <button
                                onClick={() => setShowPromptDetail(true)}
                                style={{
                                  fontSize: "11px", height: "22px", padding: "0 10px",
                                  background: "#fff", color: "#666",
                                  border: "1px solid #ccc", borderRadius: 3, cursor: "pointer",
                                }}
                              >
                                詳細
                              </button>
                            </div>
                          )}

                          {/* Recommendation note — below external AI row */}
                          <div style={{
                            fontSize: "10px", color: "#666", marginTop: 6,
                            lineHeight: 1.4, background: "#f9fbe7", padding: "3px 6px",
                            borderRadius: 3,
                          }}>
                            ※ 現在はChatGPTのサーチモード、Gemini Deep Research、Perplexityなどによる取得を推奨します
                          </div>

                          {/* ── Internal method toggle ── */}
                          <div style={{
                            marginTop: 6, borderTop: "1px dashed #ccc", paddingTop: 4,
                          }}>
                            <button
                              onClick={() => setShowInternalMethod(!showInternalMethod)}
                              style={{
                                fontSize: "10px", height: "20px", padding: "0 8px",
                                background: "none", border: "none",
                                color: "#888", cursor: "pointer",
                                display: "flex", alignItems: "center", gap: 4,
                              }}
                            >
                              {showInternalMethod ? "▾" : "▸"} 内部APIで検索する（オプション）
                            </button>

                            {showInternalMethod && (
                              <div style={{ marginTop: 4, display: "flex", gap: 6, alignItems: "center" }}>
                                <span style={{ fontSize: "11px", minWidth: 56, color: "#555" }}>内部API</span>
                                <button
                                  onClick={onFindJournals}
                                  disabled={journalFindRunning}
                                  style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                                >
                                  {journalFindRunning ? "検索中..."
                                    : journalFindDone ? "再実行"
                                    : "実行"}
                                </button>
                                {journalFindRunning && <span className="status-chip running">検索中...</span>}
                                {journalFindDone && !journalFindRunning && <span className="status-chip ok">完了</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── 新規性達成度 ── */}
                    {noveltyReviewJournalTierDone && journalFindMergeDone && (
                      <div style={{
                        marginTop: 10, border: "1px solid #e65100", borderRadius: 6,
                        overflow: "hidden",
                      }}>
                        <div style={{
                          background: "#e65100", color: "#fff",
                          padding: "5px 10px", fontSize: 12, fontWeight: 600,
                        }}>
                          新規性達成度
                        </div>
                        <div style={{ padding: "8px 10px" }}>
                          <div style={{
                            fontSize: "10px", color: "#666", marginBottom: 6,
                            lineHeight: 1.4, background: "#f9fbe7",
                            padding: "3px 6px", borderRadius: 3,
                          }}>
                            ※ 表現・方法・統計・論理・主張の各チェックで指摘された問題点を元に、
                            論文の主張する新規性が実際に達成されているかを評価します。
                            「表現」「方法・統計」「論理・主張」のセクションを生成していないと生成できません。
                          </div>
                          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                            <button
                              onClick={onNoveltyAchievement}
                              disabled={
                                noveltyAchievementRunning ||
                                noveltyReviewTranslationLoading ||
                                !(expressionMergeDone || methodsStatsMergeDone || logicArgumentMergeDone)
                              }
                              style={{ fontSize: "11px", height: "22px", padding: "1px 10px" }}
                            >
                              {noveltyAchievementRunning ? "生成中..."
                                : noveltyReviewTranslationLoading ? "翻訳中..."
                                : noveltyAchievementDone ? "再実行"
                                : "一括実行"}
                            </button>
                            {noveltyAchievementDone && <span className="status-chip ok">完了</span>}
                            {noveltyAchievementRunning && <span className="status-chip running">生成中...</span>}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Prompt detail modal ── */}
                    {showPromptDetail && journalSearchPromptContent && (
                      <div style={{
                        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                        background: "rgba(0,0,0,0.45)", zIndex: 9999,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowPromptDetail(false); }}
                      >
                        <div style={{
                          background: "#fff", borderRadius: 8, padding: 20,
                          width: 640, maxHeight: "80vh", overflowY: "auto",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                        }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600, marginBottom: 12,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <span>外部AI検索用プロンプト</span>
                            <button
                              onClick={() => setShowPromptDetail(false)}
                              style={{
                                background: "none", border: "none", fontSize: 18,
                                cursor: "pointer", color: "#888", lineHeight: 1,
                              }}
                            >
                              ✕
                            </button>
                          </div>
                          <textarea
                            readOnly
                            value={journalSearchPromptContent}
                            style={{
                              width: "100%", height: 360, fontSize: "11px",
                              fontFamily: "monospace", resize: "vertical",
                              border: "1px solid #ccc", borderRadius: 4,
                              padding: 8, background: "#fafafa", boxSizing: "border-box",
                            }}
                          />
                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                            <button
                              onClick={() => navigator.clipboard.writeText(journalSearchPromptContent)}
                              style={{
                                fontSize: "12px", height: "28px", padding: "0 14px",
                                background: "#f5f5f5", border: "1px solid #ccc",
                                borderRadius: 4, cursor: "pointer",
                              }}
                            >
                              コピー
                            </button>
                            <button
                              onClick={() => setShowPromptDetail(false)}
                              style={{
                                fontSize: "12px", height: "28px", padding: "0 14px",
                                background: "#1b5e20", color: "#fff",
                                border: "none", borderRadius: 4, cursor: "pointer",
                              }}
                            >
                              閉じる
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ── Paste window modal ── */}
                    {showPasteWindow && (
                      <div style={{
                        position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
                        background: "rgba(0,0,0,0.45)", zIndex: 9999,
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                        onClick={(e) => { if (e.target === e.currentTarget) setShowPasteWindow(false); }}
                      >
                        <div style={{
                          background: "#fff", borderRadius: 8, padding: 20,
                          width: 560, maxHeight: "80vh", overflowY: "auto",
                          boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
                        }}>
                          <div style={{
                            fontSize: 14, fontWeight: 600, marginBottom: 12,
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                          }}>
                            <span>外部AIの検索結果を貼り付け</span>
                            <button
                              onClick={() => setShowPasteWindow(false)}
                              style={{
                                background: "none", border: "none", fontSize: 18,
                                cursor: "pointer", color: "#888", lineHeight: 1,
                              }}
                            >
                              ✕
                            </button>
                          </div>

                          <div style={{ fontSize: "11px", color: "#555", marginBottom: 2 }}>
                            外部AI Aの結果 <span style={{ color: "#c00" }}>*</span>
                          </div>
                          <textarea
                            value={journalSearchExternalResultA}
                            onChange={(e) => setJournalSearchExternalResultA(e.target.value)}
                            placeholder="ChatGPTやGemini等の検索結果を貼り付け..."
                            style={{
                              width: "100%", height: 160, fontSize: "11px",
                              fontFamily: "monospace", resize: "vertical",
                              border: "1px solid #ccc", borderRadius: 4,
                              padding: 6, marginBottom: 8, boxSizing: "border-box",
                            }}
                          />

                          <div style={{ fontSize: "11px", color: "#555", marginBottom: 2 }}>
                            外部AI Bの結果 <span style={{ color: "#999" }}>(任意 — 別のAIの結果があれば統合)</span>
                          </div>
                          <textarea
                            value={journalSearchExternalResultB}
                            onChange={(e) => setJournalSearchExternalResultB(e.target.value)}
                            placeholder="別のAIの検索結果（省略可）..."
                            style={{
                              width: "100%", height: 120, fontSize: "11px",
                              fontFamily: "monospace", resize: "vertical",
                              border: "1px solid #ccc", borderRadius: 4,
                              padding: 6, marginBottom: 12, boxSizing: "border-box",
                            }}
                          />

                          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button
                              onClick={() => setShowPasteWindow(false)}
                              style={{
                                fontSize: "12px", height: "28px", padding: "0 14px",
                                background: "#f5f5f5", border: "1px solid #ccc",
                                borderRadius: 4, cursor: "pointer",
                              }}
                            >
                              閉じる
                            </button>
                            <button
                              onClick={() => { onParseJournalSearchResults(); setShowPasteWindow(false); }}
                              disabled={journalFindMergeRunning || (!journalSearchExternalResultA.trim() && !journalSearchExternalResultB.trim())}
                              style={{
                                fontSize: "12px", height: "28px", padding: "0 14px",
                                background: "#1b5e20", color: "#fff",
                                border: "none", borderRadius: 4, cursor: "pointer",
                              }}
                            >
                              {journalFindMergeRunning ? "解析中..." : "解析してテーブル化"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </section>

          <section className="panel"
            onClick={(e) => handleSectionClick(e, "structure", structureMergeDone)}
            style={{ marginTop: 12, cursor: !showDetail.structure && structureMergeDone ? "pointer" : undefined }}
          >
            <h2
              onClick={(e) => handleH2Click(e, "structure", structureMergeDone)}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="クリックで展開/折りたたみ"
            >
              {showDetail.structure ? "▾" : "▸"} 構成
            </h2>
            {renderCheckSection("structure", "構成", structureCheckResults, onStructureCheck, onBatchStructure, structureMergeDone, structureMergeRunning, onMergeStructure, onClearCheck)}
          </section>

          <section className="panel" style={{ marginTop: 12 }}
            onClick={(e) => handleSectionClick(e, "expression", expressionMergeDone)}
          >
            <h2
              onClick={(e) => handleH2Click(e, "expression", expressionMergeDone)}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="クリックで展開/折りたたみ"
            >
              {showDetail.expression ? "▾" : "▸"} 表現
            </h2>
            {renderCheckSection("expression", "表現", expressionCheckResults, onExpressionCheck, onBatchExpression, expressionMergeDone, expressionMergeRunning, onMergeExpression, onClearCheck)}
          </section>

          <section className="panel" style={{ marginTop: 12 }}
            onClick={(e) => handleSectionClick(e, "methods_stats", methodsStatsMergeDone)}
          >
            <h2
              onClick={(e) => handleH2Click(e, "methods_stats", methodsStatsMergeDone)}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="クリックで展開/折りたたみ"
            >
              {showDetail.methods_stats ? "▾" : "▸"} 方法・統計
            </h2>
            {renderCheckSection("methods_stats", "方法・統計", methodsStatsCheckResults, onMethodsStatsCheck, onBatchMethodsStats, methodsStatsMergeDone, methodsStatsMergeRunning, onMergeMethodsStats, onClearCheck)}
          </section>

          <section className="panel" style={{ marginTop: 12 }}
            onClick={(e) => handleSectionClick(e, "logic_argument", logicArgumentMergeDone)}
          >
            <h2
              onClick={(e) => handleH2Click(e, "logic_argument", logicArgumentMergeDone)}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="クリックで展開/折りたたみ"
            >
              {showDetail.logic_argument ? "▾" : "▸"} 論理・主張
            </h2>
            {renderCheckSection("logic_argument", "論理・主張", logicArgumentCheckResults, onLogicArgumentCheck, onBatchLogicArgument, logicArgumentMergeDone, logicArgumentMergeRunning, onMergeLogicArgument, onClearCheck)}
          </section>

          <section className="panel" style={{ marginTop: 12 }}
            onClick={(e) => handleSectionClick(e, "figure_table", figureTableMergeDone)}
          >
            <h2
              onClick={(e) => handleH2Click(e, "figure_table", figureTableMergeDone)}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="クリックで展開/折りたたみ"
            >
              {showDetail.figure_table ? "▾" : "▸"} 図表
            </h2>
            {renderCheckSection("figure_table", "図表", figureTableCheckResults, onFigureTableCheck, onBatchFigureTable, figureTableMergeDone, figureTableMergeRunning, onMergeFigureTable, onClearCheck, (
              <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid #e0e0e6" }}>
                <div style={{ fontSize: "11px", color: "#666", marginBottom: 4 }}>
                  補足ファイル（図表のPDF・画像等）— 添付すると図表キャプション・ラベルの評価精度が向上します
                </div>
                {supplementalFiles.length > 0 && (
                  <div style={{ marginBottom: 4 }}>
                    {supplementalFiles.map((f, i) => (
                      <div key={i} style={{ fontSize: "11px", color: "#444", padding: "2px 0" }}>
                        📎 {f.filename} ({(f.size_bytes / 1024).toFixed(1)} KB)
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={onAttachSupplemental}
                  style={{ fontSize: "11px", height: "22px", padding: "1px 8px" }}
                >
                  補足ファイルを追加
                </button>
              </div>
            ))}
          </section>

          <section className="panel" style={{ marginTop: 12 }}
            onClick={(e) => handleSectionClick(e, "ethics", ethicsMergeDone)}
          >
            <h2
              onClick={(e) => handleH2Click(e, "ethics", ethicsMergeDone)}
              style={{ cursor: "pointer", userSelect: "none" }}
              title="クリックで展開/折りたたみ"
            >
              {showDetail.ethics ? "▾" : "▸"} 倫理・利益相反
            </h2>
            {renderCheckSection("ethics", "倫理・利益相反", ethicsCheckResults, onEthicsCheck, onBatchEthics, ethicsMergeDone, ethicsMergeRunning, onMergeEthics, onClearCheck)}
          </section>

          {/* Next step */}
          <div className="next-step">
            {!crossrefReallyDone && "次: 「前処理」メニューから文献DB照合を完了してください"}
            {crossrefReallyDone && !allReviewersConfigured && "次: 「設定」メニューからLLM API設定を行ってください"}
            {crossrefReallyDone && allReviewersConfigured && !anyReviewerDone(structureCheckResults) && "次: 構成チェックを実行してください"}
            {crossrefReallyDone && allReviewersConfigured && anyReviewerDone(structureCheckResults) && !structureMergeDone && "次: 構成チェックの統合を完了してください"}
            {structureMergeDone && !anyReviewerDone(expressionCheckResults) && "次: 表現チェックを実行してください"}
            {structureMergeDone && anyReviewerDone(expressionCheckResults) && !expressionMergeDone && "次: 表現チェックの統合を完了してください"}
            {structureMergeDone && expressionMergeDone && !anyReviewerDone(methodsStatsCheckResults) && "次: 方法・統計チェックを実行してください"}
            {structureMergeDone && expressionMergeDone && anyReviewerDone(methodsStatsCheckResults) && !methodsStatsMergeDone && "次: 方法・統計チェックの統合を完了してください"}
            {structureMergeDone && expressionMergeDone && methodsStatsMergeDone && !anyReviewerDone(logicArgumentCheckResults) && "次: 論理・主張チェックを実行してください"}
            {structureMergeDone && expressionMergeDone && methodsStatsMergeDone && anyReviewerDone(logicArgumentCheckResults) && !logicArgumentMergeDone && "次: 論理・主張チェックの統合を完了してください"}
            {structureMergeDone && expressionMergeDone && methodsStatsMergeDone && logicArgumentMergeDone && !anyReviewerDone(figureTableCheckResults) && "次: 図表チェックを実行してください"}
            {structureMergeDone && expressionMergeDone && methodsStatsMergeDone && logicArgumentMergeDone && anyReviewerDone(figureTableCheckResults) && !figureTableMergeDone && "次: 図表チェックの統合を完了してください"}
            {figureTableMergeDone && !anyReviewerDone(ethicsCheckResults) && "次: 倫理・利益相反チェックを実行してください"}
            {figureTableMergeDone && anyReviewerDone(ethicsCheckResults) && !ethicsMergeDone && "次: 倫理・利益相反チェックの統合を完了してください"}
            {(structureMergeDone && expressionMergeDone && methodsStatsMergeDone && logicArgumentMergeDone) && !finalMergeDone && "次: 最終チェックレポートを生成してください"}
            {finalMergeDone && "チェック完了。「レポート作成」メニューで出力を確認してください"}
          </div>

          {/* ── 設定：解決策プロンプト編集（グローバル設定）── */}
          <div style={{ marginTop: 12, borderTop: "1px solid #e0e0e0", paddingTop: 10 }}>
            <div style={{ fontSize: "10px", color: "#999", marginBottom: 4, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>設定</div>
            <button
              onClick={() => { setSolutionPromptDraft(solutionGlobalPrompt); setShowGlobalPromptEditor(true); }}
              style={{
                fontSize: "12px", padding: "4px 10px",
                background: "#f5f5f5",
                border: "1px solid #ccc",
                borderRadius: 4, cursor: "pointer",
                color: "#555",
                fontWeight: 500, width: "100%", textAlign: "left",
              }}
            >
              ▸ 解決策プロンプト編集
            </button>
          </div>
        </div>

        {/* Right: viewer */}
        {renderViewer()}
      </div>

      {/* ── 解決策プロンプト編集モーダル ── */}
      {showGlobalPromptEditor && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowGlobalPromptEditor(false); }}
        >
          <div style={{
            background: "#fff", borderRadius: 8, padding: "20px 24px",
            width: "90vw", maxWidth: 700, maxHeight: "85vh",
            display: "flex", flexDirection: "column",
            boxShadow: "0 8px 32px rgba(0,0,0,0.24)",
          }}>
            <h3 style={{ margin: 0, fontSize: 16, marginBottom: 12 }}>解決策プロンプト編集</h3>

            <label style={{ fontSize: "12px", fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>
              デフォルトプロンプト（全指摘に共通）
            </label>
            <textarea
              value={solutionPromptDraft}
              onChange={e => setSolutionPromptDraft(e.target.value)}
              rows={6}
              style={{
                width: "100%", fontSize: "12px", padding: "8px 10px",
                border: "1px solid #ccc", borderRadius: 4, resize: "vertical",
                fontFamily: "inherit", boxSizing: "border-box",
                lineHeight: 1.5,
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
              <button
                onClick={() => setShowGlobalPromptEditor(false)}
                style={{
                  fontSize: "13px", padding: "6px 20px",
                  background: "#f5f5f5", border: "1px solid #ccc", borderRadius: 4,
                  color: "#555", cursor: "pointer", fontWeight: 500,
                }}
              >
                キャンセル
              </button>
              <button
                onClick={() => { setSolutionGlobalPrompt(solutionPromptDraft); setShowGlobalPromptEditor(false); }}
                style={{
                  fontSize: "13px", padding: "6px 20px",
                  background: "#1b5e20", border: "none", borderRadius: 4,
                  color: "#fff", cursor: "pointer", fontWeight: 600,
                }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* External check paste modal */}
      {externalCheckModal && (
        <div
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
            zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setExternalCheckModal(null); } }}
        >
          <div style={{
            background: "#fff", borderRadius: 8, padding: 20, width: 700, maxHeight: "90vh",
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)", display: "flex", flexDirection: "column",
          }}>
            <h3 style={{ margin: "0 0 8px 0" }}>
              外部評価結果を入力 — {externalCheckModal === "structure" ? "構成" : externalCheckModal === "expression" ? "表現" : externalCheckModal === "methods_stats" ? "方法・統計" : externalCheckModal === "logic_argument" ? "論理・主張" : "図表"}
            </h3>
            <p style={{ margin: "0 0 8px 0", fontSize: "12px", color: "#888" }}>
              外部評価AIにプロンプトを貼り付け、返ってきたJSONをそのまま下に貼り付けてください。
            </p>
            <textarea
              value={externalCheckInput}
              onChange={(e) => setExternalCheckInput(e.target.value)}
              placeholder={`{"verdicts": [{"comment_id": "...", "verdict": "agree", "reasoning": "..."}]}`}
              style={{
                width: "100%", height: 300, fontSize: "12px", fontFamily: "monospace",
                padding: "8px 10px", border: "1px solid #ccc", borderRadius: 4, resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            {externalCheckSaveError && (
              <div style={{ color: "#c00", fontSize: "12px", marginTop: 6 }}>{externalCheckSaveError}</div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => { setExternalCheckModal(null); setExternalCheckInput(""); setExternalCheckSaveError(null); }}
                style={{ fontSize: "12px", padding: "4px 16px" }}
              >
                キャンセル
              </button>
              <button
                onClick={saveExternalCheck}
                disabled={!externalCheckInput.trim()}
                style={{ fontSize: "12px", padding: "4px 16px" }}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ReviewChecksPanel;
