/**
 * F01 再評估後的 LLM 推薦草稿 — pure core (no storage, no network, no clock).
 *
 * Direction (ReMotion_建議.docx, 學長): structured results → the LLM decides
 * 退階／維持／進階 and picks exercises from the existing library, with
 * traceable reasons. This module is everything AROUND that call that the
 * program must own:
 *
 *   buildD5LlmInput        structured, program-computed input (no free text)
 *   buildD5Envelope        which decisions are allowed (boundary = the existing
 *                          D5 matrix outcome, D5-0-V1 — kept as a boundary, not
 *                          upgraded to a validated clinical threshold)
 *   buildD5CandidateSet    options: same goal, not excluded by the current
 *                          limitations, only via a Confirmed transition row; each
 *                          row keeps its source / evidence type / status
 *   listLegalPlans         every plan the program would accept (≤ 1 change, as D5)
 *   buildD5PromptPayload   what the model sees
 *   validateD5LlmOutput    whole-output check — any violation rejects ALL of it
 *
 * Engineering decisions of this version (NOT from 學長's document):
 *   - every LLM draft needs therapist confirmation (see d5Arrangement.js);
 *   - "Confirmed" in the transition table is a spec status, not a professional
 *     confirmation of this patient's plan;
 *   - completion is kept as completedTrainingDays / plannedTrainingDays, never
 *     renamed low / medium / high;
 *   - the model never produces sets / reps / seconds.
 */
import { F01_EXERCISE_TRANSITIONS, F01_CHANGE_REFERENCE, F01_PROGRESSION_SPEC_SOURCE } from "./f01ProgressionSpec.js";
import { findF01LimitationConflict, F01_LIMITATIONS } from "./f01GoalRecommendation.js";
import { SAFETY_RULES } from "../services/llmSummaryValidator.js";

export const D5_LLM_INPUT_VERSION = "d5-llm-input-0.1";
export const D5_LLM_OUTPUT_SCHEMA_VERSION = "d5-llm-output-0.1";
export const D5_LLM_VALIDATOR_VERSION = "d5-llm-validator-0.1";
export const D5_LLM_MAX_CHANGES = 1; // same bound as the D5 selection rules (one replacement per cycle)

export const LLM_DECISION = Object.freeze({ PROGRESS: "progress", MAINTAIN: "maintain", REGRESS: "regress" });
export const LLM_DECISION_LABEL = Object.freeze({ progress: "進階", maintain: "維持", regress: "退階" });

/** Deterministic short id of any JSON-able value (FNV-1a 32-bit) — binds outputs / reviews to one exact version. */
export function stableId(prefix, value) {
  const text = JSON.stringify(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${prefix}-${h.toString(16).padStart(8, "0")}`;
}

const round1 = (n) => Math.round(n * 10) / 10;

// ── structured input ───────────────────────────────────────────────────

/**
 * @param proposal     stored D5 proposal (its d5 = the rule's evaluation of this cycle)
 * @param baseline     baseline 5xSTS session
 * @param reassessment reassessment 5xSTS session
 */
export function buildD5LlmInput({ proposal, baseline = null, reassessment = null }) {
  const d5 = proposal.d5;
  const session = (s) => {
    const r = (s && s.result) || {};
    return s ? {
      measurementValid: s.status === "completed" && r.status !== "invalid" && Number.isFinite(r.totalDurationMs),
      completedRepetitions: Number.isInteger(r.completedReps) ? r.completedReps : Number.isInteger(r.repCount) ? r.repCount : null,
      targetRepetitions: Number.isInteger(r.targetReps) ? r.targetReps : 5,
      rejectedAttempts: Array.isArray(r.rejectedAttempts) ? r.rejectedAttempts.length : null,
      trackingLossCount: Number.isInteger(r.trackingLossCount) ? r.trackingLossCount : null,
      totalSeconds: Number.isFinite(r.totalDurationMs) ? round1(r.totalDurationMs / 1000) : null,
    } : null;
  };
  const b = session(baseline);
  const r = session(reassessment);
  const changeSeconds = d5.assessmentValid && Number.isFinite(d5.changeMs) ? round1(d5.changeMs / 1000) : null;
  const changePercent = changeSeconds != null && b && b.totalSeconds ? round1((changeSeconds / b.totalSeconds) * 100) : null;
  const input = {
    inputVersion: D5_LLM_INPUT_VERSION,
    assessment: { name: "Five Times Sit-to-Stand", functionalDomain: "F01 下肢肌力與起身功能" },
    measurement: { baseline: b, reassessment: r, comparisonValid: !!d5.assessmentValid },
    timeChange: {
      // negative = faster. Program-computed; the reference below is the D5 spec's, kept with its limits.
      changeSeconds,
      changePercent,
      reference: {
        id: F01_CHANGE_REFERENCE.evidenceId,
        source: F01_CHANGE_REFERENCE.reference,
        referenceSeconds: F01_CHANGE_REFERENCE.referenceMdcMs / 1000,
        populationFit: F01_CHANGE_REFERENCE.populationFit,
        specVersion: F01_PROGRESSION_SPEC_SOURCE.version,
        note: "D5 規格採用的參考值；研究族群與 ReMotion 只部分相符，不是已驗證的臨床門檻",
      },
      classification: d5.changeClass || null,
    },
    training: {
      completedTrainingDays: Number.isInteger(d5.completedTrainingDays) ? d5.completedTrainingDays : null,
      plannedTrainingDays: Number.isInteger(d5.plannedTrainingDays) ? d5.plannedTrainingDays : null,
    },
    reported: {
      newOrWorseningDiscomfort: d5.hasNewOrWorseningDiscomfort === true,
      currentLimitations: (d5.currentLimitations || []).map((id) => ({ id, label: (F01_LIMITATIONS.find((l) => l.id === id) || { label: id }).label })),
      newLimitationIds: [...(d5.newLimitations || [])],
    },
    plan: { goalId: d5.selectedGoalId, currentExerciseIds: [...(d5.currentExerciseIds || [])] },
    ruleOutcome: { decisionRuleId: d5.decisionRuleId, matrixDecision: d5.matrixDecision, ruleVersion: d5.decisionRuleVersion },
  };
  return { ...input, inputId: stableId("in", input) };
}

/** Fact ids a reason may cite, each with the numbers it legitimately contains. */
export function buildD5Facts(input, candidates) {
  const facts = [];
  const add = (id, text, numbers = []) => facts.push({ id, text, numbers: numbers.filter((n) => n != null).map(String) });
  const m = input.measurement;
  add("measurement_validity", `前後評估${m.comparisonValid ? "可以比較" : "無法比較"}`, [m.baseline && m.baseline.completedRepetitions, m.reassessment && m.reassessment.completedRepetitions, m.baseline && m.baseline.targetRepetitions]);
  add("time_change", "前後完成時間變化（程式計算）", [m.baseline && m.baseline.totalSeconds, m.reassessment && m.reassessment.totalSeconds, input.timeChange.changeSeconds, input.timeChange.changeSeconds != null ? Math.abs(input.timeChange.changeSeconds) : null, input.timeChange.changePercent, input.timeChange.changePercent != null ? Math.abs(input.timeChange.changePercent) : null]);
  add("time_change_reference", "D5 規格採用的參考值與適用限制", [input.timeChange.reference.referenceSeconds]);
  add("training_completion", "完成訓練天數 / 計畫訓練天數", [input.training.completedTrainingDays, input.training.plannedTrainingDays]);
  add("reported_discomfort", "狀況確認：新的或加重的不適", []);
  add("current_limitations", "狀況確認：目前勾選的情況", []);
  for (const o of candidates.options) add(`option:${o.optionId}`, `${o.fromExerciseId} → ${o.toExerciseId}（${o.transitionType}）`, []);
  return facts;
}

// ── allowed decisions ──────────────────────────────────────────────────

/**
 * The boundary the model must stay in, from the rule's own outcome (D5-0-V1):
 *   matrix progress (faster beyond the reference + all planned days) → progress | maintain
 *   matrix maintain                                                   → maintain
 *   adjust (slower beyond the reference with training, or new
 *           discomfort / limitations)                                 → maintain | regress  (never progress)
 *   no automatic decision                                             → null (no model call)
 */
export function buildD5Envelope(proposal) {
  const d5 = proposal.d5 || {};
  if (!d5.assessmentValid || d5.matrixDecision === "no_auto_decision" || d5.decision === "no_auto_decision") {
    return { allowedDecisions: null, reason: "no_auto_decision" };
  }
  const gate2 = d5.gate === "GATE-LIMITATION";
  let allowed;
  if (gate2 || d5.matrixDecision === "adjust") allowed = [LLM_DECISION.MAINTAIN, LLM_DECISION.REGRESS];
  else if (d5.matrixDecision === "progress") allowed = [LLM_DECISION.PROGRESS, LLM_DECISION.MAINTAIN];
  else allowed = [LLM_DECISION.MAINTAIN];
  return { allowedDecisions: allowed, boundary: { source: "D5 matrix outcome", ruleVersion: d5.decisionRuleVersion, decisionRuleId: d5.decisionRuleId, progressBlocked: gate2 } };
}

// ── candidates ─────────────────────────────────────────────────────────

const ACTION_DECISION = { progression: LLM_DECISION.PROGRESS, regression: LLM_DECISION.REGRESS, same_goal_replacement: null };

/**
 * Options to change ONE current exercise, only along transition rows that are
 * Confirmed in the spec, same goal, candidate present in the catalog, not
 * excluded by the current limitations and not already in the plan. Rows that
 * are not Confirmed are listed (with their status) but never offered.
 */
export function buildD5CandidateSet({ proposal, catalogIds = [], transitions = F01_EXERCISE_TRANSITIONS }) {
  const d5 = proposal.d5;
  const goalId = d5.selectedGoalId;
  const current = [...(d5.currentExerciseIds || [])];
  const limits = d5.currentLimitations || [];
  const inCatalog = new Set(catalogIds);
  const conflictOf = (id) => findF01LimitationConflict(id, limits);
  const currentStatus = current.map((exerciseId) => {
    const c = conflictOf(exerciseId);
    return { exerciseId, excluded: !!c, exclusion: c ? { limitationId: c.limitationId, limitationLabel: c.limitationLabel } : null };
  });
  const options = [];
  const notOffered = [];
  for (const t of transitions) {
    if (t.goalId !== goalId || !current.includes(t.currentExerciseId)) continue;
    const row = {
      fromExerciseId: t.currentExerciseId, toExerciseId: t.candidateExerciseId, transitionType: t.transitionType,
      specStatus: t.status, evidenceType: t.evidenceType, sourceUrl: t.sourceUrl || null,
    };
    let why = null;
    if (t.status !== "Confirmed") why = `spec_status_${String(t.status).toLowerCase()}`;
    else if (!inCatalog.has(t.candidateExerciseId)) why = "not_in_catalog";
    else if (current.includes(t.candidateExerciseId)) why = "already_in_plan";
    else if (conflictOf(t.candidateExerciseId)) why = "excluded_by_limitation";
    if (why) { notOffered.push({ ...row, why }); continue; }
    options.push({ ...row, optionId: `${t.currentExerciseId}>${t.candidateExerciseId}`, decisionImplied: ACTION_DECISION[t.transitionType] });
  }
  const set = {
    goalId,
    currentExercises: currentStatus,
    options,
    notOffered,
    transitionSpec: { version: F01_PROGRESSION_SPEC_SOURCE.version, sha256: F01_PROGRESSION_SPEC_SOURCE.sha256 },
    note: "spec 的 Confirmed 是規格狀態，不等於專業人員已確認此個案的安排",
  };
  return { ...set, candidateSetId: stableId("cs", set) };
}

/** The decision a set of changes amounts to. */
function decisionOfChanges(changes) {
  const kinds = new Set(changes.map((c) => c.decisionImplied).filter(Boolean));
  if (kinds.has(LLM_DECISION.PROGRESS) && kinds.has(LLM_DECISION.REGRESS)) return null;
  if (kinds.has(LLM_DECISION.PROGRESS)) return LLM_DECISION.PROGRESS;
  if (kinds.has(LLM_DECISION.REGRESS)) return LLM_DECISION.REGRESS;
  return LLM_DECISION.MAINTAIN;
}

/**
 * Every plan the program would accept: no change, or exactly one option —
 * its decision inside the envelope, and every excluded current exercise
 * changed. Used to tell "the model had a choice" from "only one legal plan".
 */
export function listLegalPlans(envelope, candidates) {
  if (!envelope.allowedDecisions) return [];
  const mustChange = candidates.currentExercises.filter((c) => c.excluded).map((c) => c.exerciseId);
  const plans = [];
  const consider = (changes) => {
    if (changes.length > D5_LLM_MAX_CHANGES) return;
    if (!mustChange.every((id) => changes.some((c) => c.fromExerciseId === id))) return;
    const decision = decisionOfChanges(changes);
    if (!decision || !envelope.allowedDecisions.includes(decision)) return;
    plans.push({ decision, optionIds: changes.map((c) => c.optionId) });
  };
  consider([]);
  for (const o of candidates.options) consider([o]);
  return plans;
}

// ── model payload ──────────────────────────────────────────────────────

export function buildD5PromptPayload(input, envelope, candidates, nameOf = (id) => id) {
  return {
    task: "f01_next_stage_recommendation",
    outputSchemaVersion: D5_LLM_OUTPUT_SCHEMA_VERSION,
    inputId: input.inputId,
    candidateSetId: candidates.candidateSetId,
    input,
    allowedDecisions: envelope.allowedDecisions,
    maxChanges: D5_LLM_MAX_CHANGES,
    mustChangeExerciseIds: candidates.currentExercises.filter((c) => c.excluded).map((c) => c.exerciseId),
    currentExercises: candidates.currentExercises.map((c) => ({ ...c, name: nameOf(c.exerciseId) })),
    options: candidates.options.map((o) => ({
      optionId: o.optionId, fromExerciseId: o.fromExerciseId, fromName: nameOf(o.fromExerciseId),
      toExerciseId: o.toExerciseId, toName: nameOf(o.toExerciseId), transitionType: o.transitionType,
      decisionImplied: o.decisionImplied, evidenceType: o.evidenceType,
    })),
    facts: buildD5Facts(input, candidates).map(({ id, text }) => ({ id, text })),
    outputShape: {
      schemaVersion: D5_LLM_OUTPUT_SCHEMA_VERSION, inputId: "", candidateSetId: "",
      decision: "progress | maintain | regress",
      changes: [{ optionId: "", fromExerciseId: "", toExerciseId: "" }],
      reasons: [{ text: "", factIds: [""] }],
    },
  };
}

// ── output validation (whole output accepted or rejected) ──────────────

/**
 * @returns {{ passed: boolean, errors: Array<{ code, detail? }>, plan: { decision, changes, exerciseIds, reasons } | null }}
 */
export function validateD5LlmOutput(output, { input, envelope, candidates }) {
  const errors = [];
  const fail = (code, detail) => errors.push(detail === undefined ? { code } : { code, detail });
  if (!output || typeof output !== "object" || Array.isArray(output)) return { passed: false, errors: [{ code: "SCHEMA_INVALID" }], plan: null };
  if (output.schemaVersion !== D5_LLM_OUTPUT_SCHEMA_VERSION) fail("SCHEMA_INVALID", "schemaVersion");
  if (output.inputId !== input.inputId || output.candidateSetId !== candidates.candidateSetId) fail("INPUT_MISMATCH");
  if (!envelope.allowedDecisions) fail("NO_DECISION_ALLOWED");
  if (!Object.values(LLM_DECISION).includes(output.decision)) fail("SCHEMA_INVALID", "decision");
  else if (envelope.allowedDecisions && !envelope.allowedDecisions.includes(output.decision)) fail("DECISION_NOT_ALLOWED", output.decision);
  if (!Array.isArray(output.changes)) fail("SCHEMA_INVALID", "changes");
  if (!Array.isArray(output.reasons) || !output.reasons.length) fail("SCHEMA_INVALID", "reasons");

  const byId = new Map(candidates.options.map((o) => [o.optionId, o]));
  const knownExercise = new Set([...candidates.currentExercises.map((c) => c.exerciseId), ...candidates.options.map((o) => o.toExerciseId)]);
  const changes = [];
  for (const c of Array.isArray(output.changes) ? output.changes : []) {
    const opt = c && byId.get(c.optionId);
    if (!opt) {
      const known = c && knownExercise.has(c.toExerciseId);
      const notOffered = c && candidates.notOffered.find((n) => n.fromExerciseId === c.fromExerciseId && n.toExerciseId === c.toExerciseId);
      if (notOffered && notOffered.why === "excluded_by_limitation") fail("LIMITATION_CONFLICT", `${c.fromExerciseId}>${c.toExerciseId}`);
      else if (notOffered) fail("RELATION_NOT_CONFIRMED", `${c.fromExerciseId}>${c.toExerciseId}:${notOffered.why}`);
      else fail(known ? "RELATION_NOT_CONFIRMED" : "UNKNOWN_EXERCISE", c ? `${c.fromExerciseId}>${c.toExerciseId}` : "null");
      continue;
    }
    if (c.fromExerciseId !== opt.fromExerciseId || c.toExerciseId !== opt.toExerciseId) { fail("OPTION_MISMATCH", c.optionId); continue; }
    changes.push(opt);
  }
  if (changes.length > D5_LLM_MAX_CHANGES) fail("TOO_MANY_CHANGES", changes.length);
  if (new Set(changes.map((c) => c.fromExerciseId)).size !== changes.length) fail("DUPLICATE_CHANGE");
  const mustChange = candidates.currentExercises.filter((c) => c.excluded).map((c) => c.exerciseId);
  for (const id of mustChange) if (!changes.some((c) => c.fromExerciseId === id)) fail("LIMITATION_CONFLICT", `${id} kept`);
  const implied = decisionOfChanges(changes);
  if (Object.values(LLM_DECISION).includes(output.decision) && implied !== output.decision) fail("DECISION_ACTION_MISMATCH", `${output.decision}≠${implied}`);

  // resulting plan: position kept, no duplicates
  const exerciseIds = candidates.currentExercises.map((c) => { const ch = changes.find((x) => x.fromExerciseId === c.exerciseId); return ch ? ch.toExerciseId : c.exerciseId; });
  if (new Set(exerciseIds).size !== exerciseIds.length) fail("DUPLICATE_EXERCISE");
  const limits = (input.reported.currentLimitations || []).map((l) => l.id);
  for (const id of exerciseIds) if (findF01LimitationConflict(id, limits)) fail("LIMITATION_CONFLICT", id);

  // reasons: cite known facts; only numbers those facts contain; no clinical claims
  const facts = buildD5Facts(input, candidates);
  const factById = new Map(facts.map((f) => [f.id, f]));
  const reasons = [];
  for (const r of Array.isArray(output.reasons) ? output.reasons : []) {
    if (!r || typeof r.text !== "string" || !r.text.trim() || !Array.isArray(r.factIds) || !r.factIds.length) { fail("REASON_UNSUPPORTED"); continue; }
    if (r.factIds.some((id) => !factById.has(id))) { fail("REASON_UNKNOWN_FACT", r.factIds.join(",")); continue; }
    const allowedNumbers = new Set(r.factIds.flatMap((id) => factById.get(id).numbers));
    const numericText = r.text.replace(/F0\d-\d{2}|R\d{3}|D5-\d-V\d|G0\d|L0\d/g, ""); // ids are not measured values
    for (const n of numericText.match(/\d+(?:\.\d+)?/g) || []) if (!allowedNumbers.has(n) && !allowedNumbers.has(String(Number(n)))) fail("UNVERIFIED_NUMBER", n);
    for (const rule of SAFETY_RULES) { rule.pattern.lastIndex = 0; if (rule.pattern.test(r.text)) fail("UNSAFE_CLAIM", rule.ruleId); }
    if (r.text.length > 300) fail("REASON_TOO_LONG");
    reasons.push({ text: r.text.trim(), factIds: [...r.factIds] });
  }
  const passed = errors.length === 0;
  return { passed, errors, plan: passed ? { decision: output.decision, changes: changes.map((c) => ({ optionId: c.optionId, fromExerciseId: c.fromExerciseId, toExerciseId: c.toExerciseId, transitionType: c.transitionType, specStatus: c.specStatus, evidenceType: c.evidenceType, sourceUrl: c.sourceUrl })), exerciseIds, reasons } : null };
}
