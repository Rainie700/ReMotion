import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FA5X_PARAMS,
  FA5X_PHASE,
  FA5X_RESULT_STATUS,
  FA5X_END_REASON,
  FA5X_ALGORITHM_VERSION,
  FA5X_THRESHOLD_VERSION,
  FA5X_REQUIRED_LANDMARKS,
} from "../js/ai/exercises/sitToStand/assessmentConstants.js";
import { createFiveTimesSitToStandAssessment } from "../js/ai/exercises/sitToStand/assessmentSession.js";
import { createFa5xTraceRecorder, pickFa5xTraceLandmarks, FA5X_TRACE_FORMAT_VERSION } from "../js/ai/exercises/sitToStand/assessmentTrace.js";

/**
 * Dev-only 5xSTS frame trace (docs/verification/fa5x-frame-trace/).
 * Synthetic feature frames (same model as fiveTimesSitToStandAssessment.test.js).
 * These checks prove the trace is a passive copy of the session's decisions;
 * they are NOT accuracy validation.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const P = FA5X_PARAMS;
const STEP = 66, SHANK = 0.18, BASE_HIP = 0.6, BASE_SHOULDER = 0.4;

function feat(d, { knee = 170, tracked = true } = {}) {
  const hipY = BASE_HIP - d * SHANK, shoulderY = BASE_SHOULDER - d * SHANK;
  return {
    tracked, missing: { shoulders: !tracked, hips: !tracked, knees: !tracked, ankles: !tracked },
    frameSizeValid: true, frameWidth: 1280, frameHeight: 720,
    hipY: tracked ? hipY : null, shoulderY: tracked ? shoulderY : null, shankLength: tracked ? SHANK : null,
    kneeAngle: tracked ? knee : null, trunkLeanDeg: tracked ? 8 : null,
    topY: tracked ? shoulderY : null, bottomY: tracked ? 0.9 : null, bodyHeight: tracked ? 0.9 - shoulderY : null,
  };
}

/** Scripted run: preparation, 1 not-fully-standing attempt, a short tracking gap, 5 full reps. */
function script() {
  const frames = [];
  for (let i = 0; i < 150; i += 1) frames.push(feat(0));
  const cycle = (peak) => {
    for (let i = 1; i <= 8; i += 1) frames.push(feat((peak * i) / 8, { knee: peak >= P.STANDING_DISPLACEMENT_MIN ? 176 : 170 }));
    for (let i = 0; i < 4; i += 1) frames.push(feat(peak, { knee: 176 }));
    for (let i = 7; i >= 0; i -= 1) frames.push(feat((peak * i) / 8));
    for (let i = 0; i < 4; i += 1) frames.push(feat(0));
  };
  cycle(0.4); // rises, never stands -> NOT_FULLY_STANDING
  for (let i = 0; i < 5; i += 1) frames.push(feat(0, { tracked: false })); // ~330 ms gap, below the 1200 ms limit
  for (let r = 0; r < 5; r += 1) cycle(0.9);
  return frames;
}

function run(frames, listener) {
  const a = createFiveTimesSitToStandAssessment();
  if (listener !== undefined) a.setTraceListener(listener);
  let t = 1000;
  return frames.map((f) => { t += STEP; return a.processFrame(f, t); });
}

// 1. A listener does not change a single snapshot (counting / timing / result identical).
{
  const frames = script();
  const plain = run(frames);
  const recorder = createFa5xTraceRecorder();
  const traced = run(frames, (e) => recorder.recordFrame("assess", e, {}));
  assert.deepEqual(traced, plain, "snapshots identical with and without the trace listener");
  const last = plain[plain.length - 1];
  assert.equal(last.phase, FA5X_PHASE.FINISHED);
  assert.equal(last.result.status, FA5X_RESULT_STATUS.COMPLETED);

  // 2. Every frame fed to the session is in the trace, preparation included.
  const x = recorder.buildExport();
  assert.equal(x.frameCount, frames.length, "one trace frame per processed frame");
  assert.ok(x.frames.some((f) => f.diag?.step === "seated_check"), "preparation frames are kept");
  assert.ok(x.frames.some((f) => f.diag?.step === "baseline_set"), "baseline frame");
  assert.ok(x.frames.some((f) => f.diag?.step === "start_cue"), "start cue frame");
  assert.ok(x.frames.some((f) => f.diag?.step === "tracking_gap"), "tracking-gap frames");
  // 3. The trace's reasons are the session's own: one rep_counted per counted rep, one rejected_* per rejection event.
  assert.equal(x.frames.filter((f) => f.diag?.step === "rep_counted").length, last.result.completedReps);
  const rejectedFrames = x.frames.filter((f) => f.eventTypes.includes("rejected"));
  assert.equal(rejectedFrames.length, last.result.rejectedAttempts.length);
  assert.ok(rejectedFrames.every((f) => f.diag.step === "rejected_not_fully_standing"));
  // before/after state and confirm counts
  const counted = x.frames.find((f) => f.diag?.step === "rep_counted");
  assert.equal(counted.before.repState, "descending");
  assert.equal(counted.after.repState, "seated");
  assert.equal(counted.before.seatConfirm, P.SEATED_CONFIRM_FRAMES - 1);
  assert.equal(typeof counted.diag.seatedNow, "boolean");
  assert.equal(counted.kneeAngleAvailable, true);
  // 4. Export header
  assert.equal(x.formatVersion, FA5X_TRACE_FORMAT_VERSION);
  assert.equal(x.algorithmVersion, FA5X_ALGORITHM_VERSION);
  assert.equal(x.thresholdVersion, FA5X_THRESHOLD_VERSION);
  assert.deepEqual(x.params, { ...P });
  assert.ok(x.baseline && x.baseline.baseline.shankLength > 0, "baseline captured from the session's event");
  assert.equal(x.result.completedReps, 5, "result captured from the finished event");
  assert.equal(x.complete, true);
  assert.ok(!JSON.stringify(x).includes("patientId") && !JSON.stringify(x).includes("userId"), "no user id in the export");
}

// 5. A listener that throws never affects the assessment.
{
  const frames = script();
  assert.deepEqual(run(frames, () => { throw new Error("boom"); }), run(frames));
}

// 6. Tracking loss -> invalid end is traced with its reason.
{
  const frames = [];
  for (let i = 0; i < 150; i += 1) frames.push(feat(0));
  for (let i = 0; i < 30; i += 1) frames.push(feat(0, { tracked: false }));
  const rec = createFa5xTraceRecorder();
  const out = run(frames, (e) => rec.recordFrame("assess", e, {}));
  const end = out.find((s) => s.phase === FA5X_PHASE.FINISHED);
  assert.equal(end.result.invalidReason, FA5X_END_REASON.TRACKING_LOST);
  const x = rec.buildExport();
  assert.ok(x.frames.some((f) => f.diag?.step === "tracking_lost_invalid"));
  assert.ok(x.frames.some((f) => f.diag?.step === "ignored_after_finish"), "frames after the end are traced as ignored");
}

// 7. Capacity: past the cap entries are dropped, counted, and the export says incomplete.
{
  const rec = createFa5xTraceRecorder({ maxFrames: 10, maxEvents: 5 });
  run(script(), (e) => rec.recordFrame("assess", e, {}));
  const x = rec.buildExport();
  assert.equal(x.frameCount, 10);
  assert.ok(x.droppedFrames > 0 && x.droppedEvents > 0);
  assert.equal(x.complete, false);
  assert.ok(/超過容量上限/.test(x.incompleteReason));
  assert.ok(x.result, "the result is still captured even when frames were dropped");
}

// 8. Stopped recorder collects nothing; landmark subset only.
{
  const rec = createFa5xTraceRecorder();
  rec.stop();
  assert.equal(rec.recordFrame("assess", { t: 1, features: feat(0), events: [] }, {}), false);
  assert.equal(rec.buildExport().frameCount, 0);
  const lm = Array.from({ length: 33 }, (_, i) => ({ x: i / 33, y: 0.5, visibility: 0.9, presence: 0.9 }));
  assert.deepEqual(pickFa5xTraceLandmarks(lm).map((p) => p.index), [...FA5X_REQUIRED_LANDMARKS]);
}

// 9. App wiring: debug-only, explicit start, memory + manual download, no upload.
{
  const trace = readFileSync(join(root, "js/ai/exercises/sitToStand/assessmentTrace.js"), "utf8");
  assert.ok(!/fetch\(|firebase|firestore|localStorage|sessionStorage|indexedDB|XMLHttpRequest|sendBeacon/i.test(trace.replace(/\/\*[\s\S]*?\*\//g, "")), "recorder has no storage / network");
  const block = appJs.slice(appJs.indexOf("// ── Dev-only 5xSTS frame trace"), appJs.indexOf("function goFunctionalChangeTrend()"));
  assert.ok(!/fetch\(|firestore|localStorage|setItem|sendBeacon/.test(block), "app trace code has no storage / network");
  assert.ok(/function startFa5xTrace\(\) \{\s*if \(!FA5X_DEBUG\) return;/.test(block), "start is debug-only");
  assert.ok(/if \(FA5X_DEBUG\) Object\.assign\(window, \{ startFa5xTrace/.test(appJs), "controls exposed only with ?fa5xDebug=1");
  const calls = [...appJs.matchAll(/setTraceListener\(/g)].map((m) => m.index);
  assert.ok(calls.length > 0 && calls.every((i) => i > appJs.indexOf("// ── Dev-only 5xSTS frame trace")), "the listener is attached only from the dev trace block");
  const fullTraceStart = appJs.indexOf("createFa5xTraceRecorder()");
  assert.ok(fullTraceStart > appJs.indexOf("function startFa5xTrace()"), "a recorder is created only by 「開始記錄」");
  for (const line of appJs.split("\n").filter((l) => /fa5xTrace(Frame|Active|SessionRestarted|Ended)\b|renderFa5xTraceDock\(\)/.test(l) && !/^\s*(function|\/\/|\*|\/\*\*)/.test(l) && !l.includes("let fa5xTrace"))) {
    if (appJs.indexOf(line) < appJs.indexOf("// ── Dev-only 5xSTS frame trace")) assert.ok(line.includes("FA5X_DEBUG"), `gated: ${line.trim()}`);
  }
}

console.log("5xSTS dev frame trace tests passed");
