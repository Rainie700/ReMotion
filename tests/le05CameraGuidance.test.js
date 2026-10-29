import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * F01-04 坐站 camera page (使用體驗改善 2/5): the status / instruction come from the counter's real gate, never from
 * "the whole body is visible". Program logic with SYNTHETIC knee angles — not a statement about real camera recognition.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const G = await import("../js/ai/exercises/sitToStand/trainingGuidance.js");
const { createSitToStandSession, LE05_STATE } = await import("../js/ai/exercises/sitToStand/session.js");
const { LE05_THRESHOLDS } = await import("../js/ai/exercises/sitToStand/constants.js");
const { traceLe05Frame, summarizeLe05Trace, le05MissingJoints } = await import("../js/ai/exercises/sitToStand/trainingTrace.js");

const base = { camera: "ready", landmarks: true, bodyReady: true, missing: [], framing: "OK", gate: { state: LE05_STATE.SEATED, seatedObserved: false }, reps: 0, target: 5 };
const key = (over) => G.deriveLe05Guidance({ ...base, ...over }).key;

// ── 1. each state is distinct; whole body visible ≠ ready ──
{
  assert.equal(key({ camera: "starting" }), G.LE05_GUIDE.CAMERA_STARTING);
  assert.equal(key({ camera: "loading" }), G.LE05_GUIDE.MODEL_LOADING);
  const f = G.deriveLe05Guidance({ ...base, camera: "failed", failText: "AI 動作偵測模型載入失敗，請確認網路連線後再試一次。" });
  assert.deepEqual([f.key, f.status, f.text], [G.LE05_GUIDE.FAILED, "無法開始", "AI 動作偵測模型載入失敗，請確認網路連線後再試一次。"]);
  assert.equal(key({ landmarks: false, bodyReady: false }), G.LE05_GUIDE.NO_PERSON);
  assert.equal(key({ bodyReady: false, missing: ["L_ankle", "R_ankle"] }), G.LE05_GUIDE.NOT_IN_FRAME);
  const standingEntry = G.deriveLe05Guidance({ ...base });
  assert.equal(standingEntry.key, G.LE05_GUIDE.FOUND_NOT_SEATED, "full body but start posture not observed -> NOT ready");
  assert.equal(standingEntry.status, "還沒確認起始坐姿");
  assert.ok(standingEntry.text.includes("請先坐好") && !standingEntry.text.includes("可以開始"));
  assert.equal(key({ gate: { state: LE05_STATE.SEATED, seatedObserved: true } }), G.LE05_GUIDE.READY);
  for (const st of [LE05_STATE.RISING, LE05_STATE.STANDING, LE05_STATE.LOWERING]) assert.equal(key({ gate: { state: st, seatedObserved: true } }), G.LE05_GUIDE.PRACTICING);
  assert.equal(key({ bodyReady: false, lostAfterReady: true, missing: ["L_knee"] }), G.LE05_GUIDE.TRACKING_LOST);
  assert.equal(G.LE05_GUIDE_STATUS.tracking_lost, "追蹤中斷，需要重新就緒");
  assert.equal(key({ reps: 5 }), G.LE05_GUIDE.COMPLETED);
  // never internal codes / never "on the chair"
  const all = Object.values(G.LE05_GUIDE_STATUS).join("") + ["found_not_seated", "ready", "practicing"].map((k) => G.deriveLe05Guidance({ ...base, gate: { state: k === "practicing" ? "standing" : "seated", seatedObserved: k !== "found_not_seated" } }).text).join("");
  assert.ok(!/LOST_|READY|PARTIAL|OK\b|椅面|坐在椅子上|確認坐在/.test(all), all);
}

// ── 2. the instruction names what is actually missing ──
{
  assert.equal(G.missingJointsText(["L_ankle", "R_ankle"]), "請讓雙腳也在畫面內，可以再退後一點");
  assert.equal(G.missingJointsText(["L_knee", "R_ankle"]), "請讓膝蓋與雙腳保持在畫面內");
  assert.equal(G.missingJointsText(["L_hip"]), "請讓臀部到雙腳都在畫面內");
  assert.equal(G.missingJointsText(["R_shoulder"]), "請讓肩膀也在畫面內，可以再退後一點");
  assert.equal(G.missingJointsText([], "TOO_CLOSE"), "請退後一點，讓頭到雙腳都在畫面內");
  assert.ok(!Object.values({ a: G.missingJointsText(["x"]) }).includes("請調整位置"));
}

// ── 3. display smoothing: one noisy frame never flips the screen; events flash briefly ──
{
  const tr = G.createLe05GuidanceTracker({ holdMs: 400, flashMs: 2000 });
  const ready = G.deriveLe05Guidance({ ...base, gate: { state: "seated", seatedObserved: true } });
  const notIn = G.deriveLe05Guidance({ ...base, bodyReady: false, missing: ["L_ankle"] });
  assert.equal(tr.update(ready, 0).key, "ready");
  assert.equal(tr.update(notIn, 66).key, "ready", "one frame does not switch");
  assert.equal(tr.update(ready, 132).key, "ready");
  tr.update(notIn, 200); assert.equal(tr.update(notIn, 700).key, "not_in_frame", "switches after holding 400 ms");
  assert.equal(tr.update(G.deriveLe05Guidance({ ...base, camera: "failed", failText: "x" }), 701).key, "failed", "failure is immediate");
  const t2 = G.createLe05GuidanceTracker();
  t2.update(ready, 0); t2.flash("已計入第 1 次", 10);
  assert.equal(t2.update(ready, 500).text, "已計入第 1 次");
  assert.equal(t2.update(ready, 3000).text, ready.text, "flash expires");
}

// ── 4. driven by the REAL counter (synthetic angles): standing entry, seat, rep, gap -> must re-ready ──
{
  const s = createSitToStandSession({ targetReps: 5 });
  let t = 0;
  const feed = (knee, n = 1, ready = true) => { let r; for (let i = 0; i < n; i++) { t += 66; r = s.processFrame({ timestamp: t, averageKneeAngle: ready ? knee : null, trunkLeanDeg: 10, kneeAsymmetryDeg: 2, kneeValgus: false, bodyReady: ready }); } return r; };
  const now = () => G.deriveLe05Guidance({ ...base, gate: s.getGate(), reps: s.getSummary().totalReps }).key;
  feed(175, 20);
  assert.equal(now(), "found_not_seated", "entered standing with the whole body in frame: not ready");
  feed(95, 5);
  assert.equal(now(), "ready");
  feed(130, 2); feed(165, 4);
  assert.equal(now(), "practicing");
  feed(130, 2); feed(95, 4);
  assert.equal(s.getSummary().totalReps, 1);
  assert.equal(now(), "practicing", "after a counted rep: keep going");
  feed(null, 25, false); // ~1.6 s with no tracked frame
  feed(175, 3);
  assert.equal(s.getGate().seatedObserved, false);
  assert.equal(now(), "found_not_seated", "after a tracking gap the start posture must be seen again");
  assert.equal(s.getSummary().totalReps, 1, "the gap never adds or removes reps");
}

// ── 5. developer trace: same gate as the page; frontal-like seated angles (≥116°) never open the seat gate ──
{
  const s = createSitToStandSession({ targetReps: 5 });
  const lm = (knee) => { // 2D landmarks with a given hip-knee-ankle angle (side geometry), all visible
    const p = (x, y) => ({ x, y, visibility: 0.99 });
    const rad = (180 - knee) * Math.PI / 180, hip = p(0.5 - 0.15 * Math.sin(rad), 0.55 - 0.15 * Math.cos(rad));
    const pts = Array.from({ length: 33 }, () => p(0.5, 0.5));
    pts[11] = p(0.45, 0.3); pts[12] = p(0.55, 0.3); pts[23] = hip; pts[24] = { ...hip }; pts[25] = p(0.5, 0.55); pts[26] = p(0.5, 0.55); pts[27] = p(0.5, 0.7); pts[28] = p(0.5, 0.7);
    return pts;
  };
  const rows = [];
  let t = 0;
  for (const k of [175, 175, 124, 120, 118, 122, 126, 170, 176, 175, 130, 121, 119, 125, 172]) rows.push(traceLe05Frame(s, lm(k), (t += 66)));
  assert.ok(rows.every((r) => r.bodyReady && Math.abs(r.knee - [175, 175, 124, 120, 118, 122, 126, 170, 176, 175, 130, 121, 119, 125, 172][rows.indexOf(r)]) < 1.5));
  const sum = summarizeLe05Trace(rows);
  assert.equal(sum.firstSeatedObservedAt, null, `seated gate is ${LE05_THRESHOLDS.SEATED_KNEE_ANGLE_MAX_DEG}°: 118–126° never opens it`);
  assert.deepEqual(sum.reps, []);
  assert.deepEqual(le05MissingJoints(null), ["(no pose)"]);
  const hidden = lm(170); hidden[27] = { ...hidden[27], visibility: 0.2 };
  assert.deepEqual(le05MissingJoints(hidden), ["L_ankle"]);
  assert.equal(LE05_THRESHOLDS.SEATED_KNEE_ANGLE_MAX_DEG, 115, "threshold unchanged this round");
}

// ── 6. camera page wiring ──
{
  const line = (prefix) => appJs.split("\n").find((l) => l.startsWith(prefix)) || "";
  const page = line("function le05DetectionPage(){");
  assert.ok(page.includes('const title=m.fixedPractice?"坐站練習":m.exerciseName'), "fixed practice is 坐站練習 on the camera page");
  assert.ok(page.includes('id="le05RepCounterValue">0</b><span>/ ${m.targetReps} 次</span>') && page.includes('id="le05Guide"') && page.includes('id="le05Status"'));
  assert.ok(/\$\{PAGE_ACTION_OPEN\}<div class="exp-cta-bar"><button class="btn btn-primary full exp-cta" id="le05FinishBtn" onclick="finalizeLe05Training\(\)">結束練習<\/button><\/div>\$\{PAGE_ACTION_CLOSE\}/.test(page), "結束練習 is the page-level action (always visible)");
  for (const gone of ["AI 姿勢分數", "le05LiveScore", "平均膝角度", "le05KneeAngle", "軀幹傾斜", "追蹤狀態", "le05Readiness\"", "放棄本次訓練", "看不到手", "角度與分數", "AI 坐站偵測"]) assert.ok(!page.includes(gone), `camera page has no ${gone}`);
  const frame = line("function handleLe05Frame(l,time){");
  assert.ok(frame.length > 100 && frame.includes("le05SessionTracker.getGate()") && frame.includes("renderLe05Guide(time,{") && !frame.includes("displayState"), "guidance from the counter's gate, not the visibility display state");
  assert.ok(!frame.includes('setLe05("le05Readiness"'), "no internal state code on screen");
  // entering standing then sitting is how everyone starts: still recorded by the counter, but not flashed as a failed try
  assert.ok(frame.includes('result.unconfirmedAttempt.reason!=="rise_not_observed"'), "rise_not_observed is not flashed");
  const guide = line("function renderLe05Guide(");
  assert.ok(guide.includes("deriveLe05Guidance(") && guide.includes('retry.hidden=d.key!=="failed"'));
  assert.ok(line("function retryLe05Camera(){").includes("beginLe05CameraSession()") && appJs.includes("window.retryLe05Camera = retryLe05Camera;"));
  assert.ok(appJs.includes('const LE05_DEV_TRACE=typeof import.meta!=="undefined"&&!!(import.meta.env&&import.meta.env.DEV);') && line("function le05DevTrace(").includes("if(!LE05_DEV_TRACE"), "diagnostics are dev-only");
  // counting + saving untouched: fixed practice saves the actual AI count, self-report stays apart
  assert.ok(appJs.includes("if(le05SessionMeta&&le05SessionMeta.fixedPractice)return finalizeF01FixedPracticeRun();"));
  assert.ok(appJs.includes("targetReps:isF01FixedPracticeRun()?state.f01FixedPracticeRun.target.repetitions:"));
  // no voice is used on this page (screen-only, nothing to fall out of sync)
  const block = appJs.slice(appJs.indexOf("let le05SessionMeta="), appJs.indexOf("let le03SessionMeta="));
  assert.ok(!/speechSynthesis|speak\(/.test(block), "F01-04 camera page has no voice");
}
console.log("le05CameraGuidance: all assertions passed");
