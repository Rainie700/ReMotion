// 本週練習回報 on the G01 next-stage views — BROWSER acceptance, patient and therapist in SEPARATE contexts.
// Real Chromium (Playwright), Vite dev server in emulator mode (?emulator=1), LOCAL Auth + Firestore emulators
// (demo-remotion). No camera (synthetic reassessment through the emulator-only finish hook), no Gemini, no patient00.
// Days 1–6 daily reports are SEEDED into the emulator cloud (built with the app's own record builder): the app only
// lets a patient report for TODAY, and Days 1–6 of a cycle that already has its reassessment are past dates.
// Today's report (Day 7) is saved through the real UI and must NOT be listed (not a training day).
// A second patient (cycle on Day 2 today) saves a CYCLE report from 本週訓練 and a GENERAL report from home through
// the real UI. Not-loaded: Firestore requests are blocked in the browser and the app's own reload runs. Load failed:
// a TEST-ONLY rules variant (dailyTrainingFeedback list denied) is loaded into the LOCAL emulator, then restored.
//   REPO=<repo> SHOTS=<repo>/reports/cycle-daily-reports-browser \
//   firebase emulators:exec --only firestore,auth --project demo-remotion "node cycleDailyReportsBrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, getDocs, collection, query, where, Timestamp } from "firebase/firestore";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/cycle-daily-reports-browser`;
mkdirSync(shots, { recursive: true });
const imp = (f) => import(pathToFileURL(`${repo}/${f}`).href);
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await imp("js/data/fa5xMeasurementCompatibility.js");
const { toLocalDateKey, formatDateKeyMonthDay } = await imp("js/data/trackingCycle.js");
const { buildDailyFeedbackRecord } = await imp("js/data/dailyTrainingFeedback.js");

const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const adminQuery = async (name, field, value) => { let out = []; await seed(async (db) => { out = (await getDocs(query(collection(db, name), where(field, "==", value)))).docs.map((d) => ({ id: d.id, ...d.data() })); }); return out; };
const password = "cdr-local-only-123", tag = Date.now();
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${detail}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };
async function account(role, label) {
  const email = `cdr-${label}-${tag}@local.test`;
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await res.json(); assert.ok(data.localId);
  const user = { id: data.localId, email, account: email, role, name: `CDR ${label}`, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
const DAY = 86400000;
const therapist = await account("therapist", "therapist");
const P = await account("patient", "patient");
const rel = { id: `rel-${tag}`, therapistId: therapist.id, patientId: P.id, status: "accepted", createdAt: new Date().toISOString() };
await seed((db) => setDoc(doc(db, "therapistPatientRelations", rel.id), rel));
const baseAt = new Date(Date.now() - 6 * DAY);
const faId = `fa-${P.id.slice(0, 8)}`;
await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", faId), { id: faId, patientId: P.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed", startedAt: baseAt.toISOString(), completedAt: baseAt.toISOString(), therapistId: rel.therapistId, relationId: rel.id,
  result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 12400, measuredAt: baseAt.toISOString(), seededSynthetic: true },
  conditionReports: [{ schemaVersion: "fa5x-condition-report-1", armsUsed: "no", physicalAssistance: "no", chairHeightCm: null, sameChairAsBaseline: "not_applicable", source: "self_report", reportedBy: P.id, reportedAt: baseAt.toISOString() }] }));
const dayKey = (i) => toLocalDateKey(new Date(Date.now() - (6 - i) * DAY)); // Day 1 = i 0 ... Day 6 = i 5

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", "5173", "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 150; i++) { try { if ((await fetch("http://127.0.0.1:5173")).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const OPTIONAL = ["trackingCycles", "d5TherapistReviews", "dailyTrainingFeedback"];
  async function hydrated(page, allowFailed = false) {
    const t0 = Date.now();
    for (;;) {
      const st = await page.evaluate(async (names) => { const { storageService } = await import("/js/data/storageService.js"); return Object.fromEntries(names.map((n) => [n, storageService.getOptionalCloudLoadStatus(n)])); }, OPTIONAL);
      if (Object.values(st).every((v) => v === "loaded" || v === "failed")) {
        if (Object.values(st).includes("failed") && !allowFailed) throw Error(`optional cloud load failed: ${JSON.stringify(st)}`);
        await page.locator(".top-profile-container, .therapist-workspace").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 20000 });
        return;
      }
      if (Date.now() - t0 > 30000) throw Error(`hydration did not finish: ${JSON.stringify(st)}`);
      await new Promise((r) => setTimeout(r, 150));
    }
  }
  async function login(user, width = 390, allowFailed = false) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(`${user.name}: ${e.message}`));
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto("http://127.0.0.1:5173/?emulator=1");
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate((role) => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole(role); window.confirmAuthRole(); }, user.role);
    await page.locator("#loginAccount").fill(user.email);
    await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.waitForFunction(() => !document.querySelector("#loginAccount"), null, { timeout: 20000 });
    await hydrated(page, allowFailed);
    return page;
  }
  const reload = async (page, allowFailed = false) => { await page.reload(); await page.waitForFunction(() => typeof window.switchTab === "function"); await hydrated(page, allowFailed); };
  const cardText = async (page, sel = ".cycle-daily-reports") => (await page.locator(sel).first().innerText()).replace(/\s+/g, " ");
  const putRules = async (rules) => { const r = await fetch("http://127.0.0.1:8080/emulator/v1/projects/demo-remotion:securityRules", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content: rules }] } }) }); assert.ok(r.ok, `rules PUT ${r.status}`); };
  const repoRules = readFileSync(`${repo}/firestore.rules`, "utf8");
  const LIST_RULE = "      allow list: if request.auth != null\n        && (resource.data.patientId == request.auth.uid || linked(resource.data));\n      allow create: if request.auth != null && validDailyFeedback(";
  assert.ok(repoRules.includes(LIST_RULE), "dailyTrainingFeedback list rule located");
  const failingRules = repoRules.replace(LIST_RULE, "      allow list: if false; // LOCAL TEST VARIANT: simulates a refused cloud load\n      allow create: if request.auth != null && validDailyFeedback(");
  const shot = (page, name) => page.screenshot({ path: `${shots}/${name}.png`, fullPage: true });
  const text = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");
  const briefOf = async (page) => (await page.locator(".cycle-daily-reports .cycle-daily-brief").first().innerText()).split("\n").map((x) => x.trim()).filter(Boolean);

  // ── A. second patient, cycle on Day 2 today: cycle report from 本週訓練, general report from home (real UI) ──
  const P2 = await account("patient", "patient2");
  const base2 = new Date(Date.now() - 1 * DAY);
  const fa2 = `fa-${P2.id.slice(0, 8)}`;
  await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", fa2), { id: fa2, patientId: P2.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed", startedAt: base2.toISOString(), completedAt: base2.toISOString(), therapistId: "", relationId: "",
    result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 12400, measuredAt: base2.toISOString(), seededSynthetic: true },
    conditionReports: [{ schemaVersion: "fa5x-condition-report-1", armsUsed: "no", physicalAssistance: "no", chairHeightCm: null, sameChairAsBaseline: "not_applicable", source: "self_report", reportedBy: P2.id, reportedAt: base2.toISOString() }] }));
  const q = await login(P2);
  await q.evaluate((id) => window.goFiveTimesSitToStandResult(id), fa2);
  await q.getByRole("button", { name: "查看訓練建議 →" }).click();
  await q.locator(".f01-goal-card", { hasText: "從椅子起身更順" }).click();
  await q.getByRole("button", { name: "10 分鐘" }).click();
  await q.getByRole("button", { name: "產生訓練建議 →" }).click();
  await q.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
  await q.waitForTimeout(1500);
  const [cycle2] = await adminQuery("trackingCycles", "patientId", P2.id);
  assert.ok(cycle2, "second patient's cycle");
  const today = toLocalDateKey(new Date());
  const doc2 = async () => (await adminQuery("dailyTrainingFeedback", "patientId", P2.id)).find((r) => r.dateKey === today);
  await q.evaluate(() => window.switchTab("home"));
  await q.locator(".home-secondary-tile", { hasText: "本週訓練" }).click();
  const cyc = q.locator(".daily-feedback-cycle");
  await cyc.waitFor({ timeout: 20000 });
  const subjText = `回報對象：F01 7 日追蹤（${formatDateKeyMonthDay(cycle2.cycleStartDateKey)} 開始）第 2 天的訓練`;
  step("A1 本週訓練 page: 本週期今日回報 shows what the report is about before saving", (await cyc.innerText()).includes(subjText), (await cyc.innerText()).slice(0, 160));
  await cyc.getByRole("button", { name: "回報本週期今日感受" }).click();
  await q.locator("#dailyFeedbackEffort").selectOption("very_hard");
  await q.locator("#dailyFeedbackDiscomfort").selectOption("yes");
  await q.locator("#dailyFeedbackNote").fill("週期入口回報");
  await q.getByRole("button", { name: "儲存本週期回報" }).click();
  await q.getByText("已儲存本週期今日回報").waitFor({ timeout: 15000 });
  let d2 = await doc2();
  step("A2 the cycle report is saved with its subject (this cycle and plan)", !!d2 && d2.reports.length === 1 && !!d2.reports[0].subject && d2.reports[0].subject.cycleId === cycle2.id && d2.reports[0].subject.recommendationId === cycle2.recommendationId, JSON.stringify(d2 && d2.reports[0].subject));
  await q.evaluate(() => window.switchTab("home"));
  const home = q.locator(".daily-feedback-card").first();
  await home.waitFor();
  let ht = (await home.innerText()).replace(/\s+/g, " ");
  step("A3 home card is a general report: no cycle answer stands in for it, the other context is mentioned", ht.includes("回報對象：一般回報（不指定訓練週期）") && ht.includes("尚未回報（不代表沒有不舒服）") && ht.includes("今天另有 1 次從訓練週期入口填寫的回報") && !ht.includes("很吃力"), ht.slice(0, 220));
  await home.getByRole("button", { name: "回報今日感受" }).click();
  await q.locator("#dailyFeedbackEffort").selectOption("easy");
  await q.locator("#dailyFeedbackDiscomfort").selectOption("no");
  await q.getByRole("button", { name: "儲存今日回報" }).click();
  await q.getByText("已儲存今日回報").waitFor({ timeout: 15000 });
  d2 = await doc2();
  step("A4 the home report has NO subject although a cycle is active", d2.reports.length === 2 && !("subject" in d2.reports[1]), JSON.stringify(d2.reports.map((r) => r.subject || null)));
  await q.locator(".home-secondary-tile", { hasText: "本週訓練" }).click();
  await cyc.waitFor({ timeout: 20000 });
  step("A5 the cycle card keeps ITS answer (the later general report did not replace it)", (await cyc.innerText()).includes("很吃力｜有不舒服"), (await cyc.innerText()).slice(0, 200));
  await cyc.getByRole("button", { name: "修改本週期今日回報" }).click();
  await q.locator("#dailyFeedbackEffort").selectOption("somewhat_hard");
  await q.getByRole("button", { name: "儲存本週期回報" }).click();
  await q.getByText("已儲存本週期今日回報").waitFor({ timeout: 15000 });
  d2 = await doc2();
  await cyc.locator(".daily-feedback-revisions summary").click();
  const ct = (await cyc.innerText()).replace(/\s+/g, " ");
  step("A6 cycle revision: latest shown by default, 2 revisions with times one tap away; all 3 reports kept in order", d2.reports.length === 3 && d2.reports.map((r) => (r.subject ? "cycle" : "general")).join() === "cycle,general,cycle"
    && ct.includes("有點吃力｜有不舒服") && ct.includes("查看今天的歷次回報（2 次）") && ct.includes("（目前採用）") && ct.includes(d2.reports[0].reportedAt), JSON.stringify(d2.reports.map((r) => [r.effort, !!r.subject])));
  await shot(q, "3-cycle-entry-report");
  await q.evaluate(() => window.switchTab("home"));
  ht = (await q.locator(".daily-feedback-card").first().innerText()).replace(/\s+/g, " ");
  step("A7 home card still shows the general answer (輕鬆｜沒有不舒服), with the 2 cycle reports kept apart", ht.includes("輕鬆｜沒有不舒服") && ht.includes("今天另有 2 次從訓練週期入口填寫的回報"), ht.slice(0, 220));
  await shot(q, "4-home-general-report");
  await q.context().close();

  // ── patient: G01 plan in the UI; seeded Day 1–6 reports + six training dates; reassessment; status check ──
  const p = await login(P);
  await p.evaluate((id) => window.goFiveTimesSitToStandResult(id), faId);
  await p.getByRole("button", { name: "查看訓練建議 →" }).click();
  await p.locator(".f01-goal-card", { hasText: "從椅子起身更順" }).click();
  await p.getByRole("button", { name: "10 分鐘" }).click();
  await p.getByRole("button", { name: "產生訓練建議 →" }).click();
  await p.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1500);
  const [cycle] = await adminQuery("trackingCycles", "patientId", P.id);
  assert.ok(cycle);
  const SUBJ = { kind: "tracking_cycle", cycleId: cycle.id, recommendationId: cycle.recommendationId };
  const mk = (i, reports, stamp = true, cycleId = cycle.id) => {
    const dateKey = dayKey(i);
    let prev = null;
    reports.forEach((r, n) => {
      const built = buildDailyFeedbackRecord({ patientId: P.id, dateKey, effort: r.effort, discomfort: r.discomfort, note: r.note || "", expectedRevision: n, incompleteReason: r.reason || "", subject: r.subject || null }, prev,
        { reportedAt: new Date(Date.now() - (6 - i) * DAY + n * 60000).toISOString(), therapistId: stamp ? therapist.id : "", relationId: stamp ? rel.id : "", incompleteProgress: r.reason ? { dateKey, cycleId, recommendationId: cycle.recommendationId, requiredCount: 1, completedCount: 0, items: [] } : null });
      assert.ok(!built.error, built.error);
      prev = built.record;
    });
    return { ...prev, createdAt: Timestamp.fromDate(new Date(Date.now() - (6 - i) * DAY)), updatedAt: Timestamp.now() };
  };
  const seeded = [
    mk(0, [{ effort: "very_hard", discomfort: "no", subject: SUBJ }]),                                    // Day 1 cycle report
    mk(1, [{ effort: "easy", discomfort: "yes", subject: SUBJ }, { effort: "easy", discomfort: "no", note: "首頁一般回報" },    // Day 2 cycle ×3, general between
      { effort: "somewhat_hard", discomfort: "yes", note: "膝蓋有點痠", subject: SUBJ }, { effort: "somewhat_hard", discomfort: "yes", reason: "discomfort", note: "膝蓋有點痠", subject: SUBJ }]),
    mk(2, [{ effort: "easy", discomfort: "yes", note: "早上散步後腳酸", reason: "no_time" }]),            // Day 3 HOME: general feelings + incompletion for this cycle
    mk(3, [{ effort: "not_practiced", discomfort: "no", reason: "no_time" }], true, "trackingCycle_some_other_cycle"), // Day 4 another cycle
    mk(4, [{ effort: "easy", discomfort: "no" }], false), // Day 5 general only, no cycle link; saved before linking (therapist cannot read it)
    mk(5, [{ effort: "easy", discomfort: "unknown", subject: SUBJ }]),                                    // Day 6 cycle report, 不確定
  ];
  await seed(async (db) => { for (const r of seeded) await setDoc(doc(db, "dailyTrainingFeedback", r.id), r); });
  await seed((db) => updateDoc(doc(db, "trackingCycles", cycle.id), { completedTrainingDates: [dayKey(0), dayKey(1), dayKey(2), dayKey(3), dayKey(4), dayKey(5)] }));
  await reload(p);
  // today's report (Day 7) through the real UI — not a training day of this cycle
  await p.evaluate(() => window.switchTab("home"));
  await p.locator(".daily-feedback-card").first().getByRole("button").first().click();
  await p.locator("#dailyFeedbackEffort").selectOption("easy");
  await p.locator("#dailyFeedbackDiscomfort").selectOption("no");
  await p.getByRole("button", { name: "儲存今日回報" }).click();
  await p.waitForTimeout(1500);
  const todayDoc = (await adminQuery("dailyTrainingFeedback", "patientId", P.id)).find((r) => r.dateKey === toLocalDateKey(new Date()));
  step("0 today's report saved through the UI into the emulator (stamped with the relation)", !!todayDoc && todayDoc.therapistId === therapist.id, JSON.stringify(todayDoc && todayDoc.reports.map((r) => r.effort)));
  await p.evaluate((id) => window.goTrackingReassessment(id), cycle.id);
  await p.getByRole("button", { name: "開始評估 →" }).click();
  await p.waitForFunction(() => typeof window.__emulatorFinishFa5xRun === "function");
  await p.waitForTimeout(800);
  await p.evaluate(async () => { const { FA5X_CURRENT_MEASUREMENT_FIELDS: m } = await import("/js/data/fa5xMeasurementCompatibility.js"); return window.__emulatorFinishFa5xRun({ ...m, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 9800, startCueTimestamp: performance.now() - 11000, movementOnsetMs: 400 }); });
  await p.locator(".fa5x-condition-card").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1200);
  for (const [n, v] of [["fa5xCondArms", "no"], ["fa5xCondAssist", "no"], ["fa5xCondSameChair", "yes"], ["fa5xCondSource", "self_report"]]) await p.locator(`input[name="${n}"][value="${v}"]`).check();
  await p.getByRole("button", { name: "儲存測試條件" }).click();
  await p.waitForTimeout(1200);
  await p.evaluate((id) => window.goD5StatusCheck(id), cycle.id);
  await p.getByRole("button", { name: "沒有", exact: true }).click();
  await p.getByRole("button", { name: "查看下一階段建議 →" }).click();
  await p.locator(".cycle-daily-reports").waitFor({ timeout: 20000 });
  await p.waitForTimeout(1200);
  const cloudBefore = JSON.stringify({ fb: (await adminQuery("dailyTrainingFeedback", "patientId", P.id)).map((r) => [r.id, r.revision]), prop: (await adminQuery("recommendationResults", "patientId", P.id)).filter((r) => r.origin === "d5_next_cycle").map((r) => [r.id, r.status, r.d5.decisionRuleId]) });

  let t = await text(p);
  const pBrief = await briefOf(p);
  const d = (i) => formatDateKeyMonthDay(dayKey(i));
  step("1a patient: only reports pointing at this cycle counted; Day 4 (other cycle), Day 5 (same-date general) and Day 7 (today) not counted",
    pBrief[0] === `本週期回報 3 / 6 天：${d(0)}、${d(1)}、${d(5)}` && pBrief.some((l) => l === `本週期未回報：${d(4)}`) && pBrief.some((l) => l === `屬於其他週期（未列入）：${d(3)}`)
    && pBrief.some((l) => l === `只有未完成原因（首頁填寫；吃力與不適未針對本週期回報）：${d(2)}`)
    && pBrief.some((l) => l === `另有同日期的一般回報（未計入）：${d(1)}、${d(2)}、${d(3)}、${d(4)}`)
    && !t.includes(formatDateKeyMonthDay(toLocalDateKey(new Date())) + "、"), JSON.stringify(pBrief));
  const gen = await cardText(p, ".cycle-daily-general");
  step("1c patient: same-date general reports listed apart, labelled 未確認屬於本週期, with time and record id",
    gen.includes("同日期的一般回報（未確認屬於本週期）") && gen.includes("不計入上面的回報天數與統計") && gen.includes(`${d(4)}｜輕鬆｜沒有不舒服`) && gen.includes(`${d(1)}｜輕鬆｜沒有不舒服｜補充說明：首頁一般回報`) && gen.includes(`${P.id}_${dayKey(4)}`), gen.slice(0, 400));
  step("2b patient: Day 3 home feelings (有不舒服) + incompletion for this cycle shown apart — the reason under the cycle (首頁), the discomfort only as a general answer",
    pBrief.some((l) => l === `未完成原因｜感到不舒服：${d(1)}；沒時間：${d(2)}（首頁）`) && !pBrief.some((l) => l.startsWith("不適｜") && l.includes(d(2))) && !pBrief.some((l) => l.startsWith("吃力程度｜") && l.includes(d(2)))
    && gen.includes(`${d(2)}｜輕鬆｜有不舒服｜補充說明：早上散步後腳酸`) && gen.includes("這份回報的未完成原因已列入上方本週期資訊；吃力、不適與備註未列入"), JSON.stringify(pBrief));
  step("2/3 patient: 「沒有不舒服」 vs 「未回報」 vs 「不確定」 separate (cycle reports only); daily discomfort and the last status check both kept",
    pBrief.some((l) => l === `不適｜沒有不舒服：${d(0)}；有不舒服：${d(1)}；不確定：${d(5)}`)
    && t.includes("最後一次狀況確認") && t.includes("回答：沒有新的或加重的不適") && t.includes("系統不判定兩者是否一致、是否已緩解"));
  step("4/5 patient: 很吃力 + 完成 as facts (no tolerance wording); the 3-revision day counted once (last report)",
    pBrief.some((l) => l.includes(`很吃力：${d(0)}`)) && pBrief.some((l) => l.includes(`完成：${d(0)}`)) && !/耐受|良好|適應|改善|進步/.test(t)
    && pBrief.some((l) => l === `曾修改回報（以當天最後一次為準）：${d(1)}`) && pBrief.some((l) => l.includes(`有點吃力：${d(1)}`) && !l.includes(`輕鬆：${d(1)}`)) && pBrief.some((l) => l.includes(`未完成原因｜感到不舒服：${d(1)}`)));
  step("note shown: 供檢視參考，本版未用來自動決定進退階或訓練量", t.includes("以下回報供檢視參考，本版未用來自動決定進退階或訓練量。"));
  await p.locator(".cycle-daily-days > summary").click();
  await p.locator(".cycle-daily-day-list > li").nth(1).locator(".cycle-daily-history summary").click();
  const day2 = (await p.locator(".cycle-daily-day-list > li").nth(1).innerText()).replace(/\s+/g, " ");
  step("5b patient: Day 2 shows the cycle's last answer; its 3 revisions (with times) expandable; the general one in between is not among them",
    day2.includes("吃力程度：有點吃力") && day2.includes("共 3 次回報，以最後一次為準") && day2.includes("查看歷次回報（3 次）") && day2.includes("從本週期的回報入口填寫") && !day2.includes("首頁一般回報"), day2.slice(0, 500));
  const day3 = (await p.locator(".cycle-daily-day-list > li").nth(2).innerText()).replace(/\s+/g, " ");
  step("2c patient: Day 3 detail — not a reported day; the home incompletion (with target count, time, record id) is the only cycle information",
    day3.includes("本週期的吃力與不適未回報（不代表沒有不舒服）；只有首頁填寫的未完成原因") && day3.includes("未完成原因（首頁填寫，針對本週期當天目標）：沒時間（回報時完成 0 / 1 個動作）") && day3.includes(`${P.id}_${dayKey(2)}`) && !day3.includes("不適：有不舒服"), day3.slice(0, 400));
  await shot(p, "1-patient-next-stage-reports");

  // ── therapist: separate context, reads the SAME cloud data within its permission ──
  const th = await login(therapist, 1100);
  await th.evaluate((id) => window.goCaseDetail(id, "overview"), P.id);
  await th.locator(".d5-review-card .cycle-daily-reports").waitFor({ timeout: 20000 });
  const tBrief = (await th.locator(".d5-review-card .cycle-daily-reports .cycle-daily-brief").innerText()).split("\n").map((x) => x.trim()).filter(Boolean);
  const tt = await text(th);
  step("1b therapist: same counted days/answers; Day 5 (nothing readable) shown as not readable, never as 未回報; scope wording differs from the patient's",
    tBrief[0] === `本週期回報 3 / 6 天：${d(0)}、${d(1)}、${d(5)}` && tBrief.some((l) => l === `無法確認：${d(4)}`) && !tBrief.some((l) => l.includes("未回報"))
    && tBrief.some((l) => l === `只有未完成原因（首頁填寫；吃力與不適未針對本週期回報）：${d(2)}`) && tBrief.some((l) => l === `另有同日期的一般回報（未計入）：${d(1)}、${d(2)}、${d(3)}`)
    && tt.includes("只能讀取患者在照護關係建立後、帶有此關係的每日回報；患者本人看到的可能比這裡多") && t.includes("看到的天數可能比你少")
    && [pBrief, tBrief].every((b) => b.some((l) => l.includes(`很吃力：${d(0)}`)) && b.some((l) => l === `曾修改回報（以當天最後一次為準）：${d(1)}`)), JSON.stringify(tBrief));
  step("3b therapist: the last status check shown apart, same wording", tt.includes("回答：沒有新的或加重的不適") && tt.includes("系統不判定兩者是否一致、是否已緩解"));
  await th.locator(".d5-review-card .cycle-daily-days > summary").click();
  await shot(th, "2-therapist-card-reports");

  // ── 8. viewing changed nothing ──
  await p.evaluate(() => window.switchTab("home")); await p.waitForTimeout(300);
  const cloudAfter = JSON.stringify({ fb: (await adminQuery("dailyTrainingFeedback", "patientId", P.id)).map((r) => [r.id, r.revision]), prop: (await adminQuery("recommendationResults", "patientId", P.id)).filter((r) => r.origin === "d5_next_cycle").map((r) => [r.id, r.status, r.d5.decisionRuleId]) });
  step("8 viewing both pages wrote nothing: daily records and the proposal (status, rule) unchanged", cloudAfter === cloudBefore, cloudAfter);
  // ── C. not loaded / load failed, in the browser ──
  const [proposal] = (await adminQuery("recommendationResults", "patientId", P.id)).filter((r) => r.origin === "d5_next_cycle");
  await p.evaluate((id) => window.goD5Proposal(id), proposal.id);
  await p.locator(".cycle-daily-reports").waitFor();
  await p.context().route("http://127.0.0.1:8080/**", (route) => route.abort());   // Firestore unreachable from this browser
  await p.evaluate(() => { window.reloadF01InitialPlanData("patient"); });         // the app's own cloud reload (same load as at login)
  await p.waitForFunction(() => document.querySelector(".cycle-daily-reports")?.dataset.loadState === "not_loaded", null, { timeout: 25000 });
  const nl = await cardText(p);
  step("C1 not loaded (cloud reload still waiting): every day 無法確認; no 未回報 / 沒有不舒服 / 沒有不適; no answer from the local copy",
    nl.includes("每日回報尚未從雲端載入完成") && nl.includes("本週期回報：無法確認") && !/未回報|沒有不舒服|沒有不適|很吃力|同日期的一般回報/.test(nl), nl.slice(0, 400));
  await shot(p, "5-patient-not-loaded");
  await p.context().unroute("http://127.0.0.1:8080/**");
  await putRules(failingRules);
  try {
    await reload(p, true);
    const st = await p.evaluate(async () => (await import("/js/data/storageService.js")).storageService.getOptionalCloudLoadStatus("dailyTrainingFeedback"));
    await p.evaluate((id) => window.goD5Proposal(id), proposal.id);
    await p.locator(".cycle-daily-reports").waitFor();
    const lf = await cardText(p);
    step("C2 load failed (cloud refused the read): every day 無法確認（載入失敗）; no 未回報 / 沒有不舒服 / 沒有不適",
      st === "failed" && lf.includes("每日回報的雲端資料載入失敗") && !/未回報|沒有不舒服|沒有不適|很吃力/.test(lf), `${st} ${lf.slice(0, 300)}`);
    await shot(p, "6-patient-load-failed");
    await th.context().close();
    const th2 = await login(therapist, 1100, true);
    await th2.evaluate((id) => window.goCaseDetail(id, "overview"), P.id);
    await th2.locator(".d5-review-card .cycle-daily-reports").waitFor({ timeout: 20000 });
    const tf = await cardText(th2, ".d5-review-card .cycle-daily-reports");
    step("C3 therapist, load failed: 無法確認; never 未回報 / 沒有不舒服", tf.includes("每日回報的雲端資料載入失敗") && !/未回報|沒有不舒服|沒有不適/.test(tf), tf.slice(0, 300));
    await shot(th2, "7-therapist-load-failed");
  } finally {
    await putRules(repoRules);   // the repo rules, unchanged, back in the local emulator
  }
  step("no page errors", errors.length === 0, JSON.stringify(errors));
} finally {
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
console.log(`\n${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
