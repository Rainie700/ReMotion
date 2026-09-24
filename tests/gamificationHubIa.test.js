import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Gamification IA update — static source guards.
 *
 * - Home's Level/XP/Streak card is the tap target into the existing `map`
 *   route (goMap()); no new gamification route is introduced.
 * - The Rehab Adventure Map (the Gamification Hub) renders the SAME
 *   Level/XP/Streak component from gamificationEngine.getGamificationSummary
 *   that Home uses (one shared renderer), and exposes an entry into the
 *   separate Achievement collection page.
 * - The once-static duplicated numbers (streak "28", stars "36") are gone
 *   from the map now that real gamification values are shown.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected to find ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + 6000 : end + 2);
};

// ── one shared Level/XP/Streak renderer, driven by the real summary ──
{
  const helper = sliceFn("function renderLevelXpSummaryCard(");
  assert.ok(/gamification\.level/.test(helper) && /gamification\.currentLevelXp/.test(helper) && /gamification\.streak/.test(helper),
    "the shared card renders level + XP + streak from the gamification summary");
  assert.ok(/function renderLevelXpSummaryCard\(gamification, onclick\)/.test(helper) && /onclick \?/.test(helper) && /clickAttr/.test(helper),
    "the shared card takes an optional onclick (Home passes goMap(), the hub passes none)");
}

// ── Home: the Level/XP card IS the entry point to goMap() ──
{
  const home = sliceFn("patientHome = function()");
  assert.ok(/const levelXpCardHtml = renderLevelXpSummaryCard\(gamification, "goMap\(\)"\)/.test(home),
    "Home builds its Level/XP card via the shared renderer, wired to goMap()");
  // no bespoke second copy of the level-xp markup left in Home
  assert.ok(!/const levelXpCardHtml = `<div class="level-xp-card">/.test(home),
    "Home no longer hand-builds a separate level-xp card");
}

// ── Adventure Map = Gamification Hub: real summary + achievement entry ──
{
  const map = sliceFn("function rehabMapPage()");
  assert.ok(/gamificationEngine\.getGamificationSummary\(getCurrentPatientId\(\)\)/.test(map),
    "the map page reads the same single gamification source of truth");
  assert.ok(/\$\{renderLevelXpSummaryCard\(gamification\)\}/.test(map),
    "the map page shows the shared Level/XP/Streak card (no onclick — already here)");
  assert.ok(/onclick="goAchievements\(\)"[\s\S]*?已解鎖 \$\{gamification\.unlockedCount\} \/ \$\{gamification\.totalAchievements\}/.test(map),
    "the hub has an entry into the separate Achievement collection page, showing the real unlocked count");
  // hierarchy in the RETURN template: summary -> chapter+map -> challenge -> reward -> achievements entry
  const ret = map.slice(map.indexOf("return `"));
  const order = ["${renderLevelXpSummaryCard(gamification)}", 'class="rehab-adventure-chapter"', "${challengeHtml}", "${rewardHtml}", "rehab-achievement-entry"];
  let last = -1;
  for (const token of order) {
    const at = ret.indexOf(token);
    assert.ok(at > last, `hub section order: ${token} comes after the previous section`);
    last = at;
  }
  // the once-static / now-hardcoded demo copy is gone from the map
  // (check emitted markup, not code comments)
  const emitted = map.replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!emitted.includes("目前星星"), "fake 目前星星 stat removed");
  assert.ok(!emitted.includes('class="stats rehab-stats"'), "the static 3-col demo stats strip is gone");
  assert.ok(!emitted.includes("膝蓋穩定挑戰") && !emitted.includes("膝蓋穩定王"), "hardcoded knee challenge / fake badge removed");
  assert.ok(!/本關進度 2 \/ 3/.test(emitted) && /本關進度 \$\{p\.current\} \/ \$\{p\.target\}/.test(emitted),
    "challenge progress is data-driven (from the current stage config), not the static 2 / 3");
  assert.ok(/resolveRehabAdventure\(gamification\)/.test(emitted), "map derives stages from the adventure adapter");
}

// ── deterministic back navigation (no browser-history dependency) ──
{
  const map = sliceFn("function rehabMapPage()");
  assert.ok(/<button class="btn btn-light" onclick="switchTab\('home'\)">返回<\/button>/.test(map),
    "Rehab Adventure Map 返回 -> Patient Home (switchTab('home'))");
  assert.ok(!/onclick="switchTab\('profile'\)">返回/.test(map), "Map 返回 no longer routes to profile");

  const ach = appJs.slice(appJs.indexOf("patientAchievementsPage = function() {"));
  const achBody = ach.slice(0, ach.indexOf("\n};"));
  assert.ok(/<button class="btn btn-light" onclick="goMap\(\)">返回<\/button>/.test(achBody),
    "Achievement Badges 返回 -> Rehab Adventure Map (goMap())");
  assert.ok(!/onclick="switchTab\('profile'\)">返回/.test(achBody), "Achievements 返回 no longer routes to profile");

  // both destinations are deterministic route/tab assignments, not history()
  assert.ok(/function goMap\(\)\{ state\.route = "map"; state\.tab = "profile"; render\(\); \}/.test(appJs),
    "goMap() is a deterministic route set");
  const st = sliceFn("function switchTab(tab)");
  assert.ok(/state\.route = "dashboard";\s*\n\s*state\.tab = tab;/.test(st), "switchTab() deterministically sets route+tab");
  assert.ok(!/history\.(back|go)\(/.test(appJs.slice(appJs.indexOf("function rehabMapPage()"), appJs.indexOf("function rehabMapPage()") + 4000)),
    "no browser-history back used on the map page");
}

// ── no second gamification route / system was created ──
{
  assert.ok(!/state\.route = "gamification"/.test(appJs) && !/state\.route === "gamification"/.test(appJs),
    "no new gamification route");
  assert.ok((appJs.match(/function goMap\(\)/g) || []).length === 1, "goMap() unchanged (single definition)");
  assert.ok(/function goMap\(\)\{ state\.route = "map"/.test(appJs), "goMap() still targets the existing map route");
}

console.log("Gamification Hub IA guards passed");
