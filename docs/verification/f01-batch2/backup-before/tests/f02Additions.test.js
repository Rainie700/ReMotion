import assert from "node:assert/strict";
import { rehabExercises } from "../js/data/rehabExercises.js";
import { resolvePoseAnalyzer, POSE_ANALYZER } from "../js/data/exerciseService.js";
import { F02_PROFILES } from "../js/ai/exercises/balanceSeries/constants.js";
import { createBalanceSeriesSession } from "../js/ai/exercises/balanceSeries/session.js";
import { calculateBalanceSeriesScore } from "../js/ai/exercises/balanceSeries/score.js";

const ids=["F02-01","F02-02","F02-03","F02-05","F02-06","F02-07","F02-09"];
for(const id of ids){assert.ok(rehabExercises.some(x=>x.exercise_id===id),`${id} catalog record missing`);assert.equal(resolvePoseAnalyzer({exercise_id:id}),POSE_ANALYZER.F02_BALANCE_SERIES);assert.ok(F02_PROFILES[id]);}

const staticSession=createBalanceSeriesSession(F02_PROFILES["F02-01"]);
let t=0;const stable=()=>staticSession.processFrame({timestamp:t+=100,bodyReady:true,bodyScale:.3,centerX:.5,centerY:.4,shoulderTiltDeg:2,pelvisTiltDeg:2,ankleDepth:.05,leftAnkleX:.47,rightAnkleX:.53,leftAnkleY:.8,rightAnkleY:.8,leftWristX:.4,rightWristX:.6});
for(let i=0;i<105;i++)stable();assert.equal(staticSession.getSummary().completed,true);assert.equal(staticSession.getSummary().heldSeconds,10);

const shift=createBalanceSeriesSession(F02_PROFILES["F02-05"],{targetReps:2});t=0;const frame=x=>shift.processFrame({timestamp:t+=180,bodyReady:true,bodyScale:.3,centerX:x,centerY:.4,shoulderTiltDeg:2,pelvisTiltDeg:2,ankleDepth:.05,leftAnkleX:.4,rightAnkleX:.6,leftAnkleY:.8,rightAnkleY:.8,leftWristX:.4,rightWristX:.6});
frame(.5);for(const x of [.54,.57,.58,.58,.58,.58,.56,.53,.51,.5])frame(x);for(const x of [.46,.43,.42,.42,.42,.42,.44,.47,.49,.5])frame(x);assert.equal(shift.getSummary().totalReps,2);assert.equal(shift.getSummary().leftReps,1);assert.equal(shift.getSummary().rightReps,1);assert.ok(calculateBalanceSeriesScore(shift.getSummary()).score>=0);
console.log("F02 additions tests passed");
