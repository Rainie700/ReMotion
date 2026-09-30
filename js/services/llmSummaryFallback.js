/**
 * Grounded LLM Weekly Summary — deterministic fallback (Phase 1A).
 * Builds a WeeklySummaryOutputV1 from a VerifiedContextV1 only: neutral,
 * factual Traditional Chinese; every number / date / exercise comes from the
 * context; a missing value is stated as not available (never 0, never guessed).
 * Used whenever an LLM output is unavailable or fails validation.
 */
import { LLM_SUMMARY_SCHEMA_VERSION } from "./llmSummarySchema.js";
import { buildContextFacts, monthDay } from "./llmSummaryFacts.js";

const hasReassessment = (ctx) => !!(ctx.functionalAssessment && ctx.functionalAssessment.valid && Number.isFinite(ctx.functionalAssessment.reassessmentMs));
const isActive = (ctx) => !hasReassessment(ctx) && !ctx.decision;

function trainingDaysSentence(ctx) {
  const days = ctx.training ? ctx.training.completedDays : null;
  if (!Number.isInteger(days)) return "本週正式訓練日資料尚未提供。";
  if (days === 0) return "本週尚未完成正式訓練日。";
  return isActive(ctx) ? `本週已完成 ${days} 個正式訓練日。` : `本週完成 ${days} 個正式訓練日。`;
}

function functionSentence(ctx) {
  const fa = ctx.functionalAssessment;
  if (!fa) return "本週沒有可用的五次坐站評估資料。";
  if (!fa.valid) return "本週五次坐站評估未通過有效性檢查，不顯示完成時間。";
  if (hasReassessment(ctx)) {
    const diff = fa.differenceDisplay === "與初次相同" ? "兩次完成時間相同。" : `完成時間差異為${fa.differenceDisplay}。`;
    return `五次坐站完成時間由 ${fa.baselineDisplay}變為 ${fa.reassessmentDisplay}，${diff}`;
  }
  const next = monthDay(ctx.period && ctx.period.endDate);
  return `目前功能基準為 ${fa.baselineDisplay}，${next ? `下一次再次評估預定於 ${next}。` : "再次評估尚未進行。"}`;
}

function nextPlanSentence(ctx) {
  const issues = ctx.reportedIssues || {};
  const d = ctx.decision;
  if (issues.professionalReviewRequired) return "下一週訓練安排需由專業人員確認後進行。";
  if (!d || d.confirmationStatus !== "accepted") {
    if (isActive(ctx)) {
      const names = (ctx.currentExercises || []).map((e) => e.name);
      return names.length ? `本週依目前安排進行：${names.join("、")}。` : "目前沒有已確認的訓練安排。";
    }
    return "下一週訓練安排尚未確認。";
  }
  if (d.confirmedAction === "no_auto_decision") return "本週結果不自動判定下一週安排，需再確認。";
  const byFrom = new Map((d.transitions || []).map((t) => [t.fromExerciseId, t]));
  const clauses = [];
  for (const t of d.transitions || []) clauses.push(t.transitionType === "maintain" ? `${t.fromName}維持原安排` : `${t.fromName}調整為${t.toName}`);
  for (const e of ctx.currentExercises || []) if (!byFrom.has(e.exerciseId)) clauses.push(`${e.name}的下一步安排尚待確認`);
  return clauses.length ? `下一週訓練中，${clauses.join("，")}。` : "下一週訓練安排已確認，動作細節尚未提供。";
}

function aiSentence(ctx) {
  const t = ctx.training || {};
  return t.aiPostureScoreAvailable && Number.isFinite(t.aiPostureAverage) ? `AI 姿勢分數平均為 ${t.aiPostureAverage} 分，為動作辨識參考分數。` : "";
}

function recordsSentence(ctx) {
  const n = ctx.training ? ctx.training.formalRecordCount : null;
  return Number.isInteger(n) && n > 0 ? `共 ${n} 筆正式訓練紀錄。` : "";
}

function headline(ctx) {
  const week = Number.isInteger(ctx.weekNumber) ? `第 ${ctx.weekNumber} 週` : "本週";
  if (hasReassessment(ctx)) return `${week}追蹤完成`;
  return isActive(ctx) ? `${week}追蹤進行中` : `${week}追蹤摘要`;
}

function attentionNotes(ctx) {
  const notes = [];
  const i = ctx.reportedIssues || {};
  if (i.newDiscomfort) notes.push("已回報新的或加重的不適。");
  if (i.newLimitation) notes.push("已回報新的限制條件。");
  if (i.professionalReviewRequired) notes.push("下一週安排需由專業人員確認。");
  if (ctx.functionalAssessment && !ctx.functionalAssessment.valid) notes.push("本週五次坐站評估結果無法作為比較依據。");
  return notes;
}

function professionalFunction(ctx) {
  const fa = ctx.functionalAssessment;
  if (!fa) return "無 5xSTS 評估資料。";
  if (!fa.valid) return "5xSTS 評估無效，未納入比較。";
  if (hasReassessment(ctx)) return `5xSTS 基準 ${fa.baselineMs} ms（${fa.baselineDisplay}）；再次評估 ${fa.reassessmentMs} ms（${fa.reassessmentDisplay}）；差異 ${fa.differenceMs} ms。`;
  const end = ctx.period && ctx.period.endDate;
  return `5xSTS 基準 ${fa.baselineMs} ms（${fa.baselineDisplay}）；再次評估尚未進行${end ? `（預定 ${end}）` : ""}。`;
}

function professionalTraining(ctx) {
  const t = ctx.training || {};
  const count = (n, some, none, missing) => (!Number.isInteger(n) ? missing : n === 0 ? none : some(n));
  const parts = [
    count(t.completedDays, (n) => `正式 F01 訓練日 ${n} 天`, "本週尚無正式 F01 訓練日", "正式訓練日資料未提供"),
    count(t.formalRecordCount, (n) => `正式訓練紀錄 ${n} 筆`, "本週尚無正式訓練紀錄", "正式訓練紀錄資料未提供"),
  ];
  if (t.aiPostureScoreAvailable && Number.isFinite(t.aiPostureAverage)) parts.push(`AI 姿勢分數平均 ${t.aiPostureAverage}（參考分數）`);
  else parts.push("AI 姿勢分數無資料");
  return `${parts.join("；")}。`;
}

function professionalPlan(ctx) {
  const d = ctx.decision;
  const review = ctx.reportedIssues && ctx.reportedIssues.professionalReviewRequired ? "需專業人員確認。" : "";
  if (!d || d.confirmationStatus !== "accepted") return `D5 決策尚未確認。${review}`;
  const rows = (d.transitions || []).map((t) => `${t.fromExerciseId} ${t.fromName} → ${t.toExerciseId} ${t.toName}（${t.transitionType}）`);
  return `D5 已確認：規則結果 ${d.ruleOutcome}，確認動作 ${d.confirmedAction}${rows.length ? `：${rows.join("；")}` : "，動作細節尚未提供"}。${review}`;
}

/** The core narrative (spec §13): training days, function result, next plan / reassessment. */
export function fallbackNarrative(ctx) {
  if (isActive(ctx) && Number.isInteger(ctx.weekNumber) && ctx.functionalAssessment && ctx.functionalAssessment.valid) {
    const days = ctx.training && Number.isInteger(ctx.training.completedDays) && ctx.training.completedDays > 0 ? `本週已完成 ${ctx.training.completedDays} 個正式訓練日。` : "本週尚未完成正式訓練日。";
    return `目前為第 ${ctx.weekNumber} 週追蹤中，${days}${functionSentence(ctx)}`;
  }
  return `${trainingDaysSentence(ctx)}${functionSentence(ctx)}${nextPlanSentence(ctx)}`;
}

/**
 * @param {object} ctx VerifiedContextV1
 * @returns {object} WeeklySummaryOutputV1 (fallback)
 */
export function buildFallbackSummary(ctx) {
  const facts = buildContextFacts(ctx);
  return {
    schemaVersion: LLM_SUMMARY_SCHEMA_VERSION,
    cycleId: ctx.cycleId,
    userSummary: {
      headline: headline(ctx),
      functionSummary: functionSentence(ctx),
      trainingSummary: `${trainingDaysSentence(ctx)}${recordsSentence(ctx)}${aiSentence(ctx)}`,
      nextPlanSummary: nextPlanSentence(ctx),
    },
    professionalSummary: {
      functionSummary: professionalFunction(ctx),
      trainingSummary: professionalTraining(ctx),
      planSummary: professionalPlan(ctx),
    },
    attentionNotes: attentionNotes(ctx),
    evidenceFactIds: [...facts.keys()],
  };
}
