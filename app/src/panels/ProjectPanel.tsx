interface ProjectPanelProps {
  projectPath: string;
  projectCreated: boolean;
  docxPath: string;
  pdfPath: string;
  validationOk: boolean;
  sourceAttached: boolean;
  validateRunning: boolean;
  attachRunning: boolean;
  onProjectPathChange: (path: string) => void;
  onBrowseFolder: () => void;
  onCreateProject: () => void;
  onDocxPathChange: (path: string) => void;
  onBrowseDocx: () => void;
  onPdfPathChange: (path: string) => void;
  onBrowsePdf: () => void;
  onValidateInput: () => void;
  onAttachSource: () => void;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
}

export default function ProjectPanel({
  projectPath,
  projectCreated,
  docxPath,
  pdfPath,
  validationOk,
  sourceAttached,
  validateRunning,
  attachRunning,
  onProjectPathChange,
  onBrowseFolder,
  onCreateProject,
  onDocxPathChange,
  onBrowseDocx,
  onPdfPathChange,
  onBrowsePdf,
  onValidateInput,
  onAttachSource,
  statusMessage,
}: ProjectPanelProps) {
  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <section className="panel">
        <h2>プロジェクトフォルダ</h2>
        <div className="row">
          <input
            type="text"
            value={projectPath}
            onChange={(e) => onProjectPathChange(e.target.value)}
            placeholder="プロジェクトフォルダを選択..."
            className="path-input"
          />
          <button onClick={onBrowseFolder}>参照</button>
        </div>
        <div className="row">
          <button onClick={onCreateProject}>新規プロジェクト作成</button>
          {projectCreated && <span className="status-chip ok">作成済</span>}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>原稿ファイル</h2>
        <div className="row">
          <input
            type="text"
            value={docxPath}
            onChange={(e) => onDocxPathChange(e.target.value)}
            placeholder="原稿docxを選択..."
            className="path-input"
          />
          <button onClick={onBrowseDocx}>参照</button>
        </div>
        <div className="row">
          <input
            type="text"
            value={pdfPath}
            onChange={(e) => onPdfPathChange(e.target.value)}
            placeholder="行番号付きPDFを選択..."
            className="path-input"
          />
          <button onClick={onBrowsePdf}>参照</button>
        </div>
        <div className="row">
          <button
            onClick={onValidateInput}
            disabled={validateRunning || !docxPath.trim() || !pdfPath.trim()}
          >
            {validateRunning ? "確認中..." : "入力ファイルを確認"}
          </button>
          {validateRunning && <span className="status-chip running">実行中...</span>}
          {validationOk && !validateRunning && <span className="status-chip ok">確認済</span>}
        </div>
        {!validationOk && !validateRunning && docxPath.trim() && pdfPath.trim() && (
          <div className="disabled-reason">「入力ファイルを確認」をクリックしてください</div>
        )}
        <div className="row">
          <button
            onClick={onAttachSource}
            disabled={!validationOk || !projectCreated || attachRunning}
          >
            {attachRunning ? "取り込み中..." : "プロジェクトに取り込み"}
          </button>
          {attachRunning && <span className="status-chip running">実行中...</span>}
          {sourceAttached && !attachRunning && <span className="status-chip ok">取込済</span>}
        </div>
        {!sourceAttached && !attachRunning && validationOk && projectCreated && (
          <div className="disabled-reason">「プロジェクトに取り込み」をクリックしてください</div>
        )}
        {!validationOk && projectCreated && !attachRunning && (
          <div className="disabled-reason">先に入力ファイルを確認してください</div>
        )}
        {!projectCreated && (
          <div className="disabled-reason">プロジェクトを先に作成してください</div>
        )}
      </section>

      {/* Next step suggestion */}
      <div className="next-step">
        {!projectCreated && "次: プロジェクトフォルダを選択し、新規プロジェクト作成してください"}
        {projectCreated && !docxPath.trim() && "次: 原稿docxと行番号付きPDFを選択してください"}
        {projectCreated && docxPath.trim() && pdfPath.trim() && !validationOk && "次: 入力ファイルを確認してください"}
        {projectCreated && validationOk && !sourceAttached && "次: プロジェクトに取り込んでください"}
        {sourceAttached && "プロジェクト準備完了。「前処理」メニューに進んでください"}
      </div>
    </div>
  );
}
