// Replays the patient00 six-week manifest against the LOCAL Firestore emulator (project
// "demo-remotion"; nothing real, nothing deployed) under a given rules file, as the same
// accounts (uids) the real write would use. Same setup as scripts/firestoreRulesCheck.mjs:
// run from a folder with firebase 13 + @firebase/rules-unit-testing 6 installed, e.g.
//   RULES_PATH=<repo>/scripts/demo/patient00History6w/rules/firestore.minimal-d5-reviews.rules \
//   DEMO_DIR=<repo>/scripts/demo/patient00History6w EXPECT=all_ok \
//   firebase emulators:exec --only firestore --project demo-remotion "node checkRulesEmulator.mjs"
// EXPECT=all_ok        every phase must succeed (+ negative checks must be refused)
// EXPECT=t1_refused    P1 succeeds, T1 (the review) is refused  — the currently deployed rules
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";

const dir = process.env.DEMO_DIR;
const manifest = JSON.parse(readFileSync(join(dir, "private/manifest.json"), "utf8"));
const real = JSON.parse(readFileSync(join(dir, "private/real_docs.json"), "utf8"));
const env = await initializeTestEnvironment({
  projectId: "demo-remotion",
  firestore: { rules: readFileSync(process.env.RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
});
const P = real.uid;
const T = real.relations.find((r) => r.status === "accepted").therapistId;
const OUTSIDER = "outsider-therapist";
const db = (uid) => env.authenticatedContext(uid).firestore();
const actorUid = { patient00: P, therapist00: T };
const results = [];
const check = async (name, expectOk, fn) => {
  try { await (expectOk ? assertSucceeds(fn()) : assertFails(fn())); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, String(e && e.message).slice(0, 160)]); }
};
const run = async (w) => (w.op === "update"
  ? updateDoc(doc(db(actorUid[w.actor]), w.collection, w.id), w.fields)
  : setDoc(doc(db(actorUid[w.actor]), w.collection, w.id), w.doc));

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const s = ctx.firestore();
  for (const r of real.relations) await setDoc(doc(s, "therapistPatientRelations", r.id), r);
  for (const [c, d] of [["trackingCycles", real.cycle], ["functionalAssessmentSessions", real.baseline], ["functionalAssessmentSessions", real.reassessment], ["recommendationResults", real.phaseC], ["recommendationResults", real.proposal], ["llmWeeklySummaries", real.summary]]) {
    if (d) { const { id, ...data } = d; await setDoc(doc(s, c, id), { id, ...data }); }
  }
});

const steps = [...manifest.writes, ...manifest.realUpdates].sort((a, b) => ["P1", "T1", "P2", "T2"].indexOf(a.phase) - ["P1", "T1", "P2", "T2"].indexOf(b.phase));
const expect = process.env.EXPECT || "all_ok";
for (const phase of ["P1", "T1", "P2", "T2"]) {
  const list = steps.filter((w) => w.phase === phase);
  if (expect === "t1_refused" && phase === "T1") {
    for (const w of list) await check(`T1 refused under these rules: ${w.collection}`, false, () => run(w));
    break; // P2 depends on T1: stop exactly where a real run would stop
  }
  for (const w of list) await check(`${phase} ${w.actor} ${w.op || "set"} ${w.collection}${w.version ? ` (${w.version})` : ""}`, true, () => run(w));
}

if (expect === "all_ok") {
  const review = manifest.writes.find((w) => w.collection === "d5TherapistReviews");
  await check("patient reads the review", true, () => getDoc(doc(db(P), "d5TherapistReviews", review.id)));
  await check("linked therapist reads the review", true, () => getDoc(doc(db(T), "d5TherapistReviews", review.id)));
  await check("another therapist cannot read the review", false, () => getDoc(doc(db(OUTSIDER), "d5TherapistReviews", review.id)));
  await check("patient cannot write a review", false, () => setDoc(doc(db(P), "d5TherapistReviews", review.id), { ...review.doc, reason: "x" }));
  await check("unlinked therapist cannot write a review", false, () => setDoc(doc(db(OUTSIDER), "d5TherapistReviews", review.id), { ...review.doc, therapistId: OUTSIDER }));
  await check("review of an ACCEPTED proposal is refused", false, () => setDoc(doc(db(T), "d5TherapistReviews", review.id), { ...review.doc, reason: "late edit" }));
  await check("nobody deletes a review", false, () => deleteDoc(doc(db(T), "d5TherapistReviews", review.id)));
  await check("patient cannot delete a cycle", false, () => deleteDoc(doc(db(P), "trackingCycles", manifest.writes.find((w) => w.collection === "trackingCycles").id)));
  await check("therapist cannot delete a summary", false, () => deleteDoc(doc(db(T), "llmWeeklySummaries", manifest.writes.find((w) => w.collection === "llmWeeklySummaries").id)));
}
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`${results.length - failed}/${results.length} as expected (${expect})`);
await env.cleanup();
process.exit(failed ? 1 : 0);
