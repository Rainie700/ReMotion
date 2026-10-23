process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Core Value Experience — D4 origin navigation, per-week AI 姿勢分數 (F01 cycle
 * events only), and the 復健旅程 presentation (week chapters, robot on the
 * current stage, read-only past week, environment level) over the unchanged
 * 8-stage rules. Everything here is derived; nothing is written.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const S = await import("../js/dev/patient00Showcase.js");
const CTP = await import("../js/data/cycleTrainingPerformance.js");
const J = await import("../js/data/journeyPresentation.js");
const { f01AdventureService } = await import("../js/data/f01AdventureProgress.js");
const { gamificationEngine } = await import("../js/data/gamificationEngine.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");

const TODAY = "2026-09-30"; // demo today: Week 2 Day 3 / 7 with two formal training days
const fnSrc = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `app.js has ${name}`);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};

// ── A1 · D4 return follows its origin ──────────────────────────────────
{
  const go = new Function("state", "render", `${fnSrc("goTrackingComparison")}\nreturn goTrackingComparison;`);
  const st = {};
  go(st, () => {})("c1", "trackingHistory");
  assert.deepEqual([st.trackingComparisonCycleId, st.trackingComparisonOrigin], ["c1", "trackingHistory"]);
  go(st, () => {})("c1");
  assert.equal(st.trackingComparisonOrigin, null, "any other entry resets to the existing behaviour");
  go(st, () => {})("c1", "somethingElse");
  assert.equal(st.trackingComparisonOrigin, null);
  const page = fnSrc("trackingComparisonPage");
  assert.ok(page.includes(`state.trackingComparisonOrigin === "trackingHistory" ? "goF01TrackingHistory()" : state.trackingComparisonOrigin === "journey" ? "goMap()" : "switchTab('home')"`) && page.includes('onclick="${backFn}">返回</button>'));
  assert.ok(appJs.includes("compare: (cycle) => `goTrackingComparison('${cycle.id}')`"), "home flow unchanged (no origin)");
  assert.ok(fnSrc("f01TrackingHistoryPage").includes(", 'trackingHistory')"), "history passes its origin");
}

// ── B · per-week AI 姿勢分數: F01 cycle events only ──────────────────────
{
  const ev = (over) => ({ completed: true, isLegacy: false, sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: "c1", poseScore: 80, localDateKey: "2026-09-22", ...over });
  const events = [
    ev({}), ev({ poseScore: 90, localDateKey: "2026-09-23" }),
    ev({ poseScore: null, localDateKey: "2026-09-24" }),            // counted, not in the average
    ev({ completed: false, poseScore: 10 }),                          // incomplete
    ev({ sourceType: "self", sourceSubtype: "self_selected", poseScore: 10 }),
    ev({ sourceType: "therapist", sourceSubtype: "therapist_plan", poseScore: 10 }),
    ev({ isLegacy: true, poseScore: 10 }),                            // legacy (reverse-linked) record
    ev({ sourceSubtype: "f01_recommendation", poseScore: 10 }),       // another ReMotion plan
    ev({ trackingCycleId: "c2", poseScore: 50 }),                     // the other week
  ];
  const [c1, c2, c3] = CTP.buildCycleTrainingPerformance({ cycles: [{ id: "c1" }, { id: "c2" }, { id: "c3" }], events });
  assert.deepEqual(c1, { cycleId: "c1", completedTrainingCount: 3, trainingDays: 3, averageAiPostureScore: 85, scoredEventCount: 2 }, "missing score counted as training, not in the denominator");
  assert.deepEqual([c2.averageAiPostureScore, c2.completedTrainingCount], [50, 1]);
  assert.deepEqual([c3.averageAiPostureScore, c3.completedTrainingCount, c3.scoredEventCount], [null, 0, 0], "no scored event -> null (UI 「—」, never 0)");
  assert.deepEqual(CTP.compareCycleScores(84, 87), { diff: 3, text: "較前一週高 3", signed: "+3" });
  assert.deepEqual(CTP.compareCycleScores(87, 84), { diff: -3, text: "較前一週低 3", signed: "-3" });
  assert.equal(CTP.compareCycleScores(84, 84).text, "與前一週相同");
  assert.equal(CTP.compareCycleScores(null, 84), null);
  const src = readFileSync(join(root, "js/data/cycleTrainingPerformance.js"), "utf8");
  assert.ok(!/改善|進步|退步|復健成效/.test(src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")) && !/\.create\(|\.update\(|setItem/.test(src), "neutral wording, read-only");
}

// ── patient00 showcase ────────────────────────────────────────────────
const U = { id: "uid-p00", email: "patient00@gmail.com", role: "patient" };
const seeded = S.seedPatient00ShowcaseData(U);
{
  const perf = CTP.cycleTrainingPerformanceService.getByCycle(U.id);
  const p1 = perf.get(seeded.cycle1Id), p2 = perf.get(seeded.cycle2Id);
  assert.deepEqual([p1.completedTrainingCount, p1.trainingDays, p1.scoredEventCount], [12, 6, 12]);
  assert.ok(Number.isInteger(p1.averageAiPostureScore) && p1.averageAiPostureScore > 0 && p1.averageAiPostureScore < 100);
  assert.equal(p1.averageAiPostureScore, 86, "week 1 average derived from its 12 scored events");
  assert.deepEqual([p2.averageAiPostureScore, p2.completedTrainingCount, p2.trainingDays], [89, 4, 2], "week 2: two formal days so far");
  assert.equal(CTP.compareCycleScores(p1.averageAiPostureScore, p2.averageAiPostureScore).signed, "+3");
}

// ── C · 復健旅程 ────────────────────────────────────────────────────────
const pageFactory = new Function("ctx", `
  const { state, gamificationEngine, f01AdventureService, buildJourneyChapters, journeyEnvironmentLevel, journeyPathStates, journeyStageWindow, getCurrentPatientId, getTrackingTodayKey } = ctx;
  ${fnSrc("renderJourneyLevelRow")}
  ${fnSrc("rehabMapPage")}
  return rehabMapPage;
`);
const renderJourney = (journeyWeek = null) => pageFactory({ state: { journeyWeek }, gamificationEngine, f01AdventureService, ...J, getCurrentPatientId: () => U.id, getTrackingTodayKey: () => TODAY })();
{
  const chapters = J.buildJourneyChapters(U.id, TODAY);
  assert.deepEqual(chapters.weeks.map((w) => [w.weekNumber, w.isCurrent, w.adventure.completedCount, w.adventure.allCompleted]), [[1, false, 8, true], [2, true, 3, false]]);
  assert.deepEqual(chapters.nextPlaceholder, { weekNumber: 3, placeholder: true }, "one locked next week, no endless list");
  assert.equal(JSON.stringify(chapters.weeks[1].adventure.stages), JSON.stringify(f01AdventureService.getAdventure(U.id, TODAY).stages), "same 8-stage result as the adventure service");

  const before = JSON.stringify([...mem.entries()]);
  const html = renderJourney();
  assert.equal(JSON.stringify([...mem.entries()]), before, "rendering the journey writes nothing");
  const g = gamificationEngine.getGamificationSummary(U.id);
  const order = ["<b>復健旅程</b>", "journey-level", "journey-weeks", "第 2 週｜進行中", "旅程進度 3 / 8", "rehab-adventure-map-scene", "第 4 關｜穩定累積", "rehab-achievement-entry"].map((t) => html.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), "title → Lv → weeks → chapter → scene → current stage → achievements");
  assert.ok(html.includes(`<b>Lv.${g.level}</b>`) && html.includes(`${g.currentLevelXp} / ${g.nextLevelXp} XP`) && !html.includes("level-xp-card"), "compact Lv / XP only");
  assert.ok(html.includes("第 1 週 ✓") && html.includes("第 2 週 ●") && html.includes("第 3 週 🔒"));
  assert.ok(html.includes('data-robot-stage="4"') && (html.match(/rehab-adventure-avatar/g) || []).length === 1, "robot stands on the derived current stage 4");
  assert.ok(html.includes('onclick="goSchedule()">前往今日復健</button>'), "current CTA = existing route");
  assert.ok(html.includes('class="journey-seg is-done"') && html.includes('class="journey-seg is-active"') && html.includes('class="journey-seg is-future"'), "path states");
  assert.ok(!/失敗|未達成/.test(html), "unfinished never reads as failure");

  // previous week, read-only
  const review = renderJourney(1);
  assert.ok(review.includes("第 1 週｜已完成") && review.includes("旅程進度 8 / 8") && review.includes("本週旅程完成") && review.includes("12.8 秒 → 8.9 秒"));
  assert.ok(review.includes(`goTrackingComparison('${seeded.cycle1Id}', 'journey')">查看功能比較`), "past week CTA = its comparison");
  assert.ok(!/goSchedule\(\)|前往今日復健|開始今日訓練/.test(review), "no training CTA on a history week");
  assert.ok(review.includes('data-robot-stage="8"') && review.includes("journey-env-3") && review.includes("d-done"), "finished chapter: robot on the last stage, complete scene");
  assert.ok(renderJourney(2).includes("第 4 關｜穩定累積"), "selecting the current week = the current view");

  // environment derives from completed stages only
  assert.deepEqual([0, 2, 3, 5, 6, 7, 8].map((n) => J.journeyEnvironmentLevel(n, 8)), [0, 0, 1, 1, 2, 2, 3]);
  assert.ok(html.includes("journey-env-1"), "3 / 8 completed -> scene level 1");
  assert.deepEqual(J.journeyPathStates([{ state: "completed" }, { state: "completed" }, { state: "current" }, { state: "locked" }]), ["done", "active", "future"]);

  // the robot follows the derived stage: on the day before (09/29, one formal day) it stood one stage earlier
  const dayBefore = pageFactory({ state: { journeyWeek: null }, gamificationEngine, f01AdventureService, ...J, getCurrentPatientId: () => U.id, getTrackingTodayKey: () => "2026-09-29" })();
  assert.ok(f01AdventureService.getAdventure(U.id, "2026-09-29").currentStage.n <= 4 && dayBefore.includes("rehab-adventure-avatar"), "same derived stage rules on any day");

  // presentation module is read-only and uses the unchanged rules
  const src = readFileSync(join(root, "js/data/journeyPresentation.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(/resolveF01Adventure\(/.test(src) && !/\.create\(|\.update\(|setItem|addXp|gamificationEngine/.test(src), "derive-only presentation");
  assert.ok(!/冒險地圖/.test(fnSrc("rehabMapPage").replace(/\/\/.*$/gm, "")) && fnSrc("renderLevelXpSummaryCard").includes("復健旅程 ›"), "named 復健旅程");
}

console.log("Core Value Experience tests passed");
