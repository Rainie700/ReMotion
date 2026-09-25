import assert from "node:assert/strict";
import fs from "node:fs";
import {rehabExercises} from "../js/data/rehabExercises.js";
import {resolvePoseAnalyzer,POSE_ANALYZER} from "../js/data/exerciseService.js";
import {UPPER_LIMB_PROFILES} from "../js/ai/exercises/upperLimbSeries/constants.js";
import {createUpperLimbSession} from "../js/ai/exercises/upperLimbSeries/session.js";
import {calculateUpperLimbScore} from "../js/ai/exercises/upperLimbSeries/score.js";

const ids=["F05-01","F05-02","F05-03","F05-04","F05-05","F05-06","F05-09"];
for(const id of ids){const ex=rehabExercises.find(x=>x.exercise_id===id);assert.ok(ex,`${id} catalog record missing`);assert.equal(ex.category,"上肢功能");assert.equal(resolvePoseAnalyzer(ex),POSE_ANALYZER.UPPER_LIMB_SERIES);assert.ok(UPPER_LIMB_PROFILES[id]);}
assert.equal(rehabExercises.some(x=>x.exercise_id==="F05-07"||x.exercise_id==="F05-08"),false,"F05-07 and F05-08 must not be added");

const base={bodyReady:true,bodyScale:.3,leftElbowAngle:170,rightElbowAngle:170,leftShoulderAngle:5,rightShoulderAngle:5,leftElbowDrift:.5,rightElbowDrift:.5,wristSeparation:.4,leftWristX:.4,rightWristX:.6,leftAnkleX:.45,rightAnkleX:.55,leftAnkleY:.9,rightAnkleY:.9,shoulderTiltDeg:2,pelvisTiltDeg:2,trunkLeanDeg:2};
const run=(id,middle,end,expectSide="left")=>{const s=createUpperLimbSession(UPPER_LIMB_PROFILES[id],{targetReps:1});s.processFrame({timestamp:0,...base});s.processFrame({timestamp:1000,...base,...middle});const out=s.processFrame({timestamp:2500,...base,...end}).summary;assert.equal(out.totalReps,1,`${id} counts a complete cycle`);if(expectSide)assert.equal(out[expectSide+"Reps"],1);assert.ok(calculateUpperLimbScore(out).score>=80);};
run("F05-01",{leftElbowAngle:70},{leftElbowAngle:170});
run("F05-02",{leftElbowAngle:170},{leftElbowAngle:90});
run("F05-04",{wristSeparation:1.0},{wristSeparation:.4},"left");
run("F05-05",{leftShoulderAngle:110},{leftShoulderAngle:5});
run("F05-09",{leftWristX:.25},{leftWristX:.4});

const appSource=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
for(const p of Object.values(UPPER_LIMB_PROFILES))assert.ok(appSource.includes(`/images/exercise/${p.image}`),`${p.id} image-map entry missing`);
console.log("F05 upper-limb series addition tests passed");
