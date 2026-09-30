import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Flow & Data QA — 5xSTS timing semantics, F01 navigation, assessment focus
 * mode, D5 draft pollution, exercise image mapping, favicon.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const { createFiveTimesSitToStandAssessment } = await import("../js/ai/exercises/sitToStand/assessmentSession.js");
const { FA5X_PARAMS, FA5X_PHASE, FA5X_TIMING_DEFINITION } = await import("../js/ai/exercises/sitToStand/assessmentConstants.js");
const { trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { createCollection } = await import("../js/data/storageService.js");

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
/** Runs one app.js function in isolation with injected globals. */
const load = (name, deps) => new Function(...Object.keys(deps), `${fnSource(name)}\nreturn ${name};`)(...Object.values(deps));

// ── 1. 5xSTS timing definitions (FSM unchanged) ─────────────────────────
// Synthetic run with a reaction delay, a slow forward-lean start (hip below the
// onset threshold) and time on the seat between reps — as in a real test.
{
  const SHANK = 0.18, BASE_HIP = 0.6, BASE_SHOULDER = 0.4, STEP = 66;
  const feat = (d, knee = 176) => ({
    tracked: true, missing: { shoulders: false, hips: false, knees: false, ankles: false },
    hipY: BASE_HIP - d * SHANK, shoulderY: BASE_SHOULDER - d * SHANK, shankLength: SHANK, kneeAngle: knee, trunkLeanDeg: 10,
    topY: BASE_SHOULDER - d * SHANK, bottomY: 0.9, bodyHeight: 0.9 - (BASE_SHOULDER - d * SHANK),
  });
  const a = createFiveTimesSitToStandAssessment();
  let t = 1000, last = null;
  const feed = (f, n = 1) => { for (let i = 0; i < n && (!last || last.phase !== FA5X_PHASE.FINISHED); i += 1) { t += STEP; last = a.processFrame(f, t); } };
  for (let i = 0; i < 200 && (!last || last.phase !== FA5X_PHASE.RUNNING); i += 1) feed(feat(0, 170));
  assert.equal(last.phase, FA5X_PHASE.RUNNING);
  feed(feat(0, 170), 8); // reaction time after 「開始」
  for (let rep = 0; rep < 5; rep += 1) {
    feed(feat(0.08, 170), 6); // forward lean: hip barely moves (below RISE_ONSET_DISPLACEMENT)
    for (let i = 1; i <= 8; i += 1) feed(feat((0.9 * i) / 8));
    feed(feat(0.9), 4);
    for (let i = 7; i >= 0; i -= 1) feed(feat((0.9 * i) / 8, 170));
    feed(feat(0, 170), 6); // on the seat before the next rep
  }
  const r = last.result;
  assert.equal(r.status, "completed");
  assert.equal(FA5X_TIMING_DEFINITION, "start_cue_to_fifth_seated");
  assert.equal(r.totalDurationMs, r.reps[4].seatedMs, "total = start cue -> 5th seated");
  for (const rep of r.reps) {
    assert.equal(rep.durationMs, rep.seatedMs - rep.riseOnsetMs, "rep = hip off the seat -> hip back on the seat");
    assert.ok(rep.riseOnsetMs < rep.standingMs && rep.standingMs < rep.seatedMs, "counted only across a full seated->standing->seated cycle");
  }
  const sum = r.repDurationsMs.reduce((x, y) => x + y, 0);
  const gaps = r.reps[0].riseOnsetMs + r.reps.slice(1).reduce((g, rep, i) => g + (rep.riseOnsetMs - r.reps[i].seatedMs), 0);
  assert.equal(sum + gaps, r.totalDurationMs, "total = Σ rep phases + reaction + seat / lean-start time");
  assert.ok(sum < r.totalDurationMs * 0.8, "Σ repDurationsMs is materially shorter than the total (e.g. 4.6 s vs 8.3 s)");
  assert.equal(FA5X_PARAMS.RISE_ONSET_DISPLACEMENT > FA5X_PARAMS.SEATED_RETURN_DISPLACEMENT_MAX, true);
}

// ── 2. Per-rep phase durations are never presented as full sit-to-stands ─
{
  const result = fnSource("fiveTimesSitToStandResultPage");
  assert.ok(!/第 \$\{i \+ 1\} 次|fmtFa5xSec\(ms\)|fa5x-rep-bar/.test(stripComments(result)));
  assert.ok(result.includes("本次完成紀錄") && result.includes("連續完成 ${completedReps} 次完整坐站"));
  const cmp = stripComments(fnSource("trackingComparisonPage"));
  assert.ok(!/每一次坐站時間|第 \$\{r\.repNumber\} 次/.test(cmp));
  for (const w of ["平均", "變異", "疲勞", "節奏", "一致性"]) assert.ok(!result.includes(w), `no new metric 「${w}」`);
}

// ── 3. Navigation: 5xSTS result 返回 follows the workflow ─────────────
{
  const header = fnSource("fiveTimesSitToStandResultPage");
  assert.ok(header.includes('onclick="${fa5xResultBackAction(session)}">返回</button>'));
  assert.ok(!/onclick="goFiveTimesSitToStandAssessment\(\)">返回/.test(header), "返回 never re-opens the pre-test page");
  const cycles = createCollection("trackingCycles");
  const st = { fa5xResultOrigin: "assessment" };
  const back = load("fa5xResultBackAction", { state: st, trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE });
  const s = (result, id = "s1") => ({ id, result });
  // A. initial result -> F01 entry (never the explanation / camera / countdown)
  assert.equal(back(s({ status: "completed" })), "goF01LowerLimbHome()");
  assert.equal(back(null), "goF01LowerLimbHome()");
  // E. entered from home / tracking -> home
  st.fa5xResultOrigin = "home";
  assert.equal(back(s({ status: "completed" })), "switchTab('home')");
  // F. linked reassessment -> its comparison; unlinked -> home
  cycles.create({ id: "nav-c1", userId: "u", reassessmentId: "re1" });
  assert.equal(back(s({ assessmentRole: REASSESSMENT_ROLE, trackingCycleId: "nav-c1" }, "re1")), "goTrackingComparison('nav-c1')");
  assert.equal(back(s({ assessmentRole: REASSESSMENT_ROLE, trackingCycleId: "nav-c1" }, "other")), "switchTab('home')");
  // next-cycle baseline -> home
  st.fa5xResultOrigin = "assessment";
  assert.equal(back(s({ assessmentRole: NEXT_CYCLE_BASELINE_ROLE })), "switchTab('home')");
  for (const r of [{}, { assessmentRole: REASSESSMENT_ROLE }, { assessmentRole: NEXT_CYCLE_BASELINE_ROLE }]) {
    assert.ok(!/goFiveTimesSitToStand(Assessment|Detection)/.test(back(s(r))), "no path back into the assessment");
  }
  // Entry contexts are set explicitly
  assert.ok(fnSource("finalizeFa5xAssessment").includes('goFiveTimesSitToStandResult(sessionId, "assessment")'));
  assert.ok(fnSource("goFiveTimesSitToStandResult").includes("if (origin) state.fa5xResultOrigin = origin;"), "returning from needs / recommendation keeps the origin");

  // B. training needs 返回 -> the assessment result
  assert.ok(fnSource("f01RecommendationSetupPage").includes(`onclick="goFiveTimesSitToStandResult('\${s.sourceAssessmentId}')">返回</button>`));
  // C. 修改訓練需求 -> training needs, pre-filled from the saved recommendation
  const recPage = fnSource("f01RecommendationResultPage");
  assert.ok(recPage.includes(`goF01RecommendationSetup('\${rec.sourceAssessmentId}', '\${rec.id}')">重新設定訓練需求`));
  const setupState = { };
  const recs = { "rec-1": { id: "rec-1", kind: "f01_goal", sourceAssessmentId: "a1", selectedGoalId: "G05", availableMinutes: 15, limitationIds: ["L03"] } };
  const goSetup = load("goF01RecommendationSetup", { state: setupState, recommendationService: { getById: (id) => recs[id] || null }, D5_PROPOSAL_ORIGIN: "d5_next_cycle", render: () => {} });
  goSetup("a1", "rec-1");
  assert.deepEqual(setupState.f01RecSetup, { sourceAssessmentId: "a1", selectedGoalId: "G05", availableMinutes: 15, limitationIds: ["L03"] });
  assert.equal(setupState.route, "f01RecommendationSetup");
  goSetup("a2", "rec-1");
  assert.equal(setupState.f01RecSetup.selectedGoalId, null, "never pre-filled from another assessment's recommendation");
  goSetup("a1");
  assert.equal(setupState.f01RecSetup.selectedGoalId, null, "first visit starts empty");
  // D. 返回評估結果 -> the assessment result
  assert.ok(recPage.includes(`goFiveTimesSitToStandResult('\${rec.sourceAssessmentId}'\${fromTracking ? ", 'home'" : ""})">返回評估結果`));
  // tracking 查看本週訓練 -> recommendation 返回 goes home
  assert.ok(fnSource("goTrackingWeekTraining").includes('state.f01RecResultOrigin = "tracking";'));
  assert.ok(recPage.includes(`\${sourceId && !fromTracking ? \`goFiveTimesSitToStandResult('\${sourceId}')\` : "switchTab('home')"}`));
  assert.ok(fnSource("generateF01RecommendationFromSetup").includes('state.f01RecResultOrigin = "setup";'));
  // G. D5 status check 返回 -> D4 comparison
  assert.ok(fnSource("d5StatusCheckPage").includes(`onclick="goTrackingComparison('\${s.cycleId}')">返回</button>`));
  // H. D5 proposal 修改狀況確認 -> status check of the SAME source cycle
  assert.ok(fnSource("d5ProposalPage").includes(`onclick="goD5StatusCheck('\${d5.sourceCycleId}')">修改狀況確認</button>`));
  // next_cycle_baseline result never enters the Phase C flow
  const resultPage = fnSource("fiveTimesSitToStandResultPage");
  const nextBaselineHtml = resultPage.slice(resultPage.indexOf("const nextBaselineHtml"), resultPage.indexOf("const nextHtml = isReassessment"));
  assert.ok(nextBaselineHtml.length > 50 && !/startRecommendationFromFiveTimesSitToStand|goF01RecommendationSetup/.test(nextBaselineHtml));
  assert.ok(fnSource("startRecommendationFromFiveTimesSitToStand").includes("session.result.assessmentRole === NEXT_CYCLE_BASELINE_ROLE"));
  // No browser-history based navigation that could land on a stale running state
  assert.ok(!/history\.back\(|history\.go\(/.test(stripComments(appJs)));
}

// ── 4. Assessment focus mode: no bottom nav while the camera test runs ──
{
  assert.ok(appJs.includes('if (state.route === "fiveTimesSitToStandDetection") app.innerHTML = phone(fiveTimesSitToStandDetectionPage(), false);'), "no bottom nav from positioning to the end of the run");
  assert.ok(appJs.includes('if (state.route === "fiveTimesSitToStandResult") app.innerHTML = phone(fiveTimesSitToStandResultPage(), true);'), "nav is back on the result page");
  assert.ok(appJs.includes('if (state.route === "fiveTimesSitToStandAssessment") app.innerHTML = phone(fiveTimesSitToStandAssessmentPage(), true);'), "explanation page (not running) keeps the nav");
  const detection = fnSource("fiveTimesSitToStandDetectionPage");
  assert.ok(detection.includes('onclick="exitFiveTimesSitToStandDetection()">返回</button>'), "the explicit exit (with its confirm while running) is the way out");
  const nav = { renderNav: () => "<nav class=\"bottom-nav\"></nav>", isTrainingSessionRoute: (r) => r === "detectionPrep" || /Detection$/.test(r || ""), exerciseResultMode: false, PAGE_ACTION_OPEN: "<!--page-action-->", PAGE_ACTION_CLOSE: "<!--/page-action-->" };
  const phoneFn = load("phone", { ...nav, state: { route: "dashboard" } });
  assert.ok(!phoneFn("x", false).includes("bottom-nav") && phoneFn("x", true).includes("bottom-nav"));
  // Core Mobile UX — a Training Session (AI preparation, any detection route) never shows the nav, even when asked
  for (const route of ["detectionPrep", "squatDetection", "le05Detection"]) assert.ok(!load("phone", { ...nav, state: { route } })("x", true).includes("bottom-nav"), route);
}

// ── 5. D5 draft never becomes the active recommendation ───────────────
{
  const u = "qa-draft";
  const catalog = exerciseService.listNormalized();
  const mk = (at, ms, role = null) => {
    const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
    return functionalAssessmentService.getById(s.id);
  };
  const baseline = mk([2026, 8, 28, 9, 0], 12000);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: r, createdBy: u }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: baseline, recommendation: rec }).cycle;
  const re = mk([2026, 9, 4, 20, 0], 8000, { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: baseline.id });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: "2026-10-04" });
  const draft = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: { hasNewOrWorseningDiscomfort: false, currentLimitations: [] }, catalog }).proposal;
  assert.equal(draft.status, "draft");
  // Draft created AFTER the Phase C record, so "newest" alone would pick it:
  assert.ok(new Date(draft.createdAt) >= new Date(rec.createdAt));
  assert.equal(recommendationService.getLatestF01GoalRecommendation(u).id, rec.id, "latest F01 recommendation ignores the draft");
  assert.equal(recommendationService.getLatestF01GoalRecommendation(u, { sourceAssessmentId: null }).id, rec.id);
  assert.equal(trackingCycleService.getTrackingCycleById(cycle.id).recommendationId, rec.id, "the cycle keeps its own recommendation");
  assert.equal(recommendationService.getByAssessmentId(baseline.id).length, 0, "legacy getTodaysRecommendation cache (assessmentId) never sees F01 / D5 records");
  assert.equal(draft.assessmentId, null);
  // Consumers read the CYCLE's recommendationId, never "latest" — source checks
  assert.ok(fnSource("renderTrackingCycleCard").includes("recommendationService.getById(cycle.recommendationId)"));
  assert.ok(fnSource("goTrackingWeekTraining").includes("goF01RecommendationResult(cycle.recommendationId)"));
  assert.ok(fnSource("armF01TrackingTraining").includes("cycle.recommendationId !== state.f01RecommendationId"));
  const svc = readFileSync(join(root, "js/data/trackingCycleService.js"), "utf8");
  assert.ok(/ensureDailyTrainingSnapshot[\s\S]*?recommendationService\.getById\(cycle\.recommendationId\)/.test(svc));
  // Accepted -> becomes current only then
  trackingCycleService.confirmD5Proposal({ proposalId: draft.id, userId: u, confirmationDateKey: "2026-10-04" });
  assert.equal(recommendationService.getLatestF01GoalRecommendation(u).id, draft.id);
}

// ── 6. Exercise images: every F01 mapping exists and is not shared ─────
{
  // The one mapping is the asset audit (js/data/exerciseAssets.js); app.js keeps no second table.
  const { EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
  assert.ok(!appJs.includes("EXERCISE_IMAGE_MAP"), "no second exerciseId -> image table in app.js");
  assert.equal(Object.keys(EXERCISE_ASSET_AUDIT).filter((id) => id.startsWith("F01-")).length, 20, "every F01 exercise keeps an audit entry");
  // UI asset backlog: no file yet (F01-03 靠牆半蹲 and F01-02 迷你深蹲 landed 2026-09-30).
  for (const id of ["F01-05", "F01-07", "F01-09"]) assert.equal(EXERCISE_ASSET_AUDIT[id].status, "missing", `${id} is still in the asset backlog`);
  const entries = Object.entries(EXERCISE_ASSET_AUDIT).filter(([id, a]) => id.startsWith("F01-") && a.file).map(([id, a]) => [id, a.file]);
  for (const [id, src] of entries) assert.ok(existsSync(join(root, "public", src)), `${id} image exists: ${src}`);
  const srcs = entries.map((e) => e[1]);
  assert.equal(new Set(srcs).size, srcs.length, "no two F01 exercises share one photo");
  assert.ok(!EXERCISE_ASSET_AUDIT["F01-09"].file || EXERCISE_ASSET_AUDIT["F01-09"].file !== EXERCISE_ASSET_AUDIT["F01-06"].file, "F01-09 never reuses F01-06's seated knee-extension photo");
}

// ── 7. Favicon (was the pre-login 404: /favicon.ico) ───────────────────
{
  const html = readFileSync(join(root, "index.html"), "utf8");
  const m = /<link rel="icon" type="image\/png" href="([^"]+)"/.exec(html);
  assert.ok(m && existsSync(join(root, "public", m[1])), "declared icon exists");
}

console.log("Flow & Data QA tests passed");
