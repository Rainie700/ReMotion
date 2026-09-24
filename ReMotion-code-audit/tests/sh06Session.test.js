import assert from "node:assert/strict";
import { createExtensionIsometricSession } from "../js/ai/exercises/shoulderExtensionIsometric/session.js";
import { calculateExtensionIsometricScore } from "../js/ai/exercises/shoulderExtensionIsometric/score.js";

const session=createExtensionIsometricSession({targetReps:1});let timestamp=0;
const good={bodyReady:true,preferredSide:"left",leftExtensionDeg:3,rightExtensionDeg:5,leftShrugRatio:.01,rightShrugRatio:.01,torsoLeanDeg:3,leftElbow:{x:.45,y:.5},rightElbow:{x:.55,y:.5},leftWrist:{x:.45,y:.68},rightWrist:{x:.55,y:.68},hipCenter:{x:.5,y:.65},bodyScale:.3};
const frame=(overrides={})=>session.processFrame({timestamp:timestamp+=100,...good,...overrides});
frame();for(let i=0;i<30;i+=1)frame();const before=session.getSummary().currentHoldMs;for(let i=0;i<5;i+=1)frame({torsoLeanDeg:20});assert.equal(session.getSummary().currentHoldMs,before,"身體後仰時應暫停計時");for(let i=0;i<31;i+=1)frame();
const summary=session.getSummary();assert.equal(summary.totalReps,1);assert.equal(summary.completed,true);assert.equal(summary.activeSide,"left");const score=calculateExtensionIsometricScore(summary).score;assert.ok(score>=0&&score<=100);console.log("SH06 session tests passed");
