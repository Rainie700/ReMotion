/**
 * patient00 six-week showcase history — builder (no cloud, no Gemini).
 *
 * Builds the history IN MEMORY through the app's real services, starting from
 * a snapshot of patient00's real records, and returns an ordered write
 * manifest. The caller must install an in-memory `globalThis.localStorage`
 * BEFORE importing this module (the app's storage layer reads it at import).
 *
 *   W1–W4  demo synthetic (09/03–09/27), G05: F01-17 + F01-18
 *          W2 → W3 is the simulated therapist review (F01-17 → 2 組 × 8 下)
 *          W3 → W4 progresses along the Confirmed link F01-17 → F01-19
 *   W5     the REAL cycle 09/28–10/04 and its REAL accepted proposal (kept)
 *   W6     from that real proposal: a demo-synthetic fresh baseline on 10/14
 *          (the proposal requires one), created by createNextTrackingCycle
 *
 * Every new record gets `demoSynthetic: true` + `demoBatch`; the review gets
 * `simulatedReview`, each confirmed summary `simulatedConfirmation` (also in
 * its published snapshot). Summaries are the app's rule fallback
 * (source "fallback", model null): no model is called.
 */
import { docHash } from "./hash.mjs";
import { createCollection } from "../../../js/data/storageService.js";
import { withSeedRuntime } from "../../../js/utils/id.js";
import { recommendationService } from "../../../js/data/recommendationService.js";
import { trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } from "../../../js/data/trackingCycleService.js";
import { exerciseService } from "../../../js/data/exerciseService.js";
import { analysisService, ANALYSIS_RECORD_SOURCES } from "../../../js/data/analysisService.js";
import { generateF01GoalRecommendation } from "../../../js/data/f01GoalRecommendation.js";
import { addDaysToDateKey } from "../../../js/data/trackingCycle.js";
import { reviewD5Proposal } from "../../../js/data/d5TherapistReviewService.js";
import { planFingerprint } from "../../../js/data/d5Arrangement.js";
import { createWeeklySummary, confirmWeeklySummary } from "../../../js/services/llmWeeklySummaryService.js";
import { getDraftToken } from "../../../js/data/weeklySummaryVersions.js";
import { DETECTOR_FIELDS, targetRepsFor, fiveXStsResult, recordFiveXSts } from "../../../js/dev/patient00Showcase.js";

export const DEMO_BATCH = "p00_history6w_v1";
export const PHASES = Object.freeze([
  { phase: "P1", actor: "patient00", note: "W1–W2 up to the W2 proposal waiting for review" },
  { phase: "T1", actor: "therapist00", note: "simulated therapist review of the W2 proposal" },
  { phase: "P2", actor: "patient00", note: "patient accepts the reviewed W2 plan; W3–W4; W6 from the real accepted proposal" },
  { phase: "T2", actor: "therapist00", note: "W1–W4 weekly summaries (rule fallback) with simulated confirmation" },
]);
const COLS = ["trackingCycles", "recommendationResults", "functionalAssessmentSessions", "analysisRecords", "llmWeeklySummaries", "d5TherapistReviews", "therapistPatientRelations"];

export { docHash };

/** The six-week story: per completed demo week, the reassessment and the training days (day index 0–5). */
export const STORY = Object.freeze({
  week1StartDateKey: "2026-09-03",
  firstBaselineMs: 12200,
  weeks: [
    { reassessmentMs: 11600, trainingDays: [0, 1, 2, 3, 4, 5] },
    { reassessmentMs: 12000, trainingDays: [0, 1, 3, 4], discomfortNote: "（展示合成）練完小腿比較緊" },
    { reassessmentMs: 8800, trainingDays: [0, 1, 2, 3, 4, 5] },
    { reassessmentMs: 9300, trainingDays: [0, 2, 3] },
  ],
  review: { reason: "（展示用模擬確認，非真實復健師操作）小腿緊繃，先把提踵降為 2 組 × 8 下，抬腳尖維持。", items: [{ exerciseId: "F01-17", sets: 2, repetitions: 8 }, { exerciseId: "F01-18" }] },
  week6: { baselineDateKey: "2026-10-14", baselineMs: 9100 },
});

// mild, uneven detector findings per exercise (scored by the detectors' own score functions)
const QUALITY = {
  "F01-17": [{ lift: 2, asym: 1, fast: 0 }, { lift: 1, asym: 1, fast: 0 }, { lift: 2, asym: 0, fast: 1 }, { lift: 1, asym: 0, fast: 1 }, { lift: 1, asym: 1, fast: 0 }, { lift: 0, asym: 1, fast: 0 }],
  "F01-18": [{ lift: 1, heel: 1, trunk: 0 }, { lift: 1, heel: 0, trunk: 1 }, { lift: 0, heel: 1, trunk: 0 }, { lift: 1, heel: 0, trunk: 0 }, { lift: 0, heel: 0, trunk: 1 }, { lift: 0, heel: 1, trunk: 0 }],
  "F01-19": [{ knee: 1, fast: 1 }, { fast: 2 }, { lift: 1, knee: 1 }, { knee: 1 }, { fast: 1 }, { lift: 1 }],
};

/**
 * @param real { uid, relations, cycle, baseline, reassessment, phaseC, proposal, summary } — the real records (read-only snapshot)
 * @returns {{ writes, realUpdates, realHashes, report }}
 */
export async function buildPatient00History6w(real) {
  const col = Object.fromEntries(COLS.map((n) => [n, createCollection(n)]));
  const U = real.uid;
  const rel = real.relations.find((r) => r.status === "accepted" && r.patientId === U);
  if (!rel) throw new Error("no accepted relation in the snapshot");
  const T = rel.therapistId;
  for (const r of real.relations) if (!col.therapistPatientRelations.getById(r.id)) col.therapistPatientRelations.create(r); // load once (a store may already hold them)
  for (const [c, d] of [["functionalAssessmentSessions", real.baseline], ["functionalAssessmentSessions", real.reassessment], ["recommendationResults", real.phaseC], ["recommendationResults", real.proposal], ["trackingCycles", real.cycle], ["llmWeeklySummaries", real.summary]]) if (d && !col[c].getById(d.id)) col[c].create(d);
  const realIds = new Set([real.baseline.id, real.reassessment.id, real.phaseC.id, real.proposal.id, real.cycle.id, ...real.relations.map((r) => r.id)]);
  const realHashes = Object.fromEntries([["trackingCycles", real.cycle], ["recommendationResults", real.proposal], ["recommendationResults", real.phaseC], ["functionalAssessmentSessions", real.baseline], ["functionalAssessmentSessions", real.reassessment], ["llmWeeklySummaries", real.summary], ["therapistPatientRelations", rel]].filter(([, d]) => d).map(([c, d]) => [`${c}/${d.id}`, docHash(d)]));

  const TAG = `showcase_p00_${String(U).replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}_h6_`;
  const at = (key, hh, mm = 0) => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };
  let clock = at(STORY.week1StartDateKey, 9);
  const counts = {};
  const runtime = { nextId: (p) => `${TAG}${p}_${String((counts[p] = (counts[p] || 0) + 1)).padStart(3, "0")}`, now: () => clock };
  const catalog = exerciseService.listNormalized();
  const log = []; // [phase, collection, id, snapshotJson]
  let phase = "P1";
  const rec = (c, id) => log.push([phase, c, id, JSON.stringify(col[c].getById(id))]);
  const NONE = { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] };
  const repDurations = (ms) => { const each = Math.round((ms - 400) / 5); return [0, 1, 2, 3, 4].map((i) => each + (2 - i) * 20); };
  const measure = (ms, iso, role = {}) => { const s = recordFiveXSts(U, fiveXStsResult(ms, iso, repDurations(ms), 400, role)); rec("functionalAssessmentSessions", s.id); return s; };
  const train = (cycle, dayIdx, n) => {
    const plan = recommendationService.getById(cycle.recommendationId).items;
    for (const d of dayIdx) {
      const dateKey = addDaysToDateKey(cycle.cycleStartDateKey, d);
      plan.forEach((item, k) => {
        clock = at(dateKey, 19, k * 14 + (d % 3) * 5);
        const e = exerciseService.getNormalizedById(item.exerciseId);
        const target = item.dose && item.dose.repetitions ? item.dose.repetitions : targetRepsFor(item.exerciseId);
        const r = analysisService.create({
          id: `${TAG}analysis_w${n}_${dateKey.replaceAll("-", "")}_${item.exerciseId}`, patientId: U, therapistId: T, scheduleId: null,
          exerciseId: item.exerciseId, exerciseName: e.name, completedAt: clock, capturedAt: clock, createdAt: clock,
          source: ANALYSIS_RECORD_SOURCES.SELF_PRACTICE, ...DETECTOR_FIELDS[item.exerciseId](target, QUALITY[item.exerciseId][d % 6]),
        }, { executionContext: { sourceType: "remotion", sourceSubtype: "f01_cycle", trackingCycleId: cycle.id, recommendationId: cycle.recommendationId, exerciseId: item.exerciseId, userId: U } });
        const done = trackingCycleService.recordExerciseCompletion({ cycleId: cycle.id, userId: U, exerciseId: item.exerciseId, analysisRecord: r });
        if (done.error) throw new Error(`train w${n} ${dateKey} ${item.exerciseId}: ${done.error}`);
        rec("analysisRecords", r.id);
      });
    }
    rec("trackingCycles", cycle.id);
  };
  const close = (cycle, ms) => {
    const key = cycle.plannedReassessmentDateKey;
    clock = at(key, 9, 30);
    const s = measure(ms, clock, { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: cycle.baselineAssessmentId });
    const c = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: U, reassessment: s, todayDateKey: key });
    if (c.error) throw new Error(`close ${cycle.id}: ${c.error}`);
    rec("trackingCycles", cycle.id);
    return key;
  };
  const evaluate = (cycle, input, key) => {
    clock = at(key, 9, 40);
    const p = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: U, input, catalog });
    if (p.error) throw new Error(`d5 ${cycle.id}: ${p.error}`);
    rec("recommendationResults", p.proposal.id);
    return p.proposal;
  };
  const accept = (proposalId, key, hh, mm = 0) => {
    clock = at(key, hh, mm);
    const ok = trackingCycleService.confirmD5Proposal({ proposalId, userId: U, confirmationDateKey: key });
    if (ok.error || !ok.cycle) throw new Error(`accept ${proposalId}: ${ok.error}`);
    rec("recommendationResults", proposalId);
    rec("trackingCycles", ok.cycle.id);
    return ok.cycle;
  };
  const weeks = [];
  const [s1, s2, s3, s4] = STORY.weeks;

  // ── P1: W1 (first valid assessment → Phase C → cycle), W2 up to its proposal ──
  const p1 = withSeedRuntime(runtime, () => {
    clock = at(STORY.week1StartDateKey, 9, 0);
    const b1 = measure(STORY.firstBaselineMs, clock);
    clock = at(STORY.week1StartDateKey, 9, 6);
    const phaseC = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: b1.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", limitationIds: [], availableMinutes: 15, catalog });
    if (phaseC.status !== "ok") throw new Error(`phase C: ${phaseC.status}`);
    const r1 = recommendationService.createF01GoalRecommendation({ patientId: U, result: phaseC, createdBy: U }).recommendation;
    rec("recommendationResults", r1.id);
    clock = at(STORY.week1StartDateKey, 9, 8);
    const c1 = trackingCycleService.createOrGetTrackingCycle({ userId: U, baselineSession: b1, recommendation: r1 });
    if (!c1.created) throw new Error(`W1: ${c1.error || c1.reason}`);
    rec("trackingCycles", c1.cycle.id);
    train(c1.cycle, s1.trainingDays, 1);
    const k1 = close(c1.cycle, s1.reassessmentMs);
    const pr1 = evaluate(c1.cycle, NONE, k1);
    const c2 = accept(pr1.id, k1, 10);
    weeks.push({ week: 1, cycleId: c1.cycle.id, firstPlan: { id: r1.id, goal: r1.selectedGoalId, items: r1.items.map((i) => i.exerciseId) }, proposalId: pr1.id });
    train(c2, s2.trainingDays, 2);
    const k2 = close(c2, s2.reassessmentMs);
    const pr2 = evaluate(c2, { hasNewOrWorseningDiscomfort: true, discomfortNote: s2.discomfortNote, currentLimitations: [] }, k2);
    return { c2, k2, pr2 };
  });

  // ── T1: simulated therapist review (linked therapist00) ──
  phase = "T1";
  const reviewed = await reviewD5Proposal({
    proposalId: p1.pr2.id, therapistId: T, expectedFingerprint: planFingerprint(col.recommendationResults.getById(p1.pr2.id)),
    reason: STORY.review.reason, items: STORY.review.items,
  }, { syncWrites: async () => ({ failed: [] }), now: () => at(p1.k2, 13, 20) });
  if (reviewed.error) throw new Error(`review: ${reviewed.error}`);
  rec("d5TherapistReviews", p1.pr2.id);

  // ── P2: accept the reviewed plan → W3 → W4 → W6 (from the real accepted proposal) ──
  phase = "P2";
  const realProposalBefore = JSON.stringify(col.recommendationResults.getById(real.proposal.id));
  const p2 = withSeedRuntime(runtime, () => {
    const c3 = accept(p1.pr2.id, p1.k2, 19, 30);
    weeks.push({ week: 2, cycleId: p1.c2.id, proposalId: p1.pr2.id, reviewed: true });
    train(c3, s3.trainingDays, 3);
    const k3 = close(c3, s3.reassessmentMs);
    const pr3 = evaluate(c3, NONE, k3);
    const c4 = accept(pr3.id, k3, 10);
    weeks.push({ week: 3, cycleId: c3.id, proposalId: pr3.id });
    train(c4, s4.trainingDays, 4);
    close(c4, s4.reassessmentMs);
    weeks.push({ week: 4, cycleId: c4.id, proposalId: null }); // the patient restarted with a new assessment on 09/28 (real W5)
    clock = at(STORY.week6.baselineDateKey, 9, 0);
    const b6 = measure(STORY.week6.baselineMs, clock, { assessmentRole: NEXT_CYCLE_BASELINE_ROLE, sourceCycleId: real.cycle.id, d5ProposalId: real.proposal.id });
    clock = at(STORY.week6.baselineDateKey, 9, 5);
    const c6 = trackingCycleService.createNextTrackingCycle({ userId: U, proposalId: real.proposal.id, baselineSession: b6 });
    if (c6.error || !c6.created) throw new Error(`W6: ${c6.error || c6.reason}`);
    rec("trackingCycles", c6.cycle.id);
    return { c6: c6.cycle };
  });
  // the formal path also links the real proposal to W6 (d5.nextCycleId / d5.nextCycleBaselineAssessmentId)
  const realProposalAfter = col.recommendationResults.getById(real.proposal.id);
  const before = JSON.parse(realProposalBefore);
  const changedKeys = Object.keys(realProposalAfter.d5).filter((k) => JSON.stringify(realProposalAfter.d5[k]) !== JSON.stringify(before.d5[k]));
  const topChanged = Object.keys(realProposalAfter).filter((k) => k !== "d5" && JSON.stringify(realProposalAfter[k]) !== JSON.stringify(before[k]));
  const realUpdates = [{
    phase: "P2", actor: "patient00", op: "update", collection: "recommendationResults", id: real.proposal.id,
    fields: Object.fromEntries([...changedKeys.map((k) => [`d5.${k}`, realProposalAfter.d5[k]]), ...topChanged.map((k) => [k, realProposalAfter[k]])]),
    // value before (absent -> null); rollback restores these (absent fields are deleted)
    previous: Object.fromEntries([...changedKeys.map((k) => [`d5.${k}`, k in before.d5 ? before.d5[k] : null]), ...topChanged.map((k) => [k, k in before ? before[k] : null])]),
    expectedHashBefore: docHash(real.proposal),
  }];

  // ── T2: W1–W4 summaries — rule fallback (no model call) + simulated confirmation ──
  phase = "T2";
  const noModel = async () => { throw new Error("demo_no_model_call"); };
  const sync = async () => ({ failed: [] });
  for (const w of weeks) {
    const end = col.trackingCycles.getById(w.cycleId).plannedReassessmentDateKey;
    const draft = await createWeeklySummary({ patientId: U, cycleId: w.cycleId, therapistId: T }, { generate: noModel, syncWrites: sync, now: () => at(addDaysToDateKey(end, 1), 20, 0) });
    const conf = await confirmWeeklySummary(w.cycleId, T, getDraftToken(draft), { syncWrites: sync, now: () => at(addDaysToDateKey(end, 2), 9, 0) });
    rec("llmWeeklySummaries", w.cycleId);
    w.summary = { source: conf.source, model: conf.model, validation: conf.validation, nextPlanSummary: conf.summary.userSummary.nextPlanSummary, planSummary: conf.summary.professionalSummary.planSummary, attentionNotes: conf.summary.attentionNotes };
  }

  // ── manifest: final content per doc at the phase of its first write; the W2 proposal also as evaluated (P1) ──
  const MARK = { demoSynthetic: true, demoBatch: DEMO_BATCH };
  const writes = [];
  const seen = new Set();
  for (const [ph, c, id, json] of log) {
    if (realIds.has(id)) continue;
    const twoVersions = c === "recommendationResults" && id === p1.pr2.id;
    const key = twoVersions ? `${c}/${id}@${ph}` : `${c}/${id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const preReview = twoVersions && ph === "P1";
    let doc = preReview ? JSON.parse(log.filter(([p2, c2, i2]) => p2 === "P1" && c2 === c && i2 === id).pop()[3]) : col[c].getById(id);
    doc = { ...doc, ...MARK };
    if (c === "trackingCycles") doc = { ...doc, therapistId: T, relationId: rel.id }; // stamp storageService adds on cloud write
    if (c === "d5TherapistReviews") doc = { ...doc, simulatedReview: true };
    if (c === "llmWeeklySummaries") doc = { ...doc, simulatedConfirmation: true, published: { ...doc.published, simulatedConfirmation: true } };
    const actor = PHASES.find((p) => p.phase === ph).actor;
    writes.push({ phase: ph, actor, op: "set", collection: c, id, ...(twoVersions ? { version: preReview ? "pre_review" : "accepted" } : {}), doc });
  }
  const order = PHASES.map((p) => p.phase);
  writes.sort((a, b) => order.indexOf(a.phase) - order.indexOf(b.phase));
  return {
    tag: TAG,
    writes,
    realUpdates,
    realHashes,
    weeks: weeks.map((w) => ({ ...w })),
    week6: { cycleId: p2.c6.id, startDateKey: p2.c6.cycleStartDateKey, previousCycleId: p2.c6.previousCycleId, recommendationId: p2.c6.recommendationId },
  };
}

/** Exact rollback list: which docs an account can delete and which only an admin can. */
export function rollbackPlan(manifest) {
  const NOT_CLIENT_DELETABLE = new Set(["trackingCycles", "llmWeeklySummaries", "d5TherapistReviews"]);
  const ids = [...new Map(manifest.writes.map((w) => [`${w.collection}/${w.id}`, w])).values()];
  return {
    patientDeletes: ids.filter((w) => !NOT_CLIENT_DELETABLE.has(w.collection)).map((w) => `${w.collection}/${w.id}`),
    adminDeletes: ids.filter((w) => NOT_CLIENT_DELETABLE.has(w.collection)).map((w) => `${w.collection}/${w.id}`),
    restoreRealFields: manifest.realUpdates.map((u) => ({ collection: u.collection, id: u.id, deleteFields: Object.keys(u.fields) })),
  };
}
