interface ProgressBarProps {
  projectPath: string;
  journalLoaded: boolean;
  sourceAttached: boolean;
  preprocessDone: boolean;
  numberingDone: boolean;
  sectionsDone: boolean;
  citationExtractionDone: boolean;
  crossrefDone: boolean;
  viewerDataReady: boolean;
  noveltyAssessDone: boolean;
  structureMergeDone: boolean;
  expressionMergeDone: boolean;
  methodsStatsMergeDone: boolean;
  finalMergeDone: boolean;
  settingsConfigured: boolean;
  onStepClick?: (viewKey: string) => void;
}

const STAGES = [
  { key: "project",    label: "プロジェクト作成", done: (p: ProgressBarProps) => !!p.projectPath },
  { key: "settings",   label: "API設定",          done: (p: ProgressBarProps) => p.settingsConfigured },
  { key: "journal",    label: "ジャーナル設定",   done: (p: ProgressBarProps) => p.journalLoaded },
  { key: "input",      label: "入力ファイル",     done: (p: ProgressBarProps) => p.sourceAttached },
  { key: "preprocess", label: "前処理",           done: (p: ProgressBarProps) => p.preprocessDone },
  { key: "sections",   label: "本文分割確認",     done: (p: ProgressBarProps) => p.sectionsDone },
  { key: "citations",  label: "文献抽出",         done: (p: ProgressBarProps) => p.citationExtractionDone },
  { key: "db_check",   label: "DB照合",           done: (p: ProgressBarProps) => p.crossrefDone },
  { key: "cite_review",label: "文献確認",         done: (p: ProgressBarProps) => p.viewerDataReady },
  { key: "novelty",    label: "新規性チェック",   done: (p: ProgressBarProps) => p.noveltyAssessDone },
  { key: "review",     label: "査読チェック",     done: (p: ProgressBarProps) => p.structureMergeDone },
  { key: "output",     label: "最終出力",         done: (p: ProgressBarProps) => p.finalMergeDone },
];

export default function ProgressBar(props: ProgressBarProps) {
  const doneCount = STAGES.filter((s) => s.done(props)).length;
  const firstPending = STAGES.findIndex((s) => !s.done(props));

  const handleClick = (key: string, isDone: boolean) => {
    if (isDone && props.onStepClick) {
      props.onStepClick(key);
    } else if (!isDone && props.onStepClick) {
      // Navigate to the first pending step's view
      props.onStepClick(key);
    }
  };

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
            <div
              className={`progress-step ${stateClass}`}
              onClick={() => handleClick(stage.key, isDone)}
              title={`${stage.label} — ${isDone ? "完了" : isActive ? "実行中" : "待機中"}`}
              style={props.onStepClick ? { cursor: "pointer" } : undefined}
            >
              <div className="progress-circle">
                {isDone ? "✓" : isActive ? (firstPending + 1) : i + 1}
              </div>
              <span className="progress-label">{stage.label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
