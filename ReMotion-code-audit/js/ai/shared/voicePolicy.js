import { SQUAT_THRESHOLDS } from "../squatConstants.js";
import { FEEDBACK_PRIORITY } from "../squatFeedback.js";

/**
 * ReMotion Phase 5.3 — pure, DOM-free voice-feedback decision logic. Never
 * touches window.speechSynthesis directly (that lives in app.js, since it's
 * inherently a browser API this Node-based test harness can't exercise) —
 * this module only decides WHETHER a given feedback should be spoken right
 * now, so the decision itself stays unit-testable.
 *
 * Rules (all Category C engineering/UX tolerances, never clinical pacing):
 *   - Never speak while something is already speaking.
 *   - The same feedback id will not repeat within its cooldown window.
 *   - Encouragement-tier feedback gets a much longer cooldown than
 *     actionable (safety/movement/form) feedback — it adds the least new
 *     information and would otherwise repeat every rep.
 *   - Rep counters ("8/10") are never candidates for voice at all — that
 *     decision is made by the caller simply never passing them in here.
 */
export function shouldSpeakFeedback(feedback, lastSpokenAt, now, isSpeaking, thresholds = SQUAT_THRESHOLDS) {
  if (!feedback) return false;
  if (isSpeaking) return false;
  const cooldownMs = feedback.priority === FEEDBACK_PRIORITY.ENCOURAGEMENT ? thresholds.VOICE_ENCOURAGEMENT_COOLDOWN_MS : thresholds.VOICE_DEFAULT_COOLDOWN_MS;
  const last = lastSpokenAt instanceof Map ? lastSpokenAt.get(feedback.id) : lastSpokenAt ? lastSpokenAt[feedback.id] : undefined;
  if (last != null && now - last < cooldownMs) return false;
  return true;
}

/** Small stateful convenience wrapper around shouldSpeakFeedback() + a per-id last-spoken-at map. */
export function createVoicePolicyTracker(thresholds = SQUAT_THRESHOLDS) {
  const lastSpokenAt = new Map();

  function shouldSpeak(feedback, now, isSpeaking) {
    return shouldSpeakFeedback(feedback, lastSpokenAt, now, isSpeaking, thresholds);
  }
  function markSpoken(feedback, now) {
    if (feedback) lastSpokenAt.set(feedback.id, now);
  }
  function reset() {
    lastSpokenAt.clear();
  }

  return { shouldSpeak, markSpoken, reset };
}
