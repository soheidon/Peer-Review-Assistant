import { useState, useEffect } from "react";
import { slotDisplayName } from "./slotLabels";

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

interface LlmSearchResult {
  identified: boolean | null;
  confidence: string | null;
  publication_type: string | null;
  corrected: Record<string, unknown> | null;
  missing_doi_confirmed: boolean;
  notes: string | null;
  source_urls: string[] | null;
}

interface Props {
  referenceId: string;
  suggestions: SearchSuggestions | null;
  deferredInfo: DeferredInfo | null;
  projectPath: string;
  llmSlots: { name: string; provider: string; baseUrl?: string; model: string; apiKey: string; apiKeyMode?: string; apiKeyEnvName?: string; enabled?: boolean }[];
  llmSearch?: LlmSearchResult | null;
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

const TYPE_LABELS: Record<string, string> = {
  journal_article: "雑誌論文",
  book: "書籍",
  edited_book: "編集書籍",
  book_chapter: "書籍の章",
  report: "報告書",
  government_document: "政府文書",
  web_document: "Web文書",
  conference_paper: "会議録",
  other: "その他",
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
  llmSlots,
  llmSearch,
  onDataChanged,
}: Props) {
  const [deferring, setDeferring] = useState(false);
  const [deferReason, setDeferReason] = useState("reference_style");
  const [deferNote, setDeferNote] = useState("");
  const [deferDone, setDeferDone] = useState(!!deferredInfo);
  const [deferError, setDeferError] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState<string | null>(null);

  // Per-card LLM search state
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<LlmSearchResult | null>(llmSearch ?? null);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Filter to enabled reviewer slots with provider set
  const reviewerSlots = llmSlots.filter(
    (s) => s.name.startsWith("reviewer") && s.enabled !== false && s.provider.trim()
  );

  // Auto-select first available reviewer slot
  useEffect(() => {
    if (!selectedSlot && reviewerSlots.length > 0) {
      setSelectedSlot(reviewerSlots[0].name);
    }
  }, [reviewerSlots, selectedSlot]);

  // Sync external llmSearch changes
  useEffect(() => {
    if (llmSearch) {
      setSearchResult(llmSearch);
    }
  }, [llmSearch]);

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
      setCopiedQuery(null);
    });
  };

  const handleLlmSearch = async () => {
    const slot = reviewerSlots.find((s) => s.name === selectedSlot);
    if (!slot) {
      setSearchError("利用可能なLLMスロットがありません。SettingsでLLMを設定してください。");
      return;
    }
    setSearching(true);
    setSearchError(null);
    setSearchResult(null);

    try {
      const { Command } = await import("@tauri-apps/plugin-shell");

      // Build args - resolve API key
      const args = [
        "search-single-reference-llm",
        "--project", projectPath,
        "--reference-id", referenceId,
        "--slot", slot.name,
        "--provider", slot.provider,
        "--base-url", slot.baseUrl || "",
        "--model", slot.model,
      ];

      // API key handling: direct key or env var name
      if (slot.apiKey && slot.apiKeyMode !== "env") {
        args.push("--api-key", slot.apiKey);
      } else if (slot.apiKeyMode === "env" && slot.apiKeyEnvName) {
        args.push("--api-key-env", slot.apiKeyEnvName);
      }

      const cmd = Command.create("pra-cli", args);
      const output = await cmd.execute();

      if (output.code !== 0) {
        setSearchError(output.stderr || `LLM search failed with code ${output.code}`);
        return;
      }

      // Parse the result from stdout JSON Lines
      const lines = output.stdout.trim().split("\n");
      let resultData: LlmSearchResult | null = null;
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.event === "done" && obj.task === "search-single-reference-llm") {
            resultData = {
              identified: obj.identified ?? false,
              confidence: obj.confidence ?? "none",
              publication_type: null,
              corrected: null,
              missing_doi_confirmed: false,
              notes: obj.message ?? null,
              source_urls: null,
            };
          }
        } catch {
          // skip unparseable lines
        }
      }

      // Regenerate viewer data to pick up the result
      const viewerCmd = Command.create("pra-cli", [
        "citation-viewer-data",
        "--project", projectPath,
      ]);
      await viewerCmd.execute();

      // After regeneration, the parent will reload data and this
      // component will re-render with the updated llmSearch prop.
      // Set a basic result for immediate display.
      if (resultData) {
        setSearchResult(resultData);
      } else {
        setSearchResult({
          identified: false,
          confidence: "none",
          publication_type: null,
          corrected: null,
          missing_doi_confirmed: false,
          notes: null,
          source_urls: null,
        });
      }
      onDataChanged();
    } catch (e: unknown) {
      setSearchError(e instanceof Error ? e.message : String(e));
    } finally {
      setSearching(false);
    }
  };

  // ── LLM Slot Selector (shared UI element) ──────────────────────────

  const llmSlotSelector = reviewerSlots.length > 0 && (
    <div className="llm-slot-selector">
      <div className="llm-search-label">LLMで直接検索</div>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <select
          className="citation-ai-select"
          value={selectedSlot}
          onChange={(e) => setSelectedSlot(e.target.value)}
          disabled={searching}
        >
          {reviewerSlots.map((s) => (
            <option key={s.name} value={s.name}>
              {slotDisplayName(s.name)} ({s.model})
            </option>
          ))}
        </select>
        <button
          className="llm-search-run-btn"
          disabled={!selectedSlot || searching}
          onClick={handleLlmSearch}
        >
          {searching ? "検索中..." : "LLMで検索"}
        </button>
      </div>
    </div>
  );

  // ── LLM Search Result ──────────────────────────────────────────────

  const llmResultDisplay = searchResult && (
    <div className={`llm-search-result ${searchResult.identified ? "identified" : "not-identified"}`}>
      <div className="llm-search-result-header">
        <span className={`llm-search-confidence llm-conf-${searchResult.confidence || "none"}`}>
          信頼度: {
            searchResult.confidence === "high" ? "高" :
            searchResult.confidence === "medium" ? "中" :
            searchResult.confidence === "low" ? "低" : "特定できず"
          }
        </span>
        {searchResult.identified && (
          <span className="llm-search-identified-badge">特定済み</span>
        )}
      </div>
      {searchResult.corrected && (
        <div className="llm-search-corrected">
          {((searchResult.corrected as Record<string, unknown>).title) && (
            <div className="llm-search-field">
              <span className="llm-search-field-label">タイトル:</span>
              <span>{(searchResult.corrected as Record<string, unknown>).title as string}</span>
            </div>
          )}
          {((searchResult.corrected as Record<string, unknown>).journal) && (
            <div className="llm-search-field">
              <span className="llm-search-field-label">雑誌名:</span>
              <span>{(searchResult.corrected as Record<string, unknown>).journal as string}</span>
            </div>
          )}
          {((searchResult.corrected as Record<string, unknown>).publisher) && (
            <div className="llm-search-field">
              <span className="llm-search-field-label">出版社:</span>
              <span>{(searchResult.corrected as Record<string, unknown>).publisher as string}</span>
            </div>
          )}
          {((searchResult.corrected as Record<string, unknown>).doi) && (
            <div className="llm-search-field">
              <span className="llm-search-field-label">DOI:</span>
              <span>{(searchResult.corrected as Record<string, unknown>).doi as string}</span>
            </div>
          )}
          {((searchResult.corrected as Record<string, unknown>).isbn) && (
            <div className="llm-search-field">
              <span className="llm-search-field-label">ISBN:</span>
              <span>{(searchResult.corrected as Record<string, unknown>).isbn as string}</span>
            </div>
          )}
          {((searchResult.corrected as Record<string, unknown>).url) && (
            <div className="llm-search-field">
              <span className="llm-search-field-label">URL:</span>
              <a href={(searchResult.corrected as Record<string, unknown>).url as string}
                 target="_blank" rel="noopener noreferrer">
                {(searchResult.corrected as Record<string, unknown>).url as string}
              </a>
            </div>
          )}
        </div>
      )}
      {searchResult.notes && (
        <div className="llm-search-notes-text">{searchResult.notes}</div>
      )}
    </div>
  );

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

        {/* LLM direct search still available even when deferred */}
        {llmSlotSelector}
        {llmResultDisplay}
        {searchError && <div className="manual-search-error">{searchError}</div>}
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

        {/* LLM direct search available even without suggestions */}
        {llmSlotSelector}
        {llmResultDisplay}
        {searchError && <div className="manual-search-error">{searchError}</div>}

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

      {/* LLM direct search */}
      {llmSlotSelector}
      {llmResultDisplay}
      {searchError && <div className="manual-search-error">{searchError}</div>}

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
