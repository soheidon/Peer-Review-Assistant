import { useState } from "react";

/* ── types ─────────────────────────────────────────────────────────────── */

interface ManualSearchCandidate {
  candidate_id: string;
  source: "crossref" | "pubmed" | "google_books" | "semantic_scholar" | "cinii";
  title: string | null;
  authors: string[];
  year: number | null;
  journal: string | null;
  publisher: string | null;
  doi: string | null;
  isbn: string | null;
  url: string | null;
  score: number | null;
  confidence: "high" | "medium" | "low" | null;
  match_reasons: string[];
}

interface ViewerCard {
  reference_id: string;
  title: string | null;
  authors: string[];
  year: number | null;
  doi: string | null;
  llm_candidate: {
    title: string | null;
    book_title: string | null;
    authors: string[];
    year: number | null;
    journal: string | null;
    publisher: string | null;
    editor: string[] | null;
    isbn: string | null;
    url: string | null;
    type: string | null;
  } | null;
}

interface Props {
  referenceId: string;
  card: ViewerCard;
  projectPath: string;
  onCandidateAccepted: () => void;
}

/* ── field definitions ─────────────────────────────────────────────────── */

interface FieldDef {
  key: string;
  label: string;
}

const FIELDS: FieldDef[] = [
  { key: "author", label: "著者" },
  { key: "year", label: "年" },
  { key: "title", label: "タイトル" },
  { key: "journal", label: "雑誌名" },
  { key: "book_title", label: "書名" },
  { key: "publisher", label: "出版社" },
  { key: "doi", label: "DOI" },
  { key: "url", label: "URL" },
  { key: "isbn", label: "ISBN" },
];

const SOURCES = [
  { key: "crossref", label: "Crossref" },
  { key: "pubmed", label: "PubMed" },
  { key: "google_books", label: "Google Books" },
  { key: "cinii", label: "CiNii" },
  { key: "semantic_scholar", label: "Semantic Scholar" },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  crossref: "Crossref",
  pubmed: "PubMed",
  google_books: "Google Books",
  cinii: "CiNii",
  semantic_scholar: "Semantic Scholar",
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const REASON_LABELS: Record<string, string> = {
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
  doi_match: "DOI一致",
};

/* ── default field selection by type ───────────────────────────────────── */

function defaultFields(card: ViewerCard): string[] {
  const t = card.llm_candidate?.type;
  if (t === "journal_article") return ["author", "year", "title"];
  if (t === "book" || t === "edited_book" || t === "manual")
    return ["author", "book_title", "publisher"];
  if (t === "government_document" || t === "web_document")
    return ["author", "title", "url", "year"];
  if (t === "report") return ["author", "title", "year"];
  // fallback: pick whatever is available
  const available: string[] = [];
  if (card.authors?.length) available.push("author");
  if (card.year) available.push("year");
  if (card.title) available.push("title");
  if (card.doi) available.push("doi");
  return available.length > 0 ? available : ["author", "title"];
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function hasField(card: ViewerCard, key: string): boolean {
  switch (key) {
    case "author": return (card.authors?.length ?? 0) > 0;
    case "year": return card.year != null;
    case "title": return !!card.title;
    case "journal": return !!card.llm_candidate?.journal;
    case "book_title": return !!card.llm_candidate?.book_title;
    case "publisher": return !!card.llm_candidate?.publisher;
    case "doi": return !!card.doi;
    case "url": return !!card.llm_candidate?.url;
    case "isbn": return !!card.llm_candidate?.isbn;
    default: return false;
  }
}

/* ── component ──────────────────────────────────────────────────────────── */

export default function ManualSearchSection({
  referenceId,
  card,
  projectPath,
  onCandidateAccepted,
}: Props) {
  const defaultSel = defaultFields(card);
  const [selectedFields, setSelectedFields] = useState<string[]>(defaultSel);
  const [activeSource, setActiveSource] = useState<string>("crossref");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<ManualSearchCandidate[] | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [acceptError, setAcceptError] = useState<string | null>(null);
  const [acceptedId, setAcceptedId] = useState<string | null>(null);

  const toggleField = (key: string) => {
    setSelectedFields((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
    // Clear previous results when field selection changes
    setCandidates(null);
    setError(null);
  };

  const handleSearch = async () => {
    if (selectedFields.length === 0) return;
    setLoading(true);
    setError(null);
    setCandidates(null);
    setAcceptedId(null);
    setAcceptError(null);

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const cmd = Command.create("pra-cli", [
        "search-reference-candidates",
        "--project", projectPath,
        "--reference-id", referenceId,
        "--source", activeSource,
        "--fields", selectedFields.join(","),
        "--max-results", "5",
      ]);
      const output = await cmd.execute();

      if (output.code !== 0) {
        const errMsg = output.stderr || `Exit code ${output.code}`;
        setError(errMsg);
        return;
      }

      // Parse JSON Lines from stdout
      const lines = output.stdout.trim().split("\n");
      const parsed: ManualSearchCandidate[] = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.event === "candidate") {
            parsed.push(obj as ManualSearchCandidate);
          } else if (obj.event === "error") {
            setError(obj.message || "Search error");
          }
        } catch {
          // skip unparseable lines
        }
      }
      setCandidates(parsed);
      if (parsed.length === 0 && !error) {
        setError("該当する候補が見つかりませんでした。検索条件を変えてお試しください。");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (candidateId: string) => {
    setAcceptingId(candidateId);
    setAcceptError(null);

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");

      // Step 1: Accept the candidate
      const acceptCmd = Command.create("pra-cli", [
        "accept-reference-candidate",
        "--project", projectPath,
        "--reference-id", referenceId,
        "--candidate-id", candidateId,
      ]);
      const acceptOutput = await acceptCmd.execute();
      if (acceptOutput.code !== 0) {
        setAcceptError(acceptOutput.stderr || `Accept failed with code ${acceptOutput.code}`);
        return;
      }

      // Step 2: Regenerate viewer data
      const viewerCmd = Command.create("pra-cli", [
        "citation-viewer-data",
        "--project", projectPath,
      ]);
      const viewerOutput = await viewerCmd.execute();
      if (viewerOutput.code !== 0) {
        setAcceptError(viewerOutput.stderr || `Viewer data regeneration failed with code ${viewerOutput.code}`);
        return;
      }

      setAcceptedId(candidateId);
      onCandidateAccepted();
    } catch (e: unknown) {
      setAcceptError(e instanceof Error ? e.message : String(e));
    } finally {
      setAcceptingId(null);
    }
  };

  const searchLabel = (() => {
    if (selectedFields.length === 0) return "フィールドを選択してください";
    const labels = selectedFields.map(
      (k) => FIELDS.find((f) => f.key === k)?.label || k
    );
    return `${SOURCE_LABELS[activeSource] || activeSource} で検索 (${labels.join("＋")})`;
  })();

  return (
    <div className="manual-search-section">
      <div className="manual-search-label">手動検索</div>

      {/* Field checkboxes */}
      <div className="manual-search-fields">
        {FIELDS.map((f) => {
          const available = hasField(card, f.key);
          const selected = selectedFields.includes(f.key);
          return (
            <label
              key={f.key}
              className={`manual-search-field ${!available ? "unavailable" : ""} ${selected ? "selected" : ""}`}
              title={!available ? "このフィールドのデータがありません" : ""}
            >
              <input
                type="checkbox"
                checked={selected}
                disabled={!available}
                onChange={() => toggleField(f.key)}
              />
              <span>{f.label}</span>
            </label>
          );
        })}
      </div>

      {/* Source selector */}
      <div className="manual-search-sources">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            className={`manual-search-source-btn ${activeSource === s.key ? "active" : ""}`}
            onClick={() => {
              setActiveSource(s.key);
              setCandidates(null);
              setError(null);
              setAcceptedId(null);
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Search button */}
      <button
        className="manual-search-btn"
        disabled={selectedFields.length === 0 || loading}
        onClick={handleSearch}
      >
        {loading ? "検索中..." : searchLabel}
      </button>

      {/* Error */}
      {error && <div className="manual-search-error">{error}</div>}

      {/* Candidate list */}
      {candidates && candidates.length > 0 && (
        <div className="manual-search-candidates">
          <div className="manual-search-candidates-label">
            候補 ({candidates.length}件)
          </div>

          {candidates.map((c) => {
            const isAccepted = acceptedId === c.candidate_id;
            const isAccepting = acceptingId === c.candidate_id;
            const isOtherAccepting = acceptingId != null && acceptingId !== c.candidate_id;

            return (
              <div
                key={c.candidate_id}
                className={`manual-candidate-card ${isAccepted ? "accepted" : ""}`}
              >
                <div className="manual-candidate-header">
                  <span className="manual-candidate-source">
                    {SOURCE_LABELS[c.source] || c.source}
                  </span>
                  {c.score != null && (
                    <span className="manual-candidate-score">
                      スコア: {(c.score * 100).toFixed(0)}%
                    </span>
                  )}
                  {c.confidence && (
                    <span className={`manual-candidate-confidence conf-${c.confidence}`}>
                      信頼度: {CONFIDENCE_LABELS[c.confidence] || c.confidence}
                    </span>
                  )}
                </div>

                <div className="manual-candidate-fields">
                  {c.title && (
                    <div className="manual-candidate-field">
                      <span className="manual-candidate-label">タイトル</span>
                      <span className="manual-candidate-value">{c.title}</span>
                    </div>
                  )}
                  {c.authors?.length > 0 && (
                    <div className="manual-candidate-field">
                      <span className="manual-candidate-label">著者</span>
                      <span className="manual-candidate-value">
                        {c.authors.join(", ")}
                      </span>
                    </div>
                  )}
                  {c.year != null && (
                    <div className="manual-candidate-field">
                      <span className="manual-candidate-label">年</span>
                      <span className="manual-candidate-value">{c.year}</span>
                    </div>
                  )}
                  {c.journal && (
                    <div className="manual-candidate-field">
                      <span className="manual-candidate-label">雑誌名</span>
                      <span className="manual-candidate-value">{c.journal}</span>
                    </div>
                  )}
                  {c.publisher && (
                    <div className="manual-candidate-field">
                      <span className="manual-candidate-label">出版社</span>
                      <span className="manual-candidate-value">{c.publisher}</span>
                    </div>
                  )}
                  {c.doi && (
                    <div className="manual-candidate-field">
                      <span className="manual-candidate-label">DOI</span>
                      <span className="manual-candidate-value">{c.doi}</span>
                    </div>
                  )}
                  {c.isbn && (
                    <div className="manual-candidate-field">
                      <span className="manual-candidate-label">ISBN</span>
                      <span className="manual-candidate-value">{c.isbn}</span>
                    </div>
                  )}
                  {c.url && (
                    <div className="manual-candidate-field">
                      <span className="manual-candidate-label">URL</span>
                      <span className="manual-candidate-value">
                        <a href={c.url} target="_blank" rel="noopener noreferrer">
                          {c.url}
                        </a>
                      </span>
                    </div>
                  )}
                </div>

                {c.match_reasons?.length > 0 && (
                  <div className="manual-candidate-reasons">
                    {c.match_reasons.map((r) => (
                      <span key={r} className="manual-candidate-reason-tag">
                        {REASON_LABELS[r] || r}
                      </span>
                    ))}
                  </div>
                )}

                <div className="manual-candidate-actions">
                  {isAccepted ? (
                    <span className="manual-candidate-accepted-badge">
                      採用済み
                    </span>
                  ) : (
                    <button
                      className="manual-candidate-accept-btn"
                      disabled={isAccepting || isOtherAccepting}
                      onClick={() => handleAccept(c.candidate_id)}
                    >
                      {isAccepting
                        ? "採用中..."
                        : `${SOURCE_LABELS[c.source] || c.source}候補を採用`}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Accept error */}
      {acceptError && (
        <div className="manual-search-error">{acceptError}</div>
      )}
    </div>
  );
}
