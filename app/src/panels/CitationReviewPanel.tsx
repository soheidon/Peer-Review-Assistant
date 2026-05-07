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
  llmSlots: { name: string; provider: string; model: string; apiKey: string }[];
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
  statusMessage,
}: CitationReviewPanelProps) {
  const [suspiciousCount, setSuspiciousCount] = useState<number>(0);

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

        {/* LLM reference re-parse */}
        {viewerDataReady && (
          <div style={{ marginTop: 12 }}>
            <div className="row">
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555", marginRight: 8 }}>
                LLM文献再パース:
              </span>
              {llmSlots.filter(s => s.name.startsWith("reviewer") && s.provider.trim()).map((slot) => {
                const isRunning = llmRepairGenerating;
                return (
                  <button
                    key={slot.name}
                    onClick={() => onLlmRepair(slot.name)}
                    disabled={isRunning}
                    style={{ fontSize: 11, height: 24 }}
                  >
                    {isRunning ? "再パース中..." : `${slotDisplayName(slot.name)}`}
                  </button>
                );
              })}
              {llmRepairGenerating && <span className="status-chip running">実行中...</span>}
              {llmRepairDone && !llmRepairGenerating && <span className="status-chip ok">完了</span>}
              {!llmRepairDone && !llmRepairGenerating && <span className="status-chip unrun">未実行</span>}
            </div>
            {llmRepairDone && (
              <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>
                LLM再パース後、「文献確認データを再作成」を押して結果を反映してください。
              </div>
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
