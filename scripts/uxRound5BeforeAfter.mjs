// 使用體驗改善 5/5 — the same pages and the same synthetic data, captured on one code version (ROOT) for the
// before/after comparison. Run once with ROOT=<a copy of the round-4 commit> LABEL=before and once with ROOT=<repo>
// LABEL=after. LOCAL only (own Vite port, emulator mode, demo-remotion); no assertion on features — pictures only.
//
//   REPO=<repo> ROOT=<root> LABEL=before|after SHOTS=<dir> firebase emulators:exec --only firestore,auth --project demo-remotion "node uxRound5BeforeAfter.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO, root = process.env.ROOT || repo, label = process.env.LABEL || "after";
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = `${process.env.SHOTS || `${repo}/reports/ux-r5/before-after`}/${label}`;
mkdirSync(shots, { recursive: true });
const port = Number(process.env.PORT || (label === "before" ? 5189 : 5190));
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);
const { CASES, STEP } = await import(pathToFileURL(`${repo}/docs/verification/le05-slow-rep/cases.mjs`).href);
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const password = "ux5b-local-only-123", tag = Date.now();
const email = `ux5b-${label}-${tag}@local.test`;
const acct = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
assert.ok(acct.localId);
const P = { id: acct.localId, email, account: email, role: "patient", name: "示範患者", createdAt: new Date().toISOString() };
await seed(async (db) => { await setDoc(doc(db, "users", P.id), P); await setDoc(doc(db, "publicUsers", P.id), P); });
const at = new Date().toISOString(), faId = `fa-ba-${tag}`;
await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", faId), { id: faId, patientId: P.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed", startedAt: at, completedAt: at, therapistId: "", relationId: "",
  result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 12400, measuredAt: at, seededSynthetic: true } }));

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, stdio: "ignore" });
let browser;
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  console.log(`NOTE | ${label}: http://127.0.0.1:${port}/?emulator=1 served from ${root}`);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
  const page = await context.newPage();
  page.on("dialog", (d) => d.dismiss());
  await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
  await page.waitForFunction(() => typeof window.selectAuthRole === "function");
  await page.evaluate(() => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
  await page.locator("#loginAccount").fill(email); await page.locator("#loginPassword").fill(password);
  await page.locator('[onclick="login()"]').click();
  await page.locator(".top-profile-container").or(page.getByText("建立我的復健需求", { exact: true })).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  if (await page.getByRole("button", { name: "稍後再填" }).count()) await page.getByRole("button", { name: "稍後再填" }).click();
  const pause = (ms = 800) => page.waitForTimeout(ms);
  const nav = (name) => page.locator(".bottom-nav").getByText(name, { exact: true }).click();
  const full = async (name) => {
    await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 10000 }).catch(() => {});
    await page.evaluate(() => { const c = document.querySelector(".content"); if (c) c.scrollTop = 0; });
    const H = await page.evaluate(() => { const c = document.querySelector(".content"); return c.scrollHeight + (document.querySelector(".phone").offsetHeight - c.clientHeight); });
    await page.setViewportSize({ width: 390, height: Math.max(844, H) }); await pause(300);
    await page.screenshot({ path: `${shots}/${name}.png` });
    await page.setViewportSize({ width: 390, height: 844 }); await pause(200);
    console.log(`NOTE | ${label} ${name}`);
  };
  // the week (G02, 10 min) made in the UI
  await page.evaluate((id) => window.goFiveTimesSitToStandResult(id), faId); await pause();
  await full("05-assessment-result");
  await page.getByRole("button", { name: "查看訓練建議 →" }).click();
  await page.locator(".f01-goal-card", { hasText: "加強整體下肢力量" }).click();
  await page.getByRole("button", { name: "10 分鐘" }).click();
  await page.getByRole("button", { name: "產生訓練建議 →" }).click();
  await page.locator(".f01-rec-hero-title").waitFor({ timeout: 20000 }); await pause(1500);
  await nav("首頁"); await pause(); await full("01-home");
  await nav("訓練"); await pause(); await full("02-training-tab");
  // practice ended early (synthetic knee angles)
  const synthetic = (frames) => { let t = 1000; return frames.map((k) => ({ t: (t += STEP), knee: k })); };
  const s1 = CASES.find((c) => c.id === "S1").frames.slice(6);
  await page.locator(".today-explore-card", { hasText: "坐站練習" }).click();
  await page.locator("#f01FixedRead").check();
  await page.getByRole("button", { name: "開始準備" }).click();
  await page.getByRole("button", { name: "開啟鏡頭" }).click();
  await page.locator(".le05-page[data-fixed-run]").waitFor({ timeout: 20000 });
  await page.evaluate((f) => window.__emulatorFeedFixedPracticeFrames(f), synthetic([...CASES.find((c) => c.id === "S8").frames, ...s1, ...s1]));
  await page.locator("#le05FinishBtn").click();
  await page.locator(".fpr-hero").waitFor({ timeout: 20000 });
  await page.getByText("已同步到雲端").first().waitFor({ timeout: 20000 }); await pause();
  await full("03-practice-result");
  await nav("數據"); await pause(); await full("04-data-overview");
  await page.locator(".patient-data-seg", { hasText: "功能評估" }).click(); await pause(); await full("06-assessment-page");
  await nav("我的"); await pause(); await full("07-profile");
} catch (e) {
  console.log(`ABORT | ${e.message}`);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  vite.kill();
  await env.cleanup();
}
