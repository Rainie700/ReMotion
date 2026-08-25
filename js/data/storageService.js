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
  if (["therapistPatientRelations", "schedules", "analysisRecords"].includes(name)) {
    const [asPatient, asTherapist] = await Promise.all([
      getRecordsForField(name, "patientId", user.id),
      getRecordsForField(name, "therapistId", user.id),
    ]);
    return mergeById([asPatient, asTherapist]);
  }

  if (["patientAssessments", "recommendationResults", "functionalAssessmentSessions"].includes(name)) {
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

function persistRecord(name, record) {
  if (!cloudUser || !CLOUD_COLLECTIONS.includes(name) || !record?.id) return;
  setDoc(doc(firestore, name, record.id), record).catch((error) => {
    console.error(`[storageService] failed to sync ${name}/${record.id}`, error);
  });
}

function removeCloudRecord(name, id) {
  if (!cloudUser || !CLOUD_COLLECTIONS.includes(name) || !id) return;
  deleteDoc(doc(firestore, name, id)).catch((error) => {
    console.error(`[storageService] failed to remove ${name}/${id}`, error);
  });
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
