import { useState, useEffect } from "react";
import { slotDisplayName } from "../slotLabels";
import type { JournalProfile } from "./JournalPanel";
import DeepResearchModal, { type DeepResearchEntry } from "./DeepResearchModal";

/* ── Expanded LlmSlot ───────────────────────────────────────────────── */

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
  enabled?: boolean;
}

/* ── Props ───────────────────────────────────────────────────────────── */

interface NoveltyCheckPanelProps {
  projectPath: string;
  sectionsDone: boolean;
  viewerDataReady: boolean;
  llmSlots: LlmSlot[];
  // Journal (replaces target journal input)
  journalProfile: JournalProfile;
  journalLoaded: boolean;
  // Phase 1: Paper summary
  noveltySummaryDone: boolean;
  noveltySummaryRunning: boolean;
  noveltySummaryContent: string;
  onNoveltySummarize: (slotName: string) => void;
  // Phase 2: Deep Research prompts
  noveltyPromptBroad: string;
  noveltyPromptCritical: string;
  noveltyPromptDone: boolean;
  onNoveltyDeepResearchPrompt: () => void;
  // Phase 3: Deep Research results (A/B)
  noveltyDrA: DeepResearchEntry;
  noveltyDrB: DeepResearchEntry;
  noveltyDrSaved: boolean;
  onSaveDeepResearch: (slot: "A" | "B", data: DeepResearchEntry) => void;
  // Phase 4: Merge
  noveltyMergeDone: boolean;
  noveltyMergeRunning: boolean;
  noveltyMergeContent: string;
  onNoveltyMerge: (slotName: string) => void;
  // Phase 5: Assessment
  noveltyAssessDone: boolean;
  noveltyAssessRunning: boolean;
  noveltyAssessmentContent: string;
  onNoveltyAssess: (slotName: string) => void;
  // Nav
  onNavigateToSettings: () => void;
  statusMessage: { text: string; type: "ok" | "error" | "info" } | null;
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

type OpStatus = "unrun" | "running" | "done";

function StatusChip({ status, label }: { status: OpStatus; label?: string }) {
  const labels: Record<OpStatus, string> = {
    unrun: "未実行",
    running: "実行中...",
    done: "完了",
  };
  return (
    <span className={`status-chip ${status === "running" ? "running" : status === "done" ? "ok" : "unrun"}`}>
      {label || labels[status]}
    </span>
  );
}

/** 新規性チェックで使用する Pro / reasoning モデル名を取得。
 *  proModel が設定されていればそれを、なければ model を fallback する。
 *  flashModel は新規性チェックでは使わない。 */
function getProModelName(s: LlmSlot): string {
  return (s.proModel || s.model || "").trim();
}

/** 新規性チェック用の Pro モデル必須のスロット設定判定。
 *
 *  - 通常 model や flashModel は必須にしない
 *  - apiKeyMode === "env_var" なら apiKeyEnvName があれば OK
 *  - apiKeyStorage === "windows_hello" なら apiKey 空でも OK
 */
function isSlotConfiguredForPro(s: LlmSlot): boolean {
  if (!s) return false;
  if (s.enabled === false) return false;

  if (!s.provider?.trim()) return false;
  if (!s.baseUrl?.trim()) return false;

  // 新規性チェックでは Pro / reasoning を使う。通常 model や flashModel は必須にしない。
  if (!getProModelName(s)) return false;

  if (s.apiKeyMode === "direct") {
    if (s.apiKeyStorage === "windows_hello") return true;
    return !!s.apiKey?.trim();
  }

  if (s.apiKeyMode === "env_var") {
    return !!s.apiKeyEnvName?.trim();
  }

  return true;
}

/** スロットの未設定理由を具体的な日本語メッセージで返す。 */
function getProSlotDisabledReason(slot?: LlmSlot): string | null {
  if (!slot) {
    return "統括AIスロットが見つかりません。API設定で統括AIを有効にしてください。";
  }

  if (slot.enabled === false) {
    return "統括AIスロットが無効です。API設定で統括AIを有効にしてください。";
  }

  if (!slot.provider?.trim()) {
    return "統括AIのプロバイダが未設定です。API設定でプロバイダを設定してください。";
  }

  if (!slot.baseUrl?.trim()) {
    return "統括AIのAPI URLが未設定です。API設定でBase URLを設定してください。";
  }

  if (!getProModelName(slot)) {
    return "統括AIのPro / reasoningモデル名が未設定です。API設定でProモデルを設定してください。";
  }

  if (slot.apiKeyMode === "direct" && slot.apiKeyStorage !== "windows_hello" && !slot.apiKey?.trim()) {
    return "統括AIのAPIキーが未入力です。API設定で直接入力または環境変数を指定してください。";
  }

  if (slot.apiKeyMode === "env_var" && !slot.apiKeyEnvName?.trim()) {
    return "統括AIのAPIキー環境変数名が未設定です。API設定で環境変数名を指定してください。";
  }

  return null;
}

function charCount(text: string): string {
  return text.length.toLocaleString();
}

/* ── Novelty labels ──────────────────────────────────────────────────── */

const noveltyLabels: Record<string, string> = {
  novelty_theme: "テーマ",
  novelty_sample: "対象・サンプル",
  novelty_methods: "方法・介入",
  novelty_statistics: "統計解析",
  novelty_data_rarity: "データの希少性",
  novelty_practical_significance: "実践的・臨床的意義",
};

/* ── Journal evaluation axis summary ─────────────────────────────────── */

function journalAxisSummary(jp: JournalProfile): string {
  const pc = jp.publication_criteria;
  if (!pc) return "未取得";

  if (pc.technical_soundness_focus === "true") {
    return "技術的健全性重視（新規性より方法論的厳密さ・再現性を重視）";
  }
  if (pc.novelty_required === "high") {
    return "テーマ新規性重視（高い新規性・インパクトが求められる）";
  }
  if (pc.novelty_required === "moderate") {
    return "中程度の新規性が求められる";
  }
  if (pc.novelty_required === "low" || pc.novelty_required === "not_explicitly_required") {
    return "新規性不問または低要求（技術的健全性が主な評価基準）";
  }

  // Fallback: summarize from available fields
  const parts: string[] = [];
  if (pc.technical_soundness_focus === "true") parts.push("技術的健全性重視");
  if (pc.methodological_rigour_focus === "true") parts.push("方法論的厳密さ重視");
  if (pc.statistical_rigour_focus === "true") parts.push("統計的厳密さ重視");
  if (pc.novelty_required === "high") parts.push("高い新規性要求");
  if (parts.length > 0) return parts.join("・");
  return "特性未取得（ジャーナルタブで再取得を推奨）";
}

function journalEvalStrategy(jp: JournalProfile): string {
  const pc = jp.publication_criteria;
  if (!pc) return "未取得";

  if (pc.technical_soundness_focus === "true") {
    return "科学的妥当性、方法論的厳密さ、統計の適切さ、結論がデータで支持されているか、過小評価された対象・文脈での知見を評価します。";
  }
  if (pc.novelty_required === "high") {
    return "テーマの新規性、理論的貢献、臨床的・社会的インパクト、国際的な広範な関心を評価します。";
  }
  return "ジャーナル特性に応じた評価を行います。";
}

/* ═══════════════════════════════════════════════════════════════════════
   Main Component
   ═══════════════════════════════════════════════════════════════════════ */

export default function NoveltyCheckPanel({
  projectPath,
  sectionsDone,
  viewerDataReady,
  llmSlots,
  journalProfile,
  journalLoaded,
  noveltySummaryDone,
  noveltySummaryRunning,
  noveltySummaryContent,
  onNoveltySummarize,
  noveltyPromptBroad,
  noveltyPromptCritical,
  noveltyPromptDone,
  onNoveltyDeepResearchPrompt,
  noveltyDrA,
  noveltyDrB,
  noveltyDrSaved,
  onSaveDeepResearch,
  noveltyMergeDone,
  noveltyMergeRunning,
  noveltyMergeContent,
  onNoveltyMerge,
  noveltyAssessDone,
  noveltyAssessRunning,
  noveltyAssessmentContent,
  onNoveltyAssess,
  onNavigateToSettings,
  statusMessage,
}: NoveltyCheckPanelProps) {
  const [selectedSlot, setSelectedSlot] = useState("summary");

  // Visibility toggles
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [promptBroadVisible, setPromptBroadVisible] = useState(false);
  const [promptCriticalVisible, setPromptCriticalVisible] = useState(false);
  const [mergeVisible, setMergeVisible] = useState(false);
  const [assessmentVisible, setAssessmentVisible] = useState(false);

  // Copy feedback
  const [copyBroadFeedback, setCopyBroadFeedback] = useState(false);
  const [copyCriticalFeedback, setCopyCriticalFeedback] = useState(false);

  // Modal state
  const [modalSlot, setModalSlot] = useState<"A" | "B" | null>(null);

  // ── Slots ──────────────────────────────────────────────────────────
  // 統括AI (summary) スロットを探す。なければ有効な全スロットから。
  const summarySlot = llmSlots.find(
    (s) => s.name === "summary" && s.enabled !== false
  );
  const availableSlots = summarySlot
    ? [summarySlot]
    : llmSlots.filter((s) => s.enabled !== false);

  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.find(s => s.name === selectedSlot)) {
      setSelectedSlot(availableSlots[0].name);
    }
  }, [availableSlots, selectedSlot]);

  const summaryConfigured = isSlotConfiguredForPro(summarySlot || availableSlots[0]);
  const slotDisabledReason = getProSlotDisabledReason(summarySlot || availableSlots[0]);
  const proModelName = summarySlot ? getProModelName(summarySlot) : "";

  // DR entry count
  const drCount = (noveltyDrA.text.trim() ? 1 : 0) + (noveltyDrB.text.trim() ? 1 : 0);

  // ── Status computation ─────────────────────────────────────────────
  const summaryStatus: OpStatus = noveltySummaryRunning ? "running"
    : noveltySummaryDone ? "done" : "unrun";
  const promptStatus: OpStatus = noveltyPromptDone ? "done" : "unrun";
  const mergeStatus: OpStatus = noveltyMergeRunning ? "running"
    : noveltyMergeDone ? "done" : "unrun";
  const assessStatus: OpStatus = noveltyAssessRunning ? "running"
    : noveltyAssessDone ? "done" : "unrun";

  // ── Copy helpers ───────────────────────────────────────────────────
  const copyToClipboard = async (text: string, setFeedback: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback(true);
      setTimeout(() => setFeedback(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setFeedback(true);
      setTimeout(() => setFeedback(false), 2000);
    }
  };

  // ── Parse summary JSON ─────────────────────────────────────────────
  let summaryObj: Record<string, unknown> | null = null;
  if (noveltySummaryContent) {
    try {
      summaryObj = JSON.parse(noveltySummaryContent);
    } catch { summaryObj = null; }
  }

  // ── Rendering ──────────────────────────────────────────────────────
  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <section className="panel">
        <h2>新規性チェック</h2>
        <p style={{ fontSize: 12, color: "#888", marginTop: 0 }}>
          投稿予定論文の新規性を多角的に評価し、投稿予定雑誌との適合性を確認します。
          Deep Research は外部で実行し、結果を貼り付けてください。
        </p>

        {/* ── Journal info bar ── */}
        <div style={{
          marginTop: 12, padding: 10, background: "#f0f7ff",
          border: "1px solid #cce0ff", borderRadius: 4, fontSize: 12,
        }}>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 4 }}>
            <span>
              <strong>対象ジャーナル：</strong>
              {journalProfile.journal_name || "未取得"}
            </span>
            <span>
              <strong>ジャーナル情報：</strong>
              <span style={{
                color: journalLoaded ? "#107c10" : "#e67e22",
                fontWeight: 600,
              }}>
                {journalLoaded ? "取得済み" : "未取得"}
              </span>
            </span>
          </div>
          <div style={{ marginBottom: 3 }}>
            <strong>ジャーナル特性：</strong> {journalAxisSummary(journalProfile)}
          </div>
          <div>
            <strong>評価方針：</strong> {journalEvalStrategy(journalProfile)}
          </div>
          {!journalLoaded && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#c42b1c" }}>
              先にジャーナルタブで「ジャーナル情報を取得・取り込む」を実行してください。
            </div>
          )}
          {journalLoaded && !journalSavedWarning(journalProfile) && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#e67e22" }}>
              ジャーナル特性が十分に取得できていません。ジャーナルタブで再取得してください。
            </div>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 1: Paper Summary
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>1. 論文概要の生成</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          論文本文から、研究テーマ・目的・方法・結果・新規性候補をAIが抽出します。
        </p>

        {summaryConfigured && proModelName && (
          <div style={{
            fontSize: 11, color: "#107c10", marginBottom: 8,
            padding: "3px 10px", background: "#e8f5e9",
            borderRadius: 3, display: "inline-block",
          }}>
            使用モデル：統括AI Pro / reasoning（{proModelName}）
          </div>
        )}

        <div className="row">
          {availableSlots.length > 1 && (
            <select
              className="citation-ai-select"
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              disabled={noveltySummaryRunning}
            >
              {availableSlots.map((s) => (
                <option key={s.name} value={s.name}>{slotDisplayName(s.name)}</option>
              ))}
            </select>
          )}
          <button
            className="citation-primary-btn"
            onClick={() => onNoveltySummarize(selectedSlot)}
            disabled={!sectionsDone || noveltySummaryRunning || !summaryConfigured}
          >
            {noveltySummaryRunning ? "生成中..." : "論文概要を生成"}
          </button>
          <StatusChip status={summaryStatus} />
        </div>

        {!sectionsDone && !noveltySummaryRunning && (
          <div className="disabled-reason">
            論文本文がまだ読み込まれていません。先に本文解析を実行してください。
          </div>
        )}
        {sectionsDone && !summaryConfigured && !noveltySummaryRunning && slotDisabledReason && (
          <div className="disabled-reason">{slotDisabledReason}</div>
        )}

        {noveltySummaryDone && summaryObj && (
          <div style={{ marginTop: 12 }}>
            <button
              className="clear-btn"
              style={{ fontSize: 11 }}
              onClick={() => setSummaryVisible(!summaryVisible)}
            >
              {summaryVisible ? "▲ 概要を隠す" : "▼ 概要を表示"}
            </button>
            {summaryVisible && (
              <div style={{
                marginTop: 8, padding: 12,
                background: "#f8f8f8", border: "1px solid #e0e0e0",
                borderRadius: 4, fontSize: 12, maxHeight: 400, overflowY: "auto",
              }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>研究テーマ:</strong> {String(summaryObj.research_topic || "—")}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>研究目的:</strong> {String(summaryObj.objective || "—")}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>対象・サンプル:</strong> {String(summaryObj.sample_summary || "—")}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>研究デザイン:</strong> {String(summaryObj.design || "—")}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>方法:</strong> {String(summaryObj.methods_summary || "—")}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>使用尺度:</strong> {String(summaryObj.measures || "—")}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>統計解析:</strong> {String(summaryObj.statistics || "—")}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>主な結果:</strong> {String(summaryObj.findings || "—")}
                </div>
                <div style={{ marginBottom: 8 }}>
                  <strong>著者が主張する貢献:</strong> {String(summaryObj.claimed_contributions || "—")}
                </div>

                <div style={{ marginTop: 12, borderTop: "1px solid #ddd", paddingTop: 8 }}>
                  <strong>新規性候補:</strong>
                </div>
                {Object.entries(noveltyLabels).map(([key, label]) => {
                  const val = summaryObj![key];
                  if (!val || String(val).includes("特段の新規性は認められない")) return null;
                  return (
                    <div key={key} style={{ marginBottom: 4, paddingLeft: 8 }}>
                      <strong>{label}:</strong> {String(val)}
                    </div>
                  );
                })}

                {Array.isArray(summaryObj.keywords_for_search) && summaryObj.keywords_for_search.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <strong>検索キーワード:</strong>{" "}
                    {(summaryObj.keywords_for_search as string[]).join(", ")}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 2: Deep Research Prompts (Broad + Critical)
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>2. Deep Research プロンプト</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          2種類のプロンプト（広範囲探索用 + 批判的検証用）を生成します。それぞれ別のAIで実行することを推奨します。
        </p>

        <div className="row">
          <button
            className="citation-primary-btn"
            onClick={onNoveltyDeepResearchPrompt}
            disabled={!noveltySummaryDone}
          >
            Deep Researchプロンプトを生成
          </button>
          <StatusChip status={promptStatus} />
        </div>
        {!noveltySummaryDone && (
          <div className="disabled-reason">先に論文概要を生成してください</div>
        )}

        {noveltyPromptDone && (
          <div style={{ marginTop: 12 }}>
            {/* Broad prompt */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <button
                  className="clear-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => setPromptBroadVisible(!promptBroadVisible)}
                >
                  {promptBroadVisible ? "▲" : "▼"} 広範囲探索用プロンプト
                </button>
                <button
                  className="citation-advanced-btn"
                  onClick={() => copyToClipboard(noveltyPromptBroad, setCopyBroadFeedback)}
                  style={{ fontSize: 11 }}
                >
                  {copyBroadFeedback ? "コピーしました!" : "コピー"}
                </button>
                <span style={{ fontSize: 10, color: "#888" }}>
                  {charCount(noveltyPromptBroad)} 字
                </span>
              </div>
              {promptBroadVisible && (
                <textarea
                  readOnly
                  className="text-input"
                  value={noveltyPromptBroad}
                  style={{
                    width: "100%", height: 200, fontSize: 11,
                    fontFamily: "monospace", resize: "vertical",
                  }}
                />
              )}
            </div>

            {/* Critical prompt */}
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <button
                  className="clear-btn"
                  style={{ fontSize: 11 }}
                  onClick={() => setPromptCriticalVisible(!promptCriticalVisible)}
                >
                  {promptCriticalVisible ? "▲" : "▼"} 批判的検証用プロンプト
                </button>
                <button
                  className="citation-advanced-btn"
                  onClick={() => copyToClipboard(noveltyPromptCritical, setCopyCriticalFeedback)}
                  style={{ fontSize: 11 }}
                >
                  {copyCriticalFeedback ? "コピーしました!" : "コピー"}
                </button>
                <span style={{ fontSize: 10, color: "#888" }}>
                  {charCount(noveltyPromptCritical)} 字
                </span>
              </div>
              {promptCriticalVisible && (
                <textarea
                  readOnly
                  className="text-input"
                  value={noveltyPromptCritical}
                  style={{
                    width: "100%", height: 200, fontSize: 11,
                    fontFamily: "monospace", resize: "vertical",
                  }}
                />
              )}
            </div>
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 3: Deep Research Results (A/B) + Modal
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>3. Deep Research 結果</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          それぞれのプロンプトを外部AIで実行し、結果を貼り付けてください。
        </p>

        {/* Result A */}
        <div style={{
          padding: 10, border: "1px solid #e0e0e0", borderRadius: 4,
          marginBottom: 8, background: "#fafafa",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>結果A（広範囲探索）</strong>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: noveltyDrA.text.trim() ? "#107c10" : "#888",
            }}>
              {noveltyDrA.text.trim() ? "入力済み" : "未入力"}
            </span>
            {noveltyDrA.source_name && (
              <span style={{ fontSize: 11, color: "#555" }}>
                外部AI: {noveltyDrA.source_name}
              </span>
            )}
            {noveltyDrA.text.trim() && (
              <span style={{ fontSize: 10, color: "#888" }}>
                {charCount(noveltyDrA.text)} 字
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              className="citation-advanced-btn"
              style={{ fontSize: 11 }}
              onClick={() => setModalSlot("A")}
            >
              結果Aを貼り付け・編集
            </button>
          </div>
        </div>

        {/* Result B */}
        <div style={{
          padding: 10, border: "1px solid #e0e0e0", borderRadius: 4,
          background: "#fafafa",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <strong style={{ fontSize: 13 }}>結果B（批判的検証）</strong>
            <span style={{
              fontSize: 11, fontWeight: 600,
              color: noveltyDrB.text.trim() ? "#107c10" : "#888",
            }}>
              {noveltyDrB.text.trim() ? "入力済み" : "未入力"}
            </span>
            {noveltyDrB.source_name && (
              <span style={{ fontSize: 11, color: "#555" }}>
                外部AI: {noveltyDrB.source_name}
              </span>
            )}
            {noveltyDrB.text.trim() && (
              <span style={{ fontSize: 10, color: "#888" }}>
                {charCount(noveltyDrB.text)} 字
              </span>
            )}
            <div style={{ flex: 1 }} />
            <button
              className="citation-advanced-btn"
              style={{ fontSize: 11 }}
              onClick={() => setModalSlot("B")}
            >
              結果Bを貼り付け・編集
            </button>
          </div>
        </div>

        {noveltyDrSaved && (
          <span className="status-chip ok" style={{ marginTop: 8, display: "inline-block" }}>保存済</span>
        )}

        {/* Modal */}
        {modalSlot && (
          <DeepResearchModal
            title={modalSlot === "A" ? "結果A（広範囲探索）" : "結果B（批判的検証）"}
            initialData={modalSlot === "A" ? noveltyDrA : noveltyDrB}
            onSave={(data) => {
              onSaveDeepResearch(modalSlot, data);
              setModalSlot(null);
            }}
            onClose={() => setModalSlot(null)}
          />
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 4: Deep Research Merge
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>4. Deep Research 統合</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          2つの外部調査結果をAIが比較・統合し、一致点・相違点・要確認情報・新規性判断に使える根拠を整理します。
        </p>

        <div className="row">
          {availableSlots.length > 1 && (
            <select
              className="citation-ai-select"
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              disabled={noveltyMergeRunning}
            >
              {availableSlots.map((s) => (
                <option key={s.name} value={s.name}>{slotDisplayName(s.name)}</option>
              ))}
            </select>
          )}
          <button
            className="citation-primary-btn"
            onClick={() => onNoveltyMerge(selectedSlot)}
            disabled={!noveltyDrSaved || noveltyMergeRunning || !summaryConfigured}
          >
            {noveltyMergeRunning ? "統合中..." : "2つの結果を統合・比較する"}
          </button>
          <StatusChip status={mergeStatus} />
        </div>

        {!noveltyDrSaved && !noveltyMergeRunning && (
          <div className="disabled-reason">先にDeep Research結果AとBを保存してください</div>
        )}
        {noveltyDrSaved && !summaryConfigured && !noveltyMergeRunning && slotDisabledReason && (
          <div className="disabled-reason">{slotDisabledReason}</div>
        )}
        {noveltyDrSaved && drCount === 1 && (
          <div style={{ fontSize: 11, color: "#e67e22", marginTop: 4 }}>
            1つの外部調査結果に基づく暫定統合です。可能であれば別のAIでもう1本実行してください。
          </div>
        )}

        {noveltyMergeDone && noveltyMergeContent && (
          <div style={{ marginTop: 12 }}>
            <button
              className="clear-btn"
              style={{ fontSize: 11 }}
              onClick={() => setMergeVisible(!mergeVisible)}
            >
              {mergeVisible ? "▲ 統合結果を隠す" : "▼ 統合結果を表示"}
            </button>
            {mergeVisible && (
              <div style={{
                marginTop: 8, padding: 12,
                background: "#f8f8f8", border: "1px solid #e0e0e0",
                borderRadius: 4, fontSize: 12, maxHeight: 500, overflowY: "auto",
                whiteSpace: "pre-wrap", fontFamily: "system-ui, sans-serif", lineHeight: 1.6,
              }}>
                {noveltyMergeContent}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 5: Novelty Assessment (Journal-aware)
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>5. 新規性・適合性評価</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          統合された外部調査結果とジャーナル特性に基づき、AIが新規性と雑誌適合性を評価します。
        </p>

        <div className="row">
          {availableSlots.length > 1 && (
            <select
              className="citation-ai-select"
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              disabled={noveltyAssessRunning}
            >
              {availableSlots.map((s) => (
                <option key={s.name} value={s.name}>{slotDisplayName(s.name)}</option>
              ))}
            </select>
          )}
          <button
            className="citation-primary-btn"
            onClick={() => onNoveltyAssess(selectedSlot)}
            disabled={!noveltyMergeDone || noveltyAssessRunning || !summaryConfigured}
          >
            {noveltyAssessRunning ? "評価中..." : "新規性を評価する"}
          </button>
          <StatusChip status={assessStatus} />
        </div>

        {!noveltyMergeDone && !noveltyAssessRunning && (
          <div className="disabled-reason">先にDeep Research統合を実行してください</div>
        )}
        {noveltyMergeDone && !summaryConfigured && !noveltyAssessRunning && slotDisabledReason && (
          <div className="disabled-reason">{slotDisabledReason}</div>
        )}
        {!journalLoaded && noveltyMergeDone && !noveltyAssessRunning && (
          <div style={{ fontSize: 11, color: "#e67e22", marginTop: 4 }}>
            ジャーナル情報が未取得です。ジャーナル適合性評価は暫定になります。
          </div>
        )}
        {drCount === 0 && noveltyMergeDone && (
          <div style={{ fontSize: 11, color: "#e67e22", marginTop: 4 }}>
            外部調査結果なしの暫定評価として実行します。
          </div>
        )}

        {noveltyAssessDone && noveltyAssessmentContent && (
          <div style={{ marginTop: 12 }}>
            <button
              className="clear-btn"
              style={{ fontSize: 11 }}
              onClick={() => setAssessmentVisible(!assessmentVisible)}
            >
              {assessmentVisible ? "▲ 評価を隠す" : "▼ 評価を表示"}
            </button>
            {assessmentVisible && (
              <div style={{
                marginTop: 8, padding: 12,
                background: "#f8f8f8", border: "1px solid #e0e0e0",
                borderRadius: 4, fontSize: 12, maxHeight: 500, overflowY: "auto",
                whiteSpace: "pre-wrap", fontFamily: "system-ui, sans-serif", lineHeight: 1.6,
              }}>
                {noveltyAssessmentContent}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Next step guidance */}
      <div className="next-step">
        {!sectionsDone && "次: 「前処理」メニューからセクション分割までを実行してください"}
        {sectionsDone && !noveltySummaryDone && "次: 論文概要を生成してください"}
        {noveltySummaryDone && !noveltyPromptDone && "次: Deep Researchプロンプトを生成し、外部で実行してください"}
        {noveltyPromptDone && !noveltyDrSaved && "次: Deep Research結果A・Bを貼り付けて保存してください"}
        {noveltyDrSaved && !noveltyMergeDone && "次: Deep Research統合を実行してください"}
        {noveltyMergeDone && !noveltyAssessDone && "次: （任意）新規性・適合性評価を実行してください"}
        {noveltyAssessDone && "新規性チェック完了。Deep Research統合結果を「査読チェック」で参照してください。"}
      </div>
    </div>
  );
}

/** Check if journal profile has sufficient evaluation fields populated (not all unknown). */
function journalSavedWarning(jp: JournalProfile): boolean {
  const pc = jp.publication_criteria;
  if (!pc) return false;
  // If ALL evaluation fields are "unknown", profile might be insufficient
  const fields = [
    pc.novelty_required, pc.impact_required, pc.significance_required,
    pc.technical_soundness_focus, pc.methodological_rigour_focus,
    pc.statistical_rigour_focus, pc.conclusion_supported_by_data_focus,
    pc.ethical_robustness_focus, pc.data_availability_focus,
    pc.reproducibility_transparency_focus,
  ];
  const knownCount = fields.filter((f) => f !== "unknown").length;
  return knownCount >= 3;
}
