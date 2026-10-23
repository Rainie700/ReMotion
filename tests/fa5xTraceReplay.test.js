import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { FA5X_PARAMS, FA5X_RESULT_STATUS, FA5X_END_REASON } from "../js/ai/exercises/sitToStand/assessmentConstants.js";
import { createFiveTimesSitToStandAssessment } from "../js/ai/exercises/sitToStand/assessmentSession.js";
import { createFa5xTraceRecorder, FA5X_TRACE_END_TYPE } from "../js/ai/exercises/sitToStand/assessmentTrace.js";
import { replayFa5xTrace, formatFa5xReplayReport, FA5X_REPLAY_VERDICT as V } from "../js/ai/exercises/sitToStand/assessmentReplay.js";

/**
 * Offline replay of the dev frame trace (docs/verification/fa5x-trace-replay/).
 * Synthetic feature frames — these prove the replay compares against the
 * ORIGINAL session and refuses to claim success on incomplete data. They are
 * NOT accuracy validation.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
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
function script({ reps = 5 } = {}) {
  const frames = [];
  for (let i = 0; i < 150; i += 1) frames.push(feat(0));
  const cycle = (peak) => {
    for (let i = 1; i <= 8; i += 1) frames.push(feat((peak * i) / 8, { knee: peak >= P.STANDING_DISPLACEMENT_MIN ? 176 : 170 }));
    for (let i = 0; i < 4; i += 1) frames.push(feat(peak, { knee: 176 }));
    for (let i = 7; i >= 0; i -= 1) frames.push(feat((peak * i) / 8));
    for (let i = 0; i < 4; i += 1) frames.push(feat(0));
  };
  cycle(0.4); // NOT_FULLY_STANDING
  for (let i = 0; i < 5; i += 1) frames.push(feat(0, { tracked: false }));
  for (let r = 0; r < reps; r += 1) cycle(0.9);
  return frames;
}

/**
 * Records a synthetic run the way the app does (listener -> recorder.recordFrame("assess", ...)).
 * attachAt: frame index at which recording starts (mid-run start when > 0).
 * cancelAt: call session.cancel() after this many frames (user 結束評估).
 */
function record(frames, { attachAt = 0, cancelAt = null, stopReason = FA5X_TRACE_END_TYPE.RUN_FINISHED, recorderOpts = {}, restartAt = null } = {}) {
  const rec = createFa5xTraceRecorder({ ...recorderOpts, startContext: { stage: attachAt > 0 ? "assess" : "stand" } });
  let session = createFiveTimesSitToStandAssessment();
  const listener = (e) => rec.recordFrame("assess", e, {});
  let t = 1000;
  frames.forEach((f, i) => {
    if (restartAt != null && i === restartAt) { session = createFiveTimesSitToStandAssessment(); session.setTraceListener(listener); rec.recordEvent("setup_restart", {}, t); }
    if (i === attachAt) session.setTraceListener(listener);
    if (cancelAt != null && i === cancelAt) { t += STEP; session.cancel(t); return; }
    if (cancelAt != null && i > cancelAt) return;
    t += STEP;
    session.processFrame(f, t);
  });
  if (stopReason) rec.stop(stopReason);
  return JSON.parse(JSON.stringify(rec.buildExport())); // through JSON, like the downloaded file
}

// R1. complete, normally finished run -> reproduced
{
  const trace = record(script());
  assert.equal(trace.endType, FA5X_TRACE_END_TYPE.RUN_FINISHED);
  assert.equal(trace.complete, true);
  const r = replayFa5xTrace(trace);
  assert.equal(r.verdict, V.REPRODUCED, formatFa5xReplayReport(r));
  assert.equal(r.framesReplayed, trace.frames.length);
  assert.equal(r.segments.at(-1).replayed.completedReps, 5);
  assert.equal(r.segments.at(-1).replayed.endStatus.status, FA5X_RESULT_STATUS.COMPLETED);
  assert.equal(r.segments.at(-1).replayed.totalDurationMs, trace.result.totalDurationMs);
  assert.ok(r.segments.at(-1).replayed.eventTimes.filter((e) => e.type === "rep").length === 5);
}

// R2. a tampered recorded decision -> mismatch at exactly that frame / field
{
  const trace = record(script());
  const target = trace.frames.find((f) => f.diag?.step === "rep_counted");
  target.after.completedReps += 1;
  const r = replayFa5xTrace(trace);
  assert.equal(r.verdict, V.MISMATCH);
  assert.equal(r.firstMismatch.seq, target.seq);
  assert.equal(r.firstMismatch.path, "after.completedReps");
}

// R3. a different decision behaviour (here: a standing threshold the synthetic peak 0.9 never reaches, injected
//     into the session for this check only) is detected per frame AND in the summary
{
  const trace = record(script());
  const r = replayFa5xTrace(trace, { createSession: (o) => createFiveTimesSitToStandAssessment({ ...o, params: { ...o.params, STANDING_DISPLACEMENT_MIN: 0.95 } }) });
  assert.equal(r.verdict, V.MISMATCH);
  assert.ok(r.firstMismatch && r.firstMismatch.seq > 0);
  // the summary also names the end-result difference (reps / event times / total time)
  assert.ok(r.summaryMismatches.length > 0);
}

// R4. recording started mid-run -> flagged; replay never claims success
{
  const trace = record(script(), { attachAt: 200 });
  assert.equal(trace.completeness.startedMidRun, true);
  assert.equal(trace.complete, false);
  assert.ok(/中途開始記錄/.test(trace.incompleteReason));
  const r = replayFa5xTrace(trace);
  assert.equal(r.verdict, V.NOT_VERIFIABLE);
  assert.ok(r.framesSkipped > 0 && r.framesReplayed === 0);
  assert.ok(r.completenessIssues.some((s) => s.includes("中途開始記錄")));
}

// R4b. missed frames in the middle (listener off for 5 frames) -> recorder flags the gap; replay stops at it
{
  const frames = script();
  const rec = createFa5xTraceRecorder({ startContext: { stage: "stand" } });
  const session = createFiveTimesSitToStandAssessment();
  const listener = (e) => rec.recordFrame("assess", e, {});
  session.setTraceListener(listener);
  let t = 1000;
  frames.forEach((f, i) => {
    if (i === 250) session.setTraceListener(null);
    if (i === 255) session.setTraceListener(listener);
    t += STEP;
    session.processFrame(f, t);
  });
  rec.stop(FA5X_TRACE_END_TYPE.RUN_FINISHED);
  const trace = JSON.parse(JSON.stringify(rec.buildExport()));
  assert.equal(trace.completeness.frameIndexGaps.length, 1);
  assert.deepEqual({ expected: trace.completeness.frameIndexGaps[0].expected, got: trace.completeness.frameIndexGaps[0].got }, { expected: 250, got: 255 });
  assert.equal(trace.complete, false);
  assert.ok(/不連續/.test(trace.incompleteReason));
  const r = replayFa5xTrace(trace);
  assert.equal(r.verdict, V.NOT_VERIFIABLE);
  assert.equal(r.firstMismatch, null);
  assert.ok(r.framesSkipped > 0);
}

// R5. capacity truncation -> not verifiable (the replayed prefix still matches)
{
  const trace = record(script(), { recorderOpts: { maxFrames: 120 } });
  assert.equal(trace.completeness.truncated, true);
  assert.equal(trace.endType, FA5X_TRACE_END_TYPE.RUN_FINISHED, "truncation is not an end type");
  const r = replayFa5xTrace(trace);
  assert.equal(r.verdict, V.NOT_VERIFIABLE);
  assert.equal(r.firstMismatch, null);
  assert.ok(r.completenessIssues.some((s) => s.startsWith("容量截斷")));
}

// R5b. event-cap truncation (frames intact): still not verifiable, but the recorded summary is rebuilt from the
//      frames' event types + the kept result instead of showing a false "0 reps, not ended"
{
  const trace = record(script(), { recorderOpts: { maxEvents: 15 } });
  assert.ok(trace.droppedEvents > 0 && trace.droppedFrames === 0);
  const r = replayFa5xTrace(trace);
  assert.equal(r.verdict, V.NOT_VERIFIABLE);
  assert.equal(r.firstMismatch, null);
  const seg = r.segments.at(-1);
  assert.equal(seg.eventPayloadsMissing, true);
  assert.equal(seg.ended, true);
  assert.equal(seg.recorded.completedReps, 5);
  assert.deepEqual(seg.recorded.endStatus, seg.replayed.endStatus);
  assert.ok(!r.completenessIssues.some((s) => s.startsWith("最後一段")), "no misleading 'no end event' line");
}

// R6. end types: user cancel is reproducible; manual stop / still recording are not verifiable
{
  const cancelled = record(script(), { cancelAt: 260, stopReason: FA5X_TRACE_END_TYPE.USER_CANCELLED });
  assert.equal(cancelled.endType, FA5X_TRACE_END_TYPE.USER_CANCELLED);
  const rc = replayFa5xTrace(cancelled);
  assert.equal(rc.verdict, V.REPRODUCED, formatFa5xReplayReport(rc));
  assert.equal(rc.segments.at(-1).replayed.endStatus.failureReason, FA5X_END_REASON.USER_CANCELLED);

  const manual = record(script().slice(0, 220), { stopReason: FA5X_TRACE_END_TYPE.MANUAL_STOP });
  assert.equal(manual.endType, FA5X_TRACE_END_TYPE.MANUAL_STOP);
  assert.equal(replayFa5xTrace(manual).verdict, V.NOT_VERIFIABLE);

  const open = record(script().slice(0, 220), { stopReason: null });
  assert.equal(open.endType, FA5X_TRACE_END_TYPE.STILL_RECORDING);
  assert.equal(replayFa5xTrace(open).verdict, V.NOT_VERIFIABLE);
}

// R7. set-up restart (new session) -> two segments, both replayed from their start
{
  const frames = [...Array.from({ length: 40 }, () => feat(0)), ...script()];
  const trace = record(frames, { restartAt: 40 });
  const r = replayFa5xTrace(trace);
  assert.equal(r.segments.length, 2);
  assert.equal(r.verdict, V.REPRODUCED, formatFa5xReplayReport(r));
}

// R8. version checks -> unsupported, nothing replayed
{
  const base = record(script());
  const old = { ...base, formatVersion: "fa5x-frame-trace-1.0" };
  const r1 = replayFa5xTrace(old);
  assert.equal(r1.verdict, V.UNSUPPORTED);
  assert.equal(r1.framesReplayed, 0);
  assert.ok(r1.problems.some((p) => p.includes("1.0")));
  assert.equal(replayFa5xTrace({ ...base, algorithmVersion: "fa5x-assessment-1.0" }).verdict, V.UNSUPPORTED);
  assert.equal(replayFa5xTrace({ ...base, params: { ...base.params, EXTRA: 1 } }).verdict, V.UNSUPPORTED);
  assert.equal(replayFa5xTrace(null).verdict, V.UNSUPPORTED);
}

// R9. scope: the replay has no counting rule of its own and no I/O; thresholds untouched
{
  const src = readFileSync(join(root, "js/ai/exercises/sitToStand/assessmentReplay.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(src.includes("createFiveTimesSitToStandAssessment"), "uses the original session");
  for (const k of ["RISE_ONSET_DISPLACEMENT", "STANDING_DISPLACEMENT_MIN", "SEATED_RETURN_DISPLACEMENT_MAX", "CONFIRM_FRAMES", "BELOW_BASELINE_RESET"]) {
    assert.ok(!src.includes(k), `no threshold logic (${k}) in the replay`);
  }
  assert.ok(!/fetch\(|firebase|localStorage|writeFile/.test(src), "no network / storage / writes");
  const cli = readFileSync(join(root, "scripts/replayFa5xTrace.mjs"), "utf8");
  assert.ok(!/writeFile|fetch\(/.test(cli), "CLI only reads the file");
}

console.log("5xSTS trace replay tests passed");
