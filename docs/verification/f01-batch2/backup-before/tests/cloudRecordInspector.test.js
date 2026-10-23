import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Read-only cloud check of trackingCycles docs (js/dev/cloudRecordInspector.js):
 * the pure classifier separates "not in cloud", "in cloud but not loaded" and
 * "read failed" — and never reports a failed / denied read as "not in cloud".
 */

const globalStore = new Map();
globalThis.localStorage = { getItem: (k) => (globalStore.has(k) ? globalStore.get(k) : null), setItem: (k, v) => globalStore.set(k, String(v)), removeItem: (k) => globalStore.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { classifyCloudPresence, summarizeCycleDoc, checkShowcaseOwnership, CLOUD_PRESENCE: P } = await import("../js/dev/cloudRecordInspector.js");

const A = "showcase_p00_x_trackingCycle_001";
const B = "showcase_p00_x_trackingCycle_002";
const status = (rows) => Object.fromEntries(rows.map((r) => [r.id, r.status]));
const ok = (docs) => ({ ok: true, docs });
const exists = { ok: true, exists: true, data: {} };
const absent = { ok: true, exists: false, data: null };
const denied = { ok: false, code: "permission-denied" };

// case 2 — returned by the login query but not in this browser
assert.deepEqual(status(classifyCloudPresence({ ids: [A, B], role: "patient", listing: ok({ [A]: {}, [B]: {} }), gets: { [A]: exists, [B]: exists }, localIds: [B] })),
  { [A]: P.IN_CLOUD_NOT_LOCAL, [B]: P.IN_CLOUD_AND_LOCAL });
// case 2 — exists (get) but outside the login query (e.g. other relation stamp for a therapist)
assert.equal(classifyCloudPresence({ ids: [A], role: "therapist", listing: ok({}), gets: { [A]: exists } })[0].status, P.IN_CLOUD_NOT_IN_LOAD_QUERY);
// case 1 — listing lacks it and get says it does not exist
assert.equal(classifyCloudPresence({ ids: [A], role: "patient", listing: ok({}), gets: { [A]: absent } })[0].status, P.NOT_IN_CLOUD);
// patient: full patient listing lacks it, get denied (rules deny a get of a missing doc) -> no doc for this patient, NOT "read_failed"
assert.equal(classifyCloudPresence({ ids: [A], role: "patient", listing: ok({}), gets: { [A]: denied } })[0].status, P.NOT_IN_PATIENT_SCOPE);
// therapist: absence can't be proven from the therapist's query
assert.equal(classifyCloudPresence({ ids: [A], role: "therapist", listing: ok({}), gets: { [A]: denied } })[0].status, P.NOT_VISIBLE_TO_THERAPIST);
// case 3 — the listing itself failed: never "not in cloud", even if get also failed
for (const g of [denied, { ok: false, code: "unavailable" }, absent]) {
  assert.equal(classifyCloudPresence({ ids: [A], role: "patient", listing: { ok: false, code: "unavailable" }, gets: { [A]: g } })[0].status, P.READ_FAILED, `listing failed + get ${JSON.stringify(g)}`);
}
// patient, listing ok but get failed for another reason -> read_failed, not absence
assert.equal(classifyCloudPresence({ ids: [A], role: "patient", listing: ok({}), gets: { [A]: { ok: false, code: "unavailable" } } })[0].status, P.READ_FAILED);
// a found doc always wins, whatever get said
assert.equal(classifyCloudPresence({ ids: [A], role: "patient", listing: ok({ [A]: {} }), gets: { [A]: denied } })[0].status, P.IN_CLOUD_NOT_LOCAL);
// each row records both raw outcomes
{
  const [row] = classifyCloudPresence({ ids: [A], role: "patient", listing: ok({}), gets: { [A]: denied }, localIds: [] });
  assert.deepEqual([row.listing, row.get, row.local], ["not_returned", "failed:permission-denied", false]);
}

// summary: links and dates only
{
  const s = summarizeCycleDoc({ userId: "u", patientId: "u", therapistId: "t", relationId: "r", cycleStartDateKey: "2026-09-22", baselineAssessmentId: "b", reassessmentId: "x", completedTrainingDates: ["a", "b"], discomfortNote: "free text" }, "u");
  assert.equal(s.patientIdIsSelf, true);
  assert.equal(s.completedTrainingDays, 2);
  assert.ok(!("discomfortNote" in s) && !("therapistId" in s), "no free text, no other account ids");
}

// ownership: the uid tag in the ids and the owners of the referencing records
{
  const uid = "2xo7muLMrestOfUid";
  const ids = ["showcase_p00_2xo7muLM_trackingCycle_001", "showcase_p00_2xo7muLM_trackingCycle_002"];
  const sessions = [
    { id: "showcase_p00_2xo7muLM_functionalAssessment_001", patientId: uid, result: { totalDurationMs: 12800 } },
    { id: "showcase_p00_2xo7muLM_functionalAssessment_002", patientId: uid, result: { totalDurationMs: 8900 } },
    { id: "real-1", patientId: uid, result: { totalDurationMs: 8867 } },
  ];
  const records = [...Array(16)].map((_, i) => ({ id: `r${i}`, patientId: uid, trackingCycleId: ids[i < 12 ? 0 : 1] }));
  const o = checkShowcaseOwnership({ userId: uid, ids, sessions, records });
  assert.equal(o.uidTagMatchesIds, true);
  assert.deepEqual(o.showcaseSessions, { total: 2, ownedBySignedInUser: 2, ownedByAnotherId: 0, durationsMs: [12800, 8900] });
  assert.deepEqual(o.recordsReferencingIds, { total: 16, ownedBySignedInUser: 16, ownedByAnotherId: 0 });
  const other = checkShowcaseOwnership({ userId: "zzzzzzzzOther", ids, sessions, records });
  assert.equal(other.uidTagMatchesIds, false, "another UID -> tag mismatch");
  assert.equal(other.showcaseSessions.total, 0, "only the signed-in UID's tag is counted");
  assert.deepEqual(other.recordsReferencingIds, { total: 16, ownedBySignedInUser: 0, ownedByAnotherId: 16 });
  assert.ok(!JSON.stringify(o).includes(uid), "no UID in the output");
}

// read-only: the module never writes
{
  const src = readFileSync(join(root, "js/dev/cloudRecordInspector.js"), "utf8");
  assert.ok(!/\b(setDoc|addDoc|updateDoc|deleteDoc|writeBatch|runTransaction)\b/.test(src), "no Firestore write API");
  assert.ok(!/createCollection|localStorage/.test(src), "no local storage access");
  assert.ok(/getDocsFromServer\(query\(col, where\("patientId", "==", user\.id\)\)\)/.test(src), "patient listing = full server query on patientId");
  assert.ok(!/\blimit\(|\bgetDocs\(|\bgetDoc\(/.test(src), "no limit, no cache-capable reads");
  const app = readFileSync(join(root, "app.js"), "utf8");
  const helper = app.slice(app.indexOf("async inspectCloudTrackingCycles("), app.indexOf("async inspectCloudTrackingCycles(") + 1200);
  assert.ok(/if \(import\.meta\.env && import\.meta\.env\.DEV\)[\s\S]*async inspectCloudTrackingCycles\(/.test(app), "dev-only helper");
  assert.ok(!/\.(create|update|remove|replaceAll)\(/.test(helper), "helper does not write local data");
}

console.log("cloudRecordInspector: all assertions passed");
