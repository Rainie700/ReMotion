import { DOMAIN_ASSESSMENT_PROTOCOLS, BALANCE_STAGES, getDomainProtocol, evaluateDomainAssessment, assessComparability, createProtocolTimer } from "../data/domainAssessments.js";
import { createDomainCandidateTracker } from "../ai/domainAssessmentCandidates.js";
import { createSquatCameraController, POSE_CONNECTIONS } from "../ai/shared/cameraController.js";
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const num = n => Number.isFinite(n) ? String(Number(n.toFixed(3))) : "—";
const signed = n => Number.isFinite(n) ? `${n > 0 ? "+" : ""}${num(n)}` : "—";
export function formatDomainAssessmentTime(value) {
  try { return new Intl.DateTimeFormat("zh-TW", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value)); }
  catch { return "時間不明"; }
}
const btn = (text, action, arg = "", primary = false) => `<button type="button" class="btn ${primary ? "btn-primary" : "btn-light"} full" onclick="domainAssessmentAction('${action}','${esc(arg)}')">${text}</button>`;
const formNumber = (name, label, value, opts = "") => `<label class="da-field">${label}<input type="number" id="da-${name}" ${opts} value="${esc(value ?? "")}" oninput="domainAssessmentInput('${name}',this.value)"></label>`;
const select = (name, label, values) => `<label class="da-field">${label}<select id="da-${name}">${values.map(([v, text]) => `<option value="${v}">${text}</option>`).join("")}</select></label>`;
const syncText = { synced: "已同步", failed: "同步失敗，請重試", pending: "尚未確認同步，請重試", local_only: "僅存於本機，尚未同步" };
export function renderDomainMeasurement(r) {
  const e = evaluateDomainAssessment(r.domain, r.raw);
  if (r.status !== "completed" || !r.observerConfirmed || !e.valid) return `<b>本次未完成或未確認</b><p class="small">${esc(e.error || "結果尚未由陪同者確認，不作為有效評估。")}</p>`;
  return `<div class="da-value">${r.domain === "F06" ? `左 ${signed(e.leftBest)}／右 ${signed(e.rightBest)}` : num(e.value)} <span>${e.unit}</span></div><b>${esc(e.label)}</b>${r.domain === "F02" ? `<p class="small">${e.details.map(x => `${x.label}：${x.value == null ? "依規則未再嘗試" : num(x.value) + " 秒"}`).join("<br>")}</p><p class="small">平衡分項滿分 4 分；不是完整 SPPB 總分。</p>` : ""}${r.domain === "F04" ? `<p class="small">兩次時間：${e.trials.map(num).join("／")} 秒；採用 ${num(e.bestSeconds)} 秒。</p>` : ""}${r.domain === "F05" ? `<p class="small">${e.variant}｜${r.raw.side === "left" ? "左" : "右"}手 ${num(r.raw.weightLb)} 磅；相機候選 ${Number.isInteger(r.candidates?.count) && r.candidates.count >= 0 && r.candidates.count <= 300 ? r.candidates.count : "未使用"} 次。</p>` : ""}${r.domain === "F06" ? `<p class="small">左腳兩次 ${r.raw.left.map(signed).join("／")} cm；右腳兩次 ${r.raw.right.map(signed).join("／")} cm。</p>` : ""}`;
}
export function createDomainAssessmentView(ctx) {
  const { service, getUser, getRoute, navigate, refresh, allExercises, exerciseCard, trainingRecords, cloudLoadStatus } = ctx;
  let selected = "F02", run = null, resultId = null, busy = false, message = "", camera = null, timerTick = null;
  const routes = new Set(["domainAssessmentHome", "domainAssessmentPrep", "domainAssessmentSession", "domainAssessmentResult", "domainAssessmentHistory", "domainAssessmentTraining"]);
  const owner = () => getUser()?.role === "patient";
  const actorMatches = () => run && getUser()?.id === run.patientId;
  const p = () => getDomainProtocol(selected);
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const header = (title, back = "home") => `<div class="header"><button class="btn btn-light" onclick="domainAssessmentAction('${back}')">返回</button><b>${esc(title)}</b><span></span></div>${["domainAssessmentHome", "domainAssessmentPrep"].includes(getRoute()) ? `<img class="da-illustration" data-domain-assessment-media="1" src="${p().image}" alt="${p().chineseName}示意圖">` : ""}`;
  const notice = () => `<p class="da-notice">${esc(p().note)}</p>`;
  function stopCamera() { camera?.stop(); camera = null; }
  function stopAll() { stopCamera(); if (timerTick) clearInterval(timerTick); timerTick = null; }
  function go(route) { stopAll(); message = ""; navigate(route); }
  function open(domain) { if (!owner() || !getDomainProtocol(domain)) return; selected = domain; run = null; resultId = null; go("domainAssessmentHome"); }
  function loadNote() { return cloudLoadStatus() === "failed" ? `<p class="da-notice">雲端評估紀錄未載入，以下可能只有本機資料。請確認規則已部署，再重新登入。</p>` : ""; }
  function historyRows(patientId = getUser()?.id) {
    return service.list(patientId, selected).map(r => `<button class="card da-history full" onclick="domainAssessmentAction('result','${esc(r.id)}')"><span>${esc(formatDomainAssessmentTime(r.createdAt))}</span><b>${esc(r.status === "completed" ? "已完成評估" : "未完成評估")}</b><span class="small">${syncText[service.status(r.id)] || ""}</span></button>`).join("") || `<div class="card">尚無此構面的評估紀錄。</div>`;
  }
  function home() {
    const rows = service.list(getUser().id, selected), latest = rows[0];
    return `${header(p().label, "domains")}${loadNote()}<div class="card da-protocol"><b>${p().name}</b><h2>${p().chineseName}</h2><p>${p().output}</p><p class="small">${p().camera}拍攝｜陪同者協助測量</p></div>${btn("A｜先進行功能評估", "prep", "", true)}${btn("B｜直接開始訓練", "training")}${btn("評估紀錄與前後比較", "history")}${latest ? `<div class="card da-latest"><b>最近一次</b>${renderDomainMeasurement(latest)}${btn("查看完整結果", "result", latest.id)}</div>` : ""}${notice()}`;
  }
  function prep() {
    return `${header(p().chineseName)}<div class="card da-protocol"><b>${p().name}</b><ol>${p().steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol></div>${notice()}<div class="card da-form"><h3>本次測試條件</h3>${select("observer", "誰協助觀察與測量？", [["", "請選擇"], ["helper", "現場陪同者"], ["therapist", "復健師"]])}${select("support", "使用的支撐", [["unknown", "尚未確認"], ["none", "無支撐"], ["aid", "平常使用的輔具"], ["person", "需他人攙扶"]])}${select("pain", "目前有不舒服、頭暈或疼痛嗎？", [["unknown", "尚未確認"], ["no", "沒有"], ["yes", "有，先停止測試"]])}${selected === "F05" ? `${select("side", "測試的慣用手", [["", "請選擇"], ["left", "左手"], ["right", "右手"]])}${select("loadProtocol", "負重規格", [["", "請選擇"], ["female", "女性標準 5 磅"], ["male", "男性標準 8 磅"], ["adapted", "經指導調整的負重"]])}${formNumber("weightLb", "實際啞鈴重量（磅）", null, 'min="0.1" step="0.1"')}` : ""}${selected === "F06" ? formNumber("chairHeightCm", "本次椅面高度（cm）", null, 'min="1" step="0.1"') : ""}<label class="da-check"><input id="da-setup" type="checkbox"><span>已依說明準備器材與拍攝位置，陪同者已在旁並確認可以安全進行${selected === "F03" ? "，路線已用尺量為 3 公尺" : selected === "F04" ? "，路線已用尺量為 4 公尺" : selected === "F06" ? "，已備好實體尺" : ""}。</span></label></div><p class="small">不舒服或不確定適合測試時，先停止並詢問醫療人員。測試中若不適，請立即停止。</p>${message ? `<p role="alert">${esc(message)}</p>` : ""}${btn("進入測試", "begin", "", true)}`;
  }
  function startRun() {
    const val = name => document.getElementById(`da-${name}`)?.value;
    const conditions = { observer: val("observer"), support: val("support"), pain: val("pain"), setup: !!document.getElementById("da-setup")?.checked };
    if (!conditions.observer || !conditions.setup || conditions.pain !== "no" || conditions.support === "unknown" || conditions.support === "person" || (selected === "F02" && conditions.support !== "none")) return showError("請確認現場陪同者、準備條件及無不適；需攙扶時先由復健師評估。SPPB 站立測試不使用支撐。");
    let raw = { interrupted: false };
    if (selected === "F02") raw.stages = BALANCE_STAGES.map(s => ({ id: s.id, status: "pending", seconds: null }));
    if (selected === "F03") raw = { ...raw, distanceM: 3, routeConfirmed: true, events: [], durationMs: null };
    if (selected === "F04") raw = { ...raw, distanceM: 4, routeConfirmed: true, trials: [] };
    if (selected === "F05") {
      raw = { ...raw, durationMs: null, observerCount: null, side: val("side"), weightLb: parseNumber(val("weightLb")), loadProtocol: val("loadProtocol") };
      if (!raw.side || !raw.loadProtocol || !(raw.weightLb > 0)) return showError("請填入測試手、負重規格及實際重量。重量不同仍會標示調整版。");
    }
    if (selected === "F06") { raw = { ...raw, left: [null, null], right: [null, null], chairHeightCm: parseNumber(val("chairHeightCm")), rulerConfirmed: true, reference: "toe_zero" }; if (!(raw.chairHeightCm > 0)) return showError("請填實際椅面高度。"); }
    run = { patientId: getUser().id, id: crypto.randomUUID(), conditions, raw, stage: 0, timer: null, cameraWanted: false, candidate: createDomainCandidateTracker(selected, raw.side), verified: false, started: false };
    go("domainAssessmentSession");
  }
  function parseNumber(v) { return v == null || String(v).trim() === "" ? null : Number(v); }
  function showError(text) { message = text; const el = document.getElementById("da-error"); if (el) el.textContent = text; else alert(text); }
  function timedControl() {
    const r = run.raw, running = run.timer?.running;
    if (r.interrupted) return `<p role="alert">測驗已中斷，這次不會產生有效分數。可保存未完成紀錄，再重新測試。</p>`;
    if (selected === "F02") {
      const stage = r.stages[run.stage], ended = !stage || stage.status !== "pending";
      return `<h3>第 ${run.stage + 1} 階段：${BALANCE_STAGES[run.stage].label}</h3><p>${BALANCE_STAGES[run.stage].instruction}</p>${ended ? `<p>本階段：${stage.seconds == null ? "未再嘗試" : num(stage.seconds) + " 秒"}</p>${stage.seconds === 10 && run.stage < 2 ? btn("準備下一階段", "nextStage", "", true) : ""}` : running ? btn("姿勢破壞／扶物，停止本階段", "stopSegment", "break", true) : `${btn("站好、放手並開始計時", "startSegment", "", true)}${btn("無法安全嘗試此姿勢", "unable")}`}`;
    }
    if (selected === "F03") {
      const labels = ["說開始並啟動計時", "已站起，開始行走", "到 3 公尺線，開始轉身", "已轉身，開始返回", "已返回並坐穩，停止計時"];
      return r.events.length >= 5 ? `<p>測試完成：${num(r.durationMs / 1000)} 秒</p>` : btn(labels[r.events.length], "tugEvent", "", true);
    }
    if (selected === "F04") return `<p>兩次計時：${r.trials.length ? r.trials.map(t => num(t) + " 秒").join("／") : "尚未測量"}</p>${r.trials.length >= 2 ? "" : running ? btn("第一隻腳已完全越過終點，停止", "stopSegment", "", true) : btn(`第 ${r.trials.length + 1} 次：開始步行並計時`, "startSegment", "", true)}`;
    if (selected === "F05") return `${r.durationMs === 30000 ? `<p>已完成 30 秒。</p>${formNumber("observerCount", "陪同者確認的完整彎舉次數（可填 0）", r.observerCount, 'min="0" max="300" step="1"')}` : running ? `<p>陪同者請獨立計算完整動作，30 秒到時自動結束。</p>` : btn("說開始，進行 30 秒測試", "startSegment", "", true)}`;
    return `<p>用尺量出距離，再輸入公分。未到腳尖為負值，超過腳尖為正值。</p><div class="da-number-grid">${["left", "right"].map(side => [0, 1].map(i => formNumber(`${side}${i}`, `${side === "left" ? "左" : "右"}腳第 ${i + 1} 次（cm）`, r[side][i], 'min="-100" max="100" step="0.1"')).join("")).join("")}</div>`;
  }
  function session() {
    if (!actorMatches()) return header("找不到測試") + btn("返回構面", "home");
    return `${header(p().chineseName, "cancel")}<p class="small">陪同者操作計時／量測；相機提供候選觀察。</p><div class="squat-camera-wrap da-camera" id="da-camera-wrap" ${run.cameraWanted ? "" : "hidden"}><video id="da-video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="da-canvas" class="squat-overlay-canvas"></canvas><div class="squat-readiness-indicator"><span id="da-readiness">等待影像</span></div><div class="squat-rep-counter da-counter"><div class="squat-rep-counter-text"><span id="da-camera-value">0</span><span class="small" id="da-camera-unit">秒</span></div></div></div>${run.cameraWanted ? "" : btn("開啟相機輔助觀察（選用）", "camera")}<p class="small" id="da-camera-status" role="status"></p><div class="card da-timer-card"><div class="da-value" id="da-timer">${num((run.timer?.elapsed() || 0) / 1000)} <span>秒</span></div><p id="da-feedback" class="small">依步驟開始；相機追蹤不足不會代替陪同者的觀察。</p>${timedControl()}</div>${notice()}<div class="card da-form"><label class="da-check"><input type="checkbox" id="da-verified" ${run.verified ? "checked" : ""} onchange="domainAssessmentInput('verified',this.checked)"><span>陪同者已確認測試流程與正式量測值。這是人工確認，不代表相機已驗證所有條件。</span></label>${select("finalPain", "測試期間有不適嗎？", [[run.conditions.pain, run.conditions.pain === "no" ? "沒有" : "有或不確定"], ["yes", "有不適"], ["unknown", "不確定"]])}</div><p id="da-error" role="alert">${esc(message)}</p>${btn(busy ? "儲存中…" : "儲存並查看評估結果", "save", "", true)}${btn("提前停止，保存未完成紀錄", "saveIncomplete")}${btn("放棄本次測試", "cancel")}`;
  }
  function startSegment() {
    if (run.raw.interrupted || run.timer?.running) return;
    if (selected === "F02" && run.raw.stages[run.stage].status !== "pending") return;
    if (selected === "F04" && run.raw.trials.length >= 2) return;
    if (selected === "F05" && run.raw.durationMs != null) return;
    run.started = true; run.timer = createProtocolTimer(); run.candidate.resetSegment(); run.timer.start();
    refreshSession();
  }
  function finishSegment() {
    if (!run.timer?.running) return;
    const ms = run.timer.stop(selected === "F02" ? 10000 : selected === "F05" ? 30000 : Infinity);
    if (selected === "F02") {
      const s = run.raw.stages[run.stage]; s.seconds = ms / 1000; s.status = "measured";
      if (ms < 10000) for (let i = run.stage + 1; i < 3; i++) run.raw.stages[i] = { id: BALANCE_STAGES[i].id, status: "not_attempted_after_stop", seconds: null };
    } else if (selected === "F04") run.raw.trials.push(ms / 1000);
    else if (selected === "F05") run.raw.durationMs = ms >= 30000 ? 30000 : ms;
    refreshSession();
  }
  function refreshSession() { stopAll(); refresh(); }
  function tick() {
    if (!actorMatches() || getRoute() !== "domainAssessmentSession") return stopAll();
    const ms = run.timer?.elapsed() || 0, cap = selected === "F02" ? 10000 : selected === "F05" ? 30000 : Infinity;
    setText("da-timer", selected === "F06" ? "尺量公分" : `${num(Math.min(ms, cap) / 1000)} 秒`);
    setText("da-camera-value", selected === "F06" ? "尺量" : selected === "F05" ? String(run.candidate.summary().count ?? "—") : num(Math.min(ms, cap) / 1000));
    setText("da-camera-unit", selected === "F06" ? "cm（人工輸入）" : selected === "F05" ? "候選次數" : "秒");
    if (run.timer?.running && ms >= cap) finishSegment();
  }
  function startCamera() {
    if (!run?.cameraWanted || !actorMatches()) return;
    const video = document.getElementById("da-video"), canvas = document.getElementById("da-canvas");
    if (!video || !canvas) return;
    const draw = canvas.getContext("2d");
    camera = createSquatCameraController({ videoEl: video, onStatus: s => setText("da-camera-status", s === "requesting-permission" ? "請允許相機權限" : s === "loading-model" ? "正在載入姿勢模型…" : "相機已開啟"), onFatalError: () => setText("da-camera-status", "相機無法使用，可由陪同者繼續計時／尺量；不會補造相機資料。"), onFrame: (l, t) => {
      if (!actorMatches() || getRoute() !== "domainAssessmentSession") return stopCamera();
      const active = !!run.timer?.running && (selected !== "F05" || run.timer.elapsed() < 30000);
      const state = run.candidate.update(l, t, active);
      setText("da-readiness", state.ready ? "已入鏡" : "請調整入鏡位置"); setText("da-feedback", state.text);
      if (video.videoWidth && canvas.width !== video.videoWidth) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
      draw.clearRect(0, 0, canvas.width, canvas.height);
      if (l) { draw.strokeStyle = "#7ea866"; draw.lineWidth = 3; for (const { start, end } of POSE_CONNECTIONS) { const a = l[start], b = l[end]; if (!a || !b) continue; draw.beginPath(); draw.moveTo(a.x * canvas.width, a.y * canvas.height); draw.lineTo(b.x * canvas.width, b.y * canvas.height); draw.stroke(); } }
    } }); camera.start();
  }
  async function save(incomplete = false) {
    if (!actorMatches() || busy) return;
    if (run.timer?.running && !incomplete) return showError("計時尚未結束，請依步驟完成，或保存未完成紀錄。");
    const evaluation = evaluateDomainAssessment(selected, run.raw);
    if (!incomplete && (!evaluation.valid || !run.verified)) return showError(evaluation.error || "請由陪同者確認量測值後勾選。");
    run.conditions.pain = document.getElementById("da-finalPain")?.value || "unknown";
    if (incomplete) { run.timer?.stop(); run.raw.interrupted = true; }
    busy = true; stopAll(); setText("da-error", "儲存中，請稍候…");
    const actor = { ...getUser() }, captured = run;
    try {
      const saved = await service.save({ actor, runId: captured.id, domain: selected, raw: captured.raw, conditions: captured.conditions, candidates: captured.candidate.summary(), observerConfirmed: !incomplete && captured.verified });
      if (getUser()?.id !== actor.id) return;
      if (saved.error) return showError(`無法儲存：${saved.error}`);
      resultId = saved.record.id; go("domainAssessmentResult");
    } catch { showError("儲存失敗，資料仍留在這個畫面，請再試一次。"); }
    finally { busy = false; }
  }
  function result() {
    const r = service.get(resultId, getUser().id); if (!r) return `${header("評估結果")}${loadNote()}<p>找不到這份評估。</p>`;
    const rows = service.list(getUser().id, selected), index = rows.findIndex(x => x.id === r.id), previous = rows.slice(index + 1).find(x => x.status === "completed");
    const comparison = previous ? assessComparability(previous, r) : null, sync = service.status(r.id);
    const textValue = record => {
      const e = evaluateDomainAssessment(record.domain, record.raw);
      return !e.valid ? "未完成" : record.domain === "F06" ? `左 ${signed(e.leftBest)}／右 ${signed(e.rightBest)} cm` : `${num(e.value)} ${e.unit}`;
    };
    const comparisonTable = previous ? `<table class="da-comparison"><thead><tr><th>前次</th><th>本次</th></tr></thead><tbody><tr><td>${textValue(previous)}</td><td>${textValue(r)}</td></tr></tbody></table>` : "";
    return `${header(p().chineseName)}${loadNote()}
      <div class="card da-result">${renderDomainMeasurement(r)}<p class="small">${esc(formatDomainAssessmentTime(r.createdAt))}（台灣時間）<br>記錄來源：患者端填報，陪同者協助；${esc(syncText[sync])}</p>${sync !== "synced" ? btn("重試同步同一筆紀錄", "retry", r.id) : ""}</div>
      <div class="card"><b>與上一次比較</b>${comparisonTable}${!comparison ? `<p>尚無前次已完成評估。</p>` : comparison.comparable ? `<p>${selected === "F06" ? `左側差異 ${signed(comparison.leftDifference)}、右側差異 ${signed(comparison.rightDifference)} cm` : `數值差異 ${signed(comparison.difference)} ${comparison.unit}`}</p><p class="small">只呈現量測差異，不自動判定改善、退步或訓練進退階。</p>` : `<p>${esc(comparison.reason)}</p>`}</div>
      <div class="card da-suggestion"><b>下一步｜選擇練習</b><p>可查看${p().label}的既有練習，與復健師討論適合的動作及練習量。</p><p class="small">依構面列出練習供選擇，個別動作與練習量請依復健師建議，不會依這次數值自動調整。</p>${btn("查看同構面練習", "training", "", true)}</div>
      ${notice()}${btn("再次評估", "prep")}${btn("查看歷史紀錄", "history")}`;
  }
  function history() { return `${header(`${p().label}紀錄`)}${loadNote()}${historyRows()}${btn("新增一次評估", "prep", "", true)}`; }
  function training() {
    const exercises = allExercises().filter(e => String(e.id || e.exerciseId).startsWith(selected + "-"));
    const records = trainingRecords(getUser().id).filter(r => String(r.exerciseId).startsWith(selected + "-"));
    return `${header(`${p().label}練習`)}<p>依個人需求選擇動作。次數、時間與負重請依醫療人員指導調整。</p><p class="small">這些是既有自主練習，不是本次測驗推算的處方；完成後沿用原有結果、XP 與訓練紀錄。</p><div class="exercise-grid">${exercises.map(exerciseCard).join("")}</div><div class="card"><b>此構面的動作紀錄：${records.length} 筆</b><p class="small">評估與訓練紀錄分開保存，不把測驗當作已完成訓練。</p></div>`;
  }
  function input(name, value) {
    if (!actorMatches() || busy) return;
    if (name === "verified") run.verified = value === true;
    else if (name === "observerCount") run.raw.observerCount = parseNumber(value);
    else { const m = /^(left|right)([01])$/.exec(name); if (m && selected === "F06") run.raw[m[1]][Number(m[2])] = parseNumber(value); }
  }
  async function action(name, arg) {
    if (!owner() || busy) return;
    if (name === "domains") { run = null; stopAll(); return ctx.domains(); }
    if (name === "home") return go("domainAssessmentHome");
    if (name === "prep") { run = null; return go("domainAssessmentPrep"); }
    if (name === "begin") return startRun();
    if (name === "training") return go("domainAssessmentTraining");
    if (name === "history") return go("domainAssessmentHistory");
    if (name === "result") { const r = service.get(arg, getUser().id); if (!r) return; resultId = arg; selected = r.domain; return go("domainAssessmentResult"); }
    if (name === "retry") { busy = true; try { await service.retry({ actor: getUser(), id: arg }); } finally { busy = false; refresh(); } return; }
    if (!actorMatches()) return;
    if (name === "cancel") { if (run.started && !confirm("放棄這次尚未儲存的測試？")) return; run = null; return go("domainAssessmentHome"); }
    if (name === "save") return save();
    if (name === "saveIncomplete") return save(true);
    if (name === "camera") { run.cameraWanted = true; return refreshSession(); }
    if (name === "startSegment") return startSegment();
    if (name === "stopSegment") return finishSegment();
    if (name === "nextStage" && selected === "F02" && run.stage < 2 && run.raw.stages[run.stage].seconds === 10) { run.stage++; run.timer = null; return refreshSession(); }
    if (name === "unable" && selected === "F02" && run.raw.stages[run.stage].status === "pending" && !run.timer?.running) {
      run.started = true; run.raw.stages[run.stage] = { id: BALANCE_STAGES[run.stage].id, status: "unable", seconds: 0 };
      for (let i = run.stage + 1; i < 3; i++) run.raw.stages[i] = { id: BALANCE_STAGES[i].id, status: "not_attempted_after_stop", seconds: null };
      return refreshSession();
    }
    if (name === "tugEvent" && selected === "F03" && !run.raw.interrupted && run.raw.events.length < 5) {
      const kinds = ["go", "walking", "turning", "returning", "seated"], i = run.raw.events.length;
      if (!i) { run.started = true; run.timer = createProtocolTimer(); run.timer.start(); }
      const ms = i === 0 ? 0 : run.timer.elapsed();
      run.raw.events.push({ event: kinds[i], ms });
      if (i === 4) { run.timer.stop(); run.raw.durationMs = ms; }
      return refreshSession();
    }
  }
  function interrupted() {
    if (getRoute() === "domainAssessmentSession" && run?.timer?.running) { run.raw.interrupted = true; run.timer.stop(); stopAll(); refresh(); }
    else stopCamera();
  }
  if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.hidden) interrupted(); });
  if (typeof window !== "undefined") window.addEventListener("pagehide", interrupted);
  return { open, action, input, routes,
    render(route) {
      if (!routes.has(route)) { stopAll(); return null; }
      if (!owner()) return `${header("功能評估", "domains")}<p>請以患者帳號進入此評估流程。</p>`;
      return ({ domainAssessmentHome: home, domainAssessmentPrep: prep, domainAssessmentSession: session, domainAssessmentResult: result, domainAssessmentHistory: history, domainAssessmentTraining: training })[route]();
    },
    afterRender() { if (getRoute() === "domainAssessmentSession" && actorMatches()) { startCamera(); timerTick = setInterval(tick, 100); tick(); } },
  };
}
