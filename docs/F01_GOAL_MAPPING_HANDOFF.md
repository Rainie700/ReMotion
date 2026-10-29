# F01 目標對應交接表（評估 → 訓練需求 → 動作）

- 日期：2026-10-27
- 性質：只從專案擷取，沒有新增研究，沒有修改程式，沒有跑測試。
- 來源：
  - `docs/specs/ReMotion復健資料庫_含F01推薦GoalMapping.xlsx`：工作表 README_推薦、F01_Goal候選池、F01_推薦GoalMapping、推薦規則_MVP；
  - 由它產生的 `js/data/f01RecommendationSpec.js`；
  - 引擎 `js/data/f01GoalRecommendation.js`；入口 `app.js` 的 `generateF01RecommendationFromSetup`。

## 1～3. 目標、動作與對應來源

| 目標 | 名稱（患者看到的） | 系統定義 | Direct 動作 | Supporting 動作 | 候選池備註（原文） |
|---|---|---|---|---|---|
| G01 | 從椅子起身更順 | 起身／坐站功能 | F01-04 坐姿起立 | F01-01 深蹲、F01-10 橋式 | F01-04 為 5xSTS 最直接對應；Supporting 僅作相關輔助，不等同直接訓練目標。 |
| G02 | 加強整體下肢力量 | 下肢肌力／肌耐力 | F01-01 深蹲、F01-02 迷你深蹲、F01-03 靠牆半蹲、F01-04 坐姿起立、F01-06 坐姿膝伸直、F01-08 直腿抬腿、F01-10 橋式、F01-12 站姿髖伸展、F01-17 雙腳提踵 | F01-05 終末膝伸直、F01-09 坐姿抬膝、F01-11 站姿髖屈曲、F01-13 側躺髖外展、F01-14 側躺髖內收、F01-15 蚌殼式、F01-16 消防栓式、F01-19 單腳提踵 | 用於 broad lower-limb strengthening；仍需再由限制、能力、器材與時間條件篩選。 |
| G03 | 加強膝部活動與控制 | 膝伸屈、股四頭肌、承重與膝部控制 | F01-02 迷你深蹲、F01-03 靠牆半蹲、F01-05 終末膝伸直、F01-06 坐姿膝伸直、F01-07 坐姿膝彎曲、F01-08 直腿抬腿 | F01-01 深蹲、F01-04 坐姿起立、F01-13 側躺髖外展、F01-14 側躺髖內收、F01-15 蚌殼式 | Direct 以膝部訓練為主；Supporting 為相關力線或複合下肢訓練。 |
| G04 | 加強髖部與骨盆穩定 | 髖屈伸／外展／內收／外旋、骨盆控制 | F01-09 坐姿抬膝、F01-10 橋式、F01-11 站姿髖屈曲、F01-12 站姿髖伸展、F01-13 側躺髖外展、F01-14 側躺髖內收、F01-15 蚌殼式、F01-16 消防栓式 | F01-19 單腳提踵、F01-20 單腳抬腳尖 | 主要依原始 training_goal/target_muscle 中的髖部與骨盆控制內容整理。 |
| G05 | 加強足踝力量與控制 | 蹠屈、背屈、提踵、足踝單側控制 | F01-17 雙腳提踵、F01-18 雙腳抬腳尖、F01-19 單腳提踵、F01-20 單腳抬腳尖 | （無） | 目前不為了湊數硬加 Supporting。 |

**對應關係的來源與狀態**（適用於全部 20 個動作）

| 項目 | 專案記載 |
|---|---|
| 對應依據（`mappingBasis`） | 「primary_goal 依原始 training_goal / target_muscle 定位；Direct / Supporting 與 F01_Goal候選池同步」 |
| `mappingStatus` | 20 個動作都是 **System Rule - needs validation** |
| README_推薦 | 「Goal Mapping 是 ReMotion 的系統推薦規則，不是臨床驗證標準。分類依原始 exercise sheet 的 training_goal / target_muscle 整理，仍需後續實測／專家確認。」 |
| 外部來源 | 對應關係本身**沒有外部文獻來源**。各動作工作表的 training_goal、target_muscle 有各自的引用（例如 NHS、AAOS、國健署），但專案內沒有核實原文的紀錄 |
| 一致性 | F01_Goal候選池是正式來源，F01_推薦GoalMapping 是反向檢視；產生器記錄的不一致數為 0（`F01_SPEC_CONSISTENCY_ISSUES = []`） |
| 程式另外排除的動作 | F01-19 因計數方式待定，不列入自動候選（`f01DailyTargets.js` 的 `F01_AUTO_RECOMMENDATION_EXCLUSIONS`）。這不是對應表的規則 |

## 4. 五次坐站結果與五個目標的連結規則

**沒有。** 專案中沒有任何規則依五次坐站的結果（秒數、完成狀態以外的數值）選擇或建議 G01～G05。目標由患者在「設定這次訓練需求」頁自己選。

相關的明文規定：
- 推薦規則_MVP R11：「目前不以總秒數直接決定難度」；R05：「不得用 5xSTS 秒數直接推定難度」。
- README_推薦「不要做」：「不要用 5xSTS 總秒數直接推定訓練難度；不要自行補 clinical cutoff。」
- G01 備註「F01-04 為 5xSTS 最直接對應」：指的是**動作**與測驗相同，不是依結果選擇目標的規則。
- 下一階段（D5）會用前後兩次的時間差，但只用來判定維持／進階／調整，而且目標不變（NC-G01）。D5 不選擇目標。

## 5. 首次推薦實際使用的評估欄位

| 欄位 | 用途 | 位置 |
|---|---|---|
| `result.status`（沒有時改看 `repCount >= 5` 且 `totalDurationMs` 為有限數字） | 判斷是否完成；只有 `completed` 才能產生推薦（R00） | `app.js` 的 `getFa5xResultStatus`；`f01GoalRecommendation.js` R00 |
| `assessmentType` | 必須是 `five_times_sit_to_stand`（R01） | `resolveAssessmentType`；R01 |
| session `id` | 記為推薦的 `sourceAssessmentId` | `generateF01GoalRecommendation` |
| 以下只用於**建立週期**，不影響選動作 | | |
| `patientId`、session `status`、`result.assessmentRole` | 確認歸屬、已完成，而且不是再評估或下一週期的基準評估 | `trackingCycleService.createOrGetTrackingCycle` |
| `result.algorithmVersion`、`geometryCoordinateSpace` | 必須是現行的量測版本，才能建立新週期 | `isCurrentFa5xMeasurement` |
| `result.measuredAt`（沒有時用 `completedAt`） | 週期第 1 天 | 同上 |
| `totalDurationMs`、`repCount`、量測日期 | **僅顯示**在推薦頁的「推薦依據」，不參與排序或選動作 | `app.js` 推薦結果頁 |

選動作實際使用的**非評估**輸入：
- 目標 G01～G05；
- 可用時間：10／15／20 分鐘只決定 1／2／3 個動作；
- 限制 L01～L05：比對動作注意事項的原文字串。

排序順序：Direct → Supporting → AI 支援（目前 20 個動作全部支援）→ 主要目標交替 → 動作編號。

**舊路徑**：`js/data/f01Recommendation.js` 的 `buildF01CandidatePool` 用「與 F01-04 共用目標肌群」標記關聯，並使用自評能力。這不是 G01～G05 的對應。程式註解說 5xSTS 結果頁已不再進入這條路徑，但先前的查核沒有在畫面上確認。
