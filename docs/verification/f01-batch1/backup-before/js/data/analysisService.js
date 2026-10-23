import { createCollection } from "./storageService.js";
import { seedAnalysisRecords } from "./seedData.js";
import { normalizeAnalysisRecord } from "./legacyAnalysisModes.js";
import { toLocalDateKey } from "./trackingCycle.js";
import { isValidTrainingSource } from "./trainingSource.js";

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

/**
 * Cross-Module Integration I-1 — write-time source fields for a new training
 * record (sourceType / sourceSubtype / linkage ids / localDateKey). Only:
 *   - an explicit executionContext that matches this record (same user, same
 *     exercise, the ids its subtype needs, no conflict with a schedule link), or
 *   - the caller's own explicit fields on the record: scheduleId (assigned) ->
 *     therapist, source "self_practice" -> self.
 * Nothing is guessed: without either, no source is written (read-time
 * normalization then reports it as legacy_unknown). localDateKey is the LOCAL
 * date of the real completion time (same rule as D1), never a debug date.
 */
export function withTrainingSourceFields(record, executionContext = null) {
  if (!record || typeof record !== "object") return record;
  const at = record.completedAt || record.capturedAt || record.createdAt;
  const out = { ...record };
  if (at && !out.localDateKey) out.localDateKey = toLocalDateKey(at);
  if (isValidTrainingSource(out.sourceType, out.sourceSubtype)) return out; // caller already stated it explicitly

  const ctx = executionContext;
  const ctxMatches = !!ctx
    && isValidTrainingSource(ctx.sourceType, ctx.sourceSubtype)
    && ctx.userId === record.patientId
    && ctx.exerciseId === record.exerciseId
    && !(record.scheduleId && ctx.sourceType !== "therapist")
    && (ctx.sourceSubtype !== "f01_cycle" || (!!ctx.trackingCycleId && !!ctx.recommendationId))
    && (ctx.sourceType !== "remotion" || !!ctx.recommendationId);
  if (ctx && !ctxMatches) console.warn("[analysisService] execution context does not match this record; not applied", { exerciseId: record.exerciseId });
  if (ctxMatches) {
    out.sourceType = ctx.sourceType;
    out.sourceSubtype = ctx.sourceSubtype;
    if (ctx.trackingCycleId) out.trackingCycleId = ctx.trackingCycleId;
    if (ctx.recommendationId) out.recommendationId = ctx.recommendationId;
    if (ctx.sourceType === "therapist" && record.scheduleId) out.therapistPlanId = record.scheduleId;
    return out;
  }
  if (record.scheduleId && record.source === ANALYSIS_RECORD_SOURCES.ASSIGNED) {
    out.sourceType = "therapist";
    out.sourceSubtype = "therapist_plan";
    out.therapistPlanId = record.scheduleId;
  } else if (record.source === ANALYSIS_RECORD_SOURCES.SELF_PRACTICE && !record.scheduleId) {
    out.sourceType = "self";
    out.sourceSubtype = "self_selected";
  }
  return out;
}

// Phase D3 — observers notified AFTER a training record is saved (e.g. the
// F01 tracking cycle's daily progress). Additive: a listener can never change
// or block the save; its errors are caught and logged.
const createListeners = new Set();

// Reads map pre-six-domain analysisMode strings to current ones (see
// legacyAnalysisModes.js); stored records are never rewritten.
export const analysisService = {
  list() {
    return analysisRecordsCollection.list().map(normalizeAnalysisRecord);
  },
  getById(id) {
    return normalizeAnalysisRecord(analysisRecordsCollection.getById(id));
  },
  getByPatientId(patientId) {
    return analysisRecordsCollection.query((r) => r.patientId === patientId).map(normalizeAnalysisRecord);
  },
  /**
   * Cross-Module Integration I-1 — `executionContext` is the EXPLICIT context
   * the caller started the training from (e.g. an F01 tracking-cycle plan:
   * { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId,
   * recommendationId, exerciseId, userId }). This method never looks at app
   * state or an "active cycle": it only validates / normalizes what it is given.
   */
  create(record, { executionContext = null } = {}) {
    const saved = analysisRecordsCollection.create(withTrainingSourceFields(record, executionContext));
    createListeners.forEach((listener) => {
      try { listener(saved); } catch (error) { console.error("[analysisService] create listener failed", error); }
    });
    return saved;
  },
  /** Registers a listener called with each newly saved record; returns an unsubscribe function. */
  onCreate(listener) {
    createListeners.add(listener);
    return () => createListeners.delete(listener);
  },
  update(id, patch) {
    return normalizeAnalysisRecord(analysisRecordsCollection.update(id, patch));
  },
  getSource: getRecordSource,
};
