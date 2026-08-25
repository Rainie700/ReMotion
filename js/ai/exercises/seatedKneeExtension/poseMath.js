import { calculateAngle } from "../../poseMath.js";
import { POSE_LANDMARK_INDEX } from "../../squatConstants.js";
import { KN03_THRESHOLDS } from "./constants.js";

function reliable(point, minVisibility) {
  if (!point) return false;
  const score = point.visibility != null ? point.visibility : point.presence;
  return score == null || score >= minVisibility;
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function jointAngle(landmarks, aIndex, vertexIndex, cIndex, minVisibility) {
  const points = [landmarks[aIndex], landmarks[vertexIndex], landmarks[cIndex]];
  if (!points.every((p) => reliable(p, minVisibility))) return null;
  const angle = calculateAngle(...points);
  return Number.isFinite(angle) ? angle : null;
}

export function computeKn03TrunkLeanDeg(landmarks, thresholds = KN03_THRESHOLDS) {
  if (!landmarks) return null;
  const points = [
    landmarks[POSE_LANDMARK_INDEX.LEFT_SHOULDER], landmarks[POSE_LANDMARK_INDEX.RIGHT_SHOULDER],
    landmarks[POSE_LANDMARK_INDEX.LEFT_HIP], landmarks[POSE_LANDMARK_INDEX.RIGHT_HIP],
  ];
  if (!points.every((p) => reliable(p, thresholds.MIN_VISIBILITY))) return null;
  const shoulderMid = midpoint(points[0], points[1]);
  const hipMid = midpoint(points[2], points[3]);
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;
  return dx === 0 && dy === 0 ? null : Math.abs(Math.atan2(dx, -dy) * 180 / Math.PI);
}

export function computeSeatedKneeExtensionMetrics(landmarks, thresholds = KN03_THRESHOLDS) {
  if (!landmarks) return { leftKneeAngle: null, rightKneeAngle: null, leftHipAngle: null, rightHipAngle: null, trunkLeanDeg: null };
  const v = thresholds.MIN_VISIBILITY;
  return {
    leftKneeAngle: jointAngle(landmarks, POSE_LANDMARK_INDEX.LEFT_HIP, POSE_LANDMARK_INDEX.LEFT_KNEE, POSE_LANDMARK_INDEX.LEFT_ANKLE, v),
    rightKneeAngle: jointAngle(landmarks, POSE_LANDMARK_INDEX.RIGHT_HIP, POSE_LANDMARK_INDEX.RIGHT_KNEE, POSE_LANDMARK_INDEX.RIGHT_ANKLE, v),
    leftHipAngle: jointAngle(landmarks, POSE_LANDMARK_INDEX.LEFT_SHOULDER, POSE_LANDMARK_INDEX.LEFT_HIP, POSE_LANDMARK_INDEX.LEFT_KNEE, v),
    rightHipAngle: jointAngle(landmarks, POSE_LANDMARK_INDEX.RIGHT_SHOULDER, POSE_LANDMARK_INDEX.RIGHT_HIP, POSE_LANDMARK_INDEX.RIGHT_KNEE, v),
    trunkLeanDeg: computeKn03TrunkLeanDeg(landmarks, thresholds),
  };
}
