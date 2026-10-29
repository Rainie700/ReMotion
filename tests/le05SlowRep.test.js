import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createSitToStandSession } from "../js/ai/exercises/sitToStand/session.js";
import { LE05_THRESHOLDS } from "../js/ai/exercises/sitToStand/constants.js";
import { CASES, runCase, STEP } from "../docs/verification/le05-slow-rep/cases.mjs";

/**
 * F01-04 (LE05) slow-rep fix. Synthetic knee-angle frames — program logic only, not recognition accuracy.
 * A complete rep = a tracked seated posture -> stand confirmed -> seated confirmed; a cycle beyond
 * MAX_REP_DURATION_MS counts when tracked without a gap, otherwise it is an unconfirmed attempt.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── 1. the fixed cases ──
for (const c of CASES) {
  const r = runCase(createSitToStandSession, c);
  assert.equal(r.total, c.expected, `${c.id}: count (${c.label})`);
  assert.equal(r.unconfirmed, c.unconfirmed ? 1 : 0, `${c.id}: unconfirmed attempts`);
}

// ── 2. rep records: slow reps flagged, not a quality judgement; the count basis is stated ──
{
  const s = createSitToStandSession({ targetReps: 9 });
  const c = CASES.find((x) => x.id === "S11");
  let t = 0;
  for (const k of c.frames) { t += STEP; s.processFrame({ timestamp: t, averageKneeAngle: k, trunkLeanDeg: 12, kneeAsymmetryDeg: 3, kneeValgus: false, bodyReady: true }); }
  const sum = s.getSummary();
  assert.deepEqual(sum.repRecords.map((r) => r.longCycle), [false, true, false]);
  assert.ok(sum.repRecords[1].durationMs > LE05_THRESHOLDS.MAX_REP_DURATION_MS);
  assert.equal(sum.repRecords[1].qualityValid, sum.repRecords[0].qualityValid, "a slow rep is not marked as a quality issue (nor as a quality pass)");
  assert.equal(sum.longCycleRepCount, 1);
  assert.equal(sum.countingMethod, "ai_pose");
  assert.equal(sum.handSupportVerified, false, "hand support is never verified");
  s.reset();
  assert.deepEqual([s.getSummary().totalReps, s.getSummary().unconfirmedAttemptCount, s.getSummary().abortedRiseCount], [0, 0, 0]);
}
{
  // a rise that returns to the seat is counted as aborted, never as a rep
  const r = runCase(createSitToStandSession, CASES.find((x) => x.id === "S6"));
  assert.equal(r.total, 0);
  const s = createSitToStandSession({ targetReps: 9 });
  let t = 0;
  for (const k of CASES.find((x) => x.id === "S6").frames) { t += STEP; s.processFrame({ timestamp: t, averageKneeAngle: k, trunkLeanDeg: 12, kneeAsymmetryDeg: 3, kneeValgus: false, bodyReady: true }); }
  assert.equal(s.getSummary().abortedRiseCount, 1);
}
{
  // the unconfirmed attempt is returned on the frame it is decided, with its reason
  const s = createSitToStandSession({ targetReps: 9 });
  let t = 0, got = null;
  for (const k of CASES.find((x) => x.id === "S7").frames) {
    t += STEP;
    const r = k == null ? s.processFrame({ timestamp: t, bodyReady: false }) : s.processFrame({ timestamp: t, averageKneeAngle: k, trunkLeanDeg: 12, kneeAsymmetryDeg: 3, kneeValgus: false, bodyReady: true });
    if (r.unconfirmedAttempt) got = r.unconfirmedAttempt;
  }
  assert.equal(got.reason, "tracking_lost");
}

// ── 3. app wiring: the live message and both result views say what the count is based on ──
{
  const app = readFileSync(join(root, "app.js"), "utf8");
  assert.ok(app.includes("result.unconfirmedAttempt") && app.includes("LE05_UNCONFIRMED_TEXT[result.unconfirmedAttempt.reason]"), "unconfirmed attempts are shown live");
  assert.ok(!app.includes('"很好，完整站起並穩定坐下"'), "a counted rep is no longer worded as a quality pass");
  const detail = app.slice(app.indexOf("function renderLe05RecordDetail("), app.indexOf("function renderLe05RecordDetail(") + 3000);
  const result = app.slice(app.indexOf("function renderLe05AnalysisResult("), app.indexOf("function renderLe03AnalysisResult("));
  for (const block of [detail, result]) assert.ok(block.includes("LE05_COUNT_BASIS_NOTE") && block.includes("le05UnconfirmedNote(s)"));
  assert.ok(app.includes("系統看不到手，無法確認是否用手撐"));
  // the 5xSTS assessment keeps its own engine and thresholds
  const assessment = readFileSync(join(root, "js/ai/exercises/sitToStand/assessmentSession.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/createSitToStandSession|LE05_THRESHOLDS|from "\.\/session\.js"/.test(assessment));
  // the threshold value itself is unchanged
  assert.equal(LE05_THRESHOLDS.MAX_REP_DURATION_MS, 10000);
}
console.log("le05SlowRep: all assertions passed");
