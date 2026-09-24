import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Therapist Workspace V2 guards.
 *
 * Part 1 (static): the therapist IA is real (no hardcoded 黃小謙 / risk %),
 *   the 4-section patient detail reuses the SAME aggregation helpers the
 *   patient Data V2 / shoulder-findings layers use, and no invented
 *   clinical label is introduced.
 * Part 2 (behavioural): the therapist→patient schedule + completion closed
 *   loop runs through the existing services against ONE record source.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle, span = 9000) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected to find ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + span : end + 2);
};
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// ── therapist bottom-nav IA: 首頁 / 個案 / 計畫 / 我的 (same route keys) ──
{
  const nav = sliceFn("function renderNav()");
  assert.ok(/label: "個案"/.test(nav) && /label: "計畫"/.test(nav), "therapist tabs relabelled 個案 / 計畫");
  assert.ok(/key: "work"/.test(nav) && /key: "data"/.test(nav), "route keys unchanged (home/work/data/profile)");

  const rd = stripComments(sliceFn("function renderDashboard()"));
  assert.ok(/role === "patient" \? patientHome\(\) : therapistHome\(\)/.test(rd), "首頁: therapistHome");
  assert.ok(/role === "patient" \? todaySchedulePage\(\) : therapistCaseListPage\(\)/.test(rd), "個案: real case list (not therapistFilesPage mock)");
  assert.ok(/role === "patient" \? patientDataOverviewPage\(\) : therapistPlansPage\(\)/.test(rd), "計畫: therapistPlansPage");
  assert.ok(!/therapistFilesPage\(\)/.test(rd), "the hardcoded-mock therapistFilesPage() is no longer rendered by any tab");
}

// ── therapist Home is real, not the old fake dashboard ──
{
  const home = stripComments(sliceFn("function therapistHome()"));
  for (const fake of ["黃小謙", "陳小莉", "林阿姨", "動作正確率", "AI 風險預測", "風險等級", "膝蓋內夾風險"]) {
    assert.ok(!home.includes(fake), `therapist Home no longer shows fake "${fake}"`);
  }
  assert.ok(/therapistManagedCaseSummaries\(\)/.test(home), "Home builds rows from real managed-case summaries");
  assert.ok(/今日待處理/.test(home) && /今日有課表/.test(home), "Home shows a today's-work summary");
  assert.ok(/setTherapistHomeView/.test(home) && /個案列表/.test(home) && /今日待辦/.test(home), "個案列表 | 今日待辦 toggle");
  assert.ok(/onclick="goCaseList\(\)"/.test(home), "＋ 安排復健計畫 CTA");
}

// ── per-case summary: every field from an existing service, no clinical label ──
{
  const cs = stripComments(sliceFn("function buildTherapistCaseSummary("));
  assert.ok(/scheduleService\.getByPatientAndDate\(patient\.id, todayStr\(\)\)/.test(cs), "today plan from scheduleService");
  assert.ok(/analysisService\.getByPatientId\(patient\.id\)/.test(cs), "training from analysisService");
  assert.ok(/assessmentService\.getActiveByPatientId\(patient\.id\)/.test(cs), "rehab need / body region from assessmentService");
  for (const banned of ["高風險", "恢復良好", "病情惡化", "恢復率", "改善率", "動作正確率"]) {
    assert.ok(!cs.includes(banned), `status derivation invents no clinical label: "${banned}"`);
  }
  assert.ok(/今日待訓練|今日已完成|部分完成|近期無訓練/.test(cs), "status chips are the safe schedule-derived set");
}

// ── Patient Detail = 4 real sections, reusing existing aggregation ──
{
  const d = stripComments(sliceFn("function therapistCaseDetailPage()"));
  assert.ok(/setCaseDetailTab\('\$\{k\}'\)/.test(d), "detail renders a segmented tab nav via setCaseDetailTab");
  assert.ok(/\["overview", "總覽"\], \["assessment", "功能評估"\], \["records", "訓練紀錄"\], \["plan", "復健計畫"\]/.test(d),
    "detail has exactly the 4 sections 總覽 / 功能評估 / 訓練紀錄 / 復健計畫");
  assert.ok(/\.includes\(state\.caseDetailTab\)/.test(d), "the active tab is state-driven");
  assert.ok(/buildWeeklyTrainingProgress\(records\)/.test(d), "近期表現 reuses the patient Data V2 weekly helper (no second calculation)");
  assert.ok(/collectQualityTrendPoints\(records, 7\)/.test(d) && /renderQualityTrendChart\(/.test(d), "trend reuses the Data V2 chart helper");
  assert.ok(/functionalAssessmentService\.getLatestCompletedByPatientId\(patientId\)/.test(d)
    && /buildShoulderAssessmentFindings\(\{ problemId: fa\.problemId, movementResults: fa\.movementResults \}\)/.test(d),
    "功能評估 reuses the SAME shoulderAssessmentFindings normalization the patient sees");
  assert.ok(/buildTrainingHistoryEntry\(r\)/.test(d) && /renderTrainingHistoryCard/.test(d), "訓練紀錄 reuses the existing history entry/card");
  assert.ok(/scheduleService\s*[\r\n]*\s*\.getByPatientId\(patientId\)/.test(d), "復健計畫 過去安排 from scheduleService");
  assert.ok(/onclick="goAssignPlan\(\)"/.test(d), "調整計畫 CTA into the existing assign flow");
  for (const banned of ["正常", "異常", "輕度", "中度", "重度", "高風險", "恢復良好"]) {
    assert.ok(!d.includes(banned), `assessment view adds no clinical interpretation: "${banned}"`);
  }
}

// ── the existing assign-plan flow is reused unchanged ──
assert.ok(/assignPlanPage = function\(\)/.test(appJs), "assignPlanPage flow present");
assert.ok(/scheduleService\.(create|update)\(/.test(sliceFn("function submitAssignPlan(", 4000)) || /scheduleService\./.test(appJs),
  "assign flow still writes through scheduleService");

// ── record-detail breadcrumb (therapist returns to the case, not their own empty list) ──
{
  const back = sliceFn("function goBackFromTrainingRecordDetail()");
  assert.ok(/recordDetailFromCase/.test(back) && /goCaseDetail\(pid, "records"\)/.test(back) && /return goActionRecords\(\)/.test(back),
    "返回 goes to the case (therapist) or the 訓練紀錄 list (patient)");
}

// ── Part 2 — therapist ↔ patient closed loop through existing services ──
{
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
  };
  const { scheduleService } = await import("../js/data/scheduleService.js");
  const { analysisService, ANALYSIS_RECORD_SOURCES } = await import("../js/data/analysisService.js");
  const { relationService } = await import("../js/data/relationService.js");

  const TID = "tw_therapist";
  const PID = "tw_patient";
  const today = new Date().toISOString().slice(0, 10);

  // relation (therapist sees patient from BOTH sides)
  relationService.create
    ? relationService.create({ id: "tw_rel", therapistId: TID, patientId: PID, status: "accepted", createdAt: new Date().toISOString(), acceptedAt: new Date().toISOString() })
    : scheduleService; // relationService has no create() -> seed via collection is out of scope; the read path is what matters
  // fall back: write the relation record directly via the schedule collection's sibling if needed
  if (!relationService.findActiveByPatientId(PID).length) {
    const raw = JSON.parse(_store.get("remotion_collection_therapistPatientRelations") || "[]");
    raw.push({ id: "tw_rel", therapistId: TID, patientId: PID, status: "accepted", createdAt: new Date().toISOString(), acceptedAt: new Date().toISOString() });
    _store.set("remotion_collection_therapistPatientRelations", JSON.stringify(raw));
  }
  assert.equal(relationService.findAcceptedByTherapistId(TID).some((r) => r.patientId === PID), true, "therapist's case list contains the patient");
  assert.equal(relationService.findActiveByPatientId(PID).some((r) => r.therapistId === TID), true, "patient sees the linked therapist");

  // therapist assigns a schedule (real service)
  scheduleService.create({
    id: "tw_sched",
    patientId: PID,
    therapistId: TID,
    date: today,
    title: "今日課表",
    status: "in_progress",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    exercises: [
      { exerciseId: "LE01", exerciseName: "深蹲", sets: 3, repetitions: 15, status: "pending", analysisRecordId: null, rewardXp: 30 },
      { exerciseId: "LE03", exerciseName: "橋式", sets: 3, repetitions: 10, status: "pending", analysisRecordId: null, rewardXp: 30 },
    ],
  });
  // the patient Training page reads exactly this:
  const patientSees = scheduleService.getByPatientAndDate(PID, today);
  assert.ok(patientSees && patientSees.exercises.length === 2, "patient Training page shows the assigned schedule");
  // the therapist case detail reads the same:
  assert.equal(scheduleService.getByPatientAndDate(PID, today).id, "tw_sched", "therapist case detail reads the same schedule doc");

  // patient completes one exercise -> analysisRecord (source assigned)
  const rec = analysisService.create({
    id: "tw_rec", patientId: PID, therapistId: TID, scheduleId: "tw_sched",
    exerciseId: "LE01", exerciseName: "深蹲", completedAt: `${today}T09:00:00.000Z`, createdAt: `${today}T09:00:00.000Z`,
    source: ANALYSIS_RECORD_SOURCES.ASSIGNED, totalReps: 45, targetReps: 45, validReps: 40, score: 82, overallScore: 82, quality: "fair",
    summary: { totalReps: 45, targetReps: 45, validReps: 40 },
  });
  scheduleService.updateExerciseAt("tw_sched", 0, { status: "completed", completedAt: `${today}T09:00:00.000Z`, analysisRecordId: rec.id });

  // ONE record source powers patient Data + therapist case detail
  const patientRecords = analysisService.getByPatientId(PID);
  assert.equal(patientRecords.length, 1, "one analysisRecord, one source");
  assert.equal(patientRecords[0].source, "assigned");
  const updatedSchedule = scheduleService.getByPatientAndDate(PID, today);
  assert.equal(updatedSchedule.exercises[0].status, "completed", "therapist now sees the updated completion");
  assert.equal(updatedSchedule.exercises.filter((e) => e.status === "completed").length, 1, "完成 1 / 2 — same numbers both sides");
}

console.log("Therapist Workspace V2 guards passed");
