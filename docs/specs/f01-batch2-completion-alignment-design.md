# F01 第二批：統一偵測目標與正式完成判定 — 最小修正設計

> **狀態：設計稿（待決策、待實作、待驗證）。** 本輪只整理文件，沒有修改程式。
> 前置：第一批（當日目標快照）已完成本機驗證；**瀏覽器實測與雲端同步仍待驗證**（見 `docs/verification/f01-batch1/VERIFICATION_REPORT.md`）。
> 本設計沒有新增臨床門檻，也沒有改 D5 決策規則；下表的「計畫量」來自型錄預設值或復健師設定，不代表臨床建議量。

## 0. 固定原則（本批）

1. 正式 F01 訓練的顯示、偵測器目標和正式完成判定，都使用**同一份凍結目標**。
2. 每側目標必須**左右分別達標**，不能用「合計目標 × 2」來判定完成。
3. 維持**單筆達標**：不加入分次累計，也不從總次數推算完成了幾組。
4. 新完成規則要有版本與生效範圍；舊快照、歷史完成天數、既有提案都不重算。
5. D5 決策規則不改，但要用固定案例展示：完成天數修正後，訓練暴露分級與決策是否改變。
6. 共用偵測器只在正式 F01 情境下改變行為；自主練習與復健師課表維持原樣。

## 1. 資料來源（已查證）

- **計畫量**：第一批凍結目標的取值方式——復健師設定（`item.dose`）優先，否則用型錄預設值（`defaultSets` × `defaultRepetitions`）。F01 全部 20 個動作都是次數型。
- **計量依據**：第一批規則（3.3）。本輪補讀了 F01-01～04、10、17、18 的型錄文字，20 個動作的型錄文字現在全部確認。
- **偵測器目標與完成條件**：讀自 `app.js` 各 `goXxxDetection` 和各偵測器的 session 模組。

## 2. F01-01～20 完成判定對照表

**表格說明**
- 「計畫量」是**型錄預設值**的情況；復健師設定量的處理見表後說明。
- 「預設」欄是預設組數 × 每組次數。
- 「目前目標／完成條件」是第一批之後、本批之前的實際行為。

| 動作（偵測器） | 型錄文字 | 預設 | 計量依據 | 計畫量 | 目前偵測器目標 | 目前完成條件 | 修正後目標 | 修正後完成條件 | 分類 |
|---|---|---|---|---|---|---|---|---|---|
| F01-01 深蹲（squat） | 10–15次／3組 | 3×10 | total | 合計 30 | 組×次 = 30 | 偵測器沒有完成旗標，改用紀錄的總次數 ≥ 30 | 30（不變） | 單筆總次數 ≥ 30 | **一致，不需修** |
| F01-02（squat） | 10次／2-3組 | 2×10 | total | 合計 20 | 20 | 同上 | 20 | 單筆總次數 ≥ 20 | **一致** |
| F01-03（squat） | 8次／2-3組 | 2×8 | total | 合計 16 | 16 | 同上 | 16 | 單筆總次數 ≥ 16 | **一致** |
| F01-04 坐站（LE05） | 8-12次／3組 | 3×8 | total | 合計 24 | 24 | 偵測器計次 ≥ 24 | 24 | 單筆總次數 ≥ 24 | **一致** |
| F01-05 終末膝伸（KN03） | 每側10次／2-3組 | 2×10 | per_side | 每側 20 | 合計 20 | 左右合計 ≥ 20 | 每側 20 | **左 ≥ 20 且 右 ≥ 20** | **可直接修**（偵測器加選用的每側參數） |
| F01-06 坐姿膝伸（KN03） | 每側10～15次／2-3組 | 2×10 | per_side | 每側 20 | 合計 20 | 合計 ≥ 20 | 每側 20 | 左右各 ≥ 20 | **可直接修**（同上） |
| F01-07 坐姿膝屈（KN03） | 每側10次／2-3組 | 2×10 | per_side | 每側 20 | 合計 20 | 合計 ≥ 20 | 每側 20 | 左右各 ≥ 20 | **可直接修**（同上） |
| F01-08（HP01） | 每側10～15次／3組 | 3×10 | per_side | 每側 30 | 每側 10 | 左右各 ≥ 10 | 每側 30 | 左右各 ≥ 30 | **可直接修**（偵測器已支援每側目標） |
| F01-09（CR05） | 型錄：10–20次交替／3組；**來源表：每側10次** | 3×10 | **per_side**（來源表，見 3.1） | 每側 30 | 合計 30 | 合計 ≥ 30 | 每側 30 | 左右各 ≥ 30 | **依來源確定**（偵測器加選用的每側參數，並在偵測頁補左右顯示） |
| F01-10 橋式（LE03） | 10–12次／3組 | 3×10 | total | 合計 30 | 30 | 計次 ≥ 30 | 30 | 單筆總次數 ≥ 30 | **一致** |
| F01-11（HP02 訓練版） | 每側10～15次／3組 | 3×10 | per_side | 每側 30 | 每側 10 | 左右各 ≥ 10 | 每側 30 | 左右各 ≥ 30 | **可直接修** |
| F01-12（HP03） | 每側10～15次／3組 | 3×10 | per_side | 每側 30 | 每側 10 | 左右各 ≥ 10 | 每側 30 | 左右各 ≥ 30 | **可直接修** |
| F01-13（HP04 側抬腿） | 每側10～15次／3組 | 3×10 | per_side | 每側 30 | 合計 30 | 合計 ≥ 30 | 每側 30 | 左右各 ≥ 30 | **可直接修**（偵測器加選用的每側參數） |
| F01-14（HP05 側抬腿） | 每側10～15次／3組 | 3×10 | per_side | 每側 30 | 合計 30 | 合計 ≥ 30 | 每側 30 | 左右各 ≥ 30 | **可直接修**（同上） |
| F01-15（HP06 蚌殼式） | 每側10～15次／3組 | 3×10 | per_side | 每側 30 | 合計 30 | 合計 ≥ 30 | 每側 30 | 左右各 ≥ 30 | **可直接修**（同上） |
| F01-16（HP07） | 每側10～15次／3組 | 3×10 | per_side | 每側 30 | 每側 10 | 左右各 ≥ 10 | 每側 30 | 左右各 ≥ 30 | **可直接修** |
| F01-17 雙腳提踵（AK05） | 10~15次／2-3組 | 2×10 | total | 合計 20 | 10（沒乘組數） | 計次 ≥ 10 | 20 | 單筆總次數 ≥ 20 | **可直接修** |
| F01-18 雙腳勾腳（AK06） | 10~15次／2-3組 | 2×10 | total | 合計 20 | 10（沒乘組數） | 計次 ≥ 10 | 20 | 單筆總次數 ≥ 20 | **可直接修** |
| F01-19 單腳提踵（AK07） | 10~15次／2-3組；來源表次數、組數皆 No Evidence，沒有說明每側或合計 | 2×10 | **計量待確認**（型錄與來源皆無依據） | 不相乘 | 合計 10 | 左右合計 ≥ 10 | 新版：不進入自動推薦。復健師手動選擇時須明確指定「合計」，目標 = 組 × 次 | 復健師指定合計時，單筆總次數 ≥ 組 × 次；沒有指定時，生效前就擋下（3D） | **暫不納入新版自動推薦**（第 3B 節） |
| F01-20 單腳抬腳尖（AK08） | 型錄：10~15次／2-3組；**來源表步驟：「完成後換另一側」** | 2×10 | **per_side**（來源表，見 3.1） | 每側 20 | 合計 10 | 左右合計 ≥ 10 | 每側 20 | 左右各 ≥ 20 | **依來源確定**（偵測器加選用的每側參數，並在偵測頁補左右顯示） |

**復健師設定量**（D5 審閱後才會出現；審閱表單沒有「每側／合計」欄位）
- 不分左右的偵測器（F01-01～04、10、17、18）：依據為 total，同樣直接修正，計畫量 = 組 × 次。
- 會記錄左右的偵測器（F01-05～09、11～16、19、20）：依據為 unspecified，在新版週期中標為**計量待確認**（決策 C 未定，見第 3A 節）。

**統計（修正後總表）**
- **需修正：14 個**
  - F01-05、06、07、08、11、12、13、14、15、16、17、18（原 12 個，範圍不變）
  - F01-09、F01-20（依來源確定為每側，第 3.1 節）
- **一致：5 個**：F01-01、02、03、04、10。數量條件維持「單筆總次數 ≥ 組 × 次」，只改為由正式判定讀凍結目標。
- **暫不納入新版自動推薦：1 個**：F01-19（第 3B 節）。歷史紀錄與動作資料保留。
- 復健師設定量的計量方式：改由審閱表單明確保存（第 3C 節），不再作為一般的待確認來源。

**修正後的方向性**：同一筆紀錄在新規則下的完成，一定也是舊規則下的完成，新規則只會更嚴格、不會更寬鬆。原因是新目標都 ≥ 舊目標，而且「左右各 ≥ N」比「合計 ≥ N」更嚴格。這一點列為驗收案例 B2-13。

## 3. 決策結果

| 代號 | 問題 | 結果 |
|---|---|---|
| A | F01-09「10–20次交替」是左右合計還是每側？ | **已查證：每側**（3.1） |
| B | F01-19、20 單腳動作是每側還是合計？ | **F01-20 已查證：每側；F01-19 查無依據 → 計量待確認**（3.1、3A） |
| C | 復健師設定的次數用在會記錄左右的動作時，是每側還是合計？ | **未定 → 新版週期中標為計量待確認**（3A）；表單加欄位屬功能擴充，不在本批 |
| D | KN03 偵測頁的左右顯示 | **納入**：每側模式顯示「左 目前次數 / 目標、右 目前次數 / 目標」。F01-09（CR05）、F01-20（AK08）的偵測頁同樣沒有左右顯示，因 A、B 的結果一併納入 |
| E | 新舊規則如何切換 | **改為以週期為單位**：新週期才啟用新版；既有週期整週維持舊規則（第 4 節） |

### 3.1 A、B 查證結果

查證來源：
- `js/data/rehabExercises.js`（App 型錄）
- `docs/specs/ReMotion復健資料庫_含F01推薦GoalMapping.xlsx`，各動作的獨立工作表「第一階段｜動作基本資料與證據查核」
- `docs/specs/ReMotion六大功能_復健資料庫_F01.xlsx` 中找不到這三個動作

全程沒有用偵測器的寫法反推計畫原意。

| 動作 | App 型錄 | 來源表（工作表） | 判定 |
|---|---|---|---|
| F01-09 坐姿抬膝 | repetitions「10–20次交替」；sets「3組」；步驟「坐姿 → 單腳抬膝 → 交替進行」 | repetitions「**每側10次**」，來源 UCLH NHS（Seated marching），evidence_notes 寫「每側10次有 UCLH 直接依據」；sets 為 No Evidence Found；步驟「換另一側重複，左右交替進行」；evidence_status：Needs Modify | **per_side**，依據為來源表的 repetitions 欄。注意：App 型錄文字（10–20次交替）和來源表不一致；本批**不改型錄資料**，改用「依來源補充的計量依據表」（第 7 節）。組數 3 只是型錄預設，來源表寫無依據，這點保留給臨床檢視，本批不改 |
| F01-19 單腳提踵 | 「10~15次」「2-3組」；步驟只描述單腳站立 | repetitions、sets 都是 No Evidence Found；步驟只描述「受測側」，**沒有換邊、也沒有每側或合計的說明**；evidence_status：Needs Modify | **查無依據 → 計量待確認** |
| F01-20 單腳抬腳尖 | 「10~15次」「2-3組」；步驟只描述單腳站立 | 步驟第 5 點「**完成後換另一側**」，來源 Kingston and Richmond NHS；repetitions 欄是 No Evidence Found，但說明中引用 AAOS「初期**單側**由 8~12 次開始」 | **per_side**，依據為來源表步驟（兩側各自完成）。次數和組數本身仍是型錄預設值（來源表寫無依據），保留給臨床檢視，本批不改 |

### 3B. F01-19 暫不納入新版自動推薦候選

- 新增常數 `F01_AUTO_RECOMMENDATION_EXCLUSIONS = { "F01-19": "counting_basis_pending" }`。
- 只套用在**自動**產生候選的地方：
  - Phase C 推薦（`generateF01GoalRecommendation` 的候選）
  - D5 下一週選擇（`selectNextCycleExercises` 所用的 catalog）
  - D5 LLM 候選集（`buildD5CandidateSet` 的 `catalogIds`）
- 被排除的項目寫進推薦結果的 `excluded`，原因為 `counting_basis_pending`，畫面顯示「暫不納入：計量方式待確認」。
- **不刪除**型錄資料、歷史紀錄、既有週期與既有計畫中的 F01-19。
- 復健師審閱仍可**手動**選 F01-19，但必須依第 3C 節明確選擇計量方式（AK07 只支援合計）。

**實際結果**（以目前程式計算，`generateF01GoalRecommendation`，全目錄 vs. 排除 F01-19）

| 方案 | 排除前 | 排除後 |
|---|---|---|
| G05 10 分鐘 | F01-17 | F01-17（不變） |
| G05 15 分鐘 | F01-17、F01-18 | F01-17、F01-18（不變） |
| G05 20 分鐘 | F01-17、F01-18、F01-19 | F01-17、F01-18、**F01-20** |
| G05 20 分鐘 ＋ L05（無法安全單腳站立） | F01-17、F01-18、F01-19 | F01-17、F01-18 —— **候選不足（3 個名額只有 2 個）** |
| G05 20 分鐘 ＋ L03 | F01-17、F01-18、F01-20 | 相同（F01-19 原本就被 L03 排除） |
| G05 其他單一限制（L01、L02、L04） | 20 分鐘含 F01-19 | 20 分鐘改為 F01-20；10、15 分鐘不變 |
| G02、G04（F01-19 為輔助動作） | — | 所有時間方案的結果**都不變** |

**候選不足要明示**
- 目前產生器在動作數少於名額時仍回 `status: "ok"`，**沒有任何標示**。
- 本批新增結果欄位 `shortfall: { requested, available }`（只在 0 < 實際數 < 名額時出現），推薦頁顯示「符合條件的動作只有 2 個，少於 20 分鐘方案的 3 個」。
- 這只是揭露，不另外補動作。這個標示對所有目標都適用，不只 F01-19 造成的情況。

**D5 下一週的連帶影響（需知道）**
- G05 中 F01-17 唯一的 Confirmed 進階路徑是 F01-17 → F01-19。F01-18 → F01-20 仍是 Pending。
- 所以新版中 G05 的「進階」判定會依既有選擇規則 NC-P01 退回「維持（沒有套用進階）」。D5 矩陣不變，只是可用候選變少。
- 舊週期中已有 F01-19 的計畫，退階路徑 F01-19 → F01-17 不受影響。

### 3C. 復健師審閱表單：明確保存計量方式（決策 C 的最小修改）

**欄位**
- 每個項目的 `dose` 新增 `countingBasis`，可能的值為 `"total"`（合計）、`"per_side"`（每側），以及保留值 `{ side: "left" | "right" }`（指定側別）。
- 這個欄位在 `items` 裡，`firestore.rules` 是比對整個 `items`，沒有限制 `dose` 內的欄位，所以**不需改規則**。

**只提供偵測器實際支援的選項**（以本批完成後的偵測器能力為準）

| 偵測器能力 | 動作 | 表單選項 |
|---|---|---|
| 只計合計，不分左右 | F01-01～04、10、17、18 | 合計（唯一選項，固定顯示並明確保存） |
| 只支援每側 | F01-08、11、12、16 | 每側（唯一選項，固定顯示並明確保存） |
| 合計＋每側（本批加上選用的每側參數） | F01-05～07、09、13～15、20 | 合計／每側，**必選** |
| 記錄左右，但沒有每側參數 | F01-19 | 合計（唯一選項） |
| 指定單一側別 | 目前**沒有任何偵測器支援**「只完成指定一側」 | **不提供** |

**何時必填**：復健師輸入了次數，或該動作沒有可用的型錄或來源依據（F01-19）。只輸入組數、不輸入次數時，次數沿用型錄依據，不需要選。

**檢查**：`validateD5ReviewItems` 遇到缺少計量方式，回 `review_counting_basis_required`；選了不支援的選項，回 `review_counting_basis_unsupported`。復健師無法送出審閱，**新版安排也無法確認**。

**一併修正**：`d5Arrangement.planItem` 目前只保留 `sets`、`repetitions`、`durationSeconds`，必須一併保留 `countingBasis`。否則計畫指紋與差異比對會忽略計量方式的變更。

**舊資料**
- 既有的審閱紀錄沒有 `countingBasis`，**不補寫**。
- 尚未接受的提案若用到這類審閱，安排狀態為 `needs_review`，原因 `counting_basis_missing`，需要復健師重新審閱。
- 已接受的提案依第 4 節處理。

### 3D. 新版安排生效前的檢查（主要防線）

- 新增 `checkCountingDefinitions(items)`：用和凍結相同的規則，逐項確認每個必做動作都能得到可執行的完成規則（`total` 或 `per_side`）。
- 在三個地方檢查，任一項沒有定義就不生效，並列出動作：
  1. **Phase C 建立新週期**（`createOrGetTrackingCycle` 新建）：回 `counting_basis_undefined`。因為 F01-19 已排除、Phase C 沒有復健師設定量，正常情況不會發生，屬於防護。App 必須顯示說明，不能像目前的週期建立失敗那樣只寫 console。
  2. **D5 安排狀態**（`resolveD5Arrangement`）：規則安排或復健師審閱安排有未定義項目時，狀態為 `needs_review`，原因 `counting_basis_missing`（只是路由判斷，不新增門檻），患者無法接受。這樣是進入可由復健師處理的狀態，**不是** `no_auto` 的停滯。
  3. **建立下一週期**（`createNextTrackingCycle`）：再檢查一次，回 `counting_basis_undefined`。
- 執行時的阻擋（第 3A 節）保留，作為異常防護。

### 3A. 「計量待確認」的處理（只適用於新版週期；有 3D 檢查後只會在異常時出現）

**適用對象**
- F01-19（以型錄預設值計畫時）
- 任何會記錄左右的動作，且當天目標來自復健師設定量（決策 C 未定）

**凍結**
- 目標寫入 `completionRule: { kind: "counting_basis_pending", reason }`，`formalDetectorConfig: null`。
- **不套用舊完成規則**（偵測器旗標或總次數）。

**開始前提示與阻擋**
- 計畫頁與今日訓練的該項目標示「計量方式待確認」，「開始」按鈕不再進入正式訓練。
- 準備階段（第一批 4.2）偵測到待確認目標，就以新原因 `counting_basis_pending` 回到計畫頁，說明「這個動作的計量方式（每側或合計）尚待確認，本週暫不列入正式完成判定；如需練習，請另外從自主練習開始」。
- 不自動轉成自主練習，與第一批 4.5 相同。
- 最終核對（第一批 4.3）同樣擋下，避免準備頁停留期間情況改變。

**完成天數未知（`null`）時各處的處理**（已逐一查證現有程式）

統一由新函式 `getCompletedTrainingDaysStatus(cycle)` 回傳 `{ days: 整數或 null, status: "counted" | "measurement_pending" }`。所有地方都**不得把 null 轉成 0**，也不得顯示成「未訓練」。

| 位置 | 目前寫法 | 遇到 null 的處理 |
|---|---|---|
| D5 `buildD5Proposal` ← `countCompletedTrainingDays` | 整數 | 回傳 `null` → `classifyTrainingExposure` 為 null → 既有 R001 no_auto_decision，原因文字是「目前資料不足以支持下一階段自動調整…」，不是「未訓練」；`buildD5Envelope` 回 null，不呼叫 LLM |
| D5 狀態頁（app.js「本週完成訓練天數」） | 直接輸出 `${d5.completedTrainingDays} 天` → 會顯示「null 天」 | 改為「待確認（計量方式未定）」 |
| `d5ProposalView`、`f01RecommendationView` | 已用 `Number.isInteger` 判斷，非整數時省略 | 不變 |
| 首頁追蹤卡片、Data 頁、前後比較頁、追蹤歷程週卡（都是 `completedTrainingDates.length`） | 永遠是整數，會顯示「0 天」 | 改讀 status，`measurement_pending` 時顯示「待確認」 |
| 冒險關卡（`f01AdventureProgress`） | `countCompletedTrainingDays`，null 時條件為假，文字會出現「null / 3」 | 改讀 status，顯示「訓練日待確認」，關卡不視為未完成 |
| 週摘要 context（`llmContextBuilder`） | `week.completedDays` | 給 `null` |
| 週摘要 schema | 已允許 `["integer","null"]` | 不變 |
| 週摘要驗證器 | 只在整數時檢查 | 不變（null 通過） |
| 週摘要替代文字 | 非整數時顯示「本週正式訓練日資料尚未提供」 | 不變，不會出現「0 天」或「未完成」 |

**不被當成「使用者未完成」**
- 該週期標為「訓練量測待確認」：任何一天的凍結目標中只要有待確認項目，就成立。
- 因為待確認項目永遠不會被判定完成，那幾天也不會成為完成日。所以 `countCompletedTrainingDays` 對這種週期回傳 `null`，而不是 0 或部分天數。
- D5 現有規則在完成天數無法分級時，本來就走 R001（`trainingState == null` 時為 no_auto_decision）。所以**不改任何 D5 規則**就會停在「不自動判定」，也不會呼叫 LLM（`buildD5Envelope` 在 no_auto_decision 時回傳 null）。
- AI 週摘要 context 的 `training.completedDays` 在這種週期給 `null`，欄位保留，結構不變，避免呈現成「0 天」。
- 今日進度顯示「x / y（1 項計量待確認，不列入）」。

**已知後果（更新）**
- 有了 3B（F01-19 不進入自動推薦）、3C（表單明確保存計量方式）、3D（生效前檢查）之後，新版週期在正常流程中**不會**含有計量待確認的項目。本節的阻擋與 null 處理只會在異常資料時出現。
- 若真的發生，依第一批的查證，D5 在 no_auto_decision 狀態會「不安排下一週」，復健師審閱也無法覆寫。這一點本批不擴充處理，只保證不把它當成「未完成」。

## 4. 版本與生效範圍（以週期為單位）

- 新常數 `F01_FORMAL_COMPLETION_RULES_VERSION = "f01-formal-completion-2.0"`。
- **週期版本是唯一的權威來源**：本批上線後**新建立**的週期寫入 `cycle.formalCompletionRulesVersion`。既有週期沒有這個欄位，**整週維持舊規則，不會在週中切換**。
  - Phase C 新建的週期：一律新版。
  - D5 下一週期：**依提案被接受時的版本**。本批上線後的接受，會在 `d5.confirmation` 記下 `completionRulesVersion`，並在接受前通過第 3D 節的檢查。上線前已接受、但下一週期在上線後才建立的提案（例如需要重新做基準評估）：下一週期維持**舊版**。原因是已接受的項目依規則不能再修改，也不能補寫計量方式。
- **每日快照版本必須和週期一致**：
  - 新版週期中以 `formal_start` 凍結時，把週期版本**複製**到快照的 `completionRulesVersion`，並為每個目標寫入 `completionRule`（`total`、`per_side` 或 `counting_basis_pending`）與 `formalDetectorConfig`。
  - 舊版週期中凍結的快照**不寫**版本（行為與第一批相同）。
  - 完成判定**讀週期版本**決定用哪一套規則，並檢查快照版本是否一致。新版週期出現沒有版本、沒有凍結目標的快照（例如 `completion_fallback` 補建）時，**不套舊規則**：該項標為「目標未知」，當天不算完成，嘗試清單照常保留。
  - 不一致時一律不判定完成，記下原因供追溯。
- 舊版週期：快照、完成判定、偵測器目標全部照第一批之後的現狀。12 個修正、F01-09、F01-20 的每側處理、計量待確認，在舊版週期中都**不生效**。
- `exerciseCompletions[ex]` 新增 `completionRuleVersion` 與 `completionBasis`（`frozen_total`、`frozen_per_side`、`legacy_detector_flag`）。
- **不重算**：既有的 `completedTrainingDates`、`exerciseCompletions`、嘗試清單、已存的 D5 提案（含已接受的）、LLM 週摘要。

## 5. D5 影響的固定案例（規則不改，只看輸入天數改變）

D5 規則（`f01ProgressionSpec`，MDC 3120 ms）。訓練暴露分級：0 天 = none、1–5 天 = partial、6 天 = full。

| 案例 | 時間變化 | 舊規則完成天數 | 新規則完成天數（假設） | 舊分級→決策 | 新分級→決策 | 是否改變 |
|---|---|---|---|---|---|---|
| D5-1 | −3500 ms（快於 MDC） | 6 | 6（計畫全是一致的動作，例如 G01：F01-04、01、10） | full → R005 progress | full → R005 progress | 不變 |
| D5-2 | −3500 ms | 6（F01-17 每天只做 10 下） | 3（只有 3 天做到 20 下） | full → R005 progress | partial → R004 maintain | **決策改變** |
| D5-3 | −1000 ms（MDC 內） | 6 | 5 | full → R008 maintain | partial → R007 maintain | 分級改變，決策不變 |
| D5-4 | −1000 ms | 1 | 0 | partial → R007 maintain | none → R006 no_auto_decision | **決策改變** |
| D5-5 | +3500 ms（慢於 MDC） | 6 | 2 | full → R010 adjust | partial → R010 adjust | 分級改變，決策不變 |
| D5-6 | +3500 ms | 1 | 0 | partial → R010 adjust | none → R009 no_auto_decision | **決策改變** |
| D5-7 | 比較無效（例如量測版本不相容） | 6 | 0 | R001 no_auto_decision | R001 no_auto_decision | 不變（第一道關卡先擋下） |
| D5-8 | −3500 ms | 6（舊版週期計畫含 F01-19） | null（新版週期，F01-19 計量待確認） | full → R005 progress | 無法分級 → R001 no_auto_decision | **決策改變**：不把待確認當成「未完成」，D5 規則本身沒改 |

「新規則完成天數」是固定的合成假設，不是推估。本批只改變之後新產生的完成天數；已存的提案不會變。

## 6. 共用偵測器的影響範圍限制

- **偵測器目標**：`app.js` 新增 `f01FormalDetectorConfig(exerciseId)`。
  - **只有**在 `isF01FormalTrainingContext()` 成立、當天快照帶有 `completionRulesVersion`、而且該目標的規則已確定時，才回傳正式設定。
  - 其他情況回傳 `null`，各 `goXxxDetection` 照原本公式計算。
  - 因此自主練習、復健師課表、非進行中週期的建議、未決動作，偵測器目標全部不變。
- **偵測器模組**（`seatedKneeExtension`、`sideLegRaise`、`clamshell`）只新增**選用的** `targetPerSide` 參數；沒有傳入時，行為與輸出完全不變。
  - `sideLegRaise` 也用於 LE04（側抬腿，非 F01 正式情境）。LE04、HP04、HP05、HP06、KN03 的既有測試必須在不修改的情況下通過。
- **正式完成判定**只在 `trackingCycleService.recordExerciseCompletion` 內、而且只針對帶有新版本的快照，所以不影響訓練事件、遊戲化、復健師課表的完成判定。

## 7. 最小修改清單

| 檔案 | 修改 |
|---|---|
| `js/data/f01DailyTargets.js` | 新增 `F01_FORMAL_COMPLETION_RULES_VERSION`；`resolveCompletionRule(target)`（依計量依據與偵測器能力；未決時回 `detector_flag_unresolved`）；`deriveFormalDetectorConfig(target)`（`{ targetReps }` 或 `{ targetPerSide }`）；`isFormalTargetMet(record, rule)`（只看單筆；`per_side` 需要左右都有值，缺值視為未達標）；凍結時一併寫入 `completionRule` 和 `formalDetectorConfig` |
| `js/data/trackingCycleService.js` | `formal_start` 寫入 `completionRulesVersion`；`recordExerciseCompletion` 改為先取得當天快照，有新版本且規則已確定時用 `isFormalTargetMet`，否則照舊；`exerciseCompletions` 記錄規則版本與判定依據。注意：原本「先檢查完成旗標再找快照」的順序要調整 |
| `js/ai/exercises/seatedKneeExtension/session.js`、`sideLegRaise/session.js`、`clamshell/session.js`、`seatedKneeRaise/session.js`（F01-09）、`singleLegToeRaise/session.js`（F01-20） | 選用參數 `targetPerSide`：有傳入時改為「左 ≥ N 且 右 ≥ N」才完成，摘要帶出 `targetPerSide`；沒有傳入時不變 |
| `js/data/f01DailyTargets.js`（補充） | `F01_COUNTING_BASIS_SOURCES`：只列 F01-09、F01-20 的每側依據與出處（來源表工作表、欄位、機構），凍結時優先於型錄文字判定；型錄資料本身不改。新增 `counting_basis_pending` 規則 |
| `js/data/trackingCycleService.js`（補充） | 新週期寫入 `formalCompletionRulesVersion`；凍結時複製到快照；完成判定以週期版本為準；新增週期是否「訓練量測待確認」的判斷 |
| `js/data/f01ProgressionDecision.js` | **只改輸入計算**：`countCompletedTrainingDays` 對量測待確認的新版週期回傳 `null`。D5 規則表、`evaluateD5Decision` 都不改。另外，`selectNextCycleExercises` 的呼叫端改用排除 F01-19 的 catalog |
| `js/services/llmContextBuilder.js` | 量測待確認的週期，`training.completedDays` 給 `null`（欄位與結構不變） |
| `js/data/f01GoalRecommendation.js` | 套用 `F01_AUTO_RECOMMENDATION_EXCLUSIONS`，排除項目寫進 `excluded`；新增 `shortfall` 欄位 |
| `js/data/d5TherapistReviewService.js` | `validateD5ReviewItems` 檢查計量方式；`listD5ReviewOptions` 帶出各動作的可選計量方式 |
| `js/data/d5Arrangement.js` | `planItem` 保留 `countingBasis`；未定義項目的狀態為 `needs_review` / `counting_basis_missing` |
| `js/data/d5LlmRecommendation.js` | 候選集排除 F01-19（只改輸入 catalog，結構不變） |
| `js/data/trackingCycle.js`（或 `f01DailyTargets.js`） | 新增 `getCompletedTrainingDaysStatus` |
| `app.js`（補充） | 審閱表單的計量方式選擇；推薦頁的 `shortfall` 說明；週期建立失敗時顯示說明；D5 狀態頁、首頁卡片、Data 頁、比較頁、追蹤歷程週卡在 null 時顯示「待確認」 |
| `js/data/f01AdventureProgress.js` | 改讀 status，null 時顯示「訓練日待確認」 |
| `app.js` | 新增 `f01FormalDetectorConfig`；以下函式在正式情境套用設定：`goSquatDetection`、`goLe05Detection`、`goKn03Detection`、`goLe03Detection`、`goHp01Detection`、`goHp02TrainingDetection`、`goHp03Detection`、`goHp04Detection`、`goHp05Detection`、`goHp06Detection`、`goHp07Detection`、`goAk05Detection`、`goAk06Detection`，以及 `goCr05Detection`（F01-09）、`goAk08Detection`（F01-20）；**不含** `goAk07Detection`（F01-19 待確認）。KN03、CR05、AK08 偵測頁在每側模式顯示「左 目前次數 / 目標、右 目前次數 / 目標」。準備階段與最終核對加入 `counting_basis_pending` 阻擋與說明；計畫頁、今日訓練標示「計量方式待確認」 |
| `tests/f01Batch2Completion.test.js`（新增）＋ `package.json` | 第 8 節驗收案例 |

**不修改**：D5 規則表與 `evaluateD5Decision`、LLM 輸入結構、復健師課表流程、自主練習流程、型錄資料（`rehabExercises.js`）、第一批的偵測器目標規則表（`F01_DAILY_TARGET_RULES_VERSION` 不變）。

## 8. 驗收案例

- **B2-1 對照表**：新版週期中，20 個動作在預設計畫下凍結後，`completionRule`、`formalDetectorConfig` 都和第 2 節對照表一致；F01-09、20 為 `per_side`。F01-19 不會出現在新版自動推薦；以合成資料直接凍結 F01-19 且沒有指定計量方式時，為 `counting_basis_pending`（異常防護）；復健師指定合計時，為 `total`。
- **B2-2 同一份來源**：正式情境下，各偵測器的目標、偵測頁顯示的目標、完成判定使用的門檻，都來自同一份凍結目標；凍結後修改型錄預設值或復健師設定量，三者都不變。
- **B2-3 每側（KN03，每側 20）**：
  - 左 25、右 15（合計 40）→ 不完成：偵測器旗標與正式判定都是未完成。
  - 左 20、右 20 → 完成。
- **B2-4 每側（HP01，每側 30）**：左 30、右 29 → 不完成；左右各 30 → 完成。
- **B2-5 合計（AK05，合計 20）**：單筆 10 下 → 不完成（舊規則下會算完成）；單筆 20 下 → 完成。
- **B2-6 單筆**：同一天兩筆各 10 下 → 不完成（不累計），也不推算出「完成 1 組」。
- **B2-7 舊版週期不變**：舊版週期中所有動作（含 F01-09、19、20 和復健師設定量）的偵測器目標與完成判定，都和本批之前相同，`completionBasis = legacy_detector_flag`。
- **B2-8 缺欄位**：`per_side` 規則下，紀錄缺左或右次數 → 不完成，不補造數字。
- **B2-9 影響範圍**：
  - 同一動作在自主練習、復健師課表下的偵測器目標公式不變。
  - 偵測器模組沒有傳 `targetPerSide` 時輸出逐字相同。
  - `le04`、`hp04`、`hp05`、`hp06`、`kn03` 既有測試在不修改的情況下通過。
- **B2-10 版本**：
  - 第一批凍結（無版本）、舊版、`not_frozen` 的快照都照舊規則。
  - 新快照帶有 `completionRulesVersion`，`exerciseCompletions` 帶有規則版本。
  - 既有的 `completedTrainingDates` 與已接受的提案不變。
- **B2-11 D5 固定案例**：第 5 節 7 個案例的分級與決策符合表列；D5 規則表與修改前完全相同。
- **B2-12 LLM**：D5 給 LLM 的輸入與週摘要 context 的欄位結構不變。
- **B2-13 更嚴格**：同一組紀錄在新規則下完成的動作，都是舊規則下也完成的動作。
- **B2-14 顯示**：正式每側模式下，HP04、05、06 和 KN03 偵測頁顯示每側目標 N（來自凍結值），不顯示 2N 作為完成門檻。
- **B2-15 KN03／CR05／AK08 左右顯示（決策 D）**：每側模式下，偵測頁顯示「左 目前次數 / 目標、右 目前次數 / 目標」，數值隨每一下更新；非正式情境下這三頁的畫面不變。
- **B2-16 依來源補充的計量依據（A、B）**：
  - F01-09 凍結為 `per_side`，依據 `source_sheet_repetitions`，每側 30。
  - F01-20 凍結為 `per_side`，依據 `source_sheet_steps`，每側 20。
  - F01-19 為 `counting_basis_pending`。
  - 型錄資料逐字不變。
- **B2-17 週期版本（E）**：
  - 既有週期，即使在上線後新凍結快照，也照舊規則：快照沒有 `completionRulesVersion`，12 個修正不生效。
  - 新週期每一天的快照版本都等於週期版本。
  - 同一週期不會出現兩種規則。
  - 新版週期出現沒有版本的快照時，該項不判定完成，也不套舊規則。
- **B2-18 計量待確認的阻擋**：新版週期中，F01-19（以及單側動作帶有復健師設定量時）：
  - 計畫頁與今日訓練標示「計量方式待確認」。
  - 準備階段回到計畫頁並說明 `counting_basis_pending`，最終核對同樣擋下。
  - 不產生 `f01_cycle` 紀錄，不轉成自主練習。
- **B2-19 不被當成未完成**：
  - 量測待確認週期的 `countCompletedTrainingDays` 為 `null`，D5 走 R001 no_auto_decision，`buildD5Envelope` 為 null（不呼叫 LLM）。
  - 週摘要 `training.completedDays` 為 `null`，而不是 0。
  - 同樣條件的舊版週期仍照舊計數（D5-8）。
- **B2-21 審閱表單計量方式（C）**：
  - 各動作的選項和第 3C 節表格一致，不出現「指定側別」。
  - 輸入次數但沒選計量方式 → `review_counting_basis_required`；選了不支援的選項 → `review_counting_basis_unsupported`；兩者都無法送出。
  - 選好後，`countingBasis` 存在審閱與接受後的 `items`，計畫指紋會隨它改變。
  - 舊審閱沒有這個欄位時不補寫，安排狀態為 `needs_review` / `counting_basis_missing`。
- **B2-22 F01-19 排除**：
  - G05 10、15、20 分鐘的結果和第 3B 節表格一致。
  - G05 20 分鐘＋L05 只有 2 個動作，結果帶有 `shortfall: { requested: 3, available: 2 }`，推薦頁顯示說明。
  - G02、G04 的結果不變。
  - `excluded` 列出 F01-19，原因為 `counting_basis_pending`。
  - 型錄、歷史紀錄、既有週期中的 F01-19 都不變；復健師仍可手動選擇（只有合計）。
  - G05「進階」判定退回 NC-P01「維持（沒有套用進階）」，D5 矩陣不變。
- **B2-23 生效前檢查（3D）**：
  - 以合成的未定義項目分別觸發 Phase C 建立、D5 安排、建立下一週期三處，都會阻擋並列出動作；Phase C 阻擋時 App 顯示說明。
  - 所有項目都有定義時，三處照常通過。
- **B2-24 上線前已接受的提案**：上線前已接受、上線後才建立的下一週期為舊版週期，項目不被修改，也不補寫計量方式。
- **B2-25 null 的顯示**：以合成的量測待確認週期確認：
  - D5 狀態頁、首頁卡片、Data 頁、比較頁、追蹤歷程週卡、冒險關卡，都顯示「待確認」。
  - 不出現「0 天」「null」或「未完成」字樣。
- **B2-20 週摘要相容**：`completedDays: null` 能通過現有的週摘要驗證器與替代文字流程，不會產生「0 天」的敘述。若驗證器不接受 null，屬於規格衝突，需要回報，不得改為 0。

## 9. 本批之後仍未處理

- 分次累計與完整組數（依原則 3，本批不做）。
- 決策 C（復健師設定量在單側動作的意義）與 F01-19 的計量依據；確定前，新版週期中含這些項目的週會停在 no_auto_decision（第 3A 節）。
- F01-09 型錄文字（10–20次交替）與來源表（每側10次）不一致，以及 F01-09、19、20 組數或次數在來源表中無依據：屬於型錄資料與臨床檢視，本批不改。
- 瀏覽器、雲端、真人驗證（含第一批未完成的項目）。
