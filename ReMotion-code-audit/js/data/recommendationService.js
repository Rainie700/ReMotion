import { createCollection } from "./storageService.js";
import { generateId, nowIso } from "../utils/id.js";
import { generateRecommendationForAssessment } from "./recommendationEngine.js";

/**
 * ReMotion 2.0 Phase 1 — Recommendation Result schema only. This is
 * deliberately NOT a recommendation engine: there is no logic here that
 * picks exercises or scores a patient. It only stores/validates the shape
 * a future engine's output would take, so later phases have a schema and
 * a place to write to.
 *
 * New collection, brand new localStorage key (`remotion_collection_
 * recommendationResults`) — no seed data, existing collections untouched.
 *
 * Note: analysisRecord already has an unrelated `recommendations: string[]`
 * field (free-text tips on a single completed training). This is a
 * different concept — a patient/assessment-level *result set* of specific
 * exercise suggestions — so it's named `recommendationResults` to avoid
 * confusion with that existing field.
 */
const recommendationsCollection = createCollection("recommendationResults");

export const RECOMMENDATION_TYPES = ["self_practice", "therapist_plan"];

/** Suggested status vocabulary — Phase 1 doesn't enforce workflow transitions between these. */
export const RECOMMENDATION_STATUSES = ["draft", "accepted", "dismissed"];

function normalizeItem(item) {
  if (!item || !item.exerciseId) return null;
  return {
    exerciseId: item.exerciseId,
    reason: item.reason || "",
    suggestedSets: item.suggestedSets != null ? Number(item.suggestedSets) || null : null,
    suggestedReps: item.suggestedReps != null ? Number(item.suggestedReps) || null : null,
    suggestedDuration: item.suggestedDuration != null ? Number(item.suggestedDuration) || null : null,
    // ReMotion 2.0 Phase 3 — optional, backward-compatible additions.
    // Absent on any older item (there shouldn't be real ones yet, but just
    // in case) falls back to sensible defaults rather than undefined.
    section: item.section || "main",
    score: item.score != null ? Number(item.score) : null,
  };
}

export const recommendationService = {
  list() {
    return recommendationsCollection.list();
  },
  getById(id) {
    return recommendationsCollection.getById(id);
  },
  getByPatientId(patientId) {
    return recommendationsCollection.query((r) => r.patientId === patientId);
  },
  getByAssessmentId(assessmentId) {
    return recommendationsCollection.query((r) => r.assessmentId === assessmentId);
  },
  /**
   * Stores a recommendation RESULT (already-decided items) — never
   * computes one. `items` with no valid exerciseId are dropped rather than
   * silently stored broken; an empty/all-invalid list is allowed (Phase 1
   * has no engine, so "no suggestions yet" is a legitimate state).
   */
  create({ patientId, assessmentId = null, recommendationType, items = [], createdBy = null, status = "draft", assessmentUpdatedAt = null }) {
    if (!patientId) return { error: "缺少 patientId，無法建立推薦結果。" };
    if (!RECOMMENDATION_TYPES.includes(recommendationType)) {
      return { error: `recommendationType 必須是 ${RECOMMENDATION_TYPES.join(" / ")} 其中之一。` };
    }
    const normalizedItems = (Array.isArray(items) ? items : []).map(normalizeItem).filter(Boolean);

    const record = recommendationsCollection.create({
      id: generateId("recommendation"),
      patientId,
      assessmentId,
      recommendationType,
      items: normalizedItems,
      createdAt: nowIso(),
      createdBy,
      status,
      // ReMotion 2.0 Phase 3 — optional, backward-compatible: the source
      // assessment's updatedAt at generation time, so a same-day cache hit
      // can be invalidated by an in-place edit (updateActiveAssessment())
      // that keeps the same assessmentId but changes its content. Absent
      // on older/other records; getTodaysRecommendation() below is the
      // only reader that relies on it.
      assessmentUpdatedAt,
    });
    return { recommendation: record };
  },
  updateStatus(id, status) {
    if (!RECOMMENDATION_STATUSES.includes(status)) {
      return { error: `status 必須是 ${RECOMMENDATION_STATUSES.join(" / ")} 其中之一。` };
    }
    const updated = recommendationsCollection.update(id, { status });
    return updated ? { recommendation: updated } : { error: "找不到此推薦結果。" };
  },
  /**
   * ReMotion 2.0 Phase 3 — the orchestration layer between the pure
   * recommendationEngine and storage. Ties "same day + same active
   * assessment -> stable result" (Phase 3 spec sections 11/20) and "new
   * assessment version -> regenerate" (section 21) together:
   *
   *  - Looks for an existing self_practice recommendation for this patient
   *    + this exact assessmentId + this exact assessment.updatedAt,
   *    created on `dateStr`. If found, returns it unchanged — no
   *    re-generation, no drift within the same day. The updatedAt check
   *    (not just assessmentId) matters because updateActiveAssessment()
   *    edits an assessment IN PLACE, keeping the same id — without it, an
   *    in-place edit made later the same day would be silently ignored.
   *  - Otherwise calls the engine fresh (which is itself deterministic per
   *    dateStr) and persists the result via create() above, so it's found
   *    by the same-day check on the next call today.
   *
   * Older recommendations (previous days, or tied to a now-superseded/
   * now-edited assessment) are never deleted — this only ever adds new
   * records.
   */
  getTodaysRecommendation({ patientId, assessment, dateStr, candidates }) {
    if (!patientId) return { error: "缺少 patientId，無法產生今日建議。" };
    if (!assessment || !assessment.id) return { error: "缺少 assessment，無法產生今日建議。" };
    if (!dateStr) return { error: "缺少 dateStr，無法產生今日建議。" };

    const existing = recommendationsCollection
      .query(
        (r) =>
          r.patientId === patientId &&
          r.assessmentId === assessment.id &&
          r.recommendationType === "self_practice" &&
          r.assessmentUpdatedAt === assessment.updatedAt &&
          (r.createdAt || "").slice(0, 10) === dateStr
      )
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    if (existing) return { recommendation: existing, generated: false };

    const engineResult = generateRecommendationForAssessment(assessment, candidates || [], {
      patientId,
      assessmentId: assessment.id,
      dateStr,
    });

    const items = engineResult.items.map((it) => ({
      exerciseId: it.exerciseId,
      reason: it.reason,
      suggestedSets: it.sets,
      suggestedReps: it.reps,
      suggestedDuration: it.duration,
      section: it.section,
      score: it.score,
    }));

    const created = recommendationService.create({
      patientId,
      assessmentId: assessment.id,
      recommendationType: "self_practice",
      items,
      createdBy: patientId,
      status: "draft",
      assessmentUpdatedAt: assessment.updatedAt,
    });
    if (created.error) return created;
    return { recommendation: created.recommendation, generated: true };
  },
};
