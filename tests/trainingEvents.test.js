process.env.TZ = "Asia/Taipei"; // local-date semantics are asserted for the app's real audience

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Cross-Module Integration I-1 — canonical Training Event layer:
 * explicit source at write time, read-time legacy normalization (explicit
 * linkage only), one event per record, local dates, this-week summary, the
 * Data page F01 section and the records source filter. D3 completion is untouched.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const analysisSrc = readFileSync(join(root, "js/data/analysisService.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const { analysisService, withTrainingSourceFields } = await import("../js/data/analysisService.js");
const E = await import("../js/data/trainingEventService.js");
const { functionalProgressService, buildAssessmentSeries } = await import("../js/data/functionalProgressService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const fnBody = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
let n = 0;
const rec = (over = {}) => ({ id: `r${++n}`, patientId: "u1", exerciseId: "F01-17", exerciseName: "雙腳提踵", completedAt: "2026-09-29T02:00:00.000Z", createdAt: "2026-09-29T02:00:00.000Z", totalReps: 10, targetReps: 10, summary: { totalReps: 10, targetReps: 10 }, score: 80, ...over });
const f01Ctx = { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: "c1", recommendationId: "rec1", exerciseId: "F01-17", userId: "u1" };

// ── 1. Source model at write time (explicit context / explicit record fields only) ──
{
  const f01 = withTrainingSourceFields(rec({ source: "self_practice" }), f01Ctx);
  assert.deepEqual([f01.sourceType, f01.sourceSubtype, f01.trackingCycleId, f01.recommendationId], ["remotion", "f01_cycle", "c1", "rec1"]);

  const therapist = withTrainingSourceFields(rec({ source: "assigned", scheduleId: "s1" }));
  assert.deepEqual([therapist.sourceType, therapist.sourceSubtype, therapist.therapistPlanId], ["therapist", "therapist_plan", "s1"]);

  const self = withTrainingSourceFields(rec({ source: "self_practice" }));
  assert.deepEqual([self.sourceType, self.sourceSubtype], ["self", "self_selected"]);

  const none = withTrainingSourceFields(rec());
  assert.equal(none.sourceType, undefined, "nothing explicit -> nothing written (read-time legacy_unknown)");

  // A context that does not match the record is never applied.
  const origWarn = console.warn; console.warn = () => {};
  assert.equal(withTrainingSourceFields(rec({ source: "self_practice", exerciseId: "F01-18" }), f01Ctx).sourceType, "self", "other exercise -> context ignored");
  assert.equal(withTrainingSourceFields(rec({ source: "self_practice", patientId: "u2" }), f01Ctx).sourceType, "self", "other user -> context ignored");
  assert.equal(withTrainingSourceFields(rec({ source: "assigned", scheduleId: "s9" }), f01Ctx).sourceType, "therapist", "a schedule link is never overridden by a ReMotion context");
  assert.equal(withTrainingSourceFields(rec({ source: "self_practice" }), { ...f01Ctx, trackingCycleId: null }).sourceType, "self", "f01_cycle context needs its cycle id");
  assert.equal(withTrainingSourceFields(rec({ source: "self_practice" }), { ...f01Ctx, sourceSubtype: "therapist_plan" }).sourceType, "self", "invalid type/subtype pair rejected");
  console.warn = origWarn;

  // Same exercise, different explicit linkage -> different sources (never by exerciseId).
  const a = withTrainingSourceFields(rec({ exerciseId: "F01-04", source: "assigned", scheduleId: "s2" }));
  const b = withTrainingSourceFields(rec({ exerciseId: "F01-04", source: "self_practice" }));
  assert.notEqual(a.sourceType, b.sourceType);

  // create() itself never reads app state / the active cycle.
  const createFn = stripComments(analysisSrc.slice(analysisSrc.indexOf("export function withTrainingSourceFields"), analysisSrc.indexOf("export const analysisService")));
  assert.ok(!/state\.|getActiveTrackingCycle|trackingCycleService|window\.|exerciseId\s*===\s*"/.test(createFn), "no guessing inside the write path");
}

// ── 2. Local date semantics (same rule as D1), never UTC slicing ──
{
  const late = withTrainingSourceFields(rec({ completedAt: "2026-09-28T17:30:00.000Z", createdAt: "2026-09-28T17:30:00.000Z" }));
  assert.equal(late.localDateKey, "2026-09-29", "01:30 in Taipei is 09/29 (UTC slice would say 09/28)");
  assert.equal(late.localDateKey, T.toLocalDateKey(late.completedAt));
  assert.equal(E.recordLocalDateKey({ completedAt: "2026-09-28T17:30:00.000Z" }), "2026-09-29", "legacy records get the same local date at read time");
  const tes = stripComments(readFileSync(join(root, "js/data/trainingEventService.js"), "utf8"));
  assert.ok(!/\.slice\(0, 10\)|trackingToday/.test(tes), "no UTC slicing, no debug date");
}

// ── 3. Legacy normalization: explicit linkage only ──
{
  const cycles = [{ id: "c1", userId: "u1", recommendationId: "rec1", dailyTrainingProgress: { "2026-09-29": { recommendationId: "rec1", exerciseCompletions: { "F01-17": { analysisRecordId: "legacy-f01" } } } } }];
  const idx = E.buildCycleCompletionIndex(cycles);
  const norm = (r) => E.normalizeTrainingEvent(r, { cycleIndex: idx });
  assert.deepEqual([norm(rec({ id: "legacy-f01", source: "self_practice" })).sourceType, norm(rec({ id: "legacy-f01", source: "self_practice" })).sourceSubtype, norm(rec({ id: "legacy-f01", source: "self_practice" })).trackingCycleId], ["remotion", "f01_cycle", "c1"], "cycle reverse linkage -> f01_cycle");
  assert.equal(norm(rec({ source: "assigned", scheduleId: "s1" })).sourceType, "therapist");
  assert.equal(norm(rec({ source: "self_practice" })).sourceType, "self", "same exercise, no linkage -> self (explicit flag)");
  assert.equal(norm(rec()).sourceType, "legacy_unknown", "no source field -> legacy_unknown (NOT assigned like getRecordSource)");
  assert.equal(norm(rec()).sourceLabel, "既有訓練");
  assert.equal(norm(rec({ id: "legacy-f01", patientId: "someone-else", source: "self_practice" })).sourceType, "self", "a link to another user's cycle is ignored");
  assert.equal(norm(rec({ sourceType: "self", sourceSubtype: "self_selected", id: "legacy-f01" })).sourceType, "self", "a source written at create time wins");
  // old records never crash
  assert.equal(E.normalizeTrainingEvent({ id: "bare" }).sourceType, "legacy_unknown");
  assert.equal(E.normalizeTrainingEvent(null), null);
}

// ── 4. One record -> one canonical event; completion = D3 definition ──
{
  const u = "evt-user";
  analysisService.create(rec({ id: "e1", patientId: u, source: "self_practice" }));
  analysisService.create(rec({ id: "e2", patientId: u, source: "self_practice", totalReps: 3, summary: { totalReps: 3, targetReps: 10 } })); // stopped early
  const events = E.trainingEventService.listTrainingEvents(u);
  assert.equal(events.length, 2, "one event per record");
  assert.deepEqual(E.trainingEventService.listTrainingEvents(u).map((e) => e.eventId), events.map((e) => e.eventId), "re-reading never duplicates");
  assert.equal(events.find((e) => e.eventId === "e1").completed, true);
  assert.equal(events.find((e) => e.eventId === "e2").completed, false, "a saved record is not automatically a completed training");
  assert.equal(analysisService.getById("e1").localDateKey, "2026-09-29", "localDateKey persisted at write time");
}

// ── 5. This-week summary: completed only, this week's average only, "—" when none ──
{
  const today = "2026-10-01";
  // canonical (new) records: written through the same write-time normalization as create()
  const mk = (id, dateIso, extra = {}) => E.normalizeTrainingEvent(withTrainingSourceFields(rec({ id, completedAt: dateIso, createdAt: dateIso, source: "self_practice", ...extra })));
  const none = E.summarizeTrainingWeek([mk("old", "2026-09-01T02:00:00.000Z", { score: 59 })], today);
  assert.deepEqual([none.completedCount, none.trainingDays, none.averagePoseScore], [0, 0, null], "0 this week -> no fake average from history");
  assert.equal(none.latestPoseScore.score, 59, "the latest score is reported separately");
  const evs = [
    mk("w1", "2026-09-30T02:00:00.000Z", { score: 70 }),
    mk("w2", "2026-09-30T05:00:00.000Z", { score: 90, source: "assigned", scheduleId: "s1" }),
    mk("w3", "2026-09-26T02:00:00.000Z", { score: null, overallScore: undefined }),
    mk("w4", "2026-09-29T02:00:00.000Z", { score: 10, totalReps: 1, summary: { totalReps: 1, targetReps: 10 } }), // incomplete
    mk("w5", "2026-09-24T02:00:00.000Z", { score: 20 }), // outside the 7-day window
  ];
  const s = E.summarizeTrainingWeek(evs, today);
  assert.equal(s.startKey, "2026-09-25");
  assert.equal(s.completedCount, 3);
  assert.equal(s.trainingDays, 2);
  assert.equal(s.averagePoseScore, 80, "(70 + 90) / 2 — unscored, incomplete and out-of-window events excluded");
  assert.deepEqual(s.bySource, { therapist: 1, remotion: 0, self: 2, legacy_unknown: 0 });
  assert.equal(E.filterTrainingEventsBySource(evs, "therapist").length, 1);
  assert.equal(E.filterTrainingEventsBySource(evs, "all").length, 5);
}

// ── 6. F01 completion is untouched: only D3's explicit path adds a training day ──
{
  const u = "f01-guard";
  const catalog = exerciseService.listNormalized();
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, totalDurationMs: 9000, measuredAt: new Date(2026, 8, 28, 9).toISOString() } });
  const baseline = functionalAssessmentService.getById(s.id);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 10, catalog });
  const recommendation = recommendationService.createF01GoalRecommendation({ patientId: u, result: r }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: baseline, recommendation }).cycle;
  const exerciseId = recommendation.items[0].exerciseId;
  // self practice and a therapist session of the SAME exercise on a cycle day
  analysisService.create({ id: "self-same", patientId: u, exerciseId, source: "self_practice", completedAt: new Date(2026, 8, 29, 10).toISOString(), totalReps: 10, targetReps: 10, summary: { totalReps: 10, targetReps: 10 } });
  analysisService.create({ id: "ther-same", patientId: u, exerciseId, source: "assigned", scheduleId: "sch", completedAt: new Date(2026, 8, 29, 11).toISOString(), totalReps: 10, targetReps: 10, summary: { totalReps: 10, targetReps: 10 } });
  assert.deepEqual(trackingCycleService.getTrackingCycleById(cycle.id).completedTrainingDates, [], "self / therapist records never add F01 days");
  // the explicit F01 path (D3) still works and the record is tagged with the same cycle
  const f01Record = analysisService.create({ id: "f01-real", patientId: u, exerciseId, source: "self_practice", completedAt: new Date(2026, 8, 29, 12).toISOString(), totalReps: 10, targetReps: 10, summary: { totalReps: 10, targetReps: 10 } },
    { executionContext: { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: cycle.id, recommendationId: recommendation.id, exerciseId, userId: u } });
  trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: u, exerciseId, analysisRecord: f01Record });
  assert.deepEqual(trackingCycleService.getTrackingCycleById(cycle.id).completedTrainingDates, ["2026-09-29"]);
  const events = E.trainingEventService.listTrainingEvents(u);
  assert.equal(events.find((e) => e.eventId === "f01-real").sourceSubtype, "f01_cycle");
  assert.equal(events.find((e) => e.eventId === "self-same").sourceType, "self");
  assert.equal(events.find((e) => e.eventId === "ther-same").sourceType, "therapist");
  // app wiring: the F01 context is built under exactly the D3 attribution condition
  const opts = fnBody("trainingRecordOptions");
  assert.ok(opts.includes('state.navigationOrigin === "f01Recommendation"') && opts.includes("state.f01TrainingContext"));
  assert.ok(appJs.includes('if (!ctx || state.navigationOrigin !== "f01Recommendation") return;'), "D3 listener unchanged");
  // every detector write passes the explicit context argument
  const creates = (appJs.match(/analysisService\.create\(\{/g) || []).length;
  assert.ok(creates >= 60);
  assert.equal((appJs.match(/\}, trainingRecordOptions\(\)\)/g) || []).length, creates, "all training-record writes carry trainingRecordOptions()");

  // ── 7. Functional progress: valid completed 5xSTS totalDurationMs only ──
  const mk = (status, ms, day, role = null) => {
    const x = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(x.id, { result: { status, repCount: status === "completed" ? 5 : 2, totalDurationMs: ms, repDurationsMs: [1, 1, 1, 1, 1], measuredAt: new Date(2026, 9, day, 9).toISOString(), ...(role || {}) } });
    return functionalAssessmentService.getById(x.id);
  };
  mk("incomplete", null, 3);
  mk("invalid", null, 3);
  const re = mk("completed", 8200, 4, { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: baseline.id });
  let p = functionalProgressService.getFunctionalProgress(u, "2026-09-30");
  assert.equal(p.currentCycle.cycle.id, cycle.id);
  assert.equal(p.currentCycle.view.cycleDay, 3);
  assert.equal(p.currentCycle.baselineMs, 9000);
  assert.equal(p.currentCycle.completedTrainingDays, 1);
  // Data showcase cleanup — the trend is the formal tracking chain (baseline + reassessment
  // per cycle), not every completed 5xSTS: before the reassessment is linked, only the baseline.
  assert.deepEqual(p.assessmentSeries.map((x) => x.totalDurationMs), [9000], "tracking chain only (unlinked run excluded)");
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: "2026-10-04" });
  p = functionalProgressService.getFunctionalProgress(u, "2026-10-04");
  assert.deepEqual(p.assessmentSeries.map((x) => x.totalDurationMs), [9000, 8200], "baseline + reassessment, in measurement order");
  assert.equal(p.currentCycle.comparison.baselineText, "9.0 秒");
  assert.equal(p.currentCycle.comparison.reassessmentText, "8.2 秒");
  assert.equal(p.completedCycles.length, 1);
  assert.equal(buildAssessmentSeries([{ id: "x", status: "completed", result: { status: "completed", repCount: 5, totalDurationMs: 0 } }]).length, 0);
  const fps = stripComments(readFileSync(join(root, "js/data/functionalProgressService.js"), "utf8"));
  assert.ok(!/repDurationsMs/.test(fps), "the series never uses rep durations");
}

// ── 8. Data page + records page wiring ──
{
  const ov = fnBody("patientDataOverviewPage");
  assert.ok(ov.includes("const realTodayKey = toLocalDateKey(new Date());") && ov.includes("gamificationEngine.getWeeklyTrainingSummary(patientId, realTodayKey)"), "weekly stats use the REAL local date and the shared weekly summary");
  assert.ok(ov.indexOf("${functionalHtml}") < ov.indexOf("${weekHtml}"), "功能追蹤 comes first");
  assert.ok(ov.includes('week.averageAiPoseScore != null ? week.averageAiPoseScore : "—"') && ov.includes("最近一次 AI 姿勢分數"));
  assert.ok(!/平均品質|訓練品質|本週總覽/.test(ov), "no 品質 wording on the Data overview");
  const f01 = stripComments(fnBody("renderDataFunctionalSection") + fnBody("renderF01DurationChart"));
  for (const w of ["改善", "退步", "療效", "正常", "異常", "repDurationsMs"]) assert.ok(!f01.includes(w), `no 「${w}」`);
  assert.ok(f01.includes("goTrackingComparison(") && f01.includes("totalDurationMs"));
  const chips = fnBody("getTrainingHistorySourceChips");
  for (const label of ["全部", "TRAINING_SOURCE_LABEL.therapist", "TRAINING_SOURCE_LABEL.remotion", "TRAINING_SOURCE_LABEL.self"]) assert.ok(chips.includes(label));
  assert.ok(fnBody("normalizeTrainingSource").includes("normalizeTrainingEvent(record, { cycleIndex: buildCycleCompletionIndex(cycles) })"));
  assert.deepEqual(E.TRAINING_SOURCE_LABEL, { therapist: "復健師安排", remotion: "ReMotion 建議", self: "自主練習", legacy_unknown: "既有訓練" });
  assert.ok(!/createCollection\(\s*["'`]trainingEvents/.test(appJs + readFileSync(join(root, "js/data/trainingEventService.js"), "utf8")), "no new collection");
}

console.log("Cross-Module I-1 training event tests passed");
