/**
 * F01 首次推薦 — professional review of a FIRST (Phase C) recommendation
 * (docs/F01_INITIAL_REVIEW_PLAN.md). Pure: no storage, no clock.
 *   stage 1: pending review -> a linked therapist confirms
 *   stage 2: the patient accepts the confirmed content -> the first week starts
 *            (same local date as the original assessment, else after a fresh baseline)
 *
 * An ENGINEERING hold for one reviewed case, not a clinical rule: the patient ticked
 * L05 and the system's candidate list contains F01-11. Goal and time are never read.
 *
 * The trigger is stored on the recommendation when it is saved (initialReview) and is
 * authoritative from then on: it is never re-derived from items that change later.
 * Records saved before this stage carry no marker and get a live check of their own
 * (Phase C items are never edited, so they are still the candidate list).
 *
 *   recommendationResults/{id}   .items = the system's CANDIDATE list (unchanged)
 *                                .initialReview = { required, triggerCodes, checkVersion }
 *   f01InitialReviews/{id}       the therapist's CONFIRMED items, bound to this
 *                                recommendation id + basis version + relation
 */
import { L05_HIP_FLEXION_REVIEW, planItem } from "./d5Arrangement.js";
import { stableId } from "./d5LlmRecommendation.js";
import { measuredDateKeyOf, isUsableNextCycleBaseline } from "./f01ProgressionDecision.js";
import { isCurrentFa5xMeasurement } from "./fa5xMeasurementCompatibility.js";

export const F01_INITIAL_REVIEW_VERSION = "f01-initial-review-1";
export const INITIAL_REVIEW_TRIGGER = Object.freeze({
  L05_F01_11: "l05_f01_11_initial",
  DATA_MISSING: "l05_f01_11_initial_check_data_missing",
});

const L05 = L05_HIP_FLEXION_REVIEW.limitationId;
const F01_11 = L05_HIP_FLEXION_REVIEW.toExerciseId;

export const INITIAL_REVIEW_TEXT = Object.freeze({
  [INITIAL_REVIEW_TRIGGER.L05_F01_11]: "你勾選了「目前無法安全地單腳站立」，而這份首次訓練安排包含需要站立進行的「站姿髖屈曲」。這份安排需由有照護關係的復健師檢視後才能開始；這不代表已確認不適合。",
  [INITIAL_REVIEW_TRIGGER.DATA_MISSING]: "這份訓練安排的紀錄缺少判斷所需的欄位（勾選的情況），無法確認是否涉及「站姿髖屈曲」，需由復健師檢視後才能開始。",
});

/** The trigger for a candidate list. `limitationIds` not an array -> data missing (never filled in). */
export function evaluateInitialReviewTrigger({ limitationIds, items }) {
  const ids = (items || []).map((it) => it && it.exerciseId);
  if (!ids.includes(F01_11)) return { required: false, triggerCodes: [] };
  if (!Array.isArray(limitationIds)) return { required: true, triggerCodes: [INITIAL_REVIEW_TRIGGER.DATA_MISSING] };
  return limitationIds.includes(L05) ? { required: true, triggerCodes: [INITIAL_REVIEW_TRIGGER.L05_F01_11] } : { required: false, triggerCodes: [] };
}

/** Stored on the recommendation when it is saved (recommendationService.createF01GoalRecommendation). */
export function buildInitialReviewMarker({ limitationIds, items }) {
  const t = evaluateInitialReviewTrigger({ limitationIds, items });
  return { required: t.required, triggerCodes: t.triggerCodes, checkVersion: F01_INITIAL_REVIEW_VERSION };
}

/** A first (Phase C) recommendation — never a next-stage proposal. */
export const isFirstF01Recommendation = (rec) => !!rec && rec.kind === "f01_goal" && !rec.origin;

/**
 * A first recommendation with no candidate item (e.g. the G01 condition screen left none) is never a plan:
 * it never starts or re-links a cycle and nothing is trained from it. The App does not save one; this
 * guards a record that arrives some other way.
 */
export const isEmptyFirstRecommendation = (rec) => isFirstF01Recommendation(rec) && candidateItemsOf(rec).length === 0;

/**
 * Does this first recommendation need review? Stored marker first (source "stored");
 * a record without one is checked live from its candidate items ("legacy_live_check").
 */
export function resolveInitialReviewRequirement(rec) {
  if (!isFirstF01Recommendation(rec)) return { required: false, triggerCodes: [], source: null, checkVersion: null };
  const m = rec.initialReview;
  if (m && typeof m === "object" && typeof m.required === "boolean") {
    return { required: m.required, triggerCodes: [...(m.triggerCodes || [])], source: "stored", checkVersion: m.checkVersion || null };
  }
  const t = evaluateInitialReviewTrigger({ limitationIds: rec.limitationIds, items: candidateItemsOf(rec) });
  return { ...t, source: "legacy_live_check", checkVersion: null };
}

/**
 * The system's CANDIDATE list. Before acceptance that is `items`; on acceptance `items`
 * becomes the confirmed plan (what every training entry reads, as for a D5 proposal) and
 * the candidate list is kept in `candidateItems` — so the fingerprint a review is bound to,
 * and the trigger of a legacy record, never change by accepting.
 */
export function candidateItemsOf(rec) {
  if (!rec) return [];
  return Array.isArray(rec.candidateItems) ? rec.candidateItems : (rec.items || []);
}

/** The candidate exercise ids, in order — stored as `exerciseIds` so firestore.rules can re-check the marker. */
export const candidateExerciseIds = (rec) => candidateItemsOf(rec).map((it) => it && it.exerciseId);

/**
 * Can THIS first recommendation be trusted to say whether review is needed? (the same checks
 * firestore.rules makes: exerciseIds mirror the candidate items; the stored marker equals the trigger
 * recomputed from them). A record without them is never read as "no review needed".
 * @returns {{ ok: true } | { ok: false, reason: "review_marker_missing" | "exercise_ids_missing" | "exercise_ids_mismatch" | "review_marker_inconsistent" }}
 */
export function checkFirstRecommendationIntegrity(rec) {
  if (!isFirstF01Recommendation(rec)) return { ok: true };
  const m = rec.initialReview;
  if (!m || typeof m !== "object" || typeof m.required !== "boolean") return { ok: false, reason: "review_marker_missing" };
  if (!Array.isArray(rec.exerciseIds)) return { ok: false, reason: "exercise_ids_missing" };
  const ids = candidateExerciseIds(rec);
  if (ids.length > 3 || ids.length !== rec.exerciseIds.length || ids.some((id, i) => id !== rec.exerciseIds[i])) return { ok: false, reason: "exercise_ids_mismatch" };
  if (evaluateInitialReviewTrigger({ limitationIds: rec.limitationIds, items: candidateItemsOf(rec) }).required !== m.required) return { ok: false, reason: "review_marker_inconsistent" };
  return { ok: true };
}

// ── Stage 2: patient acceptance + the first week ──────────────────────────

/** A fresh 5xSTS taken to start the first week of an accepted plan (never a Phase C baseline). */
export const INITIAL_PLAN_BASELINE_ROLE = "initial_plan_baseline";

/** One first week per accepted plan, on every device: a deterministic cycle id (firestore.rules checks it). */
export const initialPlanCycleId = (recommendationId) => `trackingCycle_initial_${recommendationId}`;

/** Accepted through a therapist confirmation (the recommendation's own review), never by a client flag alone. */
export function isInitialPlanAccepted(rec) {
  const c = rec && rec.initialConfirmation;
  return !!rec && rec.status === "accepted" && !!c && c.therapistReviewId === rec.id && Array.isArray(rec.candidateItems);
}

/** The exact review content the patient was shown (time + items + bound version). */
export function initialReviewVersionId(review) {
  if (!review) return null;
  return stableId("irv", { reviewedAt: review.reviewedAt || null, items: (review.items || []).map(planItem), basePlanFingerprint: review.basePlanFingerprint || null });
}

/** Key of a plan's items (exercise + amount + counting basis) — what was accepted. */
export const planItemsKey = (items) => stableId("pi", (items || []).map(planItem));

/**
 * When may the first week start (the D5 handoff policy, js/data/f01ProgressionDecision.js
 * deriveNextCycleHandoff): accepted on the SAME local date as the original assessment and
 * that assessment is a usable current-version baseline -> it is Day 1. Any other date ->
 * a fresh baseline; the original assessment is never back-dated into a later Day 1.
 */
export function deriveInitialPlanHandoff({ originalAssessment, confirmationDateKey }) {
  const measured = originalAssessment ? measuredDateKeyOf(originalAssessment) : null;
  const usable = !!originalAssessment && isUsableNextCycleBaseline(originalAssessment) && isCurrentFa5xMeasurement(originalAssessment.result);
  const reuse = usable && !!measured && measured === confirmationDateKey;
  return {
    baselineReuseAllowed: reuse,
    requiresFreshBaseline: !reuse,
    confirmationDateKey: confirmationDateKey || null,
    originalAssessmentId: originalAssessment ? originalAssessment.id : null,
    originalAssessmentDateKey: measured,
  };
}

/** What a review is bound to: the recommendation's own basis and its trigger version. */
export function initialReviewBasis(rec) {
  const req = resolveInitialReviewRequirement(rec);
  return {
    recommendationId: rec.id,
    sourceAssessmentId: rec.sourceAssessmentId || null,
    selectedGoalId: rec.selectedGoalId || null,
    availableMinutes: rec.availableMinutes ?? null,
    limitationIds: Array.isArray(rec.limitationIds) ? [...rec.limitationIds] : null,
    recommendationRuleVersion: rec.recommendationRuleVersion || null,
    checkVersion: req.checkVersion,
    triggerCodes: req.triggerCodes,
  };
}

/** The exact version the therapist looked at: candidate items + basis. */
export function initialPlanFingerprint(rec) {
  return JSON.stringify({ candidate: candidateItemsOf(rec).map(planItem), basis: initialReviewBasis(rec) });
}

/**
 * Is `review` a valid confirmation of THIS recommendation version, by a therapist whose
 * relation (the same relationId) is still accepted? `relationOf(therapistId)` -> relation | null.
 */
export function isInitialReviewValidFor(rec, review, relationOf) {
  if (!rec || !review) return false;
  const relation = review.therapistId ? relationOf(review.therapistId) : null;
  return review.id === rec.id && review.recommendationId === rec.id
    && review.patientId === rec.patientId
    && !!relation && relation.id === review.relationId
    && Array.isArray(review.items) && review.items.length > 0
    && review.basePlanFingerprint === initialPlanFingerprint(rec)
    && JSON.stringify(review.basis) === JSON.stringify(initialReviewBasis(rec));
}

/**
 * @returns {{ status: "not_required" | "needs_review" | "reviewed" | "accepted", reasons, review, staleReview,
 *            candidateItems, confirmedItems, requirementSource, confirmation }}
 * "reviewed" = a linked therapist confirmed this version; the patient may accept it.
 * "accepted" = the patient accepted it (frozen, like an accepted D5 proposal; a later relation
 *              change does not undo an acceptance). Whether the first week runs is the service's call.
 */
export function resolveInitialArrangement(rec, { review = null, relationOf = () => null } = {}) {
  const req = resolveInitialReviewRequirement(rec);
  const candidateItems = candidateItemsOf(rec);
  if (!req.required) return { status: "not_required", reasons: [], review: null, staleReview: false, candidateItems, confirmedItems: null, requirementSource: req.source, confirmation: null };
  const reasons = req.triggerCodes.map((code) => ({ code, text: INITIAL_REVIEW_TEXT[code] || "這份訓練安排需由復健師檢視後才能開始。" }));
  if (isInitialPlanAccepted(rec)) {
    return { status: "accepted", reasons, review, staleReview: false, candidateItems, confirmedItems: rec.items || [], requirementSource: req.source, confirmation: rec.initialConfirmation };
  }
  const valid = isInitialReviewValidFor(rec, review, relationOf);
  return {
    status: valid ? "reviewed" : "needs_review",
    reasons,
    review: valid ? review : null,
    staleReview: !!review && !valid,
    candidateItems,
    confirmedItems: valid ? review.items : null,
    requirementSource: req.source,
    confirmation: null,
  };
}
