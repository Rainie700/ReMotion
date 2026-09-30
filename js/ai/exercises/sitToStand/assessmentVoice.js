import { FA5X_PROMPTS, FA5X_PRIORITY_PROMPTS, FA5X_VOICE_COOLDOWN_MS } from "./assessmentConstants.js";

/**
 * F01-A01 5xSTS — voice guard (pure). The session only emits a prompt when
 * the prompt CHANGES; this guard additionally stops the same line from being
 * spoken again within the cooldown (e.g. framing flickering between OK and
 * TOO_CLOSE). Countdown / 開始 / end lines are priority: always spoken,
 * interrupting anything else.
 *
 * decide(key, t) -> null (stay silent) or { text, interrupt }.
 */
export function createFa5xVoiceGuard({ cooldownMs = FA5X_VOICE_COOLDOWN_MS, prompts = FA5X_PROMPTS, priorityKeys = FA5X_PRIORITY_PROMPTS } = {}) {
  const lastSpokenAt = new Map();
  return {
    decide(key, t) {
      const prompt = prompts[key];
      if (!prompt || !prompt.voice) return null;
      const priority = priorityKeys.includes(key);
      if (!priority) {
        const last = lastSpokenAt.get(key);
        if (last != null && t - last < cooldownMs) return null;
      }
      lastSpokenAt.set(key, t);
      return { text: prompt.voice, interrupt: priority };
    },
    reset() {
      lastSpokenAt.clear();
    },
  };
}
