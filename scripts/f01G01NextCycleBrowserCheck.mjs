// G01 next-cycle correction — BROWSER acceptance (docs/F01_G01_DECISION_BASIS_V1.md). Decision-logic check only.
// Real Chromium (Playwright) on the Vite dev server in emulator mode (?emulator=1) against the LOCAL Auth +
// Firestore emulators (project demo-remotion). One browser context per account. No camera recognition (the
// reassessment is a SYNTHETIC finished run handed to the real completion handler through the emulator-only
// window.__emulatorFinishFa5xRun), no Gemini, no patient00, nothing deployed.
// Seeded by admin: accounts, the therapist relation, the synthetic baseline 5xSTS (6 days ago) and the six
// completed training dates (what six training days would have written). Everything else is clicked in the app.
//
//   REPO=<repo> SHOTS=<repo>/reports/f01-g01-next-cycle-browser \
//   firebase emulators:exec --only firestore,auth --project demo-remotion "node f01G01NextCycleBrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDocs, collection, query, where } from "firebase/firestore";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/f01-g01-next-cycle-browser`;
mkdirSync(shots, { recursive: true });
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);
const { toLocalDateKey } = await import(pathToFileURL(`${repo}/js/data/trackingCycle.js`).href);

const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const password = "d5-local-only-123", tag = Date.now();
const results = [];
const port = Number(process.env.PORT || 5173); // 2026-10-28: settable, so a check never lands on another dev server
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };

async function account(role, label) {
  const email = `d5-${label}-${tag}@local.test`;
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await res.json(); assert.ok(data.localId, JSON.stringify(data));
  const user = { id: data.localId, email, account: email, role, name: `D5 ${label}`, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
const DAY = 86400000;
async function seedBaseline(patient, relation) {
  const at = new Date(Date.now() - 6 * DAY);
  const id = `fa-${patient.id.slice(0, 8)}`;
  await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", id), {
    id, patientId: patient.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed",
    startedAt: at.toISOString(), completedAt: at.toISOString(), therapistId: relation ? relation.therapistId : "", relationId: relation ? relation.id : "",
    result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 12400, measuredAt: at.toISOString(), seededSynthetic: true },
    conditionReports: [{ schemaVersion: "fa5x-condition-report-1", armsUsed: "no", physicalAssistance: "no", chairHeightCm: null, sameChairAsBaseline: "not_applicable", source: "self_report", reportedBy: patient.id, reportedAt: at.toISOString() }],
  }));
  return id;
}
const trainingDates = () => [0, 1, 2, 3, 4, 5].map((i) => toLocalDateKey(new Date(Date.now() - (6 - i) * DAY)));

const therapist = await account("therapist", "therapist");
const pL = await account("patient", "linked");
const pU = await account("patient", "unlinked");
const rel = { id: `rel-${tag}`, therapistId: therapist.id, patientId: pL.id, status: "accepted", createdAt: new Date().toISOString() };
await seed((db) => setDoc(doc(db, "therapistPatientRelations", rel.id), rel));
const faL = await seedBaseline(pL, rel);
const faU = await seedBaseline(pU, null);

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const OPTIONAL = ["trackingCycles", "d5TherapistReviews", "f01InitialReviews"];
  async function hydrated(page) {
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(async (names) => { const { storageService } = await import("/js/data/storageService.js"); return Object.fromEntries(names.map((n) => [n, storageService.getOptionalCloudLoadStatus(n)])); }, OPTIONAL);
      if (Object.values(st).every((v) => v === "loaded" || v === "failed")) {
        if (Object.values(st).includes("failed")) throw Error(`optional cloud load failed: ${JSON.stringify(st)}`);
        await page.locator(".top-profile-container, .therapist-workspace").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 20000 });
        return;
      }
      if (Date.now() - t0 > 30000) throw Error(`hydration did not finish: ${JSON.stringify(st)}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  async function login(user, width = 390) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
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
  const reload = async (page) => { await page.reload(); await page.waitForFunction(() => typeof window.switchTab === "function"); await hydrated(page); };
  const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
  // UX round 5/5: pages keep detail behind named disclosures — text() reads the whole page (disclosures opened),
  // visibleText() what is on screen without opening anything
  const visibleText = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const text = async (page) => { await page.evaluate(() => document.querySelectorAll("details").forEach((d) => { d.open = true; })); return visibleText(page); };
  const userRecs = (u) => adminQuery("recommendationResults", "patientId", u.id);
  const userCycles = (u) => adminQuery("trackingCycles", "patientId", u.id);

  /** G01 plan (UI) -> six training dates (seed) -> reassessment (real handler) -> condition report (UI) -> status check (UI). */
  async function toProposal(page, user, baselineId, reReport) {
    await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), baselineId);
    await page.getByRole("button", { name: "查看訓練建議 →" }).click();
    await page.locator(".f01-goal-card", { hasText: "從椅子起身更順" }).click();
    await page.getByRole("button", { name: "10 分鐘" }).click();
    await page.getByRole("button", { name: "產生訓練建議 →" }).click();
    await page.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const [cycle] = await userCycles(user);
    assert.ok(cycle, "first week created");
    await seed((db) => updateDoc(doc(db, "trackingCycles", cycle.id), { completedTrainingDates: trainingDates() }));
    await reload(page);
    await page.evaluate((id) => window.goTrackingReassessment(id), cycle.id);
    await page.getByRole("button", { name: "開始評估 →" }).click();
    await page.waitForFunction(() => typeof window.__emulatorFinishFa5xRun === "function");
    await page.waitForTimeout(800);
    const fin = await page.evaluate(async () => {
      const { FA5X_CURRENT_MEASUREMENT_FIELDS: m } = await import("/js/data/fa5xMeasurementCompatibility.js");
      return window.__emulatorFinishFa5xRun({ ...m, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 8200, startCueTimestamp: performance.now() - 9500, movementOnsetMs: 400 });
    });
    assert.ok(fin && fin.ok, JSON.stringify(fin));
    await page.locator(".fa5x-condition-card").waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const done = (await userCycles(user))[0];
    assert.ok(done.reassessmentId, "reassessment linked to the cycle");
    // 2026-10-28 (UX round 4/5 → checked in round 5): the questions sit behind the closed 「回答測試條件」 entry — opened first;
    // the same answers and the same save are checked
    if (await page.locator(".fa5x-cond-form:not([open]) .fa5x-cond-entry").count()) await page.locator(".fa5x-cond-entry").click();
    for (const [name, value] of Object.entries(reReport)) await page.locator(`input[name="${name}"][value="${value}"]`).check();
    await page.locator('input[name="fa5xCondSource"][value="self_report"]').check();
    await page.getByRole("button", { name: "儲存測試條件" }).click();
    await page.waitForTimeout(1500);
    await page.evaluate((id) => window.goD5StatusCheck(id), cycle.id);
    await page.getByRole("button", { name: "沒有", exact: true }).click();
    await page.getByRole("button", { name: "查看下一階段建議 →" }).click();
    await page.locator(".d5-status-card").waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    return { cycle: done };
  }

  // ═══ 1. linked patient: 8.2 s vs 12.4 s (−4.2 s), conditions consistent, 6/6 days ═══
  const p = await login(pL);
  const { cycle } = await toProposal(p, pL, faL, { fa5xCondArms: "no", fa5xCondAssist: "no", fa5xCondSameChair: "yes" });
  const shown = await visibleText(p);
  let t = await text(p);
  const [proposal] = (await userRecs(pL)).filter((r) => r.origin === "d5_next_cycle");
  step("1a proposal stored in the emulator by the patient: G01-N01, no automatic decision; withdrawn R005 kept only as trace",
    !!proposal && proposal.d5.decisionRuleId === "G01-N01" && proposal.d5.decision === "no_auto_decision" && proposal.d5.matrixDecision === "no_auto_decision"
    && proposal.d5.comparisonConditions.status === "reported_conditions_consistent" && proposal.d5.g01NextCycle.withdrawnMatrix.ruleId === "R005", JSON.stringify(proposal && proposal.d5.g01NextCycle));
  // 2026-10-28 (UX round 5/5): the reference data and the decision record are behind named disclosures (理由與參考資料 /
  // 詳細決策紀錄). What decides the next step stays visible without opening anything; the same facts are all still on the
  // page once the disclosures are opened.
  step("1b0 visible without opening: no automatic decision, 待復健師另行安排 and why (not a 維持 suggestion)",
    shown.includes("目前不提供自動安排") && shown.includes("待復健師另行安排") && shown.includes("不代表系統建議維持原訓練") && !shown.includes("維持（沒有套用進階）"), shown.slice(0, 500));
  // 2026-10-29: a G01 proposal is titled 「目前不提供自動安排」 (G01 program selection) — 「需要更多資料」 is the title of a
  // non-G01 no-auto proposal, already so before round 5; the other facts are unchanged. Missing phrases are reported.
  const need1b = ["目前不提供自動安排", "不自動判定", "等待復健師另行安排", "12.4 秒 → 8.2 秒", "前後回報的測試條件一致", "時間變化不能單獨決定下一週訓練", "不代表系統建議維持原訓練"];
  step("1b patient page: 目前不提供自動安排 / 不自動判定 / 待復健師另行安排; both times shown; conditions row; no 進階 / 維持 conclusion",
    need1b.every((p) => t.includes(p)) && !t.includes("規則判定 進階") && !t.includes("維持（沒有套用進階）"), `missing: ${need1b.filter((p) => !t.includes(p)).join("、") || "—"}`);
  step("1c no acceptance entry on the page", (await p.locator('[onclick^="confirmD5ProposalFromUi"]').count()) === 0);
  await shot(p, "1-patient-no-auto");
  // the app's own service module (same instance the page uses), called directly with the patient's id
  const bypass = await p.evaluate(async ([id, userId, today]) => {
    const { trackingCycleService } = await import("/js/data/trackingCycleService.js");
    const { F01_FORMAL_COMPLETION_RULES_VERSION } = await import("/js/data/f01DailyTargets.js");
    return trackingCycleService.confirmD5Proposal({ proposalId: id, userId, confirmationDateKey: today, completionRulesVersion: F01_FORMAL_COMPLETION_RULES_VERSION });
  }, [proposal.id, pL.id, toLocalDateKey(new Date())]);
  await p.waitForTimeout(800);
  step("1d calling the acceptance service directly is refused; nothing created", bypass.error === "not_confirmable" && (await userCycles(pL)).length === 1 && (await userRecs(pL)).find((r) => r.id === proposal.id).status === "draft", JSON.stringify(bypass));
  await p.evaluate(() => window.switchTab("home"));
  await p.waitForTimeout(500);
  t = await text(p);
  step("1e home tracking card: both times + 查看下一階段建議, no 進階 / 維持 verdict", t.includes("初次評估 12.4 秒 再次評估 8.2 秒") && t.includes("查看下一階段建議") && !/下一週.{0,6}(進階|維持)/.test(t));
  await shot(p, "1-home-tracking-card");
  await p.evaluate(() => window.goMap());
  await p.waitForTimeout(600);
  t = await text(p);
  // 2026-10-29: for G01 the shared status (js/data/f01AdventureProgress.js, unchanged this round) is 「目前不提供這個目標的
  // 下一週自動安排」; 「目前資料不足以自動安排下一週」 is the non-G01 no-auto sentence — the expectation predates the G01 change
  step("1f journey card: the shared arrangement status (目前不提供這個目標的下一週自動安排)", t.includes("目前不提供這個目標的下一週自動安排") && !t.includes("目前資料不足以自動安排下一週"), t.slice(0, 300));
  await shot(p, "1-journey-no-auto");

  // ═══ 2. therapist: the same reasons; existing arrangement form ═══
  const th = await login(therapist, 1100);
  await th.evaluate((id) => window.goCaseDetail(id, "overview"), pL.id);
  await th.getByText("下一階段建議待檢視").waitFor({ timeout: 20000 });
  t = await text(th);
  step("2a therapist sees 不自動判定, the withdrawn-time reason and the reference-only previous week", t.includes("規則判定：不自動判定") && t.includes("時間變化不能單獨決定下一週訓練") && t.includes("系統未自動安排下一週"));
  await shot(th, "2-therapist-card");
  await th.getByRole("button", { name: "檢視並確認下一週安排" }).click();
  await th.locator('textarea[placeholder="調整理由（必填）"]').fill("合成測試：沿用坐姿起立一週");
  await th.getByRole("button", { name: "確認這份安排" }).click();
  await th.getByText(/已確認（/).waitFor({ timeout: 20000 });
  const reviews = await adminQuery("d5TherapistReviews", "patientId", pL.id);
  step("2b therapist confirmation written to the emulator", reviews.length === 1 && reviews[0].proposalId === proposal.id);
  await shot(th, "2-therapist-confirmed");

  // ═══ 3. patient: confirmed -> accept (existing flow) -> fresh baseline required, no week yet ═══
  await reload(p);
  await p.evaluate((id) => window.goD5Proposal(id), proposal.id);
  await p.locator('[onclick^="confirmD5ProposalFromUi"]').waitFor({ timeout: 20000 });
  t = await text(p);
  step("3a after review: 復健師已確認，可以接受 + accept entry", t.includes("復健師已確認，可以接受") && t.includes("系統仍未自動判定"));
  await shot(p, "3-patient-reviewed");
  await p.locator('[onclick^="confirmD5ProposalFromUi"]').click();
  await p.getByText("已接受這份建議").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  const acc = (await userRecs(pL)).find((r) => r.id === proposal.id);
  step("3b accepted in the emulator; manual no-auto continuation needs a fresh baseline; no next week created yet",
    acc.status === "accepted" && acc.d5.confirmation.handoff.requiresFreshBaseline === true && acc.d5.confirmation.handoff.freshBaselineReason === "manual_no_auto_arrangement" && (await userCycles(pL)).length === 1,
    JSON.stringify(acc.d5.confirmation && acc.d5.confirmation.handoff));
  await shot(p, "3-patient-accepted");

  // ═══ 4. unlinked patient: conditions differ (hands used, other chair) ═══
  const u = await login(pU);
  await toProposal(u, pU, faU, { fa5xCondArms: "yes", fa5xCondAssist: "no", fa5xCondSameChair: "no" });
  t = await text(u);
  const [propU] = (await userRecs(pU)).filter((r) => r.origin === "d5_next_cycle");
  step("4a differ: stored status + reasons; change not read against the reference", propU.d5.comparisonConditions.status === "reported_conditions_differ" && propU.d5.changeClass === "not_interpreted_conditions"
    && t.includes("前後測試條件不同") && t.includes("回報起身時有用手撐") && t.includes("回報與初次評估不是同一張椅子") && t.includes("這次時間差不以參考值解讀"));
  step("4b unlinked: existing honest text + invite code, no acceptance, no claim of a professional taking over",
    t.includes("目前沒有連結的復健師") && (await u.locator("#inviteCodeInput").count()) >= 1 && (await u.locator('[onclick^="confirmD5ProposalFromUi"]').count()) === 0 && !t.includes("復健師已接手"));
  await shot(u, "4-unlinked-differ");

  step("no page errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
