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
  const hasCandidate = card.correct_candidate !== null;
  const hasOriginalText = card.original_text.length > 0;

  return (
    <div className={`ref-card ${statusClass}`}>
      {/* Row 1: metadata bar (2-column) */}
      <div className="ref-card-meta">
        <div className="ref-card-meta-left">
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
        <div className="ref-card-meta-right">
          {card.authors.length > 0 && (
            <span>著者: {card.authors.join("; ")}</span>
          )}
          {card.year && <span>年: {card.year}</span>}
          {card.journal && <span>雑誌名: {card.journal}</span>}
          {card.volume && <span>巻: {card.volume}</span>}
          {card.issue && <span>号: {card.issue}</span>}
          {card.pages && <span>ページ: {card.pages}</span>}
          {card.doi && (
            <span className="ref-doi">DOI: {card.doi}</span>
          )}
        </div>
      </div>

      {/* Row 2: title (full width) */}
      {card.title && (
        <div className="ref-card-title">
          タイトル: {card.title}
        </div>
      )}

      {/* Row 3+: correct candidate */}
      {hasCandidate && (
        <div className="ref-card-section">
          <div className="ref-card-section-label">正しい文献情報候補：</div>
          <div className="ref-card-section-content">
            <CandidateText candidate={card.correct_candidate!} />
          </div>
        </div>
      )}

      {/* Row 4: original manuscript reference */}
      {hasOriginalText && (
        <div className="ref-card-section">
          <div className="ref-card-section-label">原稿に記載された文献情報：</div>
          <div className="ref-card-section-content ref-card-original">
            {card.original_text}
          </div>
        </div>
      )}

      {/* Row 5: warnings */}
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

      {/* Row 6: metadata mismatches */}
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

/* ── Candidate text formatter ─────────────────────────────────────────── */

function CandidateText({
  candidate,
}: {
  candidate: NonNullable<ViewerCard["correct_candidate"]>;
}) {
  const parts: string[] = [];

  // Authors
  if (candidate.authors.length > 0) {
    parts.push(candidate.authors.join(", "));
  }

  // Year
  if (candidate.year) {
    parts.push(`(${candidate.year})`);
  }

  // Title
  if (candidate.title) {
    parts.push(`${candidate.title}.`);
  }

  // Journal
  if (candidate.journal) {
    let journalStr = candidate.journal;
    if (candidate.volume) {
      journalStr += `, ${candidate.volume}`;
      if (candidate.issue) {
        journalStr += `(${candidate.issue})`;
      }
    }
    if (candidate.pages) {
      journalStr += `, ${candidate.pages}`;
    }
    parts.push(journalStr + ".");
  }

  // DOI
  if (candidate.doi) {
    parts.push(`https://doi.org/${candidate.doi}`);
  }

  // Source DB
  if (candidate.source_db) {
    parts.push(`[${candidate.source_db}]`);
  }

  return <span>{parts.join(" ")}</span>;
}
