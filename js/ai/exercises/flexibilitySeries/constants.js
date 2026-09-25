export const FLEX_REQUIRED_LANDMARKS=[11,12,13,14,15,16,23,24,25,26,27,28];
export const FLEX_PROFILES={
 "F06-02":{id:"F06-02",name:"雙手抱胸伸展",mode:"hold",pose:"self_hug",targetSeconds:20,targetReps:3,image:"exercise_self_hug_stretch.png",instruction:"正面或斜側坐姿；雙臂交叉抱住對側肩膀，上背部輕微圓屈，維持 20 秒。"},
 "F06-03":{id:"F06-03",name:"三頭肌伸展",mode:"hold_sides",pose:"triceps",targetSeconds:20,targetReps:2,image:"exercise_overhead_triceps_stretch.png",instruction:"正面拍攝；一手抬至頭上並屈肘往背部移動，另一手輕扶手肘，每側維持 20 秒。"},
 "F06-09":{id:"F06-09",name:"軀幹側彎",mode:"cycle",pose:"lateral_flexion",targetReps:6,image:"exercise_trunk_lateral_flexion.png",instruction:"正面拍攝；雙腳與骨盆穩定，軀幹向左右側彎後回到直立，共完成 6 次。"},
 "F06-10":{id:"F06-10",name:"軀幹旋轉",mode:"cycle",pose:"rotation",targetReps:6,image:"exercise_trunk_rotation.png",instruction:"正面或斜前方拍攝；保持骨盆穩定，軀幹向左右旋轉後回到中立，共完成 6 次。"},
 "F06-11":{id:"F06-11",name:"坐姿腿後肌伸展",mode:"hold_sides",pose:"hamstring",targetSeconds:20,targetReps:2,image:"exercise_seated_hamstring_stretch.png",instruction:"側面拍攝；坐在椅子前緣，一腿向前伸直、腳跟著地，由髖部前傾，每側維持 20 秒。"},
 "F06-12":{id:"F06-12",name:"小腿伸展",mode:"hold_sides",pose:"calf",targetSeconds:20,targetReps:2,image:"exercise_calf_stretch.png",instruction:"側面拍攝；前後站姿，後腿伸直且腳跟貼地，身體向前移動，每側維持 20 秒。",requiredLandmarks:[11,12,23,24,25,26,27,28,29,30,31,32]}
};
export const FLEX_THRESHOLDS={MIN_VISIBILITY:.5,HOLD_BREAK_GRACE_MS:700,HUG_WRIST_SHOULDER_RATIO:.55,HUG_TRUNK_MIN_DEG:8,TRICEPS_ELBOW_MAX_DEG:105,TRICEPS_ELBOW_HIGH_RATIO:.35,LATERAL_START_DEG:10,LATERAL_TARGET_DEG:18,ROTATION_TARGET_RATIO:.18,RETURN_DEG:6,KNEE_STRAIGHT_MIN_DEG:150,HAMSTRING_LEAN_MIN_DEG:12,STANCE_MIN_RATIO:.7,CALF_LEAN_MIN_DEG:7,HEEL_LIFT_MAX_RATIO:.12,PELVIS_TILT_MAX_DEG:12,MIN_REP_MS:700,MAX_REP_MS:8000,TOO_FAST_MS:1100,EVENT_COOLDOWN_MS:900};
export const FLEX_ANALYSIS_MODE_PREFIX="mediapipe_flexibility_";
export const DEFAULT_FLEX_REWARD_XP=30;
