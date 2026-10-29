import { createCollection, storageService, waitForCloudWrites } from "./storageService.js";
import { buildFixedPracticeRecord, fixedPracticeRecordId, F01_FIXED_PRACTICE_KIND } from "./f01FixedPractice.js";

/**
 * G01 坐站固定練習 — records (own collection, owner-only in firestore.rules; never a tracking cycle,
 * plan completion day, D5 input or analysisRecord). Local-first like every collection; the cloud
 * outcome of each record is kept in a LOCAL-only map so a failed save is never shown as synced, and a
 * retry re-sends the same document id (never a second record).
 */
const COLLECTION = "f01FixedPracticeRecords";
const SYNC_KEY = "f01FixedPracticeSync";
const records = createCollection(COLLECTION);

// LOCAL_ONLY: no cloud account is active on this device (e.g. the local demo), so no write was even tried —
// never reported as synced.
export const FIXED_PRACTICE_SYNC = Object.freeze({ PENDING: "pending", SYNCED: "synced", FAILED: "failed", LOCAL_ONLY: "local_only" });

const ERROR_KEY = "f01FixedPracticeSyncError";
const readSync = () => storageService.getItem(SYNC_KEY, {}) || {};
const writeSync = (id, status) => storageService.setItem(SYNC_KEY, { ...readSync(), [id]: status });
/** The cloud's error code of the last failed save (developer diagnosis only; e.g. "permission-denied"). */
const writeError = (id, code) => { const all = storageService.getItem(ERROR_KEY, {}) || {}; if (code) all[id] = code; else delete all[id]; storageService.setItem(ERROR_KEY, all); };
const syncFailedFor = (sync, id) => (sync.failed || []).some((f) => f.name === COLLECTION && (!f.id || f.id === id));

async function settle(id, syncWrites) {
  writeSync(id, FIXED_PRACTICE_SYNC.PENDING);
  if (syncWrites === waitForCloudWrites && !storageService.isCloudSyncActive()) {
    writeSync(id, FIXED_PRACTICE_SYNC.LOCAL_ONLY);
    writeError(id, null);
    return FIXED_PRACTICE_SYNC.LOCAL_ONLY;
  }
  const sync = await syncWrites();
  // this record's own last write outcome too: the shared settled list may have been read by another caller first
  const last = syncWrites === waitForCloudWrites ? storageService.getLastCloudWriteOutcome(COLLECTION, id) : null;
  const failedEntry = (sync.failed || []).find((f) => f.name === COLLECTION && (!f.id || f.id === id));
  const failed = !!failedEntry || syncFailedFor(sync, id) || !!(last && !last.ok);
  const status = failed ? FIXED_PRACTICE_SYNC.FAILED : FIXED_PRACTICE_SYNC.SYNCED;
  writeSync(id, status);
  const code = failed ? (failedEntry && failedEntry.code) || (last && last.code) || "unknown" : null;
  writeError(id, code);
  if (failed) console.warn(`[f01FixedPractice] cloud save of ${id} failed: ${code}`);
  return status;
}

export const f01FixedPracticeService = {
  /**
   * Saves one run (create, or the same id again — never a duplicate), then waits for the cloud write.
   * @returns {Promise<{ record, sync: "synced" | "failed" } | { error }>}
   */
  async saveRun(input, { syncWrites = waitForCloudWrites } = {}) {
    const built = buildFixedPracticeRecord(input);
    if (built.error) return { error: built.error };
    const existing = records.getById(built.record.id);
    // A run is saved once: a second save of the same run keeps the first AI result (no overwrite) and only re-sends it.
    const record = existing ? records.update(existing.id, {}) : records.create(built.record);
    const sync = await settle(record.id, syncWrites);
    return { record: records.getById(record.id), sync, alreadySaved: !!existing };
  },

  /** Adds the person's own number to a run — stored apart from `ai`, which is never changed here. */
  async addSelfReport({ patientId, recordId, totalReps, reportedAt }, { syncWrites = waitForCloudWrites } = {}) {
    const r = records.getById(recordId);
    if (!r || r.kind !== F01_FIXED_PRACTICE_KIND || r.patientId !== patientId) return { error: "record_not_found" };
    if (!(Number.isInteger(totalReps) && totalReps >= 0 && totalReps <= 1000)) return { error: "invalid_self_report" };
    records.update(recordId, { selfReport: { totalReps, reportedAt, source: "self_report" }, updatedAt: reportedAt });
    const sync = await settle(recordId, syncWrites);
    return { record: records.getById(recordId), sync };
  },

  /** Re-sends a record whose cloud save failed (same document id). */
  async retrySync({ patientId, recordId }, { syncWrites = waitForCloudWrites } = {}) {
    const r = records.getById(recordId);
    if (!r || r.patientId !== patientId) return { error: "record_not_found" };
    records.update(recordId, {});
    const sync = await settle(recordId, syncWrites);
    return { record: records.getById(recordId), sync };
  },

  getById: (id) => records.getById(id),
  listForPatient(patientId) {
    return records.query((r) => r.kind === F01_FIXED_PRACTICE_KIND && r.patientId === patientId)
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  },
  /** Local record never confirmed in the cloud -> pending / failed; a record without an entry came from the cloud. */
  syncStatus: (id) => readSync()[id] || FIXED_PRACTICE_SYNC.SYNCED,
  /** Developer diagnosis: the cloud error code of the last failed save of this record (null when none). */
  syncErrorCode: (id) => (storageService.getItem(ERROR_KEY, {}) || {})[id] || null,
  recordIdFor: fixedPracticeRecordId,
};
