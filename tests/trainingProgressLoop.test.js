import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion 7.7 (CORE) — AI Training -> Progress -> Data closed-loop guards.
 *
 * The shortest real patient loop, using the most mature AI exercise
 * (LE01 深蹲):
 *   Today's Training -> recommended AI exercise -> exercise detail ->
 *   開始 AI 動作偵測 -> real MediaPipe squat -> reps + feedback ->
 *   completion -> result (XP once, persisted analysisRecord) ->
 *   back to Today's Training (progress updated) -> 數據 tab shows the record ->
 *   survives reload.
 *
 * Part 1  pure: the recommendation engine surfaces LE01, LE01 is genuinely
 *         AI-supported and maps to the SQUAT analyzer, a catalog-only
 *         exercise does not (Tests A, J).
 * Part 2  pure: the existing squat detector counts reps and the existing
 *         scorer produces a score (Tests C, D, L).
 * Part 3  pure: a completed session persists exactly one analysisRecord and
 *         it survives a reload; the same-day self_practice record is what
 *         marks the recommendation item complete (Tests B, F, G, H, I).
 * Part 4  static app.js: the loop is wired end to end, XP is one-shot, the
 *         數據 tab shows the real records page, the result offers
 *         返回今日練習 + 查看訓練紀錄, therapist flow untouched
 *         (Tests A, B, E, F, I, N).
 */

// ── localStorage polyfill for the data services ────────────────────
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Part 1 — recommendation surfaces a real AI exercise (A, J) ──────
{
  const { generateRecommendationForAssessment } = await import("../js/data/recommendationEngine.js");
  const { exerciseService, normalizeExercise, resolvePoseAnalyzer, POSE_ANALYZER, SQUAT_EXERCISE_ID } = await import(
    "../js/data/exerciseService.js"
  );

  assert.equal(SQUAT_EXERCISE_ID, "LE01", "LE01 is the squat exercise id");

  // A — a 下肢 / 肌力 / 初階 self-rehab request produces a session containing LE01.
  const assessment = {
    id: "tp_assess_1",
    updatedAt: "2026-09-02T00:00:00.000Z",
    bodyParts: ["下肢"],
    goals: ["肌力"],
    abilityLevel: "beginner",
    preferredSessionMinutes: 15,
  };
  const candidates = exerciseService.listNormalizedWithKnownGoals();
  const session = generateRecommendationForAssessment(assessment, candidates, {
    patientId: "tp_p1",
    assessmentId: "tp_assess_1",
    dateStr: "2026-09-02",
  });
  const le01 = session.items.find((it) => it.exerciseId === "LE01");
  assert.ok(le01, "recommendation session contains LE01 深蹲");
  assert.ok(le01.aiSupported === true, "the recommended LE01 item is flagged aiSupported");

  // LE01 genuinely maps to the implemented SQUAT analyzer.
  const le01Norm = normalizeExercise({ exercise_id: "LE01", exercise_name: "深蹲", category: "下肢", difficulty: "易" });
  assert.equal(le01Norm.aiSupported, true, "normalizeExercise marks LE01 aiSupported");
  assert.equal(resolvePoseAnalyzer({ exercise_id: "LE01" }), POSE_ANALYZER.SQUAT, "LE01 -> SQUAT analyzer");

  // J — a catalog-only exercise with no detector must NOT gain fake AI support.
  const catalogOnly = { exercise_id: "SH08", exercise_name: "毛巾操", category: "上肢肩部", difficulty: "易" };
  assert.equal(normalizeExercise(catalogOnly).aiSupported, false, "an unimplemented catalog exercise is not aiSupported");
  assert.equal(resolvePoseAnalyzer(catalogOnly), null, "an unimplemented catalog exercise has no pose analyzer");
}

// ── Part 2 — existing squat detector + scorer (C, D, L) ────────────
{
  const { createSquatSession } = await import("../js/ai/squatSession.js");
  const { calculateSquatScore } = await import("../js/ai/squatScore.js");
  const { SQUAT_THRESHOLDS } = await import("../js/ai/squatConstants.js");

  const s = createSquatSession(3, SQUAT_THRESHOLDS);
  // one clean standing -> bottom -> standing cycle spanning > MIN_REP_DURATION_MS
  const frames = [
    [0, 170], [100, 150], [300, 90], [600, 110], [1000, 160], [1150, 162],
  ];
  let completed = 0;
  for (const [timestamp, avgKneeAngle] of frames) {
    const r = s.processFrame({ avgKneeAngle, timestamp });
    if (r.repCompleted) completed += 1;
  }
  assert.equal(completed, 1, "the existing squat state machine counted exactly one rep");
  const summary = s.getSummary();
  assert.equal(summary.totalReps, 1, "getSummary().totalReps comes from the detector, not a fabricated value");
  assert.equal(summary.targetReps, 3);

  const { score, quality } = calculateSquatScore(summary);
  assert.ok(typeof score === "number" && score >= 0 && score <= 100, "existing scorer returns a 0-100 score");
  assert.ok(typeof quality === "string" && quality.length > 0, "existing scorer returns a quality label");
}

// ── Part 3 — one persisted record, reload-safe, marks completion ───
{
  const { analysisService, ANALYSIS_RECORD_SOURCES, getRecordSource } = await import("../js/data/analysisService.js");
  const PID = "tp_loop_patient";
  const today = "2026-09-02";

  const before = analysisService.getByPatientId(PID).length;
  const rec = analysisService.create({
    id: "analysis_tp_1",
    patientId: PID,
    therapistId: null,
    scheduleId: null,
    exerciseId: "LE01",
    exerciseName: "深蹲",
    completedAt: `${today}T09:00:00.000Z`,
    createdAt: `${today}T09:00:00.000Z`,
    analysisMode: "mediapipe_squat",
    source: ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,
    totalReps: 10,
    targetReps: 10,
    validReps: 8,
    score: 82,
    overallScore: 82,
    quality: "good",
    remark: "動作大致正確",
  });
  assert.ok(rec && rec.id, "analysisService.create persisted the session");
  assert.equal(analysisService.getByPatientId(PID).length, before + 1, "exactly one new analysisRecord");

  // I / H — a fresh import reads the SAME localStorage-backed collection.
  const fresh = (await import("../js/data/analysisService.js?reload=1")).analysisService;
  const reread = fresh.getByPatientId(PID);
  assert.equal(reread.length, 1, "the persisted record survives a reload");
  assert.equal(reread[0].exerciseId, "LE01");
  assert.equal(reread[0].score, 82, "persisted score is intact after reload");

  // F / G — the recommendation-completion predicate (same shape as
  // app.js isRecommendationItemCompleted): any same-day self_practice
  // analysisRecord for that exerciseId.
  const isCompleted = (exerciseId, dateStr, patientId) =>
    fresh.getByPatientId(patientId).some(
      (r) =>
        r.exerciseId === exerciseId &&
        getRecordSource(r) === "self_practice" &&
        (r.completedAt || r.createdAt || "").slice(0, 10) === dateStr
    );
  assert.equal(isCompleted("LE01", today, PID), true, "the completed LE01 session marks the recommendation item done");
  assert.equal(isCompleted("LE01", "2026-09-03", PID), false, "a different day is not falsely counted");
  assert.equal(isCompleted("LE05", today, PID), false, "a different exercise is not falsely counted");
}

// ── Part 4 — app.js static wiring ─────────────────────────────────
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected to find ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + 6000 : end + 2);
};

// A — recommendation card -> exercise detail -> detection prep -> squat.
assert.ok(
  /onclick="goRecommendationExerciseDetail\('\$\{item\.exerciseId\}'\)"/.test(appJs),
  "recommendation item card opens the exercise detail"
);
{
  const g = sliceFn("function goRecommendationExerciseDetail(");
  assert.ok(/state\.navigationOrigin = "recommendation"/.test(g));
  assert.ok(/state\.route = "exerciseDetail"/.test(g));
}
{
  const d = sliceFn("function exerciseDetailPage()");
  assert.ok(/onclick="goDetectionPrep\(\)"/.test(d), "exercise detail CTA enters detection prep");
}
{
  const o = sliceFn("function openCameraPlaceholder()");
  assert.ok(/analyzer === POSE_ANALYZER\.SQUAT\) return goSquatDetection\(\)/.test(o), "SQUAT analyzer -> real squat detection");
}

// B / E — one persisted record + XP awarded exactly once.
{
  const p = sliceFn("function persistSquatSession()");
  assert.equal((p.match(/analysisService\.create\(\{/g) || []).length, 1, "persistSquatSession creates exactly one analysisRecord");
  assert.ok(/if \(squatSessionFinalized \|\| !meta\)/.test(p), "re-entry guard: already finalized -> no second record/XP");
  assert.ok(/squatSessionFinalized = true;/.test(p), "the session is marked finalized after persisting");
  assert.ok(/ex\.status === "completed"/.test(p), "an already-completed assigned exercise never double-persists");
  assert.ok(/gamificationEngine\.computeSessionXp\(record\)/.test(p), "XP is derived from the persisted record (idempotent)");
}
{
  const d = sliceFn("function exerciseDetailPage()");
  assert.ok(/state\.rewardFeedback = null;/.test(d), "the reward panel is one-shot — cleared on render so XP is shown once");
}

// F — Today's Training shows a persistent completion count.
{
  const page = sliceFn("function todaysRecommendationPage()");
  assert.ok(/已完成 \$\{completedCount\} \/ \$\{enrichedItems\.length\}/.test(page), "Today's Training shows 已完成 X / Y");
  assert.ok(
    /isRecommendationItemCompleted\(it\.exerciseId, recommendationDateStr, patientId\)/.test(page),
    "completion state is derived per item from persisted records"
  );
  assert.ok(/aiSupported: !!\(ex && ex\.aiSupported\)/.test(page), "the card's AI badge reflects the real catalog flag (J)");
}
{
  const c = sliceFn("function isRecommendationItemCompleted(");
  assert.ok(/analysisService\.getByPatientId\(patientId\)/.test(c) && /"self_practice"/.test(c), "completion check reads persisted self_practice records");
}

// I — the 數據 tab shows a REAL analysisService dashboard, not the hardcoded mock.
{
  const rd = sliceFn("function renderDashboard()");
  assert.ok(/state\.tab === "data"/.test(rd));
  assert.ok(/patientDataOverviewPage\(\)/.test(rd), "數據 tab renders the real Data dashboard");
  assert.ok(!/\?\s*dataPage\(\)/.test(rd), "the hardcoded-mock dataPage() is no longer what the tab renders");
  const ov = sliceFn("function patientDataOverviewPage()");
  assert.ok(/analysisService\.getByPatientId\(patientId\)/.test(ov), "Data overview is backed by real persistence");
  const ar = sliceFn("function actionRecordsPage()");
  assert.ok(/analysisService\.getByPatientId\(patientId\)/.test(ar), "訓練紀錄 list is backed by real persistence");
}

// section 3 — the completed-training result offers both CTAs, no dead end.
{
  const r = sliceFn("function renderRewardFeedbackPanel(");
  assert.ok(/onclick="goActionRecords\(\)"[^]*查看訓練紀錄/.test(r), "result offers 查看訓練紀錄");
  assert.ok(/navigationOrigin === "recommendation"[^]*goTodaysRecommendation\(\)[^]*返回今日練習/.test(r), "recommendation-origin result offers 返回今日練習");
}

// N — patient Data tab is unaffected by the Therapist Workspace V2 change.
{
  const rd = sliceFn("function renderDashboard()");
  assert.ok(/state\.tab === "data"[^]*state\.user\.role === "patient" \? patientDataOverviewPage\(\) : therapistPlansPage\(\)/.test(rd),
    "patient 數據 = Data V2 dashboard; therapist 數據 = 計畫 overview");
  assert.ok(/state\.user\.role === "patient" \? todaySchedulePage\(\) : therapistCaseListPage\(\)/.test(rd),
    "patient 訓練 tab unchanged; therapist 個案 tab = the real case list");
}
assert.ok(/assignPlanPage = function\(\)/.test(appJs), "therapist assign-plan flow still present (unchanged)");

// squat AI engine modules are untouched (imported, not rewritten).
for (const imp of [
  'from "./js/ai/squatSession.js"',
  'from "./js/ai/squatScore.js"',
  'from "./js/ai/squatConstants.js"',
]) {
  assert.ok(appJs.includes(imp), `app.js still imports ${imp} (no detector rewrite)`);
}

console.log("ReMotion 7.7 AI training -> progress -> data closed-loop guards passed");
