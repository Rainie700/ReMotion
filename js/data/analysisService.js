import { createCollection } from "./storageService.js";
import { seedAnalysisRecords } from "./seedData.js";

const analysisRecordsCollection = createCollection("analysisRecords", seedAnalysisRecords);

/** ReMotion 2.0 Phase 1: distinguishes a formally-assigned schedule task from future patient self-practice. */
export const ANALYSIS_RECORD_SOURCES = { ASSIGNED: "assigned", SELF_PRACTICE: "self_practice" };

/**
 * Every analysisRecord created before this phase (the seeded mock demo
 * records, and every real 深蹲 MediaPipe record so far) has no `source`
 * field — they were all produced by completing a therapist-assigned
 * schedule task, since self-practice doesn't exist yet. Rather than a
 * batch migration rewriting historical records, callers should read
 * source through this helper so old records still resolve correctly.
 */
export function getRecordSource(record) {
  return (record && record.source) || ANALYSIS_RECORD_SOURCES.ASSIGNED;
}

export const analysisService = {
  list() {
    return analysisRecordsCollection.list();
  },
  getById(id) {
    return analysisRecordsCollection.getById(id);
  },
  getByPatientId(patientId) {
    return analysisRecordsCollection.query((r) => r.patientId === patientId);
  },
  create(record) {
    return analysisRecordsCollection.create(record);
  },
  update(id, patch) {
    return analysisRecordsCollection.update(id, patch);
  },
  getSource: getRecordSource,
};
