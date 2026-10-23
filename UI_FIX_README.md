# 自行回報勾選框介面修補

此包適用於已安裝「ReMotion_B4_Self_Report_Update.zip」的專案。你目前已能自行回報，因此直接套用本包即可。

## 修正內容

原本 checkbox 沿用通用 input 的 width:100% 與 padding，搭配 flex 文字節點，把確認文字擠出卡片。現在改成兩欄 grid：22px 勾選框＋可縮小並換行的文字 span，並明確重設 checkbox 寬高、padding、margin。

沒有更動實做量、保存、去重、權限、計次、完成天數或推薦規則。

## 安裝與部署

1. 備份目前專案。
2. 解壓到專案根目錄，覆蓋 styles.css 與 js/ui/selfReportedTrainingView.js；scripts、docs 合併到同名資料夾。
3. 在專案根目錄執行：

```powershell
npm run build
firebase deploy --only hosting

git add .
git commit -m "修正自行回報確認文字排版並整理交接"
git push
```

本次只需更新 Hosting，沒有修改 Firestore 規則。build 成功後才部署。不是完整專案，不要刪掉原本檔案；也不要放進 fa5x-12-browser。

手機關掉舊頁面再重開。如果仍是舊排版，重新整理或用新的分頁開啟網站，再到自主練習的自行回報頁確認。

## 這次繼續做的檢查

- 每日吃力／不舒服及未完成原因：儲存、修正、另一裝置舊版本衝突、復健師讀取。
- 自行回報：左右次數、秒數、同次重試一筆、作廢保留、復健師唯讀。
- 320／375／390／430px：勾選框維持 22px、確認文字在表單內換行，沒有頁面橫向溢出；文字可點擊勾選。
- 正式建置通過。相關單項測試通過。這批沒有重新修改或宣稱已解決先前全套測試的六項失敗。

本機瀏覽器寬度檢查不是實體 iPhone Safari 測試；請在你的手機確認一次。驗證紀錄在 docs/verification/self-report-ui-fix，交接與下一步在 docs/REHAB_HANDOFF_CURRENT.md。
