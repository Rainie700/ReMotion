process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * patient00 demo setup vs. the cloud rules (trackingCycles: delete never allowed):
 *  - a conflicting tracking cycle the cloud cannot delete is never cleared —
 *    the seed refuses and writes nothing, the existing cycle stays as it is;
 *  - a failed trackingCycles cloud write is a setup failure, not "local only".
 * No Firestore is reached: there is no cloud user in tests, and the cloud
 * block is passed in explicitly.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const S = await import("../js/dev/patient00Showcase.js");
const { createCollection, storageService } = await import("../js/data/storageService.js");

const P00 = { id: "uid-patient00", email: "patient00@gmail.com", role: "patient" };
const NAMES = ["trackingCycles", "recommendationResults", "functionalAssessmentSessions", "analysisRecords", "schedules", "patientAssessments"];
const cols = Object.fromEntries(NAMES.map((n) => [n, createCollection(n)]));
const snapshot = () => JSON.stringify(NAMES.map((n) => cols[n].list()));
const blockCycles = (name) => name === "trackingCycles";

// no cloud user -> nothing is reported as blocked
assert.equal(storageService.isCloudDeleteBlocked("trackingCycles"), false, "no cloud user, local delete is the only copy");
assert.equal(storageService.isCloudDeleteBlocked("analysisRecords"), false);

// an existing, completed real cycle of the account (kept, option (a))
const realCycle = { id: "real-cycle-0928", userId: P00.id, patientId: P00.id, functionalDomain: "F01", cycleStartDateKey: "2026-09-28", plannedReassessmentDateKey: "2026-10-04", baselineAssessmentId: "real-base", reassessmentId: "real-re", completedTrainingDates: [] };
cols.trackingCycles.create(realCycle);
const before = snapshot();

{
  const r = S.seedPatient00ShowcaseData(P00, { clearConflicts: true, cloudDeleteBlocked: blockCycles });
  assert.equal(r.error, "conflicts_not_removable");
  assert.deepEqual(r.conflicts.map((c) => c.id), ["real-cycle-0928"]);
  assert.equal(snapshot(), before, "refused -> nothing written, nothing removed");
}
{
  const r = await S.setupPatient00Demo(P00, { todayKey: "2026-09-30", cloudDeleteBlocked: blockCycles });
  assert.equal(r.error, "conflicts_not_removable", "one-click setup refuses too");
  assert.equal(snapshot(), before);
  assert.deepEqual(cols.trackingCycles.getById("real-cycle-0928"), realCycle, "existing cycle untouched");
}
{
  // without a clear request the earlier "conflicts" answer is unchanged
  assert.equal(S.seedPatient00ShowcaseData(P00, { cloudDeleteBlocked: blockCycles }).error, "conflicts");
  assert.equal(snapshot(), before);
}

// a failed trackingCycles cloud write is a failure (no longer filtered out of `failed`)
{
  const src = readFileSync(join(root, "js/dev/patient00Showcase.js"), "utf8");
  const setup = src.slice(src.indexOf("export async function setupPatient00Demo("));
  assert.match(setup, /failed: cloud\.failed,/, "every failed cloud write counts");
  assert.ok(!/failed: cloud\.failed\.filter\(\(f\) => f\.name !== "trackingCycles"\)/.test(setup), "trackingCycles failures are not dropped");
  assert.match(setup, /cloudWrites\.failed\.length === 0/, "ok requires no failed write");
  const storage = readFileSync(join(root, "js/data/storageService.js"), "utf8");
  const undeletable = JSON.parse(storage.match(/CLOUD_UNDELETABLE_COLLECTIONS = (\[[^\n]+\]);/)[1]);
  for (const name of ["trackingCycles", "llmWeeklySummaries", "d5TherapistReviews", "dailyTrainingFeedback"]) assert.ok(undeletable.includes(name));
  const rules = readFileSync(join(root, "firestore.rules"), "utf8");
  for (const name of undeletable) {
    const block = rules.slice(rules.indexOf(`match /${name}/`));
    assert.match(block.slice(0, block.indexOf("allow delete") + 40), /allow delete: if false;/, `${name}: the rules still forbid client deletes (keep the list in sync)`);
  }
}

console.log("patient00DemoCloudSafety: all assertions passed");
