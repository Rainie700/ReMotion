import assert from "node:assert/strict";
import { createStandingHipFlexionSession } from "../js/ai/exercises/standingHipFlexion/session.js";
import { calculateStandingHipFlexionScore } from "../js/ai/exercises/standingHipFlexion/score.js";

const session=createStandingHipFlexionSession({targetPerSide:1});let timestamp=0;
const send=(lh,rh,lk=175,rk=175)=>session.processFrame({timestamp:timestamp+=100,bodyReady:true,leftHipAngle:lh,rightHipAngle:rh,leftKneeAngle:lk,rightKneeAngle:rk,trunkLeanDeg:3,pelvisTiltDeg:2});
function complete(side){const f=(active,other=175,activeKnee=90)=>side==="left"?[active,other,activeKnee,175]:[other,active,175,activeKnee];send(175,175);send(...f(150));send(...f(115));for(let i=0;i<15;i+=1)send(...f(100));send(...f(135));send(...f(168));send(...f(170));return send(...f(175));}
complete("left");let s=session.getSummary();assert.equal(s.leftReps,1);assert.equal(s.completed,false,"兩側都達標前不可完成");complete("right");s=session.getSummary();assert.equal(s.rightReps,1);assert.equal(s.completed,true);assert.equal(s.insufficientHoldCount,0);const score=calculateStandingHipFlexionScore(s).score;assert.ok(score>=0&&score<=100);console.log("HP02 training session tests passed");
