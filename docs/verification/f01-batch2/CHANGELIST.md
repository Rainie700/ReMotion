# F01 第二批 — 修改清單與還原方式

- 實作依據：`docs/specs/f01-batch2-completion-alignment-design.md`（定稿）
- 實作日期：2026-10-21
- 驗證結果：`VERIFICATION_REPORT.md`
- 第一批的備份與驗證結果保留在 `docs/verification/f01-batch1/`，沒有更動。
- 5xSTS 座標修正與量測版本相容檢查沒有修改（相關檔案不在下方清單中）。
- D5 決策矩陣（`js/data/f01ProgressionSpec.js`）與 D5 給 LLM 的輸入結構（`js/data/d5LlmRecommendation.js`）沒有修改。

## 1. 備份與還原

- 備份位置：`docs/verification/f01-batch2/backup-before/`
  - 本批修改的每個原始檔，包括修改前的 `tests/*.test.js` 全部。
  - 原始檔的 MD5 存在 `backup-before.md5`。
- 還原方式（在專案根目錄執行）：

```sh
B=docs/verification/f01-batch2/backup-before
(cd "$B" && find . -type f) | while read f; do cp "$B/$f" "$f"; done
rm tests/f01Batch2Completion.test.js
```

- 已驗證：用備份重建的副本，MD5 與 `backup-before.md5` 一致，而且不含任何第二批程式碼（見驗證報告第 4 節）。

## 2. 實作方式說明（請先讀）

**版本由 App 入口明確帶入**
- 服務層各函式的預設行為維持第二批之前的樣子，只有 App 的正式入口會傳入 `F01_FORMAL_COMPLETION_RULES_VERSION` 或 `excludeAutoRecommendationPending`：
  - Phase C 建立週期
  - D5 接受提案（並把版本記在接受紀錄上）
  - D5 評估
  - D5 LLM 草稿
  - 復健師審閱
  - Phase C 推薦
- 理由：既有測試與兩套示範資料（patient00 展示、本機 D5 demo）都直接呼叫服務層。如果在服務層預設啟用，它們會在不知情的情況下改用新規則。
- 結果：示範資料產生的週期仍是**舊版週期**。
- 每個 App 入口都有對應的原始碼檢查，確認確實帶入版本（`tests/f01Batch2Completion.test.js` 末段）。

**F01-19 的計量方式**
- 復健師在表單上選「合計」時，凍結目標記錄 `planBasisEvidence: "therapist_counting_basis"`，**沒有** `planBasisSource`。表單也明示「這裡的選擇是本次安排的設定，不代表已有來源依據」。
- F01-09、F01-20 的每側依據則記錄 `source_sheet_repetitions` / `source_sheet_steps` 以及出處（`planBasisSource`）。
- 兩種依據在資料與說明上都分開，不會混淆。

## 3. 修改的程式檔

| 檔案 | 修改內容 |
|---|---|
| `js/data/f01DailyTargets.js` | 新版規則：`F01_FORMAL_COMPLETION_RULES_VERSION`、`F01_DETECTOR_COUNTING_OPTIONS`、`F01_COUNTING_BASIS_SOURCES`（F01-09、20）、`F01_AUTO_RECOMMENDATION_EXCLUSIONS`（F01-19）、`resolvePlanCountingBasisV2`、`resolveCompletionRule`、`deriveFormalDetectorConfig`、`isFormalTargetMet`、`checkCountingDefinitions`、`getCompletedTrainingDaysStatus`、`displayCompletedTrainingDays`；`buildDailyTarget` / `freezeDailyTargets` 只在帶入新版版本時套用新規則；目標摘要加入完成規則（最終核對會一併比對） |
| `js/data/trackingCycleService.js` | 週期版本 `formalCompletionRulesVersion`；凍結時把版本複製到每日快照；完成判定以週期版本為準（新版只看凍結規則、單筆、不退回舊規則）；`exerciseCompletions` 記錄規則版本與判定依據；生效前檢查（新建週期、接受提案、建立下一週期）；接受時記錄版本；正式開始時阻擋 `counting_basis_pending`；`getF01FormalDetectorConfig`；D5 評估可排除 F01-19 |
| `js/data/f01ProgressionDecision.js` | 只改輸入：`countCompletedTrainingDays` 對量測待確認的週期回傳 `null`（D5 規則表與 `evaluateD5Decision` 都不變） |
| `js/data/d5Arrangement.js` | `planItem` **只在有值時**才帶 `countingBasis`（第二批之前的計畫指紋逐位元不變）；帶入版本時，計量未定義的項目狀態為 `needs_review` / `counting_basis_missing` |
| `js/data/d5TherapistReviewService.js` | 每個選項帶出 `countingOptions` 與 `countingBasisRequiredWithoutReps`；`validateD5ReviewItems` 檢查計量方式（必填、是否支援）；審閱與安排可帶入版本 |
| `js/data/f01GoalRecommendation.js` | 可選擇排除 F01-19（在依時間切出動作數之前排除）；排除紀錄寫入 `excluded`，原因為 `counting_basis_pending`；新增 `shortfall` |
| `js/data/recommendationService.js` | 儲存 `shortfall` |
| `js/services/d5RecommendationDraftService.js` | LLM 候選可排除 F01-19（只改輸入的動作清單） |
| `js/data/functionalProgressService.js`、`js/data/trackingComparison.js`、`js/services/llmContextBuilder.js` | 完成天數在量測待確認時為 `null`，其餘情況與修改前完全相同 |
| `js/data/trackingCycle.js` | 首頁卡片在完成天數未知時顯示「待確認」 |
| `js/data/f01AdventureProgress.js` | 關卡 4 在完成天數未知時顯示「本週訓練日待確認」（按鈕不變） |
| `js/services/llmSummaryFallback.js` | **規格漏列、本批補上**（見驗證報告第 6 節）：週摘要的替代敘述原本把 `null` 寫成「本週尚未完成正式訓練日」，改為「本週正式訓練日資料尚未提供」 |
| `js/ai/exercises/{seatedKneeExtension,seatedKneeRaise,sideLegRaise,clamshell,singleLegToeRaise}/session.js` | 新增選用參數 `targetPerSide`：有傳入時左右都要達標才完成；沒傳入時輸出完全不變 |
| `app.js` | 正式偵測目標（`f01FormalDetectorConfig` 等）只套用在 F01 的 15 個偵測器入口，AK07 不變；每側進度顯示 `showF01PerSideProgress`（KN03、CR05、HP04／05／06、AK08）；正式開始的阻擋文字；審閱表單的計量方式控制與 F01-19 說明；推薦頁顯示排除原因與 `shortfall`；週期建立失敗時顯示說明；各頁的完成天數改用 `fmtF01TrainingDays`；各 App 入口帶入版本或排除選項 |
| `package.json` | 新增 `test:f01-batch2-completion` |

## 4. 測試檔

| 檔案 | 類型 | 原因 |
|---|---|---|
| `tests/f01Batch2Completion.test.js` | 新增 | 驗收案例 B2-1～B2-25 |
| `tests/trackingTraining.test.js` | 修改 | 原始碼文字檢查：首頁卡片改用 `displayCompletedTrainingDays(cycle)`。數字相同，只是待確認時改為 null |
| `tests/trackingComparison.test.js` | 修改 | 原始碼文字檢查：比較頁改用 `fmtF01TrainingDays(...)` |
| `tests/f01DailyTargets.test.js` | 修改 | 第一批案例 10 原本禁止 D5／LLM 檔案出現 `f01DailyTargets` 字樣；第二批合法引用了它，所以改為只禁止第一批的欄位（`planDateKey`、`.attempts`、`targetsStatus`） |
| `tests/f01ProgressionDecision.test.js` | 修改 | Phase C 640 種組合的雜湊值：第二批只新增 `shortfall` 欄位。已驗證去掉這個欄位後，雜湊值與原本完全相同（16 個組合帶有 `shortfall`，數值都正確）；測試改為比對去除後的雜湊，並逐一檢查 `shortfall` |
| `tests/resultStates.test.js`、`tests/d5NextWeekHandoff.test.js`、`tests/d5TherapistReview.test.js`、`tests/dataProfileCleanup.test.js`、`tests/f01Batch1GapCoverage.test.js` | 修改 | 這些測試從原始碼重建 App 函式，需要補上新的實際相依（`fmtF01TrainingDays`、`displayCompletedTrainingDays`、`F01_FORMAL_COMPLETION_RULES_VERSION`、`renderD5ReviewCountingControl`、`F01_COUNTING_LABEL`）。沒有修改任何斷言，也沒有用替身 |
