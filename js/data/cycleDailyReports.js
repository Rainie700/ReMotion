import { DAILY_FEEDBACK_VERSION, GENERAL_CONTEXT, cycleContextKey, feedbackId, reportContextKey, reportsForContext } from "./dailyTrainingFeedback.js";
import { addDaysToDateKey, isTrainingDateInCycle, toLocalDateKey } from "./trackingCycle.js";

/**
 * 本週練習回報 — what the patient reported during ONE tracking cycle, for people to look at on the
 * G01 next-stage pages (patient and therapist read the same result). Read-only and pure: nothing is
 * written, nothing here takes part in any arrangement, threshold or training amount.
 *
 * Sources (only data that exists):
 *   dailyTrainingFeedback/{patientId}_{dateKey}  one document per patient and day, append-only `reports`.
 *     Each report belongs to one context: a cycle report (`subject.cycleId`, saved from that cycle's own
 *     entry) or a general report (home, and all older data). The LAST report of a context is that
 *     context's answer; earlier ones are its revisions. Contexts never replace or merge into each other.
 *   trackingCycle.dailyTrainingProgress[dateKey] / completedTrainingDates   the cycle's own completion.
 *
 * Attribution is per FIELD, by what the question asked and what was saved:
 *   - a cycle report (subject = this cycle, saved from 本週期今日回報) is this cycle's report as a whole;
 *   - on a home (general) report, only the incompletion reason is about this cycle: it is asked under
 *     「今日 F01 追蹤訓練：x／y 個動作已達標」 and saves that cycle's id and target counts. Its effort
 *     (「今天練習時的吃力程度」), discomfort (「今天是否感到不舒服？」) and note name no cycle, so they stay general.
 *     Such a day is "incompletion only" — never counted as a reported day of the cycle.
 * A general answer is never counted: when it is the patient's own, made on that same day, it is listed apart
 * as 「同日期的一般回報（未確認屬於本週期）」 — the same date does not show it is about this cycle's training.
 * Anything pointing at another cycle is left out. Older data is never re-labelled. Fixed-practice records
 * live in their own collection and are never read.
 */
export const CYCLE_DAILY_REPORTS_VERSION = "cycle-daily-reports-3";
export const CYCLE_DAILY_REPORTS_NOTE = "以下回報供檢視參考，本版未用來自動決定進退階或訓練量。";

export const REPORT_STATE = Object.freeze({
  REPORTED: "reported",                  // a cycle report (saved from this cycle's own entry)
  INCOMPLETION_ONLY: "incompletion_only", // only a home incompletion reason is about this cycle; effort/discomfort not reported for it
  NOT_REPORTED: "not_reported",          // reports are loaded and none points at this cycle for that day
  NOT_LOADED: "not_loaded",              // the cloud copy is not (yet) loaded: whether a report exists is unknown
  LOAD_FAILED: "load_failed",            // the cloud load failed: unknown
  UNATTRIBUTABLE: "unattributable",      // a record exists but cannot be read as a report of this day
  OTHER_CYCLE: "other_cycle",            // the day's report points at another cycle
  NOT_IN_READ_SCOPE: "not_in_read_scope", // therapist view: nothing readable for that day (only reports stamped with
                                          // the current care relation are readable) — not the same as "not reported"
});
export const ATTRIBUTION = Object.freeze({
  CYCLE_ENTRY: "saved_from_cycle_entry",            // whole report, saved from this cycle's own entry (subject = this cycle)
  HOME_INCOMPLETION: "home_incompletion_for_cycle", // only the incompletion field of a home report (asked against this cycle's targets)
});

/** Day 1–6 date keys of the cycle (its training days), in order. */
export function cycleTrainingDateKeys(cycle) {
  if (!cycle || !cycle.cycleStartDateKey) return [];
  return [0, 1, 2, 3, 4, 5].map((i) => addDaysToDateKey(cycle.cycleStartDateKey, i)).filter((k) => isTrainingDateInCycle(cycle, k));
}

function trainingOf(cycle, dateKey) {
  const entry = cycle.dailyTrainingProgress && cycle.dailyTrainingProgress[dateKey];
  const completedDay = (cycle.completedTrainingDates || []).includes(dateKey);
  if (!entry) return { status: completedDay ? "completed" : "no_training_record", requiredCount: null, completedCount: null, attemptRecordIds: [] };
  const required = entry.requiredExerciseIds || [];
  const done = (entry.completedExerciseIds || []).filter((id) => required.includes(id));
  const attemptRecordIds = Object.keys(entry.attempts || {});
  const status = completedDay ? "completed" : done.length > 0 ? "partial" : attemptRecordIds.length ? "attempted_not_completed" : "started_no_record";
  return { status, requiredCount: required.length, completedCount: done.length, attemptRecordIds };
}

const namedCycle = (report) => (report && report.incompletion && report.incompletion.progress ? report.incompletion.progress.cycleId : null);
const historyOf = (reports) => reports.map((r) => ({ reportedAt: r.reportedAt, effort: r.effort, discomfort: r.discomfort, note: typeof r.note === "string" ? r.note : "", incompletionReason: r.incompletion ? r.incompletion.reason : null }));
/** One context's answer: its LAST report, with every revision kept (time order) for the history view. */
function answerOf(recordId, reports) {
  const last = reports.at(-1);
  const inc = last.incompletion || null;
  return {
    recordId,
    revisionCount: reports.length,
    reportedAt: last.reportedAt,
    effort: last.effort,
    discomfort: last.discomfort,
    note: typeof last.note === "string" ? last.note : "",
    incompletion: inc ? { reason: inc.reason, requiredCount: inc.progress ? inc.progress.requiredCount : null, completedCount: inc.progress ? inc.progress.completedCount : null } : null,
    history: historyOf(reports),
  };
}

function dayOf(record, patientId, dateKey, cycle) {
  if (!record) return { state: null };
  if (record.id !== feedbackId(patientId, dateKey) || record.patientId !== patientId || record.dateKey !== dateKey
    || record.schemaVersion !== DAILY_FEEDBACK_VERSION || !Array.isArray(record.reports) || !record.reports.length) {
    return { state: REPORT_STATE.UNATTRIBUTABLE, excludedRecordId: record.id };
  }
  const own = cycleContextKey(cycle.id);
  const cycleReports = reportsForContext(record, own);
  const general = reportsForContext(record, GENERAL_CONTEXT);
  const generalLast = general.at(-1) || null;
  const report = cycleReports.length ? { ...answerOf(record.id, cycleReports), attribution: ATTRIBUTION.CYCLE_ENTRY } : null;
  // The general (home) answer, field by field: only its incompletion can be about this cycle.
  let homeIncompletion = null;
  let sameDayGeneral = null;
  let generalUnattributable = false;
  let generalOtherCycle = false;
  if (generalLast) {
    const named = namedCycle(generalLast);
    const ownSameDay = generalLast.reportedBy === patientId && typeof generalLast.reportedAt === "string" && toLocalDateKey(generalLast.reportedAt) === dateKey;
    if (named === cycle.id && generalLast.reportedBy === patientId) {
      const p = generalLast.incompletion.progress;
      homeIncompletion = { recordId: record.id, attribution: ATTRIBUTION.HOME_INCOMPLETION, reportedAt: generalLast.reportedAt, reason: generalLast.incompletion.reason, requiredCount: p.requiredCount ?? null, completedCount: p.completedCount ?? null };
    } else if (named) generalOtherCycle = true;
    // effort / discomfort / note of a home report are general, whatever its incompletion names
    if (ownSameDay) sameDayGeneral = { dateKey, ...answerOf(record.id, general), incompletionFor: named === cycle.id ? "this_cycle" : named ? "other_cycle" : null };
    else if (!named) generalUnattributable = true;
  }
  const otherCycleReports = record.reports.some((r) => { const k = reportContextKey(r); return k !== own && k !== GENERAL_CONTEXT; });
  const state = report ? REPORT_STATE.REPORTED
    : homeIncompletion ? REPORT_STATE.INCOMPLETION_ONLY
    : generalOtherCycle || (otherCycleReports && !sameDayGeneral) ? REPORT_STATE.OTHER_CYCLE
    : generalUnattributable && !sameDayGeneral ? REPORT_STATE.UNATTRIBUTABLE
    : REPORT_STATE.NOT_REPORTED;
  return { state, report, homeIncompletion, sameDayGeneral, excludedRecordId: report || homeIncompletion ? null : record.id };
}

/**
 * @param {{ cycle, patientId, feedbackRecords: object[], feedbackLoadStatus: "loaded"|"failed"|"loading"|null|string, statusCheck?: object, readScope?: "own"|"linked_relation" }} input
 *   statusCheck: the last 狀況確認 of the proposal ({ hasNewOrWorseningDiscomfort, discomfortNote, at }) — kept apart, never combined
 * @returns {{ version, error?, loadState, days: object[], sameDayGeneral: object[], summary: object, statusCheck: object|null }}
 */
export function buildCycleDailyReports({ cycle, patientId, feedbackRecords = [], feedbackLoadStatus = null, statusCheck = null, readScope = "own" }) {
  if (!cycle || !patientId || cycle.userId !== patientId || (cycle.patientId && cycle.patientId !== patientId)) return { version: CYCLE_DAILY_REPORTS_VERSION, error: "cycle_not_owned", days: [], sameDayGeneral: [], summary: null, statusCheck: null };
  const loadState = feedbackLoadStatus === "loaded" ? "loaded" : feedbackLoadStatus === "failed" ? "failed" : "not_loaded";
  const own = (feedbackRecords || []).filter((r) => r && r.patientId === patientId);
  const days = cycleTrainingDateKeys(cycle).map((dateKey, i) => {
    const base = { dateKey, dayNumber: i + 1, training: trainingOf(cycle, dateKey) };
    // Not loaded / failed: a local copy may be stale or missing — no answer is shown, nothing reads as "not reported".
    if (loadState !== "loaded") return { ...base, reportState: loadState === "failed" ? REPORT_STATE.LOAD_FAILED : REPORT_STATE.NOT_LOADED, report: null, homeIncompletion: null, sameDayGeneral: null, excludedRecordId: null };
    const d = dayOf(own.find((r) => r.id === feedbackId(patientId, dateKey)), patientId, dateKey, cycle);
    const missing = readScope === "linked_relation" ? REPORT_STATE.NOT_IN_READ_SCOPE : REPORT_STATE.NOT_REPORTED;
    return { ...base, reportState: d.state || missing, report: d.report || null, homeIncompletion: d.homeIncompletion || null, sameDayGeneral: d.sameDayGeneral || null, excludedRecordId: d.excludedRecordId || null };
  });
  const reported = days.filter((d) => d.report);
  const by = (pick) => reported.reduce((acc, d) => { const k = pick(d.report); if (k) (acc[k] = acc[k] || []).push(d.dateKey); return acc; }, {});
  // Incompletion reasons about this cycle: the cycle report's own, else the home one (its source kept apart).
  const incompletionDates = {};
  const homeIncompletionDates = [];
  for (const d of days) {
    const reason = d.report && d.report.incompletion ? d.report.incompletion.reason : d.homeIncompletion ? d.homeIncompletion.reason : null;
    if (!reason) continue;
    (incompletionDates[reason] = incompletionDates[reason] || []).push(d.dateKey);
    if (!(d.report && d.report.incompletion)) homeIncompletionDates.push(d.dateKey);
  }
  const sameDayGeneral = days.filter((d) => d.sameDayGeneral).map((d) => d.sameDayGeneral);
  const summary = {
    dayCount: days.length,
    reportedDates: reported.map((d) => d.dateKey),
    notReportedDates: days.filter((d) => d.reportState === REPORT_STATE.NOT_REPORTED).map((d) => d.dateKey),
    unknownDates: days.filter((d) => [REPORT_STATE.NOT_LOADED, REPORT_STATE.LOAD_FAILED, REPORT_STATE.UNATTRIBUTABLE, REPORT_STATE.NOT_IN_READ_SCOPE].includes(d.reportState)).map((d) => d.dateKey),
    otherCycleDates: days.filter((d) => d.reportState === REPORT_STATE.OTHER_CYCLE).map((d) => d.dateKey),
    incompletionOnlyDates: days.filter((d) => d.reportState === REPORT_STATE.INCOMPLETION_ONLY).map((d) => d.dateKey),
    sameDayGeneralDates: sameDayGeneral.map((g) => g.dateKey),
    // effort / discomfort: cycle reports only (a home answer is never this cycle's)
    effortDates: by((r) => r.effort),
    discomfortDates: by((r) => r.discomfort),
    incompletionDates,
    homeIncompletionDates,
    revisedDates: reported.filter((d) => d.report.revisionCount > 1).map((d) => d.dateKey),
    completedTrainingDates: days.filter((d) => d.training.status === "completed").map((d) => d.dateKey),
    partialTrainingDates: days.filter((d) => d.training.status === "partial" || d.training.status === "attempted_not_completed").map((d) => d.dateKey),
  };
  const check = statusCheck && typeof statusCheck.hasNewOrWorseningDiscomfort === "boolean"
    ? { hasNewOrWorseningDiscomfort: statusCheck.hasNewOrWorseningDiscomfort, discomfortNote: statusCheck.discomfortNote || null, at: statusCheck.at || null }
    : null;
  return { version: CYCLE_DAILY_REPORTS_VERSION, cycleId: cycle.id, loadState, readScope, days, sameDayGeneral, summary, statusCheck: check };
}
