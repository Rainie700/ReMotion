# F01 第一批 — 修改清單與還原方式

> **狀態：程式與驗收測試已撰寫。** 本機自動驗證結果見 `VERIFICATION_REPORT.md`（2026-10-21）。
> 瀏覽器、雲端與真人驗證仍未進行；雲端同步未驗證，不能視為已保存到雲端。

- 實作依據：`docs/specs/f01-batch1-daily-target-snapshot-spec.md`（定稿）
- 實作日期：2026-10-21
- 保留不動：5xSTS 座標修正與量測版本相容檢查（`js/ai/exercises/sitToStand/*`、`js/data/fa5xMeasurementCompatibility.js`、`js/data/trackingComparison.js` 都沒有修改）
- 沒有改動：偵測器、D5 規則、LLM 輸入結構、復健師課表流程

## 1. 備份與還原

修改前的原檔放在 `docs/verification/f01-batch1/backup-before/`（MD5 與當時的原檔一致）：

| 檔案 | 修改前 MD5 |
|---|---|
| `app.js` | `dc528e6ba03120b49ed59c61be633424` |
| `package.json` | `75c097c4cb8d94ba9a89141d12349e77` |
| `js/data/trackingCycleService.js` | `56fde2b2af94e86eb7f72a1e389063f7` |
| `js/data/analysisService.js` | `8cb334548a47c057080655fb2923957e` |

還原步驟（在專案根目錄執行）：

```sh
B=docs/verification/f01-batch1/backup-before
cp "$B/app.js" app.js
cp "$B/package.json" package.json
cp "$B/js/data/trackingCycleService.js" js/data/trackingCycleService.js
cp "$B/js/data/analysisService.js" js/data/analysisService.js
rm js/data/f01DailyTargets.js tests/f01DailyTargets.test.js
```

另外要手動還原 `tests/trackingTraining.test.js` 第 10 段（見第 2 節第 6 項）。

## 2. 修改檔案

| # | 檔案 | 類型 | 內容 |
|---|---|---|---|
| 1 | `js/data/f01DailyTargets.js` | 新增 | F01 偵測器目標規則表（F01-01～20）與版本；目標凍結（`freezeDailyTargets`、`buildDailyTarget`）；計量依據與一致性標示；目標摘要（`buildTargetSummary`、`sameTargetSummary`）；`buildTrainingAttempt` |
| 2 | `js/data/trackingCycleService.js` | 修改 | `ensureDailyTrainingSnapshot` 新增兩種模式與第 2 版欄位；新增 `checkF01FormalTrainingDay`、`getF01FormalTargetSummary`、`prepareF01FormalTraining`、`getFrozenDailyTarget`、`recordTrainingAttempt`；`recordExerciseCompletion` 的日期改為優先用 `planDateKey` |
| 3 | `js/data/analysisService.js` | 修改 | `withTrainingSourceFields` 在 `f01_cycle` 情境成立時寫入 `planDateKey`、`trainingStartedAt` |
| 4 | `app.js` | 修改 | 匯入 `sameTargetSummary`；`f01PlanDoseFor`、`withF01PlanDoseLabel` 改讀凍結值；`trainingRecordOptions` 帶入日期與開始時間；新增 `isF01FormalTrainingContext`、`F01_FORMAL_BLOCK_TEXT`、`returnToF01PlanForFormalBlock`、`prepareF01FormalTrainingTarget`、`passF01FinalCheck`；`goDetectionPrep` 加入準備階段；`startF01RecommendedTraining` 移除直接建立快照的呼叫；最外層 `openCameraPlaceholder` 包裝（最終核對）；`analysisService.onCreate` 監聽器在完成流程之後寫入嘗試清單 |
| 5 | `tests/f01DailyTargets.test.js` | 新增 | 規格第 7 節驗收案例 1–18 |
| 6 | `tests/trackingTraining.test.js` | 修改（第 10 段） | 原本斷言「建議頁開始訓練會直接建立快照」，規格 4.1 已改成走共用的準備階段，所以斷言隨之更新；並補上「優先使用 `planDateKey`」的檢查 |
| 7 | `package.json` | 修改 | 新增 `test:f01-daily-targets` |

## 3. 規格對應位置

| 規格 | 實作位置 |
|---|---|
| 3.1 第 2 版快照欄位 | `trackingCycleService.ensureDailyTrainingSnapshot` |
| 3.2 每個動作的凍結目標 | `f01DailyTargets.buildDailyTarget` / `resolvePlannedValues` |
| 3.3 計量依據、偵測器對照 | `f01DailyTargets.resolvePlanCountingBasis`、`F01_DETECTOR_TARGET_RULES`、`computeDetectorTarget`、`compareTargets` |
| 3.4 嘗試清單欄位 | `f01DailyTargets.buildTrainingAttempt` |
| 3.5 紀錄的新欄位 | `analysisService.withTrainingSourceFields`、`app.js trainingRecordOptions` |
| 4.1 兩種模式、不升級 | `ensureDailyTrainingSnapshot(mode)`；`startF01RecommendedTraining` |
| 4.2 準備階段 | `app.js goDetectionPrep` → `prepareF01FormalTrainingTarget` → `trackingCycleService.prepareF01FormalTraining`；讀取凍結值：`f01PlanDoseFor`、`withF01PlanDoseLabel`（`getExercisePageContext` 本身未改，透過 `f01PlanDoseFor` 取得凍結值） |
| 4.3 最終核對 | `app.js passF01FinalCheck`；最外層 `openCameraPlaceholder` 包裝（約 14788 行） |
| 4.4 日期歸屬 | `analysisService`（寫入）；`recordExerciseCompletion`、`recordTrainingAttempt`（讀取） |
| 4.5 無法正式開始 | `app.js returnToF01PlanForFormalBlock`、`F01_FORMAL_BLOCK_TEXT` |
| 4.6 寫入嘗試清單的核對 | `trackingCycleService.recordTrainingAttempt`；呼叫順序在 `analysisService.onCreate` 監聽器 |

## 4. 落地時發現的規格限制（未自行擴大範圍）

1. **寫入失敗只偵測本機寫入**：`trackingCyclesCollection.update` 是同步的本機寫入，雲端同步是非同步的。凍結時只能偵測本機寫入失敗；雲端同步之後才失敗的情況，無法在開始訓練前攔下。要完整符合「凍結寫入失敗不得開始」，需要另外決定是否等待雲端寫入完成。
2. **提示方式**：「重新顯示準備頁並提示」用的是重新渲染加上既有的 `alert()`，沒有新增任何 UI 元件。
3. **動作頁在準備階段之前的顯示**：如果當天已經有凍結快照，就顯示凍結值；還沒有時顯示即時預覽，第一次進入準備頁時才凍結。這符合規格「新版快照建立後」的前提。
4. **`F01-17`、`F01-18`、`F01-01～04`、`F01-10` 的型錄文字本輪沒有讀過**：計量依據在執行時依 3.3 規則判定；驗收案例 4 對 `F01-17` 預期為 `inconsistent`，要跑測試才能確認。

## 5. 尚未完成／待驗證

- 本批所有新程式與修改：**待驗證**（沒有執行測試）。
- 既有測試是否仍通過：**待驗證**。可能受影響的有：`trackingTraining`（第 10 段已更新）、`d5TherapistReview`（從原始碼重建 `f01PlanDoseFor` 等三個函式）、`flowDataQa`（正規表示式檢查）。
- Vite 建置：**待驗證**。
- 瀏覽器實測：**待驗證**。包括三個入口、換日（可改系統時間）、目標變更提示、跨午夜儲存。
- 雲端同步（Firestore）寫入第 2 版欄位：**待驗證**。
- 已知缺陷仍存在（規格第 2 節）：8 個動作忽略組數、6 個動作計量依據不同、完成天數準確度未驗證。

## 6. 後續驗證指令（在專案根目錄執行）

```sh
node tests/f01DailyTargets.test.js
node tests/trackingTraining.test.js
node tests/d5TherapistReview.test.js
node tests/flowDataQa.test.js
node tests/fiveTimesSitToStandAssessment.test.js
node tests/fa5xMeasurementCompatibility.test.js
npm test
npx vite build
```

`npm test` 的比較基準：修改前是 114/120 通過，6 項既有失敗分別是 `tracking`、`flow-qa`、`home-redesign`、`exercise-experience`、`self-practice-library`、`llm-weekly-summary`。本批新增一支測試，所以總數會變成 121 支。`flow-qa` 中與本批相關的正規表示式檢查在第 191 行，早於它原本失敗的第 204 行，所以會被執行到；這支測試仍應停在第 204 行同一個既有斷言（待驗證）。
