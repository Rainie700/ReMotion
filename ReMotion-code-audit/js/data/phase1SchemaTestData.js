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
  LE01: "肌力", // 深蹲 — 下肢／肌力／易／AI 支援
  LE05: "肌力", // 坐站 — 下肢／肌力／易
  HP01: "肌力", // 仰躺直腿抬腿 — 髖關節／肌力／易
  LE03: "肌力", // 橋式 — 下肢／肌力／易
  LE04: "肌力", // 側抬腿 — 下肢／肌力／非常容易
  SH01: "活動度", // 肩關節擺盪運動 — 上肢肩部／活動度／非常容易
  SH04: "肌力", // 站姿肩外展等長收縮 — 上肢肩部／肌力／易
  HP10: "平衡", // 單腳站姿髖穩定 — 髖關節／平衡／普通／duration
  CR01: "肌力", // 棒式 — 核心／肌力／普通／duration
};

export const PHASE1_TEST_EXERCISE_IDS = Object.keys(PHASE1_TEST_EXERCISE_GOALS);
