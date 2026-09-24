/**
 * ReMotion Phase 5.4.4 — explicit UI-level "Training Experience State"
 * machine. Pure, DOM-free, deterministic: given a current state and an
 * event, returns the next state (or the same state if the event isn't
 * legal from there).
 *
 * IMPORTANT — this is a SEPARATE state machine from squatSession.js's
 * biomechanical rep state machine (standing/descending/bottom/ascending).
 * That one answers "what is the patient's body doing right now" and drives
 * rep counting; THIS one answers "what should the UI be showing the
 * patient right now" and never influences rep counting or MediaPipe
 * thresholds. app.js is responsible for keeping them in sync via events,
 * but they never share state or override each other.
 *
 * Root cause this exists to fix (Phase 5.4.4 report section 4): before
 * this phase, reaching the rep target only triggered a decorative,
 * self-hiding celebration overlay — nothing actually stopped
 * SquatSessionTracker.processFrame() from continuing to run, so the
 * patient could keep squatting past the target (31/30, 32/30, ...),
 * movement feedback/voice kept firing, and there was no real "the
 * training is over" moment. TARGET_REACHED now transitions into a
 * genuinely terminal state (see isSquatTrainingLocked below).
 */
export const SQUAT_TRAINING_STATE = {
  LOADING: "LOADING",
  WAITING_FOR_BODY: "WAITING_FOR_BODY",
  READY: "READY",
  COUNTDOWN: "COUNTDOWN",
  ACTIVE: "ACTIVE",
  MILESTONE: "MILESTONE",
  COMPLETING: "COMPLETING",
  SUCCESS: "SUCCESS",
  INCOMPLETE: "INCOMPLETE",
};

export const SQUAT_TRAINING_EVENT = {
  MODEL_READY: "MODEL_READY",
  BODY_READY: "BODY_READY",
  BODY_LOST: "BODY_LOST",
  READY_HOLD_ELAPSED: "READY_HOLD_ELAPSED",
  COUNTDOWN_FINISHED: "COUNTDOWN_FINISHED",
  MILESTONE_STARTED: "MILESTONE_STARTED",
  MILESTONE_ENDED: "MILESTONE_ENDED",
  TARGET_REACHED: "TARGET_REACHED",
  CELEBRATION_STARTED: "CELEBRATION_STARTED",
  MANUAL_STOP: "MANUAL_STOP",
};

// Explicit transition table: only (state, event) pairs listed here are
// legal. Anything else is a no-op (returns the same state) — this is a
// deliberate safety property, not a gap: once locked into
// COMPLETING/SUCCESS/INCOMPLETE, no event can ever move the state back
// into ACTIVE/COUNTDOWN, which is exactly the "hard stop" guarantee.
const TRANSITIONS = {
  // MANUAL_STOP is legal from every pre-ACTIVE state too, not just
  // ACTIVE/MILESTONE: the 結束訓練 button (report section 13) stays
  // clickable throughout LOADING/WAITING_FOR_BODY/READY/COUNTDOWN, and a
  // patient who taps it before ever starting to squat must still land in a
  // genuinely locked INCOMPLETE state (not silently stay non-terminal while
  // the ending screen shows on top of it).
  [SQUAT_TRAINING_STATE.LOADING]: {
    [SQUAT_TRAINING_EVENT.MODEL_READY]: SQUAT_TRAINING_STATE.WAITING_FOR_BODY,
    [SQUAT_TRAINING_EVENT.MANUAL_STOP]: SQUAT_TRAINING_STATE.INCOMPLETE,
  },
  [SQUAT_TRAINING_STATE.WAITING_FOR_BODY]: {
    [SQUAT_TRAINING_EVENT.BODY_READY]: SQUAT_TRAINING_STATE.READY,
    [SQUAT_TRAINING_EVENT.MANUAL_STOP]: SQUAT_TRAINING_STATE.INCOMPLETE,
  },
  [SQUAT_TRAINING_STATE.READY]: {
    [SQUAT_TRAINING_EVENT.BODY_LOST]: SQUAT_TRAINING_STATE.WAITING_FOR_BODY,
    [SQUAT_TRAINING_EVENT.READY_HOLD_ELAPSED]: SQUAT_TRAINING_STATE.COUNTDOWN,
    [SQUAT_TRAINING_EVENT.MANUAL_STOP]: SQUAT_TRAINING_STATE.INCOMPLETE,
  },
  [SQUAT_TRAINING_STATE.COUNTDOWN]: {
    [SQUAT_TRAINING_EVENT.BODY_LOST]: SQUAT_TRAINING_STATE.WAITING_FOR_BODY,
    [SQUAT_TRAINING_EVENT.COUNTDOWN_FINISHED]: SQUAT_TRAINING_STATE.ACTIVE,
    [SQUAT_TRAINING_EVENT.MANUAL_STOP]: SQUAT_TRAINING_STATE.INCOMPLETE,
  },
  [SQUAT_TRAINING_STATE.ACTIVE]: {
    [SQUAT_TRAINING_EVENT.MILESTONE_STARTED]: SQUAT_TRAINING_STATE.MILESTONE,
    [SQUAT_TRAINING_EVENT.TARGET_REACHED]: SQUAT_TRAINING_STATE.COMPLETING,
    [SQUAT_TRAINING_EVENT.MANUAL_STOP]: SQUAT_TRAINING_STATE.INCOMPLETE,
  },
  [SQUAT_TRAINING_STATE.MILESTONE]: {
    [SQUAT_TRAINING_EVENT.MILESTONE_ENDED]: SQUAT_TRAINING_STATE.ACTIVE,
    [SQUAT_TRAINING_EVENT.TARGET_REACHED]: SQUAT_TRAINING_STATE.COMPLETING,
    [SQUAT_TRAINING_EVENT.MANUAL_STOP]: SQUAT_TRAINING_STATE.INCOMPLETE,
  },
  [SQUAT_TRAINING_STATE.COMPLETING]: {
    [SQUAT_TRAINING_EVENT.CELEBRATION_STARTED]: SQUAT_TRAINING_STATE.SUCCESS,
  },
  // Terminal for this training page instance — no event listed means no
  // event can ever leave them from inside this state machine. The only way
  // out is navigating away entirely (a page/route change in app.js), which
  // is exactly the "must not auto-navigate, must wait for the patient to
  // press 查看成果" requirement expressed as a structural guarantee.
  [SQUAT_TRAINING_STATE.SUCCESS]: {},
  [SQUAT_TRAINING_STATE.INCOMPLETE]: {},
};

export function nextSquatTrainingState(current, event) {
  const table = TRANSITIONS[current];
  if (!table) return current;
  return table[event] || current;
}

/**
 * True once the session is locked — no more reps, no more movement
 * feedback/voice, no more countdown. COMPLETING is included because it's
 * the very tick where the lock takes effect (see app.js's
 * enterSquatSuccessState which sets COMPLETING and stops the camera in the
 * same synchronous call, before ever reaching SUCCESS).
 */
export function isSquatTrainingLocked(state) {
  return state === SQUAT_TRAINING_STATE.COMPLETING || state === SQUAT_TRAINING_STATE.SUCCESS || state === SQUAT_TRAINING_STATE.INCOMPLETE;
}
