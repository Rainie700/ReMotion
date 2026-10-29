// Firestore rules check — runs ./firestore.rules against the LOCAL emulator only (project id
// "demo-remotion"; no real project, nothing deployed). Not part of `npm test`: it needs
//   - Java 21+ on PATH (firebase-tools requirement)
//   - firebase-tools 15, @firebase/rules-unit-testing 6, firebase 13 (install them in a
//     separate folder — @firebase/rules-unit-testing 6 needs firebase 13, the app uses 12)
// Copy this file into that folder (imports resolve from the script's own location), add a
// firebase.json there ({"firestore":{"rules":"firestore.rules"},"emulators":{"firestore":{"port":8080}}}),
// then:  RULES_PATH=<repo>/firestore.rules firebase emulators:exec --only firestore --project demo-remotion "node firestoreRulesCheck.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-remotion",
  firestore: { rules: readFileSync(process.env.RULES_PATH || new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
const P = "patient-1", T = "therapist-1", X = "outsider-1", T2 = "therapist-2";
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
const items = [{ exerciseId: "F01-16", rank: 1, reason: "r" }, { exerciseId: "F01-10", rank: 2, reason: "r", dose: { sets: 3, repetitions: null, durationSeconds: null } }];
const d5 = { sourceCycleId: "c1", reassessmentId: "re-1", currentLimitations: ["L01"], hasNewOrWorseningDiscomfort: false, decisionRuleId: "R003" };
const proposal = { id: "prop-1", kind: "f01_goal", origin: "d5_next_cycle", patientId: P, status: "draft", items: [{ exerciseId: "F01-16", rank: 1, reason: "r" }], d5 };
const review = {
  id: "prop-1", proposalId: "prop-1", patientId: P, therapistId: T, relationId: "rel-1", reviewedAt: "2026-10-05T03:00:00.000Z", reason: "x",
  items, basis: { reassessmentId: "re-1", currentLimitations: ["L01"], hasNewOrWorseningDiscomfort: false, decisionRuleId: "R003" }, basePlanFingerprint: "fp",
};
const acceptedWith = (over = {}) => ({ ...proposal, status: "accepted", items, d5: { ...d5, confirmation: { confirmedBy: P, therapistReviewId: "prop-1", planFingerprint: "fp2" } }, ...over });

async function reset() {
  await env.clearFirestore();
  await seed(async (s) => {
    await setDoc(doc(s, "therapistPatientRelations", "rel-1"), relation);
    await setDoc(doc(s, "recommendationResults", "prop-1"), proposal);
  });
}

// ── relations ──
await reset();
await check("patient starts a relation (invite code)", true, () => setDoc(doc(db(P), "therapistPatientRelations", "rel-new"), { ...relation, id: "rel-new", therapistId: T2 }));
await check("outsider cannot create a relation for the patient", false, () => setDoc(doc(db(X), "therapistPatientRelations", "rel-x"), { ...relation, id: "rel-x", therapistId: X }));
await check("therapist cannot create a relation on its own", false, () => setDoc(doc(db(T2), "therapistPatientRelations", "rel-t2"), { ...relation, id: "rel-t2", therapistId: T2 }));
await check("patient cannot link to itself", false, () => setDoc(doc(db(P), "therapistPatientRelations", "rel-self"), { ...relation, id: "rel-self", therapistId: P }));
await check("outsider cannot read the relation", false, () => getDoc(doc(db(X), "therapistPatientRelations", "rel-1")));
await check("patient reads own relation", true, () => getDoc(doc(db(P), "therapistPatientRelations", "rel-1")));
await check("therapist reads own relation", true, () => getDoc(doc(db(T), "therapistPatientRelations", "rel-1")));
await check("therapist may end the relation", true, () => updateDoc(doc(db(T), "therapistPatientRelations", "rel-1"), { status: "completed" }));
await check("therapist cannot re-activate it", false, () => updateDoc(doc(db(T), "therapistPatientRelations", "rel-1"), { status: "accepted" }));
await check("patient may re-activate it", true, () => updateDoc(doc(db(P), "therapistPatientRelations", "rel-1"), { status: "accepted" }));
await check("parties never change", false, () => updateDoc(doc(db(T), "therapistPatientRelations", "rel-1"), { patientId: X }));
await check("outsider cannot update it", false, () => updateDoc(doc(db(X), "therapistPatientRelations", "rel-1"), { status: "revoked" }));
await check("nobody deletes a relation", false, () => deleteDoc(doc(db(P), "therapistPatientRelations", "rel-1")));
await check("login query: therapist's relations", true, () => getDocs(query(collection(db(T), "therapistPatientRelations"), where("therapistId", "==", T))));
await check("login query: patient's relations", true, () => getDocs(query(collection(db(P), "therapistPatientRelations"), where("patientId", "==", P))));
await check("outsider cannot list the patient's relations", false, () => getDocs(query(collection(db(X), "therapistPatientRelations"), where("patientId", "==", P))));
// transfer (legacy dev tool): the source therapist revoked rel-1 towards T2 and creates the new one
await seed((s) => updateDoc(doc(s, "therapistPatientRelations", "rel-1"), { status: "revoked", transferredToTherapistId: T2 }));
await check("source therapist creates the transferred relation", true, () => setDoc(doc(db(T), "therapistPatientRelations", "rel-tr"), { ...relation, id: "rel-tr", therapistId: T2, sourceRelationId: "rel-1" }));
await check("outsider cannot fake a transfer", false, () => setDoc(doc(db(X), "therapistPatientRelations", "rel-tr2"), { ...relation, id: "rel-tr2", therapistId: T2, sourceRelationId: "rel-1" }));
await check("transfer only to the recorded target", false, () => setDoc(doc(db(T), "therapistPatientRelations", "rel-tr3"), { ...relation, id: "rel-tr3", therapistId: X, sourceRelationId: "rel-1" }));

// ── recommendations ──
await reset();
// integrity pass: a first recommendation now carries exerciseIds + a marker that rules can re-check
// G01 condition screen: a first recommendation always has at least one item (an empty one is refused below)
await check("patient creates own recommendation", true, () => setDoc(doc(db(P), "recommendationResults", "rec-a"), { id: "rec-a", kind: "f01_goal", patientId: P, status: "draft", items: [{ exerciseId: "F01-04", rank: 1 }], exerciseIds: ["F01-04"], initialReview: { required: false, triggerCodes: [], checkVersion: "f01-initial-review-1" } }));
await check("first recommendation with no items -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-empty"), { id: "rec-empty", kind: "f01_goal", patientId: P, status: "draft", items: [], exerciseIds: [], initialReview: { required: false, triggerCodes: [], checkVersion: "f01-initial-review-1" } }));
await check("first recommendation without the verifiable fields -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-b"), { id: "rec-b", kind: "f01_goal", patientId: P, status: "draft", items: [] }));
await check("outsider cannot create one for the patient", false, () => setDoc(doc(db(X), "recommendationResults", "rec-b"), { id: "rec-b", kind: "f01_goal", patientId: P, items: [] }));
await check("therapist cannot write the patient's proposal", false, () => updateDoc(doc(db(T), "recommendationResults", "prop-1"), { items }));
await check("outsider cannot update it", false, () => updateDoc(doc(db(X), "recommendationResults", "prop-1"), { status: "accepted" }));
await check("outsider cannot delete it", false, () => deleteDoc(doc(db(X), "recommendationResults", "prop-1")));
await check("patient re-evaluates own draft (status check)", true, () => updateDoc(doc(db(P), "recommendationResults", "prop-1"), { d5: { ...d5, currentLimitations: ["L01", "L04"] } }));
await check("patient cannot claim a review that does not exist", false, () => setDoc(doc(db(P), "recommendationResults", "prop-1"), acceptedWith()));

// ── therapist reviews ──
await reset();
await check("linked therapist writes the review", true, () => setDoc(doc(db(T), "d5TherapistReviews", "prop-1"), review));
await check("linked therapist updates the review", true, () => updateDoc(doc(db(T), "d5TherapistReviews", "prop-1"), { reason: "y" }));
await check("patient cannot write a review", false, () => setDoc(doc(db(P), "d5TherapistReviews", "prop-1"), { ...review, reason: "forged" }));
await check("patient cannot forge one as the therapist", false, () => setDoc(doc(db(P), "d5TherapistReviews", "prop-1"), { ...review, therapistId: P }));
await check("outsider cannot write a review", false, () => setDoc(doc(db(X), "d5TherapistReviews", "prop-1"), { ...review, therapistId: X }));
await check("review must target that patient's proposal", false, () => setDoc(doc(db(T), "d5TherapistReviews", "prop-1"), { ...review, patientId: X }));
await check("review id must be the proposal id", false, () => setDoc(doc(db(T), "d5TherapistReviews", "prop-other"), { ...review, id: "prop-other", proposalId: "prop-other" }));
await check("nobody deletes a review", false, () => deleteDoc(doc(db(T), "d5TherapistReviews", "prop-1")));
await check("patient reads the review", true, () => getDoc(doc(db(P), "d5TherapistReviews", "prop-1")));
await check("outsider cannot read the review", false, () => getDoc(doc(db(X), "d5TherapistReviews", "prop-1")));
await check("login query: patient's reviews", true, () => getDocs(query(collection(db(P), "d5TherapistReviews"), where("patientId", "==", P))));
await check("login query: therapist's reviews", true, () => getDocs(query(collection(db(T), "d5TherapistReviews"), where("therapistId", "==", T), where("patientId", "==", P), where("relationId", "==", "rel-1"))));

// ── acceptance bound to the review ──
await check("patient accepts exactly the reviewed plan", true, () => setDoc(doc(db(P), "recommendationResults", "prop-1"), acceptedWith()));
await check("accepted items are frozen", false, () => updateDoc(doc(db(P), "recommendationResults", "prop-1"), { items: [items[0]] }));
await seed((s) => updateDoc(doc(s, "therapistPatientRelations", "rel-1"), { status: "completed" }));
await check("linking the next cycle keeps working after the relation ended", true, () => updateDoc(doc(db(P), "recommendationResults", "prop-1"), { "d5.nextCycleId": "c2" }));
await check("ended relation: therapist can no longer write the review", false, () => updateDoc(doc(db(T), "d5TherapistReviews", "prop-1"), { reason: "z" }));
await reset();
await seed((s) => setDoc(doc(s, "d5TherapistReviews", "prop-1"), review));
await check("other items than the review -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "prop-1"), acceptedWith({ items: [items[0]] })));
await check("changed patient report (limitations) -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "prop-1"), acceptedWith({ d5: { ...d5, currentLimitations: ["L01", "L04"], confirmation: { therapistReviewId: "prop-1" } } })));
await check("review id of another doc -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "prop-1"), acceptedWith({ d5: { ...d5, confirmation: { therapistReviewId: "prop-x" } } })));
await seed((s) => updateDoc(doc(s, "therapistPatientRelations", "rel-1"), { status: "revoked" }));
await check("review of an ended relation -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "prop-1"), acceptedWith()));
await check("acceptance without a review claim (rule-ready plan) is a patient write", true, () => setDoc(doc(db(P), "recommendationResults", "prop-1"), { ...proposal, status: "accepted", d5: { ...d5, confirmation: { confirmedBy: P } } }));
await seed(async (s) => { await updateDoc(doc(s, "therapistPatientRelations", "rel-1"), { status: "accepted" }); await setDoc(doc(s, "recommendationResults", "prop-1"), { ...proposal, status: "accepted" }); });
await check("therapist cannot review an accepted proposal", false, () => setDoc(doc(db(T), "d5TherapistReviews", "prop-1"), review));

for (const r of results) console.log(r.join(" | "));
const failed = results.filter((r) => r[0] === "FAIL");
console.log(`\n${results.length - failed.length} / ${results.length} rule checks passed`);
await env.cleanup();
process.exit(failed.length ? 1 : 0);
