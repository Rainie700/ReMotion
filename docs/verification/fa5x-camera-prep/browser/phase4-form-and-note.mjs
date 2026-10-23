// fa5x-camera-prep — condition form layout + in-progress-cycle note readability, on the Firebase emulators
// (project demo-remotion), synthetic local data only, no camera. Two phone widths (375 / 430 px).
//   REPO=<repo> OUT=<results dir> RULES_PATH=<repo>/firestore.rules APP_URL=http://localhost:5173/?emulator=1 node phase4-form-and-note.mjs
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
const check = (name, ok, detail = "") => results.push([ok ? "PASS" : "FAIL", name, String(detail).replace(/\s+/g, " ").slice(0, 260)]);
process.on("uncaughtException", (e) => { results.push(["FAIL", "harness crashed", e.message]); for (const r of results) console.log(r.join(" | ")); process.exit(1); });

for (const u of ["http://127.0.0.1:8080/", "http://127.0.0.1:9099/"]) {
  try { await fetch(u); } catch (e) { console.log(`ABORT: emulator not reachable at ${u}`); process.exit(2); }
}
console.log("preflight ok: Firestore 127.0.0.1:8080, Auth 127.0.0.1:9099, project demo-remotion");
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 } });
const admin = async (fn) => { let out; await env.withSecurityRulesDisabled(async (ctx) => { out = await fn(ctx.firestore()); }); return out; };
const PW = "local-test-only-1";
const EMAIL = `prep-${Date.now().toString(36)}@local.test`;
const P = (await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: EMAIL, password: PW, returnSecureToken: true }) })).json()).localId;

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const imp = (p) => import(pathToFileURL(join(REPO, p)).href);
const { functionalAssessmentService } = await imp("js/data/functionalAssessmentService.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await imp("js/data/trackingCycleService.js");
const { recommendationService } = await imp("js/data/recommendationService.js");
const { exerciseService } = await imp("js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await imp("js/data/f01GoalRecommendation.js");
const { createCollection } = await imp("js/data/storageService.js");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: CUR } = await imp("js/data/fa5xMeasurementCompatibility.js");
const daysAgo = (n, h = 9) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d; };
const fa5x = (ms, at, extra = {}) => {
  const s = functionalAssessmentService.create({ patientId: P, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand" }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...CUR, status: "completed", repCount: 5, completedReps: 5, targetReps: 5, totalDurationMs: ms, rejectedAttempts: [], measuredAt: at.toISOString(), ...extra } });
  return s.id;
};
// an in-progress cycle (baseline 2 days ago) + a reassessment-role result is NOT needed; a standalone new result today
const base = fa5x(9400, daysAgo(2));
const rec = recommendationService.createF01GoalRecommendation({ patientId: P, result: generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: base, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog: exerciseService.listNormalized() }), createdBy: P }).recommendation;
const cyc = trackingCycleService.createOrGetTrackingCycle({ userId: P, baselineSession: functionalAssessmentService.getById(base), recommendation: rec }).cycle;
const standalone = fa5x(9000, daysAgo(0, 8));
const reassessLike = fa5x(9100, daysAgo(0, 7), { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: "not-linked" }); // shows the same-chair question
await admin(async (db) => {
  await setDoc(doc(db, "users", P), { name: "本機測試病人", role: "patient", account: EMAIL, createdAt: new Date().toISOString() });
  await setDoc(doc(db, "publicUsers", P), { name: "本機測試病人", role: "patient" });
  for (const s of createCollection("functionalAssessmentSessions").list()) await setDoc(doc(db, "functionalAssessmentSessions", s.id), JSON.parse(JSON.stringify(s)));
  await setDoc(doc(db, "trackingCycles", cyc.id), JSON.parse(JSON.stringify({ ...trackingCycleService.getTrackingCycleById(cyc.id), patientId: P })));
  await setDoc(doc(db, "recommendationResults", rec.id), JSON.parse(JSON.stringify(recommendationService.getById(rec.id))));
});
writeFileSync(join(OUT, "phase4-seed-manifest.json"), JSON.stringify({ note: "synthetic local emulator data only (demo-remotion)", patient: { uid: P, email: EMAIL }, cycle: cyc.id, standalone, reassessLike }, null, 2));
const readSession = (id) => admin(async (db) => (await getDoc(doc(db, "functionalAssessmentSessions", id))).data());

const browser = await chromium.launch({ channel: "msedge", headless: true });
const requests = [], problems = [];
for (const width of [375, 430]) {
  const ctx = await browser.newContext({ viewport: { width, height: 760 } });
  const page = await ctx.newPage();
  page.on("request", (q) => requests.push(q.url()));
  page.on("dialog", async (d) => { problems.push(`[${width}] ${d.message()}`); await d.dismiss(); });
  page.on("pageerror", (e) => problems.push(`[${width}] pageerror: ${e.message}`));
  await page.goto(APP_URL, { waitUntil: "load" });
  await page.waitForFunction(() => typeof window.setAuthMode === "function");
  await page.evaluate(() => { window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
  await page.waitForSelector("#loginAccount");
  await page.fill("#loginAccount", EMAIL);
  await page.fill("#loginPassword", PW);
  await page.evaluate(() => window.login());
  check(`W${width}-0 signed in`, await page.waitForFunction(() => !!document.querySelector(".bottom-nav") && !document.getElementById("loginAccount"), null, { timeout: 30000 }).then(() => true, () => false));

  // ── in-progress-cycle note: readable on screen right above 查看訓練建議 ──
  await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), standalone);
  await page.waitForSelector(".fa5x-next-cta");
  await page.$eval(".fa5x-next-cta", (b) => b.scrollIntoView({ block: "end" }));
  await page.waitForTimeout(300);
  const geo = await page.evaluate(() => {
    const note = document.querySelector(".fa5x-active-cycle-note"), btn = document.querySelector(".fa5x-next-cta");
    const nav = document.querySelector(".bottom-nav"), banner = document.getElementById("emulatorModeBanner");
    const r = (e) => (e ? e.getBoundingClientRect() : null);
    return { note: r(note), btn: r(btn), navTop: nav ? nav.getBoundingClientRect().top : innerHeight, bannerBottom: banner ? banner.getBoundingClientRect().bottom : 0, vh: innerHeight, text: note ? note.textContent : null };
  });
  const visible = (b) => b && b.top >= geo.bannerBottom - 0.5 && b.bottom <= geo.navTop + 0.5;
  check(`W${width}-1 note present on a new result during an active cycle`, !!geo.text, geo.text);
  check(`W${width}-2 note fully visible on screen together with the 查看訓練建議 button (before pressing it)`, visible(geo.note) && visible(geo.btn), JSON.stringify({ note: geo.note && [geo.note.top, geo.note.bottom], btn: geo.btn && [geo.btn.top, geo.btn.bottom], navTop: geo.navTop }));
  check(`W${width}-3 note sits above the button`, !!geo.note && geo.note.bottom <= geo.btn.top + 0.5);
  await page.screenshot({ path: join(OUT, `shot-${width}-01-active-cycle-note-before-button.png`) });

  // ── condition form layout ──
  await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), width === 375 ? standalone : reassessLike);
  await page.waitForSelector(".fa5x-cond-form");
  if (!(await page.$eval(".fa5x-cond-form", (d) => d.open))) await page.click(".fa5x-cond-form > summary");
  await page.$eval(".fa5x-cond-form", (d) => d.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(200);
  const lay = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".fa5x-cond-option")].map((l) => {
      const radio = l.querySelector("input").getBoundingClientRect(), box = l.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(l); const rects = [...range.getClientRects()].filter((x) => x.width > 0 && x !== radio);
      const textRect = [...l.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim()).map((n) => { const rr = document.createRange(); rr.selectNodeContents(n); return rr.getBoundingClientRect(); })[0];
      return { text: l.textContent.trim(), sameLine: !!textRect && Math.abs((radio.top + radio.bottom) / 2 - (textRect.top + textRect.bottom) / 2) < 8 && radio.right <= textRect.left + 1, h: box.height, w: box.width, overflow: l.scrollWidth > l.clientWidth + 1, rects: rects.length };
    });
    const phone = document.querySelector(".phone") || document.documentElement;
    const form = document.querySelector(".fa5x-cond-form");
    return { rows, docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, phoneOverflow: phone.scrollWidth > phone.clientWidth + 1, formOverflow: form.scrollWidth > form.clientWidth + 1, vw: innerWidth };
  });
  check(`W${width}-4 every option: radio and its text on the same line`, lay.rows.length >= 6 && lay.rows.every((r) => r.sameLine), JSON.stringify(lay.rows.filter((r) => !r.sameLine)));
  check(`W${width}-5 every option is one compact row (no wrapped radio; height < 60 px)`, lay.rows.every((r) => r.h < 60), lay.rows.map((r) => Math.round(r.h)).join(","));
  check(`W${width}-6 no horizontal overflow (page / phone / form / options)`, !lay.docOverflow && !lay.phoneOverflow && !lay.formOverflow && lay.rows.every((r) => !r.overflow), JSON.stringify({ doc: lay.docOverflow, phone: lay.phoneOverflow, form: lay.formOverflow }));
  check(`W${width}-7 options kept (沒有／有／不確定 ×2, 本人／家人或照顧者代答${width === 430 ? ", 同一張椅子 是／不是／不確定" : ""})`,
    JSON.stringify(lay.rows.map((r) => r.text)) === JSON.stringify(width === 430 ? ["沒有", "有", "不確定", "沒有", "有", "不確定", "是", "不是", "不確定", "本人", "家人或照顧者代答"] : ["沒有", "有", "不確定", "沒有", "有", "不確定", "本人", "家人或照顧者代答"]), JSON.stringify(lay.rows.map((r) => r.text)));
  await page.screenshot({ path: join(OUT, `shot-${width}-02-condition-form.png`) });

  // whole row is tappable: click the row's right side (not the radio), then submit; stored values unchanged in meaning
  const clickRow = async (name, value) => {
    const box = await page.$eval(`input[name="${name}"][value="${value}"]`, (i) => { i.closest("label").scrollIntoView({ block: "center" }); const b = i.closest("label").getBoundingClientRect(); return { x: b.right - 12, y: (b.top + b.bottom) / 2 }; });
    await page.mouse.click(box.x, box.y);
    return page.$eval(`input[name="${name}"][value="${value}"]`, (i) => i.checked);
  };
  check(`W${width}-8 tapping the row (far from the radio) selects it`, (await clickRow("fa5xCondArms", "no")) && (await clickRow("fa5xCondAssist", "unknown")) && (await clickRow("fa5xCondSource", "caregiver_report")));
  const sid = width === 375 ? standalone : reassessLike;
  const before = (await readSession(sid)).conditionReports || [];
  await page.click(".fa5x-cond-form > .btn");
  const t0 = Date.now(); let after = before;
  while (Date.now() - t0 < 15000) { after = (await readSession(sid)).conditionReports || []; if (after.length === before.length + 1) break; await new Promise((r) => setTimeout(r, 300)); }
  const last = after[after.length - 1] || {};
  check(`W${width}-9 saved report has the same fields and meaning`, after.length === before.length + 1 && last.armsUsed === "no" && last.physicalAssistance === "unknown" && last.source === "caregiver_report"
    && last.sameChairAsBaseline === (width === 430 ? "unknown" : "not_applicable") && last.schemaVersion === "fa5x-condition-report-1", JSON.stringify(last));
  await page.$eval(".fa5x-condition-card", (c) => c.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: join(OUT, `shot-${width}-03-after-save.png`) });
  await ctx.close();
}
const external = [...new Set(requests.map((u) => { try { return new URL(u).host; } catch { return u; } }))].filter((h) => h && !LOCAL.has(h));
check("X1 no request to any non-local host", external.length === 0, external.join(", "));
check("X2 no alert / page error", problems.length === 0, problems.join(" || "));
for (const r of results) console.log(r.join(" | "));
console.log(`\nPHASE4 PASS ${results.filter((r) => r[0] === "PASS").length} FAIL ${results.filter((r) => r[0] === "FAIL").length}`);
await browser.close();
await env.cleanup();
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
