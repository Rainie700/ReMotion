export const GAIT_REQUIRED_LANDMARKS=[11,12,15,16,23,24,25,26,27,28];
export const GAIT_PROFILES={
  "F03-04":{id:"F03-04",name:"階梯踏步",mode:"steps",targetReps:10,image:"exercise_step_up.png",instruction:"側前方拍攝；使用穩固低階踏板，一腳踏上、重心前移並帶動另一腳上階，站穩後再回位。"},
  "F04-01":{id:"F04-01",name:"正常步態訓練",mode:"steps",targetReps:20,image:"exercise_normal_gait.png",instruction:"側面或斜前方拍攝；抬頭看前方、肩膀放鬆並自然擺臂，以腳跟著地、腳尖推離的方式行走。"},
  "F04-02":{id:"F04-02",name:"直線行走",mode:"steps",targetReps:20,image:"exercise_balance_walk.png",instruction:"正面拍攝；雙臂抬至肩高，沿直線以腳跟接腳尖緩慢前進，每步短暫站穩。"},
  "F04-03":{id:"F04-03",name:"後退行走",mode:"steps",targetReps:40,image:"exercise_backward_walking.png",instruction:"側面拍攝；確認後方無障礙，以腳尖先接觸、再緩慢放下腳跟的方式控制後退。"},
  "F04-04":{id:"F04-04",name:"側步行走",mode:"steps",targetReps:40,image:"exercise_sideways_walking.png",instruction:"正面拍攝；身體朝同一方向，向側邊跨步後併步，左右方向分別練習。"},
  "F04-06":{id:"F04-06",name:"原地踏步",mode:"duration",targetSeconds:120,targetReps:1,image:"exercise_marching_in_place.png",instruction:"正面拍攝；在穩固支撐物旁原地交替抬膝，以不疼痛且能控制的高度持續 2 分鐘。"}
};
export const GAIT_THRESHOLDS={MIN_VISIBILITY:.5,FOOT_LIFT_RATIO:.13,RETURN_RATIO:.06,MIN_STEP_MS:350,MAX_STEP_MS:4000,TOO_FAST_MS:600,TILT_MAX_DEG:12,TRUNK_LEAN_MAX_DEG:18,EVENT_COOLDOWN_MS:900};
export const GAIT_ANALYSIS_MODE_PREFIX="mediapipe_gait_series_";
export const DEFAULT_GAIT_REWARD_XP=30;
