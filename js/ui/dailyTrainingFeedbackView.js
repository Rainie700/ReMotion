import { EFFORT_LABELS, DISCOMFORT_LABELS, latestDailyFeedback } from "../data/dailyTrainingFeedback.js";
import { renderIncompleteProgress, renderIncompleteReasonInput, renderSavedIncompleteReason } from "./incompleteTrainingFeedbackView.js";
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const options = (labels, value) => `<option value="">請選擇</option>${Object.entries(labels).map(([key, text]) => `<option value="${key}"${key === value ? " selected" : ""}>${text}</option>`).join("")}`;
export function dailyFeedbackSummary(record) {
  const report = latestDailyFeedback(record);
  if (!report) return "尚未回報（不代表沒有不舒服）";
  return `${EFFORT_LABELS[report.effort] || "不確定"}｜${DISCOMFORT_LABELS[report.discomfort] || "不確定"}`;
}
export function renderDailyFeedbackCard({ dateKey, record, editing = false, draft = {}, busy = false, message = "", cloudStatus = null, progress = null }) {
  const latest = latestDailyFeedback(record);
  const values = editing ? { ...latest, ...draft } : latest || {};
  const status = cloudStatus === "failed" ? "雲端資料未載入，無法確認最新回報；請重新登入後再查看。" : cloudStatus === "loading" ? "正在載入雲端回報…" : dailyFeedbackSummary(record);
  return `<section class="card daily-feedback-card" aria-label="今日訓練感受"><h3 class="section-title">今日訓練感受</h3>
    <p class="small">${esc(dateKey)}｜${esc(status)}</p>
    ${renderIncompleteProgress(progress)}
    ${!editing ? renderSavedIncompleteReason(latest?.incompletion) : ""}
    ${editing ? `<form onsubmit="saveDailyFeedbackFromUi(event)">
      <label class="daily-feedback-label" for="dailyFeedbackEffort">今天練習時的吃力程度<select id="dailyFeedbackEffort" required${busy ? " disabled" : ""}>${options(EFFORT_LABELS, values.effort)}</select></label>
      <label class="daily-feedback-label" for="dailyFeedbackDiscomfort">今天是否感到不舒服？<select id="dailyFeedbackDiscomfort" required${busy ? " disabled" : ""}>${options(DISCOMFORT_LABELS, values.discomfort)}</select></label>
      ${renderIncompleteReasonInput(progress, draft.incompleteReason ?? latest?.incompletion?.reason, busy)}
      <label class="daily-feedback-label" for="dailyFeedbackNote">補充說明（選填，最多 500 字）<textarea id="dailyFeedbackNote" maxlength="500" rows="3"${busy ? " disabled" : ""}>${esc(values.note)}</textarea></label>
      <button class="btn btn-primary full" type="submit"${busy ? " disabled" : ""}>${busy ? "正在儲存…" : "儲存今日回報"}</button>
      <button class="btn btn-light full" type="button" onclick="cancelDailyFeedbackEdit()"${busy ? " disabled" : ""}>取消</button>
    </form>` : `<button class="btn btn-light full" onclick="editDailyFeedbackFromUi()"${cloudStatus === "loading" || cloudStatus === "failed" ? " disabled" : ""}>${latest ? "修改今日回報" : "回報今日感受"}</button>`}
    ${message ? `<p class="small" role="status">${esc(message)}</p>` : ""}
    <p class="small fa5x-muted">這是本人回報，未填會保留為未回報。目前不影響訓練完成量或自動調整安排；不是即時通知復健師的管道。</p></section>`;
}
export function renderDailyFeedbackHistory(records, { cloudStatus = null } = {}) {
  const warning = cloudStatus === "failed" ? "雲端回報未載入，下列可能只是本機快取，請重新登入確認。" : cloudStatus === "loading" ? "正在載入雲端回報…" : "";
  return `<section class="card daily-feedback-card"><h3 class="section-title">近期訓練感受（本人回報）</h3>
    ${warning ? `<p class="small" role="status">${warning}</p>` : ""}
    ${records.length ? records.slice(0, 7).map((record) => {
      const last = latestDailyFeedback(record);
      return `<details><summary>${esc(record.dateKey)}｜${esc(dailyFeedbackSummary(record))}</summary>
        <p class="small">${esc(last?.note || "無補充說明")}｜共 ${record.revision} 次回報／修正</p>
        ${renderSavedIncompleteReason(last?.incompletion)}
        <ol class="small">${record.reports.map((r) => `<li>${esc(r.reportedAt)}：${esc(EFFORT_LABELS[r.effort])}｜${esc(DISCOMFORT_LABELS[r.discomfort])}${r.note ? `；${esc(r.note)}` : ""}${renderSavedIncompleteReason(r.incompletion)}</li>`).join("")}</ol></details>`;
    }).join("") : `<p class="small">${warning ? "目前無法確認是否有回報。" : "尚無可查看的回報；不代表沒有不舒服。"}</p>`}
    <p class="small fa5x-muted">僅呈現本人回報，尚未納入 D5 判定或 AI 週摘要。</p></section>`;
}
