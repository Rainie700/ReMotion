import assert from "node:assert/strict";

/**
 * 5xSTS measurement-version compatibility (fa5x-assessment-1.1 follow-up):
 *   - 1.0 vs 1.1 and missing / unknown versions are never compared;
 *   - an incompatible pair is kept viewable but produces no D4 difference, no
 *     D5 automatic decision and no LLM decision envelope;
 *   - new cycles / next-cycle baselines never start from a non-current result;
 *   - stored history is never rewritten;
 *   - compatible current-version pairs compare exactly as before.
 * Synthetic records only (engineering verification, not real-person accuracy).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const C = await import("../js/data/fa5xMeasurementCompatibility.js");
const { FA5X_ALGORITHM_VERSION, FA5X_GEOMETRY_COORDINATE_SPACE } = await import("../js/ai/exercises/sitToStand/assessmentConstants.js");
const { trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { functionalProgressService } = await import("../js/data/functionalProgressService.js");
const { buildD5Envelope } = await import("../js/data/d5LlmRecommendation.js");
const { deriveNextCycleHandoff } = await import("../js/data/f01ProgressionDecision.js");
const { createCollection } = await import("../js/data/storageService.js");

const catalog = exerciseService.listNormalized();
const cyclesCol = createCollection("trackingCycles");
const sessionsCol = createCollection("functionalAssessmentSessions");
const DAY7 = "2026-10-04", DAY8 = "2026-10-05";
const SIX_DAYS = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"];
const NO_CHANGE = { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] };

const V10 = { algorithmVersion: "fa5x-assessment-1.0" }; // 1.0 never wrote a coordinate space
const V11 = { algorithmVersion: "fa5x-assessment-1.1", geometryCoordinateSpace: "isotropic_image_height_units" }; // older group since 1.2
const NONE = {};
// fa5x-assessment-1.2 (docs/verification/fa5x-gap-reset/): the CURRENT measurement is no longer 1.1;
// fixtures that mean "a current result" use the current fields, 1.1 stays as a known older group.
const CUR = C.FA5X_CURRENT_MEASUREMENT_FIELDS;

function fiveXSts(userId, measurement, { ms = 12000, at = [2026, 8, 28, 14, 0], role = null } = {}) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...measurement, status: "completed", completedReps: 5, repCount: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
  return functionalAssessmentService.getById(s.id);
}

/** Simulates a record STORED BEFORE this change (cycles of that time could start from any completed 5xSTS). */
function setStoredMeasurement(sessionId, measurement) {
  const s = sessionsCol.getById(sessionId);
  const { algorithmVersion, geometryCoordinateSpace, ...rest } = s.result;
  sessionsCol.update(sessionId, { result: { ...rest, ...measurement } });
  return functionalAssessmentService.getById(sessionId);
}

/** Cycle (baseline 09/28 12.0 s) -> six training days -> reassessment 10/04 20:00 8.5 s. */
function completedCycle(userId, baselineMeasurement, reassessmentMeasurement, { goal = "G05" } = {}) {
  let baseline = fiveXSts(userId, CUR);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, limitationIds: [], availableMinutes: 15, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: userId, result: r, createdBy: userId }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId, baselineSession: baseline, recommendation: rec }).cycle;
  assert.ok(cycle, "fixture cycle created");
  if (baselineMeasurement !== CUR) baseline = setStoredMeasurement(baseline.id, baselineMeasurement);
  cyclesCol.update(cycle.id, { completedTrainingDates: SIX_DAYS });
  const re = fiveXSts(userId, reassessmentMeasurement, { ms: 8500, at: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: baseline.id } });
  const linked = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId, reassessment: re, todayDateKey: DAY7 });
  assert.equal(linked.linked, true, "linking a reassessment never depends on the version (history is kept)");
  return { baseline, re, rec, cycle: trackingCycleService.getTrackingCycleById(cycle.id) };
}
const snapshot = (...ids) => JSON.stringify(ids.map((id) => functionalAssessmentService.getById(id)));

// ── 1. profiles and pairwise rule ────────────────────────────────────────
{
  assert.equal(FA5X_ALGORITHM_VERSION, "fa5x-assessment-1.2");
  assert.deepEqual(CUR, { algorithmVersion: "fa5x-assessment-1.2", geometryCoordinateSpace: "isotropic_image_height_units" });
  const pCur = C.getFa5xMeasurementProfile(CUR);
  assert.deepEqual([pCur.current, pCur.problem], [true, null]);
  assert.deepEqual(C.FA5X_CURRENT_MEASUREMENT_FIELDS, { algorithmVersion: FA5X_ALGORITHM_VERSION, geometryCoordinateSpace: FA5X_GEOMETRY_COORDINATE_SPACE });
  const p11 = C.getFa5xMeasurementProfile(V11);
  assert.deepEqual([p11.current, p11.problem, !!p11.group], [false, null, true], "1.1 is a known, non-current group since 1.2");
  const p10 = C.getFa5xMeasurementProfile(V10);
  assert.deepEqual([p10.current, p10.problem, !!p10.group], [false, null, true], "1.0 is a known, non-current group");
  assert.equal(C.getFa5xMeasurementProfile(NONE).problem, C.FA5X_INCOMPATIBILITY.VERSION_MISSING);
  assert.equal(C.getFa5xMeasurementProfile(null).problem, C.FA5X_INCOMPATIBILITY.VERSION_MISSING);
  assert.equal(C.getFa5xMeasurementProfile({ algorithmVersion: "fa5x-assessment-9.9" }).problem, C.FA5X_INCOMPATIBILITY.VERSION_UNKNOWN);
  assert.equal(C.getFa5xMeasurementProfile({ algorithmVersion: "t" }).problem, C.FA5X_INCOMPATIBILITY.VERSION_UNKNOWN);
  assert.equal(C.getFa5xMeasurementProfile({ algorithmVersion: "fa5x-assessment-1.1" }).problem, C.FA5X_INCOMPATIBILITY.COORDINATE_SPACE_MISMATCH, "1.1 without its coordinate space is inconsistent");
  assert.equal(C.getFa5xMeasurementProfile({ ...V10, geometryCoordinateSpace: "isotropic_image_height_units" }).problem, C.FA5X_INCOMPATIBILITY.COORDINATE_SPACE_MISMATCH);

  const check = (a, b) => C.checkFa5xMeasurementCompatibility(a, b);
  assert.deepEqual([check(V11, V11).compatible, check(V11, V11).reason], [true, null], "1.1 vs 1.1 compatible");
  assert.deepEqual([check(CUR, CUR).compatible, check(CUR, CUR).reason], [true, null], "1.2 vs 1.2 compatible");
  assert.deepEqual([check(V11, CUR).compatible, check(V11, CUR).reason], [false, C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH], "1.1 vs 1.2 never compared");
  assert.deepEqual([check(CUR, V11).compatible, check(CUR, V11).reason], [false, C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH]);
  assert.deepEqual([check(V10, CUR).compatible, check(V10, CUR).reason], [false, C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH]);
  assert.equal(C.getFa5xMeasurementProfile({ algorithmVersion: "fa5x-assessment-1.2" }).problem, C.FA5X_INCOMPATIBILITY.COORDINATE_SPACE_MISMATCH, "1.2 without its coordinate space is inconsistent");
  assert.equal(check(V10, V10).compatible, true, "1.0 vs 1.0 keeps its old comparability (same algorithm)");
  assert.deepEqual([check(V10, V11).compatible, check(V10, V11).reason], [false, C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH]);
  assert.deepEqual([check(V11, V10).compatible, check(V11, V10).reason], [false, C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH]);
  assert.deepEqual([check(NONE, V11).compatible, check(NONE, V11).reason], [false, C.FA5X_INCOMPATIBILITY.VERSION_MISSING], "missing version is never assumed compatible");
  assert.equal(check(NONE, NONE).compatible, false, "two unversioned records are not compatible either");
  assert.equal(C.isCurrentFa5xMeasurement(CUR), true);
  for (const m of [V10, V11, NONE, null]) assert.equal(C.isCurrentFa5xMeasurement(m), false);
  assert.ok(!/fa5x|version|1\.0|1\.1|1\.2/i.test(C.describeFa5xIncompatibility(C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH)), "user text has no engineering codes");
}

// ── 2. 1.0 baseline (stored before) vs 1.1 reassessment: viewable, not comparable ─
{
  const u = "cmp-10-11";
  const { baseline, re, cycle } = completedCycle(u, V10, V11);
  const before = snapshot(baseline.id, re.id);

  const { comparison } = trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: u });
  assert.equal(comparison.eligible, false);
  assert.equal(comparison.measurementCompatibility.reason, C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH);
  assert.ok(comparison.missing[0].includes("請以新版重新建立基準評估"), "prompts to re-establish a baseline with the new version");
  assert.equal(comparison.changeMs, undefined, "no difference is produced");
  assert.deepEqual([comparison.historical.baselineText, comparison.historical.reassessmentText], ["12.0 秒", "8.5 秒"], "both stored times stay viewable");

  // D5: Gate 1 -> no automatic decision; the LLM gets no decision envelope (no model call)
  const ev = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: NO_CHANGE, catalog });
  assert.ok(ev.proposal, "a proposal record is still written (status check works)");
  assert.equal(ev.proposal.d5.assessmentValid, false);
  assert.equal(ev.proposal.d5.decision, "no_auto_decision");
  assert.equal(ev.proposal.d5.changeMs, null);
  assert.equal(ev.proposal.d5.nextCycleReady, false);
  assert.equal(buildD5Envelope(ev.proposal).allowedDecisions, null, "no LLM progression basis");

  // timeline / Data page: the week is reassessed but carries no difference
  const week = functionalProgressService.getTrackingTimeline(u, DAY8).weeks.find((w) => w.cycleId === cycle.id);
  assert.equal(week.status, "reassessed");
  assert.equal(week.changeMs, null);
  assert.equal(functionalProgressService.getFunctionalProgress(u, DAY8).currentCycle.comparison, null);

  assert.equal(snapshot(baseline.id, re.id), before, "stored history is never rewritten");
  assert.equal(functionalAssessmentService.getById(baseline.id).result.algorithmVersion, "fa5x-assessment-1.0");
}

// ── 2b. 1.1 baseline (stored before 1.2) vs 1.2 reassessment: viewable, not comparable ─
{
  const u = "cmp-11-12";
  const { baseline, re, cycle } = completedCycle(u, V11, CUR);
  const before = snapshot(baseline.id, re.id);
  const { comparison } = trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: u });
  assert.equal(comparison.eligible, false);
  assert.equal(comparison.measurementCompatibility.reason, C.FA5X_INCOMPATIBILITY.VERSION_MISMATCH);
  assert.equal(comparison.changeMs, undefined, "no difference between 1.1 and 1.2");
  assert.deepEqual([comparison.historical.baselineText, comparison.historical.reassessmentText], ["12.0 秒", "8.5 秒"]);
  const ev = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: NO_CHANGE, catalog });
  assert.equal(ev.proposal.d5.decision, "no_auto_decision");
  assert.equal(buildD5Envelope(ev.proposal).allowedDecisions, null);
  assert.equal(snapshot(baseline.id, re.id), before, "stored 1.1 history is not rewritten");
  assert.equal(functionalAssessmentService.getById(baseline.id).result.algorithmVersion, "fa5x-assessment-1.1");
}

// ── 3. missing version vs 1.1: same treatment ────────────────────────────
{
  const u = "cmp-none-11";
  const { cycle } = completedCycle(u, NONE, V11);
  const { comparison } = trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: u });
  assert.equal(comparison.eligible, false);
  assert.equal(comparison.measurementCompatibility.reason, C.FA5X_INCOMPATIBILITY.VERSION_MISSING);
  const ev = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: NO_CHANGE, catalog });
  assert.equal(ev.proposal.d5.decision, "no_auto_decision");
  assert.equal(buildD5Envelope(ev.proposal).allowedDecisions, null);
}

// ── 4. compatible current vs current (1.2 vs 1.2; was 1.1 vs 1.1): compares and decides exactly as before ─
{
  const u = "cmp-11-11";
  const { cycle } = completedCycle(u, CUR, CUR);
  const { comparison } = trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: u });
  assert.equal(comparison.eligible, true);
  assert.equal(comparison.changeMs, -3500);
  assert.equal(comparison.measurementCompatibility.compatible, true);
  const ev = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: NO_CHANGE, catalog });
  assert.equal(ev.proposal.d5.assessmentValid, true);
  assert.equal(ev.proposal.d5.decisionRuleId, "R005", "same rule outcome as the existing D5 fixture (faster beyond the reference, full training)");
  assert.equal(ev.proposal.d5.decision, "progress");
  assert.deepEqual(buildD5Envelope(ev.proposal).allowedDecisions, ["progress", "maintain"]);
  const week = functionalProgressService.getTrackingTimeline(u, DAY8).weeks.find((w) => w.cycleId === cycle.id);
  assert.deepEqual([week.status, week.changeMs], ["completed", -3500]);

  // same-day confirmation reuses the (current) reassessment as the next baseline
  const c = trackingCycleService.confirmD5Proposal({ proposalId: ev.proposal.id, userId: u, confirmationDateKey: DAY7 });
  assert.equal(c.created, true);
  assert.equal(c.cycle.baselineSource, "reassessment_reuse");
}

// ── 5. new cycles never start from a non-current result ─────────────────
{
  const start = (u, measurement) => {
    const b = fiveXSts(u, measurement);
    const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G02", limitationIds: [], availableMinutes: 15, catalog });
    const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: r, createdBy: u }).recommendation;
    return { b, rec, res: trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec }) };
  };
  assert.equal(start("new-10", V10).res.error, "baseline_measurement_outdated", "1.0 result cannot start a new cycle");
  assert.equal(start("new-none", NONE).res.error, "baseline_measurement_outdated", "unversioned result cannot start a new cycle");
  assert.equal(start("new-bad", { algorithmVersion: "fa5x-assessment-1.1" }).res.error, "baseline_measurement_outdated");
  assert.equal(trackingCycleService.listTrackingCycles("new-10").length, 0);
  assert.equal(start("new-11", V11).res.error, "baseline_measurement_outdated", "a 1.1 result cannot start a new cycle since 1.2");
  const ok = start("new-12", CUR).res;
  assert.equal(ok.created, true, "current result starts a cycle");

  // an ACTIVE cycle that already uses a 1.0 baseline (stored before) is still re-linked, never duplicated
  const u = "relink-10";
  const { b, rec } = start(u, CUR);
  const legacy = setStoredMeasurement(b.id, V10);
  const relinked = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: legacy, recommendation: rec });
  assert.equal(relinked.reason, "same_baseline");
  assert.equal(trackingCycleService.listTrackingCycles(u).length, 1);
}

// ── 6. next cycle never reuses an older-version reassessment as its baseline ─
{
  // fully legacy cycle (1.0 vs 1.0, all stored before): its own comparison stays as it was
  const u = "next-10-10";
  const { re, cycle } = completedCycle(u, V10, V10);
  const before = snapshot(re.id);
  assert.equal(trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: u }).comparison.eligible, true);
  const ev = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: NO_CHANGE, catalog });
  assert.equal(ev.proposal.d5.decision, "progress");

  // pure handoff: same-day reuse is refused for a 1.0 reassessment
  const h = deriveNextCycleHandoff({ sourceCycle: cycle, reassessment: re, confirmationDateKey: DAY7 });
  assert.deepEqual([h.baselineReuseAllowed, h.requiresFreshBaseline, h.baselineAssessmentId], [false, true, null]);

  // confirmation on the same day -> fresh baseline required, nothing created from the 1.0 result
  const c = trackingCycleService.confirmD5Proposal({ proposalId: ev.proposal.id, userId: u, confirmationDateKey: DAY7 });
  assert.equal(c.requiresFreshBaseline, true);
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null);
  // forcing the old reassessment through createNextTrackingCycle is refused
  const forced = trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: ev.proposal.id, baselineSession: re });
  assert.ok(forced.error, "old reassessment cannot become the next baseline");

  const confirmedAt = recommendationService.getById(ev.proposal.id).d5.confirmation.confirmedAt;
  const later = new Date(new Date(confirmedAt).getTime() + 60000);
  const at = [later.getFullYear(), later.getMonth(), later.getDate(), later.getHours(), later.getMinutes() + 1];
  const role = { assessmentRole: NEXT_CYCLE_BASELINE_ROLE, sourceCycleId: cycle.id, d5ProposalId: ev.proposal.id };
  const staleFresh = setStoredMeasurement(fiveXSts(u, CUR, { at, role }).id, V10);
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: ev.proposal.id, baselineSession: staleFresh }).error, "baseline_measurement_outdated");
  const fresh = fiveXSts(u, CUR, { at, role });
  const made = trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: ev.proposal.id, baselineSession: fresh });
  assert.equal(made.created, true, "a fresh current-version baseline starts the next cycle");
  assert.equal(made.cycle.baselineAssessmentId, fresh.id);
  assert.equal(made.cycle.baselineSource, "fresh_baseline");
  assert.equal(snapshot(re.id), before, "the legacy reassessment is untouched");
}

console.log("5xSTS measurement compatibility tests passed");
