// G01 condition screen v1 — before / after on the same fixed synthetic cases.
// Run: node docs/verification/f01-g01-condition-screen/compare.mjs
// "Before" = the current generator with the G01 screen switched off (the screen is the only behavioural
// addition to generateF01GoalRecommendation), loaded from a temporary copy. Writes RESULT.txt next to this file.
// Condition screening and engineering-spec verification only — not clinical accuracy.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");
const dataDir = join(root, "js", "data");
const after = await import(pathToFileURL(join(dataDir, "f01GoalRecommendation.js")).href);
const SCR = await import(pathToFileURL(join(dataDir, "f01G01ConditionScreen.js")).href);
const { exerciseService } = await import(pathToFileURL(join(dataDir, "exerciseService.js")).href);

const src = readFileSync(join(dataDir, "f01GoalRecommendation.js"), "utf8");
const SWITCH = "const screenG01 = goal.goalId === F01_G01_SCREEN_GOAL_ID;";
if (src.split(SWITCH).length !== 2) throw new Error("G01 switch not found exactly once — update compare.mjs");
const beforeSrc = src.replace(SWITCH, "const screenG01 = false;")
  .replace(/from "\.\/([^"]+)"/g, (_, f) => `from "${pathToFileURL(join(dataDir, f)).href}"`);
const tmp = join(mkdtempSync(join(tmpdir(), "g01-before-")), "f01GoalRecommendation.before.mjs");
writeFileSync(tmp, beforeSrc);
const before = await import(pathToFileURL(tmp).href);

const catalog = exerciseService.listNormalized();
const ASSESS = { status: "completed", sessionId: "fa-syn", assessmentType: "five_times_sit_to_stand" };
const session = (report, { patientId = "syn", id = "fa-syn", reports } = {}) => ({ id, patientId, status: "completed",
  conditionReports: reports || (report ? [{ schemaVersion: "fa5x-condition-report-1", source: "self_report", reportedBy: patientId, reportedAt: "2026-10-27T01:00:00.000Z", ...report }] : []) });
const snap = (s, patientId = "syn") => SCR.buildG01ConditionSnapshot({ patientId, assessmentId: "fa-syn", session: s });
const NO = { armsUsed: "no", physicalAssistance: "no" };

const CASES = [
  ["V01", "G01 20 分、armsUsed=no、assistance=no", { minutes: 20, s: session(NO) }],
  ["V02", "同 V01，armsUsed=yes", { minutes: 20, s: session({ armsUsed: "yes", physicalAssistance: "no" }) }],
  ["V03", "同 V01，armsUsed=unknown", { minutes: 20, s: session({ armsUsed: "unknown", physicalAssistance: "no" }) }],
  ["V04", "同 V01，沒有條件回報", { minutes: 20, s: session(null) }],
  ["V05", "同 V01，assistance=yes", { minutes: 20, s: session({ armsUsed: "no", physicalAssistance: "yes" }) }],
  ["V06", "V01，只改秒數 12→20 秒", { minutes: 20, s: session(NO), assessment: { ...ASSESS, totalDurationMs: 20000 } }],
  ["V07", "V01，只改時間 10 分", { minutes: 10, s: session(NO) }],
  ["V08", "V01，只改時間 15 分", { minutes: 15, s: session(NO) }],
  ["V09", "V01，未選時間", { minutes: null, s: session(NO) }],
  ["V10", "V01＋L05", { minutes: 20, s: session(NO), limits: ["L05"] }],
  ["V11", "來源版本不符（同 V01，看 F01-01）", { minutes: 20, s: session(NO) }],
  ["V12", "G04 20 分（其他目標）", { goal: "G04", minutes: 20, s: session(NO) }],
  ["X01", "yes＋unknown 混合", { minutes: 20, s: session({ armsUsed: "yes", physicalAssistance: "unknown" }) }],
  ["X02", "非本人的評估（條件 no/no）", { minutes: 20, s: session(NO, { patientId: "someone-else" }) }],
  ["X03", "回報值無效（armsUsed=\"nope\"）", { minutes: 20, s: session({ armsUsed: "nope", physicalAssistance: "no" }) }],
  ["X04", "缺欄位（只回報 armsUsed=no）", { minutes: 20, s: session(null, { reports: [{ schemaVersion: "fa5x-condition-report-1", reportedBy: "syn", armsUsed: "no" }] }) }],
  ["X05", "補回報：先 unknown 再 no/no（最新一筆）", { minutes: 20, s: session(null, { reports: [
    { schemaVersion: "fa5x-condition-report-1", reportedBy: "syn", armsUsed: "unknown", physicalAssistance: "no" },
    { schemaVersion: "fa5x-condition-report-1", reportedBy: "syn", armsUsed: "no", physicalAssistance: "no" }] }) }],
];

const run = (engine, c) => engine.generateF01GoalRecommendation({ assessment: c.assessment || ASSESS, selectedGoalId: c.goal || "G01", limitationIds: c.limits || [], availableMinutes: c.minutes,
  catalog, excludeAutoRecommendationPending: true, g01Conditions: (c.goal || "G01") === "G01" ? snap(c.s) : null });
const fmt = (r) => r.status !== "ok" ? `${r.status}（0 項）` : `${r.items.map((i) => i.exerciseId).join("、")}${r.shortfall ? `（shortfall ${r.shortfall.requested}→${r.shortfall.available}）` : ""}`;
const why = (r) => r.excluded.filter((e) => e.reasonCategory).map((e) => `${e.exerciseId}:${(e.screenReasons || [{ code: e.reason }]).map((x) => x.code).join("+")}`).join("；") || "—";

const lines = ["G01 condition screen v1 — before / after（合成資料；條件篩選與工程規格驗證，不是臨床準確率）", `rule: ${SCR.F01_G01_CONDITION_RULE_VERSION}`, ""];
lines.push("| # | 案例 | 修改前 | 修改後 | 修改後未列原因 |", "|---|---|---|---|---|");
let withCandidates = 0, zero = 0;
const zeroReasons = {};
for (const [id, label, c] of CASES) {
  const b = run(before, c), a = run(after, c);
  lines.push(`| ${id} | ${label} | ${fmt(b)} | ${fmt(a)} | ${why(a)} |`);
  if ((c.goal || "G01") !== "G01") continue;
  if (a.items.length) withCandidates += 1;
  else { zero += 1; for (const code of a.conditionScreen.reasonCodes) zeroReasons[code] = (zeroReasons[code] || 0) + 1; }
}
lines.push("", `G01 案例：有候選 ${withCandidates}、零候選 ${zero}；零候選原因（可重疊）：${JSON.stringify(zeroReasons)}`);

// G02–G05: every time option × every limitation subset × several condition snapshots -> identical before / after
const LIMITS = ["L01", "L02", "L03", "L04", "L05"];
let compared = 0;
for (const goal of ["G02", "G03", "G04", "G05"]) for (const minutes of [10, 15, 20, null]) for (let m = 0; m < 32; m += 1) {
  const limits = LIMITS.filter((_, i) => m & (1 << i));
  for (const s of [session(NO), session({ armsUsed: "yes", physicalAssistance: "unknown" }), session(null)]) {
    const input = { assessment: ASSESS, selectedGoalId: goal, limitationIds: limits, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true };
    const b = before.generateF01GoalRecommendation(input);
    const a = after.generateF01GoalRecommendation({ ...input, g01Conditions: snap(s) });
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`G02–G05 changed: ${goal} ${minutes} ${limits}`);
    compared += 1;
  }
}
lines.push(`G02–G05：${compared} 組輸入（4 目標 × 4 時間 × 32 種限制組合 × 3 種條件快照）修改前後輸出完全相同。`);
const out = lines.join("\n") + "\n";
writeFileSync(join(here, "RESULT.txt"), out);
process.stdout.write(out);
