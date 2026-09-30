/**
 * Integration Phase 0 — read-side compatibility for analysisRecords written
 * before the six-domain id migration (team update 2026-09-24).
 *
 * The migration renamed every detector's persisted `analysisMode` string
 * (e.g. mediapipe_le05_sit_to_stand -> mediapipe_f01_04_sit_to_stand). Old
 * Firestore / localStorage records keep their old string; without this map
 * they would no longer match any result renderer. Records are NEVER
 * rewritten in storage — analysisService maps them on read only.
 *
 * Generated from git: every `*_ANALYSIS_MODE` constant that differs between
 * ddd96f7 (pre-migration) and the team-update commit (35 renames).
 */
export const LEGACY_ANALYSIS_MODE_MAP = Object.freeze({
  "mediapipe_ad02_bedside_sit_up": "mediapipe_f03_01_bedside_sit_up",
  "mediapipe_ad04_floor_object_pickup": "mediapipe_f03_02_floor_object_pickup",
  "mediapipe_ad05_turning_walk": "mediapipe_f03_03_turning_walk",
  "mediapipe_ak01_ankle_dorsiflexion": "mediapipe_f06_05_ankle_dorsiflexion",
  "mediapipe_ak02_ankle_plantarflexion": "mediapipe_f06_06_ankle_plantarflexion",
  "mediapipe_ak03_ankle_inversion": "mediapipe_f06_07_ankle_inversion",
  "mediapipe_ak04_ankle_eversion": "mediapipe_f06_08_ankle_eversion",
  "mediapipe_ak05_double_calf_raise": "mediapipe_f01_17_double_calf_raise",
  "mediapipe_ak06_double_toe_raise": "mediapipe_f01_18_double_toe_raise",
  "mediapipe_ak07_single_leg_calf_raise": "mediapipe_f01_19_single_leg_calf_raise",
  "mediapipe_ak08_single_leg_toe_raise": "mediapipe_f01_20_single_leg_toe_raise",
  "mediapipe_ak09_heel_walk": "mediapipe_f04_07_heel_walk",
  "mediapipe_ak10_toe_walk": "mediapipe_f04_08_toe_walk",
  "mediapipe_ak11_forward_weight_shift": "mediapipe_f03_06_forward_weight_shift",
  "mediapipe_ak12_lateral_weight_shift": "mediapipe_f03_07_lateral_weight_shift",
  "mediapipe_ak13_single_leg_ankle_stability": "mediapipe_f02_04_single_leg_ankle_stability",
  "mediapipe_ak15_single_leg_forward_reach": "mediapipe_f02_08_single_leg_forward_reach",
  "mediapipe_cr01_plank": "mediapipe_f03_09_plank",
  "mediapipe_cr02_crunch": "mediapipe_f03_10_crunch",
  "mediapipe_cr05_seated_knee_raise": "mediapipe_f01_09_seated_knee_raise",
  "mediapipe_cr06_alternating_heel_tap": "mediapipe_f03_11_alternating_heel_tap",
  "mediapipe_cr07_supine_knee_sway": "mediapipe_f06_04_supine_knee_sway",
  "mediapipe_hp01_straight_leg_raise": "mediapipe_f01_08_straight_leg_raise",
  "mediapipe_hp02_standing_hip_flexion": "mediapipe_f01_11_standing_hip_flexion",
  "mediapipe_hp03_standing_hip_extension": "mediapipe_f01_12_standing_hip_extension",
  "mediapipe_hp04_side_lying_hip_abduction": "mediapipe_f01_13_side_lying_hip_abduction",
  "mediapipe_hp05_side_lying_hip_adduction": "mediapipe_f01_14_side_lying_hip_adduction",
  "mediapipe_hp06_clamshell": "mediapipe_f01_15_clamshell",
  "mediapipe_hp07_fire_hydrant": "mediapipe_f01_16_fire_hydrant",
  "mediapipe_hp08_lateral_step": "mediapipe_f03_05_lateral_step",
  "mediapipe_hp09_monster_walk": "mediapipe_f03_08_monster_walk",
  "mediapipe_kn03_seated_knee_extension": "mediapipe_f01_06_seated_knee_extension",
  "mediapipe_le03_bridge": "mediapipe_f01_10_bridge",
  "mediapipe_le05_sit_to_stand": "mediapipe_f01_04_sit_to_stand",
  "mediapipe_sh01_shoulder_pendulum": "mediapipe_f06_01_shoulder_pendulum",
});

/** Current analysisMode for a possibly-legacy one (unknown / current values pass through unchanged). */
export function resolveAnalysisMode(analysisMode) {
  return (analysisMode && LEGACY_ANALYSIS_MODE_MAP[analysisMode]) || analysisMode;
}

/**
 * Returns the record with a current `analysisMode`. A legacy record comes
 * back as a shallow copy that also carries `legacyAnalysisMode` (the stored
 * value); every other record is returned as-is (same object).
 */
export function normalizeAnalysisRecord(record) {
  if (!record || !record.analysisMode) return record;
  const current = LEGACY_ANALYSIS_MODE_MAP[record.analysisMode];
  return current ? { ...record, analysisMode: current, legacyAnalysisMode: record.analysisMode } : record;
}
