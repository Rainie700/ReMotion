// Generates the patient00 six-week write manifest from the read-only snapshot of
// patient00's real records. Local only: no cloud, no Gemini.
//   node scripts/demo/patient00History6w/generate.mjs
// in:  private/real_docs.json        (readCloud.mjs snapshot — account data, git-ignored)
// out: private/manifest.json         (every doc to write, per phase, + rollback list)
//      private/manifest.summary.txt  (human-readable timetable)
process.env.TZ = "Asia/Taipei";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const real = JSON.parse(readFileSync(join(here, "private/real_docs.json"), "utf8"));
const { buildPatient00History6w, rollbackPlan, docHash, PHASES, DEMO_BATCH } = await import("./buildHistory.mjs");
const { functionalProgressService } = await import("../../../js/data/functionalProgressService.js");
const { todayPlanService } = await import("../../../js/data/todayPlanAggregator.js");

const built = await buildPatient00History6w(real);
const manifest = {
  batch: DEMO_BATCH,
  generatedFrom: { realSnapshotCheckedAt: real.checkedAt || null, realHashes: built.realHashes },
  phases: PHASES,
  tag: built.tag,
  writes: built.writes,
  realUpdates: built.realUpdates,
  rollback: rollbackPlan(built),
};
manifest.manifestHash = docHash({ writes: manifest.writes, realUpdates: manifest.realUpdates });
writeFileSync(join(here, "private/manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const tl = functionalProgressService.getTrackingTimeline(real.uid, "2026-10-14");
const plan = todayPlanService.getTodayPlan(real.uid, { todayKey: "2026-10-14" });
const sec = (ms) => (ms == null ? "—" : (ms / 1000).toFixed(1));
const lines = [
  `batch ${DEMO_BATCH}  manifestHash ${manifest.manifestHash}`,
  `docs to set: ${manifest.writes.length} (${new Set(manifest.writes.map((w) => `${w.collection}/${w.id}`)).size} distinct)  real-doc field updates: ${manifest.realUpdates.length}`,
  ...PHASES.map((p) => `  ${p.phase} ${p.actor}: ${manifest.writes.filter((w) => w.phase === p.phase).length} set${manifest.realUpdates.filter((u) => u.phase === p.phase).length ? ` + ${manifest.realUpdates.filter((u) => u.phase === p.phase).length} update (real proposal link)` : ""} — ${p.note}`),
  "",
  "week  dates            5xSTS        days  source",
  ...tl.weeks.map((w) => `W${w.weekNumber}    ${w.startDateKey}→${w.endDateKey}  ${sec(w.baselineMs)}→${sec(w.reassessmentMs)}  ${w.completedDays}/6   ${w.cycleId.startsWith(built.tag) ? "demo synthetic" : "REAL"}`),
  `trend: ${tl.trend.nodes.map((n) => (n.pending ? "?" : sec(n.ms))).join(" → ")}`,
  `today plan 2026-10-14: ${((plan.remotion && plan.remotion.primary && plan.remotion.primary.items) || []).map((i) => i.exerciseId).join(", ")}`,
  "",
  ...built.weeks.map((w) => `W${w.week} summary (${w.summary.source}, model ${w.summary.model}, validation ${w.summary.validation.passed ? "passed" : `FAILED ${w.summary.validation.errorCodes.join(",")}`}): ${w.summary.nextPlanSummary}`),
  "",
  `rollback: patient deletes ${manifest.rollback.patientDeletes.length}, admin deletes ${manifest.rollback.adminDeletes.length}, real fields to restore ${manifest.rollback.restoreRealFields.map((r) => r.deleteFields.join("+")).join("; ")}`,
];
writeFileSync(join(here, "private/manifest.summary.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
