import { doc, getDocFromServer, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firestore } from "./firebase.js";
import { createCollection, storageService, withoutUndefined } from "./storageService.js";
import { relationService } from "./relationService.js";
import { isTrainingDateInCycle, toLocalDateKey } from "./trackingCycle.js";
import { trackingCycleService } from "./trackingCycleService.js";
import { buildDailyFeedbackRecord, feedbackId } from "./dailyTrainingFeedback.js";
import { currentIncompleteTrainingProgress } from "./incompleteTrainingFeedbackService.js";
import { progressFingerprint } from "./incompleteTrainingFeedback.js";

const records = createCollection("dailyTrainingFeedback");
function cache(record) {
  records.replaceAll([...records.list().filter((r) => r.id !== record.id), record]);
}
const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;
async function commitToCloud(input, context) {
  if (!firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== input.patientId) throw Object.assign(new Error("not_signed_in"), { code: "not_signed_in" });
  const ref = doc(firestore, "dailyTrainingFeedback", feedbackId(input.patientId, input.dateKey));
  try {
    return await runTransaction(firestore, async (tx) => {
    const snapshot = await tx.get(ref);
    const previous = snapshot.exists() ? snapshot.data() : null;
    const built = buildDailyFeedbackRecord(input, previous, context);
    if (built.error) throw Object.assign(new Error(built.error), { code: built.error, current: previous });
    tx.set(ref, { ...withoutUndefined(built.record), createdAt: previous?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
    // Cache just the subject's data; server timestamps are loaded on next login.
    return built.record;
    });
  } catch (e) {
    // A concurrent commit can fail the append-only rule before a transaction
    // retry. Fetch the owner's current document to report that as a conflict.
    if (e.code !== "conflict") {
      try {
        const current = await getDocFromServer(ref);
        if (current.exists() && current.data().revision !== input.expectedRevision) {
          throw Object.assign(new Error("conflict"), { code: "conflict", current: current.data() });
        }
      } catch (refreshError) {
        if (refreshError.code === "conflict") throw refreshError;
      }
    }
    throw e;
  }
}
/**
 * UX round 5/5 — the real reason a cloud save failed (Firestore error code -> one of the app's causes), so the sheet
 * says what actually happened instead of always guessing 「網路與登入」. The raw code is logged for diagnosis.
 */
export function classifyFeedbackSaveError(e) {
  const code = (e && e.code) || "";
  if (["conflict", "not_signed_in", "revision_limit", "invalid_record", "invalid_subject"].includes(code)) return code;
  if (code === "unauthenticated") return "not_signed_in";
  if (code === "permission-denied") return "cloud_rejected";
  if (code === "unavailable" || code === "deadline-exceeded") return "offline";
  if (code === "invalid-argument") return "invalid_payload";
  return "cloud_save_failed";
}
/** A retry whose first attempt DID commit (reply lost): the newest stored report is this same answer by this person. */
export function isSameLatestReport(current, input) {
  const last = current && Array.isArray(current.reports) ? current.reports[current.reports.length - 1] : null;
  if (!last || last.reportedBy !== input.patientId || current.revision !== (input.expectedRevision || 0) + 1) return false;
  const subjectId = (x) => (x && x.cycleId) || null;
  return last.effort === input.effort && last.discomfort === input.discomfort && (last.note || "") === String(input.note || "").trim()
    && subjectId(last.subject) === subjectId(input.subject) && ((last.incompletion && last.incompletion.reason) || "") === (input.incompleteReason || "");
}
export const dailyTrainingFeedbackService = {
  getForDay(patientId, dateKey) {
    const id = feedbackId(patientId, dateKey);
    return id ? records.getById(id) : null;
  },
  /** The patient's own daily records on this device (read-only). */
  listForPatient(patientId) {
    return patientId ? records.query((r) => r.patientId === patientId) : [];
  },
  listForTherapist(therapistId, patientId) {
    const relation = relationService.findAcceptedRelation(therapistId, patientId);
    if (!relation) return [];
    return records.query((r) => r.patientId === patientId && r.therapistId === therapistId && r.relationId === relation.id)
      .sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  },
  cloudStatus: () => storageService.getOptionalCloudLoadStatus("dailyTrainingFeedback"),
  async save(input, { commit = commitToCloud, now = () => new Date() } = {}) {
    const date = now();
    if (input.dateKey !== toLocalDateKey(date)) return { error: "day_changed" };
    // A cycle report is accepted only for the patient's own cycle, on one of its training days (Day 1–6).
    if (input.subject) {
      const cycle = trackingCycleService.getTrackingCycleById(input.subject.cycleId);
      if (!cycle || cycle.userId !== input.patientId || (cycle.patientId && cycle.patientId !== input.patientId)
        || cycle.recommendationId !== input.subject.recommendationId || !isTrainingDateInCycle(cycle, input.dateKey)) return { error: "invalid_subject" };
    }
    const relation = relationService.findAcceptedByPatientId(input.patientId)[0];
    const progress = input.incompleteReason ? currentIncompleteTrainingProgress(input.patientId, input.dateKey) : null;
    if (input.incompleteReason && (!progress || progressFingerprint(progress) !== input.progressFingerprint)) return { error: "progress_changed" };
    const context = { reportedAt: date.toISOString(), therapistId: relation?.therapistId || "", relationId: relation?.id || "", incompleteProgress: progress };
    const check = buildDailyFeedbackRecord(input, records.getById(feedbackId(input.patientId, input.dateKey)), context);
    if (check.error) return check;
    // no network at all: say so at once (a transaction would only retry and fail later); nothing is written
    if (isOffline()) return { error: "offline" };
    try {
      const record = await commit(input, context);
      cache(record);
      return { record };
    } catch (e) {
      if (e.code === "conflict" && e.current && isSameLatestReport(e.current, input)) { cache(e.current); return { record: e.current, alreadySaved: true }; }
      if (e.code === "conflict" && e.current) cache(e.current);
      const error = classifyFeedbackSaveError(e);
      if (!["conflict", "revision_limit", "invalid_subject"].includes(error)) console.error(`[dailyTrainingFeedback] cloud save failed: ${e.code || e.name || "unknown"} -> ${error}`, e);
      return { error, cause: e.code || null };
    }
  },
};
