// 使用體驗改善 5/5 — presentation versions of the 17 story screenshots (no app, no emulator).
// From presentation/raw/<ID>.png (uncropped, kept as is) it writes presentation/<ID>.png: the red 「本機測試資料」 dev banner
// cropped off, a 「示範資料」 mark always added, plus the asset's own marks (合成輸入示範 / 合成結果 / 示範摘要 / 需真人補拍).
// Nothing in the app picture itself is retouched; marks sit on top in a corner band.
//
//   REPO=<repo> node uxRound5PresentationAssets.mjs   (run where playwright is installed)
import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const repo = process.env.REPO;
const dir = `${repo}/reports/ux-r5/presentation`;
const { ASSETS } = await import(pathToFileURL(`${repo}/reports/ux-r5/presentation/assets.mjs`).href);
const BANNER_CSS_PX = 50, DSF = 2; // the dev banner's height in the 390-px viewport, deviceScaleFactor 2

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 780, height: 1700 }, deviceScaleFactor: 1 });
for (const a of ASSETS) {
  const src = `${dir}/raw/${a.id}.png`;
  if (!existsSync(src)) { console.log(`MISSING | ${a.id}`); continue; }
  const b64 = readFileSync(src).toString("base64");
  const marks = ["示範資料", ...(a.marks || [])];
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
    body{margin:0;background:#fff;font-family:"Noto Sans TC","Microsoft JhengHei",sans-serif}
    #f{position:relative;width:780px;overflow:hidden}
    #f img{display:block;width:780px;margin-top:-${BANNER_CSS_PX * DSF}px}
    #m{position:absolute;top:14px;right:14px;display:flex;flex-direction:column;align-items:flex-end;gap:8px}
    .k{font-size:24px;font-weight:800;line-height:1;padding:9px 14px;border-radius:999px;background:rgba(255,255,255,.94);color:#5b3a00;border:2px solid #c98a1a;box-shadow:0 2px 6px rgba(0,0,0,.12)}
    .k.warn{background:#fff1f0;color:#9b1c1c;border-color:#d9534f}
  </style></head><body><div id="f"><img src="data:image/png;base64,${b64}"><div id="m">${marks.map((t) => `<span class="k${/需真人補拍/.test(t) ? " warn" : ""}">${t}</span>`).join("")}</div></div></body></html>`);
  await page.waitForFunction(() => document.querySelector("#f img").complete);
  const h = await page.evaluate(() => document.querySelector("#f img").naturalHeight - 100);
  await page.evaluate((hh) => { document.querySelector("#f").style.height = `${hh}px`; }, h);
  await page.locator("#f").screenshot({ path: `${dir}/${a.id}.png` });
  console.log(`OK | ${a.id} | ${marks.join("・")}`);
}
await browser.close();
