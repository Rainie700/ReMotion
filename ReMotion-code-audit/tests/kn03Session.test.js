import assert from "node:assert/strict";
import { createSeatedKneeExtensionSession } from "../js/ai/exercises/seatedKneeExtension/session.js";
import { calculateSeatedKneeExtensionScore } from "../js/ai/exercises/seatedKneeExtension/score.js";

function feedRep(session, side, startTime) {
  let t = startTime;
  const frame = (left, right) => session.processFrame({ timestamp: (t += 160), leftKneeAngle: left, rightKneeAngle: right, leftHipAngle: 90, rightHipAngle: 90, trunkLeanDeg: 3, bodyReady: true });
  if (side === "left") {
    frame(100, 100); frame(130, 100); frame(158, 100); frame(170, 100); frame(168, 100); frame(145, 100); frame(115, 100); frame(105, 100); frame(100, 100);
  } else {
    frame(100, 100); frame(100, 130); frame(100, 158); frame(100, 170); frame(100, 168); frame(100, 145); frame(100, 115); frame(100, 105); frame(100, 100);
  }
  return t;
}

const session = createSeatedKneeExtensionSession({ targetReps: 2 });
let time = feedRep(session, "left", 0);
feedRep(session, "right", time + 200);
const summary = session.getSummary();
assert.equal(summary.totalReps, 2);
assert.equal(summary.leftReps, 1);
assert.equal(summary.rightReps, 1);
assert.equal(summary.averageMaxKneeAngle, 170);
assert.equal(summary.qualityValidReps, 2);
assert.equal(summary.completed, true);
assert.deepEqual(calculateSeatedKneeExtensionScore(summary), { score: 100, quality: "Excellent" });

const interrupted = createSeatedKneeExtensionSession({ targetReps: 1 });
interrupted.processFrame({ timestamp: 100, leftKneeAngle: 130, rightKneeAngle: 100, leftHipAngle: 90, rightHipAngle: 90, trunkLeanDeg: 2, bodyReady: true });
interrupted.processFrame({ timestamp: 200, bodyReady: false });
interrupted.processFrame({ timestamp: 300, bodyReady: false });
assert.equal(interrupted.getSummary().trackingInterruptionCount, 1);

console.log("KN03 session tests passed");
