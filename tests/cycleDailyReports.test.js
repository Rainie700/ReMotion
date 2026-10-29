process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/** 本週練習回報 (G01 next-stage views) — read-only summary of existing daily reports, by context. Synthetic data only. */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const C = await import("../js/data/cycleDailyReports.js");
const { renderCycleDailyReports } = await import("../js/ui/cycleDailyReportsView.js");
const F = await import("../js/data/dailyTrainingFeedback.js");
const V = await import("../js/ui/dailyTrainingFeedbackView.js");
const { dailyTrainingFeedbackService: S } = await import("../js/data/dailyTrainingFeedbackService.js");
const { createCollection } = await import("../js/data/storageService.js");

const U = "pat-1";
const cycle = { id: "cyc-1", userId: U, patientId: U, recommendationId: "rec-1", cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", reassessmentId: "re-1", completedTrainingDates: ["2026-09-28", "2026-09-30"],
  dailyTrainingProgress: {
    "2026-09-28": { requiredExerciseIds: ["F01-04"], completedExerciseIds: ["F01-04"], attempts: { "analysis-1": {} } },
    "2026-09-29": { requiredExerciseIds: ["F01-04", "F01-01"], completedExerciseIds: ["F01-04"], attempts: { "analysis-2": {} } },
    "2026-09-30": { requiredExerciseIds: ["F01-04"], completedExerciseIds: ["F01-04"], attempts: { "analysis-3": {} } },
  } };
const SUBJ = (cycleId = cycle.id) => ({ kind: F.REPORT_SUBJECT_KIND.TRACKING_CYCLE, cycleId, recommendationId: cycleId === cycle.id ? "rec-1" : "rec-x" });
/** A daily record built by the real builder (append-only, contexts interleaved as given). */
function record(dateKey, reports, patientId = U) {
  let prev = null;
  for (const [i, r] of reports.entries()) {
    const built = F.buildDailyFeedbackRecord({ patientId, dateKey, effort: r.effort, discomfort: r.discomfort, note: r.note || "", expectedRevision: i, incompleteReason: r.reason || "", subject: r.subject || null }, prev,
      { reportedAt: r.at || `${dateKey}T12:0${i}:00+08:00`, therapistId: "th-1", relationId: "rel-1", incompleteProgress: r.reason ? { dateKey, cycleId: r.cycleId || (r.subject ? r.subject.cycleId : cycle.id), recommendationId: "rec-1", requiredCount: 2, completedCount: 1, items: [] } : null });
    assert.ok(!built.error, built.error);
    prev = built.record;
  }
  return prev;
}
const recs = [
  record("2026-09-28", [{ effort: "very_hard", discomfort: "no", subject: SUBJ() }]),                               // D1 cycle entry
  record("2026-09-29", [                                                                                            // D2 cycle ×3 + general between
    { effort: "easy", discomfort: "yes", subject: SUBJ() },
    { effort: "easy", discomfort: "no", note: "首頁一般回報" },
    { effort: "somewhat_hard", discomfort: "yes", note: "膝蓋有點痠", subject: SUBJ() },
    { effort: "somewhat_hard", discomfort: "yes", reason: "discomfort", note: "膝蓋有點痠", subject: SUBJ() },
  ]),
  record("2026-09-30", [{ effort: "easy", discomfort: "yes", note: "早上散步後腳酸", reason: "no_time" }]),        // D3 HOME: general feelings + incompletion for cyc-1
  record("2026-10-01", [{ effort: "not_practiced", discomfort: "no", reason: "no_time", cycleId: "cyc-OTHER" }]),     // D4 general, incompletion names another cycle
  record("2026-10-02", [{ effort: "easy", discomfort: "no" }]),                                                     // D5 general, no link, same day
  record("2026-10-03", [{ effort: "easy", discomfort: "yes", subject: SUBJ("cyc-OTHER") }, { effort: "easy", discomfort: "unknown", subject: SUBJ() }]), // D6 another cycle's entry, then this cycle's
  record("2026-09-28", [{ effort: "easy", discomfort: "yes", subject: SUBJ() }], "pat-OTHER"),                     // another patient
  record("2026-10-10", [{ effort: "easy", discomfort: "yes" }]),                                                   // outside this cycle
];
const check = { hasNewOrWorseningDiscomfort: false, discomfortNote: null, at: "2026-10-04T20:30:00+08:00" };
const build = (over = {}) => C.buildCycleDailyReports({ cycle, patientId: U, feedbackRecords: recs, feedbackLoadStatus: "loaded", statusCheck: check, ...over });

// 1. only reports pointing at THIS cycle are this cycle's reports; one shared result
const r = build();
assert.equal(r.days.length, 6);
assert.deepEqual(r.days.map((d) => d.reportState), ["reported", "reported", "incompletion_only", "other_cycle", "not_reported", "reported"]);
assert.deepEqual(r.summary.reportedDates, ["2026-09-28", "2026-09-29", "2026-10-03"], "only whole cycle reports count as reported days");
assert.deepEqual(r.days.map((d) => d.report && d.report.attribution), [C.ATTRIBUTION.CYCLE_ENTRY, C.ATTRIBUTION.CYCLE_ENTRY, null, null, null, C.ATTRIBUTION.CYCLE_ENTRY]);
assert.equal(r.days[5].report.revisionCount, 1, "another cycle's report on the same day is not this cycle's revision");
assert.equal(r.days[0].report.recordId, `${U}_2026-09-28`, "traceable record id");
assert.deepEqual(r.days[1].training, { status: "partial", requiredCount: 2, completedCount: 1, attemptRecordIds: ["analysis-2"] });
assert.equal(C.buildCycleDailyReports({ cycle, patientId: "pat-OTHER", feedbackRecords: recs, feedbackLoadStatus: "loaded" }).error, "cycle_not_owned");
assert.ok(!JSON.stringify(r).includes("pat-OTHER") && !JSON.stringify(r).includes("2026-10-10"), "other patient / other dates never read");

// 2. a same-date general report with no cycle link: listed apart, never counted, never marks the day reported
assert.deepEqual(r.summary.sameDayGeneralDates, ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
assert.deepEqual(r.summary.notReportedDates, ["2026-10-02"]);
assert.equal(r.days[4].report, null);
assert.equal(r.sameDayGeneral[3].effort, "easy");
assert.ok(!r.summary.effortDates.easy || !r.summary.effortDates.easy.includes("2026-10-02"), "general answer not in the cycle statistics");
assert.ok(!(r.summary.discomfortDates.no || []).includes("2026-10-02") && !(r.summary.discomfortDates.no || []).includes("2026-09-29"));

// 2b. HOME general feelings + an incompletion for this cycle (field by field): the reason and target counts
//     are this cycle's; the home 「有不舒服」 is NOT this cycle's discomfort; the day is not a reported day
const d3 = r.days[2];
assert.equal(d3.report, null);
assert.deepEqual([d3.homeIncompletion.reason, d3.homeIncompletion.requiredCount, d3.homeIncompletion.completedCount, d3.homeIncompletion.attribution], ["no_time", 2, 1, C.ATTRIBUTION.HOME_INCOMPLETION]);
assert.deepEqual(r.summary.incompletionOnlyDates, ["2026-09-30"]);
assert.deepEqual(r.summary.incompletionDates, { discomfort: ["2026-09-29"], no_time: ["2026-09-30"] });
assert.deepEqual(r.summary.homeIncompletionDates, ["2026-09-30"]);
assert.ok(!Object.values(r.summary.discomfortDates).flat().includes("2026-09-30") && !Object.values(r.summary.effortDates).flat().includes("2026-09-30"), "home discomfort / effort not counted for the cycle");
assert.deepEqual([r.sameDayGeneral[1].discomfort, r.sameDayGeneral[1].note, r.sameDayGeneral[1].incompletionFor], ["yes", "早上散步後腳酸", "this_cycle"], "the home feelings stay a general answer");
assert.equal(r.sameDayGeneral[2].incompletionFor, "other_cycle");

// 3. other cycles never mixed in (by subject or by incompletion)
assert.deepEqual(r.summary.otherCycleDates, ["2026-10-01"]);
const onlyOther = C.buildCycleDailyReports({ cycle, patientId: U, feedbackLoadStatus: "loaded", feedbackRecords: [record("2026-09-28", [{ effort: "easy", discomfort: "yes", subject: SUBJ("cyc-OTHER") }])] });
assert.equal(onlyOther.days[0].reportState, "other_cycle");

// 4. contexts on one day: the cycle answer is its OWN last report (the general one in between replaces nothing)
const d2 = r.days[1].report;
assert.deepEqual([d2.effort, d2.discomfort, d2.revisionCount, d2.incompletion.reason], ["somewhat_hard", "yes", 3, "discomfort"]);
assert.deepEqual(d2.history.map((h) => h.effort), ["easy", "somewhat_hard", "somewhat_hard"], "history = that context's revisions in time order");
assert.equal(r.sameDayGeneral[0].revisionCount, 1);
assert.equal(r.sameDayGeneral[0].note, "首頁一般回報");
assert.deepEqual(r.summary.revisedDates, ["2026-09-29"]);
assert.equal(Object.values(r.summary.effortDates).flat().filter((d) => d === "2026-09-29").length, 1, "counted once");

// 5. not reported vs explicitly "no" vs unsure
assert.deepEqual(r.summary.discomfortDates, { no: ["2026-09-28"], yes: ["2026-09-29"], unknown: ["2026-10-03"] });
const html = renderCycleDailyReports(r);
assert.ok(html.includes("本週期回報 3 / 6 天") && html.includes("本週期未回報：10/02") && html.includes("不適｜沒有不舒服：09/28；有不舒服：09/29；不確定：10/03"));
assert.ok(html.includes("同日期的一般回報（未確認屬於本週期）") && html.includes("不計入上面的回報天數與統計") && html.includes("另有同日期的一般回報（未計入）：09/29、09/30、10/01、10/02"));
assert.ok(html.includes("查看歷次回報（3 次）") && html.includes("（目前採用）"), "latest by default, revisions one tap away");
assert.ok(html.includes("從本週期的回報入口填寫"));
// 2b shown apart: the reason under the cycle (marked 首頁), the home feelings in the general list
assert.ok(html.includes("只有未完成原因（首頁填寫；吃力與不適未針對本週期回報）：09/30") && html.includes("沒時間：09/30（首頁）"));
assert.ok(html.includes("本週期的吃力與不適未回報（不代表沒有不舒服）；只有首頁填寫的未完成原因") && html.includes("未完成原因（首頁填寫，針對本週期當天目標）：沒時間（回報時完成 1 / 2 個動作）"));
assert.ok(html.includes("<b>09/30</b>｜輕鬆｜有不舒服｜補充說明：早上散步後腳酸") && html.includes("這份回報的未完成原因已列入上方本週期資訊；吃力、不適與備註未列入") && html.includes("這份回報的未完成原因屬於其他週期，未列入"));

// 6. the last status check is kept apart; no judgement wording
assert.deepEqual(r.statusCheck, check);
assert.ok(html.includes("回答：沒有新的或加重的不適") && html.includes("系統不判定兩者是否一致、是否已緩解"));
assert.ok(!/耐受|良好|適應|改善|進步|緩解了|康復/.test(html.replace("系統不判定兩者是否一致、是否已緩解", "")), "no tolerance / improvement wording");

// 7. not loaded / failed: no answer from a local copy, never "not reported" or "no discomfort"
for (const [status, state, text] of [[null, "not_loaded", "尚未從雲端載入"], ["loading", "not_loaded", "尚未從雲端載入"], ["failed", "load_failed", "載入失敗"]]) {
  const x = build({ feedbackLoadStatus: status });
  assert.ok(x.days.every((d) => d.reportState === state && !d.report && !d.sameDayGeneral && !d.homeIncompletion));
  assert.deepEqual([x.summary.notReportedDates, x.summary.reportedDates, x.sameDayGeneral], [[], [], []]);
  const h = renderCycleDailyReports(x);
  assert.ok(h.includes(text) && !h.includes("未回報") && !h.includes("沒有不舒服") && !h.includes("本週期回報 0 / 6"), status);
}
// 8. therapist read scope: a missing record is "not in read scope", the wording says the patient may see more
const th = build({ feedbackRecords: [recs[0]], readScope: "linked_relation" });
assert.equal(th.days[2].reportState, "not_in_read_scope");
const thHtml = renderCycleDailyReports(th);
assert.ok(thHtml.includes("只能讀取帶有目前照護關係的回報") && thHtml.includes("患者本人看到的可能比這裡多"));
assert.ok(html.includes("復健師只能讀取照護關係建立後、帶有該關係的回報，看到的天數可能比你少"));
// an old general report saved on a later day (no link) cannot be placed: 無法確認, not counted
const late = C.buildCycleDailyReports({ cycle, patientId: U, feedbackLoadStatus: "loaded", feedbackRecords: [record("2026-09-28", [{ effort: "easy", discomfort: "no", at: "2026-10-05T09:00:00+08:00" }])] });
assert.equal(late.days[0].reportState, "unattributable");

// 9. read-only: inputs untouched
const frozen = JSON.stringify(recs) + JSON.stringify(cycle);
build(); renderCycleDailyReports(build());
assert.equal(JSON.stringify(recs) + JSON.stringify(cycle), frozen);
assert.ok(html.includes(C.CYCLE_DAILY_REPORTS_NOTE) && C.CYCLE_DAILY_REPORTS_NOTE === "以下回報供檢視參考，本版未用來自動決定進退階或訓練量。");

// 10. saving: the subject is validated and stored; contexts kept apart on the home card
const base = { patientId: U, dateKey: "2026-09-29", effort: "easy", discomfort: "no", note: "", expectedRevision: 0 };
const ctx = { reportedAt: "2026-09-29T10:00:00+08:00" };
assert.equal(F.buildDailyFeedbackRecord({ ...base, subject: { kind: "tracking_cycle", cycleId: "a/b", recommendationId: "r" } }, null, ctx).error, "invalid_subject");
assert.equal(F.buildDailyFeedbackRecord({ ...base, subject: { kind: "other", cycleId: "c", recommendationId: "r" } }, null, ctx).error, "invalid_subject");
assert.equal(F.buildDailyFeedbackRecord({ ...base, subject: SUBJ(), incompleteReason: "no_time" }, null, { ...ctx, incompleteProgress: { dateKey: base.dateKey, cycleId: "cyc-OTHER", requiredCount: 2, completedCount: 1 } }).error, "invalid_incomplete_reason", "a cycle report's incompletion must be about that cycle");
assert.deepEqual(F.buildDailyFeedbackRecord({ ...base, subject: SUBJ() }, null, ctx).record.reports[0].subject, SUBJ());
assert.equal("subject" in F.buildDailyFeedbackRecord(base, null, ctx).record.reports[0], false, "a home report carries no subject");
createCollection("trackingCycles").create({ ...cycle, reassessmentId: null });
const now = () => new Date("2026-09-29T02:00:00Z");
const commit = async (i, c) => F.buildDailyFeedbackRecord(i, null, c).record;
assert.equal((await S.save({ ...base, subject: { ...SUBJ(), recommendationId: "rec-x" } }, { now, commit })).error, "invalid_subject");
assert.equal((await S.save({ ...base, subject: SUBJ("cyc-missing") }, { now, commit })).error, "invalid_subject");
assert.equal((await S.save({ ...base, patientId: "pat-OTHER", subject: SUBJ() }, { now, commit })).error, "invalid_subject");
assert.equal((await S.save({ ...base, dateKey: "2026-10-04", subject: SUBJ() }, { now: () => new Date("2026-10-04T02:00:00Z"), commit })).error, "invalid_subject", "Day 7 is not a training day");
const saved = await S.save({ ...base, subject: SUBJ() }, { now, commit });
assert.deepEqual(saved.record.reports[0].subject, SUBJ());
const mixed = recs[1];
assert.equal(V.dailyFeedbackSummary(mixed), "輕鬆｜沒有不舒服", "home card shows the latest GENERAL answer, not the cycle's");
assert.equal(V.dailyFeedbackSummary(mixed, F.cycleContextKey(cycle.id)), "有點吃力｜有不舒服");
const homeCard = V.renderDailyFeedbackCard({ dateKey: "2026-09-29", record: mixed });
assert.ok(homeCard.includes("回報對象：一般回報（不指定訓練週期）") && homeCard.includes("不會自動算成任何訓練週期的回報") && homeCard.includes("今天另有 3 次從訓練週期入口填寫的回報") && homeCard.includes("查看今天的歷次回報（1 次）"));
const cycleCard = V.renderDailyFeedbackCard({ dateKey: "2026-09-29", record: mixed, contextKey: F.cycleContextKey(cycle.id), subjectText: "F01 7 日追蹤（09/28 開始）第 2 天的訓練" });
assert.ok(cycleCard.includes("本週期今日回報") && cycleCard.includes("回報對象：F01 7 日追蹤（09/28 開始）第 2 天的訓練") && cycleCard.includes("查看今天的歷次回報（3 次）"));
// 2026-10-28 (UX round 3/5): the card is the read-only view inside the report sheet; its 更新回報 targets the same cycle
const cycleSheet = V.renderDailyFeedbackSheet({ ui: { contextKey: F.cycleContextKey(cycle.id), dateKey: "2026-09-29", step: "overview", draft: {} }, record: mixed, subjectText: "F01 7 日追蹤（09/28 開始）第 2 天的訓練" });
assert.ok(cycleSheet.includes(`editDailyFeedbackFromUi('cycle:cyc-1')`) && cycleSheet.includes("回報對象：F01 7 日追蹤（09/28 開始）第 2 天的訓練"));
const cycleEntry = V.renderDailyFeedbackEntry({ record: mixed, contextKey: F.cycleContextKey(cycle.id), subjectText: "x" });
assert.ok(cycleEntry.includes("本週期今日已回報") && cycleEntry.includes("有點吃力｜有不舒服") && cycleEntry.includes(`openDailyFeedbackSheet('cycle:cyc-1')`), "the short entry shows THIS cycle's answer");
assert.ok(V.renderDailyFeedbackEntry({ record: mixed }).includes("輕鬆｜沒有不舒服"), "the home entry shows the GENERAL answer");
const hist = V.renderDailyFeedbackHistory([mixed]);
assert.ok(hist.includes("一般回報：輕鬆｜沒有不舒服") && hist.includes("週期回報：有點吃力｜有不舒服"));

// app wiring: G01 only, both views, shared builder; home stays general; cycle entry only on the cycle's own page
const app = readFileSync(join(root, "app.js"), "utf8");
const helper = app.slice(app.indexOf("function renderG01CycleDailyReports("), app.indexOf("function d5ProposalPage("));
assert.ok(helper.includes('d5.selectedGoalId !== "G01"') && helper.includes("buildCycleDailyReports(") && helper.includes('readScope: therapist ? "linked_relation" : "own"'));
assert.equal((app.match(/renderG01CycleDailyReports\(proposal, ctx\.cycle, "patient"\)/g) || []).length, 2);
assert.equal((app.match(/renderG01CycleDailyReports\(proposal, ctx\.cycle, "therapist"\)/g) || []).length, 1);
const home = app.slice(app.indexOf("function renderDailyTrainingFeedback("), app.indexOf("function cycleForTodayReport("));
assert.ok(home.includes("dailyFeedbackUiFor(patientId, dateKey, GENERAL_CONTEXT)") && !home.includes("subject"), "the home report never takes the active cycle as its subject");
assert.ok(app.includes('${fromTracking ? renderCycleTrainingFeedback(patientId, rec) : ""}'));
assert.ok(app.includes("subject: ui.subject || null"));
for (const f of ["js/data/f01ProgressionDecision.js", "js/data/d5Arrangement.js", "js/data/trackingCycleService.js", "js/data/d5LlmRecommendation.js", "js/services/d5RecommendationDraftService.js"]) {
  assert.ok(!readFileSync(join(root, f), "utf8").includes("cycleDailyReports"), `${f} does not use the reports`);
}
assert.ok(!readFileSync(join(root, "js/data/cycleDailyReports.js"), "utf8").includes("f01FixedPractice"), "fixed practice never read");
const rules = readFileSync(join(root, "firestore.rules"), "utf8");
assert.ok(rules.includes("(!('subject' in report) || validFeedbackSubject(report))") && rules.includes("cycle.recommendationId == s.recommendationId"));
console.log("cycleDailyReports: all assertions passed");
