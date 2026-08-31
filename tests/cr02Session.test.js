import assert from "node:assert/strict";
import { createCrunchSession } from "../js/ai/exercises/crunch/session.js";
import { calculateCrunchScore } from "../js/ai/exercises/crunch/score.js";
const session=createCrunchSession({targetReps:1});let t=0;
const frame=(incline,neck=170,hip={x:.5,y:.5})=>session.processFrame({timestamp:t+=100,bodyReady:true,trunkInclineDeg:incline,neckAlignmentDeg:neck,hipPoint:hip,bodyScale:.3});
for(let i=0;i<12;i++)frame(0);frame(8);for(const a of [10,13,16,20,20,18,14,10,6])frame(a);
let s=session.getSummary();assert.equal(s.totalReps,1);assert.equal(s.completed,true);assert.equal(s.validReps,1);assert.ok(calculateCrunchScore(s).score>=0&&calculateCrunchScore(s).score<=100);
const bad=createCrunchSession({targetReps:1});t=0;const bf=(a,n=170)=>bad.processFrame({timestamp:t+=100,bodyReady:true,trunkInclineDeg:a,neckAlignmentDeg:n,hipPoint:{x:.5,y:.5},bodyScale:.3});for(let i=0;i<12;i++)bf(0);bf(8);for(const a of [12,17,20,18,12,6])bf(a,120);s=bad.getSummary();assert.equal(s.neckCompensationCount,1);console.log("CR02 crunch session tests passed");
