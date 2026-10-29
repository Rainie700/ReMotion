// G01 condition screen v1 — BROWSER acceptance check (docs/F01_G01_IMPLEMENTABLE_CONDITIONS.md).
// Real Chromium (Playwright) on the Vite dev server in emulator mode (?emulator=1) against the LOCAL
// Auth + Firestore emulators (project demo-remotion). One browser context per synthetic patient.
// Nothing reaches a real project; no camera recognition, no Gemini, no patient00.
// Only the synthetic 5xSTS sessions a camera run would have stored (with or without a condition report)
// are seeded; everything else is clicked in the app. Condition screening / engineering-spec check only.
//
//   REPO=<repo> SHOTS=<repo>/reports/f01-g01-condition-screen-browser \
//   firebase emulators:exec --only firestore,auth --project demo-remotion "node f01G01ConditionScreenBrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/f01-g01-condition-screen-browser`;
mkdirSync(shots, { recursive: true });
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);

const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const adminGet = async (name, id) => { let out = null; await seed(async (db) => { const s = await getDoc(doc(db, name, id)); out = s.exists() ? s.data() : null; }); return out; };
const password = "g01-local-only-123", tag = Date.now();
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };

async function account(label) {
  const email = `g01-${label}-${tag}@local.test`;
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await res.json(); assert.ok(data.localId, JSON.stringify(data));
  const user = { id: data.localId, email, account: email, role: "patient", name: `G01 ${label}`, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
/** Synthetic completed 5xSTS of today; `report` = { armsUsed, physicalAssistance } or null (no report). */
async function seedAssessment(patient, report) {
  const at = new Date();
  const id = `fa-${patient.id.slice(0, 8)}`;
  await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", id), {
    id, patientId: patient.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed",
    startedAt: at.toISOString(), completedAt: at.toISOString(), therapistId: "", relationId: "",
    result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 12400, measuredAt: at.toISOString(), seededSynthetic: true },
    ...(report ? { conditionReports: [{ schemaVersion: "fa5x-condition-report-1", ...report, chairHeightCm: null, sameChairAsBaseline: "not_applicable", source: "self_report", reportedBy: patient.id, reportedAt: at.toISOString() }] } : {}),
  }));
  return id;
}

const pOne = await account("all-no");
const pYes = await account("assisted");
const pUnk = await account("unknown");
const pRun = await account("running-week");
const faOne = await seedAssessment(pOne, { armsUsed: "no", physicalAssistance: "no" });
const faYes = await seedAssessment(pYes, { armsUsed: "yes", physicalAssistance: "unknown" });
const faUnk = await seedAssessment(pUnk, { armsUsed: "unknown", physicalAssistance: "no" });
const faRun = await seedAssessment(pRun, { armsUsed: "no", physicalAssistance: "yes" });

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", "5173", "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch("http://127.0.0.1:5173")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const OPTIONAL = ["trackingCycles", "d5TherapistReviews", "f01InitialReviews"];
  async function hydrated(page) {
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(async (names) => {
        const { storageService } = await import("/js/data/storageService.js");
        return Object.fromEntries(names.map((n) => [n, storageService.getOptionalCloudLoadStatus(n)]));
      }, OPTIONAL);
      if (Object.values(st).every((v) => v === "loaded" || v === "failed")) {
        if (Object.values(st).includes("failed")) throw Error(`optional cloud load failed: ${JSON.stringify(st)}`);
        await page.locator(".top-profile-container").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 20000 });
        return;
      }
      if (Date.now() - t0 > 30000) throw Error(`hydration did not finish: ${JSON.stringify(st)}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  async function login(user) {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } });
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${user.name}: ${e.message}`));
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto("http://127.0.0.1:5173/?emulator=1");
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate(() => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
    await page.locator("#loginAccount").fill(user.email);
    await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(() => !document.querySelector("#loginAccount"), null, { timeout: 20000 });
    await hydrated(page);
    return page;
  }
  const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
  const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  /** Phase C as a patient does it: result page -> 查看訓練建議 -> goal + 20 分鐘 -> 產生訓練建議. */
  async function generate(page, sessionId, goalLabel) {
    await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), sessionId);
    await page.getByRole("button", { name: "查看訓練建議 →" }).click();
    await page.locator(".f01-goal-card", { hasText: goalLabel }).click();
    await page.getByRole("button", { name: "20 分鐘" }).click();
    await page.getByRole("button", { name: "產生訓練建議 →" }).click();
    await page.locator(".f01-rec-hero-title, .f01-g01-no-candidates").first().waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500); // the plan / cycle cloud writes of a saved plan
  }
  const userRecs = (u) => adminQuery("recommendationResults", "patientId", u.id);
  const userCycles = (u) => adminQuery("trackingCycles", "patientId", u.id);
  const FORBIDDEN = /已確認安全|不適合運動|推薦準確度|準確率提升/;

  // ═══ 1. conditions all no -> one candidate -> normal start ═══
  const a = await login(pOne);
  await generate(a, faOne, "從椅子起身更順");
  let t = await text(a);
  const [recA] = await userRecs(pOne);
  const [cycA] = await userCycles(pOne);
  step("1a one candidate, stated as one; no full-length claim", t.includes("目前提供 1 個動作") && t.includes("你選了 20 分鐘，本版目前只提供 1 個動作，不是 20 分鐘的完整課表或處方。") && (await a.locator('[onclick^="startF01RecommendedTraining"]').count()) === 1);
  step("1b plan saved with the condition snapshot and rule version", !!recA && recA.exerciseIds.join() === "F01-04" && recA.conditionScreen && recA.conditionScreen.ruleVersion === "f01-g01-condition-screen-1.0"
    && recA.conditionScreen.sourceAssessmentId === faOne && recA.conditionScreen.armsUsed === "no" && recA.conditionScreen.reportIndex === 0, JSON.stringify(recA && recA.conditionScreen));
  step("1c week created in the emulator on that plan", !!cycA && cycA.recommendationId === recA.id);
  step("1d left-out exercises listed with their kind; not offered back as other options", t.includes("未納入的動作（2）") && !t.includes("其他可選動作") && !FORBIDDEN.test(t), (t.match(FORBIDDEN) || [""])[0]);
  await a.locator("details.f01-excluded-card summary").click();
  await shot(a, "1-one-candidate");
  await a.locator(`[onclick="startF01RecommendedTraining('F01-04')"]`).click();
  await a.getByText("準備開始").waitFor({ timeout: 20000 });
  await a.waitForTimeout(1200);
  const prog = Object.values(((await userCycles(pOne))[0] || {}).dailyTrainingProgress || {});
  step("1e training preparation opened; today's targets frozen from the one-item plan", prog.length === 1 && prog[0].requiredExerciseIds.join() === "F01-04", JSON.stringify(prog.map((p) => p.requiredExerciseIds)));
  await shot(a, "1-training-prep");

  // ═══ 2. assistance reported (plus unknown) -> zero candidates, reasons and exits ═══
  const b = await login(pYes);
  await generate(b, faYes, "從椅子起身更順");
  t = await text(b);
  step("2a zero-candidate page with every reason kind", t.includes("這次沒有自動列出動作") && t.includes("目前未支援") && t.includes("資料未確認") && t.includes("本版未納入") && t.includes("不需要為了取得推薦而更改回答"));
  step("2b no backfill-as-unlock, no training, invite-code exit (unlinked)", (await b.locator("text=前往補充測試條件").count()) === 0 && (await b.locator('[onclick^="startF01RecommendedTraining"]').count()) === 0
    && (await b.locator("#inviteCodeInput").count()) === 1 && !FORBIDDEN.test(t));
  step("2c nothing saved, no cycle", (await userRecs(pYes)).length === 0 && (await userCycles(pYes)).length === 0);
  await shot(b, "2-zero-assistance");

  // ═══ 3. unknown -> backfill through the existing form -> new recommendation, earlier report kept ═══
  const c = await login(pUnk);
  await generate(c, faUnk, "從椅子起身更順");
  t = await text(c);
  step("3a zero page: conditions not confirmed, backfill entry", t.includes("協助條件尚未確認") && t.includes("回報為不確定") && (await c.getByRole("button", { name: "前往補充測試條件" }).count()) === 1);
  step("3b nothing saved before backfill", (await userRecs(pUnk)).length === 0 && (await userCycles(pUnk)).length === 0);
  await shot(c, "3-zero-unknown");
  await c.getByRole("button", { name: "前往補充測試條件" }).click();
  await c.locator(".fa5x-condition-card").waitFor({ timeout: 20000 });
  await c.locator(".fa5x-cond-form summary").click();
  step("3c the existing form opens with no answer pre-selected", (await c.locator('.fa5x-cond-form input[type="radio"]:checked').count()) === 0);
  await c.locator('input[name="fa5xCondArms"][value="no"]').check();
  await c.locator('input[name="fa5xCondAssist"][value="no"]').check();
  await c.locator('input[name="fa5xCondSource"][value="self_report"]').check();
  await shot(c, "3-backfill-form");
  await c.getByRole("button", { name: "儲存測試條件" }).click();
  await c.waitForTimeout(1500);
  const sessC = await adminGet("functionalAssessmentSessions", faUnk);
  step("3d report appended in the cloud; the earlier one kept", sessC.conditionReports.length === 2 && sessC.conditionReports[0].armsUsed === "unknown" && sessC.conditionReports[1].armsUsed === "no", JSON.stringify(sessC.conditionReports.map((r) => r.armsUsed)));
  await generate(c, faUnk, "從椅子起身更順");
  const recsC = await userRecs(pUnk);
  step("3e new recommendation from the latest report; week starts", recsC.length === 1 && recsC[0].exerciseIds.join() === "F01-04" && recsC[0].conditionScreen.reportIndex === 1
    && (await userCycles(pUnk)).length === 1 && (await c.locator('[onclick^="startF01RecommendedTraining"]').count()) === 1, JSON.stringify(recsC.map((r) => r.conditionScreen)));
  await shot(c, "3-after-backfill");

  // ═══ 4. an existing week: a zero-candidate G01 result leaves it untouched ═══
  const d = await login(pRun);
  await generate(d, faRun, "加強整體下肢力量");
  const [recD] = await userRecs(pRun);
  const [cycD] = await userCycles(pRun);
  step("4a existing week running on a G02 plan", !!recD && !!cycD && cycD.recommendationId === recD.id && recD.conditionScreen === undefined);
  const cycBefore = JSON.stringify(cycD);
  await generate(d, faRun, "從椅子起身更順");
  t = await text(d);
  step("4b G01 with reported assistance -> zero-candidate page, says the running week is unaffected", t.includes("這次沒有自動列出動作") && t.includes("已經在進行的追蹤不受影響"));
  const cycAfter = await userCycles(pRun);
  step("4c the week and its plan are unchanged in the cloud; no new plan", cycAfter.length === 1 && JSON.stringify(cycAfter[0]) === cycBefore && (await userRecs(pRun)).length === 1);
  await shot(d, "4-zero-with-running-week");
  await d.evaluate((id) => window.goF01RecommendationResult(id), recD.id);
  await d.locator('[onclick^="startF01RecommendedTraining"]').first().waitFor({ timeout: 20000 });
  step("4d the running plan's training entry still works", (await d.locator('[onclick^="startF01RecommendedTraining"]').count()) >= 1);
  await d.evaluate(() => window.switchTab("home"));
  await d.waitForTimeout(500);
  step("4e home still shows the running week", (await text(d)).includes("本週功能追蹤"));
  await shot(d, "4-home-running-week");

  step("no page errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
