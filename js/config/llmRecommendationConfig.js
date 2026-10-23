const viteEnv = (typeof import.meta !== "undefined" && import.meta.env) || {};

/**
 * F01 再評估後的 LLM 推薦草稿 — prototype settings. The real model call is OFF
 * unless VITE_D5_LLM_RECOMMENDATION_ENABLED is exactly "true" at build time.
 * Separate from the weekly summary (llmSummaryConfig.js): different task,
 * prompt and version, so the summary behaviour is untouched.
 */
export const LLM_RECOMMENDATION_CONFIG = Object.freeze({
  enabled: viteEnv.VITE_D5_LLM_RECOMMENDATION_ENABLED === "true",
  provider: "gemini",
  model: "gemini-3.5-flash-lite",
  promptVersion: "d5-recommendation-prompt-0.1",
  timeoutMs: 20000,
});
