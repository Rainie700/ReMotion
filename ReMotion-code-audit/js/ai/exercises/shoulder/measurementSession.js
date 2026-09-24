/**
 * ReMotion Phase 7.3B.1 — Shoulder Measurement Session Infrastructure.
 *
 * Pure, DOM-free, camera-free, persistence-free, voice-free, route-free.
 * Modeled on js/ai/exercises/hipFlexion/session.js's factory shape
 * ({processFrame, getSummary/getSnapshot, reset}) but NOT a copy of it and
 * NOT sharing any code — hipFlexion's FSM is driven by a real computed hip
 * angle; this module is driven by an ABSTRACT, caller-supplied semantic
 * `signal` because no shoulder angle/geometry exists yet (Phase 7.3B pre-
 * check section 4/27: "Real angle measurement: BLOCKED on domain spec").
 *
 * *** HARD BOUNDARY — READ BEFORE EXTENDING ***
 * This module understands generic semantic events (movement detected,
 * endpoint reached, return detected, attempt complete, tracking lost) but
 * contains NO anatomical landmark math, NO angle formulas, NO ROM/clinical
 * thresholds, and NO derivation of those semantic facts from real pose
 * data. That adapter — turning real shoulder landmarks into one of the
 * SHOULDER_MEASUREMENT_SIGNAL values below — is explicitly Phase 7.3B.2
 * scope and does not exist anywhere in this codebase yet. Production
 * camera frames (see app.js's handleShoulderFrame()) call processFrame()
 * with signal: null on every frame — only Level 1 tests and the debug-only
 * injectShoulderMeasurementSignalForTesting() bridge in app.js ever pass a
 * real signal value, to prove the FSM itself works.
 */

/**
 * Attempt-lifecycle phases. `null` (returned by getSnapshot() before
 * start() is ever called, or after reset()) means "no measurement session
 * is currently active" — distinct from WAITING_FOR_MOVEMENT, which is a
 * real, entered state meaning "the session is active and watching for the
 * next attempt to begin."
 */
export const SHOULDER_MEASUREMENT_PHASE = {
  WAITING_FOR_MOVEMENT: "waiting-for-movement",
  MOVEMENT_IN_PROGRESS: "movement-in-progress",
  ENDPOINT_HOLD: "endpoint-hold",
  RETURNING: "returning",
  ATTEMPT_COMPLETE: "attempt-complete",
};

/**
 * Abstract semantic signals a caller may feed into processFrame(). These
 * name OBSERVATIONS, not measurements — e.g. MOVEMENT_DETECTED means "some
 * upstream adapter decided a movement attempt began," never "the wrist
 * crossed some Y coordinate." No such adapter exists in Phase 7.3B.1.
 */
export const SHOULDER_MEASUREMENT_SIGNAL = {
  MOVEMENT_DETECTED: "MOVEMENT_DETECTED",
  ENDPOINT_DETECTED: "ENDPOINT_DETECTED",
  RETURN_DETECTED: "RETURN_DETECTED",
  ATTEMPT_COMPLETE: "ATTEMPT_COMPLETE",
};

/**
 * createShoulderMeasurementSession() — one instance per shoulder camera
 * session (app.js holds exactly one reference, created alongside its other
 * per-session trackers and discarded on stop, mirroring hp02SessionTracker's
 * lifecycle). The instance does nothing until start() is called (app.js
 * calls this the moment shoulderCameraPhase first becomes "measurement-
 * ready", i.e. right after the existing 7.3A.1 countdown finishes).
 */
export function createShoulderMeasurementSession() {
  let phase = null;
  let attemptActive = false;
  let trackingLost = false;
  let sessionStartedAt = null;
  let phaseEnteredAt = null;
  let lastFrameAt = null;

  function reset() {
    phase = null;
    attemptActive = false;
    trackingLost = false;
    sessionStartedAt = null;
    phaseEnteredAt = null;
    lastFrameAt = null;
  }

  /** Enters WAITING_FOR_MOVEMENT. Safe to call again (re-arms a fresh session, discarding any prior attempt — see Phase 7.3B.1 report section 12: a second attempt can never inherit the first's state, since a fresh start() always resets everything above.) */
  function start(timestamp) {
    phase = SHOULDER_MEASUREMENT_PHASE.WAITING_FOR_MOVEMENT;
    attemptActive = false;
    trackingLost = false;
    sessionStartedAt = timestamp;
    phaseEnteredAt = timestamp;
    lastFrameAt = timestamp;
  }

  function setPhase(next, timestamp) {
    if (phase === next) return false;
    phase = next;
    phaseEnteredAt = timestamp;
    return true;
  }

  /**
   * config: { timestamp, bodyReady, signal }.
   *
   * `bodyReady` is expected to be the caller's ALREADY-debounced camera
   * readiness (e.g. detectionStability.js's smoothed classification) — this
   * module deliberately does not implement its own grace-period timer for
   * brief dropouts, since duplicating that debounce here would just be a
   * second, uncoordinated copy of logic js/ai/detectionStability.js already
   * owns (Phase 7.3B pre-check section 17/21). A caller passing an
   * un-debounced per-frame boolean will simply get more eager invalidation.
   *
   * `signal` is one of SHOULDER_MEASUREMENT_SIGNAL, or null/undefined for
   * "nothing new this frame" (movement continuing / no observation) — this
   * is what makes repeated frames with no new signal a correct no-op
   * (Phase 7.3B.1 report section 6 test item: "movement continuation does
   * not duplicate transition").
   *
   * Returns { phase, attemptActive, trackingLost, changed } — `changed` is
   * true only on the exact frame the phase actually transitioned, so a
   * caller can drive one-shot UI/voice acknowledgement off it directly
   * without maintaining its own duplicate "last shown message" variable.
   */
  function processFrame({ timestamp, bodyReady, signal } = {}) {
    if (phase == null) {
      // No active session (never started, or already reset/invalidated) —
      // a no-op, matching hipFlexion session.js's own "ignore frames before
      // the tracker has anything to track" convention.
      return { phase: null, attemptActive: false, trackingLost: false, changed: false };
    }
    lastFrameAt = timestamp;

    if (bodyReady === false) {
      // Tracking loss: discard any in-progress attempt and fall back to
      // WAITING_FOR_MOVEMENT (not a full reset() — the session itself
      // stays active/armed). Phase 7.3B pre-check section 17: sustained
      // loss invalidates the current attempt; deciding whether the OUTER
      // camera phase should also fall back to "positioning" is the
      // caller's job (app.js), not this module's — this module only
      // knows about attempts, never about camera/route state.
      trackingLost = true;
      const changed = setPhase(SHOULDER_MEASUREMENT_PHASE.WAITING_FOR_MOVEMENT, timestamp) || attemptActive;
      attemptActive = false;
      return { phase, attemptActive, trackingLost, changed };
    }
    trackingLost = false;

    const before = phase;

    switch (phase) {
      case SHOULDER_MEASUREMENT_PHASE.WAITING_FOR_MOVEMENT:
        if (signal === SHOULDER_MEASUREMENT_SIGNAL.MOVEMENT_DETECTED) {
          attemptActive = true;
          setPhase(SHOULDER_MEASUREMENT_PHASE.MOVEMENT_IN_PROGRESS, timestamp);
        }
        break;
      case SHOULDER_MEASUREMENT_PHASE.MOVEMENT_IN_PROGRESS:
        if (signal === SHOULDER_MEASUREMENT_SIGNAL.ENDPOINT_DETECTED) {
          setPhase(SHOULDER_MEASUREMENT_PHASE.ENDPOINT_HOLD, timestamp);
        }
        // Any other signal (including null/"continuing") is intentionally
        // a no-op here — out-of-order signals (e.g. RETURN_DETECTED before
        // an endpoint was ever reached) cannot skip a state.
        break;
      case SHOULDER_MEASUREMENT_PHASE.ENDPOINT_HOLD:
        if (signal === SHOULDER_MEASUREMENT_SIGNAL.RETURN_DETECTED) {
          setPhase(SHOULDER_MEASUREMENT_PHASE.RETURNING, timestamp);
        }
        break;
      case SHOULDER_MEASUREMENT_PHASE.RETURNING:
        if (signal === SHOULDER_MEASUREMENT_SIGNAL.ATTEMPT_COMPLETE) {
          setPhase(SHOULDER_MEASUREMENT_PHASE.ATTEMPT_COMPLETE, timestamp);
          attemptActive = false;
        }
        break;
      case SHOULDER_MEASUREMENT_PHASE.ATTEMPT_COMPLETE:
        // Terminal for this attempt. Deliberately rep-count-agnostic (Phase
        // 7.3B pre-check section 18/28 — repetition policy is WAITING FOR
        // DOMAIN SPEC): no signal here starts a second attempt. A future
        // orchestrator decides whether/when to call start() again; this
        // module never decides that itself.
        break;
      default:
        break;
    }

    return { phase, attemptActive, trackingLost, changed: phase !== before };
  }

  function getSnapshot() {
    return {
      phase,
      attemptActive,
      trackingLost,
      sessionStartedAt,
      phaseEnteredAt,
      lastFrameAt,
    };
  }

  return { start, reset, processFrame, getSnapshot };
}
