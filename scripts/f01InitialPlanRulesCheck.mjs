// First recommendation stage 2 rules check (docs/F01_INITIAL_REVIEW_PLAN.md) — LOCAL emulator only
// (project "demo-remotion"; nothing deployed). Not part of `npm test`. Same setup as
// scripts/f01InitialReviewRulesCheck.mjs:
//   RULES_PATH=<repo>/firestore.rules firebase emulators:exec --only firestore --project demo-remotion "node f01InitialPlanRulesCheck.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";

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

const relation = { id: "rel-1", therapistId: T, patientId: P, status: "accepted" };
const candidate = [{ exerciseId: "F01-09" }, { exerciseId: "F01-10" }, { exerciseId: "F01-11" }];
const confirmed = [{ exerciseId: "F01-09", dose: { sets: 2, repetitions: null, durationSeconds: null } }, { exerciseId: "F01-10" }, { exerciseId: "F01-12" }];
const marker = { required: true, triggerCodes: ["l05_f01_11_initial"], checkVersion: "f01-initial-review-1" };
const rec = { id: "rec-1", kind: "f01_goal", patientId: P, status: "draft", sourceAssessmentId: "fa-1", selectedGoalId: "G04", limitationIds: ["L05"], items: candidate, exerciseIds: ["F01-09", "F01-10", "F01-11"], initialReview: marker };
const review = { id: "rec-1", recommendationId: "rec-1", patientId: P, therapistId: T, relationId: "rel-1", status: "confirmed", reviewedAt: "2026-10-27T02:00:00.000Z", reason: "x",
  items: confirmed, basis: { recommendationId: "rec-1", sourceAssessmentId: "fa-1", selectedGoalId: "G04", limitationIds: ["L05"] }, basePlanFingerprint: "fp" };
const confirmation = { therapistReviewId: "rec-1", reviewVersionId: "irv-1", relationId: "rel-1", acceptedItemsKey: "pi-1", planFingerprint: "fp", confirmedAt: "2026-10-27T03:00:00.000Z", confirmedBy: P };
const acceptedRec = { ...rec, status: "accepted", candidateItems: candidate, items: confirmed, initialConfirmation: confirmation };
const cycleId = "trackingCycle_initial_rec-1";
const cycle = { id: cycleId, userId: P, patientId: P, functionalDomain: "F01", baselineAssessmentId: "fa-1", cycleStartDateKey: "2026-10-27", recommendationId: "rec-1",
  initialPlanAcceptance: { recommendationId: "rec-1", therapistReviewId: "rec-1", reviewVersionId: "irv-1", acceptedItemsKey: "pi-1", baselineSource: "original_assessment" },
  completedTrainingDates: [], createdAt: "2026-10-27T03:00:01.000Z" };

async function reset({ recDoc = rec, withReview = true, rel = relation, extra = async () => {} } = {}) {
  await env.clearFirestore();
  await seed(async (s) => {
    await setDoc(doc(s, "therapistPatientRelations", "rel-1"), rel);
    await setDoc(doc(s, "recommendationResults", "rec-1"), recDoc);
    if (withReview) await setDoc(doc(s, "f01InitialReviews", "rec-1"), review);
    await extra(s);
  });
}

// ── acceptance ──
await reset();
await check("patient accepts exactly the confirmed items", true, () => setDoc(doc(db(P), "recommendationResults", "rec-1"), acceptedRec));
await reset();
await check("accepting other items than the confirmation -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-1"), { ...acceptedRec, items: candidate }));
await reset();
await check("accepting without a confirmation claim -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-1"), { ...rec, status: "accepted", items: confirmed }));
await reset({ withReview: false });
await check("claiming a confirmation that does not exist -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-1"), acceptedRec));
await reset({ rel: { ...relation, status: "completed" } });
await check("confirmation of an ended relation -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-1"), acceptedRec));
await reset();
await check("changed conditions (limitations) vs the confirmation -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-1"), { ...acceptedRec, limitationIds: ["L05", "L04"] }));
await reset();
await check("patient cannot drop the review marker", false, () => updateDoc(doc(db(P), "recommendationResults", "rec-1"), { initialReview: { ...marker, required: false } }));
await check("outsider cannot accept for the patient", false, () => setDoc(doc(db(X), "recommendationResults", "rec-1"), acceptedRec));
await reset({ recDoc: acceptedRec });
await check("an accepted confirmation never changes", false, () => updateDoc(doc(db(P), "recommendationResults", "rec-1"), { initialConfirmation: { ...confirmation, confirmedAt: "2026-10-28T00:00:00.000Z" } }));
await check("accepted items never change", false, () => updateDoc(doc(db(P), "recommendationResults", "rec-1"), { items: candidate }));
await check("an accepted plan cannot be put back to draft", false, () => updateDoc(doc(db(P), "recommendationResults", "rec-1"), { status: "draft" }));
await check("other fields of an accepted plan may still be written", true, () => updateDoc(doc(db(P), "recommendationResults", "rec-1"), { note: "ok" }));

// ── first week ──
await reset({ recDoc: acceptedRec });
await check("first week with the plan's own id and acceptance", true, () => setDoc(doc(db(P), "trackingCycles", cycleId), cycle));
await check("a second device cannot overwrite it (different createdAt)", false, () => setDoc(doc(db(P), "trackingCycles", cycleId), { ...cycle, createdAt: "2026-10-27T03:00:09.000Z" }));
await check("its baseline cannot be swapped", false, () => updateDoc(doc(db(P), "trackingCycles", cycleId), { baselineAssessmentId: "fa-2" }));
await check("its acceptance link cannot change", false, () => updateDoc(doc(db(P), "trackingCycles", cycleId), { "initialPlanAcceptance.reviewVersionId": "irv-2" }));
await check("training progress on it is still written", true, () => updateDoc(doc(db(P), "trackingCycles", cycleId), { completedTrainingDates: ["2026-10-27"] }));
await reset({ recDoc: acceptedRec });
await check("first week under another id -> refused", false, () => setDoc(doc(db(P), "trackingCycles", "trackingCycle_x"), { ...cycle, id: "trackingCycle_x" }));
await check("first week not matching the accepted version -> refused", false, () => setDoc(doc(db(P), "trackingCycles", cycleId), { ...cycle, initialPlanAcceptance: { ...cycle.initialPlanAcceptance, reviewVersionId: "irv-other" } }));
await reset();
await check("first week before the plan is accepted -> refused", false, () => setDoc(doc(db(P), "trackingCycles", cycleId), cycle));

// ── ordinary cycles never run a plan that needs review ──
const plain = { id: "c-plain", userId: P, patientId: P, functionalDomain: "F01", baselineAssessmentId: "fa-1", recommendationId: "rec-1", completedTrainingDates: [], createdAt: "2026-10-27T03:00:00.000Z" };
await reset();
await check("ordinary cycle on a plan that needs review -> refused", false, () => setDoc(doc(db(P), "trackingCycles", "c-plain"), plain));
await reset({ recDoc: { ...rec, limitationIds: [], initialReview: { ...marker, required: false, triggerCodes: [] } } });
await check("ordinary cycle on a plan that does not need review", true, () => setDoc(doc(db(P), "trackingCycles", "c-plain"), plain));
await reset({ extra: (s) => setDoc(doc(s, "recommendationResults", "rec-ok"), { ...rec, id: "rec-ok", limitationIds: [], initialReview: { ...marker, required: false, triggerCodes: [] } }) });
await seed((s) => setDoc(doc(s, "trackingCycles", "c-old"), { ...plain, id: "c-old", recommendationId: "rec-ok" }));
await check("re-linking an ordinary cycle onto a plan that needs review -> refused", false, () => updateDoc(doc(db(P), "trackingCycles", "c-old"), { recommendationId: "rec-1" }));
await check("progress on an ordinary cycle is still written", true, () => updateDoc(doc(db(P), "trackingCycles", "c-old"), { completedTrainingDates: ["2026-10-27"] }));
await check("ordinary cycle on a recommendation not yet in the cloud -> refused (integrity pass)", false, () => setDoc(doc(db(P), "trackingCycles", "c-missing"), { ...plain, id: "c-missing", recommendationId: "rec-not-synced" }));

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await env.cleanup();
process.exit(failed ? 1 : 0);
