import ReferencesReviewViewer from "../ReferencesReviewViewer";

interface CitationReviewPanelProps {
  projectPath: string;
  crossrefDone: boolean;
  viewerDataReady: boolean;
  viewerDataGenerating: boolean;
  onViewerData: () => void;
}

export default function CitationReviewPanel({
  projectPath,
  crossrefDone,
  viewerDataReady,
  viewerDataGenerating,
  onViewerData,
}: CitationReviewPanelProps) {
  return (
    <div>
      <section className="panel viewer-panel">
        <h2>文献確認</h2>
        <div className="row">
          <button
            onClick={onViewerData}
            disabled={!crossrefDone || viewerDataGenerating}
          >
            Generate Viewer Data
          </button>
          {viewerDataGenerating && (
            <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
              Generating...
            </span>
          )}
          {viewerDataReady && <span className="status-chip ok">Ready</span>}
        </div>
        {viewerDataReady && (
          <ReferencesReviewViewer projectPath={projectPath} />
        )}
        {!viewerDataReady && (
          <p style={{ color: "#999", fontSize: "12px", marginTop: 12 }}>
            文献データベース照合完了後、「Generate Viewer Data」をクリックしてください。
          </p>
        )}
      </section>
    </div>
  );
}
