import { slotDisplayName } from "../slotLabels";

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  enabled?: boolean;
}

interface ReviewChecksPanelProps {
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

export default function ReviewChecksPanel({
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
  const reviewers = llmSlots.filter((s) => s.name.startsWith("reviewer") && s.enabled !== false);
  const allReviewersConfigured = reviewers.length > 0 && reviewers.every(
    (s) => s.provider.trim() && s.baseUrl.trim() && s.model.trim() && s.apiKey.trim()
  );
  const anyReviewerDone = (results: Record<string, string>) =>
    reviewers.some((s) => results[s.name] === "done");

  const renderCheckRow = (
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
          return (
            <div key={slot.name} style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                onClick={() => onCheck(slot.name)}
                disabled={!crossrefDone || isRunning || !allReviewersConfigured}
              >
                {isRunning ? `${runningLabel}中...` : slotDisplayName(slot.name)}
              </button>
              {result && result !== "running" && (
                <span className={`status-chip ${result === "done" ? "ok" : "err"}`}>
                  {result === "done" ? "完了" : "失敗"}
                </span>
              )}
              {isRunning && <span className="status-chip running">実行中...</span>}
            </div>
          );
        })}
      </div>
      {!crossrefDone && (
        <div className="disabled-reason">先に文献DB照合を完了してください</div>
      )}
      {crossrefDone && !allReviewersConfigured && (
        <div className="disabled-reason">
          LLM設定が未完了です。
          <button
            onClick={onNavigateToSettings}
            style={{ fontSize: "11px", height: "22px", padding: "1px 8px", marginLeft: 6 }}
          >
            設定を開く
          </button>
        </div>
      )}
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

  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <section className="panel">
        <h2>構成</h2>
        {renderCheckRow("構成", structureCheckResults, onStructureCheck, "構成チェック実行")}
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
        {renderCheckRow("表現", expressionCheckResults, onExpressionCheck, "表現チェック実行")}
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
        {renderCheckRow("方法・統計", methodsStatsCheckResults, onMethodsStatsCheck, "方法・統計チェック実行")}
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
        {!crossrefDone && "次: 「前処理」メニューから文献DB照合を完了してください"}
        {crossrefDone && !allReviewersConfigured && "次: 「設定」メニューからLLM API設定を行ってください"}
        {crossrefDone && allReviewersConfigured && !anyReviewerDone(structureCheckResults) && "次: 構成チェックを実行してください"}
        {structureMergeDone && !finalMergeDone && "次: 最終査読コメントを生成してください"}
        {finalMergeDone && "査読完了。「結果」メニューで出力を確認してください"}
      </div>
    </div>
  );
}
