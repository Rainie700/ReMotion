# 五次坐站 離線紀錄重播工具 — 修改清單與驗收方式

- 狀態：**已實作、待驗證**
- 實作日期：2026-10-21
- 本輪**沒有**執行測試、開鏡頭、建置或部署。下文所有說明都來自讀程式碼，不是執行結果。
- 前一輪（逐幀紀錄匯出）的說明在 `docs/verification/fa5x-frame-trace/CHANGELIST.md`。本輪把匯出格式升到 **`fa5x-frame-trace-1.1`**。1.0 檔案的重播結果會是「不支援」，原因見第 3 節。
- 這是開發與回歸檢查用的工具，**不是準確度驗證**。

## 1. 備份與還原

- 備份位置：`docs/verification/fa5x-trace-replay/backup-before/`，內含本輪修改前的版本：
  - `app.js`
  - `package.json`
  - `js/ai/exercises/sitToStand/assessmentSession.js`
  - `js/ai/exercises/sitToStand/assessmentTrace.js`
  - `tests/fa5xFrameTrace.test.js`
- 五個檔案的 MD5 都記在 `backup-before.md5`，實作完成後重新比對過，五個都一致。
- 還原方式（在專案根目錄執行）：

```sh
B=docs/verification/fa5x-trace-replay/backup-before
(cd "$B" && find . -type f) | while read f; do cp "$B/$f" "$f"; done
rm js/ai/exercises/sitToStand/assessmentReplay.js scripts/replayFa5xTrace.mjs tests/fa5xTraceReplay.test.js
```

## 2. 修改清單

| 檔案 | 類型 | 內容 |
|---|---|---|
| `js/ai/exercises/sitToStand/assessmentSession.js` | 修改 | 加入判定幀序號 |
| `js/ai/exercises/sitToStand/assessmentTrace.js` | 修改 | 格式 1.1：完整性標記與結束類型 |
| `app.js` | 修改 | 記錄起點、結束類型、新一輪偵測的接線、工具列警示 |
| `js/ai/exercises/sitToStand/assessmentReplay.js` | 新增 | 重播與比對 |
| `scripts/replayFa5xTrace.mjs` | 新增 | 命令列工具 |
| `tests/fa5xTraceReplay.test.js` | 新增 | 驗收案例 R1～R9，**未執行** |
| `tests/fa5xFrameTrace.test.js` | 修改 | 只改一處原始碼文字比對：`createFa5xTraceRecorder()` 改為 `createFa5xTraceRecorder(`，因為現在呼叫時會帶參數 |
| `package.json` | 修改 | 新增 `test:fa5x-trace-replay`（`npm test` 會一併執行）與 `replay:fa5x-trace`（工具指令，`npm test` 不會執行） |

**`assessmentSession.js`**
- 新增計數器 `processedFrames`，記錄這個判定流程已經處理過幾幀。每筆紀錄因此帶有 `frameIndex`（從 0 起算）。重播工具用它判斷紀錄是否從判定開頭開始，以及中間有沒有缺幀。
- 計數器每幀遞增，與是否開啟記錄無關，也不影響判定。

**`assessmentTrace.js`（格式 1.1）**
- 每一幀加上 `sessionFrameIndex`。
- `stop(reason)` 會記下結束類型 `endType`。
- 匯出內容新增：
  - `recording.startContext`：開始記錄時的位置
  - `completeness`：`startedMidRun`、`firstSessionFrameIndex`、`standStagePartial`、`sessionSegments`、`frameIndexGaps`、`truncated`
- `complete` 必須同時滿足三項：沒有截斷、不是中途開始、判定幀序號連續。`incompleteReason` 會逐項列出原因。

**`app.js`**
- 開始記錄時，把起點資訊交給紀錄器：路由、階段、判定狀態、站立定位是否已開始。
- 新一輪偵測開始時，如果正在記錄，就記一筆 `detection_start` 事件並接上新的判定流程。這補上了一個漏洞：在其他頁面按下「開始記錄」後，原本收不到判定幀。
- 結束時依情況寫入 `run_finished`、`user_cancelled` 或 `detection_exit`；「停止」按鈕寫入 `manual_stop`。
- 工具列會顯示結束類型，以及「中途開始記錄」「判定幀不連續」「容量截斷」三種警示。
- 所有新增程式碼都在 `FA5X_DEBUG` 的條件內，正式判定、門檻、計次、計時與結果都沒有改。

## 3. 重播工具的行為

**原則**
- 重播用的是原本的判定器 `createFiveTimesSitToStandAssessment`，搭配紀錄中的 `params` 與 `targetReps`。
- 依 `seq` 的順序，把每個判定幀紀錄下的 `features` 和原始時間 `t` 送進判定器。取消幀則呼叫 `cancel(t)`。
- 工具本身沒有任何計次或門檻規則，驗收案例 R9 會用原始碼比對確認這一點。

**一般支援檢查**（任一項不符就判為「不支援」，不重播）
- 格式版本必須是 `fa5x-frame-trace-1.1`。1.0 沒有判定幀序號與開始／結束標記，無法確認紀錄是否完整。
- `algorithmVersion` 必須與目前的判定器相同。
- `params` 的欄位必須與目前完全相同，而且都是數值。
- 必須有 `frames`、`events` 與 `targetReps`。
- 如果門檻版本或門檻數值與目前不同，只列為注意事項，重播仍使用紀錄中的門檻，不修改程式中的門檻。

**完整性檢查**
- 同時看紀錄器的標記，也獨立檢查幀序號，任一項成立就判為「無法確認重現」：
  - 容量截斷
  - `frameCount` 或 `eventCount` 與實際內容不符
  - 中途開始記錄
  - 判定幀序號跳號
  - 匯出時仍在記錄中
  - 手動停止
  - 未開始計時就離開
  - 缺少 `endType`
  - 最後一段判定沒有結束事件

**分段**
- `sessionFrameIndex` 回到 0 表示換了一個新的判定流程（畫面設定重來），從這裡開始新的一段。
- 第一個 0 之前的判定幀（中途開始的部分）只計入「略過」，不拿來比對，因此不會產生誤報的不一致。

**比對**
- 每一幀比對：判定幀序號、判定前後狀態（含確認幀數）、判定步驟與各條件、事件類型、事件內容。比對前兩邊都先經過 JSON 轉換，避免數值表示方式造成差異。
- 每一段的摘要比對：計次、事件時間（`baseline`、`start_cue`、`rejected`、`rep`、`finished`、`frame_changed`）、結束狀態、總時間。
- 最後一段的結果，還會再和匯出檔中的 `result` 比對一次。
- 回報第一個不一致的位置：第幾段、`seq`、判定幀序號、`t`、判定步驟、欄位路徑、紀錄值與重播值。
- 如果有事件被丟棄，就不比對摘要和事件內容（缺漏會造成假的不一致），只比對每幀的事件類型。

**判定結果**

| 結果 | 條件 |
|---|---|
| 不支援 | 一般支援檢查不通過 |
| 不一致 | 任一幀或任一段摘要不同 |
| 無法確認重現 | 已重播的部分一致，但紀錄不完整 |
| 重現成功 | 紀錄完整、每一幀一致，而且最後一段的結束結果也一致 |

- 「重現成功」只有在最後一種情況才會出現。

**結束類型**（容量截斷不算結束類型，另以 `truncated` 標示）

| 結束類型 | 說明 | 重播判定 |
|---|---|---|
| `run_finished` | 正常結束：完成、逾時或無效 | 可以判為重現成功 |
| `user_cancelled` | 使用者在計時中按「結束評估」 | 可以判為重現成功，取消本身也會被重播 |
| `manual_stop` | 開發者按「停止」 | 無法確認重現 |
| `detection_exit` | 尚未開始計時就離開 | 無法確認重現 |
| `still_recording` | 匯出時仍在記錄 | 無法確認重現 |

## 4. 操作指令（待執行）

```sh
# 驗收測試（合成資料）
npm run test:fa5x-trace-replay
npm run test:fa5x-frame-trace
npm run test:fa5x

# 重播一份下載的紀錄檔
npm run replay:fa5x-trace -- <path/to/fa5x-frame-trace-....json>
npm run replay:fa5x-trace -- <path/to/fa5x-frame-trace-....json> --json   # 輸出完整報告
```

- 命令列工具的結束碼：

| 結束碼 | 意義 |
|---|---|
| 0 | 重現成功 |
| 1 | 不一致 |
| 2 | 無法確認重現（紀錄不完整） |
| 3 | 不支援，或檔案無法讀取 |

- 工具只讀取指定的檔案，不寫入任何檔案，也不連網。

## 5. 驗收案例

**A. 自動測試（`tests/fa5xTraceReplay.test.js`，未執行）**

| 案例 | 內容 | 預期 |
|---|---|---|
| R1 | 完整的正常結束紀錄，先轉成 JSON 再讀回 | 重現成功；5 次、狀態為完成、總時間與 `result` 相同 |
| R2 | 竄改某個計次幀的 `after.completedReps` | 不一致，第一個不一致正好是該幀的 `seq`，欄位為 `after.completedReps` |
| R3 | 重播時注入不同的站立門檻（只用在這個測試，不改程式門檻） | 不一致，每幀比對與摘要都抓到差異 |
| R4 | 第 200 幀才開始記錄 | `startedMidRun` 為 true、`complete` 為 false；重播結果為無法確認重現，略過的幀數大於 0，重播 0 幀 |
| R5 | 容量上限設為 120 幀 | `truncated` 為 true，`endType` 仍是 `run_finished`；重播結果為無法確認重現，已重播的部分沒有不一致 |
| R6 | 使用者取消 | 重現成功，結束原因為 `user_cancelled` |
| R6 | 手動停止、仍在記錄中 | 兩者都是無法確認重現 |
| R7 | 畫面設定重來（兩個判定流程） | 分成 2 段，重現成功 |
| R8 | 格式 1.0、演算法版本不同、`params` 欄位不同、檔案內容為 null | 都判為不支援，沒有重播任何幀 |
| R9 | 原始碼檢查 | 重播模組沒有門檻或計次規則，也沒有網路、儲存或寫檔行為 |

**B. 實機紀錄（需要開鏡頭，由人執行）**
1. 用 `?fa5xDebug=1`，在站立定位之前按「開始記錄」，完成 5 次，下載 JSON，再執行 `replay:fa5x-trace`。預期結束碼為 0，報告中的計次和總時間與結果頁一致。
2. 在計時中途才按「開始記錄」。預期工具列顯示「中途開始記錄」，重播結果為無法確認重現（結束碼 2）。
3. 計時中按「結束評估」。預期 `endType` 為 `user_cancelled`，重播結果為重現成功，結束原因為 `user_cancelled`。
4. 記錄中按「停止」再下載。預期 `endType` 為 `manual_stop`，結束碼 2。
5. 在準備階段旋轉手機。預期報告列出 2 段（或更多），最後一段有結束事件。
6. 連續記錄超過 6000 幀。預期 `truncated` 為 true，結束碼 2。
7. 換一台裝置或瀏覽器重播同一份紀錄，確認結果一樣。重播只依賴紀錄檔，結果應與裝置無關，這一點待驗證。
8. 如果實機紀錄出現「不一致」，代表判定器在相同輸入下沒有重現相同結果，請保留檔案、記下第一個不一致的位置，再做分析。

## 5a. 本機工程驗證後的補正（2026-10-21）

- 驗證結果見 `VERIFICATION_REPORT.md`，以下兩項都已重跑相關測試：
  - `assessmentReplay.js`：事件因容量上限截斷時，「紀錄」摘要改用幀上的事件類型與保留的結果整理，不再誤寫成「0 次｜未結束」。判定規則沒有改，事件截斷仍然是無法確認重現。
  - `tests/fa5xTraceReplay.test.js`：新增 R4b（紀錄器標記缺幀）與 R5b（事件截斷時的摘要）。沒有修改或刪除任何既有斷言。

## 6. 已知限制

- 站立定位階段（`stand` 幀）不重播。它在 App 端執行，不屬於五次坐站判定器。
- 相機推論出錯而跳過的幀，本來就沒有送進判定器，所以不在紀錄裡，也不影響重播是否一致。
- 重播只能證明「判定器在相同輸入下得到相同決定」，不能證明輸入（關鍵點）本身正確，也不能證明計次或計時準確。
