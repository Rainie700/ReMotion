// F01-04 坐站 camera page — BROWSER check (使用體驗改善 2/5). LOCAL only: Vite dev server (?emulator=1) + local
// Auth/Firestore emulators (demo-remotion); a synthetic patient made here (no patient00/01, no cloud project).
//
// What is REAL here: Chromium + the real MediaPipe PoseLandmarker downloaded from its CDN (NOT blocked) running on
// Chromium's FAKE camera (a test pattern, no person). What is SYNTHETIC: every sit/stand — 2D landmarks generated
// here, fed through the page's own handleLe05Frame via the emulator-only window.__emulatorFeedLe05Landmarks.
// Nothing here verifies recognition of a real person.
//
//   REPO=<repo> SHOTS=<dir> firebase emulators:exec --only firestore,auth --project demo-remotion "node le05CameraPageBrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync, mkdirSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/le05-camera-r2/browser`;
mkdirSync(`${shots}/video`, { recursive: true });
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const port = Number(process.env.PORT || 5183); // own port: never reuse a dev server someone else left running
const password = "le05-local-only-123", tag = Date.now();
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };
const note = (t) => console.log(`NOTE | ${t}`);
const email = `le05-${tag}@local.test`;
const acct = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
assert.ok(acct.localId);
const P = { id: acct.localId, email, account: email, role: "patient", name: "LE05 patient", createdAt: new Date().toISOString() };
await seed(async (db) => { await setDoc(doc(db, "users", P.id), P); await setDoc(doc(db, "publicUsers", P.id), P); });
const cloudRecords = async () => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, "f01FixedPracticeRecords"), where("patientId", "==", P.id)))).docs.map((d) => d.data()); }); return out; };

/** 33 landmarks, side geometry, a given hip-knee-ankle angle; `hide` = landmark indices made low-visibility. */
function body(knee, hide = []) {
  const p = (x, y, v = 0.98) => ({ x, y, z: 0, visibility: v });
  const k = (knee * Math.PI) / 180;
  const pts = Array.from({ length: 33 }, () => p(0.5, 0.2));
  const kneeP = [0.5, 0.62], ankle = [0.5, 0.82], hip = [0.5 - 0.17 * Math.sin(k), 0.62 + 0.17 * Math.cos(k)];
  pts[11] = p(hip[0] - 0.02, hip[1] - 0.25); pts[12] = p(hip[0] + 0.02, hip[1] - 0.25);
  pts[23] = p(hip[0] - 0.01, hip[1]); pts[24] = p(hip[0] + 0.01, hip[1]);
  pts[25] = p(kneeP[0] - 0.01, kneeP[1]); pts[26] = p(kneeP[0] + 0.01, kneeP[1]);
  pts[27] = p(ankle[0] - 0.01, ankle[1]); pts[28] = p(ankle[0] + 0.01, ankle[1]);
  for (const i of hide) pts[i] = { ...pts[i], visibility: 0.1 };
  return pts;
}

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const MODEL_HOSTS = ["cdn.jsdelivr.net", "storage.googleapis.com"];
  async function login({ width = 390, height = 844, video = false, blockModel = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, ...(video ? { recordVideo: { dir: `${shots}/video`, size: { width, height } } } : {}) });
    context.blockModel = blockModel;
    // local app + the MediaPipe hosts only (the model is NOT blocked unless a step asks for the failure path)
    await context.route("**/*", (route) => { const h = new URL(route.request().url()).hostname; if (["localhost", "127.0.0.1"].includes(h)) return route.continue(); if (MODEL_HOSTS.includes(h) && !context.blockModel) return route.continue(); return route.abort(); });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate(() => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
    await page.locator("#loginAccount").fill(email); await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.locator(".top-profile-container").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 30000 });
    await page.waitForTimeout(1500);
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png` });
  const chip = (page) => page.locator("#le05StatusText").innerText();
  const guide = (page) => page.locator("#le05Guide").innerText();
  const count = (page) => page.locator("#le05RepCounterValue").innerText();
  /** 訓練 → F01 → 坐站練習 → 勾選 → 開始準備 → 開啟鏡頭 (clicks only). */
  async function toFixedCamera(page) {
    await page.locator(".bottom-nav").getByText("訓練", { exact: true }).click();
    await page.locator(".today-explore-card", { hasText: "功能評估與練習" }).click(); await page.locator(".body-region-btn.available").first().click(); // 2026-10-28: 訓練 → 六大功能構面 → F01
    await page.locator(".f01-fixed-practice-entry").click();
    await page.locator(".fp-read").click();
    await page.getByRole("button", { name: "開始準備" }).click();
    await page.getByRole("button", { name: "開啟鏡頭" }).click();
    await page.locator(".le05-page").waitFor({ timeout: 20000 });
  }
  // synthetic timeline continues from the last fed frame (66 ms per frame); knee null = no person in that frame
  const feed = async (page, seq) => page.evaluate(({ seq }) => { let t = globalThis.__t ?? performance.now(); const frames = []; for (const [knee, n, hide] of seq) for (let i = 0; i < n; i++) { t += 66; frames.push({ t, landmarks: knee == null ? null : globalThis.__body(knee, hide || []) }); } globalThis.__t = t; return window.__emulatorFeedLe05Landmarks(frames); }, { seq });
  const installBody = (page) => page.evaluate(`globalThis.__body = ${body.toString()}`);
  /** count, instruction and 結束練習 all on screen without scrolling; no horizontal overflow */
  async function visibleTrio(page, label) {
    const r = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [Math.round(b.top), Math.round(b.bottom), Math.round(b.left), Math.round(b.right)]; };
      return { vh: window.innerHeight, vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, count: box("#le05RepCounter"), guide: box("#le05Guide"), finish: box("#le05FinishBtn"), scroll: document.querySelector(".content").scrollTop, fontGuide: getComputedStyle(document.querySelector("#le05Guide")).fontSize, fontCount: getComputedStyle(document.querySelector("#le05RepCounterValue")).fontSize };
    });
    const inView = (b) => b && b[0] >= 0 && b[1] <= r.vh && b[2] >= 0 && b[3] <= r.vw;
    step(`L ${label}: count, instruction and 結束練習 visible without scrolling; no horizontal overflow`, inView(r.count) && inView(r.guide) && inView(r.finish) && r.scroll === 0 && r.sw <= r.vw, JSON.stringify(r));
  }

  // ═══ M. real model load on the fake camera (nothing blocked) — recorded ═══
  const p = await login({ video: true });
  await toFixedCamera(p);
  const seen = new Set();
  const t0 = Date.now();
  for (; Date.now() - t0 < 90000;) { const c = await chip(p); seen.add(c); if (!["正在開啟相機", "模型載入中"].includes(c)) break; await p.waitForTimeout(250); }
  const after = await chip(p), afterGuide = await guide(p);
  note(`status sequence seen: ${[...seen].join(" → ")} (model load took ~${Math.round((Date.now() - t0) / 1000)} s)`);
  step("M1 the real MediaPipe model loads (status leaves 模型載入中, not failed); with the fake camera (no person) it says so", after === "尚未完整入鏡" && afterGuide.includes("還看不到人"), `${after} | ${afterGuide}`);
  step("M2 camera page: title 坐站練習, 0 / 5 次, no engineering values or empty score", (await p.locator(".le05-title").innerText()) === "坐站練習" && (await count(p)) === "0" && (await p.locator(".le05-count").innerText()).replace(/\s+/g, "") === "0/5次"
    && !/AI 姿勢分數|平均膝角度|軀幹傾斜|追蹤狀態|LOST_|READY|PARTIAL|看不到手/.test(await p.locator(".phone").innerText()));
  await shot(p, "1-model-loaded-fake-camera");
  await installBody(p);
  // ═══ S. synthetic sit/stand through the page's own frame handler ═══
  await feed(p, [[100, 12, [27, 28]]]);
  step("S0 joints missing before any ready frame -> 尚未完整入鏡 + what to fix (not 請調整位置)", (await chip(p)) === "尚未完整入鏡" && (await guide(p)) === "請讓雙腳也在畫面內，可以再退後一點", await guide(p));
  await shot(p, "2-not-in-frame-feet");
  await feed(p, [[176, 15]]);
  step("S1 standing entry with the whole body in frame -> 還沒確認起始坐姿 / 請先坐好 (NOT 可以開始); count 0", (await chip(p)) === "還沒確認起始坐姿" && (await guide(p)).includes("請先坐好") && !(await guide(p)).includes("可以開始") && (await count(p)) === "0", await guide(p));
  await shot(p, "3-found-not-seated");
  const s2 = await feed(p, [[95, 8]]);
  step("S2 start posture observed -> 起始姿勢就緒 / 可以開始", (await chip(p)) === "起始姿勢就緒" && (await guide(p)).includes("可以開始"), `${await chip(p)} | ${await guide(p)} | ${JSON.stringify(s2)} | ${JSON.stringify(await p.evaluate(() => (window.__le05Trace || []).slice(-2)))}`);
  await shot(p, "4-ready");
  await feed(p, [[130, 2], [168, 6]]);
  step("S3 rising/standing -> 練習中 with the next action", (await chip(p)) === "練習中" && (await guide(p)) === "站直了，慢慢坐下", await guide(p));
  await feed(p, [[135, 2], [95, 5]]);
  step("S4 full rep -> 1 counted, flashed 已計入第 1 次", (await count(p)) === "1" && (await guide(p)).startsWith("已計入第 1 次"), await guide(p));
  await shot(p, "5-counted-1");
  await p.waitForTimeout(100);
  await feed(p, [[95, 40], [132, 3], [100, 6]]);
  step("S5 half rise and back down -> still 1 (not counted, not carried over)", (await count(p)) === "1");
  let r = await feed(p, [[160, 4], [null, 25]]);
  step("S6a tracking lost mid-rep -> 追蹤中斷，需要重新就緒", (await chip(p)) === "追蹤中斷，需要重新就緒" && (await count(p)) === "1", `${await chip(p)} | ${await guide(p)}`);
  await shot(p, "6-tracking-lost");
  r = await feed(p, [[176, 10]]);
  step("S6b back in frame standing -> must re-ready (還沒確認起始坐姿); the lost attempt not counted", (await chip(p)) === "還沒確認起始坐姿" && r.totalReps === 1 && r.unconfirmed >= 1, JSON.stringify(r));
  // slow rep: >10 s fully tracked (already-fixed behavior must hold)
  r = await feed(p, [[95, 6], [128, 60], [168, 60], [132, 40], [95, 5]]);
  step("S7 slow rep (>10 s, fully tracked) still counted (slow-rep fix not regressed)", r.totalReps === 2, JSON.stringify(r));
  for (let i = 0; i < 3; i++) r = await feed(p, [[95, 6], [130, 2], [168, 5], [135, 2], [95, 5]]);
  step("S8 5 / 5 -> 已完成目標, camera stopped, 結束練習 still on screen", r.totalReps === 5 && (await chip(p)) === "已完成目標" && (await count(p)) === "5" && await p.locator("#le05FinishBtn").isVisible(), JSON.stringify(r));
  await shot(p, "7-completed");
  await p.locator("#le05FinishBtn").click();
  await p.locator(".f01-fixed-record").waitFor({ timeout: 20000 });
  await p.getByText("已同步到雲端").waitFor({ timeout: 20000 });
  const rec = (await cloudRecords())[0];
  step("S9 saved as the actual AI count (5/5; the unconfirmed attempts — standing entry, tracking loss — kept apart, not added), no self-report added, marked synthetic", rec.ai.countedReps === 5 && rec.ai.unconfirmedAttemptCount >= 1 && rec.selfReport === null && rec.emulatorSynthetic === true && rec.target.repetitions === 5, JSON.stringify(rec.ai));
  const v = p.video(); await p.context().close(); renameSync(await v.path(), `${shots}/video/camera-page-states-390.webm`);

  // ═══ F. model load failure -> clear message + 重新開始 works ═══
  const f = await login({ blockModel: true });
  await toFixedCamera(f);
  await f.locator("#le05RetryBtn").waitFor({ state: "visible", timeout: 60000 });
  step("F1 model download fails -> 無法開始, the reason, a 重新開始 button; 結束練習 still visible", (await chip(f)) === "無法開始" && (await f.locator("#le05OverlayText").innerText()).includes("模型載入失敗") && (await guide(f)) === "請按畫面上的「重新開始」再試一次" && await f.locator("#le05FinishBtn").isVisible());
  await shot(f, "8-model-failed");
  f.context().blockModel = false;
  await f.locator("#le05RetryBtn").click();
  for (let i = 0; i < 360 && ["正在開啟相機", "模型載入中", "無法開始"].includes(await chip(f)); i++) await f.waitForTimeout(250);
  step("F2 重新開始 after the network is back -> the model loads", (await chip(f)) === "尚未完整入鏡" && await f.locator("#le05RetryBtn").isHidden(), await chip(f));
  await f.context().close();

  // ═══ L. 390 / 430 / desktop ═══
  for (const [w, h] of [[390, 844], [430, 932], [1280, 800]]) {
    const q = await login({ width: w, height: h });
    await toFixedCamera(q);
    for (let i = 0; i < 360 && ["正在開啟相機", "模型載入中"].includes(await chip(q)); i++) await q.waitForTimeout(250);
    await installBody(q);
    await feed(q, [[176, 15]]);
    await visibleTrio(q, `${w}x${h}`);
    await shot(q, `L-${w}-camera`);
    await q.context().close();
  }

  // ═══ E/O. regular F01-04 training, squat, and the 5xSTS assessment ═══
  const o = await login();
  /** 訓練 → F01 → 直接開始訓練 → card i (F01-01 / F01-04) → 開始訓練 → 開啟鏡頭 */
  async function directCamera(i) {
    await o.locator(".bottom-nav").getByText("訓練", { exact: true }).click();
    await o.locator(".today-explore-card", { hasText: "功能評估與練習" }).click(); await o.locator(".body-region-btn.available").first().click(); // 2026-10-28: 訓練 → 六大功能構面 → F01
    await o.locator(".functional-assessment-problem-card", { hasText: "直接開始訓練" }).click();
    await o.locator(".exercise-grid > *").nth(i).click();
    const name = await o.locator(".exp-header-title").innerText();
    await o.getByRole("button", { name: "開始訓練" }).click();
    await o.getByRole("button", { name: "開啟鏡頭" }).click();
    await o.locator('[id$="StatusOverlay"]').first().waitFor({ timeout: 20000 });
    return name;
  }
  const leave = async () => { await o.locator(".phone .header .detail-back-btn").first().click(); await o.waitForTimeout(500); if (await o.locator(".phone .header .detail-back-btn").count() && !(await o.locator(".bottom-nav").count())) { await o.locator(".phone .header .detail-back-btn").first().click(); await o.waitForTimeout(400); } };
  const le05Name = await directCamera(1);
  step(`E1 regular F01-04 training (${le05Name}) opens the same camera page with its catalog name and 結束練習`, (await o.locator(".le05-page").count()) === 1 && (await o.locator(".le05-title").innerText()) === le05Name && le05Name !== "坐站練習" && await o.locator("#le05FinishBtn").isVisible());
  await o.locator("#le05FinishBtn").click();
  await o.waitForTimeout(300);
  step("E2 regular training with 0 reps: 結束練習 keeps the existing rule (nothing saved, asks for a rep)", String(o.lastDialog || "").includes("尚未偵測到完整動作") && (await o.locator(".le05-page").count()) === 1, String(o.lastDialog));
  await leave();
  const squatName = await directCamera(0);
  step(`O1 ${squatName}: its own detection page (not the 坐站 page)`, (await o.locator(".le05-page").count()) === 0 && (await o.locator('[id^="squat"]').count()) > 0);
  await shot(o, "9-other-exercise-camera");
  await leave();
  await o.locator(".bottom-nav").getByText("訓練", { exact: true }).click();
  await o.locator(".today-explore-card", { hasText: "功能評估與練習" }).click(); await o.locator(".body-region-btn.available").first().click(); // 2026-10-28: 訓練 → 六大功能構面 → F01
  await o.locator(".functional-assessment-problem-card", { hasText: "先進行功能評估" }).click();
  await o.waitForTimeout(500);
  const fa = (await o.locator(".phone").innerText()).replace(/\s+/g, " ");
  step("O2 5xSTS assessment page still opens with its own content (not the training camera page)", (await o.locator(".le05-page").count()) === 0 && /五次坐站/.test(fa), fa.slice(0, 120));
  await o.context().close();
  step("no page errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
