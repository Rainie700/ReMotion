import assert from "node:assert/strict";
import { createHipStraightLegRaiseSession } from "../js/ai/exercises/hipStraightLegRaise/session.js";
import { calculateHipStraightLegRaiseScore } from "../js/ai/exercises/hipStraightLegRaise/score.js";

const session=createHipStraightLegRaiseSession({targetPerSide:1});let timestamp=0;
const send=(leftHipAngle,rightHipAngle)=>session.processFrame({timestamp:timestamp+=100,bodyReady:true,leftHipAngle,rightHipAngle,leftKneeAngle:178,rightKneeAngle:178,bodyRollDeg:2});
function complete(side){const hips=(active,other=175)=>side==="left"?[active,other]:[other,active];send(...hips(175));send(...hips(160));send(...hips(148));send(...hips(145));for(let i=0;i<25;i+=1)send(...hips(140));send(...hips(155));send(...hips(170));send(...hips(172));return send(...hips(175));}
complete("left");let summary=session.getSummary();assert.equal(summary.leftReps,1);assert.equal(summary.completed,false,"兩側都達標前不可提早完成");complete("right");summary=session.getSummary();assert.equal(summary.rightReps,1);assert.equal(summary.completed,true);assert.equal(summary.insufficientHoldCount,0);assert.ok(summary.averageTopHoldMs>=2000);const score=calculateHipStraightLegRaiseScore(summary).score;assert.ok(score>=0&&score<=100);console.log("HP01 session tests passed");
