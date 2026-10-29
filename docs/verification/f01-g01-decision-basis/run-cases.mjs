// G01 decision basis v1 — records what the CURRENT official functions output for fixed synthetic cases.
// Run: node docs/verification/f01-g01-decision-basis/run-cases.mjs   (writes CURRENT_OUTPUT.txt next to this file)
// The expectations live in docs/F01_G01_DECISION_BASIS_V1.md; they were written from the source check, not from this output.
// No storage beyond an in-memory localStorage, no network, no patient00.
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const here = dirname(fileURLToPath(import.meta.url));
const data = join(here, "..", "..", "..", "js", "data");
const imp = (f) => import(pathToFileURL(join(data, f)).href);
const D = await imp("f01ProgressionDecision.js");
const R = await imp("f01GoalRecommendation.js");
const SCR = await imp("f01G01ConditionScreen.js");
const { exerciseService } = await imp("exerciseService.js");
const catalog = exerciseService.listNormalized();

// A new G01 plan under condition screen v1 (only F01-04 can be on it).
const NO = { armsUsed: "no", physicalAssistance: "no" };
const session = (report) => ({ id: "fa-b", patientId: "syn", status: "completed", conditionReports: [{ schemaVersion: "fa5x-condition-report-1", source: "self_report", reportedBy: "syn", ...report }] });
const phaseC = (report, assessment = {}) => R.generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: "fa-b", assessmentType: "five_times_sit_to_stand", ...assessment },
  selectedGoalId: "G01", availableMinutes: 20, catalog, excludeAutoRecommendationPending: true, g01Conditions: SCR.buildG01ConditionSnapshot({ patientId: "syn", assessmentId: "fa-b", session: session(report) }) });
const plan = phaseC(NO);
const currentItems = plan.items;

/**
 * Next-week case. Fields the current D5 functions accept: assessmentValid, changeMs, completedTrainingDays,
 * hasNewOrWorseningDiscomfort, newLimitations. Fields they do NOT accept (recorded to show they are unused):
 * dailyEffort, dailyDiscomfort, incompleteReasons, reassessmentConditions.
 */
const W = (over) => ({ assessmentValid: true, changeMs: -1000, completedTrainingDays: 6, hasNewOrWorseningDiscomfort: false, newLimitations: [],
  dailyEffort: "easy×6", dailyDiscomfort: "no×6", incompleteReasons: "—", reassessmentConditions: "arms no / assist no / same chair yes", ...over });
const CASES = [
  ["N01", "對照：差 −1.0 秒、6/6 天、每天輕鬆、無不適", W({})],
  ["N02", "只改秒數：差 −4.0 秒", W({ changeMs: -4000 })],
  ["N03", "只改秒數：差 +4.0 秒", W({ changeMs: 4000 })],
  ["N04", "只改完成量：2/6 天", W({ completedTrainingDays: 2 })],
  ["N05", "只改完成量：0/6 天", W({ completedTrainingDays: 0 })],
  ["N06", "只改吃力：6 天中 4 天「很吃力」", W({ dailyEffort: "easy×2, very_hard×4" })],
  ["N07", "只改不適：每日回報 3 天「有不舒服」，再評估時未勾新增不適", W({ dailyDiscomfort: "no×3, yes×3" })],
  ["N08", "再評估時勾選新增或加重的不適", W({ hasNewOrWorseningDiscomfort: true })],
  ["N09", "資料缺失：再評估無效", W({ assessmentValid: false })],
  ["N10", "互相衝突：差 −4.0 秒，但每天「很吃力」且 3 天未完成（太吃力）", W({ changeMs: -4000, dailyEffort: "very_hard×6", incompleteReasons: "too_hard×3" })],
  ["N11", "超出來源條件：差 −4.0 秒，但再評估回報有用手撐、換了椅子", W({ changeMs: -4000, reassessmentConditions: "arms YES / assist no / same chair NO" })],
  ["N12", "超出來源條件：差 −4.0 秒，再評估條件未回報", W({ changeMs: -4000, reassessmentConditions: "未回報" })],
];

const lines = ["G01 decision basis v1 — CURRENT official output (synthetic; not the proposed rules)", `D5 rule version: ${D.D5_RULE_VERSION}; reference MDC ${D.REFERENCE_MDC_MS} ms`, ""];
lines.push("## First recommendation (G01, 20 min) — only the 5xSTS seconds differ", "");
for (const ms of [7000, 12400, 25000]) {
  const r = phaseC(NO, { totalDurationMs: ms });
  lines.push(`- ${ms / 1000} 秒：${r.status} ${r.items.map((i) => i.exerciseId).join("、")}`);
}
lines.push("", "## Next week on a new G01 plan (current items: " + currentItems.map((i) => i.exerciseId).join("、") + ")", "");
lines.push("| # | 案例 | D5 判定 | 規則 | 下一週選取 | 建議動作 | 未被讀取的輸入 |", "|---|---|---|---|---|---|---|");
for (const [id, label, c] of CASES) {
  const d = D.evaluateD5Decision(c);
  const s = D.selectNextCycleExercises({ decision: d.decision, selectedGoalId: "G01", currentItems, currentLimitations: [], catalog });
  const unused = `effort ${c.dailyEffort}; discomfort ${c.dailyDiscomfort}; incomplete ${c.incompleteReasons}; reassessment ${c.reassessmentConditions}`;
  lines.push(`| ${id} | ${label} | ${d.decision} | ${d.decisionRuleId} | ${s.selectionRuleId}${s.fallback ? `（fallback ${s.fallback}）` : ""}${s.nextCycleReady === false ? "，未就緒" : ""} | ${s.proposedExerciseIds.join("、") || "—"} | ${unused} |`);
}
// Same N02/N10/N11 inputs: does any unused field change the output? (it cannot: the functions do not take them)
const base = JSON.stringify(D.evaluateD5Decision(W({ changeMs: -4000 })));
const same = ["N10", "N11", "N12"].every((id) => JSON.stringify(D.evaluateD5Decision(CASES.find((c) => c[0] === id)[2])) === base);
lines.push("", `N02 / N10 / N11 / N12 的 D5 判定逐位元相同：${same}`);
const out = lines.join("\n") + "\n";
writeFileSync(join(here, "CURRENT_OUTPUT.txt"), out);
process.stdout.write(out);
