# F01 第一批：當日目標快照＋每次訓練紀錄 — 實作規格（定稿）

> **狀態：待實作、待驗證。**
> 本文件是第一批的實作基準，內容依程式閱讀整理，尚未實作，也未經任何測試或真人驗證。
> 本批完成後，**不代表**完成天數的準確度已經驗證。

- 定稿日期：2026-10-21
- 依據：閱讀 ReMotion 目前程式碼（未修改、未執行測試）
- 前置：5xSTS 座標尺度修正與量測版本相容檢查維持不變（見 `docs/verification/fa5x-coordinate-scale/`）

---

## 1. 範圍

**包含**
- 只處理 **F01 週期的正式安排訓練**。「正式入口」指開始訓練時，已經依進行中週期與其建議建立 F01 訓練情境（`state.f01TrainingContext`），入口有三個：建議頁「開始訓練」、今日訓練「開始」、動作頁「開始訓練」。
- F01-01～F01-20 都有偵測器，所以本批不包含自行回報。
- 新增：當日目標快照（凍結的目標量、計量依據、來源、版本），以及訓練嘗試清單（已成功儲存的訓練紀錄）。
- 統一流程：動作頁、準備頁顯示的目標，與偵測器啟動時使用的目標，都讀同一份凍結值。
- 統一日期：快照、紀錄、嘗試清單、完成判定都使用同一個歸屬日（`planDateKey`）。

**不包含（留給後續批次）**
- 統一偵測器目標與完成判定（第二批）
- 自行回報完成量
- 復健師課表「儲存即完成」的修正
- 每日吃力程度／不適回報
- 未完成原因詢問
- 治療師每週審閱流程
- D5、LLM 輸入的擴充

**不在正式範圍內，行為不變**
- 沒有建立 F01 週期情境的訓練：自主練習庫，或非進行中週期的建議（I-1 `f01_recommendation`）。

---

## 2. 已知缺陷（本批不修）

1. **目標不一致**（只標示，不修正）
   - **8 個動作忽略組數**：F01-08、11、12、16（以每側次數為目標）；F01-17、18、19、20（以每組次數為目標）。實際上一組就算整個動作完成。
   - **計量依據不同**：F01-05、06、07、13、14、15 的型錄文字寫「每側」，偵測器卻用左右合計的組數 × 次數。
   - **無法比較**：F01-09（型錄寫「交替」）、F01-19、20（偵測器記錄左右，但型錄沒有寫「每側」）。
2. 本批**不修**完成判定，所以 `completedTrainingDates` 的準確度仍未驗證，D5 與 LLM 收到的完成天數也帶著上述缺陷。
3. 紀錄的來源標記，仍要靠儲存當下記憶體中的訓練情境。重新整理頁面，或改從其他入口進入時，可能漏計（不會誤算進正式安排）。
4. 嘗試清單只涵蓋**已成功儲存且通過核對**的紀錄。以下都不在範圍內：放棄訓練、零次無法儲存、儲存失敗、沒有來源標記。
5. F01-01～04、10、17、18 的型錄劑量文字本輪沒有逐一讀過。計畫計量依據在執行時依規則判定（見 3.3）。
6. 復健師課表「儲存即完成」（app.js 約 61 處），不在本批範圍。

---

## 3. 資料規格

### 3.1 當日快照 `cycle.dailyTrainingProgress[planDateKey]`（第 2 版）

既有欄位不變：`requiredExerciseIds`、`completedExerciseIds`、`exerciseCompletions`、`isComplete` 等。新增欄位：

| 欄位 | 內容 |
|---|---|
| `snapshotVersion` | `2`。沒有這個欄位的是舊版快照 |
| `targetRulesVersion` | 偵測器目標規則表的版本 |
| `targetsStatus` | `frozen_before_training`（正式開始前凍結）或 `not_frozen`（由完成流程補建，目標未知） |
| `targets[exerciseId]` | 見 3.2；`not_frozen` 時為空 |
| `attempts[recordId]` | 見 3.4 |

### 3.2 每個動作的凍結目標 `targets[exerciseId]`

| 欄位 | 內容 | 規則 |
|---|---|---|
| `measurementType` | `repetition`（目前 F01 全部是次數型） | 照型錄 |
| `sets`、`repsPerSet` | `{ value, source }`；source 為 `therapist_dose` 或 `catalog_default` | 凍結當下依目前取值順序算出實際數值；之後不再讀型錄或計畫 |
| `catalogDoseText` | 型錄原文，例如 `{ sets: "2-3組", repetitions: "每側10次" }`，沒有則為 `null` | 只作為追溯依據，不拿來計算 |
| `planCountingBasis` | `per_side`、`total` 或 `unspecified` | 見 3.3 |
| `planBasisEvidence` | 判定依據代碼 | 必填 |
| `detectorRuleId` | `sets_x_reps_total`、`reps_only_total` 或 `reps_only_per_side` | 寫死在規則表（見 3.3 對照表） |
| `detectorRecordsSides` | true／false | 同上 |
| `detectorTarget` | `{ value, unit: "total_reps" \| "reps_per_side" }` | 用凍結值與同一條公式算出 |
| `plannedAmount` | 例如 `{ perSide: 20 }`、`{ total: 30 }`；依據不明時為 `null` | **依據不明時一律不相乘** |
| `targetConsistency` | `consistent`、`inconsistent` 或 `not_comparable` | 只是標示，不影響任何判定 |

### 3.3 計量依據規則與偵測器對照

**計畫計量依據**（依序判定，不另外推測）
1. 復健師設定的次數沒有標示左右。只要偵測器會記錄左右，就判為 `unspecified`。
2. 型錄文字含「每側」時判為 `per_side`；含「交替」時判為 `unspecified`。
3. 偵測器不分左右、型錄文字也沒有「每側」時，判為 `total`。
4. 其他情況一律判為 `unspecified`。依據不明時，`plannedAmount` 為 `null`，`targetConsistency` 為 `not_comparable`。

**F01 偵測器對照**（依程式查證；型錄文字欄只列實際讀到的）

| 動作 | 偵測器目標 | 偵測器計量 | 型錄文字 | 預期標示 |
|---|---|---|---|---|
| F01-01／02／03（深蹲類）、F01-04（坐站）、F01-10（橋式） | 組數 × 每組次數 | 合計，不分左右 | 未讀 | 執行時判定（預期 `consistent`） |
| F01-05／06／07（KN03） | 組數 × 每組次數 | 合計，有記錄左右 | 每側 | `inconsistent` |
| F01-13／14（側抬腿）、F01-15（蚌殼式） | 組數 × 每組次數 | 合計，有記錄左右 | 每側 | `inconsistent` |
| F01-09（CR05） | 組數 × 每組次數 | 合計 | 交替 | `not_comparable` |
| F01-08、11、12、16（HP01／02 訓練版／03／07） | 只取每組次數 | 每側都要達標 | 每側 | `inconsistent`（沒乘組數） |
| F01-17、18（AK05／06） | 只取每組次數 | 合計 | 未讀 | 預期 `inconsistent`（沒乘組數） |
| F01-19、20（AK07／08） | 只取每組次數 | 合計，有記錄左右 | 10~15次 | `not_comparable` |

### 3.4 嘗試清單 `attempts[recordId]`

只寫入已成功儲存、並通過 5.3 核對的訓練紀錄。缺少的欄位一律存 `null`，不補造。

| 欄位 | 來源 |
|---|---|
| `recordId`、`exerciseId`、`analysisMode` | 紀錄 |
| `planDateKey`、`trainingStartedAt` | 紀錄（本批新增；舊紀錄為 `null`） |
| `completedAt` | **只取 `record.completedAt`**，沒有就是 `null`，不用 `createdAt` 代替 |
| `source` | 紀錄上已存的 `sourceType`、`sourceSubtype`、`trackingCycleId`、`recommendationId` |
| `actual` | `{ totalReps, leftReps, rightReps }` |
| `recordTarget` | `{ targetReps, targetPerSide }` |
| `detectorCompletedFlag` | 原本的 `summary.completed`；不是布林值就存 `null` |
| `targetRef` | `frozen`、`not_frozen` 或 `legacy_no_targets` |
| `writtenAt` | 寫入時間 |

### 3.5 訓練紀錄新增欄位

只在 `f01_cycle` 執行情境成立時，由 `withTrainingSourceFields` 寫入：
- `planDateKey`：歸屬日（見 4.4）
- `trainingStartedAt`：偵測器啟動的真實時間（通過 4.3 最終核對的時間）

既有的 `localDateKey`（完成時的本地日期）保留原本意義。它只用在訓練事件、遊戲化活動天數等非 F01 正式安排的統計，不參與 F01 歸屬。

---

## 4. 流程規格

### 4.1 快照建立模式
`ensureDailyTrainingSnapshot` 分成兩種明確模式：
- **`formal_start`**：只由 4.2 準備階段呼叫。必做動作清單和所有凍結目標**在同一次寫入中完成**。任何一個動作的目標算不出來，或寫入失敗，就整筆不寫入並回傳錯誤。
- **`completion_fallback`**：只由既有完成流程（`recordExerciseCompletion`）在找不到當天快照時使用。建立 `targetsStatus: "not_frozen"` 的第 2 版快照，目標保持未知，**不從預設值回填**。

建議頁 `startF01RecommendedTraining` 原本直接建立快照的呼叫要移除，改走 4.2，讓三個入口用同一條路徑。

**不升級**：已存在、但沒有凍結目標的快照（本批上線前的舊快照，或 `not_frozen`），不補寫目標。這些日子仍可開始正式訓練，但必須明確標示（見 4.2）。

### 4.2 準備頁：取得或凍結目標，並顯示（第一階段）
在 `goDetectionPrep` 中、帶有正式 F01 情境時執行：
1. 確認今天（本地日期）是正式訓練日：情境仍有效（進行中週期、同一份建議）、在 Day 1–6、這個動作在當天必做清單裡。
2. 當天沒有快照時，以 `formal_start` 凍結；已有就直接讀取。
3. 把 `planDateKey`、`targetRef` 和「顯示用目標摘要」存進訓練情境。摘要內容是 `{ planDateKey, targetRef, sets, repsPerSet, detectorTarget }`。
4. 準備頁、動作頁的目標顯示（`withF01PlanDoseLabel`），和偵測器取得的目標（`f01PlanDoseFor` → `getExercisePageContext`），**都讀這份凍結值**，不能退回讀最新預設值。
5. 目標未凍結的日子（`legacy_no_targets`、`not_frozen`）照目前方式即時取得，但準備頁要明確顯示「今日目標未凍結」。
6. 第 1 步不成立（不是訓練日、週期已完成、動作不在當天安排、建議不符）或第 2 步凍結失敗：**不進入準備頁，回到計畫頁並說明原因**（見 4.5）。

### 4.3 開鏡頭前：最終核對（第二階段）
位置：準備頁「開啟鏡頭」按鈕的入口，也就是最後一層 `openCameraPlaceholder` 包裝（app.js 約 14674 行之後，所有偵測器都從這裡啟動）。依序檢查：
1. 現在的本地日期仍等於情境中的 `planDateKey`。
2. 情境仍有效（同 4.2 第 1 步）。
3. 依目前資料重新算出的目標摘要，和情境中「已顯示給使用者」的摘要完全相同。

處理方式：
- **全部成立**：記下 `trainingStartedAt`，啟動偵測器。
- **換日或目標摘要不同**：**不啟動偵測器**。依新的日期重新執行 4.2（需要時凍結新一天的目標），重新顯示準備頁，並提示「日期已變更／今日目標已更新，請確認後再開啟鏡頭」。使用者再按一次「開啟鏡頭」時，重新跑一次 4.3。
- **重新執行 4.2 時無法成為正式訓練**（非訓練日、週期已完成、安排不符、凍結失敗）：回到計畫頁說明（見 4.5）。

目標摘要可能不同的情況：換日、未凍結的日子即時值有變動、其他裝置先建立了凍結快照。

### 4.4 日期歸屬
- 歸屬日是**通過最終核對時確認的 `planDateKey`**，也就是快照的日期。
- 跨午夜的訓練歸屬到開始那一天。`trainingStartedAt` 和 `completedAt` 都保留真實時間。
- 快照、紀錄的 `planDateKey`、嘗試清單核對、`recordExerciseCompletion` 的完成判定，**全部使用 `planDateKey`**。
- **既有完成流程的改動（明列）**：`recordExerciseCompletion` 的日期來源，從「`completedAt` 的本地日期」改為「優先用紀錄的 `planDateKey`，沒有時才照舊」。其餘邏輯不變。

### 4.5 無法正式開始時
- 正式入口因為非訓練日、週期已完成、安排不符、或凍結失敗而無法開始時，**一律回到計畫頁並說明原因，不會自動轉成自主練習**。
- 不會產生帶有 `f01_cycle` 的紀錄，也不寫入任何快照或嘗試清單。
- 使用者如果要練習，必須自己另外從自主練習庫開始，才走非正式紀錄流程（`self_selected`）。

### 4.6 寫入嘗試清單的核對
在 `analysisService.onCreate` 監聽器中，**先**執行既有的 `recordExerciseCompletion`，**再**執行 `recordTrainingAttempt`。任何一項不符就不寫入，回傳原因並記錄 log：
1. 紀錄的本人、週期的本人、目前使用者三者一致。
2. 紀錄上**已存的**欄位：`sourceSubtype === "f01_cycle"`、`trackingCycleId` 等於該週期，`recommendationId` 等於快照的 `recommendationId`。
3. 紀錄的 `planDateKey`（舊紀錄沒有時，用 `completedAt` 的本地日期）在 Day 1–6，而且等於快照的日期。
4. `exerciseId` 在當天必做清單裡。
5. 以 `recordId` 去重。
6. **當天沒有快照時不寫入**，也不因為這筆紀錄建立快照。

---

## 5. 行為變更

### 5.1 既有資料不變
只用上線前已儲存的資料重新計算時，以下結果必須和上線前相同：`completedTrainingDates`、`countCompletedTrainingDays`、D5 提案、D5 給 LLM 的輸入、週摘要的 context。舊紀錄沒有 `planDateKey`，日期一律照舊規則。

### 5.2 新訓練的預期變更
1. 正式 F01 訓練的目標改讀凍結值。當天凍結後如果有人改了計畫或動作預設，新訓練的目標可能和即時讀取的值不同。
2. 三個入口都在進入準備頁時建立快照。過去今日訓練和動作頁入口要等第一次完成時才建立。所以當天必做清單凍結的時間點提早了。
3. 換日或目標變更時，要先重新顯示準備頁並由使用者確認，才會啟動偵測器。
4. 正式入口在非訓練日、週期已完成、安排不符或凍結失敗時，會回到計畫頁。過去會照常開始（不計入）。例如過去在 Day 7 從建議頁開始訓練仍可進行，現在會被擋下。
5. 跨午夜的訓練歸屬到開始那天。舉例：Day 3 的 23:58 開始、00:02 儲存，過去算 Day 4，現在算 Day 3；Day 6 開始、Day 7 才儲存，過去不計入，現在算 Day 6。
   - 這會改變新產生的 `completedTrainingDates`，間接影響 D5 的完成天數、訓練暴露分級，以及 LLM 輸入的天數。
6. 新的正式訓練紀錄多兩個欄位：`planDateKey`、`trainingStartedAt`。

### 5.3 本批不改的部分
完成判定規則（是否達標）、D5 規則與輸入欄位、LLM 輸入欄位、偵測器、復健師課表流程。

---

## 6. 修改檔案

| 檔案 | 修改 |
|---|---|
| `js/data/f01DailyTargets.js`（新增，純函式） | F01 偵測器目標規則表與版本；目標凍結；計量依據與一致性判定；目標摘要；`buildTrainingAttempt` |
| `js/data/trackingCycleService.js` | `ensureDailyTrainingSnapshot` 的兩種模式與第 2 版欄位；新增 `recordTrainingAttempt`；`recordExerciseCompletion` 改用 `planDateKey` 判定日期 |
| `js/data/analysisService.js` | `withTrainingSourceFields` 在 `f01_cycle` 情境成立時寫入 `planDateKey`、`trainingStartedAt` |
| `app.js` | `goDetectionPrep`（準備階段）；最後一層 `openCameraPlaceholder` 包裝（最終核對）；`armF01TrackingTraining`（情境欄位）；`f01PlanDoseFor`、`getExercisePageContext`、`withF01PlanDoseLabel`（讀凍結值）；準備頁的提示文字；`trainingRecordOptions`（帶日期與開始時間）；`startF01RecommendedTraining`（移除直接建立快照的呼叫）；`analysisService.onCreate` 監聽器（完成流程之後寫入嘗試清單）；回計畫頁時的說明 |
| `tests/f01DailyTargets.test.js`（新增）＋ `package.json` | 第 7 節的驗收案例 |

**不修改**：`firestore.rules`（`trackingCycles` 沒有逐欄限制）、所有偵測器、`js/ui/f01RecommendationView.js`、D5 與 LLM 相關檔案。既有測試只檢查特定欄位，預期不受影響，但要等實作後跑測試才能確認。

---

## 7. 驗收案例

1. **首次建立**：從三個入口第一次進入準備頁，都以 `formal_start` 一次寫入「清單 + 凍結目標」（`frozen_before_training`），不會產生沒有目標的中間狀態，一天只凍結一次。
2. **顯示與啟動一致**：凍結後改動作預設或計畫劑量，動作頁、準備頁和偵測器的目標都還是凍結值，來源標示也不變。
3. **舊快照、未凍結快照**：不升級、不補寫目標；可以開始正式訓練，但準備頁和嘗試清單都明確標示未凍結。
4. **計量依據**：F01-05、08、09、17、19 各舉一例，`planCountingBasis` 和 `targetConsistency` 與 3.3 對照表一致；依據不明時 `plannedAmount` 為 `null`，不相乘。
5. **未達標紀錄**：寫入嘗試清單，保留實際量和原本的完成旗標；`completedExerciseIds` 不變。
6. **去重**：同一筆紀錄觸發兩次，嘗試清單只有一筆。
7. **拒絕寫入**：別人的紀錄、其他週期、日期不符、不在當天清單、自主練習紀錄、紀錄沒有存來源標記，各自拒絕，而且不會產生快照。
8. **沒有快照**：未達標的紀錄不寫入、不建立快照；達標紀錄由完成流程補建 `not_frozen` 快照，嘗試清單標為 `targetRef: "not_frozen"`，不從預設值回填。
9. **缺少欄位**：紀錄缺左右次數或 `targetPerSide` 時，對應欄位為 `null`。
10. **既有資料不變**：見 5.1。
11. **兩個統計各自計算**：`formalRecordCount` 和完成天數各依原本定義計算，不要求相等；前者能追溯到訓練事件的紀錄 ID，後者能追溯到 `exerciseCompletions` 的紀錄 ID。
12. **凍結失敗**：在正式訓練日模擬建議不存在、目標數值無效、寫入失敗，都不進入準備頁、回到計畫頁說明；不啟動偵測器、沒有新紀錄、快照不變。
13. **無法正式開始**：非訓練日（例如 Day 7）、週期已完成、動作不在當天安排、建議不符，都回到計畫頁說明；**不自動轉成自主練習**，沒有紀錄、快照或嘗試清單被寫入。之後使用者自行從自主練習庫開始時，紀錄為 `self_selected`，不會計入正式安排。
14. **開鏡頭前換日**：D 日進入準備頁、D+1 日才按「開啟鏡頭」：
    - 偵測器不啟動。依 D+1 重新執行準備階段，準備頁改顯示 D+1 的凍結目標，並提示請使用者確認。
    - 使用者再按一次「開啟鏡頭」才啟動；`planDateKey` 為 D+1。
    - D+1 不是訓練日、或沒有這個動作：同案例 13，回到計畫頁說明。
15. **開鏡頭前目標變更**（同一天）：目標未凍結的日子即時值改變，或其他裝置先建立了凍結快照，導致目標摘要不同：偵測器不啟動，準備頁更新並提示確認，再按一次才啟動。
16. **跨午夜**：D 日 23:58 開始、D+1 日 00:02 儲存：
    - 紀錄的 `planDateKey` 為 D，`localDateKey` 為 D+1；`trainingStartedAt` 和 `completedAt` 都是真實時間。
    - 快照、嘗試清單、`completedExerciseIds`、`completedTrainingDates` 都落在 D。
    - Day 6 跨到 Day 7 的情況計入 Day 6。
17. **舊紀錄**：沒有 `planDateKey` 的紀錄，日期判定照舊（`completedAt` 的本地日期），結果和上線前相同。
18. **欄位來源**：嘗試清單的 `completedAt` 等於 `record.completedAt`；紀錄沒有這個欄位時為 `null`，而不是 `createdAt`。

---

## 8. 第二批（緊接在後）：統一偵測目標與完成判定

- 偵測器目標改為從凍結目標與計量依據算出，處理每側與合計的換算。依據不明的動作需要另外決策，不自動判定。
- 完成判定改為比對凍結目標；改用新的追蹤規則版本，歷史完成天數不重算。
- 用第一批累積的嘗試清單資料，先評估改動對完成天數與 D5 訓練暴露分級的影響，再決定上線方式。
- 本文件的任何內容都不代表臨床有效性，也沒有新增臨床門檻或改動進退階規則。
