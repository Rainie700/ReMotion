import assert from "node:assert/strict";
import { createClamshellSession } from "../js/ai/exercises/clamshell/session.js";
import { calculateClamshellScore } from "../js/ai/exercises/clamshell/score.js";

const session = createClamshellSession({ targetReps: 1 });
const separations = [0.05, 0.11, 0.16, 0.18, 0.20, 0.18, 0.14, 0.08, 0.06, 0.05];
separations.forEach((kneeSeparationRatio, index) => session.processFrame({
  timestamp: index * 250,
  bodyReady: true,
  kneeSeparationRatio,
  feetSeparationRatio: 0.02,
  bodyRollDeg: 3,
  leftKneeAngle: 88,
  rightKneeAngle: 92,
}));

const summary = session.getSummary();
assert.equal(summary.totalReps, 1);
assert.equal(summary.validReps, 1);
assert.equal(summary.completed, true);
assert.equal(calculateClamshellScore(summary).score, 100);
console.log("HP06 clamshell session tests passed");
