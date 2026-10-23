import assert from "node:assert/strict";
import { FA5X_CURRENT_MEASUREMENT_FIELDS as FA5X_M } from "../js/data/fa5xMeasurementCompatibility.js";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * F01 batch 2 — formal targets and completion aligned to the frozen target.
 * Spec: docs/specs/f01-batch2-completion-alignment-design.md, acceptance cases B2-1 … B2-25.
 * Synthetic records only: program behaviour, not completion accuracy or clinical validity.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const md5 = (p) => createHash("md5").update(readFileSync(join(root, p))).digest("hex");
const F = await import("../js/data/f01DailyTargets.js");
const T = await import("../js/data/trackingCycle.js");
const D = await import("../js/data/f01ProgressionDecision.js");
const A = await import("../js/data/d5Arrangement.js");
const R = await import("../js/data/d5TherapistReviewService.js");
const L = await import("../js/data/d5LlmRecommendation.js");
const DRAFT = await import("../js/services/d5RecommendationDraftService.js");
const SPEC = await import("../js/data/f01ProgressionSpec.js");
const ADV = await import("../js/data/f01AdventureProgress.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { functionalProgressService } = await import("../js/data/functionalProgressService.js");
const { buildVerifiedWeeklyContext, assembleVerifiedContext } = await import("../js/services/llmContextBuilder.js");
const { validateVerifiedContext } = await import("../js/services/llmSummarySchema.js");
const { buildFallbackSummary, fallbackNarrative } = await import("../js/services/llmSummaryFallback.js");
const { validateWeeklySummary } = await import("../js/services/llmSummaryValidator.js");
const { createCollection } = await import("../js/data/storageService.js");
const { createSeatedKneeExtensionSession } = await import("../js/ai/exercises/seatedKneeExtension/session.js");
const { createSeatedKneeRaiseSession } = await import("../js/ai/exercises/seatedKneeRaise/session.js");
const { createSideLegRaiseSession } = await import("../js/ai/exercises/sideLegRaise/session.js");
const { createClamshellSession } = await import("../js/ai/exercises/clamshell/session.js");
const { createSingleLegToeRaiseSession } = await import("../js/ai/exercises/singleLegToeRaise/session.js");

const V = F.F01_FORMAL_COMPLETION_RULES_VERSION;
const catalog = exerciseService.listNormalized();
const cycles = createCollection("trackingCycles");
const recs = createCollection("recommendationResults");
const D1 = [2026, 8, 28], D2 = [2026, 8, 29], D3 = [2026, 8, 30], D7 = [2026, 9, 4];
const key = ([y, m, d]) => T.toLocalDateKey(new Date(y, m, d, 12, 0));
const at = ([y, m, d], h = 10, min = 0) => new Date(y, m, d, h, min).toISOString();
const SIX_DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
const NO_CHANGE = { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] };
let seq = 0;

function baseline(u, { ms = 12000, when = [2026, 8, 28, 14, 0], role = null } = {}) {
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", completedReps: 5, repCount: 5, totalDurationMs: ms, measuredAt: new Date(...when).toISOString(), ...(role || {}) } });
  return functionalAssessmentService.getById(s.id);
}
/** A saved Phase C plan with exactly these exercises (fixture: the generator's item shape, ids replaced). */
function planWith(u, b, exerciseIds, goal = "G02") {
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, availableMinutes: 20, catalog });
  const tpl = r.items[0];
  const items = exerciseIds.map((id, i) => ({ ...tpl, rank: i + 1, exerciseId: id, exerciseName: (exerciseService.getNormalizedById(id) || {}).name || id }));
  return recommendationService.createF01GoalRecommendation({ patientId: u, result: { ...r, items }, createdBy: u }).recommendation;
}
function cycleWith(u, exerciseIds, { version = V, goal = "G02" } = {}) {
  const b = baseline(u);
  const rec = planWith(u, b, exerciseIds, goal);
  const res = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec, completionRulesVersion: version });
  assert.ok(res.cycle, `fixture cycle: ${res.error || ""}`);
  return { b, rec, cycle: res.cycle };
}
const prepare = (u, c, exerciseId, day = D2) => trackingCycleService.prepareF01FormalTraining({ cycleId: c.cycle.id, userId: u, recommendationId: c.rec.id, exerciseId, dateKey: key(day) });
const getCycle = (c) => trackingCycleService.getTrackingCycleById(c.cycle.id);
const entryOf = (c, day = D2) => (getCycle(c).dailyTrainingProgress || {})[key(day)];
/** A saved FORMAL training record (stamped by analysisService) — counts as the detector saved them. */
function rec(u, c, exerciseId, { day = D2, totalReps = null, leftReps = null, rightReps = null, completed = true, targetReps = null } = {}) {
  seq += 1;
  const summary = { totalReps, targetReps, completed, ...(leftReps != null ? { leftReps } : {}), ...(rightReps != null ? { rightReps } : {}) };
  return analysisService.create({ id: `b2-${seq}`, patientId: u, exerciseId, completedAt: at(day, 10, seq % 50), source: "self_practice", totalReps, targetReps, summary },
    { executionContext: { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: c.cycle.id, recommendationId: c.rec.id, exerciseId, userId: u, planDateKey: key(day), trainingStartedAt: at(day, 9, 30) } });
}
const complete = (u, c, record) => trackingCycleService.recordExerciseCompletion({ cycleId: c.cycle.id, userId: u, exerciseId: record.exerciseId, analysisRecord: record });

// app.js extraction (same technique as the other app tests)
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => { const s = appJs.indexOf(`const ${name} =`); assert.ok(s >= 0, name); return appJs.slice(s, appJs.indexOf(";\n", s) + 1); };

const EXPECTED = {
  // B2-1 table (catalog defaults): kind, required (total) / requiredPerSide (per side)
  "F01-01": ["total", 30], "F01-02": ["total", 20], "F01-03": ["total", 16], "F01-04": ["total", 24], "F01-10": ["total", 30],
  "F01-17": ["total", 20], "F01-18": ["total", 20],
  "F01-05": ["per_side", 20], "F01-06": ["per_side", 20], "F01-07": ["per_side", 20], "F01-08": ["per_side", 30], "F01-09": ["per_side", 30],
  "F01-11": ["per_side", 30], "F01-12": ["per_side", 30], "F01-13": ["per_side", 30], "F01-14": ["per_side", 30], "F01-15": ["per_side", 30],
  "F01-16": ["per_side", 30], "F01-20": ["per_side", 20],
  "F01-19": ["counting_basis_pending", null],
};

// ── B2-1 對照表 ───────────────────────────────────────────────────────────
{
  for (const [id, [kind, n]] of Object.entries(EXPECTED)) {
    const t = F.buildDailyTarget({ exerciseId: id, catalog: exerciseService.getById(id), completionRulesVersion: V }).target;
    assert.equal(t.completionRule.kind, kind, `${id} rule kind`);
    if (kind === "total") { assert.equal(t.completionRule.required, n, `${id} total`); assert.deepEqual(t.formalDetectorConfig, { targetReps: n }); }
    else if (kind === "per_side") { assert.equal(t.completionRule.requiredPerSide, n, `${id} per side`); assert.deepEqual(t.formalDetectorConfig, { targetPerSide: n }); }
    else assert.equal(t.formalDetectorConfig, null, `${id} pending: no formal detector config`);
  }
  const counts = Object.values(EXPECTED).reduce((acc, [k]) => ({ ...acc, [k]: (acc[k] || 0) + 1 }), {});
  assert.deepEqual(counts, { total: 7, per_side: 12, counting_basis_pending: 1 });
  // 14 to fix + 5 consistent + 1 not in new automatic recommendations
  const consistent = ["F01-01", "F01-02", "F01-03", "F01-04", "F01-10"];
  for (const id of consistent) {
    const oldT = F.buildDailyTarget({ exerciseId: id, catalog: exerciseService.getById(id) }).target;
    const newT = F.buildDailyTarget({ exerciseId: id, catalog: exerciseService.getById(id), completionRulesVersion: V }).target;
    assert.deepEqual(oldT.detectorTarget, newT.detectorTarget, `${id}: same quantity condition as before`);
  }
  // a therapist "total" for F01-19 is the plan's setting, not source evidence
  const t19 = F.buildDailyTarget({ exerciseId: "F01-19", item: { dose: { sets: 2, repetitions: 10, countingBasis: "total" } }, catalog: exerciseService.getById("F01-19"), completionRulesVersion: V }).target;
  assert.deepEqual([t19.completionRule.kind, t19.completionRule.required, t19.planBasisEvidence, t19.planBasisSource], ["total", 20, "therapist_counting_basis", undefined]);
}

// ── B2-2 同一份來源 / B2-14 顯示 ────────────────────────────────────────────
{
  const u = "b2-same";
  const c = cycleWith(u, ["F01-05", "F01-17", "F01-08"]);
  assert.equal(prepare(u, c, "F01-05").ok, true);
  const e = entryOf(c);
  assert.equal(e.completionRulesVersion, V);
  assert.deepEqual(e.targets["F01-05"].formalDetectorConfig, { targetPerSide: 20 });
  // app read path, built from source
  const state = {};
  const deps = { state, trackingCycleService, toLocalDateKey: (d) => T.toLocalDateKey(d) };
  const app = new Function(...Object.keys(deps), `${fnSource("isF01FormalTrainingContext")}\n${fnSource("f01FormalDetectorConfig")}\n${constSource("f01FormalTargetReps")}\n${constSource("f01FormalTargetPerSide")}\nreturn { f01FormalDetectorConfig, f01FormalTargetReps, f01FormalTargetPerSide };`)(...Object.values(deps));
  Object.assign(state, { navigationOrigin: "f01Recommendation", exerciseContext: "self_practice", selectedExerciseId: "F01-05", f01RecommendationId: c.rec.id, f01TrainingContext: { cycleId: c.cycle.id, recommendationId: c.rec.id, exerciseId: "F01-05", userId: u, planDateKey: key(D2) } });
  // later changes to the catalog / plan do not change the frozen target
  const raw = exerciseService.getById("F01-05"); const saved = raw.defaultSets; raw.defaultSets = 9;
  recs.update(c.rec.id, { items: c.rec.items.map((it) => (it.exerciseId === "F01-05" ? { ...it, dose: { sets: 5, repetitions: 12, durationSeconds: null, countingBasis: "total" } } : it)) });
  try {
    assert.deepEqual(app.f01FormalDetectorConfig("F01-05"), { targetPerSide: 20 }, "detector start = frozen");
    assert.equal(app.f01FormalTargetPerSide("F01-05", "fallback"), 20);
    assert.equal(app.f01FormalTargetReps("F01-05", "fallback"), "fallback", "per-side training never gets a total target");
    assert.deepEqual(entryOf(c).targets["F01-05"].completionRule, { kind: "per_side", requiredPerSide: 20 }, "completion threshold = frozen");
  } finally { raw.defaultSets = saved; }
  // non-formal contexts: existing formulas
  state.navigationOrigin = "self_practice";
  assert.equal(app.f01FormalDetectorConfig("F01-05"), null);
  assert.equal(app.f01FormalTargetPerSide("F01-05", null), null);
}

// ── B2-3 每側 KN03 / B2-4 每側 HP01 / B2-5 合計 AK05 / B2-6 單筆 / B2-8 缺欄位 ───
{
  const u = "b2-complete";
  const c = cycleWith(u, ["F01-05", "F01-17", "F01-08"]);
  prepare(u, c, "F01-05");
  // B2-3 service: left 25 + right 15 = 40 total is NOT a per-side completion
  assert.equal(complete(u, c, rec(u, c, "F01-05", { totalReps: 40, leftReps: 25, rightReps: 15 })).error, "training_not_completed");
  // B2-8 missing side count -> not complete (never filled in)
  assert.equal(complete(u, c, rec(u, c, "F01-05", { totalReps: 40, rightReps: 20 })).error, "training_not_completed");
  const ok05 = complete(u, c, rec(u, c, "F01-05", { totalReps: 40, leftReps: 20, rightReps: 20 }));
  assert.equal(ok05.entry.exerciseCompletions["F01-05"].completionBasis, "frozen_per_side");
  assert.equal(ok05.entry.exerciseCompletions["F01-05"].completionRuleVersion, V);
  // B2-4
  assert.equal(complete(u, c, rec(u, c, "F01-08", { totalReps: 59, leftReps: 30, rightReps: 29 })).error, "training_not_completed");
  // the frozen rule alone decides: a record whose OLD detector flag says false still completes when it meets the frozen target
  assert.equal(complete(u, c, rec(u, c, "F01-08", { totalReps: 60, leftReps: 30, rightReps: 30, completed: false })).entry.exerciseCompletions["F01-08"].completionBasis, "frozen_per_side");
  // B2-5 / B2-6: 10 (completed by the OLD detector target) is not 20; two records of 10 never add up
  assert.equal(complete(u, c, rec(u, c, "F01-17", { totalReps: 10, targetReps: 10, completed: true })).error, "training_not_completed");
  assert.equal(complete(u, c, rec(u, c, "F01-17", { totalReps: 10, targetReps: 10, completed: true })).error, "training_not_completed");
  assert.ok(!entryOf(c).completedExerciseIds.includes("F01-17"), "no accumulation, no sets inferred");
  const ok17 = complete(u, c, rec(u, c, "F01-17", { totalReps: 20, targetReps: 20 }));
  assert.equal(ok17.entry.exerciseCompletions["F01-17"].completionBasis, "frozen_total");
  assert.equal(ok17.dayCompleted, true);
  assert.deepEqual(getCycle(c).completedTrainingDates, [key(D2)]);
  // pure single-record rule
  assert.equal(F.isFormalTargetMet({ totalReps: 19 }, { kind: "total", required: 20 }), false);
  assert.equal(F.isFormalTargetMet({ summary: { leftReps: 20, rightReps: null } }, { kind: "per_side", requiredPerSide: 20 }), false);

  // B2-3 detector sessions: per side requires BOTH sides (the total is never the threshold)
  function feedKn03(session, side, t0) {
    let t = t0;
    const frame = (l, r) => session.processFrame({ timestamp: (t += 160), leftKneeAngle: l, rightKneeAngle: r, leftHipAngle: 90, rightHipAngle: 90, trunkLeanDeg: 3, bodyReady: true });
    const up = [100, 130, 158, 170, 168, 145, 115, 105, 100];
    up.forEach((a) => (side === "left" ? frame(a, 100) : frame(100, a)));
    return t + 200;
  }
  const kn = createSeatedKneeExtensionSession({ targetReps: 99, targetPerSide: 2 });
  let t = 0; for (const side of ["left", "left", "left", "right"]) t = feedKn03(kn, side, t);
  let s = kn.getSummary();
  assert.deepEqual([s.leftReps, s.rightReps, s.totalReps, s.targetPerSide, s.targetReps, s.completed], [3, 1, 4, 2, 4, false], "KN03: total 4 = 2×2 but the right side is short");
  t = feedKn03(kn, "right", t); s = kn.getSummary();
  assert.equal(s.completed, true, "KN03: both sides reached 2");
  const knDefault = createSeatedKneeExtensionSession({ targetReps: 4 });
  t = 0; for (const side of ["left", "left", "left", "right"]) t = feedKn03(knDefault, side, t);
  assert.deepEqual([knDefault.getSummary().completed, knDefault.getSummary().targetPerSide], [true, undefined], "without targetPerSide the session is unchanged (total)");
  const cr = createSeatedKneeRaiseSession({ targetPerSide: 1 });
  let ts = 0; const feedCr = (l, r) => cr.processFrame({ timestamp: (ts += 150), leftHipAngle: l, rightHipAngle: r, trunkLeanDeg: 3, bodyReady: true });
  [[90, 90], [77, 90], [68, 90], [66, 90], [78, 90], [84, 90], [86, 90], [88, 90]].forEach(([l, r]) => feedCr(l, r));
  assert.deepEqual([cr.getSummary().leftReps, cr.getSummary().completed], [1, false], "CR05: one side only");
  [[90, 77], [90, 68], [90, 66], [90, 78], [90, 84], [90, 86], [90, 88]].forEach(([l, r]) => feedCr(l, r));
  assert.equal(cr.getSummary().completed, true, "CR05: both sides");
  const slr = createSideLegRaiseSession({ targetReps: 1, targetPerSide: 1 });
  [170, 154, 144, 134, 130, 140, 150, 163, 166, 169].forEach((a, i) => slr.processFrame({ timestamp: i * 250, leftHipAngle: a, rightHipAngle: 170, leftKneeAngle: 174, rightKneeAngle: 175, bodyRollDeg: 5, bodyReady: true }));
  assert.deepEqual([slr.getSummary().leftReps, slr.getSummary().completed, slr.getSummary().targetPerSide], [1, false, 1], "side leg raise: one side only");
  const clam = createClamshellSession({ targetReps: 1, targetPerSide: 1 });
  [0.05, 0.11, 0.16, 0.18, 0.20, 0.18, 0.14, 0.08, 0.06, 0.05].forEach((k, i) => clam.processFrame({ timestamp: i * 250, bodyReady: true, kneeSeparationRatio: k, feetSeparationRatio: 0.02, bodyRollDeg: 3, leftKneeAngle: 88, rightKneeAngle: 92 }));
  assert.equal(clam.getSummary().totalReps, 1);
  assert.equal(clam.getSummary().completed, false, "clamshell: 1 rep cannot satisfy both sides");
  const toe = createSingleLegToeRaiseSession({ targetReps: 1, targetPerSide: 1 });
  const ready = { bodyReady: true, leftHeelY: 0.8, rightHeelY: 0.7, leftToeLiftRatio: 0, rightToeLiftRatio: 0, leftDorsiflexionDeg: 0, rightDorsiflexionDeg: 0, leftKneeFlexionDeg: 6, rightKneeFlexionDeg: 8, leftFootTurnRatio: 0.05, rightFootTurnRatio: 0.05, leftLegScale: 0.3, rightLegScale: 0.3, pelvisTiltRatio: 0.02, trunkLeanDeg: 2 };
  const lifted = { ...ready, leftToeLiftRatio: 0.12, leftDorsiflexionDeg: 15 };
  [[0, ready], [200, ready], [400, lifted], [700, lifted], [1000, lifted], [1900, ready]].forEach(([tt, f]) => toe.processFrame({ timestamp: tt, ...f }));
  assert.deepEqual([toe.getSummary().leftReps, toe.getSummary().completed], [1, false], "AK08: one side only");
}

// ── B2-7 舊版週期不變 / B2-10 版本 ────────────────────────────────────────
{
  const u = "b2-old";
  const c = cycleWith(u, ["F01-05", "F01-17", "F01-08"], { version: null });
  assert.equal(getCycle(c).formalCompletionRulesVersion, undefined);
  assert.equal(prepare(u, c, "F01-17").ok, true);
  const e = entryOf(c);
  assert.equal(e.completionRulesVersion, undefined, "old-version cycle: snapshot carries no rules version");
  assert.equal(e.targets["F01-17"].completionRule, undefined);
  assert.equal(trackingCycleService.getF01FormalDetectorConfig({ cycleId: c.cycle.id, userId: u, dateKey: key(D2), exerciseId: "F01-17" }), null, "detectors keep their formulas");
  // old rule: the detector flag (10 reps counted as complete before batch 2, and still)
  const r = complete(u, c, rec(u, c, "F01-17", { totalReps: 10, targetReps: 10, completed: true }));
  assert.equal(r.entry.exerciseCompletions["F01-17"].completionBasis, "legacy_detector_flag");
  assert.equal(r.entry.exerciseCompletions["F01-17"].completionRuleVersion, null);
  // B2-10: a new-version cycle with an unversioned snapshot never falls back to the old rule
  const u2 = "b2-unversioned";
  const c2 = cycleWith(u2, ["F01-17"]);
  trackingCycleService.ensureDailyTrainingSnapshot({ cycleId: c2.cycle.id, userId: u2, dateKey: key(D3) }); // completion_fallback, no version
  assert.equal(complete(u2, c2, rec(u2, c2, "F01-17", { day: D3, totalReps: 99, targetReps: 1, completed: true })).error, "completion_target_unknown");
  assert.deepEqual(getCycle(c2).completedTrainingDates, []);
  assert.equal(complete(u2, c2, rec(u2, c2, "F01-17", { day: D2, totalReps: 99, completed: true })).error, "completion_target_unknown", "no snapshot -> nothing created, nothing completed");
  assert.equal(entryOf(c2, D2), undefined);
}

// ── B2-9 影響範圍 ─────────────────────────────────────────────────────────
{
  const wrapped = { goSquatDetection: "f01FormalTargetReps(ex.exerciseId", goLe05Detection: "f01FormalTargetReps(ex.exerciseId", goLe03Detection: "f01FormalTargetReps(ex.exerciseId",
    goKn03Detection: "f01FormalTargetPerSide(ex.exerciseId", goCr05Detection: "f01FormalTargetPerSide(ex.exerciseId",
    goHp01Detection: "f01FormalTargetPerSide(x.exerciseId", goHp02TrainingDetection: "f01FormalTargetPerSide(x.exerciseId", goHp03Detection: "f01FormalTargetPerSide(x.exerciseId", goHp07Detection: "f01FormalTargetPerSide(x.exerciseId",
    goHp04Detection: "f01FormalTargetPerSide(x.exerciseId", goHp05Detection: "f01FormalTargetPerSide(x.exerciseId", goHp06Detection: "f01FormalTargetPerSide(x.exerciseId",
    goAk05Detection: "f01FormalTargetReps(x.exerciseId", goAk06Detection: "f01FormalTargetReps(x.exerciseId", goAk08Detection: "f01FormalTargetPerSide(x.exerciseId" };
  for (const [fn, call] of Object.entries(wrapped)) assert.ok(fnSource(fn).includes(call), `${fn} uses the frozen formal target only through the helper`);
  assert.ok(!/f01Formal/.test(fnSource("goAk07Detection")), "F01-19 (AK07) detector untouched");
  for (const fn of ["goHp09Detection", "goAd01Detection", "goLe04Detection"]) assert.ok(!/f01Formal/.test(fnSource(fn)), `${fn} (not F01 formal) untouched`);
  // optional session parameter: absent -> identical summary keys / completion
  const plain = createSideLegRaiseSession({ targetReps: 1 });
  assert.equal("targetPerSide" in plain.getSummary(), false);
  // the five shared session files only gained the optional parameter
  for (const f of ["seatedKneeExtension", "seatedKneeRaise", "sideLegRaise", "clamshell", "singleLegToeRaise"]) {
    assert.ok(readFileSync(join(root, `js/ai/exercises/${f}/session.js`), "utf8").includes("targetPerSide"), f);
  }
}

// ── B2-11 D5 固定案例（D5 規則不改） ───────────────────────────────────────
const D5_CASES = [
  ["D5-1", -3500, 6, 6], ["D5-2", -3500, 6, 3], ["D5-3", -1000, 6, 5], ["D5-4", -1000, 1, 0],
  ["D5-5", 3500, 6, 2], ["D5-6", 3500, 1, 0], ["D5-7", null, 6, 0], ["D5-8", -3500, 6, null],
];
const d5Outputs = [];
{
  assert.deepEqual(SPEC.F01_D5_DECISION_RULES.map((r) => [r.ruleId, r.changeClass, r.trainingState, r.decision]), [
    ["R001", "any", "any", "no_auto_decision"], ["R002", "unclassified", "any", "no_auto_decision"],
    ["R003", "faster_beyond_reference_mdc", "none", "maintain"], ["R004", "faster_beyond_reference_mdc", "partial", "maintain"], ["R005", "faster_beyond_reference_mdc", "full", "progress"],
    ["R006", "within_reference_mdc", "none", "no_auto_decision"], ["R007", "within_reference_mdc", "partial", "maintain"], ["R008", "within_reference_mdc", "full", "maintain"],
    ["R009", "slower_beyond_reference_mdc", "none", "no_auto_decision"], ["R010", "slower_beyond_reference_mdc", "partial/full", "adjust"], ["R011", "any", "any", "adjust"],
  ], "D5 decision matrix unchanged");
  const run = (changeMs, days) => D.evaluateD5Decision({ assessmentValid: changeMs != null, changeMs, completedTrainingDays: days, hasNewOrWorseningDiscomfort: false, newLimitations: [], hardFilterConflictExerciseIds: [] });
  const expected = { "D5-1": ["R005", "R005"], "D5-2": ["R005", "R004"], "D5-3": ["R008", "R007"], "D5-4": ["R007", "R006"], "D5-5": ["R010", "R010"], "D5-6": ["R010", "R009"], "D5-7": ["R001", "R001"], "D5-8": ["R005", "R001"] };
  for (const [id, changeMs, oldDays, newDays] of D5_CASES) {
    const o = run(changeMs, oldDays), n = run(changeMs, newDays);
    d5Outputs.push({ case: id, changeMs, oldDays, newDays, old: { trainingState: o.trainingState, rule: o.decisionRuleId, decision: o.decision }, new: { trainingState: n.trainingState, rule: n.decisionRuleId, decision: n.decision } });
    assert.deepEqual([o.decisionRuleId, n.decisionRuleId], expected[id], id);
  }
}

// ── B2-12 LLM 結構不變 ────────────────────────────────────────────────────
{
  assert.equal(md5("js/data/d5LlmRecommendation.js"), md5("docs/verification/f01-batch2/backup-before/js/data/d5LlmRecommendation.js"), "D5 LLM input module unchanged");
  const ctx = assembleVerifiedContext({ cycle: { id: "c", userId: "u", completedTrainingDates: [] }, week: null });
  assert.deepEqual(Object.keys(ctx.training), ["completedDays", "formalRecordCount", "aiPostureAverage", "aiPostureScoreAvailable"]);
}

// ── B2-13 更嚴格 ─────────────────────────────────────────────────────────
{
  let checked = 0;
  for (const id of Object.keys(EXPECTED).filter((x) => x !== "F01-19")) {
    const raw = exerciseService.getById(id);
    const oldT = F.buildDailyTarget({ exerciseId: id, catalog: raw }).target;
    const rule = F.buildDailyTarget({ exerciseId: id, catalog: raw, completionRulesVersion: V }).target.completionRule;
    for (const l of [0, 5, 10, 15, 20, 25, 30, 40]) for (const r of [0, 5, 10, 15, 20, 25, 30, 40]) {
      const record = { totalReps: l + r, summary: { leftReps: l, rightReps: r, totalReps: l + r } };
      const oldDone = oldT.detectorTarget.unit === "reps_per_side" ? l >= oldT.detectorTarget.value && r >= oldT.detectorTarget.value : l + r >= oldT.detectorTarget.value;
      if (F.isFormalTargetMet(record, rule)) { assert.ok(oldDone, `${id} L${l} R${r}: new completion implies old completion`); checked += 1; }
    }
  }
  assert.ok(checked > 0);
}

// ── B2-15 每側進度顯示（決策 D） ───────────────────────────────────────────
{
  const els = new Map();
  const mk = (id, text = "", parent = null) => {
    const e = { id, className: "", textContent: text, style: {}, dataset: {}, parentElement: parent, children: [], _html: "",
      querySelector(sel) { return this.children.find((c) => c.className === sel.slice(1)) || null; },
      set innerHTML(h) { this._html = h; this.children = []; for (const m of h.matchAll(/<span id="([^"]+)">([^<]*)<\/span>/g)) this.children.push(mk(m[1], m[2], this)); this.textContent = h.replace(/<[^>]+>/g, ""); },
      get innerHTML() { return this._html; } };
    if (id) els.set(id, e);
    return e;
  };
  const counter = mk("kn03RepCounter"); const sep = mk(null, "/ 40", counter); sep.className = "squat-rep-counter-sep"; counter.children.push(sep);
  mk("kn03RepCounterValue", "0"); mk("kn03RepRingProgress"); const totalB = mk(null, ""); mk("kn03TotalReps", "0", totalB); mk("kn03LeftReps", "0"); mk("kn03RightReps", "0");
  const hpB = mk(null, ""); mk("hp04Left", "0", hpB); mk("hp04Right", "0", hpB); mk("hp04Counter"); mk("hp04Total"); mk("hp04Ring"); mk("hp04StatTotal", "0", mk(null));
  const { calculateProgressRatio } = await import("../js/ai/squatScore.js");
  const deps = { document: { getElementById: (id) => els.get(id) || null }, calculateProgressRatio };
  const app = new Function(...Object.keys(deps), `\n${constSource("F01_PER_SIDE_VIEW")}\n${fnSource("showF01PerSideProgress")}\nreturn { showF01PerSideProgress, F01_PER_SIDE_VIEW };`)(...Object.values(deps));
  app.showF01PerSideProgress(app.F01_PER_SIDE_VIEW.kn03, { targetPerSide: 20, leftReps: 25, rightReps: 15, totalReps: 40 });
  assert.equal(sep.textContent, "/ 每側 20");
  assert.equal(els.get("kn03RepCounterValue").textContent, "15", "ring value = weaker side");
  assert.deepEqual([els.get("kn03LeftReps").textContent, els.get("kn03RightReps").textContent], ["25 / 20", "15 / 20"]);
  assert.ok(totalB.textContent.includes("不作為完成門檻") && !totalB.textContent.includes("/ 40"), "total shown as a count, never the threshold");
  assert.equal(els.get("kn03RepRingProgress").style.strokeDashoffset, String(188.5 * (1 - 15 / 20)));
  app.showF01PerSideProgress(app.F01_PER_SIDE_VIEW.hp04, { targetPerSide: 30, leftReps: 12, rightReps: 10, totalReps: 22 });
  // (the fake DOM does not recompute a parent's textContent, so check the structure + the side elements)
  assert.equal(hpB.innerHTML, '左 <span id="hp04Left"></span>｜右 <span id="hp04Right"></span>');
  assert.deepEqual([els.get("hp04Left").textContent, els.get("hp04Right").textContent], ["12 / 30", "10 / 30"], "左 12 / 30｜右 10 / 30");
  // non-formal: no targetPerSide -> nothing touched
  els.get("kn03LeftReps").textContent = "7";
  app.showF01PerSideProgress(app.F01_PER_SIDE_VIEW.kn03, { leftReps: 7, rightReps: 3, totalReps: 10 });
  assert.equal(els.get("kn03LeftReps").textContent, "7");
  assert.ok(appJs.includes("目標 ${m.targetPerSide ? `每側 ${m.targetPerSide}` : m.targetReps} 次"), "AK08 instruction line is per side in formal per-side mode");
}

// ── B2-16 依來源補充的計量依據 ─────────────────────────────────────────────
{
  const t09 = F.buildDailyTarget({ exerciseId: "F01-09", catalog: exerciseService.getById("F01-09"), completionRulesVersion: V }).target;
  const t20 = F.buildDailyTarget({ exerciseId: "F01-20", catalog: exerciseService.getById("F01-20"), completionRulesVersion: V }).target;
  assert.deepEqual([t09.planCountingBasis, t09.planBasisEvidence, t09.completionRule.requiredPerSide], ["per_side", "source_sheet_repetitions", 30]);
  assert.deepEqual([t20.planCountingBasis, t20.planBasisEvidence, t20.completionRule.requiredPerSide], ["per_side", "source_sheet_steps", 20]);
  assert.ok(t09.planBasisSource.includes("每側10次") && t20.planBasisSource.includes("完成後換另一側"));
  assert.equal(exerciseService.getById("F01-09").repetitions, "10–20次交替", "catalog text unchanged");
  // catalog data for the three exercises is not modified (text + numeric defaults as read before batch 2)
  for (const [id, reps, sets, ds, dr] of [["F01-09", "10–20次交替", "3組", 3, 10], ["F01-19", "10~15次", "2-3組", 2, 10], ["F01-20", "10~15次", "2-3組", 2, 10]]) {
    const raw = exerciseService.getById(id);
    assert.deepEqual([raw.repetitions, raw.sets, raw.defaultSets, raw.defaultRepetitions], [reps, sets, ds, dr], `${id} catalog unchanged`);
  }
  // old-version cycles keep batch 1 labels
  assert.equal(F.buildDailyTarget({ exerciseId: "F01-09", catalog: exerciseService.getById("F01-09") }).target.planCountingBasis, "unspecified");
}

// ── B2-17 週期版本 ────────────────────────────────────────────────────────
{
  const u = "b2-version";
  const c = cycleWith(u, ["F01-04", "F01-01"]);
  assert.equal(getCycle(c).formalCompletionRulesVersion, V);
  prepare(u, c, "F01-04", D2); prepare(u, c, "F01-04", D3);
  for (const d of [D2, D3]) assert.equal(entryOf(c, d).completionRulesVersion, getCycle(c).formalCompletionRulesVersion, "every day's snapshot = the cycle's version");
  assert.equal(trackingCycleService.createOrGetTrackingCycle({ userId: "x", baselineSession: c.b, recommendation: c.rec, completionRulesVersion: "f01-formal-completion-9.9" }).error, "unknown_completion_rules_version");
}

// ── B2-18 計量待確認的阻擋 / B2-19 不被當成未完成 / B2-20 週摘要 / B2-25 顯示 ──
{
  // an ANOMALY: a new-version cycle whose plan gets F01-19 after the §3D check (bypassing it on purpose)
  const u = "b2-pending";
  const c = cycleWith(u, ["F01-17", "F01-18"]);
  recs.update(c.rec.id, { items: [...c.rec.items, { ...c.rec.items[0], rank: 3, exerciseId: "F01-19", exerciseName: "單腳提踵" }] });
  assert.equal(prepare(u, c, "F01-19").error, "counting_basis_pending", "B2-18: blocked at preparation");
  assert.equal(entryOf(c).targets["F01-19"].completionRule.kind, "counting_basis_pending");
  assert.ok(constSource("F01_FORMAL_BLOCK_TEXT").includes("counting_basis_pending") && constSource("F01_FORMAL_BLOCK_TEXT").includes("自主練習"));
  assert.ok(!/goSelfPractice|exerciseContext\s*=/.test(fnSource("returnToF01PlanForFormalBlock")), "never turned into self practice");
  // B2-19
  const status = F.getCompletedTrainingDaysStatus(getCycle(c));
  assert.deepEqual(status, { days: null, status: "measurement_pending" });
  assert.equal(D.countCompletedTrainingDays(getCycle(c)), null);
  const d5 = D.buildD5Proposal({ sourceCycle: getCycle(c), sourceRecommendation: recommendationService.getById(c.rec.id), comparison: { eligible: true, changeMs: -3500 }, input: NO_CHANGE, catalog });
  assert.deepEqual([d5.completedTrainingDays, d5.decisionRuleId, d5.decision], [null, "R001", "no_auto_decision"]);
  assert.equal(L.buildD5Envelope({ d5 }).allowedDecisions, null, "no LLM call");
  // the same situation in an OLD-version cycle keeps counting
  const old = cycleWith("b2-pending-old", ["F01-17"], { version: null });
  cycles.update(old.cycle.id, { completedTrainingDates: SIX_DAYS });
  assert.equal(D.countCompletedTrainingDays(getCycle(old)), 6);
  // B2-20 weekly summary
  const built = buildVerifiedWeeklyContext({ userId: u, cycleId: c.cycle.id, todayKey: key(D3) });
  assert.equal(built.context.training.completedDays, null);
  assert.deepEqual(built.schemaErrors, [], "schema accepts completedDays: null");
  const summary = buildFallbackSummary(built.context);
  const v = validateWeeklySummary(summary, built.context);
  assert.equal(v.passed, true, `validator accepts null: ${JSON.stringify(v.errors)}`);
  const text = JSON.stringify(summary) + fallbackNarrative(built.context);
  // displayed TEXT only (JSON null values in the object are data, not wording)
  const shown = [summary.userSummary.trainingSummary, summary.professionalSummary.trainingSummary, fallbackNarrative(built.context)].join(" ");
  assert.ok(shown.includes("尚未提供") && !/0 天|0 個正式訓練日|尚未完成正式訓練|null/.test(shown), `never 0 / not trained / null: ${shown}`);
  // B2-25 displays
  const fmt = new Function(`${fnSource("fmtF01TrainingDays")}\nreturn fmtF01TrainingDays;`)();
  assert.equal(fmt(null), "待確認（計量方式未定）");
  assert.equal(fmt(3), "3 天");
  assert.equal(T.buildTrackingCardModel(T.getTrackingCycleViewState(getCycle(c), key(D3)), { completedDays: null }).facts.find((f) => f.label.includes("完成")).value, "待確認");
  const progress = functionalProgressService.getFunctionalProgress(u, key(D3));
  assert.equal(progress.currentCycle.completedTrainingDays, null);
  assert.equal(functionalProgressService.getTrackingTimeline(u, key(D3)).weeks[0].completedDays, null);
  const milestones = ADV.deriveF01Milestones({ cycle: getCycle(c), viewState: T.getTrackingCycleViewState(getCycle(c), key(D3)) });
  assert.equal(milestones.trainingDays, null);
  assert.ok(readFileSync(join(root, "js/data/f01AdventureProgress.js"), "utf8").includes("本週訓練日待確認"));
  for (const site of ["${fmtF01TrainingDays(cur.completedTrainingDays)}", "${fmtF01TrainingDays(cmp.completedTrainingDays)}", "${fmtF01TrainingDays(d5.completedTrainingDays)}", "${fmtF01TrainingDays(w.completedDays)}", "fmtF01TrainingDays(completedDays)"]) {
    assert.ok(appJs.includes(site), `display site formats unknown days: ${site}`);
  }
  assert.ok(!/\$\{(cur|cmp|d5)\.completedTrainingDays\} 天|\$\{w\.completedDays\} 天|\$\{completedDays\} 天/.test(appJs), "no raw `${n} 天` left");
}

// ── B2-21 審閱表單計量方式（C） ───────────────────────────────────────────
{
  const p = { selectedGoalId: "G03", d5: { currentLimitations: [] } };
  const options = R.listD5ReviewOptions(p);
  for (const o of options) assert.deepEqual(o.countingOptions, F.countingOptionsFor(o.exerciseId), `${o.exerciseId} options`);
  const opt = (id) => R.listD5ReviewOptions({ selectedGoalId: "G05", d5: { currentLimitations: [] } }).concat(options).find((o) => o.exerciseId === id);
  assert.deepEqual(opt("F01-05").countingOptions, ["total", "per_side"]);
  assert.deepEqual(opt("F01-08").countingOptions, ["per_side"]);
  assert.deepEqual(opt("F01-19").countingOptions, ["total"]);
  assert.equal(opt("F01-19").countingBasisRequiredWithoutReps, true);
  assert.equal(opt("F01-05").countingBasisRequiredWithoutReps, false);
  const allOpts = [opt("F01-05"), opt("F01-19"), opt("F01-17")];
  const check = (items) => R.validateD5ReviewItems(items, allOpts, { requireCountingBasis: true });
  assert.equal(check([{ exerciseId: "F01-05", sets: 2, repetitions: 12 }]).error, "review_counting_basis_required");
  assert.equal(check([{ exerciseId: "F01-05", sets: 2, repetitions: 12, countingBasis: "left_only" }]).error, "review_counting_basis_unsupported");
  assert.equal(check([{ exerciseId: "F01-19" }]).error, "review_counting_basis_required", "F01-19 needs a choice even without a count");
  assert.equal(check([{ exerciseId: "F01-19", countingBasis: "per_side" }]).error, "review_counting_basis_unsupported");
  const ok = check([{ exerciseId: "F01-05", sets: 2, repetitions: 12, countingBasis: "per_side" }, { exerciseId: "F01-19", countingBasis: "total" }, { exerciseId: "F01-17" }]);
  assert.deepEqual(ok.items, [
    { exerciseId: "F01-05", dose: { sets: 2, repetitions: 12, durationSeconds: null, countingBasis: "per_side" } },
    { exerciseId: "F01-19", dose: { sets: null, repetitions: null, durationSeconds: null, countingBasis: "total" } },
    { exerciseId: "F01-17", dose: null },
  ]);
  assert.deepEqual(R.validateD5ReviewItems([{ exerciseId: "F01-05", sets: 2, repetitions: 12 }], allOpts).items[0].dose, { sets: 2, repetitions: 12, durationSeconds: null }, "old flow (no version) unchanged");
  // fingerprint: includes the basis, and is byte-identical for data saved before batch 2
  const prop = { items: [{ exerciseId: "F01-05", dose: { sets: 2, repetitions: 12, durationSeconds: null } }], d5: {} };
  const oldStyle = JSON.stringify({ items: [{ exerciseId: "F01-05", dose: { sets: 2, repetitions: 12, durationSeconds: null } }], basis: A.reviewBasis(prop) });
  assert.equal(A.planFingerprint(prop), oldStyle, "pre-batch-2 fingerprints unchanged");
  assert.notEqual(A.planFingerprint({ ...prop, items: [{ exerciseId: "F01-05", dose: { ...prop.items[0].dose, countingBasis: "per_side" } }] }), oldStyle);
  assert.notEqual(A.planFingerprint({ ...prop, items: [{ exerciseId: "F01-05", dose: { ...prop.items[0].dose, countingBasis: "per_side" } }] }), A.planFingerprint({ ...prop, items: [{ exerciseId: "F01-05", dose: { ...prop.items[0].dose, countingBasis: "total" } }] }));
  // form: no single-side option; F01-19 note says it is the plan's setting
  const control = fnSource("renderD5ReviewCountingControl");
  assert.ok(control.includes("不代表已有來源依據") && !/指定側|left_only|right_only/.test(control + constSource("F01_COUNTING_LABEL")));
}

// ── B2-22 F01-19 排除 ────────────────────────────────────────────────────
{
  const gen = (goal, minutes, lims = [], exclude = true) => generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: "s", assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, limitationIds: lims, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: exclude });
  const ids = (r) => r.items.map((i) => i.exerciseId);
  assert.deepEqual(ids(gen("G05", 10)), ["F01-17"]);
  assert.deepEqual(ids(gen("G05", 15)), ["F01-17", "F01-18"]);
  assert.deepEqual(ids(gen("G05", 20)), ["F01-17", "F01-18", "F01-20"]);
  const l05 = gen("G05", 20, ["L05"]);
  assert.deepEqual(ids(l05), ["F01-17", "F01-18"]);
  assert.deepEqual(l05.shortfall, { requested: 3, available: 2 });
  assert.deepEqual(gen("G05", 20).excluded.find((e) => e.exerciseId === "F01-19"), { exerciseId: "F01-19", exerciseName: "單腳提踵", reason: "counting_basis_pending" });
  assert.deepEqual(ids(gen("G05", 20, [], false)), ["F01-17", "F01-18", "F01-19"], "without the opt-in the generator is unchanged");
  const LIMS = ["L01", "L02", "L03", "L04", "L05"];
  for (const g of ["G02", "G04"]) for (const t of [null, 10, 15, 20]) for (let m = 0; m < 32; m++) {
    const lims = LIMS.filter((_, i) => m & (1 << i));
    assert.deepEqual(ids(gen(g, t, lims)), ids(gen(g, t, lims, false)), `${g}/${t}/${lims}: unchanged`);
  }
  assert.ok(exerciseService.getById("F01-19"), "F01-19 data kept");
  // D5: G05 progress -> no Confirmed progression left for F01-17 -> NC-P01 fallback maintain
  const u = "b2-g05";
  const b = baseline(u);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog, excludeAutoRecommendationPending: true });
  const plan = recommendationService.createF01GoalRecommendation({ patientId: u, result: r, createdBy: u }).recommendation;
  const cyc = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: plan }).cycle;
  cycles.update(cyc.id, { completedTrainingDates: SIX_DAYS });
  const re = baseline(u, { ms: 8500, when: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cyc.id, baselineAssessmentId: b.id } });
  assert.equal(trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cyc.id, userId: u, reassessment: re, todayDateKey: key(D7) }).linked, true);
  const ev = trackingCycleService.evaluateD5Proposal({ cycleId: cyc.id, userId: u, input: NO_CHANGE, catalog, excludeAutoRecommendationPending: true }).proposal;
  assert.deepEqual([ev.d5.matrixDecision, ev.d5.decision, ev.d5.selectionRuleId, ev.d5.selectionFallback, ev.d5.proposedExerciseIds], ["progress", "maintain", "NC-P01", "no_confirmed_progression", ["F01-17", "F01-18"]]);
  const ld = trackingCycleService.loadD5Proposal({ proposalId: ev.id, userId: u });
  const prep = DRAFT.prepareD5LlmRequest({ proposal: ev, ctx: ld.ctx, excludeAutoRecommendationPending: true });
  assert.ok(!JSON.stringify(prep.candidates.options).includes("F01-19"), "LLM candidate options never offer F01-19");
  assert.ok(prep.candidates.notOffered.some((row) => JSON.stringify(row).includes("F01-19") && row.why === "not_in_catalog"), "the 17→19 row is listed as not offered");
}

// ── B2-23 生效前檢查 / B2-24 上線前已接受的提案 ──────────────────────────────
{
  // (1) Phase C cycle creation
  const u = "b2-gate";
  const b = baseline(u);
  const with19 = planWith(u, b, ["F01-17", "F01-19"], "G05");
  const blocked = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: with19, completionRulesVersion: V });
  assert.equal(blocked.error, "counting_basis_undefined");
  assert.deepEqual(blocked.undefinedItems.map((x) => x.exerciseId), ["F01-19"]);
  assert.ok(fnSource("generateF01RecommendationFromSetup").includes('tracked.error === "counting_basis_undefined"') && fnSource("generateF01RecommendationFromSetup").includes("alert("), "Phase C shows an explanation");
  assert.ok(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: planWith(u, b, ["F01-17", "F01-18"], "G05"), completionRulesVersion: V }).cycle, "all defined -> created");
  // (2) D5 arrangement + (3) acceptance / next cycle
  const u2 = "b2-gate-d5";
  const b2 = baseline(u2);
  const plan = planWith(u2, b2, ["F01-17", "F01-19"], "G05");
  const cyc = trackingCycleService.createOrGetTrackingCycle({ userId: u2, baselineSession: b2, recommendation: plan }).cycle; // old-version source cycle (pre batch 2)
  cycles.update(cyc.id, { completedTrainingDates: SIX_DAYS });
  const re = baseline(u2, { ms: 11500, when: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cyc.id, baselineAssessmentId: b2.id } });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cyc.id, userId: u2, reassessment: re, todayDateKey: key(D7) });
  const p = trackingCycleService.evaluateD5Proposal({ cycleId: cyc.id, userId: u2, input: NO_CHANGE, catalog, excludeAutoRecommendationPending: true }).proposal;
  assert.equal(p.d5.decision, "maintain");
  assert.ok(p.items.some((i) => i.exerciseId === "F01-19"), "maintain keeps the current F01-19");
  const arrV = A.resolveD5Arrangement(p, { completionRulesVersion: V });
  assert.equal(arrV.status, "needs_review");
  assert.ok(arrV.reasons.some((x) => x.code === "counting_basis_missing"));
  assert.equal(A.resolveD5Arrangement(p).status, "ready", "without the version (old flow) unchanged");
  const conf = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u2, confirmationDateKey: key(D7), completionRulesVersion: V });
  assert.deepEqual([conf.error, conf.arrangementStatus], ["not_confirmable", "needs_review"], "cannot be accepted under the new version");
  // B2-24: accepted WITHOUT the version (as before batch 2) -> next cycle is old-version, items untouched
  const confOld = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u2, confirmationDateKey: key(D7) });
  assert.ok(confOld.cycle, "old acceptance still creates the next cycle");
  assert.equal(confOld.cycle.formalCompletionRulesVersion, undefined, "next cycle of a pre-batch-2 acceptance stays old-version");
  assert.equal(recommendationService.getById(p.id).d5.confirmation.completionRulesVersion, undefined);
  assert.deepEqual(recommendationService.getById(p.id).items.map((i) => i.exerciseId), p.items.map((i) => i.exerciseId), "accepted items not modified");
  // (3) defensive check in createNextTrackingCycle: a versioned acceptance whose items lack a definition
  const u3 = "b2-gate-next";
  const b3 = baseline(u3);
  const plan3 = planWith(u3, b3, ["F01-17", "F01-18"], "G05");
  const cyc3 = trackingCycleService.createOrGetTrackingCycle({ userId: u3, baselineSession: b3, recommendation: plan3 }).cycle;
  cycles.update(cyc3.id, { completedTrainingDates: SIX_DAYS });
  const re3 = baseline(u3, { ms: 11500, when: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cyc3.id, baselineAssessmentId: b3.id } });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cyc3.id, userId: u3, reassessment: re3, todayDateKey: key(D7) });
  const p3 = trackingCycleService.evaluateD5Proposal({ cycleId: cyc3.id, userId: u3, input: NO_CHANGE, catalog, excludeAutoRecommendationPending: true }).proposal;
  const c3 = trackingCycleService.confirmD5Proposal({ proposalId: p3.id, userId: u3, confirmationDateKey: "2026-10-05", completionRulesVersion: V }); // later day -> fresh baseline needed
  assert.equal(c3.requiresFreshBaseline, true);
  assert.equal(recommendationService.getById(p3.id).d5.confirmation.completionRulesVersion, V, "version stamped on the acceptance");
  const tampered = recommendationService.getById(p3.id);
  recs.update(p3.id, { items: [...tampered.items, { ...tampered.items[0], rank: 3, exerciseId: "F01-19" }], d5: { ...tampered.d5, confirmation: { ...tampered.d5.confirmation, planFingerprint: A.planFingerprint({ ...tampered, items: [...tampered.items, { ...tampered.items[0], rank: 3, exerciseId: "F01-19" }] }) } } });
  const later = new Date(Date.now() + 60000); // a fresh baseline must be measured after the (real-clock) acceptance
  const fresh = baseline(u3, { ms: 11000, when: [later.getFullYear(), later.getMonth(), later.getDate(), later.getHours(), later.getMinutes()], role: { assessmentRole: "next_cycle_baseline", sourceCycleId: cyc3.id, d5ProposalId: p3.id } });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u3, proposalId: p3.id, baselineSession: fresh }).error, "counting_basis_undefined");
  // all defined -> the next cycle is new-version
  recs.update(p3.id, { items: tampered.items, d5: tampered.d5 });
  const made = trackingCycleService.createNextTrackingCycle({ userId: u3, proposalId: p3.id, baselineSession: fresh });
  assert.equal(made.cycle.formalCompletionRulesVersion, V, "next cycle inherits the acceptance's version");
}

// app wiring: every new-version entry point opts in
{
  assert.ok(fnSource("generateF01RecommendationFromSetup").includes("excludeAutoRecommendationPending: true") && fnSource("generateF01RecommendationFromSetup").includes("completionRulesVersion: F01_FORMAL_COMPLETION_RULES_VERSION"));
  assert.ok(appJs.includes("confirmationDateKey: toLocalDateKey(new Date()), completionRulesVersion: F01_FORMAL_COMPLETION_RULES_VERSION"));
  assert.ok(appJs.includes("excludeAutoRecommendationPending: true, // F01 batch 2 §3B\n  });") || appJs.includes("excludeAutoRecommendationPending: true, // F01 batch 2 §3B"));
  assert.ok(appJs.includes("isStillCurrent: () => getCurrentPatientId() === userId, excludeAutoRecommendationPending: true"));
  assert.ok(appJs.includes("{ completionRulesVersion: F01_FORMAL_COMPLETION_RULES_VERSION });") && appJs.includes("listD5ReviewsForPatient({ therapistId, patientId, completionRulesVersion: F01_FORMAL_COMPLETION_RULES_VERSION })"));
}

console.log("D5_FIXED_CASES " + JSON.stringify(d5Outputs));
console.log("F01 batch 2 completion alignment tests passed (synthetic data; not a completion-accuracy or clinical validation)");
