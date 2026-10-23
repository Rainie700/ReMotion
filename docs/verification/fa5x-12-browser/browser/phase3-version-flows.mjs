// fa5x-12-browser — 5xSTS 1.2 browser compatibility + version notice + continuation entries.
// Firebase emulators only (project demo-remotion), synthetic local accounts / records only, no camera.
//   REPO=<repo> OUT=<results dir> RULES_PATH=<repo>/firestore.rules APP_URL=http://localhost:5173/?emulator=1 node phase3-version-flows.mjs
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { REPO, OUT, RULES_PATH } = process.env;
const APP_URL = process.env.APP_URL || "http://localhost:5173/?emulator=1";
const LOCAL = new Set(["localhost:5173", "127.0.0.1:5173", "127.0.0.1:8080", "127.0.0.1:9099"]);
const NOTICE = "量測方式已更新，這兩次結果無法直接比較；舊紀錄仍會保留。";
const results = [];
const check = (name, ok, detail = "") => results.push([ok ? "PASS" : "FAIL", name, String(detail).replace(/\s+/g, " ").slice(0, 240)]);
const note = (name, detail) => results.push(["OBSERVED", name, String(detail).replace(/\s+/g, " ").slice(0, 300)]);
process.on("uncaughtException", (e) => { results.push(["FAIL", "harness crashed", e.message]); for (const r of results) console.log(r.join(" | ")); process.exit(1); });
const canon = (v) => (v && typeof v === "object" ? (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`) : JSON.stringify(v));

for (const u of ["http://127.0.0.1:8080/", "http://127.0.0.1:9099/"]) {
  try { await fetch(u); } catch (e) { console.log(`ABORT: emulator not reachable at ${u}`); process.exit(2); }
}
console.log("preflight ok: Firestore 127.0.0.1:8080, Auth 127.0.0.1:9099, project demo-remotion");
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 } });
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };
const PW = "local-test-only-1";
const tag = Date.now().toString(36);
async function signUp(email) {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }) });
  const j = await r.json(); if (!j.localId) throw new Error(JSON.stringify(j)); return j.localId;
}

// ── synthetic records via the REAL services (node, fake localStorage, no cloud user) ──
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const { functionalAssessmentService } = await imp("js/data/functionalAssessmentService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await imp("js/data/trackingCycleService.js");
const { recommendationService } = await imp("js/data/recommendationService.js");
const { exerciseService } = await imp("js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await imp("js/data/f01GoalRecommendation.js");
const { createCollection } = await imp("js/data/storageService.js");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: CUR } = await imp("js/data/fa5xMeasurementCompatibility.js"); // current = read from the app
const V11 = { algorithmVersion: "fa5x-assessment-1.1", geometryCoordinateSpace: "isotropic_image_height_units" }; // explicit 1.1 HISTORY
const sessionsCol = createCollection("functionalAssessmentSessions");
const catalog = exerciseService.listNormalized();
const daysAgo = (n, h = 9) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d; };
const fa5x = (P, ms, at, m, extra = {}) => {
  const s = functionalAssessmentService.create({ patientId: P, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand" }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...m, status: "completed", repCount: 5, completedReps: 5, targetReps: 5, totalDurationMs: ms, rejectedAttempts: [], measuredAt: at.toISOString(), ...extra } });
  return s.id;
};
/** baseline (current) -> cycle -> reassessment linked on its planned day; baseline can then be re-labelled as stored history. */
function completedCycle(P, { baselineAgo = 10, baseMs = 9600, reMs = 9100, storeBaselineAs = null } = {}) {
  const b = fa5x(P, baseMs, daysAgo(baselineAgo), CUR);
  const rec = recommendationService.createF01GoalRecommendation({ patientId: P, result: generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog }), createdBy: P }).recommendation;
  const cyc = trackingCycleService.createOrGetTrackingCycle({ userId: P, baselineSession: functionalAssessmentService.getById(b), recommendation: rec }).cycle;
  if (storeBaselineAs) { const s = sessionsCol.getById(b); const { algorithmVersion, geometryCoordinateSpace, ...rest } = s.result; sessionsCol.update(b, { result: { ...rest, ...storeBaselineAs } }); }
  const [py, pm, pd] = cyc.plannedReassessmentDateKey.split("-").map(Number);
  const re = fa5x(P, reMs, new Date(py, pm - 1, pd, 10, 0), CUR, { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cyc.id, baselineAssessmentId: b });
  const l = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cyc.id, userId: P, reassessment: functionalAssessmentService.getById(re), todayDateKey: cyc.plannedReassessmentDateKey });
  if (l.error) throw new Error(`link ${l.error}`);
  return { b, re, cycleId: cyc.id, recId: rec.id };
}
function activeCycle(P, { startAgo = 2 } = {}) {
  const b = fa5x(P, 9400, daysAgo(startAgo), CUR);
  const rec = recommendationService.createF01GoalRecommendation({ patientId: P, result: generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog }), createdBy: P }).recommendation;
  const cyc = trackingCycleService.createOrGetTrackingCycle({ userId: P, baselineSession: functionalAssessmentService.getById(b), recommendation: rec }).cycle;
  return { b, cycleId: cyc.id, recId: rec.id };
}
const patients = {};
for (const key of ["A", "B", "C", "D"]) {
  const email = `v12-${key.toLowerCase()}-${tag}@local.test`;
  patients[key] = { email, uid: await signUp(email) };
}
const A = completedCycle(patients.A.uid);                                         // 1.2 vs 1.2
const B = completedCycle(patients.B.uid, { storeBaselineAs: V11 });               // 1.1 (history) vs 1.2
B.newRun = fa5x(patients.B.uid, 8900, daysAgo(0, 8), CUR);                         // stands in for a NEW completed test after the cycle (no camera)
const C = { old: fa5x(patients.C.uid, 10200, daysAgo(3), V11) };                   // only a 1.1 record
const D = activeCycle(patients.D.uid);                                            // cycle still in progress
D.newRun = fa5x(patients.D.uid, 9000, daysAgo(0, 8), CUR);
await admin(async (db) => {
  for (const [key, p] of Object.entries(patients)) {
    await setDoc(doc(db, "users", p.uid), { name: `本機測試病人 ${key}`, role: "patient", account: p.email, createdAt: new Date().toISOString() });
    await setDoc(doc(db, "publicUsers", p.uid), { name: `本機測試病人 ${key}`, role: "patient" });
  }
  for (const s of sessionsCol.list()) await setDoc(doc(db, "functionalAssessmentSessions", s.id), JSON.parse(JSON.stringify(s)));
  for (const c of createCollection("trackingCycles").list()) await setDoc(doc(db, "trackingCycles", c.id), JSON.parse(JSON.stringify({ ...c, patientId: c.userId })));
  for (const r of recommendationService.list ? recommendationService.list() : createCollection("recommendationResults").list()) await setDoc(doc(db, "recommendationResults", r.id), JSON.parse(JSON.stringify(r)));
});
const storedHash = Object.fromEntries(sessionsCol.list().map((s) => [s.id, canon(s.result)]));
writeFileSync(join(OUT, "phase3-seed-manifest.json"), JSON.stringify({ note: "synthetic local emulator data only (demo-remotion); current version read from the app", current: CUR, history11: V11, patients, A, B, C, D }, null, 2));
const readSession = (id) => admin(async (db) => (await getDoc(doc(db, "functionalAssessmentSessions", id))).data());
const cyclesOf = (uid) => admin(async (db) => (await getDocs(query(collection(db, "trackingCycles"), where("userId", "==", uid)))).docs.map((d) => d.data()));
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, 300)); } };

// ── browser ──
const browser = await chromium.launch({ channel: "msedge", headless: true });
const requests = [], dialogs = [];
async function session(key) {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.on("request", (q) => requests.push(q.url()));
  page.on("dialog", async (d) => { dialogs.push(`[${key}] ${d.message()}`); await d.dismiss(); });
  page.on("pageerror", (e) => dialogs.push(`[${key}] pageerror: ${e.message}`));
  await page.goto(APP_URL, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.setAuthMode === "function");
  await page.evaluate(() => { window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
  await page.waitForSelector("#loginAccount");
  await page.fill("#loginAccount", patients[key].email);
  await page.fill("#loginPassword", PW);
  await page.evaluate(() => window.login());
  const ok = await page.waitForFunction(() => !!document.querySelector(".bottom-nav") && !document.getElementById("loginAccount") && !!localStorage.getItem("remotion_emulator_collection_functionalAssessmentSessions"), null, { timeout: 30000 }).then(() => true, () => false);
  check(`${key}0 synthetic patient ${key} signed in on the emulator`, ok);
  return page;
}
const text = (page) => page.evaluate(() => document.getElementById("app").innerText);
const shot = (page, name) => page.screenshot({ path: join(OUT, `shot-${name}.png`), fullPage: true });
async function d5Check(page, cycleId) {
  await page.evaluate((id) => window.goD5StatusCheck(id), cycleId);
  await page.waitForFunction(() => typeof window.setD5Discomfort === "function");
  await page.evaluate(() => { window.setD5Discomfort(false); window.submitD5StatusCheck(); });
  await page.waitForSelector(".d5-status-card", { timeout: 15000 }).catch(() => {});
}

// ── 1. 1.2 vs 1.2: comparable ──
{
  const page = await session("A");
  await page.evaluate((id) => window.goTrackingComparison(id), A.cycleId);
  await page.waitForTimeout(500);
  const t = await text(page);
  check("1a 1.2 baseline vs 1.2 reassessment: comparison shown with a difference", !t.includes("目前無法建立完整前後比較") && t.includes("9.6") && t.includes("9.1"), t.slice(0, 160));
  check("1b no version notice on a compatible pair", !t.includes(NOTICE));
  await shot(page, "01-A-comparison-12-12");
  await d5Check(page, A.cycleId);
  const d = await text(page);
  note("1c D5 for 1.2 vs 1.2 (decided by the unchanged matrix)", d.slice(0, 160));
  check("1c D5 page has no version notice for a compatible pair", !d.includes(NOTICE));
  await shot(page, "02-A-d5");
}

// ── 2–5. 1.1 (history) vs 1.2; 1.1 record viewable; trend break; ended-cycle continuation ──
{
  const page = await session("B");
  await page.evaluate((id) => window.goTrackingComparison(id), B.cycleId);
  await page.waitForSelector(".cmp-unavailable", { timeout: 10000 }).catch(() => {});
  const t = await text(page);
  check("2a 1.1 vs 1.2: no difference computed (comparison unavailable)", t.includes("目前無法建立完整前後比較") && !t.includes("完成時間差異"), t.slice(0, 200));
  check("2b version notice shown with the exact sentence", t.includes(NOTICE));
  check("2c both stored times stay viewable side by side", t.includes("9.6 秒") && t.includes("9.1 秒"));
  check("2d no blame wording", !/退步|未訓練|不合格|變差/.test(t));
  await shot(page, "03-B-comparison-11-12");
  await d5Check(page, B.cycleId);
  const d = await text(page);
  check("2e D5 stays 不自動判定 for 1.1 vs 1.2", d.includes("不自動判定") || d.includes("目前資料不足以建立下一階段自動調整"), d.slice(0, 200));
  check("2f D5 page shows the version notice", d.includes(NOTICE));
  await shot(page, "04-B-d5-no-auto");
  // 3. the 1.1 record is still viewable and untouched
  await page.evaluate((id) => window.goFiveTimesSitToStandResult(id, "home"), B.b);
  await page.waitForSelector(".fa5x-hero-value", { timeout: 10000 }).catch(() => {});
  check("3a 1.1 baseline result page still opens with its time", (await page.textContent(".fa5x-hero-value").catch(() => "")).startsWith("9.6"));
  await shot(page, "05-B-old-11-result");
  // 5. trend: 1.1 point and 1.2 point not joined
  await page.evaluate(() => window.switchTab("data"));
  await page.waitForSelector(".data-f01-trend-line", { timeout: 10000 }).catch(() => {});
  const dAttr = await page.$eval(".data-f01-trend-line", (p) => p.getAttribute("d")).catch(() => null);
  check("5a Data trend: no line between the 1.1 and the 1.2 point", !!dAttr && (dAttr.match(/M /g) || []).length === 2 && !dAttr.includes("L "), dAttr);
  await shot(page, "06-B-data-trend");
  // 4b ended cycle: entries on home, then a new 1.2 test -> Phase C -> new cycle
  await page.evaluate(() => window.switchTab("home"));
  await page.waitForTimeout(400);
  const homeTargets = await page.$$eval("[onclick]", (els) => [...new Set(els.map((e) => e.getAttribute("onclick").replace(/\(.*$/, "")))]);
  note("4b-1 ended cycle: actions offered on home", homeTargets.join(", "));
  check("4b-1 home has no button that cannot be completed (no end-cycle / no direct re-baseline button)", !homeTargets.some((h) => /endTrackingCycle|restartBaseline|endCycle/i.test(h)));
  await shot(page, "07-B-home-ended-cycle");
  await page.evaluate(() => window.goF01LowerLimbHome());
  await page.waitForTimeout(400);
  note("4b-2 F01 下肢功能 page actions", (await page.$$eval("[onclick]", (els) => [...new Set(els.map((e) => e.getAttribute("onclick")))])).join(" ; "));
  await shot(page, "08-B-f01-home");
  await page.evaluate(() => window.goFiveTimesSitToStandAssessment());
  await page.waitForTimeout(400);
  note("4b-3 5xSTS assessment page reached (camera NOT started)", (await text(page)).slice(0, 120));
  await shot(page, "09-B-5xsts-intro-no-camera");
  // the new completed 1.2 test (seeded, see manifest) -> its result -> 查看訓練建議 -> goal -> generate
  await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), B.newRun);
  await page.waitForSelector(".fa5x-next-cta");
  check("4b-4 no in-progress-cycle note after the cycle ended", !(await page.$(".fa5x-active-cycle-note")));
  await page.click(".fa5x-next-cta");
  await page.waitForFunction(() => typeof window.selectF01Goal === "function");
  await page.evaluate(() => { window.selectF01Goal("G05"); });
  await page.evaluate(() => window.generateF01RecommendationFromSetup());
  const made = await waitFor(async () => { const cs = await cyclesOf(patients.B.uid); return cs.find((c) => c.baselineAssessmentId === B.newRun) ? cs : null; });
  check("4b-5 ended cycle: a NEW 1.2 test + 查看訓練建議 starts a new cycle", !!made, made ? `${made.length} cycles` : "no new cycle");
  await shot(page, "10-B-new-cycle-recommendation");
}

// ── 4a. a 1.1 record cannot become a new baseline ──
{
  const page = await session("C");
  await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), C.old);
  await page.waitForSelector(".fa5x-next-cta");
  const before = dialogs.length;
  await page.click(".fa5x-next-cta");
  await page.waitForTimeout(800);
  const msg = dialogs.slice(before).join(" ");
  check("4a-1 1.1 record: 查看訓練建議 explains it cannot be a new tracking baseline", msg.includes("舊版量測方式") && msg.includes("不能作為新的追蹤基準"), msg);
  check("4a-2 no cycle created from the 1.1 record", (await cyclesOf(patients.C.uid)).length === 0);
  await shot(page, "11-C-after-11-refused");
  dialogs.splice(before); // expected alert, not a problem
}

// ── 4c. cycle in progress: what is allowed, and when a new baseline becomes possible ──
{
  const page = await session("D");
  await page.evaluate(() => window.switchTab("home"));
  await page.waitForTimeout(400);
  const home = await text(page);
  note("4c-1 in-progress cycle: home card", home.slice(0, 220));
  await shot(page, "12-D-home-active");
  const before = dialogs.length;
  await page.evaluate((id) => window.goTrackingReassessment(id), D.cycleId);
  await page.waitForTimeout(600);
  note("4c-2 進行再次評估 before the planned day", dialogs.slice(before).join(" ") || "(no alert)");
  dialogs.splice(before);
  await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), D.newRun);
  await page.waitForSelector(".fa5x-next-cta");
  const activeNote = await page.$eval(".fa5x-active-cycle-note", (e) => e.textContent).catch(() => null);
  check("4c-3 new result during an active cycle explains that no new cycle is created and when it becomes possible", !!activeNote && activeNote.includes("不會建立新的追蹤") && activeNote.includes("需先完成目前追蹤的再次評估"), activeNote);
  await shot(page, "13-D-result-active-cycle-note");
  await page.click(".fa5x-next-cta");
  await page.waitForFunction(() => typeof window.selectF01Goal === "function");
  await page.evaluate(() => { window.selectF01Goal("G05"); });
  await page.evaluate(() => window.generateF01RecommendationFromSetup());
  await page.waitForTimeout(1200);
  const rec = await text(page);
  check("4c-4 recommendation page states the active cycle is not changed", rec.includes("你目前已有進行中的 F01 7 日追蹤"), rec.slice(0, 160));
  check("4c-5 still exactly one cycle (no new baseline while one is in progress)", (await cyclesOf(patients.D.uid)).length === 1);
  await shot(page, "14-D-recommendation-active-cycle");
}

// ── 3b / 6. stored results unchanged; nothing left the machine ──
const after = await Promise.all(Object.keys(storedHash).map(async (id) => [id, canon((await readSession(id)).result)]));
check("3b every stored result (incl. the 1.1 history) unchanged after the whole run", after.every(([id, h]) => h === storedHash[id]), after.filter(([id, h]) => h !== storedHash[id]).map(([id]) => id).join(","));
const external = [...new Set(requests.map((u) => { try { return new URL(u).host; } catch { return u; } }))].filter((h) => h && !LOCAL.has(h));
check("6 no request to any non-local host (whole run)", external.length === 0, external.join(", "));
check("6b no unexpected alert / page error", dialogs.length === 0, dialogs.join(" || "));
for (const r of results) console.log(r.join(" | "));
console.log(`\nPHASE3 PASS ${results.filter((r) => r[0] === "PASS").length} FAIL ${results.filter((r) => r[0] === "FAIL").length} OBSERVED ${results.filter((r) => r[0] === "OBSERVED").length}`);
await browser.close();
await env.cleanup();
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
