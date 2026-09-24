import {
  getShoulderProblem,
  getShoulderAssessmentMovement,
  SHOULDER_ASSESSMENT_MOVEMENTS,
} from "./shoulderAssessmentProtocol.js";

/**
 * ReMotion Phase 7.5 — Shoulder Assessment Finding / Result layer (V1).
 *
 * Pure, DOM-free, app.js-free. Turns raw persisted `movementResults`
 * (functionalAssessmentService) into a normalized, patient-safe report
 * model the Result Page renders directly. Interpretation rules live HERE,
 * never inside Result Page HTML.
 *
 * *** STRICT CLINICAL SAFETY BOUNDARY (task section 5) ***
 * V1 emits MEASUREMENT FACTS ONLY. It must never produce:
 *   - "< X deg = limited" / "> X deg difference = abnormal"
 *   - normal / abnormal / mild / moderate / severe
 *   - frozen shoulder / rotator cuff / adhesive capsulitis / any diagnosis
 * It must not require 180 deg as "normal", and must not turn the
 * detector's ENGINEERING thresholds into clinical ones. Where a clinical
 * interpretation has no locked rule, report the measured number instead.
 *
 * Legacy compatibility: prefer `movementResult.assessmentMovementId`
 * ("A01"/"A02"); fall back to the legacy storage `movementId`
 * ("A01-1" -> A01, "A01-2" -> A02) or `movementName`. No migration.
 */

export const SHOULDER_FINDINGS_DISCLAIMER =
  "本結果為動作量測與功能表現紀錄，不作為疾病診斷依據。";

const SIDE_LABEL = { LEFT: "左側", RIGHT: "右側" };

/** Round to 1dp, or null. */
function round1(v) {
  return typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10) / 10 : null;
}

/** Legacy-tolerant: which conceptual Assessment Movement (A01/A02/A03) is this raw result? */
export function assessmentMovementIdOf(movementResult) {
  if (!movementResult) return null;
  if (movementResult.assessmentMovementId) return movementResult.assessmentMovementId;
  const legacy = { "A01-1": "A01", "A01-2": "A02" };
  if (movementResult.movementId && legacy[movementResult.movementId]) return legacy[movementResult.movementId];
  const byName = { shoulder_flexion: "A01", shoulder_abduction: "A02", shoulder_shrug: "A03" };
  if (movementResult.movementName && byName[movementResult.movementName]) return byName[movementResult.movementName];
  return null;
}

/**
 * COMPATIBILITY FALLBACK ONLY — for legacy sessions with no persisted
 * `problemId`. Newly completed sessions always store the selected P-SH-*
 * problem (task section 2), so this is never used for them.
 */
export function deriveProblemIdFromMovementResults(movementResults) {
  const ids = new Set((movementResults || []).map(assessmentMovementIdOf).filter(Boolean));
  const has = (x) => ids.has(x);
  if (has("A01") && has("A02")) return "P-SH-03";
  if (has("A01")) return "P-SH-01";
  if (has("A02")) return "P-SH-02";
  return null;
}

/** Per-side engineering data-quality bucket: usable | partial | insufficient. NOT a clinical confidence, NOT a percentage. */
function sideDataQuality(sideResult) {
  if (!sideResult) return "insufficient";
  const q = sideResult.measurementQuality || {};
  const peak = sideResult.peakROM && sideResult.peakROM.deg;
  if (sideResult.completed === true && q.valid === true && typeof peak === "number") return "usable";
  if (typeof peak === "number" && (sideResult.status === "stopped" || sideResult.completed === true)) return "partial";
  return "insufficient";
}

function worstQuality(a, b) {
  const rank = { usable: 0, partial: 1, insufficient: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function normalizeSide(sideResult) {
  const peak = round1(sideResult && sideResult.peakROM ? sideResult.peakROM.deg : null);
  return {
    peakRomDeg: peak,
    completed: !!(sideResult && sideResult.completed === true),
    statusReason: (sideResult && sideResult.statusReason) || null,
    dataQuality: sideDataQuality(sideResult),
  };
}

function normalizeMovement(movementResult) {
  const amId = assessmentMovementIdOf(movementResult);
  const registry = getShoulderAssessmentMovement(amId);
  const left = normalizeSide(movementResult && movementResult.left);
  const right = normalizeSide(movementResult && movementResult.right);

  let bilateralDifferenceDeg = null;
  let lowerMeasuredSide = null;
  if (typeof left.peakRomDeg === "number" && typeof right.peakRomDeg === "number") {
    bilateralDifferenceDeg = round1(Math.abs(left.peakRomDeg - right.peakRomDeg));
    if (left.peakRomDeg < right.peakRomDeg) lowerMeasuredSide = "LEFT";
    else if (right.peakRomDeg < left.peakRomDeg) lowerMeasuredSide = "RIGHT";
  }

  const dataQuality = worstQuality(left.dataQuality, right.dataQuality);
  return {
    assessmentMovementId: amId,
    movementName: (movementResult && movementResult.movementName) || (registry && registry.key) || null,
    label: registry ? registry.label : (movementResult && movementResult.movementName) || "肩部動作",
    legacyMovementId: (movementResult && movementResult.movementId) || null,
    left,
    right,
    bothSidesCompleted: left.completed && right.completed,
    bilateralDifferenceDeg,
    lowerMeasuredSide,
    dataQuality,
  };
}

/** V1 finding codes -> patient-safe copy. MEASUREMENT FACTS ONLY. */
function buildFindings(movements) {
  const findings = [];
  const allComplete = movements.length > 0 && movements.every((m) => m.bothSidesCompleted);
  const anyIncomplete = movements.some((m) => !m.bothSidesCompleted || m.dataQuality === "insufficient");

  if (allComplete) {
    findings.push({ code: "MEASUREMENT_COMPLETE", text: "本次左右側皆完成量測。" });
  }
  if (anyIncomplete) {
    findings.push({ code: "DATA_INCOMPLETE", text: "本次部分量測資料不足，建議重新進行評估。" });
  }
  for (const m of movements) {
    if (m.bilateralDifferenceDeg != null) {
      findings.push({
        code: "BILATERAL_DIFFERENCE_RECORDED",
        movementName: m.movementName,
        text: `本次${m.label}左右側量測角度相差約 ${m.bilateralDifferenceDeg}°。`,
      });
    }
    if (m.lowerMeasuredSide && m.bilateralDifferenceDeg != null) {
      const lower = SIDE_LABEL[m.lowerMeasuredSide];
      const higher = SIDE_LABEL[m.lowerMeasuredSide === "LEFT" ? "RIGHT" : "LEFT"];
      findings.push({
        code: "LOWER_MEASURED_SIDE",
        movementName: m.movementName,
        text: `本次${m.label}${lower}量測角度較${higher}小約 ${m.bilateralDifferenceDeg}°。`,
      });
    }
  }
  return findings;
}

/**
 * buildShoulderAssessmentFindings({ problemId, movementResults }) -> report.
 *
 * Only movements that belong to the selected Problem's Protocol are
 * included (so a P-SH-01 report shows Flexion only), in protocol order.
 * `problemId` should be the persisted P-SH-* id; if it is missing (legacy
 * session) a compatibility fallback derives it from the movement results.
 */
export function buildShoulderAssessmentFindings({ problemId, movementResults } = {}) {
  const results = Array.isArray(movementResults) ? movementResults : [];
  const resolvedProblemId = problemId || deriveProblemIdFromMovementResults(results);
  const problem = getShoulderProblem(resolvedProblemId);

  // protocol order (conceptual A01/A02...); fall back to whatever movements
  // are actually persisted, de-duplicated, if the problem is unknown.
  const orderedAmIds = problem
    ? problem.protocolMovementIds.filter((amId) => (getShoulderAssessmentMovement(amId) || {}).implemented !== false)
    : [...new Set(results.map(assessmentMovementIdOf).filter(Boolean))];

  const byAmId = new Map();
  for (const r of results) {
    const amId = assessmentMovementIdOf(r);
    if (amId && !byAmId.has(amId)) byAmId.set(amId, r);
  }

  const movements = orderedAmIds
    .map((amId) => (byAmId.has(amId) ? normalizeMovement(byAmId.get(amId)) : null))
    .filter(Boolean);

  const overallDataQuality = movements.reduce((acc, m) => worstQuality(acc, m.dataQuality), "usable");
  const findings = buildFindings(movements);

  return {
    bodyRegion: "shoulder",
    problemId: resolvedProblemId || null,
    problemTitle: problem ? problem.title : null,
    assessmentLabel: problem ? problem.assessmentLabel : "肩部功能",
    movements,
    summary: {
      completedMovementCount: movements.filter((m) => m.bothSidesCompleted).length,
      totalMovementCount: movements.length,
      allMeasurementsComplete: movements.length > 0 && movements.every((m) => m.bothSidesCompleted),
      overallDataQuality,
    },
    findings,
    dataQuality: overallDataQuality,
    disclaimer: SHOULDER_FINDINGS_DISCLAIMER,
  };
}

// re-export so app.js has one import site for the finding layer
export { SHOULDER_ASSESSMENT_MOVEMENTS };
