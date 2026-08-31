import assert from "node:assert/strict";
import { createSingleLegCalfRaiseSession } from "../js/ai/exercises/singleLegCalfRaise/session.js";
import { calculateSingleLegCalfRaiseScore } from "../js/ai/exercises/singleLegCalfRaise/score.js";

const session=createSingleLegCalfRaiseSession({targetReps:1});
const ready={bodyReady:true,leftHeelY:.8,rightHeelY:.7,leftAnkleX:.3,rightAnkleX:.7,leftKneeFlexionDeg:6,rightKneeFlexionDeg:8,leftLegScale:.3,rightLegScale:.3,pelvisTiltRatio:.02,pelvisCenterX:.5,pelvisScale:.6,trunkLeanDeg:2};
const raised={...ready,leftHeelY:.775};
session.processFrame({timestamp:0,...ready});session.processFrame({timestamp:200,...ready});session.processFrame({timestamp:400,...raised});session.processFrame({timestamp:700,...raised});session.processFrame({timestamp:1000,...raised});const result=session.processFrame({timestamp:1900,...ready});
const summary=session.getSummary();
assert.equal(summary.totalReps,1,"左腳支撐時腳跟抬起、停留並下降應計為一次");
assert.equal(summary.leftReps,1,"應辨識左腳為支撐腳");
assert.equal(summary.validReps,1,"腳跟抬升完整且骨盆、膝蓋與腳踝穩定應列為品質符合");
assert.equal(summary.completed,true,"達到目標次數後應完成");
assert.deepEqual(result.completedRep?.issues,[],"標準單腳提踵不應產生錯誤標記");
assert.ok(calculateSingleLegCalfRaiseScore(summary).score>=90,"標準動作品質分數應至少 90 分");
console.log("AK07 single-leg-calf-raise session tests passed");
