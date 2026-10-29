import { F01_GOALS, F01_EXERCISE_MAPPING, F01_EXERCISE_SPEC } from "./f01RecommendationSpec.js";
import { F01_AUTO_RECOMMENDATION_EXCLUSIONS } from "./f01DailyTargets.js";
import { F01_G01_SCREEN_GOAL_ID, G01_NOT_AUTO_INCLUDED, G01_SIT_TO_STAND_ID, G01_REASON_CATEGORY, buildG01ConditionSnapshot, screenG01SitToStand } from "./f01G01ConditionScreen.js";

/**
 * F01 Recommendation Phase C — explainable, rule-ordered recommendation (pure).
 *
 * Source of Truth: docs/specs/ReMotion復健資料庫_含F01推薦GoalMapping.xlsx
 * (README_推薦 / F01_Goal候選池 / F01_推薦GoalMapping / 推薦規則_MVP), via the
 * generated js/data/f01RecommendationSpec.js.
 *
 * Division of work: MediaPipe / CV measures the 5xSTS (landmarks, phases,
 * counting, timing, tracking). The functional assessment decides whether the
 * run is valid. THIS engine only: reads the functional domain, the user's goal
 * and conditions, selects candidates from the exercise database, orders them
 * and states why. It never reads the 5xSTS seconds (R11) and uses no weighted
 * score — the order is a fixed sequence of comparisons (R02 -> R07 -> id).
 *
 *   R00 gate        assessment status must be "completed"
 *   R01 domain      5xSTS -> F01; candidates only from F01-xx
 *   R02 goal        F01_Goal候選池: Direct before Supporting; not in the pool -> not a candidate
 *   R03 limitations excluded only when the exercise's own precautions text (verbatim)
 *                   contains the phrase behind a limitation the user ticked
 *   R04 equipment   NOT USED — no independent equipment field (data gap)
 *   R05 ability     NOT USED — difficulty mapping not validated (pending)
 *   R06 time        decides how many exercises (1-3) — engineering / UX rule
 *   R07 AI          same level: AI-supported first
 *   R08 diversity   same level + same AI: alternate the exercises' primary goal
 *                   (F01_推薦GoalMapping primary_goal_id) so picks are not all one kind
 *   tie-break       exerciseId ascending — deterministic, never random
 */

export const F01_RECOMMENDATION_RULE_VERSION = "f01-goal-rec-mvp-1.0";
export const F01_DOMAIN = Object.freeze({ id: "F01", label: "下肢功能" });
export const FIVE_TIMES_SIT_TO_STAND_TYPE = "five_times_sit_to_stand";

export const MATCH_LEVEL = Object.freeze({ DIRECT: "direct", SUPPORTING: "supporting", NONE: "none" });

/**
 * R06 — available time only decides the NUMBER of exercises. There is no
 * reliable per-exercise duration in the database (README_推薦 data gap), so no
 * claim is made that the plan fills exactly this many minutes.
 * Engineering / UX rule.
 */
export const F01_TIME_OPTIONS = Object.freeze([
  { minutes: 10, maxItems: 1 },
  { minutes: 15, maxItems: 2 },
  { minutes: 20, maxItems: 3 },
]);

/**
 * R03 — user-declared limitations (never a diagnosis). Each one is backed
 * ONLY by phrases that appear verbatim in at least one F01 exercise's
 * precautions, where that precaution says the exercise needs a doctor's /
 * physiotherapist's restriction or supervision, or names a safer version.
 * A generic "stop if it hurts" precaution is not used to exclude anything.
 */
export const F01_LIMITATIONS = Object.freeze([
  { id: "L01", label: "曾接受人工髖關節置換手術", phrases: ["全人工髖關節置換"] },
  { id: "L02", label: "膝關節近期手術（如半月板修補），或目前急性腫脹發炎", phrases: ["膝關節急性水腫發炎", "半月板修補", "膝關節急性術後"] },
  { id: "L03", label: "曾有阿基里斯腱斷裂手術，或嚴重慢性肌腱炎", phrases: ["阿基里斯腱斷裂術後", "重度慢性肌腱炎"] },
  { id: "L04", label: "曾有腹股溝疝氣或恥骨炎", phrases: ["腹股溝疝氣", "恥骨炎"] },
  { id: "L05", label: "目前無法安全地單腳站立", phrases: ["無法安全維持單側站立"] },
]);

const LEVEL_ORDER = { direct: 0, supporting: 1 };

/** The sentence of a precautions text that contains `phrase` (for a traceable exclusion reason). */
function sentenceContaining(text, phrase) {
  const parts = String(text || "").split(/(?<=[。；;])/);
  const hit = parts.find((s) => s.includes(phrase));
  return (hit || "").trim();
}

function buildReason({ exerciseName, matchLevel, goal, role, limitationsApplied }) {
  if (matchLevel === MATCH_LEVEL.DIRECT) {
    let reason = `${exerciseName}直接對應你選擇的「${goal.label}」訓練目標，屬於 F01 下肢功能訓練。`;
    if (limitationsApplied) reason += "並符合本次設定的訓練條件。";
    return reason;
  }
  let reason = `${exerciseName}可作為「${goal.label}」相關的輔助訓練${role ? `（${role}）` : ""}。`;
  if (limitationsApplied) reason += "並符合本次設定的訓練條件。";
  return reason;
}

/** Goal pool match level of an exercise for a goal ("direct" / "supporting" / "none"). */
export function getF01GoalMatchLevel(goalId, exerciseId) {
  const goal = F01_GOALS.find((g) => g.goalId === goalId);
  if (!goal) return MATCH_LEVEL.NONE;
  if (goal.directExerciseIds.includes(exerciseId)) return MATCH_LEVEL.DIRECT;
  if (goal.supportingExerciseIds.includes(exerciseId)) return MATCH_LEVEL.SUPPORTING;
  return MATCH_LEVEL.NONE;
}

/**
 * R03 hard filter for ONE exercise: the first ticked limitation (in
 * F01_LIMITATIONS order) whose phrase appears verbatim in the exercise's
 * precautions, or null. Shared by Phase C and the Phase D5 next-cycle
 * selection so both apply exactly the same filter.
 */
export function findF01LimitationConflict(exerciseId, limitationIds = []) {
  const precautions = (F01_EXERCISE_SPEC[exerciseId] || {}).precautions || "";
  const hit = F01_LIMITATIONS
    .filter((l) => limitationIds.includes(l.id))
    .map((l) => ({ l, phrase: l.phrases.find((p) => precautions.includes(p)) }))
    .find((x) => x.phrase);
  return hit ? { limitationId: hit.l.id, limitationLabel: hit.l.label, precaution: sentenceContaining(precautions, hit.phrase) } : null;
}

/**
 * R01 / R02 / R03 / R07 / R08 / tie-break — the full deterministic Phase C
 * order of a goal's candidates (before R06 cuts it to 1-3 items).
 * @returns {{ ordered: Array<{ exercise, matchLevel, aiSupported, primaryGoalId, role }>, excluded, missingExerciseIds, candidateCount }}
 */
export function orderF01GoalCandidates({ goal, limitationIds = [], catalog = [] }) {
  const byId = new Map((catalog || []).filter(Boolean).map((ex) => [ex.id || ex.exerciseId, ex]));

  // R02 — candidate pool from the goal (Direct, then Supporting); R01 domain lock
  const pooled = [
    ...goal.directExerciseIds.map((id) => ({ id, matchLevel: MATCH_LEVEL.DIRECT })),
    ...goal.supportingExerciseIds.map((id) => ({ id, matchLevel: MATCH_LEVEL.SUPPORTING })),
  ].filter((c) => c.id.startsWith(`${F01_DOMAIN.id}-`));

  const missingExerciseIds = [];
  const excluded = [];
  const candidates = [];
  for (const c of pooled) {
    const exercise = byId.get(c.id);
    if (!exercise) { missingExerciseIds.push(c.id); continue; } // listed in the spec, absent from the code database
    // R03 — hard filter on user-declared limitations vs verbatim precautions
    const conflict = findF01LimitationConflict(c.id, limitationIds);
    if (conflict) {
      excluded.push({ exerciseId: c.id, exerciseName: exercise.name, ...conflict });
      continue;
    }
    const mapping = F01_EXERCISE_MAPPING[c.id] || {};
    candidates.push({
      exercise,
      matchLevel: c.matchLevel,
      aiSupported: !!exercise.aiSupported,
      primaryGoalId: mapping.primaryGoalId || null,
      role: mapping.recommendationRole || "",
    });
  }

  // Fixed comparison order: level -> AI -> exerciseId (no score, no randomness)
  candidates.sort((a, b) =>
    (LEVEL_ORDER[a.matchLevel] - LEVEL_ORDER[b.matchLevel])
    || (Number(b.aiSupported) - Number(a.aiSupported))
    || String(a.exercise.id).localeCompare(String(b.exercise.id)));

  // R08 — inside each (level, AI) group, alternate primary goals (order otherwise kept)
  const ordered = [];
  let i = 0;
  while (i < candidates.length) {
    let j = i;
    while (j < candidates.length && candidates[j].matchLevel === candidates[i].matchLevel && candidates[j].aiSupported === candidates[i].aiSupported) j += 1;
    const group = candidates.slice(i, j);
    const buckets = new Map();
    group.forEach((c) => { const k = c.primaryGoalId || c.exercise.id; if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(c); });
    const queues = [...buckets.values()];
    while (queues.some((q) => q.length)) queues.forEach((q) => { if (q.length) ordered.push(q.shift()); });
    i = j;
  }
  return { ordered, excluded, missingExerciseIds, candidateCount: candidates.length };
}

/**
 * @param {object} input
 *   assessment: { status, sessionId, assessmentType }   (the stored 5xSTS result + its session id)
 *   selectedGoalId: "G01".."G05"
 *   limitationIds: string[]          (optional)
 *   availableMinutes: 10|15|20      (optional; default: 3 items)
 *   catalog: normalized exercises   (exerciseService.listNormalized())
 *   g01Conditions: buildG01ConditionSnapshot(...) of the assessment (G01 only; absent -> every field "missing")
 */
export function generateF01GoalRecommendation({ assessment, selectedGoalId, limitationIds = [], availableMinutes = null, catalog = [], excludeAutoRecommendationPending = false, g01Conditions = null }) {
  const base = { ruleVersion: F01_RECOMMENDATION_RULE_VERSION, items: [], excluded: [], missingExerciseIds: [] };

  // R00 — quality gate
  if (!assessment || assessment.status !== "completed") {
    return { ...base, status: "blocked", blockedReason: "assessment_not_completed" };
  }
  // R01 — functional domain
  if (assessment.assessmentType !== FIVE_TIMES_SIT_TO_STAND_TYPE) {
    return { ...base, status: "blocked", blockedReason: "unsupported_assessment_type" };
  }
  const goal = F01_GOALS.find((g) => g.goalId === selectedGoalId);
  if (!goal) return { ...base, status: "needs_goal" };

  const limitations = F01_LIMITATIONS.filter((l) => limitationIds.includes(l.id));
  const timeOption = F01_TIME_OPTIONS.find((o) => o.minutes === availableMinutes) || null;
  const maxItems = timeOption ? timeOption.maxItems : 3;

  const { ordered, excluded, missingExerciseIds, candidateCount } = orderF01GoalCandidates({ goal, limitationIds, catalog });

  // F01 batch 2 §3B — new-version automatic candidates skip exercises whose counting is pending
  // (F01-19). Applied BEFORE the R06 cut so the next candidate fills the slot; data untouched.
  const autoExcluded = excludeAutoRecommendationPending ? ordered.filter((c) => F01_AUTO_RECOMMENDATION_EXCLUSIONS[c.exercise.id]) : [];
  // G01 condition screen (docs/F01_G01_IMPLEMENTABLE_CONDITIONS.md) — G01 only, before the R06 cut;
  // an exercise it leaves out is stated in `excluded`, and no other exercise takes its slot.
  const screenG01 = goal.goalId === F01_G01_SCREEN_GOAL_ID;
  const conditionSnapshot = screenG01 ? (g01Conditions || buildG01ConditionSnapshot({})) : null;
  const sitToStand = screenG01 ? screenG01SitToStand(conditionSnapshot) : null;
  const screenExcluded = [];
  const screenOut = (c) => {
    if (!screenG01) return false;
    const id = c.exercise.id;
    if (G01_NOT_AUTO_INCLUDED[id]) {
      screenExcluded.push({ exerciseId: id, exerciseName: c.exercise.name, reason: G01_NOT_AUTO_INCLUDED[id], reasonCategory: G01_REASON_CATEGORY.NOT_INCLUDED });
      return true;
    }
    if (id === G01_SIT_TO_STAND_ID && !sitToStand.passed) {
      screenExcluded.push({ exerciseId: id, exerciseName: c.exercise.name, reason: sitToStand.reasons[0].code, reasonCategory: sitToStand.reasons[0].category,
        screenReasons: sitToStand.reasons.map((r) => ({ ...r, fields: r.fields.map((f) => ({ ...f })) })) });
      return true;
    }
    return false;
  };
  const picked = ordered.filter((c) => !autoExcluded.includes(c) && !screenOut(c)).slice(0, maxItems);
  const limitationsApplied = limitations.length > 0;
  const items = picked.map((c, idx) => {
    const matchedConditions = [
      { ruleId: "R00", text: "功能評估有效（已完成 5 / 5）" },
      { ruleId: "R01", text: `屬於 ${F01_DOMAIN.id} ${F01_DOMAIN.label}` },
      { ruleId: "R02", text: c.matchLevel === MATCH_LEVEL.DIRECT ? `直接對應「${goal.label}」` : `「${goal.label}」相關輔助訓練` },
    ];
    if (limitationsApplied) matchedConditions.push({ ruleId: "R03", text: "動作注意事項未涉及你勾選的限制" });
    if (screenG01 && c.exercise.id === G01_SIT_TO_STAND_ID) matchedConditions.push({ ruleId: "G01-C1", text: "通過本版協助條件篩選：你回報測驗時沒有用手撐、也沒有人協助（使用者回報，系統未驗證）" });
    if (c.aiSupported) matchedConditions.push({ ruleId: "R07", text: "支援即時動作辨識與回饋" });
    return {
      rank: idx + 1,
      exerciseId: c.exercise.id,
      exerciseName: c.exercise.name,
      functionalDomain: F01_DOMAIN.id,
      sourceAssessmentId: assessment.sessionId || null,
      selectedGoalId: goal.goalId,
      selectedGoalLabel: goal.label,
      matchLevel: c.matchLevel,
      matchedConditions,
      reason: buildReason({ exerciseName: c.exercise.name, matchLevel: c.matchLevel, goal, role: c.role, limitationsApplied }),
      aiSupported: c.aiSupported,
      recommendationRole: c.role,
      evidenceStatus: (F01_EXERCISE_SPEC[c.exercise.id] || {}).evidenceStatus || null,
    };
  });

  // Recommendation basis — only conditions that actually took part in the decision.
  const basis = [
    { key: "assessment", label: "功能評估", value: `${F01_DOMAIN.id} ${F01_DOMAIN.label}（五次坐站，已完成 5 / 5）` },
    { key: "goal", label: "訓練目標", value: goal.label },
  ];
  if (timeOption) basis.push({ key: "time", label: "可用時間", value: `${timeOption.minutes} 分鐘（決定建議動作數量）` });
  if (screenG01) basis.push({ key: "g01_conditions", label: "協助條件（使用者回報）", value: sitToStand.passed ? "沒有用手撐、沒有人協助（本版協助條件篩選）" : "未通過本版協助條件篩選" });
  if (limitationsApplied) basis.push({ key: "limitations", label: "排除條件", value: `${limitations.map((l) => l.label).join("、")}${excluded.length ? `（已排除 ${excluded.length} 個動作）` : "（沒有動作因此被排除）"}` });

  // F01 batch 2 §3B — fewer eligible exercises than the time option's slots is stated, never filled in.
  const shortfall = items.length > 0 && items.length < maxItems ? { requested: maxItems, available: items.length } : null;
  return {
    ...base,
    status: items.length ? "ok" : "no_candidates",
    ...(shortfall ? { shortfall } : {}),
    // G01 condition screen — the snapshot actually used, the rule version and the F01-04 outcome.
    ...(screenG01 ? { conditionScreen: { ...conditionSnapshot, sitToStandPassed: sitToStand.passed, reasonCodes: sitToStand.reasons.map((r) => r.code) } } : {}),
    functionalDomain: F01_DOMAIN.id,
    sourceAssessmentId: assessment.sessionId || null,
    selectedGoalId: goal.goalId,
    selectedGoalLabel: goal.label,
    availableMinutes: timeOption ? timeOption.minutes : null,
    limitationIds: limitations.map((l) => l.id),
    candidateCount,
    items,
    basis,
    // limitation exclusions (R03) first, then the batch-2 automatic-candidate exclusions (with a reason, no limitation),
    // then the G01 condition-screen exclusions (reason + reasonCategory; F01-04 also screenReasons)
    excluded: [...excluded, ...autoExcluded.map((c) => ({ exerciseId: c.exercise.id, exerciseName: c.exercise.name, reason: F01_AUTO_RECOMMENDATION_EXCLUSIONS[c.exercise.id] })), ...screenExcluded],
    missingExerciseIds,
  };
}
