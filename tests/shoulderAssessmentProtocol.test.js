import assert from "node:assert/strict";
import {
  SHOULDER_PROBLEMS,
  SHOULDER_ASSESSMENT_MOVEMENTS,
  SHOULDER_SIDE_ORDER,
  getNextShoulderSide,
  getShoulderProblem,
  getShoulderAssessmentMovement,
  resolveProtocolMovements,
  isShoulderProblemStartable,
  getShoulderMovementVoiceLine,
  SHOULDER_MOVEMENT_VOICE,
  SHOULDER_FRAMING_LOSS_VOICE,
} from "../js/data/shoulderAssessmentProtocol.js";

/**
 * ReMotion Phase 7.4.1 (L2/L3) — Shoulder Assessment: Patient Problem /
 * Assessment Protocol / Assessment Movement. Pure module, fully unit
 * testable without app.js/DOM.
 */

// UI catalog stand-in (shape = app.js FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS).
// Note: `assessmentMovementId` (conceptual) is separate from `movementId`
// (legacy storage string). A03 has NO catalog entry (detector unbuilt).
const CATALOG = [
  { assessmentMovementId: "A01", movementId: "A01-1", key: "shoulder_flexion", view: "side", hasAdapter: true, label: "肩關節前舉" },
  { assessmentMovementId: "A02", movementId: "A01-2", key: "shoulder_abduction", view: "front", hasAdapter: true, label: "肩關節外展" },
];

// ── three concepts are kept separate ────────────────────────────────
{
  const ids = SHOULDER_PROBLEMS.map((p) => p.problemId);
  assert.deepEqual(ids, ["P-SH-01", "P-SH-02", "P-SH-03", "P-SH-04"], "the four internal Patient Problem ids");

  const amIds = SHOULDER_ASSESSMENT_MOVEMENTS.map((m) => m.assessmentMovementId);
  assert.deepEqual(amIds, ["A01", "A02", "A03"], "conceptual Assessment Movement registry: A01 / A02 / A03");
  assert.equal(getShoulderAssessmentMovement("A01").key, "shoulder_flexion");
  assert.equal(getShoulderAssessmentMovement("A02").key, "shoulder_abduction");
  assert.equal(getShoulderAssessmentMovement("A03").implemented, false, "A03 (Shrug) is not implemented");

  // Legacy STORAGE compatibility mapping is documented in the registry and
  // NOT the same as the conceptual id.
  assert.equal(getShoulderAssessmentMovement("A01").legacyStorageMovementId, "A01-1", "conceptual A01 <-> legacy storage 'A01-1'");
  assert.equal(getShoulderAssessmentMovement("A02").legacyStorageMovementId, "A01-2", "conceptual A02 <-> legacy storage 'A01-2'");
  assert.equal(getShoulderAssessmentMovement("A03").legacyStorageMovementId, null, "A03 has no persisted data");

  // The deprecated model is gone: A01 / A02 are NOT Patient Problem ids.
  assert.equal(getShoulderProblem("A01"), null, "'A01' is no longer a Patient Problem id");
  assert.equal(getShoulderProblem("A02"), null, "'A02' is no longer a Patient Problem id");
}

// ── A. P-SH-01 → Flexion only ──────────────────────────────────────
{
  const r = resolveProtocolMovements("P-SH-01", CATALOG);
  assert.deepEqual(r.map((m) => m.key), ["shoulder_flexion"], "P-SH-01 resolves to Flexion only");
  assert.equal(r.length, 1);
  assert.equal(r[1], undefined, "no second movement");
  assert.equal(getShoulderProblem("P-SH-01").assessmentLabel, "肩關節前舉");
}

// ── B. P-SH-02 → Abduction only ────────────────────────────────────
{
  const r = resolveProtocolMovements("P-SH-02", CATALOG);
  assert.deepEqual(r.map((m) => m.key), ["shoulder_abduction"], "P-SH-02 resolves to Abduction only");
  assert.equal(r.length, 1);
  assert.equal(r[1], undefined);
}

// ── C. P-SH-03 → Flexion → Abduction, in that exact order ──────────
{
  const r = resolveProtocolMovements("P-SH-03", CATALOG);
  assert.deepEqual(r.map((m) => m.key), ["shoulder_flexion", "shoulder_abduction"], "P-SH-03 = Flexion then Abduction, ordered");
  assert.deepEqual(r.map((m) => m.assessmentMovementId), ["A01", "A02"]);
}

// ── D. P-SH-04 is listed but NOT startable ─────────────────────────
{
  const p = getShoulderProblem("P-SH-04");
  assert.ok(p, "P-SH-04 exists (listed)");
  assert.equal(p.startable, false);
  assert.equal(p.unavailableLabel, "功能建置中");
  assert.equal(isShoulderProblemStartable("P-SH-04", CATALOG), false, "P-SH-04 cannot be started (Shrug unbuilt)");
  // even if A03 gained a catalog entry, startable:false + implemented:false still block it
  assert.equal(
    isShoulderProblemStartable("P-SH-04", [...CATALOG, { assessmentMovementId: "A03", movementId: "A03-x", key: "shoulder_shrug" }]),
    false,
    "still blocked"
  );
}

// startable flags for the three real problems
{
  assert.equal(isShoulderProblemStartable("P-SH-01", CATALOG), true);
  assert.equal(isShoulderProblemStartable("P-SH-02", CATALOG), true);
  assert.equal(isShoulderProblemStartable("P-SH-03", CATALOG), true);
  // partial resolution blocks start (defensive)
  assert.equal(isShoulderProblemStartable("P-SH-03", [CATALOG[0]]), false, "P-SH-03 needs BOTH movements to resolve");
  assert.equal(isShoulderProblemStartable("P-SH-01", []), false);
  assert.equal(isShoulderProblemStartable("P-SH-01", null), false);
  assert.equal(isShoulderProblemStartable("bogus", CATALOG), false);
}

// ── E. every startable protocol preserves RIGHT → LEFT ─────────────
{
  assert.deepEqual(SHOULDER_SIDE_ORDER, ["RIGHT", "LEFT"], "V1 fixed side order");
  assert.equal(getNextShoulderSide("RIGHT"), "LEFT");
  assert.equal(getNextShoulderSide("LEFT"), null, "after LEFT the side sequence is complete");
  for (const pid of ["P-SH-01", "P-SH-02", "P-SH-03"]) {
    // side order is protocol-independent — same for every movement in every startable protocol
    assert.equal(getNextShoulderSide("RIGHT"), "LEFT", `${pid}: RIGHT -> LEFT`);
    assert.equal(getNextShoulderSide("LEFT"), null, `${pid}: LEFT is last`);
  }
}

// ── F. single-movement protocol completes after LEFT, no 2nd movement ──
{
  // With 1 movement, index 0 is the last index -> app.js's
  // advanceFunctionalAssessmentShoulderMovement() goes straight to Complete
  // (no `index < length - 1`). Pure-side proof: the resolved list has no
  // index 1, and getNextShoulderSide(LEFT) is null.
  const r1 = resolveProtocolMovements("P-SH-01", CATALOG);
  assert.equal(r1.length, 1);
  assert.equal(0, r1.length - 1, "index 0 is the last movement index for a single-movement protocol");
  assert.equal(getNextShoulderSide("LEFT"), null, "after LEFT there is no next side -> movement complete");
}

// ── G. P-SH-03 reaches Abduction only after Flexion (order + index) ──
{
  const r = resolveProtocolMovements("P-SH-03", CATALOG);
  assert.equal(r[0].key, "shoulder_flexion", "movement index 0 = Flexion");
  assert.equal(r[1].key, "shoulder_abduction", "movement index 1 = Abduction (only reached by index++ after Flexion's LEFT)");
  assert.equal(r.length - 1, 1, "Abduction is the last movement index");
}

// ── H. no patient-facing copy contains internal ids ───────────────
{
  const patientText = SHOULDER_PROBLEMS.map((p) => p.title).join(" | ");
  for (const banned of ["A01", "A02", "A03", "P-SH", "protocol", "movementId", "assessmentMovementId"]) {
    assert.ok(!patientText.includes(banned), `Patient Problem title must not contain "${banned}"`);
  }
  // Patient Problem != Disease
  const allText = JSON.stringify(SHOULDER_PROBLEMS) + JSON.stringify(SHOULDER_MOVEMENT_VOICE);
  for (const d of ["五十肩", "肩袖", "旋轉肌", "關節炎", "沾黏", "撕裂", "normal", "abnormal"]) {
    assert.ok(!allText.includes(d), `no clinical/diagnostic term: ${d}`);
  }
}

// ── I. no hardcoded "exactly 2 movements" assumption in the module ──
{
  assert.equal(resolveProtocolMovements("P-SH-01", CATALOG).length, 1, "module handles a 1-movement protocol");
  assert.equal(resolveProtocolMovements("P-SH-03", CATALOG).length, 2, "module handles a 2-movement protocol");
  // protocol length is data, not a constant
  assert.equal(getShoulderProblem("P-SH-01").protocolMovementIds.length, 1);
  assert.equal(getShoulderProblem("P-SH-03").protocolMovementIds.length, 2);
}

// ── voice wording unchanged (regression) ─────────────────────────────
{
  assert.equal(getShoulderMovementVoiceLine("shoulder_flexion", "orientation", "RIGHT"), "請以右側身面向鏡頭。");
  assert.equal(getShoulderMovementVoiceLine("shoulder_flexion", "orientation", "LEFT"), "請轉身，讓左側身面向鏡頭。");
  assert.equal(getShoulderMovementVoiceLine("shoulder_abduction", "orientation", "RIGHT"), "請正面面向鏡頭。");
  assert.equal(getShoulderMovementVoiceLine("shoulder_abduction", "begin", "LEFT"), "請將左手從身體側邊慢慢向上抬起。");
  assert.equal(getShoulderMovementVoiceLine("shoulder_flexion", "movementDone"), "肩關節前舉評估完成。");
  assert.equal(SHOULDER_FRAMING_LOSS_VOICE, "目前無法完整偵測上半身，請調整站位。");
}

console.log("Phase 7.4.1 shoulder problem / protocol / movement-id tests passed");
