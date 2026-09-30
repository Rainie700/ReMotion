import { exerciseService, resolvePoseAnalyzer } from "./exerciseService.js";
import { resolveExerciseMedia } from "./exerciseAssets.js";

/**
 * Core Mobile UX — the ONE presentation adapter for every catalog exercise
 * (all six domains). It only REORGANISES what the exercise database already
 * contains; it never adds medical content:
 *   - a missing / "待補" / "unspecified" field becomes null or [] and the UI
 *     hides that block (or shows its neutral empty text);
 *   - list fields are split on the separators the data itself uses
 *     (line breaks, 「→」, 、，,；) — the words are the database's words.
 * Nothing here decides anything about training, scoring or completion.
 */

export const EXERCISE_DOMAIN_ICONS = Object.freeze({
  "下肢功能": "/images/icon_body_lower_limb.png",
  "平衡": "/images/icon_goal_balance.png",
  "功能性移動": "/images/icon_body_daily_function.png",
  "步行功能": "/images/icon_goal_mobility.png",
  "上肢功能": "/images/icon_body_shoulder.png",
  "柔軟度／活動能力": "/images/icon_body_core.png",
});
const PLACEHOLDER_ICON = "/images/icon_body_lower_limb.png";

export function cleanExerciseText(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "待補" || s === "unspecified" || s === "-") return null;
  return s;
}

/** Splits a database text field into items using only its own separators. */
export function splitExerciseText(value) {
  const s = cleanExerciseText(value);
  if (!s) return [];
  let parts = s.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) parts = s.split(/\s*(?:→|->|⇒)\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 2) parts = s.split(/[、，,；;]/).map((p) => p.trim()).filter(Boolean);
  if (!parts.length) parts = [s];
  return parts.map((p) => p.replace(/^(?:\d+[.、)）]|[①-⑳])\s*/, "").trim()).filter(Boolean);
}

/** Angle criteria keep 「0°→90°」 ranges intact: split on lines / 「；」 only. */
function splitAngleText(value) {
  const s = cleanExerciseText(value);
  if (!s) return [];
  return s.split(/\n+|[；;]/).map((p) => p.trim()).filter(Boolean);
}

/** "Compensated：膝內夾/前傾" line of cnn_label -> ["膝內夾", "前傾"] (what the pose model flags). */
function compensationLabels(cnnLabel) {
  const s = cleanExerciseText(cnnLabel);
  if (!s) return [];
  const line = s.split(/\n+/).find((l) => /^compensated\s*[：:]/i.test(l.trim()));
  if (!line) return [];
  return line.replace(/^compensated\s*[：:]\s*/i, "").split(/[\/、，,]/).map((p) => p.trim()).filter(Boolean);
}

const toCount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/**
 * Dose from the plan item the user is looking at (therapist schedule entry or
 * the page context built from catalog defaults); catalog defaults otherwise.
 */
export function buildExerciseDosage(raw, planItem = null) {
  const durationBased = raw && raw.measurementType === "duration";
  const sets = toCount(planItem && planItem.sets) ?? toCount(raw && raw.defaultSets);
  const reps = toCount(planItem && planItem.repetitions) ?? (durationBased ? null : toCount(raw && raw.defaultRepetitions));
  const seconds = toCount(planItem && planItem.durationSeconds) ?? (durationBased ? toCount(raw && raw.defaultDurationSeconds) : null);
  const amount = reps ? `${reps} 次` : seconds ? `${seconds} 秒` : null;
  const text = [sets ? `${sets} 組` : null, amount].filter(Boolean).join(" × ") || null;
  return { sets, reps, seconds, text };
}

/**
 * @param {object|string} exerciseOrId raw catalog record (or its id)
 * @param {{ planItem?: object, sourceLabel?: string }} [options]
 */
export function buildExerciseExperience(exerciseOrId, { planItem = null, sourceLabel = null } = {}) {
  const raw = typeof exerciseOrId === "string" ? exerciseService.getById(exerciseOrId) : exerciseOrId;
  if (!raw) return null;
  const id = raw.exercise_id || raw.exerciseId || raw.id || null;
  const domainLabel = cleanExerciseText(raw.category);
  const aiSupported = resolvePoseAnalyzer(raw) !== null;
  const media = resolveExerciseMedia(id, raw);
  return {
    id,
    name: cleanExerciseText(raw.exercise_name || raw.name) || (planItem && planItem.exerciseName) || id,
    domain: { key: /^F0\d/.test(String(id)) ? String(id).slice(0, 3) : null, label: domainLabel },
    difficulty: cleanExerciseText(raw.difficulty),
    description: cleanExerciseText(raw.description),
    dosage: buildExerciseDosage(raw, planItem),
    media: { ...media, placeholderIcon: EXERCISE_DOMAIN_ICONS[domainLabel] || PLACEHOLDER_ICON },
    aiSupported,
    aiAnalysisItems: aiSupported
      ? {
          bodyPoints: splitExerciseText(raw.key_points),
          angleChecks: splitAngleText(raw.correct_angle),
          reminders: compensationLabels(raw.cnn_label),
        }
      : { bodyPoints: [], angleChecks: [], reminders: [] },
    instructions: splitExerciseText(raw.steps),
    commonMistakes: splitExerciseText(raw.common_errors),
    precautions: splitExerciseText(raw.precautions),
    targetMuscles: splitExerciseText(raw.target_muscle),
    cameraGuidance: cleanExerciseText(raw.cameraAngle),
    sourceLabel,
  };
}
