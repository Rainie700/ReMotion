/**
 * 下一階段建議 — what next week actually changes, and why, from the stored
 * D5 proposal only (js/data/f01ProgressionDecision.js output). Pure.
 *
 * What the D5 rules can change (D5-0 V1):
 *   exercises  progress (NC-P01): at most ONE exercise, only along a Confirmed
 *              progression link; adjust (NC-A01): ONE exercise that a new
 *              limitation now excludes. Position is kept.
 *   nothing    maintain (NC-M01); adjust without a conflict (NC-A02 — the
 *              alternatives are for review only); progress with no Confirmed
 *              link (falls back to maintain).
 *   never      sets / repetitions / seconds (each exercise keeps its catalog
 *              default), the goal, or the number of exercises.
 * Wording avoids thresholds and clinical words (same rule as d5ProposalPage).
 */
import { F01_TRAINING_EXPOSURE_STATES } from "../data/f01ProgressionSpec.js";
import { F01_LIMITATIONS } from "../data/f01GoalRecommendation.js";
import { describeTimeDifference } from "../data/trackingComparison.js";

const DECISION_LABEL = { no_auto_decision: "不自動判定", maintain: "維持", progress: "進階", adjust: "調整" };
const TRANSITION_TEXT = { progression: "已確認的進階動作", regression: "較保守的替代動作", same_goal_replacement: "同目標的替代動作" };

/**
 * Last week vs next week, position by position (the rules keep positions).
 * @param d5        stored proposal.d5
 * @param nameOf    (exerciseId) => display name
 * @param volumeOf  (exerciseId, planItem|null) => training amount text or null
 * @param afterItems the ACTUAL next-week items (e.g. therapist-reviewed); default = the rule's proposal
 */
export function compareD5Weeks(d5, { nameOf = (id) => id, volumeOf = () => null, afterItems = null } = {}) {
  const before = d5.currentExerciseIds || [];
  const after = afterItems ? afterItems.map((it) => it.exerciseId) : d5.proposedExerciseIds || [];
  const rep = afterItems ? null : d5.replacedExercise || null; // a reviewed plan is not the rule's transition
  const itemAt = (i) => (afterItems ? afterItems[i] || null : null);
  const ex = (id, item = null) => (id ? { exerciseId: id, name: nameOf(id), volume: volumeOf(id, item) } : null);
  const rows = [];
  for (let i = 0; i < Math.max(before.length, after.length); i += 1) {
    const b = before[i] || null;
    const a = after[i] || null;
    const doseSet = !!(itemAt(i) && itemAt(i).dose);
    const change = b && a ? (a === b ? (doseSet ? "dose_changed" : "kept") : "replaced") : b ? "removed" : "added";
    rows.push({
      position: i + 1,
      before: ex(b),
      after: ex(a, itemAt(i)),
      change,
      note: change === "replaced" && rep && rep.toExerciseId === a ? (TRANSITION_TEXT[rep.transitionType] || "同目標的替代動作") : null,
    });
  }
  const changed = rows.filter((r) => r.change !== "kept");
  return { rows, contentChanged: changed.length > 0, changedCount: changed.length, keptCount: rows.length - changed.length };
}

/** One sentence: does next week's TRAINING change, or only the status? */
export function describeD5ContentChange(d5, comparison) {
  const rep = d5.replacedExercise;
  if (d5.selectionRuleId === "NC-N01") return "目前不會自動安排下一週。";
  if (d5.selectionRuleId === "NC-P01" && rep) return `進階：只把「${rep.fromExerciseName}」換成「${rep.toExerciseName}」（${TRANSITION_TEXT[rep.transitionType] || "替代動作"}），其餘 ${comparison.keptCount} 個動作保留。`;
  if (d5.selectionRuleId === "NC-P01") return "這週符合進階候選條件，但目前沒有已確認的進階動作，所以下一週的動作與上一週相同。";
  if (d5.selectionRuleId === "NC-A01" && rep) return `調整：「${rep.fromExerciseName}」與你目前勾選的情況不符，改為「${rep.toExerciseName}」，其餘 ${comparison.keptCount} 個動作保留。`;
  if (d5.selectionRuleId === "NC-A02") return "調整：系統不會自動更換動作，下一週的動作與上一週相同；下方的其他候選只供參考。";
  if (!comparison.contentChanged) return "維持：下一週的動作與上一週相同。";
  return `下一週有 ${comparison.changedCount} 個動作與上一週不同。`;
}

export const D5_DOSAGE_NOTE = "目前沒有依個人狀況調整訓練量；更換動作時採用新動作的預設量，組次可能因此不同。";

/** The inputs the rule actually used, as plain lines (no thresholds, no clinical words). */
export function explainD5Decision(d5) {
  const lines = [];
  if (!d5.assessmentValid) {
    lines.push("前後兩次五次坐站無法比較，所以不自動判定。");
  } else {
    const diff = describeTimeDifference(d5.changeMs) || "完成時間差異無法計算";
    const cls = {
      faster_beyond_reference_mdc: "，差異超出系統採用的參考範圍",
      slower_beyond_reference_mdc: "，差異超出系統採用的參考範圍",
      within_reference_mdc: "，差異在系統採用的參考範圍內，視為沒有明確變化",
    }[d5.changeClass] || "，目前無法歸類";
    lines.push(`${diff}${cls}。`);
  }
  const state = F01_TRAINING_EXPOSURE_STATES.find((s) => s.code === d5.trainingState);
  if (Number.isInteger(d5.completedTrainingDays)) {
    lines.push(`上一週完成 ${d5.completedTrainingDays} / ${d5.plannedTrainingDays} 個設定訓練日${state ? `（${state.labelZh}）` : ""}。`);
  }
  const newLimits = (d5.newLimitations || []).map((id) => (F01_LIMITATIONS.find((l) => l.id === id) || { label: id }).label);
  if (d5.hasNewOrWorseningDiscomfort) lines.push("你回報了新的或加重的不適。");
  if (newLimits.length) lines.push(`這次新增的情況：${newLimits.join("、")}。`);
  if (d5.gate === "GATE-LIMITATION") lines.push("有新的不適或情況時，規則不會進階。");
  const matrix = DECISION_LABEL[d5.matrixDecision] || d5.matrixDecision;
  const effective = DECISION_LABEL[d5.decision] || d5.decision;
  lines.push(`規則判定：${matrix}（${d5.decisionRuleId}）${effective !== matrix ? `；實際下一週：${effective}` : ""}。`);
  return lines;
}

/** Per-item line on the recommendation page of a next-stage plan (kept vs replaced). */
export function describeD5Item(d5, exerciseId) {
  const rep = d5 && d5.replacedExercise;
  if (rep && rep.toExerciseId === exerciseId) return `取代上一週的「${rep.fromExerciseName}」（${TRANSITION_TEXT[rep.transitionType] || "同目標的替代動作"}）`;
  if (d5 && (d5.currentExerciseIds || []).includes(exerciseId)) return "沿用上一週的動作";
  return null;
}

// ── LLM 推薦草稿: where the arrangement's decision came from ──

const DRAFT_PROVIDER_LABEL = { gemini: "Gemini", test_double: "展示用模擬回應，非真實 Gemini" };
const DRAFT_FAILURE_TEXT = { model_timeout: "模型逾時", model_error: "模型呼叫失敗", validation_failed: "模型輸出未通過驗證" };

/** One line: LLM draft / draft pending / 規則備用 (with why) / rule only. */
export function describeDecisionSource(arrangement) {
  const a = arrangement || {};
  if (a.review && a.requiresFreshBaseline) return "復健師另行安排；系統未自動判定";
  const attempt = a.draftAttempt;
  if (a.decisionSource === "llm_draft" && a.draft) {
    const d = a.draft;
    return `LLM 推薦草稿（${DRAFT_PROVIDER_LABEL[d.provider] || d.provider}）｜${d.choiceSpace === "single_option" ? "只有一個合法選項，沒有選擇空間" : `${d.legalPlanCount} 個合法選項`}`;
  }
  if (a.decisionSource === "llm_pending") return "LLM 推薦草稿產生中";
  if (a.decisionSource === "rule_fallback") {
    let why = "草稿不適用於目前內容";
    if (attempt && attempt.status === "pending") why = "草稿請求逾時未完成";
    else if (attempt && DRAFT_FAILURE_TEXT[attempt.failureReason]) why = DRAFT_FAILURE_TEXT[attempt.failureReason];
    const codes = attempt && attempt.validation && attempt.validation.errorCodes ? `：${attempt.validation.errorCodes.join("、")}` : "";
    return `規則備用（LLM 草稿未採用：${why}${codes}）`;
  }
  return "規則判定（未產生 LLM 草稿）";
}

export const LLM_DRAFT_DECISION_LABEL = Object.freeze({ progress: "進階", maintain: "維持", regress: "退階" });
