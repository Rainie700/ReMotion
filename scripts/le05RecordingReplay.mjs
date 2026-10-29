// F01-04 坐站 — DEVELOPER replay of a screen recording through the real counting path (diagnostics only).
//
// Decodes a local video in Google Chrome (H.264), crops the camera area, runs the SAME MediaPipe PoseLandmarker the
// app uses (pose_landmarker_lite, tasks-vision 0.10.35, VIDEO mode, one inference per 66 ms of video time — loaded
// normally from its CDN, nothing blocked) and feeds every frame to a real createSitToStandSession() through
// js/ai/exercises/sitToStand/trainingTrace.js.
//
// LIMITS (always state them with the result): a screen recording already contains the app's skeleton overlay,
// status text, dimming and video compression, and its timing is the recorder's — it is NOT the original camera
// input. A replay shows how the code reacts to these pixels; it is not a measurement of the original session.
//
//   [REPO=<repo>] VIDEO=<file.mp4> OUT=<dir> [CROP=x,y,w,h in video pixels] [FROM=s] [TO=s] [SNAP=s1,s2,…] node le05RecordingReplay.mjs
//   (run from a folder where `playwright` resolves, as with the other browser checks)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = process.env.REPO || join(dirname(fileURLToPath(import.meta.url)), "..");
const video = process.env.VIDEO, out = process.env.OUT;
if (!video || !out) throw Error("VIDEO and OUT are required");
mkdirSync(out, { recursive: true });
const crop = (process.env.CROP || "").split(",").map(Number);
const from = Number(process.env.FROM || 0), to = process.env.TO ? Number(process.env.TO) : null;
const snaps = (process.env.SNAP || "").split(",").filter(Boolean).map(Number);
const port = Number(process.env.PORT || 5179);

const vite = spawn(process.execPath, [join(repo, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.route("**/__replay/video.mp4", (route) => route.fulfill({ path: video, contentType: "video/mp4" }));
  page.on("console", (m) => { if (m.type() === "error") console.log("[page]", m.text().slice(0, 200)); });
  await page.goto(`http://127.0.0.1:${port}/js/ai/exercises/sitToStand/trainingTrace.js`); // any same-origin module URL; no app boot
  const result = await page.evaluate(async ({ crop, from, to, snaps }) => {
    const { FilesetResolver, PoseLandmarker } = await import("/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs");
    const { createSitToStandSession } = await import("/js/ai/exercises/sitToStand/session.js");
    const { traceLe05Frame, summarizeLe05Trace } = await import("/js/ai/exercises/sitToStand/trainingTrace.js");
    const blob = await (await fetch("/__replay/video.mp4")).blob();
    const v = document.createElement("video");
    v.muted = true; v.src = URL.createObjectURL(blob); document.body.appendChild(v);
    await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(Error("video decode failed")); });
    const [cx, cy, cw, ch] = crop.length === 4 && crop.every(Number.isFinite) ? crop : [0, 0, v.videoWidth, v.videoHeight];
    const c = document.createElement("canvas"); c.width = cw; c.height = ch; const g = c.getContext("2d");
    const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
    const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task";
    let lm, delegate = "GPU";
    try { lm = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate: "GPU" }, runningMode: "VIDEO", numPoses: 1 }); }
    catch { delegate = "CPU"; lm = await PoseLandmarker.createFromOptions(vision, { baseOptions: { modelAssetPath: MODEL, delegate: "CPU" }, runningMode: "VIDEO", numPoses: 1 }); }
    const session = createSitToStandSession({ targetReps: 5 });
    const rows = [], pics = {};
    const end = to == null ? v.duration : Math.min(to, v.duration);
    const seek = (s) => new Promise((res) => { v.onseeked = () => res(); v.currentTime = s; });
    const POSE = PoseLandmarker.POSE_CONNECTIONS;
    for (let s = from; s <= end; s += 0.066) {
      await seek(s);
      g.drawImage(v, cx, cy, cw, ch, 0, 0, cw, ch);
      const ts = Math.round(s * 1000);
      const r = lm.detectForVideo(c, ts);
      const l = r && r.landmarks && r.landmarks[0] ? r.landmarks[0] : null;
      const row = traceLe05Frame(session, l, ts);
      rows.push(row);
      const near = snaps.find((x) => Math.abs(x - s) < 0.033);
      if (near != null && !pics[near]) {
        if (l) { g.strokeStyle = "#ff2d55"; g.lineWidth = 4; for (const { start, end } of POSE) { const a = l[start], b = l[end]; g.beginPath(); g.moveTo(a.x * cw, a.y * ch); g.lineTo(b.x * cw, b.y * ch); g.stroke(); } }
        g.fillStyle = "rgba(0,0,0,.7)"; g.fillRect(0, 0, cw, 90); g.fillStyle = "#fff"; g.font = "26px sans-serif";
        g.fillText(`t=${s.toFixed(1)}s ready=${row.bodyReady} knee=${row.knee ?? "-"} (L ${row.kneeL ?? "-"} / R ${row.kneeR ?? "-"})`, 12, 34);
        g.fillText(`state=${row.state} seatObserved=${row.seatedObserved} missing=${row.missing.join(",") || "-"}`, 12, 72);
        pics[near] = c.toDataURL("image/png");
      }
    }
    return { delegate, video: { w: v.videoWidth, h: v.videoHeight, duration: v.duration }, crop: [cx, cy, cw, ch], rows, summary: summarizeLe05Trace(rows), pics };
  }, { crop, from, to, snaps });
  for (const [s, url] of Object.entries(result.pics)) writeFileSync(join(out, `replay-${String(s).padStart(5, "0")}s.png`), Buffer.from(url.split(",")[1], "base64"));
  delete result.pics;
  writeFileSync(join(out, "trace.json"), JSON.stringify(result.rows));
  writeFileSync(join(out, "summary.json"), JSON.stringify({ ...result, rows: undefined }, null, 2));
  console.log(JSON.stringify({ delegate: result.delegate, video: result.video, crop: result.crop, summary: result.summary }, null, 2));
} finally { await browser?.close(); vite.kill("SIGTERM"); }
