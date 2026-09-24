import { POSE_LANDMARK_INDEX } from "../../squatConstants.js";

export const F02_REQUIRED_LANDMARKS = [
  11, 12, 15, 16,
  POSE_LANDMARK_INDEX.LEFT_HIP, POSE_LANDMARK_INDEX.RIGHT_HIP,
  POSE_LANDMARK_INDEX.LEFT_KNEE, POSE_LANDMARK_INDEX.RIGHT_KNEE,
  POSE_LANDMARK_INDEX.LEFT_ANKLE, POSE_LANDMARK_INDEX.RIGHT_ANKLE,
];

export const F02_PROFILES = {
  "F02-01": { id:"F02-01", name:"雙腳站立平衡", mode:"static", stance:"side", targetSeconds:10, targetReps:1, image:"exercise_side_by_side_balance.png", instruction:"雙腳併攏側對側，雙眼張開，不移動雙腳，穩定維持 10 秒。" },
  "F02-02": { id:"F02-02", name:"半併步站立", mode:"static", stance:"semi", targetSeconds:10, targetReps:1, image:"exercise_semi_tandem_stance.png", instruction:"一腳足弓內側貼齊另一腳大拇趾，雙眼張開，穩定維持 10 秒。" },
  "F02-03": { id:"F02-03", name:"前後腳站立", mode:"static", stance:"tandem", targetSeconds:10, targetReps:1, image:"exercise_tandem_stance.png", instruction:"一腳在前，前腳腳跟貼齊後腳腳尖，雙眼張開，穩定維持 10 秒。" },
  "F02-05": { id:"F02-05", name:"左右重心轉移", mode:"shift", axis:"x", targetReps:10, image:"exercise_lateral_weight_shift.png", instruction:"雙腳不跨步，重心緩慢移向左右兩側並回到中央。" },
  "F02-06": { id:"F02-06", name:"前後重心轉移", mode:"shift", axis:"x", targetReps:10, image:"exercise_forward_backward_weight_shift.png", instruction:"側面拍攝，雙腳不跨步，重心緩慢向前、向後移動並回到中央。" },
  "F02-07": { id:"F02-07", name:"功能性前伸取物", mode:"reach", direction:"forward", targetReps:3, image:"exercise_functional_forward_reach.png", instruction:"側面拍攝，手臂抬至肩高；雙腳固定不動，盡量向前伸後穩定回位，共 3 次。" },
  "F02-09": { id:"F02-09", name:"側向伸手", mode:"reach", direction:"lateral", targetReps:4, image:"exercise_lateral_reach.png", instruction:"正面拍攝，手臂維持肩高；雙腳固定不動，向左右側伸手後回位，每側 2 次。" },
};

export const F02_THRESHOLDS = {
  MIN_VISIBILITY:.5, STATIC_SWAY_MAX:.16, STATIC_TILT_MAX_DEG:12,
  STEP_ANKLE_DELTA_RATIO:.22, SHIFT_START_RATIO:.11, SHIFT_TARGET_RATIO:.20,
  RETURN_RATIO:.07, REACH_START_RATIO:.12, REACH_TARGET_RATIO:.22,
  HOLD_MS:450, MIN_REP_MS:900, MAX_REP_MS:9000, EVENT_COOLDOWN_MS:1000,
};

export const F02_ANALYSIS_MODE_PREFIX = "mediapipe_f02_balance_";
export const DEFAULT_F02_REWARD_XP = 30;
