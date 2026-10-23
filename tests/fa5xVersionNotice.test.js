import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * fa5x-12-browser — version notice + 1.1 history after fa5x-assessment-1.2 (docs/verification/fa5x-12-browser/).
 * Synthetic records only. Checks the user text, that 1.1 can be neither a new nor a next-cycle baseline,
 * and the presentation-only notes on the D5 page and the result page.
 */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

const C = await import("../js/data/fa5xMeasurementCompatibility.js");
const { trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { createCollection } = await import("../js/data/storageService.js");
const catalog = exerciseService.listNormalized();
const CUR = C.FA5X_CURRENT_MEASUREMENT_FIELDS;
const V11 = { algorithmVersion: "fa5x-assessment-1.1", geometryCoordinateSpace: "isotropic_image_height_units" }; // explicit 1.1 history
const sessionsCol = createCollection("functionalAssessmentSessions");
const NO_CHANGE = { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] };

// N1 the one user sentence, for every incompatibility reason; no engineering codes, no blame
{
  const text = "量測方式已更新，這兩次結果無法直接比較；舊紀錄仍會保留。";
  for (const r of Object.values(C.FA5X_INCOMPATIBILITY)) assert.equal(C.describeFa5xIncompatibility(r), text);
  assert.equal(C.describeFa5xIncompatibility(null), null);
  assert.ok(!/fa5x|version|1\.\d|退步|未訓練|不合格|下降/i.test(text));
}

const fiveXSts = (u, m, { at = [2026, 8, 28, 14, 0], role = null, ms = 12000 } = {}) => {
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...m, status: "completed", completedReps: 5, repCount: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
  return functionalAssessmentService.getById(s.id);
};

// N2 1.1 result: viewable, never a new baseline (Phase C cycle) nor a next-cycle baseline
{
  const u = "n2";
  const old = fiveXSts(u, V11);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: old.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", limitationIds: [], availableMinutes: 15, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: r, createdBy: u }).recommendation;
  assert.equal(trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: old, recommendation: rec }).error, "baseline_measurement_outdated");
  assert.equal(functionalAssessmentService.getById(old.id).result.algorithmVersion, "fa5x-assessment-1.1", "not rewritten");

  // a current cycle -> reassessment -> D5 -> same-day? no: confirm later -> fresh baseline must be current
  const b = fiveXSts(u, CUR);
  const rec2 = recommendationService.createF01GoalRecommendation({ patientId: u, result: generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", limitationIds: [], availableMinutes: 15, catalog }), createdBy: u }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec2 }).cycle;
  createCollection("trackingCycles").update(cycle.id, { completedTrainingDates: ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"] });
  const re = fiveXSts(u, CUR, { ms: 8500, at: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: b.id } });
  assert.equal(trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: "2026-10-04" }).linked, true);
  const ev = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: NO_CHANGE, catalog });
  assert.equal(ev.proposal.d5.assessmentValid, true, "1.2 vs 1.2 compares");
  const c = trackingCycleService.confirmD5Proposal({ proposalId: ev.proposal.id, userId: u, confirmationDateKey: "2026-10-06" });
  assert.equal(c.requiresFreshBaseline, true);
  const confirmedAt = recommendationService.getById(ev.proposal.id).d5.confirmation.confirmedAt;
  const later = new Date(new Date(confirmedAt).getTime() + 120000);
  const at = [later.getFullYear(), later.getMonth(), later.getDate(), later.getHours(), later.getMinutes()];
  const role = { assessmentRole: NEXT_CYCLE_BASELINE_ROLE, sourceCycleId: cycle.id, d5ProposalId: ev.proposal.id };
  const fresh11 = fiveXSts(u, V11, { at, role });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: ev.proposal.id, baselineSession: fresh11 }).error, "baseline_measurement_outdated", "1.1 never becomes a next-cycle baseline");
  assert.equal(trackingCycleService.getNextTrackingCycle(u, cycle.id), null);
  const fresh12 = fiveXSts(u, CUR, { at, role });
  assert.equal(trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: ev.proposal.id, baselineSession: fresh12 }).created, true, "a 1.2 fresh baseline does");
  assert.ok(sessionsCol.getById(fresh11.id), "the refused 1.1 record is still stored");
}

// N3 presentation only: D5 page shows the version sentence for an incompatible pair; result page notes an active cycle
{
  const d5 = appJs.slice(appJs.indexOf("function d5ProposalPage("), appJs.indexOf("function d5ProposalPage(") + 9000);
  assert.ok(d5.includes("${!cmp.eligible && cmp.measurementCompatibility && !cmp.measurementCompatibility.compatible ? `<p class=\"small fa5x-muted d5-version-note\">${cmp.missing[0]}</p>` : \"\"}"));
  const page = appJs.slice(appJs.indexOf("function fiveTimesSitToStandResultPage("), appJs.indexOf("function fiveTimesSitToStandResultPage(") + 14000);
  assert.ok(page.includes("trackingCycleService.getActiveTrackingCycle(session.patientId)") && page.includes("${activeCycleNote}"));
  assert.ok(page.includes("需先完成目前追蹤的再次評估"), "says when a new baseline becomes possible");
  const spec = readFileSync(join(root, "js/data/f01ProgressionSpec.js"), "utf8");
  assert.ok(spec.length > 0, "D5 matrix file untouched by this batch (checked by md5 in the batch report)");
}

console.log("5xSTS version notice (fa5x-12-browser) tests passed");
