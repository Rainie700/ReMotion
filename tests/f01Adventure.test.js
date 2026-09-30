process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Cross-Module Integration I-3 — 復健冒險 = the current F01 tracking cycle's
 * journey (8 milestones from persisted F01 data), decoupled from achievements,
 * never awarding XP, never persisted.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const A = await import("../js/data/f01AdventureProgress.js");
const { trackingCycleService, REASSESSMENT_ROLE, NEXT_CYCLE_BASELINE_ROLE } = await import("../js/data/trackingCycleService.js");
const { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } = await import("../js/data/functionalAssessmentService.js");
const { recommendationService } = await import("../js/data/recommendationService.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { generateF01GoalRecommendation } = await import("../js/data/f01GoalRecommendation.js");
const { gamificationEngine: G } = await import("../js/data/gamificationEngine.js");
const { createCollection } = await import("../js/data/storageService.js");

const catalog = exerciseService.listNormalized();
const cycles = createCollection("trackingCycles");
const D1 = "2026-09-28", D2 = "2026-09-29", D7 = "2026-10-04";
const fnBody = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
function fiveXSts(user, { status = "completed", ms = 9000, at = [2026, 8, 28, 9, 0], role = null } = {}) {
  const s = functionalAssessmentService.create({ patientId: user, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
  const done = status === "completed";
  functionalAssessmentService.completeSession(s.id, { result: { status, repCount: done ? 5 : 2, completedReps: done ? 5 : 2, totalDurationMs: done ? ms : null, measuredAt: new Date(...at).toISOString(), ...(role || {}) } });
  return functionalAssessmentService.getById(s.id);
}
function startCycle(user) {
  const baseline = fiveXSts(user);
  const r = generateF01GoalRecommendation({ assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" }, selectedGoalId: "G05", availableMinutes: 15, catalog });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: user, result: r, createdBy: user }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: user, baselineSession: baseline, recommendation: rec }).cycle;
  return { baseline, rec, cycle };
}
const reassess = (user, cycle, status = "completed") => {
  const re = fiveXSts(user, { status, ms: 8200, at: [2026, 9, 4, 20, 0], role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: cycle.baselineAssessmentId } });
  trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: user, reassessment: re, todayDateKey: D7 });
  return re;
};
const adv = (user, today) => A.f01AdventureService.getAdventure(user, today);
const states = (a) => a.stages.map((s) => s.state);

// 23 + 33a. No cycle -> 尚未開始旅程, even with every achievement unlocked
{
  const u = "no-cycle";
  for (let d = 0; d < 60; d += 1) {
    const at = new Date(); at.setDate(at.getDate() - (d % 8)); at.setHours(10);
    analysisService.create({ id: `nc${d}`, patientId: u, exerciseId: `F01-0${(d % 5) + 1}`, source: "self_practice", totalReps: 10, targetReps: 10, score: 90, completedAt: at.toISOString(), createdAt: at.toISOString(), summary: { totalReps: 10, targetReps: 10, qualityValidReps: 10 } });
  }
  assert.ok(G.getGamificationSummary(u).unlockedCount >= 10, "plenty of achievements");
  const a = adv(u, D2);
  assert.equal(a.started, false);
  assert.equal(a.chapterLabel, "尚未開始旅程");
  assert.equal(a.completedCount, 0);
  assert.equal(a.currentStage.n, 1);
  assert.equal(a.currentStage.state, "current");
  assert.deepEqual(a.cta, { label: "開始功能評估", action: "goFunctionalDomainHome()" });
  assert.equal(a.detail, "完成第一次功能評估，開始你的復健旅程。");
}

// 24. Stages 1-6 one by one (+ 25/26 isolation)
const u = "journey";
const { cycle, rec } = startCycle(u);
{
  let a = adv(u, D2);
  assert.deepEqual([a.chapterLabel, a.completedCount, a.currentStage.n], ["第 1 週旅程", 2, 3], "baseline + plan -> stage 3 current");
  assert.equal(a.cta.action, "goSchedule()", "I-4: stage 3 CTA opens the Training Tab");
  // self practice and therapist sessions never move the journey
  for (let i = 0; i < 10; i += 1) {
    const at = new Date(2026, 8, 28 + (i % 6), 10).toISOString();
    analysisService.create({ id: `iso-s${i}`, patientId: u, exerciseId: rec.items[0].exerciseId, source: "self_practice", totalReps: 10, targetReps: 10, completedAt: at, createdAt: at });
    analysisService.create({ id: `iso-t${i}`, patientId: u, exerciseId: rec.items[0].exerciseId, source: "assigned", scheduleId: "sch", totalReps: 10, targetReps: 10, completedAt: at, createdAt: at });
  }
  a = adv(u, D2);
  assert.equal(a.completedCount, 2, "20 self / therapist trainings: stage 3 still open (only D3 completedTrainingDates count)");

  cycles.update(cycle.id, { completedTrainingDates: ["2026-09-28"] });
  a = adv(u, D2);
  assert.deepEqual([a.completedCount, a.currentStage.n, a.detail], [3, 4, "本週已完成 1 / 3 個訓練日。"], "stage 3 = 1 real training day");
  assert.deepEqual(a.progress, { current: 1, target: 3 });
  cycles.update(cycle.id, { completedTrainingDates: ["2026-09-28", "2026-09-28", "2026-09-30", "bad"] });
  assert.equal(adv(u, D2).currentStage.n, 4, "unique valid dates only (2)");
  cycles.update(cycle.id, { completedTrainingDates: ["2026-09-28", "2026-09-29", "2026-09-30"] });
  a = adv(u, "2026-09-30");
  assert.deepEqual([a.completedCount, a.currentStage.n], [4, 5], "stage 4 = 3 days; stage 5 waits for Day 7");
  assert.ok(a.detail.includes("10/04"));
  a = adv(u, D7);
  assert.deepEqual([a.completedCount, a.currentStage.n], [5, 6], "Day 7 (D1 ready_for_reassessment) -> stage 5 done");
  assert.equal(a.cta.action, `goTrackingReassessment('${cycle.id}')`);
  assert.ok(appJs.includes("f01AdventureService.getAdventure(getCurrentPatientId(), getTrackingTodayKey())"), "same D1 view rule as the home card");
  assert.ok(readFileSync(join(root, "js/data/f01AdventureProgress.js"), "utf8").includes("getTrackingCycleViewState(cycle, todayKey)"), "stage 5 reuses D1's getTrackingCycleViewState");
}

// 27. Invalid reassessment never completes stage 6
{
  const u2 = "invalid-re";
  const { cycle: c2 } = startCycle(u2);
  const bad = fiveXSts(u2, { status: "invalid", role: { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: c2.id } });
  cycles.update(c2.id, { reassessmentId: bad.id });
  const a = adv(u2, D7);
  assert.equal(a.stages[5].state, "current", "stage 6 open with an invalid reassessment");
  assert.ok(a.stages.slice(6).every((s) => s.state === "locked"));
}

// 24 (6-7), 29. Reassessment -> D5 professional review: 7/8, waiting (not failed)
{
  reassess(u, cycle);
  let a = adv(u, "2026-10-05");
  assert.deepEqual([a.completedCount, a.currentStage.n], [6, 7]);
  assert.equal(a.cta.action, `goD5StatusCheck('${cycle.id}')`);
  const p = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: { hasNewOrWorseningDiscomfort: true, discomfortNote: "", currentLimitations: [] }, catalog }).proposal;
  assert.equal(p.d5.confirmationMode, "professional_review_required");
  a = adv(u, "2026-10-05");
  assert.equal(a.completedCount, 7, "stage 7: the next-stage decision exists (any decision)");
  assert.deepEqual([a.currentStage.n, a.currentStage.state, a.waitingReason], [8, "waiting", "professional_review"]);
  assert.equal(a.detail, "下一週訓練目前等待進一步確認。");
  assert.ok(!/失敗|錯誤|卡關/.test(JSON.stringify(a)));
  // no_auto / normal draft also only wait
  const p2 = trackingCycleService.evaluateD5Proposal({ cycleId: cycle.id, userId: u, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] }, catalog }).proposal;
  a = adv(u, "2026-10-05");
  assert.equal(a.completedCount, 7);
  assert.equal(a.currentStage.state, "waiting");
  assert.ok(["confirmation", "no_auto_decision"].includes(a.waitingReason));
  assert.equal(p2.id, p.id);
}

// 28. A proposal of another cycle / user never completes stage 7
{
  const inputs = { cycle, baseline: functionalAssessmentService.getById(cycle.baselineAssessmentId), recommendation: rec, reassessment: null, nextCycle: null, viewState: { status: "completed" } };
  const good = recommendationService.getF01D5ProposalForCycle(u, cycle.id);
  assert.equal(A.deriveF01Milestones({ ...inputs, proposal: { ...good, d5: { ...good.d5, sourceCycleId: "other-cycle" } } })[7], false);
  assert.equal(A.deriveF01Milestones({ ...inputs, proposal: { ...good, patientId: "someone-else" } })[7], false);
  assert.equal(A.deriveF01Milestones({ ...inputs, baseline: { ...inputs.baseline, patientId: "someone-else" } })[1], false, "another user's assessment never counts");
}

// 30 + 24 (8) + 31. Delayed baseline: accepted but no next cycle -> stage 8 open; next cycle -> new chapter
{
  const p = recommendationService.getF01D5ProposalForCycle(u, cycle.id);
  const c = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u, confirmationDateKey: "2026-10-05" });
  assert.equal(c.requiresFreshBaseline, true);
  let a = adv(u, "2026-10-05");
  assert.deepEqual([a.completedCount, a.currentStage.n, a.waitingReason], [7, 8, "fresh_baseline"], "accepted is not 'next week opened'");
  assert.equal(a.cta.action, `goNextCycleBaselineAssessment('${p.id}')`);
  assert.equal(a.detail, "完成新基準評估後開啟下一週。");
  const fresh = fiveXSts(u, { ms: 8000, at: [2030, 0, 2, 9, 0], role: { assessmentRole: NEXT_CYCLE_BASELINE_ROLE, sourceCycleId: cycle.id, d5ProposalId: p.id } });
  const made = trackingCycleService.createNextTrackingCycle({ userId: u, proposalId: p.id, baselineSession: fresh });
  assert.equal(made.created, true);
  a = adv(u, "2030-01-03");
  assert.equal(a.cycleId, made.cycle.id, "current chapter = Cycle 2");
  assert.equal(a.chapterLabel, "第 2 週旅程");
  assert.equal(a.completedCount, 2, "new chapter starts at 2 / 8 (baseline + plan)");
  assert.deepEqual(a.previousChapter, { cycleId: cycle.id, completedCount: 8, totalStages: 8, chapterNumber: 1 }, "上一週 8 / 8 shown — not progress going backwards");
  assert.equal(A.f01AdventureService.getAdventure(u, "2030-01-03").previousChapter.completedCount, 8);
}

// 32. Same-day reuse: Cycle 2 baseline = Cycle 1 reassessment -> stage 1 done
{
  const u3 = "same-day";
  const { cycle: c1 } = startCycle(u3);
  cycles.update(c1.id, { completedTrainingDates: ["2026-09-29"] }); // 1 training day -> partial -> maintain (confirmable)
  const re = reassess(u3, c1);
  const p = trackingCycleService.evaluateD5Proposal({ cycleId: c1.id, userId: u3, input: { hasNewOrWorseningDiscomfort: false, discomfortNote: null, currentLimitations: [] }, catalog }).proposal;
  const c = trackingCycleService.confirmD5Proposal({ proposalId: p.id, userId: u3, confirmationDateKey: D7 });
  assert.equal(c.cycle.baselineAssessmentId, re.id);
  const a = adv(u3, D7);
  assert.equal(a.cycleId, c.cycle.id);
  assert.equal(a.stages[0].state, "completed", "a reused reassessment is a valid baseline");
  assert.equal(a.chapterLabel, "第 2 週旅程");
  assert.equal(a.previousChapter.completedCount, 7, "1 training day last week: stage 4 passed (not ✓), the other 7 done");
}

// 13. Monotonic presentation + passed training milestones
{
  const { state, current, warnings } = A.presentF01Stages({ 1: true, 2: true, 3: false, 4: false, 5: true, 6: true, 7: false, 8: false, trainingDays: 0 });
  assert.deepEqual([state[3], state[4], state[5], state[6], current], ["passed", "passed", "completed", "completed", 7], "unmet training days pass by once ready — never ✓");
  const odd = A.presentF01Stages({ 1: true, 2: true, 3: true, 4: false, 5: false, 6: true, 7: true, 8: false, trainingDays: 1 });
  assert.equal(odd.state[6], "locked", "a reassessment without the ready state is not shown done");
  assert.equal(odd.current, 4);
  assert.ok(odd.warnings.length >= 1, "inconsistency reported, data untouched");
  const mapSrc = fnBody("rehabMapPage");
  assert.ok(mapSrc.includes('passed: "本週未完成"') && !mapSrc.includes("未達成"), "neutral wording for a passed-by training stage");
  assert.ok(!/資料矛盾|linkage|inconsistent/.test(mapSrc.replace(/\/\/.*$/gm, "").replace(/console\.warn\([^)]*\)/g, "")), "no technical wording in the user UI");
}

// 10. Chapter numbers only from a complete previousCycleId chain
{
  const mk = (id, prev, created, extra = {}) => ({ id, userId: "ch", previousCycleId: prev, createdAt: created, reassessmentId: "r", ...extra });
  assert.equal(A.selectCurrentF01Chapter([mk("a", null, "1"), mk("b", "a", "2"), mk("c", "b", "3", { reassessmentId: null })]).chapterNumber, 3);
  const broken = A.selectCurrentF01Chapter([mk("x", "missing", "5", { reassessmentId: null })]);
  assert.equal(broken.chapterNumber, null);
  assert.equal(A.resolveF01Adventure({ cycle: mk("x", "missing", "5"), chapterNumber: null }).chapterLabel, "目前旅程");
  assert.equal(A.selectCurrentF01Chapter([mk("a", null, "1"), mk("b", "a", "0")]).current.id, "b", "a chapter with a successor is never current, whatever its createdAt");
}

// 3 / 14 / 15 / 16 / 33b. No XP, no persisted state, achievements page untouched
{
  const before = [G.getPatientXP(u), localStorage.getItem("remotion_collection_trackingCycles"), localStorage.getItem("remotion_collection_analysisRecords")];
  for (let i = 0; i < 5; i += 1) adv(u, "2030-01-03");
  assert.deepEqual([G.getPatientXP(u), localStorage.getItem("remotion_collection_trackingCycles"), localStorage.getItem("remotion_collection_analysisRecords")], before, "reading the journey writes nothing and changes no XP");
  const src = readFileSync(join(root, "js/data/f01AdventureProgress.js"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/\.create\(|\.update\(|setItem|gamificationEngine|getAchievements|analysisService|trainingEventService|\bxp\b|addXp|computeSessionXp|rewardXp/i.test(src), "no writes, no XP, no achievements, no training events");
  const map = fnBody("rehabMapPage");
  assert.ok(!/resolveRehabAdventure|rewardBadge|解鎖本關可獲得/.test(map), "stages are no longer achievements");
  assert.ok(map.includes("renderJourneyLevelRow(gamification)") && map.includes("已解鎖 ${gamification.unlockedCount} / ${gamification.totalAchievements}"), "compact Lv/XP line + achievement entry kept");
  assert.ok(!/f01Adventure/.test(fnBody("patientAchievementsPage")), "achievement page unchanged");
  for (const w of ["D1", "D5", "trackingCycle", "proposal"]) assert.ok(!A.F01_ADVENTURE_STAGES.some((s) => s.title.includes(w)), `no internal term 「${w}」 in stage titles`);
}

console.log("Cross-Module I-3 F01 adventure tests passed");
