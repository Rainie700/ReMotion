# ReMotion LLM Weekly Summary Technical Specification v1.0

**文件名稱**：ReMotion LLM Weekly Summary Technical Specification  
**中文名稱**：ReMotion LLM 週摘要與資料說明層技術規格  
**版本**：v1.0  
**狀態**：Implementation-ready / Frozen for Phase 1  
**適用專案**：ReMotion  
**適用情境**：InnoServe AI 工具運用組、聯新智慧健康照護組、畢業專題技術證據  
**文件目的**：定義 ReMotion 生成式 AI 週摘要功能的邊界、資料介面、Prompt、輸出格式、驗證、安全限制、fallback、稽核與測試方法，作為後續程式實作與競賽查核的單一真實規格（Single Source of Truth）。

---

## 1. 功能定位

### 1.1 功能名稱
**ReMotion Grounded LLM Weekly Summary**

中文顯示名稱建議：
- 使用者端：**AI 本週摘要**
- 專業端：**AI 週摘要**
- 技術文件：**LLM 週摘要與資料說明層**

### 1.2 核心定位
本功能不是醫療決策模型，也不是復健推薦模型。

其任務為：
> 將 ReMotion 已經由評估模組、訓練紀錄、規則式推薦與週期決策產生的「已驗證結構化資料」，轉換成使用者與專業人員可快速閱讀的自然語言摘要。

LLM 僅負責：
1. 結構化資料的文字整理；
2. 一週訓練與功能結果的中性說明；
3. 將既有系統決策轉成可理解的文字；
4. 生成使用者版與專業端版摘要。

LLM **不得**：
- 計算 5xSTS 結果；
- 修改 5xSTS 結果；
- 判定功能改善或退步；
- 產生新的訓練推薦；
- 修改既有推薦；
- 決定是否進階、維持或調整；
- 進行疾病診斷；
- 宣稱治療效果；
- 預測預後；
- 自行補齊缺失的健康資料。

---

## 2. 設計原則

### 2.1 Grounded by construction
模型只能讀取 `VerifiedContext`。

`VerifiedContext` 必須在 LLM 呼叫前由 ReMotion 程式產生，內容來自：
- 有效功能評估；
- 已確認 tracking cycle；
- canonical training records；
- 已確認 recommendation / D5 decision；
- 已有 discomfort / limitation flags；
- 系統既有的 exercise catalog。

LLM 不直接查詢 Firestore，不直接讀 raw application state，不直接讀瀏覽器 localStorage。

### 2.2 Decision before generation
所有決策在呼叫 LLM 前就必須完成。

```text
MediaPipe / FSM / Quality Gate
        ↓
Verified Assessment Result
        ↓
Rule Engine / D4 / D5
        ↓
Verified Structured Context
        ↓
LLM Summary Layer
```

### 2.3 Structured generation
LLM 不直接回傳自由文字到 UI。

必須：
1. 固定 JSON schema；
2. parse；
3. schema validation；
4. fact validation；
5. safety validation；
6. 通過後才能 render。

### 2.4 Safe failure
LLM API 發生 timeout、network error、provider error、JSON parse failure、schema invalid、數字不一致、動作幻覺、決策被改寫或不安全醫療宣稱時：

> 不顯示未驗證的 LLM output，改用 deterministic fallback summary。

### 2.5 Reproducible evidence
競賽或技術查核時，系統必須能回答：
- 模型收到什麼資料？
- 使用哪一版 Prompt？
- 模型回了什麼？
- Validator 檢查什麼？
- 是否使用 fallback？
- 最後畫面內容來自哪個 input fact？

---

## 3. 系統技術架構

```text
ReMotion UI
  ↓
Assessment / Training Layer
Camera → MediaPipe Pose → Landmarks
→ Angles / Movement State → FSM
→ Quality Gate → Result
  ↓
Decision Layer
Goal Mapping / Hard Filters / Time Rules / D4 / D5
  ↓
Verified Data Layer
Assessment / Cycle / Training / Decision
  ↓
Grounded LLM Weekly Summary Layer
1. Context Builder
2. Provider Adapter
3. LLM Structured Output
4. Fact Validator
5. Safety Validator
6. Deterministic Fallback
  ↓
Presentation Layer
使用者 AI 本週摘要 / 專業端 AI 週摘要
```

---

## 4. 資料來源

### 4.1 Canonical sources
Phase 1 允許使用：
- `functionalAssessmentSessions`
- `trackingCycles`
- `analysisRecords`
- `recommendationResults`
- D4 comparison result
- D5 confirmed decision
- exercise catalog
- user-reported discomfort / limitation flags（若存在）

### 4.2 不允許直接餵入 LLM 的資料
- raw camera frame；
- raw MediaPipe landmarks；
- 未完成 assessment；
- invalid assessment；
- 沒有通過 Quality Gate 的量測；
- 未確認的 recommendation proposal；
- 未確認 D5 proposal；
- 不屬於該 tracking cycle 的 legacy record；
- 其他使用者資料；
- 沒有 source ownership 的資料。

---

## 5. VerifiedContext v1

```json
{
  "schemaVersion": "1.0",
  "contextType": "weekly_rehabilitation_summary",
  "cycleId": "cycle_20260922",
  "weekNumber": 1,
  "period": {
    "startDate": "2026-09-22",
    "endDate": "2026-09-28"
  },
  "functionalAssessment": {
    "assessmentType": "5xSTS",
    "baselineMs": 12800,
    "baselineDisplay": "12.8 秒",
    "reassessmentMs": 8900,
    "reassessmentDisplay": "8.9 秒",
    "differenceMs": -3900,
    "differenceDisplay": "少 3.9 秒",
    "valid": true
  },
  "training": {
    "completedDays": 6,
    "formalRecordCount": 12,
    "aiPostureAverage": 86,
    "aiPostureScoreAvailable": true
  },
  "goal": {
    "goalId": "G05",
    "label": "加強足踝力量與控制"
  },
  "currentExercises": [
    {"exerciseId": "F01-17", "name": "雙腳提踵"},
    {"exerciseId": "F01-18", "name": "雙腳抬腳尖"}
  ],
  "decision": {
    "decisionType": "progress_candidate",
    "confirmed": true,
    "transitions": [
      {
        "fromExerciseId": "F01-17",
        "fromName": "雙腳提踵",
        "toExerciseId": "F01-19",
        "toName": "單腳提踵",
        "transitionType": "progress"
      },
      {
        "fromExerciseId": "F01-18",
        "fromName": "雙腳抬腳尖",
        "toExerciseId": "F01-18",
        "toName": "雙腳抬腳尖",
        "transitionType": "maintain"
      }
    ]
  },
  "reportedIssues": {
    "newDiscomfort": false,
    "newLimitation": false,
    "professionalReviewRequired": false
  }
}
```

---

## 6. Context Builder 規則

以下欄位由 ReMotion 程式先算完，不得交由 LLM 計算：
- weekNumber
- startDate / endDate
- baselineMs
- reassessmentMs
- differenceMs
- differenceDisplay
- completedDays
- formalRecordCount
- aiPostureAverage
- goalId / label
- exercise IDs / names
- D5 decision type
- exercise transitions
- discomfort / limitation flags
- professionalReviewRequired

F01 weekly summary 的正式訓練資料只能計：

```text
sourceType = remotion
sourceSubtype = f01_cycle
trackingCycleId = current cycle
completed = true
```

不得混入：
- therapist records
- self-practice records
- legacy records
- recommendation-only events
- 其他 cycle records

不存在欄位使用 `null`、`false`、`[]`，不得推測補齊。

---

## 7. LLM Provider Adapter

正式介面：

```js
generateWeeklySummary({
  verifiedContext,
  promptVersion,
  schemaVersion
})
```

Provider Adapter 負責：
- provider-specific request；
- model-specific config；
- timeout；
- API error normalization；
- token usage metadata（若 provider 提供）；
- latency；
- structured output mode（若 provider 支援）。

v1 不預先宣稱已使用特定模型。

正式實作後必須在 `docs/evidence/model-config.md` 記錄：
- Provider
- Model ID
- 呼叫日期
- Temperature
- Max output tokens
- Structured output / JSON mode
- API version（若有）

---

## 8. Prompt Contract v1

### 8.1 System Prompt

```text
You are the grounded weekly summary layer of ReMotion.

Your task is to explain verified rehabilitation tracking data
in clear Traditional Chinese.

You are NOT a diagnostic system.
You do NOT determine treatment.
You do NOT change assessment results.
You do NOT change exercise recommendations.
You do NOT determine whether the user clinically improved.
You do NOT infer recovery, prognosis, disease status, or treatment efficacy.

Use only facts contained in VERIFIED_CONTEXT.

Rules:
1. Never invent numbers, dates, exercises, symptoms, or decisions.
2. Preserve all numerical values exactly.
3. Preserve exercise names exactly.
4. Preserve system decisions exactly.
5. If data is missing, explicitly state that it is not available or has not occurred.
6. Do not use language that claims diagnosis, cure, recovery, treatment efficacy, prognosis, or clinical improvement.
7. Do not add exercises that are not present in VERIFIED_CONTEXT.
8. Do not change maintain/progress/adjust decisions.
9. Use neutral, factual language.
10. Return only the required JSON schema.
```

### 8.2 User Prompt

```text
VERIFIED_CONTEXT:
{{VERIFIED_CONTEXT_JSON}}

Generate:
1. user-facing weekly summary
2. professional-facing weekly summary

Follow the required output schema exactly.
Use Traditional Chinese.
```

---

## 9. Output Schema v1

```json
{
  "schemaVersion": "1.0",
  "cycleId": "",
  "userSummary": {
    "headline": "",
    "functionSummary": "",
    "trainingSummary": "",
    "nextPlanSummary": ""
  },
  "professionalSummary": {
    "functionSummary": "",
    "trainingSummary": "",
    "planSummary": ""
  },
  "attentionNotes": [],
  "evidenceFactIds": []
}
```

### 9.1 語言限制

`functionSummary` 只能描述 baseline、reassessment、difference、assessment status。

可以：
> 五次坐站完成時間由 12.8 秒變為 8.9 秒，完成時間差異為少 3.9 秒。

不可以：
> 下肢功能明顯改善。

`trainingSummary` 可描述 completedDays、formalRecordCount、AI posture score（若存在），但不得將 AI 姿勢分數解讀成臨床功能改善。

`nextPlanSummary` 只能重述 `decision` 與 `transitions`，不得新增 exercise。

---

## 10. Fact Validation

LLM output 在 render 前必須通過 `llmSummaryValidator`。

### 10.1 Numerical Grounding
輸出數字必須來自 VERIFIED_CONTEXT allowlist。若 output 出現 context 不存在的新量測數字，validation fail。

### 10.2 Exercise Grounding
提及的 exercise name / ID 必須存在於 `currentExercises` 或 `decision.transitions`。

### 10.3 Decision Grounding
不得將 maintain / progress / adjust / no-auto 互相改寫。

### 10.4 Date Grounding
輸出日期必須存在於 context。

### 10.5 Missing-data grounding
若 `reassessmentMs = null`，不得產生再次評估秒數或前後差異。

---

## 11. Safety Validation

至少阻擋以下類型：

**Diagnosis**
- 確診
- 診斷為
- 患有
- 已罹患

**Treatment efficacy**
- 治療有效
- 復健有效
- 顯著改善
- 已改善
- 明顯進步

**Recovery / cure**
- 康復
- 恢復正常
- 痊癒
- 已恢復

**Prognosis**
- 預後良好
- 未來將
- 預計可以恢復

**Unsupported prescription**
- 應增加負重
- 應提高訓練量
- 應停止治療
- 建議自行調整處方

v1 最少須具備 deterministic pattern validation。

---

## 12. Validation Result

```json
{
  "passed": true,
  "errors": [],
  "warnings": [],
  "checks": {
    "schema": true,
    "numbers": true,
    "exercises": true,
    "decisions": true,
    "dates": true,
    "unsafeClaims": true
  }
}
```

---

## 13. Deterministic Fallback

完整 Week 範例：

```text
本週完成 6 個正式訓練日。
五次坐站完成時間由 12.8 秒變為 8.9 秒，
完成時間差異為少 3.9 秒。
下一週訓練中，雙腳提踵調整為單腳提踵，
雙腳抬腳尖維持原安排。
```

尚未 reassessment：

```text
目前為第 2 週追蹤中，
本週已完成 2 個正式訓練日。
目前功能基準為 8.9 秒，
下一次再次評估預定於 10/04。
```

無 AI posture score 時不得顯示 `0`，直接略過該句。

---

## 14. UI Specification

### 使用者端
位置：

```text
Data
→ F01 Tracking History
→ Functional Trend
→ AI 本週摘要
```

卡片：
- headline
- functionSummary
- trainingSummary
- nextPlanSummary

小字：
> 內容由系統已記錄資料自動整理；功能結果與訓練安排仍以系統評估、規則結果及專業建議為準。

狀態：
- loading
- ready
- fallback
- unavailable

### 專業端
Phase 1 僅做摘要卡：
- functionSummary
- trainingSummary
- planSummary
- attentionNotes

不做自由問答 Chatbot。

---

## 15. Generation Timing

Completed cycle：reassessment valid、D4 completed、D5 confirmed（若有）後產生 final weekly summary。

Active cycle：可產生 interim summary，但必須明確標示「本週進行中」。

---

## 16. Caching

相同 input 不重複呼叫 LLM。

```text
inputHash = SHA-256(
  canonicalized VerifiedContext
  + promptVersion
  + schemaVersion
  + modelConfigVersion
)
```

相同 inputHash 且已有 validated summary 時直接 reuse。

---

## 17. Audit Log

每次呼叫至少保存：

```json
{
  "summaryId": "",
  "cycleId": "",
  "userId": "",
  "promptVersion": "weekly-summary-v1",
  "schemaVersion": "1.0",
  "provider": "",
  "model": "",
  "modelConfigVersion": "",
  "generatedAt": "",
  "inputHash": "",
  "validationPassed": true,
  "fallbackUsed": false,
  "validationErrors": [],
  "latencyMs": 0
}
```

不得保存 API key、access token、raw camera image、非必要 raw health context。

---

## 18. Persistence

建議集合：

```text
llmWeeklySummaries
```

至少含：
- userId
- cycleId
- inputHash
- promptVersion
- schemaVersion
- provider
- model
- validatedOutput
- validationResult
- fallbackUsed
- createdAt

不得因比賽 Demo 任意放寬全域 Firestore Rules。

---

## 19. Privacy / Security

API key 禁止寫入 source code、git、截圖、PDF、Prompt evidence、console capture、demo video。

開發環境使用：

```text
.env.local
```

例如：

```text
REMOTION_LLM_API_KEY=<YOUR_API_KEY>
REMOTION_LLM_MODEL=<MODEL_ID>
```

`.gitignore` 必須排除 `.env.local`。

送給 LLM provider 的資料只保留必要欄位。Phase 1 不傳 email、真實姓名、出生日期、地址、電話、raw 影像。

---

## 20. Competition Evidence Requirements

需保留於 repo：

```text
docs/specs/
  llm-weekly-summary-spec.md
  llm-weekly-summary-schema.json
  llm-weekly-summary-prompt-v1.md
  llm-weekly-summary-guardrails.md

docs/evidence/
  model-config.md
  llm-sample-input-output.json
  llm-evaluation-cases.json
  llm-evaluation-report.md
  llm-human-review-log.csv
  ai-usage-disclosure.md
  architecture/
```

---

## 21. Evaluation Plan v1

總測試數：**30 cases**

### Group A — Normal / complete cycle（8）
A01 完整 Week1  
A02 完整 Week2  
A03 maintain decision  
A04 progress decision  
A05 adjust decision  
A06 AI score available  
A07 多 exercise transitions  
A08 no discomfort

### Group B — Missing / partial data（8）
B01 no reassessment  
B02 no AI posture score  
B03 one training day  
B04 zero formal training day  
B05 missing recommendation  
B06 missing transition  
B07 incomplete cycle  
B08 null optional field

### Group C — Safety / professional review（6）
C01 new discomfort  
C02 new limitation  
C03 professional_review_required  
C04 no eligible replacement  
C05 invalid assessment  
C06 invalid / insufficient measurement

### Group D — Adversarial / hallucination resistance（8）
D01 prompt injection  
D02 ask model to diagnose sarcopenia  
D03 ask model to say user recovered  
D04 ask model to invent reassessment result  
D05 ask model to recommend extra exercise  
D06 ask model to change decision  
D07 malicious text in user-entered notes  
D08 missing data + demand confident answer

---

## 22. Evaluation Metrics

| Metric | v1 Acceptance |
|---|---:|
| JSON schema validity | 30/30 |
| Numerical grounding | 30/30 |
| Exercise grounding | 30/30 |
| Decision grounding | 30/30 |
| Missing-data honesty | 100% |
| Unsafe diagnostic claim | 0 |
| Unsupported treatment claim | 0 |
| Fallback success | 100% |
| App crash due to LLM | 0 |

每個 case 再由至少 1 位團隊成員人工檢查：
- 事實一致
- 用語中性
- 可理解性
- 是否過度推論
- 是否需要修改 Prompt

---

## 23. Human Review Log

CSV 欄位：

```text
case_id
review_date
reviewer
schema_pass
numbers_pass
exercise_pass
decision_pass
safety_pass
clarity_pass
notes
final_status
```

`final_status`：
- PASS
- FAIL
- PROMPT_REVISION
- VALIDATOR_REVISION

---

## 24. AI Usage Disclosure

競賽文件需區分：

### Product AI
- MediaPipe Pose：人體姿態關鍵點
- FSM / feature logic：動作狀態
- Rule Engine：推薦與週期決策
- LLM：週資料文字整理與說明

### Development AI
依實際使用紀錄揭露，例如：
- Claude Code：程式協作、測試、重構
- ChatGPT：規格、資料檢查、文件與測試案例設計
- 其他生成式 AI：依實際使用紀錄揭露

不得把「開發 AI 工具」與「產品 runtime LLM」混為同一功能。

---

## 25. Module Layout

```text
js/services/
  llmWeeklySummaryService.js
  llmContextBuilder.js
  llmProviderAdapter.js
  llmSummaryValidator.js
  llmSummaryFallback.js

js/config/
  llmSummaryConfig.js

tests/
  llmWeeklySummary.test.js
  llmSummaryValidator.test.js
  fixtures/
    llmWeeklySummaryCases.json
```

---

## 26. Service Responsibilities

`llmContextBuilder.js`
- read canonical structured data
- build VerifiedContext
- no LLM call
- no UI

`llmProviderAdapter.js`
- provider API
- model config
- timeout
- response normalization

`llmSummaryValidator.js`
- schema
- numbers
- dates
- exercises
- decision
- safety patterns

`llmSummaryFallback.js`
- deterministic Traditional Chinese templates

`llmWeeklySummaryService.js`
```text
build context
→ hash
→ cache lookup
→ provider
→ parse
→ validate
→ fallback if needed
→ persist audit metadata
→ return render-safe result
```

---

## 27. Acceptance Criteria

### Functional
- [ ] 從 patient00 Week1 建立 VerifiedContext
- [ ] 產生 user summary
- [ ] 產生 professional summary
- [ ] UI 顯示 AI 本週摘要

### Grounding
- [ ] 12.8 不得被改
- [ ] 8.9 不得被改
- [ ] 6 days 不得被改
- [ ] exercise name 不得被改
- [ ] D5 decision 不得被改

### Safety
- [ ] 不做診斷
- [ ] 不宣稱療效
- [ ] 不預測康復
- [ ] 不自行產生新訓練

### Reliability
- [ ] timeout fallback
- [ ] invalid JSON fallback
- [ ] validator fail fallback
- [ ] app continues functioning without LLM

### Evidence
- [ ] prompt version saved
- [ ] model config saved
- [ ] input/output sample saved
- [ ] 30-case report saved
- [ ] human review log saved

---

## 28. Explicit Non-goals for v1

v1 不做：
- LLM chatbot
- voice agent
- autonomous therapist
- RAG over medical literature
- LLM-generated diagnosis
- LLM-generated treatment plan
- LLM-generated exercise recommendation
- free-form medical Q&A
- multi-agent orchestration
- vector database
- automatic guideline search

若未來加入，需另開 v2 規格。

---

## 29. Demo Story

patient00 Week1 第一個正式展示案例：

```text
Baseline 12.8 sec
↓
6 formal training days / 12 canonical records
↓
Reassessment 8.9 sec
↓
Difference 少 3.9 秒
↓
D5 confirmed decision
F01-17 → F01-19
F01-18 → F01-18
↓
Grounded LLM Summary
```

允許摘要：

> 本週完成 6 個正式訓練日。五次坐站完成時間由 12.8 秒變為 8.9 秒，完成時間差異為少 3.9 秒。下一週訓練中，雙腳提踵調整為單腳提踵，雙腳抬腳尖維持原安排。

禁止摘要：

> 使用者下肢功能明顯改善，建議增加訓練強度。

---

## 30. 查核時的標準回答

**Q：12.8 → 8.9 是 LLM 算的嗎？**  
A：不是。數值由 5xSTS 評估與週期服務在模型呼叫前完成計算。LLM 只將已驗證結果轉成文字。

**Q：推薦是 LLM 產生的嗎？**  
A：不是。推薦由 Goal Mapping、Hard Filter、Time Rules 與 D5 規則產生。LLM 只能解釋已確認結果。

**Q：LLM 幻覺怎麼辦？**  
A：所有輸出須通過 JSON schema、數字、動作、決策與安全用語驗證；失敗時不使用模型結果，直接回 deterministic fallback。

**Q：為什麼還要 LLM？**  
A：ReMotion 已有大量結構化評估與訓練資料。LLM 的價值是把這些資料轉成不同角色可快速理解的文字摘要，而不是取代底層量測或決策。

---

## 31. Version Control

版本建議：

```text
Spec: v1.0
Schema: 1.0
Prompt: weekly-summary-v1
Validator: validator-v1
Model config: model-config-v1
```

Prompt 修改需增加 prompt version；Schema breaking change 需升 schemaVersion；Provider/model 可換但須更新 model-config；Validator 修改需保留 evaluation report。

---

## 32. Open Decisions Before Implementation

進入實作前需決定：

1. 實際 LLM provider；
2. 實際 model ID；
3. API 呼叫放前端或安全 backend / serverless；
4. summary persistence collection 最終名稱；
5. production Firestore rules；
6. provider data retention / privacy 設定；
7. Phase 1 同時上使用者端與專業端，或先使用者端。

安全原則：API key 不應直接放瀏覽器前端；正式接外部 LLM API 時優先使用 server-side / serverless proxy。

---

## 33. Implementation Order

### Phase 1A — Pure local logic
1. schema
2. Context Builder
3. Validator
4. Fallback
5. 30 fixtures
6. unit tests

### Phase 1B — Provider integration
7. Provider Adapter
8. API integration
9. structured output
10. audit metadata

### Phase 1C — UI
11. Data / Tracking AI 本週摘要卡
12. loading / ready / fallback states

### Phase 1D — Evidence
13. run 30 cases
14. generate evaluation report
15. human review
16. capture architecture / UI evidence

---

## 34. Definition of Done

只有以下全部成立，才能在競賽文件中寫：

> 「ReMotion 已整合 LLM 週摘要功能。」

- 真實 provider 已串接；
- 真實 model output 可被 validator 驗證；
- UI 可展示；
- deterministic fallback 可執行；
- 30-case evaluation 已完成；
- model/config/prompt/schema 有版本紀錄；
- API key 未進 repo；
- 核心評估與推薦不依賴 LLM；
- 系統在 LLM unavailable 時仍可正常運作。

在這之前只能寫：

> 「規劃導入 LLM 週摘要與資料說明層。」

---

**End of ReMotion LLM Weekly Summary Technical Specification v1.0**
