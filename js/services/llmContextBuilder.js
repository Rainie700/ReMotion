/**
 * Grounded LLM Weekly Summary — Context Builder (Phase 1A, no LLM call, no UI).
 *
 * Builds a VerifiedContextV1 for ONE F01 tracking cycle by ASSEMBLING results
 * that ReMotion has already computed — nothing is recalculated here:
 *   week / period / baseline / reassessment / D4 change / completedDays
 *                        <- functionalProgressService.getTrackingTimeline (buildF01TrackingTimeline + D4 buildTrackingComparison)
 *   formalRecordCount / AI posture average
 *                        <- cycleTrainingPerformanceService.getByCycle (isF01CycleTrainingEvent: remotion / f01_cycle /
 *                           this cycle / completed; therapist, self, legacy and other cycles are excluded there)
 *   goal / current exercises <- the cycle's own recommendation + F01_GOALS + exercise catalog
 *   decision                <- the CONFIRMED D5 proposal of this cycle, layered as stored: ruleOutcome =
 *                              d5.matrixDecision, confirmationStatus = proposal.status ("accepted"),
 *                              confirmedAction = d5.decision, transitions = its selection; an unconfirmed
 *                              proposal never reaches the context (spec §4.2)
 *   reported issues         <- the D5 status check (discomfort, new limitations, confirmation mode)
 * Free text (discomfort notes, reasons, user-entered text) is never copied in.
 */
import { trackingCycleService } from "../data/trackingCycleService.js";
import { functionalProgressService } from "../data/functionalProgressService.js";
import { cycleTrainingPerformanceService } from "../data/cycleTrainingPerformance.js";
import { recommendationService } from "../data/recommendationService.js";
import { exerciseService } from "../data/exerciseService.js";
import { F01_GOALS } from "../data/f01RecommendationSpec.js";
import { toLocalDateKey } from "../data/trackingCycle.js";
import { secondsDisplay, differenceDisplay, buildContextFacts } from "./llmSummaryFacts.js";
import { LLM_SUMMARY_SCHEMA_VERSION, validateVerifiedContext } from "./llmSummarySchema.js";

export const CONTEXT_TYPE = "weekly_rehabilitation_summary";

const D5_VALUES = new Set(["progress", "maintain", "adjust", "no_auto_decision"]); // D5_DECISION, used as stored
// Stored D5 transition types -> the context's per-exercise transition vocabulary.
const TRANSITION_TYPE = { progression: "progress", regression: "regression", same_goal_replacement: "same_goal_replacement" };

/** Plain, single-line text only (names come from the catalog, but never trust markup / control characters). */
const clean = (text) => (typeof text === "string" ? text.replace(/[\u0000-\u001f\u007f<>{}]/g, "").trim() : "");

/**
 * Pure assembly of a VerifiedContextV1 from already-computed inputs.
 * @param {object} p
 *   cycle          stored tracking cycle
 *   week           this cycle's entry of buildF01TrackingTimeline().weeks (or null)
 *   performance    this cycle's entry of buildCycleTrainingPerformance() (or null)
 *   recommendation the cycle's own recommendation (cycle.recommendationId) or null
 *   proposal       the D5 proposal whose d5.sourceCycleId is this cycle, or null
 *   exerciseName   (exerciseId) => catalog name or null
 * @returns {object} VerifiedContextV1
 */
export function assembleVerifiedContext({ cycle, week = null, performance = null, recommendation = null, proposal = null, exerciseName = () => null }) {
  const nameOf = (id, fallback) => clean(exerciseName(id)) || clean(fallback) || id;

  let functionalAssessment = null;
  if (week) {
    const completed = week.status === "completed";
    const valid = completed || (week.status === "in_progress" && Number.isFinite(week.baselineMs));
    const baselineMs = valid ? week.baselineMs : null;
    const reassessmentMs = completed ? week.reassessmentMs : null;
    const differenceMs = completed ? week.changeMs : null;
    functionalAssessment = {
      assessmentType: "5xSTS",
      baselineMs,
      baselineDisplay: secondsDisplay(baselineMs),
      reassessmentMs,
      reassessmentDisplay: secondsDisplay(reassessmentMs),
      differenceMs,
      differenceDisplay: differenceDisplay(differenceMs),
      valid,
    };
  }

  const aiAverage = performance && Number.isFinite(performance.averageAiPostureScore) ? performance.averageAiPostureScore : null;
  const training = {
    completedDays: week ? week.completedDays : (cycle.completedTrainingDates || []).length,
    formalRecordCount: performance ? performance.completedTrainingCount : null,
    aiPostureAverage: aiAverage,
    aiPostureScoreAvailable: aiAverage !== null,
  };

  const goalDef = F01_GOALS.find((g) => g.goalId === cycle.selectedGoalId);
  const goal = goalDef ? { goalId: goalDef.goalId, label: goalDef.label } : null;

  const ownRecommendation = recommendation && recommendation.id === cycle.recommendationId ? recommendation : null;
  const currentExercises = ((ownRecommendation && ownRecommendation.items) || [])
    .filter((it) => it && /^F0[1-6]-\d{2}$/.test(it.exerciseId || ""))
    .map((it) => ({ exerciseId: it.exerciseId, name: nameOf(it.exerciseId, it.exerciseName) }));

  const d5 = proposal && proposal.d5 && proposal.d5.sourceCycleId === cycle.id ? proposal.d5 : null;
  let decision = null;
  // Only an ACCEPTED proposal (proposal.status) reaches the context; its stored layers are copied as-is.
  if (d5 && proposal.status === "accepted" && D5_VALUES.has(d5.matrixDecision) && D5_VALUES.has(d5.decision)) {
    const current = d5.currentExerciseIds || [];
    const proposed = new Set(d5.proposedExerciseIds || []);
    const rep = d5.replacedExercise || null;
    const transitions = [];
    for (const fromId of current) {
      if (proposed.has(fromId)) {
        transitions.push({ fromExerciseId: fromId, fromName: nameOf(fromId), toExerciseId: fromId, toName: nameOf(fromId), transitionType: "maintain" });
      } else if (rep && rep.fromExerciseId === fromId && rep.toExerciseId && TRANSITION_TYPE[rep.transitionType]) {
        transitions.push({ fromExerciseId: fromId, fromName: nameOf(fromId, rep.fromExerciseName), toExerciseId: rep.toExerciseId, toName: nameOf(rep.toExerciseId), transitionType: TRANSITION_TYPE[rep.transitionType] });
      } // no confirmed target for this exercise -> no transition (never guessed)
    }
    decision = { ruleOutcome: d5.matrixDecision, confirmationStatus: proposal.status, confirmedAction: d5.decision, transitions };
  }

  const reportedIssues = d5
    ? {
      newDiscomfort: d5.hasNewOrWorseningDiscomfort === true,
      newLimitation: Array.isArray(d5.newLimitations) ? d5.newLimitations.length > 0 : null,
      professionalReviewRequired: d5.confirmationMode === "professional_review_required",
    }
    : { newDiscomfort: null, newLimitation: null, professionalReviewRequired: null };

  return {
    schemaVersion: LLM_SUMMARY_SCHEMA_VERSION,
    contextType: CONTEXT_TYPE,
    cycleId: cycle.id,
    weekNumber: week ? week.weekNumber : null,
    period: { startDate: week ? week.startDateKey || null : cycle.cycleStartDateKey || null, endDate: week ? week.endDateKey || null : cycle.plannedReassessmentDateKey || null },
    functionalAssessment,
    training,
    goal,
    currentExercises,
    decision,
    reportedIssues,
  };
}

/**
 * Store adapter: reads the user's canonical records through the existing
 * services and assembles the context of one F01 cycle.
 * @returns {{ context, facts: Map, schemaErrors: [] } | { error: string }}
 */
export function buildVerifiedWeeklyContext({ userId, cycleId, todayKey = toLocalDateKey(new Date()) }) {
  if (!userId || !cycleId) return { error: "missing_user_or_cycle" };
  const cycle = trackingCycleService.getTrackingCycleById(cycleId);
  if (!cycle) return { error: "cycle_not_found" };
  if (cycle.userId !== userId) return { error: "not_owner" };
  if (cycle.functionalDomain !== "F01") return { error: "not_f01_cycle" };
  const timeline = functionalProgressService.getTrackingTimeline(userId, todayKey);
  const week = timeline.weeks.find((w) => w.cycleId === cycle.id) || null;
  const performance = cycleTrainingPerformanceService.getByCycle(userId).get(cycle.id) || null;
  const recommendation = cycle.recommendationId ? recommendationService.getById(cycle.recommendationId) : null;
  const proposal = recommendationService.getF01D5ProposalForCycle(userId, cycle.id);
  const ownProposal = proposal && proposal.patientId === userId ? proposal : null;
  const context = assembleVerifiedContext({
    cycle,
    week,
    performance,
    recommendation: recommendation && recommendation.patientId === userId ? recommendation : null,
    proposal: ownProposal,
    exerciseName: (id) => (exerciseService.getNormalizedById(id) || {}).name || null,
  });
  return { context, facts: buildContextFacts(context), schemaErrors: validateVerifiedContext(context) };
}
