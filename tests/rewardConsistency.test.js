process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Cross-Module Integration I-2 — completion semantics, XP / streak /
 * achievements / weekly summary from canonical Training Events on local dates,
 * legacy compatibility, no double counting, legacy gameService XP retired.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const engineSrc = readFileSync(join(root, "js/data/gamificationEngine.js"), "utf8");
const { analysisService } = await import("../js/data/analysisService.js");
const E = await import("../js/data/trainingEventService.js");
const { gamificationEngine: G } = await import("../js/data/gamificationEngine.js");
const { gameService } = await import("../js/data/gameService.js");
const T = await import("../js/data/trackingCycle.js");
const { createCollection } = await import("../js/data/storageService.js");

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
const fnBody = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  let i = appJs.indexOf("{", start), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
const today = T.toLocalDateKey(new Date());
const dayIso = (daysAgo, hour = 10) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
let n = 0;
/** A NEW canonical training record written through the real write path (a detector-shaped record). */
function train(user, { daysAgo = 0, hour = 10, done = true, exerciseId = "F01-17", score = 75, source = "self_practice", scheduleId = null } = {}) {
  const at = dayIso(daysAgo, hour);
  const reps = done ? 10 : 4;
  return analysisService.create({ id: `ev${++n}`, patientId: user, exerciseId, exerciseName: exerciseId, source, scheduleId, completedAt: at, createdAt: at, totalReps: reps, targetReps: 10, score, summary: { totalReps: reps, targetReps: 10, qualityValidReps: reps } });
}

// ── 25. Completion semantics (a saved record is not a completion) ──
{
  const C = E.resolveTrainingCompletion;
  assert.deepEqual(C({ summary: { completed: true } }), { completed: true, completionKnown: true, completionBasis: "detector_flag" }, "A summary.completed");
  assert.deepEqual(C({ summary: { completed: false, totalReps: 10, targetReps: 10 } }).completed, false, "the detector's own verdict wins (per-side targets)");
  assert.deepEqual(C({ totalReps: 10, targetReps: 10 }), { completed: true, completionKnown: true, completionBasis: "top_level_reps" }, "B top-level reps");
  assert.deepEqual(C({ summary: { totalReps: 12, targetReps: 10 } }), { completed: true, completionKnown: true, completionBasis: "summary_reps" }, "C summary reps");
  assert.equal(C({ totalReps: 7, targetReps: 10 }).completed, false, "D below target");
  assert.deepEqual(C({ score: 92, analysisMode: "mock" }), { completed: false, completionKnown: false, completionBasis: "unknown" }, "E unknown");
  assert.equal(C({ totalReps: 1, targetReps: 10, summary: { totalReps: 1, targetReps: 10 } }).completed, false, "F stopped early");
  assert.equal(C({ totalReps: 5, targetReps: 0 }).completionKnown, false, "target 0 is not evidence");
  // Steps 1-2 are exactly D3's rule (D3 itself is untouched).
  for (const r of [{ summary: { completed: true } }, { summary: { completed: false } }, { totalReps: 10, targetReps: 10 }, { totalReps: 3, targetReps: 10 }]) {
    assert.equal(C(r).completed, T.isTrainingRecordCompleted(r));
  }
  const d3 = readFileSync(join(root, "js/data/trackingCycle.js"), "utf8");
  assert.ok(d3.includes("return Number.isFinite(record.totalReps) && Number.isFinite(record.targetReps) && record.targetReps > 0 && record.totalReps >= record.targetReps;"), "D3 rule unchanged");
}

// ── 30. Incomplete canonical events: kept, shown, never counted ──
{
  const u = "inc";
  train(u, { done: true });
  const inc = train(u, { done: false, score: 99 });
  const events = E.trainingEventService.listTrainingEvents(u);
  assert.equal(events.length, 2, "the incomplete record is still listed");
  const ev = events.find((e) => e.eventId === inc.id);
  assert.deepEqual([ev.completed, ev.isLegacy, ev.countsAsCompleted], [false, false, false]);
  const w = G.getWeeklyTrainingSummary(u);
  assert.equal(w.completedSessionCount, 1);
  assert.equal(w.activeDays, 1);
  assert.equal(w.incompleteCount, 1, "the incomplete run is known to the week (for wording), never counted");
  // I-2.1 — no completed training but an incomplete one: neutral 「尚無完成的訓練」, not 「尚無訓練紀錄」
  // (wording follows the real window: the rolling 7 local days ending today — 近 7 天)
  assert.ok(appJs.includes('${weekly.incompleteCount > 0 ? "近 7 天尚無完成的訓練" : "近 7 天尚無訓練紀錄"}'));
  assert.ok(appJs.includes('buildWeeklyActivityMicrocopy(weekly.activeDays, weekly.incompleteCount)') && appJs.includes('incompleteCount > 0 ? "近 7 天還沒有完成的訓練" : "近 7 天還沒有訓練紀錄"'));
  assert.equal(G.computeSessionXp(inc).xp, 0, "no XP for an incomplete canonical training");
  assert.equal(G.computeSessionXp(inc).notCompleted, true);
  const ach = Object.fromEntries(G.getAchievements(u).map((a) => [a.id, a]));
  assert.equal(ach.first_step.progress.current, 1, "only the completed one counts");
  assert.equal(ach.quality_85.unlocked, false, "an incomplete run's score (99) is not a completed-session score");
  assert.equal(ach.quality_70.unlocked, true, "the completed run's 75 counts");
}

// ── 26. Weekly consistency: one summary for Data, Records header, Home ──
{
  const u = "weekly";
  train(u, { daysAgo: 0 });
  train(u, { daysAgo: 1, source: "assigned", scheduleId: "s1" });
  train(u, { daysAgo: 1, done: false });
  const w = G.getWeeklyTrainingSummary(u);
  assert.equal(w.completedSessionCount, 2, "2 completed + 1 incomplete -> 2");
  assert.equal(w.activeDays, 2);
  assert.deepEqual(w.sourceCounts, { therapist: 1, remotion: 0, self: 1, legacy_unknown: 0 });
  assert.equal(w.weeklyXp, G.getPatientXP(u), "all of this user's XP was earned this week");
  // every patient-facing weekly widget reads the same summary
  assert.ok(fnBody("patientDataOverviewPage").includes("gamificationEngine.getWeeklyTrainingSummary(patientId, realTodayKey)"));
  assert.ok(fnBody("canonicalWeeklyProgress").includes("gamificationEngine.getWeeklyTrainingSummary(patientId)"));
  assert.ok(fnBody("actionRecordsPage").includes("const weekly = canonicalWeeklyProgress(patientId);"), "Training Records header");
  assert.ok(appJs.includes("const weeklyProgress = canonicalWeeklyProgress(patientIdForProgress);"), "Home 我的進度");
  assert.ok(fnBody("therapistCaseDetailPage").includes("canonicalWeeklyProgress(patientId)"), "therapist case overview");
  assert.ok(!/buildWeeklyTrainingProgress\(/.test(stripComments(fnBody("actionRecordsPage") + fnBody("patientDataOverviewPage") + fnBody("therapistCaseDetailPage"))));
}

// ── 27. Local dates everywhere (01:30 Taipei = today) ──
{
  const u = "tz";
  const at = new Date(); at.setHours(1, 30, 0, 0);
  const r = analysisService.create({ id: "tz1", patientId: u, exerciseId: "F01-17", source: "self_practice", completedAt: at.toISOString(), createdAt: at.toISOString(), totalReps: 10, targetReps: 10, summary: { totalReps: 10, targetReps: 10 } });
  assert.equal(r.localDateKey, today, "01:30 local counts as today (its UTC date is yesterday)");
  assert.notEqual(at.toISOString().slice(0, 10), today, "fixture really crosses UTC midnight");
  assert.equal(G.getCurrentStreak(u), 1);
  assert.equal(G.getWeeklyTrainingSummary(u).completedByDay[today], 1);
  assert.ok(!/\.slice\(0, 10\)/.test(stripComments(engineSrc)), "no UTC slicing in the engine");
  assert.ok(!/trackingToday|getTrackingTodayKey/.test(stripComments(engineSrc)), "the debug date never reaches rewards");
}

// ── 28. XP determinism: an event's XP does not depend on "today" ──
{
  const u = "determinism";
  const r1 = train(u, { daysAgo: 10 });
  const r2 = train(u, { daysAgo: 9 }); // 2-day streak on r2's own date -> consistency bonus
  const xp2 = G.computeSessionXp(r2).xp;
  assert.equal(G.computeSessionXp(r2).breakdown.consistency, 2, "bonus from the streak AS OF the event date");
  assert.equal(G.computeSessionXp(r1).breakdown.consistency, 0, "first day of the streak: no bonus");
  // Today the streak is 0 (last training 9 days ago) — the old engine would have dropped the bonus.
  assert.equal(G.getCurrentStreak(u), 0);
  assert.equal(G.computeSessionXp(r2).xp, xp2);
  // A later training never changes earlier events' XP.
  const before = [r1, r2].map((r) => G.computeSessionXp(r).xp);
  train(u, { daysAgo: 0 });
  assert.deepEqual([r1, r2].map((r) => G.computeSessionXp(r).xp), before);
  // Reps beyond the target never add XP; XP is capped.
  const big = analysisService.create({ id: "big", patientId: "cap", exerciseId: "F01-17", source: "self_practice", completedAt: dayIso(0), createdAt: dayIso(0), totalReps: 500, targetReps: 10, summary: { totalReps: 500, targetReps: 10, qualityValidReps: 500 } });
  const norm = analysisService.create({ id: "norm", patientId: "cap2", exerciseId: "F01-17", source: "self_practice", completedAt: dayIso(0), createdAt: dayIso(0), totalReps: 10, targetReps: 10, summary: { totalReps: 10, targetReps: 10, qualityValidReps: 10 } });
  assert.equal(G.computeSessionXp(big).xp, G.computeSessionXp(norm).xp, "doing more reps than the target earns nothing extra");
  assert.ok(G.computeSessionXp(big).xp <= G.SESSION_XP_RULES.MAX_XP_PER_SESSION);
  assert.ok(!/totalDurationMs|seconds|speed/i.test(stripComments(engineSrc.slice(engineSrc.indexOf("function computeSessionXp"), engineSrc.indexOf("const LEVEL_TITLES")))), "no time / speed based XP");
}

// ── 29. No double XP: reading is side-effect free ──
{
  const u = "double";
  train(u); train(u, { daysAgo: 1 });
  const snapshot = () => JSON.stringify([G.getPatientXP(u), G.getPatientLevel(u), G.getWeeklyTrainingSummary(u).weeklyXp, G.getGamificationSummary(u).unlockedCount]);
  const first = snapshot();
  const storeBefore = localStorage.getItem("remotion_collection_analysisRecords");
  for (let i = 0; i < 10; i += 1) { G.getGamificationSummary(u); G.getAchievements(u); E.trainingEventService.listTrainingEvents(u); }
  assert.equal(snapshot(), first, "10 renders -> same XP / level / achievements");
  assert.equal(localStorage.getItem("remotion_collection_analysisRecords"), storeBefore, "nothing written while reading");
  assert.equal(E.trainingEventService.listTrainingEvents(u).length, 2, "one event per record");
}

// ── 31. Achievements from canonical completed events ──
{
  const u = "ach";
  const get = () => Object.fromEntries(G.getAchievements(u).map((a) => [a.id, a]));
  train(u, { daysAgo: 0, done: false });
  assert.equal(get().first_step.unlocked, false, "an incomplete run unlocks nothing");
  train(u, { daysAgo: 6, score: 70, exerciseId: "F01-01" });
  assert.equal(get().first_step.unlocked, true);
  train(u, { daysAgo: 5, score: 60, exerciseId: "F01-02" });
  assert.equal(get().getting_into_it.unlocked, false);
  train(u, { daysAgo: 4, score: 60, exerciseId: "F01-03" });
  let a = get();
  assert.equal(a.getting_into_it.unlocked, true, "3 unique local dates");
  assert.equal(a.keep_going.unlocked, true, "3-day streak");
  assert.equal(a.variety_3.unlocked, true, "3 distinct exercises");
  assert.equal(a.quality_70.unlocked, true);
  assert.equal(a.quality_85.unlocked, false);
  for (let i = 0; i < 5; i += 1) train(u, { daysAgo: 4, score: 60 }); // same day, many runs
  a = get();
  assert.equal(a.getting_into_it.progress.current, 3, "same day counted once for dates");
  assert.equal(a.keep_going.progress.current, 3);
  for (let d = 3; d >= 0; d -= 1) train(u, { daysAgo: d, score: 88 });
  a = get();
  assert.equal(a.streak_7.unlocked, true, "7-day streak");
  assert.equal(a.quality_85.unlocked, true);
  assert.equal(a.steady_progress.unlocked, true, "10 completions (12 so far)");
  assert.equal(a.milestone_20.unlocked, false);
  for (let i = 0; i < 8; i += 1) train(u, { daysAgo: 0 });
  assert.equal(get().milestone_20.unlocked, true);
  for (let i = 0; i < 30; i += 1) train(u, { daysAgo: 1 });
  assert.equal(get().milestone_50.unlocked, true);
  assert.equal(get().level_2.unlocked, G.getPatientXP(u) >= 100);
  assert.equal(get().milestone_50.progress.current, 50, "incomplete run never counted");
  // daily_complete (I-4): all assigned tasks of a day; a completed therapist schedule still qualifies (legacy compatibility)
  const schedules = createCollection("schedules");
  schedules.create({ id: "sch-done", patientId: "ach-daily", date: today, status: "completed", exercises: [{ exerciseId: "F01-04", status: "completed" }] });
  assert.equal(Object.fromEntries(G.getAchievements("ach-daily").map((x) => [x.id, x])).daily_complete.unlocked, true);
  assert.ok(engineSrc.includes("hasCompletedAllAssignedInADay("), "daily_complete: therapist + ReMotion (F01) assignments via todayPlanAggregator (I-4)");
  const descs = G.getAchievements(u).map((x) => x.desc).join();
  assert.ok(descs.includes("AI 姿勢分數") && !descs.includes("訓練分數") && !descs.includes("品質"));
}

// ── 22. Legacy compatibility: existing history keeps its credit ──
{
  const u = "legacy-user";
  const recs = createCollection("analysisRecords");
  // Pre-I-1 records (no write-time source): one with no reps, one stopped early, one normal.
  recs.create({ id: "old1", patientId: u, exerciseId: "ex_squat", analysisMode: "mock", overallScore: 71, createdAt: dayIso(20) });
  recs.create({ id: "old2", patientId: u, exerciseId: "F01-01", source: "self_practice", totalReps: 3, targetReps: 10, score: 40, completedAt: dayIso(19), summary: { totalReps: 3, targetReps: 10 } });
  recs.create({ id: "old3", patientId: u, exerciseId: "F01-02", source: "assigned", scheduleId: "s", totalReps: 10, targetReps: 10, completedAt: dayIso(18), summary: { totalReps: 10, targetReps: 10 } });
  const events = E.trainingEventService.listTrainingEvents(u);
  assert.ok(events.every((e) => e.isLegacy && e.countsAsCompleted), "legacy history is still counted (nothing re-locked)");
  assert.equal(events.find((e) => e.eventId === "old1").completionKnown, false);
  assert.equal(events.find((e) => e.eventId === "old2").completed, false, "its real completion is still reported");
  const a = Object.fromEntries(G.getAchievements(u).map((x) => [x.id, x]));
  assert.equal(a.steady_progress.progress.current, 3, "all 3 legacy records still count as completed sessions");
  assert.equal(a.getting_into_it.unlocked, true, "3 legacy dates still unlock 漸入佳境");
  assert.equal(G.computeSessionXp(recs.getById("old1")).xp, G.XP_PER_EXERCISE, "legacy flat rate kept");
  assert.ok(G.computeSessionXp(recs.getById("old2")).xp > 0, "legacy partial record keeps its previous (non-zero) XP");
  // legacy XP is deterministic too (event-date streak, not today's)
  const xp = G.getPatientXP(u);
  train(u, { daysAgo: 0 });
  assert.equal(G.computeSessionXp(recs.getById("old3")).xp, G.computeSessionXp(recs.getById("old3")).xp);
  assert.equal(G.getPatientXP(u) - xp, G.computeSessionXp(E.trainingEventService.listTrainingEvents(u)[0].record).xp, "a new training only adds its own XP");
  // no crash on unknown shapes
  assert.equal(E.normalizeTrainingEvent({ id: "bare", patientId: u }).countsAsCompleted, true);
}

// ── 32. D5 / assessment safety: no training events, no XP change ──
{
  const u = "d5safe";
  train(u); train(u, { daysAgo: 1 });
  const before = [G.getPatientXP(u), G.getCurrentStreak(u), G.getGamificationSummary(u).unlockedCount];
  // assessments (incl. invalid) and D5 proposals live in other collections
  const fas = createCollection("functionalAssessmentSessions");
  fas.create({ id: "inv", patientId: u, assessmentType: "five_times_sit_to_stand", status: "completed", result: { status: "invalid" } });
  const recsC = createCollection("recommendationResults");
  recsC.create({ id: "d5p", patientId: u, kind: "f01_goal", origin: "d5_next_cycle", status: "draft", d5: { confirmationMode: "professional_review_required", nextCycleReady: false } });
  assert.deepEqual([G.getPatientXP(u), G.getCurrentStreak(u), G.getGamificationSummary(u).unlockedCount], before);
  assert.equal(E.trainingEventService.listTrainingEvents(u).length, 2, "neither creates a training event");
}

// ── 33. Legacy gameService: no new writes; module and collection kept ──
{
  assert.equal(typeof gameService.addXp, "function", "gameService.js still imports and works");
  assert.equal((stripComments(appJs).match(/gameService\.addXp\(/g) || []).length, 0, "no app code path calls addXp any more");
  const u = "gs";
  const profileBefore = JSON.stringify(gameService.getOrCreateByPatientId(u));
  train(u);
  assert.equal(JSON.stringify(gameService.getByPatientId(u)), profileBefore, "a completed training does not touch gameProfiles");
  assert.ok(!/gameService|gameProfiles/.test(stripComments(engineSrc)), "the displayed XP never reads gameProfiles");
}

// ── 17 / 19. One XP source for every screen; incomplete rows show no +XP ──
{
  const readers = ["renderLevelXpSummaryCard", "patientAchievementsPage", "rehabMapPage"].filter((f) => appJs.includes(`function ${f}(`));
  for (const f of readers) assert.ok(!/gameService\./.test(fnBody(f)), `${f} does not read gameProfiles`);
  const entry = fnBody("buildTrainingHistoryEntry");
  assert.ok(entry.includes("xpEarned: xpResult && !xpResult.notCompleted ? xpResult.xp : null") && entry.includes("completed: !xpResult.notCompleted"));
  assert.ok(appJs.includes('${entry.completed === false ? `<span class="history-incomplete-tag">未完成</span>` : ""}'));
  // 動作達標率 only when the detector measured qualityValidReps (AK05/AK06/AK07/F02 do not) — never a fake 0 %
  assert.ok(entry.includes("const qualityRatio = qualityValidReps == null ? null : calculateQualityRatioPercent(completedReps || 0, qualityValidReps);"));
  assert.ok(!entry.includes("qualityValidReps || 0"));
}

console.log("Cross-Module I-2 reward consistency tests passed");
