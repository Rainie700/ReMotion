import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 使用體驗改善 4/5 — completion pages, 數據 and the shared 5xSTS chart (program logic; synthetic data).
 */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const FP = await import("../js/data/f01FixedPractice.js");
const { f01FixedPracticeService, FIXED_PRACTICE_SYNC } = await import("../js/data/f01FixedPracticeService.js");
const { storageService, waitForCloudWrites } = await import("../js/data/storageService.js");
const { buildFa5xChart, describeFa5xPurpose } = await import("../js/data/functionalProgressService.js");
const { describeShownTimeDifference } = await import("../js/data/trackingComparison.js");
const fnSrc = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, name);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};

// ── 1. fixed-practice sync: no cloud account → 「僅保存在這台裝置」, never 「已同步」 ──
{
  const base = { patientId: "u-sync", runId: "run_localonly1", exerciseName: "坐姿起立", instructionsReadAt: "2026-10-28T01:00:00.000Z", startedAt: "2026-10-28T01:01:00.000Z", completedAt: "2026-10-28T01:03:00.000Z", dateKey: "2026-10-28", ai: FP.buildFixedPracticeAi({ totalReps: 5 }, {}) };
  assert.equal(storageService.isCloudSyncActive(), false, "no signed-in cloud user in this test");
  const res = await f01FixedPracticeService.saveRun(base); // the real waitForCloudWrites
  assert.equal(res.sync, FIXED_PRACTICE_SYNC.LOCAL_ONLY, "nothing was written to the cloud, so it is not 'synced'");
  assert.equal(f01FixedPracticeService.syncStatus(res.record.id), "local_only");
  // an injected failure keeps its cloud error code for diagnosis (never shown to the patient)
  const failed = await f01FixedPracticeService.saveRun({ ...base, runId: "run_failcode1" }, { syncWrites: async () => ({ total: 1, failed: [{ name: "f01FixedPracticeRecords", id: "f01FixedPractice_u-sync_run_failcode1", ok: false, code: "permission-denied" }] }) });
  assert.equal(failed.sync, FIXED_PRACTICE_SYNC.FAILED);
  assert.equal(f01FixedPracticeService.syncErrorCode(failed.record.id), "permission-denied");
  const ok = await f01FixedPracticeService.retrySync({ patientId: "u-sync", recordId: failed.record.id }, { syncWrites: async () => ({ total: 1, failed: [] }) });
  assert.equal(ok.sync, FIXED_PRACTICE_SYNC.SYNCED);
  assert.equal(f01FixedPracticeService.syncErrorCode(failed.record.id), null, "a later success clears the code");
  assert.equal(typeof waitForCloudWrites, "function");
  // the per-document outcome is read too, so a failure drained by another caller is not lost
  const svc = readFileSync(join(root, "js/data/f01FixedPracticeService.js"), "utf8");
  assert.ok(svc.includes("storageService.getLastCloudWriteOutcome(COLLECTION, id)") && svc.includes("!!(last && !last.ok)"));
  const st = readFileSync(join(root, "js/data/storageService.js"), "utf8");
  assert.ok(st.includes("lastCloudWriteOutcome.set(`${entry.name}/${entry.id}`"), "every settled write records its own outcome");
}

// ── 2. the shared 5xSTS chart model ──
{
  const U = "u-chart";
  const s = (id, ms, at) => ({ id, patientId: U, status: "completed", result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: at } });
  const sessions = { b1: s("b1", 12800, "2026-09-22T02:00:00Z"), r1: s("r1", 8900, "2026-09-28T02:00:00Z"), x: { ...s("x", 7000, "2026-09-29T02:00:00Z"), patientId: "other" } };
  const cycles = [
    { id: "c1", userId: U, cycleStartDateKey: "2026-09-22", plannedReassessmentDateKey: "2026-09-28", baselineAssessmentId: "b1", reassessmentId: "r1" },
    { id: "c2", userId: U, cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", baselineAssessmentId: "r1", reassessmentId: null, previousCycleId: "c1" },
    { id: "cx", userId: "other", cycleStartDateKey: "2026-09-29", plannedReassessmentDateKey: "2026-10-05", baselineAssessmentId: "x", reassessmentId: null },
  ];
  const chart = buildFa5xChart({ cycles, userId: U, todayKey: "2026-09-30", getSession: (id) => sessions[id], getComparison: (c) => (c.id === "c1" ? { eligible: true, baselineMs: 12800, reassessmentMs: 8900 } : null), describeDifference: describeShownTimeDifference });
  assert.deepEqual(chart.points.map((p) => [p.assessmentId, p.ms, p.dateKey, p.role]), [["b1", 12800, "2026-09-22", "初次評估"], ["r1", 8900, "2026-09-28", "再次評估"]], "the reused reassessment is ONE point; another user's run never appears");
  assert.equal(chart.points[1].alsoBaselineOfWeek, 2);
  assert.deepEqual(chart.weeks.map((w) => [w.weekNumber, w.from, w.to, w.comparable, w.pending]), [[1, 0, 1, true, false], [2, 1, null, false, true]]);
  assert.equal(chart.weeks[0].differenceText, "本次完成時間較初次少 3.9 秒");
  assert.deepEqual(chart.planned, { weekNumber: 2, cycleId: "c2", dateKey: "2026-10-04", ready: false }, "a future reassessment is a date, never a value");
  // one assessment only
  const one = buildFa5xChart({ cycles: [cycles[0] && { ...cycles[0], reassessmentId: null }], userId: U, todayKey: "2026-09-23", getSession: (id) => sessions[id], getComparison: () => null });
  assert.deepEqual([one.points.length, one.weeks[0].comparable, one.planned.dateKey], [1, false, "2026-09-28"]);
  // renderer: lines only for comparable weeks; UX round 5/5 — the coming date gets no slot or marker in the plot, it is
  // said in words outside it (「下次評估：…，尚未量測」); legend avoids 改善 / 退步
  const r = fnSrc("renderFa5xChart");
  assert.ok(r.includes("weeks.filter((w) => w.comparable).map((w) => `<line") && !r.includes("fa5c-planned") && r.includes("const slots = points.length;") && r.includes("尚未量測") && !/改善|退步|進步/.test(r));
}

// ── 3. purpose of a run ──
{
  const done = (id, at, role) => ({ id, patientId: "p", status: "completed", completedAt: at, result: { status: "completed", repCount: 5, totalDurationMs: 9000, measuredAt: at, ...(role ? { assessmentRole: role } : {}) } });
  const a = done("a", "2026-09-01T00:00:00Z"), b = done("b", "2026-09-05T00:00:00Z"), c = done("c", "2026-09-08T00:00:00Z", "reassessment");
  const ctx = { cycles: [{ id: "c1", baselineAssessmentId: "b" }], completedSessions: [a, b, c] };
  assert.deepEqual([describeFa5xPurpose(a, ctx).label, describeFa5xPurpose(b, ctx).label, describeFa5xPurpose(c, ctx).label], ["首次評估", "7 日追蹤｜初次評估", "7 日追蹤｜再次評估"]);
  assert.equal(describeFa5xPurpose(done("d", "2026-09-10T00:00:00Z", "next_cycle_baseline"), ctx).label, "新週期基準評估");
  assert.equal(describeFa5xPurpose(done("e", "2026-09-12T00:00:00Z"), ctx).label, "單次評估（未納入追蹤週期）");
}

// ── 4. completion pages ──
{
  const page = fnSrc("f01FixedPracticeRecordPage");
  assert.ok(page.includes('${reached ? `<img class="fpr-star" src="/images/gamification/star_glow_01.png"'), "a star only when the target was reached");
  assert.ok(page.includes('ai.endedEarly ? "提前結束" : "未達本次目標"') && !page.includes("恭喜"), "not reached: the actual record, no celebration");
  assert.ok(page.includes("本人填寫，另外保存，沒有加入 AI 計次。") && page.includes("另有 ${ai.unconfirmedAttemptCount} 次動作無法確認，沒有計入"), "self-report apart; unconfirmed attempts listed");
  assert.ok(page.includes('onclick="goF01FixedPracticeHistory()">查看練習紀錄</button><button class="btn btn-light full" onclick="switchTab(\'work\')">返回訓練</button>'), "查看紀錄 / 返回訓練");
  assert.ok(!/programVersion|sourceRef|nhs-sit-to-stand|NHS|Otago/.test(page), "no version code / sources on the patient page");
  assert.ok(appJs.includes('local_only: "僅保存在這台裝置（目前沒有連上雲端帳號）"') && appJs.includes('pending: "儲存中…"'));
  // the result shows while the cloud save is still running
  const fin = appJs.slice(appJs.indexOf("async function finalizeF01FixedPracticeRun("), appJs.indexOf("function goF01FixedPracticeRecord("));
  assert.ok(fin.indexOf("showFixedPracticeResultWhileSaving(") < fin.indexOf("await saving"), "儲存中 is shown before the cloud answers");
  // 5xSTS result: purpose for every run; the condition questions open only on tap
  const res = fnSrc("fiveTimesSitToStandResultPage");
  assert.ok(res.includes("functionalProgressService.describePurpose(session)"));
  assert.ok(fnSrc("renderFa5xConditionSection").includes('<details class="fa5x-cond-form">'));
}

// ── 5. home greeting: neutral (the primary task card says what to do) ──
{
  const g = fnSrc("buildHomeGreetingLines");
  assert.ok(!g.includes("今天沒有復健師安排"), "no 「今天沒有復健師安排」 as the greeting");
}
console.log("uxRound4: all assertions passed");
