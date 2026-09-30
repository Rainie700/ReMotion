import { trainingEventService } from "./trainingEventService.js";
import { trackingCycleService } from "./trackingCycleService.js";

/**
 * Core Value Experience — per tracking cycle 訓練表現 (read-only, derived).
 * Counts ONLY canonical Training Events that belong to that week's F01 plan:
 *   sourceType "remotion" + sourceSubtype "f01_cycle" + trackingCycleId === cycle.id
 *   + completed === true + not legacy.
 * Self practice, therapist plans, other ReMotion plans and legacy / incomplete
 * records never count. A completed event without an AI 姿勢分數 counts as a
 * training but is not in the average's denominator; a week with no scored
 * event has averageAiPostureScore null (shown as 「—」, never 0).
 * AI 姿勢分數 is a secondary training metric: the 5xSTS time stays the outcome.
 */
export function isF01CycleTrainingEvent(event, cycleId) {
  return !!event
    && event.completed === true
    && !event.isLegacy
    && event.sourceType === "remotion"
    && event.sourceSubtype === "f01_cycle"
    && !!cycleId
    && event.trackingCycleId === cycleId;
}

/** @returns {Array<{ cycleId, completedTrainingCount, trainingDays, averageAiPostureScore, scoredEventCount }>} in the given cycle order */
export function buildCycleTrainingPerformance({ cycles = [], events = [] } = {}) {
  return cycles.map((cycle) => {
    const own = events.filter((e) => isF01CycleTrainingEvent(e, cycle.id));
    const scored = own.filter((e) => typeof e.poseScore === "number" && Number.isFinite(e.poseScore));
    return {
      cycleId: cycle.id,
      completedTrainingCount: own.length,
      trainingDays: new Set(own.map((e) => e.localDateKey).filter(Boolean)).size,
      averageAiPostureScore: scored.length ? Math.round(scored.reduce((sum, e) => sum + e.poseScore, 0) / scored.length) : null,
      scoredEventCount: scored.length,
    };
  });
}

/**
 * Neutral difference between two weeks' averages (never 改善 / 進步 / 退步).
 * @returns {{ diff: number, text: string, signed: string } | null}
 */
export function compareCycleScores(previous, current) {
  if (previous == null || current == null) return null;
  const diff = current - previous;
  const text = diff > 0 ? `較前一週高 ${diff}` : diff < 0 ? `較前一週低 ${Math.abs(diff)}` : "與前一週相同";
  return { diff, text, signed: diff > 0 ? `+${diff}` : String(diff) };
}

export const cycleTrainingPerformanceService = {
  /** Map cycleId -> performance for every F01 cycle of the user. */
  getByCycle(userId) {
    if (!userId) return new Map();
    const cycles = trackingCycleService.listTrackingCycles(userId);
    const events = trainingEventService.listTrainingEvents(userId);
    return new Map(buildCycleTrainingPerformance({ cycles, events }).map((p) => [p.cycleId, p]));
  },
};
