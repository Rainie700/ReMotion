import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * 5xSTS batch A — condition reports, display, trend line breaks, scope guards.
 * Design: docs/verification/fa5x-criteria-evidence/RESULT_USABILITY_DESIGN.md (第四版) A.7 (AD1–AD7, AS1).
 * The Firestore permission cases (AR1–AR15) are NOT here: they need the emulator
 * (scripts/fa5xSessionRulesCheck.mjs). Nothing in this file proves cloud protection.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const appJs = read("app.js");
const CR = await import("../js/data/fa5xConditionReport.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { buildAssessmentSeries, buildF01TrackingTimeline } = await import("../js/data/functionalProgressService.js");
const { REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } = await import("../js/data/trackingCycleService.js");
const { FA5X_CURRENT_MEASUREMENT_FIELDS: CUR } = await import("../js/data/fa5xMeasurementCompatibility.js");

const hash = (v) => createHash("md5").update(JSON.stringify(v)).digest("hex");
const U = "cond-user";
const answers = (over = {}) => ({ armsUsed: "no", physicalAssistance: "no", chairHeightCm: null, sameChairAsBaseline: "not_applicable", source: "self_report", ...over });
function fa5x(result, patientId = U) {
  const s = functionalAssessmentService.create({ patientId, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  if (result) functionalAssessmentService.completeSession(s.id, { result });
  return functionalAssessmentService.getById(s.id);
}
const done = (over = {}) => ({ ...CUR, status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 8900, measuredAt: "2026-10-20T02:00:00.000Z", ...over });

// ── AD1 append keeps the measurement; reportedBy is the owner ──
{
  const s = fa5x(done());
  const before = hash(s.result);
  const r1 = functionalAssessmentService.appendFa5xConditionReport(s.id, answers(), { reportedBy: U });
  assert.ok(!r1.error, r1.error);
  assert.equal(r1.report.reportedBy, U);
  assert.equal(r1.report.schemaVersion, CR.FA5X_CONDITION_REPORT_SCHEMA);
  assert.deepEqual(Object.keys(r1.report).sort(), [...CR.FA5X_CONDITION_REPORT_FIELDS].sort(), "stored fields = the list firestore.rules allows");
  const r2 = functionalAssessmentService.appendFa5xConditionReport(s.id, answers({ armsUsed: "unknown" }), { reportedBy: U });
  const after = functionalAssessmentService.getById(s.id);
  assert.equal(hash(after.result), before, "result unchanged by reports");
  assert.equal(after.status, "completed");
  assert.equal(after.conditionReports.length, 2, "append-only: both kept");
  assert.deepEqual(after.conditionReports[0], r1.report, "first report unchanged");
  assert.equal(CR.getLatestFa5xConditionReport(after).armsUsed, "unknown", "latest counts");
  assert.ok(r2.session.conditionReports.length === 2);
}

// ── AD2 refused writes leave the data unchanged ──
{
  const s = fa5x(done());
  const snap = JSON.stringify(functionalAssessmentService.getById(s.id));
  const bad = [
    [answers({ armsUsed: "maybe" }), U, "invalid_arms_used"],
    [answers({ physicalAssistance: undefined }), U, "invalid_physical_assistance"],
    [answers({ source: "synthetic_demo" }), U, "invalid_source"],
    [answers({ source: "therapist" }), U, "invalid_source"],
    [answers({ sameChairAsBaseline: "maybe" }), U, "invalid_same_chair"],
    [answers({ chairHeightCm: 5 }), U, "invalid_chair_height"],
    [answers({ chairHeightCm: "45" }), U, "invalid_chair_height"],
    [answers(), "someone-else", "reporter_not_owner"],
    [answers(), undefined, "reporter_not_owner"],
  ];
  for (const [a, by, err] of bad) assert.equal(functionalAssessmentService.appendFa5xConditionReport(s.id, a, { reportedBy: by }).error, err);
  assert.equal(JSON.stringify(functionalAssessmentService.getById(s.id)), snap, "nothing written");
  const shoulder = functionalAssessmentService.create({ patientId: U, bodyRegion: "shoulder" }).session;
  assert.equal(functionalAssessmentService.appendFa5xConditionReport(shoulder.id, answers(), { reportedBy: U }).error, "not_5xsts");
  const started = fa5x(null);
  assert.equal(functionalAssessmentService.appendFa5xConditionReport(started.id, answers(), { reportedBy: U }).error, "measurement_missing");
  assert.equal(functionalAssessmentService.appendFa5xConditionReport("nope", answers(), { reportedBy: U }).error, "session_not_found");
  assert.ok(functionalAssessmentService.appendFa5xConditionReport(s.id, answers({ chairHeightCm: 44.5 }), { reportedBy: U }).report);
}

// ── AD3 unknown is never "no"; every issue listed at once ──
{
  const none = CR.describeFa5xConditions({ patientId: U, conditionReports: [] });
  assert.deepEqual(none.issues, ["no_condition_report"]);
  assert.equal(none.timeLabel, "觀察時間");
  const broken = CR.describeFa5xConditions({ patientId: U, conditionReports: [{}] });
  assert.equal(broken.latest.armsUsed, "unknown");
  assert.equal(broken.latest.physicalAssistance, "unknown");
  assert.deepEqual(broken.issues, ["arms_unknown", "assistance_unknown", "source_unrecognized"], "all issues at once");
  const both = CR.describeFa5xConditions({ patientId: U, conditionReports: [{ ...answers({ armsUsed: "yes", physicalAssistance: "yes" }), reportedBy: U }] });
  assert.deepEqual(both.issues, ["arms_used", "assistance_given"]);
  assert.equal(both.timeLabel, "觀察時間");
  const clear = CR.describeFa5xConditions({ patientId: U, conditionReports: [{ ...answers(), reportedBy: U }] });
  assert.deepEqual(clear.issues, []);
  assert.equal(clear.timeLabel, "完成時間（依使用者回報的條件）");
  const foreign = CR.describeFa5xConditions({ patientId: U, conditionReports: [{ ...answers(), reportedBy: "other" }] });
  assert.deepEqual(foreign.issues, ["reporter_not_owner"]);
  const legacy = CR.describeFa5xConditions({ patientId: U });
  assert.deepEqual(legacy.issues, ["no_condition_report"], "history without the field reads as not reported");
}

// ── AD4 / AD5 result-page condition section (real app.js function, real helpers) ──
{
  const fnSource = (name) => {
    const start = appJs.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} exists`);
    let i = appJs.indexOf("{", start), depth = 0;
    for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
    return appJs.slice(start, i + 1);
  };
  let viewer = U;
  const section = new Function("deps", `const { FA5X_CONDITION_ISSUE_TEXT, FA5X_CONDITION_LABEL, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE, getCurrentPatientId } = deps;
    ${fnSource("fmtFa5xDate")}\n${fnSource("renderFa5xConditionSection")}\nreturn renderFa5xConditionSection;`)({
    FA5X_CONDITION_ISSUE_TEXT: CR.FA5X_CONDITION_ISSUE_TEXT, FA5X_CONDITION_LABEL: CR.FA5X_CONDITION_LABEL, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE, getCurrentPatientId: () => viewer,
  });
  const s = fa5x(done());
  const html = section(s, CR.describeFa5xConditions(s));
  assert.ok(html.includes("尚未回報") && html.includes("測試條件尚未回報"));
  // 2026-10-28 (UX round 4/5): shorter wording, same two facts; the questions sit behind a closed entry
  assert.ok(html.includes("系統沒有驗證") && html.includes("不會改變上方的完成時間"));
  assert.ok(html.includes('<details class="fa5x-cond-form">') && !html.includes('<details class="fa5x-cond-form" open'), "questions open only when tapped");
  assert.ok(!/checked/.test(html), "no pre-selected answer");
  assert.equal((html.match(/value="unknown"/g) || []).length, 2, "不確定 offered for both questions");
  assert.ok(!html.includes("fa5xCondSameChair"), "same-chair question only for reassessment / next-cycle baseline");
  const re = fa5x(done({ assessmentRole: REASSESSMENT_ROLE }));
  assert.ok(section(re, CR.describeFa5xConditions(re)).includes("fa5xCondSameChair"));
  viewer = "therapist-x";
  assert.ok(!section(s, CR.describeFa5xConditions(s)).includes("submitFa5xConditionReport"), "form only for the session's own patient");
  for (const w of ["已驗證", "標準完成", "有效", "準確", "權限", "防竄改"]) assert.ok(!html.includes(w), `no 「${w}」 wording`);

  const page = fnSource("fiveTimesSitToStandResultPage");
  assert.ok(page.includes("describeFa5xConditions(session)") && page.includes("${renderFa5xConditionSection(session, conditionInfo)}"));
  const nonCompleted = page.slice(page.indexOf("if (status !== FA5X_RESULT_STATUS.COMPLETED)"), page.indexOf("const repDurations"));
  assert.ok(!nonCompleted.includes("renderFa5xConditionSection"), "incomplete / invalid pages unchanged");
  assert.ok(/window\.submitFa5xConditionReport = submitFa5xConditionReport;/.test(appJs));
  const submit = fnSource("submitFa5xConditionReport");
  assert.ok(submit.includes('picked("fa5xCondArms") || "unknown"') && submit.includes('picked("fa5xCondAssist") || "unknown"'), "unanswered -> unknown, never no");
  assert.ok(submit.includes("{ reportedBy: getCurrentPatientId() }"));
}

// ── AD6 trend lines never join different measurement versions ──
{
  const sess = (id, ms, at, version) => ({ id, patientId: U, status: "completed", result: { status: "completed", repCount: 5, totalDurationMs: ms, measuredAt: at, ...version } });
  const v10 = { algorithmVersion: "fa5x-assessment-1.0" };
  const series = buildAssessmentSeries([
    sess("a", 9000, "2026-09-01T00:00:00Z", v10), sess("b", 8800, "2026-09-08T00:00:00Z", v10),
    sess("c", 8700, "2026-09-15T00:00:00Z", CUR), sess("d", 8600, "2026-09-22T00:00:00Z", CUR), sess("e", 8500, "2026-09-29T00:00:00Z", {}),
  ]);
  assert.deepEqual(series.map((p) => [p.assessmentId, p.connectsToPrevious]), [["a", false], ["b", true], ["c", false], ["d", true], ["e", false]]);
  assert.equal(series.length, 5, "every point kept");
  // 2026-10-28 (UX round 4/5): ONE chart (renderFa5xChart over buildFa5xChart). A line is drawn only inside a week
  // whose comparison is eligible (which already requires the same measurement group) — stricter than before.
  const { buildFa5xChart } = await import("../js/data/functionalProgressService.js");
  const two = { a: sess("a", 9000, "2026-09-01T00:00:00Z", v10), b: sess("b", 8800, "2026-09-08T00:00:00Z", CUR) };
  const mixed = buildFa5xChart({ cycles: [{ id: "cx", userId: U, cycleStartDateKey: "2026-09-01", plannedReassessmentDateKey: "2026-09-08", baselineAssessmentId: "a", reassessmentId: "b" }], userId: U, todayKey: "2026-09-10", getSession: (id) => two[id], getComparison: () => ({ eligible: false }) });
  assert.equal(mixed.points.length, 2, "both points kept");
  assert.equal(mixed.weeks[0].comparable, false, "no line between differently measured runs");
  assert.ok(mixed.weeks[0].note.includes("不直接比較"));
  const chartSrc = appJs.slice(appJs.indexOf("function renderFa5xChart("), appJs.indexOf("function shownDiffPhrase("));
  assert.ok(chartSrc.includes("weeks.filter((w) => w.comparable).map((w) => `<line"), "the chart draws lines only for comparable weeks");

  // timeline: the dashed link between weeks only within one measurement group
  const sessions = { b1: sess("b1", 9000, "2026-09-01T00:00:00Z", v10), r1: sess("r1", 8800, "2026-09-08T00:00:00Z", v10), b2: sess("b2", 8700, "2026-09-10T00:00:00Z", CUR), b3: sess("b3", 8600, "2026-09-20T00:00:00Z", CUR) };
  const cycles = [
    { id: "c1", userId: U, cycleStartDateKey: "2026-09-01", plannedReassessmentDateKey: "2026-09-08", baselineAssessmentId: "b1", reassessmentId: "r1" },
    { id: "c2", userId: U, cycleStartDateKey: "2026-09-10", plannedReassessmentDateKey: "2026-09-17", baselineAssessmentId: "b2", reassessmentId: null },
  ];
  const t = buildF01TrackingTimeline({
    cycles, userId: U, todayKey: "2026-09-12", getSession: (id) => sessions[id],
    getComparison: (c) => (c.id === "c1" ? { eligible: true, baselineMs: 9000, reassessmentMs: 8800, changeMs: -200, reassessmentDateKey: "2026-09-08" } : null),
  });
  assert.equal(t.trend.segments.filter((sg) => sg.gap).length, 0, "1.0 week and 1.1 week are not joined");
  const sameGroup = buildF01TrackingTimeline({
    cycles: [{ ...cycles[1], id: "c3", baselineAssessmentId: "b2", reassessmentId: "b3" }, { id: "c4", userId: U, cycleStartDateKey: "2026-09-25", plannedReassessmentDateKey: "2026-10-02", baselineAssessmentId: "x4", reassessmentId: null }],
    userId: U, todayKey: "2026-09-26", getSession: (id) => ({ ...sessions, x4: sess("x4", 8400, "2026-09-25T00:00:00Z", CUR) })[id],
    getComparison: () => ({ eligible: true, baselineMs: 8700, reassessmentMs: 8600, changeMs: -100, reassessmentDateKey: "2026-09-20" }),
  });
  assert.equal(sameGroup.trend.segments.filter((sg) => sg.gap).length, 1, "same group: weeks still joined as before");
}

// ── AD7 / AS1 scope: batch A does not gate recommendation / cycles / D5; no protection claims ──
{
  for (const f of ["js/data/trackingCycleService.js", "js/data/recommendationService.js", "js/data/trackingComparison.js", "js/data/f01ProgressionDecision.js", "js/data/d5Arrangement.js", "js/data/f01GoalRecommendation.js"]) {
    assert.ok(!read(f).includes("fa5xConditionReport"), `${f} does not use condition reports in batch A`);
  }
  const startRec = appJs.slice(appJs.indexOf("function startRecommendationFromFiveTimesSitToStand("), appJs.indexOf("function getInFlightAssessmentType("));
  assert.ok(!/describeFa5xConditions|conditionReports/.test(startRec), "Phase C entry unchanged in batch A");
  const mod = read("js/data/fa5xConditionReport.js") + read("js/data/functionalAssessmentService.js");
  assert.ok(/App-side rule|App-side rules/.test(mod), "the App-side nature of the append rule is stated");
  for (const w of ["tamper-proof", "is protected", "guaranteed by the app"]) assert.ok(!mod.includes(w), `no claim 「${w}」`);
}

// ── rules + storage wiring (source checks only — emulator verifies behaviour) ──
{
  const rules = read("firestore.rules");
  const generic = rules.slice(rules.indexOf("match /{collectionName}/{documentId}"));
  assert.ok(!generic.includes("'functionalAssessmentSessions'"), "removed from the open catch-all list");
  const own = rules.slice(rules.indexOf("match /functionalAssessmentSessions/{id}"), rules.indexOf("match /{collectionName}/{documentId}"));
  assert.ok(own.includes("linked(resource.data)") && own.includes("allow delete: if false;") && own.includes("sessionResultKept()") && own.includes("sessionReportsAppendOnly()"));
  assert.ok(rules.includes("get(relationDoc(data.relationId)).data.status == 'accepted'"), "stamp must be a currently accepted relation");
  const storage = read("js/data/storageService.js");
  assert.ok(storage.includes('if (name === "functionalAssessmentSessions" && user.role === "therapist")'));
  const tq = storage.slice(storage.indexOf('if (name === "functionalAssessmentSessions" && user.role === "therapist")'));
  assert.ok(tq.indexOf('r.status === "accepted"') > 0 && tq.indexOf('where("relationId", "==", relation.id)') > 0, "therapist reads only via accepted, stamped relations");
  const stamped = JSON.parse(storage.match(/const RELATION_STAMPED_COLLECTIONS = (\[[^\n]+\]);/)[1]);
  assert.ok(stamped.includes("trackingCycles") && stamped.includes("functionalAssessmentSessions"), "existing collections remain relation-stamped when a domain is added");
}

console.log("5xSTS batch A condition-report tests passed");
