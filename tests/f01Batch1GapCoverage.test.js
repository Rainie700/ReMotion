import assert from "node:assert/strict";
import { FA5X_CURRENT_MEASUREMENT_FIELDS as FA5X_M } from "../js/data/fa5xMeasurementCompatibility.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * F01 batch 1 — targeted coverage for two assertion groups that never run
 * because their test files stop at an EARLIER, pre-existing failure
 * (docs/verification/f01-batch1/VERIFICATION_REPORT.md, section 6):
 *
 *   A. tests/homeResultRedesign.test.js §4b — the home tracking card with a
 *      finished day. That file stops at its first card render
 *      (ReferenceError: weekSyntheticNote is not defined — the helper is not
 *      in its dependency list). Here the card is built with the SAME
 *      dependencies PLUS the real weekSyntheticNote and its real helpers.
 *   B. tests/exerciseExperience.test.js "app wiring" — the exercise detail CTA
 *      and the preparation page's 開啟鏡頭 entry (the file stops at line 41).
 *
 * The original files are not modified; their failing assertions stay as they are.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const DEMOL = await import("../js/ui/demoSyntheticLabel.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { createCollection } = await import("../js/data/storageService.js");

// same extractors as tests/homeResultRedesign.test.js
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => {
  const start = appJs.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `${name} exists`);
  return appJs.slice(start, appJs.indexOf(";\n", start) + 1);
};

// ── A. home tracking card — homeResultRedesign §4b ──────────────────────
let today = "2026-09-29";
const heroDeps = {
  // homeResultRedesign.test.js heroDeps, unchanged
  trackingCycleService, functionalAssessmentService, recommendationService,
  getTrackingCycleViewState: T.getTrackingCycleViewState, buildTrackingCardModel: T.buildTrackingCardModel,
  getDailyProgressView: T.getDailyProgressView, toLocalDateKey: T.toLocalDateKey, formatDateKeyMonthDay: T.formatDateKeyMonthDay,
  TRACKING_STATUS: T.TRACKING_STATUS, TRACKING_CYCLE_LENGTH_DAYS: T.TRACKING_CYCLE_LENGTH_DAYS,
  getFa5xResultStatus: (r) => r.status, FA5X_RESULT_STATUS: { COMPLETED: "completed" },
  fmtFa5xSec: (ms) => `${(ms / 1000).toFixed(1)} 秒`, getTrackingTodayKey: () => today,
  // the missing dependency: the REAL helpers used by app.js's weekSyntheticNote (no stub)
  describeWeekSynthetic: DEMOL.describeWeekSynthetic, DEMO_SYNTHETIC_TEXT: DEMOL.DEMO_SYNTHETIC_TEXT,
  // F01 batch 2: the card now formats completed days through these real helpers
  displayCompletedTrainingDays: (await import("../js/data/f01DailyTargets.js")).displayCompletedTrainingDays,
};
const hero = new Function(...Object.keys(heroDeps), `${constSource("TRACKING_CTA_FN")}\n${fnSource("weekSyntheticNote")}\n${fnSource("fmtF01TrainingDays")}\n${fnSource("getHomeTrackingCycle")}\n${fnSource("trackingCardState")}
${fnSource("renderTrackingCycleCard")}\n${fnSource("renderTrackingSecondaryActions")}\nreturn { renderTrackingCycleCard, renderTrackingSecondaryActions };`)(...Object.values(heroDeps));

const catalog = exerciseService.listNormalized();
function fiveXSts(userId, { ms, at }) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString() } });
  return functionalAssessmentService.getById(s.id);
}
/** homeResultRedesign.test.js initialization: baseline 09/28 8.9 s, G05 / 15 min, active cycle. */
function homeFixture(u) {
  const baseline = fiveXSts(u, { ms: 8900, at: [2026, 8, 28, 9, 0] });
  const recResult = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: recResult, createdBy: u }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: baseline, recommendation: rec }).cycle;
  return { baseline, rec, cycle };
}
const cycles = createCollection("trackingCycles");

// A1. §4b exactly as written: an older-format daily entry, finished -> status line + 查看本週訓練
{
  const u = "home-redesign";
  const { rec, cycle } = homeFixture(u);
  today = "2026-09-29";
  const ids = rec.items.map((it) => it.exerciseId);
  cycles.update(cycle.id, { dailyTrainingProgress: { "2026-09-29": { dateKey: "2026-09-29", requiredExerciseIds: ids, completedExerciseIds: ids, isComplete: true } }, completedTrainingDates: ["2026-09-29"] });
  const html = hero.renderTrackingCycleCard(u);
  assert.ok(html.includes("✓ 今日訓練已完成") && />查看本週訓練<\/button>/.test(html) && html.includes("1 天"), "§4b: older-format finished day");
}

// A2. the same day finished through the batch-1 path (frozen v2 snapshot, planDateKey, attempts)
{
  const u = "home-redesign-batch1";
  const { rec, cycle } = homeFixture(u);
  today = "2026-09-29";
  const ids = rec.items.map((it) => it.exerciseId);
  const prep = trackingCycleService.prepareF01FormalTraining({ cycleId: cycle.id, userId: u, recommendationId: rec.id, exerciseId: ids[0], dateKey: today });
  assert.equal(prep.ok, true);
  assert.equal(prep.targetRef, "frozen");
  ids.forEach((exerciseId, i) => {
    const record = analysisService.create(
      { id: `gap-a2-${i}`, patientId: u, exerciseId, completedAt: new Date(2026, 8, 29, 10, i).toISOString(), source: "self_practice", totalReps: 99, targetReps: 1, summary: { totalReps: 99, targetReps: 1, completed: true } },
      { executionContext: { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: cycle.id, recommendationId: rec.id, exerciseId, userId: u, planDateKey: today, trainingStartedAt: new Date(2026, 8, 29, 9, 50 + i).toISOString() } },
    );
    assert.equal(trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: u, exerciseId, analysisRecord: record }).entry.dateKey, today);
    assert.equal(trackingCycleService.recordTrainingAttempt({ userId: u, analysisRecord: record }).created, true);
  });
  const entry = trackingCycleService.getTrackingCycleById(cycle.id).dailyTrainingProgress[today];
  assert.equal(entry.snapshotVersion, 2);
  assert.equal(Object.keys(entry.attempts).length, ids.length);
  const html = hero.renderTrackingCycleCard(u);
  assert.ok(html.includes("✓ 今日訓練已完成") && />查看本週訓練<\/button>/.test(html) && html.includes("1 天"), "§4b meaning holds for a batch-1 snapshot");
}

// ── B. exercise detail / preparation wiring — exerciseExperience "app wiring" ──
// same extractor as tests/exerciseExperience.test.js (body starts after the parameter list)
const fnSourceEE = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `app.js has ${name}`);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
{
  const detail = fnSourceEE("exerciseDetailPage");
  // exerciseExperience.test.js lines 95–96, verbatim
  assert.ok(detail.includes("buildExerciseExperience(catalog, { planItem: ex })") && detail.includes("renderExerciseDetailView(model"), "detail = shared adapter + renderer");
  assert.ok(detail.includes('onclick="goDetectionPrep()"') && detail.includes("getExerciseReturnRoute(\"listing\")"), "CTA + context-derived return");
  // the detail CTA reaches the batch-1 preparation stage before anything resolves the amount
  const goPrep = fnSource("goDetectionPrep");
  assert.ok(goPrep.indexOf("prepareF01FormalTrainingTarget()") >= 0 && goPrep.indexOf("prepareF01FormalTrainingTarget()") < goPrep.indexOf("getExercisePageContext()"));

  const prep = fnSourceEE("detectionPrepPage");
  // the batch-relevant part of the exerciseExperience.test.js preparation assertion: 開啟鏡頭 -> openCameraPlaceholder()
  assert.ok(prep.includes('onclick="openCameraPlaceholder()">開啟鏡頭'), "preparation page camera entry");
  assert.ok(prep.includes("moreHtml: analysisNoticeHtml"), "analyzer notice kept (folded)");
  // the inline onclick resolves the GLOBAL name -> it must be the final-check wrapper
  const wrapperAt = appJs.lastIndexOf("openCameraPlaceholder = function");
  assert.ok(appJs.slice(wrapperAt, wrapperAt + 200).includes("isF01FormalTrainingContext() && !passF01FinalCheck()"));
  assert.ok(appJs.lastIndexOf("window.openCameraPlaceholder = openCameraPlaceholder;") > wrapperAt, "window.openCameraPlaceholder is the final-check wrapper");
  assert.ok(![...appJs.matchAll(/window\.openCameraPlaceholder\s*=/g)].some((m) => m.index > appJs.lastIndexOf("window.openCameraPlaceholder = openCameraPlaceholder;")), "nothing re-assigns it afterwards");
}

console.log("F01 batch 1 gap coverage (homeResultRedesign §4b, exerciseExperience app wiring) tests passed");
