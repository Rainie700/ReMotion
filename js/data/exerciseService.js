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
export const CR05_EXERCISE_ID = "CR05";
export const KN03_EXERCISE_ID = "KN03";
export const LE05_EXERCISE_ID = "LE05";
export const LE03_EXERCISE_ID = "LE03";
export const LE04_EXERCISE_ID = "LE04";
export const LE06_EXERCISE_ID = "LE06";
export const LE07_EXERCISE_ID = "LE07";
export const SH01_EXERCISE_ID = "SH01";
export const SH02_EXERCISE_ID = "SH02";
export const SH03_EXERCISE_ID = "SH03";
export const HP04_EXERCISE_ID = "HP04";
export const HP05_EXERCISE_ID = "HP05";
export const HP06_EXERCISE_ID = "HP06";
export const LE02_EXERCISE_ID = "LE02";

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
  CR05_SEATED_KNEE_RAISE: "cr05_seated_knee_raise",
  KN03_SEATED_KNEE_EXTENSION: "kn03_seated_knee_extension",
  LE05_SIT_TO_STAND: "le05_sit_to_stand",
  LE03_BRIDGE: "le03_bridge",
  LE04_SIDE_LEG_RAISE: "le04_side_leg_raise",
  LE06_BALANCE: "le06_balance",
  LE07_CALF_RAISE: "le07_calf_raise",
  SH01_SHOULDER_PENDULUM: "sh01_shoulder_pendulum",
  SH02_EXTERNAL_ISOMETRIC: "sh02_external_isometric",
  SH03_INTERNAL_ISOMETRIC: "sh03_internal_isometric",
  HP04_HIP_ABDUCTION: "hp04_hip_abduction",
  HP05_HIP_ADDUCTION: "hp05_hip_adduction",
  HP06_CLAMSHELL: "hp06_clamshell",
  LE02_STRAIGHT_LEG_RAISE: "le02_straight_leg_raise",
};

export function resolvePoseAnalyzer(exercise) {
  if (!exercise) return null;
  if (isSquatExercise(exercise)) return POSE_ANALYZER.SQUAT;
  const id = exercise.exercise_id || exercise.exerciseId || exercise.id || "";
  if (id === HP02_EXERCISE_ID) return POSE_ANALYZER.HP02_HIP_FLEXION;
  if (id === CR05_EXERCISE_ID) return POSE_ANALYZER.CR05_SEATED_KNEE_RAISE;
  if (id === KN03_EXERCISE_ID) return POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION;
  if (id === LE05_EXERCISE_ID) return POSE_ANALYZER.LE05_SIT_TO_STAND;
  if (id === LE03_EXERCISE_ID) return POSE_ANALYZER.LE03_BRIDGE;
  if (id === LE04_EXERCISE_ID) return POSE_ANALYZER.LE04_SIDE_LEG_RAISE;
  if (id === LE06_EXERCISE_ID) return POSE_ANALYZER.LE06_BALANCE;
  if (id === LE07_EXERCISE_ID) return POSE_ANALYZER.LE07_CALF_RAISE;
  if (id === SH01_EXERCISE_ID) return POSE_ANALYZER.SH01_SHOULDER_PENDULUM;
  if (id === SH02_EXERCISE_ID) return POSE_ANALYZER.SH02_EXTERNAL_ISOMETRIC;
  if (id === SH03_EXERCISE_ID) return POSE_ANALYZER.SH03_INTERNAL_ISOMETRIC;
  if (id === HP04_EXERCISE_ID) return POSE_ANALYZER.HP04_HIP_ABDUCTION;
  if (id === HP05_EXERCISE_ID) return POSE_ANALYZER.HP05_HIP_ADDUCTION;
  if (id === HP06_EXERCISE_ID) return POSE_ANALYZER.HP06_CLAMSHELL;
  if (id === LE02_EXERCISE_ID) return POSE_ANALYZER.LE02_STRAIGHT_LEG_RAISE;
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
  const aiSupported = isSquatExercise(raw) || id === LE02_EXERCISE_ID || id === CR05_EXERCISE_ID || id === KN03_EXERCISE_ID || id === LE05_EXERCISE_ID || id === LE03_EXERCISE_ID || id === LE04_EXERCISE_ID || id === LE06_EXERCISE_ID || id === LE07_EXERCISE_ID || id === SH01_EXERCISE_ID || id === SH02_EXERCISE_ID || id === SH03_EXERCISE_ID || id === HP04_EXERCISE_ID || id === HP05_EXERCISE_ID || id === HP06_EXERCISE_ID;

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
