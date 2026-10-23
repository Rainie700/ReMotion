import { doc, getDocFromServer, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firestore } from "./firebase.js";
import { createCollection, storageService } from "./storageService.js";
import { relationService } from "./relationService.js";
import { toLocalDateKey } from "./trackingCycle.js";
import { buildDailyFeedbackRecord, feedbackId } from "./dailyTrainingFeedback.js";
import { currentIncompleteTrainingProgress } from "./incompleteTrainingFeedbackService.js";
import { progressFingerprint } from "./incompleteTrainingFeedback.js";

const records = createCollection("dailyTrainingFeedback");
function cache(record) {
  records.replaceAll([...records.list().filter((r) => r.id !== record.id), record]);
}
async function commitToCloud(input, context) {
  if (!firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== input.patientId) throw Object.assign(new Error("not_signed_in"), { code: "not_signed_in" });
  const ref = doc(firestore, "dailyTrainingFeedback", feedbackId(input.patientId, input.dateKey));
  try {
    return await runTransaction(firestore, async (tx) => {
    const snapshot = await tx.get(ref);
    const previous = snapshot.exists() ? snapshot.data() : null;
    const built = buildDailyFeedbackRecord(input, previous, context);
    if (built.error) throw Object.assign(new Error(built.error), { code: built.error, current: previous });
    tx.set(ref, { ...built.record, createdAt: previous?.createdAt || serverTimestamp(), updatedAt: serverTimestamp() });
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
export const dailyTrainingFeedbackService = {
  getForDay(patientId, dateKey) {
    const id = feedbackId(patientId, dateKey);
    return id ? records.getById(id) : null;
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
    const relation = relationService.findAcceptedByPatientId(input.patientId)[0];
    const progress = input.incompleteReason ? currentIncompleteTrainingProgress(input.patientId, input.dateKey) : null;
    if (input.incompleteReason && (!progress || progressFingerprint(progress) !== input.progressFingerprint)) return { error: "progress_changed" };
    const context = { reportedAt: date.toISOString(), therapistId: relation?.therapistId || "", relationId: relation?.id || "", incompleteProgress: progress };
    const check = buildDailyFeedbackRecord(input, records.getById(feedbackId(input.patientId, input.dateKey)), context);
    if (check.error) return check;
    try {
      const record = await commit(input, context);
      cache(record);
      return { record };
    } catch (e) {
      if (e.code === "conflict" && e.current) cache(e.current);
      return { error: ["conflict", "not_signed_in", "revision_limit", "invalid_record"].includes(e.code) ? e.code : "cloud_save_failed" };
    }
  },
};
