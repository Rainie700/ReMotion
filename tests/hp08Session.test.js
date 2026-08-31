import assert from "node:assert/strict";
import { createLateralStepSession } from "../js/ai/exercises/lateralStep/session.js";
import { calculateLateralStepScore } from "../js/ai/exercises/lateralStep/score.js";

const session=createLateralStepSession({targetPerDirection:1});let timestamp=0;
const send=(lx,rx)=>session.processFrame({timestamp:timestamp+=100,bodyReady:true,leftAnkle:{x:lx,y:.9},rightAnkle:{x:rx,y:.9},ankleCenterX:(lx+rx)/2,ankleWidth:Math.abs(rx-lx),shoulderWidth:.4,leftKneeAngle:165,rightKneeAngle:165,leftValgusRatio:.03,rightValgusRatio:.03,trunkLeanDeg:3,pelvisTiltDeg:2,footLevelRatio:0});
send(.3,.7);send(.1,.7);for(let i=0;i<8;i+=1)send(.1,.7);let r=send(.1,.5);assert.equal(r.completedRep.direction,"left");let s=session.getSummary();assert.equal(s.completed,false);
send(.1,.7);for(let i=0;i<8;i+=1)send(.1,.7);r=send(.3,.7);assert.equal(r.completedRep.direction,"right");s=session.getSummary();assert.equal(s.leftReps,1);assert.equal(s.rightReps,1);assert.equal(s.completed,true);const score=calculateLateralStepScore(s).score;assert.ok(score>=0&&score<=100);console.log("HP08 session tests passed");
