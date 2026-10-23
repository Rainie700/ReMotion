import { firebaseApp, isEmulatorMode } from "../data/firebase.js";

/**
 * Local browser verification: in the emulator mode there is no local stand-in
 * for the model service, so the real model call is disabled outright (before
 * App Check or firebase/ai is even loaded). Callers already fall back on any
 * thrown error (weekly summary -> rule fallback; D5 draft -> model_error).
 */
function refuseInEmulatorMode() {
  if (isEmulatorMode()) throw new Error("llm_disabled_in_local_emulator_mode");
}
import { LLM_SUMMARY_CONFIG } from "../config/llmSummaryConfig.js";
import { buildFallbackSummary } from "./llmSummaryFallback.js";

let appCheckStarted = false;

async function ensureAppCheck() {
  refuseInEmulatorMode();
  if (appCheckStarted || !LLM_SUMMARY_CONFIG.recaptchaEnterpriseSiteKey) return;
  const { initializeAppCheck, ReCaptchaEnterpriseProvider } = await import("firebase/app-check");
  initializeAppCheck(firebaseApp, {
    provider: new ReCaptchaEnterpriseProvider(LLM_SUMMARY_CONFIG.recaptchaEnterpriseSiteKey),
    isTokenAutoRefreshEnabled: true,
  });
  appCheckStarted = true;
}

const SYSTEM_INSTRUCTION = `你是 ReMotion 的週摘要文字整理器。你只能使用提供的 VERIFIED_CONTEXT。
禁止診斷疾病、宣稱療效或改善、預測恢復、建立新數據、建立新動作或改變既有決策。
所有數字、日期、動作名稱與下一步安排必須逐字對應 VERIFIED_CONTEXT。
資料缺少時明確寫尚無資料。只回傳合法 JSON，不要 Markdown。`;

function outputShape(cycleId) {
  return {
    schemaVersion: "1.0",
    cycleId,
    userSummary: { headline: "", functionSummary: "", trainingSummary: "", nextPlanSummary: "" },
    professionalSummary: { functionSummary: "", trainingSummary: "", planSummary: "" },
    attentionNotes: [],
    evidenceFactIds: [],
  };
}

function parseJson(text) {
  const cleaned = String(text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(cleaned);
}

export async function generateWeeklySummaryWithGemini({ verifiedContext }) {
  refuseInEmulatorMode();
  await ensureAppCheck();
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import("firebase/ai");
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: LLM_SUMMARY_CONFIG.model,
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const prompt = `依照下列輸出骨架整理摘要。不得增加骨架外欄位。必須保留已提供的基準時間、訓練天數、正式紀錄數及已確認安排。0 是已知數據，不是缺資料。參考摘要已由程式按事實產生，請保留其事實內容，用自然的繁體中文整理，不能把已存在的資料寫成尚無資料。\nOUTPUT_SHAPE:\n${JSON.stringify(outputShape(verifiedContext.cycleId))}\nFACTUAL_REFERENCE:\n${JSON.stringify(buildFallbackSummary(verifiedContext))}\nVERIFIED_CONTEXT:\n${JSON.stringify(verifiedContext)}`;
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("llm_timeout")), LLM_SUMMARY_CONFIG.timeoutMs));
  const result = await Promise.race([model.generateContent(prompt), timeout]);
  return parseJson(result.response.text());
}

// ── F01 再評估後的 LLM 推薦草稿 (separate task; the weekly summary above is unchanged) ──

const RECOMMENDATION_SYSTEM_INSTRUCTION = `你是 ReMotion 下一階段訓練的推薦草稿產生器。只能使用提供的 JSON。
decision 只能從 allowedDecisions 中選一個；changes 只能使用 options 內的 optionId，最多 maxChanges 個，mustChangeExerciseIds 中的動作必須被更換。
decision 必須與 changes 一致：有 progression 才是 progress，有 regression 才是 regress，否則是 maintain。
每個 reason 必須列出所依據的 factIds；不可診斷、宣稱療效、預測恢復，不可產生組數、次數或秒數。只回傳合法 JSON，不要 Markdown。`;

/**
 * One model call for the D5 next-stage recommendation draft. Returns the parsed
 * JSON only; the caller validates it (js/data/d5LlmRecommendation.js) and never
 * trusts it unchecked. Throws when the feature is disabled.
 */
export async function generateD5RecommendationDraftWithGemini({ payload, config }) {
  if (!config || config.enabled !== true) throw new Error("llm_recommendation_disabled");
  refuseInEmulatorMode();
  await ensureAppCheck();
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import("firebase/ai");
  const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });
  const model = getGenerativeModel(ai, {
    model: config.model,
    systemInstruction: RECOMMENDATION_SYSTEM_INSTRUCTION,
    generationConfig: { responseMimeType: "application/json", temperature: 0.1 },
  });
  const prompt = `依照 outputShape 回傳。\nPAYLOAD:\n${JSON.stringify(payload)}`;
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("llm_timeout")), config.timeoutMs));
  const result = await Promise.race([model.generateContent(prompt), timeout]);
  return parseJson(result.response.text());
}
