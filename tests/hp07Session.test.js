import assert from "node:assert/strict";
import { createFireHydrantSession } from "../js/ai/exercises/fireHydrant/session.js";
import { calculateFireHydrantScore } from "../js/ai/exercises/fireHydrant/score.js";

const session=createFireHydrantSession({targetPerSide:1});let timestamp=0;
const send=(la,ra)=>session.processFrame({timestamp:timestamp+=100,bodyReady:true,leftAbductionDeg:la,rightAbductionDeg:ra,leftKneeAngle:90,rightKneeAngle:90,pelvisTiltDeg:2,shoulderTiltDeg:2,trunkShiftRatio:.03});
function complete(side){const f=active=>side==="left"?[active,0]:[0,active];send(0,0);send(...f(16));send(...f(28));for(let i=0;i<15;i+=1)send(...f(38));send(...f(18));send(...f(9));send(...f(6));return send(...f(3));}
complete("left");let s=session.getSummary();assert.equal(s.leftReps,1);assert.equal(s.completed,false,"兩側都達標前不可完成");complete("right");s=session.getSummary();assert.equal(s.rightReps,1);assert.equal(s.completed,true);assert.equal(s.insufficientHoldCount,0);assert.equal(s.kneeAngleCount,0);const score=calculateFireHydrantScore(s).score;assert.ok(score>=0&&score<=100);console.log("HP07 session tests passed");
