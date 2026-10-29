import { functionalAssessmentService } from "./functionalAssessmentService.js";
import { trackingCycleService } from "./trackingCycleService.js";
import { displayCompletedTrainingDays } from "./f01DailyTargets.js";
import { getTrackingCycleViewState, isCompletedFiveTimesSitToStandResult, toLocalDateKey } from "./trackingCycle.js";
import { getFa5xMeasurementProfile } from "./fa5xMeasurementCompatibility.js";

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
  const points = sessions
    .filter(isComparable5xSts)
    .map((s) => {
      const measuredAt = (s.result && s.result.measuredAt) || s.completedAt || null;
      return {
        assessmentId: s.id, measuredAt, dateKey: measuredAt ? toLocalDateKey(measuredAt) : null, totalDurationMs: s.result.totalDurationMs, assessmentRole: s.result.assessmentRole || null,
        // 5xSTS batch A — measurement-version group (null = version missing / unknown / inconsistent)
        measurementGroup: getFa5xMeasurementProfile(s.result).group,
      };
    })
    .sort((a, b) => String(a.measuredAt || "").localeCompare(String(b.measuredAt || "")) || String(a.assessmentId).localeCompare(String(b.assessmentId)));
  // A trend line joins two points only when both were measured the same way (same known
  // group, js/data/fa5xMeasurementCompatibility.js); every point stays visible either way.
  return points.map((p, i) => ({ ...p, connectsToPrevious: i > 0 && !!p.measurementGroup && p.measurementGroup === points[i - 1].measurementGroup }));
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
  // 5xSTS batch A — measurement-version group of a chain assessment (null = unknown).
  const groupOf = (id) => {
    const s = id ? getSession(id) : null;
    return s && s.result ? getFa5xMeasurementProfile(s.result).group : null;
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
      completedDays: displayCompletedTrainingDays(cycle), // batch 2: null when measurement pending
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
      // 5xSTS batch A — the dashed link between two weeks is drawn only when both points were
      // measured the same way (same known measurement group); otherwise the line is broken.
      const lastGroup = last && last.assessmentId ? groupOf(last.assessmentId) : null;
      if (last && !last.pending && lastGroup && lastGroup === groupOf(cycle.baselineAssessmentId)) {
        segments.push({ from: from - 1, to: from, week: null, pending: false, gap: true });
      }
    }
    if (completed) nodes.push({ assessmentId: cycle.reassessmentId, ms: week.reassessmentMs, dateKey: cmp.reassessmentDateKey, pending: false });
    else if (!cycle.reassessmentId) nodes.push({ assessmentId: null, ms: null, dateKey: cycle.plannedReassessmentDateKey, pending: true });
    else return;
    segments.push({ from, to: nodes.length - 1, week: weekNumber, pending: !completed, gap: false });
  });
  return { current, weeks, trend: { nodes, segments } };
}

/**
 * UX round 4/5 — ONE chart model for every 5xSTS chart (pure, read-only). Points = the tracking chain's valid,
 * completed assessments (a reassessment reused as the next week's baseline is ONE point), grouped by week:
 *   - a week's two points are joined only when its D4 comparison is eligible (the existing rule — never bypassed
 *     here); a reassessed week that is not comparable keeps both points, no line, and says why in plain words;
 *   - different weeks are separate groups (never a line across weeks);
 *   - a reassessment that has not happened yet is `planned` (a date), never a value, never a line.
 * Sentences describe the SHOWN values only (describeShownTimeDifference): no 改善 / 退步.
 */
export function buildFa5xChart({ cycles = [], userId, todayKey, getSession, getComparison, describeDifference }) {
  const ordered = [...cycles].filter((c) => c && c.userId === userId).sort(cycleOrder);
  const valid = (id) => { const s = id ? getSession(id) : null; return s && s.patientId === userId && isComparable5xSts(s) ? s : null; };
  const dateOf = (s) => toLocalDateKey((s.result && s.result.measuredAt) || s.completedAt);
  const points = [];
  const weeks = [];
  let planned = null;
  ordered.forEach((cycle, index) => {
    const weekNumber = index + 1;
    const base = valid(cycle.baselineAssessmentId);
    const re = cycle.reassessmentId ? valid(cycle.reassessmentId) : null;
    const cmp = cycle.reassessmentId ? getComparison(cycle) : null;
    let from = null, to = null;
    if (base) {
      const last = points[points.length - 1];
      if (last && last.assessmentId === base.id) { from = points.length - 1; last.alsoBaselineOfWeek = weekNumber; }
      else { points.push({ assessmentId: base.id, ms: base.result.totalDurationMs, dateKey: dateOf(base), weekNumber, role: weekNumber === 1 ? "初次評估" : "本週基準" }); from = points.length - 1; }
    }
    if (re) { points.push({ assessmentId: re.id, ms: re.result.totalDurationMs, dateKey: dateOf(re), weekNumber, role: "再次評估" }); to = points.length - 1; }
    const comparable = !!(cmp && cmp.eligible) && from != null && to != null;
    if (!cycle.reassessmentId) {
      const view = getTrackingCycleViewState(cycle, todayKey);
      planned = { weekNumber, cycleId: cycle.id, dateKey: cycle.plannedReassessmentDateKey, ready: view.status === "ready_for_reassessment" };
    }
    weeks.push({
      weekNumber, cycleId: cycle.id, from, to, comparable,
      differenceText: comparable && describeDifference ? describeDifference(cmp.baselineMs, cmp.reassessmentMs) : null,
      note: cycle.reassessmentId && !comparable ? "這週的兩次評估條件或量測方式不同，不直接比較" : null,
      pending: !cycle.reassessmentId,
    });
  });
  return { points, weeks, planned };
}

/**
 * What ONE 5xSTS run was for, in plain words (result page + 評估紀錄 list). Stored role first; otherwise whether it
 * is a tracking week's baseline, the person's first completed run, or a single run outside any week.
 */
export function describeFa5xPurpose(session, { cycles = [], completedSessions = [] } = {}) {
  const role = session && session.result ? session.result.assessmentRole : null;
  if (role === "reassessment") return { kind: "reassessment", label: "7 日追蹤｜再次評估" };
  if (role === "next_cycle_baseline") return { kind: "next_baseline", label: "新週期基準評估" };
  if (role === "initial_plan_baseline") return { kind: "initial_plan_baseline", label: "第一週基準評估" };
  if (session && cycles.some((c) => c.baselineAssessmentId === session.id)) return { kind: "cycle_baseline", label: "7 日追蹤｜初次評估" };
  const first = [...completedSessions].filter(isComparable5xSts).sort((a, b) => String((a.result && a.result.measuredAt) || a.completedAt).localeCompare(String((b.result && b.result.measuredAt) || b.completedAt)))[0];
  if (session && first && first.id === session.id) return { kind: "first", label: "首次評估" };
  return { kind: "single", label: "單次評估（未納入追蹤週期）" };
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
        completedTrainingDays: displayCompletedTrainingDays(cycle), // batch 2: null when measurement pending
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

  /** The shared 5xSTS chart model of the user (see buildFa5xChart). */
  getFa5xChart(userId, todayKey, describeDifference) {
    if (!userId) return { points: [], weeks: [], planned: null };
    return buildFa5xChart({
      cycles: trackingCycleService.listTrackingCycles(userId), userId, todayKey, describeDifference,
      getSession: (id) => functionalAssessmentService.getById(id),
      getComparison: (cycle) => trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId }).comparison,
    });
  },
  /** Purpose of one run for this user (see describeFa5xPurpose). */
  describePurpose(session) {
    if (!session) return null;
    return describeFa5xPurpose(session, { cycles: trackingCycleService.listTrackingCycles(session.patientId), completedSessions: functionalAssessmentService.getCompletedByPatientId(session.patientId, { assessmentType: "five_times_sit_to_stand" }) });
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
