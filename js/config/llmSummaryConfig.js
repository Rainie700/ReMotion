const viteEnv = (typeof import.meta !== "undefined" && import.meta.env) || {};

export const LLM_SUMMARY_CONFIG = Object.freeze({
  model: "gemini-3.5-flash-lite",
  promptVersion: "weekly-summary-v1",
  schemaVersion: "1.0",
  timeoutMs: 20000,
  recaptchaEnterpriseSiteKey: viteEnv.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY || "",
});
