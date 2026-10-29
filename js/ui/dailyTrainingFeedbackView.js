import { EFFORT_LABELS, DISCOMFORT_LABELS, GENERAL_CONTEXT, latestForContext, reportContextKey, reportsForContext } from "../data/dailyTrainingFeedback.js";
import { INCOMPLETE_REASON_LABELS } from "../data/incompleteTrainingFeedback.js";
import { renderSavedIncompleteReason } from "./incompleteTrainingFeedbackView.js";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const answer = (r) => `${EFFORT_LABELS[r.effort] || "不確定"}｜${DISCOMFORT_LABELS[r.discomfort] || "不確定"}`;
const contextLabel = (key) => (key === GENERAL_CONTEXT ? "一般回報" : "週期回報");
const ctxArg = (contextKey) => esc(contextKey).replace(/'/g, "");
/** The latest answer of ONE context (general by default); other contexts never stand in for it. */
export function dailyFeedbackSummary(record, contextKey = GENERAL_CONTEXT) {
  const report = latestForContext(record, contextKey);
  if (!report) return "尚未回報（不代表沒有不舒服）";
  return answer(report);
}
/** That context's revisions with their times — collapsed by default. */
function revisionsHtml(reports) {
  if (!reports.length) return "";
  return `<details class="daily-feedback-revisions"><summary>查看今天的歷次回報（${reports.length} 次）</summary><ol class="small">${reports.map((r, i) => `<li>${esc(r.reportedAt)}：${esc(answer(r))}${r.note ? `；${esc(r.note)}` : ""}${renderSavedIncompleteReason(r.incompletion)}${i === reports.length - 1 ? "（目前採用）" : ""}</li>`).join("")}</ol></details>`;
}
const cloudText = (cloudStatus) => (cloudStatus === "failed" ? "雲端資料未載入，無法確認最新回報；請重新登入後再查看。" : cloudStatus === "loading" ? "正在載入雲端回報…" : "");
const isCloudOk = (cloudStatus) => cloudStatus !== "loading" && cloudStatus !== "failed";

/**
 * Today's report of ONE context, read-only (shown inside the report sheet): what it is about, the answer in use,
 * every revision, and that the other context's reports are kept apart. The questions themselves are in the sheet.
 * @param contextKey GENERAL_CONTEXT (home) or cycleContextKey(id) (a cycle's own entry)
 * @param subjectText what a cycle report is about (cycle entry only)
 */
export function renderDailyFeedbackCard({ dateKey, record, cloudStatus = null, contextKey = GENERAL_CONTEXT, subjectText = "" }) {
  const isCycle = contextKey !== GENERAL_CONTEXT;
  const latest = latestForContext(record, contextKey);
  const reports = reportsForContext(record, contextKey);
  const otherCount = record && Array.isArray(record.reports) ? record.reports.filter((r) => reportContextKey(r) !== contextKey).length : 0;
  const cloudOk = isCloudOk(cloudStatus);
  return `<section class="daily-feedback-overview" aria-label="${isCycle ? "本週期今日回報" : "今日訓練感受"}" data-context="${esc(contextKey)}"><h3 class="dfs-title">${isCycle ? "本週期今日回報" : "今日訓練感受"}</h3>
    <p class="dfs-subject">回報對象：${isCycle ? esc(subjectText) : "一般回報（不指定訓練週期）"}</p>
    <div class="dfs-answer"><span class="dfs-label">${esc(dateKey)}　目前採用的回答</span><b>${esc(cloudOk ? dailyFeedbackSummary(record, contextKey) : cloudText(cloudStatus))}</b>${cloudOk && latest && latest.note ? `<p>補充說明：${esc(latest.note)}</p>` : ""}</div>
    ${cloudOk ? renderSavedIncompleteReason(latest?.incompletion) : ""}
    ${cloudOk ? revisionsHtml(reports) : ""}
    ${cloudOk && otherCount ? `<p class="dfs-note">今天另有 ${otherCount} 次${isCycle ? "其他回報（一般回報或其他週期）" : "從訓練週期入口填寫的回報"}，分開保存，不會互相取代。</p>` : ""}
    <p class="dfs-note">${isCycle ? "這份回報只算在上面這個週期。" : "這裡的回報不會自動算成任何訓練週期的回報；要回報本週期的訓練，請從「本週訓練」頁填寫。"}</p></section>`;
}

/**
 * Compact entry (home: general report; 本週訓練: this cycle's report). The questions open in the sheet.
 * @param pending true when an unsent answer is kept (closing the sheet never drops it)
 */
export function renderDailyFeedbackEntry({ record, cloudStatus = null, contextKey = GENERAL_CONTEXT, subjectText = "", pending = false }) {
  const isCycle = contextKey !== GENERAL_CONTEXT;
  const latest = latestForContext(record, contextKey);
  const cloudOk = isCloudOk(cloudStatus);
  const title = !cloudOk ? (cloudStatus === "loading" ? "正在載入今天的回報…" : "無法確認今天的回報") : latest ? (isCycle ? "本週期今日已回報" : "今日已回報") : (isCycle ? "本週期今天練習感覺如何？" : "今天練習感覺如何？");
  const sub = !cloudOk ? cloudText(cloudStatus) : pending ? "有尚未送出的回答" : latest ? answer(latest) : isCycle ? esc(subjectText) : "花幾秒記下今天的感受";
  const label = pending ? "繼續填寫" : latest ? "查看／更新" : "填寫回報";
  return `<section class="card daily-feedback-entry${isCycle ? " daily-feedback-cycle" : ""}${latest && !pending ? " is-done" : ""}" data-context="${esc(contextKey)}">
    <img class="dfe-icon" src="${latest && !pending ? "/images/gamification/checkmark_01.png" : "/images/robot/robot_listening.png"}" alt="" />
    <div class="dfe-text">${isCycle ? `<span class="dfe-eyebrow">本週期今日回報</span>` : ""}<b>${title}</b><span>${sub}</span></div>
    <button class="btn ${latest && !pending ? "btn-light" : "btn-primary"} dfe-btn" onclick="openDailyFeedbackSheet('${ctxArg(contextKey)}')"${cloudOk ? "" : " disabled"}>${label}</button>
  </section>`;
}

/** Questions in order; the incompletion question only when today's target exists and is not met. */
export function dailyFeedbackSteps(progress) {
  return ["effort", "discomfort", ...(progress && progress.completedCount < progress.requiredCount ? ["reason"] : []), "note"];
}
const choice = (field, labels, value, busy) => `<div class="dfs-options" role="radiogroup">${Object.entries(labels).map(([key, text]) => `<button type="button" class="dfs-option${key === value ? " is-selected" : ""}" role="radio" aria-checked="${key === value}" onclick="pickDailyFeedback('${field}','${key}')"${busy ? " disabled" : ""}>${esc(text)}</button>`).join("")}</div>`;

/**
 * The report sheet (bottom panel on phones). One question per step, the step shown, answers kept on 上一步 and on
 * closing; 送出 is the only write. `progressSubjectText` names the cycle target the incompletion question is about.
 */
export function renderDailyFeedbackSheet({ ui, record, progress = null, cloudStatus = null, subjectText = "", progressSubjectText = "" }) {
  const isCycle = ui.contextKey !== GENERAL_CONTEXT;
  const title = isCycle ? "本週期今日回報" : "今日訓練感受";
  const subject = isCycle ? subjectText : "一般回報（不指定訓練週期）";
  const steps = dailyFeedbackSteps(progress);
  const d = ui.draft || {};
  const head = `<div class="dfs-head"><div><b class="dfs-head-title">${title}</b><span class="dfs-head-subject">回報對象：${esc(subject)}</span></div><button type="button" class="dfs-close" onclick="closeDailyFeedbackSheet()" aria-label="關閉"${ui.busy ? " disabled" : ""}>✕</button></div>`;
  let body = "", actions = "";
  if (ui.step === "done") {
    const latest = latestForContext(record, ui.contextKey);
    body = `<div class="dfs-done"><img src="/images/gamification/star_glow_01.png" alt="" /><b>已送出${isCycle ? "本週期" : "今日"}回報</b><p>${latest ? esc(answer(latest)) : ""}</p><p class="dfs-note">修改前的回報也會保留。${isCycle ? "" : "這份是一般回報，不會算成週期回報。"}</p></div>`;
    actions = `<button type="button" class="btn btn-primary full" onclick="closeDailyFeedbackSheet()">完成</button>`;
  } else if (ui.step === "overview") {
    body = renderDailyFeedbackCard({ dateKey: ui.dateKey, record, cloudStatus, contextKey: ui.contextKey, subjectText });
    actions = `<button type="button" class="btn btn-primary full" onclick="editDailyFeedbackFromUi('${ctxArg(ui.contextKey)}')"${isCloudOk(cloudStatus) ? "" : " disabled"}>更新回報</button>`;
  } else {
    const i = Math.max(0, steps.indexOf(ui.step));
    const step = steps[i];
    const dots = `<div class="dfs-progress" aria-label="第 ${i + 1} / ${steps.length} 步"><span>第 ${i + 1} / ${steps.length} 步</span><div>${steps.map((s, j) => `<i class="${j <= i ? "on" : ""}"></i>`).join("")}</div></div>`;
    let q = "", ok = true;
    if (step === "effort") { q = `<h3 class="dfs-q">今天練習時的吃力程度</h3>${choice("effort", EFFORT_LABELS, d.effort, ui.busy)}`; ok = !!d.effort; }
    if (step === "discomfort") { q = `<h3 class="dfs-q">今天是否感到不舒服？</h3>${choice("discomfort", DISCOMFORT_LABELS, d.discomfort, ui.busy)}`; ok = !!d.discomfort; }
    if (step === "reason") {
      q = `<h3 class="dfs-q">如果今天先到這裡，主要原因是？<span class="dfs-optional">（選填）</span></h3>
        <div class="dfs-target"><span class="dfs-label">這一題對應的目標</span><b>${esc(progressSubjectText)}</b><span>今日目標：${progress.completedCount}／${progress.requiredCount} 個動作已達標</span></div>
        ${choice("incompleteReason", { "": "先不填原因", ...INCOMPLETE_REASON_LABELS }, d.incompleteReason, ui.busy)}`;
    }
    if (step === "note") {
      const sum = [`吃力程度：${EFFORT_LABELS[d.effort] || "未選"}`, `不舒服：${DISCOMFORT_LABELS[d.discomfort] || "未選"}`, ...(steps.includes("reason") ? [`未完成原因：${d.incompleteReason ? INCOMPLETE_REASON_LABELS[d.incompleteReason] : "先不填"}`] : [])];
      q = `<h3 class="dfs-q"><label for="dailyFeedbackNote">補充說明<span class="dfs-optional">（選填，最多 500 字）</span></label></h3>
        <textarea id="dailyFeedbackNote" class="dfs-note-input" maxlength="500" rows="3" oninput="setDailyFeedbackNote(this.value)" onfocus="dailyFeedbackFocus(this)"${ui.busy ? " disabled" : ""}>${esc(d.note)}</textarea>
        <ul class="dfs-summary">${sum.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>`;
      ok = !!d.effort && !!d.discomfort;
    }
    body = `${dots}${q}`;
    const back = i > 0 ? `<button type="button" class="btn btn-light" onclick="dailyFeedbackStep(-1)"${ui.busy ? " disabled" : ""}>上一步</button>` : ui.hasOverview ? `<button type="button" class="btn btn-light" onclick="cancelDailyFeedbackEdit()"${ui.busy ? " disabled" : ""}>返回</button>` : "";
    const next = step === "note"
      ? `<button type="submit" class="btn btn-primary dfs-submit"${ok && !ui.busy ? "" : " disabled"}>${ui.busy ? "正在送出…" : ui.failed ? "重新送出" : isCycle ? "送出本週期回報" : "送出回報"}</button>`
      : `<button type="button" class="btn btn-primary" onclick="dailyFeedbackStep(1)"${ok && !ui.busy ? "" : " disabled"}>下一步</button>`;
    actions = `${back}${next}`;
  }
  return `<div class="dfs-backdrop" onclick="closeDailyFeedbackSheet()"></div>
    <form class="dfs-panel" role="dialog" aria-modal="true" aria-label="${title}" onsubmit="saveDailyFeedbackFromUi(event)">
      ${head}
      <div class="dfs-body">${body}${ui.message ? `<p class="dfs-message${ui.failed ? " is-error" : ""}" role="status">${esc(ui.message)}</p>` : ""}</div>
      <div class="dfs-actions">${actions}</div>
    </form>`;
}

export function renderDailyFeedbackHistory(records, { cloudStatus = null, title = "近期訓練感受（本人回報）", limit = 7 } = {}) {
  const warning = cloudStatus === "failed" ? "雲端回報未載入，下列可能只是本機快取，請重新登入確認。" : cloudStatus === "loading" ? "正在載入雲端回報…" : "";
  return `<section class="card daily-feedback-card"><h3 class="section-title">${esc(title)}</h3>
    ${warning ? `<p class="small" role="status">${warning}</p>` : ""}
    ${records.length ? records.slice(0, limit).map((record) => {
      // One line per context: a cycle report and a general report of the same day stay apart.
      const keys = [...new Set((record.reports || []).map(reportContextKey))];
      const lines = keys.map((k) => { const l = latestForContext(record, k); return `${contextLabel(k)}：${answer(l)}`; });
      return `<details id="fb-day-${esc(record.dateKey)}"><summary>${esc(record.dateKey)}｜${esc(lines.join("；") || dailyFeedbackSummary(record))}</summary>
        ${keys.map((k) => { const l = latestForContext(record, k); return `<p class="small">${contextLabel(k)}：${esc(l?.note || "無補充說明")}｜共 ${reportsForContext(record, k).length} 次回報／修正</p>${renderSavedIncompleteReason(l?.incompletion)}`; }).join("")}
        <ol class="small">${record.reports.map((r) => `<li>${esc(r.reportedAt)}｜${contextLabel(reportContextKey(r))}：${esc(EFFORT_LABELS[r.effort])}｜${esc(DISCOMFORT_LABELS[r.discomfort])}${r.note ? `；${esc(r.note)}` : ""}${renderSavedIncompleteReason(r.incompletion)}</li>`).join("")}</ol></details>`;
    }).join("") : `<p class="small">${warning ? "目前無法確認是否有回報。" : "尚無可查看的回報；不代表沒有不舒服。"}</p>`}
    <p class="small fa5x-muted">僅呈現本人回報，尚未納入 D5 判定或 AI 週摘要。</p></section>`;
}

/**
 * UX round 5/5 — the last 7 days at a glance: 吃力 / 不適 / 未完成原因 per day from the newest report of that day
 * (any context). A day with no report says 「未回報」 in words (never 「沒有不舒服」); a failed cloud load says
 * 「無法確認」. A day with a record opens that day's entry in the history below.
 * @param dateKeys the 7 local date keys, oldest first
 */
export function renderFeedbackWeek(records, dateKeys, { cloudStatus = null, weekdayOf = () => "" } = {}) {
  const byDay = new Map((records || []).map((r) => [r.dateKey, r]));
  const unknown = cloudStatus === "failed" || cloudStatus === "loading";
  const rows = dateKeys.map((key) => {
    const record = byDay.get(key);
    const reports = record && Array.isArray(record.reports) ? record.reports : [];
    const last = reports[reports.length - 1] || null;
    const md = `${key.slice(5, 7)}/${key.slice(8, 10)}${weekdayOf(key) ? `（${weekdayOf(key)}）` : ""}`;
    if (!last) return `<li class="fbw-row is-missing"><span class="fbw-date">${md}</span><span class="fbw-cell">${unknown ? "無法確認" : "未回報"}</span><span class="fbw-cell"></span><span class="fbw-cell"></span></li>`;
    const discomfort = last.discomfort === "yes";
    return `<li class="fbw-row"><button type="button" class="fbw-open" onclick="openFeedbackDay('${esc(key)}')" aria-label="${md} 的回報，開啟紀錄"><span class="fbw-date">${md}</span><span class="fbw-cell">${esc(EFFORT_LABELS[last.effort] || "不確定")}</span><span class="fbw-cell${discomfort ? " is-warn" : ""}">${discomfort ? "⚠ " : ""}${esc(DISCOMFORT_LABELS[last.discomfort] || "不確定")}</span><span class="fbw-cell">${last.incompletion ? `未完成：${esc(INCOMPLETE_REASON_LABELS[last.incompletion.reason] || "不確定")}` : ""}</span></button></li>`;
  });
  const reported = dateKeys.filter((k) => byDay.get(k) && (byDay.get(k).reports || []).length).length;
  const withDiscomfort = dateKeys.filter((k) => { const r = byDay.get(k); const l = r && r.reports && r.reports[r.reports.length - 1]; return l && l.discomfort === "yes"; }).length;
  return `<section class="card fbw-card"><h3 class="section-title">近 7 天感受</h3>
    <p class="small">${unknown ? "雲端回報尚未載入，無法確認是否有回報。" : `7 天中有回報 ${reported} 天，其中回報不舒服 ${withDiscomfort} 天；沒有回報的日子不代表沒有不舒服。`}</p>
    <ul class="fbw-list"><li class="fbw-row fbw-head" aria-hidden="true"><span class="fbw-date">日期</span><span class="fbw-cell">吃力程度</span><span class="fbw-cell">不適</span><span class="fbw-cell">未完成原因</span></li>${rows.join("")}</ul></section>`;
}
