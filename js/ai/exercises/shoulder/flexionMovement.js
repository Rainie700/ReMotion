import { computeShoulderMeasurementObservation } from "./poseMath.js";
import { SHOULDER_CAMERA_THRESHOLDS } from "./constants.js";
import { SHOULDER_MEASUREMENT_SIGNAL } from "./measurementSession.js";

/**
 * ReMotion Phase 7.3B.2 — A01-1 Shoulder Flexion: real landmarks -> observation
 * -> semantic SIGNAL adapter + per-side measurement-result accumulator.
 *
 * Pure, DOM-free, camera-free, persistence-free, route-free, voice-free.
 * Unit-testable in Node. This is the missing middle layer of the pipeline the
 * existing modules already anticipate:
 *
 *   MediaPipe landmarks
 *        -> computeShoulderMeasurementObservation()   (shoulder/poseMath.js, pure geometry — REUSED, not reimplemented)
 *        -> THIS MODULE: movement-state interpretation -> one SHOULDER_MEASUREMENT_SIGNAL per frame (or null)
 *        -> createShoulderMeasurementSession() FSM     (measurementSession.js, unchanged — still the single lifecycle FSM)
 *        -> getResult(): structured A01-1 side result  (consumed later by the Shoulder Report)
 *
 * *** MEASUREMENT, NOT FINDING (A01-1 domain contract §6) ***
 * Everything here produces raw numbers + engineering lifecycle/quality status.
 * It NEVER concludes "abnormal ROM", "limited", "asymmetric", "frozen
 * shoulder", or any disease probability. There is no `peakROM < 180 -> abnormal`
 * rule and no left/right-difference cutoff anywhere in this file. Deciding
 * whether a value is clinically meaningful is a separate, later, approved
 * Finding step.
 *
 * *** THRESHOLD PROVENANCE ***
 * SHOULDER_FLEXION_MOTION_HEURISTICS below are ENGINEERING motion-detection
 * heuristics only: "did the arm visibly start moving / momentarily settle at a
 * top / come back down", expressed relative to a per-attempt neutral baseline.
 * They are NOT clinical ROM thresholds, NOT normal/abnormal boundaries, and NOT
 * derived from any domain ROM source (A01-5 normative values, AAOS 180°, etc.).
 * They exist solely so the existing angle-agnostic lifecycle FSM can advance on
 * a real signal instead of the Phase 7.3B.1 `signal:null` placeholder. A future
 * real-device calibration phase (7.3B.2C) is expected to replace these with
 * measured values; nothing here should ever be read as a measurement result.
 */

export const SHOULDER_FLEXION_MOTION_HEURISTICS = {
  // How many core-available frames are averaged (median) into the per-attempt
  // "arm hanging at rest" neutral baseline before movement detection is armed.
  NEUTRAL_SAMPLE_MIN_FRAMES: 3,
  // Most recent core-available samples kept for the rolling neutral-baseline
  // median while still WAITING (bounds memory; not a timing/clinical value).
  NEUTRAL_SAMPLE_WINDOW: 12,
  // Rise (deg) of the shoulder-elevation angle above the neutral baseline that
  // counts as "a movement attempt has begun". Deliberately generous.
  MOVEMENT_START_DELTA_DEG: 12,
  // While climbing: a frame whose angle is within this margin (deg) of the
  // running peak counts as "no longer climbing" (candidate top).
  ENDPOINT_STILL_EPSILON_DEG: 4,
  // Candidate-top must persist this long (ms) before the top is treated as an
  // endpoint. UX/engineering dwell, not a clinical hold requirement.
  ENDPOINT_STILL_HOLD_MS: 500,
  // A fall (deg) from the running peak large enough to treat the arm as
  // "coming back down" even if no still-hold was ever observed (fast rep).
  RETURN_DROP_DEG: 20,
  // While returning: angle within this margin (deg) of the neutral baseline
  // counts as "back to the start".
  ATTEMPT_COMPLETE_NEAR_NEUTRAL_DEG: 15,
  // Near-neutral must persist this long (ms) before the attempt is complete.
  ATTEMPT_COMPLETE_CONFIRM_MS: 400,
  // Gap (ms) between consecutive core-available frames beyond which an
  // in-progress attempt is discarded rather than resumed from stale state.
  // Same magnitude/role as SQUAT_THRESHOLDS.MAX_FRAME_GAP_MS (kept as its own
  // constant since the two live in independent modules).
  MAX_FRAME_GAP_MS: 1500,
  // Below this fraction of frames having a usable core angle, a non-completed
  // attempt is reported as data-invalid rather than merely incomplete.
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
 * createShoulderFlexionMeasurement({ side }) — one instance per side per
 * attempt-window. `side` is a SHOULDER_SIDE value ("LEFT" | "RIGHT"); LEFT and
 * RIGHT are always measured by separate instances and never averaged (A01-1
 * contract). `thresholds` gates landmark reliability (generic MIN_VISIBILITY,
 * a tracking-confidence concept) exactly as every other shoulder geometry call
 * does; `heuristics` are the engineering motion-detection constants above.
 *
 * processFrame() returns { signal, phaseHint, observation } — `signal` is one
 * of SHOULDER_MEASUREMENT_SIGNAL or null, to be forwarded verbatim to the
 * existing createShoulderMeasurementSession().processFrame({ signal }). This
 * module holds NO createShoulderMeasurementSession instance itself — app.js
 * still owns exactly one lifecycle FSM reference.
 */
export function createShoulderFlexionMeasurement({
  side,
  thresholds = SHOULDER_CAMERA_THRESHOLDS,
  heuristics = SHOULDER_FLEXION_MOTION_HEURISTICS,
} = {}) {
  let phase = INTERNAL_PHASE.WAITING;

  let neutralSamples = [];
  let neutralBaselineDeg = null;

  let peakDeg = null;
  let peakFrame = null; // { deg, timestampMs, elbowExtensionAngleDeg, contralateralShoulderVisible }

  let endpointStillSince = null;
  let nearNeutralSince = null;

  let frameCount = 0;
  let coreAvailableFrames = 0;
  let observationSampleCount = 0;
  let lastCoreTimestamp = null;

  let hadTrackingLoss = false;
  let elbowExtensionMinDeg = null; // smallest SHOULDER-ELBOW-WRIST angle seen while moving (raw; smaller = more elbow bend)

  let startedAtMs = null;
  let endedAtMs = null;
  const lifecyclePhasesSeen = new Set([INTERNAL_PHASE.WAITING]);

  let explicitStopReason = null; // "userStopped" (set by markStopped)

  function reset() {
    phase = INTERNAL_PHASE.WAITING;
    neutralSamples = [];
    neutralBaselineDeg = null;
    peakDeg = null;
    peakFrame = null;
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

  /** Discards any in-progress attempt back to WAITING (mirrors the FSM's own bodyReady:false policy). Keeps the best peak seen so far for best-effort reporting. */
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

  function updatePeak(angle, timestamp, observation) {
    if (peakDeg == null || angle > peakDeg) {
      peakDeg = angle;
      peakFrame = {
        deg: angle,
        timestampMs: timestamp,
        elbowExtensionAngleDeg: observation.elbowValidityObservable ? observation.elbowExtensionAngle : null,
        contralateralShoulderVisible: observation.contralateralShoulderVisible === true,
      };
    }
  }

  function processFrame({ timestamp, landmarks, bodyReady } = {}) {
    const observation = computeShoulderMeasurementObservation(landmarks, side, thresholds);

    // Frames after the attempt has completed are outside the measurement
    // window — they are not counted toward frame/coverage statistics.
    if (phase === INTERNAL_PHASE.COMPLETE) {
      return { signal: null, phaseHint: phase, observation };
    }

    frameCount += 1;
    observationSampleCount += 1;

    if (bodyReady === false) {
      hadTrackingLoss = true;
      invalidateInProgress();
      return { signal: null, phaseHint: phase, observation };
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
      return { signal: null, phaseHint: phase, observation };
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
        if (neutralBaselineDeg != null && angle >= neutralBaselineDeg + heuristics.MOVEMENT_START_DELTA_DEG) {
          phase = INTERNAL_PHASE.MOVING;
          lifecyclePhasesSeen.add(phase);
          startedAtMs = startedAtMs == null ? timestamp : startedAtMs;
          endpointStillSince = null;
          updatePeak(angle, timestamp, observation);
          signal = SHOULDER_MEASUREMENT_SIGNAL.MOVEMENT_DETECTED;
        }
        break;
      }

      case INTERNAL_PHASE.MOVING: {
        if (peakDeg != null && angle > peakDeg) {
          updatePeak(angle, timestamp, observation);
          endpointStillSince = null;
          break;
        }
        // Fast rep: a large drop from the peak with no still-hold still means
        // the top was reached — emit ENDPOINT first (the FSM cannot skip a
        // state), the RETURN follows on the next frame.
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
          // Drifted down a little but not a full return — reset the still timer.
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

    return { signal, phaseHint: phase, observation };
  }

  /**
   * Human/UI-initiated stop before the lifecycle completes on its own (e.g. a
   * "略過此側" tap, or the patient cannot raise the arm). Records the reason so
   * getResult() reports status "stopped"/"invalid" rather than "incomplete".
   */
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
      return {
        status: "invalid",
        statusReason: coreAvailableFrames === 0 || hadTrackingLoss ? (hadTrackingLoss ? "trackingLost" : "invalidPose") : "invalidPose",
      };
    }
    return { status: "incomplete", statusReason: hadTrackingLoss ? "trackingLost" : null };
  }

  /**
   * The structured A01-1 per-side result. All numbers raw; all status values
   * engineering lifecycle/data-quality descriptors, never clinical verdicts.
   */
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

    const peakFromNeutral =
      peakDeg != null && neutralBaselineDeg != null ? peakDeg - neutralBaselineDeg : null;

    return {
      side,
      status, // "completed" | "incomplete" | "invalid" | "stopped"
      statusReason, // null | "trackingLost" | "invalidPose" | "userStopped"
      completed: status === "completed",
      peakROM: {
        // Raw maximum shoulder-elevation angle (calculateAngle(HIP,SHOULDER,ELBOW),
        // vertex SHOULDER) observed during the attempt. null if movement was
        // never detected / data invalid. Never 0 as a stand-in for "no data".
        deg: peakDeg,
        // Same peak expressed relative to this attempt's own neutral baseline.
        fromNeutralDeg: peakFromNeutral,
        atTimestampMs: peakFrame ? peakFrame.timestampMs : null,
        // Raw SHOULDER-ELBOW-WRIST angle at the peak frame (~180 = straight
        // elbow). Observation only — no straightness threshold is applied.
        elbowExtensionAngleAtPeakDeg: peakFrame ? peakFrame.elbowExtensionAngleDeg : null,
        contralateralShoulderVisibleAtPeak: peakFrame ? peakFrame.contralateralShoulderVisible : null,
      },
      neutralBaselineDeg,
      measurementQuality: {
        // Engineering DATA validity — "did we get a clean enough reading to
        // report a peak" — NOT a statement about the patient or their ROM.
        valid: dataUsable,
        // Engineering data-COVERAGE bucket derived only from frame ratio +
        // tracking loss. Not a clinical confidence.
        confidence,
        coreAvailableFrameRatio,
        frameCount,
        coreAvailableFrames,
        hadTrackingLoss,
      },
      observations: {
        // SUPPORTED: reuses the existing SHOULDER-ELBOW-WRIST geometry.
        elbowFlexion: {
          available: (peakFrame && peakFrame.elbowExtensionAngleDeg != null) || elbowExtensionMinDeg != null,
          atPeakExtensionDeg: peakFrame ? peakFrame.elbowExtensionAngleDeg : null,
          minExtensionDuringMovementDeg: elbowExtensionMinDeg,
          note: "raw elbow angle (SHOULDER-ELBOW-WRIST); ~180 = straight. No clinical straightness threshold applied.",
        },
        // NOT populated: not reliably observable from the A01-1 single
        // side-view camera / requires a later compensation phase. Left
        // explicitly unavailable rather than faked (task §5/§6).
        trunkExtension: { available: false, value: null, note: "sagittal trunk compensation not measured in A01-1; later phase" },
        trunkLateralLean: { available: false, value: null, note: "not observable from a single side-view camera in A01-1" },
        trunkRotation: { available: false, value: null, note: "not observable from a single side-view camera in A01-1" },
        shoulderElevationCompensation: { available: false, value: null, note: "shoulder-girdle elevation compensation not measured in A01-1; later phase" },
      },
      lifecyclePhasesSeen: [...lifecyclePhasesSeen],
      observationSampleCount,
      startedAtMs,
      endedAtMs,
    };
  }

  return { processFrame, markStopped, getResult, reset };
}
