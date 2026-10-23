import { INCOMPLETE_REASON_LABELS } from "../data/incompleteTrainingFeedback.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export function renderIncompleteProgress(progress) {
  if (!progress) return "";
  return `<div class="daily-training-progress"><b>今日 F01 追蹤訓練：${progress.completedCount}／${progress.requiredCount} 個動作已達標</b>
    <p class="small">依此裝置目前載入的紀錄，共 ${progress.savedAttemptCount} 筆已儲存訓練。${progress.snapshotted ? "" : "尚未建立當日目標快照，下列是目前方案的目標。"}</p>
    ${progress.items.map(item => `<div class="daily-training-progress-item"><b>${esc(item.name)}</b><p class="small">目標：${esc(item.targetText)}｜${item.targetBasis === "frozen" ? "當日已凍結目標" : "目前方案，目標未凍結"}</p>
      <p class="small">${item.completed ? "已達標" : "尚未記為達標"}；${item.savedAttemptCount ? `${item.savedAttemptCount} 筆已儲存紀錄` : "尚無已儲存紀錄（不代表沒有練習）"}</p>
      ${item.attempts.map(a => `<p class="small">單筆紀錄：${a.totalReps == null ? "次數未提供" : `${a.totalReps} 次`}${a.leftReps != null || a.rightReps != null ? `；左 ${a.leftReps ?? "未提供"}／右 ${a.rightReps ?? "未提供"} 次` : ""}</p>`).join("")}
      ${item.savedAttemptCount > item.attempts.length ? `<p class="small">僅列最近 ${item.attempts.length} 筆，其他紀錄仍保留在訓練歷史。</p>` : ""}</div>`).join("")}
    ${progress.omittedItemCount ? `<p class="small">另有 ${progress.omittedItemCount} 個動作未展開列出，已包含在上方總數。</p>` : ""}
    <p class="small fa5x-muted">顯示各筆已儲存量，不將分次紀錄相加推算組數；辨識或儲存問題請另外回報。</p></div>`;
}
export function renderIncompleteReasonInput(progress, value, busy) {
  if (!progress || progress.completedCount >= progress.requiredCount) return "";
  return `<label class="daily-feedback-label" for="dailyIncompleteReason">如果今天先到這裡，主要原因是？（選填）<select id="dailyIncompleteReason"${busy ? " disabled" : ""}><option value="">先不填原因</option>${Object.entries(INCOMPLETE_REASON_LABELS).map(([id, label]) => `<option value="${id}"${id === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
}
export function renderSavedIncompleteReason(incompletion) {
  if (!incompletion) return "";
  return `<div class="daily-incomplete-reason"><p class="small"><b>未完成原因（本人回報）：${esc(INCOMPLETE_REASON_LABELS[incompletion.reason] || "未提供")}</b></p>
    <details><summary>查看這次回報時的目標與已儲存量</summary>${renderIncompleteProgress(incompletion.progress)}</details></div>`;
}
