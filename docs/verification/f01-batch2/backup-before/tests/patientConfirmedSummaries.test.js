process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 我的數據 — 復健師已確認的週摘要 (patient, view only). Isolated in-memory
 * data: the patient00 showcase seed through the real services (week 1
 * completed, week 2 in progress) plus hand-made summary docs. The real
 * renderPatientConfirmedSummaries() is lifted from app.js and run against the
 * real services; only the cloud load status is stubbed. No Gemini, no cloud.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const SEL = await import("../js/ui/weeklySummaryCycleSelection.js");
const S = await import("../js/dev/patient00Showcase.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalProgressService } = await import("../js/data/functionalProgressService.js");
const { listWeeklySummariesForPatient, getSavedWeeklySummary } = await import("../js/services/llmWeeklySummaryService.js");
const { formatDateKeyMonthDay, toLocalDateKey } = await import("../js/data/trackingCycle.js");
const { functionalAssessmentService } = await import("../js/data/functionalAssessmentService.js");
const DEMO = await import("../js/ui/demoSyntheticLabel.js");

const P00 = { id: "uid-patient00", email: "patient00@gmail.com", role: "patient" };
const OTHER = "uid-other-patient";
createCollection("therapistPatientRelations").create({ id: "p00-rel", therapistId: "t-p00", patientId: P00.id, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
assert.equal(S.seedPatient00ShowcaseData(P00).ok, true);
const [w1, w2] = functionalProgressService.getTrackingTimeline(P00.id, "2026-09-30").weeks;
assert.equal(w1.status, "completed");
assert.equal(w2.status, "in_progress", "week 2 is in progress");

const doc = (cycleId, patientId, status, source, headline, extra = {}) => ({
  id: cycleId, cycleId, patientId, therapistId: "t-p00", relationId: "p00-rel", status, source,
  confirmedAt: status === "confirmed" ? "2026-10-01T03:00:00.000Z" : undefined,
  summary: { schemaVersion: "1.0", cycleId, userSummary: { headline, functionSummary: `${headline}-功能`, trainingSummary: `${headline}-訓練`, nextPlanSummary: `${headline}-計畫` }, professionalSummary: { functionSummary: "PRO", trainingSummary: "PRO", planSummary: "PRO" }, attentionNotes: [], evidenceFactIds: [] },
  ...extra,
});
const summaries = createCollection("llmWeeklySummaries");

// ── render harness: the real functions from app.js ──
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const loadStatus = { llmWeeklySummaries: "loaded", trackingCycles: "loaded" };
const state = { user: P00, patientSummarySelection: null };
let renders = 0;
const api = new Function(
  "state", "storageService", "buildConfirmedSummaryOptions", "resolveConfirmedSummarySelection", "listWeeklySummariesForPatient",
  "functionalProgressService", "getTrackingTodayKey", "formatDateKeyMonthDay", "toLocalDateKey", "getCurrentPatientId", "render",
  "trackingCycleService", "functionalAssessmentService", "describeWeekSynthetic", "isSimulatedConfirmation", "DEMO_SYNTHETIC_TEXT", "SIMULATED_CONFIRMATION_TEXT",
  `${fnSource("summaryText")}\n${fnSource("weekSyntheticNote")}\n${fnSource("renderPatientConfirmedSummaries")}\n${fnSource("selectPatientSummaryCycle")}\nreturn { renderPatientConfirmedSummaries, selectPatientSummaryCycle };`,
)(
  state, { getOptionalCloudLoadStatus: (n) => loadStatus[n] || null }, SEL.buildConfirmedSummaryOptions, SEL.resolveConfirmedSummarySelection, listWeeklySummariesForPatient,
  functionalProgressService, () => "2026-09-30", formatDateKeyMonthDay, toLocalDateKey, () => (state.user && state.user.role === "patient" ? state.user.id : null), () => { renders += 1; },
  trackingCycleService, functionalAssessmentService, DEMO.describeWeekSynthetic, DEMO.isSimulatedConfirmation, DEMO.DEMO_SYNTHETIC_TEXT, DEMO.SIMULATED_CONFIRMATION_TEXT,
);
const view = () => api.renderPatientConfirmedSummaries(P00.id);
const stateOf = (html) => (/data-state="(\w+)"/.exec(html) || [])[1];
const optionValues = (html) => [...html.matchAll(/<option value="([^"]+)"/g)].map((m) => m[1]);

// ── no summaries at all -> empty (not failed) ──
assert.equal(stateOf(view()), "empty");
assert.match(view(), /尚無復健師已確認的週摘要/);

// ── loading / failed are their own states ──
loadStatus.llmWeeklySummaries = "loading";
assert.equal(stateOf(view()), "loading");
loadStatus.llmWeeklySummaries = "failed";
assert.equal(stateOf(view()), "failed", "a failed load is never shown as 'no summaries'");
assert.doesNotMatch(view(), /尚無復健師已確認/);
loadStatus.llmWeeklySummaries = "loaded";
loadStatus.trackingCycles = "failed";
assert.equal(stateOf(view()), "failed", "cycle load failure too");
loadStatus.trackingCycles = "loaded";

// ── drafts, other patients and orphans never show ──
summaries.create(doc(w2.cycleId, P00.id, "draft", "gemini", "W2草稿"));
summaries.create(doc("cycle-of-other", OTHER, "confirmed", "gemini", "別人的摘要"));
summaries.create(doc("cycle-missing", P00.id, "confirmed", "gemini", "孤兒摘要"));
assert.equal(stateOf(view()), "empty", "draft / other patient / orphan -> still nothing to show");
assert.match(view(), /有 1 份已確認摘要找不到對應的追蹤週期/, "orphan counted, never guessed");
assert.doesNotMatch(view(), /W2草稿|別人的摘要|孤兒摘要/);

// ── week 1 confirmed while week 2 is in progress -> visible ──
summaries.create(doc(w1.cycleId, P00.id, "confirmed", "fallback", "W1摘要"));
{
  const html = view();
  assert.equal(stateOf(html), "ready");
  assert.deepEqual(optionValues(html), [w1.cycleId], "only the confirmed, own, matched summary is listed");
  assert.match(html, new RegExp(`第 1 週｜${formatDateKeyMonthDay(w1.startDateKey)}–${formatDateKeyMonthDay(w1.endDateKey)}`));
  assert.match(html, /W1摘要-功能/);
  assert.match(html, /安全備用摘要/);
  assert.match(html, /不是 AI 模型生成的內容/, "fallback is not passed off as model output");
  assert.match(html, /復健師已確認/);
  assert.doesNotMatch(html, /PRO|W2草稿/, "patient version only; no draft");
  assert.doesNotMatch(html, /<button|generateCaseWeeklySummary|confirmCaseWeeklySummary|重新產生/, "view only: no generate / regenerate / confirm action");
  assert.deepEqual([...html.matchAll(/\bon\w+="([^"(]+)/g)].map((m) => m[1]), ["selectPatientSummaryCycle"], "the week selector is the only handler");
}

// ── two confirmed summaries: newest cycle date by default, switchable, content follows cycleId ──
summaries.update(w2.cycleId, { status: "confirmed", source: "gemini", confirmedAt: "2026-10-02T03:00:00.000Z", summary: doc(w2.cycleId, P00.id, "confirmed", "gemini", "W2摘要").summary });
state.patientSummarySelection = null;
{
  const html = view();
  assert.deepEqual(optionValues(html), [w2.cycleId, w1.cycleId], "newest cycle first");
  assert.deepEqual(state.patientSummarySelection, { patientId: P00.id, cycleId: w2.cycleId }, "default = newest");
  assert.match(html, /W2摘要-訓練/);
  assert.match(html, /Gemini 整理/);
  assert.doesNotMatch(html, /W1摘要/);
}
api.selectPatientSummaryCycle(w1.cycleId);
assert.equal(renders, 1);
{
  const html = view();
  assert.match(html, /W1摘要-計畫/);
  assert.doesNotMatch(html, /W2摘要/);
  assert.match(html, /第 1 週｜/);
}
assert.deepEqual(state.patientSummarySelection, { patientId: P00.id, cycleId: w1.cycleId }, "kept across re-renders");
view();
assert.equal(state.patientSummarySelection.cycleId, w1.cycleId);

// ── a selection of another account / a stale cycle is never reused ──
state.patientSummarySelection = { patientId: OTHER, cycleId: w1.cycleId };
view();
assert.deepEqual(state.patientSummarySelection, { patientId: P00.id, cycleId: w2.cycleId });
state.patientSummarySelection = { patientId: P00.id, cycleId: "cycle-of-other" };
view();
assert.equal(state.patientSummarySelection.cycleId, w2.cycleId);

// ── inconsistent doc (inner cycleId differs) is not shown under that week ──
{
  const r = SEL.buildConfirmedSummaryOptions({ patientId: P00.id, summaries: [{ ...doc(w1.cycleId, P00.id, "confirmed", "gemini", "X"), summary: { ...doc(w2.cycleId, P00.id, "confirmed", "gemini", "X").summary } }], weeks: [w1, w2] });
  assert.deepEqual([r.options.length, r.unmatchedCount], [0, 1]);
}

// ── demo data: a synthetic week + a simulated confirmation are labelled on screen, not only in fields ──
{
  assert.doesNotMatch(view(), /展示合成資料|模擬確認/, "real records get no demo label");
  createCollection("trackingCycles").update(w1.cycleId, { demoSynthetic: true });
  const saved = getSavedWeeklySummary(w1.cycleId);
  summaries.update(w1.cycleId, { published: { summary: saved.summary, source: "fallback", model: null, confirmedAt: saved.confirmedAt, confirmedBy: "t-p00", simulatedConfirmation: true } });
  state.patientSummarySelection = { patientId: P00.id, cycleId: w1.cycleId };
  const html = view();
  assert.match(html, /展示合成資料/);
  assert.match(html, /模擬確認（展示用，非真實復健師操作）/);
  assert.doesNotMatch(html, /復健師已確認（/, "a simulated confirmation never reads as a real one");
  summaries.update(w1.cycleId, { published: undefined });
  createCollection("trackingCycles").update(w1.cycleId, { demoSynthetic: undefined });
}

// ── viewing never writes: summaries unchanged, nothing generated / confirmed ──
assert.equal(getSavedWeeklySummary(w1.cycleId).status, "confirmed");
assert.equal(getSavedWeeklySummary(w1.cycleId).summary.userSummary.headline, "W1摘要", "stored content untouched");
assert.equal(trackingCycleService.listTrackingCycles(P00.id).length, 2);

// ── app.js wiring ──
assert.ok(!/getActiveTrackingCycle|getLatestTrackingCycle/.test(fnSource("patientDataOverviewPage")), "data page no longer reads the active / latest cycle");
assert.match(fnSource("patientDataOverviewPage"), /renderPatientConfirmedSummaries\(patientId\)/);
assert.doesNotMatch(fnSource("renderPatientConfirmedSummaries"), /createWeeklySummary|confirmWeeklySummary|generateWeeklySummaryWithGemini/);
assert.match(fnSource("setSession"), /state\.patientSummarySelection = null/, "account switch resets the choice");
assert.match(appJs, /window\.selectPatientSummaryCycle = selectPatientSummaryCycle/);

console.log("patientConfirmedSummaries: all assertions passed");
