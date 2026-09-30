/**
 * Pure helpers shared by the context builder, validator and fallback of the
 * Grounded LLM Weekly Summary. Everything here READS a VerifiedContextV1; no
 * business value is computed (no 5xSTS, no training days, no decision).
 */
import { formatSeconds } from "../data/trackingComparison.js";

/** "12.8 秒" — the D4 display format (trackingComparison.formatSeconds). */
export const secondsDisplay = (ms) => (Number.isFinite(ms) ? formatSeconds(ms) : null);

/** "少 3.9 秒" / "多 0.4 秒" / "與初次相同" — the 追蹤歷程 difference wording. */
export function differenceDisplay(changeMs) {
  if (!Number.isFinite(changeMs)) return null;
  if (changeMs === 0) return "與初次相同";
  return `${changeMs < 0 ? "少" : "多"} ${(Math.abs(changeMs) / 1000).toFixed(1)} 秒`;
}

/** "2026-10-04" -> "10/04" (same M/D display as the app). */
export const monthDay = (dateKey) => (typeof dateKey === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateKey) ? `${dateKey.slice(5, 7)}/${dateKey.slice(8, 10)}` : null);

const oneDecimal = (ms) => Number((ms / 1000).toFixed(1));

/**
 * Stable evidence fact IDs of a context (only facts that exist — a missing
 * value has no fact, so an output can never cite it).
 * @returns {Map<string, { path: string, value: any }>}
 */
export function buildContextFacts(ctx) {
  const facts = new Map();
  const add = (id, path, value) => { if (value !== null && value !== undefined) facts.set(id, { path, value }); };
  if (!ctx) return facts;
  add("cycle.id", "cycleId", ctx.cycleId);
  add("cycle.week_number", "weekNumber", ctx.weekNumber);
  add("period.start_date", "period.startDate", ctx.period && ctx.period.startDate);
  add("period.end_date", "period.endDate", ctx.period && ctx.period.endDate);
  const fa = ctx.functionalAssessment;
  if (fa) {
    add("assessment.type", "functionalAssessment.assessmentType", fa.assessmentType);
    add("assessment.valid", "functionalAssessment.valid", fa.valid);
    if (fa.valid) {
      add("assessment.baseline", "functionalAssessment.baselineMs", fa.baselineMs);
      add("assessment.reassessment", "functionalAssessment.reassessmentMs", fa.reassessmentMs);
      add("assessment.difference", "functionalAssessment.differenceMs", fa.differenceMs);
    }
  }
  const t = ctx.training || {};
  add("training.completed_days", "training.completedDays", t.completedDays);
  add("training.record_count", "training.formalRecordCount", t.formalRecordCount);
  if (t.aiPostureScoreAvailable) add("training.ai_posture_average", "training.aiPostureAverage", t.aiPostureAverage);
  if (ctx.goal) add("goal.current", "goal.goalId", ctx.goal.goalId);
  (ctx.currentExercises || []).forEach((e, i) => add(`exercise.${e.exerciseId}`, `currentExercises[${i}]`, e.exerciseId));
  const d = ctx.decision;
  if (d) {
    add("decision.rule_outcome", "decision.ruleOutcome", d.ruleOutcome);
    add("decision.confirmation_status", "decision.confirmationStatus", d.confirmationStatus);
    add("decision.confirmed_action", "decision.confirmedAction", d.confirmedAction);
    (d.transitions || []).forEach((tr, i) => add(`transition.${tr.fromExerciseId}`, `decision.transitions[${i}]`, `${tr.fromExerciseId}->${tr.toExerciseId}`));
  }
  const r = ctx.reportedIssues || {};
  add("issues.new_discomfort", "reportedIssues.newDiscomfort", r.newDiscomfort);
  add("issues.new_limitation", "reportedIssues.newLimitation", r.newLimitation);
  add("issues.professional_review", "reportedIssues.professionalReviewRequired", r.professionalReviewRequired);
  return facts;
}

/**
 * Normalized numerical allowlist of a context, by unit kind. schemaVersion is
 * never a source (it is not a measurement). Values only exist when the
 * context has them (a null reassessment adds nothing).
 * @returns {{ seconds:Set<number>, ms:Set<number>, days:Set<number>, records:Set<number>, score:Set<number>, week:Set<number>, count:Set<number>, any:Set<number> }}
 */
export function buildNumberAllowlist(ctx) {
  const k = { seconds: new Set(), ms: new Set(), days: new Set(), records: new Set(), score: new Set(), week: new Set(), count: new Set() };
  const fa = ctx && ctx.functionalAssessment;
  if (fa && fa.valid) {
    for (const ms of [fa.baselineMs, fa.reassessmentMs]) if (Number.isFinite(ms)) { k.ms.add(ms); k.seconds.add(oneDecimal(ms)); }
    if (Number.isFinite(fa.differenceMs)) {
      k.ms.add(fa.differenceMs); k.ms.add(Math.abs(fa.differenceMs));
      k.seconds.add(oneDecimal(fa.differenceMs)); k.seconds.add(oneDecimal(Math.abs(fa.differenceMs)));
    }
  }
  const t = (ctx && ctx.training) || {};
  if (Number.isInteger(t.completedDays)) k.days.add(t.completedDays);
  if (Number.isInteger(t.formalRecordCount)) k.records.add(t.formalRecordCount);
  if (t.aiPostureScoreAvailable && Number.isFinite(t.aiPostureAverage)) k.score.add(t.aiPostureAverage);
  if (ctx && Number.isInteger(ctx.weekNumber)) k.week.add(ctx.weekNumber);
  const exercises = (ctx && ctx.currentExercises) || [];
  if (exercises.length) k.count.add(exercises.length);
  const transitions = (ctx && ctx.decision && ctx.decision.transitions) || [];
  if (transitions.length) k.count.add(transitions.length);
  const any = new Set([...k.seconds, ...k.ms, ...k.days, ...k.records, ...k.score, ...k.week, ...k.count]);
  return { ...k, any };
}

/** Dates a summary may mention: the context's period (as YYYY-MM-DD). */
export function buildDateAllowlist(ctx) {
  const out = new Set();
  const p = (ctx && ctx.period) || {};
  for (const d of [p.startDate, p.endDate]) if (typeof d === "string") out.add(d);
  return out;
}

/** Every exercise (id -> name) the context mentions: current exercises + both ends of each transition. */
export function contextExercises(ctx) {
  const map = new Map();
  for (const e of (ctx && ctx.currentExercises) || []) map.set(e.exerciseId, e.name);
  for (const t of (ctx && ctx.decision && ctx.decision.transitions) || []) {
    map.set(t.fromExerciseId, t.fromName);
    map.set(t.toExerciseId, t.toName);
  }
  return map;
}
