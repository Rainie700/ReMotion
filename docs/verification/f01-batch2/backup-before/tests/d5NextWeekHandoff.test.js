process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { FA5X_CURRENT_MEASUREMENT_FIELDS as FA5X_M } from "../js/data/fa5xMeasurementCompatibility.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 下一階段建議 -> 下一週實際訓練. What each D5 outcome really changes, how the
 * proposal page and the recommendation page say it, and that viewing never
 * creates or switches a cycle while accepting twice never duplicates one.
 * Isolated in-memory data through the real services; pages lifted from app.js.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const D = await import("../js/data/f01ProgressionDecision.js");
const W = await import("../js/ui/d5ProposalView.js");
const RV = await import("../js/ui/f01RecommendationView.js");
const T = await import("../js/data/trackingCycle.js");
const { describeTimeDifference } = await import("../js/data/trackingComparison.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation, F01_LIMITATIONS, MATCH_LEVEL } = await import("../js/data/f01GoalRecommendation.js");
const { F01_GOALS } = await import("../js/data/f01RecommendationSpec.js");
const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
const { todayPlanService } = await import("../js/data/todayPlanAggregator.js");
const { getD5Arrangement } = await import("../js/data/d5TherapistReviewService.js");
const { relationService } = await import("../js/data/relationService.js");

const catalog = exerciseService.listNormalized();
const volumeOf = (id) => RV.describeTrainingVolume(exerciseService.getById(id));
const nameOf = (id) => (exerciseService.getNormalizedById(id) || {}).name || id;
const FORBIDDEN = /3\.1|3120|MDC|MCID|改善|退步|療效|成功|失敗/;

// ── 1. What each outcome really changes (pure, real rules) ──
const days = (n) => ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"].slice(0, n);
function proposal(goal, minutes, changeMs, trainingDays, limitations = []) {
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: "b", assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, availableMinutes: minutes, catalog });
  const cycle = { id: "c", userId: "u", baselineAssessmentId: "b", reassessmentId: "r", selectedGoalId: goal, cycleStartDateKey: "2026-09-22", plannedReassessmentDateKey: "2026-09-28", completedTrainingDates: days(trainingDays), limitationsSnapshot: [] };
  return D.buildD5Proposal({ sourceCycle: cycle, sourceRecommendation: { id: "rec", items: r.items, limitationIds: [], selectedGoalId: goal }, comparison: { eligible: true, changeMs }, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: limitations }, catalog });
}
{
  // progress with a confirmed link: exactly one exercise, same position
  const d5 = proposal("G05", 15, -3900, 6);
  assert.deepEqual([d5.decisionRuleId, d5.decision, d5.selectionRuleId], ["R005", "progress", "NC-P01"]);
  const cmp = W.compareD5Weeks(d5, { nameOf, volumeOf });
  assert.deepEqual(cmp.rows.map((r) => [r.before.exerciseId, r.after.exerciseId, r.change]), [["F01-17", "F01-19", "replaced"], ["F01-18", "F01-18", "kept"]]);
  assert.equal(cmp.rows[0].note, "已確認的進階動作");
  assert.equal(cmp.rows[0].after.volume, volumeOf("F01-19"), "next week's amount = the new exercise's catalog default");
  assert.equal(W.describeD5ContentChange(d5, cmp), "進階：只把「雙腳提踵」換成「單腳提踵」（已確認的進階動作），其餘 1 個動作保留。");
  const why = W.explainD5Decision(d5);
  assert.deepEqual(why, [
    `${describeTimeDifference(-3900)}，差異超出系統採用的參考範圍。`,
    "上一週完成 6 / 6 個設定訓練日（全部設定訓練日完成）。",
    "規則判定：進階（R005）。",
  ]);
  assert.equal(W.describeD5Item(d5, "F01-19"), "取代上一週的「雙腳提踵」（已確認的進階動作）");
  assert.equal(W.describeD5Item(d5, "F01-18"), "沿用上一週的動作");
}
{
  // progress candidate but no confirmed link: label vs content made explicit
  const d5 = proposal("G01", 15, -3900, 6);
  assert.deepEqual([d5.matrixDecision, d5.decision, d5.selectionFallback], ["progress", "maintain", "no_confirmed_progression"]);
  const cmp = W.compareD5Weeks(d5, { nameOf, volumeOf });
  assert.equal(cmp.contentChanged, false);
  assert.match(W.describeD5ContentChange(d5, cmp), /沒有已確認的進階動作，所以下一週的動作與上一週相同/);
  assert.ok(W.explainD5Decision(d5).includes("規則判定：進階（R005）；實際下一週：維持。"));
}
{
  // adjust without a conflict (R010 / NC-A02): only the status differs
  const d5 = proposal("G05", 15, 3900, 3);
  assert.deepEqual([d5.decisionRuleId, d5.decision, d5.selectionRuleId], ["R010", "adjust", "NC-A02"]);
  const cmp = W.compareD5Weeks(d5, { nameOf, volumeOf });
  assert.equal(cmp.contentChanged, false);
  assert.match(W.describeD5ContentChange(d5, cmp), /系統不會自動更換動作，下一週的動作與上一週相同/);
  assert.ok(W.explainD5Decision(d5)[1].includes("（部分訓練日完成）"));
}
{
  // maintain
  const d5 = proposal("G05", 15, -100, 6);
  assert.equal(d5.decisionRuleId, "R008");
  assert.equal(W.describeD5ContentChange(d5, W.compareD5Weeks(d5)), "維持：下一週的動作與上一週相同。");
  assert.match(W.explainD5Decision(d5)[0], /差異在系統採用的參考範圍內，視為沒有明確變化/);
}
{
  // adjust with a new limitation that excludes a current exercise (NC-A01): one exercise replaced
  const d5 = proposal("G05", 20, -3900, 6, ["L03"]);
  assert.deepEqual([d5.decisionRuleId, d5.selectionRuleId], ["R011", "NC-A01"]);
  const cmp = W.compareD5Weeks(d5, { nameOf, volumeOf });
  assert.deepEqual(cmp.rows.map((r) => r.change), ["kept", "kept", "replaced"]);
  assert.match(W.describeD5ContentChange(d5, cmp), /^調整：「單腳提踵」與你目前勾選的情況不符，改為「/);
  const why = W.explainD5Decision(d5);
  assert.ok(why.includes(`這次新增的情況：${F01_LIMITATIONS.find((l) => l.id === "L03").label}。`) && why.includes("有新的不適或情況時，規則不會進階。"));
}
{
  // invalid comparison
  const d5 = proposal("G05", 15, -3900, 6);
  const invalid = { ...d5, assessmentValid: false, changeMs: null };
  assert.equal(W.explainD5Decision(invalid)[0], "前後兩次五次坐站無法比較，所以不自動判定。");
}
assert.equal(W.D5_DOSAGE_NOTE, "目前沒有依個人狀況調整訓練量；更換動作時採用新動作的預設量，組次可能因此不同。");
for (const args of [["G05", 15, -3900, 6], ["G01", 15, -3900, 6], ["G05", 15, 3900, 3], ["G05", 20, -3900, 6, ["L03"]]]) {
  const d5 = proposal(...args);
  const text = [W.describeD5ContentChange(d5, W.compareD5Weeks(d5)), ...W.explainD5Decision(d5), W.D5_DOSAGE_NOTE].join("");
  assert.ok(!FORBIDDEN.test(text), `no threshold / clinical wording: ${args}`);
}

// ── 2. Service flow + pages ──
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => { const s = appJs.indexOf(`const ${name} =`); assert.ok(s >= 0, name); return appJs.slice(s, appJs.indexOf(";\n", s) + 1); };
const state = {};
let currentUser = null;
const DEMOL = await import("../js/ui/demoSyntheticLabel.js");
const deps = {
  ...DEMOL,
  state, getCurrentPatientId: () => currentUser, trackingCycleService, functionalAssessmentService, recommendationService, exerciseService,
  F01_GOALS, F01_LIMITATIONS, MATCH_LEVEL, D5_PROPOSAL_ORIGIN, D5_DECISION: D.D5_DECISION, CONFIRMATION_MODE: D.CONFIRMATION_MODE, TRANSITION_TYPE: D.TRANSITION_TYPE,
  describeTimeDifference, formatDateKeyMonthDay: T.formatDateKeyMonthDay, measuredDateKeyOf: D.measuredDateKeyOf, toLocalDateKey: T.toLocalDateKey,
  EXERCISE_ASSET_AUDIT, resolveExerciseMedia, renderExerciseCardImage: (ex) => `<img alt="${ex.name}">`, ...RV, ...W, getD5Arrangement, relationService,
};
const pages = new Function(...Object.keys(deps), [
  constSource("D5_ERROR_TEXT"), constSource("D5_ARRANGEMENT_STATUS_TEXT"), constSource("d5ErrorText"), constSource("d5ExerciseName"), constSource("D5_STATUS_TITLE"), constSource("D5_TRANSITION_TEXT"),
  fnSource("escapeD5Text"), fnSource("d5ProposalPresentation"), fnSource("d5ProposalPage"), fnSource("renderInviteCodeCard"),
  constSource("F01_MATCH_LEVEL_TEXT"), constSource("F01_DEMO_IMAGE_PENDING"), fnSource("renderF01RecommendationImage"), fnSource("f01RecommendationResultPage"),
  "return { d5ProposalPage, f01RecommendationResultPage };",
].join("\n"))(...Object.values(deps));
const reset = (patch) => { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, { f01RecEmpty: null, f01RecCycleNotice: null, f01RecResultOrigin: "setup" }, patch); };
const showProposal = (id) => { reset({ d5ProposalId: id }); return pages.d5ProposalPage(); };
const showPlan = (id) => { reset(id ? { f01RecommendationId: id } : {}); return pages.f01RecommendationResultPage(); };
const snapshot = () => JSON.stringify([createCollection("trackingCycles").list(), createCollection("recommendationResults").list()]);

function completedCycle(user) {
  const mk = (ms, at, role = null) => {
    const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
    return functionalAssessmentService.getById(s.id);
  };
  const b = mk(12000, [2026, 8, 28, 9, 0]);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: user, result: r, createdBy: user }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: b, recommendation: rec }).cycle;
  const re = mk(8500, [2026, 9, 4, 20, 0], { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: b.id });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: user, reassessment: re, todayDateKey: "2026-10-04" });
  return { cycle, rec };
}
const input = { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] };

// A. accepted on a later day: fresh baseline needed, no cycle, no training entry yet
{
  currentUser = "user-later";
  const { cycle, rec: lastWeekPlan } = completedCycle(currentUser);
  const p1 = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: currentUser, input, catalog }).proposal;
  const p2 = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: currentUser, input, catalog }).proposal;
  assert.equal(p1.id, p2.id, "re-evaluating keeps one proposal per source cycle");

  // viewing the draft proposal and the plan page writes nothing
  const before = snapshot();
  const html = showProposal(p1.id);
  assert.ok(html.includes("上一週 → 下一週") && html.includes("判定依據"));
  assert.ok(html.includes(W.describeD5ContentChange(p1.d5, W.compareD5Weeks(p1.d5))), "content-change sentence");
  for (const id of p1.d5.proposedExerciseIds) if (volumeOf(id)) assert.ok(html.includes(volumeOf(id)), `amount shown for ${id}`);
  assert.ok(html.includes(W.D5_DOSAGE_NOTE));
  for (const l of W.explainD5Decision(p1.d5)) assert.ok(html.includes(`<li>${l}</li>`));
  assert.ok(!FORBIDDEN.test(html.replace(/<[^>]+>/g, "")), "rendered proposal: no threshold / clinical wording");
  const draftPlan = showPlan(p1.id);
  assert.notEqual(state.f01RecommendationId, p1.id, "a draft proposal is never shown as a trainable plan");
  assert.equal(state.f01RecommendationId, lastWeekPlan.id, "the draft is skipped; last week's real plan is shown instead");
  assert.ok(!draftPlan.includes("下一階段建議）"), "not presented as a next-stage plan");
  assert.equal(snapshot(), before, "viewing creates / switches nothing");

  const c1 = trackingCycleService.confirmD5Proposal({ proposalId: p1.id, userId: currentUser, confirmationDateKey: "2026-10-06" });
  assert.equal(c1.requiresFreshBaseline, true);
  const c2 = trackingCycleService.confirmD5Proposal({ proposalId: p1.id, userId: currentUser, confirmationDateKey: "2026-10-06" });
  assert.equal(c2.alreadyConfirmed, true);
  assert.equal(trackingCycleService.getNextTrackingCycle(currentUser, cycle.id), null, "no cycle before the new baseline");

  const planHtml = showPlan(p1.id);
  assert.equal(state.f01RecommendationId, p1.id);
  assert.ok(planHtml.includes("下一週還沒開始") && planHtml.includes(`goNextCycleBaselineAssessment('${p1.id}')`));
  assert.ok(!planHtml.includes("startF01RecommendedTraining("), "no 開始訓練 before the next week exists");
  assert.ok(planHtml.includes("沿用上一週的動作") && planHtml.includes("上一週首次推薦時的理由："), "next-stage reasons, not the first plan's");
  const afterView = snapshot();
  showProposal(p1.id);
  assert.equal(snapshot(), afterView);
  assert.equal(trackingCycleService.getActiveTrackingCycle(currentUser), null, "no active cycle until the baseline");
}

// B. accepted the same day: next cycle created once, pointing at the proposal; training opens on that plan
{
  currentUser = "user-sameday";
  const { cycle } = completedCycle(currentUser);
  const p = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: currentUser, input, catalog }).proposal;
  const first = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: currentUser, confirmationDateKey: "2026-10-04" });
  assert.equal(first.created, true);
  const again = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: currentUser, confirmationDateKey: "2026-10-04" });
  assert.equal(again.cycle.id, first.cycle.id, "accepting twice never duplicates the cycle");
  assert.equal(createCollection("trackingCycles").query((c) => c.previousCycleId === cycle.id).length, 1);
  const next = trackingCycleService.getActiveTrackingCycle(currentUser);
  assert.equal(next.id, first.cycle.id);
  assert.equal(next.recommendationId, p.id, "next week's cycle trains the accepted proposal");
  const html = showPlan(next.recommendationId); // 查看本週訓練 -> goTrackingWeekTraining -> the cycle's plan
  for (const id of p.d5.proposedExerciseIds) assert.ok(html.includes(`startF01RecommendedTraining('${id}')`), `start ${id}`);
  for (const id of p.d5.currentExerciseIds.filter((x) => !p.d5.proposedExerciseIds.includes(x))) assert.ok(!html.includes(`startF01RecommendedTraining('${id}')`), "a replaced exercise has no start entry");
  assert.ok(!html.includes("下一週還沒開始"));
  const plan = todayPlanService.getTodayPlan(currentUser, { todayKey: "2026-10-05" });
  assert.ok(JSON.stringify(plan.remotion).includes(p.id), "今日計畫 uses the same accepted plan");
  const doneHtml = showProposal(p.id);
  assert.ok(doneHtml.includes("已建立下一個 7 日追蹤") && doneHtml.includes(`goTrackingWeekTraining('${next.id}')`));
}

console.log("d5NextWeekHandoff: all assertions passed");
