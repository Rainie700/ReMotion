import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Integration Phase 0 — six-domain team base (2026-09-24) + F01 / 5xSTS
 * feature line merged onto integration/remotion-six-domain-f01.
 * Guards the acceptance list: legacy analysisMode read-compat, F01 entry /
 * 5xSTS routes, series detectors, F01 source-of-truth spec file.
 */

// In-memory localStorage so analysisService (storageService) can run in Node.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const { LEGACY_ANALYSIS_MODE_MAP, resolveAnalysisMode, normalizeAnalysisRecord } = await import("../js/data/legacyAnalysisModes.js");
const { analysisService } = await import("../js/data/analysisService.js");

// ── 1. legacy analysisMode map is consistent with the current detectors ──
{
  const constantsText = readdirSync(join(root, "js/ai/exercises"))
    .map((d) => join(root, "js/ai/exercises", d, "constants.js"))
    .filter(existsSync)
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
  const entries = Object.entries(LEGACY_ANALYSIS_MODE_MAP);
  assert.equal(entries.length, 35, "35 renamed detector modes");
  for (const [oldMode, newMode] of entries) {
    assert.ok(constantsText.includes(`"${newMode}"`), `${newMode} is a current detector ANALYSIS_MODE`);
    assert.ok(!constantsText.includes(`"${oldMode}"`), `${oldMode} is no longer produced by any detector`);
  }
  assert.equal(resolveAnalysisMode("mediapipe_le05_sit_to_stand"), "mediapipe_f01_04_sit_to_stand");
  assert.equal(resolveAnalysisMode("mediapipe_f01_04_sit_to_stand"), "mediapipe_f01_04_sit_to_stand", "current value passes through");
  assert.equal(resolveAnalysisMode("mediapipe_squat"), "mediapipe_squat", "unknown value passes through");
}

// ── 2. normalizeAnalysisRecord: read-side only, original kept ─────────────
{
  const legacy = { id: "r1", analysisMode: "mediapipe_le05_sit_to_stand", totalReps: 5 };
  const n = normalizeAnalysisRecord(legacy);
  assert.equal(n.analysisMode, "mediapipe_f01_04_sit_to_stand");
  assert.equal(n.legacyAnalysisMode, "mediapipe_le05_sit_to_stand");
  assert.equal(legacy.analysisMode, "mediapipe_le05_sit_to_stand", "input object is not mutated");
  const current = { id: "r2", analysisMode: "mediapipe_f01_04_sit_to_stand" };
  assert.equal(normalizeAnalysisRecord(current), current, "current records are returned as-is");
  assert.equal(normalizeAnalysisRecord(null), null);
}

// ── 3. analysisService reads normalize; storage keeps the original string ─
{
  analysisService.create({ id: "legacy-rec", patientId: "p-legacy", analysisMode: "mediapipe_hp01_straight_leg_raise" });
  assert.equal(analysisService.getById("legacy-rec").analysisMode, "mediapipe_f01_08_straight_leg_raise");
  assert.equal(analysisService.getByPatientId("p-legacy")[0].analysisMode, "mediapipe_f01_08_straight_leg_raise");
  assert.ok(analysisService.list().some((r) => r.id === "legacy-rec" && r.legacyAnalysisMode === "mediapipe_hp01_straight_leg_raise"));
  const stored = JSON.parse(localStorage.getItem("remotion_collection_analysisRecords")).find((r) => r.id === "legacy-rec");
  assert.equal(stored.analysisMode, "mediapipe_hp01_straight_leg_raise", "stored record is never rewritten");
}

// ── 4. F01 entry + 5xSTS routes are rendered and exposed ─────────────────
{
  const routes = [
    ["functionalDomainHome", "functionalDomainHomePage"],
    ["f01LowerLimbHome", "f01LowerLimbHomePage"],
    ["f01DirectTraining", "f01DirectTrainingPage"],
    ["fiveTimesSitToStandAssessment", "fiveTimesSitToStandAssessmentPage"],
    ["fiveTimesSitToStandDetection", "fiveTimesSitToStandDetectionPage"],
    ["fiveTimesSitToStandResult", "fiveTimesSitToStandResultPage"],
  ];
  for (const [route, page] of routes) {
    assert.ok(appJs.includes(`state.route === "${route}"`), `${route} is dispatched by render()`);
    assert.ok(appJs.includes(`function ${page}(`), `${page} exists`);
  }
  for (const fn of ["goFunctionalDomainHome", "goF01LowerLimbHome", "goF01DirectTraining", "goFiveTimesSitToStandAssessment",
    "goFiveTimesSitToStandDetection", "goFiveTimesSitToStandResult", "startRecommendationFromFiveTimesSitToStand", "startRecommendationFromAssessment"]) {
    assert.ok(appJs.includes(`window.${fn} = ${fn}`), `${fn} is window-exposed`);
  }
  assert.ok(/onclick="goFunctionalDomainHome\(\)"/.test(appJs), "Home links to the six-domain grid");
}

// ── 5. team series detectors still wired ─────────────────────────────────
{
  for (const route of ["f02Detection", "gaitDetection", "upperDetection", "flexDetection"]) {
    assert.ok(appJs.includes(`state.route==="${route}"`), `${route} route still dispatched`);
  }
  for (const dir of ["balanceSeries", "gaitSeries", "upperLimbSeries", "flexibilitySeries"]) {
    assert.ok(existsSync(join(root, "js/ai/exercises", dir, "session.js")), `${dir} detector present`);
  }
}

// ── 6. F01 source of truth is in the integration branch ─────────────────
assert.ok(existsSync(join(root, "docs/specs/ReMotion六大功能_復健資料庫_F01.xlsx")), "F01 spec workbook present");

console.log("Integration Phase 0 tests passed");
