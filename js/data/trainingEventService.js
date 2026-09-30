import { analysisService, ANALYSIS_RECORD_SOURCES } from "./analysisService.js";
import { trackingCycleService } from "./trackingCycleService.js";
import { toLocalDateKey, isDateKey, addDaysToDateKey } from "./trackingCycle.js";
import { TRAINING_SOURCE_TYPE, TRAINING_SOURCE_SUBTYPE, TRAINING_SOURCE_LABEL, isValidTrainingSource } from "./trainingSource.js";

/**
 * Cross-Module Integration I-1 — Canonical Training Event (read-time layer).
 *
 * The canonical execution record stays the existing analysisRecord (no new
 * collection, no second write). This module only NORMALIZES records into one
 * shape every consumer (records list, Data page, later XP / achievements /
 * adventure) reads, so a training is never interpreted differently per page.
 *
 * Source model (who the plan came from — never a clinical judgement):
 *   therapist  / therapist_plan                  復健師安排  (schedule linkage)
 *   remotion   / f01_cycle                       ReMotion 建議 (F01 tracking-cycle plan)
 *   remotion   / f01_recommendation              ReMotion 建議 (F01 plan outside an active cycle)
 *   remotion   / legacy_remotion_recommendation  ReMotion 建議 (older 今日建議 flow)
 *   self       / self_selected                   自主練習
 *   legacy_unknown                               既有訓練 (no explicit linkage — never guessed)
 *
 * New records carry sourceType / sourceSubtype written at create time from an
 * explicit execution context (analysisService.create). Records written before
 * that are derived HERE from explicit linkage only:
 *   scheduleId (assigned)                         -> therapist
 *   an F01 cycle's daily progress points at it    -> remotion / f01_cycle
 *   explicit source "self_practice"               -> self
 *   anything else                                 -> legacy_unknown
 * The exercise id is never used to infer a source.
 *
 * Dates: localDateKey is the LOCAL calendar date of the real completion time
 * (same rule as D1's toLocalDateKey) — never UTC slicing, never ?trackingToday=.
 */

export { TRAINING_SOURCE_TYPE, TRAINING_SOURCE_SUBTYPE, TRAINING_SOURCE_LABEL, isValidTrainingSource };

/** Real completion time of a record (never a debug date). */
export function recordTimestamp(record) {
  return (record && (record.completedAt || record.capturedAt || record.createdAt)) || null;
}

/** Local calendar date of the record's real completion time. */
export function recordLocalDateKey(record) {
  if (record && isDateKey(record.localDateKey)) return record.localDateKey;
  const ts = recordTimestamp(record);
  return ts ? toLocalDateKey(ts) : null;
}

/**
 * recordId -> { trackingCycleId, recommendationId, dateKey } for every exercise
 * completion an F01 cycle of this user recorded (D3 dailyTrainingProgress).
 * This is the explicit reverse linkage used for legacy records.
 */
export function buildCycleCompletionIndex(cycles = []) {
  const index = new Map();
  for (const cycle of cycles) {
    for (const [dateKey, day] of Object.entries(cycle.dailyTrainingProgress || {})) {
      for (const completion of Object.values((day && day.exerciseCompletions) || {})) {
        if (completion && completion.analysisRecordId) {
          index.set(completion.analysisRecordId, { trackingCycleId: cycle.id, recommendationId: day.recommendationId || cycle.recommendationId || null, userId: cycle.userId, dateKey });
        }
      }
    }
  }
  return index;
}

function resolveSource(record, cycleIndex) {
  // 1. Written at create time from an explicit execution context.
  if (isValidTrainingSource(record.sourceType, record.sourceSubtype)) {
    return {
      sourceType: record.sourceType,
      sourceSubtype: record.sourceSubtype,
      trackingCycleId: record.trackingCycleId || null,
      recommendationId: record.recommendationId || null,
      therapistPlanId: record.therapistPlanId || record.scheduleId || null,
      derivedAt: "write",
    };
  }
  // 2. Legacy: explicit linkage only.
  if (record.scheduleId && record.source !== ANALYSIS_RECORD_SOURCES.SELF_PRACTICE) {
    return { sourceType: "therapist", sourceSubtype: "therapist_plan", trackingCycleId: null, recommendationId: null, therapistPlanId: record.scheduleId, derivedAt: "read" };
  }
  const link = cycleIndex && cycleIndex.get(record.id);
  if (link && link.userId === record.patientId) {
    return { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: link.trackingCycleId, recommendationId: link.recommendationId, therapistPlanId: null, derivedAt: "read" };
  }
  if (record.source === ANALYSIS_RECORD_SOURCES.SELF_PRACTICE) {
    return { sourceType: "self", sourceSubtype: "self_selected", trackingCycleId: null, recommendationId: null, therapistPlanId: null, derivedAt: "read" };
  }
  return { sourceType: "legacy_unknown", sourceSubtype: "legacy_unknown", trackingCycleId: null, recommendationId: null, therapistPlanId: null, derivedAt: "read" };
}

/**
 * I-2 — completion of ONE record from explicit data only (a saved record is
 * never "completed" just because it exists):
 *   1. summary.completed (boolean)            the detector's own verdict (knows per-side targets)
 *   2. top-level totalReps / targetReps       what every detector writes (targetReps > 0)
 *   3. summary.totalReps / summary.targetReps same check on the summary copy
 *   4. otherwise                               completed = false, completionKnown = false
 * Steps 1-2 are exactly D3's isTrainingRecordCompleted(); step 3 only adds a
 * reading for records that carry reps in the summary alone. D3's F01 day
 * completion keeps using its own function unchanged.
 */
export function resolveTrainingCompletion(record) {
  const summary = (record && record.summary) || {};
  if (typeof summary.completed === "boolean") return { completed: summary.completed, completionKnown: true, completionBasis: "detector_flag" };
  const repsCheck = (total, target) => Number.isFinite(total) && Number.isFinite(target) && target > 0;
  if (record && repsCheck(record.totalReps, record.targetReps)) return { completed: record.totalReps >= record.targetReps, completionKnown: true, completionBasis: "top_level_reps" };
  if (repsCheck(summary.totalReps, summary.targetReps)) return { completed: summary.totalReps >= summary.targetReps, completionKnown: true, completionBasis: "summary_reps" };
  return { completed: false, completionKnown: false, completionBasis: "unknown" };
}

/** AI 姿勢分數: the detector's existing score, when it has one (never recomputed). */
export function recordPoseScore(record) {
  if (!record) return null;
  if (typeof record.score === "number") return record.score;
  if (typeof record.overallScore === "number") return record.overallScore;
  return null;
}

/**
 * One analysisRecord -> one canonical Training Event (pure; nothing written).
 *
 *   completed / completionKnown / completionBasis  resolveTrainingCompletion()
 *   isLegacy          the record was written BEFORE the canonical write path
 *                     (no valid write-time sourceType) — i.e. existing history
 *   countsAsCompleted what every count / XP / achievement uses:
 *                     canonical records: only when completed === true;
 *                     legacy records: always (compatibility — existing history
 *                     keeps the credit it already had; nothing is re-locked)
 */
export function normalizeTrainingEvent(record, { cycleIndex = null } = {}) {
  if (!record || !record.id) return null;
  const source = resolveSource(record, cycleIndex);
  const summary = record.summary || {};
  const completion = resolveTrainingCompletion(record);
  const isLegacy = !isValidTrainingSource(record.sourceType, record.sourceSubtype);
  return {
    eventId: record.id,
    userId: record.patientId || null,
    exerciseId: record.exerciseId || null,
    exerciseName: record.exerciseName || null,
    ...source,
    sourceLabel: TRAINING_SOURCE_LABEL[source.sourceType],
    localDateKey: recordLocalDateKey(record),
    startedAt: record.startedAt || null,
    completedAt: recordTimestamp(record),
    ...completion,
    countsAsCompleted: completion.completed || isLegacy,
    targetReps: Number.isFinite(summary.targetReps) ? summary.targetReps : Number.isFinite(record.targetReps) ? record.targetReps : null,
    actualReps: Number.isFinite(summary.totalReps) ? summary.totalReps : Number.isFinite(record.totalReps) ? record.totalReps : null,
    poseScore: recordPoseScore(record),
    isLegacy,
    record,
  };
}

// ── queries ─────────────────────────────────────────────────────────────

const byNewest = (a, b) => String(b.completedAt || "").localeCompare(String(a.completedAt || "")) || String(b.eventId).localeCompare(String(a.eventId));

/** Pure: records + cycles -> events (newest first). */
export function normalizeTrainingEvents(records = [], cycles = []) {
  const cycleIndex = buildCycleCompletionIndex(cycles);
  return records.map((r) => normalizeTrainingEvent(r, { cycleIndex })).filter(Boolean).sort(byNewest);
}

/** Local date keys of the 7-day window ending on todayKey (same rolling window the Data page always used). */
export function weekWindow(todayKey) {
  return { startKey: addDaysToDateKey(todayKey, -6), endKey: todayKey };
}

/**
 * This week's training summary from events. Only COMPLETED events count as
 * trainings; the average AI 姿勢分數 uses only this week's completed, scored
 * events — never the all-time average. `todayKey` must be the real local date.
 */
export function summarizeTrainingWeek(events = [], todayKey) {
  const { startKey, endKey } = weekWindow(todayKey);
  const inRange = (e, a, b) => e.countsAsCompleted && e.localDateKey && e.localDateKey >= a && e.localDateKey <= b;
  const inWeek = events.filter((e) => inRange(e, startKey, endKey));
  const prevStart = addDaysToDateKey(startKey, -7), prevEnd = addDaysToDateKey(startKey, -1);
  const completedByDay = {};
  inWeek.forEach((e) => { completedByDay[e.localDateKey] = (completedByDay[e.localDateKey] || 0) + 1; });
  const scored = inWeek.map((e) => e.poseScore).filter((s) => s != null);
  const bySource = { therapist: 0, remotion: 0, self: 0, legacy_unknown: 0 };
  inWeek.forEach((e) => { bySource[e.sourceType] += 1; });
  const latestScored = events.find((e) => e.countsAsCompleted && e.poseScore != null) || null;
  return {
    startKey,
    endKey,
    completedCount: inWeek.length,
    inWeekEvents: inWeek,
    // saved-but-not-completed trainings this week (shown in history, never counted)
    incompleteCount: events.filter((e) => !e.countsAsCompleted && e.localDateKey && e.localDateKey >= startKey && e.localDateKey <= endKey).length,
    trainingDays: new Set(inWeek.map((e) => e.localDateKey)).size,
    averagePoseScore: scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null,
    scoredCount: scored.length,
    bySource,
    completedByDay,
    previousWeekCompletedCount: events.filter((e) => inRange(e, prevStart, prevEnd)).length,
    latestCompletedEvent: events.find((e) => e.countsAsCompleted) || null,
    latestPoseScore: latestScored ? { score: latestScored.poseScore, localDateKey: latestScored.localDateKey, exerciseName: latestScored.exerciseName } : null,
  };
}

export function filterTrainingEventsBySource(events = [], sourceType = "all") {
  return sourceType === "all" ? events : events.filter((e) => e.sourceType === sourceType);
}

export const trainingEventService = {
  /** Every training event of a user, newest first (reads analysisRecords + the user's F01 cycles). */
  listTrainingEvents(userId) {
    if (!userId) return [];
    return normalizeTrainingEvents(analysisService.getByPatientId(userId), trackingCycleService.listTrackingCycles(userId));
  },
  getTrainingEvent(userId, eventId) {
    return trainingEventService.listTrainingEvents(userId).find((e) => e.eventId === eventId) || null;
  },
};
