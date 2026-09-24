import assert from "node:assert/strict";
import { rehabExercises } from "../js/data/rehabExercises.js";
import { resolvePoseAnalyzer, POSE_ANALYZER } from "../js/data/exerciseService.js";
import { createSquatSession } from "../js/ai/squatSession.js";
import { SQUAT_THRESHOLDS } from "../js/ai/squatConstants.js";
import { createSeatedKneeExtensionSession } from "../js/ai/exercises/seatedKneeExtension/session.js";

const expected = new Map([["F01-02", "迷你深蹲"], ["F01-03", "靠牆半蹲"], ["F01-05", "終末膝伸直"], ["F01-07", "坐姿膝彎曲"]]);
for (const [id, name] of expected) {
  const exercise = rehabExercises.find((item) => item.exercise_id === id);
  assert.equal(exercise?.exercise_name, name);
  assert.ok(resolvePoseAnalyzer(exercise), `${id} must have a live analyzer`);
}
assert.equal(resolvePoseAnalyzer({ exercise_id: "F01-02" }), POSE_ANALYZER.SQUAT);
assert.equal(resolvePoseAnalyzer({ exercise_id: "F01-07" }), POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION);

const mini = createSquatSession(1, { ...SQUAT_THRESHOLDS, STANDING_KNEE_ANGLE: 158, DOWN_KNEE_ANGLE: 145, MIN_REP_DURATION_MS: 500 });
mini.processFrame({ avgKneeAngle: 170, timestamp: 0 });
mini.processFrame({ avgKneeAngle: 150, timestamp: 200 });
mini.processFrame({ avgKneeAngle: 143, timestamp: 500 });
mini.processFrame({ avgKneeAngle: 150, timestamp: 700 });
mini.processFrame({ avgKneeAngle: 162, timestamp: 900 });
mini.processFrame({ avgKneeAngle: 165, timestamp: 1000 });
assert.equal(mini.getSummary().totalReps, 1);

const flexion = createSeatedKneeExtensionSession({ targetReps: 1, motion: "flexion" });
let t = 0;
for (const angle of [90, 80, 74, 67, 66, 72, 80, 85, 86, 87]) flexion.processFrame({ timestamp: t += 150, leftKneeAngle: angle, rightKneeAngle: 90, leftHipAngle: 90, rightHipAngle: 90, trunkLeanDeg: 2, bodyReady: true });
assert.equal(flexion.getSummary().totalReps, 1);
assert.equal(flexion.getSummary().leftReps, 1);

console.log("F01 additions tests passed");
