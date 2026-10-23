import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion 7.9 — Achievement System V1 (5 → 12) guards.
 *
 * Part 1 (behavioural): every one of the 12 achievements unlocks ONLY from
 *   real persisted state (analysisRecords / distinct dates / streak calc /
 *   numeric score / distinct exerciseId / completed schedule / XP→level).
 * Part 2 (static): the original five ids are preserved; the Achievement
 *   page carries no gradient; ?achievementPreview=1 is a pure local remap
 *   that performs zero writes.
 */

const _store = new Map();
globalThis.localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => _store.set(k, String(v)),
  removeItem: (k) => _store.delete(k),
};

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { gamificationEngine } = await import("../js/data/gamificationEngine.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { scheduleService } = await import("../js/data/scheduleService.js");

let seq = 0;
const addRecord = (patientId, over = {}) =>
  analysisService.create({
    id: `ach_${patientId}_${seq++}`,
    patientId,
    exerciseId: "LE01",
    completedAt: "2026-04-01T09:00:00.000Z",
    createdAt: "2026-04-01T09:00:00.000Z",
    ...over,
  });
const ach = (patientId) => {
  const map = {};
  for (const a of gamificationEngine.getAchievements(patientId)) map[a.id] = a;
  return map;
};
const consecutiveDates = (n, startDay = 1) =>
  Array.from({ length: n }, (_, i) => `2026-03-${String(startDay + i).padStart(2, "0")}T09:00:00.000Z`);

// ── A / B / C — set shape, id stability, count ────────────────────
{
  const list = gamificationEngine.getAchievements("ach_empty_patient");
  const ids = list.map((a) => a.id);
  for (const original of ["first_step", "getting_into_it", "keep_going", "steady_progress", "daily_complete"]) {
    assert.ok(ids.includes(original), `original achievement id preserved: ${original}`);
  }
  assert.equal(list.length, 12, "achievement count is 12");
  assert.deepEqual(new Set(ids).size, ids.length, "all achievement ids are unique");
  // every achievement is locked for a patient with zero records
  assert.ok(list.every((a) => a.unlocked === false), "nothing is unlocked from empty state");
  // presentation metadata is present but never a condition
  assert.ok(list.every((a) => typeof a.category === "string" && a.category.length > 0), "every achievement has a category");
}

// ── D — 1 real completed session unlocks 初次啟程 ─────────────────
{
  const p = "ach_first";
  assert.equal(ach(p).first_step.unlocked, false);
  addRecord(p);
  assert.equal(ach(p).first_step.unlocked, true, "1 completed record -> first_step");
  assert.equal(ach(p).getting_into_it.unlocked, false, "1 record is not yet 3 distinct dates");
}

// ── E — 3 distinct training dates unlock 漸入佳境 ─────────────────
{
  const p = "ach_dates";
  for (const d of ["2026-05-01", "2026-05-01", "2026-05-04"]) addRecord(p, { completedAt: `${d}T09:00:00.000Z` });
  assert.equal(ach(p).getting_into_it.unlocked, false, "2 distinct dates -> still locked");
  addRecord(p, { completedAt: "2026-05-09T09:00:00.000Z" });
  assert.equal(ach(p).getting_into_it.unlocked, true, "3 distinct dates -> getting_into_it");
}

// ── F — cumulative milestones 10 / 20 / 50 ────────────────────────
{
  const p = "ach_cumulative";
  for (let i = 0; i < 10; i++) addRecord(p);
  assert.equal(ach(p).steady_progress.unlocked, true, "10 records -> 小有成果");
  assert.equal(ach(p).milestone_20.unlocked, false);
  for (let i = 0; i < 10; i++) addRecord(p);
  assert.equal(ach(p).milestone_20.unlocked, true, "20 records -> 穩定累積");
  assert.equal(ach(p).milestone_50.unlocked, false);
  for (let i = 0; i < 30; i++) addRecord(p);
  assert.equal(ach(p).milestone_50.unlocked, true, "50 records -> 復健達人");
  // progress metadata is structured, not string-parsed
  const sp = ach("ach_cumulative_partial");
  addRecord("ach_cumulative_partial");
  const one = ach("ach_cumulative_partial").steady_progress;
  assert.deepEqual({ current: one.progress.current, target: one.progress.target }, { current: 1, target: 10 });
}

// ── G — existing streak computation: 3-day / 7-day ───────────────
{
  const p3 = "ach_streak3";
  for (const d of consecutiveDates(3)) addRecord(p3, { completedAt: d });
  assert.equal(ach(p3).keep_going.unlocked, true, "3 consecutive days -> 持續前進");
  assert.equal(ach(p3).streak_7.unlocked, false);

  const p7 = "ach_streak7";
  for (const d of consecutiveDates(7)) addRecord(p7, { completedAt: d });
  assert.equal(ach(p7).streak_7.unlocked, true, "7 consecutive days -> 堅持不懈");
}

// ── H — real numeric training score unlocks 70 / 85 ──────────────
{
  const p = "ach_quality";
  addRecord(p, { score: 64 });
  assert.equal(ach(p).quality_70.unlocked, false, "score 64 -> quality_70 locked");
  addRecord(p, { score: 72 });
  assert.equal(ach(p).quality_70.unlocked, true, "score 72 -> 動作漸穩");
  assert.equal(ach(p).quality_85.unlocked, false);
  addRecord(p, { score: 88 });
  assert.equal(ach(p).quality_85.unlocked, true, "score 88 -> 精準動作");

  // overallScore (older/mock records) is accepted when `score` is absent
  const p2 = "ach_quality_overall";
  addRecord(p2, { overallScore: 90 });
  assert.equal(ach(p2).quality_85.unlocked, true, "overallScore 90 -> quality_85 (numeric field, not the label)");
}

// ── I — 3 distinct exerciseId values unlock 多元練習 ─────────────
{
  const p = "ach_variety";
  addRecord(p, { exerciseId: "LE01" });
  addRecord(p, { exerciseId: "LE01" });
  assert.equal(ach(p).variety_3.unlocked, false, "same exerciseId x2 -> locked");
  addRecord(p, { exerciseId: "HP01" });
  addRecord(p, { exerciseId: "CR01" });
  assert.equal(ach(p).variety_3.unlocked, true, "3 distinct exerciseId -> 多元練習");
}

// ── J — existing level calculation unlocks 升級時刻 at Lv.2 ──────
{
  const p = "ach_level";
  // legacy flat-rate records (no summary) = XP_PER_EXERCISE each.
  const per = gamificationEngine.XP_PER_EXERCISE;
  const needed = Math.ceil(gamificationEngine.LEVEL_XP_STEP / per); // -> Lv.2
  for (let i = 0; i < needed - 1; i++) addRecord(p);
  assert.equal(gamificationEngine.getLevelInfo(gamificationEngine.getPatientXP(p)).level, 1);
  assert.equal(ach(p).level_2.unlocked, false, "below 100 XP -> still Lv.1");
  addRecord(p);
  assert.equal(gamificationEngine.getLevelInfo(gamificationEngine.getPatientXP(p)).level, 2);
  assert.equal(ach(p).level_2.unlocked, true, "reached Lv.2 via the existing level calc -> 升級時刻");
}

// ── K — 今日達成 preserves its real condition (completed schedule) ─
{
  const p = "ach_daily";
  assert.equal(ach(p).daily_complete.unlocked, false);
  scheduleService.create({
    id: `sch_${p}`,
    patientId: p,
    status: "completed",
    exercises: [{ exerciseId: "LE01", status: "completed" }],
    createdAt: "2026-04-10T09:00:00.000Z",
  });
  assert.equal(ach(p).daily_complete.unlocked, true, "a completed schedule with exercises -> 今日達成 (rule unchanged)");
}

// ── L / M — preview mode: zero writes, no effect on the real summary ─
{
  const p = "ach_preview";
  addRecord(p);
  addRecord(p, { score: 90 });
  const before = JSON.stringify(gamificationEngine.getGamificationSummary(p));
  const storeBefore = JSON.stringify([..._store.entries()]);

  // The engine itself must be a pure recompute (no persistence side effect).
  const again = JSON.stringify(gamificationEngine.getGamificationSummary(p));
  assert.equal(again, before, "getGamificationSummary is a pure recompute (idempotent)");
  assert.equal(JSON.stringify([..._store.entries()]), storeBefore, "reading achievements writes nothing to storage");

  // Static: the Achievement Page preview branch is a local, non-persistent remap.
  const appJs = readFileSync(join(root, "app.js"), "utf8");
  const at = appJs.indexOf("patientAchievementsPage = function() {");
  const body = appJs.slice(at, appJs.indexOf("\n};", at));
  assert.ok(/achievementPreview.*===\s*"1"/.test(body), "preview is gated on ?achievementPreview=1");
  assert.ok(
    /previewMode\s*\?\s*gamification\.achievements\.map\(\(a, i\) => \(\{ \.\.\.a, unlocked: i < 4 \}\)\)/.test(body),
    "preview remaps into FRESH objects (spread), never mutating engine output"
  );
  for (const write of ["analysisService.create", "analysisService.update", ".setItem(", "localStorage.setItem", "gameService.addXp", "completeSession("]) {
    assert.ok(!body.includes(write), `Achievement page performs no write: ${write}`);
  }
}

// ── N — Achievement page has no gradient ─────────────────────────
{
  const stylesCss = readFileSync(join(root, "styles.css"), "utf8");
  const achRules = stylesCss
    .split("\n")
    .filter((l) => l.includes(".achievement-page") || /^\s{2}/.test(l))
    .join("\n");
  // scan every rule whose selector mentions .achievement-page plus its body lines
  const scoped = [...stylesCss.matchAll(/\.achievement-page[^{]*\{[^}]*\}/g)].map((m) => m[0]).join("\n");
  assert.ok(!/gradient/i.test(scoped), "no gradient() in any .achievement-page CSS rule");

  const appJs = readFileSync(join(root, "app.js"), "utf8");
  const at = appJs.indexOf("patientAchievementsPage = function() {");
  const body = appJs.slice(at, appJs.indexOf("\n};", at));
  assert.ok(!/gradient/i.test(body), "no gradient in the Achievement page renderer");
}

console.log("ReMotion 7.9 achievement system (5 -> 12) + preview + no-gradient guards passed");
