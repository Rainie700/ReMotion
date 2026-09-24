import assert from "node:assert/strict";
import {
  buildShoulderAssessmentFindings,
  deriveProblemIdFromMovementResults,
  assessmentMovementIdOf,
  SHOULDER_FINDINGS_DISCLAIMER,
} from "../js/data/shoulderAssessmentFindings.js";

/**
 * ReMotion Phase 7.5 (L2/L3) — Shoulder Assessment Finding/Result layer.
 * Pure module — measurement FACTS only, never a clinical classification.
 */

const mkSide = (deg, { completed = true, valid = true, status = "completed", statusReason = null } = {}) => ({
  side: "X",
  status,
  statusReason,
  completed,
  peakROM: { deg, fromNeutralDeg: deg - 3, atTimestampMs: 2000, elbowExtensionAngleDeg: 178 },
  neutralBaselineDeg: 3,
  measurementQuality: { valid, confidence: valid ? "high" : "low", coreAvailableFrameRatio: valid ? 1 : 0.4, frameCount: 30, hadTrackingLoss: false },
  observations: {},
});

const mkMovement = (amId, movementName, leftDeg, rightDeg, opts = {}) => ({
  movementId: amId === "A02" ? "A01-2" : "A01-1",
  assessmentMovementId: amId,
  movementName,
  view: movementName === "shoulder_abduction" ? "front" : "side",
  schemaVersion: 1,
  createdAt: "2026-09-02T10:00:00.000Z",
  savedAt: "2026-09-02T10:05:00.000Z",
  left: leftDeg == null ? { completed: false, status: "incomplete", statusReason: "trackingLost", peakROM: { deg: null } } : mkSide(leftDeg, opts.left),
  right: rightDeg == null ? { completed: false, status: "incomplete", statusReason: "trackingLost", peakROM: { deg: null } } : mkSide(rightDeg, opts.right),
  bilateral: { romDifferenceDeg: leftDeg != null && rightDeg != null ? Math.abs(leftDeg - rightDeg) : null },
});

const FLEX = mkMovement("A01", "shoulder_flexion", 142.3, 176.7);
const ABD = mkMovement("A02", "shoulder_abduction", 150.0, 158.0);

// ── A. P-SH-01 result contains Flexion only ─────────────────────────
{
  const r = buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [FLEX] });
  assert.equal(r.movements.length, 1);
  assert.equal(r.movements[0].movementName, "shoulder_flexion");
  assert.equal(r.movements[0].label, "肩關節前舉");
  assert.equal(r.problemTitle, "往前抬高手臂時不順或抬不高");
  assert.equal(r.bodyRegion, "shoulder");
  // only-protocol filter: even if abduction was somehow also persisted, P-SH-01 shows Flexion only
  const r2 = buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [FLEX, ABD] });
  assert.deepEqual(r2.movements.map((m) => m.movementName), ["shoulder_flexion"], "P-SH-01 renders Flexion only");
}

// ── B. P-SH-02 result contains Abduction only ───────────────────────
{
  const r = buildShoulderAssessmentFindings({ problemId: "P-SH-02", movementResults: [ABD] });
  assert.deepEqual(r.movements.map((m) => m.movementName), ["shoulder_abduction"]);
  assert.equal(r.movements[0].label, "肩關節外展");
}

// ── C. P-SH-03 result contains Flexion + Abduction, protocol order ──
{
  const r = buildShoulderAssessmentFindings({ problemId: "P-SH-03", movementResults: [ABD, FLEX] }); // input out of order
  assert.deepEqual(r.movements.map((m) => m.movementName), ["shoulder_flexion", "shoulder_abduction"], "protocol order, not input order");
  assert.deepEqual(r.movements.map((m) => m.assessmentMovementId), ["A01", "A02"]);
}

// ── D. bilateral difference is correct ─────────────────────────────
{
  const r = buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [FLEX] });
  assert.equal(r.movements[0].bilateralDifferenceDeg, 34.4, "|142.3 - 176.7| = 34.4");
  assert.equal(r.movements[0].left.peakRomDeg, 142.3);
  assert.equal(r.movements[0].right.peakRomDeg, 176.7);
}

// ── E. lower measured side is correct ─────────────────────────────
{
  assert.equal(buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [FLEX] }).movements[0].lowerMeasuredSide, "LEFT");
  const flipped = mkMovement("A01", "shoulder_flexion", 170.0, 140.0);
  assert.equal(buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [flipped] }).movements[0].lowerMeasuredSide, "RIGHT");
  const equalish = mkMovement("A01", "shoulder_flexion", 150.0, 150.0);
  assert.equal(buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [equalish] }).movements[0].lowerMeasuredSide, null, "no lower side when equal");
}

// ── F & G. no clinical classification / no disease diagnosis emitted ─
{
  const reports = [
    buildShoulderAssessmentFindings({ problemId: "P-SH-03", movementResults: [FLEX, ABD] }),
    buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [mkMovement("A01", "shoulder_flexion", null, 176.7)] }),
    buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [mkMovement("A01", "shoulder_flexion", 40, 42)] }), // low numbers must NOT trigger "limited"
  ];
  const banned = [
    "異常", "受限", "明顯不對稱", "不對稱", "正常", "輕度", "中度", "重度",
    "mild", "moderate", "severe", "abnormal", "normal", "limited",
    "frozen", "rotator", "adhesive", "五十肩", "旋轉肌", "肩袖", "關節炎", "沾黏", "撕裂",
  ];
  for (const r of reports) {
    // findings text + movement labels + summary — NOT the disclaimer
    const surface = JSON.stringify({ findings: r.findings, movements: r.movements, summary: r.summary });
    for (const b of banned) assert.ok(!surface.includes(b), `no "${b}" in emitted finding/measurement surface`);
    assert.equal(r.disclaimer, SHOULDER_FINDINGS_DISCLAIMER);
    assert.equal(r.disclaimer, "本結果為動作量測與功能表現紀錄，不作為疾病診斷依據。");
  }
}

// ── findings content (measurement facts) ──────────────────────────
{
  const r = buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [FLEX] });
  const codes = r.findings.map((f) => f.code);
  assert.ok(codes.includes("MEASUREMENT_COMPLETE"), "all sides completed -> MEASUREMENT_COMPLETE");
  assert.ok(codes.includes("BILATERAL_DIFFERENCE_RECORDED"));
  assert.ok(codes.includes("LOWER_MEASURED_SIDE"));
  assert.ok(!codes.includes("DATA_INCOMPLETE"));
  assert.ok(r.findings.some((f) => f.text === "本次左右側皆完成量測。"));
  assert.ok(r.findings.some((f) => f.text === "本次肩關節前舉左右側量測角度相差約 34.4°。"));
  assert.ok(r.findings.some((f) => f.text === "本次肩關節前舉左側量測角度較右側小約 34.4°。"));

  const incomplete = buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [mkMovement("A01", "shoulder_flexion", null, 176.7)] });
  const icodes = incomplete.findings.map((f) => f.code);
  assert.ok(icodes.includes("DATA_INCOMPLETE"));
  assert.ok(!icodes.includes("MEASUREMENT_COMPLETE"));
  assert.ok(incomplete.findings.some((f) => f.text === "本次部分量測資料不足，建議重新進行評估。"));
}

// ── data quality: usable | partial | insufficient (no % / no 醫療可信度) ─
{
  assert.equal(buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [FLEX] }).dataQuality, "usable");
  const stopped = mkMovement("A01", "shoulder_flexion", 120, 130, { left: { status: "stopped", completed: false, valid: false } });
  assert.equal(buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [stopped] }).movements[0].dataQuality, "partial");
  const missing = mkMovement("A01", "shoulder_flexion", null, 130);
  assert.equal(buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [missing] }).movements[0].dataQuality, "insufficient");
  const s = JSON.stringify(buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [FLEX] }));
  assert.ok(!s.includes("醫療可信度") && !/\d+%/.test(s), "no fabricated confidence percentage");
}

// ── L. legacy A01-1/A01-2 movementResults remain readable ─────────
{
  const legacyFlex = {
    movementId: "A01-1", // NO assessmentMovementId
    movementName: "shoulder_flexion",
    left: mkSide(140), right: mkSide(150),
    bilateral: { romDifferenceDeg: 10 },
  };
  assert.equal(assessmentMovementIdOf(legacyFlex), "A01", "legacy movementId A01-1 -> conceptual A01");
  assert.equal(assessmentMovementIdOf({ movementId: "A01-2" }), "A02");
  assert.equal(assessmentMovementIdOf({ movementName: "shoulder_abduction" }), "A02");
  const r = buildShoulderAssessmentFindings({ problemId: "P-SH-01", movementResults: [legacyFlex] });
  assert.equal(r.movements.length, 1);
  assert.equal(r.movements[0].assessmentMovementId, "A01");
  assert.equal(r.movements[0].bilateralDifferenceDeg, 10);
  // legacy session with NO persisted problemId -> compatibility fallback
  assert.equal(deriveProblemIdFromMovementResults([legacyFlex]), "P-SH-01");
  assert.equal(deriveProblemIdFromMovementResults([{ movementId: "A01-1" }, { movementId: "A01-2" }]), "P-SH-03");
  assert.equal(deriveProblemIdFromMovementResults([{ movementId: "A01-2" }]), "P-SH-02");
  assert.equal(deriveProblemIdFromMovementResults([]), null);
  const legacyReport = buildShoulderAssessmentFindings({ problemId: undefined, movementResults: [legacyFlex] });
  assert.equal(legacyReport.problemId, "P-SH-01", "no problemId -> derived from movement results (compat only)");
}

console.log("Phase 7.5 shoulder assessment findings / result layer tests passed");
