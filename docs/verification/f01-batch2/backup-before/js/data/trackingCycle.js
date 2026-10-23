/**
 * Phase D1 — F01 7-day Tracking Cycle: pure date / status / card-model logic.
 *
 * ReMotion MVP tracking rule (NOT a clinical standard):
 *   Day 1 = the LOCAL calendar date of the baseline 5xSTS measurement.
 *   Day 7 = Day 1 + 6 calendar days = planned reassessment date.
 *   Day 1-6 -> "training"; Day 7 and later without a reassessment ->
 *   "ready_for_reassessment" (never "Day 8 / 7"); a cycle is "completed"
 *   ONLY when it has a reassessmentId — the date passing never completes it.
 *
 * Everything works on "YYYY-MM-DD" date keys. Day differences are calendar
 * differences computed from the key's y/m/d (anchored at UTC noon), never
 * elapsed milliseconds, so DST changes and midnight / UTC offsets cannot
 * shift a day. Nothing here reads the clock: callers pass todayDateKey.
 */

export const TRACKING_CYCLE_LENGTH_DAYS = 7;
export const TRACKING_RULE_VERSION = "f01-7day-mvp-1.0";

export const TRACKING_STATUS = Object.freeze({
  NONE: "none",
  TRAINING: "training",
  READY_FOR_REASSESSMENT: "ready_for_reassessment",
  COMPLETED: "completed",
});

const DATE_KEY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isDateKey(key) {
  const m = DATE_KEY_RE.exec(String(key || ""));
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

/** The LOCAL calendar date of a Date / ISO string / epoch ms as "YYYY-MM-DD" (same rule as app.js formatDateStr). */
export function toLocalDateKey(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
  if (Number.isNaN(d.getTime())) return null;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function keyToUtcNoon(key) {
  const [y, m, d] = key.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

export function addDaysToDateKey(key, days) {
  if (!isDateKey(key)) return null;
  const [y, m, d] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days, 12));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** Whole calendar days from fromKey to toKey (negative if toKey is earlier). */
export function diffDateKeys(fromKey, toKey) {
  if (!isDateKey(fromKey) || !isDateKey(toKey)) return null;
  return Math.round((keyToUtcNoon(toKey) - keyToUtcNoon(fromKey)) / 86400000);
}

export function getPlannedReassessmentDateKey(cycleStartDateKey) {
  return addDaysToDateKey(cycleStartDateKey, TRACKING_CYCLE_LENGTH_DAYS - 1);
}

/** "2026-10-04" -> "10/04" */
export function formatDateKeyMonthDay(key) {
  return isDateKey(key) ? `${key.slice(5, 7)}/${key.slice(8, 10)}` : "—";
}

/**
 * A stored 5xSTS result counts as a valid baseline only when completed.
 * Results saved before Phase B have no status; they only ever existed with
 * five reps and a total time (same rule as app.js getFa5xResultStatus()).
 */
export function isCompletedFiveTimesSitToStandResult(result) {
  if (!result) return false;
  if (result.status) return result.status === "completed";
  return result.repCount >= 5 && Number.isFinite(result.totalDurationMs);
}

/**
 * Derived (never stored) view state of a cycle on `todayDateKey`.
 * @returns {{ status, cycleDay|null, daysInCycle, daysPastPlanned|null,
 *            cycleStartDateKey, plannedReassessmentDateKey, calendarProgressDays }}
 */
export function getTrackingCycleViewState(cycle, todayDateKey) {
  if (!cycle) return { status: TRACKING_STATUS.NONE };
  const start = cycle.cycleStartDateKey;
  const planned = cycle.plannedReassessmentDateKey || getPlannedReassessmentDateKey(start);
  const base = {
    cycleStartDateKey: start,
    plannedReassessmentDateKey: planned,
    daysInCycle: TRACKING_CYCLE_LENGTH_DAYS,
  };
  if (cycle.reassessmentId) {
    return { ...base, status: TRACKING_STATUS.COMPLETED, cycleDay: null, daysPastPlanned: null, calendarProgressDays: TRACKING_CYCLE_LENGTH_DAYS };
  }
  const sinceStart = diffDateKeys(start, todayDateKey);
  const untilPlanned = diffDateKeys(todayDateKey, planned);
  if (sinceStart == null || untilPlanned == null) {
    return { ...base, status: TRACKING_STATUS.TRAINING, cycleDay: 1, daysPastPlanned: null, calendarProgressDays: 1 };
  }
  if (untilPlanned <= 0) {
    return { ...base, status: TRACKING_STATUS.READY_FOR_REASSESSMENT, cycleDay: null, daysPastPlanned: -untilPlanned, calendarProgressDays: TRACKING_CYCLE_LENGTH_DAYS };
  }
  const cycleDay = Math.max(1, sinceStart + 1); // a device clock before the start still reads Day 1
  return { ...base, status: TRACKING_STATUS.TRAINING, cycleDay, daysPastPlanned: null, calendarProgressDays: cycleDay };
}

/**
 * Home "本週功能追蹤" card content for a view state. `baselineText` must be
 * the caller's formatted baseline time from the stored 5xSTS result (same
 * formatter as the 5xSTS result page); `reassessmentDateKey` only for a
 * completed cycle. `calendarDots` shows DATE progress through the cycle — it
 * is NOT a count of training days completed.
 */
export function buildTrackingCardModel(viewState, { baselineText = null, reassessmentDateKey = null, completedDays = 0, todayProgress = null } = {}) {
  const status = viewState ? viewState.status : TRACKING_STATUS.NONE;
  const dots = (filled) => Array.from({ length: TRACKING_CYCLE_LENGTH_DAYS }, (_, i) => i < filled);
  // Phase D3 — completed training DAYS (unique completedTrainingDates) are a
  // separate number from the calendar day / dots; never shown as "N / 7" or %.
  const doneDaysFact = (label) => ({ label, value: `${completedDays} 天` });
  if (status === TRACKING_STATUS.NONE) {
    return {
      kind: status,
      heading: "本週功能追蹤",
      title: "尚未開始功能追蹤",
      body: "完成一次功能評估後，可建立個人基準並開始後續訓練追蹤。",
      facts: [],
      calendarDots: null,
      cta: { label: "開始功能評估", action: "start_assessment" },
    };
  }
  const baselineFact = baselineText ? [{ label: "初次評估", value: baselineText }] : [];
  if (status === TRACKING_STATUS.TRAINING) {
    // Today's progress only when it can be computed from real data (requiredCount > 0).
    const hasToday = todayProgress && todayProgress.requiredCount > 0;
    const todayDone = hasToday && todayProgress.isComplete;
    const ctaLabel = !hasToday ? "查看本週訓練" : todayDone ? "今日訓練已完成" : todayProgress.completedCount > 0 ? "繼續今日訓練" : "開始今日訓練";
    return {
      kind: status,
      heading: "本週功能追蹤",
      title: `F01 下肢功能｜第 ${viewState.cycleDay} / ${TRACKING_CYCLE_LENGTH_DAYS} 天`,
      body: null,
      facts: [
        ...baselineFact,
        doneDaysFact("本週已完成"),
        { label: "預計再次評估", value: formatDateKeyMonthDay(viewState.plannedReassessmentDateKey) },
      ],
      today: hasToday
        ? { completedCount: todayProgress.completedCount, requiredCount: todayProgress.requiredCount, isComplete: todayDone, text: `今日訓練 ${todayProgress.completedCount} / ${todayProgress.requiredCount}${todayDone ? " 已完成" : ""}` }
        : null,
      calendarDots: dots(viewState.calendarProgressDays),
      cta: { label: ctaLabel, action: "open_recommendation" },
    };
  }
  if (status === TRACKING_STATUS.READY_FOR_REASSESSMENT) {
    return {
      kind: status,
      heading: "可以進行再次評估了",
      title: `F01 下肢功能｜${TRACKING_CYCLE_LENGTH_DAYS} 日追蹤`,
      body: "重新進行五次坐站測試，之後可比較這段期間的功能變化。",
      facts: [
        ...baselineFact,
        doneDaysFact("本週已完成"),
        { label: "初次評估日期", value: formatDateKeyMonthDay(viewState.cycleStartDateKey) },
        { label: "預計再次評估", value: formatDateKeyMonthDay(viewState.plannedReassessmentDateKey) },
      ],
      today: null,
      calendarDots: dots(TRACKING_CYCLE_LENGTH_DAYS),
      cta: { label: "進行再次評估", action: "reassess" },
    };
  }
  return {
    kind: TRACKING_STATUS.COMPLETED,
    heading: "本週追蹤已完成",
    title: "F01 下肢功能",
    body: null,
    facts: [
      doneDaysFact("本週訓練完成"),
      { label: "初次評估日期", value: formatDateKeyMonthDay(viewState.cycleStartDateKey) },
      { label: "再次評估日期", value: formatDateKeyMonthDay(reassessmentDateKey) },
    ],
    today: null,
    calendarDots: null,
    cta: { label: "查看前後比較", action: "compare" },
  };
}

// ── Phase D3 — training completion (pure) ──────────────────────────────────

/**
 * Did a saved training analysisRecord reach its target? The detectors save a
 * record for a partial session too (e.g. stopped early after 1 rep), so a
 * record's existence is NOT completion. Uses the detector session's own
 * summary.completed when present (it knows per-side targets), otherwise the
 * one definition every F01 detector shares: totalReps >= targetReps > 0.
 */
export function isTrainingRecordCompleted(record) {
  if (!record) return false;
  const summary = record.summary || {};
  if (typeof summary.completed === "boolean") return summary.completed;
  return Number.isFinite(record.totalReps) && Number.isFinite(record.targetReps) && record.targetReps > 0 && record.totalReps >= record.targetReps;
}

/** Day 1..6 of the cycle (the training days; Day 7+ is for the reassessment). */
export function isTrainingDateInCycle(cycle, dateKey) {
  if (!cycle || !isDateKey(dateKey)) return false;
  const sinceStart = diffDateKeys(cycle.cycleStartDateKey, dateKey);
  const untilPlanned = diffDateKeys(dateKey, cycle.plannedReassessmentDateKey || getPlannedReassessmentDateKey(cycle.cycleStartDateKey));
  return sinceStart != null && untilPlanned != null && sinceStart >= 0 && untilPlanned > 0;
}

/**
 * Today's training progress for display. Uses the stored daily snapshot when
 * one exists (its required exercises never change afterwards); otherwise the
 * cycle's current recommendation exercise ids with nothing completed yet.
 */
export function getDailyProgressView(cycle, dateKey, currentRequiredExerciseIds = []) {
  const entry = cycle && cycle.dailyTrainingProgress ? cycle.dailyTrainingProgress[dateKey] : null;
  const required = entry ? entry.requiredExerciseIds : [...currentRequiredExerciseIds];
  const completed = entry ? entry.completedExerciseIds.filter((id) => required.includes(id)) : [];
  return {
    dateKey,
    snapshotted: !!entry,
    requiredExerciseIds: required,
    completedExerciseIds: completed,
    requiredCount: required.length,
    completedCount: completed.length,
    isComplete: required.length > 0 && completed.length === required.length,
  };
}
