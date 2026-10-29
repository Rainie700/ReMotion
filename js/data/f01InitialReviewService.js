/**
 * F01 首次推薦專業檢視 — stage 1 service (docs/F01_INITIAL_REVIEW_PLAN.md).
 *
 * f01InitialReviews/{recommendationId}: written ONLY by a therapist with an accepted
 * relation to the patient (firestore.rules); the patient reads it, never writes it.
 * The recommendation (recommendationResults) is never written by the therapist and
 * its candidate items stay as the system made them.
 *
 * Shared with the next-stage review (d5TherapistReviewService): the goal-pool options,
 * item / amount / counting-basis validation, limitation conflicts, the plan diff and the
 * write-then-sync-with-rollback pattern. Not shared: anything bound to a D5 proposal
 * (previous week, reassessment, rule judgement).
 */
import { createCollection, waitForCloudWrites } from "./storageService.js";
import { relationService } from "./relationService.js";
import { exerciseService } from "./exerciseService.js";
import { F01_GOALS } from "./f01RecommendationSpec.js";
import { getF01GoalMatchLevel } from "./f01GoalRecommendation.js";
import { diffPlans, findPlanConflicts } from "./d5Arrangement.js";
import { listGoalReviewOptions, validateD5ReviewItems } from "./d5TherapistReviewService.js";
import {
  resolveInitialArrangement, initialPlanFingerprint, initialReviewBasis, isFirstF01Recommendation,
  isInitialPlanAccepted, initialReviewVersionId, planItemsKey, deriveInitialPlanHandoff, F01_INITIAL_REVIEW_VERSION, INITIAL_PLAN_BASELINE_ROLE,
  checkFirstRecommendationIntegrity, isEmptyFirstRecommendation,
} from "./f01InitialReview.js";
import { functionalAssessmentService } from "./functionalAssessmentService.js";
import { trackingCycleService } from "./trackingCycleService.js";
import { checkCountingDefinitions } from "./f01DailyTargets.js";
import { isDateKey, toLocalDateKey } from "./trackingCycle.js";

const recommendations = createCollection("recommendationResults");
const reviews = createCollection("f01InitialReviews");
const cycles = createCollection("trackingCycles");
export const F01_INITIAL_REVIEW_MAX_ITEMS = 3;

const nameOf = (id) => (exerciseService.getNormalizedById(id) || {}).name || id;
const relationOf = (patientId) => (therapistId) => relationService.findAcceptedRelation(therapistId, patientId) || null;

export function getInitialReview(recommendationId) {
  return recommendationId ? reviews.getById(recommendationId) : null;
}

/**
 * The newest completed initial_plan_baseline 5xSTS of THIS accepted plan, measured after the
 * acceptance on `todayDateKey` (local), or null. Only today's counts: a week never starts in the past.
 */
function findFreshInitialPlanBaseline(rec, todayDateKey) {
  const c = rec && rec.initialConfirmation;
  if (!c || !isDateKey(todayDateKey)) return null;
  const acceptedMs = Date.parse(c.confirmedAt || "");
  return functionalAssessmentService.getCompletedByPatientId(rec.patientId)
    .filter((s) => s.status === "completed" && s.result && s.result.status === "completed"
      && s.result.assessmentRole === INITIAL_PLAN_BASELINE_ROLE && s.result.initialRecommendationId === rec.id
      && Date.parse(s.result.measuredAt || "") >= acceptedMs && toLocalDateKey(s.result.measuredAt) === todayDateKey)
    .sort((a, b) => String(b.result.measuredAt).localeCompare(String(a.result.measuredAt)))[0] || null;
}

/** A cycle of this patient that runs on this recommendation, or null. */
const startedCycleOf = (rec) => (rec ? cycles.query((c) => c.recommendationId === rec.id && c.userId === rec.patientId)[0] || null : null);

/**
 * The arrangement of a first recommendation as the app decides it (reviewer must still be linked).
 *   started_before_review  a cycle runs on it but it was never accepted (started before the review existed) — left as it was
 *   accepted               accepted; the first week has not started. `start` says why:
 *                          fresh_baseline_required / blocked_by_active_cycle / ready_to_start (e.g. a failed sync to retry)
 *   started                accepted and its first week exists
 */
export function getInitialArrangement(rec, { todayDateKey = null } = {}) {
  const a = resolveInitialArrangement(rec, { review: getInitialReview(rec && rec.id), relationOf: relationOf(rec && rec.patientId) });
  const cycle = a.status !== "not_required" ? startedCycleOf(rec) : null;
  if (a.status === "accepted") {
    if (cycle) return { ...a, status: "started", cycle };
    const handoff = (a.confirmation && a.confirmation.handoff) || {};
    const active = cycles.query((c) => c.userId === rec.patientId && c.functionalDomain === "F01" && !c.reassessmentId)[0] || null;
    const reuseToday = handoff.baselineReuseAllowed && (!todayDateKey || handoff.originalAssessmentDateKey === todayDateKey);
    // A completed fresh baseline of THIS plan measured today whose week did not start (e.g. a failed sync):
    // the retry uses it — the patient is never asked to measure again for the same day.
    const freshToday = findFreshInitialPlanBaseline(rec, todayDateKey);
    const start = active ? "blocked_by_active_cycle" : reuseToday || freshToday ? "ready_to_start" : "fresh_baseline_required";
    return { ...a, start, activeCycle: active, freshBaseline: freshToday };
  }
  if (cycle) return { ...a, status: "started_before_review", reasons: [] };
  return a;
}

/** May training start from this recommendation (counted or not)? Only once it does not need review, or its first week exists. */
export function canTrainFromRecommendation(recommendationId) {
  const rec = recommendationId ? recommendations.getById(recommendationId) : null;
  if (!isFirstF01Recommendation(rec)) return true;
  if (isEmptyFirstRecommendation(rec)) return false;
  const status = getInitialArrangement(rec).status;
  return status === "not_required" || status === "started_before_review" || status === "started";
}

/** Exercises the therapist may choose: the recommendation's goal pool minus what its limitations exclude. */
export function listInitialReviewOptions(rec, catalog = exerciseService.listNormalized()) {
  return listGoalReviewOptions({ goalId: rec && rec.selectedGoalId, limitationIds: (rec && rec.limitationIds) || [], catalog });
}

/** First recommendations of a patient that need (or already got) a review — linked therapist only. */
export function listInitialReviewsForPatient({ therapistId, patientId }) {
  if (!therapistId || !patientId || !relationService.findAcceptedRelation(therapistId, patientId)) return [];
  return recommendations
    .query((r) => isFirstF01Recommendation(r) && r.patientId === patientId && r.status !== "accepted")
    .map((rec) => ({ rec, arrangement: getInitialArrangement(rec) }))
    .filter((x) => x.arrangement.status === "needs_review" || x.arrangement.status === "reviewed")
    .sort((a, b) => String(b.rec.createdAt).localeCompare(String(a.rec.createdAt)));
}

/**
 * Confirms the therapist's arrangement for ONE recommendation version.
 * `expectedFingerprint` = initialPlanFingerprint of the recommendation the therapist was looking at.
 * Success is returned only after the cloud write succeeded; on failure the local copy is rolled back.
 */
export async function reviewInitialRecommendation({ recommendationId, therapistId, items, reason, expectedFingerprint }, { syncWrites = waitForCloudWrites, now = () => new Date().toISOString(), catalog = exerciseService.listNormalized(), completionRulesVersion = null } = {}) {
  const rec = recommendationId ? recommendations.getById(recommendationId) : null;
  if (!isFirstF01Recommendation(rec)) return { error: "recommendation_not_found" };
  const relation = relationService.findAcceptedRelation(therapistId, rec.patientId);
  if (!relation) return { error: "not_authorized" };
  if (rec.status === "accepted") return { error: "recommendation_already_accepted" };
  const before = getInitialArrangement(rec).status;
  if (before !== "needs_review" && before !== "reviewed") return { error: "review_not_needed" };
  if (!expectedFingerprint || expectedFingerprint !== initialPlanFingerprint(rec)) return { error: "recommendation_changed" };
  const text = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (!text) return { error: "review_reason_required" };
  const checked = validateD5ReviewItems(items, listInitialReviewOptions(rec, catalog), { requireCountingBasis: !!completionRulesVersion });
  if (checked.error) return checked;

  const goalLabel = (F01_GOALS.find((g) => g.goalId === rec.selectedGoalId) || {}).label || rec.selectedGoalId;
  const candidate = rec.items || [];
  const confirmed = checked.items.map((it, idx) => {
    const kept = candidate.find((p) => p.exerciseId === it.exerciseId);
    const base = kept
      ? { ...kept }
      : {
        exerciseId: it.exerciseId,
        exerciseName: nameOf(it.exerciseId),
        functionalDomain: "F01",
        sourceAssessmentId: rec.sourceAssessmentId || null,
        selectedGoalId: rec.selectedGoalId,
        selectedGoalLabel: goalLabel,
        matchLevel: getF01GoalMatchLevel(rec.selectedGoalId, it.exerciseId),
        matchedConditions: [{ ruleId: "TR-01", text: "復健師檢視後選擇" }, { ruleId: "NC-G04", text: "未命中現有的排除規則" }],
        reason: `復健師檢視後選擇「${nameOf(it.exerciseId)}」（同目標「${goalLabel}」）。`,
        aiSupported: !!(exerciseService.getNormalizedById(it.exerciseId) || {}).aiSupported,
        recommendationRole: "",
        evidenceStatus: null,
      };
    const { dose: _old, ...rest } = base;
    return { ...rest, rank: idx + 1, ...(it.dose ? { dose: it.dose } : {}) };
  });
  const itemsJson = JSON.parse(JSON.stringify(confirmed));
  if (findPlanConflicts(itemsJson.map((it) => it.exerciseId), rec.limitationIds || []).length) return { error: "review_plan_conflict" };

  const record = {
    id: rec.id,
    recommendationId: rec.id,
    patientId: rec.patientId,
    therapistId,
    relationId: relation.id,
    status: "confirmed",
    reviewedAt: now(),
    reason: text,
    items: itemsJson,
    changes: JSON.parse(JSON.stringify(diffPlans(candidate, itemsJson, nameOf))),
    candidateItems: candidate.map((p) => ({ exerciseId: p.exerciseId })),
    triggerCodes: getInitialArrangement(rec).reasons.map((r) => r.code),
    basis: initialReviewBasis(rec),
    basePlanFingerprint: initialPlanFingerprint(rec),
  };

  const previous = reviews.getById(rec.id);
  await syncWrites();
  const saved = previous ? reviews.update(rec.id, record) : reviews.create(record);
  const sync = await syncWrites();
  if (sync.failed.some((f) => f.name === "f01InitialReviews" && (!f.id || f.id === rec.id))) {
    const others = reviews.list().filter((r) => r.id !== rec.id);
    reviews.replaceAll(previous ? [...others, previous] : others); // local back to what the cloud still has
    return { error: "review_sync_failed" };
  }
  return { review: saved, changes: record.changes };
}

// ── Stage 2: patient acceptance and the first week ─────────────────────────
// Acceptance and starting the week are recorded separately: an accepted plan whose week could not
// start (later date, another running cycle, a failed sync) stays accepted and can be started later.
// Each step is synced before the next one runs; a failed sync rolls the local copy back and returns
// an error — never "done". A second call while one is running joins it (double click / retry).

const inFlight = new Map();
const once = (key, fn) => {
  if (inFlight.has(key)) return inFlight.get(key);
  const p = (async () => { try { return await fn(); } finally { inFlight.delete(key); } })();
  inFlight.set(key, p);
  return p;
};
const syncFailedFor = (sync, name, id) => sync.failed.some((f) => f.name === name && (!f.id || f.id === id));

/**
 * The patient accepts EXACTLY the therapist-confirmed content they were shown.
 * `expectedReviewVersionId` = initialReviewVersionId of the review on the patient's screen.
 * `confirmationDateKey` must be the REAL local date. Re-checks everything; never trusts the UI.
 * @returns {{ recommendation, handoff, alreadyAccepted?, cycle?, cycleCreated?, cycleError? } | { error, ... }}
 */
export function acceptInitialPlan({ recommendationId, userId, expectedReviewVersionId, confirmationDateKey }, { syncWrites = waitForCloudWrites, now = () => new Date().toISOString(), completionRulesVersion = null } = {}) {
  return once(`accept:${recommendationId}`, async () => {
    const rec = recommendationId ? recommendations.getById(recommendationId) : null;
    if (!isFirstF01Recommendation(rec)) return { error: "recommendation_not_found" };
    if (!userId || rec.patientId !== userId) return { error: "not_owner" };
    if (isInitialPlanAccepted(rec)) {
      const started = await startInitialPlanCycle({ recommendationId, userId, todayDateKey: confirmationDateKey }, { syncWrites, completionRulesVersion });
      return { recommendation: recommendations.getById(rec.id), handoff: rec.initialConfirmation.handoff, alreadyAccepted: true, ...describeStart(started) };
    }
    // a plan without a verifiable marker is never accepted (it could not start a week either)
    const integrity = checkFirstRecommendationIntegrity(rec);
    if (!integrity.ok) return { error: "recommendation_integrity_missing", reason: integrity.reason };
    const arrangement = getInitialArrangement(rec);
    if (arrangement.status !== "reviewed") return { error: "not_acceptable", arrangementStatus: arrangement.status };
    const review = arrangement.review;
    const reviewVersionId = initialReviewVersionId(review);
    if (!expectedReviewVersionId || expectedReviewVersionId !== reviewVersionId) return { error: "review_changed" };
    if (!isDateKey(confirmationDateKey)) return { error: "missing_confirmation_date" };
    const acceptedItems = JSON.parse(JSON.stringify(review.items));
    if (completionRulesVersion) {
      const defs = checkCountingDefinitions({ items: acceptedItems, getCatalog: (id) => exerciseService.getById(id) });
      if (!defs.ok) return { error: "counting_basis_undefined", undefinedItems: defs.undefinedItems };
    }
    const original = rec.sourceAssessmentId ? functionalAssessmentService.getById(rec.sourceAssessmentId) : null;
    const handoff = deriveInitialPlanHandoff({ originalAssessment: original && original.patientId === userId ? original : null, confirmationDateKey });
    const planFingerprint = initialPlanFingerprint(rec); // the candidate version the review is bound to
    const initialConfirmation = {
      therapistReviewId: rec.id,
      reviewVersionId,
      reviewedAt: review.reviewedAt,
      therapistId: review.therapistId,
      relationId: review.relationId,
      planFingerprint,
      acceptedItemsKey: planItemsKey(acceptedItems),
      confirmedAt: now(),
      confirmedBy: userId,
      confirmationDateKey,
      handoff,
      checkVersion: F01_INITIAL_REVIEW_VERSION,
      ...(completionRulesVersion ? { completionRulesVersion } : {}),
    };
    const previous = JSON.parse(JSON.stringify(rec));
    await syncWrites();
    // items = the confirmed plan (what every training entry reads); the candidate list is kept.
    recommendations.update(rec.id, { status: "accepted", candidateItems: JSON.parse(JSON.stringify(rec.items || [])), items: acceptedItems, initialConfirmation });
    const sync = await syncWrites();
    if (syncFailedFor(sync, "recommendationResults", rec.id)) {
      recommendations.replaceAll([...recommendations.list().filter((r) => r.id !== rec.id), previous]); // local back to what the cloud still has
      return { error: "accept_sync_failed" };
    }
    const accepted = recommendations.getById(rec.id);
    if (planFingerprint !== initialPlanFingerprint(accepted)) return { error: "accepted_plan_changed" }; // defensive: accepting must not move the bound version
    if (!handoff.baselineReuseAllowed) return { recommendation: accepted, handoff };
    const started = await startInitialPlanCycle({ recommendationId, userId, todayDateKey: confirmationDateKey }, { syncWrites, completionRulesVersion });
    return { recommendation: accepted, handoff, ...describeStart(started) };
  });
}

function describeStart(started) {
  if (!started) return {};
  if (started.error) return { cycleError: started.error, ...(started.cycle ? { blockingCycle: started.cycle } : {}) };
  return { cycle: started.cycle, cycleCreated: !!started.created };
}

/**
 * Starts the first week of an accepted plan (idempotent). A fresh baseline is passed by the
 * assessment flow (initial_plan_baseline context). Without `baselineSession` (the retry entry):
 * today's completed fresh baseline of this plan if there is one, else the original assessment
 * (only valid on its own measured date). `todayDateKey` must be the REAL local date.
 * @returns {{ cycle, created } | { error, cycle? }}
 */
export function startInitialPlanCycle({ recommendationId, userId, baselineSession = null, todayDateKey }, { syncWrites = waitForCloudWrites, completionRulesVersion = null } = {}) {
  return once(`start:${recommendationId}`, async () => {
    const rec = recommendationId ? recommendations.getById(recommendationId) : null;
    if (!isFirstF01Recommendation(rec) || !userId || rec.patientId !== userId) return { error: "recommendation_not_found" };
    const baseline = baselineSession
      || findFreshInitialPlanBaseline(rec, todayDateKey)
      || (rec.sourceAssessmentId ? functionalAssessmentService.getById(rec.sourceAssessmentId) : null);
    await syncWrites();
    const made = trackingCycleService.createInitialPlanCycle({ userId, recommendationId, baselineSession: baseline, startDateKey: todayDateKey, completionRulesVersion });
    if (made.error || !made.created) return made;
    const sync = await syncWrites();
    if (syncFailedFor(sync, "trackingCycles", made.cycle.id)) {
      cycles.replaceAll(cycles.list().filter((c) => c.id !== made.cycle.id)); // the week did not start; the acceptance stays
      return { error: "cycle_sync_failed" };
    }
    return made;
  });
}

// ── Ordinary first recommendation: start (or re-link) its week only after the plan is in the cloud ──
// firestore.rules refuses a cycle whose recommendation is not in the cloud yet (or carries no verifiable
// marker), and the two writes would otherwise race. The plan is written again and synced first; the cycle
// is created / re-linked locally, then synced; a failed sync rolls the local cycle back (never "started").
const PHASE_C_RETRYABLE = new Set(["recommendation_not_synced", "cycle_sync_failed"]);

/**
 * @returns {{ cycle, created, reason? } | { error, reason?, cycle?, retryable? }}
 */
export function startRecommendationCycle({ userId, recommendationId }, { syncWrites = waitForCloudWrites, completionRulesVersion = null } = {}) {
  return once(`phase-c:${recommendationId}`, async () => {
    const rec = recommendationId ? recommendations.getById(recommendationId) : null;
    if (!isFirstF01Recommendation(rec) || !userId || rec.patientId !== userId) return { error: "recommendation_not_found" };
    const integrity = checkFirstRecommendationIntegrity(rec);
    if (!integrity.ok) return { error: "recommendation_integrity_missing", reason: integrity.reason };
    if (isEmptyFirstRecommendation(rec)) return { error: "recommendation_has_no_items" };
    const baseline = rec.sourceAssessmentId ? functionalAssessmentService.getById(rec.sourceAssessmentId) : null;
    await syncWrites();
    recommendations.update(rec.id, {}); // re-send the plan exactly as stored, so it is in the cloud before its cycle
    const recSync = await syncWrites();
    if (syncFailedFor(recSync, "recommendationResults", rec.id)) return { error: "recommendation_not_synced", retryable: true };
    const before = JSON.parse(JSON.stringify(cycles.list()));
    const res = trackingCycleService.createOrGetTrackingCycle({ userId, baselineSession: baseline, recommendation: recommendations.getById(rec.id), completionRulesVersion });
    if (res.error || !res.cycle) return res;
    const touched = res.created || res.reason === "same_baseline";
    if (!touched) return res;
    const sync = await syncWrites();
    if (syncFailedFor(sync, "trackingCycles", res.cycle.id)) {
      cycles.replaceAll(before); // created -> gone; re-linked -> back to its previous plan
      return { error: "cycle_sync_failed", retryable: true };
    }
    return res;
  });
}
export const isRetryableCycleStartError = (code) => PHASE_C_RETRYABLE.has(code);
