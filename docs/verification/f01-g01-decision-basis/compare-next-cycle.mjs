// G01 next-cycle correction — the same synthetic cases before / after (decision-logic verification only).
// Run: node docs/verification/f01-g01-decision-basis/compare-next-cycle.mjs   (writes NEXT_CYCLE_COMPARE.txt)
// "Before" = the current f01ProgressionDecision.js with only the G01 switch turned off (the correction is the
// only behavioural addition), loaded from a temporary copy. Real shared functions otherwise; no storage, no network.
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, "..", "..", "..", "js", "data");
const imp = (f) => import(pathToFileURL(join(data, f)).href);
const after = await imp("f01ProgressionDecision.js");
const C = await imp("fa5xComparisonConditions.js");
const A = await imp("d5Arrangement.js");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: M } = await imp("fa5xMeasurementCompatibility.js");
const { exerciseService } = await imp("exerciseService.js");
const SWITCH = 'const g01 = sourceCycle.selectedGoalId === "G01";';
const src = readFileSync(join(data, "f01ProgressionDecision.js"), "utf8");
if (src.split(SWITCH).length !== 2) throw new Error("G01 switch not found exactly once");
const tmp = join(mkdtempSync(join(tmpdir(), "d5-before-")), "f01ProgressionDecision.before.mjs");
writeFileSync(tmp, src.replace(SWITCH, "const g01 = false;").replace(/from "\.\/([^"]+)"/g, (_, f) => `from "${pathToFileURL(join(data, f)).href}"`));
const before = await import(pathToFileURL(tmp).href);
const catalog = exerciseService.listNormalized();

const U = "syn";
const report = (r) => (r === null ? [] : [{ schemaVersion: "fa5x-condition-report-1", source: "self_report", reportedBy: U, reportedAt: "2026-10-27T01:00:00.000Z", ...r }]);
const sess = (id, ms, r) => ({ id, patientId: U, status: "completed", result: { ...M, status: "completed", totalDurationMs: ms }, conditionReports: report(r) });
const OK_B = { armsUsed: "no", physicalAssistance: "no", sameChairAsBaseline: "not_applicable" };
const OK_R = { armsUsed: "no", physicalAssistance: "no", sameChairAsBaseline: "yes" };
const items = [{ exerciseId: "F01-04", matchLevel: "direct" }];
const DAYS = ["2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"];

const CASES = [
  ["N01", "差 −1.0 秒、6/6 天、條件一致", {}],
  ["N02", "只改秒數：差 −4.0 秒", { change: -4000 }],
  ["N03", "只改秒數：差 +4.0 秒", { change: 4000 }],
  ["N04", "只改完成量：2/6 天", { days: 2 }],
  ["N05", "只改完成量：0/6 天", { days: 0 }],
  ["N06", "只改吃力：4 天很吃力（每日回報，D5 不讀）", {}],
  ["N07", "只改每日不適：3 天有不舒服，再評估未勾", {}],
  ["N08", "再評估勾選新增或加重的不適", { discomfort: true }],
  ["N09", "再評估無效", { invalid: true }],
  ["N10", "衝突：差 −4.0 秒，但每天很吃力（D5 不讀）", { change: -4000 }],
  ["N11", "差 −4.0 秒，再評估有用手撐、換了椅子", { change: -4000, re: { armsUsed: "yes", physicalAssistance: "no", sameChairAsBaseline: "no" } }],
  ["N12", "差 −4.0 秒，再評估條件未回報", { change: -4000, re: null }],
  ["N13", "差 −4.0 秒，初次評估有人協助", { change: -4000, base: { armsUsed: "no", physicalAssistance: "yes", sameChairAsBaseline: "not_applicable" } }],
  ["N14", "差 −4.0 秒，是否同椅回報「不確定」", { change: -4000, re: { ...OK_R, sameChairAsBaseline: "unknown" } }],
  ["N15", "條件不同＋回報新增不適（保護優先）", { change: -4000, discomfort: true, re: { ...OK_R, armsUsed: "yes" } }],
  ["N16", "差 −4.0 秒、條件未回報，但有新增限制 L05", { change: -4000, re: null, limits: ["L05"] }],
];

function run(engine, c, withConditions) {
  const change = c.change ?? -1000;
  const b = sess("fa-b", 12000, c.base === undefined ? OK_B : c.base);
  const r = sess("fa-r", 12000 + change, c.re === undefined ? OK_R : c.re);
  const days = c.days ?? 6;
  const cycle = { id: "c", userId: U, baselineAssessmentId: b.id, reassessmentId: r.id, selectedGoalId: "G01", cycleStartDateKey: DAYS[0], plannedReassessmentDateKey: "2026-09-28", completedTrainingDates: DAYS.slice(0, days), limitationsSnapshot: [] };
  const conditions = withConditions ? C.checkFa5xComparisonConditions({ patientId: U, baseline: b, reassessment: r }) : null;
  const d5 = engine.buildD5Proposal({ sourceCycle: cycle, sourceRecommendation: { id: "rec", items, limitationIds: [], selectedGoalId: "G01" },
    comparison: c.invalid ? { eligible: false } : { eligible: true, changeMs: change }, input: { hasNewOrWorseningDiscomfort: !!c.discomfort, discomfortNote: null, currentLimitations: c.limits || [] }, catalog, comparisonConditions: conditions });
  const arr = A.resolveD5Arrangement({ id: "p", status: "draft", items: items.map((it, i) => ({ ...it, rank: i + 1 })), d5 });
  return { d5, arr, conditions };
}

const lines = ["G01 下一階段決策修正 — 同一批合成案例修改前後（決策邏輯驗證，不是臨床準確率）", `rule: ${after.F01_G01_NEXT_CYCLE_RULE_VERSION}; conditions: ${C.FA5X_COMPARISON_CONDITIONS_VERSION}`, ""];
lines.push("| # | 輸入 | 原判定 | 新比較狀態 | 新安排狀態 | 原因 |", "|---|---|---|---|---|---|");
for (const [id, label, c] of CASES) {
  const old = run(before, c, false);
  const now = run(after, c, true);
  const oldText = `${old.d5.matrixDecision}→${old.d5.decision}（${old.d5.decisionRuleId}／${old.d5.selectionRuleId}；${old.arr.status}）`;
  const reason = now.d5.g01NextCycle && now.d5.g01NextCycle.applied
    ? `時間變化撤回為依據（原 ${now.d5.g01NextCycle.withdrawnMatrix.ruleId}）${now.conditions.status === C.COMPARISON_CONDITION_STATUS.CONSISTENT ? "" : `；不以參考值解讀：${C.describeComparisonConditionReasons(now.conditions).join("、")}`}`
    : `沿用既有保護（${now.d5.decisionRuleId}）`;
  lines.push(`| ${id} | ${label} | ${oldText} | ${now.conditions.status.replace("reported_conditions_", "")}${now.d5.changeClass === after.CHANGE_NOT_INTERPRETED ? "（不解讀）" : ""} | ${now.d5.decision}（${now.d5.decisionRuleId}）；${now.arr.status}「${now.arr.actualLabel}」 | ${reason} |`);
}
const out = lines.join("\n") + "\n";
writeFileSync(join(here, "NEXT_CYCLE_COMPARE.txt"), out);
process.stdout.write(out);
