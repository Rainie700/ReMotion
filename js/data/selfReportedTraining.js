export const SELF_REPORT_SCHEMA = "self-reported-training-1";
const integer = value => typeof value === "number" && Number.isInteger(value) && value >= 0;
export function validateSelfReportedAmount(actual, measurementType) {
  if (!actual || Object.keys(actual).sort().join() !== ["basis","durationSeconds","leftReps","rightReps","totalReps"].sort().join()) return false;
  if (measurementType === "duration") return actual.basis === "duration" && integer(actual.durationSeconds) && actual.durationSeconds > 0 && actual.durationSeconds <= 86400 && actual.totalReps === null && actual.leftReps === null && actual.rightReps === null;
  if (measurementType !== "repetition" || actual.durationSeconds !== null) return false;
  if (actual.basis === "total") return integer(actual.totalReps) && actual.totalReps > 0 && actual.totalReps <= 100000 && actual.leftReps === null && actual.rightReps === null;
  return actual.basis === "per_side" && actual.totalReps === null && integer(actual.leftReps) && integer(actual.rightReps) && actual.leftReps + actual.rightReps > 0 && actual.leftReps <= 100000 && actual.rightReps <= 100000;
}
export function selfReportedId(patientId, sessionId) {
  return typeof patientId === "string" && patientId && !patientId.includes("/") && patientId.length <= 128 && typeof sessionId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(sessionId) ? `${patientId}_${sessionId}` : null;
}
export function buildSelfReportedTraining(input, exercise, { reportedAt, dateKey, therapistId = "", relationId = "" }) {
  const id = selfReportedId(input.patientId, input.sessionId);
  const measurementType = exercise?.measurementType || exercise?.raw?.measurementType;
  if (!id || !exercise || exercise.id !== input.exerciseId || input.unrecordedPracticeAttested !== true || typeof input.note !== "string" || input.note.trim().length > 500 || !validateSelfReportedAmount(input.actual, measurementType)) return { error: "invalid_input" };
  return { record: { id, sessionId: input.sessionId, schemaVersion: SELF_REPORT_SCHEMA, patientId: input.patientId, therapistId, relationId, exerciseId: exercise.id, exerciseName: exercise.name, measurementType, source: "self_report", unrecordedPracticeAttested: true, actual: { ...input.actual }, note: input.note.trim(), reportedAt, dateKey, status: "recorded", voidedAt: null, voidReason: "" } };
}
export function sameSelfReportedTraining(a, b) {
  return a.patientId === b.patientId && a.exerciseId === b.exerciseId && a.measurementType === b.measurementType && ["basis","durationSeconds","leftReps","rightReps","totalReps"].every(k => a.actual?.[k] === b.actual?.[k]) && a.note === b.note && a.source === b.source && a.status === "recorded";
}
export function selfReportedAmountText(record) {
  const a = record.actual;
  if (!validateSelfReportedAmount(a, record.measurementType)) return "回報量無法確認";
  return a.basis === "duration" ? `${a.durationSeconds} 秒（本人填寫）` : a.basis === "per_side" ? `左 ${a.leftReps} 次／右 ${a.rightReps} 次` : `${a.totalReps} 次（合計）`;
}
