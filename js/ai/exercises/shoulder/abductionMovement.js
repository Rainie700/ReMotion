import { computeShoulderMeasurementObservation, computeShoulderLateralOffsetRatio } from "./poseMath.js";
import { SHOULDER_CAMERA_THRESHOLDS } from "./constants.js";
import { SHOULDER_MEASUREMENT_SIGNAL } from "./measurementSession.js";

/**
 * ReMotion Phase 7.3B.2 — A01-2 Shoulder Abduction: real FRONT-VIEW
 * landmarks -> observation -> semantic SIGNAL adapter + per-side result
 * accumulator.
 *
 * Pure, DOM-free, camera-free, persistence-free, route-free, voice-free.
 *
 * *** DELIBERATELY NOT A COPY OF flexionMovement.js ***
 * The elevation LIFECYCLE (waiting -> movement -> endpoint hold -> return ->
 * complete) is the same *concept* and is fed to the same existing
 * createShoulderMeasurementSession() FSM, but this module is written for the
 * front view and abduction motion, with two concrete differences from the
 * flexion adapter:
 *
 *   1. PRIMARY PROGRESS ANGLE. Reuses computeShoulderElevationAngle() via
 *      computeShoulderMeasurementObservation() — the Phase 7.3B.2A locked
 *      contract makes calculateAngle(HIP, SHOULDER, ELBOW) the primary
 *      elevation angle for BOTH movements; the *camera view* is what makes
 *      it frontal-plane (abduction) here vs. sagittal-plane (flexion) there.
 *      Neutral ~= 0deg, rising as the arm elevates — no `180 - angle`.
 *
 *   2. MOVEMENT-START DIRECTION CORROBORATION (the real front-view
 *      difference). A start requires the elevation angle to have risen past
 *      its neutral baseline (same as flexion) AND the elbow to have moved
 *      OUTWARD from the torso by at least a small margin
 *      (computeShoulderLateralOffsetRatio) — a real-3D safeguard so a
 *      forward (flexion-shaped) raise done while front-facing, whose elbow
 *      barely changes image-x, is not mistaken for an abduction attempt. A
 *      large unambiguous elevation still starts on its own (fallback), so a
 *      lean build / imperfect camera angle can never hard-stall the flow.
 *      The margin is deliberately small: in a clean frontal projection the
 *      elevation delta is always the binding constraint, so this never
 *      *delays* a genuine lateral raise — it only rejects a rise with no
 *      outward component at all. endpoint / return / complete stay purely
 *      elevation-angle driven (the lateral ratio is non-monotonic toward
 *      overhead and must never gate those). The raw lateral ratio (neutral
 *      / at-peak / max-during) is recorded in the result either way.
 *
 * *** MEASUREMENT, NOT FINDING (A01 domain contract) ***
 * Raw numbers + engineering lifecycle/quality status only. No "abnormal",
 * "limited", "asymmetric", no `peak < 180 -> abnormal`, no left/right
 * cutoff. SHOULDER_ABDUCTION_MOTION_HEURISTICS are ENGINEERING
 * motion-detection heuristics ("did the arm visibly start moving out to the
 * side / settle at a top / come back down"), not clinical ROM thresholds
 * and not derived from any normative ROM source.
 */

export const SHOULDER_ABDUCTION_MOTION_HEURISTICS = {
  NEUTRAL_SAMPLE_MIN_FRAMES: 3,
  NEUTRAL_SAMPLE_WINDOW: 12,
  // Elevation-angle rise above the neutral baseline required for a start.
  MOVEMENT_START_DELTA_DEG: 12,
  // Front-view corroboration: the elbow's outward (lateral) offset ratio
  // must have grown by at least this SMALL margin from its neutral value —
  // enough to reject a rise with no outward component, small enough that in
  // a clean frontal projection the elevation delta above is always the
  // binding constraint (so a genuine lateral raise is never delayed).
  LATERAL_START_MIN_RATIO_DELTA: 0.06,
  // ...unless the elevation is already this far past baseline, in which case
  // the movement is unambiguous and starts without the lateral corroboration
  // (robustness against an unreliable lateral read; NOT a ROM value).
  STRONG_ELEVATION_DELTA_DEG: 28,
  ENDPOINT_STILL_EPSILON_DEG: 4,
  ENDPOINT_STILL_HOLD_MS: 500,
  RETURN_DROP_DEG: 20,
  ATTEMPT_COMPLETE_NEAR_NEUTRAL_DEG: 15,
  ATTEMPT_COMPLETE_CONFIRM_MS: 400,
  MAX_FRAME_GAP_MS: 1500,
  MIN_CORE_FRAME_RATIO_FOR_VALID: 0.5,
};

const INTERNAL_PHASE = {
  WAITING: "waiting",
  MOVING: "moving",
  ENDPOINT: "endpoint",
  RETURNING: "returning",
  COMPLETE: "complete",
};

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * createShoulderAbductionMeasurement({ side }) — one instance per side per
 * attempt-window. `side` is a SHOULDER_SIDE value; LEFT and RIGHT are always
 * separate instances and never averaged. processFrame() returns
 * { signal, phaseHint, observation } — `signal` (a SHOULDER_MEASUREMENT_SIGNAL
 * or null) is forwarded verbatim to createShoulderMeasurementSession()
 * .processFrame({ signal }). This module owns no FSM instance itself.
 */
export function createShoulderAbductionMeasurement({
  side,
  thresholds = SHOULDER_CAMERA_THRESHOLDS,
  heuristics = SHOULDER_ABDUCTION_MOTION_HEURISTICS,
} = {}) {
  let phase = INTERNAL_PHASE.WAITING;

  let neutralSamples = [];
  let neutralBaselineDeg = null;
  let neutralLateralSamples = [];
  let neutralLateralRatio = null;

  let peakDeg = null;
  let peakFrame = null; // { deg, timestampMs, elbowExtensionAngleDeg, lateralOffsetRatio, contralateralShoulderVisible }
  let maxLateralRatioDuringMovement = null;
  let startCorroboratedByOutwardMotion = null; // set at the frame the attempt starts

  let endpointStillSince = null;
  let nearNeutralSince = null;

  let frameCount = 0;
  let coreAvailableFrames = 0;
  let observationSampleCount = 0;
  let lastCoreTimestamp = null;

  let hadTrackingLoss = false;
  let elbowExtensionMinDeg = null;

  let startedAtMs = null;
  let endedAtMs = null;
  const lifecyclePhasesSeen = new Set([INTERNAL_PHASE.WAITING]);

  let explicitStopReason = null;

  function reset() {
    phase = INTERNAL_PHASE.WAITING;
    neutralSamples = [];
    neutralBaselineDeg = null;
    neutralLateralSamples = [];
    neutralLateralRatio = null;
    peakDeg = null;
    peakFrame = null;
    maxLateralRatioDuringMovement = null;
    startCorroboratedByOutwardMotion = null;
    endpointStillSince = null;
    nearNeutralSince = null;
    frameCount = 0;
    coreAvailableFrames = 0;
    observationSampleCount = 0;
    lastCoreTimestamp = null;
    hadTrackingLoss = false;
    elbowExtensionMinDeg = null;
    startedAtMs = null;
    endedAtMs = null;
    lifecyclePhasesSeen.clear();
    lifecyclePhasesSeen.add(INTERNAL_PHASE.WAITING);
    explicitStopReason = null;
  }

  function invalidateInProgress() {
    if (phase === INTERNAL_PHASE.WAITING || phase === INTERNAL_PHASE.COMPLETE) return;
    phase = INTERNAL_PHASE.WAITING;
    endpointStillSince = null;
    nearNeutralSince = null;
  }

  function noteElbow(observation) {
    if (observation.elbowValidityObservable && typeof observation.elbowExtensionAngle === "number") {
      if (elbowExtensionMinDeg == null || observation.elbowExtensionAngle < elbowExtensionMinDeg) {
        elbowExtensionMinDeg = observation.elbowExtensionAngle;
      }
    }
  }

  function updatePeak(angle, timestamp, observation, lateralRatio) {
    if (peakDeg == null || angle > peakDeg) {
      peakDeg = angle;
      peakFrame = {
        deg: angle,
        timestampMs: timestamp,
        elbowExtensionAngleDeg: observation.elbowValidityObservable ? observation.elbowExtensionAngle : null,
        lateralOffsetRatio: lateralRatio,
        contralateralShoulderVisible: observation.contralateralShoulderVisible === true,
      };
    }
  }

  function processFrame({ timestamp, landmarks, bodyReady } = {}) {
    const observation = computeShoulderMeasurementObservation(landmarks, side, thresholds);
    const lateralRatio = computeShoulderLateralOffsetRatio(landmarks, side, thresholds);

    if (phase === INTERNAL_PHASE.COMPLETE) {
      return { signal: null, phaseHint: phase, observation, lateralRatio };
    }

    frameCount += 1;
    observationSampleCount += 1;

    if (bodyReady === false) {
      hadTrackingLoss = true;
      invalidateInProgress();
      return { signal: null, phaseHint: phase, observation, lateralRatio };
    }

    if (!observation.coreAngleAvailable) {
      if (
        lastCoreTimestamp != null &&
        timestamp - lastCoreTimestamp > heuristics.MAX_FRAME_GAP_MS &&
        phase !== INTERNAL_PHASE.WAITING
      ) {
        hadTrackingLoss = true;
        invalidateInProgress();
      }
      return { signal: null, phaseHint: phase, observation, lateralRatio };
    }

    coreAvailableFrames += 1;
    lastCoreTimestamp = timestamp;
    const angle = observation.shoulderElevationAngle;
    noteElbow(observation);

    let signal = null;

    switch (phase) {
      case INTERNAL_PHASE.WAITING: {
        neutralSamples.push(angle);
        if (neutralSamples.length > heuristics.NEUTRAL_SAMPLE_WINDOW) neutralSamples.shift();
        if (neutralSamples.length >= heuristics.NEUTRAL_SAMPLE_MIN_FRAMES) {
          neutralBaselineDeg = median(neutralSamples);
        }
        if (lateralRatio != null) {
          neutralLateralSamples.push(lateralRatio);
          if (neutralLateralSamples.length > heuristics.NEUTRAL_SAMPLE_WINDOW) neutralLateralSamples.shift();
          if (neutralLateralSamples.length >= heuristics.NEUTRAL_SAMPLE_MIN_FRAMES) {
            neutralLateralRatio = median(neutralLateralSamples);
          }
        }

        if (neutralBaselineDeg == null) break;
        const elevationDelta = angle - neutralBaselineDeg;
        if (elevationDelta < heuristics.MOVEMENT_START_DELTA_DEG) break;

        // Front-view direction gate: an outward lateral move must accompany
        // the rise, unless the rise is already unambiguously large.
        const lateralBase = neutralLateralRatio != null ? neutralLateralRatio : 0;
        const lateralMovedOut =
          lateralRatio != null && lateralRatio - lateralBase >= heuristics.LATERAL_START_MIN_RATIO_DELTA;
        const elevationUnambiguous = elevationDelta >= heuristics.STRONG_ELEVATION_DELTA_DEG;
        if (!lateralMovedOut && !elevationUnambiguous) break;

        phase = INTERNAL_PHASE.MOVING;
        lifecyclePhasesSeen.add(phase);
        startedAtMs = startedAtMs == null ? timestamp : startedAtMs;
        startCorroboratedByOutwardMotion = lateralMovedOut;
        endpointStillSince = null;
        maxLateralRatioDuringMovement = lateralRatio != null ? lateralRatio : maxLateralRatioDuringMovement;
        updatePeak(angle, timestamp, observation, lateralRatio);
        signal = SHOULDER_MEASUREMENT_SIGNAL.MOVEMENT_DETECTED;
        break;
      }

      case INTERNAL_PHASE.MOVING: {
        if (lateralRatio != null && (maxLateralRatioDuringMovement == null || lateralRatio > maxLateralRatioDuringMovement)) {
          maxLateralRatioDuringMovement = lateralRatio;
        }
        if (peakDeg != null && angle > peakDeg) {
          updatePeak(angle, timestamp, observation, lateralRatio);
          endpointStillSince = null;
          break;
        }
        if (peakDeg != null && peakDeg - angle >= heuristics.RETURN_DROP_DEG) {
          phase = INTERNAL_PHASE.ENDPOINT;
          lifecyclePhasesSeen.add(phase);
          endpointStillSince = null;
          signal = SHOULDER_MEASUREMENT_SIGNAL.ENDPOINT_DETECTED;
          break;
        }
        if (peakDeg != null && angle >= peakDeg - heuristics.ENDPOINT_STILL_EPSILON_DEG) {
          if (endpointStillSince == null) {
            endpointStillSince = timestamp;
          } else if (timestamp - endpointStillSince >= heuristics.ENDPOINT_STILL_HOLD_MS) {
            phase = INTERNAL_PHASE.ENDPOINT;
            lifecyclePhasesSeen.add(phase);
            signal = SHOULDER_MEASUREMENT_SIGNAL.ENDPOINT_DETECTED;
          }
        } else {
          endpointStillSince = null;
        }
        break;
      }

      case INTERNAL_PHASE.ENDPOINT: {
        if (peakDeg != null && peakDeg - angle >= heuristics.RETURN_DROP_DEG) {
          phase = INTERNAL_PHASE.RETURNING;
          lifecyclePhasesSeen.add(phase);
          nearNeutralSince = null;
          signal = SHOULDER_MEASUREMENT_SIGNAL.RETURN_DETECTED;
        }
        break;
      }

      case INTERNAL_PHASE.RETURNING: {
        const baseline = neutralBaselineDeg != null ? neutralBaselineDeg : 0;
        if (angle <= baseline + heuristics.ATTEMPT_COMPLETE_NEAR_NEUTRAL_DEG) {
          if (nearNeutralSince == null) {
            nearNeutralSince = timestamp;
          } else if (timestamp - nearNeutralSince >= heuristics.ATTEMPT_COMPLETE_CONFIRM_MS) {
            phase = INTERNAL_PHASE.COMPLETE;
            lifecyclePhasesSeen.add(phase);
            endedAtMs = timestamp;
            signal = SHOULDER_MEASUREMENT_SIGNAL.ATTEMPT_COMPLETE;
          }
        } else {
          nearNeutralSince = null;
        }
        break;
      }

      default:
        break;
    }

    return { signal, phaseHint: phase, observation, lateralRatio };
  }

  function markStopped(reason = "userStopped", timestamp = null) {
    if (phase === INTERNAL_PHASE.COMPLETE) return;
    explicitStopReason = reason;
    if (timestamp != null) endedAtMs = timestamp;
  }

  function deriveStatus() {
    if (phase === INTERNAL_PHASE.COMPLETE) return { status: "completed", statusReason: null };
    if (explicitStopReason) {
      if (peakDeg != null) return { status: "stopped", statusReason: explicitStopReason };
      return { status: "invalid", statusReason: hadTrackingLoss ? "trackingLost" : "invalidPose" };
    }
    if (peakDeg == null) {
      return { status: "invalid", statusReason: hadTrackingLoss ? "trackingLost" : "invalidPose" };
    }
    return { status: "incomplete", statusReason: hadTrackingLoss ? "trackingLost" : null };
  }

  function getResult() {
    const { status, statusReason } = deriveStatus();
    const coreAvailableFrameRatio = frameCount > 0 ? coreAvailableFrames / frameCount : 0;
    const dataUsable =
      (status === "completed" || status === "stopped") &&
      peakDeg != null &&
      coreAvailableFrameRatio >= heuristics.MIN_CORE_FRAME_RATIO_FOR_VALID;

    let confidence;
    if (!dataUsable) confidence = "low";
    else if (coreAvailableFrameRatio >= 0.85 && !hadTrackingLoss) confidence = "high";
    else if (coreAvailableFrameRatio >= 0.6) confidence = "medium";
    else confidence = "low";

    const peakFromNeutral = peakDeg != null && neutralBaselineDeg != null ? peakDeg - neutralBaselineDeg : null;

    return {
      side,
      status,
      statusReason,
      completed: status === "completed",
      peakROM: {
        deg: peakDeg,
        fromNeutralDeg: peakFromNeutral,
        atTimestampMs: peakFrame ? peakFrame.timestampMs : null,
        elbowExtensionAngleAtPeakDeg: peakFrame ? peakFrame.elbowExtensionAngleDeg : null,
        contralateralShoulderVisibleAtPeak: peakFrame ? peakFrame.contralateralShoulderVisible : null,
      },
      neutralBaselineDeg,
      measurementQuality: {
        valid: dataUsable,
        confidence,
        coreAvailableFrameRatio,
        frameCount,
        coreAvailableFrames,
        hadTrackingLoss,
      },
      observations: {
        elbowFlexion: {
          available: (peakFrame && peakFrame.elbowExtensionAngleDeg != null) || elbowExtensionMinDeg != null,
          atPeakExtensionDeg: peakFrame ? peakFrame.elbowExtensionAngleDeg : null,
          minExtensionDuringMovementDeg: elbowExtensionMinDeg,
          note: "raw elbow angle (SHOULDER-ELBOW-WRIST); ~180 = straight. No clinical straightness threshold applied.",
        },
        // SUPPORTED for A01-2: the front-view outward-direction signal, raw.
        abductionDirection: {
          available: neutralLateralRatio != null || (peakFrame && peakFrame.lateralOffsetRatio != null),
          neutralLateralRatio,
          atPeakLateralRatio: peakFrame ? peakFrame.lateralOffsetRatio : null,
          maxLateralRatioDuringMovement,
          // informational: was the outward-motion corroboration (not the
          // strong-elevation fallback) what allowed the start.
          startCorroboratedByOutwardMotion,
          note: "raw |elbow.x - shoulder.x| / torso-length. Front-view outward-movement corroboration only; non-monotonic toward overhead; no clinical meaning.",
        },
        // NOT populated: not reliably observable from the A01-2 single
        // front-view camera / a later compensation phase.
        trunkExtension: { available: false, value: null, note: "not measured in A01-2; later phase" },
        trunkLateralLean: { available: false, value: null, note: "not reliably separable from arm motion in A01-2; later phase" },
        trunkRotation: { available: false, value: null, note: "not observable from a single front-view camera in A01-2" },
        shoulderElevationCompensation: { available: false, value: null, note: "shoulder-girdle elevation compensation not measured in A01-2; later phase" },
      },
      lifecyclePhasesSeen: [...lifecyclePhasesSeen],
      observationSampleCount,
      startedAtMs,
      endedAtMs,
    };
  }

  return { processFrame, markStopped, getResult, reset };
}
