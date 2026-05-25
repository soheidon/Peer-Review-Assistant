import { useState, useEffect, useMemo, useRef } from "react";
import { renderMarkdown, getRelativeParagraphInfo, formatParagraphLocation } from "../utils";
import type { SectionInfo, RelativeParagraphInfo } from "../utils";
import type { CommentCard, CardSource } from "../App";

interface ResultsPanelProps {
  projectPath: string;
  selectedResultFile: string;
  resultFileContent: string;
  resultFileLoading: boolean;
  onLoadResultFile: (filename: string) => void;
  onReloadResults: () => void;
  onOpenOutputFolder: () => void;
  statusMessage: { text: string; type: "ok" | "error" | "info" } | null;
  // Candidate generation
  assessmentCandidatesRunning: boolean;
  onGenerateCandidates: (volume: "brief" | "standard" | "detailed") => void;
  onRegenerateSection: (sectionKey: string, focus: string[], tone: string) => void;
  onCancelCandidates: () => void;
  // Candidate selection
  candidatesData: {
    sections: Record<string, CandidateSection>;
    generated_at?: string;
    model?: string;
  } | null;
  selectedIds: string[];
  onToggleCandidate: (id: string) => void;
  // Compose
  assessmentComposeRunning: boolean;
  onComposeAssessment: () => void;
  onCancelCompose: () => void;
  // Delete per-candidate
  onDeleteCandidate: (candidateId: string) => void;
  // Free text
  freeTextContent: string;
  onFreeTextChange: (content: string) => void;
  // Translation for result files
  resultFileTranslateLoading: boolean;
  onTranslateResultFile: () => void;
  // Edit instruction for result files
  editInstruction: string;
  onEditInstructionChange: (value: string) => void;
  editReflectRunning: boolean;
  onReflectEdit: () => void;
  // Compose status
  assessmentComposed: boolean;
  // Comment cards for 査読コメント aggregation
  commentCards: CommentCard[];
  commentCardChecked: Record<string, boolean>;
  onToggleCommentCard: (cardKey: string) => void;
  viewerFontSize: number;
  onViewerFontSizeChange: (size: number) => void;
  // Verdict generation for 採否決定
  verdictGenerating: boolean;
  onGenerateVerdict: () => void;
  verdictDetailGenerating: boolean;
  onGenerateVerdictDetail: () => void;
  onSelectVerdict: (verdict: string) => void;
  // Verdict edit
  verdictEditInstruction: string;
  onVerdictEditInstructionChange: (value: string) => void;
  verdictEditRunning: boolean;
  onVerdictEdit: () => void;
  // File output workspace
  finalMergeDone: boolean;
  onRunFinalMerge: (lang: "en" | "ja", format: string) => void;
}

interface CandidateSection {
  label_ja: string;
  label_en: string;
  candidates: Candidate[];
}

interface Candidate {
  id: string;
  text_ja: string;
  text_en: string;
  strength: "strong" | "moderate" | "cautious" | "not_recommended";
  recommendation: "high" | "medium" | "low";
  style?: { ja: string; en: string };
  source_check?: string;
  source_comment_id?: string;
}

export interface VerdictSection {
  key: string;
  label: string;
  contentEn: string;
  contentJa: string;
}

export const VERDICT_SECTION_DEFS: { key: string; label: string; enHeader: string; jaHeaders: string[] }[] = [
  { key: "verdict", label: "判定", enHeader: "## Verdict", jaHeaders: ["判定", "Verdict"] },
  { key: "reasoning", label: "理由", enHeader: "## Reasoning", jaHeaders: ["理由", "判断理由", "根拠", "論拠", "Reasoning"] },
  { key: "strengths", label: "強み", enHeader: "## Key Strengths", jaHeaders: ["強み", "主な強み", "Key Strengths"] },
  { key: "concerns", label: "懸念", enHeader: "## Key Concerns", jaHeaders: ["懸念", "主な懸念", "Key Concerns"] },
];

export function parseConfidenceDistribution(content: string): { verdict: string; percent: number }[] | null {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const result: { verdict: string; percent: number }[] = [];
  const pattern = /^-\s*(Accept|Minor Revision|Major Revision|Reject):\s*(\d+)%/;
  for (const line of lines) {
    const m = line.trim().match(pattern);
    if (m) {
      result.push({ verdict: m[1], percent: parseInt(m[2], 10) });
    }
  }
  return result.length === 4 ? result : null;
}

export function parseVerdictSections(content: string): VerdictSection[] | null {
  const normalized = content.replace(/\r\n/g, "\n");
  const sepMatch = normalized.match(/\n\n---\n\n/);
  let enText = normalized;
  let jaText = "";
  if (sepMatch && sepMatch.index !== undefined) {
    const before = normalized.slice(0, sepMatch.index).trim();
    const after = normalized.slice(sepMatch.index + sepMatch[0].length).trim();
    const jaLike = /[぀-ゟ゠-ヿ一-鿿]/.test(before) || before.startsWith("# 採否決定");
    if (jaLike) {
      jaText = before;
      enText = after;
    } else {
      jaText = after;
      enText = before;
    }
  }

  // Extract sections from EN text by splitting on "## "
  const enSections = new Map<string, string>();
  const enParts = enText.split(/\n(?=## )/);
  for (const part of enParts) {
    const m = part.match(/^##\s+(.+)/m);
    if (m) {
      const header = m[1].trim().replace(/:$/, "").trim();
      const body = part.replace(/^##\s+.+\n?/, "").trim();
      for (const def of VERDICT_SECTION_DEFS) {
        const defHeader = def.enHeader.replace("## ", "").trim();
        if (header.toLowerCase() === defHeader.toLowerCase()) {
          enSections.set(def.key, body);
        }
      }
    }
  }

  // Extract sections from JA text (match any known JA header variant)
  const jaSections = new Map<string, string>();
  if (jaText) {
    const jaParts = jaText.split(/\n(?=## )/);
    for (const part of jaParts) {
      const m = part.match(/^##\s+(.+)/m);
      if (m) {
        const header = m[1].trim().replace(/:$/, "").trim();
        const body = part.replace(/^##\s+.+\n?/, "").trim();
        for (const def of VERDICT_SECTION_DEFS) {
          if (def.jaHeaders.includes(header)) {
            if (!jaSections.has(def.key)) {
              jaSections.set(def.key, body);
            }
          }
        }
      }
    }
  }

  // Strip confidence distribution text from verdict body
  // (format: "**Confidence Distribution:**\n\n- Accept: X%\n...")
  const stripDist = (body: string) =>
    body.replace(/\*\*Confidence Distribution:\*\*\s*\n(?:\s*-\s*(?:Accept|Minor Revision|Major Revision|Reject):\s*\d+%\s*\n?)*/gi, "").trim();
  if (enSections.has("verdict")) {
    enSections.set("verdict", stripDist(enSections.get("verdict")!));
  }
  if (jaSections.has("verdict")) {
    jaSections.set("verdict", stripDist(jaSections.get("verdict")!));
  }

  // Build result; require at least EN Verdict to consider valid
  // If ## Verdict header is missing, try extracting Verdict from **Verdict:** pattern
  if (!enSections.has("verdict")) {
    const verdictMatch = enText.match(/\*\*Verdict:\s*(.+?)\*\*/i);
    if (verdictMatch) {
      enSections.set("verdict", verdictMatch[0]);
    } else {
      // Fallback: treat everything before ## Reasoning as verdict
      const reasoningIdx = enText.search(/\n## Reasoning\b/);
      if (reasoningIdx >= 0) {
        enSections.set("verdict", enText.slice(0, reasoningIdx).trim());
      } else {
        return null;
      }
    }
  }

  return VERDICT_SECTION_DEFS.map(def => ({
    key: def.key,
    label: def.label,
    contentEn: enSections.get(def.key) || "",
    contentJa: jaSections.get(def.key) || "",
  }));
}

interface ResultFile {
  file: string;
  label: string;
  description: string;
}

const RESULT_FILE_LABELS: Record<string, { label: string; description: string }> = {
  "final_review.md": { label: "最終査読", description: "英語の最終査読レポート" },
  "final_review_jp.md": { label: "最終査読", description: "日本語の最終査読レポート" },
  "Review_comments.md": { label: "採否決定", description: "英語の採否決定コメント" },
  "Review_comments_jp.md": { label: "採否決定", description: "日本語の採否決定コメント" },
  "comments_to_authors.md": { label: "査読コメント", description: "著者向けコメント一覧" },
  "confidential_comments_to_editor.md": { label: "編集者への所見", description: "守秘コメント" },
  "recommendation.md": { label: "採否", description: "判定サマリー" },
  "audit_trail.json": { label: "監査証跡", description: "生成メタデータ" },
  "overall_assessment.md": { label: "全体所感", description: "総合評価" },
  "free_text.md": { label: "自由記述", description: "自由記述テキスト" },
  "overall_assessment.json": { label: "全体所感(JSON)", description: "全体所感データ" },
  "overall_assessment_candidates.json": { label: "所感候補", description: "全体所感の候補データ" },
  "overall_assessment_selection.json": { label: "所感選択", description: "全体所感の選択データ" },
};

const SECTION_TABS = [
  { key: "novelty_theme", label: "新規性" },
  { key: "journal_fit", label: "適合性" },
  { key: "achievements", label: "達成点" },
  { key: "key_issues", label: "問題点" },
  { key: "free_text", label: "自由記述" },
  { key: "created_result", label: "作成結果" },
];

type SectionTabKey = string;

const enCol: React.CSSProperties = {
  flex: "1 1 50%",
  minWidth: 0,
  wordBreak: "break-word",
  overflowWrap: "break-word",
};

const jaCol: React.CSSProperties = {
  flex: "1 1 50%",
  minWidth: 0,
  wordBreak: "break-word",
  overflowWrap: "break-word",
  borderLeft: "1px solid #e0e0e0",
  paddingLeft: 12,
};

/** Parse a bilingual result file (JA + --- + EN) into EN and JA sections. */
export function parseResultContent(content: string): { en: string; ja: string } | null {
  const normalized = content.replace(/\r\n/g, "\n");
  const sepMatch = normalized.match(/\n\n---\n\n/);
  if (!sepMatch || sepMatch.index === undefined) return null;
  const sepIdx = sepMatch.index;
  const before = normalized.slice(0, sepIdx).trim();
  const after = normalized.slice(sepIdx + sepMatch[0].length).trim();
  const jaLike = /[぀-ゟ゠-ヿ一-鿿]/.test(before) || before.startsWith("# 全体所感");
  if (jaLike) {
    return { en: after, ja: before };
  }
  return { en: before, ja: after };
}

export default function ResultsPanel({
  projectPath,
  selectedResultFile,
  resultFileContent,
  resultFileLoading,
  onLoadResultFile,
  onReloadResults,
  onOpenOutputFolder,
  statusMessage,
  assessmentCandidatesRunning,
  onGenerateCandidates,
  onRegenerateSection,
  onCancelCandidates,
  candidatesData,
  selectedIds,
  onToggleCandidate,
  assessmentComposeRunning,
  onComposeAssessment,
  onCancelCompose,
  onDeleteCandidate,
  assessmentComposed,
  commentCards,
  commentCardChecked,
  onToggleCommentCard,
  viewerFontSize,
  onViewerFontSizeChange,
  freeTextContent,
  onFreeTextChange,
  resultFileTranslateLoading,
  onTranslateResultFile,
  editInstruction,
  onEditInstructionChange,
  editReflectRunning,
  onReflectEdit,
  verdictGenerating,
  onGenerateVerdict,
  verdictDetailGenerating,
  onGenerateVerdictDetail,
  onSelectVerdict,
  verdictEditInstruction,
  onVerdictEditInstructionChange,
  verdictEditRunning,
  onVerdictEdit,
  finalMergeDone,
  onRunFinalMerge,
}: ResultsPanelProps) {
  const hasProject = projectPath.trim().length > 0;
  const hasCandidates = candidatesData != null && candidatesData.sections != null;

  // Paragraph → line number mapping (for 該当箇所 display)
  const [paragraphLineMap, setParagraphPageMap] = useState<Record<number, number>>({});
  // comment_id → line number fallback (when paragraph_start is null)
  const [commentLineMap, setCommentLineMap] = useState<Record<string, number>>({});
  // finding_id → {line, method, paragraph?} fallback
  const [findingMatches, setFindingMatches] = useState<Record<string, {line:number;method:string;paragraph?:number|null;excerpt?:string}>>({});
  useEffect(() => {
    if (!hasProject) return;
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
      } catch { /* file not found yet */ }
    })();
  }, [hasProject, projectPath]);

  // Section map for relative paragraph numbering
  const [sectionMap, setSectionMap] = useState<SectionInfo[]>([]);
  useEffect(() => {
    if (!hasProject) return;
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
  }, [hasProject, projectPath]);

  const parsedResult = resultFileContent ? parseResultContent(resultFileContent) : null;
  const hasResultJa = parsedResult !== null;
  const confidenceDist = useMemo(() =>
    selectedResultFile === "Review_comments.md" && resultFileContent
      ? parseConfidenceDistribution(resultFileContent)
      : null,
    [selectedResultFile, resultFileContent],
  );
  // Persist confidence distribution so it stays visible after selection
  const [savedDist, setSavedDist] = useState<{ verdict: string; percent: number }[] | null>(null);
  const [selectedVerdictChoice, setSelectedVerdictChoice] = useState<string | null>(null);
  const [distLoaded, setDistLoaded] = useState(false);

  // Load saved distribution from disk on mount (survives app restart)
  useEffect(() => {
    if (!hasProject) { setDistLoaded(true); return; }
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const raw = await invoke<string>("read_text_file", {
          path: `${projectPath.replace(/\\/g, "/")}/outputs/final/_data/confidence_distribution.json`,
        });
        const data = JSON.parse(raw);
        if (data.distribution && Array.isArray(data.distribution)) {
          setSavedDist(data.distribution);
        }
        if (data.selectedVerdict) {
          setSelectedVerdictChoice(data.selectedVerdict);
        }
      } catch { /* file not found yet */ }
      setDistLoaded(true);
    })();
  }, [hasProject, projectPath]);

  // Persist distribution and selection across navigation away from 採否決定
  useEffect(() => {
    if (confidenceDist) {
      // New distribution generated — save it and reset selection
      setSavedDist(confidenceDist);
      setSelectedVerdictChoice(null);
    }
    // Do NOT clear on navigation away — keep distribution UI when user returns
  }, [confidenceDist]);

  // Save distribution to disk whenever it changes (survives app restart)
  useEffect(() => {
    if (!hasProject || !distLoaded) return;
    (async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const path = `${projectPath.replace(/\\/g, "/")}/outputs/final/_data/confidence_distribution.json`;
        const data: { distribution: { verdict: string; percent: number }[] | null; selectedVerdict: string | null } = {
          distribution: savedDist,
          selectedVerdict: selectedVerdictChoice,
        };
        await invoke("write_text_file", { path, content: JSON.stringify(data) });
      } catch { /* ignore write errors */ }
    })();
  }, [hasProject, savedDist, selectedVerdictChoice, distLoaded]);

  // Reset verdict state when project changes
  useEffect(() => {
    setSavedDist(null);
    setSelectedVerdictChoice(null);
    setDistLoaded(false);
  }, [projectPath]);

  // Track whether user explicitly chose to view a result file
  const [viewingFile, setViewingFile] = useState(false);
  const [viewingComments, setViewingComments] = useState(false);
  const [viewingFileOutput, setViewingFileOutput] = useState(false);
  const [showOutputFileList, setShowOutputFileList] = useState(true);
  const [showVerdictEdit, setShowVerdictEdit] = useState(false);
  const [outputFiles, setOutputFiles] = useState<ResultFile[]>([]);
  const [outputDir, setOutputDir] = useState("");
  const [selectedFormats, setSelectedFormats] = useState<string[]>(["txt", "docx"]);

  // List actual files in outputs/final/ when workspace opens
  useEffect(() => {
    if (!viewingFileOutput || !hasProject) return;
    (async () => {
      try {
        const { Command } = await import("@tauri-apps/plugin-shell");
        const finalDir = outputDir || `${projectPath.replace(/\\/g, "/")}/outputs/final`;
        const output = await Command.create("cmd", ["/c", "dir", "/b", finalDir.replace(/\//g, "\\")]).execute();
        if (output.code === 0 && output.stdout) {
          const files = output.stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
          setOutputFiles(files.map(f => ({
            file: f,
            label: RESULT_FILE_LABELS[f]?.label || f,
            description: RESULT_FILE_LABELS[f]?.description || "",
          })));
        }
      } catch { /* ignore */ }
    })();
  }, [viewingFileOutput, hasProject, projectPath, outputDir]);

  // Auto-open 査読コメント when results already exist
  const autoOpenedRef = useRef(false);
  useEffect(() => {
    if (commentCards.length > 0 && !viewingComments && !autoOpenedRef.current) {
      setViewingComments(true);
      autoOpenedRef.current = true;
    }
  }, [commentCards.length, viewingComments]);

  // Derive verdict card data from commentCards (single source of truth)
  const verdictCards = commentCards.filter(c => c.source === "verdict");
  const verdictMainCard = verdictCards.find(c => c.cardLabel === "判定");
  // Filter: show all verdict cards in 査読コメント, but hide the 判定 card in the file viewer
  const verdictCardsForDetail = verdictCards.filter(c => c.key !== "verdict::verdict");

  // Reset when candidates appear (new generation) or disappear
  useEffect(() => {
    if (!hasCandidates) { setViewingFile(false); setViewingComments(false); }
  }, [hasCandidates]);

  // Determine active viewer mode
  const viewerMode: "candidates" | "file" = hasCandidates && !viewingFile ? "candidates" : "file";

  const focusOptions = [
    { key: "theme", label: "テーマ" },
    { key: "data", label: "データ" },
    { key: "analysis", label: "分析" },
    { key: "writing", label: "論述" },
    { key: "general", label: "全般" },
  ] as const;

  const toneOptions = [
    { key: "positive" as const, label: "肯定的" },
    { key: "mild_positive" as const, label: "やや肯定的" },
    { key: "neutral" as const, label: "フラット" },
    { key: "mild_negative" as const, label: "やや否定的" },
    { key: "negative" as const, label: "否定的" },
  ];

  // Content focus per tab: multi-select, "general" is exclusive
  const [tabFocus, setTabFocus] = useState<Record<string, string[]>>({});

  // Tone per tab
  const [tabTone, setTabTone] = useState<Record<string, string>>({});

  // First available section tab
  const defaultTab: SectionTabKey = hasCandidates
    ? (Object.keys(candidatesData!.sections).find((k) =>
        SECTION_TABS.some((t) => t.key === k)
      ) as SectionTabKey) || "novelty_theme"
    : "novelty_theme";
  const [activeTab, setActiveTab] = useState<SectionTabKey>(defaultTab);

  // Reset tab when candidates change
  useEffect(() => {
    if (hasCandidates) {
      const firstKey = Object.keys(candidatesData!.sections).find((k) =>
        SECTION_TABS.some((t) => t.key === k)
      ) as SectionTabKey;
      if (firstKey && !SECTION_TABS.some((t) => t.key === activeTab && candidatesData!.sections[t.key])) {
        setActiveTab(firstKey);
      }
    }
  }, [hasCandidates, candidatesData]);

  // Load overall_assessment.md when switching to 作成結果 tab
  const isCreatedResult = activeTab === "created_result";
  useEffect(() => {
    if (isCreatedResult && hasProject) {
      onLoadResultFile("overall_assessment.md");
    }
  }, [isCreatedResult, hasProject]);

  // Auto-switch to 作成結果 tab when compose completes
  useEffect(() => {
    if (assessmentComposed && hasCandidates) {
      setActiveTab("created_result");
    }
  }, [assessmentComposed]);

  const isFreeText = activeTab === "free_text";
  const section = !isFreeText && !isCreatedResult && hasCandidates ? candidatesData!.sections[activeTab] : null;
  const sectionCandidates = section?.candidates ?? [];
  const selectedSet = new Set(selectedIds);

  // Per-tab focus and tone
  const currentFocus = tabFocus[activeTab] || ["general"];
  const currentTone = tabTone[activeTab] || "neutral";

  const setCurrentTone = (t: string) =>
    setTabTone(prev => ({ ...prev, [activeTab]: t }));

  const toggleFocus = (key: string) => {
    setTabFocus(prev => {
      const cur = prev[activeTab] || ["general"];
      let next: string[];
      if (key === "general") {
        next = ["general"];
      } else {
        const withoutGeneral = cur.filter(k => k !== "general");
        if (withoutGeneral.includes(key)) {
          next = withoutGeneral.filter(k => k !== key);
          if (next.length === 0) next = ["general"];
        } else {
          next = [...withoutGeneral, key];
        }
      }
      return { ...prev, [activeTab]: next };
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`} style={{ flexShrink: 0 }}>
          {statusMessage.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 0, flex: 1, minHeight: 0 }}>
        {/* Left: controls */}
        <div style={{ flex: "0 0 280px", overflowY: "auto", paddingRight: 4 }}>
          {/* ── 採否決定 ── */}
          <section className="panel"
            onClick={() => { onLoadResultFile("Review_comments.md"); setViewingFile(true); setViewingComments(false); setViewingFileOutput(false); }}
            style={{ cursor: "pointer", minHeight: 72 }}
            title="クリックでファイルを表示"
          >
            <h2 style={{ userSelect: "none" }}>
              採否決定
            </h2>
            <div className="row" style={{ gap: 6 }}>
              {verdictCards.length > 0 ? (
                <span className="status-chip ok">生成済</span>
              ) : (
                <span className="status-chip" style={{ color: "#aaa", borderColor: "#ccc" }}>未生成</span>
              )}
            </div>
          </section>

          {/* ── 全体所感 ── */}
          <section className="panel"
            onClick={() => { onLoadResultFile("overall_assessment.md"); setViewingFile(false); setViewingComments(false); setViewingFileOutput(false); }}
            style={{ cursor: "pointer", marginTop: 12, minHeight: 72 }}
            title="クリックで作成画面を表示"
          >
            <h2 style={{ userSelect: "none" }}>
              全体所感
            </h2>
            <div className="row" style={{ gap: 6 }}>
              {assessmentComposed ? (
                <span className="status-chip ok">作成済</span>
              ) : (
                <span className="status-chip" style={{ color: "#aaa", borderColor: "#ccc" }}>未作成</span>
              )}
            </div>
          </section>

          {/* ── 査読コメント ── */}
          <section className="panel"
            onClick={() => { setViewingComments(true); setViewingFileOutput(false); }}
            style={{ cursor: "pointer", marginTop: 12, minHeight: 72 }}
            title="クリックで専用ビューアーを表示"
          >
            <h2 style={{ userSelect: "none" }}>
              査読コメント
            </h2>
          </section>

          {/* ── ファイル出力 ── */}
          <section className="panel"
            onClick={() => setViewingFileOutput(true)}
            style={{ cursor: "pointer", marginTop: 12, minHeight: 72 }}
            title="クリックで作業スペースを表示"
          >
            <h2 style={{ userSelect: "none" }}>
              ファイル出力
            </h2>
          </section>
        </div>

        {/* Right: viewer */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            paddingLeft: 12,
            borderLeft: "1px solid #e0e0e0",
            minWidth: 0,
          }}
        >
          {/* ── ファイル出力 作業スペース ── */}
          {viewingFileOutput ? (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              {/* Header */}
              <div style={{
                flexShrink: 0, display: "flex", gap: 8, alignItems: "center",
                marginBottom: 12, flexWrap: "wrap",
              }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>査読結果作成 — ファイル出力</h3>
              </div>

              {/* 出力設定 */}
              <div style={{
                flexShrink: 0, marginBottom: 16,
                border: "1px solid #e0e0e0", borderRadius: 6, overflow: "hidden",
              }}>
                <div style={{
                  fontSize: 12, fontWeight: 700, color: "#333",
                  padding: "8px 12px", background: "#f5f5f5",
                  borderBottom: "1px solid #e0e0e0",
                }}>
                  査読コメントの出力
                </div>
                <div style={{ padding: "10px 12px" }}>
                  {/* Unified path + folder selector */}
                  <div style={{
                    display: "flex", gap: 0, alignItems: "stretch",
                    border: "1px solid #ccc", borderRadius: 4,
                    overflow: "hidden", marginBottom: 12,
                    maxWidth: "66%",
                  }}>
                    <div style={{
                      flex: 1, fontSize: 11, fontFamily: "monospace", color: "#333",
                      background: "#f8f8f8", padding: "5px 8px",
                      overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis",
                      display: "flex", alignItems: "center",
                    }}>
                      {(outputDir || `${projectPath.replace(/\\/g, "/")}/outputs/final/`).replace(/\/$/, "")}/
                    </div>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const { open } = await import("@tauri-apps/plugin-dialog");
                          const finalDir = outputDir || `${projectPath.replace(/\\/g, "/")}/outputs/final`;
                          const selected = await open({
                            directory: true, multiple: false,
                            title: "出力先フォルダを選択",
                            defaultPath: finalDir,
                          });
                          if (selected && typeof selected === "string") {
                            setOutputDir(selected.replace(/\\/g, "/"));
                          }
                        } catch { /* ignore */ }
                      }}
                      style={{
                        fontSize: 11, padding: "5px 14px", whiteSpace: "nowrap",
                        background: "#e0e0e0", color: "#333",
                        border: "none", borderLeft: "1px solid #ccc",
                        borderRadius: 0, cursor: "pointer",
                        fontWeight: 600,
                      }}
                    >
                      出力フォルダ選択
                    </button>
                  </div>
                  {/* Format toggle buttons + 出力 */}
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {/* Markdown — always selected, not toggleable */}
                    <button
                      disabled
                      style={{
                        fontSize: 12, fontWeight: 700,
                        height: 28, padding: "0 14px",
                        background: "#bdbdbd", color: "#222",
                        border: "1px solid #ccc", borderRadius: 4,
                        cursor: "default", opacity: 0.85,
                      }}
                    >
                      Markdown形式
                    </button>
                    {/* Text + Word — toggleable connected pair */}
                    <div style={{ display: "flex", gap: 0 }}>
                      {([
                        { fmt: "txt",  label: "テキスト形式" },
                        { fmt: "docx", label: "Word形式" },
                      ] as const).map(({ fmt, label }, i) => {
                        const sel = selectedFormats.includes(fmt);
                        const borderR = i === 0 ? "4px 0 0 4px" : "0 4px 4px 0";
                        return (
                          <button
                            key={fmt}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFormats(prev =>
                                prev.includes(fmt)
                                  ? prev.filter(f => f !== fmt)
                                  : [...prev, fmt]
                              );
                            }}
                            style={{
                              fontSize: 12, fontWeight: sel ? 700 : 400,
                              height: 28, minWidth: 90, padding: "0 14px",
                              background: sel ? "#bdbdbd" : "#e8e8e8",
                              color: sel ? "#222" : "#777",
                              border: "1px solid #ccc",
                              borderRadius: borderR, cursor: "pointer",
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        const fmts = ["md", ...selectedFormats].join(",");
                        onRunFinalMerge("en", fmts);
                        onRunFinalMerge("ja", fmts);
                      }}
                      disabled={!hasProject}
                      style={{
                        fontSize: 12, fontWeight: 700, height: 28, padding: "0 20px",
                        background: hasProject ? "#c62828" : "#ccc",
                        color: "#fff", border: "none", borderRadius: 4,
                        cursor: hasProject ? "pointer" : "default",
                      }}
                    >
                      出力
                    </button>
                  </div>
                  <div style={{
                    fontSize: 12, color: "#888", marginTop: 4, paddingLeft: 2,
                  }}>
                    ※Markdown形式は必ず出力されます。英語・日本語バージョンが出力されます。
                  </div>
                </div>
              </div>

              {/* 出力ファイル一覧（常時表示） */}
              <div style={{
                flexShrink: 0, marginTop: 16,
                border: "1px solid #e0e0e0", borderRadius: 6, overflow: "hidden",
                width: "fit-content",
              }}>
                <div style={{
                  fontSize: 13, fontWeight: 700, color: "#333",
                  padding: "8px 12px", background: "#f5f5f5",
                  borderBottom: "1px solid #e0e0e0",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  <span style={{ flex: 1 }}>出力ファイル</span>
                  <button
                    onClick={async (e) => {
                      e.stopPropagation();
                      const { Command } = await import("@tauri-apps/plugin-shell");
                      const dir = outputDir || `${projectPath.replace(/\\/g, "/")}/outputs/final`;
                      await Command.create("explorer", [dir.replace(/\//g, "\\")]).execute();
                    }}
                    style={{
                      fontSize: 11, height: 22, padding: "0 10px",
                      background: "#e0e0e0", color: "#333",
                      border: "1px solid #ccc", fontWeight: 600,
                      borderRadius: 3, cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    フォルダを開く
                  </button>
                </div>
                <table style={{
                  borderCollapse: "collapse",
                  fontSize: 12,
                }}>
                  <thead>
                    <tr style={{ background: "#fafafa" }}>
                      <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e0e0e0", color: "#555" }}>ファイル名</th>
                      <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e0e0e0", color: "#555" }}>形式</th>
                      <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, borderBottom: "1px solid #e0e0e0", color: "#555" }}>言語</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { file: "final_review.txt",      format: "テキスト形式", lang: "英語" },
                      { file: "final_review_jp.txt",   format: "テキスト形式", lang: "日本語" },
                      { file: "final_review.md",       format: "Markdown形式", lang: "英語" },
                      { file: "final_review_jp.md",    format: "Markdown形式", lang: "日本語" },
                      { file: "final_review.docx",     format: "Word形式",     lang: "英語" },
                      { file: "final_review_jp.docx",  format: "Word形式",     lang: "日本語" },
                    ].map((row) => (
                      <tr key={row.file} style={{ borderBottom: "1px solid #f0f0f0" }}>
                        <td style={{ padding: "5px 12px", fontFamily: "monospace", fontSize: 12, color: "#1b5e20" }}>{row.file}</td>
                        <td style={{ padding: "5px 12px", color: "#555" }}>{row.format}</td>
                        <td style={{ padding: "5px 12px", color: "#555" }}>{row.lang}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          ) : /* ── 査読コメント専用ビューアー ── */
          viewingComments ? (() => {
            const SOURCE_ORDER: CardSource[] = [
              "verdict", "general_impressions",
              "novelty_achievement", "check_structure", "check_expression",
              "check_methods_stats", "check_logic", "check_figure_table", "check_ethics",
            ];
            const groupMap = new Map<CardSource, CommentCard[]>();
            for (const card of commentCards) {
              const arr = groupMap.get(card.source) || [];
              arr.push(card);
              groupMap.set(card.source, arr);
            }
            const groupedCards = SOURCE_ORDER
              .filter(src => groupMap.has(src))
              .map(src => ({
                source: src,
                groupLabel: groupMap.get(src)![0].groupLabel,
                cards: groupMap.get(src)!,
              }));

            return (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              {/* Header */}
              <div style={{
                flexShrink: 0, display: "flex", gap: 8, alignItems: "center",
                marginBottom: 8, flexWrap: "wrap",
              }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  査読結果作成 — 査読コメント ({commentCards.length})
                </h3>
                <div style={{ flex: 1 }} />
                {/* Font size toggle */}
                <div style={{ display: "flex", gap: 2, border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
                  {([11, 13, 15] as const).map(size => (
                    <button key={size}
                      onClick={() => onViewerFontSizeChange(size)}
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
              </div>
              {/* Grouped cards */}
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {commentCards.length === 0 ? (
                  <div style={{ padding: 40, color: "#aaa", fontSize: "13px", textAlign: "center" }}>
                    まだ表示可能な査読データがありません。各チェックと採否決定を実行してください。
                  </div>
                ) : (
                  groupedCards.map((group) => (
                    <div key={group.source} style={{ marginBottom: 18 }}>
                      <div style={{
                        fontSize: 13, fontWeight: 700, color: "#333",
                        padding: "4px 0 8px 0",
                        borderBottom: "2px solid #1b5e20",
                        marginBottom: 10,
                      }}>
                        {group.groupLabel}
                        <span style={{ fontSize: 10, color: "#888", fontWeight: 400, marginLeft: 8 }}>
                          ({group.cards.length})
                        </span>
                      </div>
                      {group.cards.map((card) => {
                        const checked = commentCardChecked[card.key] !== false;
                        const hasJa = card.contentJa.trim().length > 0;
                        const isCheckFinding = card.source.startsWith("check_");
                        return (
                          <div
                            key={card.key}
                            style={{
                              marginBottom: 10,
                              border: `2px solid ${checked ? "#1b5e20" : "#e0e0e0"}`,
                              borderRadius: 8,
                              overflow: "hidden",
                              backgroundColor: checked ? "#e8f5e9" : "#fff",
                              transition: "border-color 0.15s, background-color 0.15s",
                            }}
                          >
                            {/* Card header with checkbox */}
                            <div style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 12px",
                              background: checked ? "#c8e6c9" : "#f5f5f5",
                              borderBottom: "1px solid #e0e0e0",
                            }}>
                              <label style={{
                                display: "flex", alignItems: "center", gap: 6,
                                cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#333",
                              }}>
                                <input type="checkbox" checked={checked}
                                  onChange={() => onToggleCommentCard(card.key)}
                                  style={{ width: 16, height: 16, cursor: "pointer" }} />
                                {card.cardLabel}
                              </label>
                              <span style={{ fontSize: 10, color: "#888", marginLeft: 4 }}>
                                {card.cardSubtitle}
                              </span>
                              {isCheckFinding && card.severity && (
                                <span style={{
                                  fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                                  background: card.severity === "major" ? "#c62828" : card.severity === "minor" ? "#f57f17" : "#666",
                                  color: "#fff",
                                }}>
                                  {card.severity.toUpperCase()}
                                </span>
                              )}
                              <span style={{ fontSize: 11, color: "#333", marginLeft: "auto" }}>
                                {checked ? "査読コメントに含まれる" : "査読コメントに含まれない"}
                              </span>
                            </div>
                            {/* 該当箇所 */}
                            {isCheckFinding && card.location?.text_excerpt && (
                              <div style={{
                                padding: "8px 12px 10px 12px",
                              }}>
                                <div style={{ fontSize: 10, fontWeight: 700, color: "#555", marginBottom: 4 }}>
                                  Excerpt
                                  {(() => {
                                    const section = card.location?.section;
                                    const pStart = card.location?.paragraph_start;
                                    const pEnd = card.location?.paragraph_end;
                                    // Extract comment_id from card key (format: "check_xxx::comment_id")
                                    const parts = card.key.split("::");
                                    const cid = parts.length >= 2 ? parts[1] : undefined;
                                    // Line number: prefer paragraph mapping, fall back to commentLineMap
                                    const lineStart = (pStart != null && paragraphLineMap[pStart] != null)
                                      ? paragraphLineMap[pStart]
                                      : (cid ? commentLineMap[cid] : undefined);
                                    const lineEnd = (pEnd != null && paragraphLineMap[pEnd] != null)
                                      ? paragraphLineMap[pEnd]
                                      : undefined;
                                    // Effective paragraph: prefer explicit paragraph_start, fall back to findingMatches
                                    const matchDetail = cid ? findingMatches[cid] : undefined;
                                    const effPStart = pStart ?? matchDetail?.paragraph ?? undefined;
                                    const locStr = formatParagraphLocation(section, effPStart, pEnd, sectionMap, lineStart, lineEnd);
                                    if (!locStr) return null;
                                    return (
                                      <span style={{ fontWeight: 400, color: "#888", marginLeft: 6 }}>
                                        {locStr}
                                      </span>
                                    );
                                  })()}
                                </div>
                                <div style={{
                                  fontSize: viewerFontSize,
                                  lineHeight: 1.6,
                                  color: "#333",
                                  background: "#fafafa",
                                  border: "1px solid #e0e0e0",
                                  borderRadius: 4,
                                  padding: "8px 10px",
                                  fontStyle: "italic",
                                }}>
                                  {card.isMeta ? card.location.text_excerpt : `"${card.location.text_excerpt}"`}
                                </div>
                              </div>
                            )}
                            {/* Card body: EN left / JA right */}
                            {hasJa ? (
                              <div style={{ display: "flex", gap: 8, padding: "10px 12px" }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Comment</div>
                                  <div className="novelty-md"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(card.contentEn) }}
                                    style={{
                                      padding: 10, background: "#f8f8f8", border: "1px solid #e0e0e0",
                                      borderRadius: 4, lineHeight: 1.6, fontSize: viewerFontSize,
                                    }} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>日本語</div>
                                  <div className="novelty-md"
                                    dangerouslySetInnerHTML={{ __html: renderMarkdown(card.contentJa) }}
                                    style={{
                                      padding: 10, background: "#fef9e7", border: "1px solid #e0e0e0",
                                      borderRadius: 4, lineHeight: 1.6, fontSize: viewerFontSize,
                                    }} />
                                </div>
                              </div>
                            ) : (
                              <div style={{ padding: "10px 12px" }}>
                                <div style={{ fontSize: 10, color: "#888", marginBottom: 4 }}>Comment</div>
                                <div className="novelty-md"
                                  dangerouslySetInnerHTML={{ __html: renderMarkdown(card.contentEn) }}
                                  style={{
                                    padding: 10, background: "#fafafa", border: "1px solid #e0e0e0",
                                    borderRadius: 4, lineHeight: 1.6, fontSize: viewerFontSize,
                                  }} />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </div>
            );
          })() : viewerMode === "candidates" && hasCandidates ? (
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
              {/* Toolbar: title + compose button */}
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 8,
                  flexShrink: 0,
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  査読結果作成 — 全体所感
                </h3>
                <div style={{ flex: 1 }} />
                {/* Font size toggle */}
                <div style={{ display: "flex", gap: 2, border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
                  {([11, 13, 15] as const).map(size => (
                    <button key={size}
                      onClick={() => onViewerFontSizeChange(size)}
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
                <button
                  onClick={onComposeAssessment}
                  disabled={!hasProject || assessmentComposeRunning || assessmentCandidatesRunning || selectedIds.length === 0}
                  style={{
                    fontWeight: 600,
                    background: assessmentComposeRunning ? "#ccc" : "#c62828",
                    color: "#fff",
                    border: "none",
                    padding: "4px 14px",
                    fontSize: "12px",
                  }}
                >
                  {assessmentComposeRunning
                    ? "作成中..."
                    : `全体所感作成`}
                </button>
                {assessmentComposeRunning && (
                  <button
                    onClick={onCancelCompose}
                    style={{
                      fontWeight: 600,
                      background: "#c62828",
                      color: "#fff",
                      border: "none",
                      padding: "4px 12px",
                      fontSize: "12px",
                    }}
                  >
                    取消
                  </button>
                )}
              </div>

              {/* Section tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 2,
                  marginBottom: 12,
                  paddingBottom: 8,
                  borderBottom: "2px solid #e0e0e0",
                  flexShrink: 0,
                }}
              >
                {SECTION_TABS.map((tab) => {
                  const isFreeTextTab = tab.key === "free_text";
                  const isCreatedResultTab = tab.key === "created_result";
                  const hasData = isFreeTextTab || isCreatedResultTab || (candidatesData && candidatesData.sections[tab.key] != null);
                  const tabCandidates = !isFreeTextTab && !isCreatedResultTab && candidatesData && candidatesData.sections[tab.key]
                    ? candidatesData.sections[tab.key].candidates : [];
                  const count = isFreeTextTab
                    ? (freeTextContent.trim() ? "✓" : "—")
                    : isCreatedResultTab
                    ? null
                    : tabCandidates.filter((c: { id: string }) => selectedIds.includes(c.id)).length;
                  const isCreated = isCreatedResultTab && resultFileContent && !resultFileContent.startsWith("(File not found");
                  const isActive = activeTab === tab.key;
                  const tabStyle: React.CSSProperties = {
                    padding: "6px 14px",
                    fontWeight: isActive ? 600 : 400,
                    border: "none",
                    borderRadius: "4px 4px 0 0",
                    cursor: hasData ? "pointer" : "default",
                    fontSize: "13px",
                  };
                  if (isCreatedResultTab) {
                    tabStyle.background = isActive ? "#c62828" : isCreated ? "#ffcdd2" : "#e0e0e0";
                    tabStyle.color = isActive ? "#fff" : isCreated ? "#b71c1c" : "#999";
                  } else {
                    tabStyle.background = isActive ? "#1b5e20" : hasData ? "#e8e8e8" : "#e0e0e0";
                    tabStyle.color = isActive ? "#fff" : hasData ? "#555" : "#999";
                  }
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      disabled={!hasData}
                      style={tabStyle}
                    >
                      {tab.label}{count !== null ? ` (${count})` : ""}
                    </button>
                  );
                })}
              </div>

              {/* ── Created result tab ── */}
              {isCreatedResult && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
                  {resultFileContent && !resultFileContent.startsWith("(File not found") ? (
                    <>
                      {/* Edit instruction block */}
                      <div style={{
                        flexShrink: 0, marginBottom: 8,
                        border: "1px solid #1b5e20", borderRadius: 6, overflow: "hidden",
                      }}>
                        <div style={{
                          background: "#1b5e20", color: "#fff",
                          padding: "5px 10px", fontSize: 11, fontWeight: 600,
                        }}>
                          指示による全体所感の編集
                        </div>
                        <div style={{ padding: "8px 10px" }}>
                          <div style={{
                            fontSize: "11px", color: "#2e7d32", marginBottom: 6, lineHeight: 1.5,
                            background: "#e8f5e9", padding: "6px 8px", borderRadius: 3,
                            fontWeight: 500,
                          }}>
                            ※ この機能は既存の全体所感の文章を指示に従って修正するものです。新しい情報を外部から取得することはできません。表現の調整、文章の並べ替え、文言の修正などにご利用ください。
                          </div>
                          <textarea
                            value={editInstruction}
                            onChange={(e) => onEditInstructionChange(e.target.value)}
                            placeholder="例: 新規性に関する記述をもっと強調してください / 全体的に肯定的なトーンに修正してください"
                            style={{
                              width: "100%", height: 60, fontSize: "12px",
                              lineHeight: 1.5, padding: 6, border: "1px solid #ccc",
                              borderRadius: 4, resize: "vertical", fontFamily: "inherit",
                              boxSizing: "border-box",
                            }}
                          />
                          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                            <button
                              onClick={onReflectEdit}
                              disabled={editReflectRunning || !editInstruction.trim()}
                              style={{
                                fontSize: "12px", height: "26px", padding: "2px 16px",
                                fontWeight: 600,
                                background: editReflectRunning ? "#ccc" : "#1b5e20",
                                color: "#fff", border: "none", borderRadius: 4,
                                cursor: "pointer",
                              }}
                            >
                              {editReflectRunning ? "反映中..." : "反映"}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Composed file viewer with 査読コメント checkbox */}
                      {(() => {
                        const giChecked = commentCardChecked["general_impressions::main"] !== false;
                        return (<>
                      <div style={{
                        flex: 1, marginTop: 4,
                        border: `2px solid ${giChecked ? "#1b5e20" : "#e0e0e0"}`,
                        borderRadius: 8, overflow: "hidden",
                        backgroundColor: giChecked ? "#e8f5e9" : "#fff",
                        transition: "border-color 0.15s, background-color 0.15s",
                        minHeight: 0, display: "flex", flexDirection: "column",
                      }}>
                        <div style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "8px 12px",
                          background: giChecked ? "#c8e6c9" : "#f5f5f5",
                          borderBottom: "1px solid #e0e0e0",
                          flexShrink: 0,
                        }}>
                          <label style={{
                            display: "flex", alignItems: "center", gap: 6,
                            cursor: "pointer", fontSize: "13px",
                            fontWeight: 700, color: "#333",
                          }}>
                            <input
                              type="checkbox"
                              checked={giChecked}
                              onChange={() => onToggleCommentCard("general_impressions::main")}
                              style={{ width: 16, height: 16, cursor: "pointer" }}
                            />
                            全体所感
                          </label>
                          <span style={{ fontSize: "10px", color: "#888", marginLeft: 4 }}>
                            General Impressions
                          </span>
                          <span style={{ fontSize: "11px", color: "#333", marginLeft: "auto" }}>
                            {giChecked ? "査読コメントに使用されます" : "査読コメントに使用されません"}
                          </span>
                        </div>
                        <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                          {hasResultJa && parsedResult ? (
                            <div style={{ display: "flex", gap: 6, padding: 8 }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: "9px", color: "#888", marginBottom: 3 }}>EN</div>
                                <div className="novelty-md"
                                  dangerouslySetInnerHTML={{ __html: renderMarkdown(parsedResult.en) }}
                                  style={{ padding: 8, background: "#f8f8f8", border: "1px solid #e0e0e0", borderRadius: 3, lineHeight: 1.5, fontSize: viewerFontSize }} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: "9px", color: "#888", marginBottom: 3 }}>日本語</div>
                                <div className="novelty-md"
                                  dangerouslySetInnerHTML={{ __html: renderMarkdown(parsedResult.ja) }}
                                  style={{ padding: 8, background: "#fef9e7", border: "1px solid #e0e0e0", borderRadius: 3, lineHeight: 1.5, fontSize: viewerFontSize }} />
                              </div>
                            </div>
                          ) : (
                            <div className="novelty-md"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(resultFileContent) }}
                              style={{ padding: 8, background: "#fafafa", lineHeight: 1.5, fontSize: viewerFontSize }} />
                          )}
                        </div>
                      </div>
                      </>)} )()}
                      </>
                  ) : (
                    <div style={{ padding: 40, color: "#aaa", fontSize: "13px", textAlign: "center" }}>
                      まだ全体所感が作成されていません。「全体所感」ボタンを押して作成してください。
                    </div>
                  )}
                </div>
              )}

              {/* ── Free text tab ── */}
              {isFreeText && (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  <div style={{
                    marginBottom: 8,
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#555",
                  }}>
                    自由記述 — 全体所感に含めたい任意の文章を入力してください
                  </div>
                  <textarea
                    value={freeTextContent}
                    onChange={(e) => onFreeTextChange(e.target.value)}
                    placeholder="ここに自由に記述してください..."
                    style={{
                      flex: 1,
                      minHeight: 200,
                      padding: 12,
                      fontSize: viewerFontSize,
                      lineHeight: 1.7,
                      border: "1px solid #ccc",
                      borderRadius: 6,
                      resize: "none",
                      fontFamily: "inherit",
                    }}
                  />
                </div>
              )}

              {/* Section header: title + toolbar */}
              {!isFreeText && section && (
                <div style={{
                  marginBottom: 12,
                  flexShrink: 0,
                  border: "1px solid #e0e0e0",
                  borderRadius: 8,
                  overflow: "hidden",
                }}>
                  {/* Title bar */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "8px 12px",
                    background: "#fafafa",
                    borderBottom: "1px solid #eee",
                  }}>
                    <span style={{
                      fontSize: "13px",
                      fontWeight: 700,
                      color: "#333",
                      letterSpacing: "0.01em",
                    }}>
                      {section.label_ja}
                    </span>
                    <span style={{
                      fontSize: "11px",
                      fontWeight: 400,
                      color: "#999",
                      marginLeft: 8,
                    }}>
                      {section.label_en}
                    </span>
                  </div>

                  {/* Toolbar body */}
                  <div style={{ padding: "10px 12px 8px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Row: 内容 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#666",
                        minWidth: 42,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}>内容</span>
                      <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>
                        {focusOptions.map((opt, i) => {
                          const active = currentFocus.includes(opt.key);
                          const total = focusOptions.length;
                          return (
                            <button
                              key={opt.key}
                              onClick={() => toggleFocus(opt.key)}
                              disabled={assessmentCandidatesRunning || assessmentComposeRunning}
                              style={{
                                padding: "4px 14px",
                                fontWeight: active ? 600 : 400,
                                background: active ? "#1565c0" : "#fff",
                                color: active ? "#fff" : "#666",
                                border: `1px solid ${active ? "#1565c0" : "#d0d0d0"}`,
                                borderRadius: i === 0 ? "5px 0 0 5px"
                                          : i === total - 1 ? "0 5px 5px 0"
                                          : "0",
                                cursor: "pointer",
                                fontSize: "12px",
                                transition: "all 0.12s",
                                marginLeft: i > 0 ? -1 : 0,
                                position: "relative" as const,
                                zIndex: active ? 1 : 0,
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Row: 論調 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        color: "#666",
                        minWidth: 42,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}>論調</span>
                      <div style={{ display: "flex", gap: 0 }}>
                        {toneOptions.map((opt, i) => {
                          const active = currentTone === opt.key;
                          return (
                            <button
                              key={opt.key}
                              onClick={() => setCurrentTone(opt.key)}
                              disabled={assessmentCandidatesRunning || assessmentComposeRunning}
                              style={{
                                padding: "4px 10px",
                                fontWeight: active ? 600 : 400,
                                background: active ? "#6a1b9a" : "#fff",
                                color: active ? "#fff" : "#666",
                                border: `1px solid ${active ? "#6a1b9a" : "#d0d0d0"}`,
                                borderRadius: i === 0 ? "5px 0 0 5px"
                                          : i === toneOptions.length - 1 ? "0 5px 5px 0"
                                          : "0",
                                cursor: "pointer",
                                fontSize: "11px",
                                transition: "all 0.12s",
                                marginLeft: i > 0 ? -1 : 0,
                                position: "relative" as const,
                                zIndex: active ? 1 : 0,
                              }}
                            >
                              {opt.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Row: 再生成 */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ minWidth: 42 }} />
                      <button
                        onClick={() => onRegenerateSection(activeTab, currentFocus, currentTone)}
                        disabled={!hasProject || assessmentCandidatesRunning || assessmentComposeRunning}
                        style={{
                          fontWeight: 600,
                          background: assessmentCandidatesRunning ? "#bbb" : "#1565c0",
                          color: "#fff",
                          border: "none",
                          padding: "5px 20px",
                          borderRadius: 5,
                          cursor: "pointer",
                          fontSize: "12px",
                          letterSpacing: "0.02em",
                          transition: "background 0.12s",
                        }}
                      >
                        {assessmentCandidatesRunning ? "生成中..." : "↻ 再生成"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Candidate list — EN left / JA right */}
              {!isFreeText && (
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                {sectionCandidates.length === 0 ? (
                  <div
                    style={{
                      padding: 40,
                      color: "#aaa",
                      fontSize: "13px",
                      textAlign: "center",
                    }}
                  >
                    このセクションには候補がありません。
                  </div>
                ) : (
                  sectionCandidates.map((candidate) => {
                    const isSelected = selectedSet.has(candidate.id);
                    return (
                      <div
                        key={candidate.id}
                        style={{
                          marginBottom: 12,
                          padding: 10,
                          border: `2px solid ${isSelected ? "#1b5e20" : "#e0e0e0"}`,
                          borderRadius: 6,
                          backgroundColor: isSelected ? "#e8f5e9" : "#fff",
                          transition: "border-color 0.15s, background-color 0.15s",
                        }}
                      >
                        {/* Header row: checkbox + badges */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginBottom: 8,
                            flexWrap: "wrap",
                          }}
                        >
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              cursor: "pointer",
                              fontSize: "13px",
                              fontWeight: 600,
                            }}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => onToggleCandidate(candidate.id)}
                              style={{ width: 16, height: 16, cursor: "pointer" }}
                            />
                          </label>
                          {candidate.style && (
                            <span
                              style={{
                                fontSize: "11px",
                                fontWeight: 600,
                                padding: "2px 8px",
                                borderRadius: 3,
                                backgroundColor: "#00695c",
                                color: "#fff",
                              }}
                            >
                              {candidate.style.ja}
                            </span>
                          )}
                          {candidate.source_check && (
                            <span
                              style={{
                                fontSize: "10px",
                                color: "#666",
                                fontFamily: "monospace",
                              }}
                            >
                              src: {candidate.source_check}
                              {candidate.source_comment_id && <> / {candidate.source_comment_id}</>}
                            </span>
                          )}
                          <div style={{ flex: 1 }} />
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteCandidate(candidate.id);
                            }}
                            disabled={assessmentCandidatesRunning || assessmentComposeRunning}
                            style={{
                              fontWeight: 500,
                              background: "#fff",
                              color: "#c62828",
                              border: "1px solid #ef9a9a",
                              padding: "3px 10px",
                              borderRadius: 4,
                              cursor: "pointer",
                              fontSize: "11px",
                              transition: "all 0.12s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.background = "#c62828";
                              e.currentTarget.style.color = "#fff";
                              e.currentTarget.style.borderColor = "#c62828";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.background = "#fff";
                              e.currentTarget.style.color = "#c62828";
                              e.currentTarget.style.borderColor = "#ef9a9a";
                            }}
                          >
                            削除
                          </button>
                        </div>

                        {/* EN left / JA right */}
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={enCol}>
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                color: "#888",
                                marginBottom: 3,
                                textTransform: "uppercase",
                              }}
                            >
                              English
                            </div>
                            <div
                              style={{
                                fontSize: viewerFontSize,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {candidate.text_en}
                            </div>
                          </div>
                          <div style={jaCol}>
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: 600,
                                color: "#888",
                                marginBottom: 3,
                                textTransform: "uppercase",
                              }}
                            >
                              日本語
                            </div>
                            <div
                              style={{
                                fontSize: viewerFontSize,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {candidate.text_ja}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              )}
            </div>
          ) : resultFileLoading ? (
            <div style={{ padding: 20, color: "#888", fontSize: "13px" }}>読込中...</div>
          ) : resultFileContent ? (
            <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
              {/* Header with file name + font size toggle + translate */}
              <div style={{
                flexShrink: 0, display: "flex", gap: 8, alignItems: "center",
                marginBottom: 8, flexWrap: "wrap",
              }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  査読結果作成 — {(() => {
                    const info = RESULT_FILE_LABELS[selectedResultFile];
                    return info ? info.label : selectedResultFile;
                  })()}
                </h3>
                <div style={{ flex: 1 }} />
                {/* Font size toggle */}
                <div style={{ display: "flex", gap: 2, border: "1px solid #ccc", borderRadius: 4, overflow: "hidden" }}>
                  {([11, 13, 15] as const).map(size => (
                    <button key={size}
                      onClick={() => onViewerFontSizeChange(size)}
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
                {!hasResultJa && (
                  <button
                    onClick={onTranslateResultFile}
                    disabled={resultFileTranslateLoading}
                    style={{ fontSize: "12px", height: "26px", padding: "2px 12px" }}
                  >
                    {resultFileTranslateLoading ? "翻訳中..." : "翻訳する"}
                  </button>
                )}
                {hasResultJa && (
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="status-chip ok" style={{ fontSize: "10px" }}>翻訳済</span>
                    <button
                      onClick={onTranslateResultFile}
                      disabled={resultFileTranslateLoading}
                      style={{ fontSize: "11px", height: "24px", padding: "1px 8px" }}
                    >
                      {resultFileTranslateLoading ? "翻訳中..." : "再翻訳"}
                    </button>
                  </div>
                )}
              </div>
              {/* Verdict generation — only for 採否決定 */}
              {selectedResultFile === "Review_comments.md" && (
                <div style={{
                  flexShrink: 0, marginBottom: 8,
                  border: "1px solid #1b5e20", borderRadius: 6, overflow: "hidden",
                }}>
                  <div style={{
                    background: "#1b5e20", color: "#fff",
                    padding: "5px 10px", fontSize: 11, fontWeight: 600,
                  }}>
                    採否決定の生成
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{
                      fontSize: "11px", color: "#2e7d32", marginBottom: 6, lineHeight: 1.5,
                      background: "#e8f5e9", padding: "6px 8px", borderRadius: 3,
                      fontWeight: 500,
                    }}>
                      ※ 査読チェック（構成・表現・方法統計・論理主張・図表・倫理利益相反）および
                      新規性評価の全結果を考慮し、Accept / Minor Revision / Major Revision / Reject の判定を生成します。
                    </div>
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                      <button
                        onClick={onGenerateVerdict}
                        disabled={verdictGenerating || verdictDetailGenerating}
                        style={{
                          fontSize: "12px", height: "26px", padding: "2px 16px",
                          fontWeight: 600,
                          background: verdictGenerating ? "#ccc" : "#1b5e20",
                          color: "#fff", border: "none", borderRadius: 4,
                          cursor: "pointer",
                        }}
                      >
                        {verdictGenerating ? "生成中..." : "採否確率の生成"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {/* Confidence distribution — interactive verdict selection */}
              {savedDist && (
                <div style={{
                  flexShrink: 0, marginBottom: 12,
                  border: `2px solid ${selectedVerdictChoice ? "#1b5e20" : "#1b5e20"}`, borderRadius: 8, overflow: "hidden",
                }}>
                  <div style={{
                    background: "#1b5e20", color: "#fff",
                    padding: "8px 12px",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, position: "absolute", left: 12 }}>
                      判定の選択
                    </div>
                    {selectedVerdictChoice && (
                      <div style={{
                        fontSize: 15, fontWeight: 800, color: "#1b5e20",
                        background: "#fff", borderRadius: 6,
                        padding: "4px 14px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                        letterSpacing: "0.02em",
                      }}>
                        Verdict: {selectedVerdictChoice}
                      </div>
                    )}
                  </div>
                  <div style={{ padding: "12px" }}>
                    {savedDist.map(({ verdict, percent }) => {
                      const isSelected = selectedVerdictChoice === verdict;
                      const barColor =
                        verdict === "Accept" ? "#2e7d32" :
                        verdict === "Minor Revision" ? "#1565c0" :
                        verdict === "Major Revision" ? "#e65100" :
                        "#c62828";
                      return (
                        <div
                          key={verdict}
                          onClick={() => {
                            setSelectedVerdictChoice(verdict);
                            onSelectVerdict(verdict);
                          }}
                          style={{
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "8px 10px", marginBottom: 6,
                            border: isSelected ? "2px solid #1b5e20" : "1px solid #e0e0e0",
                            borderRadius: 6,
                            cursor: "pointer", transition: "background 0.12s",
                            background: isSelected ? "#e8f5e9" : "#fff",
                          }}
                        >
                          <span style={{
                            fontSize: 13, fontWeight: 700, color: isSelected ? "#1b5e20" : "#333",
                            minWidth: 130,
                          }}>
                            {isSelected ? "✓ " : ""}{verdict}
                          </span>
                          <div style={{
                            flex: 1, height: 22, background: "#f0f0f0",
                            borderRadius: 4, overflow: "hidden",
                          }}>
                            <div style={{
                              height: "100%", width: `${percent}%`,
                              background: barColor, borderRadius: 4,
                              display: "flex", alignItems: "center",
                              justifyContent: "flex-end",
                              paddingRight: percent > 15 ? 8 : 0,
                              transition: "width 0.4s ease",
                            }}>
                              {percent > 15 && (
                                <span style={{
                                  fontSize: 10, fontWeight: 700, color: "#fff",
                                }}>{percent}%</span>
                              )}
                            </div>
                          </div>
                          {percent <= 15 && (
                            <span style={{
                              fontSize: 11, fontWeight: 600, color: "#666",
                              minWidth: 32, textAlign: "right",
                            }}>{percent}%</span>
                          )}
                        </div>
                      );
                    })}
                    <div style={{
                      marginTop: 6, display: "flex", justifyContent: "center",
                    }}>
                      {selectedVerdictChoice ? (
                        <button
                          onClick={onGenerateVerdictDetail}
                          disabled={verdictGenerating || verdictDetailGenerating}
                          style={{
                            fontSize: "12px", height: "26px", padding: "2px 16px",
                            fontWeight: 600,
                            background: verdictDetailGenerating ? "#ccc" : "#1565c0",
                            color: "#fff", border: "none", borderRadius: 4,
                            cursor: "pointer",
                          }}
                        >
                          {verdictDetailGenerating ? "生成中..." : "理由等を生成"}
                        </button>
                      ) : (
                        <span style={{ fontSize: 10, color: "#888" }}>
                          クリックで判定を確定します。確定後に「理由等を生成」で続けてください。
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Content: card view for 採否決定, or EN/JA columns for others */}
              {verdictCards.length > 0 ? (() => {
                const renderVerdictCard = (card: typeof verdictCards[number]) => {
                  const checked = commentCardChecked[card.key] !== false;
                  const hasJa = card.contentJa.trim().length > 0;
                  return (
                    <div
                      key={card.key}
                      style={{
                        marginBottom: 12,
                        border: `2px solid ${checked ? "#1b5e20" : "#e0e0e0"}`,
                        borderRadius: 8,
                        overflow: "hidden",
                        backgroundColor: checked ? "#e8f5e9" : "#fff",
                        transition: "border-color 0.15s, background-color 0.15s",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "8px 12px",
                          background: checked ? "#c8e6c9" : "#f5f5f5",
                          borderBottom: "1px solid #e0e0e0",
                        }}
                      >
                        <label
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 700,
                            color: "#333",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleCommentCard(card.key)}
                            style={{ width: 16, height: 16, cursor: "pointer" }}
                          />
                          {card.cardLabel}
                        </label>
                        <span style={{ fontSize: "10px", color: "#888", marginLeft: 4 }}>
                          {card.cardSubtitle}
                        </span>
                        <span style={{ fontSize: "11px", color: "#333", marginLeft: "auto" }}>
                          {checked ? "査読コメントに使用されます" : "査読コメントに使用されません"}
                        </span>
                      </div>
                      {hasJa ? (
                        <div style={{ display: "flex", gap: 8, padding: "10px 12px" }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "10px", color: "#888", marginBottom: 4 }}>EN</div>
                            <div className="novelty-md"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(card.contentEn) }}
                              style={{ padding: 10, background: "#f8f8f8", border: "1px solid #e0e0e0", borderRadius: 4, lineHeight: 1.6, fontSize: viewerFontSize }}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "10px", color: "#888", marginBottom: 4 }}>日本語</div>
                            <div className="novelty-md"
                              dangerouslySetInnerHTML={{ __html: renderMarkdown(card.contentJa) }}
                              style={{ padding: 10, background: "#fef9e7", border: "1px solid #e0e0e0", borderRadius: 4, lineHeight: 1.6, fontSize: viewerFontSize }}
                            />
                          </div>
                        </div>
                      ) : (
                        <div style={{ padding: "10px 12px" }}>
                          <div className="novelty-md"
                            dangerouslySetInnerHTML={{ __html: renderMarkdown(card.contentEn) }}
                            style={{ padding: 10, background: "#fafafa", border: "1px solid #e0e0e0", borderRadius: 4, lineHeight: 1.6, fontSize: viewerFontSize }}
                          />
                        </div>
                      )}
                    </div>
                  );
                };
                return (<>
                {/* 判定 card is hidden — verdict is shown in the distribution block header */}
                {/* ── 採否決定の編集 ── */}
                {selectedResultFile === "Review_comments.md" && (
                  <div style={{
                    flexShrink: 0, marginBottom: 12,
                    border: "1px solid #1b5e20", borderRadius: 6, overflow: "hidden",
                  }}>
                    <div
                      onClick={() => setShowVerdictEdit(!showVerdictEdit)}
                      style={{
                        background: "#1b5e20", color: "#fff",
                        padding: "5px 10px", fontSize: 11, fontWeight: 600,
                        cursor: "pointer", display: "flex", alignItems: "center", gap: 4,
                        userSelect: "none",
                      }}
                    >
                      {showVerdictEdit ? "▾" : "▸"} 採否理由等の編集
                    </div>
                    {showVerdictEdit && (
                      <div style={{ padding: "8px 10px" }}>
                        <div style={{
                          fontSize: "11px", color: "#2e7d32", marginBottom: 6, lineHeight: 1.5,
                          background: "#e8f5e9", padding: "6px 8px", borderRadius: 3,
                          fontWeight: 500,
                        }}>
                          ※ 査読チェック全セクションの結果を参照して、Reasoning / Key Strengths / Key Concerns を修正します。Verdict（判定）は変更されません。
                        </div>
                        <textarea
                          value={verdictEditInstruction}
                          onChange={(e) => onVerdictEditInstructionChange(e.target.value)}
                          placeholder="例: 論理・主張の問題をより重視してReasoningを修正 / Key Concernsに表現の問題を追加 / Key Strengthsをより具体的に"
                          style={{
                            width: "100%", height: 60, fontSize: "12px",
                            lineHeight: 1.5, padding: 6, border: "1px solid #ccc",
                            borderRadius: 4, resize: "vertical", fontFamily: "inherit",
                            boxSizing: "border-box",
                          }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                          <button
                            onClick={onVerdictEdit}
                            disabled={verdictEditRunning || !verdictEditInstruction.trim()}
                            style={{
                              fontSize: "12px", height: "26px", padding: "2px 16px",
                              fontWeight: 600,
                              background: verdictEditRunning ? "#ccc" : "#1b5e20",
                              color: "#fff", border: "none", borderRadius: 4,
                              cursor: "pointer",
                            }}
                          >
                            {verdictEditRunning ? "反映中..." : "反映"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {/* 理由・強み・懸念 (判定 card is hidden — verdict shown in distribution block header) */}
                {verdictCardsForDetail.length > 0 && (
                  <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>
                    {verdictCardsForDetail.map(card => renderVerdictCard(card))}
                  </div>
                )}
                </>);
              })() : hasResultJa && parsedResult ? (
                <div style={{ display: "flex", gap: 8, flex: 1, minHeight: 0 }}>
                  <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
                    <div style={{ fontSize: "10px", color: "#888", marginBottom: 4 }}>EN</div>
                    <div
                      className="novelty-md"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(parsedResult.en) }}
                      style={{
                        padding: 12, background: "#f8f8f8", border: "1px solid #e0e0e0",
                        borderRadius: 4, lineHeight: 1.6, fontSize: viewerFontSize,
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, overflowY: "auto" }}>
                    <div style={{ fontSize: "10px", color: "#888", marginBottom: 4 }}>日本語</div>
                    <div
                      className="novelty-md"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(parsedResult.ja) }}
                      style={{
                        padding: 12, background: "#fef9e7", border: "1px solid #e0e0e0",
                        borderRadius: 4, lineHeight: 1.6, fontSize: viewerFontSize,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div
                  className="novelty-md"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(resultFileContent) }}
                  style={{
                    fontSize: viewerFontSize,
                    lineHeight: 1.6,
                    flex: 1,
                    overflowY: "auto",
                    background: "#fafafa",
                    border: "1px solid #e0e0e0",
                    borderRadius: 6,
                    padding: 12,
                  }}
                />
              )}
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 16,
                padding: 40,
                minHeight: 200,
              }}
            >
              {/* Empty-state toolbar */}
              <div style={{
                border: "1px solid #e0e0e0",
                borderRadius: 8,
                overflow: "hidden",
                width: "100%",
                maxWidth: 480,
              }}>
                <div style={{
                  padding: "14px 16px",
                  background: "#fafafa",
                  borderBottom: "1px solid #eee",
                  textAlign: "center",
                }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "#555" }}>
                    全体所感の候補を生成
                  </span>
                </div>
                <div style={{
                  padding: "14px 16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                }}>
                  {/* 内容 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{
                      fontSize: "11px", fontWeight: 600, color: "#666",
                      minWidth: 42, textTransform: "uppercase", letterSpacing: "0.04em",
                    }}>内容</span>
                    <div style={{ display: "flex", gap: 0, flexWrap: "wrap" }}>
                      {focusOptions.map((opt, i) => {
                        const active = currentFocus.includes(opt.key);
                        return (
                          <button
                            key={opt.key}
                            onClick={() => toggleFocus(opt.key)}
                            disabled={assessmentCandidatesRunning}
                            style={{
                              padding: "5px 16px",
                              fontWeight: active ? 600 : 400,
                              background: active ? "#1565c0" : "#fff",
                              color: active ? "#fff" : "#666",
                              border: `1px solid ${active ? "#1565c0" : "#d0d0d0"}`,
                              borderRadius: i === 0 ? "5px 0 0 5px"
                                        : i === focusOptions.length - 1 ? "0 5px 5px 0"
                                        : "0",
                              cursor: "pointer",
                              fontSize: "12px",
                              transition: "all 0.12s",
                              marginLeft: i > 0 ? -1 : 0,
                              position: "relative" as const,
                              zIndex: active ? 1 : 0,
                            }}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Generate */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, paddingTop: 4 }}>
                    <span style={{ minWidth: 42 }} />
                    <button
                      onClick={() => onGenerateCandidates("standard")}
                      disabled={!hasProject || assessmentCandidatesRunning}
                      style={{
                        fontWeight: 600,
                        background: assessmentCandidatesRunning ? "#bbb" : "#1b5e20",
                        color: "#fff",
                        border: "none",
                        padding: "6px 24px",
                        borderRadius: 5,
                        cursor: "pointer",
                        fontSize: "13px",
                        transition: "background 0.12s",
                      }}
                    >
                      {assessmentCandidatesRunning ? "候補生成中..." : "候補を生成"}
                    </button>
                    {assessmentCandidatesRunning && (
                      <button
                        onClick={onCancelCandidates}
                        style={{
                          fontWeight: 600,
                          background: "#c62828",
                          color: "#fff",
                          border: "none",
                          padding: "6px 16px",
                          borderRadius: 5,
                          cursor: "pointer",
                          fontSize: "13px",
                        }}
                      >
                        取消
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
