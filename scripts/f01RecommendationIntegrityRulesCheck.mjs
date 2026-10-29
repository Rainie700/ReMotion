// Integrity pass rules check (docs/F01_INITIAL_REVIEW_PLAN.md 8-7) — LOCAL emulator only
// (project "demo-remotion"; nothing deployed). Not part of `npm test`. Same setup as
// scripts/f01InitialReviewRulesCheck.mjs:
//   RULES_PATH=<repo>/firestore.rules firebase emulators:exec --only firestore --project demo-remotion "node f01RecommendationIntegrityRulesCheck.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc, deleteDoc, deleteField } from "firebase/firestore";

const env = await initializeTestEnvironment({
  projectId: "demo-remotion",
  firestore: { rules: readFileSync(process.env.RULES_PATH || new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 },
});
const P = "patient-1", X = "outsider-1";
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
const items = (...ids) => ids.map((exerciseId, i) => ({ exerciseId, rank: i + 1 }));
const marker = (required) => ({ required, triggerCodes: required ? ["l05_f01_11_initial"] : [], checkVersion: "f01-initial-review-1" });
const plain = { id: "rec-a", kind: "f01_goal", patientId: P, status: "draft", sourceAssessmentId: "fa-1", selectedGoalId: "G04", limitationIds: [], items: items("F01-09", "F01-10", "F01-11"), exerciseIds: ["F01-09", "F01-10", "F01-11"], initialReview: marker(false) };
const held = { ...plain, id: "rec-h", limitationIds: ["L05"], initialReview: marker(true) };
const legacy = (() => { const { exerciseIds: _e, initialReview: _m, ...r } = plain; return { ...r, id: "rec-legacy" }; })();
// G01 condition screen (docs/F01_G01_IMPLEMENTABLE_CONDITIONS.md): a one-item G01 plan with its condition snapshot; an empty plan
const g01 = { ...plain, id: "rec-g01", selectedGoalId: "G01", items: items("F01-04"), exerciseIds: ["F01-04"], shortfall: { requested: 3, available: 1 },
  conditionScreen: { ruleVersion: "f01-g01-condition-screen-1.0", sourceAssessmentId: "fa-1", sourceProblem: null, reportCount: 1, reportIndex: 0, armsUsed: "no", physicalAssistance: "no", sitToStandPassed: true, reasonCodes: [] } };
const empty = { ...plain, id: "rec-empty", selectedGoalId: "G01", items: [], exerciseIds: [] };
const proposal = { id: "prop-1", kind: "f01_goal", origin: "d5_next_cycle", patientId: P, status: "accepted", items: items("F01-09") };
const cycle = (id, recommendationId) => ({ id, userId: P, patientId: P, functionalDomain: "F01", baselineAssessmentId: "fa-1", recommendationId, completedTrainingDates: [], createdAt: "2026-10-27T03:00:00.000Z" });

async function reset(docs = []) {
  await env.clearFirestore();
  await seed(async (s) => { for (const d of docs) await setDoc(doc(s, "recommendationResults", d.id), d); });
}

// ── creating a first recommendation: exerciseIds mirror items, marker recomputed ──
await reset();
await check("valid first recommendation (no review)", true, () => setDoc(doc(db(P), "recommendationResults", "rec-a"), plain));
await check("valid first recommendation (review needed)", true, () => setDoc(doc(db(P), "recommendationResults", "rec-h"), held));
await check("exerciseIds missing -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-1"), { ...plain, id: "rec-1", exerciseIds: null }));
await check("exerciseIds not matching items -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-2"), { ...plain, id: "rec-2", exerciseIds: ["F01-09", "F01-10", "F01-12"] }));
await check("exerciseIds in another order -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-3"), { ...plain, id: "rec-3", exerciseIds: ["F01-10", "F01-09", "F01-11"] }));
await check("marker 'no review' while L05 + F01-11 -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-4"), { ...held, id: "rec-4", initialReview: marker(false) }));
await check("marker 'review' without L05 -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-5"), { ...plain, id: "rec-5", initialReview: marker(true) }));
await check("marker missing -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-6"), { ...plain, id: "rec-6", initialReview: null }));
await check("more than 3 candidate items -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-7"), { ...plain, id: "rec-7", items: items("F01-09", "F01-10", "F01-12", "F01-13"), exerciseIds: ["F01-09", "F01-10", "F01-12", "F01-13"] }));
await check("G01 one-item plan with condition snapshot", true, () => setDoc(doc(db(P), "recommendationResults", "rec-g01"), g01));
await check("empty first recommendation (no items) -> refused", false, () => setDoc(doc(db(P), "recommendationResults", "rec-empty"), empty));
await check("missing limitations with F01-11 must be marked as needing review", true, () => setDoc(doc(db(P), "recommendationResults", "rec-8"), { ...plain, id: "rec-8", limitationIds: null, initialReview: marker(true) }));
await reset([plain, legacy]);
await check("exerciseIds cannot be removed", false, () => updateDoc(doc(db(P), "recommendationResults", "rec-a"), { exerciseIds: deleteField() }));
await check("exerciseIds cannot be changed", false, () => updateDoc(doc(db(P), "recommendationResults", "rec-a"), { exerciseIds: ["F01-09"] }));
await check("items cannot drift from exerciseIds", false, () => updateDoc(doc(db(P), "recommendationResults", "rec-a"), { items: items("F01-12") }));
await check("other fields still update", true, () => updateDoc(doc(db(P), "recommendationResults", "rec-a"), { note: "x" }));
await check("legacy record (no exerciseIds) still updates its other fields", true, () => updateDoc(doc(db(P), "recommendationResults", "rec-legacy"), { note: "x" }));

// ── deleting: F01 goal plans are never deleted by a client ──
await reset([plain, { ...plain, id: "rec-acc", status: "accepted" }, proposal, { id: "legacy-daily", kind: "daily", patientId: P, items: [] }]);
await check("draft first recommendation cannot be deleted", false, () => deleteDoc(doc(db(P), "recommendationResults", "rec-a")));
await check("accepted recommendation cannot be deleted", false, () => deleteDoc(doc(db(P), "recommendationResults", "rec-acc")));
await check("next-stage proposal cannot be deleted", false, () => deleteDoc(doc(db(P), "recommendationResults", "prop-1")));
await check("other kinds keep owner delete", true, () => deleteDoc(doc(db(P), "recommendationResults", "legacy-daily")));
await check("outsider cannot delete", false, () => deleteDoc(doc(db(X), "recommendationResults", "rec-a")));

// ── cycles: the recommendation must be in the cloud, owned and verifiably not needing review ──
await reset([plain, held, legacy, proposal, { ...plain, id: "rec-other", patientId: X }, g01, empty]);
await check("cycle on a verified no-review plan", true, () => setDoc(doc(db(P), "trackingCycles", "c1"), cycle("c1", "rec-a")));
await check("cycle on a plan that needs review -> refused", false, () => setDoc(doc(db(P), "trackingCycles", "c2"), cycle("c2", "rec-h")));
await check("cycle on a legacy plan without marker -> refused", false, () => setDoc(doc(db(P), "trackingCycles", "c3"), cycle("c3", "rec-legacy")));
await check("cycle on a plan not in the cloud -> refused", false, () => setDoc(doc(db(P), "trackingCycles", "c4"), cycle("c4", "rec-missing")));
await check("cycle without a recommendation -> refused", false, () => setDoc(doc(db(P), "trackingCycles", "c5"), { ...cycle("c5", null), recommendationId: null }));
await check("cycle on another patient's plan -> refused", false, () => setDoc(doc(db(P), "trackingCycles", "c6"), cycle("c6", "rec-other")));
await check("next-stage cycle on an existing proposal (D5)", true, () => setDoc(doc(db(P), "trackingCycles", "c7"), cycle("c7", "prop-1")));
await seed((s) => setDoc(doc(s, "trackingCycles", "c-old"), cycle("c-old", "rec-legacy"))); // a running legacy week
await check("running legacy week: progress still written", true, () => updateDoc(doc(db(P), "trackingCycles", "c-old"), { completedTrainingDates: ["2026-10-27"] }));
await check("re-link onto a verified plan", true, () => updateDoc(doc(db(P), "trackingCycles", "c1"), { recommendationId: "rec-a" }));
await check("re-link onto a legacy plan -> refused", false, () => updateDoc(doc(db(P), "trackingCycles", "c1"), { recommendationId: "rec-legacy" }));
await check("re-link onto a plan that needs review -> refused", false, () => updateDoc(doc(db(P), "trackingCycles", "c1"), { recommendationId: "rec-h" }));
await check("cycle on a one-item G01 plan", true, () => setDoc(doc(db(P), "trackingCycles", "c8"), cycle("c8", "rec-g01")));
await check("cycle on an empty plan (seeded) -> refused", false, () => setDoc(doc(db(P), "trackingCycles", "c9"), cycle("c9", "rec-empty")));
await check("re-link onto an empty plan -> refused", false, () => updateDoc(doc(db(P), "trackingCycles", "c1"), { recommendationId: "rec-empty" }));
await check("re-link onto a missing plan -> refused", false, () => updateDoc(doc(db(P), "trackingCycles", "c1"), { recommendationId: "rec-missing" }));

for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await env.cleanup();
process.exit(failed ? 1 : 0);
