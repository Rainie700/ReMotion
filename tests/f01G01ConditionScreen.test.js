process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * G01「從椅子起身更順」condition screen v1 (docs/F01_G01_IMPLEMENTABLE_CONDITIONS.md).
 * Condition screening and engineering-spec verification only — not clinical accuracy.
 * Isolated in-memory synthetic data through the real services; result pages lifted from app.js.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const SCR = await import("../js/data/f01G01ConditionScreen.js");
const V = await import("../js/ui/f01RecommendationView.js");
const D5V = await import("../js/ui/d5ProposalView.js");
const INIT = await import("../js/data/f01InitialReviewService.js");
const IR = await import("../js/data/f01InitialReview.js");
const T = await import("../js/data/trackingCycle.js");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import("../js/data/fa5xMeasurementCompatibility.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation, orderF01GoalCandidates, MATCH_LEVEL } = await import("../js/data/f01GoalRecommendation.js");
const { F01_AUTO_RECOMMENDATION_EXCLUSIONS, F01_FORMAL_COMPLETION_RULES_VERSION } = await import("../js/data/f01DailyTargets.js");
const { F01_GOALS } = await import("../js/data/f01RecommendationSpec.js");
const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
const { createCollection } = await import("../js/data/storageService.js");

const V2 = F01_FORMAL_COMPLETION_RULES_VERSION;
const catalog = exerciseService.listNormalized();
const recs = createCollection("recommendationResults");
const cycles = createCollection("trackingCycles");
const sessions = createCollection("functionalAssessmentSessions");

let seq = 0;
/** A completed 5xSTS of `u`; `report` = condition answers to append (null = none). */
function assessment(u, { ms = 12000, report = null, status = "completed" } = {}) {
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  seq += 1;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status, repCount: 5, completedReps: status === "completed" ? 5 : 2, totalDurationMs: ms, measuredAt: new Date(2026, 9, 27, 9, seq).toISOString() } });
  if (report) assert.ok(!functionalAssessmentService.appendFa5xConditionReport(s.id, { source: "self_report", ...report }, { reportedBy: u }).error);
  return functionalAssessmentService.getById(s.id);
}
/** Exactly what app.js generateF01RecommendationFromSetup passes. */
function generate(u, session, { goal = "G01", minutes = 20, limits = [] } = {}) {
  return generateF01GoalRecommendation({
    assessment: session ? { status: session.result.status === "completed" ? "completed" : session.result.status, sessionId: session.id, assessmentType: "five_times_sit_to_stand" } : null,
    selectedGoalId: goal, limitationIds: limits, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true,
    g01Conditions: goal === "G01" ? SCR.buildG01ConditionSnapshot({ patientId: u, assessmentId: session && session.id, session }) : null,
  });
}
const ids = (r) => r.items.map((i) => i.exerciseId);
const NO = { armsUsed: "no", physicalAssistance: "no" };
const reasonCodes = (r) => (r.excluded.find((e) => e.exerciseId === "F01-04") || { screenReasons: [] }).screenReasons.map((x) => x.code);

// ── V01–V12 (docs/F01_G01_IMPLEMENTABLE_CONDITIONS.md 四) ──
{
  const u = "g01-v";
  const clear = assessment(u, { report: NO });
  const v01 = generate(u, clear, { minutes: 20 });
  assert.equal(v01.status, "ok");
  assert.deepEqual(ids(v01), ["F01-04"], "V01");
  assert.deepEqual(v01.shortfall, { requested: 3, available: 1 }, "V01 not padded");
  assert.deepEqual(v01.excluded.map((e) => [e.exerciseId, e.reason, e.reasonCategory]),
    [["F01-01", "g01_squat_version_unmatched", "not_included_this_version"], ["F01-10", "g01_bridge_setting_unconfirmed", "not_included_this_version"]], "V01 / V11 reasons kept per exercise");
  assert.ok(v01.items[0].matchedConditions.some((c) => c.ruleId === "G01-C1" && c.text.includes("使用者回報，系統未驗證")));
  assert.equal(v01.conditionScreen.ruleVersion, SCR.F01_G01_CONDITION_RULE_VERSION);
  assert.equal(v01.conditionScreen.sourceAssessmentId, clear.id);
  assert.equal(v01.conditionScreen.reportIndex, 0);
  assert.equal(v01.conditionScreen.reportSchemaVersion, "fa5x-condition-report-1");

  const v02 = generate(u, assessment(u, { report: { armsUsed: "yes", physicalAssistance: "no" } }));
  assert.equal(v02.status, "no_candidates", "V02");
  assert.deepEqual(reasonCodes(v02), ["g01_assistance_not_covered"]);
  const v03 = generate(u, assessment(u, { report: { armsUsed: "unknown", physicalAssistance: "no" } }));
  assert.equal(v03.status, "no_candidates", "V03");
  assert.deepEqual(reasonCodes(v03), ["g01_condition_unconfirmed"]);
  const v04 = generate(u, assessment(u));
  assert.equal(v04.status, "no_candidates", "V04 no report");
  assert.deepEqual(v04.conditionScreen.armsUsed, "missing", "missing is never read as no");
  const v05 = generate(u, assessment(u, { report: { armsUsed: "no", physicalAssistance: "yes" } }));
  assert.deepEqual(reasonCodes(v05), ["g01_assistance_not_covered"], "V05");
  assert.deepEqual(v05.excluded.find((e) => e.exerciseId === "F01-04").screenReasons[0].fields, [{ field: "physicalAssistance", state: "yes" }]);

  // V06 only the seconds differ -> identical output apart from the assessment id
  const slow = assessment(u, { ms: 25000, report: NO });
  // the two runs differ only in seconds; their assessment ids and report times are normalized
  const norm = (r) => JSON.parse(JSON.stringify(r).replaceAll(/functionalAssessment_\w+/g, "ID").replaceAll(/"reportedAt":"[^"]+"/g, '"reportedAt":"T"'));
  assert.deepEqual(norm(generate(u, slow)), norm(v01), "V06 seconds never change the result");
  // V07–V09 only the time differs
  assert.deepEqual(ids(generate(u, clear, { minutes: 10 })), ["F01-04"], "V07");
  assert.equal(generate(u, clear, { minutes: 10 }).shortfall, undefined, "V07 no shortfall at 1 slot");
  assert.deepEqual(generate(u, clear, { minutes: 15 }).shortfall, { requested: 2, available: 1 }, "V08");
  assert.deepEqual(generate(u, clear, { minutes: null }).shortfall, { requested: 3, available: 1 }, "V09");
  // V10 L05: limitation matching unchanged; the difference comes from the screen only
  const v10 = generate(u, clear, { limits: ["L05"] });
  assert.deepEqual(ids(v10), ["F01-04"], "V10");
  assert.ok(v10.items[0].matchedConditions.some((c) => c.ruleId === "R03"));
  // V12 other goals: no screen, the snapshot (any) has no effect
  for (const g of ["G02", "G03", "G04", "G05"]) {
    for (const minutes of [10, 15, 20, null]) {
      const plain = generate(u, clear, { goal: g, minutes });
      const withYes = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: clear.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: g, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true,
        g01Conditions: { ...v02.conditionScreen } });
      assert.deepEqual(withYes, plain, `V12 ${g} ${minutes}`);
      assert.equal(plain.conditionScreen, undefined);
      assert.ok(!plain.basis.some((b) => b.key === "g01_conditions"));
      assert.ok(plain.excluded.every((e) => !e.reasonCategory), `${g}: no G01 reason`);
    }
  }
  // the global exclusion table and the D5-shared pool order are untouched
  assert.deepEqual({ ...F01_AUTO_RECOMMENDATION_EXCLUSIONS }, { "F01-19": "counting_basis_pending" });
  assert.deepEqual(orderF01GoalCandidates({ goal: F01_GOALS[0], catalog }).ordered.map((c) => c.exercise.id), ["F01-04", "F01-01", "F01-10"]);
}

// ── yes + unknown together: both reasons kept, never only "please backfill" ──
{
  const u = "g01-mixed";
  const r = generate(u, assessment(u, { report: { armsUsed: "yes", physicalAssistance: "unknown" } }));
  assert.equal(r.status, "no_candidates");
  assert.deepEqual(reasonCodes(r), ["g01_assistance_not_covered", "g01_condition_unconfirmed"]);
  const info = V.describeG01NoCandidates(r);
  assert.equal(info.assistanceReported, true);
  assert.equal(info.canBackfill, false, "a reported assistance is never unlocked by backfilling");
  const lines = info.rows.find((x) => x.exerciseId === "F01-04").reasons;
  assert.deepEqual(lines.map((l) => l.label), ["目前未支援", "資料未確認"]);
  // unknown only -> backfill offered
  assert.equal(V.describeG01NoCandidates(generate(u, assessment(u, { report: { armsUsed: "unknown", physicalAssistance: "unknown" } }))).canBackfill, true);
}

// ── not the patient's own / not the recommendation's / invalid values: never a basis ──
{
  const u = "g01-own";
  const others = assessment("someone-else", { report: NO });
  const snap = SCR.buildG01ConditionSnapshot({ patientId: u, assessmentId: others.id, session: others });
  assert.equal(snap.sourceProblem, "assessment_not_owned");
  assert.equal(snap.armsUsed, "missing");
  assert.equal(SCR.screenG01SitToStand(snap).passed, false);
  const mine = assessment(u, { report: NO });
  assert.equal(SCR.buildG01ConditionSnapshot({ patientId: u, assessmentId: "another-id", session: mine }).sourceProblem, "assessment_mismatch");
  // a report written by another account (not possible through the service; injected) is not used
  sessions.update(mine.id, { conditionReports: [{ ...mine.conditionReports[0], reportedBy: "intruder" }] });
  assert.equal(SCR.buildG01ConditionSnapshot({ patientId: u, assessmentId: mine.id, session: functionalAssessmentService.getById(mine.id) }).sourceProblem, "reporter_not_owner");
  // invalid stored value -> "invalid", unconfirmed (never "no")
  sessions.update(mine.id, { conditionReports: [{ ...mine.conditionReports[0], armsUsed: "nope" }] });
  const inv = SCR.buildG01ConditionSnapshot({ patientId: u, assessmentId: mine.id, session: functionalAssessmentService.getById(mine.id) });
  assert.equal(inv.armsUsed, "invalid");
  assert.deepEqual(SCR.screenG01SitToStand(inv).reasons.map((r) => r.code), ["g01_condition_unconfirmed"]);
  // an invalid / incomplete assessment stays blocked (R00), for G01 as for every goal
  const bad = assessment(u, { status: "invalid", report: NO });
  assert.equal(generateF01GoalRecommendation({ assessment: { status: "invalid", sessionId: bad.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G01", catalog }).status, "blocked");
  assert.equal(SCR.buildG01ConditionSnapshot({ patientId: u, assessmentId: bad.id, session: { ...bad, status: "in_progress" } }).sourceProblem, "assessment_not_completed");
}

// ── backfill -> a NEW recommendation; earlier report and records kept ──
{
  const u = "g01-backfill";
  const s = assessment(u, { report: { armsUsed: "unknown", physicalAssistance: "no" } });
  const first = generate(u, s);
  assert.equal(first.status, "no_candidates");
  assert.ok(recommendationService.createF01GoalRecommendation({ patientId: u, result: first }).error, "a zero-candidate result is never saved");
  assert.ok(!functionalAssessmentService.appendFa5xConditionReport(s.id, { ...NO, source: "self_report" }, { reportedBy: u }).error);
  const after = functionalAssessmentService.getById(s.id);
  assert.equal(after.conditionReports.length, 2, "the earlier report is kept");
  assert.equal(after.conditionReports[0].armsUsed, "unknown");
  const second = generate(u, after);
  assert.deepEqual(ids(second), ["F01-04"]);
  assert.equal(second.conditionScreen.reportIndex, 1, "the latest report is the one used");
  const saved = recommendationService.createF01GoalRecommendation({ patientId: u, result: second, createdBy: u }).recommendation;
  const started = await INIT.startRecommendationCycle({ userId: u, recommendationId: saved.id }, { syncWrites: async () => ({ ok: true, failed: [] }), completionRulesVersion: V2 });
  assert.ok(started.cycle && started.created, `condition all no -> one candidate -> week starts normally: ${JSON.stringify(started)}`);
  assert.equal(INIT.canTrainFromRecommendation(saved.id), true);
  // a later backfill / regeneration never rewrites the saved plan
  const before = JSON.stringify(recs.getById(saved.id));
  functionalAssessmentService.appendFa5xConditionReport(s.id, { armsUsed: "yes", physicalAssistance: "no", source: "self_report" }, { reportedBy: u });
  assert.equal(generate(u, functionalAssessmentService.getById(s.id)).status, "no_candidates");
  assert.equal(JSON.stringify(recs.getById(saved.id)), before, "earlier plan unchanged");
  assert.equal(trackingCycleService.getActiveTrackingCycle(u).recommendationId, saved.id, "its cycle unchanged");
}

// ── zero candidates: no cycle is created / re-linked, nothing is trained (service checks too) ──
{
  const u = "g01-zero";
  const s = assessment(u, { report: NO });
  // an ordinary running week on an earlier (pre-screen style) plan
  const okRec = recommendationService.createF01GoalRecommendation({ patientId: u, result: generate(u, s, { goal: "G02" }), createdBy: u }).recommendation;
  const running = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: s, recommendation: okRec, completionRulesVersion: V2 }).cycle;
  assert.ok(running);
  // an empty first recommendation arriving some other way (the App never saves one)
  const empty = recs.create({ ...recs.getById(okRec.id), id: "recommendation_g01_empty", selectedGoalId: "G01", items: [], exerciseIds: [], initialReview: IR.buildInitialReviewMarker({ limitationIds: [], items: [] }) });
  assert.equal(IR.isEmptyFirstRecommendation(empty), true);
  const res = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: s, recommendation: empty, completionRulesVersion: V2 });
  assert.equal(res.error, "recommendation_has_no_items");
  assert.equal(trackingCycleService.getTrackingCycleById(running.id).recommendationId, okRec.id, "the running week is never re-linked");
  const viaService = await INIT.startRecommendationCycle({ userId: u, recommendationId: empty.id }, { syncWrites: async () => ({ ok: true, failed: [] }), completionRulesVersion: V2 });
  assert.equal(viaService.error, "recommendation_has_no_items");
  assert.equal(INIT.canTrainFromRecommendation(empty.id), false, "no training from it");
  assert.equal(INIT.canTrainFromRecommendation(okRec.id), true, "the existing plan's entry stays open");
  // a new user with no cycle: nothing is created either
  const u2 = "g01-zero-2";
  const s2 = assessment(u2, { report: { armsUsed: "yes", physicalAssistance: "yes" } });
  const r2 = generate(u2, s2);
  assert.equal(r2.status, "no_candidates");
  assert.ok(recommendationService.createF01GoalRecommendation({ patientId: u2, result: r2 }).error);
  assert.equal(trackingCycleService.listTrackingCycles(u2).length, 0);
  // an existing cycle on an existing (pre-screen) G01 plan keeps running
  const legacy = recs.create({ ...recs.getById(okRec.id), id: "recommendation_g01_legacy", patientId: u2, selectedGoalId: "G01", sourceAssessmentId: s2.id,
    items: ["F01-04", "F01-01", "F01-10"].map((id, i) => ({ ...okRec.items[0], rank: i + 1, exerciseId: id, selectedGoalId: "G01" })), exerciseIds: ["F01-04", "F01-01", "F01-10"] });
  const legacyCycle = trackingCycleService.createOrGetTrackingCycle({ userId: u2, baselineSession: s2, recommendation: legacy, completionRulesVersion: V2 });
  assert.ok(legacyCycle.cycle && !legacyCycle.error, "an existing 3-item G01 plan is not re-screened");
  assert.equal(INIT.canTrainFromRecommendation(legacy.id), true);
}

// ── 其他可選動作 never puts this recommendation's left-out exercises back ──
{
  const u = "g01-others";
  const s = assessment(u, { report: NO });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: generate(u, s, { minutes: 10 }), createdBy: u }).recommendation;
  assert.deepEqual(V.listF01OtherOptions(rec, catalog).map((o) => o.exerciseId), [], "F01-01 / F01-10 not offered back");
  const legacy = { ...rec, conditionScreen: undefined, excluded: [] };
  assert.deepEqual(V.listF01OtherOptions(legacy, catalog).map((o) => o.exerciseId), ["F01-01", "F01-10"], "a pre-screen record: unchanged");
  const g02 = recommendationService.createF01GoalRecommendation({ patientId: u, result: generate(u, s, { goal: "G02", minutes: 10 }), createdBy: u }).recommendation;
  assert.equal(V.listF01OtherOptions(g02, catalog).length, orderF01GoalCandidates({ goal: F01_GOALS[1], catalog }).ordered.length - 1, "G02: unchanged");
}

// ── pages (lifted from app.js) ──
function fnSource(name) {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
}
const constSource = (name) => { const s = appJs.indexOf(`const ${name} =`); assert.ok(s >= 0, name); return appJs.slice(s, appJs.indexOf(";\n", s) + 1); };
const state = {};
let currentUser = null;
let linked = false;
const deps = { state, getCurrentPatientId: () => currentUser, recommendationService, exerciseService, trackingCycleService, functionalAssessmentService, MATCH_LEVEL, D5_PROPOSAL_ORIGIN,
  formatDateKeyMonthDay: T.formatDateKeyMonthDay, toLocalDateKey: T.toLocalDateKey, EXERCISE_ASSET_AUDIT, resolveExerciseMedia, renderExerciseCardImage: (ex) => `<img alt="${ex.name}">`,
  getInitialArrangement: INIT.getInitialArrangement, relationService: { findAcceptedByPatientId: () => (linked ? [{ id: "rel" }] : []) }, ...V, ...D5V };
const page = new Function(...Object.keys(deps), [
  constSource("F01_MATCH_LEVEL_TEXT"), constSource("F01_DEMO_IMAGE_PENDING"), fnSource("renderF01RecommendationImage"), fnSource("f01RecommendationResultPage"), fnSource("renderG01NoCandidatesPage"),
  fnSource("renderF01InitialReviewNotice"), fnSource("renderInviteCodeCard"), fnSource("renderF01ReloadControl"), fnSource("escapeD5Text"), constSource("d5ExerciseName"), fnSource("d5ReviewVolumeText"),
  "return f01RecommendationResultPage;",
].join("\n"))(...Object.values(deps));
const open = (u, { recId = null, empty = null, sourceAssessmentId = null } = {}) => {
  currentUser = u;
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, { f01RecommendationId: recId, f01RecEmpty: empty, f01RecCycleNotice: null, f01RecResultOrigin: "setup", f01RecSetup: { sourceAssessmentId } });
  return page();
};
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const FORBIDDEN = /已確認安全|不適合運動|推薦準確度|準確率提升|禁止自主|禁忌症/;

{
  // one candidate: stated as one, not a full-length session
  const u = "g01-page-one";
  const s = assessment(u, { report: NO });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: generate(u, s, { minutes: 20 }), createdBy: u }).recommendation;
  trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: s, recommendation: rec, completionRulesVersion: V2 });
  const html = open(u, { recId: rec.id });
  const t = text(html);
  assert.ok(t.includes("目前提供 1 個動作"));
  assert.ok(t.includes("你選了 20 分鐘，本版目前只提供 1 個動作，不是 20 分鐘的完整課表或處方。"));
  assert.ok(t.includes(V.F01_G01_SCREEN_NOTE) && t.includes("沒有用手撐、沒有人協助（本版協助條件篩選）"));
  assert.ok(html.includes("startF01RecommendedTraining('F01-04')"), "normal start");
  assert.ok(!html.includes("startF01RecommendedTraining('F01-01')") && !html.includes("startF01RecommendedTraining('F01-10')"));
  assert.ok(t.includes("未納入的動作（2）") && t.includes("本版未納入") && t.includes("不是禁忌") && t.includes("不代表這個動作無效"));
  assert.ok(!html.includes("其他可選動作"), "no other options re-adding F01-01 / F01-10");
  assert.ok(!FORBIDDEN.test(t), (t.match(FORBIDDEN) || [])[0]);
}
{
  // zero: reported assistance -> reasons + contact, no backfill-as-unlock, no start
  const u = "g01-page-yes";
  const s = assessment(u, { report: { armsUsed: "yes", physicalAssistance: "unknown" } });
  const r = generate(u, s);
  let html = open(u, { empty: r, sourceAssessmentId: s.id });
  let t = text(html);
  assert.ok(t.includes("這次沒有自動列出動作") && t.includes("不需要為了取得推薦而更改回答"));
  assert.ok(t.includes("目前未支援") && t.includes("資料未確認") && t.includes("本版未納入"), "all three kinds kept apart");
  assert.ok(t.includes("不會開始或改變 7 日追蹤"));
  assert.ok(!html.includes("前往補充測試條件"), "no backfill entry when assistance was reported");
  assert.ok(!html.includes("startF01RecommendedTraining(") && !html.includes("retryF01RecommendationCycleFromUi("));
  assert.ok(html.includes("onInviteCodeQuery()"), "unlinked: existing invite-code entry");
  assert.ok(!FORBIDDEN.test(t), (t.match(FORBIDDEN) || [])[0]);
  linked = true;
  html = open(u, { empty: r, sourceAssessmentId: s.id });
  assert.ok(text(html).includes("可以主動告訴你的復健師") && text(html).includes("系統不會另外通知復健師") && !html.includes("onInviteCodeQuery()"));
  linked = false;
  // zero: unknown / missing -> backfill through the existing condition form (never pre-filled)
  const u2 = "g01-page-unknown";
  const s2 = assessment(u2);
  html = open(u2, { empty: generate(u2, s2), sourceAssessmentId: s2.id });
  t = text(html);
  assert.ok(t.includes("協助條件尚未確認") && t.includes("尚未回報") && t.includes("系統不會把未回報或不確定當成「沒有」"));
  assert.ok(html.includes(`goFiveTimesSitToStandResult('${s2.id}')`) && t.includes("題目不會預先選好答案"));
  assert.ok(!FORBIDDEN.test(t));
  // the condition form itself never pre-selects (existing form, unchanged)
  const form = fnSource("renderFa5xConditionSection");
  assert.ok(!/checked/.test(form.replace(/:checked/g, "")), "condition form has no pre-checked answer");
}
{
  // an existing cycle: opening a zero result never touches it
  const u = "g01-page-cycle";
  const s = assessment(u, { report: NO });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: u, result: generate(u, s, { goal: "G02" }), createdBy: u }).recommendation;
  const c = trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: s, recommendation: rec, completionRulesVersion: V2 }).cycle;
  const snapshot = JSON.stringify(cycles.list());
  open(u, { empty: generate(u, assessment(u, { report: { armsUsed: "yes", physicalAssistance: "no" } })), sourceAssessmentId: s.id });
  assert.equal(JSON.stringify(cycles.list()), snapshot);
  assert.equal(trackingCycleService.getActiveTrackingCycle(u).id, c.id);
}

// ── app.js wiring ──
{
  const gen = appJs.slice(appJs.indexOf("async function generateF01RecommendationFromSetup("), appJs.indexOf("async function retryF01RecommendationCycleFromUi("));
  assert.ok(gen.includes("buildG01ConditionSnapshot({ patientId, assessmentId: s.sourceAssessmentId, session })"), "the recommendation's own assessment + current patient");
  assert.ok(/if \(result\.status !== "ok"\) \{\s*state\.f01RecEmpty = result;\s*state\.f01RecommendationId = null;/.test(gen), "zero candidates: nothing saved, no cycle");
  assert.ok(fnSource("goF01RecommendationResult").includes("state.f01RecEmpty = null"), "opening a saved plan never shows a previous no-candidate result");
  const engine = readFileSync(join(root, "js/data/f01GoalRecommendation.js"), "utf8");
  assert.ok(!/localStorage|createCollection|Date\.now|new Date/.test(engine.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "")), "generator stays pure");
  // no production way to skip the G01 screen: it is decided by the goal alone, and the pre-screen engine is test-only
  assert.equal((engine.match(/const screenG01 = /g) || []).length, 1);
  assert.ok(engine.includes("const screenG01 = goal.goalId === F01_G01_SCREEN_GOAL_ID;"), "screen switched only by the goal");
  const sig = engine.slice(engine.indexOf("export function generateF01GoalRecommendation("), engine.indexOf(") {", engine.indexOf("export function generateF01GoalRecommendation(")));
  assert.ok(!/skip|disable|bypass|screen/i.test(sig), `no screen-off parameter: ${sig}`);
  const prod = [appJs, ...["js/data", "js/ui", "js/services", "js/dev"].flatMap((d) => readdirSync(join(root, d)).filter((f) => f.endsWith(".js")).map((f) => readFileSync(join(root, d, f), "utf8")))];
  assert.ok(prod.every((src) => !src.includes("f01PreScreenEngine") && !src.includes("screenG01 = false")), "pre-screen engine never reachable from app code");
  const rules = readFileSync(join(root, "firestore.rules"), "utf8");
  assert.ok(rules.includes("d.exerciseIds.size() > 0") && rules.includes("get(recPath(data.recommendationId)).data.exerciseIds.size() > 0"), "rules: no empty first plan, no cycle on one");
}

console.log("f01G01ConditionScreen: all assertions passed");
