// F01 first-recommendation review — BROWSER acceptance check (docs/F01_INITIAL_REVIEW_PLAN.md).
// Real Chromium (Playwright) on the Vite dev server in emulator mode (?emulator=1) against the LOCAL
// Auth + Firestore emulators (project demo-remotion). Separate browser contexts for the patients and the
// therapist (no shared local storage). Nothing reaches a real project; no camera recognition, no Gemini.
//
// Only the synthetic 5xSTS assessments that a camera would have produced are seeded (admin, emulator);
// everything else is clicked in the app. Case C hands a SYNTHETIC finished run to the real completion
// handler through window.__emulatorFinishFa5xRun (defined only in emulator mode): the browser flow is
// verified, real camera recognition is NOT.
//
// Run from an isolated folder with firebase-tools, @firebase/rules-unit-testing, firebase and playwright:
//   REPO=<repo> SHOTS=<repo>/reports/f01-initial-review-browser \
//   firebase emulators:exec --only firestore,auth --project demo-remotion "node f01InitialReviewBrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDocs, deleteDoc, collection, query, where } from "firebase/firestore";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/f01-initial-review-browser`;
mkdirSync(shots, { recursive: true });
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);

const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const password = "f01-local-only-123", tag = Date.now();
const results = [];
const port = Number(process.env.PORT || 5173); // 2026-10-28: settable, so a check never lands on another dev server
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };

async function account(role, label) {
  const email = `f01-${label}-${tag}@local.test`;
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await res.json(); assert.ok(data.localId, JSON.stringify(data));
  const user = { id: data.localId, email, account: email, role, name: `F01 ${label}`, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
/** The synthetic original assessment (what a completed camera run stores), measured `daysAgo` local days ago. */
async function seedAssessment(patient, relation, daysAgo) {
  const at = new Date(Date.now() - daysAgo * 86400000);
  const id = `fa-${patient.id.slice(0, 6)}-${daysAgo}`;
  await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", id), {
    id, patientId: patient.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed",
    startedAt: at.toISOString(), completedAt: at.toISOString(), therapistId: relation ? relation.therapistId : "", relationId: relation ? relation.id : "",
    result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 13600, measuredAt: at.toISOString(), seededSynthetic: true },
  }));
  return id;
}

const therapist = await account("therapist", "therapist");
const pA = await account("patient", "patient-a");
const pB = await account("patient", "patient-b");
const pC = await account("patient", "patient-c");
const pD = await account("patient", "patient-d"); // no therapist relation
const pE = await account("patient", "patient-e"); // a running week, then a new plan
const relB = { id: `rel-b-${tag}`, therapistId: therapist.id, patientId: pB.id, status: "accepted", createdAt: new Date().toISOString() };
const relC = { id: `rel-c-${tag}`, therapistId: therapist.id, patientId: pC.id, status: "accepted", createdAt: new Date().toISOString() };
await seed(async (db) => { await setDoc(doc(db, "therapistPatientRelations", relB.id), relB); await setDoc(doc(db, "therapistPatientRelations", relC.id), relC); });
const faA = await seedAssessment(pA, null, 0);
const faB = await seedAssessment(pB, relB, 0);
const faC = await seedAssessment(pC, relC, 2); // an earlier original assessment -> cross-day acceptance
const relE = { id: `rel-e-${tag}`, therapistId: therapist.id, patientId: pE.id, status: "accepted", createdAt: new Date().toISOString() };
await seed((db) => setDoc(doc(db, "therapistPatientRelations", relE.id), relE));
const faD = await seedAssessment(pD, null, 0);
const faE = await seedAssessment(pE, relE, 0);

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });

  async function login(user, width = 390) {
    const context = await browser.newContext({ viewport: { width, height: 900 } }); // own storage per user
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${user.name}: ${e.message}`));
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate((role) => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole(role); window.confirmAuthRole(); }, user.role);
    await page.locator("#loginAccount").fill(user.email);
    await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(() => !document.querySelector("#loginAccount"), null, { timeout: 20000 });
    await hydrated(page);
    return page;
  }
  /**
   * App ready after login / reload: polls the app's own status until EVERY optional collection this flow
   * reads is "loaded" (or "failed", reported), then waits for the session's landing page. Never a fixed wait.
   * - getOptionalCloudLoadStatus is null both when no cloud load ran and while hydration is still in its
   *   first phase, so null keeps polling. (The earlier version of this check, written as
   *   page.waitForFunction(async () => …), did not wait for the load in this script: it read the screen
   *   before the collections and the landing page were ready. See the report; not a general claim.)
   * - "loaded" is set at the END of hydrateCloudForUser, but the app's session (setSession: current user +
   *   landing route) is set only after that resolves; navigating in between renders with no current user
   *   and is then overwritten by the landing route. So the landing page is the ready signal.
   */
  const OPTIONAL = ["trackingCycles", "d5TherapistReviews", "f01InitialReviews"];
  async function hydrated(page, label = "") {
    const t0 = Date.now();
    let first = null;
    for (;;) {
      const st = await page.evaluate(async (names) => {
        const { storageService } = await import("/js/data/storageService.js");
        return Object.fromEntries(names.map((n) => [n, storageService.getOptionalCloudLoadStatus(n)]));
      }, OPTIONAL);
      if (!first) first = st;
      if (Object.values(st).every((v) => v === "loaded" || v === "failed")) {
        if (label) console.log(`HYDRATE ${label} first=${JSON.stringify(first)} final=${JSON.stringify(st)} after ${Date.now() - t0} ms`);
        if (Object.values(st).includes("failed")) throw Error(`optional cloud load failed: ${JSON.stringify(st)}`);
        await page.locator(".top-profile-container, .therapist-workspace").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 20000 });
        return st;
      }
      if (Date.now() - t0 > 30000) throw Error(`hydration did not finish: ${JSON.stringify(st)}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  async function reload(page, label = "") { await page.reload(); await page.waitForFunction(() => typeof window.switchTab === "function"); return hydrated(page, label); }
  const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
  const text = (page) => page.locator("body").innerText();
  /** Phase C exactly as a patient does it: result page -> 查看訓練建議 -> needs -> 產生訓練建議. */
  async function createPlan(page, sessionId, { limitL05 }) {
    await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), sessionId);
    await page.getByRole("button", { name: "查看訓練建議 →" }).click();
    await page.locator(".f01-goal-card", { hasText: "加強髖部與骨盆穩定" }).click();
    await page.getByRole("button", { name: "20 分鐘" }).click();
    if (limitL05) await page.locator(".f01-limit-row", { hasText: "目前無法安全地單腳站立" }).locator("input").check();
    await page.getByRole("button", { name: "產生訓練建議 →" }).click();
    await page.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
  }
  const homeCard = async (page) => { await page.evaluate(() => window.switchTab("home")); const n = page.locator(".f01-initial-plan-home"); await page.waitForTimeout(300); return (await n.count()) ? (await n.innerText()).replace(/\s+/g, " ") : null; };
  /** Clicks 重新載入 (first-plan section of the current page) and waits for its own result line. */
  async function clickReload(page) {
    await page.locator(".f01-reload-btn").first().click();
    await page.locator(".f01-reload-status").filter({ hasNotText: "載入中" }).first().waitFor({ timeout: 45000 });
    return (await page.locator(".f01-reload-status").first().innerText()).trim();
  }
  const homeEntries = async (page) => { await page.evaluate(() => window.switchTab("home")); await page.waitForTimeout(400); return (await page.locator("button").allInnerTexts()).map((t) => t.trim()).filter(Boolean); };
  const journeyNotice = async (page) => { await page.evaluate(() => window.goMap()); await page.waitForTimeout(400); const n = page.locator(".f01-initial-plan-notice"); return (await n.count()) ? (await n.innerText()).replace(/\s+/g, " ") : "(無首次安排卡片)"; };
  const userRecs = (u) => adminQuery("recommendationResults", "patientId", u.id);
  const userCycles = (u) => adminQuery("trackingCycles", "patientId", u.id);
  /** The preparation page freezes today's targets into the cycle (a cloud write): read them back from the emulator. */
  const frozenToday = async (u) => {
    const [cy] = await userCycles(u);
    const entries = Object.values((cy && cy.dailyTrainingProgress) || {});
    const e = entries[entries.length - 1];
    return e ? { required: e.requiredExerciseIds, targets: Object.fromEntries(Object.entries(e.targets || {}).map(([k, v]) => [k, { sets: v.sets.value, reps: v.repsPerSet.value, source: v.sets.source }])) } : null;
  };

  // ═══ A. ordinary first recommendation (no review) ═══
  const a = await login(pA);
  await createPlan(a, faA, { limitL05: false });
  await a.waitForTimeout(1500);
  let recsA = await userRecs(pA);
  step("A1 plan saved with verifiable fields", recsA.length === 1 && Array.isArray(recsA[0].exerciseIds) && recsA[0].initialReview && recsA[0].initialReview.required === false, JSON.stringify(recsA.map((r) => r.exerciseIds)));
  let cyclesA = await userCycles(pA);
  step("A2 first week created in the emulator (rules accepted it: plan was synced first)", cyclesA.length === 1 && cyclesA[0].recommendationId === recsA[0].id);
  step("A3 no review card, training entries present", !(await text(a)).includes("待復健師檢視") && (await a.locator('[onclick^="startF01RecommendedTraining"]').count()) === 3);
  await shot(a, "A1-recommendation-page");
  await a.evaluate(() => window.goSchedule());
  await a.waitForTimeout(500);
  const aToday = await text(a);
  step("A4 today plan lists the plan", ["坐姿抬膝", "橋式", "站姿髖屈曲"].every((n) => aToday.includes(n)));
  await shot(a, "A2-today-plan");
  await a.evaluate((id) => window.goF01RecommendationResult(id), recsA[0].id);
  await a.locator('[onclick^="startF01RecommendedTraining"]').first().click();
  await a.getByText("準備開始").waitFor({ timeout: 20000 });
  await a.waitForTimeout(1500);
  const frozenA = await frozenToday(pA);
  step("A5 training preparation page opened; today's targets frozen in the cloud from the plan", !!frozenA && frozenA.required.join() === recsA[0].items.map((i) => i.exerciseId).join(), JSON.stringify(frozenA));
  await shot(a, "A3-training-prep");

  // ═══ B. review needed, same-day acceptance ═══
  {
    const probe = await login(pA);
    const t0 = Date.now();
    let resolved = true;
    try { await probe.waitForFunction(async () => false, null, { timeout: 2000 }); } catch { resolved = false; }
    console.log(`OBSERVED (this script, Playwright 1.56.1): page.waitForFunction(async () => false, null, { timeout: 2000 }) ${resolved ? "returned" : "timed out"} after ${Date.now() - t0} ms`);
    await probe.context().close();
  }
  const t = await login(therapist, 1100); // logged in before patient B's plan exists
  await t.evaluate((id) => window.goCaseDetail(id, "overview"), pB.id);
  await t.getByText("目前沒有需要檢視的首次訓練安排").waitFor({ timeout: 20000 });
  const b = await login(pB);
  await createPlan(b, faB, { limitL05: true });
  await b.waitForTimeout(1500);
  const recB = (await userRecs(pB))[0];
  step("B1 L05 + F01-11 -> pending review, no week, no training", recB.initialReview.required === true && (await userCycles(pB)).length === 0
    && (await text(b)).includes("待復健師檢視") && (await b.locator('[onclick^="startF01RecommendedTraining"]').count()) === 0, JSON.stringify(recB.exerciseIds));
  await shot(b, "B1-patient-pending-review");
  const bHomePending = await homeEntries(b);
  const bMapPending = await journeyNotice(b);
  const hB1 = await homeCard(b);
  step("H1 home: 待復健師檢視 (linked) -> 查看待檢視安排, no 'notified' claim", !!hB1 && hB1.includes("待復健師檢視") && hB1.includes("查看待檢視安排") && hB1.includes("系統不會另外通知"), hB1);
  await shot(b, "H1-home-awaiting-review");
  // therapist: 重新載入 instead of a page refresh
  step("R1 therapist (logged in earlier) does not see the new plan yet", (await t.getByText("首次訓練安排待檢視").count()) === 0);
  const r1 = await clickReload(t);
  await t.getByText("首次訓練安排待檢視").waitFor({ timeout: 20000 });
  step("R2 therapist 重新載入 -> the new plan appears without a page refresh", r1.startsWith("已重新載入"), r1);
  await shot(t, "R2-therapist-after-reload");
  await t.getByRole("button", { name: "檢視並確認安排" }).click();
  const rows = t.locator(".d5-review-row-edit");
  step("B2 therapist form shows the candidate list", (await rows.count()) === 3);
  await rows.nth(2).getByRole("button", { name: "移除" }).click(); // remove F01-11
  await rows.nth(0).locator('input[placeholder^="組數"]').fill("2");
  await t.locator('textarea[placeholder="調整理由（必填）"]').fill("改坐姿與支撐版本，第一週先 2 組");
  // 重新載入 while the form is open keeps the unsent input
  const r3 = await clickReload(t);
  step("R3 therapist 重新載入 keeps the unsent form (items, sets, reason)", r3.startsWith("已重新載入") && (await rows.count()) === 2
    && (await rows.nth(0).locator('input[placeholder^="組數"]').inputValue()) === "2"
    && (await t.locator('textarea[placeholder="調整理由（必填）"]').inputValue()) === "改坐姿與支撐版本，第一週先 2 組", r3);
  await shot(t, "B2-therapist-form");
  await t.getByRole("button", { name: "確認這份安排" }).click();
  await t.getByText(/已確認（/).waitFor({ timeout: 20000 });
  const reviewB = (await adminQuery("f01InitialReviews", "patientId", pB.id))[0];
  step("B3 confirmation written to the emulator by the therapist", !!reviewB && reviewB.items.map((i) => i.exerciseId).join() === "F01-09,F01-10" && reviewB.items[0].dose.sets === 2);
  await shot(t, "B3-therapist-confirmed");
  // patient: 重新載入 on the recommendation page (no page refresh) -> 待接受, nothing accepted by it
  await b.evaluate((id) => window.goF01RecommendationResult(id), recB.id);
  step("R4 patient still sees the pending state before reloading", (await text(b)).includes("待復健師檢視"));
  const r4 = await clickReload(b);
  await b.getByText("復健師已確認，等待你接受").waitFor({ timeout: 20000 });
  step("R5 patient 重新載入 -> 待接受; the reload accepted nothing and started nothing", r4.startsWith("已重新載入") && (await userRecs(pB))[0].status === "draft" && (await userCycles(pB)).length === 0, r4);
  await shot(b, "R5-patient-after-reload");
  // a failed reload (offline) keeps what is shown and says so; a retry succeeds
  await b.context().setOffline(true);
  const r6 = await clickReload(b);
  const keptAfterFail = (await text(b)).includes("復健師已確認，等待你接受") && (await b.getByRole("button", { name: "接受這份安排" }).count()) === 1;
  step("R6 reload failure: error shown, the confirmed content stays", r6.startsWith("更新失敗") && keptAfterFail, r6);
  await shot(b, "R6-reload-failed");
  await b.context().setOffline(false);
  const r7 = await clickReload(b);
  step("R7 retry after the failure succeeds", r7.startsWith("已重新載入") && (await b.getByRole("button", { name: "接受這份安排" }).count()) === 1, r7);
  // patient: refresh -> 待接受 (state after a page refresh)
  await reload(b, "patient B after the therapist confirmed");
  await b.evaluate((id) => window.goF01RecommendationResult(id), recB.id);
  step("B4 after refresh: confirmed content + accept entry", (await text(b)).includes("復健師已確認，等待你接受") && (await b.getByRole("button", { name: "接受這份安排" }).count()) === 1);
  await shot(b, "B4-patient-awaiting-acceptance-after-refresh");
  const bHomeReviewed = await homeEntries(b);
  const bMapReviewed = await journeyNotice(b);
  const hB2 = await homeCard(b);
  step("H2 home: 復健師已確認 -> 查看確認安排", !!hB2 && hB2.includes("復健師已確認，等待你接受") && hB2.includes("查看確認安排"), hB2);
  await shot(b, "H2-home-awaiting-acceptance");
  // a cycle sync failure: a document already sits at the plan's first-week id (another owner) -> the write is refused
  const firstWeekId = `trackingCycle_initial_${recB.id}`;
  await seed((db) => setDoc(doc(db, "trackingCycles", firstWeekId), { id: firstWeekId, userId: "blocker", patientId: "blocker", createdAt: "2000-01-01T00:00:00.000Z" }));
  await b.evaluate((id) => window.goF01RecommendationResult(id), recB.id);
  await b.getByRole("button", { name: "接受這份安排" }).click();
  await b.getByText("已接受安排，但第一週尚未同步到雲端").waitFor({ timeout: 20000 });
  step("B5 cycle sync refused -> accepted, week NOT reported as started", (await userCycles(pB)).length === 0 && (await userRecs(pB))[0].status === "accepted");
  await shot(b, "B5-cycle-sync-failed");
  const hB3 = await homeCard(b);
  step("H3 home: sync failed and retryable -> 開始第一週", !!hB3 && hB3.includes("已接受，第一週尚未開始") && hB3.includes("開始第一週"), hB3);
  await shot(b, "H3-home-retry");
  await seed((db) => deleteDoc(doc(db, "trackingCycles", firstWeekId)));
  await b.locator(".f01-initial-plan-home").getByRole("button", { name: "開始第一週" }).click();
  for (let i = 0; i < 100 && !(await userCycles(pB)).length; i++) await b.waitForTimeout(150);
  await b.evaluate((id) => window.goF01RecommendationResult(id), recB.id);
  await b.locator('[onclick^="startF01RecommendedTraining"]').first().waitFor({ timeout: 20000 });
  const cyclesB = await userCycles(pB);
  step("B6 retry starts the week once", cyclesB.length === 1 && cyclesB[0].id === firstWeekId && cyclesB[0].initialPlanAcceptance.baselineSource === "original_assessment");
  const bRec = await text(b);
  step("B7 recommendation page = confirmed plan", (await b.locator('[onclick^="startF01RecommendedTraining"]').count()) === 2 && !(await b.locator(`[onclick="startF01RecommendedTraining('F01-11')"]`).count()) && bRec.includes("2 組"));
  await shot(b, "B6-started-recommendation-page");
  await b.evaluate(() => window.goSchedule()); await b.waitForTimeout(500);
  const bToday = await text(b);
  step("B8 today plan = confirmed plan", bToday.includes("坐姿抬膝") && bToday.includes("橋式") && !bToday.includes("站姿髖屈曲"));
  await shot(b, "B7-today-plan");
  await b.evaluate((id) => window.goF01RecommendationResult(id), recB.id);
  await b.locator(`[onclick="startF01RecommendedTraining('F01-09')"]`).click();
  await b.getByText("準備開始").waitFor({ timeout: 20000 });
  await b.waitForTimeout(1500);
  const frozenB = await frozenToday(pB);
  step("B9 training preparation froze the confirmed plan: F01-09 at the therapist's 2 sets", !!frozenB && frozenB.required.join() === "F01-09,F01-10" && frozenB.targets["F01-09"].sets === 2 && frozenB.targets["F01-09"].source === "therapist_dose", JSON.stringify(frozenB));
  await shot(b, "B8-training-prep");
  await reload(b);
  await b.evaluate((id) => window.goF01RecommendationResult(id), recB.id);
  step("B10 after refresh (started): training entries kept", (await b.locator('[onclick^="startF01RecommendedTraining"]').count()) === 2);
  const bHomeStarted = await homeEntries(b);
  const bMapStarted = await journeyNotice(b);
  const hB4 = await homeCard(b);
  step("H4 home: first week started -> no duplicate to-do; the week's own entries are there", hB4 === null && bHomeStarted.includes("開始今日訓練"), JSON.stringify(bHomeStarted));
  await shot(b, "B9-journey-started");

  // ═══ C. review needed, acceptance on a later day than the original assessment ═══
  const c = await login(pC);
  await createPlan(c, faC, { limitL05: true });
  await c.waitForTimeout(1500);
  const recC = (await userRecs(pC))[0];
  step("C1 pending review on the earlier assessment", recC.initialReview.required === true && (await userCycles(pC)).length === 0);
  await t.evaluate((id) => window.goCaseDetail(id, "overview"), pC.id);
  await clickReload(t); // no page refresh
  await t.getByText("首次訓練安排待檢視").waitFor({ timeout: 20000 });
  await t.getByRole("button", { name: "檢視並確認安排" }).click();
  await t.locator(".d5-review-row-edit").nth(2).getByRole("button", { name: "移除" }).click();
  await t.locator('textarea[placeholder="調整理由（必填）"]').fill("先不做站姿髖屈曲");
  await t.getByRole("button", { name: "確認這份安排" }).click();
  await t.getByText(/已確認（/).waitFor({ timeout: 20000 });
  await reload(c);
  await c.evaluate((id) => window.goF01RecommendationResult(id), recC.id);
  await c.getByRole("button", { name: "接受這份安排" }).click();
  await c.getByText("已接受安排，請完成新的基準評估").waitFor({ timeout: 20000 });
  step("C2 accepted on a later day: no week yet", (await userCycles(pC)).length === 0 && (await userRecs(pC))[0].status === "accepted");
  await reload(c);
  await c.evaluate((id) => window.goF01RecommendationResult(id), recC.id);
  step("C3 after refresh (待新基準): fresh-baseline entry kept", (await c.getByRole("button", { name: "開始第一週基準評估 →" }).count()) === 1 && (await text(c)).includes("復健師並沒有審閱這次新評估"));
  await shot(c, "C1-awaiting-fresh-baseline-after-refresh");
  const cHomeBaseline = await homeEntries(c);
  const cMapBaseline = await journeyNotice(c);
  await shot(c, "C2-journey-awaiting-fresh-baseline");
  const hC = await homeCard(c);
  step("H5 home: 已接受、待新基準 -> 開始第一週基準評估", !!hC && hC.includes("已接受，請完成新的基準評估") && hC.includes("開始第一週基準評估"), hC);
  await shot(c, "H5-home-awaiting-fresh-baseline");
  await c.locator(".f01-initial-plan-home").getByRole("button", { name: "開始第一週基準評估" }).click(); // from home
  await c.getByText("F01 7 日追蹤｜第一週基準評估").waitFor({ timeout: 20000 });
  await shot(c, "C3-baseline-assessment-entry");
  await c.getByRole("button", { name: "開始評估 →" }).click();
  await c.waitForFunction(() => typeof window.__emulatorFinishFa5xRun === "function");
  await c.waitForTimeout(800);
  const fin = await c.evaluate(async () => {
    const { FA5X_CURRENT_MEASUREMENT_FIELDS: m } = await import("/js/data/fa5xMeasurementCompatibility.js");
    return window.__emulatorFinishFa5xRun({ ...m, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 11800, startCueTimestamp: performance.now() - 13000, movementOnsetMs: 400 });
  });
  step("C4 synthetic finished run handed to the real completion handler", fin && fin.ok === true, JSON.stringify(fin));
  await c.waitForTimeout(3000);
  const cyclesC = await userCycles(pC);
  const freshC = (await adminQuery("functionalAssessmentSessions", "patientId", pC.id)).find((s) => s.result && s.result.assessmentRole === "initial_plan_baseline");
  step("C5 first week from the fresh baseline", cyclesC.length === 1 && !!freshC && cyclesC[0].baselineAssessmentId === freshC.id && cyclesC[0].initialPlanAcceptance.baselineSource === "fresh_baseline"
    && freshC.result.initialRecommendationId === recC.id && freshC.result.emulatorSynthetic === true, JSON.stringify(cyclesC.map((x) => [x.cycleStartDateKey, x.baselineAssessmentId])));
  await shot(c, "C4-fresh-baseline-result");
  await c.evaluate((id) => window.goF01RecommendationResult(id), recC.id);
  step("C6 recommendation page = confirmed plan", (await c.locator('[onclick^="startF01RecommendedTraining"]').count()) === 2 && !(await c.locator(`[onclick="startF01RecommendedTraining('F01-11')"]`).count()));
  await c.evaluate(() => window.goSchedule()); await c.waitForTimeout(500);
  step("C7 today plan = confirmed plan", !(await text(c)).includes("站姿髖屈曲") && (await text(c)).includes("坐姿抬膝"));
  await c.evaluate((id) => window.goF01RecommendationResult(id), recC.id);
  await c.locator(`[onclick="startF01RecommendedTraining('F01-09')"]`).click();
  await c.getByText("準備開始").waitFor({ timeout: 20000 });
  await c.waitForTimeout(1500);
  const frozenC = await frozenToday(pC);
  step("C7b training preparation froze the confirmed plan", !!frozenC && frozenC.required.join() === "F01-09,F01-10", JSON.stringify(frozenC));
  await shot(c, "C6-training-prep");
  await reload(c);
  await c.evaluate((id) => window.goF01RecommendationResult(id), recC.id);
  step("C8 after refresh (started)", (await c.locator('[onclick^="startF01RecommendedTraining"]').count()) === 2);
  const cHomeStarted = await homeEntries(c);
  const cMapStarted = await journeyNotice(c);
  await shot(c, "C5-journey-started");

  // ═══ D. no therapist relation ═══
  const d = await login(pD);
  await createPlan(d, faD, { limitL05: true });
  const hD = await homeCard(d);
  step("H6 home: 待復健師檢視 without a therapist -> says it cannot be completed now", !!hD && hD.includes("目前沒有連結的復健師") && hD.includes("查看待檢視安排") && !hD.includes("系統不會另外通知"), hD);
  await shot(d, "H6-home-unlinked");
  await d.locator(".f01-initial-plan-home").getByRole("button", { name: "查看待檢視安排" }).click();
  await d.getByText("目前沒有連結的復健師，這份安排暫時無法在 ReMotion 中完成檢視").waitFor({ timeout: 20000 });
  step("H7 its entry opens the existing explanation + invite-code entry", (await d.locator('[onclick="onInviteCodeQuery()"]').count()) === 1);
  await shot(d, "H7-unlinked-invite-entry");

  // ═══ E. a running week, then a newly accepted plan (not activated) ═══
  const e = await login(pE);
  await e.evaluate((id) => window.goFiveTimesSitToStandResult(id), faE);
  await e.getByRole("button", { name: "查看訓練建議 →" }).click();
  await e.locator(".f01-goal-card", { hasText: "加強髖部與骨盆穩定" }).click();
  await e.getByRole("button", { name: "10 分鐘" }).click();
  await e.getByRole("button", { name: "產生訓練建議 →" }).click();
  await e.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
  for (let i = 0; i < 100 && !(await userCycles(pE)).length; i++) await e.waitForTimeout(150);
  const [weekE] = await userCycles(pE);
  const oldRecE = weekE.recommendationId;
  await e.getByRole("button", { name: "重新設定訓練需求" }).click();
  await e.getByRole("button", { name: "20 分鐘" }).click();
  await e.locator(".f01-limit-row", { hasText: "目前無法安全地單腳站立" }).locator("input").check();
  await e.getByRole("button", { name: "產生訓練建議 →" }).click();
  await e.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
  await e.waitForTimeout(1000);
  const newRecE = (await userRecs(pE)).find((r) => r.id !== oldRecE);
  await t.evaluate((id) => window.goCaseDetail(id, "overview"), pE.id);
  await clickReload(t);
  await t.getByRole("button", { name: "檢視並確認安排" }).click();
  await t.locator(".d5-review-row-edit").nth(2).getByRole("button", { name: "移除" }).click();
  await t.locator('textarea[placeholder="調整理由（必填）"]').fill("先不做站姿髖屈曲");
  await t.getByRole("button", { name: "確認這份安排" }).click();
  await t.getByText(/已確認（/).waitFor({ timeout: 20000 });
  await e.evaluate((id) => window.goF01RecommendationResult(id), newRecE.id);
  await clickReload(e);
  await e.getByRole("button", { name: "接受這份安排" }).click();
  await e.getByText("這份安排尚未啟用；目前的追蹤與紀錄不會被取代").waitFor({ timeout: 20000 });
  const hE = await homeCard(e);
  const eHome = await homeEntries(e);
  const [weekE2] = await userCycles(pE);
  step("H8 home: accepted but the old week runs -> 尚未啟用 + 查看原本的週期; the week's own entry and plan unchanged",
    !!hE && hE.includes("已接受，尚未啟用") && hE.includes("查看原本的週期") && eHome.includes("開始今日訓練")
    && (await userCycles(pE)).length === 1 && weekE2.recommendationId === oldRecE, `${hE} | ${JSON.stringify(eHome)}`);
  await shot(e, "H8-home-not-activated");
  await e.locator(".f01-initial-plan-home").getByRole("button", { name: "查看原本的週期" }).click();
  await e.locator('[onclick^="startF01RecommendedTraining"]').first().waitFor({ timeout: 20000 });
  step("H9 查看原本的週期 opens the running week's plan", (await e.locator('[onclick^="startF01RecommendedTraining"]').count()) === 1);
  await e.evaluate(() => window.goSchedule()); await e.waitForTimeout(500);
  step("H10 today plan is still the running week's plan", (await text(e)).includes("坐姿抬膝") && !(await text(e)).includes("站姿髖屈曲"));

  console.log("\n── entries observed (home tab buttons / journey page first-plan card) ──");
  for (const [label, home, map] of [["B 待檢視", bHomePending, bMapPending], ["B 待接受", bHomeReviewed, bMapReviewed], ["B 已開始", bHomeStarted, bMapStarted], ["C 待新基準", cHomeBaseline, cMapBaseline], ["C 已開始", cHomeStarted, cMapStarted]]) {
    console.log(`${label}\n  home: ${JSON.stringify(home)}\n  journey: ${map}`);
  }
  step("no page errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
