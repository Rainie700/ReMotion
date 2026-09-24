import { SQUAT_THRESHOLDS } from "./squatConstants.js";
import { evaluateSquatQuality, SQUAT_QUALITY_ISSUE, TRACKING_RELIABILITY } from "./squatQuality.js";

/**
 * Pure, DOM-free squat rep counter/state machine (standing -> descending ->
 * bottom -> ascending -> standing). Kept in its own module (no camera/canvas
 * code) so it can be unit tested directly in Node.
 *
 * Phase 5.3 — three distinct concepts, on purpose (see the Phase 5.3 report
 * section "Rep / Attempt / Quality"):
 *   - "movement attempt": the patient dipped below STANDING_KNEE_ANGLE at
 *     all (tracked internally via repStartAt, not separately counted).
 *   - "completed rep": an attempt that also cleared MIN_REP_DURATION_MS on
 *     the way back to standing — regardless of how deep it went. This is
 *     what repCounter/getCompletedCount() count, same as before Phase 5.3.
 *   - "quality-valid rep": a completed rep that ALSO cleared the current
 *     depth/trunk/valgus quality bar (js/ai/squatQuality.js). Previously a
 *     rep that never reached "bottom" wasn't even a completed rep — it
 *     vanished with zero record, which real-device testing showed as a
 *     confusing "0 reps" after several genuine shallow attempts. Now it
 *     completes (the cycle genuinely happened) but is correctly flagged
 *     quality-invalid instead of being silently discarded.
 */
export function createSquatSession(targetReps, thresholds = SQUAT_THRESHOLDS) {
  let state = "standing"; // standing | descending | bottom | ascending
  let repStartAt = null;
  let repMin = Infinity;
  let repMax = -Infinity;
  let repTrunkLean = false;
  let repKneeValgus = false;
  let repHadTrackingGap = false;
  // Phase 5.4.2 — see STANDING_CONFIRM_FRAMES in squatConstants.js: counts
  // consecutive valid frames read at/above STANDING_KNEE_ANGLE while
  // descending/ascending, so a single noisy frame can't complete a rep.
  let standingConfirmCount = 0;
  const reps = [];
  let repCounter = 0;
  let lastFrameAt = null;

  function beginRepTracking(angle, timestamp, trunkLeanDeg, kneeValgusSuspected) {
    repStartAt = timestamp;
    repMin = angle;
    repMax = angle;
    repTrunkLean = trunkLeanDeg != null && trunkLeanDeg > thresholds.TRUNK_LEAN_MAX_DEG;
    repKneeValgus = !!kneeValgusSuspected;
    repHadTrackingGap = false;
    standingConfirmCount = 0;
  }

  function trackRepExtremes(angle, trunkLeanDeg, kneeValgusSuspected) {
    if (angle < repMin) repMin = angle;
    if (angle > repMax) repMax = angle;
    if (trunkLeanDeg != null && trunkLeanDeg > thresholds.TRUNK_LEAN_MAX_DEG) repTrunkLean = true;
    if (kneeValgusSuspected) repKneeValgus = true;
  }

  /** Builds + records a completed rep from the current tracked extremes, or returns null if it doesn't clear the jitter-filter duration gate. */
  function finishRep(timestamp) {
    const durationMs = repStartAt != null ? timestamp - repStartAt : 0;
    if (durationMs < thresholds.MIN_REP_DURATION_MS) return null;
    repCounter += 1;
    const quality = evaluateSquatQuality(
      { minKneeAngle: repMin, trunkLeanDetected: repTrunkLean, kneeValgusSuspected: repKneeValgus, hadTrackingGap: repHadTrackingGap },
      thresholds
    );
    const completedRep = {
      repNumber: repCounter,
      startedAt: repStartAt,
      completedAt: timestamp,
      durationMs,
      minKneeAngle: repMin,
      maxKneeAngle: repMax,
      depthStatus: quality.issues.includes(SQUAT_QUALITY_ISSUE.INSUFFICIENT_DEPTH) ? "insufficient" : "ok",
      trunkLeanDetected: repTrunkLean,
      kneeValgusSuspected: repKneeValgus,
      qualityValid: quality.valid,
      qualityIssues: quality.issues,
      trackingReliability: quality.reliability,
    };
    reps.push(completedRep);
    return completedRep;
  }

  /**
   * Feeds one frame's measurements in. Returns { repCompleted, completedRep,
   * state }. Frames with no reliable angle (avgKneeAngle null/NaN) are
   * ignored entirely rather than treated as a 0-degree reading.
   */
  function processFrame({ avgKneeAngle, trunkLeanDeg = null, kneeValgusSuspected = false, timestamp }) {
    if (avgKneeAngle == null || Number.isNaN(avgKneeAngle)) {
      return { repCompleted: false, completedRep: null, state };
    }

    if (lastFrameAt != null && state !== "standing") {
      const gap = timestamp - lastFrameAt;
      if (gap > thresholds.MAX_FRAME_GAP_MS) {
        // Phase 5.2 — tracking was lost for a while mid-rep (e.g. the
        // patient walked out of frame and back). Resuming a stale
        // in-progress rep after such a gap risks completing a rep the
        // patient never actually finished — discard it and re-evaluate this
        // frame from a clean "standing" baseline instead of trusting the
        // old repStartAt/extremes.
        state = "standing";
        repStartAt = null;
        standingConfirmCount = 0;
      } else if (gap > thresholds.DETECTION_GRACE_MS) {
        // Phase 5.3 — notable but not disqualifying: tracking wasn't fully
        // continuous during this rep. This never changes rep validity or
        // counting, only the "trackingReliability" flag attached to the
        // eventual completedRep (see js/ai/squatQuality.js) — a gap is
        // evidence the camera didn't see everything, not evidence the
        // movement itself was wrong.
        repHadTrackingGap = true;
      }
    }
    lastFrameAt = timestamp;

    let repCompleted = false;
    let completedRep = null;

    switch (state) {
      case "standing":
        if (avgKneeAngle < thresholds.STANDING_KNEE_ANGLE) {
          state = "descending";
          beginRepTracking(avgKneeAngle, timestamp, trunkLeanDeg, kneeValgusSuspected);
        }
        break;

      case "descending":
        trackRepExtremes(avgKneeAngle, trunkLeanDeg, kneeValgusSuspected);
        if (avgKneeAngle <= thresholds.DOWN_KNEE_ANGLE) {
          state = "bottom";
          standingConfirmCount = 0;
        } else if (avgKneeAngle >= thresholds.STANDING_KNEE_ANGLE) {
          // Phase 5.4.2 — require STANDING_CONFIRM_FRAMES consecutive
          // readings before treating this as a genuine return to standing
          // (see squatConstants.js) — a single noisy frame no longer
          // completes anything on its own.
          standingConfirmCount += 1;
          if (standingConfirmCount >= thresholds.STANDING_CONFIRM_FRAMES) {
            // Phase 5.3 — returned to standing without ever reaching
            // "bottom". Previously this silently discarded the attempt
            // entirely. It's now still a genuine completed rep (a real
            // down-up cycle happened) — finishRep()'s quality evaluation is
            // what correctly flags the insufficient depth, not the absence
            // of a record.
            const shallow = finishRep(timestamp);
            if (shallow) {
              completedRep = shallow;
              repCompleted = true;
            }
            state = "standing";
            repStartAt = null;
            standingConfirmCount = 0;
          }
        } else {
          standingConfirmCount = 0;
        }
        break;

      case "bottom":
        trackRepExtremes(avgKneeAngle, trunkLeanDeg, kneeValgusSuspected);
        if (avgKneeAngle > thresholds.DOWN_KNEE_ANGLE) {
          state = "ascending";
        }
        break;

      case "ascending":
        trackRepExtremes(avgKneeAngle, trunkLeanDeg, kneeValgusSuspected);
        if (avgKneeAngle <= thresholds.DOWN_KNEE_ANGLE) {
          // Dipped back down before fully standing — still the same rep.
          state = "bottom";
          standingConfirmCount = 0;
        } else if (avgKneeAngle >= thresholds.STANDING_KNEE_ANGLE) {
          standingConfirmCount += 1;
          if (standingConfirmCount >= thresholds.STANDING_CONFIRM_FRAMES) {
            const full = finishRep(timestamp);
            if (full) {
              completedRep = full;
              repCompleted = true;
            }
            state = "standing";
            repStartAt = null;
            standingConfirmCount = 0;
          }
        } else {
          standingConfirmCount = 0;
        }
        break;

      default:
        state = "standing";
    }

    return { repCompleted, completedRep, state };
  }

  function getReps() {
    return reps.slice();
  }

  function getState() {
    return state;
  }

  function getCompletedCount() {
    return reps.length;
  }

  function getSummary() {
    const totalReps = reps.length;
    const qualityValidReps = reps.filter((r) => r.qualityValid).length;
    const insufficientDepthCount = reps.filter((r) => r.depthStatus === "insufficient").length;
    const trunkLeanCount = reps.filter((r) => r.trunkLeanDetected).length;
    const kneeValgusCount = reps.filter((r) => r.kneeValgusSuspected).length;
    const repsWithTrackingGap = reps.filter((r) => r.trackingReliability === TRACKING_RELIABILITY.PARTIAL).length;
    const averageMinKneeAngle = totalReps
      ? reps.reduce((sum, r) => sum + r.minKneeAngle, 0) / totalReps
      : null;
    const averageRepDuration = totalReps
      ? reps.reduce((sum, r) => sum + r.durationMs, 0) / totalReps
      : null;
    return {
      totalReps,
      targetReps,
      // Phase 5.3 — validReps now genuinely means "cleared the current
      // prototype quality bar" (depth + trunk + valgus). Before Phase 5.3
      // this was a no-op alias of totalReps; every caller that reads it was
      // already treating it as "reps that count", so redefining it to be
      // meaningful is a pure bugfix, not a schema change.
      validReps: qualityValidReps,
      qualityValidReps,
      insufficientDepthCount,
      trunkLeanCount,
      kneeValgusCount,
      repsWithTrackingGap,
      averageMinKneeAngle,
      averageRepDuration,
      repRecords: reps.slice(),
    };
  }

  return { processFrame, getReps, getState, getCompletedCount, getSummary };
}
