interface ResultsPanelProps {
  projectPath: string;
  selectedResultFile: string;
  resultFileContent: string;
  resultFileLoading: boolean;
  onLoadResultFile: (filename: string) => void;
  onReloadResults: () => void;
  onOpenOutputFolder: () => void;
}

const RESULT_FILES = [
  { file: "final_review.md", label: "Final Review" },
  { file: "comments_to_authors.md", label: "Comments to Authors" },
  { file: "confidential_comments_to_editor.md", label: "Confidential to Editor" },
  { file: "recommendation.md", label: "Recommendation" },
  { file: "audit_trail.json", label: "Audit Trail" },
];

export default function ResultsPanel({
  projectPath,
  selectedResultFile,
  resultFileContent,
  resultFileLoading,
  onLoadResultFile,
  onReloadResults,
  onOpenOutputFolder,
}: ResultsPanelProps) {
  return (
    <div>
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
            Reload Results
          </button>
          <button onClick={onOpenOutputFolder} disabled={!projectPath.trim()}>
            Open Output Folder
          </button>
          {resultFileLoading && (
            <span className="status-chip" style={{ backgroundColor: "#eee", color: "#555" }}>
              Loading...
            </span>
          )}
        </div>
        <pre className="result-content">
          {resultFileContent || "ファイルを選択して結果を表示します。"}
        </pre>
      </section>
    </div>
  );
}
