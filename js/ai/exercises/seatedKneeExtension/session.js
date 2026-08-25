import { KN03_THRESHOLDS } from "./constants.js";
import { evaluateSeatedKneeExtensionQuality } from "./quality.js";

export const KN03_LEG_STATE = { NEUTRAL: "neutral", EXTENDING: "extending", TOP: "top", RETURNING: "returning" };

function createLegTracker(side) {
  let state = KN03_LEG_STATE.NEUTRAL;
  let startedAt = null;
  let lastValidAt = null;
  let maxKneeAngle = -Infinity;
  let maxTrunkLeanDeg = 0;
  let baselineHipAngle = null;
  let maxHipAngleDeviationDeg = 0;
  let topConfirm = 0;
  let neutralConfirm = 0;

  function reset() {
    state = KN03_LEG_STATE.NEUTRAL;
    startedAt = null;
    maxKneeAngle = -Infinity;
    maxTrunkLeanDeg = 0;
    baselineHipAngle = null;
    maxHipAngleDeviationDeg = 0;
    topConfirm = 0;
    neutralConfirm = 0;
  }

  function update(kneeAngle, hipAngle, trunkLeanDeg, timestamp, thresholds) {
    if (kneeAngle == null || !Number.isFinite(kneeAngle)) return { state, completed: null, started: false };
    if (lastValidAt != null && state !== KN03_LEG_STATE.NEUTRAL && timestamp - lastValidAt > thresholds.MAX_FRAME_GAP_MS) reset();
    lastValidAt = timestamp;
    let started = false;
    let completed = null;
    if (state === KN03_LEG_STATE.NEUTRAL && kneeAngle >= thresholds.REP_START_KNEE_ANGLE_MIN_DEG) {
      state = KN03_LEG_STATE.EXTENDING;
      startedAt = timestamp;
      maxKneeAngle = kneeAngle;
      maxTrunkLeanDeg = trunkLeanDeg ?? 0;
      baselineHipAngle = hipAngle;
      started = true;
    } else if (state !== KN03_LEG_STATE.NEUTRAL) {
      maxKneeAngle = Math.max(maxKneeAngle, kneeAngle);
      if (trunkLeanDeg != null) maxTrunkLeanDeg = Math.max(maxTrunkLeanDeg, trunkLeanDeg);
      if (hipAngle != null && baselineHipAngle != null) maxHipAngleDeviationDeg = Math.max(maxHipAngleDeviationDeg, Math.abs(hipAngle - baselineHipAngle));
      if (state === KN03_LEG_STATE.EXTENDING) {
        if (kneeAngle >= thresholds.CANDIDATE_TOP_KNEE_ANGLE_MIN_DEG) {
          topConfirm += 1;
          if (topConfirm >= thresholds.TOP_CONFIRM_FRAMES) state = KN03_LEG_STATE.TOP;
        } else topConfirm = 0;
      } else if (state === KN03_LEG_STATE.TOP && kneeAngle < thresholds.CANDIDATE_TOP_KNEE_ANGLE_MIN_DEG) {
        state = KN03_LEG_STATE.RETURNING;
      } else if (state === KN03_LEG_STATE.RETURNING) {
        if (kneeAngle >= thresholds.CANDIDATE_TOP_KNEE_ANGLE_MIN_DEG) {
          state = KN03_LEG_STATE.TOP;
          neutralConfirm = 0;
        } else if (kneeAngle <= thresholds.NEUTRAL_KNEE_ANGLE_MAX_DEG) {
          neutralConfirm += 1;
          if (neutralConfirm >= thresholds.NEUTRAL_CONFIRM_FRAMES) {
            const durationMs = timestamp - startedAt;
            if (durationMs >= thresholds.MIN_REP_DURATION_MS && durationMs <= thresholds.MAX_REP_DURATION_MS) {
              completed = { side, startedAt, completedAt: timestamp, durationMs, maxKneeAngle, maxTrunkLeanDeg, maxHipAngleDeviationDeg };
            }
            reset();
          }
        } else neutralConfirm = 0;
      }
    }
    return { state, completed, started };
  }
  return { update, getState: () => state };
}

export function createSeatedKneeExtensionSession(config = {}) {
  const thresholds = config.thresholds || KN03_THRESHOLDS;
  const targetReps = Math.max(1, Number(config.targetReps) || 10);
  let left = createLegTracker("left");
  let right = createLegTracker("right");
  let repRecords = [];
  let lastCompletedSide = null;
  let lastStart = { side: null, at: null };
  let trackingInterruptionCount = 0;
  let trackingInterrupted = false;

  function getSummary() {
    const issueCount = (issue) => repRecords.filter((r) => r.issues.includes(issue)).length;
    const avg = (field) => repRecords.length ? Math.round(repRecords.reduce((sum, r) => sum + r[field], 0) / repRecords.length) : null;
    return {
      totalReps: repRecords.length,
      targetReps,
      leftReps: repRecords.filter((r) => r.side === "left").length,
      rightReps: repRecords.filter((r) => r.side === "right").length,
      validReps: repRecords.filter((r) => r.qualityValid).length,
      qualityValidReps: repRecords.filter((r) => r.qualityValid).length,
      insufficientExtensionCount: issueCount("insufficient_extension"),
      excessiveTrunkLeanCount: issueCount("excessive_trunk_lean"),
      thighLiftCount: issueCount("thigh_lift"),
      rhythmIssueCount: issueCount("rhythm"),
      tooFastCount: issueCount("too_fast"),
      trackingInterruptionCount,
      repsWithTrackingGap: trackingInterruptionCount,
      averageMaxKneeAngle: avg("maxKneeAngle"),
      averageRepDuration: avg("durationMs"),
      leftState: left.getState(),
      rightState: right.getState(),
      repRecords: repRecords.slice(),
      completed: repRecords.length >= targetReps,
    };
  }

  function processFrame({ timestamp, leftKneeAngle, rightKneeAngle, leftHipAngle, rightHipAngle, trunkLeanDeg, bodyReady }) {
    if (!bodyReady) {
      const active = left.getState() !== KN03_LEG_STATE.NEUTRAL || right.getState() !== KN03_LEG_STATE.NEUTRAL;
      if (active && !trackingInterrupted) trackingInterruptionCount += 1;
      trackingInterrupted = true;
      return { completedReps: [], summary: getSummary() };
    }
    trackingInterrupted = false;
    const leftResult = left.update(leftKneeAngle, leftHipAngle, trunkLeanDeg, timestamp, thresholds);
    const rightResult = right.update(rightKneeAngle, rightHipAngle, trunkLeanDeg, timestamp, thresholds);
    const started = [];
    if (leftResult.started) started.push("left");
    if (rightResult.started) started.push("right");
    for (const side of started) lastStart = { side, at: timestamp };
    const completedReps = [leftResult.completed, rightResult.completed].filter(Boolean).map((rep) => {
      const simultaneousStart = lastStart.at != null && lastStart.side !== rep.side && Math.abs(rep.startedAt - lastStart.at) <= thresholds.SIMULTANEOUS_EXTENSION_WINDOW_MS;
      const rhythmIssue = lastCompletedSide === rep.side || simultaneousStart;
      const quality = evaluateSeatedKneeExtensionQuality({ ...rep, rhythmIssue }, thresholds);
      const record = { ...rep, repNumber: repRecords.length + 1, rhythmIssue, qualityValid: quality.valid, issues: quality.issues };
      repRecords.push(record);
      lastCompletedSide = rep.side;
      return record;
    });
    return { completedReps, summary: getSummary() };
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
