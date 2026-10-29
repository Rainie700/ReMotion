/**
 * F01-04 sit-to-stand (training / 坐站練習) — DEVELOPER diagnostics only. Never rendered to the patient.
 *
 * traceLe05Frame() feeds one frame to a real createSitToStandSession() exactly the way the camera page does
 * (same metrics, same bodyReady gate, same thresholds) and returns what happened and why, so a replay of real
 * video can show where counting stops (no tracked frame, seat never observed, rise never reached, …).
 * summarizeLe05Trace() turns a list of those records into the numbers a dev log needs.
 */
import { computeSitToStandMetrics } from "./poseMath.js";
import { LE05_THRESHOLDS, LE05_REQUIRED_LANDMARKS } from "./constants.js";
import { hasFullLowerBody } from "../../poseMath.js";

const NAMES = { 11: "L_shoulder", 12: "R_shoulder", 23: "L_hip", 24: "R_hip", 25: "L_knee", 26: "R_knee", 27: "L_ankle", 28: "R_ankle" };
const vis = (p) => (p ? (p.visibility != null ? p.visibility : p.presence) : null);
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

/** Required LE05 joints below the visibility threshold (same rule as hasFullLowerBody), e.g. ["L_ankle", "R_ankle"]. */
export function le05MissingJoints(landmarks, t = LE05_THRESHOLDS) {
  if (!landmarks) return ["(no pose)"];
  return LE05_REQUIRED_LANDMARKS.filter((i) => { const v = vis(landmarks[i]); return !(v == null || v >= t.MIN_VISIBILITY); }).map((i) => NAMES[i]);
}

export function traceLe05Frame(session, landmarks, timestamp, t = LE05_THRESHOLDS) {
  const m = computeSitToStandMetrics(landmarks, t);
  const bodyReady = !!landmarks && hasFullLowerBody(landmarks, t, LE05_REQUIRED_LANDMARKS);
  const missing = le05MissingJoints(landmarks, t);
  const before = session.getGate();
  const res = session.processFrame({ timestamp, averageKneeAngle: m.averageKneeAngle, trunkLeanDeg: m.trunkLeanDeg, kneeAsymmetryDeg: m.kneeAsymmetryDeg, kneeValgus: false, bodyReady });
  const after = session.getGate();
  return {
    t: Math.round(timestamp),
    pose: !!landmarks,
    bodyReady,
    missing,
    minVis: landmarks ? r1(Math.min(...LE05_REQUIRED_LANDMARKS.map((i) => vis(landmarks[i]) ?? 1))) : null,
    kneeL: r1(m.leftKneeAngle), kneeR: r1(m.rightKneeAngle), knee: r1(m.averageKneeAngle),
    stateBefore: before.state, state: after.state, seatedObserved: after.seatedObserved,
    rep: res.repCompleted ? res.summary.totalReps : null,
    unconfirmed: res.unconfirmedAttempt ? res.unconfirmedAttempt.reason : null,
  };
}

export function summarizeLe05Trace(rows, t = LE05_THRESHOLDS) {
  const n = rows.length;
  const withPose = rows.filter((r) => r.pose);
  const ready = rows.filter((r) => r.bodyReady);
  const knees = ready.map((r) => r.knee).filter((k) => k != null);
  const missingCount = {};
  for (const r of rows) if (!r.bodyReady) for (const k of r.missing) missingCount[k] = (missingCount[k] || 0) + 1;
  const pct = (a) => (n ? Math.round((a / n) * 1000) / 10 : 0);
  const hist = {};
  for (const k of knees) { const b = `${Math.floor(k / 10) * 10}`; hist[b] = (hist[b] || 0) + 1; }
  const states = {};
  for (const r of rows) states[r.state] = (states[r.state] || 0) + 1;
  return {
    frames: n,
    poseFramesPct: pct(withPose.length),
    bodyReadyPct: pct(ready.length),
    kneeWhenReady: knees.length ? { min: Math.min(...knees), max: Math.max(...knees), framesAtOrBelowSeated: knees.filter((k) => k <= t.SEATED_KNEE_ANGLE_MAX_DEG).length, framesAtOrAboveRise: knees.filter((k) => k >= t.RISE_START_KNEE_ANGLE_MIN_DEG).length, histogram10deg: hist } : null,
    firstSeatedObservedAt: (rows.find((r) => r.seatedObserved) || {}).t ?? null,
    statesFrames: states,
    reps: rows.filter((r) => r.rep != null).map((r) => ({ t: r.t, rep: r.rep })),
    unconfirmed: rows.filter((r) => r.unconfirmed).map((r) => ({ t: r.t, reason: r.unconfirmed })),
    notReadyMissing: missingCount,
  };
}
