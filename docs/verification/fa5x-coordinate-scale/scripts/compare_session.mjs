// Synthetic-geometry engineering check (NOT real-person accuracy validation).
// Same landmark streams through the 1.0 (before) and current (after) extractor + session.
// Usage: node compare_session.mjs [beforeRoot] [afterRoot]
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname, resolve } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const load = async (d) => ({
  f: (await import(pathToFileURL(join(d, "js/ai/exercises/sitToStand/assessmentFeatures.js")).href)).extractFa5xFeatures,
  s: (await import(pathToFileURL(join(d, "js/ai/exercises/sitToStand/assessmentSession.js")).href)).createFiveTimesSitToStandAssessment,
});
const OLD = await load(resolve(process.argv[2] || join(HERE, "../baseline-1.0"))), NEW = await load(resolve(process.argv[3] || join(HERE, "../../../..")));
const rad = (d) => (d * Math.PI) / 180;
const G = { THIGH: 0.15, SHANK: 0.15, TORSO: 0.2, HIP_Y: 0.55, TILT: 20, TRUNK: 25 };
function lm([W, H], knee, rise) {
  const a = W / H, hip = { x: a / 2, y: G.HIP_Y - rise };
  const s = { x: Math.sin(rad(G.TILT)), y: Math.cos(rad(G.TILT)) };
  const h = { x: s.x * Math.cos(rad(-knee)) - s.y * Math.sin(rad(-knee)), y: s.x * Math.sin(rad(-knee)) + s.y * Math.cos(rad(-knee)) };
  const k = { x: hip.x - G.THIGH * h.x, y: hip.y - G.THIGH * h.y }, an = { x: k.x + G.SHANK * s.x, y: k.y + G.SHANK * s.y };
  const sh = { x: hip.x + G.TORSO * Math.sin(rad(G.TRUNK)), y: hip.y - G.TORSO * Math.cos(rad(G.TRUNK)) };
  const n = (p) => ({ x: (p.x * H) / W, y: p.y, visibility: 0.95 });
  const L = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
  L[11] = L[12] = n(sh); L[23] = L[24] = n(hip); L[25] = L[26] = n(k); L[27] = L[28] = n(an);
  return L;
}
function run(M, frame, standKnee, peak) {
  const a = M.s(); let t = 1000, last; const size = { frameWidth: frame[0], frameHeight: frame[1] };
  const feed = (knee, rise, n = 1) => { for (let i = 0; i < n && last?.phase !== "finished"; i++) last = a.processFrame(M.f(lm(frame, knee, rise), undefined, size), (t += 66)); };
  for (let i = 0; i < 200 && last?.phase !== "running"; i++) feed(90, 0);
  for (let r = 0; r < 5; r++) {
    for (let i = 1; i <= 8; i++) feed(90 + (standKnee - 90) * i / 8, peak * G.SHANK * i / 8);
    feed(standKnee, peak * G.SHANK, 4);
    for (let i = 7; i >= 0; i--) feed(90 + (standKnee - 90) * i / 8, peak * G.SHANK * i / 8);
    feed(90, 0, 4);
  }
  return `${last.completedReps}/5${last.lastRejection ? " (" + last.lastRejection.reason + ")" : ""}`;
}
const FR = { "4:3": [640, 480], "16:9": [1280, 720], "9:16": [720, 1280] };
console.log("case (TRUE values)                         | frame | 1.0 (before) | 1.1 (after)");
for (const [label, knee, peak, expect] of [["stand knee 146° (bent, should NOT count)", 146, 0.9, "0/5"], ["stand knee 154° (should count)", 154, 0.9, "5/5"], ["peak hipΔ 0.74 shank (should count)", 172, 0.74, "5/5"], ["peak hipΔ 0.66 shank (should NOT count)", 172, 0.66, "0/5"]])
  for (const [fn, fr] of Object.entries(FR)) console.log(`${label.padEnd(42)} | ${fn.padEnd(5)} | ${run(OLD, fr, knee, peak).padEnd(12)} | ${run(NEW, fr, knee, peak)}   expect ${expect}`);
