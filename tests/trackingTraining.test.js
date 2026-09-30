import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Phase D3 — training completion records + completed training days.
 * Completion comes from EXISTING training analysisRecords; dates come from
 * each record's own completedAt (never the real current date, never the
 * ?trackingToday= debug override).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const serviceSrc = readFileSync(join(root, "js/data/trackingCycleService.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");

const S = T.TRACKING_STATUS;
const D1 = [2026, 8, 28], D2 = [2026, 8, 29], D3 = [2026, 8, 30], D4 = [2026, 9, 1], D7 = [2026, 9, 4];
const key = ([y, m, d]) => T.toLocalDateKey(new Date(y, m, d, 12, 0));
let seq = 0;

function baseline(userId) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { status: "completed", completedReps: 5, repCount: 5, totalDurationMs: 8900, measuredAt: new Date(...D1, 14, 0).toISOString() } });
  return functionalAssessmentService.getById(s.id);
}
function saveRec(userId, session, goalId, minutes) {
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: session.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goalId, availableMinutes: minutes, catalog: exerciseService.listNormalized() });
  return recommendationService.createF01GoalRecommendation({ patientId: userId, result: r, createdBy: userId }).recommendation;
}
function startCycle(userId, goalId = "G01", minutes = 20) {
  const b = baseline(userId);
  const rec = saveRec(userId, b, goalId, minutes);
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId, baselineSession: b, recommendation: rec }).cycle;
  return { b, rec, cycle, ids: rec.items.map((i) => i.exerciseId) };
}
/** A training analysisRecord as the detectors save it (completed = target reached). */
function training(userId, exerciseId, day, { completed = true, hour = 10 } = {}) {
  seq += 1;
  return analysisService.create({
    id: `analysis-test-${seq}`,
    patientId: userId,
    exerciseId,
    completedAt: new Date(...day, hour, seq % 60).toISOString(),
    source: "self_practice",
    totalReps: completed ? 10 : 3,
    targetReps: 10,
    summary: { totalReps: completed ? 10 : 3, targetReps: 10, completed },
  });
}
const rec = (userId, cycle, exerciseId, day, opts) =>
  trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId, exerciseId, analysisRecord: training(userId, exerciseId, day, opts) });
const getCycle = (c) => trackingCycleService.getTrackingCycleById(c.id);

// ── 1. completion rule for an existing training record ───────────────────
{
  assert.equal(T.isTrainingRecordCompleted({ summary: { completed: true }, totalReps: 2, targetReps: 10 }), true, "detector summary.completed wins (per-side targets)");
  assert.equal(T.isTrainingRecordCompleted({ summary: { completed: false }, totalReps: 20, targetReps: 10 }), false);
  assert.equal(T.isTrainingRecordCompleted({ totalReps: 10, targetReps: 10 }), true, "fallback: target reached");
  assert.equal(T.isTrainingRecordCompleted({ totalReps: 9, targetReps: 10 }), false, "stopped early = not completed");
  assert.equal(T.isTrainingRecordCompleted({ totalReps: 0, targetReps: 0 }), false);
  assert.equal(T.isTrainingRecordCompleted(null), false);
}

// ── 2. A -> B -> C: the day completes only with every required exercise ──
{
  const u = "d3-abc";
  const { cycle, ids } = startCycle(u, "G01", 20);
  assert.deepEqual(ids, ["F01-04", "F01-01", "F01-10"]);
  let r = rec(u, cycle, "F01-04", D3);
  assert.deepEqual([r.entry.completedExerciseIds, r.entry.isComplete, r.dayCompleted], [["F01-04"], false, false]);
  assert.deepEqual(getCycle(cycle).completedTrainingDates, [], "one exercise is not a completed day");
  r = rec(u, cycle, "F01-01", D3);
  assert.deepEqual([r.entry.completedExerciseIds, r.entry.isComplete], [["F01-04", "F01-01"], false]);
  r = rec(u, cycle, "F01-10", D3);
  assert.deepEqual([r.entry.completedExerciseIds, r.entry.isComplete, r.dayCompleted], [["F01-04", "F01-01", "F01-10"], true, true]);
  const c = getCycle(cycle);
  assert.deepEqual(c.completedTrainingDates, [key(D3)]);
  const entry = c.dailyTrainingProgress[key(D3)];
  for (const f of ["dateKey", "trackingCycleId", "recommendationId", "requiredExerciseIds", "completedExerciseIds", "isComplete"]) assert.ok(f in entry, `daily entry has ${f}`);
  assert.equal(entry.trackingCycleId, cycle.id);
  assert.equal(entry.recommendationId, cycle.recommendationId);
  assert.ok(entry.exerciseCompletions["F01-10"].analysisRecordId, "links back to the training record");
  assert.ok(!("cycleDay" in c), "still no stored day number");
}

// ── 3. 1 / 2 / 3 recommended exercises ───────────────────────────────────
{
  const one = startCycle("d3-one", "G01", 10);
  assert.equal(one.ids.length, 1);
  assert.equal(rec("d3-one", one.cycle, one.ids[0], D2).dayCompleted, true, "1 exercise -> done after 1");
  const two = startCycle("d3-two", "G01", 15);
  assert.equal(two.ids.length, 2);
  assert.equal(rec("d3-two", two.cycle, two.ids[0], D2).dayCompleted, false);
  assert.equal(rec("d3-two", two.cycle, two.ids[1], D2).dayCompleted, true, "2 exercises -> done after both");
  const three = startCycle("d3-three", "G05", 20);
  assert.equal(three.ids.length, 3);
  assert.deepEqual(three.ids.map((id) => rec("d3-three", three.cycle, id, D2).dayCompleted), [false, false, true]);
}

// ── 4. idempotency ───────────────────────────────────────────────────────
{
  const u = "d3-idem";
  const { cycle, ids } = startCycle(u, "G01", 15);
  rec(u, cycle, ids[0], D2);
  const again = rec(u, cycle, ids[0], D2, { hour: 15 });
  assert.equal(again.alreadyRecorded, true);
  assert.deepEqual(getCycle(cycle).dailyTrainingProgress[key(D2)].completedExerciseIds, [ids[0]], "A twice still counts once");
  rec(u, cycle, ids[1], D2);
  ids.forEach((id) => rec(u, cycle, id, D2, { hour: 18 }));
  assert.deepEqual(getCycle(cycle).completedTrainingDates, [key(D2)], "the whole day twice is still one date");
  ids.forEach((id) => rec(u, cycle, id, D1));
  ids.forEach((id) => rec(u, cycle, id, D4));
  assert.deepEqual(getCycle(cycle).completedTrainingDates, [key(D1), key(D2), key(D4)], "unique, ascending, not necessarily consecutive");
}

// ── 5. recommendation snapshot never rewrites history ────────────────────
{
  const u = "d3-snap";
  const { b, cycle, ids } = startCycle(u, "G01", 20);
  rec(u, cycle, ids[0], D2);
  const day2Before = [...getCycle(cycle).dailyTrainingProgress[key(D2)].requiredExerciseIds];
  assert.deepEqual(day2Before, ids);
  const newRec = saveRec(u, b, "G05", 15); // user re-sets the goal on Day 4
  trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: newRec });
  const c = getCycle(cycle);
  assert.equal(c.recommendationId, newRec.id);
  assert.deepEqual(c.dailyTrainingProgress[key(D2)].requiredExerciseIds, day2Before, "Day 2 keeps A/B/C");
  assert.equal(c.dailyTrainingProgress[key(D2)].recommendationId, cycle.recommendationId, "Day 2 keeps its own recommendationId");
  const snap4 = trackingCycleService.ensureDailyTrainingSnapshot({ cycleId: cycle.id, userId: u, dateKey: key(D4) });
  assert.deepEqual(snap4.entry.requiredExerciseIds, newRec.items.map((i) => i.exerciseId), "Day 4 uses the new recommendation");
  assert.equal(rec(u, cycle, "F01-04", D2).error, undefined, "Day 2 can still be finished with its own list");
  assert.equal(rec(u, cycle, "F01-17", D2).error, "exercise_not_in_daily_recommendation", "new exercises do not rewrite Day 2");
}

// ── 6. refused writes ────────────────────────────────────────────────────
{
  const u = "d3-bad", other = "d3-other";
  const { cycle, ids } = startCycle(u, "G01", 20);
  assert.equal(trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: other, exerciseId: ids[0], analysisRecord: training(other, ids[0], D2) }).error, "not_owner", "someone else's cycle");
  assert.equal(trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: u, exerciseId: ids[0], analysisRecord: training(other, ids[0], D2) }).error, "record_not_owned");
  assert.equal(rec(u, cycle, "F01-18", D2).error, "exercise_not_in_daily_recommendation", "not in the recommendation");
  assert.equal(trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: u, exerciseId: ids[0], analysisRecord: training(u, ids[1], D2) }).error, "exercise_mismatch");
  assert.equal(rec(u, cycle, ids[0], D2, { completed: false }).error, "training_not_completed", "stopped-early / incomplete session");
  assert.equal(rec(u, cycle, ids[0], D7).error, "outside_training_days", "Day 7 is for the reassessment");
  assert.equal(rec(u, cycle, ids[0], [2026, 8, 27]).error, "outside_training_days", "before Day 1");
  assert.equal(trackingCycleService.recordExerciseCompletion({ cycleId: "nope", userId: u, exerciseId: ids[0], analysisRecord: training(u, ids[0], D2) }).error, "cycle_not_found");
  assert.equal(getCycle(cycle).dailyTrainingProgress, undefined, "no refused write created a daily entry");
  // completed cycle takes no more training days
  const re = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(re.id, { result: { status: "completed", completedReps: 5, repCount: 5, totalDurationMs: 8000, measuredAt: new Date(...D7, 9, 0).toISOString(), assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: cycle.baselineAssessmentId } });
  assert.equal(trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: u, reassessment: functionalAssessmentService.getById(re.id), todayDateKey: key(D7) }).linked, true);
  assert.equal(rec(u, cycle, ids[0], D2).error, "cycle_already_completed");
  assert.equal(trackingCycleService.ensureDailyTrainingSnapshot({ cycleId: cycle.id, userId: u, dateKey: key(D2) }).error, "cycle_already_completed");
}

// ── 7. D2 fix: stored reassessmentDateKey = real measurement date ────────
{
  const u = "d3-d2fix";
  const { cycle } = startCycle(u);
  const re = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(re.id, { result: { status: "completed", completedReps: 5, repCount: 5, totalDurationMs: 8000, measuredAt: new Date(...D7, 9, 0).toISOString(), assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: cycle.baselineAssessmentId } });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: u, reassessment: functionalAssessmentService.getById(re.id), todayDateKey: "2026-10-20" });
  assert.equal(getCycle(cycle).reassessmentDateKey, key(D7), "a simulated / later 'today' never becomes the stored date");
}

// ── 8. home card: calendar day vs completed days are different numbers ───
{
  const cycle = { cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", reassessmentId: null, completedTrainingDates: ["2026-09-28", "2026-09-30"] };
  const view = T.getTrackingCycleViewState(cycle, "2026-10-01");
  const m = T.buildTrackingCardModel(view, { baselineText: "8.9 秒", completedDays: cycle.completedTrainingDates.length });
  assert.equal(m.title, "F01 下肢功能｜第 4 / 7 天");
  assert.deepEqual(m.facts, [{ label: "初次評估", value: "8.9 秒" }, { label: "本週已完成", value: "2 天" }, { label: "預計再次評估", value: "10/04" }]);
  assert.deepEqual(m.calendarDots, [true, true, true, true, false, false, false], "dots stay calendar progress (4), not completed days (2)");
  assert.ok(!JSON.stringify(m).includes("2 / 7"), "completed days never shown as N / 7");
  const withToday = (done, required) => T.buildTrackingCardModel(view, { completedDays: 2, todayProgress: { completedCount: done, requiredCount: required, isComplete: required > 0 && done === required } });
  assert.deepEqual([withToday(0, 3).cta.label, withToday(1, 3).cta.label, withToday(2, 3).cta.label, withToday(3, 3).cta.label], ["開始今日訓練", "繼續今日訓練", "繼續今日訓練", "今日訓練已完成"]);
  assert.equal(withToday(2, 3).today.text, "今日訓練 2 / 3");
  assert.equal(withToday(3, 3).today.text, "今日訓練 3 / 3 已完成");
  assert.equal(T.buildTrackingCardModel(view, { completedDays: 2 }).today, null, "no today line without real data");
  const ready = T.buildTrackingCardModel(T.getTrackingCycleViewState(cycle, "2026-10-05"), { completedDays: 5 });
  assert.deepEqual(ready.facts.find((f) => f.label === "本週已完成"), { label: "本週已完成", value: "5 天" });
  assert.equal(ready.today, null, "Day 7+ has no today-training line");
  const done = T.buildTrackingCardModel(T.getTrackingCycleViewState({ ...cycle, reassessmentId: "fa" }, "2026-10-05"), { completedDays: 5, reassessmentDateKey: "2026-10-04" });
  assert.deepEqual(done.facts[0], { label: "本週訓練完成", value: "5 天" });
  for (const mdl of [m, ready, done]) assert.ok(!/%|完成率|71\.4|改善|進步|退步|維持/.test(JSON.stringify(mdl)), "no rate / change wording");
  // today's progress view: stored snapshot wins, otherwise current ids with 0 done
  const pv = T.getDailyProgressView({ dailyTrainingProgress: { "2026-10-01": { requiredExerciseIds: ["A", "B", "C"], completedExerciseIds: ["A", "B"] } } }, "2026-10-01", ["D"]);
  assert.deepEqual([pv.requiredCount, pv.completedCount, pv.isComplete, pv.snapshotted], [3, 2, false, true]);
  const fresh = T.getDailyProgressView({}, "2026-10-01", ["D", "E"]);
  assert.deepEqual([fresh.requiredCount, fresh.completedCount, fresh.snapshotted], [2, 0, false]);
}

// ── 9. analysisService.onCreate is additive and safe ─────────────────────
{
  const seen = [];
  const off = analysisService.onCreate((r) => seen.push(r.id));
  const offBad = analysisService.onCreate(() => { throw new Error("listener boom"); });
  const saved = training("d3-listener", "F01-04", D2);
  assert.ok(saved && seen.includes(saved.id), "listener called with the saved record");
  assert.ok(analysisService.getById(saved.id), "a failing listener never blocks the save");
  off(); offBad();
  training("d3-listener", "F01-04", D2);
  assert.equal(seen.length, 1, "unsubscribed");
}

// ── 10. app.js wiring + debug-date isolation ─────────────────────────────
{
  const listener = appJs.slice(appJs.indexOf("analysisService.onCreate((record) => {"), appJs.indexOf("analysisService.onCreate((record) => {") + 900);
  assert.ok(listener.includes("const ctx = state.f01TrainingContext;") && listener.includes('state.navigationOrigin !== "f01Recommendation"'), "counted only inside a tracking-training context");
  assert.ok(listener.includes("record.patientId !== ctx.userId || record.exerciseId !== ctx.exerciseId"), "matched by user + exerciseId (never by name)");
  assert.ok(listener.includes("recordExerciseCompletion(") && !listener.includes("getTrackingTodayKey"), "no debug date passed to the write");
  const arm = appJs.slice(appJs.indexOf("function armF01TrackingTraining("), appJs.indexOf("function armF01TrackingTraining(") + 800);
  assert.ok(arm.includes("cycle.recommendationId !== state.f01RecommendationId"), "only the active cycle's own recommendation arms the context");
  const start = appJs.slice(appJs.indexOf("function startF01RecommendedTraining("), appJs.indexOf("function armF01TrackingTraining("));
  assert.ok(start.includes("ensureDailyTrainingSnapshot(") && start.includes("dateKey: toLocalDateKey(new Date())"), "snapshot at first start, real local date");
  const serviceCode = serviceSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/getTrackingTodayKey|trackingToday|URLSearchParams|window\./.test(serviceCode), "the service code never reads the debug override");
  assert.ok(/dateKey = toLocalDateKey\(analysisRecord\.completedAt \|\| analysisRecord\.createdAt\)/.test(serviceSrc), "training date = record's real completion time");
  assert.ok(/reassessmentDateKey: toLocalDateKey\(reassessmentMeasuredAt\)/.test(serviceSrc), "D2 date = real measurement date");
  const card = appJs.slice(appJs.indexOf("function renderTrackingCycleCard("), appJs.indexOf("function goTrackingWeekTraining("));
  assert.ok(card.includes("(cycle.completedTrainingDates || []).length") && card.includes("getDailyProgressView("), "card uses real completed days + real daily progress");
  assert.ok(!/detector|FSM/.test(appJs.slice(appJs.indexOf("function armF01TrackingTraining("), appJs.indexOf("function armF01TrackingTraining(") + 50)), "sanity");
}

console.log("Phase D3 training completion tests passed");
