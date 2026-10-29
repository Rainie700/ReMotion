import { createCollection } from "./storageService.js";
import { generateId, nowIso } from "../utils/id.js";
import { FUNCTIONAL_ASSESSMENT_TYPES, resolveAssessmentType, functionalAssessmentService } from "./functionalAssessmentService.js";
import { buildTrackingComparison } from "./trackingComparison.js";
import { isCurrentFa5xMeasurement } from "./fa5xMeasurementCompatibility.js";
import {
  TRACKING_RULE_VERSION,
  TRACKING_STATUS,
  toLocalDateKey,
  getPlannedReassessmentDateKey,
  isCompletedFiveTimesSitToStandResult,
  getTrackingCycleViewState,
  isTrainingRecordCompleted,
  isTrainingDateInCycle,
  isDateKey,
} from "./trackingCycle.js";
import { recommendationService, D5_PROPOSAL_ORIGIN } from "./recommendationService.js";
import { exerciseService } from "./exerciseService.js";
import {
  F01_DAILY_SNAPSHOT_VERSION,
  F01_DAILY_TARGET_RULES_VERSION,
  TARGETS_STATUS,
  TARGET_REF,
  SNAPSHOT_MODE,
  freezeDailyTargets,
  buildDailyTarget,
  resolveTargetRef,
  buildTargetSummary,
  buildTrainingAttempt,
  F01_FORMAL_COMPLETION_RULES_VERSION,
  COMPLETION_RULE_KIND,
  isFormalTargetMet,
  checkCountingDefinitions,
  filterAutoRecommendationCatalog,
} from "./f01DailyTargets.js";

/** Batch 2 — only the known formal completion rules version may be stamped on a cycle / an acceptance. */
const checkRulesVersion = (v) => v == null || v === F01_FORMAL_COMPLETION_RULES_VERSION;
const getCatalogRaw = (id) => exerciseService.getById(id);
import { relationService } from "./relationService.js";
import { resolveD5Arrangement, isPatientAcceptable, planFingerprint, isOutdatedG01Proposal } from "./d5Arrangement.js";
import {
  resolveInitialReviewRequirement,
  isInitialPlanAccepted,
  isFirstF01Recommendation,
  INITIAL_PLAN_BASELINE_ROLE,
  initialPlanCycleId,
  initialPlanFingerprint,
  planItemsKey,
  checkFirstRecommendationIntegrity,
  isEmptyFirstRecommendation,
} from "./f01InitialReview.js";
import { F01_GOALS } from "./f01RecommendationSpec.js";
import { checkFa5xComparisonConditions } from "./fa5xComparisonConditions.js";
import {
  D5_RULE_VERSION,
  D5_DECISION_LABEL,
  CONFIRMATION_MODE,
  normalizeD5Input,
  normalizeLimitationIds,
  resolvePreviousLimitationsSnapshot,
  buildD5Proposal,
  buildD5ProposalItems,
  deriveNextCycleHandoff,
  isUsableNextCycleBaseline,
  buildNextTrackingCycleFields,
} from "./f01ProgressionDecision.js";

/** assessmentRole stored on a 5xSTS result taken through the tracking card's 「進行再次評估」 (Phase D2). */
export const REASSESSMENT_ROLE = "reassessment";

/**
 * Phase D5 — assessmentRole of a fresh 5xSTS taken ONLY to become the baseline
 * of the next cycle of an accepted D5 proposal (confirmation on a later day
 * than the reassessment). It never enters the Phase C recommendation flow.
 */
export const NEXT_CYCLE_BASELINE_ROLE = "next_cycle_baseline";

/**
 * Phase D1 — F01 7-day Tracking Cycle storage.
 *
 * A cycle only LINKS existing records (baseline functionalAssessmentSession,
 * F01 goal recommendation, later the reassessment); it replaces none of them.
 * Collection "trackingCycles" (optional cloud sync, see storageService).
 *
 * Stored fields never include the day number: cycleDay / view status are
 * derived per day by getTrackingCycleViewState(). cycleStatus is stored as
 * "training" and only becomes "completed" together with a reassessmentId
 * (Phase D2) — never because a date passed.
 */
const trackingCyclesCollection = createCollection("trackingCycles");

export const F01_TRACKING = Object.freeze({ functionalDomain: "F01", assessmentType: "5xSTS" });

// Therapist reviews of D5 proposals (written only by a linked therapist; js/data/d5TherapistReviewService.js).
const d5ReviewsCollection = createCollection("d5TherapistReviews");

const byNewest = (a, b) =>
  String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || String(b.id).localeCompare(String(a.id));

function isActive(cycle) {
  return !cycle.reassessmentId;
}

export const trackingCycleService = {
  getTrackingCycleById(cycleId) {
    return cycleId ? trackingCyclesCollection.getById(cycleId) : null;
  },

  /** All cycles of a user for a domain, newest first (deterministic: createdAt, then id). */
  listTrackingCycles(userId, { functionalDomain = F01_TRACKING.functionalDomain } = {}) {
    return trackingCyclesCollection
      .query((c) => c.userId === userId && c.functionalDomain === functionalDomain)
      .sort(byNewest);
  },

  /** The one active cycle (no reassessment yet) for user + domain, or null. */
  getActiveTrackingCycle(userId, { functionalDomain = F01_TRACKING.functionalDomain } = {}) {
    return trackingCycleService.listTrackingCycles(userId, { functionalDomain }).find(isActive) || null;
  },

  /** Newest cycle regardless of status (for the home card once nothing is active). */
  getLatestTrackingCycle(userId, { functionalDomain = F01_TRACKING.functionalDomain } = {}) {
    return trackingCycleService.listTrackingCycles(userId, { functionalDomain })[0] || null;
  },

  /**
   * Creates the F01 cycle for a baseline once its recommendation is saved —
   * or returns the existing one. Rules:
   *   - baseline must be a completed five_times_sit_to_stand session
   *     (incomplete / invalid never start a cycle);
   *   - recommendation must be the saved F01 goal recommendation OF THAT
   *     baseline;
   *   - one cycle per user + F01 + baselineAssessmentId: a repeat returns the
   *     same cycle, only selectedGoalId / recommendationId / updatedAt change;
   *   - one active F01 cycle per user: while a cycle for ANOTHER baseline is
   *     still active, no second cycle is created (a new 5xSTS is not treated
   *     as a new baseline — reassessment linking is Phase D2);
   *   - a NEW cycle needs a current-version 5xSTS measurement as its baseline
   *     (an older / unversioned result stays viewable but cannot start one;
   *     an existing cycle of that baseline is still returned / re-linked).
   * cycleStartDateKey = LOCAL date of the baseline measurement, not of the
   * recommendation.
   *
   * @returns {{ cycle, created: boolean, reason?: string } | { error: string }}
   */
  createOrGetTrackingCycle({ userId, baselineSession, recommendation, completionRulesVersion = null }) {
    // F01 batch 2 — the app passes the formal completion rules version for every NEW cycle
    // (docs/specs/f01-batch2-completion-alignment-design.md §4); other callers (older code,
    // demo seeds) create old-version cycles exactly as before.
    if (!checkRulesVersion(completionRulesVersion)) return { error: "unknown_completion_rules_version" };
    if (!userId) return { error: "missing_user" };
    if (!baselineSession || baselineSession.patientId !== userId) return { error: "missing_baseline" };
    if (resolveAssessmentType(baselineSession) !== FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND) return { error: "not_5xsts" };
    if (baselineSession.status !== "completed" || !isCompletedFiveTimesSitToStandResult(baselineSession.result)) return { error: "baseline_not_completed" };
    // Phase D2 — a reassessment result can never start (be the baseline of) a cycle.
    if (baselineSession.result && baselineSession.result.assessmentRole === REASSESSMENT_ROLE) return { error: "reassessment_cannot_be_baseline" };
    // Phase D5 — a next-cycle baseline belongs to its D5 proposal, never to a Phase C recommendation.
    if (baselineSession.result && baselineSession.result.assessmentRole === NEXT_CYCLE_BASELINE_ROLE) return { error: "next_cycle_baseline_not_phase_c" };
    // An initial-plan baseline belongs to its accepted, therapist-confirmed plan (createInitialPlanCycle).
    if (baselineSession.result && baselineSession.result.assessmentRole === INITIAL_PLAN_BASELINE_ROLE) return { error: "initial_plan_baseline_not_phase_c" };
    if (!recommendation || recommendation.kind !== "f01_goal" || !recommendation.id) return { error: "missing_recommendation" };
    if (recommendation.patientId !== userId || recommendation.sourceAssessmentId !== baselineSession.id) return { error: "recommendation_not_for_baseline" };
    // G01 condition screen — a recommendation without any item never creates or re-links a cycle.
    if (isEmptyFirstRecommendation(recommendation)) return { error: "recommendation_has_no_items" };

    // docs/F01_INITIAL_REVIEW_PLAN.md — a first recommendation that needs professional review never
    // starts a cycle here and never re-links an existing one (that cycle keeps its own plan). Once
    // accepted, its first week starts ONLY through createInitialPlanCycle (stage 2).
    // Integrity pass — a first recommendation without a verifiable marker (legacy, or exerciseIds /
    // marker not matching its candidate items) never starts or re-links a cycle: it is never read as
    // "no review needed". A cycle already running on it is returned unchanged below.
    const integrity = checkFirstRecommendationIntegrity(recommendation);
    const initialReview = resolveInitialReviewRequirement(recommendation);
    const reviewHold = !integrity.ok
      ? { error: "recommendation_integrity_missing", reason: integrity.reason }
      : initialReview.required
      ? (isInitialPlanAccepted(recommendation)
        ? { error: "initial_plan_starts_via_acceptance", triggerCodes: initialReview.triggerCodes }
        : { error: "initial_review_required", triggerCodes: initialReview.triggerCodes })
      : null;

    const sameBaseline = trackingCyclesCollection
      .query((c) => c.userId === userId && c.functionalDomain === F01_TRACKING.functionalDomain && c.baselineAssessmentId === baselineSession.id)
      .sort(byNewest)[0];
    if (sameBaseline) {
      if (!isActive(sameBaseline)) return { cycle: sameBaseline, created: false, reason: "baseline_cycle_completed" };
      if (reviewHold && sameBaseline.recommendationId !== recommendation.id) return { ...reviewHold, cycle: sameBaseline };
      // A week running a therapist-confirmed plan is never silently re-linked by a re-set of needs.
      if (sameBaseline.initialPlanAcceptance && sameBaseline.recommendationId !== recommendation.id) return { error: "cycle_runs_confirmed_plan", cycle: sameBaseline };
      const updated = trackingCycleService.updateTrackingCycleRecommendation(sameBaseline.id, {
        selectedGoalId: recommendation.selectedGoalId,
        recommendationId: recommendation.id,
        limitationsSnapshot: recommendation.limitationIds,
      });
      return { cycle: updated, created: false, reason: "same_baseline" };
    }
    if (reviewHold) return reviewHold;

    const otherActive = trackingCycleService.getActiveTrackingCycle(userId);
    if (otherActive) return { cycle: otherActive, created: false, reason: "another_active_cycle" };
    if (!isCurrentFa5xMeasurement(baselineSession.result)) return { error: "baseline_measurement_outdated" };

    const baselineMeasuredAt = (baselineSession.result && baselineSession.result.measuredAt) || baselineSession.completedAt;
    const cycleStartDateKey = toLocalDateKey(baselineMeasuredAt);
    if (!cycleStartDateKey) return { error: "baseline_date_missing" };
    // F01 batch 2 §3D — a new-version plan takes effect only when every item has an executable counting definition.
    if (completionRulesVersion) {
      const defs = checkCountingDefinitions({ items: recommendation.items || [], getCatalog: getCatalogRaw });
      if (!defs.ok) return { error: "counting_basis_undefined", undefinedItems: defs.undefinedItems };
    }
    const now = nowIso();
    const id = generateId("trackingCycle");
    const cycle = trackingCyclesCollection.create({
      ...(completionRulesVersion ? { formalCompletionRulesVersion: completionRulesVersion } : {}),
      id,
      cycleId: id,
      userId,
      patientId: userId, // same scoping field as the other patient collections (cloud load / therapist relations)
      functionalDomain: F01_TRACKING.functionalDomain,
      assessmentType: F01_TRACKING.assessmentType,
      baselineAssessmentId: baselineSession.id,
      baselineMeasuredAt,
      cycleStartDateKey,
      plannedReassessmentDateKey: getPlannedReassessmentDateKey(cycleStartDateKey),
      selectedGoalId: recommendation.selectedGoalId,
      recommendationId: recommendation.id,
      // Phase D5 — limitations in force for this cycle (the next cycle's newLimitations baseline).
      ...(Array.isArray(recommendation.limitationIds) ? { limitationsSnapshot: normalizeLimitationIds(recommendation.limitationIds) } : {}),
      cycleStatus: TRACKING_STATUS.TRAINING,
      completedTrainingDates: [],
      reassessmentId: null,
      trackingRuleVersion: TRACKING_RULE_VERSION,
      createdAt: now,
      updatedAt: now,
    });
    return { cycle, created: true };
  },

  /** Re-generated recommendation for the same baseline: only the goal / recommendation link (and its limitations) change. */
  updateTrackingCycleRecommendation(cycleId, { selectedGoalId, recommendationId, limitationsSnapshot }) {
    const cycle = trackingCyclesCollection.getById(cycleId);
    if (!cycle) return null;
    if (cycle.selectedGoalId === selectedGoalId && cycle.recommendationId === recommendationId) return cycle;
    const snapshot = Array.isArray(limitationsSnapshot) ? { limitationsSnapshot: normalizeLimitationIds(limitationsSnapshot) } : {};
    return trackingCyclesCollection.update(cycleId, { selectedGoalId, recommendationId, ...snapshot, updatedAt: nowIso() });
  },

  /**
   * Phase D2 — may this cycle take a reassessment right now? Used both when
   * the tracking card's 「進行再次評估」 is pressed and again when the result
   * is written. Never modifies anything.
   * @returns {{ ok: true, cycle } | { ok: false, reason: string }}
   */
  checkReassessmentEligibility({ cycleId, userId, todayDateKey }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle) return { ok: false, reason: "cycle_not_found" };
    if (!userId || cycle.userId !== userId) return { ok: false, reason: "not_owner" };
    if (cycle.functionalDomain !== F01_TRACKING.functionalDomain || cycle.assessmentType !== F01_TRACKING.assessmentType) return { ok: false, reason: "wrong_cycle_type" };
    if (cycle.reassessmentId) return { ok: false, reason: "cycle_already_completed", cycle };
    if (getTrackingCycleViewState(cycle, todayDateKey).status !== TRACKING_STATUS.READY_FOR_REASSESSMENT) return { ok: false, reason: "not_ready_for_reassessment" };
    return { ok: true, cycle };
  },

  /**
   * Phase D2 — links a finished 5xSTS to its cycle as the reassessment.
   * Writes ONLY reassessmentId / reassessmentMeasuredAt / reassessmentDateKey /
   * cycleStatus "completed" / completedAt / updatedAt; baseline, dates, goal
   * and recommendation links are never touched and no new cycle is created.
   *
   * The session must: belong to the user; be a five_times_sit_to_stand;
   * carry the explicit reassessment context for THIS cycle
   * (result.assessmentRole === "reassessment" && result.trackingCycleId);
   * be completed (incomplete / invalid never complete a cycle); not be the
   * baseline itself.
   * Idempotent: the same reassessment again -> success, no write; a cycle
   * already completed by ANOTHER assessment -> "cycle_already_completed",
   * never overwritten.
   * `todayDateKey` is only the eligibility gate (the local date, or the dev
   * ?trackingToday= override for acceptance testing). The STORED
   * reassessmentDateKey is always the local date of the real measurement
   * (result.measuredAt) — a debug date never reaches stored data (Phase D3 fix).
   *
   * @returns {{ cycle, linked: boolean, alreadyLinked?: boolean } | { error: string, cycle? }}
   */
  completeTrackingCycleWithReassessment({ cycleId, userId, reassessment, todayDateKey }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle) return { error: "cycle_not_found" };
    if (!userId || cycle.userId !== userId) return { error: "not_owner" };
    if (!reassessment || !reassessment.id) return { error: "missing_reassessment" };
    if (cycle.reassessmentId === reassessment.id) return { cycle, linked: true, alreadyLinked: true };
    if (cycle.reassessmentId) return { error: "cycle_already_completed", cycle };
    if (reassessment.patientId !== userId) return { error: "reassessment_not_owned" };
    if (resolveAssessmentType(reassessment) !== FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND) return { error: "not_5xsts" };
    if (reassessment.id === cycle.baselineAssessmentId) return { error: "reassessment_is_baseline" };
    const result = reassessment.result || {};
    if (result.assessmentRole !== REASSESSMENT_ROLE || result.trackingCycleId !== cycle.id) return { error: "missing_reassessment_context" };
    if (reassessment.status !== "completed" || !isCompletedFiveTimesSitToStandResult(result)) return { error: "reassessment_not_completed" };
    const eligibility = trackingCycleService.checkReassessmentEligibility({ cycleId, userId, todayDateKey });
    if (!eligibility.ok) return { error: eligibility.reason };

    const now = nowIso();
    const reassessmentMeasuredAt = result.measuredAt || reassessment.completedAt || null;
    const updated = trackingCyclesCollection.update(cycle.id, {
      reassessmentId: reassessment.id,
      reassessmentMeasuredAt,
      reassessmentDateKey: toLocalDateKey(reassessmentMeasuredAt),
      cycleStatus: TRACKING_STATUS.COMPLETED,
      completedAt: now,
      updatedAt: now,
    });
    return { cycle: updated, linked: true, alreadyLinked: false };
  },

  // ── Phase D3 — daily training progress ────────────────────────────────

  /**
   * Freezes a training day's required exercises: the first time training
   * starts on `dateKey`, the cycle's CURRENT recommendation exercise ids are
   * stored for that day and never change afterwards (a later re-set of the
   * goal / recommendation does not rewrite earlier days). Stored inside the
   * cycle as dailyTrainingProgress[dateKey].
   * `dateKey` must be the REAL local date (never the ?trackingToday= override).
   *
   * F01 batch 1 (docs/specs/f01-batch1-daily-target-snapshot-spec.md, 4.1) —
   * a NEW entry is snapshot version 2 and is created in one of two modes:
   *   - "formal_start": the required list AND every exercise's frozen target
   *     in ONE write; any exercise without a valid target -> nothing written.
   *   - "completion_fallback" (default; the existing completion flow): the
   *     list only, targetsStatus "not_frozen" — no target is back-filled.
   * An EXISTING entry (older snapshot, or not_frozen) is returned unchanged:
   * it is never upgraded with targets.
   * @returns {{ entry, cycle, created: boolean } | { error: string }}
   */
  ensureDailyTrainingSnapshot({ cycleId, userId, dateKey, mode = SNAPSHOT_MODE.COMPLETION_FALLBACK }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle) return { error: "cycle_not_found" };
    if (!userId || cycle.userId !== userId) return { error: "not_owner" };
    if (cycle.reassessmentId) return { error: "cycle_already_completed" };
    if (!isTrainingDateInCycle(cycle, dateKey)) return { error: "outside_training_days" };
    const existing = cycle.dailyTrainingProgress && cycle.dailyTrainingProgress[dateKey];
    if (existing) return { entry: existing, cycle, created: false };
    const rec = recommendationService.getById(cycle.recommendationId);
    if (!rec || rec.kind !== "f01_goal" || rec.patientId !== userId) return { error: "recommendation_not_found" };
    const requiredExerciseIds = [...new Set((rec.items || []).map((it) => it.exerciseId).filter(Boolean))];
    if (!requiredExerciseIds.length) return { error: "recommendation_has_no_exercises" };
    let targetFields = { targetsStatus: TARGETS_STATUS.NOT_FROZEN, targets: {} };
    if (mode === SNAPSHOT_MODE.FORMAL_START) {
      // Batch 2 §4 — the day's snapshot copies the CYCLE's completion rules version (none for old-version cycles).
      const version = cycle.formalCompletionRulesVersion || null;
      const frozen = freezeDailyTargets({ exerciseIds: requiredExerciseIds, recommendation: rec, getCatalog: (id) => exerciseService.getById(id), completionRulesVersion: version });
      if (frozen.error) return { error: "target_freeze_failed", reason: frozen.error, exerciseId: frozen.exerciseId };
      targetFields = { targetsStatus: TARGETS_STATUS.FROZEN, targets: frozen.targets, ...(version ? { completionRulesVersion: version } : {}) };
    }
    const now = nowIso();
    const entry = {
      dateKey,
      trackingCycleId: cycle.id,
      recommendationId: rec.id,
      requiredExerciseIds,
      completedExerciseIds: [],
      exerciseCompletions: {},
      isComplete: false,
      createdAt: now,
      completedAt: null,
      snapshotVersion: F01_DAILY_SNAPSHOT_VERSION,
      targetRulesVersion: F01_DAILY_TARGET_RULES_VERSION,
      ...targetFields,
      attempts: {},
    };
    const updated = trackingCyclesCollection.update(cycle.id, {
      dailyTrainingProgress: { ...(cycle.dailyTrainingProgress || {}), [dateKey]: entry },
      updatedAt: now,
    });
    if (!updated) return { error: "snapshot_write_failed" };
    return { entry, cycle: updated, created: true };
  },

  // ── F01 batch 1 — formal start, frozen targets, saved-training attempts ─
  // Spec: docs/specs/f01-batch1-daily-target-snapshot-spec.md (待實作、待驗證).

  /**
   * May THIS exercise be trained formally on `dateKey`? (spec 4.2 step 1)
   * Never writes. Reasons: cycle_not_found / not_owner / cycle_completed /
   * recommendation_mismatch / recommendation_not_found / outside_training_days /
   * exercise_not_in_daily_plan.
   * @returns {{ ok: true, cycle, entry } | { ok: false, reason }}
   */
  checkF01FormalTrainingDay({ cycleId, userId, recommendationId, exerciseId, dateKey }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle) return { ok: false, reason: "cycle_not_found" };
    if (!userId || cycle.userId !== userId) return { ok: false, reason: "not_owner" };
    const active = trackingCycleService.getActiveTrackingCycle(userId);
    if (cycle.reassessmentId || !active || active.id !== cycle.id) return { ok: false, reason: "cycle_completed" };
    if (!recommendationId || cycle.recommendationId !== recommendationId) return { ok: false, reason: "recommendation_mismatch" };
    if (!isTrainingDateInCycle(cycle, dateKey)) return { ok: false, reason: "outside_training_days" };
    const entry = (cycle.dailyTrainingProgress && cycle.dailyTrainingProgress[dateKey]) || null;
    let ids;
    if (entry) ids = entry.requiredExerciseIds || [];
    else {
      const rec = recommendationService.getById(cycle.recommendationId);
      if (!rec || rec.kind !== "f01_goal" || rec.patientId !== userId) return { ok: false, reason: "recommendation_not_found" };
      ids = (rec.items || []).map((it) => it.exerciseId);
    }
    if (!exerciseId || !ids.includes(exerciseId)) return { ok: false, reason: "exercise_not_in_daily_plan" };
    return { ok: true, cycle, entry };
  },

  /**
   * The target of one exercise on `dateKey` as the user is shown it: the
   * frozen value on a frozen day, else the live plan amount (older /
   * not_frozen days, labelled by targetRef). Never writes.
   * @returns {{ targetRef, target, targetSummary } | { error }}
   */
  getF01FormalTargetSummary({ cycleId, userId, recommendationId, exerciseId, dateKey }) {
    const chk = trackingCycleService.checkF01FormalTrainingDay({ cycleId, userId, recommendationId, exerciseId, dateKey });
    if (!chk.ok) return { error: chk.reason };
    if (!chk.entry) return { error: "no_daily_snapshot" };
    const targetRef = resolveTargetRef(chk.entry, exerciseId);
    if (!targetRef) return { error: "target_missing" };
    let target;
    if (targetRef === TARGET_REF.FROZEN) target = chk.entry.targets[exerciseId];
    else {
      const rec = recommendationService.getById(chk.cycle.recommendationId);
      const item = ((rec && rec.items) || []).find((it) => it.exerciseId === exerciseId) || null;
      const built = buildDailyTarget({ exerciseId, item, catalog: exerciseService.getById(exerciseId), completionRulesVersion: chk.cycle.formalCompletionRulesVersion || null });
      if (built.error) return { error: "target_freeze_failed", reason: built.error };
      target = built.target;
    }
    return { targetRef, target, targetSummary: buildTargetSummary({ planDateKey: dateKey, targetRef, target }) };
  },

  /**
   * Spec 4.2 — preparation stage of a formal start: check the day, freeze
   * today's targets when the day has no snapshot yet ("formal_start", one
   * write), then return what the preparation page shows.
   * @returns {{ ok: true, planDateKey, targetRef, targetSummary } | { error }}
   */
  prepareF01FormalTraining({ cycleId, userId, recommendationId, exerciseId, dateKey }) {
    const chk = trackingCycleService.checkF01FormalTrainingDay({ cycleId, userId, recommendationId, exerciseId, dateKey });
    if (!chk.ok) return { error: chk.reason };
    if (!chk.entry) {
      const snap = trackingCycleService.ensureDailyTrainingSnapshot({ cycleId, userId, dateKey, mode: SNAPSHOT_MODE.FORMAL_START });
      if (snap.error) return { error: snap.error };
    }
    const summary = trackingCycleService.getF01FormalTargetSummary({ cycleId, userId, recommendationId, exerciseId, dateKey });
    if (summary.error) return { error: summary.error };
    // Batch 2 §3A — in a new-version cycle a formal training needs an executable frozen rule
    // (the exception guard; §3D normally prevents such a plan from taking effect).
    const blocked = trackingCycleService.formalRuleBlockReason({ cycleId, targetRef: summary.targetRef, target: summary.target });
    if (blocked) return { error: blocked };
    return { ok: true, planDateKey: dateKey, targetRef: summary.targetRef, targetSummary: summary.targetSummary };
  },

  /** Batch 2 — why a new-version cycle's frozen target cannot be trained formally, or null. Old-version cycles: always null. */
  formalRuleBlockReason({ cycleId, targetRef, target }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle || !cycle.formalCompletionRulesVersion) return null;
    if (targetRef !== TARGET_REF.FROZEN || !target || target.completionRulesVersion !== cycle.formalCompletionRulesVersion) return "completion_target_unknown";
    if (!target.completionRule || target.completionRule.kind === COMPLETION_RULE_KIND.PENDING) return "counting_basis_pending";
    return null;
  },

  /**
   * Batch 2 — the detector configuration of a FORMAL training in a new-version
   * cycle ({ targetReps } or { targetPerSide }), from the day's frozen target;
   * null otherwise (old-version cycles, unfrozen days, pending rules) so the
   * detectors keep their existing formulas. Never writes.
   */
  getF01FormalDetectorConfig({ cycleId, userId, dateKey, exerciseId }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle || !userId || cycle.userId !== userId || !cycle.formalCompletionRulesVersion) return null;
    const entry = cycle.dailyTrainingProgress && cycle.dailyTrainingProgress[dateKey];
    if (!entry || entry.completionRulesVersion !== cycle.formalCompletionRulesVersion) return null;
    const target = entry.targets && entry.targets[exerciseId];
    return target && target.formalDetectorConfig ? { ...target.formalDetectorConfig } : null;
  },

  /** The frozen target of one exercise on `dateKey`, or null (no frozen snapshot / not the owner). Never writes. */
  getFrozenDailyTarget({ cycleId, userId, dateKey, exerciseId }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle || !userId || cycle.userId !== userId) return null;
    const entry = cycle.dailyTrainingProgress && cycle.dailyTrainingProgress[dateKey];
    return resolveTargetRef(entry, exerciseId) === TARGET_REF.FROZEN ? entry.targets[exerciseId] : null;
  },

  /**
   * Spec 3.4 / 4.6 — adds one SAVED training record to its day's attempt
   * list. Checks the record's STORED fields (owner, f01_cycle source, cycle,
   * plan date, recommendation, required exercise); de-duplicated by record
   * id. A day without a snapshot is refused (no snapshot is created here).
   * Called AFTER recordExerciseCompletion. Never changes completion fields.
   * @returns {{ attempt, created: boolean } | { error }}
   */
  recordTrainingAttempt({ userId, analysisRecord }) {
    const r = analysisRecord;
    if (!r || !r.id) return { error: "missing_record" };
    if (!userId || r.patientId !== userId) return { error: "record_not_owned" };
    if (r.sourceSubtype !== "f01_cycle" || !r.trackingCycleId) return { error: "not_f01_cycle_record" };
    const cycle = trackingCyclesCollection.getById(r.trackingCycleId);
    if (!cycle) return { error: "cycle_not_found" };
    if (cycle.userId !== userId) return { error: "not_owner" };
    let dateKey = toLocalDateKey(r.completedAt || r.createdAt);
    if (isDateKey(r.planDateKey)) dateKey = r.planDateKey;
    if (!isTrainingDateInCycle(cycle, dateKey)) return { error: "outside_training_days" };
    const entry = cycle.dailyTrainingProgress && cycle.dailyTrainingProgress[dateKey];
    if (!entry) return { error: "no_daily_snapshot" };
    if (entry.dateKey && entry.dateKey !== dateKey) return { error: "date_mismatch" };
    if (!r.recommendationId || r.recommendationId !== entry.recommendationId) return { error: "recommendation_mismatch" };
    if (!(entry.requiredExerciseIds || []).includes(r.exerciseId)) return { error: "exercise_not_in_daily_plan" };
    const attempts = entry.attempts || {};
    if (attempts[r.id]) return { attempt: attempts[r.id], created: false };
    const now = nowIso();
    const attempt = buildTrainingAttempt(r, { targetRef: resolveTargetRef(entry, r.exerciseId), writtenAt: now });
    const updated = trackingCyclesCollection.update(cycle.id, {
      dailyTrainingProgress: { ...(cycle.dailyTrainingProgress || {}), [dateKey]: { ...entry, attempts: { ...attempts, [r.id]: attempt } } },
      updatedAt: now,
    });
    if (!updated) return { error: "attempt_write_failed" };
    return { attempt, created: true };
  },

  /**
   * Records one exercise as done for the day of its real completion time, from
   * an EXISTING training analysisRecord (no new training data model). Counts
   * only a record that reached its target (isTrainingRecordCompleted); a
   * partial / stopped-early record never counts. When every required exercise
   * of that day's snapshot is done, the day is added once to
   * completedTrainingDates (unique, ascending).
   * Idempotent: an exercise already done that day is a no-op.
   * @returns {{ entry, cycle, dayCompleted: boolean, alreadyRecorded: boolean } | { error: string }}
   */
  recordExerciseCompletion({ cycleId, userId, exerciseId, analysisRecord }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle) return { error: "cycle_not_found" };
    if (!userId || cycle.userId !== userId) return { error: "not_owner" };
    if (cycle.reassessmentId) return { error: "cycle_already_completed" };
    if (!analysisRecord || analysisRecord.patientId !== userId) return { error: "record_not_owned" };
    if (!exerciseId || analysisRecord.exerciseId !== exerciseId) return { error: "exercise_mismatch" };
    // F01 batch 2 §4 — the CYCLE's version decides the rule for the whole week.
    // Old-version cycles: unchanged (the detector flag / total reps vs target, checked first).
    const version = cycle.formalCompletionRulesVersion || null;
    if (!version && !isTrainingRecordCompleted(analysisRecord)) return { error: "training_not_completed" };
    // F01 batch 1 (spec 4.4) — the plan date confirmed at the formal start wins
    // (a training across midnight belongs to the day it started); records
    // without one keep the earlier rule: the record's real completion date.
    let dateKey = toLocalDateKey(analysisRecord.completedAt || analysisRecord.createdAt);
    if (isDateKey(analysisRecord.planDateKey)) dateKey = analysisRecord.planDateKey;
    if (!isTrainingDateInCycle(cycle, dateKey)) return { error: "outside_training_days" };

    // Check membership BEFORE any write: a refused completion must not create
    // (and thereby freeze) that day's snapshot.
    const existing = cycle.dailyTrainingProgress && cycle.dailyTrainingProgress[dateKey];
    const currentRec = existing ? null : recommendationService.getById(cycle.recommendationId);
    const wouldRequire = existing ? existing.requiredExerciseIds : ((currentRec && currentRec.items) || []).map((it) => it.exerciseId);
    if (!wouldRequire.includes(exerciseId)) return { error: "exercise_not_in_daily_recommendation" };
    // New-version cycles: judged ONLY against that day's frozen rule of the same version (single
    // record, no accumulation); never the old rule, and no snapshot is created here.
    let completionBasis = "legacy_detector_flag";
    if (version) {
      const target = existing && existing.completionRulesVersion === version && existing.targets ? existing.targets[exerciseId] : null;
      const rule = target && target.completionRule;
      if (!rule || rule.kind === COMPLETION_RULE_KIND.PENDING) return { error: "completion_target_unknown" };
      if (!isFormalTargetMet(analysisRecord, rule)) return { error: "training_not_completed" };
      completionBasis = rule.kind === COMPLETION_RULE_KIND.TOTAL ? "frozen_total" : "frozen_per_side";
    }
    const snap = trackingCycleService.ensureDailyTrainingSnapshot({ cycleId, userId, dateKey, mode: SNAPSHOT_MODE.COMPLETION_FALLBACK });
    if (snap.error) return { error: snap.error };
    const entry = snap.entry;
    if (!entry.requiredExerciseIds.includes(exerciseId)) return { error: "exercise_not_in_daily_recommendation" };
    if (entry.completedExerciseIds.includes(exerciseId)) {
      return { entry, cycle: snap.cycle, dayCompleted: entry.isComplete, alreadyRecorded: true };
    }

    const now = nowIso();
    const completedExerciseIds = entry.requiredExerciseIds.filter((id) => id === exerciseId || entry.completedExerciseIds.includes(id));
    const isComplete = entry.requiredExerciseIds.every((id) => completedExerciseIds.includes(id));
    const nextEntry = {
      ...entry,
      completedExerciseIds,
      exerciseCompletions: { ...entry.exerciseCompletions, [exerciseId]: { analysisRecordId: analysisRecord.id, completedAt: analysisRecord.completedAt || analysisRecord.createdAt, completionRuleVersion: version, completionBasis } },
      isComplete,
      completedAt: isComplete ? now : null,
    };
    const current = snap.cycle;
    const dates = new Set(current.completedTrainingDates || []);
    if (isComplete) dates.add(dateKey);
    const updated = trackingCyclesCollection.update(cycle.id, {
      dailyTrainingProgress: { ...(current.dailyTrainingProgress || {}), [dateKey]: nextEntry },
      completedTrainingDates: [...dates].sort(),
      updatedAt: now,
    });
    return { entry: nextEntry, cycle: updated, dayCompleted: isComplete, alreadyRecorded: false };
  },

  // ── Phase D4 — baseline vs reassessment comparison (read-only) ─────────

  /**
   * Loads the cycle + its two linked 5xSTS sessions and derives the
   * comparison. Reads only; nothing (no difference / percentage) is written
   * back. A cycle of another user is refused before any session is read.
   * @returns {{ cycle, comparison } | { error: string }}
   */
  getTrackingCycleComparison({ cycleId, userId }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle) return { error: "cycle_not_found" };
    if (!userId || cycle.userId !== userId) return { error: "not_owner" };
    const baselineAssessment = cycle.baselineAssessmentId ? functionalAssessmentService.getById(cycle.baselineAssessmentId) : null;
    const reassessment = cycle.reassessmentId ? functionalAssessmentService.getById(cycle.reassessmentId) : null;
    return { cycle, comparison: buildTrackingComparison({ cycle, baselineAssessment, reassessment }) };
  },

  // ── Phase D5 — next-cycle decision, confirmation and handoff ───────────
  // Rules: js/data/f01ProgressionDecision.js (D5-0 V1). The proposal is an F01
  // goal recommendation record (origin "d5_next_cycle"), one per source cycle.
  // Nothing here trusts ids from the URL: every record is re-read and checked
  // against the current user and the source cycle's own links.

  /** The next cycle created from a source cycle (previousCycleId link), oldest first, or null. */
  getNextTrackingCycle(userId, sourceCycleId) {
    if (!userId || !sourceCycleId) return null;
    return trackingCyclesCollection
      .query((c) => c.userId === userId && c.previousCycleId === sourceCycleId)
      .sort((a, b) => String(a.createdAt || "").localeCompare(String(b.createdAt || "")) || String(a.id).localeCompare(String(b.id)))[0] || null;
  },

  /**
   * A completed source cycle with its linked records, ownership / linkage
   * checked. A missing baseline or reassessment is NOT an error here — it makes
   * the comparison ineligible, i.e. Gate 1 (no_auto_decision). A record of
   * another user, or a recommendation that does not belong to the cycle, is.
   * @returns {{ cycle, recommendation, baseline, reassessment, comparison, previousLimitations, proposal, nextCycle } | { error }}
   */
  getD5SourceContext({ cycleId, userId }) {
    const cycle = cycleId ? trackingCyclesCollection.getById(cycleId) : null;
    if (!cycle) return { error: "cycle_not_found" };
    if (!userId || cycle.userId !== userId) return { error: "not_owner" };
    if (cycle.functionalDomain !== F01_TRACKING.functionalDomain || cycle.assessmentType !== F01_TRACKING.assessmentType) return { error: "wrong_cycle_type" };
    if (!cycle.reassessmentId) return { error: "cycle_not_completed" };
    const recommendation = recommendationService.getById(cycle.recommendationId);
    if (!recommendation || recommendation.kind !== "f01_goal" || recommendation.patientId !== userId) return { error: "recommendation_not_found" };
    if (recommendation.selectedGoalId !== cycle.selectedGoalId) return { error: "recommendation_goal_mismatch" };
    if (!Array.isArray(recommendation.items) || !recommendation.items.length) return { error: "recommendation_has_no_exercises" };
    const baseline = cycle.baselineAssessmentId ? functionalAssessmentService.getById(cycle.baselineAssessmentId) : null;
    const reassessment = functionalAssessmentService.getById(cycle.reassessmentId);
    if (baseline && baseline.patientId !== userId) return { error: "baseline_not_owned" };
    if (reassessment && reassessment.patientId !== userId) return { error: "reassessment_not_owned" };
    return {
      cycle,
      recommendation,
      baseline,
      reassessment,
      comparison: buildTrackingComparison({ cycle, baselineAssessment: baseline, reassessment }),
      previousLimitations: resolvePreviousLimitationsSnapshot({ cycle, recommendation }),
      proposal: recommendationService.getF01D5ProposalForCycle(userId, cycle.id),
      nextCycle: trackingCycleService.getNextTrackingCycle(userId, cycle.id),
    };
  },

  /**
   * D5 狀況確認 submit: evaluates the proposal and stores it — one record per
   * source cycle. A draft is re-evaluated IN PLACE (double click / refresh /
   * route back never creates a second one); an accepted proposal is frozen
   * and returned unchanged.
   * @returns {{ proposal, created: boolean, frozen?: boolean } | { error }}
   */
  evaluateD5Proposal({ cycleId, userId, input, catalog = [], excludeAutoRecommendationPending = false }) {
    const ctx = trackingCycleService.getD5SourceContext({ cycleId, userId });
    if (ctx.error) return { error: ctx.error };
    if (ctx.proposal && ctx.proposal.status === "accepted") return { proposal: ctx.proposal, created: false, frozen: true };
    const normalized = normalizeD5Input(input);
    if (normalized.error) return { error: normalized.error };
    // Batch 2 §3B — new-version automatic candidates never include F01-19 (only as a CANDIDATE:
    // a current F01-19 kept by maintain stays, and §3D then asks for its counting definition).
    if (excludeAutoRecommendationPending) catalog = filterAutoRecommendationCatalog(catalog);

    // G01 next-cycle correction: the two tests' own reported conditions (shared check, stored as a snapshot in d5)
    const comparisonConditions = checkFa5xComparisonConditions({ patientId: userId, baseline: ctx.baseline, reassessment: ctx.reassessment });
    const d5 = buildD5Proposal({ sourceCycle: ctx.cycle, sourceRecommendation: ctx.recommendation, comparison: ctx.comparison, input: normalized.input, catalog, comparisonConditions });
    const goal = F01_GOALS.find((g) => g.goalId === d5.selectedGoalId) || { label: d5.selectedGoalId };
    const fields = {
      selectedGoalId: d5.selectedGoalId,
      selectedGoalLabel: goal.label,
      limitationIds: [...d5.currentLimitations],
      items: buildD5ProposalItems({ selection: d5, sourceItems: ctx.recommendation.items, selectedGoalId: d5.selectedGoalId, catalog }),
      basis: [
        { key: "goal", label: "訓練目標", value: `${goal.label}（沿用上一週）` },
        { key: "d5", label: "下一階段建議", value: D5_DECISION_LABEL[d5.decision] },
        { key: "source", label: "依據", value: "上一週 7 日追蹤的前後評估與訓練完成紀錄" },
      ],
      recommendationRuleVersion: D5_RULE_VERSION,
      d5,
      // a new status check is a new proposal version: any earlier LLM draft (or one still in flight) no longer applies
      llmDraft: null,
    };
    if (ctx.proposal) {
      // An old-version G01 draft (docs/F01_G01_PROGRAM_SELECTION.md 一-1) is regenerated in place; its earlier content is kept.
      if (isOutdatedG01Proposal(ctx.proposal)) {
        const kept = JSON.parse(JSON.stringify({ d5: ctx.proposal.d5, items: ctx.proposal.items || [], basis: ctx.proposal.basis || [], recommendationRuleVersion: ctx.proposal.recommendationRuleVersion || null, updatedAt: ctx.proposal.updatedAt || null }));
        fields.supersededDrafts = [...(ctx.proposal.supersededDrafts || []), { ...kept, supersededAt: nowIso(), reason: "decision_version_outdated" }];
      }
      const updated = recommendationService.updateF01D5Proposal(ctx.proposal.id, fields);
      return updated ? { proposal: updated, created: false } : { error: "proposal_not_found" };
    }
    const created = recommendationService.createF01D5Proposal({ patientId: userId, fields });
    return created.error ? { error: created.error } : { proposal: created.recommendation, created: true };
  },

  /** Proposal + source context, with the proposal's links re-checked against the cycle. */
  loadD5Proposal({ proposalId, userId }) {
    const proposal = proposalId ? recommendationService.getById(proposalId) : null;
    if (!proposal || proposal.origin !== D5_PROPOSAL_ORIGIN || !proposal.d5) return { error: "proposal_not_found" };
    if (!userId || proposal.patientId !== userId) return { error: "not_owner" };
    const ctx = trackingCycleService.getD5SourceContext({ cycleId: proposal.d5.sourceCycleId, userId });
    if (ctx.error) return { error: ctx.error };
    const d5 = proposal.d5;
    const sourceIds = ctx.recommendation.items.map((it) => it.exerciseId);
    const linked = !!ctx.proposal && ctx.proposal.id === proposal.id
      && d5.sourceCycleId === ctx.cycle.id
      && d5.reassessmentId === ctx.cycle.reassessmentId
      && d5.sourceRecommendationId === ctx.cycle.recommendationId
      && proposal.selectedGoalId === ctx.cycle.selectedGoalId
      && d5.selectedGoalId === ctx.cycle.selectedGoalId
      && d5.currentExerciseIds.length === sourceIds.length
      && d5.currentExerciseIds.every((id, i) => id === sourceIds[i]);
    if (!linked) return { error: "proposal_linkage_invalid" };
    return { proposal, ctx };
  },

  /**
   * User acceptance of a proposal. Idempotent: an existing next cycle is
   * returned, never re-created; an already accepted proposal keeps its first
   * confirmation. `confirmationDateKey` must be the REAL local date (never the
   * ?trackingToday= override). Same local date as the reassessment -> Cycle
   * N+1 is created with the reassessment as its baseline; a later date ->
   * requiresFreshBaseline (no cycle until a new valid baseline exists).
   * @returns {{ proposal, cycle?, created: boolean, requiresFreshBaseline?: boolean, alreadyConfirmed?: boolean } | { error }}
   */
  confirmD5Proposal({ proposalId, userId, confirmationDateKey, completionRulesVersion = null }) {
    // Batch 2 §4 — the app passes the formal completion rules version: it is stamped on the
    // acceptance and the next cycle inherits it. Acceptances without it (before batch 2) stay old-version.
    if (!checkRulesVersion(completionRulesVersion)) return { error: "unknown_completion_rules_version" };
    const loaded = trackingCycleService.loadD5Proposal({ proposalId, userId });
    if (loaded.error) return { error: loaded.error };
    const { ctx } = loaded;
    let proposal = loaded.proposal;
    if (ctx.nextCycle) return { proposal, cycle: ctx.nextCycle, created: false, alreadyConfirmed: true };
    const alreadyConfirmed = proposal.status === "accepted";
    if (!alreadyConfirmed) {
      // The ACTUAL arrangement decides (js/data/d5Arrangement.js): a rule-ready plan, or one a linked
      // therapist confirmed for exactly this content. Pending review / conflicts / a stale review -> refused.
      const review = d5ReviewsCollection.getById(proposal.id);
      const arrangement = resolveD5Arrangement(proposal, { review, isReviewerLinked: (id) => !!id && !!relationService.findAcceptedRelation(id, userId), now: Date.now(), completionRulesVersion });
      if (!isPatientAcceptable(arrangement)) return { error: "not_confirmable", arrangementStatus: arrangement.status };
      const viaReview = arrangement.status === "reviewed";
      const handoff = deriveNextCycleHandoff({ sourceCycle: ctx.cycle, reassessment: ctx.reassessment, confirmationDateKey });
      if (!handoff.confirmationDateKey) return { error: "missing_confirmation_date" };
      // Manual continuation never certifies its old insufficient measurement.
      if (viaReview && arrangement.requiresFreshBaseline) {
        Object.assign(handoff, { baselineReuseAllowed: false, requiresFreshBaseline: true, baselineAssessmentId: null, baselineMeasuredAt: null, cycleStartDateKey: null, plannedReassessmentDateKey: null, freshBaselineReason: "manual_no_auto_arrangement" });
      }
      // A reviewed arrangement: the patient's own write adopts the therapist's items exactly
      // (firestore.rules compare them, and the basis, with d5TherapistReviews/{proposalId}).
      const acceptedItems = viaReview ? JSON.parse(JSON.stringify(arrangement.review.items)) : proposal.items;
      // Batch 2 §3D — a new-version plan is accepted only with an executable counting definition per item.
      if (completionRulesVersion) {
        const defs = checkCountingDefinitions({ items: acceptedItems, getCatalog: getCatalogRaw });
        if (!defs.ok) return { error: "counting_basis_undefined", undefinedItems: defs.undefinedItems };
      }
      proposal = recommendationService.updateF01D5Proposal(proposal.id, {
        status: "accepted",
        items: acceptedItems,
        d5: {
          ...proposal.d5,
          confirmation: {
            confirmedAt: nowIso(), confirmedBy: userId, confirmationMode: proposal.d5.confirmationMode, confirmationDateKey: handoff.confirmationDateKey, handoff,
            // which plan was accepted: the rule's own, or a therapist-reviewed one (and which review)
            // fingerprint of the plan as accepted (the stored proposal after this write)
            planFingerprint: planFingerprint({ ...proposal, items: acceptedItems }),
            therapistReviewId: viaReview ? arrangement.review.id : null,
            therapistReviewedAt: viaReview ? arrangement.review.reviewedAt : null,
            ...(viaReview && arrangement.requiresFreshBaseline ? { arrangementSource: "therapist_manual_no_auto" } : {}),
            ...(completionRulesVersion ? { completionRulesVersion } : {}),
          },
        },
      });
    }
    const handoff = proposal.d5.confirmation && proposal.d5.confirmation.handoff;
    if (handoff && handoff.baselineReuseAllowed) {
      const made = trackingCycleService.createNextTrackingCycle({ userId, proposalId: proposal.id, baselineSession: ctx.reassessment });
      // (the next cycle takes its version from the acceptance, see createNextTrackingCycle)
      if (made.error) return { error: made.error, proposal, cycle: made.cycle };
      return { proposal: recommendationService.getById(proposal.id), cycle: made.cycle, created: made.created, alreadyConfirmed };
    }
    return { proposal, created: false, requiresFreshBaseline: true, alreadyConfirmed };
  },

  /**
   * May a fresh next-cycle baseline assessment start for this proposal?
   * (accepted, needs a fresh baseline, no next cycle yet). Never writes.
   * @returns {{ ok: true, proposal, cycle } | { ok: false, reason, cycle? }}
   */
  checkNextCycleBaselineEligibility({ proposalId, userId }) {
    const loaded = trackingCycleService.loadD5Proposal({ proposalId, userId });
    if (loaded.error) return { ok: false, reason: loaded.error };
    const { proposal, ctx } = loaded;
    if (ctx.nextCycle) return { ok: false, reason: "next_cycle_exists", cycle: ctx.nextCycle };
    const handoff = proposal.status === "accepted" && proposal.d5.confirmation ? proposal.d5.confirmation.handoff : null;
    if (!handoff || !handoff.requiresFreshBaseline) return { ok: false, reason: "fresh_baseline_not_required" };
    return { ok: true, proposal, cycle: ctx.cycle };
  },

  /**
   * Creates Cycle N+1 for an accepted proposal — or returns it if it exists.
   * Baseline must be a completed 5xSTS of this user and EITHER the source
   * cycle's reassessment with same-day reuse allowed, OR a fresh assessment
   * taken in the next_cycle_baseline context of THIS proposal after its
   * confirmation. Day 1 = that baseline's measured local date.
   * @returns {{ cycle, created: boolean, reason?: string } | { error, cycle? }}
   */
  createNextTrackingCycle({ userId, proposalId, baselineSession }) {
    const loaded = trackingCycleService.loadD5Proposal({ proposalId, userId });
    if (loaded.error) return { error: loaded.error };
    const { proposal, ctx } = loaded;
    if (ctx.nextCycle) return { cycle: ctx.nextCycle, created: false, reason: "already_created" };
    const confirmation = proposal.d5.confirmation;
    if (proposal.status !== "accepted" || !confirmation) return { error: "proposal_not_confirmed" };
    if (confirmation.planFingerprint) {
      // Next week trains exactly the plan that was accepted — never content changed afterwards.
      if (confirmation.planFingerprint !== planFingerprint(proposal)) return { error: "accepted_plan_changed" };
    } else if (!proposal.d5.nextCycleReady || proposal.d5.confirmationMode !== CONFIRMATION_MODE.USER_ACCEPTANCE) {
      return { error: "not_confirmable" }; // acceptances recorded before the arrangement check
    }
    if (!baselineSession || baselineSession.patientId !== userId) return { error: "baseline_not_owned" };
    if (!isUsableNextCycleBaseline(baselineSession)) return { error: "baseline_not_completed" };
    if (proposal.d5.decision === "no_auto_decision" || proposal.d5.selectionRuleId === "NC-N01") {
      const r = baselineSession.result || {};
      if ((r.completedReps ?? r.repCount) !== 5 || (r.repCount ?? r.completedReps) !== 5 || !Number.isFinite(r.totalDurationMs) || r.totalDurationMs <= 0) return { error: "baseline_not_completed" };
    }
    if (!isCurrentFa5xMeasurement(baselineSession.result)) return { error: "baseline_measurement_outdated" };

    let baselineSource;
    if (baselineSession.id === ctx.cycle.reassessmentId) {
      if (proposal.d5.decision === "no_auto_decision" || proposal.d5.selectionRuleId === "NC-N01") return { error: "baseline_reuse_not_allowed" };
      if (!confirmation.handoff || !confirmation.handoff.baselineReuseAllowed) return { error: "baseline_reuse_not_allowed" };
      baselineSource = "reassessment_reuse";
    } else {
      const r = baselineSession.result;
      if (r.assessmentRole !== NEXT_CYCLE_BASELINE_ROLE || r.sourceCycleId !== ctx.cycle.id || r.d5ProposalId !== proposal.id) return { error: "missing_next_cycle_baseline_context" };
      if (!r.measuredAt || String(r.measuredAt) < String(confirmation.confirmedAt)) return { error: "baseline_before_confirmation" };
      baselineSource = "fresh_baseline";
    }
    const otherActive = trackingCycleService.getActiveTrackingCycle(userId);
    if (otherActive) return { error: "another_active_cycle", cycle: otherActive };

    // Batch 2 §4 — the next cycle's version is the one stamped when the proposal was ACCEPTED;
    // a proposal accepted before batch 2 starts an old-version cycle (its items cannot change).
    const version = confirmation.completionRulesVersion || null;
    if (!checkRulesVersion(version)) return { error: "unknown_completion_rules_version" };
    if (version) {
      const defs = checkCountingDefinitions({ items: proposal.items || [], getCatalog: getCatalogRaw });
      if (!defs.ok) return { error: "counting_basis_undefined", undefinedItems: defs.undefinedItems };
    }
    const fields = buildNextTrackingCycleFields({ sourceCycle: ctx.cycle, proposal, baselineSession, baselineSource });
    if (!fields.cycleStartDateKey) return { error: "baseline_date_missing" };
    const now = nowIso();
    const id = generateId("trackingCycle");
    const cycle = trackingCyclesCollection.create({
      ...(version ? { formalCompletionRulesVersion: version } : {}),
      id,
      cycleId: id,
      ...fields,
      trackingRuleVersion: TRACKING_RULE_VERSION,
      d5RuleVersion: D5_RULE_VERSION,
      createdAt: now,
      updatedAt: now,
    });
    recommendationService.updateF01D5Proposal(proposal.id, { d5: { ...proposal.d5, nextCycleId: cycle.id, nextCycleBaselineAssessmentId: baselineSession.id } });
    return { cycle, created: true };
  },

  // ── First recommendation, stage 2 (docs/F01_INITIAL_REVIEW_PLAN.md) ────
  // The ACCEPTED plan (therapist-confirmed items) and the baseline that starts its first week are
  // kept apart: the recommendation keeps its original sourceAssessmentId; the cycle records which
  // baseline started it (the original assessment on the same day, else a fresh one) in
  // initialPlanAcceptance. A fresh baseline only starts the week — it was never reviewed.

  /** The first week of an accepted first recommendation (or null). */
  getInitialPlanCycle(userId, recommendationId) {
    if (!userId || !recommendationId) return null;
    return trackingCyclesCollection.getById(initialPlanCycleId(recommendationId))
      || trackingCyclesCollection.query((c) => c.userId === userId && c.recommendationId === recommendationId)[0] || null;
  },

  /**
   * May a fresh initial-plan baseline be taken now? (accepted, no first week yet, and the original
   * assessment can no longer be Day 1 — accepted on a later date, or it is not a usable baseline.)
   * `todayDateKey` must be the REAL local date. Never writes.
   * @returns {{ ok: true, recommendation } | { ok: false, reason, cycle? }}
   */
  checkInitialPlanBaselineEligibility({ recommendationId, userId, todayDateKey }) {
    const rec = recommendationId ? recommendationService.getById(recommendationId) : null;
    if (!isFirstF01Recommendation(rec) || !userId || rec.patientId !== userId) return { ok: false, reason: "recommendation_not_found" };
    if (!isInitialPlanAccepted(rec)) return { ok: false, reason: "plan_not_accepted" };
    const existing = trackingCycleService.getInitialPlanCycle(userId, rec.id);
    if (existing) return { ok: false, reason: "first_week_exists", cycle: existing };
    const handoff = rec.initialConfirmation.handoff || {};
    if (handoff.baselineReuseAllowed && handoff.originalAssessmentDateKey === todayDateKey) return { ok: false, reason: "original_assessment_usable_today" };
    return { ok: true, recommendation: rec };
  },

  /**
   * Creates the first week of an accepted first recommendation — or returns it. Local write only;
   * the caller (f01InitialReviewService.startInitialPlanCycle) syncs it and rolls back on failure.
   * Baseline: the original assessment ONLY on its own measured local date (= `startDateKey`, the
   * real local date) with the acceptance allowing reuse; otherwise a completed current-version 5xSTS
   * taken in the initial_plan_baseline context of THIS plan after the acceptance.
   * Never replaces / re-links another running cycle.
   * @returns {{ cycle, created: boolean } | { error, cycle? }}
   */
  createInitialPlanCycle({ userId, recommendationId, baselineSession, startDateKey, completionRulesVersion = null }) {
    if (!checkRulesVersion(completionRulesVersion)) return { error: "unknown_completion_rules_version" };
    const rec = recommendationId ? recommendationService.getById(recommendationId) : null;
    if (!isFirstF01Recommendation(rec) || !userId || rec.patientId !== userId) return { error: "recommendation_not_found" };
    if (!isInitialPlanAccepted(rec)) return { error: "plan_not_accepted" };
    const existing = trackingCycleService.getInitialPlanCycle(userId, rec.id);
    if (existing) return { cycle: existing, created: false };
    const integrity = checkFirstRecommendationIntegrity(rec);
    if (!integrity.ok) return { error: "recommendation_integrity_missing", reason: integrity.reason };
    const confirmation = rec.initialConfirmation;
    // The accepted content is exactly what was accepted (no edit afterwards).
    if (confirmation.planFingerprint !== initialPlanFingerprint(rec) || confirmation.acceptedItemsKey !== planItemsKey(rec.items)) return { error: "accepted_plan_changed" };
    const otherActive = trackingCycleService.getActiveTrackingCycle(userId);
    if (otherActive) return { error: "another_active_cycle", cycle: otherActive };

    if (!baselineSession || baselineSession.patientId !== userId) return { error: "baseline_not_owned" };
    if (!isUsableNextCycleBaseline(baselineSession)) return { error: "baseline_not_completed" };
    const r = baselineSession.result || {};
    if ((r.completedReps ?? r.repCount) !== 5 || !Number.isFinite(r.totalDurationMs) || r.totalDurationMs <= 0) return { error: "baseline_not_completed" };
    if (!isCurrentFa5xMeasurement(r)) return { error: "baseline_measurement_outdated" };
    const baselineMeasuredAt = r.measuredAt || baselineSession.completedAt;
    const baselineDateKey = toLocalDateKey(baselineMeasuredAt);
    let baselineSource;
    if (baselineSession.id === rec.sourceAssessmentId) {
      const handoff = confirmation.handoff || {};
      if (!handoff.baselineReuseAllowed || !isDateKey(startDateKey) || baselineDateKey !== startDateKey) return { error: "baseline_reuse_not_allowed" };
      baselineSource = "original_assessment";
    } else {
      if (r.assessmentRole !== INITIAL_PLAN_BASELINE_ROLE || r.initialRecommendationId !== rec.id) return { error: "missing_initial_plan_baseline_context" };
      // compared as instants (an ISO string with an offset never sorts as text against a "Z" one)
      const measuredMs = Date.parse(r.measuredAt || "");
      const acceptedMs = Date.parse(confirmation.confirmedAt || "");
      if (!Number.isFinite(measuredMs) || !Number.isFinite(acceptedMs) || measuredMs < acceptedMs) return { error: "baseline_before_acceptance" };
      // Same product time policy as the original assessment: a week starts on its baseline's own date,
      // never later with training days already past (a later retry needs a new baseline).
      if (!isDateKey(startDateKey) || baselineDateKey !== startDateKey) return { error: "baseline_not_today" };
      baselineSource = "fresh_baseline";
    }
    const version = completionRulesVersion || confirmation.completionRulesVersion || null;
    if (version) {
      const defs = checkCountingDefinitions({ items: rec.items || [], getCatalog: getCatalogRaw });
      if (!defs.ok) return { error: "counting_basis_undefined", undefinedItems: defs.undefinedItems };
    }
    if (!baselineDateKey) return { error: "baseline_date_missing" };
    const now = nowIso();
    const id = initialPlanCycleId(rec.id);
    const cycle = trackingCyclesCollection.create({
      ...(version ? { formalCompletionRulesVersion: version } : {}),
      id,
      cycleId: id,
      userId,
      patientId: userId,
      functionalDomain: F01_TRACKING.functionalDomain,
      assessmentType: F01_TRACKING.assessmentType,
      baselineAssessmentId: baselineSession.id,
      baselineMeasuredAt,
      cycleStartDateKey: baselineDateKey,
      plannedReassessmentDateKey: getPlannedReassessmentDateKey(baselineDateKey),
      selectedGoalId: rec.selectedGoalId,
      recommendationId: rec.id,
      limitationsSnapshot: normalizeLimitationIds(rec.limitationIds),
      initialPlanAcceptance: {
        recommendationId: rec.id,
        therapistReviewId: confirmation.therapistReviewId,
        reviewVersionId: confirmation.reviewVersionId,
        planFingerprint: confirmation.planFingerprint,
        acceptedItemsKey: confirmation.acceptedItemsKey,
        confirmedAt: confirmation.confirmedAt,
        baselineSource,
        originalAssessmentId: rec.sourceAssessmentId,
      },
      cycleStatus: TRACKING_STATUS.TRAINING,
      completedTrainingDates: [],
      reassessmentId: null,
      trackingRuleVersion: TRACKING_RULE_VERSION,
      createdAt: now,
      updatedAt: now,
    });
    return { cycle, created: true };
  },
};
