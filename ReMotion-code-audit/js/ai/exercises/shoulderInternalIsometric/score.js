import { calculateExternalIsometricScore } from "../shoulderExternalIsometric/score.js";
export const calculateInternalIsometricScore=calculateExternalIsometricScore;
export function buildInternalIsometricRemark(s){const a=[];if(s.elbowAngleCount)a.push("手肘維持約 90°");if(s.elbowAwayCount)a.push("手肘靠近身體");if(s.wristMovementCount)a.push("向內推時維持等長，避免前臂移動");if(s.torsoRotationCount)a.push("保持核心穩定，避免前傾或旋轉");if(s.shrugCount)a.push("放鬆肩膀避免聳肩");if(s.totalReps<s.targetReps)a.push("完成 "+s.totalReps+"/"+s.targetReps+" 次");return(a.length?a.join("；"):"手肘貼身、軀幹穩定，內旋等長維持完整")+"。";}
