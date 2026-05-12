import { Fragment, useState, useEffect } from "react";
import ManualSearchSection from "./ManualSearchSection";
import LlmSearchSupport from "./LlmSearchSupport";

interface GoogleBooksCandidate {
  google_books_id: string;
  title: string | null;
  subtitle: string | null;
  authors: string[];
  publisher: string | null;
  publishedDate: string | null;
  description: string | null;
  isbn_10: string | null;
  isbn_13: string | null;
  pageCount: number | null;
  categories: string[];
  language: string | null;
  infoLink: string | null;
  previewLink: string | null;
  score: number;
  confidence: "high" | "medium" | "low";
  match_reasons: string[];
  ref_year: number | null;
  cand_year: number | null;
  year_diff: number | null;
}

interface ViewerCard {
  reference_id: string;
  status: "verified" | "unmatched" | "suspicious" | "error";
  best_source_db: string | null;
  confidence: "high" | "medium" | "low" | null;
  method: string | null;
  authors: string[];
  year: number | null;
  title: string | null;
  journal: string | null;
  volume: string | null;
  issue: string | null;
  pages: string | null;
  doi: string | null;
  original_text: string;
  parse_confidence: string;
  correct_candidate: {
    title: string | null;
    authors: string[];
    year: number | null;
    journal: string | null;
    volume: string | null;
    issue: string | null;
    pages: string | null;
    doi: string | null;
    type: string | null;
    source_db: string | null;
  } | null;
  warnings: string[];
  metadata_mismatches: string[];
  suspected_reason: string | null;
  title_match: string | null;
  authors_match: string | null;
  year_match: string | null;
  journal_match: string | null;
  crossref_status: string | null;
  crossref_method: string | null;
  pubmed_status: string | null;
  pubmed_method: string | null;
  cnii_status: string | null;
  cnii_method: string | null;
  s2_status: string | null;
  s2_method: string | null;
  using_llm_parsed?: boolean;
  mismatch_details?: {
    title?: string;
    authors?: string;
    year?: string;
    journal?: string;
    volume?: string;
    pages?: string;
    doi?: string;
  } | null;
  journal_identity_match?: string | null;
  journal_style_match?: string | null;
  llm_candidate: {
    title: string | null;
    book_title: string | null;
    authors: string[];
    year: number | null;
    journal: string | null;
    volume: string | null;
    issue: string | null;
    pages: string | null;
    doi: string | null;
    url: string | null;
    publisher: string | null;
    editor: string[] | null;
    isbn: string | null;
    type: string | null;
    confidence: string | null;
    warnings: string[];
  } | null;
  llm_flags: Record<string, boolean> | null;
  google_books_candidates: GoogleBooksCandidate[] | null;
  best_google_books_candidate: GoogleBooksCandidate | null;
  google_books_candidate_count: number;
  human_verification_status?: string | null;
  human_verification_source?: string | null;
  search_suggestions?: {
    suggested_sources: string[];
    search_queries: { source: string; query: string }[];
    notes: string[];
    recommended_action: string | null;
  } | null;
  deferred_info?: {
    reason: string | null;
    note: string | null;
    deferred_at: string | null;
  } | null;
  llm_search?: {
    identified: boolean | null;
    confidence: string | null;
    publication_type: string | null;
    corrected: Record<string, unknown> | null;
    missing_doi_confirmed: boolean;
    notes: string | null;
    source_urls: string[] | null;
  } | null;
  llm_flags?: {
    possible_missing_doi?: boolean;
    likely_government_or_web_document?: boolean;
    likely_book?: boolean;
    year_mismatch_possible_edition?: boolean;
    metadata_incomplete?: boolean;
    reference_style_needs_check?: boolean;
    bibliographic_accuracy_needs_check?: boolean;
    citation_context_needs_check?: boolean;
    needs_later_llm_check?: boolean;
  } | null;
  later_check_targets?: string[] | null;
}

interface ViewerSummary {
  total: number;
  verified: number;
  unmatched: number;
  suspicious: number;
  repaired: number;
  later_llm_check: number;
  deferred: number;
  crossref_matched: number;
  pubmed_matched: number;
  cnii_matched: number;
  google_books_candidate_count: number;
  unmatched_breakdown: Record<string, number>;
  generated_at: string;
}

interface ViewerData {
  summary: ViewerSummary;
  tabs: Record<string, string[]>;
  cards: Record<string, ViewerCard>;
}

interface Props {
  projectPath: string;
  llmSlots: { name: string; provider: string; baseUrl?: string; model: string; apiKey: string; apiKeyMode?: string; apiKeyEnvName?: string; enabled?: boolean }[];
}

const TABS = [
  { key: "summary", label: "概要" },
  { key: "verified", label: "確認済み" },
  { key: "unmatched", label: "未照合" },
  { key: "suspicious", label: "要確認" },
  { key: "repaired", label: "補正候補" },
  { key: "googlebooks", label: "Google Books" },
  { key: "crossref", label: "Crossref" },
  { key: "pubmed", label: "PubMed" },
  { key: "cnii", label: "CiNii" },
  { key: "semanticscholar", label: "Semantic Scholar" },
  { key: "deferred", label: "後ほど検討" },
  { key: "later_llm", label: "後段LLM確認" },
];

const TYPE_LABELS: Record<string, string> = {
  journal_article: "雑誌論文",
  book: "書籍",
  edited_book: "編著本",
  book_chapter: "章",
  report: "報告書",
  government_document: "政府文書",
  web_document: "Web文書",
  conference_paper: "会議録",
  manual: "マニュアル",
  other: "その他",
};

const FLAG_LABELS: Record<string, string> = {
  possible_missing_doi: "DOI欠落の可能性",
  contains_url: "URL含む",
  likely_book: "書籍の可能性",
  likely_report_or_government_document: "報告書・政府文書の可能性",
  needs_human_review: "要確認",
};

const LLM_FLAG_LABELS: Record<string, string> = {
  possible_missing_doi: "DOI欠落の可能性",
  likely_government_or_web_document: "政府・Web文書の可能性",
  likely_book: "書籍の可能性",
  year_mismatch_possible_edition: "出版年版違いの可能性",
  metadata_incomplete: "文献情報不足",
  reference_style_needs_check: "引用形式確認が必要",
  bibliographic_accuracy_needs_check: "書誌精度確認が必要",
  citation_context_needs_check: "引用趣旨確認が必要",
};

const REASON_LABELS: Record<string, string> = {
  book_or_chapter: "書籍・章",
  report_or_government_document: "報告書・政府文書",
  no_doi: "DOIなし",
  db_coverage_likely_missing: "DB未収録",
  possible_reference_error: "文献エラーの可能性",
  journal_article_without_doi: "雑誌記事(DOIなし)",
  title_parse_failure: "タイトル解析エラー",
  author_parse_failure: "著者解析エラー",
  year_parse_failure: "年解析エラー",
  unknown: "不明",
};

const STATUS_LABELS: Record<string, string> = {
  verified: "確認済み",
  unmatched: "未照合",
  suspicious: "要確認",
  error: "エラー",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const GB_CONFIDENCE_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const GB_REASON_LABELS: Record<string, string> = {
  title_exact: "タイトル完全一致",
  title_fuzzy: "タイトル類似",
  title_contains: "タイトル部分一致",
  title_partial: "タイトル部分一致",
  author_exact: "著者一致",
  author_partial: "著者部分一致",
  year_match: "出版年一致",
  year_near: "出版年近接",
  publisher_exact: "出版社一致",
  publisher_partial: "出版社部分一致",
  isbn_match: "ISBN一致",
  year_mismatch: "出版年違い",
};

const HV_STATUS_LABELS: Record<string, string> = {
  human_verified: "人間確認済み",
  accepted_as_is: "このまま受け入れ",
};

const HV_SOURCE_LABELS: Record<string, string> = {
  human_selected: "DB候補を手動採用",
  llm_reparsed_reference: "LLM補正を手動確認",
  manuscript_reference: "原稿記載をそのまま受け入れ",
};

export default function ReferencesReviewViewer({ projectPath, llmSlots }: Props) {
  const [viewerData, setViewerData] = useState<ViewerData | null>(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [projectPath]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const filePath = `${projectPath.replace(/\\/g, "/")}/citations/citation_viewer_data.json`;
      const content = await invoke<string>("read_text_file", { path: filePath });
      setViewerData(JSON.parse(content));
    } catch (e) {
      setError(
        "Viewer data not found. Run 'Generate Viewer Data' first.\n" +
        (e instanceof Error ? e.message : String(e))
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="viewer-loading">Loading viewer data...</div>;
  }

  if (error) {
    return <div className="viewer-empty">{error}</div>;
  }

  if (!viewerData) {
    return <div className="viewer-empty">No data available.</div>;
  }

  const { summary, tabs, cards } = viewerData;

  const cardIds = tabs[activeTab] || [];
  const filteredCards = cardIds.map((id) => cards[id]).filter(Boolean);

  return (
    <div className="viewer-container">
      {/* Tab bar */}
      <div className="viewer-tabs">
        {TABS.map((tab) => {
          const count = tab.key === "summary"
            ? summary.total
            : (tabs[tab.key] || []).length;
          return (
            <button
              key={tab.key}
              className={`viewer-tab ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
              <span className="viewer-tab-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div className="viewer-tab-content">
        {activeTab === "summary" && (
          <SummaryTab summary={summary} />
        )}

        {(activeTab === "verified" || activeTab === "unmatched" ||
          activeTab === "suspicious" || activeTab === "repaired" ||
          activeTab === "crossref" || activeTab === "pubmed" ||
          activeTab === "googlebooks" || activeTab === "deferred" ||
          activeTab === "later_llm" || activeTab === "cnii" ||
          activeTab === "semanticscholar") && (
          <CardList
            cards={filteredCards}
            tabKey={activeTab}
            projectPath={projectPath}
            llmSlots={llmSlots}
            onDataChanged={loadData}
            emptyMessage={
              activeTab === "repaired"
                ? "補正候補はまだありません。DOI truncation 修正後に表示されます。"
                : activeTab === "pubmed"
                  ? "PubMed DB照合結果がありません。citation-db-pubmed を先に実行してください。"
                  : activeTab === "cnii"
                    ? "CiNii DB照合結果がありません。citation-db-cinii を先に実行してください。"
                    : activeTab === "semanticscholar"
                    ? "Semantic Scholar DB照合結果がありません。citation-db-semantic-scholar を先に実行してください。"
                    : activeTab === "googlebooks"
                    ? "Google Books候補がありません。citation-db-google-books を先に実行してください。"
                    : activeTab === "deferred"
                      ? "後ほど検討の文献はまだありません。"
                      : activeTab === "later_llm"
                        ? "後段LLM確認の文献はまだありません。「LLM文献フラグ生成」を実行してください。"
                        : "該当する文献はありません。"
            }
          />
        )}
      </div>
    </div>
  );
}

/* ── Summary Tab ─────────────────────────────────────────────────────── */

function SummaryTab({ summary }: { summary: ViewerSummary }) {
  const pct = (n: number) =>
    summary.total > 0 ? `${((n / summary.total) * 100).toFixed(0)}%` : "0%";

  return (
    <div className="viewer-summary">
      <div className="viewer-stat">
        <div className="viewer-stat-value">{summary.total}</div>
        <div className="viewer-stat-label">総文献数</div>
      </div>
      <div className="viewer-stat verified">
        <div className="viewer-stat-value">{summary.verified}</div>
        <div className="viewer-stat-label">確認済み ({pct(summary.verified)})</div>
      </div>
      <div className="viewer-stat unmatched">
        <div className="viewer-stat-value">{summary.unmatched}</div>
        <div className="viewer-stat-label">未照合 ({pct(summary.unmatched)})</div>
      </div>
      <div className="viewer-stat suspicious">
        <div className="viewer-stat-value">{summary.suspicious}</div>
        <div className="viewer-stat-label">要確認 ({pct(summary.suspicious)})</div>
      </div>
      <div className="viewer-stat">
        <div className="viewer-stat-value">{summary.crossref_matched}</div>
        <div className="viewer-stat-label">Crossref 照合</div>
      </div>
      <div className="viewer-stat">
        <div className="viewer-stat-value">{summary.pubmed_matched}</div>
        <div className="viewer-stat-label">PubMed 照合</div>
      </div>
      <div className="viewer-stat">
        <div className="viewer-stat-value">{summary.cnii_matched ?? 0}</div>
        <div className="viewer-stat-label">CiNii 照合</div>
      </div>
      <div className="viewer-stat">
        <div className="viewer-stat-value">{summary.s2_matched ?? 0}</div>
        <div className="viewer-stat-label">Semantic Scholar 照合</div>
      </div>

      {/* Unmatched breakdown */}
      {Object.keys(summary.unmatched_breakdown).length > 0 && (
        <div className="viewer-breakdown">
          <div className="viewer-breakdown-title">未照合内訳</div>
          {Object.entries(summary.unmatched_breakdown)
            .sort(([, a], [, b]) => b - a)
            .map(([reason, count]) => (
              <div key={reason} className="viewer-breakdown-row">
                <span className="viewer-breakdown-label">
                  {REASON_LABELS[reason] || reason}
                </span>
                <span className="viewer-breakdown-count">{count}</span>
              </div>
            ))}
        </div>
      )}

      <div className="viewer-generated-at">
        生成日時: {summary.generated_at}
      </div>
    </div>
  );
}

/* ── Card List ────────────────────────────────────────────────────────── */

function CardList({
  cards,
  tabKey,
  emptyMessage,
  projectPath,
  llmSlots,
  onDataChanged,
}: {
  cards: ViewerCard[];
  tabKey: string;
  emptyMessage: string;
  projectPath: string;
  llmSlots: { name: string; provider: string; baseUrl?: string; model: string; apiKey: string; apiKeyMode?: string; apiKeyEnvName?: string; enabled?: boolean }[];
  onDataChanged: () => void;
}) {
  if (cards.length === 0) {
    return <div className="viewer-empty">{emptyMessage}</div>;
  }

  return (
    <div className="viewer-card-list">
      {cards.map((card) => (
        <ReferenceCard
          key={card.reference_id}
          card={card}
          tabKey={tabKey}
          projectPath={projectPath}
          llmSlots={llmSlots}
          onDataChanged={onDataChanged}
        />
      ))}
    </div>
  );
}

/* ── Individual Reference Card ────────────────────────────────────────── */

/** Strip reference number prefix from author text (e.g. "52.\tFisher" → "Fisher"). */
function stripRefNumber(text: string): string {
  return text.replace(/^\d+\.?\s*/, "").trim();
}

/** One row in the comparison table. */
interface FieldRow {
  label: string;
  candidate: string;
  manuscript: string;
  llm?: string;
  mismatchType?: "substantive" | "formatting" | "none";
}

function ReferenceCard({
  card,
  tabKey,
  projectPath,
  llmSlots,
  onDataChanged,
}: {
  card: ViewerCard;
  tabKey: string;
  projectPath: string;
  llmSlots: { name: string; provider: string; baseUrl?: string; model: string; apiKey: string; apiKeyMode?: string; apiKeyEnvName?: string; enabled?: boolean }[];
  onDataChanged: () => void;
}) {
  const statusClass = card.status;
  const statusLabel = STATUS_LABELS[card.status] || card.status;
  const confidenceLabel = card.confidence
    ? CONFIDENCE_LABELS[card.confidence]
    : "-";

  const hasWarnings = card.warnings.length > 0;
  const hasMismatches = card.metadata_mismatches.length > 0;
  const candidate = card.correct_candidate;
  const llm = card.llm_candidate;
  const gbCandidates = card.google_books_candidates;

  const hasLlm = llm != null;

  // State for accept search result button
  const [acceptSearchDone, setAcceptSearchDone] = useState(false);
  const [acceptSearchLoading, setAcceptSearchLoading] = useState(false);
  const [acceptSearchError, setAcceptSearchError] = useState<string | null>(null);

  const handleAcceptSearch = async () => {
    setAcceptSearchLoading(true);
    setAcceptSearchError(null);
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");

      const acceptCmd = Command.create("pra-cli", [
        "accept-llm-search-result",
        "--project", projectPath,
        "--reference-id", card.reference_id,
      ]);
      const acceptOutput = await acceptCmd.execute();
      if (acceptOutput.code !== 0) {
        setAcceptSearchError(acceptOutput.stderr || `Accept failed with code ${acceptOutput.code}`);
        return;
      }

      // Regenerate viewer data
      const viewerCmd = Command.create("pra-cli", [
        "citation-viewer-data",
        "--project", projectPath,
      ]);
      const viewerOutput = await viewerCmd.execute();
      if (viewerOutput.code !== 0) {
        setAcceptSearchError(viewerOutput.stderr || `Viewer data regeneration failed with code ${viewerOutput.code}`);
        return;
      }

      setAcceptSearchDone(true);
      onDataChanged();
    } catch (e: unknown) {
      setAcceptSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setAcceptSearchLoading(false);
    }
  };

  // Lookup mismatch classifications from card
  const md = card.mismatch_details;

  // Build comparison rows: label, candidate value, manuscript value, llm value
  const rows: FieldRow[] = [
    {
      label: "著者",
      candidate: candidate?.authors?.length
        ? candidate.authors.join(", ")
        : "—",
      manuscript: card.authors.length
        ? stripRefNumber(card.authors.join("; "))
        : "—",
      llm: llm?.authors?.length ? llm.authors.join(", ") : undefined,
      mismatchType: md?.authors as FieldRow["mismatchType"],
    },
    {
      label: "年",
      candidate: candidate?.year != null ? String(candidate.year) : "—",
      manuscript: card.year != null ? String(card.year) : "—",
      llm: llm?.year != null ? String(llm.year) : undefined,
      mismatchType: md?.year as FieldRow["mismatchType"],
    },
    {
      label: "タイトル",
      candidate: candidate?.title || "—",
      manuscript: card.title || "—",
      llm: llm?.title || undefined,
      mismatchType: md?.title as FieldRow["mismatchType"],
    },
    {
      label: "雑誌名",
      candidate: candidate?.journal || "—",
      manuscript: card.journal || "—",
      llm: llm?.journal || undefined,
      mismatchType: md?.journal as FieldRow["mismatchType"],
    },
    {
      label: "書名",
      candidate: candidate?.title || "—",
      manuscript: "—",
      llm: llm?.book_title || undefined,
    },
    {
      label: "編者",
      candidate: "—",
      manuscript: "—",
      llm: llm?.editor?.length ? llm.editor.join(", ") : undefined,
    },
    {
      label: "出版社",
      candidate: "—",
      manuscript: "—",
      llm: llm?.publisher || undefined,
    },
    {
      label: "巻",
      candidate: candidate?.volume || "—",
      manuscript: card.volume || "—",
      llm: llm?.volume || undefined,
    },
    {
      label: "号",
      candidate: candidate?.issue || "—",
      manuscript: card.issue || "—",
      llm: llm?.issue || undefined,
    },
    {
      label: "ページ",
      candidate: candidate?.pages || "—",
      manuscript: card.pages || "—",
      llm: llm?.pages || undefined,
    },
    {
      label: "DOI",
      candidate: candidate?.doi || "—",
      manuscript: card.doi || "—",
      llm: llm?.doi || undefined,
    },
    {
      label: "URL",
      candidate: "—",
      manuscript: "—",
      llm: llm?.url || undefined,
    },
    {
      label: "文献種別",
      candidate: candidate?.type || "—",
      manuscript: "—",
      llm: llm?.type ? (TYPE_LABELS[llm.type] || llm.type) : undefined,
    },
  ];

  // Flag DOI row if the candidate DOI is suspiciously short (truncation indicator)
  if (candidate?.doi && card.doi) {
    const doiRow = rows.find((r) => r.label === "DOI");
    if (doiRow && !doiRow.mismatchType) {
      const candLen = candidate.doi!.length;
      const msLen = card.doi.length;
      if (candLen < msLen || candLen < 20) {
        doiRow.mismatchType = "substantive";
      }
    }
  }

  return (
    <div className={`ref-card ${statusClass}`}>
      {/* Header bar: reference ID + status */}
      <div className="ref-card-header">
        <span className="ref-card-id">{card.reference_id}</span>
        <span className={`ref-status ${statusClass}`}>{statusLabel}</span>
        {card.best_source_db && (
          <span className="ref-source">
            最良候補DB: {card.best_source_db}
          </span>
        )}
        {card.confidence && (
          <span className="ref-confidence">
            信頼度: {confidenceLabel}
          </span>
        )}
        {card.human_verification_status && (
          <span className={`ref-hv-badge hv-${card.human_verification_status}`}
                title={card.human_verification_source
                  ? (HV_SOURCE_LABELS[card.human_verification_source] || card.human_verification_source)
                  : undefined}>
            {card.human_verification_source
              ? (HV_SOURCE_LABELS[card.human_verification_source] || HV_SOURCE_LABELS[card.human_verification_status] || card.human_verification_status)
              : (HV_STATUS_LABELS[card.human_verification_status] || card.human_verification_status)}
          </span>
        )}
        {card.llm_flags?.needs_later_llm_check && (
          <span className="ref-llm-flag-chip" title="LLMが後段チェック必要と判断">
            後段LLM確認
          </span>
        )}
        {card.llm_flags && !card.llm_flags.needs_later_llm_check && (
          Object.entries(LLM_FLAG_LABELS).map(([key, label]) => {
            if ((card.llm_flags as Record<string, boolean>)[key]) {
              return (
                <span key={key} className="ref-llm-flag-chip sub" title={label}>
                  {label}
                </span>
              );
            }
            return null;
          })
        )}
      </div>

      {/* Row-based comparison grid */}
      <div className={`ref-compare ${hasLlm ? "ref-compare-llm" : ""}`}>
        {/* Header row */}
        <div className="ref-compare-header-spacer"></div>
        <div className="ref-compare-col-header">正しい文献情報候補</div>
        <div className="ref-compare-col-header">
          原稿に記載された文献情報
          {card.using_llm_parsed && (
            <span className="ref-llm-badge">LLM分解結果を使用</span>
          )}
        </div>
        {hasLlm && (
          <div className="ref-compare-col-header">
            LLM補正候補
            {llm.confidence && (
              <span className="ref-llm-confidence">
                ({CONFIDENCE_LABELS[llm.confidence] || llm.confidence})
              </span>
            )}
          </div>
        )}

        {/* Data rows */}
        {rows.map((row) => {
          const mismatchClass =
            row.mismatchType === "substantive" ? "mismatch-substantive"
            : row.mismatchType === "formatting" ? "mismatch-formatting"
            : "";
          return (
            <Fragment key={row.label}>
              <div className="ref-compare-label">{row.label}</div>
              <div className={`ref-compare-value ${mismatchClass}`}>
                {row.candidate}
              </div>
              <div className={`ref-compare-value ${mismatchClass}`}>
                {row.manuscript}
              </div>
              {hasLlm && (
                <div className="ref-compare-value">{row.llm || "—"}</div>
              )}
            </Fragment>
          );
        })}
      </div>

      {/* Accept LLM candidate button — prominent placement right below comparison grid */}
      {(tabKey === "unmatched" || tabKey === "repaired" || tabKey === "googlebooks" ||
        tabKey === "suspicious") &&
        llm && llm.confidence && (
        <div className="ref-card-section" style={{ borderTop: "2px solid #0078d4", paddingTop: 8, marginTop: 4 }}>
          <AcceptLlmCandidateButton
            referenceId={card.reference_id}
            confidence={llm.confidence}
            projectPath={projectPath}
            onAccepted={onDataChanged}
          />
        </div>
      )}

      {/* Journal identity match (LLM disambiguation result) */}
      {card.journal_identity_match != null && card.journal_identity_match !== "mismatch" && (
        <div className="ref-card-section">
          <div className="ref-card-section-label">雑誌名判定 (LLM):</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, alignItems: "center" }}>
            <span className={`ref-journal-id-badge ref-journal-id-${card.journal_identity_match}`}>
              {card.journal_identity_match === "identity" ? "同一雑誌" : "略称違い"}
            </span>
            {card.journal_style_match && (
              <span className="ref-journal-style-badge">
                {card.journal_style_match === "nlm" ? "NLM略称" :
                 card.journal_style_match === "iso" ? "ISO略称" :
                 card.journal_style_match === "full" ? "正式名称" :
                 card.journal_style_match === "vancouver" ? "Vancouver略称" :
                 card.journal_style_match}
              </span>
            )}
          </div>
        </div>
      )}

      {/* LLM search results (for unmatched references) */}
      {card.llm_search && card.llm_search.identified && (
        <div className="ref-card-section">
          <div className="ref-card-section-label">LLM文献検索結果:</div>
          <div className="ref-llm-search-result">
            <span className={`ref-llm-search-confidence ref-llm-search-${card.llm_search.confidence || "medium"}`}>
              {card.llm_search.confidence === "high" ? "高確度" :
               card.llm_search.confidence === "medium" ? "中確度" :
               card.llm_search.confidence === "low" ? "低確度" : "?"}
            </span>
            {card.llm_search.publication_type && (
              <span className="ref-llm-search-type">
                {card.llm_search.publication_type === "journal_article" ? "雑誌論文" :
                 card.llm_search.publication_type === "book" ? "書籍" :
                 card.llm_search.publication_type === "report" ? "報告書" :
                 card.llm_search.publication_type === "government_document" ? "政府文書" :
                 card.llm_search.publication_type === "web_document" ? "Web文書" :
                 card.llm_search.publication_type === "conference_paper" ? "会議録" :
                 card.llm_search.publication_type}
              </span>
            )}
            {card.llm_search.missing_doi_confirmed && (
              <span className="ref-llm-search-no-doi">DOIなし</span>
            )}
          </div>
          {card.llm_search.corrected && (
            <div className="ref-llm-search-corrected">
              {Object.entries(card.llm_search.corrected as Record<string, unknown>).map(([key, value]) => {
                if (!value) return null;
                const label: Record<string, string> = {
                  authors: "著者", year: "年", title: "タイトル", journal: "雑誌名",
                  book_title: "書名", publisher: "出版社", volume: "巻", issue: "号",
                  pages: "ページ", doi: "DOI", isbn: "ISBN", url: "URL",
                };
                return (
                  <div key={key} className="ref-llm-search-field">
                    <span className="ref-llm-search-key">{label[key] || key}:</span>
                    <span className="ref-llm-search-value">
                      {Array.isArray(value) ? value.join("; ") : String(value)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
          {card.llm_search.notes && (
            <div className="ref-llm-search-notes">{card.llm_search.notes}</div>
          )}
          {/* Accept button for LLM search result (unmatched + suspicious tabs) */}
          {(tabKey === "unmatched" || tabKey === "suspicious") && !card.human_verification_status && !acceptSearchDone && (
            <div className="ref-llm-search-accept">
              <button
                className="ref-accept-btn ref-accept-search-btn"
                disabled={acceptSearchLoading}
                onClick={handleAcceptSearch}
              >
                {acceptSearchLoading ? "処理中..." : "この検索結果を受け入れる"}
              </button>
              {acceptSearchError && (
                <div className="manual-search-error">{acceptSearchError}</div>
              )}
            </div>
          )}
          {acceptSearchDone && (
            <div className="accept-llm-done" style={{ marginTop: 6 }}>LLM検索結果を受け入れ済み</div>
          )}
        </div>
      )}

      {/* LLM flags */}
      {card.llm_flags && Object.keys(card.llm_flags).length > 0 && (
        <div className="ref-card-section">
          <div className="ref-card-section-label">LLM判定:</div>
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 4 }}>
            {Object.entries(card.llm_flags)
              .filter(([, v]) => v)
              .map(([k]) => (
                <span key={k} className="ref-llm-flag">
                  {FLAG_LABELS[k] || k}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* LLM warnings */}
      {llm?.warnings && llm.warnings.length > 0 && (
        <div className="ref-card-section">
          <div className="ref-card-section-label">LLM注意点:</div>
          <ul className="ref-card-warning-list">
            {llm.warnings.map((w, i) => (
              <li key={i} className="ref-card-warning">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="ref-card-section">
          <div className="ref-card-section-label">注意点：</div>
          <ul className="ref-card-warning-list">
            {card.warnings.map((w, i) => (
              <li key={i} className="ref-card-warning">{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Metadata mismatches */}
      {hasMismatches && (
        <div className="ref-card-section">
          <div className="ref-card-section-label">書誌情報の不一致：</div>
          <ul className="ref-card-mismatch-list">
            {card.metadata_mismatches.map((m, i) => (
              <li key={i} className="ref-card-mismatch">{m}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suspected reason (for unmatched + suspicious tabs) */}
      {(tabKey === "unmatched" || tabKey === "suspicious") && card.suspected_reason && (
        <div className="ref-card-section">
          <span className="ref-card-reason">
            推定理由: {REASON_LABELS[card.suspected_reason] || card.suspected_reason}
          </span>
        </div>
      )}

      {/* DB-specific badges for Crossref/PubMed/CiNii tabs */}
      {(tabKey === "crossref" || tabKey === "pubmed" || tabKey === "cnii" ||
        tabKey === "semanticscholar") && (
        <div className="ref-card-section">
          {tabKey === "crossref" && card.crossref_status && (
            <span className="ref-db-badge">
              Crossref: {card.crossref_status}
              {card.crossref_method ? ` (${card.crossref_method})` : ""}
            </span>
          )}
          {tabKey === "pubmed" && card.pubmed_status && (
            <span className="ref-db-badge">
              PubMed: {card.pubmed_status}
              {card.pubmed_method ? ` (${card.pubmed_method})` : ""}
            </span>
          )}
          {tabKey === "cnii" && card.cnii_status && (
            <span className="ref-db-badge">
              CiNii: {card.cnii_status}
              {card.cnii_method ? ` (${card.cnii_method})` : ""}
            </span>
          )}
          {tabKey === "semanticscholar" && card.s2_status && (
            <span className="ref-db-badge">
              Semantic Scholar: {card.s2_status}
              {card.s2_method ? ` (${card.s2_method})` : ""}
            </span>
          )}
        </div>
      )}

      {/* Accept-as-is button for gov/web/report types (always show, even without URL) */}
      {(tabKey === "unmatched" || tabKey === "repaired" || tabKey === "suspicious") &&
        llm?.type &&
        ["government_document", "web_document", "report"].includes(llm.type) && (
        <div className="ref-card-section">
          {llm?.url && (
            <span className="gov-web-chip">
              {llm.url.match(/\.go\.jp|\.gov\b|who\.int|cdc\.gov/i)
                ? "政府・公的文書 — 外部DB照合不要候補"
                : "Web文書 — 外部DB照合不要候補"}
            </span>
          )}
          <AcceptAsIsButton
            referenceId={card.reference_id}
            reason={TYPE_LABELS[llm.type] || llm.type}
            projectPath={projectPath}
            onAccepted={onDataChanged}
          />
        </div>
      )}

      {/* Generic accept-as-is button (always available for unmatched/repaired/suspicious references) */}
      {(tabKey === "unmatched" || tabKey === "repaired" || tabKey === "suspicious") &&
        (!llm?.type || !["government_document", "web_document", "report"].includes(llm.type)) && (
        <div className="ref-card-section">
          <AcceptAsIsButton
            referenceId={card.reference_id}
            reason="manuscript_reference_sufficient"
            projectPath={projectPath}
            onAccepted={onDataChanged}
          />
        </div>
      )}

      {/* Accept LLM-repaired candidate button — always available when LLM candidate exists */}
      {(tabKey === "unmatched" || tabKey === "repaired" || tabKey === "googlebooks" ||
        tabKey === "suspicious") &&
        llm && llm.confidence && (
        <div className="ref-card-section">
          <AcceptLlmCandidateButton
            referenceId={card.reference_id}
            confidence={llm.confidence}
            projectPath={projectPath}
            onAccepted={onDataChanged}
          />
        </div>
      )}

      {/* Manual search section (replaces old external search links) */}
      {(tabKey === "unmatched" || tabKey === "repaired" || tabKey === "googlebooks" ||
        tabKey === "suspicious") && (
        <ManualSearchSection
          referenceId={card.reference_id}
          card={card}
          projectPath={projectPath}
          onCandidateAccepted={onDataChanged}
        />
      )}

      {/* LLM Search Support — show for unmatched/repaired/deferred/suspicious */}
      {(tabKey === "unmatched" || tabKey === "repaired" ||
        tabKey === "deferred" || tabKey === "suspicious") && (
        <LlmSearchSupport
          referenceId={card.reference_id}
          suggestions={card.search_suggestions ?? null}
          deferredInfo={card.deferred_info ?? null}
          projectPath={projectPath}
          llmSlots={llmSlots}
          llmSearch={card.llm_search ?? null}
          onDataChanged={onDataChanged}
        />
      )}

      {/* Google Books candidates */}
      {tabKey === "googlebooks" && gbCandidates && gbCandidates.length > 0 && (
        <div className="ref-gb-candidates">
          <div className="ref-card-section-label">
            Google Books候補 ({gbCandidates.length}件)
          </div>
          {gbCandidates.map((gb, idx) => (
            <div key={gb.google_books_id || idx} className="ref-gb-card">
              <div className="ref-gb-header">
                <span className="ref-gb-index">候補 #{idx + 1}</span>
                <span className={`ref-gb-confidence gb-conf-${gb.confidence}`}>
                  信頼度: {GB_CONFIDENCE_LABELS[gb.confidence] || gb.confidence}
                </span>
                <span className="ref-gb-score">
                  スコア: {(gb.score * 100).toFixed(0)}%
                </span>
              </div>

              <div className="ref-gb-fields">
                <div className="ref-gb-field">
                  <span className="ref-gb-label">タイトル</span>
                  <span className="ref-gb-value">{gb.title || "—"}</span>
                </div>
                {gb.subtitle && (
                  <div className="ref-gb-field">
                    <span className="ref-gb-label">サブタイトル</span>
                    <span className="ref-gb-value">{gb.subtitle}</span>
                  </div>
                )}
                <div className="ref-gb-field">
                  <span className="ref-gb-label">著者</span>
                  <span className="ref-gb-value">
                    {gb.authors?.length ? gb.authors.join(", ") : "—"}
                  </span>
                </div>
                <div className="ref-gb-field">
                  <span className="ref-gb-label">出版社</span>
                  <span className="ref-gb-value">{gb.publisher || "—"}</span>
                </div>
                <div className="ref-gb-field">
                  <span className="ref-gb-label">出版日</span>
                  <span className="ref-gb-value">{gb.publishedDate || "—"}</span>
                </div>
                {(gb.isbn_10 || gb.isbn_13) && (
                  <div className="ref-gb-field">
                    <span className="ref-gb-label">ISBN</span>
                    <span className="ref-gb-value">
                      {gb.isbn_10 && `ISBN-10: ${gb.isbn_10}`}
                      {gb.isbn_10 && gb.isbn_13 && " / "}
                      {gb.isbn_13 && `ISBN-13: ${gb.isbn_13}`}
                    </span>
                  </div>
                )}
                {gb.pageCount != null && (
                  <div className="ref-gb-field">
                    <span className="ref-gb-label">ページ数</span>
                    <span className="ref-gb-value">{gb.pageCount}</span>
                  </div>
                )}
                {gb.categories?.length > 0 && (
                  <div className="ref-gb-field">
                    <span className="ref-gb-label">カテゴリ</span>
                    <span className="ref-gb-value">
                      {gb.categories.join(", ")}
                    </span>
                  </div>
                )}
              </div>

              {gb.match_reasons?.length > 0 && (
                <div className="ref-gb-reasons">
                  {gb.match_reasons.map((r) => (
                    <span key={r} className="ref-gb-reason-tag">
                      {GB_REASON_LABELS[r] || r}
                    </span>
                  ))}
                </div>
              )}

              {/* Year mismatch warning */}
              {gb.year_diff != null && gb.year_diff > 5 && (
                <div className="ref-gb-year-warning">
                  原稿: {gb.ref_year ?? "?"} / GB: {gb.cand_year ?? "?"}
                  {" "}(差: {gb.year_diff}年) — 版違い・再版の可能性
                </div>
              )}

              <div className="ref-gb-links">
                {gb.infoLink && (
                  <a
                    href={gb.infoLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ref-gb-link"
                  >
                    Google Booksで見る
                  </a>
                )}
                {gb.previewLink && (
                  <a
                    href={gb.previewLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ref-gb-link"
                  >
                    プレビュー
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Accept-As-Is Button ───────────────────────────────────────────────── */

function AcceptAsIsButton({
  referenceId,
  reason,
  projectPath,
  onAccepted,
}: {
  referenceId: string;
  reason: string;
  projectPath: string;
  onAccepted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleAcceptAsIs = async () => {
    setLoading(true);
    setError(null);
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");

      // Step 1: Accept as-is
      const acceptCmd = Command.create("pra-cli", [
        "accept-reference-as-is",
        "--project", projectPath,
        "--reference-id", referenceId,
        "--reason", reason,
      ]);
      const acceptOutput = await acceptCmd.execute();
      if (acceptOutput.code !== 0) {
        setError(acceptOutput.stderr || `Accept failed with code ${acceptOutput.code}`);
        return;
      }

      // Step 2: Regenerate viewer data
      const viewerCmd = Command.create("pra-cli", [
        "citation-viewer-data",
        "--project", projectPath,
      ]);
      const viewerOutput = await viewerCmd.execute();
      if (viewerOutput.code !== 0) {
        setError(viewerOutput.stderr || `Viewer data regeneration failed with code ${viewerOutput.code}`);
        return;
      }

      setDone(true);
      onAccepted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return <span className="accept-as-is-done">このまま受け入れ済み</span>;
  }

  return (
    <div className="accept-as-is-section">
      <div className="ref-card-section-label">
        この文献はURLが確認できる{reason}です
      </div>
      <button
        className="accept-as-is-btn"
        disabled={loading}
        onClick={handleAcceptAsIs}
      >
        {loading ? "処理中..." : "原稿記載をそのまま受け入れる"}
      </button>
      {error && <div className="manual-search-error">{error}</div>}
    </div>
  );
}

/* ── Accept LLM Candidate Button ───────────────────────────────────────── */

function AcceptLlmCandidateButton({
  referenceId,
  confidence,
  projectPath,
  onAccepted,
}: {
  referenceId: string;
  confidence: string;
  projectPath: string;
  onAccepted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleAcceptLlm = async () => {
    setLoading(true);
    setError(null);
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");

      // Step 1: Accept LLM candidate
      const acceptCmd = Command.create("pra-cli", [
        "accept-llm-reference-candidate",
        "--project", projectPath,
        "--reference-id", referenceId,
      ]);
      const acceptOutput = await acceptCmd.execute();
      if (acceptOutput.code !== 0) {
        setError(acceptOutput.stderr || `Accept failed with code ${acceptOutput.code}`);
        return;
      }

      // Step 2: Regenerate viewer data
      const viewerCmd = Command.create("pra-cli", [
        "citation-viewer-data",
        "--project", projectPath,
      ]);
      const viewerOutput = await viewerCmd.execute();
      if (viewerOutput.code !== 0) {
        setError(viewerOutput.stderr || `Viewer data regeneration failed with code ${viewerOutput.code}`);
        return;
      }

      setDone(true);
      onAccepted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return <span className="accept-llm-done">LLM補正候補を受け入れ済み</span>;
  }

  return (
    <div className="accept-llm-section">
      <div className="ref-card-section-label">
        LLMが補正した文献情報をそのまま採用します
        {confidence && (
          <span className={`ref-llm-confidence-inline conf-${confidence}`}>
            (信頼度: {CONFIDENCE_LABELS[confidence] || confidence})
          </span>
        )}
      </div>
      <button
        className="accept-llm-btn"
        disabled={loading}
        onClick={handleAcceptLlm}
      >
        {loading ? "処理中..." : "LLM補正候補を受け入れる"}
      </button>
      {error && <div className="manual-search-error">{error}</div>}
    </div>
  );
}
