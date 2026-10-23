import assert from "node:assert/strict";
import { createAdductionIsometricSession } from "../js/ai/exercises/shoulderAdductionIsometric/session.js";
import { calculateAdductionIsometricScore } from "../js/ai/exercises/shoulderAdductionIsometric/score.js";

const session=createAdductionIsometricSession({targetReps:1});let timestamp=0;
const good={bodyReady:true,leftAdductionPositionDeg:3,rightAdductionPositionDeg:5,leftShrugRatio:.01,rightShrugRatio:.01,trunkSideBendDeg:2,trunkForwardLeanRatio:.03,hipTiltDeg:1,leftElbow:{x:.4,y:.5},rightElbow:{x:.6,y:.5},leftWrist:{x:.4,y:.68},rightWrist:{x:.6,y:.68},bodyScale:.3};
const frame=(overrides={})=>session.processFrame({timestamp:timestamp+=100,...good,...overrides});
frame();for(let i=0;i<30;i+=1)frame();const before=session.getSummary().currentHoldMs;for(let i=0;i<5;i+=1)frame({trunkForwardLeanRatio:.3});assert.equal(session.getSummary().currentHoldMs,before,"身體前傾時應暫停計時");for(let i=0;i<31;i+=1)frame();
const summary=session.getSummary();assert.equal(summary.totalReps,1);assert.equal(summary.completed,true);assert.equal(summary.activeSide,"left");const score=calculateAdductionIsometricScore(summary).score;assert.ok(score>=0&&score<=100);console.log("SH05 session tests passed");
