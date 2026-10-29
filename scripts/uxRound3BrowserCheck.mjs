// 使用體驗改善 3/5 — Home, 訓練 tab and the report sheet, BROWSER check by real clicks.
// LOCAL only: this repo's own Vite dev server (own port, never a server someone else left running) in emulator mode
// (?emulator=1) + the local Auth / Firestore emulators (demo-remotion). Every account is synthetic and made here
// (no patient00 / patient01). Plan states are reached through the real UI (patient + therapist accounts), exactly as
// scripts/f01InitialReviewBrowserCheck.mjs does. Cloud failures are local test-only rules variants loaded into the
// emulator and restored right after. No production cloud, no deploy.
//
//   REPO=<repo> SHOTS=<dir> firebase emulators:exec --only firestore,auth --project demo-remotion "node uxRound3BrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync, mkdirSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/ux-r3/browser`;
mkdirSync(`${shots}/video`, { recursive: true });
const port = Number(process.env.PORT || 5185);
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const password = "ux3-local-only-123", tag = Date.now();
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${String(detail).slice(0, 400)}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };
const note = (t) => console.log(`NOTE | ${t}`);

async function account(role, label) {
  const email = `ux3-${label}-${tag}@local.test`;
  const data = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  assert.ok(data.localId, JSON.stringify(data));
  const user = { id: data.localId, email, account: email, role, name: `示範${label === "therapist" ? "復健師" : "患者"}${label.slice(-1).toUpperCase()}`, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
async function seedAssessment(patient, relation, daysAgo) {
  const at = new Date(Date.now() - daysAgo * 86400000);
  const id = `fa-${patient.id.slice(0, 6)}-${daysAgo}`;
  await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", id), { id, patientId: patient.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed", startedAt: at.toISOString(), completedAt: at.toISOString(), therapistId: relation ? relation.therapistId : "", relationId: relation ? relation.id : "",
    result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 12400, measuredAt: at.toISOString(), seededSynthetic: true } }));
  return id;
}
const relation = async (therapist, patient) => { const r = { id: `rel-${patient.id.slice(0, 6)}-${tag}`, therapistId: therapist.id, patientId: patient.id, status: "accepted", createdAt: new Date().toISOString() }; await seed((db) => setDoc(doc(db, "therapistPatientRelations", r.id), r)); return r; };

const therapist = await account("therapist", "therapist");
const pN = await account("patient", "new-n");          // brand new: nothing at all
const pW = await account("patient", "week-w");         // a running week (G02, made in the UI)
const pB = await account("patient", "review-b");       // linked: pending review -> reviewed (awaiting acceptance)
const pD = await account("patient", "unlinked-d");     // no therapist: pending review that cannot be completed now
const pC = await account("patient", "baseline-c");     // linked, assessed 2 days ago: accepted -> needs a new baseline
const pE = await account("patient", "notactive-e");    // linked: running week + an accepted plan not activated
const relB = await relation(therapist, pB), relC = await relation(therapist, pC), relE = await relation(therapist, pE);
const faW = await seedAssessment(pW, null, 0), faB = await seedAssessment(pB, relB, 0), faD = await seedAssessment(pD, null, 0), faC = await seedAssessment(pC, relC, 2), faE = await seedAssessment(pE, relE, 0);

const repoRules = readFileSync(`${repo}/firestore.rules`, "utf8");
const putRules = async (rules) => { const r = await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-remotion:securityRules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) }); assert.ok(r.ok, `rules PUT ${r.status}`); };
const CYCLE_READ = "    match /trackingCycles/{id} {\n      allow read: if request.auth != null && (resource.data.patientId == request.auth.uid || linked(resource.data));";
const FEEDBACK_UPDATE = "      allow update: if request.auth != null && resource.data.patientId == request.auth.uid\n        && validDailyFeedback(request.resource.data, id)";
assert.ok(repoRules.includes(CYCLE_READ) && repoRules.includes(FEEDBACK_UPDATE), "rule blocks located");
const refuseCycleReads = repoRules.replace(CYCLE_READ, "    match /trackingCycles/{id} {\n      allow read: if false; // LOCAL TEST VARIANT: a refused cloud load");
const refuseFeedbackUpdates = repoRules.replace(FEEDBACK_UPDATE, "      allow update: if false // LOCAL TEST VARIANT: a refused cloud write\n        && validDailyFeedback(request.resource.data, id)");

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  note(`app: http://127.0.0.1:${port}/?emulator=1 (Vite dev server started by this script in ${repo})`);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  async function hydrated(page, allowFailed = false) {
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(async () => { const { storageService } = await import("/js/data/storageService.js"); return ["trackingCycles", "f01InitialReviews", "dailyTrainingFeedback"].map((n) => storageService.getOptionalCloudLoadStatus(n)); });
      if (st.every((v) => v === "loaded" || v === "failed")) { if (!allowFailed && st.includes("failed")) throw Error(`cloud load failed ${st}`); break; }
      if (Date.now() - t0 > 30000) throw Error(`hydration did not finish ${st}`);
      await page.waitForTimeout(150);
    }
    await page.locator(".top-profile-container").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 20000 });
    if (await page.getByRole("button", { name: "稍後再填" }).count()) { await page.getByRole("button", { name: "稍後再填" }).click(); await page.locator(".top-profile-container").waitFor({ timeout: 10000 }); }
  }
  async function login(user, { width = 390, height = 844, video = null, allowFailed = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, ...(video ? { recordVideo: { dir: `${shots}/video`, size: { width, height } } } : {}) });
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate((role) => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole(role); window.confirmAuthRole(); }, user.role);
    await page.locator("#loginAccount").fill(user.email); await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(() => !document.querySelector("#loginAccount"), null, { timeout: 20000 });
    if (user.role === "patient") await hydrated(page, allowFailed); else await page.waitForTimeout(2500);
    return page;
  }
  const reload = async (page, allowFailed = false) => { await page.reload(); await page.waitForFunction(() => typeof window.switchTab === "function"); await hydrated(page, allowFailed); };
  // screenshots wait for every image on screen to finish loading (no blank placeholders in the deck)
  const imagesReady = (page) => page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
  const shot = async (page, name) => { await imagesReady(page); await page.screenshot({ path: `${shots}/${name}.png` }); };
  const tall = async (page, name) => { const vp = page.viewportSize(); const H = await page.evaluate(() => { const c = document.querySelector(".content"); return c.scrollHeight + (document.querySelector(".phone").offsetHeight - c.clientHeight); }); await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, H) }); await page.waitForTimeout(250); await shot(page, name); await page.setViewportSize(vp); await page.waitForTimeout(150); };
  const text = async (page, sel = ".phone") => (await page.locator(sel).first().innerText()).replace(/\s+/g, " ");
  const nav = (page, name) => page.locator(".bottom-nav").getByText(name, { exact: true }).click();
  const activeTab = async (page) => ((await page.locator(".bottom-nav .tab-btn.active").count()) ? (await page.locator(".bottom-nav .tab-btn.active").innerText()).trim() : "(no nav)");
  const home = async (page) => { await nav(page, "首頁"); await page.locator(".top-profile-container").waitFor(); await page.waitForTimeout(300); };
  const primaryText = async (page) => text(page, ".home-primary-task, .functional-assessment-feature-card");
  const sheet = (page) => page.locator("#dailyFeedbackSheet .dfs-panel");
  const sheetText = async (page) => (await sheet(page).innerText()).replace(/\s+/g, " ");
  const dfOpt = (page, label) => sheet(page).locator(".dfs-option", { hasText: new RegExp(`^\\s*${label}\\s*$`) }); // exact: 有不舒服 ≠ 沒有不舒服
  const homeNoDetail = async (page) => {
    const t = await text(page, ".phone .content");
    return !(await page.locator(".phone .content select, .phone .content textarea").count()) && !t.includes("不會自動算成任何訓練週期") && !t.includes("回報對象") && !t.includes("個動作已達標") && !t.includes("單筆紀錄") && !t.includes("快照");
  };
  /** result page -> 查看訓練建議 -> goal -> minutes (-> limitation) -> 產生訓練建議 (the review check's flow) */
  async function createPlan(page, sessionId, { goal = "加強髖部與骨盆穩定", minutes = "20 分鐘", limitL05 = false } = {}) {
    await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), sessionId);
    await page.getByRole("button", { name: "查看訓練建議 →" }).click();
    await page.locator(".f01-goal-card", { hasText: goal }).click();
    await page.getByRole("button", { name: minutes }).click();
    if (limitL05) await page.locator(".f01-limit-row", { hasText: "目前無法安全地單腳站立" }).locator("input").check();
    await page.getByRole("button", { name: "產生訓練建議 →" }).click();
    await page.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
  }
  async function therapistConfirm(t, patient) {
    await t.evaluate((id) => window.goCaseDetail(id, "overview"), patient.id);
    await t.locator(".f01-reload-btn").first().click();
    await t.getByText("首次訓練安排待檢視").waitFor({ timeout: 20000 });
    await t.getByRole("button", { name: "檢視並確認安排" }).click();
    await t.locator(".d5-review-row-edit").nth(2).getByRole("button", { name: "移除" }).click();
    await t.locator('textarea[placeholder="調整理由（必填）"]').fill("先不做站姿髖屈曲");
    await t.getByRole("button", { name: "確認這份安排" }).click();
    await t.getByText(/已確認（/).waitFor({ timeout: 20000 });
  }
  async function layout(page, label, primarySel) {
    const r = await page.evaluate((sel) => {
      const vw = document.documentElement.clientWidth, vh = window.innerHeight;
      const b = sel ? document.querySelector(sel) : null, br = b && b.getBoundingClientRect();
      const navEl = document.querySelector(".bottom-nav"), navTop = navEl ? navEl.getBoundingClientRect().top : vh;
      return { overflow: document.documentElement.scrollWidth - vw, wide: [...document.querySelectorAll(".phone *")].filter((e) => e.getBoundingClientRect().right > vw + 1).length, btn: br ? [Math.round(br.top), Math.round(br.bottom)] : null, navTop: Math.round(navTop) };
    }, primarySel);
    step(`L ${label}: no horizontal overflow; primary action on the first screen, above the bottom nav`, r.overflow <= 0 && r.wide === 0 && (!primarySel || (r.btn && r.btn[0] >= 0 && r.btn[1] <= r.navTop)), JSON.stringify(r));
  }

  // ═══ N. a brand-new patient ═══
  const n = await login(pN);
  let t = await primaryText(n);
  step("N1 new patient home: primary task 開始自主復健; 今日感受 is a short entry; no form, no attribution / snapshot text, no per-exercise detail",
    t.includes("開始自主復健") && (await n.locator(".daily-feedback-entry").innerText()).includes("今天練習感覺如何？") && (await n.locator(".daily-feedback-entry").getByRole("button", { name: "填寫回報" }).count()) === 1 && await homeNoDetail(n), t);
  step("N1b home nav highlights 首頁", (await activeTab(n)) === "首頁");
  await shot(n, "01-home-new-patient"); await tall(n, "01-home-new-patient-full");
  await nav(n, "訓練");
  step("N2 訓練 tab (new patient): 坐站練習 and 六大功能構面 entries; 訓練 highlighted", (await n.locator(".today-explore-card", { hasText: "坐站練習" }).count()) === 1 && (await n.locator(".today-explore-card", { hasText: "功能評估與練習" }).count()) === 1 && (await activeTab(n)) === "訓練");
  await shot(n, "03-training-tab-new-patient");
  await n.locator(".today-explore-card", { hasText: "坐站練習" }).click();
  step("N3 坐站練習 from 訓練: the round-1 page, 訓練 still highlighted", (await n.locator(".fp-hero").count()) === 1 && (await activeTab(n)) === "訓練");
  await n.locator(".fp-page .header").getByRole("button", { name: "返回" }).click();
  step("N3b its 返回 goes straight back to the 訓練 tab", (await n.locator(".today-plan-page").count()) === 1);
  await n.locator(".today-explore-card", { hasText: "功能評估與練習" }).click();
  step("N4 六大功能構面 from 訓練: 訓練 highlighted", (await text(n)).includes("功能構面") && (await activeTab(n)) === "訓練");
  await n.locator(".body-region-btn.available").first().click();
  step("N4b → F01 下肢功能 (訓練 still highlighted)", (await text(n)).includes("F01 下肢功能") && (await activeTab(n)) === "訓練");
  await n.locator(".phone .header").getByRole("button", { name: "返回" }).click();
  await n.locator(".phone .header").getByRole("button", { name: "返回" }).click();
  step("N4c 返回 → 功能構面 → 返回 → back on the 訓練 tab", (await n.locator(".today-plan-page").count()) === 1);
  // plan data still loading / refused: never shown as 「沒有安排」 (開始自主復健)
  await home(n);
  await n.context().route("http://127.0.0.1:8080/**", (r) => r.abort());
  await n.evaluate(() => window.reloadF01InitialPlanData("patient"));
  await n.waitForTimeout(800);
  await nav(n, "首頁"); // the home drawn while the cloud reload is still waiting
  await n.waitForTimeout(300);
  t = await primaryText(n);
  step("N5 plan data loading -> 正在載入你的訓練安排… (not 開始自主復健)", t.includes("正在載入你的訓練安排") && !t.includes("開始自主復健"), t);
  await shot(n, "02b-home-loading");
  await n.context().close();
  await putRules(refuseCycleReads);
  try {
    const nf = await login(pN, { allowFailed: true });
    t = await primaryText(nf);
    step("N6 plan data refused -> 暫時無法載入… + 重新載入 (not 開始自主復健)", t.includes("暫時無法載入你的訓練安排") && t.includes("這不代表沒有安排") && !t.includes("開始自主復健") && (await nf.locator(".home-plan-load .f01-reload-btn").count()) === 1, t);
    await shot(nf, "02c-home-load-failed");
    await putRules(repoRules);
    await nf.locator(".home-plan-load .f01-reload-btn").click();
    await nf.waitForFunction(() => !document.querySelector(".home-plan-load"), null, { timeout: 30000 });
    step("N6b 重新載入 after the cloud answers -> the normal primary task", (await primaryText(nf)).includes("開始自主復健"));
    await nf.context().close();
  } finally { await putRules(repoRules); }

  // ═══ W. a running week — recorded: home → 填寫回報 → 送出 → 訓練 ═══
  const w = await login(pW, { video: "flow" });
  await createPlan(w, faW, { goal: "加強整體下肢力量", minutes: "10 分鐘" }); // setup: the week itself (as in round 1)
  const [cycle] = await adminQuery("trackingCycles", "patientId", pW.id);
  step("W0 a running week exists (G02)", !!cycle && cycle.selectedGoalId === "G02");
  await home(w);
  t = await primaryText(w);
  step("W1 running week: ONE primary task (本週功能追蹤 · 開始今日訓練); no second big card; 今日感受 entry below it",
    t.includes("本週功能追蹤") && t.includes("開始今日訓練") && (await w.locator(".functional-assessment-feature-card .btn-primary").count()) === 1 && (await w.locator(".f01-initial-plan-home").count()) === 0 && await homeNoDetail(w), t);
  await shot(w, "02-home-running-week"); await tall(w, "02-home-running-week-full");
  // open the sheet from a scrolled page; it must come back to the same place
  await w.locator(".daily-feedback-entry").scrollIntoViewIfNeeded();
  await w.evaluate(() => { document.querySelector(".content").scrollTop = Math.min(140, document.querySelector(".content").scrollHeight); });
  const scrollBefore = await w.evaluate(() => document.querySelector(".content").scrollTop);
  await w.locator(".daily-feedback-entry").getByRole("button", { name: "填寫回報" }).click({ noWaitAfter: true });
  await sheet(w).waitFor();
  let s = await sheetText(w);
  const lock = await w.evaluate(() => ({ cls: document.body.classList.contains("dfs-open"), overflow: getComputedStyle(document.querySelector(".content")).overflowY }));
  step("R1 sheet: title, 回報對象 一般回報, step 1 shown, nothing preselected, 下一步 disabled; background scroll locked",
    s.includes("今日訓練感受") && s.includes("回報對象：一般回報（不指定訓練週期）") && /第 1 \/ 4 步/.test(s) && (await sheet(w).locator(".dfs-option.is-selected").count()) === 0
    && await sheet(w).getByRole("button", { name: "下一步" }).isDisabled() && lock.cls && lock.overflow === "hidden", `${s} ${JSON.stringify(lock)}`);
  await shot(w, "04-report-sheet-step1");
  await dfOpt(w, "有點吃力").click();
  await sheet(w).getByRole("button", { name: "下一步" }).click();
  await dfOpt(w, "有不舒服").click();
  await sheet(w).getByRole("button", { name: "上一步" }).click();
  step("R2 上一步 keeps the earlier answer", (await sheet(w).locator(".dfs-option.is-selected").innerText()).includes("有點吃力"));
  await sheet(w).getByRole("button", { name: "下一步" }).click();
  step("R2b ... and forward again the next answer is still there", (await sheet(w).locator(".dfs-option.is-selected").innerText()).includes("有不舒服"));
  await sheet(w).getByRole("button", { name: "下一步" }).click();
  s = await sheetText(w);
  step("R3 incompletion question names the week's target it is about (general report, 回報對象 unchanged)", s.includes("這一題對應的目標") && s.includes("F01 7 日追蹤") && /今日目標：0／\d+ 個動作已達標/.test(s) && s.includes("回報對象：一般回報"), s);
  await shot(w, "05-report-sheet-target-question");
  await dfOpt(w, "沒時間").click();
  await sheet(w).getByRole("button", { name: "下一步" }).click();
  await w.locator("#dailyFeedbackNote").fill("膝蓋有點緊");
  await sheet(w).locator(".dfs-close").click();
  const scrollAfter = await w.evaluate(() => document.querySelector(".content").scrollTop);
  const entry = await text(w, ".daily-feedback-entry");
  step("R4 closing keeps the unsent answers (entry: 繼續填寫 / 有尚未送出的回答); page back at the same scroll position", entry.includes("繼續填寫") && entry.includes("有尚未送出的回答") && Math.abs(scrollAfter - scrollBefore) <= 2 && !(await w.evaluate(() => document.body.classList.contains("dfs-open"))), `${entry} ${scrollBefore}->${scrollAfter}`);
  await w.locator(".daily-feedback-entry").getByRole("button", { name: "繼續填寫" }).click();
  step("R4b reopening resumes at the note step with the text", (await w.locator("#dailyFeedbackNote").inputValue()) === "膝蓋有點緊" && (await sheetText(w)).includes("未完成原因：沒時間"));
  // keyboard: a short visual viewport (as when the on-screen keyboard is open) keeps the field and 送出 usable
  await w.setViewportSize({ width: 390, height: 430 });
  await w.locator("#dailyFeedbackNote").focus(); await w.waitForTimeout(400);
  const kb = await w.evaluate(() => { const a = document.querySelector("#dailyFeedbackNote").getBoundingClientRect(), b = document.querySelector(".dfs-submit").getBoundingClientRect(); return { vh: innerHeight, note: [Math.round(a.top), Math.round(a.bottom)], submit: [Math.round(b.top), Math.round(b.bottom)] }; });
  step("R5 short viewport (simulated keyboard): note field and 送出 both on screen", kb.note[0] >= 0 && kb.note[1] <= kb.vh && kb.submit[0] >= 0 && kb.submit[1] <= kb.vh, JSON.stringify(kb));
  await shot(w, "06-report-sheet-short-viewport");
  await w.setViewportSize({ width: 390, height: 844 });
  await shot(w, "06b-report-sheet-note");
  await sheet(w).locator(".dfs-submit").dblclick();
  await sheet(w).locator(".dfs-done").waitFor({ timeout: 20000 });
  let [fb] = await adminQuery("dailyTrainingFeedback", "patientId", pW.id);
  const r1 = fb.reports[0];
  step("R6 double-tapped 送出 saved ONE report; completion shown only after the save",
    fb.reports.length === 1 && r1.effort === "somewhat_hard" && r1.discomfort === "yes" && r1.note === "膝蓋有點緊" && !r1.subject && r1.incompletion && r1.incompletion.reason === "no_time" && r1.incompletion.progress.cycleId === cycle.id, JSON.stringify(r1).slice(0, 300));
  step("R6b attribution kept: home answer is a GENERAL report; its incompletion names the week's target", !("subject" in r1) && r1.incompletion.progress.cycleId === cycle.id);
  await shot(w, "07-report-done");
  await sheet(w).getByRole("button", { name: "完成" }).click();
  step("R7 entry: 今日已回報 + the answer + 查看／更新", (await text(w, ".daily-feedback-entry")).includes("今日已回報") && (await text(w, ".daily-feedback-entry")).includes("有點吃力｜有不舒服") && (await w.locator(".daily-feedback-entry").getByRole("button", { name: "查看／更新" }).count()) === 1);
  await shot(w, "08-home-reported");
  // into training: 訓練 → 本週訓練 (the week's page; 訓練 highlighted) → this cycle's own report
  await nav(w, "訓練");
  await w.locator(".today-overview-week").getByRole("button", { name: "查看本週訓練" }).click(); // UX round 5/5: the entry is inside the overview card
  await w.locator(".daily-feedback-entry.daily-feedback-cycle").waitFor({ timeout: 20000 });
  step("C1 本週訓練 opened from 訓練: 訓練 highlighted; the cycle report is a short entry", (await activeTab(w)) === "訓練" && (await text(w, ".daily-feedback-cycle")).includes("本週期今天練習感覺如何？") && !(await w.locator(".phone .content .daily-feedback-cycle select, .phone .content .daily-feedback-cycle textarea").count()),
    `${await activeTab(w)} | ${await text(w, ".daily-feedback-cycle")} | selects=${await w.locator(".phone .content select").count()}`);
  await w.locator(".daily-feedback-cycle").getByRole("button", { name: "填寫回報" }).click();
  s = await sheetText(w);
  step("C2 cycle sheet: 本週期今日回報 with the cycle named at the top", s.includes("本週期今日回報") && /回報對象：F01 7 日追蹤（\d\d\/\d\d 開始）第 1 天的訓練/.test(s), s);
  await shot(w, "09-cycle-report-sheet");
  await dfOpt(w, "輕鬆").click(); await sheet(w).getByRole("button", { name: "下一步" }).click();
  await dfOpt(w, "沒有不舒服").click(); await sheet(w).getByRole("button", { name: "下一步" }).click();
  if ((await sheetText(w)).includes("這一題對應的目標")) { await dfOpt(w, "先不填原因").click(); await sheet(w).getByRole("button", { name: "下一步" }).click(); }
  await sheet(w).getByRole("button", { name: "送出本週期回報" }).click();
  await sheet(w).locator(".dfs-done").waitFor({ timeout: 20000 });
  [fb] = await adminQuery("dailyTrainingFeedback", "patientId", pW.id);
  step("C3 cycle report saved with its subject; the general report untouched", fb.reports.length === 2 && fb.reports[1].subject && fb.reports[1].subject.cycleId === cycle.id && JSON.stringify(fb.reports[0]) === JSON.stringify(r1));
  await sheet(w).getByRole("button", { name: "完成" }).click();
  await w.locator(".phone .header").getByRole("button", { name: "返回" }).first().click();
  step("C4 本週訓練 返回 → back on the 訓練 tab (where it was opened)", (await w.locator(".today-plan-page").count()) === 1 && (await activeTab(w)) === "訓練");
  await w.locator(".today-explore-card", { hasText: "坐站練習" }).click();
  step("C5 有週期患者: 坐站練習 from 訓練", (await w.locator(".fp-hero").count()) === 1);
  await w.locator(".fp-page .header").getByRole("button", { name: "返回" }).click();
  const flowVideo = w.video();
  // update + failure + retry on the general report (new context so the flow video ends cleanly)
  await w.context().close();
  renameSync(await flowVideo.path(), `${shots}/video/home-report-then-training-390.webm`);
  const w2 = await login(pW);
  await w2.locator(".daily-feedback-entry").getByRole("button", { name: "查看／更新" }).click();
  s = await sheetText(w2);
  step("U1 查看／更新: the answer in use, today's revisions, and the cycle report kept apart", s.includes("目前採用的回答") && s.includes("有點吃力｜有不舒服") && s.includes("查看今天的歷次回報（1 次）") && s.includes("今天另有 1 次從訓練週期入口填寫的回報"), s);
  await shot(w2, "10-report-overview");
  await sheet(w2).getByRole("button", { name: "更新回報" }).click();
  step("U2 updating starts from the answer in use", (await sheet(w2).locator(".dfs-option.is-selected").innerText()).includes("有點吃力"));
  await dfOpt(w2, "輕鬆").click();
  for (let i = 0; i < 3; i++) await sheet(w2).getByRole("button", { name: "下一步" }).click();
  await putRules(refuseFeedbackUpdates);
  try {
    await sheet(w2).locator(".dfs-submit").click();
    await sheet(w2).locator(".dfs-message.is-error").waitFor({ timeout: 30000 });
    s = await sheetText(w2);
    // UX round 5/5: the refusal is now named for what it is (permission-denied -> 權限檢查未通過), not a network guess
    step("F1 cloud write refused: error shown (the real cause), answers kept, 重新送出 offered; no completion", s.includes("雲端沒有接受這次回報（權限檢查未通過）") && (await sheet(w2).getByRole("button", { name: "重新送出" }).count()) === 1 && (await w2.locator("#dailyFeedbackNote").inputValue()) === "膝蓋有點緊" && !(await sheet(w2).locator(".dfs-done").count()), s);
    await shot(w2, "11-report-send-failed");
  } finally { await putRules(repoRules); }
  await sheet(w2).getByRole("button", { name: "重新送出" }).click();
  await sheet(w2).locator(".dfs-done").waitFor({ timeout: 20000 });
  [fb] = await adminQuery("dailyTrainingFeedback", "patientId", pW.id);
  const generals = fb.reports.filter((r) => !r.subject);
  step("F2 retry saved the update once; the earlier answer is kept as history (append-only)", fb.reports.length === 3 && generals.length === 2 && generals[1].effort === "easy" && generals[0].effort === "somewhat_hard");
  // the cycle's 本週練習回報 built from the saved cloud data with the shared builder (same as the G01 pages)
  const built = await w2.evaluate(async ({ cycleId }) => {
    const { buildCycleDailyReports } = await import("/js/data/cycleDailyReports.js");
    const { trackingCycleService } = await import("/js/data/trackingCycleService.js");
    const { dailyTrainingFeedbackService } = await import("/js/data/dailyTrainingFeedbackService.js");
    const c = trackingCycleService.getTrackingCycleById(cycleId);
    const r = buildCycleDailyReports({ cycle: c, patientId: c.userId, feedbackRecords: dailyTrainingFeedbackService.listForPatient(c.userId), feedbackLoadStatus: dailyTrainingFeedbackService.cloudStatus() === "failed" ? "failed" : "loaded" });
    const d1 = r.days[0];
    return { state: d1.reportState, effort: d1.report && d1.report.effort, discomfort: d1.report && d1.report.discomfort, revisions: d1.report && d1.report.revisionCount, general: r.sameDayGeneral.length, discomfortDates: r.summary.discomfortDates };
  }, { cycleId: cycle.id });
  step("F3 本週練習回報 from the saved data: Day 1 counts the CYCLE report only; the home report is listed apart, not counted", built.state === "reported" && built.effort === "easy" && built.discomfort === "no" && built.revisions === 1 && built.general === 1 && !(built.discomfortDates.yes || []).length, JSON.stringify(built));
  await w2.context().close();

  // ═══ plan states (primary task follows the shared first-plan notice) ═══
  const T = await login(therapist, { width: 1100, height: 900 });
  const b = await login(pB);
  await createPlan(b, faB, { limitL05: true });
  await home(b);
  t = await primaryText(b);
  step("P1 待檢視 (linked): primary task 待復健師檢視 → 查看待檢視安排; no 開始自主復健, says no automatic notice", t.includes("待復健師檢視") && t.includes("查看待檢視安排") && t.includes("系統不會另外通知") && !t.includes("開始自主復健"), t);
  await shot(b, "12-home-awaiting-review");
  const d = await login(pD);
  await createPlan(d, faD, { limitL05: true });
  await home(d);
  t = await primaryText(d);
  step("P2 待檢視 (no therapist): says it cannot be completed now; never implies someone is handling it", t.includes("目前沒有連結的復健師") && t.includes("暫時無法完成檢視") && !t.includes("可以主動告知對方") && !/處理中|已通知/.test(t), t);
  await shot(d, "13-home-awaiting-review-unlinked");
  await d.context().close();
  await therapistConfirm(T, pB);
  await reload(b);
  t = await primaryText(b);
  step("P3 待接受: 復健師已確認，等待你接受 → 查看確認安排", t.includes("復健師已確認，等待你接受") && t.includes("查看確認安排"), t);
  await shot(b, "14-home-awaiting-acceptance");
  await b.locator(".home-primary-task").getByRole("button", { name: "查看確認安排" }).click();
  step("P3b its entry opens the plan with 接受這份安排", (await b.getByRole("button", { name: "接受這份安排" }).count()) === 1);
  await b.context().close();
  const c = await login(pC);
  await createPlan(c, faC, { limitL05: true });
  await therapistConfirm(T, pC);
  await reload(c);
  const [recC] = await adminQuery("recommendationResults", "patientId", pC.id);
  await c.evaluate((id) => window.goF01RecommendationResult(id), recC.id);
  await c.getByRole("button", { name: "接受這份安排" }).click();
  await c.getByText("已接受安排，請完成新的基準評估").waitFor({ timeout: 20000 });
  await home(c);
  t = await primaryText(c);
  step("P4 待新基準: 已接受，請完成新的基準評估 → 開始第一週基準評估", t.includes("已接受，請完成新的基準評估") && t.includes("開始第一週基準評估"), t);
  await shot(c, "15-home-needs-new-baseline");
  await c.context().close();
  const e = await login(pE);
  await createPlan(e, faE, { goal: "加強髖部與骨盆穩定", minutes: "10 分鐘" });
  for (let i = 0; i < 100 && !(await adminQuery("trackingCycles", "patientId", pE.id)).length; i++) await e.waitForTimeout(150);
  await e.getByRole("button", { name: "重新設定訓練需求" }).click();
  await e.getByRole("button", { name: "20 分鐘" }).click();
  await e.locator(".f01-limit-row", { hasText: "目前無法安全地單腳站立" }).locator("input").check();
  await e.getByRole("button", { name: "產生訓練建議 →" }).click();
  await e.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
  await e.waitForTimeout(1000);
  await therapistConfirm(T, pE);
  await reload(e);
  const [weekE] = await adminQuery("trackingCycles", "patientId", pE.id);
  const newRecE = (await adminQuery("recommendationResults", "patientId", pE.id)).find((r) => r.id !== weekE.recommendationId && r.kind === "f01_goal");
  await e.evaluate((id) => window.goF01RecommendationResult(id), newRecE.id);
  await e.getByRole("button", { name: "接受這份安排" }).click();
  await e.getByText("這份安排尚未啟用；目前的追蹤與紀錄不會被取代").waitFor({ timeout: 20000 });
  await home(e);
  t = await text(e, ".phone .content");
  step("P5 已接受但尚未啟用: the running week stays the primary task (開始今日訓練); the plan is a one-line hint (查看原本的週期)",
    (await primaryText(e)).includes("開始今日訓練") && (await e.locator(".f01-initial-plan-home.is-hint").count()) === 1 && (await text(e, ".f01-initial-plan-home.is-hint")).includes("已接受，尚未啟用") && (await text(e, ".f01-initial-plan-home.is-hint")).includes("查看原本的週期") && (await e.locator(".home-primary-task").count()) === 0, t.slice(0, 300));
  await shot(e, "16-home-accepted-not-active");
  await e.context().close();
  await T.context().close();

  // ═══ L. 390 / 430 / desktop ═══
  for (const [wd, h] of [[390, 844], [430, 932], [1280, 800]]) {
    const q = await login(pW, { width: wd, height: h });
    await layout(q, `${wd} home (running week)`, ".home-hero-cta");
    await shot(q, `L-${wd}-home`);
    await nav(q, "訓練");
    await layout(q, `${wd} 訓練 tab`, ".today-overview-week .btn"); // UX round 5/5: merged into the overview card
    await shot(q, `L-${wd}-training`);
    await home(q);
    await q.locator(".daily-feedback-entry").getByRole("button", { name: "查看／更新" }).click();
    await sheet(q).getByRole("button", { name: "更新回報" }).click();
    const r = await q.evaluate(() => { const p = document.querySelector(".dfs-panel").getBoundingClientRect(), a = document.querySelector(".dfs-actions .btn-primary").getBoundingClientRect(); return { vw: innerWidth, vh: innerHeight, panel: [Math.round(p.left), Math.round(p.right), Math.round(p.top)], action: [Math.round(a.top), Math.round(a.bottom)], over: document.documentElement.scrollWidth - innerWidth }; });
    step(`L ${wd} sheet: inside the screen, action visible`, r.panel[0] >= 0 && r.panel[1] <= r.vw && r.panel[2] >= 0 && r.action[1] <= r.vh && r.over <= 0, JSON.stringify(r));
    await shot(q, `L-${wd}-sheet`);
    await q.context().close();
  }
  const nn = await login(pN, { width: 390, height: 844 });
  await layout(nn, "390 home (new patient)", ".functional-assessment-action.primary");
  await nn.context().close();
  step("no page errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await putRules(repoRules).catch(() => {});
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
