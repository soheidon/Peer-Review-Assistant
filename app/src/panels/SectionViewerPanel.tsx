import { useState, useEffect } from "react";

interface SectionEntry {
  name: string;
  heading: string | null;
  level: number | null;
  parent_section: string | null;
  start_paragraph: number;
  end_paragraph: number;
  has_subsections: boolean;
  aggregated_text_path: string | null;
}

interface SectionMap {
  section_count: number;
  sections: SectionEntry[];
}

interface TranslationEntry {
  original_text_hash: string;
  translated_text: string;
  translated_at: string;
}

interface TranslationData {
  sections: Record<string, TranslationEntry>;
  generated_at: string;
}

interface SectionViewerPanelProps {
  projectPath: string;
  sectionsDone: boolean;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
  translateJaDone: boolean;
  translateJaRunning: boolean;
  translateJaProgress: {section: string; heading: string; index: number; total: number} | null;
  summaryProConfigured: boolean;
  selectedSection: string | null;
  onSelectSection: (name: string) => void;
  onTranslateSection: (sectionName: string) => void;
  onTranslateAll: () => void;
  onCancelTranslate: () => void;
  onReloadTranslations: () => void;
  translationReloadKey: number;
  sectionViewerFontSize: "small" | "normal" | "large" | "xlarge";
  onFontSizeChange: (size: "small" | "normal" | "large" | "xlarge") => void;
  onDeleteTranslation: (sectionName: string) => void;
  onDeleteAllTranslations: () => void;
}

/** Normalize text before hashing to match Python's open(..., "r") behavior:
 *  - Universal newline: \r\n → \n
 *  - Strip leading/trailing whitespace (Python's .strip()) */
function normalizeForHash(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

/** Compute SHA-256 hash of a string using Web Crypto API. */
async function sha256(text: string): Promise<string> {
  const normalized = normalizeForHash(text);
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const FONT_PRESETS = {
  small:  { fontSize: "12px", lineHeight: "1.5", label: "小" },
  normal: { fontSize: "14px", lineHeight: "1.6", label: "中" },
  large:  { fontSize: "16px", lineHeight: "1.7", label: "大" },
  xlarge: { fontSize: "18px", lineHeight: "1.8", label: "特大" },
} as const;

const FONT_SIZE_OPTIONS = ["small", "normal", "large", "xlarge"] as const;

export default function SectionViewerPanel({
  projectPath,
  sectionsDone,
  statusMessage,
  translateJaDone,
  translateJaRunning,
  translateJaProgress,
  summaryProConfigured,
  selectedSection,
  onSelectSection,
  onTranslateSection,
  onTranslateAll,
  onCancelTranslate,
  onReloadTranslations,
  translationReloadKey,
  sectionViewerFontSize,
  onFontSizeChange,
  onDeleteTranslation,
  onDeleteAllTranslations,
}: SectionViewerPanelProps) {
  const [sectionMap, setSectionMap] = useState<SectionMap | null>(null);
  const [sectionText, setSectionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMap, setLoadingMap] = useState(false);
  const [useAggregated, setUseAggregated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Translation state
  const [translationsJa, setTranslationsJa] = useState<TranslationData | null>(null);
  const [translationStaleSections, setTranslationStaleSections] = useState<Set<string>>(new Set());

  // Delete confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState<"single" | "all" | null>(null);

  // Apply font size CSS variables
  useEffect(() => {
    const preset = FONT_PRESETS[sectionViewerFontSize];
    document.documentElement.style.setProperty("--section-viewer-font-size", preset.fontSize);
    document.documentElement.style.setProperty("--section-viewer-line-height", preset.lineHeight);
  }, [sectionViewerFontSize]);

  // Load section_map.json
  useEffect(() => {
    if (!projectPath || !sectionsDone) {
      setSectionMap(null);
      onSelectSection("");
      setSectionText("");
      return;
    }

    setLoadingMap(true);
    setError(null);
    const base = projectPath.replace(/\\/g, "/");
    const mapPath = `${base}/sections/section_map.json`;

    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("read_text_file", { path: mapPath }))
      .then((raw) => {
        const map = JSON.parse(raw) as SectionMap;
        setSectionMap(map);
      })
      .catch((e) => {
        setError("セクションマップの読み込みに失敗しました。");
        console.error(e);
      })
      .finally(() => setLoadingMap(false));
  }, [projectPath, sectionsDone]);

  // Load translations when project, translateJaDone, or reloadKey changes
  useEffect(() => {
    if (!projectPath) {
      setTranslationsJa(null);
      return;
    }

    const base = projectPath.replace(/\\/g, "/");
    const translationsPath = `${base}/translations/section_translations_ja.json`;

    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("read_text_file", { path: translationsPath }))
      .then((raw) => {
        const data = JSON.parse(raw) as TranslationData;
        setTranslationsJa(data);
      })
      .catch(() => {
        // File not found or parse error — no translations available
        setTranslationsJa(null);
      });
  }, [projectPath, translateJaDone, translationReloadKey]);

  // Load section text when selection changes + hash check
  useEffect(() => {
    if (!selectedSection || !projectPath || !sectionMap) return;

    const section = sectionMap.sections.find((s) => s.name === selectedSection);
    if (!section) return;

    const base = projectPath.replace(/\\/g, "/");

    let textPath: string;
    if (useAggregated && section.aggregated_text_path) {
      textPath = `${base}/${section.aggregated_text_path}`;
    } else {
      textPath = `${base}/sections/${section.name}.txt`;
    }

    setLoading(true);
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke<string>("read_text_file", { path: textPath }))
      .then(async (content) => {
        setSectionText(content);

        // Hash check: compare with stored translation hash
        if (translationsJa?.sections[selectedSection]) {
          const storedHash = translationsJa.sections[selectedSection].original_text_hash;
          try {
            const currentHash = await sha256(content);
            setTranslationStaleSections((prev) => {
              const next = new Set(prev);
              if (currentHash !== storedHash) {
                next.add(selectedSection);
              } else {
                next.delete(selectedSection);
              }
              return next;
            });
          } catch {
            // crypto.subtle unavailable — skip hash check
          }
        }
      })
      .catch(() => setSectionText("(ファイルの読み込みに失敗しました)"))
      .finally(() => setLoading(false));
  }, [selectedSection, projectPath, sectionMap, useAggregated, translationsJa]);

  // Reset aggregated toggle when section changes
  useEffect(() => {
    setUseAggregated(false);
  }, [selectedSection]);

  // Build hierarchical tree: parent sections with children
  const roots = sectionMap?.sections.filter((s) => !s.parent_section) ?? [];
  const getChildren = (parentName: string) =>
    sectionMap?.sections.filter((s) => s.parent_section === parentName) ?? [];

  const selectedEntry = sectionMap?.sections.find((s) => s.name === selectedSection);

  // Word count
  const wordCount = sectionText.trim() ? sectionText.trim().split(/\s+/).length : 0;

  // Does the selected section have a translation?
  const hasTranslation = !!(selectedSection && translationsJa?.sections[selectedSection]);

  // Is the selected section translatable? (has text OR can be aggregated)
  const isTranslatable = selectedEntry
    ? (!!sectionText.trim() || (selectedEntry.has_subsections && selectedEntry.aggregated_text_path))
    : false;

  // Is the selected section an H1 with no direct text? (empty own .txt file)
  const isH1Empty = selectedEntry
    ? ((selectedEntry.level === 0 || selectedEntry.level === null) &&
       !selectedEntry.parent_section &&
       !sectionText.trim() &&
       selectedEntry.has_subsections)
    : false;

  // ── Translation status counts ──────────────────────────────────────
  const allSections = sectionMap?.sections ?? [];
  const translatableSections = allSections.filter((sec) => {
    // A section is "translatable" if it has its own .txt with content
    // (we can't check file content here, but we can use has_subsections
    //  as a rough heuristic — sections without subsections at leaf level
    //  are the main text-bearing ones)
    // For counting, we consider H1+H2 sections
    const level = sec.level;
    return level === 0 || level === 1 || level === null;
  });

  const translatedCount = translatableSections.filter(
    (s) => translationsJa?.sections[s.name] && !translationStaleSections.has(s.name)
  ).length;
  const staleCount = translatableSections.filter(
    (s) => translationsJa?.sections[s.name] && translationStaleSections.has(s.name)
  ).length;
  const untranslatedCount = translatableSections.filter(
    (s) => !translationsJa?.sections[s.name]
  ).length;
  const totalTranslatable = translatableSections.length;

  // Empty state
  if (!projectPath) {
    return (
      <div className="panel">
        <h2>本文分割</h2>
        <div className="viewer-empty">
          {"プロジェクトが選択されていません。\n「プロジェクト」メニューでプロジェクトを作成または開いてください。"}
        </div>
      </div>
    );
  }

  if (!sectionsDone) {
    return (
      <div className="panel">
        <h2>本文分割</h2>
        <div className="viewer-empty">
          {"セクション分割がまだ実行されていません。\n「前処理」画面で「本文・引用文献を前処理」を実行してください。"}
        </div>
      </div>
    );
  }

  if (loadingMap) {
    return (
      <div className="panel">
        <h2>本文分割</h2>
        <div className="viewer-loading">セクションマップを読み込み中...</div>
      </div>
    );
  }

  if (error || !sectionMap) {
    return (
      <div className="panel">
        <h2>本文分割</h2>
        <div className="viewer-empty">
          {error || "セクションマップが見つかりません。"}
        </div>
      </div>
    );
  }

  return (
    <div>
      {statusMessage && (
        <div className={`status-banner ${statusMessage.type}`}>
          {statusMessage.text}
        </div>
      )}

      <div className="section-layout">
        {/* Left panel: section tree + status + font size */}
        <div className="section-list">
          <div className="section-list-header">
            {sectionMap.section_count}セクション
          </div>

          {/* Translation status summary */}
          {totalTranslatable > 0 && (
            <div className="translation-status-bar">
              <span className="translation-status-label">翻訳状況</span>
              <div className="translation-status-counts">
                <span className="ts-count ts-done">翻訳済 {translatedCount}</span>
                <span className="ts-count ts-pending">未翻訳 {untranslatedCount}</span>
                {staleCount > 0 && (
                  <span className="ts-count ts-stale">要更新 {staleCount}</span>
                )}
              </div>
            </div>
          )}

          {/* Font size control */}
          <div className="font-size-control">
            <span className="font-size-label">文字</span>
            {FONT_SIZE_OPTIONS.map((size) => (
              <button
                key={size}
                className={`font-size-btn ${sectionViewerFontSize === size ? "active" : ""}`}
                onClick={() => onFontSizeChange(size)}
                title={FONT_PRESETS[size].label}
              >
                {FONT_PRESETS[size].label}
              </button>
            ))}
          </div>

          {roots.map((section) => (
            <SectionTreeItem
              key={section.name}
              section={section}
              selected={selectedSection}
              onSelect={onSelectSection}
              getChildren={getChildren}
              depth={0}
              hasTranslation={!!translationsJa?.sections[section.name]}
              isStale={translationStaleSections.has(section.name)}
            />
          ))}
        </div>

        {/* Right panel: section content viewer */}
        <div className="section-viewer">
          {!selectedSection && (
            <div className="viewer-empty">
              左側のリストからセクションを選択してください。
            </div>
          )}

          {selectedSection && selectedEntry && (
            <>
              {/* Section header */}
              <div className="section-viewer-header">
                <div className="section-viewer-title">
                  {selectedEntry.heading || selectedEntry.name}
                </div>
                <div className="section-viewer-meta">
                  <span>
                    ¶{selectedEntry.start_paragraph}–{selectedEntry.end_paragraph}
                    {" "}({selectedEntry.end_paragraph - selectedEntry.start_paragraph}段落)
                  </span>
                  {selectedEntry.parent_section && (
                    <span>
                      親セクション: {selectedEntry.parent_section}
                    </span>
                  )}
                  <span>{wordCount}語</span>
                  {selectedEntry.has_subsections && (
                    <span style={{ color: "#888" }}>
                      （{getChildren(selectedEntry.name).length}サブセクション）
                    </span>
                  )}
                </div>

                {/* Aggregated view toggle */}
                {selectedEntry.has_subsections && (
                  <div style={{ marginTop: 6 }}>
                    <label style={{ fontSize: "11px", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={useAggregated}
                        onChange={(e) => setUseAggregated(e.target.checked)}
                      />
                      子セクションを含む（統合表示）
                    </label>
                  </div>
                )}
              </div>

              {/* Translation controls */}
              <div className="translation-controls">
                {!summaryProConfigured ? (
                  <span className="translation-disabled-hint">
                    翻訳には統括AIのProモデルが必要です。API設定で統括AIのProモデルを設定してください。
                  </span>
                ) : translateJaRunning ? (
                  <>
                    <span className="translation-progress">
                      {translateJaProgress
                        ? `翻訳中: ${translateJaProgress.heading} (${translateJaProgress.index}/${translateJaProgress.total})`
                        : "翻訳を開始しています..."}
                    </span>
                    <button onClick={onCancelTranslate} className="translation-cancel-btn">
                      翻訳を中止
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => onTranslateSection(selectedSection!)}
                      disabled={!isTranslatable}
                      title={!isTranslatable ? "このセクションには翻訳可能な本文がありません" : ""}
                    >
                      選択中セクションを翻訳
                    </button>
                    <button onClick={onTranslateAll}>
                      全セクションを翻訳
                    </button>
                    {translateJaDone && (
                      <button
                        onClick={onReloadTranslations}
                        style={{ fontSize: "11px", color: "#666" }}
                      >
                        翻訳を再読み込み
                      </button>
                    )}

                    {/* Separator and delete buttons */}
                    {hasTranslation && (
                      <>
                        <span className="translation-btn-separator" />
                        <button
                          className="translation-delete-btn"
                          onClick={() => setDeleteConfirm("single")}
                          disabled={translateJaRunning}
                          title="選択中のセクションの翻訳を削除します"
                        >
                          この翻訳を削除
                        </button>
                      </>
                    )}
                    {translationsJa && Object.keys(translationsJa.sections).length > 0 && (
                      <button
                        className="translation-delete-all-btn"
                        onClick={() => setDeleteConfirm("all")}
                        disabled={translateJaRunning}
                        title="全セクションの翻訳を削除します"
                      >
                        全翻訳を削除
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Delete confirmation dialogs */}
              {deleteConfirm === "single" && (
                <div className="translation-delete-confirm">
                  <div className="translation-delete-confirm-text">
                    セクション「{selectedEntry.heading || selectedSection}」の翻訳を削除しますか？
                  </div>
                  <div className="translation-delete-confirm-actions">
                    <button
                      className="translation-delete-confirm-yes"
                      onClick={() => {
                        setDeleteConfirm(null);
                        onDeleteTranslation(selectedSection!);
                      }}
                    >
                      削除する
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              {deleteConfirm === "all" && (
                <div className="translation-delete-confirm translation-delete-confirm-all">
                  <div className="translation-delete-confirm-text">
                    <strong>全{Object.keys(translationsJa?.sections ?? {}).length}セクション</strong>の翻訳を削除しますか？<br />
                    この操作は元に戻せません。
                  </div>
                  <div className="translation-delete-confirm-actions">
                    <button
                      className="translation-delete-confirm-yes translation-delete-confirm-danger"
                      onClick={() => {
                        setDeleteConfirm(null);
                        onDeleteAllTranslations();
                      }}
                    >
                      全て削除する
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              )}

              {/* H1 empty section: show guidance instead of stale translation */}
              {isH1Empty && !useAggregated && (
                <div className="h1-empty-notice">
                  <div className="h1-empty-notice-icon">ℹ️</div>
                  <div>
                    <strong>このセクションには直接の本文がありません。</strong><br />
                    左側のツリーからサブセクションを選択するか、「子セクションを含む（統合表示）」をオンにしてください。
                    {hasTranslation && !translationStaleSections.has(selectedSection) && (
                      <><br /><span style={{ color: "#888" }}>
                        表示中の翻訳は、以前に統合表示で翻訳されたものです。原文が変更された場合は再翻訳が必要です。
                      </span></>
                    )}
                  </div>
                </div>
              )}

              {/* Text content */}
              {loading ? (
                <div className="viewer-loading">テキストを読み込み中...</div>
              ) : isH1Empty && !useAggregated ? (
                /* H1 empty: no text to show, just show the notice above */
                <div className="section-viewer-text" style={{ color: "#bbb", fontStyle: "italic" }}>
                  （このセクションには直接の本文がありません。サブセクションを選択してください。）
                </div>
              ) : hasTranslation ? (
                <div className="section-viewer-split">
                  <div className="section-viewer-pane section-viewer-pane-left">
                    <div className="translation-pane-header">原文 (English)</div>
                    {translationStaleSections.has(selectedSection) && (
                      <div className="translation-stale-badge">
                        原文が変更されています。再翻訳してください。
                      </div>
                    )}
                    <div className="section-viewer-text">
                      {sectionText || "(テキストがありません)"}
                    </div>
                  </div>
                  <div className="section-viewer-pane section-viewer-pane-right">
                    <div className="translation-pane-header">日本語訳</div>
                    <div className="section-viewer-text">
                      {translationsJa!.sections[selectedSection].translated_text}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="section-viewer-text">
                  {sectionText || "(テキストがありません)"}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Next step */}
      <div className="next-step">
        {!sectionsDone && "次: 「前処理」メニューから 前処理 を実行してください"}
        {sectionsDone && !translateJaDone && "翻訳が必要な場合は、上の「全セクションを翻訳」ボタンをクリックしてください"}
        {sectionsDone && translateJaDone && "翻訳は完了しています。原文が更新された場合は再翻訳してください。"}
      </div>
    </div>
  );
}

/* ── Section tree item (recursive) ─────────────────────────────────────── */

interface TreeItemProps {
  section: SectionEntry;
  selected: string | null;
  onSelect: (name: string) => void;
  getChildren: (parentName: string) => SectionEntry[];
  depth: number;
  hasTranslation?: boolean;
  isStale?: boolean;
}

function SectionTreeItem({
  section,
  selected,
  onSelect,
  getChildren,
  depth,
  hasTranslation,
  isStale,
}: TreeItemProps) {
  const children = getChildren(section.name);
  const isSelected = selected === section.name;
  const isH1 = depth === 0;
  const isEmptyH1 = isH1 && section.has_subsections && children.length > 0;

  return (
    <>
      <div
        className={`section-list-item ${isSelected ? "selected" : ""} ${isEmptyH1 ? "h1-empty" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(section.name)}
      >
        <div className="section-list-item-name">
          {section.heading || section.name}
          {hasTranslation && (
            <span className={`section-list-item-ja-badge ${isStale ? "stale" : ""}`} title={
              isStale ? "日本語訳あり（要更新）" : "日本語訳あり"
            }>
              {isStale ? "🇯🇵⚠️" : "🇯🇵"}
            </span>
          )}
          {isEmptyH1 && (
            <span className="section-list-item-h1-empty-badge" title="サブセクションに本文があります">
              📂
            </span>
          )}
        </div>
        <div className="section-list-item-range">
          ¶{section.start_paragraph}–{section.end_paragraph}
        </div>
      </div>
      {children.map((child) => (
        <SectionTreeItem
          key={child.name}
          section={child}
          selected={selected}
          onSelect={onSelect}
          getChildren={getChildren}
          depth={depth + 1}
          hasTranslation={!!section.parent_section ? hasTranslation : undefined}
          isStale={section.parent_section ? isStale : undefined}
        />
      ))}
    </>
  );
}
