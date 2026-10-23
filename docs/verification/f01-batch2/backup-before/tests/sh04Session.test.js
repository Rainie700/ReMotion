import assert from "node:assert/strict";
import { createAbductionIsometricSession } from "../js/ai/exercises/shoulderAbductionIsometric/session.js";
import { calculateAbductionIsometricScore } from "../js/ai/exercises/shoulderAbductionIsometric/score.js";

const session = createAbductionIsometricSession({ targetReps: 1 });
let timestamp = 0;
const good = {
  bodyReady: true,
  leftAbductionDeg: 2,
  rightAbductionDeg: 4,
  leftShrugRatio: 0.01,
  rightShrugRatio: 0.01,
  trunkSideBendDeg: 2,
  hipTiltDeg: 1,
  leftElbow: { x: 0.4, y: 0.5 },
  rightElbow: { x: 0.6, y: 0.5 },
  leftWrist: { x: 0.4, y: 0.68 },
  rightWrist: { x: 0.6, y: 0.68 },
  bodyScale: 0.3,
};

const frame = (overrides = {}) => session.processFrame({ timestamp: timestamp += 100, ...good, ...overrides });
frame();
for (let i = 0; i < 30; i += 1) frame();
const heldBeforePause = session.getSummary().currentHoldMs;
for (let i = 0; i < 5; i += 1) frame({ leftAbductionDeg: 20 });
assert.equal(session.getSummary().currentHoldMs, heldBeforePause, "姿勢偏移時應暫停累積維持時間");
for (let i = 0; i < 31; i += 1) frame();

const summary = session.getSummary();
assert.equal(summary.totalReps, 1);
assert.equal(summary.completed, true);
assert.equal(summary.activeSide, "left");
const score = calculateAbductionIsometricScore(summary).score;
assert.ok(score >= 0 && score <= 100);
console.log("SH04 session tests passed");
