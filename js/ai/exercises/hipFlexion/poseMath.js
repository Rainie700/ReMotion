import { calculateAngle } from "../../poseMath.js";
import { POSE_LANDMARK_INDEX, SQUAT_THRESHOLDS } from "../../squatConstants.js";

/**
 * ReMotion Phase 5.6.1 — HP02 (站姿髖屈曲) prototype metric. Pure, DOM-free.
 * Reuses the existing generic three-point calculateAngle() (js/ai/poseMath.js)
 * — no new angle-geometry math is implemented here.
 *
 * Per Phase 5.6.0 report section 5: hip flexion angle, vertex at the HIP,
 * between the shoulder (trunk direction) and the knee (thigh direction).
 * This is a raw geometric angle, not a validated clinical range-of-motion
 * value — see constants.js for why no threshold constants exist yet.
 *
 * Unlike squat's computeKneeAngles() (which averages left+right because a
 * squat is bilateral and symmetric), this deliberately does NOT return an
 * "average" — HP02 is a unilateral, alternating-side exercise, so
 * averaging the still leg's angle with the moving leg's angle would not be
 * a meaningful number. Callers get both sides independently.
 */
function isPointReliable(point, minVisibility) {
  if (!point) return false;
  const score = point.visibility != null ? point.visibility : point.presence;
  // Same convention as poseMath.js's isReliable(): no visibility/presence
  // field at all is treated as reliable (some pose backends omit it).
  return score == null || score >= minVisibility;
}

/**
 * Returns { left, right } — each either a degree value (0-180) or null
 * when that side's shoulder/hip/knee aren't all reliably visible this
 * frame. Never returns NaN, never throws on missing/malformed landmarks.
 */
export function computeHipFlexionAngles(landmarks, thresholds = SQUAT_THRESHOLDS) {
  if (!landmarks) return { left: null, right: null };
  const minVis = thresholds.MIN_VISIBILITY;

  const leftShoulder = landmarks[POSE_LANDMARK_INDEX.LEFT_SHOULDER];
  const leftHip = landmarks[POSE_LANDMARK_INDEX.LEFT_HIP];
  const leftKnee = landmarks[POSE_LANDMARK_INDEX.LEFT_KNEE];
  const leftOk = isPointReliable(leftShoulder, minVis) && isPointReliable(leftHip, minVis) && isPointReliable(leftKnee, minVis);
  const leftAngle = leftOk ? calculateAngle(leftShoulder, leftHip, leftKnee) : NaN;
  const left = leftOk && !Number.isNaN(leftAngle) ? leftAngle : null;

  const rightShoulder = landmarks[POSE_LANDMARK_INDEX.RIGHT_SHOULDER];
  const rightHip = landmarks[POSE_LANDMARK_INDEX.RIGHT_HIP];
  const rightKnee = landmarks[POSE_LANDMARK_INDEX.RIGHT_KNEE];
  const rightOk = isPointReliable(rightShoulder, minVis) && isPointReliable(rightHip, minVis) && isPointReliable(rightKnee, minVis);
  const rightAngle = rightOk ? calculateAngle(rightShoulder, rightHip, rightKnee) : NaN;
  const right = rightOk && !Number.isNaN(rightAngle) ? rightAngle : null;

  return { left, right };
}
