import { createCollection } from "./storageService.js";
import { generateId, nowIso } from "../utils/id.js";

/**
 * ReMotion 2.0 Phase 7.1 — Functional Assessment Session shell.
 *
 * This is a NEW, separate domain from js/data/assessmentService.js (the
 * existing patient preference questionnaire — bodyParts/goals/ability).
 * That service's meaning, storage, and callers are untouched by this file.
 * "Functional Assessment" here means the future AI Dynamic Functional
 * Assessment journey (Phase 7.0 audit): Baseline Assessment -> Findings ->
 * Functional Profile -> Recommendation -> Training -> Re-assessment.
 *
 * New collection, brand new localStorage key (`remotion_collection_
 * functionalAssessmentSessions`) — no seed data, no relation to any
 * existing collection. Additive-only: creating a session here can never
 * mutate assessmentService/recommendationService/analysisService data.
 *
 * Phase 7.1 scope is deliberately minimal — just enough to create and read
 * back a session shell. No movements, findings, quality, or safety state
 * yet; those are additive fields for later slices (see Phase 7.0 report
 * section 4 — "do not add speculative fields now").
 */
const functionalAssessmentSessionsCollection = createCollection("functionalAssessmentSessions");

export const FUNCTIONAL_ASSESSMENT_BODY_REGIONS = ["shoulder"];

export const functionalAssessmentService = {
  list() {
    return functionalAssessmentSessionsCollection.list();
  },
  getById(id) {
    return functionalAssessmentSessionsCollection.getById(id);
  },
  getByPatientId(patientId) {
    return functionalAssessmentSessionsCollection.query((s) => s.patientId === patientId);
  },
  /**
   * Creates a minimal session shell. Only "shoulder" is a valid bodyRegion
   * in Phase 7.1 — every other region is disabled at the UI layer and
   * should never reach this call at all (see the Phase 7.1 report's
   * "Shoulder selection behavior" section), but this still validates
   * defensively rather than silently defaulting an unknown region.
   */
  create({ patientId, bodyRegion }) {
    if (!patientId) return { error: "缺少 patientId，無法建立功能評估。" };
    if (!FUNCTIONAL_ASSESSMENT_BODY_REGIONS.includes(bodyRegion)) {
      return { error: `bodyRegion 必須是 ${FUNCTIONAL_ASSESSMENT_BODY_REGIONS.join(" / ")} 其中之一。` };
    }
    const record = functionalAssessmentSessionsCollection.create({
      id: generateId("functionalAssessment"),
      patientId,
      bodyRegion,
      status: "started",
      startedAt: nowIso(),
    });
    return { session: record };
  },
};
