import { POSE_LANDMARK_INDEX, REQUIRED_LANDMARK_INDICES, SQUAT_THRESHOLDS } from "./squatConstants.js";

/**
 * Angle at vertex B (in degrees, 0-180) formed by points A-B-C.
 * Pure function — no DOM/browser dependency, safe to unit test in Node.
 */
export function calculateAngle(pointA, pointB, pointC) {
  if (!pointA || !pointB || !pointC) return NaN;
  const abx = pointA.x - pointB.x;
  const aby = pointA.y - pointB.y;
  const cbx = pointC.x - pointB.x;
  const cby = pointC.y - pointB.y;
  const magAB = Math.hypot(abx, aby);
  const magCB = Math.hypot(cbx, cby);
  if (magAB === 0 || magCB === 0) return NaN;
  const dot = abx * cbx + aby * cby;
  const cos = Math.min(1, Math.max(-1, dot / (magAB * magCB)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function isReliable(point, minVisibility) {
  if (!point) return false;
  const score = point.visibility != null ? point.visibility : point.presence;
  // Landmarks without any visibility/presence field are treated as reliable
  // (some pose backends omit the field entirely rather than reporting 1).
  return score == null || score >= minVisibility;
}

/**
 * Computes left/right/average knee angle from a single frame's landmarks.
 * Skips a side entirely if any of its hip/knee/ankle points are below the
 * visibility threshold, and never returns NaN — if neither side is
 * reliable, `average` is null and `reliable` is false so callers can show
 * "無法辨識完整膝關節" instead of a garbage number.
 */
export function computeKneeAngles(landmarks, thresholds = SQUAT_THRESHOLDS) {
  if (!landmarks) return { left: null, right: null, average: null, reliable: false };
  const minVis = thresholds.MIN_VISIBILITY;

  const leftHip = landmarks[POSE_LANDMARK_INDEX.LEFT_HIP];
  const leftKnee = landmarks[POSE_LANDMARK_INDEX.LEFT_KNEE];
  const leftAnkle = landmarks[POSE_LANDMARK_INDEX.LEFT_ANKLE];
  const leftOk = isReliable(leftHip, minVis) && isReliable(leftKnee, minVis) && isReliable(leftAnkle, minVis);
  const leftAngle = leftOk ? calculateAngle(leftHip, leftKnee, leftAnkle) : NaN;
  const left = leftOk && !Number.isNaN(leftAngle) ? leftAngle : null;

  const rightHip = landmarks[POSE_LANDMARK_INDEX.RIGHT_HIP];
  const rightKnee = landmarks[POSE_LANDMARK_INDEX.RIGHT_KNEE];
  const rightAnkle = landmarks[POSE_LANDMARK_INDEX.RIGHT_ANKLE];
  const rightOk = isReliable(rightHip, minVis) && isReliable(rightKnee, minVis) && isReliable(rightAnkle, minVis);
  const rightAngle = rightOk ? calculateAngle(rightHip, rightKnee, rightAnkle) : NaN;
  const right = rightOk && !Number.isNaN(rightAngle) ? rightAngle : null;

  let average = null;
  if (left != null && right != null) average = (left + right) / 2;
  else if (left != null) average = left;
  else if (right != null) average = right;

  return { left, right, average, reliable: average != null };
}

/**
 * Trunk forward-lean angle (degrees from vertical) using the shoulder
 * midpoint -> hip midpoint line. Returns null if shoulders/hips aren't
 * reliably visible.
 */
export function computeTrunkLeanDeg(landmarks, thresholds = SQUAT_THRESHOLDS) {
  if (!landmarks) return null;
  const minVis = thresholds.MIN_VISIBILITY;
  const ls = landmarks[POSE_LANDMARK_INDEX.LEFT_SHOULDER];
  const rs = landmarks[POSE_LANDMARK_INDEX.RIGHT_SHOULDER];
  const lh = landmarks[POSE_LANDMARK_INDEX.LEFT_HIP];
  const rh = landmarks[POSE_LANDMARK_INDEX.RIGHT_HIP];
  if (![ls, rs, lh, rh].every((p) => isReliable(p, minVis))) return null;

  const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const hipMid = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const dx = shoulderMid.x - hipMid.x;
  const dy = shoulderMid.y - hipMid.y;
  if (dx === 0 && dy === 0) return null;
  // Image coordinates: y grows downward, so "straight up" is (0, -1).
  const angleFromVerticalRad = Math.atan2(Math.abs(dx), Math.abs(dy));
  return (angleFromVerticalRad * 180) / Math.PI;
}

/**
 * First-version, front-camera-only knee-valgus heuristic: compares the
 * knee-to-knee stance width against the ankle-to-ankle stance width. If the
 * knees have collapsed inward well past the ankles, flags "suspected"
 * (never a diagnosis — the caller is responsible for hedged wording).
 * Returns false (not true/unknown) when landmarks aren't reliable enough,
 * so it never causes a false alarm from bad tracking.
 */
export function computeKneeValgusSuspected(landmarks, thresholds = SQUAT_THRESHOLDS) {
  if (!landmarks) return false;
  const minVis = thresholds.MIN_VISIBILITY;
  const lk = landmarks[POSE_LANDMARK_INDEX.LEFT_KNEE];
  const rk = landmarks[POSE_LANDMARK_INDEX.RIGHT_KNEE];
  const la = landmarks[POSE_LANDMARK_INDEX.LEFT_ANKLE];
  const ra = landmarks[POSE_LANDMARK_INDEX.RIGHT_ANKLE];
  if (![lk, rk, la, ra].every((p) => isReliable(p, minVis))) return false;

  const kneeWidth = Math.abs(lk.x - rk.x);
  const ankleWidth = Math.abs(la.x - ra.x);
  if (ankleWidth <= 0) return false;
  return kneeWidth < ankleWidth * (1 - thresholds.KNEE_VALGUS_RATIO);
}

/**
 * True only when every required landmark is present and above the
 * visibility threshold — used to show "請後退並保持全身入鏡" instead of
 * guessing with partial data.
 *
 * Phase 5.5.2 — requiredLandmarks is now a parameter instead of an inline
 * array. Defaults to REQUIRED_LANDMARK_INDICES (squat's own
 * shoulders/hips/knees/ankles set) so every existing 1-arg call site keeps
 * its exact original behavior; a caller for a future exercise can pass its
 * own landmark list instead. The default value is unchanged, so this is
 * behavior-preserving for squat (see the Phase 5.5.2 report's squat
 * equivalence test).
 */
export function hasFullLowerBody(landmarks, thresholds = SQUAT_THRESHOLDS, requiredLandmarks = REQUIRED_LANDMARK_INDICES) {
  if (!landmarks || !landmarks.length) return false;
  if (!requiredLandmarks || !requiredLandmarks.length) return false;
  const minVis = thresholds.MIN_VISIBILITY;
  return requiredLandmarks.every((i) => isReliable(landmarks[i], minVis));
}

/**
 * ReMotion 2.0 Phase 5.1 — Camera + MediaPipe validation.
 *
 * Three-tier version of hasFullLowerBody()'s all-or-nothing check, for
 * camera *framing* guidance (not squat correctness). hasFullLowerBody()
 * itself is untouched and still the only thing that gates rep counting —
 * this is a presentation-layer classification built on the exact same
 * required-landmark list and visibility threshold, so the two can never
 * disagree about what "reliable" means (as long as callers pass the same
 * requiredLandmarks to both, which every current caller does).
 */
export const BODY_READINESS = {
  NOT_FOUND: "NOT_FOUND",
  PARTIAL: "PARTIAL",
  READY: "READY",
};

/**
 * NOT_FOUND — no landmarks at all, or none of the required joints are
 *   reliably visible (effectively nobody detected). Also returned for an
 *   empty/missing requiredLandmarks list — see Phase 5.5.2 report section
 *   19: an empty requirement is never treated as trivially satisfied.
 * PARTIAL — a person is detected but not every required joint is reliably
 *   visible yet.
 * READY — every required joint is reliably visible; safe to hand this
 *   frame to the exercise's own analysis.
 *
 * Phase 5.5.2 — requiredLandmarks is now a parameter (defaults to
 * REQUIRED_LANDMARK_INDICES, squat's existing set), same behavior-
 * preservation approach as hasFullLowerBody() above.
 */
export function getBodyReadiness(landmarks, thresholds = SQUAT_THRESHOLDS, requiredLandmarks = REQUIRED_LANDMARK_INDICES) {
  if (!landmarks || !landmarks.length) return BODY_READINESS.NOT_FOUND;
  if (!requiredLandmarks || !requiredLandmarks.length) return BODY_READINESS.NOT_FOUND;
  const minVis = thresholds.MIN_VISIBILITY;
  const visibleCount = requiredLandmarks.filter((i) => isReliable(landmarks[i], minVis)).length;
  if (visibleCount === requiredLandmarks.length) return BODY_READINESS.READY;
  if (visibleCount === 0) return BODY_READINESS.NOT_FOUND;
  return BODY_READINESS.PARTIAL;
}

/**
 * Lightweight camera-framing distance hint — never a medical judgment,
 * only "does the detected body's bounding box suggest the camera should
 * pull back or move closer." Returns null when there isn't enough
 * reliable data to guess safely (deliberately conservative — per Phase
 * 5.1 spec section 13, no guidance is better than an unreliable one; an
 * empty/missing requiredLandmarks list also returns null for the same
 * reason — see Phase 5.5.2 report section 19).
 *
 * Phase 5.5.2 — requiredLandmarks is now a parameter, same
 * behavior-preservation approach as the two functions above.
 */
export function getFramingDistanceHint(landmarks, thresholds = SQUAT_THRESHOLDS, requiredLandmarks = REQUIRED_LANDMARK_INDICES) {
  if (!landmarks || !landmarks.length) return null;
  if (!requiredLandmarks || !requiredLandmarks.length) return null;
  const minVis = thresholds.MIN_VISIBILITY;
  const reliablePoints = requiredLandmarks.map((i) => landmarks[i]).filter((p) => isReliable(p, minVis));
  if (reliablePoints.length < requiredLandmarks.length) return null;

  const xs = reliablePoints.map((p) => p.x);
  const ys = reliablePoints.map((p) => p.y);
  const bboxHeight = Math.max(...ys) - Math.min(...ys);
  // Normalized (0-1) landmark coordinates: a very tall bbox means the
  // body nearly fills (or exceeds) the frame vertically -> too close.
  // A very short bbox means the body occupies little of the frame ->
  // could move closer, but this is only ever a suggestion.
  if (bboxHeight > 0.95) return "TOO_CLOSE";
  if (bboxHeight < 0.35) return "TOO_FAR";
  return "OK";
}
