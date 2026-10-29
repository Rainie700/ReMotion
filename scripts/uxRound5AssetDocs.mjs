// 使用體驗改善 5/5 — writes ASSET_LIST.csv, ASSET_LIST.md and the overview page index.html of reports/ux-r5/presentation
// from presentation/assets.mjs (one source). Plain node; reads only files inside the repo.
//
//   node scripts/uxRound5AssetDocs.mjs
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(repo, "reports/ux-r5/presentation");
const { STORY, ASSETS, EXTRAS, VIDEOS, MISSING_CLIPS } = await import(pathToFileURL(join(dir, "assets.mjs")).href);
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const marksOf = (a) => ["示範資料", ...(a.marks || [])].join("、");

// CSV (UTF-8 with BOM so Excel opens the Chinese correctly)
const head = ["頁次", "檔名", "帳號角色", "操作路徑", "情境時間點", "資料來源", "是否可直接用", "需要補拍的原因", "畫面標示", "說明"];
const cell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const rows = ASSETS.map((a) => [a.id, `${a.id}.png（原圖 raw/${a.id}.png）`, a.role, a.path, `${a.time}（2026）`, a.source, a.status, a.reason || "", marksOf(a), a.note || ""]);
writeFileSync(join(dir, "ASSET_LIST.csv"), "﻿" + [head, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n");

// Markdown
const md = [
  "# 簡報素材清單（第 5/5 輪）",
  "",
  `- 患者：${STORY.patient}；復健師：${STORY.therapist}`,
  `- 訓練安排：${STORY.plan}`,
  `- 數字：${STORY.numbers}`,
  "- 情境日期：第 1 天 = 2026-10-22（四）… 第 7 天 = 2026-10-28（三）。全部在本機 Firebase 模擬器（demo-remotion）產生，沒有使用正式雲端、patient00／patient01 或任何付費服務。",
  "- 規格：390 px 寬、deviceScaleFactor 2、PNG。`raw/` 是未裁切原圖（含紅色「本機測試資料」橫條），`raw/*-full.png` 是整頁長圖；同層的 `Pxx-xx.png` 是簡報版（只裁掉紅色橫條並加上標示，畫面內容沒有修改）。",
  "",
  `| ${head.slice(0, 8).join(" | ")} |`,
  `|${head.slice(0, 8).map(() => "---").join("|")}|`,
  ...ASSETS.map((a) => `| ${a.id} | ${a.id}.png | ${a.role} | ${a.path} | ${a.time} | ${a.source} | **${a.status}** | ${a.reason || "—"} |`),
  "",
  "## 補充說明",
  ...ASSETS.filter((a) => a.note).map((a) => `- ${a.id}：${a.note}`),
  "",
  "## 同一故事的輔助畫面（非簡報頁）",
  ...EXTRAS.map((x) => `- raw/${x.id}.png：${x.title}（${x.role}，${x.time}）`),
  "",
  "## 影片片段（raw/video/）",
  ...VIDEOS.map((v) => `- ${v.file}（${v.covers}）：${v.note}`),
  "",
  "## 缺少、需要真人補拍的片段",
  ...MISSING_CLIPS.map((m) => `- ${m}`),
  "",
].join("\n");
writeFileSync(join(dir, "ASSET_LIST.md"), md);

// overview page, ordered by slide
const slides = [...new Set(ASSETS.map((a) => a.slide))];
const card = (a) => `<article class="asset ${a.status === "需補拍" ? "is-reshoot" : ""}">
  <a class="pic" href="${a.id}.png"><img loading="lazy" src="${a.id}.png" alt="${esc(a.id)} ${esc(a.title)}"></a>
  <div class="meta">
    <div class="top"><b class="id">${esc(a.id)}</b><span class="status">${esc(a.status)}</span></div>
    <h3>${esc(a.title)}</h3>
    <dl>
      <dt>帳號角色</dt><dd>${esc(a.role)}</dd>
      <dt>情境時間點</dt><dd>${esc(a.time)}</dd>
      <dt>操作路徑</dt><dd>${esc(a.path)}</dd>
      <dt>資料來源</dt><dd>${esc(a.source)}</dd>
      <dt>畫面標示</dt><dd>${esc(marksOf(a))}</dd>
      ${a.reason ? `<dt>需補拍原因</dt><dd class="warn">${esc(a.reason)}</dd>` : ""}
      ${a.note ? `<dt>說明</dt><dd>${esc(a.note)}</dd>` : ""}
    </dl>
    <p class="links"><a href="raw/${a.id}.png">未裁切原圖</a>${existsSync(join(dir, "raw", `${a.id}-full.png`)) ? ` ・ <a href="raw/${a.id}-full.png">整頁長圖</a>` : ""}</p>
  </div>
</article>`;
const usable = ASSETS.filter((a) => a.status === "可直接用").length;
const html = `<!doctype html>
<html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>ReMotion 簡報素材</title>
<style>
:root{--bg:#f4f6f1;--card:#fff;--ink:#1f2a1c;--muted:#5d6b58;--green:#5f8d49;--soft:#e8f0e2;--line:#dfe6d8;--warn:#9b1c1c;--warnbg:#fff1f0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:"Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;line-height:1.6}
header,main{max-width:1180px;margin:0 auto;padding:16px}
h1{margin:16px 0 4px;font-size:28px}h2{margin:32px 0 12px;font-size:22px;border-left:6px solid var(--green);padding-left:10px}
.lead{color:var(--muted);margin:0}
.facts{display:grid;gap:6px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-top:14px}
.facts b{color:var(--green)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:16px}
.asset{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;display:grid;grid-template-columns:150px 1fr}
.asset.is-reshoot{border-color:#e7a5a1}
.pic{background:var(--soft);display:block}.pic img{width:150px;display:block}
.meta{padding:12px 14px;min-width:0}.top{display:flex;justify-content:space-between;align-items:center;gap:8px}
.id{font-size:18px}.status{font-size:13px;font-weight:800;padding:3px 10px;border-radius:999px;background:var(--soft);color:var(--green)}
.is-reshoot .status{background:var(--warnbg);color:var(--warn)}
h3{margin:4px 0 8px;font-size:16px}dl{margin:0;display:grid;grid-template-columns:auto 1fr;gap:2px 10px;font-size:13px}
dt{color:var(--muted);white-space:nowrap}dd{margin:0;overflow-wrap:anywhere}.warn{color:var(--warn)}
.links{font-size:13px;margin:8px 0 0}a{color:var(--green)}
ul{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 16px 12px 34px}
@media (max-width:520px){.asset{grid-template-columns:110px 1fr}.pic img{width:110px}.grid{grid-template-columns:1fr}}
</style></head><body>
<header>
<h1>ReMotion 簡報素材（第 5/5 輪）</h1>
<p class="lead">17 張實際介面截圖，依簡報頁次排列。全部為本機模擬器的合成示範資料。可直接用 ${usable} 張、需補拍 ${ASSETS.length - usable} 張。</p>
<div class="facts">
<div><b>人物</b>　${esc(STORY.patient)}；${esc(STORY.therapist)}</div>
<div><b>安排</b>　${esc(STORY.plan)}</div>
<div><b>數字</b>　${esc(STORY.numbers)}</div>
<div><b>日期</b>　第 1 天 2026-10-22（四）至第 7 天 2026-10-28（三）</div>
<div><b>標示</b>　每張簡報版都有「示範資料」；合成計次標「合成輸入示範」、合成評估標「合成結果（非真人量測）」、週摘要標「示範摘要，非本次模型產出」。綠色假鏡頭畫面標「需真人補拍」，不可當成真人辨識成功。</div>
</div>
</header>
<main>
${slides.map((s) => `<h2>${s}</h2><div class="grid">${ASSETS.filter((a) => a.slide === s).map(card).join("")}</div>`).join("\n")}
<h2>同一故事的輔助畫面（非簡報頁）</h2>
<ul>${EXTRAS.map((x) => `<li><a href="raw/${x.id}.png">${esc(x.id)}</a>：${esc(x.title)}（${esc(x.role)}，${esc(x.time)}）</li>`).join("")}</ul>
<h2>影片片段</h2>
<ul>${VIDEOS.map((v) => `<li><a href="raw/video/${v.file}">${esc(v.file)}</a>（${esc(v.covers)}）：${esc(v.note)}</li>`).join("")}</ul>
<h2>缺少、需要真人補拍</h2>
<ul>${MISSING_CLIPS.map((m) => `<li>${esc(m)}</li>`).join("")}</ul>
<p class="lead">清單檔：<a href="ASSET_LIST.csv">ASSET_LIST.csv</a>・<a href="ASSET_LIST.md">ASSET_LIST.md</a>・拍攝紀錄 <a href="STORY_LOG.txt">STORY_LOG.txt</a></p>
</main></body></html>
`;
writeFileSync(join(dir, "index.html"), html);
console.log(`wrote ASSET_LIST.csv / ASSET_LIST.md / index.html (${ASSETS.length} assets, ${usable} usable)`);
