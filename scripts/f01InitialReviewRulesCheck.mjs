// f01InitialReviews rules check (docs/F01_INITIAL_REVIEW_PLAN.md stage 1) — LOCAL emulator only
// (project "demo-remotion"; nothing deployed). Not part of `npm test`. Same setup as
// scripts/firestoreRulesCheck.mjs: run from an isolated folder that has firebase-tools,
// @firebase/rules-unit-testing and firebase installed, with Java 17+ on PATH:
//   RULES_PATH=<repo>/firestore.rules firebase emulators:exec --only firestore --project demo-remotion "node f01InitialReviewRulesCheck.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-remotion",
  firestore: { rules: readFileSync(process.env.RULES_PATH || new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
const P = "patient-1", T = "therapist-1", X = "outsider-1";
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

const relation = { id: "rel-1", therapistId: T, patientId: P, status: "accepted", inviteCode: "ABC123" };
const rec = { id: "rec-1", kind: "f01_goal", patientId: P, status: "draft", limitationIds: ["L05"], items: [{ exerciseId: "F01-09" }, { exerciseId: "F01-10" }, { exerciseId: "F01-11" }],
  initialReview: { required: true, triggerCodes: ["l05_f01_11_initial"], checkVersion: "f01-initial-review-1" } };
const review = { id: "rec-1", recommendationId: "rec-1", patientId: P, therapistId: T, relationId: "rel-1", status: "confirmed", reviewedAt: "2026-10-27T03:00:00.000Z", reason: "x",
  items: [{ exerciseId: "F01-09" }], basis: { recommendationId: "rec-1", limitationIds: ["L05"] }, basePlanFingerprint: "fp" };

async function reset(recOver = {}) {
  await env.clearFirestore();
  await seed(async (s) => {
    await setDoc(doc(s, "therapistPatientRelations", "rel-1"), relation);
    await setDoc(doc(s, "recommendationResults", "rec-1"), { ...rec, ...recOver });
  });
}

await reset();
await check("linked therapist writes the confirmation", true, () => setDoc(doc(db(T), "f01InitialReviews", "rec-1"), review));
await check("linked therapist updates it", true, () => updateDoc(doc(db(T), "f01InitialReviews", "rec-1"), { reason: "y" }));
await check("patient cannot write a confirmation", false, () => setDoc(doc(db(P), "f01InitialReviews", "rec-1"), { ...review, reason: "forged" }));
await check("patient cannot forge one as the therapist", false, () => setDoc(doc(db(P), "f01InitialReviews", "rec-1"), { ...review, therapistId: P }));
await check("outsider cannot write one", false, () => setDoc(doc(db(X), "f01InitialReviews", "rec-1"), { ...review, therapistId: X }));
await check("must target that patient's recommendation", false, () => setDoc(doc(db(T), "f01InitialReviews", "rec-1"), { ...review, patientId: X }));
await check("doc id must be the recommendation id", false, () => setDoc(doc(db(T), "f01InitialReviews", "rec-other"), { ...review, id: "rec-other", recommendationId: "rec-other" }));
await check("recommendationId must match the doc id", false, () => setDoc(doc(db(T), "f01InitialReviews", "rec-1"), { ...review, recommendationId: "rec-2" }));
await check("nobody deletes a confirmation", false, () => deleteDoc(doc(db(T), "f01InitialReviews", "rec-1")));
await check("patient reads it", true, () => getDoc(doc(db(P), "f01InitialReviews", "rec-1")));
await check("linked therapist reads it", true, () => getDoc(doc(db(T), "f01InitialReviews", "rec-1")));
await check("outsider cannot read it", false, () => getDoc(doc(db(X), "f01InitialReviews", "rec-1")));
await check("login query: patient's confirmations", true, () => getDocs(query(collection(db(P), "f01InitialReviews"), where("patientId", "==", P))));
await check("login query: therapist's confirmations", true, () => getDocs(query(collection(db(T), "f01InitialReviews"), where("therapistId", "==", T), where("patientId", "==", P), where("relationId", "==", "rel-1"))));

// relation ended -> no more writes / reads by the therapist
await seed((s) => updateDoc(doc(s, "therapistPatientRelations", "rel-1"), { status: "completed" }));
await check("ended relation: therapist can no longer write", false, () => updateDoc(doc(db(T), "f01InitialReviews", "rec-1"), { reason: "z" }));
await check("ended relation: therapist can no longer read", false, () => getDoc(doc(db(T), "f01InitialReviews", "rec-1")));

// target conditions
await reset({ status: "accepted" });
await check("cannot confirm an accepted recommendation", false, () => setDoc(doc(db(T), "f01InitialReviews", "rec-1"), review));
await reset({ origin: "d5_next_cycle" });
await check("cannot target a next-stage proposal", false, () => setDoc(doc(db(T), "f01InitialReviews", "rec-1"), review));
await reset({ initialReview: { required: false, triggerCodes: [], checkVersion: "f01-initial-review-1" } });
await check("cannot target a recommendation marked as not needing review", false, () => setDoc(doc(db(T), "f01InitialReviews", "rec-1"), review));
const { initialReview: _m, ...legacyRec } = rec;
await env.clearFirestore();
await seed(async (s) => { await setDoc(doc(s, "therapistPatientRelations", "rel-1"), relation); await setDoc(doc(s, "recommendationResults", "rec-1"), legacyRec); });
await check("legacy recommendation without a marker can be confirmed", true, () => setDoc(doc(db(T), "f01InitialReviews", "rec-1"), review));
await check("missing recommendation cannot be targeted", false, () => setDoc(doc(db(T), "f01InitialReviews", "rec-missing"), { ...review, id: "rec-missing", recommendationId: "rec-missing" }));

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await env.cleanup();
process.exit(failed ? 1 : 0);
