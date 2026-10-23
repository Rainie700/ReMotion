// Local browser verification — PHASE 0: emulators NOT running.
// Expect: banner shown, page blocked by #emulatorUnavailable, no login, no request to any non-local host.
//   APP_URL=http://localhost:5173/?emulator=1 OUT=<results dir> node phase0-no-emulator.mjs
import { chromium } from "playwright-core";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = process.env.OUT;
const URL_ = process.env.APP_URL || "http://localhost:5173/?emulator=1";
const LOCAL = new Set(["localhost:5173", "127.0.0.1:5173", "127.0.0.1:8080", "127.0.0.1:9099"]);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const requests = [];
page.on("request", (r) => requests.push(r.url()));
const results = [];
const check = (name, ok, detail = "") => results.push([ok ? "PASS" : "FAIL", name, detail]);
await page.goto(URL_, { waitUntil: "load" });
await page.waitForSelector("#emulatorUnavailable", { timeout: 15000 }).catch(() => {});
const blocked = await page.$("#emulatorUnavailable");
check("P0-1 page blocked when emulators are unreachable", !!blocked, blocked ? (await blocked.textContent()).slice(0, 80) : "no #emulatorUnavailable");
check("P0-2 本機測試資料 banner shown", !!(await page.$("#emulatorModeBanner")));
await page.waitForTimeout(3000);
check("P0-3 no login form became usable behind the block", !!blocked);
const external = [...new Set(requests.map((u) => { try { return new URL(u).host; } catch { return u; } }))].filter((h) => !LOCAL.has(h) && h !== "");
check("P0-4 no request to any non-local host", external.length === 0, external.join(", "));
const keys = await page.evaluate(() => Object.keys(localStorage));
check("P0-5 no production cache keys written", !keys.some((k) => k.startsWith("remotion_") && !k.startsWith("remotion_emulator_")), keys.join(","));
await page.screenshot({ path: join(OUT, "shot-00-phase0-blocked.png"), fullPage: true });
writeFileSync(join(OUT, "phase0-requests.txt"), requests.join("\n"));
for (const r of results) console.log(r.join(" | "));
console.log(`\nPHASE0 PASS ${results.filter((r) => r[0] === "PASS").length} FAIL ${results.filter((r) => r[0] === "FAIL").length}`);
await browser.close();
process.exit(results.some((r) => r[0] === "FAIL") ? 1 : 0);
