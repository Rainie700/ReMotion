import {
  F01_PROGRESSION_SPEC_SOURCE,
  F01_CHANGE_REFERENCE,
  F01_TRAINING_EXPOSURE_STATES,
  F01_D5_DECISION_RULES,
  F01_EXERCISE_TRANSITIONS,
  F01_NEXT_CYCLE_SELECTION_RULES,
} from "./f01ProgressionSpec.js";
import { F01_GOALS } from "./f01RecommendationSpec.js";
import {
  F01_LIMITATIONS,
  MATCH_LEVEL,
  findF01LimitationConflict,
  getF01GoalMatchLevel,
  orderF01GoalCandidates,
} from "./f01GoalRecommendation.js";
import {
  isDateKey,
  toLocalDateKey,
  getPlannedReassessmentDateKey,
  isTrainingDateInCycle,
  isCompletedFiveTimesSitToStandResult,
} from "./trackingCycle.js";

/**
 * Phase D5 — F01 next-cycle decision (pure, deterministic, rule-based).
 *
 * Source of Truth: docs/specs/ReMotion_D5_DecisionRules.xlsx (D5-0 V1), via
 * the generated js/data/f01ProgressionSpec.js. No LLM, no score, no clock:
 * callers pass every date. Gates run strictly in D5_RuntimeAndHandoff order:
 *
 *   1 GATE-VALIDITY    baseline + reassessment comparison must be valid      -> R001 no_auto_decision
 *   2 GATE-LIMITATION  new / worsening discomfort, or NEW L01-L05            -> R011 adjust (no progression)
 *   3 GATE-CHANGE      raw changeMs vs ±referenceMdcMs (3120)                -> unclassified: R002 no_auto_decision
 *   4 GATE-EXPOSURE    unique completed training days 0 / 1-5 / 6            -> none / partial / full
 *   5 GATE-MATRIX      change_class × training_state                         -> R003-R010
 *   6 GATE-SELECTION   same Goal + Confirmed transitions + Phase C hard filter, max 1 replacement
 *   7 GATE-CONFIRM     every proposal needs confirmation (auto_apply_allowed = No)
 *
 * The reference MDC only classifies the measured change; it is not a
 * diagnosis cut-off or an MCID. Training exposure is a product-cycle
 * classification, not an adherence rating. "progress" is a candidate decision,
 * never a prescription; "adjust" is a re-check, never an automatic regression.
 */

export const D5_RULE_VERSION = F01_PROGRESSION_SPEC_SOURCE.version; // "D5-0-V1"

export const D5_DECISION = Object.freeze({
  NO_AUTO_DECISION: "no_auto_decision",
  MAINTAIN: "maintain",
  PROGRESS: "progress",
  ADJUST: "adjust",
});

export const D5_DECISION_LABEL = Object.freeze({
  no_auto_decision: "不自動判定",
  maintain: "維持",
  progress: "進階",
  adjust: "調整",
});

export const CHANGE_CLASS = Object.freeze({
  FASTER: "faster_beyond_reference_mdc",
  WITHIN: "within_reference_mdc",
  SLOWER: "slower_beyond_reference_mdc",
  UNCLASSIFIED: "unclassified",
});

export const TRAINING_STATE = Object.freeze({ NONE: "none", PARTIAL: "partial", FULL: "full" });

export const CONFIRMATION_MODE = Object.freeze({
  USER_ACCEPTANCE: "user_acceptance",
  PROFESSIONAL_REVIEW_REQUIRED: "professional_review_required",
});

export const TRANSITION_TYPE = Object.freeze({
  PROGRESSION: "progression",
  REGRESSION: "regression",
  SAME_GOAL_REPLACEMENT: "same_goal_replacement",
});

/** Reasons a proposal is routed to professional review instead of user acceptance. */
export const REVIEW_REASON = Object.freeze({
  UNMAPPED_DISCOMFORT: "unmapped_discomfort",
  MULTIPLE_EXERCISES_FILTERED: "multiple_exercises_filtered",
  NO_VALID_REPLACEMENT: "no_valid_replacement",
});

export const PLANNED_TRAINING_DAYS = Math.max(...F01_TRAINING_EXPOSURE_STATES.map((s) => s.plannedTrainingDays));
export const REFERENCE_MDC_MS = F01_CHANGE_REFERENCE.referenceMdcMs;

const TRANSITION_TYPE_TEXT = {
  progression: "進階候選",
  regression: "較保守候選",
  same_goal_replacement: "同目標替代候選",
};
const LEVEL_RANK = { [MATCH_LEVEL.DIRECT]: 0, [MATCH_LEVEL.SUPPORTING]: 1, [MATCH_LEVEL.NONE]: 2 };
const LIMITATION_IDS = F01_LIMITATIONS.map((l) => l.id);
const SELECTION_RULE = Object.fromEntries(F01_NEXT_CYCLE_SELECTION_RULES.map((r) => [r.ruleId, r]));
const DECISION_RULE = Object.fromEntries(F01_D5_DECISION_RULES.map((r) => [r.ruleId, r]));

// ── Gate 3 / Gate 4 classifications ─────────────────────────────────────

/**
 * 5xSTS_ChangeEvidence runtime rule on RAW milliseconds (reassessment − baseline).
 * Nothing is rounded before comparing: -3120 is faster, -3119 is within.
 */
export function classify5xSTSChange(changeMs) {
  if (typeof changeMs !== "number" || !Number.isFinite(changeMs)) return CHANGE_CLASS.UNCLASSIFIED;
  if (changeMs <= -REFERENCE_MDC_MS) return CHANGE_CLASS.FASTER;
  if (changeMs >= REFERENCE_MDC_MS) return CHANGE_CLASS.SLOWER;
  return CHANGE_CLASS.WITHIN;
}

/** TrainingExposure: 0 -> none, 1-5 -> partial, 6 -> full; anything else -> null (not classifiable). */
export function classifyTrainingExposure(completedTrainingDays) {
  if (!Number.isInteger(completedTrainingDays)) return null;
  const state = F01_TRAINING_EXPOSURE_STATES.find((s) => completedTrainingDays >= s.minDays && completedTrainingDays <= s.maxDays);
  return state ? state.code : null;
}

/** Unique completedTrainingDates that are real Day 1-6 dates of the cycle. */
export function countCompletedTrainingDays(cycle) {
  const dates = new Set((cycle && cycle.completedTrainingDates) || []);
  return [...dates].filter((k) => isDateKey(k) && isTrainingDateInCycle(cycle, k)).length;
}

// ── Gate 2 inputs: limitations ──────────────────────────────────────────

/** Only the existing Phase C limitation ids (L01-L05), unique, in F01_LIMITATIONS order. */
export function normalizeLimitationIds(ids) {
  const list = Array.isArray(ids) ? ids : [];
  return LIMITATION_IDS.filter((id) => list.includes(id));
}

/**
 * The limitations in force during the SOURCE cycle, for newLimitations:
 *   1. cycle.limitationsSnapshot (cycles created from D5 on)
 *   2. the cycle's recommendation limitationIds (what the user ticked in Phase C)
 * Neither -> { known: false }: the baseline is unknown, and currentLimitations
 * must NOT all be treated as new.
 */
export function resolvePreviousLimitationsSnapshot({ cycle, recommendation }) {
  if (cycle && Array.isArray(cycle.limitationsSnapshot)) {
    return { limitations: normalizeLimitationIds(cycle.limitationsSnapshot), known: true, source: "cycle_limitations_snapshot" };
  }
  if (recommendation && Array.isArray(recommendation.limitationIds)) {
    return { limitations: normalizeLimitationIds(recommendation.limitationIds), known: true, source: "recommendation_limitation_ids" };
  }
  return { limitations: null, known: false, source: null };
}

/** currentLimitations − previousLimitationsSnapshot. A removed limitation is never a new one; unknown previous -> []. */
export function deriveNewLimitations(previousLimitationsSnapshot, currentLimitations) {
  if (!Array.isArray(previousLimitationsSnapshot)) return [];
  const previous = new Set(normalizeLimitationIds(previousLimitationsSnapshot));
  return normalizeLimitationIds(currentLimitations).filter((id) => !previous.has(id));
}

/** UI / audit only (never a Gate 2 trigger). null when the previous snapshot is unknown. */
export function hasLimitationChanged(previousLimitationsSnapshot, currentLimitations) {
  if (!Array.isArray(previousLimitationsSnapshot)) return null;
  const a = normalizeLimitationIds(previousLimitationsSnapshot);
  const b = normalizeLimitationIds(currentLimitations);
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}

/** Phase C R03 hard filter over a list of exercises: the ones a limitation excludes. */
export function findHardFilterConflicts(exerciseIds, limitationIds) {
  return (exerciseIds || [])
    .map((exerciseId) => ({ exerciseId, conflict: findF01LimitationConflict(exerciseId, normalizeLimitationIds(limitationIds)) }))
    .filter((x) => x.conflict)
    .map((x) => ({ exerciseId: x.exerciseId, ...x.conflict }));
}

// ── Gates 1-5: decision ─────────────────────────────────────────────────

function matrixRule(changeClass, trainingState) {
  return F01_D5_DECISION_RULES.find((r) =>
    r.limitationOrDiscomfort === "none"
    && r.changeClass === changeClass
    && r.trainingState.split("/").includes(trainingState)) || null;
}

/**
 * @param {object} input
 *   assessmentValid: boolean   a valid baseline vs reassessment comparison exists (D4 eligible)
 *   changeMs: number           raw reassessment − baseline milliseconds
 *   completedTrainingDays: int unique valid completed training dates
 *   hasNewOrWorseningDiscomfort: boolean
 *   newLimitations: string[]   derived (deriveNewLimitations)
 *   hardFilterConflictExerciseIds: string[]  current exercises excluded by the CURRENT limitations
 *     (only non-empty for a legacy cycle with an unknown limitation baseline, or a new limitation)
 * @returns {{ decision, decisionRuleId, decisionRuleReason, gate, gate2Triggers, changeClass, trainingState, progressionBlocked, autoApplyAllowed: false }}
 */
export function evaluateD5Decision({
  assessmentValid,
  changeMs,
  completedTrainingDays,
  hasNewOrWorseningDiscomfort = false,
  newLimitations = [],
  hardFilterConflictExerciseIds = [],
}) {
  const changeClass = classify5xSTSChange(changeMs);
  const trainingState = classifyTrainingExposure(completedTrainingDays);
  const out = (ruleId, gate, extra = {}) => ({
    decision: DECISION_RULE[ruleId].decision,
    decisionRuleId: ruleId,
    decisionRuleReason: DECISION_RULE[ruleId].reason,
    decisionRuleVersion: D5_RULE_VERSION,
    gate,
    gate2Triggers: [],
    changeClass,
    trainingState,
    progressionBlocked: false,
    autoApplyAllowed: DECISION_RULE[ruleId].autoApplyAllowed, // false for every V1 rule
    ...extra,
  });

  // Gate 1 — assessment validity (an unclassifiable day count is invalid data too).
  if (assessmentValid !== true || trainingState == null) return out("R001", "GATE-VALIDITY");

  // Gate 2 — new / worsening discomfort, or new limitations (incl. a current exercise now excluded).
  const gate2Triggers = [];
  if (hasNewOrWorseningDiscomfort === true) gate2Triggers.push("new_or_worsening_discomfort");
  if ((newLimitations || []).length > 0) gate2Triggers.push("new_limitations");
  if ((hardFilterConflictExerciseIds || []).length > 0) gate2Triggers.push("current_exercise_hard_filter_conflict");
  if (gate2Triggers.length) return out("R011", "GATE-LIMITATION", { gate2Triggers, progressionBlocked: true });

  // Gate 3 — change class.
  if (changeClass === CHANGE_CLASS.UNCLASSIFIED) return out("R002", "GATE-CHANGE");

  // Gates 4 + 5 — 3×3 matrix.
  const rule = matrixRule(changeClass, trainingState);
  if (!rule) return out("R002", "GATE-CHANGE");
  return out(rule.ruleId, "GATE-MATRIX");
}

// ── Gate 6: next-cycle selection ────────────────────────────────────────

/** Confirmed transitions only; Draft / Pending never reach automatic selection. */
export function getConfirmedTransitions({ fromExerciseId, goalId, transitionType, transitions = F01_EXERCISE_TRANSITIONS }) {
  return transitions.filter((t) =>
    t.status === "Confirmed"
    && t.currentExerciseId === fromExerciseId
    && t.goalId === goalId
    && t.transitionType === transitionType);
}

function rankCandidates(candidates) {
  return [...candidates].sort((a, b) =>
    (LEVEL_RANK[a.matchLevel] - LEVEL_RANK[b.matchLevel])
    || (Number(b.aiSupported) - Number(a.aiSupported))
    || String(a.exerciseId).localeCompare(String(b.exerciseId)));
}

/**
 * @param {object} input
 *   decision: D5_DECISION value from evaluateD5Decision
 *   selectedGoalId: the source cycle's goal (never changed by D5)
 *   currentItems: [{ exerciseId, matchLevel }] in the source recommendation order
 *   currentLimitations: L01-L05 confirmed at D5
 *   catalog: exerciseService.listNormalized()
 *   transitions: defaults to the spec's ExerciseTransition rows
 * @returns {{ selectionRuleId, effectiveDecision, fallback, currentExerciseIds, proposedExerciseIds,
 *            replacedExercise, alternatives, hardFilterConflicts, maxReplace, nextCycleReady, reviewReasons }}
 */
export function selectNextCycleExercises({ decision, selectedGoalId, currentItems = [], currentLimitations = [], catalog = [], transitions = F01_EXERCISE_TRANSITIONS }) {
  const limitations = normalizeLimitationIds(currentLimitations);
  const currentIds = currentItems.map((it) => it.exerciseId);
  const byId = new Map((catalog || []).filter(Boolean).map((ex) => [ex.id || ex.exerciseId, ex]));
  const conflicts = findHardFilterConflicts(currentIds, limitations);
  const base = {
    currentExerciseIds: currentIds,
    proposedExerciseIds: [...currentIds],
    replacedExercise: null,
    alternatives: [],
    hardFilterConflicts: conflicts,
    fallback: null,
    reviewReasons: [],
  };

  const describe = (exerciseId, extra) => {
    const ex = byId.get(exerciseId);
    return {
      exerciseId,
      exerciseName: ex ? ex.name : exerciseId,
      matchLevel: getF01GoalMatchLevel(selectedGoalId, exerciseId),
      aiSupported: !!(ex && ex.aiSupported),
      ...extra,
    };
  };
  // Candidate must: exist, pass the Phase C hard filter, not duplicate the current / proposed set.
  const isEligible = (exerciseId, excludeIds) =>
    byId.has(exerciseId) && !excludeIds.includes(exerciseId) && !findF01LimitationConflict(exerciseId, limitations);
  const transitionCandidates = (fromExerciseId, type, excludeIds) => rankCandidates(
    getConfirmedTransitions({ fromExerciseId, goalId: selectedGoalId, transitionType: type, transitions })
      .filter((t) => isEligible(t.candidateExerciseId, excludeIds))
      .map((t) => describe(t.candidateExerciseId, { fromExerciseId, transitionType: type, source: "exercise_transition", evidenceType: t.evidenceType })));
  const replaceAt = (targetId, candidate, ruleId) => ({
    proposedExerciseIds: currentIds.map((id) => (id === targetId ? candidate.exerciseId : id)), // NC-G10 keeps the position
    replacedExercise: {
      fromExerciseId: targetId,
      fromExerciseName: describe(targetId).exerciseName,
      toExerciseId: candidate.exerciseId,
      toExerciseName: candidate.exerciseName,
      transitionType: candidate.transitionType,
      source: candidate.source,
      selectionRuleId: ruleId,
    },
  });

  // NC-N01 — no automatic next cycle; the current set is shown for reference only.
  if (decision === D5_DECISION.NO_AUTO_DECISION) {
    return { ...base, selectionRuleId: "NC-N01", effectiveDecision: decision, maxReplace: 0, nextCycleReady: false };
  }

  // NC-A01 — a current exercise is excluded by the Phase C hard filter (hard filter beats maintain / progress).
  if (conflicts.length) {
    const conflictIds = conflicts.map((c) => c.exerciseId);
    const kept = currentIds.filter((id) => !conflictIds.includes(id));
    const common = { selectionRuleId: "NC-A01", effectiveDecision: D5_DECISION.ADJUST, maxReplace: SELECTION_RULE["NC-A01"].maxReplace };
    if (conflicts.length >= 2) {
      // Never rebuild the whole plan automatically.
      return { ...base, ...common, proposedExerciseIds: kept, nextCycleReady: false, reviewReasons: [REVIEW_REASON.MULTIPLE_EXERCISES_FILTERED] };
    }
    const targetId = conflictIds[0];
    const regression = transitionCandidates(targetId, TRANSITION_TYPE.REGRESSION, currentIds);
    const replacement = transitionCandidates(targetId, TRANSITION_TYPE.SAME_GOAL_REPLACEMENT, currentIds);
    let chosen = regression[0] || replacement[0] || null;
    if (!chosen) {
      // Phase C same-Goal fallback: the Phase C deterministic order under the current limitations.
      const goal = F01_GOALS.find((g) => g.goalId === selectedGoalId);
      const fallbackId = goal
        ? orderF01GoalCandidates({ goal, limitationIds: limitations, catalog }).ordered.map((c) => c.exercise.id).find((id) => isEligible(id, currentIds))
        : null;
      chosen = fallbackId ? describe(fallbackId, { fromExerciseId: targetId, transitionType: null, source: "phase_c_same_goal_fallback" }) : null;
    }
    const alternatives = [...regression, ...replacement].filter((c) => !chosen || c.exerciseId !== chosen.exerciseId);
    if (!chosen) {
      return { ...base, ...common, proposedExerciseIds: kept, alternatives, nextCycleReady: false, reviewReasons: [REVIEW_REASON.NO_VALID_REPLACEMENT] };
    }
    return { ...base, ...common, ...replaceAt(targetId, chosen, "NC-A01"), alternatives, nextCycleReady: true };
  }

  // NC-M01 — keep ids and order; an available replacement is never applied.
  if (decision === D5_DECISION.MAINTAIN) {
    return { ...base, selectionRuleId: "NC-M01", effectiveDecision: decision, maxReplace: 0, nextCycleReady: true };
  }

  // NC-P01 — at most one Confirmed progression edge (never skips a level).
  if (decision === D5_DECISION.PROGRESS) {
    const targets = currentItems
      .map((it, index) => ({ exerciseId: it.exerciseId, index, level: it.matchLevel || getF01GoalMatchLevel(selectedGoalId, it.exerciseId) }))
      .sort((a, b) => (LEVEL_RANK[a.level] ?? 2) - (LEVEL_RANK[b.level] ?? 2) || a.index - b.index);
    for (const target of targets) {
      const candidates = transitionCandidates(target.exerciseId, TRANSITION_TYPE.PROGRESSION, currentIds);
      if (candidates.length) {
        return { ...base, selectionRuleId: "NC-P01", effectiveDecision: decision, maxReplace: SELECTION_RULE["NC-P01"].maxReplace, ...replaceAt(target.exerciseId, candidates[0], "NC-P01"), nextCycleReady: true };
      }
    }
    // No eligible progression -> maintain (never search the database for a "harder-looking" exercise).
    return { ...base, selectionRuleId: "NC-P01", effectiveDecision: D5_DECISION.MAINTAIN, fallback: "no_confirmed_progression", maxReplace: 0, nextCycleReady: true };
  }

  // NC-A02 — adjust without a hard-filter conflict: keep the whole set; alternatives are for review only.
  const alternatives = [];
  for (const id of currentIds) {
    for (const c of [...transitionCandidates(id, TRANSITION_TYPE.REGRESSION, currentIds), ...transitionCandidates(id, TRANSITION_TYPE.SAME_GOAL_REPLACEMENT, currentIds)]) {
      if (!alternatives.some((a) => a.exerciseId === c.exerciseId)) alternatives.push(c);
    }
  }
  return { ...base, selectionRuleId: "NC-A02", effectiveDecision: D5_DECISION.ADJUST, maxReplace: 0, alternatives, nextCycleReady: true };
}

// ── Gate 7: confirmation ────────────────────────────────────────────────

/**
 * Every proposal requires confirmation. professional_review_required when:
 *   A. new / worsening discomfort without a new mappable L01-L05;
 *   B. 2+ current exercises excluded by new limitations at once;
 *   C. no valid replacement for an excluded exercise.
 * no_auto_decision has nothing to confirm (confirmationMode null, never ready).
 */
export function determineConfirmationMode({ decision, hasNewOrWorseningDiscomfort = false, newLimitations = [], selection }) {
  if (decision === D5_DECISION.NO_AUTO_DECISION) {
    return { requiresConfirmation: true, confirmationMode: null, nextCycleReady: false, reviewReasons: [] };
  }
  const reviewReasons = [];
  if (hasNewOrWorseningDiscomfort === true && !(newLimitations || []).length) reviewReasons.push(REVIEW_REASON.UNMAPPED_DISCOMFORT);
  for (const r of (selection && selection.reviewReasons) || []) if (!reviewReasons.includes(r)) reviewReasons.push(r);
  if (reviewReasons.length) {
    return { requiresConfirmation: true, confirmationMode: CONFIRMATION_MODE.PROFESSIONAL_REVIEW_REQUIRED, nextCycleReady: false, reviewReasons };
  }
  return { requiresConfirmation: true, confirmationMode: CONFIRMATION_MODE.USER_ACCEPTANCE, nextCycleReady: !!(selection && selection.nextCycleReady), reviewReasons };
}

// ── Reasons (deterministic templates; never clinical wording) ───────────

export function buildD5Reason({ selection, confirmation }) {
  const reasons = confirmation.reviewReasons || [];
  if (selection.selectionRuleId === "NC-N01") return SELECTION_RULE["NC-N01"].reasonTemplate;
  if (reasons.includes(REVIEW_REASON.UNMAPPED_DISCOMFORT)) {
    return "這段期間回報了新的或加重的不適。系統不會依此自動更換或進階動作，先保留目前配置，需要進一步確認後再安排下一週訓練。";
  }
  if (reasons.includes(REVIEW_REASON.MULTIPLE_EXERCISES_FILTERED)) {
    return "目前的限制條件同時與多個訓練動作不符。系統不自動重組整份課表，需要進一步確認後再安排下一週訓練。";
  }
  if (reasons.includes(REVIEW_REASON.NO_VALID_REPLACEMENT)) {
    const c = selection.hardFilterConflicts[0];
    return `目前的限制條件與「${c ? c.exerciseName || c.exerciseId : "部分訓練動作"}」不符，但系統找不到同目標的合格替代動作，需要進一步確認後再安排下一週訓練。`;
  }
  if (selection.selectionRuleId === "NC-A01") return SELECTION_RULE["NC-A01"].reasonTemplate;
  if (selection.selectionRuleId === "NC-A02") return SELECTION_RULE["NC-A02"].reasonTemplate;
  if (selection.selectionRuleId === "NC-P01" && selection.replacedExercise) {
    return SELECTION_RULE["NC-P01"].reasonTemplate
      .replace("{current}", selection.replacedExercise.fromExerciseName)
      .replace("{candidate}", selection.replacedExercise.toExerciseName);
  }
  if (selection.selectionRuleId === "NC-P01") {
    return "本週符合進階候選條件，但目前沒有已確認的進階候選；下一週沿用目前訓練配置，持續追蹤。";
  }
  return SELECTION_RULE["NC-M01"].reasonTemplate;
}

// ── Whole proposal (pure) ───────────────────────────────────────────────

/**
 * Validates the D5 status-check input: a boolean discomfort flag, an optional
 * note (kept verbatim, never analysed), limitations only from L01-L05.
 * @returns {{ input } | { error }}
 */
export function normalizeD5Input(raw) {
  if (!raw || typeof raw.hasNewOrWorseningDiscomfort !== "boolean") return { error: "missing_discomfort_answer" };
  const list = Array.isArray(raw.currentLimitations) ? raw.currentLimitations : null;
  if (!list) return { error: "missing_current_limitations" };
  if (list.some((id) => !LIMITATION_IDS.includes(id))) return { error: "unknown_limitation" };
  const note = typeof raw.discomfortNote === "string" ? raw.discomfortNote.trim().slice(0, 500) : "";
  return {
    input: {
      hasNewOrWorseningDiscomfort: raw.hasNewOrWorseningDiscomfort,
      discomfortNote: note || null,
      currentLimitations: normalizeLimitationIds(list),
    },
  };
}

/**
 * Items of the proposed next-cycle recommendation, in proposal order. Kept
 * exercises copy the source item (reason / matchLevel unchanged); the one
 * replacement gets a deterministic transition reason.
 */
export function buildD5ProposalItems({ selection, sourceItems = [], selectedGoalId, catalog = [] }) {
  const goal = F01_GOALS.find((g) => g.goalId === selectedGoalId) || { goalId: selectedGoalId, label: selectedGoalId };
  const byId = new Map((catalog || []).filter(Boolean).map((ex) => [ex.id || ex.exerciseId, ex]));
  const bySource = new Map(sourceItems.map((it) => [it.exerciseId, it]));
  const rep = selection.replacedExercise;
  return selection.proposedExerciseIds.map((exerciseId, idx) => {
    const src = bySource.get(exerciseId);
    if (src && !(rep && rep.toExerciseId === exerciseId)) {
      return { ...src, rank: idx + 1, matchedConditions: (src.matchedConditions || []).map((c) => ({ ...c })) };
    }
    const ex = byId.get(exerciseId);
    const name = ex ? ex.name : exerciseId;
    const matchLevel = getF01GoalMatchLevel(selectedGoalId, exerciseId);
    const typeText = rep && rep.transitionType ? TRANSITION_TYPE_TEXT[rep.transitionType] : "同目標替代候選";
    return {
      rank: idx + 1,
      exerciseId,
      exerciseName: name,
      functionalDomain: "F01",
      sourceAssessmentId: null,
      selectedGoalId: goal.goalId,
      selectedGoalLabel: goal.label,
      matchLevel,
      matchedConditions: [
        { ruleId: "NC-G06", text: `同一訓練目標「${goal.label}」` },
        { ruleId: "NC-G04", text: "通過目前的限制條件篩選" },
        ...(rep && rep.source === "exercise_transition" ? [{ ruleId: "NC-G05", text: "已確認的動作轉換關係" }] : []),
      ],
      reason: `${name}為「${goal.label}」的${typeText}，取代「${rep ? rep.fromExerciseName : ""}」。`,
      aiSupported: !!(ex && ex.aiSupported),
      recommendationRole: "",
      evidenceStatus: null,
    };
  });
}

/**
 * The whole D5 proposal for one completed source cycle (pure).
 * @param {object} p
 *   sourceCycle, sourceRecommendation, comparison (buildTrackingComparison output),
 *   input (normalizeD5Input().input), catalog
 */
export function buildD5Proposal({ sourceCycle, sourceRecommendation, comparison, input, catalog = [] }) {
  const currentItems = ((sourceRecommendation && sourceRecommendation.items) || []).map((it) => ({ exerciseId: it.exerciseId, matchLevel: it.matchLevel }));
  const currentExerciseIds = currentItems.map((it) => it.exerciseId);
  const previous = resolvePreviousLimitationsSnapshot({ cycle: sourceCycle, recommendation: sourceRecommendation });
  const currentLimitations = normalizeLimitationIds(input.currentLimitations);
  const newLimitations = deriveNewLimitations(previous.limitations, currentLimitations);
  const conflicts = findHardFilterConflicts(currentExerciseIds, currentLimitations);
  const completedTrainingDays = countCompletedTrainingDays(sourceCycle);
  const assessmentValid = !!(comparison && comparison.eligible);
  const changeMs = assessmentValid ? comparison.changeMs : null;

  const evaluation = evaluateD5Decision({
    assessmentValid,
    changeMs,
    completedTrainingDays,
    hasNewOrWorseningDiscomfort: input.hasNewOrWorseningDiscomfort,
    newLimitations,
    hardFilterConflictExerciseIds: conflicts.map((c) => c.exerciseId),
  });
  const selection = selectNextCycleExercises({
    decision: evaluation.decision,
    selectedGoalId: sourceCycle.selectedGoalId,
    currentItems,
    currentLimitations,
    catalog,
  });
  const confirmation = determineConfirmationMode({
    decision: selection.effectiveDecision,
    hasNewOrWorseningDiscomfort: input.hasNewOrWorseningDiscomfort,
    newLimitations,
    selection,
  });
  return {
    sourceCycleId: sourceCycle.id,
    sourceRecommendationId: sourceRecommendation ? sourceRecommendation.id : null,
    baselineAssessmentId: sourceCycle.baselineAssessmentId,
    reassessmentId: sourceCycle.reassessmentId || null,
    selectedGoalId: sourceCycle.selectedGoalId,
    decision: selection.effectiveDecision,
    matrixDecision: evaluation.decision,
    decisionRuleId: evaluation.decisionRuleId,
    decisionRuleReason: evaluation.decisionRuleReason,
    decisionRuleVersion: D5_RULE_VERSION,
    specSha256: F01_PROGRESSION_SPEC_SOURCE.sha256,
    gate: evaluation.gate,
    gate2Triggers: evaluation.gate2Triggers,
    assessmentValid,
    changeMs,
    changeClass: evaluation.changeClass,
    referenceMdcMs: REFERENCE_MDC_MS,
    completedTrainingDays,
    plannedTrainingDays: PLANNED_TRAINING_DAYS,
    trainingState: evaluation.trainingState,
    currentExerciseIds,
    proposedExerciseIds: selection.proposedExerciseIds,
    replacedExercise: selection.replacedExercise,
    alternatives: selection.alternatives,
    hardFilterConflicts: selection.hardFilterConflicts,
    selectionRuleId: selection.selectionRuleId,
    selectionFallback: selection.fallback,
    hasNewOrWorseningDiscomfort: input.hasNewOrWorseningDiscomfort,
    discomfortNote: input.discomfortNote,
    currentLimitations,
    previousLimitationsSnapshot: previous.limitations,
    previousLimitationsSource: previous.source,
    limitationsBaselineKnown: previous.known,
    limitationChanged: hasLimitationChanged(previous.limitations, currentLimitations),
    newLimitations,
    autoApplyAllowed: false,
    requiresConfirmation: confirmation.requiresConfirmation,
    confirmationMode: confirmation.confirmationMode,
    reviewReasons: confirmation.reviewReasons,
    nextCycleReady: confirmation.nextCycleReady,
    reason: buildD5Reason({ selection, confirmation }),
  };
}

// ── Next-cycle handoff (pure) ───────────────────────────────────────────

/** Local date of an assessment's REAL measurement (never a debug date). */
export function measuredDateKeyOf(session) {
  const at = session && ((session.result && session.result.measuredAt) || session.completedAt);
  return at ? toLocalDateKey(at) : null;
}

/**
 * Same local date as the reassessment -> the reassessment may be reused as
 * the next cycle's baseline (Day 1 = its measured date). Any later date ->
 * requiresFreshBaseline: an old reassessment is never back-dated into a new Day 1.
 * `confirmationDateKey` must be the REAL local date of the confirmation.
 */
export function deriveNextCycleHandoff({ sourceCycle, reassessment, confirmationDateKey }) {
  const reassessmentDateKey = reassessment && sourceCycle && reassessment.id === sourceCycle.reassessmentId ? measuredDateKeyOf(reassessment) : null;
  const reuse = !!reassessmentDateKey && isDateKey(confirmationDateKey) && reassessmentDateKey === confirmationDateKey;
  if (!reuse) {
    return {
      baselineReuseAllowed: false,
      requiresFreshBaseline: true,
      confirmationDateKey: isDateKey(confirmationDateKey) ? confirmationDateKey : null,
      reassessmentDateKey,
      baselineAssessmentId: null,
      baselineMeasuredAt: null,
      cycleStartDateKey: null,
      plannedReassessmentDateKey: null,
    };
  }
  return {
    baselineReuseAllowed: true,
    requiresFreshBaseline: false,
    confirmationDateKey,
    reassessmentDateKey,
    baselineAssessmentId: reassessment.id,
    baselineMeasuredAt: (reassessment.result && reassessment.result.measuredAt) || reassessment.completedAt,
    cycleStartDateKey: reassessmentDateKey,
    plannedReassessmentDateKey: getPlannedReassessmentDateKey(reassessmentDateKey),
  };
}

/** A baseline usable for Cycle N+1: a completed 5xSTS (never incomplete / invalid). */
export function isUsableNextCycleBaseline(session) {
  return !!session
    && session.assessmentType === "five_times_sit_to_stand"
    && session.status === "completed"
    && isCompletedFiveTimesSitToStandResult(session.result);
}

/**
 * Stored fields of Cycle N+1 (no id / timestamps). Day 1 = the local date of
 * the ACTUAL baseline measurement. `cycleStatus` reuses the existing D1 value
 * "training" (same meaning as the spec's "active").
 */
export function buildNextTrackingCycleFields({ sourceCycle, proposal, baselineSession, baselineSource }) {
  const baselineMeasuredAt = (baselineSession.result && baselineSession.result.measuredAt) || baselineSession.completedAt;
  const cycleStartDateKey = toLocalDateKey(baselineMeasuredAt);
  const d5 = proposal.d5;
  return {
    userId: sourceCycle.userId,
    patientId: sourceCycle.userId,
    functionalDomain: sourceCycle.functionalDomain,
    assessmentType: sourceCycle.assessmentType,
    baselineAssessmentId: baselineSession.id,
    baselineMeasuredAt,
    baselineSource, // "reassessment_reuse" | "fresh_baseline"
    cycleStartDateKey,
    plannedReassessmentDateKey: getPlannedReassessmentDateKey(cycleStartDateKey),
    previousCycleId: sourceCycle.id,
    selectedGoalId: sourceCycle.selectedGoalId,
    recommendationId: proposal.id,
    d5ProposalId: proposal.id,
    limitationsSnapshot: [...d5.currentLimitations],
    discomfortSnapshot: { hasNewOrWorseningDiscomfort: d5.hasNewOrWorseningDiscomfort, discomfortNote: d5.discomfortNote || null },
    cycleStatus: "training",
    completedTrainingDates: [],
    dailyTrainingProgress: {},
    reassessmentId: null,
  };
}
