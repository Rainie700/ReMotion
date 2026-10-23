import { CR05_THRESHOLDS } from "./constants.js";
import { evaluateSeatedKneeRaiseQuality } from "./quality.js";

export const CR05_LEG_STATE = { NEUTRAL: "neutral", RAISING: "raising", TOP: "top", LOWERING: "lowering" };

function createLegTracker(side) {
  let state = CR05_LEG_STATE.NEUTRAL;
  let startedAt = null;
  let lastValidAt = null;
  let minHipAngle = Infinity;
  let maxTrunkLeanDeg = 0;
  let topConfirm = 0;
  let neutralConfirm = 0;

  function reset() {
    state = CR05_LEG_STATE.NEUTRAL;
    startedAt = null;
    minHipAngle = Infinity;
    maxTrunkLeanDeg = 0;
    topConfirm = 0;
    neutralConfirm = 0;
  }

  function update(angle, trunkLeanDeg, timestamp, thresholds) {
    if (angle == null || !Number.isFinite(angle)) return { state, completed: null, started: false };
    if (lastValidAt != null && state !== CR05_LEG_STATE.NEUTRAL && timestamp - lastValidAt > thresholds.MAX_FRAME_GAP_MS) reset();
    lastValidAt = timestamp;
    let started = false;
    let completed = null;

    if (state === CR05_LEG_STATE.NEUTRAL && angle <= thresholds.REP_START_HIP_ANGLE_MAX_DEG) {
      state = CR05_LEG_STATE.RAISING;
      startedAt = timestamp;
      minHipAngle = angle;
      maxTrunkLeanDeg = trunkLeanDeg ?? 0;
      started = true;
    } else if (state !== CR05_LEG_STATE.NEUTRAL) {
      minHipAngle = Math.min(minHipAngle, angle);
      if (trunkLeanDeg != null) maxTrunkLeanDeg = Math.max(maxTrunkLeanDeg, trunkLeanDeg);
      if (state === CR05_LEG_STATE.RAISING) {
        if (angle <= thresholds.CANDIDATE_TOP_HIP_ANGLE_MAX_DEG) {
          topConfirm += 1;
          if (topConfirm >= thresholds.TOP_CONFIRM_FRAMES) state = CR05_LEG_STATE.TOP;
        } else {
          topConfirm = 0;
        }
      } else if (state === CR05_LEG_STATE.TOP && angle > thresholds.CANDIDATE_TOP_HIP_ANGLE_MAX_DEG) {
        state = CR05_LEG_STATE.LOWERING;
      } else if (state === CR05_LEG_STATE.LOWERING) {
        if (angle <= thresholds.CANDIDATE_TOP_HIP_ANGLE_MAX_DEG) {
          state = CR05_LEG_STATE.TOP;
          neutralConfirm = 0;
        } else if (angle >= thresholds.NEUTRAL_HIP_ANGLE_MIN_DEG) {
          neutralConfirm += 1;
          if (neutralConfirm >= thresholds.NEUTRAL_CONFIRM_FRAMES) {
            const durationMs = timestamp - startedAt;
            if (durationMs >= thresholds.MIN_REP_DURATION_MS && durationMs <= thresholds.MAX_REP_DURATION_MS) {
              completed = { side, startedAt, completedAt: timestamp, durationMs, minHipAngle, maxTrunkLeanDeg };
            }
            reset();
          }
        } else {
          neutralConfirm = 0;
        }
      }
    }
    return { state, completed, started };
  }
  return { update, getState: () => state, reset };
}

export function createSeatedKneeRaiseSession(config = {}) {
  const thresholds = config.thresholds || CR05_THRESHOLDS;
  const targetReps = Math.max(1, Number(config.targetReps) || 10);
  let left = createLegTracker("left");
  let right = createLegTracker("right");
  let repRecords = [];
  let lastCompletedSide = null;
  let lastStart = { side: null, at: null };
  let trackingInterruptionCount = 0;
  let trackingInterrupted = false;

  function processFrame({ timestamp, leftHipAngle, rightHipAngle, trunkLeanDeg, bodyReady }) {
    if (!bodyReady) {
      const repInProgress = left.getState() !== CR05_LEG_STATE.NEUTRAL || right.getState() !== CR05_LEG_STATE.NEUTRAL;
      if (repInProgress && !trackingInterrupted) trackingInterruptionCount += 1;
      trackingInterrupted = true;
      return { completedReps: [], summary: getSummary() };
    }
    trackingInterrupted = false;
    const leftResult = left.update(leftHipAngle, trunkLeanDeg, timestamp, thresholds);
    const rightResult = right.update(rightHipAngle, trunkLeanDeg, timestamp, thresholds);
    const started = [];
    if (leftResult.started) started.push("left");
    if (rightResult.started) started.push("right");
    for (const side of started) lastStart = { side, at: timestamp };

    const completedReps = [leftResult.completed, rightResult.completed].filter(Boolean).map((rep) => {
      const simultaneousStart = lastStart.at != null && lastStart.side !== rep.side && Math.abs(rep.startedAt - lastStart.at) <= thresholds.SIMULTANEOUS_RAISE_WINDOW_MS;
      const rhythmIssue = lastCompletedSide === rep.side || simultaneousStart;
      const quality = evaluateSeatedKneeRaiseQuality({ ...rep, rhythmIssue }, thresholds);
      const record = { ...rep, repNumber: repRecords.length + 1, rhythmIssue, qualityValid: quality.valid, issues: quality.issues };
      repRecords.push(record);
      lastCompletedSide = rep.side;
      return record;
    });
    return { completedReps, summary: getSummary() };
  }

  function getSummary() {
    const issueCount = (issue) => repRecords.filter((r) => r.issues.includes(issue)).length;
    const leftReps = repRecords.filter((r) => r.side === "left").length;
    const rightReps = repRecords.filter((r) => r.side === "right").length;
    return {
      totalReps: repRecords.length,
      targetReps,
      leftReps,
      rightReps,
      validReps: repRecords.filter((r) => r.qualityValid).length,
      qualityValidReps: repRecords.filter((r) => r.qualityValid).length,
      insufficientRaiseCount: issueCount("insufficient_raise"),
      excessiveTrunkLeanCount: issueCount("excessive_trunk_lean"),
      rhythmIssueCount: issueCount("rhythm"),
      tooFastCount: issueCount("too_fast"),
      trackingInterruptionCount,
      repsWithTrackingGap: trackingInterruptionCount,
      averageMinHipAngle: repRecords.length ? Math.round(repRecords.reduce((sum, r) => sum + r.minHipAngle, 0) / repRecords.length) : null,
      averageRepDuration: repRecords.length ? Math.round(repRecords.reduce((sum, r) => sum + r.durationMs, 0) / repRecords.length) : null,
      leftState: left.getState(),
      rightState: right.getState(),
      repRecords: repRecords.slice(),
      completed: repRecords.length >= targetReps,
    };
  }

  function reset() {
    left = createLegTracker("left");
    right = createLegTracker("right");
    repRecords = [];
    lastCompletedSide = null;
    lastStart = { side: null, at: null };
    trackingInterruptionCount = 0;
    trackingInterrupted = false;
  }
  return { processFrame, getSummary, reset };
}
