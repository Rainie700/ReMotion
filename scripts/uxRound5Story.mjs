// 使用體驗改善 5/5 — ONE continuous synthetic story for the presentation screenshots (P03–P09), clicked in the real app.
// LOCAL only: this repo's own Vite dev server (own port 5187, emulator mode) + the local Auth/Firestore emulators
// (demo-remotion). Accounts made here (示範患者 / 示範復健師, no patient00/01); nothing reaches a cloud project; no paid
// service is called (in emulator mode the app refuses every model call itself — js/services/llmProviderAdapter.js).
//
// Story days are the patient's / therapist's browser clock shifted back (init script: Date only, timers untouched), so
// every date the app writes and shows is the story's date. Server timestamps (rules: createdAt == request.time) are the
// real time — never shown on these pages.
//
// SEEDED by the emulator admin (listed in the asset list): the two accounts, the accepted therapist relation, and the
// completed training dates of days 1–6 (trackingCycles.completedTrainingDates, + seededSynthetic). Everything else is
// clicked. Camera: Chromium's FAKE camera (test pattern, no person) + the real MediaPipe model; every counted sit-to-stand
// is SYNTHETIC landmarks (window.__emulatorFeedLe05Landmarks) and the 5xSTS times are SYNTHETIC finished runs handed to
// the real completion handler (window.__emulatorFinishFa5xRun). Nothing here shows a real person being recognised.
//
//   REPO=<repo> SHOTS=<dir> firebase emulators:exec --only firestore,auth --project demo-remotion "node uxRound5Story.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/ux-r5/presentation/raw`;
const STOP_AFTER = process.env.STOP_AFTER || "";
mkdirSync(`${shots}/video`, { recursive: true });
const port = Number(process.env.PORT || 5187);
const { toLocalDateKey } = await import(pathToFileURL(`${repo}/js/data/trackingCycle.js`).href);
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const password = "ux5-local-only-123", tag = Date.now();
const results = [], manifest = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${String(detail).slice(0, 400)}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };
const note = (t) => console.log(`NOTE | ${t}`);
const DAY = 86400000;
// story day N (1..7) = real today − (7 − N) days, at a set time of day; day 7 is the real today
const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
const storyAt = (n, hhmm = "09:30") => midnight.getTime() - (7 - n) * DAY + (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5))) * 60000;
const storyOffset = (n, hhmm) => storyAt(n, hhmm) - Date.now(); // taken when a context opens; the clock then runs normally
const storyKey = (n) => toLocalDateKey(new Date(storyAt(n, "12:00")));
note(`story: day 1 = ${storyKey(1)}, day 7 = ${storyKey(7)}`);

async function account(role, label, name) {
  const email = `ux5-${label}-${tag}@local.test`;
  const data = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  assert.ok(data.localId, JSON.stringify(data));
  const user = { id: data.localId, email, account: email, role, name, createdAt: new Date(storyAt(1) - 2 * DAY).toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
const therapist = await account("therapist", "therapist", "示範復健師");
const patient = await account("patient", "patient", "示範患者");
const relAt = new Date(storyAt(1, "15:00") - 2 * DAY).toISOString();
const rel = { id: `rel-ux5-${tag}`, therapistId: therapist.id, patientId: patient.id, status: "accepted", createdAt: relAt, acceptedAt: relAt };
await seed((db) => setDoc(doc(db, "therapistPatientRelations", rel.id), rel));
const seeded = [`users/${therapist.id}（示範復健師）`, `users/${patient.id}（示範患者）`, `therapistPatientRelations/${rel.id}（accepted，${relAt.slice(0, 10)}）`];

/** Date-only clock shift for one browser context (timers, performance.now and the network are untouched). */
const clockShift = (ms) => `(() => { const OFF = ${ms}; if (!OFF) return; const R = Date;
  function D(...a) { if (!new.target) return new R(R.now() + OFF).toString(); return a.length ? new R(...a) : new R(R.now() + OFF); }
  D.prototype = R.prototype; D.now = () => R.now() + OFF; D.parse = R.parse; D.UTC = R.UTC; Object.setPrototypeOf(D, R); globalThis.Date = D; })();`;

/** 33 landmarks, side geometry, a given hip-knee-ankle angle (same generator as the round-2 camera check). */
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
let browser, lastPage = null;
const errors = [];
const MODEL_HOSTS = ["cdn.jsdelivr.net", "storage.googleapis.com"]; // the MediaPipe model only (free CDN), as in round 2
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  note(`app: http://127.0.0.1:${port}/?emulator=1 (Vite dev server started by this script in ${repo})`);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const OPTIONAL = ["trackingCycles", "f01FixedPracticeRecords", "dailyTrainingFeedback", "d5TherapistReviews", "f01InitialReviews"];
  async function hydrated(page) {
    await page.locator(".top-profile-container, .therapist-workspace, .phone .header").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 30000 });
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(async (names) => { const { storageService } = await import("/js/data/storageService.js"); return names.map((n) => storageService.getOptionalCloudLoadStatus(n)); }, OPTIONAL);
      if (!st.includes("loading")) break;
      if (Date.now() - t0 > 30000) throw Error(`hydration ${st}`);
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1200);
    if (await page.getByRole("button", { name: "稍後再填" }).count()) { await page.getByRole("button", { name: "稍後再填" }).click(); await page.waitForTimeout(400); }
  }
  /** One browser context per account and story day (no shared local storage). */
  async function login(user, day, { at = "09:30", width = 390, height = 844, video = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, ...(video ? { recordVideo: { dir: `${shots}/video`, size: { width, height } } } : {}) });
    await context.addInitScript(clockShift(storyOffset(day, at)));
    await context.route("**/*", (route) => { const h = new URL(route.request().url()).hostname; if (["localhost", "127.0.0.1"].includes(h) || MODEL_HOSTS.includes(h)) return route.continue(); return route.abort(); });
    const page = await context.newPage();
    lastPage = page;
    page.on("pageerror", (e) => errors.push(`${user.name} d${day}: ${e.message}`));
    page.on("console", (m) => { if (m.type() === "error") console.log(`CONSOLE | ${m.type()} | ${m.text().slice(0, 300)}`); });
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate((role) => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole(role); window.confirmAuthRole(); }, user.role);
    await page.locator("#loginAccount").fill(user.email); await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(() => !document.querySelector("#loginAccount"), null, { timeout: 20000 });
    await hydrated(page);
    const shownToday = await page.evaluate(() => new Date().toLocaleString("zh-TW", { hour12: false }));
    note(`${user.name} logged in on story day ${day} (browser clock ${shownToday})`);
    return page;
  }
  const imagesReady = (page) => page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
  const text = async (page, sel = ".phone") => (await page.locator(sel).first().innerText()).replace(/\s+/g, " ");
  const nav = (page, name) => page.locator(".bottom-nav").getByText(name, { exact: true }).click();
  const pause = (page, ms = 700) => page.waitForTimeout(ms);
  /** viewport shot (what the phone shows) + a full-length shot of the same page. */
  async function capture(page, id, meta) {
    await imagesReady(page); await pause(page, 400);
    await page.screenshot({ path: `${shots}/${id}.png` });
    const vp = page.viewportSize();
    const H = await page.evaluate(() => { const c = document.querySelector(".content"); return c ? c.scrollHeight + (document.querySelector(".phone").offsetHeight - c.clientHeight) : document.body.scrollHeight; });
    if (H > vp.height + 40) { await page.setViewportSize({ width: vp.width, height: H }); await pause(page, 300); await page.screenshot({ path: `${shots}/${id}-full.png` }); await page.setViewportSize(vp); await pause(page, 200); }
    manifest.push({ id, full: H > vp.height + 40, ...meta });
    note(`captured ${id}`);
  }
  async function closeWithVideo(page, name) { const v = page.video(); await page.context().close(); if (v) renameSync(await v.path(), `${shots}/video/${name}.webm`); }
  const installBody = (page) => page.evaluate(`globalThis.__body = ${body.toString()}`);
  const feed = async (page, seq) => page.evaluate(({ seq }) => { let t = globalThis.__t ?? performance.now(); const frames = []; for (const [knee, n, hide] of seq) for (let i = 0; i < n; i++) { t += 66; frames.push({ t, landmarks: knee == null ? null : globalThis.__body(knee, hide || []) }); } globalThis.__t = t; return window.__emulatorFeedLe05Landmarks(frames); }, { seq });

  // ═══ Day 1 — first assessment, goal, recommendation (patient) ═══
  const d1 = await login(patient, 1, { video: true });
  await nav(d1, "首頁");
  await d1.locator(".functional-assessment-action.primary").click(); // 開始自主復健
  await pause(d1);
  await d1.locator(".body-region-btn.available").first().click(); // F01 下肢功能
  await pause(d1);
  await d1.getByText("A｜先進行功能評估").click();
  await pause(d1);
  step("S1 day 1: 首頁 → 開始自主復健 → F01 → A｜先進行功能評估 opens the 5xSTS preparation", (await text(d1)).includes("開始評估"));
  await capture(d1, "P05-01", { day: 1, role: "患者", path: "首頁 → 開始自主復健 → F01 下肢功能 → A｜先進行功能評估", data: "介面頁面（無資料）" });
  await d1.getByRole("button", { name: "開始評估 →" }).click();
  await d1.waitForFunction(() => typeof window.__emulatorFinishFa5xRun === "function");
  await pause(d1, 6000); // the real model on the fake camera (no person)
  await capture(d1, "P05-02", { day: 1, role: "患者", path: "P05-01 → 開始評估", data: "Chromium 假鏡頭（測試圖樣，沒有人）＋真實 MediaPipe 模型" });
  const finished = await d1.evaluate(async () => {
    const { FA5X_CURRENT_MEASUREMENT_FIELDS: m } = await import("/js/data/fa5xMeasurementCompatibility.js");
    return window.__emulatorFinishFa5xRun({ ...m, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 12400, startCueTimestamp: performance.now() - 13600, movementOnsetMs: 450 });
  });
  step("S2 synthetic finished run (12.4 s) handed to the real completion handler", finished && finished.ok === true, JSON.stringify(finished));
  await d1.locator(".fa5x-result-hero").waitFor({ timeout: 20000 });
  await d1.getByText("評估已保存").first().waitFor({ timeout: 20000 });
  const t1 = await text(d1);
  step("S3 result: 12.4 秒, purpose, 評估已保存 (real save state), condition entry", t1.includes("12.4") && t1.includes("評估已保存") && (await d1.locator(".fa5x-cond-entry").count()) === 1, t1.slice(0, 300));
  await capture(d1, "P05-03", { day: 1, role: "患者", path: "P05-02 → 評估結束（合成完成結果）→ 評估結果", data: "合成完成結果 12.4 秒（emulatorSynthetic，經真實結果處理流程保存）" });
  await d1.locator(".fa5x-cond-entry").click();
  await d1.locator('input[name="fa5xCondArms"][value="no"]').check();
  if (await d1.locator('input[name="fa5xCondAssist"][value="no"]').count()) await d1.locator('input[name="fa5xCondAssist"][value="no"]').check();
  await d1.locator('input[name="fa5xCondSource"][value="self_report"]').check();
  await d1.getByRole("button", { name: "儲存測試條件" }).click(); await pause(d1, 1200);
  await d1.getByRole("button", { name: "查看訓練建議 →" }).click(); await pause(d1);
  await capture(d1, "P06-01", { day: 1, role: "患者", path: "評估結果 → 查看訓練建議", data: "介面頁面（目標清單）" });
  await d1.locator(".f01-goal-card", { hasText: "加強整體下肢力量" }).click(); await pause(d1, 400);
  await d1.getByRole("button", { name: "20 分鐘" }).click(); await pause(d1, 400);
  await d1.evaluate(() => { const h = [...document.querySelectorAll("b, h3")].find((e) => e.textContent.includes("這次大約有多少時間")), c = document.querySelector(".content"); if (h && c) c.scrollTop += h.getBoundingClientRect().top - 150; }); await pause(d1, 300); // time + limitations in view
  await capture(d1, "P06-02", { day: 1, role: "患者", path: "選擇「加強整體下肢力量」→ 選擇 20 分鐘，限制條件不勾選", data: "本人選擇" });
  await d1.getByRole("button", { name: "產生訓練建議 →" }).click();
  await d1.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
  await pause(d1, 1500);
  await capture(d1, "P06-03", { day: 1, role: "患者", path: "產生訓練建議 →", data: "推薦規則（f01-goal-rec）依評估結果、目標與時間產生；不是 Gemini" });
  const [cycle] = await adminQuery("trackingCycles", "patientId", patient.id);
  const recs = await adminQuery("recommendationResults", "patientId", patient.id);
  note(`cycle ${JSON.stringify(cycle && { id: cycle.id, start: cycle.cycleStartDateKey, planned: cycle.plannedReassessmentDateKey, rec: cycle.recommendationId })}`);
  note(`recs ${JSON.stringify(recs.map((r) => ({ id: r.id, items: r.exerciseIds, status: r.status, review: r.initialReview })))}`);
  step("S4 first week created on day 1 from the plan (F01-01 / F01-02 / F01-04)", !!cycle && cycle.cycleStartDateKey === storyKey(1) && recs.length === 1 && JSON.stringify(recs[0].exerciseIds) === JSON.stringify(["F01-01", "F01-02", "F01-04"]), JSON.stringify(cycle && cycle.cycleStartDateKey));
  await closeWithVideo(d1, "P05-P06-day1-assessment-recommendation");
  if (STOP_AFTER === "day1") throw Error("STOP_AFTER day1");

  // ═══ Days 1–5 — training days (SEEDED: what five completed days would have written; the week is then labelled 展示合成資料) ═══
  const seededDays = [1, 2, 3, 4, 5].map(storyKey);
  await seed((db) => updateDoc(doc(db, "trackingCycles", cycle.id), { completedTrainingDates: seededDays, demoSynthetic: true, seededSynthetic: true }));
  seeded.push(`trackingCycles/${cycle.id}.completedTrainingDates = ${seededDays.join("、")}（第 1–5 天完成日；同時標記 demoSynthetic，畫面會顯示「展示合成資料」）`);

  // ═══ Day 6 — home, the formal F01-04 training (synthetic input), the day's report ═══
  const d6 = await login(patient, 6, { at: "09:10", video: true });
  await nav(d6, "首頁"); await pause(d6);
  let t = await text(d6);
  step("S5 day 6 home: the week card (第 6 / 7 天, 5 days done) is the one primary task", (await d6.locator(".functional-assessment-feature-card").count()) === 1 && /開始今日訓練|繼續今日訓練/.test(t), t.slice(0, 400));
  await capture(d6, "P03-01", { day: 6, role: "患者", path: "登入 → 首頁", data: "第 1–5 天完成日為模擬器寫入（展示合成資料）；週期與評估為第 1 天介面操作產生" });
  await nav(d6, "訓練"); await pause(d6);
  note(`training tab: ${(await text(d6)).slice(0, 500)}`);
  await d6.locator(".today-task", { hasText: "坐姿起立" }).locator(".today-task-start").click();
  await pause(d6, 1200);
  note(`after start: ${(await text(d6)).slice(0, 400)}`);
  if (!(await d6.getByRole("button", { name: "開啟鏡頭" }).count())) {
    for (const name of ["開始訓練", "開始練習", "開始準備", "開始 →"]) if (await d6.getByRole("button", { name }).count()) { await d6.getByRole("button", { name }).first().click(); await pause(d6, 900); break; }
  }
  step("S6 the formal cycle's 坐姿起立 preparation page (開啟鏡頭)", (await d6.getByRole("button", { name: "開啟鏡頭" }).count()) === 1, (await text(d6)).slice(0, 300));
  await capture(d6, "P07-01", { day: 6, role: "患者", path: "訓練 → 今日任務「坐姿起立」→ 開始", data: "第 1 天建立的正式週期（F01-04 坐姿起立）" });
  await d6.getByRole("button", { name: "開啟鏡頭" }).click();
  await d6.locator(".le05-page").waitFor({ timeout: 20000 });
  await d6.waitForFunction(() => !["正在開啟相機", "模型載入中"].includes(document.querySelector("#le05StatusText")?.textContent || ""), null, { timeout: 60000 }).catch(() => {});
  note(`le05 status after model load: ${await d6.locator("#le05StatusText").innerText()} | ${await d6.locator("#le05Guide").innerText()}`);
  await installBody(d6);
  const target = Number(((await d6.locator("#le05RepCounter").innerText()).match(/\/\s*(\d+)/) || [])[1]);
  await feed(d6, [[95, 8]]);
  const REP = [[95, 14], [110, 10], [130, 10], [150, 10], [168, 14], [150, 10], [130, 10], [110, 10], [95, 10]]; // ~6 s per sit-to-stand (66 ms frames)
  let fed;
  for (let i = 0; i < Math.min(5, target - 1); i++) fed = await feed(d6, REP);
  await feed(d6, [[95, 14], [110, 10], [130, 10], [150, 10], [168, 6]]); // mid-rep: standing, so the guidance line is live
  await pause(d6, 500);
  step("S7 synthetic landmarks counted by the page's own counter", fed && fed.ok && fed.totalReps >= 1 && Number(await d6.locator("#le05RepCounterValue").innerText()) === fed.totalReps, JSON.stringify(fed));
  await capture(d6, "P07-02", { day: 6, role: "患者", path: "P07-01 → 開啟鏡頭（計次中）", data: "合成輸入示範：Chromium 假鏡頭＋程式產生的關節點（__emulatorFeedLe05Landmarks），不是真人辨識" });
  fed = await feed(d6, [[168, 8], [150, 10], [130, 10], [110, 10], [95, 10]]);
  while (fed.totalReps < target && !fed.completed) fed = await feed(d6, REP);
  await pause(d6, 1500);
  if (await d6.locator("#le05FinishBtn").count()) { await d6.locator("#le05FinishBtn").click(); }
  await pause(d6, 1200);
  step("S8 training result view: count, AI score, save state (no raw error)", (await d6.locator(".exp-result-head").count()) === 1 && /已同步到雲端|儲存中/.test(await text(d6, ".exp-result-head")), await text(d6));
  await d6.getByText("已同步到雲端").first().waitFor({ timeout: 20000 });
  await capture(d6, "P07-03", { day: 6, role: "患者", path: "P07-02 → 完成 24 次 → 結束練習 → 訓練結果", data: "合成輸入示範的計次結果；「已同步到雲端」為本機模擬器實際回應" });
  const aiRecs = await adminQuery("analysisRecords", "patientId", patient.id);
  step("S9 the training record reached the (local) cloud — undefined fields no longer block the write", aiRecs.some((r) => r.exerciseId === "F01-04" && r.totalReps === target), JSON.stringify(aiRecs.map((r) => [r.exerciseId, r.totalReps])));
  // SEEDED: the week's other training sessions (days 1–5: 3 exercises; day 6: 深蹲 / 迷你深蹲, which have no synthetic-input
  // tool), shaped like the day-6 record made in the UI and marked demoSynthetic — so 訓練紀錄 and the week's 6 days agree
  const tpl = aiRecs.find((r) => r.exerciseId === "F01-04");
  const EX = { "F01-01": ["深蹲", "mediapipe_squat", 30], "F01-02": ["迷你深蹲", "mediapipe_f01_02_mini_squat", 20], "F01-04": ["坐姿起立", tpl.analysisMode, 24] };
  const seededRecs = [];
  for (const day of [1, 2, 3, 4, 5, 6]) {
    (day === 6 ? ["F01-01", "F01-02"] : ["F01-01", "F01-02", "F01-04"]).forEach((exId, i) => {
      const [name, mode, reps] = EX[exId];
      const at = new Date(storyAt(day, "09:15") + (day === 6 ? i + 1 : i) * 9 * 60000).toISOString();
      const score = [88, 91, 86, 93, 90, 89][day - 1] - i;
      const id = `analysis_ux5seed_${day}_${exId.replace("-", "")}_${tag}`;
      seededRecs.push({ ...tpl, id, exerciseId: exId, exerciseName: name, analysisMode: mode, completedAt: at, capturedAt: at, createdAt: at, localDateKey: storyKey(day), totalReps: reps, targetReps: reps, validReps: reps, score, overallScore: score, repRecords: [], remark: "", summary: { totalReps: reps, targetReps: reps, validReps: reps },
        ...(tpl.executionContext ? { executionContext: { ...tpl.executionContext, exerciseId: exId, planDateKey: storyKey(day), trainingStartedAt: at } } : {}), demoSynthetic: true, seededSynthetic: true });
    });
  }
  await seed(async (db) => { for (const r of seededRecs) await setDoc(doc(db, "analysisRecords", r.id), r); });
  seeded.push(`analysisRecords × ${seededRecs.length}（第 1–5 天深蹲／迷你深蹲／坐姿起立、第 6 天深蹲／迷你深蹲；仿第 6 天介面紀錄的欄位，標記 demoSynthetic）`);
  // the day's report for THIS week (cycle sheet from 本週訓練)
  await d6.locator(".exp-cta-bar .exp-cta").click(); await pause(d6);
  await nav(d6, "訓練"); await pause(d6);
  await d6.locator(".today-overview-week").getByRole("button", { name: "查看本週訓練" }).click();
  await d6.locator(".daily-feedback-entry.daily-feedback-cycle").waitFor({ timeout: 20000 });
  await d6.locator(".daily-feedback-cycle").getByRole("button", { name: "填寫回報" }).click();
  const sheet = d6.locator("#dailyFeedbackSheet .dfs-panel");
  const dfOpt = (label) => sheet.locator(".dfs-option", { hasText: new RegExp(`^\s*${label}\s*$`) });
  await sheet.waitFor();
  await dfOpt("有點吃力").click(); await pause(d6, 300);
  t = await text(d6, "#dailyFeedbackSheet .dfs-panel");
  step("S10 cycle sheet names this week and day 6", t.includes("本週期今日回報") && t.includes(`（${storyKey(1).slice(5, 7)}/${storyKey(1).slice(8, 10)} 開始）第 6 天`), t);
  await capture(d6, "P08-02", { day: 6, role: "患者", path: "訓練 → 查看本週訓練 → 本週期今天練習感覺如何？→ 填寫回報", data: "本人於第 6 天填寫（選項為介面點選）" });
  await sheet.getByRole("button", { name: "下一步" }).click();
  await dfOpt("有不舒服").click(); await sheet.getByRole("button", { name: "下一步" }).click();
  for (let i = 0; i < 3 && !(await sheet.getByRole("button", { name: "送出本週期回報" }).count()); i++) {
    if (await dfOpt("先不填原因").count()) await dfOpt("先不填原因").click();
    if (await d6.locator("#dailyFeedbackNote").count()) await d6.locator("#dailyFeedbackNote").fill("練完深蹲後右膝有點緊，休息後好一些。");
    if (await sheet.getByRole("button", { name: "下一步" }).count()) await sheet.getByRole("button", { name: "下一步" }).click();
    await pause(d6, 300);
  }
  if (await d6.locator("#dailyFeedbackNote").count()) await d6.locator("#dailyFeedbackNote").fill("練完深蹲後右膝有點緊，休息後好一些。");
  await sheet.getByRole("button", { name: "送出本週期回報" }).click();
  await sheet.locator(".dfs-done").waitFor({ timeout: 20000 });
  await sheet.getByRole("button", { name: "完成" }).click();
  const [fb] = await adminQuery("dailyTrainingFeedback", "patientId", patient.id);
  step("S11 the cycle report saved with its subject (this week)", !!fb && fb.reports.some((r) => r.subject && r.subject.cycleId === cycle.id), JSON.stringify(fb && fb.reports.map((r) => r.subject)));
  await closeWithVideo(d6, "P07-P08-day6-training-report");
  await seed((db) => updateDoc(doc(db, "trackingCycles", cycle.id), { completedTrainingDates: [...seededDays, storyKey(6)] }));
  seeded.push(`trackingCycles/${cycle.id}.completedTrainingDates += ${storyKey(6)}（第 6 天：介面上實際完成坐姿起立（合成輸入），深蹲與迷你深蹲沒有合成輸入工具，當天完成日由模擬器寫入）`);

  // ═══ Day 7 — reassessment, comparison, records, next-stage status check (patient) ═══
  const d7 = await login(patient, 7, { at: "10:00", video: true });
  await nav(d7, "首頁"); await pause(d7);
  t = await text(d7, ".functional-assessment-feature-card");
  note(`day 7 home card: ${t}`);
  await d7.locator(".functional-assessment-feature-card").getByRole("button", { name: /進行再次評估/ }).first().click();
  await pause(d7);
  await d7.getByRole("button", { name: "開始評估 →" }).click();
  await d7.waitForFunction(() => typeof window.__emulatorFinishFa5xRun === "function");
  await pause(d7, 1500);
  const fin7 = await d7.evaluate(async () => {
    const { FA5X_CURRENT_MEASUREMENT_FIELDS: m } = await import("/js/data/fa5xMeasurementCompatibility.js");
    return window.__emulatorFinishFa5xRun({ ...m, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 10900, startCueTimestamp: performance.now() - 12000, movementOnsetMs: 420 });
  });
  step("S12 day 7 reassessment: synthetic finished run (10.9 s)", fin7 && fin7.ok === true, JSON.stringify(fin7));
  await d7.locator(".fa5x-condition-card").waitFor({ timeout: 20000 }); await pause(d7, 1500);
  await d7.locator(".fa5x-cond-entry").click();
  await d7.locator('input[name="fa5xCondArms"][value="no"]').check();
  if (await d7.locator('input[name="fa5xCondAssist"][value="no"]').count()) await d7.locator('input[name="fa5xCondAssist"][value="no"]').check();
  if (await d7.locator('input[name="fa5xCondSameChair"][value="yes"]').count()) await d7.locator('input[name="fa5xCondSameChair"][value="yes"]').check();
  await d7.locator('input[name="fa5xCondSource"][value="self_report"]').check();
  await d7.getByRole("button", { name: "儲存測試條件" }).click(); await pause(d7, 1500);
  t = await text(d7);
  step("S13 reassessment result: 10.9 秒, 再次評估, saved, next step 查看前後比較", t.includes("10.9") && t.includes("再次評估") && t.includes("評估已保存") && t.includes("查看前後比較"), t.slice(0, 300));
  await d7.getByRole("button", { name: "查看前後比較 →" }).click(); await pause(d7, 1000);
  t = await text(d7);
  step("S14 comparison: 12.4 → 10.9 (shown values), neutral wording", t.includes("12.4") && t.includes("10.9") && !/改善|進步|退步/.test(t), t.slice(0, 400));
  await capture(d7, "P08-03", { day: 7, role: "患者", path: "首頁 → 進行再次評估 → 開始評估（合成完成結果 10.9 秒）→ 回答測試條件 → 查看前後比較", data: "同一週期：第 1 天 12.4 秒（合成）→ 第 7 天 10.9 秒（合成），經真實流程保存與比較" });
  // alternative for P08-01: 數據 → 訓練紀錄
  await nav(d7, "數據"); await pause(d7);
  await d7.locator(".patient-data-seg", { hasText: "訓練紀錄" }).click(); await pause(d7, 800);
  await d7.evaluate(() => { const c = document.querySelector(".content"); if (c) c.scrollTop = 0; });
  t = await text(d7);
  step("S14b 訓練紀錄: this week's sessions on 6 days (10/22–10/27), day 7 not yet", t.includes("近 7 天訓練 18 次") && /6\s*訓練日/.test(t), t.slice(0, 300));
  await capture(d7, "P08-01", { day: 7, role: "患者", path: "數據 → 訓練紀錄", data: "第 1–5 天與第 6 天深蹲／迷你深蹲紀錄為模擬器寫入（展示合成資料）；第 6 天坐姿起立為介面操作（合成輸入）" });
  await nav(d7, "數據"); await pause(d7);
  await capture(d7, "X-05", { day: 7, role: "患者", path: "數據（總覽）", data: "同一故事的總覽", extra: true });
  if (STOP_AFTER === "day7a") throw Error("STOP_AFTER day7a");
  // next stage: status check (the day-6 report said 有不舒服 — answered the same way here)
  await d7.evaluate((id) => window.goTrackingComparison(id), cycle.id); await pause(d7, 800);
  await d7.getByRole("button", { name: /查看下一階段建議/ }).first().click(); await pause(d7, 800);
  await d7.getByRole("button", { name: "有", exact: true }).click(); await pause(d7, 300);
  await d7.locator("#d5DiscomfortNote").fill("第 6 天練完深蹲後右膝有點緊，休息後好一些。");
  await d7.getByRole("button", { name: "查看下一階段建議 →" }).click();
  await d7.waitForFunction(() => !!document.querySelector(".d5-status-card, .d5-review-hero"), null, { timeout: 20000 }); await pause(d7, 1500);
  t = await text(d7);
  const [proposal] = (await adminQuery("recommendationResults", "patientId", patient.id)).filter((r) => r.origin === "d5_next_cycle");
  step("S15 next-stage proposal stored; new discomfort → professional review (rule), no acceptance entry yet", !!proposal && proposal.d5.confirmationMode === "professional_review_required" && (await d7.locator('[onclick^="confirmD5ProposalFromUi"]').count()) === 0, JSON.stringify(proposal && { decision: proposal.d5.decision, mode: proposal.d5.confirmationMode, reasons: proposal.d5.reviewReasons, items: proposal.exerciseIds }));
  await capture(d7, "X-01", { day: 7, role: "患者", path: "前後比較 → 查看下一階段建議 → 有新的不適（補充說明）→ 查看下一階段建議", data: "規則依「有新的不適」要求復健師檢視（不是 Gemini）", extra: true });
  await closeWithVideo(d7, "P08-day7-reassessment-comparison");

  // ═══ Day 7 afternoon — therapist ═══
  const th = await login(therapist, 7, { at: "14:00", video: true });
  await pause(th, 800);
  t = await text(th);
  step("S16 therapist home: cases + pending items (the patient's next-stage review)", t.includes("示範患者"), t.slice(0, 500));
  await capture(th, "P03-02", { day: 7, role: "復健師", path: "復健師登入 → 首頁", data: "示範復健師與示範患者的合作關係為模擬器寫入；待辦來自患者在介面產生的下一階段建議" });
  await th.getByText("示範患者").first().click(); await pause(th, 1200);
  if (!(await th.getByText("AI 週摘要").count())) { await th.evaluate((id) => window.goCaseDetail(id, "overview"), patient.id); await pause(th, 1200); }
  note(`case detail: ${(await text(th)).slice(0, 600)}`);
  const gen = th.getByRole("button", { name: /產生第 1 週 AI 摘要|產生新草稿/ }).first();
  if (await gen.count()) { await gen.click(); await th.getByText("安全備用摘要").first().waitFor({ timeout: 30000 }).catch(() => {}); await pause(th, 1000); }
  const [sumDoc] = await adminQuery("llmWeeklySummaries", "cycleId", cycle.id);
  step("S17 weekly summary draft = the app's rule fallback (model calls are refused in emulator mode), labelled 安全備用摘要", !!sumDoc && JSON.stringify(sumDoc).includes("fallback") && (await th.getByText("安全備用摘要").count()) > 0, JSON.stringify(sumDoc && Object.keys(sumDoc)));
  await th.evaluate(() => { const h = [...document.querySelectorAll(".section-title")].find((e) => e.textContent.trim() === "AI 週摘要"); if (h) h.scrollIntoView({ block: "start" }); }); await pause(th, 300);
  await capture(th, "P09-01", { day: 7, role: "復健師", path: "首頁 → 示範患者 → AI 週摘要 → 產生新草稿", data: "示範摘要，非本次模型產出：本機模擬器模式不呼叫模型，畫面為 App 既有的規則備用摘要（安全備用摘要），依同一週期資料整理" });
  await th.getByRole("button", { name: "檢視並確認下一週安排" }).click(); await pause(th, 1000);
  // the form from its first row (the card's heading + the proposal just above it)
  await th.evaluate(() => { const r = document.querySelector(".d5-review-row-edit"), c = document.querySelector(".content"); if (r && c) c.scrollTop += r.getBoundingClientRect().top - 260; }); await pause(th, 300);
  const reason = th.locator(".d5-review-card textarea, .d5-review-form textarea").last();
  if (await reason.count()) await reason.fill("右膝緊繃已回報，下一週先維持原本三個動作與次數，請持續回報感受。");
  await capture(th, "P09-02", { day: 7, role: "復健師", path: "P09-01 → 檢視並確認下一週安排", data: "復健師於介面檢視；候選清單與訓練量來自既有規則" });
  await th.getByRole("button", { name: "確認這份安排" }).click(); await pause(th, 2000);
  const reviews = await adminQuery("d5TherapistReviews", "patientId", patient.id);
  step("S18 therapist confirmation written (local emulator)", reviews.length === 1 && reviews[0].proposalId === proposal.id, JSON.stringify(reviews.map((r) => r.items && r.items.map((i) => i.exerciseId))));
  await capture(th, "X-02", { day: 7, role: "復健師", path: "P09-02 → 確認這份安排", data: "確認結果", extra: true });
  await closeWithVideo(th, "P09-day7-therapist-review");

  // ═══ Day 7 evening — patient sees the confirmed arrangement and accepts ═══
  const p7 = await login(patient, 7, { at: "18:30", video: true });
  await nav(p7, "首頁"); await pause(p7);
  note(`home after review: ${(await text(p7, ".functional-assessment-feature-card")).slice(0, 300)}`);
  await p7.evaluate((id) => window.goD5Proposal(id), proposal.id); await pause(p7, 1200);
  t = await text(p7);
  step("S19 patient: 復健師已確認 + accept entry", t.includes("復健師已確認") && (await p7.locator('[onclick^="confirmD5ProposalFromUi"]').count()) >= 1, t.slice(0, 400));
  await capture(p7, "P09-03", { day: 7, role: "患者", path: "首頁 → 下一階段建議（復健師已確認）", data: "復健師在介面確認的安排" });
  await p7.locator('[onclick^="confirmD5ProposalFromUi"]').first().click(); await pause(p7, 2500);
  t = await text(p7);
  const accepted = (await adminQuery("recommendationResults", "patientId", patient.id)).find((r) => r.id === proposal.id);
  const cyclesNow = await adminQuery("trackingCycles", "patientId", patient.id);
  note(`after accept: status=${accepted && accepted.status} cycles=${cyclesNow.length} | ${t.slice(0, 400)}`);
  step("S20 accepted in the emulator", accepted && accepted.status === "accepted", t.slice(0, 300));
  await capture(p7, "X-03", { day: 7, role: "患者", path: "P09-03 → 接受這份安排", data: "接受後的既有流程畫面", extra: true });
  await nav(p7, "首頁"); await pause(p7);
  await capture(p7, "X-04", { day: 7, role: "患者", path: "接受後 → 首頁", data: "接受後的首頁", extra: true });
  await closeWithVideo(p7, "P09-day7-patient-accept");
} catch (e) {
  console.log(`ABORT | ${e.message}`);
  if (lastPage && !String(e.message).startsWith("STOP_AFTER")) { try { console.log(`ABORT page | dialog=${lastPage.lastDialog || ""} | ${(await lastPage.locator("body").innerText()).replace(/s+/g, " ").slice(0, 700)}`); await lastPage.screenshot({ path: `${shots}/abort.png` }); console.log(`ABORT dom | ${await lastPage.evaluate(() => JSON.stringify({ url: location.href, html: document.body.innerHTML.length, d5: document.querySelectorAll("[class*=d5-]").length, cls: [...document.querySelectorAll(".card")].slice(0, 6).map((e) => e.className) }))}`); } catch {} }
  if (!String(e.message).startsWith("STOP_AFTER")) process.exitCode = 1;
} finally {
  writeFileSync(`${shots}/manifest.json`, JSON.stringify({ storyDays: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((n) => [n, storyKey(n)])), seeded, manifest, results, errors }, null, 2));
  console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed; page errors: ${errors.length}${errors.length ? ` ${JSON.stringify(errors)}` : ""}`);
  if (browser) await browser.close();
  vite.kill();
  await env.cleanup();
}
