import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  FA5X_PARAMS,
  FA5X_PARAMETER_SPECS,
  FA5X_PHASE,
  FA5X_REP_STATE,
  FA5X_RESULT_STATUS,
  FA5X_REJECT_REASON,
  FA5X_END_REASON,
  FA5X_TARGET_REPS,
  FA5X_TIMING_DEFINITION,
  FA5X_PROMPTS,
} from "../js/ai/exercises/sitToStand/assessmentConstants.js";
import { extractFa5xFeatures, assessFa5xFraming, trackingPromptKey } from "../js/ai/exercises/sitToStand/assessmentFeatures.js";
import { createFiveTimesSitToStandAssessment } from "../js/ai/exercises/sitToStand/assessmentSession.js";
import { createFa5xVoiceGuard } from "../js/ai/exercises/sitToStand/assessmentVoice.js";
import { createSitToStandSession } from "../js/ai/exercises/sitToStand/session.js";

/**
 * F01-A01 五次坐站測試 — Assessment Mode (Phase B).
 * Synthetic frames model a FRONT camera: the 2D knee angle reads ~170° even
 * while seated (the case that used to stall at 0/5), so every count below is
 * driven by the hip-y displacement from the seated baseline.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const P = FA5X_PARAMS;
const STEP = 66; // ~camera inference interval
const SHANK = 0.18, BASE_HIP = 0.6, BASE_SHOULDER = 0.4;

/** A feature frame at hip displacement `d` (shank lengths above the seated hip). */
function feat(d, { knee = null, trunk = 8, tracked = true, ankles = true, bottomY = 0.9, bodyHeight = null } = {}) {
  const hipY = BASE_HIP - d * SHANK, shoulderY = BASE_SHOULDER - d * SHANK;
  const kneeAngle = knee != null ? knee : 170; // front view: near-straight even when seated
  return {
    tracked: tracked && ankles,
    missing: { shoulders: !tracked, hips: !tracked, knees: !tracked, ankles: !tracked || !ankles },
    hipY: tracked ? hipY : null,
    shoulderY: tracked ? shoulderY : null,
    shankLength: tracked && ankles ? SHANK : null,
    kneeAngle: tracked ? kneeAngle : null,
    trunkLeanDeg: tracked ? trunk : null,
    topY: tracked ? shoulderY : null,
    bottomY: tracked ? bottomY : null,
    bodyHeight: tracked ? (bodyHeight != null ? bodyHeight : bottomY - shoulderY) : null,
  };
}

function driver() {
  const a = createFiveTimesSitToStandAssessment();
  let t = 1000;
  const events = [];
  let last = null;
  const feed = (f, n = 1) => {
    for (let i = 0; i < n; i += 1) {
      t += STEP;
      last = a.processFrame(typeof f === "function" ? f(i) : f, t);
      last.events.forEach((e) => events.push({ ...e, t }));
      if (last.phase === FA5X_PHASE.FINISHED) break;
    }
    return last;
  };
  const toRunning = () => {
    for (let i = 0; i < 200 && (!last || last.phase !== FA5X_PHASE.RUNNING); i += 1) feed(feat(0));
    assert.equal(last.phase, FA5X_PHASE.RUNNING, "reached the timed test");
    return last;
  };
  /** One sit->stand->sit cycle; `peak` = highest displacement reached. */
  const cycle = ({ peak = 0.9, standKnee = 176, bottom = 0 } = {}) => {
    for (let i = 1; i <= 8; i += 1) feed(feat((peak * i) / 8, { knee: peak >= P.STANDING_DISPLACEMENT_MIN ? standKnee : 170 }));
    feed(feat(peak, { knee: standKnee }), 4);
    for (let i = 7; i >= 0; i -= 1) feed(feat(bottom + ((peak - bottom) * i) / 8));
    return feed(feat(bottom), 4);
  };
  return { a, feed, toRunning, cycle, events, now: () => t, last: () => last };
}

const firstEvent = (events, type, pred = () => true) => events.find((e) => e.type === type && pred(e));

// ── 1. parameters: all engineering, documented, none clinical ────────────
{
  for (const [name, spec] of Object.entries(FA5X_PARAMETER_SPECS)) {
    assert.ok(spec.purpose && spec.purpose.length > 10, `${name} has a purpose`);
    assert.ok(["engineering_candidate", "ux_parameter"].includes(spec.evidence), `${name} evidence level is engineering/UX, never literature`);
    assert.equal(typeof spec.calibrationRequired, "boolean", `${name} states whether calibration is required`);
    if (spec.evidence === "engineering_candidate") assert.equal(spec.calibrationRequired, true, `${name} requires real-person calibration`);
    assert.ok(!/clinical|cutoff|臨床/.test(spec.purpose) || /not a|never/.test(spec.purpose), `${name} is not described as a clinical threshold`);
  }
  assert.equal(FA5X_TARGET_REPS, 5);
  assert.equal(FA5X_TIMING_DEFINITION, "start_cue_to_fifth_seated");
  const src = readFileSync(join(root, "js/ai/exercises/sitToStand/assessmentSession.js"), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/\b(115|125|142|150|10000|1800|750)\b/.test(src), "no magic threshold numbers in the session — all come from FA5X_PARAMS");
}

// ── 2. features: extraction from a real landmark array + framing ─────────
{
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
  const put = (i, x, y, v = 0.95) => { lm[i] = { x, y, visibility: v }; };
  put(11, 0.42, 0.4); put(12, 0.58, 0.4); put(23, 0.44, 0.6); put(24, 0.56, 0.6);
  put(25, 0.43, 0.66); put(26, 0.57, 0.66); put(27, 0.43, 0.88); put(28, 0.57, 0.88);
  const f = extractFa5xFeatures(lm);
  assert.equal(f.tracked, true);
  assert.ok(Math.abs(f.hipY - 0.6) < 1e-9 && Math.abs(f.shankLength - 0.22) < 1e-9);
  assert.ok(f.kneeAngle > 150, "front-view seated knee angle reads near-straight (why knee alone cannot decide seated)");
  assert.equal(assessFa5xFraming(f), "OK");
  put(27, 0.43, 0.88, 0.1);
  const noFeet = extractFa5xFeatures(lm);
  assert.equal(noFeet.tracked, false);
  assert.equal(trackingPromptKey(noFeet), "FEET_MISSING");
  assert.equal(extractFa5xFeatures(null).tracked, false);
  assert.equal(assessFa5xFraming(feat(0, { bottomY: 0.995 })), "TOO_CLOSE", "feet at the frame edge");
  assert.equal(assessFa5xFraming(feat(0, { bodyHeight: 0.2 })), "TOO_FAR");
  const noHeadroom = { ...feat(0), shoulderY: 0.1, topY: 0.1 };
  assert.equal(assessFa5xFraming(noHeadroom), "TOO_CLOSE", "no room above the shoulders to stand up");
}

// ── 3. no countdown until tracked, framed, seated and still ──────────────
{
  const d = driver();
  let s = d.feed(feat(0, { tracked: false }), 30);
  assert.equal(s.phase, FA5X_PHASE.POSITIONING);
  assert.equal(s.prompt, "FRAME_BODY");
  s = d.feed(feat(0, { ankles: false }), 5);
  assert.equal(s.prompt, "FEET_MISSING");
  s = d.feed(feat(0, { bottomY: 0.995 }), 5);
  assert.equal(s.prompt, "TOO_CLOSE");
  s = d.feed(feat(0, { bodyHeight: 0.2 }), 5);
  assert.equal(s.prompt, "TOO_FAR");
  // fidgeting: hip keeps moving more than the stillness tolerance -> never READY
  s = d.feed((i) => feat(i % 2 ? 0.12 : 0), 60);
  assert.equal(s.phase, FA5X_PHASE.SEATED_CHECK);
  assert.equal(s.prompt, "SIT_READY");
  assert.ok(!firstEvent(d.events, "countdown"), "no countdown while not still");
  // sits still -> baseline -> READY -> countdown
  s = d.feed(feat(0), Math.ceil(P.SEATED_READY_STABLE_MS / STEP) + 2);
  assert.equal(s.phase, FA5X_PHASE.READY);
  assert.ok(firstEvent(d.events, "baseline"), "seated baseline recorded");
  assert.ok(Math.abs(s.baseline.hipY - BASE_HIP) < 1e-9, "baseline = median seated hip y");
}

// ── 4. countdown needs valid tracking; early rise is a false start ───────
{
  const d = driver();
  d.feed(feat(0), Math.ceil((P.SEATED_READY_STABLE_MS + P.READY_HOLD_MS) / STEP) + 4);
  assert.equal(d.last().phase, FA5X_PHASE.COUNTDOWN);
  let s = d.feed(feat(0, { tracked: false }));
  assert.equal(s.phase, FA5X_PHASE.POSITIONING, "tracking lost during countdown -> back to positioning");
  d.feed(feat(0), Math.ceil((P.SEATED_READY_STABLE_MS + P.READY_HOLD_MS) / STEP) + 4);
  s = d.feed(feat(0.3));
  assert.equal(s.phase, FA5X_PHASE.SEATED_CHECK);
  assert.equal(s.prompt, "FALSE_START");
  assert.ok(!firstEvent(d.events, "start_cue"), "no start cue after a false start");
  // baseline taken while standing, then sitting down -> seated check restarts
  const d2 = driver();
  d2.feed(feat(0), Math.ceil((P.SEATED_READY_STABLE_MS + 200) / STEP));
  s = d2.feed(feat(-0.5));
  assert.equal(s.phase, FA5X_PHASE.SEATED_CHECK);
  assert.equal(s.prompt, "SIT_READY");
}

// ── 5. countdown 3-2-1 then 「開始」 starts the official timer ────────────
{
  const d = driver();
  const s = d.toRunning();
  const counts = d.events.filter((e) => e.type === "countdown").map((e) => e.value);
  assert.deepEqual(counts, [3, 2, 1]);
  const cue = firstEvent(d.events, "start_cue");
  assert.ok(cue && s.startCueAt === cue.at);
  const c3 = firstEvent(d.events, "countdown", (e) => e.value === 3);
  assert.ok(cue.at - c3.t >= 3 * P.COUNTDOWN_STEP_MS, "3-2-1 is preparation; the timer starts only at 開始");
  assert.equal(s.prompt, "START");
  assert.equal(s.completedReps, 0);
  assert.equal(s.repState, FA5X_REP_STATE.SEATED);
}

// ── 6. one full sit->stand->sit counts once, only when back on the seat ──
{
  const d = driver();
  d.toRunning();
  for (let i = 1; i <= 8; i += 1) d.feed(feat((0.9 * i) / 8, { knee: 176 }));
  let s = d.feed(feat(0.9, { knee: 176 }), 4);
  assert.equal(s.repState, FA5X_REP_STATE.STANDING);
  assert.equal(s.completedReps, 0, "standing up alone is not a rep");
  for (let i = 7; i >= 1; i -= 1) d.feed(feat((0.9 * i) / 8));
  assert.equal(d.last().completedReps, 0, "not counted before reaching the seat");
  s = d.feed(feat(0), 4);
  assert.equal(s.completedReps, 1);
  assert.equal(s.repState, FA5X_REP_STATE.SEATED);
}

// ── 7. not fully standing -> rejected, not counted ──────────────────────
{
  const d = driver();
  d.toRunning();
  let s = d.cycle({ peak: 0.45 });
  assert.equal(s.completedReps, 0);
  assert.equal(s.lastRejection.reason, FA5X_REJECT_REASON.NOT_FULLY_STANDING);
  assert.equal(s.prompt, "NOT_FULLY_STANDING");
  // hip high enough but knees clearly bent (knee angle measurable) -> still not standing
  s = d.cycle({ peak: 0.85, standKnee: 120 });
  assert.equal(s.completedReps, 0, "knee angle blocks 'standing' when it is measurable and bent");
  assert.equal(d.events.filter((e) => e.type === "rejected").length, 2);
}

// ── 8. not fully seated -> rejected; the rep completes on the full sit ──
{
  const d = driver();
  d.toRunning();
  for (let i = 1; i <= 8; i += 1) d.feed(feat((0.9 * i) / 8, { knee: 176 }));
  d.feed(feat(0.9, { knee: 176 }), 4);
  for (let i = 7; i >= 3; i -= 1) d.feed(feat((0.9 * i) / 8)); // down to ~0.34, above the seat
  let s = d.feed(feat(0.9, { knee: 176 }), 4); // back up
  assert.equal(s.lastRejection.reason, FA5X_REJECT_REASON.NOT_FULLY_SEATED);
  assert.equal(s.completedReps, 0);
  for (let i = 7; i >= 0; i -= 1) d.feed(feat((0.9 * i) / 8));
  s = d.feed(feat(0), 4);
  assert.equal(s.completedReps, 1, "full sit afterwards completes the rep");
  // a small wobble at the top is NOT reported as 未完整坐回
  const d2 = driver();
  d2.toRunning();
  for (let i = 1; i <= 8; i += 1) d2.feed(feat((0.9 * i) / 8, { knee: 176 }));
  d2.feed(feat(0.9, { knee: 176 }), 3);
  d2.feed(feat(0.55), 2);
  d2.feed(feat(0.9, { knee: 176 }), 4);
  assert.ok(!firstEvent(d2.events, "rejected"), "top-of-stand wobble is not a rejected attempt");
}

// ── 9. five reps complete; timer stops at the 5th seated frame ──────────
{
  const d = driver();
  const start = d.toRunning();
  let s;
  for (let r = 0; r < 5; r += 1) s = d.cycle();
  assert.equal(s.phase, FA5X_PHASE.FINISHED);
  const fin = firstEvent(d.events, "finished");
  const res = fin.result;
  assert.equal(res.status, FA5X_RESULT_STATUS.COMPLETED);
  assert.equal(res.completedReps, 5);
  assert.equal(res.repDurationsMs.length, 5);
  const lastRep = res.reps[4];
  assert.equal(res.totalDurationMs, lastRep.seatedMs, "total = 5th seated time, measured from the 開始 cue");
  const firstSeatedFrame = fin.t - (P.SEATED_CONFIRM_FRAMES - 1) * STEP;
  assert.equal(res.totalDurationMs, Math.round(firstSeatedFrame - start.startCueAt), "stops at the FIRST seated-confirm frame (confirmation adds no time)");
  assert.ok(res.movementOnsetMs > 0 && res.movementOnsetMs < res.reps[0].standingMs, "movement onset recorded separately from the cue");
  assert.equal(res.timingDefinition, FA5X_TIMING_DEFINITION);
  assert.ok(res.algorithmVersion && res.thresholdVersion);
  assert.deepEqual(res.parameters, { ...P });
  assert.ok(res.baseline && res.baseline.shankLength > 0);
  assert.equal(res.failureReason, null);
  assert.equal(res.invalidReason, null);
  assert.equal(s.prompt, "COMPLETE");
  const after = d.feed(feat(0.9), 5);
  assert.equal(after.completedReps, 5, "nothing is processed after completion");
}

// ── 10. tracking: short gap tolerated, sustained loss -> invalid ─────────
{
  const d = driver();
  d.toRunning();
  d.cycle();
  let s = d.feed(feat(0, { tracked: false }), Math.floor((P.TRACKING_LOSS_INVALID_MS - 200) / STEP));
  assert.equal(s.phase, FA5X_PHASE.RUNNING, "short gap tolerated");
  assert.equal(s.prompt, "TRACKING_WARNING");
  d.feed(feat(0), 2);
  s = d.cycle();
  assert.equal(s.completedReps, 2, "counting continues after a short gap");
  s = d.feed(feat(0, { tracked: false }), Math.ceil(P.TRACKING_LOSS_INVALID_MS / STEP) + 2);
  assert.equal(s.phase, FA5X_PHASE.FINISHED);
  const res = firstEvent(d.events, "finished").result;
  assert.equal(res.status, FA5X_RESULT_STATUS.INVALID);
  assert.equal(res.invalidReason, FA5X_END_REASON.TRACKING_LOST);
  assert.equal(res.totalDurationMs, null, "invalid never carries a total time");
  assert.equal(res.completedReps, 2);
  assert.equal(res.trackingLossCount, 2);
  assert.equal(s.prompt, "INVALID");
}

// ── 11. incomplete: cancel / timeout keep no total; cancel before 開始 stores nothing ─
{
  const d = driver();
  d.toRunning();
  d.cycle();
  d.cycle();
  const c = d.a.cancel(d.now() + STEP);
  const res = c.events.find((e) => e.type === "finished").result;
  assert.equal(res.status, FA5X_RESULT_STATUS.INCOMPLETE);
  assert.equal(res.failureReason, FA5X_END_REASON.USER_CANCELLED);
  assert.equal(res.totalDurationMs, null);
  assert.equal(res.completedReps, 2);

  const early = driver();
  early.feed(feat(0), 10);
  const c2 = early.a.cancel(early.now());
  assert.ok(!c2.events.some((e) => e.type === "finished") && c2.result == null, "nothing measured before 開始 -> no result");

  const slow = driver();
  slow.toRunning();
  const s = slow.feed(feat(0), Math.ceil(P.MAX_ASSESSMENT_MS / STEP) + 3);
  const r3 = firstEvent(slow.events, "finished").result;
  assert.equal(s.phase, FA5X_PHASE.FINISHED);
  assert.equal(r3.status, FA5X_RESULT_STATUS.INCOMPLETE);
  assert.equal(r3.failureReason, FA5X_END_REASON.TIMEOUT);
  assert.equal(r3.totalDurationMs, null);

  const wrongStart = driver();
  wrongStart.toRunning();
  const s4 = wrongStart.feed(feat(-0.5), 2);
  const r4 = firstEvent(wrongStart.events, "finished").result;
  assert.equal(s4.phase, FA5X_PHASE.FINISHED);
  assert.equal(r4.status, FA5X_RESULT_STATUS.INVALID);
  assert.equal(r4.invalidReason, FA5X_END_REASON.START_POSITION_NOT_SEATED);
}

// ── 12. voice guard: change-only prompts + cooldown; priority always ─────
{
  const g = createFa5xVoiceGuard({ cooldownMs: 4000 });
  assert.deepEqual(g.decide("TOO_CLOSE", 0), { text: FA5X_PROMPTS.TOO_CLOSE.voice, interrupt: false });
  assert.equal(g.decide("TOO_CLOSE", 1500), null, "same line not repeated inside the cooldown");
  assert.ok(g.decide("TOO_CLOSE", 4100), "spoken again after the cooldown");
  assert.equal(g.decide("CAMERA_STARTING", 0), null, "text-only prompts are never spoken");
  for (const k of ["COUNT_3", "COUNT_2", "COUNT_1", "START", "COMPLETE"]) {
    assert.equal(g.decide(k, 10).interrupt, true, `${k} is priority`);
    assert.ok(g.decide(k, 20), `${k} is never throttled`);
  }
  // the session itself emits a prompt only when it changes
  const d = driver();
  d.feed(feat(0, { tracked: false }), 40);
  assert.equal(d.events.filter((e) => e.type === "prompt" && e.key === "FRAME_BODY").length, 1, "prompt emitted once, not every frame");
  const voiced = ["FRAME_BODY", "TOO_CLOSE", "TOO_FAR", "FEET_MISSING", "SIT_READY", "READY", "COUNT_3", "COUNT_2", "COUNT_1", "START", "NOT_FULLY_STANDING", "NOT_FULLY_SEATED", "COMPLETE"];
  voiced.forEach((k) => assert.ok(FA5X_PROMPTS[k].voice, `${k} has a spoken line`));
  assert.equal(FA5X_PROMPTS.START.voice, "開始");
  assert.equal(FA5X_PROMPTS.COMPLETE.voice, "評估完成");
}

// ── 13. Training Mode untouched ──────────────────────────────────────────
{
  const tr = createSitToStandSession({ targetReps: 1 });
  let t = 0;
  const f = (k) => tr.processFrame({ timestamp: (t += 300), averageKneeAngle: k, trunkLeanDeg: 10, kneeAsymmetryDeg: 3, kneeValgus: false, bodyReady: true });
  [100, 130, 160, 162, 164, 140, 110, 108, 106].forEach(f);
  assert.equal(tr.getSummary().totalReps, 1, "training FSM still counts a knee-angle rep");
  try {
    execFileSync("git", ["diff", "--quiet", "HEAD", "--", "js/ai/exercises/sitToStand/session.js", "js/ai/exercises/sitToStand/constants.js", "js/ai/exercises/sitToStand/poseMath.js", "js/ai/exercises/sitToStand/quality.js", "js/ai/exercises/sitToStand/score.js"], { cwd: root });
  } catch (e) {
    if (e.status === 1) assert.fail("Training Mode sitToStand files must not be modified");
  }
  assert.ok(/function goLe05Detection\(\)/.test(appJs) && /createSitToStandSession\(\{targetReps:le05SessionMeta\.targetReps\}\)/.test(appJs), "le05Detection still runs the training FSM");
}

// ── 14. app.js wiring: separate FSM, no engineering codes, statuses ──────
{
  const block = appJs.slice(appJs.indexOf("function goFiveTimesSitToStandDetection()"), appJs.indexOf("function goFunctionalChangeTrend()"));
  assert.ok(block.includes("createFiveTimesSitToStandAssessment()"), "assessment uses its own session");
  assert.ok(!block.includes("createSitToStandSession"), "assessment no longer runs the training FSM");
  assert.ok(block.includes("extractFa5xFeatures("));
  const page = block.slice(block.indexOf("function fiveTimesSitToStandDetectionPage()"), block.indexOf("function fa5xSetText"));
  for (const code of ["READY (", "READY（", "LOST_LONG", "LOST_SUSTAINED", "TOO_CLOSE", "prototype", "慢慢"]) {
    assert.ok(!page.includes(code), `detection page never shows ${code}`);
  }
  assert.ok(/FA5X_DEBUG \? `<div class="card fa5x-debug"/.test(page), "debug numbers only with ?fa5xDebug=1");
  assert.ok(!appJs.includes("很好，慢慢控制坐下") || appJs.indexOf("很好，慢慢控制坐下") > appJs.indexOf("function goLe05Detection"), "「慢慢」 wording is gone from the assessment");

  const result = appJs.slice(appJs.indexOf("function fiveTimesSitToStandResultPage()"), appJs.indexOf("function fiveTimesSitToStandResultPage()") + 14000);
  const nonCompleted = result.slice(result.indexOf("if (status !== FA5X_RESULT_STATUS.COMPLETED)"), result.indexOf("const repDurations"));
  assert.ok(nonCompleted.length > 100);
  assert.ok(!nonCompleted.includes("startRecommendationFromFiveTimesSitToStand"), "incomplete/invalid results never link to recommendation");
  assert.ok(!nonCompleted.includes("totalDurationMs"), "incomplete/invalid results never show a total time");
  assert.ok(result.includes("startRecommendationFromFiveTimesSitToStand('${session.id}')"), "completed result keeps 取得訓練建議");
  assert.ok(!/初階|中階|高階|cutoff|常模/.test(result), "no tier or cutoff derived from the seconds");

  const entry = appJs.slice(appJs.indexOf("function startRecommendationFromFiveTimesSitToStand("), appJs.indexOf("function startRecommendationFromFiveTimesSitToStand(") + 1500);
  assert.ok(entry.includes("getFa5xResultStatus(session.result) !== FA5X_RESULT_STATUS.COMPLETED"), "recommendation entry refuses non-completed runs");
}

// ═════ UX refinement round (after real-person testing) ═══════════════════

// ── 15. detection parameters unchanged; only UX timing READY_HOLD_MS moved ─
{
  const detection = { ...P };
  delete detection.READY_HOLD_MS;
  assert.deepEqual(detection, {
    MIN_VISIBILITY: 0.55, FRAME_EDGE_MARGIN: 0.02, TOO_FAR_BODY_HEIGHT_MAX: 0.3, STANDING_HEADROOM_SHANK_UNITS: 1,
    SEATED_READY_STABLE_MS: 1500, SEATED_READY_MAX_HIP_JITTER: 0.06, COUNTDOWN_STEP_MS: 1000,
    RISE_ONSET_DISPLACEMENT: 0.15, STANDING_DISPLACEMENT_MIN: 0.7, STANDING_KNEE_ANGLE_MIN_DEG: 150, STANDING_EXIT_HYSTERESIS: 0.1,
    SEATED_RETURN_DISPLACEMENT_MAX: 0.12, BELOW_BASELINE_RESET: 0.25, STANDING_CONFIRM_FRAMES: 3, SEATED_CONFIRM_FRAMES: 3,
    TRACKING_LOSS_INVALID_MS: 1200, MAX_ASSESSMENT_MS: 60000,
  }, "every detection/threshold parameter is exactly the Phase B value");
  assert.equal(P.READY_HOLD_MS, 3000, "準備完成 hold fits the spoken 「準備完成。聽到開始後再起身。」");
  assert.equal(FA5X_PARAMETER_SPECS.READY_HOLD_MS.evidence, "ux_parameter");
}

// ── 16. Step 1: standing camera set-up (before the session is fed) ────────
const { classifyStandingFraming, createStandingPositionCheck, FA5X_POSITIONING_UX } = await import("../js/ai/exercises/sitToStand/assessmentPositioning.js");
{
  const standing = (over = {}) => ({ ...feat(0.9, { knee: 176 }), ...over });
  assert.equal(classifyStandingFraming(standing()), "OK", "standing, fully in frame");
  assert.equal(classifyStandingFraming(standing({ topY: 0.01, bottomY: 0.995 })), "TOO_CLOSE", "head and feet both at the edges");
  assert.equal(classifyStandingFraming(standing({ topY: 0.01 })), "NO_HEADROOM");
  assert.equal(classifyStandingFraming(standing({ bottomY: 0.995 })), "FEET_MISSING", "feet at the bottom edge");
  assert.equal(classifyStandingFraming(standing({ bodyHeight: 0.2 })), "TOO_FAR");
  assert.equal(classifyStandingFraming(feat(0, { ankles: false })), "FEET_MISSING");
  assert.equal(classifyStandingFraming(feat(0, { tracked: false })), "FRAME_BODY");
  const standingFeat = standing();
  assert.equal(assessFa5xFraming(standingFeat, P, { checkStandingHeadroom: false }), "OK", "same framing function / params as the session");

  const chk = createStandingPositionCheck();
  let t = 0, r;
  r = chk.update(standing({ bodyHeight: 0.2 }), (t += STEP));
  assert.equal(r.key, "TOO_FAR");
  for (let i = 0; i < 5; i += 1) r = chk.update(standing(), (t += STEP));
  assert.ok(!r.done && r.progress > 0 && r.key === "STAND_POSITION", "holding the position fills progress");
  r = chk.update(standing({ topY: 0.01 }), (t += STEP));
  assert.equal(r.key, "NO_HEADROOM");
  assert.equal(r.progress, 0, "a framing problem restarts the hold");
  for (let i = 0; i < Math.ceil(FA5X_POSITIONING_UX.STANDING_POSITION_HOLD_MS / STEP) + 1; i += 1) r = chk.update(standing(), (t += STEP));
  assert.equal(r.done, true);
  assert.equal(r.key, "POSITION_OK");
  assert.equal(chk.update(feat(0, { tracked: false }), (t += STEP)).done, true, "done latches (sitting down does not undo step 1)");
}

// ── 17. prompt wording from the real-person round ─────────────────────────
{
  assert.equal(FA5X_PROMPTS.STAND_POSITION.text, "先調整拍攝位置");
  assert.equal(FA5X_PROMPTS.STAND_POSITION.voice, "請先站好，調整位置，讓全身完整入鏡。");
  assert.equal(FA5X_PROMPTS.POSITION_OK.voice, "位置調整完成。現在請坐到椅子上，雙腳踩穩，雙手交叉抱胸。");
  assert.equal(FA5X_PROMPTS.READY.voice, "準備完成。聽到開始後再起身。");
  assert.equal(FA5X_PROMPTS.NO_HEADROOM.text, "請調整位置，保留站立空間");
  assert.equal(FA5X_PROMPTS.FEET_MISSING.text, "請調整手機位置，讓雙腳完整入鏡");
  assert.equal(FA5X_PROMPTS.NOT_FULLY_SEATED.text, "請完整坐回椅子");
  assert.equal(FA5X_PROMPTS.TRACKING_WARNING.text, "請保持全身入鏡");
  for (const k of Object.keys(FA5X_PROMPTS)) {
    assert.ok(!/READY|LOST_|TOO_CLOSE|SEATED_RETURN|OK\)/.test(FA5X_PROMPTS[k].text), `${k} text shows no engineering code`);
  }
  for (const n of ["一", "二", "三", "四", "五"]) {
    assert.ok(!Object.values(FA5X_PROMPTS).some((p) => p.voice === n), "reps are not counted aloud");
  }
}

// ── 18. app.js: stand-first set-up, rep confirmation, running panel ───────
{
  const frame = appJs.slice(appJs.indexOf("function handleFa5xFrame("), appJs.indexOf("function applyFa5xSnapshot("));
  assert.ok(/if \(fa5xStage === "stand"\)/.test(frame) && frame.indexOf("fa5xPositionCheck.update(") < frame.indexOf("fa5xAssessment.processFrame("), "step 1 runs before any frame reaches the assessment session");
  assert.ok(/fa5xStage = "assess"/.test(frame) && frame.includes('fa5xSpeak("POSITION_OK", time)'), "position OK switches to the seated step with its spoken instruction");
  const apply = appJs.slice(appJs.indexOf("function applyFa5xSnapshot("), appJs.indexOf("function finalizeFa5xAssessment("));
  assert.ok(apply.includes("showFa5xRepFlash(e.count)") && apply.includes("playFa5xDing("), "each counted rep: centre ✓ n / 5 + ding");
  assert.ok(/fa5x-rep-flash-count">✓ \$\{count\} \/ \$\{FA5X_TARGET_REPS\}/.test(appJs), "flash text is ✓ n / 5");
  assert.ok(appJs.includes('<span class="fa5x-rep-flash-done">評估完成</span>'), "5 / 5 flash says 評估完成");
  assert.ok(/}, 1000\);/.test(appJs.slice(appJs.indexOf("function finalizeFa5xAssessment("))), "result page opens ~1 s after completion");
  const panels = appJs.slice(appJs.indexOf("const FA5X_PANELS = {"), appJs.indexOf("function goFiveTimesSitToStandDetection()"));
  for (const text of ["先調整拍攝位置", "請站在椅子前方，讓頭到雙腳完整出現在畫面中。", "✓ 拍攝位置完成", "現在請坐到椅子上準備測試", "雙腳踩穩地面", "雙手交叉抱胸", "聽到「開始」後才起身",
    "✓ 準備完成", "聽到「開始」後，盡快完成 5 次完整坐站。", "完全站直 → 完整坐回 → 共 5 次", "五次坐站測試", "已完成", "完全站直 → 完整坐回"]) {
    assert.ok(panels.includes(text), `panel shows 「${text}」`);
  }
  assert.ok(/fmtFa5xClock\(/.test(apply) || /fmtFa5xClock\(/.test(appJs.slice(appJs.indexOf("function startFa5xTimer("))), "running timer formatted 00:04.8");
}

// ── 19. explanation page (user-facing steps, starts seated) ───────────────
{
  const page = appJs.slice(appJs.indexOf("function fiveTimesSitToStandAssessmentPage()"), appJs.indexOf("function goFiveTimesSitToStandResult("));
  for (const text of ["記錄你連續完成 5 次坐下、站起所需的時間，了解目前的下肢功能表現。", "測試前準備", "準備一張穩固、不易滑動的椅子", "手機固定在前方，周圍保留足夠站立空間",
    "系統會先協助你調整拍攝距離", "測試怎麼做", "先依畫面提示調整相機距離", "距離確認完成後，再坐到椅子上", "雙腳踩穩地面，雙手交叉抱胸", "聽到「開始」後再起身",
    "每一次都要完全站直，再完整坐回椅子", "連續完成 5 次後，系統會自動結束評估", "請先完成相機位置調整，再依提示坐下準備。",
    "請在安全、穩定的環境下進行，如有需要可請家人或陪同者在旁協助。"]) {
    assert.ok(page.includes(text), `explanation shows 「${text}」`);
  }
  assert.ok(!/無扶手|41|43|45 公分|椅高/.test(page), "no over-specific chair requirements");
}

// ── 20. result summary hierarchy (Result redesign): hero -> 本次完成紀錄 -> short info row -> next step ───
{
  const result = appJs.slice(appJs.indexOf("function fiveTimesSitToStandResultPage()"), appJs.indexOf("function fiveTimesSitToStandResultPage()") + 12000);
  const completed = result.slice(result.indexOf("const repDurations"));
  // Phase D2 — the next-step block is built as `nextHtml` (baseline vs reassessment
  // variant) and placed after the note; check the page order and the baseline variant.
  const template = completed.slice(completed.indexOf("return `${header}"));
  const order = ["fa5x-hero-value", "完成五次坐站所需時間", "本次完成紀錄", "fa5x-info-row", "${nextHtml}"].map((s) => template.indexOf(s));
  order.forEach((i, k) => assert.ok(i > 0, `completed page has item ${k}`));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "big result, then record, then note, then the next-step block");
  const baselineNext = completed.slice(completed.indexOf(": `<div class=\"card fa5x-next-card\">"), completed.indexOf("return `${header}"));
  const nextOrder = ["下一步｜安排訓練", "查看訓練建議 →", "返回 F01 下肢功能"].map((s) => baselineNext.indexOf(s));
  nextOrder.forEach((i, k) => assert.ok(i > 0, `baseline next step has item ${k}`));
  assert.deepEqual([...nextOrder].sort((a, b) => a - b), nextOrder, "next-step title, primary CTA, then ONE secondary action");
  assert.ok(!/再測一次|查看歷次結果/.test(baselineNext), "no third equally strong action");
  assert.ok(result.includes("五次坐站｜評估結果"));
  assert.ok(completed.includes("✓ 已完成 ${completedReps} / ${FA5X_TARGET_REPS}"));
  assert.ok(completed.includes("本次 5 次坐站已完成，${seconds} 秒將作為後續再次評估時的比較依據。"));
  assert.ok(completed.includes("選擇你目前想加強的方向，取得適合的居家訓練建議。"));
  assert.ok(completed.includes("連續完成 ${completedReps} 次完整坐站") && completed.includes("fa5x-done-mark"), "completion shown as marks, not seconds");
  assert.ok(/class="btn btn-primary full fa5x-next-cta"/.test(baselineNext), "查看訓練建議 is the primary button");
  assert.equal((baselineNext.match(/btn-primary/g) || []).length, 1, "only one primary button in the baseline next step");
  assert.equal((template.match(/btn-primary/g) || []).length, 0, "no other primary button on the completed page");
  // Flow & Data QA — repDurationsMs is the hip-off-seat phase of each rep, not a full
  // sit-to-stand, so the page no longer shows it as 「第 N 次 X 秒」 (total time only).
  assert.ok(!/fa5x-rep-bar|第 \$\{i \+ 1\} 次/.test(completed) && !/fmtFa5xSec\(ms\)/.test(completed), "no per-rep seconds presented as full sit-to-stand times");
  for (const word of ["良好", "不佳", "正常", "異常", "高風險", "低風險", "肌少症", "平均", "變異", "疲勞"]) {
    assert.ok(!completed.includes(word), `no 「${word}」 judgement or undefined statistic`);
  }
  const nonCompleted = result.slice(result.indexOf("if (status !== FA5X_RESULT_STATUS.COMPLETED)"), result.indexOf("const repDurations"));
  assert.ok(nonCompleted.includes("重新測試") && /btn btn-primary full[^>]*goFiveTimesSitToStandAssessment/.test(nonCompleted), "incomplete/invalid: 重新測試 is the main action");
  assert.ok(!nonCompleted.includes("查看訓練建議") && !nonCompleted.includes("fa5x-hero-value"), "incomplete/invalid: no total seconds, no recommendation CTA");
}

console.log("5xSTS Assessment Mode (Phase B + UX refinement) tests passed");
