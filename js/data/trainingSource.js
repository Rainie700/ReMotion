/**
 * Cross-Module Integration I-1 — training source vocabulary (pure, no imports),
 * shared by analysisService (write-time validation) and trainingEventService
 * (read-time normalization). See trainingEventService.js for the model.
 */

export const TRAINING_SOURCE_TYPE = Object.freeze({
  THERAPIST: "therapist",
  REMOTION: "remotion",
  SELF: "self",
  LEGACY_UNKNOWN: "legacy_unknown",
});

export const TRAINING_SOURCE_SUBTYPE = Object.freeze({
  THERAPIST_PLAN: "therapist_plan",
  F01_CYCLE: "f01_cycle",
  F01_RECOMMENDATION: "f01_recommendation",
  LEGACY_REMOTION_RECOMMENDATION: "legacy_remotion_recommendation",
  SELF_SELECTED: "self_selected",
  LEGACY_UNKNOWN: "legacy_unknown",
});

/** User-facing names (one vocabulary for every page). */
export const TRAINING_SOURCE_LABEL = Object.freeze({
  therapist: "復健師安排",
  remotion: "ReMotion 建議",
  self: "自主練習",
  legacy_unknown: "既有訓練",
});

const SUBTYPES_BY_TYPE = {
  therapist: ["therapist_plan"],
  remotion: ["f01_cycle", "f01_recommendation", "legacy_remotion_recommendation"],
  self: ["self_selected"],
  legacy_unknown: ["legacy_unknown"],
};

/** A source pair is valid only when the subtype belongs to the type. */
export function isValidTrainingSource(sourceType, sourceSubtype) {
  return !!SUBTYPES_BY_TYPE[sourceType] && SUBTYPES_BY_TYPE[sourceType].includes(sourceSubtype);
}
