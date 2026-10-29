// Run from an isolated verification folder with Playwright and the demo emulators.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
const password = "b4-local-only-123", tag = Date.now();
async function account(role) {
  const email = `b4-${role}-${tag}@local.test`;
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await response.json(); assert.ok(data.localId, JSON.stringify(data));
  const user = { id: data.localId, email, account: email, role, name: `B4 ${role}`, createdAt: new Date().toISOString() };
  await seed(async db => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
const patient = await account("patient"), therapist = await account("therapist");
await seed(db => setDoc(doc(db, "therapistPatientRelations", "b4-browser-relation"), { id: "b4-browser-relation", patientId: patient.id, therapistId: therapist.id, status: "accepted", createdAt: new Date().toISOString() }));
const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", "5173", "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch("http://127.0.0.1:5173")).ok) break; } catch {} await new Promise(r => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const errors = [];
  async function login(user, width = 390) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      return ["localhost", "127.0.0.1"].includes(url.hostname) ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", async d => { errors.push(d.message()); await d.dismiss(); });
    await page.goto("http://127.0.0.1:5173/?emulator=1");
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate(role => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole(role); window.confirmAuthRole(); }, user.role);
    await page.locator("#loginAccount").fill(user.email);
    await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(() => !document.querySelector("#loginAccount"), null, { timeout: 20000 });
    if (user.role === "patient") {
      await page.evaluate(() => window.switchTab("home"));
      await page.getByRole("button", { name: /^(回報今日感受|修改今日回報)$/ }).waitFor({ timeout: 20000 });
    }
    return page;
  }
  const p1 = await login(patient);
  // Synthetic F01 plan + one saved partial attempt, through the app's services.
  await p1.evaluate(async user => {
    const { functionalAssessmentService: fa, FUNCTIONAL_ASSESSMENT_TYPES: types } = await import('/js/data/functionalAssessmentService.js');
    const { FA5X_CURRENT_MEASUREMENT_FIELDS: version } = await import('/js/data/fa5xMeasurementCompatibility.js');
    const { generateF01GoalRecommendation: generate } = await import('/js/data/f01GoalRecommendation.js');
    const { exerciseService: exercises } = await import('/js/data/exerciseService.js');
    const { recommendationService: recs } = await import('/js/data/recommendationService.js');
    const { trackingCycleService: cycles } = await import('/js/data/trackingCycleService.js');
    const { toLocalDateKey } = await import('/js/data/trackingCycle.js');
    const { createCollection, waitForCloudWrites } = await import('/js/data/storageService.js');
    const date = new Date(), day = toLocalDateKey(date);
    const b = fa.create({ patientId: user.id, bodyRegion: 'lower_limb', assessmentType: types.FIVE_TIMES_SIT_TO_STAND }).session;
    fa.completeSession(b.id, { result: { ...version, status: 'completed', repCount: 5, completedReps: 5, totalDurationMs: 12000, measuredAt: date.toISOString() } });
    // Setup only: any F01 goal serves this check. G01 first recommendations now need the condition screen
    // (f01G01ConditionScreen.js), so this synthetic plan uses G02; the items are replaced below anyway.
    const result = generate({ assessment: { status: 'completed', sessionId: b.id, assessmentType: 'five_times_sit_to_stand' }, selectedGoalId: 'G02', availableMinutes: 15, catalog: exercises.listNormalized() });
    result.items = ['F01-01','F01-10'].map((id,i) => ({ ...result.items[0], exerciseId: id, exerciseName: exercises.getNormalizedById(id).name, rank: i+1 }));
    const rec = recs.createF01GoalRecommendation({ patientId: user.id, result, createdBy: user.id }).recommendation;
    const cycle = cycles.createOrGetTrackingCycle({ userId: user.id, baselineSession: fa.getById(b.id), recommendation: rec }).cycle;
    const snap = cycles.ensureDailyTrainingSnapshot({ cycleId: cycle.id, userId: user.id, dateKey: day, mode: 'formal_start' });
    if (snap.error) throw Error(snap.error);
    createCollection('analysisRecords').create({ id: 'b4-reason-partial-'+user.id, patientId: user.id, exerciseId: 'F01-01', sourceType: 'remotion', sourceSubtype: 'f01_cycle', trackingCycleId: cycle.id, recommendationId: rec.id, planDateKey: day, totalReps: 2, completedAt: date.toISOString(), createdAt: date.toISOString() });
    const synced = await waitForCloudWrites(); if (synced.failed.length) throw Error(JSON.stringify(synced.failed));
    window.switchTab('home');
  }, patient);
  assert.ok((await p1.locator('.daily-training-progress').first().textContent()).includes('0／2 個動作已達標'));
  assert.ok((await p1.locator('.daily-training-progress').first().textContent()).includes('單筆紀錄：2 次'));
  await p1.getByRole("button", { name: "回報今日感受", exact: true }).click();
  assert.equal(await p1.locator("#dailyFeedbackDiscomfort").inputValue(), "");
  await p1.locator("#dailyFeedbackEffort").selectOption("unknown");
  await p1.locator("#dailyFeedbackDiscomfort").selectOption("unknown");
  await p1.locator("#dailyIncompleteReason").selectOption("recognition_problem");
  await p1.getByRole("button", { name: "儲存今日回報", exact: true }).click();
  await p1.getByText("已儲存今日回報；修改前的回報也會保留。", { exact: true }).waitFor();
  const dateKey = await p1.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });
  const read = async () => { let data; await seed(async db => { data = (await getDoc(doc(db, "dailyTrainingFeedback", `${patient.id}_${dateKey}`))).data(); }); return data; };
  assert.equal((await read()).revision, 1);
  assert.equal((await read()).reports[0].incompletion.progress.savedAttemptCount, 1);
  assert.equal((await read()).reports[0].incompletion.reason, 'recognition_problem');
  console.log("PASS | patient sees frozen targets + saved partial amount before reporting recognition problem; explicit unknown feelings kept");
  const p2 = await login(patient);
  await p2.getByRole("button", { name: "修改今日回報", exact: true }).click();
  await p2.locator("#dailyFeedbackNote").fill("另一裝置尚未儲存的內容");
  await p1.getByRole("button", { name: "修改今日回報", exact: true }).click();
  await p1.locator("#dailyFeedbackEffort").selectOption("somewhat_hard");
  await p1.locator("#dailyFeedbackDiscomfort").selectOption("yes");
  await p1.locator("#dailyIncompleteReason").selectOption("save_problem");
  await p1.locator("#dailyFeedbackNote").fill("本機瀏覽器測試修正");
  await p1.getByRole("button", { name: "儲存今日回報", exact: true }).click();
  await p1.getByText("已儲存今日回報；修改前的回報也會保留。", { exact: true }).waitFor();
  await p2.getByRole("button", { name: "儲存今日回報", exact: true }).click();
  await p2.getByText("資料已在另一個畫面或裝置更新。請取消編輯，確認最新回報後再修改。", { exact: true }).waitFor();
  assert.equal(await p2.locator("#dailyFeedbackNote").inputValue(), "另一裝置尚未儲存的內容");
  const saved = await read(); assert.equal(saved.revision, 2); assert.equal(saved.reports[0].discomfort, "unknown"); assert.equal(saved.reports[1].discomfort, "yes");
  console.log("PASS | second device conflict preserves draft; stored original and correction unchanged");
  const t = await login(therapist, 1100);
  await t.evaluate(id => window.goCaseDetail(id, "overview"), patient.id);
  await t.getByRole("heading", { name: "近期訓練感受（本人回報）" }).waitFor();
  assert.ok((await t.locator(".daily-feedback-card").textContent()).includes("本機瀏覽器測試修正"));
  assert.ok((await t.locator(".daily-feedback-card").textContent()).includes("有不舒服"));
  assert.ok((await t.locator(".daily-feedback-card").textContent()).includes("紀錄儲存有問題"));
  assert.ok((await t.locator(".daily-feedback-card").textContent()).includes("動作辨識有問題"));
  console.log("PASS | linked therapist sees cloud-loaded report and correction history in case overview");
  assert.deepEqual(errors, []);
  console.log("PASS | no page errors or dialogs; requests restricted to local Auth, Firestore and Vite; no camera or Gemini");
} finally {
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
