import assert from "node:assert/strict";
import { createDoubleCalfRaiseSession } from "../js/ai/exercises/doubleCalfRaise/session.js";
import { calculateDoubleCalfRaiseScore } from "../js/ai/exercises/doubleCalfRaise/score.js";

const session=createDoubleCalfRaiseSession({targetReps:1});
const frame=(timestamp,heelY)=>session.processFrame({timestamp,heelY,heelAsymmetryRatio:.005,averageKneeAngle:175,trunkLeanDeg:2,bodyScale:1,bodyReady:true});
frame(0,.8);frame(200,.8);frame(400,.765);frame(700,.74);frame(1000,.74);frame(1400,.765);frame(1700,.79);frame(1800,.8);const result=frame(1900,.8);
const summary=session.getSummary();
assert.equal(summary.totalReps,1,"雙腳跟同步抬起、停留並下降應計為一次");
assert.equal(summary.validReps,1,"抬升完整、左右同步且姿勢穩定應列為品質符合");
assert.equal(summary.completed,true,"達到目標次數後應完成");
assert.deepEqual(result.completedRep?.issues,[],"標準雙腳提踵不應產生錯誤標記");
assert.ok(calculateDoubleCalfRaiseScore(summary).score>=90,"標準動作品質分數應至少 90 分");
console.log("AK05 double-calf-raise session tests passed");
