import assert from "node:assert/strict";
import { HP04_THRESHOLDS } from "../js/ai/exercises/hipAbduction/constants.js";
import { calculateHipAbductionScore } from "../js/ai/exercises/hipAbduction/score.js";
assert.equal(HP04_THRESHOLDS.TARGET_HIP_ANGLE_MAX_DEG,150);
assert.equal(HP04_THRESHOLDS.KNEE_EXTENSION_MIN_DEG,170);
const good={totalReps:10,targetReps:10,insufficientRaiseCount:0,excessiveRaiseCount:0,kneeBendCount:0,bodyRollCount:0,tooFastCount:0};
assert.equal(calculateHipAbductionScore(good).score,100);
assert.ok(calculateHipAbductionScore({...good,kneeBendCount:2,bodyRollCount:1}).score<100);
console.log("HP04 hip-abduction rules tests passed");
