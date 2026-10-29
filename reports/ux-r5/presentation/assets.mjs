// 簡報素材清單（第 5/5 輪）— the one source for ASSET_LIST.csv / ASSET_LIST.md / index.html and the marks on each picture.
// Story (synthetic accounts 示範患者 / 示範復健師, local emulator): 第 1 天 = 2026-10-22（四）… 第 7 天 = 2026-10-28（三）.
export const STORY = {
  patient: "示範患者（合成帳號）",
  therapist: "示範復健師（合成帳號，與示範患者為已接受的合作關係）",
  plan: "目標「加強整體下肢力量」、20 分鐘、無限制條件 → 深蹲 3×10、迷你深蹲 2×10、坐姿起立 3×8（推薦規則產生，非 Gemini）",
  numbers: "初次評估 12.4 秒（第 1 天）→ 再次評估 10.9 秒（第 7 天），顯示差異「少 1.5 秒」；本週完成 6 天、訓練紀錄 18 筆",
};
const USE = "可直接用", RESHOOT = "需補拍";
export const ASSETS = [
  { id: "P03-01", slide: "P3", title: "患者首頁：今日任務與週期進度", role: "患者", time: "第 6 天 10/27 09:10", path: "登入 → 首頁",
    source: "週期與初次評估為第 1 天介面操作；第 1–5 天完成日為模擬器寫入（畫面自帶「展示合成資料」標示）", status: USE, reason: "" },
  { id: "P03-02", slide: "P3", title: "復健師首頁：個案與待辦", role: "復健師", time: "第 7 天 10/28 14:00", path: "復健師登入 → 首頁",
    source: "合作關係為模擬器寫入；個案資料來自患者的介面操作", status: USE, reason: "",
    note: "首頁的「今日待辦」只計算復健師派發的課表；待檢視的下一階段建議目前只在個案頁顯示（見 P09-02），首頁沒有這項提示——本輪未新增此功能" },
  { id: "P05-01", slide: "P5", title: "五次坐站評估準備", role: "患者", time: "第 1 天 10/22 09:30", path: "首頁 → 開始自主復健 → F01 下肢功能 → A｜先進行功能評估",
    source: "介面頁面（不含量測資料）", status: USE, reason: "" },
  { id: "P05-02", slide: "P5", title: "五次坐站進行中：鏡頭、計次與計時", role: "患者", time: "第 1 天 10/22 09:30", path: "P05-01 → 開始評估",
    source: "Chromium 假鏡頭（綠色測試圖樣，沒有人）＋真實 MediaPipe 模型", status: RESHOOT, marks: ["合成輸入示範", "需真人補拍"],
    reason: "畫面是假鏡頭的綠色測試圖樣、沒有人，因此停在「請調整位置，保持全身入鏡」，計次 0 / 5、計時尚未開始。需由真人在鏡頭前實際評估時補拍。" },
  { id: "P05-03", slide: "P5", title: "評估結果：完成時間與測試條件入口", role: "患者", time: "第 1 天 10/22 09:30", path: "P05-02 → 評估結束 → 評估結果",
    source: "12.4 秒為合成完成結果（__emulatorFinishFa5xRun），經 App 真實的結果處理、保存流程；「評估已保存」為本機模擬器實際回應", status: USE, marks: ["合成結果（非真人量測）"], reason: "" },
  { id: "P06-01", slide: "P6", title: "選擇訓練目標", role: "患者", time: "第 1 天 10/22 09:31", path: "評估結果 → 查看訓練建議",
    source: "介面頁面（目標清單）", status: USE, reason: "" },
  { id: "P06-02", slide: "P6", title: "可用時間與限制條件", role: "患者", time: "第 1 天 10/22 09:31", path: "選擇「加強整體下肢力量」→ 20 分鐘；限制條件不勾選",
    source: "本人在介面選擇", status: USE, reason: "" },
  { id: "P06-03", slide: "P6", title: "推薦結果：動作與訓練量", role: "患者", time: "第 1 天 10/22 09:32", path: "產生訓練建議 →",
    source: "推薦規則（f01-goal-rec）依評估、目標與時間產生；不是 Gemini", status: USE, reason: "" },
  { id: "P07-01", slide: "P7", title: "正式週期動作的準備頁（坐姿起立）", role: "患者", time: "第 6 天 10/27 09:10", path: "訓練 → 今日任務「坐姿起立」→ 開始",
    source: "第 1 天建立的正式週期（F01-04 坐姿起立 3×8），不是坐站練習（固定練習）", status: USE, reason: "" },
  { id: "P07-02", slide: "P7", title: "同一動作進行中：辨識、計次與提示", role: "患者", time: "第 6 天 10/27 09:12", path: "P07-01 → 開啟鏡頭（計次中）",
    source: "合成輸入示範：Chromium 假鏡頭＋程式產生的關節點（__emulatorFeedLe05Landmarks），經 App 自己的計次與提示流程", status: RESHOOT, marks: ["合成輸入示範", "需真人補拍"],
    reason: "背景是假鏡頭的綠色測試圖樣，骨架是程式產生的關節點，不是真人辨識。需由真人實際做坐姿起立時補拍（真人坐站 0/5 問題仍未結案）。" },
  { id: "P07-03", slide: "P7", title: "同一動作的訓練結果與保存狀態", role: "患者", time: "第 6 天 10/27 09:20", path: "P07-02 → 完成 24 次 → 結束練習 → 訓練結果",
    source: "24 / 24 次與 AI 姿勢分數 100 來自合成輸入；「已同步到雲端」為本機模擬器實際回應", status: USE, marks: ["合成輸入示範"], reason: "",
    note: "分數與解鎖成就是合成輸入的結果，簡報上請保留合成標示，不可當成真人辨識成果" },
  { id: "P08-01", slide: "P8", title: "本週訓練紀錄與每日完成", role: "患者", time: "第 7 天 10/28 10:05", path: "數據 → 訓練紀錄",
    source: "第 6 天坐姿起立為介面操作（合成輸入）；其餘 17 筆（第 1–5 天三個動作、第 6 天深蹲／迷你深蹲）為模擬器寫入，畫面自帶「展示合成資料」標示", status: USE, reason: "" },
  { id: "P08-02", slide: "P8", title: "本週期回報單", role: "患者", time: "第 6 天 10/27 09:25", path: "訓練 → 查看本週訓練 → 本週期今天練習感覺如何？→ 填寫回報",
    source: "本人在介面填寫（有點吃力、有不舒服、補充說明）", status: USE, reason: "" },
  { id: "P08-03", slide: "P8", title: "同週期初次與再次評估比較", role: "患者", time: "第 7 天 10/28 10:03", path: "首頁 → 進行再次評估 → 開始評估 → 回答測試條件 → 查看前後比較",
    source: "12.4 秒與 10.9 秒皆為合成完成結果，經真實流程保存與比較；文字依顯示值計算", status: USE, marks: ["合成結果（非真人量測）"], reason: "" },
  { id: "P09-01", slide: "P9", title: "復健師查看週摘要與相關紀錄", role: "復健師", time: "第 7 天 10/28 14:01", path: "首頁 → 示範患者 → AI 週摘要 → 產生第 1 週 AI 摘要",
    source: "本機模擬器模式不呼叫模型（App 直接拒絕），畫面是 App 既有的規則備用摘要（標示「安全備用摘要」，資料庫 source=fallback）", status: USE, marks: ["示範摘要，非本次模型產出"], reason: "" },
  { id: "P09-02", slide: "P9", title: "復健師檢視並確認下一週安排", role: "復健師", time: "第 7 天 10/28 14:02", path: "P09-01 → 檢視並確認下一週安排",
    source: "患者回報新的不適 → 規則要求復健師檢視；候選清單與訓練量來自既有規則；確認理由為復健師在介面輸入", status: USE, reason: "" },
  { id: "P09-03", slide: "P9", title: "患者查看已確認安排與接受入口", role: "患者", time: "第 7 天 10/28 18:30", path: "首頁 → 下一階段建議（復健師已確認）",
    source: "復健師在介面確認的安排；接受後既有流程立即開始第 2 週（以第 7 天的再次評估作為基準，不需要新基準）", status: USE, reason: "" },
];
// supporting pictures from the same story (not slides)
export const EXTRAS = [
  { id: "X-01", title: "下一階段建議：需要進一步確認（待復健師檢視）", role: "患者", time: "第 7 天 10/28 10:06" },
  { id: "X-02", title: "復健師確認後", role: "復健師", time: "第 7 天 10/28 14:03" },
  { id: "X-03", title: "患者接受這份安排後", role: "患者", time: "第 7 天 10/28 18:31" },
  { id: "X-04", title: "接受後的首頁：第 2 週第 1 天（基準 10.9 秒，再次評估 11/03）", role: "患者", time: "第 7 天 10/28 18:31" },
  { id: "X-05", title: "數據總覽（同一故事）", role: "患者", time: "第 7 天 10/28 10:05" },
];
export const VIDEOS = [
  { file: "P05-P06-day1-assessment-recommendation.webm", covers: "P5–P6", note: "第 1 天：評估準備 → 假鏡頭評估頁 → 合成完成結果 → 目標、時間 → 推薦結果。評估頁沒有真人，不可當成真人辨識片段。" },
  { file: "P07-P08-day6-training-report.webm", covers: "P3、P7、P8", note: "第 6 天：首頁 → 坐姿起立準備 → 合成輸入計次 → 訓練結果 → 本週期回報。計次畫面為合成輸入示範。" },
  { file: "P08-day7-reassessment-comparison.webm", covers: "P8", note: "第 7 天：再次評估（合成完成結果）→ 測試條件 → 前後比較 → 狀況確認 → 待復健師檢視。" },
  { file: "P09-day7-therapist-review.webm", covers: "P3、P9", note: "第 7 天下午：復健師首頁 → 個案 → 規則備用摘要 → 檢視並確認下一週安排。" },
  { file: "P09-day7-patient-accept.webm", covers: "P9", note: "第 7 天晚上：患者查看已確認安排 → 接受 → 第 2 週開始。" },
];
export const MISSING_CLIPS = [
  "真人五次坐站評估（鏡頭、計次、計時同時運作）的畫面與影片：本輪沒有真人錄製，P05-02 需補拍。",
  "真人坐姿起立（正式週期訓練）辨識與計次的畫面與影片：本輪只有合成輸入，P07-02 需補拍；真人坐站 0/5 問題仍未結案。",
];
