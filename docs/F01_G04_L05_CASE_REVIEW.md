# F01 個案查核：G04 + L05 進階到站姿髖屈曲

- 日期：2026-10-26
- 接續：`docs/F01_RECOMMENDATION_CURRENT_STATE.md` 第五節第 1 項

**怎麼讀這份文件**

| 節 | 內容 | 狀態 |
|---|---|---|
| 第一節 | **修正前**的重現結果（當時患者可以直接接受 F01-11） | 歷史紀錄，描述的是修正前的行為 |
| 第二節 | 來源核實 | 仍然有效 |
| 第三節 | 處理方案的**歷史提案**（「任何限制＋任何進階都要確認」） | **未採用**，保留作為紀錄 |
| 第四節 | **目前的實作與驗證結果**（只針對 L05＋F01-09 → F01-11），包含首頁卡片的修正 | 目前狀態 |
| 第五節 | 查核時無法確認的部分 | 仍然有效 |

**各輪做了什麼**
- **查核輪**（第一～三節）：只讀程式、做重現，沒有修改正式程式。
- **實作輪**（第四節）：**有修改正式程式**：`js/data/d5Arrangement.js`、`js/data/f01AdventureProgress.js`、`js/data/journeyPresentation.js`，以及相關測試。
- 各輪都沒有跑完整測試套件，沒有呼叫 Gemini、沒有讀取密鑰、沒有寫入正式雲端，也沒有部署。

**重現腳本**：`docs/verification/f01-g04-l05-case/reproduce.mjs`
- 執行：`node docs/verification/f01-g04-l05-case/reproduce.mjs`
- 只用記憶體中的假 localStorage，做法和 `tests/d5NextWeekHandoff.test.js` 相同，並依 App 的呼叫順序使用真實的 service。
- 標 `[CASE]` 的斷言已在實作輪改成修正後的行為，修正前的預期寫在旁邊的註解中。第一節表格中的「安排狀態 `ready`」與「接受結果：建立下一週」是**修正前**的輸出。
- 沒有加進 `package.json`，所以 `npm test` 不會執行它。

**本文不做的事**
- 不假定 F01-11 必須永久排除，也不假定維持 F01-09 就一定適合。
- 不新增臨床禁忌。下面提出的處理方式是工程上的暫時安排：把這個情境交給人確認。

---

## 一、精確重現（修正前）

> 本節記錄的是**修正前**的行為。目前的行為請看第四節。

### 1-1 情境設定（隔離資料）

| 步驟 | 輸入 | 呼叫的程式 |
|---|---|---|
| 首次評估 | 五次坐站完成，14.0 秒，量測版本為現行版本 | `functionalAssessmentService.completeSession` |
| 首次推薦 | 目標 G04，時間 10 或 15 分鐘，勾選 **L05**，排除計數方式待定的動作（與 App 相同） | `generateF01GoalRecommendation`、`createF01GoalRecommendation`、`createOrGetTrackingCycle`（新版完成規則） |
| 6 天訓練 | 每天每個動作都先正式開始（凍結目標），再存一筆剛好達標的紀錄 | `prepareF01FormalTraining`、`recordExerciseCompletion` |
| 再評估 | 第 7 天，10.5 秒（比首次快 3.5 秒） | `completeTrackingCycleWithReassessment` |
| 下一階段狀況確認 | 沒有新的或加重的不適，仍勾選 **L05** | `evaluateD5Proposal`（排除計數方式待定的動作，與 App 相同） |
| 安排與接受 | 沒有連結復健師，接受日與再評估同一天 | `getD5Arrangement`、`confirmD5Proposal` |

### 1-2 結果（10 分鐘與 15 分鐘相同，15 分鐘多保留 F01-10 橋式）

| 項目 | 實際值 | 來源欄位 |
|---|---|---|
| 首次推薦勾選的限制 | `["L05"]` | `recommendation.limitationIds` |
| 週期保存的限制 | `["L05"]` | `cycle.limitationsSnapshot` |
| 下一階段勾選的限制 | `["L05"]`；上一週的紀錄來自 `cycle_limitations_snapshot` | `d5.currentLimitations`、`d5.previousLimitationsSource` |
| 新增的限制 | `[]`：**L05 整週都存在，所以不算新的** | `d5.newLimitations` |
| 上一週的動作 | 10 分鐘：F01-09。15 分鐘：F01-09、F01-10 | `recommendation.items` |
| 上一週的訓練量 | F01-09：3 組 × 10 下，**每側**，每側須完成 30 下，來源是動作預設值。F01-10：3 組 × 10 下，合計 30 下 | 凍結目標 `sets`、`repsPerSet`、`planCountingBasis`、`completionRule` |
| 首次推薦排除的動作 | F01-20（被 L05 排除）、F01-19（計數方式待定，與 L05 無關） | `phaseC.excluded` |
| 時間變化 | −3500 ms，分類為「較快且超過參考範圍」 | `d5.changeMs`、`d5.changeClass` |
| 完成天數 | 6/6，分類為「全部完成」 | `d5.completedTrainingDays`、`d5.trainingState` |
| 判定 | R005 進階，經 Gate 5 矩陣 | `d5.decisionRuleId`、`d5.gate` |
| 選到 F01-11 的原因 | NC-P01：F01-09 在 G04 有一條狀態為 Confirmed 的進階轉換指向 F01-11；F01-11 不在目前清單裡，也沒有被限制排除，所以替換 1 個動作 | `d5.selectionRuleId`、`d5.replacedExercise`；`js/data/f01ProgressionDecision.js:357-366` |
| 為什麼限制檢查沒有擋下 | L05 唯一的排除字串是「無法安全維持單側站立」，只出現在 F01-20 的注意事項中。F01-11 的注意事項沒有這段字，所以檢查結果是不衝突 | `limitationCheck["F01-11"]`；`js/data/f01GoalRecommendation.js:62,100-107` |
| 確認方式 | `user_acceptance`，沒有任何需要檢視的原因 | `d5.confirmationMode`、`d5.reviewReasons` |
| 安排狀態 | `ready`，畫面標示「進階」，**患者可以直接接受** | `arrangement.status`、`isPatientAcceptable` |
| 接受結果 | 立即建立下一週，動作是 F01-11（15 分鐘方案再加 F01-10）；`therapistReviewId = null`，**沒有經過復健師** | `confirmD5Proposal` |
| 下一週第 1 天的 F01-11 目標 | 3 組 × 10 下，每側 30 下（動作預設值） | `prepareF01FormalTraining` |
| 理由文字 | 「本週符合進階候選條件；保留其餘訓練，只將 坐姿抬膝 調整為同 Goal 的進階候選 站姿髖屈曲。」 | `d5.reason` |

### 1-3 對照情境（同一支腳本）

| 情境 | 結果 | 說明 |
|---|---|---|
| 只在下一階段才**新增** L05 | R011 調整 → NC-A02，動作維持 F01-09，`needs_review` | 新增限制會阻止進階。但這不是因為 L05 和 F01-11 有關，而是因為「有新限制就不進階」 |
| 完全沒有限制 | 同樣是 F01-09 → F01-11，`ready` | 這條轉換本身不看任何限制，只有字串排除會擋 |

**結論**：在這個情境中，L05 這個輸入**對選動作沒有任何作用**，結果和沒有勾選任何限制完全相同。

---

## 二、來源核實（只查這一條轉換相關的來源）

### 2-1 專案中記錄的來源

| 項目 | 專案記錄 | 位置 |
|---|---|---|
| F01-09 坐姿抬膝 | 名稱、描述、步驟、每側 10 次：UCLH。訓練目標：Northern Care Alliance。目標肌群：UCSF。注意事項（可扶椅子）：AAOS Hip Conditioning Program。組數：No Evidence Found。第一階段評為 Needs Modify，第二階段評為 Supported | `ReMotion復健資料庫_含F01推薦GoalMapping.xlsx` 工作表 F01-09 |
| F01-11 站姿髖屈曲 | 名稱、步驟、描述：AAOS Hip Conditioning Program 與國民健康署防跌指引（南投醫院下載連結）。次數、組數：No Evidence Found。評為 Needs Modify | 同檔工作表 F01-11 |
| F01-09 → F01-11 進階 | 依據寫：「多份髖部復健資料由較支撐的非站立／坐姿髖屈曲練習，進入站姿髖屈曲；**ReMotion 將坐姿抬膝→站姿髖屈曲視為增加站立與單腳支撐需求的產品 progression**。」證據類型 Engineering Rule，狀態 Confirmed。來源：Plymouth 髖關節置換術前衛教。備註：「來源支持的是由較低站立需求轉向站姿髖屈曲的概念；並非完全相同的動作名稱，因此不標 Evidence。」 | `ReMotion_D5_DecisionRules.xlsx` 工作表 ExerciseTransition 第 23 列；TransitionCoverage 第 42 列；`js/data/f01ProgressionSpec.js:409-419` |
| L05 的排除字串 | 「若無法安全維持單側站立，應先使用雙腳抬腳尖版本」，來源 Whittington Health | 工作表 F01-20 的 precautions |
| L05 的限制清單 | 程式自定（「使用者自述，不是診斷」），沒有外部來源 | `js/data/f01GoalRecommendation.js:50-63` |

規格自己就寫明，這條轉換是「增加站立與單腳支撐需求」的產品規則。L05 則是「目前無法安全地單腳站立」。兩者講的是同一件事，但程式沒有把它們連起來。

### 2-2 線上來源實際內容（2026-10-26 讀取）

| 來源（網址） | 標題與適用對象 | 相關段落 | 讀取狀況 |
|---|---|---|---|
| https://www.plymouthhospitals.nhs.uk/display-pil/pil-preparing-for-your-hip-replacement-operation-6892/ | *Preparing for your Hip replacement operation*。對象是要接受**髖關節置換手術**的病人 | 「Therapy advice following your Hip Replacement Surgery」段：先列躺姿的「Lying hip flexion」，再寫「Once you are walking comfortably you can start the following exercises in standing」，接著是「Hip flexion in standing」：「holding onto a solid support … lift your operated leg bending your hip and knee up toward your chest」 | 已讀。頁面**沒有坐姿抬膝**；先做的是**躺姿**髖屈曲；開始站姿練習的條件是「可以舒適地走路」；站姿時要扶穩固的支撐物 |
| https://www.uclh.nhs.uk/patients-and-visitors/patient-information-pages/home-exercises-improve-strength-and-balance-following-hospital-admission | *Home exercises to improve strength and balance following hospital admission*。對象是「patients who have had surgery at UCLH」 | 「Chair exercises」段的 Seated marching：「Keeping your knee bent, lift your knee up … Slowly lower your leg」，「Repeat 10 times on each leg」。另有獨立一段「Marching on the spot」：「Hold onto a handrail if needed … Repeat for 30 steps」，分初、中、高階。進階的說法是「Start with the beginner exercises. Move to the next level only when you feel ready」，指的是同一個動作內的難度分級 | 已讀（頁面後段）。**沒有把坐姿抬膝寫成站姿動作的前一階**。頁面上的站姿版本是原地踏步，不是站姿髖屈曲 |
| https://orthoinfo.aaos.org/en/recovery/hip-conditioning-program/（現轉址到 https://www.orthoinfo.org/en/recovery/hip-conditioning-program/） | *Hip Conditioning Program*，AAOS OrthoInfo。對象是受傷或術後的人；寫明「should be performed under your doctor's supervision」 | 讀取當下的版本**沒有**站姿髖屈曲、站姿抬膝或坐姿抬膝。站姿動作只有伸展類，例如 Standing Iliotibial Band Stretch（靠牆支撐） | 已讀。**不支持** F01-11 工作表中引用它的內容（名稱、步驟、60°～90°）。也可能是頁面改版過，本輪無法確認舊版內容 |
| https://www.nant.mohw.gov.tw/?aid=down&url=…（國民健康署防跌，南投醫院下載頁） | 下載頁標題「預防跌倒 | 國健署-防跌妙招」 | — | **無法讀取**：PDF 大於 10 MB，工具無法開啟。F01-11 工作表的「站姿手扶椅背前抬腿」等內容**未核實** |
| https://www.northerncarealliance.nhs.uk/patient-information/patient-leaflets/physiotherapy-post-surgery-therapy-advice | — | — | **無法讀取**（HTTP 403） |
| https://www.whittington.nhs.uk/?c=46135 | *Balance and Coordination*，Whittington Health。對象是**有動作與平衡困難的兒童**的家長和照顧者 | 單腳站立時「using the wall to balance as needed」；較難的進階要「with supervision of an adult」 | 已讀。**沒有**「若無法安全維持單側站立，應先使用雙腳版本」這句話，也不是針對成人或長者 |

### 2-3 逐項判斷

| 問題 | F01-09 坐姿抬膝 | F01-11 站姿髖屈曲 | 09 → 11 進階關係 | 用「時間差＋完成天數」選用這條轉換 |
|---|---|---|---|---|
| 1. 動作如何執行 | **有支持**：UCLH Seated marching（對象是術後病人） | **部分支持**：Plymouth「Hip flexion in standing」（對象是髖關節置換術後）。AAOS 現行頁面沒有這個動作；國健署 PDF 無法讀取 | 不適用 | 不適用 |
| 2. 是否需要扶持或其他條件 | UCLH 沒有寫要扶持；專案注意事項寫「可扶椅子」，引用的 AAOS 頁面沒有這段 | **有支持需要扶持**：Plymouth 寫「holding onto a solid support」，且「once you are walking comfortably」才開始站姿練習 | Plymouth 的開始條件是「可以舒適地走路」，**不是**五次坐站或完成天數 | — |
| 3. 是否支持坐姿 → 站姿的進階關係 | — | — | **未找到支持**。Plymouth 的順序是躺姿 → （能走路後）站姿，沒有坐姿抬膝。UCLH 兩個都列了，但沒有寫成先後關係。規格自己也標為 Engineering Rule，並註明「並非完全相同的動作名稱」 | — |
| 4. 是否支持用目前的五次坐站時間差＋完成天數來選用 | — | — | — | **未找到支持**。所讀的來源都沒有提到五次坐站，也沒有提到完成天數。這個組合來自 D5 規格的工程規則（R005、NC-P01），先前的文件已記錄為「未找到」 |
| 對 L05 的意義 | 坐姿動作，不需要單腳站立 | 依 Plymouth：站立、單腳承重、扶穩固支撐物。依專案注意事項：「平衡感不佳或高齡長者必須手扶穩固家具」 | 規格寫明這條轉換「增加站立與單腳支撐需求」 | 判定用的輸入都沒有平衡或單腳站立能力的資料 |

**補充**
- 「需要扶持」只代表來源預設的使用者有人或物可以扶，並在特定情境下練習。這**不等於**勾選 L05「目前無法安全地單腳站立」的所有使用者都適合；來源也沒有處理這群人。
- L05 的排除字串，所引用的來源是兒童平衡衛教，而且查不到那句原文。所以「L05 只排除 F01-20」這個範圍，本身也沒有來源依據。
- 上述所有來源的對象都是**術後或住院後**的病人，與 ReMotion 居家使用者的族群不完全相同。

---

## 三、最小處理方案（歷史提案，未採用）

> 本節是查核輪提出的方案，**沒有照這個方案實作**。實際範圍較窄，見第四節。

### 3-1 現有資料能確認與不能確認的事

| 能確認 | 還缺 |
|---|---|
| 患者整週都自述「無法安全地單腳站立」（L05 在三個地方都有記錄） | 患者目前**有沒有穩固的支撐物、能不能扶著做**：沒有這個輸入 |
| 患者 6 天都完成了坐姿抬膝的目標量（相機紀錄） | 患者**站姿平衡能力**的任何測量。五次坐站是坐站功能，不是單腳站立 |
| 五次坐站變快 3.5 秒（超過系統採用的參考值） | 「坐姿抬膝 → 站姿髖屈曲」進階關係的專業確認：目前是工程規則，來源不支持 |
| 規格自己寫明這條轉換會增加站立與單腳支撐需求 | 專業判斷：L05 的使用者在什麼條件下（例如扶穩固支撐物、有人在旁）可以做 F01-11，或應先做其他動作 |

**判斷**：依目前的依據，**不足以支持**在這個情境下自動換成 F01-11，並讓患者直接接受。原因不是「F01-11 被證明不適合」，而是這次換動作的唯一理由（進階轉換）恰好增加了患者自己說做不到的那項需求，而且沒有任何輸入或來源能化解這個矛盾。

同時，**維持 F01-09 也不是自動安全的選擇**。系統對這位患者的狀況同樣沒有專業判斷，只是沒有增加站立需求而已。所以建議的做法是交給人決定，而不是改成自動維持。

> **2026-10-26 實作備註**：實際實作**沒有**採用下方「任何限制＋任何進階」的範圍，只針對本案（L05＋F01-09 → F01-11），檢查位置也改在共用的安排狀態。詳見第四節。下方保留原提案，作為紀錄。

### 3-2 建議做法：沿用既有的專業檢視流程

**規則**：如果 D5 的選動作結果是「進階換動作」（NC-P01，而且真的換了），同時患者在狀況確認時勾選了**任何** L01～L05 限制，就把確認方式改為需要專業確認（`professional_review_required`），新增檢視原因 `progression_with_declared_limitation`。

- **判定不變**：`decisionRuleId`（R005）、`matrixDecision`、`decision`、`selectionRuleId`、提議的動作清單都不改，只改「誰可以確認」。
- **不寫入任何「L05 × F01-11」的對照**，所以不構成新的臨床禁忌。限制和動作是否相容，交給復健師判斷。
- **為什麼用「任何限制」，而不是只針對 L05**：只針對 L05 等於在程式中寫死一條臨床判斷。用「有自述限制，又要增加難度，就請人看」，屬於路由規則，和現有 Gate 7 的設計方式相同。
- **影響範圍（只列出，不擴大實作）**：目前所有進階轉換在「勾選任何限制時」都會改由專業確認。依先前的模擬，從系統首次推薦出發，實際會發生進階的只有 G04 的 F01-09 → F01-11。復健師另行安排過的計畫，可能還會遇到 F01-04 → F01-02、F01-02 → F01-01。

### 3-3 患者會看到什麼

| 患者狀態 | 修改後看到的畫面（沿用現有畫面） | 可以做的下一步 |
|---|---|---|
| 已連結復健師 | 「需要進一步確認」，標示「待復健師檢視」。待處理項目會多一行新原因的說明，例如：「下一週會改成需要站立與單腳支撐的動作，而你勾選了限制條件，需要復健師確認後才能安排。」同時說明「系統不會另外通知復健師，可以主動告知對方」 | 等待復健師在個案頁確認（可以改成其他動作、填寫訓練量，並必須寫理由），再由患者接受 |
| 沒有連結復健師 | 同一個畫面，加上現有的說明「目前沒有連結的復健師，這份建議無法在 ReMotion 中完成檢視」，以及邀請碼卡片 | 用邀請碼加入復健師；或回首頁。**目前沒有其他往下一週的路**（這是 D5 既有政策 P2，本輪不處理） |

**已知的剩餘風險（只記錄，本輪不處理）**
- 患者可以從「修改狀況確認」取消勾選 L05。這時就沒有限制了，又會回到可直接接受。這可能是患者的真實變化，也可能是為了繞過檢查；目前的輸入無法分辨。是否要對「本週移除限制」另外處理，需要另行決定。
- 患者接受安排的權限檢查只在 App 端。`firestore.rules` 沒有檢查 `confirmationMode`，所以雲端無法強制「必須經過專業確認」。這與現有其他需專業確認的情境相同。
- **首次推薦也有同樣的根本原因**：G04 + L05 選 20 分鐘時，首次推薦就直接包含 F01-11。依指示，本輪不新增首次推薦的審閱流程，只記錄影響範圍。
- LLM 草稿也可能提出 F01-09 → F01-11，但 LLM 草稿本來就一律需要復健師確認，所以不受影響。

### 3-4 最小修改位置（下一輪實作，本輪不改）

| 檔案 | 修改 |
|---|---|
| `js/data/f01ProgressionDecision.js:85-89` | `REVIEW_REASON` 新增 `PROGRESSION_WITH_DECLARED_LIMITATION` |
| `js/data/f01ProgressionDecision.js:391-402`（`determineConfirmationMode`） | 新增參數 `currentLimitations`；當 `selection.selectionRuleId === "NC-P01"`、`selection.replacedExercise` 存在，而且 `currentLimitations.length > 0` 時，加入新原因 |
| `js/data/f01ProgressionDecision.js:527-532`（`buildD5Proposal`） | 呼叫時傳入 `currentLimitations` |
| `js/data/f01ProgressionDecision.js:406-430`（`buildD5Reason`） | 為新原因加一段固定理由文字，不使用臨床用語 |
| `js/data/d5Arrangement.js:32-36` | `ENGINE_REVIEW_TEXT` 新增對應的說明 |
| `docs/verification/f01-g04-l05-case/reproduce.mjs` | 把標 `[CASE]` 的斷言改成修改後的預期結果 |
| 不改 | `f01ProgressionSpec.js`、兩個規格 Excel、3.12 秒參考值、訓練量、其他動作轉換、`d5LlmRecommendation.js`、首次推薦 |

### 3-5 驗收案例

1. G04 + L05（兩次狀況確認都勾選），10 與 15 分鐘：
   - 判定仍是 R005 進階、NC-P01，F01-09 → F01-11；
   - `confirmationMode = professional_review_required`，`reviewReasons` 包含 `progression_with_declared_limitation`，`nextCycleReady = false`；
   - 安排狀態為 `needs_review`；`confirmD5Proposal` 回傳 `not_confirmable`，不建立下一週。
2. 同一份提案，由已連結的復健師審閱（選 F01-11、F01-09，或其他同目標動作皆可）→ 狀態變成 `reviewed` → 患者接受 → 依原有規則建立下一週，`therapistReviewId` 有值。
3. 同一份提案，沒有連結復健師：畫面顯示邀請碼卡片與新原因的說明，沒有「接受」按鈕。
4. 不受影響的情況與修改前**完全相同**（比對判定、選動作、確認方式與安排狀態）：
   - 沒有任何限制時的 G04 進階（仍是 `ready`）；
   - 有限制但判定維持；
   - 有限制但進階沒有可用的轉換（沒有真正換動作）；
   - NC-A01、NC-A02、NC-N01 的所有情況。
5. `tests/d5NextWeekHandoff.test.js`、`tests/f01ProgressionDecision.test.js`、`tests/d5TherapistReview.test.js`、`tests/d5LlmRecommendation.test.js`：若有斷言需要改，逐條列出原因，不放寬斷言。
6. `f01ProgressionSpec.js`、`f01RecommendationSpec.js`、兩個規格 Excel 的 MD5 不變。
7. 文字檢查：新增的原因文字不含 3.12、MDC、改善、療效、禁忌等字眼。

---

## 四、實作紀錄（2026-10-26）

**範圍**：只處理本案。狀況確認包含 L05，而且下一週的規則安排在同一個位置把 F01-09 換成 F01-11 時，必須由有效照護關係的復健師檢視，患者不能直接接受。這是針對已查核案例的**暫時工程處理，不是臨床禁忌**，也沒有擴大成「任何限制＋任何進階都要確認」。

### 4-1 修改前後

| 項目 | 修改前 | 修改後 |
|---|---|---|
| 規則判定與候選安排（R005、NC-P01、F01-09 → F01-11、`d5.confirmationMode = user_acceptance`） | — | **不變**。引擎與規格檔都沒有修改 |
| 安排狀態 | `ready`，患者可直接接受 | `needs_review`，原因代碼 `l05_seated_to_standing_hip_flexion` |
| 直接呼叫 `confirmD5Proposal` | 建立下一週（F01-11） | 回傳 `not_confirmable`（`arrangementStatus: needs_review`），不建立下一週 |
| 復健師對同一版內容完成有效確認 | — | `reviewed` → 患者可接受，接著走既有的下一週流程（同日沿用再評估作為基準） |
| 3.12 秒、完成天數、訓練量、其他轉換、復健師選動作／設定量／填理由的流程 | — | 不變 |

### 4-2 實作方式

- 檢查只寫在 `js/data/d5Arrangement.js` 的 `resolveD5Arrangement` 一處（`checkL05HipFlexionReview`、`L05_HIP_FLEXION_REVIEW`）。這個函式**原本就是**以下各處共用的判斷，所以沒有另外複製一份：
  - 患者的下一階段頁面（`app.js` 的 `d5ProposalPage`，透過 `getD5Arrangement`）；
  - 復健師工作台清單與送出審閱（`d5TherapistReviewService.js` 的 `listD5ReviewsForPatient`、`reviewD5Proposal`）；
  - 患者接受服務（`trackingCycleService.confirmD5Proposal` → `resolveD5Arrangement` → `isPatientAcceptable`）。**不是**只隱藏按鈕。
- 判斷依據是提案中**實際保存的內容**：`d5.currentLimitations` 含 L05，而且 `proposal.items[i] = F01-11`、`d5.currentExerciseIds[i] = F01-09`。不依賴建立時間，也不依賴 `d5.replacedExercise`。
- **既有的未接受建議**：每次讀取時即時判斷，所以一樣適用。沒有批次改寫雲端資料；已接受的安排會先走 `accepted` 分支，不追溯修改。
- **舊資料不足以判斷**時（下一週含 F01-11，但缺少 `currentLimitations` 或 `currentExerciseIds`）：回報原因代碼 `l05_hip_flexion_check_data_missing`，轉為待復健師檢視，**不補值**。
- **說明文字**：患者頁與復健師卡片使用同一段 `arrangement.reasons[].text`：
  > 你在狀況確認勾選了「目前無法安全地單腳站立」，而下一週會把「坐姿抬膝」換成需要站立進行的「站姿髖屈曲」。這項更換需由有照護關係的復健師檢視後才能安排；這不代表已確認不適合。
- **確認失效**：沿用既有的指紋機制。患者改了狀況確認的限制，或安排內容有變，舊的審閱就不能沿用（`staleReview`）。
- **LLM 路徑**：有效草稿本來就一律是 `needs_review`。草稿失敗或被退回時，會回到規則安排，也會被這項檢查擋下。沒有修改模型相關程式。
- **未連結復健師**：沿用既有說明「目前沒有連結的復健師…」與邀請碼入口，不會顯示「等待復健師」，也不宣稱已通知復健師。

### 4-3 修改的檔案

| 檔案 | 內容 |
|---|---|
| `js/data/d5Arrangement.js` | 新增 `L05_HIP_FLEXION_REVIEW`、`L05_HIP_FLEXION_DATA_MISSING`、`checkL05HipFlexionReview`；`resolveD5Arrangement` 加入對應的原因 |
| `tests/f01G04L05CaseHold.test.js`（新增，並登記為 `test:f01-g04-l05-case-hold`） | 涵蓋驗收案例的服務層測試 |
| `tests/d5TherapistReview.test.js` | 新增本案的頁面情境：患者待檢視頁 → 復健師卡片 → 審閱 → 患者接受；以及未連結的頁面 |
| `docs/verification/f01-g04-l05-case/reproduce.mjs` | 標 `[CASE]` 的斷言改為修改後的行為（舊的預期寫在註解中） |
| `package.json` | 登記新的測試 |

### 4-4 測試結果（2026-10-26，本機）

- 修改前先跑了一次基準：10 個受影響的測試檔全部通過。
- 修改後全部通過：
  - `f01G04L05CaseHold`（新）、`d5TherapistReview`（含新的頁面情境）、`f01ProgressionDecision`、`f01NextCycle`、`d5NextWeekHandoff`、`d5LlmRecommendation`、`f01Adventure`、`f01Batch2Completion`、`f01GoalRecommendation`、`llmWeeklySummary`、`therapistWorkspace`、`todayPlan`；
  - 其他會讀到 D5 安排或接受的測試：`fa5xConditionReport`、`fa5xMeasurementCompatibility`、`fa5xVersionNotice`、`flowDataQa`、`patient00History6w`、`resultStates`。
- `reproduce.mjs` 通過。
- `vite build` 成功（只有原本就有的 chunk 大小警告）。
- **沒有跑完整測試套件**（`npm test`）。

驗收案例對照（`tests/f01G04L05CaseHold.test.js`）：

| 驗收要求 | 段落 |
|---|---|
| L05 一直存在＋09 → 11：需要檢視，直接呼叫接受也被拒絕 | §1 |
| 有效復健師確認後可以接受，並銜接既有的下一週流程（也可以改選其他動作） | §2 |
| 確認後修改限制或安排，舊確認不能沿用；以相同答案重新送出則保持有效 | §3 |
| 沒有 L05 的原案例：維持原行為（`ready`） | §4 |
| 有 L05 但沒有 09 → 11（G04 20 分鐘、G05）：不會被誤擋 | §5 |
| 舊的未接受建議（建立時間較早、缺少 `replacedExercise`）不能繞過；欄位不足時明確回報 | §6 |
| LLM 有效草稿仍需檢視；草稿失敗時回到規則，並被同一項檢查擋下 | §7 |
| 未連結復健師：仍然擋下；未連結的復健師送出審閱會被拒絕 | §8 |
| 儲存失敗的處理 | 沿用 `d5TherapistReview`、`d5LlmRecommendation` 既有的同步失敗測試，兩者都通過 |

### 4-5 未驗證的部分

- **沒有在真實瀏覽器中操作。** 這個環境沒有可用的瀏覽器工具，所以改用與既有測試相同的方式：在 node 中直接執行 `app.js` 的頁面函式，用隔離資料檢查患者頁與復健師卡片的 HTML。點擊流程、樣式，以及實際雲端同步，都沒有驗證。
- ~~首頁冒險關卡卡片與實際安排狀態不一致~~：已在收尾輪修正，見 4-7。
- 沒有使用 patient00 或真實資料，沒有呼叫 Gemini，沒有寫入正式雲端，也沒有部署。

### 4-6 仍未解決的缺口

1. **G04 選 20 分鐘時，首次推薦就可能直接包含 F01-11**（L05 不會排除它）。本輪沒有新增首次推薦的審閱流程。
2. **患者取消勾選限制後的處理政策**：在「修改狀況確認」取消 L05 後，這項檢查就不再適用，安排會回到 `ready`。這可能是患者的真實變化，目前的輸入無法分辨，政策尚未決定。
3. **雲端規則尚未強制這項確認**：`firestore.rules` 沒有檢查這項原因，所以這是 App 端的把關。修改過的用戶端仍可能直接寫入「已接受」。

本輪**沒有**修復整體的限制篩選（L01～L05 的字串比對仍是原樣），也不代表已達上架水準。

### 4-7 收尾：首頁冒險關卡卡片（2026-10-26）

**修改前**：第 8 關「開啟下一週」只看引擎的 `confirmationMode`。本案引擎的值是 `user_acceptance`，所以首頁顯示「確認後就能開啟下一週」，與實際的「待復健師檢視」不一致。

**修改後**：第 8 關改看共用的安排狀態（`getD5Arrangement`，與建議頁使用相同的呼叫與完成規則版本）。限制判斷沒有另外複製，推薦規則也沒有改。

| 實際安排狀態 | 首頁文字 |
|---|---|
| `needs_review`（已連結復健師） | 下一週訓練待復健師檢視。 |
| `needs_review`（未連結復健師） | 下一週訓練待復健師檢視；目前沒有連結的復健師，可以查看說明與邀請碼入口。（不會說已有人接手，也不會說已通知） |
| `reviewed` | 復健師已確認下一週安排，等待你接受。 |
| `accepted`，需要新基準評估 | 完成新基準評估後開啟下一週。（與原本相同） |
| `accepted`，其他情況 | 已接受下一階段建議，下一週尚未開啟。 |
| `no_auto` | 與原本相同 |
| `draft_pending` | 下一階段建議草稿產生中。 |
| `ready` | 與原本相同（確認後就能開啟下一週） |

- 修改的檔案：
  - `js/data/f01AdventureProgress.js`：新增 `loadD5ArrangementInputs`；第 8 關改依 `arrangement.status` 決定文字。
  - `js/data/journeyPresentation.js`：第二個旅程載入器也改用同一個 helper。
- 直接呼叫純函式 `resolveF01Adventure`、沒有傳入安排狀態時，會改用 `resolveD5Arrangement` 的規則安排。這種呼叫拿不到復健師審閱，只在測試中使用。
- 測試：
  - `tests/f01Adventure.test.js`：一條斷言的預期文字改了。該測試的患者沒有連結復健師，所以原本的「下一週訓練目前等待進一步確認。」改為未連結的說明，並新增「不宣稱已通知」的檢查。
  - `tests/f01G04L05CaseHold.test.js`：新增首頁卡片在待檢視（已連結／未連結）、復健師已確認、接受後需新基準等情況的檢查，以及第二個載入器（`buildJourneyChapters`）的檢查。
- 驗證結果（只跑這次首頁改動相關的測試）：
  - `f01G04L05CaseHold`、`f01Adventure`、`coreValueExperience`、`dataProfileCleanup`、`f01Batch2Completion`、`patient00Showcase`、`rehabAdventureStages`、`todayPlan`、`d5TherapistReview`：全部通過。
  - `vite build` 成功。
- 仍未完成（與 4-5、4-6 相同）：
  - 沒有在瀏覽器實際操作；
  - 雲端規則沒有強制這項確認；
  - G04 20 分鐘的首次推薦仍可能包含 F01-11；
  - 患者取消勾選限制後的處理政策尚未決定。

---

## 五、查核時無法確認的部分

- 國民健康署防跌 PDF（大於 10 MB，無法開啟）與 Northern Care Alliance 頁面（HTTP 403）的原文。
- AAOS Hip Conditioning Program 過去的版本是否包含站姿髖屈曲。
- F01-09、F01-11 動作預設的 3 組：工作表寫「No Evidence Found」，但程式的預設是 3 組。這屬於訓練量問題，依指示本輪不處理，只記錄。
- 復健師面對 L05 患者時會怎麼選，以及他們需要哪些額外資訊（例如居家有沒有穩固的支撐物）。這需要訪談或試用回饋。
