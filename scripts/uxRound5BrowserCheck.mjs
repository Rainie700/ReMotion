// 使用體驗改善 5/5 — interface finishing, BROWSER acceptance by real clicks.
// LOCAL only: this repo's own Vite dev server (own port 5188, emulator mode) + the local Auth/Firestore emulators
// (demo-remotion); synthetic accounts made here (no patient00/01). A slow save is made by DELAYING the browser's own
// Firestore write requests (context.route; the rules are untouched); 「僅保存在這台裝置」 is checked in the app's existing
// isolated ?localDemo=d5 mode (no Firebase sign-in at all). Counting uses synthetic knee angles
// (window.__emulatorFeedFixedPracticeFrames) — never real camera recognition.
//
//   REPO=<repo> SHOTS=<dir> firebase emulators:exec --only firestore,auth --project demo-remotion "node uxRound5BrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync, mkdirSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/ux-r5/browser`;
mkdirSync(`${shots}/video`, { recursive: true });
const port = Number(process.env.PORT || 5188);
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);
const { CASES, STEP } = await import(pathToFileURL(`${repo}/docs/verification/le05-slow-rep/cases.mjs`).href);
const { F01_LIMITATIONS } = await import(pathToFileURL(`${repo}/js/data/f01GoalRecommendation.js`).href);
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const password = "ux5-local-only-123", tag = Date.now();
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${String(detail).slice(0, 380)}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };
const note = (t) => console.log(`NOTE | ${t}`);

async function account(label) {
  const email = `ux5c-${label}-${tag}@local.test`;
  const data = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  assert.ok(data.localId);
  const user = { id: data.localId, email, account: email, role: "patient", name: `示範患者${label.slice(-1).toUpperCase()}`, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
async function seedRun(patient, id, ms, daysAgo) {
  const at = new Date(Date.now() - daysAgo * 86400000).toISOString();
  await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", id), { id, patientId: patient.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed", startedAt: at, completedAt: at, therapistId: "", relationId: "",
    result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: at, seededSynthetic: true } }));
  return id;
}
const pN = await account("new-n"), pU = await account("pend-u"), pC = await account("cycle-c");
const faU = await seedRun(pU, `fa-u-${tag}`, 13100, 0);
const faC = await seedRun(pC, `fa-c-${tag}`, 12400, 0);

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  note(`app: http://127.0.0.1:${port}/?emulator=1 (Vite dev server started by this script in ${repo})`);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  async function hydrated(page) {
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(async () => { const { storageService } = await import("/js/data/storageService.js"); return ["trackingCycles", "f01FixedPracticeRecords", "dailyTrainingFeedback", "f01InitialReviews"].map((n) => storageService.getOptionalCloudLoadStatus(n)); });
      if (st.every((v) => v === "loaded" || v === "failed")) break;
      if (Date.now() - t0 > 30000) throw Error(`hydration ${st}`);
      await page.waitForTimeout(150);
    }
    await page.locator(".top-profile-container").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 20000 });
    if (await page.getByRole("button", { name: "稍後再填" }).count()) { await page.getByRole("button", { name: "稍後再填" }).click(); await page.locator(".top-profile-container").waitFor(); }
  }
  async function login(user, { width = 390, height = 844, video = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, ...(video ? { recordVideo: { dir: `${shots}/video`, size: { width, height } } } : {}) });
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate(() => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
    await page.locator("#loginAccount").fill(user.email); await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(() => !document.querySelector("#loginAccount"), null, { timeout: 20000 });
    await hydrated(page);
    return page;
  }
  const imagesReady = (page) => page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
  const shot = async (page, name) => { await imagesReady(page); await page.screenshot({ path: `${shots}/${name}.png` }); };
  const text = async (page, sel = ".phone") => (await page.locator(sel).first().innerText()).replace(/\s+/g, " ");
  const nav = (page, name) => page.locator(".bottom-nav").getByText(name, { exact: true }).click();
  const activeTab = async (page) => ((await page.locator(".bottom-nav .tab-btn.active").count()) ? (await page.locator(".bottom-nav .tab-btn.active").innerText()).trim() : "(no nav)");
  const pause = (page, ms = 600) => page.waitForTimeout(ms);
  const toTop = (page) => page.evaluate(() => { const c = document.querySelector(".content"); if (c) c.scrollTop = 0; });
  async function fixedRun(page, frames) {
    await nav(page, "訓練");
    await page.locator(".today-explore-card", { hasText: "坐站練習" }).click();
    await page.locator("#f01FixedRead").check();
    await page.getByRole("button", { name: "開始準備" }).click();
    await page.getByRole("button", { name: "開啟鏡頭" }).click();
    await page.locator(".le05-page[data-fixed-run]").waitFor({ timeout: 20000 });
    const fed = await page.evaluate((f) => window.__emulatorFeedFixedPracticeFrames(f), frames);
    await page.locator("#le05FinishBtn").click();
    await page.locator(".fpr-hero").waitFor({ timeout: 20000 });
    return fed;
  }
  const synthetic = (frames) => { let t = 1000; return frames.map((k) => ({ t: (t += STEP), knee: k })); };
  const FIVE = synthetic(CASES.find((c) => c.id === "S10").frames);
  const s1 = CASES.find((c) => c.id === "S1").frames.slice(6);
  const EARLY = synthetic([...CASES.find((c) => c.id === "S8").frames, ...s1, ...s1]);
  /** no horizontal overflow; the page's main action (action bar / bottom nav) on screen */
  async function layoutOk(page, label) {
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const wide = [...document.querySelectorAll(".phone *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > document.querySelector(".phone").getBoundingClientRect().right + 1 && !e.closest(".fa5c-scroll, .week-strip, .today-explore, .records-views, .patient-data-seg-nav, .chip-scroll, .history-filter-row, select"); }).slice(0, 3).map((e) => e.className || e.tagName);
      const bars = [...document.querySelectorAll(".page-action-bar button, .bottom-nav")].map((e) => { const b = e.getBoundingClientRect(); return b.height > 0 && b.top >= 0 && b.bottom <= vh + 1; });
      // the LAST button of the page, scrolled to the bottom, sits above the bottom navigation; no clipped text
      const c = document.querySelector(".content"); if (c) c.scrollTop = c.scrollHeight;
      const nav = document.querySelector(".bottom-nav"), navTop = nav ? nav.getBoundingClientRect().top : vh;
      const btns = [...document.querySelectorAll(".content button, .content .btn")].filter((b) => b.getBoundingClientRect().height > 0 && !b.closest(".bottom-nav, .page-action-bar, details:not([open])"));
      const last = btns.length ? btns[btns.length - 1].getBoundingClientRect() : null;
      const lastOk = !last || last.bottom <= navTop + 1;
      const cut = [...document.querySelectorAll(".content b, .content .small, .content button")].filter((e) => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflow === "hidden").length;
      if (c) c.scrollTop = 0;
      return { vw, sw: document.documentElement.scrollWidth, bodySw: document.body.scrollWidth, wide, bars, lastOk, cut };
    });
    step(`V ${label}: no horizontal page overflow, no clipped text, actions on screen, the last button above the bottom nav`, r.sw <= r.vw && r.bodySw <= r.vw && r.wide.length === 0 && r.bars.every(Boolean) && r.lastOk && r.cut === 0, JSON.stringify(r));
  }

  // ═══ N. new patient (no therapist) ═══
  const n = await login(pN);
  let t = await text(n);
  step("N1 home: greeting + one primary task + feedback entry + short progress; no achievements / invite card / free practice",
    (await n.locator(".home-greeting").count()) === 1 && (await n.locator(".functional-assessment-feature-card").count()) === 1 && t.includes("開始自主復健")
    && (await n.locator(".achievement-preview-card").count()) === 0 && (await n.locator("#inviteCodeInput").count()) === 0 && !t.includes("想自己練") && (await n.locator(".home-progress-compact").count()) === 1, t.slice(0, 300));
  await shot(n, "01-home-new-patient");
  await nav(n, "我的"); await pause(n);
  t = await text(n);
  step("N2 我的: 我的復健師 carries the invite-code entry; 復健成就 there", (await n.locator("#profileTherapistLink #inviteCodeInput").count()) === 1 && t.includes("復健成就") && t.includes("查看成就"), t.slice(0, 300));
  await shot(n, "02-profile-link-and-achievements");
  await nav(n, "訓練"); await pause(n);
  t = await text(n);
  step("N3 訓練: 坐站練習 + 功能評估與練習 entries; free practice (開始自主練習) reachable; one overview card", t.includes("坐站練習") && t.includes("功能評估與練習") && (await n.getByRole("button", { name: "開始自主練習" }).count()) === 1 && (await n.locator(".today-overview").count()) === 1 && (await n.locator(".today-week-card").count()) === 0);
  await nav(n, "數據"); await pause(n);
  t = await text(n);
  step("N4 數據: the 7-day range is stated; first-practice hint (nothing recorded); compact empty trend", /近 7 天：\d\d\/\d\d–\d\d\/\d\d（含今天）/.test(t) && t.includes("完成第一次練習後") && (await n.locator(".data-trend-compact").count()) === 1, t.slice(0, 400));
  await shot(n, "03-data-overview-new");
  await n.context().close();

  // ═══ U. pending review without a linked therapist → the link entry straight from Home ═══
  const u = await login(pU);
  await u.evaluate((id) => window.goFiveTimesSitToStandResult(id), faU);
  await u.getByRole("button", { name: "查看訓練建議 →" }).click();
  await u.locator(".f01-goal-card", { hasText: "加強髖部與骨盆穩定" }).click();
  await u.locator(".f01-limit-row", { hasText: F01_LIMITATIONS.find((l) => l.id === "L05").label }).locator("input").check();
  await u.getByRole("button", { name: "20 分鐘" }).click();
  await u.getByRole("button", { name: "產生訓練建議 →" }).click();
  await pause(u, 2000);
  await nav(u, "首頁"); await pause(u);
  t = await text(u, ".f01-initial-plan-home");
  step("U1 home: 待復健師檢視 without a therapist → says so, plus 輸入復健師邀請碼", t.includes("目前沒有連結的復健師") && (await u.locator(".f01-initial-plan-home").getByRole("button", { name: "輸入復健師邀請碼" }).count()) === 1, t);
  await shot(u, "04-home-pending-unlinked");
  await u.locator(".f01-initial-plan-home").getByRole("button", { name: "輸入復健師邀請碼" }).click(); await pause(u);
  step("U2 → 我的, the invite-code field focused", (await activeTab(u)) === "我的" && (await u.evaluate(() => document.activeElement && document.activeElement.id)) === "inviteCodeInput");
  await shot(u, "05-profile-invite-focused");
  await nav(u, "首頁"); await pause(u);
  await u.locator(".f01-initial-plan-home").getByRole("button", { name: "查看待檢視安排" }).click(); await pause(u);
  step("U3 the plan's own entry still opens the existing explanation + invite entry", (await u.locator('[onclick="onInviteCodeQuery()"]').count()) === 1);
  await u.context().close();

  // ═══ C. a patient with a running week ═══
  const c = await login(pC, { video: true });
  await c.evaluate((id) => window.goFiveTimesSitToStandResult(id), faC);
  await c.getByRole("button", { name: "查看訓練建議 →" }).click();
  await c.locator(".f01-goal-card", { hasText: "加強整體下肢力量" }).click();
  await c.getByRole("button", { name: "10 分鐘" }).click();
  await c.getByRole("button", { name: "產生訓練建議 →" }).click();
  await c.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 }); await pause(c, 1500);
  const [cycleC] = await adminQuery("trackingCycles", "patientId", pC.id);
  step("C0 week created (UI)", !!cycleC);
  await nav(c, "首頁"); await pause(c);
  t = await text(c);
  step("C1 home: the week card is the one primary task (開始今日訓練); no achievements preview / free practice row", (await c.locator(".functional-assessment-feature-card").count()) === 1 && t.includes("開始今日訓練") && (await c.locator(".achievement-preview-card").count()) === 0 && !t.includes("想自己練"));
  await shot(c, "06-home-cycle");
  await nav(c, "訓練"); await pause(c);
  t = await text(c, ".today-overview");
  step("C2 訓練: ONE overview card (date, X / Y, sources, 本週訓練 entry); tasks with 開始 below", (await c.locator(".today-week-card").count()) === 0 && t.includes("本週訓練") && /\d+ \/ \d+/.test(t) && (await c.locator(".today-task-start").count()) >= 1, t);
  await shot(c, "07-training-tab");
  await c.locator(".today-overview-week").getByRole("button", { name: "查看本週訓練" }).click(); await pause(c);
  await c.locator(".phone .header").getByRole("button", { name: "返回" }).first().click(); await pause(c);
  step("C2b 本週訓練 → 返回 comes back to 訓練", (await c.locator(".today-plan-page").count()) === 1 && (await activeTab(c)) === "訓練");
  // practice ended early: result first, actions right after it, the self-report form closed
  const fedEarly = await fixedRun(c, EARLY);
  await c.getByText("已同步到雲端").first().waitFor({ timeout: 20000 });
  const order = await c.evaluate(() => [...document.querySelector(".fp-page").children].map((e) => e.className.split(" ").find((k) => k.startsWith("fpr-") || k === "header") || e.className));
  step("C3 result: hero → actions (查看練習紀錄 / 返回訓練) → unconfirmed reasons → closed 補記 entry", order.indexOf("fpr-hero") + 1 === order.indexOf("fpr-actions") && order.indexOf("fpr-unconfirmed") > order.indexOf("fpr-actions") && order.indexOf("fpr-self-entry") > order.indexOf("fpr-unconfirmed")
    && (await c.locator(".fpr-self-entry[open]").count()) === 0 && !(await c.locator("#f01FixedRecordSelfReps").isVisible()) && fedEarly.unconfirmed >= 1, JSON.stringify(order));
  await shot(c, "08-practice-result-early");
  await c.locator(".fpr-self-entry > summary").click();
  await c.locator("#f01FixedRecordSelfReps").fill("1001");
  await c.getByRole("button", { name: "保存自行回報" }).click(); await pause(c, 400);
  step("C4 the existing fill rule still applies (0–1000 integers)", String(c.lastDialog || "").includes("請輸入 0 以上的整數次數") && (await c.locator(".fpr-self-entry[open]").count()) === 1);
  await c.locator("#f01FixedRecordSelfReps").fill("3");
  await c.getByRole("button", { name: "保存自行回報" }).click();
  await c.locator(".fpr-self").waitFor({ timeout: 20000 }); await pause(c, 800);
  const [fixedC] = await adminQuery("f01FixedPracticeRecords", "patientId", pC.id);
  t = await text(c, ".fpr-self");
  step("C5 saved self-report easy to see (自行回報（本人填寫）3 次), the AI count unchanged and separate", t.includes("自行回報（本人填寫）") && t.includes("3 次") && fixedC.selfReport.totalReps === 3 && fixedC.ai.countedReps === fedEarly.totalReps, t);
  await shot(c, "09-practice-result-self-saved");
  // 數據: overview wording with fixed practice only
  await nav(c, "數據"); await pause(c);
  t = await text(c);
  step("C6 數據 overview: no 「完成第一次練習」 hint when a fixed-practice record exists; fixed practice / self-report each shown", !t.includes("完成第一次練習後") && t.includes("坐站練習（全部） 1 筆") && t.includes("不計入上面的訓練次數與天數"), t.slice(0, 500));
  step("C6b 總覽: 目前階段 card first (= Home's state + its action); 功能評估 summary with ONE entry", (await c.locator(".data-stage-card").count()) === 1 && (await text(c, ".data-stage-card")).includes("開始今日訓練") && (await c.locator(".data-f01-card").count()) === 1 && (await c.locator(".data-f01-card").innerText()).includes("查看功能評估") && (await c.locator(".data-f01-trend-link").count()) === 0 && (await c.locator(".data-mini-week li").count()) === 7);
  await shot(c, "10-data-overview-fixed-only");
  // records → single record → back
  await c.locator(".patient-data-seg", { hasText: "訓練紀錄" }).click(); await pause(c);
  t = await text(c);
  step("C7 訓練紀錄 (訓練 list empty): no first-practice hint, points to the other lists", t.includes("還沒有訓練紀錄。你的坐站練習與自行回報在上方的分頁中。"), t.slice(0, 300));
  await c.locator(".records-view", { hasText: "坐站練習" }).click(); await pause(c);
  await c.locator(".f01-fixed-history-row").first().click(); await pause(c);
  step("C8 single record opened from 訓練紀錄", (await text(c, ".phone .header")).includes("練習紀錄"));
  await c.getByRole("button", { name: "回到訓練紀錄" }).click(); await pause(c);
  step("C8b back to 訓練紀錄 (數據 tab)", (await c.locator(".records-views").count()) === 1 && (await activeTab(c)) === "數據");
  // 功能評估 page + the assessment result
  await c.locator(".patient-data-seg", { hasText: "功能評估" }).click(); await pause(c);
  t = await text(c);
  step("C9 功能評估: no separate 「目前」 card (目前基準); the running week's own card says 目前; compact 訓練表現", !t.includes("目前基準") && (await c.locator(".track-week.is-current .exp-label", { hasText: "目前" }).count()) === 1 && (await c.locator(".track-perf.is-empty").count()) === 1, t.slice(0, 400));
  step("C9b chart: the coming reassessment is said outside the plot (下次評估：…，尚未量測), no value / marker for it", t.includes("下次評估：") && t.includes("尚未量測") && !(await c.locator(".fa5c-chart").innerHTML()).includes("預計") && (await c.locator(".fa5c-chart .fa5c-dot").count()) === 1);
  await shot(c, "11-assessment-page");
  await c.locator(".data-run-row").first().click(); await pause(c, 1000);
  t = await text(c);
  step("C10 result: time, purpose, 評估已保存, condition entry closed, version codes only in 量測說明 (closed)", t.includes("12.4") && t.includes("評估已保存") && (await c.locator(".fa5x-cond-form[open]").count()) === 0 && (await c.locator(".fa5x-tech[open]").count()) === 0 && !(await c.locator(".fa5x-tech .fa5x-muted").first().isVisible()), t.slice(0, 300));
  t = (await c.locator(".fa5x-status-list").innerText()).replace(/\s+/g, " ");
  step("C10a result facts kept apart: 完成狀態 / 保存狀態 / 測試條件 (尚未回報, visible) / 前後比較 — no single ✓ for all", t.includes("完成狀態 已完成 5 / 5 次") && t.includes("保存狀態 ✓ 評估已保存") && t.includes("測試條件 尚未回報") && t.includes("前後比較") && !(await text(c)).includes("✓ 已完成"), t);
  await c.locator(".fa5x-cond-entry").click();
  step("C10b condition questions: nothing pre-selected", (await c.locator(".fa5x-cond-form input:checked").count()) === 0);
  await c.getByRole("button", { name: "儲存測試條件" }).click(); await pause(c, 300);
  step("C10c 由誰回答 still required", String(c.lastDialog || "").includes("請選擇由誰回答"));
  await toTop(c); await shot(c, "12-assessment-result");
  await c.locator(".phone .header").getByRole("button", { name: "返回" }).click(); await pause(c);
  step("C11 返回 → 功能評估", (await text(c)).includes("全部評估紀錄"));
  const v = c.video(); await c.context().close(); renameSync(await v.path(), `${shots}/video/cycle-patient-home-training-result-records-back-390.webm`);

  // ═══ S. slow save: the browser's own Firestore writes delayed (rules untouched) ═══
  const sl = await login(pC);
  let delay = true;
  await sl.context().route(/google\.firestore\.v1\.Firestore\/(Write|Commit)/, async (route) => { if (delay) await new Promise((r) => setTimeout(r, 6000)); await route.fallback(); });
  await fixedRun(sl, FIVE);
  t = await text(sl, ".fpr-hero");
  const pendingSeen = t.includes("儲存中");
  await pause(sl, 1500);
  t = await text(sl, ".fpr-hero");
  step("S1 slow save: 儲存中… shown, never a premature 已同步到雲端", pendingSeen && t.includes("儲存中") && !t.includes("已同步"), t);
  await shot(sl, "13-slow-save-pending");
  await sl.locator(".fpr-self-entry > summary").click();
  await sl.locator("#f01FixedRecordSelfReps").fill("4");
  await sl.getByText("已同步到雲端").first().waitFor({ timeout: 30000 });
  step("S2 the settle re-render keeps the open form and the typed number", (await sl.locator(".fpr-self-entry[open]").count()) === 1 && (await sl.locator("#f01FixedRecordSelfReps").inputValue()) === "4");
  delay = false;
  await sl.getByRole("button", { name: "保存自行回報" }).click();
  await sl.locator(".fpr-self").waitFor({ timeout: 20000 });
  step("S3 then saved as 自行回報（本人填寫）4 次", (await text(sl, ".fpr-self")).includes("4 次"));
  await sl.context().close();

  // ═══ L. 「僅保存在這台裝置」 in the isolated local demo (no Firebase sign-in) ═══
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const l = await context.newPage();
    l.on("pageerror", (e) => errors.push(`localDemo: ${e.message}`));
    l.on("dialog", (d) => d.dismiss());
    await l.goto(`http://127.0.0.1:${port}/?localDemo=d5`);
    await l.locator("#local-demo-bar").waitFor({ timeout: 20000 }); await pause(l, 1200);
    await l.evaluate(() => window.goF01FixedPractice()); await pause(l);
    await l.locator("#f01FixedRead").check();
    await l.evaluate(() => window.goF01FixedPracticeSelfRecord()); await pause(l);
    await l.locator("#f01FixedSelfReps").fill("5");
    await l.locator('[onclick="saveF01FixedPracticeSelfReportOnly()"]').click();
    await l.locator(".fpr-hero").waitFor({ timeout: 20000 }); await pause(l, 1500);
    t = (await l.locator(".fpr-hero").innerText()).replace(/\s+/g, " ");
    step("L1 no cloud account: 僅保存在這台裝置, never 已同步", t.includes("僅保存在這台裝置") && !t.includes("已同步"), t);
    await l.screenshot({ path: `${shots}/14-local-only.png` });
    await context.close();
  }

  // ═══ D. daily report: offline → the real cause, answers kept, nothing written; back online → ONE saved report ═══
  {
    const d = await login(pC);
    await nav(d, "首頁"); await pause(d);
    await d.locator(".daily-feedback-entry").getByRole("button", { name: /填寫回報|繼續填寫/ }).first().click();
    const sheet = d.locator("#dailyFeedbackSheet .dfs-panel");
    await sheet.waitFor();
    const opt = (label) => sheet.locator(".dfs-option", { hasText: new RegExp(`^\\s*${label}\\s*$`) });
    await opt("有點吃力").click(); await sheet.getByRole("button", { name: "下一步" }).click();
    await opt("沒有不舒服").click(); await sheet.getByRole("button", { name: "下一步" }).click();
    for (let i = 0; i < 3 && !(await d.locator("#dailyFeedbackNote").count()); i++) {
      if (await opt("先不填原因").count()) await opt("先不填原因").click();
      if (await sheet.getByRole("button", { name: "下一步" }).count()) await sheet.getByRole("button", { name: "下一步" }).click();
      await pause(d, 300);
    }
    await d.locator("#dailyFeedbackNote").fill("離線時寫的回報");
    await d.context().setOffline(true);
    await sheet.locator(".dfs-submit").click();
    await sheet.locator(".dfs-message.is-error").waitFor({ timeout: 30000 });
    let s = (await sheet.innerText()).replace(/\s+/g, " ");
    const none = await adminQuery("dailyTrainingFeedback", "patientId", pC.id);
    step("D1 offline: says 沒有網路連線 (not a guess), answers kept, 重新送出 offered, nothing written, no completion",
      s.includes("目前沒有網路連線") && (await d.locator("#dailyFeedbackNote").inputValue()) === "離線時寫的回報" && (await sheet.getByRole("button", { name: "重新送出" }).count()) === 1 && none.length === 0 && !(await sheet.locator(".dfs-done").count()), s.slice(0, 300));
    await shot(d, "16-report-offline");
    await d.context().setOffline(false);
    await pause(d, 1500);
    await sheet.getByRole("button", { name: "重新送出" }).click();
    await sheet.locator(".dfs-done").waitFor({ timeout: 45000 });
    const saved = await adminQuery("dailyTrainingFeedback", "patientId", pC.id);
    step("D2 back online → 重新送出 saves ONE report (revision 1); success only after the save", saved.length === 1 && saved[0].revision === 1 && saved[0].reports.length === 1 && saved[0].reports[0].note === "離線時寫的回報", JSON.stringify(saved.map((r) => [r.revision, r.reports.length])));
    await sheet.getByRole("button", { name: "完成" }).click();
    // 感受回報: the 7-day view says 未回報 for the other days and opens today's record
    await nav(d, "數據"); await d.locator(".patient-data-seg", { hasText: "感受回報" }).click(); await pause(d);
    const fbw = (await d.locator(".fbw-card").innerText()).replace(/\s+/g, " ");
    step("D3 感受回報 7 days: today's answer, 6 × 未回報 (words, not colour only)", (fbw.match(/未回報/g) || []).length === 6 && fbw.includes("有點吃力") && fbw.includes("有回報 1 天"), fbw.slice(0, 300));
    await d.locator(".fbw-open").first().click(); await pause(d, 400);
    step("D3b the day opens its own record below", await d.locator("details[id^='fb-day-'][open]").count() === 1);
    await toTop(d); await shot(d, "17-feedback-week");
    await d.context().close();
  }

  // ═══ V. 260 (390 at 150 % text) / 320 / 390 / 430 / desktop ═══
  for (const [w, h, label] of [[260, 563, "260（390 寬放大 150%）"], [320, 700, "320"], [390, 844, "390"], [430, 932, "430"], [1280, 900, "desktop"]]) {
    const p = await login(pC, { width: w, height: h });
    for (const tab of ["首頁", "訓練", "數據", "我的"]) { await nav(p, tab); await pause(p, 500); await layoutOk(p, `${label} ${tab}`); }
    await nav(p, "數據"); await p.locator(".patient-data-seg", { hasText: "訓練紀錄" }).click(); await p.locator(".records-view", { hasText: "坐站練習" }).click(); await p.locator(".f01-fixed-history-row").first().click(); await pause(p);
    await layoutOk(p, `${label} 練習紀錄`);
    await nav(p, "數據"); await p.locator(".patient-data-seg", { hasText: "功能評估" }).click(); await pause(p);
    await layoutOk(p, `${label} 功能評估`);
    await p.locator(".data-run-row").first().click(); await pause(p);
    await layoutOk(p, `${label} 評估結果`);
    await nav(p, "首頁"); await pause(p);
    await p.locator(".daily-feedback-entry").getByRole("button", { name: /填寫回報|繼續填寫|查看/ }).first().click();
    await p.locator("#dailyFeedbackSheet .dfs-panel").waitFor();
    const sh = await p.evaluate(() => { const a = document.querySelector(".dfs-panel").getBoundingClientRect(), b = document.querySelector(".dfs-actions .btn-primary, .dfs-submit").getBoundingClientRect(); return { vw: innerWidth, vh: innerHeight, panel: [a.left, a.right, a.bottom].map(Math.round), btn: [b.top, b.bottom].map(Math.round) }; });
    step(`V ${label} bottom sheet usable: panel inside the screen, its main button visible`, sh.panel[0] >= 0 && sh.panel[1] <= sh.vw + 1 && sh.btn[0] >= 0 && sh.btn[1] <= sh.vh + 1, JSON.stringify(sh));
    await shot(p, `15-sheet-${label}`);
    await p.locator("#dailyFeedbackSheet .dfs-close").click();
    await p.context().close();
  }
  step("no page errors", errors.length === 0, JSON.stringify(errors));
} catch (e) {
  console.log(`ABORT | ${e.message}`);
  process.exitCode = 1;
} finally {
  console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
  if (browser) await browser.close();
  vite.kill();
  await env.cleanup();
}
