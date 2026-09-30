import { scheduleService } from "./scheduleService.js";
import { recommendationService } from "./recommendationService.js";
import { trackingCycleService } from "./trackingCycleService.js";
import { trainingEventService } from "./trainingEventService.js";
import { TRAINING_SOURCE_LABEL } from "./trainingSource.js";
import {
  toLocalDateKey,
  isDateKey,
  isTrainingDateInCycle,
  getDailyProgressView,
  getPlannedReassessmentDateKey,
} from "./trackingCycle.js";

/*
 * Cross-Module Integration I-4 — Today Plan Aggregator.
 *
 * One deterministic view of "what is planned for a day", read from the stores
 * that already own each plan (nothing new is persisted here):
 *   1. 復健師安排  — the therapist schedule for that date (scheduleService);
 *                    item done = the schedule exercise's own status.
 *   2. ReMotion 建議 — primary: the ACTIVE F01 cycle's saved recommendation on
 *                    its training days (Day 1-6); item done = that day's
 *                    dailyTrainingProgress (D3). Without an F01 plan, the
 *                    older ReMotion daily recommendation is primary (real
 *                    today only); with one, the older plan is "additional".
 *                    Older-plan item done = a completed record explicitly
 *                    linked to that recommendation (I-1 source fields).
 *   3. 自主練習    — always available, never counted as an assigned task.
 *
 * Plans are shown in that order and are NEVER merged or de-duplicated: the
 * same exerciseId in two plans is two tasks, each completed by its own
 * linkage. `summary` counts therapist + primary ReMotion items only.
 * Starting a task is allowed only on the REAL local today (a past / future
 * date is read-only; F01 snapshots are keyed on the real date, D3).
 */

export const TODAY_PLAN_REMOTION_KIND = Object.freeze({
  F01_CYCLE: "f01_cycle",
  LEGACY: "legacy_remotion_recommendation",
});

export const TODAY_PLAN_NOTICE = Object.freeze({
  REASSESSMENT_DUE: "reassessment_due", // active cycle past its training days: 再次評估, no training tasks
  NEXT_CYCLE_PENDING: "next_cycle_pending", // cycle done, next week not confirmed yet: no phantom tasks
});

const uniqueIds = (ids) => [...new Set((ids || []).filter(Boolean))];

function therapistPlan(schedule, { dateKey, canStart }) {
  const exercises = schedule && Array.isArray(schedule.exercises) ? schedule.exercises : [];
  if (!exercises.length) return { scheduleId: schedule ? schedule.id : null, items: [] };
  return {
    scheduleId: schedule.id,
    title: schedule.title || null,
    items: exercises.map((ex, index) => ({
      key: `therapist:${schedule.id}:${index}`,
      sourceType: "therapist",
      sourceSubtype: "therapist_plan",
      sourceLabel: TRAINING_SOURCE_LABEL.therapist,
      scheduleId: schedule.id,
      index,
      exerciseId: ex.exerciseId || null,
      exerciseName: ex.exerciseName || null,
      status: ex.status || "pending",
      completed: ex.status === "completed",
      canStart: canStart && ex.status !== "completed",
      dateKey,
    })),
  };
}

function f01Plan(cycle, recommendation, { dateKey, canStart }) {
  const currentIds = uniqueIds((recommendation.items || []).map((it) => it.exerciseId));
  const view = getDailyProgressView(cycle, dateKey, currentIds);
  const itemById = new Map((recommendation.items || []).map((it) => [it.exerciseId, it]));
  return {
    kind: TODAY_PLAN_REMOTION_KIND.F01_CYCLE,
    cycleId: cycle.id,
    recommendationId: recommendation.id,
    snapshotted: view.snapshotted,
    items: view.requiredExerciseIds.map((exerciseId) => {
      const completed = view.completedExerciseIds.includes(exerciseId);
      return {
        key: `f01:${cycle.id}:${dateKey}:${exerciseId}`,
        sourceType: "remotion",
        sourceSubtype: "f01_cycle",
        sourceLabel: TRAINING_SOURCE_LABEL.remotion,
        cycleId: cycle.id,
        recommendationId: recommendation.id,
        exerciseId,
        recommendationItem: itemById.get(exerciseId) || null,
        completed,
        canStart: canStart && !completed,
        dateKey,
      };
    }),
  };
}

/**
 * Exercise ids of the older ReMotion daily plan done on `dateKey`: a completed
 * record explicitly linked to THIS recommendation (I-1 source fields). Records
 * written before I-1 carry no source fields; for those only, the previous
 * rule is kept (a same-day self-practice record of that exercise) so nothing
 * shown as done before is re-opened. A therapist / F01 / other-plan record
 * never completes this plan.
 */
export function legacyRecommendationDoneIds(recommendation, events, dateKey) {
  if (!recommendation) return new Set();
  const ids = new Set((recommendation.items || []).map((it) => it.exerciseId));
  return new Set(
    (events || [])
      .filter((e) => ids.has(e.exerciseId) && e.localDateKey === dateKey && (
        (e.completed === true && e.sourceSubtype === TODAY_PLAN_REMOTION_KIND.LEGACY && e.recommendationId === recommendation.id)
        || (e.isLegacy && e.sourceType === "self")
      ))
      .map((e) => e.exerciseId),
  );
}

function legacyPlan(recommendation, events, { dateKey, canStart }) {
  const ids = uniqueIds((recommendation.items || []).map((it) => it.exerciseId));
  const doneIds = legacyRecommendationDoneIds(recommendation, events, dateKey);
  const itemById = new Map((recommendation.items || []).map((it) => [it.exerciseId, it]));
  return {
    kind: TODAY_PLAN_REMOTION_KIND.LEGACY,
    recommendationId: recommendation.id,
    items: ids.map((exerciseId) => ({
      key: `legacy:${recommendation.id}:${exerciseId}`,
      sourceType: "remotion",
      sourceSubtype: TODAY_PLAN_REMOTION_KIND.LEGACY,
      sourceLabel: TRAINING_SOURCE_LABEL.remotion,
      recommendationId: recommendation.id,
      exerciseId,
      recommendationItem: itemById.get(exerciseId) || null,
      completed: doneIds.has(exerciseId),
      canStart: canStart && !doneIds.has(exerciseId),
      dateKey,
    })),
  };
}

/**
 * Pure aggregation. Inputs are already-loaded store rows; ownership is checked
 * here so a foreign row can never leak into a patient's plan.
 * @param {object} input
 * @param {string} input.patientId
 * @param {string} input.todayKey   REAL local today (never ?trackingToday=)
 * @param {string} [input.dateKey]  selected local date (defaults to todayKey)
 * @param {object|null} input.schedule            therapist schedule for dateKey
 * @param {object|null} input.activeCycle         active F01 cycle (no reassessment yet)
 * @param {object|null} input.cycleRecommendation that cycle's saved f01_goal recommendation
 * @param {object|null} input.latestCycle         newest F01 cycle (for the notices only)
 * @param {object|null} input.nextCycleOfLatest   the cycle continuing latestCycle, if any
 * @param {object|null} input.legacyRecommendation older ReMotion daily plan for the real today
 * @param {Array} input.events canonical training events of the patient
 */
export function buildTodayPlan({
  patientId,
  todayKey,
  dateKey = null,
  schedule = null,
  activeCycle = null,
  cycleRecommendation = null,
  latestCycle = null,
  nextCycleOfLatest = null,
  legacyRecommendation = null,
  events = [],
} = {}) {
  const day = isDateKey(dateKey) ? dateKey : todayKey;
  const isToday = day === todayKey;
  const canStart = !!patientId && isToday;
  const owned = (row, key = "patientId") => !!row && row[key] === patientId;

  const therapist = therapistPlan(owned(schedule) && schedule.date === day ? schedule : null, { dateKey: day, canStart });

  let f01 = null;
  let notice = null;
  const cycle = owned(activeCycle, "userId") && !activeCycle.reassessmentId ? activeCycle : null;
  if (cycle) {
    const rec = cycleRecommendation;
    const recOk = !!rec && rec.id === cycle.recommendationId && rec.patientId === patientId && rec.kind === "f01_goal";
    if (recOk && isTrainingDateInCycle(cycle, day)) {
      f01 = f01Plan(cycle, rec, { dateKey: day, canStart });
      if (!f01.items.length) f01 = null;
    } else if (isToday && day >= (cycle.plannedReassessmentDateKey || getPlannedReassessmentDateKey(cycle.cycleStartDateKey))) {
      notice = { code: TODAY_PLAN_NOTICE.REASSESSMENT_DUE, cycleId: cycle.id };
    }
  } else if (isToday && owned(latestCycle, "userId") && latestCycle.reassessmentId && !nextCycleOfLatest) {
    notice = { code: TODAY_PLAN_NOTICE.NEXT_CYCLE_PENDING, cycleId: latestCycle.id };
  }

  // The older daily plan exists only for the day it was generated (real today).
  const legacyOk = isToday && owned(legacyRecommendation) && (legacyRecommendation.items || []).length > 0;
  const legacy = legacyOk ? legacyPlan(legacyRecommendation, events, { dateKey: day, canStart }) : null;

  const primary = f01 || legacy;
  const additional = f01 && legacy ? [legacy] : [];

  const therapistCount = therapist.items.length;
  const therapistCompleted = therapist.items.filter((i) => i.completed).length;
  const remotionItems = primary ? primary.items : [];
  const remotionCount = remotionItems.length;
  const remotionCompleted = remotionItems.filter((i) => i.completed).length;

  return {
    patientId,
    dateKey: day,
    todayKey,
    isToday,
    isPast: day < todayKey,
    isFuture: day > todayKey,
    therapist,
    remotion: { primary, additional, notice },
    selfAvailable: !!patientId,
    summary: {
      therapistCount,
      therapistCompleted,
      remotionCount,
      remotionCompleted,
      totalAssignedCount: therapistCount + remotionCount,
      completedAssignedCount: therapistCompleted + remotionCompleted,
      allAssignedComplete: therapistCount + remotionCount > 0 && therapistCompleted + remotionCompleted === therapistCount + remotionCount,
    },
  };
}

/**
 * Store adapter. `legacyRecommendation` is passed in by the caller (the older
 * daily plan is produced by the app's catalog-aware engine call); everything
 * else is read here.
 */
export const todayPlanService = {
  getTodayPlan(patientId, { dateKey = null, todayKey = toLocalDateKey(new Date()), legacyRecommendation = null } = {}) {
    if (!patientId) return buildTodayPlan({ patientId: null, todayKey, dateKey });
    const day = isDateKey(dateKey) ? dateKey : todayKey;
    const activeCycle = trackingCycleService.getActiveTrackingCycle(patientId);
    const latestCycle = activeCycle || trackingCycleService.getLatestTrackingCycle(patientId);
    return buildTodayPlan({
      patientId,
      todayKey,
      dateKey: day,
      schedule: scheduleService.getByPatientAndDate(patientId, day),
      activeCycle,
      cycleRecommendation: activeCycle ? recommendationService.getById(activeCycle.recommendationId) : null,
      latestCycle,
      nextCycleOfLatest: latestCycle && latestCycle.reassessmentId ? trackingCycleService.getNextTrackingCycle(patientId, latestCycle.id) : null,
      legacyRecommendation,
      events: legacyRecommendation ? trainingEventService.listTrainingEvents(patientId) : [],
    });
  },
};

/**
 * `daily_complete` (I-4): some local day on which EVERY assigned task of that
 * day was completed — the therapist schedule(s) of the day and the F01 cycle's
 * daily snapshot, whichever exist. Self practice never counts. Compatibility:
 * a therapist schedule that is already status "completed" still qualifies (no
 * earned achievement is re-locked). Older ReMotion daily plans are not a
 * dated assignment and are not part of this rule.
 */
export function hasCompletedAllAssignedInADay({ schedules = [], cycles = [] } = {}) {
  const withTasks = (s) => (s.exercises || []).length > 0;
  if (schedules.some((s) => withTasks(s) && s.status === "completed")) return true;
  const schedulesByDate = new Map();
  for (const s of schedules) {
    if (!withTasks(s) || !s.date) continue;
    if (!schedulesByDate.has(s.date)) schedulesByDate.set(s.date, []);
    schedulesByDate.get(s.date).push(s);
  }
  for (const cycle of cycles) {
    for (const [dateKey, entry] of Object.entries((cycle && cycle.dailyTrainingProgress) || {})) {
      if (!entry || !entry.isComplete || !(entry.requiredExerciseIds || []).length) continue;
      const sameDay = schedulesByDate.get(dateKey) || [];
      if (sameDay.every((s) => s.status === "completed")) return true;
    }
  }
  return false;
}
