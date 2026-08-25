export const LE02_ISSUE_LABELS = {
  insufficient_raise: "抬腿高度不足",
  excessive_raise: "抬腿過高，留意腰部代償",
  knee_bend: "膝蓋彎曲，請保持腿伸直",
  body_roll: "骨盆或軀幹晃動",
  too_fast: "動作速度較快",
};

export function calculateStraightLegRaiseScore(s) {
  let score = 100;
  score -= (s.insufficientRaiseCount || 0) * 7;
  score -= (s.excessiveRaiseCount || 0) * 5;
  score -= (s.kneeBendCount || 0) * 8;
  score -= (s.bodyRollCount || 0) * 7;
  score -= (s.tooFastCount || 0) * 4;
  score -= Math.max(0, (s.targetReps || 0) - (s.totalReps || 0)) * 2;
  score = Math.max(0, Math.min(100, Math.round(score)));
  return { score, quality: score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Fair" : "Needs Practice" };
}

export function buildStraightLegRaiseRemark(s) {
  const tips = [];
  if (s.insufficientRaiseCount) tips.push("可將直腿穩定抬至約 45°");
  if (s.excessiveRaiseCount) tips.push("不必抬得過高，避免腰部拱起");
  if (s.kneeBendCount) tips.push("全程保持膝蓋伸直");
  if (s.bodyRollCount) tips.push("收緊核心並固定骨盆");
  if (s.tooFastCount) tips.push("放慢抬起與下降速度");
  return (tips.length ? tips.join("；") : "抬腿高度、膝蓋伸直與骨盆控制良好") + "。";
}
