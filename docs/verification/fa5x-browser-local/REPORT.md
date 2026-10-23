# 本機瀏覽器驗證批次 — 修改清單與驗證報告

- 日期：2026-10-22
- 狀態：**已實作，本機驗證通過，未部署**。
- 沒有連線正式 Firestore 或正式 Auth，沒有使用正式帳號，沒有開鏡頭，沒有部署。
- A 批的凍結版本與它的驗證結果（`docs/verification/fa5x-batch-a/`）**都沒有改動**。
- 本批的修改前備份，就是 A 批凍結狀態的快照。
- 原始輸出、截圖、驗證腳本：
  - `results/`：最終執行的輸出與截圖
  - `results/superseded/`：被取代的早期執行，保留作為證據
  - `browser/`：驗證腳本

## 1. 備份與還原

- 修改前備份：`backup-before/`，MD5 記在 `backup-before.md5`。共 5 個檔案：
  - `app.js`
  - `js/data/firebase.js`
  - `js/data/storageService.js`
  - `js/services/llmProviderAdapter.js`
  - `package.json`
- 還原方式（在專案根目錄執行）：

```sh
B=docs/verification/fa5x-browser-local/backup-before
(cd "$B" && find . -type f) | while read f; do cp "$B/$f" "$f"; done
rm tests/emulatorMode.test.js tests/fa5xBlockedResultChecks.test.js
```

- 已驗證：用這份備份重建的副本，MD5 與 `backup-before.md5` 一致（`results/07-failure-comparison.txt`）。

## 2. App 初始化與登入流程（實作前查證）

- `js/data/firebase.js` 在模組載入時就初始化 Firebase。`authService` 與 `storageService` 都直接使用這裡匯出的 `firebaseAuth`、`firestore`。
- 登入流程：
  1. `app.js` 中的 `authService.subscribe(...)`（Firebase 的 `onAuthStateChanged`）
  2. 讀取 `users/{uid}` 個人資料
  3. `storageService.hydrateCloudForUser`（載入雲端資料）
  4. `setSession`
- 本機示範模式（`?localDemo=d5`）原本就**完全不掛**Firebase 登入。
- 其他可能連到正式服務的路徑：

| 路徑 | 本批處理 |
|---|---|
| Firebase Auth、Firestore | 連到模擬器 |
| `llmProviderAdapter.js` 的 `firebase/ai` 與 App Check（週摘要、D5 草稿） | 在模擬器模式**停用** |
| MediaPipe 的 CDN 與模型 | 只在開鏡頭時載入，本批不開鏡頭，**沒有驗證** |
| Analytics、Service Worker、其他直接的網路請求 | 程式中都沒有 |

## 3. 修改清單

| 檔案 | 修改 |
|---|---|
| `js/data/firebase.js` | 新增**模擬器模式**，詳見下方 |
| `js/data/storageService.js` | 模擬器模式使用獨立的本機快取前綴 `remotion_emulator_`，與正式（`remotion_`）和本機示範（`remotion_localdemo_`）分開 |
| `app.js` | 「本機測試資料」橫幅與連線失敗時的封鎖，詳見下方 |
| `js/services/llmProviderAdapter.js` | 模擬器模式下，`ensureAppCheck` 與兩個模型呼叫在第一行就拋出錯誤，比載入 App Check 或 `firebase/ai` 都早。呼叫端原本就會在出錯時改用規則備用結果 |
| `tests/emulatorMode.test.js` | 新增：檢查啟用條件、不會改連正式環境、快取分開、模型服務停用 |
| `tests/fa5xBlockedResultChecks.test.js` | 新增：逐字重跑 `homeResultRedesign` 中被既有失敗擋住的結果頁檢查（第 6 節） |
| `package.json` | 新增 `test:emulator-mode`、`test:fa5x-blocked-result-checks` |

**`js/data/firebase.js`：模擬器模式**
- 必須**三個條件同時成立**才會啟用：
  1. Vite 開發建置（`import.meta.env.DEV`）
  2. 網址主機是 `localhost` 或 `127.0.0.1`
  3. 網址明確加上 `?emulator=1`
- 啟用後：
  - 使用獨立的 `demo-remotion` 專案設定，以及示範用的 API key。
  - 在模組載入時，就同步讓 Auth 連到 `127.0.0.1:9099`、Firestore 連到 `127.0.0.1:8080`，比任何登入或資料操作都早。
- 另外新增 `checkEmulatorsReachable()`，用來檢查兩個模擬器是否能連線。

**`app.js`：橫幅與封鎖**
- 模擬器模式下，畫面頂端固定顯示「本機測試資料｜Firebase 模擬器（demo-remotion）｜非正式資料」。橫幅放在 `#app` 外面，換頁也不會消失。
- 連線檢查在啟動時就開始。登入回呼的**第一行**會等待檢查結果，失敗就直接返回，所以不會登入、不會載入資料。
- 連線失敗時，會蓋上一層全螢幕說明：「無法連線本機 Firebase 模擬器……也不會改連正式環境」。
- 原本的 `if (!LOCAL_DEMO_MODE) authService.subscribe(` 這一行**保持原樣**（見第 5 節的修正）。

**正式建置不會啟用**（`results/09-dist-scan.txt`）
- 在建置出來的檔案中，模擬器模式被編譯成常數 `var Oie=!1, lh=()=>Oie`，也就是永遠為 false。
- `initializeApp` 只會收到正式設定。
- 示範用的 API key、連到 Auth 模擬器的呼叫，都不在建置檔中。
- 檔案中出現一次 `connectFirestoreEmulator`，那是 Firestore SDK 自己的警告訊息字串，不是本批的呼叫（已檢視上下文確認）。
- 橫幅文字和快取前綴等字串雖然還在，但都位於永遠為 false 的條件之後，是不會執行的程式碼。

## 4. 驗證結果（最終程式）

| 項目 | 結果 | 證據 |
|---|---|---|
| `test:emulator-mode` | 通過 | `results/07-retest-emulator-mode.txt` |
| `test:fa5x-blocked-result-checks` | 通過 | `results/01-test-fa5x-blocked-result-checks.txt` |
| `test:fa5x-condition-report`、`result-states`、`fa5x`、`data-profile-cleanup` | 通過 | `results/01-*` 是 X1 修正**之前**的執行；修正後由全套測試 `results/06-npm-test.txt` 再次涵蓋，都通過 |
| `test:d5-llm-recommendation` | 通過（修正後，見第 5 節） | `results/07-retest-d5-llm-recommendation.txt` |
| 全套測試 | **121 / 127**：多出的 2 支是本批新增的測試，都通過；6 項失敗與 A 批凍結版**逐項相同** | `results/06-npm-test.txt`、`results/07-failure-comparison.txt` |
| Vite 建置 | 通過 | `results/08-vite-build.txt` |
| 瀏覽器第 0 階段（模擬器**沒有**啟動） | **5 / 5** | `results/04-phase0-no-emulator.txt`、`shot-00` |
| 瀏覽器第 1 階段（模擬器已啟動） | **26 / 26** | `results/05-phase1-emulator-flows.txt`、`shot-01`～`shot-09` |

**瀏覽器第 0 階段**（模擬器沒有啟動）

| 案例 | 預期 | 結果 |
|---|---|---|
| P0-1 | 畫面被封鎖，顯示無法連線的說明 | 通過 |
| P0-2 | 橫幅顯示 | 通過 |
| P0-4 | 沒有任何請求送往非本機主機 | 通過 |
| P0-5 | 沒有寫入正式快取 | 通過 |

P0-3 只是重述 P0-1，不算獨立的證據。

**瀏覽器第 1 階段**（模擬器已啟動）

| 案例 | 內容 | 結果 |
|---|---|---|
| B1 | 用本機合成的病人帳號登入；登入後仍顯示橫幅 | 通過 |
| B2 | **病人登入時補標記**：5 份沒有標記的舊紀錄，都標上了已接受的關聯 | 通過 |
| B3 | 補標記後，每一份原量測結果（以排序後的 JSON 比對）完全不變 | 通過 |
| B4 | 本機快取只有 `remotion_emulator_*` | 通過 |
| C1～C3 | 未回報的結果顯示「觀察時間｜測試條件尚未回報」；時間 8.8 秒不變；表單沒有預選 | 通過 |
| C4 | **只選「由誰回答」**：兩題都存成 `unknown`，畫面列出兩項「不確定」 | 通過 |
| C5 | **明確選「不確定」**（家人代答）：第二筆回報存入，第一筆不變 | 通過 |
| C6 | **有人協助**：第三筆回報存入，標題維持「觀察時間｜回報有人協助」 | 通過 |
| C7 | 三次回報之後，原結果不變 | 通過 |
| D0～D3 | **重新載入**（先清除本機的模擬器快取，確保資料一定是從模擬器重新載入）：登入狀態恢復；顯示「共 3 次回報」與最新的「有人協助」；時間不變；模擬器中原結果不變、回報有 3 筆 | 通過 |
| D4 | 再次評估的結果有「是否同一張椅子」這一題 | 通過 |
| E1 | **資料頁趨勢**：1.0 與 1.1 之間斷線，路徑是 `M … L … M … L` | 通過 |
| E2 | **追蹤歷程**：只畫第 1 週和第 2 週的線，沒有連接兩週的虛線 | 通過 |
| F1～F3 | **復健師查詢**：用本機合成的復健師帳號登入，透過三條件查詢載入全部 5 份已補標記的紀錄；快取也是分開的 | 通過 |
| G1 | 整次執行中，沒有任何請求送往非本機主機（只有 5173、8080、9099） | 通過 |
| G2 | 沒有跳出提示框，也沒有頁面錯誤 | 通過 |

**資料來源**
- 帳號是透過 Auth 模擬器的 REST 介面建立的合成帳號，名稱為 `bv-*@local.test`。
- 紀錄由**真正的**服務程式在 node 中產生，再以關閉規則的模擬器管理身分寫入。
- 第 1 週的 1.0 版週期，是用第 2 週週期的格式複製出來的，因為現行服務已拒絕以 1.0 作為新基準。
- 紀錄寫入時**沒有**關聯標記，用來測試補標記。
- 種子清單：`results/seed-manifest.json`。

## 5. 本批發現並處理的問題

| # | 問題 | 分類 | 處理 |
|---|---|---|---|
| X1 | 第一版實作把 `if (!LOCAL_DEMO_MODE) authService.subscribe(` 改成另一個函式，導致 `test:d5-llm-recommendation` 失敗。該測試用來確保示範模式不會掛上 Firebase 登入 | **本批造成，已修正** | 修改程式、不修改測試：恢復原本那一行，把模擬器檢查移到登入回呼的第一行。修正後重跑這支測試、全套測試、建置，以及**兩個瀏覽器階段**。修正前的全套測試輸出在 `superseded/06-npm-test-before-subscribe-fix.txt` |
| X2 | 驗證腳本第一次執行時當掉（`superseded/05a-…`） | 腳本錯誤 | 腳本改成當掉時仍印出部分結果 |
| X3 | 驗證腳本第二次執行時，重新載入後太早操作頁面，App 還沒恢復登入。這造成 D4 失敗、一次當機，而且 **D1 是假的通過**（顯示的是舊的本機快取，不是從模擬器載入的資料）（`superseded/05b-…`） | 腳本錯誤 | 等待條件改成「已登入的畫面出現」；重新載入前先清除模擬器快取，強制從模擬器載入。最終執行中 D0～D4 都是在這個條件下通過 |
| X4 | 更正 A 批報告第 4 節 E2：`flow-qa` 是在第 6 節（動作圖片清單）才失敗，**它的結果頁檢查（第 2、3 節）其實已經執行並通過**；只有第 7 節（網站圖示）被擋住，與 A 批無關 | 更正 | 依指示不修改 A 批報告，在這裡記錄 |

## 6. 補驗被既有失敗擋住的結果頁檢查

- `homeResultRedesign.test.js` 在第 2 節就失敗（既有的 `displayCompletedTrainingDays is not defined`），所以之後的結果頁檢查都沒有執行。
- 本批把下面三段**逐字**複製到 `tests/fa5xBlockedResultChecks.test.js` 執行：
  - 第 7、8、9 節：完成結果的版面——只有一個主要數字、完成紀錄、版面順序、禁用字詞
  - 第 12 節：「最近評估」開啟最新的五次坐站結果
  - 檔案結尾兩條路由檢查
- 使用相同的擷取方式與斷言，**沒有放寬**，原測試檔也沒有修改。
- 結果：**全部通過**。這表示 A 批對結果頁的修改，符合這些既有檢查。
- `flow-qa` 不需要補驗（見 X4）。

## 7. 觀察（本批不修改，避免擴充）

- **結果頁的說明列措辭矛盾**：同一頁上方標示「觀察時間｜回報有人協助」，下方說明卻仍寫「8.8 秒將作為後續再次評估時的比較依據」（`shot-05`）。A 批本來就不阻擋比較，但這段文字與標題矛盾，應該在 B 批的顯示規則中處理。
- 「本機測試資料」橫幅會蓋住頁面頂端約 20 px，但沒有擋到返回按鈕的點擊區域（從截圖判斷）。

## 8. 限制

- 瀏覽器是無頭 Edge（Playwright 搭配本機已安裝的 Edge），畫面寬度模擬 430 px。**不是**實機手機，也不是真人操作。
- 登入、換頁、切換分頁，是用 `window` 上公開的函式觸發的（與畫面按鈕呼叫的是同一組函式）；表單作答與送出則是真的點選。
- 資料都是合成的。模擬器不等於線上環境，線上規則現況仍然未知。
- 鏡頭與 MediaPipe 沒有測試；五次坐站判定的準確度不在本批範圍。
- 暫存資料夾中的模擬器工具與 `playwright-core`，都裝在專案以外，沒有加進專案的相依套件。
