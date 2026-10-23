# B3 更新包重新產生說明

2026-10-23：原下載檔已無法取得，本包依同一個 GitHub 基底 `19845cc9a7d312b88f115e2abf0765070fc9ec65` 與先前記錄的修改重新建立。這不是原 ZIP 的逐位元複本，測試與說明重新產生；功能範圍不變。

執行檔變更：app.js、js/data/d5Arrangement.js、js/data/d5TherapistReviewService.js、js/data/trackingCycleService.js、js/ui/d5ProposalView.js、firestore.rules。

未修改：f01ProgressionDecision.js、f01ProgressionSpec.js、docs/specs/ReMotion_D5_DecisionRules.xlsx、d5LlmRecommendation.js。原 D5 判定、門檻及語言模型邊界保留。

本次回歸測試重新覆蓋 no-auto 的復健師名單、審閱、未授權與照護關係失效、患者等待與接受畫面、過期審閱、同日接受仍須新基準、原判定保持不變、舊結果不得重用、不足五次與零秒不得建立週期、新基準建立與重複操作。R006/R009 由服務產生；R001/R002 為防禦性已存資料 fixture，並非聲稱 R002 可由有效時間相減自然產生。

本次重新執行的全套測試與建置日誌在 results 資料夾。相關 D5 單項測試在 targeted.txt。全套有既有失敗項目，請以日誌為準，不宣稱全套通過。

重新發行驗證結果：套件安裝完成後全套為 123/129，失敗項目與前一輪記錄的六項一致；相關三項 D5 單項測試及正式建置成功。`b3-tests-before.txt` 是本次套件尚未安裝完成時的初始輸出（89/129），含缺少套件錯誤，不能把它與安裝後結果的差異當作功能修復數量。

前一輪已驗證本機瀏覽器患者／復健師與模擬器流程，但原輸出檔已不存在，本次不附上或重建那些日誌，也不把前次結果當成本次重新執行結果。未部署正式網站、未使用正式患者資料或實體手機攝影機。

Firestore 變更僅針對本次接受流程增加驗證，不代表所有其他資料集合的原有權限問題均已處理。
