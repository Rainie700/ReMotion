// 5xSTS tracking-gap confirmation — reproduction + before/after comparison harness (synthetic input only).
// Runs the SAME fixed frame sequences through the session module found at SESSION_PATH and prints, per
// scenario, the per-frame decision state (via the session's own trace listener) and a result summary.
//   SESSION_PATH=<file:///…/assessmentSession.js> node gapScenarios.mjs > out.json
// Synthetic feature frames, not real-person data — this shows decision behaviour, not accuracy.
const SESSION_PATH = process.env.SESSION_PATH;
const { createFiveTimesSitToStandAssessment } = await import(SESSION_PATH);

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
const prep = () => Array.from({ length: 150 }, () => feat(0));           // seated check + ready + countdown -> RUNNING
const rise = () => [0.15, 0.3, 0.45, 0.6].map((d) => feat(d));             // RISING, below the standing threshold
const stand = (n) => Array.from({ length: n }, () => feat(0.9, { knee: 176 }));
const down = () => [0.75, 0.55, 0.4, 0.25].map((d) => feat(d));           // DESCENDING, above the seated threshold
const seat = (n) => Array.from({ length: n }, () => feat(0));
const gaps = (n) => Array.from({ length: n }, () => GAP);
const fullRep = () => [...rise(), ...stand(4), ...down(), ...seat(4)];

const SCENARIOS = {
  // the requested minimal case: 2 qualifying standing frames -> 1 untracked -> 1 qualifying frame
  S1_stand_2_gap_1: [...prep(), ...rise(), ...stand(2), ...gaps(1), ...stand(1), ...stand(3), ...down(), ...seat(4)],
  // same pattern for the seated confirmation
  S2_seat_2_gap_1: [...prep(), ...rise(), ...stand(4), ...down(), ...seat(2), ...gaps(1), ...seat(1), ...seat(3)],
  // repeated short gaps while standing: ok, gap, ok, gap, ok, gap, ok ... then sit down
  S3_repeated_short_gaps: [...prep(), ...rise(), ...[0, 1, 2, 3, 4].flatMap(() => [...stand(1), ...gaps(1)]), ...down(), ...seat(4)],
  // gap longer than the existing limit (1200 ms = 19 frames x 66 ms) while rising
  S4_gap_over_limit: [...prep(), ...rise(), ...stand(2), ...gaps(20), ...stand(4)],
  // normal run, no gap at all: five reps
  S5_no_gap_five_reps: [...prep(), ...Array.from({ length: 5 }, fullRep).flat()],
  // five reps where the 5th seated confirmation straddles a gap (affects the total time)
  S6_gap_in_fifth_seat: [...prep(), ...Array.from({ length: 4 }, fullRep).flat(), ...rise(), ...stand(4), ...down(), ...seat(2), ...gaps(1), ...seat(4)],
  // gap while rising BEFORE any standing frame (nothing to clear): should behave the same
  S7_gap_before_confirm: [...prep(), ...rise(), ...gaps(2), ...stand(4), ...down(), ...seat(4)],
};

const out = {};
for (const [name, frames] of Object.entries(SCENARIOS)) {
  const s = createFiveTimesSitToStandAssessment();
  const trace = [];
  s.setTraceListener((e) => {
    if (e.before && (e.before.phase === "running" || e.after.phase === "running" || e.after.phase === "finished")) {
      trace.push({ i: trace.length, t: e.t, tracked: e.features ? e.features.tracked : null, step: e.diag && e.diag.step, repState: e.after.repState, standConfirm: e.after.standConfirm, seatConfirm: e.after.seatConfirm, reps: e.after.completedReps, events: e.events.map((x) => x.type).filter((x) => x !== "prompt" && x !== "phase") });
    }
  });
  let t = 1000, snap = null;
  for (const f of frames) { t += STEP; snap = s.processFrame(f, t); }
  const r = snap.result;
  out[name] = {
    final: { phase: snap.phase, repState: snap.repState, completedReps: snap.completedReps, startCueAt: snap.startCueAt, baselineHipY: snap.baseline && snap.baseline.hipY },
    result: r ? { status: r.status, completedReps: r.completedReps, totalDurationMs: r.totalDurationMs, invalidReason: r.invalidReason, failureReason: r.failureReason, algorithmVersion: r.algorithmVersion,
      reps: r.reps.map((x) => ({ n: x.repNumber, riseOnsetMs: x.riseOnsetMs, standingMs: x.standingMs, seatedMs: x.seatedMs })), rejected: r.rejectedAttempts.map((x) => x.reason), trackingLossCount: r.trackingLossCount } : null,
    rejectedSoFar: snap.lastRejection ? snap.lastRejection.reason : null,
    runningFrames: trace,
  };
}
console.log(JSON.stringify(out, null, 1));
