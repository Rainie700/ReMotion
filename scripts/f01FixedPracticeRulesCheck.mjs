// G01 坐站固定練習 — f01FixedPracticeRecords rules check, LOCAL emulator only (project demo-remotion; nothing deployed).
//   RULES_PATH=<repo>/firestore.rules firebase emulators:exec --only firestore --project demo-remotion "node f01FixedPracticeRulesCheck.mjs"
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, getDocs, updateDoc, deleteDoc, collection, query, where } from "firebase/firestore";

const env = await initializeTestEnvironment({ projectId: "demo-remotion", firestore: { rules: readFileSync(process.env.RULES_PATH || new URL("../firestore.rules", import.meta.url), "utf8"), host: "127.0.0.1", port: 8080 } });
const P = "patient-1", X = "outsider-1";
const db = (uid) => env.authenticatedContext(uid).firestore();
const results = [];
async function check(name, expectOk, fn) {
  try { await (expectOk ? assertSucceeds(fn()) : assertFails(fn())); results.push(["PASS", name]); }
  catch (e) { results.push(["FAIL", name, String(e && e.message).slice(0, 160)]); }
}
const id = `f01FixedPractice_${P}_run_abcdef12`;
const ai = { method: "ai_pose", countedReps: 3, targetReached: false, endedEarly: true, unconfirmedAttemptCount: 1, unconfirmedReasons: ["tracking_lost"], longCycleRepCount: 0, abortedRiseCount: 0, handSupportVerified: false };
const rec = { id, kind: "f01_fixed_practice", schemaVersion: "f01-fixed-practice-1", programVersion: "nhs-sit-to-stand-2024-02-28-v1", sourceRef: "https://www.nhs.uk/live-well/exercise/strength-exercises/",
  patientId: P, exerciseId: "F01-04", exerciseName: "坐姿起立", target: { repetitions: 5, sets: null }, instructionsReadAt: "2026-10-27T01:00:00.000Z", startedAt: "2026-10-27T01:01:00.000Z",
  completedAt: "2026-10-27T01:03:00.000Z", dateKey: "2026-10-27", ai, selfReport: null, createdAt: "2026-10-27T01:03:00.000Z", updatedAt: "2026-10-27T01:03:00.000Z" };
const ref = (uid, docId = id) => doc(db(uid), "f01FixedPracticeRecords", docId);

await env.clearFirestore();
await check("owner creates own record", true, () => setDoc(ref(P), rec));
await check("same id written again with the same content (retry)", true, () => setDoc(ref(P), rec));
await check("outsider cannot create one for the patient", false, () => setDoc(ref(X, `f01FixedPractice_${P}_run_other123`), { ...rec, id: `f01FixedPractice_${P}_run_other123` }));
await check("id must carry the owner's uid", false, () => setDoc(ref(P, `f01FixedPractice_${X}_run_abcdef99`), { ...rec, id: `f01FixedPractice_${X}_run_abcdef99` }));
await check("target other than 5 repetitions refused", false, () => setDoc(ref(P, `f01FixedPractice_${P}_run_target01`), { ...rec, id: `f01FixedPractice_${P}_run_target01`, target: { repetitions: 8, sets: 3 } }));
await check("other exercise refused", false, () => setDoc(ref(P, `f01FixedPractice_${P}_run_exer0001`), { ...rec, id: `f01FixedPractice_${P}_run_exer0001`, exerciseId: "F01-01" }));
await check("without instructionsReadAt refused", false, () => setDoc(ref(P, `f01FixedPractice_${P}_run_noread01`), { ...rec, id: `f01FixedPractice_${P}_run_noread01`, instructionsReadAt: null }));
await check("owner reads", true, () => getDoc(ref(P)));
await check("owner lists own records", true, () => getDocs(query(collection(db(P), "f01FixedPracticeRecords"), where("patientId", "==", P))));
await check("outsider cannot read", false, () => getDoc(ref(X)));
await check("outsider cannot list the patient's records", false, () => getDocs(query(collection(db(X), "f01FixedPracticeRecords"), where("patientId", "==", P))));
await check("self-report added later", true, () => updateDoc(ref(P), { selfReport: { totalReps: 4, reportedAt: "2026-10-27T01:05:00.000Z", source: "self_report" }, updatedAt: "2026-10-27T01:05:00.000Z" }));
await check("AI count cannot be changed", false, () => updateDoc(ref(P), { ai: { ...ai, countedReps: 5 } }));
await check("target cannot be changed", false, () => updateDoc(ref(P), { target: { repetitions: 3, sets: null } }));
await check("other fields cannot be changed", false, () => updateDoc(ref(P), { dateKey: "2026-10-01" }));
await check("outsider cannot update", false, () => updateDoc(ref(X), { selfReport: null }));
await check("a record owned by someone else at that id cannot be overwritten", false, async () => {
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "f01FixedPracticeRecords", `f01FixedPractice_${P}_run_blocked1`), { ...rec, id: `f01FixedPractice_${P}_run_blocked1`, patientId: X }));
  return setDoc(ref(P, `f01FixedPractice_${P}_run_blocked1`), { ...rec, id: `f01FixedPractice_${P}_run_blocked1` });
});
await check("owner cannot delete", false, () => deleteDoc(ref(P)));
for (const r of results) console.log(r.join("  "));
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} passed`);
await env.cleanup();
process.exit(failed ? 1 : 0);
