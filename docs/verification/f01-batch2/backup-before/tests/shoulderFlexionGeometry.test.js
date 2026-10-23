import assert from "node:assert/strict";
import {
  computeShoulderElevationAngle,
  computeElbowExtensionAngle,
  computeShoulderMeasurementObservation,
} from "../js/ai/exercises/shoulder/poseMath.js";

/**
 * ReMotion Phase 7.3B.2 (A01-1) — Level 2 geometry tests for the shoulder
 * flexion measurement geometry (js/ai/exercises/shoulder/poseMath.js).
 * These functions pre-date this task but had no test; A01-1 now depends on
 * them, so their contract is pinned here.
 *
 * Locked A01-1 contract: primary angle = calculateAngle(HIP, SHOULDER, ELBOW)
 * vertex SHOULDER, neutral ~= 0deg, INCREASING as the arm elevates — no
 * `180 - angle` inversion. LEFT and RIGHT are independent.
 */

const IDX = {
  LEFT: { HIP: 23, SHOULDER: 11, ELBOW: 13, WRIST: 15 },
  RIGHT: { HIP: 24, SHOULDER: 12, ELBOW: 14, WRIST: 16 },
};

function blankLandmarks() {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
}

/**
 * Mutates `lm` placing one side's HIP/SHOULDER/ELBOW/WRIST for a target
 * shoulder-elevation angle `deg` (0 = arm hanging straight down, 90 = forward
 * horizontal, 180 = straight overhead), elbow kept straight. Image coords:
 * y grows downward, so "down" is +y.
 */
function placeSide(lm, side, deg, { coreOk = true, wristOk = true, bendWrist = false } = {}) {
  const i = IDX[side];
  const S = { x: 0.5, y: 0.4 };
  const H = { x: 0.5, y: 0.7 };
  const rad = (deg * Math.PI) / 180;
  const dir = { x: Math.sin(rad), y: Math.cos(rad) }; // deg 0 => (0, 1) straight down
  const E = { x: S.x + 0.25 * dir.x, y: S.y + 0.25 * dir.y };
  // straight: colinear past the elbow. bent: displace the wrist PERPENDICULAR
  // to the upper-arm direction so the SHOULDER-ELBOW-WRIST angle really closes.
  const W = bendWrist
    ? { x: E.x + 0.2 * Math.cos(rad), y: E.y - 0.2 * Math.sin(rad) }
    : { x: S.x + 0.45 * dir.x, y: S.y + 0.45 * dir.y };
  lm[i.HIP] = { x: H.x, y: H.y, visibility: 1 };
  lm[i.SHOULDER] = { x: S.x, y: S.y, visibility: coreOk ? 1 : 0.0 };
  lm[i.ELBOW] = { x: E.x, y: E.y, visibility: 1 };
  lm[i.WRIST] = { x: W.x, y: W.y, visibility: wristOk ? 1 : 0.0 };
  return lm;
}

function poseForSide(side, deg, opts) {
  return placeSide(blankLandmarks(), side, deg, opts);
}

// ── A. primary shoulder-elevation geometry ───────────────────────────────
const neutral = computeShoulderElevationAngle(poseForSide("RIGHT", 0), "RIGHT");
const horizontal = computeShoulderElevationAngle(poseForSide("RIGHT", 90), "RIGHT");
const overhead = computeShoulderElevationAngle(poseForSide("RIGHT", 175), "RIGHT");

assert.ok(neutral <= 8, `neutral arm ~= 0deg, got ${neutral}`);
assert.ok(neutral < 90, `neutral must not be inverted (no 180-angle), got ${neutral}`);
assert.ok(Math.abs(horizontal - 90) <= 3, `forward-horizontal ~= 90deg, got ${horizontal}`);
assert.ok(overhead > 165, `overhead ~= 180deg, got ${overhead}`);

const a30 = computeShoulderElevationAngle(poseForSide("RIGHT", 30), "RIGHT");
const a60 = computeShoulderElevationAngle(poseForSide("RIGHT", 60), "RIGHT");
const a120 = computeShoulderElevationAngle(poseForSide("RIGHT", 120), "RIGHT");
assert.ok(neutral < a30 && a30 < a60 && a60 < horizontal && horizontal < a120 && a120 < overhead, "angle increases monotonically with elevation");

// exact parametric identity (guards against any hidden offset / inversion)
assert.ok(Math.abs(a60 - 60) <= 1.5, `parametric 60deg -> ${a60}`);

// ── B. LEFT / RIGHT are independent, correct ipsilateral landmarks ───────
const mixed = blankLandmarks();
placeSide(mixed, "RIGHT", 170);
placeSide(mixed, "LEFT", 5);
const rightHigh = computeShoulderElevationAngle(mixed, "RIGHT");
const leftLow = computeShoulderElevationAngle(mixed, "LEFT");
assert.ok(rightHigh > 160, `RIGHT high, got ${rightHigh}`);
assert.ok(leftLow < 15, `LEFT low, got ${leftLow}`);

// moving ONLY the left-side landmarks must not change the right-side angle
placeSide(mixed, "LEFT", 170);
assert.equal(computeShoulderElevationAngle(mixed, "RIGHT"), rightHigh, "LEFT change must not affect RIGHT angle");

// corrupting the contralateral side's landmarks must not break this side
const rc = poseForSide("RIGHT", 150);
rc[IDX.LEFT.ELBOW] = { x: 0.5, y: 0.5, visibility: 0 };
assert.ok(computeShoulderElevationAngle(rc, "RIGHT") > 140, "RIGHT angle survives a bad LEFT_ELBOW");

// missing an ipsilateral CORE landmark => null (never NaN, never a guess)
const rMissingHip = poseForSide("RIGHT", 150);
rMissingHip[IDX.RIGHT.HIP] = { x: 0.5, y: 0.7, visibility: 0 };
assert.equal(computeShoulderElevationAngle(rMissingHip, "RIGHT"), null, "missing RIGHT_HIP => null primary angle");
assert.ok(computeShoulderElevationAngle(rMissingHip, "LEFT") == null || typeof computeShoulderElevationAngle(rMissingHip, "LEFT") === "number");

// ── C. observation adapter: core vs validity separation ─────────────────
const fullObs = computeShoulderMeasurementObservation(poseForSide("RIGHT", 110), "RIGHT");
assert.equal(fullObs.coreAngleAvailable, true);
assert.ok(Math.abs(fullObs.shoulderElevationAngle - 110) <= 2);
assert.equal(fullObs.elbowValidityObservable, true);
assert.ok(fullObs.elbowExtensionAngle > 170, `straight elbow ~180, got ${fullObs.elbowExtensionAngle}`);

// missing WRIST only: primary ROM UNAFFECTED, elbow validity lost
const noWristObs = computeShoulderMeasurementObservation(poseForSide("RIGHT", 110, { wristOk: false }), "RIGHT");
assert.equal(noWristObs.coreAngleAvailable, true, "losing WRIST must not disable the primary HIP-SHOULDER-ELBOW angle");
assert.equal(noWristObs.shoulderElevationAngle, fullObs.shoulderElevationAngle, "primary angle identical with/without WRIST");
assert.equal(noWristObs.elbowValidityObservable, false);
assert.equal(noWristObs.elbowExtensionAngle, null);

// missing a CORE landmark: primary angle unavailable
const noCoreObs = computeShoulderMeasurementObservation(poseForSide("RIGHT", 110, { coreOk: false }), "RIGHT");
assert.equal(noCoreObs.coreAngleAvailable, false);
assert.equal(noCoreObs.shoulderElevationAngle, null);

// elbow observation is genuinely independent of the shoulder ROM
const straight = computeShoulderMeasurementObservation(poseForSide("RIGHT", 90), "RIGHT");
const bent = computeShoulderMeasurementObservation(poseForSide("RIGHT", 90, { bendWrist: true }), "RIGHT");
assert.equal(bent.shoulderElevationAngle, straight.shoulderElevationAngle, "bending the elbow must not move the shoulder ROM");
assert.ok(bent.elbowExtensionAngle < straight.elbowExtensionAngle - 15, "bent elbow reads a smaller SHOULDER-ELBOW-WRIST angle");

// unknown side fails safe (all null), never resolves to a guessed side
const badSide = computeShoulderMeasurementObservation(poseForSide("RIGHT", 90), "MIDDLE");
assert.equal(badSide.coreAngleAvailable, false);
assert.equal(badSide.shoulderElevationAngle, null);
assert.equal(badSide.elbowExtensionAngle, null);

console.log("A01-1 shoulder flexion geometry tests passed");
