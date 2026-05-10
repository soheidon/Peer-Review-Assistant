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
}

/** Compute SHA-256 hash of a string using Web Crypto API. */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

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
        {/* Left panel: section tree */}
        <div className="section-list">
          <div className="section-list-header">
            {sectionMap.section_count}セクション
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
                  </>
                )}
              </div>

              {/* Text content */}
              {loading ? (
                <div className="viewer-loading">テキストを読み込み中...</div>
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
}

function SectionTreeItem({
  section,
  selected,
  onSelect,
  getChildren,
  depth,
  hasTranslation,
}: TreeItemProps) {
  const children = getChildren(section.name);
  const isSelected = selected === section.name;

  return (
    <>
      <div
        className={`section-list-item ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(section.name)}
      >
        <div className="section-list-item-name">
          {section.heading || section.name}
          {hasTranslation && (
            <span className="section-list-item-ja-badge" title="日本語訳あり">🇯🇵</span>
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
        />
      ))}
    </>
  );
}
