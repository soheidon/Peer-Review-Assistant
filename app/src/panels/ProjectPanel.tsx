interface ProjectPanelProps {
  projectPath: string;
  projectCreated: boolean;
  docxPath: string;
  pdfPath: string;
  validationOk: boolean;
  sourceAttached: boolean;
  onProjectPathChange: (path: string) => void;
  onBrowseFolder: () => void;
  onCreateProject: () => void;
  onDocxPathChange: (path: string) => void;
  onBrowseDocx: () => void;
  onPdfPathChange: (path: string) => void;
  onBrowsePdf: () => void;
  onValidateInput: () => void;
  onAttachSource: () => void;
  onPreprocessSource: () => void;
}

export default function ProjectPanel({
  projectPath,
  projectCreated,
  docxPath,
  pdfPath,
  validationOk,
  sourceAttached,
  onProjectPathChange,
  onBrowseFolder,
  onCreateProject,
  onDocxPathChange,
  onBrowseDocx,
  onPdfPathChange,
  onBrowsePdf,
  onValidateInput,
  onAttachSource,
  onPreprocessSource,
}: ProjectPanelProps) {
  return (
    <div>
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
          <button onClick={onBrowseFolder}>Browse</button>
        </div>
        <div className="row">
          <button onClick={onCreateProject}>Create New Project</button>
          {projectCreated && <span className="status-chip ok">Created</span>}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 12 }}>
        <h2>原稿ファイル</h2>
        <div className="row">
          <input
            type="text"
            value={docxPath}
            onChange={(e) => onDocxPathChange(e.target.value)}
            placeholder="Manuscript .docx を選択..."
            className="path-input"
          />
          <button onClick={onBrowseDocx}>Browse</button>
        </div>
        <div className="row">
          <input
            type="text"
            value={pdfPath}
            onChange={(e) => onPdfPathChange(e.target.value)}
            placeholder="Line-numbered PDF を選択..."
            className="path-input"
          />
          <button onClick={onBrowsePdf}>Browse</button>
        </div>
        <div className="row">
          <button onClick={onValidateInput}>Validate Input Files</button>
          {validationOk && <span className="status-chip ok">Valid</span>}
        </div>
        <div className="row">
          <button
            onClick={onAttachSource}
            disabled={!validationOk || !projectCreated}
          >
            Attach to Project
          </button>
          {sourceAttached && <span className="status-chip ok">Attached</span>}
        </div>
        <div className="row">
          <button onClick={onPreprocessSource} disabled={!sourceAttached}>
            Preprocess docx
          </button>
        </div>
      </section>
    </div>
  );
}
