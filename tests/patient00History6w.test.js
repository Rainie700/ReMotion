process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { FA5X_CURRENT_MEASUREMENT_FIELDS as FA5X_M } from "../js/data/fa5xMeasurementCompatibility.js";

/**
 * patient00 six-week showcase history — builder + what the pages read from it.
 * In memory only: a stand-in for patient00's real W5 (fresh-start cycle 09/28–10/04,
 * accepted proposal that needs a fresh baseline) is made through the real services,
 * then scripts/demo/patient00History6w/buildHistory.mjs adds W1–W4 + W6. No cloud, no Gemini.
 */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { createCollection } = await import("../js/data/storageService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { functionalProgressService } = await import("../js/data/functionalProgressService.js");
const { getD5Review } = await import("../js/data/d5TherapistReviewService.js");
const { buildVerifiedWeeklyContext } = await import("../js/services/llmContextBuilder.js");
const { buildFallbackSummary } = await import("../js/services/llmSummaryFallback.js");
const { validateWeeklySummary, mentionsBaseline } = await import("../js/services/llmSummaryValidator.js");
const { describeWeekArrangement } = await import("../js/ui/weekArrangementView.js");
const DEMO = await import("../js/ui/demoSyntheticLabel.js");
const { isHistory6wId, resetPatient00ShowcaseData } = await import("../js/dev/patient00Showcase.js");
const { buildPatient00History6w, rollbackPlan } = await import("../scripts/demo/patient00History6w/buildHistory.mjs");

// ── 1. summary validator: a baseline is matched by numeric value ──
assert.equal(mentionsBaseline("由 12.0 秒變為 8.8 秒", 12000), true, "12.0 秒 == 12000 ms");
assert.equal(mentionsBaseline("基準 12 秒", 12000), true);
assert.equal(mentionsBaseline("5xSTS 基準 12000 ms", 12000), true);
assert.equal(mentionsBaseline("由 12.1 秒變為 8.8 秒", 12000), false, "a different value is not the baseline");
assert.equal(mentionsBaseline("112.0 秒", 12000), false, "no partial-number match");
assert.equal(mentionsBaseline("由 ８.９ 秒變為", 8900), true, "full-width digits");

// ── 2. stand-in for the real W5 + its accepted proposal (requires a fresh baseline) ──
const U = "uid-p00-test", T = "uid-t00-test";
createCollection("therapistPatientRelations").create({ id: "rel-test", therapistId: T, patientId: U, status: "accepted", createdAt: "2026-07-29T00:00:00.000Z" });
const catalog = exerciseService.listNormalized();
const at = (key, hh, mm = 0) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };
const measure = (ms, iso, extra = {}) => {
  const s = functionalAssessmentService.create({ patientId: U, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, targetReps: 5, totalDurationMs: ms, measuredAt: iso, ...extra } });
  return functionalAssessmentService.getById(s.id);
};
const b5 = measure(8867, at("2026-09-28", 2, 39));
const g01 = recommendationService.createF01GoalRecommendation({ patientId: U, createdBy: U, result: generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b5.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G01", limitationIds: [], availableMinutes: 15, catalog }) }).recommendation;
const w5 = trackingCycleService.createOrGetTrackingCycle({ userId: U, baselineSession: b5, recommendation: g01 }).cycle;
const r5 = measure(8826, at("2026-10-04", 17, 54), { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: w5.id, baselineAssessmentId: b5.id });
assert.equal(trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: w5.id, userId: U, reassessment: r5, todayDateKey: "2026-10-04" }).error, undefined);
const p5 = trackingCycleService.evaluateD5Proposal({ cycleId: w5.id, userId: U, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: ["L02"] }, catalog }).proposal; // like the real one: a new limitation (R011)
// The real proposal was accepted by the EARLIER flow (before the arrangement check: user acceptance,
// no planFingerprint) on 10/14 — stored exactly in that shape here.
recommendationService.updateF01D5Proposal(p5.id, {
  status: "accepted",
  d5: {
    ...p5.d5, confirmationMode: "user_acceptance", nextCycleReady: true,
    confirmation: {
      confirmationDateKey: "2026-10-14", confirmationMode: "user_acceptance", confirmedAt: "2026-10-13T17:33:44.764Z", confirmedBy: U,
      handoff: { reassessmentDateKey: "2026-10-04", plannedReassessmentDateKey: null, baselineReuseAllowed: false, requiresFreshBaseline: true, cycleStartDateKey: null, confirmationDateKey: "2026-10-14", baselineMeasuredAt: null, baselineAssessmentId: null },
    },
  },
});
assert.equal(trackingCycleService.checkNextCycleBaselineEligibility({ proposalId: p5.id, userId: U }).ok, true, "accepted on a later day: next week needs a fresh baseline");
const get = (c, id) => createCollection(c).getById(id);
const real = {
  uid: U, relations: [get("therapistPatientRelations", "rel-test")], cycle: get("trackingCycles", w5.id),
  baseline: get("functionalAssessmentSessions", b5.id), reassessment: get("functionalAssessmentSessions", r5.id),
  phaseC: get("recommendationResults", g01.id), proposal: get("recommendationResults", p5.id), summary: null,
};
// the builder loads `real` into the same store again (create = replace by id)
const built = await buildPatient00History6w(real);

// ── 3. timeline: five completed weeks + W6 in progress, not monotonic ──
const tl = functionalProgressService.getTrackingTimeline(U, "2026-10-14");
assert.deepEqual(tl.weeks.map((w) => w.status), ["completed", "completed", "completed", "completed", "completed", "in_progress"]);
assert.deepEqual(tl.weeks.map((w) => w.reassessmentMs), [11600, 12000, 8800, 9300, 8826, null]);
assert.deepEqual(tl.weeks.map((w) => w.completedDays), [6, 4, 6, 3, 0, 0]);
assert.equal(tl.weeks[4].cycleId, w5.id, "the real week stays week 5, untouched");
const w6 = trackingCycleService.getActiveTrackingCycle(U);
assert.equal(w6.previousCycleId, w5.id);
assert.equal(w6.recommendationId, p5.id, "W6 trains the real accepted proposal");
assert.equal(w6.cycleStartDateKey, "2026-10-14");

// ── 4. W6 created by the formal path: duplicates refused, link written like a real run ──
const realAfter = recommendationService.getById(p5.id);
assert.equal(realAfter.d5.nextCycleId, w6.id, "the formal path links the proposal to W6");
assert.deepEqual(built.realUpdates.map((u) => Object.keys(u.fields).sort()), [["d5.nextCycleBaselineAssessmentId", "d5.nextCycleId", "updatedAt"]], "the only change to a real record: the formal link fields");
assert.equal(built.realUpdates[0].previous["d5.nextCycleId"], null, "rollback restores 'absent'");
const again = trackingCycleService.createNextTrackingCycle({ userId: U, proposalId: p5.id, baselineSession: functionalAssessmentService.getById(w6.baselineAssessmentId) });
assert.equal(again.created, false, "a second W6 is never created");
assert.equal(again.cycle.id, w6.id);
assert.equal(trackingCycleService.checkNextCycleBaselineEligibility({ proposalId: p5.id, userId: U }).reason, "next_cycle_exists");

// ── 5. W2: therapist review → accepted reviewed items → summary says so (never "waiting") ──
const [W1, W2, W3, W4] = built.weeks;
const p2 = recommendationService.getF01D5ProposalForCycle(U, W2.cycleId);
const review = getD5Review(p2.id);
assert.equal(p2.status, "accepted");
assert.equal(p2.d5.confirmation.therapistReviewId, review.id);
assert.deepEqual(p2.items.map((i) => [i.exerciseId, i.dose && i.dose.repetitions]), [["F01-17", 8], ["F01-18", undefined]]);
const ctx2 = buildVerifiedWeeklyContext({ userId: U, cycleId: W2.cycleId, todayKey: "2026-10-14" });
assert.deepEqual(ctx2.schemaErrors, []);
assert.deepEqual(ctx2.context.decision.therapistReview, { reviewed: true, changed: true, doses: [{ exerciseId: "F01-17", name: "雙腳提踵", sets: 2, repetitions: 8, durationSeconds: null }] });
const fb2 = buildFallbackSummary(ctx2.context);
assert.match(fb2.userSummary.nextPlanSummary, /^下一週安排已由復健師檢視確認。下一週訓練中，雙腳提踵維持原動作，訓練量為 2 組 × 每組 8 下，雙腳抬腳尖維持原安排。$/);
assert.doesNotMatch(JSON.stringify(fb2), /需由專業人員確認|需專業人員確認/);
assert.equal(validateWeeklySummary(fb2, ctx2.context).passed, true);
// a model output may not invent another dose
const wrongDose = { ...fb2, userSummary: { ...fb2.userSummary, nextPlanSummary: fb2.userSummary.nextPlanSummary.replace("2 組", "3 組") } };
assert.ok(validateWeeklySummary(wrongDose, ctx2.context).errors.some((e) => e.code === "UNVERIFIED_NUMBER"), "a dose not in the reviewed plan is rejected");
// an unreviewed adjust week keeps the old wording
const ctxNoReview = { ...ctx2.context, decision: { ...ctx2.context.decision, therapistReview: undefined } };
delete ctxNoReview.decision.therapistReview;
assert.equal(buildFallbackSummary(ctxNoReview).userSummary.nextPlanSummary, "下一週訓練安排需由專業人員確認後進行。");

// ── 6. all four demo summaries: rule fallback, no model, valid; W3 baseline 12.0 s passes ──
const summaries = built.writes.filter((w) => w.collection === "llmWeeklySummaries").map((w) => w.doc);
assert.equal(summaries.length, 4);
for (const s of summaries) {
  assert.equal(s.source, "fallback");
  assert.equal(s.model, null);
  assert.equal(s.validation.passed, true, `${s.cycleId}: ${s.validation.errorCodes}`);
  assert.equal(s.status, "confirmed");
  assert.equal(s.published.simulatedConfirmation, true, "the patient-visible version carries the simulated mark");
  assert.equal(DEMO.isSimulatedConfirmation(s.published), true);
}
assert.match(summaries[2].summary.userSummary.functionSummary, /由 12\.0 秒變為 8\.8 秒/, "W3 states its 12.0 s baseline as is");

// ── 7. 本週採用安排 for each kind of week ──
const view = (cycleId) => {
  const cycle = trackingCycleService.getTrackingCycleById(cycleId);
  const proposal = recommendationService.getF01D5ProposalForCycle(U, cycleId);
  const ordered = trackingCycleService.listTrackingCycles(U).slice().sort((a, b) => a.cycleStartDateKey.localeCompare(b.cycleStartDateKey));
  const nextCycle = trackingCycleService.getNextTrackingCycle(U, cycleId);
  const after = ordered[ordered.findIndex((c) => c.id === cycleId) + 1] || null;
  return describeWeekArrangement({ cycle, proposal, review: proposal ? getD5Review(proposal.id) : null, nextCycle, followingCycle: !nextCycle && after && after.previousCycleId !== cycleId ? after : null, nameOf: (id) => exerciseService.getNormalizedById(id).name, volumeOf: () => null, dateOf: (x) => String(x).slice(5, 10) });
};
const v1 = view(W1.cycleId);
assert.equal(v1.state, "accepted");
assert.equal(v1.review, null);
assert.equal(v1.accepted.viaReview, false);
assert.equal(v1.demo, false, "the store holds the unmarked build; the marks are on the manifest docs that get written");
assert.equal(describeWeekArrangement({ cycle: built.writes.find((w) => w.collection === "trackingCycles" && w.id === W1.cycleId).doc }).demo, true);
const v2 = view(W2.cycleId);
assert.equal(v2.rule.decisionText, "規則建議：調整（R011）");
assert.deepEqual(v2.rule.items.map((i) => i.exerciseId), ["F01-17", "F01-18"], "the rule's own items, from review.ruleItems");
assert.equal(v2.review.simulated, false, "store build is unmarked");
assert.equal(describeWeekArrangement({ cycle: trackingCycleService.getTrackingCycleById(W2.cycleId), proposal: p2, review: built.writes.find((w) => w.collection === "d5TherapistReviews").doc }).review.simulated, true, "the written review is marked simulated");
assert.equal(v2.review.changes.length, 1);
assert.equal(v2.accepted.viaReview, true);
assert.match(v2.next.text, /09-15 起依此安排進行下一週/);
const v3 = view(W3.cycleId);
assert.deepEqual(v3.accepted.items.map((i) => i.exerciseId), ["F01-19", "F01-18"], "progress along the Confirmed link F01-17 -> F01-19");
const v4 = view(W4.cycleId);
assert.equal(v4.state, "none");
assert.match(v4.note, /本週沒有產生下一階段建議；09-28 起的一週由新的評估重新開始/);
const v5 = view(w5.id);
assert.equal(v5.demo, false, "the real week is never labelled synthetic");
assert.equal(v5.accepted.viaReview, false);
assert.match(v5.next.text, /10-14 起/);
assert.equal(view(w6.id).state, "none");
assert.match(view(w6.id).note, /尚未完成再次評估/);

// ── 8. demo marks: every new doc, never a real one; on-screen helpers follow them ──
assert.ok(built.writes.every((w) => w.doc.demoSynthetic === true && w.doc.demoBatch === "p00_history6w_v1"));
assert.ok(built.writes.every((w) => isHistory6wId(w.id)), "every id is in the h6 batch namespace");
assert.ok(!built.writes.some((w) => [w5.id, p5.id, b5.id, r5.id, g01.id].includes(w.id)), "no real doc is overwritten");
const sessionOf = (id) => built.writes.find((w) => w.id === id)?.doc || functionalAssessmentService.getById(id);
const cycleDoc = (id) => built.writes.find((w) => w.collection === "trackingCycles" && w.id === id).doc;
assert.equal(DEMO.describeWeekSynthetic(cycleDoc(W2.cycleId), sessionOf).any, true);
assert.equal(DEMO.describeWeekSynthetic(trackingCycleService.getTrackingCycleById(w5.id), sessionOf).any, false);
assert.deepEqual(DEMO.describeWeekSynthetic(cycleDoc(w6.id), sessionOf), { cycle: true, baseline: true, reassessment: false, any: true });
assert.equal(DEMO.demoSyntheticBadge({ id: "real" }), "");
assert.equal(DEMO.syntheticWeeksText([1, 2, 3, 4, 6]), "第 1、2、3、4、6 週");
assert.equal(built.writes.find((w) => w.collection === "d5TherapistReviews").doc.simulatedReview, true);

// ── 9. phases + rollback list ──
assert.deepEqual([...new Set(built.writes.map((w) => w.phase))], ["P1", "T1", "P2", "T2"]);
assert.ok(built.writes.filter((w) => w.phase === "T1" || w.phase === "T2").every((w) => w.actor === "therapist00"));
assert.deepEqual(built.writes.filter((w) => w.id === p2.id && w.collection === "recommendationResults").map((w) => [w.phase, w.version, w.doc.status]), [["P1", "pre_review", "draft"], ["P2", "accepted", "accepted"]], "the review is written while the proposal is still open");
const rb = rollbackPlan(built);
assert.equal(rb.patientDeletes.length + rb.adminDeletes.length, new Set(built.writes.map((w) => `${w.collection}/${w.id}`)).size);
assert.deepEqual([...new Set(rb.adminDeletes.map((k) => k.split("/")[0]))].sort(), ["d5TherapistReviews", "llmWeeklySummaries", "trackingCycles"]);

// ── 10. the old 2-week showcase reset never touches the h6 batch ──
assert.equal(isHistory6wId("showcase_p00_2xo7muLM_h6_trackingCycle_001"), true);
assert.equal(isHistory6wId("showcase_p00_2xo7muLM_trackingCycle_001"), false);
const before = createCollection("trackingCycles").list().length;
resetPatient00ShowcaseData({ id: U, email: "patient00@gmail.com", role: "patient" });
assert.equal(createCollection("trackingCycles").list().length, before, "legacy reset leaves the h6 cycles");
assert.ok(createCollection("analysisRecords").list().some((r) => isHistory6wId(r.id)), "and the h6 training records");

console.log("patient00History6w: all assertions passed");
