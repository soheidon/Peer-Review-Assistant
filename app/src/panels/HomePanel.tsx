interface HomePanelProps {
  projectPath: string;
  healthcheckStatus: string | null;
  projectCreated: boolean;
  sourceAttached: boolean;
  preprocessDone: boolean;
  citationExtractionDone: boolean;
  crossrefDone: boolean;
  viewerDataReady: boolean;
  structureMergeDone: boolean;
  finalMergeDone: boolean;
  onRunHealthcheck: () => void;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
}

export default function HomePanel({
  projectPath,
  healthcheckStatus,
  projectCreated,
  sourceAttached,
  preprocessDone,
  citationExtractionDone,
  crossrefDone,
  viewerDataReady,
  structureMergeDone,
  finalMergeDone,
  onRunHealthcheck,
  statusMessage,
}: HomePanelProps) {
  const stages = [
    { label: "プロジェクト作成", done: projectCreated },
    { label: "入力ファイル取込", done: sourceAttached },
    { label: "docx本文抽出", done: preprocessDone },
    { label: "引用文献抽出", done: citationExtractionDone },
    { label: "文献DB照合", done: crossrefDone },
    { label: "文献確認", done: viewerDataReady },
    { label: "査読チェック", done: structureMergeDone },
    { label: "最終出力", done: finalMergeDone },
  ];

  const doneCount = stages.filter((s) => s.done).length;
  const nextStep = stages.find((s) => !s.done);

  return (
    <div className="home-panel">
      <h1 className="home-title">Peer Review Assistant</h1>
      <p className="home-subtitle">査読アシスタント v0.1.0</p>

      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <div className="panel" style={{ marginTop: 16 }}>
        <h2>システム</h2>
        <div className="row">
          <button
            onClick={onRunHealthcheck}
            disabled={healthcheckStatus === "running"}
          >
            {healthcheckStatus === "running"
              ? "接続確認中..."
              : "Python CLI 接続確認"}
          </button>
          {healthcheckStatus && healthcheckStatus !== "running" && (
            <span className={`status-chip ${healthcheckStatus === "ok" ? "ok" : "err"}`}>
              {healthcheckStatus === "ok" ? "正常" : "エラー"}
            </span>
          )}
          {healthcheckStatus === "running" && (
            <span className="status-chip running">実行中...</span>
          )}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 12 }}>
        <h2>進捗サマリー</h2>
        <p className="home-progress-text">
          {doneCount} / {stages.length} ステップ完了
        </p>
        <div className="home-progress-bar-bg">
          <div
            className="home-progress-bar-fill"
            style={{ width: `${(doneCount / stages.length) * 100}%` }}
          />
        </div>
        {nextStep && (
          <p className="home-next-step">
            次: {nextStep.label}
          </p>
        )}
      </div>
    </div>
  );
}
