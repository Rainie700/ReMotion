/**
 * GENERATED FILE — do not edit by hand.
 * Source of Truth: docs/specs/ReMotion_D5_DecisionRules.xlsx
 * Source SHA-256:  dbbfaaa8498e42a5c143e5e3de5e608782ad41a57b1ba383bbcd4635cdd8a3e7
 * Generator: scripts/generateF01ProgressionSpec.py
 *
 * Phase D5 (D5-0 V1) next-cycle decision rules. All rows are ReMotion
 * Engineering Rules / literature references — not diagnoses, clinical
 * cut-offs or prescriptions. The reference MDC (Yin et al. 2023, sarcopenia
 * subgroup) only classifies the measured 5xSTS change; it is not an MCID.
 */
export const F01_PROGRESSION_SPEC_SOURCE = Object.freeze({"file": "docs/specs/ReMotion_D5_DecisionRules.xlsx", "sha256": "dbbfaaa8498e42a5c143e5e3de5e608782ad41a57b1ba383bbcd4635cdd8a3e7", "version": "D5-0-V1"});

/** 5xSTS_ChangeEvidence — selected reference. Decisions compare RAW milliseconds against referenceMdcMs. */
export const F01_CHANGE_REFERENCE = Object.freeze({
  "evidenceId": "MDC-YIN-2023-SARC",
  "reference": "Yin et al. (2023)",
  "group": "Sarcopenia",
  "referenceMdcMs": 3120,
  "referenceMdcPercent": 24.0,
  "referenceMdcPercentUse": "not_used_in_D5_V1",
  "populationFit": "Partial / indirect",
  "runtimeRules": [
    {
      "field": "changeMs",
      "condition": "changeMs <= -3120",
      "changeClass": "faster_beyond_reference_mdc"
    },
    {
      "field": "changeMs",
      "condition": "-3120 < changeMs < 3120",
      "changeClass": "within_reference_mdc"
    },
    {
      "field": "changeMs",
      "condition": "changeMs >= 3120",
      "changeClass": "slower_beyond_reference_mdc"
    }
  ]
});

/** TrainingExposure — ReMotion product-cycle classification, not an adherence standard. */
export const F01_TRAINING_EXPOSURE_STATES = Object.freeze([
  {
    "stateId": "TE-00",
    "minDays": 0,
    "maxDays": 0,
    "code": "none",
    "labelZh": "沒有完整訓練日",
    "plannedTrainingDays": 6,
    "status": "Confirmed"
  },
  {
    "stateId": "TE-01",
    "minDays": 1,
    "maxDays": 5,
    "code": "partial",
    "labelZh": "部分訓練日完成",
    "plannedTrainingDays": 6,
    "status": "Confirmed"
  },
  {
    "stateId": "TE-02",
    "minDays": 6,
    "maxDays": 6,
    "code": "full",
    "labelZh": "全部設定訓練日完成",
    "plannedTrainingDays": 6,
    "status": "Confirmed"
  }
]);

/** D5_DecisionTable R001..R011 (decision mapped to its program code). */
export const F01_D5_DECISION_RULES = Object.freeze([
  {
    "ruleId": "R001",
    "assessmentValid": "No",
    "changeClass": "any",
    "trainingState": "any",
    "limitationOrDiscomfort": "any",
    "decision": "no_auto_decision",
    "decisionLabelZh": "不自動判定",
    "autoApplyAllowed": false,
    "exerciseAction": "重新評估",
    "reason": "前後評估資料不足或無效，不進入下一階段自動調整。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R002",
    "assessmentValid": "Yes",
    "changeClass": "unclassified",
    "trainingState": "any",
    "limitationOrDiscomfort": "none/unknown",
    "decision": "no_auto_decision",
    "decisionLabelZh": "不自動判定",
    "autoApplyAllowed": false,
    "exerciseAction": "保留目前紀錄／重新確認前後評估資料",
    "reason": "前後評估資料雖有效，但目前無法建立可用的 change_class；資料不足以支持下一階段自動調整。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R003",
    "assessmentValid": "Yes",
    "changeClass": "faster_beyond_reference_mdc",
    "trainingState": "none",
    "limitationOrDiscomfort": "none",
    "decision": "maintain",
    "decisionLabelZh": "維持",
    "autoApplyAllowed": false,
    "exerciseAction": "沿用目前主要訓練；不因單次前後差異直接進階",
    "reason": "本次較初次快且超過參考 MDC，但本週沒有完整訓練日，無法把變化合理歸因於目前訓練方案；保守沿用並繼續觀察。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R004",
    "assessmentValid": "Yes",
    "changeClass": "faster_beyond_reference_mdc",
    "trainingState": "partial",
    "limitationOrDiscomfort": "none",
    "decision": "maintain",
    "decisionLabelZh": "維持",
    "autoApplyAllowed": false,
    "exerciseAction": "沿用目前主要訓練；保留原 Goal",
    "reason": "有部分訓練暴露，且本次較初次快、差異超過參考 MDC；因暴露未完整，先維持目前配置，不直接進階。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R005",
    "assessmentValid": "Yes",
    "changeClass": "faster_beyond_reference_mdc",
    "trainingState": "full",
    "limitationOrDiscomfort": "none",
    "decision": "progress",
    "decisionLabelZh": "進階",
    "autoApplyAllowed": false,
    "exerciseAction": "建立進階候選；仍須通過限制條件與 ExerciseTransition 對應",
    "reason": "本週六個設定訓練日皆完成，且本次較初次快、差異超過目前採用的參考 MDC；可列為進階候選，但不代表臨床改善，也不能直接自動換動作。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R006",
    "assessmentValid": "Yes",
    "changeClass": "within_reference_mdc",
    "trainingState": "none",
    "limitationOrDiscomfort": "none",
    "decision": "no_auto_decision",
    "decisionLabelZh": "不自動判定",
    "autoApplyAllowed": false,
    "exerciseAction": "不建立下一階段自動調整；保留人工／後續資料確認",
    "reason": "前後差異仍在參考 MDC 範圍內，且本週沒有完整訓練日；目前資料不足以支持下一階段自動調整。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R007",
    "assessmentValid": "Yes",
    "changeClass": "within_reference_mdc",
    "trainingState": "partial",
    "limitationOrDiscomfort": "none",
    "decision": "maintain",
    "decisionLabelZh": "維持",
    "autoApplyAllowed": false,
    "exerciseAction": "沿用目前主要訓練；繼續累積追蹤資料",
    "reason": "前後差異未超過參考 MDC，且只有部分訓練暴露；先維持目前方案，不把短期差異解讀為無效，也不直接進階。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R008",
    "assessmentValid": "Yes",
    "changeClass": "within_reference_mdc",
    "trainingState": "full",
    "limitationOrDiscomfort": "none",
    "decision": "maintain",
    "decisionLabelZh": "維持",
    "autoApplyAllowed": false,
    "exerciseAction": "沿用目前主要訓練；下一週持續追蹤",
    "reason": "六個設定訓練日皆完成，但前後差異仍在參考 MDC 範圍內；先維持並持續追蹤，不因一個 7 日週期就判定失敗或改變難度。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R009",
    "assessmentValid": "Yes",
    "changeClass": "slower_beyond_reference_mdc",
    "trainingState": "none",
    "limitationOrDiscomfort": "none",
    "decision": "no_auto_decision",
    "decisionLabelZh": "不自動判定",
    "autoApplyAllowed": false,
    "exerciseAction": "不自動退階；重新確認量測／近期狀態",
    "reason": "本次較初次慢且差異超過參考 MDC，但本週沒有完整訓練日；缺少訓練暴露，不能把差異歸因於目前方案，也不應直接退階。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R010",
    "assessmentValid": "Yes",
    "changeClass": "slower_beyond_reference_mdc",
    "trainingState": "partial/full",
    "limitationOrDiscomfort": "none",
    "decision": "adjust",
    "decisionLabelZh": "調整",
    "autoApplyAllowed": false,
    "exerciseAction": "檢查訓練適配性、限制條件與動作選擇；必要時產生較保守候選",
    "reason": "有訓練暴露，且本次較初次慢、差異超過參考 MDC；系統應先調整／重新確認，而不是直接判定退階。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  },
  {
    "ruleId": "R011",
    "assessmentValid": "Yes",
    "changeClass": "any",
    "trainingState": "any",
    "limitationOrDiscomfort": "present",
    "decision": "adjust",
    "decisionLabelZh": "調整",
    "autoApplyAllowed": false,
    "exerciseAction": "限制候選／專業確認",
    "reason": "出現不適或新限制時，不應自動進階；先調整候選或提醒專業確認。",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed"
  }
]);

/** ExerciseTransition — ALL rows with their status; only status "Confirmed" may be used automatically. */
export const F01_EXERCISE_TRANSITIONS = Object.freeze([
  {
    "currentExerciseId": "F01-04",
    "currentExerciseName": "坐姿起立",
    "goalId": "G02",
    "transitionType": "progression",
    "candidateExerciseId": "F01-02",
    "candidateExerciseName": "迷你深蹲",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.nth.nhs.uk/resources/lower-limb-exercise-and-education/"
  },
  {
    "currentExerciseId": "F01-02",
    "currentExerciseName": "迷你深蹲",
    "goalId": "G02",
    "transitionType": "regression",
    "candidateExerciseId": "F01-04",
    "candidateExerciseName": "坐姿起立",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.nth.nhs.uk/resources/lower-limb-exercise-and-education/"
  },
  {
    "currentExerciseId": "F01-02",
    "currentExerciseName": "迷你深蹲",
    "goalId": "G02",
    "transitionType": "progression",
    "candidateExerciseId": "F01-01",
    "candidateExerciseName": "深蹲",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.uclh.nhs.uk/patients-and-visitors/patient-information-pages/home-exercises-improve-strength-and-balance-following-hospital-admission"
  },
  {
    "currentExerciseId": "F01-01",
    "currentExerciseName": "深蹲",
    "goalId": "G02",
    "transitionType": "regression",
    "candidateExerciseId": "F01-02",
    "candidateExerciseName": "迷你深蹲",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.uclh.nhs.uk/patients-and-visitors/patient-information-pages/home-exercises-improve-strength-and-balance-following-hospital-admission"
  },
  {
    "currentExerciseId": "F01-17",
    "currentExerciseName": "雙腳提踵",
    "goalId": "G05",
    "transitionType": "progression",
    "candidateExerciseId": "F01-19",
    "candidateExerciseName": "單腳提踵",
    "evidenceType": "Evidence",
    "status": "Confirmed",
    "sourceUrl": "https://www.nth.nhs.uk/resources/lower-limb-exercise-and-education/"
  },
  {
    "currentExerciseId": "F01-19",
    "currentExerciseName": "單腳提踵",
    "goalId": "G05",
    "transitionType": "regression",
    "candidateExerciseId": "F01-17",
    "candidateExerciseName": "雙腳提踵",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.nth.nhs.uk/resources/lower-limb-exercise-and-education/"
  },
  {
    "currentExerciseId": "F01-18",
    "currentExerciseName": "雙腳抬腳尖",
    "goalId": "G05",
    "transitionType": "progression",
    "candidateExerciseId": "F01-20",
    "candidateExerciseName": "單腳抬腳尖",
    "evidenceType": "Pending Evidence",
    "status": "Pending",
    "sourceUrl": ""
  },
  {
    "currentExerciseId": "F01-20",
    "currentExerciseName": "單腳抬腳尖",
    "goalId": "G05",
    "transitionType": "regression",
    "candidateExerciseId": "F01-18",
    "candidateExerciseName": "雙腳抬腳尖",
    "evidenceType": "Pending Evidence",
    "status": "Pending",
    "sourceUrl": ""
  },
  {
    "currentExerciseId": "F01-02",
    "currentExerciseName": "迷你深蹲",
    "goalId": "G02",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-03",
    "candidateExerciseName": "靠牆半蹲",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.southtees.nhs.uk/resources/functional-hip-strengthening-class/"
  },
  {
    "currentExerciseId": "F01-03",
    "currentExerciseName": "靠牆半蹲",
    "goalId": "G02",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-02",
    "candidateExerciseName": "迷你深蹲",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.southtees.nhs.uk/resources/functional-hip-strengthening-class/"
  },
  {
    "currentExerciseId": "F01-02",
    "currentExerciseName": "迷你深蹲",
    "goalId": "G03",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-03",
    "candidateExerciseName": "靠牆半蹲",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.southtees.nhs.uk/resources/functional-hip-strengthening-class/"
  },
  {
    "currentExerciseId": "F01-03",
    "currentExerciseName": "靠牆半蹲",
    "goalId": "G03",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-02",
    "candidateExerciseName": "迷你深蹲",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.southtees.nhs.uk/resources/functional-hip-strengthening-class/"
  },
  {
    "currentExerciseId": "F01-05",
    "currentExerciseName": "終末膝伸直",
    "goalId": "G03",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-06",
    "candidateExerciseName": "坐姿膝伸直",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.orthoinfo.org/en/recovery/knee-arthroscopy-exercise-guide"
  },
  {
    "currentExerciseId": "F01-06",
    "currentExerciseName": "坐姿膝伸直",
    "goalId": "G03",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-05",
    "candidateExerciseName": "終末膝伸直",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.orthoinfo.org/en/recovery/knee-arthroscopy-exercise-guide"
  },
  {
    "currentExerciseId": "F01-06",
    "currentExerciseName": "坐姿膝伸直",
    "goalId": "G03",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-08",
    "candidateExerciseName": "直腿抬腿",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.orthoinfo.org/en/recovery/knee-arthroscopy-exercise-guide"
  },
  {
    "currentExerciseId": "F01-08",
    "currentExerciseName": "直腿抬腿",
    "goalId": "G03",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-06",
    "candidateExerciseName": "坐姿膝伸直",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.orthoinfo.org/en/recovery/knee-arthroscopy-exercise-guide"
  },
  {
    "currentExerciseId": "F01-09",
    "currentExerciseName": "坐姿抬膝",
    "goalId": "G04",
    "transitionType": "progression",
    "candidateExerciseId": "F01-11",
    "candidateExerciseName": "站姿髖屈曲",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.plymouthhospitals.nhs.uk/display-pil/pil-preparing-for-your-hip-replacement-operation-6892/"
  },
  {
    "currentExerciseId": "F01-11",
    "currentExerciseName": "站姿髖屈曲",
    "goalId": "G04",
    "transitionType": "regression",
    "candidateExerciseId": "F01-09",
    "candidateExerciseName": "坐姿抬膝",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.plymouthhospitals.nhs.uk/display-pil/pil-preparing-for-your-hip-replacement-operation-6892/"
  },
  {
    "currentExerciseId": "F01-10",
    "currentExerciseName": "橋式",
    "goalId": "G04",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-12",
    "candidateExerciseName": "站姿髖伸展",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.dynamichealth.nhs.uk/help-and-advice/osteoarthritis-oa/"
  },
  {
    "currentExerciseId": "F01-12",
    "currentExerciseName": "站姿髖伸展",
    "goalId": "G04",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-10",
    "candidateExerciseName": "橋式",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://www.dynamichealth.nhs.uk/help-and-advice/osteoarthritis-oa/"
  },
  {
    "currentExerciseId": "F01-13",
    "currentExerciseName": "側躺髖外展",
    "goalId": "G04",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-15",
    "candidateExerciseName": "蚌殼式",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://med.virginia.edu/orthopaedic-surgery/sports-medicine/protocols/hip-rehab-exercises/"
  },
  {
    "currentExerciseId": "F01-15",
    "currentExerciseName": "蚌殼式",
    "goalId": "G04",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-13",
    "candidateExerciseName": "側躺髖外展",
    "evidenceType": "Engineering Rule",
    "status": "Confirmed",
    "sourceUrl": "https://med.virginia.edu/orthopaedic-surgery/sports-medicine/protocols/hip-rehab-exercises/"
  },
  {
    "currentExerciseId": "F01-15",
    "currentExerciseName": "蚌殼式",
    "goalId": "G04",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-16",
    "candidateExerciseName": "消防栓式",
    "evidenceType": "Engineering Rule",
    "status": "Draft",
    "sourceUrl": "https://www.sanfordhealth.org/-/media/org/files/medical-professionals/resources-and-education/hip-labrum-and-fai-post-surgical-rehabilitation-guideline.pdf"
  },
  {
    "currentExerciseId": "F01-16",
    "currentExerciseName": "消防栓式",
    "goalId": "G04",
    "transitionType": "same_goal_replacement",
    "candidateExerciseId": "F01-15",
    "candidateExerciseName": "蚌殼式",
    "evidenceType": "Engineering Rule",
    "status": "Draft",
    "sourceUrl": "https://www.sanfordhealth.org/-/media/org/files/medical-professionals/resources-and-education/hip-labrum-and-fai-post-surgical-rehabilitation-guideline.pdf"
  }
]);

/** NextCycleSelectionRules — decision-specific rows (reason templates, max replacements). */
export const F01_NEXT_CYCLE_SELECTION_RULES = Object.freeze([
  {
    "ruleId": "NC-M01",
    "decision": "maintain",
    "maxReplace": 0,
    "reasonTemplate": "本週條件符合維持；下一週沿用目前訓練配置，持續追蹤。",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-P01",
    "decision": "progress",
    "maxReplace": 1,
    "reasonTemplate": "本週符合進階候選條件；保留其餘訓練，只將 {current} 調整為同 Goal 的進階候選 {candidate}。",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-A01",
    "decision": "adjust",
    "maxReplace": 1,
    "reasonTemplate": "目前訓練有新的限制條件；系統先移除不合適動作，並提供同 Goal 的較保守或替代候選。",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-A02",
    "decision": "adjust",
    "maxReplace": 0,
    "reasonTemplate": "本週功能變化需要調整，但目前無法只靠 5xSTS 與完成紀錄判定是哪個動作造成差異；系統保留目前配置，僅列出同 Goal 替代／較保守候選供確認。",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-N01",
    "decision": "no_auto_decision",
    "maxReplace": 0,
    "reasonTemplate": "目前資料不足以支持下一階段自動調整，先保留目前紀錄並等待更多資料。",
    "status": "Confirmed"
  }
]);

/** NextCycleSelectionRules — general rules NC-G01..NC-G11 (traceability). */
export const F01_NEXT_CYCLE_GENERAL_RULES = Object.freeze([
  {
    "ruleId": "NC-G01",
    "rule": "Goal 不自動改變",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G02",
    "rule": "動作數量預設維持",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G03",
    "rule": "每週期最多替換 1 個主要動作",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G04",
    "rule": "Hard filter 優先權最高",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G05",
    "rule": "只用 Confirmed Transition 自動產生替換",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G06",
    "rule": "同一個 selectedGoalId",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G07",
    "rule": "不得跳級",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G08",
    "rule": "不得產生重複動作",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G09",
    "rule": "不自動改 repetitions / sets / load / tempo",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G10",
    "rule": "維持原排序位置",
    "status": "Confirmed"
  },
  {
    "ruleId": "NC-G11",
    "rule": "輸出是 proposed recommendation",
    "status": "Confirmed"
  }
]);
