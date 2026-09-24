export function calculateBalanceSeriesScore(s){
  const target=Math.max(1,s.targetReps||1),completion=Math.min(1,(s.totalReps||0)/target);
  let score=Math.round(55+45*completion-(s.stepCount||0)*8-(s.largeSwayCount||0)*5-(s.tiltCount||0)*4-(s.tooFastCount||0)*3-(s.trackingInterruptionCount||0)*2);
  score=Math.max(0,Math.min(100,score));
  return{score,quality:score>=90?"Excellent":score>=75?"Good":score>=60?"Fair":"Needs Practice"};
}
export function buildBalanceSeriesRemark(s){
  if(s.stepCount)return"練習時請靠近穩固支撐物，雙腳保持原位，若失去平衡請立即停止。";
  if(s.largeSwayCount)return"身體晃動較明顯，請縮小位移並放慢速度，先以安全穩定為主。";
  if(s.tiltCount)return"盡量保持肩膀與骨盆水平，避免用軀幹傾斜代償。";
  return"本次動作控制穩定；請繼續保持緩慢移動與完整回位。";
}
