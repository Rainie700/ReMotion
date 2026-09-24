/**
 * ReMotion Phase 5.4.2 — feedback content pools, grouped by intent, plus the
 * (deliberately non-random) variation picker and the small icon-asset map.
 * Pure, DOM-free: no window/Image/DOM access, so fully unit-testable.
 *
 * Design notes (see Final Report):
 *  - Grouped by INTENT, not by exact UI state, so multiple related states
 *    (e.g. "descending" guidance and "insufficient depth" post-rep note)
 *    can share the same short pool of variations without inventing
 *    unrelated new copy.
 *  - Selection is ROUND-ROBIN (deterministic), never Math.random() — the
 *    same intent occurring again later advances to the next line in its
 *    pool and wraps around, so the same line never repeats back-to-back,
 *    without being unpredictable to test.
 *  - Safety/tracking messages (framing, "not detected", etc.) are
 *    deliberately single-variant — clarity matters more than variety when
 *    the message is "the system can't see you", so these are not run
 *    through the playful variation pools.
 */
export const SQUAT_FEEDBACK_INTENT = {
  ENCOURAGEMENT: "ENCOURAGEMENT",
  DEPTH: "DEPTH",
  RETURN_TO_STAND: "RETURN_TO_STAND",
  TRUNK_STABILITY: "TRUNK_STABILITY",
  KNEE_DIRECTION: "KNEE_DIRECTION",
  TRACKING: "TRACKING",
  COUNTDOWN: "COUNTDOWN",
  MILESTONE: "MILESTONE",
};

// Visual text pools — short, glanceable from 1.5-3m away.
const VISUAL_POOLS = {
  [SQUAT_FEEDBACK_INTENT.ENCOURAGEMENT]: ["準備好了", "很好，繼續保持", "節奏很穩", "做得不錯"],
  [SQUAT_FEEDBACK_INTENT.DEPTH]: ["再蹲低一點", "再往下蹲一些", "慢慢蹲低"],
  [SQUAT_FEEDBACK_INTENT.RETURN_TO_STAND]: ["慢慢站起來", "很好，準備起立", "穩穩地站起來"],
  [SQUAT_FEEDBACK_INTENT.TRUNK_STABILITY]: ["保持軀幹穩定", "身體保持直立", "試著減少前傾"],
  [SQUAT_FEEDBACK_INTENT.KNEE_DIRECTION]: ["注意膝蓋方向", "膝蓋與腳尖同方向", "留意膝蓋位置"],
};

// Voice pools — allowed to be a little more conversational than the visual
// text; shares the same intent grouping but not required to match verbatim.
const VOICE_POOLS = {
  [SQUAT_FEEDBACK_INTENT.ENCOURAGEMENT]: ["準備好了，我們開始吧", "很好，繼續保持這個節奏", "做得不錯，穩穩地繼續", "保持得很好，加油"],
  [SQUAT_FEEDBACK_INTENT.DEPTH]: ["再蹲低一點，慢慢來", "可以再往下蹲一些", "慢慢蹲低，穩住呼吸"],
  [SQUAT_FEEDBACK_INTENT.RETURN_TO_STAND]: ["慢慢站起來，穩住重心", "很好，準備站起來", "穩穩地站起來，做得很好"],
  [SQUAT_FEEDBACK_INTENT.TRUNK_STABILITY]: ["保持軀幹穩定，身體不要過度前傾", "試著讓身體保持直立一些"],
  [SQUAT_FEEDBACK_INTENT.KNEE_DIRECTION]: ["注意膝蓋方向，盡量與腳尖一致", "留意一下膝蓋的位置"],
  [SQUAT_FEEDBACK_INTENT.COUNTDOWN]: ["準備開始", "深呼吸，準備開始"],
};

const MILESTONE_VISUAL_POOLS = {
  percent_25: ["很好，已經開始了", "節奏很穩，繼續"],
  percent_50: ["已經過一半了", "節奏很好，繼續保持"],
  percent_75: ["快到了，繼續保持", "剩不到四分之一"],
  near_complete: ["快完成了，加油", "剩最後幾次"],
  complete: ["完成今天的目標！", "太棒了，目標達成"],
};
const MILESTONE_VOICE_POOLS = {
  percent_25: ["很好，已經開始囉，繼續保持", "節奏很穩，繼續加油"],
  percent_50: ["已經完成一半了，繼續保持", "過半了，做得很好"],
  percent_75: ["快到了，再堅持一下", "剩不到四分之一，繼續保持"],
  near_complete: ["快完成了，再加把勁", "只剩最後幾次了"],
  complete: ["恭喜，完成今天的目標了", "太棒了，你做到了"],
};

// Small, secondary icons — intentionally NOT assigned to every intent. Only
// assigned where an existing ReMotion asset genuinely fits; see Final
// Report "Asset Audit" for what was deliberately left out and why.
export const SQUAT_FEEDBACK_ICON = {
  [SQUAT_FEEDBACK_INTENT.ENCOURAGEMENT]: "/images/gamification/star_sparkle.png",
  [SQUAT_FEEDBACK_INTENT.DEPTH]: "/images/exercise/exercise_squat.png",
  [SQUAT_FEEDBACK_INTENT.RETURN_TO_STAND]: "/images/gamification/pulse_ring.png",
  [SQUAT_FEEDBACK_INTENT.TRUNK_STABILITY]: null,
  [SQUAT_FEEDBACK_INTENT.KNEE_DIRECTION]: null,
  [SQUAT_FEEDBACK_INTENT.TRACKING]: null,
  [SQUAT_FEEDBACK_INTENT.COUNTDOWN]: null,
};
export const SQUAT_MILESTONE_ICON = {
  percent_25: "/images/gamification/star_glow_01.png",
  percent_50: "/images/gamification/star_glow_02.png",
  percent_75: "/images/gamification/star_glow_03.png",
  near_complete: "/images/gamification/sparkle_01.png",
  complete: "/images/gamification/progress_star_complete.png",
};

/**
 * Deterministic round-robin content selector. Call pickVisual()/pickVoice()
 * only when a NEW occurrence of an intent/key begins (the caller is
 * responsible for that — e.g. only when the debounced feedback id actually
 * changes to a new value) so the displayed text stays stable frame-to-frame
 * and only rotates between genuinely distinct occurrences.
 */
export function createFeedbackContentSelector() {
  const lastIndex = new Map(); // key -> last index used

  function pick(pool, key) {
    if (!pool || !pool.length) return null;
    const prev = lastIndex.has(key) ? lastIndex.get(key) : -1;
    const next = (prev + 1) % pool.length;
    lastIndex.set(key, next);
    return pool[next];
  }

  function pickVisual(intent) {
    return pick(VISUAL_POOLS[intent], `visual:${intent}`);
  }
  function pickVoice(intent) {
    return pick(VOICE_POOLS[intent], `voice:${intent}`) || pickVisual(intent);
  }
  function pickMilestoneVisual(milestoneId) {
    return pick(MILESTONE_VISUAL_POOLS[milestoneId], `mvisual:${milestoneId}`);
  }
  function pickMilestoneVoice(milestoneId) {
    return pick(MILESTONE_VOICE_POOLS[milestoneId], `mvoice:${milestoneId}`) || pickMilestoneVisual(milestoneId);
  }
  function reset() {
    lastIndex.clear();
  }

  return { pickVisual, pickVoice, pickMilestoneVisual, pickMilestoneVoice, reset };
}
