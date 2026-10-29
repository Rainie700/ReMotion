// 「探索與練習」(訓練 tab) and 「功能構面」 — size / alignment / closed-item check (2026-10-29). LOCAL only: own Vite port 5195
// in emulator mode + the local Auth/Firestore emulators (demo-remotion); one synthetic patient made here.
//
// Three size methods, reported separately (never mixed up):
//   viewport      the window is 260 / 320 / 390 / 430 / 1280 CSS px wide at pixel ratio 2 — a narrow window only;
//   sim zoom      a SIMULATION of page zoom on a 390 × 844 window: Chromium zoom gives a CSS viewport of 390 ÷ z and a pixel
//                 ratio of 2 × z (150 % → 260 × 563 @3, 200 % → 195 × 422 @4). Real browser zoom (menu / Ctrl +) is NOT verified:
//                 headless Chromium cannot drive it. (CSS `zoom` on the root does not reflow like it — tried, rejected.)
//   text ×1.5     a 390-px window where every element's font size is × 1.5 (as an OS text-size setting), layout width unchanged.
//
//   REPO=<repo> SHOTS=<dir> firebase emulators:exec --only firestore,auth --project demo-remotion "node domainExploreSizeCheck.mjs"
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc } from "firebase/firestore";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";

const repo = process.env.REPO;
if (!repo || process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Local demo-remotion only");
const shots = process.env.SHOTS || `${repo}/reports/guest-entry/size`;
mkdirSync(shots, { recursive: true });
const port = Number(process.env.PORT || 5195);
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(`${repo}/firestore.rules`, "utf8") } });
const password = "size-local-only-123", tag = Date.now();
const email = `size-${tag}@local.test`;
const acct = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-local-emulator-key", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, returnSecureToken: true }) })).json();
assert.ok(acct.localId);
const P = { id: acct.localId, email, account: email, role: "patient", name: "尺寸測試", createdAt: new Date().toISOString() };
await env.withSecurityRulesDisabled(async (ctx) => { const db = ctx.firestore(); await setDoc(doc(db, "users", P.id), P); await setDoc(doc(db, "publicUsers", P.id), P); });
const results = [];
const step = (name, ok, detail = "") => { results.push([ok ? "PASS" : "FAIL", name, detail]); console.log(`${ok ? "PASS" : "FAIL"} | ${name}${detail ? ` | ${String(detail).slice(0, 420)}` : ""}`); if (!ok) throw Error(`${name}: ${detail}`); };

const vite = spawn(process.execPath, [`${repo}/node_modules/vite/bin/vite.js`, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: repo, stdio: "ignore" });
let browser;
const errors = [];
try {
  for (let i = 0; i < 200; i++) { try { if ((await fetch(`http://127.0.0.1:${port}`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  async function login(width, height, dsf = 2) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dsf });
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${port}/?emulator=1`);
    await page.waitForFunction(() => typeof window.selectAuthRole === "function");
    await page.evaluate(() => { window.goAuth(); window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
    await page.locator("#loginAccount").fill(email); await page.locator("#loginPassword").fill(password);
    await page.locator('[onclick="login()"]').click();
    await page.getByText("建立我的復健需求").or(page.locator(".top-profile-container")).first().waitFor({ timeout: 30000 });
    if (await page.getByRole("button", { name: "稍後再填" }).count()) await page.getByRole("button", { name: "稍後再填" }).click();
    await page.locator(".top-profile-container").waitFor({ timeout: 20000 });
    return page;
  }
  /** text-only enlargement: each element's own font size × factor, once per page render */
  const enlargeText = (page, factor) => page.evaluate((k) => { if (k === 1) return; for (const e of document.querySelectorAll(".phone *")) { if (e.dataset.tx) continue; e.dataset.tx = "1"; e.style.fontSize = `${parseFloat(getComputedStyle(e).fontSize) * k}px`; } }, factor);
  /** cards of one grid: rows aligned (same top in a row, same height), nothing clipped, no page overflow */
  const measure = (page, gridSel, cardSel) => page.evaluate(({ gridSel, cardSel }) => {
    const grid = document.querySelector(gridSel);
    const cards = [...document.querySelectorAll(cardSel)].map((e) => { const b = e.getBoundingClientRect(); return { top: Math.round(b.top), left: Math.round(b.left), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; });
    const rows = {};
    for (const c of cards) (rows[c.top] = rows[c.top] || []).push(c);
    const rowList = Object.values(rows);
    const heights = new Set(cards.map((c) => c.h));
    const clipped = [...grid.querySelectorAll("*")].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== "visible").length
      + [...grid.querySelectorAll("b, span")].filter((e) => { const b = e.getBoundingClientRect(), g = grid.getBoundingClientRect(); return b.width > 0 && (b.right > g.right + 1 || b.left < g.left - 1); }).length;
    const gb = grid.getBoundingClientRect();
    return { cards: cards.length, columns: Math.max(...rowList.map((r) => r.length)), rowsAligned: rowList.every((r) => new Set(r.map((c) => c.h)).size === 1), equalHeights: heights.size === 1, heights: [...heights], clipped,
      inGrid: cards.every((c) => c.left >= Math.round(gb.left) - 1 && c.right <= Math.round(gb.right) + 1), sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth };
  }, { gridSel, cardSel });
  // [label, width, height, pixel ratio, text factor]
  /** no horizontal page overflow, nothing pushed past the phone edge, the page's last button above the bottom nav */
  const pageFits = (pg) => pg.evaluate(() => {
    const vw = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
    const phone = document.querySelector(".phone").getBoundingClientRect();
    const wide = [...document.querySelectorAll(".phone *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > phone.right + 1 && !e.closest(".fa5c-scroll, .week-strip, .records-views, .patient-data-seg-nav"); }).length;
    const c = document.querySelector(".content"); if (c) c.scrollTop = c.scrollHeight;
    const nav = document.querySelector(".bottom-nav"), navTop = nav ? nav.getBoundingClientRect().top : innerHeight;
    const btns = [...document.querySelectorAll(".content button")].filter((b) => b.getBoundingClientRect().height > 0 && !b.closest("details:not([open])"));
    const last = btns.length ? btns[btns.length - 1].getBoundingClientRect() : null;
    const ok = sw <= vw && wide === 0 && (!last || last.bottom <= navTop + 1);
    if (c) c.scrollTop = 0;
    const culprits = [...document.querySelectorAll(".phone *")].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.right > phone.right + 1; }).slice(0, 3).map((e) => `${e.tagName}.${e.className}`);
    return { ok, detail: JSON.stringify({ vw, sw, wide, culprits, last: last && Math.round(last.bottom), navTop: Math.round(navTop) }) };
  });
  // [label, width, height, pixel ratio, text factor] — "sim zoom" = a narrow CSS window + a higher pixel ratio (what
  // Chromium's page zoom produces); it is a SIMULATION — real browser zoom (menu / Ctrl +) is not verified here
  const variants = [["viewport 260", 260, 563, 2, 1], ["viewport 320", 320, 700, 2, 1], ["viewport 390", 390, 844, 2, 1], ["viewport 430", 430, 932, 2, 1], ["viewport 1280", 1280, 900, 2, 1],
    ["sim zoom 150%（CSS 260×563 @3）", 260, 563, 3, 1], ["sim zoom 200%（CSS 195×422 @4）", 195, 422, 4, 1], ["text ×1.5（390 視窗）", 390, 844, 2, 1.5]];
  const name = (label) => label.replace(/[^\w%]+/g, "_");
  let page;
  for (const [label, w, h, dsf, z] of variants) {
    if (page) await page.context().close();
    page = await login(w, h, dsf);
    await page.locator(".bottom-nav").getByText("訓練", { exact: true }).click();
    await enlargeText(page, z); await page.waitForTimeout(300);
    await page.locator(".today-explore").scrollIntoViewIfNeeded();
    const ex = await measure(page, ".today-explore", ".today-explore-card");
    // two columns at normal text on a 390+ px window; one column with enlarged text (no smaller text, no cropping)
    const wantCols = z > 1 ? 1 : w >= 390 && dsf === 2 ? 2 : null;
    step(`E ${label} 探索與練習: 2 equal cards${wantCols ? `, ${wantCols} column(s)` : ""}, inside the grid, nothing clipped, no page overflow`, ex.cards === 2 && ex.rowsAligned && ex.equalHeights && ex.inGrid && ex.clipped === 0 && ex.sw <= ex.vw && (!wantCols || ex.columns === wantCols), JSON.stringify(ex));
    const empty = await page.evaluate(() => (document.querySelector(".today-plan-page").innerText.match(/沒有指定訓練/g) || []).length);
    step(`E ${label} 「沒有指定訓練」 said once (the 今日任務 empty state); the date stays on top`, empty === 1 && (await page.locator(".today-overview .patient-training-date").count()) === 1, String(empty));
    await page.evaluate(() => document.querySelector(".today-explore").closest(".today-section").scrollIntoView({ block: "start" }));
    await page.screenshot({ path: `${shots}/explore-${name(label)}.png` });
    if (w === 390 && z === 1) { await page.evaluate(() => { const c = document.querySelector(".content"); if (c) c.scrollTop = 0; }); await page.screenshot({ path: `${shots}/training-top-390.png` }); }
    await page.locator(".today-explore-card", { hasText: "功能評估與練習" }).click();
    await page.locator(".domain-primary").waitFor();
    await enlargeText(page, z); await page.waitForTimeout(300);
    const dp = await page.evaluate(() => {
      const p = document.querySelector(".domain-primary"), d = document.querySelector(".domain-closed");
      const visibleClosed = [...document.querySelectorAll(".domain-closed-list li")].filter((li) => li.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true })).length // closed <details> content is content-visibility:hidden (a box size is not proof of being seen);
      return { primaryTag: p.tagName, primaryText: p.innerText.replace(/\s+/g, " "), dataDomain: p.dataset.domain, open: d.open, summary: d.querySelector("summary").innerText.trim(), visibleClosed, intro: document.querySelector(".body-region-intro").innerText.trim() };
    });
    step(`D ${label} 功能構面: 下肢功能 is the primary button (code kept as data, not as the title); the other 5 closed by default`, dp.primaryTag === "BUTTON" && dp.primaryText.startsWith("下肢功能") && !/F0\d/.test(dp.primaryText) && dp.dataDomain === "F01" && !dp.open && dp.visibleClosed === 0
      && dp.summary === "其他構面・尚未開放（5）" && dp.intro === "目前可進行下肢功能評估與練習", JSON.stringify(dp));
    { const fit = await pageFits(page); step(`D ${label} 功能構面 (collapsed): no page overflow, the last button above the bottom nav`, fit.ok, fit.detail); }
    await page.evaluate(() => { const c = document.querySelector(".content"); if (c) c.scrollTop = 0; });
    await page.screenshot({ path: `${shots}/domains-collapsed-${name(label)}.png` });
    await page.locator(".domain-closed > summary").click(); await page.waitForTimeout(300);
    const closed = await page.evaluate(() => {
      const lum = (c) => { const [r, g, b] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
      const bgOf = (e) => { for (let n = e; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return "rgb(255, 255, 255)"; };
      return [...document.querySelectorAll(".domain-closed-list li")].map((e) => {
        const nm = e.querySelector(".body-region-name"), soon = e.querySelector(".body-region-soon"), b = e.getBoundingClientRect();
        return { visible: b.height > 0 && e.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true }), name: nm.textContent.trim(), focusable: e.tabIndex >= 0 || !!e.querySelector("button, a, [tabindex]"), onclick: !!e.getAttribute("onclick"), label: soon.textContent.trim(),
          nameContrast: +ratio(getComputedStyle(nm).color, bgOf(nm)).toFixed(2), labelContrast: +ratio(getComputedStyle(soon).color, bgOf(soon)).toFixed(2) };
      });
    });
    step(`D ${label} expanded: the 5 names + 尚未開放 visible, readable (≥ 4.5:1), not clickable / not focusable`, closed.length === 5 && closed.every((c) => c.visible && c.name && !/F0\d/.test(c.name) && !c.focusable && !c.onclick && c.label === "尚未開放" && c.nameContrast >= 4.5 && c.labelContrast >= 4.5), JSON.stringify(closed));
    { const fit = await pageFits(page); step(`D ${label} 功能構面 (expanded): no page overflow, the last button above the bottom nav`, fit.ok, fit.detail); }
    await page.evaluate(() => { const c = document.querySelector(".content"); if (c) c.scrollTop = 0; });
    await page.screenshot({ path: `${shots}/domains-expanded-${name(label)}.png` });
    // the 數據 overview (it overflowed once at 260 px in round 5): the same methods
    await page.locator(".bottom-nav").getByText("數據", { exact: true }).click(); await enlargeText(page, z); await page.waitForTimeout(300);
    { const fit = await pageFits(page); step(`O ${label} 數據總覽: no page overflow, the last button above the bottom nav`, fit.ok, fit.detail); }
  }
  // guest pages (no session): guest 首頁, 首次評估準備, the login role step — simulated zoom and enlarged text
  for (const [label, w, h, dsf, z] of variants.filter((v) => v[0].startsWith("sim zoom") || v[0].startsWith("text") || v[0] === "viewport 390")) {
    const context = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf });
    await context.route("**/*", (route) => (["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort()));
    const g = await context.newPage();
    g.on("pageerror", (e) => errors.push(e.message));
    await g.goto(`http://127.0.0.1:${port}/?emulator=1`);
    await g.locator(".guest-hero").waitFor({ timeout: 30000 });
    await enlargeText(g, z); await g.waitForTimeout(300);
    { const fit = await pageFits(g); step(`G ${label} guest 首頁: no overflow, the last button above the bottom nav`, fit.ok, fit.detail); }
    await g.screenshot({ path: `${shots}/guest-home-${name(label)}.png` });
    await g.getByRole("button", { name: "開始首次評估" }).click(); await enlargeText(g, z); await g.waitForTimeout(300);
    const prep = (await g.locator(".prep-next").innerText()).replace(/\s+/g, " ");
    step(`P ${label} 首次評估準備: 「接下來」 = 登入或建立帳號 / 填寫復健需求：4 題，可稍後填寫 / 確認鏡頭位置，再開始評估 (+ the camera line); no 「約 1 分鐘」`,
      prep.includes("登入或建立帳號") && prep.includes("填寫復健需求：4 題，可稍後填寫") && prep.includes("確認鏡頭位置，再開始評估") && (await g.locator(".phone").innerText()).includes("進入鏡頭設定時才會要求相機權限。") && !(await g.locator(".phone").innerText()).includes("約 1 分鐘"), prep);
    { const fit = await pageFits(g); step(`P ${label} 首次評估準備: no overflow, the last button above the bottom nav`, fit.ok, fit.detail); }
    await g.screenshot({ path: `${shots}/prep-${name(label)}.png` });
    await g.getByRole("button", { name: "登入並繼續" }).click(); await enlargeText(g, z); await g.waitForTimeout(300);
    { const fit = await pageFits(g); step(`G ${label} login role step: no overflow, the last button above the bottom nav`, fit.ok, fit.detail); }
    await context.close();
  }
  // keyboard: Tab reaches the disclosure (Enter opens / closes it) and the primary 下肢功能 (Enter opens F01)
  await page.context().close();
  page = await login(390, 844);
  await page.locator(".bottom-nav").getByText("訓練", { exact: true }).click();
  await page.locator(".today-explore-card", { hasText: "功能評估與練習" }).focus();
  await page.keyboard.press("Enter"); await page.locator(".domain-primary").waitFor();
  const stops = [];
  for (let i = 0; i < 6; i++) { await page.keyboard.press("Tab"); stops.push(await page.evaluate(() => { const a = document.activeElement; return a ? (a.classList.contains("domain-primary") ? "primary" : a.tagName === "SUMMARY" ? "summary" : a.textContent.trim().slice(0, 8)) : ""; })); if (stops[stops.length - 1] === "summary") break; }
  await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  const openedByKey = await page.evaluate(() => document.querySelector(".domain-closed").open);
  await page.keyboard.press("Enter"); await page.waitForTimeout(200);
  const closedByKey = !(await page.evaluate(() => document.querySelector(".domain-closed").open));
  step("K Tab order 返回 → 下肢功能 → 其他構面; Enter opens and closes the disclosure", stops.includes("primary") && stops.indexOf("primary") < stops.indexOf("summary") && openedByKey && closedByKey, JSON.stringify(stops));
  await page.locator(".domain-primary").focus(); await page.keyboard.press("Enter"); await page.waitForTimeout(500);
  step("K Enter on 下肢功能 opens F01 (the same route as before)", (await page.locator(".phone").innerText()).includes("F01 下肢功能"));
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
