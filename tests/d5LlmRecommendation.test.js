process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { FA5X_CURRENT_MEASUREMENT_FIELDS as FA5X_M } from "../js/data/fa5xMeasurementCompatibility.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * F01 再評估後的 LLM 推薦草稿 — local prototype. Isolated in-memory data through
 * the real services; the model is ALWAYS a test double (injected generator,
 * recorded as provider "test_double"). No Gemini call, no cloud.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const L = await import("../js/data/d5LlmRecommendation.js");
const A = await import("../js/data/d5Arrangement.js");
const R = await import("../js/data/d5TherapistReviewService.js");
const SVC = await import("../js/services/d5RecommendationDraftService.js");
const W = await import("../js/ui/d5ProposalView.js");
const { LLM_RECOMMENDATION_CONFIG } = await import("../js/config/llmRecommendationConfig.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");

const catalog = exerciseService.listNormalized();
const catalogIds = catalog.map((e) => e.id);
const relations = createCollection("therapistPatientRelations");
const recs = createCollection("recommendationResults");
const cycles = createCollection("trackingCycles");
const T1 = "therapist-1";
const DAYS6 = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];

function completedCycle(user, { goal = "G05", minutes = 15, reMs = 8500, days = 6 } = {}) {
  relations.create({ id: `rel-${user}`, therapistId: T1, patientId: user, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
  const mk = (ms, at, role = null) => {
    const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, targetReps: 5, totalDurationMs: ms, rejectedAttempts: [], trackingLossCount: 0, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
    return functionalAssessmentService.getById(s.id);
  };
  const b = mk(12000, [2026, 8, 28, 9, 0]);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, availableMinutes: minutes, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: user, result: r, createdBy: user }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: b, recommendation: rec }).cycle;
  cycles.update(cycle.id, { completedTrainingDates: DAYS6.slice(0, days) });
  const re = mk(reMs, [2026, 9, 4, 20, 0], { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: b.id });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: user, reassessment: re, todayDateKey: "2026-10-04" });
  return { cycle: cycles.getById(cycle.id) };
}
const evaluate = (user, cycleId, currentLimitations = [], discomfort = false) =>
  trackingCycleService.evaluateD5Proposal({ cycleId, userId: user, input: { hasNewOrWorseningDiscomfort: discomfort, discomfortNote: discomfort ? "右膝有點痠" : null, currentLimitations }, catalog }).proposal;
const prep = (user, proposal) => SVC.prepareD5LlmRequest({ proposal, ctx: trackingCycleService.loadD5Proposal({ proposalId: proposal.id, userId: user }).ctx, catalogIds });
/** A model answer shaped from the payload it was given. */
const answer = (payload, decision, optionIds = [], reasons = [{ text: "依前後時間變化與完成天數提出草稿。", factIds: ["time_change", "training_completion"] }]) => ({
  schemaVersion: L.D5_LLM_OUTPUT_SCHEMA_VERSION, inputId: payload.inputId, candidateSetId: payload.candidateSetId, decision,
  changes: optionIds.map((id) => { const o = payload.options.find((x) => x.optionId === id) || { optionId: id, fromExerciseId: id.split(">")[0], toExerciseId: id.split(">")[1] }; return { optionId: o.optionId, fromExerciseId: o.fromExerciseId, toExerciseId: o.toExerciseId }; }),
  reasons,
});
const fake = (fn) => async ({ payload }) => fn(payload);
const accept = (user, id) => trackingCycleService.confirmD5Proposal({ proposalId: id, userId: user, confirmationDateKey: "2026-10-04" });

assert.equal(LLM_RECOMMENDATION_CONFIG.enabled, false, "the real model is off by default");

// ── 1. structured input, allowed decisions, candidates (real D5 outcomes) ──
const uP = "p-progress";
const cP = completedCycle(uP).cycle; // G05 [F01-17, F01-18], 12.0 → 8.5 s, 6 / 6 days → R005
let pP = evaluate(uP, cP.id);
{
  assert.equal(pP.d5.decisionRuleId, "R005");
  const x = prep(uP, pP);
  assert.deepEqual(x.input.training, { completedTrainingDays: 6, plannedTrainingDays: 6 }, "numerator / denominator kept");
  assert.deepEqual([x.input.timeChange.changeSeconds, x.input.timeChange.changePercent], [-3.5, -29.2]);
  assert.equal(x.input.timeChange.reference.referenceSeconds, 3.12);
  assert.match(x.input.timeChange.reference.note, /不是已驗證的臨床門檻/);
  assert.ok(!/"(low|medium|high)"|完成率(高|中|低)/.test(JSON.stringify(x.input)), "completion never renamed low / medium / high");
  assert.deepEqual(x.envelope.allowedDecisions, ["progress", "maintain"]);
  assert.deepEqual(x.candidates.options.map((o) => [o.optionId, o.transitionType, o.specStatus, o.evidenceType]), [["F01-17>F01-19", "progression", "Confirmed", "Evidence"]]);
  assert.ok(x.candidates.options[0].sourceUrl, "each offered row keeps its source");
  assert.deepEqual(x.candidates.notOffered.map((n) => [n.fromExerciseId, n.toExerciseId, n.why]), [["F01-18", "F01-20", "spec_status_pending"]], "a Pending row is listed, never offered");
  assert.match(x.candidates.note, /不等於專業人員已確認/);
  assert.equal(x.legalPlans.length, 2, "maintain or the one progression");
  assert.ok(!JSON.stringify(x.payload).includes("右膝"), "no free text reaches the model");
}
const uM = "p-maintain";
const cM = completedCycle(uM, { reMs: 11900 }).cycle; // within the reference → R008 maintain
const pM = evaluate(uM, cM.id);
{
  assert.equal(pM.d5.decisionRuleId, "R008");
  const x = prep(uM, pM);
  assert.deepEqual(x.envelope.allowedDecisions, ["maintain"]);
  assert.deepEqual(x.legalPlans, [{ decision: "maintain", optionIds: [] }], "only one legal plan: recorded as no choice");
}
const uA = "p-adjust";
const cA = completedCycle(uA, { goal: "G02", reMs: 16000, days: 3 }).cycle; // G02 [F01-01, F01-02], slower → R010
const pA = evaluate(uA, cA.id);
{
  assert.equal(pA.d5.decisionRuleId, "R010");
  const x = prep(uA, pA);
  assert.deepEqual(x.envelope.allowedDecisions, ["maintain", "regress"], "never progress after the rule's adjust");
  assert.deepEqual(x.candidates.options.map((o) => o.optionId).sort(), ["F01-02>F01-03", "F01-02>F01-04"]);
  assert.ok(x.candidates.notOffered.some((n) => n.why === "already_in_plan"));
  assert.deepEqual(x.legalPlans.map((p) => p.decision).sort(), ["maintain", "maintain", "regress"]);
}
const uL = "p-limit";
const cL = completedCycle(uL, { minutes: 20 }).cycle; // G05 [17, 18, 19] + new L03 excludes 19, no confirmed way out
const pL = evaluate(uL, cL.id, ["L03"]);
assert.deepEqual(prep(uL, pL).skip, "no_legal_plan", "no legal plan → no model call, the rule result stands");

// ── 2. validation: any violation rejects the WHOLE output ──
{
  const x = prep(uP, pP);
  const v = (out, ctx = x) => L.validateD5LlmOutput(out, { input: ctx.input, envelope: ctx.envelope, candidates: ctx.candidates });
  assert.equal(v(answer(x.payload, "progress", ["F01-17>F01-19"])).passed, true);
  assert.equal(v(answer(x.payload, "maintain")).passed, true);
  const codes = (out, ctx) => v(out, ctx).errors.map((e) => e.code);
  assert.ok(codes(answer(x.payload, "progress", ["F01-99>F01-98"])).includes("UNKNOWN_EXERCISE"));
  assert.ok(codes(answer(x.payload, "progress", ["F01-18>F01-20"])).includes("RELATION_NOT_CONFIRMED"), "a Pending relation is refused");
  assert.ok(codes(answer(x.payload, "regress")).includes("DECISION_NOT_ALLOWED"));
  assert.ok(codes(answer(x.payload, "progress")).includes("DECISION_ACTION_MISMATCH"), "progress without a progression");
  assert.ok(codes(answer(x.payload, "maintain", ["F01-17>F01-19"])).includes("DECISION_ACTION_MISMATCH"));
  assert.ok(codes({ ...answer(x.payload, "maintain"), inputId: "in-old" }).includes("INPUT_MISMATCH"), "an answer for another input version");
  assert.ok(codes(answer(x.payload, "maintain", [], [{ text: "依據不明", factIds: ["made_up"] }])).includes("REASON_UNKNOWN_FACT"));
  assert.ok(codes(answer(x.payload, "maintain", [], [{ text: "沒有依據" }])).includes("REASON_UNSUPPORTED"));
  assert.ok(codes(answer(x.payload, "maintain", [], [{ text: "時間進步 50%", factIds: ["time_change"] }])).includes("UNVERIFIED_NUMBER"));
  assert.ok(codes(answer(x.payload, "maintain", [], [{ text: "肌力已明顯改善", factIds: ["time_change"] }])).includes("UNSAFE_CLAIM"));
  assert.equal(v(answer(x.payload, "maintain", [], [{ text: "完成 6 / 6 天、時間少 3.5 秒（29.2%），F01-17 維持", factIds: ["training_completion", "time_change"] }])).passed, true, "numbers from the cited facts; ids are not numbers");
  const mixed = v(answer(x.payload, "progress", ["F01-17>F01-19"], [{ text: "合理", factIds: ["time_change"] }, { text: "明顯改善", factIds: ["time_change"] }]));
  assert.deepEqual([mixed.passed, mixed.plan], [false, null], "one bad part rejects the whole output");
  // excluded by a limitation
  const limited = { ...pP, d5: { ...pP.d5, currentLimitations: ["L03"] } };
  const xl = { input: L.buildD5LlmInput({ proposal: limited }), envelope: L.buildD5Envelope(limited), candidates: L.buildD5CandidateSet({ proposal: limited, catalogIds }) };
  assert.ok(codes(answer({ inputId: xl.input.inputId, candidateSetId: xl.candidates.candidateSetId, options: [] }, "progress", ["F01-17>F01-19"]), xl).includes("LIMITATION_CONFLICT"));
  // more changes than allowed
  const xa = prep(uA, pA);
  assert.ok(L.validateD5LlmOutput(answer(xa.payload, "regress", ["F01-02>F01-04", "F01-02>F01-03"]), xa).errors.some((e) => e.code === "TOO_MANY_CHANGES"));
}

// ── 3. off by default: no call, the rule decides ──
{
  const res = await SVC.requestD5LlmDraft({ proposalId: pP.id, userId: uP });
  assert.deepEqual(res, { skipped: "disabled" });
  const arr = R.getD5Arrangement(recs.getById(pP.id));
  assert.deepEqual([arr.status, arr.decisionSource], ["ready", "rule_only"]);
  assert.equal(W.describeDecisionSource(arr), "規則判定（未產生 LLM 草稿）");
}

// ── 4. draft → therapist confirmation → patient acceptance ──
let draftId;
{
  const res = await SVC.requestD5LlmDraft({ proposalId: pP.id, userId: uP }, { generate: fake((p) => answer(p, "progress", ["F01-17>F01-19"], [{ text: "完成 6 / 6 天且時間少 3.5 秒，沿已確認的進階轉換。", factIds: ["training_completion", "time_change", "option:F01-17>F01-19"] }])), now: () => "2026-10-04T13:00:00.000Z" });
  assert.equal(res.draft.status, "valid", JSON.stringify(res.draft.validation));
  pP = recs.getById(pP.id);
  const d = pP.llmDraft;
  draftId = d.draftId;
  assert.deepEqual([d.provider, d.model, d.choiceSpace, d.legalPlanCount], ["test_double", null, "multiple_options", 2], "a fake answer is never recorded as Gemini");
  assert.ok(d.inputId && d.candidateSetId && d.promptVersion && d.inputVersion && d.validatorVersion && d.candidateSpec.sha256);
  assert.deepEqual(d.items.map((i) => i.exerciseId), ["F01-19", "F01-18"]);
  assert.deepEqual(pP.d5.proposedExerciseIds, ["F01-19", "F01-18"], "the rule's own result is untouched");
  const arr = R.getD5Arrangement(pP);
  assert.deepEqual([arr.status, arr.decisionSource], ["needs_review", "llm_draft"]);
  assert.equal(arr.actualLabel, "LLM 草稿：進階（待復健師確認）", "the draft decision is shown (stored under plan.decision)");
  assert.ok(arr.reasons.some((r) => r.code === "llm_draft_requires_review"));
  assert.match(W.describeDecisionSource(arr), /展示用模擬回應，非真實 Gemini/);
  assert.ok(!/LLM 推薦草稿（Gemini）/.test(W.describeDecisionSource(arr)), "never presented as a Gemini draft");
  assert.equal(accept(uP, pP.id).error, "not_confirmable", "every LLM draft needs the therapist first");

  // therapist starts from the draft (planItems) and confirms it
  const rv = await R.reviewD5Proposal({ proposalId: pP.id, therapistId: T1, expectedFingerprint: A.planFingerprint(pP), reason: "同意草稿的進階轉換", items: arr.planItems.map((i) => ({ exerciseId: i.exerciseId })) }, { syncWrites: async () => ({ failed: [] }) });
  assert.ok(rv.review, JSON.stringify(rv));
  assert.equal(rv.review.basedOnLlmDraftId, draftId);
  assert.equal(rv.review.basis.llmDraftId, draftId, "the confirmation is bound to the draft that was shown");
  assert.deepEqual(rv.review.changesFromLlmDraft, [], "confirmed as drafted");
  assert.equal(R.getD5Arrangement(recs.getById(pP.id)).status, "reviewed");
  const ok = accept(uP, pP.id);
  assert.equal(ok.created, true, JSON.stringify(ok));
  const next = trackingCycleService.getActiveTrackingCycle(uP);
  assert.equal(next.recommendationId, pP.id);
  assert.deepEqual(recs.getById(pP.id).items.map((i) => i.exerciseId), ["F01-19", "F01-18"], "next week trains the confirmed draft");
  assert.deepEqual(await SVC.requestD5LlmDraft({ proposalId: pP.id, userId: uP }, { generate: fake((p) => answer(p, "maintain")) }), { skipped: "already_accepted" });
}

// ── 5. invalid / failing model → 規則備用 with the rule's own accept rules ──
{
  const u = "p-fallback"; const c = completedCycle(u).cycle; let p = evaluate(u, c.id);
  const bad = await SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: fake((pl) => answer(pl, "progress", ["F01-18>F01-20"])) });
  assert.equal(bad.draft.status, "rejected");
  assert.ok(bad.draft.validation.errorCodes.includes("RELATION_NOT_CONFIRMED"));
  p = recs.getById(p.id);
  let arr = R.getD5Arrangement(p);
  assert.deepEqual([arr.status, arr.decisionSource], ["ready", "rule_fallback"], "rejected draft never reaches review; the rule result keeps its rules");
  assert.match(W.describeDecisionSource(arr), /規則備用.*RELATION_NOT_CONFIRMED/);
  const err = await SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: async () => { throw new Error("boom"); } });
  assert.deepEqual([err.draft.status, err.draft.failureReason], ["failed", "model_error"]);
  arr = R.getD5Arrangement(recs.getById(p.id));
  assert.equal(arr.decisionSource, "rule_fallback");
  assert.match(W.describeDecisionSource(arr), /模型呼叫失敗/);
  // the rule's review cases stay review cases
  const ua = "p-fallback-adjust"; const ca = completedCycle(ua, { goal: "G02", reMs: 16000, days: 3 }).cycle; const pa = evaluate(ua, ca.id);
  await SVC.requestD5LlmDraft({ proposalId: pa.id, userId: ua }, { generate: async () => { throw new Error("x"); } });
  assert.equal(R.getD5Arrangement(recs.getById(pa.id)).status, "needs_review", "NC-A02 still needs review under 規則備用");
}

// ── 6. only one legal option: recorded honestly ──
{
  const res = await SVC.requestD5LlmDraft({ proposalId: pM.id, userId: uM }, { generate: fake((p) => answer(p, "maintain")) });
  assert.equal(res.draft.choiceSpace, "single_option");
  assert.match(W.describeDecisionSource(R.getD5Arrangement(recs.getById(pM.id))), /只有一個合法選項，沒有選擇空間/);
}

// ── 7. async: newer content / requests win; old answers never overwrite ──
{
  const u = "p-race"; const c = completedCycle(u).cycle; const p = evaluate(u, c.id);
  let release;
  const slow = SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: () => new Promise((res) => { release = res; }) });
  await Promise.resolve();
  assert.equal(R.getD5Arrangement(recs.getById(p.id)).status, "draft_pending", "cannot be accepted while the draft is being made");
  assert.equal(accept(u, p.id).error, "not_confirmable");
  evaluate(u, c.id, ["L05"]); // patient changes the status check meanwhile
  release(answer({ inputId: "x", candidateSetId: "y", options: [] }, "maintain"));
  assert.deepEqual(await slow, { discarded: "superseded" });
  assert.equal(recs.getById(p.id).llmDraft, null, "the old answer did not overwrite the new version");

  // two overlapping requests: the later one wins, the earlier one is discarded
  // (L05 is now a new limitation → progress is no longer allowed; both answer 維持 with different reasons)
  assert.deepEqual(prep(u, recs.getById(p.id)).envelope.allowedDecisions, ["maintain", "regress"]);
  const why = (text) => [{ text, factIds: ["reported_discomfort", "current_limitations"] }];
  let releaseFirst;
  const first = SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: (args) => new Promise((res) => { releaseFirst = () => res(answer(args.payload, "maintain", [], why("較早的請求"))); }), now: () => "2026-10-04T13:00:00.000Z" });
  await Promise.resolve();
  const second = await SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: fake((pl) => answer(pl, "maintain", [], why("較新的請求"))), now: () => "2026-10-04T13:00:05.000Z" });
  assert.equal(second.draft.status, "valid", JSON.stringify(second.draft.validation));
  releaseFirst();
  assert.deepEqual(await first, { discarded: "superseded" });
  assert.equal(recs.getById(p.id).llmDraft.plan.reasons[0].text, "較新的請求");
  const progressNow = await SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: fake((pl) => answer(pl, "progress", ["F01-17>F01-19"])) });
  assert.ok(progressNow.draft.validation.errorCodes.includes("DECISION_NOT_ALLOWED"), "after a new limitation, a progress answer is rejected");

  // account switched while waiting
  const uS = "p-switch"; const cS = completedCycle(uS).cycle; const pS = evaluate(uS, cS.id);
  const sw = await SVC.requestD5LlmDraft({ proposalId: pS.id, userId: uS }, { generate: fake((pl) => answer(pl, "maintain")), isStillCurrent: () => false, now: () => "2026-10-04T13:00:00.000Z" });
  assert.deepEqual(sw, { discarded: "account_changed" });
  const pending = recs.getById(pS.id);
  assert.equal(A.resolveD5Arrangement(pending, { now: Date.parse("2026-10-04T13:01:00.000Z") }).status, "draft_pending", "still pending one minute later");
  const later = A.resolveD5Arrangement(pending, { now: Date.parse("2026-10-04T13:06:00.000Z") });
  assert.deepEqual([later.status, later.decisionSource], ["ready", "rule_fallback"], "a request that never finished expires to the rule result");
}

// ── 8. a confirmation is bound to the draft version that was shown ──
{
  const u = "p-bind"; const c = completedCycle(u).cycle; let p = evaluate(u, c.id);
  await SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: fake((pl) => answer(pl, "progress", ["F01-17>F01-19"])), now: () => "2026-10-04T13:00:00.000Z" });
  p = recs.getById(p.id);
  const items = A.resolveD5Arrangement(p).planItems.map((i) => ({ exerciseId: i.exerciseId }));
  const rv = await R.reviewD5Proposal({ proposalId: p.id, therapistId: T1, expectedFingerprint: A.planFingerprint(p), reason: "同意", items }, { syncWrites: async () => ({ failed: [] }) });
  assert.ok(rv.review);
  assert.equal(R.getD5Arrangement(recs.getById(p.id)).status, "reviewed");
  // the draft is regenerated (same week) → the old confirmation no longer applies
  await SVC.requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: fake((pl) => answer(pl, "maintain")), now: () => "2026-10-04T14:00:00.000Z" });
  const arr = R.getD5Arrangement(recs.getById(p.id));
  assert.deepEqual([arr.status, arr.staleReview], ["needs_review", true]);
  assert.equal(accept(u, p.id).error, "not_confirmable");
  // a therapist who saw the old draft cannot confirm the new one
  const late = await R.reviewD5Proposal({ proposalId: p.id, therapistId: T1, expectedFingerprint: A.planFingerprint(p), reason: "舊畫面", items }, { syncWrites: async () => ({ failed: [] }) });
  assert.equal(late.error, "proposal_changed");
}

// ── 9. wiring: the real model is never called by default; the summary task is untouched ──
{
  const app = readFileSync(join(root, "app.js"), "utf8");
  const fn = (name) => { const i = app.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return app.slice(i, app.indexOf("\n}\n", i)); };
  assert.match(fn("startD5LlmDraft"), /const simulated = LOCAL_DEMO_MODE && localDemoModule \? localDemoModule\.simulateD5ModelAnswer : null;/, "the simulated model exists only in the isolated demo");
  assert.match(fn("startD5LlmDraft"), /if \(!simulated && !LLM_RECOMMENDATION_CONFIG\.enabled\) return;/, "otherwise the real model stays off unless enabled");
  assert.match(app, /if \(!LOCAL_DEMO_MODE\) authService\.subscribe\(/, "the demo never attaches Firebase login");
  assert.match(fn("startD5LlmDraft"), /isStillCurrent: \(\) => getCurrentPatientId\(\) === userId/);
  assert.match(fn("submitD5StatusCheck"), /startD5LlmDraft\(res\.proposal\.id\)/);
  const adapter = readFileSync(join(root, "js/services/llmProviderAdapter.js"), "utf8");
  assert.match(adapter, /export async function generateWeeklySummaryWithGemini/, "weekly summary task kept");
  assert.match(adapter, /if \(!config \|\| config\.enabled !== true\) throw new Error\("llm_recommendation_disabled"\)/);
  const core = readFileSync(join(root, "js/data/d5LlmRecommendation.js"), "utf8");
  assert.ok(!/firebase|fetch\(|createCollection|setDoc/.test(core), "the core is pure");
  assert.ok(!/sets|repetitions|durationSeconds/.test(JSON.stringify(prep("p-x", evaluate("p-x", completedCycle("p-x").cycle.id)).payload.outputShape)), "the model never produces an amount");
}

// ── 10. therapist card: the draft as proposed, with each change's spec row and cited facts ──
{
  const app = readFileSync(join(root, "app.js"), "utf8");
  const src = (name) => { const i = app.indexOf(`function ${name}(`); let j = app.indexOf("{", i), d = 0; for (; j < app.length; j++) { if (app[j] === "{") d++; else if (app[j] === "}" && --d === 0) break; } return app.slice(i, j + 1); };
  const constSrc = (name) => { const i = app.indexOf(`const ${name} =`); return app.slice(i, app.indexOf(";\n", i) + 1); };
  const render = new Function("exerciseService", "LLM_DRAFT_DECISION_LABEL", `${constSrc("d5ExerciseName")}
${constSrc("D5_NOT_OFFERED_TEXT")}
${src("escapeD5Text")}
${src("renderD5DraftDetails")}
return renderD5DraftDetails;`)(exerciseService, W.LLM_DRAFT_DECISION_LABEL);
  const html = render(recs.getById(pP.id).llmDraft);
  assert.ok(html.includes("LLM 推薦草稿｜判定：進階"));
  assert.ok(html.includes("規格狀態 Confirmed") && html.includes("Evidence") && html.includes("nth.nhs.uk"), "spec status, evidence type and source per change");
  assert.ok(html.includes("依據：training_completion"), "cited facts shown");
  assert.ok(html.includes("規格的 Confirmed 不等於專業人員已確認此個案的安排"));
  assert.ok(html.includes("來源：展示用模擬回應，非真實 Gemini") && !html.includes("來源：Gemini"), "a test double is never presented as Gemini");
  assert.ok(html.includes("不提供") && html.includes("規格狀態 Pending，尚未確認") && html.includes("合法選項（2 種安排）"), "legal options and rows not offered are listed");
}

console.log("d5LlmRecommendation: all assertions passed");
