import React from "react";
import { slotDisplayName } from "../slotLabels";
import { parseLooseJsonObject } from "../utils";

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

export interface PublicationCriteria {
  novelty_required: string;
  impact_required: string;
  significance_required: string;
  technical_soundness_focus: string;
  methodological_rigour_focus: string;
  statistical_rigour_focus: string;
  conclusion_supported_by_data_focus: string;
  ethical_robustness_focus: string;
  data_availability_focus: string;
  reproducibility_transparency_focus: string;
}

export interface ResearchTypeAcceptance {
  accepts_incremental_research: string;
  accepts_confirmatory_research: string;
  accepts_replication: string;
  accepts_negative_or_null_results: string;
  accepts_niche_scope: string;
  accepts_multidisciplinary_work: string;
}

export interface JournalPosition {
  multidisciplinary_mega_journal: string;
  broad_scope_journal: string;
  field_specific_high_impact_journal: string;
  clinical_high_impact_journal: string;
  society_journal: string;
  journal_position_summary: string;
}

export interface JournalMetrics {
  impact_factor: string;
  five_year_impact_factor: string;
  cite_score: string;
  sjr: string;
  snip: string;
  quartile: string;
  category_rankings: string;
  indexing: string;
  acceptance_rate_if_available: string;
}

export interface SubmissionStrategy {
  suitable_novelty_strategy: string;
  suitable_framing_strategy: string;
  unsuitable_claims: string;
  claims_to_avoid: string;
  reviewer_likely_concerns: string;
  manuscript_strengths_to_emphasize: string;
  manuscript_weaknesses_to_control: string;
}

export interface SourceEntry {
  url: string;
  title: string;
  accessed_at: string;
  retrieved_text_summary: string;
}

export interface JournalProfile {
  journal_name: string;
  journal_url: string;
  publisher: string;
  article_type: string;
  reference_style: ReferenceStyle;
  submission_guidelines: SubmissionGuidelines;
  review_policy: ReviewPolicy;
  publication_criteria: PublicationCriteria;
  research_type_acceptance: ResearchTypeAcceptance;
  journal_position: JournalPosition;
  metrics: JournalMetrics;
  submission_strategy: SubmissionStrategy;
  sources: SourceEntry[];
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
  proModel: string;
  flashModel: string;
  reasoningMode: "separate_models" | "same_model_with_thinking" | "none_or_unknown";
  apiKey: string;
  apiKeyMode: "direct" | "env_var";
  apiKeyEnvName: string;
  enabled?: boolean;
}

interface JournalPanelProps {
  projectPath: string;
  journalProfile: JournalProfile;
  journalLoaded: boolean;
  journalSaved: boolean;
  journalLlmRunning: boolean;
  journalLoading: boolean;
  journalLlmPreview: JournalProfile | null;
  llmSlots: LlmSlot[];
  onUpdateField: (path: string, value: unknown) => void;
  onSave: () => void;
  onLoad: () => void;
  onLlmGenerate: (slotName: string) => void;
  onApplyJournalPreview: (profile: JournalProfile) => void;
  onClearLlmPreview: () => void;
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

/* ── Status helper ─────────────────────────────────────────────────── */

function getJournalStatus(
  profile: JournalProfile,
  loaded: boolean,
  saved: boolean,
  llmPreview: JournalProfile | null,
): { text: string; chip: "ok" | "info" | "unrun" } {
  const hasData = !!profile.journal_name.trim() || loaded;
  if (!hasData && !llmPreview) return { text: "未取得", chip: "unrun" };
  if (llmPreview) return { text: "API取得済み・未保存", chip: "info" };
  if (!saved) {
    if (profile.source === "llm") return { text: "API取得済み・未保存", chip: "info" };
    if (profile.source === "external") return { text: "外部AI結果を取り込み済み・未保存", chip: "info" };
    return { text: "未保存", chip: "info" };
  }
  if (saved && loaded) return { text: "保存済み", chip: "ok" };
  return { text: "未取得", chip: "unrun" };
}

/* ── Journal acquisition modal ─────────────────────────────────────── */

function JournalAcquisitionModal({
  journalProfile,
  llmSlots,
  journalLlmRunning,
  journalLlmPreview,
  onLlmGenerate,
  onApplyToJournal,
  onClearLlmPreview,
  onClose,
}: {
  journalProfile: JournalProfile;
  llmSlots: LlmSlot[];
  journalLlmRunning: boolean;
  journalLlmPreview: JournalProfile | null;
  onLlmGenerate: (slotName: string) => void;
  onApplyToJournal: (profile: JournalProfile) => void;
  onClearLlmPreview: () => void;
  onClose: () => void;
}) {
  type ModalTab = "api" | "external";
  const [activeTab, setActiveTab] = React.useState<ModalTab>("api");

  // ── API tab state ──
  const configuredSlots = llmSlots.filter(
    (s) => s.enabled !== false && s.provider.trim() && s.baseUrl.trim() && s.proModel.trim()
  );
  const [apiSlot, setApiSlot] = React.useState(
    configuredSlots.length > 0 ? configuredSlots[0].name : ""
  );
  const selectedSlot = configuredSlots.find((s) => s.name === apiSlot);

  // ── External AI tab state ──
  const [extPrompt, setExtPrompt] = React.useState("");
  const [extPasteText, setExtPasteText] = React.useState("");
  const [extPreview, setExtPreview] = React.useState<JournalProfile | null>(null);
  const [extError, setExtError] = React.useState("");

  const generateExternalPrompt = () => {
    const jn = journalProfile.journal_name.trim();
    const ju = journalProfile.journal_url.trim();
    const at = journalProfile.article_type;
    const defaultProfile: JournalProfile = {
      journal_name: "",
      journal_url: "",
      publisher: "",
      article_type: "Article",
      reference_style: {
        style_name: "",
        in_text_citation: "numeric",
        reference_list_order: "order_of_appearance",
        doi_required: "recommended_or_required_if_available",
        url_access_date_required: null,
        journal_title_style: "abbreviated_or_full",
        example_reference: "",
      },
      submission_guidelines: {
        word_limit: null,
        abstract_limit: null,
        figure_table_limits: null,
        supplementary_material_policy: "",
        data_availability_policy: "",
        ethics_policy: "",
        conflict_of_interest_policy: "",
        funding_statement_policy: "",
      },
      review_policy: {
        novelty_requirement: "",
        methodological_requirements: "",
        statistical_reporting_expectations: "",
        reporting_guidelines: [],
        reviewer_guidance: "",
        editorial_policy_summary: "",
      },
      publication_criteria: {
        novelty_required: "unknown",
        impact_required: "unknown",
        significance_required: "unknown",
        technical_soundness_focus: "unknown",
        methodological_rigour_focus: "unknown",
        statistical_rigour_focus: "unknown",
        conclusion_supported_by_data_focus: "unknown",
        ethical_robustness_focus: "unknown",
        data_availability_focus: "unknown",
        reproducibility_transparency_focus: "unknown",
      },
      research_type_acceptance: {
        accepts_incremental_research: "unknown",
        accepts_confirmatory_research: "unknown",
        accepts_replication: "unknown",
        accepts_negative_or_null_results: "unknown",
        accepts_niche_scope: "unknown",
        accepts_multidisciplinary_work: "unknown",
      },
      journal_position: {
        multidisciplinary_mega_journal: "unknown",
        broad_scope_journal: "unknown",
        field_specific_high_impact_journal: "unknown",
        clinical_high_impact_journal: "unknown",
        society_journal: "unknown",
        journal_position_summary: "",
      },
      metrics: {
        impact_factor: "",
        five_year_impact_factor: "",
        cite_score: "",
        sjr: "",
        snip: "",
        quartile: "",
        category_rankings: "",
        indexing: "",
        acceptance_rate_if_available: "",
      },
      submission_strategy: {
        suitable_novelty_strategy: "",
        suitable_framing_strategy: "",
        unsuitable_claims: "",
        claims_to_avoid: "",
        reviewer_likely_concerns: "",
        manuscript_strengths_to_emphasize: "",
        manuscript_weaknesses_to_control: "",
      },
      sources: [],
      notes: "",
      source: "external",
      source_details: "",
      updated_at: "",
    };
    const parts = [
      `Please research the following journal and produce a structured JSON profile:`,
      ``,
      `Journal Name: ${jn || "(please fill in)"}`,
      `Journal URL: ${ju || "(please fill in)"}`,
      `Article Type: ${at}`,
      ``,
      `The JSON must match this schema and contain accurate information from the journal's official submission guidelines:`,
      ``,
      `\`\`\`json`,
      JSON.stringify(defaultProfile, null, 2),
      `\`\`\``,
      ``,
      `Output ONLY valid JSON — no markdown, no explanations, no code fences.`,
    ];
    setExtPrompt(parts.join("\n"));
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  };

  const parseExternalResult = () => {
    const text = extPasteText.trim();
    if (!text) {
      setExtError("JSONを貼り付けてください。");
      return;
    }
    const result = parseLooseJsonObject(text);
    if (result.ok && result.value) {
      // Deep merge with defaults
      const defaultProfile: JournalProfile = {
        journal_name: "",
        journal_url: "",
        publisher: "",
        article_type: "Article",
        reference_style: {
          style_name: "",
          in_text_citation: "numeric",
          reference_list_order: "order_of_appearance",
          doi_required: "recommended_or_required_if_available",
          url_access_date_required: null,
          journal_title_style: "abbreviated_or_full",
          example_reference: "",
        },
        submission_guidelines: {
          word_limit: null,
          abstract_limit: null,
          figure_table_limits: null,
          supplementary_material_policy: "",
          data_availability_policy: "",
          ethics_policy: "",
          conflict_of_interest_policy: "",
          funding_statement_policy: "",
        },
        review_policy: {
          novelty_requirement: "",
          methodological_requirements: "",
          statistical_reporting_expectations: "",
          reporting_guidelines: [],
          reviewer_guidance: "",
          editorial_policy_summary: "",
        },
        publication_criteria: {
          novelty_required: "unknown",
          impact_required: "unknown",
          significance_required: "unknown",
          technical_soundness_focus: "unknown",
          methodological_rigour_focus: "unknown",
          statistical_rigour_focus: "unknown",
          conclusion_supported_by_data_focus: "unknown",
          ethical_robustness_focus: "unknown",
          data_availability_focus: "unknown",
          reproducibility_transparency_focus: "unknown",
        },
        research_type_acceptance: {
          accepts_incremental_research: "unknown",
          accepts_confirmatory_research: "unknown",
          accepts_replication: "unknown",
          accepts_negative_or_null_results: "unknown",
          accepts_niche_scope: "unknown",
          accepts_multidisciplinary_work: "unknown",
        },
        journal_position: {
          multidisciplinary_mega_journal: "unknown",
          broad_scope_journal: "unknown",
          field_specific_high_impact_journal: "unknown",
          clinical_high_impact_journal: "unknown",
          society_journal: "unknown",
          journal_position_summary: "",
        },
        metrics: {
          impact_factor: "",
          five_year_impact_factor: "",
          cite_score: "",
          sjr: "",
          snip: "",
          quartile: "",
          category_rankings: "",
          indexing: "",
          acceptance_rate_if_available: "",
        },
        submission_strategy: {
          suitable_novelty_strategy: "",
          suitable_framing_strategy: "",
          unsuitable_claims: "",
          claims_to_avoid: "",
          reviewer_likely_concerns: "",
          manuscript_strengths_to_emphasize: "",
          manuscript_weaknesses_to_control: "",
        },
        sources: [],
        notes: "",
        source: "external",
        source_details: "pasted JSON",
        updated_at: "",
      };
      const merged = JSON.parse(JSON.stringify(defaultProfile));
      const deepMerge = (target: Record<string, unknown>, source: Record<string, unknown>) => {
        for (const key of Object.keys(source)) {
          if (source[key] !== null && typeof source[key] === "object" && !Array.isArray(source[key]) && typeof target[key] === "object" && target[key] !== null && !Array.isArray(target[key])) {
            deepMerge(target[key] as Record<string, unknown>, source[key] as Record<string, unknown>);
          } else if (source[key] !== undefined) {
            target[key] = source[key];
          }
        }
      };
      deepMerge(merged, result.value!);
      setExtPreview(merged as JournalProfile);
      setExtError(result.warnings.length > 0 ? result.warnings.join("\n") : "");
    } else {
      setExtError(result.error || "JSONパースに失敗しました。");
      // Keep pasteText — user can edit and re-parse
    }
  };

  const clearExternal = () => {
    setExtPasteText("");
    setExtPreview(null);
    setExtError("");
  };

  // Which preview is currently relevant
  const activePreview = activeTab === "api" ? journalLlmPreview : extPreview;

  const handleApply = () => {
    if (activePreview) {
      onApplyToJournal(activePreview);
      if (activeTab === "api") {
        onClearLlmPreview();
      } else {
        clearExternal();
      }
    }
  };

  /* ── Styles ── */
  const overlayStyle: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.35)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
  };
  const modalStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 8, padding: 20,
    width: 700, maxHeight: "85vh", overflowY: "auto",
    boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
  };
  const tabBtnBase: React.CSSProperties = {
    padding: "6px 14px",
    border: "1px solid #ccc",
    background: "#f0f0f0",
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 600,
    borderRadius: "4px 4px 0 0",
    marginRight: 2,
  };
  const cardStyle: React.CSSProperties = {
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    padding: 14,
    background: "#fafafa",
    marginBottom: 10,
  };
  const txtStyle: React.CSSProperties = {
    width: "100%",
    minHeight: "80px",
    fontFamily: "inherit",
    fontSize: "11px",
  };

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>ジャーナル情報取得</h3>
          <button onClick={onClose} style={{ fontSize: 11 }}>閉じる</button>
        </div>

        {/* Tab switcher */}
        <div style={{ display: "flex", marginBottom: 0 }}>
          <button
            style={{ ...tabBtnBase, background: activeTab === "api" ? "#fff" : "#f0f0f0", borderBottom: activeTab === "api" ? "2px solid #0078d4" : "1px solid #ccc", color: activeTab === "api" ? "#0078d4" : "#555" }}
            onClick={() => setActiveTab("api")}
          >
            APIで取得
          </button>
          <button
            style={{ ...tabBtnBase, background: activeTab === "external" ? "#fff" : "#f0f0f0", borderBottom: activeTab === "external" ? "2px solid #0078d4" : "1px solid #ccc", color: activeTab === "external" ? "#0078d4" : "#555" }}
            onClick={() => setActiveTab("external")}
          >
            外部AI用プロンプトで作成
          </button>
          <div style={{ flex: 1, borderBottom: "1px solid #ccc" }} />
        </div>

        <div style={{ border: "1px solid #ccc", borderTop: "none", borderRadius: "0 0 6px 6px", padding: 14, background: "#fff" }}>
          {/* ── API tab ──────────────────────────────────────────────── */}
          {activeTab === "api" && (
            <div>
              <p style={{ fontSize: 11, color: "#888", margin: "0 0 12px 0", lineHeight: 1.5 }}>
                設定済みのPro/reasoningモデルを使って、投稿先ジャーナルの投稿規定・引用形式・査読方針を取得します。
              </p>

              {configuredSlots.length > 0 ? (
                <>
                  <div style={cardStyle}>
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>使用するLLMスロット</label>
                      <select
                        value={apiSlot}
                        onChange={(e) => setApiSlot(e.target.value)}
                        disabled={journalLlmRunning}
                        style={{ width: "100%", marginTop: 2 }}
                      >
                        {configuredSlots.map((s) => (
                          <option key={s.name} value={s.name}>
                            {slotDisplayName(s.name)} (Pro: {s.proModel})
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedSlot && (
                      <div style={{ marginBottom: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>使用モデル名</label>
                        <div style={{ fontSize: 11, marginTop: 2, padding: "3px 8px", background: "#e8f5e9", borderRadius: 3, color: "#107c10" }}>
                          {selectedSlot.proModel}
                        </div>
                      </div>
                    )}

                    <button
                      onClick={() => onLlmGenerate(apiSlot)}
                      disabled={journalLlmRunning || !journalProfile.journal_name.trim()}
                      style={{ width: "100%" }}
                    >
                      {journalLlmRunning ? "生成中..." : "APIで取得"}
                    </button>
                    {journalLlmRunning && (
                      <span className="status-chip running" style={{ marginTop: 4 }}>実行中...</span>
                    )}
                    {!journalProfile.journal_name.trim() && (
                      <div className="disabled-reason" style={{ marginTop: 4 }}>先に「ジャーナル名」を入力してください</div>
                    )}
                  </div>

                  {/* LLM preview */}
                  {journalLlmPreview && (
                    <div style={cardStyle}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#107c10", marginBottom: 8 }}>
                        取得結果プレビュー
                      </div>
                      <JournalPreviewTable profile={journalLlmPreview} />
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 11, color: "#999", padding: 12 }}>
                  Pro/reasoningモデルが設定されているLLMスロットがありません。「設定」タブでProモデルを設定してください。
                </div>
              )}
            </div>
          )}

          {/* ── External AI tab ──────────────────────────────────────── */}
          {activeTab === "external" && (
            <div>
              <p style={{ fontSize: 11, color: "#888", margin: "0 0 12px 0", lineHeight: 1.5 }}>
                ChatGPT、GeminiなどWeb検索可能なAIにプロンプトを貼り付け、取得したJSONをここに貼り付けてください。
              </p>

              {/* Prompt generation */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                  <button onClick={generateExternalPrompt} style={{ flex: 1 }}>
                    外部AI用プロンプトを作成
                  </button>
                  {extPrompt && (
                    <button onClick={() => copyToClipboard(extPrompt)} style={{ fontSize: 11, height: 28 }}>
                      コピー
                    </button>
                  )}
                </div>
                {extPrompt ? (
                  <pre style={{
                    background: "#f5f5f5", border: "1px solid #ddd", borderRadius: 4,
                    padding: 10, fontSize: 10, maxHeight: 200, overflowY: "auto",
                    whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0,
                  }}>
                    {extPrompt}
                  </pre>
                ) : (
                  <p style={{ fontSize: 11, color: "#bbb", margin: 0 }}>
                    プロンプト作成ボタンを押すと、ここに表示されます。
                  </p>
                )}
              </div>

              {/* Paste area */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 2 }}>
                  外部AI結果を貼り付け
                </label>
                <textarea
                  style={txtStyle}
                  placeholder="ChatGPTやGeminiで取得したJSONを貼り付けてください（JSON以外の説明文が混ざっていても抽出します）..."
                  value={extPasteText}
                  onChange={(e) => setExtPasteText(e.target.value)}
                />
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                  <button onClick={parseExternalResult} disabled={!extPasteText.trim()} style={{ fontSize: 11 }}>
                    パース
                  </button>
                  <button onClick={clearExternal} style={{ fontSize: 10 }}>クリア</button>
                  {extError && (
                    <span style={{ fontSize: 10, color: "#c42b1c", whiteSpace: "pre-wrap", flex: 1 }}>
                      {extError}
                    </span>
                  )}
                </div>
              </div>

              {/* External preview */}
              {extPreview && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#107c10", marginBottom: 8 }}>
                    取り込み前プレビュー
                  </div>
                  <JournalPreviewTable profile={extPreview} />
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, marginTop: 14, paddingTop: 10, borderTop: "1px solid #eee" }}>
            <button
              onClick={handleApply}
              disabled={!activePreview}
              style={{ fontWeight: 600, flex: 1 }}
            >
              この内容を取り込む
            </button>
            <button onClick={onClose} style={{ fontSize: 11 }}>
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Preview table shared between API and external tabs ───────────── */

function JournalPreviewTable({ profile }: { profile: JournalProfile }) {
  const rows: [string, string][] = [
    ["ジャーナル名", profile.journal_name || "(空欄)"],
    ["URL", profile.journal_url || "(空欄)"],
    ["出版社", profile.publisher || "(空欄)"],
    ["論文種別", profile.article_type || "(空欄)"],
    ["情報源", profile.source || "manual"],
  ];
  if (profile.source_details) {
    rows.push(["情報源詳細", profile.source_details]);
  }
  if (profile.updated_at) {
    rows.push(["更新日時", profile.updated_at]);
  }
  // Show a few key fields from nested sections
  if (profile.reference_style?.in_text_citation) {
    rows.push(["本文中引用形式", profile.reference_style.in_text_citation]);
  }
  if (profile.reference_style?.example_reference) {
    rows.push(["書式例", profile.reference_style.example_reference.slice(0, 100) + (profile.reference_style.example_reference.length > 100 ? "..." : "")]);
  }
  if (profile.submission_guidelines?.word_limit != null) {
    rows.push(["Word制限", String(profile.submission_guidelines.word_limit)]);
  }
  if (profile.submission_guidelines?.abstract_limit != null) {
    rows.push(["Abstract制限", String(profile.submission_guidelines.abstract_limit)]);
  }
  if (profile.notes) {
    rows.push(["備考", profile.notes.slice(0, 100) + (profile.notes.length > 100 ? "..." : "")]);
  }

  return (
    <table style={{ width: "100%", fontSize: 10, borderCollapse: "collapse" }}>
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <td style={{ padding: "2px 8px 2px 0", fontWeight: 600, color: "#555", whiteSpace: "nowrap", verticalAlign: "top" }}>{label}</td>
            <td style={{ padding: "2px 0", wordBreak: "break-word" }}>{value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Main JournalPanel ─────────────────────────────────────────────── */

export default function JournalPanel({
  projectPath,
  journalProfile,
  journalLoaded,
  journalSaved,
  journalLlmRunning,
  journalLoading,
  journalLlmPreview,
  llmSlots,
  onUpdateField,
  onSave,
  onLoad,
  onLlmGenerate,
  onApplyJournalPreview,
  onClearLlmPreview,
  statusMessage,
}: JournalPanelProps) {
  const jp = journalProfile;
  const rs = jp.reference_style;
  const sg = jp.submission_guidelines;
  const rp = jp.review_policy;

  const [showModal, setShowModal] = React.useState(false);

  // Collapsible section state
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({
    reference_style: false,
    submission_guidelines: false,
    review_policy: false,
    notes: false,
  });

  const toggle = (key: string) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const status = getJournalStatus(jp, journalLoaded, journalSaved, journalLlmPreview);

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

  const collapsibleHeaderStyle: React.CSSProperties = {
    fontSize: "13px",
    fontWeight: 600,
    color: "#333",
    cursor: "pointer",
    padding: "8px 0",
    borderBottom: "1px solid #eee",
    margin: "0 0 8px 0",
    userSelect: "none",
  };

  const statusChipColor = status.chip === "ok" ? "#107c10" : status.chip === "info" ? "#0078d4" : "#888";
  const statusBgColor = status.chip === "ok" ? "#e8f5e9" : status.chip === "info" ? "#e3f2fd" : "#f5f5f5";

  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      {/* ── 状態表示 ────────────────────────────────────────────────── */}
      <section className="panel" style={{ paddingBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#555" }}>状態:</span>
          <span style={{
            fontSize: 11, fontWeight: 600,
            padding: "2px 10px", borderRadius: 12,
            background: statusBgColor, color: statusChipColor,
          }}>
            {status.text}
          </span>
          {jp.source && jp.source !== "manual" && (
            <span style={{ fontSize: 10, color: "#888" }}>
              情報源: {jp.source}
            </span>
          )}
          {jp.source_details && (
            <span style={{ fontSize: 10, color: "#888" }}>
              ({jp.source_details})
            </span>
          )}
          {jp.updated_at && (
            <span style={{ fontSize: 10, color: "#aaa" }}>
              最終更新: {jp.updated_at.slice(0, 16).replace("T", " ")}
            </span>
          )}
        </div>
      </section>

      {/* ── ① ジャーナル基本情報 ──────────────────────────────────── */}
      <section className="panel">
        <h2>ジャーナル基本情報</h2>
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

      {/* ── ② 操作ボタン ──────────────────────────────────────────── */}
      <section className="panel">
        <h2>操作</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <button
            onClick={() => setShowModal(true)}
            disabled={!projectPath || journalLlmRunning}
            style={{ fontWeight: 600 }}
          >
            ジャーナル情報を取得・取り込む
          </button>
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
        <p style={{ fontSize: 11, color: "#888", margin: "8px 0 0 0" }}>
          取得・取り込み後、内容を確認してから「保存」を押してください。保存すると journal_profile.json に書き出されます。
        </p>
      </section>

      {/* ── ③ 取得済み情報の確認（折りたたみ） ────────────────────── */}
      <section className="panel">
        <h2>取得済み情報の確認</h2>

        {/* ── 引用・文献形式 ── */}
        <div>
          <div style={collapsibleHeaderStyle} onClick={() => toggle("reference_style")}>
            {expanded.reference_style ? "▼" : "▶"} 引用・文献形式
          </div>
          {expanded.reference_style && (
            <div style={{ paddingLeft: 8 }}>
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
            </div>
          )}
        </div>

        {/* ── 投稿規定 ── */}
        <div>
          <div style={collapsibleHeaderStyle} onClick={() => toggle("submission_guidelines")}>
            {expanded.submission_guidelines ? "▼" : "▶"} 投稿規定
          </div>
          {expanded.submission_guidelines && (
            <div style={{ paddingLeft: 8 }}>
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
            </div>
          )}
        </div>

        {/* ── 査読・掲載方針 ── */}
        <div>
          <div style={collapsibleHeaderStyle} onClick={() => toggle("review_policy")}>
            {expanded.review_policy ? "▼" : "▶"} 査読・掲載方針
          </div>
          {expanded.review_policy && (
            <div style={{ paddingLeft: 8 }}>
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
            </div>
          )}
        </div>

        {/* ── 備考 ── */}
        <div>
          <div style={collapsibleHeaderStyle} onClick={() => toggle("notes")}>
            {expanded.notes ? "▼" : "▶"} 備考
          </div>
          {expanded.notes && (
            <div style={{ paddingLeft: 8 }}>
              <div className="row" style={{ marginBottom: 4 }}>
                <span style={{ ...labelStyle, alignSelf: "flex-start" }}>備考</span>
                <textarea
                  style={txtStyle}
                  rows={4}
                  value={jp.notes}
                  onChange={(e) => onUpdateField("notes", e.target.value)}
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
            </div>
          )}
        </div>
      </section>

      {/* Next step hint */}
      <div className="next-step">
        {!projectPath && "プロジェクトを作成してください。"}
        {projectPath && !journalLoaded && !jp.journal_name.trim() &&
          "ジャーナル名とURLを入力し、「ジャーナル情報を取得・取り込む」から情報を取得してください。"}
        {projectPath && (journalLoaded || jp.journal_name.trim()) && !journalSaved &&
          "取得した情報を確認し、「保存」を押してください。"}
        {projectPath && journalLoaded && journalSaved &&
          "ジャーナル情報を編集後、「保存」を押してください。次の工程（文献確認・査読チェック）で自動参照されます。"}
      </div>

      {/* Acquisition modal */}
      {showModal && (
        <JournalAcquisitionModal
          journalProfile={journalProfile}
          llmSlots={llmSlots}
          journalLlmRunning={journalLlmRunning}
          journalLlmPreview={journalLlmPreview}
          onLlmGenerate={onLlmGenerate}
          onApplyToJournal={(profile) => {
            onApplyJournalPreview(profile);
          }}
          onClearLlmPreview={onClearLlmPreview}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
