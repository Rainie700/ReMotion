import assert from "node:assert/strict";
import { FA5X_CURRENT_MEASUREMENT_FIELDS as FA5X_M } from "../js/data/fa5xMeasurementCompatibility.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * F01 batch 1 — daily target snapshot + saved-training attempts + planDateKey.
 * Spec: docs/specs/f01-batch1-daily-target-snapshot-spec.md (待實作、待驗證).
 * Each block is labelled with the spec's acceptance case number (section 7).
 * Synthetic records only; this checks program behaviour, not completion accuracy.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const F = await import("../js/data/f01DailyTargets.js");
const RV = await import("../js/ui/f01RecommendationView.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
// fixture plans stand for existing G01 plans (made before the G01 condition screen; never rewritten)
const { generatePreScreenF01GoalRecommendation } = await import("./fixtures/f01PreScreenEngine.mjs");
const { trainingEventService } = await import("../js/data/trainingEventService.js");
const { cycleTrainingPerformanceService } = await import("../js/data/cycleTrainingPerformance.js");
const { createCollection } = await import("../js/data/storageService.js");

const cycles = createCollection("trackingCycles");
const recs = createCollection("recommendationResults");
const D1 = [2026, 8, 28], D2 = [2026, 8, 29], D3 = [2026, 8, 30], D4 = [2026, 9, 1], D6 = [2026, 9, 3], D7 = [2026, 9, 4];
const key = ([y, m, d]) => T.toLocalDateKey(new Date(y, m, d, 12, 0));
const at = ([y, m, d], h = 10, min = 0) => new Date(y, m, d, h, min).toISOString();
let seq = 0;

function startCycle(userId) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", completedReps: 5, repCount: 5, totalDurationMs: 8900, measuredAt: new Date(...D1, 14, 0).toISOString() } });
  const b = functionalAssessmentService.getById(s.id);
  const r = generatePreScreenF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G01", availableMinutes: 20, catalog: exerciseService.listNormalized() });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: userId, result: r, createdBy: userId }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId, baselineSession: b, recommendation: rec }).cycle;
  return { rec, cycle, ids: rec.items.map((i) => i.exerciseId) };
}
const prepare = (u, cycle, rec, exerciseId, day) =>
  trackingCycleService.prepareF01FormalTraining({ cycleId: cycle.id, userId: u, recommendationId: rec.id, exerciseId, dateKey: typeof day === "string" ? day : key(day) });
const getCycle = (c) => trackingCycleService.getTrackingCycleById(c.id);
const entryOf = (c, day) => (getCycle(c).dailyTrainingProgress || {})[typeof day === "string" ? day : key(day)];

/** A SAVED training record as the detectors save it from a formal F01 context (stamped by analysisService). */
function formalRecord(u, cycle, rec, exerciseId, { planDateKey = null, startedAt = null, completedAt, totalReps, targetReps, completed, summaryExtra = {}, omitCompletedAt = false } = {}) {
  seq += 1;
  const record = {
    id: `analysis-f01b1-${seq}`,
    patientId: u,
    exerciseId,
    capturedAt: completedAt,
    createdAt: completedAt,
    source: "self_practice",
    totalReps,
    targetReps,
    summary: { totalReps, targetReps, ...(completed == null ? {} : { completed }), ...summaryExtra },
  };
  if (!omitCompletedAt) record.completedAt = completedAt;
  return analysisService.create(record, {
    executionContext: { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: cycle.id, recommendationId: rec.id, exerciseId, userId: u, planDateKey, trainingStartedAt: startedAt },
  });
}
/** The app's listener order (spec 4.6): completion flow first, then the attempt list. */
function onSaved(u, cycle, record) {
  const completion = trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: u, exerciseId: record.exerciseId, analysisRecord: record });
  const attempt = trackingCycleService.recordTrainingAttempt({ userId: u, analysisRecord: record });
  return { completion, attempt };
}

// ── app.js functions under test, built from the real source (same technique as d5TherapistReview.test.js) ──
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
let today = null; // stub for toLocalDateKey(new Date()) inside the app functions
const calls = { render: 0, alerts: [], planPage: [] };
const appDeps = {
  state, getCurrentPatientId: () => currentUser, trackingCycleService, recommendationService, exerciseService,
  toLocalDateKey: (d) => (today != null ? today : T.toLocalDateKey(d)),
  describePlanVolume: RV.describePlanVolume, formatPlanVolume: RV.formatPlanVolume, sameTargetSummary: F.sameTargetSummary,
  nowIso: () => new Date().toISOString(), render: () => { calls.render += 1; }, alert: (m) => calls.alerts.push(m),
  goF01RecommendationResult: (id) => calls.planPage.push(id),
};
const app = new Function(...Object.keys(appDeps), [
  fnSource("f01PlanDoseFor"), fnSource("withF01PlanDoseLabel"), fnSource("getExercisePageContext"),
  constSource("F01_FORMAL_BLOCK_TEXT"), fnSource("returnToF01PlanForFormalBlock"), fnSource("prepareF01FormalTrainingTarget"), fnSource("passF01FinalCheck"), fnSource("isF01FormalTrainingContext"),
  "return { f01PlanDoseFor, withF01PlanDoseLabel, getExercisePageContext, returnToF01PlanForFormalBlock, prepareF01FormalTrainingTarget, passF01FinalCheck, isF01FormalTrainingContext };",
].join("\n"))(...Object.values(appDeps));
/** Formal F01 context exactly as armF01TrackingTraining builds it. */
function armFormal(u, cycle, rec, exerciseId) {
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, {
    navigationOrigin: "f01Recommendation", exerciseContext: "self_practice", selectedExerciseId: exerciseId, f01RecommendationId: rec.id,
    f01TrainingContext: { cycleId: cycle.id, recommendationId: rec.id, exerciseId, userId: u },
  });
  currentUser = u;
  calls.render = 0; calls.alerts = []; calls.planPage = [];
}
function withCatalog(exerciseId, patch, fn) {
  const raw = exerciseService.getById(exerciseId);
  const saved = Object.fromEntries(Object.keys(patch).map((k) => [k, raw[k]]));
  Object.assign(raw, patch);
  try { return fn(); } finally { Object.assign(raw, saved); }
}

// ── 1. first creation: list + frozen targets in ONE write, from every formal entry ──
{
  const u = "b1-c1";
  const { cycle, rec, ids } = startCycle(u);
  assert.deepEqual(ids, ["F01-04", "F01-01", "F01-10"], "fixture plan (G01, 20 min)");
  const p = prepare(u, cycle, rec, "F01-04", D2);
  assert.equal(p.ok, true);
  assert.equal(p.targetRef, F.TARGET_REF.FROZEN);
  const e = entryOf(cycle, D2);
  assert.equal(e.snapshotVersion, 2);
  assert.equal(e.targetsStatus, F.TARGETS_STATUS.FROZEN);
  assert.equal(e.targetRulesVersion, F.F01_DAILY_TARGET_RULES_VERSION);
  assert.deepEqual(Object.keys(e.targets).sort(), [...ids].sort(), "every required exercise frozen in the same write");
  assert.deepEqual(e.attempts, {});
  const raw04 = exerciseService.getById("F01-04");
  assert.deepEqual(e.targets["F01-04"].sets, { value: raw04.defaultSets, source: "catalog_default" });
  assert.deepEqual(e.targets["F01-04"].repsPerSet, { value: raw04.defaultRepetitions, source: "catalog_default" });
  assert.deepEqual(e.targets["F01-04"].detectorTarget, { value: raw04.defaultSets * raw04.defaultRepetitions, unit: "total_reps" }, "same formula as calculateSquatTargetReps");
  const createdAt = e.createdAt;
  assert.equal(prepare(u, cycle, rec, "F01-01", D2).ok, true);
  assert.equal(entryOf(cycle, D2).createdAt, createdAt, "frozen once per day");
  // app wiring: all three entries reach the same preparation stage
  const prep = fnSource("goDetectionPrep");
  assert.ok(prep.indexOf("prepareF01FormalTrainingTarget()") >= 0 && prep.indexOf("prepareF01FormalTrainingTarget()") < prep.indexOf("getExercisePageContext()"), "freeze before anything resolves the amount");
  assert.ok(!fnSource("startF01RecommendedTraining").includes("ensureDailyTrainingSnapshot("), "建議頁 no longer creates an un-targeted snapshot first");
  assert.ok(fnSource("startF01RecommendedTraining").includes("goDetectionPrep()") && fnSource("startTodayPlanTask").includes("goDetectionPrep()"), "建議頁 + 今日訓練 use the shared stage");
  assert.ok(/onclick="goDetectionPrep\(\)"/.test(appJs), "動作頁 開始訓練 uses the shared stage");
}

// ── 2. display and detector start read the SAME frozen values after later changes ──
{
  const u = "b1-c2";
  const { cycle, rec } = startCycle(u);
  armFormal(u, cycle, rec, "F01-01");
  today = key(D2);
  assert.equal(app.prepareF01FormalTrainingTarget().ok, true);
  const frozen = entryOf(cycle, D2).targets["F01-01"];
  // later: catalog default and therapist dose change
  recs.update(rec.id, { items: rec.items.map((it) => (it.exerciseId === "F01-01" ? { ...it, dose: { sets: 5, repetitions: 12, durationSeconds: null } } : it)) });
  withCatalog("F01-01", { defaultSets: 9, defaultRepetitions: 20 }, () => {
    const ctx = app.getExercisePageContext();
    assert.equal(ctx.ex.sets, frozen.sets.value, "detector start reads the frozen sets");
    assert.equal(ctx.ex.repetitions, frozen.repsPerSet.value, "detector start reads the frozen reps");
    const label = app.withF01PlanDoseLabel({ dosage: { text: "x" } }, ctx.ex).dosage.text;
    assert.ok(label.includes(`${frozen.sets.value} 組`) && label.includes(`每組 ${frozen.repsPerSet.value} 下`) && label.includes("動作預設"), `display reads the frozen values + stored source: ${label}`);
    assert.ok(!label.includes("復健師設定") && !label.includes("未凍結"));
    assert.equal(trackingCycleService.getFrozenDailyTarget({ cycleId: cycle.id, userId: u, dateKey: key(D2), exerciseId: "F01-01" }).sets.value, frozen.sets.value);
  });
  today = null;
}

// ── 3. older / not_frozen snapshot: never upgraded; formal training allowed but labelled ──
{
  const u = "b1-c3";
  const { cycle, rec, ids } = startCycle(u);
  // an entry written before batch 1 (no snapshotVersion / targets)
  const legacy = { dateKey: key(D2), trackingCycleId: cycle.id, recommendationId: rec.id, requiredExerciseIds: ids, completedExerciseIds: [], exerciseCompletions: {}, isComplete: false, createdAt: at(D2, 8), completedAt: null };
  cycles.update(cycle.id, { dailyTrainingProgress: { [key(D2)]: legacy } });
  const p = prepare(u, cycle, rec, "F01-04", D2);
  assert.equal(p.ok, true);
  assert.equal(p.targetRef, F.TARGET_REF.LEGACY);
  assert.equal(entryOf(cycle, D2).targets, undefined, "no target back-filled into the older snapshot");
  assert.equal(entryOf(cycle, D2).snapshotVersion, undefined, "older snapshot not upgraded");
  // a not_frozen snapshot (completion fallback) stays not_frozen
  const fb = trackingCycleService.ensureDailyTrainingSnapshot({ cycleId: cycle.id, userId: u, dateKey: key(D3) });
  assert.equal(fb.entry.targetsStatus, F.TARGETS_STATUS.NOT_FROZEN);
  assert.deepEqual(fb.entry.targets, {});
  assert.equal(prepare(u, cycle, rec, "F01-04", D3).targetRef, F.TARGET_REF.NOT_FROZEN);
  assert.deepEqual(entryOf(cycle, D3).targets, {}, "not upgraded by a later formal start");
  // labelled on the page; attempt labelled too
  armFormal(u, cycle, rec, "F01-04");
  today = key(D2);
  assert.equal(app.prepareF01FormalTrainingTarget().ok, true);
  const ctxEx = app.getExercisePageContext().ex;
  assert.ok(app.withF01PlanDoseLabel({ dosage: { text: "x" } }, ctxEx).dosage.text.endsWith("（今日目標未凍結）"));
  today = null;
  const r = formalRecord(u, cycle, rec, "F01-04", { planDateKey: key(D2), completedAt: at(D2), totalReps: 3, targetReps: 24, completed: false });
  assert.equal(onSaved(u, cycle, r).attempt.attempt.targetRef, F.TARGET_REF.LEGACY);
}

// ── 4. counting basis / consistency labels (spec 3.3) ──
{
  const t = (id, item = null) => F.buildDailyTarget({ exerciseId: id, item, catalog: exerciseService.getById(id) }).target;
  const t05 = t("F01-05");
  assert.deepEqual([t05.planCountingBasis, t05.detectorRuleId, t05.targetConsistency], ["per_side", "sets_x_reps_total", "inconsistent"]);
  assert.deepEqual(t05.plannedAmount, { perSide: t05.sets.value * t05.repsPerSet.value });
  const t08 = t("F01-08");
  assert.deepEqual([t08.planCountingBasis, t08.detectorRuleId, t08.targetConsistency], ["per_side", "reps_only_per_side", "inconsistent"]);
  assert.deepEqual(t08.detectorTarget, { value: t08.repsPerSet.value, unit: "reps_per_side" }, "sets ignored by the detector (known defect, batch 2)");
  const t09 = t("F01-09");
  assert.deepEqual([t09.planCountingBasis, t09.plannedAmount, t09.targetConsistency], ["unspecified", null, "not_comparable"], "「交替」: never multiplied");
  const t17 = t("F01-17");
  assert.equal(t17.detectorRuleId, "reps_only_total");
  assert.equal(t17.targetConsistency, "inconsistent", "sets ignored by the detector (known defect, batch 2)");
  const t19 = t("F01-19");
  assert.deepEqual([t19.planCountingBasis, t19.plannedAmount, t19.targetConsistency], ["unspecified", null, "not_comparable"], "sides recorded, no 「每側」: not comparable");
  // therapist amounts carry no side
  assert.equal(t("F01-05", { exerciseId: "F01-05", dose: { sets: 2, repetitions: 12 } }).planCountingBasis, "unspecified");
  assert.equal(t("F01-01", { exerciseId: "F01-01", dose: { sets: 2, repetitions: 12 } }).planCountingBasis, "total");
  // a bilateral detector with matching formula is consistent
  const c = F.buildDailyTarget({ exerciseId: "F01-01", catalog: { measurementType: "repetition", defaultSets: 3, defaultRepetitions: 10, repetitions: "10次" } }).target;
  assert.deepEqual([c.planCountingBasis, c.targetConsistency, c.plannedAmount], ["total", "consistent", { total: 30 }]);
  // every F01 exercise has a detector rule
  for (let n = 1; n <= 20; n += 1) assert.ok(F.F01_DETECTOR_TARGET_RULES[`F01-${String(n).padStart(2, "0")}`], `F01-${n} has a rule`);
}

// ── 5 / 6 / 9 / 18. saved attempts: unfinished kept, de-duplicated, nulls kept, completedAt only ──
{
  const u = "b1-c5";
  const { cycle, rec } = startCycle(u);
  prepare(u, cycle, rec, "F01-04", D2);
  const r = formalRecord(u, cycle, rec, "F01-04", { planDateKey: key(D2), startedAt: at(D2, 9, 55), completedAt: at(D2), totalReps: 7, targetReps: 24, completed: false });
  const { completion, attempt } = onSaved(u, cycle, r);
  assert.equal(completion.error, "training_not_completed");
  assert.equal(attempt.created, true);
  const a = attempt.attempt;
  assert.equal(a.recordId, r.id);
  assert.deepEqual(a.actual, { totalReps: 7, leftReps: null, rightReps: null }, "9: missing sides stay null");
  assert.deepEqual(a.recordTarget, { targetReps: 24, targetPerSide: null }, "9: missing targetPerSide stays null");
  assert.equal(a.detectorCompletedFlag, false, "original completion flag kept");
  assert.deepEqual(a.source, { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: cycle.id, recommendationId: rec.id });
  assert.equal(a.planDateKey, key(D2));
  assert.equal(a.trainingStartedAt, at(D2, 9, 55));
  assert.equal(a.completedAt, r.completedAt, "18: completedAt = record.completedAt");
  assert.equal(a.targetRef, F.TARGET_REF.FROZEN);
  assert.deepEqual(entryOf(cycle, D2).completedExerciseIds, [], "5: completion fields unchanged");
  // 6. the same record twice -> one attempt
  const again = trackingCycleService.recordTrainingAttempt({ userId: u, analysisRecord: r });
  assert.equal(again.created, false);
  assert.equal(Object.keys(entryOf(cycle, D2).attempts).length, 1);
  // 18. a record without completedAt -> null, never createdAt
  const noTime = formalRecord(u, cycle, rec, "F01-01", { planDateKey: key(D2), completedAt: at(D2, 11), totalReps: 2, targetReps: 30, completed: false, omitCompletedAt: true });
  const a2 = trackingCycleService.recordTrainingAttempt({ userId: u, analysisRecord: noTime }).attempt;
  assert.equal(a2.completedAt, null);
  assert.ok(noTime.createdAt, "the record does have createdAt");
  // sides kept when the record has them
  const sided = formalRecord(u, cycle, rec, "F01-10", { planDateKey: key(D2), completedAt: at(D2, 12), totalReps: 9, targetReps: 30, completed: false, summaryExtra: { leftReps: 5, rightReps: 4, targetPerSide: 15 } });
  const a3 = trackingCycleService.recordTrainingAttempt({ userId: u, analysisRecord: sided }).attempt;
  assert.deepEqual([a3.actual.leftReps, a3.actual.rightReps, a3.recordTarget.targetPerSide], [5, 4, 15]);
}

// ── 7. refused attempts never write, never create a snapshot ──
{
  const u = "b1-c7";
  const { cycle, rec } = startCycle(u);
  const other = startCycle("b1-c7-other");
  prepare(u, cycle, rec, "F01-04", D2);
  const before = JSON.stringify(getCycle(cycle).dailyTrainingProgress);
  const refuse = (record, reason, userId = u) => assert.equal(trackingCycleService.recordTrainingAttempt({ userId, analysisRecord: record }).error, reason);
  const ok = formalRecord(u, cycle, rec, "F01-04", { planDateKey: key(D2), completedAt: at(D2), totalReps: 5, targetReps: 24, completed: false });
  refuse(ok, "record_not_owned", "someone-else");
  refuse({ ...ok, id: "x-other-cycle", trackingCycleId: other.cycle.id }, "not_owner");
  refuse(formalRecord(u, cycle, rec, "F01-04", { planDateKey: key(D3), completedAt: at(D3), totalReps: 5, targetReps: 24, completed: false }), "no_daily_snapshot");
  refuse(formalRecord(u, cycle, rec, "F01-04", { planDateKey: key(D7), completedAt: at(D7), totalReps: 5, targetReps: 24, completed: false }), "outside_training_days");
  refuse({ ...ok, id: "x-other-rec", recommendationId: "rec-other" }, "recommendation_mismatch");
  refuse(formalRecord(u, cycle, rec, "F01-17", { planDateKey: key(D2), completedAt: at(D2), totalReps: 5, targetReps: 10, completed: false }), "exercise_not_in_daily_plan");
  // self practice / a record without a stored source
  seq += 1;
  const self = analysisService.create({ id: `analysis-f01b1-${seq}`, patientId: u, exerciseId: "F01-04", completedAt: at(D2), source: "self_practice", totalReps: 24, targetReps: 24, summary: { completed: true } });
  assert.equal(self.sourceSubtype, "self_selected");
  refuse(self, "not_f01_cycle_record");
  seq += 1;
  const unstamped = analysisService.create({ id: `analysis-f01b1-${seq}`, patientId: u, exerciseId: "F01-04", completedAt: at(D2), totalReps: 24, targetReps: 24 });
  refuse(unstamped, "not_f01_cycle_record");
  assert.equal(JSON.stringify(getCycle(cycle).dailyTrainingProgress), before, "nothing written, no snapshot created");
}

// ── 8. no snapshot: unfinished -> nothing; finished -> not_frozen fallback, never back-filled ──
{
  const u = "b1-c8";
  const { cycle, rec } = startCycle(u);
  const part = formalRecord(u, cycle, rec, "F01-04", { planDateKey: key(D4), completedAt: at(D4), totalReps: 4, targetReps: 24, completed: false });
  const p = onSaved(u, cycle, part);
  assert.equal(p.attempt.error, "no_daily_snapshot");
  assert.equal(entryOf(cycle, D4), undefined, "an unfinished record creates no snapshot");
  const done = formalRecord(u, cycle, rec, "F01-04", { planDateKey: key(D4), completedAt: at(D4, 11), totalReps: 24, targetReps: 24, completed: true });
  const d = onSaved(u, cycle, done);
  assert.equal(d.completion.entry.targetsStatus, F.TARGETS_STATUS.NOT_FROZEN);
  assert.deepEqual(entryOf(cycle, D4).targets, {}, "no target back-filled from defaults");
  assert.equal(d.attempt.attempt.targetRef, F.TARGET_REF.NOT_FROZEN);
}

// ── 10 / 17. records without planDateKey keep the earlier date rule; D5 / LLM structures untouched ──
{
  const u = "b1-c10";
  const { cycle } = startCycle(u);
  seq += 1;
  const old = analysisService.create({ id: `analysis-f01b1-${seq}`, patientId: u, exerciseId: "F01-04", completedAt: at(D3, 0, 2), source: "self_practice", totalReps: 24, targetReps: 24, summary: { completed: true } });
  assert.equal(old.planDateKey, undefined);
  const r = trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: u, exerciseId: "F01-04", analysisRecord: old });
  assert.equal(r.entry.dateKey, key(D3), "17: completion date = the record's real completion date");
  for (const f of ["js/data/f01ProgressionDecision.js", "js/data/d5LlmRecommendation.js", "js/services/llmContextBuilder.js", "js/data/functionalProgressService.js"]) {
    const src = readFileSync(join(root, f), "utf8");
    // batch 2 legitimately imports the completion-status helpers of f01DailyTargets here; the batch-1 FIELDS stay unread
    assert.ok(!/planDateKey|\.attempts\b|targetsStatus/.test(src), `10: ${f} does not read batch-1 fields`);
  }
}

// ── 11. formalRecordCount and completed days: own definitions, both traceable to record ids ──
{
  const u = "b1-c11";
  const { cycle, rec, ids } = startCycle(u);
  prepare(u, cycle, rec, ids[0], D2);
  const saved = ids.map((id, i) => formalRecord(u, cycle, rec, id, { planDateKey: key(D2), completedAt: at(D2, 10 + i), totalReps: 99, targetReps: 1, completed: true }));
  saved.forEach((r) => onSaved(u, cycle, r));
  const e = entryOf(cycle, D2);
  assert.equal(e.isComplete, true);
  assert.deepEqual(Object.values(e.exerciseCompletions).map((c) => c.analysisRecordId).sort(), saved.map((r) => r.id).sort(), "completed day -> record ids");
  const events = trainingEventService.listTrainingEvents(u).filter((ev) => ev.sourceSubtype === "f01_cycle" && ev.trackingCycleId === cycle.id && ev.completed === true);
  assert.equal(cycleTrainingPerformanceService.getByCycle(u).get(cycle.id).completedTrainingCount, events.length);
  assert.deepEqual(events.map((ev) => ev.eventId).sort(), saved.map((r) => r.id).sort(), "formalRecordCount -> record ids");
}

// ── 12. freeze failure: no write, preparation refused, back to the plan page ──
{
  const u = "b1-c12";
  const { cycle, rec } = startCycle(u);
  withCatalog("F01-01", { defaultSets: 0 }, () => {
    const p = prepare(u, cycle, rec, "F01-04", D2);
    assert.equal(p.error, "target_freeze_failed", "one invalid target fails the whole freeze");
  });
  assert.equal(entryOf(cycle, D2), undefined, "nothing written");
  armFormal(u, cycle, rec, "F01-04");
  today = key(D2);
  withCatalog("F01-01", { defaultSets: 0 }, () => assert.equal(app.prepareF01FormalTrainingTarget().ok, false));
  app.returnToF01PlanForFormalBlock("target_freeze_failed");
  assert.equal(state.f01TrainingContext, null, "no formal context left behind");
  assert.deepEqual(calls.planPage, [rec.id], "back to the plan page");
  assert.ok(calls.alerts[0].includes("無法確認今日訓練目標"));
  today = null;
  const prep = fnSource("goDetectionPrep");
  assert.ok(/if \(!prep\.ok\) return returnToF01PlanForFormalBlock\(prep\.error\);/.test(prep), "the detector is never reached");
}

// ── 13. cannot start formally: back to the plan page, never turned into self practice ──
{
  const u = "b1-c13";
  const { cycle, rec } = startCycle(u);
  assert.equal(prepare(u, cycle, rec, "F01-04", D7).error, "outside_training_days");
  assert.equal(entryOf(cycle, D7), undefined);
  assert.equal(prepare(u, cycle, rec, "F01-17", D2).error, "exercise_not_in_daily_plan");
  assert.equal(trackingCycleService.prepareF01FormalTraining({ cycleId: cycle.id, userId: u, recommendationId: "rec-other", exerciseId: "F01-04", dateKey: key(D2) }).error, "recommendation_mismatch");
  assert.equal(entryOf(cycle, D2), undefined, "no snapshot from a refused start");
  cycles.update(cycle.id, { reassessmentId: "re-x" });
  assert.equal(prepare(u, cycle, rec, "F01-04", D3).error, "cycle_completed");
  armFormal(u, cycle, rec, "F01-04");
  app.returnToF01PlanForFormalBlock("outside_training_days");
  assert.ok(calls.alerts[0].includes("自主練習") && calls.planPage.length === 1 && state.f01TrainingContext === null);
  const block = fnSource("returnToF01PlanForFormalBlock");
  assert.ok(!/goSelfPractice|exerciseContext\s*=|navigationOrigin\s*=/.test(block), "no automatic switch to self practice");
}

// ── 14 / 15. final check before the camera: date or target changed -> re-shown, confirmed, then started ──
{
  const u = "b1-c14";
  const { cycle, rec } = startCycle(u);
  armFormal(u, cycle, rec, "F01-04");
  today = key(D2);
  assert.equal(app.prepareF01FormalTrainingTarget().ok, true);
  assert.equal(app.passF01FinalCheck(), true, "same day, same target -> detector may start");
  assert.ok(state.f01TrainingContext.trainingStartedAt);
  // 14. D -> D+1 before the camera opens
  assert.equal(app.prepareF01FormalTrainingTarget().ok, true);
  today = key(D3);
  calls.render = 0; calls.alerts = [];
  assert.equal(app.passF01FinalCheck(), false, "detector NOT started");
  assert.equal(state.f01TrainingContext.planDateKey, key(D3));
  assert.equal(state.f01TrainingContext.displayedTarget.planDateKey, key(D3));
  assert.equal(entryOf(cycle, D3).targetsStatus, F.TARGETS_STATUS.FROZEN, "D+1 frozen by the re-run preparation");
  assert.equal(calls.render, 1);
  assert.ok(calls.alerts[0].includes("日期已變更"));
  assert.equal(app.passF01FinalCheck(), true, "second press after confirmation starts");
  // 14. D+1 not a training day -> back to the plan page
  assert.equal(app.prepareF01FormalTrainingTarget().ok, true);
  today = key(D7);
  calls.alerts = []; calls.planPage = [];
  assert.equal(app.passF01FinalCheck(), false);
  assert.equal(state.f01TrainingContext, null);
  assert.equal(calls.planPage.length, 1);
  // 15. same day, live target changed on a not-frozen day
  const u2 = "b1-c15";
  const s = startCycle(u2);
  trackingCycleService.ensureDailyTrainingSnapshot({ cycleId: s.cycle.id, userId: u2, dateKey: key(D2) }); // not_frozen day
  armFormal(u2, s.cycle, s.rec, "F01-04");
  today = key(D2);
  assert.equal(app.prepareF01FormalTrainingTarget().ok, true);
  assert.equal(state.f01TrainingContext.targetRef, F.TARGET_REF.NOT_FROZEN);
  withCatalog("F01-04", { defaultSets: 7 }, () => {
    calls.alerts = []; calls.render = 0;
    assert.equal(app.passF01FinalCheck(), false, "target changed -> not started");
    assert.ok(calls.alerts[0].includes("今日目標已更新") && calls.render === 1);
    assert.equal(state.f01TrainingContext.displayedTarget.sets, 7, "page now shows the updated target");
    assert.equal(app.passF01FinalCheck(), true, "confirmed -> started");
  });
  today = null;
  // the final check is the outermost camera wrapper
  const lastAssign = appJs.lastIndexOf("openCameraPlaceholder = function");
  const otherAssigns = [...appJs.matchAll(/openCameraPlaceholder=function/g)].map((m) => m.index);
  assert.ok(otherAssigns.every((i) => i < lastAssign), "installed after every other wrapper");
  assert.ok(appJs.slice(lastAssign, lastAssign + 200).includes("isF01FormalTrainingContext() && !passF01FinalCheck()"));
}

// ── 16. across midnight: everything on the plan date; real times kept ──
{
  const u = "b1-c16";
  const { cycle, rec, ids } = startCycle(u);
  prepare(u, cycle, rec, ids[0], D3);
  const r = formalRecord(u, cycle, rec, ids[0], { planDateKey: key(D3), startedAt: at(D3, 23, 58), completedAt: at(D4, 0, 2), totalReps: 99, targetReps: 1, completed: true });
  assert.equal(r.planDateKey, key(D3));
  assert.equal(r.localDateKey, key(D4), "localDateKey keeps the completion's local date");
  assert.equal(r.trainingStartedAt, at(D3, 23, 58));
  const { completion, attempt } = onSaved(u, cycle, r);
  assert.equal(completion.entry.dateKey, key(D3));
  assert.ok(entryOf(cycle, D3).completedExerciseIds.includes(ids[0]));
  assert.ok(entryOf(cycle, D3).attempts[r.id]);
  assert.equal(entryOf(cycle, D4), undefined, "nothing on the completion day");
  assert.equal(attempt.attempt.completedAt, at(D4, 0, 2));
  // finish the day -> completedTrainingDates on the plan date
  ids.slice(1).forEach((id, i) => onSaved(u, cycle, formalRecord(u, cycle, rec, id, { planDateKey: key(D3), completedAt: at(D4, 0, 10 + i), totalReps: 99, targetReps: 1, completed: true })));
  assert.deepEqual(getCycle(cycle).completedTrainingDates, [key(D3)]);
  // Day 6 -> Day 7
  prepare(u, cycle, rec, ids[0], D6);
  ids.forEach((id, i) => onSaved(u, cycle, formalRecord(u, cycle, rec, id, { planDateKey: key(D6), completedAt: at(D7, 0, 5 + i), totalReps: 99, targetReps: 1, completed: true })));
  assert.ok(getCycle(cycle).completedTrainingDates.includes(key(D6)), "Day 6 training saved on Day 7 counts for Day 6");
  // non-f01 contexts never get the fields
  seq += 1;
  const self = analysisService.create({ id: `analysis-f01b1-${seq}`, patientId: u, exerciseId: ids[0], completedAt: at(D3), source: "self_practice", totalReps: 1, targetReps: 1 }, { executionContext: { sourceType: "self", sourceSubtype: "self_selected", exerciseId: ids[0], userId: u, planDateKey: key(D3) } });
  assert.equal(self.planDateKey, undefined);
}

console.log("F01 batch 1 daily target snapshot tests passed (synthetic data; not a completion-accuracy validation)");
