import { POSE_LANDMARK_INDEX } from "../../squatConstants.js";

/**
 * F01-A01 五次坐站測試（5xSTS）— Assessment Mode parameters.
 *
 * Source of truth: docs/specs/ReMotion六大功能_復健資料庫_F01.xlsx, sheet F01.
 * Stage 2 (AI/CV) is "No Evidence Found" and reference_threshold is
 * "No Evidence Found": NONE of the numeric values below come from literature.
 * Every numeric parameter is an ENGINEERING CANDIDATE that must be calibrated
 * with real-person recordings (Excel B41) before it can be relied on. None of
 * them is a clinical cutoff, and none may be presented as one in UI or docs.
 *
 * Training Mode (F01-04 坐姿起立, js/ai/exercises/sitToStand/constants.js)
 * keeps its own LE05_THRESHOLDS; nothing here changes it.
 */

export const FA5X_ALGORITHM_VERSION = "fa5x-assessment-1.0";
export const FA5X_THRESHOLD_VERSION = "fa5x-engineering-candidate-2026-09-28";

/** Excel completion_rule / protocol: exactly five full sit-to-stand cycles. Spec-defined, not a threshold. */
export const FA5X_TARGET_REPS = 5;

/**
 * Excel timing_rule (literature definition): start at the 「開始」 cue, stop when
 * the 5th sit reaches the seat. The CV movement-onset time is recorded too
 * (movementOnsetMs) so the Excel CV-translation variant can be derived later.
 */
export const FA5X_TIMING_DEFINITION = "start_cue_to_fifth_seated";

/** Excel required_landmarks (B28): bilateral shoulder, hip, knee, ankle. Spec-defined list. */
export const FA5X_REQUIRED_LANDMARKS = [
  POSE_LANDMARK_INDEX.LEFT_SHOULDER, POSE_LANDMARK_INDEX.RIGHT_SHOULDER,
  POSE_LANDMARK_INDEX.LEFT_HIP, POSE_LANDMARK_INDEX.RIGHT_HIP,
  POSE_LANDMARK_INDEX.LEFT_KNEE, POSE_LANDMARK_INDEX.RIGHT_KNEE,
  POSE_LANDMARK_INDEX.LEFT_ANKLE, POSE_LANDMARK_INDEX.RIGHT_ANKLE,
];

const ENG = "engineering_candidate";

/**
 * Parameter registry. `value` is what the code uses; the other fields are the
 * documentation the spec requires for every engineering parameter.
 * Units: displacement values are in "shank lengths" (see assessmentFeatures.js).
 */
export const FA5X_PARAMETER_SPECS = {
  MIN_VISIBILITY: { value: 0.55, unit: "MediaPipe visibility 0-1", purpose: "A required landmark counts as tracked only at or above this visibility.", evidence: ENG, calibrationRequired: true },

  FRAME_EDGE_MARGIN: { value: 0.02, unit: "normalized image", purpose: "Required landmarks closer than this to the top/bottom edge mean the body is about to leave the frame (距離太近).", evidence: ENG, calibrationRequired: true },
  TOO_FAR_BODY_HEIGHT_MAX: { value: 0.3, unit: "normalized image height", purpose: "Seated shoulder-to-ankle height below this means the person is too small in frame (距離太遠).", evidence: ENG, calibrationRequired: true },
  STANDING_HEADROOM_SHANK_UNITS: { value: 1.0, unit: "shank lengths", purpose: "Headroom check while seated: shoulders must stay in frame after rising by about this much, so standing does not leave the frame.", evidence: ENG, calibrationRequired: true },

  SEATED_READY_STABLE_MS: { value: 1500, unit: "ms", purpose: "The seated posture must be held still this long before the seated hip-y baseline is taken.", evidence: ENG, calibrationRequired: true },
  SEATED_READY_MAX_HIP_JITTER: { value: 0.06, unit: "shank lengths", purpose: "Max hip-y spread inside the stability window for the posture to count as still.", evidence: ENG, calibrationRequired: true },
  READY_HOLD_MS: { value: 3000, unit: "ms", purpose: "How long 「準備完成」 is shown before the 3-2-1 countdown — long enough for the spoken line 「準備完成。聽到開始後再起身。」 to finish before 「3」 (UX refinement; was 800).", evidence: "ux_parameter", calibrationRequired: false },
  COUNTDOWN_STEP_MS: { value: 1000, unit: "ms", purpose: "Length of each countdown step (3, 2, 1). Preparation only — not part of the timed test.", evidence: "ux_parameter", calibrationRequired: false },

  RISE_ONSET_DISPLACEMENT: { value: 0.15, unit: "shank lengths", purpose: "Hip rise above the seated baseline that marks leaving the seat (movement onset; also the false-start check during countdown).", evidence: ENG, calibrationRequired: true },
  STANDING_DISPLACEMENT_MIN: { value: 0.7, unit: "shank lengths", purpose: "Hip rise above the seated baseline required to count as fully standing (完全站直).", evidence: ENG, calibrationRequired: true },
  STANDING_KNEE_ANGLE_MIN_DEG: { value: 150, unit: "degrees (2D hip-knee-ankle)", purpose: "When the knee angle is measurable, standing also requires the knees to be this straight. Never used to decide 'seated'.", evidence: ENG, calibrationRequired: true },
  STANDING_EXIT_HYSTERESIS: { value: 0.1, unit: "shank lengths", purpose: "Descent starts once the hip drops this far below STANDING_DISPLACEMENT_MIN (avoids flicker at the threshold).", evidence: ENG, calibrationRequired: true },
  SEATED_RETURN_DISPLACEMENT_MAX: { value: 0.12, unit: "shank lengths", purpose: "Hip within this distance of the seated baseline counts as back on the seat (完整坐回).", evidence: ENG, calibrationRequired: true },
  BELOW_BASELINE_RESET: { value: 0.25, unit: "shank lengths", purpose: "Hip this far BELOW the baseline means the baseline was not taken seated (e.g. the user was standing); the seated check restarts or the run is invalid.", evidence: ENG, calibrationRequired: true },
  STANDING_CONFIRM_FRAMES: { value: 3, unit: "frames (~66 ms each)", purpose: "Consecutive frames needed to confirm standing.", evidence: ENG, calibrationRequired: true },
  SEATED_CONFIRM_FRAMES: { value: 3, unit: "frames (~66 ms each)", purpose: "Consecutive frames needed to confirm seated. The seated timestamp is the FIRST confirming frame, so confirmation adds no time.", evidence: ENG, calibrationRequired: true },

  TRACKING_LOSS_INVALID_MS: { value: 1200, unit: "ms", purpose: "During the timed test, required landmarks missing this long makes the run invalid (the timer is never paused and resumed). Shorter gaps are tolerated.", evidence: ENG, calibrationRequired: true },
  MAX_ASSESSMENT_MS: { value: 60000, unit: "ms", purpose: "Safety stop: not finishing five reps within this time ends the run as incomplete. The spec only says 「不可中途暫停過久」 without a number.", evidence: ENG, calibrationRequired: true },
};

/** Flat `{ NAME: value }` view used by the code. */
export const FA5X_PARAMS = Object.freeze(Object.fromEntries(Object.entries(FA5X_PARAMETER_SPECS).map(([k, s]) => [k, s.value])));

/** Assessment phases (pre-test preparation, then the timed test). */
export const FA5X_PHASE = Object.freeze({
  POSITIONING: "positioning",
  SEATED_CHECK: "seated_check",
  READY: "ready",
  COUNTDOWN: "countdown",
  RUNNING: "running",
  FINISHED: "finished",
});

/** Repetition lifecycle while RUNNING. */
export const FA5X_REP_STATE = Object.freeze({
  SEATED: "seated",
  RISING: "rising",
  STANDING: "standing",
  DESCENDING: "descending",
});

export const FA5X_RESULT_STATUS = Object.freeze({
  COMPLETED: "completed",
  INCOMPLETE: "incomplete",
  INVALID: "invalid",
});

export const FA5X_REJECT_REASON = Object.freeze({
  NOT_FULLY_STANDING: "not_fully_standing",
  NOT_FULLY_SEATED: "not_fully_seated",
});

export const FA5X_END_REASON = Object.freeze({
  TRACKING_LOST: "tracking_lost",
  START_POSITION_NOT_SEATED: "start_position_not_seated",
  TIMEOUT: "timeout",
  USER_CANCELLED: "user_cancelled",
});

/**
 * User-facing prompts. `text` is shown on screen; `voice` (when present) is
 * spoken through the assessment voice guard. No engineering codes are exposed.
 */
export const FA5X_PROMPTS = Object.freeze({
  CAMERA_STARTING: { text: "正在啟動鏡頭…" },
  FRAME_BODY: { text: "請調整位置，保持全身入鏡", voice: "請調整位置，保持全身入鏡" },
  TOO_CLOSE: { text: "距離太近，請往後一點", voice: "距離太近，請往後一點" },
  TOO_FAR: { text: "距離太遠，請靠近一點", voice: "距離太遠，請靠近一點" },
  FEET_MISSING: { text: "請調整手機位置，讓雙腳完整入鏡", voice: "請調整手機位置，讓雙腳完整入鏡" },
  // Step 1 (standing camera set-up, js/ai/exercises/sitToStand/assessmentPositioning.js)
  STAND_POSITION: { text: "先調整拍攝位置", voice: "請先站好，調整位置，讓全身完整入鏡。" },
  NO_HEADROOM: { text: "請調整位置，保留站立空間", voice: "請調整位置，保留站立空間" },
  POSITION_OK: { text: "現在請坐到椅子上準備測試", voice: "位置調整完成。現在請坐到椅子上，雙腳踩穩，雙手交叉抱胸。" },
  // Step 2 (seated preparation, assessment session)
  SIT_READY: { text: "現在請坐到椅子上準備測試", voice: "請坐好，雙腳踩穩，雙手交叉抱胸" },
  HOLD_STILL: { text: "保持坐姿不動，正在確認起始姿勢…" },
  FALSE_START: { text: "請等聽到「開始」後再起身", voice: "請等聽到開始後再起身" },
  READY: { text: "準備完成", voice: "準備完成。聽到開始後再起身。" },
  COUNT_3: { text: "3", voice: "3" },
  COUNT_2: { text: "2", voice: "2" },
  COUNT_1: { text: "1", voice: "1" },
  START: { text: "開始！盡快站起、坐下，共 5 次", voice: "開始" },
  NOT_FULLY_STANDING: { text: "請完全站直", voice: "請完全站直" },
  NOT_FULLY_SEATED: { text: "請完整坐回椅子", voice: "請完整坐回椅子" },
  TRACKING_WARNING: { text: "請保持全身入鏡", voice: "請保持全身入鏡" },
  COMPLETE: { text: "評估完成", voice: "評估完成" },
  INVALID: { text: "追蹤中斷，請重新評估", voice: "追蹤中斷，請重新評估" },
  INCOMPLETE: { text: "評估未完成", voice: "評估未完成" },
});

/** Prompts that must always be spoken on time (bypass cooldown, interrupt other speech). */
export const FA5X_PRIORITY_PROMPTS = Object.freeze(["POSITION_OK", "READY", "COUNT_3", "COUNT_2", "COUNT_1", "START", "COMPLETE", "INVALID", "INCOMPLETE"]);

/** Voice guard: the same non-priority prompt is not repeated within this window. UX parameter. */
export const FA5X_VOICE_COOLDOWN_MS = 4000;

export const FA5X_REP_STATE_LABELS = Object.freeze({
  seated: "已坐回",
  rising: "起身中",
  standing: "已站直",
  descending: "坐下中",
});
