import { isDateKey, isTrainingDateInCycle } from "./trackingCycle.js";

/**
 * F01 batch 1 — daily target snapshot + saved-training attempts (pure).
 * Spec: docs/specs/f01-batch1-daily-target-snapshot-spec.md (待實作、待驗證).
 *
 * Freezes, for each required exercise of a day, the planned amount EXACTLY as
 * the exercise page resolves it today (getExercisePageContext: the plan
 * item's dose field, else the catalog default), plus how that amount and the
 * detector's own target are counted. Nothing here changes a detector, the
 * completion rule, completedTrainingDates, D5 or LLM inputs: consistency is
 * only labelled (the known target mismatches are fixed in batch 2).
 */

export const F01_DAILY_SNAPSHOT_VERSION = 2;
export const F01_DAILY_TARGET_RULES_VERSION = "f01-daily-target-rules-1.0";

export const TARGETS_STATUS = Object.freeze({
  FROZEN: "frozen_before_training",
  NOT_FROZEN: "not_frozen",
});

/** How an attempt / a training relates to the day's target. */
export const TARGET_REF = Object.freeze({
  FROZEN: "frozen",
  NOT_FROZEN: "not_frozen",
  LEGACY: "legacy_no_targets",
});

export const SNAPSHOT_MODE = Object.freeze({
  FORMAL_START: "formal_start",
  COMPLETION_FALLBACK: "completion_fallback",
});

export const TARGET_SOURCE = Object.freeze({ THERAPIST: "therapist_dose", DEFAULT: "catalog_default" });
export const COUNTING_BASIS = Object.freeze({ PER_SIDE: "per_side", TOTAL: "total", UNSPECIFIED: "unspecified" });
export const TARGET_CONSISTENCY = Object.freeze({ CONSISTENT: "consistent", INCONSISTENT: "inconsistent", NOT_COMPARABLE: "not_comparable" });

export const DETECTOR_RULE = Object.freeze({
  SETS_X_REPS_TOTAL: "sets_x_reps_total", // calculateSquatTargetReps(ex)
  REPS_ONLY_TOTAL: "reps_only_total", // targetReps: Math.max(1, Number(x.repetitions ?? x.targetReps) || default)
  REPS_ONLY_PER_SIDE: "reps_only_per_side", // targetPerSide: Math.max(1, Number(x.repetitions ?? x.targetReps) || 10)
});

/**
 * How each F01 detector sets its target, read from app.js (goXxxDetection)
 * and each session's completion rule; `recordsSides` = the session keeps
 * left / right counts. Version: F01_DAILY_TARGET_RULES_VERSION.
 */
export const F01_DETECTOR_TARGET_RULES = Object.freeze({
  "F01-01": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: false }, // squat
  "F01-02": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: false }, // squat
  "F01-03": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: false }, // squat
  "F01-04": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: false }, // LE05 sit-to-stand
  "F01-05": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: true }, // KN03 seated knee extension
  "F01-06": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: true }, // KN03
  "F01-07": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: true }, // KN03 (flexion)
  "F01-08": { rule: DETECTOR_RULE.REPS_ONLY_PER_SIDE, recordsSides: true }, // HP01 hip straight-leg raise
  "F01-09": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: true }, // CR05 seated knee raise
  "F01-10": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: false }, // LE03 bridge
  "F01-11": { rule: DETECTOR_RULE.REPS_ONLY_PER_SIDE, recordsSides: true }, // HP02 standing hip flexion (training)
  "F01-12": { rule: DETECTOR_RULE.REPS_ONLY_PER_SIDE, recordsSides: true }, // HP03 standing hip extension
  "F01-13": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: true }, // HP04 side leg raise
  "F01-14": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: true }, // HP05 side leg raise
  "F01-15": { rule: DETECTOR_RULE.SETS_X_REPS_TOTAL, recordsSides: true }, // HP06 clamshell
  "F01-16": { rule: DETECTOR_RULE.REPS_ONLY_PER_SIDE, recordsSides: true }, // HP07 fire hydrant
  "F01-17": { rule: DETECTOR_RULE.REPS_ONLY_TOTAL, recordsSides: false }, // AK05 double calf raise
  "F01-18": { rule: DETECTOR_RULE.REPS_ONLY_TOTAL, recordsSides: false }, // AK06 double toe raise
  "F01-19": { rule: DETECTOR_RULE.REPS_ONLY_TOTAL, recordsSides: true }, // AK07 single-leg calf raise
  "F01-20": { rule: DETECTOR_RULE.REPS_ONLY_TOTAL, recordsSides: true }, // AK08 single-leg toe raise
});

const positive = (v) => (typeof v === "number" ? v : Number(v)) > 0 && Number.isFinite(Number(v));
const text = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * The planned amount as the exercise page resolves it (getExercisePageContext):
 * the plan item's dose field when set, else the catalog default.
 * @returns {{ measurementType, sets: {value, source}, repsPerSet: {value, source} } | { error }}
 */
export function resolvePlannedValues({ item = null, catalog = null }) {
  if (!catalog) return { error: "catalog_not_found" };
  if (catalog.measurementType !== "repetition") return { error: "unsupported_measurement_type" };
  const dose = (item && item.dose) || {};
  const pick = (own, def) => (own ? { value: Number(own), source: TARGET_SOURCE.THERAPIST } : { value: Number(def), source: TARGET_SOURCE.DEFAULT });
  const sets = pick(dose.sets, catalog.defaultSets);
  const repsPerSet = pick(dose.repetitions, catalog.defaultRepetitions);
  if (!positive(sets.value) || !positive(repsPerSet.value)) return { error: "target_value_invalid" };
  return { measurementType: catalog.measurementType, sets, repsPerSet };
}

/**
 * Spec 3.3 — how the PLANNED repetitions are counted (never guessed):
 *   1. a therapist-set amount carries no side: unspecified when the detector counts sides;
 *   2. catalog text 「每側」 -> per_side; 「交替」 -> unspecified;
 *   3. detector without sides and no 「每側」 -> total;
 *   4. otherwise unspecified.
 */
export function resolvePlanCountingBasis({ repsSource, catalogRepsText, recordsSides }) {
  if (repsSource === TARGET_SOURCE.THERAPIST) {
    return recordsSides
      ? { basis: COUNTING_BASIS.UNSPECIFIED, evidence: "therapist_dose_side_unspecified" }
      : { basis: COUNTING_BASIS.TOTAL, evidence: "therapist_dose_detector_no_sides" };
  }
  const t = text(catalogRepsText);
  if (t && t.includes("每側")) return { basis: COUNTING_BASIS.PER_SIDE, evidence: "catalog_text_per_side" };
  if (t && t.includes("交替")) return { basis: COUNTING_BASIS.UNSPECIFIED, evidence: "catalog_text_alternating" };
  if (!recordsSides) return { basis: COUNTING_BASIS.TOTAL, evidence: "detector_no_sides_no_per_side_text" };
  return { basis: COUNTING_BASIS.UNSPECIFIED, evidence: "side_unspecified" };
}

/** The target the detector will use with these values (same formulas as app.js). */
export function computeDetectorTarget(rule, sets, reps) {
  if (rule === DETECTOR_RULE.SETS_X_REPS_TOTAL) return { value: (sets > 0 ? sets : 1) * (reps > 0 ? reps : 1), unit: "total_reps" };
  if (rule === DETECTOR_RULE.REPS_ONLY_TOTAL) return { value: Math.max(1, reps), unit: "total_reps" };
  if (rule === DETECTOR_RULE.REPS_ONLY_PER_SIDE) return { value: Math.max(1, reps), unit: "reps_per_side" };
  return null;
}

/** Planned amount in the plan's own counting basis; null when the basis is unspecified (never multiplied). */
export function computePlannedAmount(basis, sets, reps) {
  if (basis === COUNTING_BASIS.PER_SIDE) return { perSide: sets * reps };
  if (basis === COUNTING_BASIS.TOTAL) return { total: sets * reps };
  return null;
}

/** Label only — never used by any completion rule. */
export function compareTargets(plannedAmount, detectorTarget) {
  if (!plannedAmount || !detectorTarget) return TARGET_CONSISTENCY.NOT_COMPARABLE;
  if (detectorTarget.unit === "total_reps" && plannedAmount.total != null) {
    return plannedAmount.total === detectorTarget.value ? TARGET_CONSISTENCY.CONSISTENT : TARGET_CONSISTENCY.INCONSISTENT;
  }
  if (detectorTarget.unit === "reps_per_side" && plannedAmount.perSide != null) {
    return plannedAmount.perSide === detectorTarget.value ? TARGET_CONSISTENCY.CONSISTENT : TARGET_CONSISTENCY.INCONSISTENT;
  }
  return TARGET_CONSISTENCY.INCONSISTENT; // different counting units (total vs per side)
}

/**
 * One exercise's target as it would be frozen now (spec 3.2). Used both to
 * freeze (formal start) and to read the live amount on days without a frozen
 * target. @returns {{ target } | { error, exerciseId }}
 */
export function buildDailyTarget({ exerciseId, item = null, catalog = null, completionRulesVersion = null }) {
  const rule = F01_DETECTOR_TARGET_RULES[exerciseId];
  if (!rule) return { error: "no_detector_rule", exerciseId };
  const planned = resolvePlannedValues({ item, catalog });
  if (planned.error) return { error: planned.error, exerciseId };
  const sets = planned.sets.value;
  const reps = planned.repsPerSet.value;
  const catalogDoseText = text(catalog.sets) || text(catalog.repetitions) ? { sets: text(catalog.sets), repetitions: text(catalog.repetitions) } : null;
  // Batch 2 (new-version cycles only): the source-backed basis, the therapist's explicit
  // counting basis and the formal completion rule. Old-version cycles keep batch 1 exactly.
  const v2 = completionRulesVersion === F01_FORMAL_COMPLETION_RULES_VERSION;
  const basis = v2
    ? resolvePlanCountingBasisV2({ exerciseId, repsSource: planned.repsPerSet.source, therapistCountingBasis: item && item.dose ? item.dose.countingBasis : null, catalogRepsText: catalog.repetitions, recordsSides: rule.recordsSides })
    : resolvePlanCountingBasis({ repsSource: planned.repsPerSet.source, catalogRepsText: catalog.repetitions, recordsSides: rule.recordsSides });
  const completionRule = v2 ? resolveCompletionRule({ exerciseId, basis: basis.basis, sets, reps }) : null;
  const formalDetectorConfig = completionRule ? deriveFormalDetectorConfig(completionRule) : null;
  // The target the detector will actually use: the formal one when resolved, else the existing formula.
  const detectorTarget = formalDetectorConfig
    ? (formalDetectorConfig.targetPerSide != null ? { value: formalDetectorConfig.targetPerSide, unit: "reps_per_side" } : { value: formalDetectorConfig.targetReps, unit: "total_reps" })
    : computeDetectorTarget(rule.rule, sets, reps);
  const plannedAmount = computePlannedAmount(basis.basis, sets, reps);
  const target = {
    measurementType: planned.measurementType,
    sets: planned.sets,
    repsPerSet: planned.repsPerSet,
    catalogDoseText,
    planCountingBasis: basis.basis,
    planBasisEvidence: basis.evidence,
    detectorRuleId: rule.rule,
    detectorRecordsSides: rule.recordsSides,
    detectorTarget,
    plannedAmount,
    targetConsistency: compareTargets(plannedAmount, detectorTarget),
  };
  if (v2) {
    target.completionRulesVersion = completionRulesVersion;
    target.completionRule = completionRule;
    target.formalDetectorConfig = formalDetectorConfig;
    if (basis.source) target.planBasisSource = basis.source;
  }
  return { target };
}

/**
 * Freezes every required exercise at once (formal start). All-or-nothing:
 * one exercise without a valid target fails the whole freeze.
 * `completionRulesVersion` (batch 2) is the CYCLE's version; null = old-version cycle.
 * @returns {{ targets } | { error, exerciseId }}
 */
export function freezeDailyTargets({ exerciseIds = [], recommendation = null, getCatalog = () => null, completionRulesVersion = null }) {
  const targets = {};
  for (const exerciseId of exerciseIds) {
    const item = ((recommendation && recommendation.items) || []).find((it) => it.exerciseId === exerciseId) || null;
    const built = buildDailyTarget({ exerciseId, item, catalog: getCatalog(exerciseId), completionRulesVersion });
    if (built.error) return built;
    targets[exerciseId] = built.target;
  }
  return { targets };
}

// ── F01 batch 2 — formal completion rules (docs/specs/f01-batch2-completion-alignment-design.md) ──

export const F01_FORMAL_COMPLETION_RULES_VERSION = "f01-formal-completion-2.0";

export const COMPLETION_RULE_KIND = Object.freeze({ TOTAL: "total", PER_SIDE: "per_side", PENDING: "counting_basis_pending" });

/**
 * Counting options each F01 detector actually supports once batch 2 is in
 * (the optional per-side parameter added to KN03 / side leg raise / clamshell /
 * CR05 / AK08). Single-side-only completion is supported by NO detector, so it
 * is never offered. Used by the therapist form AND by the completion rule.
 */
export const F01_DETECTOR_COUNTING_OPTIONS = Object.freeze({
  "F01-01": ["total"], "F01-02": ["total"], "F01-03": ["total"], "F01-04": ["total"], "F01-10": ["total"], "F01-17": ["total"], "F01-18": ["total"],
  "F01-08": ["per_side"], "F01-11": ["per_side"], "F01-12": ["per_side"], "F01-16": ["per_side"],
  "F01-05": ["total", "per_side"], "F01-06": ["total", "per_side"], "F01-07": ["total", "per_side"], "F01-09": ["total", "per_side"],
  "F01-13": ["total", "per_side"], "F01-14": ["total", "per_side"], "F01-15": ["total", "per_side"], "F01-20": ["total", "per_side"],
  "F01-19": ["total"], // AK07 records sides but has no per-side parameter
});
export const countingOptionsFor = (exerciseId) => [...(F01_DETECTOR_COUNTING_OPTIONS[exerciseId] || [])];

/**
 * Spec 3.1 — counting basis taken from the reviewed exercise source sheets
 * where the app catalog text does not settle it. The catalog data itself is
 * NOT changed. Never derived from how a detector counts.
 */
export const F01_COUNTING_BASIS_SOURCES = Object.freeze({
  "F01-09": Object.freeze({ basis: COUNTING_BASIS.PER_SIDE, evidence: "source_sheet_repetitions", source: "docs/specs/ReMotion復健資料庫_含F01推薦GoalMapping.xlsx › 工作表 F01-09 › repetitions「每側10次」（UCLH NHS｜Seated marching）" }),
  "F01-20": Object.freeze({ basis: COUNTING_BASIS.PER_SIDE, evidence: "source_sheet_steps", source: "docs/specs/ReMotion復健資料庫_含F01推薦GoalMapping.xlsx › 工作表 F01-20 › steps 第 5 點「完成後換另一側」（Kingston and Richmond NHS）" }),
});

/** Spec 3B — kept out of NEW-version automatic candidates (Phase C, D5 selection, D5 LLM candidates); data and history untouched. */
export const F01_AUTO_RECOMMENDATION_EXCLUSIONS = Object.freeze({ "F01-19": "counting_basis_pending" });
export const filterAutoRecommendationCatalog = (catalog = []) => (catalog || []).filter((ex) => !(ex && F01_AUTO_RECOMMENDATION_EXCLUSIONS[ex.id || ex.exerciseId || ex.exercise_id]));
export const filterAutoRecommendationIds = (ids = []) => (ids || []).filter((id) => !F01_AUTO_RECOMMENDATION_EXCLUSIONS[id]);

/**
 * New-version counting basis. A therapist amount uses the therapist's EXPLICIT
 * choice (spec 3C); without one it is only unambiguous for a detector without
 * sides. A catalog amount uses the source table first, then the batch-1 rules.
 */
export function resolvePlanCountingBasisV2({ exerciseId, repsSource, therapistCountingBasis = null, catalogRepsText, recordsSides }) {
  if (repsSource === TARGET_SOURCE.THERAPIST) {
    if (therapistCountingBasis === COUNTING_BASIS.TOTAL || therapistCountingBasis === COUNTING_BASIS.PER_SIDE) {
      return { basis: therapistCountingBasis, evidence: "therapist_counting_basis" }; // the plan's setting, not a source finding
    }
    return recordsSides
      ? { basis: COUNTING_BASIS.UNSPECIFIED, evidence: "therapist_dose_counting_basis_missing" }
      : { basis: COUNTING_BASIS.TOTAL, evidence: "therapist_dose_detector_no_sides" };
  }
  const src = F01_COUNTING_BASIS_SOURCES[exerciseId];
  if (src) return { basis: src.basis, evidence: src.evidence, source: src.source };
  return resolvePlanCountingBasis({ repsSource, catalogRepsText, recordsSides });
}

/** Executable rule for a basis, only when the detector supports it; otherwise counting_basis_pending. */
export function resolveCompletionRule({ exerciseId, basis, sets, reps }) {
  const options = F01_DETECTOR_COUNTING_OPTIONS[exerciseId] || [];
  if (basis === COUNTING_BASIS.TOTAL && options.includes("total")) return { kind: COMPLETION_RULE_KIND.TOTAL, required: sets * reps };
  if (basis === COUNTING_BASIS.PER_SIDE && options.includes("per_side")) return { kind: COMPLETION_RULE_KIND.PER_SIDE, requiredPerSide: sets * reps };
  return { kind: COMPLETION_RULE_KIND.PENDING, reason: basis === COUNTING_BASIS.UNSPECIFIED ? "counting_basis_unspecified" : "counting_basis_unsupported" };
}

/** What the detector is started with in a formal new-version training. */
export function deriveFormalDetectorConfig(rule) {
  if (!rule) return null;
  if (rule.kind === COMPLETION_RULE_KIND.TOTAL) return { targetReps: rule.required };
  if (rule.kind === COMPLETION_RULE_KIND.PER_SIDE) return { targetPerSide: rule.requiredPerSide };
  return null;
}

/**
 * Formal completion of ONE saved record against the frozen rule (single
 * record only: no accumulation, no sets inferred). Per side needs both
 * counts present; a missing count is never filled in.
 */
export function isFormalTargetMet(record, rule) {
  if (!record || !rule) return false;
  const s = record.summary && typeof record.summary === "object" ? record.summary : {};
  if (rule.kind === COMPLETION_RULE_KIND.TOTAL) {
    const n = firstNum(record.totalReps, s.totalReps);
    return n != null && n >= rule.required;
  }
  if (rule.kind === COMPLETION_RULE_KIND.PER_SIDE) {
    const l = firstNum(s.leftReps, record.leftReps);
    const r = firstNum(s.rightReps, record.rightReps);
    return l != null && r != null && l >= rule.requiredPerSide && r >= rule.requiredPerSide;
  }
  return false;
}

/**
 * Spec 3D — does every item of a plan have an executable counting definition
 * under the new version? @returns {{ ok, undefinedItems: Array<{ exerciseId, reason }> }}
 */
export function checkCountingDefinitions({ items = [], getCatalog = () => null }) {
  const undefinedItems = [];
  for (const item of items || []) {
    const built = buildDailyTarget({ exerciseId: item.exerciseId, item, catalog: getCatalog(item.exerciseId), completionRulesVersion: F01_FORMAL_COMPLETION_RULES_VERSION });
    if (built.error) undefinedItems.push({ exerciseId: item.exerciseId, reason: built.error });
    else if (built.target.completionRule.kind === COMPLETION_RULE_KIND.PENDING) undefinedItems.push({ exerciseId: item.exerciseId, reason: built.target.completionRule.reason });
  }
  return { ok: undefinedItems.length === 0, undefinedItems };
}

/**
 * Spec 3A — completed training days with their status. A new-version cycle
 * whose days hold a pending / unknown target is "measurement_pending": days
 * = null (never 0, never read as "not trained"). Otherwise the same count as
 * before (unique completedTrainingDates on real Day 1-6 dates).
 */
export const isTrainingMeasurementPending = (cycle) => getCompletedTrainingDaysStatus(cycle).status === "measurement_pending";

/**
 * Display count of completed training days exactly as the screens showed it
 * before batch 2 (raw completedTrainingDates length), or null when the
 * measurement is pending — callers show 「待確認」, never 0.
 */
export const displayCompletedTrainingDays = (cycle) => (isTrainingMeasurementPending(cycle) ? null : ((cycle && cycle.completedTrainingDates) || []).length);

export function getCompletedTrainingDaysStatus(cycle) {
  const dates = new Set((cycle && cycle.completedTrainingDates) || []);
  const days = [...dates].filter((k) => isDateKey(k) && isTrainingDateInCycle(cycle, k)).length;
  const version = cycle && cycle.formalCompletionRulesVersion;
  if (version) {
    for (const [dateKey, entry] of Object.entries((cycle && cycle.dailyTrainingProgress) || {})) {
      if (!entry || !isTrainingDateInCycle(cycle, dateKey)) continue;
      const unknown = entry.completionRulesVersion !== version
        || (entry.requiredExerciseIds || []).some((id) => {
          const t = entry.targets && entry.targets[id];
          return !t || !t.completionRule || t.completionRule.kind === COMPLETION_RULE_KIND.PENDING;
        });
      if (unknown) return { days: null, status: "measurement_pending" };
    }
  }
  return { days, status: "counted" };
}

/**
 * The day's relation to its targets for one exercise:
 *   frozen / not_frozen / legacy_no_targets, or null when a frozen
 *   snapshot lacks this exercise (inconsistent data — callers refuse).
 */
export function resolveTargetRef(entry, exerciseId) {
  if (!entry) return null;
  if (entry.snapshotVersion !== F01_DAILY_SNAPSHOT_VERSION) return TARGET_REF.LEGACY;
  if (entry.targetsStatus !== TARGETS_STATUS.FROZEN) return TARGET_REF.NOT_FROZEN;
  return entry.targets && entry.targets[exerciseId] ? TARGET_REF.FROZEN : null;
}

/** What the user is shown before the camera opens; compared again right before the detector starts. */
export function buildTargetSummary({ planDateKey, targetRef, target }) {
  return {
    planDateKey: planDateKey || null,
    targetRef: targetRef || null,
    sets: target ? target.sets.value : null,
    repsPerSet: target ? target.repsPerSet.value : null,
    detectorTarget: target && target.detectorTarget ? { value: target.detectorTarget.value, unit: target.detectorTarget.unit } : null,
    // batch 2: the formal completion rule is part of what was shown / will be judged
    completionRule: target && target.completionRule ? { ...target.completionRule } : null,
  };
}

export function sameTargetSummary(a, b) {
  if (!a || !b) return false;
  return JSON.stringify(buildTargetSummaryKey(a)) === JSON.stringify(buildTargetSummaryKey(b));
}
function buildTargetSummaryKey(s) {
  return [s.planDateKey, s.targetRef, s.sets, s.repsPerSet, s.detectorTarget ? s.detectorTarget.value : null, s.detectorTarget ? s.detectorTarget.unit : null, s.completionRule ? JSON.stringify(s.completionRule) : null];
}

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const firstNum = (...vals) => { for (const v of vals) { const n = num(v); if (n != null) return n; } return null; };
const str = (v) => (typeof v === "string" && v ? v : null);

/**
 * One SAVED training record as an attempt (spec 3.4). Copies what the record
 * holds; anything missing stays null (never derived, never back-filled).
 */
export function buildTrainingAttempt(record, { targetRef, writtenAt }) {
  const s = record && record.summary && typeof record.summary === "object" ? record.summary : {};
  return {
    recordId: record.id,
    exerciseId: str(record.exerciseId),
    analysisMode: str(record.analysisMode),
    planDateKey: isDateKey(record.planDateKey) ? record.planDateKey : null,
    trainingStartedAt: str(record.trainingStartedAt),
    completedAt: str(record.completedAt), // record.completedAt only — never createdAt
    source: {
      sourceType: str(record.sourceType),
      sourceSubtype: str(record.sourceSubtype),
      trackingCycleId: str(record.trackingCycleId),
      recommendationId: str(record.recommendationId),
    },
    actual: {
      totalReps: firstNum(record.totalReps, s.totalReps),
      leftReps: firstNum(s.leftReps, record.leftReps),
      rightReps: firstNum(s.rightReps, record.rightReps),
    },
    recordTarget: {
      targetReps: firstNum(record.targetReps, s.targetReps),
      targetPerSide: firstNum(s.targetPerSide, record.targetPerSide),
    },
    detectorCompletedFlag: typeof s.completed === "boolean" ? s.completed : null,
    targetRef: targetRef || null,
    writtenAt,
  };
}
