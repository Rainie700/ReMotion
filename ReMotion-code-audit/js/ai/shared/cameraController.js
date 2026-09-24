import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { SQUAT_THRESHOLDS } from "../squatConstants.js";

// The npm package only ships the small JS glue; the (large, versioned)
// wasm binaries and pose model are fetched at runtime from their official
// hosts, same version as the installed package so behavior matches.
const WASM_BASE_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_ASSET_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";

export const POSE_CONNECTIONS = PoseLandmarker.POSE_CONNECTIONS;

/**
 * Owns the camera stream + PoseLandmarker lifecycle for the squat detection
 * page. Deliberately has no knowledge of squat-specific state (reps, score)
 * — it only reports raw per-frame landmarks (or their absence) upstream via
 * callbacks, and guarantees resources are released on stop().
 */
export function createSquatCameraController({ videoEl, onStatus, onFrame, onFatalError, thresholds = SQUAT_THRESHOLDS }) {
  let stream = null;
  let poseLandmarker = null;
  let rafId = null;
  let lastInferenceAt = 0;
  let stopped = false;

  function releaseStream() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
  }

  function releaseAll() {
    if (rafId != null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
    releaseStream();
    if (videoEl) {
      try {
        videoEl.pause();
      } catch (e) {
        // ignore — element may already be detached
      }
      videoEl.srcObject = null;
    }
    if (poseLandmarker) {
      try {
        poseLandmarker.close();
      } catch (e) {
        // ignore — already closed/never fully initialized
      }
      poseLandmarker = null;
    }
  }

  async function createLandmarker(delegate) {
    const vision = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
    return PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_ASSET_URL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  function loop() {
    if (stopped) return;
    rafId = requestAnimationFrame(loop);
    if (!poseLandmarker || videoEl.readyState < 2) return;
    const now = performance.now();
    if (now - lastInferenceAt < thresholds.INFERENCE_INTERVAL_MS) return;
    lastInferenceAt = now;
    let result;
    try {
      result = poseLandmarker.detectForVideo(videoEl, now);
    } catch (e) {
      return; // transient inference hiccup — skip this frame, keep looping
    }
    const landmarks = result && result.landmarks && result.landmarks[0] ? result.landmarks[0] : null;
    onFrame(landmarks, now);
  }

  async function start() {
    stopped = false;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      onFatalError("此瀏覽器不支援攝影機功能，請改用較新版本的瀏覽器或其他裝置再試一次。");
      return;
    }

    onStatus("requesting-permission");
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
    } catch (err) {
      if (stopped) return;
      // Phase 5.1 — distinguish the three cases a patient can actually act
      // on differently: permission was refused (fixable in browser
      // settings), no camera hardware exists at all, or the camera is
      // busy/unreadable (e.g. another app/tab is using it). Anything else
      // falls back to a generic, non-technical message — never the raw
      // browser exception text.
      const name = err && err.name;
      let message;
      if (name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError") {
        message = "無法使用相機權限，請允許瀏覽器使用相機後再試一次。";
      } else if (name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") {
        message = "目前找不到可使用的相機。";
      } else if (name === "NotReadableError" || name === "TrackStartError") {
        message = "相機目前可能被其他應用程式使用中，請關閉後再試一次。";
      } else {
        message = "開啟相機時發生問題，請再試一次。";
      }
      onFatalError(message);
      return;
    }
    if (stopped) {
      releaseStream();
      return;
    }

    videoEl.srcObject = stream;
    try {
      await videoEl.play();
    } catch (e) {
      // autoplay can reject before user gesture settles; loop() still starts
      // once readyState reaches HAVE_CURRENT_DATA, so this is non-fatal.
    }

    onStatus("loading-model");
    try {
      poseLandmarker = await createLandmarker("GPU");
    } catch (err) {
      try {
        poseLandmarker = await createLandmarker("CPU");
      } catch (err2) {
        if (!stopped) {
          releaseAll();
          onFatalError("AI 動作偵測模型載入失敗，請確認網路連線後再試一次。");
        }
        return;
      }
    }
    if (stopped) {
      releaseAll();
      return;
    }

    onStatus("ready");
    loop();
  }

  function stop() {
    stopped = true;
    releaseAll();
  }

  return { start, stop };
}
