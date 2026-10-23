import assert from "node:assert/strict";
import { createSeatedKneeRaiseSession } from "../js/ai/exercises/seatedKneeRaise/session.js";
import { calculateSeatedKneeRaiseScore } from "../js/ai/exercises/seatedKneeRaise/score.js";
import { computeSeatedKneeRaiseMetrics } from "../js/ai/exercises/seatedKneeRaise/poseMath.js";

function feedAlternatingRepSequence(session) {
  let timestamp = 0;
  const feed = (left, right, trunkLeanDeg = 3) => session.processFrame({
    timestamp: (timestamp += 150),
    leftHipAngle: left,
    rightHipAngle: right,
    trunkLeanDeg,
    bodyReady: true,
  });
  feed(90, 90); feed(77, 90); feed(68, 90); feed(66, 90); feed(78, 90); feed(84, 90); feed(86, 90); feed(88, 90);
  feed(90, 77); feed(90, 68); feed(90, 66); feed(90, 78); feed(90, 84); feed(90, 86); feed(90, 88);
}

const session = createSeatedKneeRaiseSession({ targetReps: 2 });
feedAlternatingRepSequence(session);
const summary = session.getSummary();
assert.equal(summary.totalReps, 2);
assert.equal(summary.leftReps, 1);
assert.equal(summary.rightReps, 1);
assert.equal(summary.rhythmIssueCount, 0);
assert.equal(summary.completed, true);
assert.equal(summary.averageMinHipAngle, 66);
assert.equal(summary.trackingInterruptionCount, 0);
assert.deepEqual(calculateSeatedKneeRaiseScore(summary), { score: 100, quality: "Excellent" });

const interruptedSession = createSeatedKneeRaiseSession({ targetReps: 1 });
interruptedSession.processFrame({ timestamp: 150, leftHipAngle: 77, rightHipAngle: 90, trunkLeanDeg: 3, bodyReady: true });
interruptedSession.processFrame({ timestamp: 300, leftHipAngle: null, rightHipAngle: null, trunkLeanDeg: null, bodyReady: false });
interruptedSession.processFrame({ timestamp: 450, leftHipAngle: null, rightHipAngle: null, trunkLeanDeg: null, bodyReady: false });
assert.equal(interruptedSession.getSummary().trackingInterruptionCount, 1);

const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 1 }));
landmarks[11] = { x: 0.4, y: 0.2, visibility: 1 };
landmarks[12] = { x: 0.6, y: 0.2, visibility: 1 };
landmarks[23] = { x: 0.4, y: 0.5, visibility: 1 };
landmarks[24] = { x: 0.6, y: 0.5, visibility: 1 };
landmarks[25] = { x: 0.2, y: 0.5, visibility: 1 };
landmarks[26] = { x: 0.8, y: 0.5, visibility: 1 };
const metrics = computeSeatedKneeRaiseMetrics(landmarks);
assert.ok(Number.isFinite(metrics.leftHipAngle));
assert.ok(Number.isFinite(metrics.rightHipAngle));
assert.equal(Math.round(metrics.trunkLeanDeg), 0);

console.log("CR05 session tests passed");
