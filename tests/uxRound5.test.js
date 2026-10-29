import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 使用體驗改善 5/5 — interface finishing (program logic; synthetic data).
 * Home / 我的 / 訓練 layout, the fixed-practice result's self-report entry, 數據 wording, the 5xSTS result's save
 * state and the 功能評估 page. No rule, dose, threshold, permission or acceptance condition is touched here.
 */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const css = readFileSync(join(root, "styles.css"), "utf8");
const { storageService } = await import("../js/data/storageService.js");
const fnSrc = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, name);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
const homeStart = appJs.indexOf("patientHome = function()");
const homeSrc = appJs.slice(homeStart, appJs.indexOf("${inviteCardHtml}`;", homeStart) + 20);

// ── 1. Home: greeting, one primary task, feedback entry, short progress. Achievements, invite card and free practice moved ──
{
  const tpl = homeSrc.slice(homeSrc.lastIndexOf("return `<div class=\"top-profile-container\">"));
  const order = ["${companionBannerHtml}", "${functionalAssessmentSectionHtml}", "${renderDailyTrainingFeedback(patientId)}", "${progressCardHtml}"].map((t) => tpl.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), "greeting → primary task → feedback → progress");
  assert.ok(!tpl.includes("achievementPreviewHtml") && !tpl.includes("selfPracticeSectionHtml") && !homeSrc.includes("goSelfPracticeLibrary()"), "no achievements preview / free practice on Home");
  assert.ok(!homeSrc.includes("inviteCardHtml = renderInviteCodeCard()"), "the invite-code card is no longer on Home");
  assert.ok(homeSrc.includes("if (hasTherapist && state.inviteMessage)"), "the one-time 已成功加入 message after linking is kept");
  // 我的: achievements + the invite-code entry (same card and handlers)
  const profile = fnSrc("profilePage");
  assert.ok(profile.includes(">復健成就<") && profile.includes('onclick="goAchievements()"'), "achievements in 我的");
  assert.ok(profile.includes('<div id="profileTherapistLink">${renderInviteCodeCard()}</div>'), "invite-code entry in 我的 → 我的復健師 when unlinked");
  // pending review without a linked therapist still reaches the link entry directly from Home
  const card = fnSrc("renderF01InitialPlanHomeCard");
  assert.ok(card.includes('n.status === "awaiting_review_unlinked"') && card.includes('onclick="goTherapistLink()"') && card.includes("輸入復健師邀請碼"));
  assert.ok(fnSrc("goTherapistLink").includes('switchTab("profile")') && fnSrc("goTherapistLink").includes("profileTherapistLink"));
  assert.ok(/Object\.assign\(window, \{ goTherapistLink,/.test(appJs), "exposed for the onclick");
  // every plan state keeps its entry: the primary-task chain is unchanged
  assert.ok(homeSrc.includes('renderTrackingCycleCard(patientId) || (planLoad !== "loaded" ? renderHomePlanLoadCard(planLoad) : homeInitialPlanIsPrimary(patientId) ? "" : defaultHeroHtml)'));
}

// ── 2. 訓練: ONE overview card (date, X / Y, sources, the week's entry); date strip, tasks and start buttons kept ──
{
  const page = fnSrc("todaySchedulePage");
  assert.ok(!page.includes("today-week-card") && page.includes('class="today-overview-week"') && page.includes("goTrackingWeekTraining('${weekCycleId}', 'work')"), "week entry merged into the overview");
  assert.ok(page.includes("selectScheduleDate(") && page.includes("renderTodayRemotionTask(item, primary, plan)") && page.includes("renderTodayTherapistTask(item, schedule, plan)"), "date selection + the tasks");
  assert.ok(page.includes("summary.remotionCompleted, summary.remotionCount, hasTherapist)") && page.includes("summary.therapistCompleted, summary.therapistCount, hasRemotion)"), "a group's own count only when both sources are listed");
  assert.ok(page.includes("goF01FixedPracticeFrom('work')") && page.includes('"自主練習"'), "free practice and 坐站練習 live in 訓練");
  assert.ok(fnSrc("renderTodayTaskCard").includes("today-task-start"), "start buttons unchanged");
}

// ── 3. fixed-practice result: actions next to the result; the self-report form is a closed secondary entry ──
{
  const page = fnSrc("f01FixedPracticeRecordPage");
  const tpl = page.slice(page.lastIndexOf("return `<div class=\"fp-page\">"));
  const order = ["fpr-hero", "${renderF01FixedPracticeSync(r)}", '<div class="fpr-actions">', "${unconfirmedHtml}", "${ai && !r.selfReport ? selfHtml"].map((t) => tpl.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), "result + save state → actions → unconfirmed reasons → self-report entry");
  assert.ok(tpl.indexOf("${ai && r.selfReport ? selfHtml") < tpl.indexOf("${unconfirmedHtml}"), "a saved self-report sits right under the actions");
  assert.ok(page.includes('<details class="card fp-section f01-fixed-self fpr-self-entry"${selfOpen ? " open" : ""}') && page.includes("<summary><span>補記自己完成的次數</span>"), "closed until opened");
  assert.ok(page.includes('const selfOpen = state.f01FixedSelfOpen === r.id || draft !== ""'), "stays open while a draft is kept (re-render safe)");
  assert.ok(page.includes('oninput="keepF01FixedSelfDraft(') && page.includes("value=\"${draft}\""), "typed input kept");
  assert.ok(page.includes("自行回報（本人填寫）") && page.includes("沒有加入 AI 計次"), "self-report separate from the AI count");
  const save = fnSrc("addF01FixedPracticeSelfReport");
  assert.ok(save.includes("state.f01FixedSelfDraft = { id, value: String(n) }") && save.includes("state.f01FixedSelfError = res.error ? id : null") && save.includes("if (!res.error) state.f01FixedSelfDraft = null"), "failed save keeps the number for a retry");
  assert.ok(page.includes("剛才沒有保存成功，輸入的次數還在"), "the failure is said on the page");
  assert.ok(save.includes("n > 1000") && save.includes("Number.isInteger(n)"), "existing fill rule unchanged");
  assert.ok(css.includes(".fpr-self-entry > summary"));
}

// ── 4. 數據 overview: stated range; no first-practice hint when fixed practice / self-reports exist ──
{
  const ov = fnSrc("patientDataOverviewPage");
  assert.ok(ov.includes("近 7 天：${rangeText}（含今天）"), "the real range is stated");
  assert.ok(ov.includes("const nothingRecorded = records.length === 0 && fixedCount === 0 && selfCount === 0") && ov.includes("${nothingRecorded ? `<p class=\"small\">完成第一次練習後"), "no contradictory hint");
  assert.ok(ov.includes("坐站練習（全部）") && ov.includes("自行回報（本人填寫，全部）") && ov.includes("不計入上面的訓練次數與天數"), "fixed practice / self-report each shown, outside the counts");
  assert.ok(ov.includes("week.completedSessionCount") && ov.includes("week.activeDays"), "statistics definitions unchanged (same weekly summary)");
  assert.ok(ov.includes('<div class="card data-trend-compact"><b>AI 姿勢分數趨勢</b>'), "compact empty trend");
  const rec = fnSrc("actionRecordsPage");
  assert.ok(rec.includes("還沒有訓練紀錄。你的坐站練習與自行回報在上方的分頁中。"), "records list: no first-practice hint when other records exist");
}

// ── 5. 5xSTS result: real save state; version codes behind 量測說明 ──
{
  const make = (stub) => new Function("storageService", "state", "renderKeepingScroll", `${fnSrc("fa5xSaveState")}\nreturn fa5xSaveState;`)(stub, { route: "x" }, () => {});
  const s = { id: "fa-1" };
  const base = { isCloudSyncActive: () => true, isCloudWritePending: () => false, getLastCloudWriteOutcome: () => ({ ok: true }) };
  assert.equal(make(base)(s).title, "評估已保存");
  assert.equal(make({ ...base, isCloudWritePending: () => true })(s).chip, "保存中…", "never 已保存 while the write is on its way");
  assert.equal(make({ ...base, getLastCloudWriteOutcome: () => ({ ok: false, code: "permission-denied" }) })(s).key, "failed");
  assert.equal(make({ ...base, isCloudSyncActive: () => false })(s).key, "local");
  const page = fnSrc("fiveTimesSitToStandResultPage");
  assert.ok(page.includes('<details class="fa5x-tech"><summary>量測說明</summary>') && page.includes("量測版本：${result.algorithmVersion"), "version codes in details");
  // round 5 follow-up: the save state is one line of the status list (completion / saving / conditions / comparison apart)
  assert.ok(page.includes('<div><dt>保存狀態</dt><dd class="fa5x-save-chip is-${save.key}" role="status">${save.chip}</dd></div>'));
  assert.ok(page.includes("<dt>完成狀態</dt>") && page.includes("<dt>測試條件</dt>") && page.includes("<dt>前後比較</dt>") && !page.includes("✓ 已完成"), "no single ✓ for everything");
  assert.ok(page.includes("${renderFa5xConditionSection(session, conditionInfo)}"), "condition entry kept");
  // the real per-document pending state
  assert.equal(storageService.isCloudWritePending("functionalAssessmentSessions", "nothing"), false);
  const svc = readFileSync(join(root, "js/data/storageService.js"), "utf8");
  assert.ok(svc.includes("pendingCloudWriteIds.set(key, (pendingCloudWriteIds.get(key) || 0) + 1)") && svc.includes("pendingCloudWriteIds.delete(key)"));
}

// ── 6. 功能評估: no duplicate 「目前」 card; each week keeps its record + entry; compact empty 訓練表現 ──
{
  const page = fnSrc("f01TrackingHistoryPage");
  assert.ok(page.includes('const currentHtml = cur ? "" :') && page.includes("const isCur = !!cur && cur.cycleId === w.cycleId"), "the running week's own card says 目前");
  assert.ok(page.includes("查看第 ${w.weekNumber} 週前後比較") && page.includes("goTrackingReassessment('${w.cycleId}')"), "week entries kept");
  assert.ok(page.includes('<div class="card track-perf is-empty"><b>訓練表現</b>'), "compact empty 訓練表現");
  assert.ok(page.includes("functionalProgressService.getFa5xChart(") && page.includes("renderFa5xChart(chart)"), "the same chart (rules untouched)");
}

// ── 7. formal 坐姿起立: the same Training Result view as the squat trainings, with the record's real save state ──
{
  const fin = fnSrc("finalizeLe05Training");
  assert.ok(fin.includes("const before=gamificationEngine.getGamificationSummary(m.patientId)") && fin.includes("setTrainingRewardFeedback(m.patientId,before,rec)"), "坐姿起立 now opens the Training Result view");
  assert.ok(fnSrc("persistSquatSession").includes("setTrainingRewardFeedback(meta.patientId, gamificationBefore, record)"), "squat uses the same helper");
  const detail = fnSrc("exerciseDetailPage");
  assert.ok(detail.includes('saveHtml: latestRecord ? renderTrainingSaveState("analysisRecords", latestRecord.id) : ""'));
  const make = (stub) => new Function("storageService", `${fnSrc("trainingSaveState")}\nreturn trainingSaveState;`)(stub);
  const base = { isCloudSyncActive: () => true, isCloudWritePending: () => false, getLastCloudWriteOutcome: () => ({ ok: true }) };
  assert.equal(make(base)("analysisRecords", "r").text, "已同步到雲端");
  assert.equal(make({ ...base, isCloudWritePending: () => true })("analysisRecords", "r").text, "儲存中…");
  assert.equal(make({ ...base, getLastCloudWriteOutcome: () => ({ ok: false }) })("analysisRecords", "r").key, "failed");
  assert.equal(make({ ...base, isCloudSyncActive: () => false })("analysisRecords", "r").key, "local");
  assert.ok(readFileSync(join(root, "js/ui/exerciseExperienceView.js"), "utf8").includes("${saveHtml}"), "the view shows it in the result head");
}

// ── 8. the cloud copy leaves undefined fields out (summary: { ...s, repRecords: undefined } used to make setDoc throw) ──
{
  const { withoutUndefined } = await import("../js/data/storageService.js");
  class Sentinel {}
  const s = new Sentinel();
  assert.deepEqual(withoutUndefined({ a: 1, b: undefined, c: { d: undefined, e: [1, { f: undefined, g: 2 }] } }), { a: 1, c: { e: [1, { g: 2 }] } });
  assert.equal(withoutUndefined({ x: s }).x, s, "Firestore sentinels / class instances untouched");
  const svc = readFileSync(join(root, "js/data/storageService.js"), "utf8");
  assert.ok(svc.includes("write = setDoc(doc(firestore, name, record.id), withoutUndefined(record))") && svc.includes("catch (error) { write = Promise.reject(error); }"), "a synchronous throw is a tracked failed write");
}

// ── 9. 下一階段建議: state → actual change → action → items → reasons → decision record; three facts kept apart ──
{
  const page = fnSrc("d5ProposalPage");
  const tpl = page.slice(page.lastIndexOf("return `${header}"));
  const order = ["${stateHtml}", "${attentionHtml}", "${changeHtml}", "d5-actions", "${itemsHtml}", "${reasonsHtml}", "${recordHtml}"].map((t) => tpl.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `order ${order}`);
  assert.ok(page.includes("<dt>規則判定</dt>") && page.includes("<dt>實際動作與訓練量</dt>") && page.includes("<dt>審閱與接受</dt>"));
  assert.ok(page.includes("<summary>詳細決策紀錄</summary>") && page.includes("[d5.decisionRuleId, d5.selectionRuleId]") && page.includes("describeDecisionSource(arrangement)"), "rule id / LLM source kept, in the record");
  const attention = page.slice(page.indexOf("const attentionHtml"), page.indexOf("const changeHtml"));
  assert.ok(attention.includes('class="card d5-attention"') && !attention.includes("<details"), "new limitations etc. are never folded away");
  // the acceptance condition itself is untouched (same expression as before this round)
  assert.ok(page.includes('const readyForAcceptance = !accepted && (arrangement.status === "reviewed" || (!noAuto && engineReady && arrangement.status === "ready"));'));
  const { summarizeD5ActualChange, compareD5Weeks } = await import("../js/ui/d5ProposalView.js");
  const d5 = { currentExerciseIds: ["F01-01", "F01-02", "F01-04"], proposedExerciseIds: ["F01-01", "F01-02", "F01-04"] };
  const reviewedSame = compareD5Weeks(d5, { afterItems: d5.currentExerciseIds.map((exerciseId) => ({ exerciseId, dose: { sets: null, repetitions: null, durationSeconds: null } })) });
  assert.ok(reviewedSame.rows.every((r) => r.change === "kept"), "a dose of nulls (the default) is not 「復健師設定訓練量」");
  assert.equal(summarizeD5ActualChange(reviewedSame, { changes: [] }).title, "本週動作與組次未變更");
  const replaced = compareD5Weeks({ ...d5, proposedExerciseIds: ["F01-01", "F01-03", "F01-04"] });
  const sum = summarizeD5ActualChange(replaced);
  assert.ok(!sum.unchanged && sum.changedRows.length === 1 && sum.changedRows[0].change === "replaced");
  // needs-review screen: the real trigger first; the generic NC-A02 line goes to the details when another trigger exists
  assert.ok(page.includes('arrangement.reasons.filter((r) => r.code !== "adjust_without_rule")') && page.includes("<summary>理由與本次回報</summary>"));
}

// ── 10. shown-value difference everywhere (no 「不到 0.1 秒」 beside a 「少 0.1 秒」 for the same pair) ──
{
  const { explainD5Decision } = await import("../js/ui/d5ProposalView.js");
  const d5 = { assessmentValid: true, changeMs: -30, changeClass: "within_reference_mdc", completedTrainingDays: 6, plannedTrainingDays: 6, newLimitations: [], matrixDecision: "maintain", decision: "maintain", decisionRuleId: "R001" };
  assert.ok(explainD5Decision(d5, { baselineMs: 12460, reassessmentMs: 12430 })[0].startsWith("本次完成時間較初次少 0.1 秒"), "12.46 → 12.43 is shown 12.5 → 12.4");
  assert.ok(explainD5Decision(d5)[0].includes("不到 0.1 秒"), "without the shown values the raw sentence stays (unchanged rule)");
  assert.ok(!fnSrc("d5ProposalPage").includes("describeTimeDifference(cmp.changeMs)"));
}

// ── 11. chart: only measured points; the coming date in words outside the plot; each point opens its record ──
{
  const r = fnSrc("renderFa5xChart");
  const render = new Function("formatDateKeyMonthDay", "fmtFa5xSec", `${r}\nreturn renderFa5xChart;`)((k) => `${k.slice(5, 7)}/${k.slice(8, 10)}`, (ms) => `${(ms / 1000).toFixed(1)} 秒`);
  const html = render({ points: [{ assessmentId: "a1", ms: 12400, dateKey: "2026-10-22", weekNumber: 1, role: "初次評估" }], weeks: [{ weekNumber: 1, from: 0, to: null, pending: true, comparable: false }], planned: { weekNumber: 1, dateKey: "2026-10-28", ready: false } });
  const svg = html.slice(html.indexOf("<svg"), html.indexOf("</svg>"));
  assert.equal((svg.match(/class="fa5c-dot"/g) || []).length, 1);
  assert.ok(!svg.includes("10/28") && html.includes("<b>下次評估：</b>10/28（第 1 週），尚未量測"), "no slot / height for the future date");
  assert.ok(svg.includes("goFiveTimesSitToStandResult('a1', 'data')") && svg.includes('tabindex="0"'), "a point opens its own result, also by keyboard");
}

// ── 12. daily report save: the real cause, no network guess; a retry that finds its own committed report is success ──
{
  const { classifyFeedbackSaveError, isSameLatestReport } = await import("../js/data/dailyTrainingFeedbackService.js");
  assert.equal(classifyFeedbackSaveError({ code: "permission-denied" }), "cloud_rejected");
  assert.equal(classifyFeedbackSaveError({ code: "unavailable" }), "offline");
  assert.equal(classifyFeedbackSaveError({ code: "unauthenticated" }), "not_signed_in");
  assert.equal(classifyFeedbackSaveError({ code: "invalid-argument" }), "invalid_payload");
  assert.equal(classifyFeedbackSaveError(new Error("x")), "cloud_save_failed");
  const input = { patientId: "p", expectedRevision: 0, effort: "easy", discomfort: "no", note: " ok ", subject: null };
  const mine = { revision: 1, reports: [{ reportedBy: "p", effort: "easy", discomfort: "no", note: "ok" }] };
  assert.ok(isSameLatestReport(mine, input), "own report already committed");
  assert.ok(!isSameLatestReport({ ...mine, revision: 2 }, input), "someone else wrote in between -> a real conflict");
  assert.ok(!isSameLatestReport({ revision: 1, reports: [{ reportedBy: "p", effort: "very_hard", discomfort: "no", note: "ok" }] }, input));
  const svc = readFileSync(join(root, "js/data/dailyTrainingFeedbackService.js"), "utf8");
  assert.ok(svc.includes('if (isOffline()) return { error: "offline" };') && svc.includes("withoutUndefined(built.record)"));
  const errs = fnSrc("saveDailyFeedbackFromUi");
  for (const k of ["offline:", "cloud_rejected:", "invalid_payload:", "cloud_save_failed:"]) assert.ok(errs.includes(k), k);
  assert.ok(!/cloud_save_failed: "[^"]*網路與登入/.test(errs), "the unknown case no longer guesses 網路與登入");
}

// ── 13. 我的數據: stage card = Home's state; mini week + feedback week say missing days in words ──
{
  assert.ok(fnSrc("renderDataStageCard").includes("trackingCardState(patientId)") && fnSrc("renderTrackingCycleCard").includes("trackingCardState(patientId)"), "one state for Home and 數據");
  const ov = fnSrc("patientDataOverviewPage");
  assert.ok(ov.includes('week.incompleteCount ? "確認完成 0 天" : "沒有紀錄"') && ov.includes("renderDataMiniWeek(canonicalWeeklyProgress(patientId).completedByDay)"), "沒有紀錄 vs 確認完成 0 天; same counts as 訓練紀錄");
  const { renderFeedbackWeek } = await import("../js/ui/dailyTrainingFeedbackView.js");
  const keys = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];
  const fb = renderFeedbackWeek([{ dateKey: "2026-10-27", reports: [{ effort: "somewhat_hard", discomfort: "yes" }] }], keys);
  assert.equal((fb.match(/未回報/g) || []).length, 6, "6 days without a report say so");
  assert.ok(fb.includes("openFeedbackDay('2026-10-27')") && fb.includes("⚠ 有不舒服") && fb.includes("有回報 1 天，其中回報不舒服 1 天"));
  assert.ok(renderFeedbackWeek([], keys, { cloudStatus: "failed" }).includes("無法確認"), "load failed is never 「未回報」");
  const strip = fnSrc("renderWeeklyActivityRow");
  assert.ok(strip.includes('d.count > 0 ? `${d.count} 次` : "—"') && strip.includes("scrollToTrainingDay("), "count in words; a day opens its records");
}

console.log("UX round 5/5 tests passed");
