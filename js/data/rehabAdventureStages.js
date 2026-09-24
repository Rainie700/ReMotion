/**
 * ReMotion — Rehab Adventure chapter/stage config + adapter.
 *
 * Pure, DOM-free, app.js-free. Each adventure "stage" is a thin
 * presentation wrapper over ONE existing gamificationEngine achievement:
 * that achievement's `unlocked` boolean and `{ current, target }` progress
 * ARE the stage's state and progress bar. This introduces NO new
 * threshold, NO XP economy, NO clinical logic — if an achievement rule
 * changes in gamificationEngine, every mapped stage follows automatically.
 *
 * The only thing this file adds is adventure-flavoured stage TITLES and a
 * window/paging helper so the V2 landscape map can show ~4 checkpoints at a
 * time out of 8+.
 */

/**
 * `achievementId` MUST be an id returned by
 * gamificationEngine.getAchievements(). Order = adventure progression
 * (roughly easiest → hardest), so "current stage" = the first one whose
 * achievement is not yet unlocked. `title` is display-only flavour; the
 * requirement text shown to the patient is the achievement's own `desc`.
 */
export const REHAB_ADVENTURE_STAGE_CONFIG = [
  { n: 1, achievementId: "first_step", title: "初次啟程" },
  { n: 2, achievementId: "getting_into_it", title: "穩定練習" },
  { n: 3, achievementId: "keep_going", title: "持續前進" },
  { n: 4, achievementId: "variety_3", title: "多元練習" },
  { n: 5, achievementId: "quality_70", title: "動作挑戰" },
  { n: 6, achievementId: "steady_progress", title: "復健探索者" },
  { n: 7, achievementId: "quality_85", title: "精準動作" },
  { n: 8, achievementId: "level_2", title: "復健進階者" },
];

export const REHAB_ADVENTURE_WINDOW_SIZE = 4;

/**
 * gamificationSummary (from gamificationEngine.getGamificationSummary) →
 * {
 *   stages: [{ id, n, title, requirement, progress|null, rewardXp,
 *              rewardBadge|null, unlocked, state }],
 *   visibleStages, windowStartNumber, windowEndNumber,
 *   currentStageNumber, currentStage, totalStages, allCompleted
 * }
 *
 * state: "completed" (achievement unlocked) | "current" (first not-yet
 * unlocked) | "locked". rewardXp is always null — ReMotion has no
 * per-stage XP source; the real reward is the achievement badge itself.
 */
export function resolveRehabAdventure(gamificationSummary, opts = {}) {
  const windowSize = opts.windowSize || REHAB_ADVENTURE_WINDOW_SIZE;
  const byId = new Map(((gamificationSummary && gamificationSummary.achievements) || []).map((a) => [a.id, a]));

  const stages = REHAB_ADVENTURE_STAGE_CONFIG.map((cfg) => {
    const a = byId.get(cfg.achievementId) || null;
    const progress =
      a && a.progress && typeof a.progress.target === "number"
        ? { current: a.progress.current, target: a.progress.target, unit: a.progress.unit || "" }
        : null;
    return {
      id: cfg.achievementId,
      n: cfg.n,
      title: cfg.title,
      requirement: a ? a.desc : cfg.title,
      progress,
      rewardXp: null, // no real per-stage XP economy — reward is the badge
      rewardBadge: a ? { label: a.title, icon: a.icon } : null,
      unlocked: !!(a && a.unlocked),
      state: "locked",
    };
  });

  const firstLockedIdx = stages.findIndex((s) => !s.unlocked);
  const allCompleted = firstLockedIdx === -1;
  const currentIdx = allCompleted ? stages.length - 1 : firstLockedIdx;
  stages.forEach((s, i) => {
    s.state = s.unlocked ? "completed" : i === currentIdx ? "current" : "locked";
  });

  const total = stages.length;
  const size = Math.min(windowSize, total);
  let start = currentIdx - Math.floor((size - 1) / 2);
  start = Math.max(0, Math.min(start, total - size));
  const visibleStages = stages.slice(start, start + size);

  return {
    stages,
    visibleStages,
    windowStartNumber: visibleStages[0] ? visibleStages[0].n : 1,
    windowEndNumber: visibleStages[visibleStages.length - 1] ? visibleStages[visibleStages.length - 1].n : total,
    currentStageNumber: stages[currentIdx].n,
    currentStage: stages[currentIdx],
    totalStages: total,
    allCompleted,
  };
}
