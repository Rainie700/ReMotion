import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { exerciseService, getDifficultyTier } from "../js/data/exerciseService.js";
import { generateRecommendationForAssessment } from "../js/data/recommendationEngine.js";
import {
  F01_FUNCTIONAL_DOMAIN,
  F01_EXERCISE_IDS,
  FIVE_X_STS_TRAINING_GOAL,
  SIT_TO_STAND_EXERCISE_ID,
  buildF01CandidatePool,
  buildF01RecommendationReason,
  getSitToStandPrimeMovers,
} from "../js/data/f01Recommendation.js";

/**
 * F01 Video MVP Phase 1 — 5xSTS Result -> 取得訓練建議 -> recommendation.
 * Unit checks on the pure F01 module + engine, and static (source-slicing)
 * guards on app.js wiring.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const f01Src = readFileSync(join(root, "js/data/f01Recommendation.js"), "utf8");
const sliceFn = (needle) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected to find ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end + 2);
};

const catalog = exerciseService.listNormalized();
const pool = buildF01CandidatePool(catalog);
const fa5xAssessment = (abilityLevel, preferredSessionMinutes) => ({
  id: "assessment-test",
  bodyParts: [F01_FUNCTIONAL_DOMAIN.label],
  goals: [FIVE_X_STS_TRAINING_GOAL],
  abilityLevel,
  preferredSessionMinutes,
  assessmentType: "five_times_sit_to_stand",
});

// ── 1. F01 pool: the six-domain F01-xx catalog rows, domain as bodyPart ──
{
  const catalogF01 = catalog.filter((ex) => ex.id.startsWith("F01-")).map((ex) => ex.id);
  assert.deepEqual(pool.map((ex) => ex.id), catalogF01, "pool is exactly the catalog's F01-xx rows, in catalog order");
  assert.equal(pool.length, 20, "all 20 F01 exercises are candidates");
  assert.ok(F01_EXERCISE_IDS.every((id) => /^F01-\d{2}$/.test(id)), "F01 main flow uses six-domain ids only");
  assert.equal(SIT_TO_STAND_EXERCISE_ID, "F01-04");
  pool.forEach((ex) => {
    assert.ok(F01_EXERCISE_IDS.includes(ex.id), `${ex.id} is an F01 id`);
    assert.ok(exerciseService.getById(ex.id), `${ex.id} exists in the real catalog`);
    assert.equal(ex.bodyPart, F01_FUNCTIONAL_DOMAIN.label);
  });
  assert.ok(!pool.some((ex) => ex.id.startsWith("SH")), "no shoulder exercise can enter the F01 pool");
}

// ── 2. goal tag is data-derived from 坐站's own target muscles ───────────
{
  const primeMovers = getSitToStandPrimeMovers(catalog);
  assert.deepEqual(primeMovers, ["股四頭肌", "臀大肌"], "prime movers come from the catalog 坐姿起立 (F01-04) row");
  const sts = pool.find((ex) => ex.id === SIT_TO_STAND_EXERCISE_ID);
  assert.equal(sts.goal, FIVE_X_STS_TRAINING_GOAL);
  assert.ok(sts.priorityBonus > 0 && sts.priorityBonus < 1, "assessed movement tie-break stays below every rule weight");
  pool.filter((ex) => ex.id !== SIT_TO_STAND_EXERCISE_ID).forEach((ex) => {
    assert.equal(ex.priorityBonus, undefined, `${ex.id} carries no priority bonus`);
    const shares = ex.f01.sharedPrimeMovers.length > 0;
    assert.equal(ex.goal, shares ? FIVE_X_STS_TRAINING_GOAL : null, `${ex.id} goal tag matches muscle overlap`);
  });
}

// ── 3. engine end-to-end over the F01 pool ──────────────────────────────
{
  for (const ability of ["beginner", "intermediate", "advanced"]) {
    const r = generateRecommendationForAssessment(fa5xAssessment(ability, 20), pool, { patientId: "p", dateStr: "2026-09-27" });
    assert.ok(r.items.length >= 3, `${ability}/20min yields a full session`);
    r.items.forEach((it) => {
      assert.ok(F01_EXERCISE_IDS.includes(it.exerciseId), `${it.exerciseId} is F01`);
      assert.ok(it.matchDetails, "engine items expose matchDetails");
      const tier = getDifficultyTier(it.difficulty);
      if (ability === "beginner") assert.notEqual(tier, "advanced", "beginner never gets advanced items");
      // Only the MAPPED tiers are excluded; 初階/中階/高階 rows are untiered
      // until the pending team decision (see section 4).
      if (ability === "advanced") assert.notEqual(tier, "beginner", "advanced never gets 易/非常容易 items");
    });
  }
  const beginner = generateRecommendationForAssessment(fa5xAssessment("beginner", 15), pool, { patientId: "p", dateStr: "2026-09-27" });
  assert.equal(beginner.items[0].exerciseId, SIT_TO_STAND_EXERCISE_ID, "beginner plan leads with the assessed movement");
}

// ── 4. difficulty tier map: team logic kept, 初階/中階/高階 PENDING DECISION ─
{
  assert.equal(getDifficultyTier("易"), "beginner", "existing labels unchanged");
  assert.equal(getDifficultyTier("普通"), "intermediate");
  for (const word of ["初階", "中階", "高階"]) {
    assert.equal(getDifficultyTier(word), null, `${word} intentionally unmapped until the team decides (affects 45/66 items)`);
  }
}

// ── 5. reason text is traceable ──────────────────────────────────────────
{
  const r = generateRecommendationForAssessment(fa5xAssessment("beginner", 20), pool, { patientId: "p", dateStr: "2026-09-27" });
  r.items.forEach((it) => {
    const reason = buildF01RecommendationReason(it, pool.find((p) => p.id === it.exerciseId), { abilityLabel: "初階" });
    const first = reason.split("。")[0];
    assert.ok(/坐站|目標肌群包含|F01 下肢功能/.test(first), `first sentence names the concrete basis: ${first}`);
  });
  const sts = pool.find((ex) => ex.id === SIT_TO_STAND_EXERCISE_ID);
  assert.ok(buildF01RecommendationReason({ matchDetails: {} }, sts).startsWith("與五次坐站評估為同一個起身動作"));
  assert.equal(buildF01RecommendationReason({}, null), null, "no candidate -> caller keeps engine reason");
}

// ── 6. no cutoff: the 5xSTS seconds never reach the F01 module or engine ─
{
  assert.ok(!/totalDurationMs|repDurationsMs|秒/.test(f01Src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), "f01Recommendation.js code never reads assessment seconds");
  const entry = sliceFn("function startRecommendationFromFiveTimesSitToStand(");
  assert.ok(!entry.includes("totalDurationMs"), "entry never reads the measured time");
  // Recommendation Phase C — the 5xSTS result no longer opens the Phase 1
  // questionnaire; it opens the goal setup (G01-G05), see tests/f01GoalRecommendation.test.js.
  assert.ok(entry.includes("goF01RecommendationSetup(session.id)"), "completed 5xSTS opens the Phase C goal setup");
  assert.ok(!entry.includes("state.assessmentFormStep"), "no longer routes into the Phase 1 questionnaire");
}

// ── 7. app.js wiring ─────────────────────────────────────────────────────
{
  const resultPage = sliceFn("function fiveTimesSitToStandResultPage(");
  assert.ok(resultPage.includes("startRecommendationFromFiveTimesSitToStand('${session.id}')"), "result page has the training-recommendation CTA wired to the session id");
  assert.ok(resultPage.includes("查看訓練建議"), "CTA label (UX refinement: 查看訓練建議 →)");

  const getRec = sliceFn("function getTodaysRecommendationForPatient(");
  assert.ok(getRec.includes("getRecommendationCandidatesForAssessment(assessment)"));
  assert.ok(getRec.includes("buildF01RecommendationReason"));

  const ctx = sliceFn("function buildAssessmentRecommendationContext(");
  assert.ok(ctx.includes("FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND"));

  const confirm = sliceFn("function confirmAssessment(");
  assert.ok(confirm.includes("assessmentType: ctx ? ctx.assessmentType || null : null"), "assessmentType persisted on the recommendation assessment");

  assert.ok(appJs.includes("window.startRecommendationFromFiveTimesSitToStand = startRecommendationFromFiveTimesSitToStand"));
}

// ── 8. no hard-coded 肩部 label left on the form / basis card ────────────
{
  const form = sliceFn("function patientAssessmentFormPage(");
  assert.ok(!form.includes("評估部位：肩部"), "form context label is type-driven");
  const basis = sliceFn("function renderRecommendationBasisCard(");
  assert.ok(!basis.includes("評估部位：肩部"), "basis card label is type-driven");
  assert.equal((appJs.match(/評估部位：肩部/g) || []).length, 2, "only the type->label helper (and its doc comment) mentions 肩部");
}

// ── 9. shoulder path unchanged ───────────────────────────────────────────
{
  const shoulderEntry = sliceFn("function startRecommendationFromAssessment(");
  assert.ok(shoulderEntry.includes('bodyParts: ["上肢功能"]'), "shoulder entry supplies the six-domain category 上肢功能");
  assert.ok(shoulderEntry.includes("state.assessmentFormStep = 2"), "shoulder entry still starts at the goal step");
  const prev = sliceFn("function goAssessmentPrevStep(");
  assert.ok(prev.includes("goFunctionalAssessmentShoulderResult("), "shoulder back-navigation kept");
  const pool2 = sliceFn("function getRecommendationCandidatesForAssessment(");
  assert.ok(pool2.includes("exerciseService.listNormalizedWithKnownGoals()"), "non-5xSTS assessments keep the original pool");
}

// ── 10. F01 直接訓練 uses six-domain ids that exist in the catalog ─────────
{
  const m = appJs.match(/const F01_DIRECT_TRAINING_EXERCISE_IDS = (\[[^\]]*\]);/);
  assert.ok(m, "F01_DIRECT_TRAINING_EXERCISE_IDS defined");
  const ids = JSON.parse(m[1]);
  assert.deepEqual(ids, ["F01-01", "F01-04"], "深蹲 + 坐姿起立 by six-domain id");
  ids.forEach((id) => assert.equal(exerciseService.getById(id)?.exercise_id, id, `${id} resolves directly, not via the legacy map`));
}

console.log("F01 video MVP Phase 1 tests passed");
