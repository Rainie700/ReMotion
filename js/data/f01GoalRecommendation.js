import { F01_GOALS, F01_EXERCISE_MAPPING, F01_EXERCISE_SPEC } from "./f01RecommendationSpec.js";

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
 */
export function generateF01GoalRecommendation({ assessment, selectedGoalId, limitationIds = [], availableMinutes = null, catalog = [] }) {
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

  const picked = ordered.slice(0, maxItems);
  const limitationsApplied = limitations.length > 0;
  const items = picked.map((c, idx) => {
    const matchedConditions = [
      { ruleId: "R00", text: "功能評估有效（已完成 5 / 5）" },
      { ruleId: "R01", text: `屬於 ${F01_DOMAIN.id} ${F01_DOMAIN.label}` },
      { ruleId: "R02", text: c.matchLevel === MATCH_LEVEL.DIRECT ? `直接對應「${goal.label}」` : `「${goal.label}」相關輔助訓練` },
    ];
    if (limitationsApplied) matchedConditions.push({ ruleId: "R03", text: "動作注意事項未涉及你勾選的限制" });
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
  if (limitationsApplied) basis.push({ key: "limitations", label: "排除條件", value: `${limitations.map((l) => l.label).join("、")}${excluded.length ? `（已排除 ${excluded.length} 個動作）` : "（沒有動作因此被排除）"}` });

  return {
    ...base,
    status: items.length ? "ok" : "no_candidates",
    functionalDomain: F01_DOMAIN.id,
    sourceAssessmentId: assessment.sessionId || null,
    selectedGoalId: goal.goalId,
    selectedGoalLabel: goal.label,
    availableMinutes: timeOption ? timeOption.minutes : null,
    limitationIds: limitations.map((l) => l.id),
    candidateCount,
    items,
    basis,
    excluded,
    missingExerciseIds,
  };
}
