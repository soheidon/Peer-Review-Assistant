interface ProgressBarProps {
  projectPath: string;
  sourceAttached: boolean;
  preprocessDone: boolean;
  citationExtractionDone: boolean;
  crossrefDone: boolean;
  viewerDataReady: boolean;
  structureMergeDone: boolean;
  finalMergeDone: boolean;
}

const STAGES = [
  { key: "project", label: "プロジェクト", done: (p: ProgressBarProps) => !!p.projectPath },
  { key: "input", label: "入力ファイル", done: (p: ProgressBarProps) => p.sourceAttached },
  { key: "preprocess", label: "前処理", done: (p: ProgressBarProps) => p.preprocessDone },
  { key: "citations", label: "文献抽出", done: (p: ProgressBarProps) => p.citationExtractionDone },
  { key: "db_check", label: "DB照合", done: (p: ProgressBarProps) => p.crossrefDone },
  { key: "cite_review", label: "文献確認", done: (p: ProgressBarProps) => p.viewerDataReady },
  { key: "review", label: "査読チェック", done: (p: ProgressBarProps) => p.structureMergeDone },
  { key: "merge", label: "マージ", done: (p: ProgressBarProps) => p.structureMergeDone },
  { key: "output", label: "最終出力", done: (p: ProgressBarProps) => p.finalMergeDone },
];

export default function ProgressBar(props: ProgressBarProps) {
  const doneCount = STAGES.filter((s) => s.done(props)).length;
  const firstPending = STAGES.findIndex((s) => !s.done(props));

  return (
    <div className="progress-bar">
      {STAGES.map((stage, i) => {
        const isDone = stage.done(props);
        const isActive = i === firstPending && i < STAGES.length;
        let stateClass = "pending";
        if (isDone) stateClass = "done";
        else if (isActive) stateClass = "active";

        return (
          <div key={stage.key} className="progress-step-wrapper">
            {i > 0 && (
              <div className={`progress-line ${isDone ? "done" : ""}`} />
            )}
            <div className={`progress-step ${stateClass}`}>
              <div className="progress-circle">
                {isDone ? "✓" : isActive ? (doneCount + 1) : i + 1}
              </div>
              <span className="progress-label">{stage.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
