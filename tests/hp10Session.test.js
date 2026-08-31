import assert from "node:assert/strict";
import { createSingleLegHipStabilitySession } from "../js/ai/exercises/singleLegHipStability/session.js";
import { calculateSingleLegHipStabilityScore } from "../js/ai/exercises/singleLegHipStability/score.js";

const session=createSingleLegHipStabilitySession({targetDurationMs:1000});
const base={bodyReady:true,leftKneeAngle:170,rightKneeAngle:170,centerX:.5,bodyScale:.3,pelvisTiltDeg:2,trunkLeanDeg:2,shrugRatio:0,headDropRatio:-.3};
for(let i=0;i<=10;i++)session.processFrame({timestamp:i*100,...base,leftFootLiftRatio:0,rightFootLiftRatio:.1});
let summary=session.getSummary();
assert.equal(summary.leftHeldMs,1000);
assert.equal(summary.rightHeldMs,0);
assert.equal(summary.completed,false);
for(let i=11;i<=21;i++)session.processFrame({timestamp:i*100,...base,leftFootLiftRatio:.1,rightFootLiftRatio:0});
summary=session.getSummary();
assert.equal(summary.rightHeldMs,1000);
assert.equal(summary.completed,true);
assert.equal(summary.totalReps,2);
const result=calculateSingleLegHipStabilityScore(summary);
assert.ok(result.score>=0&&result.score<=100);
console.log("HP10 session tests passed");
