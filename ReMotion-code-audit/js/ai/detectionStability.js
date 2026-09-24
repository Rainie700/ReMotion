import { getBodyReadiness, getFramingDistanceHint, BODY_READINESS } from "./poseMath.js";
import { SQUAT_THRESHOLDS, SQUAT_REQUIRED_LANDMARKS } from "./squatConstants.js";

/**
 * ReMotion Phase 5.2 — pure, DOM-free temporal smoothing for the *display*
 * layer only. A real-device test found that a momentary landmark dropout
 * (a single frame or two of low knee visibility) made the training screen
 * flicker between "detected" and "not detected" every frame. This module
 * turns raw per-frame body-readiness/framing classifications into a small
 * hysteresis: recovery to READY is always immediate, but dropping out of
 * READY only escalates the shown state after it has persisted for a while.
 *
 * This has zero influence on rep counting or scoring — squatSession.js's
 * SquatSessionTracker is fed the true, un-smoothed per-frame angles
 * directly by app.js; it never sees anything produced by this tracker.
 */
export const DETECTION_DISPLAY_STATE = {
  NOT_FOUND: "NOT_FOUND",
  PARTIAL: "PARTIAL",
  READY: "READY",
  LOST_SUSTAINED: "LOST_SUSTAINED",
  LOST_LONG: "LOST_LONG",
};

// Phase 5.5.2 — requiredLandmarks is a second, optional config param
// (defaults to squat's own set) so a future exercise's tracker can be
// created with its own landmark requirement without copying this whole
// module. Threaded straight through to the two poseMath calls below;
// nothing about the debounce/hysteresis timing changes.
export function createDetectionStabilityTracker(thresholds = SQUAT_THRESHOLDS, requiredLandmarks = SQUAT_REQUIRED_LANDMARKS) {
  let everReady = false;
  let dropoutSince = null;
  let lastReadyAt = null;
  let stableState = DETECTION_DISPLAY_STATE.NOT_FOUND;

  // Framing hint gets the same "don't flicker on one frame" treatment: a
  // new hint only replaces the displayed one after it has been consistently
  // different for DETECTION_GRACE_MS.
  let framingDisplay = null;
  let framingPending = null;
  let framingChangeSince = null;

  function updateFraming(rawHint, timestamp) {
    if (rawHint == null) return framingDisplay; // insufficient data this frame — keep last known
    if (framingDisplay === null) {
      // First-ever reading — nothing stable to protect against flicker yet,
      // so commit immediately rather than waiting out a debounce window.
      framingDisplay = rawHint;
      framingPending = null;
      framingChangeSince = null;
      return framingDisplay;
    }
    if (rawHint === framingDisplay) {
      framingPending = null;
      framingChangeSince = null;
      return framingDisplay;
    }
    if (framingPending !== rawHint) {
      framingPending = rawHint;
      framingChangeSince = timestamp;
      return framingDisplay;
    }
    if (timestamp - framingChangeSince >= thresholds.DETECTION_GRACE_MS) {
      framingDisplay = rawHint;
      framingPending = null;
      framingChangeSince = null;
    }
    return framingDisplay;
  }

  /**
   * Feed one frame's landmarks in. Returns { displayState, framing,
   * rawReadiness } — displayState is the debounced value the UI should
   * render; rawReadiness is the true per-frame classification (useful for
   * debug instrumentation only, never for rep logic).
   */
  function update(landmarks, timestamp) {
    const rawReadiness = getBodyReadiness(landmarks, thresholds, requiredLandmarks);
    const rawFraming = getFramingDistanceHint(landmarks, thresholds, requiredLandmarks);
    const framing = updateFraming(rawFraming, timestamp);

    if (rawReadiness === BODY_READINESS.READY) {
      everReady = true;
      dropoutSince = null;
      lastReadyAt = timestamp;
      stableState = DETECTION_DISPLAY_STATE.READY;
      return { displayState: stableState, framing, rawReadiness };
    }

    if (!everReady) {
      // Never achieved a stable detection yet — nothing to freeze, reflect
      // the raw classification immediately.
      stableState = rawReadiness === BODY_READINESS.PARTIAL ? DETECTION_DISPLAY_STATE.PARTIAL : DETECTION_DISPLAY_STATE.NOT_FOUND;
      return { displayState: stableState, framing, rawReadiness };
    }

    if (dropoutSince == null) dropoutSince = timestamp;
    const elapsed = timestamp - dropoutSince;
    if (elapsed < thresholds.DETECTION_GRACE_MS) {
      // Brief dropout — keep showing the last stable (READY) state.
      return { displayState: stableState, framing, rawReadiness };
    }
    stableState = elapsed < thresholds.PARTIAL_WARNING_MS ? DETECTION_DISPLAY_STATE.LOST_SUSTAINED : DETECTION_DISPLAY_STATE.LOST_LONG;
    return { displayState: stableState, framing, rawReadiness };
  }

  function getLastReadyAt() {
    return lastReadyAt;
  }

  function reset() {
    everReady = false;
    dropoutSince = null;
    lastReadyAt = null;
    stableState = DETECTION_DISPLAY_STATE.NOT_FOUND;
    framingDisplay = null;
    framingPending = null;
    framingChangeSince = null;
  }

  return { update, getLastReadyAt, reset };
}
