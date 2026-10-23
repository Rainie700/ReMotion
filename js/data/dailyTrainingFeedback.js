// Subjective self-report only. These values do not change D5 or completion credit.
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
export function buildDailyFeedbackRecord({ patientId, dateKey, effort, discomfort, note = "", expectedRevision }, previous, { reportedAt, therapistId = "", relationId = "" }) {
  const id = feedbackId(patientId, dateKey);
  if (!id || !Object.hasOwn(EFFORT_LABELS, effort) || !Object.hasOwn(DISCOMFORT_LABELS, discomfort) || typeof note !== "string" || note.trim().length > 500) return { error: "invalid_input" };
  if (!Number.isInteger(expectedRevision) || expectedRevision < 0 || expectedRevision !== (previous?.revision || 0)) return { error: "conflict" };
  if (previous && (previous.id !== id || previous.patientId !== patientId || previous.dateKey !== dateKey || previous.schemaVersion !== DAILY_FEEDBACK_VERSION || !Array.isArray(previous.reports) || previous.reports.length !== previous.revision)) return { error: "invalid_record" };
  if ((previous?.revision || 0) >= 100) return { error: "revision_limit" };
  const report = { source: "self_report", reportedBy: patientId, reportedAt, effort, discomfort, note: note.trim() };
  return { record: { id, patientId, dateKey, schemaVersion: DAILY_FEEDBACK_VERSION, therapistId, relationId, revision: expectedRevision + 1, reports: [...(previous?.reports || []), report] } };
}
