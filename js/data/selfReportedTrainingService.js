import { doc, runTransaction, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firestore } from "./firebase.js";
import { createCollection, storageService } from "./storageService.js";
import { exerciseService } from "./exerciseService.js";
import { relationService } from "./relationService.js";
import { generateId } from "../utils/id.js";
import { toLocalDateKey } from "./trackingCycle.js";
import { buildSelfReportedTraining, selfReportedId, sameSelfReportedTraining } from "./selfReportedTraining.js";
const reports = createCollection("selfReportedTraining");
const draftKey = (patientId, exerciseId) => `selfReportDraft_${patientId}_${exerciseId}`;
function cache(record) { reports.replaceAll([...reports.list().filter(r => r.id !== record.id), record]); }
async function cloudSave(record) {
  if (firebaseAuth.currentUser?.uid !== record.patientId) throw Object.assign(new Error(), { code: "not_signed_in" });
  const ref = doc(firestore, "selfReportedTraining", record.id);
  return runTransaction(firestore, async tx => {
    const snapshot = await tx.get(ref);
    if (snapshot.exists()) {
      const existing = snapshot.data();
      if (!sameSelfReportedTraining(existing, record)) throw Object.assign(new Error(), { code: "session_already_saved", record: existing });
      return { record: existing, alreadySaved: true };
    }
    tx.set(ref, { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return { record, alreadySaved: false };
  });
}
async function cloudVoid(patientId, id) {
  if (firebaseAuth.currentUser?.uid !== patientId) throw Object.assign(new Error(), { code: "not_signed_in" });
  const ref = doc(firestore, "selfReportedTraining", id);
  return runTransaction(firestore, async tx => {
    const snapshot = await tx.get(ref);
    if (!snapshot.exists() || snapshot.data().patientId !== patientId) throw Object.assign(new Error(), { code: "not_owned" });
    const old = snapshot.data();
    if (old.status === "voided") return old;
    tx.update(ref, { status: "voided", voidedAt: serverTimestamp(), updatedAt: serverTimestamp(), voidReason: "本人作廢" });
    return { ...old, status: "voided", voidReason: "本人作廢" };
  });
}
export const selfReportedTrainingService = {
  begin(patientId, exerciseId) {
    if (exerciseService.getNormalizedById(exerciseId)?.id !== exerciseId || !patientId) return null;
    const key = draftKey(patientId, exerciseId), old = storageService.getItem(key);
    if (old && old.patientId === patientId && old.exerciseId === exerciseId && selfReportedId(patientId, old.sessionId)) return old;
    const draft = { patientId, exerciseId, sessionId: generateId("manual"), values: {} };
    storageService.setItem(key, draft); return draft;
  },
  keepDraft(draft) { storageService.setItem(draftKey(draft.patientId, draft.exerciseId), draft); },
  listForPatient(patientId, exerciseId = null) {
    return reports.query(r => r.patientId === patientId && (!exerciseId || r.exerciseId === exerciseId)).sort((a,b) => String(b.reportedAt).localeCompare(String(a.reportedAt)) || b.id.localeCompare(a.id));
  },
  listForTherapist(therapistId, patientId) {
    const relation = relationService.findAcceptedRelation(therapistId, patientId);
    return relation ? reports.query(r => r.patientId === patientId && r.therapistId === therapistId && r.relationId === relation.id).sort((a,b) => String(b.reportedAt).localeCompare(String(a.reportedAt))) : [];
  },
  cloudStatus: () => storageService.getOptionalCloudLoadStatus("selfReportedTraining"),
  async save(input, { commit = cloudSave, now = () => new Date() } = {}) {
    const date = now(), relation = relationService.findAcceptedByPatientId(input.patientId)[0];
    const built = buildSelfReportedTraining(input, exerciseService.getNormalizedById(input.exerciseId), { reportedAt: date.toISOString(), dateKey: toLocalDateKey(date), therapistId: relation?.therapistId || "", relationId: relation?.id || "" });
    if (built.error) return built;
    try {
      const result = await commit(built.record); cache(result.record);
      const key = draftKey(input.patientId, input.exerciseId);
      if (storageService.getItem(key)?.sessionId === input.sessionId) storageService.removeItem(key);
      return result;
    } catch(e) {
      if (e.code === "session_already_saved" && e.record?.patientId === input.patientId) {
        cache(e.record);
        const key = draftKey(input.patientId, input.exerciseId);
        if (storageService.getItem(key)?.sessionId === input.sessionId) storageService.removeItem(key);
      }
      return { error: ["session_already_saved","not_signed_in"].includes(e.code) ? e.code : "cloud_save_failed" };
    }
  },
  async void(patientId, id, { commit = cloudVoid } = {}) {
    if (reports.getById(id)?.patientId !== patientId) return { error: "not_owned" };
    try { const record = await commit(patientId, id); cache(record); return { record }; }
    catch(e) { return { error: e.code === "not_signed_in" ? e.code : "cloud_save_failed" }; }
  },
};
