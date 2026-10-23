import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Local browser verification batch (docs/verification/fa5x-browser-local/) —
 * re-runs the 5xSTS result-page checks of tests/homeResultRedesign.test.js that
 * never execute because that file stops at an EARLIER, pre-existing failure
 * (section 2: ReferenceError displayCompletedTrainingDays — the hero harness lacks
 * the dependency). The blocks below are copied VERBATIM (same extractor, same
 * assertions, nothing relaxed); the original file is not modified.
 *
 *   homeResultRedesign §7+8+9  (5xSTS result template: one hero number, record, order, wording)
 *   homeResultRedesign §12     (最近評估 opens the newest F01 5xSTS result)
 *   homeResultRedesign tail    (result page keeps its bottom nav; camera page does not)
 *
 * tests/flowDataQa.test.js needs no re-run: it fails in section 6 (exercise image
 * backlog), AFTER its result-page sections 2 and 3 have already executed and passed;
 * only its section 7 (favicon, unrelated to the result page) is blocked.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");

// same extractor as tests/homeResultRedesign.test.js
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}

// ── homeResultRedesign.test.js §7 + 8 + 9, verbatim ──
// 7 + 8 + 9. 5xSTS result: total time is the one hero number; no rep seconds; 5 completion marks
{
  const page = fnSource("fiveTimesSitToStandResultPage");
  const completed = page.slice(page.indexOf("const repDurations"));
  const template = completed.slice(completed.indexOf("return `${header}"));
  assert.ok(template.includes('<div class="fa5x-hero-value">${(result.totalDurationMs / 1000).toFixed(1)}<span>秒</span></div>'));
  assert.equal((template.match(/fa5x-hero-value/g) || []).length, 1);
  assert.ok(!/repDurationsMs\[|repDurations\.map|fmtFa5xSec\(ms\)|第 \$\{i \+ 1\} 次/.test(completed), "repDurationsMs values never rendered");
  assert.ok(completed.includes("本次完成紀錄") && completed.includes('Array.from({ length: completedReps }, (_, i) => `<span class="fa5x-done-mark">'));
  assert.ok(template.includes('aria-label="連續完成 ${completedReps} 次完整坐站"'), "completion marks are not colour-only");
  assert.ok(template.includes("exercise_sit_to_stand.png"));
  const order = ["fa5x-result-hero", "本次完成紀錄", "fa5x-info-row", "${nextHtml}"].map((s) => template.indexOf(s));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  for (const w of ["正常", "異常", "很好", "改善", "退步", "風險", "肌少症"]) assert.ok(!completed.includes(w), `no 「${w}」`);
}

// ── homeResultRedesign.test.js §12, verbatim ──
// 12. 最近評估 opens the newest F01 5xSTS result (shoulder-only entry untouched)
{
  const home = appJs.slice(appJs.indexOf("patientHome = function()"), appJs.indexOf("patientHome = function()") + 40000);
  assert.ok(home.includes("getLatestCompletedByPatientId(patientId, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND })"));
  assert.ok(home.includes(`onclick="goFiveTimesSitToStandResult('\${latestF01Assessment.id}', 'home')"`), "opens that F01 result; 返回 goes home");
  assert.ok(home.includes("${latestF01ActionHtml || functionalAssessmentResultActionHtml}"));
  assert.ok(!/評估結果<\/b>/.test(home.slice(home.indexOf("const functionalAssessmentResultActionHtml"), home.indexOf("const functionalAssessmentSectionHtml"))), "tile renamed 最近評估");
  assert.ok(fnSource("goLatestFunctionalAssessmentResult").includes("FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER"));
}

// ── homeResultRedesign.test.js tail, verbatim ──
// Result page keeps its bottom nav; the camera page does not (Flow QA)
assert.ok(appJs.includes('if (state.route === "fiveTimesSitToStandResult") app.innerHTML = phone(fiveTimesSitToStandResultPage(), true);'));
assert.ok(appJs.includes('if (state.route === "fiveTimesSitToStandDetection") app.innerHTML = phone(fiveTimesSitToStandDetectionPage(), false);'));

console.log("5xSTS result-page checks blocked in homeResultRedesign re-run: passed");
