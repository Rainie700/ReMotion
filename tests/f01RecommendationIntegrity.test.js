process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";

/**
 * Integrity pass (docs/F01_INITIAL_REVIEW_PLAN.md 8-7): a first recommendation only starts or re-links a
 * cycle when it carries a verifiable marker (exerciseIds mirror the candidate items; the stored marker
 * equals the recomputed trigger) and it has been synced to the cloud first. Missing / legacy / tampered
 * records are never read as "no review needed"; failed syncs never report a started week and retry
 * without duplicates; running legacy weeks stay as they are. Isolated in-memory data; sync injected.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import("../js/data/fa5xMeasurementCompatibility.js");
const IR = await import("../js/data/f01InitialReview.js");
const S = await import("../js/data/f01InitialReviewService.js");
const V = await import("../js/ui/f01RecommendationView.js");
const B2 = await import("../js/data/f01DailyTargets.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");

const V2 = B2.F01_FORMAL_COMPLETION_RULES_VERSION;
const catalog = exerciseService.listNormalized();
const recs = createCollection("recommendationResults");
const cycles = createCollection("trackingCycles");
const syncOk = async () => ({ total: 1, failed: [] });
/** Fails the n-th sync call (1-based) for `name`. */
const failNth = (nth, name) => { let n = 0; return async () => (++n === nth ? { total: 1, failed: [{ name }] } : { total: 0, failed: [] }); };
const DAY = "2026-10-27";

function baseline(u) {
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 14000, measuredAt: `${DAY}T09:00:00+08:00` } });
  return functionalAssessmentService.getById(s.id);
}
const save = (u, b, { goal = "G04", minutes = 10, limits = [] } = {}) => recommendationService.createF01GoalRecommendation({ patientId: u, createdBy: u, result: generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, limitationIds: limits, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true }) }).recommendation;
const start = (u, rec, syncWrites = syncOk) => S.startRecommendationCycle({ userId: u, recommendationId: rec.id }, { syncWrites, completionRulesVersion: V2 });
const userCycles = (u) => cycles.query((c) => c.userId === u);
const strip = (rec, ...fields) => { const copy = { ...recs.getById(rec.id) }; for (const f of fields) delete copy[f]; recs.replaceAll([...recs.list().filter((r) => r.id !== rec.id), copy]); return copy; };

// ── a new record carries the verifiable fields ──
{
  const u = "p-new";
  const rec = save(u, baseline(u), { minutes: 20 });
  assert.deepEqual(rec.exerciseIds, rec.items.map((i) => i.exerciseId));
  assert.deepEqual(IR.checkFirstRecommendationIntegrity(rec), { ok: true });
  // a legal ordinary first recommendation still starts its week
  const res = await start(u, rec);
  assert.equal(res.created, true, JSON.stringify(res));
  assert.equal((await start(u, rec)).created, false, "a repeat changes nothing");
  assert.equal(userCycles(u).length, 1);
}

// ── plan not synced -> no week; retry works once ──
{
  const u = "p-rec-sync";
  const rec = save(u, baseline(u));
  const fail = await start(u, rec, failNth(2, "recommendationResults"));
  assert.deepEqual([fail.error, fail.retryable], ["recommendation_not_synced", true]);
  assert.equal(userCycles(u).length, 0, "no cycle before the plan is in the cloud");
  assert.deepEqual(V.describeF01CycleStartNotice({ rec: recs.getById(rec.id), lastError: { recommendationId: rec.id, code: fail.error } }), { code: "recommendation_not_synced", text: V.F01_CYCLE_START_ERROR_TEXT.recommendation_not_synced, action: "retry" });
  assert.equal((await start(u, rec)).created, true);
  assert.equal(userCycles(u).length, 1);
}

// ── cycle not synced -> rolled back; retry creates it once; concurrent retries join ──
{
  const u = "p-cycle-sync";
  const rec = save(u, baseline(u));
  const fail = await start(u, rec, failNth(3, "trackingCycles"));
  assert.equal(fail.error, "cycle_sync_failed");
  assert.equal(userCycles(u).length, 0, "the local cycle is rolled back, never reported as started");
  const [a, b] = await Promise.all([start(u, rec), start(u, rec)]);
  assert.equal(a, b);
  assert.equal(userCycles(u).length, 1);
}

// ── re-link of the same baseline: a failed sync restores the previous plan link ──
{
  const u = "p-relink";
  const b = baseline(u);
  const first = save(u, b, { minutes: 10 });
  const made = await start(u, first);
  assert.equal(made.created, true);
  const second = save(u, b, { minutes: 15 }); // no review needed
  const fail = await start(u, second, failNth(3, "trackingCycles"));
  assert.equal(fail.error, "cycle_sync_failed");
  assert.equal(cycles.getById(made.cycle.id).recommendationId, first.id, "back to the plan the cloud still has");
  const ok = await start(u, second);
  assert.equal(ok.reason, "same_baseline");
  assert.equal(cycles.getById(made.cycle.id).recommendationId, second.id);
  assert.equal(userCycles(u).length, 1);
}

// ── missing / legacy / tampered data is never read as "no review needed" ──
{
  const u = "p-missing";
  assert.equal((await S.startRecommendationCycle({ userId: u, recommendationId: "rec-does-not-exist" }, { syncWrites: syncOk })).error, "recommendation_not_found");
  const b = baseline(u);
  const cases = [
    [(rec) => strip(rec, "initialReview"), "review_marker_missing"],
    [(rec) => strip(rec, "exerciseIds"), "exercise_ids_missing"],
    [(rec) => recs.update(rec.id, { exerciseIds: ["F01-10"] }), "exercise_ids_mismatch"],
    [(rec) => recs.update(rec.id, { limitationIds: ["L05"], exerciseIds: ["F01-11"], items: [{ ...rec.items[0], exerciseId: "F01-11" }] }), "review_marker_inconsistent"], // marker says false, data says L05 + F01-11
  ];
  for (const [tamper, reason] of cases) {
    const rec = save(u, b);
    tamper(rec);
    const stored = recs.getById(rec.id);
    assert.deepEqual(IR.checkFirstRecommendationIntegrity(stored), { ok: false, reason });
    assert.deepEqual([(await start(u, rec)).error, (await start(u, rec)).reason], ["recommendation_integrity_missing", reason]);
    assert.deepEqual([trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: stored, completionRulesVersion: V2 }).error], ["recommendation_integrity_missing"], "direct service call refused too");
    const n = V.describeF01CycleStartNotice({ rec: stored });
    assert.deepEqual([n.code, n.action], ["recommendation_integrity_missing", "reset"], "the page says why and offers 重新設定訓練需求");
  }
  assert.equal(userCycles(u).length, 0);
  // a legacy pending plan (no marker, live check needs review) cannot be accepted either
  const u2 = "p-legacy-accept";
  createCollection("therapistPatientRelations").create({ id: `rel-${u2}`, therapistId: "t1", patientId: u2, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
  const b2 = baseline(u2);
  const rec = save(u2, b2, { minutes: 20, limits: ["L05"] });
  assert.ok((await S.reviewInitialRecommendation({ recommendationId: rec.id, therapistId: "t1", items: [{ exerciseId: "F01-09" }], reason: "x", expectedFingerprint: IR.initialPlanFingerprint(recs.getById(rec.id)) }, { syncWrites: syncOk, completionRulesVersion: V2 })).review);
  strip(rec, "initialReview", "exerciseIds");
  const res = await S.acceptInitialPlan({ recommendationId: rec.id, userId: u2, expectedReviewVersionId: IR.initialReviewVersionId(S.getInitialReview(rec.id)), confirmationDateKey: DAY }, { syncWrites: syncOk, completionRulesVersion: V2 });
  assert.equal(res.error, "recommendation_integrity_missing");
  assert.equal(recs.getById(rec.id).status, "draft");
}

// ── a running legacy week keeps its plan ──
{
  const u = "p-legacy-week";
  const b = baseline(u);
  const rec = save(u, b);
  const made = await start(u, rec);
  strip(rec, "initialReview", "exerciseIds"); // as stored before this pass
  const again = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: recs.getById(rec.id), completionRulesVersion: V2 });
  assert.deepEqual([again.cycle && again.cycle.id, again.reason], [made.cycle.id, "same_baseline"], "the week already on this plan is returned unchanged");
  const prep = trackingCycleService.prepareF01FormalTraining({ cycleId: made.cycle.id, userId: u, recommendationId: rec.id, exerciseId: rec.items[0].exerciseId, dateKey: DAY });
  assert.ok(prep.ok, "training continues");
  assert.equal(V.describeF01CycleStartNotice({ rec: recs.getById(rec.id), cycleExists: true }), null, "no notice on a running week");
  assert.equal(S.canTrainFromRecommendation(rec.id), true);
}

// ── a review-required plan stays held (no shortcut through this path) ──
{
  const u = "p-held";
  const rec = save(u, baseline(u), { minutes: 20, limits: ["L05"] });
  assert.equal((await start(u, rec)).error, "initial_review_required");
  assert.equal(userCycles(u).length, 0);
}

console.log("f01RecommendationIntegrity: all assertions passed");
