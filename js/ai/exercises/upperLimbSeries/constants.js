export const UPPER_LIMB_REQUIRED_LANDMARKS=[11,12,13,14,15,16,23,24,27,28];
export const UPPER_LIMB_PROFILES={
 "F05-01":{id:"F05-01",name:"肘屈伸",mode:"elbow_cycle",targetReps:10,image:"exercise_elbow_flexion_extension.png",instruction:"側面拍攝；上臂貼近身體，前臂緩慢彎向肩膀，再控制伸直回位。"},
 "F05-02":{id:"F05-02",name:"肘伸直",mode:"elbow_extension",targetReps:10,image:"exercise_elbow_extension.png",instruction:"側面拍攝；手肘由約 90° 緩慢伸直，停留後控制彎回起始位置。"},
 "F05-03":{id:"F05-03",name:"手持水瓶彎舉",mode:"elbow_cycle",targetReps:10,image:"exercise_water_bottle_curl.png",instruction:"側面拍攝；握輕量水瓶，上臂固定貼身，彎舉至無痛範圍後慢慢下放。"},
 "F05-04":{id:"F05-04",name:"肩關節旋轉能力",mode:"external_rotation",targetReps:10,image:"exercise_seated_shoulder_rotation.png",instruction:"正面坐姿拍攝；雙肘約 90° 並貼近身體，前臂緩慢向外旋轉再回位。"},
 "F05-05":{id:"F05-05",name:"肩屈曲／前舉",mode:"shoulder_raise",targetReps:10,image:"exercise_shoulder_flexion_raise.png",instruction:"側面拍攝；手臂伸直，由身側沿前方向上抬至最大無痛範圍，再慢慢放下。"},
 "F05-06":{id:"F05-06",name:"肩外展／側舉",mode:"shoulder_raise",targetReps:10,image:"exercise_shoulder_abduction_raise.png",instruction:"正面拍攝；手臂伸直，由身側向外畫弧抬至最大無痛範圍，再慢慢放下。"},
 "F05-09":{id:"F05-09",name:"側向伸取",mode:"lateral_reach",targetReps:4,image:"exercise_lateral_reach_upper_limb.png",instruction:"正面拍攝；雙腳固定，手臂維持肩高向左右側伸取後回位，每側 2 次。"}
};
export const UPPER_LIMB_THRESHOLDS={MIN_VISIBILITY:.5,ELBOW_EXTENDED_DEG:150,ELBOW_FLEXED_DEG:85,SHOULDER_START_DEG:25,SHOULDER_TARGET_DEG:95,ELBOW_STRAIGHT_MIN_DEG:150,ROTATION_START_RATIO:.18,ROTATION_TARGET_RATIO:.42,REACH_START_RATIO:.18,REACH_TARGET_RATIO:.35,RETURN_RATIO:.10,ELBOW_DRIFT_RATIO:.18,FOOT_MOVE_RATIO:.14,TILT_MAX_DEG:12,TRUNK_LEAN_MAX_DEG:15,MIN_REP_MS:700,MAX_REP_MS:8000,TOO_FAST_MS:1100,EVENT_COOLDOWN_MS:900};
export const UPPER_LIMB_ANALYSIS_MODE_PREFIX="mediapipe_upper_limb_";
export const DEFAULT_UPPER_LIMB_REWARD_XP=30;
