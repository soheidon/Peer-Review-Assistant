import { useState } from "react";

/* ── types ─────────────────────────────────────────────────────────────── */

interface SearchQuery {
  source: string;
  query: string;
}

interface SearchSuggestions {
  suggested_sources: string[];
  search_queries: SearchQuery[];
  notes: string[];
  recommended_action: string | null;
}

interface DeferredInfo {
  reason: string | null;
  note: string | null;
  deferred_at: string | null;
}

interface Props {
  referenceId: string;
  suggestions: SearchSuggestions | null;
  deferredInfo: DeferredInfo | null;
  projectPath: string;
  onDataChanged: () => void;
}

/* ── source labels & icons ────────────────────────────────────────────── */

const SOURCE_DISPLAY: Record<string, { label: string; color: string }> = {
  semantic_scholar: { label: "Semantic Scholar", color: "#1a73e8" },
  google_scholar: { label: "Google Scholar", color: "#34a853" },
  web_search: { label: "Web検索", color: "#ea4335" },
  crossref: { label: "Crossref", color: "#f9ab00" },
  pubmed: { label: "PubMed", color: "#1a73e8" },
  google_books: { label: "Google Books", color: "#34a853" },
};

const ACTION_LABELS: Record<string, string> = {
  search_semantic_scholar: "Semantic Scholarで検索",
  search_google_scholar: "Google Scholarで検索",
  search_web: "Web検索",
  search_multiple: "複数ソースで検索",
  defer: "後ほど検討",
};

const DEFERRED_REASON_LABELS: Record<string, string> = {
  reference_style: "文献スタイルの問題",
  bibliographic_accuracy: "書誌情報の正確性",
  metadata_completion: "メタデータ補完待ち",
  citation_context_match: "本文引用との照合",
};

/* ── helpers ──────────────────────────────────────────────────────────── */

function buildWebSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function buildGoogleScholarUrl(query: string): string {
  return `https://scholar.google.com/scholar?q=${encodeURIComponent(query)}`;
}

function buildSemanticScholarUrl(query: string): string {
  return `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}`;
}

/* ── component ─────────────────────────────────────────────────────────── */

export default function LlmSearchSupport({
  referenceId,
  suggestions,
  deferredInfo,
  projectPath,
  onDataChanged,
}: Props) {
  const [deferring, setDeferring] = useState(false);
  const [deferReason, setDeferReason] = useState("reference_style");
  const [deferNote, setDeferNote] = useState("");
  const [deferDone, setDeferDone] = useState(!!deferredInfo);
  const [deferError, setDeferError] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  const handleDefer = async () => {
    setDeferring(true);
    setDeferError(null);
    try {
      const { Command } = await import("@tauri-apps/plugin-shell");
      const args = [
        "defer-reference",
        "--project", projectPath,
        "--reference-id", referenceId,
        "--reason", deferReason,
      ];
      if (deferNote.trim()) {
        args.push("--note", deferNote.trim());
      }
      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();
      if (output.code !== 0) {
        setDeferError(output.stderr || `Defer failed with code ${output.code}`);
        return;
      }

      // Regenerate viewer data
      const viewerCmd = Command.create("pra-cli", [
        "citation-viewer-data",
        "--project", projectPath,
      ]);
      await viewerCmd.execute();

      setDeferDone(true);
      onDataChanged();
    } catch (e: unknown) {
      setDeferError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeferring(false);
    }
  };

  const handleCopyQuery = (query: string) => {
    navigator.clipboard.writeText(query).then(() => {
      setCopiedQuery(query);
      setTimeout(() => setCopiedQuery(null), 2000);
    }).catch(() => {
      // Fallback: select text
      setCopiedQuery(null);
    });
  };

  // ── Already deferred ──────────────────────────────────────────────
  if (deferDone && deferredInfo?.reason) {
    return (
      <div className="llm-search-section">
        <div className="llm-search-label">LLM検索支援</div>
        <div className="deferred-badge">
          後ほど検討
          <span className="deferred-reason-chip">
            {DEFERRED_REASON_LABELS[deferredInfo.reason] || deferredInfo.reason}
          </span>
        </div>
        {deferredInfo.note && (
          <div className="deferred-note">{deferredInfo.note}</div>
        )}
      </div>
    );
  }

  // ── No suggestions available ──────────────────────────────────────
  if (!suggestions || !suggestions.search_queries?.length) {
    return (
      <div className="llm-search-section">
        <div className="llm-search-label">LLM検索支援</div>
        <div className="llm-search-empty">
          検索候補がまだ生成されていません。「LLM検索候補生成」を実行してください。
        </div>
        {/* Defer section always available */}
        <DeferSection
          deferring={deferring}
          deferReason={deferReason}
          deferNote={deferNote}
          deferError={deferError}
          onReasonChange={setDeferReason}
          onNoteChange={setDeferNote}
          onDefer={handleDefer}
        />
      </div>
    );
  }

  const { suggested_sources, search_queries, notes, recommended_action } =
    suggestions;

  return (
    <div className="llm-search-section">
      <div className="llm-search-label">LLM検索支援</div>

      {/* Recommended action */}
      {recommended_action && (
        <div className="llm-search-action">
          推奨アクション:{" "}
          <span className="llm-action-chip">
            {ACTION_LABELS[recommended_action] || recommended_action}
          </span>
        </div>
      )}

      {/* Search queries */}
      <div className="llm-search-queries">
        <div className="llm-search-queries-label">
          検索クエリ候補
        </div>
        {search_queries.map((q, idx) => {
          const src = SOURCE_DISPLAY[q.source] || {
            label: q.source,
            color: "#666",
          };
          const isCopied = copiedQuery === q.query;

          // Build appropriate URL
          let searchUrl: string | null = null;
          let urlLabel = "検索";
          if (q.source === "google_scholar") {
            searchUrl = buildGoogleScholarUrl(q.query);
            urlLabel = "Google Scholarで開く";
          } else if (q.source === "web_search" || q.source === "web") {
            searchUrl = buildWebSearchUrl(q.query);
            urlLabel = "Web検索";
          } else if (q.source === "semantic_scholar") {
            searchUrl = buildSemanticScholarUrl(q.query);
            urlLabel = "Semantic Scholar API";
          }

          return (
            <div key={`${q.source}-${idx}`} className="llm-query-card">
              <div className="llm-query-header">
                <span
                  className="llm-query-source"
                  style={{ color: src.color }}
                >
                  {src.label}
                </span>
              </div>
              <div className="llm-query-text">{q.query}</div>
              <div className="llm-query-actions">
                <button
                  className="llm-query-copy-btn"
                  onClick={() => handleCopyQuery(q.query)}
                >
                  {isCopied ? "コピー済み" : "コピー"}
                </button>
                {searchUrl && (
                  <a
                    href={searchUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="llm-query-search-link"
                  >
                    {urlLabel}
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Notes */}
      {notes?.length > 0 && (
        <div className="llm-search-notes">
          <div className="llm-search-notes-label">メモ</div>
          <ul className="llm-search-notes-list">
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Defer section */}
      <DeferSection
        deferring={deferring}
        deferReason={deferReason}
        deferNote={deferNote}
        deferError={deferError}
        onReasonChange={setDeferReason}
        onNoteChange={setDeferNote}
        onDefer={handleDefer}
      />
    </div>
  );
}

/* ── Defer sub-component ───────────────────────────────────────────────── */

function DeferSection({
  deferring,
  deferReason,
  deferNote,
  deferError,
  onReasonChange,
  onNoteChange,
  onDefer,
}: {
  deferring: boolean;
  deferReason: string;
  deferNote: string;
  deferError: string | null;
  onReasonChange: (v: string) => void;
  onNoteChange: (v: string) => void;
  onDefer: () => void;
}) {
  return (
    <div className="defer-section">
      <div className="defer-label">後ほど検討</div>
      <div className="defer-controls">
        <select
          className="defer-reason-select"
          value={deferReason}
          onChange={(e) => onReasonChange(e.target.value)}
        >
          {Object.entries(DEFERRED_REASON_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <input
          type="text"
          className="defer-note-input"
          placeholder="備考（任意）"
          value={deferNote}
          onChange={(e) => onNoteChange(e.target.value)}
        />
        <button
          className="defer-btn"
          disabled={deferring}
          onClick={onDefer}
        >
          {deferring ? "処理中..." : "後ほど検討に回す"}
        </button>
      </div>
      {deferError && (
        <div className="manual-search-error">{deferError}</div>
      )}
    </div>
  );
}
