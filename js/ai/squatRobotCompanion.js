import { SQUAT_TRAINING_STATE } from "./shared/trainingState.js";
import { SQUAT_FEEDBACK_INTENT } from "./squatFeedbackContent.js";

/**
 * ReMotion Phase 5.4.4 — pure decision logic for the training companion
 * robot. Reworked from Phase 5.4.2/5.4.3's (displayState, feedback,
 * squatCountingStarted) signature to key primarily off the new Training
 * Experience State (js/ai/shared/trainingState.js), which is now the single
 * source of truth for "what is the page showing right now" — this avoids
 * two competing call sites (one during the READY-hold/countdown sequence,
 * one from the per-frame feedback resolver) fighting over the robot's mood
 * on the same frame, which was a real bug during Phase 5.4.4 development.
 *
 * Deliberately does NOT react to momentary landmark dropout during ACTIVE
 * training — Phase 5.2's whole point was that brief dropouts shouldn't
 * flicker the UI, and the readiness dot + primary feedback banner already
 * communicate "please stay in frame" (see Phase 5.4.4 report item G on not
 * duplicating the same message in two places). The robot only reacts to
 * genuinely losing the body BEFORE training starts (WAITING_FOR_BODY).
 */
export function pickSquatRobotState(trainingState, feedback) {
  switch (trainingState) {
    case SQUAT_TRAINING_STATE.SUCCESS:
      return "celebrate";
    case SQUAT_TRAINING_STATE.INCOMPLETE:
      return "encourage";
    case SQUAT_TRAINING_STATE.LOADING:
    case SQUAT_TRAINING_STATE.WAITING_FOR_BODY:
      return "thinking";
    case SQUAT_TRAINING_STATE.READY:
      return "happy";
    case SQUAT_TRAINING_STATE.COUNTDOWN:
      return "encourage";
    case SQUAT_TRAINING_STATE.MILESTONE:
      return feedback && feedback.milestoneId === "complete" ? "celebrate" : "happy";
    case SQUAT_TRAINING_STATE.ACTIVE:
      if (feedback && feedback.intent === SQUAT_FEEDBACK_INTENT.MILESTONE) {
        return feedback.milestoneId === "complete" ? "celebrate" : "happy";
      }
      return "encourage";
    default:
      return "idle";
  }
}
