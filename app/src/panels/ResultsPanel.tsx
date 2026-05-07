interface ResultsPanelProps {
  projectPath: string;
  selectedResultFile: string;
  resultFileContent: string;
  resultFileLoading: boolean;
  onLoadResultFile: (filename: string) => void;
  onReloadResults: () => void;
  onOpenOutputFolder: () => void;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
}

const RESULT_FILES = [
  { file: "final_review.md", label: "最終査読コメント" },
  { file: "comments_to_authors.md", label: "著者向けコメント" },
  { file: "confidential_comments_to_editor.md", label: "編集者向けコメント" },
  { file: "recommendation.md", label: "推奨判定" },
  { file: "audit_trail.json", label: "処理記録" },
];

export default function ResultsPanel({
  projectPath,
  selectedResultFile,
  resultFileContent,
  resultFileLoading,
  onLoadResultFile,
  onReloadResults,
  onOpenOutputFolder,
  statusMessage,
}: ResultsPanelProps) {
  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <section className="panel">
        <h2>結果</h2>
        <div className="row">
          {RESULT_FILES.map(({ file, label }) => (
            <button
              key={file}
              onClick={() => onLoadResultFile(file)}
              disabled={!projectPath.trim()}
              style={
                selectedResultFile === file
                  ? { fontWeight: "bold", backgroundColor: "#d0e4f7" }
                  : {}
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="row">
          <button onClick={onReloadResults} disabled={!projectPath.trim()}>
            結果を再読み込み
          </button>
          <button onClick={onOpenOutputFolder} disabled={!projectPath.trim()}>
            出力フォルダを開く
          </button>
          {resultFileLoading && (
            <span className="status-chip running">読込中...</span>
          )}
        </div>
        <pre className="result-content">
          {resultFileContent || "ファイルを選択して結果を表示します。"}
        </pre>
      </section>
    </div>
  );
}
