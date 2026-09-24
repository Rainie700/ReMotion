/**
 * ReMotion Phase 5.4.2 — pure voice-selection heuristic + tuning defaults.
 * Operates on a plain array of voice-like objects (matching the shape of
 * the browser's SpeechSynthesisVoice: { name, lang, localService, default })
 * so it's fully unit-testable without a real browser/speechSynthesis.
 *
 * IMPORTANT: the Web Speech API does NOT reliably expose voice gender. This
 * deliberately never hardcodes "pick the female voice" — it only uses
 * name/lang string hints as a soft tiebreaker, and always degrades
 * gracefully to "best available zh-TW voice" or null if nothing fits.
 */

// Name substrings seen on common platforms' zh-TW voices that *suggest* (not
// guarantee) a softer/more natural-sounding voice. Soft preference only.
const SOFT_VOICE_NAME_HINTS = ["female", "女", "hanhan", "meijia", "mei-jia", "yating", "hsiaochen", "國語"];

function scoreVoice(voice) {
  if (!voice || !voice.lang) return -1;
  const lang = String(voice.lang).toLowerCase();
  let score;
  if (lang === "zh-tw") score = 100;
  else if (lang.startsWith("zh")) score = 50; // any other Chinese variant (zh-CN/zh-HK/zh) still beats nothing
  else return -1; // never select a non-Chinese voice for zh-TW feedback

  const name = String(voice.name || "").toLowerCase();
  if (SOFT_VOICE_NAME_HINTS.some((hint) => name.includes(hint))) score += 5;
  if (voice.localService) score += 2; // local voices are typically lower-latency/more reliable than network voices
  return score;
}

/**
 * Returns the best available zh-TW-ish voice from the given list, or null
 * if none of the provided voices are Chinese at all (caller should then let
 * the browser use its own default voice rather than force a mismatched one).
 */
export function pickSquatVoice(voices) {
  if (!Array.isArray(voices) || !voices.length) return null;
  let best = null;
  let bestScore = -1;
  for (const voice of voices) {
    const score = scoreVoice(voice);
    if (score > bestScore) {
      bestScore = score;
      best = voice;
    }
  }
  return bestScore >= 0 ? best : null;
}

/**
 * UX tuning only (Category C engineering) — not a clinical/medical setting.
 * Slightly slower and very slightly higher-pitched than browser defaults
 * (rate 1.0 / pitch 1.0) for a clearer, softer-feeling cue at a distance.
 */
export const SQUAT_VOICE_SETTINGS = {
  rate: 0.95,
  pitch: 1.05,
  volume: 1,
};
