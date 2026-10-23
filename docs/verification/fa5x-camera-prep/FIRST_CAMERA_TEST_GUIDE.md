# 五次坐站：第一次鏡頭實測操作指南（本機、不寫入正式資料）

> 對象：親自執行第一次鏡頭實測的人（專案負責人）。
> 目的：確認在真實鏡頭下，流程能跑完、結果能保存、問題能留下紀錄，可以事後重播。
> **這不是準確度驗證。** 一次自己測的結果，不能寫成「真人準確度已驗證」。
> 本指南的設定步驟已在 2026-10-22 以無鏡頭方式預演過（見 `REPORT.md` 第 5 節）；**實際開鏡頭的部分尚未執行**。

---

## 1. 資料怎麼流動（白話版）

```
鏡頭畫面 ──(只在瀏覽器裡)──▶ MediaPipe 姿勢辨識 ──▶ 每 66 毫秒一組關節座標
                                                    │
                                                    ▼
                              五次坐站判定（計次、計時；門檻不變）
                                                    │  測試結束
                                                    ▼
                         結果（總秒數、完成次數、版本 1.2 …）
                          │                          │
                          ▼                          ▼
          瀏覽器 localStorage（本機快取）      Firestore（雲端資料庫）
                                                 └─ 加上 ?emulator=1 時 → 本機模擬器 127.0.0.1:8080
                                                 └─ 沒加 ?emulator=1 時 → 正式 Firebase（不要這樣測）
```

| 東西 | 會不會離開電腦 | 存在哪裡 |
|---|---|---|
| 鏡頭影像 | **不會**。只在瀏覽器記憶體裡處理，程式沒有錄影、沒有上傳影像。 | 不保存 |
| MediaPipe 程式與模型 | 第一次會從網路**下載**（`cdn.jsdelivr.net`、`storage.googleapis.com`）。這是下載程式，不是上傳你的資料。 | 瀏覽器快取 |
| 測試結果（秒數、次數、版本） | 模擬器模式下只送到本機模擬器 | `remotion_emulator_` 開頭的 localStorage ＋ 本機 Firestore 模擬器 |
| 測試條件回報（有沒有用手撐等） | 同上 | 同一筆結果的 `conditionReports`（只會新增，不會覆蓋） |
| 逐幀紀錄（trace JSON） | **不會**。只在記憶體，按「下載 JSON」才會存成檔案。內容是關節座標與判定過程，**沒有影像、沒有使用者 ID**。 | 你的「下載」資料夾 |

程式依據：`js/ai/squatCameraController.js`（開鏡頭、下載模型）、`app.js` `finalizeFa5xAssessment`（建立結果）、`js/data/storageService.js` `persistRecord`（寫入 Firestore）、`js/data/firebase.js`（模擬器模式的三個條件）、`js/ai/exercises/sitToStand/assessmentTrace.js`（逐幀紀錄）。

### 怎麼確定不會寫到正式資料

模擬器模式**三個條件都要成立**才會啟動，否則一律是正式設定：

1. 用 `npm run dev` 開的開發伺服器（正式建置版永遠不會啟動模擬器模式）；
2. 網址是 `localhost` 或 `127.0.0.1`；
3. 網址有 `?emulator=1`。

**判斷方法只有一個：畫面最上方要有紅色橫條「本機測試資料｜Firebase 模擬器（demo-remotion）｜非正式資料」。**
看不到紅條 → 立刻關掉分頁，不要登入、不要測試。（對照截圖：`results/shot-05-01-start-page-with-banner.png` 有紅條；`results/shot-05-04-control-no-banner-do-not-use.png` 沒有紅條，是不能用的畫面。）

模擬器沒開時，模擬器模式的頁面會停住、不登入，**不會改連正式服務**（前一批 fa5x-browser-local 已驗證）。

### 手機能不能用

- **筆電／桌機的內建或 USB 鏡頭：可以**，這是建議的第一次實測方式。
- **手機透過 Wi‑Fi 連電腦的 IP（例如 `http://192.168.x.x:5173`）：不行。** 網址不是 localhost，模擬器模式不會啟動，而且非 HTTPS 時瀏覽器通常不給鏡頭。不要這樣做。
- Android 手機用 USB 線加 `adb reverse` 讓手機也用 `localhost` 開啟：理論上可行，**未驗證**，第一次實測不建議。

---

## 2. 事前準備（只需做一次）

需要：Node.js、Java JDK 21 以上（這台電腦已有 `C:\Program Files\Java\jdk-22`；預設的 `java` 是 1.8，太舊，啟動腳本會自動改用 jdk-22）、Microsoft Edge 或 Chrome、可用的鏡頭。

第一次執行時，`npx` 會從 npm 下載 `firebase-tools@15`（約 1–2 分鐘）。這是下載工具，不會連到任何 Firebase 專案。

---

## 3. 每次實測的步驟

### 3-1. 開兩個終端機

**終端機 A（模擬器）** — PowerShell：

```powershell
cd "C:\Users\User\Downloads\ReMotion-main (4)\ReMotion-main\docs\verification\fa5x-camera-prep\emulator"
powershell -ExecutionPolicy Bypass -File .\start-emulators.ps1
```

看到 `All emulators ready!` 才繼續。這個視窗**整個測試期間都不要關**。

**終端機 B（網頁）**：

```powershell
cd "C:\Users\User\Downloads\ReMotion-main (4)\ReMotion-main"
npm run dev
```

### 3-2. 開網頁並確認紅條

用 Edge 或 Chrome 開：**`http://localhost:5173/?emulator=1&fa5xDebug=1`**

- 確認最上方有紅條（見上一節）。沒有就停止。
- `fa5xDebug=1` 會在測試頁顯示數值區與「逐幀紀錄」面板。

### 3-3. 建立本機測試帳號（第一次才需要）

選「病人」→「建立帳號」→ 任意填一個**假的** email，例如 `camera-test-1@local.test`，密碼至少 6 字元 → 建立成功後用它登入。
**不要用正式帳號或真實 email。** 這個帳號只存在本機模擬器裡。

### 3-4. 進行一次測試

1. 從首頁進入功能評估（「開始功能評估」或「AI 動態功能評估」入口）→ 點「F01　下肢功能」→「了解五次坐姿起立功能評估 →」→ 看完說明 →「開始評估 →」。
2. 瀏覽器問是否允許使用相機 → 允許。（第一次會下載 MediaPipe 模型，需要網路，等幾秒。）
3. 測試頁右下角會出現黑色的「5xSTS 逐幀紀錄（開發用）」面板（只在 `fa5xDebug=1` 時出現）→ 按 **「開始記錄」**。在距離調整階段就先按，紀錄才完整；面板若顯示「⚠ 中途開始記錄」，表示這份紀錄無法完整重播。
4. 依畫面提示調整距離 → 坐下、雙手交叉抱胸 → 聽到「開始」後起身，完成 5 次。
5. **人工對照**：另一個人用碼表，**聽到「開始」按下，第 5 次完全坐回椅子時停止**（系統的計時定義是 `start_cue_to_fifth_seated`，人工要用同一個起訖點）；同時人工數次數。
6. 結果頁出現後，在面板按 **「下載 JSON」**。檔案會在「下載」資料夾，名稱像 `fa5x-frame-trace-2026-10-23T10-15-00-000Z.json`（尾端有 `-incomplete` 表示紀錄不完整，仍要保留）。
7. 截圖結果頁（總秒數、完成次數那一區）。
8. 在結果頁「確認測試條件」依實際情況回答並按「儲存測試條件」。
9. 把結果填進紀錄表 `FIRST_CAMERA_TEST_RECORD.csv` 的一列。

### 3-5. 重播檢查（事後，在終端機 B 先按 Ctrl+C 停掉網頁或另開終端機）

```powershell
cd "C:\Users\User\Downloads\ReMotion-main (4)\ReMotion-main"
npm run replay:fa5x-trace -- "<trace 檔路徑>" > "<測試編號>-replay.txt"
```

結果代號：0＝重播與當時判定一致；1＝不一致（要回報）；2＝紀錄不完整無法驗證；3＝檔案無法讀取。
重播只代表「程式可重現當時的判定」，**不代表準確**。

### 3-6. 結束與保存

- 終端機 B：Ctrl+C 停掉網頁。
- 終端機 A：**Ctrl+C 一次**，等它匯出完畢自己結束。資料會保留，下次執行 `start-emulators.ps1` 會自動載入。
  - 在這台電腦上預演時，匯出的資料已完整寫入，但最後改名步驟被 Windows 拒絕（EPERM）。腳本已處理：下次啟動時會先把最新一份完整匯出複製成 `emulator-data`。已驗證：重啟後測試帳號與資料都還在（`results/03-emulator-restart-persistence.txt`）。用 Ctrl+C 結束時的自動匯出，**未在這台電腦實際按 Ctrl+C 驗證**（預演是用 `firebase emulators:export` 指令觸發同一個匯出流程）。
- 想從頭開始：關掉模擬器後刪除 `emulator\emulator-data` 資料夾即可。這只會清掉本機假資料。

---

## 4. 同步方式要記錄什麼

紀錄表 `sync_method` 欄位請填實際情況，第一次實測應該是：

`emulator-local`（結果寫入本機模擬器 demo-remotion；沒有寫入正式 Firestore）

若因任何原因看到沒有紅條的畫面上出現了結果，填 `UNEXPECTED-production` 並立刻停止、回報，不要自行刪除資料。

---

## 5. 檔名規則

每次測試給一個編號：`<日期>-T<兩位數序號>-<裝置>-<瀏覽器>`，例如 `20261023-T01-laptop-edge`。

| 檔案 | 檔名 | 放哪裡 |
|---|---|---|
| 逐幀紀錄 | `20261023-T01-laptop-edge-trace.json`（把下載的檔案改名，原檔名抄進 notes） | `docs/verification/fa5x-camera-test-1/traces/` |
| 重播結果 | `20261023-T01-laptop-edge-replay.txt` | 同上 |
| 結果頁截圖 | `20261023-T01-laptop-edge-result.png` | `docs/verification/fa5x-camera-test-1/screenshots/` |
| 對照錄影（可選） | `20261023-T01-laptop-edge-video.mp4` | **只放在自己電腦、專案資料夾以外**（有臉，不要放進專案或上傳） |
| 紀錄表 | 複製 `FIRST_CAMERA_TEST_RECORD.csv` 到 `docs/verification/fa5x-camera-test-1/` 後填寫 | 同上 |

`fa5x-camera-test-1/` 資料夾在實測當天自己建立；本批沒有建立，以免和「已執行」混淆。

---

## 6. 建議第一次做幾次、怎麼做

- 至少 3 次（T01–T03），同一張椅子、同一個位置，依說明頁正常做。
- 若時間允許，再加 1 次刻意不標準（例如沒有完全站直），看系統怎麼處理，notes 寫清楚是刻意的。
- 每次都要有人工碼表數字，否則那一次沒有對照價值。
- 有任何卡住、沒反應、提示看不懂，就把**時間點與畫面**寫進 `visible_problems_during_test`。

## 7. 不要做的事

- 不要開沒有紅條的頁面測試；不要用正式帳號。
- 不要用 `npm run build` 的版本或已部署的網址測試。
- 不要改偵測門檻或計時規則後再測（那樣結果不能代表目前版本）。
- 不要把含臉的影片、截圖放進專案或上傳。
