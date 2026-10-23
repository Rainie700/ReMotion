# 五次坐站 A 批（紀錄與權限基礎）— 修改清單

- 狀態：**已實作、待驗證、未部署**
- 日期：2026-10-22
- 依據：`docs/verification/fa5x-criteria-evidence/RESULT_USABILITY_DESIGN.md`（第四版，A 批）
- 本輪**沒有**執行測試、建置、部署、種子腳本，也沒有操作雲端資料。下文所有「確認」都是讀程式得到的，不是執行結果。
- A 批**不阻擋**初次推薦、建立週期或 D5（那是 B 批）。

## 1. 備份與還原

- 修改前備份：`docs/verification/fa5x-batch-a/backup-before/`，MD5 記在 `backup-before.md5`。
- 還原方式（在專案根目錄執行）：

```sh
B=docs/verification/fa5x-batch-a/backup-before
(cd "$B" && find . -type f) | while read f; do cp "$B/$f" "$f"; done
rm js/data/fa5xConditionReport.js scripts/fa5xSessionRulesCheck.mjs tests/fa5xConditionReport.test.js
```

## 2. 修改清單

| 檔案 | 類型 | 內容 |
|---|---|---|
| `js/data/fa5xConditionReport.js` | 新增 | 驗證條件回報的答案；防禦性讀取（缺漏一律視為 `unknown`，絕不當成 `no`）；取最新一筆；列出所有同時存在的問題；決定時間標題。**不判斷使用資格** |
| `js/data/functionalAssessmentService.js` | 修改 | 新增 `appendFa5xConditionReport(sessionId, answers, { reportedBy })`（見下方說明） |
| `js/data/storageService.js` | 修改 | 三項修改，見下方說明 |
| `firestore.rules` | 修改 | 新增 `functionalAssessmentSessions` 專用規則，見下方說明，以及第 3 節的保證範圍 |
| `js/data/functionalProgressService.js` | 修改 | 兩項修改，見下方說明 |
| `app.js` | 修改 | 結果頁、確認表單、資料頁趨勢圖，見下方說明 |
| `scripts/seedDemoAccounts.mjs` | 修改（**未執行**） | 三項修改，見下方說明 |
| `scripts/fa5xSessionRulesCheck.mjs` | 新增（**未執行**） | 模擬器權限案例 AR1～AR15；每次寫入都用整份文件的 `setDoc`，與 App 的寫法相同 |
| `tests/fa5xConditionReport.test.js` | 新增（**未執行**） | AD1～AD7、AS1，以及規則與儲存層的原始碼檢查 |
| `tests/resultStates.test.js` | 修改 | 重建結果頁時，補上新的實際相依（`renderFa5xConditionSection` 與三個條件回報輔助函式）。沒有使用替身，也沒有改動任何斷言 |
| `package.json` | 修改 | 新增 `test:fa5x-condition-report` |

**`functionalAssessmentService.js`**：`appendFa5xConditionReport(sessionId, answers, { reportedBy })`
- 只會在 `conditionReports` 後面追加一筆，不碰 `result`、`status` 或舊的回報。
- 只接受五次坐站紀錄，而且量測結果已經儲存。
- `reportedBy` 必須是受測者本人。
- `source` 只能是 `self_report` 或 `caregiver_report`。
- 值不合法就整筆拒絕。

**`storageService.js`**
1. 寫入五次坐站紀錄時，比照 `trackingCycles` 的做法，蓋上病人**目前已接受**的關聯標記（`therapistId`、`relationId`）。
2. 復健師載入病人紀錄時，只走「狀態為已接受」的關聯，並用三個條件查詢（`patientId`、`therapistId`、`relationId`）。
3. 病人登入後，標記和目前關聯不一致的自己的紀錄，會重新寫回並更新標記。只有標記欄位改變，`result` 與 `conditionReports` 都照原樣寫回。

**`firestore.rules`**：新增 `functionalAssessmentSessions` 專用規則，並從最後的開放規則清單中移除。
- 讀取：本人；或者紀錄上的標記指向一個**目前仍為已接受**的關聯（沿用 `linked()`，每次讀取都重新讀取關聯文件）。
- 建立：只能建立自己的紀錄；標記必須是空的，或是自己目前已接受的關聯；不得帶示範標記；不得帶有任何回報。
- 修改：只能修改自己的紀錄；`result` 一旦寫入就不能再變；回報一次只能追加一筆，舊的不能變，新的一筆必須由本人寫入、欄位與值必須合法；示範標記不能改變；標記必須合法。
- 刪除：一律禁止。

**`functionalProgressService.js`**
1. 資料頁的趨勢點新增 `measurementGroup` 與 `connectsToPrevious`：只有同一個已知量測版本組的點才相連，所有點都保留顯示。
2. 追蹤歷程裡，週與週之間的虛線，只有在兩邊屬於同一個已知版本組時才畫。

**`app.js`**
- 結果頁（只有在完成時才顯示）：
  - 時間標題：「完成時間（依使用者回報的條件）」或「觀察時間」，並列出所有問題。
  - 「測試條件（使用者回報）」卡片：顯示最新一筆回報、所有問題，並說明「系統沒有驗證；回報不會改變上方的量測結果」。
- 回報表單：
  - 不預選任何答案；有「不確定」；沒回答的題目記為「不確定」。
  - 一定要選「由誰回答」。
  - 只有再次評估和下一週期基準，才會問「是否同一張椅子」。
  - 只有受測者本人看得到表單。
- `submitFa5xConditionReport`：讀取表單內容並追加一筆回報，同時掛到 `window`。
- 資料頁的趨勢圖：不同量測版本之間的線會斷開。
- 未完成、量測無效的結果頁，與修改前相同。

**`seedDemoAccounts.mjs`**（未執行）
1. Demo 患者的肩部紀錄，改用**病人帳號**寫入，標記留空，等病人的 App 登入時補上。
2. 展示個案沒有登入帳號，在新規則下**任何帳號都不能**替他們建立紀錄，所以預設略過，並印出說明。只有在專案仍使用舊規則時，才能用環境變數 `SEED_SHOWCASE_SESSIONS_UNDER_OLD_RULES=1` 開回。
3. 加上 `--reset` 時，不再列出或刪除五次坐站紀錄（新規則禁止）。

## 3. 「App 只允許追加」與「雲端規則保證」

| 性質 | 本批的 App 程式 | 本批的規則檔（**部署並通過模擬器之前不成立**） |
|---|---|---|
| 只有擁有者能寫 | App 只替目前登入的病人寫入 | 規則限制 |
| `result` 寫入後不能覆寫 | 服務沒有提供改寫方法 | 規則限制 |
| 回報只能追加 | 服務只提供追加方法 | 規則限制（每次最多一筆，舊的不變） |
| 回報作者是本人 | 程式檢查 | 規則限制（`reportedBy` 必須等於登入者） |
| 回報時間 | 使用裝置的時鐘 | **不保證** |
| 回報內容是否屬實 | 不保證 | **不保證**（永遠只是使用者聲明） |
| 復健師讀取 | App 只載入已接受關聯的紀錄 | 規則每次都重新讀取關聯文件：狀態、病人、復健師三者都要符合 |
| 示範標記、刪除 | App 不會做 | 規則禁止 |

- 在規則部署並驗證之前，只能說「App 只允許追加」。程式註解與畫面都沒有使用「已保護」「不可覆寫」「已驗證」這類字眼，這一點由 AD4、AS1 的原始碼檢查把關。

## 4. 「有效關聯」能否保證：發現的阻礙

| # | 問題 | 影響 | 本批處理方式 |
|---|---|---|---|
| O1 | 規則無法保證「一位病人同時只有一個已接受的關聯」。App 會擋（`relationService.js:30-33`），但病人可以直接建立任何「已接受」的關聯（`firestore.rules:43-46`，既有規則） | **待驗證（推論）**：依規則檔，多出來的關聯只會讓病人自己建立關聯時指定的那位復健師，能讀取蓋有該關聯標記的五次坐站紀錄；同時有兩個已接受的關聯時，只有標記到的那一位讀得到。這個推論只涵蓋 `functionalAssessmentSessions`，不涵蓋其他仍開放的集合（`schedules`、`analysisRecords`、`patientAssessments`、`recommendationResults` 的讀取），也還沒有在模擬器上驗證（HANDOFF R 系列） | 不擴充，列為待決定 |
| O2 | 標記要靠**病人登入**才會更新 | 換了復健師之後，新的復健師要等病人下次登入才讀得到。**待驗證（推論）**：關聯結束之後，舊復健師**新發出的**雲端讀取應該會被規則拒絕，因為規則每次都會讀取關聯文件。但這**不包含**舊復健師裝置上已經載入的本機副本（見 HANDOFF 第 3 節）；而且「規則生效的時間點」本身也還沒驗證。舊紀錄在病人登入前，復健師也讀不到 | 已實作「登入時重新標記」；延遲是已知限制（設計 P3） |
| O3 | 展示個案沒有登入帳號 | 新規則下沒有任何帳號能替他們建立紀錄 | 種子腳本預設略過，要等示範資料重建（待辦 T5） |
| O4 | `seedDemoAccounts.mjs` 用復健師帳號建立展示關聯。這在**目前專案的規則檔下本來就會被拒**（`firestore.rules:43-46`，關聯只能由病人建立），與本批無關 | 種子腳本在目前的規則檔下本來就無法完整執行 | 本批不處理，只回報 |
| O5 | `scripts/demo/patient00History6w/buildHistory.mjs` 寫入帶有 `demoSynthetic` 的紀錄 | 新規則會拒絕 | 本批沒有修改，留待示範資料重建 |
| O6 | 五次坐站紀錄是登入時**必要**載入的集合，而且沒有錯誤處理（`hydrateCloudForUser`） | 如果規則**先於**新的 App 程式部署，復健師原本的單一條件查詢會被拒，**登入就會失敗** | 必須先部署 App，再部署規則（第 6 節） |

結論（**待驗證**，範圍限定）：
- 只讀規則檔與程式，**沒有找到**會讓「已結束或不屬於該病人的關聯」通過 `functionalAssessmentSessions` 雲端讀取規則的寫法。
- 這個結論尚未在模擬器上驗證。
- 不涵蓋其他集合。
- 不涵蓋已經載入到裝置上的資料。
- 不涵蓋線上實際部署的規則內容。

O1、O2 主要影響的是可讀性。交接細節見 `HANDOFF.md`。

（2026-10-22 修訂：原寫法「不會讓別人讀到資料」「立刻讀不到」改為上述待驗證描述；原文保留在 `backup-before-handoff/`。）

## 5. 待驗證項目（都還沒執行）

1. **單元測試**：`npm run test:fa5x-condition-report`。
2. **相關既有測試**：
   - `npm run test:result-states`（已補上相依）
   - `test:fa5x`、`test:flow-qa`、`test:home-redesign`、`test:data-profile-cleanup`、`test:training-events`、`test:patient00-showcase`
   - 這幾支會檢查結果頁或趨勢的原始碼文字與輸出。
3. **全套測試**：`npm test`，與修改前逐項比對。修改前的基準 118/124 的來源與限制，見 `HANDOFF.md` 第 1 節：執行紀錄存在，但它是否對應 A 批修改前的程式狀態，**部分待確認**。
4. **建置**：`npm run build`。
5. **模擬器**：`scripts/fa5xSessionRulesCheck.mjs`（AR1～AR15），另外再用新規則跑一次既有的 `scripts/firestoreRulesCheck.mjs`。特別要確認的語法與行為：
   - 清單前段比較 `after[0:n] == before`
   - `get()` 在三條件查詢下能不能用
   - `map.get` 的預設值
   - 寫入 `result: null` 的情況
6. **瀏覽器**：
   - 表單操作與補答。
   - 復健師端載入有標記的紀錄。
   - 病人登入時的重新標記：寫入次數、是否全部成功。
   - 趨勢圖的斷線顯示。
7. **部署前**：確認線上目前的規則內容（設計待辦 T8），並取得部署授權。
8. **部署後**：用測試帳號做部署後檢查（A 批完成條件第 5 點）。

## 6. 部署順序（建議，本輪不執行）

1. 先部署 App（新的復健師查詢、標記與重新標記）。
2. 等病人陸續登入，舊紀錄才會被標記。
3. 再部署 `firestore.rules`。
4. 反過來的順序會讓復健師登入失敗（O6）。
