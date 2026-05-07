interface PreprocessPanelProps {
  preprocessDone: boolean;
  numberingDone: boolean;
  sectionsDone: boolean;
  citationExtractionDone: boolean;
  crossrefDone: boolean;
  viewerDataGenerating: boolean;
  viewerDataReady: boolean;
  onNumbering: () => void;
  onSections: () => void;
  onExtractCitations: () => void;
  onCrossrefDb: () => void;
  onViewerData: () => void;
}

export default function PreprocessPanel({
  preprocessDone,
  numberingDone,
  sectionsDone,
  citationExtractionDone,
  crossrefDone,
  viewerDataGenerating,
  viewerDataReady,
  onNumbering,
  onSections,
  onExtractCitations,
  onCrossrefDb,
  onViewerData,
}: PreprocessPanelProps) {
  return (
    <div>
      <section className="panel">
        <h2>前処理パイプライン</h2>
        <div className="row">
          <button onClick={onNumbering} disabled={!preprocessDone}>
            Paragraph & Sentence Numbering
          </button>
          {numberingDone && <span className="status-chip ok">Done</span>}
        </div>
        <div className="row">
          <button onClick={onSections} disabled={!preprocessDone}>
            Split Sections
          </button>
          {sectionsDone && <span className="status-chip ok">Done</span>}
        </div>
        <div className="row">
          <button onClick={onExtractCitations} disabled={!sectionsDone}>
            Extract Citations
          </button>
          {citationExtractionDone && <span className="status-chip ok">Done</span>}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>文献データベース照合</h2>
        <div className="row">
          <button onClick={onCrossrefDb} disabled={!citationExtractionDone}>
            Crossref DB Check
          </button>
          {crossrefDone && <span className="status-chip ok">Done</span>}
        </div>
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
      </section>
    </div>
  );
}
