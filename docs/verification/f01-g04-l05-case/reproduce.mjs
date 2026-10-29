process.env.TZ = "Asia/Taipei";

/**
 * F01 G04 + L05 case — isolated reproduction (docs/F01_G04_L05_CASE_REVIEW.md).
 *
 *   node docs/verification/f01-g04-l05-case/reproduce.mjs
 *
 * In-memory localStorage only (same pattern as tests/d5NextWeekHandoff.test.js):
 * no Firebase, no Gemini, no keys. Goes through the REAL services in the order
 * the app calls them: Phase C -> tracking cycle (formal completion rules) ->
 * six frozen training days recorded from analysis records -> reassessment ->
 * D5 status check -> arrangement -> patient acceptance.
 *
 * The assertions describe CURRENT behaviour. They are a characterization, not an
 * endorsement. The ones marked [CASE] changed on 2026-10-26 when the case was
 * routed to therapist review (the previous expectations are noted next to them).
 * Not registered in package.json, so `npm test` does not run it.
 */

import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const R = "../../../js/data/";
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(`${R}fa5xMeasurementCompatibility.js`);
const { trackingCycleService, REASSESSMENT_ROLE } = await import(`${R}trackingCycleService.js`);
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import(`${R}functionalAssessmentService.js`);
const { recommendationService } = await import(`${R}recommendationService.js`);
const { exerciseService } = await import(`${R}exerciseService.js`);
const { generateF01GoalRecommendation, findF01LimitationConflict, F01_LIMITATIONS } = await import(`${R}f01GoalRecommendation.js`);
const { F01_EXERCISE_SPEC } = await import(`${R}f01RecommendationSpec.js`);
const { F01_EXERCISE_TRANSITIONS } = await import(`${R}f01ProgressionSpec.js`);
const { F01_FORMAL_COMPLETION_RULES_VERSION: V2 } = await import(`${R}f01DailyTargets.js`);
const { getD5Arrangement } = await import(`${R}d5TherapistReviewService.js`);
const { isPatientAcceptable } = await import(`${R}d5Arrangement.js`);

const catalog = exerciseService.listNormalized();
const TRAINING_DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];

function fa5x(user, ms, at, extra = {}) {
  const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...extra } });
  return functionalAssessmentService.getById(s.id);
}

/** One full week of the case. `firstLimits` = Phase C ticks, `d5Limits` = D5 status-check ticks. */
function runCase({ user, minutes, firstLimits, d5Limits, baselineMs = 14000, reassessMs = 10500 }) {
  const out = { user, minutes };
  // 1. baseline + Phase C (as app.js generateF01RecommendationFromSetup)
  const baseline = fa5x(user, baselineMs, [2026, 8, 28, 9, 0]);
  const phaseC = generateF01GoalRecommendation({
    assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" },
    selectedGoalId: "G04", limitationIds: firstLimits, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true,
  });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: user, result: phaseC, createdBy: user }).recommendation;
  const tracked = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: baseline, recommendation: rec, completionRulesVersion: V2 });
  assert.ok(tracked.cycle, `cycle created (${tracked.error || "ok"})`);
  const cycle = tracked.cycle;
  out.phaseC = { limitationIds: rec.limitationIds, items: rec.items.map((i) => i.exerciseId), excluded: phaseC.excluded.map((e) => e.exerciseId) };
  out.cycleLimitationsSnapshot = cycle.limitationsSnapshot;

  // 2. six training days: formal start (frozen target) + a record that meets it
  for (const day of TRAINING_DAYS) {
    for (const exerciseId of rec.items.map((i) => i.exerciseId)) {
      const prep = trackingCycleService.prepareF01FormalTraining({ cycleId: cycle.id, userId: user, recommendationId: rec.id, exerciseId, dateKey: day });
      assert.ok(prep.ok, `formal start ${exerciseId} ${day}: ${prep.error || ""}`);
      const rule = prep.targetSummary.completionRule;
      const need = rule.kind === "per_side" ? rule.requiredPerSide : rule.required;
      const record = {
        id: `rec-${user}-${exerciseId}-${day}`, patientId: user, exerciseId, planDateKey: day, completedAt: `${day}T10:00:00+08:00`,
        sourceSubtype: "f01_cycle", trackingCycleId: cycle.id, recommendationId: rec.id,
        totalReps: rule.kind === "per_side" ? need * 2 : need, summary: rule.kind === "per_side" ? { leftReps: need, rightReps: need } : { totalReps: need },
      };
      const done = trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: user, exerciseId, analysisRecord: record });
      assert.ok(!done.error, `completion ${exerciseId} ${day}: ${done.error || ""}`);
    }
  }
  out.lastWeekVolume = rec.items.map((i) => {
    const t = trackingCycleService.getFrozenDailyTarget({ cycleId: cycle.id, userId: user, dateKey: TRAINING_DAYS[0], exerciseId: i.exerciseId });
    return { exerciseId: i.exerciseId, sets: t.sets.value, repsPerSet: t.repsPerSet.value, source: t.sets.source, basis: t.planCountingBasis, completionRule: t.completionRule };
  });

  // 3. reassessment on Day 7 (faster than the reference)
  const re = fa5x(user, reassessMs, [2026, 9, 4, 9, 0], { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: baseline.id });
  const linked = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: user, reassessment: re, todayDateKey: "2026-10-04" });
  assert.ok(linked.linked, `reassessment linked: ${linked.error || ""}`);

  // 4. D5 status check (as app.js submitD5StatusCheck)
  const ev = trackingCycleService.evaluateD5Proposal({
    cycleId: cycle.id, userId: user,
    input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: d5Limits },
    catalog, excludeAutoRecommendationPending: true,
  });
  assert.ok(ev.proposal, `D5 proposal: ${ev.error || ""}`);
  const p = ev.proposal;
  const d5 = p.d5;
  out.d5 = {
    previousLimitationsSnapshot: d5.previousLimitationsSnapshot, previousLimitationsSource: d5.previousLimitationsSource,
    currentLimitations: d5.currentLimitations, newLimitations: d5.newLimitations,
    changeMs: d5.changeMs, changeClass: d5.changeClass, completedTrainingDays: d5.completedTrainingDays, trainingState: d5.trainingState,
    gate: d5.gate, decisionRuleId: d5.decisionRuleId, matrixDecision: d5.matrixDecision, decision: d5.decision,
    selectionRuleId: d5.selectionRuleId, replacedExercise: d5.replacedExercise, hardFilterConflicts: d5.hardFilterConflicts,
    confirmationMode: d5.confirmationMode, reviewReasons: d5.reviewReasons, nextCycleReady: d5.nextCycleReady,
    proposedItems: p.items.map((i) => ({ exerciseId: i.exerciseId, dose: i.dose || null, matchedConditions: i.matchedConditions.map((c) => c.ruleId) })),
    reason: d5.reason,
  };

  // why the limitation check did not stop F01-11
  out.limitationCheck = Object.fromEntries(["F01-09", "F01-11"].map((id) => [id, {
    conflictWithCurrentLimits: findF01LimitationConflict(id, d5Limits),
    precautionsContainsL05Phrase: F01_LIMITATIONS.find((l) => l.id === "L05").phrases.some((ph) => (F01_EXERCISE_SPEC[id].precautions || "").includes(ph)),
  }]));

  // 5. arrangement + acceptance (no therapist linked in this isolated data)
  const arr = getD5Arrangement(p, { completionRulesVersion: V2 });
  out.arrangement = { status: arr.status, actualLabel: arr.actualLabel, reasons: arr.reasons.map((r) => r.code), patientAcceptable: isPatientAcceptable(arr), decisionSource: arr.decisionSource };
  const conf = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: user, confirmationDateKey: "2026-10-04", completionRulesVersion: V2 });
  out.acceptance = conf.error ? { error: conf.error, arrangementStatus: conf.arrangementStatus } : { created: conf.created, nextCycleItems: conf.cycle ? recommendationService.getById(conf.cycle.recommendationId).items.map((i) => i.exerciseId) : null, therapistReviewId: conf.proposal.d5.confirmation.therapistReviewId };
  if (conf.cycle) {
    const t = trackingCycleService.prepareF01FormalTraining({ cycleId: conf.cycle.id, userId: user, recommendationId: conf.cycle.recommendationId, exerciseId: out.acceptance.nextCycleItems[0], dateKey: "2026-10-05" });
    out.nextWeekFirstTarget = t.ok ? t.targetSummary : t;
  }
  return out;
}

const transition = F01_EXERCISE_TRANSITIONS.find((t) => t.currentExerciseId === "F01-09" && t.candidateExerciseId === "F01-11");
console.log("Transition row used:", JSON.stringify(transition));
console.log("L05 phrases:", JSON.stringify(F01_LIMITATIONS.find((l) => l.id === "L05")));

// [CASE] L05 ticked at Phase C and again at D5; 10 and 15 minutes
for (const minutes of [10, 15]) {
  const r = runCase({ user: `case-l05-${minutes}`, minutes, firstLimits: ["L05"], d5Limits: ["L05"] });
  console.log(`\n=== G04 + L05 (both checks), ${minutes} min ===\n${JSON.stringify(r, null, 2)}`);
  assert.deepEqual(r.phaseC.limitationIds, ["L05"]);
  assert.deepEqual(r.cycleLimitationsSnapshot, ["L05"]);
  assert.deepEqual(r.d5.currentLimitations, ["L05"]);
  assert.deepEqual(r.d5.newLimitations, [], "L05 is not new: it was in force all week");
  assert.equal(r.phaseC.items[0], "F01-09");
  assert.deepEqual([r.d5.decisionRuleId, r.d5.decision, r.d5.selectionRuleId], ["R005", "progress", "NC-P01"]);
  assert.deepEqual([r.d5.replacedExercise.fromExerciseId, r.d5.replacedExercise.toExerciseId], ["F01-09", "F01-11"]);
  assert.equal(r.limitationCheck["F01-11"].conflictWithCurrentLimits, null, "L05 does not exclude F01-11");
  assert.equal(r.d5.confirmationMode, "user_acceptance", "the engine's own output is unchanged");
  // [CASE] after the 2026-10-26 hold (js/data/d5Arrangement.js checkL05HipFlexionReview):
  // before it, status was "ready" and the same-day acceptance created the next week with F01-11.
  assert.equal(r.arrangement.status, "needs_review", "[CASE] a linked therapist must review first");
  assert.ok(r.arrangement.reasons.includes("l05_seated_to_standing_hip_flexion"));
  assert.deepEqual([r.acceptance.error, r.acceptance.arrangementStatus], ["not_confirmable", "needs_review"], "[CASE] direct acceptance refused");
}

// Contrast: L05 ticked only at D5 (new limitation) -> Gate 2, no progression
{
  const r = runCase({ user: "case-l05-new", minutes: 10, firstLimits: [], d5Limits: ["L05"] });
  console.log(`\n=== contrast: L05 new at D5, 10 min ===\n${JSON.stringify({ d5: { newLimitations: r.d5.newLimitations, decisionRuleId: r.d5.decisionRuleId, decision: r.d5.decision, selectionRuleId: r.d5.selectionRuleId, proposed: r.d5.proposedItems.map((i) => i.exerciseId) }, arrangement: r.arrangement }, null, 2)}`);
  assert.deepEqual(r.d5.newLimitations, ["L05"]);
  assert.equal(r.d5.decisionRuleId, "R011");
  assert.notEqual(r.d5.proposedItems[0].exerciseId, "F01-11");
}

// Contrast: no limitation -> same F01-09 -> F01-11 progression (the transition itself is limitation-blind)
{
  const r = runCase({ user: "case-none", minutes: 10, firstLimits: [], d5Limits: [] });
  assert.deepEqual([r.d5.replacedExercise.fromExerciseId, r.d5.replacedExercise.toExerciseId, r.arrangement.status], ["F01-09", "F01-11", "ready"]);
  console.log("\n=== contrast: no limitation, 10 min === same replacement F01-09 -> F01-11, status ready");
}

console.log("\nf01-g04-l05-case: reproduction assertions passed (current behaviour)");
