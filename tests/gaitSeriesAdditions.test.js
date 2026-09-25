import assert from "node:assert/strict";
import fs from "node:fs";
import {rehabExercises} from "../js/data/rehabExercises.js";
import {resolvePoseAnalyzer,POSE_ANALYZER} from "../js/data/exerciseService.js";
import {GAIT_PROFILES} from "../js/ai/exercises/gaitSeries/constants.js";
import {createGaitSeriesSession} from "../js/ai/exercises/gaitSeries/session.js";
import {calculateGaitSeriesScore} from "../js/ai/exercises/gaitSeries/score.js";

const ids=["F03-04","F04-01","F04-02","F04-03","F04-04","F04-06"];
for(const id of ids){assert.ok(rehabExercises.some(x=>x.exercise_id===id),`${id} catalog record missing`);assert.equal(resolvePoseAnalyzer({exercise_id:id}),POSE_ANALYZER.GAIT_SERIES);assert.ok(GAIT_PROFILES[id]);}
assert.equal(rehabExercises.some(x=>x.exercise_id==="F04-05"),false,"F04-05 must not be added");

const session=createGaitSeriesSession(GAIT_PROFILES["F04-01"],{targetReps:2});
const base={bodyReady:true,shoulderTiltDeg:2,pelvisTiltDeg:2,trunkLeanDeg:3,leftArmHeight:.1,rightArmHeight:.1};
session.processFrame({timestamp:100,...base,leftFootLiftRatio:.2,rightFootLiftRatio:0});
session.processFrame({timestamp:500,...base,leftFootLiftRatio:.2,rightFootLiftRatio:0});
session.processFrame({timestamp:900,...base,leftFootLiftRatio:0,rightFootLiftRatio:0});
session.processFrame({timestamp:1100,...base,leftFootLiftRatio:0,rightFootLiftRatio:.2});
session.processFrame({timestamp:1500,...base,leftFootLiftRatio:0,rightFootLiftRatio:.2});
const result=session.processFrame({timestamp:1900,...base,leftFootLiftRatio:0,rightFootLiftRatio:0}).summary;
assert.equal(result.totalReps,2);assert.equal(result.leftSteps,1);assert.equal(result.rightSteps,1);assert.equal(result.completed,true);assert.ok(calculateGaitSeriesScore(result).score>=80);

const duration=createGaitSeriesSession({...GAIT_PROFILES["F04-06"],targetSeconds:1});
for(let t=0;t<=1200;t+=100)duration.processFrame({timestamp:t,...base,leftFootLiftRatio:(t/100)%2?.2:0,rightFootLiftRatio:(t/100)%2?0:.2});
assert.equal(duration.getSummary().completed,true);

const appSource=fs.readFileSync(new URL("../app.js",import.meta.url),"utf8");
for(const p of Object.values(GAIT_PROFILES))assert.ok(appSource.includes(`/images/exercise/${p.image}`),`${p.id} image-map entry missing`);
assert.equal(appSource.includes('<h3 class="section-title">資料來源</h3>'),false,"資料來源 section must be removed from exercise details");
console.log("F03/F04 gait-series addition tests passed");
