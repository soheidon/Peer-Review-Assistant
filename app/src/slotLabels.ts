/** Display labels for LLM slots. Internal keys unchanged for CLI/API compat. */
export const SLOT_LABELS: Record<string, string> = {
  summary: "統括AI",
  reviewer1: "評価AI 1",
  reviewer2: "評価AI 2",
  reviewer3: "評価AI 3",
};

/** Short descriptions explaining each LLM slot's role. */
export const SLOT_DESCRIPTIONS: Record<string, string> = {
  summary: "最終コメント統合、ジャーナル情報取得、文献形式チェック、引用趣旨チェック",
  reviewer1: "方法・統計、構成、重要な査読判断",
  reviewer2: "表現チェック、文献再パース、検索クエリ生成",
  reviewer3: "必要に応じて追加する第三の評価AI",
};

/** Convert an internal slot name (e.g. "reviewer1") to its display label. */
export function slotDisplayName(name: string): string {
  return SLOT_LABELS[name] || name;
}
