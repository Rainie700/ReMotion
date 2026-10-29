// G01 坐站練習 — BROWSER acceptance by real clicks (docs/F01_G01_PROGRAM_SELECTION.md 第六節 Decision A; UX round 1/5).
// Real Chromium (Playwright) on the Vite dev server in emulator mode (?emulator=1) against the LOCAL Auth +
// Firestore emulators (project demo-remotion). Two synthetic patients made here (a general patient, and one with a
// running G02 week made through the UI). Chromium's FAKE camera device is used, so only the camera permission /
// opening step is exercised; counting is fed SYNTHETIC knee angles through the emulator-only
// window.__emulatorFeedFixedPracticeFrames (records marked emulatorSynthetic). Real camera recognition is NOT verified.
// No patient00 / patient01 data, no Gemini, no cloud project.
//
//   REPO=<repo> SHOTS=<repo>/reports/f01-fixed-practice-browser \
//   firebase emulators:exec --only firestore,auth --project demo-remotion "node f01FixedPracticeBrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, deleteDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync, mkdirSync, renameSync, readdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/f01-fixed-practice-browser`;
mkdirSync(`${shots}/video`, { recursive: true });
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);
const { CASES, STEP } = await import(pathToFileURL(`${repo}/docs/verification/le05-slow-rep/cases.mjs`).href);

const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const port = Number(process.env.PORT || 5184); // own port: never reuse a dev server someone else left running
const password = "fp-local-only-123", tag = Date.now();
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };
const note = (t) => console.log(`NOTE | ${t}`);

async function makePatient(name, { assessment }) {
  const email = `fp-${name}-${tag}@local.test`;
  const acct = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  assert.ok(acct.localId);
  const P = { id: acct.localId, email, account: email, role: "patient", name: `FP ${name}`, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", P.id), P); await setDoc(doc(db, "publicUsers", P.id), P); });
  if (assessment) {
    P.faId = `fa-${P.id.slice(0, 8)}`;
    await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", P.faId), { id: P.faId, patientId: P.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed", startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), therapistId: "", relationId: "",
      result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 12400, measuredAt: new Date().toISOString(), seededSynthetic: true } }));
  }
  return P;
}
const N = await makePatient("general", { assessment: false }); // no assessment, no cycle, no records
const C = await makePatient("cycle", { assessment: true });    // gets a running G02 week below

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
const synthetic = (frames) => { let t = 1000; return frames.map((k) => ({ t: (t += STEP), knee: k })); };
const FIVE = synthetic(CASES.find((c) => c.id === "S10").frames);
const s1 = CASES.find((c) => c.id === "S1").frames.slice(6);
const EARLY = synthetic([...CASES.find((c) => c.id === "S8").frames, ...s1, ...s1]); // 1 unconfirmed, then 2 reps
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  const OPTIONAL = ["trackingCycles", "f01FixedPracticeRecords"];
  async function hydrated(page) {
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(async (names) => { const { storageService } = await import("/js/data/storageService.js"); return Object.fromEntries(names.map((n) => [n, storageService.getOptionalCloudLoadStatus(n)])); }, OPTIONAL);
      if (Object.values(st).every((v) => v === "loaded" || v === "failed")) {
        if (Object.values(st).includes("failed")) throw Error(`optional cloud load failed: ${JSON.stringify(st)}`);
        await page.locator(".top-profile-container").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 20000 });
        return;
      }
      if (Date.now() - t0 > 30000) throw Error(`hydration did not finish: ${JSON.stringify(st)}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  async function login(P, { width = 390, height = 844, video = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, ...(video ? { recordVideo: { dir: `${shots}/video`, size: { width, height } } } : {}) });
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate(() => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
    await page.locator("#loginAccount").fill(P.email);
    await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(() => !document.querySelector("#loginAccount"), null, { timeout: 20000 });
    await hydrated(page);
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png` });
  const text = async (page) => (await page.locator(".phone").innerText()).replace(/\s+/g, " ");
  const pause = (page, ms = 600) => page.waitForTimeout(ms); // keeps the recording watchable
  const cloudRecords = (P) => adminQuery("f01FixedPracticeRecords", "patientId", P.id);
  const cloudCycles = (P) => adminQuery("trackingCycles", "patientId", P.id);
  const cloudAnalysis = (P) => adminQuery("analysisRecords", "patientId", P.id);
  const nav = (page, name) => page.locator(".bottom-nav").getByText(name, { exact: true }).click();
  /** 訓練 tab -> F01 下肢功能 -> 坐站練習, by clicks only. */
  async function enterByClicks(page) {
    await nav(page, "訓練"); await pause(page);
    await page.locator(".today-explore-card", { hasText: "功能評估與練習" }).click(); await page.locator(".body-region-btn.available").first().click(); // 2026-10-28: 訓練 → 六大功能構面 → F01 await pause(page);
    await page.locator(".f01-fixed-practice-entry", { hasText: "坐站練習" }).click(); await pause(page);
    await page.locator(".fp-hero").waitFor({ timeout: 10000 });
  }
  const startBtn = (page) => page.getByRole("button", { name: "開始準備" });
  const cameraBtn = (page) => page.getByRole("button", { name: "開啟鏡頭" });
  /** No horizontal overflow; the primary action fully on screen and not under the nav; the last content block reachable. */
  async function layout(page, label, primary) {
    const r = await page.evaluate((sel) => {
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const b = sel ? document.querySelector(sel) : null, br = b && b.getBoundingClientRect();
      const nav = document.querySelector(".bottom-nav"), nr = nav && nav.getBoundingClientRect();
      const c = document.querySelector(".content");
      c.scrollTop = c.scrollHeight;
      const kids = [...c.querySelectorAll(":scope > * > *, :scope > *")].filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0);
      const last = kids.reduce((m, e) => Math.max(m, e.getBoundingClientRect().bottom), 0);
      const out = { overflowX: document.documentElement.scrollWidth - vw, wide: [...document.querySelectorAll(".phone *")].filter((e) => e.getBoundingClientRect().right > vw + 1).length,
        btn: br ? [Math.round(br.top), Math.round(br.bottom)] : null, navTop: nr ? Math.round(nr.top) : null, vh, lastBottom: Math.round(last), contentBottom: Math.round(c.getBoundingClientRect().bottom) };
      c.scrollTop = 0;
      return out;
    }, primary);
    const btnOk = !primary || (r.btn && r.btn[0] >= 0 && r.btn[1] <= (r.navTop ?? r.vh));
    step(`L ${label}`, r.overflowX <= 0 && r.wide === 0 && btnOk && r.lastBottom <= r.contentBottom + 1, JSON.stringify(r));
  }

  // ═══ N. general patient (no assessment, no cycle, no record) — recorded from the 訓練 tab to the camera ═══
  const n = await login(N, { video: true });
  await pause(n, 900);
  await enterByClicks(n);
  let t = await text(n);
  step("N1 訓練 → F01 → 坐站練習 by clicks; intro shows name, 本次目標 5 次, short line, fixed-practice tag",
    t.includes("坐站練習") && t.includes("本次目標 5 次") && t.includes("依照步驟練習，記錄本次完成次數。") && t.includes("固定練習，非個別訓練安排") && !t.includes("C｜"), t.slice(0, 300));
  step("N1b intro: 3 ordered steps, plain reminders + camera limit; no sources / research / engineering text, no 10-row history",
    (await n.locator(".fp-section .exp-steps > li").count()) === 3 && t.includes("出現暈眩、胸痛、喘不過氣") && t.includes("相機協助計次，無法確認是否使用手部支撐。")
    && !/NHS|Otago|五次坐站秒數|10 秒|nhs-sit-to-stand|看不到手|我的固定練習紀錄|來源|版本/.test(t), t.slice(300, 900));
  step("N1c 開始準備 and 自行記錄 disabled until the read row is ticked; 查看練習紀錄 always available",
    (await startBtn(n).isDisabled()) && (await n.getByRole("button", { name: "自行記錄" }).isDisabled()) && !(await n.getByRole("button", { name: /^查看練習紀錄/ }).isDisabled()));
  await shot(n, "1-intro-unread");
  // tick by clicking the TEXT of the row (whole row is the label), after scrolling to it
  await n.locator(".fp-read").scrollIntoViewIfNeeded();
  const before = await n.evaluate(() => document.querySelector(".content").scrollTop);
  const box = await n.locator(".fp-read small").boundingBox();
  await n.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await pause(n);
  const after = await n.evaluate(() => document.querySelector(".content").scrollTop);
  const rowY = await n.evaluate(() => { const c = document.querySelector(".fp-read input").getBoundingClientRect(), s = document.querySelector(".fp-read b").getBoundingClientRect(); return Math.abs((c.top + c.bottom) / 2 - (s.top + s.bottom) / 2); });
  // no re-render: the page does not jump back to the top and the ticked row stays on screen (the hint line under
  // 開始準備 disappears, so at the very bottom the scroll range shrinks by that line's height — that is all)
  const rowVisible = await n.evaluate(() => { const r = document.querySelector(".fp-read").getBoundingClientRect(), c = document.querySelector(".content").getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom; });
  step("N2 clicking the row's text ticks the box (whole row clickable), box on the same line as its text, no jump to the top; buttons enabled",
    (await n.locator("#f01FixedRead").isChecked()) && rowY <= 6 && before > 0 && after > 0 && rowVisible && !(await startBtn(n).isDisabled()) && !(await n.getByRole("button", { name: "自行記錄" }).isDisabled()) && (await n.locator(".fp-hint").isHidden()), JSON.stringify({ before, after, rowY, rowVisible }));
  await shot(n, "1-intro-read");
  await startBtn(n).click(); await pause(n);
  await cameraBtn(n).waitFor({ timeout: 20000 });
  t = await text(n);
  step("N3 prep: 準備開始, 坐站練習, 本次 5 次, placement + 3 checks, ONE 開啟鏡頭; no AI 觀察 chips, no repeated intro text",
    t.includes("準備開始") && t.includes("坐站練習") && t.includes("本次 5 次") && t.includes("開鏡頭前確認") && (await n.locator(".exp-check").count()) === 3
    && (await cameraBtn(n).count()) === 1 && !t.includes("AI 觀察") && (await n.locator(".exp-chip--body").count()) === 0
    && !t.includes("注意事項與 AI 說明") && !t.includes("固定練習目標") && !t.includes("五次坐站秒數") && !t.includes("10 秒") && !t.includes("3 組"), t.slice(0, 400));
  await n.getByText("全身入鏡", { exact: true }).click();
  step("N3b checklist rows toggle by tapping their text", await n.locator(".exp-check input").first().isChecked());
  await shot(n, "2-preparation");
  await cameraBtn(n).click();
  await n.locator(".le05-page[data-fixed-run]").waitFor({ timeout: 20000 });
  await pause(n, 2500);
  t = await text(n);
  const status = (await n.locator("#le05OverlayText").innerText()).trim();
  step("N4 camera page (round 2 layout): 坐站練習, 0 / 5 次, 結束練習 on screen", (await n.locator(".le05-title").innerText()) === "坐站練習" && t.includes("/ 5 次") && await n.locator("#le05FinishBtn").isVisible(), t.slice(0, 300));
  note(`camera status with Chromium's FAKE device (no real camera; model download blocked offline): 「${status || "(空白)"}」— only the opening / permission step is exercised`);
  await shot(n, "3-camera-opened-fake-device");
  const fed = await n.evaluate((frames) => window.__emulatorFeedFixedPracticeFrames(frames), FIVE);
  step("N5 synthetic frames through the real LE05 session: 5 counted", fed.ok && fed.totalReps === 5 && fed.completed, JSON.stringify(fed));
  await n.locator("#le05FinishBtn").click();
  await n.locator(".f01-fixed-record").waitFor({ timeout: 20000 });
  await n.getByText("已同步到雲端").waitFor({ timeout: 20000 });
  let cloud = await cloudRecords(N);
  step("N6 record page and cloud agree: AI 5 / 5, target 5, synced, synthetic; no version code on screen",
    (await text(n)).includes("5 / 5 次") && (await text(n)).includes("完成本次目標") /* round-4 result page */ && cloud.length === 1 && cloud[0].target.repetitions === 5 && cloud[0].ai.countedReps === 5 && cloud[0].emulatorSynthetic === true && !(await text(n)).includes("nhs-sit-to-stand"));
  await shot(n, "4-record-after-camera");
  await n.locator(".fp-page .header").getByRole("button", { name: "返回" }).click(); /* round 4: the result page header 返回 → 坐站練習 */ await pause(n);
  step("N7 back on the intro after a record: entry still there, 查看練習紀錄（1）", (await n.getByRole("button", { name: "查看練習紀錄（1）" }).count()) === 1);
  await n.locator(".fp-page .header").getByRole("button", { name: "返回" }).click(); await pause(n);
  await n.locator(".phone .header").getByRole("button", { name: "返回" }).click(); await pause(n);
  await n.locator(".phone .header").getByRole("button", { name: "返回" }).click(); await pause(n);
  step("N8 返回 F01 → 功能構面 → back on the 訓練 tab (where it was opened)", (await n.locator(".today-plan-page").count()) === 1);
  await enterByClicks(n);
  step("N9 re-entering 訓練 → F01 → 坐站練習 works again", (await n.locator(".fp-hero").count()) === 1);
  const nVideo = n.video();
  await n.context().close();
  const vPath = await nVideo.path();
  renameSync(vPath, `${shots}/video/entry-to-camera-390.webm`);
  for (const f of readdirSync(`${shots}/video`)) if (f !== "entry-to-camera-390.webm" && f.endsWith(".webm")) renameSync(`${shots}/video/${f}`, `${shots}/video/old-${f}`);

  // ═══ C. patient with a running week (G02, made in the UI) ═══
  const p = await login(C);
  await p.evaluate((id) => window.goFiveTimesSitToStandResult(id), C.faId); // setup only: the week itself
  await p.getByRole("button", { name: "查看訓練建議 →" }).click();
  await p.locator(".f01-goal-card", { hasText: "加強整體下肢力量" }).click();
  await p.getByRole("button", { name: "10 分鐘" }).click();
  await p.getByRole("button", { name: "產生訓練建議 →" }).click();
  await p.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  const cyclesBefore = await cloudCycles(C);
  const analysisBefore = (await cloudAnalysis(C)).length;
  step("C0 an existing running week (G02) before any fixed practice", cyclesBefore.length === 1, JSON.stringify(cyclesBefore.map((c) => c.selectedGoalId)));
  await nav(p, "首頁"); await pause(p);
  note(`home with a running week shows the 本週功能追蹤 hero; 開始自主復健 entry present: ${(await p.locator('[onclick="goFunctionalDomainHome()"]').count()) > 0} (that is why the 訓練 → F01 entry is needed)`);
  await enterByClicks(p);
  step("C1 with a running week: 訓練 → F01 → 坐站練習 by clicks", (await text(p)).includes("本次目標 5 次"));
  // early end (2 of 5, 1 unconfirmed) while the cloud write is refused -> retry, no duplicate
  await p.locator(".fp-read").click();
  await startBtn(p).click();
  await cameraBtn(p).click();
  await p.locator(".le05-page[data-fixed-run]").waitFor({ timeout: 20000 });
  const runId = await p.locator(".le05-page").getAttribute("data-fixed-run");
  const blockedId = `f01FixedPractice_${C.id}_${runId}`;
  await seed((db) => setDoc(doc(db, "f01FixedPracticeRecords", blockedId), { id: blockedId, patientId: "someone-else", kind: "f01_fixed_practice" }));
  const fed2 = await p.evaluate((frames) => window.__emulatorFeedFixedPracticeFrames(frames), EARLY);
  step("C2a synthetic early stop: 2 counted, 1 unconfirmed (not added)", fed2.totalReps === 2 && fed2.unconfirmed === 1 && !fed2.completed, JSON.stringify(fed2));
  await p.locator("#le05FinishBtn").click();
  await p.locator(".f01-fixed-record").waitFor({ timeout: 20000 });
  await p.getByText("尚未同步到雲端").waitFor({ timeout: 20000 });
  t = await text(p);
  step("C2b ended early saved as it is (2 / 5, 1 unconfirmed); cloud write refused -> NOT shown as synced",
    t.includes("2 / 5 次") && t.includes("提前結束") && t.includes("另有 1 次動作無法確認，沒有計入") && !t.includes("已同步到雲端") && (await p.getByRole("button", { name: "重試同步" }).count()) === 1);
  await shot(p, "5-early-end-sync-failed");
  await seed((db) => deleteDoc(doc(db, "f01FixedPracticeRecords", blockedId)));
  await p.getByRole("button", { name: "重試同步" }).click();
  await p.getByText("已同步到雲端").waitFor({ timeout: 20000 });
  cloud = await cloudRecords(C);
  step("C2c retry -> synced; exactly one document for that run (no duplicate)", cloud.length === 1 && cloud[0].id === blockedId && cloud[0].ai.countedReps === 2, JSON.stringify(cloud.map((r) => [r.id.slice(-12), r.ai && r.ai.countedReps])));
  // 2026-10-28 (UX round 5/5): the self-report form is a closed secondary entry — opened first; same save checked
  await p.locator(".fpr-self-entry > summary").click();
  await p.locator("#f01FixedRecordSelfReps").fill("4");
  await p.getByRole("button", { name: "保存自行回報" }).click();
  // round 4: the result page shows the self-report as its own card (the history rows still use the line form)
  await p.getByText("本人填寫，另外保存，沒有加入 AI 計次。").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1200);
  cloud = await cloudRecords(C);
  step("C3 self-report added on the record: AI count still 2 in the cloud, self-report 4 kept apart", cloud[0].ai.countedReps === 2 && cloud[0].selfReport.totalReps === 4 && (await text(p)).includes("2 / 5 次"));
  // 自行記錄 from the intro (its own page, no camera)
  await p.locator(".fp-page .header").getByRole("button", { name: "返回" }).click(); /* round 4: the result page header 返回 → 坐站練習 */ await pause(p);
  await p.getByRole("button", { name: "自行記錄" }).click(); await pause(p);
  t = await text(p);
  step("C4a 自行記錄 page: no camera, saved as the person's own number", t.includes("自行記錄") && t.includes("不使用相機") && t.includes("目標 5 次") && (await cameraBtn(p).count()) === 0);
  await shot(p, "6-self-record");
  await p.locator("#f01FixedSelfReps").fill("5");
  await p.getByRole("button", { name: "保存自行回報" }).click();
  await p.locator(".f01-fixed-record").waitFor({ timeout: 20000 });
  await p.getByText("已同步到雲端").waitFor({ timeout: 20000 });
  cloud = await cloudRecords(C);
  const selfOnly = cloud.find((r) => r.ai === null);
  step("C4b self-report only: no AI count; no analysisRecord created", !!selfOnly && selfOnly.selfReport.totalReps === 5 && (await text(p)).includes("自行回報（這次沒有使用相機）") && (await cloudAnalysis(C)).length === analysisBefore);
  // 查看練習紀錄: its own page, existing data
  await p.locator(".fp-page .header").getByRole("button", { name: "返回" }).click(); /* round 4: the result page header 返回 → 坐站練習 */ await pause(p);
  await p.getByRole("button", { name: "查看練習紀錄（2）" }).click(); await pause(p);
  const rows = (await p.locator(".f01-fixed-history-row").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  step("C5a 練習紀錄 page lists both records (AI and self-report lines, sync state)", rows.length === 2 && rows.some((r) => r.includes("AI 計次：2 / 5 次") && r.includes("自行回報：4 次")) && rows.some((r) => r.includes("AI 計次：本次沒有使用相機")), JSON.stringify(rows));
  await shot(p, "7-history");
  await p.locator(".f01-fixed-history-row").first().click(); await pause(p);
  await p.locator(".fp-page .header").getByRole("button", { name: "返回" }).click(); await pause(p);
  step("C5b record opened from 練習紀錄 returns to 練習紀錄", (await p.locator(".fp-history").count()) === 1);
  await p.reload(); await p.waitForFunction(() => typeof window.switchTab === "function"); await hydrated(p);
  const fresh = await login(C);
  await enterByClicks(fresh);
  await fresh.getByRole("button", { name: "查看練習紀錄（2）" }).click(); await pause(fresh);
  const rowsAgain = (await fresh.locator(".f01-fixed-history-row").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  step("C6 a new login reads back the same records (numbers + sync)", JSON.stringify(rowsAgain) === JSON.stringify(rows), JSON.stringify(rowsAgain));
  const cyclesAfter = await cloudCycles(C);
  step("C7 the running week is unchanged (same document, no completion days, no new cycle); no analysisRecord added",
    cyclesAfter.length === 1 && JSON.stringify(cyclesAfter[0]) === JSON.stringify(cyclesBefore[0]) && (cyclesAfter[0].completedTrainingDates || []).length === 0 && (await cloudAnalysis(C)).length === analysisBefore);
  await fresh.context().close();

  // ═══ L. layout at 390 / 430 / desktop (patient C, records present) ═══
  for (const [w, h] of [[390, 844], [430, 932], [1280, 800]]) {
    const q = await login(C, { width: w, height: h });
    await nav(q, "訓練"); await pause(q, 300);
    await layout(q, `${w} 訓練 tab`, ".today-overview-week .btn"); // with a running week the overview card carries 本週訓練 (UX round 5/5: merged into it)
    await q.locator(".today-explore-card", { hasText: "功能評估與練習" }).click(); await q.locator(".body-region-btn.available").first().click(); // 2026-10-28: 訓練 → 六大功能構面 → F01 await pause(q, 300);
    await layout(q, `${w} F01`, ".f01-fixed-practice-entry");
    await q.locator(".f01-fixed-practice-entry").click(); await pause(q, 300);
    await layout(q, `${w} intro (unread)`, ".page-action-bar .fp-start");
    await shot(q, `L-${w}-intro`);
    await q.locator(".fp-read").click();
    await layout(q, `${w} intro (read)`, ".page-action-bar .fp-start");
    await q.getByRole("button", { name: /^查看練習紀錄/ }).click(); await pause(q, 300);
    await layout(q, `${w} 練習紀錄`, null);
    await q.locator(".fp-page .header").getByRole("button", { name: "返回" }).click();
    await q.getByRole("button", { name: "自行記錄" }).click(); await pause(q, 300);
    await layout(q, `${w} 自行記錄`, ".page-action-bar .btn-primary");
    await q.locator(".fp-page .header").getByRole("button", { name: "返回" }).click();
    await startBtn(q).click(); await cameraBtn(q).waitFor();
    step(`L ${w} prep: exactly one 開啟鏡頭`, (await cameraBtn(q).count()) === 1);
    await layout(q, `${w} prep`, ".page-action-bar .exp-cta");
    await shot(q, `L-${w}-prep`);
    await q.context().close();
  }

  // ═══ O. other exercises' preparation pages (shared renderer) ═══
  const o = await login(C);
  await nav(o, "訓練"); await o.locator(".today-explore-card", { hasText: "功能評估與練習" }).click(); await o.locator(".body-region-btn.available").first().click(); // 2026-10-28: 訓練 → 六大功能構面 → F01
  await o.locator(".functional-assessment-problem-card", { hasText: "直接開始訓練" }).click(); await pause(o, 300);
  await o.locator(".exercise-grid > *").first().click(); await pause(o, 300);
  await o.getByRole("button", { name: "開始訓練" }).click();
  await cameraBtn(o).waitFor({ timeout: 20000 });
  const firstName = (await o.locator(".exp-prep-name").innerText()).trim();
  t = await text(o);
  step(`O1 another exercise's prep (${firstName}) keeps its own name, care line and folded notes; one 開啟鏡頭, no AI 觀察 chips`,
    !t.includes("坐站練習") && t.includes("注意事項與 AI 說明") && (await o.locator(".exp-prep-safety").count()) === 1 && (await cameraBtn(o).count()) === 1 && !t.includes("AI 觀察") && !t.includes("本次 5 次"), t.slice(0, 300));
  await o.locator("details.exp-fold > summary").click();
  await layout(o, `390 prep of ${firstName} (fold open)`, ".page-action-bar .exp-cta");
  await shot(o, "8-other-exercise-prep");
  await cameraBtn(o).click();
  await o.waitForFunction(() => /Detection$/.test(document.querySelector(".phone")?.className || "") || !!document.querySelector('[id$="StatusOverlay"]'), null, { timeout: 20000 });
  step(`O2 ${firstName}: 開啟鏡頭 still opens its own detection page`, (await o.locator('[id$="StatusOverlay"]').count()) >= 1);
  await o.context().close();

  step("no page errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
