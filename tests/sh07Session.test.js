import assert from "node:assert/strict";
import { createFlexionIsometricSession } from "../js/ai/exercises/shoulderFlexionIsometric/session.js";
import { calculateFlexionIsometricScore } from "../js/ai/exercises/shoulderFlexionIsometric/score.js";

const session=createFlexionIsometricSession({targetReps:1});let timestamp=0;
const good={bodyReady:true,preferredSide:"left",leftFlexionDeg:3,rightFlexionDeg:5,leftWristAngle:170,rightWristAngle:170,leftShrugRatio:.01,rightShrugRatio:.01,torsoLeanDeg:3,leftElbow:{x:.45,y:.5},rightElbow:{x:.55,y:.5},leftWrist:{x:.45,y:.68},rightWrist:{x:.55,y:.68},hipCenter:{x:.5,y:.65},bodyScale:.3};
const frame=(overrides={})=>session.processFrame({timestamp:timestamp+=100,...good,...overrides});
frame();for(let i=0;i<30;i+=1)frame();const before=session.getSummary().currentHoldMs;for(let i=0;i<5;i+=1)frame({leftWristAngle:100});assert.equal(session.getSummary().currentHoldMs,before,"手腕明顯彎曲時應暫停計時");for(let i=0;i<31;i+=1)frame();
const summary=session.getSummary();assert.equal(summary.totalReps,1);assert.equal(summary.completed,true);assert.equal(summary.activeSide,"left");const score=calculateFlexionIsometricScore(summary).score;assert.ok(score>=0&&score<=100);console.log("SH07 session tests passed");
