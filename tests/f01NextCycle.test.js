import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Phase D5 — proposal storage, confirmation, next-cycle handoff, idempotency
 * and ownership (trackingCycleService + recommendationService), plus the
 * app.js wiring guards. All dates are injected.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const { trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { createCollection } = await import("../js/data/storageService.js");

const catalog = exerciseService.listNormalized();
const cycles = createCollection("trackingCycles");
const recs = createCollection("recommendationResults");
const DAY7 = "2026-10-04", DAY8 = "2026-10-05";
const SIX_DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
const NO_CHANGE = { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] };
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function fiveXSts(userId, { status = "completed", ms = 12000, at = [2026, 8, 28, 14, 0], role = null } = {}) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  const done = status === "completed";
  const result = { status, completedReps: done ? 5 : 2, repCount: done ? 5 : 2, totalDurationMs: done ? ms : null, measuredAt: new Date(...at).toISOString(), ...(role || {}) };
  functionalAssessmentService.completeSession(s.id, { result });
  return functionalAssessmentService.getById(s.id);
}

/** Cycle 1 (baseline 09/28) -> training days -> reassessment 10/04 20:00. */
function completedCycle(userId, { goal = "G02", minutes = 15, limitations = [], baseMs = 12000, reMs = 8500, days = SIX_DAYS } = {}) {
  const baseline = fiveXSts(userId, { ms: baseMs });
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, limitationIds: limitations, availableMinutes: minutes, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: userId, result: r, createdBy: userId }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId, baselineSession: baseline, recommendation: rec }).cycle;
  cycles.update(cycle.id, { completedTrainingDates: days });
  const re = fiveXSts(userId, { ms: reMs, at: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: baseline.id } });
  const linked = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId, reassessment: re, todayDateKey: DAY7 });
  assert.equal(linked.linked, true);
  return { baseline, rec, re, cycle: trackingCycleService.getTrackingCycleById(cycle.id) };
}
const evaluate = (userId, cycleId, input = NO_CHANGE) => trackingCycleService.evaluateD5Proposal({ cycleId, userId, input, catalog });
const d5Records = (userId) => recs.query((r) => r.origin === D5_PROPOSAL_ORIGIN && r.patientId === userId);

// 1. Cycle 1 stores its limitations snapshot (D5 newLimitations baseline)
{
  const { cycle, rec } = completedCycle("n-snap", { limitations: ["L05"] });
  assert.deepEqual(cycle.limitationsSnapshot, ["L05"]);
  assert.deepEqual(rec.limitationIds, ["L05"]);
}

// 2. Same-day confirmation: progress proposal -> Cycle 2 with baseline = reassessment B
{
  const u = "n-same";
  const { cycle, rec, re } = completedCycle(u, { goal: "G05", minutes: 15 });
  assert.deepEqual(rec.items.map((it) => it.exerciseId), ["F01-17", "F01-18"], "fixture: G05, 15 min");
  const ev = evaluate(u, cycle.id);
  assert.equal(ev.created, true);
  const p = ev.proposal;
  assert.equal(p.kind, "f01_goal");
  assert.equal(p.origin, D5_PROPOSAL_ORIGIN);
  assert.equal(p.status, "draft");
  assert.equal(p.d5.changeMs, -3500);
  assert.equal(p.d5.changeClass, "faster_beyond_reference_mdc");
  assert.equal(p.d5.trainingState, "full");
  assert.equal(p.d5.decisionRuleId, "R005");
  assert.equal(p.d5.decisionRuleVersion, "D5-0-V1");
  // EX-02: Confirmed 17 -> 19 used, Pending 18 -> 20 not; one replacement, position kept.
  assert.equal(p.d5.decision, "progress");
  assert.deepEqual(p.d5.currentExerciseIds, ["F01-17", "F01-18"]);
  assert.deepEqual(p.d5.proposedExerciseIds, ["F01-19", "F01-18"]);
  assert.equal(p.d5.replacedExercise.fromExerciseId, "F01-17");
  assert.equal(p.d5.replacedExercise.transitionType, "progression");
  assert.deepEqual(p.items.map((it) => [it.rank, it.exerciseId]), [[1, "F01-19"], [2, "F01-18"]]);
  assert.equal(p.d5.requiresConfirmation, true);
  assert.equal(p.d5.confirmationMode, "user_acceptance");
  assert.equal(p.d5.nextCycleReady, true);
  assert.equal(p.d5.sourceCycleId, cycle.id);
  assert.equal(p.selectedGoalId, "G05");
  assert.ok(p.createdAt && p.d5.reason);

  // unconfirmed proposal is never "the current recommendation"
  assert.equal(recommendationService.getLatestF01GoalRecommendation(u).id, rec.id);

  // double submit / refresh -> same record
  const again = evaluate(u, cycle.id);
  assert.equal(again.created, false);
  assert.equal(again.proposal.id, p.id);
  assert.equal(d5Records(u).length, 1);

  const c1 = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: DAY7 });
  assert.equal(c1.created, true);
  const next = c1.cycle;
  assert.equal(next.baselineAssessmentId, re.id, "Cycle N+1 baseline = Cycle N reassessment");
  assert.equal(next.baselineMeasuredAt, re.result.measuredAt);
  assert.equal(next.baselineSource, "reassessment_reuse");
  assert.equal(next.cycleStartDateKey, DAY7, "Day 1 = B measured local date");
  assert.equal(next.plannedReassessmentDateKey, "2026-10-10");
  assert.equal(next.previousCycleId, cycle.id);
  assert.equal(next.selectedGoalId, "G05");
  assert.equal(next.recommendationId, p.id);
  assert.deepEqual(next.limitationsSnapshot, []);
  assert.deepEqual(next.discomfortSnapshot, { hasNewOrWorseningDiscomfort: false, discomfortNote: null });
  assert.deepEqual(next.completedTrainingDates, []);
  assert.deepEqual(next.dailyTrainingProgress, {});
  assert.equal(next.reassessmentId, null);
  assert.equal(next.cycleStatus, "training");
  assert.equal(next.userId, u);
  assert.equal(trackingCycleService.getActiveTrackingCycle(u).id, next.id);
  const accepted = recommendationService.getById(p.id);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.d5.confirmation.confirmedBy, u);
  assert.equal(accepted.d5.confirmation.handoff.baselineReuseAllowed, true);
  assert.equal(accepted.d5.nextCycleId, next.id);
  assert.equal(recommendationService.getLatestF01GoalRecommendation(u).id, p.id, "accepted proposal is the current recommendation");

  // Idempotent confirmation: same cycle, never a second one
  const c2 = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: DAY7 });
  assert.equal(c2.created, false);
  assert.equal(c2.cycle.id, next.id);
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: DAY8 }).cycle.id, next.id);
  assert.equal(cycles.query((c) => c.userId === u && c.previousCycleId === cycle.id).length, 1);
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: re }).created, false);
  // Accepted proposal is frozen
  const frozen = evaluate(u, cycle.id, { hasNewOrWorseningDiscomfort: true, discomfortNote: "x", currentLimitations: ["L01"] });
  assert.equal(frozen.frozen, true);
  assert.equal(recommendationService.getById(p.id).d5.hasNewOrWorseningDiscomfort, false);

  // Cycle 2 trains from the proposal: the D3 daily snapshot takes its exercises
  const snap = trackingCycleService.ensureDailyTrainingSnapshot({ cycleId: next.id, userId: u, dateKey: DAY7 });
  assert.deepEqual(snap.entry.requiredExerciseIds, ["F01-19", "F01-18"]);
  assert.equal(snap.entry.recommendationId, p.id);
  assert.equal(T.getTrackingCycleViewState(next, "2026-10-10").status, "ready_for_reassessment");
}

// 3. Later-day confirmation: requires a fresh baseline; invalid baseline never creates a cycle
{
  const u = "n-late";
  const { cycle, re } = completedCycle(u, { goal: "G02", minutes: 10 }); // [F01-02]
  const p = evaluate(u, cycle.id).proposal;
  const c = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: DAY8 });
  assert.equal(c.requiresFreshBaseline, true);
  assert.equal(c.created, false);
  assert.equal(c.cycle, undefined);
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null, "no cycle yet");
  const accepted = recommendationService.getById(p.id);
  assert.equal(accepted.status, "accepted");
  assert.equal(accepted.d5.confirmation.handoff.requiresFreshBaseline, true);
  assert.equal(accepted.d5.confirmation.handoff.baselineAssessmentId, null);

  // The old reassessment B can NOT be reused on a later day
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: re }).error, "baseline_reuse_not_allowed");
  // Re-confirming keeps the first (later-day) handoff
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: DAY7 }).requiresFreshBaseline, true);

  assert.equal(trackingCycleService.checkNextCycleBaselineEligibility({ proposalId: p.id, userId: u }).ok, true);
  const ctxRole = { assessmentRole: NEXT_CYCLE_BASELINE_ROLE, sourceCycleId: cycle.id, d5ProposalId: p.id };
  const incomplete = fiveXSts(u, { status: "incomplete", at: [2030, 0, 1, 9, 0], role: ctxRole });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: incomplete }).error, "baseline_not_completed");
  const invalid = fiveXSts(u, { status: "invalid", at: [2030, 0, 1, 9, 0], role: ctxRole });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: invalid }).error, "baseline_not_completed");
  const noCtx = fiveXSts(u, { at: [2030, 0, 1, 9, 0] });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: noCtx }).error, "missing_next_cycle_baseline_context");
  const early = fiveXSts(u, { at: [2020, 0, 1, 9, 0], role: ctxRole });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: early }).error, "baseline_before_confirmation");
  const foreign = fiveXSts("someone-else", { at: [2030, 0, 1, 9, 0], role: ctxRole });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: foreign }).error, "baseline_not_owned");
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null);

  // A next-cycle baseline never starts a Phase C cycle
  const fresh = fiveXSts(u, { ms: 8000, at: [2030, 0, 2, 9, 30], role: ctxRole });
  assert.equal(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: fresh, recommendation: recommendationService.getById(p.id) }).error, "next_cycle_baseline_not_phase_c");

  const made = trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: fresh });
  assert.equal(made.created, true);
  assert.equal(made.cycle.baselineAssessmentId, fresh.id);
  assert.equal(made.cycle.baselineSource, "fresh_baseline");
  assert.equal(made.cycle.cycleStartDateKey, "2030-01-02", "Day 1 = fresh baseline measured date");
  assert.equal(made.cycle.plannedReassessmentDateKey, "2030-01-08");
  assert.equal(made.cycle.previousCycleId, cycle.id);
  assert.equal(made.cycle.recommendationId, p.id);
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: fresh }).created, false, "idempotent");
  assert.equal(trackingCycleService.checkNextCycleBaselineEligibility({ proposalId: p.id, userId: u }).reason, "next_cycle_exists");
  assert.equal(cycles.query((c) => c.userId === u && c.previousCycleId === cycle.id).length, 1);
}

// 4. no_auto_decision and professional review never create a cycle
{
  const u = "n-noauto";
  const { cycle } = completedCycle(u, { baseMs: 10000, reMs: 10500, days: [] }); // within × none -> R006
  const p = evaluate(u, cycle.id).proposal;
  assert.equal(p.d5.decision, "no_auto_decision");
  assert.equal(p.d5.decisionRuleId, "R006");
  assert.equal(p.d5.nextCycleReady, false);
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: DAY7 }).error, "not_confirmable");
  assert.equal(recommendationService.getById(p.id).status, "draft");
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null);

  const u2 = "n-review";
  const c2 = completedCycle(u2).cycle;
  const p2 = evaluate(u2, c2.id, { hasNewOrWorseningDiscomfort: true, discomfortNote: "膝蓋有點痠", currentLimitations: [] }).proposal;
  assert.equal(p2.d5.decision, "adjust");
  assert.equal(p2.d5.decisionRuleId, "R011");
  assert.equal(p2.d5.confirmationMode, "professional_review_required");
  assert.equal(p2.d5.nextCycleReady, false);
  assert.equal(p2.d5.discomfortNote, "膝蓋有點痠", "note kept verbatim, never analysed");
  assert.deepEqual(p2.d5.proposedExerciseIds, p2.d5.currentExerciseIds, "no exercise changed from a free-text note");
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p2.id, userId: u2, confirmationDateKey: DAY7 }).error, "not_confirmable");

  // Changing the answer re-evaluates the SAME draft
  const p3 = evaluate(u2, c2.id, NO_CHANGE).proposal;
  assert.equal(p3.id, p2.id);
  assert.equal(p3.d5.confirmationMode, "user_acceptance");
  assert.equal(d5Records(u2).length, 1);
}

// 5. New limitation hits a current exercise -> NC-A01 replacement, then confirmable
{
  const u = "n-limit";
  const { cycle } = completedCycle(u, { goal: "G05", minutes: 20 }); // [F01-17, F01-18, F01-19]
  const p = evaluate(u, cycle.id, { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: ["L03"] }).proposal;
  assert.deepEqual(p.d5.newLimitations, ["L03"]);
  assert.equal(p.d5.decision, "adjust");
  assert.equal(p.d5.selectionRuleId, "NC-A01");
  assert.ok(!p.d5.proposedExerciseIds.includes("F01-19"));
  assert.equal(p.d5.proposedExerciseIds.length, 3, "count kept");
  assert.equal(p.items.length, 3);
  assert.equal(p.d5.nextCycleReady, true);
  const replaced = p.items.find((it) => it.exerciseId === p.d5.replacedExercise.toExerciseId);
  assert.ok(replaced.reason.includes("取代「單腳提踵」"));
}

// 6. Ownership / linkage — nothing from another user or a broken link
{
  const u = "n-own";
  const { cycle, rec } = completedCycle(u);
  assert.equal(evaluate("intruder", cycle.id).error, "not_owner");
  const p = evaluate(u, cycle.id).proposal;
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: "intruder", confirmationDateKey: DAY7 }).error, "not_owner");
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: rec.id, userId: u, confirmationDateKey: DAY7 }).error, "proposal_not_found", "a Phase C record is not a proposal");
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: null }).error, "missing_confirmation_date");

  // Tampered proposal (goal changed) -> linkage refused
  recs.update(p.id, { selectedGoalId: "G05" });
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: DAY7 }).error, "proposal_linkage_invalid");
  recs.update(p.id, { selectedGoalId: "G02", d5: { ...p.d5, currentExerciseIds: ["F01-04"] } });
  assert.equal(trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: DAY7 }).error, "proposal_linkage_invalid");
  recs.update(p.id, { d5: p.d5 });

  // Cycle recommendation of another user
  const other = completedCycle("n-own-2");
  cycles.update(other.cycle.id, { recommendationId: rec.id });
  assert.equal(evaluate("n-own-2", other.cycle.id).error, "recommendation_not_found");
  // Cycle not completed yet
  const b = fiveXSts("n-open");
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G01", catalog });
  const openRec = recommendationService.createF01GoalRecommendation({ patientId: "n-open", result: r }).recommendation;
  const open = trackingCycleService.createOrGetTrackingCycle({ userId: "n-open", baselineSession: b, recommendation: openRec }).cycle;
  assert.equal(evaluate("n-open", open.id).error, "cycle_not_completed");
  // Invented limitation refused
  assert.equal(evaluate(u, cycle.id, { hasNewOrWorseningDiscomfort: false, currentLimitations: ["L09"] }).error, "unknown_limitation");
  // Another active cycle blocks the next cycle (reported, nothing overwritten)
  const u3 = "n-busy";
  const busy = completedCycle(u3);
  const p3 = evaluate(u3, busy.cycle.id).proposal;
  const b3 = fiveXSts(u3);
  const r3 = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b3.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G01", catalog });
  const rec3 = recommendationService.createF01GoalRecommendation({ patientId: u3, result: r3 }).recommendation;
  const act = trackingCycleService.createOrGetTrackingCycle({ userId: u3, baselineSession: b3, recommendation: rec3 }).cycle;
  const res3 = trackingCycleService.confirmD5Proposal({ proposalId: p3.id, userId: u3, confirmationDateKey: DAY7 });
  assert.equal(res3.error, "another_active_cycle");
  assert.equal(res3.cycle.id, act.id);
}

// 7. Legacy cycle (no limitationsSnapshot, recommendation without limitationIds) never crashes
{
  const u = "n-legacy";
  const { cycle, rec } = completedCycle(u, { goal: "G04", minutes: 20 });
  cycles.update(cycle.id, { limitationsSnapshot: undefined });
  const { limitationIds, ...rest } = rec;
  recs.update(rec.id, { ...rest, limitationIds: undefined });
  const p = evaluate(u, cycle.id, { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: ["L01"] }).proposal;
  assert.equal(p.d5.limitationsBaselineKnown, false);
  assert.deepEqual(p.d5.newLimitations, [], "current limitations are not all treated as new");
  assert.equal(p.d5.decision, "adjust", "current exercises now filtered by L01 -> adjustment");
  assert.ok(p.d5.proposedExerciseIds.every((id) => !["F01-11", "F01-13", "F01-14", "F01-15"].includes(id)) || p.d5.nextCycleReady === false);
}

// 8. app.js wiring
{
  const fnBody = (name) => {
    const i = appJs.indexOf(`function ${name}(`);
    assert.ok(i >= 0, `${name} exists`);
    const next = appJs.indexOf("\nfunction ", i + 10);
    return appJs.slice(i, next === -1 ? undefined : next);
  };
  // D4 page links to D5 (never runs D5 itself)
  assert.ok(fnBody("trackingComparisonPage").includes("goD5StatusCheck("));
  assert.ok(!/evaluateD5Proposal|confirmD5Proposal/.test(fnBody("trackingComparisonPage")));
  // Status check -> evaluate; proposal -> confirm with the REAL local date
  assert.ok(fnBody("submitD5StatusCheck").includes("trackingCycleService.evaluateD5Proposal("));
  const confirmFn = stripComments(fnBody("confirmD5ProposalFromUi"));
  assert.ok(confirmFn.includes("trackingCycleService.confirmD5Proposal("));
  assert.ok(confirmFn.includes("toLocalDateKey(new Date())"));
  assert.ok(!confirmFn.includes("getTrackingTodayKey"), "?trackingToday= never reaches D5 data");
  // Proposal UI: no accept button unless ready + user acceptance
  const page = stripComments(fnBody("d5ProposalPage"));
  assert.ok(page.includes("confirmD5ProposalFromUi("));
  assert.ok(/nextCycleReady/.test(page) && /user_acceptance|USER_ACCEPTANCE/.test(page));
  assert.ok(page.includes("目前資料不足以建立下一階段自動調整"));
  assert.ok(page.includes("其他可確認候選"));
  assert.ok(page.includes("需要進一步確認"));
  assert.ok(!/3\.12|3120|MDC|MCID|改善|退步|療效|成功|失敗/.test(page), "no clinical wording / threshold in the proposal UI");
  const status = stripComments(fnBody("d5StatusCheckPage"));
  assert.ok(status.includes("這段期間是否有新的不適或限制？"));
  assert.ok(status.includes("F01_LIMITATIONS"), "only the existing L01-L05");
  // Next-cycle baseline context: separate role, never Phase C
  assert.ok(appJs.includes("assessmentRole: NEXT_CYCLE_BASELINE_ROLE"));
  const phaseCEntry = fnBody("startRecommendationFromFiveTimesSitToStand");
  assert.ok(phaseCEntry.includes("NEXT_CYCLE_BASELINE_ROLE"), "Phase C entry refuses a next-cycle baseline");
  const finalize = stripComments(fnBody("finalizeFa5xAssessment"));
  assert.ok(finalize.includes("trackingCycleService.createNextTrackingCycle("));
  assert.ok(/stored\.status === FA5X_RESULT_STATUS\.COMPLETED/.test(finalize), "only a completed run creates the next cycle");
  assert.ok(appJs.includes('state.route === "d5StatusCheck"') && appJs.includes('state.route === "d5Proposal"'));
}

console.log("F01 D5 next-cycle service tests passed");
