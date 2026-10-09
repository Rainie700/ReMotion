# AI 週摘要啟用方式

1. 複製 `.env.example` 為 `.env.local`。
2. 到 Google Cloud Console → reCAPTCHA Enterprise → `ReMotion-Web`，複製「金鑰 ID」。
3. 貼到 `.env.local`：

   `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY=你的金鑰ID`

4. 執行 `npm run build` 與 `firebase deploy --only hosting`。
5. 用復健師帳號進入個案總覽，按「產生 AI 週摘要」。確認後，患者的「我的數據」才會顯示該摘要。

目前先不要在 Firebase App Check 開啟強制執行。請先確認正式網站能產生 Gemini 摘要，再開啟 AI Logic 的強制執行。

摘要只傳送去識別化的 `VerifiedContext`；不傳姓名、email、相機畫面或 MediaPipe 原始座標。任何模型輸出都必須通過 schema、數字、日期、動作、決策與安全聲明驗證，否則改用 deterministic fallback。
