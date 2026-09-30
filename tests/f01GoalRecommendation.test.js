import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * F01 Recommendation Phase C — goal-based, explainable recommendation.
 * Source of Truth: docs/specs/ReMotion復健資料庫_含F01推薦GoalMapping.xlsx
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const engineSrc = readFileSync(join(root, "js/data/f01GoalRecommendation.js"), "utf8");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { F01_GOALS, F01_EXERCISE_MAPPING, F01_EXERCISE_SPEC, F01_RECOMMENDATION_SPEC_SOURCE, F01_SPEC_CONSISTENCY_ISSUES } = await import("../js/data/f01RecommendationSpec.js");
const { generateF01GoalRecommendation, F01_LIMITATIONS, F01_TIME_OPTIONS, MATCH_LEVEL, F01_RECOMMENDATION_RULE_VERSION } = await import("../js/data/f01GoalRecommendation.js");
const { recommendationService } = await import("../js/data/recommendationService.js");

const catalog = exerciseService.listNormalized();
const COMPLETED = { status: "completed", sessionId: "fa-test-1", assessmentType: "five_times_sit_to_stand" };
const run = (over = {}) => generateF01GoalRecommendation({ assessment: COMPLETED, selectedGoalId: "G01", availableMinutes: 20, catalog, ...over });
const ids = (r) => r.items.map((i) => i.exerciseId);

// ── 1. generated spec is in sync with the Excel Source of Truth ──────────
{
  const xlsx = readFileSync(join(root, F01_RECOMMENDATION_SPEC_SOURCE.file));
  assert.equal(createHash("sha256").update(xlsx).digest("hex"), F01_RECOMMENDATION_SPEC_SOURCE.sha256, "f01RecommendationSpec.js was generated from the current Excel (re-run scripts/generateF01RecommendationSpec.py if this fails)");
  const expected = {
    G01: { label: "從椅子起身更順", direct: ["F01-04"], supporting: ["F01-01", "F01-10"] },
    G02: { label: "加強整體下肢力量", direct: ["F01-01", "F01-02", "F01-03", "F01-04", "F01-06", "F01-08", "F01-10", "F01-12", "F01-17"], supporting: ["F01-05", "F01-09", "F01-11", "F01-13", "F01-14", "F01-15", "F01-16", "F01-19"] },
    G03: { label: "加強膝部活動與控制", direct: ["F01-02", "F01-03", "F01-05", "F01-06", "F01-07", "F01-08"], supporting: ["F01-01", "F01-04", "F01-13", "F01-14", "F01-15"] },
    G04: { label: "加強髖部與骨盆穩定", direct: ["F01-09", "F01-10", "F01-11", "F01-12", "F01-13", "F01-14", "F01-15", "F01-16"], supporting: ["F01-19", "F01-20"] },
    G05: { label: "加強足踝力量與控制", direct: ["F01-17", "F01-18", "F01-19", "F01-20"], supporting: [] },
  };
  assert.deepEqual(F01_GOALS.map((g) => g.goalId), ["G01", "G02", "G03", "G04", "G05"]);
  for (const g of F01_GOALS) {
    assert.equal(g.label, expected[g.goalId].label);
    assert.deepEqual(g.directExerciseIds, expected[g.goalId].direct, `${g.goalId} direct`);
    assert.deepEqual(g.supportingExerciseIds, expected[g.goalId].supporting, `${g.goalId} supporting`);
  }
  // V2 spec: F01_推薦GoalMapping is the exact reverse view of F01_Goal候選池.
  assert.deepEqual([...F01_SPEC_CONSISTENCY_ISSUES], [], "F01_Goal候選池 and F01_推薦GoalMapping agree in both directions");
  for (const [eid, m] of Object.entries(F01_EXERCISE_MAPPING)) {
    for (const key of ["primaryGoalId", "directGoalIds", "supportingGoalIds"]) assert.ok(key in m, `${eid} mapping has ${key}`);
    assert.ok(m.directGoalIds.includes(m.primaryGoalId), `${eid} primary goal is one of its direct goals`);
    for (const g of F01_GOALS) {
      assert.equal(g.directExerciseIds.includes(eid), m.directGoalIds.includes(g.goalId), `${eid}/${g.goalId} direct agrees with the pool`);
      assert.equal(g.supportingExerciseIds.includes(eid), m.supportingGoalIds.includes(g.goalId), `${eid}/${g.goalId} supporting agrees with the pool`);
    }
  }
  assert.ok(!engineSrc.includes("mapping.directGoalId"), "engine reads primaryGoalId (V2 schema), not the removed direct_goal_id");
}

// ── 2. R00 gate: only a completed 5xSTS enters recommendation ─────────────
{
  for (const status of ["invalid", "incomplete", undefined]) {
    const r = run({ assessment: { ...COMPLETED, status } });
    assert.equal(r.status, "blocked", `${status} -> blocked`);
    assert.equal(r.items.length, 0, `${status} -> no recommendation items`);
  }
  assert.equal(run({ assessment: null }).status, "blocked");
  assert.equal(run({ assessment: { ...COMPLETED, assessmentType: "shoulder" } }).status, "blocked", "R01: only the 5xSTS maps to F01");
  assert.equal(run().status, "ok", "completed -> recommendation");
  assert.equal(run({ selectedGoalId: "G99" }).status, "needs_goal");
  const blocked = run({ assessment: { ...COMPLETED, status: "invalid" } });
  assert.ok(recommendationService.createF01GoalRecommendation({ patientId: "p", result: blocked }).error, "a blocked result can never be stored as a recommendation");
}

// ── 3. G01 example ─────────────────────────────────────────────────────────
{
  const r = run({ selectedGoalId: "G01", availableMinutes: 20 });
  assert.deepEqual(ids(r), ["F01-04", "F01-01", "F01-10"]);
  assert.equal(r.items[0].matchLevel, MATCH_LEVEL.DIRECT, "F01-04 is the Direct candidate");
  assert.deepEqual(r.items.slice(1).map((i) => i.matchLevel), [MATCH_LEVEL.SUPPORTING, MATCH_LEVEL.SUPPORTING]);
  assert.ok(!ids(r).includes("F01-18"), "F01-18 never enters through G01");
  assert.equal(r.candidateCount, 3);
  const item = r.items[0];
  for (const f of ["exerciseId", "exerciseName", "functionalDomain", "sourceAssessmentId", "selectedGoalId", "selectedGoalLabel", "matchLevel", "matchedConditions", "reason", "aiSupported"]) {
    assert.ok(item[f] !== undefined, `item has ${f}`);
  }
  assert.equal(item.functionalDomain, "F01");
  assert.equal(item.sourceAssessmentId, "fa-test-1");
  assert.equal(item.selectedGoalLabel, "從椅子起身更順");
  assert.equal(item.reason, "坐姿起立直接對應你選擇的「從椅子起身更順」訓練目標，屬於 F01 下肢功能訓練。");
  assert.ok(r.items[2].reason.startsWith("橋式可作為「從椅子起身更順」相關的輔助訓練"));
  assert.equal(r.ruleVersion, F01_RECOMMENDATION_RULE_VERSION);
}

// ── 4. G05 example: only F01-17..F01-20 ───────────────────────────────────
{
  const r = run({ selectedGoalId: "G05", availableMinutes: 20 });
  const allowed = ["F01-17", "F01-18", "F01-19", "F01-20"];
  assert.equal(r.candidateCount, 4);
  assert.ok(ids(r).every((id) => allowed.includes(id)), "G05 candidates only from F01-17..20");
  assert.ok(!ids(r).includes("F01-04") && !ids(r).includes("F01-10"));
  assert.ok(r.items.every((i) => i.matchLevel === MATCH_LEVEL.DIRECT), "G05 has no supporting list");
  assert.deepEqual(ids(r), ["F01-17", "F01-18", "F01-19"]);
}

// ── 5. every goal: pool-only, domain-locked, Direct before Supporting ────
{
  for (const g of F01_GOALS) {
    for (const minutes of [10, 15, 20, null]) {
      const r = run({ selectedGoalId: g.goalId, availableMinutes: minutes });
      const pool = [...g.directExerciseIds, ...g.supportingExerciseIds];
      assert.ok(ids(r).every((id) => pool.includes(id) && id.startsWith("F01-")), `${g.goalId}: items only from its pool`);
      const levels = r.items.map((i) => (i.matchLevel === MATCH_LEVEL.DIRECT ? 0 : 1));
      assert.deepEqual([...levels].sort(), levels, `${g.goalId}: Direct before Supporting`);
      r.items.forEach((i) => {
        const inDirect = g.directExerciseIds.includes(i.exerciseId);
        assert.equal(i.matchLevel, inDirect ? MATCH_LEVEL.DIRECT : MATCH_LEVEL.SUPPORTING, "match level from the pool, never NONE");
      });
      assert.ok(r.items.length >= 1 && r.items.length <= 3, "1-3 exercises");
    }
  }
}

// ── 6. deterministic: same input -> same output, catalog order irrelevant ─
{
  const a = run({ selectedGoalId: "G02", availableMinutes: 20 });
  const b = run({ selectedGoalId: "G02", availableMinutes: 20 });
  assert.deepEqual(a, b, "identical re-run");
  const reversed = run({ selectedGoalId: "G02", availableMinutes: 20, catalog: [...catalog].reverse() });
  assert.deepEqual(ids(reversed), ids(a), "input order does not change the ranking");
  assert.ok(!/Math\.random|Date\.now|new Date/.test(engineSrc), "no randomness or clock in the engine");
}

// ── 7. reasons come from the real match ──────────────────────────────────
{
  for (const g of F01_GOALS) {
    const r = run({ selectedGoalId: g.goalId, availableMinutes: 20 });
    r.items.forEach((i) => {
      assert.ok(i.reason.includes(`「${g.label}」`), "reason names the selected goal");
      assert.ok(i.reason.startsWith(i.exerciseName), "reason names the exercise");
      if (i.matchLevel === MATCH_LEVEL.DIRECT) assert.ok(i.reason.includes("直接對應"));
      else assert.ok(i.reason.includes("輔助訓練") && !i.reason.includes("直接對應"));
      assert.ok(!/最適合|最佳|最符合/.test(i.reason), "no 最適合 / 最佳 wording");
      const r02 = i.matchedConditions.find((c) => c.ruleId === "R02");
      assert.ok(r02 && r02.text.includes(g.label), "matchedConditions records the goal match");
      assert.equal(i.matchedConditions.some((c) => c.ruleId === "R03"), false, "no limitation condition claimed when none was set");
    });
  }
  const withLimit = run({ selectedGoalId: "G01", limitationIds: ["L05"] });
  assert.ok(withLimit.items.every((i) => i.reason.endsWith("並符合本次設定的訓練條件。") && i.matchedConditions.some((c) => c.ruleId === "R03")), "condition sentence only when a condition was really applied");
}

// ── 8. R03 limitations: backed only by verbatim precautions ──────────────
{
  const precautions = Object.values(F01_EXERCISE_SPEC).map((s) => s.precautions);
  for (const l of F01_LIMITATIONS) {
    for (const p of l.phrases) assert.ok(precautions.some((t) => t.includes(p)), `${l.id} phrase 「${p}」 exists verbatim in an F01 precaution`);
  }
  const r = run({ selectedGoalId: "G04", limitationIds: ["L01"] });
  assert.deepEqual(r.excluded.map((e) => e.exerciseId), ["F01-11", "F01-13", "F01-14", "F01-15"]);
  r.excluded.forEach((e) => assert.ok(e.precaution.includes("全人工髖關節置換") && F01_EXERCISE_SPEC[e.exerciseId].precautions.includes(e.precaution), "exclusion cites the exercise's own precaution sentence"));
  assert.ok(!ids(r).some((id) => r.excluded.some((e) => e.exerciseId === id)), "excluded exercises never recommended");
  const g5 = run({ selectedGoalId: "G05", limitationIds: ["L05", "L03"] });
  assert.deepEqual(ids(g5), ["F01-17", "F01-18"]);
  assert.deepEqual(g5.excluded.map((e) => `${e.exerciseId}:${e.limitationId}`), ["F01-19:L03", "F01-20:L05"]);
  assert.equal(run({ selectedGoalId: "G01", limitationIds: ["L01", "L02", "L03", "L04", "L05"] }).excluded.length, 0, "G01 exercises carry none of these precautions");
}

// ── 9. R06 time -> number of exercises only; basis lists only real inputs ─
{
  assert.deepEqual(F01_TIME_OPTIONS.map((o) => [o.minutes, o.maxItems]), [[10, 1], [15, 2], [20, 3]]);
  assert.equal(run({ selectedGoalId: "G02", availableMinutes: 10 }).items.length, 1);
  assert.equal(run({ selectedGoalId: "G02", availableMinutes: 15 }).items.length, 2);
  assert.equal(run({ selectedGoalId: "G02", availableMinutes: 20 }).items.length, 3);
  assert.equal(run({ selectedGoalId: "G02", availableMinutes: null }).items.length, 3);
  const noTime = run({ selectedGoalId: "G01", availableMinutes: null });
  assert.deepEqual(noTime.basis.map((b) => b.key), ["assessment", "goal"], "time / limitations not shown when not used");
  const full = run({ selectedGoalId: "G01", availableMinutes: 15, limitationIds: ["L01"] });
  assert.deepEqual(full.basis.map((b) => b.key), ["assessment", "goal", "time", "limitations"]);
  assert.ok(!/分鐘.*剛好|精準|總訓練時間/.test(JSON.stringify(full.basis)), "no claim of an exact total duration");
}

// ── 10. missing exercise data: skipped + reported, never replaced ────────
{
  const partial = catalog.filter((ex) => ex.id !== "F01-10");
  const r = run({ selectedGoalId: "G01", catalog: partial });
  assert.equal(r.status, "ok");
  assert.deepEqual(ids(r), ["F01-04", "F01-01"]);
  assert.deepEqual(r.missingExerciseIds, ["F01-10"]);
  assert.deepEqual(run({ selectedGoalId: "G01" }).missingExerciseIds, [], "current code database covers every F01 id in the pool");
}

// ── 11. no 5xSTS seconds, no difficulty, no weighted score ───────────────
{
  const code = engineSrc.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  assert.ok(!/totalDuration|repDuration|durationMs|秒/.test(code), "engine never reads assessment time");
  assert.ok(!/difficulty|abilityLevel|getDifficultyTier/.test(code), "difficulty / ability not used (mapping pending validation)");
  assert.ok(!/weight|score/i.test(code), "no weighted score");
  const slow = run({ assessment: { ...COMPLETED, totalDurationMs: 25000 } });
  const fast = run({ assessment: { ...COMPLETED, totalDurationMs: 7000 } });
  assert.deepEqual(ids(slow), ids(fast), "5xSTS total time does not change the recommendation");
  const weightPattern = /\b(0?\.40?|40)\s*%?\s*[,/，、]\s*(0?\.25|25)\s*%?\s*[,/，、]\s*(0?\.20?|20)\s*%?\s*[,/，、]\s*(0?\.15|15)\s*%?/;
  const sources = [appJs, ...readdirSync(join(root, "js/data")).filter((f) => f.endsWith(".js") && f !== "rehabExercises.js").map((f) => readFileSync(join(root, "js/data", f), "utf8"))];
  assert.ok(!sources.some((s) => weightPattern.test(s)), "no 40/25/20/15 recommendation weights anywhere");
}

// ── 12. storage: the full explainable result is kept ─────────────────────
{
  const result = run({ selectedGoalId: "G01", availableMinutes: 20, limitationIds: ["L02"] });
  const saved = recommendationService.createF01GoalRecommendation({ patientId: "p-rec", result, createdBy: "p-rec" }).recommendation;
  assert.equal(saved.kind, "f01_goal");
  assert.equal(saved.assessmentId, null, "never collides with the legacy getTodaysRecommendation cache");
  assert.equal(saved.selectedGoalId, "G01");
  assert.equal(saved.sourceAssessmentId, "fa-test-1");
  assert.equal(saved.recommendationRuleVersion, F01_RECOMMENDATION_RULE_VERSION);
  assert.deepEqual(saved.items.map((i) => [i.exerciseId, i.matchLevel]), result.items.map((i) => [i.exerciseId, i.matchLevel]));
  assert.ok(saved.items[0].matchedConditions.length && saved.items[0].reason);
  assert.equal(recommendationService.getLatestF01GoalRecommendation("p-rec").id, saved.id);
  assert.equal(recommendationService.getLatestF01GoalRecommendation("p-rec", { sourceAssessmentId: "other" }), null);
}

// ── 13. app.js wiring ────────────────────────────────────────────────────
{
  const entry = appJs.slice(appJs.indexOf("function startRecommendationFromFiveTimesSitToStand("), appJs.indexOf("function startRecommendationFromFiveTimesSitToStand(") + 1600);
  assert.ok(entry.includes('session.status !== "completed"') && entry.includes("getFa5xResultStatus(session.result) !== FA5X_RESULT_STATUS.COMPLETED"), "result-page gate kept");
  assert.ok(entry.includes("goF01RecommendationSetup(session.id)"), "completed 5xSTS -> goal setup");
  const gen = appJs.slice(appJs.indexOf("function generateF01RecommendationFromSetup("), appJs.indexOf("function goF01RecommendationResult("));
  assert.ok(gen.includes("status: getFa5xResultStatus(session.result)"), "engine gate reads the stored assessment status");
  assert.ok(gen.includes("generateF01GoalRecommendation(") && gen.includes("recommendationService.createF01GoalRecommendation("));
  assert.ok(!gen.includes("totalDurationMs"), "setup never passes the 5xSTS time");
  for (const route of ["f01RecommendationSetup", "f01RecommendationResult"]) assert.ok(appJs.includes(`state.route === "${route}"`), `${route} dispatched`);
  for (const fn of ["goF01RecommendationSetup", "selectF01Goal", "selectF01Time", "toggleF01Limitation", "generateF01RecommendationFromSetup", "goF01RecommendationResult", "goF01RecommendationExerciseDetail", "startF01RecommendedTraining"]) {
    assert.ok(appJs.includes(`window.${fn} = ${fn};`), `${fn} exposed`);
  }
  const setup = appJs.slice(appJs.indexOf("function f01RecommendationSetupPage("), appJs.indexOf("function generateF01RecommendationFromSetup("));
  assert.ok(setup.includes("這次想優先加強哪個部分？") && setup.includes("F01_GOALS.map("), "G01-G05 from the spec");
  assert.ok(!/能力|程度|初階|中階|高階/.test(setup), "no ability / difficulty question (mapping pending)");
  const results = appJs.slice(appJs.indexOf("function f01RecommendationResultPage("), appJs.indexOf("const renderBeforeF01Recommendation"));
  for (const text of ["本次訓練建議", "推薦依據", "查看動作", "開始訓練", "rec.basis", "it.reason"]) assert.ok(results.includes(text), `results page has ${text}`);
  assert.ok(!/最適合|最佳/.test(results), "no 最適合 / 最佳 on the results page");
  assert.ok(/meta\.navigationOrigin === "f01Recommendation"\) return goF01RecommendationExerciseDetail/.test(appJs), "after training -> back into the recommendation flow");
  assert.ok(/state\.navigationOrigin === "f01Recommendation"\) \{\s*if \(level === "listing"\) return state\.exerciseListingOrigin === "training" \? \{ fn: "goSchedule\(\)".*: \{ fn: "goF01RecommendationResult\(\)"/.test(appJs), "返回 from an exercise leads to the recommendation results (or the Training Tab it was opened from, I-4)");
  assert.ok(!/MediaPipe[^"'`\n]{0,12}推薦/.test(appJs), "never describes MediaPipe as the recommender");
}

console.log("F01 Recommendation Phase C tests passed");
