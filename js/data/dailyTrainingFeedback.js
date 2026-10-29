// Subjective self-report only. These values do not change D5 or completion credit.
import { INCOMPLETE_REASON_LABELS } from "./incompleteTrainingFeedback.js";
export const DAILY_FEEDBACK_VERSION = "daily-training-feedback-1";
export const EFFORT_LABELS = Object.freeze({ not_practiced: "今天還沒練習", easy: "輕鬆", somewhat_hard: "有點吃力", very_hard: "很吃力", unknown: "不確定" });
export const DISCOMFORT_LABELS = Object.freeze({ no: "沒有不舒服", yes: "有不舒服", unknown: "不確定" });
export function feedbackId(patientId, dateKey) {
  if (typeof patientId !== "string" || !patientId || patientId.length > 128 || patientId.includes("/")) return null;
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  const day = new Date(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== dateKey) return null;
  return `${patientId}_${dateKey}`;
}
export function latestDailyFeedback(record) {
  return record && Array.isArray(record.reports) && record.reports.length ? record.reports.at(-1) : null;
}
/**
 * Who a report is about. A report saved from a tracking cycle's own entry carries
 * `subject: { kind: "tracking_cycle", cycleId, recommendationId }`; every other report (home, older
 * data) is a general report. Contexts are kept apart: a revision in one context never replaces the
 * answer of another, and older reports are never re-labelled.
 */
export const REPORT_SUBJECT_KIND = Object.freeze({ TRACKING_CYCLE: "tracking_cycle" });
export const GENERAL_CONTEXT = "general";
export const cycleContextKey = (cycleId) => `cycle:${cycleId}`;
export function reportContextKey(report) {
  const s = report && report.subject;
  return s && s.kind === REPORT_SUBJECT_KIND.TRACKING_CYCLE && typeof s.cycleId === "string" ? cycleContextKey(s.cycleId) : GENERAL_CONTEXT;
}
/** The reports of one context, in saved order (earlier ones are that context's revisions). */
export function reportsForContext(record, contextKey = GENERAL_CONTEXT) {
  return record && Array.isArray(record.reports) ? record.reports.filter((r) => reportContextKey(r) === contextKey) : [];
}
export function latestForContext(record, contextKey = GENERAL_CONTEXT) {
  return reportsForContext(record, contextKey).at(-1) || null;
}
const validSubject = (s) => !!s && s.kind === REPORT_SUBJECT_KIND.TRACKING_CYCLE
  && typeof s.cycleId === "string" && !!s.cycleId && s.cycleId.length <= 128 && !s.cycleId.includes("/")
  && typeof s.recommendationId === "string" && !!s.recommendationId && s.recommendationId.length <= 128;
export function buildDailyFeedbackRecord({ patientId, dateKey, effort, discomfort, note = "", expectedRevision, incompleteReason = "", subject = null }, previous, { reportedAt, therapistId = "", relationId = "", incompleteProgress = null }) {
  const id = feedbackId(patientId, dateKey);
  if (!id || !Object.hasOwn(EFFORT_LABELS, effort) || !Object.hasOwn(DISCOMFORT_LABELS, discomfort) || typeof note !== "string" || note.trim().length > 500) return { error: "invalid_input" };
  if (subject != null && !validSubject(subject)) return { error: "invalid_subject" };
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision !== (previous?.revision || 0)) return { error: "conflict" };
  if (previous && (previous.id !== id || previous.patientId !== patientId || previous.dateKey !== dateKey || previous.schemaVersion !== DAILY_FEEDBACK_VERSION || !Array.isArray(previous.reports) || previous.reports.length !== previous.revision)) return { error: "invalid_record" };
  if ((previous?.revision || 0) >= 100) return { error: "revision_limit" };
  if (incompleteReason && (!Object.hasOwn(INCOMPLETE_REASON_LABELS, incompleteReason) || !incompleteProgress || incompleteProgress.dateKey !== dateKey || incompleteProgress.completedCount >= incompleteProgress.requiredCount)) return { error: "invalid_incomplete_reason" };
  // A cycle report's incompletion must be about that same cycle.
  if (incompleteReason && subject && incompleteProgress.cycleId !== subject.cycleId) return { error: "invalid_incomplete_reason" };
  const report = { source: "self_report", reportedBy: patientId, reportedAt, effort, discomfort, note: note.trim() };
  if (subject) report.subject = { kind: subject.kind, cycleId: subject.cycleId, recommendationId: subject.recommendationId };
  if (incompleteReason) report.incompletion = { reason: incompleteReason, progress: incompleteProgress };
  return { record: { id, patientId, dateKey, schemaVersion: DAILY_FEEDBACK_VERSION, therapistId, relationId, revision: expectedRevision + 1, reports: [...(previous?.reports || []), report] } };
}
