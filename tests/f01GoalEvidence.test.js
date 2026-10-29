process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * G01「從椅子起身更順」evidence trail (js/data/f01GoalEvidence.js) on the first-recommendation
 * page: the patient's goal, the assessment record and the selection method shown apart;
 * per-card relation, study scope and limits with the source link. Display only — the
 * candidate set, order, count, amount and filters are unchanged. Isolated in-memory data
 * through the real services; f01RecommendationResultPage lifted from app.js.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const EV = await import("../js/data/f01GoalEvidence.js");
const V = await import("../js/ui/f01RecommendationView.js");
const D5V = await import("../js/ui/d5ProposalView.js");
const INIT = await import("../js/data/f01InitialReviewService.js");
const T = await import("../js/data/trackingCycle.js");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: FA5X_M } = await import("../js/data/fa5xMeasurementCompatibility.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService, D5_PROPOSAL_ORIGIN } = await import("../js/data/recommendationService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation, MATCH_LEVEL } = await import("../js/data/f01GoalRecommendation.js");
const { F01_GOALS } = await import("../js/data/f01RecommendationSpec.js");
const { resolveExerciseMedia, EXERCISE_ASSET_AUDIT } = await import("../js/data/exerciseAssets.js");
const { createCollection } = await import("../js/data/storageService.js");
const { buildG01ConditionSnapshot } = await import("../js/data/f01G01ConditionScreen.js");
const { buildInitialReviewMarker } = await import("../js/data/f01InitialReview.js");

const catalog = exerciseService.listNormalized();
const recs = createCollection("recommendationResults");
const G01 = F01_GOALS.find((g) => g.goalId === "G01");

function session(u, ms) {
  const s = functionalAssessmentService.create({ patientId: u, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  functionalAssessmentService.completeSession(s.id, { result: { ...FA5X_M, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: ms, measuredAt: new Date(2026, 9, 27, 9, 0).toISOString() } });
  // a condition report that passes the G01 condition screen (no arms, no assistance)
  functionalAssessmentService.appendFa5xConditionReport(s.id, { armsUsed: "no", physicalAssistance: "no", source: "self_report" }, { reportedBy: u });
  return functionalAssessmentService.getById(s.id);
}
const generate = (b, goal, minutes, limits = []) => generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: goal, limitationIds: limits, availableMinutes: minutes, catalog, excludeAutoRecommendationPending: true,
  g01Conditions: goal === "G01" ? buildG01ConditionSnapshot({ patientId: b.patientId, assessmentId: b.id, session: b }) : null });
/**
 * A G01 record as stored BEFORE the condition screen (3 items: F01-04 / F01-01 / F01-10). Existing records are never
 * rewritten, so their page must look exactly as before; built from today's F01-04 item, without conditionScreen.
 */
function legacyG01(b, minutes) {
  const r = generate(b, "G01", minutes);
  const base = r.items[0];
  const item = (exerciseId, rank, matchLevel) => {
    const ex = catalog.find((e) => e.id === exerciseId);
    return { ...base, rank, exerciseId, exerciseName: ex.name, matchLevel, aiSupported: !!ex.aiSupported,
      matchedConditions: base.matchedConditions.filter((c) => c.ruleId !== "G01-C1").map((c) => (c.ruleId === "R02" && matchLevel === MATCH_LEVEL.SUPPORTING ? { ...c, text: `「${base.selectedGoalLabel}」相關輔助訓練` } : c)) };
  };
  const items = [item("F01-04", 1, MATCH_LEVEL.DIRECT), item("F01-01", 2, MATCH_LEVEL.SUPPORTING), item("F01-10", 3, MATCH_LEVEL.SUPPORTING)];
  const { conditionScreen, shortfall, ...rest } = r;
  return { ...rest, items, excluded: [], basis: r.basis.filter((x) => x.key !== "g01_conditions") };
}
const save = (u, result) => recommendationService.createF01GoalRecommendation({ patientId: u, result, createdBy: u }).recommendation;
const ids = (items) => items.map((i) => `${i.exerciseId}:${i.matchLevel}`);

// ── 1. only the assessment seconds change -> G01 candidates and order unchanged ──
{
  const fast = session("p-fast", 7200);
  const slow = session("p-slow", 24800);
  for (const minutes of [null, 10, 15, 20]) {
    for (const limits of [[], ["L01"], ["L02", "L05"]]) {
      assert.deepEqual(ids(generate(fast, "G01", minutes, limits).items), ids(generate(slow, "G01", minutes, limits).items), `G01 ${minutes} ${limits}`);
    }
  }
  // was ["F01-04:direct", "F01-01:supporting", "F01-10:supporting"]: G01 condition screen v1 lists F01-04 only
  assert.deepEqual(ids(generate(fast, "G01", 20).items), ["F01-04:direct"]);
}

// ── 2. structured records: match the spec's relation, one study each, never mixed ──
{
  const want = { "F01-04": ["direct", "11890578"], "F01-01": ["supporting", "36853505"], "F01-10": ["supporting", "35815985"] };
  assert.equal(EV.F01_GOAL_EVIDENCE.length, 3);
  for (const [exerciseId, [relation, pmid]] of Object.entries(want)) {
    const e = EV.getGoalEvidence("G01", exerciseId);
    assert.ok(e, exerciseId);
    assert.equal(e.relation, relation);
    assert.equal(relation === "direct" ? G01.directExerciseIds.includes(exerciseId) : G01.supportingExerciseIds.includes(exerciseId), true, `${exerciseId} relation is the spec's`);
    assert.deepEqual(e.studies.map((s) => s.pmid), [pmid]);
    assert.equal(e.studies[0].url, `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`);
    for (const f of ["title", "year", "population", "intervention", "mainResults", "supports", "cannotInfer", "readVia"]) assert.ok(e.studies[0][f], `${exerciseId}.${f}`);
    assert.equal(e.mappingStatus, "System Rule - needs validation");
  }
  assert.equal(EV.getGoalEvidence("G02", "F01-01"), null, "no record outside G01");
  // ── 3. found / read / confirmed kept apart ──
  for (const e of EV.F01_GOAL_EVIDENCE) {
    assert.deepEqual(EV.evidenceStatus(e), { studyFound: true, fullTextRead: false, professionallyConfirmed: false });
    assert.ok(e.studies.every((s) => s.readLevel === EV.EVIDENCE_READ_LEVEL.ABSTRACT_READ));
    assert.equal(e.professionalReview, EV.PROFESSIONAL_REVIEW.PENDING);
  }
}

// ── pages ──
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
const deps = { state, getCurrentPatientId: () => currentUser, recommendationService, exerciseService, trackingCycleService, functionalAssessmentService, MATCH_LEVEL, D5_PROPOSAL_ORIGIN,
  formatDateKeyMonthDay: T.formatDateKeyMonthDay, toLocalDateKey: T.toLocalDateKey, EXERCISE_ASSET_AUDIT, resolveExerciseMedia, renderExerciseCardImage: (ex) => `<img alt="${ex.name}">`,
  getInitialArrangement: INIT.getInitialArrangement, relationService: { findAcceptedByPatientId: () => [] }, ...V, ...D5V };
const page = new Function(...Object.keys(deps), [
  constSource("F01_MATCH_LEVEL_TEXT"), constSource("F01_DEMO_IMAGE_PENDING"), fnSource("renderF01RecommendationImage"), fnSource("f01RecommendationResultPage"),
  fnSource("renderF01InitialReviewNotice"), fnSource("renderInviteCodeCard"), fnSource("renderF01ReloadControl"), fnSource("escapeD5Text"), constSource("d5ExerciseName"), fnSource("d5ReviewVolumeText"),
  "return f01RecommendationResultPage;",
].join("\n"))(...Object.values(deps));
const open = (u, recId) => { currentUser = u; for (const k of Object.keys(state)) delete state[k]; Object.assign(state, { f01RecommendationId: recId, f01RecEmpty: null, f01RecCycleNotice: null, f01RecResultOrigin: "setup" }); return page(); };
const text = (h) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const cards = (html) => html.split('<div class="card f01-rec-card">').slice(1);
const FORBIDDEN = /已確認安全|適合你|療效|已證實|已證明|個人化訓練量|診斷出/;

{
  const u = "p-g01";
  const b = session(u, 9300);
  // an existing (pre-screen) 3-item G01 record — its page is unchanged by the condition screen
  const rec = save(u, legacyG01(b, 20));
  assert.equal(rec.initialReview.required, buildInitialReviewMarker({ limitationIds: [], items: rec.items }).required);
  trackingCycleService.createOrGetTrackingCycle({ userId: u, baselineSession: b, recommendation: rec });
  const html = open(u, rec.id);
  const t = text(html);
  // basis: goal / assessment / selection method apart
  for (const h of ["你選擇的目標", "本次評估紀錄", "選取方式"]) assert.ok(t.includes(h), h);
  assert.ok(t.includes("從椅子起身更順") && t.includes("完成 5 次，用時 9.3 秒") && t.includes("2026.10.27"), "own valid assessment result + date");
  assert.ok(t.includes(V.F01_SELECTION_METHOD_NOTE) && t.includes(V.F01_MAPPING_STATUS_NOTE));
  assert.ok(t.includes("沒有參與動作排序、難度或訓練量的決定"));
  const [c04, c01, c10] = cards(html);
  const main = (c) => c.split('<details class="f01-rec-why">')[0];
  const fold = (c) => c.split('<details class="f01-rec-why">')[1];
  // short reasons (visible) — the exact sentence for 坐姿起立; supporting ones as system-set candidates
  assert.ok(main(c04).includes("你選擇「從椅子起身更順」作為目標。坐姿起立直接練習由坐到站的動作，因此列為主要候選。"));
  assert.ok(main(c01).includes("深蹲是現有系統設定中「從椅子起身更順」的輔助候選") && main(c01).includes("不是由評估結果判斷出的需求"));
  assert.ok(main(c10).includes("橋式是現有系統設定中「從椅子起身更順」的輔助候選") && main(c10).includes("不是由評估結果判斷出的需求"));
  for (const c of [c04, c01, c10]) assert.ok(!/PubMed|研究：|摘要/.test(main(c)), "no study text in the main card area");
  // fold: each card cites only its own study
  const pm = { 11890578: c04, 36853505: c01, 35815985: c10 };
  for (const [pmid, c] of Object.entries(pm)) {
    assert.ok(fold(c).includes(`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`), `card cites ${pmid}`);
    for (const other of Object.keys(pm).filter((x) => x !== pmid)) assert.ok(!c.includes(other), `card ${pmid} never cites ${other}`);
    assert.ok(fold(c).includes("支持到哪裡") && fold(c).includes("不能推論"));
    // abstract read != full text read != professionally confirmed
    assert.ok(fold(c).includes("只讀過公開摘要，尚未讀全文") && fold(c).includes("尚未經專業人員確認此對應") && fold(c).includes("系統規則，待專業驗證"));
    assert.ok(!fold(c).includes("已讀全文") && !fold(c).includes("已經專業人員確認此對應"));
  }
  assert.ok(fold(c01).includes("沒有觀察到改善") && fold(c01).includes("不能據此說深蹲普遍無效"));
  assert.ok(fold(c10).includes("急性缺血性中風") && fold(c10).includes("不能直接外推到所有居家使用者"));
  assert.ok(fold(c04).includes("不能當成 App 單一「坐姿起立」動作或其預設組數、次數的直接驗證"));
  assert.ok(!FORBIDDEN.test(t), `no safety / suitability / efficacy / personalised-amount claims: ${(t.match(FORBIDDEN) || [])[0]}`);
  // amounts and order exactly as before
  assert.deepEqual(cards(html).map((c) => (c.match(/f01-rec-rank">(\d+)/) || [])[1]), ["01", "02", "03"]);
  for (const [c, id] of [[c04, "F01-04"], [c01, "F01-01"], [c10, "F01-10"]]) assert.ok(c.includes(V.formatPlanVolume(V.describePlanVolume(exerciseService.getById(id), null))), `${id} amount unchanged`);
  assert.ok(html.includes("startF01RecommendedTraining('F01-04')"), "training entry unchanged for a normal G01 plan");

  // only the seconds differ -> same cards, only the assessment record differs
  const b2 = session("p-g01-b", 21500);
  const rec2 = save("p-g01-b", legacyG01(b2, 20));
  const html2 = open("p-g01-b", rec2.id);
  assert.ok(text(html2).includes("用時 21.5 秒"));
  // card bodies only (the last split also holds the page footer), record ids normalized
  const strip = (h) => cards(h).map((c) => c.split('<details class="card')[0].split('<p class="small fa5x-muted f01-rec-note"')[0].replace(/(functionalAssessment|recommendation)_\w+/g, "ID"));
  assert.deepEqual(strip(html2), strip(html), "cards identical when only the seconds differ");
}

// ── 4. existing protections kept: missing / not-owned assessment, pending review ──
{
  const u = "p-g01-prot";
  const b = session(u, 9000);
  const rec = save(u, generate(b, "G01", 10));
  recs.update(rec.id, { sourceAssessmentId: "missing-session" });
  let t = text(open(u, rec.id));
  assert.ok(t.includes("推薦依據有限") && t.includes("無法確認"), "missing assessment -> limited basis");
  const other = session("someone-else", 9000);
  recs.update(rec.id, { sourceAssessmentId: other.id });
  t = text(open(u, rec.id));
  assert.ok(t.includes("推薦依據有限") && !t.includes("用時 9.0 秒"), "another account's assessment is never shown");
  // a G01 record held for review (synthetic marker: G01 lists have no F01-11 under current rules)
  recs.update(rec.id, { sourceAssessmentId: b.id, initialReview: { required: true, triggerCodes: ["l05_f01_11_initial"], checkVersion: "f01-initial-review-1" } });
  const held = open(u, rec.id);
  assert.ok(held.includes("待復健師檢視") && !held.includes("startF01RecommendedTraining("), "pending review still blocks training");
}

// ── 5. G02–G05 unchanged ──
for (const goal of ["G02", "G03", "G04", "G05"]) {
  const u = `p-${goal}`;
  const b = session(u, 9000);
  const rec = save(u, generate(b, goal, 15));
  const html = open(u, rec.id);
  assert.ok(!html.includes("f01-goal-evidence") && !html.includes("選取方式") && !html.includes("PubMed"), `${goal}: no evidence trail`);
  assert.ok(text(html).includes("評估秒數用來確認這次評估有效；動作排序依你選的目標與條件，不依秒數高低調整。"), `${goal}: previous basis note`);
  const first = rec.items[0];
  assert.ok(cards(html)[0].split('<details class="f01-rec-why">')[0].includes(V.explainF01Item(first, { limitationsApplied: false })[0]), `${goal}: previous short reason`);
}

console.log("f01GoalEvidence: all assertions passed");
