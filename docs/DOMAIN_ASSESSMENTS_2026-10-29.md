# 指定五構面評估：實作與交接

## 輸入與版本

- 基底：Rainie700/ReMotion main @ b2456e94018c696ad193e6935061bfe5ff7bc117。
- 工作簿：ReMotion復健資料庫建置重新整理_2(3).xlsx。
- SHA-256：a2d0aa3ad4a357aaba0418081cdfdb22be41d4fdc0224fea1d164dfb1b47985c。
- 主要規格：第一張「六個 Functional Domain」，A3:G7；測驗名稱 C3:C7、標準輸出 D3:D7、CV 候選 E3:E7、鏡頭 F3:F7。
- 沒有修改來源 Excel，沒有以一般練習動作取代指定測驗。初步代表動作版本已移除，未封裝。

## 來源與實作的對應

| 欄位／規則 | 依據 | 實作 |
| --- | --- | --- |
| F02 三階段與 10 秒，tandem 3 秒／10 秒計分 | 原表 G3 的 WHO ICOPE locomotor module，第 5 頁；NIA LIFE manual 16-17 至 16-19 | evaluateDomainAssessment；UI 依階段操作，前兩階段不足 10 秒禁止後續階段。僅平衡 0–4 分 |
| F03 起走、3m、折返、坐穩，開始口令至坐穩時間 | 原表 G4 的 CDC TUG／Tele-Med | 事件序列含五種事件，時間單調遞增；必須確認用尺量距離 |
| F04 4m 距離／時間，兩次採較快時間 | 原表 G5 的 WHO；NIA LIFE manual 16-19 至 16-21 補計時程序 | raw.trials 保留兩次時間，輸出 4 / min(trials)，不以步數計速度 |
| F05 30 秒、完整屈伸次數，實際負重 | 原表 G6 的 PMID 32447125 支持使用該測驗；CDC 2018 原始研究及國民體適能檢測規範補操作與負重 | raw.observerCount 為正式填報，candidates.count 獨立。女性 5lb／男性 8lb 負重規格外標調整版；不套常模 |
| F06 實測 reach distance、左右與正負 cm | 原表 G7 的 PMID 37046945 支持線上人工監督測驗情境；陽明交大附醫及國民體適能檢測規範補尺量步驟、左右各兩次 | raw.left/right 為各兩次尺量值，取各側最大值；0、負值與未填 null 分開，保存椅高與腳尖零點 |

參考網址（為來源支持欄位的對照，不表示每個來源支持所有欄位）：

- WHO ICOPE locomotor capacity module：<https://cdn.who.int/media/docs/default-source/mca-documents/ageing/icope-training-programme/revised-modules-19-may-2025/who-icope_m9_locomotor-capacity.pdf>
- NIA LIFE Physical Measurements manual：<https://agingresearchbiobank.nia.nih.gov/studies/life/documents/download/Manual_of_Procedures_Pilot/16.pLIFE-MOP%20Chapter%2016-Physical%20Measurements.pdf/>
- CDC TUG：<https://www.cdc.gov/steadi/media/pdfs/steadi-assessment-tug-508.pdf>
- CDC Tele-Med：<https://www.cdc.gov/steadi/media/pdfs/2024/08/Telesteadi-Guide_H_WEB.pdf>
- PMID 32447125：<https://pubmed.ncbi.nlm.nih.gov/32447125/>
- CDC 原始研究，arm curl 操作與負重：<https://www.cdc.gov/pcd/issues/2018/pdf/18_0326.pdf>
- PMID 37046945：<https://pubmed.ncbi.nlm.nih.gov/37046945/>
- 陽明交大附醫銀髮族體適能檢測：<https://www.hosp.nycu.edu.tw/departments/health-care/other/rehabilitation/education/4329-銀髮族體適能檢測.html>
- 國民體適能檢測規範：<https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=H0120013>

## 計量邊界

正式記錄目前都來自「陪同者操作碼錶／尺量／確認次數，於患者端填報」。method 固定 observer_assisted；observerConfirmed 是該次填報聲明，不等同已驗證專業身分。復健師頁標出這個來源。

選用相機使用原有 MediaPipe controller。CV 欄位只有可見影格、追蹤不足、腳部移動候選及指定手臂完整循環候選。F03／F04 起終點與過程由陪同者記錄，沒有宣稱已建成遠距全自動事件辨識。F06 完全不以像素／身高推算 cm。未開相機的候選次數為 null，不是 0。

彎舉 CV 85°／150° 遲滯與腳部移動比值是工程候選參數，並非文獻建立的通用正確角度；結果需由陪同者獨立確認，尚未做真人效度驗證。數值輸入的 3600 秒、300 次及 ±100cm 是資料輸入防呆上限，不是正常值／風險／處方門檻。

計時使用單調時鐘，10／30 秒到時封頂。切至背景或未完成會記為 incomplete，不補足時間。SPPB 明確無法嘗試為 0 分與 pending/null 是不同資料。

比較需同一患者、構面、版本、方式與觀察條件且結果已完成。未知或有不適、不同支撐／協助者類型不比較；F05 另核對手別／重量／負重規格，F06 核對椅高。只描述差值，不宣告改善、疾病、風險層級或處方。

## 程式與資料

| 檔案 | 功能 |
| --- | --- |
| js/data/domainAssessments.js | 五種指定測驗、步驟、來源、結果驗證、SPPB 分項、步速及比較 |
| js/data/domainAssessmentService.js | 追加式保存、同一 runId 去重、雲端狀態與同 ID 重試 |
| js/ai/domainAssessmentCandidates.js | CV 候選，與正式量測分離 |
| js/ui/domainAssessmentView.js | 構面首頁、準備、測試、結果、歷史、前後表格及同構面練習 |
| app.js | 六入口、路由與旅客守門、患者數據入口、復健師唯讀檢視、圖片 fallback |
| js/data/storageService.js / firestore.rules | 新集合 domainAssessmentRecords；本人寫、本人或有效照護關係復健師讀 |

新集合的量測、條件、建立時間及狀態存後不可改寫／刪除，只能追加新測驗；可更新照護關係 stamp。規則不驗證患者是否真的走滿距離或啞鈴重量，這些仍是填報條件，不能把規則驗證當臨床有效性證明。

雲端未載入時顯示錯誤，不假稱沒有紀錄。儲存分 synced／failed／pending／local_only；timeout 或失敗保留本機同筆紀錄，可重試。沒有新增複合索引要求，沿用既有按 patientId／therapistId／relationId 載入模式。

F01 判定、五次坐站、D5、七日達標、XP 與 LLM 來源不變。五類尚未有結果對個別訓練處方的規則，提供既有同構面自主練習入口，不能宣稱已與 F01 個人化週期完全等效。Back Scratch 仍待另審。

## 驗證與剩餘驗收

原版 143/143 通過。新增三項測試並更新兩項受入口／集合擴充影響的舊假設。另將一項 F01 測試的「舊推薦」fixture 指定為較早日期，避免同毫秒建立兩筆資料造成排序偶發失敗；沒有改 F01 執行程式。

本批檢查：完整 npm test；正式 npm run build；git diff --check；Chromium 與本機 Auth／Firestore 模擬器整合。實際結果見 verification/domain-assessments/results。

瀏覽器用合成帳號與加速時鐘，實際點過五測驗、SPPB 停止、背景中斷、未完成、相機失敗、相同 ID 重試、跨裝置載入、復健師檢視，以及原 F01 和直接練習入口。320／390／430／1280 寬度沒有頁面水平溢出。權限測過未登入／陌生人拒讀、復健師不可改量測、本人不可覆寫／刪除、照護關係結束後拒讀。預期拒絕的規則測試會出現 PERMISSION_DENIED，屬測試成功條件。

未操作正式 Firebase、未推送遠端、未使用真實患者資料；未測真實 iPhone 相機、TUG 全路線視野與實體尺量準確性。部署後仍須依 README 做真人器材／安全流程與實體裝置驗收；若要全自動測量與個人化進退階，需另補校正、效度驗證與對應規則。
