/**
 * The ONE exercise media resolver + asset audit (single source of truth).
 * exerciseId -> video / image / placeholder for the Training Tab cards, the
 * Self Practice library, Exercise Detail, AI Preparation and records.
 *
 * Every catalog exercise has an audit entry:
 *   confirmed     file exists AND shows this exercise's own movement (per its
 *                 name / steps / description) — the ONLY status that is shown
 *   wrong         a file is mapped but shows a different movement
 *   needs_review  a file exists (mapped or candidate) but the defining part of
 *                 the movement is not visible / definition differs — needs a
 *                 human decision before it can be shown
 *   missing       no usable file in the project
 * Anything not confirmed resolves to the neutral 「示意圖待補」 placeholder —
 * never another exercise's photo and never a generic stand-in.
 * Asset backlog for image production: docs/specs/exercise_asset_backlog.json.
 * This table is the ONLY exerciseId -> image mapping in the app (no second map).
 * Production images: 800×800 transparent PNG, subject ~68–74% of the canvas
 * height, centred — the card / detail background colour comes from CSS.
 */

const IMG = (file) => `/images/exercise/${file}`;

export const EXERCISE_ASSET_AUDIT = Object.freeze({
  // F01 下肢功能
  "F01-01": { status: "confirmed", file: IMG("exercise_squat.png") },
  "F01-02": { status: "confirmed", file: IMG("exercise_mini_squat.png") },
  "F01-03": { status: "confirmed", file: IMG("exercise_wall_half_squat.png") },
  "F01-04": { status: "confirmed", file: IMG("exercise_sit_to_stand.png") },
  "F01-05": { status: "missing", file: null },
  "F01-06": { status: "confirmed", file: IMG("exercise_seated_leg_raise.png") },
  "F01-07": { status: "missing", file: null },
  "F01-08": { status: "confirmed", file: IMG("exercise_high_knees.png"), note: "仰躺、單腿伸直抬起（檔名為舊命名，內容即直腿抬腿）；原 exercise_knee_extension.png 為雙腿上舉，不採用" },
  "F01-09": { status: "missing", file: null },
  "F01-10": { status: "confirmed", file: IMG("exercise_bridge.png") },
  "F01-11": { status: "confirmed", file: IMG("exercise_knee_raise.png") },
  "F01-12": { status: "confirmed", file: IMG("exercise_hip_extension.png") },
  "F01-13": { status: "confirmed", file: IMG("exercise_side_leg_raise2.png") },
  "F01-14": { status: "confirmed", file: IMG("exercise_hip_adduction.png") },
  "F01-15": { status: "confirmed", file: IMG("exercise_clamshell.png") },
  "F01-16": { status: "confirmed", file: IMG("exercise_fire_hydrant.png"), note: "四足跪姿起始姿勢" },
  "F01-17": { status: "needs_review", file: IMG("exercise_double_calf_raise.png"), note: "圖為雙腳平站，看不出腳跟離地" },
  "F01-18": { status: "needs_review", file: IMG("exercise_double_toe_raise.png"), note: "圖為雙腳平站、手臂外展，看不出前腳掌抬起" },
  "F01-19": { status: "confirmed", file: IMG("exercise_single_leg_calf_raise.png"), note: "單腳站立、手前伸扶牆、支撐腳前腳掌著地腳跟離地（2026-09-30 新圖）" },
  "F01-20": { status: "wrong", file: IMG("exercise_single_leg_toe_raise.png"), note: "圖為抬腿前踢，不是單腳站立抬腳尖" },
  // F02 平衡
  "F02-01": { status: "confirmed", file: IMG("exercise_feet_together_balance.png") },
  "F02-02": { status: "confirmed", file: IMG("exercise_semi_tandem_stance.png") },
  "F02-03": { status: "confirmed", file: IMG("exercise_tandem_stance.png") },
  "F02-04": { status: "confirmed", file: IMG("exercise_single_leg_ankle_stability.png") },
  "F02-05": { status: "confirmed", file: IMG("exercise_lateral_weight_shift.png"), note: "雙腳固定、重心側移" },
  "F02-06": { status: "missing", file: null },
  "F02-07": { status: "missing", file: null },
  "F02-08": { status: "confirmed", file: IMG("exercise_single_leg_forward_reach.png") },
  "F02-09": { status: "missing", file: null },
  // F03 功能性移動
  "F03-01": { status: "confirmed", file: IMG("exercise_bedside_sit_up.png") },
  "F03-02": { status: "confirmed", file: IMG("exercise_floor_object_pickup.png") },
  "F03-03": { status: "needs_review", file: IMG("exercise_turning_walk.png"), note: "圖為行走，看不出轉身" },
  "F03-04": { status: "needs_review", file: null, candidate: IMG("exercise_stair_ascent.png"), note: "候選圖為上多階樓梯；本動作定義為單一低階踏板上下" },
  "F03-05": { status: "wrong", file: IMG("exercise_lateral_step.png"), note: "圖為側面向前行走，不是向側方跨步" },
  "F03-06": { status: "confirmed", file: IMG("exercise_forward_weight_shift.png") },
  "F03-07": { status: "needs_review", file: IMG("exercise_lateral_weight_shift.png"), note: "與 F02-05 共用；F02-05 定義為雙腳固定不跨步，本動作為先側跨一步再轉移重心，定義不同" },
  "F03-08": { status: "wrong", file: IMG("exercise_monster_walk.png"), note: "圖為弓箭步，不是半蹲斜前跨步（怪獸走）" },
  "F03-09": { status: "confirmed", file: IMG("exercise_plank.png") },
  "F03-10": { status: "confirmed", file: IMG("exercise_crunch.png") },
  "F03-11": { status: "confirmed", file: IMG("exercise_alternating_heel_tap.png") },
  // F04 步行功能
  "F04-01": { status: "missing", file: null },
  "F04-02": { status: "missing", file: null },
  "F04-03": { status: "missing", file: null },
  "F04-04": { status: "missing", file: null },
  "F04-06": { status: "missing", file: null },
  "F04-07": { status: "needs_review", file: IMG("exercise_heel_walk.png"), note: "一般行走姿勢，看不出腳尖抬起；與 F04-08 圖幾乎相同" },
  "F04-08": { status: "needs_review", file: IMG("exercise_toe_walk.png"), note: "一般行走姿勢，看不出以腳尖行走；與 F04-07 圖幾乎相同" },
  // F05 上肢功能
  "F05-01": { status: "missing", file: null },
  "F05-02": { status: "missing", file: null },
  "F05-03": { status: "missing", file: null },
  "F05-04": { status: "missing", file: null },
  "F05-05": { status: "missing", file: null },
  "F05-06": { status: "needs_review", file: null, candidate: IMG("exercise_arm_abduction.png"), note: "候選圖為手持啞鈴側舉；本動作定義未包含負重" },
  "F05-09": { status: "missing", file: null },
  // F06 柔軟度／活動能力
  "F06-01": { status: "wrong", file: IMG("exercise_shoulder_pendulum.png"), note: "圖為直立雙臂擺動；本動作定義為身體前傾、健側手扶桌、患側手下垂擺盪" },
  "F06-02": { status: "missing", file: null },
  "F06-03": { status: "missing", file: null },
  "F06-04": { status: "confirmed", file: IMG("exercise_supine_knee_sway.png") },
  "F06-05": { status: "needs_review", file: IMG("exercise_ankle_dorsiflexion.png"), note: "雙腳平站，看不出腳背屈" },
  "F06-06": { status: "needs_review", file: IMG("exercise_ankle_plantarflexion.png"), note: "側面站姿，蹠屈幅度不明顯" },
  "F06-07": { status: "needs_review", file: IMG("exercise_ankle_inversion.png"), note: "坐姿雙腳平放，看不出內翻；與 F06-08 圖相同" },
  "F06-08": { status: "needs_review", file: IMG("exercise_ankle_eversion.png"), note: "坐姿雙腳平放，看不出外翻；與 F06-07 圖相同" },
  "F06-09": { status: "missing", file: null },
  "F06-10": { status: "missing", file: null },
  "F06-11": { status: "missing", file: null },
  "F06-12": { status: "missing", file: null },
});

/** Shown images = confirmed entries only. */
export const EXERCISE_IMAGE_ASSETS = Object.freeze(Object.fromEntries(
  Object.entries(EXERCISE_ASSET_AUDIT).filter(([, a]) => a.status === "confirmed" && a.file).map(([id, a]) => [id, a.file]),
));

/** Exercises with a file (mapped or candidate) that must NOT be shown yet (wrong / needs_review). */
export const EXERCISE_IMAGE_UNCONFIRMED = Object.freeze(
  Object.entries(EXERCISE_ASSET_AUDIT).filter(([, a]) => a.status === "wrong" || a.status === "needs_review").map(([id]) => id),
);

const isValidVideoUrl = (url) => typeof url === "string" && /^https?:\/\//i.test(url.trim());

/**
 * @param {string} exerciseId
 * @param {object} [raw] catalog record (for demo_video_url)
 * @returns {{ state: "video"|"image"|"placeholder", src: string|null, videoUrl: string|null }}
 */
export function resolveExerciseMedia(exerciseId, raw = null) {
  const videoUrl = raw && isValidVideoUrl(raw.demo_video_url) ? String(raw.demo_video_url).trim() : null;
  const src = (exerciseId && EXERCISE_IMAGE_ASSETS[exerciseId]) || null;
  return { state: videoUrl ? "video" : src ? "image" : "placeholder", src, videoUrl };
}
