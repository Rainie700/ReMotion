import assert from "node:assert/strict";
import { createSingleLegToeRaiseSession } from "../js/ai/exercises/singleLegToeRaise/session.js";
import { calculateSingleLegToeRaiseScore } from "../js/ai/exercises/singleLegToeRaise/score.js";
const session=createSingleLegToeRaiseSession({targetReps:1});
const ready={bodyReady:true,leftHeelY:.8,rightHeelY:.7,leftToeLiftRatio:0,rightToeLiftRatio:0,leftDorsiflexionDeg:0,rightDorsiflexionDeg:0,leftKneeFlexionDeg:6,rightKneeFlexionDeg:8,leftFootTurnRatio:.05,rightFootTurnRatio:.05,leftLegScale:.3,rightLegScale:.3,pelvisTiltRatio:.02,trunkLeanDeg:2};
const lifted={...ready,leftToeLiftRatio:.12,leftDorsiflexionDeg:15};
session.processFrame({timestamp:0,...ready});session.processFrame({timestamp:200,...ready});session.processFrame({timestamp:400,...lifted});session.processFrame({timestamp:700,...lifted});session.processFrame({timestamp:1000,...lifted});const result=session.processFrame({timestamp:1900,...ready});
const summary=session.getSummary();assert.equal(summary.totalReps,1,"左腳支撐時腳尖抬起、停留並放下應計為一次");assert.equal(summary.leftReps,1,"應辨識左腳為支撐腳");assert.equal(summary.validReps,1,"腳跟、骨盆、膝蓋與身體穩定應列為品質符合");assert.equal(summary.completed,true);assert.deepEqual(result.completedRep?.issues,[]);assert.ok(calculateSingleLegToeRaiseScore(summary).score>=90);console.log("AK08 single-leg-toe-raise session tests passed");
