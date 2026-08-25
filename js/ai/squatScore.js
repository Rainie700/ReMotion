import { SQUAT_SCORE_RULES } from "./squatConstants.js";
import { SQUAT_QUALITY_ISSUE_LABELS } from "./squatQuality.js";

/**
 * Phase 5.4.2 — pure percentage helper used by the Result Page (report
 * section 9/10) so "quality ratio" is computed the same, testable way
 * everywhere it's shown. Returns null (never a fabricated 0%) when there
 * are no completed reps to compute a ratio from.
 */
export function calculateQualityRatioPercent(totalReps, qualityValidReps) {
  if (!totalReps || totalReps <= 0) return null;
  return Math.round(((qualityValidReps || 0) / totalReps) * 100);
}

/**
 * Phase 5.4.3 — Progress Ring ratio (report section 3): a plain 0-1 value,
 * clamped so an over-completed session (more reps than target) still shows
 * a full ring instead of overshooting the SVG stroke math.
 */
export function calculateProgressRatio(completedReps, targetReps) {
  if (!targetReps || targetReps <= 0) return 0;
  return Math.min(1, Math.max(0, (completedReps || 0) / targetReps));
}

/**
 * Rule-based (not ML) scoring from a squat session summary. Pure function —
 * same summary always yields the same score, no fixed/fabricated numbers.
 *
 * Phase 5.3 note: this is a PROTOTYPE MOVEMENT QUALITY SCORE, not a medical,
 * clinical, or diagnostic score. Every penalty weight in SQUAT_SCORE_RULES
 * is a Category D product/prototype assumption (see the Phase 5.3 report's
 * Rule Classification table) — there is no published instrument this
 * formula is trying to reproduce. Before Phase 5.3, insufficientDepthCount
 * was structurally unreachable (a state-machine/threshold conflict meant a
 * completed rep could never be flagged depth-insufficient), which is very
 * likely why real-device testing saw near-automatic 100/100 scores. That
 * conflict is now fixed upstream in squatSession.js/squatQuality.js — this
 * formula itself is unchanged.
 */
export function calculateSquatScore(summary, rules = SQUAT_SCORE_RULES) {
  const target = summary.targetReps || 0;
  const totalReps = summary.totalReps || 0;

  let score = rules.BASE_SCORE;
  score -= (summary.insufficientDepthCount || 0) * rules.DEPTH_INSUFFICIENT_PENALTY;
  score -= (summary.trunkLeanCount || 0) * rules.TRUNK_LEAN_PENALTY;
  score -= (summary.kneeValgusCount || 0) * rules.KNEE_VALGUS_PENALTY;
  const missingReps = Math.max(0, target - totalReps);
  score -= missingReps * rules.MISSING_REP_PENALTY;

  score = Math.max(rules.MIN_SCORE, Math.min(rules.MAX_SCORE, Math.round(score)));

  const grade = rules.GRADE_THRESHOLDS.find((g) => score >= g.min) || rules.GRADE_THRESHOLDS[rules.GRADE_THRESHOLDS.length - 1];

  return { score, quality: grade.label };
}

/**
 * Builds a short remark string from the same summary the score came from —
 * never a fixed sentence, always reflects what actually happened.
 */
export function buildSquatRemark(summary) {
  const notes = [];
  if (summary.totalReps === 0) {
    return "本次未偵測到完整的深蹲動作，請確認全身入鏡後再次嘗試。";
  }
  if ((summary.insufficientDepthCount || 0) > 0) {
    notes.push(`下蹲深度可再增加（${summary.insufficientDepthCount} 次深度不足）`);
  }
  if ((summary.trunkLeanCount || 0) > 0) {
    notes.push(`軀幹前傾較多，請注意保持穩定（${summary.trunkLeanCount} 次）`);
  }
  if ((summary.kneeValgusCount || 0) > 0) {
    notes.push(`膝蓋方向需注意，請保持與腳尖一致（${summary.kneeValgusCount} 次）`);
  }
  if (summary.totalReps < summary.targetReps) {
    notes.push(`僅完成 ${summary.totalReps}/${summary.targetReps} 次，建議下次嘗試完成全部次數`);
  }
  if (!notes.length) {
    notes.push("整體表現穩定，動作品質良好");
  }
  return notes.join("；") + "。";
}

/**
 * Phase 5.3 — session-result explainability (report section 15): answers
 * "why did I get this result" in one short sentence using only real counts
 * from the summary, never a fixed template. Distinct from buildSquatRemark()
 * (which gives actionable advice) — this states what was actually measured.
 */
export function buildSquatQualityExplanation(summary) {
  const totalReps = summary.totalReps || 0;
  const qualityValidReps = summary.qualityValidReps ?? summary.validReps ?? 0;
  if (totalReps === 0) {
    return "本次未偵測到完整的深蹲動作。";
  }
  const issueParts = [];
  if ((summary.insufficientDepthCount || 0) > 0) {
    issueParts.push(`${summary.insufficientDepthCount} 次${SQUAT_QUALITY_ISSUE_LABELS.insufficient_depth}`);
  }
  if ((summary.trunkLeanCount || 0) > 0) {
    issueParts.push(`${summary.trunkLeanCount} 次${SQUAT_QUALITY_ISSUE_LABELS.excessive_trunk_lean}`);
  }
  if ((summary.kneeValgusCount || 0) > 0) {
    issueParts.push(`${summary.kneeValgusCount} 次${SQUAT_QUALITY_ISSUE_LABELS.knee_valgus_suspected}`);
  }
  let text = `本次完成 ${totalReps} 次，其中 ${qualityValidReps} 次符合目前動作品質條件。`;
  text += issueParts.length ? `主要提醒：${issueParts.join("，")}。` : "";
  if ((summary.repsWithTrackingGap || 0) > 0) {
    text += `另有 ${summary.repsWithTrackingGap} 次過程中偵測曾短暫中斷，判定僅供參考。`;
  }
  return text;
}
