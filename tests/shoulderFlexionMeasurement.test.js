import assert from "node:assert/strict";
import { createShoulderFlexionMeasurement, SHOULDER_FLEXION_MOTION_HEURISTICS } from "../js/ai/exercises/shoulder/flexionMovement.js";
import { createShoulderMeasurementSession, SHOULDER_MEASUREMENT_PHASE } from "../js/ai/exercises/shoulder/measurementSession.js";

/**
 * ReMotion Phase 7.3B.2 (A01-1) — Level 2 tests for the real
 * landmarks -> observation -> SIGNAL adapter + per-side result accumulator,
 * driven through the EXISTING measurement lifecycle FSM with synthetic
 * side-view landmark frames.
 */

const IDX = {
  LEFT: { HIP: 23, SHOULDER: 11, ELBOW: 13, WRIST: 15 },
  RIGHT: { HIP: 24, SHOULDER: 12, ELBOW: 14, WRIST: 16 },
};

function blankLandmarks() {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
}

function placeSide(lm, side, deg, { coreOk = true, wristOk = true } = {}) {
  const i = IDX[side];
  const S = { x: 0.5, y: 0.4 };
  const H = { x: 0.5, y: 0.7 };
  const rad = (deg * Math.PI) / 180;
  const dir = { x: Math.sin(rad), y: Math.cos(rad) };
  lm[i.HIP] = { x: H.x, y: H.y, visibility: 1 };
  lm[i.SHOULDER] = { x: S.x, y: S.y, visibility: coreOk ? 1 : 0.0 };
  lm[i.ELBOW] = { x: S.x + 0.25 * dir.x, y: S.y + 0.25 * dir.y, visibility: 1 };
  lm[i.WRIST] = { x: S.x + 0.45 * dir.x, y: S.y + 0.45 * dir.y, visibility: wristOk ? 1 : 0.0 };
  return lm;
}

function poseForSide(side, deg, opts) {
  return placeSide(blankLandmarks(), side, deg, opts);
}

/** Drives one adapter + one FSM together; returns the ordered list of FSM phase transitions. */
function runSequence(side, steps, frameOpts = {}) {
  const meas = createShoulderFlexionMeasurement({ side });
  const fsm = createShoulderMeasurementSession();
  let t = 0;
  fsm.start(t);
  const phases = [];
  for (const stepDef of steps) {
    const deg = typeof stepDef === "number" ? stepDef : stepDef.deg;
    const opts = typeof stepDef === "number" ? frameOpts : { ...frameOpts, ...stepDef };
    t += 100;
    const bodyReady = opts.bodyReady !== undefined ? opts.bodyReady : true;
    const landmarks = deg == null ? null : poseForSide(side, deg, opts);
    const { signal } = meas.processFrame({ timestamp: t, landmarks, bodyReady });
    if (bodyReady) assert.ok(signal == null || typeof signal === "string");
    const r = fsm.processFrame({ timestamp: t, bodyReady, signal });
    if (r.changed) phases.push(r.phase);
  }
  return { meas, fsm, phases };
}

const NEUTRAL = [3, 3, 3, 3, 3, 3];
const RAMP_UP = [10, 25, 45, 70, 95, 115, 125];
const HOLD_TOP = [125, 125, 125, 125, 125, 125, 125, 125];
const RETURN = [110, 90, 60, 30];
const NEAR_NEUTRAL = [6, 6, 6, 6, 6, 6, 6];

// ── A. full lifecycle → real FSM advances in order, peakROM retained ─────
{
  const { meas, phases } = runSequence("RIGHT", [...NEUTRAL, ...RAMP_UP, ...HOLD_TOP, ...RETURN, ...NEAR_NEUTRAL]);
  assert.deepEqual(
    phases,
    [
      SHOULDER_MEASUREMENT_PHASE.MOVEMENT_IN_PROGRESS,
      SHOULDER_MEASUREMENT_PHASE.ENDPOINT_HOLD,
      SHOULDER_MEASUREMENT_PHASE.RETURNING,
      SHOULDER_MEASUREMENT_PHASE.ATTEMPT_COMPLETE,
    ],
    "FSM lifecycle order: waiting -> movement -> endpoint -> returning -> complete"
  );
  const res = meas.getResult();
  assert.equal(res.side, "RIGHT");
  assert.equal(res.status, "completed");
  assert.equal(res.completed, true);
  assert.ok(res.peakROM.deg >= 124 && res.peakROM.deg <= 126, `peakROM retained ~125deg, got ${res.peakROM.deg}`);
  assert.ok(res.neutralBaselineDeg != null && res.neutralBaselineDeg < 12, `neutral baseline seeded low, got ${res.neutralBaselineDeg}`);
  assert.ok(res.peakROM.fromNeutralDeg > 110);
  assert.equal(res.measurementQuality.valid, true);
  assert.equal(res.measurementQuality.coreAvailableFrameRatio, 1);
  assert.ok(["high", "medium"].includes(res.measurementQuality.confidence));
  assert.equal(res.observations.elbowFlexion.available, true);
  assert.ok(res.observations.elbowFlexion.atPeakExtensionDeg > 170, "peak-frame elbow ~straight");
  // measurement, NOT finding: no verdict fields anywhere
  assert.equal("normal" in res, false);
  assert.equal("abnormal" in res, false);
  assert.equal("limited" in res, false);
}

// ── B. invalid (core-missing) frames never become a valid measurement ───
{
  const { meas, phases } = runSequence("LEFT", Array.from({ length: 40 }, () => ({ deg: 80, coreOk: false })));
  assert.deepEqual(phases, [], "no lifecycle transition from core-unavailable frames");
  const res = meas.getResult();
  assert.equal(res.status, "invalid");
  assert.equal(res.peakROM.deg, null, "no fabricated peak from invalid data");
  assert.equal(res.measurementQuality.valid, false);
}

// ── C. missing WRIST throughout: primary ROM still measured, elbow obs null ─
{
  const { meas, phases } = runSequence(
    "RIGHT",
    [...NEUTRAL, ...RAMP_UP, ...HOLD_TOP, ...RETURN, ...NEAR_NEUTRAL],
    { wristOk: false }
  );
  assert.ok(phases.includes(SHOULDER_MEASUREMENT_PHASE.ATTEMPT_COMPLETE), "still completes without WRIST");
  const res = meas.getResult();
  assert.equal(res.status, "completed");
  assert.ok(res.peakROM.deg >= 124 && res.peakROM.deg <= 126, `peakROM unaffected by missing WRIST, got ${res.peakROM.deg}`);
  assert.equal(res.peakROM.elbowExtensionAngleAtPeakDeg, null);
  assert.equal(res.observations.elbowFlexion.available, false);
}

// ── D. LEFT and RIGHT are fully independent ─────────────────────────────
{
  const rightM = createShoulderFlexionMeasurement({ side: "RIGHT" });
  const leftM = createShoulderFlexionMeasurement({ side: "LEFT" });
  let t = 0;
  for (const deg of [...NEUTRAL, ...RAMP_UP, ...HOLD_TOP, ...RETURN, ...NEAR_NEUTRAL]) {
    t += 100;
    const lm = blankLandmarks();
    placeSide(lm, "RIGHT", deg); // right arm moves through the full rep
    placeSide(lm, "LEFT", 4); // left arm stays at rest the whole time
    rightM.processFrame({ timestamp: t, landmarks: lm, bodyReady: true });
    leftM.processFrame({ timestamp: t, landmarks: lm, bodyReady: true });
  }
  assert.equal(rightM.getResult().status, "completed");
  assert.ok(rightM.getResult().peakROM.deg >= 124 && rightM.getResult().peakROM.deg <= 126);
  const leftRes = leftM.getResult();
  assert.notEqual(leftRes.status, "completed", "resting LEFT side never completes off the RIGHT side's motion");
  assert.equal(leftRes.peakROM.deg, null, "resting LEFT side records no peak");
}

// ── E. fast rep: endpoint reached via a large drop (no still-hold) ──────
{
  const { meas, phases } = runSequence("RIGHT", [...NEUTRAL, 25, 55, 100, 55, 55, 30, ...NEAR_NEUTRAL]);
  assert.ok(phases.includes(SHOULDER_MEASUREMENT_PHASE.ENDPOINT_HOLD), "endpoint still detected on a fast rep");
  assert.ok(phases.includes(SHOULDER_MEASUREMENT_PHASE.RETURNING));
  assert.ok(phases.includes(SHOULDER_MEASUREMENT_PHASE.ATTEMPT_COMPLETE));
  assert.ok(Math.abs(meas.getResult().peakROM.deg - 100) <= 2, `fast-rep peak ~100deg, got ${meas.getResult().peakROM.deg}`);
}

// ── F. human "skip this side" → status "stopped" with the peak so far ───
{
  const meas = createShoulderFlexionMeasurement({ side: "RIGHT" });
  let t = 0;
  for (const d of [...NEUTRAL, 30, 55, 80]) {
    t += 100;
    meas.processFrame({ timestamp: t, landmarks: poseForSide("RIGHT", d), bodyReady: true });
  }
  meas.markStopped("userStopped", t + 100);
  const res = meas.getResult();
  assert.equal(res.status, "stopped");
  assert.equal(res.statusReason, "userStopped");
  assert.ok(res.peakROM.deg >= 78 && res.peakROM.deg <= 82, `stopped peak ~80deg, got ${res.peakROM.deg}`);
  assert.equal(res.completed, false);
}

// ── G. resting arm never false-starts; baseline still seeded low ────────
{
  const meas = createShoulderFlexionMeasurement({ side: "LEFT" });
  let t = 0;
  let started = false;
  for (let k = 0; k < 20; k += 1) {
    t += 100;
    const { signal } = meas.processFrame({ timestamp: t, landmarks: poseForSide("LEFT", 4), bodyReady: true });
    if (signal) started = true;
  }
  assert.equal(started, false, "a resting arm must not emit MOVEMENT_DETECTED");
  const res = meas.getResult();
  assert.ok(res.neutralBaselineDeg != null && res.neutralBaselineDeg < 12);
}

// ── H. tracking loss mid-attempt invalidates the in-progress attempt ────
{
  const meas = createShoulderFlexionMeasurement({ side: "RIGHT" });
  let t = 0;
  for (const d of [...NEUTRAL, 25, 55, 85]) {
    t += 100;
    meas.processFrame({ timestamp: t, landmarks: poseForSide("RIGHT", d), bodyReady: true });
  }
  for (let k = 0; k < 3; k += 1) {
    t += 100;
    meas.processFrame({ timestamp: t, landmarks: null, bodyReady: false });
  }
  const res = meas.getResult();
  assert.equal(res.measurementQuality.hadTrackingLoss, true);
  assert.notEqual(res.status, "completed", "an attempt interrupted by tracking loss cannot complete");
}

assert.ok(SHOULDER_FLEXION_MOTION_HEURISTICS.MOVEMENT_START_DELTA_DEG > 0, "engineering heuristics export present");

console.log("A01-1 shoulder flexion measurement tests passed");
