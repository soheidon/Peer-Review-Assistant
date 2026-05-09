import React from "react";
import { slotDisplayName } from "../slotLabels";

interface ReferenceStyle {
  style_name: string;
  in_text_citation: string;
  reference_list_order: string;
  doi_required: string;
  url_access_date_required: boolean | null;
  journal_title_style: string;
  example_reference: string;
}

interface SubmissionGuidelines {
  word_limit: number | null;
  abstract_limit: number | null;
  figure_table_limits: string | null;
  supplementary_material_policy: string;
  data_availability_policy: string;
  ethics_policy: string;
  conflict_of_interest_policy: string;
  funding_statement_policy: string;
}

interface ReviewPolicy {
  novelty_requirement: string;
  methodological_requirements: string;
  statistical_reporting_expectations: string;
  reporting_guidelines: string[];
  reviewer_guidance: string;
  editorial_policy_summary: string;
}

export interface JournalProfile {
  journal_name: string;
  journal_url: string;
  publisher: string;
  article_type: string;
  reference_style: ReferenceStyle;
  submission_guidelines: SubmissionGuidelines;
  review_policy: ReviewPolicy;
  notes: string;
  source: string;
  source_details: string;
  updated_at: string;
}

interface LlmSlot {
  name: string;
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
  apiKeyMode: "direct" | "env_var";
  apiKeyEnvName: string;
}

interface JournalPanelProps {
  projectPath: string;
  journalProfile: JournalProfile;
  journalLoaded: boolean;
  journalLlmRunning: boolean;
  journalLoading: boolean;
  journalExternalPrompt: string;
  journalImportText: string;
  journalImportPreview: JournalProfile | null;
  journalImportError: string;
  llmSlots: LlmSlot[];
  onUpdateField: (path: string, value: unknown) => void;
  onSave: () => void;
  onLoad: () => void;
  onLlmGenerate: (slotName: string) => void;
  onGenerateExternalPrompt: () => void;
  onImportTextChange: (text: string) => void;
  onImportParse: () => void;
  onImportConfirm: () => void;
  statusMessage: { text: string; type: "ok" | "error" | "info" } | null;
}

const ARTICLE_TYPES = [
  "Article",
  "Original Article",
  "Brief Report",
  "Review",
  "Case Report",
  "Other",
];

const IN_TEXT_CITATION_OPTIONS = [
  { value: "numeric", label: "番号式" },
  { value: "author_year", label: "著者年式" },
  { value: "other", label: "その他" },
];

const REF_LIST_ORDER_OPTIONS = [
  { value: "order_of_appearance", label: "出現順" },
  { value: "alphabetical", label: "アルファベット順" },
];

const DOI_REQUIRED_OPTIONS = [
  { value: "required", label: "必須" },
  { value: "recommended_or_required_if_available", label: "推奨（付与可能なら必須）" },
  { value: "not_required", label: "不要" },
  { value: "unknown", label: "不明" },
];

const URL_DATE_OPTIONS = [
  { value: "null", label: "不明" },
  { value: "true", label: "必要" },
  { value: "false", label: "不要" },
];

const JOURNAL_TITLE_OPTIONS = [
  { value: "abbreviated", label: "略称" },
  { value: "full", label: "フル表記" },
  { value: "abbreviated_or_full", label: "略称またはフル表記" },
  { value: "unknown", label: "不明" },
];

export default function JournalPanel({
  projectPath,
  journalProfile,
  journalLoaded,
  journalLlmRunning,
  journalLoading,
  journalExternalPrompt,
  journalImportText,
  journalImportPreview,
  journalImportError,
  llmSlots,
  onUpdateField,
  onSave,
  onLoad,
  onLlmGenerate,
  onGenerateExternalPrompt,
  onImportTextChange,
  onImportParse,
  onImportConfirm,
  statusMessage,
}: JournalPanelProps) {
  const jp = journalProfile;
  const rs = jp.reference_style;
  const sg = jp.submission_guidelines;
  const rp = jp.review_policy;

  const configuredSlots = llmSlots.filter(
    (s) => s.provider.trim() && s.baseUrl.trim() && s.model.trim()
  );
  const [llmSlot, setLlmSlot] = React.useState(
    configuredSlots.length > 0 ? configuredSlots[0].name : ""
  );

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  };

  const txtStyle: React.CSSProperties = {
    width: "100%",
    minHeight: "60px",
    fontFamily: "inherit",
    fontSize: "12px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 600,
    color: "#555",
    minWidth: "140px",
  };

  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      {/* Section 1: 基本情報 */}
      <section className="panel">
        <h2>基本情報</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>ジャーナル名</span>
          <input
            type="text"
            className="path-input"
            value={jp.journal_name}
            onChange={(e) => onUpdateField("journal_name", e.target.value)}
            placeholder="例: Scientific Reports"
            style={{ flex: 1 }}
          />
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>ジャーナルURL</span>
          <input
            type="text"
            className="path-input"
            value={jp.journal_url}
            onChange={(e) => onUpdateField("journal_url", e.target.value)}
            placeholder="https://www.nature.com/srep/"
            style={{ flex: 1 }}
          />
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>出版社</span>
          <input
            type="text"
            className="path-input"
            value={jp.publisher}
            onChange={(e) => onUpdateField("publisher", e.target.value)}
            placeholder="Springer Nature"
            style={{ flex: 1 }}
          />
        </div>
        <div className="row">
          <span style={labelStyle}>論文種別</span>
          <select
            value={jp.article_type}
            onChange={(e) => onUpdateField("article_type", e.target.value)}
          >
            {ARTICLE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Section 2: 引用・文献形式 */}
      <section className="panel">
        <h2>引用・文献形式</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>本文中引用形式</span>
          <select
            value={rs.in_text_citation}
            onChange={(e) => onUpdateField("reference_style.in_text_citation", e.target.value)}
          >
            {IN_TEXT_CITATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>文献リストの順番</span>
          <select
            value={rs.reference_list_order}
            onChange={(e) => onUpdateField("reference_style.reference_list_order", e.target.value)}
          >
            {REF_LIST_ORDER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>DOI表記</span>
          <select
            value={rs.doi_required}
            onChange={(e) => onUpdateField("reference_style.doi_required", e.target.value)}
          >
            {DOI_REQUIRED_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>アクセス日</span>
          <select
            value={rs.url_access_date_required === null ? "null" : String(rs.url_access_date_required)}
            onChange={(e) => {
              const v = e.target.value;
              onUpdateField(
                "reference_style.url_access_date_required",
                v === "null" ? null : v === "true"
              );
            }}
          >
            {URL_DATE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>ジャーナル名表記</span>
          <select
            value={rs.journal_title_style}
            onChange={(e) => onUpdateField("reference_style.journal_title_style", e.target.value)}
          >
            {JOURNAL_TITLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div className="row">
          <span style={{ ...labelStyle, alignSelf: "flex-start" }}>参考文献の書式例</span>
          <textarea
            style={txtStyle}
            rows={3}
            value={rs.example_reference}
            onChange={(e) => onUpdateField("reference_style.example_reference", e.target.value)}
            placeholder="著者名. タイトル. 雑誌名 巻, ページ (年)."
          />
        </div>
      </section>

      {/* Section 3: 投稿規定 */}
      <section className="panel">
        <h2>投稿規定</h2>
        <div className="row" style={{ marginBottom: 6, gap: 16 }}>
          <span style={labelStyle}>Abstract制限（語数）</span>
          <input
            type="number"
            className="path-input"
            value={sg.abstract_limit ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onUpdateField("submission_guidelines.abstract_limit", v === "" ? null : Number(v));
            }}
            style={{ width: 120 }}
          />
          <span style={{ ...labelStyle, minWidth: "auto" }}>Word制限</span>
          <input
            type="number"
            className="path-input"
            value={sg.word_limit ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              onUpdateField("submission_guidelines.word_limit", v === "" ? null : Number(v));
            }}
            style={{ width: 120 }}
          />
        </div>
        <div className="row" style={{ marginBottom: 6 }}>
          <span style={labelStyle}>図表制限</span>
          <input
            type="text"
            className="path-input"
            value={sg.figure_table_limits ?? ""}
            onChange={(e) => {
              onUpdateField("submission_guidelines.figure_table_limits", e.target.value || null);
            }}
            style={{ flex: 1 }}
          />
        </div>
        {([
          ["supplementary_material_policy", "補足資料方針"],
          ["data_availability_policy", "データ利用方針"],
          ["ethics_policy", "倫理規定"],
          ["conflict_of_interest_policy", "利益相反方針"],
          ["funding_statement_policy", "資金提供記載方針"],
        ] as [string, string][]).map(([key, label]) => (
          <div className="row" key={key} style={{ marginBottom: 4 }}>
            <span style={{ ...labelStyle, alignSelf: "flex-start" }}>{label}</span>
            <textarea
              style={txtStyle}
              rows={2}
              value={(sg as Record<string, unknown>)[key] as string}
              onChange={(e) => onUpdateField(`submission_guidelines.${key}`, e.target.value)}
            />
          </div>
        ))}
      </section>

      {/* Section 4: 査読・掲載方針 */}
      <section className="panel">
        <h2>査読・掲載方針</h2>
        {([
          ["novelty_requirement", "新規性要件"],
          ["methodological_requirements", "方法論的要件"],
          ["statistical_reporting_expectations", "統計報告基準"],
        ] as [string, string][]).map(([key, label]) => (
          <div className="row" key={key} style={{ marginBottom: 4 }}>
            <span style={{ ...labelStyle, alignSelf: "flex-start" }}>{label}</span>
            <textarea
              style={txtStyle}
              rows={2}
              value={(rp as Record<string, unknown>)[key] as string}
              onChange={(e) => onUpdateField(`review_policy.${key}`, e.target.value)}
            />
          </div>
        ))}
        <div className="row" style={{ marginBottom: 4 }}>
          <span style={{ ...labelStyle, alignSelf: "flex-start" }}>報告ガイドライン</span>
          <textarea
            style={txtStyle}
            rows={3}
            value={rp.reporting_guidelines.join("\n")}
            onChange={(e) =>
              onUpdateField(
                "review_policy.reporting_guidelines",
                e.target.value.split("\n").map((s) => s.trim()).filter(Boolean)
              )
            }
            placeholder="1行に1つずつ入力（例: CONSORT, STROBE, PRISMA）"
          />
        </div>
        {([
          ["reviewer_guidance", "査読者向け指針"],
          ["editorial_policy_summary", "編集方針概要"],
        ] as [string, string][]).map(([key, label]) => (
          <div className="row" key={key} style={{ marginBottom: 4 }}>
            <span style={{ ...labelStyle, alignSelf: "flex-start" }}>{label}</span>
            <textarea
              style={txtStyle}
              rows={3}
              value={(rp as Record<string, unknown>)[key] as string}
              onChange={(e) => onUpdateField(`review_policy.${key}`, e.target.value)}
            />
          </div>
        ))}
      </section>

      {/* Section 5: 備考 */}
      <section className="panel">
        <h2>備考</h2>
        <div className="row" style={{ marginBottom: 4 }}>
          <span style={{ ...labelStyle, alignSelf: "flex-start" }}>備考</span>
          <textarea
            style={txtStyle}
            rows={4}
            value={jp.notes}
            onChange={(e) => onUpdateField("notes", e.target.value)}
          />
        </div>
        <div className="row" style={{ marginBottom: 4, fontSize: 11, color: "#888" }}>
          <span style={labelStyle}>情報源</span>
          <span>{jp.source || "manual"}</span>
        </div>
        {jp.source_details && (
          <div className="row" style={{ marginBottom: 4, fontSize: 11, color: "#888" }}>
            <span style={labelStyle}>情報源詳細</span>
            <span>{jp.source_details}</span>
          </div>
        )}
        {jp.updated_at && (
          <div className="row" style={{ marginBottom: 4, fontSize: 11, color: "#888" }}>
            <span style={labelStyle}>更新日時</span>
            <span>{jp.updated_at}</span>
          </div>
        )}
      </section>

      {/* Action buttons */}
      <section className="panel">
        <h2>操作</h2>
        <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
          <button onClick={onSave} disabled={!projectPath || journalLoading}>
            {journalLoading ? "保存中..." : "保存"}
          </button>
          <button onClick={onLoad} disabled={!projectPath || journalLoading}>
            読み込み
          </button>
          {journalLoaded && (
            <span className="status-chip ok">読込済</span>
          )}
        </div>

        <div className="row" style={{ marginTop: 12, flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>
            LLMでジャーナル情報を取得
          </span>
          {configuredSlots.length > 0 ? (
            <>
              <select
                value={llmSlot}
                onChange={(e) => setLlmSlot(e.target.value)}
                disabled={journalLlmRunning}
              >
                {configuredSlots.map((s) => (
                  <option key={s.name} value={s.name}>
                    {slotDisplayName(s.name)} ({s.model})
                  </option>
                ))}
              </select>
              <button
                onClick={() => onLlmGenerate(llmSlot)}
                disabled={journalLlmRunning || !jp.journal_name.trim()}
              >
                {journalLlmRunning ? "生成中..." : "実行"}
              </button>
            </>
          ) : (
            <span style={{ fontSize: 11, color: "#999" }}>
              LLMスロットが未設定です。「設定」タブでAPI設定を行ってください。
            </span>
          )}
          {journalLlmRunning && (
            <span className="status-chip running">実行中...</span>
          )}
        </div>
        {!jp.journal_name.trim() && configuredSlots.length > 0 && (
          <div className="disabled-reason">先に「ジャーナル名」を入力してください</div>
        )}

        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button onClick={onGenerateExternalPrompt}>
            外部AI用プロンプトを作成
          </button>
        </div>
        {journalExternalPrompt && (
          <div style={{ marginTop: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: "#555" }}>
                プロンプト（ChatGPT / DeepSeek等に貼り付け）
              </span>
              <button
                onClick={() => copyToClipboard(journalExternalPrompt)}
                style={{ fontSize: 11, height: 24 }}
              >
                コピー
              </button>
            </div>
            <pre
              style={{
                background: "#f5f5f5",
                border: "1px solid #ddd",
                borderRadius: 4,
                padding: 12,
                fontSize: 11,
                maxHeight: 300,
                overflowY: "auto",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {journalExternalPrompt}
            </pre>
          </div>
        )}
      </section>

      {/* Import section */}
      <section className="panel">
        <h2>外部AI結果の貼り付け取り込み</h2>
        <div className="row" style={{ marginBottom: 6 }}>
          <textarea
            style={{ ...txtStyle, minHeight: "120px" }}
            placeholder='ChatGPTやDeepSeekで取得したJSONを貼り付けてください...'
            value={journalImportText}
            onChange={(e) => onImportTextChange(e.target.value)}
          />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button onClick={onImportParse} disabled={!journalImportText.trim()}>
            パース
          </button>
          {journalImportError && (
            <span style={{ fontSize: 12, color: "#c42b1c" }}>{journalImportError}</span>
          )}
        </div>
        {journalImportPreview && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "#107c10", marginBottom: 6 }}>
              プレビュー（取り込み前に確認してください）
            </div>
            <div style={{ fontSize: 11, maxHeight: 200, overflowY: "auto", background: "#f9f9f9", padding: 8, borderRadius: 4 }}>
              {Object.entries(journalImportPreview).map(([k, v]) => {
                if (typeof v === "object" && v !== null) {
                  return (
                    <div key={k} style={{ marginBottom: 4 }}>
                      <strong>{k}:</strong>
                      <pre style={{ margin: "2px 0 0 16px", fontSize: 10 }}>
                        {JSON.stringify(v, null, 2)}
                      </pre>
                    </div>
                  );
                }
                return (
                  <div key={k}>
                    <strong>{k}:</strong> {String(v ?? "(null)")}
                  </div>
                );
              })}
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <button onClick={onImportConfirm}>
                この内容で取り込む
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Next step hint */}
      <div className="next-step">
        {!projectPath && "プロジェクトを作成してください。"}
        {projectPath && !journalLoaded && !jp.journal_name.trim() &&
          "LLMでジャーナル情報を取得するか、直接フォームに入力して保存してください。"}
        {projectPath && journalLoaded &&
          "ジャーナル情報を編集後、「保存」を押してください。次の工程（文献確認・査読チェック）で自動参照されます。"}
      </div>
    </div>
  );
}
