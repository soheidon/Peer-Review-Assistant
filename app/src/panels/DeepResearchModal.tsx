import { useState, useEffect } from "react";

export interface DeepResearchEntry {
  source_name: string;
  executed_at: string;
  text: string;
  notes: string;
}

interface DeepResearchModalProps {
  title: string;
  initialData: DeepResearchEntry;
  onSave: (data: DeepResearchEntry) => void;
  onClose: () => void;
}

const SOURCE_OPTIONS = [
  "ChatGPT Deep Research",
  "Gemini Deep Research",
  "Mistral Le Chat",
  "Perplexity",
  "Claude Research",
  "Grok DeepSearch",
  "Other",
];

export default function DeepResearchModal({
  title,
  initialData,
  onSave,
  onClose,
}: DeepResearchModalProps) {
  const [sourceName, setSourceName] = useState(initialData.source_name || SOURCE_OPTIONS[0]);
  const [executedAt, setExecutedAt] = useState(initialData.executed_at || "");
  const [text, setText] = useState(initialData.text || "");
  const [notes, setNotes] = useState(initialData.notes || "");
  const [customSource, setCustomSource] = useState("");

  useEffect(() => {
    if (initialData.source_name && !SOURCE_OPTIONS.includes(initialData.source_name)) {
      setCustomSource(initialData.source_name);
    }
  }, [initialData.source_name]);

  const effectiveSource = sourceName === "Other" ? customSource : sourceName;

  const handleSave = () => {
    onSave({
      source_name: effectiveSource,
      executed_at: executedAt,
      text: text,
      notes: notes,
    });
  };

  const handleClear = () => {
    setSourceName(SOURCE_OPTIONS[0]);
    setCustomSource("");
    setExecutedAt("");
    setText("");
    setNotes("");
  };

  const overlayStyle: React.CSSProperties = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.4)", zIndex: 1000,
    display: "flex", alignItems: "center", justifyContent: "center",
  };

  const modalStyle: React.CSSProperties = {
    background: "#fff", borderRadius: 8, padding: 20,
    width: 800, maxHeight: "90vh", display: "flex", flexDirection: "column",
    boxShadow: "0 4px 24px rgba(0,0,0,0.25)",
  };

  const charCount = text.length.toLocaleString();

  return (
    <div style={overlayStyle} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={modalStyle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          <button onClick={onClose} style={{ fontSize: 11 }}>閉じる</button>
        </div>

        {/* Source & date row */}
        <div style={{ display: "flex", gap: 12, marginBottom: 8 }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 2 }}>
              外部AI
            </label>
            <select
              value={sourceName}
              onChange={(e) => setSourceName(e.target.value)}
              style={{ width: "100%" }}
            >
              {SOURCE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {sourceName === "Other" && (
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 2 }}>
                外部AI名
              </label>
              <input
                type="text"
                className="path-input"
                value={customSource}
                onChange={(e) => setCustomSource(e.target.value)}
                placeholder="例: 自作プロンプト"
                style={{ width: "100%" }}
              />
            </div>
          )}
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 2 }}>
              実行日
            </label>
            <input
              type="text"
              className="path-input"
              value={executedAt}
              onChange={(e) => setExecutedAt(e.target.value)}
              placeholder="例: 2026-05-12"
              style={{ width: "100%" }}
            />
          </div>
        </div>

        {/* Main textarea */}
        <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginBottom: 2 }}>
          結果テキスト
          <span style={{ fontWeight: 400, color: "#aaa", marginLeft: 8 }}>{charCount} 字</span>
        </label>
        <textarea
          className="text-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Deep Research の結果をここに貼り付けてください..."
          style={{
            width: "100%",
            flex: 1,
            minHeight: 300,
            fontSize: 12,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        {/* Notes */}
        <label style={{ fontSize: 11, fontWeight: 600, color: "#555", display: "block", marginTop: 8, marginBottom: 2 }}>
          メモ
        </label>
        <textarea
          className="text-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="任意のメモ..."
          style={{
            width: "100%",
            height: 50,
            fontSize: 11,
            resize: "vertical",
            fontFamily: "inherit",
          }}
        />

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 10, borderTop: "1px solid #eee" }}>
          <button onClick={handleSave} style={{ fontWeight: 600, flex: 1 }}>
            保存
          </button>
          <button onClick={handleClear} style={{ fontSize: 11 }}>
            クリア
          </button>
          <button onClick={onClose} style={{ fontSize: 11 }}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );
}
