import { isTrainingDateInCycle, toLocalDateKey } from "./trackingCycle.js";
import { buildTrainingAttempt } from "./f01DailyTargets.js";
import { describePlanVolume, formatPlanVolume } from "../ui/f01RecommendationView.js";

export const INCOMPLETE_REASON_LABELS = Object.freeze({ no_time: "沒時間", too_hard: "太吃力", discomfort: "感到不舒服", recognition_problem: "動作辨識有問題", save_problem: "紀錄儲存有問題", not_practiced: "今天沒有練習", in_progress: "今天還在進行中", other: "其他原因", unknown: "不確定" });
const short = (v, max = 100) => typeof v === "string" ? v.slice(0, max) : "";
const number = v => Number.isFinite(v) && v >= 0 ? v : null;
export function progressFingerprint(progress) { return progress ? JSON.stringify(progress) : ""; }

// A read-only account of data currently loaded on this device. Never freezes
// targets, credits completion, sums attempts into sets, or manufactures a score.
export function buildIncompleteTrainingProgress({ patientId, dateKey, cycle, recommendation, records = [], getCatalog = () => null }) {
  if (!cycle || cycle.userId !== patientId || cycle.patientId !== patientId || cycle.reassessmentId || !isTrainingDateInCycle(cycle, dateKey)) return null;
  if (!recommendation || recommendation.patientId !== patientId || recommendation.id !== cycle.recommendationId) return null;
  const entry = cycle.dailyTrainingProgress?.[dateKey];
  const required = [...new Set(entry ? entry.requiredExerciseIds || [] : (recommendation.items || []).map(x => x.exerciseId))];
  if (!required.length) return null;
  const completed = new Set((entry?.completedExerciseIds || []).filter(id => required.includes(id)));
  const attempts = [...new Map(records.filter(r => r.id && r.patientId === patientId && r.sourceSubtype === "f01_cycle" && r.trackingCycleId === cycle.id && r.recommendationId === cycle.recommendationId && required.includes(r.exerciseId)
    && (r.planDateKey || toLocalDateKey(r.completedAt || r.createdAt)) === dateKey).map(r => [r.id, r])).values()];
  const items = required.slice(0, 6).map(exerciseId => {
    const raw = getCatalog(exerciseId);
    const planItem = (recommendation.items || []).find(x => x.exerciseId === exerciseId);
    const target = entry?.targetsStatus === "frozen_before_training" ? entry.targets?.[exerciseId] : null;
    const frozen = !!target;
    const targetText = target ? `${target.sets?.value ?? "?"} 組 × ${target.repsPerSet?.value ?? "?"} 次${target.planCountingBasis === "per_side" ? "（每側）" : ""}` : formatPlanVolume(describePlanVolume(raw, planItem?.dose)) || "目標量未提供";
    const saved = attempts.filter(r => r.exerciseId === exerciseId).sort((a, b) => String(b.completedAt || b.createdAt || "").localeCompare(String(a.completedAt || a.createdAt || "")));
    return { exerciseId, name: short(planItem?.exerciseName || raw?.name || exerciseId, 60), targetText: short(targetText), targetBasis: frozen ? "frozen" : "current_plan_unfrozen", completed: completed.has(exerciseId), savedAttemptCount: saved.length,
      attempts: saved.slice(0, 3).map(r => {
        const actual = buildTrainingAttempt(r, { targetRef: null, writtenAt: null }).actual;
        return { recordId: short(r.id, 128), totalReps: number(actual.totalReps), leftReps: number(actual.leftReps), rightReps: number(actual.rightReps) };
      }) };
  });
  const progress = { schemaVersion: "incomplete-training-context-1", source: "device_loaded_records", cycleId: cycle.id, recommendationId: recommendation.id, dateKey, snapshotted: !!entry, requiredCount: required.length, completedCount: completed.size, savedAttemptCount: attempts.length, omittedItemCount: required.length - items.length, items };
  // Bound the append-only document size; report how many rows were omitted.
  while (new TextEncoder().encode(JSON.stringify(progress)).length > 4000 && progress.items.length) { progress.items.pop(); progress.omittedItemCount++; }
  return progress;
}
