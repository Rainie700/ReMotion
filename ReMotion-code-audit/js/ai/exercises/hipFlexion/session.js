import { HP02_ENGINEERING_DEFAULTS } from "./constants.js";

/**
 * ReMotion Phase 5.6.2 — HP02 (站姿髖屈曲) rep FSM + session tracker.
 *
 * Pure, DOM-free (unit-testable in Node), modeled on squatSession.js's
 * mechanism (threshold-crossing state machine + debounce + duration gate +
 * frame-gap dropout protection) but NOT a copy of it and NOT sharing any
 * code with it — see Phase 5.6.0 report section 6/10 for why abstracting a
 * shared FSM is still premature with only one prior real case (squat).
 *
 * The one structural difference squat never had to handle: HP02 is
 * unilateral and alternates sides, so this tracks TWO fully independent
 * FSM instances (left/right) rather than one bilateral-average tracker.
 * Nothing about the left side's state/timing/counting can ever affect the
 * right side, or vice versa — see Phase 5.6.2 report section 5.
 *
 * *** ENGINEERING PROTOTYPE — rep-completion semantics ("did a deliberate
 * raise-and-lower cycle happen") only. No quality grading, no clinical ROM
 * validation, no ties to rehabExercises.js's correct_angle/angle_tolerance
 * text. See constants.js for the full threshold-provenance disclaimer. ***
 */

const LEG_STATE = {
  NEUTRAL: "neutral",
  RAISING: "raising",
  TOP: "top",
  LOWERING: "lowering",
};

function createLegTracker() {
  let state = LEG_STATE.NEUTRAL;
  let repStartAt = null;
  let lastValidAt = null;
  let minAngleThisRep = Infinity;
  let maxAngleThisRep = -Infinity;
  let neutralConfirmCount = 0;
  let topReachedAt = null;
  let hadTrackingGap = false;
  const reps = [];

  function resetInProgress() {
    state = LEG_STATE.NEUTRAL;
    repStartAt = null;
    minAngleThisRep = Infinity;
    maxAngleThisRep = -Infinity;
    neutralConfirmCount = 0;
    topReachedAt = null;
    hadTrackingGap = false;
  }

  function beginAttempt(angle, timestamp) {
    state = LEG_STATE.RAISING;
    repStartAt = timestamp;
    minAngleThisRep = angle;
    maxAngleThisRep = angle;
    neutralConfirmCount = 0;
    topReachedAt = null;
    hadTrackingGap = false;
  }

  function trackExtremes(angle) {
    if (angle < minAngleThisRep) minAngleThisRep = angle;
    if (angle > maxAngleThisRep) maxAngleThisRep = angle;
  }

  /**
   * Feed one frame's hip flexion angle for this leg. `angle` may be null
   * (landmarks unreliable this frame) — the caller (processFrame below)
   * already decides whether to call this at all based on bodyReady, but a
   * null angle mid-rep is still handled safely here (frame-gap tracking
   * only, no state transition on a null reading).
   */
  function update(angle, timestamp, thresholds) {
    if (angle == null || Number.isNaN(angle)) {
      // No reliable reading this frame. If mid-rep, the frame-gap check
      // below (on the NEXT valid frame) is what actually discards a stale
      // attempt — this branch just declines to advance state on garbage
      // data, matching squatSession.js's "frames with no reliable angle
      // are ignored entirely" convention.
      return { repCompleted: false, completedRep: null, state };
    }

    if (lastValidAt != null && state !== LEG_STATE.NEUTRAL) {
      const gap = timestamp - lastValidAt;
      if (gap > thresholds.MAX_FRAME_GAP_MS) {
        // Tracking was lost for a while mid-rep (e.g. stepped out of
        // frame). Discard the in-progress attempt rather than resuming a
        // stale one — same protective reasoning as squatSession.js's
        // MAX_FRAME_GAP_MS handling (report section 14).
        resetInProgress();
      }
    }
    lastValidAt = timestamp;

    let repCompleted = false;
    let completedRep = null;

    switch (state) {
      case LEG_STATE.NEUTRAL:
        if (angle < thresholds.NEUTRAL_ANGLE_MIN_DEG) {
          beginAttempt(angle, timestamp);
        }
        break;

      case LEG_STATE.RAISING:
        trackExtremes(angle);
        if (angle <= thresholds.CANDIDATE_TOP_ANGLE_MAX_DEG) {
          state = LEG_STATE.TOP;
          topReachedAt = timestamp;
        } else if (angle >= thresholds.NEUTRAL_ANGLE_MIN_DEG) {
          neutralConfirmCount += 1;
          if (neutralConfirmCount >= thresholds.NEUTRAL_CONFIRM_FRAMES) {
            // Drifted back to neutral without ever reaching a candidate
            // top -- a shallow twitch, not a deliberate rep. Discarded,
            // never counted (report section 6: "避免... 站立jitter+1").
            resetInProgress();
          }
        } else {
          neutralConfirmCount = 0;
        }
        break;

      case LEG_STATE.TOP:
        trackExtremes(angle);
        if (angle > thresholds.CANDIDATE_TOP_ANGLE_MAX_DEG) {
          state = LEG_STATE.LOWERING;
        }
        break;

      case LEG_STATE.LOWERING:
        trackExtremes(angle);
        if (angle <= thresholds.CANDIDATE_TOP_ANGLE_MAX_DEG) {
          // Dipped back down before fully returning to neutral -- still
          // the same attempt, same top dwell window.
          state = LEG_STATE.TOP;
          neutralConfirmCount = 0;
        } else if (angle >= thresholds.NEUTRAL_ANGLE_MIN_DEG) {
          neutralConfirmCount += 1;
          if (neutralConfirmCount >= thresholds.NEUTRAL_CONFIRM_FRAMES) {
            const durationMs = timestamp - repStartAt;
            if (durationMs >= thresholds.MIN_REP_DURATION_MS) {
              const rep = {
                repNumber: reps.length + 1,
                startedAt: repStartAt,
                completedAt: timestamp,
                durationMs,
                minAngle: minAngleThisRep,
                maxAngle: maxAngleThisRep,
                topDwellMs: topReachedAt != null ? timestamp - topReachedAt : null,
                hadTrackingGap,
              };
              reps.push(rep);
              completedRep = rep;
              repCompleted = true;
            }
            // Too-fast attempts are silently discarded either way (report
            // section 6: engineering debounce, not a clinical judgment).
            resetInProgress();
          }
        } else {
          neutralConfirmCount = 0;
        }
        break;

      default:
        state = LEG_STATE.NEUTRAL;
    }

    return { repCompleted, completedRep, state };
  }

  function getCompletedCount() {
    return reps.length;
  }

  function getLastRepDurationMs() {
    return reps.length ? reps[reps.length - 1].durationMs : null;
  }

  function getReps() {
    return reps.slice();
  }

  function getState() {
    return state;
  }

  return { update, getCompletedCount, getLastRepDurationMs, getReps, getState };
}

/**
 * config: { thresholds } — thresholds defaults to HP02_ENGINEERING_DEFAULTS
 * (prototype-only, see constants.js). Deliberately NO targetReps/target-
 * per-side parameter here — left/right target semantics are explicitly
 * unresolved this phase (report section 9); this module only counts, it
 * never decides when a session is "done".
 */
export function createHipFlexionSession(config = {}) {
  const thresholds = config.thresholds || HP02_ENGINEERING_DEFAULTS;
  let left = createLegTracker();
  let right = createLegTracker();
  // Session-wide (not per-rep) observed angle range per side, for
  // real-device calibration reference only (report section 16) -- never
  // used to derive or claim a clinical threshold.
  let leftObservedMin = Infinity, leftObservedMax = -Infinity;
  let rightObservedMin = Infinity, rightObservedMax = -Infinity;

  function processFrame({ timestamp, leftHipAngle, rightHipAngle, bodyReady }) {
    if (!bodyReady) {
      return { left: { repCompleted: false, completedRep: null, state: left.getState() }, right: { repCompleted: false, completedRep: null, state: right.getState() } };
    }
    if (leftHipAngle != null && !Number.isNaN(leftHipAngle)) {
      if (leftHipAngle < leftObservedMin) leftObservedMin = leftHipAngle;
      if (leftHipAngle > leftObservedMax) leftObservedMax = leftHipAngle;
    }
    if (rightHipAngle != null && !Number.isNaN(rightHipAngle)) {
      if (rightHipAngle < rightObservedMin) rightObservedMin = rightHipAngle;
      if (rightHipAngle > rightObservedMax) rightObservedMax = rightHipAngle;
    }
    const leftResult = left.update(leftHipAngle, timestamp, thresholds);
    const rightResult = right.update(rightHipAngle, timestamp, thresholds);
    return { left: leftResult, right: rightResult };
  }

  function getSummary() {
    const leftCompleted = left.getCompletedCount();
    const rightCompleted = right.getCompletedCount();
    return {
      left: {
        completedReps: leftCompleted,
        lastRepDurationMs: left.getLastRepDurationMs(),
        reps: left.getReps(),
        state: left.getState(),
        observedAngleRange: leftObservedMin <= leftObservedMax ? { min: leftObservedMin, max: leftObservedMax } : null,
      },
      right: {
        completedReps: rightCompleted,
        lastRepDurationMs: right.getLastRepDurationMs(),
        reps: right.getReps(),
        state: right.getState(),
        observedAngleRange: rightObservedMin <= rightObservedMax ? { min: rightObservedMin, max: rightObservedMax } : null,
      },
      // Engineering statistic only -- NOT a completion/target signal. See
      // Phase 5.6.2 report section 8: HP02's target is "each side
      // N times", not "N total", so this must never be compared against a
      // single pooled target the way squat's totalReps is.
      totalReps: leftCompleted + rightCompleted,
    };
  }

  function reset() {
    left = createLegTracker();
    right = createLegTracker();
    leftObservedMin = Infinity; leftObservedMax = -Infinity;
    rightObservedMin = Infinity; rightObservedMax = -Infinity;
  }

  return { processFrame, getSummary, reset };
}
