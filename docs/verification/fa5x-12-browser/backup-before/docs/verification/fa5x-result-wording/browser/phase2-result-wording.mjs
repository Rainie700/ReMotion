// Result wording + banner fix — local browser check on the Firebase emulators (project demo-remotion).
// Synthetic local data only. Per result page: the note no longer promises comparison; no
// "recommendation basis" claim; 觀察時間 + reason for 有協助 / 不確定 / 未回報; banner does not cover the page.
//   REPO=<repo> OUT=<results dir> RULES_PATH=<repo>/firestore.rules APP_URL=http://localhost:5173/?emulator=1 node phase2-result-wording.mjs
import { chromium } from "playwright-core";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { REPO, OUT, RULES_PATH } = process.env;
const APP_URL = process.env.APP_URL || "http://localhost:5173/?emulator=1";
const LOCAL = new Set(["localhost:5173", "127.0.0.1:5173", "127.0.0.1:8080", "127.0.0.1:9099"]);
const KEPT = "已保留本次紀錄；是否能與其他測驗比較，需另行確認測試條件與量測版本。";
const GUARANTEE = /將作為後續再次評估時的比較依據|會作為下一週期的比較起點|可以和初次評估比較|作為推薦依據|可作為推薦/;
const results = [];
const check = (name, ok, detail = "") => results.push([ok ? "PASS" : "FAIL", name, String(detail).slice(0, 220)]);
process.on("uncaughtException", (e) => { results.push(["FAIL", "harness crashed", e.message]); for (const r of results) console.log(r.join(" | ")); process.exit(1); });

for (const u of ["http://127.0.0.1:8080/", "http://127.0.0.1:9099/"]) {
  try { await fetch(u); } catch (e) { console.log(`ABORT: emulator not reachable at ${u}`); process.exit(2); }
}
console.log("preflight ok: Firestore 127.0.0.1:8080, Auth 127.0.0.1:9099, project demo-remotion");
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 } });
const admin = async (fn) => { await env.withSecurityRulesDisabled(async (ctx) => { await fn(ctx.firestore()); }); };

const PW = "local-test-only-1";
const EMAIL = `rw-patient-${Date.now().toString(36)}@local.test`;
const r = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PW, returnSecureToken: true }) });
const P = (await r.json()).localId;

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const { functionalAssessmentService } = await imp("js/data/functionalAssessmentService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await imp("js/data/trackingCycleService.js");
const { recommendationService } = await imp("js/data/recommendationService.js");
const { exerciseService } = await imp("js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await imp("js/data/f01GoalRecommendation.js");
const V11 = { algorithmVersion: "fa5x-assessment-1.1", geometryCoordinateSpace: "isotropic_image_height_units" };
const daysAgo = (n, h = 9) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d; };
const fa5x = (ms, at, extra = {}) => {
  const s = functionalAssessmentService.create({ patientId: P, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand" }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...V11, status: "completed", repCount: 5, completedReps: 5, targetReps: 5, totalDurationMs: ms, rejectedAttempts: [], measuredAt: at.toISOString(), ...extra } });
  return s.id;
};
const report = (armsUsed, physicalAssistance) => ({ armsUsed, physicalAssistance, chairHeightCm: null, sameChairAsBaseline: "not_applicable", source: "self_report" });
const cases = {
  none: fa5x(8800, daysAgo(4)),
  unsure: fa5x(8700, daysAgo(3)),
  assisted: fa5x(8600, daysAgo(2)),
  clear: fa5x(8500, daysAgo(1)),
};
functionalAssessmentService.appendFa5xConditionReport(cases.unsure, report("unknown", "no"), { reportedBy: P });
functionalAssessmentService.appendFa5xConditionReport(cases.assisted, report("no", "yes"), { reportedBy: P });
functionalAssessmentService.appendFa5xConditionReport(cases.clear, report("no", "no"), { reportedBy: P });
// a linked reassessment (real services), for the reassessment note variant
const b = fa5x(9600, daysAgo(10));
const recResult = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog: exerciseService.listNormalized() });
const rec = recommendationService.createF01GoalRecommendation({ patientId: P, result: recResult, createdBy: P }).recommendation;
const cyc = trackingCycleService.createOrGetTrackingCycle({ userId: P, baselineSession: functionalAssessmentService.getById(b), recommendation: rec }).cycle;
const [py, pm, pd] = cyc.plannedReassessmentDateKey.split("-").map(Number);
const re = fa5x(9100, new Date(py, pm - 1, pd, 10, 0), { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cyc.id, baselineAssessmentId: b });
const linked = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cyc.id, userId: P, reassessment: functionalAssessmentService.getById(re), todayDateKey: cyc.plannedReassessmentDateKey });
if (linked.error) throw new Error(`link: ${linked.error}`);
cases.reassessment = re;
await admin(async (db) => {
  await setDoc(doc(db, "users", P), { name: "本機測試病人", role: "patient", account: EMAIL, createdAt: new Date().toISOString() });
  await setDoc(doc(db, "publicUsers", P), { name: "本機測試病人", role: "patient" });
  for (const id of [...Object.values(cases), b]) await setDoc(doc(db, "functionalAssessmentSessions", id), JSON.parse(JSON.stringify(functionalAssessmentService.getById(id))));
  await setDoc(doc(db, "trackingCycles", cyc.id), JSON.parse(JSON.stringify({ ...trackingCycleService.getTrackingCycleById(cyc.id), patientId: P, userId: P })));
  await setDoc(doc(db, "recommendationResults", rec.id), JSON.parse(JSON.stringify({ ...recommendationService.getById(rec.id), patientId: P })));
});
writeFileSync(join(OUT, "phase2-seed-manifest.json"), JSON.stringify({ note: "synthetic local emulator data only (demo-remotion)", patient: { uid: P, email: EMAIL }, cases }, null, 2));

const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();
const requests = [], problems = [];
page.on("request", (q) => requests.push(q.url()));
page.on("dialog", async (d) => { problems.push(d.message()); await d.dismiss(); });
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(APP_URL, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.setAuthMode === "function");
await page.evaluate(() => { window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
await page.waitForSelector("#loginAccount");
await page.fill("#loginAccount", EMAIL);
await page.fill("#loginPassword", PW);
await page.evaluate(() => window.login());
const signedIn = await page.waitForFunction(() => !!document.querySelector(".bottom-nav") && !document.getElementById("loginAccount") && !!localStorage.getItem("remotion_emulator_collection_functionalAssessmentSessions"), null, { timeout: 30000 }).then(() => true, () => false);
check("W0 synthetic patient signed in on the emulator", signedIn);

/** Banner must not cover the page: header top >= banner bottom; bottom nav inside the viewport. */
async function bannerGeometry(label) {
  const g = await page.evaluate(() => {
    const banner = document.getElementById("emulatorModeBanner").getBoundingClientRect();
    const app = document.getElementById("app").getBoundingClientRect();
    const header = document.querySelector("#app .header");
    const nav = document.querySelector(".bottom-nav");
    return { bannerBottom: banner.bottom, appTop: app.top, headerTop: header ? header.getBoundingClientRect().top : null, navBottom: nav ? nav.getBoundingClientRect().bottom : null, vh: window.innerHeight, scrollY: window.scrollY };
  });
  check(`${label} banner does not cover the page (content and header start below it)`, g.appTop >= g.bannerBottom - 0.5 && (g.headerTop === null || g.headerTop >= g.bannerBottom - 0.5), JSON.stringify(g));
  check(`${label} bottom nav fully inside the viewport`, g.navBottom === null || g.navBottom <= g.vh + 0.5, JSON.stringify(g));
}
await bannerGeometry("W1 home:");
await page.screenshot({ path: join(OUT, "shot-10-home-banner.png") });

const expectLabel = { none: ["觀察時間", "測試條件尚未回報"], unsure: ["觀察時間", "是否用手撐：不確定"], assisted: ["觀察時間", "回報有人協助"], clear: ["完成時間（依使用者回報的條件）"], reassessment: ["觀察時間", "測試條件尚未回報"] };
for (const [name, id] of Object.entries(cases)) {
  await page.evaluate((sid) => { window.scrollTo(0, 0); window.goFiveTimesSitToStandResult(sid); }, id);
  await page.waitForSelector(".fa5x-condition-card");
  const text = await page.evaluate(() => document.getElementById("app").innerText);
  const label = await page.textContent(".fa5x-condition-label");
  check(`W2 ${name}: note says the record is kept and comparability needs separate confirmation`, text.includes(KEPT));
  check(`W3 ${name}: no comparison guarantee / recommendation-basis claim on the page`, !GUARANTEE.test(text), (text.match(GUARANTEE) || [""])[0]);
  check(`W4 ${name}: time label`, expectLabel[name].every((w) => label.includes(w)), label);
  if (name === "reassessment") check("W5 reassessment: still says it is recorded in the 7-day tracking", text.includes("這次結果已記錄在同一個 7 日追蹤中。"));
  await bannerGeometry(`W6 ${name}:`);
  await page.screenshot({ path: join(OUT, `shot-1${Object.keys(cases).indexOf(name) + 1}-result-${name}.png`), fullPage: true });
}
const external = [...new Set(requests.map((u) => { try { return new URL(u).host; } catch { return u; } }))].filter((h) => h && !LOCAL.has(h));
check("W7 no request to any non-local host", external.length === 0, external.join(", "));
check("W8 no alert / page error", problems.length === 0, problems.join(" || "));
for (const row of results) console.log(row.join(" | "));
console.log(`\nPHASE2 PASS ${results.filter((x) => x[0] === "PASS").length} FAIL ${results.filter((x) => x[0] === "FAIL").length}`);
await browser.close();
await env.cleanup();
process.exit(results.some((x) => x[0] === "FAIL") ? 1 : 0);
