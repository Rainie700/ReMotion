import assert from "node:assert/strict";
import { HP05_THRESHOLDS } from "../js/ai/exercises/hipAdduction/constants.js";
import { calculateHipAdductionScore } from "../js/ai/exercises/hipAdduction/score.js";
assert.equal(HP05_THRESHOLDS.TARGET_HIP_ANGLE_MAX_DEG,160);
assert.equal(HP05_THRESHOLDS.KNEE_EXTENSION_MIN_DEG,170);
const good={totalReps:10,targetReps:10,insufficientRaiseCount:0,excessiveRaiseCount:0,kneeBendCount:0,bodyRollCount:0,tooFastCount:0};
assert.equal(calculateHipAdductionScore(good).score,100);
assert.ok(calculateHipAdductionScore({...good,kneeBendCount:1,bodyRollCount:2}).score<100);
console.log("HP05 hip-adduction rules tests passed");
