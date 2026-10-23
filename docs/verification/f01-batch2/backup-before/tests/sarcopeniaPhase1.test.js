import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion Sarcopenia Redesign — Phase 1 (IA + data contracts) guards.
 *
 * Part 1 (behavioural): functionalAssessmentService's additive
 *   `assessmentType` discriminator — legacy shoulder compatibility, new
 *   five_times_sit_to_stand sessions, and type-filtered latest/hasCompleted
 *   queries.
 * Part 2 (behavioural): recommendationEngine ranking purity is unaffected
 *   by the new assessmentType context field on patientAssessments.
 * Part 3 (static): app.js readers that assumed "latest functionalAssessment
 *   == shoulder" now explicitly filter to SHOULDER; the new Phase 1 route
 *   skeletons are wired without disturbing existing routes.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};

const {
  functionalAssessmentService,
  FUNCTIONAL_ASSESSMENT_TYPES,
  resolveAssessmentType,
} = await import("../js/data/functionalAssessmentService.js");

// ── 1. existing shoulder session remains fully compatible ────────────
{
  const p = "sarc_p1";
  const created = functionalAssessmentService.create({ patientId: p, bodyRegion: "shoulder" }).session;
  assert.equal(created.assessmentType, FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER, "create({bodyRegion:'shoulder'}) auto-derives assessmentType, zero caller change needed");
  assert.equal(resolveAssessmentType(created), FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER);
  functionalAssessmentService.appendMovementResult(created.id, { movementId: "A01-1", assessmentMovementId: "A01", left: { completed: true } });
  functionalAssessmentService.completeSession(created.id, { problemId: "P-SH-01", protocolMovementIds: ["A01"] });
  const reread = functionalAssessmentService.getById(created.id);
  assert.equal(reread.status, "completed");
  assert.equal(reread.assessmentType, FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER, "assessmentType survives completeSession's additive patch untouched");
  assert.ok(Array.isArray(reread.movementResults) && reread.movementResults.length === 1, "existing movementResults behavior unchanged");
}

// ── 2. legacy shoulder session WITHOUT assessmentType remains readable ─
{
  const p = "sarc_p2_legacy";
  // Simulate a document persisted before this phase: no assessmentType field at all.
  const legacy = functionalAssessmentService.create({ patientId: p, bodyRegion: "shoulder" }).session;
  // Strip the field directly in the backing store to prove read-side compatibility
  // does not depend on create() having set it (a real pre-Phase-1 Firestore doc).
  const raw = JSON.parse(_store.get("remotion_collection_functionalAssessmentSessions"));
  const idx = raw.findIndex((s) => s.id === legacy.id);
  delete raw[idx].assessmentType;
  _store.set("remotion_collection_functionalAssessmentSessions", JSON.stringify(raw));

  const reread = functionalAssessmentService.getById(legacy.id);
  assert.ok(!("assessmentType" in reread) || reread.assessmentType === undefined, "legacy doc genuinely has no assessmentType field");
  assert.equal(resolveAssessmentType(reread), FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER, "legacy doc resolves as shoulder by fallback");
  functionalAssessmentService.completeSession(legacy.id, { problemId: "P-SH-02", protocolMovementIds: ["A02"] });
  assert.equal(functionalAssessmentService.hasCompletedByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER }), true,
    "a legacy no-assessmentType completed session is found by an explicit shoulder filter");
  assert.equal(functionalAssessmentService.hasCompletedByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }), false,
    "the same legacy session is NOT misclassified as a 5xSTS session");
  assert.deepEqual(
    functionalAssessmentService.getCompletedByPatientId(p).map((s) => s.id),
    functionalAssessmentService.getCompletedByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER }).map((s) => s.id),
    "no-filter query and explicit shoulder filter agree for a shoulder-only patient (pre-Phase-1 behavior preserved)"
  );
}

// ── 3. a new five_times_sit_to_stand session can be created/read independently ─
{
  const p = "sarc_p3";
  const fa = functionalAssessmentService.create({
    patientId: p,
    bodyRegion: "lower_limb",
    assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND,
  });
  assert.ok(!fa.error, "a lower_limb / five_times_sit_to_stand session is a valid create() call");
  assert.equal(fa.session.assessmentType, FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND);
  assert.equal(fa.session.bodyRegion, "lower_limb");

  const onlyFive = functionalAssessmentService.getByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND });
  assert.equal(onlyFive.length, 1);
  const onlyShoulder = functionalAssessmentService.getByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER });
  assert.equal(onlyShoulder.length, 0, "a 5xSTS session is invisible to a shoulder-filtered query");
  assert.equal(functionalAssessmentService.getByPatientId(p).length, 1, "unfiltered query still returns it (generalized, not hidden by default)");
}

// ── 4. latest-completed query can distinguish shoulder vs 5xSTS ──────
{
  const p = "sarc_p4";
  const shoulder = functionalAssessmentService.create({ patientId: p, bodyRegion: "shoulder" }).session;
  functionalAssessmentService.completeSession(shoulder.id, { problemId: "P-SH-01", protocolMovementIds: ["A01"] });

  const five = functionalAssessmentService.create({ patientId: p, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(five.id); // 5xSTS completion has no shoulder-specific problemId/protocolMovementIds

  const latestShoulder = functionalAssessmentService.getLatestCompletedByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER });
  const latestFive = functionalAssessmentService.getLatestCompletedByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND });
  assert.equal(latestShoulder.id, shoulder.id, "shoulder-filtered latest is the shoulder session, never the 5xSTS one");
  assert.equal(latestFive.id, five.id, "5xSTS-filtered latest is the 5xSTS session, never the shoulder one");
  assert.notEqual(latestShoulder.id, latestFive.id);
}

// ── 5. hasCompleted query can distinguish shoulder vs 5xSTS ──────────
{
  const p = "sarc_p5_five_only";
  const five = functionalAssessmentService.create({ patientId: p, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(five.id);
  assert.equal(functionalAssessmentService.hasCompletedByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.SHOULDER }), false,
    "a patient with ONLY a completed 5xSTS session has NOT completed a shoulder assessment");
  assert.equal(functionalAssessmentService.hasCompletedByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }), true);
  assert.equal(functionalAssessmentService.hasCompletedByPatientId(p), true, "unfiltered hasCompleted is still true (some assessment exists)");
}

// ── 6. recommendation ranking is unaffected by the new assessmentType context ─
{
  const { generateRecommendationForAssessment, scoreExerciseForAssessment } = await import("../js/data/recommendationEngine.js");
  const mk = (id, over = {}) => ({
    exerciseId: id, name: id, bodyPart: "下肢", goal: "肌力", difficulty: "普通",
    aiSupported: false, sets: 1, reps: 10, duration: null, raw: { estimated_minutes: "5分鐘" }, ...over,
  });
  const candidates = [mk("LE-A"), mk("LE-B", { goal: "平衡" }), mk("LE-C", { difficulty: "難" })];
  const base = {
    id: "sarc_assess_1", updatedAt: "2026-09-16T00:00:00.000Z",
    bodyParts: ["下肢"], goals: ["肌力"], abilityLevel: "beginner", preferredSessionMinutes: 15,
  };
  const withSarcopeniaContext = {
    ...base,
    source: "assessment",
    assessmentType: "five_times_sit_to_stand",
    functionalAssessmentSessionId: "sarc_fa_1",
    bodyRegion: "lower_limb",
    // fake 5xSTS-shaped noise the task explicitly forbids from ranking
    totalTimeMs: 18500,
    repsCompleted: 5,
    qualityFlags: ["hand_support_suspected"],
    riskLevel: "high", // must NEVER be read by the engine even if a caller mistakenly attaches one
  };
  const opts = { patientId: "p1", assessmentId: "sarc_assess_1", dateStr: "2026-09-16" };
  const a = generateRecommendationForAssessment(base, candidates, opts);
  const b = generateRecommendationForAssessment(withSarcopeniaContext, candidates, opts);
  assert.deepEqual(
    b.items.map((it) => [it.exerciseId, it.score]),
    a.items.map((it) => [it.exerciseId, it.score]),
    "5xSTS assessment context (assessmentType, timing, quality flags) does not change ranking or scores"
  );
  for (const ex of candidates) {
    assert.equal(scoreExerciseForAssessment(ex, withSarcopeniaContext).score, scoreExerciseForAssessment(ex, base).score);
  }
}

// ── app.js: static reader-audit + route-skeleton checks ──────────────
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle, span = 6000) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + span : end + 2);
};

// ── 7. therapist-side reader never passes a 5xSTS session into buildShoulderAssessmentFindings ─
{
  const detail = sliceFn("function therapistCaseDetailPage()", 10000);
  const shoulderFilteredCalls = (detail.match(/getLatestCompletedByPatientId\(patientId, \{ assessmentType: FUNCTIONAL_ASSESSMENT_TYPES\.SHOULDER \}\)/g) || []).length;
  assert.equal(shoulderFilteredCalls, 2, "both 總覽 and 功能評估 tabs explicitly filter to SHOULDER before building shoulder findings");
  assert.ok(!/getLatestCompletedByPatientId\(patientId\)[\s\S]{0,80}buildShoulderAssessmentFindings/.test(detail),
    "no unfiltered getLatestCompletedByPatientId call feeds buildShoulderAssessmentFindings");
}
// Home unlock/result CTA is also explicitly shoulder-filtered.
{
  const goLatest = sliceFn("function goLatestFunctionalAssessmentResult()");
  assert.ok(/getLatestCompletedByPatientId\(patientId, \{ assessmentType: FUNCTIONAL_ASSESSMENT_TYPES\.SHOULDER \}\)/.test(goLatest),
    "Home '評估結果' CTA only ever opens a completed SHOULDER session");
  const home = appJs.slice(appJs.indexOf("hasCompletedFunctionalAssessment ="), appJs.indexOf("hasCompletedFunctionalAssessment =") + 400);
  assert.ok(/hasCompletedByPatientId\(patientId, \{ assessmentType: FUNCTIONAL_ASSESSMENT_TYPES\.SHOULDER \}\)/.test(home),
    "Home's 評估結果 unlock is gated on a completed SHOULDER session specifically");
  const resultPage = sliceFn("function functionalAssessmentShoulderResultPage()");
  assert.ok(/resolveAssessmentType\(rawSession\) === FUNCTIONAL_ASSESSMENT_TYPES\.SHOULDER/.test(resultPage),
    "the shoulder result page defensively refuses to render a non-shoulder session");
}

// ── 8. new route skeletons are reachable; existing routes untouched ──
{
  const dispatch = appJs.slice(appJs.indexOf("render = function()"), appJs.indexOf("render = function()") + 6500);
  for (const route of ["sarcopeniaScreening", "fiveTimesSitToStandAssessment", "fiveTimesSitToStandResult", "functionalChangeTrend"]) {
    assert.ok(new RegExp(`state\\.route === "${route}"`).test(dispatch), `route "${route}" is wired into render()`);
  }
  // a sample of pre-existing routes must still be present, byte-identical in shape
  for (const route of ["dashboard", "functionalAssessmentBodyRegion", "functionalAssessmentShoulderResult", "caseDetail", "trainingRecordDetail"]) {
    assert.ok(new RegExp(`state\\.route === "${route}"`).test(dispatch), `pre-existing route "${route}" still dispatched`);
  }
  // every new page renderer + nav fn exists and is window-exposed for its inline onclick chain
  for (const fn of ["goSarcopeniaScreening", "goFiveTimesSitToStandAssessment", "goFiveTimesSitToStandResult", "goFunctionalChangeTrend"]) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(appJs), `${fn}() is defined`);
    assert.ok(new RegExp(`window\\.${fn} = ${fn};`).test(appJs), `window.${fn} is exposed`);
  }
  // Phase 2.1 — only sarcopeniaScreeningPage/functionalChangeTrendPage remain
  // deliberate skeletons; fiveTimesSitToStandAssessmentPage/ResultPage are
  // now real (checked separately below).
  for (const pageFn of ["sarcopeniaScreeningPage", "functionalChangeTrendPage"]) {
    const body = sliceFn(`function ${pageFn}()`);
    assert.ok(body.includes("建置中"), `${pageFn}() clearly communicates it is under development`);
    assert.ok(!/\d+\s*(秒|分鐘|次|分)</.test(body), `${pageFn}() does not render a fabricated numeric result`);
  }
  // existing shoulder / self-rehab entries remain reachable, untouched
  assert.ok(/onclick="goFunctionalAssessmentBodyRegion\(\)"/.test(appJs), "existing shoulder/region assessment entry (Option A) still reachable");
  assert.ok(/onclick="goSelfRehabEntry\(\)"/.test(appJs), "existing 開始自主復健 entry still reachable");
}

// ── 9. Phase 2.1 — F01 "A" leads straight into the real 5xSTS assessment ─
{
  const f01 = sliceFn("function f01LowerLimbHomePage()");
  assert.ok(/onclick="goFiveTimesSitToStandAssessment\(\)"/.test(f01), 'F01 "A｜先進行功能評估" opens the 5xSTS assessment explanation directly');
  assert.ok(!/onclick="goSarcopeniaScreening\(\)"/.test(appJs), "goSarcopeniaScreening() is no longer wired to any onclick (kept as a function, not in the primary click path)");

  const assessmentPage = sliceFn("function fiveTimesSitToStandAssessmentPage()");
  assert.ok(!assessmentPage.includes("建置中"), "fiveTimesSitToStandAssessmentPage() is no longer a skeleton");
  assert.ok(/onclick="goFiveTimesSitToStandDetection\(\)"/.test(assessmentPage), "its CTA opens the real detection route");

  const dispatch = appJs.slice(appJs.indexOf("render = function()"), appJs.indexOf("render = function()") + 6500);
  assert.ok(/state\.route === "fiveTimesSitToStandDetection"/.test(dispatch), "fiveTimesSitToStandDetection route is wired into render()");
  assert.ok(/function goFiveTimesSitToStandDetection\(\)/.test(appJs) && /window\.goFiveTimesSitToStandDetection = goFiveTimesSitToStandDetection;/.test(appJs),
    "goFiveTimesSitToStandDetection() is defined and window-exposed");

  // 5xSTS Phase B — Assessment Mode has its OWN protocol state machine
  // (js/ai/exercises/sitToStand/assessmentSession.js) instead of reusing the
  // Training FSM; it still shares the knee/trunk metric function via
  // assessmentFeatures.js (no re-derived metrics).
  const detectionBlock = appJs.slice(appJs.indexOf("function fiveTimesSitToStandDetectionPage()"), appJs.indexOf("function goFunctionalChangeTrend()"));
  assert.ok(/createFiveTimesSitToStandAssessment\(\)/.test(appJs.slice(appJs.indexOf("function goFiveTimesSitToStandDetection()"))), "assessment mode creates its own assessment session");
  assert.ok(!/createSitToStandSession\(/.test(detectionBlock), "assessment mode no longer runs the Training FSM");
  assert.ok(/extractFa5xFeatures\(/.test(detectionBlock), "assessment mode extracts features via assessmentFeatures.js");
  const featuresSrc = readFileSync(join(root, "js/ai/exercises/sitToStand/assessmentFeatures.js"), "utf8");
  assert.ok(/computeSitToStandMetrics\(/.test(featuresSrc), "knee angle / trunk lean still come from the shared computeSitToStandMetrics()");
  assert.equal((appJs.match(/function createSitToStandSession/g) || []).length, 0, "createSitToStandSession is only ever imported in app.js, never redefined (single source of truth stays js/ai/exercises/sitToStand/session.js)");

  // Assessment Mode is not a training session — fixed 5 reps, no manual finish/save button.
  const assessmentConstantsSrc = readFileSync(join(root, "js/ai/exercises/sitToStand/assessmentConstants.js"), "utf8");
  assert.ok(/export const FA5X_TARGET_REPS = 5;/.test(assessmentConstantsSrc), "5xSTS assessment target is fixed at exactly 5 reps");
  const detectionPageBody = sliceFn("function fiveTimesSitToStandDetectionPage()");
  assert.ok(!/finalizeFa5xAssessment\(\)/.test(detectionPageBody), "no inline onclick manually triggers finalization — completion is automatic only");
  assert.ok(!detectionPageBody.includes("結束並儲存"), "no manual 結束並儲存 (training-style) button in Assessment Mode");

  // Training Mode (F01 -> B -> LE05) is completely untouched.
  assert.ok(/function goLe05Detection\(\)/.test(appJs) && /function le05DetectionPage\(\)/.test(appJs) && /function finalizeLe05Training\(\)/.test(appJs),
    "Training Mode's le05 functions are all still defined, unmodified");
  assert.ok(/state\.route === "le05Detection"/.test(dispatch), "le05Detection (Training Mode) route is still dispatched");
}

// ── 10. Phase 2.1 — completeSession()'s additive `result` param round-trips ─
{
  const p = "sarc_p6_result";
  const fa = functionalAssessmentService.create({ patientId: p, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  const result = { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND, mode: "assessment_5xsts", repCount: 5, totalDurationMs: 14200, repDurationsMs: [2400, 2600, 2900, 3000, 3300] };
  functionalAssessmentService.completeSession(fa.id, { result });
  const reread = functionalAssessmentService.getLatestCompletedByPatientId(p, { assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND });
  assert.deepEqual(reread.result, result, "the result payload round-trips through completeSession()/getLatestCompletedByPatientId() untouched");
  assert.equal(reread.status, "completed");
  // shoulder's completeSession({problemId, protocolMovementIds}) call shape is unaffected by the new optional `result` param.
  const sh = functionalAssessmentService.create({ patientId: "sarc_p6_sh", bodyRegion: "shoulder" }).session;
  functionalAssessmentService.completeSession(sh.id, { problemId: "P-SH-01", protocolMovementIds: ["A01"] });
  const shReread = functionalAssessmentService.getById(sh.id);
  assert.equal(shReread.problemId, "P-SH-01");
  assert.ok(!("result" in shReread), "a shoulder completion with no result param never gains a result field");
}

console.log("Sarcopenia Redesign Phase 1 (IA + data contracts) guards passed");
