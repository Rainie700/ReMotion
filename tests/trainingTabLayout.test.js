import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Training Tab visual re-layout — renders the REAL todaySchedulePage() and its
 * helpers from app.js against plans built by the REAL todayPlanAggregator
 * (buildTodayPlan). Only UI collaborators (images, catalog lookup, week strip)
 * are stubbed. Presentation only: counts / completion / canStart come from the plan.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const P = await import("../js/data/todayPlanAggregator.js");

const fnSrc = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `app.js has ${name}`);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
const constSrc = (name) => {
  const line = appJs.split(/\r?\n/).find((l) => l.startsWith(`const ${name} =`));
  assert.ok(line, `app.js has const ${name}`);
  return line;
};

const FNS = ["todaySchedulePage", "todayPlanDayLabel", "renderTodayTaskImage", "todayTaskDoseText", "renderTodayTaskCard", "renderTodayTherapistTask", "renderTodayRemotionTask", "renderTodayPlanNotice", "renderProgressBar", "sourceBadgeClassFor", "generateScheduleReminder"];
const CONSTS = ["WEEKDAY_LABELS", "todayTaskAiMeta", "todayGroupHead"];
const TODAY = "2026-09-29";
const CATALOG = {
  "F01-04": { id: "F01-04", name: "迷你深蹲", reps: 10, sets: 1, duration: null, raw: { trainingMode: "pose_analysis" } },
  "F01-17": { id: "F01-17", name: "雙腳提踵", reps: 10, sets: 2, duration: null, raw: { trainingMode: "pose_analysis" } },
  "F01-06": { id: "F01-06", name: "坐姿膝伸直", reps: 10, sets: 1, duration: null, raw: {} },
  "F01-02": { id: "F01-02", name: "扶椅坐站", reps: 8, sets: 1, duration: null, raw: {} },
};
const factory = new Function("ctx", `
  const { state, getCurrentPatientId, todayStr, getTodayPlanForPatient, scheduleService, exerciseService, buildWeekStripDates,
    renderExerciseCardImage, renderF01RecommendationImage, F01_DEMO_IMAGE_PENDING, TODAY_PLAN_NOTICE, TODAY_PLAN_REMOTION_KIND, F01_FUNCTIONAL_DOMAIN } = ctx;
  ${CONSTS.map(constSrc).join("\n")}
  ${FNS.map(fnSrc).join("\n")}
  return { todaySchedulePage };
`);
function render(plan, { schedule = null, viewDate = plan.dateKey } = {}) {
  const ctx = {
    state: { scheduleViewDate: viewDate },
    getCurrentPatientId: () => "u1",
    todayStr: () => TODAY,
    getTodayPlanForPatient: () => plan,
    scheduleService: { getById: (id) => (schedule && schedule.id === id ? schedule : null) },
    exerciseService: { getNormalizedById: (id) => CATALOG[id] || null },
    buildWeekStripDates: () => ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"],
    renderExerciseCardImage: (c) => `<img data-ex="${c.id}" />`,
    renderF01RecommendationImage: (id) => `<div class="exercise-image-placeholder" data-pending="${id}"><span>示意圖待補</span></div>`,
    F01_DEMO_IMAGE_PENDING: new Set(["F01-02"]),
    TODAY_PLAN_NOTICE: P.TODAY_PLAN_NOTICE,
    TODAY_PLAN_REMOTION_KIND: P.TODAY_PLAN_REMOTION_KIND,
    F01_FUNCTIONAL_DOMAIN: { key: "F01", label: "下肢功能" },
  };
  return factory(ctx).todaySchedulePage();
}

// fixtures (store rows shaped as the real services persist them)
const cycle = { id: "cyc1", userId: "u1", recommendationId: "rec1", cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", reassessmentId: null,
  dailyTrainingProgress: { [TODAY]: { dateKey: TODAY, requiredExerciseIds: ["F01-17", "F01-02"], completedExerciseIds: ["F01-02"], exerciseCompletions: {}, isComplete: false } } };
const rec = { id: "rec1", patientId: "u1", kind: "f01_goal", items: [{ exerciseId: "F01-17", exerciseName: "雙腳提踵" }, { exerciseId: "F01-02", exerciseName: "扶椅坐站" }] };
const schedule = { id: "sch1", patientId: "u1", date: TODAY, status: "in_progress", exercises: [
  { exerciseId: "F01-04", exerciseName: "迷你深蹲", sets: 1, repetitions: 10, status: "completed" },
  { exerciseId: "F01-06", exerciseName: "坐姿膝伸直", sets: 1, repetitions: 10, status: "pending" },
] };
const legacy = { id: "leg1", patientId: "u1", items: [{ exerciseId: "F01-04", suggestedReps: 12, suggestedSets: 1 }, { exerciseId: "F01-06", suggestedReps: 10 }] };
const plan = (over) => P.buildTodayPlan({ patientId: "u1", todayKey: TODAY, ...over });
const count = (html, needle) => html.split(needle).length - 1;
const between = (html, a, b) => { const i = html.indexOf(a); const j = b ? html.indexOf(b, i + 1) : -1; return i === -1 ? "" : html.slice(i, j === -1 ? undefined : j); };

// 1 + 3 — ReMotion only: no therapist section / empty card, one muted line, tasks directly under 今日任務
{
  const p = plan({ activeCycle: cycle, cycleRecommendation: rec });
  const html = render(p);
  assert.ok(!html.includes('todayGroupHead') && !html.includes("today-group-head\"><div><b>復健師安排"), "no therapist group");
  assert.ok(!/class="card[^"]*"[^>]*>[^<]*今天沒有復健師安排/.test(html), "no large therapist empty card");
  assert.equal(count(html, "今天沒有復健師安排。"), 1, "one small muted line");
  assert.ok(html.includes('class="small today-plan-muted"'));
  assert.ok(html.indexOf(">今日任務<") < html.indexOf("<b>ReMotion 建議</b>"), "ReMotion tasks directly under 今日任務");
  assert.ok(html.includes("<b>1 / 2</b>"), "overview X / Y from the plan");
  assert.ok(html.includes("復健師 無安排") && html.includes("ReMotion 建議 2 項"), "source chips, no 0 / 0");
  assert.ok(!html.includes("0 / 0"), "never 復健師 0 / 0");
  assert.ok(html.includes("F01 下肢功能"), "F01 secondary label");
  assert.ok(html.includes('data-pending="F01-02"'), "pending demo image keeps the placeholder");
}

// 2 + 6 + 7 + 11 + 12 — therapist + ReMotion + additional
{
  const p = plan({ schedule, activeCycle: cycle, cycleRecommendation: rec, legacyRecommendation: legacy });
  const html = render(p, { schedule });
  assert.ok(html.includes("<b>復健師安排</b>") && html.includes("<b>ReMotion 建議</b>"), "both groups");
  assert.ok(html.indexOf("<b>復健師安排</b>") < html.indexOf("<b>ReMotion 建議</b>"), "therapist first");
  assert.ok(!html.includes("沒有復健師安排"), "no 'no therapist' copy when there is one");
  assert.ok(html.includes("請優先依安排內容進行。"), "small therapist-first hint");
  assert.equal(p.summary.totalAssignedCount, 4, "primary ReMotion counted; additional not");
  assert.ok(html.includes("<b>2 / 4</b>"), "overview shows the aggregator's X / Y unchanged");
  assert.ok(html.includes("復健師安排 2 項") && html.includes("ReMotion 建議 2 項"));
  // additional: collapsed <details>, compact cards
  const more = between(html, '<details class="today-plan-more">', "</details>");
  assert.ok(more && !/<details[^>]*\bopen\b/.test(more), "其他 ReMotion 建議 collapsed by default");
  assert.ok(more.includes("其他 ReMotion 建議（2）") && more.includes("查看其他建議"));
  assert.ok(more.includes("today-task--compact"), "lighter compact cards");
  assert.ok(!between(html, 'class="today-section"', '<details').includes("today-task--compact"), "primary tasks are not compact");
  // source badges
  const ther = between(html, "<b>復健師安排</b>", "<b>ReMotion 建議</b>");
  assert.equal(count(ther, 'source-tag-badge assigned">復健師安排<'), 2, "therapist badge");
  assert.ok(count(html, 'source-tag-badge recommendation">ReMotion 建議<') >= 4, "ReMotion badge (primary + additional)");
  // start actions keep the I-4 formal context
  assert.ok(ther.includes("startTodayScheduleTask('sch1', 1)") && ther.includes("goExerciseDetail('sch1', 1)"), "therapist → assigned context");
  assert.ok(html.includes("startTodayPlanTask('f01_cycle', 'cyc1', 'F01-17')") && html.includes("goTodayPlanItem('f01_cycle', 'cyc1', 'F01-17')"), "F01 → cycle context");
  assert.ok(more.includes("startTodayPlanTask('legacy_remotion_recommendation', 'leg1', 'F01-06')"), "older plan → its recommendation id");
  assert.ok(!/startTodayPlanTask\('[^']*', '[^']*', '[^']*'\)"[^>]*>(?!開始|繼續)/.test(html));
  assert.ok(!html.includes("查看並開始"), "short CTA");
  assert.ok(html.includes(">開始</button>"), "primary CTA 開始");
  assert.ok(html.includes("10 次 × 2 組 · AI 姿勢分析"), "dose + AI 姿勢分析 metadata");
  const start = fnSrc("startTodayPlanTask");
  assert.ok(start.includes("goTodayPlanItem(kind, planId, exerciseId)") && start.includes("goDetectionPrep()"), "開始 = formal entry, then prep");
  assert.ok(fnSrc("startTodayScheduleTask").includes("goExerciseDetail(scheduleId, index)"));
}

// 8 — completed task: ✓ 已完成, no start CTA on that card
{
  const p = plan({ schedule, activeCycle: cycle, cycleRecommendation: rec });
  const html = render(p, { schedule });
  const cards = html.split(/<div class="today-task(?=[ "])/).slice(1);
  const done = cards.filter((c) => c.startsWith(" is-done"));
  assert.equal(done.length, 2, "one therapist + one F01 item completed (plan data)");
  for (const c of done) {
    assert.ok(c.includes("✓ 已完成"));
    assert.ok(!c.includes("today-task-start"), "no start CTA on a completed task");
  }
  assert.ok(done.some((c) => c.includes("查看結果")), "completed therapist item → 查看結果 (existing route)");
}

// 4 — nothing planned: one main empty state, no section empty cards
{
  const html = render(plan({}));
  assert.equal(count(html, 'class="card today-empty"'), 1, "single main empty state");
  assert.ok(html.includes("今天沒有指定訓練") && html.includes("你可以自行選擇想練習的動作。") && html.includes(">開始自主練習</button>"));
  assert.ok(!html.includes("<b>復健師安排</b>") && !html.includes("<b>ReMotion 建議</b>"), "no empty sections");
  assert.ok(html.includes("<b>訓練紀錄</b>"), "訓練紀錄 below");
}

// 9 — past / future: no active start CTA
for (const dateKey of ["2026-09-28", "2026-10-01"]) {
  const p = plan({ dateKey, activeCycle: cycle, cycleRecommendation: rec });
  const html = render(p, { viewDate: dateKey });
  assert.ok(p.remotion.primary.items.length > 0);
  assert.ok(!html.includes("today-task-start"), `${dateKey}: no start CTA`);
  assert.ok(!html.includes(">今日任務<") && !html.includes(">今日復健<"), `${dateKey}: 今日 only for the real today`);
  if (dateKey === "2026-10-01") assert.ok(html.includes("預定安排") && html.includes("尚未開始"));
  else assert.ok(html.includes("9/28 任務") && html.includes("未完成"));
}

// 10 — 快速功能
{
  const html = render(plan({ activeCycle: cycle, cycleRecommendation: rec }));
  const quick = between(html, ">快速功能<");
  assert.ok(quick.includes("<b>自主練習</b>") && quick.includes("自己選動作，不列入今日安排") && quick.includes("<b>訓練紀錄</b>"), "compact utilities");
  assert.ok(html.indexOf(">快速功能<") > html.indexOf("<b>ReMotion 建議</b>"), "utilities after the tasks");
}

// notice (Day 7) stays a compact row, never a phantom task
{
  const html = render(plan({ todayKey: "2026-10-04", activeCycle: cycle, cycleRecommendation: rec }), { viewDate: "2026-10-04" });
  assert.ok(html.includes("本週訓練日已結束") && html.includes("goTrackingReassessment('cyc1')"));
  assert.ok(!/class="today-task(?=[ "])/.test(html), "no task cards");
}

// presentation-only guard: the page never computes its own counts / completion
{
  const page = fnSrc("todaySchedulePage") + fnSrc("renderTodayTaskCard") + fnSrc("renderTodayRemotionTask") + fnSrc("renderTodayTherapistTask");
  assert.ok(!/analysisService|trainingEventService|dailyTrainingProgress|\.filter\(\(\w+\) => \w+\.completed\)/.test(page), "no second completion / count computation in render");
  const css = readFileSync(join(root, "styles.css"), "utf8");
  assert.ok(/\.today-plan-page \.week-strip > span \{[^}]*padding: 5px 0/.test(css), "compact date selector");
  assert.ok(/\.today-task-image \{ width: 72px; height: 72px/.test(css), "72px task image");
}

console.log("Training Tab re-layout tests passed");
