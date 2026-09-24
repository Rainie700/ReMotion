import assert from "node:assert/strict";
import { createDoorPushSession } from "../js/ai/exercises/doorPush/session.js";
import { calculateDoorPushScore } from "../js/ai/exercises/doorPush/score.js";

const session = createDoorPushSession({ targetReps: 1 });
const ready = {
  bodyReady: true,
  leftElbowAngle: 120,
  rightElbowAngle: 175,
  leftShoulderFlexionDeg: 30,
  rightShoulderFlexionDeg: 20,
  leftReachRatio: 0.7,
  rightReachRatio: 0.5,
  trunkLeanDeg: 5,
  leftShrugRatio: 1,
  rightShrugRatio: 1,
  shoulderAsymmetryRatio: 0.02,
};
const pushed = {
  ...ready,
  leftElbowAngle: 170,
  leftShoulderFlexionDeg: 75,
  leftReachRatio: 1,
};

session.processFrame({ timestamp: 0, ...ready });
session.processFrame({ timestamp: 100, ...ready });
session.processFrame({ timestamp: 300, ...pushed });
session.processFrame({ timestamp: 400, ...pushed });
session.processFrame({ timestamp: 500, ...pushed });
const result = session.processFrame({ timestamp: 900, ...ready });
const summary = session.getSummary();

assert.equal(summary.totalReps, 1, "完整推出並控制收回應計為一次");
assert.equal(summary.validReps, 1, "標準肩肘角度與穩定軀幹應列為品質符合");
assert.equal(summary.completed, true, "達到目標次數後應完成");
assert.equal(result.completedRep?.side, "left", "應辨識主要推出的左手");
assert.deepEqual(result.completedRep?.issues, [], "標準動作不應產生錯誤標記");
assert.ok(calculateDoorPushScore(summary).score >= 90, "標準動作品質分數應至少 90 分");

console.log("AD08 door push session tests passed");
