/**
 * ReMotion Phase 5.4.2 — lightweight, target-agnostic milestone detection.
 * Pure and DOM-free: given how many reps are completed and the session's
 * target, returns at most one milestone id, or null. Never changes rep
 * counting/scoring — this is UX flavor only (Engineering/UX category, not a
 * clinical concept). Callers should call this once per newly-completed rep
 * (not every frame) so each milestone only ever fires once per crossing.
 */
export const SQUAT_MILESTONE = {
  COMPLETE: "complete",
  NEAR_COMPLETE: "near_complete",
  PERCENT_75: "percent_75",
  PERCENT_50: "percent_50",
  PERCENT_25: "percent_25",
};

// How many reps remaining counts as "near complete" (e.g. "剩最後 2 次").
const NEAR_COMPLETE_REMAINING = 2;

function fractionThreshold(targetReps, fraction) {
  const t = Math.round(targetReps * fraction);
  // A threshold that would land on 0 or on/after the target itself isn't a
  // distinct milestone (it either never fires or collides with "complete") —
  // this is what keeps small targets from milestone-spamming (report TEST D).
  if (t <= 0 || t >= targetReps) return null;
  return t;
}

/**
 * completedCount: reps completed so far (after the latest one). targetReps:
 * the session's target. Checked from most-specific/highest-value down, so
 * a single completedCount value can only ever match ONE milestone.
 */
export function getSquatMilestone(completedCount, targetReps) {
  if (!targetReps || targetReps <= 0 || !completedCount || completedCount <= 0) return null;
  if (completedCount >= targetReps) return SQUAT_MILESTONE.COMPLETE;
  if (targetReps - completedCount === NEAR_COMPLETE_REMAINING) return SQUAT_MILESTONE.NEAR_COMPLETE;
  if (completedCount === fractionThreshold(targetReps, 0.75)) return SQUAT_MILESTONE.PERCENT_75;
  if (completedCount === fractionThreshold(targetReps, 0.5)) return SQUAT_MILESTONE.PERCENT_50;
  if (completedCount === fractionThreshold(targetReps, 0.25)) return SQUAT_MILESTONE.PERCENT_25;
  return null;
}

/**
 * Phase 5.4.3 — pure "has this milestone already fired this session"
 * tracker (report section 5: "milestone 必須只觸發一次...不能因 rerender /
 * frame loop重複播放"). Without this, getSquatMilestone(count, target) would
 * keep returning COMPLETE for every rep done past the target (e.g. 31/30,
 * 32/30, ...), re-triggering the completion celebration every single time.
 */
export function createMilestoneTracker() {
  const fired = new Set();
  function shouldFire(milestoneId) {
    return !!milestoneId && !fired.has(milestoneId);
  }
  function markFired(milestoneId) {
    if (milestoneId) fired.add(milestoneId);
  }
  function reset() {
    fired.clear();
  }
  return { shouldFire, markFired, reset };
}
