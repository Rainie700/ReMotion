// READ-ONLY cloud reads for the patient00 six-week history. Only getDoc / getDocs:
// nothing is written, deleted or deployed. Signs in as patient00 / therapist00 with
// the demo defaults of scripts/seedDemoAccounts.mjs; prints no credentials or uids.
//   node scripts/demo/patient00History6w/readCloud.mjs snapshot   -> private/real_docs.json
//   node scripts/demo/patient00History6w/readCloud.mjs legacy     -> private/legacy_showcase_backup.json
//   node scripts/demo/patient00History6w/readCloud.mjs preflight  -> checks private/manifest.json against the cloud
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, getDocs, getDoc, getDocFromServer, doc, collection, query, where } from "firebase/firestore";

const here = dirname(fileURLToPath(import.meta.url));
const mode = process.argv[2];
const seedText = readFileSync(join(here, "../../seedDemoAccounts.mjs"), "utf8");
const firebaseConfig = Function(`return (${seedText.match(/const firebaseConfig = (\{[\s\S]*?\});/)[1]});`)();
const pick = (n) => { const line = seedText.split(/\r?\n/).find((l) => l.startsWith(`const ${n} = `)); return line && line.match(/"([^"]+)";?\s*$/)[1]; };
const signIn = async (name, email, pass) => { const app = initializeApp(firebaseConfig, name); const cred = await signInWithEmailAndPassword(getAuth(app), email, pass); return { db: getFirestore(app), uid: cred.user.uid }; };
const P = await signIn("p", pick("PATIENT_EMAIL"), pick("PATIENT_PASSWORD"));
const get = async (db, c, id) => { const s = await getDocFromServer(doc(db, c, id)); return s.exists() ? { id: s.id, ...s.data() } : null; };
const listOwn = async (c) => (await getDocs(query(collection(P.db, c), where("patientId", "==", P.uid)))).docs.map((d) => ({ id: d.id, ...d.data() }));
const REAL = { cycle: "trackingCycle_mulh04km_6_505f6x", proposal: "recommendation_mutowu0u_1_3wpbp3" };

if (mode === "snapshot") {
  const out = { checkedAt: new Date().toISOString(), uid: P.uid };
  out.cycle = await get(P.db, "trackingCycles", REAL.cycle);
  out.baseline = await get(P.db, "functionalAssessmentSessions", out.cycle.baselineAssessmentId);
  out.reassessment = await get(P.db, "functionalAssessmentSessions", out.cycle.reassessmentId);
  out.phaseC = await get(P.db, "recommendationResults", out.cycle.recommendationId);
  out.proposal = await get(P.db, "recommendationResults", REAL.proposal);
  out.summary = await get(P.db, "llmWeeklySummaries", REAL.cycle);
  out.relations = await listOwn("therapistPatientRelations");
  writeFileSync(join(here, "private/real_docs.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log("snapshot written (private/real_docs.json)");
} else if (mode === "legacy") {
  // the earlier 2-week showcase batch: ids start with showcase_p00_<uid8>_ but NOT the h6 batch
  const tag = `showcase_p00_${P.uid.replace(/[^A-Za-z0-9]/g, "").slice(0, 8)}_`;
  const isLegacy = (id) => id.startsWith(tag) && !id.startsWith(`${tag}h6_`);
  const out = { checkedAt: new Date().toISOString(), tag, collections: {}, references: [] };
  for (const c of ["analysisRecords", "functionalAssessmentSessions", "recommendationResults", "schedules", "patientAssessments", "trackingCycles"]) {
    out.collections[c] = (await listOwn(c)).filter((d) => isLegacy(d.id));
  }
  const all = Object.entries(out.collections).flatMap(([c, docs]) => docs.map((d) => [c, d]));
  const exists = new Set(all.map(([, d]) => d.id));
  const refFields = ["trackingCycleId", "recommendationId", "scheduleId", "sourceAssessmentId", "assessmentId", "baselineAssessmentId", "analysisRecordId"];
  const refsOf = (d) => {
    const found = [];
    const walk = (x, path) => {
      if (!x || typeof x !== "object") return;
      for (const [k, v] of Object.entries(x)) {
        if (typeof v === "string" && (refFields.includes(k) || /Id$/.test(k)) && v.startsWith("showcase_")) found.push({ field: `${path}${k}`, target: v });
        else if (typeof v === "object") walk(v, `${path}${k}.`);
      }
    };
    walk(d, "");
    return found;
  };
  for (const [c, d] of all) for (const r of refsOf(d)) out.references.push({ from: `${c}/${d.id}`, field: r.field, to: r.target, targetExists: exists.has(r.target) });
  writeFileSync(join(here, "private/legacy_showcase_backup.json"), `${JSON.stringify(out, null, 2)}\n`);
  console.log(JSON.stringify({ counts: Object.fromEntries(Object.entries(out.collections).map(([c, v]) => [c, v.length])), references: out.references.length, danglingTargets: [...new Set(out.references.filter((r) => !r.targetExists).map((r) => r.to.replace(tag, "<tag>")))] }, null, 1));
} else if (mode === "preflight") {
  // Stops a write before it starts: every check must pass. Read-only.
  const { docHash } = await import("./hash.mjs");
  const manifest = JSON.parse(readFileSync(join(here, "private/manifest.json"), "utf8"));
  const checks = [];
  const add = (name, ok, detail = "") => checks.push({ name, ok, detail });
  for (const [key, hash] of Object.entries(manifest.generatedFrom.realHashes)) {
    const [c, id] = key.split("/");
    const d = await get(P.db, c, id).catch((e) => ({ error: e.code }));
    add(`real ${c} unchanged`, !!d && !d.error && docHash && docHash(d) === hash, d && d.error ? d.error : "");
  }
  const cycles = await listOwn("trackingCycles");
  add("no active cycle", !cycles.some((c) => !c.reassessmentId));
  add("no cycle continues the real W5 yet", !cycles.some((c) => c.previousCycleId === REAL.cycle));
  const distinct = [...new Map(manifest.writes.map((w) => [`${w.collection}/${w.id}`, w])).values()];
  let present = 0;
  for (const w of distinct) { const s = await getDoc(doc(P.db, w.collection, w.id)).catch(() => null); if (s && s.exists()) present += 1; }
  add("no batch doc exists yet (patient-readable collections)", present === 0, `${present} present`);
  console.log(JSON.stringify(checks, null, 1));
  console.log(checks.every((c) => c.ok) ? "PREFLIGHT OK" : "PREFLIGHT FAILED — do not write");
} else {
  console.log("usage: readCloud.mjs snapshot | legacy | preflight");
}
process.exit(0);
