import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion Phase 7.6 (L2/L3) — Unified Self-Rehab Entry +
 * Assessment-to-Recommendation MVP guards.
 *
 * Two starting situations ("我有活動不適或功能困擾" / "我想直接開始自主訓練")
 * converge on the SAME recommendation engine and the SAME Today's Training
 * page. The V1 boundary: a completed Functional Assessment supplies the
 * body-region CONTEXT only — measurement values / ROM / bilateral
 * difference MUST NOT influence recommendation ranking.
 *
 * Part 1  pure: the engine's scoring inputs are exactly bodyParts / goals /
 *         abilityLevel / preferredSessionMinutes; ROM-shaped fields on the
 *         assessment object change nothing (Tests: same-engine, ROM-inert).
 * Part 2  behavioural: assessmentService.createAssessment persists the
 *         lightweight { source, functionalAssessmentSessionId } context and
 *         copies NO measurement data onto the record.
 * Part 3  static source: the unified entry + both paths + Result CTA +
 *         source-aware Today's Training are wired in app.js, and no copy
 *         claims ROM/受限程度 drives the plan.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// ── Part 1 — engine: body-region context only, ROM never ranks ──────
{
  const { generateRecommendationForAssessment, scoreExerciseForAssessment } = await import(
    "../js/data/recommendationEngine.js"
  );

  const mk = (id, over = {}) => ({
    exerciseId: id,
    name: id,
    bodyPart: "上肢功能",
    goal: "關節活動度",
    difficulty: "普通",
    aiSupported: false,
    sets: 1,
    reps: 10,
    duration: null,
    raw: { estimated_minutes: "5分鐘" },
    ...over,
  });
  const candidates = [
    mk("SH-A"),
    mk("SH-B", { goal: "肌力" }),
    mk("SH-C", { difficulty: "難" }),
    mk("OTHER", { bodyPart: "下肢功能" }),
  ];

  // The four canonical engine inputs — nothing else.
  const base = {
    id: "assess_1",
    updatedAt: "2026-09-02T00:00:00.000Z",
    bodyParts: ["上肢功能"],
    goals: ["關節活動度"],
    abilityLevel: "intermediate",
    preferredSessionMinutes: 15,
  };
  // Same assessment PLUS every assessment-derived measurement field the
  // adapter could ever attach later. V1 must ignore all of them.
  const withRom = {
    ...base,
    source: "assessment",
    functionalAssessmentSessionId: "fa_sess_1",
    romDeg: 92,
    peakRomDeg: 92,
    bilateralDifferenceDeg: 27,
    lowerMeasuredSide: "LEFT",
    dataQuality: "usable",
    findings: [{ code: "LOWER_MEASURED_SIDE", text: "..." }],
  };

  const opts = { patientId: "p1", assessmentId: "assess_1", dateStr: "2026-09-02" };
  const a = generateRecommendationForAssessment(base, candidates, opts);
  const b = generateRecommendationForAssessment(withRom, candidates, opts);

  assert.deepEqual(
    b.items.map((it) => [it.exerciseId, it.score]),
    a.items.map((it) => [it.exerciseId, it.score]),
    "ROM / bilateral-difference / findings on the assessment object do NOT change ranking or scores"
  );
  assert.ok(a.items.length > 0, "the shared engine still produces a session from body-region context alone");
  assert.ok(
    a.items.every((it) => it.bodyPart === "上肢功能"),
    "cross-region items are still hard-filtered out (body-region context is the only assessment-derived input)"
  );

  // per-exercise score is byte-identical with and without the ROM fields
  for (const ex of candidates) {
    const s1 = scoreExerciseForAssessment(ex, base).score;
    const s2 = scoreExerciseForAssessment(ex, withRom).score;
    assert.equal(s2, s1, `scoreExerciseForAssessment ignores ROM fields for ${ex.exerciseId}`);
  }
}

// ── Part 2 — assessmentService persists CONTEXT, not measurements ────
{
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
  };
  const { assessmentService } = await import("../js/data/assessmentService.js");

  const fromAssessment = assessmentService.createAssessment({
    patientId: "sr_p1",
    createdBy: "sr_p1",
    bodyParts: ["上肢功能"],
    goals: ["關節活動度"],
    abilityLevel: "beginner",
    preferredSessionMinutes: 10,
    source: "assessment",
    functionalAssessmentSessionId: "fa_sess_42",
    // even if a caller wrongly passes measurement-ish keys, they must not persist
    romDeg: 88,
    bilateralDifferenceDeg: 19,
  }).assessment;

  assert.equal(fromAssessment.source, "assessment");
  assert.equal(fromAssessment.functionalAssessmentSessionId, "fa_sess_42", "only a REFERENCE id is stored");
  for (const banned of ["romDeg", "peakRomDeg", "bilateralDifferenceDeg", "movementResults", "findings", "lowerMeasuredSide"]) {
    assert.ok(!(banned in fromAssessment), `assessment record must not carry measurement field "${banned}"`);
  }
  // canonical engine inputs intact
  assert.deepEqual(fromAssessment.bodyParts, ["上肢功能"]);
  assert.equal(fromAssessment.abilityLevel, "beginner");
  assert.equal(fromAssessment.preferredSessionMinutes, 10);

  // direct path — no assessment reference at all
  const direct = assessmentService.createAssessment({
    patientId: "sr_p2",
    createdBy: "sr_p2",
    bodyParts: ["下肢功能"],
    goals: ["肌力"],
    abilityLevel: "intermediate",
    preferredSessionMinutes: 20,
    source: "direct",
  }).assessment;
  assert.equal(direct.source, "direct");
  assert.equal(direct.functionalAssessmentSessionId, null, "direct path stores no functional-assessment reference");

  // pre-7.6 call site (no source arg) still works and defaults cleanly
  const legacy = assessmentService.createAssessment({
    patientId: "sr_p3",
    createdBy: "sr_p3",
    bodyParts: ["功能性移動"],
    goals: ["肌力"],
    abilityLevel: "beginner",
    preferredSessionMinutes: 15,
  }).assessment;
  assert.equal(legacy.source, null);
  assert.equal(legacy.functionalAssessmentSessionId, null);
}

// ── Part 3 — app.js wiring ─────────────────────────────────────────
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected to find ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + 4000 : end + 2);
};
const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

// A. one unified entry route + page, with the locked copy + two choice cards
assert.ok(
  /state\.route === "selfRehabEntry"\) app\.innerHTML = phone\(selfRehabEntryPage\(\)/.test(appJs),
  "selfRehabEntry route is dispatched in render()"
);
{
  const page = sliceFn("function selfRehabEntryPage()");
  assert.ok(page.includes("開始自主復健"), "entry heading");
  assert.ok(
    page.includes("依目前身體狀況與訓練需求，安排適合你的復健內容。"),
    "entry supporting copy (locked)"
  );
  assert.ok(page.includes("我有活動不適或功能困擾"), "Option A card");
  assert.ok(page.includes("我想直接開始自主訓練"), "Option B card");
  assert.ok(/onclick="startSelfRehabAssessmentPath\(\)"/.test(page), "Option A -> assessment path");
  assert.ok(/onclick="startSelfRehabDirectPath\(\)"/.test(page), "Option B -> direct path");
}

// B. Option A goes through the EXISTING functional assessment; Option B
//    into the EXISTING full questionnaire (body-region step included).
{
  const a = sliceFn("function startSelfRehabAssessmentPath()");
  assert.ok(/state\.recommendationEntrySource = "assessment"/.test(a));
  assert.ok(/goFunctionalAssessmentBodyRegion\(\)/.test(a), "reuses the existing assessment entry, no new assessment flow");

  const b = sliceFn("function startSelfRehabDirectPath()");
  assert.ok(/state\.recommendationEntrySource = "direct"/.test(b));
  assert.ok(/state\.assessmentFormStep = 1/.test(b), "direct path starts at step 1 (asks body region)");
  assert.ok(/state\.route = "patientAssessmentForm"/.test(b), "direct path enters the existing questionnaire");
}

// C. the Assessment Result page carries the CTA into recommendation, and
//    the recommendation entry pre-supplies the shoulder body region
//    WITHOUT re-asking it (starts at step 2).
{
  const rp = sliceFn("function functionalAssessmentShoulderResultPage()");
  assert.ok(
    /onclick="startRecommendationFromAssessment\('\$\{session\.id\}'\)">取得個人化復健建議/.test(rp),
    'Result page has the "取得個人化復健建議" CTA wired to startRecommendationFromAssessment(session.id)'
  );

  const s = sliceFn("function startRecommendationFromAssessment(");
  assert.ok(/state\.recommendationEntrySource = "assessment"/.test(s));
  assert.ok(/bodyParts: \["上肢功能"\]/.test(s), "shoulder body region (category 上肢功能) pre-supplied");
  assert.ok(/state\.assessmentFormStep = 2/.test(s), "body-region step is skipped (starts at step 2)");
  assert.ok(
    /functionalSessionId \|\| state\.shoulderResultSessionId/.test(s),
    "only a session REFERENCE is carried, never measurement data"
  );
}

// D. the assessment-sourced questionnaire shows the body region as fixed
//    context and never re-asks it; the dots collapse to steps 2-4.
{
  const dots = sliceFn("function assessmentStepDots(");
  assert.ok(
    /state\.recommendationEntrySource === "assessment" \? \[2, 3, 4\] : \[1, 2, 3, 4\]/.test(dots),
    "assessment path renders only steps 2-4"
  );
  const form = sliceFn("function patientAssessmentFormPage()");
  assert.ok(/state\.recommendationEntrySource === "assessment"/.test(form));
  assert.ok(/評估部位：肩部/.test(form), "fixed body-region context is shown instead of the selector");

  const prev = sliceFn("function goAssessmentPrevStep()");
  assert.ok(/minStep = src === "assessment" \? 2 : 1/.test(prev), "assessment path cannot step back into body-region");
}

// E. confirmAssessment persists the context and BOTH paths converge on the
//    same Today's Training route (todaysRecommendation) via the same engine.
{
  const c = sliceFn("function confirmAssessment()");
  assert.ok(/source: entrySource \|\| null/.test(c), "recommendation source persisted onto the assessment record");
  assert.ok(
    /functionalAssessmentSessionId: entrySource === "assessment"/.test(c) && /state\.recommendationFunctionalSessionId \|\| null/.test(c),
    "functional-assessment reference persisted only for the assessment path"
  );
  // 7.6.2 — additive assessment context (reference/metadata only, never ROM)
  assert.ok(/problemId: ctx \? ctx\.problemId \|\| null : null/.test(c), "selected P-SH-* problem persisted");
  assert.ok(/assessmentMovementIds: ctx \? \(ctx\.movements \|\| \[\]\)\.map\(\(m\) => m\.assessmentMovementId\) : null/.test(c),
    "protocol movement ids persisted (titles resolved at render, no movementResults copied)");
  assert.ok(
    /if \(entrySource\) \{\s*\n\s*state\.route = "todaysRecommendation"/.test(c),
    "a self-rehab flow (either path) lands on the existing Today's Training page"
  );
}
// exactly ONE recommendation engine + one orchestration entry point.
assert.ok(
  (appJs.match(/from "\.\/js\/data\/recommendationEngine\.js"/g) || []).length === 1,
  "app.js imports the single recommendation engine module once"
);
assert.ok(
  !/generateRecommendationForAssessment\s*\(/.test(appJs),
  "app.js never calls the engine directly — it goes through recommendationService.getTodaysRecommendation"
);
assert.ok(
  (appJs.match(/getTodaysRecommendationForPatient\(/g) || []).length >= 2 &&
    /recommendationService\.getTodaysRecommendation\(/.test(sliceFn("function getTodaysRecommendationForPatient(")),
  "both entry paths reach the same getTodaysRecommendationForPatient() -> recommendationService orchestration"
);

// F. Today's Training identifies the source and frames copy accordingly —
//    never claiming ROM / 受限程度 drives the plan.
{
  const page = sliceFn("function todaysRecommendationPage()");
  assert.ok(
    /const recSource = \(active && active\.source\) \|\| state\.recommendationEntrySource \|\| "direct"/.test(page),
    "source is read from the persisted assessment record (fallback: in-flight state)"
  );
  assert.ok(page.includes("根據本次功能評估與你的訓練需求，為你安排今日練習。"), "assessment-source hero copy");
  assert.ok(page.includes("根據你設定的訓練需求，為你安排今日練習。"), "direct-source hero copy");
  assert.ok(/renderRecommendationBasisCard\(active, abilityLabel, recSource\)/.test(page), "basis card is source-aware");

  const basis = sliceFn("function renderRecommendationBasisCard(");
  assert.ok(/recSource === "assessment"/.test(basis));
  assert.ok(/評估部位：肩部/.test(basis), "assessment basis row: 評估部位：肩部");
  assert.ok(/訓練部位：/.test(basis), "direct basis row: 訓練部位：…");
  assert.ok(/可訓練時間：/.test(basis), "basis shows 可訓練時間");
}

// G. the V1 clinical boundary — no copy anywhere claims measurements rank the plan.
for (const banned of ["根據你的 ROM", "ROM 異常", "依功能受限程度", "受限程度推薦", "依你的量測角度", "依活動度受限"]) {
  assert.ok(!stripComments(appJs).includes(banned), `no ROM-drives-ranking copy: "${banned}"`);
}

// H. all inline handlers exposed to global scope (ES module -> onclick needs window.*).
for (const fn of [
  "goSelfRehabEntry",
  "startSelfRehabAssessmentPath",
  "startSelfRehabDirectPath",
  "startRecommendationFromAssessment",
]) {
  assert.ok(new RegExp(`window\\.${fn}\\s*=\\s*${fn}\\s*;`).test(appJs), `window.${fn} exposed for inline onclick`);
}

// I. Home unified-entry card points at the new entry, keeps the 評估結果 action.
{
  const home = appJs.slice(appJs.indexOf("const functionalAssessmentSectionHtml ="), appJs.indexOf("const functionalAssessmentSectionHtml =") + 1200);
  assert.ok(/onclick="goSelfRehabEntry\(\)"/.test(home), "Home primary CTA opens the unified self-rehab entry");
  assert.ok(home.includes("依目前身體狀況與訓練需求，安排適合你的復健內容。"), "Home supporting copy matches the entry");
  assert.ok(/functionalAssessmentResultActionHtml/.test(home), "the 評估結果 secondary action is still rendered");
}

// J. therapist-assigned flow is untouched.
assert.ok(/function assignPlanPage\(\)/.test(appJs), "assignPlanPage still present");
assert.ok(
  !/assignPlan[\s\S]{0,600}recommendationEntrySource/.test(appJs),
  "the therapist assign-plan path does not read the self-rehab recommendation source"
);

// K. no camera / FSM / MediaPipe change in this task — the frame handler
//    still feeds RAW landmarks straight to the measurement engines.
{
  const fh = appJs.slice(appJs.indexOf("function handleShoulderFrame(landmarks, timestamp)"));
  const fhBody = fh.slice(0, fh.indexOf("\nfunction "));
  assert.ok(
    /shoulderMovementMeasurement\.processFrame\(\{ timestamp, landmarks, bodyReady: true \}\)/.test(fhBody),
    "measurement still receives the untouched landmarks param (no new pre-processing)"
  );
}

console.log("Phase 7.6 unified self-rehab entry + assessment-to-recommendation guards passed");
