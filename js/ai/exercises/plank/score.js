export const CR01_ISSUE_LABELS = { hip_high: "臀部過高", hip_low: "臀部下沉", knee_bend: "膝蓋彎曲", elbow_position: "手肘支撐位置不穩", incline: "軀幹未保持水平" };
export function calculatePlankScore(summary) {
  const frames = Math.max(1, summary.totalFrames || 0);
  const issueRatio = ((summary.hipHighFrames || 0) + (summary.hipLowFrames || 0) + (summary.kneeBendFrames || 0) + (summary.elbowFrames || 0) + (summary.inclineFrames || 0)) / (frames * 5);
  const completion = Math.min(1, (summary.heldSeconds || 0) / Math.max(1, summary.targetSeconds || 20));
  const score = Math.max(0, Math.min(100, Math.round(55 + completion * 35 - issueRatio * 45 - Math.min(10, (summary.trackingInterruptionCount || 0) * 2))));
  return { score, quality: score >= 90 ? "Excellent" : score >= 75 ? "Good" : score >= 60 ? "Fair" : "Needs Practice" };
}
export function buildPlankRemark(summary) {
  const suggestions = [];
  if (summary.hipHighFrames) suggestions.push("臀部稍微降低，讓肩、髖與腳踝保持一直線");
  if (summary.hipLowFrames) suggestions.push("收緊核心，避免臀部和腰部下沉");
  if (summary.kneeBendFrames) suggestions.push("保持膝蓋伸直");
  if (summary.elbowFrames) suggestions.push("讓手肘位於肩膀下方並穩定支撐");
  if (summary.inclineFrames) suggestions.push("調整身體位置，使軀幹接近水平");
  if (!summary.completed) suggestions.push(`本次正確維持 ${Math.floor(summary.heldSeconds || 0)}/${summary.targetSeconds || 20} 秒`);
  return (suggestions.length ? suggestions.join("；") : "身體排列穩定，完整維持目標時間") + "。";
}
