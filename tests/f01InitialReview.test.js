process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * docs/F01_INITIAL_REVIEW_PLAN.md stage 1 — a FIRST recommendation with L05 + F01-11
 * goes to professional review; a linked therapist confirms. No cycle is started or
 * re-linked, no training (counted or not) starts from it, and patient acceptance is
 * not offered (stage 2). Isolated in-memory data through the real services; cloud sync
 * injected (no Firestore); pages lifted from app.js.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import("../js/data/fa5xMeasurementCompatibility.js");
const IR = await import("../js/data/f01InitialReview.js");
const S = await import("../js/data/f01InitialReviewService.js");
const A = await import("../js/data/d5Arrangement.js");
const R = await import("../js/data/d5TherapistReviewService.js");
const D = await import("../js/data/f01ProgressionDecision.js");
const W = await import("../js/ui/d5ProposalView.js");
const RV = await import("../js/ui/f01RecommendationView.js");
const T = await import("../js/data/trackingCycle.js");
const B2 = await import("../js/data/f01DailyTargets.js");
const DEMOL = await import("../js/ui/demoSyntheticLabel.js");
const { describeTimeDifference } = await import("../js/data/trackingComparison.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { relationService } = await import("../js/data/relationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation, F01_LIMITATIONS, MATCH_LEVEL } = await import("../js/data/f01GoalRecommendation.js");
const { F01_GOALS } = await import("../js/data/f01RecommendationSpec.js");
const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
const { todayPlanService } = await import("../js/data/todayPlanAggregator.js");

const V2 = B2.F01_FORMAL_COMPLETION_RULES_VERSION;
const catalog = exerciseService.listNormalized();
const relations = createCollection("therapistPatientRelations");
const recs = createCollection("recommendationResults");
const reviews = createCollection("f01InitialReviews");
const cycles = createCollection("trackingCycles");
const syncOk = async () => ({ total: 1, failed: [] });
const syncFailFor = (id) => { let n = 0; return async () => (++n === 2 ? { total: 1, failed: [{ name: "f01InitialReviews", id }] } : { total: 0, failed: [] }); };
const T1 = "therapist-1";
const TODAY = "2026-10-27";
const CODE = IR.INITIAL_REVIEW_TRIGGER.L05_F01_11;

const link = (u, id = `rel-${u}`) => relations.create({ id, therapistId: T1, patientId: u, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
function baseline(u) {
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 14000, measuredAt: new Date(2026, 9, 27, 9, 0).toISOString() } });
  return functionalAssessmentService.getById(s.id);
}
/** As app.js generateF01RecommendationFromSetup: generate -> save -> createOrGetTrackingCycle. */
function setup(u, b, { goal = "G04", minutes = 20, limits = ["L05"] } = {}) {
  const result = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, limitationIds: limits, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result, createdBy: u }).recommendation;
  const tracked = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec, completionRulesVersion: V2 });
  return { rec, tracked };
}
const review = (rec, items, { reason = "已與患者確認可扶穩固椅背練習", syncWrites = syncOk, therapistId = T1, fingerprint = IR.initialPlanFingerprint(recs.getById(rec.id)) } = {}) =>
  S.reviewInitialRecommendation({ recommendationId: rec.id, therapistId, items, reason, expectedFingerprint: fingerprint }, { syncWrites, completionRulesVersion: V2 });
const arr = (rec) => S.getInitialArrangement(recs.getById(rec.id));
const ids = (items) => (items || []).map((i) => i.exerciseId);

// ── 1. L05 + F01-11 -> pending review: stored trigger, no cycle, no training, no today-plan entry ──
{
  const u = "p-init";
  link(u);
  const { rec, tracked } = setup(u, baseline(u));
  assert.deepEqual(ids(rec.items), ["F01-09", "F01-10", "F01-11"], "candidate list unchanged (F01-11 not removed, nothing filled in)");
  assert.deepEqual(rec.initialReview, { required: true, triggerCodes: [CODE], checkVersion: IR.F01_INITIAL_REVIEW_VERSION }, "trigger + version stored at save time");
  assert.deepEqual([tracked.error, tracked.triggerCodes], ["initial_review_required", [CODE]]);
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null, "no cycle");
  assert.equal(S.canTrainFromRecommendation(rec.id), false);
  assert.equal(todayPlanService.getTodayPlan(u, { todayKey: TODAY }).remotion.primary, null);
  const a = arr(rec);
  assert.equal(a.status, "needs_review");
  assert.ok(a.reasons[0].text.includes("這不代表已確認不適合") && !/禁忌|危險/.test(a.reasons[0].text));
  assert.equal(S.listInitialReviewsForPatient({ therapistId: T1, patientId: u }).length, 1);
}

// ── 2. the condition reads neither goal nor time (synthetic records — G04 20 min is the natural case found) ──
{
  const synthetic = (selectedGoalId, availableMinutes, items, limitationIds) => ({ id: "syn", kind: "f01_goal", patientId: "x", selectedGoalId, availableMinutes, limitationIds, items: items.map((exerciseId) => ({ exerciseId })) });
  assert.equal(IR.resolveInitialReviewRequirement(synthetic("G02", 10, ["F01-11"], ["L05"])).required, true);
  assert.equal(IR.resolveInitialReviewRequirement(synthetic("G04", 15, ["F01-09", "F01-11"], ["L05", "L04"])).required, true);
  assert.equal(IR.resolveInitialReviewRequirement(synthetic("G04", 20, ["F01-09", "F01-11"], ["L04"])).required, false, "no L05");
  assert.equal(IR.resolveInitialReviewRequirement(synthetic("G04", 20, ["F01-09"], ["L05"])).required, false, "no F01-11");
  assert.deepEqual(IR.resolveInitialReviewRequirement({ ...synthetic("G04", 20, ["F01-11"], null), limitationIds: undefined }).triggerCodes, [IR.INITIAL_REVIEW_TRIGGER.DATA_MISSING], "missing limitations -> reported, never filled in");
  assert.equal(IR.resolveInitialReviewRequirement({ ...synthetic("G04", 20, ["F01-11"], ["L05"]), origin: D5_PROPOSAL_ORIGIN }).required, false, "next-stage proposals are not first recommendations");
}

// ── 3. not caught: no L05 (with F01-11), or L05 without F01-11 -> cycle as before ──
{
  const u = "p-no-l05";
  const { rec, tracked } = setup(u, baseline(u), { limits: [] });
  assert.ok(ids(rec.items).includes("F01-11") && rec.initialReview.required === false);
  assert.equal(tracked.created, true);
  assert.equal(S.canTrainFromRecommendation(rec.id), true);
  const u2 = "p-l05-10";
  const r2 = setup(u2, baseline(u2), { minutes: 10 });
  assert.deepEqual(ids(r2.rec.items), ["F01-09"]);
  assert.equal(r2.tracked.created, true);
}

// ── 4. an existing cycle keeps its plan; the new list waits (re-setup of the same baseline) ──
{
  const u = "p-relink";
  link(u);
  const b = baseline(u);
  const first = setup(u, b, { minutes: 10 });
  assert.equal(first.tracked.created, true);
  const second = setup(u, b, { minutes: 20 });
  assert.equal(second.tracked.error, "initial_review_required");
  assert.equal(cycles.getById(first.tracked.cycle.id).recommendationId, first.rec.id, "the running cycle is not re-linked");
  assert.deepEqual(ids(todayPlanService.getTodayPlan(u, { todayKey: TODAY }).remotion.primary.items), ["F01-09"], "today plan still has the CURRENT plan's items");
  assert.equal(S.canTrainFromRecommendation(first.rec.id), true);
  assert.equal(S.canTrainFromRecommendation(second.rec.id), false);
}

// ── 5. therapist confirmation: relation, reason, version; confirmed items kept apart; still no cycle ──
{
  const u = "p-review";
  link(u);
  const b = baseline(u);
  const { rec } = setup(u, b);
  assert.equal((await review(rec, [{ exerciseId: "F01-11" }], { therapistId: "outsider" })).error, "not_authorized");
  assert.equal((await review(rec, [{ exerciseId: "F01-11" }], { reason: "  " })).error, "review_reason_required");
  assert.equal((await review(rec, [{ exerciseId: "F01-11" }], { fingerprint: "old-version" })).error, "recommendation_changed");
  assert.equal((await review(rec, [{ exerciseId: "F01-20" }])).error, "review_exercise_not_allowed", "L05 still excludes F01-20");
  assert.equal(reviews.list().length, 0, "nothing written by refused attempts");
  // the therapist removes F01-11
  const ok = await review(rec, [{ exerciseId: "F01-09", sets: 2 }, { exerciseId: "F01-10" }, { exerciseId: "F01-12" }]);
  assert.ok(ok.review, JSON.stringify(ok));
  assert.deepEqual([ok.review.recommendationId, ok.review.relationId, ok.review.status], [rec.id, `rel-${u}`, "confirmed"]);
  assert.deepEqual(ok.review.basis, IR.initialReviewBasis(recs.getById(rec.id)));
  assert.deepEqual(ok.changes.map((c) => c.kind), ["dose_changed", "replaced"]);
  assert.deepEqual(ids(recs.getById(rec.id).items), ["F01-09", "F01-10", "F01-11"], "candidate items never overwritten");
  const a = arr(rec);
  assert.equal(a.status, "reviewed");
  assert.deepEqual(ids(a.confirmedItems), ["F01-09", "F01-10", "F01-12"]);
  // still held although the confirmed list has no F01-11: no cycle, no training
  assert.equal(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: recs.getById(rec.id), completionRulesVersion: V2 }).error, "initial_review_required");
  assert.equal(S.canTrainFromRecommendation(rec.id), false);
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null);

  // ── 6. a confirmation is never silently reused ──
  recs.update(rec.id, { limitationIds: ["L05", "L04"] }); // basis changed in place
  assert.equal(arr(rec).status, "needs_review");
  assert.equal(arr(rec).staleReview, true);
  recs.update(rec.id, { limitationIds: ["L05"] });
  assert.equal(arr(rec).status, "reviewed", "same version again -> valid");
  relations.update(`rel-${u}`, { status: "completed" });
  assert.equal(arr(rec).status, "needs_review", "relation ended -> not valid");
  relations.update(`rel-${u}`, { status: "accepted" });
  const again = setup(u, b); // re-setup = a new recommendation (new id)
  assert.notEqual(again.rec.id, rec.id);
  assert.equal(arr(again.rec).status, "needs_review", "a new recommendation never inherits the old confirmation");
}

// ── 7. sync failure: error, local rolled back, earlier confirmation kept ──
{
  const u = "p-sync";
  link(u);
  const { rec } = setup(u, baseline(u));
  const fail = await review(rec, [{ exerciseId: "F01-11" }], { syncWrites: syncFailFor(rec.id) });
  assert.equal(fail.error, "review_sync_failed");
  assert.equal(S.getInitialReview(rec.id), null);
  assert.ok((await review(rec, [{ exerciseId: "F01-11" }])).review);
  const fail2 = await review(rec, [{ exerciseId: "F01-09" }], { reason: "改坐姿", syncWrites: syncFailFor(rec.id) });
  assert.equal(fail2.error, "review_sync_failed");
  assert.deepEqual(ids(S.getInitialReview(rec.id).items), ["F01-11"], "the earlier confirmation is what remains");
}

// ── 8. legacy records: no marker -> live check; a cycle already running on one is never held ──
{
  const u = "p-legacy";
  link(u);
  const b = baseline(u);
  const { rec, tracked } = setup(u, b, { limits: [] }); // started before the review existed
  assert.equal(tracked.created, true);
  const { initialReview: _m, ...legacy } = recs.getById(rec.id);
  recs.replaceAll([...recs.list().filter((x) => x.id !== rec.id), { ...legacy, limitationIds: ["L05"] }]);
  const stored = recs.getById(rec.id);
  assert.deepEqual([IR.resolveInitialReviewRequirement(stored).required, IR.resolveInitialReviewRequirement(stored).source], [true, "legacy_live_check"]);
  assert.equal(S.getInitialArrangement(stored).status, "started_before_review");
  assert.equal(S.canTrainFromRecommendation(rec.id), true, "the running week is not blocked retroactively");
  assert.equal(S.listInitialReviewsForPatient({ therapistId: T1, patientId: u }).length, 0);
  // a legacy record WITHOUT a cycle is held like a new one
  const u2 = "p-legacy-nocycle";
  link(u2);
  const r2 = setup(u2, baseline(u2));
  const { initialReview: _m2, ...legacy2 } = recs.getById(r2.rec.id);
  recs.replaceAll([...recs.list().filter((x) => x.id !== r2.rec.id), legacy2]);
  assert.equal(S.getInitialArrangement(recs.getById(r2.rec.id)).status, "needs_review");
}

// ── 9. pages (lifted from app.js) ──
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
const alerts = [];
const nav = [];
const deps = {
  F01_FORMAL_COMPLETION_RULES_VERSION: V2, displayCompletedTrainingDays: B2.displayCompletedTrainingDays, ...DEMOL,
  state, getCurrentPatientId: () => currentUser, trackingCycleService, functionalAssessmentService, recommendationService, exerciseService, relationService,
  F01_GOALS, F01_LIMITATIONS, MATCH_LEVEL, D5_PROPOSAL_ORIGIN, D5_DECISION: D.D5_DECISION, CONFIRMATION_MODE: D.CONFIRMATION_MODE, TRANSITION_TYPE: D.TRANSITION_TYPE,
  describeTimeDifference, formatDateKeyMonthDay: T.formatDateKeyMonthDay, measuredDateKeyOf: D.measuredDateKeyOf, toLocalDateKey: T.toLocalDateKey,
  EXERCISE_ASSET_AUDIT, resolveExerciseMedia, renderExerciseCardImage: (ex) => `<img alt="${ex.name}">`, ...RV, ...W,
  getD5Arrangement: R.getD5Arrangement, listD5ReviewsForPatient: R.listD5ReviewsForPatient, listD5ReviewOptions: R.listD5ReviewOptions, planFingerprint: A.planFingerprint,
  getInitialArrangement: S.getInitialArrangement, canTrainFromRecommendation: S.canTrainFromRecommendation, listInitialReviewOptions: S.listInitialReviewOptions,
  listInitialReviewsForPatient: S.listInitialReviewsForPatient, reviewInitialRecommendation: S.reviewInitialRecommendation, initialPlanFingerprint: IR.initialPlanFingerprint, initialReviewVersionId: IR.initialReviewVersionId,
  alert: (m) => alerts.push(m), render: () => {}, goF01RecommendationResult: (id) => nav.push(["result", id]), armF01TrackingTraining: () => nav.push(["arm"]), goDetectionPrepTarget: () => nav.push(["prep"]),
};
const pages = new Function(...Object.keys(deps), [
  fnSource("fmtF01TrainingDays"), constSource("F01_COUNTING_LABEL"), fnSource("renderD5ReviewCountingControl"),
  constSource("D5_ERROR_TEXT"), constSource("D5_ARRANGEMENT_STATUS_TEXT"), constSource("d5ErrorText"), constSource("d5ExerciseName"), constSource("D5_STATUS_TITLE"), constSource("D5_TRANSITION_TEXT"),
  fnSource("escapeD5Text"), constSource("D5_REVIEW_ERROR_TEXT"), constSource("F01_INITIAL_REVIEW_ERROR_TEXT"), fnSource("d5ReviewVolumeText"), fnSource("renderD5ReviewForm"), constSource("reviewFormOptions"),
  fnSource("renderTherapistF01InitialReviews"), fnSource("renderF01InitialReviewCard"), fnSource("startF01InitialReview"), `async ${fnSource("submitD5Review")}`,
  constSource("F01_MATCH_LEVEL_TEXT"), constSource("F01_DEMO_IMAGE_PENDING"), fnSource("renderF01RecommendationImage"), fnSource("f01RecommendationResultPage"),
  fnSource("renderF01InitialReviewNotice"), fnSource("renderInviteCodeCard"), fnSource("renderF01ReloadControl"),
  fnSource("f01InitialReviewTrainingBlocked"), constSource("F01_INITIAL_REVIEW_BLOCK_TEXT"), fnSource("blockF01InitialReviewTraining"), fnSource("startF01RecommendedTraining"),
  "function goDetectionPrep() { if (f01InitialReviewTrainingBlocked()) return blockF01InitialReviewTraining(); goDetectionPrepTarget(); }",
  "return { f01RecommendationResultPage, renderTherapistF01InitialReviews, startF01InitialReview, submitD5Review, startF01RecommendedTraining, goDetectionPrep };",
].join("\n"))(...Object.values(deps));
const reset = (patch = {}) => { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, { f01RecEmpty: null, f01RecCycleNotice: null, f01RecResultOrigin: "setup" }, patch); };
const patientPage = (u, id) => { currentUser = u; reset({ f01RecommendationId: id }); return pages.f01RecommendationResultPage(); };
const text = (h) => h.replace(/<[^>]+>/g, " ");
{
  // unlinked patient: honest text + invite code, no start / accept
  const u = "p-page-unlinked";
  const { rec } = setup(u, baseline(u));
  const html = patientPage(u, rec.id);
  assert.ok(text(html).includes("待復健師檢視") && html.includes(IR.INITIAL_REVIEW_TEXT[CODE]));
  assert.ok(html.includes("系統候選安排（尚未生效）"));
  assert.ok(!html.includes("startF01RecommendedTraining(") && !html.includes("goSelfPracticeExerciseDetail("), "no counted or uncounted start");
  assert.ok(!/接受這份|confirmD5ProposalFromUi|acceptInitial/.test(html), "no acceptance button");
  assert.ok(html.includes("目前沒有連結的復健師") && html.includes("onInviteCodeQuery()"));
  assert.ok(!html.includes("目前等待你的復健師") && !/已通知/.test(text(html)));
  // the training guard (recommendation page / prep / camera share it)
  nav.length = 0; alerts.length = 0;
  Object.assign(state, { navigationOrigin: "f01Recommendation", f01RecommendationId: rec.id });
  pages.startF01RecommendedTraining("F01-11");
  pages.goDetectionPrep();
  assert.deepEqual(nav, [["result", rec.id], ["result", rec.id]], "neither entry reaches the preparation page");
  assert.equal(alerts.length, 2);
}
{
  // linked patient with a running cycle: current plan vs pending new plan; therapist confirms through the page
  const u = "p-page-linked";
  link(u);
  const b = baseline(u);
  const first = setup(u, b, { minutes: 10 });
  const { rec } = setup(u, b, { minutes: 20 });
  const html = patientPage(u, rec.id);
  assert.ok(html.includes("目前使用的安排（本週追蹤進行中，不受影響）") && html.includes(`goTrackingWeekTraining('${first.tracked.cycle.id}')`));
  assert.ok(html.includes("目前等待你的復健師在個案頁檢視這份安排；系統不會另外通知復健師"));
  // therapist section
  currentUser = null;
  reset({ user: { id: T1, role: "therapist" }, selectedPatientId: u });
  let ther = pages.renderTherapistF01InitialReviews(u);
  assert.ok(ther.includes("首次訓練安排待檢視") && ther.includes(IR.INITIAL_REVIEW_TEXT[CODE]) && ther.includes(`startF01InitialReview('${rec.id}')`), "same reason text on both sides");
  pages.startF01InitialReview(rec.id);
  assert.equal(state.d5ReviewDraft.kind, "initial");
  ther = pages.renderTherapistF01InitialReviews(u);
  assert.ok(ther.includes("確認首次訓練安排"));
  // submit without a reason -> error shown, input kept
  await pages.submitD5Review();
  assert.ok(state.d5ReviewDraft && state.d5ReviewError.message === "請填寫調整理由。", "failure keeps the input");
  state.d5ReviewDraft.reason = "可扶椅背進行";
  await pages.submitD5Review();
  // (submit uses the real cloud sync wait; in this isolated run nothing is synced, so no failure is reported)
  assert.equal(state.d5ReviewDraft, null, `saved: ${JSON.stringify(state.d5ReviewError)}`);
  assert.equal(S.getInitialArrangement(recs.getById(rec.id)).status, "reviewed");
  // patient sees the confirmed content and the difference, still no acceptance, no cycle change
  const after = patientPage(u, rec.id);
  assert.ok(after.includes("復健師已確認，等待你接受") && after.includes("復健師確認的安排") && after.includes("與候選安排的差異"));
  // stage 2: acceptance offered for exactly this confirmation (tests/f01InitialPlanAcceptance.test.js); still no training before accepting
  assert.ok(after.includes(`acceptF01InitialPlanFromUi('${rec.id}', '${IR.initialReviewVersionId(S.getInitialReview(rec.id))}')`) && !after.includes("startF01RecommendedTraining("));
  assert.equal(cycles.getById(first.tracked.cycle.id).recommendationId, first.rec.id);
}

console.log("f01InitialReview: all assertions passed");
