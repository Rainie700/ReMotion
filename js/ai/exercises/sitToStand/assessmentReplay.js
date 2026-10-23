import { FA5X_PARAMS, FA5X_ALGORITHM_VERSION, FA5X_THRESHOLD_VERSION } from "./assessmentConstants.js";
import { createFiveTimesSitToStandAssessment } from "./assessmentSession.js";
import { FA5X_TRACE_END_TYPE } from "./assessmentTrace.js";

/**
 * F01-A01 五次坐站 — OFFLINE replay of a development frame trace (pure, DOM-free).
 *
 * Feeds the recorded `features` + camera time `t` of every assessment frame,
 * in recorded order, into the ORIGINAL session (createFiveTimesSitToStandAssessment,
 * with the trace's recorded params / targetReps). There is no counting rule
 * here: the replay only compares what the session decides now with what it
 * decided while recording (state before/after, decision step + conditions,
 * events), then summarises reps, event times, end status and total time.
 *
 * Verdicts:
 *   - "unsupported": unreadable structure, unsupported format version, or a
 *     different algorithm version. Nothing is replayed.
 *   - "mismatch": a replayed frame differs; the FIRST difference is reported.
 *   - "not_verifiable": replayed portion matches, but the data cannot prove a
 *     full reproduction (started mid-run, frame gaps, capacity truncation,
 *     no recorded end, ...). Never reported as success.
 *   - "reproduced": complete trace, every frame and the end result match.
 *
 * Development / regression tool only — not accuracy validation.
 */

export const FA5X_REPLAY_SUPPORTED_FORMATS = Object.freeze(["fa5x-frame-trace-1.1"]);
export const FA5X_REPLAY_VERDICT = Object.freeze({
  REPRODUCED: "reproduced",
  MISMATCH: "mismatch",
  NOT_VERIFIABLE: "not_verifiable",
  UNSUPPORTED: "unsupported",
});
/** Session events whose timing is compared in the summary. */
const TIMED_EVENT_TYPES = ["baseline", "start_cue", "rejected", "rep", "finished", "frame_changed"];

const norm = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

/** First differing path between two JSON-normalised values (recorded vs replayed). */
function firstDiff(a, b, path = "") {
  if (Object.is(a, b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
    for (const k of keys) {
      const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
      if (d) return d;
    }
    return null;
  }
  return { path, recorded: a ?? null, replayed: b ?? null };
}

const stripEvent = ({ seq, stage, t, ...rest }) => rest;

/** Reps, event times, end status, total time of one run (from session events). */
function summarize(timedEvents, finished) {
  return {
    completedReps: finished ? finished.completedReps : timedEvents.filter((e) => e.type === "rep").length,
    eventTimes: timedEvents.map((e) => ({ type: e.type, t: e.t, ...(e.type === "rep" ? { count: e.count } : {}), ...(e.type === "rejected" ? { reason: e.reason } : {}) })),
    endStatus: finished ? { status: finished.status, failureReason: finished.failureReason ?? null, invalidReason: finished.invalidReason ?? null } : null,
    totalDurationMs: finished ? finished.totalDurationMs ?? null : null,
  };
}

function checkSupport(trace, currentAlgorithmVersion, currentParams) {
  const problems = [];
  const warnings = [];
  if (!trace || typeof trace !== "object") return { problems: ["檔案內容不是 JSON 物件"], warnings };
  if (!FA5X_REPLAY_SUPPORTED_FORMATS.includes(trace.formatVersion)) {
    problems.push(`不支援的格式版本：${trace.formatVersion ?? "（未標示）"}；支援 ${FA5X_REPLAY_SUPPORTED_FORMATS.join("、")}`
      + (trace.formatVersion === "fa5x-frame-trace-1.0" ? "（1.0 沒有判定幀序號與開始／結束標記，無法確認完整性）" : ""));
  }
  if (trace.algorithmVersion !== currentAlgorithmVersion) {
    problems.push(`演算法版本不同：紀錄為 ${trace.algorithmVersion ?? "（未標示）"}，目前判定器為 ${currentAlgorithmVersion}；不同版本的判定程式無法用來重現`);
  }
  if (!Array.isArray(trace.frames) || !Array.isArray(trace.events)) problems.push("缺少 frames 或 events 陣列");
  const p = trace.params;
  const keys = Object.keys(currentParams).sort();
  if (!p || typeof p !== "object") problems.push("缺少 params（門檻）");
  else {
    const recKeys = Object.keys(p).sort();
    if (JSON.stringify(recKeys) !== JSON.stringify(keys)) problems.push(`params 欄位與目前判定器不同（紀錄 ${recKeys.length} 個、目前 ${keys.length} 個）`);
    else if (keys.some((k) => typeof p[k] !== "number" || !Number.isFinite(p[k]))) problems.push("params 含非數值");
    else if (keys.some((k) => p[k] !== currentParams[k])) warnings.push("紀錄的門檻數值與目前 FA5X_PARAMS 不同；重播使用紀錄中的門檻（不修改程式門檻）");
  }
  if (trace.thresholdVersion !== FA5X_THRESHOLD_VERSION) warnings.push(`門檻版本不同：紀錄 ${trace.thresholdVersion ?? "（未標示）"}，目前 ${FA5X_THRESHOLD_VERSION}`);
  if (!Number.isInteger(trace.targetReps) || trace.targetReps < 1) problems.push("缺少 targetReps");
  return { problems, warnings };
}

/**
 * @param {object} trace parsed export of assessmentTrace.js
 * @param {{ createSession?: Function, currentAlgorithmVersion?: string, currentParams?: object }} [opts] injection for tests only
 */
export function replayFa5xTrace(trace, {
  createSession = createFiveTimesSitToStandAssessment,
  currentAlgorithmVersion = FA5X_ALGORITHM_VERSION,
  currentParams = FA5X_PARAMS,
} = {}) {
  const report = {
    tool: "fa5x-trace-replay",
    formatVersion: trace?.formatVersion ?? null,
    algorithmVersion: trace?.algorithmVersion ?? null,
    replayAlgorithmVersion: currentAlgorithmVersion,
    verdict: null,
    problems: [],
    warnings: [],
    completenessIssues: [],
    endType: trace?.endType ?? null,
    segments: [],
    framesReplayed: 0,
    framesSkipped: 0,
    firstMismatch: null,
    summaryMismatches: [],
  };
  const support = checkSupport(trace, currentAlgorithmVersion, currentParams);
  report.problems = support.problems;
  report.warnings = support.warnings;
  if (report.problems.length) { report.verdict = FA5X_REPLAY_VERDICT.UNSUPPORTED; return report; }

  // ── completeness: the recorder's flags AND an independent check of the frames ──
  const issues = report.completenessIssues;
  const c = trace.completeness || {};
  if (trace.droppedFrames > 0 || trace.droppedEvents > 0 || c.truncated) issues.push(`容量截斷：略過 ${trace.droppedFrames ?? "?"} 幀、${trace.droppedEvents ?? "?"} 個事件`);
  if (trace.frameCount !== trace.frames.length) issues.push(`frameCount (${trace.frameCount}) 與實際幀數 (${trace.frames.length}) 不符`);
  if (trace.eventCount !== trace.events.length) issues.push(`eventCount (${trace.eventCount}) 與實際事件數 (${trace.events.length}) 不符`);
  if (c.startedMidRun) issues.push("中途開始記錄：缺少判定開頭");
  if (Array.isArray(c.frameIndexGaps) && c.frameIndexGaps.length) issues.push(`判定幀序號不連續 ${c.frameIndexGaps.length} 處`);
  if (trace.endType === FA5X_TRACE_END_TYPE.STILL_RECORDING) issues.push("匯出時仍在記錄中，紀錄可能未涵蓋結束");
  if (trace.endType === FA5X_TRACE_END_TYPE.MANUAL_STOP) issues.push("手動停止記錄");
  if (trace.endType === FA5X_TRACE_END_TYPE.DETECTION_EXIT) issues.push("未開始計時即離開，沒有正式結果可比對");
  if (trace.endType == null) issues.push("缺少結束類型（endType）");

  const frames = [...trace.frames].filter((f) => f && f.stage === "assess").sort((a, b) => a.seq - b.seq);
  const eventsBySeq = new Map();
  trace.events.filter((e) => e && e.stage === "assess").forEach((e) => {
    if (!eventsBySeq.has(e.seq)) eventsBySeq.set(e.seq, []);
    eventsBySeq.get(e.seq).push(e);
  });
  if (!frames.length) issues.push("沒有任何判定幀（stage = assess）");

  // ── segments: a session starts at sessionFrameIndex 0 (set-up restart = new session) ──
  const segments = [];
  let cur = null;
  let lastIdx = null;
  for (const f of frames) {
    if (f.kind === "frame") {
      if (!Number.isInteger(f.sessionFrameIndex)) { issues.push(`seq ${f.seq} 缺少 sessionFrameIndex`); cur = null; report.framesSkipped += 1; continue; }
      if (f.sessionFrameIndex === 0) { cur = { frames: [] }; segments.push(cur); }
      else if (!cur) { report.framesSkipped += 1; lastIdx = f.sessionFrameIndex; continue; } // before the first session start
      else if (f.sessionFrameIndex !== lastIdx + 1) { issues.push(`seq ${f.seq} 判定幀序號跳號（預期 ${lastIdx + 1}，實際 ${f.sessionFrameIndex}）`); cur = null; report.framesSkipped += 1; lastIdx = f.sessionFrameIndex; continue; }
      lastIdx = f.sessionFrameIndex;
    } else if (!cur) { report.framesSkipped += 1; continue; }
    cur.frames.push(f);
  }
  if (report.framesSkipped > 0 && !issues.some((s) => s.startsWith("中途開始記錄"))) issues.push(`有 ${report.framesSkipped} 個判定幀無法從其所屬判定的開頭重播（中途開始或跳號）`);

  // ── replay each segment through the original session ──
  segments.forEach((seg, si) => {
    const session = createSession({ params: { ...trace.params }, targetReps: trace.targetReps });
    let captured = null;
    session.setTraceListener((entry) => { captured = entry; });
    const recTimed = [], repTimed = [];
    let recFinished = null, repFinished = null;
    for (const f of seg.frames) {
      captured = null;
      if (f.kind === "cancel") session.cancel(f.t);
      else session.processFrame(norm(f.features), f.t);
      report.framesReplayed += 1;
      const recEvents = (eventsBySeq.get(f.seq) || []).map(stripEvent);
      const repEvents = captured ? captured.events.map(({ t, ...rest }) => rest) : [];
      const recTypes = Array.isArray(f.eventTypes) ? f.eventTypes : [];
      if (recEvents.length === recTypes.length) {
        recEvents.forEach((e) => { if (TIMED_EVENT_TYPES.includes(e.type)) recTimed.push({ ...e, t: f.t }); if (e.type === "finished") recFinished = e.result; });
      } else {
        // This frame's event payloads were dropped (event cap); the frame still lists its event types,
        // and the recorder kept the result separately. Summary then shows types/times only.
        seg.eventPayloadsMissing = true;
        recTypes.forEach((type) => { if (TIMED_EVENT_TYPES.includes(type)) recTimed.push({ type, t: f.t }); if (type === "finished") recFinished = trace.result ?? null; });
      }
      repEvents.forEach((e) => { if (TIMED_EVENT_TYPES.includes(e.type)) repTimed.push({ ...e, t: f.t }); if (e.type === "finished") repFinished = e.result; });
      if (report.firstMismatch) continue;
      const recorded = norm({ sessionFrameIndex: f.sessionFrameIndex, before: f.before, after: f.after, diag: f.diag, eventTypes: f.eventTypes, events: recEvents });
      const replayed = norm({
        sessionFrameIndex: captured ? captured.frameIndex : null, before: captured?.before, after: captured?.after, diag: captured?.diag,
        eventTypes: captured ? captured.events.map((e) => e.type) : [], events: repEvents,
      });
      // With dropped events the per-frame event payloads are not complete -> compare types only.
      if (trace.droppedEvents > 0) { delete recorded.events; delete replayed.events; }
      const d = captured ? firstDiff(recorded, replayed) : { path: "(no trace entry)", recorded: "entry", replayed: null };
      if (d) report.firstMismatch = { segment: si + 1, seq: f.seq, sessionFrameIndex: f.sessionFrameIndex, kind: f.kind, t: f.t, step: f.diag?.step ?? null, ...d };
    }
    const rec = summarize(recTimed, norm(recFinished));
    const rep = summarize(repTimed, norm(repFinished));
    const segReport = { segment: si + 1, frames: seg.frames.length, recorded: rec, replayed: rep, ended: recFinished != null, eventPayloadsMissing: seg.eventPayloadsMissing === true };
    // Dropped events would show up as false summary differences; the per-frame eventTypes comparison still runs.
    if (!(trace.droppedEvents > 0)) for (const field of ["completedReps", "eventTimes", "endStatus", "totalDurationMs"]) {
      const d = firstDiff(norm(rec[field]), norm(rep[field]), field);
      if (d) report.summaryMismatches.push({ segment: si + 1, ...d });
    }
    report.segments.push(segReport);
  });

  // The final run must have a recorded end, and it must equal the exported result.
  const last = report.segments[report.segments.length - 1];
  if (last && !last.ended) issues.push("最後一段判定沒有結束事件，無法比對結束狀態與總時間");
  if (last && last.ended && trace.result) {
    const d = firstDiff(norm(summarize([], trace.result).endStatus), norm(last.replayed.endStatus), "result.endStatus")
      || firstDiff(norm(trace.result.totalDurationMs ?? null), norm(last.replayed.totalDurationMs), "result.totalDurationMs")
      || firstDiff(norm(trace.result.completedReps), norm(last.replayed.completedReps), "result.completedReps");
    if (d) report.summaryMismatches.push({ segment: last.segment, ...d });
  }
  if (!report.segments.length && frames.length) issues.push("沒有可從開頭重播的判定段落");

  report.verdict = report.firstMismatch || report.summaryMismatches.length ? FA5X_REPLAY_VERDICT.MISMATCH
    : issues.length || !report.segments.length ? FA5X_REPLAY_VERDICT.NOT_VERIFIABLE
      : FA5X_REPLAY_VERDICT.REPRODUCED;
  return report;
}

const VERDICT_TEXT = {
  reproduced: "重現成功：每個判定幀與結束結果都一致",
  mismatch: "不一致：重播結果與紀錄不同",
  not_verifiable: "無法確認重現：已重播的部分一致，但紀錄不完整，不能宣稱重現成功",
  unsupported: "不支援：未重播",
};

/** Human-readable report (Traditional Chinese). */
export function formatFa5xReplayReport(r) {
  const lines = [`五次坐站紀錄重播：${VERDICT_TEXT[r.verdict] || r.verdict}`];
  lines.push(`格式 ${r.formatVersion ?? "?"}｜紀錄演算法 ${r.algorithmVersion ?? "?"}｜重播判定器 ${r.replayAlgorithmVersion}｜結束類型 ${r.endType ?? "?"}`);
  r.problems.forEach((p) => lines.push(`✗ ${p}`));
  r.completenessIssues.forEach((p) => lines.push(`⚠ ${p}`));
  r.warnings.forEach((p) => lines.push(`注意：${p}`));
  if (r.verdict !== FA5X_REPLAY_VERDICT.UNSUPPORTED) {
    lines.push(`重播 ${r.framesReplayed} 幀、略過 ${r.framesSkipped} 幀、${r.segments.length} 段判定`);
    r.segments.forEach((s) => {
      const fmt = (x) => `${x.completedReps} 次｜${x.endStatus ? `${x.endStatus.status}${x.endStatus.failureReason ? `/${x.endStatus.failureReason}` : ""}${x.endStatus.invalidReason ? `/${x.endStatus.invalidReason}` : ""}` : "未結束"}｜總時間 ${x.totalDurationMs ?? "—"} ms`;
      lines.push(`  第 ${s.segment} 段（${s.frames} 幀）紀錄：${fmt(s.recorded)}${s.eventPayloadsMissing ? "（部分事件內容因容量上限遺失，依幀上的事件類型與保留的結果整理）" : ""}`);
      lines.push(`  第 ${s.segment} 段（${s.frames} 幀）重播：${fmt(s.replayed)}`);
    });
    if (r.firstMismatch) {
      const m = r.firstMismatch;
      lines.push(`第一個不一致：第 ${m.segment} 段 seq ${m.seq}（判定幀 #${m.sessionFrameIndex ?? "—"}、t = ${m.t} ms、步驟 ${m.step ?? "—"}）欄位 ${m.path}：紀錄 ${JSON.stringify(m.recorded)} ≠ 重播 ${JSON.stringify(m.replayed)}`);
    }
    r.summaryMismatches.forEach((m) => lines.push(`摘要不一致：第 ${m.segment} 段 ${m.path}：紀錄 ${JSON.stringify(m.recorded)} ≠ 重播 ${JSON.stringify(m.replayed)}`));
  }
  return lines.join("\n");
}
