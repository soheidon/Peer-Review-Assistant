import { useState, useEffect } from "react";
import ReferencesReviewViewer from "../ReferencesReviewViewer";
import { slotDisplayName } from "../slotLabels";

interface CitationReviewPanelProps {
  projectPath: string;
  crossrefDone: boolean;
  viewerDataReady: boolean;
  viewerDataGenerating: boolean;
  viewerDataVersion: number;
  onViewerData: () => void;
  llmRepairDone: boolean;
  llmRepairGenerating: boolean;
  onLlmRepair: (slotName: string) => void;
  llmSlots: { name: string; provider: string; model: string; apiKey: string; apiKeyMode?: string; apiKeyEnvName?: string; enabled?: boolean }[];
  googleBooksDone: boolean;
  googleBooksGenerating: boolean;
  googleBooksCandidateCount?: number;
  googleBooksEnabled: boolean;
  onGoogleBooks: () => void;
  llmFlagsDone: boolean;
  llmFlagsGenerating: boolean;
  onGenerateLlmFlags: (slotName: string) => void;
  llmReferenceProcessRunning: boolean;
  onLlmReferenceProcess: (slotName: string) => void;
  onUnmatchedExport: () => void;
  unmatchedExportGenerating: boolean;
  searchReferencesDone: boolean;
  searchReferencesGenerating: boolean;
  onSearchReferences: (slotName: string) => void;
  onOpenSearchLog: () => void;
  cniiDone: boolean;
  cniiRunning: boolean;
  cniiEnabled: boolean;
  onCiniiDb: () => void;
  semanticScholarDone: boolean;
  semanticScholarRunning: boolean;
  semanticScholarEnabled: boolean;
  onSemanticScholarDb: () => void;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
}

type OpStatus = "unrun" | "running" | "done" | "stale" | "error";

function StatusChip({ status, label }: { status: OpStatus; label?: string }) {
  const labels: Record<OpStatus, string> = {
    unrun: "未実行",
    running: "実行中...",
    done: "完了",
    stale: "要更新",
    error: "エラー",
  };
  return (
    <span className={`citation-status-chip citation-status-${status}`}>
      {label || labels[status]}
    </span>
  );
}

export default function CitationReviewPanel({
  projectPath,
  crossrefDone,
  viewerDataReady,
  viewerDataGenerating,
  viewerDataVersion,
  onViewerData,
  llmRepairDone,
  llmRepairGenerating,
  onLlmRepair,
  llmSlots,
  googleBooksDone,
  googleBooksGenerating,
  googleBooksCandidateCount,
  googleBooksEnabled,
  onGoogleBooks,
  llmFlagsDone,
  llmFlagsGenerating,
  onGenerateLlmFlags,
  llmReferenceProcessRunning,
  onLlmReferenceProcess,
  onUnmatchedExport,
  unmatchedExportGenerating,
  searchReferencesDone,
  searchReferencesGenerating,
  onSearchReferences,
  onOpenSearchLog,
  cniiDone,
  cniiRunning,
  cniiEnabled,
  onCiniiDb,
  semanticScholarDone,
  semanticScholarRunning,
  semanticScholarEnabled,
  onSemanticScholarDb,
  statusMessage,
}: CitationReviewPanelProps) {
  const [suspiciousCount, setSuspiciousCount] = useState<number>(0);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedAiSlot, setSelectedAiSlot] = useState<string>("");

  const reviewerSlots = llmSlots.filter(
    s => s.name.startsWith("reviewer") && s.enabled !== false && s.provider.trim()
  );

  // Auto-select first available reviewer slot
  useEffect(() => {
    if (!selectedAiSlot && reviewerSlots.length > 0) {
      setSelectedAiSlot(reviewerSlots[0].name);
    }
  }, [reviewerSlots, selectedAiSlot]);

  useEffect(() => {
    if (!viewerDataReady || !projectPath) {
      setSuspiciousCount(0);
      return;
    }
    const loadCount = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const path = `${projectPath.replace(/\\/g, "/")}/outputs/citation_viewer_data.json`;
        const raw = await invoke<string>("read_text_file", { path });
        const data = JSON.parse(raw);
        setSuspiciousCount(data.summary?.suspicious ?? data.tabs?.suspicious?.length ?? 0);
      } catch {
        setSuspiciousCount(0);
      }
    };
    loadCount();
  }, [viewerDataReady, projectPath]);

  // ── Compute statuses ─────────────────────────────────────────────────
  const viewerDataStatus: OpStatus = viewerDataGenerating
    ? "running" : viewerDataReady ? "done" : "unrun";

  const llmProcessDone = llmRepairDone && llmFlagsDone;
  const llmProcessStatus: OpStatus = llmReferenceProcessRunning
    ? "running" : llmProcessDone ? "done" : "unrun";

  const googleBooksStatus: OpStatus = googleBooksGenerating
    ? "running" : googleBooksDone ? "done" : "unrun";

  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      {viewerDataReady && suspiciousCount > 0 && (
        <div className="suspicious-alert">
          ⚠️ 要確認の文献が {suspiciousCount} 件あります
        </div>
      )}

      <section className="panel viewer-panel">
        <h2>文献確認</h2>

        {/* ════════════════════════════════════════════════════════════════
            1. 文献確認データを作成・更新
            ════════════════════════════════════════════════════════════════ */}
        <div className="citation-main-row">
          <button
            className="citation-primary-btn"
            onClick={onViewerData}
            disabled={!crossrefDone || viewerDataGenerating}
          >
            {viewerDataGenerating ? "作成中..." : "文献確認データを作成・更新"}
          </button>
          <StatusChip status={viewerDataStatus} />
        </div>
        {!crossrefDone && !viewerDataGenerating && (
          <div className="disabled-reason">先に前処理メニューから Crossref照合 を実行してください</div>
        )}
        {crossrefDone && viewerDataStatus === "done" && (
          <div style={{ fontSize: 11, color: "#888", margin: "2px 0 0 2px" }}>
            文献確認データ作成済み
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            2. LLMで文献情報を整理
            ════════════════════════════════════════════════════════════════ */}
        {crossrefDone && (
          <div className="citation-main-row" style={{ marginTop: 16 }}>
            <div className="citation-llm-process-block">
              <div className="citation-llm-process-header">
                <span className="citation-llm-process-title">LLMで文献情報を整理</span>
                {reviewerSlots.length > 0 && (
                  <select
                    className="citation-ai-select"
                    value={selectedAiSlot}
                    onChange={(e) => setSelectedAiSlot(e.target.value)}
                    disabled={llmReferenceProcessRunning}
                  >
                    {reviewerSlots.map(s => (
                      <option key={s.name} value={s.name}>
                        {slotDisplayName(s.name)}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  className="citation-primary-btn"
                  onClick={() => onLlmReferenceProcess(selectedAiSlot)}
                  disabled={!selectedAiSlot || llmReferenceProcessRunning}
                >
                  {llmReferenceProcessRunning ? "処理中..." : "LLMで文献情報を整理"}
                </button>
                <StatusChip status={llmProcessStatus} />
              </div>
              <div className="citation-llm-process-desc">
                原稿中の文献情報を著者・年・タイトル・雑誌名・DOI等に分解し、DOI欠落、書籍、政府文書、Web文書、後段LLM確認が必要な文献を判定します。人間が既に判断した内容があれば自動的に反映します。
              </div>
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            3. 文献確認画面を開く (inline viewer)
            ════════════════════════════════════════════════════════════════ */}
        {viewerDataReady && (
          <ReferencesReviewViewer key={viewerDataVersion} projectPath={projectPath} llmSlots={llmSlots} />
        )}
        {!viewerDataReady && !viewerDataGenerating && crossrefDone && (
          <p style={{ color: "#999", fontSize: "12px", marginTop: 12 }}>
            文献データベース照合完了後、「文献確認データを作成・更新」をクリックしてください。
          </p>
        )}

        {/* ════════════════════════════════════════════════════════════════
            詳細操作 (collapsed by default)
            ════════════════════════════════════════════════════════════════ */}
        {crossrefDone && (
          <div className="citation-advanced-section">
            <button
              className="citation-advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? "▲ 詳細操作を隠す" : "▼ 詳細操作"}
            </button>

            {showAdvanced && (
              <div className="citation-advanced-body">
                <div className="citation-advanced-note">
                  通常は操作不要です。開発・トラブルシュート用です。
                </div>

                {/* LLM文献再パースのみ */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">LLM文献再パースのみ:</span>
                  {reviewerSlots.length > 0 ? (
                    <>
                      <select
                        className="citation-ai-select citation-ai-select-sm"
                        value={selectedAiSlot}
                        onChange={(e) => setSelectedAiSlot(e.target.value)}
                        disabled={llmRepairGenerating || llmReferenceProcessRunning}
                      >
                        {reviewerSlots.map(s => (
                          <option key={s.name} value={s.name}>{slotDisplayName(s.name)}</option>
                        ))}
                      </select>
                      <button
                        className="citation-advanced-btn"
                        onClick={() => onLlmRepair(selectedAiSlot)}
                        disabled={llmRepairGenerating || llmReferenceProcessRunning}
                      >
                        {llmRepairGenerating ? "再パース中..." : "実行"}
                      </button>
                      <StatusChip status={llmRepairDone ? "done" : "unrun"} />
                    </>
                  ) : (
                    <span className="citation-advanced-na">評価AIが設定されていません</span>
                  )}
                </div>

                {/* LLM文献フラグ生成のみ */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">LLM文献フラグ生成のみ:</span>
                  {reviewerSlots.length > 0 ? (
                    <>
                      <select
                        className="citation-ai-select citation-ai-select-sm"
                        value={selectedAiSlot}
                        onChange={(e) => setSelectedAiSlot(e.target.value)}
                        disabled={llmFlagsGenerating || llmReferenceProcessRunning}
                      >
                        {reviewerSlots.map(s => (
                          <option key={s.name} value={s.name}>{slotDisplayName(s.name)}</option>
                        ))}
                      </select>
                      <button
                        className="citation-advanced-btn"
                        onClick={() => onGenerateLlmFlags(selectedAiSlot)}
                        disabled={llmFlagsGenerating || llmReferenceProcessRunning}
                      >
                        {llmFlagsGenerating ? "フラグ生成中..." : "実行"}
                      </button>
                      <StatusChip status={llmFlagsDone ? "done" : "unrun"} />
                    </>
                  ) : (
                    <span className="citation-advanced-na">評価AIが設定されていません</span>
                  )}
                </div>

                {/* 文献確認データを再作成 */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">文献確認データを再作成:</span>
                  <button
                    className="citation-advanced-btn"
                    onClick={onViewerData}
                    disabled={viewerDataGenerating}
                  >
                    {viewerDataGenerating ? "再作成中..." : "実行"}
                  </button>
                  <StatusChip status={viewerDataStatus} />
                </div>

                {/* 中間JSONを再読み込み */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">中間JSONを再読み込み:</span>
                  <button
                    className="citation-advanced-btn"
                    onClick={onViewerData}
                    disabled={viewerDataGenerating}
                  >
                    再読み込み
                  </button>
                </div>

                {/* 未照合文献をCSV出力 */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">未照合文献をCSV出力:</span>
                  <button
                    className="citation-advanced-btn"
                    onClick={onUnmatchedExport}
                    disabled={unmatchedExportGenerating}
                  >
                    {unmatchedExportGenerating ? "出力中..." : "実行"}
                  </button>
                </div>

                {/* LLM文献検索 */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">LLM文献検索:</span>
                  {reviewerSlots.length > 0 ? (
                    <>
                      <select
                        className="citation-ai-select citation-ai-select-sm"
                        value={selectedAiSlot}
                        onChange={(e) => setSelectedAiSlot(e.target.value)}
                        disabled={searchReferencesGenerating || llmReferenceProcessRunning}
                      >
                        {reviewerSlots.map(s => (
                          <option key={s.name} value={s.name}>{slotDisplayName(s.name)}</option>
                        ))}
                      </select>
                      <button
                        className="citation-advanced-btn"
                        onClick={() => onSearchReferences(selectedAiSlot)}
                        disabled={searchReferencesGenerating || llmReferenceProcessRunning}
                      >
                        {searchReferencesGenerating ? "検索中..." : "実行"}
                      </button>
                      <StatusChip status={searchReferencesDone ? "done" : "unrun"} />
                    </>
                  ) : (
                    <span className="citation-advanced-na">評価AIが設定されていません</span>
                  )}
                </div>

                {/* LLM検索ログを開く */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">LLM検索ログ:</span>
                  <button
                    className="citation-advanced-btn"
                    onClick={onOpenSearchLog}
                  >
                    ログを開く
                  </button>
                </div>

                {/* Semantic Scholar */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">Semantic Scholar照合:</span>
                  <button
                    className="citation-advanced-btn"
                    onClick={onSemanticScholarDb}
                    disabled={!semanticScholarEnabled || semanticScholarRunning}
                  >
                    {semanticScholarRunning ? "照合中..." : "実行"}
                  </button>
                  <StatusChip status={semanticScholarDone ? "done" : "unrun"} />
                  {!semanticScholarEnabled && (
                    <span className="citation-advanced-na">Semantic Scholar APIキーが未設定</span>
                  )}
                </div>

                {/* CiNii Research (Japanese papers) */}
                <div className="citation-advanced-row">
                  <span className="citation-advanced-label">CiNii論文照合:</span>
                  <button
                    className="citation-advanced-btn"
                    onClick={onCiniiDb}
                    disabled={!cniiEnabled || cniiRunning}
                  >
                    {cniiRunning ? "照合中..." : "実行"}
                  </button>
                  <StatusChip status={cniiDone ? "done" : "unrun"} />
                  {!cniiEnabled && (
                    <span className="citation-advanced-na">CiNii API appidが未設定</span>
                  )}
                </div>

                {/* Google Books */}
                {googleBooksEnabled && (
                  <div className="citation-advanced-row">
                    <span className="citation-advanced-label">Google Books 書籍候補検索:</span>
                    <button
                      className="citation-advanced-btn"
                      onClick={onGoogleBooks}
                      disabled={googleBooksGenerating || !llmRepairDone}
                    >
                      {googleBooksGenerating ? "検索中..." : "実行"}
                    </button>
                    <StatusChip
                      status={googleBooksStatus}
                      label={googleBooksDone && googleBooksCandidateCount != null
                        ? `取得済 (${googleBooksCandidateCount}件)` : undefined}
                    />
                    {!llmRepairDone && !googleBooksGenerating && (
                      <span style={{ fontSize: 10, color: "#999", marginLeft: 6 }}>
                        先にLLM文献再パースが必要
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Next step guidance */}
      <div className="next-step">
        {!crossrefDone && "次: 「前処理」メニューから Crossref照合 を実行してください"}
        {crossrefDone && !viewerDataReady && "次: 文献確認データを作成・更新してください"}
        {viewerDataReady && "文献を確認し、問題がなければ「原稿チェック」メニューに進んでください"}
      </div>
    </div>
  );
}
