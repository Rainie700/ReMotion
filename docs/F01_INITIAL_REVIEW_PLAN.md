# F01 首次推薦專業檢視：實作方案（L05＋F01-11）

- 日期：2026-10-26
- 性質：第 1～6 節是設計輪（2026-10-26），當時**沒有修改正式程式**。第一段（待檢視 → 復健師確認）已在 2026-10-27 實作，見第 7 節。第二段（患者接受與第一週銜接）也已在 2026-10-27 實作，見第 8 節；仍有未完成項目，**不可上線**。各輪都沒有跑完整測試，沒有呼叫 Gemini、讀取密鑰、寫入正式雲端，也沒有部署。
- 接續：`docs/F01_G04_L05_CASE_REVIEW.md` 4-6 第 1 項（G04 20 分鐘的首次推薦包含 F01-11）。來源查核沿用該文件，本輪不重做。
- 重現腳本：`docs/verification/f01-initial-l05/reproduce.mjs`（隔離資料，未登記在 `package.json`）
- **定位**：這是**暫時的工程政策**，不代表 F01-11 是臨床禁忌。G04／20 分鐘只是重現案例，檢查條件**不綁定目標或時間**。例如 F01-11 也在 G02 的 Supporting 清單中。

---

## 1. 重現結果與實際入口

| 情境 | 結果（腳本段落） |
|---|---|
| G04＋20 分鐘＋L05 | 首次清單是 F01-09、F01-10、**F01-11**（L05 只排除 F01-20）。週期立即建立，第 1 天就能正式開始 F01-11（凍結目標：3 組 × 10 下，每側）。今日計畫也列出這三個動作（A） |
| 同一個基準評估「重新設定訓練需求」 | 先選 10 分鐘（只有 F01-09）建立週期，再改成 20 分鐘：**既有週期會改連到新清單**（`same_baseline`），F01-11 因此進入正在進行的週期（B） |
| 基準評估 10/10，到 10/26 才建立週期 | 週期第 1 天仍是 10/10，10/26 一建立就是「可以再評估」，訓練日已經全部過去（C） |
| 沒有週期 | 無法正式開始訓練（`cycle_not_found`），今日計畫也沒有 F01 項目。**但推薦頁仍有「開始訓練」**，只是不計入追蹤（D） |

| 入口 | 位置 |
|---|---|
| 產生並儲存首次推薦 | `app.js:15338-15381` `generateF01RecommendationFromSetup` → `recommendationService.createF01GoalRecommendation`（`recommendationService.js:175`，儲存為 `status: "draft"`，但實際上就是正在使用的清單） |
| 建立週期或改連既有週期 | 同一處呼叫 `trackingCycleService.createOrGetTrackingCycle`（`trackingCycleService.js:135`）。同一基準評估時會改連既有週期（`:151-162` → `updateTrackingCycleRecommendation :205`） |
| 推薦頁的「開始訓練」 | `app.js:15502,15580` `trainingOpen = !isD5 \|\| !!planCycle`：首次推薦**永遠是開的**。按下後進入 `startF01RecommendedTraining` → `armF01TrackingTraining`（`:15403-15432`）；沒有對應週期時不計入追蹤 |
| 正式訓練 | `prepareF01FormalTraining` → `checkF01FormalTrainingDay`（`trackingCycleService.js:353-417`）：需要進行中的週期，而且週期連結到這份推薦 |
| 今日計畫 | `todayPlanAggregator.js:179-186`：只從進行中的週期取 F01 項目 |

**結論**：只要**不建立週期，也不讓既有週期改連**，就能擋住所有正式訓練與今日計畫。推薦頁的「開始訓練」需要另外關閉，否則會讓人誤以為這份清單已經可以練習。

---

## 2. 現有機制哪些能共用

| 機制 | 位置 | 能否直接共用 |
|---|---|---|
| 有效照護關係（App 端） | `relationService.findAcceptedRelation`；`d5TherapistReviewService.js:31` `linkedTo` | **可以** |
| 有效照護關係（雲端） | `firestore.rules:21-27` `linked()` | **可以**（新集合的規則直接用） |
| 復健師可選的動作 | `listD5ReviewOptions`（`d5TherapistReviewService.js:48-64`） | **核心可以**：它其實是 `orderF01GoalCandidates(goal, limitations)`。但它讀的是 `proposal.d5.currentLimitations`，首次推薦要改讀 `recommendation.limitationIds`。需要把參數抽出來 |
| 驗證動作、量、計數方式 | `validateD5ReviewItems`（`:82-114`）、`D5_REVIEW_MAX_ITEMS` | **可以**：只依賴傳入的選項 |
| 限制衝突、修改差異、計數定義 | `findPlanConflicts`、`diffPlans`（`d5Arrangement.js:107,209`）；`checkCountingDefinitions` | **可以** |
| 審閱寫入與儲存失敗回復 | `reviewD5Proposal` 中的 `syncWrites` → 失敗時回復本機（`:182-190`） | **做法可以照搬**。但函式本身先呼叫 `loadD5Proposal`（`:125`），**依賴上一週週期與再評估** |
| 內容版本指紋 | `planItem`（`d5Arrangement.js:65`）可共用；`coreBasis`、`reviewBasis`、`planFingerprint`（`:68-104`） | **只有 `planItem` 可共用**。basis 用的是 `reassessmentId`、`decisionRuleId`、`hasNewOrWorseningDiscomfort`、`llmDraftId`，都是 D5 欄位 |
| 審閱是否有效 | `isReviewValidFor`（`:115`） | 結構可以參考；欄位依賴 D5 版本的指紋 |
| 安排狀態 | `resolveD5Arrangement`（`:135`） | **不能**：全部根據 `proposal.d5`（判定、選動作規則、LLM 草稿） |
| 復健師清單 | `listD5ReviewsForPatient`（`:67`） | **不能**：只查 `origin === "d5_next_cycle"`，而且呼叫 `loadD5Proposal` |
| 患者接受 | `confirmD5Proposal`（`trackingCycleService.js:696-753`） | **不能**：`loadD5Proposal` 交接時要用到上一週的再評估（`deriveNextCycleHandoff`） |
| 建立週期 | `createOrGetTrackingCycle`（`:135-201`） | **可以**，這正是首次推薦的建立入口；需要加一道關卡 |
| 雲端審閱規則 | `firestore.rules:74-93` `reviewMatches`、`:140-156` `d5TherapistReviews` | **不能直接用**：比對的是 `d5.reassessmentId`、`d5.decisionRuleId` 等欄位 |
| 復健師表單、患者待檢視頁 | `app.js:4765-4960`（`renderTherapistD5Reviews`、`renderD5ReviewForm`、`submitD5Review`）；`d5ProposalPage` | **版面可以參考**，但讀的是 `proposal.d5` |
| 邀請碼卡片 | `app.js:1163` `renderInviteCodeCard` | **可以直接用**（不依賴 D5） |
| L05＋F01-11 常數 | `d5Arrangement.js` 的 `L05_HIP_FLEXION_REVIEW` | **可以**：只取其中的 `limitationId` 與 `toExerciseId` |

**不可以做的事**：為了套用 D5 流程，偽造上一週、再評估、`d5` 判定或 `origin: "d5_next_cycle"`。

---

## 3. 推薦方案：首次推薦的獨立檢視（共用元件，不共用 D5 記錄）

### 3-1 流程

```
首次五次坐站（完成、現行量測版本）
 → Phase C 產生清單（規則不變，F01-11 不刪除，也不以其他動作補位）
 → 儲存推薦；checkInitialL05Review(rec) = applies
     ・不建立週期，也不改連既有週期
     ・推薦頁標示「待復健師檢視」，關閉「開始訓練」；今日計畫自然沒有 F01 項目
 → 有效照護關係的復健師在個案頁看到這份推薦
     ・從同目標、未命中排除規則的動作中選 1～3 個（可選 F01-11，也可改選其他）
     ・可填組數、次數、秒數、計數方式；必須寫理由
     ・寫入 f01InitialReviews/{recommendationId}
 → 患者看到「復健師已確認」→ 按「接受」
     ・服務重新檢查：審閱有效、內容一致、關係仍有效、基準評估符合規則
     ・推薦改為 accepted，items = 審閱內容，並寫入 initialConfirmation
     ・createOrGetTrackingCycle 建立第一週（Day 1 規則見 4-3）
```

**沒有連結復健師時**
- 推薦頁顯示：「這份訓練安排需要復健師檢視；目前沒有連結的復健師，暫時無法完成安排。」
- 下方顯示既有的邀請碼卡片（`renderInviteCodeCard`，可以直接使用）。加入之後，復健師會在個案頁看到這份推薦。
- **不會通知復健師**，畫面也不這麼說。
- 患者也可以回到「重新設定訓練需求」產生另一份清單，但系統不會自動替換動作。

### 3-2 判斷條件（單一來源）

`checkInitialL05Review(rec)` 放在 `d5Arrangement.js`，或抽到新的小模組，與下一週的 L05 檢查共用常數：
- `rec.limitationIds` 含 L05，而且 `rec.items` 含 F01-11 → `applies`
- 推薦中下一週含 F01-11，但 `limitationIds` 不是陣列 → `data_missing`，同樣需要檢視，不補值
- 其他 → `not_applicable`

不看目標、時間，也不看動作的排列位置。

---

## 4. 需要修改的地方

### 4-1 服務

| 檔案 | 修改 |
|---|---|
| `js/data/d5Arrangement.js`（或新模組） | `checkInitialL05Review`；`initialPlanFingerprint(rec, items)`，用 `planItem` 加上首次推薦的 basis（見 4-2） |
| 新增 `js/data/f01InitialReviewService.js` | `getInitialReview`、`resolveInitialArrangement(rec, { review, isReviewerLinked })`（狀態：`not_required`／`needs_review`／`reviewed`／`accepted`）、`listInitialReviewsForPatient`、`reviewInitialRecommendation`。共用 `validateD5ReviewItems`、`findPlanConflicts`、`diffPlans`、`checkCountingDefinitions`，以及 syncWrites 失敗回復的做法 |
| `js/data/d5TherapistReviewService.js` | 把 `listD5ReviewOptions` 的核心抽成 `listGoalReviewOptions({ goalId, limitationIds, catalog })`，D5 版改呼叫它。D5 的行為不變 |
| `js/data/trackingCycleService.js` | (1) `createOrGetTrackingCycle`：不論新建或改連既有週期，只要 `checkInitialL05Review(rec)` 不是 `not_applicable`，而且推薦沒有有效的 `initialConfirmation`，就回傳 `{ error: "initial_review_required" }`；這時既有週期維持原本的連結。(2) 新增 `acceptInitialReviewedPlan({ recommendationId, userId, confirmationDateKey })`：重新檢查、寫入推薦、建立週期，並且可以重複呼叫 |
| `js/data/recommendationService.js` | `createF01GoalRecommendation` 多存一個 `exerciseIds`（扁平陣列），讓雲端規則可以判斷（見 4-5） |

### 4-2 資料欄位

| 位置 | 欄位 |
|---|---|
| `recommendationResults/{id}`（首次推薦） | 新增 `exerciseIds: string[]`。接受後寫入 `status: "accepted"`、`items`（＝審閱內容），以及 `initialConfirmation: { therapistReviewId, planFingerprint, confirmedAt, confirmedBy, confirmationDateKey, checkVersion }` |
| 新集合 `f01InitialReviews/{recommendationId}` | `id`、`recommendationId`、`patientId`、`therapistId`、`relationId`、`reviewedAt`、`reason`、`items`、`changes`、`ruleItems`、`triggerCodes`、`basis: { sourceAssessmentId, selectedGoalId, limitationIds, availableMinutes }`、`basePlanFingerprint` |
| `trackingCycles` | 不新增欄位。週期照現有方式記錄 `recommendationId`（指向已接受的推薦）與 `limitationsSnapshot` |

### 4-3 三個必須說清楚的規則

**(1) 確認何時失效**
- 限制、目標或時間改變：「重新設定訓練需求」會產生**新的推薦記錄**（新的 id），舊審閱是綁在舊 id 上的，所以自然不適用。新推薦若仍符合條件，就要重新檢視。
- 內容被就地修改：`basis` 或 `items` 一變，`basePlanFingerprint` 就對不上，審閱失效（與 D5 相同的做法）。
- 照護關係結束：`isReviewerLinked` 不成立，審閱失效。

**(2) 防止重複建立週期**
- `acceptInitialReviewedPlan` 若發現推薦已是 `accepted`，就回傳既有週期。
- `createOrGetTrackingCycle` 原本就保證「同一使用者、同一基準評估只有一個週期」（`same_baseline`），而且同時只能有一個進行中的週期（`another_active_cycle`）。
- 剩下的風險：兩台裝置離線同時接受。這是現有的 local-first 限制，雲端規則無法保證唯一，只記錄不處理。

**(3) 初次評估距離接受太久時：待決策**
- 現有規則：
  - 週期第 1 天＝基準評估的量測日期（`trackingCycleService.js:168-169`）；
  - D5 的交接規則是「同一天接受才能沿用再評估，不同天就要重新做基準評估」（`f01ProgressionDecision.js:595-621`）。
- **首次推薦目前沒有任何時間限制**：腳本情境 C 顯示，晚建立的週期一開始就已經過了訓練日。
- 檢視流程會讓「評估日」和「接受日」分開，所以這個問題一定會發生。可選做法：
  - (a) 比照 D5，只有同一天接受才建立週期，否則先重做五次坐站；
  - (b) 改成第 1 天＝接受日，但會改變「Day 1＝基準日」的現有定義；
  - (c) 允許在某個天數內接受（**天數待決定，本文不訂**）。
- 實作前必須先決定。

### 4-4 畫面

| 畫面 | 修改 |
|---|---|
| 推薦結果頁（`f01RecommendationResultPage`） | `trainingOpen` 加上「這份首次推薦已不需檢視，或已接受」。待檢視時顯示狀態卡、原因說明（文字與復健師端相同，並寫明「這不代表已確認不適合」），以及「目前訓練（參考）」。未連結時加上邀請碼卡片。`reviewed` 時顯示「接受」按鈕 |
| 動作詳細頁（從推薦頁「查看動作」進入） | 待檢視時不顯示「開始訓練」 |
| 首頁冒險卡片第 2 關「建立本週計畫」 | 待檢視、已確認時顯示對應的等待文字，不顯示「查看本週訓練」 |
| 復健師個案頁 | 新增「首次訓練安排待檢視」區塊。表單參考 `renderD5ReviewForm`，選項改用 `listGoalReviewOptions` |
| 今日計畫 | 不需要修改（沒有週期就沒有項目） |

### 4-5 權限：App 端與雲端

| 檢查 | App 端 | 雲端（`firestore.rules`） |
|---|---|---|
| 只有已連結的復健師能寫審閱 | `reviewInitialRecommendation` | **需要**：`f01InitialReviews` 比照 `d5TherapistReviews`，用 `linked()` 加上目標推薦存在、屬於同一患者、`kind == 'f01_goal'`、沒有 `origin`、狀態不是 accepted |
| 患者不能寫審閱 | — | **需要**（同上，只開放 linked 寫入） |
| 患者接受時的內容與審閱一致 | `acceptInitialReviewedPlan` | **需要**：`recommendationResults` 更新若帶 `initialConfirmation`，要比對審閱的 `items`、`basis.limitationIds`、`basis.sourceAssessmentId`，以及照護關係仍為 accepted |
| 符合條件的推薦，未經審閱不能建立週期 | `createOrGetTrackingCycle` 的關卡 | **需要但較困難**：`trackingCycles` 建立時要讀取被連結的推薦，若 `'L05' in limitationIds && 'F01-11' in exerciseIds`，就必須帶 `initialConfirmation`。這要求 `exerciseIds` 欄位存在。舊推薦沒有這個欄位時，雲端無法判斷，只能靠 App 端 |
| 推薦頁不給開始訓練 | 畫面 | 不需要（沒有週期就無法計入追蹤） |

所有規則修改都**必須先在 Firestore 模擬器驗證**，才能宣稱雲端有強制。目前 D5 的「L05＋09→11」雲端也還沒有強制。

### 4-6 舊資料相容

- **已經開始的週期**：不追溯修改，也不會被關卡影響。關卡只在「建立新週期」或「改連既有週期」時生效。
- **已存在、符合條件、但還沒有週期的推薦**：每次讀取時即時判斷，所以同樣會進入待檢視狀態。沒有 `exerciseIds` 的舊推薦只能由 App 端判斷。
- **舊推薦缺少 `limitationIds`**：回報 `data_missing`，不補值。

---

## 5. 驗收案例

1. G04＋20 分鐘＋L05：推薦已儲存，但**沒有週期**（`initial_review_required`）；推薦頁沒有「開始訓練」；今日計畫沒有 F01；`prepareF01FormalTraining` 被拒絕。
2. 用其他目標或時間的推薦記錄直接測試判斷函式（例如 G02 的記錄，因為 G02 的 Supporting 清單含 F01-11），只要清單含 F01-11 且有 L05，就是待檢視。這證明條件**不讀目標或時間**。
   - 本輪**沒有確認**現行規則下，除了 G04 20 分鐘之外，還有哪些組合會自然產生 F01-11。若沒有，測試使用的是人工資料，必須在測試中註明。
3. 有 L05 但清單沒有 F01-11（G04 10 分鐘）、或沒有 L05 但有 F01-11：行為與現在相同。
4. 已連結的復健師審閱（保留 F01-11 並填量，或改選其他動作）→ 狀態變成 `reviewed` → 患者接受 → 建立第一週，`items` 等於審閱內容；第 1 天的凍結目標使用復健師設定的量。
5. 患者在審閱後「重新設定訓練需求」，或推薦內容被改：舊審閱不適用，接受被拒絕。
6. 照護關係結束後：審閱無效，接受被拒絕；未連結的復健師送出審閱被拒絕（`not_authorized`）。
7. 連續接受兩次：只建立一個週期。
8. 先用 10 分鐘建立週期，再重新設定成 20 分鐘：既有週期**仍連結原本的推薦**，新推薦進入待檢視。
9. 已開始的舊週期（推薦含 F01-11 與 L05）：完全不變，仍可訓練。
10. 審閱儲存失敗：本機回復，回傳錯誤，不留下半份審閱。
11. 沒有連結復健師：畫面顯示誠實說明與邀請碼卡片，不出現「等待你的復健師」或「已通知」。
12. 基準評估距離接受太久：依 4-3 (3) 決定的規則驗收（**待決策**）。
13. D5 既有測試（`d5TherapistReview`、`f01G04L05CaseHold` 等）不因抽出 `listGoalReviewOptions` 而改變結果。
14. 雲端規則：在模擬器確認，未連結的帳號寫不進審閱、內容不符的接受被拒；舊推薦的限制要記錄下來。

---

## 6. 推薦接法、代價與待決策

**推薦**：第 3 節的「首次推薦獨立檢視」。新增一個審閱集合，加上推薦上的確認欄位；共用動作選項、量的驗證、差異比對與儲存失敗處理；在 `createOrGetTrackingCycle` 設單一關卡。

**沒有採用的接法**
- 把首次推薦包裝成 D5 提案，套用既有流程：需要偽造上一週、再評估與 D5 判定，違反要求。
- 把審閱放進 `d5TherapistReviews`，用欄位區分種類：雲端規則 `reviewMatches` 比對的是 D5 欄位，要加條件分支；兩種審閱的失效條件也不同，混在一起更容易出錯。
- 只隱藏推薦頁的按鈕：「重新設定」改連既有週期的路徑仍然開著，接受服務也沒有把關。

**代價**
- 新增 1 個服務、1 個雲端集合與規則、2 個畫面區塊，並修改推薦結果頁與冒險卡片。
- 會出現第二套「待檢視→確認→接受」，雖然共用元件，仍需要維護兩組測試。
- 抽出 `listGoalReviewOptions` 會動到 D5 的檢視服務，需要跑 D5 的回歸測試。

**待決策**
1. 首次評估與接受之間的時間規則（4-3 (3) 的 a／b／c，以及天數）。
2. 沒有連結復健師的患者，是否允許有其他往下走的路（目前只能加入復健師，或重新設定需求）。
3. 雲端是否要強制「未審閱不能建立週期」：需要新增 `exerciseIds` 欄位，並在模擬器驗證；舊推薦無法由雲端判斷。
4. 患者取消勾選 L05 後的政策（與下一週的未解決缺口相同）。

**仍未完成**：瀏覽器實際操作、雲端強制確認（包括已實作的下一週 L05 檢查），以及本方案本身（本輪只做設計）。

---

## 7. 第一段實作紀錄（2026-10-27）：待檢視 → 復健師確認

> 這是開發中的功能。首次推薦的完整流程（患者接受 → 建立第一週）**還沒有完成**，也不能上線。

### 7-1 目前能操作到哪一步

1. 患者勾選 L05，而首次清單含 F01-11（例如 G04＋20 分鐘）：
   - 推薦會存下來，但**不建立週期**；若已有同一基準評估的週期，**也不會改連**。
   - 推薦頁顯示「待復健師檢視」、原因、「系統候選安排（尚未生效）」，不提供「開始訓練」與「其他可選動作」。
   - 已有進行中的週期時，另外列出「目前使用的安排」，並提供「查看本週訓練」，今日計畫照舊。
2. 已連結的復健師在個案頁「首次訓練安排待檢視」看到這份推薦：
   - 原因文字與患者端相同；
   - 可以選動作、設定量與計數方式，必須填理由；
   - 確認內容寫入 `f01InitialReviews/{recommendationId}`。
3. 患者端看到「復健師已確認，尚待後續接受功能」、確認的內容、與候選安排的差異，以及理由。**沒有接受按鈕，也不會建立週期。**這一步之後目前就停在這裡。
4. 沒有連結復健師時：顯示「暫時無法在 ReMotion 中完成檢視」和邀請碼卡片，不宣稱已通知。

### 7-2 實作重點

| 要求 | 做法 |
|---|---|
| 觸發原因、依據版本 | 推薦儲存時寫入 `initialReview: { required, triggerCodes, checkVersion: "f01-initial-review-1" }`，依據的是**候選清單**（`recommendationService.createF01GoalRecommendation`）。之後一律以這個標記為準，不從修改過的 items 重新判斷 |
| 檢視狀態 | `f01InitialReview.resolveInitialArrangement`：`not_required`／`needs_review`／`reviewed`；服務層另有 `started_before_review`（見舊資料）。確認記錄本身帶 `status: "confirmed"` |
| 候選與確認分開 | `recommendationResults.items` 保持系統的候選清單；確認內容只存在 `f01InitialReviews` |
| 復健師移除 F01-11 | 仍然是「已確認、待患者接受」，週期關卡仍擋（`isInitialPlanAccepted` 目前一律為 false） |
| 確認綁定 | 確認綁定推薦 id、`basis`（評估、目標、時間、限制、規則版本、檢查版本、觸發原因）、`basePlanFingerprint`，以及當下有效的 `relationId`。以下任一不符就失效：內容或依據被修改、照護關係結束、重新設定（新的推薦 id） |
| 不建立或改連週期 | `trackingCycleService.createOrGetTrackingCycle` 加一道關卡：回傳 `initial_review_required` |
| 不能開始訓練（含不計入追蹤的方式） | `f01InitialReviewService.canTrainFromRecommendation` 加上 `app.js` 的單一守衛 `f01InitialReviewTrainingBlocked`，套用在推薦頁「開始訓練」、動作詳細頁、`goDetectionPrep`、`openCameraPlaceholder`；`armF01TrackingTraining` 也不會設定不計入追蹤的執行來源 |
| 舊資料 | 沒有標記的舊推薦：以候選清單即時判斷（`legacy_live_check`）。**已有週期在使用**的推薦：`started_before_review`，照常訓練，不追溯修改。都不改寫雲端資料 |
| 共用元件 | `listGoalReviewOptions`（從 D5 抽出，D5 改呼叫它）、`validateD5ReviewItems`、`findPlanConflicts`、`diffPlans`、`planItem`，以及同步失敗時回復本機的做法。復健師表單沿用 `renderD5ReviewForm`，以 `draft.kind = "initial"` 區分 |
| 寫入成功才顯示成功 | 雲端同步失敗時回復本機，回傳 `review_sync_failed`；表單輸入保留，並顯示錯誤 |

### 7-3 雲端規則（`firestore.rules`）

- 新增 `f01InitialReviews`：
  - 只有有效照護關係（`linked()`）的復健師可以寫；
  - 目標必須是該患者的首次推薦（`kind == 'f01_goal'`、沒有 `origin`、未接受，而且沒有被標記為不需檢視）；
  - 文件 id 必須等於推薦 id；不能刪除；患者可以讀，不能寫。
- **本機模擬器驗證**（`docs/verification/f01-initial-review/RULES_EMULATOR_RESULT.txt`）：
  - 新規則 `scripts/f01InitialReviewRulesCheck.mjs` 21/21 通過；
  - 既有規則 `scripts/firestoreRulesCheck.mjs` 48/48 通過。
- 環境：firebase-tools 13.35.1、rules-unit-testing 3.0.4、firebase 10.14.1、JDK 22，安裝在獨立的暫存資料夾，project 為 `demo-remotion`。**沒有部署。**

### 7-4 測試

- 新增 `tests/f01InitialReview.test.js`（登記為 `test:f01-initial-review`），涵蓋：
  - 觸發與儲存；不綁定目標或時間（用人工記錄測試，並在測試中註明）；
  - 不誤擋的情況；
  - 既有週期不改連，今日計畫照舊；
  - 復健師確認：關係、理由、版本、限制排除；
  - 移除 F01-11 後仍不建立週期；
  - 確認失效；
  - 同步失敗與回復；
  - 舊資料；
  - 頁面：未連結、已連結且有週期、復健師表單送出失敗時保留輸入，以及兩個訓練入口的守衛。
- 修改的既有測試：
  - `tests/f01G04L05CaseHold.test.js`：「L05＋G04 20 分鐘的下一週」改用「在首次檢視出現前就已開始的週期」建立。原本的建法，現在會被首次檢視擋下。
  - `tests/d5TherapistReview.test.js`、`d5NextWeekHandoff`、`f01RecommendationView`、`resultStates`：頁面測試的依賴清單加入新函式。斷言沒有改。
- 本輪跑了 33 個受影響的測試檔，全部通過（含 D5 回歸）；`vite build` 成功。**沒有跑完整測試套件。**

### 7-5 未驗證

- **瀏覽器操作**：這個環境沒有可用的瀏覽器工具，「患者待檢視 → 復健師確認」只用 node 中執行的頁面函式加隔離資料驗證。
- 實際雲端同步：只在本機模擬器驗證規則，沒有連線到正式專案。
- 首頁冒險卡片第 2 關、今日計畫，對「待檢視的新安排」**沒有**另外提示，只有推薦頁提示。

### 7-6 第二段待完成（2026-10-27 已處理 1、2、4 的 App 與規則部分，見第 8 節；3、5 仍未處理）

1. 跨日接受與新基準評估，如何銜接確認版本（4-3 (3) 的時間規則仍待決策）。
2. 同一份安排跨裝置接受的唯一性與失敗恢復。
3. `exerciseIds` 與 `items` 的雲端一致性，以及舊資料的處理（本段**沒有**新增 `exerciseIds`）。
4. 建立週期與改連週期的雲端把關（目前只有 App 端的關卡；`trackingCycles` 規則只檢查擁有者）。
5. 取消限制或另建推薦時的流程歷程與處理政策。

---

## 8. 第二段實作紀錄（2026-10-27）：患者接受 → 第一週

> 開發中的功能。下面寫的是本機隔離測試與模擬器驗證過的部分；**沒有在瀏覽器實際操作，不可上線。**

### 8-1 患者的操作順序

1. **復健師確認後，推薦頁顯示**：「復健師已確認，等待你接受」。內容包括：
   - 系統候選安排；
   - 復健師確認的安排（含訓練量）；
   - 兩者的差異與確認理由；
   - 「接受這份安排」按鈕。這個按鈕綁定畫面上那一版確認（`reviewVersionId`）。
2. **按下「接受這份安排」**：接受服務會重新檢查以下各項，任一項不符就拒絕：
   - 帳號與推薦的歸屬；
   - 確認仍有效：內容與依據沒有改變，照護關係仍有效；
   - 畫面上那一版仍是目前的確認；
   - 計數方式已定義。

   檢查通過後才寫入：
   - `status: "accepted"`；
   - `items` 改為確認內容（推薦頁、今日計畫、訓練頁都讀這個欄位）；
   - 原本的候選清單另存為 `candidateItems`；
   - `initialConfirmation`：確認版本、指紋、接受日期與開始條件。

   **雲端寫入成功才算接受**；失敗時回復，畫面顯示可以重試。
3. **同一天開始**：接受日與原本評估的量測日相同，而且該評估是現行版本、有效、完整 → 以原本的評估作為第 1 天，立即建立第一週。之後推薦頁、今日計畫、正式訓練都使用確認後的動作與訓練量。
4. **不同天開始**：
   - 先只記錄接受，**不建立週期**（不建立訓練日已經過去的週期，也不改寫原本的評估日期）。
   - 推薦頁顯示「已接受安排，請完成新的基準評估」與「開始第一週基準評估 →」。
   - 患者完成一次五次坐站（`initial_plan_baseline` 情境）後，這次評估就是第 1 天，第一週隨即建立。
   - 畫面寫明「新的評估只用來開始第一週，復健師並沒有審閱這次新評估」。
   - 這沿用 D5 的產品時間政策（`deriveNextCycleHandoff`），**不是**新增的臨床有效期限。

### 8-2 資料接法

- **推薦**（`recommendationResults`）：`sourceAssessmentId` 永遠不改；`initialConfirmation` 記錄接受了哪一版確認。
  - `candidateItemsOf(rec)` 讓確認綁定的指紋在接受後仍然相同，所以確認仍可回頭核對。
- **週期**（`trackingCycles/trackingCycle_initial_{recommendationId}`）：
  - `baselineAssessmentId` 是**實際啟動這一週**的評估；
  - `initialPlanAcceptance` 記錄確認、版本、接受的內容，以及 `baselineSource`（`original_assessment` 或 `fresh_baseline`）與原本的評估 id；
  - 「確認的安排」與「啟動週期的新基準」因此分開記錄。
- **服務**：
  - `f01InitialReviewService.acceptInitialPlan`、`startInitialPlanCycle`：依序同步，失敗時回復，同一份推薦同時只執行一次；
  - `trackingCycleService.createInitialPlanCycle`、`checkInitialPlanBaselineEligibility`；
  - 純函式 `js/data/f01InitialReview.js`：`deriveInitialPlanHandoff`、`initialReviewVersionId`、`initialPlanCycleId`。
- **既有週期的保護**：
  - 已有進行中的週期時，接受仍會記錄，但第一週**不會**建立，也不會改連或覆寫舊週期、舊安排或訓練紀錄；畫面寫明「這份安排尚未啟用」。
  - 已執行復健師確認安排的週期，不會因為「重新設定訓練需求」而被改連（`cycle_runs_confirmed_plan`）。
- **流程限制**：復健師移除原本觸發檢視的動作後，仍然需要患者接受，不會自動開始。

### 8-3 雲端規則（`firestore.rules`，只在本機模擬器驗證，沒有部署）

- **`recommendationResults`**：
  - 接受時，內容必須與 `f01InitialReviews/{id}` 一致：動作、評估、目標、限制，而且照護關係仍有效；
  - 標記為需要檢視的推薦，沒有確認不能設為已接受；
  - 接受後，確認、內容、候選清單與狀態都不能再改；
  - `initialReview` 標記不能被修改。
- **`trackingCycles`**：
  - 第一週必須使用 `trackingCycle_initial_{recommendationId}` 這個 id，而且版本與內容要和已接受的確認一致；
  - 建立後，連結欄位與 `createdAt` 不能修改，所以第二個裝置無法覆寫；
  - 一般週期不能建立在、也不能改連到需要檢視的推薦上。
- **結果**（`docs/verification/f01-initial-review/RULES_EMULATOR_RESULT_STAGE2.txt`）：
  - 新規則 `scripts/f01InitialPlanRulesCheck.mjs` 25/25 通過；
  - `f01InitialReviewRulesCheck` 21/21、`firestoreRulesCheck` 48/48、`dailyFeedbackRulesCheck` 40/40，都沒有退步。

### 8-4 測試

- 新增 `tests/f01InitialPlanAcceptance.test.js`（`test:f01-initial-plan-acceptance`），涵蓋：
  - 同日開始，並確認三個訓練入口使用確認後的安排；
  - 跨日開始，以及不合格的新基準（沒有情境、早於接受、未完成，或被拿去做首次推薦）；
  - 確認失效、內容變更、照護關係結束、錯誤帳號；
  - 兩次同時接受、接受同步失敗後重試、週期同步失敗後重試；
  - 移除原本的觸發動作後仍需患者接受；
  - 已有進行中週期時，舊安排與紀錄不被覆寫。
- 調整的既有測試：
  - `tests/f01InitialReview.test.js`：已確認時的畫面，從「尚待後續接受功能」改為顯示接受按鈕；
  - `f01RecommendationView`、`resultStates`、`flowDataQa`：只補依賴清單，斷言沒有改。
- 本輪跑了 31 個受影響的測試檔，全部通過；`vite build` 成功；**沒有跑完整測試套件。**

### 8-5 仍阻擋使用、或沒有驗證的部分

1. **沒有在瀏覽器操作**：這個環境沒有瀏覽器工具。「相機完成第一週基準評估 → 建立第一週」這段 `app.js` 程式（`finalizeFa5xAssessment`）只通過 build，**沒有實際執行過**。
2. **跨裝置**：只用模擬器驗證規則會拒絕第二個裝置覆寫。真實的兩台裝置同時接受時，後到的裝置會收到錯誤，畫面提示重新整理；這段沒有實測。
3. **已有進行中週期時**：已接受、尚未啟用的安排，在舊週期結束後要怎麼銜接（是否改走 D5，或另外開始第一週），**沒有既定政策**，目前只保留，不會自動處理。
4. **雲端無法判斷的情況**：
   - 舊推薦沒有 `initialReview` 標記，或推薦尚未同步到雲端時，雲端無法判斷是否需要檢視（模擬器案例已列為已知缺口）；
   - `exerciseIds` 仍未新增（原第二段待辦第 3 項）。
5. **刪除**：`recommendationResults` 原本就允許本人刪除，沒有因為已接受而收緊。
6. **首頁冒險卡片**：第 2 關「建立本週計畫」對「已確認、待接受」或「已接受、待新基準」沒有專屬提示（原首頁提示待辦）。
7. **同類問題（未修改，只記錄）**：D5 的 `createNextTrackingCycle` 用字串比較 `measuredAt` 與 `confirmedAt`。App 內兩者都來自 `toISOString()`，所以目前沒有出錯；但若時間格式不同，比較會錯。本段新寫的程式已改成比較時間值。
8. **原第二段待辦第 5 項**（取消限制或另建推薦時的歷程與政策）沒有處理。

### 8-6 收尾（2026-10-27）：跨日接受 → 新基準完成 → 第一週，以及冒險卡片入口

**實際執行的路徑**（`tests/f01InitialPlanBaselineFlow.test.js`）

把 `app.js` 的真實函式搬進 node 執行：`goF01InitialPlanBaselineAssessment` → `goFiveTimesSitToStandDetection`（解析評估情境）→ `finalizeFa5xAssessment` → 推薦頁、`startF01RecommendedTraining` → `goDetectionPrep`（訓練準備頁）→ `rehabMapPage`（冒險卡片）。

- 只替換相機、語音與偵測器；評估結果是**合成的完成事件**。
- 雲端同步結果在 app 呼叫 `startInitialPlanCycle` 時注入。app 的呼叫位置沒有修改。
- **這不是瀏覽器操作，也沒有驗證真實的相機辨識。**

| 步驟 | 實際結果 |
|---|---|
| 1. 復健師確認，患者在跨日按接受 | 推薦變成 `accepted`，沒有建立週期；推薦頁顯示「已接受安排，請完成新的基準評估」 |
| 2. 從頁面入口開始評估 | 設定 `fa5xInitialBaselineContext`，並顯示評估橫幅；相機開始時解析出 `{ recommendationId }` |
| 3. 有效完成後的處理 | 存下一筆評估：本人、`assessmentRole = initial_plan_baseline`、`initialRecommendationId` 正確；重複的完成事件只存一筆；評估情境清除；結果頁只開一次 |
| 4. 第一週 | 週期 id 為 `trackingCycle_initial_{rec}`；基準是新評估，開始日是新評估的日期，`baselineSource = fresh_baseline`；推薦原本的評估 id 沒有改 |
| 5. 三個入口 | 推薦頁、今日計畫、訓練準備頁都使用確認後的安排；準備頁凍結的目標是復健師設定的 2 組；F01-11 沒有開始入口 |
| 6. 異常情況 | 週期同步失敗時不建立、不顯示成功，評估情境保留；重新整理（換新的 app 實例）後，推薦頁提供「開始第一週」重試，並沿用今天已完成的新基準，不需要再量一次；失敗時顯示錯誤；成功後再重試也只有一個週期；未完成或無效的評估不會開始第一週，仍要求有效的基準 |

**本輪修正**
- 新基準完成但週期同步失敗時，原本畫面會要求再量一次。現在會沿用今天已完成、屬於這份安排的新基準重試（`findFreshInitialPlanBaseline`）。
- 新基準也改成必須**當天**開始第一週（`baseline_not_today`），不建立訓練日已經過去的週期。這沿用同日政策，不是臨床期限。

**冒險卡片**（`rehabMapPage` 的目前關卡上方）
- 由 `loadInitialPlanNotice` 加上 `getInitialArrangement` 決定，使用共用的安排狀態：

| 狀態 | 顯示 | 入口 |
|---|---|---|
| 已確認、待接受 | 復健師已確認，等待你接受 | 查看確認安排 |
| 已接受、待新基準 | 已接受，請完成新的基準評估 | 開始第一週基準評估 |
| 已接受但舊週期仍在進行 | 已接受，尚未啟用 | 查看原本的週期 |
| 已接受、可重試開始 | 已接受，第一週尚未開始 | 開始第一週 |
| 第一週已開始 | 第一週已開始 | 查看本週訓練 |

**仍未驗證**
- 瀏覽器操作與真實相機辨識：這個環境沒有瀏覽器工具。
- 真實雲端同步與跨裝置。
- 8-5 的第 3～5、7、8 項維持原狀。

### 8-7 資料完整性（2026-10-27）

**一、已接受或被週期引用的推薦不被刪除**

- **App 端**：本來就沒有刪除推薦的功能或服務；唯一的刪除路徑是開發用的 patient00 展示重設（`js/dev/patient00Showcase.js`，只刪本機資料），本輪沒有修改。
- **雲端**：`recommendationResults` 中 `kind == 'f01_goal'` 的紀錄（首次推薦與下一階段建議），**一律不允許用戶端刪除**；其他種類維持本人可刪除。
- **為什麼不只擋「被引用的」**：規則無法反查哪些週期引用了某份推薦（一般週期的 id 是隨機的），所以只能採用「這一類全部不可刪除」這種可以可靠驗證的方案。
- **影響**：沒有被引用的草稿也不能從雲端刪除。目前沒有任何功能需要刪除它們；patient00 展示重設在雲端刪除推薦會被拒絕。

**二、建立或改連週期時核對推薦**

- **新資料**：首次推薦多存 `exerciseIds`，也就是候選清單動作 id 的純陣列，依序排列。
- **雲端規則**（`firestore.rules`）在建立首次推薦時檢查：
  - `exerciseIds` 與候選清單逐項一致，最多 3 項；
  - `initialReview.required` 必須等於依 `exerciseIds`＋`limitationIds` 重新算出的結果；
  - 建立後 `exerciseIds` 與標記都不能修改或移除，`items` 也不能偏離它。
- 這代表雲端驗證的是**資料內部一致**，**不是**用戶端確實執行了推薦引擎。用戶端仍可能寫入一份自己編的候選清單，只是標記必須與清單相符。
- **一般週期的建立與改連**必須同時滿足：
  - 推薦已在雲端；
  - 屬於本人；
  - 是 F01 推薦；
  - 首次推薦必須有 `exerciseIds`，而且標記為不需檢視。

  不符合的情況：推薦缺失、尚未同步、舊資料沒有標記、標記為需要檢視，一律拒絕，**不視為不需檢視**。
- **其他路徑**：
  - 下一階段（D5）的週期：建議紀錄本來就存在，所以照常通過。
  - 首次推薦確認後的第一週：沿用 8-3 的規則。
- **App 端**：
  - `checkFirstRecommendationIntegrity`：檢查條件與雲端相同。
  - `createOrGetTrackingCycle`、`acceptInitialPlan`、`createInitialPlanCycle`：資料不完整時回傳 `recommendation_integrity_missing`。
  - `startRecommendationCycle`：先把推薦重新寫入並等同步完成，再建立或改連週期；週期同步失敗就回復本機。
  - 設定訓練需求頁改走這個流程。推薦頁會顯示「本週追蹤尚未開始」與原因，並提供「重新開始本週追蹤」或「重新設定訓練需求」。
- **舊資料**：
  - 不批次遷移，也不補任何欄位。
  - 已經在跑的舊週期照原安排繼續：同一份推薦不會被改寫，訓練也可以繼續。
  - 沒有標記的舊推薦，不能**新開**週期或被改連，需要「重新設定訓練需求」產生新的推薦。

**驗證**

- 本機模擬器（`docs/verification/f01-initial-review/RULES_EMULATOR_RESULT_INTEGRITY.txt`）：

| 規則檢查 | 結果 |
|---|---|
| 新增的 `scripts/f01RecommendationIntegrityRulesCheck.mjs` | 32/32 |
| `f01InitialPlanRulesCheck` | 25/25 |
| `f01InitialReviewRulesCheck` | 21/21 |
| `firestoreRulesCheck` | 49/49 |
| `dailyFeedbackRulesCheck` | 40/40 |
| `selfReportedTrainingRulesCheck` | 31/31 |
| `fa5xSessionRulesCheck` | 結束碼 0 |

- 調整的規則檢查：
  - `f01InitialPlanRulesCheck`：原本「推薦尚未在雲端時允許建立週期」是已知缺口，現在改為預期拒絕；測試資料補上 `exerciseIds`。
  - `firestoreRulesCheck`：「本人建立推薦」的測試資料補上必要欄位，並新增一條「缺少欄位時拒絕」。
- 新增 `tests/f01RecommendationIntegrity.test.js`。
- 調整 `tests/trackingCycle.test.js`：原本檢查設定頁直接呼叫 `createOrGetTrackingCycle`，現在改查 `startRecommendationCycle`，仍要求「先存推薦、再建週期」。
- 33 個受影響的測試檔全部通過；`vite build` 成功；沒有跑完整測試套件。

**仍可繞過或尚未處理**

1. 雲端只驗證內部一致，無法驗證候選清單真的是推薦引擎產生的。用戶端可以寫一份自編、但標記相符的清單。
2. 用戶端在本機仍可刪除本機資料（例如開發工具），只是雲端不會跟著刪除。
3. patient00 展示資料：種子流程建立推薦後立刻建立週期，沒有先等同步，所以雲端可能拒絕那筆週期；重設也無法刪除雲端的推薦。依指示本輪沒有修改。
4. 舊週期結束後「已接受、尚未啟用」的安排怎麼銜接（8-5 第 3 項）、D5 時間的字串比較（8-5 第 7 項），都沒有處理。
5. 規則只在本機模擬器驗證，沒有部署，也沒有在真實雲端或瀏覽器操作。
