/**
 * 下一階段建議 — the linked therapist's review of an arrangement the rules
 * could not settle (status "needs_review", js/data/d5Arrangement.js).
 *
 * Stored in its OWN collection, d5TherapistReviews/{proposalId}, which
 * firestore.rules lets only a therapist with an accepted relation to the
 * patient write (the patient can read it, never write it). The patient's
 * proposal (recommendationResults) is never written by the therapist: on
 * acceptance the patient's own write copies the reviewed items, and the rules
 * check them against this review.
 *
 * The therapist confirms ONE exact proposal version: exercises chosen from the
 * goal's own pool that pass the existing limitation filter (same choice set as
 * Phase C), and — only if they type one — sets / repetitions / seconds. Nothing
 * is pre-filled: an empty amount means "the exercise's catalog default". A
 * reason is required; the changes vs the rule's arrangement are recorded.
 */
import { createCollection, waitForCloudWrites } from "./storageService.js";
import { relationService } from "./relationService.js";
import { trackingCycleService } from "./trackingCycleService.js";
import { exerciseService } from "./exerciseService.js";
import { F01_GOALS } from "./f01RecommendationSpec.js";
import { orderF01GoalCandidates, getF01GoalMatchLevel } from "./f01GoalRecommendation.js";
import { planFingerprint, reviewBasis, resolveD5Arrangement, diffPlans, findPlanConflicts, currentValidDraft } from "./d5Arrangement.js";
import { countingOptionsFor, resolvePlanCountingBasisV2, F01_DETECTOR_TARGET_RULES } from "./f01DailyTargets.js";

const recommendations = createCollection("recommendationResults");
const reviews = createCollection("d5TherapistReviews");
export const D5_REVIEW_MAX_ITEMS = 3; // same upper bound as the Phase C time rule (R06)

const linkedTo = (patientId) => (therapistId) => !!therapistId && !!relationService.findAcceptedRelation(therapistId, patientId);
const nameOf = (id) => (exerciseService.getNormalizedById(id) || {}).name || id;

/** The stored review of a proposal (id = proposal id), or null. */
export function getD5Review(proposalId) {
  return proposalId ? reviews.getById(proposalId) : null;
}

/**
 * Arrangement status of a proposal as the app decides it (reviewer must be linked to the patient).
 * F01 batch 2 — `completionRulesVersion` (passed by the app) adds the §3D counting-definition check.
 */
export function getD5Arrangement(proposal, { completionRulesVersion = null } = {}) {
  return resolveD5Arrangement(proposal, { review: getD5Review(proposal && proposal.id), isReviewerLinked: linkedTo(proposal && proposal.patientId), nameOf, now: Date.now(), completionRulesVersion });
}

/** Exercises the therapist may choose: the goal's pool, in Phase C order, minus those the current limitations exclude. */
export function listD5ReviewOptions(proposal, catalog = exerciseService.listNormalized()) {
  return listGoalReviewOptions({ goalId: proposal && proposal.selectedGoalId, limitationIds: (proposal && proposal.d5 && proposal.d5.currentLimitations) || [], catalog });
}

/** Shared by the next-stage review and the first-recommendation review (js/data/f01InitialReviewService.js). */
export function listGoalReviewOptions({ goalId, limitationIds = [], catalog = exerciseService.listNormalized() }) {
  const goal = F01_GOALS.find((g) => g.goalId === goalId);
  if (!goal) return [];
  return orderF01GoalCandidates({ goal, limitationIds, catalog }).ordered.map((c) => ({
    exerciseId: c.exercise.id,
    exerciseName: c.exercise.name,
    matchLevel: c.matchLevel,
    measurementType: (exerciseService.getById(c.exercise.id) || {}).measurementType || null,
    // F01 batch 2 §3C — only the counting options the detector actually supports; and whether the
    // exercise has no usable catalog / source basis (then a choice is needed even without a count).
    countingOptions: countingOptionsFor(c.exercise.id),
    countingBasisRequiredWithoutReps: resolvePlanCountingBasisV2({
      exerciseId: c.exercise.id, repsSource: "catalog_default", catalogRepsText: (exerciseService.getById(c.exercise.id) || {}).repetitions,
      recordsSides: !!(F01_DETECTOR_TARGET_RULES[c.exercise.id] || {}).recordsSides,
    }).basis === "unspecified",
  }));
}

/** The therapist's proposals for a patient that still need — or already got — a review (not yet accepted). */
export function listD5ReviewsForPatient({ therapistId, patientId, completionRulesVersion = null }) {
  if (!therapistId || !patientId || !relationService.findAcceptedRelation(therapistId, patientId)) return [];
  return recommendations
    .query((r) => r.origin === "d5_next_cycle" && r.patientId === patientId && r.status !== "accepted" && r.d5)
    .map((proposal) => {
      const loaded = trackingCycleService.loadD5Proposal({ proposalId: proposal.id, userId: patientId });
      return { proposal, loadError: loaded.error || null, ctx: loaded.ctx || null, arrangement: getD5Arrangement(proposal, { completionRulesVersion }) };
    })
    .filter((x) => x.loadError || x.arrangement.status === "needs_review" || x.arrangement.status === "no_auto" || x.arrangement.status === "reviewed" || x.arrangement.status === "needs_regeneration" || x.arrangement.staleReview)
    .sort((a, b) => String(b.proposal.createdAt).localeCompare(String(a.proposal.createdAt)));
}

const positiveInt = (v) => (v === null || v === undefined || v === "" ? null : Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : NaN);

/** Validates the therapist's items against the allowed options; returns normalized items or an error. */
export function validateD5ReviewItems(items, options, { requireCountingBasis = false } = {}) {
  if (!Array.isArray(items) || !items.length) return { error: "review_items_empty" };
  if (items.length > D5_REVIEW_MAX_ITEMS) return { error: "review_too_many_items" };
  const allowed = new Map(options.map((o) => [o.exerciseId, o]));
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const opt = it && allowed.get(it.exerciseId);
    if (!opt) return { error: "review_exercise_not_allowed", exerciseId: it && it.exerciseId };
    if (seen.has(it.exerciseId)) return { error: "review_duplicate_exercise", exerciseId: it.exerciseId };
    seen.add(it.exerciseId);
    const sets = positiveInt(it.sets);
    const reps = positiveInt(it.repetitions);
    const secs = positiveInt(it.durationSeconds);
    if ([sets, reps, secs].some(Number.isNaN)) return { error: "review_dose_invalid", exerciseId: it.exerciseId };
    if (reps != null && opt.measurementType !== "repetition") return { error: "review_dose_invalid", exerciseId: it.exerciseId };
    if (secs != null && opt.measurementType !== "duration") return { error: "review_dose_invalid", exerciseId: it.exerciseId };
    // F01 batch 2 §3C — the counting basis is saved explicitly; never guessed, never back-filled.
    let countingBasis = null;
    if (requireCountingBasis) {
      const chosen = typeof it.countingBasis === "string" && it.countingBasis ? it.countingBasis : null;
      if (chosen && !(opt.countingOptions || []).includes(chosen)) return { error: "review_counting_basis_unsupported", exerciseId: it.exerciseId };
      const required = reps != null || opt.countingBasisRequiredWithoutReps === true;
      if (required && !chosen) return { error: "review_counting_basis_required", exerciseId: it.exerciseId };
      if (required) countingBasis = chosen;
    }
    const dose = sets != null || reps != null || secs != null || countingBasis
      ? { sets, repetitions: reps, durationSeconds: secs, ...(countingBasis ? { countingBasis } : {}) }
      : null;
    out.push({ exerciseId: it.exerciseId, dose });
  }
  return { items: out };
}

/**
 * Confirms the therapist's arrangement for one proposal version.
 * `expectedFingerprint` = planFingerprint of the proposal the therapist was looking at.
 */
export async function reviewD5Proposal({ proposalId, therapistId, items, reason, expectedFingerprint }, { syncWrites = waitForCloudWrites, now = () => new Date().toISOString(), catalog = exerciseService.listNormalized(), completionRulesVersion = null } = {}) {
  const proposal = proposalId ? recommendations.getById(proposalId) : null;
  if (!proposal || proposal.origin !== "d5_next_cycle" || !proposal.d5) return { error: "proposal_not_found" };
  const relation = relationService.findAcceptedRelation(therapistId, proposal.patientId);
  if (!relation) return { error: "not_authorized" };
  const loaded = trackingCycleService.loadD5Proposal({ proposalId, userId: proposal.patientId });
  if (loaded.error) return { error: loaded.error };
  if (proposal.status === "accepted" || loaded.ctx.nextCycle) return { error: "proposal_already_accepted" };
  if (!expectedFingerprint || expectedFingerprint !== planFingerprint(proposal)) return { error: "proposal_changed" };
  const before = getD5Arrangement(proposal, { completionRulesVersion });
  if (before.status === "needs_regeneration") return { error: "proposal_version_outdated" }; // an old-version G01 draft: regenerate first
  if (!["needs_review", "no_auto", "reviewed"].includes(before.status)) return { error: "review_not_needed" };
  const text = typeof reason === "string" ? reason.trim().slice(0, 500) : "";
  if (!text) return { error: "review_reason_required" };
  const checked = validateD5ReviewItems(items, listD5ReviewOptions(proposal, catalog), { requireCountingBasis: !!completionRulesVersion });
  if (checked.error) return checked;

  const goalLabel = (F01_GOALS.find((g) => g.goalId === proposal.selectedGoalId) || {}).label || proposal.selectedGoalId;
  const ruleItems = proposal.items || [];
  const reviewedItems = checked.items.map((it, idx) => {
    const kept = ruleItems.find((p) => p.exerciseId === it.exerciseId);
    const base = kept
      ? { ...kept }
      : {
        exerciseId: it.exerciseId,
        exerciseName: nameOf(it.exerciseId),
        functionalDomain: "F01",
        sourceAssessmentId: null,
        selectedGoalId: proposal.selectedGoalId,
        selectedGoalLabel: goalLabel,
        matchLevel: getF01GoalMatchLevel(proposal.selectedGoalId, it.exerciseId),
        matchedConditions: [{ ruleId: "TR-01", text: "復健師檢視後選擇" }, { ruleId: "NC-G04", text: "未命中現有的排除規則" }],
        reason: `復健師檢視後選擇「${nameOf(it.exerciseId)}」（同目標「${goalLabel}」）。`,
        aiSupported: !!(exerciseService.getNormalizedById(it.exerciseId) || {}).aiSupported,
        recommendationRole: "",
        evidenceStatus: null,
      };
    const { dose: _old, ...rest } = base;
    return { ...rest, rank: idx + 1, ...(it.dose ? { dose: it.dose } : {}) };
  });
  // Plain JSON only (no undefined) — the rules compare these items with the patient's accepted items.
  const itemsJson = JSON.parse(JSON.stringify(reviewedItems));
  if (findPlanConflicts(itemsJson.map((it) => it.exerciseId), proposal.d5.currentLimitations || []).length) return { error: "review_plan_conflict" };

  const record = {
    id: proposalId,
    proposalId,
    patientId: proposal.patientId,
    therapistId,
    relationId: relation.id,
    reviewedAt: now(),
    reason: text,
    items: itemsJson,
    changes: JSON.parse(JSON.stringify(diffPlans(ruleItems, itemsJson, nameOf))),
    ruleItems: ruleItems.map((p) => ({ exerciseId: p.exerciseId })),
    triggerCodes: before.reasons.map((r) => r.code),
    // the LLM draft this review was made on (if any) and what the therapist changed relative to it
    basedOnLlmDraftId: currentValidDraft(proposal) ? currentValidDraft(proposal).draftId : null,
    changesFromLlmDraft: currentValidDraft(proposal) ? JSON.parse(JSON.stringify(diffPlans(currentValidDraft(proposal).items, itemsJson, nameOf))) : null,
    basis: reviewBasis(proposal),
    basePlanFingerprint: planFingerprint(proposal),
  };

  const previous = reviews.getById(proposalId);
  await syncWrites();
  const saved = previous ? reviews.update(proposalId, record) : reviews.create(record);
  const sync = await syncWrites();
  if (sync.failed.some((f) => f.name === "d5TherapistReviews" && (!f.id || f.id === proposalId))) {
    const others = reviews.list().filter((r) => r.id !== proposalId);
    reviews.replaceAll(previous ? [...others, previous] : others); // local back to what the cloud still has
    return { error: "review_sync_failed" };
  }
  return { review: saved, changes: record.changes };
}
