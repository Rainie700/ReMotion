# F01 第一批 — 本機自動驗證報告

> **性質：本機、合成資料的工程驗證。** 不是真人驗證，也不是完成天數的準確度驗證。
> 沒有使用正式使用者資料，沒有部署，沒有推送，沒有進入第二批。

- 驗證日期：2026-10-21；Node v24.18.0；Windows 11
- 依據：`docs/specs/f01-batch1-daily-target-snapshot-spec.md`；修改清單見 `CHANGELIST.md`
- 原始輸出：`results/` 資料夾

## 0. 雲端保存狀態（明確聲明）

**目前「開始正式訓練前」只確認了本機凍結保存，雲端同步沒有驗證。**
- 凍結快照寫入的是 `trackingCyclesCollection.update`，這是同步的本機寫入；只有本機寫入失敗會擋下開始訓練。
- 寫到 Firestore 的雲端同步是之後非同步進行的，本輪沒有測試，也不會等它完成。
- 所以**不能**說凍結目標或嘗試清單「已保存到雲端」。

## 1. 開始前的核對：F01-17 型錄

依實際型錄（`js/data/rehabExercises.js`）：
- `repetitions: "10~15次"`、`sets: "2-3組"`、`defaultSets: 2`、`defaultRepetitions: 10`
- 偵測器（AK05 雙腳提踵）不記錄左右

依規格 3.3：
- 型錄文字沒有「每側」或「交替」，偵測器也不分左右 → 計畫計量依據為 `total`，計畫量 2 × 10 = **20**。
- 偵測器只取每組次數 → 目標 **10**（`reps_only_total`）。
- 標示結果為 **`inconsistent`**，和測試預期一致，**預期沒有改**。

## 2. 測試結果

| 測試 | 結果 | 輸出檔 |
|---|---|---|
| `tests/f01DailyTargets.test.js`（本批新增，案例 1–18） | 通過（exit 0） | `results/f01DailyTargets.txt` |
| `tests/trackingTraining.test.js` | 通過 | `results/trackingTraining.txt` |
| `tests/d5TherapistReview.test.js` | 通過 | `results/d5TherapistReview.txt` |
| `tests/flowDataQa.test.js` | 失敗，屬於**原有失敗**（見第 4 節） | `results/flowDataQa.txt` |
| `tests/fiveTimesSitToStandAssessment.test.js` | 通過 | `results/fiveTimesSitToStandAssessment.txt` |
| `tests/fa5xMeasurementCompatibility.test.js` | 通過 | `results/fa5xMeasurementCompatibility.txt` |
| `npm test`（`node scripts/runAllTests.mjs`） | **115 / 121** | `results/npm_test_after.txt` |
| `npx vite build` | 成功 | `results/vite_build_after.txt` |

`trackingTraining` 輸出中的 `listener boom`，是該測試第 9 段故意丟出的錯誤（用來驗證監聽器錯誤不會中斷儲存），不是失敗。

**防偽陰性檢查**（新測試第一次執行就通過，所以另外確認它真的會抓到錯誤）：分別暫時破壞下列三項，新測試都會失敗；還原後檔案逐位元相同，測試重新通過。
- 移除完成判定中的 `planDateKey` 優先 → 在第 432 行失敗
- 停用讀取凍結值 → 在第 162 行失敗
- 停用最終核對 → 在第 385 行失敗

## 3. 本輪修正內容

- **沒有任何本批造成的錯誤需要修正。** 程式和斷言都沒有改動。
- 唯一改動：`tests/f01DailyTargets.test.js` 最後一行的輸出文字。原本寫的是撰寫階段的「written … 待驗證 until run」，改為說明實際結果。這不影響任何斷言。

## 4. 失敗項目對照（以修改前備份為基準）

**對照方法**
1. 在暫存區複製一份專案。
2. 用 `backup-before/` 還原 4 個檔案（MD5 已核對）。
3. 刪除本批新增的檔案，並把 `tests/trackingTraining.test.js` 第 10 段還原為本 session 開始前的原文（逐字比對相同）。
4. 共用同一份 `node_modules` 執行完整測試，結果存在 `results/npm_test_baseline_before.txt`。
5. 逐支比對每個失敗測試的「第一個錯誤訊息＋失敗行號」（`results/failure_comparison_raw.txt`）。

（第一次建立對照時漏了 `node_modules`，大量測試因找不到 `firebase` 而失敗；那次結果無效，已補上連結後重跑。）

**修改前：114 / 120；修改後：115 / 121。** 逐支比較的唯一差異是新增的 `test:f01-daily-targets` 通過。

| 分類 | 測試 | 修改前 | 修改後 |
|---|---|---|---|
| **原有失敗** | `test:tracking` | 第 214 行：`OPTIONAL_CLOUD_COLLECTIONS` 斷言 | 相同 |
| **原有失敗** | `test:flow-qa` | 第 204 行：F01-05 素材狀態 | 相同 |
| **原有失敗** | `test:home-redesign` | 第 49 行：`weekSyntheticNote is not defined` | 相同 |
| **原有失敗** | `test:exercise-experience` | 第 41 行：F01-17 圖片 placeholder | 相同 |
| **原有失敗** | `test:self-practice-library` | 第 163 行：F01-17 needs_review | 相同 |
| **原有失敗** | `test:llm-weekly-summary` | 第 187 行：本機存在 `.env.local` | 相同 |
| **本批新增失敗** | — | — | **無** |
| ~~尚無法確認~~ → **已補驗證** | `test:home-redesign` §4b（首頁卡片＋舊格式每日進度） | 前後都沒有執行到 | 已用針對性測試驗證，見第 5 節 |
| ~~尚無法確認~~ → **已補驗證** | `test:exercise-experience` app wiring（動作頁按鈕、準備頁開啟鏡頭） | 前後都沒有執行到 | 已用針對性測試與既有通過測試驗證，見第 5 節；另發現一個**原有的隱藏失敗** |
| **尚無法確認** | 其餘 4 支失敗測試失敗行之後的內容 | 前後都沒有執行到 | 以關鍵字檢查，沒有涉及本批修改的區域 |

沒有刪除或放寬任何斷言。

## 5. 補充：兩處因前段既有失敗而未執行的斷言（2026-10-21 補驗）

本節沒有重跑全套指令，只針對這兩處。原測試檔沒有修改，它們原本會失敗的斷言也保持原樣、沒有跳過。

### 5.1 `tests/homeResultRedesign.test.js` §4b

- **驗證的行為**：當天每日進度為「已完成」時，首頁追蹤卡片顯示「✓ 今日訓練已完成」、「查看本週訓練」按鈕，以及「本週完成 1 天」。
- **為什麼沒執行到**：卡片函式 `renderTrackingCycleCard` 內部會呼叫 `weekSyntheticNote`，但原測試組卡片時沒有提供這個相依函式。因此第一次渲染卡片就丟出 `ReferenceError`，§2 之後全部都沒有執行。修改前後的行為完全相同。
- **既有通過測試是否等效涵蓋**：**沒有**。`trackingTraining.test.js` 第 188 行只測卡片資料模型（`buildTrackingCardModel`），第 238 行只檢查原始碼文字，都沒有實際渲染卡片並帶入每日進度。
- **補做的測試**：`tests/f01Batch1GapCoverage.test.js` 的 A 段。
  - 使用和原測試相同的初始化：基準評估 09/28、8.9 秒，目標 G05、15 分鐘，進行中週期。
  - 使用相同的相依清單，**另外補上真正的 `weekSyntheticNote` 及其實際相依**（`describeWeekSynthetic`、`DEMO_SYNTHETIC_TEXT`，來自 `js/ui/demoSyntheticLabel.js`），沒有用替身。
  - **A1**：完全照 §4b 原文，寫入舊格式的每日進度後渲染卡片 → **通過**。
  - **A2**：同一天改走本批流程完成（準備階段凍結的第 2 版快照、帶 `planDateKey` 的紀錄、完成流程、嘗試清單）後渲染卡片 → **通過**，顯示和 §4b 相同。
- 另外核對：卡片相關的 3 個函式（`renderTrackingCycleCard`、`getHomeTrackingCycle`、`renderTrackingSecondaryActions`）在修改前後**完全相同**。

### 5.2 `tests/exerciseExperience.test.js` app wiring

**第 95–96 行：動作頁使用共用的轉換器與渲染器；「開始訓練」按鈕為 `onclick="goDetectionPrep()"`，返回路徑依情境決定**
- 已由既有通過的測試等效涵蓋本批相關的部分：
  - `tests/trainingProgressLoop.test.js` 第 178 行（`test:tploop`，本輪通過）：`exerciseDetailPage` 含 `onclick="goDetectionPrep()"`。
  - `tests/dataDashboardNavV2.test.js` 第 63 行（`test:datav2`，本輪通過）：`exerciseDetailPage` 含 `getExerciseReturnRoute(`（沒有檢查 `"listing"` 參數）。
- 為了完全等效，B 段**逐字重現**第 95–96 行 → **通過**。並另外確認這個按鈕會先進入本批的準備階段，再解析訓練量。
- `exerciseDetailPage` 在修改前後**完全相同**。

**下一個斷言（同一段、同樣沒執行到）：準備頁**
- 原斷言由三個條件組成：
  - (a) 含 `renderPreparationView(buildExerciseExperience(…`
  - (b) 含 `onclick="openCameraPlaceholder()">開啟鏡頭`
  - (c) 含 `moreHtml: analysisNoticeHtml`
- 對修改前備份與目前程式分別逐字執行，結果：
  - (b)、(c) 修改前後都通過。
  - **(a) 修改前後都失敗**：準備頁實際的呼叫是 `renderPreparationView(withF01PlanDoseLabel(buildExerciseExperience(…), ex), …`。`withF01PlanDoseLabel` 這層包裝是本 session 之前的階段加上的，`detectionPrepPage` 在本批前後完全相同。
  - 所以這是**原有的隱藏失敗**（斷言文字已過時），**不是本批造成**。依指示沒有修改原斷言。
- 其他通過的測試**沒有**涵蓋本批相關的 (b)：`trainingProgressLoop.test.js` 第 181 行檢查的是 `openCameraPlaceholder` 原始函式本身，不是準備頁的按鈕。
- B 段補驗 (b)、(c) → **通過**。並確認準備頁按鈕呼叫的全域 `window.openCameraPlaceholder` 就是最外層的最終核對包裝，之後沒有被重新指定。

### 5.3 執行結果

| 指令 | 結果 | 輸出檔 |
|---|---|---|
| `node tests/f01Batch1GapCoverage.test.js` | 通過（exit 0） | `results/f01Batch1GapCoverage.txt` |

- 這支測試是**單獨執行的**，沒有加入 `package.json`，所以 `npm test` 的 115/121 不受影響。日後若要納入，需要重跑全套。
- 這次補驗屬於本機合成資料測試。**瀏覽器實測與雲端同步仍為待驗證**（見第 6 節）。

## 6. 仍需瀏覽器／真人／雲端驗證

**瀏覽器（實機）**
- 三個入口（建議頁「開始訓練」、今日訓練「開始」、動作頁「開始訓練」）在準備頁凍結目標，動作頁、準備頁與實際偵測目標一致。
- 準備頁停留到隔天再按「開啟鏡頭」（可調整系統時間）：重新顯示準備頁並提示，再按一次才啟動。
- 目標未凍結的日子顯示「今日目標未凍結」。
- 第 7 天或動作不在當天安排時回到計畫頁並說明，不會轉成自主練習。
- 跨午夜儲存的歸屬日。
- `alert()` 提示在手機瀏覽器上的顯示。

**雲端**
- Firestore 同步第 2 版快照欄位（`targets`、`attempts`）與紀錄的 `planDateKey`、`trainingStartedAt`。
- 雲端寫入失敗時的行為（目前不會攔下開始訓練）。
- 多裝置同時凍結時的一致性（最終核對會偵測目標變更，但沒有實測）。

**真人**
- 本批沒有改變完成判定；完成天數的準確度仍未驗證。
- 已知缺陷仍存在：8 個動作忽略組數（F01-08、11、12、16、17、18、19、20），6 個動作計量依據不同（F01-05、06、07、13、14、15）。這些屬於第二批。
