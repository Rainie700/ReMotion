import { trackingCycleService } from "./trackingCycleService.js";
import { functionalAssessmentService } from "./functionalAssessmentService.js";
import { recommendationService, D5_PROPOSAL_ORIGIN } from "./recommendationService.js";
import { TRACKING_STATUS, getTrackingCycleViewState, isCompletedFiveTimesSitToStandResult, formatDateKeyMonthDay } from "./trackingCycle.js";
import { countCompletedTrainingDays, CONFIRMATION_MODE } from "./f01ProgressionDecision.js";

/**
 * Cross-Module Integration I-3 — 復健冒險 = the CURRENT F01 tracking cycle as a
 * short journey (Achievement = long-term record; the two no longer share rules).
 *
 * Every stage is an existing, persisted F01 milestone of THIS cycle (never an
 * achievement, never self / therapist training, never XP). Nothing is stored:
 * the journey is re-derived on every read, and it never awards XP.
 *
 *   1 初次功能評估   baseline = a valid, completed 5xSTS of this user (a reused reassessment counts)
 *   2 建立本週計畫   the cycle's own F01 recommendation (same user, same goal)
 *   3 完成第一次訓練 D3 completedTrainingDates (unique Day 1-6 dates) >= 1
 *   4 穩定累積       ... >= 3
 *   5 準備再次評估   D1 view status ready_for_reassessment (or the cycle already reassessed)
 *   6 完成再次評估   the cycle's reassessment: valid, completed, linked to this cycle
 *   7 下一階段建議   a D5 proposal of this user with sourceCycleId = this cycle (any decision)
 *   8 開啟下一週     a next cycle with previousCycleId = this cycle actually exists
 *
 * Presentation is monotonic and never invents a result: a stage is shown done
 * only when its own milestone AND its prerequisites are done. Stages 3 / 4 are
 * the only ones that can pass by — once the cycle is ready for reassessment an
 * unmet training milestone is shown as 「本週未完成」 (reassessing with fewer
 * training days is a normal flow), never ✓. Any other inconsistency stops at the
 * first missing milestone and is reported in `warnings`.
 */

export const F01_ADVENTURE_STAGES = Object.freeze([
  { n: 1, id: "baseline", title: "初次功能評估", requires: [] },
  { n: 2, id: "plan", title: "建立本週計畫", requires: [1] },
  { n: 3, id: "first_training", title: "完成第一次訓練", requires: [2], canPass: true },
  { n: 4, id: "steady_training", title: "穩定累積", requires: [3], canPass: true },
  { n: 5, id: "ready", title: "準備再次評估", requires: [2] },
  { n: 6, id: "reassessment", title: "完成再次評估", requires: [5] },
  { n: 7, id: "next_stage", title: "下一階段建議", requires: [6] },
  { n: 8, id: "next_cycle", title: "開啟下一週", requires: [7] },
]);
export const F01_ADVENTURE_STEADY_DAYS = 3;
export const F01_ADVENTURE_WINDOW_SIZE = 4;

const isValid5xSts = (s) => !!s && s.status === "completed" && isCompletedFiveTimesSitToStandResult(s.result)
  && Number.isFinite(s.result && s.result.totalDurationMs) && s.result.totalDurationMs > 0;

/**
 * Raw milestones of one cycle from the linked records (ownership / linkage
 * checked here — a record of another user or another cycle never counts).
 */
export function deriveF01Milestones({ cycle, baseline, recommendation, reassessment, proposal, nextCycle, viewState }) {
  if (!cycle) return null;
  const uid = cycle.userId;
  const trainingDays = countCompletedTrainingDays(cycle);
  return {
    1: !!baseline && baseline.id === cycle.baselineAssessmentId && baseline.patientId === uid && isValid5xSts(baseline),
    2: !!recommendation && recommendation.id === cycle.recommendationId && recommendation.kind === "f01_goal" && recommendation.patientId === uid && recommendation.selectedGoalId === cycle.selectedGoalId,
    3: trainingDays >= 1,
    4: trainingDays >= F01_ADVENTURE_STEADY_DAYS,
    5: !!viewState && (viewState.status === TRACKING_STATUS.READY_FOR_REASSESSMENT || viewState.status === TRACKING_STATUS.COMPLETED),
    6: !!reassessment && reassessment.id === cycle.reassessmentId && reassessment.patientId === uid && isValid5xSts(reassessment)
      && !!reassessment.result && reassessment.result.trackingCycleId === cycle.id,
    7: !!proposal && proposal.origin === D5_PROPOSAL_ORIGIN && proposal.patientId === uid && !!proposal.d5 && proposal.d5.sourceCycleId === cycle.id,
    8: !!nextCycle && nextCycle.previousCycleId === cycle.id && nextCycle.userId === uid,
    trainingDays,
  };
}

/** Stage states from raw milestones: completed / passed / current / waiting / locked (+ audit warnings). */
export function presentF01Stages(raw) {
  const state = {};
  const warnings = [];
  for (const st of F01_ADVENTURE_STAGES) {
    const depsDone = st.requires.every((r) => state[r] === "completed");
    if (raw[st.n] && depsDone) state[st.n] = "completed";
    else {
      if (raw[st.n] && !depsDone) warnings.push(`stage ${st.n} milestone present but a prerequisite is missing`);
      state[st.n] = "open";
    }
  }
  // Training milestones not reached before the cycle became ready: passed by, not failed.
  for (const st of F01_ADVENTURE_STAGES) {
    if (st.canPass && state[st.n] === "open" && state[5] === "completed") state[st.n] = "passed";
  }
  const current = F01_ADVENTURE_STAGES.find((st) => state[st.n] === "open") || null;
  for (const st of F01_ADVENTURE_STAGES) {
    if (state[st.n] === "open") state[st.n] = current && st.n === current.n ? "current" : "locked";
  }
  return { state, current: current ? current.n : null, warnings };
}

function stageDetail(n, ctx) {
  const { cycle, raw, viewState, proposal } = ctx;
  switch (n) {
    case 1: return { text: "完成第一次功能評估，開始你的復健旅程。", cta: { label: "開始功能評估", action: "goFunctionalDomainHome()" } };
    case 2: return { text: "依初次評估選擇訓練目標，建立本週的訓練計畫。", cta: cycle ? { label: "查看本週訓練", action: `goTrackingWeekTraining('${cycle.id}')` } : null };
    // I-4 — 今日訓練 lives on the Training Tab (復健師安排 first, then ReMotion 建議).
    case 3: return { text: "完成第一次本週訓練後，下一個關卡就會解鎖。", cta: { label: "前往今日復健", action: "goSchedule()" } };
    case 4: return { text: `本週已完成 ${raw.trainingDays} / ${F01_ADVENTURE_STEADY_DAYS} 個訓練日。`, progress: { current: raw.trainingDays, target: F01_ADVENTURE_STEADY_DAYS }, cta: { label: "前往今日復健", action: "goSchedule()" } };
    case 5: return { text: `完成本週安排後，於第 7 天（${formatDateKeyMonthDay(viewState.plannedReassessmentDateKey)}）進行再次評估。`, cta: { label: "查看本週訓練", action: `goTrackingWeekTraining('${cycle.id}')` } };
    case 6: return { text: "現在可以進行再次評估。", cta: { label: "進行再次評估", action: `goTrackingReassessment('${cycle.id}')` } };
    case 7: return { text: "查看本週前後比較與下一階段建議。", cta: { label: "查看下一階段建議", action: `goD5StatusCheck('${cycle.id}')` } };
    case 8: {
      const d5 = proposal.d5;
      const accepted = proposal.status === "accepted";
      const handoff = accepted && d5.confirmation ? d5.confirmation.handoff : null;
      if (d5.confirmationMode === CONFIRMATION_MODE.PROFESSIONAL_REVIEW_REQUIRED) {
        return { waitingReason: "professional_review", text: "下一週訓練目前等待進一步確認。", cta: { label: "查看狀況", action: `goD5Proposal('${proposal.id}')` } };
      }
      if (d5.decision === "no_auto_decision" || d5.nextCycleReady !== true) {
        return { waitingReason: "no_auto_decision", text: "目前資料不足以自動安排下一週，可以查看建議或重新確認狀況。", cta: { label: "查看下一階段建議", action: `goD5Proposal('${proposal.id}')` } };
      }
      if (handoff && handoff.requiresFreshBaseline) {
        return { waitingReason: "fresh_baseline", text: "完成新基準評估後開啟下一週。", cta: { label: "開始下一週期基準評估", action: `goNextCycleBaselineAssessment('${proposal.id}')` } };
      }
      return { waitingReason: "confirmation", text: "查看下一階段建議，確認後就能開啟下一週。", cta: { label: "查看下一階段建議", action: `goD5Proposal('${proposal.id}')` } };
    }
    default: return { text: "", cta: null };
  }
}

/**
 * Pure: the journey of ONE cycle (or "not started" when cycle is null).
 * @returns {{ started, chapterNumber, chapterLabel, stages, completedCount, totalStages,
 *            currentStage, allCompleted, waitingReason, detail, cta, visibleStages, warnings }}
 */
export function resolveF01Adventure({ cycle = null, baseline = null, recommendation = null, reassessment = null, proposal = null, nextCycle = null, viewState = null, chapterNumber = null, windowSize = F01_ADVENTURE_WINDOW_SIZE } = {}) {
  const totalStages = F01_ADVENTURE_STAGES.length;
  const raw = cycle ? deriveF01Milestones({ cycle, baseline, recommendation, reassessment, proposal, nextCycle, viewState }) : { trainingDays: 0 };
  const { state, current, warnings } = cycle
    ? presentF01Stages(raw)
    : { state: Object.fromEntries(F01_ADVENTURE_STAGES.map((s) => [s.n, s.n === 1 ? "current" : "locked"])), current: 1, warnings: [] };
  const detailInfo = current ? stageDetail(current, { cycle, raw, viewState, proposal }) : { text: "本週旅程已完成，下一週的旅程已經開始。", cta: null };
  if (current && detailInfo.waitingReason) state[current] = "waiting";

  const stages = F01_ADVENTURE_STAGES.map((st) => ({ n: st.n, id: st.id, title: st.title, state: state[st.n] }));
  const completedCount = stages.filter((s) => s.state === "completed").length;
  const currentIdx = current ? current - 1 : totalStages - 1;
  const size = Math.min(windowSize, totalStages);
  let start = currentIdx - Math.floor((size - 1) / 2);
  start = Math.max(0, Math.min(start, totalStages - size));

  return {
    started: !!cycle,
    cycleId: cycle ? cycle.id : null,
    chapterNumber: cycle ? chapterNumber : null,
    chapterLabel: !cycle ? "尚未開始旅程" : chapterNumber ? `第 ${chapterNumber} 週旅程` : "目前旅程",
    stages,
    visibleStages: stages.slice(start, start + size),
    completedCount,
    totalStages,
    currentStage: current ? stages[current - 1] : null,
    allCompleted: !current,
    waitingReason: detailInfo.waitingReason || null,
    detail: detailInfo.text,
    progress: detailInfo.progress || null,
    cta: detailInfo.cta || null,
    warnings,
  };
}

// ── loader (read-only, user-scoped) ─────────────────────────────────────

function loadCycleInputs(userId, cycle, todayKey) {
  const scoped = (session) => (session && session.patientId === userId ? session : null);
  const recommendation = cycle.recommendationId ? recommendationService.getById(cycle.recommendationId) : null;
  return {
    cycle,
    baseline: scoped(cycle.baselineAssessmentId ? functionalAssessmentService.getById(cycle.baselineAssessmentId) : null),
    recommendation: recommendation && recommendation.patientId === userId ? recommendation : null,
    reassessment: scoped(cycle.reassessmentId ? functionalAssessmentService.getById(cycle.reassessmentId) : null),
    proposal: recommendationService.getF01D5ProposalForCycle(userId, cycle.id),
    nextCycle: trackingCycleService.getNextTrackingCycle(userId, cycle.id),
    viewState: getTrackingCycleViewState(cycle, todayKey),
  };
}

/**
 * The current chapter: the active cycle, else the newest cycle that has no
 * next cycle (the end of its chain) — never an older chapter that already has
 * a successor. Chapter number = length of the previousCycleId chain when the
 * chain is complete (reaches a cycle without previousCycleId); a broken chain
 * yields null (shown as 「目前旅程」, never a guessed week number).
 */
export function selectCurrentF01Chapter(cycles = []) {
  const byId = new Map(cycles.map((c) => [c.id, c]));
  const hasSuccessor = new Set(cycles.map((c) => c.previousCycleId).filter(Boolean));
  const newest = (list) => [...list].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")) || String(b.id).localeCompare(String(a.id)))[0] || null;
  const current = newest(cycles.filter((c) => !c.reassessmentId)) || newest(cycles.filter((c) => !hasSuccessor.has(c.id)));
  if (!current) return { current: null, chapterNumber: null, previous: null };
  let n = 1;
  let cursor = current;
  const seen = new Set([current.id]);
  while (cursor.previousCycleId) {
    const prev = byId.get(cursor.previousCycleId);
    if (!prev || prev.userId !== current.userId || seen.has(prev.id)) return { current, chapterNumber: null, previous: prev && prev.userId === current.userId ? prev : null };
    seen.add(prev.id);
    n += 1;
    cursor = prev;
  }
  const previous = current.previousCycleId ? byId.get(current.previousCycleId) : null;
  return { current, chapterNumber: n, previous };
}

export const f01AdventureService = {
  /**
   * The journey of the user's current F01 chapter (+ a short summary of the
   * previous chapter so a new chapter never reads as progress going backwards).
   * `todayKey` only drives the D1 view status (same rule as the home card).
   */
  getAdventure(userId, todayKey) {
    if (!userId) return { ...resolveF01Adventure(), previousChapter: null };
    const cycles = trackingCycleService.listTrackingCycles(userId);
    const { current, chapterNumber, previous } = selectCurrentF01Chapter(cycles);
    if (!current) return { ...resolveF01Adventure(), previousChapter: null };
    const adventure = resolveF01Adventure({ ...loadCycleInputs(userId, current, todayKey), chapterNumber });
    let previousChapter = null;
    if (previous) {
      const prevAdventure = resolveF01Adventure(loadCycleInputs(userId, previous, todayKey));
      previousChapter = { cycleId: previous.id, completedCount: prevAdventure.completedCount, totalStages: prevAdventure.totalStages, chapterNumber: chapterNumber ? chapterNumber - 1 : null };
    }
    return { ...adventure, previousChapter };
  },
};
