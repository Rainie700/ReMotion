/**
 * patient00 showcase data — a dev/admin seed for the ReMotion demo/test
 * account (patient00@gmail.com). NOT run at app startup; called explicitly
 * (dev console: remotionDev.seedPatient00ShowcaseData()).
 *
 * Everything is written through the app's REAL services (the same calls the
 * app makes when a user assesses, trains, reassesses and accepts the D5
 * proposal), so every screen derives its numbers naturally:
 *   D1 cycle, D3 training days, D4 comparison, D5 decision / proposal,
 *   Training Events (I-1 source fields), XP / level / achievements (I-2),
 *   Adventure (I-3) and Today Plan (I-4). Nothing derived is written.
 * Only ids and timestamps are made deterministic (js/utils/id.js
 * withSeedRuntime): every record id starts with SHOWCASE_ID_PREFIX, so the
 * seed is idempotent (reset + rebuild) and reset removes only this batch.
 *
 * Storage: writes go through createCollection(), i.e. localStorage + the
 * normal Firestore write-through when a user is signed in. trackingCycles is
 * an optional cloud collection (rules not deployed -> local only).
 */
import { createCollection } from "../data/storageService.js";
import { seedAnalysisRecords, seedSchedules } from "../data/seedData.js";
import { withSeedRuntime } from "../utils/id.js";
import { analysisService, ANALYSIS_RECORD_SOURCES } from "../data/analysisService.js";
import { scheduleService } from "../data/scheduleService.js";
import { relationService } from "../data/relationService.js";
import { assessmentService } from "../data/assessmentService.js";
import { exerciseService } from "../data/exerciseService.js";
import { recommendationService } from "../data/recommendationService.js";
import { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES, resolveAssessmentType } from "../data/functionalAssessmentService.js";
import { trackingCycleService, REASSESSMENT_ROLE } from "../data/trackingCycleService.js";
import { generateF01GoalRecommendation } from "../data/f01GoalRecommendation.js";
import { calculateSquatScore, buildSquatRemark } from "../ai/squatScore.js";
import { SQUAT_ANALYSIS_MODE } from "../ai/squatConstants.js";
import { calculateSitToStandScore, buildSitToStandRemark } from "../ai/exercises/sitToStand/score.js";
import { LE05_ANALYSIS_MODE } from "../ai/exercises/sitToStand/constants.js";
import { calculateDoubleCalfRaiseScore, buildDoubleCalfRaiseRemark } from "../ai/exercises/doubleCalfRaise/score.js";
import { AK05_ANALYSIS_MODE } from "../ai/exercises/doubleCalfRaise/constants.js";
import { calculateDoubleToeRaiseScore, buildDoubleToeRaiseRemark } from "../ai/exercises/doubleToeRaise/score.js";
import { AK06_ANALYSIS_MODE } from "../ai/exercises/doubleToeRaise/constants.js";
import { calculateSingleLegCalfRaiseScore, buildSingleLegCalfRaiseRemark } from "../ai/exercises/singleLegCalfRaise/score.js";
import { AK07_ANALYSIS_MODE } from "../ai/exercises/singleLegCalfRaise/constants.js";
import { calculateBalanceSeriesScore, buildBalanceSeriesRemark } from "../ai/exercises/balanceSeries/score.js";
import { F02_ANALYSIS_MODE_PREFIX } from "../ai/exercises/balanceSeries/constants.js";
import { trainingEventService } from "../data/trainingEventService.js";
import { cycleTrainingPerformanceService } from "../data/cycleTrainingPerformance.js";
import { functionalProgressService } from "../data/functionalProgressService.js";
import { f01AdventureService } from "../data/f01AdventureProgress.js";
import { gamificationEngine } from "../data/gamificationEngine.js";
import { todayPlanService } from "../data/todayPlanAggregator.js";
import {
  FA5X_ALGORITHM_VERSION, FA5X_THRESHOLD_VERSION, FA5X_TIMING_DEFINITION, FA5X_PARAMS, FA5X_RESULT_STATUS, FA5X_TARGET_REPS,
} from "../ai/exercises/sitToStand/assessmentConstants.js";
import { toLocalDateKey, getTrackingCycleViewState } from "../data/trackingCycle.js";
import { waitForCloudWrites } from "../data/storageService.js";

export const PATIENT00_EMAIL = "patient00@gmail.com";
export const SHOWCASE_ID_PREFIX = "showcase_p00_";

// Fixed demo timeline (local time). Demo "today" = 2026-09-30: Week 1 closed,
// Week 2 in progress (Day 3 / 7, two formal training days done).
export const SHOWCASE_PLAN = Object.freeze({
  demoTodayKey: "2026-09-30",
  cycle1StartDateKey: "2026-09-22",
  trainingDateKeys: ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"],
  reassessmentDateKey: "2026-09-28",
  baselineMs: 12800,
  reassessmentMs: 8900,
  // G05 加強足踝力量與控制 — Phase C gives F01-17 雙腳提踵 + F01-18 雙腳抬腳尖 at 15 min, and the
  // D5 spec has a Confirmed progression F01-17 -> F01-19, so 進階候選 is a real outcome (G01's
  // exercises have no confirmed progression: its matrix 進階候選 falls back to 維持).
  goalId: "G05",
  availableMinutes: 15,
  // Week 2 (Cycle 2 = D5 progression F01-17 -> F01-19, F01-18 kept): formal training days so far.
  cycle2TrainingDateKeys: ["2026-09-29", "2026-09-30"],
  // 復健師安排 (only with an existing active relationship): one completed history day,
  // and the current plan 09/30-10/02 (one schedule per date, as 派發課表 writes it).
  therapistHistory: { dateKey: "2026-09-27", exerciseId: "F01-04", sets: 2, repetitions: 8 },
  therapistPlanDateKeys: ["2026-09-30", "2026-10-01", "2026-10-02"],
  therapistPlanItems: [{ exerciseId: "F01-04", sets: 2, repetitions: 8 }, { exerciseId: "F02-01", sets: 1, durationSeconds: 10 }],
  therapistPlanCompleted: { dateKey: "2026-09-30", exerciseId: "F02-01" },
  // 自主練習 (self-selected, no schedule): never part of any cycle.
  selfPractice: [{ dateKey: "2026-09-28", exerciseId: "F02-02" }, { dateKey: "2026-09-29", exerciseId: "F01-01" }],
});

const COLLECTIONS = [
  { name: "trackingCycles", owner: "userId" },
  { name: "recommendationResults", owner: "patientId" },
  { name: "functionalAssessmentSessions", owner: "patientId" },
  { name: "analysisRecords", owner: "patientId", seed: seedAnalysisRecords },
  { name: "schedules", owner: "patientId", seed: seedSchedules },
  { name: "patientAssessments", owner: "patientId" },
];
const collections = Object.fromEntries(COLLECTIONS.map((c) => [c.name, createCollection(c.name, c.seed)]));
const isShowcaseId = (id) => typeof id === "string" && id.startsWith(SHOWCASE_ID_PREFIX);
const ownedBy = (c, uid) => (r) => r && (r[c.owner] === uid || r.patientId === uid);

/** Only the patient00 demo account (a signed-in patient with that email) may be seeded / reset. */
export function assertPatient00(user) {
  if (!user || !user.id) return { error: "not_signed_in" };
  if (String(user.email || user.account || "").toLowerCase() !== PATIENT00_EMAIL) return { error: "not_patient00" };
  if (user.role && user.role !== "patient") return { error: "not_patient_role" };
  return { ok: true, userId: user.id };
}

const at = (dateKey, hh, mm = 0) => {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d, hh, mm).toISOString();
};

/**
 * Read-only audit of the account's current records, split into this seed's
 * own records and the account's other records, plus the other records that
 * would conflict with the showcase history.
 *  - hard conflicts: another F01 tracking cycle (two cycles / chapters), another
 *    F01 goal plan, another therapist schedule on a showcase plan / history date.
 *  - notes: other records that stay and simply add to the history — incl.
 *    other 5xSTS runs: the Data trend only plots the tracking chain
 *    (functionalProgressService), so old test runs are kept, not cleared.
 */
export function auditPatient00Data(user) {
  const check = assertPatient00(user);
  if (check.error) return check;
  const userId = check.userId;
  const byCollection = {};
  const conflicts = [];
  const notes = [];
  for (const c of COLLECTIONS) {
    const mine = collections[c.name].query(ownedBy(c, userId));
    const showcase = mine.filter((r) => isShowcaseId(r.id));
    const other = mine.filter((r) => !isShowcaseId(r.id));
    byCollection[c.name] = { total: mine.length, showcase: showcase.length, other: other.length };
    for (const r of other) {
      if (c.name === "trackingCycles") conflicts.push({ collection: c.name, id: r.id, why: r.reassessmentId ? "another F01 tracking cycle (completed)" : "another ACTIVE F01 tracking cycle" });
      if (c.name === "recommendationResults" && r.kind === "f01_goal") conflicts.push({ collection: c.name, id: r.id, why: "another F01 goal recommendation / D5 proposal" });
      if (c.name === "schedules" && [SHOWCASE_PLAN.therapistHistory.dateKey, ...SHOWCASE_PLAN.therapistPlanDateKeys].includes(r.date)) conflicts.push({ collection: c.name, id: r.id, why: `another therapist schedule on ${r.date} (a showcase plan / history date)` });
    }
    if (other.length) {
      const dates = other.map((r) => toLocalDateKey(r.completedAt || r.createdAt || r.date || r.startedAt)).filter(Boolean).sort();
      notes.push({ collection: c.name, count: other.length, from: dates[0] || null, to: dates[dates.length - 1] || null });
    }
  }
  return { userId, byCollection, conflicts, notes };
}

/**
 * Read-only narrative audit: what every screen derives from the account's
 * records (the same services the UI calls), plus integrity checks.
 */
export function auditPatient00DemoNarrative(user, { todayKey = toLocalDateKey(new Date()) } = {}) {
  const check = assertPatient00(user);
  if (check.error) return check;
  const uid = check.userId;
  const cycles = trackingCycleService.listTrackingCycles(uid);
  const cycleIds = new Set(cycles.map((c) => c.id));
  const session = (id) => (id ? functionalAssessmentService.getById(id) : null);
  const sessionMs = (id) => { const s = session(id); return s && s.result ? s.result.totalDurationMs : null; };
  const perf = cycleTrainingPerformanceService.getByCycle(uid);
  const events = trainingEventService.listTrainingEvents(uid);
  const records = collections.analysisRecords.query(ownedBy({ owner: "patientId" }, uid));
  const bySource = {};
  for (const e of events) { const k = `${e.sourceType}/${e.sourceSubtype}`; bySource[k] = (bySource[k] || 0) + 1; }
  const relation = relationService.findAcceptedByPatientId(uid)[0] || null;
  const schedules = collections.schedules.query(ownedBy({ owner: "patientId" }, uid));
  const brief = (e) => ({ date: e.localDateKey, exerciseId: e.exerciseId, name: e.exerciseName, source: e.sourceLabel || e.sourceType, sourceSubtype: e.sourceSubtype, score: e.poseScore ?? null });
  const timeline = functionalProgressService.getTrackingTimeline(uid, todayKey);
  const adventure = f01AdventureService.getAdventure(uid, todayKey);
  const gam = gamificationEngine.getGamificationSummary(uid);
  const plan = todayPlanService.getTodayPlan(uid, { todayKey });
  // integrity
  const showcaseIds = Object.values(collections).flatMap((c) => c.list().map((r) => r.id)).filter(isShowcaseId);
  const foreign = COLLECTIONS.flatMap((c) => collections[c.name].query((r) => isShowcaseId(r.id) && !ownedBy(c, uid)(r)).map((r) => `${c.name}/${r.id}`));
  const chainIds = new Set(cycles.flatMap((c) => [c.baselineAssessmentId, c.reassessmentId]).filter(Boolean));
  const trendNodes = (timeline && timeline.trend && timeline.trend.nodes) || [];
  return {
    userId: uid,
    todayKey,
    assessments: { completed5xSts: collections.functionalAssessmentSessions.query((r) => r.patientId === uid && r.status === "completed" && resolveAssessmentType(r) === FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND).length, trackingChain: [...chainIds].map((id) => ({ id, ms: sessionMs(id) })) },
    trackingCycles: [...cycles].reverse().map((c) => ({ id: c.id, start: c.cycleStartDateKey, plannedReassessment: c.plannedReassessmentDateKey, previousCycleId: c.previousCycleId || null, baselineMs: sessionMs(c.baselineAssessmentId), reassessmentMs: sessionMs(c.reassessmentId), completedTrainingDates: c.completedTrainingDates || [], exercises: ((recommendationService.getById(c.recommendationId) || {}).items || []).map((i) => i.exerciseId), aiAverage: (perf.get(c.id) || {}).averageAiPostureScore ?? null, aiScoredEvents: (perf.get(c.id) || {}).scoredEventCount ?? 0 })),
    recommendations: { f01Goal: collections.recommendationResults.query((r) => r.patientId === uid && r.kind === "f01_goal").length, d5: cycles.map((c) => recommendationService.getF01D5ProposalForCycle(uid, c.id)).filter(Boolean).map((p) => ({ id: p.id, status: p.status, decision: p.d5 && p.d5.decision || p.decision || null, items: (p.items || []).map((i) => i.exerciseId) })) },
    analysisRecords: { total: records.length, showcase: records.filter((r) => isShowcaseId(r.id)).length, bySource },
    therapist: relation ? { relationId: relation.id, therapistId: relation.therapistId } : "NEEDS_INVITE_CODE",
    therapistCurrentPlan: schedules.filter((s) => s.date >= todayKey).sort((a, b) => a.date.localeCompare(b.date)).map((s) => ({ id: s.id, date: s.date, status: s.status, exercises: s.exercises.map((e) => `${e.exerciseId}:${e.status}`) })),
    therapistHistory: events.filter((e) => e.sourceType === "therapist" && e.countsAsCompleted).map(brief),
    selfPractice: events.filter((e) => e.sourceType === "self").map(brief),
    recentTraining: events.slice(0, 14).map(brief),
    todayPlan: { therapist: plan.therapist.items.map((i) => `${i.exerciseId}${i.completed ? "✓" : ""}`), remotion: ((plan.remotion.primary || {}).items || []).map((i) => `${i.exerciseId}${i.completed ? "✓" : ""}`), summary: plan.summary },
    trackingHistory: { weeks: (timeline.weeks || []).map((w) => ({ week: w.weekNumber, baselineMs: w.baselineMs, reassessmentMs: w.reassessmentMs, changeMs: w.changeMs, completedDays: w.completedDays })), trend: trendNodes.map((n) => (n.pending ? "?" : n.ms)) },
    showcaseEvents: events.filter((e) => isShowcaseId(e.eventId)).reduce((acc, e) => {
      const k = e.sourceSubtype === "f01_cycle" ? `f01_cycle@${cycles.findIndex((c) => c.id === e.trackingCycleId) === -1 ? "orphan" : e.trackingCycleId}` : e.sourceType;
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {}),
    // what the UI reads: the newest F01 goal plan, and the active cycle's plan (must be the same one)
    latestF01GoalRecommendationId: (recommendationService.getLatestF01GoalRecommendation(uid) || {}).id || null,
    activeCycle: (() => { const a = trackingCycleService.getActiveTrackingCycle(uid); return a ? { id: a.id, recommendationId: a.recommendationId, day: (getTrackingCycleViewState(a, todayKey) || {}).cycleDay ?? null } : null; })(),
    journey: {
      chapterLabel: adventure && adventure.chapterLabel,
      completedCount: adventure && adventure.completedCount,
      totalStages: adventure && adventure.totalStages,
      currentStage: adventure && adventure.currentStage ? adventure.currentStage.title : null,
      currentStageN: adventure && adventure.currentStage ? adventure.currentStage.n : null,
      previousChapterCompleted: adventure && adventure.previousChapter ? adventure.previousChapter.completedCount : null,
    },
    gamification: { xp: gam.xp, level: gam.level, unlockedAchievements: gam.unlockedCount, totalAchievements: gam.totalAchievements },
    checks: {
      duplicateFixedIds: showcaseIds.length - new Set(showcaseIds).size,
      foreignUserRecords: foreign.length,
      orphanTrackingCycleIds: records.filter((r) => r.trackingCycleId && !cycleIds.has(r.trackingCycleId)).length,
      oldAssessmentsInTrend: trendNodes.filter((n) => n.assessmentId && !chainIds.has(n.assessmentId)).length,
    },
  };
}

/** Removes ONLY this seed's records (id prefix + owner) for the user. */
export function resetPatient00ShowcaseData(user) {
  const check = assertPatient00(user);
  if (check.error) return check;
  const removed = {};
  for (const c of COLLECTIONS) {
    const ids = collections[c.name].query((r) => isShowcaseId(r.id) && ownedBy(c, check.userId)(r)).map((r) => r.id);
    ids.forEach((id) => collections[c.name].remove(id));
    removed[c.name] = ids.length;
  }
  return { removed };
}

// ── realistic detector summaries (scored by the detectors' own score functions) ──
function squatRecordFields(target, { depth, trunk, valgus }) {
  const flagged = Math.min(target, depth + trunk + valgus);
  const summary = {
    totalReps: target, targetReps: target, validReps: target - flagged, qualityValidReps: target - flagged,
    insufficientDepthCount: depth, trunkLeanCount: trunk, kneeValgusCount: valgus, repsWithTrackingGap: 0,
    averageMinKneeAngle: 96 - depth * 2, averageRepDuration: 2700 - (3 - Math.min(3, depth)) * 60,
  };
  const { score, quality } = calculateSquatScore({ ...summary, repRecords: [] });
  return { analysisMode: SQUAT_ANALYSIS_MODE, totalReps: target, targetReps: target, validReps: summary.validReps, score, overallScore: score, quality, remark: buildSquatRemark({ ...summary, repRecords: [] }), repRecords: [], summary };
}
function sitToStandRecordFields(target, { incomplete, trunk, fast }) {
  const flagged = Math.min(target, incomplete + trunk + fast);
  const summary = {
    totalReps: target, targetReps: target, validReps: target - flagged, qualityValidReps: target - flagged,
    incompleteStandCount: incomplete, excessiveTrunkLeanCount: trunk, kneeValgusCount: 0, asymmetryCount: 0, tooFastCount: fast, fastDescentCount: 0,
    trackingInterruptionCount: 0, repsWithTrackingGap: 0, averageMaxKneeAngle: 166 + (2 - Math.min(2, incomplete)), averageRepDuration: 2500 - trunk * 40,
    state: "seated", completed: true,
  };
  const { score, quality } = calculateSitToStandScore(summary);
  return { analysisMode: LE05_ANALYSIS_MODE, totalReps: target, targetReps: target, validReps: summary.validReps, score, overallScore: score, quality, remark: buildSitToStandRemark(summary), repRecords: [], summary };
}
function calfRaiseRecordFields(target, { lift, asym, fast }) {
  const flagged = Math.min(target, lift + asym + fast);
  const summary = { // same fields as the AK05 detector's summary (it reports no qualityValidReps)
    totalReps: target, targetReps: target, validReps: target - flagged,
    insufficientLiftCount: lift, asymmetryCount: asym, kneeBendCount: 0, trunkLeanCount: 0, tooFastCount: fast, trackingInterruptionCount: 0,
    averageMaxRiseRatio: Number((0.62 - lift * 0.02).toFixed(2)), averageRepDuration: 2300 + asym * 50, state: "down", completed: true,
  };
  const { score, quality } = calculateDoubleCalfRaiseScore(summary);
  return { analysisMode: AK05_ANALYSIS_MODE, totalReps: target, targetReps: target, validReps: summary.validReps, score, overallScore: score, quality, remark: buildDoubleCalfRaiseRemark(summary), repRecords: [], summary };
}
function toeRaiseRecordFields(target, { lift, heel, trunk, pelvis = 0, tracking = 0 }) {
  const flagged = Math.min(target, lift + heel + trunk + pelvis);
  const summary = {
    totalReps: target, targetReps: target, validReps: target - flagged,
    insufficientLiftCount: lift, asymmetryCount: 0, heelLiftCount: heel, kneeCompensationCount: 0, trunkLeanCount: trunk, pelvisShiftCount: pelvis, tooFastCount: 0, trackingInterruptionCount: tracking,
    completed: true, state: "ready",
  };
  const { score, quality } = calculateDoubleToeRaiseScore(summary);
  return { analysisMode: AK06_ANALYSIS_MODE, totalReps: target, targetReps: target, validReps: summary.validReps, score, overallScore: score, quality, remark: buildDoubleToeRaiseRemark(summary), repRecords: [], summary };
}
function singleLegCalfRaiseRecordFields(target, { lift = 0, knee = 0, fast = 0 }) {
  const flagged = Math.min(target, lift + knee + fast);
  const summary = {
    totalReps: target, targetReps: target, validReps: target - flagged, leftReps: 0, rightReps: target, supportSide: "right",
    insufficientLiftCount: lift, pelvisTiltCount: 0, trunkLeanCount: 0, kneeControlCount: knee, ankleShiftCount: 0, tooFastCount: fast, balanceLossCount: 0, trackingInterruptionCount: 0,
    completed: true,
  };
  const { score, quality } = calculateSingleLegCalfRaiseScore(summary);
  return { analysisMode: AK07_ANALYSIS_MODE, totalReps: target, targetReps: target, validReps: summary.validReps, score, overallScore: score, quality, remark: buildSingleLegCalfRaiseRemark(summary), repRecords: [], summary };
}
// F02 static balance held for the profile's 10 s: one completed hold, as persistF02 stores it.
const balanceRecordFields = (exerciseId) => (_target, { sway = 0, tilt = 0, tracking = 0 }) => {
  const summary = {
    totalReps: 1, targetReps: 1, targetSeconds: 10, heldMs: 10000, heldSeconds: 10, leftReps: 0, rightReps: 0, validReps: 1,
    stepCount: 0, largeSwayCount: sway, tiltCount: tilt, tooFastCount: 0, trackingInterruptionCount: tracking, phase: "ready", completed: true,
  };
  const { score, quality } = calculateBalanceSeriesScore(summary);
  return { analysisMode: F02_ANALYSIS_MODE_PREFIX + exerciseId.toLowerCase().replace("-", "_"), totalReps: 1, targetReps: 1, validReps: 1, score, overallScore: score, quality, remark: buildBalanceSeriesRemark(summary), repRecords: [], summary };
};
const DETECTOR_FIELDS = {
  "F01-01": squatRecordFields, "F01-04": sitToStandRecordFields, "F01-17": calfRaiseRecordFields, "F01-18": toeRaiseRecordFields,
  "F01-19": singleLegCalfRaiseRecordFields, "F02-01": balanceRecordFields("F02-01"), "F02-02": balanceRecordFields("F02-02"),
};
// Target reps exactly as each detector sets them for a plan item without its own dose.
const TARGET_REPS = {
  "F01-01": (e) => (e.sets > 0 ? e.sets : 1) * (e.reps > 0 ? e.reps : 1), // calculateSquatTargetReps
  "F01-04": (e) => (e.sets > 0 ? e.sets : 1) * (e.reps > 0 ? e.reps : 1),
  "F01-17": (e) => Math.max(1, Number(e.reps) || 10), // ak05Meta.targetReps
  "F01-18": (e) => Math.max(1, Number(e.reps) || 10), // ak06Meta.targetReps
  "F01-19": (e) => Math.max(1, Number(e.reps) || 10), // ak07Meta.targetReps
  "F01-01": (e) => (e.sets > 0 ? e.sets : 1) * (e.reps > 0 ? e.reps : 1),
};
const targetRepsFor = (exerciseId) => TARGET_REPS[exerciseId](exerciseService.getNormalizedById(exerciseId));
// A mild, uneven week — not perfect, not clinical.
const CYCLE1_QUALITY = [
  { "F01-17": { lift: 2, asym: 1, fast: 0 }, "F01-18": { lift: 1, heel: 1, trunk: 0 } },
  { "F01-17": { lift: 2, asym: 0, fast: 1 }, "F01-18": { lift: 1, heel: 0, trunk: 1 } },
  { "F01-17": { lift: 2, asym: 0, fast: 1 }, "F01-18": { lift: 1, heel: 1, trunk: 0 } },
  { "F01-17": { lift: 1, asym: 1, fast: 0 }, "F01-18": { lift: 1, heel: 0, trunk: 0 } },
  { "F01-17": { lift: 1, asym: 1, fast: 0 }, "F01-18": { lift: 0, heel: 0, trunk: 1 } },
  { "F01-17": { lift: 1, asym: 0, fast: 1 }, "F01-18": { lift: 0, heel: 1, trunk: 0 } },
];
// Week 2 so far (scored by the detectors' own functions): 09/29 F01-19 87 / F01-18 90, 09/30 88 / 91.
const CYCLE2_QUALITY = [
  { "F01-19": { knee: 1, fast: 1 }, "F01-18": { lift: 0, heel: 0, trunk: 0, pelvis: 1, tracking: 2 } },
  { "F01-19": { fast: 2 }, "F01-18": { lift: 0, heel: 0, trunk: 1, tracking: 1 } },
];
// Therapist / self-practice sessions: F01-04 84, F02-01 88, F02-02 82, F01-01 85.
const SESSION_QUALITY = {
  "F01-04": { incomplete: 0, trunk: 0, fast: 4 },
  "F02-01": { sway: 2, tracking: 1 },
  "F02-02": { sway: 2, tilt: 2 },
  "F01-01": { depth: 0, trunk: 2, valgus: 1 },
};

/** 5xSTS result exactly as finalizeFa5xAssessment() stores it (FSM result + wall-clock fields). */
function fiveXStsResult(totalDurationMs, measuredAtIso, repDurationsMs, onsetMs, role = {}) {
  let t = onsetMs;
  const reps = repDurationsMs.map((d, i) => {
    const r = { repNumber: i + 1, riseOnsetMs: t, standingMs: t + Math.round(d * 0.45), seatedMs: t + d, durationMs: d, peakHipDisplacement: 0.21, peakTrunkLeanDeg: 31.5, kneeAngleAtStandingDeg: 171.2 };
    t += d;
    return r;
  });
  const start = new Date(measuredAtIso).getTime() - totalDurationMs;
  return {
    assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND,
    mode: "assessment_5xsts",
    status: FA5X_RESULT_STATUS.COMPLETED,
    targetReps: FA5X_TARGET_REPS,
    completedReps: 5,
    repCount: 5,
    totalDurationMs,
    repDurationsMs,
    movementOnsetMs: onsetMs,
    reps,
    rejectedAttempts: [],
    trackingLossCount: 0,
    failureReason: null,
    invalidReason: null,
    elapsedMs: totalDurationMs,
    timingDefinition: FA5X_TIMING_DEFINITION,
    algorithmVersion: FA5X_ALGORITHM_VERSION,
    thresholdVersion: FA5X_THRESHOLD_VERSION,
    parameters: { ...FA5X_PARAMS },
    baseline: { hipY: 0.6124, shankLength: 0.1832, kneeAngleDeg: 92.4, trunkLeanDeg: 8.6 },
    startCueAt: new Date(start).toISOString(),
    movementOnsetAt: new Date(start + onsetMs).toISOString(),
    measuredAt: measuredAtIso,
    ...role,
  };
}

function recordFiveXSts(userId, result) {
  const created = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND });
  if (created.error) throw new Error(created.error);
  return functionalAssessmentService.completeSession(created.session.id, { result }).session;
}

/**
 * Builds the showcase history. Idempotent: this seed's previous records are
 * removed first. Other records of the account are never touched unless they
 * are listed conflicts AND `clearConflicts` is true.
 * @returns {{ ok: true, summary } | { error, conflicts? }}
 */
export function seedPatient00ShowcaseData(user, { clearConflicts = false, goalId = SHOWCASE_PLAN.goalId } = {}) {
  const check = assertPatient00(user);
  if (check.error) return check;
  const uid = check.userId;
  const audit = auditPatient00Data(user);
  if (audit.conflicts.length && !clearConflicts) return { error: "conflicts", conflicts: audit.conflicts, audit };

  const reset = resetPatient00ShowcaseData(user);
  const clearedConflicts = [];
  if (clearConflicts) {
    for (const c of audit.conflicts) {
      const record = collections[c.collection].getById(c.id); // full original payload (backup)
      collections[c.collection].remove(c.id);
      clearedConflicts.push({ ...c, record });
    }
  }

  const P = SHOWCASE_PLAN;
  // A completed training can never lie in the future: when the seed runs early on
  // the real local day, that day's planned times (all before 09:00) are scaled
  // into the part of the day that has passed — same order, same date.
  const realNow = Date.now();
  const realTodayKey = toLocalDateKey(new Date(realNow));
  const timeOn = (dateKey, hh, mm = 0) => {
    const planned = at(dateKey, hh, mm);
    if (dateKey !== realTodayKey || realNow >= Date.parse(at(dateKey, 9, 0))) return planned;
    const [y, m, d] = dateKey.split("-").map(Number);
    const start = new Date(y, m - 1, d).getTime();
    return new Date(start + Math.floor(((hh * 60 + mm) / (9 * 60)) * Math.max(0, realNow - 60000 - start))).toISOString();
  };
  // Firestore doc ids are global: tag every id with the account, so a re-registered
  // patient00 (new UID) can never overwrite another account's showcase docs.
  const tag = `${SHOWCASE_ID_PREFIX}${String(uid).replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}_`;
  let clock = at(P.cycle1StartDateKey, 9);
  const counts = {};
  const runtime = {
    // per-prefix counters: a conditional step (the needs assessment) never shifts the other ids
    nextId: (prefix) => `${tag}${prefix}_${String((counts[prefix] = (counts[prefix] || 0) + 1)).padStart(3, "0")}`,
    now: () => clock,
  };
  const catalog = exerciseService.listNormalized();
  const created = { needsAssessment: null, sessions: [], recommendations: [], cycles: [], analysisRecords: [], schedules: [] };

  const result = withSeedRuntime(runtime, () => {
    // ── 復健需求 (onboarding) — every patient who uses the app has one; it is what
    //    lands a patient on Home after login. An existing active one is kept as-is.
    if (!assessmentService.getActiveByPatientId(uid)) {
      clock = at("2026-09-15", 20, 0);
      const needs = assessmentService.createAssessment({ patientId: uid, createdBy: uid, bodyParts: ["下肢功能"], goals: ["肌力", "平衡"], abilityLevel: "beginner", preferredSessionMinutes: 15, source: "direct" });
      if (needs.error) throw new Error(needs.error);
      created.needsAssessment = needs.assessment.id;
    }

    // ── 復健師: only the account's EXISTING active relationship is used — never created here ──
    const relation = relationService.findAcceptedByPatientId(uid)[0] || null;
    const therapistId = relation ? relation.therapistId : null;

    // ── Cycle 1: baseline 12.8 s -> Phase C plan -> D1 cycle ──
    clock = at(P.cycle1StartDateKey, 9, 0);
    const baseline = recordFiveXSts(uid, fiveXStsResult(P.baselineMs, clock, [2520, 2480, 2460, 2440, 2400], 500));
    created.sessions.push(baseline.id);
    clock = at(P.cycle1StartDateKey, 9, 6);
    const phaseC = generateF01GoalRecommendation({
      assessment: { status: "completed", sessionId: baseline.id, assessmentType: resolveAssessmentType(baseline) },
      selectedGoalId: goalId, limitationIds: [], availableMinutes: P.availableMinutes, catalog,
    });
    if (phaseC.status !== "ok" || phaseC.items.length !== 2) throw new Error(`phase_c_unexpected:${phaseC.status}:${phaseC.items.length}`);
    const rec1 = recommendationService.createF01GoalRecommendation({ patientId: uid, result: phaseC, createdBy: uid });
    if (rec1.error) throw new Error(rec1.error);
    created.recommendations.push(rec1.recommendation.id);
    const c1 = trackingCycleService.createOrGetTrackingCycle({ userId: uid, baselineSession: baseline, recommendation: rec1.recommendation });
    if (c1.error || !c1.created) throw new Error(`cycle1:${c1.error || c1.reason}`);
    const cycle1 = c1.cycle;
    created.cycles.push(cycle1.id);

    // ── Cycle 1 training: Day 1-6, both required exercises every day (D3) ──
    const required = rec1.recommendation.items.map((it) => it.exerciseId);
    P.trainingDateKeys.forEach((dateKey, day) => {
      required.forEach((exerciseId, k) => {
        clock = at(dateKey, 19, k * 14 + (day % 3) * 5);
        const catalogEx = exerciseService.getNormalizedById(exerciseId);
        const record = analysisService.create({
          id: `${tag}analysis_c1_${dateKey.replaceAll("-", "")}_${exerciseId}`, patientId: uid, therapistId, scheduleId: null, // therapistId: the linked therapist, as the detectors write it (rel?.therapistId)
          exerciseId, exerciseName: catalogEx.name, completedAt: clock, capturedAt: clock, createdAt: clock,
          source: ANALYSIS_RECORD_SOURCES.SELF_PRACTICE, ...DETECTOR_FIELDS[exerciseId](targetRepsFor(exerciseId), CYCLE1_QUALITY[day][exerciseId]),
        }, { executionContext: { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: cycle1.id, recommendationId: cycle1.recommendationId, exerciseId, userId: uid } });
        const done = trackingCycleService.recordExerciseCompletion({ cycleId: cycle1.id, userId: uid, exerciseId, analysisRecord: record });
        if (done.error) throw new Error(`training:${dateKey}:${exerciseId}:${done.error}`);
        created.analysisRecords.push(record.id);
      });
    });

    // ── Day 7 reassessment 8.9 s closes Cycle 1 (D2 / D4) ──
    clock = at(P.reassessmentDateKey, 10, 0);
    const reassessment = recordFiveXSts(uid, fiveXStsResult(P.reassessmentMs, clock, [1760, 1740, 1720, 1700, 1680], 300,
      { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle1.id, baselineAssessmentId: cycle1.baselineAssessmentId }));
    created.sessions.push(reassessment.id);
    const closed = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle1.id, userId: uid, reassessment, todayDateKey: P.reassessmentDateKey });
    if (closed.error) throw new Error(`reassessment:${closed.error}`);

    // ── D5: status check (no new discomfort, no limitations) -> proposal -> same-day acceptance -> Cycle 2 ──
    clock = at(P.reassessmentDateKey, 10, 6);
    const evaluated = trackingCycleService.evaluateD5Proposal({ cycleId: cycle1.id, userId: uid, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] }, catalog });
    if (evaluated.error) throw new Error(`d5:${evaluated.error}`);
    created.recommendations.push(evaluated.proposal.id);
    clock = at(P.reassessmentDateKey, 10, 9);
    const confirmed = trackingCycleService.confirmD5Proposal({ proposalId: evaluated.proposal.id, userId: uid, confirmationDateKey: P.reassessmentDateKey });
    if (confirmed.error || !confirmed.cycle) throw new Error(`d5_confirm:${confirmed.error || "no_cycle"}`);
    created.cycles.push(confirmed.cycle.id);
    const cycle2 = confirmed.cycle;
    const required2 = ((recommendationService.getById(cycle2.recommendationId) || {}).items || []).map((it) => it.exerciseId);
    if ([...required2].sort().join(",") !== "F01-18,F01-19") throw new Error(`cycle2_plan_unexpected:${required2.join(",")}`);

    // A training record as the detector's own persist step stores it (source fields
    // are derived by analysisService from scheduleId / source / executionContext).
    const saveTraining = ({ key, dateKey, hh, mm, exerciseId, source, scheduleId = null, target, quality, executionContext = null }) => {
      clock = timeOn(dateKey, hh, mm);
      const catalogEx = exerciseService.getNormalizedById(exerciseId);
      return analysisService.create({
        id: `${tag}analysis_${key}_${dateKey.replaceAll("-", "")}_${exerciseId}`, patientId: uid, therapistId, scheduleId,
        exerciseId, exerciseName: catalogEx.name, completedAt: clock, capturedAt: clock, createdAt: clock,
        source, ...DETECTOR_FIELDS[exerciseId](target, quality),
      }, executionContext ? { executionContext } : undefined);
    };

    // ── Cycle 2 (Week 2, in progress): Day 2 09/29 + Day 3 09/30, both required exercises ──
    P.cycle2TrainingDateKeys.forEach((dateKey, day) => {
      ["F01-18", "F01-19"].forEach((exerciseId, k) => {
        const record = saveTraining({
          key: "c2", dateKey, hh: day === 0 ? 18 : 8, mm: day === 0 ? k * 15 : 20 + k * 15, exerciseId, source: ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,
          target: targetRepsFor(exerciseId), quality: CYCLE2_QUALITY[day][exerciseId],
          executionContext: { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: cycle2.id, recommendationId: cycle2.recommendationId, exerciseId, userId: uid },
        });
        const done = trackingCycleService.recordExerciseCompletion({ cycleId: cycle2.id, userId: uid, exerciseId, analysisRecord: record });
        if (done.error) throw new Error(`training2:${dateKey}:${exerciseId}:${done.error}`);
        created.analysisRecords.push(record.id);
      });
    });

    // ── 自主練習: self-selected, no schedule, no cycle ──
    P.selfPractice.forEach(({ dateKey, exerciseId }) => {
      const catalogEx = exerciseService.getNormalizedById(exerciseId);
      const target = exerciseId === "F01-01" ? TARGET_REPS["F01-01"](catalogEx) : 1;
      const record = saveTraining({ key: "self", dateKey, hh: exerciseId === "F01-01" ? 19 : 17, mm: exerciseId === "F01-01" ? 30 : 40, exerciseId, source: ANALYSIS_RECORD_SOURCES.SELF_PRACTICE, target, quality: SESSION_QUALITY[exerciseId] });
      created.analysisRecords.push(record.id);
    });

    // ── 復健師安排: completed history 09/27 + current plan 09/30-10/02 (only with the existing relationship) ──
    const scheduleItem = ({ exerciseId, sets, repetitions = null, durationSeconds = null }) => {
      const e = exerciseService.getNormalizedById(exerciseId);
      return { exerciseId, exerciseName: e.name, targetBodyPart: e.bodyPart, sets, repetitions, durationSeconds,
        instructions: "依復健師指示，動作放慢、量力而為，若不適立即停止。", status: "pending", analysisRequired: true, completedAt: null, analysisRecordId: null, rewardXp: 30, rewardStars: 1 };
    };
    const createSchedule = (dateKey, items, createdOn) => {
      clock = at(createdOn, 8);
      const id = `${tag}schedule_${dateKey.replaceAll("-", "")}`;
      scheduleService.create({ id, patientId: uid, therapistId, date: dateKey, title: `${dateKey.slice(5).replace("-", "/")} 復健課表`, status: "pending", createdAt: clock, updatedAt: clock, exercises: items.map(scheduleItem) });
      created.schedules.push(id);
      return id;
    };
    const completeScheduled = (scheduleId, dateKey, index, item, hh, mm) => {
      const record = saveTraining({ key: "th", dateKey, hh, mm, exerciseId: item.exerciseId, source: ANALYSIS_RECORD_SOURCES.ASSIGNED, scheduleId,
        target: item.durationSeconds ? 1 : item.sets * item.repetitions, quality: SESSION_QUALITY[item.exerciseId] });
      scheduleService.updateExerciseAt(scheduleId, index, { status: "completed", completedAt: clock, analysisRecordId: record.id });
      created.analysisRecords.push(record.id);
    };
    if (relation) {
      const h = P.therapistHistory;
      const historyId = createSchedule(h.dateKey, [h], "2026-09-26");
      completeScheduled(historyId, h.dateKey, 0, h, 18, 30);
      P.therapistPlanDateKeys.forEach((dateKey) => {
        const id = createSchedule(dateKey, P.therapistPlanItems, "2026-09-29");
        if (dateKey === P.therapistPlanCompleted.dateKey) {
          const index = P.therapistPlanItems.findIndex((it) => it.exerciseId === P.therapistPlanCompleted.exerciseId);
          completeScheduled(id, dateKey, index, P.therapistPlanItems[index], 8, 0);
        }
      });
    }

    return { cycle1Id: cycle1.id, cycle2Id: cycle2.id, proposalId: evaluated.proposal.id, baselineId: baseline.id, reassessmentId: reassessment.id,
      therapist: relation ? { relationId: relation.id, therapistId } : "NEEDS_INVITE_CODE" };
  });

  return { ok: true, reset: reset.removed, clearedConflicts, created, ...result };
}

/**
 * The recording checklist: every value a demo screen shows, read back through
 * the same services as the UI (auditPatient00DemoNarrative) and compared with
 * the fixed demo narrative. Pure: narrative in, rows out.
 */
export function patient00DemoChecklist(n) {
  const [w1, w2] = n.trackingCycles || [];
  const rows = [];
  const row = (screen, item, expected, actual) => rows.push({ screen, item, expected: JSON.stringify(expected), actual: JSON.stringify(actual), pass: JSON.stringify(expected) === JSON.stringify(actual) });
  row("Tracking", "週期數", 2, (n.trackingCycles || []).length);
  row("Tracking", "第 1 週 基準 → 再次評估 (ms)", [12800, 8900], w1 ? [w1.baselineMs, w1.reassessmentMs] : null);
  row("Tracking", "第 1 週 訓練日", 6, w1 ? w1.completedTrainingDates.length : null);
  row("Tracking", "第 1 週 動作", ["F01-17", "F01-18"], w1 ? w1.exercises : null);
  row("Tracking", "第 2 週 接續第 1 週", true, !!(w1 && w2 && w2.previousCycleId === w1.id));
  row("Tracking", "第 2 週 基準 (ms)", 8900, w2 ? w2.baselineMs : null);
  row("Tracking", "第 2 週 訓練日", ["2026-09-29", "2026-09-30"], w2 ? w2.completedTrainingDates : null);
  row("Today Plan", "ReMotion 建議讀到的計畫 = 第 2 週計畫", true, !!(w2 && n.activeCycle && n.activeCycle.id === w2.id && n.latestF01GoalRecommendationId === n.activeCycle.recommendationId));
  row("Today Plan", "第 2 週 動作", ["F01-19", "F01-18"], w2 ? w2.exercises : null);
  row("Tracking", "AI 姿勢分數 第 1 週 / 第 2 週", [86, 89], [w1 && w1.aiAverage, w2 && w2.aiAverage]);
  row("Tracking", "功能趨勢", [12800, 8900, "?"], n.trackingHistory.trend);
  row("Records", "正式紀錄（第 1 週 / 第 2 週 / 復健師 / 自主）", [12, 4, 2, 2],
    [w1 ? n.showcaseEvents[`f01_cycle@${w1.id}`] || 0 : 0, w2 ? n.showcaseEvents[`f01_cycle@${w2.id}`] || 0 : 0, n.showcaseEvents.therapist || 0, n.showcaseEvents.self || 0]);
  row("D5", "進階提案", { status: "accepted", decision: "progress", items: ["F01-19", "F01-18"] }, (() => { const p = (n.recommendations.d5 || [])[0]; return p ? { status: p.status, decision: p.decision, items: p.items } : null; })());
  row("Today Plan", "復健師安排", ["F01-04", "F02-01✓"], n.todayPlan.therapist);
  row("Today Plan", "ReMotion 建議", ["F01-19✓", "F01-18✓"], n.todayPlan.remotion);
  row("Therapist", "目前課表日期", ["2026-09-30", "2026-10-01", "2026-10-02"], n.therapistCurrentPlan.filter((s) => isShowcaseId(s.id)).map((s) => s.date));
  row("Therapist", "復健師關係", true, typeof n.therapist === "object");
  row("Journey", "第 2 週旅程 目前關卡", { chapterLabel: "第 2 週旅程", completedCount: 3, currentStageN: 4, previousChapterCompleted: 8 },
    { chapterLabel: n.journey.chapterLabel, completedCount: n.journey.completedCount, currentStageN: n.journey.currentStageN, previousChapterCompleted: n.journey.previousChapterCompleted });
  row("Integrity", "重複 ID / 他人資料 / 孤兒紀錄 / 舊測試混入趨勢", { duplicateFixedIds: 0, foreignUserRecords: 0, orphanTrackingCycleIds: 0, oldAssessmentsInTrend: 0 }, n.checks);
  return rows;
}

/**
 * One-click recording demo (dev console): backs up and clears the listed
 * conflicts, runs the seed, waits for every cloud write to settle (so a reload
 * cannot lose them; trackingCycles stays local where its cloud rules are not
 * deployed), then verifies every demo screen value.
 * @returns {Promise<{ ok, checklist, backup, cloudWrites, seed } | { error }>}
 */
export async function setupPatient00Demo(user, { todayKey = toLocalDateKey(new Date()) } = {}) {
  const check = assertPatient00(user);
  if (check.error) return check;
  const seed = seedPatient00ShowcaseData(user, { clearConflicts: true });
  if (!seed.ok) return seed;
  const backup = seed.clearedConflicts.map((c) => ({ collection: c.collection, id: c.id, why: c.why, record: c.record }));
  const cloud = await waitForCloudWrites();
  const cloudWrites = {
    total: cloud.total,
    localOnly: cloud.failed.filter((f) => f.name === "trackingCycles").length,
    failed: cloud.failed.filter((f) => f.name !== "trackingCycles"),
  };
  const narrative = auditPatient00DemoNarrative(user, { todayKey });
  const checklist = patient00DemoChecklist(narrative);
  return { ok: checklist.every((r) => r.pass) && cloudWrites.failed.length === 0, todayKey, checklist, backup, cloudWrites, therapist: seed.therapist, narrative };
}
