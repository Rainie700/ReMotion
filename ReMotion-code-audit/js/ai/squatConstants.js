/**
 * All tunable thresholds for the squat MVP live here (per the requirement
 * that thresholds be centralized, not scattered across functions).
 */

// Standard 33-point BlazePose/MediaPipe Pose landmark indices used by
// @mediapipe/tasks-vision's PoseLandmarker — same topology as classic
// MediaPipe Pose.
export const POSE_LANDMARK_INDEX = {
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
};

export const REQUIRED_LANDMARK_INDICES = Object.values(POSE_LANDMARK_INDEX);

// Phase 5.5.2 — alias only (same array, same values), introduced so callers
// that want to be explicit about "this is squat's own landmark requirement,
// not some generic default" have a non-misleading name to import. Kept
// alongside REQUIRED_LANDMARK_INDICES rather than renaming it, since nothing
// else in the required-landmark parameterization needs that name to change
// (see Phase 5.5.2 report section 14 for why a full rename was skipped).
export const SQUAT_REQUIRED_LANDMARKS = REQUIRED_LANDMARK_INDICES;

export const SQUAT_THRESHOLDS = {
  // A landmark below this visibility/presence score is treated as
  // unreliable and excluded from angle calculations.
  MIN_VISIBILITY: 0.5,
  // Average knee angle (degrees) at/above this = standing.
  STANDING_KNEE_ANGLE: 155,
  // Average knee angle (degrees) at/below this = bottom of squat AND the
  // depth bar a completed rep must clear to be "quality-valid" on depth.
  //
  // Phase 5.3 note: earlier there was a SEPARATE DEPTH_INSUFFICIENT_KNEE_ANGLE
  // (110°) used only for the depth-quality flag. Because the state machine
  // can only ever reach "bottom" (and therefore only ever complete a rep)
  // once the angle has already gone <=100°, a rep's minKneeAngle could never
  // exceed 100° — making a 110° "insufficient" bar structurally unreachable
  // (every completed rep automatically passed it). That's very likely why
  // real-device testing saw 30/30 valid reps and a 100/100 score even with
  // visible depth/tracking issues. Rather than swap 110° for another guessed
  // number, DOWN_KNEE_ANGLE is now the single source of truth for both
  // roles — see js/ai/squatQuality.js and squatSession.js.
  DOWN_KNEE_ANGLE: 100,
  // A rep only counts if the full standing->down->standing cycle took at
  // least this long, to filter out jitter/false triggers.
  MIN_REP_DURATION_MS: 800,
  // Phase 5.4.2 — real-device testing found bottom-jitter occasionally
  // counted as more than one rep. Audit (js/ai/squatSession.js) found the
  // FSM itself handles the classic "bottom -> slightly higher -> bottom"
  // bounce correctly (verified by a new stress test) as long as it never
  // reaches STANDING_KNEE_ANGLE. But the *ascending -> standing* completion
  // trigger had NO debounce at all — unlike every other transition in this
  // machine — so a single noisy frame that momentarily crosses
  // STANDING_KNEE_ANGLE mid-ascent (before the patient has actually finished
  // standing) could complete a rep immediately, after which the very next
  // frame (still genuinely mid-squat) reads as the START of a second rep.
  // This constant requires that many CONSECUTIVE valid frames read
  // >=STANDING_KNEE_ANGLE before a rep actually completes — the same
  // 155° threshold, just confirmed instead of trusted on one frame. This is
  // an engineering/debounce fix (same category as MIN_REP_DURATION_MS
  // above), NOT a change to any clinical/biomechanical angle threshold.
  STANDING_CONFIRM_FRAMES: 2,
  // Trunk lean (deg from vertical, shoulder-mid to hip-mid line) above this
  // is flagged as excessive forward lean.
  TRUNK_LEAN_MAX_DEG: 35,
  // Front-camera knee-valgus heuristic: if the knee-to-knee distance drops
  // below (1 - this ratio) * ankle-to-ankle distance, the knees are
  // suspected of caving inward relative to the feet.
  KNEE_VALGUS_RATIO: 0.15,
  // Countdown shown before rep counting starts.
  COUNTDOWN_SECONDS: 3,
  // Pose inference is throttled to roughly this interval (~15fps) instead
  // of running on every animation frame.
  INFERENCE_INTERVAL_MS: 66,

  // Phase 5.2 — UI-only temporal smoothing so a single dropped/low-visibility
  // frame doesn't flicker the training screen. These are engineering/UX
  // tolerances tuned for a responsive-feeling camera UI, NOT clinical
  // timing standards, and they never influence rep counting or scoring —
  // SquatSessionTracker (squatSession.js) always sees the true, un-smoothed
  // per-frame landmarks/angles. See js/ai/detectionStability.js.
  //
  // A dropout shorter than this keeps showing the last stable ("READY")
  // display state — no visible change at all.
  DETECTION_GRACE_MS: 400,
  // A dropout from DETECTION_GRACE_MS up to this value shows a soft
  // "請保持全身入鏡" warning; at/beyond this value it escalates further to
  // "暫時偵測不到".
  PARTIAL_WARNING_MS: 1500,

  // Phase 5.2 rep-counting safety net (squatSession.js): if two consecutive
  // *valid* frames fed to the rep state machine are more than this far apart
  // in time, tracking was lost for a while mid-rep (e.g. the patient walked
  // out of frame) — the in-progress rep is discarded (never counted) instead
  // of being resumed from its stale state, which previously could let a
  // brief "leave mid-squat, come back standing" sequence phantom-complete a
  // rep. A normal camera dropout that's brief enough for the UI grace period
  // to hide never reaches this — only a real, sustained gap does. Same
  // magnitude as PARTIAL_WARNING_MS by design (both represent "this is a
  // genuine, sustained loss of tracking"), but kept as its own named
  // constant since the two live in different, independent pure modules.
  MAX_FRAME_GAP_MS: 1500,

  // Phase 5.3 — real-time feedback stability (js/ai/squatFeedback.js): a
  // candidate feedback message at the same or lower priority than what's
  // currently shown must stay the top pick for this long before it actually
  // replaces the displayed one, so single noisy frames near a threshold
  // boundary (e.g. knee angle jitter right at DOWN_KNEE_ANGLE) don't make
  // the primary feedback line flicker. A HIGHER-priority (safety) message
  // always pre-empts immediately, ignoring this delay. Engineering/UX
  // tolerance only.
  FEEDBACK_MIN_PERSISTENCE_MS: 600,

  // Phase 5.3 — voice feedback cooldowns (js/ai/squatVoicePolicy.js): the
  // same spoken message id will not repeat within this window. Encouragement
  // ("很好，繼續保持") gets a much longer cooldown than actionable messages
  // (safety/movement/form) since it adds the least new information and is
  // the most likely to be shown repeatedly. Engineering/UX tolerance only —
  // not a clinical pacing standard.
  VOICE_DEFAULT_COOLDOWN_MS: 6000,
  VOICE_ENCOURAGEMENT_COOLDOWN_MS: 15000,

  // Phase 5.3 — how long after a rep with a quality issue the "form"
  // feedback (e.g. "保持軀幹穩定") stays eligible to show before falling
  // back to generic encouragement. Engineering/UX tolerance only.
  FORM_FEEDBACK_WINDOW_MS: 4000,

  // Phase 5.4.2 — how long a milestone acknowledgment (e.g. "已經過一半了")
  // stays eligible to show before falling back to lower-priority feedback.
  // Engineering/UX tolerance only, not a clinical concept.
  MILESTONE_FEEDBACK_WINDOW_MS: 3000,
};

export const SQUAT_SCORE_RULES = {
  BASE_SCORE: 100,
  DEPTH_INSUFFICIENT_PENALTY: 5,
  TRUNK_LEAN_PENALTY: 5,
  KNEE_VALGUS_PENALTY: 5,
  MISSING_REP_PENALTY: 3,
  MIN_SCORE: 0,
  MAX_SCORE: 100,
  // Checked in order, first match wins.
  GRADE_THRESHOLDS: [
    { min: 90, label: "Excellent" },
    { min: 80, label: "Good" },
    { min: 70, label: "Fair" },
    { min: 0, label: "Needs Improvement" },
  ],
};

export const DEFAULT_SQUAT_REWARD_XP = 30;

export const SQUAT_ANALYSIS_MODE = "mediapipe_squat";
