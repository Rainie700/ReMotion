import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { firestore, isEmulatorMode } from "./firebase.js";

// Local isolated demo (dev server only, URL ?localDemo=d5): a separate storage prefix, so a
// demo never reads or overwrites the real local cache. Never active in a production build.
const LOCAL_DEMO = (() => {
  try {
    return !!(import.meta.env && import.meta.env.DEV) && typeof location !== "undefined" && new URLSearchParams(location.search).get("localDemo") === "d5";
  } catch (e) {
    return false;
  }
})();
// Local browser verification: the emulator mode (js/data/firebase.js) keeps its own
// local cache, so emulator test data never mixes with a production or demo cache.
const NAMESPACE = LOCAL_DEMO ? "remotion_localdemo" : isEmulatorMode() ? "remotion_emulator" : "remotion";
/** True only in the isolated local demo (dev server + ?localDemo=d5). */
export const isLocalDemoStorage = () => LOCAL_DEMO;
/** Removes every key of the isolated demo (and nothing else). Refuses outside the demo. */
export function clearLocalDemoStorage() {
  if (!LOCAL_DEMO) return false;
  Object.keys(localStorage).filter((k) => k.startsWith("remotion_localdemo_")).forEach((k) => localStorage.removeItem(k));
  return true;
}
let cloudUser = null;

// Actual user-created data. Seed/demo data and gamification/XP are excluded.
const CLOUD_COLLECTIONS = [
  "therapistPatientRelations",
  "schedules",
  "analysisRecords",
  "patientAssessments",
  "recommendationResults",
  "functionalAssessmentSessions",
];

// Phase D1 — collections added after the deployed Firestore rules. They are
// written through like the others, but loaded defensively: if the cloud read
// fails (e.g. rules not yet deployed -> permission denied) the local copy is
// kept and login is never blocked; if it succeeds, cloud and local records
// are merged by id (cloud wins) instead of the local list being replaced.
const OPTIONAL_CLOUD_COLLECTIONS = ["trackingCycles", "llmWeeklySummaries", "d5TherapistReviews", "f01InitialReviews", "dailyTrainingFeedback", "selfReportedTraining", "f01FixedPracticeRecords", "domainAssessmentRecords"];
// Outcome of the last cloud load of each optional collection for the signed-in
// user ("loaded" | "failed"), so a UI can tell "cloud copy not loaded" apart
// from "no records" instead of showing a failed load as an empty list.
const optionalCloudLoadStatus = new Map();
// firestore.rules: `allow delete: if false` — a local remove() of these never reaches the cloud,
// and the cloud copy is merged back on the next login.
const CLOUD_UNDELETABLE_COLLECTIONS = ["trackingCycles", "llmWeeklySummaries", "d5TherapistReviews", "f01InitialReviews", "dailyTrainingFeedback", "selfReportedTraining", "f01FixedPracticeRecords", "domainAssessmentRecords"];
const isSyncedCollection = (name) => CLOUD_COLLECTIONS.includes(name) || OPTIONAL_CLOUD_COLLECTIONS.includes(name);

function readRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (err) {
    console.warn(`[storageService] failed to read "${key}"`, err);
    return fallback;
  }
}

function writeRaw(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function collectionKey(name) {
  return `${NAMESPACE}_collection_${name}`;
}

function mergeById(lists) {
  const records = new Map();
  lists.flat().forEach((record) => records.set(record.id, record));
  return [...records.values()];
}

async function getRecordsForField(name, field, value) {
  const snapshot = await getDocs(query(collection(firestore, name), where(field, "==", value)));
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

async function loadCloudCollection(name, user) {
  if (OPTIONAL_CLOUD_COLLECTIONS.includes(name)) {
    if (user.role !== "therapist") return getRecordsForField(name, "patientId", user.id);
    // G01 坐站固定練習 records are owner-only (firestore.rules): a therapist account loads none.
    if (name === "f01FixedPracticeRecords") return [];
    const relations = readRaw(collectionKey("therapistPatientRelations"), []).filter((r) => r.therapistId === user.id && r.status === "accepted");
    const records = await Promise.all(relations.map(async (relation) => {
      const snapshot = await getDocs(query(collection(firestore, name),
        where("therapistId", "==", user.id),
        where("patientId", "==", relation.patientId),
        where("relationId", "==", relation.id)));
      return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    }));
    return mergeById(records);
  }
  if (["therapistPatientRelations", "schedules", "analysisRecords"].includes(name)) {
    const [asPatient, asTherapist] = await Promise.all([
      getRecordsForField(name, "patientId", user.id),
      getRecordsForField(name, "therapistId", user.id),
    ]);
    return mergeById([asPatient, asTherapist]);
  }

  // 5xSTS batch A — a therapist reads a patient's assessment sessions only through a
  // CURRENTLY ACCEPTED relation, and only sessions stamped with that relation
  // (firestore.rules re-checks the relation document on every read; the stamp alone
  // grants nothing). Same query shape as the optional collections above.
  if (name === "functionalAssessmentSessions" && user.role === "therapist") {
    const ownRecords = await getRecordsForField(name, "patientId", user.id);
    const relations = readRaw(collectionKey("therapistPatientRelations"), []).filter((r) => r.therapistId === user.id && r.status === "accepted");
    const patientRecords = await Promise.all(relations.map(async (relation) => {
      const snapshot = await getDocs(query(collection(firestore, name),
        where("patientId", "==", relation.patientId),
        where("therapistId", "==", user.id),
        where("relationId", "==", relation.id)));
      return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    }));
    return mergeById([ownRecords, ...patientRecords]);
  }

  if (["patientAssessments", "recommendationResults", "functionalAssessmentSessions", "trackingCycles"].includes(name)) {
    const ownRecords = await getRecordsForField(name, "patientId", user.id);
    if (user.role !== "therapist") return ownRecords;
    const relations = readRaw(collectionKey("therapistPatientRelations"), []);
    const patientIds = relations
      .filter((relation) => relation.therapistId === user.id)
      .map((relation) => relation.patientId);
    const patientRecords = await Promise.all(patientIds.map((patientId) => getRecordsForField(name, "patientId", patientId)));
    return mergeById([ownRecords, ...patientRecords]);
  }

  return [];
}

// Cloud writes stay fire-and-forget for the app; they are only tracked so a
// caller that must not reload early (the dev demo setup) can wait for them.
const pendingCloudWrites = new Set();
let settledCloudWrites = [];
// The LAST outcome per document ("name/id"), kept apart from the drained list above: waitForCloudWrites() hands the
// settled list to whichever caller asks first, so a per-record status must not depend on who drained it.
const lastCloudWriteOutcome = new Map();
const noteSettled = (entry) => {
  settledCloudWrites.push(entry); if (settledCloudWrites.length > 2000) settledCloudWrites.shift();
  if (entry.name && entry.id) lastCloudWriteOutcome.set(`${entry.name}/${entry.id}`, { ok: entry.ok, code: entry.code || null, op: entry.op, at: Date.now() });
};
// Writes of one document still on their way ("name/id" -> count), for a per-record 「保存中」 state.
const pendingCloudWriteIds = new Map();
function trackCloudWrite(promise, meta) {
  const key = meta && meta.name && meta.id ? `${meta.name}/${meta.id}` : null;
  if (key) pendingCloudWriteIds.set(key, (pendingCloudWriteIds.get(key) || 0) + 1);
  const tracked = promise.then(
    () => { noteSettled({ ...meta, ok: true }); },
    (error) => { noteSettled({ ...meta, ok: false, code: error && error.code }); throw error; },
  ).finally(() => {
    pendingCloudWrites.delete(tracked);
    if (key) { const n = (pendingCloudWriteIds.get(key) || 1) - 1; if (n > 0) pendingCloudWriteIds.set(key, n); else pendingCloudWriteIds.delete(key); }
  });
  pendingCloudWrites.add(tracked);
  return tracked;
}

/** The patient's current accepted relation as a { therapistId, relationId } stamp ("" when none). */
function currentRelationStamp(patientId) {
  const relation = readRaw(collectionKey("therapistPatientRelations"), []).find((r) => r.patientId === patientId && r.status === "accepted");
  return { therapistId: relation ? relation.therapistId : "", relationId: relation ? relation.id : "" };
}

// Records whose cloud copy carries the patient's current relation stamp, so a linked
// therapist's read can be checked by firestore.rules (which re-reads the relation).
// 5xSTS batch A added functionalAssessmentSessions; only the stamp fields change —
// the rest of the record (incl. a stored measurement `result`) is written as it is.
const RELATION_STAMPED_COLLECTIONS = ["trackingCycles", "functionalAssessmentSessions", "domainAssessmentRecords"];

/** Plain objects without their undefined fields (deep); arrays mapped; anything else (Firestore sentinels, Dates) as is. */
export function withoutUndefined(value) {
  if (Array.isArray(value)) return value.map(withoutUndefined);
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const out = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = withoutUndefined(v);
    return out;
  }
  return value;
}

function persistRecord(name, record) {
  if (RELATION_STAMPED_COLLECTIONS.includes(name) && cloudUser && record.patientId === cloudUser.id) {
    record = { ...record, ...currentRelationStamp(cloudUser.id) };
  }
  if (!cloudUser || !isSyncedCollection(name) || !record?.id) return;
  // UX round 5/5 — the cloud copy matches the local (JSON) copy: fields set to undefined are left out instead of making
  // setDoc throw (several detectors store summary: { ...s, repRecords: undefined }). A synchronous throw is a failed write.
  let write;
  try { write = setDoc(doc(firestore, name, record.id), withoutUndefined(record)); } catch (error) { write = Promise.reject(error); }
  trackCloudWrite(write, { op: "set", name, id: record.id }).catch((error) => {
    console.error(`[storageService] failed to sync ${name}/${record.id}`, error);
  });
}

function removeCloudRecord(name, id) {
  if (!cloudUser || !isSyncedCollection(name) || !id) return;
  trackCloudWrite(deleteDoc(doc(firestore, name, id)), { op: "delete", name, id }).catch((error) => {
    console.error(`[storageService] failed to remove ${name}/${id}`, error);
  });
}

/** Resolves once every cloud write issued so far has settled; returns their outcomes since the last call. */
export async function waitForCloudWrites() {
  while (pendingCloudWrites.size) await Promise.allSettled([...pendingCloudWrites]);
  const results = settledCloudWrites;
  settledCloudWrites = [];
  return { total: results.length, failed: results.filter((r) => !r.ok) };
}

export const storageService = {
  getItem(key, fallback = null) {
    return readRaw(`${NAMESPACE}_${key}`, fallback);
  },
  setItem(key, value) {
    writeRaw(`${NAMESPACE}_${key}`, value);
  },
  removeItem(key) {
    localStorage.removeItem(`${NAMESPACE}_${key}`);
  },
  async hydrateCloudForUser(user) {
    cloudUser = user;
    // "loading" from the very start (not cleared): while the core collections load, a reader must never mistake
    // "not loaded yet" for "no cloud" (e.g. Home showing 「沒有安排」 before the plans arrive).
    optionalCloudLoadStatus.clear();
    for (const name of OPTIONAL_CLOUD_COLLECTIONS) optionalCloudLoadStatus.set(name, "loading");
    const userSnapshot = await getDocs(collection(firestore, "publicUsers"));
    writeRaw(collectionKey("users"), userSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));

    // Relation records must be available before loading linked patients' data.
    for (const name of CLOUD_COLLECTIONS) {
      writeRaw(collectionKey(name), await loadCloudCollection(name, user));
    }
    // 5xSTS batch A — re-stamp the patient's OWN assessment sessions whose cloud copy
    // does not carry the current accepted relation (older sessions, or after a change of
    // therapist). Only the stamp differs; result / conditionReports are written back as
    // loaded, which firestore.rules requires to stay unchanged.
    if (user.role === "patient") {
      const stamp = currentRelationStamp(user.id);
      const sessions = readRaw(collectionKey("functionalAssessmentSessions"), []);
      for (const s of sessions.filter((x) => x.patientId === user.id)) {
        if ((s.therapistId || "") !== stamp.therapistId || (s.relationId || "") !== stamp.relationId) persistRecord("functionalAssessmentSessions", s);
      }
      await waitForCloudWrites();
    }
    for (const name of OPTIONAL_CLOUD_COLLECTIONS) optionalCloudLoadStatus.set(name, "loading");
    for (const name of OPTIONAL_CLOUD_COLLECTIONS) {
      try {
        const cloud = await loadCloudCollection(name, user);
        const local = readRaw(collectionKey(name), []);
        writeRaw(collectionKey(name), mergeById([local, cloud]));
        if (name === "trackingCycles" && user.role === "patient") {
          for (const cycle of local.filter((c) => c.patientId === user.id && c.userId === user.id)) {
            persistRecord(name, cloud.find((c) => c.id === cycle.id) || cycle);
          }
          await waitForCloudWrites();
        }
        optionalCloudLoadStatus.set(name, "loaded");
      } catch (error) {
        optionalCloudLoadStatus.set(name, "failed");
        console.warn(`[storageService] optional collection "${name}" not loaded from cloud; keeping the local copy`, error);
      }
    }
  },
  clearCloudUser() {
    cloudUser = null;
    optionalCloudLoadStatus.clear();
  },
  /**
   * "loading" | "loaded" | "failed" for an optional cloud collection of the current login; null when no cloud
   * load ran (local / dev) AND during the first phase of hydrateCloudForUser (required collections), before
   * the optional ones are marked "loading". "loaded" is set before the app's session is (setSession).
   */
  /** true when writes go to the cloud for a signed-in user; false = they stay on this device only (no write is tried). */
  isCloudSyncActive() {
    return !!cloudUser;
  },
  /** { ok, code, op, at } of the last cloud write of one document on this device, or null if none was tried. */
  getLastCloudWriteOutcome(name, id) {
    return lastCloudWriteOutcome.get(`${name}/${id}`) || null;
  },
  /** True while a cloud write of this document (started on this device) has not settled yet. */
  isCloudWritePending(name, id) {
    return pendingCloudWriteIds.has(`${name}/${id}`);
  },
  getOptionalCloudLoadStatus(name) {
    return optionalCloudLoadStatus.get(name) || null;
  },
  /** True while signed in to the cloud for a collection whose records the rules never let the client delete. */
  isCloudDeleteBlocked(name) {
    return !!cloudUser && CLOUD_UNDELETABLE_COLLECTIONS.includes(name);
  },
};

export function createCollection(name, seedFn) {
  const key = `collection_${name}`;
  function readAll() {
    const existing = storageService.getItem(key, null);
    if (existing === null) {
      const seeded = seedFn ? seedFn() : [];
      storageService.setItem(key, seeded);
      return seeded;
    }
    return existing;
  }
  function writeAll(list) {
    storageService.setItem(key, list);
  }
  return {
    list: () => readAll(),
    getById: (id) => readAll().find((item) => item.id === id) || null,
    find: (predicate) => readAll().find(predicate) || null,
    query: (predicate) => readAll().filter(predicate),
    create(record) {
      const all = readAll();
      all.push(record);
      writeAll(all);
      persistRecord(name, record);
      return record;
    },
    update(id, patch) {
      const all = readAll();
      const idx = all.findIndex((item) => item.id === id);
      if (idx === -1) return null;
      all[idx] = { ...all[idx], ...patch };
      writeAll(all);
      persistRecord(name, all[idx]);
      return all[idx];
    },
    remove(id) {
      writeAll(readAll().filter((item) => item.id !== id));
      removeCloudRecord(name, id);
    },
    replaceAll(list) { writeAll(list); },
    reset() { storageService.removeItem(key); },
  };
}
