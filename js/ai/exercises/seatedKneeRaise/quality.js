import { CR05_THRESHOLDS } from "./constants.js";

export const CR05_QUALITY_ISSUE = {
  INSUFFICIENT_RAISE: "insufficient_raise",
  EXCESSIVE_TRUNK_LEAN: "excessive_trunk_lean",
  RHYTHM: "rhythm",
  TOO_FAST: "too_fast",
};

export const CR05_QUALITY_ISSUE_LABELS = {
  [CR05_QUALITY_ISSUE.INSUFFICIENT_RAISE]: "抬膝幅度不足",
  [CR05_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN]: "軀幹後仰較多",
  [CR05_QUALITY_ISSUE.RHYTHM]: "左右交替節奏提醒",
  [CR05_QUALITY_ISSUE.TOO_FAST]: "動作速度較快",
};

export const CR05_QUALITY_SUGGESTIONS = {
  [CR05_QUALITY_ISSUE.INSUFFICIENT_RAISE]: "下一次可以在舒適範圍內再抬高一些。",
  [CR05_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN]: "抬膝時試著讓上半身保持直立。",
  [CR05_QUALITY_ISSUE.RHYTHM]: "試著左右腳輪流抬起，回到起始姿勢後再換邊。",
  [CR05_QUALITY_ISSUE.TOO_FAST]: "試著放慢抬起與放下的速度。",
};

export function evaluateSeatedKneeRaiseQuality(metrics, thresholds = CR05_THRESHOLDS) {
  const issues = [];
  if (metrics.minHipAngle == null || metrics.minHipAngle > thresholds.TARGET_TOP_HIP_ANGLE_MAX_DEG) {
    issues.push(CR05_QUALITY_ISSUE.INSUFFICIENT_RAISE);
  }
  if (metrics.maxTrunkLeanDeg != null && metrics.maxTrunkLeanDeg > thresholds.TRUNK_LEAN_MAX_DEG) {
    issues.push(CR05_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN);
  }
  if (metrics.rhythmIssue) issues.push(CR05_QUALITY_ISSUE.RHYTHM);
  if (metrics.durationMs != null && metrics.durationMs < thresholds.MIN_REP_DURATION_MS * 1.25) {
    issues.push(CR05_QUALITY_ISSUE.TOO_FAST);
  }
  return { valid: issues.length === 0, issues };
}
