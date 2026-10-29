process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * docs/F01_INITIAL_REVIEW_PLAN.md stage 2 — the patient accepts EXACTLY the therapist-confirmed
 * first plan; the first week starts the same day from the original assessment, or later from a
 * fresh baseline; recommendation page, today plan and training use the same accepted items.
 * Isolated in-memory data through the real services; cloud sync injected (no Firestore).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import("../js/data/fa5xMeasurementCompatibility.js");
const IR = await import("../js/data/f01InitialReview.js");
const S = await import("../js/data/f01InitialReviewService.js");
const V = await import("../js/ui/f01RecommendationView.js");
const D5V = await import("../js/ui/d5ProposalView.js");
const T = await import("../js/data/trackingCycle.js");
const B2 = await import("../js/data/f01DailyTargets.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation, MATCH_LEVEL } = await import("../js/data/f01GoalRecommendation.js");
const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
const { todayPlanService } = await import("../js/data/todayPlanAggregator.js");

const V2 = B2.F01_FORMAL_COMPLETION_RULES_VERSION;
const catalog = exerciseService.listNormalized();
const relations = createCollection("therapistPatientRelations");
const recs = createCollection("recommendationResults");
const cycles = createCollection("trackingCycles");
const T1 = "therapist-1";
const DAY1 = "2026-10-27";
const syncOk = async () => ({ total: 1, failed: [] });
const syncFail = (name) => { let n = 0; return async () => (++n === 2 ? { total: 1, failed: [{ name }] } : { total: 0, failed: [] }); };
const ids = (items) => (items || []).map((i) => i.exerciseId);

const link = (u) => relations.create({ id: `rel-${u}`, therapistId: T1, patientId: u, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
function fa5x(u, at, extra = {}) {
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 14000, measuredAt: at, ...extra } });
  return functionalAssessmentService.getById(s.id);
}
function setup(u, b, minutes = 20) {
  const result = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G04", limitationIds: ["L05"], availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result, createdBy: u }).recommendation;
  const tracked = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec, completionRulesVersion: V2 });
  return { rec, tracked };
}
const CONFIRMED = [{ exerciseId: "F01-09", sets: 2 }, { exerciseId: "F01-10" }, { exerciseId: "F01-12" }]; // the therapist removes F01-11
const review = (rec, items = CONFIRMED) => S.reviewInitialRecommendation({ recommendationId: rec.id, therapistId: T1, items, reason: "改坐姿與支撐版本", expectedFingerprint: IR.initialPlanFingerprint(recs.getById(rec.id)) }, { syncWrites: syncOk, completionRulesVersion: V2 });
const versionOf = (rec) => IR.initialReviewVersionId(S.getInitialReview(rec.id));
const accept = (u, rec, { date = DAY1, version = versionOf(rec), syncWrites = syncOk, now = () => "2026-10-27T03:00:00.000Z" } = {}) =>
  S.acceptInitialPlan({ recommendationId: rec.id, userId: u, expectedReviewVersionId: version, confirmationDateKey: date }, { syncWrites, now, completionRulesVersion: V2 });
const arr = (rec, todayDateKey = null) => S.getInitialArrangement(recs.getById(rec.id), { todayDateKey });
const baselineAt = (day) => `${day}T09:00:00+08:00`;

// ── page harness (patient recommendation page, lifted from app.js) ──
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
let linkedNow = true;
const deps = { state, getCurrentPatientId: () => currentUser, recommendationService, exerciseService, trackingCycleService, functionalAssessmentService, MATCH_LEVEL, D5_PROPOSAL_ORIGIN,
  formatDateKeyMonthDay: T.formatDateKeyMonthDay, toLocalDateKey: () => state.todayKey, EXERCISE_ASSET_AUDIT, resolveExerciseMedia, renderExerciseCardImage: (ex) => `<img alt="${ex.name}">`,
  getInitialArrangement: S.getInitialArrangement, initialReviewVersionId: IR.initialReviewVersionId, relationService: { findAcceptedByPatientId: () => (linkedNow ? [{}] : []) }, ...V, ...D5V };
const page = new Function(...Object.keys(deps), [
  constSource("F01_MATCH_LEVEL_TEXT"), constSource("F01_DEMO_IMAGE_PENDING"), fnSource("renderF01RecommendationImage"), fnSource("f01RecommendationResultPage"),
  fnSource("renderF01InitialReviewNotice"), fnSource("renderInviteCodeCard"), fnSource("renderF01ReloadControl"), fnSource("escapeD5Text"), constSource("d5ExerciseName"), fnSource("d5ReviewVolumeText"),
  "return f01RecommendationResultPage;",
].join("\n"))(...Object.values(deps));
const open = (u, recId, todayKey = DAY1) => { currentUser = u; for (const k of Object.keys(state)) delete state[k]; Object.assign(state, { f01RecommendationId: recId, f01RecEmpty: null, f01RecCycleNotice: null, f01RecResultOrigin: "setup", todayKey }); return page(); };

// ── 1. same day: accept -> first week starts; recommendation page, today plan and training use the confirmed plan ──
{
  const u = "p-same";
  link(u);
  const b = fa5x(u, baselineAt(DAY1));
  const { rec, tracked } = setup(u, b);
  assert.equal(tracked.error, "initial_review_required");
  assert.ok((await review(rec)).review);
  // the trigger exercise was removed, but nothing started on its own
  assert.equal(arr(rec).status, "reviewed");
  assert.equal(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: recs.getById(rec.id), completionRulesVersion: V2 }).error, "initial_review_required");
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null, "no cycle before the patient accepts");
  const before = open(u, rec.id);
  assert.ok(before.includes(`acceptF01InitialPlanFromUi('${rec.id}', '${versionOf(rec)}')`) && before.includes("接受這份安排"), "accept button bound to the shown version");
  assert.ok(!before.includes("startF01RecommendedTraining("));

  const res = await accept(u, rec);
  assert.ok(!res.error, JSON.stringify(res));
  assert.deepEqual([res.handoff.baselineReuseAllowed, res.cycleCreated], [true, true]);
  const acc = recs.getById(rec.id);
  assert.equal(acc.status, "accepted");
  assert.deepEqual(ids(acc.items), ["F01-09", "F01-10", "F01-12"], "items = the confirmed plan");
  assert.deepEqual(ids(acc.candidateItems), ["F01-09", "F01-10", "F01-11"], "candidate list kept");
  assert.equal(acc.sourceAssessmentId, b.id, "the assessment id is never rewritten");
  assert.equal(acc.initialConfirmation.planFingerprint, IR.initialPlanFingerprint(acc), "the bound version survives acceptance");
  const cycle = res.cycle;
  assert.equal(cycle.id, IR.initialPlanCycleId(rec.id));
  assert.deepEqual([cycle.baselineAssessmentId, cycle.cycleStartDateKey, cycle.initialPlanAcceptance.baselineSource, cycle.formalCompletionRulesVersion], [b.id, DAY1, "original_assessment", V2]);
  assert.equal(arr(rec).status, "started");
  assert.equal(S.canTrainFromRecommendation(rec.id), true);
  // 1) recommendation page
  const html = open(u, rec.id);
  for (const id of ["F01-09", "F01-10", "F01-12"]) assert.ok(html.includes(`startF01RecommendedTraining('${id}')`), id);
  assert.ok(!html.includes("startF01RecommendedTraining('F01-11')"));
  // 2) today plan
  assert.deepEqual(ids(todayPlanService.getTodayPlan(u, { todayKey: DAY1 }).remotion.primary.items), ["F01-09", "F01-10", "F01-12"]);
  // 3) formal training: the therapist's amount is frozen, the removed exercise cannot be trained
  const prep = trackingCycleService.prepareF01FormalTraining({ cycleId: cycle.id, userId: u, recommendationId: rec.id, exerciseId: "F01-09", dateKey: DAY1 });
  assert.ok(prep.ok, JSON.stringify(prep));
  assert.equal(prep.targetSummary.sets, 2, "therapist-set sets");
  assert.equal(trackingCycleService.prepareF01FormalTraining({ cycleId: cycle.id, userId: u, recommendationId: rec.id, exerciseId: "F01-11", dateKey: DAY1 }).error, "exercise_not_in_daily_plan");

  // repeated accept / start: same cycle, nothing duplicated
  const again = await accept(u, rec);
  assert.deepEqual([again.alreadyAccepted, again.cycle.id, again.cycleCreated], [true, cycle.id, false]);
  assert.equal((await S.startInitialPlanCycle({ recommendationId: rec.id, userId: u, todayDateKey: DAY1 }, { syncWrites: syncOk })).created, false);
  assert.equal(cycles.query((c) => c.userId === u).length, 1);
  // a re-set of needs never silently re-links the confirmed week
  const re = setup(u, b, 10);
  assert.deepEqual([re.tracked.error, cycles.getById(cycle.id).recommendationId], ["cycle_runs_confirmed_plan", rec.id]);
}

// ── 2. later day: accepted, no cycle; fresh baseline starts the first week ──
{
  const u = "p-later";
  link(u);
  const b = fa5x(u, baselineAt(DAY1));
  const { rec } = setup(u, b);
  assert.ok((await review(rec)).review);
  const res = await accept(u, rec, { date: "2026-10-29", now: () => "2026-10-29T01:00:00.000Z" });
  assert.ok(!res.error && !res.cycle, JSON.stringify(res));
  assert.deepEqual([res.handoff.requiresFreshBaseline, res.handoff.originalAssessmentDateKey], [true, DAY1]);
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null, "no week whose training days are already over");
  const a = arr(rec, "2026-10-29");
  assert.deepEqual([a.status, a.start], ["accepted", "fresh_baseline_required"]);
  assert.equal(S.canTrainFromRecommendation(rec.id), false);
  const html = open(u, rec.id, "2026-10-29");
  assert.ok(html.includes("已接受安排，請完成新的基準評估") && html.includes(`goF01InitialPlanBaselineAssessment('${rec.id}')`));
  assert.ok(html.includes("復健師並沒有審閱這次新評估"), "never presented as a reviewed assessment");
  assert.ok(!html.includes("startF01RecommendedTraining("));
  // the original assessment cannot be back-dated into Day 1
  assert.equal((await S.startInitialPlanCycle({ recommendationId: rec.id, userId: u, todayDateKey: "2026-10-29" }, { syncWrites: syncOk })).error, "baseline_reuse_not_allowed");
  assert.equal(trackingCycleService.checkInitialPlanBaselineEligibility({ recommendationId: rec.id, userId: u, todayDateKey: "2026-10-29" }).ok, true);
  // fresh baselines that do not qualify
  const noCtx = fa5x(u, "2026-10-29T10:00:00+08:00");
  assert.equal((await S.startInitialPlanCycle({ recommendationId: rec.id, userId: u, baselineSession: noCtx, todayDateKey: "2026-10-29" }, { syncWrites: syncOk })).error, "missing_initial_plan_baseline_context");
  const early = fa5x(u, "2026-10-29T08:00:00+08:00", { assessmentRole: IR.INITIAL_PLAN_BASELINE_ROLE, initialRecommendationId: rec.id }); // 00:00Z < confirmedAt 01:00Z
  assert.equal((await S.startInitialPlanCycle({ recommendationId: rec.id, userId: u, baselineSession: early, todayDateKey: "2026-10-29" }, { syncWrites: syncOk })).error, "baseline_before_acceptance");
  const four = fa5x(u, "2026-10-29T10:00:00+08:00", { assessmentRole: IR.INITIAL_PLAN_BASELINE_ROLE, initialRecommendationId: rec.id, status: "incomplete", repCount: 4, completedReps: 4 });
  assert.equal((await S.startInitialPlanCycle({ recommendationId: rec.id, userId: u, baselineSession: four, todayDateKey: "2026-10-29" }, { syncWrites: syncOk })).error, "baseline_not_completed");
  // a Phase C setup can never use it
  const fresh = fa5x(u, "2026-10-29T10:00:00+08:00", { assessmentRole: IR.INITIAL_PLAN_BASELINE_ROLE, initialRecommendationId: rec.id });
  assert.equal(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: fresh, recommendation: recs.getById(rec.id), completionRulesVersion: V2 }).error, "initial_plan_baseline_not_phase_c");
  const made = await S.startInitialPlanCycle({ recommendationId: rec.id, userId: u, baselineSession: fresh, todayDateKey: "2026-10-29" }, { syncWrites: syncOk, completionRulesVersion: V2 });
  assert.equal(made.created, true, JSON.stringify(made));
  assert.deepEqual([made.cycle.baselineAssessmentId, made.cycle.cycleStartDateKey, made.cycle.initialPlanAcceptance.baselineSource, made.cycle.initialPlanAcceptance.originalAssessmentId], [fresh.id, "2026-10-29", "fresh_baseline", b.id]);
  const after = recs.getById(rec.id);
  assert.equal(after.sourceAssessmentId, b.id, "the plan keeps its own assessment");
  assert.equal(after.initialConfirmation.planFingerprint, IR.initialPlanFingerprint(after), "the confirmation version is untouched by the new baseline");
  assert.equal(arr(rec).status, "started");
  assert.deepEqual(ids(todayPlanService.getTodayPlan(u, { todayKey: "2026-10-29" }).remotion.primary.items), ["F01-09", "F01-10", "F01-12"]);
  assert.equal(trackingCycleService.checkInitialPlanBaselineEligibility({ recommendationId: rec.id, userId: u, todayDateKey: "2026-10-29" }).reason, "first_week_exists");
}

// ── 3. a confirmation that no longer applies, a wrong account, or nothing to accept ──
{
  const u = "p-invalid";
  link(u);
  const b = fa5x(u, baselineAt(DAY1));
  const { rec } = setup(u, b);
  assert.equal((await accept(u, rec, { version: "irv-none" })).error, "not_acceptable", "no review yet");
  assert.ok((await review(rec)).review);
  assert.equal((await accept(u, rec, { version: "irv-old" })).error, "review_changed", "not the version on screen");
  assert.equal((await accept("someone-else", rec)).error, "not_owner");
  const v = versionOf(rec);
  recs.update(rec.id, { limitationIds: ["L05", "L04"] }); // content / conditions changed after the review
  assert.deepEqual([(await accept(u, rec, { version: v })).error, arr(rec).status], ["not_acceptable", "needs_review"]);
  recs.update(rec.id, { limitationIds: ["L05"] });
  relations.update(`rel-${u}`, { status: "completed" }); // relation ended
  assert.equal((await accept(u, rec, { version: v })).error, "not_acceptable");
  relations.update(`rel-${u}`, { status: "accepted" });
  assert.ok(!(await accept(u, rec, { version: v })).error, "valid again with the same content and relation");
}

// ── 4. two concurrent accepts, failed syncs and retries never duplicate or half-finish ──
{
  const u = "p-race";
  link(u);
  const b = fa5x(u, baselineAt(DAY1));
  const { rec } = setup(u, b);
  assert.ok((await review(rec)).review);
  const [r1, r2] = await Promise.all([accept(u, rec), accept(u, rec)]);
  assert.equal(r1, r2, "the second call joins the first");
  assert.equal(cycles.query((c) => c.userId === u).length, 1);
}
{
  const u = "p-accept-fail";
  link(u);
  const b = fa5x(u, baselineAt(DAY1));
  const { rec } = setup(u, b);
  assert.ok((await review(rec)).review);
  const fail = await accept(u, rec, { syncWrites: syncFail("recommendationResults") });
  assert.equal(fail.error, "accept_sync_failed");
  assert.equal(recs.getById(rec.id).status, "draft", "not accepted locally either");
  assert.equal(arr(rec).status, "reviewed", "retry possible");
  assert.ok((await accept(u, rec)).cycleCreated, "retry succeeds");
}
{
  const u = "p-cycle-fail";
  link(u);
  const b = fa5x(u, baselineAt(DAY1));
  const { rec } = setup(u, b);
  assert.ok((await review(rec)).review);
  let n = 0;
  const failCycleSync = async () => (++n === 4 ? { total: 1, failed: [{ name: "trackingCycles" }] } : { total: 0, failed: [] });
  const res = await accept(u, rec, { syncWrites: failCycleSync });
  assert.deepEqual([res.cycleError, res.cycle], ["cycle_sync_failed", undefined]);
  assert.equal(recs.getById(rec.id).status, "accepted", "the acceptance stays recorded");
  assert.equal(trackingCycleService.getInitialPlanCycle(u, rec.id), null, "no half-started week");
  const a = arr(rec, DAY1);
  assert.deepEqual([a.status, a.start], ["accepted", "ready_to_start"]);
  assert.ok(open(u, rec.id).includes(`startF01InitialPlanFromUi('${rec.id}')`), "retry entry offered");
  assert.equal((await S.startInitialPlanCycle({ recommendationId: rec.id, userId: u, todayDateKey: DAY1 }, { syncWrites: syncOk })).created, true);
  assert.equal(cycles.query((c) => c.userId === u).length, 1);
}

// ── 5. an active cycle on the same assessment is never overwritten or re-linked ──
{
  const u = "p-active";
  link(u);
  const b = fa5x(u, baselineAt(DAY1));
  const first = setup(u, b, 10); // F01-09 only: starts a normal cycle
  assert.equal(first.tracked.created, true);
  const oldCycle = first.tracked.cycle;
  trackingCycleService.prepareF01FormalTraining({ cycleId: oldCycle.id, userId: u, recommendationId: first.rec.id, exerciseId: "F01-09", dateKey: DAY1 });
  const snapshot = JSON.stringify([cycles.getById(oldCycle.id), recs.getById(first.rec.id)]);
  const { rec } = setup(u, b, 20);
  assert.ok((await review(rec)).review);
  const res = await accept(u, rec);
  assert.ok(!res.error, JSON.stringify(res));
  assert.equal(res.cycleError, "another_active_cycle");
  assert.equal(JSON.stringify([cycles.getById(oldCycle.id), recs.getById(first.rec.id)]), snapshot, "old week, its plan and its training days untouched");
  assert.equal(trackingCycleService.getInitialPlanCycle(u, rec.id), null);
  const a = arr(rec, DAY1);
  assert.deepEqual([a.status, a.start], ["accepted", "blocked_by_active_cycle"]);
  const html = open(u, rec.id);
  assert.ok(html.includes("這份安排尚未啟用；目前的追蹤與紀錄不會被取代") && html.includes("目前使用的安排（本週追蹤進行中，不受影響）"));
  assert.ok(!html.includes("startF01RecommendedTraining("));
  assert.equal(S.canTrainFromRecommendation(rec.id), false);
}

console.log("f01InitialPlanAcceptance: all assertions passed");
