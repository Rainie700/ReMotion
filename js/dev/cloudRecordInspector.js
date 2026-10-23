/**
 * Dev / admin only — READ-ONLY cloud check of specific trackingCycles docs
 * for the signed-in account. Nothing is written, merged or cached: it only
 * runs Firestore reads with the current login and reports what it saw.
 *
 * Two independent reads per id, because the rules make a single read
 * ambiguous (`allow read: if resource.data.patientId == uid || linked(...)`:
 * a get of a doc that does not exist evaluates against a null resource and is
 * DENIED, exactly like a doc the account may not read):
 *   listing — the same query the login load uses (patient: patientId == uid;
 *             therapist: therapistId + patientId + relationId per relation);
 *   get     — the doc itself, trackingCycles/{id}.
 * Both are forced SERVER reads (getDocsFromServer / getDocFromServer): a
 * cache can never answer, and offline is a read failure. The listing has no limit.
 * A failed read is never reported as "not in cloud".
 */
import { collection, doc, getDocFromServer, getDocsFromServer, query, where } from "firebase/firestore";
import { firestore } from "../data/firebase.js";

export const CLOUD_PRESENCE = Object.freeze({
  IN_CLOUD_AND_LOCAL: "in_cloud_and_local",
  IN_CLOUD_NOT_LOCAL: "in_cloud_not_loaded_locally", // case 2: exists, load / merge missed it
  IN_CLOUD_NOT_IN_LOAD_QUERY: "in_cloud_but_outside_load_query", // case 2: exists, the login query does not return it
  NOT_IN_CLOUD: "not_in_cloud", // case 1: listing lacks it AND get says it does not exist
  NOT_IN_PATIENT_SCOPE: "no_doc_for_this_patient", // case 1 for this account: the patient's full listing lacks it, get denied (missing or another patientId)
  NOT_VISIBLE_TO_THERAPIST: "not_visible_to_therapist", // undecided: the therapist query cannot prove absence — re-check as the patient
  READ_FAILED: "read_failed", // case 3
});

const errorCode = (e) => (e && (e.code || e.message)) || "unknown_error";

/**
 * Pure classification.
 * @param {{ ids: string[], role: "patient"|"therapist",
 *           listing: { ok: true, docs: Object<string, object> } | { ok: false, code },
 *           gets: Object<string, { ok: true, exists: boolean, data?: object } | { ok: false, code }>,
 *           localIds: Set<string>|string[] }} p
 */
export function classifyCloudPresence({ ids, role, listing, gets = {}, localIds = [] }) {
  const local = new Set(localIds);
  return ids.map((id) => {
    const got = gets[id] || { ok: false, code: "not_requested" };
    const listed = listing.ok ? listing.docs[id] || null : null;
    const base = { id, local: local.has(id), listing: listing.ok ? (listed ? "returned" : "not_returned") : `failed:${listing.code}`, get: got.ok ? (got.exists ? "exists" : "does_not_exist") : `failed:${got.code}` };
    if (listed) return { ...base, status: local.has(id) ? CLOUD_PRESENCE.IN_CLOUD_AND_LOCAL : CLOUD_PRESENCE.IN_CLOUD_NOT_LOCAL };
    if (got.ok && got.exists) return { ...base, status: CLOUD_PRESENCE.IN_CLOUD_NOT_IN_LOAD_QUERY };
    if (!listing.ok) return { ...base, status: CLOUD_PRESENCE.READ_FAILED };
    if (got.ok && !got.exists) return { ...base, status: CLOUD_PRESENCE.NOT_IN_CLOUD };
    if (role === "patient" && got.code === "permission-denied") return { ...base, status: CLOUD_PRESENCE.NOT_IN_PATIENT_SCOPE };
    if (role === "therapist") return { ...base, status: CLOUD_PRESENCE.NOT_VISIBLE_TO_THERAPIST };
    return { ...base, status: CLOUD_PRESENCE.READ_FAILED };
  });
}

/**
 * Pure: does the signed-in account own the showcase records that reference
 * these cycle ids? Booleans and counts only (no ids of the account are output).
 *   uidTagMatchesIds — the seed tags every id with the first 8 alphanumerics of the owner's UID
 *   sessions / records — local showcase records of that tag, split by owner
 */
export function checkShowcaseOwnership({ userId, ids = [], sessions = [], records = [] }) {
  const tag = String(userId || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
  const prefix = `showcase_p00_${tag}_`;
  const wanted = new Set(ids);
  const split = (list) => ({
    total: list.length,
    ownedBySignedInUser: list.filter((r) => r.patientId === userId).length,
    ownedByAnotherId: list.filter((r) => r.patientId !== userId).length,
  });
  const showcaseSessions = sessions.filter((s) => String(s.id).startsWith(prefix));
  const linkedRecords = records.filter((r) => wanted.has(r.trackingCycleId));
  return {
    uidTagMatchesIds: !!tag && ids.length > 0 && ids.every((id) => String(id).startsWith(prefix)),
    showcaseSessions: { ...split(showcaseSessions), durationsMs: showcaseSessions.map((s) => (s.result ? s.result.totalDurationMs : null)) },
    recordsReferencingIds: split(linkedRecords),
  };
}

/** Non-sensitive shape of a found cycle doc (ids, dates, links — no free text). */
export function summarizeCycleDoc(data, userId) {
  if (!data) return null;
  return {
    patientIdIsSelf: data.patientId === userId, userIdIsSelf: data.userId === userId,
    hasTherapistStamp: !!data.therapistId, relationId: data.relationId || null,
    cycleStartDateKey: data.cycleStartDateKey || null, plannedReassessmentDateKey: data.plannedReassessmentDateKey || null,
    baselineAssessmentId: data.baselineAssessmentId || null, reassessmentId: data.reassessmentId || null,
    previousCycleId: data.previousCycleId || null, recommendationId: data.recommendationId || null,
    completedTrainingDays: (data.completedTrainingDates || []).length,
  };
}

async function runListing(user, relations) {
  try {
    const col = collection(firestore, "trackingCycles");
    const snaps = user.role === "therapist"
      ? await Promise.all(relations.map((r) => getDocsFromServer(query(col, where("therapistId", "==", user.id), where("patientId", "==", r.patientId), where("relationId", "==", r.id)))))
      : [await getDocsFromServer(query(col, where("patientId", "==", user.id)))];
    const docs = {};
    snaps.forEach((s) => s.docs.forEach((d) => { docs[d.id] = d.data(); }));
    return { ok: true, docs };
  } catch (e) {
    return { ok: false, code: errorCode(e) };
  }
}

/**
 * @param user        signed-in app user ({ id, role })
 * @param ids         trackingCycles doc ids to check
 * @param localIds    ids present in this browser's local trackingCycles
 * @param relations   therapist only: accepted relations (same list the login load uses)
 * @param loadStatus  storageService.getOptionalCloudLoadStatus("trackingCycles") for this login
 */
export async function inspectTrackingCyclesInCloud(user, ids, { localIds = [], relations = [], loadStatus = null, localSessions = [], localRecords = [] } = {}) {
  if (!user || !user.id) return { error: "not_signed_in" };
  const wanted = [...new Set((ids || []).filter((x) => typeof x === "string" && x))];
  if (!wanted.length) return { error: "no_ids" };
  const listing = await runListing(user, relations);
  const gets = {};
  for (const id of wanted) {
    try {
      const snap = await getDocFromServer(doc(firestore, "trackingCycles", id));
      gets[id] = { ok: true, exists: snap.exists(), data: snap.exists() ? snap.data() : null };
    } catch (e) {
      gets[id] = { ok: false, code: errorCode(e) };
    }
  }
  const rows = classifyCloudPresence({ ids: wanted, role: user.role, listing, gets, localIds }).map((row) => ({
    ...row,
    cloudDoc: summarizeCycleDoc((listing.ok && listing.docs[row.id]) || (gets[row.id] && gets[row.id].data), user.id),
  }));
  return {
    checkedAt: new Date().toISOString(),
    role: user.role,
    readSource: "server",
    ownership: checkShowcaseOwnership({ userId: user.id, ids: wanted, sessions: localSessions, records: localRecords }),
    loginLoadOfTrackingCycles: loadStatus,
    listing: listing.ok ? { ok: true, returnedCount: Object.keys(listing.docs).length, returnedIds: Object.keys(listing.docs) } : { ok: false, code: listing.code },
    rows,
  };
}
