import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Homepage + Assessment Result redesign — one Home hero (default / tracking
 * mode), 5xSTS result hierarchy, lighter recommendation cards, placeholders.
 * Render functions are executed in isolation against the real services.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { createCollection } = await import("../js/data/storageService.js");

function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => {
  const start = appJs.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `${name} exists`);
  return appJs.slice(start, appJs.indexOf(";\n", start) + 1);
};

// ── Home hero render functions, isolated ────────────────────────────────
let today = "2026-09-29";
const heroDeps = {
  trackingCycleService, functionalAssessmentService, recommendationService,
  getTrackingCycleViewState: T.getTrackingCycleViewState, buildTrackingCardModel: T.buildTrackingCardModel,
  getDailyProgressView: T.getDailyProgressView, toLocalDateKey: T.toLocalDateKey, formatDateKeyMonthDay: T.formatDateKeyMonthDay,
  TRACKING_STATUS: T.TRACKING_STATUS, TRACKING_CYCLE_LENGTH_DAYS: T.TRACKING_CYCLE_LENGTH_DAYS,
  getFa5xResultStatus: (r) => r.status, FA5X_RESULT_STATUS: { COMPLETED: "completed" },
  fmtFa5xSec: (ms) => `${(ms / 1000).toFixed(1)} 秒`, getTrackingTodayKey: () => today,
};
const hero = new Function(...Object.keys(heroDeps), `${constSource("TRACKING_CTA_FN")}\n${fnSource("getHomeTrackingCycle")}\n${fnSource("renderTrackingCycleCard")}\n${fnSource("renderTrackingSecondaryActions")}\nreturn { renderTrackingCycleCard, renderTrackingSecondaryActions };`)(...Object.values(heroDeps));

const catalog = exerciseService.listNormalized();
function fiveXSts(userId, { ms, at, role = null }) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
  return functionalAssessmentService.getById(s.id);
}
const u = "home-redesign";
const baseline = fiveXSts(u, { ms: 8900, at: [2026, 8, 28, 9, 0] });
const recResult = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog });
const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: recResult, createdBy: u }).recommendation;

// 1. No cycle -> default hero (開始自主復健); no tracking HTML at all
{
  assert.equal(hero.renderTrackingCycleCard(u), "");
  assert.equal(hero.renderTrackingSecondaryActions(u), "");
  const home = appJs.slice(appJs.indexOf("patientHome = function()"), appJs.indexOf("patientHome = function()") + 40000);
  assert.ok(home.includes("const functionalAssessmentSectionHtml = renderTrackingCycleCard(patientId) || `<div class=\"card functional-assessment-feature-card\">"));
  const def = home.slice(home.indexOf("const functionalAssessmentSectionHtml ="), home.indexOf("const functionalAssessmentSectionHtml =") + 1400);
  assert.ok(def.includes("開始自主復健") && def.includes('onclick="goFunctionalDomainHome()"') && def.includes("ai_dynamic_assessment_hero.png"));
}

const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: baseline, recommendation: rec }).cycle;

// 2 + 3 + 4. Active cycle, Day 2 -> hero in tracking mode with day / baseline / done / reassessment date
{
  today = "2026-09-29";
  const html = hero.renderTrackingCycleCard(u);
  assert.ok(html.includes("functional-assessment-feature-card home-hero-tracking training"), "the SAME featured card, in tracking mode");
  assert.ok(!html.includes("tc-card"), "no separate tracking dashboard card");
  for (const text of ["本週功能追蹤", "F01 下肢功能", "第 2 / 7 天", "初次評估", "8.9 秒", "本週完成", "0 天", "再次評估", "10/04", "exercise_sit_to_stand.png"]) {
    assert.ok(html.includes(text), `Day 2 hero shows ${text}`);
  }
  assert.equal((html.match(/class="home-hero-stat"/g) || []).length, 3, "at most three facts");
  assert.ok(/onclick="goTrackingWeekTraining\('[^']+'\)">開始今日訓練<\/button>/.test(html), "Day 1-6 primary CTA: today's training");
  assert.equal((html.match(/btn-primary/g) || []).length, 1, "one primary action");
  assert.ok(html.includes('aria-label="7 日週期，目前第 2 天"'));
  const tiles = hero.renderTrackingSecondaryActions(u);
  assert.ok(tiles.includes("本週訓練") && tiles.includes("本週紀錄") && !tiles.includes("<b>評估結果</b>"));
  assert.ok(tiles.includes(`goFiveTimesSitToStandResult('${baseline.id}', 'home')`), "本週紀錄 opens this cycle's baseline result, returning home");
  assert.ok(!/第 \d \/ 7 天/.test(tiles), "tiles do not repeat the hero's day");
  const home = appJs.slice(appJs.indexOf("patientHome = function()"), appJs.indexOf("patientHome = function()") + 40000);
  const ret = home.slice(home.indexOf("return `<div class=\"top-profile-container\">"));
  assert.ok(!ret.includes("${renderTrackingCycleCard(patientId)}"), "no extra tracking card above the greeting");
  assert.ok(ret.indexOf("${companionBannerHtml}") < ret.indexOf("${functionalAssessmentSectionHtml}") && ret.indexOf("${functionalAssessmentSectionHtml}") < ret.indexOf("${renderTrackingSecondaryActions(patientId)}"));
}

// 4b. Today's training finished -> status line + 查看本週訓練
{
  const cycles = createCollection("trackingCycles");
  const ids = rec.items.map((it) => it.exerciseId);
  cycles.update(cycle.id, { dailyTrainingProgress: { "2026-09-29": { dateKey: "2026-09-29", requiredExerciseIds: ids, completedExerciseIds: ids, isComplete: true } }, completedTrainingDates: ["2026-09-29"] });
  const html = hero.renderTrackingCycleCard(u);
  assert.ok(html.includes("✓ 今日訓練已完成") && />查看本週訓練<\/button>/.test(html) && html.includes("1 天"));
}

// 5. Day 7 -> 進行再次評估
{
  today = "2026-10-04";
  const html = hero.renderTrackingCycleCard(u);
  assert.ok(html.includes("可以進行再次評估了"));
  assert.ok(/onclick="goTrackingReassessment\('[^']+'\)">進行再次評估<\/button>/.test(html));
  today = "2026-10-06";
  assert.ok(!/第 \d+ \/ 7 天/.test(hero.renderTrackingCycleCard(u)), "overdue never shows Day 9 / 7");
}

// 6. Reassessment linked -> 查看前後比較 + 查看下一階段建議
{
  today = "2026-10-04";
  const re = fiveXSts(u, { ms: 8200, at: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: baseline.id } });
  assert.equal(trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: u, reassessment: re, todayDateKey: today }).linked, true);
  const html = hero.renderTrackingCycleCard(u);
  assert.ok(html.includes("本週追蹤已完成") && html.includes("8.9 秒") && html.includes("8.2 秒"));
  assert.ok(/onclick="goTrackingComparison\('[^']+'\)">查看前後比較<\/button>/.test(html));
  assert.ok(html.includes(`goD5StatusCheck('${cycle.id}')">查看下一階段建議`));
  for (const w of ["改善", "退步", "進步", "%"]) assert.ok(!html.includes(w), `no 「${w}」`);
  assert.ok(hero.renderTrackingSecondaryActions(u).includes(`goTrackingComparison('${cycle.id}')`), "本週紀錄 -> comparison once completed");
}

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

// 10. Recommendation card: first layer is short; Direct / reason / rules one tap away
{
  const page = fnSource("f01RecommendationResultPage");
  const card = page.slice(page.indexOf("return `<div class=\"card f01-rec-card\">"), page.indexOf("}).join(\"\");", page.indexOf("return `<div class=\"card f01-rec-card\">")));
  const firstLayer = card.slice(0, card.indexOf('<details class="f01-rec-why">'));
  const why = card.slice(card.indexOf('<details class="f01-rec-why">'));
  assert.ok(firstLayer.includes("${it.exerciseName}") && firstLayer.includes("f01-rec-purpose") && firstLayer.includes("AI 動作辨識"));
  assert.ok(!firstLayer.includes("${it.reason}") && !firstLayer.includes("f01-match-badge"), "no long Direct explanation on the first layer");
  assert.ok(why.includes("<summary>為什麼推薦這個？</summary>") && why.includes("${it.reason}") && why.includes("f01-match-badge") && why.includes("f01-rec-conditions"), "explainability kept on the second layer");
  assert.ok(card.includes("查看動作") && card.includes("開始訓練"));
}

// 11. Missing / unconfirmed demo images -> neutral placeholder; mapping entries kept
{
  // Self Practice Asset Audit — the pending set is DERIVED from the one asset audit
  // (js/data/exerciseAssets.js): every F01 exercise without a confirmed image.
  const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
  const render = new Function("EXERCISE_ASSET_AUDIT", "resolveExerciseMedia", "renderExerciseCardImage", `${constSource("F01_DEMO_IMAGE_PENDING")}\n${fnSource("renderF01RecommendationImage")}\nreturn renderF01RecommendationImage;`)(EXERCISE_ASSET_AUDIT, resolveExerciseMedia, (ex) => `<img src="${resolveExerciseMedia(ex.id).src}">`);
  assert.ok(render("F01-01", { id: "F01-01" }, "深蹲").includes("exercise_squat.png"));
  assert.ok(render("F01-08", { id: "F01-08" }, "直腿抬腿").includes("exercise_high_knees.png"), "F01-08 now has a confirmed straight-leg-raise image");
  assert.ok(render("F01-03", { id: "F01-03" }, "靠牆半蹲").includes("exercise_wall_half_squat.png"), "F01-03 now has its confirmed image");
  assert.ok(render("F01-02", { id: "F01-02" }, "迷你深蹲").includes("exercise_mini_squat.png"), "F01-02 now has its confirmed image");
  for (const id of ["F01-05", "F01-07", "F01-09", "F01-17", "F01-18", "F01-20"]) {
    const html = render(id, { id }, "動作");
    assert.ok(html.includes("：動作示意圖待補") && html.includes("示意圖待補</span>") && html.includes('role="img"') && !html.includes("exercise_squat.png"), `${id} placeholder (label + visible text)`);
  }
  assert.ok(render("F01-99", null, "x").includes("動作示意圖待補"), "unknown exercise -> placeholder, card never breaks");
  for (let n = 1; n <= 20; n++) { const id = `F01-${String(n).padStart(2, "0")}`; assert.ok(EXERCISE_ASSET_AUDIT[id], `${id} keeps its audit entry`); }
}

// 12. 最近評估 opens the newest F01 5xSTS result (shoulder-only entry untouched)
{
  const home = appJs.slice(appJs.indexOf("patientHome = function()"), appJs.indexOf("patientHome = function()") + 40000);
  assert.ok(home.includes("getLatestCompletedByPatientId(patientId, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND })"));
  assert.ok(home.includes(`onclick="goFiveTimesSitToStandResult('\${latestF01Assessment.id}', 'home')"`), "opens that F01 result; 返回 goes home");
  assert.ok(home.includes("${latestF01ActionHtml || functionalAssessmentResultActionHtml}"));
  assert.ok(!/評估結果<\/b>/.test(home.slice(home.indexOf("const functionalAssessmentResultActionHtml"), home.indexOf("const functionalAssessmentSectionHtml"))), "tile renamed 最近評估");
  assert.ok(fnSource("goLatestFunctionalAssessmentResult").includes("FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER"));
}

// Result page keeps its bottom nav; the camera page does not (Flow QA)
assert.ok(appJs.includes('if (state.route === "fiveTimesSitToStandResult") app.innerHTML = phone(fiveTimesSitToStandResultPage(), true);'));
assert.ok(appJs.includes('if (state.route === "fiveTimesSitToStandDetection") app.innerHTML = phone(fiveTimesSitToStandDetectionPage(), false);'));

console.log("Homepage + result redesign tests passed");
