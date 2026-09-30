import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Result State UI + Recommendation polish — the three presentation states
 * (completed / review / unavailable) are rendered from stored results and the
 * D5 engine output only. The real app.js render functions run in isolation
 * against the real services (fake localStorage, no Firebase).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const C = await import("../js/ai/exercises/sitToStand/assessmentConstants.js");
const T = await import("../js/data/trackingCycle.js");
const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
const D = await import("../js/data/f01ProgressionDecision.js");
const { trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation, F01_LIMITATIONS, MATCH_LEVEL } = await import("../js/data/f01GoalRecommendation.js");
const { F01_GOALS } = await import("../js/data/f01RecommendationSpec.js");
const { describeTimeDifference } = await import("../js/data/trackingComparison.js");

function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => {
  const start = appJs.indexOf(`const ${name} =`);
  assert.ok(start >= 0, `${name} exists`);
  return appJs.slice(start, appJs.indexOf(";\n", start) + 1);
};
const build = (deps, sources, names) => new Function(...Object.keys(deps), `${sources.join("\n")}\nreturn { ${names.join(", ")} };`)(...Object.values(deps));
const catalog = exerciseService.listNormalized();
const U = "state-user";
const state = {};

// ── 5xSTS result page, isolated ─────────────────────────────────────────
const resultApi = build(
  {
    state, getCurrentPatientId: () => U, functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES, trackingCycleService,
    REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE, FA5X_RESULT_STATUS: C.FA5X_RESULT_STATUS, FA5X_END_REASON: C.FA5X_END_REASON,
    FA5X_TARGET_REPS: C.FA5X_TARGET_REPS, formatDateKeyMonthDay: T.formatDateKeyMonthDay, fa5xResultBackAction: () => "goF01LowerLimbHome()",
  },
  [fnSource("getFa5xResultStatus"), constSource("FA5X_END_REASON_TEXT"), fnSource("fa5xResultPresentation"), fnSource("fmtFa5xDate"), fnSource("fiveTimesSitToStandResultPage")],
  ["fiveTimesSitToStandResultPage", "fa5xResultPresentation"],
);
function session(result) {
  const s = functionalAssessmentService.create({ patientId: U, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { measuredAt: "2026-09-28T02:39:00.000Z", algorithmVersion: "t", ...result } });
  return functionalAssessmentService.getById(s.id);
}
const renderResult = (s) => { state.fa5xResultSessionId = s.id; return resultApi.fiveTimesSitToStandResultPage(); };

// A. completed
{
  const html = renderResult(session({ status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 8900, repDurationsMs: [1111, 1222, 1333, 1444, 1055], rejectedAttempts: [] }));
  assert.ok(html.includes("result-state--completed"));
  assert.ok(html.includes('<div class="fa5x-hero-value">8.9<span>秒</span></div>'), "total time is the hero number");
  assert.ok(html.includes("✓ 已完成 5 / 5"));
  assert.ok(html.includes(">查看訓練建議 →</button>") && html.includes("返回 F01 下肢功能"));
  assert.equal((html.match(/btn-primary/g) || []).length, 1, "one primary action");
  assert.equal((html.match(/class="fa5x-done-mark"/g) || []).length, 5, "five completion marks");
  for (const ms of ["1.1 秒", "1.2 秒", "1.3 秒", "1.4 秒", "1111", "1222"]) assert.ok(!html.includes(ms), `rep duration ${ms} never shown`);
}

// B. incomplete
{
  const html = renderResult(session({ status: "incomplete", repCount: 3, completedReps: 3, totalDurationMs: null, failureReason: C.FA5X_END_REASON.USER_CANCELLED }));
  assert.ok(html.includes("result-state--unavailable") && html.includes(" incomplete"));
  assert.ok(html.includes("本次評估尚未完成") && html.includes("已完成 <b>3 / 5</b> 次"));
  assert.ok(html.includes("本次未完成原因：</span>評估提前結束。"));
  assert.ok(html.includes("本次尚未完成 5 次坐站，因此不會作為後續比較依據。"));
  assert.ok(html.includes(">重新測試</button>") && html.includes("返回 F01 下肢功能"));
  assert.ok(!html.includes("查看訓練建議") && !html.includes("fa5x-hero-value") && !html.includes("本次無法建立有效結果"));
}

// C. invalid
{
  const html = renderResult(session({ status: "invalid", repCount: 2, completedReps: 2, totalDurationMs: null, invalidReason: C.FA5X_END_REASON.TRACKING_LOST }));
  assert.ok(html.includes("result-state--unavailable") && html.includes(" invalid"));
  assert.ok(html.includes("本次無法建立有效結果") && html.includes("這次量測沒有形成可使用的正式結果。"));
  assert.ok(html.includes("原因：</span>測試過程中沒有持續偵測到完整動作。"));
  assert.ok(html.includes("請確認拍攝位置與全身入鏡後，再重新進行評估。"));
  assert.ok(html.includes(">重新測試</button>"));
  assert.ok(!html.includes("查看訓練建議") && !html.includes("本次評估尚未完成"), "invalid ≠ incomplete");
}

// Tracking runs keep their context on retry (secondary goes home, not the F01 entry that clears it)
{
  const html = renderResult(session({ status: "incomplete", repCount: 1, completedReps: 1, totalDurationMs: null, assessmentRole: REASSESSMENT_ROLE, trackingCycleId: "c-x" }));
  assert.ok(html.includes("本週追蹤仍在等待再次評估") && html.includes(`onclick="switchTab('home')">返回首頁`) && !html.includes("goF01LowerLimbHome()\">返回 F01"));
}

// No failure / diagnosis wording in any result state
{
  const src = fnSource("fiveTimesSitToStandResultPage") + constSource("FA5X_END_REASON_TEXT");
  for (const w of ["失敗", "危險", "嚴重", "受傷", "異常", "惡化", "肌少症", "需要治療", "診斷結果"]) assert.ok(!src.includes(w), `no 「${w}」`);
  assert.equal(resultApi.fa5xResultPresentation("completed"), "completed");
  assert.equal(resultApi.fa5xResultPresentation("incomplete"), "unavailable");
  assert.equal(resultApi.fa5xResultPresentation("invalid"), "unavailable");
}

// ── D5 proposal page, isolated ──────────────────────────────────────────
const d5Api = build(
  {
    state, getCurrentPatientId: () => U, trackingCycleService, exerciseService, F01_GOALS, F01_LIMITATIONS,
    D5_DECISION: D.D5_DECISION, CONFIRMATION_MODE: D.CONFIRMATION_MODE, TRANSITION_TYPE: D.TRANSITION_TYPE,
    describeTimeDifference, formatDateKeyMonthDay: T.formatDateKeyMonthDay, measuredDateKeyOf: D.measuredDateKeyOf, toLocalDateKey: T.toLocalDateKey,
  },
  [constSource("D5_ERROR_TEXT"), constSource("d5ErrorText"), constSource("d5ExerciseName"), constSource("D5_STATUS_TITLE"), constSource("D5_TRANSITION_TEXT"), fnSource("escapeD5Text"), fnSource("d5ProposalPresentation"), fnSource("d5ProposalPage")],
  ["d5ProposalPage", "d5ProposalPresentation"],
);
function completedCycle(user, goal = "G05", minutes = 15, limitationIds = []) {
  const mk = (ms, at, role = null) => {
    const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
    return functionalAssessmentService.getById(s.id);
  };
  const b = mk(12000, [2026, 8, 28, 9, 0]);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, limitationIds, availableMinutes: minutes, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: user, result: r, createdBy: user }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: b, recommendation: rec }).cycle;
  const re = mk(8500, [2026, 9, 4, 20, 0], { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: b.id });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: user, reassessment: re, todayDateKey: "2026-10-04" });
  return cycle;
}
const renderD5 = (proposal) => { state.d5ProposalId = proposal.id; return d5Api.d5ProposalPage(); };

// D. professional_review_required -> 需要進一步確認 screen, no accept button
// (L05 was already in force last week, so it is not NEW: discomfort alone -> review)
{
  const cycle = completedCycle(U, "G05", 15, ["L05"]);
  const p = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: U, input: { hasNewOrWorseningDiscomfort: true, discomfortNote: "<b>膝蓋</b>有點痠", currentLimitations: ["L05"] }, catalog }).proposal;
  assert.equal(p.d5.confirmationMode, "professional_review_required");
  assert.equal(p.d5.nextCycleReady, false);
  const html = renderD5(p);
  assert.ok(html.includes("result-state--review") && html.includes(">需要進一步確認</b>"));
  assert.ok(html.includes("你回報了新的或加重的不適，目前不會自動安排下一週訓練。"));
  assert.ok(html.includes("<span>新的或加重的不適</span><b>有</b>"));
  assert.ok(html.includes("&lt;b&gt;膝蓋&lt;/b&gt;有點痠"), "note shown verbatim (escaped), never interpreted");
  assert.ok(html.includes("目前無法安全地單腳站立"), "current limitations listed");
  assert.ok(html.includes("目前不會自動調整或建立下一週訓練。"));
  assert.ok(html.includes(`onclick="switchTab('home')">返回首頁</button>`) && html.includes("修改狀況確認"));
  assert.ok(!html.includes("接受並開始下一週") && !html.includes("接受這份建議") && !html.includes("confirmD5ProposalFromUi"));
  for (const w of ["危險", "嚴重", "受傷", "惡化", "異常", "風險", "就醫", "停止復健"]) assert.ok(!html.includes(w), `no 「${w}」`);
  // empty note -> no empty row
  const p2 = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: U, input: { hasNewOrWorseningDiscomfort: true, discomfortNote: "", currentLimitations: [] }, catalog }).proposal;
  assert.ok(!renderD5(p2).includes("補充說明"));
}

// E. normal user_acceptance -> still 接受並開始下一週 (same-day) / 接受這份建議
{
  const u2 = "state-user-2";
  const cycle = completedCycle(u2);
  const p = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u2, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] }, catalog }).proposal;
  const html = new Function("s", "u", "api", "s.d5ProposalId = u; return api.d5ProposalPage();")(state, p.id, build(
    { state, getCurrentPatientId: () => u2, trackingCycleService, exerciseService, F01_GOALS, F01_LIMITATIONS, D5_DECISION: D.D5_DECISION, CONFIRMATION_MODE: D.CONFIRMATION_MODE, TRANSITION_TYPE: D.TRANSITION_TYPE, describeTimeDifference, formatDateKeyMonthDay: T.formatDateKeyMonthDay, measuredDateKeyOf: D.measuredDateKeyOf, toLocalDateKey: T.toLocalDateKey },
    [constSource("D5_ERROR_TEXT"), constSource("d5ErrorText"), constSource("d5ExerciseName"), constSource("D5_STATUS_TITLE"), constSource("D5_TRANSITION_TEXT"), fnSource("escapeD5Text"), fnSource("d5ProposalPresentation"), fnSource("d5ProposalPage")],
    ["d5ProposalPage"]));
  assert.ok(html.includes("result-state--completed") && !html.includes("result-state--review"));
  assert.ok(/confirmD5ProposalFromUi\('[^']+'\)">(接受並開始下一週|接受這份建議)<\/button>/.test(html), "normal proposal keeps its accept action");
}

// F. Presentation comes from engine output only — never from the raw answers
{
  const P = d5Api.d5ProposalPresentation;
  const base = { decision: "adjust", confirmationMode: "user_acceptance", nextCycleReady: true };
  assert.equal(P({ ...base, hasNewOrWorseningDiscomfort: true, newLimitations: ["L03"] }), "completed", "discomfort WITH a mappable limitation stays an adjust proposal");
  assert.equal(P({ ...base, confirmationMode: "professional_review_required", nextCycleReady: false, hasNewOrWorseningDiscomfort: false }), "review", "review follows confirmationMode, not the discomfort flag");
  assert.equal(P({ decision: "no_auto_decision", confirmationMode: null, nextCycleReady: false }), "unavailable");
  const src = fnSource("d5ProposalPresentation");
  assert.ok(!/hasNewOrWorseningDiscomfort|newLimitations|discomfortNote|currentLimitations/.test(src.replace(/\/\*[\s\S]*?\*\//g, "")), "no second rule set in the UI");
  assert.ok(fnSource("d5ProposalPage").includes("const review = presentation === \"review\";"));
}

// ── G + H. Recommendation page, isolated ────────────────────────────────
{
  const MAP = { "F01-17": "/images/exercise/exercise_double_calf_raise.png", "F01-18": "/images/exercise/exercise_double_toe_raise.png" };
  const recApi = build(
    { state, getCurrentPatientId: () => U, recommendationService, exerciseService, MATCH_LEVEL, D5_PROPOSAL_ORIGIN, formatDateKeyMonthDay: T.formatDateKeyMonthDay, EXERCISE_ASSET_AUDIT, resolveExerciseMedia, renderExerciseCardImage: (ex) => `<img src="${MAP[ex.id]}" alt="${ex.name}">` },
    [constSource("F01_MATCH_LEVEL_TEXT"), constSource("F01_DEMO_IMAGE_PENDING"), fnSource("renderF01RecommendationImage"), fnSource("f01RecommendationResultPage")],
    ["f01RecommendationResultPage"],
  );
  const b = session({ status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 9000 });
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: U, result: r, createdBy: U }).recommendation;
  Object.assign(state, { f01RecommendationId: rec.id, f01RecEmpty: null, f01RecCycleNotice: null, f01RecResultOrigin: "setup" });
  const html = recApi.f01RecommendationResultPage();
  const hero = html.slice(html.indexOf('<div class="card f01-rec-hero">'), html.indexOf('<div class="card f01-basis-card">'));
  assert.ok(hero.includes('class="f01-rec-hero-illustration" src="/images/exercise/exercise_plan.png"'), "summary has an illustration");
  assert.ok(hero.includes("已為你安排 2 個練習") && hero.includes("目標：加強足踝力量與控制"));
  assert.equal((html.match(/class="f01-basis-icon"/g) || []).length, 3, "basis rows carry icons");
  assert.ok(html.includes("15 分鐘（決定建議動作數量）"), "time still explained as exercise count");
  const whys = html.match(/<details class="f01-rec-why">[\s\S]*?<\/details>/g) || [];
  assert.equal(whys.length, 2);
  for (const [i, w] of whys.entries()) {
    assert.ok(!/<details[^>]*\sopen/.test(w), "collapsed by default");
    assert.ok(w.includes(rec.items[i].reason), "expanded body holds the stored deterministic reason");
    assert.ok(w.indexOf(rec.items[i].reason) < w.indexOf("f01-match-badge"), "Direct / Supporting is secondary to the sentence");
  }
  const css = readFileSync(join(root, "styles.css"), "utf8");
  const heroRule = [...css.matchAll(/\.f01-rec-hero \{([^}]*)\}/g)].pop()[1];
  assert.ok(!/gradient/.test(heroRule) && /background: #eef5e9/.test(heroRule), "summary card has no gradient");
  assert.ok(/\.result-state--completed/.test(css) && /\.result-state--review/.test(css) && /\.result-state--unavailable/.test(css));
  assert.ok(!/result-state--danger|#e53935|#d32f2f|#f44336/.test(css), "no danger variant / alarm red");
}

console.log("Result state UI tests passed");
