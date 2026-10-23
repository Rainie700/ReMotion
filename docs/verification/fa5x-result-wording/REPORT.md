# 結果頁措辭與本機測試橫幅修補 — 修改清單與驗證結果

- 日期：2026-10-22
- 狀態：**已實作，本機驗證通過，未部署**。
- 沒有連正式服務，沒有開鏡頭。
- A 批凍結版、`fa5x-batch-a/`、`fa5x-browser-local/` 的先前報告與結果都**沒有改動**。
- 這條支線到此結束，**沒有新增功能**。

## 1. 備份與還原

- 修改前備份：`backup-before/`，共 3 個檔案：`app.js`、`styles.css`、`tests/fiveTimesSitToStandAssessment.test.js`。MD5 記在 `backup-before.md5`。
- 還原方式（在專案根目錄執行）：

```sh
B=docs/verification/fa5x-result-wording/backup-before
(cd "$B" && find . -type f) | while read f; do cp "$B/$f" "$f"; done
```

## 2. 修改清單（只有這 3 個檔案，見 `results/07-changed-files.txt`）

| 檔案 | 修改 |
|---|---|
| `app.js`：結果頁完成狀態的說明列 | 拿掉三句保證式文字，見下方對照 |
| `app.js`：本機測試橫幅 | 模擬器模式時，在 `body` 加上 `emulator-mode`，並依橫幅實際高度設定 `--emulator-banner-h`；視窗大小改變時會重新計算。做法與既有的 `#local-demo-bar` 相同 |
| `styles.css` | 新增兩條規則：`body.emulator-mode` 的上方留白，以及 `.phone` 高度扣掉橫幅高度。這兩條只在模擬器模式下才會套用 |
| `tests/fiveTimesSitToStandAssessment.test.js` | 原本有一條斷言**逐字釘住**舊的保證句。依本次要求，改為斷言新句子；**另外新增**一條斷言，確認三種保證句都不存在。原句寫在註解中，沒有放寬檢查 |

**說明列文字對照**

| 情境 | 修改前 | 修改後 |
|---|---|---|
| 一般完成 | 「本次 5 次坐站已完成，X 秒將作為後續再次評估時的比較依據。」 | 「已保留本次紀錄；是否能與其他測驗比較，需另行確認測試條件與量測版本。」 |
| 下一週期基準 | 「X 秒會作為下一週期的比較起點。」 | 同上 |
| 已連結的再次評估 | 「這次結果已記錄在同一個 7 日追蹤中，可以和初次評估比較。」 | 「這次結果已記錄在同一個 7 日追蹤中。已保留本次紀錄；是否能與其他測驗比較，需另行確認測試條件與量測版本。」 |

- 「不會作為後續比較依據」這類否定句，出現在未完成與量測無效的結果頁上，沒有保證的意思，所以保留不動。

**沒有修改的部分**
- 比較、D5、推薦、追蹤週期、條件回報、趨勢的程式，都沒有改。
  - 以下 8 個檔案的修改時間都早於本次備份（`results/07-changed-files.txt`）：`trackingComparison.js`、`f01ProgressionDecision.js`、`d5Arrangement.js`、`trackingCycleService.js`、`recommendationService.js`、`f01GoalRecommendation.js`、`functionalProgressService.js`、`fa5xConditionReport.js`
- 結果頁上的「查看訓練建議」按鈕與流程維持原狀。本次只修改呈現；是否要依條件擋下推薦，屬於 B 批。
- 有人協助、條件不確定、未回報時，標題維持 A 批的「觀察時間」並寫出原因；頁面上沒有任何「可作為推薦依據」的說法（瀏覽器 W3 檢查）。

## 3. 驗證結果

| 項目 | 結果 | 證據 |
|---|---|---|
| `test:fa5x`（含更新後的文字斷言）、`result-states`、`emulator-mode`、`fa5x-blocked-result-checks`、`fa5x-condition-report`、`reassessment`、`d5-next-cycle` | 全部通過 | `results/01-test-*.txt` |
| 瀏覽器第 2 階段：結果頁措辭與橫幅（模擬器，合成資料） | **31 / 31** | `results/02-phase2-result-wording.txt`、`shot-10`～`shot-15` |
| 瀏覽器第 1 階段回歸（前一批的流程，用新程式重跑，輸出存在本批資料夾） | **26 / 26** | `results/03-phase1-regression.txt`、`results/phase1-regression/` |
| 全套測試 | **121 / 127**；6 項失敗與前一批相同（`tracking`、`flow-qa`、`home-redesign`、`exercise-experience`、`self-practice-library`、`llm-weekly-summary`） | `results/04-npm-test.txt` |
| Vite 建置 | 通過；模擬器模式在建置檔中仍是常數 false | `results/05-vite-build.txt`、`results/06-dist-scan.txt` |

**瀏覽器第 2 階段的內容**
- 對 5 種結果頁逐一檢查：
  - 未回報
  - 不確定
  - 有人協助
  - 條件已回報為「沒有」
  - 已連結的再次評估
- 每一頁都檢查：
  - W2：出現新的說明句
  - W3：沒有任何比較保證或「推薦依據」的說法
  - W4：時間標題正確——前三種與再次評估顯示「觀察時間」與原因；條件已回報為「沒有」時顯示「完成時間（依使用者回報的條件）」
  - W5：再次評估仍說明「已記錄在同一個 7 日追蹤中」
  - W6：橫幅底部（約 24.8 px）沒有超過頁面內容與頁首的頂端（25 px 與 45 px），底部導覽列也完整落在視窗內（900 px）
  - W7：沒有連到本機以外的請求
  - W8：沒有提示框或頁面錯誤
- 首頁（W1）也做了同樣的橫幅檢查。

## 4. 限制

- 無頭 Edge，畫面寬度模擬 430 px，不是實機，也不是真人操作。
- 資料是合成的，模擬器也不代表線上環境。
- 換頁是透過 `window` 上公開的函式觸發的。
- 只驗證了模擬器模式下的橫幅。正式模式本來就沒有橫幅，`body` 也不會加上 `emulator-mode`，所以兩條新的樣式不會套用。
