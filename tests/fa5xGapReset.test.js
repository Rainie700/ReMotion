import assert from "node:assert/strict";

/**
 * 5xSTS fa5x-assessment-1.2 — a received untracked frame clears a standing / seated confirmation
 * that is not complete yet (docs/verification/fa5x-gap-reset/). Synthetic feature frames only:
 * these check decision behaviour, not real-person accuracy.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const { FA5X_PARAMS: P, FA5X_ALGORITHM_VERSION, FA5X_THRESHOLD_VERSION, FA5X_REJECT_REASON, FA5X_END_REASON } = await import("../js/ai/exercises/sitToStand/assessmentConstants.js");
const { createFiveTimesSitToStandAssessment } = await import("../js/ai/exercises/sitToStand/assessmentSession.js");
const C = await import("../js/data/fa5xMeasurementCompatibility.js");
const { createFa5xTraceRecorder, FA5X_TRACE_END_TYPE } = await import("../js/ai/exercises/sitToStand/assessmentTrace.js");
const { replayFa5xTrace, FA5X_REPLAY_VERDICT } = await import("../js/ai/exercises/sitToStand/assessmentReplay.js");

const STEP = 66, SHANK = 0.18, BASE_HIP = 0.6, BASE_SHOULDER = 0.4;
const feat = (d, { knee = 170, tracked = true } = {}) => {
  const hipY = BASE_HIP - d * SHANK, shoulderY = BASE_SHOULDER - d * SHANK;
  return {
    tracked, missing: { shoulders: !tracked, hips: !tracked, knees: !tracked, ankles: !tracked },
    frameSizeValid: true, frameWidth: 1280, frameHeight: 720,
    hipY: tracked ? hipY : null, shoulderY: tracked ? shoulderY : null, shankLength: tracked ? SHANK : null,
    kneeAngle: tracked ? knee : null, trunkLeanDeg: tracked ? 8 : null,
    topY: tracked ? shoulderY : null, bottomY: tracked ? 0.9 : null, bodyHeight: tracked ? 0.9 - shoulderY : null,
  };
};
const GAP = feat(0, { tracked: false });
const prep = () => Array.from({ length: 150 }, () => feat(0));
const rise = () => [0.15, 0.3, 0.45, 0.6].map((d) => feat(d));
const stand = (n) => Array.from({ length: n }, () => feat(0.9, { knee: 176 }));
const down = () => [0.75, 0.55, 0.4, 0.25].map((d) => feat(d));
const seat = (n) => Array.from({ length: n }, () => feat(0));
const gaps = (n) => Array.from({ length: n }, () => GAP);
const fullRep = () => [...rise(), ...stand(4), ...down(), ...seat(4)];

/** Runs frames (66 ms apart, or `times` when given); returns snapshots and, per index, the frame time. */
function run(frames, { times = null } = {}) {
  const s = createFiveTimesSitToStandAssessment();
  let t = 1000;
  const snaps = [], ts = [];
  frames.forEach((f, i) => { t = times ? times[i] : t + STEP; ts.push(t); snaps.push(s.processFrame(f, t)); });
  return { snaps, ts, last: snaps[snaps.length - 1] };
}
const startCue = (r) => r.snaps.find((s) => s.startCueAt != null).startCueAt;

// G0 version: behaviour changed -> new algorithm version, thresholds untouched
assert.equal(FA5X_ALGORITHM_VERSION, "fa5x-assessment-1.2");
assert.equal(FA5X_THRESHOLD_VERSION, "fa5x-engineering-candidate-2026-09-28", "no threshold value changed");
assert.deepEqual([P.STANDING_CONFIRM_FRAMES, P.SEATED_CONFIRM_FRAMES, P.TRACKING_LOSS_INVALID_MS], [3, 3, 1200]);

// G1 standing: 2 qualifying -> 1 untracked -> 1 qualifying does NOT confirm; 3 after the gap do,
//    and the standing time is the first frame AFTER the gap (never back-filled)
{
  const pre = [...prep(), ...rise(), ...stand(2)];
  const frames = [...pre, ...gaps(1), ...stand(3), ...down(), ...seat(4), ...Array.from({ length: 4 }, fullRep).flat()];
  const r = run(frames);
  const gapAt = pre.length;
  assert.equal(r.snaps[gapAt + 1].repState, "rising", "one tracked frame after the gap does not complete the confirmation");
  assert.equal(r.snaps[gapAt + 2].repState, "rising");
  assert.equal(r.snaps[gapAt + 3].repState, "standing", "three tracked frames after the gap confirm standing");
  const rep1 = r.last.result.reps[0];
  assert.equal(rep1.standingMs, Math.round(r.ts[gapAt + 1] - startCue(r)), "standing time = first frame after the gap");
  assert.ok(r.ts[gapAt] - startCue(r) < rep1.standingMs, "never earlier than the gap");
  assert.equal(r.last.result.completedReps, 5);
}

// G2 seated: same for the seated confirmation; the rep's seated time is after the gap
{
  const pre = [...prep(), ...rise(), ...stand(4), ...down(), ...seat(2)];
  const frames = [...pre, ...gaps(1), ...seat(4), ...Array.from({ length: 4 }, fullRep).flat()];
  const r = run(frames);
  const gapAt = pre.length;
  assert.equal(r.snaps[gapAt + 1].completedReps, 0, "one seated frame after the gap does not count the rep");
  assert.equal(r.snaps[gapAt + 3].completedReps, 1, "three seated frames after the gap count it");
  assert.equal(r.last.result.reps[0].seatedMs, Math.round(r.ts[gapAt + 1] - startCue(r)), "seated time = first frame after the gap");
}

// G3 the 5th seated confirmation straddling a gap: total time ends at the first frame after the gap
{
  const pre = [...prep(), ...Array.from({ length: 4 }, fullRep).flat(), ...rise(), ...stand(4), ...down(), ...seat(2)];
  const r = run([...pre, ...gaps(1), ...seat(4)]);
  assert.equal(r.last.result.status, "completed");
  assert.equal(r.last.result.totalDurationMs, Math.round(r.ts[pre.length + 1] - startCue(r)));
  const noGap = run([...prep(), ...Array.from({ length: 5 }, fullRep).flat()]);
  assert.ok(r.last.result.totalDurationMs > noGap.last.result.totalDurationMs, "the gap is not hidden by back-filling");
}

// G4 repeated short gaps: never 3 consecutive tracked standing frames -> not confirmed -> rejected on return
{
  const r = run([...prep(), ...rise(), ...[0, 1, 2, 3, 4].flatMap(() => [...stand(1), ...gaps(1)]), ...down(), ...seat(4)]);
  assert.equal(r.last.completedReps, 0);
  assert.equal(r.last.lastRejection && r.last.lastRejection.reason, FA5X_REJECT_REASON.NOT_FULLY_STANDING);
  assert.equal(r.last.trackingLossCount, 5, "each short gap is still counted");
}

// G5 gap over the existing limit -> invalid, exactly as before
{
  const r = run([...prep(), ...rise(), ...stand(2), ...gaps(20)]);
  assert.equal(r.last.result.status, "invalid");
  assert.equal(r.last.result.invalidReason, FA5X_END_REASON.TRACKING_LOST);
}

// G6 kept across a gap: completed reps, seated baseline, 「開始」 timer start, rep state
{
  const pre = [...prep(), ...fullRep(), ...rise(), ...stand(2)];
  const r = run([...pre, ...gaps(2), ...stand(3)]);
  const before = r.snaps[pre.length - 1], during = r.snaps[pre.length + 1];
  assert.equal(during.completedReps, 1);
  assert.equal(during.startCueAt, before.startCueAt);
  assert.deepEqual(during.baseline, before.baseline);
  assert.equal(during.repState, "rising", "rep state kept (not reset to seated)");
}

// G7 normal run without any gap: unchanged timings (same values as fa5x-assessment-1.1 for this input)
{
  const r = run([...prep(), ...Array.from({ length: 5 }, fullRep).flat()]);
  assert.equal(r.last.result.totalDurationMs, 7326);
  assert.deepEqual(r.last.result.reps.map((x) => [x.standingMs, x.seatedMs]), [[2574, 3102], [3630, 4158], [4686, 5214], [5742, 6270], [6798, 7326]]);
  assert.equal(r.last.result.algorithmVersion, "fa5x-assessment-1.2");
}

// G8 LIMITATION (characterization, not a fix): frames that never arrive (inference error / stall)
//    are not a "received untracked frame" — a time jump between two tracked frames is NOT treated as a gap.
{
  const pre = [...prep(), ...rise(), ...stand(2)];
  const frames = [...pre, ...stand(1), ...stand(3)];
  const times = frames.map((_, i) => 1000 + STEP * (i + 1) + (i >= pre.length ? 800 : 0)); // 800 ms with no frame at all
  const r = run(frames, { times });
  assert.equal(r.snaps[pre.length].repState, "standing", "no frame received -> confirmation still continues across the 800 ms jump (known limitation)");
}

// G9 compatibility: 1.2 is its own group; 1.1 is a known, older group; history not comparable with 1.2
{
  const V11 = { algorithmVersion: "fa5x-assessment-1.1", geometryCoordinateSpace: "isotropic_image_height_units" };
  const CUR = C.FA5X_CURRENT_MEASUREMENT_FIELDS;
  assert.equal(CUR.algorithmVersion, "fa5x-assessment-1.2");
  assert.equal(C.isCurrentFa5xMeasurement(CUR), true);
  assert.deepEqual([C.isCurrentFa5xMeasurement(V11), C.getFa5xMeasurementProfile(V11).problem], [false, null], "1.1 is known but not current");
  assert.deepEqual([C.checkFa5xMeasurementCompatibility(V11, CUR).compatible, C.checkFa5xMeasurementCompatibility(V11, CUR).reason], [false, C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH]);
  assert.equal(C.checkFa5xMeasurementCompatibility(CUR, V11).compatible, false);
  assert.equal(C.checkFa5xMeasurementCompatibility(V11, V11).compatible, true, "1.1 vs 1.1 keeps its own comparability");
  assert.equal(C.checkFa5xMeasurementCompatibility(CUR, CUR).compatible, true);
}

// G10 replay: a 1.2 trace reproduces; a trace recorded by 1.1 is refused (different algorithm), never "reproduced"
{
  const frames = [...prep(), ...rise(), ...stand(2), ...gaps(1), ...stand(3), ...down(), ...seat(4), ...Array.from({ length: 4 }, fullRep).flat()];
  const rec = createFa5xTraceRecorder({ startContext: { stage: "stand" } });
  const s = createFiveTimesSitToStandAssessment();
  s.setTraceListener((e) => rec.recordFrame("assess", e, {}));
  let t = 1000;
  for (const f of frames) { t += STEP; s.processFrame(f, t); }
  rec.stop(FA5X_TRACE_END_TYPE.RUN_FINISHED);
  const trace = JSON.parse(JSON.stringify(rec.buildExport()));
  assert.equal(trace.algorithmVersion, "fa5x-assessment-1.2");
  assert.equal(replayFa5xTrace(trace).verdict, FA5X_REPLAY_VERDICT.REPRODUCED);
  const old = replayFa5xTrace({ ...trace, algorithmVersion: "fa5x-assessment-1.1" });
  assert.equal(old.verdict, FA5X_REPLAY_VERDICT.UNSUPPORTED);
  assert.ok(old.problems.some((p) => p.includes("fa5x-assessment-1.1")), "the version mismatch is stated");
}

console.log("5xSTS gap-reset (fa5x-assessment-1.2) tests passed");
