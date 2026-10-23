// Screens of the isolated preview (no Firebase, no Gemini): loads private/local_preview_storage.json
// into a throwaway Chrome profile under the local demo's own storage keys, opens the dev server
// with ?localDemo=d5, walks the patient and therapist pages and saves screenshots + page text checks.
// Needs puppeteer-core (not a project dependency) — run it from a folder where it is installed:
//   DEMO_DIR=<repo>/scripts/demo/patient00History6w SHOTS=<out dir> PROFILE=<tmp dir> node previewShots.mjs
import puppeteer from "puppeteer-core";
import { readFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.env.DEMO_DIR;
const OUT = process.env.SHOTS;
const storage = JSON.parse(readFileSync(join(dir, "private/local_preview_storage.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(dir, "private/manifest.json"), "utf8"));
rmSync(process.env.PROFILE, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const cycleIds = manifest.writes.filter((w) => w.collection === "trackingCycles").map((w) => w.id);
const REAL_W5 = "trackingCycle_mulh04km_6_505f6x";
const [W1, W2, W3, W4, W6] = cycleIds;

const browser = await puppeteer.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true, userDataDir: process.env.PROFILE, args: ["--no-first-run", "--window-size=430,1000"] });
const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932 });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e.message || e)));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("dialog", async (d) => { errors.push(`dialog: ${d.message()}`); await d.dismiss(); });
await page.evaluateOnNewDocument((data) => {
  if (!localStorage.getItem("__preview_loaded")) {
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
    localStorage.setItem("__preview_loaded", "1");
  }
}, storage);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const text = () => page.$eval("#app", (e) => e.innerText);
const go = async (js) => { await page.evaluate(js); await wait(700); };
const clickText = async (label) => { const ok = await page.evaluate((l) => { const el = [...document.querySelectorAll("button, a, [onclick]")].find((e) => e.textContent.trim().replace(/\s+/g, " ") === l); if (el) el.click(); return !!el; }, label); await wait(900); return ok; };
const checks = [];
const expect = async (name, re, { not = false } = {}) => { const t = await text(); const ok = not ? !re.test(t) : re.test(t); checks.push([ok ? "PASS" : "FAIL", name]); };
async function shot(name, scrollTo = null) {
  await page.evaluate((t) => {
    const c = document.querySelector(".phone .content") || document.scrollingElement;
    if (!t) { c.scrollTop = 0; return; }
    const el = [...document.querySelectorAll("#app *")].find((e) => e.children.length <= 3 && e.textContent.includes(t));
    if (el) el.scrollIntoView({ block: "start" });
  }, scrollTo);
  await wait(300);
  await page.screenshot({ path: `${OUT}/${name}.png` });
}

await page.goto("http://127.0.0.1:5199/?localDemo=d5", { waitUntil: "networkidle0" });
await page.waitForSelector("#local-demo-bar", { timeout: 15000 });
await wait(1200);

// ── patient ──
await shot("p01_home_w6");
await expect("home: W6 synthetic baseline labelled", /展示合成資料/);
await clickText("訓練");
await shot("p02_today_plan");
await expect("today plan lists W6 exercises", /坐站|深蹲/);
await go("goF01TrackingHistory()");
await shot("p03_history_top");
await expect("history: 6 weeks", /第 6 週/);
await expect("history: synthetic weeks labelled", /第 1、2、3、4、6 週的評估為展示用合成資料/);
await shot("p04_history_trend", "功能追蹤趨勢");
await shot("p05_history_perf", "訓練表現");
await go(`goTrackingComparison('${W2}', 'trackingHistory')`);
await shot("p06_w2_comparison");
await shot("p07_w2_arrangement", "本週採用安排");
await expect("W2: rule suggestion shown", /規則建議：調整（R011）/);
await expect("W2: simulated therapist review shown", /模擬檢視（展示用，非真實復健師操作）/);
await expect("W2: therapist change shown", /訓練量：.*→ 2 組 × 每組 8 下/);
await expect("W2: patient accepted the reviewed content", /採用復健師檢視後的內容/);
await go(`goTrackingComparison('${W4}', 'trackingHistory')`);
await shot("p08_w4_arrangement", "本週採用安排");
await expect("W4: no proposal, restarted by a new assessment", /本週沒有產生下一階段建議/);
await expect("W4: no next-stage button for a replaced week", /查看下一階段建議/, { not: true });
await go(`goTrackingComparison('${REAL_W5}', 'trackingHistory')`);
await shot("p09_w5_real_arrangement", "本週採用安排");
await expect("W5 (real): not labelled synthetic", /為展示用合成資料，不是真實量測/, { not: true });
await expect("W5 (real): accepted rule plan", /採用規則產生的內容/);
await go("switchTab('data')");
await shot("p10_summaries", "復健師已確認的週摘要");
const optionCount = await page.$$eval("select[aria-label='選擇要查看的已確認週摘要'] option", (o) => o.length).catch(() => 0);
checks.push([optionCount === 5 ? "PASS" : "FAIL", `patient sees 5 confirmed summaries (got ${optionCount})`]);
await go(`selectPatientSummaryCycle('${W2}')`);
await shot("p11_summary_w2", "復健師已確認的週摘要");
await expect("W2 summary: reviewed plan, not 'waiting'", /下一週安排已由復健師檢視確認。.*訓練量為 2 組 × 每組 8 下/);
await expect("W2 summary: never 'needs professional confirmation'", /需由專業人員確認後進行/, { not: true });
await expect("W2 summary: simulated confirmation labelled", /模擬確認（展示用，非真實復健師操作）/);
await go(`selectPatientSummaryCycle('${REAL_W5}')`);
await expect("W5 real summary: real confirmation wording", /✓ 復健師已確認/);
await go("goActionRecords && goActionRecords()");
await shot("p12_records");
await expect("records: synthetic training labelled", /展示合成資料/);
// training prep for today's plan
await clickText("訓練");
const started = await page.evaluate(() => { const b = [...document.querySelectorAll("#app button")].find((e) => e.textContent.trim() === "開始"); if (b) { b.click(); return true; } return false; });
await wait(1000);
await shot("p13_training_prep");
checks.push([started ? "PASS" : "FAIL", "today plan 開始 opens training prep"]);

// ── therapist ──
await go("localDemoAs('therapist')");
await go("goCaseDetail('localdemo-d5-patient')");
await shot("t01_case_overview");
await expect("therapist overview: synthetic records note", /展示用合成訓練紀錄/);
await go(`selectCaseSummaryCycle('${W2}')`);
await shot("t02_w2_summary", "AI 週摘要");
await expect("therapist W2: simulated confirmation", /模擬確認（展示用，非真實復健師操作）/);
await expect("therapist W2: plan text includes the review", /復健師已檢視確認並修改規則安排/);
await shot("t03_w2_arrangement", "本週採用安排");
await expect("therapist W2: arrangement block", /本週採用安排[\s\S]*復健師檢視[\s\S]*患者接受/);
const tOptions = await page.$$eval("select.llm-summary-cycle-select option", (o) => o.map((x) => x.textContent));
checks.push([tOptions.length === 6 ? "PASS" : "FAIL", `therapist week selector lists 6 weeks (got ${tOptions.length})`]);
await go(`selectCaseSummaryCycle('${W6}')`);
await shot("t04_w6_in_progress", "AI 週摘要");
await go("setCaseDetailTab('records')");
await shot("t05_records");
await expect("therapist records: synthetic labelled", /展示合成資料/);

for (const c of checks) console.log(c.join("  "));
console.log(`${checks.filter((c) => c[0] === "PASS").length}/${checks.length} checks passed`);
console.log("page errors:", JSON.stringify(errors.slice(0, 10)));
writeFileSync(join(OUT, "checks.json"), JSON.stringify({ checks, errors }, null, 2));
await browser.close();
