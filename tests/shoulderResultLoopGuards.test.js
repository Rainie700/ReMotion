import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion Phase 7.5 (L3) — MVP Result closed-loop guards.
 *
 * Part 1: behavioural — functionalAssessmentService.completeSession +
 *   getLatestCompletedByPatientId + hasCompletedByPatientId run for real
 *   against a localStorage-backed collection (persistence, NOT runtime).
 * Part 2: static source invariants — the completion CTA opens the real
 *   result (not Home), route + window handlers wired, Home card unlock is
 *   persistence-backed, dead-end copy removed, Result page is safe.
 */

// ── localStorage polyfill so the real data service can be exercised ──
const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};
const { functionalAssessmentService } = await import("../js/data/functionalAssessmentService.js");

// ── H / J / K: completion + reload-safe availability ────────────────
{
  const PID = "guard_patient_1";
  assert.equal(functionalAssessmentService.hasCompletedByPatientId(PID), false, "no completed assessment initially");
  assert.equal(functionalAssessmentService.getLatestCompletedByPatientId(PID), null);

  const sid = functionalAssessmentService.create({ patientId: PID, bodyRegion: "shoulder" }).session.id;
  functionalAssessmentService.appendMovementResult(sid, { movementId: "A01-1", assessmentMovementId: "A01", movementName: "shoulder_flexion", left: { completed: true, peakROM: { deg: 140 } }, right: { completed: true, peakROM: { deg: 150 } } });
  functionalAssessmentService.appendMovementResult(sid, { movementId: "A01-2", assessmentMovementId: "A02", movementName: "shoulder_abduction", left: { completed: true, peakROM: { deg: 145 } }, right: { completed: true, peakROM: { deg: 152 } } });

  // still not "completed" — appendMovementResult must NOT flip status
  assert.equal(functionalAssessmentService.getById(sid).status, "started", "movement results alone don't complete the session");
  assert.equal(functionalAssessmentService.hasCompletedByPatientId(PID), false);

  const done = functionalAssessmentService.completeSession(sid, { problemId: "P-SH-03", protocolMovementIds: ["A01", "A02"] });
  assert.ok(!done.error, "completeSession succeeds");

  // H: persisted completion carries status + problemId (source of truth, NOT reconstructed)
  const reread = functionalAssessmentService.getById(sid);
  assert.equal(reread.status, "completed");
  assert.equal(reread.problemId, "P-SH-03");
  assert.ok(typeof reread.completedAt === "string" && reread.completedAt.length > 0);
  assert.deepEqual(reread.protocolMovementIds, ["A01", "A02"]);
  assert.ok(Array.isArray(reread.movementResults) && reread.movementResults.length === 2, "movementResults preserved");

  // J / K: availability is derived from the persisted collection, not runtime state.
  assert.equal(functionalAssessmentService.hasCompletedByPatientId(PID), true);
  assert.equal(functionalAssessmentService.getLatestCompletedByPatientId(PID).id, sid);

  // "reload" = a fresh import reading the SAME localStorage-backed collection.
  const fresh = (await import("../js/data/functionalAssessmentService.js?reload=1")).functionalAssessmentService;
  assert.equal(fresh.hasCompletedByPatientId(PID), true, "completed state survives a reload (persistence-backed)");
  assert.equal(fresh.getLatestCompletedByPatientId(PID).id, sid);

  // newest-first ordering
  const sid2 = functionalAssessmentService.create({ patientId: PID, bodyRegion: "shoulder" }).session.id;
  functionalAssessmentService.completeSession(sid2, { problemId: "P-SH-01", protocolMovementIds: ["A01"] });
  assert.equal(functionalAssessmentService.getLatestCompletedByPatientId(PID).id, sid2, "latest completed = most recent completedAt");
  assert.equal(functionalAssessmentService.getCompletedByPatientId(PID).length, 2);

  // another patient is unaffected
  assert.equal(functionalAssessmentService.hasCompletedByPatientId("guard_patient_2"), false);
}

// legacy session (status:"started", no problemId) is not falsely "completed"
{
  const svc = functionalAssessmentService;
  const legacySid = svc.create({ patientId: "guard_legacy", bodyRegion: "shoulder" }).session.id;
  svc.appendMovementResult(legacySid, { movementId: "A01-1", movementName: "shoulder_flexion", left: { completed: true, peakROM: { deg: 140 } }, right: { completed: true, peakROM: { deg: 150 } } });
  assert.equal(svc.hasCompletedByPatientId("guard_legacy"), false, "a legacy started session never counts as completed");
}

// ── static: app.js wiring ──────────────────────────────────────────
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle) => {
  const at = appJs.indexOf(needle);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + 5000 : end + 2);
};

// I: completion CTA opens the REAL result for this session, not Home.
{
  const body = sliceFn("function functionalAssessmentShoulderCompletePage()");
  assert.ok(/onclick="goFunctionalAssessmentShoulderResult\('\$\{sid \|\| ""\}'\)">查看評估結果/.test(body), '"查看評估結果" opens goFunctionalAssessmentShoulderResult(session)');
  assert.ok(!/查看評估結果<\/button>[\s\S]{0,40}$/.test(body.replace(/goFunctionalAssessmentShoulderResult/g, "")), "no leftover placeholder");
}
assert.ok(!appJs.includes("評估結果頁面即將推出"), "dead-end placeholder copy removed");
assert.ok(!appJs.includes("目前為功能評估流程示範"), "old demo copy stays removed");

// session completion is persisted BEFORE the completion page (last movement).
{
  const adv = sliceFn("function advanceFunctionalAssessmentShoulderMovement()");
  assert.ok(/completeShoulderAssessmentSession\(\);\s*\n\s*state\.route = "functionalAssessmentShoulderComplete"/.test(adv), "completeShoulderAssessmentSession() runs on the last movement, before routing to Complete");
  const cmp = sliceFn("function completeShoulderAssessmentSession()");
  assert.ok(/functionalAssessmentService\.completeSession\(\s*sid,\s*\{[\s\S]*?problemId: problemId \|\| null/.test(cmp), "the SELECTED problemId is passed through (not reconstructed from movementIds)");
  assert.ok(!/movementResults[\s\S]*?problemId\s*=/.test(cmp), "problemId is never derived from movementResults for a new completion");
}

// route + global handlers.
assert.ok(/state\.route === "functionalAssessmentShoulderResult"\) app\.innerHTML = phone\(functionalAssessmentShoulderResultPage\(\)/.test(appJs), "Result route is dispatched");
for (const fn of ["goFunctionalAssessmentShoulderResult", "goLatestFunctionalAssessmentResult"]) {
  assert.ok(new RegExp(`window\\.${fn}\\s*=\\s*${fn}\\s*;`).test(appJs), `window.${fn} exposed for inline onclick`);
}

// Home "評估結果" unlock — persistence-backed decision + real onclick.
{
  const home = appJs.slice(appJs.indexOf("hasCompletedFunctionalAssessment ="), appJs.indexOf("hasCompletedFunctionalAssessment =") + 1400);
  assert.ok(/functionalAssessmentService\.hasCompletedByPatientId\(patientId\)/.test(home), "Home checks completion via the persistence-backed service method");
  assert.ok(!/\.getByPatientId\(patientId\)\s*\n?\s*\.some\(\(s\) => s\.status === "completed"\)/.test(home), "no ad-hoc runtime scan");
  assert.ok(/hasCompletedFunctionalAssessment[\s\S]{0,600}clickable" onclick="goLatestFunctionalAssessmentResult\(\)"/.test(home), "when completed the card is clickable -> latest result");
  assert.ok(/hasCompletedFunctionalAssessment[\s\S]{0,900}secondary locked" aria-disabled="true"/.test(home), "when NOT completed the card keeps its disabled state");
}

// Result page: safe title/subtitle/disclaimer, no internal ids rendered.
{
  const rp = sliceFn("function functionalAssessmentShoulderResultPage()");
  assert.ok(rp.includes("AI 動態功能評估報告") && rp.includes("肩部功能評估"), "Result page title + subtitle");
  assert.ok(/buildShoulderAssessmentFindings\(\{ problemId: session\.problemId, movementResults \}\)/.test(rp), "Result page renders ONLY the normalized report (no interpretation logic here)");
  assert.ok(rp.includes("report.disclaimer") || rp.includes(SHOULDER_DISCLAIMER_LITERAL()), "disclaimer shown");
  const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const banned of ["P-SH-", "assessmentMovementId", "A01-1", "A01-2", "${m.assessmentMovementId}"]) {
    assert.ok(!stripComments(rp).includes(banned), `Result page must not render "${banned}"`);
  }
}
function SHOULDER_DISCLAIMER_LITERAL() {
  return "本結果為動作量測與功能表現紀錄，不作為疾病診斷依據。";
}

console.log("Phase 7.5 MVP result closed-loop guards passed");
