import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Phase D1 — F01 7-day Tracking Cycle (dates, status, creation, idempotency,
 * home card). No test depends on the real current date: every "today" is an
 * injected date key.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const pureSrc = readFileSync(join(root, "js/data/trackingCycle.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");

const { TRACKING_STATUS: S } = T;

/** A stored 5xSTS session measured at local time (y, m, d, hh, mm). */
function baseline(userId, { status = "completed", at = [2026, 8, 28, 14, 0], totalDurationMs = 8900 } = {}) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  const measuredAt = new Date(...at).toISOString();
  const result = { status, completedReps: status === "completed" ? 5 : 2, repCount: status === "completed" ? 5 : 2, totalDurationMs: status === "completed" ? totalDurationMs : null, measuredAt };
  functionalAssessmentService.completeSession(s.id, { result });
  return functionalAssessmentService.getById(s.id);
}
/** A saved Phase C recommendation for that baseline (engine + service, unchanged). */
function recommend(userId, session, goalId = "G01") {
  const result = generateF01GoalRecommendation({
    assessment: { status: session.result.status || "completed", sessionId: session.id, assessmentType: "five_times_sit_to_stand" },
    selectedGoalId: goalId,
    availableMinutes: 20,
    catalog: exerciseService.listNormalized(),
  });
  return recommendationService.createF01GoalRecommendation({ patientId: userId, result, createdBy: userId }).recommendation;
}

// ── 1. calendar-date helpers ─────────────────────────────────────────────
{
  assert.equal(T.toLocalDateKey(new Date(2026, 8, 28, 0, 5)), "2026-09-28", "just after local midnight is still that local day");
  assert.equal(T.toLocalDateKey(new Date(2026, 8, 28, 23, 55)), "2026-09-28", "just before local midnight is still that local day");
  assert.equal(T.toLocalDateKey("not a date"), null);
  assert.equal(T.addDaysToDateKey("2026-09-28", 6), "2026-10-04");
  assert.equal(T.addDaysToDateKey("2026-12-29", 6), "2027-01-04", "year boundary");
  assert.equal(T.addDaysToDateKey("2028-02-26", 6), "2028-03-03", "leap year");
  assert.equal(T.diffDateKeys("2026-03-07", "2026-03-09"), 2, "US DST weekend is still 2 calendar days");
  assert.equal(T.diffDateKeys("2026-10-24", "2026-10-26"), 2, "EU DST weekend is still 2 calendar days");
  assert.equal(T.getPlannedReassessmentDateKey("2026-09-28"), "2026-10-04");
  assert.equal(T.isDateKey("2026-02-30"), false);
  assert.equal(T.formatDateKeyMonthDay("2026-10-04"), "10/04");
  assert.ok(!/new Date\(\)|Date\.now|86400000\s*\*\s*6|6\s*\*\s*24\s*\*\s*60/.test(pureSrc), "no clock reads and no elapsed-time Day 7 rule in the pure module");
}

// ── 2. Day 1..7 and status (cycleStartDateKey = 2026-09-28) ──────────────
{
  const cycle = { cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", reassessmentId: null };
  const at = (k) => T.getTrackingCycleViewState(cycle, k);
  assert.deepEqual([at("2026-09-28").cycleDay, at("2026-09-29").cycleDay, at("2026-10-03").cycleDay], [1, 2, 6]);
  for (const k of ["2026-09-28", "2026-09-29", "2026-10-03"]) assert.equal(at(k).status, S.TRAINING, `${k} training`);
  for (const k of ["2026-10-04", "2026-10-05", "2026-10-20"]) {
    assert.equal(at(k).status, S.READY_FOR_REASSESSMENT, `${k} ready`);
    assert.equal(at(k).cycleDay, null, `${k}: no "Day 8 / 7"`);
  }
  assert.equal(at("2026-10-05").daysPastPlanned, 1);
  assert.equal(at("2026-09-27").cycleDay, 1, "device clock before the start still reads Day 1");
  assert.equal(T.getTrackingCycleViewState({ ...cycle, reassessmentId: "fa-2" }, "2026-10-01").status, S.COMPLETED, "only a reassessmentId completes a cycle");
  assert.equal(T.getTrackingCycleViewState(null, "2026-10-01").status, S.NONE);
  const model = T.buildTrackingCardModel(at("2026-10-20"), { baselineText: "8.9 秒" });
  assert.ok(!/8 \/ 7|\d+ \/ 7 天/.test(JSON.stringify(model)), "ready card never shows a day count");
}

// ── 3. creation: only a completed baseline + its saved recommendation ────
{
  const u = "user-create";
  const bad = baseline(u, { status: "invalid" });
  assert.ok(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: bad, recommendation: { id: "r", kind: "f01_goal", patientId: u, sourceAssessmentId: bad.id } }).error, "invalid -> no cycle");
  const inc = baseline(u, { status: "incomplete" });
  assert.ok(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: inc, recommendation: { id: "r", kind: "f01_goal", patientId: u, sourceAssessmentId: inc.id } }).error, "incomplete -> no cycle");
  const ok = baseline(u);
  assert.equal(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: ok, recommendation: null }).error, "missing_recommendation", "no recommendation -> no cycle");
  const otherRec = recommend(u, baseline(u, { at: [2026, 8, 20, 9, 0] }));
  assert.equal(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: ok, recommendation: otherRec }).error, "recommendation_not_for_baseline");
  assert.equal(trackingCycleService.listTrackingCycles(u).length, 0, "nothing created by any rejected attempt");

  const rec = recommend(u, ok, "G01");
  const r = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: ok, recommendation: rec });
  assert.equal(r.created, true);
  const c = r.cycle;
  assert.equal(c.cycleId, c.id);
  assert.equal(c.userId, u);
  assert.equal(c.functionalDomain, "F01");
  assert.equal(c.assessmentType, "5xSTS");
  assert.equal(c.baselineAssessmentId, ok.id);
  assert.equal(c.baselineMeasuredAt, ok.result.measuredAt);
  assert.equal(c.cycleStartDateKey, "2026-09-28", "Day 1 = local date of the baseline measurement, not of the recommendation");
  assert.equal(c.plannedReassessmentDateKey, "2026-10-04");
  assert.equal(c.selectedGoalId, "G01");
  assert.equal(c.recommendationId, rec.id);
  assert.equal(c.cycleStatus, "training");
  assert.deepEqual(c.completedTrainingDates, []);
  assert.equal(c.reassessmentId, null);
  assert.ok(c.createdAt && c.updatedAt);
  assert.ok(!("cycleDay" in c) && !Object.keys(c).some((k) => /day/i.test(k) && !/DateKey|Dates/.test(k)), "cycleDay is never stored");
}

// ── 4. idempotency + recommendation update ───────────────────────────────
{
  const u = "user-idem";
  const b = baseline(u, { at: [2026, 8, 28, 23, 50] });
  const rec1 = recommend(u, b, "G01");
  const first = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec1 }).cycle;
  const again = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec1 });
  assert.equal(again.created, false);
  assert.equal(again.cycle.id, first.id);
  const rec2 = recommend(u, b, "G05");
  const updated = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec2 }).cycle;
  assert.equal(updated.id, first.id, "same cycle");
  assert.equal(updated.baselineAssessmentId, first.baselineAssessmentId);
  assert.equal(updated.cycleStartDateKey, first.cycleStartDateKey);
  assert.equal(updated.cycleStartDateKey, "2026-09-28", "23:50 local baseline stays on its own local date");
  assert.equal(updated.recommendationId, rec2.id, "recommendation link updated");
  assert.equal(updated.selectedGoalId, "G05");
  for (let i = 0; i < 5; i += 1) trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: recommend(u, b, "G02") });
  assert.equal(trackingCycleService.listTrackingCycles(u).length, 1, "repeated generate -> still exactly one cycle");

  // A new 5xSTS (e.g. the reassessment) while this cycle is active never starts a second cycle.
  const linkBefore = trackingCycleService.getTrackingCycleById(first.id);
  const later = baseline(u, { at: [2026, 9, 4, 10, 0] });
  const r = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: later, recommendation: recommend(u, later, "G01") });
  assert.equal(r.created, false);
  assert.equal(r.reason, "another_active_cycle");
  assert.equal(r.cycle.id, first.id);
  const linkAfter = trackingCycleService.getTrackingCycleById(first.id);
  assert.deepEqual([linkAfter.recommendationId, linkAfter.selectedGoalId, linkAfter.baselineAssessmentId, linkAfter.updatedAt],
    [linkBefore.recommendationId, linkBefore.selectedGoalId, linkBefore.baselineAssessmentId, linkBefore.updatedAt], "another baseline never re-links the active cycle");
  assert.equal(trackingCycleService.listTrackingCycles(u).length, 1);
  assert.equal(trackingCycleService.getActiveTrackingCycle(u).id, first.id);
  assert.equal(trackingCycleService.getActiveTrackingCycle("nobody"), null);
}

// ── 5. home card model: four states ───────────────────────────────────────
{
  const cycle = { cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", reassessmentId: null };
  const none = T.buildTrackingCardModel(T.getTrackingCycleViewState(null, "2026-09-28"));
  assert.equal(none.title, "尚未開始功能追蹤");
  assert.equal(none.body, "完成一次功能評估後，可建立個人基準並開始後續訓練追蹤。");
  assert.deepEqual(none.cta, { label: "開始功能評估", action: "start_assessment" });
  assert.equal(none.facts.length, 0, "no fake baseline / Day 1");

  const day3 = T.buildTrackingCardModel(T.getTrackingCycleViewState(cycle, "2026-09-30"), { baselineText: "8.9 秒" });
  assert.equal(day3.heading, "本週功能追蹤");
  assert.equal(day3.title, "F01 下肢功能｜第 3 / 7 天");
  // Phase D3 added 「本週已完成 N 天」 (completed training days, separate from the calendar day).
  assert.deepEqual(day3.facts, [{ label: "初次評估", value: "8.9 秒" }, { label: "本週已完成", value: "0 天" }, { label: "預計再次評估", value: "10/04" }]);
  assert.deepEqual(day3.calendarDots, [true, true, true, false, false, false, false], "dots = date progress");
  assert.equal(day3.cta.action, "open_recommendation");

  const ready = T.buildTrackingCardModel(T.getTrackingCycleViewState(cycle, "2026-10-04"), { baselineText: "8.9 秒" });
  assert.equal(ready.heading, "可以進行再次評估了");
  assert.equal(ready.title, "F01 下肢功能｜7 日追蹤");
  assert.equal(ready.body, "重新進行五次坐站測試，之後可比較這段期間的功能變化。");
  assert.deepEqual(ready.facts.map((f) => f.label), ["初次評估", "本週已完成", "初次評估日期", "預計再次評估"]);
  assert.deepEqual(ready.cta, { label: "進行再次評估", action: "reassess" });

  const done = T.buildTrackingCardModel(T.getTrackingCycleViewState({ ...cycle, reassessmentId: "fa-2" }, "2026-10-06"), { reassessmentDateKey: "2026-10-05" });
  assert.equal(done.heading, "本週追蹤已完成");
  assert.deepEqual(done.facts, [{ label: "本週訓練完成", value: "0 天" }, { label: "初次評估日期", value: "09/28" }, { label: "再次評估日期", value: "10/05" }]);
  assert.deepEqual(done.cta, { label: "查看前後比較", action: "compare" });

  const all = JSON.stringify([none, day3, ready, done]);
  for (const w of ["已完成 3 天", "今日完成", "提升", "改善", "進步", "%"]) assert.ok(!all.includes(w), `no 「${w}」 (no fake completion / improvement)`);
}

// ── 6. app.js wiring ──────────────────────────────────────────────────────
{
  const home = appJs.slice(appJs.indexOf("patientHome = function()"), appJs.indexOf("patientHome = function()") + 30000);
  const ret = home.slice(home.indexOf("return `<div class=\"top-profile-container\">"));
  // Homepage redesign — tracking is no longer a separate card above everything:
  // the featured hero itself switches to tracking mode, below the greeting.
  assert.ok(!ret.includes("${renderTrackingCycleCard(patientId)}"), "no standalone tracking card in the home template");
  assert.ok(home.includes("const functionalAssessmentSectionHtml = renderTrackingCycleCard(patientId) ||"), "the hero shows tracking mode when a cycle exists");
  assert.ok(ret.indexOf("${companionBannerHtml}") < ret.indexOf("${functionalAssessmentSectionHtml}"), "greeting stays first");
  assert.ok(ret.includes("${myScheduleCardHtml}") && ret.includes("${functionalAssessmentSectionHtml}"), "older home cards (incl. legacy 今日建議 entry) are kept below");

  const gen = appJs.slice(appJs.indexOf("function generateF01RecommendationFromSetup("), appJs.indexOf("function goF01RecommendationResult("));
  const saveAt = gen.indexOf("recommendationService.createF01GoalRecommendation(");
  const cycleAt = gen.indexOf("trackingCycleService.createOrGetTrackingCycle(");
  assert.ok(saveAt > 0 && cycleAt > saveAt, "cycle is created only after the recommendation is saved");
  assert.ok(gen.indexOf('if (result.status === "blocked")') < cycleAt, "blocked (incomplete / invalid) returns before any cycle work");

  const card = appJs.slice(appJs.indexOf("function renderTrackingCycleCard("), appJs.indexOf("function goTrackingWeekTraining("));
  assert.ok(card.includes("functionalAssessmentService.getById(cycle.baselineAssessmentId)") && card.includes("fmtFa5xSec(result.totalDurationMs)"), "baseline time from the stored result, result-page formatter");
  assert.ok(card.includes("getTrackingTodayKey()"));
  const week = appJs.slice(appJs.indexOf("function goTrackingWeekTraining("), appJs.indexOf("function goTrackingReassessment("));
  assert.ok(week.includes("goF01RecommendationResult(cycle.recommendationId)") && !week.includes("generateF01GoalRecommendation("), "查看本週訓練 opens the cycle's saved recommendation, never regenerates");
  const re = appJs.slice(appJs.indexOf("function goTrackingReassessment("), appJs.indexOf("function renderTrackingReassessmentBanner("));
  assert.ok(re.includes('mode: "reassessment"') && re.includes("goFiveTimesSitToStandAssessment()"), "Day 7 CTA -> existing 5xSTS entry with a reassessment context");
  const today = appJs.slice(appJs.indexOf("function getTrackingTodayKey("), appJs.indexOf("const TRACKING_CTA_FN"));
  assert.ok(today.includes('get("trackingToday")') && today.includes("isDateKey(override)"), "dev-only ?trackingToday= override, validated");
}

// ── 7. storage: optional cloud collection never blocks login ─────────────
{
  const storage = readFileSync(join(root, "js/data/storageService.js"), "utf8");
  assert.ok(/OPTIONAL_CLOUD_COLLECTIONS = \["trackingCycles"\]/.test(storage));
  const hydrate = storage.slice(storage.indexOf("async hydrateCloudForUser("));
  assert.ok(/for \(const name of OPTIONAL_CLOUD_COLLECTIONS\) \{\s*try \{/.test(hydrate) && hydrate.includes("mergeById([readRaw(collectionKey(name), []), cloud])"), "optional collection: try/catch + merge, never replaces local on failure");
  assert.ok(readFileSync(join(root, "firestore.rules"), "utf8").includes("'trackingCycles'"), "rules file lists trackingCycles (needs deploy)");
}

console.log("Phase D1 tracking cycle tests passed");
