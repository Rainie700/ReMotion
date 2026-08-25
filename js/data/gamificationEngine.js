import { analysisService } from "./analysisService.js";
import { scheduleService } from "./scheduleService.js";
import { exerciseService } from "./exerciseService.js";

/**
 * ReMotion 2.0 Phase 4 — Gamification Foundation.
 *
 * Everything here is a PURE, deterministic derivation from data that
 * already exists (analysisRecords + schedules). Nothing is persisted here,
 * nothing is invented: call these functions any time and they recompute
 * from scratch, so there is no second "gamification state" that can drift
 * out of sync with the real rehabilitation records, and no risk of double
 * counting. This intentionally supersedes js/data/gameService.js's older
 * seeded/incremental profile (which held hand-authored demo numbers like
 * level 12 / 3850 XP for patient01) as the source of truth for anything
 * Phase 4 displays — gameService.js itself is left untouched so any
 * existing call sites keep working.
 */

const XP_PER_EXERCISE = 10;
const LEVEL_XP_STEP = 100;

/**
 * Phase 5.4.2 — XP economy audit finding (see Final Report section 15):
 * before this phase, EVERY exercise catalog entry (including every squat
 * session) granted a flat rewardXp of 30 via the legacy gameService.addXp()
 * call in app.js — completely independent of exerciseId, targetReps,
 * completedReps, or quality. Meanwhile the number actually shown to the
 * patient's Level/XP bar on Home (this file) was a COMPLETELY different
 * flat 10-per-completion count that never even read that 30. Net effect:
 * a 10-rep session and a 30-rep session earned the same reward, the
 * displayed "+30 XP" toast never matched what Home's XP bar actually moved
 * by, and there was no way to earn less for a lower-effort/lower-quality
 * session. This SESSION_XP_RULES formula fixes that, but ONLY for records
 * that carry real rep/quality data (currently: MediaPipe squat sessions,
 * via summary.totalReps/targetReps/qualityValidReps) — any other record
 * (older completions, non-squat exercise types) falls back to the
 * unchanged flat XP_PER_EXERCISE so historical totals never change
 * retroactively for anyone. Capped at MAX_XP_PER_SESSION so doing far more
 * reps than the target can never be farmed for unlimited XP.
 */
/**
 * Phase 5.4.3 — Difficulty Tier (report section 17): rehabExercises.js
 * already has a real `difficulty` field for all 44 catalog exercises
 * ("非常容易"/"易"/"普通"/"難" — audited: every entry has one, no gaps), so
 * this REUSES that existing data rather than guessing per-exercise medical
 * difficulty. The XP values per tier are a PRODUCT/GAMIFICATION assumption
 * (not a clinical judgment) — a "hard" exercise simply earns a slightly
 * higher base than an "easy" one, exactly as much as this catalog field
 * already distinguishes them.
 */
const DIFFICULTY_LABEL_TO_TIER = {
  "非常容易": "easy",
  "易": "easy",
  "普通": "medium",
  "難": "hard",
};
const DIFFICULTY_TIER_BASE_XP = { easy: 5, medium: 7, hard: 9 };

const SESSION_XP_RULES = {
  // Used only when the exercise's difficulty can't be resolved at all
  // (e.g. a record whose exerciseId no longer matches any catalog entry) —
  // a neutral fallback, not a tier of its own.
  NEUTRAL_BASE_XP: 5,
  DIFFICULTY_TIER_BASE_XP,
  COMPLETION_BONUS_PER_TARGET_REP: 0.5,
  MAX_COMPLETION_BONUS_XP: 15,
  MAX_QUALITY_BONUS_XP: 7,
  // Phase 5.4.3 — small "showed up again" bonus, reusing the EXISTING
  // getCurrentStreak() below completely unchanged (no streak-engine
  // rewrite). Only awarded once the streak reaches 2+ (i.e. this isn't the
  // patient's very first day), so it rewards real continuity, not the
  // first session ever.
  CONSISTENCY_BONUS_XP: 2,
  CONSISTENCY_MIN_STREAK: 2,
  // The real reachable ceiling = hardest difficulty base (9) + max
  // completion (15) + max quality (7) + consistency (2) = 33. Kept as its
  // own named constant (not computed inline) so a future change to any
  // per-component cap can't silently make this non-binding without anyone
  // noticing — same reasoning as Phase 5.4.2's original 27.
  MAX_XP_PER_SESSION: 33,
};

function resolveDifficultyTier(exerciseId) {
  const catalog = exerciseId ? exerciseService.getById(exerciseId) : null;
  const label = catalog && catalog.difficulty;
  return (label && DIFFICULTY_LABEL_TO_TIER[label]) || null;
}

/**
 * Returns { xp, breakdown: {base, completion, quality, consistency},
 * isLegacyFlatRate, difficultyTier }. `breakdown` only ever reports bonuses
 * actually earned — a session that didn't reach its target never reports a
 * non-zero `completion` value (report section 17: "只有真的拿到的 bonus 才顯示").
 *
 * Phase 5.4.3 anti-exploit rules (report section 16):
 *  - totalReps === 0 -> the ENTIRE session is worth 0 XP. Opening the
 *    camera and leaving earns nothing, full stop.
 *  - quality bonus is qualityRatio × completionRatio, not qualityRatio
 *    alone — a single "perfect" rep against a 30-rep target no longer
 *    earns anywhere near the full quality bonus, since it barely
 *    progressed toward the actual goal.
 */
function computeSessionXp(record) {
  const s = record && record.summary;
  if (!s || typeof s.totalReps !== "number" || typeof s.targetReps !== "number") {
    return { xp: XP_PER_EXERCISE, breakdown: { base: XP_PER_EXERCISE, completion: 0, quality: 0, consistency: 0 }, isLegacyFlatRate: true, difficultyTier: null };
  }
  if (!s.totalReps || s.totalReps <= 0) {
    return { xp: 0, breakdown: { base: 0, completion: 0, quality: 0, consistency: 0 }, isLegacyFlatRate: false, difficultyTier: null };
  }

  const difficultyTier = resolveDifficultyTier(record.exerciseId);
  const base = (difficultyTier && DIFFICULTY_TIER_BASE_XP[difficultyTier]) || SESSION_XP_RULES.NEUTRAL_BASE_XP;

  const completionRatio = s.targetReps > 0 ? Math.min(1, s.totalReps / s.targetReps) : 0;
  let completion = 0;
  if (s.targetReps > 0 && s.totalReps >= s.targetReps) {
    completion = Math.min(SESSION_XP_RULES.MAX_COMPLETION_BONUS_XP, Math.round(s.targetReps * SESSION_XP_RULES.COMPLETION_BONUS_PER_TARGET_REP));
  }

  const qualityValidReps = s.qualityValidReps ?? s.validReps ?? 0;
  const qualityRatio = Math.min(1, qualityValidReps / s.totalReps);
  // Phase 5.4.3 — deliberately multiplied by completionRatio, not used
  // alone, so a tiny number of "perfect" reps against a much larger target
  // can't earn a near-full quality bonus (report section 12/16).
  const quality = Math.round(qualityRatio * completionRatio * SESSION_XP_RULES.MAX_QUALITY_BONUS_XP);

  let consistency = 0;
  if (record.patientId) {
    const streak = getCurrentStreak(record.patientId);
    if (streak >= SESSION_XP_RULES.CONSISTENCY_MIN_STREAK) consistency = SESSION_XP_RULES.CONSISTENCY_BONUS_XP;
  }

  const xp = Math.min(base + completion + quality + consistency, SESSION_XP_RULES.MAX_XP_PER_SESSION);
  return { xp, breakdown: { base, completion, quality, consistency }, isLegacyFlatRate: false, difficultyTier };
}

const LEVEL_TITLES = [
  { minLevel: 1, title: "復健新手" },
  { minLevel: 3, title: "復健探索者" },
  { minLevel: 6, title: "復健前進者" },
  { minLevel: 10, title: "復健達人" },
  { minLevel: 15, title: "復健大師" },
];

function getLevelTitle(level) {
  let title = LEVEL_TITLES[0].title;
  for (const entry of LEVEL_TITLES) {
    if (level >= entry.minLevel) title = entry.title;
  }
  return title;
}

function toDateStr(record) {
  return (record.completedAt || record.createdAt || "").slice(0, 10);
}

/**
 * Every analysisRecord is one legitimate completed rehabilitation activity
 * (assigned or self_practice — recommendation completions are tagged
 * self_practice per Phase 3.1). Each record is created exactly once per
 * completion (the existing duplicate-finalize guard in app.js already
 * prevents a second record for the same session), so counting records is
 * naturally free of double-counting — no extra bookkeeping needed.
 */
function getCompletionRecords(patientId) {
  return analysisService.getByPatientId(patientId);
}

function getCompletionDateSet(patientId) {
  return new Set(getCompletionRecords(patientId).map(toDateStr).filter(Boolean));
}

function localTodayStr() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * XP = the sum of each completed record's session XP (computeSessionXp
 * above). Records without rep/quality data fall back to the original flat
 * XP_PER_EXERCISE, so this is a strict extension of the old rule, not a
 * retroactive rewrite of anyone's history.
 */
function getPatientXP(patientId) {
  return getCompletionRecords(patientId).reduce((sum, r) => sum + computeSessionXp(r).xp, 0);
}

/** Level = every 100 XP is one level, constant threshold. */
function getLevelInfo(xp) {
  const level = Math.floor(xp / LEVEL_XP_STEP) + 1;
  const currentLevelXp = xp % LEVEL_XP_STEP;
  return {
    level,
    title: getLevelTitle(level),
    currentLevelXp,
    nextLevelXp: LEVEL_XP_STEP,
    xpPercent: Math.round((currentLevelXp / LEVEL_XP_STEP) * 100),
  };
}

function getPatientLevel(patientId) {
  return getLevelInfo(getPatientXP(patientId));
}

/**
 * Current streak: walks back from today over real completion dates only.
 * If today has no completion yet, today isn't counted as a break (the day
 * isn't over) — checking starts from yesterday instead. Any calendar gap
 * stops the count. Never fabricates days that aren't backed by a record.
 */
function getCurrentStreak(patientId) {
  const dates = getCompletionDateSet(patientId);
  if (!dates.size) return 0;
  const cursor = new Date(`${localTodayStr()}T00:00:00`);
  const cursorStr = () => {
    const mm = String(cursor.getMonth() + 1).padStart(2, "0");
    const dd = String(cursor.getDate()).padStart(2, "0");
    return `${cursor.getFullYear()}-${mm}-${dd}`;
  };
  if (!dates.has(cursorStr())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  let streak = 0;
  while (dates.has(cursorStr())) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** Longest streak ever achieved (used for the streak achievement so it doesn't re-lock after today's streak later breaks). */
function getLongestStreak(patientId) {
  const dates = [...getCompletionDateSet(patientId)].sort();
  if (!dates.length) return 0;
  let longest = 1;
  let current = 1;
  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(`${dates[i - 1]}T00:00:00`);
    const curr = new Date(`${dates[i]}T00:00:00`);
    const diffDays = Math.round((curr - prev) / 86400000);
    if (diffDays === 1) {
      current += 1;
      longest = Math.max(longest, current);
    } else if (diffDays > 1) {
      current = 1;
    }
  }
  return longest;
}

/** Reuses the schedule's own already-computed status ("completed" only once every exercise in it is completed) — no new derivation logic. */
function hasCompletedAllStructuredInADay(patientId) {
  return scheduleService.getByPatientId(patientId).some((s) => s.status === "completed" && (s.exercises || []).length > 0);
}

/**
 * Five-achievement foundation (Phase 4 spec section 11). Every `unlocked`
 * flag is recomputed live from real records on every call — nothing is
 * ever persisted as "already unlocked", so it's impossible to fake one.
 */
function getAchievements(patientId) {
  const totalCount = getCompletionRecords(patientId).length;
  const distinctDates = getCompletionDateSet(patientId).size;
  const longestStreak = getLongestStreak(patientId);
  const allStructuredDone = hasCompletedAllStructuredInADay(patientId);

  // remainingHint (Phase 4.1): a presentation-only string for the Home
  // achievement preview's "下一個目標" line — never a new unlock rule, just
  // a friendlier way to describe the SAME threshold above. Only included
  // where the remaining amount is unambiguous and monotonic; achievements
  // with no safe/honest remaining-count (there are none currently, but the
  // pattern stays null-able on purpose) fall back to just the title on the
  // UI side.
  return [
    { id: "first_step", title: "初次啟程", desc: "完成第一次復健練習", icon: "/images/gamification/medal_bronze.png", unlocked: totalCount >= 1, remainingHint: null },
    { id: "getting_into_it", title: "漸入佳境", desc: "在 3 個不同日期完成復健練習", icon: "/images/gamification/medal_silver.png", unlocked: distinctDates >= 3, remainingHint: distinctDates < 3 ? `再完成 ${3 - distinctDates} 個不同日期即可解鎖` : null },
    { id: "keep_going", title: "持續前進", desc: "達成連續 3 天練習", icon: "/images/gamification/streak_fire.png", unlocked: longestStreak >= 3, remainingHint: longestStreak < 3 ? `再連續完成 ${3 - longestStreak} 天即可解鎖` : null },
    { id: "steady_progress", title: "小有成果", desc: "累積完成 10 次復健練習", icon: "/images/gamification/trophy_gold.png", unlocked: totalCount >= 10, remainingHint: totalCount < 10 ? `再完成 ${10 - totalCount} 次即可解鎖` : null },
    { id: "daily_complete", title: "今日達成", desc: "某一天完成當天全部課表項目", icon: "/images/gamification/achievement_medal.png", unlocked: allStructuredDone, remainingHint: null },
  ];
}

function getGamificationSummary(patientId) {
  const xp = getPatientXP(patientId);
  const levelInfo = getLevelInfo(xp);
  const streak = getCurrentStreak(patientId);
  const achievements = getAchievements(patientId);
  const unlockedCount = achievements.filter((a) => a.unlocked).length;
  return { xp, ...levelInfo, streak, achievements, unlockedCount, totalAchievements: achievements.length };
}

export const gamificationEngine = {
  XP_PER_EXERCISE,
  LEVEL_XP_STEP,
  SESSION_XP_RULES,
  computeSessionXp,
  getPatientXP,
  getLevelInfo,
  getPatientLevel,
  getCurrentStreak,
  getLongestStreak,
  getAchievements,
  getGamificationSummary,
};
