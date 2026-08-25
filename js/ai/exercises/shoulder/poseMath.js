import { calculateAngle } from "../../poseMath.js";
import { SHOULDER_MEASUREMENT_LANDMARKS, SHOULDER_CAMERA_THRESHOLDS } from "./constants.js";

/**
 * ReMotion Phase 7.3B.2B — Shoulder ROM pure geometry.
 *
 * Pure, DOM-free, camera-free, persistence-free, voice-free, route-free,
 * threshold-free (beyond reusing the already-approved, generic
 * SHOULDER_CAMERA_THRESHOLDS.MIN_VISIBILITY — see below). No clinical
 * interpretation of any kind lives here: this module answers "what angle
 * is currently formed" and "which landmarks are available," never
 * "is this normal," "has movement started," or "is this the endpoint."
 *
 * *** ARCHITECTURE BOUNDARY — READ BEFORE EXTENDING ***
 * Per the Phase 7.3B.2A domain reconciliation (PARTIAL GO), this module
 * deliberately implements ONLY the geometry/observation layer of the
 * MediaPipe-landmarks -> observation -> movement-state -> SIGNAL pipeline.
 * It does NOT implement a movement-start/endpoint/return classifier. That
 * would require numeric thresholds (neutral band, start delta, endpoint
 * dwell/tolerance, return band/confirm time) that no domain source has
 * supplied — inventing them here, even behind a "config" parameter, would
 * risk baking in undocumented comparison semantics (e.g. delta-from-start
 * vs. band-exit) that Phase 7.3B.2A never actually decided. Per that
 * report's own explicit permission ("preferable to implement only the
 * architecture/interface if meaningful classification cannot occur
 * without thresholds"), this module stops here. A future phase, once
 * real thresholds exist (real-device calibration and/or professional
 * confirmation per Phase 7.3B.2A report sections 14/15), is expected to
 * add a small stateful classifier consuming this module's pure angle
 * functions plus an explicit, fully-caller-supplied config object with
 * no defaults — NOT to modify this file's own geometry.
 *
 * Reuses the shared calculateAngle() (js/ai/poseMath.js) unmodified — no
 * duplicate angle-geometry implementation, matching hipFlexion/poseMath.js's
 * own established precedent.
 */

/**
 * Same convention as the shared js/ai/poseMath.js's private isReliable():
 * a landmark with no visibility/presence field at all is treated as
 * reliable (some pose backends omit it entirely).
 */
function isReliablePoint(point, minVisibility) {
  if (!point) return false;
  const score = point.visibility != null ? point.visibility : point.presence;
  return score == null || score >= minVisibility;
}

/**
 * Returns the SHOULDER_MEASUREMENT_LANDMARKS entry for `side`, or `null`
 * for any unsupported/unknown side value. Deliberately never falls back
 * to LEFT or RIGHT — an invalid side must fail safely and visibly (return
 * null / all-null observation), never silently resolve to a guessed side
 * (Phase 7.3B.2B report section 6 requirement).
 */
function getMeasurementLandmarkSet(side) {
  return SHOULDER_MEASUREMENT_LANDMARKS[side] || null;
}

/**
 * Primary shoulder-elevation angle for one side: calculateAngle(HIP,
 * SHOULDER, ELBOW) with the vertex at SHOULDER — the Phase 7.3B.2A locked
 * geometry contract for BOTH Flexion and Abduction (the camera view, not
 * the formula, is what determines which clinical movement this
 * approximates). Returns null (never NaN, never throws) if `side` is
 * unsupported or any of the three CORE landmarks (HIP/SHOULDER/ELBOW for
 * that side) is missing/unreliable — losing WRIST has no effect here.
 *
 * `thresholds` defaults to SHOULDER_CAMERA_THRESHOLDS (already-approved,
 * generic MIN_VISIBILITY — a tracking-confidence concept, not a clinical
 * value), mirroring the exact default-parameter convention already used
 * throughout js/ai/poseMath.js (e.g. computeKneeAngles(landmarks,
 * thresholds = SQUAT_THRESHOLDS)).
 */
export function computeShoulderElevationAngle(landmarks, side, thresholds = SHOULDER_CAMERA_THRESHOLDS) {
  if (!landmarks) return null;
  const set = getMeasurementLandmarkSet(side);
  if (!set) return null;
  const [hipIdx, shoulderIdx, elbowIdx] = set.core;
  const minVis = thresholds.MIN_VISIBILITY;
  const hip = landmarks[hipIdx];
  const shoulder = landmarks[shoulderIdx];
  const elbow = landmarks[elbowIdx];
  if (![hip, shoulder, elbow].every((p) => isReliablePoint(p, minVis))) return null;
  const angle = calculateAngle(hip, shoulder, elbow);
  return Number.isNaN(angle) ? null : angle;
}

/**
 * Secondary elbow-extension angle for one side: calculateAngle(SHOULDER,
 * ELBOW, WRIST) with the vertex at ELBOW. This exists ONLY to make the
 * domain-required "elbow stays extended" posture condition observable
 * (Phase 7.3B.2A report section 10/11) — it is entirely independent of
 * computeShoulderElevationAngle() above (different vertex, needs WRIST
 * instead of HIP), so losing WRIST never affects the primary angle, and
 * losing HIP never affects this one.
 *
 * Returns raw degrees only. Deliberately does NOT classify the result as
 * valid/invalid/acceptable — no numeric elbow-straightness tolerance has
 * been supplied by any domain source (Phase 7.3B.2A report section 10:
 * "NO elbow-validity numeric tolerance may be invented in this phase").
 * A straight elbow reads close to 180°; a bent elbow reads a smaller
 * value — interpreting that value is explicitly out of scope here.
 */
export function computeElbowExtensionAngle(landmarks, side, thresholds = SHOULDER_CAMERA_THRESHOLDS) {
  if (!landmarks) return null;
  const set = getMeasurementLandmarkSet(side);
  if (!set) return null;
  const [, shoulderIdx, elbowIdx] = set.core;
  const [wristIdx] = set.validity;
  const minVis = thresholds.MIN_VISIBILITY;
  const shoulder = landmarks[shoulderIdx];
  const elbow = landmarks[elbowIdx];
  const wrist = landmarks[wristIdx];
  if (![shoulder, elbow, wrist].every((p) => isReliablePoint(p, minVis))) return null;
  const angle = calculateAngle(shoulder, elbow, wrist);
  return Number.isNaN(angle) ? null : angle;
}

/**
 * Visibility-only fact about the contralateral shoulder — named in the
 * domain spec as an auxiliary landmark for a future (7.3C+) compensation
 * signal (left-right shoulder line). Returns a boolean only; computes no
 * lean/rotation/asymmetry value and applies no rule (Phase 7.3B.2B report
 * section 12 — compensation interpretation is explicitly out of scope).
 */
export function isContralateralShoulderVisible(landmarks, side, thresholds = SHOULDER_CAMERA_THRESHOLDS) {
  if (!landmarks) return false;
  const set = getMeasurementLandmarkSet(side);
  if (!set) return false;
  const [contralateralIdx] = set.optionalQuality;
  return isReliablePoint(landmarks[contralateralIdx], thresholds.MIN_VISIBILITY);
}

/**
 * Bundles one frame's per-side measurement facts into a single structured
 * observation. Pure data — no FSM, no signal, no clinical judgment. This
 * is the "per-side raw measurement observation" layer of the pipeline
 * described in the Phase 7.3B.2B spec (landmarks -> observation ->
 * movement-state interpretation -> SIGNAL -> measurementSession
 * .processFrame()) — the pipeline stops here in this phase; nothing
 * downstream of this function exists yet in production.
 */
export function computeShoulderMeasurementObservation(landmarks, side, thresholds = SHOULDER_CAMERA_THRESHOLDS) {
  const set = getMeasurementLandmarkSet(side);
  if (!set) {
    return {
      side,
      shoulderElevationAngle: null,
      elbowExtensionAngle: null,
      coreAngleAvailable: false,
      elbowValidityObservable: false,
      contralateralShoulderVisible: false,
    };
  }
  const shoulderElevationAngle = computeShoulderElevationAngle(landmarks, side, thresholds);
  const elbowExtensionAngle = computeElbowExtensionAngle(landmarks, side, thresholds);
  return {
    side,
    shoulderElevationAngle,
    elbowExtensionAngle,
    coreAngleAvailable: shoulderElevationAngle != null,
    elbowValidityObservable: elbowExtensionAngle != null,
    contralateralShoulderVisible: isContralateralShoulderVisible(landmarks, side, thresholds),
  };
}
