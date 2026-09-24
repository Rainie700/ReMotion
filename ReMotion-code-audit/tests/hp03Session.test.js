import assert from "node:assert/strict";
import { createStandingHipExtensionSession } from "../js/ai/exercises/standingHipExtension/session.js";
import { calculateStandingHipExtensionScore } from "../js/ai/exercises/standingHipExtension/score.js";

const session=createStandingHipExtensionSession({targetPerSide:1});let timestamp=0;
const send=(le,re,lb=true,rb=true)=>session.processFrame({timestamp:timestamp+=100,bodyReady:true,leftExtensionDeg:le,rightExtensionDeg:re,leftIsBackward:lb,rightIsBackward:rb,leftKneeAngle:178,rightKneeAngle:178,trunkLeanDeg:3,pelvisOffsetRatio:0});
function complete(side){const f=active=>side==="left"?[active,0]:[0,active];send(0,0);send(...f(9));send(...f(15));for(let i=0;i<15;i+=1)send(...f(18));send(...f(8));send(...f(5));send(...f(3));return send(...f(0));}
complete("left");let s=session.getSummary();assert.equal(s.leftReps,1);assert.equal(s.completed,false,"兩側都達標前不可完成");complete("right");s=session.getSummary();assert.equal(s.rightReps,1);assert.equal(s.completed,true);assert.equal(s.insufficientHoldCount,0);assert.equal(s.directionCount,0);const score=calculateStandingHipExtensionScore(s).score;assert.ok(score>=0&&score<=100);console.log("HP03 session tests passed");
