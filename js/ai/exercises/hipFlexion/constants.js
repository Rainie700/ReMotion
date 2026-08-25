import { POSE_LANDMARK_INDEX } from "../../squatConstants.js";

/**
 * ReMotion Phase 5.6.1 — HP02 (站姿髖屈曲) prototype config.
 *
 * Landmarks only — deliberately NO threshold constants here (no
 * HIP_FLEXION_TARGET_ANGLE / HIP_FLEXION_TOLERANCE / TRUNK_LEAN_MAX). Phase
 * 5.6.0's audit found rehabExercises.js's own correct_angle/angle_tolerance
 * text for HP02 (髖屈曲70°～90°、膝屈曲70°～90°、軀幹前後傾≤5°) has not gone
 * through the same domain-validation review squat's thresholds received in
 * Phase 5.3 — treating those numbers as real CV gating thresholds without
 * that confirmation would be inventing a clinical value, which this phase
 * explicitly must not do (see Phase 5.6.0 report section 12). Any angle
 * this prototype computes is a raw geometric measurement only.
 *
 * Reuses squatConstants.js's existing POSE_LANDMARK_INDEX rather than
 * repeating the same 33-point BlazePose magic numbers a second time.
 */
export const HP02_REQUIRED_LANDMARKS = [
  POSE_LANDMARK_INDEX.LEFT_SHOULDER,
  POSE_LANDMARK_INDEX.RIGHT_SHOULDER,
  POSE_LANDMARK_INDEX.LEFT_HIP,
  POSE_LANDMARK_INDEX.RIGHT_HIP,
  POSE_LANDMARK_INDEX.LEFT_KNEE,
  POSE_LANDMARK_INDEX.RIGHT_KNEE,
  POSE_LANDMARK_INDEX.LEFT_ANKLE,
  POSE_LANDMARK_INDEX.RIGHT_ANKLE,
];

/**
 * ReMotion Phase 5.6.2 — HP02 rep-FSM engineering defaults.
 *
 * *** PROTOTYPE ENGINEERING DEFAULTS, NOT VALIDATED CLINICAL THRESHOLDS. ***
 * None of these numbers come from rehabExercises.js's correct_angle/
 * angle_tolerance text (髖屈曲70°～90°、±10°) — that text is a QUALITY/ROM
 * description, not a rep-completion trigger, and per Phase 5.6.0/5.6.1's
 * explicit rule it must not be used as a production CV threshold without
 * domain validation. Everything below exists only to answer "did a
 * deliberate raise-and-lower cycle happen" (counting), never "was it a
 * clinically correct hip flexion" (quality — not implemented this phase).
 *
 * Deliberately loose/permissive: CANDIDATE_TOP_ANGLE_MAX_DEG (150°) is far
 * short of the catalog's 70-90° "correct" range on purpose, so this
 * threshold can never accidentally double as a quality gate the way
 * squat's DOWN_KNEE_ANGLE ended up doing before Phase 5.3 fixed it (see
 * squatConstants.js's own note on that history). All values here are
 * independently chosen for HP02, not copied from SQUAT_THRESHOLDS, even
 * where a same-magnitude value was a reasonable independent guess (e.g.
 * MAX_FRAME_GAP_MS) — see Phase 5.6.2 report section 6/7 for the full
 * reasoning behind each number and exactly what must be re-measured in
 * real-device calibration before any of this is trusted further.
 */
export const HP02_ENGINEERING_DEFAULTS = {
  // A side is considered "neutral/standing" once its hip flexion angle is
  // at or above this value. Engineering provisional — real standing angle
  // will be measured tomorrow (see report section 26/Tomorrow Test Prep).
  NEUTRAL_ANGLE_MIN_DEG: 160,
  // A side has reached a "candidate top" (a rep attempt substantial enough
  // to count) once its angle drops to or below this value. Deliberately
  // generous/loose — NOT the clinical 70-90° range, see module doc above.
  CANDIDATE_TOP_ANGLE_MAX_DEG: 150,
  // Same debounce concept as squatConstants.js's STANDING_CONFIRM_FRAMES —
  // requires this many consecutive frames back at/above
  // NEUTRAL_ANGLE_MIN_DEG before a rep is confirmed complete (or a
  // never-reached-top attempt is confirmed discarded), so single noisy
  // frames near the boundary can't complete/discard a rep on their own.
  NEUTRAL_CONFIRM_FRAMES: 2,
  // A completed rep's full neutral->top->neutral cycle must take at least
  // this long, filtering single-frame jitter spikes. Independently chosen
  // for HP02 (shallower, faster expected motion than a squat), not copied
  // from squat's MIN_REP_DURATION_MS.
  MIN_REP_DURATION_MS: 500,
  // If a side has valid data, then no reliable angle for longer than this
  // while mid-rep (raising/top/lowering), the in-progress attempt is
  // discarded and that side resets to neutral instead of resuming a stale
  // rep — same protective concept as squatConstants.js's MAX_FRAME_GAP_MS,
  // independently declared for HP02.
  MAX_FRAME_GAP_MS: 1500,
};
