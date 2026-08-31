import { rehabExercises } from "./rehabExercises.js";
import { PHASE1_TEST_EXERCISE_GOALS, PHASE1_TEST_EXERCISE_IDS } from "./phase1SchemaTestData.js";

/**
 * The real exercise_id for "深蹲" in rehabExercises.js (Excel-derived catalog).
 * Only this exercise is allowed into the real MediaPipe detection flow —
 * every other exercise still uses the demo/placeholder detection prep page.
 */
export const SQUAT_EXERCISE_ID = "LE01";

/**
 * Identifies whether a given exercise (in either the catalog's snake_case
 * shape or a schedule exercise's camelCase shape) is the squat exercise.
 * Checked by id first (authoritative), then falls back to name/cnn_label
 * text matching so it still works if only a partial object is passed in.
 */
export function isSquatExercise(exercise) {
  if (!exercise) return false;
  const id = exercise.exercise_id || exercise.exerciseId || exercise.id || "";
  if (id === SQUAT_EXERCISE_ID) return true;
  const name = exercise.exercise_name || exercise.exerciseName || "";
  if (name.includes("深蹲")) return true;
  const cnnLabel = exercise.cnn_label || "";
  if (cnnLabel.includes("深蹲")) return true;
  return false;
}

/**
 * The real exercise_id for "站姿髖屈曲" (HP02) — the second real Pose
 * Analysis prototype (Phase 5.6.1).
 */
export const HP02_EXERCISE_ID = "HP02";
export const CR01_EXERCISE_ID = "CR01";
export const CR02_EXERCISE_ID = "CR02";
export const CR03_EXERCISE_ID = "CR03";
export const CR04_EXERCISE_ID = "CR04";
export const CR05_EXERCISE_ID = "CR05";
export const CR06_EXERCISE_ID = "CR06";
export const CR07_EXERCISE_ID = "CR07";
export const CR08_EXERCISE_ID = "CR08";
export const KN03_EXERCISE_ID = "KN03";
export const LE05_EXERCISE_ID = "LE05";
export const LE03_EXERCISE_ID = "LE03";
export const LE04_EXERCISE_ID = "LE04";
export const LE06_EXERCISE_ID = "LE06";
export const LE07_EXERCISE_ID = "LE07";
export const SH01_EXERCISE_ID = "SH01";
export const SH02_EXERCISE_ID = "SH02";
export const SH03_EXERCISE_ID = "SH03";
export const SH04_EXERCISE_ID = "SH04";
export const SH05_EXERCISE_ID = "SH05";
export const SH06_EXERCISE_ID = "SH06";
export const SH07_EXERCISE_ID = "SH07";
export const HP04_EXERCISE_ID = "HP04";
export const HP05_EXERCISE_ID = "HP05";
export const HP06_EXERCISE_ID = "HP06";
export const LE02_EXERCISE_ID = "LE02";
export const HP01_EXERCISE_ID = "HP01";
export const HP03_EXERCISE_ID = "HP03";
export const HP07_EXERCISE_ID = "HP07";
export const HP08_EXERCISE_ID = "HP08";
export const HP09_EXERCISE_ID = "HP09";
export const HP10_EXERCISE_ID = "HP10";
export const AD01_EXERCISE_ID = "AD01";
export const AD02_EXERCISE_ID = "AD02";
export const AD03_EXERCISE_ID = "AD03";
export const AD04_EXERCISE_ID = "AD04";
export const AD05_EXERCISE_ID = "AD05";
export const AD06_EXERCISE_ID = "AD06";
export const AD07_EXERCISE_ID = "AD07";
export const AD08_EXERCISE_ID = "AD08";
export const AD09_EXERCISE_ID = "AD09";
export const AD10_EXERCISE_ID = "AD10";
export const AD11_EXERCISE_ID = "AD11";
export const AD12_EXERCISE_ID = "AD12";
export const AK01_EXERCISE_ID = "AK01";
export const AK02_EXERCISE_ID = "AK02";
export const AK03_EXERCISE_ID = "AK03";
export const AK04_EXERCISE_ID = "AK04";
export const AK05_EXERCISE_ID = "AK05";
export const AK06_EXERCISE_ID = "AK06";
export const AK07_EXERCISE_ID = "AK07";
export const AK08_EXERCISE_ID = "AK08";
export const AK09_EXERCISE_ID = "AK09";
export const AK10_EXERCISE_ID = "AK10";

/**
 * ReMotion Phase 5.6.1 — which real Camera/MediaPipe pose analyzer (if any)
 * a given exercise should be routed to. Deliberately a NEW, separate
 * concept from isSquatExercise()/aiSupported: those two already have real
 * consumers (normalizeExercise()'s aiSupported/gameSupportPlanned fields,
 * which the Recommendation Engine reads) that must not change behavior
 * this phase, so this function does not replace or wrap them — it's an
 * additional, additive lookup asking "which detector pipeline does this
 * exercise use", not "is this exercise the squat".
 *
 * Deliberately NOT keyed on trainingMode ("guided" is not "has Pose
 * Analysis" — see the Phase 5.5 catalog audit: all 43 non-squat exercises
 * are currently "guided", and that must stay true for everything except
 * the specific exercises actually wired to a real detector below).
 */
export const POSE_ANALYZER = {
  SQUAT: "squat",
  HP02_HIP_FLEXION: "hp02_hip_flexion",
  CR01_PLANK: "cr01_plank",
  CR02_CRUNCH: "cr02_crunch",
  CR03_PELVIC_TILT: "cr03_pelvic_tilt",
  CR04_SEATED_CORE: "cr04_seated_core",
  CR05_SEATED_KNEE_RAISE: "cr05_seated_knee_raise",
  CR06_HEEL_TAP: "cr06_heel_tap",
  CR07_KNEE_SWAY: "cr07_knee_sway",
  CR08_ANTI_ROTATION: "cr08_anti_rotation",
  KN03_SEATED_KNEE_EXTENSION: "kn03_seated_knee_extension",
  LE05_SIT_TO_STAND: "le05_sit_to_stand",
  LE03_BRIDGE: "le03_bridge",
  LE04_SIDE_LEG_RAISE: "le04_side_leg_raise",
  LE06_BALANCE: "le06_balance",
  LE07_CALF_RAISE: "le07_calf_raise",
  SH01_SHOULDER_PENDULUM: "sh01_shoulder_pendulum",
  SH02_EXTERNAL_ISOMETRIC: "sh02_external_isometric",
  SH03_INTERNAL_ISOMETRIC: "sh03_internal_isometric",
  SH04_ABDUCTION_ISOMETRIC: "sh04_abduction_isometric",
  SH05_ADDUCTION_ISOMETRIC: "sh05_adduction_isometric",
  SH06_EXTENSION_ISOMETRIC: "sh06_extension_isometric",
  SH07_FLEXION_ISOMETRIC: "sh07_flexion_isometric",
  HP04_HIP_ABDUCTION: "hp04_hip_abduction",
  HP05_HIP_ADDUCTION: "hp05_hip_adduction",
  HP06_CLAMSHELL: "hp06_clamshell",
  LE02_STRAIGHT_LEG_RAISE: "le02_straight_leg_raise",
  HP01_STRAIGHT_LEG_RAISE: "hp01_straight_leg_raise",
  HP03_STANDING_HIP_EXTENSION: "hp03_standing_hip_extension",
  HP07_FIRE_HYDRANT: "hp07_fire_hydrant",
  HP08_LATERAL_STEP: "hp08_lateral_step",
  HP09_MONSTER_WALK: "hp09_monster_walk",
  HP10_SINGLE_LEG_HIP_STABILITY: "hp10_single_leg_hip_stability",
  AD01_BED_ROLLING: "ad01_bed_rolling",
  AD02_BEDSIDE_SIT_UP: "ad02_bedside_sit_up",
  AD03_SHOE_DRESSING: "ad03_shoe_dressing",
  AD04_FLOOR_OBJECT_PICKUP: "ad04_floor_object_pickup",
  AD05_TURNING_WALK: "ad05_turning_walk",
  AD06_STAIR_ASCENT: "ad06_stair_ascent",
  AD07_STAIR_DESCENT: "ad07_stair_descent",
  AD08_DOOR_PUSH: "ad08_door_push",
  AD09_DOOR_PULL: "ad09_door_pull",
  AD10_CARRY_WALK: "ad10_carry_walk",
  AD11_COAT_DRESSING: "ad11_coat_dressing",
  AD12_COAT_UNDRESSING: "ad12_coat_undressing",
  AK01_ANKLE_DORSIFLEXION: "ak01_ankle_dorsiflexion",
  AK02_ANKLE_PLANTARFLEXION: "ak02_ankle_plantarflexion",
  AK03_ANKLE_INVERSION: "ak03_ankle_inversion",
  AK04_ANKLE_EVERSION: "ak04_ankle_eversion",
  AK05_DOUBLE_CALF_RAISE: "ak05_double_calf_raise",
  AK06_DOUBLE_TOE_RAISE: "ak06_double_toe_raise",
  AK07_SINGLE_LEG_CALF_RAISE: "ak07_single_leg_calf_raise",
  AK08_SINGLE_LEG_TOE_RAISE: "ak08_single_leg_toe_raise",
  AK09_HEEL_WALK: "ak09_heel_walk",
  AK10_TOE_WALK: "ak10_toe_walk",
};

export function resolvePoseAnalyzer(exercise) {
  if (!exercise) return null;
  if (isSquatExercise(exercise)) return POSE_ANALYZER.SQUAT;
  const id = exercise.exercise_id || exercise.exerciseId || exercise.id || "";
  if (id === HP02_EXERCISE_ID) return POSE_ANALYZER.HP02_HIP_FLEXION;
  if (id === CR01_EXERCISE_ID) return POSE_ANALYZER.CR01_PLANK;
  if (id === CR02_EXERCISE_ID) return POSE_ANALYZER.CR02_CRUNCH;
  if (id === CR03_EXERCISE_ID) return POSE_ANALYZER.CR03_PELVIC_TILT;
  if (id === CR04_EXERCISE_ID) return POSE_ANALYZER.CR04_SEATED_CORE;
  if (id === CR05_EXERCISE_ID) return POSE_ANALYZER.CR05_SEATED_KNEE_RAISE;
  if (id === CR06_EXERCISE_ID) return POSE_ANALYZER.CR06_HEEL_TAP;
  if (id === CR07_EXERCISE_ID) return POSE_ANALYZER.CR07_KNEE_SWAY;
  if (id === CR08_EXERCISE_ID) return POSE_ANALYZER.CR08_ANTI_ROTATION;
  if (id === KN03_EXERCISE_ID) return POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION;
  if (id === LE05_EXERCISE_ID) return POSE_ANALYZER.LE05_SIT_TO_STAND;
  if (id === LE03_EXERCISE_ID) return POSE_ANALYZER.LE03_BRIDGE;
  if (id === LE04_EXERCISE_ID) return POSE_ANALYZER.LE04_SIDE_LEG_RAISE;
  if (id === LE06_EXERCISE_ID) return POSE_ANALYZER.LE06_BALANCE;
  if (id === LE07_EXERCISE_ID) return POSE_ANALYZER.LE07_CALF_RAISE;
  if (id === SH01_EXERCISE_ID) return POSE_ANALYZER.SH01_SHOULDER_PENDULUM;
  if (id === SH02_EXERCISE_ID) return POSE_ANALYZER.SH02_EXTERNAL_ISOMETRIC;
  if (id === SH03_EXERCISE_ID) return POSE_ANALYZER.SH03_INTERNAL_ISOMETRIC;
  if (id === SH04_EXERCISE_ID) return POSE_ANALYZER.SH04_ABDUCTION_ISOMETRIC;
  if (id === SH05_EXERCISE_ID) return POSE_ANALYZER.SH05_ADDUCTION_ISOMETRIC;
  if (id === SH06_EXERCISE_ID) return POSE_ANALYZER.SH06_EXTENSION_ISOMETRIC;
  if (id === SH07_EXERCISE_ID) return POSE_ANALYZER.SH07_FLEXION_ISOMETRIC;
  if (id === HP04_EXERCISE_ID) return POSE_ANALYZER.HP04_HIP_ABDUCTION;
  if (id === HP05_EXERCISE_ID) return POSE_ANALYZER.HP05_HIP_ADDUCTION;
  if (id === HP06_EXERCISE_ID) return POSE_ANALYZER.HP06_CLAMSHELL;
  if (id === LE02_EXERCISE_ID) return POSE_ANALYZER.LE02_STRAIGHT_LEG_RAISE;
  if (id === HP01_EXERCISE_ID) return POSE_ANALYZER.HP01_STRAIGHT_LEG_RAISE;
  if (id === HP03_EXERCISE_ID) return POSE_ANALYZER.HP03_STANDING_HIP_EXTENSION;
  if (id === HP07_EXERCISE_ID) return POSE_ANALYZER.HP07_FIRE_HYDRANT;
  if (id === HP08_EXERCISE_ID) return POSE_ANALYZER.HP08_LATERAL_STEP;
  if (id === HP09_EXERCISE_ID) return POSE_ANALYZER.HP09_MONSTER_WALK;
  if (id === HP10_EXERCISE_ID) return POSE_ANALYZER.HP10_SINGLE_LEG_HIP_STABILITY;
  if (id === AD01_EXERCISE_ID) return POSE_ANALYZER.AD01_BED_ROLLING;
  if (id === AD02_EXERCISE_ID) return POSE_ANALYZER.AD02_BEDSIDE_SIT_UP;
  if (id === AD03_EXERCISE_ID) return POSE_ANALYZER.AD03_SHOE_DRESSING;
  if (id === AD04_EXERCISE_ID) return POSE_ANALYZER.AD04_FLOOR_OBJECT_PICKUP;
  if (id === AD05_EXERCISE_ID) return POSE_ANALYZER.AD05_TURNING_WALK;
  if (id === AD06_EXERCISE_ID) return POSE_ANALYZER.AD06_STAIR_ASCENT;
  if (id === AD07_EXERCISE_ID) return POSE_ANALYZER.AD07_STAIR_DESCENT;
  if (id === AD08_EXERCISE_ID) return POSE_ANALYZER.AD08_DOOR_PUSH;
  if (id === AD09_EXERCISE_ID) return POSE_ANALYZER.AD09_DOOR_PULL;
  if (id === AD10_EXERCISE_ID) return POSE_ANALYZER.AD10_CARRY_WALK;
  if (id === AD11_EXERCISE_ID) return POSE_ANALYZER.AD11_COAT_DRESSING;
  if (id === AD12_EXERCISE_ID) return POSE_ANALYZER.AD12_COAT_UNDRESSING;
  if (id === AK01_EXERCISE_ID) return POSE_ANALYZER.AK01_ANKLE_DORSIFLEXION;
  if (id === AK02_EXERCISE_ID) return POSE_ANALYZER.AK02_ANKLE_PLANTARFLEXION;
  if (id === AK03_EXERCISE_ID) return POSE_ANALYZER.AK03_ANKLE_INVERSION;
  if (id === AK04_EXERCISE_ID) return POSE_ANALYZER.AK04_ANKLE_EVERSION;
  if (id === AK05_EXERCISE_ID) return POSE_ANALYZER.AK05_DOUBLE_CALF_RAISE;
  if (id === AK06_EXERCISE_ID) return POSE_ANALYZER.AK06_DOUBLE_TOE_RAISE;
  if (id === AK07_EXERCISE_ID) return POSE_ANALYZER.AK07_SINGLE_LEG_CALF_RAISE;
  if (id === AK08_EXERCISE_ID) return POSE_ANALYZER.AK08_SINGLE_LEG_TOE_RAISE;
  if (id === AK09_EXERCISE_ID) return POSE_ANALYZER.AK09_HEEL_WALK;
  if (id === AK10_EXERCISE_ID) return POSE_ANALYZER.AK10_TOE_WALK;
  return null;
}

function toNumberOrNull(value) {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * "待補" ("to be filled in later") is the Excel source's own placeholder
 * text, used across most of the 44 real records for reference_source/
 * demo_video_url. Treated as "no value" rather than passed through as if
 * it were real content — otherwise `if (exercise.video)` would look truthy
 * for a field that is actually empty.
 */
function cleanText(value) {
  if (value == null) return null;
  const s = String(value).trim();
  if (!s || s === "待補") return null;
  return s;
}

/**
 * Converts one raw exercise record — from the real 44-item Excel-derived
 * catalog (snake_case: exercise_id/exercise_name/category/...) or any
 * future import batch that might use different field names — into the
 * ReMotion 2.0 standard Exercise Schema. Pure function: never mutates
 * `raw`, never fabricates data, never re-generates the id.
 *
 * Field mapping (real catalog -> standard schema):
 *   exercise_id        -> id / exerciseId   (passed through verbatim)
 *   exercise_name       -> name
 *   category             -> bodyPart
 *   difficulty            -> difficulty      (kept as-is, original Chinese values — not translated/invented)
 *   defaultDurationSeconds -> duration       (falls back to raw.duration if present)
 *   defaultSets           -> sets            (falls back to raw.sets; the real catalog's raw `sets` is
 *                                              free text like "3組" so the already-cleaned numeric field
 *                                              is always preferred when both exist)
 *   defaultRepetitions     -> reps           (same reasoning — prefers the numeric field over raw.repetitions "10–15次")
 *   steps                 -> instructions
 *   precautions            -> precautions
 *   demo_video_url         -> video          ("待補" placeholder -> null)
 *
 * There is currently no `goal` taxonomy (肌力/活動度/平衡...) anywhere in
 * the real 44-item catalog, so `goal` is only populated when the raw
 * record actually provides one (e.g. a future import) — otherwise null,
 * never guessed.
 */
export function normalizeExercise(raw) {
  if (!raw || typeof raw !== "object") {
    return {
      id: null,
      exerciseId: null,
      name: "",
      bodyPart: null,
      goal: null,
      difficulty: null,
      duration: null,
      sets: null,
      reps: null,
      instructions: null,
      precautions: null,
      aiSupported: false,
      gameSupported: false,
      gameSupportPlanned: false,
      video: null,
      raw: null,
    };
  }

  const id = raw.exercise_id || raw.exerciseId || raw.id || null;
  const aiSupported = isSquatExercise(raw) || id === LE02_EXERCISE_ID || id === HP01_EXERCISE_ID || id === HP03_EXERCISE_ID || id === HP07_EXERCISE_ID || id === HP08_EXERCISE_ID || id === HP09_EXERCISE_ID || id === HP10_EXERCISE_ID || id === AD01_EXERCISE_ID || id === AD02_EXERCISE_ID || id === AD03_EXERCISE_ID || id === AD04_EXERCISE_ID || id === AD05_EXERCISE_ID || id === AD06_EXERCISE_ID || id === AD07_EXERCISE_ID || id === AD08_EXERCISE_ID || id === AD09_EXERCISE_ID || id === AD10_EXERCISE_ID || id === AD11_EXERCISE_ID || id === AD12_EXERCISE_ID || id === AK01_EXERCISE_ID || id === AK02_EXERCISE_ID || id === AK03_EXERCISE_ID || id === AK04_EXERCISE_ID || id === AK05_EXERCISE_ID || id === AK06_EXERCISE_ID || id === AK07_EXERCISE_ID || id === AK08_EXERCISE_ID || id === AK09_EXERCISE_ID || id === AK10_EXERCISE_ID || id === CR01_EXERCISE_ID || id === CR02_EXERCISE_ID || id === CR03_EXERCISE_ID || id === CR04_EXERCISE_ID || id === CR05_EXERCISE_ID || id === CR06_EXERCISE_ID || id === CR07_EXERCISE_ID || id === CR08_EXERCISE_ID || id === KN03_EXERCISE_ID || id === LE05_EXERCISE_ID || id === LE03_EXERCISE_ID || id === LE04_EXERCISE_ID || id === LE06_EXERCISE_ID || id === LE07_EXERCISE_ID || id === SH01_EXERCISE_ID || id === SH02_EXERCISE_ID || id === SH03_EXERCISE_ID || id === SH04_EXERCISE_ID || id === SH05_EXERCISE_ID || id === SH06_EXERCISE_ID || id === SH07_EXERCISE_ID || id === HP04_EXERCISE_ID || id === HP05_EXERCISE_ID || id === HP06_EXERCISE_ID;

  return {
    id,
    exerciseId: id,
    name: raw.exercise_name || raw.name || raw.exerciseName || "",
    bodyPart: raw.category || raw.body_part || raw.bodyPart || null,
    goal: raw.goal || null,
    difficulty: raw.difficulty || raw.difficulty_level || raw.difficultyLevel || null,
    duration: toNumberOrNull(raw.defaultDurationSeconds ?? raw.duration),
    sets: toNumberOrNull(raw.defaultSets ?? raw.sets),
    reps: toNumberOrNull(raw.defaultRepetitions ?? raw.reps ?? raw.repetitions),
    instructions: cleanText(raw.steps) || cleanText(raw.instructions) || null,
    precautions: cleanText(raw.precautions) || cleanText(raw.contraindications) || null,
    // Only 深蹲 (LE01) actually has real MediaPipe detection wired up —
    // reuses the exact same check the live detection flow gates on, so
    // this can never drift from what's really supported.
    aiSupported,
    // "深蹲採水果" is not implemented yet — this must stay false for every
    // exercise so no UI can mistake it for a playable game. gameSupportPlanned
    // separately records design intent (squat is the pilot candidate)
    // without claiming it's built.
    gameSupported: false,
    gameSupportPlanned: isSquatExercise(raw),
    video: cleanText(raw.demo_video_url) || cleanText(raw.video_url) || cleanText(raw.video) || null,
    // Escape hatch back to every original field (cnn_label, correct_angle,
    // angle_tolerance, etc.) for callers that need more than the standard
    // schema without forcing normalizeExercise() to enumerate everything.
    raw,
  };
}

/**
 * rehabExercises is a static, pre-converted catalog (see rehabExercises.js) —
 * it is reference data, not user-generated, so unlike users/schedules/
 * analysisRecords/gameProfiles it is not stored through storageService.
 */
export const exerciseService = {
  list() {
    return rehabExercises;
  },
  getById(exerciseId) {
    return rehabExercises.find((ex) => ex.exercise_id === exerciseId) || null;
  },
  findByCategory(category) {
    return rehabExercises.filter((ex) => ex.category === category);
  },
  findByDifficulty(difficulty) {
    return rehabExercises.filter((ex) => ex.difficulty === difficulty);
  },
  /** Same catalog as list(), converted to the ReMotion 2.0 standard schema. */
  listNormalized() {
    return rehabExercises.map(normalizeExercise);
  },
  getNormalizedById(exerciseId) {
    const raw = exerciseService.getById(exerciseId);
    return raw ? normalizeExercise(raw) : null;
  },
  /**
   * The 9-item Phase 1 schema-compatibility roster (see
   * phase1SchemaTestData.js) — real catalog entries only, with a Phase-1-
   * only manual `goal` tag layered on top of the normal normalizeExercise()
   * output (the real catalog itself has no `goal` field yet).
   */
  getPhase1TestSet() {
    return PHASE1_TEST_EXERCISE_IDS.map((id) => {
      const normalized = exerciseService.getNormalizedById(id);
      return normalized ? { ...normalized, goal: PHASE1_TEST_EXERCISE_GOALS[id] } : null;
    }).filter(Boolean);
  },
  /**
   * ReMotion 2.0 Phase 3 — the full 44-item catalog, normalized, with the
   * Phase 1 manual goal tags layered on top of whichever items don't
   * already carry a real `goal` (today: none of the 44 do, so this
   * overlays goal onto exactly the same 9 ids as getPhase1TestSet()). This
   * is the Recommendation Engine's candidate pool: all 44 remain eligible
   * for bodyPart/difficulty matching, but only the 9 tagged ones can ever
   * score a goal match — never guesses a goal for the other 35.
   *
   * Once a future data import gives normalizeExercise() a real `goal`
   * value for a given id, that real value wins here automatically (the
   * Phase 1 tag is only used as a fallback for items with goal: null) —
   * no changes needed in this function or in the engine when that happens.
   */
  listNormalizedWithKnownGoals() {
    return exerciseService.listNormalized().map((normalized) => {
      if (normalized.goal) return normalized;
      const knownGoal = PHASE1_TEST_EXERCISE_GOALS[normalized.id];
      return knownGoal ? { ...normalized, goal: knownGoal } : normalized;
    });
  },
};

/**
 * Display-only mapping from the real 4-value exercise `difficulty` text
 * (易/普通/非常容易/難) onto the same 3-tier beginner/intermediate/advanced
 * vocabulary used by Patient Assessment's abilityLevel, so the two can be
 * compared directly. Mirrors the tiers behind app.js's difficulty badge
 * system (kept as a single small lookup here so the Recommendation Engine
 * — which must not depend on app.js — has its own source of truth without
 * duplicating logic across modules). Never changes the underlying
 * `difficulty` field.
 */
const DIFFICULTY_TIER_MAP = {
  "非常容易": "beginner",
  "易": "beginner",
  "普通": "intermediate",
  "難": "advanced",
};

export function getDifficultyTier(rawDifficulty) {
  return DIFFICULTY_TIER_MAP[rawDifficulty] || null;
}
