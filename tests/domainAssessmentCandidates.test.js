import assert from "node:assert/strict";
import { createDomainCandidateTracker } from "../js/ai/domainAssessmentCandidates.js";
import { readFileSync } from "node:fs";
const pose = flexed => {
  const l = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  Object.assign(l, { 11: { x: .4, y: .3, visibility: 1 }, 12: { x: .6, y: .3, visibility: 1 }, 13: { x: .4, y: .5, visibility: 1 }, 14: { x: .6, y: .5, visibility: 1 }, 15: { x: .4, y: flexed ? .35 : .7, visibility: 1 }, 16: { x: .6, y: .7, visibility: 1 }, 23: { x: .4, y: .65, visibility: 1 }, 24: { x: .6, y: .65, visibility: 1 }, 27: { x: .4, y: .95, visibility: 1 }, 28: { x: .6, y: .95, visibility: 1 } });
  return l;
};
const t = createDomainCandidateTracker("F05", "left");
t.update(pose(false), 0, true); t.update(pose(true), 100, true); t.update(pose(false), 200, true); assert.equal(t.summary().count, 1);
t.update(pose(true), 300, true); t.update(null, 400, true); t.update(pose(false), 500, true); assert.equal(t.summary().count, 1, "lost flexion is not counted on re-entry");
t.update(pose(true), 600, true); t.update(pose(false), 700, false); assert.equal(t.summary().count, 1, "outside timed window produces no curl");
t.resetSegment(); t.update(pose(true), 800, true); t.update(pose(false), 900, true); assert.equal(t.summary().count, 1, "must observe extension before starting a new candidate");
const r = createDomainCandidateTracker("F05", "right"); r.update(pose(false), 0, true); r.update(pose(true), 100, true); r.update(pose(false), 200, true); assert.equal(r.summary().count, 0, "only selected arm counts");
for (const domain of ["F02", "F03", "F04", "F06"]) { const tracker = createDomainCandidateTracker(domain); tracker.update(pose(false), 0, true); tracker.update(null, 100, true); const result = tracker.summary(); assert.equal(result.count, null); assert.ok(!("distanceCm" in result) && !("speed" in result) && !("score" in result)); }
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8"), view = readFileSync(new URL("../js/ui/domainAssessmentView.js", import.meta.url), "utf8");
assert.ok(app.includes("goDomainAssessmentHome('${domain.key}')") && app.indexOf("const renderBeforeDomainAssessments") < app.indexOf("const renderBeforeGuestEntry"));
assert.ok(view.includes('document.addEventListener("visibilitychange"') && view.includes('window.addEventListener("pagehide"'));
assert.ok(!view.includes("trackingCycleService") && !view.includes("createF01GoalRecommendation"), "new assessments never create F01 cycles or prescriptions");
console.log("CV candidates: selected arm, continuity, timed gate, no invented distance/speed; guest guard and lifecycle passed");
