import { CR01_INDEX as P, CR01_THRESHOLDS as T } from "./constants.js";

function visible(point, min) { return !!point && (point.visibility == null || point.visibility >= min); }
function angle(a, b, c) {
  const u = { x: a.x - b.x, y: a.y - b.y };
  const v = { x: c.x - b.x, y: c.y - b.y };
  const d = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  if (!d) return null;
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / d))) * 180 / Math.PI;
}
function lineYAtX(a, b, x) {
  if (Math.abs(b.x - a.x) < 0.001) return (a.y + b.y) / 2;
  return a.y + ((x - a.x) / (b.x - a.x)) * (b.y - a.y);
}
function foldedHorizontalAngle(a, b) {
  let deg = Math.abs(Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI) % 180;
  return deg > 90 ? 180 - deg : deg;
}

export function computePlankMetrics(landmarks, thresholds = T) {
  if (!landmarks) return { bodyReady: false };
  const sides = [
    { name: "left", shoulder: P.LEFT_SHOULDER, elbow: P.LEFT_ELBOW, wrist: P.LEFT_WRIST, hip: P.LEFT_HIP, knee: P.LEFT_KNEE, ankle: P.LEFT_ANKLE },
    { name: "right", shoulder: P.RIGHT_SHOULDER, elbow: P.RIGHT_ELBOW, wrist: P.RIGHT_WRIST, hip: P.RIGHT_HIP, knee: P.RIGHT_KNEE, ankle: P.RIGHT_ANKLE },
  ].map((side) => ({ ...side, score: [side.shoulder, side.elbow, side.wrist, side.hip, side.knee, side.ankle].reduce((sum, i) => sum + (visible(landmarks[i], thresholds.MIN_VISIBILITY) ? 1 : 0), 0) }));
  const side = sides.sort((a, b) => b.score - a.score)[0];
  if (!side || side.score < 6) return { bodyReady: false, activeSide: side?.name || null };
  const shoulder = landmarks[side.shoulder], elbow = landmarks[side.elbow], wrist = landmarks[side.wrist];
  const hip = landmarks[side.hip], knee = landmarks[side.knee], ankle = landmarks[side.ankle];
  const bodyScale = Math.max(0.08, Math.hypot(shoulder.x - ankle.x, shoulder.y - ankle.y));
  const expectedHipY = lineYAtX(shoulder, ankle, hip.x);
  const hipLineOffsetRatio = (hip.y - expectedHipY) / bodyScale;
  return {
    bodyReady: true,
    activeSide: side.name,
    hipLineOffsetRatio,
    hipDeviationRatio: Math.abs(hipLineOffsetRatio),
    kneeAngleDeg: angle(hip, knee, ankle),
    elbowAngleDeg: angle(shoulder, elbow, wrist),
    bodyInclineDeg: foldedHorizontalAngle(shoulder, ankle),
    bodyScale,
  };
}
