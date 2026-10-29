process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { FA5X_CURRENT_MEASUREMENT_FIELDS as FA5X_M } from "../js/data/fa5xMeasurementCompatibility.js";

/**
 * G01 next-cycle correction (docs/F01_G01_DECISION_BASIS_V1.md). Decision-logic verification only —
 * not clinical accuracy. Isolated in-memory synthetic data through the real services.
 */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const C = await import("../js/data/fa5xComparisonConditions.js");
const D = await import("../js/data/f01ProgressionDecision.js");
const A = await import("../js/data/d5Arrangement.js");
const W = await import("../js/ui/d5ProposalView.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { prepareD5LlmRequest, requestD5LlmDraft } = await import("../js/services/d5RecommendationDraftService.js");
const { generatePreScreenF01GoalRecommendation } = await import("./fixtures/f01PreScreenEngine.mjs");
const { readFileSync } = await import("node:fs");
const { reviewD5Proposal } = await import("../js/data/d5TherapistReviewService.js");
const { relationService } = await import("../js/data/relationService.js");
const relations = createCollection("therapistPatientRelations");
const reviewsCol = createCollection("d5TherapistReviews");
const catalog = exerciseService.listNormalized();
const cycles = createCollection("trackingCycles");
const recs = createCollection("recommendationResults");
const S = C.COMPARISON_CONDITION_STATUS;

// ── 1. shared condition check: consistent / differ / insufficient; missing, unknown and explicit kept apart ──
{
  const M = { ...FA5X_M, status: "completed", totalDurationMs: 12000 };
  const s = (id, r, extra = {}) => ({ id, patientId: "u", status: "completed", result: M, conditionReports: r === null ? [] : [{ schemaVersion: "fa5x-condition-report-1", reportedBy: "u", source: "self_report", ...r }], ...extra });
  const NO = { armsUsed: "no", physicalAssistance: "no" };
  const check = (b, r, patientId = "u") => C.checkFa5xComparisonConditions({ patientId, baseline: b, reassessment: r });
  const codes = (x) => x.reasons.map((r) => `${r.test || "-"}:${r.code}`);
  const ok = check(s("b", NO), s("r", { ...NO, sameChairAsBaseline: "yes" }));
  assert.equal(ok.status, S.CONSISTENT);
  assert.deepEqual(ok.reasons, []);
  assert.equal(ok.version, C.FA5X_COMPARISON_CONDITIONS_VERSION);
  assert.equal(ok.reassessment.reportIndex, 0);
  assert.ok(!/臨床|clinical/i.test(C.COMPARISON_CONDITION_STATUS_TEXT[S.CONSISTENT].replace("未驗證", "")) && C.COMPARISON_CONDITION_STATUS_TEXT[S.CONSISTENT].includes("未驗證相機量測誤差與研究族群"), "never named clinical comparability");
  // only an explicit "yes" confirms the same chair
  assert.deepEqual(codes(check(s("b", NO), s("r", NO))), ["reassessment:same_chair_missing"]);
  assert.deepEqual(codes(check(s("b", NO), s("r", { ...NO, sameChairAsBaseline: "unknown" }))), ["reassessment:same_chair_unknown"]);
  assert.deepEqual(codes(check(s("b", NO), s("r", { ...NO, sameChairAsBaseline: "not_applicable" }))), ["reassessment:same_chair_not_asked"]);
  assert.equal(check(s("b", NO), s("r", { ...NO, sameChairAsBaseline: "no" })).status, S.DIFFER);
  // hands / assistance: explicit yes = differ; unknown, missing, invalid = insufficient (each its own code)
  assert.deepEqual(codes(check(s("b", { armsUsed: "yes", physicalAssistance: "no" }), s("r", { ...NO, sameChairAsBaseline: "yes" }))), ["baseline:arms_used"]);
  assert.deepEqual(codes(check(s("b", NO), s("r", { armsUsed: "no", physicalAssistance: "yes", sameChairAsBaseline: "yes" }))), ["reassessment:assistance_given"]);
  assert.deepEqual(codes(check(s("b", { armsUsed: "unknown", physicalAssistance: "no" }), s("r", { ...NO, sameChairAsBaseline: "yes" }))), ["baseline:arms_unknown"]);
  assert.deepEqual(codes(check(s("b", { physicalAssistance: "no" }), s("r", { ...NO, sameChairAsBaseline: "yes" }))), ["baseline:arms_missing"]);
  assert.deepEqual(codes(check(s("b", { armsUsed: "nope", physicalAssistance: "no" }), s("r", { ...NO, sameChairAsBaseline: "yes" }))), ["baseline:arms_invalid"]);
  assert.deepEqual(codes(check(s("b", null), s("r", { ...NO, sameChairAsBaseline: "yes" }))), ["baseline:no_condition_report"]);
  // explicit difference wins, the unconfirmed items are still listed
  const mixed = check(s("b", { armsUsed: "yes", physicalAssistance: "unknown" }), s("r", { ...NO, sameChairAsBaseline: "yes" }));
  assert.equal(mixed.status, S.DIFFER);
  assert.deepEqual(codes(mixed), ["baseline:arms_used", "baseline:assistance_unknown"]);
  // ownership / reporter / completion / measurement version
  assert.ok(codes(check(s("b", NO), s("r", { ...NO, sameChairAsBaseline: "yes" }), "other")).includes("baseline:session_not_owned"));
  const intruder = s("r", { ...NO, sameChairAsBaseline: "yes" }); intruder.conditionReports[0].reportedBy = "x";
  assert.equal(check(s("b", NO), intruder).status, S.INSUFFICIENT);
  assert.ok(codes(check(s("b", NO), intruder)).includes("reassessment:reporter_not_owner"));
  assert.ok(codes(check(s("b", NO, { status: "in_progress" }), s("r", { ...NO, sameChairAsBaseline: "yes" }))).includes("baseline:session_not_completed"));
  const oldVersion = s("b", NO, { result: { ...M, algorithmVersion: undefined } });
  assert.ok(codes(check(oldVersion, s("r", { ...NO, sameChairAsBaseline: "yes" }))).includes("-:measurement_not_comparable"));
}

// ── 2. real service flow on a G01 cycle ──
let seq = 0;
function g01Cycle(u, { reMs = 8000, baseReport = { armsUsed: "no", physicalAssistance: "no" }, reReport = { armsUsed: "no", physicalAssistance: "no", sameChairAsBaseline: "yes" }, days = 6, goal = "G01" } = {}) {
  const mk = (ms, at, role = null, report = null) => {
    const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
    if (report) assert.ok(!functionalAssessmentService.appendFa5xConditionReport(s.id, { source: "self_report", ...report }, { reportedBy: u }).error);
    return functionalAssessmentService.getById(s.id);
  };
  seq += 1;
  const b = mk(12000, [2026, 8, 28, 9, seq], null, baseReport);
  const r = (goal === "G01" ? generatePreScreenF01GoalRecommendation : generateF01GoalRecommendation)({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, availableMinutes: 10, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: r, createdBy: u }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec }).cycle;
  const re = mk(reMs, [2026, 9, 4, 20, seq], { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: b.id }, reReport);
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: "2026-10-04" });
  cycles.update(cycle.id, { completedTrainingDates: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"].slice(0, days) });
  return { cycle: cycles.getById(cycle.id), rec };
}
const evaluate = (u, cycleId, input = {}) => trackingCycleService.evaluateD5Proposal({ cycleId, userId: u, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [], ...input }, catalog });
const arrangement = (p) => A.resolveD5Arrangement(p);
{
  // only faster: no progress; the conclusion is the existing no-auto route
  const u = "n-faster";
  const { cycle } = g01Cycle(u, { reMs: 8000 });
  const { proposal: p } = evaluate(u, cycle.id);
  assert.deepEqual([p.d5.matrixDecision, p.d5.decision, p.d5.decisionRuleId, p.d5.selectionRuleId, p.d5.nextCycleReady], ["no_auto_decision", "no_auto_decision", "G01-N01", "NC-N01", false]);
  assert.equal(p.d5.comparisonConditions.status, S.CONSISTENT);
  assert.equal(p.d5.changeClass, "faster_beyond_reference_mdc", "consistent conditions: the change is still classified (display)");
  assert.deepEqual(p.d5.g01NextCycle, { ruleVersion: D.F01_G01_NEXT_CYCLE_RULE_VERSION, applied: true, withdrawnMatrix: { ruleId: "R005", decision: "progress" }, conditionStatus: S.CONSISTENT });
  assert.equal(arrangement(p).status, "no_auto");
  assert.ok(p.d5.reason.includes("不代表系統建議維持原訓練") && !p.d5.reason.replace("不代表系統建議維持原訓練", "").includes("維持"), "keeping the data is never described as recommending maintain");
  const why = W.explainD5Decision(p.d5);
  assert.ok(why[0].includes("差異超過系統採用的參考值") && why.includes("時間變化不能單獨決定下一週訓練。"));
  assert.equal(p.basis.find((b) => b.key === "d5").value, "不自動判定");
  // the acceptance service refuses it; nothing is created
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: "2026-10-04" }).error, "not_confirmable");
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null);
  // LLM: no model call for it (existing skip), and the withdrawn "progress" never reaches a request
  const loaded = trackingCycleService.loadD5Proposal({ proposalId: p.id, userId: u });
  const prep = prepareD5LlmRequest({ proposal: loaded.proposal, ctx: loaded.ctx });
  assert.equal(prep.skip, "no_auto_decision");
  assert.notEqual(prep.input.ruleOutcome.matrixDecision, "progress");
  let called = 0;
  const res = await requestD5LlmDraft({ proposalId: p.id, userId: u }, { generate: async () => { called += 1; return null; } });
  assert.equal(res.skipped, "no_auto_decision");
  assert.equal(called, 0, "model never called");
}
{
  // only slower: no regression, no empty "adjust"
  const u = "n-slower";
  const { cycle } = g01Cycle(u, { reMs: 16000 });
  const { proposal: p } = evaluate(u, cycle.id);
  assert.deepEqual([p.d5.decision, p.d5.decisionRuleId, p.d5.selectionRuleId], ["no_auto_decision", "G01-N01", "NC-N01"]);
  assert.equal(p.d5.g01NextCycle.withdrawnMatrix.ruleId, "R010");
  assert.ok(!arrangement(p).reasons.some((r) => r.code === "adjust_without_rule"));
}
{
  // within the reference: not "proven no real change"; training days do not turn it into "maintain"
  const u = "n-within";
  const { cycle } = g01Cycle(u, { reMs: 11500, days: 6 });
  const { proposal: p } = evaluate(u, cycle.id);
  assert.equal(p.d5.decision, "no_auto_decision");
  assert.equal(p.d5.g01NextCycle.withdrawnMatrix.ruleId, "R008");
  assert.ok(W.explainD5Decision(p.d5)[0].includes("這不代表已證明沒有真實變化"));
  assert.ok(!W.explainD5Decision(p.d5).join("").includes("視為沒有明確變化"));
}
{
  // conditions differ / missing: change not interpreted; reasons named
  for (const [u, opts, status, code] of [
    ["n-chair", { reReport: { armsUsed: "no", physicalAssistance: "no", sameChairAsBaseline: "no" } }, S.DIFFER, "different_chair"],
    ["n-arms", { reReport: { armsUsed: "yes", physicalAssistance: "no", sameChairAsBaseline: "yes" } }, S.DIFFER, "arms_used"],
    ["n-assist", { baseReport: { armsUsed: "no", physicalAssistance: "yes" } }, S.DIFFER, "assistance_given"],
    ["n-missing", { reReport: null }, S.INSUFFICIENT, "no_condition_report"],
    ["n-unknown", { reReport: { armsUsed: "unknown", physicalAssistance: "no", sameChairAsBaseline: "yes" } }, S.INSUFFICIENT, "arms_unknown"],
  ]) {
    const { cycle } = g01Cycle(u, opts);
    const { proposal: p } = evaluate(u, cycle.id);
    assert.equal(p.d5.comparisonConditions.status, status, u);
    assert.ok(p.d5.comparisonConditions.reasons.some((r) => r.code === code), `${u}: ${code}`);
    assert.equal(p.d5.changeClass, D.CHANGE_NOT_INTERPRETED, `${u}: not read against the reference`);
    assert.equal(p.d5.decision, "no_auto_decision");
    assert.ok(W.explainD5Decision(p.d5)[0].includes("這次時間差不以參考值解讀"), u);
    assert.ok(W.describeD5ConditionStatus(p.d5));
  }
}
{
  // protections stay: new / worsening discomfort -> R011 + professional review; new limitation -> R011
  const u = "n-discomfort";
  const { cycle } = g01Cycle(u, { reMs: 8000, reReport: { armsUsed: "yes", physicalAssistance: "no", sameChairAsBaseline: "no" } });
  const { proposal: p } = evaluate(u, cycle.id, { hasNewOrWorseningDiscomfort: true, discomfortNote: "膝蓋痠" });
  assert.deepEqual([p.d5.decisionRuleId, p.d5.gate, p.d5.confirmationMode], ["R011", "GATE-LIMITATION", "professional_review_required"]);
  assert.equal(p.d5.g01NextCycle.applied, false);
  assert.equal(arrangement(p).status, "needs_review");
  const u2 = "n-limit";
  const { cycle: c2 } = g01Cycle(u2, { reMs: 8000 });
  const { proposal: p2 } = evaluate(u2, c2.id, { currentLimitations: ["L05"] });
  assert.deepEqual([p2.d5.decisionRuleId, p2.d5.gate], ["R011", "GATE-LIMITATION"]);
}
{
  // a frozen (accepted) earlier G01 proposal is returned unchanged by a new status check
  const u = "n-frozen";
  const { cycle } = g01Cycle(u, { reMs: 8000 });
  const { proposal: p } = evaluate(u, cycle.id);
  const oldD5 = { ...p.d5, decision: "maintain", matrixDecision: "progress", decisionRuleId: "R005", selectionRuleId: "NC-P01", g01NextCycle: undefined };
  recs.update(p.id, { status: "accepted", d5: oldD5 });
  const again = evaluate(u, cycle.id);
  assert.equal(again.frozen, true);
  assert.equal(again.proposal.d5.decisionRuleId, "R005", "historical judgement not rewritten");
}
{
  // other goals: unchanged (no G01 fields), with or without a condition check
  const u = "n-g05";
  const { cycle } = g01Cycle(u, { reMs: 8000, goal: "G05" });
  const { proposal: p } = evaluate(u, cycle.id);
  assert.equal(p.d5.decisionRuleId, "R005");
  assert.equal(p.d5.g01NextCycle, undefined);
  assert.equal(p.d5.comparisonConditions, undefined);
  for (const goal of ["G02", "G03", "G04", "G05"]) for (const change of [-4000, -1000, 4000]) for (const days of [0, 3, 6]) {
    const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: "b", assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, availableMinutes: 15, catalog });
    const sc = { id: "c", userId: "u", baselineAssessmentId: "b", reassessmentId: "r", selectedGoalId: goal, cycleStartDateKey: "2026-09-22", plannedReassessmentDateKey: "2026-09-28", completedTrainingDates: ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"].slice(0, days), limitationsSnapshot: [] };
    const args = { sourceCycle: sc, sourceRecommendation: { id: "rec", items: r.items, limitationIds: [], selectedGoalId: goal }, comparison: { eligible: true, changeMs: change }, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] }, catalog };
    assert.deepEqual(D.buildD5Proposal({ ...args, comparisonConditions: { status: S.DIFFER, reasons: [] } }), D.buildD5Proposal(args), `${goal} ${change} ${days}`);
  }
}
// ── 3. docs/F01_G01_PROGRAM_SELECTION.md 一-1: an old-version G01 draft is regenerated, never shown / accepted / reviewed as current ──
{
  const u = "n-outdated";
  relations.create({ id: "rel-outdated", therapistId: "t-1", patientId: u, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
  const { cycle } = g01Cycle(u, { reMs: 8000 });
  const { proposal: fresh } = evaluate(u, cycle.id);
  // the draft as an earlier version stored it: time matrix "progress", no g01NextCycle, ready for acceptance
  const oldD5 = { ...fresh.d5, decision: "maintain", matrixDecision: "progress", decisionRuleId: "R005", selectionRuleId: "NC-P01", selectionFallback: "no_confirmed_progression",
    confirmationMode: "user_acceptance", nextCycleReady: true, reason: "本週符合進階候選條件，但目前沒有已確認的進階候選；下一週沿用目前訓練配置，持續追蹤。" };
  delete oldD5.g01NextCycle; delete oldD5.comparisonConditions;
  recs.update(fresh.id, { d5: oldD5 });
  const old = recs.getById(fresh.id);
  assert.equal(A.isOutdatedG01Proposal(old), true);
  // a therapist confirmation of exactly that old version
  reviewsCol.create({ id: old.id, proposalId: old.id, patientId: u, therapistId: "t-1", relationId: "rel-outdated", items: old.items, reason: "舊版確認", basis: A.reviewBasis(old), basePlanFingerprint: A.planFingerprint(old), reviewedAt: "2026-10-04T10:00:00.000Z" });
  const arr = A.resolveD5Arrangement(old, { review: reviewsCol.getById(old.id), isReviewerLinked: () => true });
  assert.equal(arr.status, "needs_regeneration");
  assert.equal(arr.review, null, "the old confirmation is not carried over");
  assert.ok(arr.reasons[0].text.includes("原本的草稿紀錄會保留") && arr.reasons[0].text.includes("先前的確認不會沿用"));
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: old.id, userId: u, confirmationDateKey: "2026-10-04" }).error, "not_confirmable");
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null);
  assert.equal((await reviewD5Proposal({ proposalId: old.id, therapistId: "t-1", items: old.items, reason: "x", expectedFingerprint: A.planFingerprint(old) }, { syncWrites: async () => ({ total: 0, failed: [] }) })).error, "proposal_version_outdated");
  // regeneration (the status check again): new rule, the old content kept, the old confirmation no longer valid
  const { proposal: regen } = evaluate(u, cycle.id);
  assert.equal(regen.id, old.id, "same record");
  assert.equal(regen.d5.decisionRuleId, "G01-N01");
  assert.equal(regen.supersededDrafts.length, 1);
  assert.deepEqual([regen.supersededDrafts[0].d5.decisionRuleId, regen.supersededDrafts[0].reason], ["R005", "decision_version_outdated"]);
  const after = A.resolveD5Arrangement(regen, { review: reviewsCol.getById(old.id), isReviewerLinked: () => true });
  assert.equal(after.status, "no_auto");
  assert.equal(after.staleReview, true, "existing invalidation: the old review no longer matches");
  // other goals / accepted / current-version G01 drafts: never "outdated"
  assert.equal(A.isOutdatedG01Proposal(regen), false);
  assert.equal(A.isOutdatedG01Proposal({ ...old, status: "accepted" }), false);
  assert.equal(A.isOutdatedG01Proposal({ ...old, d5: { ...oldD5, selectedGoalId: "G05" } }), false);
}

// ── 4. 一-2: 「需要更多資料」 split — conditions missing (say what) vs complete but no automatic basis ──
{
  const u = "n-kind-ok";
  const { cycle } = g01Cycle(u, { reMs: 8000 });
  const a = A.resolveD5Arrangement(evaluate(u, cycle.id).proposal);
  assert.deepEqual([a.status, a.noAuto.kind], ["no_auto", "g01_no_basis"]);
  assert.ok(a.reasons[0].text.startsWith("目前不提供這個目標的下一週自動安排") && !a.reasons.some((r) => r.text.includes("系統資料不足")));
  const u2 = "n-kind-missing";
  const { cycle: c2 } = g01Cycle(u2, { reMs: 8000, reReport: { armsUsed: "no", physicalAssistance: "unknown", sameChairAsBaseline: "unknown" } });
  const b = A.resolveD5Arrangement(evaluate(u2, c2.id).proposal);
  assert.equal(b.noAuto.kind, "g01_missing_conditions");
  assert.deepEqual(b.noAuto.missing, ["再次評估：是否有人協助回報為不確定", "再次評估：是否同一張椅子回報為不確定"]);
  const missingLine = b.reasons.find((r) => r.code === "test_conditions_missing").text;
  assert.ok(missingLine.includes("補齊後只會讓前後時間差可以對照參考值，仍不會自動安排下一週"), "no unlock implied");
  // non-G01 no-auto keeps the old wording
  assert.equal(A.describeD5NoAutoKind({ decision: "no_auto_decision" }).kind, "data_insufficient");
  const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const page = app.slice(app.indexOf("function d5ProposalPage("), app.indexOf("function startD5LlmDraft("));
  assert.ok(page.includes('"目前不提供自動安排"') && page.includes("這不是因為資料不足，補填資料也不會產生自動安排。") && page.includes("補齊後仍不會自動安排下一週"));
  assert.ok(page.includes("重新確認狀況並產生建議") && page.includes("showProposed = (!noAuto || reviewed) && arrangement.status !== \"needs_review\" && !outdated"));
}

console.log("f01G01NextCycleDecision: all assertions passed");
