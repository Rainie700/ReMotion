import { KN03_THRESHOLDS } from "./constants.js";

export const KN03_QUALITY_ISSUE = {
  INSUFFICIENT_EXTENSION: "insufficient_extension",
  EXCESSIVE_TRUNK_LEAN: "excessive_trunk_lean",
  THIGH_LIFT: "thigh_lift",
  RHYTHM: "rhythm",
  TOO_FAST: "too_fast",
};

export const KN03_QUALITY_ISSUE_LABELS = {
  [KN03_QUALITY_ISSUE.INSUFFICIENT_EXTENSION]: "膝蓋伸直不足",
  [KN03_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN]: "軀幹後仰較多",
  [KN03_QUALITY_ISSUE.THIGH_LIFT]: "大腿位置不穩",
  [KN03_QUALITY_ISSUE.RHYTHM]: "左右交替節奏提醒",
  [KN03_QUALITY_ISSUE.TOO_FAST]: "動作速度較快",
};

export const KN03_QUALITY_SUGGESTIONS = {
  [KN03_QUALITY_ISSUE.INSUFFICIENT_EXTENSION]: "下一次可在舒適範圍內將膝蓋再伸直一些。",
  [KN03_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN]: "伸膝時讓上半身保持直立並貼穩椅背。",
  [KN03_QUALITY_ISSUE.THIGH_LIFT]: "保持大腿穩定，主要移動小腿。",
  [KN03_QUALITY_ISSUE.RHYTHM]: "一腳回到起始位置後再換另一腳。",
  [KN03_QUALITY_ISSUE.TOO_FAST]: "放慢伸直與放下的速度，避免甩動。",
};

export function evaluateSeatedKneeExtensionQuality(metrics, thresholds = KN03_THRESHOLDS) {
  const issues = [];
  if (metrics.maxKneeAngle == null || metrics.maxKneeAngle < thresholds.TARGET_EXTENSION_KNEE_ANGLE_MIN_DEG) issues.push(KN03_QUALITY_ISSUE.INSUFFICIENT_EXTENSION);
  if (metrics.maxTrunkLeanDeg > thresholds.TRUNK_LEAN_MAX_DEG) issues.push(KN03_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN);
  if (metrics.maxHipAngleDeviationDeg > thresholds.THIGH_LIFT_MAX_DEG) issues.push(KN03_QUALITY_ISSUE.THIGH_LIFT);
  if (metrics.rhythmIssue) issues.push(KN03_QUALITY_ISSUE.RHYTHM);
  if (metrics.durationMs < thresholds.TOO_FAST_DURATION_MS) issues.push(KN03_QUALITY_ISSUE.TOO_FAST);
  return { valid: issues.length === 0, issues };
}
