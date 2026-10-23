// 5xSTS batch A verification harness (NOT app code): R-S1–R-S11 (HANDOFF.md §2.2) and an
// App-shaped replay, against the LOCAL Firestore emulator only (project "demo-remotion",
// 127.0.0.1:8080). Run inside `firebase emulators:exec --only firestore --project demo-remotion`.
//   RULES_PATH=<repo>/firestore.rules REPO=<repo> node fa5xRelationSessionCheck.mjs
// Expectations follow HANDOFF.md. A case expected to be REFUSED that succeeds is a FAIL.
// Cases whose expected outcome is "allowed (policy risk)" are reported as ALLOWED-RISK, not PASS.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, collection, query, where, getDocs } from "firebase/firestore";

// ── preflight: prove we talk to the emulator, not a real project ──
const host = process.env.FIRESTORE_EMULATOR_HOST || "(unset)";
let ping = "";
try { ping = await (await fetch("http://127.0.0.1:8080/")).text(); } catch (e) { ping = `ERROR ${e.message}`; }
console.log(`preflight FIRESTORE_EMULATOR_HOST=${host} GCLOUD_PROJECT=${process.env.GCLOUD_PROJECT || "(unset)"} ping(127.0.0.1:8080)=${JSON.stringify(ping.trim().slice(0, 20))}`);
if (!/^Ok/.test(ping.trim())) { console.log("ABORT: emulator not reachable — nothing was run"); process.exit(2); }

const env = await initializeTestEnvironment({
  projectId: "demo-remotion",
  firestore: { rules: readFileSync(process.env.RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
});
const P = "patient-1", P2 = "patient-2", T = "therapist-1", T2 = "therapist-2", T3 = "therapist-3";
const db = (uid) => env.authenticatedContext(uid).firestore();
const results = [];
async function check(name, expectOk, fn) {
  try { await (expectOk ? assertSucceeds(fn()) : assertFails(fn())); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, String(e && e.message).slice(0, 160)]); }
}
/** Policy-risk cases: we RECORD what the rules do; "allowed" is not a pass. */
async function observe(name, fn) {
  try { await fn(); results.push(["ALLOWED-RISK", name]); }
  catch (e) { results.push(["REFUSED", name, String(e && (e.code || e.message)).slice(0, 80)]); }
}
const seed = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
const REL = "therapistPatientRelations", COL = "functionalAssessmentSessions";
const rel = (id, therapistId, patientId, status = "accepted", over = {}) => ({ id, therapistId, patientId, status, inviteCode: "ABC123", ...over });
const session = (id, patientId, stamp = {}, over = {}) => ({
  id, patientId, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "completed",
  startedAt: "2026-10-22T01:00:00.000Z", completedAt: "2026-10-22T01:05:00.000Z", therapistId: "", relationId: "",
  result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 8900 }, ...stamp, ...over,
});
const q3 = (uid, patientId, therapistId, relationId) => getDocs(query(collection(db(uid), COL), where("patientId", "==", patientId), where("therapistId", "==", therapistId), where("relationId", "==", relationId)));

// ── R-S1 patient links (invite-code flow writes an accepted relation as the patient) -> stamped -> therapist reads ──
await env.clearFirestore();
await check("R-S1 patient creates accepted relation with T", true, () => setDoc(doc(db(P), REL, "rel-a"), rel("rel-a", T, P)));
await check("R-S1 patient writes a session stamped with rel-a", true, () => setDoc(doc(db(P), COL, "s1"), session("s1", P, { therapistId: T, relationId: "rel-a" })));
await check("R-S1 T reads the stamped session", true, () => getDoc(doc(db(T), COL, "s1")));
await check("R-S1 T 3-field query (storageService shape)", true, () => q3(T, P, T, "rel-a"));
// ── R-S2 accepted relation created directly by the patient with any therapist ──
await observe("R-S2 patient creates an ACCEPTED relation with T2 without invite / consent", () => setDoc(doc(db(P), REL, "rel-b"), rel("rel-b", T2, P)));
await seed((s) => setDoc(doc(s, COL, "s2"), session("s2", P, { therapistId: T2, relationId: "rel-b" })));
await observe("R-S2 ...and T2 then reads a session stamped with it", () => getDoc(doc(db(T2), COL, "s2")));
// ── R-S3 relation ended -> NEW reads refused ──
await check("R-S3 T ends rel-a", true, () => updateDoc(doc(db(T), REL, "rel-a"), { status: "completed" }));
await check("R-S3 T single read after end refused", false, () => getDoc(doc(db(T), COL, "s1")));
await check("R-S3 T 3-field query after end refused", false, () => q3(T, P, T, "rel-a"));
// ── R-S4 patient re-activates -> access restored (expected, product to confirm) ──
await check("R-S4 patient re-activates rel-a", true, () => updateDoc(doc(db(P), REL, "rel-a"), { status: "accepted" }));
await check("R-S4 T reads again after re-activation", true, () => getDoc(doc(db(T), COL, "s1")));
// ── R-S5 / R-S10 another therapist cannot borrow T's relation ──
await check("R-S5 T2 query with T's relationId refused", false, () => q3(T2, P, T, "rel-a"));
await check("R-S5 T2 query claiming itself on rel-a refused", false, () => q3(T2, P, T2, "rel-a"));
await check("R-S10 T2 single read of T-stamped session refused", false, () => getDoc(doc(db(T2), COL, "s1")));
// ── R-S6 therapist cannot re-stamp the patient's session ──
await check("R-S6 T rewrites stamp on patient's session refused", false, () => setDoc(doc(db(T), COL, "s1"), session("s1", P, { therapistId: T, relationId: "rel-a" }, { note: "x" })));
await check("R-S6 T2 re-stamps session to itself refused", false, () => setDoc(doc(db(T2), COL, "s1"), session("s1", P, { therapistId: T2, relationId: "rel-b" })));
// ── R-S7 patient stamps with invalid relations ──
await seed(async (s) => { await setDoc(doc(s, REL, "rel-other"), rel("rel-other", T, P2)); await setDoc(doc(s, REL, "rel-ended"), rel("rel-ended", T3, P, "completed")); });
await check("R-S7 stamp with another patient's relation refused", false, () => setDoc(doc(db(P), COL, "s1"), session("s1", P, { therapistId: T, relationId: "rel-other" })));
await check("R-S7 stamp with an ended relation refused", false, () => setDoc(doc(db(P), COL, "s1"), session("s1", P, { therapistId: T3, relationId: "rel-ended" })));
await check("R-S7 stamp with mismatched therapist refused", false, () => setDoc(doc(db(P), COL, "s1"), session("s1", P, { therapistId: T2, relationId: "rel-a" })));
// ── R-S8 two accepted relations: only the stamped therapist reads ──
await check("R-S8 T (stamped) reads", true, () => getDoc(doc(db(T), COL, "s1")));
await check("R-S8 T2 (accepted rel-b but not stamped on s1) refused", false, () => getDoc(doc(db(T2), COL, "s1")));
// ── R-S9 transfer risk: therapist-initiated transfer without patient consent ──
await observe("R-S9 T sets transferredToTherapistId=T3 on its own relation", () => updateDoc(doc(db(T), REL, "rel-a"), { transferredToTherapistId: T3 }));
await observe("R-S9 T creates an ACCEPTED transfer relation for T3", () => setDoc(doc(db(T), REL, "rel-tr"), rel("rel-tr", T3, P, "accepted", { sourceRelationId: "rel-a" })));
await observe("R-S9 patient app stamps a session with rel-tr (as a first-found accepted relation)", () => setDoc(doc(db(P), COL, "s9"), session("s9", P, { therapistId: T3, relationId: "rel-tr" })));
await observe("R-S9 T3 reads that session", () => getDoc(doc(db(T3), COL, "s9")));
// ── R-S11 restamp with an outdated (ended) relation ──
await check("R-S11 patient restamp to an ended relation refused", false, () => setDoc(doc(db(P), COL, "s1"), session("s1", P, { therapistId: T3, relationId: "rel-ended" })));

// ── App-shaped replay: documents produced by the REAL services, written in App order ──
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: () => null, length: 0 };
const repo = process.env.REPO;
const { functionalAssessmentService } = await import(pathToFileURL(join(repo, "js/data/functionalAssessmentService.js")).href);
await env.clearFirestore();
await seed((s) => setDoc(doc(s, REL, "rel-a"), rel("rel-a", T, P)));
const stamp = { therapistId: T, relationId: "rel-a" }; // what storageService.persistRecord adds (currentRelationStamp)
const put = (record) => setDoc(doc(db(P), COL, record.id), JSON.parse(JSON.stringify({ ...record, ...stamp })));
const s = functionalAssessmentService.create({ patientId: P, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand" }).session;
await check("APP 5xSTS create (real record)", true, () => put(s));
const completedRec = functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 9100, algorithmVersion: "fa5x-assessment-1.1", geometryCoordinateSpace: "isotropic_image_height_units" } }).session;
await check("APP 5xSTS completeSession (real record)", true, () => put(completedRec));
const reported = functionalAssessmentService.appendFa5xConditionReport(s.id, { armsUsed: "no", physicalAssistance: "unknown", chairHeightCm: 44, sameChairAsBaseline: "not_applicable", source: "self_report" }, { reportedBy: P });
await check("APP 5xSTS appendFa5xConditionReport (real record)", true, () => put(reported.session));
const reported2 = functionalAssessmentService.appendFa5xConditionReport(s.id, { armsUsed: "no", physicalAssistance: "no", chairHeightCm: null, sameChairAsBaseline: "not_applicable", source: "caregiver_report" }, { reportedBy: P });
await check("APP 5xSTS second report (real record)", true, () => put(reported2.session));
await check("APP restamp-only write keeps everything (same doc)", true, () => put(functionalAssessmentService.getById(s.id)));
const sh = functionalAssessmentService.create({ patientId: P, bodyRegion: "shoulder" }).session;
await check("APP shoulder create (real record)", true, () => put(sh));
const shMove = functionalAssessmentService.appendMovementResult(sh.id, { movementId: "A01-1", assessmentMovementId: "A01", left: { completed: true }, right: { completed: true } });
await check("APP shoulder movement result (real record)", true, () => put(shMove.session || functionalAssessmentService.getById(sh.id)));
const shDone = functionalAssessmentService.completeSession(sh.id, { problemId: "P-SH-03", protocolMovementIds: ["A01"] }).session;
await check("APP shoulder completeSession (real record)", true, () => put(shDone));
await check("APP therapist login query (storageService shape) returns both", true, async () => {
  const snap = await q3(T, P, T, "rel-a");
  if (snap.size !== 2) throw new Error(`expected 2 docs, got ${snap.size}`);
});
let stored = null; // withSecurityRulesDisabled resolves to void, so capture inside the callback
await env.withSecurityRulesDisabled(async (ctx) => { stored = (await getDoc(doc(ctx.firestore(), COL, s.id))).data(); });
results.push([JSON.stringify(stored.result) === JSON.stringify(completedRec.result) && stored.conditionReports.length === 2 ? "PASS" : "FAIL", "APP stored result unchanged by reports; 2 reports kept"]);

for (const r of results) console.log(r.join(" | "));
const failed = results.filter((r) => r[0] === "FAIL");
console.log(`\nPASS ${results.filter((r) => r[0] === "PASS").length}, FAIL ${failed.length}, ALLOWED-RISK ${results.filter((r) => r[0] === "ALLOWED-RISK").length}, REFUSED(observed) ${results.filter((r) => r[0] === "REFUSED").length}`);
await env.cleanup();
process.exit(failed.length ? 1 : 0);
