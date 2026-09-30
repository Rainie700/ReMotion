import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Phase D5 — pure next-cycle decision engine (js/data/f01ProgressionDecision.js)
 * against docs/specs/ReMotion_D5_DecisionRules.xlsx (D5-0 V1). No Firebase,
 * no storage writes, no clock.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const D = await import("../js/data/f01ProgressionDecision.js");
const S = await import("../js/data/f01ProgressionSpec.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const catalog = exerciseService.listNormalized();
const engineSrc = readFileSync(join(root, "js/data/f01ProgressionDecision.js"), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const { D5_DECISION: DEC, CHANGE_CLASS: CC, TRAINING_STATE: TS, CONFIRMATION_MODE: CM } = D;
const item = (exerciseId, matchLevel = "direct") => ({ exerciseId, matchLevel });
const select = (decision, goal, ids, lims = [], transitions) =>
  D.selectNextCycleExercises({ decision, selectedGoalId: goal, currentItems: ids.map((x) => (typeof x === "string" ? item(x) : x)), currentLimitations: lims, catalog, ...(transitions ? { transitions } : {}) });

// 0. Spec module is the locked V1 workbook
{
  assert.equal(S.F01_PROGRESSION_SPEC_SOURCE.sha256, "dbbfaaa8498e42a5c143e5e3de5e608782ad41a57b1ba383bbcd4635cdd8a3e7");
  assert.equal(D.D5_RULE_VERSION, "D5-0-V1");
  assert.equal(D.REFERENCE_MDC_MS, 3120);
  assert.equal(S.F01_CHANGE_REFERENCE.referenceMdcPercentUse, "not_used_in_D5_V1");
  assert.deepEqual(S.F01_D5_DECISION_RULES.map((r) => r.ruleId), ["R001", "R002", "R003", "R004", "R005", "R006", "R007", "R008", "R009", "R010", "R011"]);
  assert.ok(S.F01_D5_DECISION_RULES.every((r) => r.status === "Confirmed" && r.autoApplyAllowed === false));
  assert.ok(S.F01_D5_DECISION_RULES.every((r) => Object.values(DEC).includes(r.decision)), "only the 4 decision codes");
  assert.ok(!Object.values(DEC).includes("regress"), "no fifth 'regress' decision");
  assert.equal(S.F01_EXERCISE_TRANSITIONS.length, 24);
}

// 42. Change classification on RAW ms
{
  assert.equal(D.classify5xSTSChange(-3120), CC.FASTER);
  assert.equal(D.classify5xSTSChange(-3119), CC.WITHIN);
  assert.equal(D.classify5xSTSChange(0), CC.WITHIN);
  assert.equal(D.classify5xSTSChange(3119), CC.WITHIN);
  assert.equal(D.classify5xSTSChange(3120), CC.SLOWER);
  assert.equal(D.classify5xSTSChange(-3119.6), CC.WITHIN, "never rounded to -3.12 s before comparing");
  assert.equal(D.classify5xSTSChange(3119.9), CC.WITHIN);
  assert.equal(D.classify5xSTSChange(NaN), CC.UNCLASSIFIED);
  assert.equal(D.classify5xSTSChange(null), CC.UNCLASSIFIED);
  assert.equal(D.classify5xSTSChange("-4000"), CC.UNCLASSIFIED);
  assert.ok(!/toFixed|Math\.round/.test(stripComments(engineSrc.slice(engineSrc.indexOf("export function classify5xSTSChange"), engineSrc.indexOf("export function classifyTrainingExposure")))));
}

// 43. Training exposure
{
  assert.equal(D.classifyTrainingExposure(0), TS.NONE);
  assert.equal(D.classifyTrainingExposure(1), TS.PARTIAL);
  assert.equal(D.classifyTrainingExposure(5), TS.PARTIAL);
  assert.equal(D.classifyTrainingExposure(6), TS.FULL);
  assert.equal(D.classifyTrainingExposure(7), null);
  assert.equal(D.classifyTrainingExposure(-1), null);
  assert.equal(D.classifyTrainingExposure(2.5), null);
  assert.equal(D.PLANNED_TRAINING_DAYS, 6);
  const cycle = { cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", completedTrainingDates: ["2026-09-28", "2026-09-28", "2026-09-30", "2026-10-04", "2026-09-27", "bad"] };
  assert.equal(D.countCompletedTrainingDays(cycle), 2, "unique Day 1-6 dates only");
}

// 44. 3×3 matrix — all nine cells
{
  const cell = (changeMs, days) => D.evaluateD5Decision({ assessmentValid: true, changeMs, completedTrainingDays: days });
  const F = -4000, W = 0, SL = 4000;
  const expected = [
    [F, 0, DEC.MAINTAIN, "R003"], [F, 3, DEC.MAINTAIN, "R004"], [F, 6, DEC.PROGRESS, "R005"],
    [W, 0, DEC.NO_AUTO_DECISION, "R006"], [W, 3, DEC.MAINTAIN, "R007"], [W, 6, DEC.MAINTAIN, "R008"],
    [SL, 0, DEC.NO_AUTO_DECISION, "R009"], [SL, 3, DEC.ADJUST, "R010"], [SL, 6, DEC.ADJUST, "R010"],
  ];
  for (const [ms, days, decision, ruleId] of expected) {
    const r = cell(ms, days);
    assert.equal(r.decision, decision, `${ms}ms × ${days}d`);
    assert.equal(r.decisionRuleId, ruleId, `${ms}ms × ${days}d rule`);
    assert.equal(r.gate, "GATE-MATRIX");
    assert.equal(r.autoApplyAllowed, false);
    assert.equal(r.decisionRuleVersion, "D5-0-V1");
  }
}

// 45. Precedence
{
  const invalid = D.evaluateD5Decision({ assessmentValid: false, changeMs: -5000, completedTrainingDays: 6, hasNewOrWorseningDiscomfort: true, newLimitations: ["L05"] });
  assert.equal(invalid.decision, DEC.NO_AUTO_DECISION);
  assert.equal(invalid.decisionRuleId, "R001");
  assert.equal(invalid.gate, "GATE-VALIDITY");
  const badDays = D.evaluateD5Decision({ assessmentValid: true, changeMs: -5000, completedTrainingDays: 9 });
  assert.equal(badDays.decision, DEC.NO_AUTO_DECISION, "unclassifiable exposure is invalid data");

  const discomfort = D.evaluateD5Decision({ assessmentValid: true, changeMs: -5000, completedTrainingDays: 6, hasNewOrWorseningDiscomfort: true });
  assert.equal(discomfort.decision, DEC.ADJUST);
  assert.equal(discomfort.decisionRuleId, "R011");
  assert.equal(discomfort.progressionBlocked, true);
  assert.deepEqual(discomfort.gate2Triggers, ["new_or_worsening_discomfort"]);

  const newLim = D.evaluateD5Decision({ assessmentValid: true, changeMs: -5000, completedTrainingDays: 6, newLimitations: ["L03"] });
  assert.equal(newLim.decision, DEC.ADJUST);
  assert.equal(newLim.gate, "GATE-LIMITATION");

  const unclassified = D.evaluateD5Decision({ assessmentValid: true, changeMs: undefined, completedTrainingDays: 6 });
  assert.equal(unclassified.decisionRuleId, "R002");
  assert.equal(unclassified.decision, DEC.NO_AUTO_DECISION);
}

// 46. Limitations
{
  assert.deepEqual(D.deriveNewLimitations(["L05"], []), []);
  assert.deepEqual(D.deriveNewLimitations([], ["L05"]), ["L05"]);
  assert.deepEqual(D.deriveNewLimitations(["L02"], ["L05", "L02"]), ["L05"]);
  assert.deepEqual(D.deriveNewLimitations(null, ["L01", "L05"]), [], "unknown previous snapshot never makes everything new");
  assert.deepEqual(D.deriveNewLimitations(undefined, ["L05"]), []);
  assert.deepEqual(D.deriveNewLimitations([], ["L99", "L05"]), ["L05"], "only L01-L05 exist");
  assert.equal(D.hasLimitationChanged(["L05"], []), true, "removal is a change (UI / audit) ...");
  assert.equal(D.evaluateD5Decision({ assessmentValid: true, changeMs: -5000, completedTrainingDays: 6, newLimitations: D.deriveNewLimitations(["L05"], []) }).decision, DEC.PROGRESS, "... but never a Gate 2 trigger");
  assert.equal(D.hasLimitationChanged(null, ["L05"]), null);

  // Snapshot precedence: cycle snapshot -> recommendation limitationIds -> unknown
  assert.deepEqual(D.resolvePreviousLimitationsSnapshot({ cycle: { limitationsSnapshot: ["L02"] }, recommendation: { limitationIds: ["L05"] } }), { limitations: ["L02"], known: true, source: "cycle_limitations_snapshot" });
  assert.deepEqual(D.resolvePreviousLimitationsSnapshot({ cycle: {}, recommendation: { limitationIds: ["L05"] } }), { limitations: ["L05"], known: true, source: "recommendation_limitation_ids" });
  assert.deepEqual(D.resolvePreviousLimitationsSnapshot({ cycle: {}, recommendation: {} }), { limitations: null, known: false, source: null });

  assert.deepEqual(D.normalizeD5Input({ hasNewOrWorseningDiscomfort: false, currentLimitations: ["L05", "L01", "L05"], discomfortNote: "  " }).input, { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: ["L01", "L05"] });
  assert.equal(D.normalizeD5Input({ hasNewOrWorseningDiscomfort: false, currentLimitations: ["L06"] }).error, "unknown_limitation", "no invented limitation");
  assert.equal(D.normalizeD5Input({ currentLimitations: [] }).error, "missing_discomfort_answer");
  assert.equal(D.normalizeD5Input({ hasNewOrWorseningDiscomfort: true }).error, "missing_current_limitations");
}

// 47. Transitions — Confirmed only; nothing derived from ids
{
  const T = S.F01_EXERCISE_TRANSITIONS;
  assert.equal(D.getConfirmedTransitions({ fromExerciseId: "F01-17", goalId: "G05", transitionType: "progression" }).length, 1);
  assert.equal(D.getConfirmedTransitions({ fromExerciseId: "F01-18", goalId: "G05", transitionType: "progression" }).length, 0, "Pending 18->20");
  assert.equal(D.getConfirmedTransitions({ fromExerciseId: "F01-15", goalId: "G04", transitionType: "same_goal_replacement" }).map((t) => t.candidateExerciseId).join(), "F01-13", "Draft 15->16 excluded");
  assert.ok(T.some((t) => t.status === "Draft") && T.some((t) => t.status === "Pending"));

  // A Confirmed row enters the pool; the same row as Draft / Pending does not.
  const row = { currentExerciseId: "F01-07", goalId: "G03", transitionType: "progression", candidateExerciseId: "F01-05", status: "Confirmed", evidenceType: "Engineering Rule" };
  assert.equal(select(DEC.PROGRESS, "G03", ["F01-07"], [], [row]).replacedExercise.toExerciseId, "F01-05");
  for (const status of ["Draft", "Pending"]) {
    const r = select(DEC.PROGRESS, "G03", ["F01-07"], [], [{ ...row, status }]);
    assert.equal(r.replacedExercise, null, `${status} never used`);
    assert.equal(r.effectiveDecision, DEC.MAINTAIN);
  }
  // F01-07 / F01-14 have no transition at all: no id-based guess (e.g. F01-07 -> F01-08).
  const none = select(DEC.PROGRESS, "G03", ["F01-07"]);
  assert.equal(none.replacedExercise, null);
  assert.deepEqual(none.proposedExerciseIds, ["F01-07"]);
  assert.ok(!/(parseInt|Number)\([^)]*exerciseId|\.slice\(4\)|localeCompare\([^)]*\) *[<>]/.test(stripComments(engineSrc)), "no difficulty from id");
}

// 48. Progress
{
  // EX-01: G02 F01-04 + F01-10 -> F01-02 + F01-10 (one edge, never straight to F01-01)
  const ex01 = select(DEC.PROGRESS, "G02", ["F01-04", "F01-10"]);
  assert.deepEqual(ex01.proposedExerciseIds, ["F01-02", "F01-10"]);
  assert.equal(ex01.replacedExercise.fromExerciseId, "F01-04");
  assert.equal(ex01.replacedExercise.transitionType, "progression");
  assert.ok(!ex01.proposedExerciseIds.includes("F01-01"), "no skipping F01-04 -> F01-01");
  assert.equal(ex01.maxReplace, 1);

  // Max one replacement even when every current exercise has an eligible progression
  const twoEdges = [
    { currentExerciseId: "F01-04", goalId: "G02", transitionType: "progression", candidateExerciseId: "F01-02", status: "Confirmed" },
    { currentExerciseId: "F01-17", goalId: "G02", transitionType: "progression", candidateExerciseId: "F01-19", status: "Confirmed" },
  ];
  const two = select(DEC.PROGRESS, "G02", ["F01-04", "F01-17"], [], twoEdges);
  assert.deepEqual(two.proposedExerciseIds, ["F01-02", "F01-17"], "at most one exercise replaced per cycle");

  // EX-02: G05 F01-17 + F01-18 -> F01-19 + F01-18 (Pending 18->20 unused)
  assert.deepEqual(select(DEC.PROGRESS, "G05", ["F01-17", "F01-18"]).proposedExerciseIds, ["F01-19", "F01-18"]);

  // Target ranking: Direct before Supporting, then recommendation order
  const ranked = select(DEC.PROGRESS, "G02", [item("F01-09", "supporting"), item("F01-04", "direct")]);
  assert.equal(ranked.replacedExercise.fromExerciseId, "F01-04", "Direct current exercise first");

  // No eligible progression -> maintain
  const noProg = select(DEC.PROGRESS, "G04", ["F01-10", "F01-13"]);
  assert.equal(noProg.effectiveDecision, DEC.MAINTAIN);
  assert.equal(noProg.fallback, "no_confirmed_progression");
  assert.deepEqual(noProg.proposedExerciseIds, ["F01-10", "F01-13"]);

  // Duplicate candidate excluded: F01-04 -> F01-02 while F01-02 is already in the set
  const dup = select(DEC.PROGRESS, "G02", ["F01-04", "F01-02"]);
  assert.notEqual(dup.replacedExercise && dup.replacedExercise.toExerciseId, "F01-02");
  assert.equal(new Set(dup.proposedExerciseIds).size, dup.proposedExerciseIds.length, "no duplicate exercise");
  assert.deepEqual(dup.proposedExerciseIds, ["F01-04", "F01-01"], "only the non-duplicate edge F01-02 -> F01-01 remains");

  // Wrong goal excluded: F01-04 -> F01-02 is a G02 edge; in G01 it is not used
  const g01 = select(DEC.PROGRESS, "G01", ["F01-04"]);
  assert.equal(g01.replacedExercise, null);
  assert.equal(g01.effectiveDecision, DEC.MAINTAIN);
}

// 49. Hard filter always wins
{
  // F01-09 -> F01-11 (G04 Confirmed progression); L01 excludes F01-11 in Phase C.
  const blocked = select(DEC.PROGRESS, "G04", ["F01-09"], ["L01"]);
  assert.ok(!blocked.proposedExerciseIds.includes("F01-11"));
  assert.equal(blocked.effectiveDecision, DEC.MAINTAIN);
  // F01-17 -> F01-19 (Confirmed): F01-19 is excluded by the Phase C filter it actually matches (L03).
  const heel = select(DEC.PROGRESS, "G05", ["F01-17"], ["L03"]);
  assert.ok(!heel.proposedExerciseIds.includes("F01-19"));
  // EX-04 style: current F01-19 hit by a limitation -> Confirmed regression F01-17, position kept.
  const ex04 = select(DEC.ADJUST, "G05", ["F01-19", "F01-18"], ["L03"]);
  assert.equal(ex04.selectionRuleId, "NC-A01");
  assert.deepEqual(ex04.proposedExerciseIds, ["F01-17", "F01-18"]);
  assert.equal(ex04.replacedExercise.transitionType, "regression");
  assert.equal(ex04.nextCycleReady, true);
  // Hard filter beats maintain as well (a conflict routes to NC-A01).
  assert.equal(select(DEC.MAINTAIN, "G05", ["F01-19", "F01-18"], ["L03"]).selectionRuleId, "NC-A01");
  // Every proposed exercise passes the current limitations.
  for (const lims of [["L01"], ["L02"], ["L03"], ["L05"], ["L01", "L02", "L03", "L04", "L05"]]) {
    for (const goal of ["G01", "G02", "G03", "G04", "G05"]) {
      const cur = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: "s", assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, catalog }).items.map((it) => item(it.exerciseId, it.matchLevel));
      for (const decision of [DEC.MAINTAIN, DEC.PROGRESS, DEC.ADJUST]) {
        const r = select(decision, goal, cur, lims);
        if (r.nextCycleReady) assert.equal(D.findHardFilterConflicts(r.proposedExerciseIds, lims).length, 0, `${goal} ${decision} ${lims}`);
        assert.ok(r.alternatives.every((a) => D.findHardFilterConflicts([a.exerciseId], lims).length === 0));
        assert.ok(r.proposedExerciseIds.length <= cur.length && new Set(r.proposedExerciseIds).size === r.proposedExerciseIds.length);
      }
    }
  }
}

// 25. adjust + hard filter: two filtered -> review; none replaceable -> not ready
{
  const both = select(DEC.ADJUST, "G04", ["F01-11", "F01-13", "F01-10"], ["L01"]);
  assert.equal(both.hardFilterConflicts.length, 2);
  assert.equal(both.nextCycleReady, false);
  assert.deepEqual(both.reviewReasons, ["multiple_exercises_filtered"]);
  assert.equal(both.replacedExercise, null, "never rebuilds the whole plan");
  const conf = D.determineConfirmationMode({ decision: DEC.ADJUST, newLimitations: ["L01"], selection: both });
  assert.equal(conf.confirmationMode, CM.PROFESSIONAL_REVIEW_REQUIRED);
  assert.equal(conf.nextCycleReady, false);

  // Only one current exercise and G05 with every candidate filtered -> no valid replacement.
  const none = select(DEC.ADJUST, "G05", ["F01-20"], ["L01", "L03", "L05"], S.F01_EXERCISE_TRANSITIONS.filter((t) => t.currentExerciseId !== "F01-20"));
  // Phase C fallback still finds F01-17 / F01-18 (not filtered) — so use a catalog without them:
  const tiny = catalog.filter((e) => ["F01-19", "F01-20"].includes(e.id));
  const nothing = D.selectNextCycleExercises({ decision: DEC.ADJUST, selectedGoalId: "G05", currentItems: [item("F01-20")], currentLimitations: ["L03", "L05"], catalog: tiny });
  assert.equal(nothing.nextCycleReady, false);
  assert.deepEqual(nothing.reviewReasons, ["no_valid_replacement"]);
  assert.equal(none.replacedExercise.source, "phase_c_same_goal_fallback", "third priority: Phase C same-goal fallback");
  assert.equal(none.replacedExercise.toExerciseId, "F01-17", "Phase C deterministic order");
  assert.equal(D.determineConfirmationMode({ decision: DEC.ADJUST, newLimitations: ["L05"], selection: nothing }).confirmationMode, CM.PROFESSIONAL_REVIEW_REQUIRED);

  // regression before same_goal_replacement: F01-02 in G02 hit? F01-02 has no filter phrase; use a stub transition set.
  const stub = [
    { currentExerciseId: "F01-19", goalId: "G05", transitionType: "same_goal_replacement", candidateExerciseId: "F01-18", status: "Confirmed" },
    { currentExerciseId: "F01-19", goalId: "G05", transitionType: "regression", candidateExerciseId: "F01-17", status: "Confirmed" },
  ];
  const pri = select(DEC.ADJUST, "G05", ["F01-19"], ["L03"], stub);
  assert.equal(pri.replacedExercise.toExerciseId, "F01-17");
  assert.deepEqual(pri.alternatives.map((a) => a.exerciseId), ["F01-18"]);
}

// 50. adjust WITHOUT hard-filter conflict: keep the set, alternatives only
{
  const r = select(DEC.ADJUST, "G04", ["F01-10", "F01-13"]);
  assert.equal(r.selectionRuleId, "NC-A02");
  assert.deepEqual(r.proposedExerciseIds, ["F01-10", "F01-13"], "EX-05: current set kept");
  assert.equal(r.replacedExercise, null);
  assert.equal(r.maxReplace, 0);
  assert.deepEqual(r.alternatives.map((a) => a.exerciseId), ["F01-12", "F01-15"]);
  assert.ok(r.alternatives.every((a) => ["regression", "same_goal_replacement"].includes(a.transitionType)));
  assert.equal(r.nextCycleReady, true);
  // Never picks a "problem exercise" from completion counts: the selection has no such input.
  const sel = stripComments(engineSrc.slice(engineSrc.indexOf("export function selectNextCycleExercises"), engineSrc.indexOf("// ── Gate 7")));
  assert.ok(!/completedTrainingDates|dailyTrainingProgress|completedExerciseIds|completedTrainingDays/.test(sel));

  // maintain keeps ids and order even when replacements exist (EX-03)
  const m = select(DEC.MAINTAIN, "G04", ["F01-10", "F01-13"]);
  assert.deepEqual(m.proposedExerciseIds, ["F01-10", "F01-13"]);
  assert.equal(m.replacedExercise, null);
  assert.equal(m.alternatives.length, 0);
  assert.equal(m.selectionRuleId, "NC-M01");

  // no_auto_decision -> nothing ready
  const n = select(DEC.NO_AUTO_DECISION, "G04", ["F01-10"]);
  assert.equal(n.nextCycleReady, false);
  assert.equal(n.selectionRuleId, "NC-N01");
}

// Confirmation modes
{
  const sel = select(DEC.ADJUST, "G04", ["F01-10", "F01-13"]);
  const a = D.determineConfirmationMode({ decision: DEC.ADJUST, hasNewOrWorseningDiscomfort: true, newLimitations: [], selection: sel });
  assert.equal(a.confirmationMode, CM.PROFESSIONAL_REVIEW_REQUIRED);
  assert.equal(a.nextCycleReady, false);
  assert.deepEqual(a.reviewReasons, ["unmapped_discomfort"]);
  const b = D.determineConfirmationMode({ decision: DEC.ADJUST, hasNewOrWorseningDiscomfort: true, newLimitations: ["L02"], selection: sel });
  assert.equal(b.confirmationMode, CM.USER_ACCEPTANCE, "discomfort WITH a mappable new limitation goes through NC-A01/A02");
  const m = D.determineConfirmationMode({ decision: DEC.MAINTAIN, selection: select(DEC.MAINTAIN, "G04", ["F01-10"]) });
  assert.deepEqual([m.requiresConfirmation, m.confirmationMode, m.nextCycleReady], [true, CM.USER_ACCEPTANCE, true]);
  const n = D.determineConfirmationMode({ decision: DEC.NO_AUTO_DECISION, selection: select(DEC.NO_AUTO_DECISION, "G04", ["F01-10"]) });
  assert.equal(n.nextCycleReady, false);
  assert.equal(n.requiresConfirmation, true);
}

// buildD5Proposal end-to-end (pure) + reasons
{
  const cycle = { id: "c1", userId: "u1", selectedGoalId: "G02", baselineAssessmentId: "b1", reassessmentId: "r1", cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", completedTrainingDates: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"] };
  const rec = { id: "rec1", limitationIds: [], items: [{ exerciseId: "F01-04", matchLevel: "direct", reason: "x", matchedConditions: [] }, { exerciseId: "F01-10", matchLevel: "direct", reason: "y", matchedConditions: [] }] };
  const cmp = { eligible: true, changeMs: -3500 };
  const p = D.buildD5Proposal({ sourceCycle: cycle, sourceRecommendation: rec, comparison: cmp, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] }, catalog });
  assert.equal(p.decision, DEC.PROGRESS);
  assert.equal(p.decisionRuleId, "R005");
  assert.equal(p.trainingState, TS.FULL);
  assert.deepEqual(p.proposedExerciseIds, ["F01-02", "F01-10"]);
  assert.equal(p.reason, "本週符合進階候選條件；保留其餘訓練，只將 坐姿起立 調整為同 Goal 的進階候選 迷你深蹲。");
  assert.equal(p.requiresConfirmation, true);
  assert.equal(p.confirmationMode, CM.USER_ACCEPTANCE);
  assert.equal(p.autoApplyAllowed, false);
  assert.equal(p.limitationsBaselineKnown, true);

  // Legacy: no snapshot anywhere, current L01 makes nothing "new" but still re-runs hard filters.
  const legacy = D.buildD5Proposal({ sourceCycle: { ...cycle, selectedGoalId: "G04" }, sourceRecommendation: { id: "rec2", items: [item("F01-11"), item("F01-10")] }, comparison: cmp, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: ["L01"] }, catalog });
  assert.equal(legacy.limitationsBaselineKnown, false);
  assert.deepEqual(legacy.newLimitations, []);
  assert.equal(legacy.limitationChanged, null);
  assert.equal(legacy.decision, DEC.ADJUST, "legacy conflict -> adjustment");
  assert.ok(!legacy.proposedExerciseIds.includes("F01-11"));

  // Invalid comparison -> no_auto_decision, nothing ready
  const inv = D.buildD5Proposal({ sourceCycle: cycle, sourceRecommendation: rec, comparison: { eligible: false }, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] }, catalog });
  assert.equal(inv.decision, DEC.NO_AUTO_DECISION);
  assert.equal(inv.nextCycleReady, false);
  assert.equal(inv.reason, "目前資料不足以支持下一階段自動調整，先保留目前紀錄並等待更多資料。");

  // Forbidden wording never appears in any reason the engine can produce.
  const forbidden = /改善|退步|療效|成功|失敗|有效|恢復正常|肌力進步|MCID|3\.12/;
  const reasons = [p.reason, legacy.reason, inv.reason, ...S.F01_NEXT_CYCLE_SELECTION_RULES.map((r) => r.reasonTemplate)];
  for (const r of reasons) assert.ok(!forbidden.test(r), r);
  assert.ok(!forbidden.test(stripComments(engineSrc.slice(engineSrc.indexOf("export function buildD5Reason"), engineSrc.indexOf("// ── Whole proposal")))));
}

// 51. Next-cycle handoff (pure)
{
  const at = (y, m, d, h) => new Date(y, m, d, h, 0).toISOString();
  const cycle = { id: "c1", reassessmentId: "r1" };
  const re = { id: "r1", result: { measuredAt: at(2026, 9, 4, 20) } };
  const same = D.deriveNextCycleHandoff({ sourceCycle: cycle, reassessment: re, confirmationDateKey: "2026-10-04" });
  assert.equal(same.baselineReuseAllowed, true);
  assert.equal(same.requiresFreshBaseline, false);
  assert.equal(same.baselineAssessmentId, "r1");
  assert.equal(same.cycleStartDateKey, "2026-10-04");
  assert.equal(same.plannedReassessmentDateKey, "2026-10-10");
  const later = D.deriveNextCycleHandoff({ sourceCycle: cycle, reassessment: re, confirmationDateKey: "2026-10-05" });
  assert.equal(later.baselineReuseAllowed, false);
  assert.equal(later.requiresFreshBaseline, true);
  assert.equal(later.baselineAssessmentId, null);
  assert.equal(later.cycleStartDateKey, null, "never back-dates Day 1");
  assert.equal(D.deriveNextCycleHandoff({ sourceCycle: cycle, reassessment: { ...re, id: "other" }, confirmationDateKey: "2026-10-04" }).requiresFreshBaseline, true, "only the cycle's own reassessment");

  const good = { id: "n1", assessmentType: "five_times_sit_to_stand", status: "completed", result: { status: "completed", repCount: 5, totalDurationMs: 9000, measuredAt: at(2026, 9, 6, 9) } };
  assert.equal(D.isUsableNextCycleBaseline(good), true);
  assert.equal(D.isUsableNextCycleBaseline({ ...good, status: "incomplete", result: { ...good.result, status: "incomplete" } }), false);
  assert.equal(D.isUsableNextCycleBaseline({ ...good, result: { ...good.result, status: "invalid" } }), false);

  const fields = D.buildNextTrackingCycleFields({
    sourceCycle: { id: "c1", userId: "u1", functionalDomain: "F01", assessmentType: "5xSTS", selectedGoalId: "G02" },
    proposal: { id: "p1", d5: { currentLimitations: ["L02"], hasNewOrWorseningDiscomfort: false, discomfortNote: null } },
    baselineSession: good,
    baselineSource: "fresh_baseline",
  });
  assert.equal(fields.cycleStartDateKey, "2026-10-06", "Day 1 = baseline measured date");
  assert.equal(fields.plannedReassessmentDateKey, "2026-10-12");
  assert.equal(fields.previousCycleId, "c1");
  assert.equal(fields.recommendationId, "p1");
  assert.equal(fields.selectedGoalId, "G02");
  assert.deepEqual(fields.limitationsSnapshot, ["L02"]);
  assert.deepEqual(fields.discomfortSnapshot, { hasNewOrWorseningDiscomfort: false, discomfortNote: null });
  assert.deepEqual(fields.completedTrainingDates, []);
  assert.deepEqual(fields.dailyTrainingProgress, {});
  assert.equal(fields.reassessmentId, null);
  assert.equal(fields.cycleStatus, "training");
}

// 53. Phase C regression: the first recommendation is unchanged for every input combination
// (5 goals × 4 time options × 32 limitation subsets = 640), hashed against the pre-D5 output.
{
  const L = ["L01", "L02", "L03", "L04", "L05"];
  const out = [];
  for (const g of ["G01", "G02", "G03", "G04", "G05"]) for (const t of [null, 10, 15, 20]) for (let m = 0; m < 32; m++) {
    const lims = L.filter((_, i) => m & (1 << i));
    out.push({ g, t, lims, r: generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: "s1", assessmentType: "five_times_sit_to_stand" }, selectedGoalId: g, limitationIds: lims, availableMinutes: t, catalog }) });
  }
  assert.equal(out.length, 640);
  assert.equal(createHash("sha256").update(JSON.stringify(out)).digest("hex"), "955778ce6cba1a9a63f2bba19b4f9057c7c6e022eef5412939125b4bf08222e6", "Phase C output changed");
}

// No LLM / network / clock in the engine
{
  const src = stripComments(engineSrc);
  assert.ok(!/fetch\(|openai|anthropic|claude|llm|new Date\(\)|Date\.now|trackingToday/i.test(src));
}

console.log("F01 D5 progression decision tests passed");
