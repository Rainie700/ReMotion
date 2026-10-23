import { POSE_LANDMARK_INDEX } from "../../squatConstants.js";
import { computeSitToStandMetrics } from "./poseMath.js";
import { FA5X_PARAMS, FA5X_FRAME_ASPECT_TOLERANCE } from "./assessmentConstants.js";

/**
 * F01-A01 5xSTS Assessment Mode — per-frame feature extraction (pure).
 *
 * Implements the three Excel observable_features (sheet F01, B29):
 *   1. knee angle (hip-knee-ankle) — reused from the shared
 *      computeSitToStandMetrics(), unchanged;
 *   2. trunk lean (shoulder-hip line vs vertical) — same shared function;
 *   3. hip y — the raw input for the seated-baseline displacement computed
 *      by the assessment session.
 *
 * `shankLength` (knee-to-ankle distance, averaged over both legs) is only the
 * SCALE used to express hip displacement independent of camera distance. The
 * spec leaves the normalization method undefined (「像素/比例閾值」), so this
 * is an engineering choice; it is fixed once at baseline time, never used as a
 * posture feature on its own.
 *
 * Coordinate scale (fa5x-assessment-1.1). MediaPipe landmarks are normalized
 * per axis (x / videoWidth, y / videoHeight), so on a non-square frame one
 * x unit and one y unit are different physical lengths. Two coordinate uses
 * are kept apart:
 *   - GEOMETRY (knee angle, trunk lean, shank length) uses isotropic
 *     "image-height units": x * (frameWidth / frameHeight), y unchanged —
 *     the same as pixels / frameHeight on both axes. Angles and lengths
 *     therefore do not depend on the frame's aspect ratio.
 *   - FRAMING (hipY, shoulderY, topY, bottomY, bodyHeight) stays in the raw
 *     normalized y that the edge-margin / body-height checks expect.
 * Because image-height units ARE normalized-y units, hip displacement
 * (Δ normalized y) / shankLength and the standing-headroom check
 * (shoulderY − k·shankLength) are same-scale with no further conversion.
 * Without a valid frame size no geometry is measured (never assumed square).
 */

const L = POSE_LANDMARK_INDEX;

function reliable(p, minVis) {
  if (!p) return false;
  const v = p.visibility != null ? p.visibility : p.presence;
  return v == null || v >= minVis;
}

function pairOk(landmarks, a, b, minVis) {
  return reliable(landmarks[a], minVis) && reliable(landmarks[b], minVis);
}

function avg(a, b) {
  return (a + b) / 2;
}

/** frameWidth / frameHeight, or null when either is missing, non-finite or <= 0. */
export function fa5xFrameAspect(frameWidth, frameHeight) {
  if (!Number.isFinite(frameWidth) || !Number.isFinite(frameHeight) || frameWidth <= 0 || frameHeight <= 0) return null;
  return frameWidth / frameHeight;
}

/**
 * True when both sizes are valid and their aspect ratios (and so possibly the
 * orientation) differ beyond FA5X_FRAME_ASPECT_TOLERANCE. An unknown size is
 * not a change (frames without a size are already untracked). An equal-aspect
 * resolution change is not a change: normalized coordinates are unaffected.
 * `a` / `b` = { frameWidth, frameHeight } (features, a baseline, ...).
 */
export function fa5xFrameAspectChanged(a, b, tolerance = FA5X_FRAME_ASPECT_TOLERANCE) {
  const ra = a ? fa5xFrameAspect(a.frameWidth, a.frameHeight) : null;
  const rb = b ? fa5xFrameAspect(b.frameWidth, b.frameHeight) : null;
  if (ra == null || rb == null) return false;
  return Math.abs(ra - rb) / Math.min(ra, rb) > tolerance;
}

/**
 * `frame` = the size of the image the landmarks were detected on (the video's
 * videoWidth / videoHeight). Without a valid size the frame is reported as not
 * tracked (`frameSizeValid: false`) and no geometry is returned.
 *
 * @returns {{
 *   tracked: boolean, missing: {shoulders:boolean,hips:boolean,knees:boolean,ankles:boolean},
 *   frameSizeValid: boolean, frameWidth: number|null, frameHeight: number|null,
 *   hipY: number|null, shoulderY: number|null, shankLength: number|null,
 *   kneeAngle: number|null, trunkLeanDeg: number|null,
 *   topY: number|null, bottomY: number|null, bodyHeight: number|null
 * }}
 */
export function extractFa5xFeatures(landmarks, params = FA5X_PARAMS, { frameWidth = null, frameHeight = null } = {}) {
  const v = params.MIN_VISIBILITY;
  const aspect = fa5xFrameAspect(frameWidth, frameHeight);
  const empty = {
    tracked: false,
    missing: { shoulders: true, hips: true, knees: true, ankles: true },
    frameSizeValid: aspect != null,
    frameWidth: aspect != null ? frameWidth : null,
    frameHeight: aspect != null ? frameHeight : null,
    hipY: null, shoulderY: null, shankLength: null, kneeAngle: null, trunkLeanDeg: null,
    topY: null, bottomY: null, bodyHeight: null,
  };
  if (!Array.isArray(landmarks) || !landmarks.length) return empty;
  if (aspect == null) return empty;

  const missing = {
    shoulders: !pairOk(landmarks, L.LEFT_SHOULDER, L.RIGHT_SHOULDER, v),
    hips: !pairOk(landmarks, L.LEFT_HIP, L.RIGHT_HIP, v),
    knees: !pairOk(landmarks, L.LEFT_KNEE, L.RIGHT_KNEE, v),
    ankles: !pairOk(landmarks, L.LEFT_ANKLE, L.RIGHT_ANKLE, v),
  };
  const tracked = !missing.shoulders && !missing.hips && !missing.knees && !missing.ankles;

  // Framing coordinates: raw normalized y.
  const hipY = missing.hips ? null : avg(landmarks[L.LEFT_HIP].y, landmarks[L.RIGHT_HIP].y);
  const shoulderY = missing.shoulders ? null : avg(landmarks[L.LEFT_SHOULDER].y, landmarks[L.RIGHT_SHOULDER].y);

  // Geometry coordinates: isotropic image-height units (see header). Visibility
  // fields are carried over, so the shared metric function's reliability checks
  // see exactly the same landmarks.
  const geo = landmarks.map((p) => (p ? { ...p, x: p.x * aspect } : p));
  let shankLength = null;
  if (!missing.knees && !missing.ankles) {
    const shank = (k, a) => Math.hypot(geo[k].x - geo[a].x, geo[k].y - geo[a].y);
    shankLength = avg(shank(L.LEFT_KNEE, L.LEFT_ANKLE), shank(L.RIGHT_KNEE, L.RIGHT_ANKLE));
  }

  const m = computeSitToStandMetrics(geo, { MIN_VISIBILITY: v });

  let topY = null, bottomY = null, bodyHeight = null;
  if (tracked) {
    const ys = [L.LEFT_SHOULDER, L.RIGHT_SHOULDER, L.LEFT_HIP, L.RIGHT_HIP, L.LEFT_KNEE, L.RIGHT_KNEE, L.LEFT_ANKLE, L.RIGHT_ANKLE].map((i) => landmarks[i].y);
    topY = Math.min(...ys);
    bottomY = Math.max(...ys);
    bodyHeight = bottomY - topY;
  }

  return {
    tracked,
    missing,
    frameSizeValid: true,
    frameWidth,
    frameHeight,
    hipY,
    shoulderY,
    shankLength,
    kneeAngle: m.averageKneeAngle,
    trunkLeanDeg: m.trunkLeanDeg,
    topY,
    bottomY,
    bodyHeight,
  };
}

/**
 * Framing for the PRE-TEST phases: "OK" | "TOO_CLOSE" | "TOO_FAR" | null
 * (null = cannot judge, not tracked). While seated, also checks there is
 * room above the shoulders to stand up without leaving the frame.
 */
export function assessFa5xFraming(features, params = FA5X_PARAMS, { checkStandingHeadroom = true } = {}) {
  if (!features || !features.tracked) return null;
  const edge = params.FRAME_EDGE_MARGIN;
  if (features.topY < edge || features.bottomY > 1 - edge) return "TOO_CLOSE";
  if (checkStandingHeadroom && features.shankLength != null && features.shoulderY != null) {
    if (features.shoulderY - params.STANDING_HEADROOM_SHANK_UNITS * features.shankLength < edge) return "TOO_CLOSE";
  }
  if (features.bodyHeight < params.TOO_FAR_BODY_HEIGHT_MAX) return "TOO_FAR";
  return "OK";
}

/**
 * Which prompt key explains a non-tracked frame. 「看不到你的雙腳」 only when
 * the upper body IS visible but the ankles are not (the most common 5xSTS
 * framing miss); nobody / mostly out of frame -> the general framing prompt.
 * No valid video size yet -> 「正在啟動鏡頭…」 (text only, never spoken): the
 * user cannot fix that by moving.
 */
export function trackingPromptKey(features) {
  if (features && features.frameSizeValid === false) return "CAMERA_STARTING";
  if (!features || !features.missing) return "FRAME_BODY";
  const m = features.missing;
  if (m.ankles && !m.shoulders && !m.hips) return "FEET_MISSING";
  return "FRAME_BODY";
}
