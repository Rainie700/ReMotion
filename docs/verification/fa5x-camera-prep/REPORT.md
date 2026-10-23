# fa5x-camera-prep：首次鏡頭實測前準備

日期：2026-10-22｜接續 `docs/verification/fa5x-12-browser/REPORT.md`
狀態：**未部署**；**未開鏡頭**；**未連正式 Firebase**；**真人準確度未驗證**。
目前版本（先讀程式確認，不沿用報告假設）：演算法 `fa5x-assessment-1.2`、門檻 `fa5x-engineering-candidate-2026-09-28`、逐幀紀錄格式 `fa5x-frame-trace-1.1`。本批**沒有**修改偵測門檻、計時規則、版本相容規則或 D5 決策矩陣。

## 0. 備份與改動範圍

修改前備份在 `backup-before/`，雜湊值在 `backup-before.md5`。

| 檔案 | 結果 | 差異檔 |
|---|---|---|
| `styles.css` | 已修改（只新增 `.fa5x-cond-form` 一段樣式） | `results/08-diff-styles.txt` |
| `tests/homeResultRedesign.test.js` | 已修改（只補測試環境缺少的依賴，**沒有改任何斷言**） | `results/08-diff-homeResultRedesign.test.txt` |
| `app.js` | 已備份，**未修改**（第 3 項檢查後不需要調整） | — |

新增檔案（都在本資料夾）：
- `FIRST_CAMERA_TEST_GUIDE.md`
- `FIRST_CAMERA_TEST_RECORD.csv`
- `emulator/firebase.json`
- `emulator/start-emulators.ps1`
- `browser/phase4-form-and-note.mjs`
- `browser/phase5-camera-day-dryrun.mjs`
- `results/*`

## 1. `displayCompletedTrainingDays is not defined`

- **原因**：
  - 實際 App 沒有問題：`app.js` 第 304 行已從 `js/data/f01DailyTargets.js` 匯入這個函式。
  - 錯誤只發生在測試 `tests/homeResultRedesign.test.js`。這個測試把首頁卡片的函式原始碼抽出來，放進自己的環境執行，但沒有提供這個函式。
  - 同類缺漏還有 `describeWeekSynthetic`、`DEMO_SYNTHETIC_TEXT`、`weekSyntheticNote`、`fmtF01TrainingDays`。
- **實際影響**：使用者畫面沒有影響。影響在測試：這個測試在第一個區段就中斷，後面的檢查完全沒有執行。
- **修正**：在測試環境補上這些函式，都直接取用真正的程式模組，不是自己寫替身。沒有改任何斷言。
- **修正後**：
  - ReferenceError 已消失，測試往後跑到第 11 節。
  - 在第 11 節失敗：`F01-05 placeholder (label + visible text)`。
  - 這是另一個既有問題：運動圖片清單 `EXERCISE_ASSET_AUDIT` 已經把 F01-05、F01-07、F01-09 標成「已確認、有圖」，測試卻仍預期顯示「圖片準備中」。這和 `test:flow-qa` 的失敗是同一類。
  - 本批不處理：它屬於圖片資料與測試預期不一致，和鏡頭實測無關。
  - 證據：`results/05-home-redesign-after.txt`。

## 2. 五次坐站測試條件表單

- **原因**：全站樣式 `input, select { width:100%; padding:11px; … }` 也套用到了單選鈕，所以單選鈕被撐成整列寬，文字被擠到下一行。
- **修正**：`styles.css` 新增 `.fa5x-cond-form` 樣式，只作用在這個表單：
  - 每個選項是一個整列的方框，單選鈕和文字在同一行。
  - 整列都可以點，最小高度 44 px。
  - 選中的那列會變綠。
  - 題目會換行，椅子高度欄不超出畫面。
- **沒有改的部分**：選項、`name` 與 `value`、資料欄位、「沒回答＝不確定」的判定都沒改。HTML 和 `app.js` 都沒動。
- **瀏覽器驗證**（`browser/phase4-form-and-note.mjs`，Edge 無頭模式，寬度 375 與 430 px，本機模擬器）：**22 / 22 通過**（`results/01-phase4-run2.txt`）。
  - 每個選項的單選鈕都在文字左邊、同一行。
  - 每列高度 44 px。
  - 頁面、手機框、表單、選項都沒有橫向溢出。
  - 選項文字與順序不變。375 px 是一般結果，8 個選項；430 px 是再次評估類結果，多「同一張椅子」3 個選項，共 11 個。
  - 點選項列最右側（離單選鈕最遠處）就能選取。
  - 按「儲存測試條件」後，模擬器裡新增一筆回報，欄位與值都正確：
    - `armsUsed=no`、`physicalAssistance=unknown`、`source=caregiver_report`
    - `sameChairAsBaseline`：一般結果是 `not_applicable`，再次評估類是 `unknown`
    - `schemaVersion=fa5x-condition-report-1`
  - 沒有對外連線，沒有錯誤彈窗。
- **截圖**：
  - 表單：`results/shot-375-02-condition-form.png`、`results/shot-430-02-condition-form.png`
  - 儲存後：`results/shot-375-03-after-save.png`、`results/shot-430-03-after-save.png`
- 第一次執行（`results/01-phase4-run1.txt`）在第 8 項中斷。這是測試腳本的問題：要點的那列被底部導覽列蓋住，點到了導覽列。修正方式是先把該列捲進畫面再點，與 App 無關。

## 3. 「進行中週期」說明能否在按「查看訓練建議」前讀到

- 情境：病人有進行中的 7 日追蹤，又另外做了一次新的評估，然後打開這次的結果頁。
- 做法：模擬使用者往下捲，捲到「查看訓練建議 →」按鈕剛好在底部導覽列上方。
- 結果：**375 與 430 px 都通過**。
  - 說明全文完整出現在畫面內，位於按鈕正上方，沒有被紅色測試橫條或底部導覽列擋住。
  - 430 px 時，說明在 527–623 px，按鈕在 631–682 px，導覽列從 682 px 開始。
- **結論：不需要調整位置，`app.js` 未修改。**
- 截圖：`results/shot-375-01-active-cycle-note-before-button.png`、`results/shot-430-01-active-cycle-note-before-button.png`。
- 限制：這是程式化捲動的幾何檢查，不代表真人一定會讀完那段文字。

## 4. 首次實測紀錄表與操作步驟

- `FIRST_CAMERA_TEST_RECORD.csv`：46 欄，已預填 T01–T03 三列。欄位包括：
  - 設備：型號、系統、瀏覽器與版本、鏡頭
  - 拍攝環境：光線、背光、鏡頭高度、距離、角度、是否全身入鏡、背景、衣著
  - 測試條件：椅子、椅高、扶手、是否雙手抱胸、是否有人協助
  - 系統結果：狀態、秒數、次數、結束原因、版本
  - 人工對照：碼表秒數、人工計次、計時者、差值
  - 同步方式
  - 紀錄檔名：trace、重播結果、截圖、對照影片
- `FIRST_CAMERA_TEST_GUIDE.md`：
  - 逐步操作
  - 人工碼表要和系統用同一個起訖點：聽到「開始」按下，第 5 次坐回停止（`start_cue_to_fifth_seated`）
  - 檔名規則，例如 `20261023-T01-laptop-edge-trace.json`
  - 不要做的事
  - 含臉的影片只放在專案以外，不上傳

## 5. 資料流與「不寫入正式資料」的做法

詳見 `FIRST_CAMERA_TEST_GUIDE.md` 第 1 節。重點：
- **影像不保存、不上傳**，只在瀏覽器記憶體裡處理。
- 第一次使用會從網路**下載** MediaPipe 程式與模型（`cdn.jsdelivr.net`、`storage.googleapis.com`）。
- 結果寫入 localStorage 和 Firestore。網址有 `?emulator=1` 時，Firestore 是本機模擬器；localStorage 使用另一組 `remotion_emulator_` 開頭的鍵。
- 逐幀紀錄只在記憶體，手動下載才成為檔案，內容沒有影像、沒有使用者 ID。
- 判斷是否安全的唯一依據：**畫面上方的紅色橫條**。

**無鏡頭預演**（`browser/phase5-camera-day-dryrun.mjs`）：**10 / 10 通過**（`results/02-phase5-dryrun-run2.txt`）。
- 用實測時的網址 `?emulator=1&fa5xDebug=1` 打開，紅條有出現。
- 透過 App 自己的「建立帳號」註冊成功，帳號確實在本機 Auth 模擬器裡。
- 登入後，使用者資料寫在本機 Firestore 模擬器。
- 瀏覽器只用到 `remotion_emulator_` 開頭的鍵。
- 登入後網址仍保留 `fa5xDebug=1`。
- 全程沒有連到任何本機以外的網站。
- 對照組（沒有 `?emulator=1`）**沒有紅條**。這組攔截了所有對外連線，也沒有登入。
- 截圖：`results/shot-05-01`～`shot-05-04`。
- 第一次執行有 1 項失敗，原因是腳本查帳號用錯了模擬器 API，與 App 無關。原始輸出保留在 `results/02-phase5-dryrun-run1-harness-endpoint-bug.txt`。

**模擬器啟動腳本**（`emulator/start-emulators.ps1`）：
- 已實際用這個腳本啟動成功。
- 會自動改用 JDK 22。這台電腦預設的 `java` 是 1.8，太舊。
- 每次啟動前複製目前的 `firestore.rules`，因為 firebase 不允許讀取設定資料夾以外的規則檔。
- **在這台電腦發現的問題**：匯出資料時，資料已完整寫入暫存資料夾，但最後改名被 Windows 拒絕（EPERM）。模擬器關閉後，該資料夾仍無法改名，但可以複製。
- 處理方式：腳本在下次啟動時，把最新一份完整匯出複製成 `emulator-data`。
- 已驗證：重啟後 2 個測試帳號和使用者資料都還在（`results/03-emulator-restart-persistence.txt`）。
- 測試完已刪除 `emulator-data`、log 與規則副本，你第一次使用會是乾淨的。

## 6. 測試與建置

**受影響測試**（`results/04-affected-tests.txt`）：
- 11 個通過：
  - result-states
  - fa5x、fa5x-compat、fa5x-gap-reset、fa5x-version-notice
  - fa5x-frame-trace、fa5x-trace-replay
  - fa5x-condition-report、fa5x-blocked-result-checks
  - emulator-mode
  - training-tab-layout
- 1 個失敗：home-redesign，見第 1 節。

**全套 `npm test`**：修改前 **123 / 129**（`results/00-npm-test-before.txt`），修改後 **123 / 129**（`results/06-npm-test-after.txt`）。**不是全部通過。**失敗的 6 項與修改前相同，逐項如下：

| 測試 | 錯誤 | 說明 |
|---|---|---|
| `test:tracking` | `OPTIONAL_CLOUD_COLLECTIONS = ["trackingCycles"]` 比對失敗 | 既有。測試比對的是舊版原始碼文字；現在清單有 3 個集合。 |
| `test:flow-qa` | `F01-05 is still in the asset backlog` | 既有。圖片清單已更新，測試預期沒跟上。 |
| `test:home-redesign` | `F01-05 placeholder (label + visible text)` | 錯誤訊息改變了：原本的 ReferenceError 已修正，現在停在同類的圖片資料不一致（第 1 節）。 |
| `test:exercise-experience` | `F01-17: unconfirmed photo -> placeholder` | 既有。同類圖片資料不一致。 |
| `test:self-practice-library` | `F01-17 (needs_review) -> explicit placeholder` | 既有。同類圖片資料不一致。 |
| `test:llm-weekly-summary` | `no .env.local` | 既有。環境缺少本機設定檔，不是程式錯誤。 |

**`npm run build`**：成功（`results/07-build.txt`），只有既有的檔案大小警告。

## 7. 仍未解決／未執行

- **未執行：真實鏡頭測試。** 開鏡頭、MediaPipe 實際下載與辨識、真人做 5 次坐站，都還沒做。
- **未驗證**：
  - 用 Ctrl+C 結束時的自動匯出，沒有在這台電腦實際按 Ctrl+C 測過。預演是用 `emulators:export` 指令觸發同一個匯出流程。
  - 手機以 USB `adb reverse` 走 localhost 的方式。
- **未處理（既有，與本批無關）**：上表 5 項圖片資料／舊原始碼比對的測試失敗，以及 `.env.local` 缺漏。
- 匯出資料夾無法改名（EPERM）的根本原因沒有查明。腳本已經用複製的方式繞過。

## 8. 你接下來怎麼做第一次鏡頭測試（摘要）

完整步驟見 `FIRST_CAMERA_TEST_GUIDE.md`。

1. PowerShell 視窗 A：進到 `docs\verification\fa5x-camera-prep\emulator`，執行 `powershell -ExecutionPolicy Bypass -File .\start-emulators.ps1`，等它出現 `All emulators ready!`。
2. 視窗 B：在專案根目錄執行 `npm run dev`。
3. 用 Edge 打開 `http://localhost:5173/?emulator=1&fa5xDebug=1`。**沒看到紅色橫條就停止。**
4. 註冊一個假的本機帳號，例如 `camera-test-1@local.test`，然後登入。
5. 依序進入：功能評估 → F01　下肢功能 → 了解五次坐姿起立功能評估 → 開始評估 → 允許相機 → 在右下角面板按「開始記錄」。
6. 照提示完成 5 次。旁人用碼表計時：聽到「開始」按下，第 5 次坐回停止。
7. 在結果頁：按「下載 JSON」、截圖、填「確認測試條件」並儲存，再把數字填進紀錄表。
8. 事後執行 `npm run replay:fa5x-trace -- <trace.json>` 檢查重播。
9. 結束時：兩個視窗都按 Ctrl+C。
10. 建議做 T01–T03 三次。回報時請附上紀錄表、trace、重播結果與截圖，不要附含臉的影片。
