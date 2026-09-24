import { SQUAT_THRESHOLDS } from "./squatConstants.js";

/**
 * ReMotion Phase 5.3 — pure, DOM-free squat quality evaluation, deliberately
 * separated from both rep-counting (squatSession.js) and UI. A rep can be
 * "completed" (a full standing->down->standing cycle was tracked) without
 * being "quality-valid" (it also needs to clear depth/trunk/valgus checks).
 * These are two different questions and must never be conflated:
 *
 *   completed rep  = did a genuine down-up cycle happen at all?
 *   quality-valid   = did it also clear the current prototype's movement
 *                     quality bar?
 *
 * Every issue code here is a PROTOTYPE ENGINEERING/HEURISTIC judgment, not a
 * medical diagnosis — see the Phase 5.3 report's Rule Classification table
 * for which category (evidence-backed / biomechanical heuristic /
 * engineering tolerance) each underlying threshold falls into. Nothing in
 * this module or its callers should ever be presented to a patient as a
 * clinical assessment.
 */
export const SQUAT_QUALITY_ISSUE = {
  INSUFFICIENT_DEPTH: "insufficient_depth",
  EXCESSIVE_TRUNK_LEAN: "excessive_trunk_lean",
  KNEE_VALGUS_SUSPECTED: "knee_valgus_suspected",
};

// Short, non-diagnostic, non-blaming Chinese labels — reused by both the
// real-time feedback engine and the session-result explanation text, so the
// same issue is always described the same way.
export const SQUAT_QUALITY_ISSUE_LABELS = {
  [SQUAT_QUALITY_ISSUE.INSUFFICIENT_DEPTH]: "深度不足",
  [SQUAT_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN]: "軀幹前傾較多",
  [SQUAT_QUALITY_ISSUE.KNEE_VALGUS_SUSPECTED]: "膝蓋方向提醒",
};

// Phase 5.4.3 — friendly, actionable, non-medical suggestion copy for the
// Result Page's Main Feedback card (report section 18/22). Deliberately
// phrased as "try this next time", never "failed"/"abnormal"/"error".
export const SQUAT_QUALITY_ISSUE_SUGGESTIONS = {
  [SQUAT_QUALITY_ISSUE.INSUFFICIENT_DEPTH]: "下次蹲下時，可以再增加一些幅度。",
  [SQUAT_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN]: "試著在蹲下時讓身體再保持直立一些。",
  [SQUAT_QUALITY_ISSUE.KNEE_VALGUS_SUSPECTED]: "蹲下時可以留意膝蓋方向，盡量與腳尖一致。",
};

export const TRACKING_RELIABILITY = {
  RELIABLE: "reliable",
  PARTIAL: "partial",
};

/**
 * repMetrics: { minKneeAngle, trunkLeanDetected, kneeValgusSuspected,
 * durationMs, hadTrackingGap }. All fields are the same raw measurements
 * squatSession.js already tracks per rep — this function only classifies
 * them, it never re-derives angles from landmarks.
 */
export function evaluateSquatQuality(repMetrics, thresholds = SQUAT_THRESHOLDS) {
  const { minKneeAngle, trunkLeanDetected, kneeValgusSuspected, hadTrackingGap } = repMetrics || {};
  const issues = [];

  // DOWN_KNEE_ANGLE is also the state machine's "bottom" trigger — a rep
  // that never reached bottom at all cannot be quality-valid on depth by
  // definition (see Phase 5.3 report section 6 for why this is the single
  // source of truth instead of a second, independently-guessed threshold).
  if (minKneeAngle == null || minKneeAngle > thresholds.DOWN_KNEE_ANGLE) {
    issues.push(SQUAT_QUALITY_ISSUE.INSUFFICIENT_DEPTH);
  }
  if (trunkLeanDetected) issues.push(SQUAT_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN);
  if (kneeValgusSuspected) issues.push(SQUAT_QUALITY_ISSUE.KNEE_VALGUS_SUSPECTED);

  return {
    valid: issues.length === 0,
    issues,
    metrics: { minKneeAngle: minKneeAngle ?? null },
    // A rep with a notable tracking gap during it is never treated as
    // evidence of BAD form — "the camera didn't see" is not the same claim
    // as "the movement was wrong". Callers should prefer wording like
    // "tracking was unreliable this rep" over blaming the issues list when
    // reliability is "partial".
    reliability: hadTrackingGap ? TRACKING_RELIABILITY.PARTIAL : TRACKING_RELIABILITY.RELIABLE,
  };
}
