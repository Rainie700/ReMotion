import { selfReportedAmountText } from "../data/selfReportedTraining.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g,c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
export function renderSelfReportedTrainingHistory(records, { canVoid = false, cloudStatus = null } = {}) {
  const failed = cloudStatus === "failed", loading = cloudStatus === "loading";
  return `<section class="card self-report-history"><h3 class="section-title">自行回報的練習</h3>
    ${failed || loading ? `<p class="small">${failed ? "雲端資料未載入，下列可能只是本機快取；請重新登入確認。" : "正在載入雲端紀錄…"}</p>` : ""}
    ${records.length ? records.slice(0,10).map(r => `<details><summary>${esc(r.exerciseName)}｜${esc(selfReportedAmountText(r))}｜${r.status === "voided" ? "已作廢" : "本人回報"}</summary><p class="small">${esc(r.reportedAt)}${r.note ? `；${esc(r.note)}` : ""}</p>
      <p class="small">紀錄編號：${esc(r.id)}</p>${canVoid && r.status !== "voided" ? `<button class="btn btn-light full" onclick="voidSelfReportedTrainingFromUi(${esc(JSON.stringify(r.id))})">作廢這筆回報</button>` : ""}</details>`).join("") : `<p class="small">${failed || loading ? "目前無法確認是否有回報。" : "尚無自行回報紀錄。"}</p>`}
    <p class="small fa5x-muted">本人填寫的練習量，沒有 AI 姿勢評分；未計入課表達標、七日完成天數、XP 或 AI 週摘要。作廢紀錄保留供查閱。</p></section>`;
}
export function renderSelfReportedTrainingForm(exercise, { values = {}, busy = false, message = "", result = null } = {}) {
  const measurementType = exercise.measurementType || exercise.raw?.measurementType;
  const field = (id,label, max, zero = false) => `<label class="daily-feedback-label" for="${id}">${label}<input id="${id}" type="number" inputmode="numeric" min="${zero ? 0 : 1}" max="${max}" step="1" value="${esc(values[id])}"${busy ? " disabled" : ""}></label>`;
  return `<div class="header"><button class="btn btn-light" onclick="leaveSelfReportedTraining()"${busy ? " disabled" : ""}>返回動作</button><b>自行回報練習</b></div><h2>${esc(exercise.name)}</h2>
    <p class="small">這裡不開啟相機。請填這一次練習的實際量，沒有 AI 評分，也不自動判定課表或七日訓練達標。</p>
    ${result ? `<div class="card"><b>已儲存本人回報</b><p>${esc(selfReportedAmountText(result))}</p><p class="small">紀錄編號：${esc(result.id)}</p><button class="btn btn-primary full" onclick="leaveSelfReportedTraining()">返回查看紀錄</button></div>` : `<form class="card" onsubmit="saveSelfReportedTrainingFromUi(event)">
      ${measurementType === "duration" ? field("manualSeconds","本次實際維持秒數（本人填寫，非計時器量測）",86400) : `<label class="daily-feedback-label" for="manualBasis">這次要怎麼回報？<select id="manualBasis" onchange="setSelfReportBasis(this.value)"${busy ? " disabled" : ""}><option value="">請選擇</option><option value="total"${values.manualBasis === "total" ? " selected" : ""}>合計次數</option><option value="per_side"${values.manualBasis === "per_side" ? " selected" : ""}>左右分開</option></select></label>${values.manualBasis === "per_side" ? field("manualLeft","左側次數",100000,true)+field("manualRight","右側次數",100000,true) : field("manualTotal","本次合計次數（不是每組次數）",100000)}`}
      <label class="daily-feedback-label" for="manualNote">補充說明（選填，最多 500 字）<textarea id="manualNote" maxlength="500"${busy ? " disabled" : ""}>${esc(values.manualNote)}</textarea></label>
      <label class="self-report-attest"><input type="checkbox" id="manualAttested"${values.manualAttested ? " checked" : ""}${busy ? " disabled" : ""}><span>我確認這是尚未用 AI 或其他自行回報記錄過的一次練習。</span></label>
      <button class="btn btn-primary full" type="submit"${busy ? " disabled" : ""}>${busy ? "正在儲存…" : "儲存本人回報"}</button></form>`}
    ${message ? `<p class="small" role="status">${esc(message)}</p>` : ""}`;
}
