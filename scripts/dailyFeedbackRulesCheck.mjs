// LOCAL emulator only. Verification dependencies live in a separate folder.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, collection, query, where, getDocs, runTransaction } from "firebase/firestore";
if (process.env.GCLOUD_PROJECT !== "demo-remotion") throw Error("Use local demo-remotion emulator only");
const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { host: "127.0.0.1", port: 8080, rules: readFileSync(process.env.RULES_PATH, "utf8") } });
const P = "b4-patient", T = "b4-therapist", X = "b4-outsider", C = "dailyTrainingFeedback", id = `${P}_2026-10-23`;
const db = uid => env.authenticatedContext(uid).firestore();
const p = db(P), t = db(T), x = db(X);
const reference = s => doc(s, C, id);
const report = { source: "self_report", reportedBy: P, reportedAt: "2026-10-23T08:00:00Z", effort: "unknown", discomfort: "unknown", note: "" };
const fresh = () => ({ id, patientId: P, dateKey: "2026-10-23", schemaVersion: "daily-training-feedback-1", therapistId: T, relationId: "b4-rel", reports: [report], revision: 1, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
const seed = fn => env.withSecurityRulesDisabled(ctx => fn(ctx.firestore()));
const results = [];
async function check(label, allowed, fn) {
  try { await (allowed ? assertSucceeds(fn()) : assertFails(fn())); results.push(`PASS | ${label}`); }
  catch (e) { results.push(`FAIL | ${label} | ${e.message}`); }
  console.log(results.at(-1));
}
await env.clearFirestore();
await seed(s => setDoc(doc(s, "therapistPatientRelations", "b4-rel"), { patientId: P, therapistId: T, status: "accepted" }));
await check("owner transaction can read missing document", true, () => getDoc(reference(p)));
await check("outsider cannot create for owner", false, () => setDoc(reference(x), fresh()));
await check("therapist cannot report as patient", false, () => setDoc(reference(t), fresh()));
await check("invalid subjective enum rejected", false, () => setDoc(reference(p), { ...fresh(), reports: [{ ...report, discomfort: "" }] }));
await check("AI source rejected", false, () => setDoc(reference(p), { ...fresh(), reports: [{ ...report, source: "ai" }] }));
await check("forged relation rejected", false, () => setDoc(reference(p), { ...fresh(), relationId: "not-a-relation" }));
await check("noncanonical document ID rejected", false, () => setDoc(doc(p, C, "duplicate-id"), fresh()));
await check("self-report with explicit unknown saved", true, () => setDoc(reference(p), fresh()));
await check("owner reads", true, () => getDoc(reference(p)));
await check("linked therapist reads", true, () => getDoc(reference(t)));
await check("outsider read denied", false, () => getDoc(reference(x)));
await check("owner query loads", true, () => getDocs(query(collection(p, C), where("patientId", "==", P))));
await check("linked scoped query loads", true, () => getDocs(query(collection(t, C), where("patientId", "==", P), where("therapistId", "==", T), where("relationId", "==", "b4-rel"))));
await check("unscoped list denied", false, () => getDocs(collection(x, C)));
const correction = { ...report, discomfort: "yes", effort: "somewhat_hard", note: "膝蓋有不舒服" };
await check("therapist cannot correct patient report", false, () => updateDoc(reference(t), { reports: [report, correction], revision: 2, updatedAt: serverTimestamp() }));
await check("old report overwrite denied", false, () => updateDoc(reference(p), { reports: [correction], updatedAt: serverTimestamp() }));
await check("forged author denied", false, () => updateDoc(reference(p), { reports: [report, { ...correction, reportedBy: X }], revision: 2, updatedAt: serverTimestamp() }));
await check("invalid appended value denied", false, () => updateDoc(reference(p), { reports: [report, { ...correction, effort: "bad" }], revision: 2, updatedAt: serverTimestamp() }));
await check("created timestamp cannot change", false, () => updateDoc(reference(p), { reports: [report, correction], revision: 2, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
await check("valid correction appends", true, () => updateDoc(reference(p), { reports: [report, correction], revision: 2, updatedAt: serverTimestamp() }));
await check("stale device cannot overwrite second report", false, () => updateDoc(reference(p), { reports: [report, { ...report, discomfort: "no" }], revision: 2, updatedAt: serverTimestamp() }));
await check("cannot delete history", false, () => deleteDoc(reference(p)));
await check("cannot reassign patient", false, () => updateDoc(reference(p), { patientId: X, reports: [report, correction, report], revision: 3, updatedAt: serverTimestamp() }));
await check("cannot insert fake AI score", false, () => updateDoc(reference(p), { score: 100, reports: [report, correction, report], revision: 3, updatedAt: serverTimestamp() }));
await seed(s => updateDoc(doc(s, "therapistPatientRelations", "b4-rel"), { status: "revoked" }));
await check("revoked therapist cannot read", false, () => getDoc(reference(t)));
await check("revoked relation cannot be claimed on write", false, () => updateDoc(reference(p), { reports: [report, correction, report], revision: 3, updatedAt: serverTimestamp() }));
await check("owner may save unlinked report", true, () => updateDoc(reference(p), { therapistId: "", relationId: "", reports: [report, correction, report], revision: 3, updatedAt: serverTimestamp() }));
await check("single online transaction append", true, () => runTransaction(p, async tx => {
  const snap = await tx.get(reference(p));
  tx.update(reference(p), { reports: [...snap.data().reports, report], revision: 4, updatedAt: serverTimestamp() });
}));
// Two online devices read the same revision. Exactly one can commit that revision.
let successes = 0, conflicts = 0;
await Promise.all([p, db(P)].map(s => runTransaction(s, async tx => {
  const snap = await tx.get(reference(s));
  if (snap.data().revision !== 4) throw Error("stale-revision");
  tx.update(reference(s), { reports: [...snap.data().reports, report], revision: 5, updatedAt: serverTimestamp() });
}).then(() => successes++, e => { if (e.message.includes("stale-revision") || e.code === "permission-denied") conflicts++; else throw e; })));
assert.equal(successes, 1); assert.equal(conflicts, 1);
results.push("PASS | concurrent devices: one commit and one conflict; history retained");
const saved = (await getDoc(reference(p))).data();
assert.equal(saved.reports.length, 5); assert.deepEqual(saved.reports[1], correction);
// B04 second slice: optional incompletion context is backward compatible.
const reasonId = `${P}_2026-10-24`;
await seed(async s => {
  await setDoc(doc(s, "trackingCycles", "reason-owned"), { patientId: P, userId: P, recommendationId: "reason-rec" });
  await setDoc(doc(s, "trackingCycles", "reason-other"), { patientId: X, userId: X, recommendationId: "reason-rec" });
});
const progress = { schemaVersion: "incomplete-training-context-1", source: "device_loaded_records", cycleId: "reason-owned", recommendationId: "reason-rec", dateKey: "2026-10-24", snapshotted: true, requiredCount: 2, completedCount: 0, savedAttemptCount: 1, omittedItemCount: 1,
  items: [{ exerciseId: "F01-01", name: "深蹲", targetText: "3 組 × 10 次", targetBasis: "frozen", completed: false, savedAttemptCount: 1, attempts: [{ recordId: "reason-attempt", totalReps: 4, leftReps: null, rightReps: null }] }] };
const reasonFresh = incompletion => ({ ...fresh(), id: reasonId, dateKey: progress.dateKey, therapistId: "", relationId: "", reports: [{ ...report, incompletion }] });
const reasonRef = doc(p, C, reasonId);
await check("reason invalid enum rejected", false, () => setDoc(reasonRef, reasonFresh({ reason: "bad", progress })));
await check("reason cannot reference another patient's cycle", false, () => setDoc(reasonRef, reasonFresh({ reason: "save_problem", progress: { ...progress, cycleId: "reason-other" } })));
await check("reason cannot reference another plan", false, () => setDoc(reasonRef, reasonFresh({ reason: "save_problem", progress: { ...progress, recommendationId: "other" } })));
await check("reason date must match daily document", false, () => setDoc(reasonRef, reasonFresh({ reason: "save_problem", progress: { ...progress, dateKey: "2026-10-23" } })));
await check("complete context cannot claim incompletion", false, () => setDoc(reasonRef, reasonFresh({ reason: "save_problem", progress: { ...progress, completedCount: 2 } })));
await check("reason fake measured source rejected", false, () => setDoc(reasonRef, reasonFresh({ reason: "save_problem", progress: { ...progress, source: "clinical_verified" } })));
await check("malformed context item rejected", false, () => setDoc(reasonRef, reasonFresh({ reason: "save_problem", progress: { ...progress, items: [null] } })));
await check("fake score in context attempt rejected", false, () => setDoc(reasonRef, reasonFresh({ reason: "save_problem", progress: { ...progress, items: [{ ...progress.items[0], attempts: [{ ...progress.items[0].attempts[0], score: 100 }] }] } })));
await check("missing numeric amount can remain null", true, () => setDoc(reasonRef, reasonFresh({ reason: "recognition_problem", progress })));
const reasonData = (await getDoc(reasonRef)).data();
await check("reason correction preserves earlier context", true, () => updateDoc(reasonRef, { revision: 2, reports: [...reasonData.reports, { ...report, incompletion: { reason: "no_time", progress } }], updatedAt: serverTimestamp() }));
await check("old context cannot be overwritten", false, () => updateDoc(reasonRef, { revision: 3, reports: [{ ...report }, ...reasonData.reports, { ...report }], updatedAt: serverTimestamp() }));
// Cycle reports: a report saved from a cycle's own entry names that cycle (subject).
const subjectId = `${P}_2026-10-25`;
const subjectRef = doc(p, C, subjectId);
const subject = { kind: "tracking_cycle", cycleId: "reason-owned", recommendationId: "reason-rec" };
const subjectFresh = reports => ({ ...fresh(), id: subjectId, dateKey: "2026-10-25", therapistId: "", relationId: "", reports, revision: reports.length });
await check("subject: own cycle and plan accepted", true, () => setDoc(subjectRef, subjectFresh([{ ...report, subject }])));
await seed(s => deleteDoc(doc(s, C, subjectId)));
await check("subject: another patient's cycle rejected", false, () => setDoc(subjectRef, subjectFresh([{ ...report, subject: { ...subject, cycleId: "reason-other" } }])));
await check("subject: another plan rejected", false, () => setDoc(subjectRef, subjectFresh([{ ...report, subject: { ...subject, recommendationId: "other" } }])));
await check("subject: missing cycle rejected", false, () => setDoc(subjectRef, subjectFresh([{ ...report, subject: { ...subject, cycleId: "no-such-cycle" } }])));
await check("subject: unknown kind rejected", false, () => setDoc(subjectRef, subjectFresh([{ ...report, subject: { ...subject, kind: "fixed_practice" } }])));
await check("subject: extra field rejected", false, () => setDoc(subjectRef, subjectFresh([{ ...report, subject: { ...subject, verified: true } }])));
await check("subject: missing field rejected", false, () => setDoc(subjectRef, subjectFresh([{ ...report, subject: { kind: "tracking_cycle", cycleId: "reason-owned" } }])));
const subjectProgress = { ...progress, dateKey: "2026-10-25" };
await seed(s => setDoc(doc(s, "trackingCycles", "reason-owned-2"), { patientId: P, userId: P, recommendationId: "reason-rec" }));
await check("subject: incompletion about the same cycle accepted", true, async () => {
  await setDoc(subjectRef, subjectFresh([{ ...report, subject, incompletion: { reason: "no_time", progress: subjectProgress } }]));
  await seed(s => deleteDoc(doc(s, C, subjectId)));
});
await check("subject: incompletion about another cycle rejected", false, () => setDoc(subjectRef, subjectFresh([{ ...report, subject: { ...subject, cycleId: "reason-owned-2" }, incompletion: { reason: "no_time", progress: subjectProgress } }])));
await check("subject: general report first, then a cycle report appended", true, async () => {
  await setDoc(subjectRef, subjectFresh([report]));
  await updateDoc(subjectRef, { revision: 2, reports: [report, { ...report, effort: "easy", subject }], updatedAt: serverTimestamp() });
});
await check("subject: an earlier general report cannot be re-labelled", false, () => updateDoc(subjectRef, { revision: 3, reports: [{ ...report, subject }, { ...report, effort: "easy", subject }, { ...report, subject }], updatedAt: serverTimestamp() }));
for (const result of results.filter(x => x.includes("concurrent devices"))) console.log(result);
await env.cleanup();
const failed = results.filter(x => x.startsWith("FAIL"));
console.log(`${results.length - failed.length}/${results.length} feedback rule checks passed`);
process.exit(failed.length ? 1 : 0);
