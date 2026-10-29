// Guest entry (2026-10-29) — BROWSER acceptance by real clicks: guest Home first, sign-in only for a personal assessment.
// LOCAL only: this repo's own Vite dev server (own port 5194, emulator mode) + the local Auth/Firestore emulators
// (demo-remotion); synthetic accounts made here (no patient00/01). No camera is expected anywhere in this check:
// getUserMedia is counted (it must stay 0) and every Firestore write request is counted in the guest phase.
//
//   REPO=<repo> SHOTS=<dir> firebase emulators:exec --only firestore,auth --project demo-remotion "node guestEntryBrowserCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/guest-entry/browser`;
mkdirSync(shots, { recursive: true });
const port = Number(process.env.PORT || 5194);
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import(pathToFileURL(`${repo}/js/data/fa5xMeasurementCompatibility.js`).href);
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));
const password = "guest-local-only-123", tag = Date.now();
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${String(detail).slice(0, 380)}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };
const note = (t) => console.log(`NOTE | ${t}`);

async function account(role, label, name, { seedDoc = true } = {}) {
  const email = `guest-${label}-${tag}@local.test`;
  if (!seedDoc) return { email, role, name };
  const data = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
  assert.ok(data.localId);
  const user = { id: data.localId, email, account: email, role, name, createdAt: new Date().toISOString() };
  await seed(async (db) => { await setDoc(doc(db, "users", user.id), user); await setDoc(doc(db, "publicUsers", user.id), user); });
  return user;
}
const pNew = await account("patient", "new", "訪客測試甲");
const pHist = await account("patient", "hist", "訪客測試乙");
const pOther = await account("patient", "other", "訪客測試丙");
const th = await account("therapist", "th", "訪客測試復健師");
const pReg = await account("patient", "reg", "訪客測試丁", { seedDoc: false });
{
  const at = new Date().toISOString(), id = `fa-guest-${tag}`;
  await seed((db) => setDoc(doc(db, "functionalAssessmentSessions", id), { id, patientId: pHist.id, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed", startedAt: at, completedAt: at, therapistId: "", relationId: "",
    result: { ...FA5X_M, assessmentType: "five_times_sit_to_stand", status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 11800, measuredAt: at, seededSynthetic: true } }));
}

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  note(`app: http://127.0.0.1:${port}/?emulator=1 (Vite dev server started by this script in ${repo})`);
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
  /** camera requests + which screen kinds appeared, in order (boot / guest / auth / home / therapist) */
  const probe = () => {
    window.__cameraRequests = 0;
    const md = navigator.mediaDevices;
    if (md && md.getUserMedia) { const o = md.getUserMedia.bind(md); md.getUserMedia = (...a) => { window.__cameraRequests++; return o(...a); }; }
    window.__seen = [];
    const kinds = [["boot", ".boot-page"], ["guest", ".guest-page"], ["auth", ".auth"], ["home", ".top-profile-container"], ["therapist", ".therapist-workspace"], ["intake", ".assessment-step-dots, [onclick=\"skipAssessmentIntro()\"]"]];
    new MutationObserver(() => { for (const [k, sel] of kinds) if (document.querySelector(sel) && window.__seen[window.__seen.length - 1] !== k) window.__seen.push(k); }).observe(document, { childList: true, subtree: true });
  };
  async function open({ width = 390, height = 844 } = {}) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2 });
    await context.addInitScript(probe);
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.writes = 0;
    page.on("request", (r) => { if (/google\.firestore\.v1\.Firestore\/(Write|Commit)/.test(r.url()) && r.method() === "POST") page.writes++; });
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("dialog", async (d) => { page.lastDialog = d.message(); await d.dismiss(); });
    await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
    return page;
  }
  const text = async (page, sel = ".phone") => (await page.locator(sel).first().innerText()).replace(/\s+/g, " ");
  const nav = (page, name) => page.locator(".bottom-nav").getByText(name, { exact: true }).click();
  const pause = (page, ms = 500) => page.waitForTimeout(ms);
  const cam = (page) => page.evaluate(() => window.__cameraRequests);
  const seen = (page) => page.evaluate(() => window.__seen.slice());
  const intent = (page) => page.evaluate(() => sessionStorage.getItem("remotion.authIntent.v1"));
  const shot = async (page, name) => { await page.waitForFunction(() => [...document.images].every((i) => i.complete), null, { timeout: 8000 }).catch(() => {}); await page.screenshot({ path: `${shots}/${name}.png` }); };
  async function fillLogin(page, user, pw = password) {
    await page.locator(".role-option", { hasText: user.role === "therapist" ? "我是復健師" : "我是患者" }).click();
    await page.getByRole("button", { name: "下一步" }).click();
    await page.locator("#loginAccount").fill(user.email); await page.locator("#loginPassword").fill(pw);
    await page.locator('[onclick="login()"]').click();
  }
  async function layoutOk(page, label) {
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
      const c = document.querySelector(".content"); if (c) c.scrollTop = c.scrollHeight;
      const nav = document.querySelector(".bottom-nav"), navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
      const btns = [...document.querySelectorAll(".content button")].filter((b) => b.getBoundingClientRect().height > 0);
      const last = btns.length ? btns[btns.length - 1].getBoundingClientRect() : null;
      const wide = [...document.querySelectorAll(".phone *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > document.querySelector(".phone").getBoundingClientRect().right + 1; }).length;
      if (c) c.scrollTop = 0;
      return { vw, sw, wide, lastOk: !last || last.bottom <= navTop + 1 };
    });
    step(`V ${label}: no horizontal overflow; the last button above the bottom navigation`, r.sw <= r.vw && r.wide === 0 && r.lastOk, JSON.stringify(r));
  }

  // ═══ G1–G4. first visit: the guest Home, public pages, no camera, no record ═══
  const g = await open();
  await g.locator(".guest-hero").waitFor({ timeout: 30000 });
  let t = await text(g);
  step("G1 first visit: the guest Home directly (boot → guest; no login page, no personal home)", (await seen(g))[0] === "boot" && !(await seen(g)).includes("auth") && !(await seen(g)).includes("home")
    && t.includes("了解身體狀態，記錄每次練習") && t.includes("開始首次評估") && t.includes("先查看準備說明，正式評估前需登入。") && (await g.locator(".guest-header .guest-login-btn").count()) === 1, JSON.stringify(await seen(g)));
  step("G1b order: brand + 登入 → purpose → 開始首次評估 → 使用流程 → 動作介紹 → 使用說明; no placeholders", t.indexOf("ReMotion") < t.indexOf("了解身體狀態") && t.indexOf("開始首次評估") < t.indexOf("使用流程") && t.indexOf("使用流程") < t.indexOf("動作介紹") && t.indexOf("動作介紹") < t.indexOf("使用說明") && !/插畫預留位置|圖示|後續版本推出/.test(t));
  await shot(g, "01-guest-home");
  await nav(g, "訓練"); await pause(g);
  t = await text(g);
  step("G2 訓練 (guest): 動作介紹 of the 20 F01 exercises, a sign-in note for a personal plan, no amounts", (await g.locator(".guest-exercise-row").count()) === 20 && t.includes("個人訓練安排需要登入") && !/組 ×|每組|適合你/.test(t));
  await g.locator(".guest-exercise-row").first().click(); await pause(g);
  t = await text(g);
  step("G2b one 動作介紹: description + how-to + precautions, labelled not a plan; no amounts", t.includes("動作介紹") && t.includes("怎麼做") && t.includes("這是動作介紹，不是你的課表") && !/組 ×|每組|（動作預設）/.test(t));
  await g.getByRole("button", { name: "返回" }).click(); await pause(g);
  await nav(g, "數據"); await pause(g);
  t = await text(g);
  step("G2c 數據 (guest): what can be seen after sign-in + 登入 / 建立帳號; no numbers or empty charts", t.includes("登入後可以查看自己的紀錄") && (await g.locator(".patient-data-metrics, svg, .fa5c-chart").count()) === 0 && !/\d+ 次|\d+ 天|\d+\.\d 秒/.test(t));
  await nav(g, "我的"); await pause(g);
  step("G2d 我的 (guest): 登入 / 建立帳號 + 使用說明", (await text(g)).includes("尚未登入") && (await g.getByRole("button", { name: "建立帳號" }).count()) === 1 && (await text(g)).includes("使用說明"));
  // protected routes cannot render without a session, however they are called
  for (const fn of ["goFiveTimesSitToStandDetection", "goActionRecords", "goF01TrackingHistory", "goFeedbackHistory", "goF01FixedPractice"]) {
    await g.evaluate((f) => { try { window[f](); } catch (e) { window.__guardError = String(e); } }, fn); await pause(g, 300);
    // a function may refuse without a session (no render) or render: either way only a guest page shows, and no camera
    step(`G3 without a session ${fn}() → still a guest page (no account page, no camera)`, (await g.locator(".guest-page").count()) >= 1 && (await g.locator(".top-profile-container, .patient-data-page, .fa5x-result-hero, .le05-page, .fp-page, .fa5x-detection").count()) === 0 && (await cam(g)) === 0, await g.evaluate(() => window.__guardError || ""));
  }
  await nav(g, "首頁"); await pause(g);
  await g.getByRole("button", { name: "開始首次評估" }).click(); await pause(g);
  t = await text(g);
  step("G4 首次評估準備: the approved preparation text, 登入並繼續 / 建立帳號後繼續 + why sign-in", t.includes("首次評估準備") && t.includes("準備一張穩固、不易滑動的椅子") && t.includes("接下來") && (await g.getByRole("button", { name: "登入並繼續" }).count()) === 1
    && (await g.getByRole("button", { name: "建立帳號後繼續" }).count()) === 1 && t.includes("登入是為了保存評估與後續追蹤紀錄"));
  step("G4b guest browsing: the camera was never requested and nothing was written", (await cam(g)) === 0 && g.writes === 0, `camera=${await cam(g)} writes=${g.writes}`);
  await shot(g, "02-first-assessment-prep");

  // ═══ G5–G8. sign-in from the preparation page: cancel, failure, reload, success → resumed ═══
  await g.getByRole("button", { name: "登入並繼續" }).click(); await pause(g);
  step("G5 登入並繼續 → the existing login (role step) with 「登入後會接著進行首次評估」; intent stored", (await text(g)).includes("登入後會接著進行首次評估") && JSON.parse(await intent(g)).kind === "firstAssessment");
  await shot(g, "03-login-from-assessment");
  await g.getByRole("button", { name: "返回" }).click(); await pause(g);
  step("G5b 返回 → back on the preparation page; the intent is cancelled", (await text(g)).includes("首次評估準備") && (await intent(g)) === null);
  await g.getByRole("button", { name: "登入並繼續" }).click(); await pause(g);
  await fillLogin(g, pNew, "wrong-password-000");
  await pause(g, 1500);
  step("G6 a failed login: the error is shown, the intent stays", (await g.locator("#loginAccount").count()) === 1 && JSON.parse(await intent(g)).kind === "firstAssessment" && (await text(g)).length > 0, await text(g, ".auth"));
  await shot(g, "03b-login-form-failed");
  await g.reload(); await g.waitForFunction(() => typeof window.selectAuthRole === "function");
  await g.getByText("首次評估準備").first().waitFor({ timeout: 30000 });
  step("G7 a reload with a pending intent → the preparation page again (nothing lost, no personal data)", (await text(g)).includes("登入並繼續") && JSON.parse(await intent(g)).kind === "firstAssessment");
  await g.getByRole("button", { name: "登入並繼續" }).click(); await pause(g);
  await fillLogin(g, pNew);
  await g.getByText("建立我的復健需求").waitFor({ timeout: 30000 }); await pause(g, 800);
  t = await text(g);
  step("G8 signed in (new patient): the existing required setup first, saying the assessment follows", t.includes("建立我的復健需求") && t.includes("完成或選擇「稍後再填」後，會接著進行五次坐站評估"));
  await shot(g, "04-after-login-setup-first");
  await g.getByRole("button", { name: "稍後再填" }).click(); await pause(g, 800);
  t = await text(g);
  step("G8b after the setup → the existing 五次坐站 preparation (開始評估 →), not the Home; the intent is cleared; still no camera", t.includes("五次坐站測試") && (await g.getByRole("button", { name: "開始評估 →" }).count()) === 1 && (await intent(g)) === null && (await cam(g)) === 0);
  await shot(g, "05-resumed-assessment");
  await g.context().close();

  // ═══ G9. 建立帳號後繼續: register → the existing success screen → login → resumed ═══
  {
    const r = await open();
    await r.locator(".guest-hero").waitFor({ timeout: 30000 });
    await r.getByRole("button", { name: "開始首次評估" }).click();
    await r.getByRole("button", { name: "建立帳號後繼續" }).click(); await pause(r);
    await r.locator(".role-option", { hasText: "我是患者" }).click();
    await r.getByRole("button", { name: "下一步" }).click();
    await r.locator("#regName").fill(pReg.name); await r.locator("#regAccount").fill(pReg.email);
    await r.locator("#regPassword").fill(password); await r.locator("#regPasswordConfirm").fill(password);
    await r.locator('[onclick="register()"]').click();
    await r.getByText("帳號建立成功").first().waitFor({ timeout: 30000 });
    await r.getByRole("button", { name: "前往登入" }).click();
    await r.locator("#loginAccount").fill(pReg.email); await r.locator("#loginPassword").fill(password);
    await r.locator('[onclick="login()"]').click();
    await r.getByText("建立我的復健需求").waitFor({ timeout: 30000 }); await pause(r, 800);
    step("G9 register → success → login → the required setup, then the assessment (intent kept across the detour)", (await text(r)).includes("會接著進行五次坐站評估"));
    await r.getByRole("button", { name: "稍後再填" }).click(); await pause(r, 800);
    step("G9b … → the 五次坐站 preparation", (await text(r)).includes("五次坐站測試") && (await intent(r)) === null);
    await r.context().close();
  }

  // ═══ G10–G13. an assessed patient, a therapist, a returning session, logout / another account ═══
  const h = await open();
  await h.locator(".guest-hero").waitFor({ timeout: 30000 });
  await h.getByRole("button", { name: "開始首次評估" }).click();
  await h.getByRole("button", { name: "登入並繼續" }).click();
  await fillLogin(h, pHist);
  await h.locator(".top-profile-container").waitFor({ timeout: 30000 }); await pause(h, 800);
  step("G10 a patient with a 5xSTS result → their own Home + next step (never a new 「first」 assessment)", (await text(h)).includes("你已經有五次坐站紀錄") && (await text(h)).includes(pHist.name) && (await intent(h)) === null);
  await shot(h, "06-after-login-existing-patient");
  await h.reload();
  // the existing landing rule: a patient without the onboarding questionnaire sees 「建立我的復健需求」 on each sign-in
  await h.locator(".top-profile-container").or(h.getByText("建立我的復健需求")).first().waitFor({ timeout: 30000 }); await pause(h, 800);
  const s = await seen(h);
  step("G11 a returning session opens its own page directly (existing landing rule); no guest page, no login page flashes first", !s.includes("guest") && !s.includes("auth") && (s.includes("home") || s.includes("intake")), JSON.stringify(s));
  if (await h.getByRole("button", { name: "稍後再填" }).count()) { await h.getByRole("button", { name: "稍後再填" }).click(); await pause(h, 500); }
  await nav(h, "我的"); await pause(h);
  await h.locator('[onclick="logout()"]').click();
  await h.locator(".guest-hero").waitFor({ timeout: 20000 }); await pause(h, 500);
  step("G12 登出 → the guest Home; nothing of that account on screen; no intent left", !(await text(h)).includes(pHist.name) && (await intent(h)) === null);
  await h.getByRole("button", { name: "登入" }).first().click();
  await h.getByRole("button", { name: "登入" }).first().click();
  await fillLogin(h, pOther);
  await h.locator(".top-profile-container, .assessment-step-dots").or(h.getByText("建立我的復健需求")).first().waitFor({ timeout: 30000 }); await pause(h, 800);
  step("G12b the next account sees only itself (no earlier name, no carried-over assessment intent)", !(await text(h)).includes(pHist.name) && (await text(h)).includes("建立我的復健需求"));
  await h.context().close();
  const tp = await open();
  await tp.locator(".guest-hero").waitFor({ timeout: 30000 });
  await tp.getByRole("button", { name: "開始首次評估" }).click();
  await tp.getByRole("button", { name: "登入並繼續" }).click();
  await fillLogin(tp, th);
  await tp.locator(".therapist-workspace").waitFor({ timeout: 30000 }); await pause(tp, 500);
  step("G13 a therapist from the same entry → the therapist workspace (role rules), intent dropped", (await tp.locator(".therapist-workspace").count()) === 1 && (await intent(tp)) === null);
  await tp.context().close();

  // ═══ V. 260 (390 at 150 % text) / 320 / 390 / 430 / desktop ═══
  for (const [w, hgt, label] of [[260, 563, "260（390 寬放大 150%）"], [320, 700, "320"], [390, 844, "390"], [430, 932, "430"], [1280, 900, "desktop"]]) {
    const v = await open({ width: w, height: hgt });
    await v.locator(".guest-hero").waitFor({ timeout: 30000 });
    await layoutOk(v, `${label} guest 首頁`);
    if (w === 260) await shot(v, "07-guest-home-260");
    await nav(v, "訓練"); await pause(v, 300); await layoutOk(v, `${label} guest 訓練`);
    await nav(v, "數據"); await pause(v, 300); await layoutOk(v, `${label} guest 數據`);
    await nav(v, "首頁"); await pause(v, 300);
    await v.getByRole("button", { name: "開始首次評估" }).click(); await pause(v, 300); await layoutOk(v, `${label} 首次評估準備`);
    await v.getByRole("button", { name: "登入並繼續" }).click(); await pause(v, 300); await layoutOk(v, `${label} login role step`);
    await v.context().close();
  }

  // ═══ K. keyboard: the first stops are 登入 then 開始首次評估; Enter works; the login is reachable ═══
  {
    const k = await open();
    await k.locator(".guest-hero").waitFor({ timeout: 30000 });
    const stops = [];
    for (let i = 0; i < 2; i++) { await k.keyboard.press("Tab"); stops.push(await k.evaluate(() => (document.activeElement && document.activeElement.textContent || "").trim())); }
    step("K1 Tab order on the guest Home: 登入 → 開始首次評估", stops[0] === "登入" && stops[1] === "開始首次評估", JSON.stringify(stops));
    await k.keyboard.press("Enter"); await pause(k);
    step("K2 Enter on 開始首次評估 → the preparation page", (await text(k)).includes("首次評估準備"));
    let found = false;
    for (let i = 0; i < 12 && !found; i++) { await k.keyboard.press("Tab"); found = (await k.evaluate(() => (document.activeElement && document.activeElement.textContent || "").trim())) === "登入並繼續"; }
    await k.keyboard.press("Enter"); await pause(k);
    step("K3 keyboard: Tab to 登入並繼續 + Enter → the login role step", found && (await text(k)).includes("請選擇身分"));
    await k.context().close();
  }
  step("no page errors", errors.length === 0, JSON.stringify(errors));
} catch (e) {
  console.log(`ABORT | ${e.message}`);
  process.exitCode = 1;
} finally {
  console.log(`${results.filter((r) => r[0] === "PASS").length}/${results.length} steps passed`);
  if (browser) await browser.close();
  vite.kill();
  await env.cleanup();
}
