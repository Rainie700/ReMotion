import { functionalAssessmentService } from "./functionalAssessmentService.js";
import { trackingCycleService } from "./trackingCycleService.js";
import { getTrackingCycleViewState, isCompletedFiveTimesSitToStandResult, toLocalDateKey } from "./trackingCycle.js";

/**
 * Cross-Module Integration I-1 — F01 functional progress for the Data page
 * (read-only, derived; nothing is written).
 *
 *   currentCycle    the active F01 cycle (else the latest), with its derived view state
 *   completedCycles cycles that have a reassessment (newest first)
 *   previousCycle   the completed cycle the current one continues (previousCycleId), with its D4 comparison
 *   assessmentSeries the FORMAL tracking chain only (Data showcase cleanup): each F01
 *                   cycle's baseline + reassessment, oldest cycle first, every
 *                   assessment once (a next cycle that reuses the reassessment as
 *                   its baseline adds no second point). Other 5xSTS runs (practice /
 *                   test sessions) stay in history but are not a longitudinal trend.
 *                   Only VALID, COMPLETED runs, result.totalDurationMs only
 *                   (never repDurationsMs).
 *
 * Wording is left to the page and stays neutral (no improvement / decline).
 * `todayKey` only affects the derived cycle day (the D1 display rule).
 */
export function isComparable5xSts(session) {
  return !!session
    && session.status === "completed"
    && isCompletedFiveTimesSitToStandResult(session.result)
    && Number.isFinite(session.result && session.result.totalDurationMs)
    && session.result.totalDurationMs > 0;
}

export function buildAssessmentSeries(sessions = []) {
  return sessions
    .filter(isComparable5xSts)
    .map((s) => {
      const measuredAt = (s.result && s.result.measuredAt) || s.completedAt || null;
      return { assessmentId: s.id, measuredAt, dateKey: measuredAt ? toLocalDateKey(measuredAt) : null, totalDurationMs: s.result.totalDurationMs, assessmentRole: s.result.assessmentRole || null };
    })
    .sort((a, b) => String(a.measuredAt || "").localeCompare(String(b.measuredAt || "")) || String(a.assessmentId).localeCompare(String(b.assessmentId)));
}

const cycleOrder = (a, b) => String(a.cycleStartDateKey || "").localeCompare(String(b.cycleStartDateKey || ""))
  || String(a.createdAt || "").localeCompare(String(b.createdAt || ""))
  || String(a.id).localeCompare(String(b.id));

/**
 * Pure: the tracking-chain series. `getSession(id)` returns a stored 5xSTS
 * session; sessions of another user, invalid or incomplete runs are skipped.
 */
export function buildTrackingAssessmentSeries(cycles = [], getSession, userId) {
  const seen = new Set();
  const sessions = [];
  for (const cycle of [...cycles].filter((c) => c && c.userId === userId).sort(cycleOrder)) {
    for (const id of [cycle.baselineAssessmentId, cycle.reassessmentId]) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const session = getSession(id);
      if (session && session.patientId === userId) sessions.push(session);
    }
  }
  return buildAssessmentSeries(sessions);
}

/**
 * Pure: the F01 追蹤歷程 timeline (read-only). Cycles oldest first = 第 1 週, …;
 * each week's own baseline / reassessment and D4 change (`getComparison(cycle)`
 * returns the existing D4 comparison), the current week's derived day, and a
 * week-labelled trend: one node per chain assessment (a reused baseline is the
 * same node) plus a pending 「?」 node for a week still waiting to reassess.
 */
export function buildF01TrackingTimeline({ cycles = [], userId, todayKey, getSession, getComparison }) {
  const ordered = [...cycles].filter((c) => c && c.userId === userId).sort(cycleOrder);
  const msOf = (id) => {
    const s = id ? getSession(id) : null;
    return s && s.patientId === userId && isComparable5xSts(s) ? s.result.totalDurationMs : null;
  };
  const weeks = [];
  const nodes = [];
  const segments = [];
  let current = null;
  ordered.forEach((cycle, index) => {
    const weekNumber = index + 1;
    const baselineMs = msOf(cycle.baselineAssessmentId);
    const cmp = cycle.reassessmentId ? getComparison(cycle) : null;
    const completed = !!cycle.reassessmentId && !!cmp && cmp.eligible;
    const view = getTrackingCycleViewState(cycle, todayKey);
    const week = {
      weekNumber,
      cycleId: cycle.id,
      status: completed ? "completed" : cycle.reassessmentId ? "reassessed" : "in_progress",
      startDateKey: cycle.cycleStartDateKey,
      endDateKey: completed ? cmp.reassessmentDateKey : cycle.plannedReassessmentDateKey,
      plannedReassessmentDateKey: cycle.plannedReassessmentDateKey,
      baselineMs: completed ? cmp.baselineMs : baselineMs,
      reassessmentMs: completed ? cmp.reassessmentMs : null,
      changeMs: completed ? cmp.changeMs : null,
      completedDays: (cycle.completedTrainingDates || []).length,
      view,
    };
    weeks.push(week);
    if (!cycle.reassessmentId) current = week;
    // trend
    if (week.baselineMs == null) return;
    const last = nodes[nodes.length - 1];
    let from;
    if (last && last.assessmentId === cycle.baselineAssessmentId) {
      from = nodes.length - 1;
      last.shared = true; // 再次評估／新週基準: one node, never a second 8.9
    }
    else {
      nodes.push({ assessmentId: cycle.baselineAssessmentId, ms: week.baselineMs, dateKey: cycle.cycleStartDateKey, pending: false });
      from = nodes.length - 1;
      if (last) segments.push({ from: from - 1, to: from, week: null, pending: false, gap: true });
    }
    if (completed) nodes.push({ assessmentId: cycle.reassessmentId, ms: week.reassessmentMs, dateKey: cmp.reassessmentDateKey, pending: false });
    else if (!cycle.reassessmentId) nodes.push({ assessmentId: null, ms: null, dateKey: cycle.plannedReassessmentDateKey, pending: true });
    else return;
    segments.push({ from, to: nodes.length - 1, week: weekNumber, pending: !completed, gap: false });
  });
  return { current, weeks, trend: { nodes, segments } };
}

export const functionalProgressService = {
  getFunctionalProgress(userId, todayKey) {
    if (!userId) return { currentCycle: null, previousCycle: null, completedCycles: [], assessmentSeries: [] };
    const cycle = trackingCycleService.getActiveTrackingCycle(userId) || trackingCycleService.getLatestTrackingCycle(userId);
    let currentCycle = null;
    if (cycle) {
      const baseline = cycle.baselineAssessmentId ? functionalAssessmentService.getById(cycle.baselineAssessmentId) : null;
      const comparison = cycle.reassessmentId ? trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId }).comparison : null;
      currentCycle = {
        cycle,
        view: getTrackingCycleViewState(cycle, todayKey),
        baselineMs: isComparable5xSts(baseline) ? baseline.result.totalDurationMs : null,
        completedTrainingDays: (cycle.completedTrainingDates || []).length,
        comparison: comparison && comparison.eligible ? comparison : null,
      };
    }
    const cycles = trackingCycleService.listTrackingCycles(userId);
    let previousCycle = null;
    const prev = cycle && cycle.previousCycleId ? cycles.find((c) => c.id === cycle.previousCycleId && !!c.reassessmentId) : null;
    if (prev) {
      const cmp = trackingCycleService.getTrackingCycleComparison({ cycleId: prev.id, userId }).comparison;
      if (cmp && cmp.eligible) previousCycle = { cycle: prev, comparison: cmp };
    }
    return {
      currentCycle,
      previousCycle,
      completedCycles: cycles.filter((c) => !!c.reassessmentId),
      assessmentSeries: buildTrackingAssessmentSeries(cycles, (id) => functionalAssessmentService.getById(id), userId),
    };
  },

  /** 追蹤歷程 timeline for the user (read-only; see buildF01TrackingTimeline). */
  getTrackingTimeline(userId, todayKey) {
    if (!userId) return { current: null, weeks: [], trend: { nodes: [], segments: [] } };
    return buildF01TrackingTimeline({
      cycles: trackingCycleService.listTrackingCycles(userId),
      userId,
      todayKey,
      getSession: (id) => functionalAssessmentService.getById(id),
      getComparison: (cycle) => trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId }).comparison,
    });
  },
};
