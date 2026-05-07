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
  onPreprocess,
  onNumbering,
  onSections,
  onExtractCitations,
  onCrossrefDb,
  onViewerData,
  statusMessage,
}: PreprocessPanelProps) {
  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <section className="panel">
        <h2>前処理パイプライン</h2>

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
        {sourceAttached && !preprocessDone && !preprocessRunning && (
          <div className="disabled-reason">「docx本文抽出」をクリックしてください</div>
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
        {sourceAttached && !preprocessDone && "次: docx本文抽出を実行してください"}
        {preprocessDone && !numberingDone && "次: 段落・文番号作成を実行してください"}
        {preprocessDone && numberingDone && !sectionsDone && "次: セクション分割を実行してください"}
        {sectionsDone && !citationExtractionDone && "次: 引用文献抽出を実行してください"}
        {citationExtractionDone && !crossrefDone && "次: Crossref照合を実行してください"}
        {crossrefDone && !viewerDataReady && "次: 文献確認データ作成を実行してください"}
        {viewerDataReady && "前処理完了。「文献確認」メニューに進んでください"}
      </div>
    </div>
  );
}
