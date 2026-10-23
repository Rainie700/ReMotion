# 五次坐站 逐幀紀錄與離線重播 — 本機工程驗證報告

- 驗證日期：2026-10-21
- 環境：Node v24.18.0、Windows 11、Vite 8（`npm run build`）
- 範圍：只做不需要攝影機的本機工程驗證。沒有真人測試、瀏覽器操作或效能量測，也沒有部署或推送。
- 測試資料都是合成資料。結果只能證明「紀錄與重播的工程流程正確」，**不能**作為計次或計時準確度的驗證。
- 每個步驟的實際指令與輸出都保存在 `results/`。每份檔案的開頭有指令，結尾有 `exit=` 結束碼。

## 1. 結果總覽

| 項目 | 結果 | 證據 |
|---|---|---|
| 逐幀紀錄測試 `test:fa5x-frame-trace` | **通過** | `results/01-…`、`results/05-…` |
| 離線重播測試 `test:fa5x-trace-replay`（R1～R9，加上本輪新增的 R4b、R5b） | **通過** | `results/05-retest-fa5x-trace-replay.txt` |
| 既有五次坐站測試 `test:fa5x` | **通過**（但其中一項 git 檢查在這個環境下沒有作用，見第 6 節） | `results/01-test-fa5x.txt` |
| 量測版本相容性測試 `test:fa5x-compat` | **通過** | `results/01-test-fa5x-compat.txt` |
| 完整流程：真正的紀錄器 → JSON 檔 → 命令列重播 | **通過**（15 份檔案，每份的結束碼都符合預期） | `results/02-…`～`04b-…`、`results/e2e-traces/` |
| 掛與不掛紀錄器的正式結果比較（6 種情境） | **完全相同** | `results/e2e-traces/official-result-comparison.json` |
| 突變檢查（確認測試真的會抓到錯誤） | 7 項中有 6 項第一次就抓到；漏抓的 1 項補了測試後也抓到 | `results/06-mutation-checks.txt` |
| 全套測試 `npm test` | **118 / 124 通過**。6 項失敗都是既有失敗，已逐一和修改前比對 | `results/07-…`、`results/08-…` |
| Vite 建置 | **通過**（結束碼 0），只有既有的大型檔案警告 | `results/09-vite-build.txt` |
| 真人準確度、瀏覽器操作、效能 | **未執行（待驗證）** | — |

## 2. 完整流程：紀錄器 → JSON → 命令列重播

**做法**
- `e2e/generateTraces.mjs` 把合成特徵送進原本的判定器 `createFiveTimesSitToStandAssessment`。
- 接線方式和 `app.js` 相同：`setTraceListener` 接到 `recorder.recordFrame("assess", …)`，並附上 33 點假姿勢，讓關鍵點子集的流程也被執行到。
- 用 `buildExport()` 產生匯出內容，以 `JSON.stringify(…, null, 2)` 寫檔，和下載功能使用相同的序列化方式。
- 再由 `npm run replay:fa5x-trace -- <檔案>` 讀檔並重播。
- 各檔案的標記見 `results/03-trace-flags.txt`。

| 檔案 | 情境 | 預期 | 實際 |
|---|---|---|---|
| 01-complete | 完整的正常結束（5 次，其中 1 次未站直被拒絕，另有一段短暫追蹤中斷） | 0 重現成功 | **0**，重現成功 |
| 02-tampered-decision | 把第 3 次計次幀的紀錄改成 `after.completedReps = 99` | 1 不一致，位置在 seq 249 | **1**，第一個不一致在 seq 249、判定幀 #247、`rep_counted`、欄位 `after.completedReps`（紀錄 99、重播 3） |
| 03-tampered-input | 把某個站立確認幀的 `hipY` 改回坐姿 | 1 不一致，位置在 seq 189 | **1**，第一個不一致在 seq 189、欄位 `after.repState`（紀錄 standing、重播 rising） |
| 04-mid-run-start | 第 200 幀才開始記錄 | 2，不能判為成功 | **2**，提示「中途開始記錄」，重播 0 幀、略過 99 幀 |
| 05-frame-gap | 中途 5 幀沒有記錄 | 2，不能判為成功 | **2**，提示「判定幀序號跳號（預期 250，實際 255）」，缺口之後的幀不重播 |
| 06-capacity-truncated | 幀數上限 200 | 2，不能判為成功 | **2**，提示「容量截斷：略過 99 幀」 |
| 07-event-truncated | 事件上限 15（這次執行共 29 個事件） | 2，不能判為成功 | **2**，提示「容量截斷：略過 14 個事件」 |
| 08-format-1.0 | 格式版本 1.0 | 3 拒絕 | **3**，不支援格式，並說明原因 |
| 09-other-algorithm | 演算法版本 1.0 | 3 拒絕 | **3**，演算法版本不同 |
| 10-user-cancelled | 計時中按「結束評估」 | 0 | **0**，重播出同樣的取消（狀態 incomplete、原因 user_cancelled） |
| 11-manual-stop | 手動停止記錄 | 2 | **2** |
| 12-still-recording | 匯出時仍在記錄 | 2 | **2** |
| 13-tracking-lost-invalid | 追蹤中斷超過 1.2 秒，判為無效 | 0 | **0** |
| 14-frame-changed-invalid | 計時中畫面方向改變，判為無效 | 0 | **0** |
| 15-not-json | 不是 JSON 的檔案 | 3 | **3**，顯示「無法讀取或解析」 |

- 結束碼的意義：0 重現成功、1 不一致、2 紀錄不完整無法確認、3 不支援或無法讀取。
- 這份產生腳本本身寫錯過兩次，都是驗證腳本的錯，不是被測程式的錯：
  - 取消的時間點與缺幀的位置，一開始設在輸入範圍之外。
  - 幀數與事件上限一開始設得比實際用量大，所以沒有真的截斷。
- 修正後在腳本中加了範圍檢查，並重新產生全部檔案。上表全部是修正後的結果。

## 3. 掛與不掛紀錄器的正式結果比較

- 同一份輸入，分別在「沒有掛紀錄器」與「掛上真正的紀錄器」兩種情況下執行。比較每一幀的快照，以及完整的 `result` 物件（逐欄位 JSON 比對）。

| 情境 | 狀態／原因 | 次數 | 總時間 | 每次時間 | 拒絕 | 結果相同 | 每幀快照相同 |
|---|---|---|---|---|---|---|---|
| 完成 | completed | 5 | 11748 ms | 1122 × 5 | 1 | ✓ | ✓ |
| 追蹤中斷 | invalid / tracking_lost | 1 | — | 1122 | 0 | ✓ | ✓ |
| 起始不在坐姿 | invalid / start_position_not_seated | 0 | — | — | 0 | ✓ | ✓ |
| 畫面改變 | invalid / frame_changed | 1 | — | 1122 | 0 | ✓ | ✓ |
| 逾時 | incomplete / timeout | 0 | — | — | 0 | ✓ | ✓ |
| 使用者取消 | incomplete / user_cancelled | 1 | — | 1122 | 0 | ✓ | ✓ |

- 結論：在這些合成情境中，掛上紀錄器不會改變計次、計時、無效判定或結果的任何欄位。
- 突變 M6 反向驗證了這項檢查：故意讓記錄時改動確認幀數，測試就會失敗。

## 4. 本輪發現並修正的問題

**問題 1：事件截斷時，重播報告的摘要有誤導**
- 這是本批造成的問題。
- 現象：事件內容因上限被丟棄時，「紀錄」那一行的摘要寫成「0 次｜未結束」，還另外列出「最後一段判定沒有結束事件」。實際上幀資料完整，結果也有保留，所以看起來像出現不一致，但其實沒有。
- 判定結果本來就正確（無法確認重現），只有報告文字有誤導。修正前的輸出保存在 `results/04a-cli-replay-before-fix.txt`。
- 修正（`assessmentReplay.js`）：如果某一幀的事件內容缺漏，就改用該幀上仍保存的事件類型，以及紀錄器另外保留的結果，來整理「紀錄」那一行，並標示「部分事件內容因容量上限遺失」。
  - 判定規則沒有改：事件截斷仍然是「無法確認重現」。
  - 有事件被丟棄時，仍然不比對摘要。
- 重跑結果：`results/04b-cli-replay-after-fix.txt`。15 份檔案的結束碼都和修正前相同；07 的摘要現在是「5 次｜completed｜11748 ms」，和重播一致。
- 新增測試 R5b 固定這個行為。沒有放寬任何既有斷言。

**問題 2：測試涵蓋缺口（突變 M4 一開始沒抓到）**
- 讓紀錄器「不記錄缺幀」之後，測試仍然通過。原因是重播工具會獨立檢查幀序號，仍然拒絕這種紀錄，但紀錄器自己的缺幀標記沒有任何測試涵蓋。
- 新增測試 R4b：檢查紀錄器在缺幀時會標記缺口（預期 250、實際 255）、`complete` 為 false，以及重播結果為無法確認重現。
- 重跑 M4 後已能抓到。

**修正後重跑**：`test:fa5x-trace-replay`、`test:fa5x-frame-trace`、`test:fa5x`、`test:fa5x-compat` 全部通過（`results/05-retest-*.txt`），全套測試也在修正後重跑。

## 5. 突變檢查（`results/06-mutation-checks.txt`）

- 每項突變都是暫時修改程式、執行對應測試、還原，再用 MD5 確認已還原。

| 編號 | 突變內容 | 結果 |
|---|---|---|
| M1 | 重播忽略完整性問題 | 抓到 |
| M2 | 重播不做逐幀比對 | 抓到 |
| M3 | 紀錄器不標記中途開始 | 抓到 |
| M4 | 紀錄器不標記缺幀 | 第一次**沒抓到**；補上 R4b 後抓到 |
| M5 | 重播接受任何格式版本 | 抓到 |
| M6 | 記錄時改動判定（確認幀數） | 抓到 |
| M7 | 事件溢出時紀錄器遺失結果 | 抓到 |

## 6. 全套測試與既有失敗

- `npm test`：**118 / 124 通過**。上一批結束時是 116 / 122，本批新增的 2 支測試都通過。
- 失敗的 6 支是：`tracking`、`flow-qa`、`home-redesign`、`exercise-experience`、`self-practice-library`、`llm-weekly-summary`。
- 沒有直接假設這 6 支都是舊問題。做法是用 `docs/verification/fa5x-frame-trace/backup-before/` 重建一份「完全沒有逐幀紀錄與重播程式」的副本，三個檔案的 MD5 都已和備份清單比對一致，然後在兩邊執行同樣 6 支測試（`results/08-preexisting-failure-comparison.txt`）。
- 結果：**6 支在兩邊的結束碼與錯誤訊息完全相同**，所以不是本批造成的。

| 測試 | 錯誤 |
|---|---|
| tracking | 斷言失敗 |
| flow-qa | F01-05 asset backlog |
| home-redesign | `displayCompletedTrainingDays is not defined`。這個訊息在第二批時已經從 `weekSyntheticNote` 改變，原因已在第二批報告第 77 行驗證過，是測試組裝時缺少相依 |
| exercise-experience | F01-17 placeholder |
| self-practice-library | F01-17 placeholder |
| llm-weekly-summary | 缺少 `.env.local` |

- 這 6 支在失敗那一行之後的內容，修改前後都沒有執行到，那部分的情況無法確認。

**另外發現：`test:fa5x` 中有一項檢查在這個環境下沒有作用**
- `tests/fiveTimesSitToStandAssessment.test.js` 第 350 行用 `git diff` 確認訓練模式的坐站檔案沒有被修改。
- 這個專案目錄不是 git 儲存庫，git 會回傳 129，而測試只把 1 當成失敗，所以這項檢查**等於沒有執行**，輸出中會出現 git 的用法說明。
- 這是既有測試的問題，不是本批造成的，本輪沒有修改。
- 本批沒有修改那些訓練模式檔案，但這一點無法靠這項測試確認。

## 7. Vite 建置

- `npm run build` 成功（結束碼 0，5.31 秒）。
- 主檔案從 2,400.24 kB 增加到 2,410.25 kB（gzip 後從 571.60 kB 到 575.72 kB），增加的是 App 中的紀錄程式與紀錄器。
- 「超過 500 kB」的警告在第二批就已存在。
- 重播模組沒有被打包進前端，它只在命令列使用。
- 建置前確認過 `dist/` 是今天第二批產生的建置結果，可以覆蓋。

## 8. 觀察（不是錯誤，供判斷）

- 手動停止或仍在記錄中的紀錄，匯出時 `complete` 可能是 `true`。原因是 `complete` 只代表「沒有截斷、不是中途開始、沒有缺幀」，有沒有記到結束要看 `endType`。重播工具會同時檢查兩者，所以這兩種情況都判為「無法確認重現」。如果之後希望 `complete` 也包含「有正式結束」，需要另外決定。

## 9. 未執行（待驗證）

- 真人準確度：計次與計時是否正確。
- 瀏覽器操作：`?fa5xDebug=1` 的工具列、下載、結果頁跳轉後還能不能下載、旋轉手機、按「結束評估」等。
- 效能：記錄中對推論間隔與畫面流暢度的影響，以及實際檔案大小。
- 用實機紀錄做重播，以及在不同裝置上重播的一致性。
- 雲端：不適用，這個功能不寫入雲端。
- 第 6 節中 6 支既有失敗在失敗行之後的內容，以及那項沒有作用的 git 檢查。

## 10. 本輪修改的檔案

- 都是驗證時的修正與補測，前一輪的備份不受影響。

| 檔案 | 類型 | 內容 |
|---|---|---|
| `js/ai/exercises/sitToStand/assessmentReplay.js` | 修改 | 事件截斷時摘要改用幀上的事件類型與保留的結果（第 4 節問題 1） |
| `tests/fa5xTraceReplay.test.js` | 修改 | 新增 R4b、R5b；沒有修改或刪除任何既有斷言 |
| `docs/verification/fa5x-trace-replay/e2e/generateTraces.mjs` | 新增 | 驗證用的產生腳本 |
| `docs/verification/fa5x-trace-replay/results/` | 新增 | 所有輸出與產生的 JSON |
| `dist/` | 重新產生 | 建置結果 |

- 判定器、門檻、紀錄器與 `app.js` 的內容，本輪都沒有修改。確認方式：
  - `app.js`（11:55）、`package.json`（11:58）、`assessmentConstants.js`（10-17）的最後修改時間，都早於本輪第一份輸出檔（14:09）。
  - `assessmentSession.js` 與 `assessmentTrace.js` 的修改時間顯示為 14:15，這是突變檢查從備份複本還原造成的；每一次還原都用 MD5 確認和突變前相同（第 5 節）。
  - 再和本批的修改前備份比對：`assessmentSession.js` 的差異只有上一輪加入的判定幀序號。
  - 由於本輪開始時沒有另外記錄 MD5，以上是間接確認。
