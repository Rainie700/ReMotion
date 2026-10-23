process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Therapist AI 週摘要 — selectable F01 cycle. The selection logic is pure
 * (js/ui/weeklySummaryCycleSelection.js); the data checks run on the patient00
 * showcase seed through the real services. Gemini is never called: summaries
 * are built with the existing fallback builder and confirmed through the real
 * confirmWeeklySummary (no cloud user -> no cloud write).
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SEL = await import("../js/ui/weeklySummaryCycleSelection.js");
const S = await import("../js/dev/patient00Showcase.js");
const { createCollection } = await import("../js/data/storageService.js");
const { trackingCycleService } = await import("../js/data/trackingCycleService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { functionalProgressService } = await import("../js/data/functionalProgressService.js");
const { functionalAssessmentService } = await import("../js/data/functionalAssessmentService.js");
const { buildVerifiedWeeklyContext } = await import("../js/services/llmContextBuilder.js");
const { buildFallbackSummary } = await import("../js/services/llmSummaryFallback.js");
const { getSavedWeeklySummary, confirmWeeklySummary } = await import("../js/services/llmWeeklySummaryService.js");
const { getDraftToken, getPublishedVersion } = await import("../js/data/weeklySummaryVersions.js");

// ── pure selection logic ───────────────────────────────────────────────
{
  const weeks = [
    { weekNumber: 1, cycleId: "c1", status: "completed", startDateKey: "2026-09-21", endDateKey: "2026-09-27" },
    { weekNumber: 2, cycleId: "c2", status: "in_progress", startDateKey: "2026-09-28", endDateKey: "2026-10-04" },
  ];
  const opts = SEL.buildSummaryCycleOptions(weeks);
  assert.deepEqual(opts.map((o) => [o.cycleId, o.weekNumber, o.completed, o.statusLabel]), [["c1", 1, true, "已完成"], ["c2", 2, false, "進行中"]]);
  assert.equal(opts[0].label, "第 1 週｜09/21–09/27｜已完成");
  assert.equal(opts[1].label, "第 2 週｜09/28–10/04｜進行中");
  assert.equal(SEL.buildSummaryCycleOptions([{ weekNumber: 1, cycleId: "x", status: "reassessed", startDateKey: "2026-09-21", endDateKey: "2026-09-27" }])[0].completed, true, "reassessed = finished");

  assert.equal(SEL.pickDefaultSummaryCycleId(opts), "c1", "default = latest completed, even while week 2 runs");
  const three = SEL.buildSummaryCycleOptions([...weeks.slice(0, 1), { ...weeks[1], status: "completed" }, { weekNumber: 3, cycleId: "c3", status: "in_progress", startDateKey: "2026-10-05", endDateKey: "2026-10-11" }]);
  assert.equal(SEL.pickDefaultSummaryCycleId(three), "c2", "latest completed, not the first");
  assert.equal(SEL.pickDefaultSummaryCycleId(SEL.buildSummaryCycleOptions([weeks[1]])), "c2", "no completed -> in-progress");
  assert.equal(SEL.pickDefaultSummaryCycleId([]), null);

  assert.deepEqual(SEL.resolveSummaryCycleSelection({ patientId: "pA", options: opts, selection: null }), { patientId: "pA", cycleId: "c1" });
  assert.deepEqual(SEL.resolveSummaryCycleSelection({ patientId: "pA", options: opts, selection: { patientId: "pA", cycleId: "c2" } }), { patientId: "pA", cycleId: "c2" }, "a valid choice is kept");
  assert.deepEqual(SEL.resolveSummaryCycleSelection({ patientId: "pA", options: opts, selection: { patientId: "pB", cycleId: "c2" } }), { patientId: "pA", cycleId: "c1" }, "another case's selection is never reused");
  assert.deepEqual(SEL.resolveSummaryCycleSelection({ patientId: "pA", options: opts, selection: { patientId: "pA", cycleId: "cB" } }), { patientId: "pA", cycleId: "c1" }, "a cycle this case does not have is rejected");
  assert.equal(SEL.resolveSummaryCycleSelection({ patientId: "pA", options: [], selection: { patientId: "pA", cycleId: "c1" } }), null);

  assert.equal(SEL.isSummaryForSelection({ cycleId: "c1", patientId: "pA" }, { patientId: "pA", cycleId: "c1" }), true);
  assert.equal(SEL.isSummaryForSelection({ cycleId: "c1", patientId: "pB" }, { patientId: "pA", cycleId: "c1" }), false);
  assert.equal(SEL.isSummaryForSelection({ cycleId: "c2", patientId: "pA" }, { patientId: "pA", cycleId: "c1" }), false);
  assert.equal(SEL.isSameSummaryTarget({ patientId: "pA", cycleId: "c1", kind: "generate" }, { patientId: "pA", cycleId: "c1" }), true);
  assert.equal(SEL.isSameSummaryTarget({ patientId: "pA", cycleId: "c1" }, { patientId: "pB", cycleId: "c1" }), false);
  assert.equal(SEL.isSameSummaryTarget(null, { patientId: "pA", cycleId: "c1" }), false);
}

// ── patient00 showcase: week 1 stays selectable / summarisable while week 2 runs ──
const P00 = { id: "uid-patient00", email: "patient00@gmail.com", role: "patient" };
const THERAPIST = "t-p00";
createCollection("therapistPatientRelations").create({ id: "p00-rel", therapistId: THERAPIST, patientId: P00.id, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
const seeded = S.seedPatient00ShowcaseData(P00);
assert.equal(seeded.ok, true, "showcase seeded");

const timeline = functionalProgressService.getTrackingTimeline(P00.id, "2026-09-30");
const options = SEL.buildSummaryCycleOptions(timeline.weeks);
assert.equal(options.length, 2, "two F01 cycles");
const [w1, w2] = options;
assert.equal(w1.completed, true);
assert.equal(w2.completed, false);
assert.equal(trackingCycleService.getActiveTrackingCycle(P00.id).id, w2.cycleId, "week 2 is the active cycle (what the old code always picked)");
assert.equal(SEL.pickDefaultSummaryCycleId(options), w1.cycleId, "default is week 1 (latest completed)");

// week 1 context = week 1 data, read from the stored assessments (no hard-coded seconds)
const c1 = trackingCycleService.getTrackingCycleById(w1.cycleId);
const base1 = functionalAssessmentService.getById(c1.baselineAssessmentId).result.totalDurationMs;
const re1 = functionalAssessmentService.getById(c1.reassessmentId).result.totalDurationMs;
const ctx1 = buildVerifiedWeeklyContext({ userId: P00.id, cycleId: w1.cycleId, todayKey: "2026-09-30" });
assert.ok(!ctx1.error && !ctx1.schemaErrors.length, "week 1 context valid");
assert.equal(ctx1.context.cycleId, w1.cycleId);
assert.equal(ctx1.context.weekNumber, 1);
assert.equal(ctx1.context.functionalAssessment.baselineMs, base1);
assert.equal(ctx1.context.functionalAssessment.reassessmentMs, re1);
const ctx2 = buildVerifiedWeeklyContext({ userId: P00.id, cycleId: w2.cycleId, todayKey: "2026-09-30" });
assert.ok(!ctx2.error && !ctx2.schemaErrors.length, "week 2 context valid");
assert.equal(ctx2.context.weekNumber, 2);
assert.equal(ctx2.context.functionalAssessment.reassessmentMs, null, "week 2 has no reassessment yet");
const fb1 = buildFallbackSummary(ctx1.context);
const fb1Text = JSON.stringify(fb1);
assert.ok(fb1Text.includes((base1 / 1000).toFixed(1)) && fb1Text.includes((re1 / 1000).toFixed(1)), "week 1 summary cites week 1 times");
console.log(`  week 1 times from stored data: ${(base1 / 1000).toFixed(1)} s -> ${(re1 / 1000).toFixed(1)} s`);

// another patient's cycle can never be targeted for patient00
assert.equal(buildVerifiedWeeklyContext({ userId: "uid-other", cycleId: w1.cycleId }).error, "not_owner");

// confirming week 1 changes only week 1's summary — not week 2's summary, cycles or recommendations
const summaries = createCollection("llmWeeklySummaries");
const draft = (ctx, cycleId) => ({ id: cycleId, cycleId, patientId: P00.id, therapistId: THERAPIST, relationId: "p00-rel", status: "draft", source: "fallback", model: null, createdAt: "2026-09-30T00:00:00.000Z", summary: buildFallbackSummary(ctx.context), validation: { passed: true, errorCodes: [] } });
summaries.create(draft(ctx1, w1.cycleId));
summaries.create(draft(ctx2, w2.cycleId));
const week2Before = JSON.stringify(getSavedWeeklySummary(w2.cycleId));
const cyclesBefore = JSON.stringify(trackingCycleService.listTrackingCycles(P00.id));
const recsBefore = JSON.stringify(recommendationService.getByPatientId(P00.id));
await confirmWeeklySummary(w1.cycleId, THERAPIST, getDraftToken(getSavedWeeklySummary(w1.cycleId)));
assert.equal(getSavedWeeklySummary(w1.cycleId).status, "confirmed");
assert.equal(getSavedWeeklySummary(w1.cycleId).source, "fallback", "source label kept");
assert.equal(getPublishedVersion(getSavedWeeklySummary(w1.cycleId)).source, "fallback", "the published version keeps its own source");
assert.equal(JSON.stringify(getSavedWeeklySummary(w2.cycleId)), week2Before, "week 2 summary untouched");
assert.equal(JSON.stringify(trackingCycleService.listTrackingCycles(P00.id)), cyclesBefore, "cycles untouched");
assert.equal(JSON.stringify(recommendationService.getByPatientId(P00.id)), recsBefore, "next-week plan untouched");
await assert.rejects(confirmWeeklySummary(w2.cycleId, "t-someone-else", getDraftToken(getSavedWeeklySummary(w2.cycleId))), /not_authorized/, "only the summary's therapist can confirm");

// ── app.js wiring: view / generate / confirm all use the ONE selected cycle ──
{
  const app = readFileSync(join(root, "app.js"), "utf8");
  const body = (name) => {
    const start = app.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `${name} exists`);
    const next = app.slice(start + 10).search(/\n(async )?function /);
    return app.slice(start, start + 10 + next);
  };
  for (const fn of ["renderTherapistWeeklySummary", "generateCaseWeeklySummary", "confirmCaseWeeklySummary"]) {
    assert.ok(!/getActiveTrackingCycle|getLatestTrackingCycle/.test(body(fn)), `${fn} no longer picks the active / latest cycle`);
  }
  assert.match(body("renderTherapistWeeklySummary"), /resolveSummaryCycleSelection\(/);
  assert.match(body("renderTherapistWeeklySummary"), /const cycleArg = summaryText\(selection\.cycleId\);/);
  assert.match(body("renderTherapistWeeklySummary"), /generateCaseWeeklySummary\('\$\{cycleArg\}'\)/);
  assert.match(body("renderTherapistWeeklySummary"), /confirmCaseWeeklySummary\('\$\{cycleArg\}', '\$\{summaryText\(getDraftToken\(draft\)\)\}'\)/, "confirm names the cycle AND the draft on screen");
  assert.match(body("renderSummaryVersionBlock"), /Gemini 整理/);
  assert.match(body("renderSummaryVersionBlock"), /安全備用摘要/);
  assert.match(body("renderTherapistWeeklySummary"), /待復健師確認/);
  assert.match(body("renderTherapistWeeklySummary"), /getOptionalCloudLoadStatus/, "load failure is shown, not treated as empty");
  assert.match(body("generateCaseWeeklySummary"), /resolveCaseSummaryTarget\(cycleId\)/);
  assert.match(body("generateCaseWeeklySummary"), /cycleId: target\.cycleId/);
  assert.match(body("confirmCaseWeeklySummary"), /confirmWeeklySummary\(target\.cycleId/);
  assert.match(body("resolveCaseSummaryTarget"), /cycle\.userId !== patientId/);
  assert.match(body("goCaseDetail"), /state\.summaryCycleSelection = null/, "switching case resets the selection");
  assert.match(app, /window\.selectCaseSummaryCycle = selectCaseSummaryCycle/);
}

console.log("therapistSummaryCycleSelection: all assertions passed");
