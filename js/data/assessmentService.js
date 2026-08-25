import { createCollection } from "./storageService.js";
import { generateId, nowIso } from "../utils/id.js";

/**
 * ReMotion 2.0 Phase 1 — Patient Rehabilitation Profile / Assessment.
 *
 * New collection, brand new localStorage key (`remotion_collection_
 * patientAssessments`) — no seed data, so existing browsers with real
 * accounts/relations/schedules/analysisRecords are completely unaffected;
 * the collection simply starts empty on first read.
 *
 * Versioning model: an assessment is never overwritten in place. Each
 * patient has at most one status:"active" record at a time; submitting a
 * new assessment (first-time or a reassessment — same operation) marks the
 * previous active record "superseded" and inserts a new one with
 * version = previousVersion + 1. History is never deleted.
 */
const assessmentsCollection = createCollection("patientAssessments");

export const ASSESSMENT_STATUS = {
  ACTIVE: "active",
  SUPERSEDED: "superseded",
};

export const ABILITY_LEVELS = ["beginner", "intermediate", "advanced"];

export const assessmentService = {
  list() {
    return assessmentsCollection.list();
  },
  getById(id) {
    return assessmentsCollection.getById(id);
  },
  getAllByPatientId(patientId) {
    return assessmentsCollection
      .query((a) => a.patientId === patientId)
      .sort((a, b) => (b.version || 0) - (a.version || 0));
  },
  getActiveByPatientId(patientId) {
    return assessmentsCollection.find((a) => a.patientId === patientId && a.status === ASSESSMENT_STATUS.ACTIVE);
  },
  getHistoryByPatientId(patientId) {
    return assessmentsCollection
      .query((a) => a.patientId === patientId && a.status !== ASSESSMENT_STATUS.ACTIVE)
      .sort((a, b) => (b.version || 0) - (a.version || 0));
  },
  /**
   * Submits a new assessment for a patient — covers both "first-time
   * assessment" and "re-assessment", since they're the same operation: if
   * an active record already exists it is superseded (kept, never
   * deleted/overwritten) and the new one becomes version = prev + 1,
   * status "active". createdBy/updatedBy are passed in explicitly (a
   * userId) rather than assumed, since either the patient or their
   * therapist may submit this — Phase 1 does not enforce who's allowed to.
   */
  createAssessment({ patientId, bodyParts = [], goals = [], abilityLevel = null, preferredSessionMinutes = null, createdBy = null, assessedAt = null }) {
    if (!patientId) return { error: "缺少 patientId，無法建立評估資料。" };
    if (abilityLevel != null && !ABILITY_LEVELS.includes(abilityLevel)) {
      return { error: `abilityLevel 必須是 ${ABILITY_LEVELS.join(" / ")} 其中之一。` };
    }

    const previousActive = assessmentService.getActiveByPatientId(patientId);
    const now = nowIso();

    if (previousActive) {
      assessmentsCollection.update(previousActive.id, {
        status: ASSESSMENT_STATUS.SUPERSEDED,
        updatedAt: now,
      });
    }

    const record = assessmentsCollection.create({
      id: generateId("assessment"),
      patientId,
      bodyParts: Array.isArray(bodyParts) ? bodyParts : [],
      goals: Array.isArray(goals) ? goals : [],
      abilityLevel,
      preferredSessionMinutes: preferredSessionMinutes != null ? Number(preferredSessionMinutes) || null : null,
      createdAt: now,
      updatedAt: now,
      assessedAt: assessedAt || now,
      createdBy,
      updatedBy: createdBy,
      version: (previousActive?.version || 0) + 1,
      status: ASSESSMENT_STATUS.ACTIVE,
    });

    return { assessment: record, supersededId: previousActive ? previousActive.id : null };
  },
  /**
   * In-place patch to the CURRENT active assessment — for a therapist
   * confirming/supplementing a patient-submitted assessment without
   * spinning a whole new version. Does not touch version/status/history.
   */
  updateActiveAssessment(patientId, patch, updatedBy = null) {
    const active = assessmentService.getActiveByPatientId(patientId);
    if (!active) return { error: "此患者尚無使用中的評估資料。" };
    const safePatch = { ...patch };
    delete safePatch.id;
    delete safePatch.patientId;
    delete safePatch.version;
    delete safePatch.status;
    delete safePatch.createdAt;
    delete safePatch.createdBy;
    const updated = assessmentsCollection.update(active.id, {
      ...safePatch,
      updatedAt: nowIso(),
      updatedBy,
    });
    return { assessment: updated };
  },
};
