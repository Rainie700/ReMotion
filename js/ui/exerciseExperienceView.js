/**
 * Core Mobile UX — the ONE renderer for every catalog exercise (built from
 * js/data/exerciseExperienceAdapter.js models). Pure string builders: no
 * state, no data access, no per-exercise branches.
 *
 * Exercise Detail  header → media → meta → dose / AI → [怎麼做 | AI 會看 | 注意] → sticky CTA
 * AI Preparation   header → name → framing image → camera line → compact checklist → AI 觀察 → sticky CTA
 * Training Result  status → name → reps / AI 姿勢分數 → reward → observations → folded details → sticky CTA
 * Long lists show their first items; the rest opens in a bottom sheet.
 * Empty data never produces a block (or shows its neutral empty line).
 */

const esc = (v) => String(v == null ? "" : v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const EXERCISE_TABS = Object.freeze([
  { key: "how", label: "怎麼做" },
  { key: "ai", label: "AI 會看" },
  { key: "care", label: "注意" },
]);
const STEP_LIMIT = 4;
const CARE_LIMIT = 3;

/** Media block: video link, confirmed image, or the neutral 「示意圖待補」 placeholder. */
export function renderExerciseMedia(model, { size = "hero" } = {}) {
  const m = model.media || {};
  const cls = `exp-media exp-media--${size}`;
  const image = m.state !== "placeholder" && m.src
    ? `<img class="exp-media-img" src="${esc(m.src)}" alt="${esc(model.name)} 示範" data-exercise-media="1" />`
    : `<div class="exercise-image-placeholder exp-media-placeholder" role="img" aria-label="${esc(model.name)}：動作示意圖待補"><img src="${esc(m.placeholderIcon)}" alt="" /><span>示意圖待補</span></div>`;
  const video = m.state === "video" && m.videoUrl
    ? `<button class="exp-media-video" onclick="window.open('${esc(m.videoUrl)}', '_blank')">▶ 觀看示範影片</button>`
    : "";
  return `<div class="${cls}">${image}${video}</div>`;
}

const chips = (items, cls = "exp-chip") => items.map((t) => `<span class="${cls}">${esc(t)}</span>`).join("");

function sheet(id, title, bodyHtml) {
  return `<div class="exp-sheet" id="${id}" hidden>
    <div class="exp-sheet-backdrop" onclick="closeExerciseSheet('${id}')"></div>
    <div class="exp-sheet-panel" role="dialog" aria-label="${esc(title)}">
      <div class="exp-sheet-head"><b>${esc(title)}</b><button class="exp-sheet-close" onclick="closeExerciseSheet('${id}')" aria-label="關閉">✕</button></div>
      <div class="exp-sheet-body">${bodyHtml}</div>
    </div>
  </div>`;
}

const stepList = (items) => `<ol class="exp-steps">${items.map((t, i) => `<li><span class="exp-step-n">${i + 1}</span><span>${esc(t)}</span></li>`).join("")}</ol>`;
const bulletList = (items) => `<ul class="exp-bullets">${items.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;

function howPanel(model, sheets) {
  const steps = model.instructions;
  let html = steps.length ? stepList(steps.slice(0, STEP_LIMIT)) : `<p class="exp-empty">目前沒有步驟說明</p>`;
  if (steps.length > STEP_LIMIT) {
    const id = `exp-sheet-steps-${model.id}`;
    sheets.push(sheet(id, "完整步驟", stepList(steps)));
    html += `<button class="exp-more-link" onclick="openExerciseSheet('${id}')">查看全部 ${steps.length} 步 ›</button>`;
  }
  if (model.targetMuscles.length) html += `<div class="exp-muscles"><span class="exp-label">目標肌群</span><div class="exp-chip-row">${chips(model.targetMuscles, "exp-chip exp-chip--soft")}</div></div>`;
  return html;
}

function aiPanel(model) {
  if (!model.aiSupported) {
    return `<p class="exp-ai-status exp-ai-status--none">一般訓練</p><p class="exp-empty">這個動作目前沒有 AI 姿勢辨識，請依步驟自行練習。</p>`;
  }
  const a = model.aiAnalysisItems;
  const parts = [`<p class="exp-ai-status">AI 姿勢辨識</p>`];
  if (a.bodyPoints.length) parts.push(`<div class="exp-ai-group"><span class="exp-label">觀察部位</span><div class="exp-chip-row">${chips(a.bodyPoints, "exp-chip exp-chip--body")}</div></div>`);
  if (a.reminders.length) parts.push(`<div class="exp-ai-group"><span class="exp-label">會提醒的代償</span><div class="exp-chip-row">${chips(a.reminders)}</div></div>`);
  if (a.angleChecks.length) parts.push(`<div class="exp-ai-group"><span class="exp-label">角度參考</span>${bulletList(a.angleChecks)}</div>`);
  if (model.cameraGuidance) parts.push(`<div class="exp-ai-group"><span class="exp-label">拍攝角度</span><p class="exp-text">${esc(model.cameraGuidance)}</p></div>`);
  return parts.join("");
}

function carePanel(model, sheets) {
  const groups = [["常見問題", model.commonMistakes], ["注意事項", model.precautions]].filter(([, items]) => items.length);
  if (!groups.length) return `<p class="exp-empty">目前沒有額外注意事項</p>`;
  const overflow = groups.some(([, items]) => items.length > CARE_LIMIT);
  let html = groups.map(([title, items]) => `<div class="exp-care-group"><span class="exp-label">${title}</span>${bulletList(items.slice(0, CARE_LIMIT))}</div>`).join("");
  if (overflow) {
    const id = `exp-sheet-care-${model.id}`;
    sheets.push(sheet(id, "注意", groups.map(([title, items]) => `<div class="exp-care-group"><span class="exp-label">${title}</span>${bulletList(items)}</div>`).join("")));
    html += `<button class="exp-more-link" onclick="openExerciseSheet('${id}')">查看全部 ›</button>`;
  }
  return html;
}

function tabs(panels, activeKey) {
  const tabHtml = EXERCISE_TABS.map((t) => `<button class="exp-tab${t.key === activeKey ? " is-active" : ""}" role="tab" aria-selected="${t.key === activeKey}" data-tab="${t.key}" onclick="selectExerciseTab(this, '${t.key}')">${t.label}</button>`).join("");
  const panelHtml = EXERCISE_TABS.map((t) => `<div class="exp-panel" role="tabpanel" data-panel="${t.key}"${t.key === activeKey ? "" : " hidden"}>${panels[t.key]}</div>`).join("");
  return `<div class="exp-tabs" role="tablist">${tabHtml}</div><div class="card exp-panel-card">${panelHtml}</div>`;
}

/**
 * @param {object} model  adapter model
 * @param {{ backFn: string, sourceBadgeHtml?: string, statusPillHtml?: string, ctaHtml: string, extraHtml?: string, activeTab?: string }} opts
 */
export function renderExerciseDetailView(model, { backFn, sourceBadgeHtml = "", statusPillHtml = "", ctaHtml, extraHtml = "", activeTab = "how" }) {
  const sheets = [];
  const panels = { how: howPanel(model, sheets), ai: aiPanel(model), care: carePanel(model, sheets) };
  const meta = [model.domain.label, model.difficulty ? `難度 ${model.difficulty}` : null].filter(Boolean).map((t) => `<span class="exp-meta-item">${esc(t)}</span>`).join("");
  return `<div class="exp-page">
    <div class="header exp-header">
      <button class="btn btn-light detail-back-btn" onclick="${backFn}">返回</button>
      <b class="exp-header-title">${esc(model.name)}</b>
      ${statusPillHtml || sourceBadgeHtml}
    </div>
    ${renderExerciseMedia(model)}
    <div class="exp-meta">${meta}${statusPillHtml ? sourceBadgeHtml : ""}</div>
    <div class="exp-facts">
      <div><span class="exp-label">每次訓練</span><b>${esc(model.dosage.text || "依個人狀況")}</b></div>
      <div><span class="exp-label">AI</span><b>${model.aiSupported ? "AI 姿勢辨識" : "一般訓練"}</b></div>
    </div>
    ${tabs(panels, activeTab)}
    ${extraHtml}
    ${sheets.join("")}
  </div>${PAGE_ACTION_OPEN}<div class="exp-cta-bar">${ctaHtml}</div>${PAGE_ACTION_CLOSE}`;
}

/**
 * Page-level primary action (Exercise Detail 「開始訓練」): marked so phone()
 * lifts it out of the scrolling .content into its own bar directly above the
 * bottom navigation — never part of a tab panel or the content flow.
 */
export const PAGE_ACTION_OPEN = "<!--page-action-->";
export const PAGE_ACTION_CLOSE = "<!--/page-action-->";

/**
 * @param {{ backFn: string, ctaHtml: string, moreHtml?: string }} opts  moreHtml = the analyzer's own notice (kept, folded)
 */
export function renderPreparationView(model, { backFn, ctaHtml, moreHtml = "" }) {
  const precautions = model.precautions;
  const aiHtml = model.aiSupported && model.aiAnalysisItems.bodyPoints.length
    ? `<div class="exp-prep-row"><span class="exp-label">AI 觀察</span><div class="exp-chip-row">${chips(model.aiAnalysisItems.bodyPoints, "exp-chip exp-chip--body")}</div></div>`
    : model.aiSupported ? "" : `<div class="exp-prep-row"><span class="exp-label">AI</span><b>一般訓練（無 AI 姿勢辨識）</b></div>`;
  const folded = [
    precautions.length ? `<div class="exp-care-group"><span class="exp-label">注意事項</span>${bulletList(precautions)}</div>` : "",
    moreHtml,
  ].filter(Boolean).join("");
  return `<div class="exp-page exp-prep">
    <div class="header exp-header">
      <button class="btn btn-light detail-back-btn" onclick="${backFn}">返回</button>
      <b class="exp-header-title">準備開始</b>
      <span></span>
    </div>
    <h2 class="exp-prep-name">${esc(model.name)}</h2>
    <div class="exp-prep-top">
      ${renderExerciseMedia(model, { size: "prep" })}
      <div class="exp-prep-camera"><span class="exp-label">拍攝角度</span><p class="exp-text">${esc(model.cameraGuidance || "請讓身體完整入鏡")}</p></div>
    </div>
    <div class="card exp-checklist">
      <label class="exp-check"><input type="checkbox" /> 全身入鏡</label>
      <label class="exp-check"><input type="checkbox" /> 光線充足</label>
      <label class="exp-check"><input type="checkbox" /> 相機固定</label>
    </div>
    ${aiHtml}
    ${precautions.length ? `<p class="exp-prep-safety">⚠ ${esc(precautions[0])}</p>` : ""}
    ${folded ? `<details class="exp-fold"><summary>注意事項與 AI 說明</summary>${folded}</details>` : ""}
    <div class="exp-cta-bar">${ctaHtml}</div>
  </div>`;
}

/**
 * First-viewport training result. `observations` come from the saved record's
 * own remark; `detailsHtml` is the existing per-exercise analysis (folded).
 * @param {{ backFn: string, completed: boolean|null, totalReps: number|null, targetReps: number|null, score: number|null,
 *           rewardHtml: string, observations: string[], detailsHtml: string, ctaHtml: string }} opts
 */
export function renderTrainingResultView(model, { backFn, completed, totalReps, targetReps, score, rewardHtml, observations = [], detailsHtml = "", ctaHtml }) {
  const statusText = completed === true ? "✓ 完成本次訓練" : completed === false ? "本次未完成" : "已儲存本次紀錄";
  const facts = [
    totalReps != null ? `<div><span class="exp-label">完成次數</span><b>${totalReps}${targetReps ? ` / ${targetReps}` : ""} 次</b></div>` : "",
    score != null ? `<div><span class="exp-label">AI 姿勢分數</span><b>${score}</b></div>` : "",
  ].filter(Boolean).join("");
  return `<div class="exp-page exp-result">
    <div class="header exp-header">
      <button class="btn btn-light detail-back-btn" onclick="${backFn}">返回</button>
      <b class="exp-header-title">訓練結果</b>
      <span></span>
    </div>
    <div class="card exp-result-head">
      <span class="exp-result-status${completed === false ? " is-incomplete" : ""}">${statusText}</span>
      <b class="exp-result-name">${esc(model.name)}</b>
      ${facts ? `<div class="exp-facts">${facts}</div>` : ""}
    </div>
    ${rewardHtml}
    ${observations.length ? `<div class="card exp-observations"><span class="exp-label">動作觀察</span>${bulletList(observations.slice(0, 3))}</div>` : ""}
    ${detailsHtml ? `<details class="exp-fold"><summary>詳細資料</summary>${detailsHtml}</details>` : ""}
    <div class="exp-cta-bar">${ctaHtml}</div>
  </div>`;
}
