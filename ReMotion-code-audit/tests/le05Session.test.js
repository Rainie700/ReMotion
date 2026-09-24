import assert from "node:assert/strict";
import { createSitToStandSession } from "../js/ai/exercises/sitToStand/session.js";
import { calculateSitToStandScore } from "../js/ai/exercises/sitToStand/score.js";
const s=createSitToStandSession({targetReps:1});let t=0;const f=(k,lean=12)=>s.processFrame({timestamp:t+=300,averageKneeAngle:k,trunkLeanDeg:lean,kneeAsymmetryDeg:3,kneeValgus:false,bodyReady:true});
f(105);f(128);f(140);f(152);f(158);f(165);f(165);f(145);f(130);f(112);f(108);const r=f(105);
assert.equal(r.repCompleted,true);assert.equal(r.summary.totalReps,1);assert.equal(r.summary.completed,true);assert.equal(r.summary.averageMaxKneeAngle,165);assert.deepEqual(calculateSitToStandScore(r.summary),{score:100,quality:"Excellent"});
const interrupted=createSitToStandSession({targetReps:1});interrupted.processFrame({timestamp:100,averageKneeAngle:130,trunkLeanDeg:5,kneeAsymmetryDeg:2,kneeValgus:false,bodyReady:true});interrupted.processFrame({timestamp:200,bodyReady:false});interrupted.processFrame({timestamp:300,bodyReady:false});assert.equal(interrupted.getSummary().trackingInterruptionCount,1);
console.log("LE05 session tests passed");
