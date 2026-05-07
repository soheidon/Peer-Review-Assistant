/** Display labels for LLM slots. Internal keys unchanged for CLI/API compat. */
export const SLOT_LABELS: Record<string, string> = {
  summary: "統括AI",
  reviewer1: "評価AI 1",
  reviewer2: "評価AI 2",
  reviewer3: "評価AI 3",
};

/** Short descriptions explaining each LLM slot's role. */
export const SLOT_DESCRIPTIONS: Record<string, string> = {
  summary: "複数AIの結果を統合し、最終コメント作成に使うAI",
  reviewer1: "構成・表現・方法統計などを評価するAI",
  reviewer2: "評価AI 1とは別視点で確認するAI",
  reviewer3: "必要に応じて追加する第三の評価AI",
};

/** Convert an internal slot name (e.g. "reviewer1") to its display label. */
export function slotDisplayName(name: string): string {
  return SLOT_LABELS[name] || name;
}
