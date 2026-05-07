interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
}

interface ReviewChecksPanelProps {
  crossrefDone: boolean;
  llmSlots: LlmSlot[];
  structureCheckResults: Record<string, string>;
  expressionCheckResults: Record<string, string>;
  methodsStatsCheckResults: Record<string, string>;
  structureMergeDone: boolean;
  structureMergeRunning: boolean;
  expressionMergeDone: boolean;
  expressionMergeRunning: boolean;
  methodsStatsMergeDone: boolean;
  methodsStatsMergeRunning: boolean;
  finalMergeDone: boolean;
  finalMergeRunning: boolean;
  onStructureCheck: (slotName: string) => void;
  onExpressionCheck: (slotName: string) => void;
  onMethodsStatsCheck: (slotName: string) => void;
  onMergeStructure: () => void;
  onMergeExpression: () => void;
  onMergeMethodsStats: () => void;
  onFinalMerge: () => void;
}

export default function ReviewChecksPanel({
  crossrefDone,
  llmSlots,
  structureCheckResults,
  expressionCheckResults,
  methodsStatsCheckResults,
  structureMergeDone,
  structureMergeRunning,
  expressionMergeDone,
  expressionMergeRunning,
  methodsStatsMergeDone,
  methodsStatsMergeRunning,
  finalMergeDone,
  finalMergeRunning,
  onStructureCheck,
  onExpressionCheck,
  onMethodsStatsCheck,
  onMergeStructure,
  onMergeExpression,
  onMergeMethodsStats,
  onFinalMerge,
}: ReviewChecksPanelProps) {
  const reviewers = llmSlots.filter((s) => s.name.startsWith("reviewer"));

  const renderCheckRow = (
    label: string,
    results: Record<string, string>,
    onCheck: (slotName: string) => void
  ) => (
    <div className="row">
      <span className="llm-slot-label">{label}</span>
      {reviewers.map((slot) => (
        <div key={slot.name} style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => onCheck(slot.name)}
            disabled={!crossrefDone || results[slot.name] === "running"}
          >
            {slot.name}
          </button>
          {results[slot.name] && results[slot.name] !== "running" && (
            <span
              className={`status-chip ${results[slot.name] === "done" ? "ok" : "err"}`}
            >
              {results[slot.name] === "done" ? "Done" : "Failed"}
            </span>
          )}
          {results[slot.name] === "running" && (
            <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
              Running...
            </span>
          )}
        </div>
      ))}
    </div>
  );

  const renderMergeRow = (
    label: string,
    done: boolean,
    running: boolean,
    results: Record<string, string>,
    onMerge: () => void
  ) => (
    <div className="row">
      <button
        onClick={onMerge}
        disabled={
          done ||
          running ||
          reviewers.every((s) => results[s.name] !== "done")
        }
      >
        {label}
      </button>
      {done && <span className="status-chip ok">Merged</span>}
      {running && (
        <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
          Merging...
        </span>
      )}
    </div>
  );

  return (
    <div>
      <section className="panel">
        <h2>Structure</h2>
        {renderCheckRow("Structure", structureCheckResults, onStructureCheck)}
        {renderMergeRow(
          "Merge Structure Results",
          structureMergeDone,
          structureMergeRunning,
          structureCheckResults,
          onMergeStructure
        )}
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Expression</h2>
        {renderCheckRow("Expression", expressionCheckResults, onExpressionCheck)}
        {renderMergeRow(
          "Merge Expression Results",
          expressionMergeDone,
          expressionMergeRunning,
          expressionCheckResults,
          onMergeExpression
        )}
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>Methods / Statistics</h2>
        {renderCheckRow("Methods/Stats", methodsStatsCheckResults, onMethodsStatsCheck)}
        {renderMergeRow(
          "Merge Methods/Stats Results",
          methodsStatsMergeDone,
          methodsStatsMergeRunning,
          methodsStatsCheckResults,
          onMergeMethodsStats
        )}
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>最終出力</h2>
        <div className="row">
          <button
            onClick={onFinalMerge}
            disabled={!structureMergeDone || finalMergeDone || finalMergeRunning}
          >
            Generate Final Review
          </button>
          {finalMergeDone && <span className="status-chip ok">Generated</span>}
          {finalMergeRunning && (
            <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
              Generating...
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
