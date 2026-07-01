interface HomePanelProps {
  setupPhase: string;
  setupLog: string;
  healthcheckStatus: string | null;
  onRunSetup: () => void;
  onRunHealthcheck: () => void;
  projectPath: string;
  projectCreated: boolean;
  sourceAttached: boolean;
  preprocessDone: boolean;
  citationExtractionDone: boolean;
  crossrefDone: boolean;
  viewerDataReady: boolean;
  structureMergeDone: boolean;
  finalMergeDone: boolean;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
}

export default function HomePanel({
  setupPhase,
  setupLog,
  healthcheckStatus,
  onRunSetup,
  onRunHealthcheck,
  projectPath,
  projectCreated,
  sourceAttached,
  preprocessDone,
  citationExtractionDone,
  crossrefDone,
  viewerDataReady,
  structureMergeDone,
  finalMergeDone,
  statusMessage,
}: HomePanelProps) {
  const stages = [
    { label: "プロジェクト作成", done: projectCreated },
    { label: "入力ファイル取込", done: sourceAttached },
    { label: "docx本文抽出", done: preprocessDone },
    { label: "引用文献抽出", done: citationExtractionDone },
    { label: "文献DB照合", done: crossrefDone },
    { label: "文献確認", done: viewerDataReady },
    { label: "原稿チェック", done: structureMergeDone },
    { label: "レポート作成", done: finalMergeDone },
  ];

  const doneCount = stages.filter((s) => s.done).length;
  const nextStep = stages.find((s) => !s.done);

  // ── Phase: loading ──
  if (setupPhase === "loading") {
    return (
      <div className="home-panel">
        <h1 className="home-title">Academic Paper Checker</h1>
        <div className="setup-loading">
          <span className="setup-spinner" />
          <span>Python CLI を確認中...</span>
        </div>
      </div>
    );
  }

  // ── Phase: setup_needed ──
  if (setupPhase === "setup_needed") {
    return (
      <div className="home-panel">
        <h1 className="home-title">Academic Paper Checker</h1>
        <p className="home-subtitle">学術論文チェック v0.5.0</p>

        <div className="setup-warning-box">
          <h2>Python CLI (pra-cli) が見つかりません</h2>
          <p>
            このツールの原稿チェック処理エンジン（Python CLI）がインストールされていません。<br />
            下のボタンをクリックすると、自動的にインストールされます。
          </p>
          <button className="setup-install-btn" onClick={onRunSetup}>
            Python CLI をインストール
          </button>
        </div>

        <div className="setup-manual-instructions">
          <p style={{ fontSize: "13px", color: "#666", margin: "0 0 8px 0" }}>
            手動でインストールする場合は、コマンドプロンプトで以下を実行してください：
          </p>
          <code>pip install git+https://github.com/soheidon/Peer-Review-Assistant.git#subdirectory=python</code>
        </div>
      </div>
    );
  }

  // ── Phase: installing ──
  if (setupPhase === "installing") {
    return (
      <div className="home-panel">
        <h1 className="home-title">Academic Paper Checker</h1>
        <div className="setup-loading">
          <span className="setup-spinner" />
          <span style={{ fontWeight: 600 }}>Python CLI をインストール中...</span>
          <span style={{ fontSize: "12px", color: "#888", marginTop: 8 }}>
            初回は数分かかることがあります
          </span>
        </div>
        {setupLog && <pre className="setup-log-area">{setupLog}</pre>}
      </div>
    );
  }

  // ── Phase: installed_verifying ──
  if (setupPhase === "installed_verifying") {
    return (
      <div className="home-panel">
        <h1 className="home-title">Academic Paper Checker</h1>
        <div className="setup-loading">
          <span className="setup-spinner" />
          <span>ヘルスチェック実行中...</span>
        </div>
        {setupLog && <pre className="setup-log-area">{setupLog}</pre>}
      </div>
    );
  }

  // ── Phase: error ──
  if (setupPhase === "error") {
    return (
      <div className="home-panel">
        <h1 className="home-title">Academic Paper Checker</h1>
        <p className="home-subtitle">学術論文チェック v0.5.0</p>

        {statusMessage && (
          <div className={`status-banner ${statusMessage.type}`}>
            {statusMessage.text}
          </div>
        )}

        <div className="setup-error-box">
          <h2>セットアップに失敗しました</h2>
          <p style={{ fontSize: "13px", color: "#333", lineHeight: 1.6 }}>
            Python CLI のインストール中にエラーが発生しました。
            以下を確認してください：
          </p>
          <ul style={{ fontSize: "13px", color: "#333", paddingLeft: 20, lineHeight: 1.8 }}>
            <li>Python 3.11 以上がインストールされているか</li>
            <li>pip が使用可能か（<code>pip --version</code>）</li>
            <li>インターネットに接続されているか</li>
          </ul>
          <button className="setup-install-btn" onClick={onRunSetup} style={{ marginTop: 12 }}>
            再試行
          </button>
        </div>

        {setupLog && <pre className="setup-log-area">{setupLog}</pre>}

        <div className="setup-manual-instructions">
          <p style={{ fontSize: "13px", color: "#666", margin: "0 0 8px 0" }}>
            手動でインストールする場合は、コマンドプロンプトで以下を実行してください：
          </p>
          <code>pip install git+https://github.com/soheidon/Peer-Review-Assistant.git#subdirectory=python</code>
        </div>
      </div>
    );
  }

  // ── Phase: ready (normal home screen) ──
  return (
    <div className="home-panel">
      <h1 className="home-title">Academic Paper Checker</h1>
      <p className="home-subtitle">学術論文チェック v0.5.0</p>

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
