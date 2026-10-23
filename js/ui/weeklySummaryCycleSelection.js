/**
 * Therapist AI 週摘要 — which F01 tracking cycle the summary card is about.
 *
 * Pure: the options come from the existing 追蹤歷程 timeline weeks
 * (functionalProgressService.getTrackingTimeline -> buildF01TrackingTimeline),
 * so the week number (oldest cycle = 第 1 週) and the date range are the same
 * ones the patient's tracking history shows. Nothing here reads storage.
 *
 * One selection { patientId, cycleId } drives viewing, generating and
 * confirming; a selection that belongs to another patient, or names a cycle
 * this patient does not have, is never reused — it falls back to the default.
 */
import { formatDateKeyMonthDay } from "../data/trackingCycle.js";
import { getPublishedVersion, isSummaryDocConsistent } from "../data/weeklySummaryVersions.js";

/**
 * @param {Array} weeks buildF01TrackingTimeline().weeks (oldest first)
 * @returns {Array<{ cycleId, weekNumber, startDateKey, endDateKey, completed, statusLabel, label }>}
 */
export function buildSummaryCycleOptions(weeks = []) {
  return (weeks || [])
    .filter((w) => w && w.cycleId)
    .map((w) => {
      // A cycle is finished once it has a reassessment ("completed" or "reassessed"); never by date alone.
      const completed = w.status !== "in_progress";
      const statusLabel = completed ? "已完成" : "進行中";
      return {
        cycleId: w.cycleId,
        weekNumber: w.weekNumber,
        startDateKey: w.startDateKey || null,
        endDateKey: w.endDateKey || null,
        completed,
        statusLabel,
        label: `第 ${w.weekNumber} 週｜${formatDateKeyMonthDay(w.startDateKey)}–${formatDateKeyMonthDay(w.endDateKey)}｜${statusLabel}`,
      };
    });
}

/** Default: the most recent completed cycle; with none completed, the in-progress one. */
export function pickDefaultSummaryCycleId(options = []) {
  const completed = options.filter((o) => o.completed);
  if (completed.length) return completed[completed.length - 1].cycleId;
  const inProgress = options.filter((o) => !o.completed);
  return inProgress.length ? inProgress[inProgress.length - 1].cycleId : null;
}

/**
 * The selection to use for `patientId`: the stored one only when it is for
 * this patient and names one of this patient's cycles; otherwise the default.
 * @returns {{ patientId, cycleId } | null}
 */
export function resolveSummaryCycleSelection({ patientId, options = [], selection = null }) {
  if (!patientId || !options.length) return null;
  if (selection && selection.patientId === patientId && options.some((o) => o.cycleId === selection.cycleId)) {
    return { patientId, cycleId: selection.cycleId };
  }
  const cycleId = pickDefaultSummaryCycleId(options);
  return cycleId ? { patientId, cycleId } : null;
}

/** A saved summary is shown / confirmed only for the exact patient + cycle it was generated for. */
export function isSummaryForSelection(saved, selection) {
  return !!saved && !!selection && saved.cycleId === selection.cycleId && saved.patientId === selection.patientId;
}

/** Same patient + cycle (busy / error state is keyed this way so it never leaks to another case or week). */
export function isSameSummaryTarget(a, b) {
  return !!a && !!b && a.patientId === b.patientId && a.cycleId === b.cycleId;
}

// ── Patient side: the 復健師已確認的週摘要 the signed-in patient may read ──

/**
 * Options = the patient's OWN summaries that are confirmed, carry a patient
 * version, and map to one of the patient's timeline weeks (same 第 N 週 /
 * dates as getTrackingTimeline). Drafts, other patients' summaries and
 * summaries whose cycle is not in the timeline are never options; the last
 * group is counted so the page can say some could not be matched.
 * Newest cycle date first.
 * @returns {{ options: Array<{ cycleId, weekNumber, startDateKey, endDateKey, label, published }>, unmatchedCount: number }}
 */
export function buildConfirmedSummaryOptions({ patientId, summaries = [], weeks = [] }) {
  const weekById = new Map((weeks || []).filter((w) => w && w.cycleId).map((w) => [w.cycleId, w]));
  const options = [];
  let unmatchedCount = 0;
  for (const s of summaries || []) {
    if (!s || !patientId || s.patientId !== patientId) continue;
    // Only the confirmed (published) version — a pending draft never reaches the patient.
    const published = getPublishedVersion(s);
    if (!published) continue;
    const week = isSummaryDocConsistent(s, published) ? weekById.get(s.cycleId) : null;
    if (!week || !published.summary.userSummary) { unmatchedCount += 1; continue; }
    options.push({
      cycleId: s.cycleId,
      weekNumber: week.weekNumber,
      startDateKey: week.startDateKey || null,
      endDateKey: week.endDateKey || null,
      label: `第 ${week.weekNumber} 週｜${formatDateKeyMonthDay(week.startDateKey)}–${formatDateKeyMonthDay(week.endDateKey)}`,
      published,
    });
  }
  options.sort((a, b) => String(b.startDateKey || "").localeCompare(String(a.startDateKey || "")) || b.weekNumber - a.weekNumber);
  return { options, unmatchedCount };
}

/** Keeps a still-valid choice of the same patient; otherwise the newest confirmed summary. */
export function resolveConfirmedSummarySelection({ patientId, options = [], selection = null }) {
  if (!patientId || !options.length) return null;
  if (selection && selection.patientId === patientId && options.some((o) => o.cycleId === selection.cycleId)) {
    return { patientId, cycleId: selection.cycleId };
  }
  return { patientId, cycleId: options[0].cycleId };
}
