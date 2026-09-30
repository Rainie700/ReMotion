process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Data Showcase Cleanup + Profile IA Simplification.
 *  - Data: the F01 trend is the formal tracking chain (baseline + reassessment
 *    per cycle, each assessment once); other 5xSTS runs stay in history only.
 *  - 我的: 個人摘要 / 我的復健設定 / 我的復健師 / 復健成就 / 帳號與設定, all
 *    numbers from the existing I-2 / I-3 derived sources.
 * The real app.js render functions are executed with the real services.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const S = await import("../js/dev/patient00Showcase.js");
const { functionalProgressService, buildTrackingAssessmentSeries } = await import("../js/data/functionalProgressService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { gamificationEngine } = await import("../js/data/gamificationEngine.js");
const { f01AdventureService } = await import("../js/data/f01AdventureProgress.js");
const { relationService } = await import("../js/data/relationService.js");
const { userService } = await import("../js/data/userService.js");
const { createCollection } = await import("../js/data/storageService.js");
const TC = await import("../js/data/trackingCycle.js");
const { F01_GOALS } = await import("../js/data/f01RecommendationSpec.js");
const { F01_FUNCTIONAL_DOMAIN } = await import("../js/data/f01Recommendation.js");
const CTP = await import("../js/data/cycleTrainingPerformance.js");

const TODAY = "2026-09-30"; // demo today: Week 2 Day 3 / 7, two formal training days
const fnSrc = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `app.js has ${name}`);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
const constLine = (name) => appJs.split(/\r?\n/).find((l) => l.startsWith(`const ${name} =`));

// patient00 showcase + the kind of old test sessions seen on the real account
const P00 = { id: "uid-p00", email: "patient00@gmail.com", role: "patient" };
assert.equal(S.seedPatient00ShowcaseData(P00).ok, true);
const oldRun = (ms, y, m, d, h) => {
  const s = functionalAssessmentService.create({ patientId: P00.id, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(y, m - 1, d, h).toISOString() } });
};
[[24100, 9, 20, 9], [22800, 9, 20, 10], [8200, 9, 28, 11], [8200, 9, 28, 12], [8300, 9, 29, 9]].forEach(([ms, m, d, h]) => oldRun(ms, 2026, m, d, h));

// ── Data trend ─────────────────────────────────────────────────────────
const progress = functionalProgressService.getFunctionalProgress(P00.id, TODAY);
{
  const [c2, c1] = [progress.currentCycle.cycle, trackingCycleService.getTrackingCycleById(progress.currentCycle.cycle.previousCycleId)];
  assert.equal(functionalAssessmentService.getById(c1.baselineAssessmentId).result.totalDurationMs, 12800);
  assert.equal(functionalAssessmentService.getById(c1.reassessmentId).result.totalDurationMs, 8900);
  assert.equal(c2.baselineAssessmentId, c1.reassessmentId, "Cycle 2 reuses the reassessment");
  assert.equal(progress.currentCycle.baselineMs, 8900);
  const series = progress.assessmentSeries;
  assert.deepEqual(series.map((p) => [p.dateKey, p.totalDurationMs]), [["2026-09-22", 12800], ["2026-09-28", 8900]], "only the formal chain");
  assert.equal(new Set(series.map((p) => p.assessmentId)).size, series.length, "8.9 (reused baseline) appears once");
  for (const ms of [24100, 22800, 8200, 8300]) assert.ok(!series.some((p) => p.totalDurationMs === ms), `old run ${ms} not in the trend`);
  assert.equal(functionalAssessmentService.getByPatientId(P00.id, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).length, 7, "old sessions are kept (not deleted)");
  assert.deepEqual([progress.previousCycle.comparison.baselineText, progress.previousCycle.comparison.reassessmentText], ["12.8 秒", "8.9 秒"]);
  // pure: foreign / invalid sessions skipped, shared ids once
  const sess = { a: { id: "a", patientId: "u", status: "completed", result: { status: "completed", repCount: 5, totalDurationMs: 9000, measuredAt: "2026-01-01T01:00:00Z" } },
    b: { id: "b", patientId: "x", status: "completed", result: { status: "completed", repCount: 5, totalDurationMs: 7000, measuredAt: "2026-01-02T01:00:00Z" } } };
  const out = buildTrackingAssessmentSeries([{ id: "c1", userId: "u", baselineAssessmentId: "a", reassessmentId: "b", cycleStartDateKey: "2026-01-01" }, { id: "c2", userId: "u", baselineAssessmentId: "a", cycleStartDateKey: "2026-01-02" }], (id) => sess[id], "u");
  assert.deepEqual(out.map((p) => p.assessmentId), ["a"], "another user's session is never plotted; a shared id once");
}

// no tracking cycle: completed 5xSTS runs are NOT a longitudinal trend
{
  const u = "no-cycle-user";
  for (const [ms, d] of [[9000, 10], [8800, 12], [8600, 14]]) {
    const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(2026, 8, d, 9).toISOString() } });
  }
  const p = functionalProgressService.getFunctionalProgress(u, TODAY);
  assert.equal(p.currentCycle, null);
  assert.deepEqual(p.assessmentSeries, []);
}

// rendered Data section (real renderDataFunctionalSection / renderF01DurationChart)
const dataFactory = new Function("ctx", `
  const { TRACKING_STATUS, TRACKING_CYCLE_LENGTH_DAYS, formatDateKeyMonthDay } = ctx;
  ${constLine("fmtFa5xSec")}
  ${fnSrc("renderDataFunctionalSection")}
  ${fnSrc("renderF01DurationChart")}
  return { renderDataFunctionalSection };
`);
{
  const { renderDataFunctionalSection } = dataFactory(TC);
  const html = renderDataFunctionalSection(progress);
  const labels = html.slice(html.indexOf("data-f01-trend-labels"));
  assert.equal((labels.match(/<span><b>/g) || []).length, 2, "two trend points");
  assert.ok(labels.includes("<b>12.8 秒</b>09/22") && labels.includes("<b>8.9 秒</b>09/28"));
  assert.ok(!/24\.1|22\.8|8\.2 秒|8\.3 秒/.test(html), "no old test runs");
  assert.ok(html.includes("第 3 / 7 天") && html.includes("<span>目前基準</span><b>8.9 秒</b>") && html.includes("<span>本週完成</span><b>2 天</b>") && html.includes("10/04"));
  assert.ok(html.includes("上一週") && html.includes("12.8 秒 → 8.9 秒") && html.includes(`goTrackingComparison('${progress.previousCycle.cycle.id}')`) && html.includes("查看前後比較"));
  assert.ok(!/改善|變好|退步|恢復|正常範圍|風險/.test(html), "neutral wording, no cut-offs");
  const empty = renderDataFunctionalSection(functionalProgressService.getFunctionalProgress("no-cycle-user", TODAY));
  assert.ok(empty.includes("尚未開始功能追蹤") && !empty.includes("data-f01-trend"), "no cycle -> no trend");
}

// 近 7 天 wording = the real window (rolling 7 local days ending today)
{
  const tes = readFileSync(join(root, "js/data/trainingEventService.js"), "utf8");
  assert.ok(/startKey: addDaysToDateKey\(todayKey, -6\), endKey: todayKey/.test(tes), "weekWindow is a rolling 7-day window");
  const ov = fnSrc("patientDataOverviewPage");
  for (const t of ["近 7 天訓練", "近 7 天訓練天數", "近 7 天平均 AI 姿勢分數"]) assert.ok(ov.includes(t), t);
  assert.ok(!/本週完成訓練|本週平均 AI|>本週訓練</.test(ov));
  const rec = fnSrc("actionRecordsPage");
  assert.ok(rec.includes("近 7 天訓練") && rec.includes("近 7 天 XP") && rec.includes("近 7 天活動") && !rec.includes("本週 XP"));
  assert.ok(fnSrc("buildWeeklyComparisonLabel").includes("比前 7 天多"));
}

// ── F01 功能追蹤 timeline (目前 → 週卡 → 週次趨勢) ─────────────────────
{
  const t = functionalProgressService.getTrackingTimeline(P00.id, TODAY);
  assert.deepEqual(t.weeks.map((w) => [w.weekNumber, w.status, w.baselineMs, w.reassessmentMs, w.changeMs, w.completedDays]),
    [[1, "completed", 12800, 8900, -3900, 6], [2, "in_progress", 8900, null, null, 2]]);
  assert.deepEqual([t.current.weekNumber, t.current.view.cycleDay, t.current.baselineMs, t.current.plannedReassessmentDateKey], [2, 3, 8900, "2026-10-04"]);
  assert.deepEqual(t.trend.nodes.map((n) => (n.pending ? "?" : n.ms)), [12800, 8900, "?"], "12.8 ─ 8.9 ─ ? (reused baseline is one node)");
  assert.deepEqual(t.trend.segments.map((sg) => [sg.week, sg.pending]), [[1, false], [2, true]]);
  const pageFactory = new Function("ctx", `
    const { getCurrentPatientId, functionalProgressService, getTrackingTodayKey, formatDateKeyMonthDay, TRACKING_STATUS, TRACKING_CYCLE_LENGTH_DAYS, cycleTrainingPerformanceService, compareCycleScores } = ctx;
    ${constLine("fmtFa5xSec")}
    ${fnSrc("renderF01WeekTrendChart")}
    ${fnSrc("f01TrackingHistoryPage")}
    return f01TrackingHistoryPage;
  `);
  const html = pageFactory({ getCurrentPatientId: () => P00.id, functionalProgressService, getTrackingTodayKey: () => TODAY, ...TC, ...CTP })();
  for (const text of ["F01 下肢功能｜功能追蹤", ">目前<", "第 2 週｜第 3 / 7 天", "<b>8.9 秒</b>", "10/04",
    "第 1 週 ✓", "09/22 → 09/28", "12.8 秒 → 8.9 秒", "完成時間差異：少 3.9 秒", "訓練完成：6 天", "查看第 1 週前後比較",
    "第 2 週｜進行中", "基準 8.9 秒", "完成 2 天", "等待 10/04 再次評估", "功能追蹤趨勢", ">W1<", ">W2<", ">12.8<", ">8.9<", ">?<"]) {
    assert.ok(html.includes(text), `timeline shows ${text}`);
  }
  assert.ok(html.indexOf("第 1 週 ✓") < html.indexOf("第 2 週｜進行中"), "weeks oldest first");
  // shared baseline: one 8.9 node labelled 再次評估／新週基準
  assert.equal((html.match(/>8\.9</g) || []).length, 1, "8.9 drawn once");
  assert.ok(html.includes("再次評估／新週基準") && t.trend.nodes[1].shared === true && !t.trend.nodes[0].shared);
  // D4 opened from here returns here
  assert.ok(html.includes(`goTrackingComparison('${t.weeks[0].cycleId}', 'trackingHistory')`));
  // 訓練表現 after the 5xSTS trend (secondary): week 1 derived average, week 2 「—」
  const perf = CTP.cycleTrainingPerformanceService.getByCycle(P00.id).get(t.weeks[0].cycleId);
  assert.deepEqual([perf.completedTrainingCount, perf.trainingDays, perf.scoredEventCount], [12, 6, 12]);
  assert.ok(html.indexOf("功能追蹤趨勢") < html.indexOf(">訓練表現<"), "AI 姿勢分數 comes after the primary outcome");
  assert.ok(html.includes(`<span>第 1 週</span><b>${perf.averageAiPostureScore}</b>`) && html.includes("<span>第 2 週｜目前</span><b>89</b>"), "week 2 derived from its own two formal days");
  assert.equal(perf.averageAiPostureScore, 86);
  assert.ok(html.includes("較前一週高 3") && html.includes("+3"), "neutral cross-week difference");
  assert.ok(!/改善|進步|退步|復健成效/.test(html));
  assert.ok(html.includes("switchTab('data')") && !/改善|變好|退步|恢復/.test(html), "own back button, neutral wording");
  assert.ok(!/24\.1|22\.8|>8\.2<|>8\.3</.test(html), "old test runs never plotted");
  const empty = pageFactory({ getCurrentPatientId: () => "no-cycle-user", functionalProgressService, getTrackingTodayKey: () => TODAY, ...TC, ...CTP })();
  assert.ok(empty.includes("尚未開始功能追蹤") && !empty.includes("f01-week-chart"));
}

// ── 我的 (Profile IA) ──────────────────────────────────────────────────
const relations = createCollection("therapistPatientRelations");
const users = createCollection("users");
users.create({ id: "t-demo", name: "Demo 復健師", role: "therapist" });
relations.create({ id: "rel-now", therapistId: "t-demo", patientId: P00.id, status: "accepted", createdAt: "2026-07-29T02:00:00.000Z", acceptedAt: "2026-07-29T02:00:00.000Z" });
relations.create({ id: "rel-past", therapistId: "t-demo", patientId: P00.id, status: "completed", createdAt: "2026-03-26T02:00:00.000Z", acceptedAt: "2026-03-26T02:00:00.000Z", completedAt: "2026-06-24T02:00:00.000Z", endReason: "療程完成" });

const profileFactory = new Function("ctx", `
  const { state, gamificationEngine, trackingCycleService, F01_GOALS, F01_FUNCTIONAL_DOMAIN, relationService, userService, f01AdventureService, getTrackingTodayKey, analysisService } = ctx;
  ${constLine("PATIENT_LEAVE_REASONS")}
  ${fnSrc("renderPatientLeaveCard")}
  ${fnSrc("renderPatientCareHistory")}
  ${fnSrc("profilePage")}
  return { profilePage };
`);
const renderProfile = (extraState = {}) => profileFactory({
  state: { user: { id: P00.id, name: "Demo 患者", role: "patient" }, ...extraState },
  gamificationEngine, trackingCycleService, F01_GOALS, F01_FUNCTIONAL_DOMAIN, relationService, userService, f01AdventureService,
  getTrackingTodayKey: () => TODAY, analysisService: null,
}).profilePage();

{
  const html = renderProfile();
  const g = gamificationEngine.getGamificationSummary(P00.id);
  const adv = f01AdventureService.getAdventure(P00.id, TODAY);
  const order = ["profile-hero", ">我的復健設定<", ">我的復健師<", ">復健成就<", ">帳號與設定<"].map((t) => html.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), "個人摘要 → 復健設定 → 復健師 → 復健成就 → 帳號與設定");
  // ① hero from I-2 data
  assert.ok(html.includes(`<b>Lv.${g.level}</b><span>${g.title}</span>`) && html.includes(`XP ${g.currentLevelXp} / ${g.nextLevelXp}`));
  assert.ok(!/累積訓練|連續天數|平均 AI 姿勢分數/.test(html), "no KPI tiles on 我的");
  // ② settings
  assert.ok(html.includes("F01 下肢功能") && html.includes("加強足踝力量與控制") && html.includes("<span class=\"small\">限制條件</span><b>無</b>"));
  assert.ok(html.includes("goAssessmentSettings()") && html.includes("查看設定") && !html.includes("查看／修改我的復健需求評估"));
  // ③ therapist + collapsed history; leaving is second-level
  assert.ok(html.includes("Demo 復健師") && html.includes("目前合作中") && html.includes("2026/07/29"));
  assert.ok(html.includes("管理復健師關係") && !html.includes("startPatientLeave()"), "離開 is not a first-level button");
  assert.ok(/<details class="profile-history">\s*<summary><span>照護歷史（1）<\/span>/.test(html) && !/<details class="profile-history" open/.test(html), "care history collapsed");
  const managed = renderProfile({ profileTherapistManage: true });
  assert.ok(managed.includes('onclick="startPatientLeave()"') && managed.includes("profile-danger-link"), "the leave route stays reachable");
  const confirming = renderProfile({ profileTherapistManage: true, patientLeaveConfirming: true });
  assert.ok(confirming.includes("confirmPatientLeave('rel-now')"), "existing leave confirmation unchanged");
  // ④ one gamification summary from I-2 / I-3
  const unlocked = g.achievements.filter((a) => a.unlocked);
  assert.ok(html.includes(`已解鎖 ${unlocked.length} / ${g.achievements.length}`) && html.includes(`${adv.chapterLabel}進行中`));
  assert.equal((html.match(/class="profile-badge"/g) || []).length, 3, "at most 3 badges");
  assert.equal((html.match(/goAchievements\(\)/g) || []).length, 1);
  assert.equal((html.match(/goMap\(\)/g) || []).length, 1);
  assert.ok(html.includes("查看成就") && html.includes("查看復健旅程"));
  // removed duplicate entries
  assert.ok(!html.includes("goActionRecords()") && !html.includes("動作紀錄"), "no 動作紀錄 entry");
  assert.ok(!html.includes("成就牆") && !html.includes(">冒險地圖<"), "no 成就牆 / 冒險地圖 big entries");
  assert.ok(!/goSchedule\(\)|todaySchedule|switchTab\('data'\)/.test(html), "no today plan / data entries");
  // account: quiet text action
  assert.ok(/<button class="logout-secondary" onclick="logout\(\)">登出<\/button>/.test(html) && !/btn-primary[^>]*logout/.test(html));
  // routes kept
  for (const r of ["goActionRecords", "goAchievements", "goMap", "startPatientLeave", "confirmPatientLeave"]) assert.ok(appJs.includes(`function ${r}(`), `${r} route kept`);
}

// no therapist: plain line, no history block noise
{
  const html = profileFactory({
    state: { user: { id: "lonely", name: "新患者", role: "patient" } },
    gamificationEngine, trackingCycleService, F01_GOALS, F01_FUNCTIONAL_DOMAIN, relationService, userService, f01AdventureService,
    getTrackingTodayKey: () => TODAY, analysisService: null,
  }).profilePage();
  assert.ok(html.includes("尚未加入任何復健師") && html.includes("照護歷史（0）") && html.includes("尚未開始旅程") && html.includes("尚未開始功能追蹤"));
}

console.log("Data showcase cleanup + profile IA tests passed");
