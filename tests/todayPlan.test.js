process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Cross-Module Integration I-4 — Today Plan Aggregator (復健師安排 → ReMotion
 * 建議 → 自主練習), plan-specific completion, date limits, daily_complete,
 * naming, start contexts, plus the final cross-module integration check.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const P = await import("../js/data/todayPlanAggregator.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { scheduleService } = await import("../js/data/scheduleService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { gamificationEngine: G } = await import("../js/data/gamificationEngine.js");
const { trainingEventService } = await import("../js/data/trainingEventService.js");
const { f01AdventureService } = await import("../js/data/f01AdventureProgress.js");
const { createCollection } = await import("../js/data/storageService.js");

const catalog = exerciseService.listNormalized();
const D1 = "2026-09-28", D2 = "2026-09-29", D4 = "2026-10-01", D7 = "2026-10-04";
const fnBody = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `app.js has ${name}`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
function fiveXSts(user, { ms = 9000, at = [2026, 8, 28, 9, 0], role = null } = {}) {
  const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
  return functionalAssessmentService.getById(s.id);
}
function startCycle(user) {
  const baseline = fiveXSts(user);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: user, result: r, createdBy: user }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: baseline, recommendation: rec }).cycle;
  return { rec, cycle };
}
const at = (dateKey, hour = 10) => { const [y, m, d] = dateKey.split("-").map(Number); return new Date(y, m - 1, d, hour).toISOString(); };
const done = { totalReps: 10, targetReps: 10, summary: { totalReps: 10, targetReps: 10, qualityValidReps: 10 } };
function trainF01(u, cycle, exerciseId, dateKey, id) {
  const r = analysisService.create({ id, patientId: u, exerciseId, source: "self_practice", completedAt: at(dateKey), createdAt: at(dateKey), score: 80, ...done },
    { executionContext: { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: cycle.id, recommendationId: cycle.recommendationId, exerciseId, userId: u } });
  return trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: u, exerciseId, analysisRecord: r });
}
const plan = (u, opts) => P.todayPlanService.getTodayPlan(u, opts);

// §35 aggregator: order, three sources, no merge / no dedup, counts
const u = "tp-main";
const { rec, cycle } = startCycle(u);
const recIds = [...new Set(rec.items.map((it) => it.exerciseId))];
const shared = recIds[0];
const other = catalog.find((c) => !recIds.includes(c.id)).id;
const sch = scheduleService.create({ id: "tp-sch", patientId: u, date: D2, status: "pending", createdAt: at(D2, 8), exercises: [
  { exerciseId: shared, exerciseName: "shared", sets: 1, repetitions: 10, status: "pending" },
  { exerciseId: other, exerciseName: "other", sets: 1, repetitions: 10, status: "pending" },
] });
const legacy = { id: "tp-legacy", patientId: u, recommendationType: "self_practice", createdAt: at(D2, 7), items: [{ exerciseId: shared }, { exerciseId: other }] };
{
  const p = plan(u, { todayKey: D2, legacyRecommendation: legacy });
  assert.equal(p.isToday, true);
  assert.deepEqual(p.therapist.items.map((i) => i.exerciseId), [shared, other], "復健師安排 = the day's schedule, in order");
  assert.equal(p.remotion.primary.kind, "f01_cycle", "active F01 cycle is the primary ReMotion 建議");
  assert.deepEqual(p.remotion.primary.items.map((i) => i.exerciseId), recIds);
  assert.equal(p.remotion.additional.length, 1, "the older daily plan is secondary when F01 exists");
  assert.equal(p.remotion.additional[0].kind, "legacy_remotion_recommendation");
  assert.ok(p.therapist.items.some((i) => i.exerciseId === shared) && p.remotion.primary.items.some((i) => i.exerciseId === shared), "same exercise in two plans = two tasks (no dedup)");
  assert.equal(new Set([...p.therapist.items, ...p.remotion.primary.items].map((i) => i.key)).size, 2 + recIds.length, "distinct task keys");
  assert.deepEqual(p.summary, { therapistCount: 2, therapistCompleted: 0, remotionCount: recIds.length, remotionCompleted: 0, totalAssignedCount: 2 + recIds.length, completedAssignedCount: 0, allAssignedComplete: false });
  assert.equal(p.selfAvailable, true, "自主練習 always available, never counted");
  assert.ok(p.therapist.items.every((i) => i.sourceLabel === "復健師安排") && p.remotion.primary.items.every((i) => i.sourceLabel === "ReMotion 建議"));
  // without F01, the older plan is primary
  const noF01 = P.buildTodayPlan({ patientId: u, todayKey: D2, legacyRecommendation: legacy });
  assert.equal(noF01.remotion.primary.kind, "legacy_remotion_recommendation");
  assert.equal(noF01.remotion.additional.length, 0);
  assert.equal(noF01.summary.remotionCount, 2);
}

// §36 completion isolation: each plan is completed only by its own linkage
{
  analysisService.create({ id: "tp-ther", patientId: u, scheduleId: sch.id, exerciseId: shared, source: "assigned", completedAt: at(D2, 9), createdAt: at(D2, 9), ...done });
  scheduleService.updateExerciseAt(sch.id, 0, { status: "completed", completedAt: at(D2, 9), analysisRecordId: "tp-ther" });
  analysisService.create({ id: "tp-self", patientId: u, exerciseId: shared, source: "self_practice", completedAt: at(D2, 9), createdAt: at(D2, 9), ...done });
  let p = plan(u, { todayKey: D2, legacyRecommendation: legacy });
  assert.equal(p.therapist.items[0].completed, true, "therapist item done by the schedule status");
  assert.equal(p.remotion.primary.items.find((i) => i.exerciseId === shared).completed, false, "a therapist / self record never completes the F01 item");
  assert.ok(p.remotion.additional[0].items.every((i) => !i.completed), "nor the older plan (explicit self record)");
  assert.equal(p.summary.completedAssignedCount, 1);

  trainF01(u, cycle, shared, D2, "tp-f01");
  p = plan(u, { todayKey: D2, legacyRecommendation: legacy });
  assert.equal(p.remotion.primary.items.find((i) => i.exerciseId === shared).completed, true, "F01 item done by dailyTrainingProgress");
  assert.equal(p.therapist.items[1].completed, false, "the F01 record does not complete the therapist plan");
  assert.ok(p.remotion.additional[0].items.every((i) => !i.completed), "the F01 record does not complete the older plan");

  analysisService.create({ id: "tp-legacy-run", patientId: u, exerciseId: other, source: "self_practice", completedAt: at(D2, 11), createdAt: at(D2, 11), ...done },
    { executionContext: { sourceType: "remotion", sourceSubtype: "legacy_remotion_recommendation", recommendationId: legacy.id, exerciseId: other, userId: u } });
  p = plan(u, { todayKey: D2, legacyRecommendation: legacy });
  assert.equal(p.remotion.additional[0].items.find((i) => i.exerciseId === other).completed, true, "older plan item done by its linked record");
  assert.equal(p.therapist.items[1].completed, false, "…which does not complete the therapist item of the same exercise");
  assert.equal(p.summary.completedAssignedCount, 2, "additional plan never enters X / Y");
  // incomplete linked record does not count
  analysisService.create({ id: "tp-legacy-part", patientId: u, exerciseId: shared, source: "self_practice", completedAt: at(D2, 12), createdAt: at(D2, 12), totalReps: 3, targetReps: 10, summary: { totalReps: 3, targetReps: 10 } },
    { executionContext: { sourceType: "remotion", sourceSubtype: "legacy_remotion_recommendation", recommendationId: legacy.id, exerciseId: shared, userId: u } });
  assert.equal(plan(u, { todayKey: D2, legacyRecommendation: legacy }).remotion.additional[0].items.find((i) => i.exerciseId === shared).completed, false, "a stopped-early run is not done");
  // pre-I-1 record (no source fields) keeps the old same-day rule, only for the older plan
  const raw = createCollection("analysisRecords");
  const pre = "tp-pre";
  raw.create({ id: "tp-pre-rec", patientId: pre, exerciseId: shared, source: "self_practice", completedAt: at(D2, 9), createdAt: at(D2, 9), ...done });
  const preLegacy = { ...legacy, id: "tp-pre-legacy", patientId: pre };
  const events = trainingEventService.listTrainingEvents(pre);
  assert.equal(events[0].isLegacy, true);
  assert.deepEqual([...P.legacyRecommendationDoneIds(preLegacy, events, D2)], [shared], "legacy compatibility: nothing shown as done before is re-opened");
  assert.deepEqual([...P.legacyRecommendationDoneIds(preLegacy, events, D1)], [], "…on its own local day only");
}

// §37 dates: 今日 only for the real today; past / future read-only; F01 Day 1-6 only
{
  const past = plan(u, { todayKey: D2, dateKey: D1, legacyRecommendation: legacy });
  assert.equal(past.isPast, true);
  assert.ok([...past.therapist.items, ...(past.remotion.primary ? past.remotion.primary.items : [])].every((i) => !i.canStart), "past day: nothing startable");
  assert.equal(past.remotion.additional.length, 0, "the older daily plan exists only on the real today");
  const future = plan(u, { todayKey: D2, dateKey: D4 });
  assert.equal(future.isFuture, true);
  assert.deepEqual(future.remotion.primary.items.map((i) => [i.completed, i.canStart]), recIds.map(() => [false, false]), "future training day: preview only");
  const before = plan(u, { todayKey: D2, dateKey: "2026-09-27" });
  assert.equal(before.remotion.primary, null, "before the cycle: no F01 tasks");
  assert.equal(before.remotion.notice, null);
  const day7 = plan(u, { todayKey: D7 });
  assert.equal(day7.remotion.primary, null, "Day 7: no training tasks");
  assert.deepEqual(day7.remotion.notice, { code: "reassessment_due", cycleId: cycle.id });
  const viewingDay7 = plan(u, { todayKey: D2, dateKey: D7 });
  assert.equal(viewingDay7.remotion.notice, null, "notices only for the real today");
  const today = plan(u, { todayKey: D2 });
  assert.ok(today.remotion.primary.items.filter((i) => !i.completed).every((i) => i.canStart), "real today: open items startable");
  const tb = fnBody("getTodayPlanForPatient");
  assert.ok(tb.includes("todayStr()") && !tb.includes("getTrackingTodayKey"), "the plan is keyed on the real local date, never ?trackingToday=");
}

// §38 professional review / finished cycle: no phantom tasks
{
  const re = fiveXSts(u, { ms: 8200, at: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: cycle.baselineAssessmentId } });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: D7 });
  const p = plan(u, { todayKey: "2026-10-05" });
  assert.equal(p.remotion.primary, null);
  assert.deepEqual(p.remotion.notice, { code: "next_cycle_pending", cycleId: cycle.id });
  assert.equal(p.summary.totalAssignedCount, 0, "a finished / pending-review cycle never creates tasks");
}

// §39 ownership
{
  const foreign = P.buildTodayPlan({ patientId: "someone", todayKey: D2, schedule: sch, activeCycle: { ...cycle, reassessmentId: null }, cycleRecommendation: rec, legacyRecommendation: legacy });
  assert.equal(foreign.summary.totalAssignedCount, 0, "foreign schedule / cycle / plan never leak into a patient's day");
}

// §40 daily_complete = every assigned task of one day; self never unlocks it
{
  const ach = (id) => Object.fromEntries(G.getAchievements(id).map((a) => [a.id, a])).daily_complete.unlocked;
  const s = "dc-self";
  for (let i = 0; i < 6; i += 1) analysisService.create({ id: `dc-s${i}`, patientId: s, exerciseId: "F01-04", source: "self_practice", completedAt: at(D2, 9 + i), createdAt: at(D2, 9 + i), ...done });
  assert.equal(ach(s), false, "self-practice only never unlocks 今日達成");

  const f = "dc-f01";
  const fc = startCycle(f);
  const fIds = [...new Set(fc.rec.items.map((it) => it.exerciseId))];
  fIds.slice(0, -1).forEach((id, i) => trainF01(f, fc.cycle, id, D2, `dc-f${i}`));
  assert.equal(ach(f), false, "part of the F01 day is not enough");
  trainF01(f, fc.cycle, fIds[fIds.length - 1], D2, "dc-f-last");
  assert.equal(ach(f), true, "every F01 task of the day (no therapist plan that day) -> unlocked");

  const m = "dc-mixed";
  const mc = startCycle(m);
  const mSch = scheduleService.create({ id: "dc-msch", patientId: m, date: D2, status: "pending", createdAt: at(D2, 8), exercises: [{ exerciseId: "F01-04", exerciseName: "x", sets: 1, repetitions: 10, status: "pending" }] });
  [...new Set(mc.rec.items.map((it) => it.exerciseId))].forEach((id, i) => trainF01(m, mc.cycle, id, D2, `dc-m${i}`));
  assert.equal(ach(m), false, "F01 done but the same day's therapist plan open -> not unlocked");
  scheduleService.updateExerciseAt(mSch.id, 0, { status: "completed" });
  assert.equal(ach(m), true, "both plans done -> unlocked");

  const t = "dc-ther";
  scheduleService.create({ id: "dc-tsch", patientId: t, date: D1, status: "completed", exercises: [{ exerciseId: "F01-04", status: "completed" }] });
  assert.equal(ach(t), true, "legacy compatibility: a completed therapist schedule still qualifies");
  assert.equal(P.hasCompletedAllAssignedInADay({ schedules: [{ date: D2, status: "completed", exercises: [] }] }), false, "an empty schedule is not a completed day");
  const desc = G.getAchievements(t).find((a) => a.id === "daily_complete").desc;
  assert.ok(desc.includes("復健師安排") && desc.includes("ReMotion 建議"));
}

// §41 Training Tab IA, start contexts, Home, Adventure CTA (app wiring)
{
  const page = fnBody("todaySchedulePage");
  assert.ok(page.includes("getTodayPlanForPatient(patientId, viewDate)"), "Training Tab reads the aggregator");
  // (rendered order / X/Y / hints are exercised in tests/trainingTabLayout.test.js)
  const iT = page.indexOf('todayGroupHead("復健師安排"'), iR = page.indexOf('todayGroupHead("ReMotion 建議"'), iS = page.indexOf('"自主練習"'), iH = page.indexOf('"訓練紀錄"');
  assert.ok(iT > 0 && iT < iR && iR < iS && iS < iH, "IA order: 復健師安排 → ReMotion 建議 → 自主練習 → 訓練紀錄");
  assert.ok(page.includes('plan.isToday ? "今日復健"'), "今日 only for the real today");
  assert.ok(page.includes("summary.completedAssignedCount} / ${summary.totalAssignedCount}"), "X / Y");
  assert.ok(page.includes("其他 ReMotion 建議"), "additional plans shown separately");
  assert.ok(page.includes("請優先依安排內容進行"), "therapist-first hint");
  assert.ok(!page.includes("AI 今日建議"));
  const go = fnBody("goTodayPlanItem");
  assert.ok(/state\.f01RecommendationId = cycle\.recommendationId;\s*return goF01RecommendationExerciseDetail\(exerciseId, true\)/.test(go), "F01 item → the cycle's own plan context (D3)");
  assert.ok(/state\.todaysRecommendationId = planId;\s*return goRecommendationExerciseDetail\(exerciseId, true\)/.test(go), "older plan item → its recommendation id (I-1)");
  assert.ok(go.includes("cycle.userId !== getCurrentPatientId()"), "foreign cycle refused");
  assert.ok(fnBody("renderScheduleExerciseAction").includes("goExerciseDetail("), "therapist item → assigned context");
  assert.ok(fnBody("getExerciseReturnRoute").includes('state.exerciseListingOrigin === "training" ? { fn: "goSchedule()", label: "返回今日復健" }'), "返回 leads back to the Training Tab");
  const status = fnBody("getTodayStructuredStatus");
  assert.ok(status.includes("getTodayPlanForPatient(patientId)"), "Home counts = Training Tab counts");
  const primary = fnBody("getPrimaryHomeAction");
  assert.ok(primary.includes('"開始今日復健"') && primary.includes('fn: "goSchedule()"') && !primary.includes("goTodaysRecommendation"), "Home CTA 開始今日復健 → Training Tab");
  assert.ok(appJs.includes("今日完成 ${todayStatus.totalCompleted} / ${todayStatus.totalItems}"), "Home summary counts");
  const adv = readFileSync(join(root, "js/data/f01AdventureProgress.js"), "utf8");
  assert.ok(/case 3: return \{[^\n]*action: "goSchedule\(\)"/.test(adv) && /case 4: return \{[^\n]*action: "goSchedule\(\)"/.test(adv), "Adventure stage 3/4 CTA → Training Tab");
}

// §42 naming
{
  for (const bad of [">AI 今日建議<", "AI 個人化建議</span>", "查看今日建議", ">今日建議</span>", ">訓練建議</span>", "為你安排的今日練習</b>", "平均品質", "訓練品質", "AI 品質趨勢", "AI品質", "｜品質 ${record.score", "｜品質 \"+(record.score", "<div class=\"small\">品質分數</div>"]) {
    assert.ok(!appJs.includes(bad), `no "${bad}" left in the UI`);
  }
  assert.ok(appJs.includes("動作達標率 ${qualityRatio}%"), "qualityValidReps ratio is labelled 動作達標率");
  assert.ok(appJs.includes("AI 姿勢分數 ${prototypeScore}"), "0-100 score is labelled AI 姿勢分數");
  assert.ok(appJs.includes('<span class="source-tag-badge recommendation">ReMotion 建議</span>'));
  assert.ok(!/patient01/.test(fnBody("todaySchedulePage")) && !/patient01/.test(readFileSync(join(root, "js/data/todayPlanAggregator.js"), "utf8")), "no hardcoded patient");
}

// Final cross-module integration: one day, three sources, every module agrees
{
  const x = "xm-user";
  const xc = startCycle(x);
  const xIds = [...new Set(xc.rec.items.map((it) => it.exerciseId))];
  const xs = scheduleService.create({ id: "xm-sch", patientId: x, date: D2, status: "pending", createdAt: at(D2, 8), exercises: [{ exerciseId: xIds[0], exerciseName: "t", sets: 1, repetitions: 10, status: "pending" }] });
  analysisService.create({ id: "xm-t", patientId: x, scheduleId: xs.id, exerciseId: xIds[0], source: "assigned", completedAt: at(D2, 9), createdAt: at(D2, 9), score: 70, ...done });
  scheduleService.updateExerciseAt(xs.id, 0, { status: "completed", analysisRecordId: "xm-t" });
  trainF01(x, xc.cycle, xIds[0], D2, "xm-f");
  analysisService.create({ id: "xm-s", patientId: x, exerciseId: xIds[0], source: "self_practice", completedAt: at(D2, 13), createdAt: at(D2, 13), ...done });
  analysisService.create({ id: "xm-inc", patientId: x, exerciseId: xIds[0], source: "self_practice", completedAt: at(D2, 14), createdAt: at(D2, 14), totalReps: 2, targetReps: 10, summary: { totalReps: 2, targetReps: 10 } });

  const ev = Object.fromEntries(trainingEventService.listTrainingEvents(x).map((e) => [e.eventId, e]));
  assert.deepEqual([ev["xm-t"].sourceType, ev["xm-f"].sourceSubtype, ev["xm-s"].sourceType, ev["xm-inc"].completed], ["therapist", "f01_cycle", "self", false], "canonical sources");
  const week = G.getWeeklyTrainingSummary(x, D2);
  assert.equal(week.completedSessionCount, 3, "weekly summary: 3 completed, the stopped run excluded");
  assert.deepEqual([week.sourceCounts.therapist, week.sourceCounts.remotion, week.sourceCounts.self], [1, 1, 1]);
  assert.equal(G.computeSessionXp(ev["xm-inc"].record).xp, 0, "incomplete run earns 0 XP");
  const p = plan(x, { todayKey: D2 });
  assert.deepEqual([p.summary.therapistCompleted, p.summary.therapistCount, p.summary.remotionCompleted, p.summary.remotionCount], [1, 1, 1, xIds.length], "Today Plan: self excluded from X / Y");
  const a = f01AdventureService.getAdventure(x, D2);
  assert.equal(a.currentStage.n, xIds.length === 1 ? 4 : 3, "Adventure advances only on complete F01 days");
  assert.deepEqual(trackingCycleService.getTrackingCycleById(xc.cycle.id).completedTrainingDates, xIds.length === 1 ? [D2] : [], "therapist / self records never add F01 days");
}

console.log("Cross-Module I-4 Today Plan tests passed");
