import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion 7.6.2 — Assessment → Recommendation CONTEXT loop guards.
 *
 * The context carries: source / functionalAssessmentSessionId / bodyRegion /
 * problemId / protocol movement ids+titles. It NEVER carries ROM / peak
 * angle / bilateral difference / lower side / findings / data quality, and
 * NONE of those can alter recommendation ranking in V1.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── protocol metadata resolves the 本次評估 movement titles (P-SH-01/02/03) ──
{
  const { getShoulderProblem, getShoulderAssessmentMovement } = await import("../js/data/shoulderAssessmentProtocol.js");
  const labelsFor = (problemId) =>
    getShoulderProblem(problemId).protocolMovementIds.map((id) => getShoulderAssessmentMovement(id).label);
  assert.deepEqual(labelsFor("P-SH-01"), ["肩關節前舉"], "P-SH-01 → 肩部 + 前舉");
  assert.deepEqual(labelsFor("P-SH-02"), ["肩關節外展"], "P-SH-02 → 肩部 + 外展");
  assert.deepEqual(labelsFor("P-SH-03"), ["肩關節前舉", "肩關節外展"], "P-SH-03 → 肩部 + 前舉、外展");
}

// ── assessmentService persists the reference context, never measurements ──
{
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
  };
  const { assessmentService } = await import("../js/data/assessmentService.js");

  const rec = assessmentService.createAssessment({
    patientId: "ctx_p1",
    createdBy: "ctx_p1",
    bodyParts: ["上肢肩部"],
    goals: ["關節活動度"],
    abilityLevel: "beginner",
    preferredSessionMinutes: 10,
    source: "assessment",
    functionalAssessmentSessionId: "fa_ctx_1",
    bodyRegion: "shoulder",
    problemId: "P-SH-03",
    assessmentMovementIds: ["A01", "A02"],
    // even if a caller wrongly passes measurement-ish keys they must NOT persist
    peakRomDeg: 92,
    bilateralDifferenceDeg: 27,
    findings: [{ code: "X" }],
  }).assessment;

  assert.equal(rec.source, "assessment");
  assert.equal(rec.functionalAssessmentSessionId, "fa_ctx_1");
  assert.equal(rec.bodyRegion, "shoulder");
  assert.equal(rec.problemId, "P-SH-03");
  assert.deepEqual(rec.assessmentMovementIds, ["A01", "A02"]);
  for (const banned of ["peakRomDeg", "romDeg", "bilateralDifferenceDeg", "movementResults", "findings", "lowerMeasuredSide", "dataQuality"]) {
    assert.ok(!(banned in rec), `assessment record must not carry measurement field "${banned}"`);
  }
  // canonical engine inputs intact
  assert.deepEqual(rec.bodyParts, ["上肢肩部"]);
  assert.equal(rec.abilityLevel, "beginner");
  assert.equal(rec.preferredSessionMinutes, 10);

  // direct-path record: no context fields
  const direct = assessmentService.createAssessment({
    patientId: "ctx_p2", createdBy: "ctx_p2", bodyParts: ["下肢"], goals: ["肌力"],
    abilityLevel: "intermediate", preferredSessionMinutes: 20, source: "direct",
  }).assessment;
  assert.equal(direct.problemId, null);
  assert.equal(direct.bodyRegion, null);
  assert.equal(direct.assessmentMovementIds, null);
}

// ── the engine ranks on bodyParts/goals/abilityLevel/preferredSessionMinutes ONLY ──
{
  const { generateRecommendationForAssessment, scoreExerciseForAssessment } = await import("../js/data/recommendationEngine.js");
  const mk = (id, over = {}) => ({
    exerciseId: id, name: id, bodyPart: "上肢肩部", goal: "關節活動度", difficulty: "普通",
    aiSupported: false, sets: 1, reps: 10, duration: null, raw: { estimated_minutes: "5分鐘" }, ...over,
  });
  const candidates = [mk("SH-A"), mk("SH-B", { goal: "肌力" }), mk("SH-C", { difficulty: "難" })];
  const base = {
    id: "ctx_a1", updatedAt: "2026-09-02T00:00:00.000Z",
    bodyParts: ["上肢肩部"], goals: ["關節活動度"], abilityLevel: "intermediate", preferredSessionMinutes: 15,
  };
  const withContextAndFakeRom = {
    ...base,
    source: "assessment", functionalAssessmentSessionId: "fa_ctx_1",
    bodyRegion: "shoulder", problemId: "P-SH-03", assessmentMovementIds: ["A01", "A02"],
    // fake measurement noise the task says must NOT influence ranking
    romDeg: 88, peakRomDeg: 88, bilateralDifferenceDeg: 27, lowerMeasuredSide: "LEFT",
    dataQuality: "usable", findings: [{ code: "LOWER_MEASURED_SIDE" }],
  };
  const opts = { patientId: "p1", assessmentId: "ctx_a1", dateStr: "2026-09-02" };
  const a = generateRecommendationForAssessment(base, candidates, opts);
  const b = generateRecommendationForAssessment(withContextAndFakeRom, candidates, opts);
  assert.deepEqual(
    b.items.map((it) => [it.exerciseId, it.score]),
    a.items.map((it) => [it.exerciseId, it.score]),
    "context + fake ROM/findings do NOT change ranking or scores"
  );
  for (const ex of candidates) {
    assert.equal(scoreExerciseForAssessment(ex, withContextAndFakeRom).score, scoreExerciseForAssessment(ex, base).score);
  }
}

// ── app.js wiring ──────────────────────────────────────────────────────
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + 5000 : end + 2);
};
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// context builder reads ONLY problem/protocol metadata, no measurements
{
  const b = stripComments(sliceFn("function buildAssessmentRecommendationContext("));
  assert.ok(/functionalAssessmentService\.getById\(functionalSessionId\)/.test(b), "resolves the completed session by reference");
  assert.ok(/getShoulderProblem\(problemId\)/.test(b) && /getShoulderAssessmentMovement\(id\)/.test(b), "movements from protocol metadata");
  assert.ok(/bodyRegion: fa\.bodyRegion \|\| "shoulder"/.test(b) && /problemId,/.test(b), "context carries bodyRegion + problemId");
  for (const banned of ["peakRomDeg", "peakROM", "bilateralDifference", "lowerMeasuredSide", "movementResults:", "dataQuality", "\.findings"]) {
    assert.ok(!b.includes(banned), `context builder never reads/copies "${banned}"`);
  }
}
{
  const s = sliceFn("function startRecommendationFromAssessment(");
  assert.ok(/state\.recommendationAssessmentContext = buildAssessmentRecommendationContext\(sessionId\)/.test(s),
    "startRecommendationFromAssessment resolves the context once");
}
{
  const c = sliceFn("function confirmAssessment()");
  assert.ok(/bodyRegion: ctx \? ctx\.bodyRegion \|\| null : null/.test(c), "persists bodyRegion from context");
  assert.ok(/problemId: ctx \? ctx\.problemId \|\| null : null/.test(c), "persists problemId from context");
  assert.ok(/assessmentMovementIds: ctx \? \(ctx\.movements \|\| \[\]\)\.map\(\(m\) => m\.assessmentMovementId\) : null/.test(c),
    "persists movement ids only");
}
// questionnaire keeps the fixed 肩部 context + the required copy
{
  const form = sliceFn("function patientAssessmentFormPage()");
  assert.ok(/評估部位：肩部/.test(form) && /已依本次功能評估帶入/.test(form), "form shows 評估部位：肩部 + 已依本次功能評估帶入");
}
// Today's Training basis card: 本次評估 row, movements only, no clinical language
{
  const card = stripComments(sliceFn("function renderRecommendationBasisCard("));
  assert.ok(/本次評估：\$\{moveLabels\.join\(" \/ "\)\}/.test(card), "assessment plan shows 本次評估：<movements>");
  assert.ok(/assessmentContextMovementLabels\(active\)/.test(card), "movement titles resolved from persisted ids / problem");
  assert.ok(/fromAssessment/.test(card), "the 本次評估 row only renders for source === 'assessment'");
  for (const banned of ["受限", "異常", "嚴重", "ROM", "peak", "角度"]) {
    assert.ok(!card.includes(banned), `basis card has no clinical/ROM language: "${banned}"`);
  }
  const resolver = stripComments(sliceFn("function assessmentContextMovementLabels("));
  assert.ok(/active\.assessmentMovementIds/.test(resolver) && /getShoulderProblem\(active\.problemId\)/.test(resolver),
    "labels come from persisted ids, falling back to the persisted problem's protocol");
  assert.ok(!/peakRom|bilateral|movementResults|findings/.test(resolver), "resolver never touches measurement data");
}

console.log("Assessment → Recommendation context loop guards passed");
