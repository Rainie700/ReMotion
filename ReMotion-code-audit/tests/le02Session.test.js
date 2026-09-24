import assert from "node:assert/strict";
import { createStraightLegRaiseSession } from "../js/ai/exercises/straightLegRaise/session.js";
import { LE02_THRESHOLDS } from "../js/ai/exercises/straightLegRaise/constants.js";
import { calculateStraightLegRaiseScore } from "../js/ai/exercises/straightLegRaise/score.js";

const session = createStraightLegRaiseSession({ targetReps: 1, thresholds: LE02_THRESHOLDS });
const angles = [180, 160, 145, 140, 135, 145, 155, 168, 170, 172];
angles.forEach((leftHipAngle, index) => session.processFrame({
  timestamp: index * 250,
  bodyReady: true,
  leftHipAngle,
  rightHipAngle: 180,
  leftKneeAngle: 175,
  rightKneeAngle: 175,
  bodyRollDeg: 3,
}));
const summary = session.getSummary();
assert.equal(summary.totalReps, 1);
assert.equal(summary.leftReps, 1);
assert.equal(summary.validReps, 1);
assert.equal(calculateStraightLegRaiseScore(summary).score, 100);
console.log("LE02 straight-leg-raise session tests passed");
