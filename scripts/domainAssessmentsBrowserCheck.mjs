// Local synthetic verification only. Copy to a QA directory with playwright,
// @firebase/rules-unit-testing and firebase installed. No real accounts / camera measurements.
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, collection, query, where, updateDoc, deleteDoc } from "firebase/firestore";
import { readFileSync, mkdirSync } from "node:fs";
const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("local demo-remotion only");
const base = "http://127.0.0.1:5184", password = "domain-local-test-123", tag = Date.now();
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = fn => env.withSecurityRulesDisabled(c => fn(c.firestore()));
async function account(role, name) {
  const email = `domain-${name}-${tag}@local.test`;
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) });
  const data = await res.json(); assert.ok(data.localId);
  const profile = { id: data.localId, role, name: `合成測試 ${name}`, email, account: email, createdAt: new Date().toISOString() };
  await seed(async db => { await setDoc(doc(db, "users", profile.id), profile); await setDoc(doc(db, "publicUsers", profile.id), profile); });
  return profile;
}
const P = await account("patient", "patient"), T = await account("therapist", "therapist"), O = await account("patient", "outsider");
const relation = { id: `domain-rel-${tag}`, patientId: P.id, therapistId: T.id, status: "accepted", createdAt: new Date().toISOString(), acceptedAt: new Date().toISOString() };
await seed(db => setDoc(doc(db, "therapistPatientRelations", relation.id), relation));
const CLOUD = "domainAssessmentRecords";
const all = async () => { let rows; await seed(async db => { rows = (await getDocs(query(collection(db, CLOUD), where("patientId", "==", P.id)))).docs.map(d => d.data()); }); return rows; };
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const errors = [], contexts = [];
async function login(user, width = 390) {
  const context = await browser.newContext({ viewport: { width, height: 844 } }); contexts.push(context);
  await context.route("**/*", route => ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  const page = await context.newPage(); page.on("pageerror", e => errors.push(e.message));
  page.on("dialog", async d => { console.log(`DIALOG ${d.message()}`); await d.dismiss(); });
  await page.goto(base + "/?emulator=1");
  await page.waitForFunction(() => typeof window.selectAuthRole === "function");
  await page.evaluate(role => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole(role); window.confirmAuthRole(); }, user.role);
  await page.locator("#loginAccount").fill(user.email); await page.locator("#loginPassword").fill(password);
  await page.locator('[onclick="login()"]').click();
  await page.waitForFunction(() => !document.querySelector("#loginAccount"));
  await page.waitForFunction(async () => { const { storageService } = await import("/js/data/storageService.js"); return storageService.getOptionalCloudLoadStatus("domainAssessmentRecords") === "loaded"; }, null, { timeout: 30000 });
  return page;
}
async function enter(page, domain, extra = {}) {
  await page.evaluate(() => window.goFunctionalDomainHome("work"));
  await page.locator(`[data-domain="${domain}"]`).click();
  await page.getByRole("button", { name: "A｜先進行功能評估", exact: true }).click();
  await page.locator("#da-observer").selectOption("helper");
  await page.locator("#da-support").selectOption("none"); await page.locator("#da-pain").selectOption("no");
  if (domain === "F05") { await page.locator("#da-side").selectOption("right"); await page.locator("#da-loadProtocol").selectOption("female"); await page.locator("#da-weightLb").fill("5"); }
  if (domain === "F06") await page.locator("#da-chairHeightCm").fill("43");
  await page.locator("#da-setup").check(); await page.getByRole("button", { name: "進入測試", exact: true }).click();
  assert.ok(await page.locator("#da-timer").isVisible());
}
async function save(page) {
  await page.locator("#da-verified").check();
  await page.getByRole("button", { name: "儲存並查看評估結果", exact: true }).click();
  await page.locator(".da-result").waitFor();
  assert.ok((await page.locator(".da-result").innerText()).includes("已同步"));
}
const shots = `${repo}/reports/domain-assessments-local`; mkdirSync(shots, { recursive: true });
try {
  const page = await login(P);
  await page.clock.install(); // accelerated synthetic protocol clocks, not real clinical/video validation
  await enter(page, "F02");
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "站好、放手並開始計時", exact: true }).click();
    await page.clock.fastForward(10020);
    if (i < 2) await page.getByRole("button", { name: "準備下一階段", exact: true }).click();
  }
  await save(page); assert.match(await page.locator(".da-result").innerText(), /4 分/);
  await page.screenshot({ path: `${shots}/f02-result.png`, fullPage: true });
  console.log("PASS F02 three sequential stages, score 4, cloud save");
  await enter(page, "F03");
  for (const name of ["說開始並啟動計時", "已站起，開始行走", "到 3 公尺線，開始轉身", "已轉身，開始返回", "已返回並坐穩，停止計時"]) {
    await page.getByRole("button", { name, exact: true }).click(); await page.clock.fastForward(1500);
  }
  await save(page); console.log("PASS F03 ordered TUG events and 3m confirmed route");
  await enter(page, "F04");
  for (const [i, ms] of [[1, 5000], [2, 4000]]) {
    await page.getByRole("button", { name: `第 ${i} 次：開始步行並計時`, exact: true }).click(); await page.clock.fastForward(ms);
    await page.getByRole("button", { name: "第一隻腳已完全越過終點，停止", exact: true }).click();
  }
  await save(page); assert.match(await page.locator(".da-result").innerText(), /m\/s/);
  const gaitResult = (await all()).find(r => r.domain === "F04");
  assert.ok(Math.min(...gaitResult.raw.trials) >= 4 && Math.min(...gaitResult.raw.trials) < 4.5);
  console.log("PASS F04 measured 4m, two trials, faster time, calculated m/s");
  await enter(page, "F05"); await page.getByRole("button", { name: "說開始，進行 30 秒測試", exact: true }).click();
  await page.clock.fastForward(30020); await page.locator("#da-observerCount").fill("12"); await save(page);
  assert.match(await page.locator(".da-result").innerText(), /12 次/); console.log("PASS F05 full 30s, observer 12 repetitions, 5lb condition");
  await enter(page, "F06");
  for (const [name, value] of [["left0", "-10"], ["left1", "-8"], ["right0", "0"], ["right1", "3"]]) await page.locator(`#da-${name}`).fill(value);
  await save(page); assert.match(await page.locator(".da-result").innerText(), /左 -8／右 \+3/);
  await page.screenshot({ path: `${shots}/f06-result.png`, fullPage: true }); console.log("PASS F06 signed ruler cm, two trials per side");
  // Fail a stance early: next stages must stay unattempted, never silently zero-measured.
  await enter(page, "F02"); await page.getByRole("button", { name: "站好、放手並開始計時", exact: true }).click(); await page.clock.fastForward(2500);
  await page.getByRole("button", { name: "姿勢破壞／扶物，停止本階段", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "準備下一階段", exact: true }).count(), 0); await save(page);
  assert.ok(await page.locator(".da-comparison").isVisible());
  console.log("PASS failed early balance stage prevents later stages");
  // Incomplete (not a zero-time successful gait test).
  await enter(page, "F04"); await page.getByRole("button", { name: "提前停止，保存未完成紀錄", exact: true }).click(); await page.locator(".da-result").waitFor();
  assert.match(await page.locator(".da-result").innerText(), /未完成/); console.log("PASS incomplete preserved, no fabricated speed");
  // No camera call is required for ruler or observer timers. Test camera fallback separately.
  await enter(page, "F06"); await page.getByRole("button", { name: "開啟相機輔助觀察（選用）", exact: true }).click();
  await page.locator("#da-camera-status").getByText("相機無法使用", { exact: false }).waitFor({ timeout: 10000 });
  await page.getByRole("button", { name: "提前停止，保存未完成紀錄", exact: true }).click(); await page.locator(".da-result").waitFor();
  console.log("PASS camera failure leaves observer flow available and result incomplete");
  await enter(page, "F05"); await page.getByRole("button", { name: "說開始，進行 30 秒測試", exact: true }).click();
  await page.clock.fastForward(1000);
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { value: true, configurable: true }); document.dispatchEvent(new Event("visibilitychange")); Object.defineProperty(document, "hidden", { value: false, configurable: true }); });
  assert.match(await page.locator(".da-timer-card").innerText(), /測驗已中斷/);
  await page.getByRole("button", { name: "提前停止，保存未完成紀錄", exact: true }).click(); await page.locator(".da-result").waitFor();
  assert.match(await page.locator(".da-result").innerText(), /未完成/);
  console.log("PASS background interruption invalidates timed arm test rather than filling 30 seconds");
  for (const width of [320, 390, 430, 1280]) {
    await page.setViewportSize({ width, height: 844 }); await page.evaluate(() => window.goFunctionalDomainHome());
    assert.equal(await page.locator('.domain-primary[data-domain]').count(), 6);
    assert.ok(!(await page.locator(".phone").innerText()).includes("尚未開放"));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.ok(await page.locator('.domain-primary[data-domain="F02"] .domain-primary-text').evaluate(el => getComputedStyle(el).gridColumnStart === "2" && el.getBoundingClientRect().width > 80), "missing icon must not push text into the narrow icon column");
  }
  await page.screenshot({ path: `${shots}/six-domains.png`, fullPage: true }); console.log("PASS six clickable domains and 320/390/430/1280 no horizontal overflow");
  await page.locator('[data-domain="F01"]').click();
  await page.getByText("F01 下肢功能", { exact: true }).waitFor();
  assert.ok(await page.getByText("坐站練習", { exact: true }).count());
  await page.evaluate(() => window.goDomainAssessmentHome("F05"));
  await page.getByRole("button", { name: "B｜直接開始訓練", exact: true }).click();
  assert.ok(await page.locator(".exercise-grid .sp-card").count());
  await page.locator(".exercise-grid .sp-card").first().click();
  assert.ok((await page.locator(".phone").innerText()).includes("肘屈伸"));
  console.log("PASS F01 original home and new-domain direct training route");
  const device2 = await login(P, 430); await device2.evaluate(() => window.goDomainAssessmentHome("F06"));
  assert.match(await device2.locator(".da-latest").innerText(), /最近一次/);
  assert.ok((await all()).length >= 8); console.log("PASS second device cloud hydration");
  const therapist = await login(T, 1280); await therapist.evaluate(id => window.goCaseDetail(id, "assessment"), P.id);
  await therapist.getByText("其他五構面評估", { exact: true }).waitFor();
  assert.equal(await therapist.locator(".da-readonly").count(), 5); console.log("PASS linked therapist reads five domains on desktop");
  const rows = await all(), valid = rows.find(r => r.domain === "F05"), ref = id => doc(env.authenticatedContext(id).firestore(), CLOUD, valid.id);
  await assertSucceeds(getDoc(ref(P.id))); await assertSucceeds(getDoc(ref(T.id))); await assertFails(getDoc(ref(O.id)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), CLOUD, valid.id)));
  await assertFails(updateDoc(ref(P.id), { "raw.observerCount": 99 })); await assertFails(deleteDoc(ref(P.id)));
  await assertFails(updateDoc(ref(T.id), { "raw.observerCount": 99 }));
  await assertFails(setDoc(doc(env.authenticatedContext(O.id).firestore(), CLOUD, valid.id), valid));
  await seed(db => updateDoc(doc(db, "therapistPatientRelations", relation.id), { status: "ended" })); await assertFails(getDoc(ref(T.id)));
  console.log("PASS Firestore owner/accepted-relation read, stranger/anonymous denied, immutable measurements, no delete, revoked relation denied");
  await enter(device2, "F06");
  for (const name of ["left0", "left1", "right0", "right1"]) await device2.locator(`#da-${name}`).fill("0");
  await device2.locator("#da-verified").check(); await device2.getByRole("button", { name: "儲存並查看評估結果", exact: true }).click(); await device2.locator(".da-result").waitFor();
  assert.match(await device2.locator(".da-result").innerText(), /同步失敗/);
  const countBeforeRetry = (await all()).length;
  await seed(db => updateDoc(doc(db, "therapistPatientRelations", relation.id), { status: "accepted" }));
  await device2.getByRole("button", { name: "重試同步同一筆紀錄", exact: true }).click();
  await device2.locator(".da-result").getByText("已同步", { exact: false }).waitFor();
  assert.equal((await all()).length, countBeforeRetry + 1);
  await device2.getByRole("button", { name: "查看歷史紀錄", exact: true }).click();
  assert.ok(await device2.locator(".da-history").count());
  console.log("PASS failed cloud save visible, same-record retry persists once, history retained");
  assert.deepEqual(errors, []); console.log("PASS no browser page errors");
} finally { for (const context of contexts) await context.close(); await browser.close(); await env.cleanup(); }
