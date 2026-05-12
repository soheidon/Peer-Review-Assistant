import { useState, useEffect } from "react";
import { slotDisplayName } from "../slotLabels";

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled?: boolean;
}

interface NoveltyCheckPanelProps {
  projectPath: string;
  sectionsDone: boolean;
  viewerDataReady: boolean;
  llmSlots: LlmSlot[];
  // Journal
  noveltyTargetJournal: string;
  onTargetJournalChange: (value: string) => void;
  // Phase 1: Paper summary
  noveltySummaryDone: boolean;
  noveltySummaryRunning: boolean;
  noveltySummaryContent: string;
  onNoveltySummarize: (slotName: string) => void;
  // Phase 2: Deep Research prompt
  noveltyDeepResearchPrompt: string;
  noveltyDeepResearchDone: boolean;
  onNoveltyDeepResearchPrompt: () => void;
  // Phase 3: Deep Research input
  noveltyDeepResearchInput: string;
  noveltyDeepResearchSaved: boolean;
  onDeepResearchInputChange: (value: string) => void;
  onSaveDeepResearchInput: () => void;
  // Phase 4: Assessment
  noveltyAssessDone: boolean;
  noveltyAssessRunning: boolean;
  noveltyAssessmentContent: string;
  onNoveltyAssess: (slotName: string) => void;
  // Phase 5: Review comment
  noveltyCommentDone: boolean;
  noveltyCommentRunning: boolean;
  noveltyCommentContent: string;
  onNoveltyReviewComment: (slotName: string) => void;
  // Nav
  onNavigateToSettings: () => void;
  statusMessage: { text: string; type: "ok" | "error" | "info" } | null;
}

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

export default function NoveltyCheckPanel({
  projectPath,
  sectionsDone,
  viewerDataReady,
  llmSlots,
  noveltyTargetJournal,
  onTargetJournalChange,
  noveltySummaryDone,
  noveltySummaryRunning,
  noveltySummaryContent,
  onNoveltySummarize,
  noveltyDeepResearchPrompt,
  noveltyDeepResearchDone,
  onNoveltyDeepResearchPrompt,
  noveltyDeepResearchInput,
  noveltyDeepResearchSaved,
  onDeepResearchInputChange,
  onSaveDeepResearchInput,
  noveltyAssessDone,
  noveltyAssessRunning,
  noveltyAssessmentContent,
  onNoveltyAssess,
  noveltyCommentDone,
  noveltyCommentRunning,
  noveltyCommentContent,
  onNoveltyReviewComment,
  onNavigateToSettings,
  statusMessage,
}: NoveltyCheckPanelProps) {
  const [selectedSlot, setSelectedSlot] = useState("summary");
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [assessmentVisible, setAssessmentVisible] = useState(false);
  const [commentVisible, setCommentVisible] = useState(false);

  // Select the first available summary-type slot by default
  const summarySlots = llmSlots.filter(
    (s) => s.name === "summary" && s.enabled !== false && s.provider.trim()
  );
  const availableSlots = summarySlots.length > 0
    ? summarySlots
    : llmSlots.filter((s) => s.enabled !== false && s.provider.trim());

  useEffect(() => {
    if (availableSlots.length > 0 && !availableSlots.find(s => s.name === selectedSlot)) {
      setSelectedSlot(availableSlots[0].name);
    }
  }, [availableSlots, selectedSlot]);

  const summaryConfigured = availableSlots.length > 0 && availableSlots.every(
    (s) => s.provider.trim() && s.baseUrl.trim() && s.model.trim() && s.apiKey.trim()
  );

  // Status computation
  const summaryStatus: OpStatus = noveltySummaryRunning ? "running"
    : noveltySummaryDone ? "done" : "unrun";
  const promptStatus: OpStatus = noveltyDeepResearchDone ? "done" : "unrun";
  const assessStatus: OpStatus = noveltyAssessRunning ? "running"
    : noveltyAssessDone ? "done" : "unrun";
  const commentStatus: OpStatus = noveltyCommentRunning ? "running"
    : noveltyCommentDone ? "done" : "unrun";

  // Parse summary JSON for display
  let summaryObj: Record<string, unknown> | null = null;
  if (noveltySummaryContent) {
    try {
      summaryObj = JSON.parse(noveltySummaryContent);
    } catch {
      summaryObj = null;
    }
  }

  // Copy prompt to clipboard
  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(noveltyDeepResearchPrompt);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = noveltyDeepResearchPrompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  // Novelty angle labels
  const noveltyLabels: Record<string, string> = {
    novelty_theme: "テーマ",
    novelty_sample: "対象・サンプル",
    novelty_methods: "方法・介入",
    novelty_statistics: "統計解析",
    novelty_data_rarity: "データの希少性",
    novelty_practical_significance: "実践的・臨床的意義",
  };

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

        {/* ── Target Journal ── */}
        <div className="row" style={{ marginTop: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, minWidth: 120 }}>
            投稿先ジャーナル:
          </label>
          <input
            type="text"
            className="text-input"
            value={noveltyTargetJournal}
            onChange={(e) => onTargetJournalChange(e.target.value)}
            placeholder="投稿予定の雑誌名を入力（任意）"
            style={{ flex: 1, maxWidth: 400 }}
          />
        </div>
        {!noveltyTargetJournal.trim() && (
          <div style={{ fontSize: 11, color: "#e67e22", margin: "4px 0 0 124px" }}>
            入力推奨: 未入力の場合、雑誌適合性評価は保留されます
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 1: Paper Summary
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>1. 論文概要の生成</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          論文本文から、研究テーマ・目的・方法・結果・新規性候補をAIが抽出します。
        </p>

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
          <div className="disabled-reason">先に前処理メニューからセクション分割までを実行してください</div>
        )}
        {!summaryConfigured && sectionsDone && !noveltySummaryRunning && (
          <div className="disabled-reason">
            <button onClick={onNavigateToSettings} className="clear-btn" style={{ fontSize: 11 }}>
              API設定
            </button>
            でLLMスロットを設定してください
          </div>
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
                marginTop: 8,
                padding: 12,
                background: "#f8f8f8",
                border: "1px solid #e0e0e0",
                borderRadius: 4,
                fontSize: 12,
                maxHeight: 400,
                overflowY: "auto",
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
                  const val = summaryObj[key];
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
          Phase 2: Deep Research Prompt
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>2. Deep Research プロンプト</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          以下のプロンプトをコピーし、ChatGPT/Gemini の Deep Research で実行してください。
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

        {noveltyDeepResearchPrompt && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
              <button
                className="citation-advanced-btn"
                onClick={handleCopyPrompt}
              >
                {copyFeedback ? "コピーしました!" : "プロンプトをコピー"}
              </button>
              <span style={{ fontSize: 11, color: "#888" }}>
                {noveltyDeepResearchPrompt.length.toLocaleString()} 文字
              </span>
            </div>
            <textarea
              readOnly
              className="text-input"
              value={noveltyDeepResearchPrompt}
              style={{
                width: "100%",
                height: 300,
                fontSize: 11,
                fontFamily: "monospace",
                resize: "vertical",
              }}
            />
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 3: Deep Research Results
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>3. Deep Research 結果の貼り付け</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          ChatGPT/Gemini の Deep Research 結果をここに貼り付けて保存してください。
        </p>

        <textarea
          className="text-input"
          value={noveltyDeepResearchInput}
          onChange={(e) => onDeepResearchInputChange(e.target.value)}
          placeholder="Deep Research の結果をここに貼り付けてください..."
          style={{
            width: "100%",
            height: 200,
            fontSize: 12,
            resize: "vertical",
          }}
        />
        <div style={{ marginTop: 8 }}>
          <button
            className="citation-primary-btn"
            onClick={onSaveDeepResearchInput}
            disabled={!noveltyDeepResearchInput.trim()}
          >
            保存
          </button>
          {noveltyDeepResearchSaved && (
            <span className="status-chip ok" style={{ marginLeft: 8 }}>保存済</span>
          )}
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 4: Assessment
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>4. 新規性の評価</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          Deep Research 結果に基づき、AIが新規性と雑誌適合性を評価します。
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
            disabled={!noveltyDeepResearchSaved || noveltyAssessRunning || !summaryConfigured}
          >
            {noveltyAssessRunning ? "評価中..." : "新規性を評価する"}
          </button>
          <StatusChip status={assessStatus} />
        </div>
        {!noveltyDeepResearchSaved && !noveltyAssessRunning && (
          <div className="disabled-reason">先にDeep Research結果を貼り付けて保存してください</div>
        )}
        {!summaryConfigured && noveltyDeepResearchSaved && !noveltyAssessRunning && (
          <div className="disabled-reason">
            <button onClick={onNavigateToSettings} className="clear-btn" style={{ fontSize: 11 }}>API設定</button>
            でLLMスロットを設定してください
          </div>
        )}
        {!noveltyTargetJournal.trim() && noveltyDeepResearchSaved && !noveltyAssessRunning && (
          <div style={{ fontSize: 11, color: "#e67e22", marginTop: 4 }}>
            投稿先ジャーナル未入力のため、雑誌適合性評価は保留されます
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
                marginTop: 8,
                padding: 12,
                background: "#f8f8f8",
                border: "1px solid #e0e0e0",
                borderRadius: 4,
                fontSize: 12,
                maxHeight: 500,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                fontFamily: "system-ui, sans-serif",
                lineHeight: 1.6,
              }}>
                {noveltyAssessmentContent}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ════════════════════════════════════════════════════════════════
          Phase 5: Review Comment
          ════════════════════════════════════════════════════════════════ */}
      <section className="panel">
        <h3>5. 最終査読コメント用の新規性説明</h3>
        <p style={{ fontSize: 11, color: "#888", marginTop: 0 }}>
          査読レポートの「新規性と既存研究との重複」セクションに使える文章を生成します（日本語・英語）。
        </p>

        <div className="row">
          {availableSlots.length > 1 && (
            <select
              className="citation-ai-select"
              value={selectedSlot}
              onChange={(e) => setSelectedSlot(e.target.value)}
              disabled={noveltyCommentRunning}
            >
              {availableSlots.map((s) => (
                <option key={s.name} value={s.name}>{slotDisplayName(s.name)}</option>
              ))}
            </select>
          )}
          <button
            className="citation-primary-btn"
            onClick={() => onNoveltyReviewComment(selectedSlot)}
            disabled={!noveltyAssessDone || noveltyCommentRunning || !summaryConfigured}
          >
            {noveltyCommentRunning ? "生成中..." : "最終査読コメント用の新規性説明を生成"}
          </button>
          <StatusChip status={commentStatus} />
        </div>
        {!noveltyAssessDone && !noveltyCommentRunning && (
          <div className="disabled-reason">先に新規性評価を実行してください</div>
        )}

        {noveltyCommentDone && noveltyCommentContent && (
          <div style={{ marginTop: 12 }}>
            <button
              className="clear-btn"
              style={{ fontSize: 11 }}
              onClick={() => setCommentVisible(!commentVisible)}
            >
              {commentVisible ? "▲ 説明を隠す" : "▼ 説明を表示"}
            </button>
            {commentVisible && (
              <div style={{
                marginTop: 8,
                padding: 12,
                background: "#f8f8f8",
                border: "1px solid #e0e0e0",
                borderRadius: 4,
                fontSize: 12,
                maxHeight: 500,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                fontFamily: "system-ui, sans-serif",
                lineHeight: 1.6,
              }}>
                {noveltyCommentContent}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Next step guidance */}
      <div className="next-step">
        {!sectionsDone && "次: 「前処理」メニューからセクション分割までを実行してください"}
        {sectionsDone && !noveltySummaryDone && "次: 論文概要を生成してください"}
        {noveltySummaryDone && !noveltyDeepResearchDone && "次: Deep Researchプロンプトを生成し、外部で実行してください"}
        {noveltyDeepResearchDone && !noveltyDeepResearchSaved && "次: Deep Research結果を貼り付けて保存してください"}
        {noveltyDeepResearchSaved && !noveltyAssessDone && "次: 新規性を評価する を実行してください"}
        {noveltyAssessDone && !noveltyCommentDone && "次: 最終査読コメント用の新規性説明を生成してください"}
        {noveltyCommentDone && "新規性チェック完了。「査読チェック」メニューに進んでください"}
      </div>
    </div>
  );
}
