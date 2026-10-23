import assert from "node:assert/strict";
import { createShoulderAbductionMeasurement, SHOULDER_ABDUCTION_MOTION_HEURISTICS } from "../js/ai/exercises/shoulder/abductionMovement.js";
import { createShoulderFlexionMeasurement } from "../js/ai/exercises/shoulder/flexionMovement.js";
import { createShoulderMeasurementSession, SHOULDER_MEASUREMENT_PHASE } from "../js/ai/exercises/shoulder/measurementSession.js";

/**
 * ReMotion Phase 7.3B.2 (A01-2) — Level 2 tests for the FRONT-VIEW abduction
 * adapter + the EXISTING measurement lifecycle FSM, with synthetic
 * front-view landmark frames.
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

function runSequence(side, steps, frameOpts = {}) {
  const meas = createShoulderAbductionMeasurement({ side });
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
    const r = fsm.processFrame({ timestamp: t, bodyReady, signal });
    if (r.changed) phases.push(r.phase);
  }
  return { meas, fsm, phases };
}

const NEUTRAL = [3, 3, 3, 3, 3, 3];
const RAMP_UP = [10, 18, 35, 60, 85, 110, 120];
const HOLD_TOP = [120, 120, 120, 120, 120, 120, 120, 120];
const RETURN = [105, 85, 55, 25];
const NEAR_NEUTRAL = [6, 6, 6, 6, 6, 6, 6];

// ── A. full front-view lifecycle → real FSM advances in order ───────────
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
    "FSM lifecycle order for abduction"
  );
  const res = meas.getResult();
  assert.equal(res.side, "RIGHT");
  assert.equal(res.status, "completed");
  assert.equal(res.completed, true);
  assert.ok(res.peakROM.deg >= 118 && res.peakROM.deg <= 122, `abduction peakROM retained ~120deg, got ${res.peakROM.deg}`);
  assert.equal(res.measurementQuality.valid, true);
  // abduction-specific raw direction observation is populated and non-monotonic
  const dir = res.observations.abductionDirection;
  assert.equal(dir.available, true);
  assert.ok(dir.atPeakLateralRatio != null && dir.maxLateralRatioDuringMovement != null);
  assert.ok(dir.maxLateralRatioDuringMovement >= dir.atPeakLateralRatio - 1e-9,
    `max lateral ratio (mid-abduction) >= lateral ratio at the elevation peak: max=${dir.maxLateralRatioDuringMovement.toFixed(3)} atPeak=${dir.atPeakLateralRatio.toFixed(3)}`);
  // measurement, not finding
  assert.equal("abnormal" in res, false);
  assert.equal("limited" in res, false);
}

// ── B. abduction is NOT a blind copy of flexion: front-view direction ──
// data is recorded, and the start is corroborated by real outward motion.
// (In a clean 2D frontal projection lateral offset is a strict function of
// the elevation angle, so the two adapters' START timing coincides there;
// the meaningful, testable difference is the recorded abductionDirection
// block + view-specific result, not a divergent start threshold.)
{
  const seq = [...NEUTRAL, ...RAMP_UP, ...HOLD_TOP, ...RETURN, ...NEAR_NEUTRAL];
  const abd = runSequence("RIGHT", seq).meas.getResult();
  // a flexion adapter fed the identical frames:
  const flx = createShoulderFlexionMeasurement({ side: "RIGHT" });
  let t = 0;
  for (const d of seq) {
    t += 100;
    flx.processFrame({ timestamp: t, landmarks: poseForSide("RIGHT", d), bodyReady: true });
  }
  const flxRes = flx.getResult();

  assert.equal(abd.observations.abductionDirection.available, true, "abduction result carries the front-view direction block");
  assert.equal(abd.observations.abductionDirection.startCorroboratedByOutwardMotion, true, "abduction start was corroborated by real outward motion");
  assert.ok(abd.observations.abductionDirection.neutralLateralRatio < 0.1);
  assert.ok(abd.observations.abductionDirection.maxLateralRatioDuringMovement > 0.5);
  assert.equal(flxRes.observations.abductionDirection, undefined, "flexion result has no abductionDirection block");
  // both still measure the same primary elevation peak from the same frames
  assert.ok(Math.abs(abd.peakROM.deg - flxRes.peakROM.deg) < 1e-6, "same primary elevation peak from identical frames");
}

// ── C. strong-elevation fallback: a big committed raise starts anyway ───
{
  const { phases } = runSequence("RIGHT", [3, 3, 3, 3, 32, 40, 40, 40, 40, 40, 40, 20, 6, 6, 6, 6, 6]);
  assert.equal(phases[0], SHOULDER_MEASUREMENT_PHASE.MOVEMENT_IN_PROGRESS, "an unambiguous raise cannot hard-stall");
}

// ── D. invalid (core-missing) frames never become a valid measurement ──
{
  const { meas, phases } = runSequence("LEFT", Array.from({ length: 40 }, () => ({ deg: 80, coreOk: false })));
  assert.deepEqual(phases, []);
  const res = meas.getResult();
  assert.equal(res.status, "invalid");
  assert.equal(res.peakROM.deg, null);
  assert.equal(res.measurementQuality.valid, false);
}

// ── E. missing WRIST throughout: primary ROM still measured ────────────
{
  const { meas, phases } = runSequence(
    "RIGHT",
    [...NEUTRAL, ...RAMP_UP, ...HOLD_TOP, ...RETURN, ...NEAR_NEUTRAL],
    { wristOk: false }
  );
  assert.ok(phases.includes(SHOULDER_MEASUREMENT_PHASE.ATTEMPT_COMPLETE));
  const res = meas.getResult();
  assert.ok(res.peakROM.deg >= 118 && res.peakROM.deg <= 122, `peakROM unaffected by missing WRIST, got ${res.peakROM.deg}`);
  assert.equal(res.observations.elbowFlexion.available, false);
  assert.equal(res.observations.abductionDirection.available, true, "lateral direction still observable without WRIST");
}

// ── F. LEFT and RIGHT are fully independent ────────────────────────────
{
  const rightM = createShoulderAbductionMeasurement({ side: "RIGHT" });
  const leftM = createShoulderAbductionMeasurement({ side: "LEFT" });
  let t = 0;
  for (const deg of [...NEUTRAL, ...RAMP_UP, ...HOLD_TOP, ...RETURN, ...NEAR_NEUTRAL]) {
    t += 100;
    const lm = blankLandmarks();
    placeSide(lm, "RIGHT", deg); // right arm abducts
    placeSide(lm, "LEFT", 4); // left arm at rest
    rightM.processFrame({ timestamp: t, landmarks: lm, bodyReady: true });
    leftM.processFrame({ timestamp: t, landmarks: lm, bodyReady: true });
  }
  assert.equal(rightM.getResult().status, "completed");
  assert.ok(rightM.getResult().peakROM.deg >= 118 && rightM.getResult().peakROM.deg <= 122);
  const leftRes = leftM.getResult();
  assert.notEqual(leftRes.status, "completed");
  assert.equal(leftRes.peakROM.deg, null);
}

// ── G. skip / stop and tracking-loss states ───────────────────────────
{
  const meas = createShoulderAbductionMeasurement({ side: "RIGHT" });
  let t = 0;
  for (const d of [...NEUTRAL, 22, 45, 75]) {
    t += 100;
    meas.processFrame({ timestamp: t, landmarks: poseForSide("RIGHT", d), bodyReady: true });
  }
  meas.markStopped("userStopped", t + 100);
  const res = meas.getResult();
  assert.equal(res.status, "stopped");
  assert.equal(res.statusReason, "userStopped");
  assert.ok(res.peakROM.deg >= 72 && res.peakROM.deg <= 78, `stopped peak ~75deg, got ${res.peakROM.deg}`);

  const m2 = createShoulderAbductionMeasurement({ side: "RIGHT" });
  let t2 = 0;
  for (const d of [...NEUTRAL, 22, 45, 75]) {
    t2 += 100;
    m2.processFrame({ timestamp: t2, landmarks: poseForSide("RIGHT", d), bodyReady: true });
  }
  for (let k = 0; k < 3; k += 1) {
    t2 += 100;
    m2.processFrame({ timestamp: t2, landmarks: null, bodyReady: false });
  }
  const r2 = m2.getResult();
  assert.equal(r2.measurementQuality.hadTrackingLoss, true);
  assert.notEqual(r2.status, "completed");
}

// ── H. resting arm never false-starts ─────────────────────────────────
{
  const meas = createShoulderAbductionMeasurement({ side: "LEFT" });
  let t = 0;
  let started = false;
  for (let k = 0; k < 20; k += 1) {
    t += 100;
    if (meas.processFrame({ timestamp: t, landmarks: poseForSide("LEFT", 4), bodyReady: true }).signal) started = true;
  }
  assert.equal(started, false);
  assert.ok(meas.getResult().neutralBaselineDeg != null && meas.getResult().neutralBaselineDeg < 12);
}

assert.ok(SHOULDER_ABDUCTION_MOTION_HEURISTICS.LATERAL_START_MIN_RATIO_DELTA > 0, "abduction heuristics export present");

console.log("A01-2 shoulder abduction measurement tests passed");
