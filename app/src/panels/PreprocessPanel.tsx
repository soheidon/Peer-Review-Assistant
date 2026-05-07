import { useState } from "react";

interface PreprocessPanelProps {
  projectPath: string;
  sourceAttached: boolean;
  preprocessDone: boolean;
  preprocessRunning: boolean;
  numberingDone: boolean;
  numberingRunning: boolean;
  sectionsDone: boolean;
  sectionsRunning: boolean;
  citationExtractionDone: boolean;
  citationExtractionRunning: boolean;
  crossrefDone: boolean;
  crossrefRunning: boolean;
  viewerDataGenerating: boolean;
  viewerDataReady: boolean;
  preprocessResults: Record<string, string>;
  crossrefSummary: string;
  onPreprocessAll: () => void;
  preprocessAllRunning: boolean;
  preprocessAllStep: string;
  onPreprocess: () => void;
  onNumbering: () => void;
  onSections: () => void;
  onExtractCitations: () => void;
  onCrossrefDb: () => void;
  onViewerData: () => void;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
}

function statusChip(running: boolean, done: boolean, label = "完了"): React.ReactNode {
  if (running) return <span className="status-chip running">実行中...</span>;
  if (done) return <span className="status-chip ok">{label}</span>;
  return <span className="status-chip unrun">未実行</span>;
}

export default function PreprocessPanel({
  projectPath,
  sourceAttached,
  preprocessDone,
  preprocessRunning,
  numberingDone,
  numberingRunning,
  sectionsDone,
  sectionsRunning,
  citationExtractionDone,
  citationExtractionRunning,
  crossrefDone,
  crossrefRunning,
  viewerDataGenerating,
  viewerDataReady,
  preprocessResults,
  crossrefSummary,
  onPreprocessAll,
  preprocessAllRunning,
  preprocessAllStep,
  onPreprocess,
  onNumbering,
  onSections,
  onExtractCitations,
  onCrossrefDb,
  onViewerData,
  statusMessage,
}: PreprocessPanelProps) {
  const [showDetail, setShowDetail] = useState(false);

  const allDone = preprocessDone && numberingDone && sectionsDone && citationExtractionDone;

  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <section className="panel">
        <h2>前処理パイプライン</h2>

        {/* Master button: runs all 4 preprocess steps sequentially */}
        <div className="row">
          <button
            onClick={onPreprocessAll}
            disabled={!sourceAttached || preprocessAllRunning}
          >
            {preprocessAllRunning
              ? preprocessAllStep || "前処理中..."
              : "本文・引用文献を前処理"}
          </button>
          {preprocessAllRunning && <span className="status-chip running">実行中...</span>}
          {allDone && !preprocessAllRunning && <span className="status-chip ok">完了</span>}
          {!allDone && !preprocessAllRunning && <span className="status-chip unrun">未実行</span>}
        </div>
        {!sourceAttached && (
          <div className="disabled-reason">先にプロジェクトに原稿を取り込んでください</div>
        )}
        {sourceAttached && !allDone && !preprocessAllRunning && (
          <div className="disabled-reason">「本文・引用文献を前処理」をクリックしてください（4ステップを順に実行します）</div>
        )}
        {allDone && (
          <div style={{ fontSize: "11px", color: "#107c10", marginTop: 4 }}>
            前処理が完了しました。「本文分割」または「文献確認」メニューに進んでください。
          </div>
        )}

        {/* Collapsible detail: individual buttons for dev/debug use */}
        <div style={{ marginTop: 8 }}>
          <button
            onClick={() => setShowDetail((v) => !v)}
            className="clear-btn"
            style={{ fontSize: "11px" }}
          >
            詳細操作 {showDetail ? "▲" : "▼"}
          </button>
        </div>

        {showDetail && (
          <div style={{
            marginTop: 8,
            padding: "10px 12px",
            background: "#f8f8f8",
            border: "1px solid #e0e0e0",
            borderRadius: 4,
          }}>
            {/* Step 1: docx本文抽出 */}
            <div className="row">
              <button
                onClick={onPreprocess}
                disabled={!sourceAttached || preprocessRunning}
              >
                {preprocessRunning ? "抽出中..." : "docx本文抽出"}
              </button>
              {statusChip(preprocessRunning, preprocessDone)}
              {preprocessResults.preprocess && (
                <span className="preprocess-info">{preprocessResults.preprocess}</span>
              )}
            </div>
            {!sourceAttached && (
              <div className="disabled-reason">先にプロジェクトに原稿を取り込んでください</div>
            )}

            {/* Step 2: 段落・文番号作成 */}
            <div className="row">
              <button
                onClick={onNumbering}
                disabled={!preprocessDone || numberingRunning}
              >
                {numberingRunning ? "作成中..." : "段落・文番号作成"}
              </button>
              {statusChip(numberingRunning, numberingDone)}
              {preprocessResults.numbering && (
                <span className="preprocess-info">{preprocessResults.numbering}</span>
              )}
            </div>
            {!preprocessDone && !numberingRunning && (
              <div className="disabled-reason">先にdocx本文抽出を実行してください</div>
            )}

            {/* Step 3: セクション分割 */}
            <div className="row">
              <button
                onClick={onSections}
                disabled={!preprocessDone || sectionsRunning}
              >
                {sectionsRunning ? "分割中..." : "セクション分割"}
              </button>
              {statusChip(sectionsRunning, sectionsDone)}
              {preprocessResults.sections && (
                <span className="preprocess-info">{preprocessResults.sections}</span>
              )}
            </div>
            {!preprocessDone && !sectionsRunning && (
              <div className="disabled-reason">先にdocx本文抽出を実行してください</div>
            )}

            {/* Step 4: 引用文献抽出 */}
            <div className="row">
              <button
                onClick={onExtractCitations}
                disabled={!sectionsDone || citationExtractionRunning}
              >
                {citationExtractionRunning ? "抽出中..." : "引用文献抽出"}
              </button>
              {statusChip(citationExtractionRunning, citationExtractionDone)}
              {preprocessResults.citations && (
                <span className="preprocess-info">{preprocessResults.citations}</span>
              )}
            </div>
            {!sectionsDone && !citationExtractionRunning && (
              <div className="disabled-reason">先にセクション分割を実行してください</div>
            )}
          </div>
        )}
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>文献データベース照合</h2>

        {/* Step 5: Crossref照合 */}
        <div className="row">
          <button
            onClick={onCrossrefDb}
            disabled={!citationExtractionDone || crossrefRunning}
          >
            {crossrefRunning ? "照合中..." : "Crossref照合"}
          </button>
          {statusChip(crossrefRunning, crossrefDone)}
          {(preprocessResults.crossref || crossrefSummary) && (
            <span className="preprocess-info">
              {preprocessResults.crossref || crossrefSummary}
            </span>
          )}
        </div>
        {!citationExtractionDone && !crossrefRunning && (
          <div className="disabled-reason">先に引用文献抽出を実行してください</div>
        )}

        {/* Step 6: 文献確認データ作成 */}
        <div className="row">
          <button
            onClick={onViewerData}
            disabled={!crossrefDone || viewerDataGenerating}
          >
            {viewerDataGenerating ? "作成中..." : "文献確認データ作成"}
          </button>
          {viewerDataGenerating && <span className="status-chip running">作成中...</span>}
          {viewerDataReady && !viewerDataGenerating && <span className="status-chip ok">作成済</span>}
          {!viewerDataReady && !viewerDataGenerating && <span className="status-chip unrun">未実行</span>}
          {preprocessResults.viewerData && (
            <span className="preprocess-info">{preprocessResults.viewerData}</span>
          )}
        </div>
        {!crossrefDone && !viewerDataGenerating && (
          <div className="disabled-reason">先にCrossref照合を実行してください</div>
        )}
      </section>

      {/* Next step suggestion */}
      <div className="next-step">
        {!sourceAttached && "次: 「プロジェクト」メニューから原稿を取り込んでください"}
        {sourceAttached && !allDone && !preprocessAllRunning && "次: 「本文・引用文献を前処理」をクリックしてください（4ステップを順に実行）"}
        {preprocessAllRunning && `前処理実行中: ${preprocessAllStep}`}
        {allDone && !crossrefDone && "次: Crossref照合を実行してください"}
        {crossrefDone && !viewerDataReady && "次: 文献確認データ作成を実行してください"}
        {viewerDataReady && "前処理完了。「文献確認」メニューに進んでください"}
      </div>
    </div>
  );
}
