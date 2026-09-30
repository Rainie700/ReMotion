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

export const FUNCTIONAL_ASSESSMENT_BODY_REGIONS = ["shoulder", "lower_limb"];

/**
 * ReMotion Sarcopenia Redesign Phase 1 — assessment-type discriminator.
 * One collection (`functionalAssessmentSessions`), two protocols so far.
 * Defined as constants (never scattered raw strings) so every reader/writer
 * in this file and in app.js references the same two values.
 */
export const FUNCTIONAL_ASSESSMENT_TYPES = {
  SHOULDER: "shoulder",
  FIVE_TIMES_SIT_TO_STAND: "five_times_sit_to_stand",
};

/**
 * Legacy-compatible read of a session's assessment type. EVERY session
 * created before this phase has no `assessmentType` field and was always a
 * shoulder assessment — Phase 7.1–7.6 never supported any other bodyRegion.
 * This is the ONLY place that fallback rule lives; every read helper below
 * goes through it rather than re-deriving it inline. No destructive
 * migration is performed — existing documents are never rewritten just to
 * add this field.
 */
export function resolveAssessmentType(session) {
  if (!session) return null;
  return session.assessmentType || FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER;
}

export const functionalAssessmentService = {
  list() {
    return functionalAssessmentSessionsCollection.list();
  },
  getById(id) {
    return functionalAssessmentSessionsCollection.getById(id);
  },
  /**
   * `assessmentType` is an OPTIONAL filter (additive — every existing call
   * site that passes only `patientId` keeps returning every session for
   * that patient, exactly as before).
   */
  getByPatientId(patientId, { assessmentType } = {}) {
    return functionalAssessmentSessionsCollection.query(
      (s) => s.patientId === patientId && (!assessmentType || resolveAssessmentType(s) === assessmentType)
    );
  },
  /**
   * Creates a minimal session shell. `bodyRegion` must be one of
   * FUNCTIONAL_ASSESSMENT_BODY_REGIONS — every UI entry point that can
   * reach this call already only wires an onclick for a region it supports
   * (see each region-selection call site's own comment), but this still
   * validates defensively rather than trusting the caller.
   *
   * `assessmentType` is additive and OPTIONAL: when omitted, it is derived
   * from `bodyRegion` (bodyRegion "shoulder" -> assessmentType "shoulder"),
   * so every pre-existing call site (`create({ patientId, bodyRegion })`)
   * keeps producing byte-identical shoulder session documents with zero
   * caller changes.
   */
  create({ patientId, bodyRegion, assessmentType = null }) {
    if (!patientId) return { error: "缺少 patientId，無法建立功能評估。" };
    if (!FUNCTIONAL_ASSESSMENT_BODY_REGIONS.includes(bodyRegion)) {
      return { error: `bodyRegion 必須是 ${FUNCTIONAL_ASSESSMENT_BODY_REGIONS.join(" / ")} 其中之一。` };
    }
    const resolvedType =
      assessmentType ||
      (bodyRegion === "shoulder"
        ? FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER
        : bodyRegion === "lower_limb"
          ? FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND
          : null);
    const record = functionalAssessmentSessionsCollection.create({
      id: generateId("functionalAssessment"),
      patientId,
      bodyRegion,
      status: "started",
      startedAt: nowIso(),
      // Additive — absent on nothing going forward, but readers must still
      // tolerate a missing value on documents from before this phase (see
      // resolveAssessmentType()).
      assessmentType: resolvedType,
    });
    return { session: record };
  },
  /**
   * ReMotion Phase 7.3B.2 (A01-1) — additive: attach one completed movement's
   * structured measurement result to an existing session so the later Shoulder
   * Report can consume it. ADDITIVE ONLY:
   *   - creates a `movementResults` array on the session on first call;
   *   - never rewrites the Phase 7.1 frozen core {id, patientId, bodyRegion,
   *     status, startedAt};
   *   - never changes `status` — a session spans multiple movements (flexion,
   *     abduction, ...) and deciding when the WHOLE session is "completed" is a
   *     later slice, not this one.
   * Re-saving the same `movementId` REPLACES that movement's entry rather than
   * appending a duplicate, so a re-measure is idempotent. The write goes
   * through the same collection.update() path as every other record here, so
   * it is mirrored to Firestore automatically (functionalAssessmentSessions is
   * already a CLOUD_COLLECTIONS member) with no Firestore redesign.
   */
  appendMovementResult(sessionId, movementResult) {
    if (!sessionId) return { error: "缺少 sessionId，無法儲存動作結果。" };
    if (!movementResult || !movementResult.movementId) {
      return { error: "缺少 movementResult.movementId，無法儲存動作結果。" };
    }
    const session = functionalAssessmentSessionsCollection.getById(sessionId);
    if (!session) return { error: "找不到此功能評估 session。" };
    const existing = Array.isArray(session.movementResults) ? session.movementResults : [];
    const withoutSame = existing.filter((m) => m && m.movementId !== movementResult.movementId);
    const stored = { ...movementResult, savedAt: nowIso() };
    const updated = functionalAssessmentSessionsCollection.update(sessionId, {
      movementResults: [...withoutSame, stored],
    });
    return { session: updated, movementResult: stored };
  },
  /** Reads back the additive movement results for a session (empty array if none / unknown session). */
  getMovementResults(sessionId) {
    const session = sessionId ? functionalAssessmentSessionsCollection.getById(sessionId) : null;
    return session && Array.isArray(session.movementResults) ? session.movementResults : [];
  },
  /**
   * ReMotion Phase 7.5 (MVP Result closed loop) — additive: mark a session
   * as genuinely completed once its whole protocol is done. ADDITIVE ONLY:
   *   - patches `status` -> "completed", adds `completedAt`, and records the
   *     source-of-truth `problemId` (the selected P-SH-* problem) + its
   *     ordered `protocolMovementIds`. Never rewrites the frozen core, never
   *     touches `movementResults`.
   *   - same collection.update() path -> mirrored to Firestore automatically.
   *   - `problemId` is stored, NOT reconstructed from movementIds (the
   *     caller passes the selected problem). Legacy sessions with no
   *     `problemId` are handled by a read-side compatibility fallback in
   *     js/data/shoulderAssessmentFindings.js, not here.
   *
   * Sarcopenia Redesign Phase 2.1 — additive `result` param: an opaque,
   * caller-shaped payload (this service never inspects its fields) for
   * protocols whose completion carries real measured data, e.g. the
   * five_times_sit_to_stand assessment's { repCount, totalDurationMs,
   * repDurationsMs, ... } built in app.js's finalizeFa5xAssessment() from
   * the LE05 sit-to-stand FSM's own repRecords. Never touches
   * problemId/protocolMovementIds (shoulder's fields) or movementResults.
   */
  completeSession(sessionId, { problemId = null, protocolMovementIds = null, result = null } = {}) {
    if (!sessionId) return { error: "缺少 sessionId，無法完成評估。" };
    const session = functionalAssessmentSessionsCollection.getById(sessionId);
    if (!session) return { error: "找不到此功能評估 session。" };
    const patch = { status: "completed", completedAt: nowIso() };
    if (problemId) patch.problemId = problemId;
    if (Array.isArray(protocolMovementIds)) patch.protocolMovementIds = protocolMovementIds;
    if (result) patch.result = result;
    const updated = functionalAssessmentSessionsCollection.update(sessionId, patch);
    return { session: updated };
  },
  /**
   * All completed sessions for a patient, newest first (by completedAt,
   * then startedAt). `assessmentType` is an OPTIONAL additive filter —
   * omitted, it returns completed sessions of every type (shoulder AND
   * five_times_sit_to_stand), exactly generalizing the pre-Phase-1 "there
   * was only ever one type" behavior. Callers that specifically mean "the
   * shoulder result" (e.g. the shoulder Result page CTA) must pass
   * `{ assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER }` explicitly —
   * see the app.js call-site audit for this phase.
   */
  getCompletedByPatientId(patientId, { assessmentType } = {}) {
    return functionalAssessmentSessionsCollection
      .query((s) => s.patientId === patientId && s.status === "completed" && (!assessmentType || resolveAssessmentType(s) === assessmentType))
      .sort((a, b) => new Date(b.completedAt || b.startedAt || 0) - new Date(a.completedAt || a.startedAt || 0));
  },
  /** The most recent completed session for a patient (optionally filtered by assessmentType), or null. Persistence-backed — survives reload. */
  getLatestCompletedByPatientId(patientId, opts = {}) {
    return functionalAssessmentService.getCompletedByPatientId(patientId, opts)[0] || null;
  },
  /** Persistence-backed "does this patient have at least one completed Functional Assessment" (optionally of one specific assessmentType). */
  hasCompletedByPatientId(patientId, { assessmentType } = {}) {
    return functionalAssessmentSessionsCollection
      .query((s) => s.patientId === patientId && s.status === "completed" && (!assessmentType || resolveAssessmentType(s) === assessmentType))
      .length > 0;
  },
};
