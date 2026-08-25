import { CR05_SCORE_RULES } from "./constants.js";

export function calculateSeatedKneeRaiseScore(summary, rules = CR05_SCORE_RULES) {
  let score = rules.BASE_SCORE;
  score -= (summary.insufficientRaiseCount || 0) * rules.INSUFFICIENT_RAISE_PENALTY;
  score -= (summary.excessiveTrunkLeanCount || 0) * rules.EXCESSIVE_TRUNK_LEAN_PENALTY;
  score -= (summary.rhythmIssueCount || 0) * rules.RHYTHM_PENALTY;
  score -= (summary.tooFastCount || 0) * rules.TOO_FAST_PENALTY;
  score -= Math.max(0, (summary.targetReps || 0) - (summary.totalReps || 0)) * rules.MISSING_REP_PENALTY;
  score = Math.max(rules.MIN_SCORE, Math.min(rules.MAX_SCORE, Math.round(score)));
  const grade = rules.GRADE_THRESHOLDS.find((item) => score >= item.min) || rules.GRADE_THRESHOLDS.at(-1);
  return { score, quality: grade.label };
}

export function buildSeatedKneeRaiseRemark(summary) {
  if (!summary.totalReps) return "本次未偵測到完整的坐姿抬膝，請確認肩膀、髖部與膝蓋完整入鏡。";
  const notes = [];
  if (summary.insufficientRaiseCount) notes.push(`有 ${summary.insufficientRaiseCount} 次抬膝幅度可再增加`);
  if (summary.excessiveTrunkLeanCount) notes.push(`有 ${summary.excessiveTrunkLeanCount} 次上半身後仰較多`);
  if (summary.rhythmIssueCount) notes.push(`有 ${summary.rhythmIssueCount} 次左右交替節奏需要留意`);
  if (summary.tooFastCount) notes.push(`有 ${summary.tooFastCount} 次速度較快`);
  if (summary.totalReps < summary.targetReps) notes.push(`完成 ${summary.totalReps}/${summary.targetReps} 次`);
  return (notes.length ? notes.join("；") : "左右交替與軀幹穩定度表現良好") + "。";
}
