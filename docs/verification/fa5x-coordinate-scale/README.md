# 五次坐站評估（5xSTS）座標尺度修正 — 驗證紀錄

> **性質聲明：本資料夾的所有數據都是「合成資料工程驗證」，不是真人準確度驗證。**
> 角度、長度、坐站流程都來自程式產生的平面幾何與合成 landmark，用來確認程式邏輯與尺度一致性。
> 沒有用真人錄影或臨床資料做任何準確度、信效度或門檻校正。

- 演算法版本：`fa5x-assessment-1.0` → `fa5x-assessment-1.1`
- 門檻版本：`fa5x-engineering-candidate-2026-09-28`（不變，所有門檻數值都沒改）
- 驗證日期：2026-10-17；Node v24.18.0；Windows 11
- 沒有部署，沒有推送遠端。

---

## 1. 根因

資料路徑：`getUserMedia` → `poseLandmarker.detectForVideo(videoEl)`（js/ai/squatCameraController.js）→ `onFrame` → `handleFa5xFrame`（app.js）→ `extractFa5xFeatures`（assessmentFeatures.js）→ `computeSitToStandMetrics` / `calculateAngle`。

- MediaPipe 的 landmark 是「各軸分別正規化」：x 除以 videoWidth，y 除以 videoHeight。CSS 的 `object-fit` 與鏡像不影響座標。
- 1.0 直接用這種座標算膝角、軀幹角與小腿長。畫面不是正方形時，x、y 的一單位代表不同的實際長度，角度和長度會隨畫面比例失真。
- 髖部位移（只除以 H）÷ 小腿長（x、y 混合）的分子分母尺度不同。

## 2. 修改清單

### 第一輪：座標尺度

| 檔案 | 修改 | 原因 |
|---|---|---|
| `js/ai/exercises/sitToStand/assessmentFeatures.js` | 幾何用等比例「影像高度單位」：x × (寬/高)，y 不變；入鏡欄位（hipY、shoulderY、topY、bottomY、bodyHeight）仍用原本的正規化 y；尺寸無效 → `tracked:false`、`frameSizeValid:false`、不輸出任何幾何；提示「正在啟動鏡頭…」（只顯示文字） | 角度和長度不再受畫面比例影響；位移比與站立空間檢查自然同尺度；不默認正方形 |
| `js/ai/exercises/sitToStand/assessmentConstants.js` | 版本改為 1.1；新增 `FA5X_GEOMETRY_COORDINATE_SPACE` | 新舊結果可以辨識 |
| `js/ai/exercises/sitToStand/assessmentSession.js` | 結果加上 `geometryCoordinateSpace`，baseline 加上 frameWidth/Height | 量測資訊可追溯 |
| `app.js` `handleFa5xFrame` | 每一幀傳入 `#fa5xVideo` 的 videoWidth/videoHeight；debug 面板顯示畫面尺寸 | 尺寸來自 MediaPipe 實際處理的影像 |

刻意沒改：`js/ai/poseMath.js`（`calculateAngle`）、`js/ai/exercises/sitToStand/poseMath.js`（`computeSitToStandMetrics`）。這兩支是 LE05 訓練模式與其他動作共用的程式。

### 第二輪：收尾

| 檔案 | 修改 | 原因 |
|---|---|---|
| `assessmentConstants.js` | 新增 `FA5X_FRAME_ASPECT_TOLERANCE = 0.01`（不是動作門檻，只吸收尺寸整數誤差）、`FA5X_END_REASON.FRAME_CHANGED`、提示 `FRAME_CHANGED` / `FRAME_CHANGED_INVALID` | 畫面比例或方向改變 |
| `assessmentFeatures.js` | 新增 `fa5xFrameAspectChanged(a, b)` | 判斷比例或方向改變；等比例解析度改變不算改變；未知尺寸也不算 |
| `assessmentSession.js` | 準備階段（入鏡、坐姿確認、準備完成、倒數）比例改變 → 回到 POSITIONING，捨棄 baseline，發出 `frame_changed` 事件；正式計時中改變 → INVALID（`frame_changed`），沒有總時間 | 不沿用舊影像量到的 baseline |
| `app.js` | 第 1 步開始時記錄畫面尺寸；「開始」前比例改變 → `restartFa5xSetup()` 重新建立 session 和站立入鏡檢查，回到步驟 1；結果頁加上 `frame_changed` 的說明文字；舊版或缺版本的紀錄進入「取得訓練建議」時提示改用新版重新評估（已經以該筆為基準的進行中週期仍可重新連結）；「無法比較」卡片顯示兩次各自的成績（不比較） | 重新準備；提示以新版建立基準；歷史成績仍可查看 |
| `js/data/fa5xMeasurementCompatibility.js`（新增） | 量測版本相容規則 | 單一規則來源 |
| `js/data/trackingComparison.js` | 不相容 → `eligible:false`，附上 `historical`（各自時間，只供顯示）與 `measurementCompatibility`；相容時輸出不變（多附一個 `measurementCompatibility`） | 不相容的配對不進入 D4 差異、D5 決策、LLM |
| `js/data/trackingCycleService.js` | `createOrGetTrackingCycle`：新週期需要現行版本的 baseline（`baseline_measurement_outdated`）；`createNextTrackingCycle`：同樣檢查 | 新週期不會沿用不相容的舊結果 |
| `js/data/f01ProgressionDecision.js` `deriveNextCycleHandoff` | 再評估不是現行版本時，不允許沿用為下一週期 baseline → 需要重新做基準評估 | 同上 |
| `js/dev/patient00Showcase.js`、`js/dev/localD5Demo.js` | Demo seed 寫入現行量測欄位 | Demo 資料原本缺版本或座標空間，會被正確判為不可比較 |
| `package.json` | 新增 `test:fa5x-compat` | 納入 `npm test` |

### 測試檔

- 新增 `tests/fa5xMeasurementCompatibility.test.js`。
- `tests/fiveTimesSitToStandAssessment.test.js`：新增第 21–26 段（尺度、尺寸無效、landmark 驅動的完整流程、畫面比例改變）。
- 只補上 `...FA5X_M`（現行量測欄位）的 fixture。原因是「缺版本不可默認相容」，這些 fixture 原本沒有版本：`d5LlmRecommendation`、`d5NextWeekHandoff`、`d5TherapistReview`、`dataProfileCleanup`、`f01Adventure`、`f01NextCycle`、`f01ProgressionDecision`、`flowDataQa`、`homeResultRedesign`、`patient00History6w`、`resultStates`、`todayPlan`、`trackingComparison`、`trackingCycle`、`trackingReassessment`、`trackingTraining`、`trainingEvents`。
- `tests/patient00Showcase.test.js`：版本字串改為比對常數。
- `tests/f01GoalRecommendation.test.js`：原始碼擷取視窗從 1600 改為 2400 字（新增檢查後函式變長；斷言本身不變）。

## 3. 量測版本相容規則

| 初次 | 再次 | 可比較 | 說明 |
|---|---|---|---|
| 1.1 | 1.1 | ✅ | 正常 D4 比較、D5 決策、LLM 範圍 |
| 1.0 | 1.0 | ✅ | 同一演算法；保留既有歷史比較行為 |
| 1.0 | 1.1（或相反） | ❌ | `measurement_version_mismatch` |
| 缺版本 | 任意 | ❌ | `measurement_version_missing`（兩筆都缺也不相容） |
| 未知版本 | 任意 | ❌ | `measurement_version_unknown` |
| 1.1 缺座標空間／1.0 帶座標空間 | 任意 | ❌ | `measurement_coordinate_space_mismatch` |

不可比較時：
- 比較頁顯示原因與「請以新版重新建立基準評估」，並列出兩次各自的成績。
- D5 走 Gate 1（R001 `no_auto_decision`），`buildD5Envelope` 回傳 `allowedDecisions: null`，不會呼叫 LLM。
- 時間軸該週為 `reassessed`，`changeMs` 為 null。
- 歷史紀錄不改寫（測試以 JSON 快照逐字比對）。

新基準：
- Phase C 新週期與下一週期都必須是現行版本（1.1）。
- 1.0 的再評估不能在同日沿用為下一週期的基準，改為需要重新做基準評估。

## 4. 畫面比例或方向改變

| 時機 | 處理 |
|---|---|
| 第 1 步站立入鏡，或「開始」前任何時候 | 回到步驟 1：重新做站立入鏡、坐姿確認與 baseline；提示「畫面方向已改變，請重新調整拍攝位置」 |
| 正式計時中 | 結束為 INVALID（`frame_changed`），沒有總時間；提示「畫面方向已改變，本次量測無效，請重新評估」 |
| 等比例解析度改變（例如 1280×720 → 1920×1080） | 不重設。正規化座標本來就以影像寬高為分母，同一個人在同一位置的 landmark 數值不變；測試確認特徵完全相同，五次結果的總時間、每次時間與峰值位移也完全相同 |

## 5. 重現方式

在專案根目錄執行：

```sh
node docs/verification/fa5x-coordinate-scale/scripts/reproduce.mjs
```

這個指令會重新產生 `results/` 下的四個檔案。也可以單獨執行：

```sh
node docs/verification/fa5x-coordinate-scale/scripts/compare_features.mjs docs/verification/fa5x-coordinate-scale/baseline-1.0   # 修正前
node docs/verification/fa5x-coordinate-scale/scripts/compare_features.mjs                                                       # 修正後
node docs/verification/fa5x-coordinate-scale/scripts/compare_session.mjs
```

`baseline-1.0/` 是修正前 1.0 程式的凍結副本，只供對照，App 與建置都不會引用它。

## 6. 修正前後對照

輸入：同一組平面幾何，換算成各畫面比例的正規化座標。真值：軀幹 30°、小腿 0.2、髖部位移比 0.70。完整表格見 `results/features_*.txt`。

| 畫面 | 膝角真值 | 1.0 | 1.1 | 軀幹 1.0 → 1.1 | 位移比 1.0 → 1.1 |
|---|---|---|---|---|---|
| 4:3 | 90° | 79.38° | 90.00° | 23.41° → 30.00° | 0.719 → 0.700 |
| 16:9 | 90° | 68.67° | 90.00° | 17.99° → 30.00° | 0.730 → 0.700 |
| 9:16 | 90° | 111.33° | 90.00° | 45.75° → 30.00° | 0.625 → 0.700 |
| 16:9 | 150° | 157.73° | 150.00° | | |
| 9:16 | 150° | 148.17° | 150.00° | | |

入鏡欄位（topY、bottomY、bodyHeight、hipY）修正前後完全相同。

完整流程（`results/session_before_after.txt`）：

| 情境（真值） | 畫面 | 1.0 | 1.1 |
|---|---|---|---|
| 站立膝角 146°（不應計次） | 4:3、16:9 | 誤計 5/5 | 0/5 |
| 站立膝角 154°（應計次） | 9:16 | 0/5 | 5/5 |
| 峰值位移 0.74 小腿長（應計次） | 9:16 | 0/5 | 5/5 |

## 7. 測試摘要

詳見 `results/test_summary.txt`。

- `tests/fiveTimesSitToStandAssessment.test.js`：通過。
- `tests/fa5xMeasurementCompatibility.test.js`：通過。
- `npm test`：**114 / 120 通過**。修改前是 113 / 119；本次新增一支測試。
- `npx vite build`：成功（會重新產生本機的 `dist/`）。
- 防偽陰性檢查：分別暫時拿掉相容規則、比較頁的 gate、新週期 baseline 的 gate、計時中的比例檢查、準備階段的比例檢查，對應的新測試都會失敗；還原後通過。

### 六項既有失敗（修改前就失敗，與本次無關）

修改前後都停在同一個斷言（行號差 1 是因為加了一行 import）：

| 測試 | 失敗原因 |
|---|---|
| `test:tracking`（trackingCycle） | 斷言 `storageService` 的 `OPTIONAL_CLOUD_COLLECTIONS = ["trackingCycles"]`，與目前雲端集合設定不符 |
| `test:flow-qa`（flowDataQa） | 期望 F01-05/07/09 素材狀態仍是 `missing`，素材清單已更新 |
| `test:home-redesign`（homeResultRedesign） | `ReferenceError: weekSyntheticNote is not defined`（測試以原始碼片段組函式時缺少依賴） |
| `test:exercise-experience` | F01-17 未確認圖片應為 placeholder，素材狀態已不同 |
| `test:self-practice-library` | 同上（F01-17 `needs_review`） |
| `test:llm-weekly-summary` | 斷言專案內不存在 `.env.local`，但本機有這個檔案 |

注意：`trackingCycle`、`flowDataQa`、`homeResultRedesign` 在前段就失敗，後面的斷言修改前後都沒有執行到。

## 8. 尚未執行／待驗證

**真人驗證**
- 門檻需要真人校正（本次都沒改）：
  - `STANDING_KNEE_ANGLE_MIN_DEG`（150）影響最大。正面拍攝時，橫式畫面的膝角會比 1.0 讀得小，直式讀得大。
  - `STANDING_DISPLACEMENT_MIN`、`RISE_ONSET_DISPLACEMENT`、`SEATED_RETURN_DISPLACEMENT_MAX`、`STANDING_HEADROOM_SHANK_UNITS`、`SEATED_READY_MAX_HIP_JITTER` 都以小腿長為單位，正面拍攝時小腿接近垂直，受影響較小，但仍需確認。

**瀏覽器與裝置**
- 手機直式和橫式下 videoWidth/videoHeight 是否都正確取得；`?fa5xDebug=1` 顯示的 `frame=WxH`。
- 實際旋轉手機時，「開始」前是否回到步驟 1、計時中是否判為無效。
- 旋轉時，部分裝置可能先回報暫時的 0×0 或過渡尺寸（未實測）。依目前程式：0×0 會以「正在啟動鏡頭…」暫停量測；過渡尺寸會被當成一次比例改變。

**其他**
- 第 13 段的 `git diff` 檢查：專案不是 git repo，原有程式會靜默略過；已改用檔案比對確認共用檔案沒有變更。
- 雲端（Firestore）同步：沒有實際測試新增欄位（`geometryCoordinateSpace`、baseline 寬高）的寫入。`functionalAssessmentSessions` 由 `firestore.rules` 的通用規則處理（登入即可讀寫，沒有逐欄限制），所以預期不會被規則擋下。
- 已存在使用者資料中、1.0 基準的進行中週期：再評估會是 1.1 → D5 不會自動決策，需要重新建立基準。這是規則預期的行為，但使用者會看到「無法比較」，UX 文案是否足夠需要確認。

## 9. 對其他動作與歷史資料的影響

- 其他復健動作與 LE05 訓練模式：共用的幾何函式沒改，不受影響。
- 歷史紀錄：沒有改寫；1.0 紀錄保留版本，可以查看；1.0 與 1.0 之間仍可比較。
- 1.0 與 1.1、或缺版本的紀錄：不再產生前後差異、D5 自動決策或 LLM 進退階依據。
