process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * docs/F01_INITIAL_REVIEW_PLAN.md stage 2 closing — "accepted on a later day -> fresh baseline
 * completed -> first week starts", run through the REAL app.js handlers lifted into node:
 * goF01InitialPlanBaselineAssessment -> goFiveTimesSitToStandDetection (context resolution) ->
 * finalizeFa5xAssessment (stores the run, starts the week) -> recommendation page / today plan /
 * training preparation -> journey (adventure) card.
 *
 * NOT a browser run and NOT camera recognition: the camera, voice and MediaPipe calls are stubbed
 * and the finished run is a synthetic result handed to finalizeFa5xAssessment. Cloud sync is
 * injected around the app's own startInitialPlanCycle call (the app's call site is unchanged).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import("../js/data/fa5xMeasurementCompatibility.js");
const C = await import("../js/ai/exercises/sitToStand/assessmentConstants.js");
const IR = await import("../js/data/f01InitialReview.js");
const S = await import("../js/data/f01InitialReviewService.js");
const ADV = await import("../js/data/f01AdventureProgress.js");
const JP = await import("../js/data/journeyPresentation.js");
const V = await import("../js/ui/f01RecommendationView.js");
const D5V = await import("../js/ui/d5ProposalView.js");
const T = await import("../js/data/trackingCycle.js");
const B2 = await import("../js/data/f01DailyTargets.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } = await import("../js/data/trackingCycleService.js");
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
// finalizeFa5xAssessment stamps measuredAt with the real clock, so "today" is the real local date
const TODAY = T.toLocalDateKey(new Date());
const BEFORE = T.addDaysToDateKey(TODAY, -2);
const ids = (items) => (items || []).map((i) => i.exerciseId);
const syncOk = async () => ({ total: 1, failed: [] });

function fnSource(name) {
  const re = new RegExp(`(^|\\n)(async )?function ${name}\\(`);
  const m = appJs.match(re);
  assert.ok(m, `${name} exists`);
  const start = m.index + m[1].length;
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => { const s = appJs.indexOf(`const ${name} =`); assert.ok(s >= 0, name); return appJs.slice(s, appJs.indexOf(";\n", s) + 1); };

/** One "app instance": the lifted handlers with their module-level run variables (a refresh = a new instance). */
function makeApp(user, { sync = () => syncOk } = {}) {
  const state = {};
  const log = { alerts: [], nav: [], timers: [], starts: [], renders: 0 };
  const deps = {
    state, getCurrentPatientId: () => user, trackingCycleService, functionalAssessmentService, recommendationService, exerciseService,
    FUNCTIONAL_ASSESSMENT_TYPES, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE, INITIAL_PLAN_BASELINE_ROLE: IR.INITIAL_PLAN_BASELINE_ROLE,
    FA5X_RESULT_STATUS: C.FA5X_RESULT_STATUS, FA5X_END_REASON: C.FA5X_END_REASON, F01_FORMAL_COMPLETION_RULES_VERSION: V2,
    MATCH_LEVEL, D5_PROPOSAL_ORIGIN, formatDateKeyMonthDay: T.formatDateKeyMonthDay, EXERCISE_ASSET_AUDIT, resolveExerciseMedia, renderExerciseCardImage: (ex) => `<img alt="${ex.name}">`,
    ...V, ...D5V, getInitialArrangement: S.getInitialArrangement, canTrainFromRecommendation: S.canTrainFromRecommendation, initialReviewVersionId: IR.initialReviewVersionId,
    acceptInitialPlan: (a, o) => S.acceptInitialPlan(a, { ...o, syncWrites: sync() }),
    // the app's own call, with only the cloud-sync result injected
    startInitialPlanCycle: (a, o) => { const p = S.startInitialPlanCycle(a, { ...o, syncWrites: sync() }); log.starts.push({ args: a, p }); return p; },
    relationService: { findAcceptedByPatientId: (pid) => relations.query((r) => r.patientId === pid && r.status === "accepted"), findAcceptedRelation: () => null },
    toLocalDateKey: () => TODAY, getTrackingTodayKey: () => TODAY, todayPlanService,
    f01AdventureService: ADV.f01AdventureService, buildJourneyChapters: JP.buildJourneyChapters, journeyEnvironmentLevel: JP.journeyEnvironmentLevel, journeyPathStates: JP.journeyPathStates, journeyStageWindow: JP.journeyStageWindow,
    gamificationEngine: { getGamificationSummary: () => ({ level: 1, title: "t", xp: 0, achievements: [] }) }, renderJourneyLevelRow: () => "",
    alert: (m) => log.alerts.push(m), render: () => { log.renders++; }, setTimeout: (fn, ms) => log.timers.push(ms),
    goFiveTimesSitToStandAssessment: () => log.nav.push("assessmentEntry"), goF01RecommendationResult: (id) => log.nav.push(`result:${id}`), goFiveTimesSitToStandResult: (id) => log.nav.push(`fa5xResult:${id}`),
    // camera / voice / detector stubs (no recognition runs)
    createFiveTimesSitToStandAssessment: () => ({ getSnapshot: () => ({ phase: "idle" }) }), createFa5xVoiceGuard: () => ({}), createStandingPositionCheck: () => ({}),
    initSquatVoiceSelection: () => {}, primeFa5xSpeech: () => {}, primeFa5xAudio: () => {}, setFa5xPanel: () => {}, beginFa5xCameraSession: () => log.nav.push("cameraOn"),
    stopFa5xTimer: () => {}, stopFa5xCamera: () => {}, FA5X_DEBUG: false, fa5xTraceEnded: () => {}, fa5xTraceSessionStarted: () => {}, renderFa5xTraceDock: () => {},
    getExercisePageContext: () => ({ ex: {}, catalog: {} }), returnToF01PlanForFormalBlock: (e) => log.nav.push(`formalBlock:${e}`), goSelfPracticeLibrary: () => {}, goSchedule: () => {},
  };
  const body = [
    "let fa5xRunContext = null, fa5xNextBaselineRun = null, fa5xInitialBaselineRun = null, fa5xAssessment = null, fa5xFinalized = false, fa5xPatientId = null;",
    "let fa5xVoiceGuard = null, fa5xPositionCheck = null, fa5xStage = null, fa5xStandKey = null, fa5xSitStageAt = null, fa5xPanelKind = null, fa5xLastFramingSpoken = null, fa5xSetupFrame = null, fa5xStartCueAt = null, fa5xRejectedUntil = 0;",
    constSource("LE05_CONTEXT_MODE"),
    fnSource("goF01InitialPlanBaselineAssessment"), fnSource("resolveFa5xInitialPlanBaselineRun"), fnSource("renderInitialPlanBaselineBanner"),
    fnSource("resolveFa5xReassessmentRun"), fnSource("resolveFa5xNextCycleBaselineRun"), fnSource("goFiveTimesSitToStandDetection"), fnSource("finalizeFa5xAssessment"),
    constSource("F01_MATCH_LEVEL_TEXT"), constSource("F01_DEMO_IMAGE_PENDING"), fnSource("renderF01RecommendationImage"), fnSource("f01RecommendationResultPage"),
    fnSource("renderF01InitialReviewNotice"), fnSource("renderInviteCodeCard"), fnSource("renderF01ReloadControl"), fnSource("escapeD5Text"), constSource("d5ExerciseName"), fnSource("d5ReviewVolumeText"),
    constSource("F01_INITIAL_ACCEPT_ERROR_TEXT"), constSource("f01InitialCycleErrorText"), fnSource("acceptF01InitialPlanFromUi"), fnSource("startF01InitialPlanFromUi"),
    fnSource("f01InitialReviewTrainingBlocked"), constSource("F01_INITIAL_REVIEW_BLOCK_TEXT"), fnSource("blockF01InitialReviewTraining"),
    fnSource("startF01RecommendedTraining"), fnSource("armF01TrackingTraining"), fnSource("goDetectionPrep"), fnSource("isF01FormalTrainingContext"), fnSource("prepareF01FormalTrainingTarget"),
    fnSource("rehabMapPage"),
    "return { state, goF01InitialPlanBaselineAssessment, renderInitialPlanBaselineBanner, goFiveTimesSitToStandDetection, finalizeFa5xAssessment, f01RecommendationResultPage, acceptF01InitialPlanFromUi, startF01InitialPlanFromUi, startF01RecommendedTraining, rehabMapPage, run: () => ({ fa5xInitialBaselineRun, fa5xFinalized }) };",
  ].join("\n");
  const api = new Function(...Object.keys(deps), body)(...Object.values(deps));
  return { ...api, log };
}
const openRec = (app, recId) => { for (const k of Object.keys(app.state)) if (k.startsWith("f01Rec")) delete app.state[k]; Object.assign(app.state, { f01RecommendationId: recId, f01RecEmpty: null, f01RecCycleNotice: null, f01RecResultOrigin: "setup" }); return app.f01RecommendationResultPage(); };
const settle = async (app) => { for (const s of app.log.starts.splice(0)) await s.p; };
/** A finished 5xSTS run as the detector hands it over (synthetic — no camera recognition). */
const run = (over = {}) => ({ ...FA5X_M, status: C.FA5X_RESULT_STATUS.COMPLETED, repCount: 5, completedReps: 5, totalDurationMs: 11800, startCueTimestamp: performance.now() - 13000, movementOnsetMs: 400, ...over });

/** Isolated patient: an L05 + F01-11 first list measured 2 days ago, a linked therapist's confirmation without F01-11. */
async function preparedPatient(u, { minutes = 20 } = {}) {
  relations.create({ id: `rel-${u}`, therapistId: T1, patientId: u, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 14000, measuredAt: `${BEFORE}T09:00:00+08:00` } });
  const b = functionalAssessmentService.getById(s.id);
  const result = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G04", limitationIds: ["L05"], availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result, createdBy: u }).recommendation;
  const tracked = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec, completionRulesVersion: V2 });
  const rv = await S.reviewInitialRecommendation({ recommendationId: rec.id, therapistId: T1, items: [{ exerciseId: "F01-09", sets: 2 }, { exerciseId: "F01-10" }, { exerciseId: "F01-12" }], reason: "坐姿與支撐版本", expectedFingerprint: IR.initialPlanFingerprint(recs.getById(rec.id)) }, { syncWrites: syncOk, completionRulesVersion: V2 });
  assert.ok(rv.review);
  return { b, rec, tracked };
}
const notice = (u) => ADV.f01AdventureService.getAdventure(u, TODAY).initialPlan;

// ── the full path: confirmed -> accepted on a later day -> page entry -> completed run -> first week ──
{
  const u = "p-flow";
  const { b, rec } = await preparedPatient(u);
  const app = makeApp(u);
  // journey card: confirmed, waiting for the patient
  assert.deepEqual([notice(u).status, notice(u).cta.action], ["awaiting_acceptance", `goF01RecommendationResult('${rec.id}')`]);
  assert.ok(app.rehabMapPage().includes("復健師已確認，等待你接受") && app.rehabMapPage().includes("查看確認安排"));
  // 1. accept from the page (today is a later day than the original assessment)
  let html = openRec(app, rec.id);
  const version = IR.initialReviewVersionId(S.getInitialReview(rec.id));
  assert.ok(html.includes(`acceptF01InitialPlanFromUi('${rec.id}', '${version}')`));
  await app.acceptF01InitialPlanFromUi(rec.id, version);
  assert.equal(app.state.f01InitialAcceptError, null, "no error shown");
  assert.equal(recs.getById(rec.id).status, "accepted");
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null, "later day: no cycle yet");
  html = openRec(app, rec.id);
  assert.ok(html.includes("已接受安排，請完成新的基準評估") && html.includes(`goF01InitialPlanBaselineAssessment('${rec.id}')`));
  assert.deepEqual([notice(u).status, notice(u).cta.action], ["accepted_needs_baseline", `goF01InitialPlanBaselineAssessment('${rec.id}')`]);
  assert.ok(app.rehabMapPage().includes("開始第一週基準評估"));
  // 2. the page entry -> assessment with the initial_plan_baseline context
  app.goF01InitialPlanBaselineAssessment(rec.id);
  assert.deepEqual(app.state.fa5xInitialBaselineContext, { mode: IR.INITIAL_PLAN_BASELINE_ROLE, recommendationId: rec.id });
  assert.deepEqual(app.log.nav.slice(-1), ["assessmentEntry"]);
  assert.ok(app.renderInitialPlanBaselineBanner().includes("第一週基準評估"));
  app.goFiveTimesSitToStandDetection();
  assert.deepEqual(app.run().fa5xInitialBaselineRun, { recommendationId: rec.id }, "context resolved at camera start");
  // 3. the run finishes -> the real completion handler
  app.finalizeFa5xAssessment(run());
  app.finalizeFa5xAssessment(run({ totalDurationMs: 9000 })); // duplicate completion event
  await settle(app);
  const sessions = functionalAssessmentService.getCompletedByPatientId(u).filter((x) => x.id !== b.id);
  assert.equal(sessions.length, 1, "one stored run (the duplicate event is ignored)");
  const fresh = sessions[0];
  assert.deepEqual([fresh.patientId, fresh.result.assessmentRole, fresh.result.initialRecommendationId, fresh.result.totalDurationMs], [u, IR.INITIAL_PLAN_BASELINE_ROLE, rec.id, 11800]);
  // 4. the first week: the fresh baseline's date, the accepted therapist plan
  const cycle = trackingCycleService.getActiveTrackingCycle(u);
  assert.ok(cycle, "first week started");
  assert.deepEqual([cycle.id, cycle.baselineAssessmentId, cycle.cycleStartDateKey, cycle.initialPlanAcceptance.baselineSource, cycle.recommendationId], [IR.initialPlanCycleId(rec.id), fresh.id, TODAY, "fresh_baseline", rec.id]);
  assert.equal(app.state.fa5xInitialBaselineContext, null, "context cleared after the week started");
  assert.deepEqual(app.log.timers, [1000], "the result page opens once");
  assert.equal(recs.getById(rec.id).sourceAssessmentId, b.id);
  // 5. one plan on all three entries
  html = openRec(app, rec.id);
  for (const id of ["F01-09", "F01-10", "F01-12"]) assert.ok(html.includes(`startF01RecommendedTraining('${id}')`), `rec page ${id}`);
  assert.ok(!html.includes("startF01RecommendedTraining('F01-11')"));
  assert.deepEqual(ids(todayPlanService.getTodayPlan(u, { todayKey: TODAY }).remotion.primary.items), ["F01-09", "F01-10", "F01-12"], "today plan");
  app.startF01RecommendedTraining("F01-09");
  assert.equal(app.state.route, "detectionPrep", "training preparation page reached");
  assert.deepEqual([app.state.f01TrainingContext.cycleId, app.state.f01TrainingContext.displayedTarget.sets], [cycle.id, 2], "the therapist's amount is the frozen target");
  // journey card: first week started
  assert.deepEqual([notice(u).status, notice(u).cta.action], ["started", `goTrackingWeekTraining('${cycle.id}')`]);
  // a later run is an ordinary assessment: the context no longer resolves, nothing re-links
  app.goF01InitialPlanBaselineAssessment(rec.id);
  assert.ok(app.log.alerts.some((m) => m.includes("目前不需要進行第一週基準評估")));
  assert.equal(cycles.query((c) => c.userId === u).length, 1);
}

// ── storage failure, refresh and retry ──
{
  const u = "p-fail";
  const { rec } = await preparedPatient(u);
  let failCycles = true;
  const sync = () => { let n = 0; return async () => (failCycles && ++n === 2 ? { total: 1, failed: [{ name: "trackingCycles" }] } : { total: 0, failed: [] }); };
  const app = makeApp(u, { sync });
  await app.acceptF01InitialPlanFromUi(rec.id, IR.initialReviewVersionId(S.getInitialReview(rec.id)));
  app.goF01InitialPlanBaselineAssessment(rec.id);
  app.goFiveTimesSitToStandDetection();
  app.finalizeFa5xAssessment(run());
  await settle(app);
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null, "failed sync: no week, nothing reported as started");
  assert.ok(app.state.fa5xInitialBaselineContext, "context kept");
  // refresh: a new app instance without the in-memory context
  const after = makeApp(u, { sync });
  const a = S.getInitialArrangement(recs.getById(rec.id), { todayDateKey: TODAY });
  assert.deepEqual([a.status, a.start], ["accepted", "ready_to_start"], "today's completed baseline is offered for the retry");
  let html = openRec(after, rec.id);
  assert.ok(html.includes(`startF01InitialPlanFromUi('${rec.id}')`) && !html.includes("startF01RecommendedTraining("));
  assert.equal(notice(u).status, "accepted_ready");
  await after.startF01InitialPlanFromUi(rec.id); // still failing
  assert.ok(after.state.f01InitialAcceptError && after.state.f01InitialAcceptError.message.includes("尚未同步"), "the error is shown, not success");
  assert.equal(trackingCycleService.getActiveTrackingCycle(u), null);
  failCycles = false;
  await after.startF01InitialPlanFromUi(rec.id);
  await settle(after);
  const cycle = trackingCycleService.getActiveTrackingCycle(u);
  assert.ok(cycle && cycle.initialPlanAcceptance.baselineSource === "fresh_baseline", "retry uses the completed fresh baseline (no second measurement)");
  assert.equal(cycles.query((c) => c.userId === u).length, 1);
  await after.startF01InitialPlanFromUi(rec.id);
  assert.equal(cycles.query((c) => c.userId === u).length, 1, "a further retry creates nothing");
  html = openRec(after, rec.id);
  assert.ok(html.includes("startF01RecommendedTraining('F01-09')"));
}

// ── incomplete / invalid runs never start the week ──
{
  const u = "p-incomplete";
  const { rec } = await preparedPatient(u);
  const app = makeApp(u);
  await app.acceptF01InitialPlanFromUi(rec.id, IR.initialReviewVersionId(S.getInitialReview(rec.id)));
  for (const r of [run({ status: C.FA5X_RESULT_STATUS.INCOMPLETE, repCount: 3, completedReps: 3, totalDurationMs: null }), run({ status: C.FA5X_RESULT_STATUS.INVALID })]) {
    app.goF01InitialPlanBaselineAssessment(rec.id);
    app.goFiveTimesSitToStandDetection();
    app.finalizeFa5xAssessment(r);
    await settle(app);
    assert.equal(trackingCycleService.getActiveTrackingCycle(u), null, `${r.status}: no week`);
    assert.equal(app.log.starts.length, 0);
  }
  const a = S.getInitialArrangement(recs.getById(rec.id), { todayDateKey: TODAY });
  assert.deepEqual([a.status, a.start], ["accepted", "fresh_baseline_required"], "still asks for a valid baseline");
  assert.ok(openRec(app, rec.id).includes("已接受安排，請完成新的基準評估"));
  // then a valid run works
  app.goF01InitialPlanBaselineAssessment(rec.id);
  app.goFiveTimesSitToStandDetection();
  app.finalizeFa5xAssessment(run());
  await settle(app);
  assert.ok(trackingCycleService.getActiveTrackingCycle(u));
}

// ── an older running week: accepted but not active; the entry views the running week ──
{
  const u = "p-active";
  relations.create({ id: `rel-${u}`, therapistId: T1, patientId: u, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 14000, measuredAt: `${TODAY}T08:00:00+08:00` } });
  const b = functionalAssessmentService.getById(s.id);
  const gen = (minutes) => recommendationService.createF01GoalRecommendation({ patientId: u, createdBy: u, result: generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G04", limitationIds: ["L05"], availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true }) }).recommendation;
  const oldRec = gen(10);
  // This scenario requires an OLDER recommendation. Two synchronous creates can
  // otherwise share a millisecond and make the "latest" fixture nondeterministic.
  recs.update(oldRec.id, { createdAt: `${BEFORE}T08:00:00+08:00` });
  const old = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: oldRec, completionRulesVersion: V2 }).cycle;
  const rec = gen(20);
  assert.ok((await S.reviewInitialRecommendation({ recommendationId: rec.id, therapistId: T1, items: [{ exerciseId: "F01-09" }], reason: "x", expectedFingerprint: IR.initialPlanFingerprint(recs.getById(rec.id)) }, { syncWrites: syncOk, completionRulesVersion: V2 })).review);
  const app = makeApp(u);
  await app.acceptF01InitialPlanFromUi(rec.id, IR.initialReviewVersionId(S.getInitialReview(rec.id)));
  assert.equal(app.state.f01InitialAcceptError, null, "not reported as an error, not reported as started");
  assert.equal(cycles.getById(old.id).recommendationId, oldRec.id);
  assert.deepEqual([notice(u).status, notice(u).cta.action], ["accepted_not_active", `goTrackingWeekTraining('${old.id}')`]);
  const map = app.rehabMapPage();
  assert.ok(map.includes("已接受，尚未啟用") && map.includes("查看原本的週期"));
}

console.log("f01InitialPlanBaselineFlow: all assertions passed (app.js handlers in node — not a browser / camera run)");
