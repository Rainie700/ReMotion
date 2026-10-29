// F01-04 (LE05) sit-to-stand — synthetic knee-angle sequences (program logic only; not real video).
// Frames every 100 ms. Each case lists the expected count from the definition of a complete rep:
// seated observed → stand confirmed → seated confirmed, tracked throughout (short gaps < MAX_FRAME_GAP_MS tolerated).
export const STEP = 100;
const hold = (k, ms) => Array.from({ length: Math.round(ms / STEP) }, () => k);
const ramp = (a, b, ms) => { const n = Math.round(ms / STEP); return Array.from({ length: n }, (_, i) => a + ((b - a) * (i + 1)) / n); };
const LOST = (ms) => Array.from({ length: Math.round(ms / STEP) }, () => null);
/** one rep: seated → rise → stand → lower → seated */
const rep = ({ rise = 1200, stand = 600, lower = 1500, seat = 600 } = {}) => [...ramp(100, 168, rise), ...hold(168, stand), ...ramp(168, 100, lower), ...hold(100, seat)];
const SEAT = hold(100, 600);

export const CASES = [
  { id: "S1", label: "正常速度完整坐站（約 3.3 秒）", frames: [...SEAT, ...rep()], expected: 1 },
  { id: "S2", label: "慢速完整坐站，計時段（膝角 ≥125° 起到坐穩）約 12 秒，全程可追蹤", frames: [...SEAT, ...rep({ rise: 5000, stand: 3000, lower: 6000 })], expected: 1 },
  { id: "S3", label: "起身途中停在 140° 約 4 秒，之後完成（約 13 秒）", frames: [...SEAT, ...ramp(100, 140, 1500), ...hold(140, 4000), ...ramp(140, 168, 1500), ...hold(168, 1000), ...ramp(168, 100, 4000), ...hold(100, 600)], expected: 1 },
  { id: "S4", label: "坐下途中停在 130° 約 6 秒，之後坐回（約 12 秒）", frames: [...SEAT, ...ramp(100, 168, 1500), ...hold(168, 1000), ...ramp(168, 130, 1500), ...hold(130, 6000), ...ramp(130, 100, 2500), ...hold(100, 600)], expected: 1 },
  { id: "S5", label: "半程（只到 140°）就坐回，3 秒後再做一次正常完整坐站", frames: [...SEAT, ...ramp(100, 140, 1500), ...hold(140, 2000), ...ramp(140, 100, 1500), ...hold(100, 3000), ...rep({ rise: 2000, stand: 1000, lower: 2000 })], expected: 1 },
  { id: "S6", label: "半程就坐回（只到 140°），之後沒有再做", frames: [...SEAT, ...ramp(100, 140, 1500), ...hold(140, 2000), ...ramp(140, 100, 1500), ...hold(100, 1000)], expected: 0 },
  { id: "S7", label: "站立時追蹤遺失 2 秒，重新出現時已站著，之後坐下", frames: [...SEAT, ...ramp(100, 168, 1200), ...hold(168, 500), ...LOST(2000), ...hold(168, 500), ...ramp(168, 100, 1500), ...hold(100, 600)], expected: 0, unconfirmed: true },
  { id: "S8", label: "一開始就站著入鏡（沒看到坐姿），之後坐下", frames: [...hold(168, 800), ...ramp(168, 100, 1500), ...hold(100, 600)], expected: 0, unconfirmed: true },
  { id: "S9", label: "站立時膝角在 145–160° 間晃動（同一次動作）", frames: [...SEAT, ...ramp(100, 168, 1200), ...hold(168, 400), ...[145, 150, 158, 146, 152, 160, 147, 165, 165, 165], ...ramp(165, 100, 1500), ...hold(100, 600)], expected: 1 },
  { id: "S10", label: "連續 5 次正常坐站", frames: [...SEAT, ...rep(), ...rep(), ...rep(), ...rep(), ...rep()], expected: 5 },
  { id: "S11", label: "連續 3 次：正常、約 12 秒慢速、正常", frames: [...SEAT, ...rep(), ...rep({ rise: 5000, stand: 3000, lower: 6000 }), ...rep()], expected: 3 },
  { id: "S12", label: "起身中短暫遺失 0.6 秒（低於 1.2 秒容許）後完成，正常速度", frames: [...SEAT, ...ramp(100, 140, 600), ...LOST(600), ...ramp(140, 168, 600), ...hold(168, 600), ...ramp(168, 100, 1500), ...hold(100, 600)], expected: 1 },
  // S13: engineering policy (not a definition) — a cycle beyond MAX_REP_DURATION_MS that also had a tracking gap cannot be confirmed
  { id: "S13", label: "慢速約 12 秒，其中起身時短暫遺失 0.6 秒（工程政策：無法確認）", frames: [...SEAT, ...ramp(100, 140, 2500), ...LOST(600), ...ramp(140, 168, 2500), ...hold(168, 2400), ...ramp(168, 100, 6000), ...hold(100, 600)], expected: 0, unconfirmed: true },
];

export function runCase(createSession, c) {
  const s = createSession({ targetReps: 99 });
  let t = 0, counted = 0, unconfirmed = 0;
  for (const k of c.frames) {
    t += STEP;
    const r = k == null ? s.processFrame({ timestamp: t, bodyReady: false }) : s.processFrame({ timestamp: t, averageKneeAngle: k, trunkLeanDeg: 12, kneeAsymmetryDeg: 3, kneeValgus: false, bodyReady: true });
    if (r.repCompleted) counted += 1;
    if (r.unconfirmedAttempt) unconfirmed += 1;
  }
  const sum = s.getSummary();
  return { counted, total: sum.totalReps, unconfirmed: sum.unconfirmedAttemptCount ?? unconfirmed, durations: sum.repRecords.map((r) => r.durationMs) };
}
