// Isolated preview of the six-week manifest: builds the browser storage of the local demo
// (dev server + ?localDemo=d5, "remotion_localdemo_" keys, no Firebase) holding EXACTLY what the
// cloud would hold after the write — the real records of the snapshot + every manifest write +
// the real-proposal field update — with the two account uids replaced by the local demo ids.
//   node scripts/demo/patient00History6w/buildLocalPreview.mjs  -> private/local_preview_storage.json
// Not included (not in the snapshot): patient00's other real records (old 5xSTS runs, schedules,
// training records outside the cycles, the 2-week legacy batch).
process.env.TZ = "Asia/Taipei";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const { DEMO_PATIENT, DEMO_THERAPIST } = await import("../../../js/dev/localD5Demo.js");
const { assessmentService } = await import("../../../js/data/assessmentService.js");

const real = JSON.parse(readFileSync(join(here, "private/real_docs.json"), "utf8"));
const manifest = JSON.parse(readFileSync(join(here, "private/manifest.json"), "utf8"));
const P = real.uid;
const T = real.relations.find((r) => r.status === "accepted").therapistId;
const remap = (v) => JSON.parse(JSON.stringify(v).split(P).join(DEMO_PATIENT.id).split(T).join(DEMO_THERAPIST.id));

const store = {}; // collection -> Map(id -> doc)
const put = (c, d) => { (store[c] = store[c] || new Map()).set(d.id, d); };
for (const r of real.relations) put("therapistPatientRelations", r);
for (const [c, d] of [["trackingCycles", real.cycle], ["functionalAssessmentSessions", real.baseline], ["functionalAssessmentSessions", real.reassessment], ["recommendationResults", real.phaseC], ["recommendationResults", real.proposal], ["llmWeeklySummaries", real.summary]]) if (d) put(c, d);
for (const w of manifest.writes) put(w.collection, w.doc); // later versions (P2 accepted) overwrite earlier (P1 pre-review)
for (const u of manifest.realUpdates) {
  const d = JSON.parse(JSON.stringify(store[u.collection].get(u.id)));
  for (const [path, value] of Object.entries(u.fields)) {
    const keys = path.split(".");
    let o = d;
    keys.slice(0, -1).forEach((k) => { o = o[k]; });
    o[keys[keys.length - 1]] = value;
  }
  put(u.collection, d);
}
// a needs assessment so the demo patient lands on Home (made by the app's own service)
assessmentService.createAssessment({ patientId: P, createdBy: P, bodyParts: ["下肢功能"], goals: ["肌力", "平衡"], abilityLevel: "beginner", preferredSessionMinutes: 15, source: "direct" });
const needs = JSON.parse(mem.get("remotion_collection_patientAssessments") || "[]");

const out = {};
for (const [c, m] of Object.entries(store)) out[`remotion_localdemo_collection_${c}`] = JSON.stringify(remap([...m.values()]));
out.remotion_localdemo_collection_patientAssessments = JSON.stringify(remap(needs));
out.remotion_localdemo_collection_users = JSON.stringify([{ ...DEMO_PATIENT }, { ...DEMO_THERAPIST }]);
writeFileSync(join(here, "private/local_preview_storage.json"), JSON.stringify(out));
console.log(Object.fromEntries(Object.entries(out).map(([k, v]) => [k.replace("remotion_localdemo_collection_", ""), JSON.parse(v).length])));
