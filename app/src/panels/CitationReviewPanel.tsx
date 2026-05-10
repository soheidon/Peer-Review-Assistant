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
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
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
  statusMessage,
}: CitationReviewPanelProps) {
  const [suspiciousCount, setSuspiciousCount] = useState<number>(0);
  const [showAdvanced, setShowAdvanced] = useState(false);

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

  const reviewerSlots = llmSlots.filter(
    s => s.name.startsWith("reviewer") && s.enabled !== false && s.provider.trim()
  );

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

        {/* ── Viewer data ─────────────────────────────────────────────── */}
        <div className="row">
          <button
            onClick={onViewerData}
            disabled={!crossrefDone || viewerDataGenerating}
          >
            {viewerDataGenerating
              ? (viewerDataReady ? "再作成中..." : "作成中...")
              : (viewerDataReady ? "文献確認データを再作成" : "文献確認データ作成")}
          </button>
          {viewerDataGenerating && (
            <span className="status-chip running">作成中...</span>
          )}
          {viewerDataReady && !viewerDataGenerating && (
            <span className="status-chip ok">作成済</span>
          )}
          {!viewerDataReady && !viewerDataGenerating && (
            <span className="status-chip unrun">未実行</span>
          )}
        </div>
        {!crossrefDone && !viewerDataGenerating && (
          <div className="disabled-reason">先にCrossref照合を実行してください</div>
        )}

        {/* ── Combined: LLMで文献情報を整理 ──────────────────────────── */}
        {viewerDataReady && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555", marginRight: 8 }}>
                LLMで文献情報を整理:
              </span>
              {reviewerSlots.map((slot) => {
                const isRunning = llmReferenceProcessRunning;
                const bothDone = llmRepairDone && llmFlagsDone;
                return (
                  <button
                    key={slot.name}
                    onClick={() => onLlmReferenceProcess(slot.name)}
                    disabled={isRunning}
                    style={{ fontSize: 11, height: 24 }}
                  >
                    {isRunning ? "処理中..." : `${slotDisplayName(slot.name)}`}
                  </button>
                );
              })}
              {llmReferenceProcessRunning && <span className="status-chip running">処理中...</span>}
              {llmRepairDone && llmFlagsDone && !llmReferenceProcessRunning && (
                <span className="status-chip ok">完了</span>
              )}
              {(!llmRepairDone || !llmFlagsDone) && !llmReferenceProcessRunning && (
                <span className="status-chip unrun">未実行</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 4, lineHeight: 1.5 }}>
              原稿中の文献情報を著者・年・タイトル・雑誌名・DOI等に分解し、DOI欠落、書籍、政府文書、Web文書、後段LLM確認が必要な文献を判定します。人間が既に判断した内容があれば自動的に反映します。
            </div>

            {/* Detailed operations (collapsed by default) */}
            <div style={{ marginTop: 8 }}>
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                style={{ fontSize: 10, height: 22, color: "#888", background: "none", border: "1px solid #ddd" }}
              >
                {showAdvanced ? "▲ 詳細操作を隠す" : "▼ 詳細操作"}
              </button>

              {showAdvanced && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#fafafa", border: "1px solid #e5e5e5", borderRadius: 4 }}>
                  {/* LLM re-parse only */}
                  <div className="row" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#888", marginRight: 6, minWidth: 120 }}>
                      LLM文献再パースのみ:
                    </span>
                    {reviewerSlots.map((slot) => (
                      <button
                        key={slot.name}
                        onClick={() => onLlmRepair(slot.name)}
                        disabled={llmRepairGenerating || llmReferenceProcessRunning}
                        style={{ fontSize: 10, height: 22 }}
                      >
                        {llmRepairGenerating ? "再パース中..." : slotDisplayName(slot.name)}
                      </button>
                    ))}
                    {llmRepairDone && <span className="status-chip ok">完了</span>}
                    {!llmRepairDone && <span className="status-chip unrun">未</span>}
                  </div>

                  {/* LLM flags only */}
                  <div className="row" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#888", marginRight: 6, minWidth: 120 }}>
                      LLM文献フラグ生成のみ:
                    </span>
                    {reviewerSlots.map((slot) => (
                      <button
                        key={slot.name}
                        onClick={() => onGenerateLlmFlags(slot.name)}
                        disabled={llmFlagsGenerating || llmReferenceProcessRunning}
                        style={{ fontSize: 10, height: 22 }}
                      >
                        {llmFlagsGenerating ? "フラグ生成中..." : slotDisplayName(slot.name)}
                      </button>
                    ))}
                    {llmFlagsDone && <span className="status-chip ok">完了</span>}
                    {!llmFlagsDone && <span className="status-chip unrun">未</span>}
                  </div>

                  {/* Viewer data refresh */}
                  <div className="row" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: "#888", marginRight: 6, minWidth: 120 }}>
                      文献確認データを再作成:
                    </span>
                    <button
                      onClick={onViewerData}
                      disabled={viewerDataGenerating}
                      style={{ fontSize: 10, height: 22 }}
                    >
                      {viewerDataGenerating ? "再作成中..." : "再作成"}
                    </button>
                  </div>

                  {/* Reload intermediate JSON */}
                  <div className="row">
                    <span style={{ fontSize: 11, color: "#888", marginRight: 6, minWidth: 120 }}>
                      中間JSONを再読み込み:
                    </span>
                    <button
                      onClick={onViewerData}
                      disabled={viewerDataGenerating}
                      style={{ fontSize: 10, height: 22 }}
                    >
                      再読み込み
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Google Books candidate search ──────────────────────────── */}
        {viewerDataReady && googleBooksEnabled && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <button
                onClick={onGoogleBooks}
                disabled={!projectPath || googleBooksGenerating || !llmRepairDone}
              >
                {googleBooksGenerating
                  ? "Google Books検索中..."
                  : "Google Booksで書籍候補を検索"}
              </button>
              {googleBooksGenerating && (
                <span className="status-chip running">実行中...</span>
              )}
              {googleBooksDone && !googleBooksGenerating && (
                <span className="status-chip ok">
                  取得済{googleBooksCandidateCount != null ? ` (${googleBooksCandidateCount}件)` : ""}
                </span>
              )}
              {!googleBooksDone && !googleBooksGenerating && (
                <span className="status-chip unrun">未実行</span>
              )}
            </div>
            {!llmRepairDone && projectPath && !googleBooksGenerating && (
              <div className="disabled-reason">先にLLM文献再パースを実行してください</div>
            )}
          </div>
        )}

        {viewerDataReady && (
          <ReferencesReviewViewer key={viewerDataVersion} projectPath={projectPath} />
        )}
        {!viewerDataReady && (
          <p style={{ color: "#999", fontSize: "12px", marginTop: 12 }}>
            文献データベース照合完了後、「文献確認データ作成」をクリックしてください。
          </p>
        )}
      </section>

      {/* Next step */}
      <div className="next-step">
        {!crossrefDone && "次: 「前処理」メニューから Crossref照合 を実行してください"}
        {crossrefDone && !viewerDataReady && "次: 文献確認データ作成を実行してください"}
        {viewerDataReady && "文献を確認し、問題がなければ「査読チェック」メニューに進んでください"}
      </div>
    </div>
  );
}
