import assert from "node:assert/strict";
import { createSideLegRaiseSession } from "../js/ai/exercises/sideLegRaise/session.js";
import { calculateSideLegRaiseScore } from "../js/ai/exercises/sideLegRaise/score.js";

const session = createSideLegRaiseSession({ targetReps: 1 });
const frames = [170, 154, 144, 134, 130, 140, 150, 163, 166, 169];
frames.forEach((leftHipAngle, index) => session.processFrame({
  timestamp: index * 250,
  leftHipAngle,
  rightHipAngle: 170,
  leftKneeAngle: 174,
  rightKneeAngle: 175,
  bodyRollDeg: 5,
  bodyReady: true,
}));
const summary = session.getSummary();
assert.equal(summary.totalReps, 1);
assert.equal(summary.leftReps, 1);
assert.equal(summary.rightReps, 0);
assert.equal(summary.validReps, 1);
assert.equal(summary.averageMinHipAngle, 130);
assert.equal(calculateSideLegRaiseScore(summary).score, 100);

const interrupted = createSideLegRaiseSession({ targetReps: 2 });
interrupted.processFrame({ timestamp: 0, leftHipAngle: 150, rightHipAngle: 170, leftKneeAngle: 175, rightKneeAngle: 175, bodyRollDeg: 3, bodyReady: true });
interrupted.processFrame({ timestamp: 300, bodyReady: false });
assert.equal(interrupted.getSummary().trackingInterruptionCount, 1);
console.log("LE04 side-leg-raise session tests passed");
