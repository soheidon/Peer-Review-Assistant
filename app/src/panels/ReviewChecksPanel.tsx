import { useEffect, useState } from "react";
import { slotDisplayName } from "../slotLabels";

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  proModel?: string;
  apiKey: string;
  enabled?: boolean;
  apiKeyMode?: "direct" | "env_var";
  apiKeyEnvName?: string;
  apiKeyStorage?: "none" | "windows_hello";
}

interface CheckFinding {
  severity: string;
  category: string;
  location: {
    section?: string;
    paragraph_start?: number | null;
    paragraph_end?: number | null;
    text_excerpt?: string;
  };
  issue: string;
  suggested_comment: string;
  confidence: string;
  finding_id?: string;
}

interface CheckResult {
  check_name: string;
  source: string;
  status: string;
  generated_at: string;
  model: string;
  summary: string;
  findings: CheckFinding[];
}

interface ReviewChecksPanelProps {
  projectPath: string;
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
  onNavigateToSettings: () => void;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
}

const CHECK_LABELS: Record<string, string> = {
  structure: "構成",
  expression: "表現",
  methods_stats: "方法・統計",
};

export default function ReviewChecksPanel({
  projectPath,
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
  onNavigateToSettings,
  statusMessage,
}: ReviewChecksPanelProps) {
  // 親の crossrefDone が false でも実際にファイルがあれば OK とする自己防衛チェック
  const [crossrefFileOk, setCrossrefFileOk] = useState(false);
  useEffect(() => {
    if (!projectPath.trim()) return;
    const check = async () => {
      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const path = `${projectPath.replace(/\\/g, "/")}/citations/db_verified_references.json`;
        await invoke<string>("read_text_file", { path });
        setCrossrefFileOk(true);
      } catch {
        setCrossrefFileOk(false);
      }
    };
    check();
  }, [projectPath]);
  const crossrefReallyDone = crossrefDone || crossrefFileOk;

  const [viewerCheck, setViewerCheck] = useState<string | null>(null);
  const [viewerSlot, setViewerSlot] = useState<string | null>(null);
  const [viewerData, setViewerData] = useState<CheckResult | null>(null);
  const [viewerLoading, setViewerLoading] = useState(false);
  const [viewerError, setViewerError] = useState<string | null>(null);

  function isReviewerConfigured(s: LlmSlot): boolean {
    if (s.enabled === false) return false;
    if (!s.provider?.trim()) return false;
    if (!s.baseUrl?.trim()) return false;
    // apiKeyMode === "direct" かつ windows_hello なら apiKey 空でも OK
    if (s.apiKeyMode === "direct") {
      if (s.apiKeyStorage === "windows_hello") return true;
      return !!s.apiKey?.trim();
    }
    // apiKeyMode === "env_var" なら apiKeyEnvName があれば OK
    if (s.apiKeyMode === "env_var") {
      return !!s.apiKeyEnvName?.trim();
    }
    // fallback: apiKeyMode 未設定なら apiKey 直接チェック
    return !!s.apiKey?.trim();
  }

  function getReviewerDisabledReason(s: LlmSlot): string | null {
    if (!s) return "査読AIスロットが見つかりません。";
    if (s.enabled === false) return "査読AIスロットが無効です。";
    if (!s.provider?.trim()) return "プロバイダが未設定です。";
    if (!s.baseUrl?.trim()) return "API URLが未設定です。";
    if (s.apiKeyMode === "direct" && s.apiKeyStorage !== "windows_hello" && !s.apiKey?.trim()) {
      return "APIキーが未入力です。";
    }
    if (s.apiKeyMode === "env_var" && !s.apiKeyEnvName?.trim()) {
      return "APIキー環境変数名が未設定です。";
    }
    return null;
  }

  const reviewers = llmSlots.filter((s) => s.name.startsWith("reviewer") && s.enabled !== false);
  const allReviewersConfigured = reviewers.length > 0 && reviewers.every(isReviewerConfigured);
  const anyReviewerDone = (results: Record<string, string>) =>
    reviewers.some((s) => results[s.name] === "done");

  const loadViewerResult = async (checkName: string, slotName: string) => {
    if (!projectPath.trim()) return;
    setViewerCheck(checkName);
    setViewerSlot(slotName);
    setViewerLoading(true);
    setViewerError(null);
    setViewerData(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const filePath = `${projectPath.replace(/\\/g, "/")}/outputs/${checkName}/${slotName}.raw.json`;
      const raw = await invoke<string>("read_text_file", { path: filePath });
      const parsed = JSON.parse(raw) as CheckResult;
      setViewerData(parsed);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setViewerError(msg.includes("not found") || msg.includes("No such file")
        ? "結果ファイルが見つかりません。先にチェックを実行してください。"
        : `読み込みエラー: ${msg}`);
    } finally {
      setViewerLoading(false);
    }
  };

  const renderCheckRow = (
    checkName: string,
    label: string,
    results: Record<string, string>,
    onCheck: (slotName: string) => void,
    runningLabel: string
  ) => (
    <div>
      <div className="row">
        <span className="llm-slot-label">{label}</span>
        {reviewers.map((slot) => {
          const result = results[slot.name];
          const isRunning = result === "running";
          const isDone = result === "done";
          return (
            <div key={slot.name} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                onClick={() => onCheck(slot.name)}
                disabled={!crossrefReallyDone || isRunning || !allReviewersConfigured}
              >
                {isRunning ? `${runningLabel}中...` : slotDisplayName(slot.name)}
              </button>
              {result && result !== "running" && (
                <span className={`status-chip ${isDone ? "ok" : "err"}`}>
                  {isDone ? "完了" : "失敗"}
                </span>
              )}
              {isRunning && <span className="status-chip running">実行中...</span>}
              {isDone && (
                <button
                  onClick={() => loadViewerResult(checkName, slot.name)}
                  style={{ fontSize: "11px", height: "22px", padding: "1px 6px" }}
                >
                  結果
                </button>
              )}
            </div>
          );
        })}
      </div>
      {!crossrefReallyDone && (
        <div className="disabled-reason">先に文献DB照合を完了してください</div>
      )}
      {crossrefReallyDone && !allReviewersConfigured && (() => {
        const bad = reviewers.find((s) => !isReviewerConfigured(s));
        const reason = bad ? getReviewerDisabledReason(bad) : "LLM設定が未完了です。";
        return (
          <div className="disabled-reason">
            {reason}
            <button
              onClick={onNavigateToSettings}
              style={{ fontSize: "11px", height: "22px", padding: "1px 8px", marginLeft: 6 }}
            >
              設定を開く
            </button>
          </div>
        );
      })()}
    </div>
  );

  const renderMergeRow = (
    label: string,
    done: boolean,
    running: boolean,
    results: Record<string, string>,
    onMerge: () => void,
    runningLabel: string
  ) => (
    <div>
      <div className="row">
        <button
          onClick={onMerge}
          disabled={
            done ||
            running ||
            !anyReviewerDone(results)
          }
        >
          {running ? `${runningLabel}中...` : label}
        </button>
        {done && <span className="status-chip ok">統合済</span>}
        {running && <span className="status-chip running">統合中...</span>}
      </div>
      {!done && !running && !anyReviewerDone(results) && (
        <div className="disabled-reason">先にチェック結果を生成してください</div>
      )}
    </div>
  );

  const severityBadge = (s: string) => {
    if (s === "major") return <span className="status-chip err">重大</span>;
    if (s === "minor") return <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      fontSize: "11px", fontWeight: 600, background: "#f0ad4e", color: "#fff"
    }}>軽微</span>;
    return <span className="status-chip">{s}</span>;
  };

  const confidenceBadge = (c: string) => {
    const color = c === "high" ? "#5cb85c" : c === "medium" ? "#f0ad4e" : "#999";
    return <span style={{
      display: "inline-block", padding: "1px 6px", borderRadius: 3,
      fontSize: "10px", fontWeight: 600, background: color, color: "#fff"
    }}>{c === "high" ? "高" : c === "medium" ? "中" : "低"}</span>;
  };

  const renderViewer = () => (
    <div style={{ flex: 1, minWidth: 0, padding: "8px 12px", borderLeft: "1px solid #ccc", overflowY: "auto", maxHeight: "calc(100vh - 160px)" }}>
      {viewerLoading && <div style={{ color: "#888", padding: 20 }}>読み込み中...</div>}
      {viewerError && <div className="status-banner err" style={{ margin: 8 }}>{viewerError}</div>}
      {viewerData && (
        <div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>
              {CHECK_LABELS[viewerData.check_name] || viewerData.check_name}
              {" — "}{slotDisplayName(viewerData.source)}
            </h3>
            <span style={{ fontSize: "11px", color: "#888" }}>{viewerData.model}</span>
            <span style={{ fontSize: "11px", color: "#888" }}>
              {new Date(viewerData.generated_at).toLocaleString("ja-JP")}
            </span>
          </div>

          {/* Summary */}
          <div style={{
            background: "#f5f5f5", padding: "10px 14px", borderRadius: 6,
            marginBottom: 12, fontSize: "13px", lineHeight: 1.6, whiteSpace: "pre-wrap"
          }}>
            {viewerData.summary}
          </div>

          {/* Findings */}
          <div style={{ fontSize: "12px" }}>
            <strong>指摘事項 ({viewerData.findings.length}件)</strong>
          </div>
          {viewerData.findings.length === 0 && (
            <div style={{ color: "#888", padding: "12px 0" }}>指摘事項はありません。</div>
          )}
          {viewerData.findings.map((f, i) => (
            <div key={f.finding_id || i} style={{
              border: "1px solid #e0e0e0", borderRadius: 6, padding: "10px 12px",
              marginTop: 8, background: "#fafafa"
            }}>
              <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
                <strong>#{i + 1}</strong>
                {severityBadge(f.severity)}
                {confidenceBadge(f.confidence)}
                <span style={{ fontSize: "11px", color: "#555" }}>{f.category}</span>
              </div>

              {/* Location */}
              {f.location && (
                <div style={{ fontSize: "11px", color: "#666", marginBottom: 6 }}>
                  {f.location.section && <span>📍 {f.location.section}</span>}
                  {(f.location.paragraph_start != null) && (
                    <span> P{f.location.paragraph_start}{f.location.paragraph_end != null && f.location.paragraph_end !== f.location.paragraph_start ? `–${f.location.paragraph_end}` : ""}</span>
                  )}
                  {f.location.text_excerpt && (
                    <div style={{
                      marginTop: 2, padding: "4px 8px", background: "#fff",
                      borderLeft: "3px solid #ccc", fontSize: "11px", color: "#444",
                      fontStyle: "italic"
                    }}>
                      「{f.location.text_excerpt}」
                    </div>
                  )}
                </div>
              )}

              {/* Issue */}
              <div style={{ fontSize: "13px", lineHeight: 1.5, marginBottom: 8 }}>
                {f.issue}
              </div>

              {/* Suggested comment */}
              <div style={{
                padding: "8px 12px", background: "#e8f4fd", borderRadius: 4,
                fontSize: "12px", lineHeight: 1.5, borderLeft: "3px solid #2196F3"
              }}>
                <div style={{ fontSize: "10px", color: "#2196F3", fontWeight: 600, marginBottom: 2 }}>
                  査読コメント案
                </div>
                {f.suggested_comment}
              </div>
            </div>
          ))}
        </div>
      )}
      {!viewerLoading && !viewerError && !viewerData && (
        <div style={{ color: "#aaa", padding: 20, textAlign: "center" }}>
          チェック完了後に「結果」ボタンをクリックしてください
        </div>
      )}
    </div>
  );

  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <div style={{ display: "flex", gap: 0 }}>
        {/* Left: controls */}
        <div style={{ flex: "0 0 420px" }}>
          <section className="panel">
            <h2>構成</h2>
            {renderCheckRow("structure", "構成", structureCheckResults, onStructureCheck, "構成チェック実行")}
            {renderMergeRow(
              "構成チェック結果を統合",
              structureMergeDone,
              structureMergeRunning,
              structureCheckResults,
              onMergeStructure,
              "構成チェック結果を統合"
            )}
          </section>

          <section className="panel" style={{ marginTop: 12 }}>
            <h2>表現</h2>
            {renderCheckRow("expression", "表現", expressionCheckResults, onExpressionCheck, "表現チェック実行")}
            {renderMergeRow(
              "表現チェック結果を統合",
              expressionMergeDone,
              expressionMergeRunning,
              expressionCheckResults,
              onMergeExpression,
              "表現チェック結果を統合"
            )}
          </section>

          <section className="panel" style={{ marginTop: 12 }}>
            <h2>方法・統計</h2>
            {renderCheckRow("methods_stats", "方法・統計", methodsStatsCheckResults, onMethodsStatsCheck, "方法・統計チェック実行")}
            {renderMergeRow(
              "方法・統計チェック結果を統合",
              methodsStatsMergeDone,
              methodsStatsMergeRunning,
              methodsStatsCheckResults,
              onMergeMethodsStats,
              "方法・統計チェック結果を統合"
            )}
          </section>

          <section className="panel" style={{ marginTop: 12 }}>
            <h2>最終出力</h2>
            <div className="row">
              <button
                onClick={onFinalMerge}
                disabled={!structureMergeDone || finalMergeDone || finalMergeRunning}
              >
                {finalMergeRunning ? "生成中..." : "最終査読コメントを生成"}
              </button>
              {finalMergeDone && <span className="status-chip ok">生成済</span>}
              {finalMergeRunning && <span className="status-chip running">生成中...</span>}
            </div>
            {!structureMergeDone && !finalMergeRunning && !finalMergeDone && (
              <div className="disabled-reason">先に構成チェック結果を統合してください</div>
            )}
          </section>

          {/* Next step */}
          <div className="next-step">
            {!crossrefReallyDone && "次: 「前処理」メニューから文献DB照合を完了してください"}
            {crossrefReallyDone && !allReviewersConfigured && "次: 「設定」メニューからLLM API設定を行ってください"}
            {crossrefReallyDone && allReviewersConfigured && !anyReviewerDone(structureCheckResults) && "次: 構成チェックを実行してください"}
            {structureMergeDone && !finalMergeDone && "次: 最終査読コメントを生成してください"}
            {finalMergeDone && "査読完了。「結果」メニューで出力を確認してください"}
          </div>
        </div>

        {/* Right: viewer */}
        {renderViewer()}
      </div>
    </div>
  );
}
