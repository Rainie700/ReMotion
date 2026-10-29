process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * F01 訓練建議頁 — evidence, data-backed reasons, main vs other options.
 * Pure helpers (js/ui/f01RecommendationView.js) plus the real
 * f01RecommendationResultPage() lifted from app.js, run on isolated in-memory
 * data (patient00 showcase seed through the real services).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const V = await import("../js/ui/f01RecommendationView.js");
const D5V = await import("../js/ui/d5ProposalView.js");
const S = await import("../js/dev/patient00Showcase.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { orderF01GoalCandidates, MATCH_LEVEL } = await import("../js/data/f01GoalRecommendation.js");
const { F01_GOALS, F01_EXERCISE_SPEC } = await import("../js/data/f01RecommendationSpec.js");
const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
const T = await import("../js/data/trackingCycle.js");

const P = { id: "uid-patient00", email: "patient00@gmail.com", role: "patient" };
const OTHER = "uid-someone-else";
createCollection("therapistPatientRelations").create({ id: "rel", therapistId: "t", patientId: P.id, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
assert.equal(S.seedPatient00ShowcaseData(P).ok, true);
const catalog = exerciseService.listNormalized();
const [c1, c2] = trackingCycleService.listTrackingCycles(P.id).reverse();
const phaseC = recommendationService.getById(c1.recommendationId);
const d5 = recommendationService.getById(c2.recommendationId);
assert.equal(d5.origin, D5_PROPOSAL_ORIGIN);
const baseline = functionalAssessmentService.getById(phaseC.sourceAssessmentId);
const sec = (ms) => `${(ms / 1000).toFixed(1)} 秒`;

// ── evidence: the plan's own assessment, checked against the patient ──
{
  const e = V.describeFa5xEvidence(baseline, P.id);
  assert.equal(e.valid, true);
  assert.equal(e.resultText, `完成 5 次，用時 ${sec(baseline.result.totalDurationMs)}`, "result read from the stored session (not hard-coded)");
  assert.equal(e.dateText, "2026.09.22");
  assert.equal(V.describeFa5xEvidence(null, P.id).problem, "missing");
  assert.equal(V.describeFa5xEvidence(baseline, OTHER).problem, "not_owned");
  assert.equal(V.describeFa5xEvidence({ ...baseline, assessmentType: undefined }, P.id).problem, "not_5xsts", "a session without a type is a legacy shoulder assessment");
  assert.equal(V.describeFa5xEvidence({ ...baseline, status: "in_progress" }, P.id).problem, "not_completed");
  assert.equal(V.describeFa5xEvidence({ ...baseline, result: { ...baseline.result, status: "invalid" } }, P.id).problem, "not_completed");
  const dE = V.describeD5Evidence(d5, P.id, (id) => functionalAssessmentService.getById(id));
  const re = functionalAssessmentService.getById(d5.d5.reassessmentId);
  assert.equal(dE.resultText, `${sec(baseline.result.totalDurationMs)} → ${sec(re.result.totalDurationMs)}`);
  assert.equal(dE.extra, `上一週完成訓練 ${d5.d5.completedTrainingDays} / ${d5.d5.plannedTrainingDays} 天`, "D5 cites the completion it actually used");
}

// ── which plan is shown: own only ──
{
  const foreign = { ...phaseC, id: "rec-foreign", patientId: OTHER };
  assert.equal(V.pickF01RecommendationForPage({ patientId: P.id, requested: phaseC, activeCycleRec: d5, latest: d5 }), phaseC, "the one just opened");
  assert.equal(V.pickF01RecommendationForPage({ patientId: P.id, requested: foreign, activeCycleRec: d5, latest: phaseC }), d5, "another account's -> the active cycle's plan");
  assert.equal(V.pickF01RecommendationForPage({ patientId: P.id, requested: null, activeCycleRec: null, latest: phaseC }), phaseC);
  assert.equal(V.pickF01RecommendationForPage({ patientId: P.id, requested: foreign, activeCycleRec: { ...d5, patientId: OTHER }, latest: { ...phaseC, patientId: OTHER } }), null, "never another account's");
}

// ── reasons: only rules that ran + the exercise's own data ──
{
  const item = phaseC.items[0];
  const lines = V.explainF01Item(item, { limitationsApplied: false });
  assert.equal(lines[0], `直接對應你選的目標「${item.selectedGoalLabel}」`);
  assert.ok(lines.includes(`動作資料的訓練重點：${F01_EXERCISE_SPEC[item.exerciseId].trainingGoal.split("。")[0]}`), "exercise-specific focus from the spec");
  assert.ok(lines.includes("支援 AI 動作辨識，練習時可即時計次與提醒") === item.aiSupported);
  assert.ok(!lines.some((l) => /注意事項/.test(l)), "no limitation line when none was ticked");
  assert.ok(V.explainF01Item(item, { limitationsApplied: true }).includes("未命中現有的排除規則：動作注意事項沒有提到你勾選的情況（不代表已確認安全或適合）"), "an unmatched precaution is never called safe");
  assert.equal(V.explainF01Item({ ...item, matchLevel: MATCH_LEVEL.SUPPORTING }, {})[0], `是「${item.selectedGoalLabel}」的輔助訓練`);
  assert.ok(!V.explainF01Item({ ...item, aiSupported: false }, {}).some((l) => /AI/.test(l)));
  const all = [...phaseC.items, ...d5.items].flatMap((it) => V.explainF01Item(it, { limitationsApplied: true, isD5: it === d5.items[0] }));
  const own = all.filter((l) => !l.startsWith("動作資料的訓練重點："));
  assert.ok(!own.some((l) => /歷程|紀錄|難度|進步|改善|療效|診斷/.test(l)), "no history / difficulty / efficacy claims in the system's own wording");
  // the exercise-data focus: first sentence only — no quoted outside efficacy statements
  for (const id of Object.keys(F01_EXERCISE_SPEC)) {
    const f = V.exerciseFocus(id);
    assert.ok(f && !/衛生福利部|國民健康署|CDC|AAOS|NSCA|指出|可有效|有效/.test(f), `${id}: focus without cited efficacy claims`);
  }
  assert.ok(!V.explainF01Item(d5.items[0], { isD5: true }).some((l) => /直接對應你選的目標/.test(l)), "a D5 plan was not built from the goal pool order");
}

// ── training amount: same catalog fields the training page uses, nothing invented ──
assert.equal(V.describeTrainingVolume({ measurementType: "repetition", defaultSets: 2, defaultRepetitions: 10 }), "2 組 × 每組 10 下");
assert.equal(V.describeTrainingVolume({ measurementType: "duration", defaultSets: 1, defaultDurationSeconds: 30 }), "1 組 × 每組 30 秒");
assert.equal(V.describeTrainingVolume({ measurementType: "repetition", defaultRepetitions: 8 }), "每組 8 下", "no invented set count");
assert.equal(V.describeTrainingVolume({ measurementType: "repetition" }), null);
assert.equal(V.describeTrainingVolume(null), null);

// ── other options: same order, minus the picked items; none for a D5 plan ──
{
  const goal = F01_GOALS.find((g) => g.goalId === phaseC.selectedGoalId);
  const ordered = orderF01GoalCandidates({ goal, limitationIds: phaseC.limitationIds || [], catalog }).ordered.map((c) => c.exercise.id);
  assert.deepEqual(ordered.slice(0, phaseC.items.length), phaseC.items.map((it) => it.exerciseId), "main items are the top of the existing order (weights unchanged)");
  const others = V.listF01OtherOptions(phaseC, catalog);
  assert.deepEqual(others.map((o) => o.exerciseId), ordered.slice(phaseC.items.length));
  assert.deepEqual(V.listF01OtherOptions(d5, catalog), []);
  const limited = { ...phaseC, limitationIds: ["L05"] };
  const excluded = orderF01GoalCandidates({ goal, limitationIds: ["L05"], catalog }).excluded.map((e) => e.exerciseId);
  assert.ok(!V.listF01OtherOptions(limited, catalog).some((o) => excluded.includes(o.exerciseId)), "limitation-excluded exercises never offered");
}
assert.match(V.describeF01ListSize(phaseC), /依你選的 15 分鐘決定列出 2 個動作，不是完整課表或處方/);

// ── the real page ──
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => { const s = appJs.indexOf(`const ${name} =`); assert.ok(s >= 0, name); return appJs.slice(s, appJs.indexOf(";\n", s) + 1); };
const state = {};
let currentUser = P.id;
const INIT = await import("../js/data/f01InitialReviewService.js"); // first-recommendation review (stage 1) used by the lifted pages
const page = new Function(
  ...["state", "getCurrentPatientId", "recommendationService", "exerciseService", "trackingCycleService", "functionalAssessmentService", "MATCH_LEVEL", "D5_PROPOSAL_ORIGIN", "formatDateKeyMonthDay", "EXERCISE_ASSET_AUDIT", "resolveExerciseMedia", "renderExerciseCardImage", "getInitialArrangement", "toLocalDateKey", ...Object.keys(V), ...Object.keys(D5V)],
  `${constSource("F01_MATCH_LEVEL_TEXT")}\n${constSource("F01_DEMO_IMAGE_PENDING")}\n${fnSource("renderF01RecommendationImage")}\n${fnSource("f01RecommendationResultPage")}\nreturn f01RecommendationResultPage;`,
)(state, () => currentUser, recommendationService, exerciseService, trackingCycleService, functionalAssessmentService, MATCH_LEVEL, D5_PROPOSAL_ORIGIN, T.formatDateKeyMonthDay, EXERCISE_ASSET_AUDIT, resolveExerciseMedia, (ex) => `<img alt="${ex.name}">`, INIT.getInitialArrangement, T.toLocalDateKey, ...Object.values(V), ...Object.values(D5V));
const open = (patch) => { for (const k of Object.keys(state)) delete state[k]; Object.assign(state, { f01RecEmpty: null, f01RecCycleNotice: null, f01RecResultOrigin: "setup" }, patch); return page(); };

// Phase C plan: evidence, reasons, amounts, entries
{
  const html = open({ f01RecommendationId: phaseC.id });
  const basis = html.slice(html.indexOf("f01-basis-card"), html.indexOf("主要推薦</h3>"));
  assert.ok(basis.includes(`五次坐站（F01 下肢功能）`) && basis.includes(`完成 5 次，用時 ${sec(baseline.result.totalDurationMs)}｜2026.09.22`), "assessment item, result and date");
  assert.ok(basis.includes("本次排序未參考：過去的訓練紀錄、動作難度分級、器材條件"), "unused inputs said plainly");
  assert.ok(!/推薦依據有限/.test(html));
  assert.match(html, /主要推薦 2 個動作，建議從「雙腳提踵」開始/);
  assert.equal((html.match(/建議從這個動作開始/g) || []).length, 1, "only the first item is the starting point");
  for (const it of phaseC.items) {
    assert.ok(html.includes(`startF01RecommendedTraining('${it.exerciseId}')`), `start ${it.exerciseId}`);
    assert.ok(html.includes(`按「開始訓練」會進入「${it.exerciseName}」的訓練準備頁`));
    const raw = exerciseService.getById(it.exerciseId);
    assert.ok(html.includes(`訓練量：${V.formatPlanVolume(V.describePlanVolume(raw, null))}`), "amount = what the training page will use, labelled 動作預設");
    assert.ok(html.includes("（動作預設）") && html.includes(V.PLAN_VOLUME_SOURCE_NOTE));
  }
  const others = V.listF01OtherOptions(phaseC, catalog);
  assert.ok(html.includes(`其他可選動作（${others.length}）`));
  const otherBlock = html.slice(html.indexOf("f01-other-options"), html.indexOf("</details>", html.indexOf("f01-other-options")));
  for (const o of others) assert.ok(otherBlock.includes(`goSelfPracticeExerciseDetail('${o.exerciseId}')`), "optional ones open as self practice (never tagged to the plan)");
  assert.ok(!/startF01RecommendedTraining|goF01RecommendationExerciseDetail/.test(otherBlock));
  assert.equal((html.match(/<details class="f01-rec-why">/g) || []).length, phaseC.items.length, "reasons only on main items");
}

// shown via fallback (no id in state): the plan id used by 開始訓練 is synced to the plan on screen
{
  const html = open({});
  assert.equal(state.f01RecommendationId, d5.id, "no id requested -> the active cycle's plan, and it is the one 開始訓練 will use");
  assert.ok(html.includes("上一週再次評估（五次坐站）") && html.includes(`上一週完成訓練 ${d5.d5.completedTrainingDays} / ${d5.d5.plannedTrainingDays} 天`), "D5 basis cites its real inputs");
  assert.ok(!html.includes("其他可選動作"), "no Phase C order offered for a D5 plan");
  assert.ok(!html.includes("本次排序未參考"), "no Phase C ranking note on a D5 plan");
}

// another account's plan id is never shown
{
  const foreign = recommendationService.createF01GoalRecommendation({ patientId: OTHER, result: { ...phaseC, status: "ok" }, createdBy: OTHER }).recommendation;
  open({ f01RecommendationId: foreign.id });
  assert.notEqual(state.f01RecommendationId, foreign.id);
}

// limited evidence: the plan's assessment is missing / not this patient's
{
  const orphan = recommendationService.createF01GoalRecommendation({ patientId: P.id, result: { ...phaseC, status: "ok", sourceAssessmentId: "no-such-session" }, createdBy: P.id }).recommendation;
  const html = open({ f01RecommendationId: orphan.id });
  assert.ok(html.includes("推薦依據有限") && html.includes("找不到這份建議所依據的評估紀錄"));
  assert.ok(html.includes("只依你選的訓練目標整理，不是根據評估結果的完整建議"));
  assert.ok(html.includes("goFiveTimesSitToStandAssessment()"), "offers a new assessment");
  assert.ok(html.includes("<b>無法確認</b>"), "no result / date guessed");
}

// no plan at all / engine found nothing
{
  currentUser = "uid-new-patient";
  const html = open({});
  assert.ok(html.includes("還沒有訓練建議") && html.includes("goFiveTimesSitToStandAssessment()"));
  assert.ok(!html.includes("這個訓練目標目前沒有其他符合條件"), "not confused with 'no candidates'");
  const none = open({ f01RecEmpty: { status: "no_candidates", excluded: [{}, {}] } });
  assert.ok(none.includes("你勾選的情況排除了 2 個動作"));
  currentUser = P.id;
}

console.log("f01RecommendationView: all assertions passed");
