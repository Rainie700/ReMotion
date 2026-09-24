import assert from "node:assert/strict";
import { createDoubleToeRaiseSession } from "../js/ai/exercises/doubleToeRaise/session.js";
import { calculateDoubleToeRaiseScore } from "../js/ai/exercises/doubleToeRaise/score.js";

const session=createDoubleToeRaiseSession({targetReps:1});
const ready={bodyReady:true,leftToeLiftRatio:0,rightToeLiftRatio:0,leftDorsiflexionDeg:0,rightDorsiflexionDeg:0,leftHeelY:.8,rightHeelY:.8,leftKneeFlexionDeg:3,rightKneeFlexionDeg:3,leftLegScale:.3,rightLegScale:.3,pelvisCenterX:.5,pelvisScale:.6,trunkLeanDeg:2};
const lifted={...ready,leftToeLiftRatio:.12,rightToeLiftRatio:.12,leftDorsiflexionDeg:15,rightDorsiflexionDeg:15};
session.processFrame({timestamp:0,...ready});session.processFrame({timestamp:200,...ready});session.processFrame({timestamp:400,...lifted});session.processFrame({timestamp:600,...lifted});session.processFrame({timestamp:800,...lifted});const result=session.processFrame({timestamp:1300,...ready});
const summary=session.getSummary();
assert.equal(summary.totalReps,1,"雙側腳尖同步抬起、停留並放下應計為一次");
assert.equal(summary.validReps,1,"雙腳同步且腳跟、膝蓋及身體穩定應列為品質符合");
assert.equal(summary.completed,true,"達到目標次數後應完成");
assert.deepEqual(result.completedRep?.issues,[],"標準雙腳抬腳不應產生錯誤標記");
assert.ok(calculateDoubleToeRaiseScore(summary).score>=90,"標準動作品質分數應至少 90 分");
console.log("AK06 double-toe-raise session tests passed");
