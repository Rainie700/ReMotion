import assert from "node:assert/strict";
import {
  computeShoulderElevationAngle,
  computeShoulderLateralOffsetRatio,
  computeShoulderMeasurementObservation,
} from "../js/ai/exercises/shoulder/poseMath.js";

/**
 * ReMotion Phase 7.3B.2 (A01-2) — Level 2 FRONT-VIEW geometry tests for
 * shoulder abduction.
 *
 * Contract: the primary progress angle is the SAME calculateAngle(HIP,
 * SHOULDER, ELBOW) as flexion (neutral ~= 0deg, rising on elevation, no
 * `180 - angle`); the camera view is what makes it frontal-plane. The
 * abduction-specific signal is computeShoulderLateralOffsetRatio() — a raw
 * "arm moved outward" measure that is NON-monotonic toward overhead.
 */

const IDX = {
  LEFT: { HIP: 23, SHOULDER: 11, ELBOW: 13, WRIST: 15 },
  RIGHT: { HIP: 24, SHOULDER: 12, ELBOW: 14, WRIST: 16 },
};

function blankLandmarks() {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
}

/**
 * Front view: `deg` is frontal-plane elevation (0 = arm at side, 90 = arm
 * straight out to the side, 180 = overhead). The elbow travels laterally
 * (image-x) then up, exactly the abduction path.
 */
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

// ── A. primary elevation angle works the same in a front-view pose ──────
const neutral = computeShoulderElevationAngle(poseForSide("RIGHT", 0), "RIGHT");
const tpose = computeShoulderElevationAngle(poseForSide("RIGHT", 90), "RIGHT");
const overhead = computeShoulderElevationAngle(poseForSide("RIGHT", 175), "RIGHT");
assert.ok(neutral <= 8 && neutral < 90, `neutral ~0deg, not inverted, got ${neutral}`);
assert.ok(Math.abs(tpose - 90) <= 3, `arm-to-the-side ~90deg, got ${tpose}`);
assert.ok(overhead > 165, `overhead ~180deg, got ${overhead}`);
const a30 = computeShoulderElevationAngle(poseForSide("RIGHT", 30), "RIGHT");
const a120 = computeShoulderElevationAngle(poseForSide("RIGHT", 120), "RIGHT");
assert.ok(neutral < a30 && a30 < tpose && tpose < a120 && a120 < overhead, "monotonic with elevation");

// ── B. lateral-offset ratio: ~0 at neutral, rises, then FALLS toward overhead ─
const latNeutral = computeShoulderLateralOffsetRatio(poseForSide("RIGHT", 3), "RIGHT");
const lat45 = computeShoulderLateralOffsetRatio(poseForSide("RIGHT", 45), "RIGHT");
const lat90 = computeShoulderLateralOffsetRatio(poseForSide("RIGHT", 90), "RIGHT");
const lat150 = computeShoulderLateralOffsetRatio(poseForSide("RIGHT", 150), "RIGHT");
assert.ok(latNeutral < 0.08, `neutral lateral ratio ~0, got ${latNeutral}`);
assert.ok(lat45 > latNeutral && lat90 > lat45, "lateral ratio rises through mid-abduction");
assert.ok(lat150 < lat90, `lateral ratio DECREASES toward overhead (non-monotonic): 90->${lat90.toFixed(3)} 150->${lat150.toFixed(3)}`);

// null (never NaN) when a needed point is unreliable
const noCore = poseForSide("RIGHT", 90);
noCore[IDX.RIGHT.HIP] = { x: 0.5, y: 0.7, visibility: 0 };
assert.equal(computeShoulderLateralOffsetRatio(noCore, "RIGHT"), null, "missing HIP -> null lateral ratio (torso scale unavailable)");
assert.equal(computeShoulderLateralOffsetRatio(poseForSide("RIGHT", 90), "MIDDLE"), null, "unknown side -> null");

// ── C. LEFT / RIGHT independent for both measures ──────────────────────
const mixed = blankLandmarks();
placeSide(mixed, "RIGHT", 95);
placeSide(mixed, "LEFT", 4);
const rElev = computeShoulderElevationAngle(mixed, "RIGHT");
const rLat = computeShoulderLateralOffsetRatio(mixed, "RIGHT");
assert.ok(rElev > 80 && computeShoulderElevationAngle(mixed, "LEFT") < 15);
assert.ok(rLat > 0.3 && computeShoulderLateralOffsetRatio(mixed, "LEFT") < 0.1);
placeSide(mixed, "LEFT", 150); // move ONLY the left arm
assert.equal(computeShoulderElevationAngle(mixed, "RIGHT"), rElev, "LEFT change must not affect RIGHT elevation");
assert.equal(computeShoulderLateralOffsetRatio(mixed, "RIGHT"), rLat, "LEFT change must not affect RIGHT lateral ratio");

// ── D. observation adapter still intact in a front-view pose ───────────
const obs = computeShoulderMeasurementObservation(poseForSide("RIGHT", 100), "RIGHT");
assert.equal(obs.coreAngleAvailable, true);
assert.ok(Math.abs(obs.shoulderElevationAngle - 100) <= 2);
assert.equal(obs.elbowValidityObservable, true);
const obsNoWrist = computeShoulderMeasurementObservation(poseForSide("RIGHT", 100, { wristOk: false }), "RIGHT");
assert.equal(obsNoWrist.coreAngleAvailable, true, "losing WRIST must not disable the primary angle");
assert.equal(obsNoWrist.shoulderElevationAngle, obs.shoulderElevationAngle);

console.log("A01-2 shoulder abduction geometry tests passed");
