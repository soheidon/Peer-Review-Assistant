import { useState, useEffect } from "react";

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
}

interface ViewerSummary {
  total: number;
  verified: number;
  unmatched: number;
  suspicious: number;
  repaired: number;
  crossref_matched: number;
  pubmed_matched: number;
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
}

const TABS = [
  { key: "summary", label: "概要" },
  { key: "verified", label: "確認済み" },
  { key: "unmatched", label: "未照合" },
  { key: "suspicious", label: "要確認" },
  { key: "repaired", label: "補正候補" },
  { key: "crossref", label: "Crossref" },
  { key: "pubmed", label: "PubMed" },
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

export default function ReferencesReviewViewer({ projectPath }: Props) {
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
          activeTab === "crossref" || activeTab === "pubmed") && (
          <CardList
            cards={filteredCards}
            tabKey={activeTab}
            emptyMessage={
              activeTab === "repaired"
                ? "補正候補はまだありません。DOI truncation 修正後に表示されます。"
                : activeTab === "pubmed"
                  ? "PubMed DB照合結果がありません。citation-db-pubmed を先に実行してください。"
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
}: {
  cards: ViewerCard[];
  tabKey: string;
  emptyMessage: string;
}) {
  if (cards.length === 0) {
    return <div className="viewer-empty">{emptyMessage}</div>;
  }

  return (
    <div className="viewer-card-list">
      {cards.map((card) => (
        <ReferenceCard key={card.reference_id} card={card} tabKey={tabKey} />
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
  mismatch?: boolean;
}

function ReferenceCard({
  card,
  tabKey,
}: {
  card: ViewerCard;
  tabKey: string;
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

  const hasLlm = llm != null;

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
    },
    {
      label: "年",
      candidate: candidate?.year != null ? String(candidate.year) : "—",
      manuscript: card.year != null ? String(card.year) : "—",
      llm: llm?.year != null ? String(llm.year) : undefined,
    },
    {
      label: "タイトル",
      candidate: candidate?.title || "—",
      manuscript: card.title || "—",
      llm: llm?.title || undefined,
    },
    {
      label: "雑誌名",
      candidate: candidate?.journal || "—",
      manuscript: card.journal || "—",
      llm: llm?.journal || undefined,
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
    if (doiRow) {
      const candLen = candidate.doi!.length;
      const msLen = card.doi.length;
      if (candLen < msLen || candLen < 20) {
        doiRow.mismatch = true;
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
      </div>

      {/* Side-by-side comparison */}
      <div className={`ref-compare ${hasLlm ? "ref-compare-llm" : ""}`}>
        {/* Candidate (left) */}
        <div className="ref-compare-col ref-compare-candidate">
          <div className="ref-compare-col-header">正しい文献情報候補</div>
          {rows.map((row) => (
            <div
              key={row.label}
              className={`ref-compare-row ${row.mismatch ? "mismatch" : ""}`}
            >
              <span className="ref-compare-label">{row.label}</span>
              <span className="ref-compare-value">{row.candidate}</span>
            </div>
          ))}
        </div>

        {/* Manuscript (middle) */}
        <div className="ref-compare-col ref-compare-manuscript">
          <div className="ref-compare-col-header">原稿に記載された文献情報</div>
          {rows.map((row) => (
            <div
              key={row.label}
              className={`ref-compare-row ${row.mismatch ? "mismatch" : ""}`}
            >
              <span className="ref-compare-label">{row.label}</span>
              <span className="ref-compare-value">{row.manuscript}</span>
            </div>
          ))}
        </div>

        {/* LLM candidate (right) */}
        {hasLlm && (
          <div className="ref-compare-col ref-compare-llm">
            <div className="ref-compare-col-header">
              LLM補正候補
              {llm.confidence && (
                <span className="ref-llm-confidence">
                  ({CONFIDENCE_LABELS[llm.confidence] || llm.confidence})
                </span>
              )}
            </div>
            {rows.map((row) => (
              <div
                key={row.label}
                className="ref-compare-row"
              >
                <span className="ref-compare-label">{row.label}</span>
                <span className="ref-compare-value">{row.llm || "—"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

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

      {/* Suspected reason (for unmatched tab) */}
      {tabKey === "unmatched" && card.suspected_reason && (
        <div className="ref-card-section">
          <span className="ref-card-reason">
            推定理由: {REASON_LABELS[card.suspected_reason] || card.suspected_reason}
          </span>
        </div>
      )}

      {/* DB-specific badges for Crossref/PubMed tabs */}
      {(tabKey === "crossref" || tabKey === "pubmed") && (
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
        </div>
      )}
    </div>
  );
}
