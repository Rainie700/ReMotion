import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Phase D4 — baseline vs reassessment 5xSTS comparison of ONE tracking cycle.
 * Read-only, derived from the cycle + the two stored sessions; neutral
 * wording (少 / 多 X 秒), no percentage, no improvement / decline judgement.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const cmpSrc = readFileSync(join(root, "js/data/trackingComparison.js"), "utf8");
const T = await import("../js/data/trackingCycle.js");
const C = await import("../js/data/trackingComparison.js");
const { trackingCycleService, REASSESSMENT_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const D1 = [2026, 8, 28], D7 = [2026, 9, 4];
const key = ([y, m, d]) => T.toLocalDateKey(new Date(y, m, d, 12, 0));
const REPS = [1800, 1700, 1750, 1800, 1850];

// ── pure-function fixtures ────────────────────────────────────────────────
function pureFixture({ baseMs = 8900, reMs = 8200, baseReps = REPS, reReps = [1600, 1650, 1600, 1700, 1650], dates = ["2026-09-28", "2026-09-30", "2026-09-29"] } = {}) {
  const cycle = { id: "cyc1", userId: "u1", functionalDomain: "F01", assessmentType: "5xSTS", baselineAssessmentId: "b1", reassessmentId: "r1", completedTrainingDates: dates };
  const mk = (id, ms, reps, day, extra = {}) => ({
    id, patientId: "u1", assessmentType: "five_times_sit_to_stand", status: "completed",
    result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, repDurationsMs: reps, measuredAt: new Date(...day, 14, 0).toISOString(), ...extra },
  });
  return {
    cycle,
    baselineAssessment: mk("b1", baseMs, baseReps, D1),
    reassessment: mk("r1", reMs, reReps, D7, { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: "cyc1" }),
  };
}

// 1. Basic comparison (8.9 -> 8.2)
{
  const c = C.buildTrackingComparison(pureFixture());
  assert.equal(c.eligible, true);
  assert.equal(c.baselineMs, 8900);
  assert.equal(c.reassessmentMs, 8200);
  assert.equal(c.changeMs, -700);
  assert.equal(c.baselineText, "8.9 秒");
  assert.equal(c.reassessmentText, "8.2 秒");
  assert.equal(c.differenceText, "本次完成時間較初次少 0.7 秒");
  assert.equal(c.baselineDateKey, key(D1));
  assert.equal(c.reassessmentDateKey, key(D7));
  assert.equal(c.baselineDateText, "09/28");
  assert.equal(c.reassessmentDateText, "10/04");
  assert.ok(!("improvementPercent" in c), "no percentage field");
}

// 2. Reverse direction
{
  const c = C.buildTrackingComparison(pureFixture({ baseMs: 8200, reMs: 8900 }));
  assert.equal(c.changeMs, 700);
  assert.equal(c.differenceText, "本次完成時間較初次多 0.7 秒");
}

// 3. Same value
{
  const c = C.buildTrackingComparison(pureFixture({ baseMs: 8900, reMs: 8900 }));
  assert.equal(c.changeMs, 0);
  assert.equal(c.differenceText, "本次完成時間與初次相同");
}

// 4. Precision: raw ms first, format last (8940 vs 8860 -> -80 ms, never 0)
{
  const a = C.buildTrackingComparison(pureFixture({ baseMs: 8940, reMs: 8860 }));
  assert.equal(a.changeMs, -80);
  assert.equal(a.differenceText, "本次完成時間較初次少 0.1 秒");
  const b = C.buildTrackingComparison(pureFixture({ baseMs: 8860, reMs: 8940 }));
  assert.equal(b.changeMs, 80);
  assert.equal(b.differenceText, "本次完成時間較初次多 0.1 秒");
  // both display "8.9 秒" but the difference is not 0 / "相同"
  const c = C.buildTrackingComparison(pureFixture({ baseMs: 8900, reMs: 8920 }));
  assert.equal(c.changeMs, 20);
  assert.notEqual(c.differenceText, "本次完成時間與初次相同");
  assert.equal(c.differenceText, "本次完成時間與初次相差不到 0.1 秒");
  assert.equal(C.buildTrackingComparison(pureFixture({ baseMs: 12345, reMs: 10001 })).changeMs, -2344);
  assert.equal(C.buildTrackingComparison(pureFixture({ baseMs: 12345, reMs: 10001 })).differenceText, "本次完成時間較初次少 2.3 秒");
}

// 5. Linkage / eligibility (pure)
{
  const notEligible = (fx, needle) => {
    const c = C.buildTrackingComparison(fx);
    assert.equal(c.eligible, false);
    assert.ok(c.missing.some((m) => m.includes(needle)), `missing should mention "${needle}": ${JSON.stringify(c.missing)}`);
    assert.equal(c.changeMs, undefined);
  };
  let fx = pureFixture(); fx.cycle.reassessmentId = null; fx.reassessment = null;
  notEligible(fx, "尚未完成再次評估");
  fx = pureFixture(); fx.baselineAssessment.id = "other"; notEligible(fx, "初次評估不屬於這個追蹤週期");
  fx = pureFixture(); fx.reassessment.id = "other"; notEligible(fx, "再次評估不屬於這個追蹤週期");
  fx = pureFixture(); fx.reassessment.patientId = "u2"; notEligible(fx, "再次評估不屬於此使用者");
  fx = pureFixture(); fx.baselineAssessment.patientId = "u2"; notEligible(fx, "初次評估不屬於此使用者");
  fx = pureFixture(); fx.reassessment.assessmentType = "f02_upper"; notEligible(fx, "再次評估不是五次坐站測試");
  fx = pureFixture(); delete fx.baselineAssessment.assessmentType; notEligible(fx, "初次評估不是五次坐站測試");
  fx = pureFixture(); fx.cycle.functionalDomain = "F02"; notEligible(fx, "不是 F01");
  fx = pureFixture(); fx.reassessment.result.trackingCycleId = "cyc-other"; notEligible(fx, "再次評估沒有連結到這個追蹤週期");
  fx = pureFixture(); fx.reassessment.status = "incomplete"; fx.reassessment.result.status = "incomplete"; notEligible(fx, "再次評估未完成");
  fx = pureFixture(); fx.baselineAssessment.result.status = "invalid"; notEligible(fx, "初次評估未完成");
  notEligible({ cycle: pureFixture().cycle, baselineAssessment: null, reassessment: pureFixture().reassessment }, "找不到初次評估資料");
  assert.deepEqual(C.buildTrackingComparison({ cycle: null }).missing, ["找不到這個追蹤週期"]);
}

// 6. Training days = unique completedTrainingDates, ascending; no percentage
{
  const c = C.buildTrackingComparison(pureFixture({ dates: ["2026-09-30", "2026-09-28", "2026-09-30", "2026-10-01"] }));
  assert.equal(c.completedTrainingDays, 3);
  assert.deepEqual(c.completedTrainingDateKeys, ["2026-09-28", "2026-09-30", "2026-10-01"]);
  const none = C.buildTrackingComparison(pureFixture({ dates: [] }));
  assert.equal(none.completedTrainingDays, 0);
  const missing = pureFixture(); delete missing.cycle.completedTrainingDates;
  assert.equal(C.buildTrackingComparison(missing).completedTrainingDays, 0);
}

// 7. Rep-by-rep rows only when BOTH sides have 5 finite rep durations
{
  const c = C.buildTrackingComparison(pureFixture());
  assert.equal(c.repComparison.length, 5);
  assert.deepEqual(c.repComparison[0], { repNumber: 1, baselineMs: 1800, reassessmentMs: 1600, baselineText: "1.8 秒", reassessmentText: "1.6 秒" });
  assert.equal(C.buildTrackingComparison(pureFixture({ baseReps: null })).repComparison, null);
  assert.equal(C.buildTrackingComparison(pureFixture({ reReps: [1600, 1650, 1600, 1700] })).repComparison, null);
  assert.equal(C.buildTrackingComparison(pureFixture({ reReps: [1600, 1650, null, 1700, 1650] })).repComparison, null);
  // missing reps never block the time comparison itself
  assert.equal(C.buildTrackingComparison(pureFixture({ baseReps: null })).eligible, true);
}

// 8. Legacy / missing data never crashes
{
  let fx = pureFixture(); delete fx.baselineAssessment.result.totalDurationMs;
  let c = C.buildTrackingComparison(fx);
  assert.equal(c.eligible, false);
  assert.ok(c.missing.some((m) => m.includes("此筆評估缺少可比較的完成時間")));
  fx = pureFixture(); fx.reassessment.result = null;
  c = C.buildTrackingComparison(fx);
  assert.equal(c.eligible, false);
  assert.ok(c.missing.some((m) => m.includes("此筆評估缺少可比較的完成時間")));
  // legacy result without status (pre-Phase B) but with 5 reps + total time is comparable
  fx = pureFixture(); delete fx.baselineAssessment.result.status;
  assert.equal(C.buildTrackingComparison(fx).eligible, true);
  // no measuredAt / completedAt: date shows "—", never 1970
  fx = pureFixture(); delete fx.baselineAssessment.result.measuredAt;
  c = C.buildTrackingComparison(fx);
  assert.equal(c.baselineDateKey, null);
  assert.equal(c.baselineDateText, "—");
}

// ── service: real stored records, ownership, read-only ────────────────────
function storedBaseline(userId, ms = 8900) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { status: "completed", completedReps: 5, repCount: 5, totalDurationMs: ms, repDurationsMs: REPS, measuredAt: new Date(...D1, 14, 0).toISOString() } });
  return functionalAssessmentService.getById(s.id);
}
function storedCycle(userId) {
  const b = storedBaseline(userId);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G01", availableMinutes: 20, catalog: exerciseService.listNormalized() });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: userId, result: r, createdBy: userId }).recommendation;
  return trackingCycleService.createOrGetTrackingCycle({ userId, baselineSession: b, recommendation: rec }).cycle;
}
function storedReassessment(userId, cycle, ms) {
  const s = functionalAssessmentService.create({ patientId: userId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { status: "completed", completedReps: 5, repCount: 5, totalDurationMs: ms, measuredAt: new Date(...D7, 15, 0).toISOString(), assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: cycle.baselineAssessmentId } });
  return functionalAssessmentService.getById(s.id);
}

{
  const cycle = storedCycle("userA");
  // before reassessment: not comparable, missing listed
  let res = trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: "userA" });
  assert.equal(res.comparison.eligible, false);
  assert.ok(res.comparison.missing.includes("尚未完成再次評估"));

  const re = storedReassessment("userA", cycle, 8200);
  const link = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: "userA", reassessment: re, todayDateKey: key(D7) });
  assert.equal(link.linked, true);
  const before = JSON.stringify(trackingCycleService.getTrackingCycleById(cycle.id));
  const storeBefore = JSON.stringify([...mem.entries()]);

  res = trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: "userA" });
  assert.equal(res.comparison.eligible, true);
  assert.equal(res.comparison.changeMs, -700);
  assert.equal(res.comparison.differenceText, "本次完成時間較初次少 0.7 秒");
  assert.equal(res.comparison.baselineDateKey, key(D1));
  assert.equal(res.comparison.reassessmentDateKey, key(D7));
  assert.equal(res.comparison.repComparison, null, "reassessment without reps -> table hidden");

  // read-only: nothing written back (no difference / percentage fields)
  assert.equal(JSON.stringify(trackingCycleService.getTrackingCycleById(cycle.id)), before);
  assert.equal(JSON.stringify([...mem.entries()]), storeBefore);
  const stored = trackingCycleService.getTrackingCycleById(cycle.id);
  for (const f of ["changeMs", "improvementPercent", "comparison", "differenceText"]) assert.ok(!(f in stored), `cycle must not store ${f}`);

  // ownership: B cannot read A's cycle
  assert.deepEqual(trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: "userB" }), { error: "not_owner" });
  assert.deepEqual(trackingCycleService.getTrackingCycleComparison({ cycleId: cycle.id, userId: null }), { error: "not_owner" });
  assert.deepEqual(trackingCycleService.getTrackingCycleComparison({ cycleId: "nope", userId: "userA" }), { error: "cycle_not_found" });
}

// ── app wiring (source checks) ────────────────────────────────────────────
function fnBody(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
{
  const page = fnBody("trackingComparisonPage");
  assert.ok(page.includes("五次坐站｜前後比較"));
  assert.ok(page.includes("F01 下肢功能｜7 日追蹤結果"));
  assert.ok(page.includes("目前無法建立完整前後比較"));
  assert.ok(page.includes("完成時間差異"));
  assert.ok(page.includes("本週完成訓練：${cmp.completedTrainingDays} 天"));
  assert.ok(page.includes("這裡整理你在本次 7 日追蹤前後的五次坐站結果。初次評估與再次評估使用相同的量測方式，完成時間與訓練紀錄可作為後續追蹤比較的依據。"));
  // Flow & Data QA — the per-rep values are phase durations, not full sit-to-stands: never shown.
  assert.ok(!/每一次坐站時間|cmp-rep-row|cmp\.repComparison\.map/.test(page), "no per-rep 「第 N 次」 table");
  assert.ok(page.includes("返回首頁"));
  assert.ok(!/startRecommendationFromFiveTimesSitToStand|goF01RecommendationSetup|goFunctionalChangeTrend/.test(page), "no next-stage recommendation / unreliable history link");
  assert.ok(!page.includes("%"), "no percentage");
  assert.ok(page.includes("getTrackingCycleComparison({ cycleId: state.trackingComparisonCycleId, userId: getCurrentPatientId() })"));

  assert.ok(appJs.includes("compare: (cycle) => `goTrackingComparison('${cycle.id}')`"), "home completed CTA opens the comparison");
  assert.ok(appJs.includes("window.goTrackingComparison = goTrackingComparison"));
  assert.ok(appJs.includes('state.route === "trackingComparison"'));
  const card = fnBody("renderTrackingCycleCard");
  // Homepage redesign — completed cycle: both times come from the same read-only comparison.
  assert.ok(card.includes("baselineText = cmp.comparison.baselineText;") && card.includes("reassessmentText = cmp.comparison.reassessmentText;"));
  const resultPage = fnBody("fiveTimesSitToStandResultPage");
  assert.ok(resultPage.includes(`onclick="goTrackingComparison('\${reCycle.id}')">查看前後比較 →`));
}

// 9. Forbidden judgement words: none in the comparison module / page / outputs
{
  const FORBIDDEN = ["改善", "退步", "提升", "降低功能", "維持", "進階", "退階", "完成時間降低"];
  const texts = [
    stripComments(cmpSrc),
    stripComments(fnBody("trackingComparisonPage")),
    ...[[8900, 8200], [8200, 8900], [8900, 8900], [8900, 8920]].map(([b, r]) => JSON.stringify(C.buildTrackingComparison(pureFixture({ baseMs: b, reMs: r })))),
  ];
  for (const t of texts) for (const w of FORBIDDEN) assert.ok(!t.includes(w), `forbidden word "${w}"`);
}

console.log("trackingComparison tests passed");
