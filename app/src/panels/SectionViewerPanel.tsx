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

interface SectionViewerPanelProps {
  projectPath: string;
  sectionsDone: boolean;
  statusMessage: {text: string; type: "ok" | "error" | "info"} | null;
}

export default function SectionViewerPanel({
  projectPath,
  sectionsDone,
  statusMessage,
}: SectionViewerPanelProps) {
  const [sectionMap, setSectionMap] = useState<SectionMap | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [sectionText, setSectionText] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMap, setLoadingMap] = useState(false);
  const [useAggregated, setUseAggregated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load section_map.json
  useEffect(() => {
    if (!projectPath || !sectionsDone) {
      setSectionMap(null);
      setSelectedSection(null);
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

  // Load section text when selection changes
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
      .then((content) => setSectionText(content))
      .catch(() => setSectionText("(ファイルの読み込みに失敗しました)"))
      .finally(() => setLoading(false));
  }, [selectedSection, projectPath, sectionMap, useAggregated]);

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
              onSelect={setSelectedSection}
              getChildren={getChildren}
              depth={0}
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

              {/* Text content */}
              {loading ? (
                <div className="viewer-loading">テキストを読み込み中...</div>
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
}

function SectionTreeItem({
  section,
  selected,
  onSelect,
  getChildren,
  depth,
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
        />
      ))}
    </>
  );
}
