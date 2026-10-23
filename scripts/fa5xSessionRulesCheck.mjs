// 5xSTS batch A — functionalAssessmentSessions rules check against the LOCAL Firestore emulator
// only (project id "demo-remotion"; no real project, nothing deployed). Not part of `npm test`.
// Same setup as scripts/firestoreRulesCheck.mjs: Java 21+, firebase-tools 15,
// @firebase/rules-unit-testing 6 + firebase 13 installed in a SEPARATE folder; copy this file there
// with a firebase.json ({"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8080}}}), then:
//   RULES_PATH=<repo>/firestore.rules firebase emulators:exec --only firestore --project demo-remotion "node fa5xSessionRulesCheck.mjs"
// Cases AR1–AR15 = docs/verification/fa5x-criteria-evidence/RESULT_USABILITY_DESIGN.md (第四版) A.7.
// Every write uses setDoc of the WHOLE document, exactly like js/data/storageService.js persistRecord().
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-remotion",
  firestore: { rules: readFileSync(process.env.RULES_PATH || new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
const P = "patient-1", T = "therapist-1", T2 = "therapist-2", X = "outsider-1", P2 = "patient-2";
const db = (uid) => env.authenticatedContext(uid).firestore();
const results = [];
async function check(name, expectOk, fn) {
  try {
    await (expectOk ? assertSucceeds(fn()) : assertFails(fn()));
    results.push(["PASS", name]);
  } catch (e) {
    results.push(["FAIL", name, String(e && e.message).slice(0, 160)]);
  }
}
const seed = (fn) => env.withSecurityRulesDisabled(async (ctx) => fn(ctx.firestore()));
const COL = "functionalAssessmentSessions";

const relAccepted = { id: "rel-1", therapistId: T, patientId: P, status: "accepted" };
const relEnded = { id: "rel-ended", therapistId: T2, patientId: P, status: "completed" };
const relOther = { id: "rel-other", therapistId: T, patientId: P2, status: "accepted" };
const stamp = { therapistId: T, relationId: "rel-1" };
const noStamp = { therapistId: "", relationId: "" };
const result = { status: "completed", repCount: 5, completedReps: 5, totalDurationMs: 8900, algorithmVersion: "fa5x-assessment-1.1" };
const report = (over = {}) => ({
  schemaVersion: "fa5x-condition-report-1", armsUsed: "no", physicalAssistance: "no", chairHeightCm: null,
  sameChairAsBaseline: "not_applicable", source: "self_report", reportedBy: P, reportedAt: "2026-10-22T02:00:00.000Z", ...over,
});
const base = (over = {}) => ({ id: "s1", patientId: P, bodyRegion: "lower_limb", assessmentType: "five_times_sit_to_stand", status: "started", startedAt: "2026-10-22T01:50:00.000Z", ...noStamp, ...over });
const completed = (over = {}) => base({ status: "completed", completedAt: "2026-10-22T01:55:00.000Z", result, ...over });

async function reset(docs = {}) {
  await env.clearFirestore();
  await seed(async (s) => {
    for (const r of [relAccepted, relEnded, relOther]) await setDoc(doc(s, "therapistPatientRelations", r.id), r);
    for (const [id, data] of Object.entries(docs)) await setDoc(doc(s, COL, id), data);
  });
}

// AR1 owner create / read / list own
await reset();
await check("AR1 owner creates own session (no result, empty stamp)", true, () => setDoc(doc(db(P), COL, "s1"), base()));
await check("AR1 owner reads own session", true, () => getDoc(doc(db(P), COL, "s1")));
await check("AR1 owner lists own sessions (patientId query)", true, () => getDocs(query(collection(db(P), COL), where("patientId", "==", P))));
// AR2 nobody creates a session for someone else
await check("AR2 outsider cannot create a session for the patient", false, () => setDoc(doc(db(X), COL, "sx"), base({ id: "sx" })));
await check("AR2 therapist cannot create a session for the patient", false, () => setDoc(doc(db(T), COL, "st"), base({ id: "st", ...stamp })));
// AR3 outsiders cannot read
await reset({ s1: completed(stamp) });
await check("AR3 outsider cannot read the session", false, () => getDoc(doc(db(X), COL, "s1")));
await check("AR3 outsider cannot list the whole collection", false, () => getDocs(collection(db(X), COL)));
await check("AR3 outsider cannot query by the patient's id", false, () => getDocs(query(collection(db(X), COL), where("patientId", "==", P))));
// AR4 linked therapist (currently accepted relation) reads stamped sessions
await check("AR4 linked therapist reads the stamped session", true, () => getDoc(doc(db(T), COL, "s1")));
await check("AR4 linked therapist 3-field query", true, () => getDocs(query(collection(db(T), COL), where("patientId", "==", P), where("therapistId", "==", T), where("relationId", "==", "rel-1"))));
// AR5 stamp alone grants nothing
await check("AR5 old single-field therapist query is refused", false, () => getDocs(query(collection(db(T), COL), where("patientId", "==", P))));
await check("AR5 other therapist cannot read", false, () => getDoc(doc(db(T2), COL, "s1")));
await reset({ s1: completed({ therapistId: T2, relationId: "rel-ended" }), s2: completed({ id: "s2", therapistId: T, relationId: "rel-other" }), s3: completed({ id: "s3" }) });
await check("AR5 therapist of an ENDED relation cannot read (stamp still on the doc)", false, () => getDoc(doc(db(T2), COL, "s1")));
await check("AR5 stamp naming another patient's relation grants nothing", false, () => getDoc(doc(db(T), COL, "s2")));
await check("AR5 unstamped session is not readable by the therapist", false, () => getDoc(doc(db(T), COL, "s3")));
await seed((s) => setDoc(doc(s, "therapistPatientRelations", "rel-1"), { ...relAccepted, status: "completed" }));
await seed((s) => setDoc(doc(s, COL, "s4"), completed({ id: "s4", ...stamp })));
await check("AR5 relation ended after stamping -> therapist read refused", false, () => getDoc(doc(db(T), COL, "s4")));

// AR6 stored measurement never changes once set
await reset({ s1: base() });
await check("AR6 owner stores the result the first time (completeSession)", true, () => setDoc(doc(db(P), COL, "s1"), completed()));
await check("AR6 owner cannot overwrite the stored result", false, () => setDoc(doc(db(P), COL, "s1"), completed({ result: { ...result, totalDurationMs: 7000 } })));
await check("AR6 owner cannot remove the stored result", false, () => setDoc(doc(db(P), COL, "s1"), base({ status: "completed" })));
// AR7 append one report
await check("AR7 owner appends one condition report", true, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report()] })));
await check("AR7 owner appends a second report (first unchanged)", true, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report(), report({ armsUsed: "unknown" })] })));
// AR8 history is append-only, one per write
await check("AR8 cannot change an earlier report", false, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report({ armsUsed: "yes" }), report({ armsUsed: "unknown" })] })));
await check("AR8 cannot drop a report", false, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report()] })));
await check("AR8 cannot append two reports in one write", false, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report(), report({ armsUsed: "unknown" }), report(), report()] })));
// AR9 report content
await reset({ s1: completed() });
await check("AR9 report written as someone else is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report({ reportedBy: T })] })));
await check("AR9 unknown source value is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report({ source: "therapist" })] })));
await check("AR9 synthetic_demo source is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report({ source: "synthetic_demo" })] })));
await check("AR9 invalid answer value is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report({ armsUsed: "maybe" })] })));
await check("AR9 extra field in a report is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ conditionReports: [report({ verified: true })] })));
await check("AR9 a new session cannot start with reports", false, () => setDoc(doc(db(P), COL, "s9"), completed({ id: "s9", conditionReports: [report()] })));
// AR10 demo flag
await check("AR10 client cannot create a demoSynthetic session", false, () => setDoc(doc(db(P), COL, "s10"), base({ id: "s10", demoSynthetic: true })));
await check("AR10 client cannot add demoSynthetic to its session", false, () => setDoc(doc(db(P), COL, "s1"), completed({ demoSynthetic: true })));
await reset({ s1: completed({ demoSynthetic: true }) });
await check("AR10 client cannot remove an existing demoSynthetic flag", false, () => setDoc(doc(db(P), COL, "s1"), completed()));
await check("AR10 a write keeping the flag unchanged is allowed", true, () => setDoc(doc(db(P), COL, "s1"), completed({ demoSynthetic: true, conditionReports: [report()] })));
// AR11 no deletes
await reset({ s1: completed() });
await check("AR11 owner cannot delete", false, () => deleteDoc(doc(db(P), COL, "s1")));
await check("AR11 therapist cannot delete", false, () => deleteDoc(doc(db(T), COL, "s1")));
// AR12 stamps must be a currently accepted relation of THIS patient
await check("AR12 stamp with an ended relation is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ therapistId: T2, relationId: "rel-ended" })));
await check("AR12 stamp with another patient's relation is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ therapistId: T, relationId: "rel-other" })));
await check("AR12 stamp whose therapist does not match the relation is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ therapistId: T2, relationId: "rel-1" })));
// AR13 re-stamping keeps the measurement
await check("AR13 owner stamps a legacy session with its accepted relation", true, () => setDoc(doc(db(P), COL, "s1"), completed(stamp)));
await check("AR13 re-stamp that also changes the result is refused", false, () => setDoc(doc(db(P), COL, "s1"), completed({ ...stamp, result: { ...result, status: "invalid" } })));
await check("AR13 owner may clear the stamp", true, () => setDoc(doc(db(P), COL, "s1"), completed()));
// AR14 the App's own write sequences (whole-document setDoc each time)
await reset();
await check("AR14 5xSTS create", true, () => setDoc(doc(db(P), COL, "a1"), base({ id: "a1", ...stamp })));
await check("AR14 5xSTS completeSession", true, () => setDoc(doc(db(P), COL, "a1"), completed({ id: "a1", ...stamp })));
await check("AR14 5xSTS append report", true, () => setDoc(doc(db(P), COL, "a1"), completed({ id: "a1", ...stamp, conditionReports: [report()] })));
const sh = { id: "b1", patientId: P, bodyRegion: "shoulder", assessmentType: "shoulder", status: "started", startedAt: "2026-10-22T01:00:00.000Z", ...stamp };
await check("AR14 shoulder create", true, () => setDoc(doc(db(P), COL, "b1"), sh));
await check("AR14 shoulder movement result", true, () => setDoc(doc(db(P), COL, "b1"), { ...sh, movementResults: [{ movementId: "A01-1" }] }));
await check("AR14 shoulder completeSession", true, () => setDoc(doc(db(P), COL, "b1"), { ...sh, movementResults: [{ movementId: "A01-1" }], status: "completed", completedAt: "2026-10-22T01:10:00.000Z", problemId: "P-SH-03", protocolMovementIds: ["A01"] }));
// AR15 therapist never writes patient sessions
await check("AR15 linked therapist cannot update the patient's session", false, () => setDoc(doc(db(T), COL, "a1"), completed({ id: "a1", ...stamp, conditionReports: [report(), report({ reportedBy: T })] })));

const failed = results.filter((r) => r[0] === "FAIL");
for (const r of results) console.log(r.join(" | "));
console.log(`\n${results.length - failed.length} / ${results.length} rule checks as expected`);
await env.cleanup();
process.exit(failed.length ? 1 : 0);
