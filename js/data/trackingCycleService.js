import { createCollection } from "./storageService.js";
import { generateId, nowIso } from "../utils/id.js";
import { FUNCTIONAL_ASSESSMENT_TYPES, resolveAssessmentType, functionalAssessmentService } from "./functionalAssessmentService.js";
import { buildTrackingComparison } from "./trackingComparison.js";
import {
  TRACKING_RULE_VERSION,
  TRACKING_STATUS,
  toLocalDateKey,
  getPlannedReassessmentDateKey,
  isCompletedFiveTimesSitToStandResult,
  getTrackingCycleViewState,
  isTrainingRecordCompleted,
  isTrainingDateInCycle,
} from "./trackingCycle.js";
import { recommendationService, D5_PROPOSAL_ORIGIN } from "./recommendationService.js";
import { F01_GOALS } from "./f01RecommendationSpec.js";
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
   *     as a new baseline — reassessment linking is Phase D2).
   * cycleStartDateKey = LOCAL date of the baseline measurement, not of the
   * recommendation.
   *
   * @returns {{ cycle, created: boolean, reason?: string } | { error: string }}
   */
  createOrGetTrackingCycle({ userId, baselineSession, recommendation }) {
    if (!userId) return { error: "missing_user" };
    if (!baselineSession || baselineSession.patientId !== userId) return { error: "missing_baseline" };
    if (resolveAssessmentType(baselineSession) !== FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND) return { error: "not_5xsts" };
    if (baselineSession.status !== "completed" || !isCompletedFiveTimesSitToStandResult(baselineSession.result)) return { error: "baseline_not_completed" };
    // Phase D2 — a reassessment result can never start (be the baseline of) a cycle.
    if (baselineSession.result && baselineSession.result.assessmentRole === REASSESSMENT_ROLE) return { error: "reassessment_cannot_be_baseline" };
    // Phase D5 — a next-cycle baseline belongs to its D5 proposal, never to a Phase C recommendation.
    if (baselineSession.result && baselineSession.result.assessmentRole === NEXT_CYCLE_BASELINE_ROLE) return { error: "next_cycle_baseline_not_phase_c" };
    if (!recommendation || recommendation.kind !== "f01_goal" || !recommendation.id) return { error: "missing_recommendation" };
    if (recommendation.patientId !== userId || recommendation.sourceAssessmentId !== baselineSession.id) return { error: "recommendation_not_for_baseline" };

    const sameBaseline = trackingCyclesCollection
      .query((c) => c.userId === userId && c.functionalDomain === F01_TRACKING.functionalDomain && c.baselineAssessmentId === baselineSession.id)
      .sort(byNewest)[0];
    if (sameBaseline) {
      if (!isActive(sameBaseline)) return { cycle: sameBaseline, created: false, reason: "baseline_cycle_completed" };
      const updated = trackingCycleService.updateTrackingCycleRecommendation(sameBaseline.id, {
        selectedGoalId: recommendation.selectedGoalId,
        recommendationId: recommendation.id,
        limitationsSnapshot: recommendation.limitationIds,
      });
      return { cycle: updated, created: false, reason: "same_baseline" };
    }

    const otherActive = trackingCycleService.getActiveTrackingCycle(userId);
    if (otherActive) return { cycle: otherActive, created: false, reason: "another_active_cycle" };

    const baselineMeasuredAt = (baselineSession.result && baselineSession.result.measuredAt) || baselineSession.completedAt;
    const cycleStartDateKey = toLocalDateKey(baselineMeasuredAt);
    if (!cycleStartDateKey) return { error: "baseline_date_missing" };
    const now = nowIso();
    const id = generateId("trackingCycle");
    const cycle = trackingCyclesCollection.create({
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
   * @returns {{ entry, cycle, created: boolean } | { error: string }}
   */
  ensureDailyTrainingSnapshot({ cycleId, userId, dateKey }) {
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
    };
    const updated = trackingCyclesCollection.update(cycle.id, {
      dailyTrainingProgress: { ...(cycle.dailyTrainingProgress || {}), [dateKey]: entry },
      updatedAt: now,
    });
    return { entry, cycle: updated, created: true };
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
    if (!isTrainingRecordCompleted(analysisRecord)) return { error: "training_not_completed" };
    const dateKey = toLocalDateKey(analysisRecord.completedAt || analysisRecord.createdAt);
    if (!isTrainingDateInCycle(cycle, dateKey)) return { error: "outside_training_days" };

    // Check membership BEFORE any write: a refused completion must not create
    // (and thereby freeze) that day's snapshot.
    const existing = cycle.dailyTrainingProgress && cycle.dailyTrainingProgress[dateKey];
    const currentRec = existing ? null : recommendationService.getById(cycle.recommendationId);
    const wouldRequire = existing ? existing.requiredExerciseIds : ((currentRec && currentRec.items) || []).map((it) => it.exerciseId);
    if (!wouldRequire.includes(exerciseId)) return { error: "exercise_not_in_daily_recommendation" };
    const snap = trackingCycleService.ensureDailyTrainingSnapshot({ cycleId, userId, dateKey });
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
      exerciseCompletions: { ...entry.exerciseCompletions, [exerciseId]: { analysisRecordId: analysisRecord.id, completedAt: analysisRecord.completedAt || analysisRecord.createdAt } },
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
  evaluateD5Proposal({ cycleId, userId, input, catalog = [] }) {
    const ctx = trackingCycleService.getD5SourceContext({ cycleId, userId });
    if (ctx.error) return { error: ctx.error };
    if (ctx.proposal && ctx.proposal.status === "accepted") return { proposal: ctx.proposal, created: false, frozen: true };
    const normalized = normalizeD5Input(input);
    if (normalized.error) return { error: normalized.error };

    const d5 = buildD5Proposal({ sourceCycle: ctx.cycle, sourceRecommendation: ctx.recommendation, comparison: ctx.comparison, input: normalized.input, catalog });
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
    };
    if (ctx.proposal) {
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
  confirmD5Proposal({ proposalId, userId, confirmationDateKey }) {
    const loaded = trackingCycleService.loadD5Proposal({ proposalId, userId });
    if (loaded.error) return { error: loaded.error };
    const { ctx } = loaded;
    let proposal = loaded.proposal;
    if (ctx.nextCycle) return { proposal, cycle: ctx.nextCycle, created: false, alreadyConfirmed: true };
    const alreadyConfirmed = proposal.status === "accepted";
    if (!alreadyConfirmed) {
      if (!proposal.d5.nextCycleReady || proposal.d5.confirmationMode !== CONFIRMATION_MODE.USER_ACCEPTANCE) return { error: "not_confirmable" };
      const handoff = deriveNextCycleHandoff({ sourceCycle: ctx.cycle, reassessment: ctx.reassessment, confirmationDateKey });
      if (!handoff.confirmationDateKey) return { error: "missing_confirmation_date" };
      proposal = recommendationService.updateF01D5Proposal(proposal.id, {
        status: "accepted",
        d5: {
          ...proposal.d5,
          confirmation: { confirmedAt: nowIso(), confirmedBy: userId, confirmationMode: proposal.d5.confirmationMode, confirmationDateKey: handoff.confirmationDateKey, handoff },
        },
      });
    }
    const handoff = proposal.d5.confirmation && proposal.d5.confirmation.handoff;
    if (handoff && handoff.baselineReuseAllowed) {
      const made = trackingCycleService.createNextTrackingCycle({ userId, proposalId: proposal.id, baselineSession: ctx.reassessment });
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
    if (!proposal.d5.nextCycleReady || proposal.d5.confirmationMode !== CONFIRMATION_MODE.USER_ACCEPTANCE) return { error: "not_confirmable" };
    if (!baselineSession || baselineSession.patientId !== userId) return { error: "baseline_not_owned" };
    if (!isUsableNextCycleBaseline(baselineSession)) return { error: "baseline_not_completed" };

    let baselineSource;
    if (baselineSession.id === ctx.cycle.reassessmentId) {
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

    const fields = buildNextTrackingCycleFields({ sourceCycle: ctx.cycle, proposal, baselineSession, baselineSource });
    if (!fields.cycleStartDateKey) return { error: "baseline_date_missing" };
    const now = nowIso();
    const id = generateId("trackingCycle");
    const cycle = trackingCyclesCollection.create({
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
};
