# patient00 六週展示歷程

這個資料夾讓 patient00 成為「5 週完成 + 第 6 週進行中」的展示個案，並且讓患者端與連結的復健師端都看得到同一份歷程。

狀態：**資料清單、生成腳本、規則檢查與回復方案都已準備好，但雲端還沒寫入，也還沒部署任何規則。**

`private/` 資料夾內含帳號 UID 與真實紀錄的快照，已加入 `.gitignore`，不可提交到公開版本庫。

## 六週內容

| 週 | 日期 | 5xSTS | 訓練日 | 動作 | 下一階段 | 週摘要 | 來源 |
|---|---|---|---|---|---|---|---|
| W1 | 09/03–09/09 | 12.2→11.6 | 6/6 | F01-17、F01-18（G05 初次建議） | R008 維持 → 患者接受 | 規則備用摘要＋模擬確認 | 展示合成 |
| W2 | 09/09–09/15 | 11.6→12.0 | 4/6 | 同上 | 回報小腿緊 → R011 調整，需檢視 → **模擬復健師把 F01-17 改為 2 組 × 8 下** → 患者接受修改後內容 | 同上，內容寫明「已由復健師檢視確認」與修改後的訓練量 | 展示合成 |
| W3 | 09/15–09/21 | 12.0→8.8 | 6/6 | F01-17（2×8）、F01-18 | R005 進階（Confirmed：F01-17→F01-19）→ 患者接受 | 同上 | 展示合成 |
| W4 | 09/21–09/27 | 8.8→9.3 | 3/6 | F01-19、F01-18 | 沒有產生下一階段建議：09/28 改由新的評估重新開始 | 同上 | 展示合成 |
| W5 | 09/28–10/04 | 8.867→8.826 | 0/6 | F01-04、F01-01、F01-10（G01） | R011 調整，患者於 10/14 接受（真實） | 真實的已確認摘要（舊格式），保留 | **真實** |
| W6 | 10/14 起，進行中 | 基準 9.1 | 0 | 同 W5（來自真實的已接受建議） | — | — | 展示合成基準 |

- 趨勢依序為 12.2 → 11.6 → 12.0 → 8.8 → 9.3 ┆ 8.9 → 8.8 ┆ 9.1 → ?。趨勢不是單向的，圖上有兩處斷開。
- 摘要一律使用 app 自己的規則備用摘要：`source: "fallback"`、`model: null`，沒有呼叫任何模型。

## 檔案

| 檔案 | 用途 | 是否寫入雲端 |
|---|---|---|
| `buildHistory.mjs` | 透過 app 的真實服務，在記憶體中建出六週資料，再輸出依階段排序的寫入清單 | 否 |
| `generate.mjs` | 讀取 `private/real_docs.json`，產生 `private/manifest.json` 與 `manifest.summary.txt` | 否 |
| `readCloud.mjs` | `snapshot`：真實紀錄快照。`legacy`：舊兩週展示批次的備份與引用關係。`preflight`：寫入前的檢查 | **只讀取** |
| `buildLocalPreview.mjs` | 把「寫入後雲端會有的內容」轉成本機隔離展示（`?localDemo=d5`）的儲存資料 | 否 |
| `previewShots.mjs` | 用無頭 Chrome 走過患者端與復健師端頁面，截圖並檢查文字（需另外安裝 puppeteer-core） | 否 |
| `checkRulesEmulator.mjs` | 在本機 Firestore 模擬器上，以相同 UID 依階段重播整份清單 | 否 |
| `rules/firestore.deployed-assumed.rules` | 推定目前已部署的規則（10/13 改寫前的版本） | — |
| `rules/firestore.minimal-d5-reviews.rules` | 上述規則只加上 `d5TherapistReviews` 區塊 | — |
| `hash.mjs` | 計算文件內容雜湊，用來偵測文件是否被改動 | — |

## 寫入階段

寫入分四個階段，每個階段都以對應帳號登入執行，前一階段讀回確認無誤後才進行下一階段。

| 階段 | 帳號 | 內容 |
|---|---|---|
| P1 | patient00 | 28 筆：3 次評估、初次建議、W1–W2 週期、20 筆訓練紀錄、W1 建議（已接受），以及 W2 建議（`draft` 狀態，尚未接受） |
| T1 | therapist00 | 1 筆：W2 的模擬檢視，寫入 `d5TherapistReviews/{W2 建議 id}` |
| P2 | patient00 | 26 筆加 1 筆更新：W2 建議改為已接受並採用檢視後的內容、W3/W4/W6 週期、W3 建議、18 筆訓練紀錄、3 次評估（含 W6 的合成基準）。另外更新**真實建議**的 `d5.nextCycleId`、`d5.nextCycleBaselineAssessmentId`、`updatedAt` |
| T2 | therapist00 | 4 筆：W1–W4 週摘要，每份都含 `published` 版本並標示模擬確認 |

所有新文件的 ID 都以 `showcase_p00_<uid8>_h6_` 開頭，並帶有 `demoSynthetic: true` 與 `demoBatch: "p00_history6w_v1"`。

### 真實建議為何要更新 `nextCycleId`

- **一致性：**正式流程 `createNextTrackingCycle` 建立下一週時，一定會把這兩個欄位寫回建議文件。如果略過，資料就和真的走過流程不一致。
- **防重複不依賴這兩個欄位：**重複建立的防護與所有讀取，都是依週期的 `previousCycleId` 判斷，包括 `getNextTrackingCycle`、`confirmD5Proposal`、`checkNextCycleBaselineEligibility`、`createNextTrackingCycle`。
  - 已測試：W6 存在時，再呼叫一次 `createNextTrackingCycle` 會回傳 `created: false` 與同一個 W6。
  - 已測試：`checkNextCycleBaselineEligibility` 會回傳 `next_cycle_exists`。
- **真實建議走的是舊流程：**這份建議是在「安排檢查」機制加入前接受的，沒有 `planFingerprint`。`createNextTrackingCycle` 對這種舊格式有明確支援（需 `nextCycleReady` 加上 `user_acceptance`），W6 就是透過這條路徑建立。
- **更新範圍：**只更新這三個欄位，不改 `items`，也不改 `confirmation`。規則允許這項更新，模擬器也已驗證。
- **回復方式：**清單已記錄這三個欄位的原值（`previous`，原本不存在則記為 `null`）。

### 寫入前檢查與防止重複建立

- 執行 `readCloud.mjs preflight`（只讀取）。任一項未通過就不寫入。檢查項目：
  - 真實紀錄的內容雜湊與快照一致，包括真實週期、真實建議、W5 的兩次評估、真實週摘要與連結關係；
  - 目前沒有進行中的週期；
  - 沒有任何週期接續真實的 W5；
  - 本批次的文件都還不存在。
- 10/14 已執行一次，結果為 `PREFLIGHT OK`。
- 所有 ID 都是固定值：重跑只會覆寫同一份文件，不會新增文件。
- 舊兩週展示 seed 的稽核、重設與重建，現在一律略過 `_h6_` 批次（`isHistory6wId`）。

## 回復

- **病患帳號可刪除的 48 筆：**評估、訓練紀錄與建議。完整 ID 列表見 `manifest.rollback.patientDeletes`。
- **只有管理員能刪除的 10 筆：**5 個週期、4 份週摘要、1 筆檢視（`trackingCycles`、`llmWeeklySummaries`、`d5TherapistReviews` 的規則都設定 `delete: if false`）。請在 Firebase Console 或用 Admin SDK，依 `manifest.rollback.adminDeletes` 的 ID 逐筆刪除。
- **真實建議：**依 `manifest.rollback.restoreRealFields` 把三個欄位還原為原值。
- 全部回復後，主頁會回到「進行下一週期基準評估」。各展示瀏覽器需要登出再登入。

## 規則：最小變更與整份部署的差異

推定的已部署版本與實際雲端行為一致：讀寫 `d5TherapistReviews` 都被拒絕，復健師可以寫入週摘要。**請管理員在 Console 的 Rules 頁核對這個版本。**

**最小變更**是 `rules/firestore.minimal-d5-reviews.rules`：在已部署版本上只加入 `d5TherapistReviews` 區塊與 `reviewTargetsProposal`，兩者與 repo 中完整規則的寫法完全相同。其他規則一字未改。

模擬器結果：

| 規則版本 | 結果 |
|---|---|
| 推定已部署版本 | P1 成功、T1 被拒，與實際雲端相同；實際執行到這裡就會停下 |
| 最小變更 | 69 項中 69 項符合預期，包含拒絕檢查（病患不能寫檢視、未連結的復健師不能讀寫、已接受的建議不能再檢視、不能刪除檢視／週期／週摘要） |
| repo 完整規則 | 69 項中 69 項符合預期 |

如果改為部署 repo 的**整份** `firestore.rules`，除了 `d5TherapistReviews` 之外還會改變以下規則：

1. **`therapistPatientRelations` 不再適用通用規則：**
   - 只有關係中的兩方能讀取；
   - 只有病患本人（或有效的轉介）能建立；
   - 兩方都能結束關係，但只有病患能重新啟用，雙方帳號不能變更；
   - 不能刪除。

   目前的規則允許任何已登入帳號讀寫任何關係。
   - 已確認 `scripts/seedDemoAccounts.mjs` 以復健師身分建立（第 201 行）並刪除（第 183 行）關係，整份部署後這兩步都會被拒。
   - 其他由復健師或第三個帳號建立關係的流程也會被拒。
2. **`recommendationResults` 只有本人能建立、更新、刪除**（讀取仍開放給已登入帳號）：
   - 已接受建議的 `items` 不能再修改；
   - 宣稱經過復健師檢視的接受，內容必須與那份檢視一致（`reviewMatches`）。

   目前任何已登入帳號都能寫入任何人的建議。
3. 其他集合（`schedules`、`analysisRecords`、`patientAssessments`、`functionalAssessmentSessions`）以及 `users`、`trackingCycles`、`llmWeeklySummaries` 都不變。

## 舊兩週展示批次（28 筆，已備份，未刪除）

完整備份與每一筆引用關係都在 `private/legacy_showcase_backup.json`。下列 `<tag>` 代表 `showcase_p00_<uid8>_`。

- **analysisRecords（20 筆）：**
  - `analysis_c1_20260922…0927_{F01-17,F01-18}`（12 筆）
  - `analysis_c2_20260929/0930_{F01-18,F01-19}`（4 筆）
  - `analysis_self_20260928_F02-02`、`analysis_self_20260929_F01-01`
  - `analysis_th_20260927_F01-04`、`analysis_th_20260930_F02-01`
- **functionalAssessmentSessions（2 筆）：**
  - `functionalAssessment_001`：12.8 秒，基準
  - `functionalAssessment_002`：8.9 秒，再次評估，指向 `trackingCycle_001`
- **recommendationResults（2 筆）：**
  - `recommendation_001`：G05 初次建議，草稿
  - `recommendation_002`：下一階段建議，已接受，來源週期為 `trackingCycle_001`
- **schedules（4 筆）：** `schedule_20260927`、`schedule_20260930`、`schedule_20261001`、`schedule_20261002`

引用關係共 51 個，全部指向這個批次內部：

- 16 筆訓練紀錄與 1 次評估，指向**不存在**的 `trackingCycle_001` 或 `trackingCycle_002`；
- `recommendation_002` 的 `d5.sourceCycleId` 與 `d5.nextCycleId` 也都指向這兩個不存在的週期；
- 兩份課表與 2 筆紀錄互相引用。

這 28 筆的日期（09/22–10/02）和 W4／真實 W5 重疊，但它們不屬於任何週期，因此不會出現在追蹤歷程或趨勢圖裡；會出現在訓練紀錄列表與課表中。

## 已知限制

- 本機隔離預覽只包含快照中的真實紀錄。patient00 的其他真實紀錄（例如 09/23 的 24.1 秒、22.8 秒臨時測試，週期以外的訓練紀錄、課表）與舊批次都不在預覽中。
- 實際寫入的腳本尚未撰寫：要等規則阻礙排除後，依上述階段與檢查另行準備並經確認。
