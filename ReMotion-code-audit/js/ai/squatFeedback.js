import { DETECTION_DISPLAY_STATE } from "./detectionStability.js";
import { SQUAT_QUALITY_ISSUE, SQUAT_QUALITY_ISSUE_LABELS } from "./squatQuality.js";
import { SQUAT_FEEDBACK_INTENT } from "./squatFeedbackContent.js";
import { SQUAT_THRESHOLDS } from "./squatConstants.js";

/**
 * ReMotion Phase 5.3/5.4.2 — pure, DOM-free real-time feedback decision
 * layer. The formal training UI shows exactly ONE primary feedback line at
 * a time; this module decides which ONE, given everything currently known
 * about the frame/session, and why:
 *
 *   1. 系統看到了什麼？   -> the context fields passed in
 *   2. 用什麼 measurement？ -> displayState / framing / repState / lastRepIssues / milestone
 *   3. 哪一條 rule 被觸發？ -> the branch below that matched
 *   4. 為什麼顯示這個提示？ -> the returned `reason` string
 *   5. evidence-backed / heuristic / engineering？ -> stated in `reason`
 *
 * Priority (lower number always wins immediately, see
 * createFeedbackStabilityTracker for the "lower priority needs to persist
 * a while first" rule). Phase 5.4.2 inserts MILESTONE between MOVEMENT and
 * FORM per the requested voice priority ("movement completion > milestone
 * > encouragement"):
 *   1 SAFETY        — can the system even see/track the patient right now?
 *   2 MOVEMENT       — what should they do RIGHT NOW to complete this rep?
 *   3 MILESTONE      — a brief acknowledgment of session progress.
 *   4 FORM           — a short note about the rep they just finished.
 *   5 ENCOURAGEMENT  — default/idle state.
 *
 * Every candidate also carries an `intent` (js/ai/squatFeedbackContent.js)
 * so the caller can look up a rotating text variation + a small icon,
 * instead of this module hardcoding one fixed sentence per state.
 */
export const FEEDBACK_PRIORITY = { SAFETY: 1, MOVEMENT: 2, MILESTONE: 3, FORM: 4, ENCOURAGEMENT: 5 };

const SAFETY_LABELS = {
  [DETECTION_DISPLAY_STATE.NOT_FOUND]: "請站到鏡頭前",
  [DETECTION_DISPLAY_STATE.PARTIAL]: "請稍微退後，讓全身進入畫面",
  [DETECTION_DISPLAY_STATE.LOST_SUSTAINED]: "請保持全身入鏡",
  [DETECTION_DISPLAY_STATE.LOST_LONG]: "暫時偵測不到",
};

// Priority 2 — what to do right now, keyed by squatSession.js's current
// state-machine state. "standing" has no movement instruction (nothing is
// in progress), so it deliberately falls through to Priority 3/4/5 below.
const MOVEMENT_INTENT = {
  descending: SQUAT_FEEDBACK_INTENT.DEPTH,
  bottom: SQUAT_FEEDBACK_INTENT.RETURN_TO_STAND,
  ascending: SQUAT_FEEDBACK_INTENT.RETURN_TO_STAND,
};

// Priority 4 — short, non-diagnostic note about the most recently completed
// rep's primary issue (first entry in its qualityIssues array).
const FORM_ISSUE_INTENT = {
  [SQUAT_QUALITY_ISSUE.INSUFFICIENT_DEPTH]: SQUAT_FEEDBACK_INTENT.DEPTH,
  [SQUAT_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN]: SQUAT_FEEDBACK_INTENT.TRUNK_STABILITY,
  [SQUAT_QUALITY_ISSUE.KNEE_VALGUS_SUSPECTED]: SQUAT_FEEDBACK_INTENT.KNEE_DIRECTION,
};

/**
 * context: { displayState, framing, countdownActive, squatCountingStarted,
 * repState, lastRepIssues, lastRepCompletedAt, milestone, milestoneAt, now,
 * thresholds }. Returns { id, intent, priority, reason, milestoneId? } or
 * null (nothing to show — e.g. the countdown overlay is already the sole
 * primary indicator). Callers look up the actual displayed text/icon via
 * js/ai/squatFeedbackContent.js keyed on `intent` (and `milestoneId` for the
 * MILESTONE tier) — this module never hardcodes a single fixed sentence.
 */
export function decideSquatFeedback(context) {
  const {
    displayState,
    framing,
    countdownActive,
    squatCountingStarted,
    repState,
    lastRepIssues,
    lastRepCompletedAt,
    milestone,
    milestoneAt,
    now,
    thresholds = SQUAT_THRESHOLDS,
  } = context || {};

  // The countdown overlay (a separate, larger UI element) is already the
  // one thing on screen during countdown — no competing primary feedback.
  if (countdownActive) return null;

  // Priority 1 — safety/tracking. Always wins outright, never delayed.
  if (displayState && displayState !== DETECTION_DISPLAY_STATE.READY) {
    return {
      id: `safety_${displayState}`,
      intent: SQUAT_FEEDBACK_INTENT.TRACKING,
      text: SAFETY_LABELS[displayState] || "請保持全身入鏡",
      priority: FEEDBACK_PRIORITY.SAFETY,
      reason: `系統看到：平滑後偵測狀態 = ${displayState}（detectionStability.js）。Category C engineering tolerance，判斷「看不看得到人」，不是動作品質判斷。`,
    };
  }
  if (framing === "TOO_CLOSE" || framing === "TOO_FAR") {
    return {
      id: `safety_framing_${framing}`,
      intent: SQUAT_FEEDBACK_INTENT.TRACKING,
      text: framing === "TOO_CLOSE" ? "請稍微退後" : "請靠近一些",
      priority: FEEDBACK_PRIORITY.SAFETY,
      reason: `系統看到：framing hint = ${framing}（bounding box 高度比例，poseMath.js getFramingDistanceHint）。Category C engineering tolerance，僅為取景建議。`,
    };
  }

  // Priority 2 — movement completion, only while actively training.
  if (squatCountingStarted && MOVEMENT_INTENT[repState]) {
    return {
      id: `movement_${repState}`,
      intent: MOVEMENT_INTENT[repState],
      priority: FEEDBACK_PRIORITY.MOVEMENT,
      reason: `系統看到：目前 rep state = ${repState}（squatSession.js state machine，由 DOWN_KNEE_ANGLE/STANDING_KNEE_ANGLE 觸發）。Category B biomechanical heuristic，方向合理但非精確醫療切點。`,
    };
  }

  // Priority 3 — brief milestone acknowledgment (Phase 5.4.2), only while
  // standing (never interrupts an in-progress movement) and only within a
  // short window after it actually fired.
  if (
    repState === "standing" &&
    milestone &&
    milestoneAt != null &&
    now != null &&
    now - milestoneAt < thresholds.MILESTONE_FEEDBACK_WINDOW_MS
  ) {
    return {
      id: `milestone_${milestone}`,
      intent: SQUAT_FEEDBACK_INTENT.MILESTONE,
      milestoneId: milestone,
      priority: FEEDBACK_PRIORITY.MILESTONE,
      reason: `系統看到：本次訓練進度觸發里程碑 = ${milestone}（js/ai/squatMilestones.js，依 targetReps 百分比計算）。純 UX 里程碑，不影響 rep 計數或分數。`,
    };
  }

  // Priority 4 — a brief note about the rep just finished, only while
  // standing (never interrupts an in-progress movement).
  if (
    repState === "standing" &&
    lastRepIssues &&
    lastRepIssues.length &&
    lastRepCompletedAt != null &&
    now != null &&
    now - lastRepCompletedAt < thresholds.FORM_FEEDBACK_WINDOW_MS
  ) {
    const issue = lastRepIssues[0];
    return {
      id: `form_${issue}`,
      intent: FORM_ISSUE_INTENT[issue] || SQUAT_FEEDBACK_INTENT.TRUNK_STABILITY,
      priority: FEEDBACK_PRIORITY.FORM,
      reason: `系統看到：上一次完成的 rep 標記 issue = ${issue}（${SQUAT_QUALITY_ISSUE_LABELS[issue] || issue}，squatQuality.js evaluateSquatQuality）。Category B biomechanical heuristic，非醫療診斷。`,
    };
  }

  // Priority 5 — encouragement / idle default.
  return {
    id: squatCountingStarted ? "encouragement_keep_going" : "encouragement_prepare",
    intent: SQUAT_FEEDBACK_INTENT.ENCOURAGEMENT,
    priority: FEEDBACK_PRIORITY.ENCOURAGEMENT,
    reason: squatCountingStarted
      ? "系統看到：站立中，沒有進行中的動作，也沒有需要立即顯示的品質提醒或里程碑。"
      : "系統看到：已偵測到全身、尚未開始計數。",
  };
}

/**
 * Debounces the frame-by-frame decideSquatFeedback() output so a single
 * noisy frame (e.g. knee angle jitter right at a state-machine boundary)
 * doesn't flip the displayed text. A candidate at a STRICTLY higher
 * priority (lower number) than what's currently shown always pre-empts
 * immediately — safety must never wait. A same-or-lower-priority candidate
 * must be the top pick continuously for FEEDBACK_MIN_PERSISTENCE_MS before
 * it actually replaces the displayed one.
 */
export function createFeedbackStabilityTracker(thresholds = SQUAT_THRESHOLDS) {
  let displayed = null;
  let pending = null;
  let pendingSince = null;

  function update(candidate, timestamp) {
    if (!candidate) {
      displayed = null;
      pending = null;
      pendingSince = null;
      return null;
    }
    if (!displayed) {
      displayed = candidate;
      pending = null;
      pendingSince = null;
      return displayed;
    }
    if (candidate.id === displayed.id) {
      pending = null;
      pendingSince = null;
      return displayed;
    }
    if (candidate.priority < displayed.priority) {
      displayed = candidate;
      pending = null;
      pendingSince = null;
      return displayed;
    }
    if (!pending || pending.id !== candidate.id) {
      pending = candidate;
      pendingSince = timestamp;
      return displayed;
    }
    if (timestamp - pendingSince >= thresholds.FEEDBACK_MIN_PERSISTENCE_MS) {
      displayed = candidate;
      pending = null;
      pendingSince = null;
    }
    return displayed;
  }

  function reset() {
    displayed = null;
    pending = null;
    pendingSince = null;
  }

  return { update, reset };
}
