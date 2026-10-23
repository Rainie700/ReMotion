/**
 * F01 訓練建議頁 — what the page may truthfully say, derived only from data
 * the recommendation actually used. Pure: no storage, no clock.
 *
 * What took part in an ordinary (Phase C) recommendation
 * (js/data/f01GoalRecommendation.js):
 *   R00 the 5xSTS was completed (validity gate — the seconds are NOT read, R11)
 *   R02 the chosen goal (direct before supporting)      R03 ticked limitations
 *   R06 available time (number of items only)           R07 AI support first
 *   R08 alternate the exercises' primary goals          tie-break: exercise id
 * Not used: training history, difficulty / ability (R05), equipment (R04),
 * progression. A next-stage (D5) recommendation additionally used the last
 * cycle's before / after assessment and its training-completion days.
 */
import { orderF01GoalCandidates, MATCH_LEVEL, FIVE_TIMES_SIT_TO_STAND_TYPE } from "../data/f01GoalRecommendation.js";
import { F01_GOALS, F01_EXERCISE_SPEC } from "../data/f01RecommendationSpec.js";

export const F01_NOT_USED_IN_RANKING = Object.freeze(["過去的訓練紀錄", "動作難度分級", "器材條件"]);

const pad = (n) => String(n).padStart(2, "0");
/** Local "YYYY.MM.DD" of an ISO time, or null. */
function localDate(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : null;
}
const seconds = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} 秒` : null);

/** A stored 5xSTS session as recommendation evidence, checked against the patient. */
export function describeFa5xEvidence(session, patientId) {
  if (!session) return { valid: false, problem: "missing" };
  if (session.patientId !== patientId) return { valid: false, problem: "not_owned" };
  // A session without assessmentType predates 5xSTS and is a shoulder assessment (resolveAssessmentType).
  if ((session.assessmentType || "shoulder") !== FIVE_TIMES_SIT_TO_STAND_TYPE) return { valid: false, problem: "not_5xsts" };
  const result = session.result || {};
  const completed = session.status === "completed" && (result.status ? result.status === "completed" : result.repCount >= 5 && Number.isFinite(result.totalDurationMs));
  if (!completed || !Number.isFinite(result.totalDurationMs)) return { valid: false, problem: "not_completed" };
  return {
    valid: true,
    sessionId: session.id,
    label: "五次坐站（F01 下肢功能）",
    durationText: seconds(result.totalDurationMs),
    resultText: `完成 5 次，用時 ${seconds(result.totalDurationMs)}`,
    dateText: localDate(result.measuredAt || session.completedAt),
  };
}

/**
 * Evidence of a next-stage (D5) plan: the last cycle's before / after 5xSTS
 * and its training-completion days, exactly as stored on the proposal.
 */
export function describeD5Evidence(rec, patientId, getSession) {
  const d5 = rec && rec.d5;
  if (!d5) return { valid: false, problem: "missing" };
  const before = describeFa5xEvidence(getSession(d5.baselineAssessmentId), patientId);
  const after = describeFa5xEvidence(getSession(d5.reassessmentId), patientId);
  if (!after.valid) return { valid: false, problem: after.problem };
  const days = Number.isInteger(d5.completedTrainingDays) && Number.isInteger(d5.plannedTrainingDays)
    ? `上一週完成訓練 ${d5.completedTrainingDays} / ${d5.plannedTrainingDays} 天`
    : null;
  return {
    valid: true,
    sessionId: after.sessionId,
    label: "上一週再次評估（五次坐站）",
    resultText: before.valid ? `${before.durationText} → ${after.durationText}` : after.resultText,
    dateText: after.dateText,
    extra: days,
  };
}

/**
 * Which recommendation the page shows: the one the user just opened if it is
 * theirs; otherwise the plan of their active F01 cycle; otherwise their latest
 * F01 plan. Never another account's record.
 */
export function pickF01RecommendationForPage({ patientId, requested = null, activeCycleRec = null, latest = null }) {
  // A next-stage (D5) proposal is a plan only once accepted; a draft is shown on its own proposal page.
  const own = (r) => r && r.kind === "f01_goal" && r.patientId === patientId && (!r.origin || r.status === "accepted") ? r : null;
  return own(requested) || own(activeCycleRec) || own(latest) || null;
}

/** The training amount the training page will use (same catalog fields as getExercisePageContext), or null. */
export function describeTrainingVolume(rawCatalog) {
  if (!rawCatalog) return null;
  const sets = Number(rawCatalog.defaultSets);
  const hasSets = Number.isFinite(sets) && sets > 0;
  if (rawCatalog.measurementType === "repetition" && Number(rawCatalog.defaultRepetitions) > 0) {
    return `${hasSets ? `${sets} 組 × ` : ""}每組 ${Number(rawCatalog.defaultRepetitions)} 下`;
  }
  if (rawCatalog.measurementType === "duration" && Number(rawCatalog.defaultDurationSeconds) > 0) {
    return `${hasSets ? `${sets} 組 × ` : ""}每組 ${Number(rawCatalog.defaultDurationSeconds)} 秒`;
  }
  return null;
}

/**
 * The exercise's own training focus from the exercise data: the FIRST sentence
 * of its training_goal only. The rest of that field quotes outside sources'
 * efficacy statements, which are never shown as a reason for this user.
 */
export function exerciseFocus(exerciseId) {
  const text = ((F01_EXERCISE_SPEC[exerciseId] || {}).trainingGoal || "").split("。")[0].trim();
  return text || null;
}

/**
 * Display text of a stored matched condition. The limitation filter only means
 * "no existing exclusion rule matched" — never "confirmed safe / suitable" —
 * so the stored R03 / NC-G04 wording is shown that way (stored data untouched).
 */
export function displayConditionText(condition) {
  if (condition && (condition.ruleId === "R03" || condition.ruleId === "NC-G04")) return "未命中現有的排除規則（注意事項沒有提到勾選的情況）";
  return condition ? condition.text : "";
}

/**
 * The amount the training page will use for a plan item, field by field: a
 * therapist-typed value where one was entered, otherwise the catalog default
 * (same merge as getExercisePageContext). A field the therapist left empty is
 * still "動作預設". Returns null when nothing is known.
 * @returns {{ parts: Array<{ field, value, source: "therapist"|"default" }>, byTherapist, allTherapist, text } | null}
 */
export function describePlanVolume(rawCatalog, dose) {
  const d = dose || {};
  const base = rawCatalog || {};
  const pick = (field, own, def) => (own ? { field, value: Number(own), source: "therapist" } : Number(def) > 0 ? { field, value: Number(def), source: "default" } : null);
  const sets = pick("sets", d.sets, base.defaultSets);
  const amount = base.measurementType === "repetition" ? pick("repetitions", d.repetitions, base.defaultRepetitions)
    : base.measurementType === "duration" ? pick("durationSeconds", d.durationSeconds, base.defaultDurationSeconds) : null;
  if (!amount) return null;
  const parts = [sets, amount].filter(Boolean);
  const piece = (x) => (x.field === "sets" ? `${x.value} 組` : `每組 ${x.value} ${x.field === "repetitions" ? "下" : "秒"}`);
  return {
    parts,
    byTherapist: parts.some((x) => x.source === "therapist"),
    allTherapist: parts.every((x) => x.source === "therapist"),
    text: parts.map(piece).join(" × "),
  };
}

const SOURCE_LABEL = { therapist: "復健師設定", default: "動作預設" };

/** One wording for every page: 「2 組 × 每組 10 下（動作預設）」 / 「…（復健師設定）」 / per field when mixed. */
export function formatPlanVolume(volume) {
  if (!volume) return null;
  if (!volume.byTherapist || volume.allTherapist) return `${volume.text}（${volume.byTherapist ? SOURCE_LABEL.therapist : SOURCE_LABEL.default}）`;
  return volume.parts.map((x) => `${x.field === "sets" ? `${x.value} 組` : `每組 ${x.value} ${x.field === "repetitions" ? "下" : "秒"}`}（${SOURCE_LABEL[x.source]}）`).join(" × ");
}

export const PLAN_VOLUME_SOURCE_NOTE = "標示「動作預設」的訓練量來自動作資料，未依個人狀況自動調整；標示「復健師設定」的是復健師檢視時填寫的數值。";

/** Data-backed reason lines for one recommended exercise (no claims beyond the rules that ran). */
export function explainF01Item(item, { limitationsApplied = false, isD5 = false } = {}) {
  const lines = [];
  if (!isD5) {
    if (item.matchLevel === MATCH_LEVEL.DIRECT) lines.push(`直接對應你選的目標「${item.selectedGoalLabel}」`);
    else if (item.matchLevel === MATCH_LEVEL.SUPPORTING) lines.push(`是「${item.selectedGoalLabel}」的輔助訓練`);
  }
  const focus = exerciseFocus(item.exerciseId);
  if (focus) lines.push(`動作資料的訓練重點：${focus}`);
  if (!isD5 && limitationsApplied) lines.push("未命中現有的排除規則：動作注意事項沒有提到你勾選的情況（不代表已確認安全或適合）");
  if (item.aiSupported) lines.push("支援 AI 動作辨識，練習時可即時計次與提醒");
  return lines;
}

/**
 * Exercises that met the same rules but were not picked (R06 cut the list by
 * time). Phase C only — a D5 plan was not built from this order.
 */
export function listF01OtherOptions(rec, catalog) {
  if (!rec || rec.origin) return [];
  const goal = F01_GOALS.find((g) => g.goalId === rec.selectedGoalId);
  if (!goal) return [];
  const picked = new Set((rec.items || []).map((it) => it.exerciseId));
  return orderF01GoalCandidates({ goal, limitationIds: rec.limitationIds || [], catalog }).ordered
    .filter((c) => !picked.has(c.exercise.id))
    .map((c) => ({
      exerciseId: c.exercise.id,
      exerciseName: c.exercise.name,
      matchLevel: c.matchLevel,
      aiSupported: c.aiSupported,
      trainingGoal: exerciseFocus(c.exercise.id),
    }));
}

/** How the main list was sized — so a top-N list is never presented as a complete prescription. */
export function describeF01ListSize(rec) {
  if (rec && rec.origin) return "動作由你已接受的下一階段建議決定。";
  return rec && rec.availableMinutes
    ? `依你選的 ${rec.availableMinutes} 分鐘決定列出 ${rec.items.length} 個動作，不是完整課表或處方。`
    : `未選擇可用時間，依規則最多列出 3 個動作，不是完整課表或處方。`;
}
