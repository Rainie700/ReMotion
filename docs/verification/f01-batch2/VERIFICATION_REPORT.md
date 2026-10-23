# F01 第二批 — 本機自動驗證報告

> **性質：本機、合成資料的工程驗證。** 不是真人驗證，也不是完成天數準確度或臨床效度的驗證。
> 沒有部署、沒有推送、沒有操作正式使用者資料。
> **瀏覽器、真人與雲端驗證都還沒有進行**（第 8 節），不能視為已通過。

- 驗證日期：2026-10-21；Node v24.18.0；Windows 11
- 依據：`docs/specs/f01-batch2-completion-alignment-design.md`；修改清單見 `CHANGELIST.md`
- 原始輸出：`results/`

## 1. 結果摘要

| 項目 | 結果 |
|---|---|
| `tests/f01Batch2Completion.test.js`（B2-1～B2-25） | 通過 |
| 共用偵測器測試（`kn03`、`cr05`、`le04`、`hp01`、`hp03`～`hp07`、`ak05`～`ak08`、`le03`、`le05` 的 session 測試） | 全部通過，測試本身沒有修改 |
| 受影響流程（`trackingTraining`、`trackingReassessment`、`trackingComparison`、`f01ProgressionDecision`、`f01NextCycle`、`d5NextWeekHandoff`、`d5TherapistReview`、`d5LlmRecommendation`、`f01GoalRecommendation`、`f01RecommendationView`、`resultStates`、`todayPlan`、`dataProfileCleanup`、`f01Adventure`、`patient00Showcase`） | 全部通過 |
| 第一批回歸（`f01DailyTargets`、`f01Batch1GapCoverage`） | 通過 |
| 5xSTS 回歸（`fiveTimesSitToStandAssessment`、`fa5xMeasurementCompatibility`） | 通過 |
| `npm test` | **116 / 122**（修改前 115 / 121；多出的一支是本批新增並通過的測試） |
| `npx vite build` | 成功 |

**防偽陰性檢查**：分別暫時破壞下列六項，新測試都會失敗；全部還原後重新通過。
- 每側改用合計 × 2 判定 → 在第 166 行失敗
- 新版週期也先要求舊的完成旗標 → 在第 175 行失敗（這個漏洞第一次檢查時沒被抓到，已補上案例）
- 忽略 F01-19 排除 → 在第 463 行失敗
- 把 null 當成 0 → 在第 386 行失敗
- 計畫指紋一律帶 `countingBasis` → 在第 449 行失敗
- 週摘要把 null 寫成「未完成」 → 在第 404 行失敗

## 2. 驗收案例與測試對應（`tests/f01Batch2Completion.test.js`）

| 案例 | 測試段落 | 驗證內容 |
|---|---|---|
| B2-1 | 「B2-1 對照表」 | 20 個動作的完成規則與正式偵測設定和對照表一致（合計 7、每側 12、待確認 1）；5 個一致動作的數量條件不變；F01-19 由復健師選合計時記錄為 `therapist_counting_basis`，沒有來源欄位 |
| B2-2、B2-14 | 「B2-2 同一份來源」與 B2-15 段落 | App 函式從原始碼重建：偵測器的正式目標、完成門檻都來自同一份凍結值；凍結後修改型錄或復健師設定量都不變；非正式情境回傳 null |
| B2-3、B2-4、B2-5、B2-6、B2-8 | 「B2-3…B2-8」 | 服務層：左 25 右 15 不完成、左 20 右 20 完成；HP01 30／29 不完成；AK05 單筆 10 不完成、20 完成；兩筆各 10 不累計；缺左右次數不完成。偵測器層：KN03 用實際畫面序列驅動，左 3 右 1（合計 4 = 2 × 2）不完成、補到左右各 2 才完成；未傳入每側參數時照舊以合計完成；CR05、側抬腿、蚌殼式、AK08 只做單側時都不完成 |
| B2-7、B2-10 | 「B2-7 / B2-10」 | 舊版週期：快照不帶版本、偵測器設定為 null、10 下依舊旗標完成（`legacy_detector_flag`）。新版週期遇到沒有版本的快照或沒有快照時：`completion_target_unknown`，不退回舊規則，也不建立快照 |
| B2-9 | 「B2-9 影響範圍」 | 15 個 F01 偵測器入口只透過輔助函式取得正式目標；AK07、HP09、AD01、LE04 沒有改動；未傳入選用參數時輸出不變（另由各 session 測試證明） |
| B2-11 | 「B2-11 D5 固定案例」 | D5 規則表逐列與修改前相同；8 個案例的實際輸出見第 5 節 |
| B2-12 | 「B2-12」 | `d5LlmRecommendation.js` 的 MD5 與備份相同；週摘要 `training` 的欄位結構不變 |
| B2-13 | 「B2-13 更嚴格」 | 19 個動作 × 64 種左右組合：新規則下完成的，舊規則下也都完成 |
| B2-15 | 「B2-15 每側進度顯示」 | 以模擬 DOM 執行 `showF01PerSideProgress`：顯示「/ 每側 20」、環形進度取較弱的一側、左右各「x / N」、合計標示「不作為完成門檻」；HP04 顯示「左 12 / 30｜右 10 / 30」；非正式情境不動畫面；AK08 說明文字改為每側 |
| B2-16 | 「B2-16」 | F01-09、F01-20 判定為每側並附出處；三個動作的型錄資料不變；舊版週期仍是第一批的標示 |
| B2-17 | 「B2-17 週期版本」 | 每日快照版本等於週期版本；未知版本會被拒絕 |
| B2-18、B2-19、B2-20、B2-25 | 「B2-18…B2-25」 | 以刻意製造的異常資料（新版週期在生效後被加入 F01-19）驗證：準備階段阻擋並說明、不轉成自主練習；完成天數為 null → D5 走 R001、不呼叫 LLM；同樣情況在舊版週期照常計數；週摘要 schema、驗證器、替代文字都接受 null，顯示「尚未提供」；各畫面顯示「待確認」，程式中不再有直接輸出 `${n} 天` 的地方 |
| B2-21 | 「B2-21 審閱表單」 | 選項與偵測器能力一致；缺少計量方式、選了不支援的方式都會擋下；F01-19 沒有次數時也必填；儲存內容；未帶版本的舊流程不變；第二批之前的計畫指紋逐位元相同；不提供指定側別；F01-19 的說明文字 |
| B2-22 | 「B2-22 F01-19 排除」 | G05 10／15／20 分鐘的實際結果；G05 20 分鐘 + L05 的 `shortfall`；G02、G04 共 256 種組合不變；D5 判定「進階」退回 NC-P01「維持」；LLM 候選選項不含 F01-19（列在不提供清單中） |
| B2-23、B2-24 | 「B2-23 / B2-24」 | Phase C 阻擋並列出動作、App 顯示說明；D5 安排為 `needs_review` 且新版下無法接受；建立下一週期時的防護檢查；全部有定義時正常通過；上線前（未帶版本）接受的提案，下一週期仍為舊版，項目不被修改 |
| App 入口 | 檔案末段 | 每個新版入口都帶入版本或排除選項 |

## 3. 本輪修正

**本批造成的問題（依規格修正）**
1. 推薦頁「你勾選的情況排除了 N 個動作」的計數：我第一版只計有 `limitationId` 的項目，導致沒有該欄位的項目被漏算（`f01RecommendationView` 測試抓到）。已改為只排除 `counting_basis_pending`。
2. 冒險關卡 4 的程式結構被我拆成多行，造成單行檢查失敗（`todayPlan` 測試）。已改回單行結構，按鈕與原本相同。

**規格漏列，本批補上（見第 6 節）**
3. `llmSummaryFallback.fallbackNarrative` 把 null 寫成「本週尚未完成正式訓練日」。

**測試本身的調整**：見 `CHANGELIST.md` 第 4 節。沒有刪除或放寬任何既有斷言。原始碼文字檢查改為對應新寫法；Phase C 雜湊值已驗證去掉新欄位後完全相同。

## 4. 失敗項目對照（以修改前備份為基準）

**對照方法**
1. 在暫存區複製一份專案，用 `backup-before/` 還原所有檔案（含修改前的全部測試），刪除新增的測試檔。
2. 核對 MD5 與 `backup-before.md5` 相同，並確認不含第二批程式碼。
3. 共用同一份 `node_modules` 執行全套測試（`results/npm_test_baseline_before.txt`），逐支比對第一個錯誤訊息與行號（`results/failure_comparison_raw.txt`）。
4. 結束後只移除 `node_modules` 連結，專案本身的 `node_modules` 確認完好。

**修改前 115 / 121；修改後 116 / 122。** 逐支比較的唯一差異是新增的 `test:f01-batch2-completion` 通過。

| 分類 | 測試 | 修改前 | 修改後 | 說明 |
|---|---|---|---|---|
| 原有失敗 | `test:tracking` | 第 214 行：`OPTIONAL_CLOUD_COLLECTIONS` | 相同 | 雲端集合設定，與本批無關 |
| 原有失敗 | `test:flow-qa` | 第 204 行：F01-05 素材狀態 | 相同 | 素材清單，與本批無關 |
| 原有失敗（訊息改變） | `test:home-redesign` | 第 49 行：`weekSyntheticNote is not defined` | 第 49 行：`displayCompletedTrainingDays is not defined` | 同一行、同一類原因：測試組卡片時缺少相依。首頁卡片現在先用到第二批的輔助函式，所以先遇到它。**已驗證**：在臨時副本中只補上第二批的輔助函式，錯誤就回到原本的 `weekSyntheticNote is not defined`。根本原因沒變；依指示沒有修正這個既有失敗 |
| 原有失敗 | `test:exercise-experience` | 第 41 行：F01-17 圖片 | 相同 | 素材狀態 |
| 原有失敗 | `test:self-practice-library` | 第 163 行：F01-17 needs_review | 相同 | 素材狀態 |
| 原有失敗 | `test:llm-weekly-summary` | 第 187 行：本機有 `.env.local` | 相同 | 環境檔 |
| 本批新增失敗 | — | — | **無** | |
| 尚無法確認 | 上述 6 支在失敗行之後的內容 | 修改前後都沒有執行到 | | 其中 home-redesign 的首頁卡片與舊格式每日進度，已由 `f01Batch1GapCoverage` 補驗並通過 |

## 5. D5 固定案例的實際輸出（`evaluateD5Decision`，規則不變）

| 案例 | 時間變化（毫秒） | 完成天數 舊→新 | 舊：分級／規則／決策 | 新：分級／規則／決策 |
|---|---|---|---|---|
| D5-1 | −3500 | 6 → 6 | full／R005／progress | full／R005／progress |
| D5-2 | −3500 | 6 → 3 | full／R005／progress | partial／R004／**maintain** |
| D5-3 | −1000 | 6 → 5 | full／R008／maintain | partial／R007／maintain |
| D5-4 | −1000 | 1 → 0 | partial／R007／maintain | none／R006／**no_auto_decision** |
| D5-5 | +3500 | 6 → 2 | full／R010／adjust | partial／R010／adjust |
| D5-6 | +3500 | 1 → 0 | partial／R010／adjust | none／R009／**no_auto_decision** |
| D5-7 | 比較無效 | 6 → 0 | full／R001／no_auto_decision | none／R001／no_auto_decision |
| D5-8 | −3500 | 6 → null（量測待確認） | full／R005／progress | （無法分級）／R001／**no_auto_decision** |

原始 JSON：`results/d5_fixed_cases.json.txt`。另外，G05 的實際流程中，D5 判定「進階」時，因為 F01-17 沒有其他已確認的進階路徑，選擇規則退回 NC-P01「維持（沒有套用進階）」（B2-22）。

## 6. 實作中發現的規格衝突或漏列

1. **週摘要替代敘述（已依規格原則修正）**：設計文件第 3A 節寫「替代文字不變」，依據是 `trainingDaysSentence`。但 `fallbackNarrative` 另有自己的天數邏輯，會把 null 寫成「本週尚未完成正式訓練日」，違反「不得把未知解讀成未訓練」。已修改 `js/services/llmSummaryFallback.js` 一行，並由 B2-20 驗證。設計文件該處的描述不精確。
2. **版本的啟用方式（實作選擇，未改變產品決策）**：見 `CHANGELIST.md` 第 2 節。服務層預設維持舊版，由 App 入口帶入版本。因此示範資料（patient00 展示、本機 D5 demo）建立的仍是舊版週期。若希望示範資料也展示新版行為，需要另外決定。
3. **G05 進階路徑**：排除 F01-19 後，新版 G05 的「進階」一律退回「維持」。這是設計文件已列出的後果，在此重申，需要產品端知悉。

## 7. 保留與不變更的部分

- 5xSTS 修正、D5 決策矩陣、D5 LLM 輸入結構、型錄資料、歷史紀錄、已接受的提案都沒有修改，也沒有重算。
- 舊版週期（包括所有既有週期，以及上線前接受、上線後才開始的下一週）的完成判定、偵測器目標與顯示，都與第二批之前相同。

## 8. 尚未進行的驗證

**瀏覽器（實機）**
- 正式新版週期中，15 個偵測器實際啟動時的目標，例如 F01-17 要 20 下、F01-08 每側 30 下。
- KN03、CR05、HP04／05／06、AK08 每側進度在畫面上的實際呈現，包括第一個畫面與每一下的更新。
- 審閱表單的計量方式選單與 F01-19 說明、推薦頁的排除原因與動作不足說明、各頁顯示「待確認」的情況。
- 手機上各種 `alert()` 說明的呈現。

**雲端**
- Firestore 同步週期版本、每日快照的新欄位，以及審閱與接受紀錄中的 `countingBasis`、`completionRulesVersion`。
- 在既有 `firestore.rules` 下，帶有 `countingBasis` 的審閱與接受（規則比對整個 `items`，預期可以通過，但沒有實測）。
- 開始訓練前仍然只確認了**本機**凍結保存，雲端同步沒有驗證，不能說已保存到雲端（與第一批相同）。

**真人**
- 完成天數的準確度、各動作計量依據的臨床適當性、F01-09／19／20 組數與次數的依據（來源表寫無依據），都需要臨床檢視。
- 新規則比舊規則嚴格，對真實使用者完成率與 D5 分級的影響還沒有觀察。
