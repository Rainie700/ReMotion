// fa5x-camera-prep — dry run of the first-camera-test SETUP steps, WITHOUT a camera:
// open the app the way the tester will (?emulator=1&fa5xDebug=1), register a local account through the UI,
// log in, and check that everything lands in the local emulators only. The 5xSTS detection page is NOT opened
// (it would request the camera). A control page without ?emulator=1 is opened with every non-local request
// blocked, only to show what the tester must NOT see (no red banner); it never logs in.
//   REPO=<repo> OUT=<results dir> node phase5-camera-day-dryrun.mjs
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const { OUT } = process.env;
const BASE = "http://localhost:5173/";
const LOCAL = new Set(["localhost:5173", "127.0.0.1:5173", "127.0.0.1:8080", "127.0.0.1:9099"]);
const results = [];
const check = (name, ok, detail = "") => results.push([ok ? "PASS" : "FAIL", name, String(detail).replace(/\s+/g, " ").slice(0, 260)]);
for (const u of ["http://127.0.0.1:8080/", "http://127.0.0.1:9099/"]) {
  try { await fetch(u); } catch (e) { console.log(`ABORT: emulator not reachable at ${u}`); process.exit(2); }
}
const EMAIL = `camera-day-${Date.now().toString(36)}@local.test`, PW = "local-test-only-1";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const requests = [], problems = [];

// ── A. the tester's page ──
const ctx = await browser.newContext({ viewport: { width: 430, height: 900 } });
const page = await ctx.newPage();
page.on("request", (q) => requests.push(q.url()));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
page.on("dialog", async (d) => { problems.push(`dialog: ${d.message()}`); await d.dismiss(); });
await page.goto(`${BASE}?emulator=1&fa5xDebug=1`, { waitUntil: "load" });
await page.waitForFunction(() => typeof window.register === "function");
const banner = await page.$eval("#emulatorModeBanner", (b) => b.textContent).catch(() => null);
check("A1 red banner 「本機測試資料｜Firebase 模擬器（demo-remotion）｜非正式資料」 is shown", !!banner && banner.includes("demo-remotion") && banner.includes("非正式資料"), banner);
await page.screenshot({ path: join(OUT, "shot-05-01-start-page-with-banner.png") });
await page.evaluate(() => { window.setAuthMode("register"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
await page.waitForSelector("#regAccount");
await page.fill("#regName", "鏡頭測試者（本機）");
await page.fill("#regAccount", EMAIL);
await page.fill("#regPassword", PW);
await page.fill("#regPasswordConfirm", PW);
await page.screenshot({ path: join(OUT, "shot-05-02-register-form.png") });
await page.evaluate(() => window.register());
const regOk = await page.waitForFunction(() => document.body.textContent.includes("帳號建立成功"), null, { timeout: 20000 }).then(() => true, () => false);
check("A2 registration through the app's own 建立帳號 form succeeds", regOk);
const acc = await (await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-remotion/accounts:query", { method: "POST", headers: { authorization: "Bearer owner", "content-type": "application/json" }, body: "{}" })).json().catch(() => ({}));
const user = (acc.userInfo || []).find((u) => u.email === EMAIL);
check("A3 the account exists in the LOCAL Auth emulator (project demo-remotion)", !!user, user ? user.localId : JSON.stringify(acc).slice(0, 120));
await page.evaluate(() => { window.setAuthMode("login"); window.selectAuthRole("patient"); window.confirmAuthRole(); });
await page.waitForSelector("#loginAccount");
await page.fill("#loginAccount", EMAIL);
await page.fill("#loginPassword", PW);
await page.evaluate(() => window.login());
check("A4 login with the new local account reaches the home page", await page.waitForFunction(() => !!document.querySelector(".bottom-nav") && !document.getElementById("loginAccount"), null, { timeout: 30000 }).then(() => true, () => false));
if (user) {
  const r = await fetch(`http://127.0.0.1:8080/v1/projects/demo-remotion/databases/(default)/documents/users/${user.localId}`, { headers: { authorization: "Bearer owner" } });
  check("A5 the user profile document was written to the LOCAL Firestore emulator", r.ok, r.status);
}
const keys = await page.evaluate(() => Object.keys(localStorage));
const appKeys = keys.filter((k) => k.startsWith("remotion"));
check("A6 the browser cache uses only the separate remotion_emulator_ keys (normal remotion_ cache untouched)", appKeys.length > 0 && appKeys.every((k) => k.startsWith("remotion_emulator_")), appKeys.join(","));
check("A7 ?fa5xDebug=1 kept in the address bar after login (debug dock will be available on the detection page)", new URL(page.url()).searchParams.get("fa5xDebug") === "1" && new URL(page.url()).searchParams.get("emulator") === "1", page.url());
await page.screenshot({ path: join(OUT, "shot-05-03-home-after-login.png") });
await ctx.close();

// ── B. control: the URL WITHOUT ?emulator=1 (what must not be used); all non-local requests blocked, no login ──
const ctx2 = await browser.newContext({ viewport: { width: 430, height: 900 } });
const blocked = [];
await ctx2.route("**/*", (route) => { const h = new URL(route.request().url()).host; if (LOCAL.has(h)) return route.continue(); blocked.push(h); return route.abort(); });
const p2 = await ctx2.newPage();
await p2.goto(BASE, { waitUntil: "load" });
await p2.waitForTimeout(1500);
check("B1 without ?emulator=1 there is NO red banner (= production configuration; never test there)", (await p2.$("#emulatorModeBanner")) === null);
await p2.screenshot({ path: join(OUT, "shot-05-04-control-no-banner-do-not-use.png") });
await ctx2.close();

const external = [...new Set(requests.map((u) => { try { return new URL(u).host; } catch { return u; } }))].filter((h) => h && !LOCAL.has(h));
check("X1 tester page made no request to any non-local host", external.length === 0, external.join(", "));
check("X2 no alert / page error on the tester page", problems.length === 0, problems.join(" || "));
writeFileSync(join(OUT, "phase5-manifest.json"), JSON.stringify({ note: "local emulator account only (demo-remotion)", email: EMAIL, uid: user ? user.localId : null, controlBlockedHosts: [...new Set(blocked)] }, null, 2));
for (const r of results) console.log(r.join(" | "));
console.log(`control page: non-local hosts it tried (all blocked, nothing sent): ${[...new Set(blocked)].join(", ") || "none"}`);
console.log(`\nPHASE5 PASS ${results.filter((r) => r[0] === "PASS").length} FAIL ${results.filter((r) => r[0] === "FAIL").length}`);
await browser.close();
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
