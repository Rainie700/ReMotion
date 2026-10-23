import assert from "node:assert/strict";
import { createMonsterWalkSession } from "../js/ai/exercises/monsterWalk/session.js";
import { calculateMonsterWalkScore } from "../js/ai/exercises/monsterWalk/score.js";

const session=createMonsterWalkSession({targetPerSide:1});let timestamp=0;
const send=(lx,ly,rx,ry)=>session.processFrame({timestamp:timestamp+=100,bodyReady:true,leftAnkle:{x:lx,y:ly},rightAnkle:{x:rx,y:ry},leftKneeAngle:160,rightKneeAngle:160,leftHipFlexionDeg:20,rightHipFlexionDeg:20,leftValgusRatio:.03,rightValgusRatio:.03,ankleWidth:Math.abs(rx-lx),shoulderWidth:.4,shoulderCenterY:.3,trunkSideLeanDeg:3});
send(.3,.9,.7,.9);send(.1,.85,.7,.9);for(let i=0;i<8;i+=1)send(.1,.85,.7,.9);let r=send(.1,.85,.5,.85);assert.equal(r.completedRep.leadSide,"left");let s=session.getSummary();assert.equal(s.completed,false);
send(.1,.85,.7,.8);for(let i=0;i<8;i+=1)send(.1,.85,.7,.8);r=send(.3,.8,.7,.8);assert.equal(r.completedRep.leadSide,"right");s=session.getSummary();assert.equal(s.leftReps,1);assert.equal(s.rightReps,1);assert.equal(s.completed,true);const score=calculateMonsterWalkScore(s).score;assert.ok(score>=0&&score<=100);console.log("HP09 session tests passed");
