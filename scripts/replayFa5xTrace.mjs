/**
 * Offline replay of a 5xSTS development frame trace (?fa5xDebug=1 → 下載 JSON).
 *
 *   npm run replay:fa5x-trace -- <trace.json> [--json]
 *
 * Reads the file only (no network, no writes). Exit code:
 *   0 reproduced · 1 mismatch · 2 not verifiable (incomplete trace) · 3 unsupported / unreadable
 * Development / regression tool — not accuracy validation.
 */
import { readFileSync } from "node:fs";
import { replayFa5xTrace, formatFa5xReplayReport, FA5X_REPLAY_VERDICT } from "../js/ai/exercises/sitToStand/assessmentReplay.js";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) {
  console.error("用法：npm run replay:fa5x-trace -- <trace.json> [--json]");
  process.exit(3);
}
let trace;
try {
  trace = JSON.parse(readFileSync(file, "utf8"));
} catch (e) {
  console.error(`無法讀取或解析 ${file}：${e.message}`);
  process.exit(3);
}
const report = replayFa5xTrace(trace);
console.log(args.includes("--json") ? JSON.stringify(report, null, 2) : formatFa5xReplayReport(report));
process.exit({
  [FA5X_REPLAY_VERDICT.REPRODUCED]: 0,
  [FA5X_REPLAY_VERDICT.MISMATCH]: 1,
  [FA5X_REPLAY_VERDICT.NOT_VERIFIABLE]: 2,
}[report.verdict] ?? 3);
