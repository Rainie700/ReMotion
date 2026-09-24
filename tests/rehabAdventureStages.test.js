import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Rehab Adventure — data-driven chapter/stage config + adapter guards.
 * Every stage IS an existing gamificationEngine achievement; the adapter
 * adds only titles + a visible window. No hardcoded knee challenge, no
 * fake badge, no new threshold.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const {
  REHAB_ADVENTURE_STAGE_CONFIG,
  REHAB_ADVENTURE_WINDOW_SIZE,
  resolveRehabAdventure,
} = await import("../js/data/rehabAdventureStages.js");

// ── 1 / 2 — at least 8 config-driven stages, each backed by a real achievement ──
assert.ok(Array.isArray(REHAB_ADVENTURE_STAGE_CONFIG) && REHAB_ADVENTURE_STAGE_CONFIG.length >= 8,
  `at least 8 stage definitions (got ${REHAB_ADVENTURE_STAGE_CONFIG.length})`);
assert.deepEqual(REHAB_ADVENTURE_STAGE_CONFIG.map((s) => s.n), REHAB_ADVENTURE_STAGE_CONFIG.map((_, i) => i + 1),
  "stage numbers are 1..N in order");

// cross-check every achievementId against the real engine output
{
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
  };
  const { gamificationEngine } = await import("../js/data/gamificationEngine.js");
  const realIds = new Set(gamificationEngine.getAchievements("adv_probe").map((a) => a.id));
  for (const cfg of REHAB_ADVENTURE_STAGE_CONFIG) {
    assert.ok(realIds.has(cfg.achievementId), `stage ${cfg.n} maps to a real achievement id: ${cfg.achievementId}`);
  }
  // 5 — no fake "膝蓋穩定王" badge anywhere (it is not a real achievement)
  assert.ok(![...realIds].some((id) => /knee|膝/.test(id)), "no knee-specific achievement in the engine");
}

// ── 5 — module carries no hardcoded knee challenge / fake badge ──
{
  const src = readFileSync(join(root, "js/data/rehabAdventureStages.js"), "utf8");
  for (const banned of ["膝蓋穩定挑戰", "膝蓋穩定王", "+120 XP"]) {
    assert.ok(!src.includes(banned), `adventure config has no "${banned}"`);
  }
}

const mkSummary = (unlockedIds, over = {}) => ({
  achievements: REHAB_ADVENTURE_STAGE_CONFIG.map((cfg) => ({
    id: cfg.achievementId,
    title: `A_${cfg.achievementId}`,
    desc: `完成 ${cfg.achievementId} 條件`,
    icon: `/images/gamification/${cfg.achievementId}.png`,
    unlocked: unlockedIds.includes(cfg.achievementId),
    progress: { current: unlockedIds.includes(cfg.achievementId) ? 3 : 1, target: 3, unit: "" },
  })),
  ...over,
});

// ── 3 — visible window keeps `current` visible, clamped at both ends ──
{
  const size = REHAB_ADVENTURE_WINDOW_SIZE;
  const total = REHAB_ADVENTURE_STAGE_CONFIG.length;

  // nothing unlocked -> current = stage 1 -> window 1..size
  const a1 = resolveRehabAdventure(mkSummary([]));
  assert.equal(a1.currentStageNumber, 1);
  assert.equal(a1.visibleStages.length, size);
  assert.equal(a1.windowStartNumber, 1);
  assert.equal(a1.visibleStages[0].state, "current");

  // middle -> current stays inside the window, window size stable
  const midIds = REHAB_ADVENTURE_STAGE_CONFIG.slice(0, 3).map((s) => s.achievementId);
  const a2 = resolveRehabAdventure(mkSummary(midIds));
  assert.equal(a2.currentStageNumber, 4);
  assert.equal(a2.visibleStages.length, size);
  assert.ok(a2.visibleStages.some((s) => s.state === "current"), "current stage is within the window");
  assert.ok(a2.windowStartNumber <= 4 && a2.windowEndNumber >= 4);

  // all unlocked -> allCompleted, window clamped to the last `size`
  const allIds = REHAB_ADVENTURE_STAGE_CONFIG.map((s) => s.achievementId);
  const a3 = resolveRehabAdventure(mkSummary(allIds));
  assert.equal(a3.allCompleted, true);
  assert.equal(a3.currentStageNumber, total);
  assert.equal(a3.windowEndNumber, total);
  assert.equal(a3.visibleStages.length, size);
}

// ── 4 — current challenge + reward derive from the current stage's achievement ──
{
  const unlocked = REHAB_ADVENTURE_STAGE_CONFIG.slice(0, 2).map((s) => s.achievementId);
  const adv = resolveRehabAdventure(mkSummary(unlocked));
  const cur = adv.currentStage;
  assert.equal(cur.n, 3);
  assert.equal(cur.state, "current");
  assert.equal(cur.requirement, `完成 ${cur.id} 條件`, "requirement is the achievement's own desc");
  assert.deepEqual({ current: cur.progress.current, target: cur.progress.target }, { current: 1, target: 3 },
    "progress bar comes from the achievement progress metadata");
  assert.deepEqual(cur.rewardBadge, { label: `A_${cur.id}`, icon: `/images/gamification/${cur.id}.png` },
    "reward = the real achievement badge (label + icon)");
  assert.equal(cur.rewardXp, null, "no fabricated per-stage XP");
  // completed stages before it, locked after it
  assert.deepEqual(adv.stages.slice(0, 2).map((s) => s.state), ["completed", "completed"]);
  assert.ok(adv.stages.slice(3).every((s) => s.state === "locked"));
}

// ── rehabMapPage() wiring (static) ──
{
  const appJs = readFileSync(join(root, "app.js"), "utf8");
  const at = appJs.indexOf("function rehabMapPage()");
  const map = appJs.slice(at, appJs.indexOf("\n}\n", at) === -1 ? at + 5000 : appJs.indexOf("\n}", at) + 2);
  assert.ok(/resolveRehabAdventure\(gamification\)/.test(map), "map page uses the adventure adapter");
  assert.ok(/adventure\.visibleStages/.test(map), "map renders only the visible stage window");
  assert.ok(/冒險進度 \$\{adventure\.currentStageNumber\} \/ \$\{adventure\.totalStages\}/.test(map), "chapter indicator N / total");
  assert.ok(/第 \$\{cur\.n\} 關｜\$\{cur\.title\}/.test(map), "current challenge title from the current stage");
  assert.ok(/cur\.rewardBadge/.test(map), "next-reward card reads the current stage's badge");
  assert.ok(!/膝蓋穩定挑戰|膝蓋穩定王|\+120 XP/.test(map.replace(/^\s*\/\/.*$/gm, "")), "no hardcoded knee challenge / fake badge in the page");
  assert.ok(/import \{ resolveRehabAdventure \} from ".\/js\/data\/rehabAdventureStages\.js"/.test(appJs), "adapter imported");
}

// ── 11 — gamificationEngine stays the source of truth (adapter is read-only) ──
{
  const src = readFileSync(join(root, "js/data/rehabAdventureStages.js"), "utf8");
  assert.ok(!/localStorage|analysisService|scheduleService|\.create\(|\.update\(/.test(src),
    "the adventure adapter never writes / never re-derives — it only reads the passed summary");
}

console.log("Rehab Adventure data-driven stages guards passed");
