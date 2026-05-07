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
  onOpenExisting: () => void;
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
  onOpenExisting,
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
            disabled={projectCreated}
            style={projectCreated ? { backgroundColor: "#f0f0f0", color: "#888" } : {}}
          />
          <button onClick={onBrowseFolder} disabled={projectCreated}>参照</button>
        </div>
        <div className="row">
          <button onClick={onOpenExisting} disabled={projectCreated}>
            既存プロジェクトを開く
          </button>
          <button onClick={onCreateProject} disabled={projectCreated}>
            新規プロジェクト作成
          </button>
          {projectCreated && <span className="status-chip ok">作成済</span>}
        </div>
        {projectCreated && (
          <p style={{ fontSize: "11px", color: "#107c10", marginTop: 4 }}>
            プロジェクトを作成しました。別のプロジェクトを選択するには上のフィールドを変更してください。
          </p>
        )}
        {!projectCreated && (
          <div className="disabled-reason">
            「既存プロジェクトを開く」で project.json のあるフォルダを選ぶか、「新規プロジェクト作成」で空フォルダに作成してください。
          </div>
        )}
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
            placeholder="PDFを選択（任意・行番号付き推奨）..."
            className="path-input"
          />
          <button onClick={onBrowsePdf}>参照</button>
        </div>
        {!pdfPath && docxPath && (
          <div style={{ fontSize: "11px", color: "#ca5010", marginBottom: 6 }}>
            PDFが選択されていません。行番号によるコメントは利用できませんが、docx本文に基づく処理は可能です。
          </div>
        )}
        <div className="row">
          <button
            onClick={onValidateInput}
            disabled={validateRunning || !docxPath.trim()}
          >
            {validateRunning ? "確認中..." : "入力ファイルを確認"}
          </button>
          {validateRunning && <span className="status-chip running">実行中...</span>}
          {validationOk && !validateRunning && <span className="status-chip ok">確認済</span>}
        </div>
        {!validationOk && !validateRunning && docxPath.trim() && (
          <div className="disabled-reason">「入力ファイルを確認」をクリックしてください</div>
        )}
        <div className="row">
          <button
            onClick={onAttachSource}
            disabled={!projectPath || !validationOk || attachRunning}
          >
            {attachRunning ? "取り込み中..." : "プロジェクトに取り込み"}
          </button>
          {attachRunning && <span className="status-chip running">実行中...</span>}
          {sourceAttached && !attachRunning && <span className="status-chip ok">取込済</span>}
        </div>
        {!sourceAttached && !attachRunning && !projectPath && (
          <div className="disabled-reason">プロジェクトフォルダを選択してください</div>
        )}
        {!sourceAttached && !attachRunning && projectPath && !projectCreated && validationOk && (
          <div className="disabled-reason">「新規プロジェクト作成」または「既存プロジェクトを開く」でプロジェクトを有効化してください</div>
        )}
        {!sourceAttached && !attachRunning && projectCreated && validationOk && (
          <div className="disabled-reason">「プロジェクトに取り込み」をクリックしてください</div>
        )}
        {!sourceAttached && !attachRunning && !validationOk && docxPath.trim() && projectCreated && (
          <div className="disabled-reason">先に入力ファイルを確認してください</div>
        )}
        {!sourceAttached && !attachRunning && !validationOk && docxPath.trim() && !projectCreated && projectPath && (
          <div className="disabled-reason">先に入力ファイルを確認し、プロジェクトを作成または開いてください</div>
        )}
        {!sourceAttached && !attachRunning && !docxPath.trim() && projectPath && (
          <div className="disabled-reason">原稿docxを選択してください</div>
        )}
      </section>

      {/* Next step suggestion */}
      <div className="next-step">
        {!projectPath && "次: プロジェクトフォルダを選択し、「既存プロジェクトを開く」または「新規プロジェクト作成」してください"}
        {projectPath && !projectCreated && "次: 「既存プロジェクトを開く」または「新規プロジェクト作成」でプロジェクトを有効化してください"}
        {projectCreated && !docxPath.trim() && "次: 原稿docxを選択してください（PDFは任意）"}
        {projectCreated && docxPath.trim() && !validationOk && "次: 入力ファイルを確認してください"}
        {projectCreated && validationOk && !sourceAttached && "次: プロジェクトに取り込んでください"}
        {sourceAttached && "プロジェクト準備完了。「前処理」メニューに進んでください"}
      </div>
    </div>
  );
}
