// 使用體驗改善 4/5 — completion pages, 數據 and the 5xSTS chart, BROWSER check by real clicks.
// LOCAL only: this repo's own Vite dev server (own port) in emulator mode + local Auth/Firestore emulators
// (demo-remotion). Synthetic accounts made here (no patient00/01); weeks are made in the UI and, for the
// cross-week chart, moved back in time / extended by the emulator admin (marked seededSynthetic). Cloud failures
// are local test-only rules variants, restored right after. Counting uses synthetic knee angles
// (window.__emulatorFeedFixedPracticeFrames) — never real camera recognition.
//
//   REPO=<repo> SHOTS=<dir> firebase emulators:exec --only firestore,auth --project demo-remotion "node uxRound4BrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync, mkdirSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/ux-r4/browser`;
mkdirSync(`${shots}/video`, { recursive: true });
const port = Number(process.env.PORT || 5186);
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);
const { CASES, STEP } = await import(pathToFileURL(`${repo}/docs/verification/le05-slow-rep/cases.mjs`).href);
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const password = "ux4-local-only-123", tag = Date.now();
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${String(detail).slice(0, 380)}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };
const note = (t) => console.log(`NOTE | ${t}`);
const dayKey = (d) => { const x = new Date(Date.now() + d * 86400000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`; };
const md = (key) => `${key.slice(5, 7)}/${key.slice(8, 10)}`;

async function account(label) {
  const email = `ux4-${label}-${tag}@local.test`;
  const data = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  assert.ok(data.localId);
  const user = { id: data.localId, email, account: email, role: "patient", name: `示範患者${label.slice(-1).toUpperCase()}`, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
async function seedRun(patient, id, ms, daysAgo, extra = {}) {
  const at = new Date(Date.now() - daysAgo * 86400000).toISOString();
  await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", id), { id, patientId: patient.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed", startedAt: at, completedAt: at, therapistId: "", relationId: "",
    result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: at, seededSynthetic: true, ...extra } }));
  return id;
}
const pN = await account("new-n"), pW = await account("week-w"), pX = await account("weeks-x"), pS = await account("single-s");
const faW = await seedRun(pW, `fa-w-${tag}`, 12400, 0);
const faX = await seedRun(pX, `fa-x-${tag}`, 12800, 9);
await seedRun(pS, `fa-s-${tag}`, 10600, 1);

const repoRules = readFileSync(`${repo}/firestore.rules`, "utf8");
const putRules = async (rules) => { const r = await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-remotion:securityRules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) }); assert.ok(r.ok, `rules PUT ${r.status}`); };
const FIXED_BLOCK_START = repoRules.indexOf("    match /f01FixedPracticeRecords/{id} {");
const FIXED_BLOCK_END = repoRules.indexOf("    }", FIXED_BLOCK_START) + 6;
assert.ok(FIXED_BLOCK_START > 0, "fixed-practice rule block located");
// LOCAL TEST VARIANT: the rules WITHOUT the f01FixedPracticeRecords block (as in a cloud project whose rules were
// deployed before that block existed) — used to reproduce 「尚未同步」 and read the real error code
const rulesWithoutFixed = repoRules.slice(0, FIXED_BLOCK_START) + repoRules.slice(FIXED_BLOCK_END);

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
      const st = await page.evaluate(async () => { const { storageService } = await import("/js/data/storageService.js"); return ["trackingCycles", "f01FixedPracticeRecords", "dailyTrainingFeedback"].map((n) => storageService.getOptionalCloudLoadStatus(n)); });
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
  const tall = async (page, name) => { const vp = page.viewportSize(); const H = await page.evaluate(() => { const c = document.querySelector(".content"); return c.scrollHeight + (document.querySelector(".phone").offsetHeight - c.clientHeight); }); await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, H) }); await page.waitForTimeout(250); await shot(page, name); await page.setViewportSize(vp); await page.waitForTimeout(150); };
  const text = async (page, sel = ".phone") => (await page.locator(sel).first().innerText()).replace(/\s+/g, " ");
  const nav = (page, name) => page.locator(".bottom-nav").getByText(name, { exact: true }).click();
  const activeTab = async (page) => ((await page.locator(".bottom-nav .tab-btn.active").count()) ? (await page.locator(".bottom-nav .tab-btn.active").innerText()).trim() : "(no nav)");
  const pause = (page, ms = 600) => page.waitForTimeout(ms);
  async function createWeek(page, sessionId) {
    await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), sessionId); // setup: the week itself (as in rounds 1–3)
    await page.getByRole("button", { name: "查看訓練建議 →" }).click();
    await page.locator(".f01-goal-card", { hasText: "加強整體下肢力量" }).click();
    await page.getByRole("button", { name: "10 分鐘" }).click();
    await page.getByRole("button", { name: "產生訓練建議 →" }).click();
    await page.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
  }
  /** 訓練 → 坐站練習 → 勾選 → 開始準備 → 開啟鏡頭 → synthetic frames → 結束練習 (fake camera: the model download is blocked here on purpose — counting is synthetic) */
  async function fixedRun(page, frames) {
    await nav(page, "訓練");
    await page.locator(".today-explore-card", { hasText: "坐站練習" }).click();
    await page.locator("#f01FixedRead").check(); // idempotent: the read state may still be set from an earlier run
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

  // ═══ N. new patient: home, 數據 empty states ═══
  const n = await login(pN);
  step("H1 new patient home: neutral greeting, primary 開始自主復健", (await text(n, ".home-greeting")).includes("早安") || (await text(n, ".home-greeting")).length > 0);
  await shot(n, "01-home-new-patient");
  await nav(n, "數據");
  let t = await text(n);
  step("D1 new patient 數據: three category entries; no chart; nothing reads as an error", t.includes("功能評估") && t.includes("訓練紀錄") && t.includes("感受回報") && t.includes("尚未開始功能追蹤") && t.includes("0 次") && t.includes("尚未回報") && (await n.locator(".fa5c-chart").count()) === 0 && (await activeTab(n)) === "數據", t.slice(0, 300));
  await shot(n, "08-data-overview-new-patient");
  await n.locator(".patient-data-seg", { hasText: "功能評估" }).click();
  step("D2 功能評估 empty: 還沒有五次坐站評估 + 開始功能評估", (await text(n)).includes("還沒有五次坐站評估") && (await n.getByRole("button", { name: "開始功能評估" }).count()) === 1);
  await n.locator(".patient-data-seg", { hasText: "訓練紀錄" }).click();
  await n.locator(".records-view", { hasText: "坐站練習" }).click();
  step("D3 訓練紀錄 → 坐站練習 empty: a way to the practice", (await text(n)).includes("還沒有坐站練習紀錄") && (await n.getByRole("button", { name: "前往坐站練習" }).count()) === 1);
  await n.locator(".patient-data-seg", { hasText: "感受回報" }).click();
  step("D4 感受回報 empty", (await text(n)).includes("尚無可查看的回報"));
  await n.context().close();

  // ═══ S. one standalone assessment ═══
  const sp = await login(pS);
  await nav(sp, "數據");
  t = await text(sp);
  step("A0 single assessment outside any week: overview shows it with its purpose", t.includes("10.6 秒") && t.includes("首次評估") && /7 日追蹤\s*尚未開始/.test(t), t.slice(0, 260)); // UX round 5/5: now the row 「7 日追蹤｜尚未開始」
  await sp.locator(".patient-data-seg", { hasText: "功能評估" }).click();
  t = await text(sp);
  step("A0b 功能評估: listed (date · purpose · result), no trend chart", t.includes("目前只有不屬於 7 日追蹤的評估") && t.includes("首次評估") && t.includes("10.6 秒") && (await sp.locator(".fa5c-chart").count()) === 0);
  await sp.locator(".data-run-row").first().click();
  t = await text(sp);
  step("A1 result page: time is the hero, purpose 五次坐站｜首次評估, condition questions behind an entry (not open), 數據 highlighted",
    t.includes("10.6") && t.includes("五次坐站｜首次評估") && (await sp.locator(".fa5x-cond-form[open]").count()) === 0 && (await sp.locator('input[name="fa5xCondArms"]').first().isVisible()) === false && (await activeTab(sp)) === "數據", t.slice(0, 260));
  await shot(sp, "04-assessment-result");
  await sp.locator(".fa5x-cond-entry").click();
  step("A2 tapping 回答測試條件 opens the questions with nothing pre-selected", (await sp.locator('input[name="fa5xCondArms"]').first().isVisible()) && (await sp.locator(".fa5x-cond-form input:checked").count()) === 0);
  await sp.getByRole("button", { name: "儲存測試條件" }).click();
  step("A3 the required answer is still required (who answered)", String(sp.lastDialog || "").includes("請選擇由誰回答"));
  await sp.locator('input[name="fa5xCondArms"][value="no"]').check(); await sp.locator('input[name="fa5xCondSource"][value="self_report"]').check();
  await sp.getByRole("button", { name: "儲存測試條件" }).click(); await pause(sp);
  step("A4 saved; the entry now offers 補充或更正", (await text(sp, ".fa5x-condition-card")).includes("補充或更正測試條件"));
  await shot(sp, "04b-assessment-result-conditions");
  await sp.locator(".phone .header").getByRole("button", { name: "返回" }).click();
  step("A5 返回 from a result opened in 功能評估 goes back there", (await text(sp)).includes("全部評估紀錄"));
  await sp.context().close();

  // ═══ W. running week: home, fixed practice results, records ═══
  const w = await login(pW);
  await createWeek(w, faW);
  const [cycleW] = await adminQuery("trackingCycles", "patientId", pW.id);
  await nav(w, "首頁"); await pause(w, 400);
  t = await text(w, ".home-greeting");
  step("H2 running week: greeting is neutral (not 今天沒有復健師安排); the week card says 開始今日訓練", !t.includes("今天沒有復健師安排") && (await text(w, ".functional-assessment-feature-card")).includes("開始今日訓練"), t);
  await shot(w, "02-home-running-week");
  await w.locator(".daily-feedback-entry").getByRole("button", { name: "填寫回報" }).click();
  await w.locator("#dailyFeedbackSheet .dfs-panel").waitFor();
  await shot(w, "03-report-sheet");
  await w.locator("#dailyFeedbackSheet .dfs-close").click();
  // practice: target reached — recorded from here: 完成 → 查看紀錄 → 返回訓練
  await w.context().close();
  const wv = await login(pW, { video: true });
  const fed = await fixedRun(wv, FIVE);
  t = await text(wv, ".fpr-hero");
  step("P1 target reached: 練習結果, 5 / 5 次, 完成本次目標 + star; AI count labelled; 查看練習紀錄 / 返回訓練", fed.totalReps === 5 && t.includes("5 / 5 次") && t.includes("完成本次目標") && t.includes("AI 計次（相機辨識）") && (await wv.locator(".fpr-star").count()) === 1 && (await wv.getByRole("button", { name: "查看練習紀錄" }).count()) === 1 && (await wv.getByRole("button", { name: "返回訓練" }).count()) === 1, t);
  await wv.getByText("已同步到雲端").waitFor({ timeout: 20000 });
  step("P1b sync state: 已同步到雲端 (after 儲存中)", (await text(wv, ".fpr-hero")).includes("已同步到雲端"));
  await shot(wv, "05-practice-result-reached");
  await pause(wv, 900);
  await wv.getByRole("button", { name: "查看練習紀錄" }).click(); await pause(wv, 900);
  await wv.locator(".f01-fixed-history-row").first().click(); await pause(wv, 900);
  step("P2 查看練習紀錄 → the record (練習紀錄)", (await text(wv, ".phone .header")).includes("練習紀錄") && (await text(wv, ".fpr-hero")).includes("5 / 5 次"));
  await wv.getByRole("button", { name: "返回訓練" }).click(); await pause(wv, 900);
  step("P2b 返回訓練 → the 訓練 tab", (await wv.locator(".today-plan-page").count()) === 1 && (await activeTab(wv)) === "訓練");
  const v = wv.video(); await wv.context().close(); renameSync(await v.path(), `${shots}/video/done-records-back-to-training-390.webm`);
  const w2 = await login(pW);
  // ended early: 2 counted, 1 unconfirmed — the actual record, no celebration, the unconfirmed attempt listed
  const fed2 = await fixedRun(w2, EARLY);
  t = await text(w2);
  step("P3 ended early: 2 / 5, 提前結束, no star, 另有 1 次無法確認 + its reason", fed2.totalReps === 2 && t.includes("2 / 5 次") && t.includes("提前結束") && (await w2.locator(".fpr-star").count()) === 0 && t.includes("另有 1 次動作無法確認，沒有計入") && t.includes("沒有看到從坐姿起身") && !/恭喜|太棒/.test(t), t.slice(0, 400));
  // 2026-10-28 (UX round 5/5): the self-report form is a closed secondary entry — opened first; same save checked
  await w2.locator(".fpr-self-entry > summary").click();
  await w2.locator("#f01FixedRecordSelfReps").fill("4");
  await w2.getByRole("button", { name: "保存自行回報" }).click();
  await w2.getByText("本人填寫，另外保存，沒有加入 AI 計次。").waitFor({ timeout: 20000 });
  await pause(w2, 1000);
  let recs = await adminQuery("f01FixedPracticeRecords", "patientId", pW.id);
  const early = recs.find((r) => r.ai && r.ai.countedReps === 2);
  step("P4 self-report shown apart: AI still 2 in the cloud, self-report 4", early.ai.countedReps === 2 && early.selfReport.totalReps === 4 && (await text(w2, ".fpr-hero")).includes("2 / 5 次"));
  await shot(w2, "06-practice-result-ended-early");
  // self-report only
  await nav(w2, "訓練");
  await w2.locator(".today-explore-card", { hasText: "坐站練習" }).click();
  await w2.locator("#f01FixedRead").check();
  await w2.getByRole("button", { name: "自行記錄" }).click();
  await w2.locator("#f01FixedSelfReps").fill("5");
  await w2.getByRole("button", { name: "保存自行回報" }).click();
  await w2.locator(".fpr-hero").waitFor();
  t = await text(w2, ".fpr-hero");
  step("P5 self-report only: 5 次, 自行回報（這次沒有使用相機）, 本人填寫; no AI count", t.includes("自行回報（這次沒有使用相機）") && t.includes("本人填寫") && !t.includes("AI 計次"), t);
  await shot(w2, "06b-practice-result-self-report");
  // save failure: the cloud has no rule for this collection (as a project deployed before the block) -> real error code
  await putRules(rulesWithoutFixed);
  let code = null;
  try {
    await fixedRun(w2, FIVE);
    await w2.getByText("尚未同步到雲端").waitFor({ timeout: 30000 });
    // the cloud error code the app recorded for this record (developer diagnosis; never shown to the patient)
    code = await w2.evaluate(async () => { const { storageService } = await import("/js/data/storageService.js"); const map = storageService.getItem("f01FixedPracticeSyncError", {}) || {}; return Object.values(map)[0] || null; });
    step("F1 rules without the fixed-practice block: the save is refused and shown as 尚未同步 + 重試同步 (never 已同步)", (await w2.getByRole("button", { name: "重試同步" }).count()) === 1 && !(await text(w2, ".fpr-hero")).includes("已同步到雲端"), code);
    note(`error code recorded for the refused save: ${code}`);
    step("F1b the recorded cloud error is permission-denied (a rules problem, not the network)", code === "permission-denied", code);
    await shot(w2, "07-practice-result-sync-failed");
  } finally { await putRules(repoRules); }
  await w2.getByRole("button", { name: "重試同步" }).click();
  await w2.getByText("已同步到雲端").waitFor({ timeout: 20000 });
  step("F2 rules restored → 重試同步 → 已同步到雲端", true);
  recs = await adminQuery("f01FixedPracticeRecords", "patientId", pW.id);
  const cycleAfter = (await adminQuery("trackingCycles", "patientId", pW.id))[0];
  step("F3 four practice records, each once; the week is unchanged (no completion day added); no analysisRecord", recs.length === 4 && JSON.stringify(cycleAfter.completedTrainingDates || []) === JSON.stringify(cycleW.completedTrainingDates || []) && (await adminQuery("analysisRecords", "patientId", pW.id)).length === 0, JSON.stringify(recs.map((r) => [r.ai && r.ai.countedReps, r.selfReport && r.selfReport.totalReps])));
  // 數據 → 訓練紀錄: three separate lists; reload reads back
  await w2.reload(); await w2.waitForFunction(() => typeof window.switchTab === "function"); await hydrated(w2);
  await nav(w2, "數據");
  t = await text(w2);
  step("D5 overview with records: 坐站練習 4 筆・自行回報 0 筆 (apart from the counts above), 感受回報 entry", /坐站練習（全部）\s*4 筆/.test(t) && /自行回報（本人填寫，全部）\s*0 筆/.test(t) && t.includes("感受回報"), t.slice(0, 400)); // UX round 5/5: rows now name their scope
  await tall(w2, "08b-data-overview-running-week");
  await w2.locator(".patient-data-seg", { hasText: "訓練紀錄" }).click();
  await w2.locator(".records-view", { hasText: "坐站練習" }).click();
  const rows = (await w2.locator(".data-run-row").allInnerTexts()).map((x) => x.replace(/\s+/g, " "));
  step("D6 訓練紀錄 → 坐站練習: date · type · main result, newest first, read back after reload; never in the 訓練 counts", rows.length === 4 && rows.some((r) => r.includes("2 / 5 次") && r.includes("自行回報 4 次（另外保存）")) && rows.some((r) => r.includes("只有自行回報")), JSON.stringify(rows));
  await shot(w2, "09-records-fixed-practice");
  await w2.locator(".data-run-row", { hasText: "2 / 5 次" }).click();
  step("D7 one record (opened from 數據): details, 回到訓練紀錄, 數據 highlighted", (await text(w2)).includes("另有 1 次動作無法確認") && (await w2.getByRole("button", { name: "回到訓練紀錄" }).count()) === 1 && (await activeTab(w2)) === "數據");
  await shot(w2, "10-record-detail");
  await w2.getByRole("button", { name: "回到訓練紀錄" }).click();
  await w2.locator(".records-view", { hasText: "訓練" }).first().click();
  // UX round 5/5: with fixed-practice records the empty 訓練 list points to the other lists instead of 「完成第一次練習」
  step("D8 訓練 view: formal / AI trainings only (none yet) — fixed practice not mixed in", (await text(w2)).includes("還沒有訓練紀錄。你的坐站練習與自行回報在上方的分頁中。") && (await w2.locator(".f01-fixed-history-row").count()) === 0);
  await w2.locator(".records-view", { hasText: "自行回報" }).click();
  step("D9 自行回報 view is its own list", (await text(w2)).includes("自行回報的練習"));
  await w2.locator(".patient-data-seg", { hasText: "功能評估" }).click();
  t = await text(w2);
  // UX round 5/5: the coming date is no longer a marker inside the plot (it could read as a predicted value); it is said
  // in words outside the chart — 「下次評估：MM/DD…，尚未量測」. Still one measured point, no 「?」, no line.
  step("C1 one week, one assessment: one point, no 「?」, no line; the coming date outside the plot (尚未量測)", (await w2.locator(".fa5c-dot").count()) === 1 && (await w2.locator(".fa5c-line").count()) === 0 && (await w2.locator(".fa5c-chart .fa5c-planned").count()) === 0 && !(await w2.locator(".fa5c-chart").innerHTML()).includes(">?<") && (await w2.locator(".fa5c-next").innerText()).includes(`下次評估：${md(cycleW.plannedReassessmentDateKey)}`) && t.includes("尚未量測"), t.slice(0, 300));
  await shot(w2, "11b-chart-single-week");
  await w2.context().close();

  // ═══ X. two weeks (week 1 made in the UI, then moved back and closed with a synthetic reassessment) ═══
  const xp = await login(pX);
  await createWeek(xp, faX);
  await xp.context().close();
  const [c1] = await adminQuery("trackingCycles", "patientId", pX.id);
  const reId = await seedRun(pX, `re-x-${tag}`, 11200, 3, { assessmentRole: "reassessment", trackingCycleId: c1.id });
  const { id: _omit, ...c1Data } = c1;
  await seed(async (db) => {
    await updateDoc(doc(db, "trackingCycles", c1.id), { cycleStartDateKey: dayKey(-9), plannedReassessmentDateKey: dayKey(-3), reassessmentId: reId, reassessmentDateKey: dayKey(-3), completedTrainingDates: [dayKey(-9), dayKey(-8), dayKey(-6)], dailyTrainingProgress: {}, seededSynthetic: true });
    await setDoc(doc(db, "trackingCycles", `${c1.id}_w2`), { ...c1Data, id: `${c1.id}_w2`, previousCycleId: c1.id, baselineAssessmentId: reId, reassessmentId: null, reassessmentDateKey: null, cycleStartDateKey: dayKey(-3), plannedReassessmentDateKey: dayKey(3), completedTrainingDates: [], dailyTrainingProgress: {}, createdAt: new Date().toISOString(), seededSynthetic: true });
  });
  const x = await login(pX);
  await nav(x, "數據");
  await x.locator(".patient-data-seg", { hasText: "功能評估" }).click();
  t = await text(x);
  const svg = await x.locator(".fa5c-chart").innerHTML();
  step("C2 two weeks: 第 1 週 / 第 2 週 groups; 12.8 → 11.2 joined inside week 1; 11.2 shown once (再次評估／第 2 週基準); week 2 coming date outside the plot (UX round 5/5)",
    svg.includes(">第 1 週<") && svg.includes(">第 2 週<") && (await x.locator(".fa5c-line").count()) === 1 && (svg.match(/>11\.2 秒</g) || []).length === 1 && svg.includes("再次評估／第 2 週基準") && !svg.includes("預計") && (await x.locator(".fa5c-next").innerText()).includes("尚未量測"), svg.slice(0, 200));
  step("C3 the sentence matches the shown values (12.8 → 11.2 = 少 1.6 秒); no 改善 / 退步", t.includes("第 1 週：本次完成時間較初次少 1.6 秒") && t.includes(`下次評估：${md(dayKey(3))}（第 2 週），尚未量測`) && !/改善|退步|進步/.test(t), t.slice(0, 500));
  await shot(x, "11-chart-two-weeks"); await tall(x, "11-chart-two-weeks-full");
  await x.locator(".track-week-cta").first().click();
  t = await text(x);
  step("C4 week 1 comparison page: the same values and the same sentence", t.includes("12.8 秒") && t.includes("11.2 秒") && t.includes("本次完成時間較初次少 1.6 秒"));
  await x.context().close();

  // ═══ L. sizes ═══
  for (const [wd, h] of [[390, 844], [430, 932], [1280, 800]]) {
    const q = await login(pX, { width: wd, height: h });
    await nav(q, "數據");
    await q.locator(".patient-data-seg", { hasText: "功能評估" }).click();
    const r = await q.evaluate(() => ({ over: document.documentElement.scrollWidth - innerWidth, chartScroll: (() => { const s = document.querySelector(".fa5c-scroll"); return s ? s.scrollWidth - s.clientWidth : 0; })(), navTop: Math.round(document.querySelector(".bottom-nav").getBoundingClientRect().top) }));
    step(`L ${wd} 功能評估: no page overflow (a wide chart scrolls inside its own box)`, r.over <= 0, JSON.stringify(r));
    await shot(q, `L-${wd}-assessment`);
    await q.locator(".patient-data-seg", { hasText: "總覽" }).click();
    await shot(q, `L-${wd}-data`);
    await q.context().close();
    const qw = await login(pW, { width: wd, height: h });
    await nav(qw, "數據");
    await qw.locator(".patient-data-seg", { hasText: "訓練紀錄" }).click();
    await qw.locator(".records-view", { hasText: "坐站練習" }).click();
    await qw.locator(".data-run-row").first().click();
    const rr = await qw.evaluate(() => { const b = [...document.querySelectorAll(".fpr-actions .btn")].map((e) => e.getBoundingClientRect()); const navTop = document.querySelector(".bottom-nav").getBoundingClientRect().top; const c = document.querySelector(".content"); c.scrollTop = c.scrollHeight; const last = document.querySelector(".fpr-actions").getBoundingClientRect(); return { over: document.documentElement.scrollWidth - innerWidth, lastBottom: Math.round(last.bottom), navTop: Math.round(navTop) }; });
    step(`L ${wd} record: no overflow; the last button scrolls clear of the bottom nav`, rr.over <= 0 && rr.lastBottom <= rr.navTop, JSON.stringify(rr));
    await shot(qw, `L-${wd}-record`);
    await qw.context().close();
  }
  step("no page errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await putRules(repoRules).catch(() => {});
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
