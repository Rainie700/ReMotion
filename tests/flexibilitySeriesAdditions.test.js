import assert from "node:assert/strict";
import fs from "node:fs";
import {rehabExercises} from "../js/data/rehabExercises.js";
import {resolvePoseAnalyzer,POSE_ANALYZER} from "../js/data/exerciseService.js";
import {FLEX_PROFILES} from "../js/ai/exercises/flexibilitySeries/constants.js";
import {createFlexibilitySession} from "../js/ai/exercises/flexibilitySeries/session.js";
import {calculateFlexibilityScore} from "../js/ai/exercises/flexibilitySeries/score.js";

const ids=["F06-02","F06-03","F06-09","F06-10","F06-11","F06-12"];
for(const id of ids){const ex=rehabExercises.find(x=>x.exercise_id===id);assert.ok(ex,`${id} missing`);assert.equal(ex.category,"柔軟度／活動能力");assert.equal(resolvePoseAnalyzer(ex),POSE_ANALYZER.FLEXIBILITY_SERIES);assert.ok(FLEX_PROFILES[id]);}
const base={bodyReady:true,bodyScale:.3,leftElbowAngle:170,rightElbowAngle:170,leftKneeAngle:170,rightKneeAngle:170,leftWristOppShoulder:1,rightWristOppShoulder:1,leftElbowHeight:0,rightElbowHeight:0,trunkLateralDeg:1,trunkSide:"left",trunkForwardDeg:2,shoulderWidth:1,noseOffset:0,pelvisTiltDeg:2,stanceRatio:1,leftHeelLift:.02,rightHeelLift:.02};

const hold=createFlexibilitySession({...FLEX_PROFILES["F06-02"],targetSeconds:1,targetReps:1});hold.processFrame({timestamp:0,...base});let hr;for(let t=100;t<=1200;t+=100)hr=hold.processFrame({timestamp:t,...base,leftWristOppShoulder:.3,rightWristOppShoulder:.3});assert.equal(hr.summary.completed,true);assert.equal(hr.summary.totalReps,1);assert.ok(calculateFlexibilityScore(hr.summary).score>=90);

const lateral=createFlexibilitySession(FLEX_PROFILES["F06-09"],{targetReps:1});lateral.processFrame({timestamp:0,...base});lateral.processFrame({timestamp:1000,...base,trunkLateralDeg:22,trunkSide:"left"});const lr=lateral.processFrame({timestamp:2500,...base,trunkLateralDeg:2}).summary;assert.equal(lr.totalReps,1);assert.equal(lr.leftReps,1);

const rotation=createFlexibilitySession(FLEX_PROFILES["F06-10"],{targetReps:1});rotation.processFrame({timestamp:0,...base});rotation.processFrame({timestamp:1000,...base,shoulderWidth:.7,noseOffset:-.1});const rr=rotation.processFrame({timestamp:2500,...base,shoulderWidth:.98}).summary;assert.equal(rr.totalReps,1);

const appSource=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");for(const p of Object.values(FLEX_PROFILES))assert.ok(appSource.includes(`/images/exercise/${p.image}`),`${p.id} image-map entry missing`);
console.log("F06 flexibility-series addition tests passed");
