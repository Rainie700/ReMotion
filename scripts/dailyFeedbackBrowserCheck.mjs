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
  await p1.getByRole("button", { name: "回報今日感受", exact: true }).click();
  assert.equal(await p1.locator("#dailyFeedbackDiscomfort").inputValue(), "");
  await p1.locator("#dailyFeedbackEffort").selectOption("unknown");
  await p1.locator("#dailyFeedbackDiscomfort").selectOption("unknown");
  await p1.getByRole("button", { name: "儲存今日回報", exact: true }).click();
  await p1.getByText("已儲存今日回報；修改前的回報也會保留。", { exact: true }).waitFor();
  const dateKey = await p1.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; });
  const read = async () => { let data; await seed(async db => { data = (await getDoc(doc(db, "dailyTrainingFeedback", `${patient.id}_${dateKey}`))).data(); }); return data; };
  assert.equal((await read()).revision, 1);
  console.log("PASS | mobile-width patient creates explicit unknown report through real UI and transaction");
  const p2 = await login(patient);
  await p2.getByRole("button", { name: "修改今日回報", exact: true }).click();
  await p2.locator("#dailyFeedbackNote").fill("另一裝置尚未儲存的內容");
  await p1.getByRole("button", { name: "修改今日回報", exact: true }).click();
  await p1.locator("#dailyFeedbackEffort").selectOption("somewhat_hard");
  await p1.locator("#dailyFeedbackDiscomfort").selectOption("yes");
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
  console.log("PASS | linked therapist sees cloud-loaded report and correction history in case overview");
  assert.deepEqual(errors, []);
  console.log("PASS | no page errors or dialogs; requests restricted to local Auth, Firestore and Vite; no camera or Gemini");
} finally {
  await browser?.close(); vite.kill("SIGTERM"); await env.cleanup();
}
