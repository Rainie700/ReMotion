import { getDifficultyTier } from "./exerciseService.js";

/**
 * ReMotion 2.0 Phase 3 — Recommendation Engine.
 *
 * Pure, rule-based, fully explainable scoring. No LLM, no black-box model,
 * no medical reasoning beyond the four Assessment fields (bodyParts/goals/
 * abilityLevel/preferredSessionMinutes). Deliberately independent of
 * app.js and of localStorage — every function here takes plain data in
 * and returns plain data out, so it can be unit tested directly and swapped
 * in behind whatever UI calls it.
 *
 * This is a personalized PRACTICE SUGGESTION, never a diagnosis,
 * prescription, or treatment plan — callers are responsible for keeping
 * that framing in any UI text.
 */

export const RECOMMENDATION_CONFIG = {
  SCORE_WEIGHTS: {
    BODY_PART_MATCH: 4,
    GOAL_MATCH: 4,
    DIFFICULTY_EXACT_MATCH: 3,
    DIFFICULTY_ADJACENT_MATCH: 1,
    DURATION_COMPATIBLE: 1,
    // Deliberately tiny — aiSupported must never be able to out-rank a
    // genuinely mismatched exercise over a well-matched one. See TEST D.
    AI_SUPPORTED_BONUS: 0.5,
  },
  MIN_SESSION_ITEMS: 3,
  MAX_SESSION_ITEMS: 5,
  // Which difficulty tiers a given abilityLevel may fall back to when there
  // aren't enough exact-tier matches. beginner never reaches advanced, and
  // advanced never falls back to beginner — both directions stay one step.
  DIFFICULTY_ADJACENCY: {
    beginner: ["intermediate"],
    intermediate: ["beginner", "advanced"],
    advanced: ["intermediate"],
  },
  // ReMotion 2.0 Phase 3.1 — when assessment.preferredSessionMinutes is
  // set, the session composer targets this tolerance band instead of just
  // scoring duration as a minor bonus. 12–18 min for a 15-min target, etc.
  // Not a hard requirement — see buildSession()'s duration-aware path for
  // what happens when real data can't land inside the band.
  SESSION_DURATION_TOLERANCE_LOW: 0.8,
  SESSION_DURATION_TOLERANCE_HIGH: 1.2,
};

// Mirrors app.js's ABILITY_LEVEL_OPTIONS labels (kept as its own small
// constant so this module never imports from app.js — see module doc).
const ABILITY_LABELS = { beginner: "初階", intermediate: "一般", advanced: "進階" };

/** Same small free-text-minutes parser idea used elsewhere in the app for `estimated_minutes` (e.g. "5-8分鐘" -> 6.5) — kept local so this module has no app.js dependency. */
function parseEstimatedMinutes(text) {
  if (!text) return null;
  const nums = String(text).match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const values = nums.map(Number);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Real per-exercise time estimate straight from the catalog's own `estimated_minutes` text (via normalizeExercise()'s `raw` escape hatch) — null, never invented, when unavailable. */
export function estimateExerciseMinutes(exercise) {
  return parseEstimatedMinutes(exercise && exercise.raw && exercise.raw.estimated_minutes);
}

/**
 * Scores one normalized exercise against one assessment. Returns both the
 * numeric score and a `matchDetails` breakdown so callers (reason text,
 * tests) can see exactly which rules fired — nothing here is a black box.
 */
export function scoreExerciseForAssessment(exercise, assessment, config = RECOMMENDATION_CONFIG) {
  const weights = config.SCORE_WEIGHTS;
  const matchDetails = {
    bodyPartMatch: false,
    goalMatch: false,
    difficultyMatch: "none", // "exact" | "adjacent" | "none"
    durationCompatible: false,
    aiSupportedBonus: false,
  };
  let score = 0;

  const bodyParts = (assessment && assessment.bodyParts) || [];
  if (exercise.bodyPart && bodyParts.includes(exercise.bodyPart)) {
    matchDetails.bodyPartMatch = true;
    score += weights.BODY_PART_MATCH;
  }

  // Only exercises with a real (or Phase-1-tagged) goal can ever score a
  // goal match — an exercise with goal: null simply cannot match, never
  // guessed from its name/instructions.
  const goals = (assessment && assessment.goals) || [];
  if (exercise.goal && goals.includes(exercise.goal)) {
    matchDetails.goalMatch = true;
    score += weights.GOAL_MATCH;
  }

  const ability = assessment && assessment.abilityLevel;
  const exerciseTier = getDifficultyTier(exercise.difficulty);
  if (ability && exerciseTier) {
    if (exerciseTier === ability) {
      matchDetails.difficultyMatch = "exact";
      score += weights.DIFFICULTY_EXACT_MATCH;
    } else if ((config.DIFFICULTY_ADJACENCY[ability] || []).includes(exerciseTier)) {
      matchDetails.difficultyMatch = "adjacent";
      score += weights.DIFFICULTY_ADJACENT_MATCH;
    }
  }

  const preferredMinutes = assessment && assessment.preferredSessionMinutes;
  const estimatedMinutes = estimateExerciseMinutes(exercise);
  if (preferredMinutes && estimatedMinutes != null && estimatedMinutes <= preferredMinutes) {
    matchDetails.durationCompatible = true;
    score += weights.DURATION_COMPATIBLE;
  }

  if (exercise.aiSupported) {
    matchDetails.aiSupportedBonus = true;
    score += weights.AI_SUPPORTED_BONUS;
  }

  return { score, matchDetails };
}

/**
 * Builds one explainable, honest reason string. Never claims a goal match
 * that didn't happen (see Phase 3 spec section 6) and never frames this as
 * an AI diagnosis/prescription — aiSupported is mentioned as a bonus fact,
 * never the headline reason.
 */
export function buildRecommendationReason(exercise, assessment, matchDetails) {
  const parts = [];
  if (matchDetails.bodyPartMatch && exercise.bodyPart) parts.push(exercise.bodyPart);
  if (matchDetails.goalMatch && exercise.goal) parts.push(exercise.goal);
  if ((matchDetails.difficultyMatch === "exact" || matchDetails.difficultyMatch === "adjacent") && assessment.abilityLevel) {
    const label = ABILITY_LABELS[assessment.abilityLevel];
    if (label) parts.push(label);
  }

  let reason = parts.length ? `符合你目前設定的${parts.join("、")}需求。` : "符合你目前的部位與難度需求。";
  if (matchDetails.aiSupportedBonus) {
    reason += "此動作支援 AI 動作分析。";
  }
  return reason;
}

/** Small, seeded, deterministic hash — never Math.random(). Same input string always yields the same number. */
function hashStringToInt(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Groups already score-sorted candidates into same-score buckets, preserving score-desc order. */
function groupIntoScoreBuckets(sortedCandidates) {
  const buckets = [];
  sortedCandidates.forEach((c) => {
    const last = buckets[buckets.length - 1];
    if (last && last.score === c.score) last.members.push(c);
    else buckets.push({ score: c.score, members: [c] });
  });
  return buckets;
}

/**
 * Picks up to `maxItems` from `sortedCandidates` (already sorted score
 * desc, with a stable exerciseId tiebreak so ordering is deterministic
 * before variation is even considered). Candidates are grouped into score
 * "buckets"; whole buckets that fit are taken entirely (no variation —
 * there's no real choice to make). Only when a bucket is LARGER than the
 * remaining slots does `seedKey` decide, deterministically, which members
 * of that tied bucket fill the rest. Since seedKey normally embeds the
 * date, this means: same day -> same seed -> same picks (TEST E); a
 * different day only changes the outcome if there was an actual tie
 * competing for a boundary slot (TEST F) — never a bare Math.random().
 *
 * Used when there's no preferredSessionMinutes target (pure score-based
 * selection, unchanged since Phase 3).
 */
function selectWithDeterministicVariation(sortedCandidates, maxItems, seedKey) {
  const buckets = groupIntoScoreBuckets(sortedCandidates);

  const result = [];
  for (const bucket of buckets) {
    if (result.length >= maxItems) break;
    const remaining = maxItems - result.length;
    if (bucket.members.length <= remaining) {
      result.push(...bucket.members);
    } else {
      const startIdx = hashStringToInt(`${seedKey}:${bucket.score}`) % bucket.members.length;
      for (let i = 0; i < remaining; i += 1) {
        result.push(bucket.members[(startIdx + i) % bucket.members.length]);
      }
    }
  }
  return result;
}

/**
 * Full score-ordered candidate list (every candidate, not just the top
 * `maxItems`) with same-score groups internally rotated by the
 * deterministic per-day seed — the input order for the duration-aware
 * picker below, so which of several equally-good candidates gets tried
 * first can still vary sensibly day to day (same mechanism as
 * selectWithDeterministicVariation, just not cut to a fixed count).
 */
function buildDeterministicPoolOrder(sortedCandidates, seedKey) {
  const buckets = groupIntoScoreBuckets(sortedCandidates);
  return buckets.flatMap((bucket) => {
    if (bucket.members.length <= 1) return bucket.members;
    const startIdx = hashStringToInt(`${seedKey}:${bucket.score}`) % bucket.members.length;
    return bucket.members.map((_, i) => bucket.members[(startIdx + i) % bucket.members.length]);
  });
}

/**
 * ReMotion 2.0 Phase 3.1 — duration-aware session composition. Walks
 * candidates in (already deterministic) score order and greedily adds any
 * candidate that keeps the running total within
 * [target*LOW, target*HIGH] — critically, a candidate that would push the
 * total OVER the upper bound is skipped (not "stop entirely"), so a
 * smaller, slightly-lower-scored candidate further down the list still
 * gets a chance to fit. Stops early once both MIN_SESSION_ITEMS is
 * reached and the total lands inside the tolerance band.
 *
 * Deliberately does NOT force-fill up to MIN_SESSION_ITEMS by ignoring the
 * budget — Phase 3.1 spec section 1 is explicit that a smaller, more
 * accurate-duration session (even just 1-2 items) beats padding to 3 items
 * and blowing past the patient's requested time (the original "5 items /
 * 23 min for a 15-min target" complaint this phase exists to fix).
 * `limitedByAvailableData` (computed by the caller from item count) is
 * what flags this state to the UI — never silently hidden.
 */
function selectSessionForDuration(orderedPool, config, targetMinutes) {
  const lower = targetMinutes * config.SESSION_DURATION_TOLERANCE_LOW;
  const upper = targetMinutes * config.SESSION_DURATION_TOLERANCE_HIGH;
  const selected = [];
  let totalMinutes = 0;

  for (const candidate of orderedPool) {
    if (selected.length >= config.MAX_SESSION_ITEMS) break;
    const minutes = candidate.estimatedMinutes;
    const fits = minutes == null || totalMinutes + minutes <= upper;
    if (fits) {
      selected.push(candidate);
      totalMinutes += minutes || 0;
      if (selected.length >= config.MIN_SESSION_ITEMS && totalMinutes >= lower) break;
    }
  }
  return selected;
}

/**
 * Turns an array of already-scored candidates ({ exercise, score,
 * matchDetails }) into the final session item list. No phase
 * (warmup/main/cooldown) classification exists in the real data today, so
 * every item is placed in "main" — see module doc / Phase 3 report for why
 * this is a deliberately conservative choice rather than guessed medical
 * sequencing.
 */
export function buildSession(scoredCandidates, assessment, config = RECOMMENDATION_CONFIG, options = {}) {
  // Duration is computed once up front so both the selection step and the
  // final item-building step use the exact same numbers.
  const withDuration = scoredCandidates.map((c) => ({ ...c, estimatedMinutes: estimateExerciseMinutes(c.exercise) }));
  const sorted = [...withDuration].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.exercise.exerciseId).localeCompare(String(b.exercise.exerciseId));
  });

  const seedKey = options.seedKey || "default";
  const targetMinutes = assessment && assessment.preferredSessionMinutes;

  // Phase 3.1: when the patient has a time preference, session size is
  // driven by fitting that budget (see selectSessionForDuration) rather
  // than always maximizing toward MAX_SESSION_ITEMS. Without a time
  // preference, behavior is unchanged from Phase 3 (pure score order).
  const selected = targetMinutes
    ? selectSessionForDuration(buildDeterministicPoolOrder(sorted, seedKey), config, targetMinutes)
    : selectWithDeterministicVariation(sorted, config.MAX_SESSION_ITEMS, seedKey);

  const items = selected.map(({ exercise, score, matchDetails, estimatedMinutes }) => ({
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.name,
    bodyPart: exercise.bodyPart,
    // Only surface the goal on the item if it actually scored a goal
    // match — otherwise the UI would look like it's claiming a goal
    // connection that was never evaluated as true.
    goal: matchDetails.goalMatch ? exercise.goal : null,
    difficulty: exercise.difficulty,
    aiSupported: exercise.aiSupported,
    sets: exercise.sets,
    reps: exercise.reps,
    duration: exercise.duration,
    estimatedMinutes,
    score,
    section: "main",
    reason: buildRecommendationReason(exercise, assessment, matchDetails),
  }));

  const allMinutesKnown = items.length > 0 && items.every((it) => it.estimatedMinutes != null);
  const estimatedMinutes = allMinutesKnown ? Math.round(items.reduce((sum, it) => sum + it.estimatedMinutes, 0)) : null;

  return {
    items,
    sections: { warmup: [], main: items, cooldown: [] },
    estimatedMinutes,
    limitedByAvailableData: items.length < config.MIN_SESSION_ITEMS,
  };
}

/**
 * Top-level entry point: assessment + full candidate pool (normalized
 * exercises, ideally from exerciseService.listNormalizedWithKnownGoals())
 * -> a ready-to-store session. bodyPart is a HARD filter (an exercise
 * whose bodyPart isn't one of assessment.bodyParts is never eligible at
 * all — see Phase 3 spec section 23, "不要跨部位亂推薦"); an abilityLevel
 * that can't reach a given exercise's difficulty tier (even via the
 * adjacency fallback) is also excluded entirely, never "stuffed in" just
 * to fill slots (section 7).
 */
export function generateRecommendationForAssessment(assessment, candidates, options = {}) {
  const config = options.config || RECOMMENDATION_CONFIG;
  const emptyResult = { items: [], sections: { warmup: [], main: [], cooldown: [] }, estimatedMinutes: null, limitedByAvailableData: true };

  const bodyParts = (assessment && assessment.bodyParts) || [];
  if (!assessment || !bodyParts.length) return emptyResult;

  const bodyPartFiltered = (candidates || []).filter((ex) => ex.bodyPart && bodyParts.includes(ex.bodyPart));
  if (!bodyPartFiltered.length) return emptyResult;

  const ability = assessment.abilityLevel;
  const reachable = bodyPartFiltered.filter((ex) => {
    if (!ability) return true;
    const tier = getDifficultyTier(ex.difficulty);
    if (!tier) return true; // unknown difficulty -> don't exclude on a rule we can't evaluate
    if (tier === ability) return true;
    return (config.DIFFICULTY_ADJACENCY[ability] || []).includes(tier);
  });
  if (!reachable.length) return emptyResult;

  const scored = reachable.map((exercise) => {
    const { score, matchDetails } = scoreExerciseForAssessment(exercise, assessment, config);
    return { exercise, score, matchDetails };
  });

  const seedKey = `${options.patientId || ""}:${options.assessmentId || assessment.id || ""}:${options.dateStr || ""}`;
  return buildSession(scored, assessment, config, { seedKey });
}
