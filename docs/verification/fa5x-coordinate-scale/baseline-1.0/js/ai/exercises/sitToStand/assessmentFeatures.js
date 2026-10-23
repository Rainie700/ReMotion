import { POSE_LANDMARK_INDEX } from "../../squatConstants.js";
import { computeSitToStandMetrics } from "./poseMath.js";
import { FA5X_PARAMS } from "./assessmentConstants.js";

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

/**
 * @returns {{
 *   tracked: boolean, missing: {shoulders:boolean,hips:boolean,knees:boolean,ankles:boolean},
 *   hipY: number|null, shoulderY: number|null, shankLength: number|null,
 *   kneeAngle: number|null, trunkLeanDeg: number|null,
 *   topY: number|null, bottomY: number|null, bodyHeight: number|null
 * }}
 */
export function extractFa5xFeatures(landmarks, params = FA5X_PARAMS) {
  const v = params.MIN_VISIBILITY;
  const empty = {
    tracked: false,
    missing: { shoulders: true, hips: true, knees: true, ankles: true },
    hipY: null, shoulderY: null, shankLength: null, kneeAngle: null, trunkLeanDeg: null,
    topY: null, bottomY: null, bodyHeight: null,
  };
  if (!Array.isArray(landmarks) || !landmarks.length) return empty;

  const missing = {
    shoulders: !pairOk(landmarks, L.LEFT_SHOULDER, L.RIGHT_SHOULDER, v),
    hips: !pairOk(landmarks, L.LEFT_HIP, L.RIGHT_HIP, v),
    knees: !pairOk(landmarks, L.LEFT_KNEE, L.RIGHT_KNEE, v),
    ankles: !pairOk(landmarks, L.LEFT_ANKLE, L.RIGHT_ANKLE, v),
  };
  const tracked = !missing.shoulders && !missing.hips && !missing.knees && !missing.ankles;

  const hipY = missing.hips ? null : avg(landmarks[L.LEFT_HIP].y, landmarks[L.RIGHT_HIP].y);
  const shoulderY = missing.shoulders ? null : avg(landmarks[L.LEFT_SHOULDER].y, landmarks[L.RIGHT_SHOULDER].y);
  let shankLength = null;
  if (!missing.knees && !missing.ankles) {
    const shank = (k, a) => Math.hypot(landmarks[k].x - landmarks[a].x, landmarks[k].y - landmarks[a].y);
    shankLength = avg(shank(L.LEFT_KNEE, L.LEFT_ANKLE), shank(L.RIGHT_KNEE, L.RIGHT_ANKLE));
  }

  const m = computeSitToStandMetrics(landmarks, { MIN_VISIBILITY: v });

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
 */
export function trackingPromptKey(features) {
  if (!features || !features.missing) return "FRAME_BODY";
  const m = features.missing;
  if (m.ankles && !m.shoulders && !m.hips) return "FEET_MISSING";
  return "FRAME_BODY";
}
