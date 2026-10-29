import { EFFORT_LABELS, DISCOMFORT_LABELS } from "../data/dailyTrainingFeedback.js";
import { INCOMPLETE_REASON_LABELS } from "../data/incompleteTrainingFeedback.js";
import { REPORT_STATE, ATTRIBUTION, CYCLE_DAILY_REPORTS_NOTE } from "../data/cycleDailyReports.js";
import { formatDateKeyMonthDay, toLocalDateKey } from "../data/trackingCycle.js";

/**
 * 本週練習回報 — one rendering of buildCycleDailyReports() for the patient's and the therapist's G01
 * next-stage views. Facts only, with their dates: no tolerance, improvement or contradiction wording.
 */
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const dates = (list) => (list || []).map(formatDateKeyMonthDay).join("、");
const STATE_TEXT = {
  [REPORT_STATE.INCOMPLETION_ONLY]: "本週期的吃力與不適未回報（不代表沒有不舒服）；只有首頁填寫的未完成原因",
  [REPORT_STATE.NOT_REPORTED]: "本週期未回報（不代表沒有不舒服）",
  [REPORT_STATE.NOT_LOADED]: "無法確認（回報尚未從雲端載入）",
  [REPORT_STATE.LOAD_FAILED]: "無法確認（雲端回報載入失敗）",
  [REPORT_STATE.UNATTRIBUTABLE]: "有紀錄，但無法確認屬於這個週期",
  [REPORT_STATE.OTHER_CYCLE]: "這天的回報屬於另一個週期，未列入",
  [REPORT_STATE.NOT_IN_READ_SCOPE]: "可讀取的範圍內沒有找到回報（只能讀取帶有目前照護關係的回報），無法確認患者是否回報",
};
const TRAINING_TEXT = {
  completed: "完成當天的訓練",
  partial: "部分完成",
  attempted_not_completed: "有訓練紀錄，但未完成當天目標",
  started_no_record: "已開始當天訓練，沒有完成紀錄",
  no_training_record: "沒有訓練紀錄",
};
const ATTRIBUTION_TEXT = {
  [ATTRIBUTION.CYCLE_ENTRY]: "從本週期的回報入口填寫",
};
const groupLine = (map, labels, marked = []) => Object.entries(map || {}).map(([k, ds]) => `${esc(labels[k] || k)}：${ds.map((x) => `${formatDateKeyMonthDay(x)}${marked.includes(x) ? "（首頁）" : ""}`).join("、")}`).join("；");
/** The incompletion field of a home report — the only part of it that is about this cycle. */
const homeIncompletionLine = (h) => `未完成原因（首頁填寫，針對本週期當天目標）：${esc(INCOMPLETE_REASON_LABELS[h.reason] || h.reason)}${h.requiredCount != null ? `（回報時完成 ${h.completedCount} / ${h.requiredCount} 個動作）` : ""}｜回報時間：${esc(h.reportedAt)}｜紀錄 ID：${esc(h.recordId)}`;
const INCOMPLETION_FOR_TEXT = {
  this_cycle: "這份回報的未完成原因已列入上方本週期資訊；吃力、不適與備註未列入",
  other_cycle: "這份回報的未完成原因屬於其他週期，未列入",
};
const answerLine = (r) => `${esc(EFFORT_LABELS[r.effort] || "不確定")}｜${esc(DISCOMFORT_LABELS[r.discomfort] || "不確定")}`;
/** Every revision of one context, oldest first, with its time — collapsed by default. */
function historyHtml(a) {
  if (!a || !a.history || !a.history.length) return "";
  return `<details class="cycle-daily-history"><summary>查看歷次回報（${a.history.length} 次）</summary><ol class="small">${a.history.map((h, i) => `<li>${esc(h.reportedAt)}：${answerLine(h)}${h.incompletionReason ? `｜未完成原因：${esc(INCOMPLETE_REASON_LABELS[h.incompletionReason] || h.incompletionReason)}` : ""}${h.note ? `｜${esc(h.note)}` : ""}${i === a.history.length - 1 ? "（目前採用）" : ""}</li>`).join("")}</ol></details>`;
}
const SCOPE_NOTE = {
  own: "這裡顯示你本人的每日回報。復健師只能讀取照護關係建立後、帶有該關係的回報，看到的天數可能比你少。",
  linked_relation: "復健師只能讀取患者在照護關係建立後、帶有此關係的每日回報；患者本人看到的可能比這裡多。",
};

/** @param result buildCycleDailyReports() output */
export function renderCycleDailyReports(result) {
  if (!result || result.error) return `<div class="card cycle-daily-reports"><b class="fa5x-section-title">本週練習回報</b><p class="small">無法整理這個週期的回報。</p></div>`;
  const s = result.summary;
  const loaded = result.loadState === "loaded";
  const loadNote = result.loadState === "failed" ? "每日回報的雲端資料載入失敗，無法確認這幾天是否有回報或回報內容。"
    : result.loadState === "not_loaded" ? "每日回報尚未從雲端載入完成，無法確認這幾天是否有回報或回報內容。" : "";
  const brief = [
    loaded ? `本週期回報 ${s.reportedDates.length} / ${s.dayCount} 天${s.reportedDates.length ? `：${dates(s.reportedDates)}` : ""}` : `本週期回報：無法確認（${dates(s.unknownDates)}）`,
    s.notReportedDates.length ? `本週期未回報：${dates(s.notReportedDates)}` : "",
    loaded && s.unknownDates.length ? `無法確認：${dates(s.unknownDates)}` : "",
    s.incompletionOnlyDates.length ? `只有未完成原因（首頁填寫；吃力與不適未針對本週期回報）：${dates(s.incompletionOnlyDates)}` : "",
    s.otherCycleDates.length ? `屬於其他週期（未列入）：${dates(s.otherCycleDates)}` : "",
    Object.keys(s.effortDates).length ? `吃力程度｜${groupLine(s.effortDates, EFFORT_LABELS)}` : "",
    Object.keys(s.discomfortDates).length ? `不適｜${groupLine(s.discomfortDates, DISCOMFORT_LABELS)}` : "",
    Object.keys(s.incompletionDates).length ? `未完成原因｜${groupLine(s.incompletionDates, INCOMPLETE_REASON_LABELS, s.homeIncompletionDates)}` : "",
    `訓練紀錄｜完成：${s.completedTrainingDates.length ? dates(s.completedTrainingDates) : "無"}；部分完成或未完成目標：${s.partialTrainingDates.length ? dates(s.partialTrainingDates) : "無"}`,
    s.revisedDates.length ? `曾修改回報（以當天最後一次為準）：${dates(s.revisedDates)}` : "",
    s.sameDayGeneralDates.length ? `另有同日期的一般回報（未計入）：${dates(s.sameDayGeneralDates)}` : "",
  ].filter(Boolean);
  const day = (d) => {
    const r = d.report;
    const t = d.training;
    const lines = r
      ? [
        `吃力程度：${esc(EFFORT_LABELS[r.effort] || "不確定")}`,
        `不適：${esc(DISCOMFORT_LABELS[r.discomfort] || "不確定")}`,
        r.incompletion ? `未完成原因：${esc(INCOMPLETE_REASON_LABELS[r.incompletion.reason] || r.incompletion.reason)}${r.incompletion.requiredCount != null ? `（回報時完成 ${r.incompletion.completedCount} / ${r.incompletion.requiredCount} 個動作）` : ""}` : "",
        r.note ? `補充說明：${esc(r.note)}` : "",
        `回報時間：${esc(r.reportedAt)}｜${r.revisionCount > 1 ? `共 ${r.revisionCount} 次回報，以最後一次為準` : "1 次回報"}｜${esc(ATTRIBUTION_TEXT[r.attribution] || "")}`,
        `紀錄 ID：${esc(r.recordId)}`,
        historyHtml(r),
        d.homeIncompletion ? homeIncompletionLine(d.homeIncompletion) : "",
      ]
      : [esc(STATE_TEXT[d.reportState] || "無法確認"), d.homeIncompletion ? homeIncompletionLine(d.homeIncompletion) : "", d.sameDayGeneral ? "同日另有一般回報（吃力、不適與備註），見下方「同日期的一般回報」" : "", d.excludedRecordId && !d.sameDayGeneral ? `紀錄 ID：${esc(d.excludedRecordId)}` : ""];
    lines.push(`訓練：${esc(TRAINING_TEXT[t.status] || t.status)}${t.requiredCount != null ? `（${t.completedCount} / ${t.requiredCount} 個動作）` : ""}${t.attemptRecordIds.length ? `｜訓練紀錄 ID：${t.attemptRecordIds.map(esc).join("、")}` : ""}`);
    return `<li><b>第 ${d.dayNumber} 天｜${formatDateKeyMonthDay(d.dateKey)}</b><ul class="small">${lines.filter(Boolean).map((l) => `<li>${l}</li>`).join("")}</ul></li>`;
  };
  const general = result.sameDayGeneral || [];
  const generalHtml = general.length
    ? `<div class="cycle-daily-general"><b class="small">同日期的一般回報（未確認屬於本週期）</b>
      <p class="small fa5x-muted">這些是從首頁填寫、沒有指定週期的回報。日期與本週期的訓練日相同，不代表是在回報本週期的訓練，因此不計入上面的回報天數與統計。</p>
      <ul class="small cycle-daily-general-list">${general.map((g) => `<li><b>${formatDateKeyMonthDay(g.dateKey)}</b>｜${answerLine(g)}${g.note ? `｜補充說明：${esc(g.note)}` : ""}｜回報時間：${esc(g.reportedAt)}｜${g.revisionCount > 1 ? `共 ${g.revisionCount} 次，以最後一次為準` : "1 次回報"}｜紀錄 ID：${esc(g.recordId)}${g.incompletionFor ? `<div class="fa5x-muted">${INCOMPLETION_FOR_TEXT[g.incompletionFor]}</div>` : ""}${historyHtml(g)}</li>`).join("")}</ul></div>`
    : "";
  const c = result.statusCheck;
  const checkHtml = c
    ? `<div class="cycle-daily-status-check"><b class="small">最後一次狀況確認${c.at ? `（${esc(formatDateKeyMonthDay(toLocalDateKey(c.at)))}）` : ""}</b><p class="small">${c.hasNewOrWorseningDiscomfort ? "回答：有新的或加重的不適" : "回答：沒有新的或加重的不適"}${c.discomfortNote ? `；補充：${esc(c.discomfortNote)}` : ""}</p><p class="small fa5x-muted">這是週期結束時的狀況確認，與上面的每日回報分開記錄；系統不判定兩者是否一致、是否已緩解。</p></div>`
    : "";
  return `<div class="card cycle-daily-reports" data-load-state="${esc(result.loadState)}">
    <b class="fa5x-section-title">本週練習回報</b>
    ${loadNote ? `<p class="small" role="status">${loadNote}</p>` : ""}
    <p class="small fa5x-muted cycle-daily-scope">${SCOPE_NOTE[result.readScope] || ""}</p>
    <ul class="small cycle-daily-brief">${brief.map((l) => `<li>${l}</li>`).join("")}</ul>
    <details class="cycle-daily-days"><summary>查看逐日內容</summary><ol class="cycle-daily-day-list">${result.days.map(day).join("")}</ol></details>
    ${generalHtml}
    ${checkHtml}
    <p class="small fa5x-muted">${CYCLE_DAILY_REPORTS_NOTE}</p>
  </div>`;
}
