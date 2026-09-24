import assert from "node:assert/strict";
import { createPlankSession } from "../js/ai/exercises/plank/session.js";
import { calculatePlankScore } from "../js/ai/exercises/plank/score.js";

const session = createPlankSession({ targetSeconds: 2 });
const good = { bodyReady: true, hipLineOffsetRatio: 0.01, hipDeviationRatio: 0.01, kneeAngleDeg: 175, elbowAngleDeg: 90, bodyInclineDeg: 8 };
let timestamp = 0;
session.processFrame({ timestamp, ...good });
for (let i = 0; i < 10; i += 1) { timestamp += 100; session.processFrame({ timestamp, ...good }); }
const beforePause = session.getSummary().heldMs;
for (let i = 0; i < 5; i += 1) { timestamp += 100; session.processFrame({ timestamp, ...good, hipLineOffsetRatio: 0.2, hipDeviationRatio: 0.2 }); }
assert.equal(session.getSummary().heldMs, beforePause, "臀部下沉時必須暫停計時");
assert.ok(session.getSummary().hipLowFrames > 0, "應記錄臀部下沉");
for (let i = 0; i < 12; i += 1) { timestamp += 100; session.processFrame({ timestamp, ...good }); }
const summary = session.getSummary();
assert.equal(summary.completed, true, "正確姿勢累積滿目標秒數後應完成");
assert.equal(summary.heldSeconds, 2);
const scored = calculatePlankScore(summary);
assert.ok(scored.score >= 0 && scored.score <= 100, "分數應介於 0–100");
console.log("CR01 plank session tests passed");
