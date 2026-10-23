/**
 * F01 再評估後的 LLM 推薦草稿 — one request, end to end:
 *   load the proposal → structured input + allowed decisions + candidate set
 *   (js/data/d5LlmRecommendation.js) → model call → reload + staleness check →
 *   whole-output validation → store proposal.llmDraft.
 *
 * Never changes the rule's own result (proposal.d5 / proposal.items): a valid
 * draft only becomes "needs therapist review" (d5Arrangement.js); a rejected /
 * failed draft leaves the rule result and its accept / review rules as they
 * were ("規則備用"). The real model runs only when LLM_RECOMMENDATION_CONFIG is
 * enabled; an injected generator (tests) is always recorded as "test_double".
 */
import { trackingCycleService } from "../data/trackingCycleService.js";
import { recommendationService } from "../data/recommendationService.js";
import { exerciseService } from "../data/exerciseService.js";
import { F01_GOALS } from "../data/f01RecommendationSpec.js";
import { getF01GoalMatchLevel } from "../data/f01GoalRecommendation.js";
import { proposalCoreFingerprint } from "../data/d5Arrangement.js";
import { filterAutoRecommendationIds } from "../data/f01DailyTargets.js";
import {
  buildD5LlmInput, buildD5Envelope, buildD5CandidateSet, listLegalPlans, buildD5PromptPayload, validateD5LlmOutput, stableId,
  D5_LLM_INPUT_VERSION, D5_LLM_OUTPUT_SCHEMA_VERSION, D5_LLM_VALIDATOR_VERSION,
} from "../data/d5LlmRecommendation.js";
import { LLM_RECOMMENDATION_CONFIG } from "../config/llmRecommendationConfig.js";
import { generateD5RecommendationDraftWithGemini } from "./llmProviderAdapter.js";

export const DRAFT_PROVIDER = Object.freeze({ GEMINI: "gemini", TEST_DOUBLE: "test_double" });

const nameOf = (id) => (exerciseService.getNormalizedById(id) || {}).name || id;
const TRANSITION_TEXT = { progression: "已確認的進階轉換", regression: "已確認的退階轉換", same_goal_replacement: "已確認的同目標替換" };

/** Everything the program decides before a model call (pure over the loaded proposal). */
export function prepareD5LlmRequest({ proposal, ctx, catalogIds = exerciseService.listNormalized().map((e) => e.id), excludeAutoRecommendationPending = false }) {
  // F01 batch 2 §3B — new-version automatic candidates never offer F01-19 (only the input list changes).
  if (excludeAutoRecommendationPending) catalogIds = filterAutoRecommendationIds(catalogIds);
  const input = buildD5LlmInput({ proposal, baseline: ctx.baseline, reassessment: ctx.reassessment });
  const envelope = buildD5Envelope(proposal);
  if (!envelope.allowedDecisions) return { skip: "no_auto_decision", input, envelope };
  const candidates = buildD5CandidateSet({ proposal, catalogIds });
  const legalPlans = listLegalPlans(envelope, candidates);
  if (!legalPlans.length) return { skip: "no_legal_plan", input, envelope, candidates, legalPlans };
  return { input, envelope, candidates, legalPlans, payload: buildD5PromptPayload(input, envelope, candidates, nameOf) };
}

/** Next-week items of a validated plan: kept rule items as they are, the changed one rebuilt from the catalog. */
function draftItems(proposal, plan) {
  const goal = F01_GOALS.find((g) => g.goalId === proposal.selectedGoalId) || { goalId: proposal.selectedGoalId, label: proposal.selectedGoalId };
  const ruleItems = proposal.items || [];
  return JSON.parse(JSON.stringify(plan.exerciseIds.map((exerciseId, idx) => {
    const change = plan.changes.find((c) => c.toExerciseId === exerciseId);
    const kept = !change && ruleItems.find((it) => it.exerciseId === exerciseId);
    if (kept) { const { dose: _d, ...rest } = kept; return { ...rest, rank: idx + 1 }; }
    // Last week's exercise kept by the draft although the rule's own result had replaced it.
    if (!change) {
      return {
        rank: idx + 1,
        exerciseId,
        exerciseName: nameOf(exerciseId),
        functionalDomain: "F01",
        sourceAssessmentId: null,
        selectedGoalId: goal.goalId,
        selectedGoalLabel: goal.label,
        matchLevel: getF01GoalMatchLevel(goal.goalId, exerciseId),
        matchedConditions: [{ ruleId: "LLM-02", text: "LLM 草稿沿用上一週的動作" }, { ruleId: "NC-G04", text: "未命中現有的排除規則" }],
        reason: `LLM 草稿：沿用上一週的「${nameOf(exerciseId)}」。`,
        aiSupported: !!(exerciseService.getNormalizedById(exerciseId) || {}).aiSupported,
        recommendationRole: "",
        evidenceStatus: null,
      };
    }
    return {
      rank: idx + 1,
      exerciseId,
      exerciseName: nameOf(exerciseId),
      functionalDomain: "F01",
      sourceAssessmentId: null,
      selectedGoalId: goal.goalId,
      selectedGoalLabel: goal.label,
      matchLevel: getF01GoalMatchLevel(goal.goalId, exerciseId),
      matchedConditions: [{ ruleId: "LLM-01", text: `LLM 草稿沿${TRANSITION_TEXT[change.transitionType] || "已確認的轉換"}選擇` }, { ruleId: "NC-G04", text: "未命中現有的排除規則" }],
      reason: `LLM 草稿：以「${nameOf(exerciseId)}」取代「${nameOf(change.fromExerciseId)}」（${TRANSITION_TEXT[change.transitionType] || "已確認的轉換"}）。`,
      aiSupported: !!(exerciseService.getNormalizedById(exerciseId) || {}).aiSupported,
      recommendationRole: "",
      evidenceStatus: null,
    };
  })));
}

/**
 * @param generate        test seam: async ({ payload }) => output. When given, the call is
 *                        recorded as provider "test_double" (never as Gemini).
 * @param isStillCurrent  () => boolean — false when the signed-in account / case changed meanwhile
 * @returns {{ draft } | { skipped } | { discarded } | { error }}
 */
export async function requestD5LlmDraft({ proposalId, userId }, { config = LLM_RECOMMENDATION_CONFIG, generate = null, now = () => new Date().toISOString(), isStillCurrent = () => true, excludeAutoRecommendationPending = false } = {}) {
  const useReal = !generate;
  if (useReal && config.enabled !== true) return { skipped: "disabled" };
  const loaded = trackingCycleService.loadD5Proposal({ proposalId, userId });
  if (loaded.error) return { error: loaded.error };
  const { proposal, ctx } = loaded;
  if (proposal.status === "accepted" || ctx.nextCycle) return { skipped: "already_accepted" };
  const prep = prepareD5LlmRequest({ proposal, ctx, excludeAutoRecommendationPending });
  if (prep.skip) return { skipped: prep.skip };

  const provider = useReal ? DRAFT_PROVIDER.GEMINI : DRAFT_PROVIDER.TEST_DOUBLE;
  const requestedAt = now();
  const requestId = stableId("rq", { proposalId, inputId: prep.input.inputId, candidateSetId: prep.candidates.candidateSetId, requestedAt });
  const meta = {
    requestId,
    requestedAt,
    provider,
    model: useReal ? config.model : null,
    promptVersion: config.promptVersion,
    inputVersion: D5_LLM_INPUT_VERSION,
    outputSchemaVersion: D5_LLM_OUTPUT_SCHEMA_VERSION,
    validatorVersion: D5_LLM_VALIDATOR_VERSION,
    inputId: prep.input.inputId,
    candidateSetId: prep.candidates.candidateSetId,
    candidateSpec: prep.candidates.transitionSpec,
    proposalCoreFingerprint: proposalCoreFingerprint(proposal),
    allowedDecisions: prep.envelope.allowedDecisions,
    envelopeBoundary: prep.envelope.boundary,
    legalPlanCount: prep.legalPlans.length,
    choiceSpace: prep.legalPlans.length > 1 ? "multiple_options" : "single_option",
    input: prep.input,
    candidates: { options: prep.candidates.options, notOffered: prep.candidates.notOffered, currentExercises: prep.candidates.currentExercises },
  };
  recommendationService.updateF01D5Proposal(proposal.id, { llmDraft: { ...meta, status: "pending" } });

  let output = null;
  let failure = null;
  try {
    output = useReal ? await generateD5RecommendationDraftWithGemini({ payload: prep.payload, config }) : await generate({ payload: prep.payload });
  } catch (e) {
    failure = e && e.message === "llm_timeout" ? "model_timeout" : "model_error";
  }

  // The answer belongs to ONE request on ONE proposal version — anything newer wins.
  if (!isStillCurrent()) return { discarded: "account_changed" };
  const again = trackingCycleService.loadD5Proposal({ proposalId, userId });
  if (again.error) return { discarded: again.error };
  const latest = again.proposal;
  if (latest.status === "accepted" || again.ctx.nextCycle) return { discarded: "already_accepted" };
  if (!latest.llmDraft || latest.llmDraft.requestId !== requestId) return { discarded: "superseded" };
  if (proposalCoreFingerprint(latest) !== meta.proposalCoreFingerprint) return { discarded: "proposal_changed" };
  const recheck = prepareD5LlmRequest({ proposal: latest, ctx: again.ctx, excludeAutoRecommendationPending });
  if (recheck.skip || recheck.input.inputId !== meta.inputId || recheck.candidates.candidateSetId !== meta.candidateSetId) return { discarded: "input_changed" };

  let record;
  if (failure) {
    record = { ...meta, status: "failed", failureReason: failure, validation: null, plan: null, items: null };
  } else {
    const v = validateD5LlmOutput(output, { input: prep.input, envelope: prep.envelope, candidates: prep.candidates });
    record = v.passed
      ? { ...meta, status: "valid", failureReason: null, validation: { passed: true, errorCodes: [] }, plan: v.plan, items: draftItems(latest, v.plan) }
      : { ...meta, status: "rejected", failureReason: "validation_failed", validation: { passed: false, errorCodes: [...new Set(v.errors.map((e) => e.code))], errors: v.errors.slice(0, 20) }, plan: null, items: null };
  }
  record.completedAt = now();
  record.draftId = stableId("dr", { requestId, status: record.status, plan: record.plan });
  recommendationService.updateF01D5Proposal(proposal.id, { llmDraft: JSON.parse(JSON.stringify(record)) });
  return { draft: record };
}
