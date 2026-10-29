/**
 * F01-04 sit-to-stand (training / 坐站練習) — what the camera page tells the person, derived ONLY from the counter's
 * real state (createSitToStandSession().getGate()), the camera / model status and which required joints are
 * missing. Pure; no DOM, no timers of its own (the caller passes `now`).
 *
 * "Whole body in frame" is NOT "ready to count": counting starts only after the counter has observed the start
 * posture (seatedObserved). That posture is a knee-angle posture — it is never called "sitting on the chair".
 */
import { LE05_STATE } from "./session.js";

export const LE05_GUIDE = Object.freeze({
  CAMERA_STARTING: "camera_starting",
  MODEL_LOADING: "model_loading",
  FAILED: "failed",
  NO_PERSON: "no_person",
  NOT_IN_FRAME: "not_in_frame",
  FOUND_NOT_SEATED: "found_not_seated",
  READY: "ready",
  PRACTICING: "practicing",
  TRACKING_LOST: "tracking_lost",
  COMPLETED: "completed",
});

/** Status chip per state (short, always visible; never an internal code). */
export const LE05_GUIDE_STATUS = Object.freeze({
  camera_starting: "正在開啟相機",
  model_loading: "模型載入中",
  failed: "無法開始",
  no_person: "尚未完整入鏡",
  not_in_frame: "尚未完整入鏡",
  found_not_seated: "還沒確認起始坐姿",
  ready: "起始姿勢就緒",
  practicing: "練習中",
  tracking_lost: "追蹤中斷，需要重新就緒",
  completed: "已完成目標",
});
const TONE = { camera_starting: "wait", model_loading: "wait", failed: "error", no_person: "warn", not_in_frame: "warn", found_not_seated: "warn", ready: "ok", practicing: "ok", tracking_lost: "warn", completed: "ok" };

/** One concrete instruction for what is actually missing (required LE05 joints). */
export function missingJointsText(missing = [], framing = null) {
  const has = (k) => missing.some((m) => m.includes(k));
  if (framing === "TOO_CLOSE") return "請退後一點，讓頭到雙腳都在畫面內";
  if (has("ankle") && !has("knee") && !has("hip")) return "請讓雙腳也在畫面內，可以再退後一點";
  if (has("knee") || has("ankle")) return "請讓膝蓋與雙腳保持在畫面內";
  if (has("hip")) return "請讓臀部到雙腳都在畫面內";
  if (has("shoulder")) return "請讓肩膀也在畫面內，可以再退後一點";
  return "請讓全身都在畫面內";
}

const PRACTICE_TEXT = {
  [LE05_STATE.RISING]: "繼續站起來，站直",
  [LE05_STATE.STANDING]: "站直了，慢慢坐下",
  [LE05_STATE.LOWERING]: "慢慢坐回去，坐穩",
};

/**
 * @param {{ camera: "starting"|"loading"|"failed"|"ready", failText?: string, landmarks: boolean, bodyReady: boolean,
 *   missing?: string[], framing?: string|null, gate: {state:string, seatedObserved:boolean}, reps: number, target: number,
 *   lostAfterReady?: boolean }} s
 * @returns {{ key: string, status: string, text: string, tone: string }}
 */
export function deriveLe05Guidance(s) {
  const pick = (key, text) => ({ key, status: LE05_GUIDE_STATUS[key], text, tone: TONE[key] });
  if (s.camera === "failed") return pick(LE05_GUIDE.FAILED, s.failText || "無法開始，請再試一次");
  if (s.camera === "starting") return pick(LE05_GUIDE.CAMERA_STARTING, "正在開啟相機，請允許使用相機");
  if (s.camera === "loading") return pick(LE05_GUIDE.MODEL_LOADING, "AI 模型載入中，請稍候");
  if (s.reps >= s.target) return pick(LE05_GUIDE.COMPLETED, `已完成 ${s.target} 次，請按「結束練習」`);
  const g = s.gate || {};
  if (!s.bodyReady) {
    if (s.lostAfterReady) return pick(LE05_GUIDE.TRACKING_LOST, `${s.landmarks ? missingJointsText(s.missing, s.framing) : "請回到畫面內"}，再先坐好`);
    if (!s.landmarks) return pick(LE05_GUIDE.NO_PERSON, "還看不到人，請站到鏡頭前方，讓全身入鏡");
    return pick(LE05_GUIDE.NOT_IN_FRAME, missingJointsText(s.missing, s.framing));
  }
  if (g.state && g.state !== LE05_STATE.SEATED) return pick(LE05_GUIDE.PRACTICING, PRACTICE_TEXT[g.state] || "繼續練習");
  if (!g.seatedObserved) return pick(LE05_GUIDE.FOUND_NOT_SEATED, "已看到全身。請先坐好，雙腳踩穩、膝蓋彎曲");
  return s.reps > 0 ? pick(LE05_GUIDE.PRACTICING, "坐好了，再慢慢站起來") : pick(LE05_GUIDE.READY, "可以開始了：慢慢站起來");
}

/**
 * Display smoothing: a new state is shown once it has held for `holdMs` (immediately for camera / model / failure /
 * completion), so one noisy frame never flips the screen. `flash()` shows a short event line (counted / not counted)
 * for `flashMs` without changing the underlying state.
 */
export function createLe05GuidanceTracker({ holdMs = 400, flashMs = 2200 } = {}) {
  let shown = null, pending = null, since = 0, flashText = null, flashUntil = 0;
  const immediate = new Set([LE05_GUIDE.CAMERA_STARTING, LE05_GUIDE.MODEL_LOADING, LE05_GUIDE.FAILED, LE05_GUIDE.COMPLETED]);
  function update(next, now) {
    if (!shown || immediate.has(next.key) || next.key === shown.key) { shown = next; pending = null; }
    else if (!pending || pending.key !== next.key) { pending = next; since = now; }
    else if (now - since >= holdMs) { shown = next; pending = null; }
    const flashing = flashText && now < flashUntil && shown.key !== LE05_GUIDE.FAILED;
    return { ...shown, text: flashing ? flashText : shown.text, flash: !!flashing };
  }
  function flash(text, now) { flashText = text; flashUntil = now + flashMs; }
  return { update, flash, current: () => shown };
}
