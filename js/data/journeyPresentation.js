import { trackingCycleService } from "./trackingCycleService.js";
import { functionalAssessmentService } from "./functionalAssessmentService.js";
import { recommendationService } from "./recommendationService.js";
import { getTrackingCycleViewState } from "./trackingCycle.js";
import { resolveF01Adventure, selectCurrentF01Chapter } from "./f01AdventureProgress.js";

/**
 * Core Value Experience — 復健旅程 presentation (read-only). One chapter per
 * week of the user's F01 cycle chain (previousCycleId), each resolved by the
 * UNCHANGED 8-stage rules (f01AdventureProgress.resolveF01Adventure) from the
 * same inputs the adventure service reads. Adds only presentation derivations
 * (week list, environment level, path states); nothing is stored, no game
 * state or currency exists.
 */

/** Same inputs as f01AdventureProgress's own loader (ownership-scoped reads). */
function loadCycleInputs(userId, cycle, todayKey) {
  const scoped = (session) => (session && session.patientId === userId ? session : null);
  const recommendation = cycle.recommendationId ? recommendationService.getById(cycle.recommendationId) : null;
  return {
    cycle,
    baseline: scoped(cycle.baselineAssessmentId ? functionalAssessmentService.getById(cycle.baselineAssessmentId) : null),
    recommendation: recommendation && recommendation.patientId === userId ? recommendation : null,
    reassessment: scoped(cycle.reassessmentId ? functionalAssessmentService.getById(cycle.reassessmentId) : null),
    proposal: recommendationService.getF01D5ProposalForCycle(userId, cycle.id),
    nextCycle: trackingCycleService.getNextTrackingCycle(userId, cycle.id),
    viewState: getTrackingCycleViewState(cycle, todayKey),
  };
}

/**
 * @returns {{ weeks: Array<{ weekNumber, cycleId, isCurrent, placeholder: false, adventure, comparison }>,
 *            nextPlaceholder: { weekNumber, placeholder: true } | null, currentWeekNumber: number | null }}
 */
export function buildJourneyChapters(userId, todayKey) {
  const empty = { weeks: [], nextPlaceholder: null, currentWeekNumber: null };
  if (!userId) return empty;
  const cycles = trackingCycleService.listTrackingCycles(userId);
  const { current, chapterNumber } = selectCurrentF01Chapter(cycles);
  if (!current) return empty;
  // The chain back from the current chapter (only when it is complete — the same rule as chapter numbers).
  const byId = new Map(cycles.map((c) => [c.id, c]));
  const chain = [current];
  if (chapterNumber) {
    let cursor = current;
    while (cursor.previousCycleId && byId.get(cursor.previousCycleId)) {
      cursor = byId.get(cursor.previousCycleId);
      chain.unshift(cursor);
    }
  }
  const weeks = chain.map((cycle, index) => {
    const weekNumber = chapterNumber ? index + 1 : null;
    const adventure = resolveF01Adventure({ ...loadCycleInputs(userId, cycle, todayKey), chapterNumber: weekNumber });
    const cmp = cycle.reassessmentId ? trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId }).comparison : null;
    return { weekNumber, cycleId: cycle.id, isCurrent: cycle.id === current.id, placeholder: false, adventure, comparison: cmp && cmp.eligible ? cmp : null };
  });
  const currentWeek = weeks[weeks.length - 1];
  // One locked placeholder for the week after the current one (never an endless list).
  const nextPlaceholder = chapterNumber ? { weekNumber: chapterNumber + 1, placeholder: true } : null;
  return { weeks, nextPlaceholder, currentWeekNumber: currentWeek.weekNumber };
}

/** Scene level from completed stages only: 0 simple · 1 plants (3–5) · 2 flags / sparkles (6–7) · 3 chapter complete (8). */
export function journeyEnvironmentLevel(completedCount, totalStages = 8) {
  if (totalStages > 0 && completedCount >= totalStages) return 3;
  if (completedCount >= 6) return 2;
  if (completedCount >= 3) return 1;
  return 0;
}

/**
 * Path segment states between consecutive visible stages: into a completed
 * stage "done" (solid), into the current / waiting stage "active"
 * (highlighted), otherwise "future" (dashed, muted — never a failure look).
 */
export function journeyPathStates(visibleStages = []) {
  return visibleStages.slice(1).map((stage) => (
    stage.state === "completed" ? "done" : stage.state === "current" || stage.state === "waiting" ? "active" : "future"
  ));
}

/**
 * The 4 stages the scene draws: the current stage sits in the 3rd slot so the
 * finished path leading to it (solid) and what comes next (dashed) are both
 * visible; a finished chapter shows its last 4 stages. Presentation only —
 * the stages themselves are the resolver's unchanged output.
 */
export function journeyStageWindow(stages = [], size = 4) {
  if (stages.length <= size) return stages.slice();
  const currentIdx = stages.findIndex((s) => s.state === "current" || s.state === "waiting");
  const anchor = currentIdx >= 0 ? currentIdx : stages.length - 1;
  const start = Math.max(0, Math.min(anchor - 2, stages.length - size));
  return stages.slice(start, start + size);
}
