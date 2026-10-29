process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";

/**
 * docs/F01_G04_L05_CASE_REVIEW.md — the engineering hold for ONE reviewed case:
 * L05 in the status check + the rule's next week replacing F01-09 with F01-11
 * -> a linked therapist must review; the patient cannot accept directly (also
 * when the acceptance service is called directly). The rule's judgement and
 * items stay as they were. Isolated in-memory data through the real services;
 * cloud sync injected (no Firestore); LLM via an injected test double (no Gemini).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import("../js/data/fa5xMeasurementCompatibility.js");
const A = await import("../js/data/d5Arrangement.js");
const R = await import("../js/data/d5TherapistReviewService.js");
const SVC = await import("../js/services/d5RecommendationDraftService.js");
const L = await import("../js/data/d5LlmRecommendation.js");
const ADV = await import("../js/data/f01AdventureProgress.js");
const JP = await import("../js/data/journeyPresentation.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { F01_FORMAL_COMPLETION_RULES_VERSION: V2 } = await import("../js/data/f01DailyTargets.js");

const catalog = exerciseService.listNormalized();
const relations = createCollection("therapistPatientRelations");
const recs = createCollection("recommendationResults");
const syncOk = async () => ({ total: 1, failed: [] });
const T1 = "therapist-1";
const CODE = A.L05_HIP_FLEXION_REVIEW.code;
const DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];

function fa5x(user, ms, at, extra = {}) {
  const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...extra } });
  return functionalAssessmentService.getById(s.id);
}

/** Phase C -> six formal training days -> reassessment (3.5 s faster), as the app runs it. */
/**
 * `legacyCycle` — a first recommendation saved BEFORE the first-recommendation review existed
 * (no initialReview marker, created when such lists still started a cycle). Used only for a
 * L05 + F01-11 week: today such a list is held for review (tests/f01InitialReview.test.js).
 */
function trainedWeek(user, { goal = "G04", minutes = 10, limits = ["L05"], linkTherapist = true, legacyCycle = false } = {}) {
  if (linkTherapist) relations.create({ id: `rel-${user}`, therapistId: T1, patientId: user, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
  const b = fa5x(user, 14000, [2026, 8, 28, 9, 0]);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, limitationIds: legacyCycle ? [] : limits, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true });
  let rec = recommendationService.createF01GoalRecommendation({ patientId: user, result: r, createdBy: user }).recommendation;
  if (legacyCycle) {
    // the cycle starts from the same list without L05, then the stored record is put back to its legacy shape
    const started = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: b, recommendation: rec, completionRulesVersion: V2 }).cycle;
    const { initialReview: _m, ...legacy } = recs.getById(rec.id);
    recs.replaceAll([...recs.list().filter((x) => x.id !== rec.id), { ...legacy, limitationIds: limits }]);
    createCollection("trackingCycles").update(started.id, { limitationsSnapshot: limits });
    rec = recs.getById(rec.id);
  }
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: b, recommendation: rec, completionRulesVersion: V2 }).cycle;
  for (const day of DAYS) for (const { exerciseId } of rec.items) {
    const prep = trackingCycleService.prepareF01FormalTraining({ cycleId: cycle.id, userId: user, recommendationId: rec.id, exerciseId, dateKey: day });
    assert.ok(prep.ok, `${exerciseId} ${day}: ${prep.error}`);
    const rule = prep.targetSummary.completionRule;
    const n = rule.kind === "per_side" ? rule.requiredPerSide : rule.required;
    const record = { id: `r-${user}-${exerciseId}-${day}`, patientId: user, exerciseId, planDateKey: day, completedAt: `${day}T10:00:00+08:00`, sourceSubtype: "f01_cycle", trackingCycleId: cycle.id, recommendationId: rec.id,
      totalReps: rule.kind === "per_side" ? 2 * n : n, summary: rule.kind === "per_side" ? { leftReps: n, rightReps: n } : { totalReps: n } };
    assert.ok(!trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: user, exerciseId, analysisRecord: record }).error);
  }
  const re = fa5x(user, 10500, [2026, 9, 4, 9, 0], { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: b.id });
  assert.ok(trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: user, reassessment: re, todayDateKey: "2026-10-04" }).linked);
  return { cycle, rec };
}
const evaluate = (user, cycleId, currentLimitations = ["L05"]) => trackingCycleService.evaluateD5Proposal({ cycleId, userId: user, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations }, catalog, excludeAutoRecommendationPending: true }).proposal;
const arrangement = (p) => R.getD5Arrangement(recommendationService.getById(p.id), { completionRulesVersion: V2 });
const accept = (user, id) => trackingCycleService.confirmD5Proposal({ proposalId: id, userId: user, confirmationDateKey: "2026-10-04", completionRulesVersion: V2 });
const review = (p, items, reason = "已與患者確認可扶穩固椅背練習") => R.reviewD5Proposal({ proposalId: p.id, therapistId: T1, items, reason, expectedFingerprint: A.planFingerprint(recommendationService.getById(p.id)) }, { syncWrites: syncOk, completionRulesVersion: V2 });

// ── 1. L05 all week + 09 -> 11: review required; a direct acceptance call is refused ──
{
  const u = "p-hold";
  const { cycle } = trainedWeek(u);
  const p = evaluate(u, cycle.id);
  // the rule's own output is unchanged
  assert.deepEqual([p.d5.decisionRuleId, p.d5.decision, p.d5.selectionRuleId, p.d5.confirmationMode, p.d5.nextCycleReady], ["R005", "progress", "NC-P01", "user_acceptance", true]);
  assert.deepEqual([p.d5.replacedExercise.fromExerciseId, p.d5.replacedExercise.toExerciseId], ["F01-09", "F01-11"]);
  assert.deepEqual(p.items.map((i) => i.exerciseId), ["F01-11"]);
  const a = arrangement(p);
  assert.equal(a.status, "needs_review");
  assert.equal(A.isPatientAcceptable(a), false);
  const reason = a.reasons.find((r) => r.code === CODE);
  assert.ok(reason, "explicit reason code");
  assert.ok(reason.text.includes("這不代表已確認不適合") && !/禁忌|危險|3\.1|MDC/.test(reason.text), "never worded as 'confirmed unsuitable' or as a clinical rule");
  const res = accept(u, p.id);
  assert.deepEqual([res.error, res.arrangementStatus], ["not_confirmable", "needs_review"], "service re-checks, not only the button");
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null);
  // the therapist sees the same proposal with the same reason text
  const listed = R.listD5ReviewsForPatient({ therapistId: T1, patientId: u, completionRulesVersion: V2 });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].arrangement.reasons.find((r) => r.code === CODE).text, reason.text, "patient and therapist read the same explanation");
  // home adventure card (stage 8) follows the same arrangement status
  let adv = ADV.f01AdventureService.getAdventure(u, "2026-10-04");
  assert.deepEqual([adv.currentStage.n, adv.waitingReason, adv.detail], [8, "professional_review", "下一週訓練待復健師檢視。"], "linked: waiting for review, nothing claimed beyond that");

  // ── 2. a linked therapist confirms the same content -> patient may accept -> existing next-week flow ──
  const rv = await review(p, [{ exerciseId: "F01-11" }]);
  assert.ok(rv.review, `review saved: ${rv.error}`);
  const after = arrangement(p);
  assert.equal(after.status, "reviewed");
  assert.ok(A.isPatientAcceptable(after));
  adv = ADV.f01AdventureService.getAdventure(u, "2026-10-04");
  assert.deepEqual([adv.waitingReason, adv.detail], ["therapist_reviewed", "復健師已確認下一週安排，等待你接受。"]);
  const ok = accept(u, p.id);
  assert.equal(ok.created, true, `accepted: ${ok.error}`);
  const acc = recommendationService.getById(p.id);
  assert.equal(acc.d5.confirmation.therapistReviewId, p.id);
  assert.deepEqual(recommendationService.getById(ok.cycle.recommendationId).items.map((i) => i.exerciseId), ["F01-11"]);
  assert.equal(ok.cycle.baselineSource, "reassessment_reuse", "same-day handoff unchanged");
  // accepted -> frozen: not re-routed afterwards
  assert.equal(arrangement(p).status, "accepted");
  adv = ADV.f01AdventureService.getAdventure(u, "2026-10-05");
  assert.equal(adv.cycleId, ok.cycle.id, "accepted the same day: the next week's chapter is current");
}

// home card: accepted on a later day (fresh baseline needed) after a valid review
{
  const u = "p-hold-later";
  const { cycle } = trainedWeek(u);
  const p = evaluate(u, cycle.id);
  assert.ok((await review(p, [{ exerciseId: "F01-11" }])).review);
  const c = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: "2026-10-06", completionRulesVersion: V2 });
  assert.equal(c.requiresFreshBaseline, true);
  const adv = ADV.f01AdventureService.getAdventure(u, "2026-10-06");
  assert.deepEqual([adv.currentStage.n, adv.waitingReason], [8, "fresh_baseline"]);
}

// therapist may also choose a different exercise (existing review flow kept)
{
  const u = "p-hold-alt";
  const { cycle } = trainedWeek(u);
  const p = evaluate(u, cycle.id);
  const rv = await review(p, [{ exerciseId: "F01-09" }], "先維持坐姿版本");
  assert.ok(rv.review);
  assert.deepEqual(rv.changes.map((c) => c.kind), ["replaced"]);
  assert.ok(A.isPatientAcceptable(arrangement(p)));
  assert.equal(accept(u, p.id).created, true);
}

// ── 3. after the review, the patient changes the status check or the plan changes -> old review not reused ──
{
  const u = "p-stale-limits";
  const { cycle } = trainedWeek(u);
  const p = evaluate(u, cycle.id);
  assert.ok((await review(p, [{ exerciseId: "F01-11" }])).review);
  const p2 = evaluate(u, cycle.id, ["L05", "L04"]); // re-submitted status check with another limitation
  const a2 = arrangement(p2);
  assert.notEqual(a2.status, "reviewed");
  assert.equal(a2.staleReview, true);
  assert.equal(accept(u, p2.id).error, "not_confirmable");
}
{
  const u = "p-stale-plan";
  const { cycle } = trainedWeek(u);
  const p = evaluate(u, cycle.id);
  assert.ok((await review(p, [{ exerciseId: "F01-11" }])).review);
  recommendationService.updateF01D5Proposal(p.id, { items: [{ ...p.items[0], dose: { sets: 5, repetitions: 20, durationSeconds: null } }] }); // plan content changed after review
  const a = arrangement(p);
  assert.equal(a.status, "needs_review");
  assert.equal(a.staleReview, true);
  assert.equal(accept(u, p.id).error, "not_confirmable");
}
{
  // same re-submission with identical answers keeps the version (existing fingerprint behaviour)
  const u = "p-same-answers";
  const { cycle } = trainedWeek(u);
  const p = evaluate(u, cycle.id);
  assert.ok((await review(p, [{ exerciseId: "F01-11" }])).review);
  evaluate(u, cycle.id, ["L05"]);
  assert.equal(arrangement(p).status, "reviewed");
}

// ── 4. no L05: the original behaviour (ready, direct acceptance) ──
{
  const u = "p-no-limit";
  const { cycle } = trainedWeek(u, { limits: [] });
  const p = evaluate(u, cycle.id, []);
  assert.deepEqual(p.items.map((i) => i.exerciseId), ["F01-11"]);
  const a = arrangement(p);
  assert.equal(a.status, "ready");
  assert.ok(!a.reasons.some((r) => r.code === CODE));
  assert.equal(accept(u, p.id).created, true);
}

// ── 5. L05 without a 09 -> 11 replacement: not caught by this check ──
{
  // G04 20 min: F01-11 already in the plan, progression finds nothing -> maintain
  const u = "p-l05-g04-20";
  const { cycle } = trainedWeek(u, { minutes: 20, legacyCycle: true }); // a week started before the first-recommendation review
  const p = evaluate(u, cycle.id);
  assert.deepEqual(p.items.map((i) => i.exerciseId), ["F01-09", "F01-10", "F01-11"]);
  assert.equal(A.checkL05HipFlexionReview(p), "not_applicable");
  assert.equal(arrangement(p).status, "ready");
  assert.equal(accept(u, p.id).created, true);
}
{
  const u = "p-l05-g05";
  const { cycle } = trainedWeek(u, { goal: "G05", minutes: 15 });
  const p = evaluate(u, cycle.id);
  assert.equal(arrangement(p).status, "ready");
}

// ── 6. an older unaccepted proposal is not exempt ──
{
  const u = "p-legacy";
  const { cycle } = trainedWeek(u);
  const p = evaluate(u, cycle.id);
  // as stored by an earlier version: older timestamps, no replacedExercise detail
  const { replacedExercise: _r, ...d5Old } = p.d5;
  recs.update(p.id, { createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", d5: d5Old });
  const a = arrangement(p);
  assert.equal(a.status, "needs_review");
  assert.ok(a.reasons.some((r) => r.code === CODE));
  assert.equal(accept(u, p.id).error, "not_confirmable");
}
{
  // stored fields too incomplete to tell -> reported explicitly, nothing filled in
  const p = { id: "x", status: "draft", items: [{ exerciseId: "F01-11" }], d5: { decision: "progress", matrixDecision: "progress", selectionRuleId: "NC-P01", nextCycleReady: true, confirmationMode: "user_acceptance" } };
  assert.equal(A.checkL05HipFlexionReview(p), "data_missing");
  const a = A.resolveD5Arrangement(p);
  assert.equal(a.status, "needs_review");
  assert.ok(a.reasons.some((r) => r.code === A.L05_HIP_FLEXION_DATA_MISSING));
  // an unrelated plan without F01-11 is never flagged as data-missing
  assert.equal(A.checkL05HipFlexionReview({ items: [{ exerciseId: "F01-17" }], d5: {} }), "not_applicable");
}

// ── 7. LLM path: a valid draft still needs review; a rejected / failed draft falls back to the rule + this check ──
{
  const u = "p-llm";
  const { cycle } = trainedWeek(u);
  const p = evaluate(u, cycle.id);
  const fake = (decision, optionIds) => async ({ payload }) => ({
    schemaVersion: L.D5_LLM_OUTPUT_SCHEMA_VERSION, inputId: payload.inputId, candidateSetId: payload.candidateSetId, decision,
    changes: optionIds.map((id) => { const o = payload.options.find((x) => x.optionId === id); return { optionId: o.optionId, fromExerciseId: o.fromExerciseId, toExerciseId: o.toExerciseId }; }),
    reasons: [{ text: "依前後時間變化與完成天數提出草稿。", factIds: ["time_change", "training_completion"] }],
  });
  const ok = await SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: fake("maintain", []), excludeAutoRecommendationPending: true });
  assert.equal(ok.draft.status, "valid");
  const a = arrangement(p);
  assert.equal(a.status, "needs_review");
  assert.ok(a.reasons.some((r) => r.code === "llm_draft_requires_review") && a.reasons.some((r) => r.code === CODE));
  assert.equal(accept(u, p.id).error, "not_confirmable");

  const u2 = "p-llm-fail";
  const c2 = trainedWeek(u2).cycle;
  const p2 = evaluate(u2, c2.id);
  const failed = await SVC.requestD5LlmDraft({ proposalId: p2.id, userId: u2 }, { generate: async () => { throw new Error("boom"); }, excludeAutoRecommendationPending: true });
  assert.equal(failed.draft.status, "failed");
  const a2 = arrangement(p2);
  assert.equal(a2.decisionSource, "rule_fallback");
  assert.equal(a2.status, "needs_review", "rule fallback is held by the same check");
  assert.equal(accept(u2, p2.id).error, "not_confirmable");
}

// ── 8. no linked therapist: same hold; review by an unlinked therapist refused ──
{
  const u = "p-unlinked";
  const { cycle } = trainedWeek(u, { linkTherapist: false });
  const p = evaluate(u, cycle.id);
  assert.equal(arrangement(p).status, "needs_review");
  assert.equal((await review(p, [{ exerciseId: "F01-11" }])).error, "not_authorized");
  assert.equal(accept(u, p.id).error, "not_confirmable");
  const adv = ADV.f01AdventureService.getAdventure(u, "2026-10-04");
  assert.deepEqual([adv.waitingReason, adv.detail], ["professional_review", "下一週訓練待復健師檢視；目前沒有連結的復健師，可以查看說明與邀請碼入口。"], "unlinked: no one is said to have taken it");
}
// the journey presentation (second loader) reads the same arrangement
{
  const u = "p-journey";
  const { cycle } = trainedWeek(u);
  evaluate(u, cycle.id);
  const inputs = ADV.loadD5ArrangementInputs(u, recommendationService.getF01D5ProposalForCycle(u, cycle.id));
  assert.deepEqual([inputs.arrangement.status, inputs.hasLinkedTherapist], ["needs_review", true]);
  const current = JP.buildJourneyChapters(u, "2026-10-04").weeks.at(-1).adventure;
  assert.deepEqual([current.waitingReason, current.detail], ["professional_review", "下一週訓練待復健師檢視。"]);
}

console.log("f01G04L05CaseHold: all assertions passed");
