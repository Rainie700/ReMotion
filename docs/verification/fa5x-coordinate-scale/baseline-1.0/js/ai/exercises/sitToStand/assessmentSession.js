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
} from "./assessmentConstants.js";
import { assessFa5xFraming, trackingPromptKey } from "./assessmentFeatures.js";

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
      parameters: { ...params },
      baseline: baseline
        ? { hipY: round(baseline.hipY, 4), shankLength: round(baseline.shankLength, 4), kneeAngleDeg: round(baseline.kneeAngle, 1), trunkLeanDeg: round(baseline.trunkLeanDeg, 1) }
        : null,
      startCueTimestamp: startCueAt, // camera-clock value; the app converts it to wall-clock time
    };
    setPhase(FA5X_PHASE.FINISHED);
    setPrompt(completed ? "COMPLETE" : status === FA5X_RESULT_STATUS.INVALID ? "INVALID" : "INCOMPLETE");
    emit({ type: "finished", result });
  }

  // ── preparation phases ────────────────────────────────────────────────
  function processPreparation(f, t) {
    if (!f.tracked) return resetPreparation(FA5X_PHASE.POSITIONING, trackingPromptKey(f));
    const framing = assessFa5xFraming(f, params, { checkStandingHeadroom: true });
    if (framing !== "OK") return resetPreparation(FA5X_PHASE.POSITIONING, framing === "TOO_FAR" ? "TOO_FAR" : "TOO_CLOSE");

    if (phase === FA5X_PHASE.POSITIONING) resetPreparation(FA5X_PHASE.SEATED_CHECK, "SIT_READY");

    if (phase === FA5X_PHASE.SEATED_CHECK) {
      stableSamples.push({ t, hipY: f.hipY, shank: f.shankLength, knee: f.kneeAngle, trunk: f.trunkLeanDeg });
      const shankRef = median(stableSamples.map((s) => s.shank));
      const ys = stableSamples.map((s) => s.hipY);
      if ((Math.max(...ys) - Math.min(...ys)) / shankRef > params.SEATED_READY_MAX_HIP_JITTER) {
        // moved: restart the stillness window from this frame
        stableSamples = [stableSamples[stableSamples.length - 1]];
        stableSince = t;
      }
      if (stableSince == null) stableSince = t;
      if (t - stableSince >= params.SEATED_READY_STABLE_MS) {
        const knees = stableSamples.map((s) => s.knee).filter((v) => v != null);
        const trunks = stableSamples.map((s) => s.trunk).filter((v) => v != null);
        baseline = {
          hipY: median(stableSamples.map((s) => s.hipY)),
          shankLength: median(stableSamples.map((s) => s.shank)),
          kneeAngle: knees.length ? median(knees) : null,
          trunkLeanDeg: trunks.length ? median(trunks) : null,
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
    if (d <= -params.BELOW_BASELINE_RESET) return resetPreparation(FA5X_PHASE.SEATED_CHECK, "SIT_READY");
    if (d >= params.RISE_ONSET_DISPLACEMENT) return resetPreparation(FA5X_PHASE.SEATED_CHECK, "FALSE_START");

    if (phase === FA5X_PHASE.READY && t - readySince >= params.READY_HOLD_MS) {
      countdownStartedAt = t;
      setPhase(FA5X_PHASE.COUNTDOWN);
    }
    if (phase === FA5X_PHASE.COUNTDOWN) {
      const elapsed = t - countdownStartedAt;
      if (elapsed >= 3 * params.COUNTDOWN_STEP_MS) {
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
    if (t - startCueAt > params.MAX_ASSESSMENT_MS) return finish(FA5X_RESULT_STATUS.INCOMPLETE, FA5X_END_REASON.TIMEOUT, t);

    if (!f.tracked || f.hipY == null) {
      if (lostSince == null) { lostSince = t; trackingLossCount += 1; }
      if (t - lostSince >= params.TRACKING_LOSS_INVALID_MS) return finish(FA5X_RESULT_STATUS.INVALID, FA5X_END_REASON.TRACKING_LOST, t);
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
      return finish(FA5X_RESULT_STATUS.INVALID, FA5X_END_REASON.START_POSITION_NOT_SEATED, t);
    }

    const kneeOk = f.kneeAngle == null || f.kneeAngle >= params.STANDING_KNEE_ANGLE_MIN_DEG;
    const standingNow = d >= params.STANDING_DISPLACEMENT_MIN && kneeOk;
    const seatedNow = d <= params.SEATED_RETURN_DISPLACEMENT_MAX;
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
        if (d >= params.RISE_ONSET_DISPLACEMENT) {
          resetRepCycle();
          repStart = t;
          repState = FA5X_REP_STATE.RISING;
          trackPeaks();
          countStand();
        }
        break;
      case FA5X_REP_STATE.RISING:
        trackPeaks();
        if (countStand()) {
          standingAt = standConfirmFirstAt;
          kneeAngleAtStanding = f.kneeAngle;
          repState = FA5X_REP_STATE.STANDING;
          standConfirm = 0; seatConfirm = 0;
        } else if (countSeat()) {
          reject(FA5X_REJECT_REASON.NOT_FULLY_STANDING, t);
          repState = FA5X_REP_STATE.SEATED;
          resetRepCycle();
        }
        break;
      case FA5X_REP_STATE.STANDING:
        trackPeaks();
        if (d < params.STANDING_DISPLACEMENT_MIN - params.STANDING_EXIT_HYSTERESIS) {
          repState = FA5X_REP_STATE.DESCENDING;
          minDescentDisplacement = d;
          standConfirm = 0; seatConfirm = 0;
        }
        break;
      case FA5X_REP_STATE.DESCENDING: {
        trackPeaks();
        minDescentDisplacement = Math.min(minDescentDisplacement ?? d, d);
        if (countSeat()) {
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
          if (minDescentDisplacement != null && minDescentDisplacement <= halfway) reject(FA5X_REJECT_REASON.NOT_FULLY_SEATED, t);
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

  return {
    processFrame(features, t) {
      events = [];
      lastT = t;
      if (phase === FA5X_PHASE.FINISHED) return { ...snapshot(), events };
      if (phase === FA5X_PHASE.RUNNING) processRunning(features, t);
      else processPreparation(features, t);
      return { ...snapshot(), events };
    },
    /** User stops early. Only a started timed test produces an (incomplete) result; before 「開始」 nothing was measured. */
    cancel(t) {
      events = [];
      if (phase === FA5X_PHASE.RUNNING) finish(FA5X_RESULT_STATUS.INCOMPLETE, FA5X_END_REASON.USER_CANCELLED, t);
      return { ...snapshot(), events };
    },
    getSnapshot: snapshot,
  };
}
