import {
  FA5X_PARAMS,
  FA5X_TARGET_REPS,
  FA5X_REQUIRED_LANDMARKS,
  FA5X_TIMING_DEFINITION,
  FA5X_ALGORITHM_VERSION,
  FA5X_THRESHOLD_VERSION,
  FA5X_GEOMETRY_COORDINATE_SPACE,
} from "./assessmentConstants.js";

/**
 * F01-A01 五次坐站 — DEVELOPMENT frame trace recorder (pure, DOM-free).
 *
 * Purpose: keep, per camera frame, exactly what the assessment session was fed
 * (features + camera time) and what it decided (state before/after, confirm
 * counts, the condition flags computed by the session itself — see
 * setTraceListener() in assessmentSession.js), so a run can be replayed later.
 *
 * Rules:
 *   - Only the app's ?fa5xDebug=1 page creates a recorder, and only after the
 *     developer presses 「開始記錄」. Normal use never creates one.
 *   - In memory only. Nothing here uploads or persists; the app offers a
 *     manual JSON download.
 *   - Capacity is capped (frames and events separately). Past the cap new
 *     entries are dropped and counted, and the export says complete: false.
 *   - No user id, no image/video. Landmarks are limited to the required
 *     landmark subset (FA5X_REQUIRED_LANDMARKS).
 *   - Recording never changes counting, timing, thresholds or the result.
 */

export const FA5X_TRACE_FORMAT_VERSION = "fa5x-frame-trace-1.0";
export const FA5X_TRACE_MAX_FRAMES = 6000; // ≈ 6.6 min at the app's 66 ms detection interval
export const FA5X_TRACE_MAX_EVENTS = 2000;

const r = (n, d = 5) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/** Required-landmark subset of a MediaPipe pose (normalized x/y, visibility, presence). */
export function pickFa5xTraceLandmarks(landmarks) {
  if (!Array.isArray(landmarks) || !landmarks.length) return null;
  return FA5X_REQUIRED_LANDMARKS.map((index) => {
    const p = landmarks[index];
    return p ? { index, x: r(p.x), y: r(p.y), visibility: r(p.visibility, 3), presence: r(p.presence, 3) } : { index, missing: true };
  });
}

/**
 * @param {{ params?: object, targetReps?: number, maxFrames?: number, maxEvents?: number, now?: () => string }} [opts]
 */
export function createFa5xTraceRecorder({
  params = FA5X_PARAMS,
  targetReps = FA5X_TARGET_REPS,
  maxFrames = FA5X_TRACE_MAX_FRAMES,
  maxEvents = FA5X_TRACE_MAX_EVENTS,
  now = () => new Date().toISOString(),
} = {}) {
  const startedAt = now();
  let stoppedAt = null;
  let recording = true;
  const frames = [];
  const events = [];
  let droppedFrames = 0;
  let droppedEvents = 0;
  let firstDropT = null;
  let baselines = [];
  let result = null;
  let seq = 0;

  function pushEvent(e) {
    if (events.length >= maxEvents) { droppedEvents += 1; return; }
    events.push(e);
  }

  /**
   * One frame. `entry` is either the session's trace payload (stage "assess":
   * { kind, t, features, before, after, diag, events }) or an app-side frame
   * (stage "stand": the standing position check before the session exists).
   * `extra` = { landmarks, frameWidth, frameHeight, ... } from the camera loop.
   */
  function recordFrame(stage, entry, extra = {}) {
    if (!recording) return false;
    seq += 1;
    const sessionEvents = Array.isArray(entry?.events) ? entry.events : [];
    // Events are kept even when the frame itself no longer fits.
    sessionEvents.forEach((e) => {
      if (e.type === "baseline") baselines.push({ t: entry.t, baseline: clone(e.baseline) });
      if (e.type === "finished") result = clone(e.result);
      pushEvent({ seq, stage, t: entry.t, ...clone(e) });
    });
    if (frames.length >= maxFrames) {
      droppedFrames += 1;
      if (firstDropT == null) firstDropT = entry?.t ?? null;
      return false;
    }
    const f = entry?.features || null;
    frames.push({
      seq,
      stage,
      kind: entry?.kind || "frame",
      t: entry?.t ?? null,
      frameWidth: extra.frameWidth ?? f?.frameWidth ?? null,
      frameHeight: extra.frameHeight ?? f?.frameHeight ?? null,
      landmarks: extra.landmarks !== undefined ? pickFa5xTraceLandmarks(extra.landmarks) : null,
      features: clone(f),
      kneeAngleAvailable: f ? f.kneeAngle != null : null,
      before: clone(entry?.before ?? null),
      after: clone(entry?.after ?? null),
      diag: clone(entry?.diag ?? null),
      eventTypes: sessionEvents.map((e) => e.type),
      ...(extra.app ? { app: clone(extra.app) } : {}),
    });
    return true;
  }

  /** App-level event (setup restart, exit, finalization, …). */
  function recordEvent(type, data = {}, t = null) {
    if (!recording) return false;
    seq += 1;
    pushEvent({ seq, stage: "app", t, type, ...clone(data) });
    return true;
  }

  function stop() {
    if (recording) { recording = false; stoppedAt = now(); }
  }

  function status() {
    return {
      recording,
      frames: frames.length,
      events: events.length,
      maxFrames,
      maxEvents,
      droppedFrames,
      droppedEvents,
      complete: droppedFrames === 0 && droppedEvents === 0,
      hasResult: result != null,
    };
  }

  function buildExport() {
    const st = status();
    return {
      formatVersion: FA5X_TRACE_FORMAT_VERSION,
      purpose: "development_replay_only",
      notice: "開發用逐幀判定紀錄；不是正式結果，也不是準確度驗證資料。",
      algorithmVersion: FA5X_ALGORITHM_VERSION,
      thresholdVersion: FA5X_THRESHOLD_VERSION,
      timingDefinition: FA5X_TIMING_DEFINITION,
      geometryCoordinateSpace: FA5X_GEOMETRY_COORDINATE_SPACE,
      timeBase: "camera_performance_now_ms",
      targetReps,
      params: { ...params },
      requiredLandmarks: [...FA5X_REQUIRED_LANDMARKS],
      recording: { startedAt, stoppedAt, stillRecording: st.recording },
      capacity: { maxFrames, maxEvents },
      complete: st.complete,
      incompleteReason: st.complete ? null : `超過容量上限：略過 ${droppedFrames} 幀、${droppedEvents} 個事件（自 t=${firstDropT ?? "?"} 起）`,
      droppedFrames,
      droppedEvents,
      baseline: baselines.length ? clone(baselines[baselines.length - 1]) : null,
      baselineHistory: clone(baselines),
      result: clone(result),
      frameCount: frames.length,
      eventCount: events.length,
      frames: clone(frames),
      events: clone(events),
    };
  }

  return { recordFrame, recordEvent, stop, status, buildExport };
}
