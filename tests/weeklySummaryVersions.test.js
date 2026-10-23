process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * AI 週摘要 — the confirmed (published) version is kept apart from a new
 * draft. Isolated in-memory data (patient00 showcase seed through the real
 * services); the real createWeeklySummary / confirmWeeklySummary run with an
 * injected generator (no Gemini) and an injected cloud-sync result (no cloud),
 * so save failures can be simulated.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const S = await import("../js/dev/patient00Showcase.js");
const { createCollection } = await import("../js/data/storageService.js");
const { functionalProgressService } = await import("../js/data/functionalProgressService.js");
const { buildFallbackSummary } = await import("../js/services/llmSummaryFallback.js");
const SVC = await import("../js/services/llmWeeklySummaryService.js");
const V = await import("../js/data/weeklySummaryVersions.js");
const { buildConfirmedSummaryOptions } = await import("../js/ui/weeklySummaryCycleSelection.js");

const P00 = { id: "uid-patient00", email: "patient00@gmail.com", role: "patient" };
const T = "t-p00";
createCollection("therapistPatientRelations").create({ id: "p00-rel", therapistId: T, patientId: P00.id, status: "accepted", createdAt: "2026-09-01T00:00:00.000Z" });
assert.equal(S.seedPatient00ShowcaseData(P00).ok, true);
const weeks = functionalProgressService.getTrackingTimeline(P00.id, "2026-09-30").weeks;
const [w1, w2] = weeks;
assert.equal(w2.status, "in_progress");

const summaries = createCollection("llmWeeklySummaries");
const docOf = (id) => JSON.parse(JSON.stringify(SVC.getSavedWeeklySummary(id)));
const patientView = (patientId = P00.id) => buildConfirmedSummaryOptions({ patientId, summaries: SVC.listWeeklySummariesForPatient(patientId), weeks });
const seen = (cycleId) => (patientView().options.find((o) => o.cycleId === cycleId) || {}).published || null;

// injected I/O: generator + cloud sync result
const asFallback = async () => { throw new Error("model unavailable"); }; // -> safe fallback summary
const asGemini = async ({ verifiedContext }) => buildFallbackSummary(verifiedContext); // valid output -> source "gemini"
const syncOk = async () => ({ total: 1, failed: [] });
const syncFailOnWrite = (cycleId) => { let n = 0; return async () => (++n === 2 ? { total: 1, failed: [{ name: "llmWeeklySummaries", id: cycleId, ok: false }] } : { total: 0, failed: [] }); };
const clock = (iso) => () => iso;
const gen = (cycleId, generate, syncWrites, at) => SVC.createWeeklySummary({ patientId: P00.id, cycleId, therapistId: T }, { generate, syncWrites, now: clock(at) });
const confirm = (cycleId, token, syncWrites, at) => SVC.confirmWeeklySummary(cycleId, T, token, { syncWrites, now: clock(at) });

// ── confirmed A ──
await gen(w1.cycleId, asFallback, syncOk, "2026-10-01T01:00:00.000Z");
assert.equal(seen(w1.cycleId), null, "a first draft is never shown to the patient");
await confirm(w1.cycleId, V.getDraftToken(SVC.getSavedWeeklySummary(w1.cycleId)), syncOk, "2026-10-01T02:00:00.000Z");
const A = seen(w1.cycleId);
assert.ok(A, "confirmed A visible");
assert.deepEqual([A.source, A.confirmedAt, A.createdAt], ["fallback", "2026-10-01T02:00:00.000Z", "2026-10-01T01:00:00.000Z"]);

// ── draft B generated -> patient still sees A; therapist sees both ──
await gen(w1.cycleId, asGemini, syncOk, "2026-10-02T01:00:00.000Z");
{
  const d = SVC.getSavedWeeklySummary(w1.cycleId);
  assert.equal(d.status, "draft");
  assert.equal(d.source, "gemini", "the draft carries its own source");
  assert.deepEqual(V.getPublishedVersion(d), A, "published A untouched: content, source, dates");
  assert.equal(V.getPendingDraft(d).createdAt, "2026-10-02T01:00:00.000Z");
  assert.deepEqual(seen(w1.cycleId), A, "patient still sees A (still in the menu)");
}
const withDraftB = docOf(w1.cycleId);
const tokenB = V.getDraftToken(withDraftB);

// ── a new draft fails -> nothing changes ──
await assert.rejects(gen(w1.cycleId, asGemini, syncFailOnWrite(w1.cycleId), "2026-10-02T05:00:00.000Z"), /summary_sync_failed/);
assert.deepEqual(docOf(w1.cycleId), withDraftB, "failed save -> stored doc exactly as before (draft B, published A)");
await assert.rejects(SVC.createWeeklySummary({ patientId: P00.id, cycleId: "no-such-cycle", therapistId: T }, { generate: asGemini, syncWrites: syncOk }), /cycle_not_found/);
assert.deepEqual(docOf(w1.cycleId), withDraftB, "failed generation writes nothing");
assert.deepEqual(seen(w1.cycleId), A);

// ── confirm guards: stale / missing token, another therapist ──
await assert.rejects(confirm(w1.cycleId, A.draftId, syncOk, "2026-10-02T06:00:00.000Z"), /draft_changed/, "the token of an older draft is refused");
await assert.rejects(confirm(w1.cycleId, undefined, syncOk, "2026-10-02T06:00:00.000Z"), /draft_changed/, "no token -> refused");
await assert.rejects(SVC.confirmWeeklySummary(w1.cycleId, "t-other", tokenB, { syncWrites: syncOk }), /not_authorized/);
assert.deepEqual(docOf(w1.cycleId), withDraftB);

// ── confirming B fails to save -> patient still sees A ──
await assert.rejects(confirm(w1.cycleId, tokenB, syncFailOnWrite(w1.cycleId), "2026-10-02T07:00:00.000Z"), /summary_sync_failed/);
assert.deepEqual(docOf(w1.cycleId), withDraftB, "failed confirmation -> still draft B + published A");
assert.deepEqual(seen(w1.cycleId), A);

// ── confirming B succeeds -> patient sees B with B's content, source and date ──
await confirm(w1.cycleId, tokenB, syncOk, "2026-10-02T08:00:00.000Z");
{
  const B = seen(w1.cycleId);
  assert.deepEqual(B.summary, withDraftB.summary, "content = the confirmed draft");
  assert.deepEqual([B.source, B.confirmedAt, B.createdAt, B.draftId], ["gemini", "2026-10-02T08:00:00.000Z", "2026-10-02T01:00:00.000Z", tokenB]);
  assert.equal(V.getPendingDraft(SVC.getSavedWeeklySummary(w1.cycleId)), null, "no pending draft after confirmation");
}
// double click: the same confirmation again is refused and changes nothing
{
  const before = docOf(w1.cycleId);
  await assert.rejects(confirm(w1.cycleId, tokenB, syncOk, "2026-10-02T09:00:00.000Z"), /no_pending_draft/);
  assert.deepEqual(docOf(w1.cycleId), before);
}

// ── week 2: draft only -> invisible to the patient; week 1 unaffected ──
await gen(w2.cycleId, asGemini, syncOk, "2026-10-03T01:00:00.000Z");
assert.equal(seen(w2.cycleId), null, "draft-only cycle never shown");
assert.deepEqual(patientView().options.map((o) => o.cycleId), [w1.cycleId]);
assert.equal(seen(w1.cycleId).confirmedAt, "2026-10-02T08:00:00.000Z", "another cycle's draft does not touch week 1");

// ── legacy format (status confirmed, no `published`) stays readable, is not rewritten by reading ──
const legacy = { id: w2.cycleId, cycleId: w2.cycleId, patientId: P00.id, therapistId: T, relationId: "p00-rel", status: "confirmed", source: "fallback", model: null, createdAt: "2026-09-29T01:00:00.000Z", confirmedAt: "2026-09-29T02:00:00.000Z", confirmedBy: T, summary: { ...docOf(w2.cycleId).summary, cycleId: w2.cycleId, userSummary: { headline: "舊格式", functionSummary: "f", trainingSummary: "t", nextPlanSummary: "n" } } };
summaries.replaceAll([...summaries.list().filter((s) => s.id !== w2.cycleId), legacy]);
{
  const L = seen(w2.cycleId);
  assert.ok(L, "legacy confirmed summary visible");
  assert.deepEqual([L.summary.userSummary.headline, L.source, L.confirmedAt], ["舊格式", "fallback", "2026-09-29T02:00:00.000Z"]);
  assert.deepEqual(docOf(w2.cycleId), legacy, "reading does not rewrite the legacy doc");
  assert.deepEqual(patientView().options.map((o) => o.cycleId), [w2.cycleId, w1.cycleId], "newest first");
}
// a new draft on a legacy doc keeps the legacy version as published
await gen(w2.cycleId, asGemini, syncOk, "2026-10-04T01:00:00.000Z");
{
  const L = seen(w2.cycleId);
  assert.deepEqual([L.summary.userSummary.headline, L.source, L.confirmedAt], ["舊格式", "fallback", "2026-09-29T02:00:00.000Z"], "legacy confirmed content still shown, its own source kept");
  assert.equal(SVC.getSavedWeeklySummary(w2.cycleId).source, "gemini", "the new draft's source stays on the draft");
}

// ── ownership: other patients / cycles never mix ──
{
  const other = "uid-other";
  const foreign = { ...docOf(w1.cycleId), patientId: other };
  assert.equal(buildConfirmedSummaryOptions({ patientId: P00.id, summaries: [foreign], weeks }).options.length, 0, "another patient's doc is ignored");
  assert.equal(buildConfirmedSummaryOptions({ patientId: other, summaries: [docOf(w1.cycleId)], weeks }).options.length, 0, "and P00's doc is not shown to another patient");
  const crossed = docOf(w1.cycleId);
  crossed.published = { ...crossed.published, summary: { ...crossed.published.summary, cycleId: w2.cycleId } };
  const r = buildConfirmedSummaryOptions({ patientId: P00.id, summaries: [crossed], weeks });
  assert.deepEqual([r.options.length, r.unmatchedCount], [0, 1], "published content of another cycle is not shown under this week");
  // a stored doc of another patient under this cycle id blocks generation instead of being overwritten
  summaries.replaceAll([...summaries.list().filter((s) => s.id !== w1.cycleId), foreign]);
  await assert.rejects(gen(w1.cycleId, asGemini, syncOk, "2026-10-05T01:00:00.000Z"), /summary_owner_mismatch/);
  assert.equal(SVC.getSavedWeeklySummary(w1.cycleId).patientId, other, "not overwritten");
}

// ── UI wiring: one action at a time, confirm names the draft on screen ──
{
  const app = readFileSync(join(root, "app.js"), "utf8");
  const fn = (name) => { const i = app.indexOf(`function ${name}(`); assert.ok(i >= 0, name); return app.slice(i, app.indexOf("\n}\n", i)); };
  for (const name of ["generateCaseWeeklySummary", "confirmCaseWeeklySummary"]) assert.match(fn(name), /if \(state\.llmSummaryBusy\) return;/, `${name}: no second action while one runs`);
  assert.match(fn("confirmCaseWeeklySummary"), /getDraftToken\(draft\) !== draftToken/, "the draft on screen must still be the stored draft");
  assert.match(fn("confirmCaseWeeklySummary"), /confirmWeeklySummary\(target\.cycleId, therapistId, draftToken\)/);
  assert.match(fn("renderTherapistWeeklySummary"), /目前已確認版本（患者可見）/);
  assert.match(fn("renderTherapistWeeklySummary"), /待確認新草稿（患者看不到）/);
  assert.match(fn("renderPatientConfirmedSummaries"), /const saved = option\.published;/, "patient reads the published version only");
}

console.log("weeklySummaryVersions: all assertions passed");
