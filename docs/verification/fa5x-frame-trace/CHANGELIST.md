# 五次坐站 開發用逐幀判定紀錄匯出 — 修改清單與驗收方式

- 狀態：**已實作、待驗證**
- 實作日期：2026-10-21
- 本輪**沒有**執行測試、開鏡頭、建置或部署。下文所有「確認」都來自讀程式碼，不是執行結果。
- 這份紀錄只用於開發重播與除錯，**不是準確度驗證資料**。

## 1. 備份與還原

- 備份位置：`docs/verification/fa5x-frame-trace/backup-before/`
  - `app.js`
  - `js/ai/exercises/sitToStand/assessmentSession.js`
  - `package.json`
- 三個備份的 MD5 都記在 `backup-before.md5`，實作完成後重新比對過，三個都一致。
- 還原方式（在專案根目錄執行）：

```sh
B=docs/verification/fa5x-frame-trace/backup-before
cp "$B/app.js" app.js
cp "$B/js/ai/exercises/sitToStand/assessmentSession.js" js/ai/exercises/sitToStand/assessmentSession.js
cp "$B/package.json" package.json
rm js/ai/exercises/sitToStand/assessmentTrace.js tests/fa5xFrameTrace.test.js
```

## 2. 修改清單

| 檔案 | 類型 | 內容 |
|---|---|---|
| `js/ai/exercises/sitToStand/assessmentSession.js` | 修改 | 見下方說明 |
| `js/ai/exercises/sitToStand/assessmentTrace.js` | 新增 | 紀錄器，不碰畫面與網路，見下方說明 |
| `app.js` | 修改 | 見下方說明 |
| `tests/fa5xFrameTrace.test.js` | 新增 | 驗收用測試，**未執行** |
| `package.json` | 修改 | 新增 `test:fa5x-frame-trace`，因此 `npm test` 會一併執行它 |

**`assessmentSession.js`**
- 新增 `setTraceListener(fn)`。
- 判定記錄 `diag` 只有在掛上監聽器時才會建立。各判定分支只用 `diag && Object.assign(diag, {...})` 複製判定程式已經算好的值。
- 三個條件原本寫在 `if` 裡，現在先存成具名變數（`moved`、`belowBaseline`／`earlyRise`、`partialSit`），再由 `if` 使用。式子和原本相同，判定結果不變。
- 每幀交給監聽器的內容：
  - 送進判定的特徵 `features`
  - 時間 `t`
  - 判定前狀態 `before`、判定後狀態 `after`（含確認幀數）
  - 判定記錄 `diag`
  - 本幀發生的事件
- `cancel()` 也會送出一筆紀錄。
- 監聽器拋出錯誤時會被攔下，不影響判定。

**`assessmentTrace.js`**
- 紀錄器 `createFa5xTraceRecorder()`。
- 容量上限：6000 幀、2000 個事件。超過上限時略過新資料並計數，匯出內容標示 `complete: false`，並寫明原因。
- 關鍵點只保留 `FA5X_REQUIRED_LANDMARKS` 列出的 8 個點：x、y、visibility、presence。
- 匯出 JSON 時，基準資料與結果直接取自判定流程送出的事件。

**`app.js`**
- 新增的程式碼都只在 `FA5X_DEBUG`（`?fa5xDebug=1`）開啟時執行。
- 偵測頁右下角有一個浮動的開發工具列，放在 `<body>` 上，所以跳到結果頁後仍在。按鈕有：開始記錄、停止、下載 JSON、清除。工具列顯示幀數、容量上限，超過上限時顯示「⚠ 紀錄不完整」。
- 記錄的內容：
  - 每幀的影像尺寸與關鍵點
  - 站立定位階段的判定結果（`createStandingPositionCheck().update()` 的回傳值）
  - 判定流程送出的逐幀紀錄
  - 畫面設定重來（`setup_restart`）
  - 正式結束（`finalized`）
  - 未產生結果就離開（`detection_exit`）
- 正式結束或離開後會自動停止記錄，資料留在記憶體裡，可以手動下載。

**沒有修改的部分**
- 結果頁 `fiveTimesSitToStandResultPage`。
- 計次、計時、門檻（`FA5X_PARAMS`）與正式結果內容（`finalizeFa5xAssessment` 儲存的 `stored`）。
- 自動跳到結果頁的 1 秒延遲。
- 沒有加入影片上傳功能，也沒有任何網路或儲存寫入。

## 3. 匯出 JSON 格式（`fa5x-frame-trace-1.0`）

**最上層欄位**

| 類別 | 欄位 |
|---|---|
| 版本 | `formatVersion`、`algorithmVersion`、`thresholdVersion`、`timingDefinition`、`geometryCoordinateSpace` |
| 時間與門檻 | `timeBase`（相機的 `performance.now()`，單位 ms）、`targetReps`、`params`（完整門檻）、`requiredLandmarks` |
| 記錄過程 | `recording`（開始與停止時間）、`capacity` |
| 完整性 | `complete`、`incompleteReason`、`droppedFrames`、`droppedEvents` |
| 基準與結果 | `baseline`、`baselineHistory`、`result`（判定流程送出的原始結果，與儲存版本相同來源） |
| 紀錄內容 | `frameCount`、`eventCount`、`frames`、`events` |

**每一幀的欄位**

| 欄位 | 說明 |
|---|---|
| `seq` | 序號 |
| `stage` | `stand` 或 `assess` |
| `kind` | `frame` 或 `cancel` |
| `t` | 時間 |
| `frameWidth`、`frameHeight` | 影像尺寸 |
| `landmarks` | 8 個必要關鍵點 |
| `features` | 送進判定器的原樣特徵 |
| `kneeAngleAvailable` | 膝角是否可用 |
| `before`、`after` | 判定前後狀態：`phase`、`repState`、`prompt`、`standConfirm`、`seatConfirm`、`completedReps`、`rejectedAttempts`、`lostSince`、`countdownValue`、`stableSince`、`stableSamples` |
| `diag` | 判定步驟與條件，見下表 |
| `eventTypes` | 本幀發生的事件類型 |

**`diag` 判定步驟**

| 階段 | `step` 值 |
|---|---|
| 準備階段 | `untracked`、`framing_not_ok`、`seated_check`（含 `hipJitter`、`moved`、`stableElapsedMs`）、`baseline_set`、`ready_watch`（含 `belowBaselineReset`、`falseStart`）、`start_cue`、`frame_changed` |
| 計時中：結束或中斷 | `timeout`、`frame_changed`、`tracking_gap`、`tracking_lost_invalid`、`start_position_not_seated` |
| 計時中：起身與站立 | `seated_idle`、`rise_onset`、`rising`、`standing_confirmed`、`rejected_not_fully_standing` |
| 計時中：坐下 | `standing`、`descent_start`、`descending`、`rep_counted`、`rejected_not_fully_seated`、`back_to_standing_wobble` |
| 結束後與取消 | `ignored_after_finish`、`user_cancelled`、`cancelled_before_start` |

- 計時中的每一幀另外附上：`displacement`、`kneeAngle`、`kneeAngleAvailable`、`kneeOk`、`standingNow`、`seatedNow`、`riseOnset`、`exitStanding`。
- 匯出內容不含使用者 ID、影像或影片。

## 4. 特別確認（讀程式碼，未執行）

**除錯關閉時不收集逐幀資料：已由程式碼確認，待實機驗證**
- `FA5X_DEBUG` 為 false 時：
  - 不建立紀錄器：`startFa5xTrace` 第一行就返回，而且視窗上不會出現控制函式。
  - 不顯示工具列。
  - `fa5xTraceFrame` 不會被設定。
  - 判定流程沒有掛監聽器，因此 `diag` 一直是 `null`，`before`／`after` 都不會建立。
- 除錯關閉時，判定流程每幀只多做三件事：
  - 檢查一次 `traceListener`
  - 執行若干 `null && ...` 的短路判斷
  - 把三個條件存成具名變數
- 除錯開啟但沒有按「開始記錄」時，同樣不收集任何資料。

**除錯開啟並記錄時的效能：待驗證**
- 每幀會多做這些事：
  - 建立 `before`／`after`／`diag`
  - 用 JSON 深拷貝特徵與關鍵點
  - 每 500 ms 更新一次工具列文字
- 6000 幀的 JSON 大約數 MB（估計值，未量測）。
- 目前未量測對 66 ms 推論間隔或畫面流暢度的影響。

## 5. 已知限制

- 相機迴圈中 `detectForVideo` 拋錯而跳過的幀，本來就沒有送進判定器，所以不在紀錄中。
- 在測試進行到一半才按「開始記錄」時，紀錄會缺少開頭的資料。`trace_started` 事件會記下當時所在的階段。
- 紀錄只存在記憶體中。重新整理頁面或關閉分頁後就會消失。
- 這份紀錄還不能直接重播：仍需要另寫一個重播腳本，把 `frames[].features` 和 `t` 依序送進 `createFiveTimesSitToStandAssessment().processFrame`。本輪沒有寫這個腳本。

## 6. 後續驗收方式（全部待執行）

**A. 本機測試**
1. 執行 `npm run test:fa5x-frame-trace`。它檢查以下幾點（使用合成資料，不是準確度驗證）：
   - 有監聽器和沒有監聽器時，每幀快照都完全相同。
   - 監聽器拋出錯誤也不影響判定。
   - 紀錄裡的計次與拒絕原因，和結果一致。
   - 容量上限的處理正確。
   - 沒有儲存或網路行為。
   - App 的接線只在除錯模式下生效。
2. 執行以下既有測試，確認原始碼文字檢查沒有被影響：
   - `npm run test:fa5x`、`npm run test:fa5x-compat`
   - `npm run test:result-states`、`npm run test:tracking`、`npm run test:reassessment`
   - `npm run test:d5-next-cycle`、`npm run test:flow-qa`
3. 執行 `npm test`，和本輪之前的結果比較：第二批之後是 116/122 通過，6 個既有失敗。預期變成 117/123 通過，6 個失敗都是既有的失敗。

**B. 瀏覽器與實機（需要開鏡頭，由人執行）**
4. 不帶 `?fa5xDebug=1` 完成一次測試，確認：
   - 沒有出現工具列。
   - 在主控台輸入 `typeof window.startFa5xTrace` 得到 `"undefined"`。
   - 結果頁和儲存的結果與修改前相同。
5. 帶 `?fa5xDebug=1`，但不按「開始記錄」完成一次測試，確認工具列一直顯示「未記錄」。
6. 帶 `?fa5xDebug=1`，在站立定位之前按「開始記錄」，完成 5 次，然後下載 JSON。確認：
   - 有 `stand` 幀和 `assess` 幀。
   - 包含 `baseline_set`、`start_cue`、5 筆 `rep_counted`。
   - `result` 與結果頁一致。
   - `complete: true`。
7. 用同樣方式測試以下情境，確認各自的 `diag.step` 和事件都出現：
   - 中途遮住身體超過 1.2 秒（無效結束）
   - 只起身一半（未完全站直）
   - 計時中按「結束評估」
   - 在準備階段旋轉手機（畫面設定重來）
8. 效能：在同一台裝置上，比較記錄中和未記錄時的推論間隔與畫面流暢度，並記下下載檔案的大小。
9. 容量：連續記錄超過 6000 幀（約 6.6 分鐘），確認：
   - 工具列顯示「⚠ 紀錄不完整」。
   - 下載的檔名帶有 `-incomplete`。
   - JSON 中 `complete: false`，`droppedFrames` 大於 0。
10. 用 DevTools 的 Network 面板確認，整個過程沒有因為記錄而送出任何請求。

**C. 雲端**
- 不適用。這個功能不寫入雲端，本輪也沒有做任何雲端驗證。
