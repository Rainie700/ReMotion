/**
 * ReMotion 2.0 Phase 1 — schema-compatibility test fixtures.
 *
 * This is NOT new production exercise data. Every id below is a real,
 * already-imported exercise_id from rehabExercises.js (never a fabricated
 * id) — see Phase 1 report for confirmation these 9 ids exist in the real
 * 44-item catalog.
 *
 * The real catalog has no `goal` taxonomy (肌力/活動度/平衡...) yet, so
 * `normalizeExercise()` correctly returns goal: null for these ids when
 * read straight from rehabExercises.js. The manual tags below exist only
 * to prove the new Exercise Schema's `goal` field can carry that kind of
 * value once a future data source provides it, and to give later
 * recommendation-prototyping phases a small, deliberately diverse set
 * (bodyPart / goal / difficulty) to work against without re-deriving it.
 */
export const PHASE1_TEST_EXERCISE_GOALS = {
  "F01-01": "肌力", // 深蹲
  "F01-04": "肌力", // 坐姿起立
  "F01-08": "肌力", // 直腿抬腿
  "F01-10": "肌力", // 橋式
  "F01-13": "肌力", // 側躺髖外展
  "F06-01": "活動度", // 肩關節擺盪運動
  "F02-04": "平衡", // 單腳站立平衡
  "F03-09": "肌力", // 棒式
};

export const PHASE1_TEST_EXERCISE_IDS = Object.keys(PHASE1_TEST_EXERCISE_GOALS);
