# 第 5/5 輪：目前狀態與接續方式（更新於 2026-10-29 00:15）

## 1. 現況
- 所有修改都保存在工作目錄，**沒有 commit、push 或部署**，也沒有操作正式資料或 patient00／patient01。
- 沒有背景任務在執行。本輪啟動的模擬器、Vite 與瀏覽器都已結束（已確認 8080、9099、518x、519x 埠沒有在監聽）。
- 本輪的修改內容、測試證據、畫面路徑與未結案事項，請看 `reports\ux-r5\README.md`。
- 本輪開始前的狀態（完整 diff 與當時的 app.js、styles.css、storageService.js、exerciseExperienceView.js）保存在：
  `%TEMP%\claude\c--Users-User-Downloads-ReMotion-main--6--ReMotion-main\3cac92ee-b5a1-4713-b628-03a8a5252c3c\scratchpad\pre-r5b\`。
  第 4 輪的版本在 Git `c8c98d6`。

## 2. 驗收結果（都已讀取 exit code 與日誌）

| 項目 | 結果 | 日誌 |
|---|---|---|
| 第 5 輪瀏覽器驗收 | 75/75，exit 0 | `browser\RUN_LOG.txt` |
| 故事畫面證據 | 21/21，exit 0 | `r5b-story-verify\RUN_LOG.txt` |
| 第 3 輪 | 50/50，exit 0 | `regression-r3\RUN_LOG.txt` |
| 第 4 輪 | 40/40，exit 0 | `regression-r4\RUN_LOG.txt` |
| 首次安排檢視 | 42/42，exit 0 | `regression-initial-review\RUN_LOG.txt` |
| G01 下一週期 | 14/14，exit 0 | `regression-g01-next-cycle\RUN_LOG.txt` |
| 第 1 輪 | 52/52，exit 0 | `regression-r1\RUN_LOG.txt` |
| 第 2 輪 | 23/23，exit 0 | `regression-r2\RUN_LOG.txt` |
| Node 測試 | 148/148 | `NODE_TESTS.txt` |
| 建置 | 通過 | `BUILD_LOG.txt` |

- 每次執行的指令與時間都記在 `SUITE_SUMMARY.txt`。
- 以前失敗或中斷的紀錄另外保留，不算通過：`*-INTERRUPTED`、`regression-r2-run1-failed`、`regression-r2-run2-failed`、`browser-run1-failed-260`、`*-run1-stale`、`*-before-r5b`。
- 第 2 輪先前兩次失敗的原因未定，傾向環境因素（說明見 README 第 3 節）。

## 3. 尚未完成（都不在本輪範圍，或缺少證據）
- 真人坐站 0/5：未結案。
- 正式雲端同步（固定練習與每日回報）：沒有正式環境的證據，未結案。也沒有部署規則。
- P05-02、P07-02 需要真人補拍。
- 復健師首頁的「待檢視安排」提示不在本輪範圍。
- 依指示沒有製作簡報素材 ZIP 與獨立的最終報告。

## 4. 恢復方式
- 在 Git Bash 執行：

  ```bash
  bash /c/Users/User/AppData/Local/Temp/claude/c--Users-User-Downloads-ReMotion-main--6--ReMotion-main/3cac92ee-b5a1-4713-b628-03a8a5252c3c/scratchpad/run_r5_some.sh <名稱…>
  ```

  - 名稱：`r5`、`story`、`r1`、`r2`、`r3`、`r4`、`initial-review`、`g01-next-cycle`。
  - 會依序一次跑一項，每項用自己的埠，結果寫在 `reports\ux-r5\<資料夾>\RUN_LOG.txt`。
  - 每次都會在 `SUITE_SUMMARY.txt` 加一行指令、通過／失敗數與 exit code。
- 不要使用 5173 埠上來源不明的程序。
- G01 腳本種下的資料依當下日期計算，**不要在接近午夜時執行**（曾因跨日導致日期錯開）。
- 若暫存目錄被清除，需要重新建立執行環境：
  - 另外建立一個資料夾，安裝 playwright、firebase-tools、@firebase/rules-unit-testing、firebase；
  - 設定 `JAVA_HOME="/c/Program Files/Java/jdk-22"`；
  - 把 `scripts\` 中的腳本複製過去，用 `npx firebase emulators:exec --only firestore,auth --project demo-remotion "node <腳本>"` 執行，並設定 `REPO`、`SHOTS`、`PORT`。
- Node 測試：逐一執行 `node tests\<檔名>.test.js`。建置：`npx vite build`。
