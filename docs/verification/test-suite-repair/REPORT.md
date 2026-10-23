# 六項既有測試失敗修正

日期：2026-10-23。範圍為最新 B3／B04 及自行回報介面修正版上的測試契約整理，沒有更動偵測、推薦或課表達標規則。

| 測試 | 失敗原因 | 修正與保留檢查 |
| --- | --- | --- |
| tracking | 固定要求只有 trackingCycles 一個選填集合，並比對舊版原始碼字串 | 驗證集合包含 trackingCycles，執行實際 hydrate 方法，以假雲端驗證失敗保留本機、成功合併並採雲端同 ID 值 |
| flow-qa | 要求已補圖的三個動作仍無圖片 | 核對目前圖片路徑、存在及既有獨立對應檢查 |
| home-redesign | 要求已補圖的六個動作仍顯示待補圖 | 驗證已對應圖片顯示；未知動作仍回傳 placeholder |
| exercise-experience | 舊版僅 confirmed 可見政策、舊準備頁呼叫字串及舊 F02-01 檔名／尺寸 | 依既有 mapped-file 顯示政策檢查，保留審核狀態、版面、圖片存在／大小／RGBA 檢查 |
| self-practice-library | 把待審核等同不顯示，並要求正式圖庫必有缺圖 | 保留審核標記，新增未對應動作測試資料，驗證缺圖不移除動作及 fallback |
| llm-weekly-summary | 禁止本機存在 .env.local，而檔案又被 Git 追蹤 | 允許本機設定存在，檢查 Git 不追蹤 .env 或 .env.*（範本除外），補上 ignore；其餘摘要驗證不變 |

## 驗證結果

- 修正前：126 / 132。
- 修正後：132 / 132 test scripts passed，完整輸出見同資料夾結果檔。
- npm run build：通過。此項是建置檢查，不代表已部署。
- git diff --check：通過。
- .env.local 已在本次工作副本取消 Git 追蹤，本機檔仍存在。未讀取或輸出其內容。ZIP 使用者須執行 README 的取消追蹤指令。

## 保留的邊界

圖片文件由既有生成器重建：52 confirmed、4 wrong、10 needs_review、0 missing；14 筆仍待圖片內容審核／替換。沒有更動圖片檔或把審核狀態改為通過。js/data/exerciseAssets.js 僅修正註解，使其符合目前已存在的顯示政策。

沒有推送 GitHub、部署正式網站或操作正式患者資料。此次未重新跑規則模擬器，因規則未變。全套測試通過不等同臨床有效性驗證；實體手機／攝影機與團隊待定回報政策仍未結案。
