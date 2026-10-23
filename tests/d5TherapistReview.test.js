process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { FA5X_CURRENT_MEASUREMENT_FIELDS as FA5X_M } from "../js/data/fa5xMeasurementCompatibility.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 下一階段建議 — rule judgement vs actual arrangement, pending therapist
 * review, the therapist's confirmation and the patient's acceptance.
 * Isolated in-memory data through the real services; pages lifted from app.js;
 * cloud sync injected (no Firestore).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const A = await import("../js/data/d5Arrangement.js");
const R = await import("../js/data/d5TherapistReviewService.js");
const D = await import("../js/data/f01ProgressionDecision.js");
const W = await import("../js/ui/d5ProposalView.js");
const RV = await import("../js/ui/f01RecommendationView.js");
const T = await import("../js/data/trackingCycle.js");
const { describeTimeDifference } = await import("../js/data/trackingComparison.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { relationService } = await import("../js/data/relationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation, F01_LIMITATIONS, MATCH_LEVEL } = await import("../js/data/f01GoalRecommendation.js");
const { F01_GOALS } = await import("../js/data/f01RecommendationSpec.js");
const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");

const catalog = exerciseService.listNormalized();
const relations = createCollection("therapistPatientRelations");
const recs = createCollection("recommendationResults");
const cycles = createCollection("trackingCycles");
const syncOk = async () => ({ total: 1, failed: [] });
const syncFail = (id) => { let n = 0; return async () => (++n === 2 ? { total: 1, failed: [{ name: "recommendationResults", id }] } : { total: 0, failed: [] }); };
const T1 = "therapist-1";

/** A completed source cycle; `items` overrides the Phase C plan (e.g. a plan from an earlier stage). */
function completedCycle(user, { goal = "G05", minutes = 15, items = null, reMs = 8500, linkTherapist = true } = {}) {
  if (linkTherapist) relations.create({ id: `rel-${user}`, therapistId: T1, patientId: user, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
  const mk = (ms, at, role = null) => {
    const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
    return functionalAssessmentService.getById(s.id);
  };
  const b = mk(12000, [2026, 8, 28, 9, 0]);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, availableMinutes: minutes, catalog });
  if (items) r.items = items.map((exerciseId, i) => ({ ...r.items[0], rank: i + 1, exerciseId, exerciseName: exerciseService.getNormalizedById(exerciseId).name, matchLevel: MATCH_LEVEL.DIRECT }));
  const rec = recommendationService.createF01GoalRecommendation({ patientId: user, result: r, createdBy: user }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: b, recommendation: rec }).cycle;
  const re = mk(reMs, [2026, 9, 4, 20, 0], { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: b.id });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: user, reassessment: re, todayDateKey: "2026-10-04" });
  return { cycle: cycles.getById(cycle.id), rec, re };
}
const evaluate = (user, cycleId, currentLimitations = [], discomfort = false) =>
  trackingCycleService.evaluateD5Proposal({ cycleId, userId: user, input: { hasNewOrWorseningDiscomfort: discomfort, discomfortNote: discomfort ? "膝蓋有點痠" : null, currentLimitations }, catalog }).proposal;
const accept = (user, id, day = "2026-10-04") => trackingCycleService.confirmD5Proposal({ proposalId: id, userId: user, confirmationDateKey: day });

// ── page harness (patient proposal page, therapist section, plan page, training context) ──
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => { const s = appJs.indexOf(`const ${name} =`); assert.ok(s >= 0, name); return appJs.slice(s, appJs.indexOf(";\n", s) + 1); };
const state = {};
let currentUser = null;
const B2 = await import("../js/data/f01DailyTargets.js"); // F01 batch 2: real helpers used by the rebuilt app functions
const DEMOL = await import("../js/ui/demoSyntheticLabel.js");
const deps = {
  F01_FORMAL_COMPLETION_RULES_VERSION: B2.F01_FORMAL_COMPLETION_RULES_VERSION, displayCompletedTrainingDays: B2.displayCompletedTrainingDays,
  ...DEMOL,
  state, getCurrentPatientId: () => currentUser, trackingCycleService, functionalAssessmentService, recommendationService, exerciseService, relationService,
  F01_GOALS, F01_LIMITATIONS, MATCH_LEVEL, D5_PROPOSAL_ORIGIN, D5_DECISION: D.D5_DECISION, CONFIRMATION_MODE: D.CONFIRMATION_MODE, TRANSITION_TYPE: D.TRANSITION_TYPE,
  describeTimeDifference, formatDateKeyMonthDay: T.formatDateKeyMonthDay, measuredDateKeyOf: D.measuredDateKeyOf, toLocalDateKey: T.toLocalDateKey,
  EXERCISE_ASSET_AUDIT, resolveExerciseMedia, renderExerciseCardImage: (ex) => `<img alt="${ex.name}">`, ...RV, ...W,
  getD5Arrangement: R.getD5Arrangement, listD5ReviewsForPatient: R.listD5ReviewsForPatient, listD5ReviewOptions: R.listD5ReviewOptions, planFingerprint: A.planFingerprint,
};
const pages = new Function(...Object.keys(deps), [
  fnSource("fmtF01TrainingDays"), constSource("F01_COUNTING_LABEL"), fnSource("renderD5ReviewCountingControl"),
  constSource("D5_ERROR_TEXT"), constSource("D5_ARRANGEMENT_STATUS_TEXT"), constSource("d5ErrorText"), constSource("d5ExerciseName"), constSource("D5_STATUS_TITLE"), constSource("D5_TRANSITION_TEXT"),
  fnSource("escapeD5Text"), fnSource("d5ProposalPresentation"), fnSource("d5ProposalPage"),
  constSource("D5_REVIEW_ERROR_TEXT"), fnSource("d5ReviewVolumeText"), fnSource("renderTherapistD5Reviews"), fnSource("renderD5ReviewCard"), fnSource("renderD5ReviewForm"),
  constSource("F01_MATCH_LEVEL_TEXT"), constSource("F01_DEMO_IMAGE_PENDING"), fnSource("renderF01RecommendationImage"), fnSource("f01RecommendationResultPage"),
  fnSource("f01PlanDoseFor"), fnSource("getExercisePageContext"), fnSource("withF01PlanDoseLabel"), fnSource("renderInviteCodeCard"),
  "return { d5ProposalPage, renderTherapistD5Reviews, f01RecommendationResultPage, getExercisePageContext, withF01PlanDoseLabel };",
].join("\n"))(...Object.values(deps));
const reset = (patch = {}) => { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, { f01RecEmpty: null, f01RecCycleNotice: null, f01RecResultOrigin: "setup" }, patch); };
const patientPage = (user, id) => { currentUser = user; reset({ d5ProposalId: id }); return pages.d5ProposalPage(); };
const therapistSection = (patientId, patch = {}) => { currentUser = null; reset({ user: { id: T1, role: "therapist" }, selectedPatientId: patientId, ...patch }); return pages.renderTherapistD5Reviews(patientId); };
const text = (html) => html.replace(/<[^>]+>/g, " ");

// ── Scenario 1: progress judged, but no confirmed progression link -> actual arrangement 維持 ──
{
  const u = "p-noprog";
  const { cycle } = completedCycle(u, { goal: "G01", reMs: 8000 });
  cycles.update(cycle.id, { completedTrainingDates: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"] });
  const p = evaluate(u, cycle.id);
  assert.deepEqual([p.d5.matrixDecision, p.d5.decision, p.d5.selectionFallback], ["progress", "maintain", "no_confirmed_progression"]);
  const arr = R.getD5Arrangement(p);
  assert.deepEqual([arr.status, arr.ruleLabel, arr.actualLabel], ["ready", "進階", "維持（沒有套用進階）"]);
  const html = patientPage(u, p.id);
  assert.ok(text(html).includes("規則判定") && html.includes("<b>進階</b>") && html.includes("<b>維持（沒有套用進階）</b>") && html.includes("<b>可以接受</b>"));
  assert.ok(html.includes("沒有已確認的進階動作，所以下一週的動作與上一週相同"));
  assert.ok(html.includes(W.D5_DOSAGE_NOTE) && W.D5_DOSAGE_NOTE === "目前沒有依個人狀況調整訓練量；更換動作時採用新動作的預設量，組次可能因此不同。");
  assert.ok(html.includes(`confirmD5ProposalFromUi('${p.id}')`), "a rule-ready plan may be accepted directly");
  assert.equal(therapistSection(u), "", "nothing for the therapist to review");
}

// ── Scenario: "adjust" without an executable rule (NC-A02) -> pending therapist review, not acceptable ──
{
  const u = "p-adjust";
  const { cycle } = completedCycle(u, { reMs: 16000 }); // slower beyond the reference, 0 days -> R009 no auto; add days
  cycles.update(cycle.id, { completedTrainingDates: ["2026-09-28", "2026-09-29", "2026-09-30"] });
  const p = evaluate(u, cycle.id);
  assert.deepEqual([p.d5.decisionRuleId, p.d5.selectionRuleId, p.d5.nextCycleReady], ["R010", "NC-A02", true], "the engine alone would let it through");
  const arr = R.getD5Arrangement(p);
  assert.equal(arr.status, "needs_review");
  assert.ok(arr.reasons.some((r) => r.code === "adjust_without_rule"));
  assert.deepEqual(accept(u, p.id), { error: "not_confirmable", arrangementStatus: "needs_review" });
  const html = patientPage(u, p.id);
  assert.ok(html.includes("待復健師檢視") && html.includes("規則判定需要調整，但目前沒有可執行的調整規則") && !html.includes("confirmD5ProposalFromUi"));
  assert.ok(html.includes("目前等待你的復健師在個案頁檢視這份建議；系統不會另外通知復健師") && !html.includes("onInviteCodeQuery()"), "linked: waiting on the case page, no notification claimed");
  assert.ok(!/已調整完成|已完成調整/.test(text(html)), "never claims the adjustment is done");
}

// ── Scenario 2: several current exercises conflict with the latest limitations ──
const u2 = "p-multi";
const s2 = completedCycle(u2, { goal: "G04", minutes: 20, items: ["F01-13", "F01-14", "F01-16"] });
const sourcePlanBefore = JSON.stringify([recs.getById(s2.rec.id), cycles.getById(s2.cycle.id)]);
let p2 = evaluate(u2, s2.cycle.id, ["L01"]);
{
  assert.deepEqual(p2.d5.reviewReasons, ["multiple_exercises_filtered"]);
  assert.deepEqual(p2.d5.proposedExerciseIds, ["F01-16"], "the engine never rebuilds the whole plan");
  const arr = R.getD5Arrangement(p2);
  assert.equal(arr.status, "needs_review");
  assert.equal(accept(u2, p2.id).error, "not_confirmable");
  const html = patientPage(u2, p2.id);
  assert.ok(html.includes("目前勾選的情況同時排除了多個動作") && html.includes("待復健師檢視") && !html.includes("confirmD5ProposalFromUi"));
  // full-list check: any remaining conflict in the ACTUAL items also blocks (not only the replaced one)
  const tampered = { ...p2, items: [...p2.items, { ...p2.items[0], exerciseId: "F01-13" }] };
  const t = R.getD5Arrangement(tampered);
  assert.equal(t.status, "needs_review");
  const name13 = exerciseService.getNormalizedById("F01-13").name;
  assert.ok(t.reasons.some((r) => r.code === "plan_conflict" && r.text.includes(name13)), "the remaining conflict is named");
  assert.ok(A.findPlanConflicts(["F01-13", "F01-14", "F01-16"], ["L01"]).map((c) => c.exerciseId).join() === "F01-13,F01-14");
}
// therapist case page: the pending proposal with last week's plan, causes and pending items
{
  const html = therapistSection(u2);
  assert.ok(html.includes("下一階段建議待檢視") && html.includes("上一週安排") && html.includes("觸發原因") && html.includes("待處理項目"));
  for (const id of ["F01-13", "F01-14", "F01-16"]) assert.ok(html.includes(exerciseService.getNormalizedById(id).name), `last week's ${id} listed`);
  assert.ok(html.includes("目前勾選的情況同時排除了多個動作") && html.includes(`startD5Review('${p2.id}')`));
  assert.equal(therapistSection(u2, { user: { id: "therapist-unlinked", role: "therapist" } }), "", "an unlinked therapist sees nothing");
  // the form never pre-fills an amount; options are the goal pool minus current exclusions
  const form = therapistSection(u2, { d5ReviewDraft: { proposalId: p2.id, patientId: u2, fingerprint: A.planFingerprint(p2), items: [{ exerciseId: "F01-16", sets: null, repetitions: null, durationSeconds: null }], reason: "" } });
  assert.ok(form.includes("確認這份安排") && form.includes("調整理由（必填）"));
  assert.ok(!/value="\d+"/.test(form), "no amount pre-filled");
  const options = R.listD5ReviewOptions(p2).map((o) => o.exerciseId);
  assert.ok(!options.includes("F01-13") && !options.includes("F01-14") && options.includes("F01-16"));
}
// therapist confirmation: guards
const reviewsCol = createCollection("d5TherapistReviews");
const fp = A.planFingerprint(p2);
const review = (patch = {}, io = { syncWrites: syncOk, now: () => "2026-10-05T03:00:00.000Z" }) => R.reviewD5Proposal({
  proposalId: p2.id, therapistId: T1, expectedFingerprint: fp, reason: "多個動作被排除，改以同目標替代動作安排",
  items: [{ exerciseId: "F01-16" }, { exerciseId: "F01-10", sets: 3 }, { exerciseId: "F01-12" }], ...patch,
}, io);
const syncFailReview = (id) => { let n = 0; return async () => (++n === 2 ? { total: 1, failed: [{ name: "d5TherapistReviews", id }] } : { total: 0, failed: [] }); };
{
  const before = JSON.stringify(recs.getById(p2.id));
  assert.equal((await review({ reason: "  " })).error, "review_reason_required");
  assert.equal((await review({ therapistId: "therapist-unlinked" })).error, "not_authorized");
  assert.equal((await review({ expectedFingerprint: "old" })).error, "proposal_changed");
  assert.equal((await review({ items: [{ exerciseId: "F01-13" }] })).error, "review_exercise_not_allowed", "an excluded exercise can't be chosen");
  assert.equal((await review({ items: [{ exerciseId: "F01-16" }, { exerciseId: "F01-16" }] })).error, "review_duplicate_exercise");
  assert.equal((await review({ items: [{ exerciseId: "F01-16", sets: -1 }] })).error, "review_dose_invalid");
  assert.equal((await review({ items: [] })).error, "review_items_empty");
  assert.equal((await review({}, { syncWrites: syncFailReview(p2.id), now: () => "2026-10-05T03:00:00.000Z" })).error, "review_sync_failed");
  assert.equal(reviewsCol.getById(p2.id), null, "a failed save leaves no local review");
  assert.equal(JSON.stringify(recs.getById(p2.id)), before, "refused / failed review -> proposal unchanged");
}
// ── Scenario 3: therapist confirms -> patient sees the reviewed plan and accepts it ──
{
  const proposalBefore = JSON.stringify(recs.getById(p2.id));
  const res = await review();
  assert.ok(res.review, JSON.stringify(res));
  assert.equal(JSON.stringify(recs.getById(p2.id)), proposalBefore, "the therapist never writes the patient's proposal");
  const rv = reviewsCol.getById(p2.id);
  assert.deepEqual([rv.proposalId, rv.patientId, rv.therapistId, rv.relationId], [p2.id, u2, T1, `rel-${u2}`]);
  assert.deepEqual(rv.items.map((it) => it.exerciseId), ["F01-16", "F01-10", "F01-12"]);
  assert.deepEqual(rv.items[1].dose, { sets: 3, repetitions: null, durationSeconds: null }, "only what the therapist typed");
  assert.equal(rv.items[0].dose, undefined, "an untouched amount stays the catalog default");
  assert.equal(rv.reason, "多個動作被排除，改以同目標替代動作安排");
  assert.deepEqual(rv.changes.map((c) => [c.position, c.kind]), [[2, "added"], [3, "added"]]);
  assert.deepEqual(rv.basis, A.reviewBasis(p2));
  assert.equal(rv.basePlanFingerprint, A.planFingerprint(p2));
  assert.ok(!JSON.stringify(rv.items).includes("undefined"));
  assert.deepEqual(p2.d5.proposedExerciseIds, ["F01-16"], "the rule's own judgement is kept as it was");
  const arr = R.getD5Arrangement(p2);
  assert.deepEqual([arr.status, arr.actualLabel], ["reviewed", "復健師確認後的安排"]);
  assert.deepEqual(arr.planItems.map((it) => it.exerciseId), ["F01-16", "F01-10", "F01-12"]);

  // a review document that is not a valid confirmation of THIS proposal authorizes nothing
  const forged = [
    { ...rv, therapistId: "therapist-unlinked" },
    { ...rv, patientId: "someone-else" },
    { ...rv, proposalId: "other-proposal" },
    { ...rv, basePlanFingerprint: "x" },
    { ...rv, basis: { ...rv.basis, currentLimitations: [] } },
  ];
  for (const f of forged) {
    const a = A.resolveD5Arrangement(p2, { review: f, isReviewerLinked: (id) => id === T1 });
    assert.equal(a.status, "needs_review", "forged / mismatched review is ignored");
  }

  const raw10 = exerciseService.getById("F01-10");
  const mixed = RV.formatPlanVolume(RV.describePlanVolume(raw10, { sets: 3 }));
  assert.ok(mixed.includes("3 組（復健師設定）") && mixed.includes("（動作預設）"), "the field the therapist left empty stays 動作預設");
  const html = patientPage(u2, p2.id);
  assert.ok(html.includes("復健師已檢視並確認") && html.includes("調整理由：</b>多個動作被排除，改以同目標替代動作安排"));
  assert.ok(html.includes("以下是復健師檢視並確認後的下一週安排") && html.includes(mixed) && html.includes("<b>復健師已確認，可以接受</b>"));
  assert.ok(html.includes(RV.formatPlanVolume(RV.describePlanVolume(exerciseService.getById("F01-16"), null))), "untouched exercise: 動作預設");
  assert.ok(html.includes(`confirmD5ProposalFromUi('${p2.id}')`) && html.includes("接受代表採用復健師確認後的安排"));

  const ok = accept(u2, p2.id);
  assert.equal(ok.created, true);
  const accepted = recs.getById(p2.id);
  assert.deepEqual(accepted.items, rv.items, "the patient's own write adopts exactly the reviewed items");
  assert.equal(accepted.d5.confirmation.therapistReviewId, p2.id);
  assert.equal(accepted.d5.confirmation.therapistReviewedAt, "2026-10-05T03:00:00.000Z");
  assert.equal(accepted.d5.confirmation.planFingerprint, A.planFingerprint(accepted));
  const next = trackingCycleService.getActiveTrackingCycle(u2);
  assert.equal(next.recommendationId, p2.id, "next week trains the reviewed plan");
  assert.equal(accept(u2, p2.id).cycle.id, next.id, "accepting again never duplicates");
  assert.equal(R.getD5Arrangement(accepted).status, "accepted");
  assert.equal(JSON.stringify([recs.getById(s2.rec.id), { ...cycles.getById(s2.cycle.id), updatedAt: undefined }]), JSON.stringify([JSON.parse(sourcePlanBefore)[0], { ...JSON.parse(sourcePlanBefore)[1], updatedAt: undefined }]), "last week's plan and cycle untouched");
  // plan page, detail page and training context: the same amount, labelled per field
  currentUser = u2;
  reset({ f01RecommendationId: next.recommendationId });
  const plan = pages.f01RecommendationResultPage();
  for (const id of ["F01-16", "F01-10", "F01-12"]) assert.ok(plan.includes(`startF01RecommendedTraining('${id}')`));
  assert.ok(plan.includes(`訓練量：${mixed}`) && plan.includes(RV.PLAN_VOLUME_SOURCE_NOTE));
  reset({ f01RecommendationId: next.recommendationId, navigationOrigin: "f01Recommendation", exerciseContext: "self_practice", selectedExerciseId: "F01-10" });
  const ctx = pages.getExercisePageContext();
  assert.equal(ctx.ex.sets, 3, "training uses the therapist's sets");
  assert.equal(ctx.ex.repetitions ?? ctx.ex.durationSeconds, raw10.defaultRepetitions ?? raw10.defaultDurationSeconds, "the untouched field keeps the default");
  assert.equal(pages.withF01PlanDoseLabel({ dosage: { text: "x" } }, ctx.ex).dosage.text, mixed, "detail / preparation pages: same labelled amount");
  reset({ navigationOrigin: "self_practice", exerciseContext: "self_practice", selectedExerciseId: "F01-10" });
  assert.equal(pages.getExercisePageContext().ex.sets, raw10.defaultSets, "other entries keep the catalog default");
}

// ── A changed plan never inherits an old confirmation ──
{
  const u = "p-stale";
  const { cycle } = completedCycle(u, { goal: "G04", minutes: 20, items: ["F01-13", "F01-14", "F01-16"] });
  const p = evaluate(u, cycle.id, ["L01"]);
  const done = await R.reviewD5Proposal({ proposalId: p.id, therapistId: T1, expectedFingerprint: A.planFingerprint(p), reason: "改安排", items: [{ exerciseId: "F01-16" }, { exerciseId: "F01-10" }] }, { syncWrites: syncOk });
  assert.ok(done.review);
  assert.equal(R.getD5Arrangement(recs.getById(p.id)).status, "reviewed");
  // the patient changes the status check -> the engine rewrites the draft -> the review no longer applies
  const re = evaluate(u, cycle.id, ["L01", "L04"]);
  const arr = R.getD5Arrangement(re);
  assert.equal(arr.status, "needs_review");
  assert.equal(arr.staleReview, true);
  assert.equal(accept(u, p.id).error, "not_confirmable");
  assert.ok(patientPage(u, p.id).includes("復健師先前的確認是針對舊版內容"));
  // a review by a therapist who is no longer linked does not count
  relations.update(`rel-${u}`, { status: "completed" });
  const fresh = await R.reviewD5Proposal({ proposalId: p.id, therapistId: T1, expectedFingerprint: A.planFingerprint(re), reason: "x", items: [{ exerciseId: "F01-16" }] }, { syncWrites: syncOk });
  assert.equal(fresh.error, "not_authorized");
  // pending-review exit for a patient without a linked therapist: the existing invite-code entry
  const page = patientPage(u, p.id);
  assert.ok(page.includes("目前沒有連結的復健師") && page.includes("onInviteCodeQuery()"), "existing invite-code card offered");
  assert.ok(!page.includes("confirmD5ProposalFromUi"), "no way around the pending review");
}

// ── content changed after acceptance -> the next cycle is not built from it ──
{
  const u = "p-after";
  const { cycle, re } = completedCycle(u);
  const p = evaluate(u, cycle.id);
  assert.equal(R.getD5Arrangement(p).status, "ready");
  assert.equal(accept(u, p.id, "2026-10-06").requiresFreshBaseline, true);
  recs.update(p.id, { items: [...p.items].reverse() });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: re }).error, "accepted_plan_changed");
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null);
}

// ── wording: an unmatched precaution is "not hit by the exclusion rule", never "safe" ──
assert.equal(RV.displayConditionText({ ruleId: "R03", text: "動作注意事項未涉及你勾選的限制" }), "未命中現有的排除規則（注意事項沒有提到勾選的情況）");
assert.equal(RV.displayConditionText({ ruleId: "NC-G04", text: "通過目前的限制條件篩選" }), "未命中現有的排除規則（注意事項沒有提到勾選的情況）");
assert.ok(!/安全|適合/.test(RV.displayConditionText({ ruleId: "R03" })));

console.log("d5TherapistReview: all assertions passed");
