import { calculateAngle } from "../../poseMath.js";
import { POSE_LANDMARK_INDEX } from "../../squatConstants.js";
import { CR05_THRESHOLDS } from "./constants.js";

function isReliable(point, minVisibility) {
  if (!point) return false;
  const score = point.visibility != null ? point.visibility : point.presence;
  return score == null || score >= minVisibility;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function sideHipAngle(landmarks, shoulderIndex, hipIndex, kneeIndex, minVisibility) {
  const shoulder = landmarks[shoulderIndex];
  const hip = landmarks[hipIndex];
  const knee = landmarks[kneeIndex];
  if (![shoulder, hip, knee].every((p) => isReliable(p, minVisibility))) return null;
  const angle = calculateAngle(shoulder, hip, knee);
  return Number.isFinite(angle) ? angle : null;
}

/** 軀幹中線相對畫面垂直線的 2D 傾角（左右方向不分正負）。 */
export function computeSeatedTrunkLeanDeg(landmarks, thresholds = CR05_THRESHOLDS) {
  if (!landmarks) return null;
  const ls = landmarks[POSE_LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = landmarks[POSE_LANDMARK_INDEX.RIGHT_SHOULDER];
  const lh = landmarks[POSE_LANDMARK_INDEX.LEFT_HIP];
  const rh = landmarks[POSE_LANDMARK_INDEX.RIGHT_HIP];
  if (![ls, rs, lh, rh].every((p) => isReliable(p, thresholds.MIN_VISIBILITY))) return null;
  const shoulderMid = midpoint(ls, rs);
  const hipMid = midpoint(lh, rh);
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;
  if (dx === 0 && dy === 0) return null;
  return Math.abs(Math.atan2(dx, -dy) * 180 / Math.PI);
}

export function computeSeatedKneeRaiseMetrics(landmarks, thresholds = CR05_THRESHOLDS) {
  if (!landmarks) return { leftHipAngle: null, rightHipAngle: null, trunkLeanDeg: null };
  return {
    leftHipAngle: sideHipAngle(
      landmarks,
      POSE_LANDMARK_INDEX.LEFT_SHOULDER,
      POSE_LANDMARK_INDEX.LEFT_HIP,
      POSE_LANDMARK_INDEX.LEFT_KNEE,
      thresholds.MIN_VISIBILITY,
    ),
    rightHipAngle: sideHipAngle(
      landmarks,
      POSE_LANDMARK_INDEX.RIGHT_SHOULDER,
      POSE_LANDMARK_INDEX.RIGHT_HIP,
      POSE_LANDMARK_INDEX.RIGHT_KNEE,
      thresholds.MIN_VISIBILITY,
    ),
    trunkLeanDeg: computeSeatedTrunkLeanDeg(landmarks, thresholds),
  };
}
