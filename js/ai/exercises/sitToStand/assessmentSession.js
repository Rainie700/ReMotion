import {
  FA5X_PARAMS,
  FA5X_TARGET_REPS,
  FA5X_PHASE,
  FA5X_REP_STATE,
  FA5X_RESULT_STATUS,
  FA5X_REJECT_REASON,
  FA5X_END_REASON,
  FA5X_TIMING_DEFINITION,
  FA5X_ALGORITHM_VERSION,
  FA5X_THRESHOLD_VERSION,
  FA5X_GEOMETRY_COORDINATE_SPACE,
} from "./assessmentConstants.js";
import { assessFa5xFraming, trackingPromptKey, fa5xFrameAspectChanged } from "./assessmentFeatures.js";

/**
 * F01-A01 五次坐站測試 — Assessment Mode session (pure, DOM-free).
 *
 * Separate from Training Mode's createSitToStandSession(): the protocol comes
 * from docs/specs/ReMotion六大功能_復健資料庫_F01.xlsx (sheet F01), not from
 * the training FSM.
 *
 * Phases:  POSITIONING -> SEATED_CHECK -> READY -> COUNTDOWN -> RUNNING -> FINISHED
 *   - POSITIONING: required landmarks + framing (distance / headroom).
 *   - SEATED_CHECK: user sits still; the seated hip-y BASELINE is the median
 *     hip y over the stable window (shank length likewise, as the scale).
 *   - READY -> COUNTDOWN: 「準備完成」, then 3 / 2 / 1 (preparation only).
 *   - RUNNING starts at the 「開始」 cue: startCueAt is the official timer
 *     start (Excel timing_rule). Stops at the FIRST frame of the 5th seated
 *     confirmation.
 *
 * Rep lifecycle (RUNNING): SEATED -> RISING -> STANDING -> DESCENDING -> SEATED.
 * Only a full cycle counts. Hip displacement from the seated baseline decides
 * seated vs standing; the knee angle is an extra condition for "standing" when
 * it is measurable; trunk lean is recorded only.
 *
 * Every number used comes from FA5X_PARAMS (engineering candidates, Excel
 * Stage 2 = No Evidence Found, calibration required).
 *
 * Frame shape (fa5x-assessment-1.1): the seated baseline (hip y, shank length)
 * only describes the image it was measured on. If the video aspect ratio /
 * orientation changes during preparation (before or after the baseline, incl.
 * the countdown) everything is reset to POSITIONING with a "frame_changed"
 * event, so the app redoes the camera set-up; during the timed test the run
 * ends INVALID (FA5X_END_REASON.FRAME_CHANGED) — the timer is never continued
 * on a different image. An equal-aspect resolution change is not a change
 * (normalized coordinates are unaffected).
 *
 * processFrame(features, t): `features` from extractFa5xFeatures(), `t` in ms
 * (the camera loop's performance.now()). Returns a snapshot plus the events
 * that happened on this frame.
 */

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const round = (n, d = 3) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

export function createFiveTimesSitToStandAssessment({ params = FA5X_PARAMS, targetReps = FA5X_TARGET_REPS } = {}) {
  let phase = FA5X_PHASE.POSITIONING;
  let prompt = "CAMERA_STARTING";
  let events = [];

  // preparation
  let setupFrame = null; // first valid frame size seen in preparation
  let stableSince = null;
  let stableSamples = [];
  let baseline = null;
  let readySince = null;
  let countdownStartedAt = null;
  let countdownValue = null;

  // timed test
  let startCueAt = null;
  let movementOnsetAt = null;
  let repState = FA5X_REP_STATE.SEATED;
  let repStart = null;
  let standingAt = null;
  let peakDisplacement = null;
  let peakTrunkLeanDeg = null;
  let kneeAngleAtStanding = null;
  let minDescentDisplacement = null;
  let standConfirm = 0;
  let standConfirmFirstAt = null;
  let seatConfirm = 0;
  let seatConfirmFirstAt = null;
  const reps = [];
  const rejectedAttempts = [];
  let lastRejection = null;
  let lostSince = null;
  let trackingLossCount = 0;
  let lastDisplacement = null;
  let lastT = null;
  let result = null;

  // Dev-only frame trace (app: ?fa5xDebug=1 + explicit start). `diag` stays null unless a trace
  // listener is attached, so normal use collects nothing; every `diag && ...` line below only COPIES
  // values the decision code already computed and never changes the decision itself.
  let traceListener = null;
  let diag = null;
  let processedFrames = 0; // processFrame() calls on this session; lets a trace prove it starts at the session's first frame
  const emit = (e) => events.push(e);
  const setPhase = (p) => { if (p !== phase) { phase = p; emit({ type: "phase", phase: p }); } };
  const setPrompt = (key) => { if (key !== prompt) { prompt = key; emit({ type: "prompt", key }); } };

  function displacement(hipY) {
    // Image y grows downward, so a hip RISE is baselineY - hipY > 0.
    return (baseline.hipY - hipY) / baseline.shankLength;
  }

  function resetPreparation(nextPhase, nextPrompt) {
    stableSince = null;
    stableSamples = [];
    baseline = null;
    readySince = null;
    countdownStartedAt = null;
    countdownValue = null;
    setPhase(nextPhase);
    setPrompt(nextPrompt);
  }

  function resetRepCycle() {
    repStart = null;
    standingAt = null;
    peakDisplacement = null;
    peakTrunkLeanDeg = null;
    kneeAngleAtStanding = null;
    minDescentDisplacement = null;
    standConfirm = 0;
    standConfirmFirstAt = null;
    seatConfirm = 0;
    seatConfirmFirstAt = null;
  }

  function reject(reason, t) {
    const entry = { reason, atMs: Math.round(t - startCueAt), duringRep: reps.length + 1 };
    rejectedAttempts.push(entry);
    lastRejection = entry;
    emit({ type: "rejected", reason });
    setPrompt(reason === FA5X_REJECT_REASON.NOT_FULLY_STANDING ? "NOT_FULLY_STANDING" : "NOT_FULLY_SEATED");
  }

  function finish(status, reason, t, seatedAt = null) {
    const completed = status === FA5X_RESULT_STATUS.COMPLETED;
    result = {
      status,
      targetReps,
      completedReps: reps.length,
      repCount: reps.length, // legacy field name read by older result pages
      totalDurationMs: completed ? Math.round(seatedAt - startCueAt) : null,
      repDurationsMs: reps.map((r) => r.durationMs),
      movementOnsetMs: movementOnsetAt != null && startCueAt != null ? Math.round(movementOnsetAt - startCueAt) : null,
      reps: reps.map((r) => ({ ...r })),
      rejectedAttempts: rejectedAttempts.map((r) => ({ ...r })),
      trackingLossCount,
      failureReason: status === FA5X_RESULT_STATUS.INCOMPLETE ? reason : null,
      invalidReason: status === FA5X_RESULT_STATUS.INVALID ? reason : null,
      elapsedMs: startCueAt != null ? Math.round(t - startCueAt) : null,
      timingDefinition: FA5X_TIMING_DEFINITION,
      algorithmVersion: FA5X_ALGORITHM_VERSION,
      thresholdVersion: FA5X_THRESHOLD_VERSION,
      geometryCoordinateSpace: FA5X_GEOMETRY_COORDINATE_SPACE,
      parameters: { ...params },
      baseline: baseline
        ? {
          hipY: round(baseline.hipY, 4), shankLength: round(baseline.shankLength, 4), kneeAngleDeg: round(baseline.kneeAngle, 1), trunkLeanDeg: round(baseline.trunkLeanDeg, 1),
          frameWidth: baseline.frameWidth, frameHeight: baseline.frameHeight,
        }
        : null,
      startCueTimestamp: startCueAt, // camera-clock value; the app converts it to wall-clock time
    };
    setPhase(FA5X_PHASE.FINISHED);
    const invalidPrompt = reason === FA5X_END_REASON.FRAME_CHANGED ? "FRAME_CHANGED_INVALID" : "INVALID";
    setPrompt(completed ? "COMPLETE" : status === FA5X_RESULT_STATUS.INVALID ? invalidPrompt : "INCOMPLETE");
    emit({ type: "finished", result });
  }

  // ── preparation phases ────────────────────────────────────────────────
  function processPreparation(f, t) {
    if (fa5xFrameAspectChanged(setupFrame, f)) {
      setupFrame = null;
      diag && Object.assign(diag, { step: "frame_changed" });
      resetPreparation(FA5X_PHASE.POSITIONING, "FRAME_CHANGED");
      emit({ type: "frame_changed" });
      return;
    }
    if (setupFrame == null && f.frameSizeValid) setupFrame = { frameWidth: f.frameWidth, frameHeight: f.frameHeight };
    if (!f.tracked) {
      diag && Object.assign(diag, { step: "untracked" });
      return resetPreparation(FA5X_PHASE.POSITIONING, trackingPromptKey(f));
    }
    const framing = assessFa5xFraming(f, params, { checkStandingHeadroom: true });
    diag && Object.assign(diag, { framing });
    if (framing !== "OK") {
      diag && Object.assign(diag, { step: "framing_not_ok" });
      return resetPreparation(FA5X_PHASE.POSITIONING, framing === "TOO_FAR" ? "TOO_FAR" : "TOO_CLOSE");
    }

    if (phase === FA5X_PHASE.POSITIONING) resetPreparation(FA5X_PHASE.SEATED_CHECK, "SIT_READY");

    if (phase === FA5X_PHASE.SEATED_CHECK) {
      stableSamples.push({ t, hipY: f.hipY, shank: f.shankLength, knee: f.kneeAngle, trunk: f.trunkLeanDeg });
      const shankRef = median(stableSamples.map((s) => s.shank));
      const ys = stableSamples.map((s) => s.hipY);
      const jitter = (Math.max(...ys) - Math.min(...ys)) / shankRef;
      const moved = jitter > params.SEATED_READY_MAX_HIP_JITTER;
      diag && Object.assign(diag, { step: "seated_check", hipJitter: jitter, hipJitterMax: params.SEATED_READY_MAX_HIP_JITTER, moved });
      if (moved) {
        // moved: restart the stillness window from this frame
        stableSamples = [stableSamples[stableSamples.length - 1]];
        stableSince = t;
      }
      if (stableSince == null) stableSince = t;
      diag && Object.assign(diag, { stableElapsedMs: t - stableSince, stableRequiredMs: params.SEATED_READY_STABLE_MS });
      if (t - stableSince >= params.SEATED_READY_STABLE_MS) {
        diag && Object.assign(diag, { step: "baseline_set" });
        const knees = stableSamples.map((s) => s.knee).filter((v) => v != null);
        const trunks = stableSamples.map((s) => s.trunk).filter((v) => v != null);
        baseline = {
          hipY: median(stableSamples.map((s) => s.hipY)),
          shankLength: median(stableSamples.map((s) => s.shank)),
          kneeAngle: knees.length ? median(knees) : null,
          trunkLeanDeg: trunks.length ? median(trunks) : null,
          frameWidth: f.frameWidth ?? null,
          frameHeight: f.frameHeight ?? null,
        };
        readySince = t;
        setPhase(FA5X_PHASE.READY);
        setPrompt("READY");
        emit({ type: "baseline", baseline: { ...baseline } });
      }
      return;
    }

    // READY / COUNTDOWN: the baseline exists; watch for early movement.
    const d = displacement(f.hipY);
    lastDisplacement = d;
    const belowBaseline = d <= -params.BELOW_BASELINE_RESET;
    const earlyRise = d >= params.RISE_ONSET_DISPLACEMENT;
    diag && Object.assign(diag, { step: "ready_watch", displacement: d, belowBaselineReset: belowBaseline, falseStart: earlyRise });
    if (belowBaseline) return resetPreparation(FA5X_PHASE.SEATED_CHECK, "SIT_READY");
    if (earlyRise) return resetPreparation(FA5X_PHASE.SEATED_CHECK, "FALSE_START");

    if (phase === FA5X_PHASE.READY && t - readySince >= params.READY_HOLD_MS) {
      countdownStartedAt = t;
      setPhase(FA5X_PHASE.COUNTDOWN);
    }
    if (phase === FA5X_PHASE.COUNTDOWN) {
      const elapsed = t - countdownStartedAt;
      if (elapsed >= 3 * params.COUNTDOWN_STEP_MS) {
        diag && Object.assign(diag, { step: "start_cue" });
        startCueAt = t;
        countdownValue = null;
        repState = FA5X_REP_STATE.SEATED;
        resetRepCycle();
        setPhase(FA5X_PHASE.RUNNING);
        setPrompt("START");
        emit({ type: "start_cue", at: t });
        return;
      }
      const value = 3 - Math.floor(elapsed / params.COUNTDOWN_STEP_MS);
      if (value !== countdownValue) {
        countdownValue = value;
        emit({ type: "countdown", value });
        setPrompt(`COUNT_${value}`);
      }
    }
  }

  // ── timed test ────────────────────────────────────────────────────────
  function processRunning(f, t) {
    if (t - startCueAt > params.MAX_ASSESSMENT_MS) {
      diag && Object.assign(diag, { step: "timeout" });
      return finish(FA5X_RESULT_STATUS.INCOMPLETE, FA5X_END_REASON.TIMEOUT, t);
    }
    if (fa5xFrameAspectChanged(baseline, f)) {
      diag && Object.assign(diag, { step: "frame_changed" });
      return finish(FA5X_RESULT_STATUS.INVALID, FA5X_END_REASON.FRAME_CHANGED, t);
    }

    if (!f.tracked || f.hipY == null) {
      if (lostSince == null) { lostSince = t; trackingLossCount += 1; }
      // fa5x-assessment-1.2 — a received but untracked frame breaks "consecutive": a standing /
      // seated confirmation that has not been reached yet starts over after the gap, so it can
      // neither be completed by frames from both sides of the gap nor be timed back to a frame
      // before it. Completed reps, the rep state, peaks, the seated baseline and the 「開始」
      // timer start are kept; no threshold changes. (Frames that never arrive — inference
      // errors / stalls — are not seen here at all; see docs/verification/fa5x-gap-reset/.)
      standConfirm = 0; standConfirmFirstAt = null;
      seatConfirm = 0; seatConfirmFirstAt = null;
      diag && Object.assign(diag, { step: "tracking_gap", lostForMs: t - lostSince, lostLimitMs: params.TRACKING_LOSS_INVALID_MS, pendingConfirmationsCleared: true });
      if (t - lostSince >= params.TRACKING_LOSS_INVALID_MS) {
        diag && Object.assign(diag, { step: "tracking_lost_invalid" });
        return finish(FA5X_RESULT_STATUS.INVALID, FA5X_END_REASON.TRACKING_LOST, t);
      }
      setPrompt("TRACKING_WARNING");
      return;
    }
    if (lostSince != null) {
      lostSince = null;
      setPrompt("START");
    }

    const d = displacement(f.hipY);
    lastDisplacement = d;
    if (movementOnsetAt == null && d >= params.RISE_ONSET_DISPLACEMENT) movementOnsetAt = t;
    if (reps.length === 0 && repState === FA5X_REP_STATE.SEATED && d <= -params.BELOW_BASELINE_RESET) {
      diag && Object.assign(diag, { step: "start_position_not_seated", displacement: d });
      return finish(FA5X_RESULT_STATUS.INVALID, FA5X_END_REASON.START_POSITION_NOT_SEATED, t);
    }

    const kneeOk = f.kneeAngle == null || f.kneeAngle >= params.STANDING_KNEE_ANGLE_MIN_DEG;
    const standingNow = d >= params.STANDING_DISPLACEMENT_MIN && kneeOk;
    const seatedNow = d <= params.SEATED_RETURN_DISPLACEMENT_MAX;
    diag && Object.assign(diag, {
      displacement: d, kneeAngle: f.kneeAngle ?? null, kneeAngleAvailable: f.kneeAngle != null, kneeOk, standingNow, seatedNow,
      riseOnset: d >= params.RISE_ONSET_DISPLACEMENT, exitStanding: d < params.STANDING_DISPLACEMENT_MIN - params.STANDING_EXIT_HYSTERESIS,
    });
    const trackPeaks = () => {
      peakDisplacement = Math.max(peakDisplacement ?? d, d);
      if (f.trunkLeanDeg != null) peakTrunkLeanDeg = Math.max(peakTrunkLeanDeg ?? f.trunkLeanDeg, f.trunkLeanDeg);
    };
    const countStand = () => {
      if (standingNow) { if (standConfirm === 0) standConfirmFirstAt = t; standConfirm += 1; } else { standConfirm = 0; standConfirmFirstAt = null; }
      return standConfirm >= params.STANDING_CONFIRM_FRAMES;
    };
    const countSeat = () => {
      if (seatedNow) { if (seatConfirm === 0) seatConfirmFirstAt = t; seatConfirm += 1; } else { seatConfirm = 0; seatConfirmFirstAt = null; }
      return seatConfirm >= params.SEATED_CONFIRM_FRAMES;
    };

    switch (repState) {
      case FA5X_REP_STATE.SEATED:
        diag && Object.assign(diag, { step: "seated_idle" });
        if (d >= params.RISE_ONSET_DISPLACEMENT) {
          diag && Object.assign(diag, { step: "rise_onset" });
          resetRepCycle();
          repStart = t;
          repState = FA5X_REP_STATE.RISING;
          trackPeaks();
          countStand();
        }
        break;
      case FA5X_REP_STATE.RISING:
        trackPeaks();
        diag && Object.assign(diag, { step: "rising" });
        if (countStand()) {
          diag && Object.assign(diag, { step: "standing_confirmed" });
          standingAt = standConfirmFirstAt;
          kneeAngleAtStanding = f.kneeAngle;
          repState = FA5X_REP_STATE.STANDING;
          standConfirm = 0; seatConfirm = 0;
        } else if (countSeat()) {
          diag && Object.assign(diag, { step: "rejected_not_fully_standing", peakDisplacement });
          reject(FA5X_REJECT_REASON.NOT_FULLY_STANDING, t);
          repState = FA5X_REP_STATE.SEATED;
          resetRepCycle();
        }
        break;
      case FA5X_REP_STATE.STANDING:
        trackPeaks();
        diag && Object.assign(diag, { step: "standing" });
        if (d < params.STANDING_DISPLACEMENT_MIN - params.STANDING_EXIT_HYSTERESIS) {
          diag && Object.assign(diag, { step: "descent_start" });
          repState = FA5X_REP_STATE.DESCENDING;
          minDescentDisplacement = d;
          standConfirm = 0; seatConfirm = 0;
        }
        break;
      case FA5X_REP_STATE.DESCENDING: {
        trackPeaks();
        minDescentDisplacement = Math.min(minDescentDisplacement ?? d, d);
        diag && Object.assign(diag, { step: "descending", minDescentDisplacement });
        if (countSeat()) {
          diag && Object.assign(diag, { step: "rep_counted" });
          const seatedAt = seatConfirmFirstAt;
          reps.push({
            repNumber: reps.length + 1,
            riseOnsetMs: Math.round(repStart - startCueAt),
            standingMs: Math.round(standingAt - startCueAt),
            seatedMs: Math.round(seatedAt - startCueAt),
            durationMs: Math.round(seatedAt - repStart),
            peakHipDisplacement: round(peakDisplacement),
            peakTrunkLeanDeg: round(peakTrunkLeanDeg, 1),
            kneeAngleAtStandingDeg: round(kneeAngleAtStanding, 1),
          });
          lastRejection = null;
          emit({ type: "rep", count: reps.length });
          repState = FA5X_REP_STATE.SEATED;
          resetRepCycle();
          if (reps.length >= targetReps) return finish(FA5X_RESULT_STATUS.COMPLETED, null, t, seatedAt);
          setPrompt("START");
        } else if (countStand()) {
          // Back up without reaching the seat. Only a real partial sit (hip
          // got at least halfway down between the standing and seated
          // thresholds) is reported; a small wobble at the top is not.
          const halfway = (params.STANDING_DISPLACEMENT_MIN + params.SEATED_RETURN_DISPLACEMENT_MAX) / 2;
          const partialSit = minDescentDisplacement != null && minDescentDisplacement <= halfway;
          diag && Object.assign(diag, { step: partialSit ? "rejected_not_fully_seated" : "back_to_standing_wobble", halfway, minDescentDisplacement });
          if (partialSit) reject(FA5X_REJECT_REASON.NOT_FULLY_SEATED, t);
          repState = FA5X_REP_STATE.STANDING;
          minDescentDisplacement = null;
          standConfirm = 0; seatConfirm = 0;
        }
        break;
      }
      default:
        break;
    }
  }

  function snapshot() {
    const seatedCheckProgress = phase === FA5X_PHASE.SEATED_CHECK && stableSince != null && lastT != null
      ? Math.min(1, (lastT - stableSince) / params.SEATED_READY_STABLE_MS)
      : phase === FA5X_PHASE.READY || phase === FA5X_PHASE.COUNTDOWN || phase === FA5X_PHASE.RUNNING ? 1 : 0;
    return {
      phase,
      prompt,
      repState: phase === FA5X_PHASE.RUNNING || phase === FA5X_PHASE.FINISHED ? repState : null,
      completedReps: reps.length,
      targetReps,
      countdownValue,
      startCueAt,
      elapsedMs: startCueAt != null && lastT != null ? lastT - startCueAt : null,
      seatedCheckProgress,
      lastRejection,
      trackingLossCount,
      displacement: lastDisplacement,
      baseline: baseline ? { ...baseline } : null,
      result,
    };
  }

  /** Decision-machine state, copied for the trace only. */
  const traceState = () => ({
    phase, repState, prompt, standConfirm, seatConfirm, completedReps: reps.length, rejectedAttempts: rejectedAttempts.length,
    lostSince, countdownValue, stableSince, stableSamples: stableSamples.length,
  });
  /** Hands one trace entry to the listener; a listener error never reaches the assessment. */
  function emitTrace(kind, frameIndex, features, t, before) {
    const entry = { kind, frameIndex, t, features, before, after: traceState(), diag, events: events.map((e) => ({ ...e })) };
    diag = null;
    try { traceListener(entry); } catch (e) { /* the trace is optional */ }
  }

  return {
    processFrame(features, t) {
      events = [];
      lastT = t;
      const frameIndex = processedFrames;
      processedFrames += 1;
      diag = traceListener ? {} : null;
      const before = diag ? traceState() : null;
      if (phase === FA5X_PHASE.FINISHED) {
        if (diag) { diag.step = "ignored_after_finish"; emitTrace("frame", frameIndex, features, t, before); }
        return { ...snapshot(), events };
      }
      if (phase === FA5X_PHASE.RUNNING) processRunning(features, t);
      else processPreparation(features, t);
      if (diag) emitTrace("frame", frameIndex, features, t, before);
      return { ...snapshot(), events };
    },
    /** User stops early. Only a started timed test produces an (incomplete) result; before 「開始」 nothing was measured. */
    cancel(t) {
      events = [];
      diag = traceListener ? { step: phase === FA5X_PHASE.RUNNING ? "user_cancelled" : "cancelled_before_start" } : null;
      const before = diag ? traceState() : null;
      if (phase === FA5X_PHASE.RUNNING) finish(FA5X_RESULT_STATUS.INCOMPLETE, FA5X_END_REASON.USER_CANCELLED, t);
      if (diag) emitTrace("cancel", null, null, t, before);
      return { ...snapshot(), events };
    },
    /** Dev-only: attach (fn) or detach (null) a frame-trace listener. Without one nothing is collected. */
    setTraceListener(fn) {
      traceListener = typeof fn === "function" ? fn : null;
    },
    getSnapshot: snapshot,
  };
}
