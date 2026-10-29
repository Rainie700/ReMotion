# F01 G01「從椅子起身更順」可實作條件決策表

狀態：工程決策文件。第一版條件篩選已依本文件實作（見第六節）。本文件沒有任何專業人員確認，也不是臨床規則；第六節的驗收只能稱為「條件篩選與工程規格驗證」，不是臨床準確率。

> **解讀修正（第一版實作時補上，優先於下文舊措辭）**
> - 坐姿起立與 NHS 版本只是「基本動作描述相近」；來源沒有驗證 App 的辨識角度、速度門檻。
> - 「未使用手撐、無他人協助」只代表符合本版協助條件篩選，不代表安全、有效或訓練量適合。
> - 深蹲與橋式暫不自動納入，是本版依目前已核對資料採取的工程政策，不是臨床禁忌。
> - CUH 是說明由專業人員提供個別建議，不能擴寫成禁止自主練習。
> - 缺少證據不等於證明動作無效。
「符合條件」只表示「系統可以把它自動列為候選」，不表示「已確認對此患者安全或有效」。
標示「工程保守」的處理是本專案的產品政策，不是文獻證明患者不適合。

## 〇、本輪讀了什麼

只讀與 G01 選取直接相關的部分：

| 項目 | 位置 | 本輪確認的事實 |
|---|---|---|
| 候選池、順序 | `js/data/f01GoalRecommendation.js` `orderF01GoalCandidates` | G01：F01-04（Direct）→ F01-01（Supporting）→ F01-10（Supporting） |
| 數量 | 同檔 `F01_TIME_OPTIONS`、第 191、198、234 行 | 10／15／20 分鐘分別取 1／2／3 項；未選時間取 3 項。不足時回傳 `shortfall`，不補位。全空時 `status: "no_candidates"` |
| 選取輸入 | 同檔第 175 行；呼叫端 `app.js` 第 15530 行 `generateF01RecommendationFromSetup` | 只讀評估「是否完成」與「評估類型」、目標、限制 L01–L05、時間。**五次坐站秒數不是輸入。** 呼叫端手上有完整 session（含 `conditionReports`），但沒有傳進去 |
| 限制 | 同檔第 58–62 行 | 以注意事項原文比對。三個 G01 動作的注意事項都不含任何 L01–L05 片語，所以目前沒有任何限制會改變 G01 結果 |
| 已有的自動排除機制 | `F01_AUTO_RECOMMENDATION_EXCLUSIONS`（`f01DailyTargets.js`） | 以動作為單位，**全域**生效（D5、LLM 草稿也用）。不適合拿來做「只對 G01」的排除 |
| 動作資料 | `js/data/rehabExercises.js` | F01-04：坐→前傾→站→坐，3 組×8 次，注意「控制重心前移」，reference_source「待補」。F01-01：站→髖後推→下蹲→站，3 組×10 次，膝 0→90°。F01-10：仰躺屈膝→抬臀→維持→下降，3 組×10 次。F01-02 迷你深蹲：膝彎約 30°～45°，在穩固扶手旁練習，2–3 組×10 次；不在 G01 候選池 |
| 辨識條件 | `js/ai/exercises/sitToStand/constants.js` | F01-04：坐姿膝角 ≤115°、站姿 ≥160°、軀幹前傾上限 35°、單次 1.8–10 秒。**沒有手腕關鍵點，無法偵測是否用手撐** |
| | `js/ai/squatConstants.js` | F01-01：蹲低判定膝角 ≤100°、站直 ≥155°、軀幹 35°。F01-02 變體（`app.js` 約第 10896 行）蹲低判定 145° |
| | `js/ai/exercises/bridge/constants.js` | F01-10：起始髖角 ≤135°、目標 ≥165°、過伸 178° |
| 已收集條件 | `js/data/fa5xConditionReport.js` | 五次坐站的使用者自述：`armsUsed`、`physicalAssistance`（yes／no／unknown）、`chairHeightCm`（選填）、`sameChairAsBaseline`。目前只用於顯示「完成時間／觀察時間」，不進選取 |
| 器材、地面、床面 | — | **沒有任何欄位。** 不知道使用者的椅子有沒有扶手或輪子，也不知道能否躺到地面或床面再起身 |
| 示範素材 | 三張示範圖（素材稽核標為已確認） | 已實際看過圖。F01-04：坐在無扶手椅上、雙手前伸、沒有手撐。F01-01：無支撐的自由站立深蹲，約 90°，畫面中沒有椅子。F01-10：仰躺的起始姿勢，**看不出是地面還是床面**。示範影片 `demo_video_url` 沒有檢視，本文件不依檔名推測影片內容 |

既有文件：`f01GoalEvidence.js` 三筆 G01 紀錄都只讀到摘要、專業審查狀態為 pending。`docs/F01_G01_SELECTION_REVIEW.md` 的每一格都是「未確認：＿＿」。這兩份文件裡的「待確認」都不是已批准的規則。

## 一、來源核對

| 來源 | 內容（只記錄頁面寫的） | 頁面沒寫的 |
|---|---|---|
| NHS「Strength exercises」 https://www.nhs.uk/live-well/exercise/strength-exercises/ | **Sit-to-stand**：用腿站起來、不要用手臂；使用穩固、沒有扶手和輪子的椅子；雙腳平放，膝蓋約成直角；做 5 次。**Mini-squats**：站在椅子後方、雙手扶椅背；只蹲到自己舒適的程度；做 5 次。頁面沒有橋式 | 沒說哪些人不該做；沒說這些動作能改善「從椅子起身」；沒有組數 |
| CUH「Hip strengthening exercises」 https://www.cuh.nhs.uk/patient-information/hip-strengthening-exercises/ | **Bridge**：仰躺在地面，把臀部抬離地面。維持秒數和次數都是**空白**，由物理治療師填寫。文件說明由物理治療師提供個別建議（不是禁止自主練習） | 沒有坐姿起立或深蹲；沒有預設劑量；沒說和起身能力有關 |
| Alexander 2001（PMID 11890578，只讀摘要） | 需要日常協助的長者，12 週針對床上與椅子起身分解動作的阻力訓練，起身表現有改善，但作者認為改善幅度在臨床上偏小 | 不是 App 的單一坐姿起立，也不是 3×8 |
| Hirono 2023（PMID 36853505，只讀摘要） | 社區長者每天在家做 100 下徒手深蹲、持續 4 個月；**五次坐站等功能測試沒有改善** | 不能說深蹲無效，也**不能說深蹲能改善起身** |
| Pankheaw 2022（PMID 35815985，只讀摘要） | 急性中風住院者在常規物理治療之外加 30 分鐘漸進式橋式，坐到站分數改善 | 是住院加物理治療的情境，不能外推到居家自主訓練或 3×10 |

## 二、決策表

圖例：

- **符合**：來源描述的形式與 App 一致。
- **不符**：形式、器材或支撐方式不同。
- **尚無法確認**：App 沒有資料可以判斷。
- **前提狀態**分成三種，彼此不可合併：「明確具備」、「明確沒有」、「未知」。

| 欄位 | F01-04 坐姿起立 | F01-01 深蹲 | F01-10 橋式 |
|---|---|---|---|
| 來源版本與範圍 | NHS：穩固、無扶手、無輪子的椅子；不用手；膝約直角；5 次。只是一般肌力運動說明 | NHS 只有**扶椅背的迷你深蹲**，蹲到舒適程度、5 次。Hirono：無支撐深蹲，五次坐站沒有改善 | CUH：在**地面**做，劑量空白，由物理治療師提供個別建議。Pankheaw：中風住院、併同物理治療 |
| App 版本與辨識要求 | 示範：無扶手椅、不用手。辨識：膝 ≤115° 到 ≥160°，前傾 ≤35°。**不偵測手撐**。3×8 | 示範：自由站立、約 90°、沒有支撐。辨識：膝要彎到 ≤100° 才算一次。3×10 | 示範：仰躺，看不出表面。辨識：髖 ≤135° 到 ≥165°。側面鏡頭。3×10 |
| 判定 | 基本動作描述**相近**（來源沒有驗證 App 的辨識角度、速度門檻）。椅子條件**尚無法確認**。手撐在訓練中**無法偵測**。3×8 **不符**來源（NHS 是 5 次、沒有組數） | **不符**：NHS 版本有扶椅、蹲幅自訂；App 版本無支撐、必須蹲到 ≤100°。現有文獻紀錄也不足以支持它改善坐站（缺少證據不等於證明無效） | 與 CUH 的動作形式**大致符合**（仰躺抬臀）。地面或床面**尚無法確認**。劑量**無來源**。CUH 說明由物理治療師提供個別建議與劑量，App 沒有對應資料（這不等於禁止自主練習） |
| 可驗證的前提 | (a) 五次坐站時沒有用手撐；(b) 沒有他人協助；(c) 有穩固、無扶手、無輪子的椅子 | 沒有任何可驗證前提能讓「App 版深蹲對應 G01」成立 | (a) 能自行躺到地面或床面並起身；(b) 有適合的表面。即使 (a)(b) 都成立，「適合此 G01 使用者」仍沒有來源 |
| 輸入是否已存在 | (a)(b) **已存在**（`conditionReports`，使用者自述，可能未回報）；(c) **不存在** | — | (a)(b) **都不存在** |
| 最小修正與影響 | `armsUsed` 或 `physicalAssistance` 為 yes 時，不自動列入，並寫明原因；為 unknown 或沒有回報時，也不自動列入，並提示先補回報；為 no 時列入，同時加上椅子條件的準備提示。影響：使用手撐或有人協助的使用者，G01 會得到 0 項 | G01 不自動列入 F01-01（**只限 G01**，不改動作資料與其他目標），在 `excluded` 寫明原因。影響：15／20 分鐘從 2／3 項變成 1 項，並附 shortfall | G01 不自動列入 F01-10，在 `excluded` 寫明原因。影響：20 分鐘從 3 項變少 |
| 依據性質 | 「NHS 版本是不用手」是**來源直接**。「用手或有人協助就不自動列入」、「未知也不自動列入」是**工程保守** | 「版本不符」與「Hirono 沒有觀察到改善」是**來源直接**的事實。「因此不自動列入」是**工程保守** | 「CUH 在地面做、由物理治療師提供個別建議、劑量空白」是**來源直接**。「因此本版暫不自動納入」是**工程保守**，不是禁忌 |

不做的事：

- 不把 F01-01 改名成迷你深蹲。
- 不把 F01-02 換進 G01。NHS 的 mini-squat 是一般肌力運動，頁面沒說它和起身有關；F01-02 的固定 30°～45° 和扶手方式，也不同於 NHS「扶椅背、蹲到舒適為止」。
- 不調辨識角度。
- 不改 3×8、3×10。

## 三、最小可實作方案

### 1. 可進入選取邏輯的條件

- **G01 專屬的「版本或來源不符，不自動列入」**：F01-01、F01-10。
  - 放在 `generateF01GoalRecommendation`，以 goal 為範圍，新增 reason code（例如 `g01_version_mismatch`、`g01_supervision_source`）。
  - 不使用全域的 `F01_AUTO_RECOMMENDATION_EXCLUSIONS`，以免影響 D5 和其他目標。
- **五次坐站條件回報 → F01-04**：
  - 由呼叫端用既有的 `getLatestFa5xConditionReport(session)` 取得條件後傳入；產生器本身維持純函式。
  - 三種狀態的處理：

| `armsUsed`／`physicalAssistance` | 處理 | 依據 |
|---|---|---|
| 兩者都是 no | 列入 | 使用者自述的條件與 NHS 版本一致 |
| 任一是 yes | 不自動列入，原因寫「測驗時有用手撐／有人協助，App 的坐姿起立是不用手的版本，且訓練時無法偵測手撐」 | 工程保守 |
| 任一是 unknown，或沒有回報 | 不自動列入，原因寫「尚未確認測驗時是否用手或有人協助」，並提供補回報入口（沿用既有的條件回報 UI） | 工程保守，**不代表使用者不適合** |

### 2. 只能影響準備提示的條件

- 椅子穩固、無扶手、無輪子、雙腳平放、膝約直角（NHS 原文）。
  - `chairHeightCm` 不能換算成「膝約直角」，因為沒有腿長資料，所以只做提示，不做規則。
- 「請不要用手撐；系統目前無法偵測手撐」。這是辨識能力的限制，必須明說。
- F01-04 的 3×8 不是來自 NHS，可在說明中標示「預設訓練量，來源待補」。本輪不改劑量。

### 3. 資料不足、不能做成自動規則的條件

- 椅子是否符合 NHS 條件：沒有輸入，也不打算新增，因為新增後只會變成提示，不會改變結果。
- 地面或床面移位能力：可以新增問題，但答「能」之後，F01-10 仍沒有來源支持自動列入。這個輸入不會改變結果，所以**不新增**。
- 五次坐站秒數與 G01 動作的關係：沒有任何來源支持用秒數決定要不要列入三者之一。維持「秒數不是輸入」。

### 4. 是否需要新增輸入

不需要。唯一會改變結果的條件（手撐、協助）已經在 `conditionReports` 裡，只是沒有傳入。

### 5. 候選太少時的呈現

- 沿用現有的 `shortfall`，例如「你選了 20 分鐘，目前可以自動列入的只有 1 項」，並列出 `excluded` 的動作與各自原因。**不補入沒有依據的動作。**
- 0 項時回傳既有的 `status: "no_candidates"`。
  - 目前 `app.js` 沒有任何地方處理 `no_candidates`。下一輪必須補上呈現：說明原因（未回報條件、用手或有人協助），並提供兩個入口：補回報、聯繫治療師。
  - 不顯示空清單，也不建立追蹤週期。

### 6. 各條件的具體差異

| 條件 | 狀態 | 結果 |
|---|---|---|
| 測驗時沒有用手、沒有人協助 | 明確具備 | F01-04 列入 |
| 測驗時有用手或有人協助 | 明確沒有（不具備「不用手」的前提） | F01-04 不列入，原因：版本前提不具備 |
| 沒有回報，或回報不確定 | 未知 | F01-04 不列入，原因：尚未確認（工程政策），並提示補回報 |
| F01-01 | 與條件無關，版本不符 | 一律不自動列入 G01 |
| F01-10 | 與條件無關，來源要求由專業判斷 | 一律不自動列入 G01 |

## 四、合成驗證案例

全部是合成資料，不使用 patient00。「現況」是依程式碼推得，不是實際執行的結果。

| # | 輸入 | 現況結果 | 修正後預期 | 依據 |
|---|---|---|---|---|
| V01 | G01、20 分鐘、armsUsed=no、assistance=no | 04、01、10 | 04；shortfall 3→1；excluded 01、10 並附原因 | F01-04 符合 NHS 版本（來源直接）。01、10 不自動列入（工程保守） |
| V02 | 同 V01，但 armsUsed=yes | 04、01、10 | 0 項，`no_candidates`；原因：有用手撐 | NHS 版本是不用手（來源直接）。不自動列入（工程保守） |
| V03 | 同 V01，但 armsUsed=unknown | 04、01、10 | 0 項；原因：尚未確認，並提示補回報 | **工程政策：未知時不自動列入**。不是文獻證明不適合 |
| V04 | 同 V01，但完全沒有條件回報 | 04、01、10 | 同 V03 | 同 V03（工程政策） |
| V05 | 同 V01，但 assistance=yes | 04、01、10 | 0 項；原因：測驗時有人協助 | 工程保守 |
| V06 | V01，只把秒數從 12 秒改成 20 秒 | 與 V01 相同 | 與 V01 相同 | 程式不讀秒數；也沒有來源支持用秒數選動作 |
| V07 | V01，只把時間改成 10 分鐘 | 04 | 04（沒有 shortfall） | R06 數量規則不變 |
| V08 | V01，只把時間改成 15 分鐘 | 04、01 | 04；shortfall 2→1 | 不補入版本不符的 01 |
| V09 | V01，未選時間 | 04、01、10 | 04；shortfall 3→1 | 同 V01 |
| V10 | V01，並勾選 L05 | 04、01、10（L05 只排除 F01-20） | 04；shortfall 3→1 | L05 的比對不變；結果差異只來自本方案 |
| V11 | 來源版本與 App 版本不符：G01、20 分鐘、條件全 no | 01 以「輔助候選」出現 | 01 列在 excluded，原因是「App 為無支撐深蹲（≤100°），來源為扶椅迷你深蹲」 | NHS 與辨識常數的比較（來源直接）。不改名、不換成 F01-02 |
| V12 | 其他目標（例如 G04）的結果 | 依各自候選池 | **完全不變** | 排除只限 G01，不動全域排除表，也不動 D5 |

## 五、具體缺少的命題

這些命題補齊之後，才能放寬上面的工程保守處理：

1. 「測驗時用手撐完成五次坐站的使用者，可以安全進行不用手的坐姿起立」，或「應該改用允許用手的版本」。目前兩者都沒有來源，App 也沒有允許用手的版本。
2. 「無支撐、蹲到 ≤100° 的深蹲，可以改善從椅子起身」。現有唯一紀錄（Hirono）沒有觀察到改善；這是缺少支持，不是證明無效。
3. 「扶椅的迷你深蹲（或 F01-02 的 30°～45° 扶手版本）可以改善從椅子起身」。NHS 只把它列為一般肌力運動。
4. 「居家、沒有物理治療師個別建議的情況下，自主進行地面或床面橋式，適合想改善起身的使用者」。CUH 說明由物理治療師提供個別建議（沒有說禁止自主練習），Pankheaw 是住院加物理治療。
5. 「坐姿起立 3×8、深蹲與橋式 3×10」的劑量來源。NHS 是 5 次、沒有組數；CUH 是空白。
6. 「訓練中用手撐的次數應不應該計入」。這需要辨識能力（手腕關鍵點），不只是規則問題。


## 六、第一版實作與驗收（2026-10-27）

本節只能稱為「條件篩選與工程規格驗證」。所有案例都是隔離的合成資料；沒有部署、沒有寫正式雲端、沒有呼叫 Gemini、沒有使用 patient00。

### 6-1 實際行為

- **範圍**：只影響**新產生**的 G01 首次推薦。
  - 既有推薦、已接受的安排與進行中的週期都不追溯改寫；沒有 `conditionScreen` 的舊 G01 紀錄，頁面維持原樣。
  - G02～G05、D5（共用的 `orderF01GoalCandidates` 不變）、LLM、復健師確認內容、全域排除表 `F01_AUTO_RECOMMENDATION_EXCLUSIONS` 都沒有改。
  - 預設組次與辨識門檻都沒有改。
- **F01-01 深蹲、F01-10 橋式**：G01 暫不自動納入。
  - 各自保存原因代碼：`g01_squat_version_unmatched`、`g01_bridge_setting_unconfirmed`，分類為「本版未納入」。
  - 不替換成其他動作，也不補位。
- **F01-04 坐姿起立**：使用這份推薦所依據、屬於目前患者、已完成的評估中**最新一筆**條件回報。
  - armsUsed 與 physicalAssistance 都是 no：通過本版協助條件篩選，再套用既有檢查。
  - 任一為 yes：分類為「目前未支援」，原因代碼 `g01_assistance_not_covered`。
  - 沒有 yes，但有 unknown、缺失或無效值：分類為「資料未確認」，原因代碼 `g01_condition_unconfirmed`。
  - yes 與 unknown 同時存在：兩個原因都保留，而且不提供補回報入口。
  - 評估不屬於本人、和這份推薦不一致，或回報者不是本人：一律視為缺失，結果是「資料未確認」。
- **保存的欄位**：推薦紀錄新增 `conditionScreen`，內容是：
  - 規則版本 `f01-g01-condition-screen-1.0`；
  - 評估 id、回報序號與筆數、回報 schema、回報時間與來源；
  - 兩個欄位的狀態，以及結果與原因代碼。
  - `excluded` 項目新增 `reasonCategory`；F01-04 另有 `screenReasons`。
  - 產生器仍是純函式，條件快照由呼叫端組好後傳入。
- **畫面**：
  - 有一個候選時，顯示「目前提供 1 個動作」。選 15 或 20 分鐘時，另寫明「本版目前只提供 1 個動作，不是 N 分鐘的完整課表或處方」。
  - 未納入的動作逐項列出原因，標示「本版未納入／目前未支援／資料未確認」。
  - 「其他可選動作」不會把這次未納入的動作放回來。
  - 零候選時顯示完整原因頁：
    - 寫明「沒有建立訓練安排，也不會開始或改變 7 日追蹤」；
    - 出口包括：既有的補回報表單（只在沒有 yes 時提供，表單不預選答案）、既有的復健師聯繫說明或邀請碼、重新設定。
- **零候選的保護**：
  - 結果不保存，也不建立或改連任何週期。
  - 服務層 `createOrGetTrackingCycle`、`startRecommendationCycle`、`canTrainFromRecommendation` 遇到空的首次推薦，回傳 `recommendation_has_no_items`，或不允許訓練。
  - `firestore.rules` 只收緊、不放寬：首次推薦建立時至少要有 1 項；週期所連的首次推薦也至少要有 1 項。
- **順帶修正**：從零候選頁離開後，用 `goF01RecommendationResult(id)` 開啟既有安排時，原本會因為殘留的空結果狀態又顯示零候選頁。這個問題在瀏覽器驗收 4d 發現，已修正。

### 6-2 修改的檔案

- 新增：
  - `js/data/f01G01ConditionScreen.js`
  - `tests/f01G01ConditionScreen.test.js`
  - `tests/fixtures/f01PreScreenEngine.mjs`
  - `docs/verification/f01-g01-condition-screen/compare.mjs`，產出 `RESULT.txt`、`RULES_EMULATOR_RESULT.txt`
  - `scripts/f01G01ConditionScreenBrowserCheck.mjs`
  - `reports/f01-g01-condition-screen-browser/`
- 修改：
  - `js/data/f01GoalRecommendation.js`（G01 篩選）
  - `js/data/recommendationService.js`（保存快照）
  - `js/data/f01InitialReview.js`（`isEmptyFirstRecommendation`）
  - `js/data/trackingCycleService.js`、`js/data/f01InitialReviewService.js`（空推薦守門）
  - `js/ui/f01RecommendationView.js`（原因文字、其他可選動作、數量說明）
  - `app.js`（傳入條件快照、零候選頁、排除原因、`goF01RecommendationResult` 修正）
  - `styles.css`、`firestore.rules`、`package.json`
- 因本次政策而調整的既有測試（沒有刪除斷言，原因寫在測試註解）：
  - `f01GoalRecommendation`：G01 期望值改為只有 F01-04 並附 shortfall；原本「排序」的斷言改用共用排序函式保留；橋式的輔助理由句改用 G04 的輔助項目驗證。
  - `f01GoalEvidence`：三張卡片的顯示改用「既有的三項 G01 紀錄」驗證；「秒數不影響」的期望值改為只有 F01-04。
  - `f01ProgressionDecision`：640 組輸入的原雜湊值保留，改對「篩選前引擎」比對；另外逐筆斷言 G02～G05 位元組相同，G01 只會變少、不會換成其他動作。
  - 以 G01 當成一般固定資料的測試，改用篩選前引擎，代表既有安排：`f01DailyTargets`、`trackingCycle`、`trackingComparison`、`trackingReassessment`、`trackingTraining`、`d5TherapistReview`。`f01NextCycle` 改用 G02，因為目標與斷言無關。
  - `scripts/firestoreRulesCheck.mjs`：「建立首次推薦」的範例資料改為 1 項，另外新增「0 項被拒」。
  - 「篩選前引擎」的作法：沿用目前原始碼，只把 G01 篩選開關關掉。它和原本的 640 組雜湊相符。

### 6-3 同一批案例：修改前後

| # | 案例 | 修改前 | 修改後 | 修改後未列原因 |
|---|---|---|---|---|
| V01 | G01 20 分、armsUsed=no、assistance=no | F01-04、F01-01、F01-10 | F01-04（shortfall 3→1） | F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V02 | 同 V01，armsUsed=yes | F01-04、F01-01、F01-10 | no_candidates（0 項） | F01-04:g01_assistance_not_covered；F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V03 | 同 V01，armsUsed=unknown | F01-04、F01-01、F01-10 | no_candidates（0 項） | F01-04:g01_condition_unconfirmed；F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V04 | 同 V01，沒有條件回報 | F01-04、F01-01、F01-10 | no_candidates（0 項） | F01-04:g01_condition_unconfirmed；F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V05 | 同 V01，assistance=yes | F01-04、F01-01、F01-10 | no_candidates（0 項） | F01-04:g01_assistance_not_covered；F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V06 | V01，只改秒數 12→20 秒 | F01-04、F01-01、F01-10 | F01-04（shortfall 3→1） | F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V07 | V01，只改時間 10 分 | F01-04 | F01-04 | F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V08 | V01，只改時間 15 分 | F01-04、F01-01 | F01-04（shortfall 2→1） | F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V09 | V01，未選時間 | F01-04、F01-01、F01-10 | F01-04（shortfall 3→1） | F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V10 | V01＋L05 | F01-04、F01-01、F01-10 | F01-04（shortfall 3→1） | F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V11 | 來源版本不符（同 V01，看 F01-01） | F01-04、F01-01、F01-10 | F01-04（shortfall 3→1） | F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| V12 | G04 20 分（其他目標） | F01-09、F01-10、F01-11 | F01-09、F01-10、F01-11 | — |
| X01 | yes＋unknown 混合 | F01-04、F01-01、F01-10 | no_candidates（0 項） | F01-04:g01_assistance_not_covered+g01_condition_unconfirmed；F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| X02 | 非本人的評估（條件 no/no） | F01-04、F01-01、F01-10 | no_candidates（0 項） | F01-04:g01_condition_unconfirmed；F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| X03 | 回報值無效（armsUsed="nope"） | F01-04、F01-01、F01-10 | no_candidates（0 項） | F01-04:g01_condition_unconfirmed；F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| X04 | 缺欄位（只回報 armsUsed=no） | F01-04、F01-01、F01-10 | no_candidates（0 項） | F01-04:g01_condition_unconfirmed；F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |
| X05 | 補回報：先 unknown 再 no/no（最新一筆） | F01-04、F01-01、F01-10 | F01-04（shortfall 3→1） | F01-01:g01_squat_version_unmatched；F01-10:g01_bridge_setting_unconfirmed |

- G01 案例共 16 個：有候選 8 個，零候選 8 個。
- 零候選的原因（可重疊）：目前未支援 3 個（V02、V05、X01），資料未確認 6 個（V03、V04、X01、X02、X03、X04）。
- G02～G05 共 1,536 組輸入（4 目標 × 4 時間 × 32 種限制組合 × 3 種條件快照），修改前後輸出完全相同。

### 6-4 測試、模擬器與瀏覽器

- **Node 測試**：跑相關測試 34 個（引用推薦產生器、推薦頁、週期建立或規則的檔案），33 個通過。
  - 未通過的是 `tests/patient00History6w.test.js`。它以目前的產生器重建 patient00 的第 5 週 G01 安排；因為本輪不碰 patient00，所以沒有修改，見 6-5。
  - 沒有跑完整測試。
- **build**：通過。
- **本機 Firestore 模擬器**（demo-remotion，未部署）：
  - `f01RecommendationIntegrityRulesCheck` 37/37，其中新增：一項 G01 推薦可建立、空推薦被拒、空推薦不能建立或改連週期；
  - `f01InitialPlanRulesCheck` 25/25；
  - `f01InitialReviewRulesCheck` 21/21；
  - `firestoreRulesCheck` 50/50。
- **Playwright**（本機 Auth 與 Firestore 模擬器、Vite 開發伺服器 `?emulator=1`，每位合成患者各用一個瀏覽器環境）：19/19 步驟通過。記錄在 `reports/f01-g01-condition-screen-browser/RUN_LOG.txt`。
  1. 條件全為 no → 一個候選 → 雲端保存快照 → 建立週期 → 進入訓練準備頁，當天目標只有 F01-04（截圖 `1-*`）。
  2. 明確有協助（另含 unknown）→ 零候選 → 三類原因都顯示 → 沒有補回報入口、沒有開始訓練 → 顯示邀請碼入口 → 雲端沒有推薦也沒有週期（`2-*`）。
  3. 回報不確定 → 零候選 → 補回報 → 表單沒有預選 → 雲端回報 2 筆、第一筆保留 → 重新產生，使用第 2 筆 → 一個候選並建立週期（`3-*`）。
  4. 已有 G02 週期 → G01 零候選 → 週期與原安排在雲端完全不變 → 原訓練入口與首頁追蹤卡正常（`4-*`）。
  - 截圖只拍到 App 畫面容器內可見的範圍，容器下方需要捲動的內容沒有入鏡。

### 6-5 尚未驗證或未做

- `tests/patient00History6w.test.js` 目前失敗。原因：它用目前的產生器重建 patient00 在篩選前就已存在的第 5 週 G01 安排，現在會得到零候選。
  - 修法是把那一行改用 `tests/fixtures/f01PreScreenEngine.mjs`。
  - patient00 的資料與展示程式都沒有動；展示程式用的是 G05，不受影響。
- 坐姿起立的準備提示（椅子穩固、無扶手、無輪子；系統不偵測手撐）本輪沒有做，留到下一輪的動作形式與辨識一致性。
- 零候選的結果不保存，所以沒有雲端紀錄可以追溯「曾經產生過零候選」。目前只能從評估本身的條件回報歷史推知。
- 復健師端的首次推薦審閱選項（`listInitialReviewOptions`）仍列出整個 G01 候選池。G01 不會觸發審閱，所以這次沒有改。
- 沒有在真實裝置或真實相機上驗證；條件回報是使用者自述，系統沒有驗證。
- 舊的 `f01InitialReviewBrowserCheck.mjs` 這次沒有重跑，它的流程用的是 G04。
