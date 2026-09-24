import { SHOULDER_SIDE } from "./constants.js";

/**
 * ReMotion Phase 7.3B.2C / 7.3B.2C.1 — Shoulder Real-device Calibration
 * Session.
 *
 * Pure, DOM-free, camera-free, persistence-free, clinical-interpretation-
 * free. Holds ONLY developer-tooling state: which movement/side a
 * calibration tester has selected, a bounded buffer of raw observation
 * samples, a running max of the raw shoulder-elevation angle (developer
 * bookkeeping only — never a ROM result), and human-entered timing
 * markers enriched with their own raw-angle context. Contains no geometry
 * (see js/ai/exercises/shoulder/poseMath.js for that) and no attempt-
 * lifecycle FSM (see js/ai/exercises/shoulder/measurementSession.js for
 * that) — this module never computes an angle and never produces a
 * SHOULDER_MEASUREMENT_SIGNAL.
 *
 * Phase 7.3B.2C.1 additive changes (documented explicitly, not silent):
 * - setMovement()/setSide() now clear recorded data (samples/markers/
 *   runningMax/lastObservation) WHEN THE VALUE ACTUALLY CHANGES, so
 *   switching configuration can never silently mix samples from two
 *   different movement/side combinations (report section 9's explicit
 *   requirement). Re-selecting the SAME value is a no-op, same as before.
 * - addMarker()'s stored shape grew from {timestamp, markerType} to
 *   additionally include movement/side/shoulderElevationAngle/
 *   elbowExtensionAngle (pulled from the session's own lastObservation at
 *   the moment the marker is pressed) — report section 10's explicit
 *   "snapshot enough context to make markers useful later" requirement.
 *   The 7.3B.2C pure test's old "marker is only {timestamp, markerType}"
 *   assertion was updated accordingly (see that test's own CHANGED
 *   comment).
 * - getManualAttemptStatus()/getManualAttemptSummary() are new: a MANUAL,
 *   marker-driven attempt concept (自然垂下 -> 開始抬手 -> 我認為到頂 ->
 *   回到起始), explicitly NOT an automatic threshold-driven movement
 *   classifier (report section 11 — no such classifier exists or is
 *   implemented anywhere in this codebase).
 */

export const SHOULDER_CALIBRATION_MOVEMENT = {
  FLEXION: "FLEXION",
  ABDUCTION: "ABDUCTION",
};

// Engineering memory-safety cap on the in-memory sample buffer only — NOT
// a measurement/clinical threshold. Bounds how long a forgotten-open
// calibration session can grow before old samples are dropped; has no
// effect on any angle, signal, or FSM behavior.
const MAX_SAMPLES = 300;

// The one and only manual-attempt marker order this module understands.
// Purely a sequencing/labeling concept for a HUMAN-driven annotation flow
// — never derived from an angle value, never a clinical judgment.
const MANUAL_ATTEMPT_MARKER_SEQUENCE = ["NEUTRAL", "MOVEMENT_START", "PERCEIVED_TOP", "RETURNED"];

/**
 * One instance per calibration session (created when a developer turns
 * calibration mode on, discarded when they turn it off — see app.js's
 * toggleShoulderCalibrationMode()). Movement and side both start
 * unselected (null) — neither is ever silently defaulted; the caller must
 * explicitly select both before a real observation is meaningful.
 */
export function createShoulderCalibrationSession() {
  let movement = null;
  let side = null;
  let sessionStartedAt = null;
  let samples = [];
  let markers = [];
  let lastObservation = null;
  let runningMaxShoulderElevationAngle = null;

  /** Clears recorded DATA only — never the current movement/side selection (that's the caller's job to change separately). */
  function clearData() {
    samples = [];
    markers = [];
    lastObservation = null;
    runningMaxShoulderElevationAngle = null;
  }

  function setMovement(nextMovement) {
    if (nextMovement !== SHOULDER_CALIBRATION_MOVEMENT.FLEXION && nextMovement !== SHOULDER_CALIBRATION_MOVEMENT.ABDUCTION) return false;
    if (nextMovement !== movement) {
      movement = nextMovement;
      clearData(); // report section 9: never silently mix samples across configurations
    }
    return true;
  }

  function setSide(nextSide) {
    if (nextSide !== SHOULDER_SIDE.LEFT && nextSide !== SHOULDER_SIDE.RIGHT) return false;
    if (nextSide !== side) {
      side = nextSide;
      clearData();
    }
    return true;
  }

  function start(timestamp) {
    sessionStartedAt = timestamp;
    clearData();
  }

  function reset() {
    sessionStartedAt = null;
    clearData();
  }

  /**
   * `sample` is caller-shaped (app.js decides the exact fields — see
   * getShoulderCalibrationLandmarkFacts()/computeShoulderMeasurementObservation()
   * call sites) — this module only owns the bounded-buffer mechanics and
   * the running-max bookkeeping (report section 9), and never otherwise
   * inspects sample contents, so it can never accidentally gate on or
   * interpret a clinical value. Expects (but does not require) a
   * `coreAngleAvailable`/`shoulderElevationAngle` shape matching
   * computeShoulderMeasurementObservation()'s output for the running-max
   * update to do anything.
   */
  function addObservation(sample) {
    samples.push(sample);
    if (samples.length > MAX_SAMPLES) samples.shift();
    lastObservation = sample;
    if (sample && sample.coreAngleAvailable && typeof sample.shoulderElevationAngle === "number") {
      if (runningMaxShoulderElevationAngle == null || sample.shoulderElevationAngle > runningMaxShoulderElevationAngle) {
        runningMaxShoulderElevationAngle = sample.shoulderElevationAngle;
      }
    }
  }

  /**
   * markerType is a caller-supplied label (e.g. "NEUTRAL"/"MOVEMENT_START")
   * — a human annotation only, never fed into any FSM or signal. Enriches
   * the stored marker with the CURRENT movement/side and the most recent
   * raw angles (from lastObservation) so the marker is useful for later
   * calibration analysis without requiring the caller to pass that context
   * itself (report section 10).
   */
  function addMarker(markerType, timestamp) {
    markers.push({
      timestamp,
      markerType,
      movement,
      side,
      shoulderElevationAngle: lastObservation ? lastObservation.shoulderElevationAngle : null,
      elbowExtensionAngle: lastObservation ? lastObservation.elbowExtensionAngle : null,
    });
  }

  function getSelection() {
    return { movement, side };
  }

  function getSnapshot() {
    return {
      movement,
      side,
      sessionStartedAt,
      sampleCount: samples.length,
      samples: samples.slice(),
      markers: markers.slice(),
      lastObservation,
      runningMaxShoulderElevationAngle,
    };
  }

  /**
   * Report section 11 — a MANUAL, marker-driven attempt concept only.
   * Finds the most recent NEUTRAL marker and checks whether the markers
   * from there onward form a valid, in-order prefix of
   * MANUAL_ATTEMPT_MARKER_SEQUENCE. Never derives anything from an angle
   * value — purely marker-sequence bookkeeping. Explicitly does NOT
   * silently treat an out-of-order press as complete.
   */
  function getManualAttemptStatus() {
    let startIdx = -1;
    for (let i = markers.length - 1; i >= 0; i--) {
      if (markers[i].markerType === MANUAL_ATTEMPT_MARKER_SEQUENCE[0]) {
        startIdx = i;
        break;
      }
    }
    if (startIdx === -1) {
      return { state: "not_started", expectedNext: MANUAL_ATTEMPT_MARKER_SEQUENCE[0], unexpectedMarker: null, markers: [], complete: false };
    }
    const attemptMarkers = markers.slice(startIdx);
    let outOfOrder = false;
    let unexpectedMarker = null;
    let validLength = 0;
    for (let i = 0; i < attemptMarkers.length; i++) {
      if (i < MANUAL_ATTEMPT_MARKER_SEQUENCE.length && attemptMarkers[i].markerType === MANUAL_ATTEMPT_MARKER_SEQUENCE[i]) {
        validLength = i + 1;
      } else {
        outOfOrder = true;
        unexpectedMarker = attemptMarkers[i].markerType;
        break;
      }
    }
    const complete = validLength === MANUAL_ATTEMPT_MARKER_SEQUENCE.length && !outOfOrder;
    return {
      state: complete ? "complete" : outOfOrder ? "out_of_order" : "in_progress",
      expectedNext: complete || outOfOrder ? null : MANUAL_ATTEMPT_MARKER_SEQUENCE[validLength],
      unexpectedMarker,
      markers: attemptMarkers.slice(0, validLength),
      complete,
    };
  }

  /**
   * Only meaningful once getManualAttemptStatus().complete is true —
   * returns null otherwise. A compact, explicitly-NOT-clinical summary:
   * raw angles at each marker, this recording's running max, and whether
   * core/elbow-validity tracking was ever lost during the marked window
   * (a fact, not a judgment about whether the attempt is "valid").
   */
  function getManualAttemptSummary() {
    const status = getManualAttemptStatus();
    if (!status.complete) return null;
    const bySequence = {};
    status.markers.forEach((m) => {
      bySequence[m.markerType] = m;
    });
    const startT = status.markers[0].timestamp;
    const endT = status.markers[status.markers.length - 1].timestamp;
    const windowSamples = samples.filter((s) => s.timestamp >= startT && s.timestamp <= endT);
    return {
      neutralAngle: bySequence.NEUTRAL.shoulderElevationAngle,
      movementStartAngle: bySequence.MOVEMENT_START.shoulderElevationAngle,
      perceivedTopAngle: bySequence.PERCEIVED_TOP.shoulderElevationAngle,
      returnedAngle: bySequence.RETURNED.shoulderElevationAngle,
      runningMaxShoulderElevationAngle,
      hadCoreUnavailable: windowSamples.some((s) => s.coreAngleAvailable === false),
      hadElbowValidityLost: windowSamples.some((s) => s.elbowValidityObservable === false),
    };
  }

  return { setMovement, setSide, start, reset, addObservation, addMarker, getSelection, getSnapshot, getManualAttemptStatus, getManualAttemptSummary };
}
