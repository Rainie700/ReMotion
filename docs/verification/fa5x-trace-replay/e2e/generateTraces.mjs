/**
 * Local engineering verification (no camera): synthetic feature frames are
 * recorded through the REAL recorder (assessmentTrace.js) exactly as app.js
 * wires it (session.setTraceListener -> recorder.recordFrame("assess", entry, ...)),
 * exported with buildExport() and written as JSON files. The CLI
 * (scripts/replayFa5xTrace.mjs) then reads those files.
 *
 * Also writes official-result comparisons: the same input run with and without
 * the recorder attached.
 *
 *   node docs/verification/fa5x-trace-replay/e2e/generateTraces.mjs <outDir>
 *
 * Synthetic data — not accuracy validation.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const imp = (p) => import(pathToFileURL(join(root, p)).href);
const { FA5X_PARAMS: P } = await imp("js/ai/exercises/sitToStand/assessmentConstants.js");
const { createFiveTimesSitToStandAssessment } = await imp("js/ai/exercises/sitToStand/assessmentSession.js");
const { createFa5xTraceRecorder, FA5X_TRACE_END_TYPE: END } = await imp("js/ai/exercises/sitToStand/assessmentTrace.js");

const outDir = resolve(process.argv[2] || "fa5x-e2e-out");
mkdirSync(outDir, { recursive: true });

const STEP = 66, SHANK = 0.18, BASE_HIP = 0.6, BASE_SHOULDER = 0.4;
function feat(d, { knee = 170, tracked = true, w = 1280, h = 720 } = {}) {
  const hipY = BASE_HIP - d * SHANK, shoulderY = BASE_SHOULDER - d * SHANK;
  return {
    tracked, missing: { shoulders: !tracked, hips: !tracked, knees: !tracked, ankles: !tracked },
    frameSizeValid: true, frameWidth: w, frameHeight: h,
    hipY: tracked ? hipY : null, shoulderY: tracked ? shoulderY : null, shankLength: tracked ? SHANK : null,
    kneeAngle: tracked ? knee : null, trunkLeanDeg: tracked ? 8 : null,
    topY: tracked ? shoulderY : null, bottomY: tracked ? 0.9 : null, bodyHeight: tracked ? 0.9 - shoulderY : null,
  };
}
/** Fake 33-point pose so the landmark subset path of the recorder is exercised too. */
const pose = (f) => Array.from({ length: 33 }, (_, i) => ({ x: 0.3 + i / 100, y: f.hipY ?? 0.5, visibility: f.tracked ? 0.95 : 0.1, presence: 0.99 }));

const prep = (n = 150) => Array.from({ length: n }, () => feat(0));
function cycle(peak, opt = {}) {
  const out = [];
  for (let i = 1; i <= 8; i += 1) out.push(feat((peak * i) / 8, { ...opt, knee: peak >= P.STANDING_DISPLACEMENT_MIN ? 176 : 170 }));
  for (let i = 0; i < 4; i += 1) out.push(feat(peak, { ...opt, knee: 176 }));
  for (let i = 7; i >= 0; i -= 1) out.push(feat((peak * i) / 8, opt));
  for (let i = 0; i < 4; i += 1) out.push(feat(0, opt));
  return out;
}
const fullRun = () => [...prep(), ...cycle(0.4), ...Array.from({ length: 5 }, () => feat(0, { tracked: false })), ...Array.from({ length: 5 }, () => cycle(0.9)).flat()];

/** Scenarios: input frames + optional user cancel. */
const SCENARIOS = {
  completed: { frames: fullRun() },
  tracking_lost_invalid: { frames: [...prep(), ...cycle(0.9), ...Array.from({ length: 30 }, () => feat(0, { tracked: false })), ...prep(10)] },
  start_not_seated_invalid: { frames: [...prep(), ...Array.from({ length: 10 }, () => feat(-0.3))] },
  frame_changed_invalid: { frames: [...prep(), ...cycle(0.9), ...Array.from({ length: 10 }, () => feat(0, { w: 720, h: 1280 }))] },
  timeout_incomplete: { frames: [...prep(), ...Array.from({ length: Math.ceil(61000 / STEP) }, () => feat(0))] },
  user_cancelled: { frames: [...prep(), ...cycle(0.9), ...cycle(0.9)], cancelAt: 150 + 24 + 10 }, // during the 2nd cycle
};
if (SCENARIOS.user_cancelled.cancelAt >= SCENARIOS.user_cancelled.frames.length) throw new Error("cancelAt beyond the input");

/** Runs frames through a fresh session, optionally with the real recorder attached the way app.js does it. */
function runSession(frames, { recorder = null, attachAt = 0, detach = null, cancelAt = null } = {}) {
  const session = createFiveTimesSitToStandAssessment();
  let ctx = null;
  const listener = (e) => recorder.recordFrame("assess", e, e.kind === "frame" ? ctx || {} : {});
  let t = 1000;
  const snaps = [];
  frames.forEach((f, i) => {
    if (cancelAt != null && i > cancelAt) return;
    if (recorder && i === attachAt) session.setTraceListener(listener);
    if (recorder && detach && i === detach[0]) session.setTraceListener(null);
    if (recorder && detach && i === detach[1]) session.setTraceListener(listener);
    t += STEP;
    ctx = { landmarks: pose(f), frameWidth: f.frameWidth, frameHeight: f.frameHeight };
    snaps.push(cancelAt != null && i === cancelAt ? session.cancel(t) : session.processFrame(f, t));
  });
  const finished = snaps.flatMap((s) => s.events).find((e) => e.type === "finished");
  return { snaps, result: finished ? finished.result : null };
}

function writeTrace(name, frames, { endType = END.RUN_FINISHED, recorderOpts = {}, ...runOpts } = {}) {
  const rec = createFa5xTraceRecorder({ ...recorderOpts, startContext: { route: "fiveTimesSitToStandDetection", stage: runOpts.attachAt ? "assess" : "stand", phase: null, standCheckStarted: false, finalized: false } });
  rec.recordEvent("trace_started", {}, 0);
  runSession(frames, { recorder: rec, ...runOpts });
  if (endType) { rec.recordEvent(endType, {}, null); rec.stop(endType); }
  const data = rec.buildExport();
  writeFileSync(join(outDir, `${name}.json`), JSON.stringify(data, null, 2)); // same serialisation as downloadFa5xTrace()
  return data;
}

// ── 1. trace files for the CLI ──
const full = writeTrace("01-complete", SCENARIOS.completed.frames);
// deliberately altered decision: the recorded completedReps of the 3rd counted rep frame
{
  const t = JSON.parse(JSON.stringify(full));
  const target = t.frames.filter((f) => f.diag?.step === "rep_counted")[2];
  target.after.completedReps = 99;
  writeFileSync(join(outDir, "02-tampered-decision.json"), JSON.stringify(t, null, 2));
  writeFileSync(join(outDir, "02-tampered-decision.expected.json"), JSON.stringify({ seq: target.seq, path: "after.completedReps" }));
}
// deliberately altered input: one rising-frame hip y (the replayed decision must then differ)
{
  const t = JSON.parse(JSON.stringify(full));
  const target = t.frames.find((f) => f.diag?.step === "standing_confirmed");
  target.features.hipY = BASE_HIP; // back at the seat
  writeFileSync(join(outDir, "03-tampered-input.json"), JSON.stringify(t, null, 2));
  writeFileSync(join(outDir, "03-tampered-input.expected.json"), JSON.stringify({ seq: target.seq }));
}
// Guard: every index below must lie inside the input, otherwise the scenario silently does nothing.
const N = SCENARIOS.completed.frames.length;
for (const i of [200, 250, 255]) if (i >= N) throw new Error(`index ${i} beyond input length ${N}`);
writeTrace("04-mid-run-start", SCENARIOS.completed.frames, { attachAt: 200 });
writeTrace("05-frame-gap", SCENARIOS.completed.frames, { detach: [250, 255] }); // listener off for 5 frames = missed frames
writeTrace("06-capacity-truncated", SCENARIOS.completed.frames, { recorderOpts: { maxFrames: 200 } });
writeTrace("07-event-truncated", SCENARIOS.completed.frames, { recorderOpts: { maxEvents: 15 } }); // the complete run has 29 events
writeFileSync(join(outDir, "08-format-1.0.json"), JSON.stringify({ ...full, formatVersion: "fa5x-frame-trace-1.0" }, null, 2));
writeFileSync(join(outDir, "09-other-algorithm.json"), JSON.stringify({ ...full, algorithmVersion: "fa5x-assessment-1.0" }, null, 2));
writeTrace("10-user-cancelled", SCENARIOS.user_cancelled.frames, { cancelAt: SCENARIOS.user_cancelled.cancelAt, endType: END.USER_CANCELLED });
writeTrace("11-manual-stop", SCENARIOS.completed.frames.slice(0, 260), { endType: END.MANUAL_STOP });
writeTrace("12-still-recording", SCENARIOS.completed.frames.slice(0, 260), { endType: null });
writeTrace("13-tracking-lost-invalid", SCENARIOS.tracking_lost_invalid.frames);
writeTrace("14-frame-changed-invalid", SCENARIOS.frame_changed_invalid.frames);
writeFileSync(join(outDir, "15-not-json.json"), "{ this is not json");

// ── 2. official result: without vs with the recorder (same input) ──
const comparison = Object.entries(SCENARIOS).map(([name, s]) => {
  const plain = runSession(s.frames, { cancelAt: s.cancelAt });
  const rec = createFa5xTraceRecorder();
  const traced = runSession(s.frames, { recorder: rec, cancelAt: s.cancelAt });
  const sameSnapshots = JSON.stringify(plain.snaps) === JSON.stringify(traced.snaps);
  const r = plain.result, q = traced.result;
  return {
    scenario: name,
    framesFed: plain.snaps.length,
    tracedFrames: rec.status().frames,
    withoutRecorder: r && { status: r.status, completedReps: r.completedReps, totalDurationMs: r.totalDurationMs, failureReason: r.failureReason, invalidReason: r.invalidReason, repDurationsMs: r.repDurationsMs, rejectedAttempts: r.rejectedAttempts.length },
    withRecorder: q && { status: q.status, completedReps: q.completedReps, totalDurationMs: q.totalDurationMs, failureReason: q.failureReason, invalidReason: q.invalidReason, repDurationsMs: q.repDurationsMs, rejectedAttempts: q.rejectedAttempts.length },
    fullResultIdentical: JSON.stringify(r) === JSON.stringify(q),
    everySnapshotIdentical: sameSnapshots,
  };
});
writeFileSync(join(outDir, "official-result-comparison.json"), JSON.stringify(comparison, null, 2));
console.log(`wrote traces + comparison to ${outDir}`);
comparison.forEach((c) => console.log(`${c.scenario}: ${c.withoutRecorder?.status}/${c.withoutRecorder?.failureReason || c.withoutRecorder?.invalidReason || "-"} reps=${c.withoutRecorder?.completedReps} total=${c.withoutRecorder?.totalDurationMs} | identical result=${c.fullResultIdentical} snapshots=${c.everySnapshotIdentical} traced=${c.tracedFrames}/${c.framesFed}`));
