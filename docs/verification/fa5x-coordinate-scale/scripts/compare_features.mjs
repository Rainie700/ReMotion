// Synthetic-geometry engineering check (NOT real-person accuracy validation).
// Usage: node compare_features.mjs [codeRoot]
//   codeRoot defaults to the current project; pass ../baseline-1.0 for the frozen 1.0 code.
// Builds ONE planar geometry (in pixels, unit = image height), projects it into
// MediaPipe-style normalized coords (x/W, y/H) for several frame sizes, and
// prints what extractFa5xFeatures() measures.
import { pathToFileURL, fileURLToPath } from "node:url";
import { join, dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const dir = resolve(process.argv[2] || join(HERE, "../../../.."));
const { extractFa5xFeatures } = await import(pathToFileURL(join(dir, "js/ai/exercises/sitToStand/assessmentFeatures.js")).href);

const FRAMES = [["4:3 640x480", 640, 480], ["16:9 1280x720", 1280, 720], ["9:16 720x1280", 720, 1280]];
const rad = (d) => (d * Math.PI) / 180;

/** Side-ish view: shank tilted SHANK_TILT from vertical, knee angle `knee`, trunk lean `trunk`. Units: image heights. */
function body(knee, { rise = 0, trunk = 30, shankTilt = 20, aspect }) {
  const SHANK = 0.2, THIGH = 0.2, TORSO = 0.25;
  const cx = aspect / 2;
  const ankle = { x: cx - 0.05, y: 0.88 - rise };
  const kneeP = { x: ankle.x + SHANK * Math.sin(rad(shankTilt)), y: ankle.y - SHANK * Math.cos(rad(shankTilt)) };
  // knee->ankle direction angle, rotate by `knee` to get knee->hip
  const a0 = Math.atan2(ankle.y - kneeP.y, ankle.x - kneeP.x);
  const a1 = a0 - rad(knee);
  const hip = { x: kneeP.x + THIGH * Math.cos(a1), y: kneeP.y + THIGH * Math.sin(a1) };
  const sh = { x: hip.x + TORSO * Math.sin(rad(trunk)), y: hip.y - TORSO * Math.cos(rad(trunk)) };
  return { ankle, knee: kneeP, hip, sh };
}

function toLandmarks(b, W, H) {
  const n = (p) => ({ x: (p.x * H) / W, y: p.y, visibility: 0.95 }); // px = unit*H; x_norm = px/W, y_norm = px/H
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.95 }));
  lm[11] = n(b.sh); lm[12] = n(b.sh); lm[23] = n(b.hip); lm[24] = n(b.hip);
  lm[25] = n(b.knee); lm[26] = n(b.knee); lm[27] = n(b.ankle); lm[28] = n(b.ankle);
  return lm;
}

const f2 = (v, d = 2) => (v == null ? "null" : v.toFixed(d));
console.log("truth: knee = row angle, trunk = 30.00, shank = 0.2000 image heights, rise 0.14 = 0.70 shank");
console.log("frame          | knee true | knee meas | trunk meas | shank meas | hipΔ/shank (truth 0.70)");
for (const knee of [90, 150, 160]) {
  for (const [label, W, H] of FRAMES) {
    const aspect = W / H;
    const opts = { frameWidth: W, frameHeight: H };
    const seated = extractFa5xFeatures(toLandmarks(body(knee, { aspect }), W, H), undefined, opts);
    const risen = extractFa5xFeatures(toLandmarks(body(knee, { aspect, rise: 0.14 }), W, H), undefined, opts);
    const ratio = seated.shankLength ? (seated.hipY - risen.hipY) / seated.shankLength : null;
    console.log(`${label.padEnd(14)} | ${String(knee).padStart(9)} | ${f2(seated.kneeAngle).padStart(9)} | ${f2(seated.trunkLeanDeg).padStart(10)} | ${f2(seated.shankLength, 4).padStart(10)} | ${f2(ratio, 3)}`);
  }
}
// framing fields must be identical regardless of the geometry fix
const [, W, H] = FRAMES[1];
const fr = extractFa5xFeatures(toLandmarks(body(150, { aspect: W / H }), W, H), undefined, { frameWidth: W, frameHeight: H });
console.log(`framing (16:9, knee 150): topY=${f2(fr.topY, 4)} bottomY=${f2(fr.bottomY, 4)} bodyHeight=${f2(fr.bodyHeight, 4)} hipY=${f2(fr.hipY, 4)}`);
