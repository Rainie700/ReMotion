/**
 * ReMotion F01 Video MVP Phase 1 — 5xSTS -> recommendation routing.
 *
 * Pure data + pure functions (no app.js / storage / Firebase imports) so it
 * can be unit tested directly.
 *
 * What this module decides, and what it deliberately does NOT decide:
 *   - WHICH exercises are F01 下肢功能 candidates: the fixed F01-01..F01-20
 *     list below (six-domain catalog ids). Ids not present in the catalog
 *     are simply skipped, never invented. Legacy ids (LE05...) are NOT used
 *     here — exerciseService's LEGACY_EXERCISE_ID_MAP only exists to keep
 *     old stored records readable.
 *   - WHICH of those relate to the sit-to-stand movement: an exercise is
 *     tagged with the 起身／下肢功能 goal only when its catalog
 *     `target_muscle` shares a muscle with the catalog's own 坐姿起立
 *     (F01-04) `target_muscle` — a data lookup, not a clinical judgement.
 *   - It NEVER reads the 5xSTS seconds. No cutoff, no ability tier, no
 *     severity is derived from the assessment result; ability stays the
 *     patient's own self-reported questionnaire answer.
 */

export const F01_FUNCTIONAL_DOMAIN = { key: "F01", label: "下肢功能" };

/** The training goal a 5xSTS-sourced plan carries (assessment.goals[0]). */
export const FIVE_X_STS_TRAINING_GOAL = "起身／下肢功能";

/** The catalog exercise that IS the assessed movement (坐姿起立). */
export const SIT_TO_STAND_EXERCISE_ID = "F01-04";

/**
 * Tie-break for the assessed movement (recommendationEngine `priorityBonus`).
 * Above the engine's AI_SUPPORTED_BONUS (0.5) so it wins ties, below every
 * real rule weight (min 1) so it can never outrank a better-matched
 * exercise (e.g. an exact-difficulty match for the patient's own level).
 */
export const ASSESSED_MOVEMENT_PRIORITY_BONUS = 0.75;

/** F01-01..F01-20 in six-domain catalog order (js/data/rehabExercises.js). */
export const F01_EXERCISE_IDS = [
  "F01-01", // 深蹲
  "F01-02", // 迷你深蹲
  "F01-03", // 靠牆半蹲
  "F01-04", // 坐姿起立
  "F01-05", // 終末膝伸直
  "F01-06", // 坐姿膝伸直
  "F01-07", // 坐姿膝彎曲
  "F01-08", // 直腿抬腿
  "F01-09", // 坐姿抬膝
  "F01-10", // 橋式
  "F01-11", // 站姿髖屈曲
  "F01-12", // 站姿髖伸展
  "F01-13", // 側躺髖外展
  "F01-14", // 側躺髖內收
  "F01-15", // 蚌殼式
  "F01-16", // 消防栓式
  "F01-17", // 雙腳提踵
  "F01-18", // 雙腳抬腳尖
  "F01-19", // 單腳提踵
  "F01-20", // 單腳抬腳尖
];

/** "股四頭肌、臀大肌" -> ["股四頭肌", "臀大肌"]. */
export function splitTargetMuscles(text) {
  if (!text) return [];
  return String(text)
    .split(/[、，,／/;；\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function targetMusclesOf(normalized) {
  return splitTargetMuscles(normalized && normalized.raw && normalized.raw.target_muscle);
}

/** The 坐站 exercise's own catalog target muscles — the reference set every other candidate is compared against. */
export function getSitToStandPrimeMovers(normalizedList) {
  const sts = (normalizedList || []).find((ex) => ex && ex.id === SIT_TO_STAND_EXERCISE_ID);
  return targetMusclesOf(sts);
}

/**
 * Builds the recommendation-engine candidate pool for a 5xSTS-sourced plan
 * from the full normalized catalog (exerciseService.listNormalized()).
 *
 * Each returned candidate is the normalized exercise with:
 *   - bodyPart = "下肢功能" (the functional domain — matches the
 *     assessment's bodyParts so the engine's hard body-part filter passes),
 *   - goal = FIVE_X_STS_TRAINING_GOAL only when it IS 坐站 or shares a
 *     target muscle with it, else null (so it can never score a goal match),
 *   - f01 = { originalCategory, sharedPrimeMovers, isAssessedMovement } for
 *     reason text / tests.
 */
export function buildF01CandidatePool(normalizedList) {
  const list = normalizedList || [];
  const byId = new Map(list.filter(Boolean).map((ex) => [ex.id, ex]));
  const primeMovers = getSitToStandPrimeMovers(list);

  return F01_EXERCISE_IDS
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((ex) => {
      const isAssessedMovement = ex.id === SIT_TO_STAND_EXERCISE_ID;
      const muscles = targetMusclesOf(ex);
      const sharedPrimeMovers = primeMovers.filter((pm) => muscles.some((m) => m.includes(pm)));
      const related = isAssessedMovement || sharedPrimeMovers.length > 0;
      return {
        ...ex,
        bodyPart: F01_FUNCTIONAL_DOMAIN.label,
        goal: related ? FIVE_X_STS_TRAINING_GOAL : null,
        ...(isAssessedMovement ? { priorityBonus: ASSESSED_MOVEMENT_PRIORITY_BONUS } : {}),
        f01: { originalCategory: ex.bodyPart, sharedPrimeMovers, isAssessedMovement },
      };
    });
}

/**
 * Traceable per-item reason for a 5xSTS-sourced recommendation. The FIRST
 * sentence is the one the recommendation card shows (app.js
 * buildCompactRecommendationReason keeps only the first clause), so it
 * always states the concrete link to the assessed movement.
 *
 * `item` is an engine output item (needs matchDetails); `candidate` is the
 * pool entry from buildF01CandidatePool().
 */
export function buildF01RecommendationReason(item, candidate, { abilityLabel = null } = {}) {
  if (!candidate || !candidate.f01) return null;
  const { sharedPrimeMovers, isAssessedMovement } = candidate.f01;
  const parts = [];

  if (isAssessedMovement) {
    parts.push("與五次坐站評估為同一個起身動作（坐姿起立），可直接練習站起與坐下的控制。");
  } else if (sharedPrimeMovers.length) {
    parts.push(`目標肌群包含${sharedPrimeMovers.join("、")}，與五次坐站起身動作（動作庫「坐姿起立」）的主要目標肌群相同。`);
  } else {
    parts.push("屬於 F01 下肢功能構面，作為下肢功能的輔助練習。");
  }

  const difficultyMatch = item && item.matchDetails ? item.matchDetails.difficultyMatch : "none";
  if (abilityLabel && difficultyMatch === "exact") parts.push(`難度符合你自評的「${abilityLabel}」程度。`);
  else if (abilityLabel && difficultyMatch === "adjacent") parts.push(`難度接近你自評的「${abilityLabel}」程度。`);

  if (item && item.matchDetails && item.matchDetails.aiSupportedBonus) parts.push("此動作支援 AI 動作分析。");
  return parts.join("");
}
