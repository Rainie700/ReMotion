import { toLocalDateKey, formatDateKeyMonthDay, isCompletedFiveTimesSitToStandResult } from "./trackingCycle.js";

/**
 * Phase D4 — baseline vs reassessment 5xSTS comparison for ONE tracking
 * cycle (pure, read-only, derived — nothing here is stored).
 *
 * Sources of truth: the cycle (baselineAssessmentId / reassessmentId /
 * completedTrainingDates) and the two stored 5xSTS sessions. Times come only
 * from each session's stored result.totalDurationMs (the same value the 5xSTS
 * result page shows); nothing is recomputed from reps or landmarks.
 *
 * Wording is strictly descriptive ("少 / 多 X 秒"): no improvement / decline /
 * maintain / progression judgement and no percentage.
 */

export const FIVE_TIMES_SIT_TO_STAND_TYPE = "five_times_sit_to_stand";
const EXPECTED_REPS = 5;

/** Same formatting as the 5xSTS result page (fmtFa5xSec): one decimal + 秒. */
export function formatSeconds(ms) {
  return `${(ms / 1000).toFixed(1)} 秒`;
}

/**
 * Neutral sentence for a difference computed from RAW milliseconds
 * (reassessment - baseline). Only the final text is rounded, so 8940 vs 8860
 * ms reads "少 0.1 秒", never 0.
 */
export function describeTimeDifference(changeMs) {
  if (!Number.isFinite(changeMs)) return null;
  if (changeMs === 0) return "本次完成時間與初次相同";
  const amount = (Math.abs(changeMs) / 1000).toFixed(1);
  if (amount === "0.0") return "本次完成時間與初次相差不到 0.1 秒";
  return changeMs < 0 ? `本次完成時間較初次少 ${amount} 秒` : `本次完成時間較初次多 ${amount} 秒`;
}

function sessionIsFiveTimesSitToStand(session) {
  // Same rule as functionalAssessmentService.resolveAssessmentType (a session
  // without assessmentType is a legacy shoulder session, never a 5xSTS).
  return !!session && session.assessmentType === FIVE_TIMES_SIT_TO_STAND_TYPE;
}

/**
 * result.repDurationsMs per rep = hip leaving the seat (RISE_ONSET_DISPLACEMENT)
 * -> hip first back on the seat (SEATED_RETURN_DISPLACEMENT_MAX). It excludes the
 * reaction time, the forward-lean start and the time on the seat between reps,
 * so it is NOT a full sit-to-stand time and never adds up to totalDurationMs.
 * repComparison is kept as data only; the comparison page does not display it.
 */
function validRepDurations(result) {
  const reps = result && result.repDurationsMs;
  return Array.isArray(reps) && reps.length === EXPECTED_REPS && reps.every((ms) => Number.isFinite(ms) && ms > 0) ? reps : null;
}

/** Local date of the REAL measurement (never a debug date); null when unknown (never 1970). */
function measuredDateKey(session) {
  const at = (session.result && session.result.measuredAt) || session.completedAt;
  return at ? toLocalDateKey(at) : null;
}

/**
 * @returns {{ eligible: false, missing: string[] } |
 *           { eligible: true, baselineMs, reassessmentMs, changeMs, baselineSeconds, reassessmentSeconds, changeSeconds,
 *             baselineText, reassessmentText, differenceText, baselineDateKey, reassessmentDateKey,
 *             baselineDateText, reassessmentDateText, completedTrainingDays, completedTrainingDateKeys,
 *             repComparison: null | Array<{ repNumber, baselineMs, reassessmentMs, baselineText, reassessmentText }> }}
 */
export function buildTrackingComparison({ cycle, baselineAssessment, reassessment }) {
  const missing = [];
  if (!cycle) return { eligible: false, missing: ["找不到這個追蹤週期"] };
  if (cycle.functionalDomain !== "F01") missing.push("這個追蹤週期不是 F01 下肢功能");
  if (!cycle.reassessmentId) missing.push("尚未完成再次評估");

  const checkSession = (session, label, expectedId) => {
    if (!session) { missing.push(`找不到${label}資料`); return; }
    if (expectedId && session.id !== expectedId) missing.push(`${label}不屬於這個追蹤週期`);
    if (session.patientId !== cycle.userId) missing.push(`${label}不屬於此使用者`);
    if (!sessionIsFiveTimesSitToStand(session)) missing.push(`${label}不是五次坐站測試`);
    const result = session.result || null;
    const hasTime = !!result && Number.isFinite(result.totalDurationMs) && result.totalDurationMs > 0;
    // Legacy / damaged record: completed session but no usable total time.
    if (session.status === "completed" && !hasTime) missing.push(`${label}：此筆評估缺少可比較的完成時間`);
    else if (session.status !== "completed" || !isCompletedFiveTimesSitToStandResult(result)) missing.push(`${label}未完成（沒有完成 5 次）`);
  };
  checkSession(baselineAssessment, "初次評估", cycle.baselineAssessmentId);
  if (cycle.reassessmentId) {
    checkSession(reassessment, "再次評估", cycle.reassessmentId);
    if (reassessment && (!reassessment.result || reassessment.result.trackingCycleId !== cycle.id)) missing.push("再次評估沒有連結到這個追蹤週期");
  }
  if (missing.length) return { eligible: false, missing: [...new Set(missing)] };

  const baselineMs = baselineAssessment.result.totalDurationMs;
  const reassessmentMs = reassessment.result.totalDurationMs;
  const changeMs = reassessmentMs - baselineMs; // raw ms first; only the text is rounded
  const baselineDateKey = measuredDateKey(baselineAssessment);
  const reassessmentDateKey = measuredDateKey(reassessment);
  const dates = [...new Set(cycle.completedTrainingDates || [])].sort();

  const baseReps = validRepDurations(baselineAssessment.result);
  const reReps = validRepDurations(reassessment.result);
  const repComparison = baseReps && reReps
    ? baseReps.map((ms, i) => ({ repNumber: i + 1, baselineMs: ms, reassessmentMs: reReps[i], baselineText: formatSeconds(ms), reassessmentText: formatSeconds(reReps[i]) }))
    : null;

  return {
    eligible: true,
    baselineMs,
    reassessmentMs,
    changeMs,
    baselineSeconds: baselineMs / 1000,
    reassessmentSeconds: reassessmentMs / 1000,
    changeSeconds: changeMs / 1000,
    baselineText: formatSeconds(baselineMs),
    reassessmentText: formatSeconds(reassessmentMs),
    differenceText: describeTimeDifference(changeMs),
    baselineDateKey,
    reassessmentDateKey,
    baselineDateText: formatDateKeyMonthDay(baselineDateKey),
    reassessmentDateText: formatDateKeyMonthDay(reassessmentDateKey),
    completedTrainingDays: dates.length,
    completedTrainingDateKeys: dates,
    repComparison,
  };
}
