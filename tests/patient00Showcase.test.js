process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * patient00 showcase seed (js/dev/patient00Showcase.js): real services only,
 * deterministic ids, patient00-only, idempotent, reset removes only its own
 * batch; every screen value is derived by the existing engines.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const S = await import("../js/dev/patient00Showcase.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { functionalAssessmentService } = await import("../js/data/functionalAssessmentService.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { scheduleService } = await import("../js/data/scheduleService.js");
const { trainingEventService } = await import("../js/data/trainingEventService.js");
const { functionalProgressService } = await import("../js/data/functionalProgressService.js");
const { gamificationEngine: G } = await import("../js/data/gamificationEngine.js");
const { f01AdventureService } = await import("../js/data/f01AdventureProgress.js");
const { todayPlanService } = await import("../js/data/todayPlanAggregator.js");
const { getTrackingCycleViewState } = await import("../js/data/trackingCycle.js");
const { assessmentService } = await import("../js/data/assessmentService.js");
const { cycleTrainingPerformanceService, compareCycleScores } = await import("../js/data/cycleTrainingPerformance.js");

const TODAY = "2026-09-30"; // demo today: Week 1 closed, Week 2 Day 3 / 7
const P00 = { id: "uid-patient00", email: "patient00@gmail.com", role: "patient" };
const OTHER = { id: "uid-other", email: "someone@gmail.com", role: "patient" };
const NAMES = ["trackingCycles", "recommendationResults", "functionalAssessmentSessions", "analysisRecords", "schedules", "patientAssessments"];
const cols = Object.fromEntries(NAMES.map((n) => [n, createCollection(n)]));
const snapshotOf = (uid) => JSON.stringify(NAMES.map((n) => cols[n].query((r) => r.patientId === uid || r.userId === uid)));

// another account's data + a kept, non-conflicting patient00 record
analysisService.create({ id: "other-rec-1", patientId: OTHER.id, exerciseId: "F01-01", source: "self_practice", completedAt: new Date(2026, 8, 25, 9).toISOString(), totalReps: 10, targetReps: 10, summary: { totalReps: 10, targetReps: 10 } });
scheduleService.create({ id: "other-sch-1", patientId: OTHER.id, therapistId: "t1", date: TODAY, status: "pending", exercises: [{ exerciseId: "F01-04", status: "pending" }] });
scheduleService.create({ id: "p00-old-sch", patientId: P00.id, therapistId: "t1", date: "2026-09-05", status: "completed", exercises: [{ exerciseId: "F01-04", status: "completed" }] });
const otherBefore = snapshotOf(OTHER.id);
// patient00's EXISTING active therapist relationship (the seed only reuses it, never creates one)
const relations = createCollection("therapistPatientRelations");
relations.create({ id: "p00-rel", therapistId: "t-p00", patientId: P00.id, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
const relationsBefore = JSON.stringify(relations.list());

// guard: only patient00 (signed-in patient with that email)
{
  assert.equal(S.seedPatient00ShowcaseData(OTHER).error, "not_patient00");
  assert.equal(S.seedPatient00ShowcaseData({ ...P00, role: "therapist" }).error, "not_patient_role");
  assert.equal(S.seedPatient00ShowcaseData(null).error, "not_signed_in");
  assert.equal(S.resetPatient00ShowcaseData(OTHER).error, "not_patient00");
  assert.equal(S.auditPatient00Data(OTHER).error, "not_patient00");
  assert.equal(cols.trackingCycles.list().length, 0, "a refused seed writes nothing");
}

// conflicts: another active F01 cycle -> refused (nothing written) unless clearConflicts
{
  cols.trackingCycles.create({ id: "p00-real-cycle", userId: P00.id, patientId: P00.id, functionalDomain: "F01", reassessmentId: null, cycleStartDateKey: "2026-09-26" });
  const refused = S.seedPatient00ShowcaseData(P00);
  assert.equal(refused.error, "conflicts");
  assert.deepEqual(refused.conflicts.map((c) => c.id), ["p00-real-cycle"]);
  assert.equal(cols.analysisRecords.query((r) => r.id.startsWith(S.SHOWCASE_ID_PREFIX)).length, 0, "refused -> no showcase records");
  const ok = S.seedPatient00ShowcaseData(P00, { clearConflicts: true });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.clearedConflicts.map((c) => c.id), ["p00-real-cycle"], "only the listed conflict is cleared");
  assert.equal(cols.trackingCycles.getById("p00-real-cycle"), null);
}

const first = S.seedPatient00ShowcaseData(P00);
assert.equal(first.ok, true, "re-seed without conflicts");
const allIds = () => NAMES.flatMap((n) => cols[n].query((r) => r.id.startsWith(S.SHOWCASE_ID_PREFIX)).map((r) => `${n}/${r.id}`)).sort();
const idsAfterFirst = allIds();

// idempotent
{
  const again = S.seedPatient00ShowcaseData(P00);
  assert.deepEqual(allIds(), idsAfterFirst, "rerun: identical fixed ids, no duplicates");
  assert.deepEqual(again.reset, { trackingCycles: 2, recommendationResults: 2, functionalAssessmentSessions: 2, analysisRecords: 20, schedules: 4, patientAssessments: 1 });
  assert.equal(JSON.stringify(relations.list()), relationsBefore, "the relationship is never created / changed");
  assert.equal(trackingCycleService.listTrackingCycles(P00.id).filter((c) => !c.reassessmentId).length, 1, "exactly one active cycle");
  assert.ok(idsAfterFirst.every((id) => id.split("/")[1].startsWith(S.SHOWCASE_ID_PREFIX)));
}

const c1 = trackingCycleService.getTrackingCycleById(first.cycle1Id);
const c2 = trackingCycleService.getTrackingCycleById(first.cycle2Id);

// Cycle 1: baseline 12.8 s, 6 training days, reassessment 8.9 s
{
  const baseline = functionalAssessmentService.getById(c1.baselineAssessmentId);
  assert.equal(baseline.status, "completed");
  assert.deepEqual([baseline.result.status, baseline.result.completedReps, baseline.result.totalDurationMs], ["completed", 5, 12800]);
  assert.equal(baseline.result.algorithmVersion, "fa5x-assessment-1.0", "same result schema as the 5xSTS FSM");
  assert.deepEqual([c1.cycleStartDateKey, c1.plannedReassessmentDateKey, c1.selectedGoalId], ["2026-09-22", "2026-09-28", "G05"]);
  const rec1 = recommendationService.getById(c1.recommendationId);
  assert.deepEqual(rec1.items.map((i) => i.exerciseId), ["F01-17", "F01-18"], "Phase C output for G05 / 15 min");
  assert.deepEqual(c1.completedTrainingDates, ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"]);
  for (const day of c1.completedTrainingDates) assert.equal(c1.dailyTrainingProgress[day].isComplete, true);
  const re = functionalAssessmentService.getById(c1.reassessmentId);
  assert.deepEqual([re.result.totalDurationMs, re.result.assessmentRole, re.result.trackingCycleId, re.result.baselineAssessmentId], [8900, "reassessment", c1.id, c1.baselineAssessmentId]);
  assert.equal(c1.cycleStatus, "completed");
}

// D4
{
  const { comparison } = trackingCycleService.getTrackingCycleComparison({ cycleId: c1.id, userId: P00.id });
  assert.deepEqual([comparison.baselineMs, comparison.reassessmentMs, comparison.changeMs], [12800, 8900, -3900]);
  assert.equal(comparison.differenceText, "本次完成時間較初次少 3.9 秒");
}

// D5 (engine output, not written by the seed)
{
  const proposal = recommendationService.getById(first.proposalId);
  const d = proposal.d5;
  assert.deepEqual([d.changeClass, d.trainingState, d.matrixDecision, d.decision], ["faster_beyond_reference_mdc", "full", "progress", "progress"]);
  assert.deepEqual(d.proposedExerciseIds, ["F01-19", "F01-18"], "one Confirmed progression edge F01-17 -> F01-19");
  assert.equal(proposal.status, "accepted");
  assert.equal(d.confirmation.confirmationDateKey, "2026-09-28");
  const full = readFileSync(join(root, "js/dev/patient00Showcase.js"), "utf8");
  // the writing part (everything before the read-only checklist, whose EXPECTED values are compared, never written)
  const src = full.slice(0, full.indexOf("export function patient00DemoChecklist("));
  assert.ok(src.length > 1000 && src.includes("export function seedPatient00ShowcaseData("));
  assert.ok(!/decision:\s*"progress"|matrixDecision|changeClass:|XP\s*=|unlocked:\s*true|completedTrainingDates:\s*\[/.test(src), "no derived value is written by the seed");
}

// Cycle 2 linkage (same-day handoff, reassessment reused as baseline)
{
  const re = functionalAssessmentService.getById(c1.reassessmentId);
  assert.equal(c2.previousCycleId, c1.id);
  assert.equal(c2.baselineAssessmentId, c1.reassessmentId);
  assert.equal(c2.baselineSource, "reassessment_reuse");
  assert.equal(c2.baselineMeasuredAt, re.result.measuredAt);
  assert.deepEqual([c2.cycleStartDateKey, c2.plannedReassessmentDateKey, c2.selectedGoalId], ["2026-09-28", "2026-10-04", "G05"]);
  assert.equal(c2.recommendationId, first.proposalId, "the accepted D5 recommendation");
  assert.deepEqual(c2.limitationsSnapshot, []);
  assert.deepEqual([c2.completedTrainingDates, c2.reassessmentId, c2.cycleStatus], [["2026-09-29", "2026-09-30"], null, "training"]);
  const view = getTrackingCycleViewState(c2, TODAY);
  assert.deepEqual([view.status, view.cycleDay], ["training", 3], "home: 第 3 / 7 天");
}

// Training Records: 12 + 4 F01-cycle events (ReMotion 建議), 2 therapist, 2 self — all from canonical events
{
  const events = trainingEventService.listTrainingEvents(P00.id).filter((e) => e.eventId.startsWith(S.SHOWCASE_ID_PREFIX));
  const f01 = events.filter((e) => e.sourceSubtype === "f01_cycle");
  const w1 = f01.filter((e) => e.trackingCycleId === c1.id);
  const w2 = f01.filter((e) => e.trackingCycleId === c2.id);
  assert.deepEqual([f01.length, w1.length, w2.length], [16, 12, 4]);
  assert.ok(w1.every((e) => e.sourceType === "remotion" && e.sourceLabel === "ReMotion 建議" && e.recommendationId === c1.recommendationId));
  assert.ok(w2.every((e) => e.sourceType === "remotion" && e.recommendationId === c2.recommendationId));
  assert.deepEqual(w2.map((e) => `${e.localDateKey} ${e.exerciseId} ${e.poseScore}`).sort(),
    ["2026-09-29 F01-18 90", "2026-09-29 F01-19 87", "2026-09-30 F01-18 91", "2026-09-30 F01-19 88"]);
  assert.ok(events.every((e) => e.completed === true && e.isLegacy === false), "no incomplete / legacy records in the batch");
  const ther = events.filter((e) => e.sourceType === "therapist");
  assert.deepEqual(ther.map((e) => `${e.localDateKey} ${e.exerciseId} ${e.poseScore} ${e.sourceLabel}`), ["2026-09-30 F02-01 88 復健師安排", "2026-09-27 F01-04 84 復健師安排"]);
  const self = events.filter((e) => e.sourceType === "self");
  assert.deepEqual(self.map((e) => `${e.localDateKey} ${e.exerciseId} ${e.poseScore} ${e.sourceSubtype}`), ["2026-09-29 F01-01 85 self_selected", "2026-09-28 F02-02 82 self_selected"]);
  assert.ok([...ther, ...self].every((e) => !e.trackingCycleId), "therapist / self never belong to a cycle");
  const scores = w1.map((e) => e.poseScore);
  assert.ok(new Set(scores).size > 3 && Math.max(...scores) <= 93 && Math.min(...scores) >= 78, "varied, never perfect (78-93)");
  // newest first, mixed sources
  assert.deepEqual(events.slice(0, 7).map((e) => `${e.localDateKey} ${e.exerciseId} ${e.sourceType}`), [
    "2026-09-30 F01-19 remotion", "2026-09-30 F01-18 remotion", "2026-09-30 F02-01 therapist",
    "2026-09-29 F01-01 self", "2026-09-29 F01-19 remotion", "2026-09-29 F01-18 remotion", "2026-09-28 F02-02 self"]);
}

// AI 姿勢分數 across weeks: only remotion / f01_cycle / own cycle (Week 1 86, Week 2 89, +3)
{
  const perf = cycleTrainingPerformanceService.getByCycle(P00.id);
  assert.deepEqual([perf.get(c1.id).averageAiPostureScore, perf.get(c1.id).scoredEventCount], [86, 12]);
  assert.deepEqual([perf.get(c2.id).averageAiPostureScore, perf.get(c2.id).scoredEventCount], [89, 4]);
  const cmp = compareCycleScores(86, 89);
  assert.deepEqual([cmp.text, cmp.signed], ["較前一週高 3", "+3"]);
}

// 復健師安排: history 09/27 + current plan 09/30-10/02 (F01-04 + F02-01), one schedule per date
{
  const own = scheduleService.getByPatientId ? scheduleService.getByPatientId(P00.id) : cols.schedules.query((r) => r.patientId === P00.id);
  const showcase = own.filter((s) => s.id.startsWith(S.SHOWCASE_ID_PREFIX)).sort((a, b) => a.date.localeCompare(b.date));
  assert.deepEqual(showcase.map((s) => `${s.date} ${s.status} ${s.exercises.map((e) => `${e.exerciseId}:${e.status}`).join(",")}`), [
    "2026-09-27 completed F01-04:completed",
    "2026-09-30 in_progress F01-04:pending,F02-01:completed",
    "2026-10-01 pending F01-04:pending,F02-01:pending",
    "2026-10-02 pending F01-04:pending,F02-01:pending"]);
  assert.ok(showcase.every((s) => s.therapistId === "t-p00"), "the existing relationship's therapist");
  assert.equal(first.therapist.relationId, "p00-rel");
}

// Data: two 5xSTS trend points, totalDurationMs only
{
  const fp = functionalProgressService.getFunctionalProgress(P00.id, TODAY);
  assert.deepEqual(fp.assessmentSeries.map((p) => [p.dateKey, p.totalDurationMs]), [["2026-09-22", 12800], ["2026-09-28", 8900]]);
  assert.equal(fp.currentCycle.baselineMs, 8900);
}

// XP / level / achievements: derived by the I-2 engine
{
  const events = trainingEventService.listTrainingEvents(P00.id);
  const xp = G.getPatientXP(P00.id);
  assert.ok(xp > 0);
  const summary = G.getGamificationSummary(P00.id);
  const unlocked = G.getAchievements(P00.id).filter((a) => a.unlocked);
  assert.ok(unlocked.length > 0 && unlocked.length < G.getAchievements(P00.id).length, "not everything unlocked");
  assert.ok(events.every((e) => !("xp" in e.record)), "no stored XP");
  console.log(`  derived: XP ${xp}, level ${summary.level ? summary.level.level ?? summary.level : "?"}, unlocked ${unlocked.map((a) => a.id).join(", ")}`);
}

// Adventure (derived): Cycle 1 8/8; Cycle 2 with 2 formal training days -> 3/8, stage 4 current
{
  const a = f01AdventureService.getAdventure(P00.id, TODAY);
  assert.equal(a.chapterLabel, "第 2 週旅程");
  assert.equal(a.completedCount, 3);
  assert.equal(a.currentStage.n, 4);
  assert.equal(a.currentStage.title, "穩定累積");
  assert.equal(a.previousChapter.completedCount, 8, "Cycle 1 journey 8 / 8");
}

// Today plan 09/30: 復健師安排 (F01-04, F02-01 done) + ReMotion 建議 (F01-19, F01-18 done); not deduped
{
  const p = todayPlanService.getTodayPlan(P00.id, { todayKey: TODAY });
  assert.deepEqual(p.therapist.items.map((i) => `${i.exerciseId}:${i.completed}`), ["F01-04:false", "F02-01:true"]);
  assert.deepEqual(p.remotion.primary.items.map((i) => `${i.exerciseId}:${i.completed}`), ["F01-19:true", "F01-18:true"]);
  assert.equal(p.remotion.primary.cycleId, c2.id);
  assert.deepEqual([p.summary.totalAssignedCount, p.summary.completedAssignedCount], [4, 3], "self practice is not in the denominator");
}

// Narrative audit (read-only): same services as the UI, integrity checks all zero
{
  const a = S.auditPatient00DemoNarrative(P00, { todayKey: TODAY });
  assert.deepEqual(a.trackingHistory.trend, [12800, 8900, "?"], "8.9 once (再次評估／新週基準), then pending");
  assert.deepEqual(a.trackingHistory.weeks.map((w) => [w.week, w.baselineMs, w.reassessmentMs, w.changeMs, w.completedDays]), [[1, 12800, 8900, -3900, 6], [2, 8900, null, null, 2]]);
  assert.deepEqual(a.trackingCycles.map((c) => c.aiAverage), [86, 89]);
  assert.deepEqual(a.analysisRecords.bySource, { "remotion/f01_cycle": 16, "therapist/therapist_plan": 2, "self/self_selected": 2 });
  assert.deepEqual(a.checks, { duplicateFixedIds: 0, foreignUserRecords: 0, orphanTrackingCycleIds: 0, oldAssessmentsInTrend: 0 });
  assert.equal(S.auditPatient00DemoNarrative(OTHER).error, "not_patient00");
}

// One-click recording demo: a manually generated newer F01 plan + its local cycle (the real-browser
// case) are backed up (full payload) and cleared, the seed runs, every checklist row passes.
{
  cols.recommendationResults.create({ id: "p00-manual-g01", patientId: P00.id, kind: "f01_goal", status: "draft", selectedGoalId: "G01", createdAt: "2026-09-30T04:11:05.000Z", items: [{ exerciseId: "F01-04" }, { exerciseId: "F01-01" }, { exerciseId: "F01-10" }] });
  cols.trackingCycles.create({ id: "p00-manual-cycle", userId: P00.id, patientId: P00.id, functionalDomain: "F01", reassessmentId: null, cycleStartDateKey: "2026-09-28", recommendationId: "p00-manual-g01" });
  assert.equal(S.seedPatient00ShowcaseData(P00).error, "conflicts", "plain seed still refuses");
  const r = await S.setupPatient00Demo(P00, { todayKey: TODAY });
  assert.equal(r.ok, true, JSON.stringify(r.checklist && r.checklist.filter((x) => !x.pass)));
  assert.deepEqual(r.backup.map((b) => b.id).sort(), ["p00-manual-cycle", "p00-manual-g01"]);
  assert.ok(r.backup.every((b) => b.record && b.record.id === b.id), "backup keeps the full original document");
  assert.equal(cols.recommendationResults.getById("p00-manual-g01"), null);
  assert.ok(r.checklist.length >= 18 && r.checklist.every((x) => x.pass));
  assert.deepEqual(r.cloudWrites, { total: 0, localOnly: 0, failed: [] }, "no cloud user in tests");
  assert.equal(JSON.stringify(relations.list()), relationsBefore);
  assert.equal((await S.setupPatient00Demo(OTHER)).error, "not_patient00");
  // a checklist row fails loudly when a screen value is off
  const broken = S.patient00DemoChecklist({ ...r.narrative, latestF01GoalRecommendationId: "p00-manual-g01" });
  assert.equal(broken.find((x) => x.item.startsWith("ReMotion 建議讀到的計畫")).pass, false);
}

// 復健需求: created only when none is active (lands the patient on Home); an existing one is kept
{
  const active = assessmentService.getActiveByPatientId(P00.id);
  assert.ok(active && active.id.startsWith(S.SHOWCASE_ID_PREFIX) && active.createdAt < "2026-09-22", "showcase onboarding record before the F01 week");
  const U2 = { id: "uid-p00-b", email: "patient00@gmail.com", role: "patient" };
  const own = assessmentService.createAssessment({ patientId: U2.id, createdBy: U2.id, bodyParts: ["下肢功能"], goals: ["肌力"], abilityLevel: "beginner", preferredSessionMinutes: 10 }).assessment;
  const r = S.seedPatient00ShowcaseData(U2);
  assert.equal(r.created.needsAssessment, null, "existing active 復健需求 -> none created");
  assert.equal(r.therapist, "NEEDS_INVITE_CODE", "no relationship -> reported, never created");
  assert.deepEqual(r.created.schedules, [], "no therapist plan without a relationship");
  assert.equal(relations.query((x) => x.patientId === U2.id).length, 0);
  assert.equal(assessmentService.getActiveByPatientId(U2.id).id, own.id, "…and it is not superseded");
  S.resetPatient00ShowcaseData(U2);
  assert.equal(assessmentService.getActiveByPatientId(U2.id).id, own.id, "reset keeps the account's own record");
}

// reset: only this batch; other records of patient00 and other accounts untouched
{
  const r = S.resetPatient00ShowcaseData(P00);
  assert.deepEqual(r.removed, { trackingCycles: 2, recommendationResults: 2, functionalAssessmentSessions: 2, analysisRecords: 20, schedules: 4, patientAssessments: 1 });
  assert.equal(JSON.stringify(relations.list()), relationsBefore, "reset keeps the relationship");
  assert.equal(allIds().length, 0);
  assert.ok(scheduleService.getById("p00-old-sch"), "patient00's own older records are kept");
  assert.equal(snapshotOf(OTHER.id), otherBefore, "other accounts completely unaffected");
}

// app wiring: dev-only, explicit, never at startup
{
  const appJs = readFileSync(join(root, "app.js"), "utf8");
  const at = appJs.indexOf("if (import.meta.env && import.meta.env.DEV) {");
  assert.ok(at !== -1 && appJs.slice(at, at + 900).includes('import("./js/dev/patient00Showcase.js")'), "dev-only dynamic import");
  assert.equal((appJs.match(/seedPatient00ShowcaseData\(/g) || []).length, 2, "only the dev console entry calls it");
  assert.ok(!/^import .*patient00Showcase/m.test(appJs), "not statically imported (not in production bundles)");
}

console.log("patient00 showcase seed tests passed");
