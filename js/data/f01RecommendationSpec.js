/**
 * GENERATED FILE — do not edit by hand.
 * Source of Truth: docs/specs/ReMotion復健資料庫_含F01推薦GoalMapping.xlsx
 * Source SHA-256:  5d5e692ae4b262186293bf123863099be40fa1693ae63283d998ddd3e5840271
 * Generator: scripts/generateF01RecommendationSpec.py
 *
 * F01_推薦GoalMapping / F01_Goal候選池 are ReMotion SYSTEM RECOMMENDATION RULES,
 * not clinical validation standards (README_推薦). Direct / Supporting are
 * recommendation match levels. Precautions / evidence status are copied
 * verbatim from each exercise sheet.
 */
export const F01_RECOMMENDATION_SPEC_SOURCE = Object.freeze({"file": "docs/specs/ReMotion復健資料庫_含F01推薦GoalMapping.xlsx", "sha256": "5d5e692ae4b262186293bf123863099be40fa1693ae63283d998ddd3e5840271"});

/** Goal pool (sheet F01_Goal候選池) — the candidate source used by the engine. */
export const F01_GOALS = Object.freeze([
  {
    "goalId": "G01",
    "label": "從椅子起身更順",
    "systemDefinition": "起身／坐站功能",
    "directExerciseIds": [
      "F01-04"
    ],
    "supportingExerciseIds": [
      "F01-01",
      "F01-10"
    ],
    "notes": "F01-04 為 5xSTS 最直接對應；Supporting 僅作相關輔助，不等同直接訓練目標。"
  },
  {
    "goalId": "G02",
    "label": "加強整體下肢力量",
    "systemDefinition": "下肢肌力／肌耐力",
    "directExerciseIds": [
      "F01-01",
      "F01-02",
      "F01-03",
      "F01-04",
      "F01-06",
      "F01-08",
      "F01-10",
      "F01-12",
      "F01-17"
    ],
    "supportingExerciseIds": [
      "F01-05",
      "F01-09",
      "F01-11",
      "F01-13",
      "F01-14",
      "F01-15",
      "F01-16",
      "F01-19"
    ],
    "notes": "用於 broad lower-limb strengthening；仍需再由限制、能力、器材與時間條件篩選。"
  },
  {
    "goalId": "G03",
    "label": "加強膝部活動與控制",
    "systemDefinition": "膝伸屈、股四頭肌、承重與膝部控制",
    "directExerciseIds": [
      "F01-02",
      "F01-03",
      "F01-05",
      "F01-06",
      "F01-07",
      "F01-08"
    ],
    "supportingExerciseIds": [
      "F01-01",
      "F01-04",
      "F01-13",
      "F01-14",
      "F01-15"
    ],
    "notes": "Direct 以膝部訓練為主；Supporting 為相關力線或複合下肢訓練。"
  },
  {
    "goalId": "G04",
    "label": "加強髖部與骨盆穩定",
    "systemDefinition": "髖屈伸／外展／內收／外旋、骨盆控制",
    "directExerciseIds": [
      "F01-09",
      "F01-10",
      "F01-11",
      "F01-12",
      "F01-13",
      "F01-14",
      "F01-15",
      "F01-16"
    ],
    "supportingExerciseIds": [
      "F01-19",
      "F01-20"
    ],
    "notes": "主要依原始 training_goal/target_muscle 中的髖部與骨盆控制內容整理。"
  },
  {
    "goalId": "G05",
    "label": "加強足踝力量與控制",
    "systemDefinition": "蹠屈、背屈、提踵、足踝單側控制",
    "directExerciseIds": [
      "F01-17",
      "F01-18",
      "F01-19",
      "F01-20"
    ],
    "supportingExerciseIds": [],
    "notes": "目前不為了湊數硬加 Supporting。"
  }
]);

/** Per-exercise mapping (sheet F01_推薦GoalMapping, reverse view of the pool): primaryGoalId / directGoalIds / supportingGoalIds. */
export const F01_EXERCISE_MAPPING = Object.freeze({
  "F01-01": {
    "name": "深蹲",
    "primaryGoalId": "G02",
    "directGoalIds": [
      "G02"
    ],
    "supportingGoalIds": [
      "G01",
      "G03"
    ],
    "recommendationRole": "複合下肢肌力",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-02": {
    "name": "迷你深蹲",
    "primaryGoalId": "G03",
    "directGoalIds": [
      "G02",
      "G03"
    ],
    "supportingGoalIds": [],
    "recommendationRole": "膝部承重／基礎肌力",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-03": {
    "name": "靠牆半蹲",
    "primaryGoalId": "G03",
    "directGoalIds": [
      "G02",
      "G03"
    ],
    "supportingGoalIds": [],
    "recommendationRole": "支撐型膝部肌力",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-04": {
    "name": "坐姿起立",
    "primaryGoalId": "G01",
    "directGoalIds": [
      "G01",
      "G02"
    ],
    "supportingGoalIds": [
      "G03"
    ],
    "recommendationRole": "5xSTS 最直接對應訓練",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-05": {
    "name": "終末膝伸直",
    "primaryGoalId": "G03",
    "directGoalIds": [
      "G03"
    ],
    "supportingGoalIds": [
      "G02"
    ],
    "recommendationRole": "膝伸直專項",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-06": {
    "name": "坐姿膝伸直",
    "primaryGoalId": "G03",
    "directGoalIds": [
      "G02",
      "G03"
    ],
    "supportingGoalIds": [],
    "recommendationRole": "膝伸肌訓練",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-07": {
    "name": "坐姿膝彎曲",
    "primaryGoalId": "G03",
    "directGoalIds": [
      "G03"
    ],
    "supportingGoalIds": [],
    "recommendationRole": "膝屈曲活動度",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-08": {
    "name": "直腿抬腿",
    "primaryGoalId": "G03",
    "directGoalIds": [
      "G02",
      "G03"
    ],
    "supportingGoalIds": [],
    "recommendationRole": "股四頭肌／靜態控制",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-09": {
    "name": "坐姿抬膝",
    "primaryGoalId": "G04",
    "directGoalIds": [
      "G04"
    ],
    "supportingGoalIds": [
      "G02"
    ],
    "recommendationRole": "基礎髖屈訓練",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-10": {
    "name": "橋式",
    "primaryGoalId": "G04",
    "directGoalIds": [
      "G02",
      "G04"
    ],
    "supportingGoalIds": [
      "G01"
    ],
    "recommendationRole": "臀髖／後側鏈輔助",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-11": {
    "name": "站姿髖屈曲",
    "primaryGoalId": "G04",
    "directGoalIds": [
      "G04"
    ],
    "supportingGoalIds": [
      "G02"
    ],
    "recommendationRole": "站姿髖屈／單腳控制",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-12": {
    "name": "站姿髖伸展",
    "primaryGoalId": "G04",
    "directGoalIds": [
      "G02",
      "G04"
    ],
    "supportingGoalIds": [],
    "recommendationRole": "臀肌／髖伸展",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-13": {
    "name": "側躺髖外展",
    "primaryGoalId": "G04",
    "directGoalIds": [
      "G04"
    ],
    "supportingGoalIds": [
      "G02",
      "G03"
    ],
    "recommendationRole": "髖外展／骨盆穩定",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-14": {
    "name": "側躺髖內收",
    "primaryGoalId": "G04",
    "directGoalIds": [
      "G04"
    ],
    "supportingGoalIds": [
      "G02",
      "G03"
    ],
    "recommendationRole": "髖內收／內側鏈",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-15": {
    "name": "蚌殼式",
    "primaryGoalId": "G04",
    "directGoalIds": [
      "G04"
    ],
    "supportingGoalIds": [
      "G02",
      "G03"
    ],
    "recommendationRole": "髖外旋／骨盆控制",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-16": {
    "name": "消防栓式",
    "primaryGoalId": "G04",
    "directGoalIds": [
      "G04"
    ],
    "supportingGoalIds": [
      "G02"
    ],
    "recommendationRole": "髖＋核心控制",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-17": {
    "name": "雙腳提踵",
    "primaryGoalId": "G05",
    "directGoalIds": [
      "G02",
      "G05"
    ],
    "supportingGoalIds": [],
    "recommendationRole": "基礎蹠屈訓練",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-18": {
    "name": "雙腳抬腳尖",
    "primaryGoalId": "G05",
    "directGoalIds": [
      "G05"
    ],
    "supportingGoalIds": [],
    "recommendationRole": "基礎背屈訓練",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-19": {
    "name": "單腳提踵",
    "primaryGoalId": "G05",
    "directGoalIds": [
      "G05"
    ],
    "supportingGoalIds": [
      "G02",
      "G04"
    ],
    "recommendationRole": "單側足踝控制",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  },
  "F01-20": {
    "name": "單腳抬腳尖",
    "primaryGoalId": "G05",
    "directGoalIds": [
      "G05"
    ],
    "supportingGoalIds": [
      "G04"
    ],
    "recommendationRole": "單側背屈控制",
    "mappingBasis": "primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步",
    "mappingStatus": "System Rule - needs validation"
  }
});

/** Verbatim fields from sheets F01-01 .. F01-20. */
export const F01_EXERCISE_SPEC = Object.freeze({
  "F01-01": {
    "precautions": "依個人能力循序漸進；若持續出現膝痛或下背痛應停止。部分長者蹲後起身可能出現頭暈，應注意安全；需要時可使用足夠穩固的椅子或板凳提供支撐。膝部退化者應以不引起疼痛的下蹲程度為原則。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "主要作為下肢肌力訓練動作。 國民健康署指出，下蹲可使下肢與臀部肌肉得到鍛鍊，並表示長者練習下蹲可提升肌力；NSCA亦將Squat描述為下肢訓練的重要動作。"
  },
  "F01-02": {
    "precautions": "依個人關節承受能力循序漸進；過程中若膝關節前方或深層出現刺痛應立即停止。高齡長者或平衡不佳者，強烈建議雙手輕扶穩固椅子或靠牆執行以防跌倒；膝關節退化或髕骨軟骨軟化者，應以「無痛範圍」為唯一原則，切勿強行加大下蹲深度。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "主要作為膝關節早期復健與功能性下肢肌力訓練動作。衛生福利部國民健康署指出，微蹲/屈膝運動可強化大腿前側股四頭肌，分擔膝關節受力；AAOS 亦指出此動作可在最小化髕股關節壓力的前提下，重建膝關節閉鎖動力鏈的承重能力與本體感覺。"
  },
  "F01-03": {
    "precautions": "依個人關節耐受度循序漸進；若過程中膝蓋前方出現銳痛或刺痛應立即停止。務必穿著防滑鞋款並在防滑地面執行，避免腳底打滑；膝關節退化者應特別注意雙腳向前跨出足夠距離，使下蹲時脛骨接近垂直地面，以防髕骨壓力過大。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為下肢肌力與膝關節穩定度訓練動作。衛生福利部國民健康署指出，背部靠牆微蹲可藉由牆面分擔身體重心，減少關節晃動並鍛鍊大腿肌力；AAOS 亦指出此動作透過牆面支撐躯幹，能讓股四頭肌在安全力線下進行肌力強化，降低失衡風險。"
  },
  "F01-04": {
    "precautions": "依個人關節狀況循序漸進；若起立過程膝關節或下背出現持續劇痛應立即停止。測試與練習時務必使用穩固無輪、靠牆放置的椅子以防滑動翻覆；起立後若出現頭暈、眼前發黑應立即坐穩休息，注意防跌安全。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為下肢肌耐力與日常功能性動態控制動作。衛生福利部國民健康署指出，反覆練習從椅子站起可有效維持長者大腿與臀部力量，減少跌倒風險；CDC 亦指出坐站轉換能有效改善長者日常生活獨立起坐功能與膝關節支撐力。"
  },
  "F01-05": {
    "precautions": "依個人關節伸展耐受度循序漸進；若伸展過程中膝後側膕窩或髕骨深層出現劇烈刺痛應立即停止。嚴禁過度暴力將膝關節用力往後「甩撞」卡死，應強調肌肉主動等長收縮；膝關節有過伸（反屈）傾向者，伸直時應控制在與對側對稱之中立位，避免壓迫關節後囊。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為強化股內側肌與恢復膝關節末端完全伸直（0° extension）的主動控制訓練。衛生福利部國民健康署指出，維持大腿肌力與伸展膝部有助分擔關節壓力；AAOS 亦指出 TKE 動作有助於重建膝關節在站姿承重期末的關節穩定度與自然鎖定機制（Screw-home mechanism）。"
  },
  "F01-06": {
    "precautions": "依個人關節伸展活動度循序漸進；若抬腿過程中髕骨深層或膝蓋周圍出現尖銳刺痛應立即停止。動作強調平穩慢速，嚴禁利用小腿快速甩動衝擊關節；膝關節嚴重退化或大腿後側膕繩肌緊繃者，若伸直末端出現拉扯感，應以不後仰軀幹之舒適伸展角度為準，切勿勉強硬踢。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為強化大腿前側肌力與增進膝關節主動伸直角度（Active Extension ROM）之功能訓練。衛生福利部國民健康署指出，坐在椅子上將小腿慢慢抬平伸直，可有效強化股四頭肌並提升上下樓梯與行走的穩定度；AAOS 亦指出此動作能改善膝關節伸直延展性與避免關節僵硬。"
  },
  "F01-07": {
    "precautions": "依個人關節角度受限狀況循序漸進；若後滑時膝關節前方髕骨或關節間隙出現尖銳刺痛應立即停止。動作過程中足底應維持平穩滑動，避免猛烈向後拉扯誘發膕繩肌痙攣抽筋；膝關節急性水腫發炎或剛接受半月板修補者，應嚴格遵照醫師指示限制後滑屈曲角度，切勿強行硬扳硬拉。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "恢復並提升膝關節主動屈曲活動度（Active Flexion ROM），預防術後關節囊沾黏與組織纖維化。衛生福利部國民健康署指出，坐姿下規律活動膝關節可促進關節液循環、改善關節僵硬；AAOS 亦指出坐姿滑腳能在重力引導與足底滑動支撐下，以最小關節衝擊循序恢復深屈膝功能。"
  },
  "F01-08": {
    "precautions": "依個人核心與關節能力循序漸進；若抬腿過程中下背部或膝關節前方出現劇烈刺痛應立即停止。動作過程中下背部應維持緊貼地面，嚴禁腰椎懸空反折以防腰肌勞損；膝關節急性術後患者若無法主動伸直膝蓋（出現 Extension Lag），應在專業物理治療師指導下進行輔助，切勿以屈膝姿勢硬抬。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為膝關節無負重狀態下強化股四頭肌與提升下肢靜態控制力之復健訓練。衛生福利部國民健康署指出，躺姿或坐姿直膝抬腿可在不增加膝關節軟骨負擔下鍛鍊大腿前側肌肉；AAOS 亦指出此動作可克服術後「伸直滯後（Extension Lag）」，重建下肢主動抬腿鎖定功能。"
  },
  "F01-09": {
    "precautions": "維持直立坐姿；若需要可扶住椅子保持穩定，動作以可控制的範圍進行",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "進行坐姿髖屈曲訓練，以維持／訓練髖部肌力與活動能力。"
  },
  "F01-10": {
    "precautions": "依個人腰椎與骨盆耐受度循序漸進；若抬臀過程中下背部腰椎出現尖銳刺痛應立即停止。動作中嚴禁用肋骨外翻與過度反折腰椎來換取抬高高度；頸椎或胸椎有骨質疏鬆或退化病史者，應避免過度壓迫上背肩頸，身體支撐點應落在肩胛骨區間而非頸椎。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "主要作為活化臀大肌、強化後側動力鏈與提升骨盆核心穩定度之訓練動作。衛生福利部國民健康署指出，躺姿抬臀可喚醒久坐無力的臀部肌群，改善骨盆前傾與下背痠痛；NSCA 亦指出橋式能有效建立下背與髖部的閉鎖動力鏈協調性。"
  },
  "F01-11": {
    "precautions": "依個人平衡能力循序漸進；若動作中腹股溝深層或支撐側髖部出現尖銳刺痛應立即停止。平衡感不佳或高齡長者必須手扶穩固家具執行，避免單腳懸空失去平衡跌倒；曾接受全人工髖關節置換手術（THA）者，應嚴格遵守醫師限制（避免屈髖超過 90°），切勿過度抬高大腿以防關節脫位。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為強化單側髖屈肌力、增進單腳站立動態平衡與提升步行跨步擺盪期之功能性訓練。衛生福利部國民健康署指出，站姿手扶椅背練習前抬腿，可強化大腿前側肌力並提升高齡者行走跨越障礙能力以預防跌倒；AAOS 亦指出此動作能重建下肢步態動力鏈之負重與跨步協調性。"
  },
  "F01-12": {
    "precautions": "依個人關節活動度與腰椎耐受度循序漸進；若動作中下背部或髖關節前方出現刺痛應立即停止。動作過程中上半身務必維持挺直，嚴禁利用折腰或甩腿衝撞換取抬高幅度，避免腰椎壓迫；下背痛或腰椎滑脫患者，應特別注意收緊腹部核心，在無痛且腰椎不動的範圍內微幅後抬。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為強化臀大肌肌力、增進單腳站立平衡與改善步態推蹬期（Push-off）髖伸展能力之訓練。衛生福利部國民健康署指出，站姿手扶椅背練習向後抬腿，能強化臀部肌力、穩定骨盆並改善長者行走步態；AAOS 亦指出此動作可增進髖關節後側活動度並預防久坐導致的髖屈肌攣縮。"
  },
  "F01-13": {
    "precautions": "依個人關節活動度與肌力循序漸進；若動作中髖關節外側大轉子或腹股溝出現尖銳刺痛應立即停止。動作中嚴禁為了追求抬高高度而將骨盆向後翻倒，骨盆前傾或後倒會完全失去孤立訓練臀中肌之效益；曾接受全人工髖關節置換手術（THA）者，應遵守主治醫師指示之活動度限制，避免過度外展或伴隨不當內外旋轉。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為強化單側臀中肌肌力、提升單腳站立期骨盆水平抗側傾能力（預防屈髖垂臀 Trendelenburg gait）及增進膝關節額狀面力線控制之訓練。衛生福利部國民健康署指出，側躺練習側抬腿可強化臀部兩側肌力以穩定骨盆平衡、降低跌倒風險；AAOS 亦指出此動作能改善下肢承重時關節穩定度並預防膝內扣（Knee Valgus）。"
  },
  "F01-14": {
    "precautions": "依個人關節活動度與肌力循序漸進；若動作中腹股溝內側或恥骨聯合處出現銳痛應立即停止。動作中軀幹與骨盆應維持垂直地面，嚴禁向後翻倒借力以防內收肌拉傷；曾有腹股溝疝氣、恥骨炎或全人工髖關節置換病史者，應在專業物理治療師評估指導下操作。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "主要作為強化大腿內側內收肌群力量、增進骨盆閉鎖穩定度及維持下肢冠狀面（額狀面）內外側肌力平衡之訓練。衛生福利部國民健康署指出，側躺練習大腿內側肌力可強化骨盆與膝關節支撐力；運動醫學指引亦指出此動作能預防髕骨外翻、改善膝內扣（Knee Valgus）及降低腹股溝運動拉傷風險。"
  },
  "F01-15": {
    "precautions": "依個人關節活動度與肌力循序漸進；若動作中髖關節深層出現夾擠銳痛應立即停止。動作中嚴禁為了追求膝蓋開闔幅度而將骨盆向後滾動，一旦骨盆後倒即失去鍛鍊目標肌群之效果；曾接受全人工髖關節置換手術（THA）者，應嚴格遵從主治醫師活動限制指引。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為強化臀中肌後束與髖外旋肌力、改善動態下肢排列及防止承重時膝內扣（Knee Valgus）之基礎訓練。衛生福利部國民健康署指出，側躺開合雙膝可鍛鍊臀部深層肌力以穩定骨盆；AAOS 亦指出此動作能改善步態中下肢生物力學力線並減輕膝關節內側與髕骨壓力。"
  },
  "F01-16": {
    "precautions": "依個人關節活動度與肌力循序漸進；若動作中髖關節外側、腹股溝或手腕出現尖銳刺痛應立即停止。手腕不適者可改為手肘著地（前臂支撐跪姿）或手握拳支撐；髕骨跪地疼痛者應於膝下加墊軟毛巾；嚴禁為了盲目追求抬高高度而扭轉脊椎與骨盆，避免下背拉傷。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為強化臀中肌與外展/外旋肌力、提升核心抗旋轉穩定度（Anti-Rotation Core Stability）及改善骨盆動態控制之功能性訓練。衛生福利部國民健康署指出，跪姿抬腿運動能同時鍛鍊腰臀部深層肌力以穩固骨盆；AAOS 亦指出此動作能改善骨盆在非對稱承重下的排列，並減輕行走時膝關節內側受力。"
  },
  "F01-17": {
    "precautions": "需要時可扶穩固支撐物以維持平衡；動作應緩慢且可控制。",
    "evidenceStatus": "Supported（有依據）",
    "trainingGoal": "訓練小腿肌群肌力，提升雙腳站立提踵能力。"
  },
  "F01-18": {
    "precautions": "必要時扶穩固支撐物維持平衡，動作保持緩慢且可控制。",
    "evidenceStatus": "Supported（有依據）",
    "trainingGoal": "訓練踝關節背屈動作與小腿前側肌群肌力，維持踝部活動與控制能力"
  },
  "F01-19": {
    "precautions": "依個人關節活動度與肌力循序漸進；若動作中阿基里斯腱中段或附著處、足底筋膜或小腿深層出現尖銳刺痛應立即停止。手部僅可作為指尖輔助平衡，嚴禁手部借力下推椅背；曾有阿基里斯腱斷裂術後或重度慢性肌腱炎患者，必須在物理治療師評估承重耐受度後方可執行單腳提踵，嚴禁快速彈跳操作。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "作為強化單側小腿深淺層肌力與肌耐力、提升阿基里斯腱承重剛性（Tendon stiffness）、增進單腳動態平衡及改善運動衝刺與跳躍推蹬能力之進階訓練。衛生福利部國民健康署指出，單腳平衡與墊腳訓練能提升關節本體感覺並強化足踝支撐力；運動醫學指引亦指出此動作為評估單側下肢功能性肌力恢復（Limb Symmetry Index, LSI）的關鍵指標。"
  },
  "F01-20": {
    "precautions": "應於穩固支撐物旁進行；若無法安全維持單側站立，應先使用雙腳抬腳尖版本。",
    "evidenceStatus": "Needs Modify（需修改）",
    "trainingGoal": "訓練單側踝關節背屈控制，並增加站姿下的平衡與單側控制需求。"
  }
});

/** Rule table (sheet 推薦規則_MVP), kept for traceability. */
export const F01_RECOMMENDATION_RULES = Object.freeze([
  {
    "ruleId": "R00",
    "stage": "品質門檻",
    "input": "assessment.status",
    "rule": "只有 completed 可進推薦；incomplete / invalid 不進推薦",
    "action": "不通過則要求重新評估",
    "uiReason": "本次評估未完成或量測無效，請重新評估",
    "ruleType": "Required Gate"
  },
  {
    "ruleId": "R01",
    "stage": "功能構面",
    "input": "assessmentType / domain",
    "rule": "5xSTS 對應 F01；候選池只取 F01",
    "action": "鎖定 F01 候選池",
    "uiReason": "本次評估屬於下肢功能",
    "ruleType": "Required Rule"
  },
  {
    "ruleId": "R02",
    "stage": "訓練目標",
    "input": "selectedGoal",
    "rule": "依 F01_Goal候選池：Direct 優先，Supporting 次之",
    "action": "建立候選清單",
    "uiReason": "符合你選擇的訓練目標",
    "ruleType": "Primary Ranking"
  },
  {
    "ruleId": "R03",
    "stage": "限制／不適",
    "input": "userLimitations + precautions",
    "rule": "有明確不適或限制且不適合者排除",
    "action": "排除候選",
    "uiReason": "此動作因目前限制未納入推薦",
    "ruleType": "Hard Filter"
  },
  {
    "ruleId": "R04",
    "stage": "器材",
    "input": "availableEquipment",
    "rule": "缺少必要器材者排除；正式器材欄位尚待資料庫補齊",
    "action": "排除候選",
    "uiReason": "符合目前可使用的器材條件",
    "ruleType": "Hard Filter / Data Gap"
  },
  {
    "ruleId": "R05",
    "stage": "能力程度",
    "input": "selfRatedAbility + difficulty",
    "rule": "可作排序條件，但目前難度映射尚未完成驗證",
    "action": "相符者優先；不得用 5xSTS 秒數直接推定難度",
    "uiReason": "符合目前設定的能力程度",
    "ruleType": "Pending Mapping"
  },
  {
    "ruleId": "R06",
    "stage": "可用時間",
    "input": "availableTime",
    "rule": "先用於限制推薦數量／課表長度，不宣稱精準總訓練分鐘",
    "action": "控制輸出 1–3 個動作",
    "uiReason": "符合本次可使用的訓練時間",
    "ruleType": "MVP Engineering Rule"
  },
  {
    "ruleId": "R07",
    "stage": "AI 支援",
    "input": "aiSupported",
    "rule": "相同條件下，支援 AI 偵測者可優先",
    "action": "排序較前",
    "uiReason": "此動作支援即時動作辨識與回饋",
    "ruleType": "Secondary Ranking"
  },
  {
    "ruleId": "R08",
    "stage": "多樣性",
    "input": "selected recommendations",
    "rule": "避免 3 個動作功能完全重複",
    "action": "保留主要＋輔助訓練組合",
    "uiReason": "",
    "ruleType": "Engineering Rule"
  },
  {
    "ruleId": "R09",
    "stage": "輸出數量",
    "input": "candidate list",
    "rule": "最終輸出 1–3 個動作",
    "action": "產生推薦結果",
    "uiReason": "",
    "ruleType": "MVP UI Rule"
  },
  {
    "ruleId": "R10",
    "stage": "推薦理由",
    "input": "matched conditions",
    "rule": "理由必須由實際匹配條件組成",
    "action": "輸出可追溯理由",
    "uiReason": "功能目標＋能力／器材／時間等實際符合條件",
    "ruleType": "Required Explainability"
  },
  {
    "ruleId": "R11",
    "stage": "首次 5xSTS",
    "input": "totalDurationMs",
    "rule": "目前不以總秒數直接決定難度",
    "action": "保存為個人 baseline",
    "uiReason": "本次結果已保存，供後續比較",
    "ruleType": "Current Limitation"
  },
  {
    "ruleId": "R12",
    "stage": "歷次評估",
    "input": "previous + current",
    "rule": "有第二次以上有效結果才比較前後變化",
    "action": "先顯示變化，暫不自動進退階",
    "uiReason": "與前次相比的變化",
    "ruleType": "Future Phase"
  },
  {
    "ruleId": "R13",
    "stage": "進退階",
    "input": "change + completionRate + discomfort",
    "rule": "目前不設定硬門檻",
    "action": "暫不自動升降難度",
    "uiReason": "",
    "ruleType": "Needs Evidence / Expert Validation"
  }
]);

/** Differences between F01_Goal候選池 and F01_推薦GoalMapping found at generation time (must be empty; the engine follows F01_Goal候選池). */
export const F01_SPEC_CONSISTENCY_ISSUES = Object.freeze([]);
