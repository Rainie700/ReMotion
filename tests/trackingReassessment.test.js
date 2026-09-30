import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Phase D2 — reassessment written back to the F01 7-day tracking cycle.
 * All dates are injected; nothing depends on the real current date.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { createCollection } = await import("../js/data/storageService.js");

const S = T.TRACKING_STATUS;
const DAY3 = "2026-09-30", DAY7 = "2026-10-04", DAY9 = "2026-10-06";

function fiveXSts(userId, { status = "completed", at = [2026, 8, 28, 14, 0], role = null } = {}) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  const done = status === "completed";
  const result = { status, completedReps: done ? 5 : 2, repCount: done ? 5 : 2, totalDurationMs: done ? 8900 : null, measuredAt: new Date(...at).toISOString(), ...(role || {}) };
  functionalAssessmentService.completeSession(s.id, { result });
  return functionalAssessmentService.getById(s.id);
}
function startCycle(userId) {
  const baseline = fiveXSts(userId);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G01", availableMinutes: 20, catalog: exerciseService.listNormalized() });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: userId, result: r, createdBy: userId }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId, baselineSession: baseline, recommendation: rec }).cycle;
  return { baseline, rec, cycle };
}
const reRole = (cycle) => ({ assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: cycle.baselineAssessmentId });
const complete = (args) => trackingCycleService.completeTrackingCycleWithReassessment(args);

// ── 1. eligibility (the 「進行再次評估」 check) ───────────────────────────
{
  const u = "d2-elig";
  const { cycle } = startCycle(u);
  const check = (over = {}) => trackingCycleService.checkReassessmentEligibility({ cycleId: cycle.id, userId: u, todayDateKey: DAY7, ...over });
  assert.deepEqual([check().ok, check().cycle.id], [true, cycle.id], "Day 7, own F01 cycle -> eligible");
  assert.equal(check({ todayDateKey: DAY9 }).ok, true, "overdue is still eligible");
  assert.equal(check({ todayDateKey: DAY3 }).reason, "not_ready_for_reassessment", "Day 1-6 is not a reassessment");
  assert.equal(check({ userId: "someone-else" }).reason, "not_owner");
  assert.equal(check({ cycleId: "no-such-cycle" }).reason, "cycle_not_found");
  const f02 = createCollection("trackingCycles").create({ id: "tc-f02", cycleId: "tc-f02", userId: u, patientId: u, functionalDomain: "F02", assessmentType: "balance", cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: DAY7, reassessmentId: null, createdAt: "2000-01-01T00:00:00.000Z" });
  assert.equal(check({ cycleId: f02.id }).reason, "wrong_cycle_type", "a non-F01 cycle can never take a 5xSTS reassessment");
}

// ── 2. completed reassessment -> linked, cycle completed, baseline kept ──
{
  const u = "d2-ok";
  const { baseline, rec, cycle } = startCycle(u);
  const before = { ...trackingCycleService.getTrackingCycleById(cycle.id) };
  assert.equal(T.getTrackingCycleViewState(before, DAY7).status, S.READY_FOR_REASSESSMENT);
  const re = fiveXSts(u, { at: [2026, 9, 4, 10, 0], role: reRole(cycle) });
  const r = complete({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: DAY7 });
  assert.equal(r.linked, true);
  assert.equal(r.alreadyLinked, false);
  const after = trackingCycleService.getTrackingCycleById(cycle.id);
  assert.equal(after.reassessmentId, re.id);
  assert.equal(after.reassessmentMeasuredAt, re.result.measuredAt);
  assert.equal(after.reassessmentDateKey, DAY7);
  assert.equal(after.cycleStatus, "completed");
  assert.ok(after.completedAt && after.updatedAt >= before.updatedAt);
  for (const k of ["id", "cycleId", "userId", "baselineAssessmentId", "baselineMeasuredAt", "cycleStartDateKey", "plannedReassessmentDateKey", "selectedGoalId", "recommendationId", "createdAt", "completedTrainingDates"]) {
    assert.deepEqual(after[k], before[k], `${k} kept`);
  }
  assert.equal(after.baselineAssessmentId, baseline.id);
  assert.equal(after.recommendationId, rec.id);
  assert.equal(T.getTrackingCycleViewState(after, DAY9).status, S.COMPLETED, "completed because reassessmentId is set");
  assert.equal(T.getTrackingCycleViewState({ ...after, cycleStatus: "training" }, DAY9).status, S.COMPLETED, "view relies on reassessmentId, not the status string");
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null, "a completed cycle is no longer active");
  assert.equal(trackingCycleService.getLatestTrackingCycle(u).id, cycle.id, "but it is the latest cycle for the home card");
  assert.equal(trackingCycleService.listTrackingCycles(u).length, 1, "no second cycle");
  assert.ok(functionalAssessmentService.getById(baseline.id).result.assessmentRole === undefined, "baseline record untouched");
  // the reassessment itself can never become a new baseline
  const tryNew = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: re, recommendation: rec });
  assert.equal(tryNew.error, "reassessment_cannot_be_baseline");
  assert.equal(trackingCycleService.listTrackingCycles(u).length, 1);
}

// ── 3. invalid / incomplete never complete the cycle ─────────────────────
{
  const u = "d2-fail";
  const { cycle } = startCycle(u);
  for (const status of ["invalid", "incomplete"]) {
    const re = fiveXSts(u, { status, at: [2026, 9, 4, 10, 0], role: reRole(cycle) });
    assert.equal(complete({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: DAY7 }).error, "reassessment_not_completed", `${status} is refused`);
    const c = trackingCycleService.getTrackingCycleById(cycle.id);
    assert.equal(c.reassessmentId, null, `${status}: reassessmentId stays null`);
    assert.equal(c.cycleStatus, "training");
    assert.equal(T.getTrackingCycleViewState(c, DAY7).status, S.READY_FOR_REASSESSMENT, `${status}: still ready — can retest`);
  }
  const retry = fiveXSts(u, { at: [2026, 9, 4, 11, 0], role: reRole(cycle) });
  assert.equal(complete({ cycleId: cycle.id, userId: u, reassessment: retry, todayDateKey: DAY7 }).linked, true, "a later valid retest completes it");
}

// ── 4. a normal 5xSTS (no reassessment context) is never linked ──────────
{
  const u = "d2-normal";
  const { cycle } = startCycle(u);
  const normal = fiveXSts(u, { at: [2026, 9, 4, 9, 0] });
  assert.equal(complete({ cycleId: cycle.id, userId: u, reassessment: normal, todayDateKey: DAY7 }).error, "missing_reassessment_context", "Day 7 alone does not make a run a reassessment");
  const wrongCycle = fiveXSts(u, { at: [2026, 9, 4, 9, 30], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: "another-cycle" } });
  assert.equal(complete({ cycleId: cycle.id, userId: u, reassessment: wrongCycle, todayDateKey: DAY7 }).error, "missing_reassessment_context", "context for another cycle is refused");
  const early = fiveXSts(u, { at: [2026, 8, 30, 9, 0], role: reRole(cycle) });
  assert.equal(complete({ cycleId: cycle.id, userId: u, reassessment: early, todayDateKey: DAY3 }).error, "not_ready_for_reassessment", "Day 1-6 never completes the cycle");
  assert.equal(trackingCycleService.getTrackingCycleById(cycle.id).reassessmentId, null);
}

// ── 5. ownership / type / existence ──────────────────────────────────────
{
  const a = "d2-userA", b = "d2-userB";
  const { cycle: cycleB } = startCycle(b);
  const reA = fiveXSts(a, { at: [2026, 9, 4, 10, 0], role: reRole(cycleB) });
  assert.equal(complete({ cycleId: cycleB.id, userId: a, reassessment: reA, todayDateKey: DAY7 }).error, "not_owner", "A cannot complete B's cycle");
  assert.equal(complete({ cycleId: cycleB.id, userId: b, reassessment: reA, todayDateKey: DAY7 }).error, "reassessment_not_owned", "A's assessment cannot complete B's cycle");
  const shoulder = functionalAssessmentService.create({ patientId: b, bodyRegion: "shoulder" }).session;
  functionalAssessmentService.completeSession(shoulder.id, { result: { status: "completed", ...reRole(cycleB) } });
  assert.equal(complete({ cycleId: cycleB.id, userId: b, reassessment: functionalAssessmentService.getById(shoulder.id), todayDateKey: DAY7 }).error, "not_5xsts", "non-5xSTS assessment refused");
  assert.equal(complete({ cycleId: "no-such-cycle", userId: b, reassessment: reA, todayDateKey: DAY7 }).error, "cycle_not_found");
  const baselineB = functionalAssessmentService.getById(cycleB.baselineAssessmentId);
  assert.equal(complete({ cycleId: cycleB.id, userId: b, reassessment: baselineB, todayDateKey: DAY7 }).error, "reassessment_is_baseline");
  assert.equal(trackingCycleService.getTrackingCycleById(cycleB.id).reassessmentId, null, "nothing written by any refused attempt");
}

// ── 6. idempotency ───────────────────────────────────────────────────────
{
  const u = "d2-idem";
  const { cycle } = startCycle(u);
  const re = fiveXSts(u, { at: [2026, 9, 4, 10, 0], role: reRole(cycle) });
  complete({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: DAY7 });
  const once = { ...trackingCycleService.getTrackingCycleById(cycle.id) };
  const again = complete({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: DAY9 });
  assert.deepEqual([again.linked, again.alreadyLinked], [true, true], "same reassessment again -> success, no-op");
  assert.deepEqual(trackingCycleService.getTrackingCycleById(cycle.id), once, "no field rewritten (completedAt / reassessmentDateKey unchanged)");
  const other = fiveXSts(u, { at: [2026, 9, 4, 12, 0], role: reRole(cycle) });
  const r = complete({ cycleId: cycle.id, userId: u, reassessment: other, todayDateKey: DAY7 });
  assert.equal(r.error, "cycle_already_completed", "another reassessment never overwrites");
  assert.equal(trackingCycleService.getTrackingCycleById(cycle.id).reassessmentId, re.id);
  assert.equal(trackingCycleService.checkReassessmentEligibility({ cycleId: cycle.id, userId: u, todayDateKey: DAY9 }).reason, "cycle_already_completed");
}

// ── 7. home card: ready vs completed, no change metrics ──────────────────
{
  const u = "d2-home";
  const { cycle } = startCycle(u);
  const ready = T.buildTrackingCardModel(T.getTrackingCycleViewState(trackingCycleService.getTrackingCycleById(cycle.id), DAY7), { baselineText: "8.9 秒" });
  assert.equal(ready.heading, "可以進行再次評估了");
  const re = fiveXSts(u, { at: [2026, 9, 4, 10, 0], role: reRole(cycle) });
  complete({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: DAY7 });
  const done = trackingCycleService.getActiveTrackingCycle(u) || trackingCycleService.getLatestTrackingCycle(u);
  const model = T.buildTrackingCardModel(T.getTrackingCycleViewState(done, DAY9), { baselineText: "8.9 秒", reassessmentDateKey: done.reassessmentDateKey });
  assert.equal(model.heading, "本週追蹤已完成");
  assert.equal(model.title, "F01 下肢功能");
  // Phase D3 added 「本週訓練完成 N 天」.
  assert.deepEqual(model.facts, [{ label: "本週訓練完成", value: "0 天" }, { label: "初次評估日期", value: "09/28" }, { label: "再次評估日期", value: "10/04" }]);
  assert.deepEqual(model.cta, { label: "查看前後比較", action: "compare" });
  const text = JSON.stringify(model);
  for (const w of ["改善", "提升", "退步", "進步", "維持", "%", "秒差"]) assert.ok(!text.includes(w), `no 「${w}」`);
  const card = appJs.slice(appJs.indexOf("function renderTrackingCycleCard("), appJs.indexOf("function goTrackingWeekTraining("));
  assert.ok(card.includes("cycle.reassessmentDateKey ||"), "home uses the stored reassessment tracking date");
}

// ── 8. app.js wiring ─────────────────────────────────────────────────────
{
  const cta = appJs.slice(appJs.indexOf("function goTrackingReassessment("), appJs.indexOf("function resolveFa5xReassessmentRun("));
  assert.ok(cta.includes("checkReassessmentEligibility(") && cta.indexOf("checkReassessmentEligibility(") < cta.indexOf('state.fa5xReassessmentContext = { mode: "reassessment", cycleId }'), "context is set only after validation");
  assert.ok(cta.includes('mode: "reassessment"') && cta.includes("cycleId"), "context carries mode + cycleId");
  const resolve = appJs.slice(appJs.indexOf("function resolveFa5xReassessmentRun("), appJs.indexOf("function renderTrackingReassessmentBanner("));
  assert.ok(resolve.includes("checkReassessmentEligibility(") && resolve.includes("return null;"), "stale / broken context -> normal run");
  const start = appJs.slice(appJs.indexOf("function goFiveTimesSitToStandDetection()"), appJs.indexOf("function fiveTimesSitToStandDetectionPage()"));
  assert.ok(start.includes("fa5xRunContext = resolveFa5xReassessmentRun(patientId);"), "context captured once, at camera start");
  const fin = appJs.slice(appJs.indexOf("function finalizeFa5xAssessment("), appJs.indexOf("function stopFa5xCamera()"));
  assert.ok(/\.\.\.\(fa5xRunContext \? \{ assessmentRole: REASSESSMENT_ROLE, trackingCycleId: fa5xRunContext\.cycleId, baselineAssessmentId: fa5xRunContext\.baselineAssessmentId \} : \{\}\)/.test(fin), "linkage fields only on a reassessment run");
  assert.ok(fin.includes("if (fa5xRunContext && stored.status === FA5X_RESULT_STATUS.COMPLETED)") && fin.includes("completeTrackingCycleWithReassessment("), "only a completed reassessment run writes back");
  assert.ok(fin.indexOf("functionalAssessmentService.completeSession(") < fin.indexOf("completeTrackingCycleWithReassessment("), "assessment saved first, then linked");
  assert.ok(!/fa5xReassessmentContext[^;\n]*(localStorage|storageService|setItem)/.test(appJs), "reassessment context is in-memory only (refresh drops it)");
  assert.ok(/function goF01LowerLimbHome\(\) \{\s*state\.fa5xReassessmentContext = null;/.test(appJs), "normal F01 entry clears the context");

  const page = appJs.slice(appJs.indexOf("function fiveTimesSitToStandResultPage()"), appJs.indexOf("function fiveTimesSitToStandResultPage()") + 12000);
  assert.ok(page.includes('isReassessment ? "五次坐站｜再次評估結果" : "五次坐站｜評估結果"'), "reassessment title");
  assert.ok(page.includes("F01 7 日追蹤｜再次評估"), "reassessment tag");
  const reNext = page.slice(page.indexOf("const nextHtml = isReassessment"), page.indexOf(": `<div class=\"card fa5x-next-card\">"));
  // Phase D4 — a LINKED reassessment's main CTA is the before/after comparison; an unlinked one still goes home.
  assert.ok(reNext.includes("查看前後比較 →") && reNext.includes("goTrackingComparison('${reCycle.id}')"), "linked reassessment CTA -> comparison");
  assert.ok(reNext.includes("查看追蹤狀態") && reNext.includes("switchTab('home')"), "unlinked reassessment CTA -> home tracking card / secondary 返回首頁");
  assert.ok(!reNext.includes("startRecommendationFromFiveTimesSitToStand") && !reNext.includes("goFiveTimesSitToStandAssessment"), "no new recommendation / retest from a completed reassessment");
  const entry = appJs.slice(appJs.indexOf("function startRecommendationFromFiveTimesSitToStand("), appJs.indexOf("function startRecommendationFromFiveTimesSitToStand(") + 2000);
  assert.ok(entry.includes("session.result.assessmentRole === REASSESSMENT_ROLE"), "a reassessment result never opens Phase C");
  for (const w of ["changeSeconds", "changePercent", "improvement", "改善 %"]) assert.ok(!page.includes(w), `result page has no ${w}`);
}

console.log("Phase D2 reassessment tests passed");
