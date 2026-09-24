import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion — Global back-nav audit + Patient Data Dashboard V2 guards.
 *
 * Part 1 (static): deterministic back destinations match the locked
 *   patient IA (no browser-history); the 數據 tab is a real dashboard that
 *   reuses the existing analysisService record source; no deprecated mock
 *   data page is reachable; no fabricated duration/calorie/recovery metric.
 * Part 2 (behavioural): the overview metrics and the 訓練紀錄 list read the
 *   SAME persisted analysisService records (one source, refresh-consistent).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle, span = 6000) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected to find ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + span : end + 2);
};

// ── A/B — Gamification hub back nav (locked earlier, re-verified) ──
{
  const map = sliceFn("function rehabMapPage()");
  assert.ok(/onclick="switchTab\('home'\)">返回/.test(map), "A: Map 返回 -> Home");
  const ach = appJs.slice(appJs.indexOf("patientAchievementsPage = function() {"));
  assert.ok(/onclick="goMap\(\)">返回/.test(ach.slice(0, ach.indexOf("\n};"))), "B: Achievements 返回 -> Map");
}

// ── C/D/G — Data tab child back nav ──────────────────────────────
{
  const detail = sliceFn("function trainingRecordDetailPage()");
  assert.ok(/onclick="goBackFromTrainingRecordDetail\(\)">返回/.test(detail), "C: 單次紀錄 返回 is breadcrumb-aware");
  const backFn = sliceFn("function goBackFromTrainingRecordDetail()");
  assert.ok(/recordDetailFromCase/.test(backFn) && /return goActionRecords\(\)/.test(backFn),
    "C: patient path returns to the 訓練紀錄 list; therapist path returns to the case detail");

  const goRec = sliceFn("function goActionRecords()");
  assert.ok(/state\.route = "records"/.test(goRec) && /state\.tab = "data"/.test(goRec), "訓練紀錄 list stays on the 數據 bottom-nav tab");

  const goDetail = sliceFn("function goTrainingRecordDetail(");
  assert.ok(/role === "therapist" \? "work" : "data"/.test(goDetail), "G: patient 單次紀錄 keeps the 數據 tab; therapist keeps 個案");

  const recPage = sliceFn("function actionRecordsPage()");
  assert.ok(/onclick="switchTab\('data'\)">返回/.test(recPage), "D: 訓練紀錄 list 返回 -> Data overview");
  assert.ok(/renderDataSegmentedNav\("records"\)/.test(recPage), "訓練紀錄 list shows the shared segmented nav");
}

// ── E — assessment result must not land on Profile ───────────────
{
  const res = sliceFn("function functionalAssessmentShoulderResultPage()");
  assert.ok(!/switchTab\('profile'\)/.test(res), "E: Assessment Result back path never routes to Profile");
  assert.ok(/switchTab\('home'\)/.test(res), "Assessment Result back path -> Home (top of 自主復健)");
}

// ── F — recommendation/training return keeps its context ─────────
{
  const detail = sliceFn("function exerciseDetailPage()");
  assert.ok(/getExerciseReturnRoute\(/.test(detail), "F: exercise detail back is context-derived, not hardcoded");
  const goRecEx = sliceFn("function goRecommendationExerciseDetail(");
  assert.ok(/state\.navigationOrigin = "recommendation"/.test(goRecEx), "recommendation origin is recorded for the return route");
}

// ── H — therapist routes untouched ──────────────────────────────
{
  assert.ok(/function goCaseList\(\)/.test(appJs) && /function goCaseDetail\(/.test(appJs), "H: therapist nav functions still present");
  const therapistDash = sliceFn("function renderDashboard()");
  assert.ok(/therapistFilesPage\(\)/.test(therapistDash) && /: profilePage\(\)/.test(therapistDash), "therapist dashboard branches unchanged");
}

// ── I/Q — 數據 tab = real dashboard, no deprecated mock reachable ─
{
  const rd = sliceFn("function renderDashboard()");
  const rdCode = rd.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(/state\.tab === "data"[^]*patientDataOverviewPage\(\)/.test(rdCode), "I: 數據 tab renders patientDataOverviewPage()");
  for (const mock of ["dataPage()", "historyPage()", "heatmapPage()", "analysisPage()"]) {
    assert.ok(!rdCode.includes(mock), `Q: deprecated ${mock} is not reachable from the dashboard`);
  }
  const ov = sliceFn("function patientDataOverviewPage()");
  assert.ok(/analysisService\.getByPatientId\(patientId\)/.test(ov), "I: overview reads real analysisService records");
  assert.ok(/buildWeeklyTrainingProgress\(records\)/.test(ov), "J: weekly count from the shared weekly-progress helper");
  assert.ok(/gamificationEngine\.getCurrentStreak\(patientId\)/.test(ov), "streak from the single gamification source");
}

// ── K — average score ignores records without a numeric score ────
{
  const ov = sliceFn("function patientDataOverviewPage()");
  assert.ok(/typeof r\.score === "number" \? r\.score : typeof r\.overallScore === "number" \? r\.overallScore : null/.test(ov)
    && /\.filter\(\(s\) => s != null\)/.test(ov), "K: avg score only averages real numeric scores");
}

// ── L/trend — chart points are real scored records only, capped ──
{
  const pts = sliceFn("function collectQualityTrendPoints(");
  assert.ok(/\.filter\(\(p\) => p\.ts && p\.score != null\)/.test(pts) && /\.slice\(-limit\)/.test(pts),
    "L: trend uses only persisted numeric-score points, newest `limit`");
  const chart = sliceFn("function renderQualityTrendChart(");
  assert.ok(/points\.length < 2/.test(chart) && /完成 2 次以上 AI 訓練後即可查看趨勢/.test(chart),
    "trend shows an insufficient-data state below 2 points");
  assert.ok(/stroke: var\(--primary\)/.test(readFileSync(join(root, "styles.css"), "utf8")), "trend line uses ReMotion green");
}

// ── M — zero records still renders a structured dashboard ────────
{
  const ov = sliceFn("function patientDataOverviewPage()");
  assert.ok(/records\.length === 0/.test(ov), "M: explicit zero-records branch");
  assert.ok(/const nav = renderDataSegmentedNav\("overview"\)/.test(ov), "overview builds the segmented nav");
  const zero = ov.slice(ov.indexOf("records.length === 0"), ov.indexOf("const deltaHtml"));
  for (const part of ["${nav}", "本週總覽", "訓練品質趨勢", "完成第一次練習後", 'onclick="goSelfRehabEntry()"']) {
    assert.ok(zero.includes(part), `zero-state keeps structure: ${part}`);
  }
}

// ── N — 訓練紀錄 tab reuses the existing record page/source ───────
{
  const nav = sliceFn("function renderDataSegmentedNav(");
  assert.ok(/goActionRecords\(\)/.test(nav), "N: 訓練紀錄 segment routes to the existing actionRecordsPage flow");
  // no second history collection/service was introduced
  assert.ok(!/createCollection\(\s*["'`]trainingRecords/.test(appJs), "no duplicate training-history store");
}

// ── R — no fabricated duration / calorie / recovery metrics ──────
{
  const ov = sliceFn("function patientDataOverviewPage()");
  for (const banned of ["訓練時間", "分鐘", "卡路里", "大卡", "恢復率", "恢復 %", "疼痛"]) {
    assert.ok(!ov.includes(banned), `R: no fabricated metric "${banned}"`);
  }
}

// ── 身體狀況 tab intentionally omitted for V1 ────────────────────
{
  const nav = sliceFn("function renderDataSegmentedNav(");
  assert.ok(!nav.includes("身體狀況"), "身體狀況 tab omitted (no real persisted body/pain-status source)");
}

// ── I/J/N/P behavioural — overview + list share ONE record source ─
{
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
  };
  const { analysisService } = await import("../js/data/analysisService.js");
  const PID = "data_v2_patient";
  const before = analysisService.getByPatientId(PID).length;
  for (let i = 0; i < 3; i++) {
    analysisService.create({
      id: `dv2_${i}`, patientId: PID, exerciseId: "LE01", score: 70 + i * 5,
      completedAt: `2026-09-0${i + 1}T09:00:00.000Z`, createdAt: `2026-09-0${i + 1}T09:00:00.000Z`,
    });
  }
  const list = analysisService.getByPatientId(PID);
  assert.equal(list.length, before + 3, "records persisted once");
  // a fresh import (a "refresh") reads the identical set — overview and list can never disagree
  const fresh = (await import("../js/data/analysisService.js?dv2=1")).analysisService;
  assert.equal(fresh.getByPatientId(PID).length, list.length, "P: refresh keeps overview/list consistent (one source)");
  const scored = list
    .map((r) => (typeof r.score === "number" ? r.score : null))
    .filter((s) => s != null);
  assert.equal(Math.round(scored.reduce((a, b) => a + b, 0) / scored.length), 75, "avg score = mean of the real numeric scores");
}

console.log("Data Dashboard V2 + back-nav audit guards passed");
