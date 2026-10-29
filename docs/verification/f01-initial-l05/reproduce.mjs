process.env.TZ = "Asia/Taipei";

/**
 * docs/F01_INITIAL_REVIEW_PLAN.md — isolated reproduction of the FIRST recommendation
 * with L05 + F01-11. Written before the initial-review flow; the assertions marked
 * [CHANGED 2026-10-27] now describe stage 1 (held for review), the old expectation beside them.
 *
 *   node docs/verification/f01-initial-l05/reproduce.mjs
 *
 * In-memory localStorage only; the real services in the order app.js calls them
 * (generateF01RecommendationFromSetup -> createF01GoalRecommendation ->
 * createOrGetTrackingCycle -> prepareF01FormalTraining). No Firebase / Gemini.
 * Not registered in package.json.
 */

import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const R = "../../../js/data/";
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(`${R}fa5xMeasurementCompatibility.js`);
const { trackingCycleService } = await import(`${R}trackingCycleService.js`);
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import(`${R}functionalAssessmentService.js`);
const { recommendationService } = await import(`${R}recommendationService.js`);
const { exerciseService } = await import(`${R}exerciseService.js`);
const { generateF01GoalRecommendation } = await import(`${R}f01GoalRecommendation.js`);
const { F01_FORMAL_COMPLETION_RULES_VERSION: V2 } = await import(`${R}f01DailyTargets.js`);
const { getTrackingCycleViewState } = await import(`${R}trackingCycle.js`);
const { todayPlanService } = await import(`${R}todayPlanAggregator.js`);

const catalog = exerciseService.listNormalized();

function baseline(user, at) {
  const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 14000, measuredAt: new Date(...at).toISOString() } });
  return functionalAssessmentService.getById(s.id);
}
/** Same calls as app.js generateF01RecommendationFromSetup (15338-15381). */
function phaseC(user, b, minutes, limits) {
  const result = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G04", limitationIds: limits, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: user, result, createdBy: user }).recommendation;
  const tracked = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: b, recommendation: rec, completionRulesVersion: V2 });
  return { result, rec, tracked };
}

// A. G04 + 20 min + L05: F01-11 in the first list, cycle created at once, formal training opens
{
  const u = "init-a";
  const b = baseline(u, [2026, 9, 26, 9, 0]);
  const { result, rec, tracked } = phaseC(u, b, 20, ["L05"]);
  const items = rec.items.map((i) => i.exerciseId);
  console.log("A items:", items, "| excluded:", result.excluded.map((e) => `${e.exerciseId}(${e.limitationId || e.reason})`), "| rec.status:", rec.status);
  console.log("A cycle:", tracked.created, tracked.cycle && { start: tracked.cycle.cycleStartDateKey, limitationsSnapshot: tracked.cycle.limitationsSnapshot, recommendationId: tracked.cycle.recommendationId === rec.id });
  assert.deepEqual(items, ["F01-09", "F01-10", "F01-11"]);
  // [CHANGED 2026-10-27, stage 1 of docs/F01_INITIAL_REVIEW_PLAN.md] before: created === true and
  // F01-11 could be trained formally on Day 1 without any review. Now the list waits for review.
  assert.equal(tracked.error, "initial_review_required");
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null);
  const plan = todayPlanService.getTodayPlan(u, { todayKey: "2026-10-26" });
  console.log("A today plan F01 items:", plan.remotion.primary && plan.remotion.primary.items.map((i) => i.exerciseId));
}

// B. re-setup (重新設定訓練需求) of the same baseline re-links the EXISTING cycle to the new list
{
  const u = "init-b";
  const b = baseline(u, [2026, 9, 26, 9, 0]);
  const first = phaseC(u, b, 10, ["L05"]);
  assert.deepEqual(first.rec.items.map((i) => i.exerciseId), ["F01-09"]);
  const again = phaseC(u, b, 20, ["L05"]);
  console.log("B re-setup:", again.tracked.error || again.tracked.reason);
  // [CHANGED 2026-10-27] before: reason "same_baseline" and the running cycle was re-linked to the
  // 20-min list (F01-11 entered it). Now the re-link is refused and the cycle keeps its plan.
  assert.equal(again.tracked.error, "initial_review_required");
  assert.equal(again.tracked.cycle.id, first.tracked.cycle.id);
  assert.equal(again.tracked.cycle.recommendationId, first.rec.id);
}

// C. the cycle's Day 1 is the BASELINE date: a cycle created days later starts in the past
{
  const u = "init-c";
  const b = baseline(u, [2026, 9, 10, 9, 0]); // baseline 2026-10-10
  const { tracked } = phaseC(u, b, 20, []); // (no L05: not held, so the baseline-age effect is still visible)
  const view = getTrackingCycleViewState(tracked.cycle, "2026-10-26");
  console.log("C baseline 10-10, cycle viewed 10-26:", { start: tracked.cycle.cycleStartDateKey, planned: tracked.cycle.plannedReassessmentDateKey, status: view.status });
  assert.equal(tracked.cycle.cycleStartDateKey, "2026-10-10");
  assert.equal(view.status, "ready_for_reassessment", "no rule bounds baseline age: training days already over");
}

// D. no cycle -> no formal training, no today-plan F01 entry (the recommendation page still offers uncounted practice)
{
  const u = "init-d";
  const prep = trackingCycleService.prepareF01FormalTraining({ cycleId: "none", userId: u, recommendationId: "x", exerciseId: "F01-11", dateKey: "2026-10-26" });
  assert.equal(prep.error, "cycle_not_found");
  const plan = todayPlanService.getTodayPlan(u, { todayKey: "2026-10-26" });
  assert.equal(plan.remotion.primary, null);
  console.log("D without a cycle: formal start ->", prep.error, "| today plan F01 -> none");
}

console.log("\nf01-initial-l05: reproduction assertions passed (current behaviour)");
