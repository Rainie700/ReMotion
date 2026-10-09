import { collection, deleteDoc, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { firestore } from "./firebase.js";

const NAMESPACE = "remotion";
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
const OPTIONAL_CLOUD_COLLECTIONS = ["trackingCycles", "llmWeeklySummaries"];
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
const noteSettled = (entry) => { settledCloudWrites.push(entry); if (settledCloudWrites.length > 2000) settledCloudWrites.shift(); };
function trackCloudWrite(promise, meta) {
  const tracked = promise.then(
    () => { noteSettled({ ...meta, ok: true }); },
    (error) => { noteSettled({ ...meta, ok: false, code: error && error.code }); throw error; },
  ).finally(() => pendingCloudWrites.delete(tracked));
  pendingCloudWrites.add(tracked);
  return tracked;
}

function persistRecord(name, record) {
  if (name === "trackingCycles" && cloudUser && record.patientId === cloudUser.id) {
    const relation = readRaw(collectionKey("therapistPatientRelations"), []).find((r) => r.patientId === cloudUser.id && r.status === "accepted");
    record = { ...record, therapistId: relation ? relation.therapistId : "", relationId: relation ? relation.id : "" };
  }
  if (!cloudUser || !isSyncedCollection(name) || !record?.id) return;
  trackCloudWrite(setDoc(doc(firestore, name, record.id), record), { op: "set", name, id: record.id }).catch((error) => {
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
    const userSnapshot = await getDocs(collection(firestore, "publicUsers"));
    writeRaw(collectionKey("users"), userSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })));

    // Relation records must be available before loading linked patients' data.
    for (const name of CLOUD_COLLECTIONS) {
      writeRaw(collectionKey(name), await loadCloudCollection(name, user));
    }
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
      } catch (error) {
        console.warn(`[storageService] optional collection "${name}" not loaded from cloud; keeping the local copy`, error);
      }
    }
  },
  clearCloudUser() {
    cloudUser = null;
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
