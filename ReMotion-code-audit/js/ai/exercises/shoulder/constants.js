import { POSE_LANDMARK_INDEX, SQUAT_THRESHOLDS } from "../../squatConstants.js";

/**
 * ReMotion Phase 7.3A / 7.3A.1 — Shoulder Functional Assessment Camera
 * Foundation + Remote Assessment UX.
 *
 * Landmarks + camera/readiness/framing thresholds ONLY. Deliberately
 * contains no angle/ROM/clinical constants (shoulder flexion/abduction
 * targets, normal ranges, reference axis, etc.) — those belong to Phase
 * 7.3B, which will define them separately once the professional shoulder
 * measurement specification is supplied. Mirrors
 * js/ai/exercises/hipFlexion/constants.js's own "landmarks/engineering-only,
 * no clinical values yet" precedent.
 */

// Elbow/wrist are standard BlazePose/MediaPipe indices — same 33-point
// topology squatConstants.js's POSE_LANDMARK_INDEX already documents — just
// not previously named there since squat/HP02 never needed them.
export const SHOULDER_LANDMARK_INDEX = {
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
};

/**
 * CAMERA READY landmarks — body visibility/framing/temporal-stability ONLY.
 * Deliberately excludes hips (Phase 7.3A.1 change). Verified against
 * current source before this change: none of getBodyReadiness(),
 * getFramingDistanceHint(), or createDetectionStabilityTracker() reference
 * hip indices internally — they only iterate whatever requiredLandmarks
 * array the caller supplies. Hips were only present before because this
 * file chose to include them for "torso anchoring." Real-device testing
 * (Phase 7.3A.1 pre-check) found that requiring hip visibility forced the
 * patient to stand much further back than a simple upper-body readiness
 * check actually needs, since getFramingDistanceHint()'s bounding box is
 * computed from exactly this landmark set's y-range.
 *
 * This is NOT a definition of shoulder ROM geometry. A future Phase 7.3B
 * angle calculation will define its own movement-specific measurement
 * landmark requirements once the real shoulder ROM/reference-axis
 * specification is supplied — do not predefine that here. MediaPipe
 * returns the full 33-point body topology every frame regardless of what
 * this list checks, so excluding hips from the camera-ready gate does not
 * remove hip data from availability for that later, separate purpose.
 */
export const CAMERA_READY_LANDMARKS = [
  POSE_LANDMARK_INDEX.LEFT_SHOULDER,
  POSE_LANDMARK_INDEX.RIGHT_SHOULDER,
  SHOULDER_LANDMARK_INDEX.LEFT_ELBOW,
  SHOULDER_LANDMARK_INDEX.RIGHT_ELBOW,
  SHOULDER_LANDMARK_INDEX.LEFT_WRIST,
  SHOULDER_LANDMARK_INDEX.RIGHT_WRIST,
];

/**
 * Phase 7.3B.2B — movement-specific MEASUREMENT landmarks, now that the
 * shoulder ROM domain spec has been reconciled (Phase 7.3B.2/7.3B.2A).
 * Deliberately SEPARATE from CAMERA_READY_LANDMARKS above — camera
 * readiness ("can the user be seen well enough to start") and measurement
 * validity ("can THIS specific angle be computed/trusted right now") are
 * different concepts and must not be conflated (Phase 7.3B pre-check
 * section 17/21; Phase 7.3B.2A report section 12). CAMERA_READY_LANDMARKS
 * is untouched by this addition.
 *
 * Both Flexion and Abduction use the identical landmark family per side —
 * only the camera view (side vs front) and instructed motion direction
 * differ; the geometry/landmark selection itself does not (Phase 7.3B.2A
 * report section 6/8).
 *
 * - core: required to compute the primary shoulder-elevation angle
 *   (HIP → SHOULDER → ELBOW, vertex at SHOULDER). If any core landmark is
 *   unreliable, the primary angle cannot be computed at all.
 * - validity: required only to confirm the domain-required "elbow stays
 *   extended" posture condition (SHOULDER → ELBOW → WRIST, vertex at
 *   ELBOW). Losing WRIST does NOT prevent the primary angle from being
 *   computed — it only means elbow-extension can't be confirmed for that
 *   frame (Phase 7.3B.2A report section 11).
 * - optionalQuality: the contralateral shoulder, named in the domain
 *   spec as an auxiliary landmark for a future (7.3C+) compensation
 *   signal — represented here as a visibility fact only, never as a rule.
 *
 * HIP-as-trunk-reference remains an ENGINEERING APPROXIMATION of the
 * domain spec's "trunk anatomical direction" concept, not a literally
 * domain-specified landmark (Phase 7.3B.2A report section 8) — flagged
 * here, not silently presented as clinically confirmed.
 */
export const SHOULDER_SIDE = {
  LEFT: "LEFT",
  RIGHT: "RIGHT",
};

export const SHOULDER_MEASUREMENT_LANDMARKS = {
  [SHOULDER_SIDE.LEFT]: {
    core: [POSE_LANDMARK_INDEX.LEFT_HIP, POSE_LANDMARK_INDEX.LEFT_SHOULDER, SHOULDER_LANDMARK_INDEX.LEFT_ELBOW],
    validity: [SHOULDER_LANDMARK_INDEX.LEFT_WRIST],
    optionalQuality: [POSE_LANDMARK_INDEX.RIGHT_SHOULDER],
  },
  [SHOULDER_SIDE.RIGHT]: {
    core: [POSE_LANDMARK_INDEX.RIGHT_HIP, POSE_LANDMARK_INDEX.RIGHT_SHOULDER, SHOULDER_LANDMARK_INDEX.RIGHT_ELBOW],
    validity: [SHOULDER_LANDMARK_INDEX.RIGHT_WRIST],
    optionalQuality: [POSE_LANDMARK_INDEX.LEFT_SHOULDER],
  },
};

/**
 * CAMERA/READINESS THRESHOLDS ONLY — NOT clinical ROM/angle thresholds.
 * MIN_VISIBILITY / INFERENCE_INTERVAL_MS / DETECTION_GRACE_MS /
 * PARTIAL_WARNING_MS are copied from SQUAT_THRESHOLDS' own generic
 * camera-tuning fields (inference throttling, dropout-display debounce —
 * see that file's own comments), independently declared here as plain
 * number copies so a future change to squat's own object can never
 * silently retune the shoulder camera UI, and vice versa.
 */
export const SHOULDER_CAMERA_THRESHOLDS = {
  MIN_VISIBILITY: SQUAT_THRESHOLDS.MIN_VISIBILITY,
  INFERENCE_INTERVAL_MS: SQUAT_THRESHOLDS.INFERENCE_INTERVAL_MS,
  DETECTION_GRACE_MS: SQUAT_THRESHOLDS.DETECTION_GRACE_MS,
  PARTIAL_WARNING_MS: SQUAT_THRESHOLDS.PARTIAL_WARNING_MS,
  // Stage 1 — raw (un-smoothed) per-frame readiness must read READY
  // continuously for this long before the UI first shows "準備完成" at all
  // (Phase 7.3A report section 5F: "READY must require stable readiness,
  // not a single good frame"). A UX/engineering tolerance, not a clinical
  // timing standard.
  READY_HOLD_MS: 800,
  // Stage 2 — once ready-confirmation is first shown, how long it stays
  // visible/spoken before auto-advancing into the countdown (Phase 7.3A.1
  // report section 6E). Reuses the same 800ms value as squat's own
  // SQUAT_READY_HOLD_MS for consistency; a UX pacing choice, not clinical.
  READY_CONFIRMATION_HOLD_MS: 800,
  // Numeric countdown length before measurement-ready. Reuses squat's own
  // SQUAT_THRESHOLDS.COUNTDOWN_SECONDS value (3) for consistency — a UX
  // pacing choice, not clinical.
  COUNTDOWN_SECONDS: SQUAT_THRESHOLDS.COUNTDOWN_SECONDS,
  // Voice message cooldowns, reused verbatim from SQUAT_THRESHOLDS — see
  // js/ai/shared/voicePolicy.js. Shoulder has no "encouragement" tier, so
  // every message uses the default cooldown only.
  VOICE_DEFAULT_COOLDOWN_MS: SQUAT_THRESHOLDS.VOICE_DEFAULT_COOLDOWN_MS,
  VOICE_ENCOURAGEMENT_COOLDOWN_MS: SQUAT_THRESHOLDS.VOICE_ENCOURAGEMENT_COOLDOWN_MS,
};

/**
 * KNOWN LIMITATION — flagged, not silently worked around (Phase 7.3A.1
 * report section "Blocking/Shared-File Finding"):
 *
 * getFramingDistanceHint() (js/ai/poseMath.js) decides TOO_CLOSE (bbox
 * height > 0.95) / TOO_FAR (bbox height < 0.35) using two numeric literals
 * hardcoded directly in that function's body — they are NOT read from its
 * `thresholds` parameter (only `thresholds.MIN_VISIBILITY` is). This means
 * a shoulder-specific ENGINEERING CAMERA / UX CALIBRATION override for
 * those two boundaries is NOT achievable by passing a different thresholds
 * object, and none is defined here — doing so would silently have no
 * effect, which would be worse than not attempting it.
 *
 * What IS achieved without touching poseMath.js: CAMERA_READY_LANDMARKS
 * above (no hips) still changes real behavior, because `requiredLandmarks`
 * genuinely is a respected parameter for both the "every point must be
 * reliable" gate and the bbox itself (the box is computed only from
 * these landmarks' y-range) — removing hips removes the "hips must also
 * be visible" requirement and shrinks the box for the same physical
 * distance, which is the primary real-device fix for Phase 7.3A.1.
 *
 * A true numeric recalibration of the TOO_CLOSE/TOO_FAR boundaries would
 * require parameterizing those two literals in getFramingDistanceHint()
 * (the same additive, default-preserving pattern already used for
 * requiredLandmarks in Phase 5.5.2) — this has NOT been done in this
 * phase; see the Phase 7.3A.1 implementation report's shared-file-change
 * request for details, pending approval.
 */
