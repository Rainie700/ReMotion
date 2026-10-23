import { isDateKey } from "./trackingCycle.js";

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
export function buildDailyTarget({ exerciseId, item = null, catalog = null }) {
  const rule = F01_DETECTOR_TARGET_RULES[exerciseId];
  if (!rule) return { error: "no_detector_rule", exerciseId };
  const planned = resolvePlannedValues({ item, catalog });
  if (planned.error) return { error: planned.error, exerciseId };
  const sets = planned.sets.value;
  const reps = planned.repsPerSet.value;
  const catalogDoseText = text(catalog.sets) || text(catalog.repetitions) ? { sets: text(catalog.sets), repetitions: text(catalog.repetitions) } : null;
  const basis = resolvePlanCountingBasis({ repsSource: planned.repsPerSet.source, catalogRepsText: catalog.repetitions, recordsSides: rule.recordsSides });
  const detectorTarget = computeDetectorTarget(rule.rule, sets, reps);
  const plannedAmount = computePlannedAmount(basis.basis, sets, reps);
  return {
    target: {
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
    },
  };
}

/**
 * Freezes every required exercise at once (formal start). All-or-nothing:
 * one exercise without a valid target fails the whole freeze.
 * @returns {{ targets } | { error, exerciseId }}
 */
export function freezeDailyTargets({ exerciseIds = [], recommendation = null, getCatalog = () => null }) {
  const targets = {};
  for (const exerciseId of exerciseIds) {
    const item = ((recommendation && recommendation.items) || []).find((it) => it.exerciseId === exerciseId) || null;
    const built = buildDailyTarget({ exerciseId, item, catalog: getCatalog(exerciseId) });
    if (built.error) return built;
    targets[exerciseId] = built.target;
  }
  return { targets };
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
  };
}

export function sameTargetSummary(a, b) {
  if (!a || !b) return false;
  return JSON.stringify(buildTargetSummaryKey(a)) === JSON.stringify(buildTargetSummaryKey(b));
}
function buildTargetSummaryKey(s) {
  return [s.planDateKey, s.targetRef, s.sets, s.repsPerSet, s.detectorTarget ? s.detectorTarget.value : null, s.detectorTarget ? s.detectorTarget.unit : null];
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
