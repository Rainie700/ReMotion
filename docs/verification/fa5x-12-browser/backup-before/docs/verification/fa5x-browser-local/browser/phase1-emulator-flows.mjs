// Local browser verification — PHASE 1: Auth + Firestore emulators running (project demo-remotion).
// Seeds ONLY synthetic local accounts / documents into the emulators, then drives the real app
// (Vite dev server, ?emulator=1) in Edge: patient login (re-stamp), result page + condition reports
// (unanswered / 不確定 / 有協助), reload, original result unchanged, trend version break, therapist query.
//   REPO=<repo> OUT=<results dir> RULES_PATH=<repo>/firestore.rules APP_URL=http://localhost:5173/?emulator=1 node phase1-emulator-flows.mjs
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { REPO, OUT, RULES_PATH } = process.env;
const APP_URL = process.env.APP_URL || "http://localhost:5173/?emulator=1";
const LOCAL = new Set(["localhost:5173", "127.0.0.1:5173", "127.0.0.1:8080", "127.0.0.1:9099"]);
const results = [];
const check = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, String(detail).slice(0, 200)]); };
const canon = (v) => (v && typeof v === "object" ? (Array.isArray(v) ? `[${v.map(canon).join(",")}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}`) : JSON.stringify(v));

// ── preflight: emulators only ──
for (const u of ["http://127.0.0.1:8080/", "http://127.0.0.1:9099/"]) {
  try { await fetch(u); } catch (e) { console.log(`ABORT: emulator not reachable at ${u}`); process.exit(2); }
}
console.log(`preflight ok: Firestore 127.0.0.1:8080, Auth 127.0.0.1:9099, project demo-remotion`);
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 } });
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };

// ── synthetic accounts (Auth emulator REST; never a real account) ──
const PW = "local-test-only-1";
const stamp = Date.now().toString(36);
const PATIENT_EMAIL = `bv-patient-${stamp}@local.test`, THERAPIST_EMAIL = `bv-therapist-${stamp}@local.test`;
async function signUp(email) {
  const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PW, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.localId) throw new Error(`signUp failed: ${JSON.stringify(j)}`);
  return j.localId;
}
const P = await signUp(PATIENT_EMAIL), T = await signUp(THERAPIST_EMAIL);

// ── synthetic records built by the REAL services (node, fake localStorage, no cloud user) ──
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const { functionalAssessmentService } = await imp("js/data/functionalAssessmentService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await imp("js/data/trackingCycleService.js");
const { recommendationService } = await imp("js/data/recommendationService.js");
const { exerciseService } = await imp("js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await imp("js/data/f01GoalRecommendation.js");
const { toLocalDateKey } = await imp("js/data/trackingCycle.js");
const V11 = { algorithmVersion: "fa5x-assessment-1.1", geometryCoordinateSpace: "isotropic_image_height_units" };
const V10 = { algorithmVersion: "fa5x-assessment-1.0" };
const daysAgo = (n, h = 9) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d; };
const fa5x = (ms, at, version, extra = {}) => {
  const s = functionalAssessmentService.create({ patientId: P, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand" }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...version, status: "completed", repCount: 5, completedReps: 5, targetReps: 5, totalDurationMs: ms, rejectedAttempts: [], measuredAt: at.toISOString(), ...extra } });
  return functionalAssessmentService.getById(s.id);
};
// cycle 2 (1.1) through the real services
const b2 = fa5x(9600, daysAgo(10), V11);
const recResult = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b2.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog: exerciseService.listNormalized() });
const rec = recommendationService.createF01GoalRecommendation({ patientId: P, result: recResult, createdBy: P }).recommendation;
const made = trackingCycleService.createOrGetTrackingCycle({ userId: P, baselineSession: b2, recommendation: rec });
if (made.error) throw new Error(`cycle2: ${made.error}`);
const planned = made.cycle.plannedReassessmentDateKey;
const [py, pm, pd] = planned.split("-").map(Number);
const r2 = fa5x(9100, new Date(py, pm - 1, pd, 10, 0), V11, { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: made.cycle.id, baselineAssessmentId: b2.id });
const linked = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: made.cycle.id, userId: P, reassessment: r2, todayDateKey: planned });
if (linked.error) throw new Error(`cycle2 link: ${linked.error}`);
const cycle2 = trackingCycleService.getTrackingCycleById(made.cycle.id);
// cycle 1 (legacy 1.0): such cycles exist in history; the current service refuses 1.0 baselines, so it is cloned from cycle 2's shape
const b1 = fa5x(10400, daysAgo(24), V10);
const r1 = fa5x(10100, daysAgo(17, 10), V10, { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: "bv-cycle-1", baselineAssessmentId: b1.id });
const cycle1 = {
  ...cycle2, id: "bv-cycle-1", cycleStartDateKey: toLocalDateKey(daysAgo(24)), plannedReassessmentDateKey: toLocalDateKey(daysAgo(17)),
  baselineAssessmentId: b1.id, reassessmentId: r1.id, reassessmentMeasuredAt: daysAgo(17, 10).toISOString(), reassessmentDateKey: toLocalDateKey(daysAgo(17)),
  createdAt: daysAgo(24).toISOString(), completedAt: daysAgo(17, 10).toISOString(), dailyTrainingProgress: {}, completedTrainingDates: [],
};
// a plain completed 1.1 run today, no condition reports (the result-page subject)
const s5 = fa5x(8800, daysAgo(0, 8), V11);
const sessions = [b1, r1, b2, r2, s5].map((s) => functionalAssessmentService.getById(s.id));
const strip = (o) => { const { therapistId, relationId, ...rest } = o; return rest; }; // seeded WITHOUT relation stamps (legacy)
const REL = "bv-rel-1";
await admin(async (db) => {
  await setDoc(doc(db, "users", P), { name: "本機測試病人", role: "patient", account: PATIENT_EMAIL, createdAt: new Date().toISOString() });
  await setDoc(doc(db, "users", T), { name: "本機測試復健師", role: "therapist", account: THERAPIST_EMAIL, createdAt: new Date().toISOString(), inviteCode: "RM-LOCAL1" });
  await setDoc(doc(db, "publicUsers", P), { name: "本機測試病人", role: "patient" });
  await setDoc(doc(db, "publicUsers", T), { name: "本機測試復健師", role: "therapist", inviteCode: "RM-LOCAL1" });
  await setDoc(doc(db, "therapistPatientRelations", REL), { id: REL, therapistId: T, patientId: P, status: "accepted", inviteCode: "RM-LOCAL1", createdAt: daysAgo(30).toISOString(), acceptedAt: daysAgo(30).toISOString() });
  for (const s of sessions) await setDoc(doc(db, "functionalAssessmentSessions", s.id), JSON.parse(JSON.stringify(strip(s))));
  for (const c of [cycle1, cycle2]) await setDoc(doc(db, "trackingCycles", c.id), JSON.parse(JSON.stringify({ ...strip(c), patientId: P, userId: P })));
  await setDoc(doc(db, "recommendationResults", rec.id), JSON.parse(JSON.stringify({ ...recommendationService.getById(rec.id), patientId: P })));
});
const seededResultHash = Object.fromEntries(sessions.map((s) => [s.id, canon(s.result)]));
writeFileSync(join(OUT, "seed-manifest.json"), JSON.stringify({ note: "synthetic local emulator data only (project demo-remotion)", patient: { uid: P, email: PATIENT_EMAIL }, therapist: { uid: T, email: THERAPIST_EMAIL }, relationId: REL,
  sessions: sessions.map((s) => ({ id: s.id, version: s.result.algorithmVersion, ms: s.result.totalDurationMs, role: s.result.assessmentRole || null })), cycles: [cycle1.id, cycle2.id], s5: s5.id, r2: r2.id }, null, 2));
const readSession = (id) => admin(async (db) => (await getDoc(doc(db, "functionalAssessmentSessions", id))).data());
const waitFor = async (fn, ms = 15000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) return null; await new Promise((r) => setTimeout(r, 300)); } };

// ── browser ── (any crash is reported as a FAIL and the partial results are still printed)
process.on("uncaughtException", (e) => { results.push(["FAIL", "harness crashed", e.message]); for (const r of results) console.log(r.join(" | ")); console.log(`
PHASE1 PASS ${results.filter((r) => r[0] === "PASS").length} FAIL ${results.filter((r) => r[0] === "FAIL").length}`); process.exit(1); });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const requests = [];
const dialogs = [];
async function newPage() {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
  const page = await ctx.newPage();
  page.on("request", (r) => requests.push(r.url()));
  page.on("dialog", async (d) => { dialogs.push(d.message()); await d.dismiss(); });
  page.on("pageerror", (e) => dialogs.push(`pageerror: ${e.message}`));
  return { ctx, page };
}
async function loginAs(page, role, email) {
  await page.goto(APP_URL, { waitUntil: "load" });
  await page.waitForSelector("#emulatorModeBanner");
  await page.waitForFunction(() => typeof window.setAuthMode === "function");
  await page.evaluate((r) => { window.setAuthMode("login"); window.selectAuthRole(r); window.confirmAuthRole(); }, role);
  await page.waitForSelector("#loginAccount");
  await page.fill("#loginAccount", email);
  await page.fill("#loginPassword", PW);
  await page.evaluate(() => window.login());
  // signed in = hydrate wrote the collections AND the signed-in UI (bottom nav) is rendered
  return page.waitForFunction(() => !document.getElementById("loginAccount") && !!localStorage.getItem("remotion_emulator_collection_functionalAssessmentSessions") && !!document.querySelector(".bottom-nav"), null, { timeout: 30000 }).then(() => true, () => false);
}
const shot = (page, name) => page.screenshot({ path: join(OUT, `shot-${name}.png`), fullPage: true });

// B1 patient login -> hydrate -> re-stamp
const { page } = await newPage();
check("B1 patient logs in on the emulator (synthetic account)", await loginAs(page, "patient", PATIENT_EMAIL));
check("B1 banner 本機測試資料 visible after login", !!(await page.$("#emulatorModeBanner")) && (await page.textContent("#emulatorModeBanner")).includes("本機測試資料"));
await shot(page, "01-patient-home");
const stamped = await waitFor(async () => { const all = await Promise.all(sessions.map((s) => readSession(s.id))); return all.every((d) => d.therapistId === T && d.relationId === REL) ? all : null; });
check("B2 patient login re-stamped all 5 legacy sessions with the accepted relation", !!stamped);
const afterLogin = await Promise.all(sessions.map((s) => readSession(s.id)));
check("B3 re-stamp left every stored result unchanged", afterLogin.every((d) => canon(d.result) === seededResultHash[d.id]));
const keys1 = await page.evaluate(() => Object.keys(localStorage));
check("B4 local cache separated (only remotion_emulator_* keys)", keys1.length > 0 && keys1.filter((k) => k.startsWith("remotion")).every((k) => k.startsWith("remotion_emulator_")), keys1.filter((k) => !k.startsWith("remotion_emulator_")).join(","));

// C result page + three reports
await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), s5.id);
await page.waitForSelector(".fa5x-condition-card");
const label0 = await page.textContent(".fa5x-condition-label");
check("C1 unreported result shows 觀察時間 + 測試條件尚未回報", label0.includes("觀察時間") && label0.includes("測試條件尚未回報"), label0);
check("C2 hero time unchanged on the page (8.8 秒)", (await page.textContent(".fa5x-hero-value")).startsWith("8.8"));
check("C3 form has no pre-selected answer", (await page.$$eval(".fa5x-cond-form input[type=radio]", (els) => els.filter((e) => e.checked).length)) === 0);
await shot(page, "02-result-unreported");
async function submit({ arms, assist, source }) {
  if (!(await page.$eval(".fa5x-cond-form", (d) => d.open))) await page.click(".fa5x-cond-form > summary");
  if (arms) await page.check(`input[name="fa5xCondArms"][value="${arms}"]`);
  if (assist) await page.check(`input[name="fa5xCondAssist"][value="${assist}"]`);
  await page.check(`input[name="fa5xCondSource"][value="${source}"]`);
  await page.click(".fa5x-cond-form button");
}
// C4 unanswered (only who answered)
await submit({ source: "self_report" });
const d1 = await waitFor(async () => { const d = await readSession(s5.id); return d.conditionReports && d.conditionReports.length === 1 ? d : null; });
check("C4 unanswered questions saved as unknown (never no)", !!d1 && d1.conditionReports[0].armsUsed === "unknown" && d1.conditionReports[0].physicalAssistance === "unknown", d1 && JSON.stringify(d1.conditionReports[0]));
await page.waitForSelector(".fa5x-cond-issues");
check("C4 page lists both 不確定 issues", (await page.textContent(".fa5x-cond-issues")).includes("是否用手撐：不確定") && (await page.textContent(".fa5x-cond-issues")).includes("是否有人協助：不確定"));
await shot(page, "03-result-unanswered");
// C5 explicit 不確定 (caregiver)
await submit({ arms: "unknown", assist: "no", source: "caregiver_report" });
const d2 = await waitFor(async () => { const d = await readSession(s5.id); return d.conditionReports && d.conditionReports.length === 2 ? d : null; });
check("C5 explicit 不確定 saved; first report unchanged", !!d2 && d2.conditionReports[1].armsUsed === "unknown" && d2.conditionReports[1].source === "caregiver_report" && canon(d2.conditionReports[0]) === canon(d1.conditionReports[0]));
await shot(page, "04-result-unsure");
// C6 有協助
await submit({ arms: "no", assist: "yes", source: "self_report" });
const d3 = await waitFor(async () => { const d = await readSession(s5.id); return d.conditionReports && d.conditionReports.length === 3 ? d : null; });
check("C6 有協助 saved as a third report", !!d3 && d3.conditionReports[2].physicalAssistance === "yes");
const label3 = await page.textContent(".fa5x-condition-label");
check("C6 label stays 觀察時間 and names 回報有人協助", label3.includes("觀察時間") && label3.includes("回報有人協助"), label3);
await shot(page, "05-result-assistance");
check("C7 stored result unchanged after three reports", !!d3 && canon(d3.result) === seededResultHash[s5.id]);

// D reload -> reports come back from the emulator
// the local emulator-namespace cache is cleared first, so everything shown after the reload
// must have come back from the emulator through the normal login hydrate
await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("remotion_emulator_")).forEach((k) => localStorage.removeItem(k)));
await page.reload({ waitUntil: "load" });
const rehydrated = await page.waitForFunction(() => !!localStorage.getItem("remotion_emulator_collection_functionalAssessmentSessions") && !!document.querySelector(".bottom-nav") && !document.getElementById("loginAccount"), null, { timeout: 30000 }).then(() => true, () => false);
check("D0 reload: session restored and data re-loaded from the emulator (cache cleared before reload)", rehydrated);
await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), s5.id);
await page.waitForSelector(".fa5x-condition-card");
const cardAfter = await page.textContent(".fa5x-condition-card");
check("D1 after reload: 3 reports, latest (有協助) shown", cardAfter.includes("共 3 次回報") && cardAfter.includes("有人協助"), cardAfter.slice(0, 160));
check("D2 after reload: hero time still 8.8 秒", (await page.textContent(".fa5x-hero-value")).startsWith("8.8"));
const d4 = await readSession(s5.id);
check("D3 emulator copy: result unchanged, 3 reports", canon(d4.result) === seededResultHash[s5.id] && d4.conditionReports.length === 3);
await shot(page, "06-result-after-reload");
await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), r2.id);
await page.waitForSelector(".fa5x-condition-card");
const r2Card = await page.$eval(".fa5x-condition-card", (e) => e.outerHTML).catch(() => "");
writeFileSync(join(OUT, "d4-reassessment-card.html"), r2Card);
const r2Form = await page.$(".fa5x-cond-form");
if (r2Form && !(await r2Form.evaluate((d) => d.open))) await page.click(".fa5x-cond-form > summary");
check("D4 reassessment result asks the same-chair question", !!r2Form && !!(await page.$('input[name="fa5xCondSameChair"]')), r2Form ? "" : "no .fa5x-cond-form on the reassessment result (card saved to d4-reassessment-card.html)");

// E trend version break (Data tab chart + 追蹤歷程)
await page.evaluate(() => window.switchTab("data"));
await page.waitForSelector(".data-f01-trend-line", { timeout: 15000 }).catch(() => {});
const dAttr = await page.$eval(".data-f01-trend-line", (p) => p.getAttribute("d")).catch(() => null);
const moves = dAttr ? (dAttr.match(/M /g) || []).length : 0;
check("E1 Data chart: line broken between 1.0 and 1.1 points (2 sub-paths)", moves === 2, dAttr);
await shot(page, "07-data-trend");
await page.evaluate(() => window.goF01TrackingHistory());
await page.waitForSelector(".f01-week-line", { timeout: 15000 }).catch(() => {});
const lines = await page.$$eval(".f01-week-line", (els) => els.map((e) => e.getAttribute("class")));
check("E2 追蹤歷程: W1 and W2 drawn, no dashed link joining 1.0 week to 1.1 week", lines.length === 2 && lines.every((c) => !c.includes("is-pending")), JSON.stringify(lines));
await shot(page, "08-tracking-history");
await page.evaluate(() => window.logout());

// F therapist: 3-field query through the accepted relation
const t = await newPage();
check("F1 therapist logs in on the emulator (synthetic account)", await loginAs(t.page, "therapist", THERAPIST_EMAIL));
const loaded = await t.page.evaluate(() => JSON.parse(localStorage.getItem("remotion_emulator_collection_functionalAssessmentSessions") || "[]").map((s) => s.id));
check("F2 therapist loaded all 5 re-stamped patient sessions", sessions.every((s) => loaded.includes(s.id)), loaded.join(","));
const keys2 = await t.page.evaluate(() => Object.keys(localStorage));
check("F3 therapist cache also separated", keys2.filter((k) => k.startsWith("remotion")).every((k) => k.startsWith("remotion_emulator_")));
await shot(t.page, "09-therapist-home");

// G no request left the machine; no unexpected dialogs / page errors
const hosts = [...new Set(requests.map((u) => { try { return new URL(u).host; } catch { return u; } }))];
const external = hosts.filter((h) => h && !LOCAL.has(h));
check("G1 no request to any non-local host (whole run)", external.length === 0, external.join(", "));
check("G2 no alert / page error during the run", dialogs.length === 0, dialogs.join(" || "));
writeFileSync(join(OUT, "phase1-requests-hosts.txt"), hosts.join("\n"));

for (const r of results) console.log(r.join(" | "));
console.log(`\nPHASE1 PASS ${results.filter((r) => r[0] === "PASS").length} FAIL ${results.filter((r) => r[0] === "FAIL").length}`);
await browser.close();
await env.cleanup();
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
