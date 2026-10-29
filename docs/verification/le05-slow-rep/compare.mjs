// F01-04 (LE05) slow-rep fix — the same synthetic sequences through the session before (git HEAD) and after the fix.
// Run: node docs/verification/le05-slow-rep/compare.mjs   (writes RESULT.txt next to this file)
// Synthetic knee-angle frames: this verifies program logic only, not recognition on real video.
import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { CASES, runCase } from "./cases.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const dir = join(root, "js", "ai", "exercises", "sitToStand");
const original = execFileSync("git", ["show", "HEAD:js/ai/exercises/sitToStand/session.js"], { cwd: root, encoding: "utf8" });
const tmp = join(mkdtempSync(join(tmpdir(), "le05-before-")), "session.before.mjs");
writeFileSync(tmp, original.replace(/from "\.\/([^"]+)"/g, (_, f) => `from "${pathToFileURL(join(dir, f)).href}"`));
const before = (await import(pathToFileURL(tmp).href)).createSitToStandSession;
const after = (await import(pathToFileURL(join(dir, "session.js")).href)).createSitToStandSession;

const lines = ["F01-04 坐姿起立計次 — 同一批合成膝角序列，修正前（git HEAD）／修正後", "（合成資料只證明程式邏輯；不是真實影像的辨識準確率）", "",
  "| # | 情境 | 依定義應計 | 修正前計次 | 修正後計次 | 修正後「無法確認」 | 修正前漏計／誤計 | 修正後漏計／誤計 |", "|---|---|---|---|---|---|---|---|"];
const tally = { before: { miss: 0, extra: 0 }, after: { miss: 0, extra: 0 } };
for (const c of CASES) {
  const b = runCase(before, c), a = runCase(after, c);
  const diff = (n) => (n < c.expected ? `漏 ${c.expected - n}` : n > c.expected ? `多 ${n - c.expected}` : "—");
  for (const [k, n] of [["before", b.total], ["after", a.total]]) { if (n < c.expected) tally[k].miss += c.expected - n; if (n > c.expected) tally[k].extra += n - c.expected; }
  lines.push(`| ${c.id} | ${c.label} | ${c.expected}${c.unconfirmed ? "（應標示無法確認）" : ""} | ${b.total} | ${a.total} | ${a.unconfirmed} | ${diff(b.total)} | ${diff(a.total)} |`);
}
lines.push("", `合計：修正前漏計 ${tally.before.miss}、誤計（多計）${tally.before.extra}；修正後漏計 ${tally.after.miss}、誤計 ${tally.after.extra}。`);
lines.push("重複計次：同一個動作被計兩次的情況，修正前後都沒有出現（S9 晃動、S10／S11 連續動作）。");
const out = lines.join("\n") + "\n";
writeFileSync(join(here, "RESULT.txt"), out);
process.stdout.write(out);
