import { rehabExercises } from "./rehabExercises.js";
import { PHASE1_TEST_EXERCISE_GOALS, PHASE1_TEST_EXERCISE_IDS } from "./phase1SchemaTestData.js";

const LEGACY_EXERCISE_ID_MAP = new Map(
  rehabExercises
    .filter((exercise) => exercise.legacy_exercise_id)
    .map((exercise) => [exercise.legacy_exercise_id, exercise.exercise_id]),
);
// HP10 and AK13 were merged into the same new single-leg stance entry.
LEGACY_EXERCISE_ID_MAP.set("HP10", "F02-04");

/**
 * The real exercise_id for "深蹲" in rehabExercises.js (Excel-derived catalog).
 * Only this exercise is allowed into the real MediaPipe detection flow —
 * every other exercise still uses the demo/placeholder detection prep page.
 */
export const SQUAT_EXERCISE_ID = "F01-01";
export const MINI_SQUAT_EXERCISE_ID = "F01-02";
export const WALL_HALF_SQUAT_EXERCISE_ID = "F01-03";
export const TERMINAL_KNEE_EXTENSION_EXERCISE_ID = "F01-05";
export const SEATED_KNEE_FLEXION_EXERCISE_ID = "F01-07";

export function isSquatExercise(exercise) {
  if (!exercise) return false;
  const id = exercise.exercise_id || exercise.exerciseId || exercise.id || "";
  if (id === SQUAT_EXERCISE_ID) return true;
  const name = exercise.exercise_name || exercise.exerciseName || "";
  if (name.includes("深蹲")) return true;
  const cnnLabel = exercise.cnn_label || "";
  return cnnLabel.includes("深蹲");
}

// Public exercise IDs use the six-domain F01–F06 numbering from the rebuilt catalog.
// Legacy prefixes remain in constant names only so existing detector modules do not need risky symbol renames.
export const HP02_EXERCISE_ID = "F01-11";
export const CR01_EXERCISE_ID = "F03-09";
export const CR02_EXERCISE_ID = "F03-10";
export const CR05_EXERCISE_ID = "F01-09";
export const CR06_EXERCISE_ID = "F03-11";
export const CR07_EXERCISE_ID = "F06-04";
export const KN03_EXERCISE_ID = "F01-06";
export const LE05_EXERCISE_ID = "F01-04";
export const LE03_EXERCISE_ID = "F01-10";
export const SH01_EXERCISE_ID = "F06-01";
export const HP04_EXERCISE_ID = "F01-13";
export const HP05_EXERCISE_ID = "F01-14";
export const HP06_EXERCISE_ID = "F01-15";
export const HP01_EXERCISE_ID = "F01-08";
export const HP03_EXERCISE_ID = "F01-12";
export const HP07_EXERCISE_ID = "F01-16";
export const HP08_EXERCISE_ID = "F03-05";
export const HP09_EXERCISE_ID = "F03-08";
export const AD02_EXERCISE_ID = "F03-01";
export const AD04_EXERCISE_ID = "F03-02";
export const AD05_EXERCISE_ID = "F03-03";
export const AK01_EXERCISE_ID = "F06-05";
export const AK02_EXERCISE_ID = "F06-06";
export const AK03_EXERCISE_ID = "F06-07";
export const AK04_EXERCISE_ID = "F06-08";
export const AK05_EXERCISE_ID = "F01-17";
export const AK06_EXERCISE_ID = "F01-18";
export const AK07_EXERCISE_ID = "F01-19";
export const AK08_EXERCISE_ID = "F01-20";
export const AK09_EXERCISE_ID = "F04-07";
export const AK10_EXERCISE_ID = "F04-08";
export const AK11_EXERCISE_ID = "F03-06";
export const AK12_EXERCISE_ID = "F03-07";
export const AK13_EXERCISE_ID = "F02-04";
export const AK15_EXERCISE_ID = "F02-08";
export const F02_BALANCE_EXERCISE_IDS = ["F02-01","F02-02","F02-03","F02-05","F02-06","F02-07","F02-09"];

export const POSE_ANALYZER = {
  SQUAT: "f01_01_squat",
  HP02_HIP_FLEXION: "f01_11_standing_hip_flexion",
  CR01_PLANK: "f03_09_plank",
  CR02_CRUNCH: "f03_10_crunch",
  CR05_SEATED_KNEE_RAISE: "f01_09_seated_knee_raise",
  CR06_HEEL_TAP: "f03_11_heel_tap",
  CR07_KNEE_SWAY: "f06_04_knee_sway",
  KN03_SEATED_KNEE_EXTENSION: "f01_06_seated_knee_extension",
  LE05_SIT_TO_STAND: "f01_04_sit_to_stand",
  LE03_BRIDGE: "f01_10_bridge",
  SH01_SHOULDER_PENDULUM: "f06_01_shoulder_pendulum",
  HP04_HIP_ABDUCTION: "f01_13_hip_abduction",
  HP05_HIP_ADDUCTION: "f01_14_hip_adduction",
  HP06_CLAMSHELL: "f01_15_clamshell",
  HP01_STRAIGHT_LEG_RAISE: "f01_08_straight_leg_raise",
  HP03_STANDING_HIP_EXTENSION: "f01_12_standing_hip_extension",
  HP07_FIRE_HYDRANT: "f01_16_fire_hydrant",
  HP08_LATERAL_STEP: "f03_05_lateral_step",
  HP09_MONSTER_WALK: "f03_08_monster_walk",
  AD02_BEDSIDE_SIT_UP: "f03_01_bedside_sit_up",
  AD04_FLOOR_OBJECT_PICKUP: "f03_02_floor_object_pickup",
  AD05_TURNING_WALK: "f03_03_turning_walk",
  AK01_ANKLE_DORSIFLEXION: "f06_05_ankle_dorsiflexion",
  AK02_ANKLE_PLANTARFLEXION: "f06_06_ankle_plantarflexion",
  AK03_ANKLE_INVERSION: "f06_07_ankle_inversion",
  AK04_ANKLE_EVERSION: "f06_08_ankle_eversion",
  AK05_DOUBLE_CALF_RAISE: "f01_17_double_calf_raise",
  AK06_DOUBLE_TOE_RAISE: "f01_18_double_toe_raise",
  AK07_SINGLE_LEG_CALF_RAISE: "f01_19_single_leg_calf_raise",
  AK08_SINGLE_LEG_TOE_RAISE: "f01_20_single_leg_toe_raise",
  AK09_HEEL_WALK: "f04_07_heel_walk",
  AK10_TOE_WALK: "f04_08_toe_walk",
  AK11_FORWARD_WEIGHT_SHIFT: "f03_06_forward_weight_shift",
  AK12_LATERAL_WEIGHT_SHIFT: "f03_07_lateral_weight_shift",
  AK13_SINGLE_LEG_ANKLE_STABILITY: "f02_04_single_leg_stance",
  AK15_SINGLE_LEG_FORWARD_REACH: "f02_08_single_leg_forward_reach",
  F02_BALANCE_SERIES: "f02_balance_series",
};

const ANALYZER_BY_EXERCISE_ID = new Map([
  [SQUAT_EXERCISE_ID, POSE_ANALYZER.SQUAT],
  [MINI_SQUAT_EXERCISE_ID, POSE_ANALYZER.SQUAT],
  [WALL_HALF_SQUAT_EXERCISE_ID, POSE_ANALYZER.SQUAT],
  [TERMINAL_KNEE_EXTENSION_EXERCISE_ID, POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION],
  [SEATED_KNEE_FLEXION_EXERCISE_ID, POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION],
  [HP02_EXERCISE_ID, POSE_ANALYZER.HP02_HIP_FLEXION],
  [CR01_EXERCISE_ID, POSE_ANALYZER.CR01_PLANK],
  [CR02_EXERCISE_ID, POSE_ANALYZER.CR02_CRUNCH],
  [CR05_EXERCISE_ID, POSE_ANALYZER.CR05_SEATED_KNEE_RAISE],
  [CR06_EXERCISE_ID, POSE_ANALYZER.CR06_HEEL_TAP],
  [CR07_EXERCISE_ID, POSE_ANALYZER.CR07_KNEE_SWAY],
  [KN03_EXERCISE_ID, POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION],
  [LE05_EXERCISE_ID, POSE_ANALYZER.LE05_SIT_TO_STAND],
  [LE03_EXERCISE_ID, POSE_ANALYZER.LE03_BRIDGE],
  [SH01_EXERCISE_ID, POSE_ANALYZER.SH01_SHOULDER_PENDULUM],
  [HP04_EXERCISE_ID, POSE_ANALYZER.HP04_HIP_ABDUCTION],
  [HP05_EXERCISE_ID, POSE_ANALYZER.HP05_HIP_ADDUCTION],
  [HP06_EXERCISE_ID, POSE_ANALYZER.HP06_CLAMSHELL],
  [HP01_EXERCISE_ID, POSE_ANALYZER.HP01_STRAIGHT_LEG_RAISE],
  [HP03_EXERCISE_ID, POSE_ANALYZER.HP03_STANDING_HIP_EXTENSION],
  [HP07_EXERCISE_ID, POSE_ANALYZER.HP07_FIRE_HYDRANT],
  [HP08_EXERCISE_ID, POSE_ANALYZER.HP08_LATERAL_STEP],
  [HP09_EXERCISE_ID, POSE_ANALYZER.HP09_MONSTER_WALK],
  [AD02_EXERCISE_ID, POSE_ANALYZER.AD02_BEDSIDE_SIT_UP],
  [AD04_EXERCISE_ID, POSE_ANALYZER.AD04_FLOOR_OBJECT_PICKUP],
  [AD05_EXERCISE_ID, POSE_ANALYZER.AD05_TURNING_WALK],
  [AK01_EXERCISE_ID, POSE_ANALYZER.AK01_ANKLE_DORSIFLEXION],
  [AK02_EXERCISE_ID, POSE_ANALYZER.AK02_ANKLE_PLANTARFLEXION],
  [AK03_EXERCISE_ID, POSE_ANALYZER.AK03_ANKLE_INVERSION],
  [AK04_EXERCISE_ID, POSE_ANALYZER.AK04_ANKLE_EVERSION],
  [AK05_EXERCISE_ID, POSE_ANALYZER.AK05_DOUBLE_CALF_RAISE],
  [AK06_EXERCISE_ID, POSE_ANALYZER.AK06_DOUBLE_TOE_RAISE],
  [AK07_EXERCISE_ID, POSE_ANALYZER.AK07_SINGLE_LEG_CALF_RAISE],
  [AK08_EXERCISE_ID, POSE_ANALYZER.AK08_SINGLE_LEG_TOE_RAISE],
  [AK09_EXERCISE_ID, POSE_ANALYZER.AK09_HEEL_WALK],
  [AK10_EXERCISE_ID, POSE_ANALYZER.AK10_TOE_WALK],
  [AK11_EXERCISE_ID, POSE_ANALYZER.AK11_FORWARD_WEIGHT_SHIFT],
  [AK12_EXERCISE_ID, POSE_ANALYZER.AK12_LATERAL_WEIGHT_SHIFT],
  [AK13_EXERCISE_ID, POSE_ANALYZER.AK13_SINGLE_LEG_ANKLE_STABILITY],
  [AK15_EXERCISE_ID, POSE_ANALYZER.AK15_SINGLE_LEG_FORWARD_REACH],
  ...F02_BALANCE_EXERCISE_IDS.map((id) => [id, POSE_ANALYZER.F02_BALANCE_SERIES]),
]);

export function resolvePoseAnalyzer(exercise) {
  if (!exercise) return null;
  const id = exercise.exercise_id || exercise.exerciseId || exercise.id || "";
  return ANALYZER_BY_EXERCISE_ID.get(id) || (isSquatExercise(exercise) ? POSE_ANALYZER.SQUAT : null);
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
  const aiSupported = resolvePoseAnalyzer(raw) !== null;

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
    // Uses the same six-domain analyzer registry as the live detection flow.
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
    const currentId = LEGACY_EXERCISE_ID_MAP.get(exerciseId) || exerciseId;
    return rehabExercises.find((ex) => ex.exercise_id === currentId) || null;
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
