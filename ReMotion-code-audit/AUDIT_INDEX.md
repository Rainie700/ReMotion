# ReMotion Code Audit Index

> Read-only architecture-review package. Files were **copied**, not moved;
> no original repository file was modified. New files in this package:
> `AUDIT_INDEX.md` and `ASSET_REFERENCES.md` only.

## Current repository state

| Item | Value |
|---|---|
| Current branch | N/A — the working copy is **not a git repository** (no `.git/`) |
| Latest commit hash | N/A (no git history available) |
| Audit date | 2026-09-01 |
| Package version | `1.0.0` (`package.json` → `"name": "rm"`) |
| Runtime deps | `@mediapipe/tasks-vision ^0.10.35`, `firebase ^12.17.1` |
| Dev deps | `vite ^8.0.10` |
| Build config | **No `vite.config.*` file exists** — build/dev/preview run on Vite defaults (`npm run dev` / `build` / `preview`). |
| Module type | `"type": "module"` (native ESM, no bundler config, no TypeScript) |
| Hosting | Firebase Hosting, project `remotion-2026`; `firebase.json` serves `dist/` with SPA rewrite to `/index.html`. `firestore.rules` present. |

### Repo shape (top level)

```
app.js            ~11,126 lines / ~1.2 MB   ← single monolithic UI + controller module
styles.css        ~2,290 lines
index.html        loads /styles.css + ./app.js (type=module), mounts #app
js/               ~250 ES modules (data services + AI/pose exercise modules)
tests/            59 Node assert scripts (*.test.js), one per exercise family
public/images/    ~image assets (excluded from this package — see ASSET_REFERENCES.md)
dist/             prebuilt Vite output (excluded)
graphify-out/     knowledge-graph output (excluded)
.claude/docs/     rehab_database.xlsx, shoulder_rom_domain_spec.xlsx (INCLUDED)
智慧科技組_ReMotion…pdf  16 MB competition deck (excluded)
```

`README.md` is **stale / aspirational**: it describes a React + Tailwind +
Recharts + Node/Express + MongoDB + Gemini stack and a 5-phase plan. None of
that matches the actual code, which is **vanilla ES-module JavaScript + Vite +
Firebase (Auth + Firestore) + MediaPipe Tasks Vision**, with a much larger
phase history (assessment work is at "Phase 7.3B.x", exercise catalog at
"Phase 5.x–7.x"). Treat `README.md` as non-authoritative.

---

## Key entry files

| Path | Role |
|---|---|
| `index.html` | HTML shell; `<div id="app">`; `<script type="module" src="./app.js">` |
| `app.js` | **Everything UI**: state object, router (`render()`), all page render functions, all camera/training controllers, all monkey-patch extension chains. ~11k lines. |
| `js/data/firebase.js` | Firebase app init; exports `firebaseAuth`, `firestore`. Config is inlined. |
| `js/data/storageService.js` | `localStorage` collection layer + optional Firestore mirroring. The persistence backbone. |
| `js/data/seedData.js` | First-run seed records for every collection. |
| `js/ai/squatConstants.js` | Shared pose landmark indices + camera thresholds reused across most AI modules. |
| `js/ai/poseMath.js` | Shared angle/visibility/framing helpers (`calculateAngle`, `getBodyReadiness`, `getFramingDistanceHint`). |
| `js/ai/detectionStability.js` | Shared debounced detection-stability tracker. |
| `js/ai/shared/cameraController.js`, `js/ai/squatCameraController.js` | MediaPipe camera lifecycle (`createSquatCameraController`) reused by squat, HP02, shoulder, and every later exercise. |

---

## Patient IA (information architecture / navigation)

State lives in one module-level object `state` in `app.js`
(`state.route`, `state.tab`, `state.user`, plus per-feature scratch fields).
There is **no history API / URL routing** — navigation is `state.* = …;
render()`.

| Concern | Where |
|---|---|
| Tab model | `BASE_TABS` (`app.js:1257`) = `home` / `data` / `profile`; the middle tab is injected per-role by `renderNav()` (`app.js:~1402`): patient `work`→「訓練」, therapist `work`→「檔案」. Four tabs total. |
| Bottom navigation render | `renderNav()` → `<nav class="bottom-nav">`, buttons call `switchTab('<key>')` |
| Tab switch | `switchTab(tab)` (`app.js:3930`) — sets `state.route="dashboard"`, `state.tab=tab`, `render()` |
| Shell wrapper | `phone(content, withNav)` (`app.js:1393`) — wraps page HTML, appends `renderNav()` when `withNav` |
| Route dispatch | `render()` — first defined ~`app.js:3807`, **fully redefined at `app.js:9649`**, then reassigned ~55 more times (see warnings). Maps `state.route` → `app.innerHTML = phone(<page>())`. |
| Tab → page body | `renderDashboard()` (`app.js:3791`): `state.tab` `home`→`patientHome()`/`therapistHome()`; `work`→`todaySchedulePage()`/`therapistFilesPage()`; `data`→`dataPage()`; else `profilePage()` |
| **Home** (首頁) | patient: `patientHome()` render helpers (`renderDashboard`, home card builders ~`app.js:8600`+). Hosts the AI Functional Assessment entry card, level/XP, schedule card, self-practice section, progress + achievements. |
| **Training** (訓練, tab key `work`) | `todaySchedulePage()` (patient) / `therapistFilesPage()` (therapist). Also the landing tab for `todaysRecommendation`, `selfPracticeLibrary`, `schedule`, `exerciseDetail`, all `*Detection` training routes (they set `state.tab="work"`). |
| **Data** (數據, tab key `data`) | `dataPage()`; sub-pages `analysisPage()` (`app.js:2383`), `historyPage()` (`app.js:2420`), `heatmapPage()`, `actionRecordsPage()` (`app.js:2638`). |
| **My** (我的, tab key `profile`) | `profilePage()` (`app.js:3693`); entry point to assessment update/reassess, 冒險地圖 (`rehabMapPage`), rewards, achievements, dev accounts. |
| Landing decision | `determinePatientLandingRoute(user)` (`app.js:1474`): patient with an active assessment → `dashboard`, else → `patientAssessmentIntro`. Non-patient → `dashboard`. Initial `state.route` = `"splash"`. |
| Auth gating | `renderAuth()` (`app.js`), `renderSplash()`, `authService` (`onAuthStateChanged`). |

Full `state.route` value set (from the `render()` chain): `splash`, `auth`,
`dashboard`, `squat`, `analysis`, `history`, `heatmap`, `records`,
`achievements`, `caseList`, `caseDetail`, `assignPlan`, `schedule`, `reward`,
`map`, `scheduleTracking`, `exerciseDetail`, `detectionPrep`, `squatDetection`,
`hp02Detection`, `hp02TrainingDetection`, `devAccounts`,
`patientAssessmentIntro`, `patientAssessmentForm`, `patientAssessmentSummary`,
`assessmentSettings`, `selfPracticeLibrary`, `todaysRecommendation`,
`functionalAssessmentBodyRegion`, `functionalAssessmentShoulderPrep`,
`functionalAssessmentShoulderIntro`, `functionalAssessmentShoulderSession`,
`functionalAssessmentShoulderComplete`, `trainingRecordDetail`, plus one
`<xx>Detection` route per AI exercise added by each extension block
(`cr01Detection` … `ak15Detection`, `sh01Detection` … `sh07Detection`, etc.).

---

## Functional Assessment

Two **unrelated** "assessment" domains exist; naming is kept deliberately
distinct:

- **`patientAssessment*` / `assessmentService`** — the preference
  questionnaire (`bodyParts` / `goals` / `abilityLevel` /
  `preferredSessionMinutes`). This is what the Recommendation Engine reads.
- **`functionalAssessment*` / `functionalAssessmentService`** — the new "AI
  Dynamic Functional Assessment" journey (shoulder camera flow).

| Concern | Where |
|---|---|
| Six-region selector | `FUNCTIONAL_ASSESSMENT_REGIONS` (`app.js:~4697`); `functionalAssessmentBodyRegionPage()` (`app.js:4729`); `renderFunctionalAssessmentRegionButton()`; entry `goFunctionalAssessmentBodyRegion()` (`app.js:4665`). |
| Region → session | `selectFunctionalAssessmentBodyRegion(region)` (`app.js:~4678`) → `functionalAssessmentService.create({patientId, bodyRegion})` → route `functionalAssessmentShoulderPrep`. Only `"shoulder"` is wired. |
| Shoulder flow pages | `functionalAssessmentShoulderPrepPage()` (`app.js:4754`) → `…IntroPage()` (`app.js:5885`) → `…SessionPage()` (`app.js:5926`) → `…CompletePage()` (`app.js:6048`) |
| Movement list | `FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS` (`app.js:4787`) — **2 movements**: `shoulder_flexion` (肩關節前屈, side view) and `shoulder_abduction` (肩關節外展, front view). Index in `state.functionalAssessmentShoulderMovementIndex`. |
| Movement nav | `startFunctionalAssessmentShoulderSession()`, `goFunctionalAssessmentShoulderSessionBack()`, `advanceFunctionalAssessmentShoulderMovement()` (`app.js:~4809–4886`) |
| **Protocol / config** | `js/ai/exercises/shoulder/constants.js` — `SHOULDER_LANDMARK_INDEX`, `CAMERA_READY_LANDMARKS` (upper-body only, hips deliberately excluded — Phase 7.3A.1), `SHOULDER_MEASUREMENT_LANDMARKS` (per-side `core` / `validity` / `optionalQuality`), `SHOULDER_CAMERA_THRESHOLDS` (camera/readiness only — **no clinical ROM thresholds**). |
| **Geometry** | `js/ai/exercises/shoulder/poseMath.js` — `computeShoulderMeasurementObservation()` (imported by `app.js:241`). Pure geometry/observation only: "what angle is currently formed" + "which landmarks are available". Reuses shared `calculateAngle()`. |
| **Classifier** | **Does not exist.** Both `constants.js` and `poseMath.js` state a movement-start / endpoint / return classifier is out of scope pending real thresholds (Phase 7.3B.2A). No file derives `SHOULDER_MEASUREMENT_SIGNAL` from pose data. |
| **FSM (measurement session)** | `js/ai/exercises/shoulder/measurementSession.js` — `createShoulderMeasurementSession()`, `SHOULDER_MEASUREMENT_PHASE` (`waiting-for-movement` → `movement-in-progress` → `endpoint-hold` → `returning` → `attempt-complete`), driven by abstract `SHOULDER_MEASUREMENT_SIGNAL` values. Pure, DOM/camera/persistence-free. In production `app.js` `handleShoulderFrame()` calls `processFrame({signal: null})` **every frame** — the FSM never actually advances outside tests / the debug bridge `injectShoulderMeasurementSignalForTesting()` (`app.js:5859`). |
| Calibration | `js/ai/exercises/shoulder/calibrationSession.js` — `createShoulderCalibrationSession()`, `SHOULDER_CALIBRATION_MOVEMENT` (imported by `app.js:242`). Dev/QA landmark-quality panel: `classifyShoulderCalibration*()` (`app.js:5494–5630`), `functionalAssessmentShoulderCalibrationPanelHtml()` (`app.js:6013`), per-frame hook `app.js:~5733`. Never writes assessment data. |
| Camera controller | `handleShoulderFrame()` (`app.js:5160`); ephemeral module-level state `shoulderCameraPhase` (`"instruction" | "camera-requesting" | "camera-loading" | "positioning" | "ready-confirmation" | "countdown" | "measurement-ready" | "camera-error"`); `shoulderMeasurementSession` var (`app.js:4936`); readiness via shared `detectionStability.js` + `poseMath.js` framing hints. |
| **Persistence** | `functionalAssessmentService` (`js/data/functionalAssessmentService.js`). Collection `functionalAssessmentSessions` (Firestore-mirrored). Record schema is **only** `{id, patientId, bodyRegion, status:"started", startedAt}`. No movements, angles, findings, scores, or completion are ever written — the Session and Complete pages persist nothing. |
| **Result** | `functionalAssessmentShoulderCompletePage()` renders a static "next step" screen. No measured result is produced or stored. |
| **Findings / functional profile** | **Not implemented.** No `functionalFindings`, `functionalProfile`, or `performanceContext` symbol exists anywhere in `js/` or `app.js`. |
| **Recommendation plan from functional assessment** | **No link exists.** The Recommendation Engine consumes only `patientAssessment` (questionnaire) data; it has no input path from `functionalAssessmentSessions`. |

---

## Squat (LE01 — the reference AI implementation)

Only exercise id `LE01` ("深蹲") routes to the real MediaPipe squat pipeline
(`SQUAT_EXERCISE_ID`, `isSquatExercise()` in `js/data/exerciseService.js`).

| Concern | Where |
|---|---|
| Route / page | `state.route === "squat"` → `renderSquat()` (`app.js:3802`); detection page `squatDetectionPage()` (`app.js:7056`); entry `goSquatDetection()` (`app.js:7120`); prep `detectionPrepPage()` |
| Camera | `js/ai/squatCameraController.js` (`createSquatCameraController`) + `js/ai/shared/cameraController.js`; module-level `squatCameraController`, `squatSessionTracker`, `squatSessionMeta` (`app.js:6967`+); frame handler `handleSquatFrame()` |
| Tracker / rep FSM | `js/ai/squatSession.js` (`createSquatSession(targetReps)`) |
| Pose math | `js/ai/poseMath.js` (shared) + `js/ai/squatConstants.js` (`SQUAT_THRESHOLDS`, `SQUAT_REQUIRED_LANDMARKS`, `POSE_LANDMARK_INDEX`, `SQUAT_ANALYSIS_MODE`) |
| Thresholds | `SQUAT_THRESHOLDS` in `js/ai/squatConstants.js` (depth/lean/valgus angles, `MIN_VISIBILITY`, `INFERENCE_INTERVAL_MS`, `DETECTION_GRACE_MS`, `COUNTDOWN_SECONDS`, voice cooldowns) |
| Quality / scoring | `js/ai/squatQuality.js` (`SQUAT_QUALITY_ISSUE*`), `js/ai/squatScore.js` (`calculateSquatScore`, `buildSquatRemark`, `buildSquatQualityExplanation`) |
| Feedback / voice / companion | `js/ai/squatFeedback.js`, `js/ai/squatFeedbackContent.js`, `js/ai/squatVoicePolicy.js`, `js/ai/squatVoiceProfile.js`, `js/ai/squatMilestones.js`, `js/ai/squatRobotCompanion.js` (`pickSquatRobotState`), `js/ai/squatTrainingState.js` (`SQUAT_TRAINING_STATE` FSM: LOADING→…→COMPLETING→SUCCESS) |
| Stop guarantee | `enterSquatSuccessState()` (`app.js:~8315`) — hard-stops the camera rAF loop the frame `targetReps` is reached; `finalizeSquatTraining()` (`app.js:8297`) |
| **Persistence** | `persistSquatSession()` → `analysisService.create({… analysisMode: SQUAT_ANALYSIS_MODE, source, totalReps, targetReps, validReps, score, overallScore, quality, remark, repRecords, summary{…} …})` (`app.js:~8206`). Collection `analysisRecords` (Firestore-mirrored). Also `scheduleService.updateExerciseAt()` when assigned, and `gameService.addXp()` + `gamificationEngine`. |
| **Result** | `renderAnalysisResultSection(record, ex)` (base) → squat branch at `app.js:6445` / `app.js:728`; ending screen `showSquatEndingScreen()`. |

---

## HP02 (站姿髖屈曲 — second real AI prototype)

**Two distinct HP02 code paths coexist:**

1. **`hp02Detection` route — pose-analysis *prototype*** (Phase 5.6.x).
   - `js/ai/exercises/hipFlexion/constants.js` (`HP02_REQUIRED_LANDMARKS`),
     `js/ai/exercises/hipFlexion/poseMath.js` (`computeHipFlexionAngles`),
     `js/ai/exercises/hipFlexion/session.js` (`createHipFlexionSession`).
   - `app.js`: `hp02CameraController` (`app.js:9005`), page render ~`app.js:9046`,
     rep-FSM counting, `hp02DetectionPage()`.
   - "landmarks / engineering-only, no clinical values yet" per its own header.

2. **`hp02TrainingDetection` route — persistent training** (later phase).
   - `js/ai/exercises/standingHipFlexion/{constants,poseMath,session,score}.js`
     (`HP02_TRAINING_THRESHOLDS`, `HP02_ANALYSIS_MODE`, `DEFAULT_HP02_REWARD_XP`,
     `computeStandingHipFlexionMetrics`, `createStandingHipFlexionSession`,
     `calculateStandingHipFlexionScore`, `buildStandingHipFlexionRemark`).
   - `app.js:10241–10251` (minified extension block): `goHp02TrainingDetection()`,
     `hp02TrainingPage()`, `beginHp02TrainingCamera()`, `handleHp02TrainingFrame()`,
     `persistHp02Training()`, `finalizeHp02Training()`.
   - **Persistent**: `persistHp02Training()` writes an `analysisRecords` row with
     `analysisMode: HP02_ANALYSIS_MODE` (left/right reps, `validReps`, score,
     `repRecords`, `summary`), updates the schedule when assigned, adds XP.
   - `window.goHp02Detection` is reassigned to `goHp02TrainingDetection` at
     `app.js:10251`, so the catalog camera CTA now reaches the persistent path.

Test: `tests/hp02TrainingSession.test.js` covers the `standingHipFlexion`
session (the persistent path).

---

## Recommendation

Pure, rule-based, fully explainable. **No LLM. No functional-assessment
input. No performance/history input.** Inputs are exactly the four
`patientAssessment` fields.

| Concern | Where |
|---|---|
| Engine (pure) | `js/data/recommendationEngine.js` — `generateRecommendationForAssessment(assessment, candidates, opts)`, `scoreExerciseForAssessment()`, `buildSession()`, `buildRecommendationReason()`, `estimateExerciseMinutes()`. `RECOMMENDATION_CONFIG` weights: bodyPart 4, goal 4, difficulty exact 3 / adjacent 1, duration 1, aiSupported 0.5; session 3–5 items; duration tolerance band 0.8–1.2× `preferredSessionMinutes`. |
| **Assessment input** | `assessment.bodyParts` (HARD filter — cross-region never recommended), `assessment.goals`, `assessment.abilityLevel` (+ one-step `DIFFICULTY_ADJACENCY` fallback, also a hard exclude), `assessment.preferredSessionMinutes`. From `assessmentService.getActiveByPatientId()`. |
| **Functional findings input** | None (does not exist — see Functional Assessment section). |
| **Performance-context input** | None. No reading of `analysisRecords` / history into recommendation scoring. |
| Candidate pool | `exerciseService.listNormalizedWithKnownGoals()` (`js/data/exerciseService.js`) — all 60 catalog items normalized, with a 9-item manual `goal` overlay (`js/data/phase1SchemaTestData.js`) layered on items whose real `goal` is `null` (currently all of them). |
| Scoring | `scoreExerciseForAssessment()` → `{score, matchDetails}` (every rule that fired is exposed; nothing opaque). |
| **Cache / determinism** | `recommendationService.getTodaysRecommendation({patientId, assessment, dateStr, candidates})` (`js/data/recommendationService.js`): same day + same `assessmentId` + same `assessment.updatedAt` → returns the stored result unchanged; otherwise runs the engine and persists. Engine variation is a seeded hash (`seedKey = patientId:assessmentId:dateStr`), never `Math.random()`. |
| **Plan creation / storage** | `recommendationService.create()` → collection `recommendationResults` (Firestore-mirrored). Item shape: `{exerciseId, reason, suggestedSets, suggestedReps, suggestedDuration, section:"main", score}`. `RECOMMENDATION_TYPES = ["self_practice","therapist_plan"]`; statuses `draft|accepted|dismissed` (no enforced workflow). All items land in `section:"main"` — no warmup/cooldown classification exists in the data. |
| UI | `todaysRecommendationPage()` (`app.js:~4655`), entry `goTodaysRecommendation()` (`app.js:4648`, sets `tab="work"`). |
| Note | `analysisRecord.recommendations: string[]` is an **unrelated** legacy per-session free-text-tips field — not this system. |

---

## Exercise Catalog

| Question | Answer (derived from the repo) |
|---|---|
| Authoritative runtime file | **`js/data/rehabExercises.js`** — `export const rehabExercises = [...]`. The app never reads any `.xlsx` at runtime. |
| Origin file | `.claude/docs/rehab_database.xlsx` (converted once into `rehabExercises.js`; header comment says so). Also `.claude/docs/shoulder_rom_domain_spec.xlsx` for the shoulder ROM domain spec. Both included in this package. |
| Access layer | `js/data/exerciseService.js` — `exerciseService.list()/getById()/listNormalized()/listNormalizedWithKnownGoals()`, `normalizeExercise()`, `getDifficultyTier()`, `resolvePoseAnalyzer()`, `POSE_ANALYZER` map. |
| **Current number of exercises** | **60** distinct `exercise_id` records in `rehabExercises.js`: `AD01–AD12` (12), `AK01–AK15` (15), `CR01–CR08` (8), `HP01–HP10` (10), `KN03` (1), `LE01–LE07` (7), `SH01–SH07` (7). |
| Raw fields per record (from `.xlsx`, snake_case, verbatim) | `exercise_id, exercise_name, category, target_muscle, difficulty, description, steps, common_errors, repetitions, sets, estimated_minutes, precautions, reference_source, demo_video_url, key_points, correct_angle, angle_tolerance, cnn_label` |
| Derived / default fields (camelCase) | `defaultSets, defaultRepetitions, defaultDurationSeconds, measurementType ("repetition"|"duration"), cameraAngle, analysisRequired, rewardXp, rewardStars, trainingMode` |
| Normalized schema (`normalizeExercise()`) | `{id, exerciseId, name, bodyPart(=category), goal, difficulty, duration, sets, reps, instructions(=steps), precautions, aiSupported, gameSupported(=false), gameSupportPlanned, video, raw}` |
| **Goal metadata** | **PARTIAL.** The catalog has **no `goal` field at all**. `goal` is `null` for every record from `normalizeExercise()`. A manual overlay in `js/data/phase1SchemaTestData.js` (`PHASE1_TEST_EXERCISE_GOALS`) tags exactly **9** ids (`LE01, LE05, HP01, LE03, LE04, SH01, SH04, HP10, CR01`) with `肌力 / 活動度 / 平衡`. Only those 9 can ever score a goal match; the other 51 never do. |
| Difficulty values | Raw Chinese `非常容易 / 易 / 普通 / 難`, mapped for comparison to `beginner / intermediate / advanced` via `DIFFICULTY_TIER_MAP` (note: `非常容易` and `易` both → `beginner`). |
| `aiSupported` | Computed in `normalizeExercise()` as an explicit id allow-list (squat `LE01` + ~55 more ids). This is what the engine's `AI_SUPPORTED_BONUS` reads. |
| Stale count reference | `exerciseService.js` comments repeatedly say **"44-item catalog"** / "43 non-squat exercises"; the actual array now holds **60**. Comment/data drift — see warnings. |

---

## Persistence / data services

Backbone: `js/data/storageService.js`.

- `createCollection(name, seedFn)` → `{list, getById, find, query, create,
  update, remove, replaceAll, reset}` backed by `localStorage` key
  `remotion_collection_<name>` (JSON). `storageService.getItem/setItem` use
  `remotion_<key>`.
- **Optional Firestore mirror** for `CLOUD_COLLECTIONS` =
  `therapistPatientRelations, schedules, analysisRecords, patientAssessments,
  recommendationResults, functionalAssessmentSessions`. On `create`/`update`,
  `persistRecord()` `setDoc`s to Firestore when a `cloudUser` is set;
  `hydrateCloudForUser(user)` pulls them back into `localStorage` at login
  (queries by `patientId` / `therapistId`, therapist also fans out to linked
  patients via relations). Seed/demo data, users, and gamification/XP are
  **not** cloud-synced.

| Service | File | Collection(s) / storage | Seeded? |
|---|---|---|---|
| `authService` | `js/data/authService.js` | Firebase Auth + Firestore `users` / `publicUsers` | — |
| `userService` | `js/data/userService.js` | `users` (localStorage) | `seedUsers` |
| `relationService` | `js/data/relationService.js` | `therapistPatientRelations` (cloud) | `seedTherapistPatientRelations` |
| `scheduleService` | `js/data/scheduleService.js` | `schedules` (cloud) | `seedSchedules` |
| `analysisService` | `js/data/analysisService.js` | `analysisRecords` (cloud) | `seedAnalysisRecords` |
| `assessmentService` | `js/data/assessmentService.js` | `patientAssessments` (cloud) | none (starts empty) |
| `recommendationService` | `js/data/recommendationService.js` | `recommendationResults` (cloud) | none |
| `functionalAssessmentService` | `js/data/functionalAssessmentService.js` | `functionalAssessmentSessions` (cloud) | none |
| `gameService` | `js/data/gameService.js` | `gameProfiles` (localStorage only) | `seedGameProfiles` (legacy hand-authored numbers) |
| `gamificationEngine` | `js/data/gamificationEngine.js` | **derives only** — pure recompute from `analysisRecords` + `schedules`; persists nothing | n/a |
| `storageService` | `js/data/storageService.js` | all of the above + `firebase.js` | — |

Note: `gamificationEngine` (Phase 4, `XP_PER_EXERCISE = 10`) explicitly
supersedes `gameService` (legacy seeded `level 12 / 3850 XP`) as the display
source of truth, but `gameService.addXp()` is still called on training
completion. Two XP notions coexist.

---

## Current six-region definition

From `FUNCTIONAL_ASSESSMENT_REGIONS` in `app.js` (the production list, in order):

| key | label | `available` | icon |
|---|---|---|---|
| `shoulder` | 肩部 | **true** | `medical_shoulder.png` |
| `neck` | 頸部 | false | `medical_neck.png` |
| `trunk` | 腰背／軀幹 | false | `medical_spine.png` |
| `hip` | 髖部 | false | `medical_hip.png` |
| `knee` | 膝部 | false | *(none — `icon: null`, CSS fallback)* |
| `ankle` | 踝部 | false | `medical_ankle.png` |

`functionalAssessmentService.FUNCTIONAL_ASSESSMENT_BODY_REGIONS` is
`["shoulder"]` and `create()` rejects any other `bodyRegion` defensively.

---

## Known implemented assessment regions

| Region | Status in current code |
|---|---|
| **Shoulder** | **Partially functional.** UI flow (region → prep → intro → session → complete) is real; camera + readiness + framing + calibration panel are real; pure geometry (`computeShoulderMeasurementObservation`) and the measurement FSM exist. **But**: no movement classifier (pose → signal) exists, the FSM is fed `signal: null` in production, no ROM/angle result is computed for the patient, and `functionalAssessmentSessions` only stores a `{id, patientId, bodyRegion, status, startedAt}` shell. Effectively a data-collection/UX skeleton, not a scoring assessment. |
| Neck, Trunk, Hip, Knee, Ankle | **Placeholder only.** Rendered as disabled buttons ("即將推出"), no `onclick`, no session creation, no code path. |

---

## Important architecture warnings

*Observed in the current code only. No fixes proposed here.*

1. **Monolithic `app.js` (~11,126 lines / ~1.2 MB).** State object, router,
   every page's HTML, every camera/training controller, and all extension
   glue live in one ES module.

2. **Monkey-patch extension chains rebind core functions ~50+ times.**
   After `render` is fully defined at `app.js:9649`, it is reassigned via
   `const renderBeforeXX = render; render = function(){ if (state.route ===
   "<xx>Detection") … else renderBeforeXX(); }` roughly 55 more times
   (one per AI exercise: `cr01`–`cr08`, `sh01`–`sh07`, `hp01`–`hp10`,
   `ad01`–`ad12`, `ak01`–`ak15`, `le02`–`le07`, `kn03`, …). The same
   sequential-override pattern is applied to `openCameraPlaceholder`,
   `renderAnalysisResultSection`, `buildTrainingHistoryEntry`, and
   `renderGenericRecordDetail`. Control flow for any of these functions is a
   ~50-deep decorator stack; ordering is load-order dependent.

3. **`render()` is defined at least three times** (early partial dispatch
   ~`app.js:3807`, full redefinition `app.js:9649`, then the override chain),
   and `window.openCameraPlaceholder` / `window.goHp02Detection` etc. are
   reassigned late in the file.

4. **Two parallel HP02 implementations** (`hipFlexion/*` prototype via
   `hp02Detection` vs `standingHipFlexion/*` persistent via
   `hp02TrainingDetection`), with `window.goHp02Detection` repointed to the
   training path at `app.js:10251`. Both sets of modules remain in the tree.

5. **Exercise-count source-of-truth drift.** `js/data/exerciseService.js`
   comments describe a "44-item" / "43 non-squat" catalog; `rehabExercises.js`
   actually contains 60 records.

6. **Catalog has no `goal` taxonomy.** Recommendation goal-matching relies
   entirely on a 9-item hand-authored overlay in `phase1SchemaTestData.js`
   (a file whose own header says it is "NOT new production exercise data").
   51 of 60 exercises can never score a goal match.

7. **Recommendation ↔ Functional Assessment are disconnected.** The
   "Baseline → Findings → Functional Profile → Recommendation" journey named
   in `functionalAssessmentService.js`'s own doc comment has no code: no
   findings/profile module, and the engine has no functional-assessment input.

8. **Functional assessment persists almost nothing.** The shoulder Session
   and Complete pages write no movement, angle, quality, or completion data;
   `status` stays `"started"` forever.

9. **Shoulder measurement FSM is inert in production.** `handleShoulderFrame()`
   always passes `signal: null`; the FSM can only advance via the debug-only
   `injectShoulderMeasurementSignalForTesting()` / test harness.

10. **`README.md` does not describe this codebase** (claims React/Tailwind/
    Recharts/Node/Express/MongoDB/Gemini; actual stack is vanilla ESM + Vite
    + Firebase + MediaPipe). Misleading as an architecture reference.

11. **Known, code-flagged limitation:** `getFramingDistanceHint()`
    (`js/ai/poseMath.js`) hardcodes its TOO_CLOSE/TOO_FAR bbox bounds as
    numeric literals not read from its `thresholds` argument, so per-exercise
    camera-distance recalibration is not achievable by passing a different
    thresholds object (documented in `js/ai/exercises/shoulder/constants.js`).

12. **Dev/QA surfaces ship in the app bundle:** `devAccountsPage()` /
    `state.route === "devAccounts"`, the shoulder calibration panel, and
    `window.*ForTesting` bridges are all in `app.js`.

13. **Firebase web config is committed** in `js/data/firebase.js` (expected
    for a Firebase web client; access control depends on `firestore.rules`,
    which is present and brief).

14. **No `vite.config.*`, no lint/test runner config.** Tests are 59
    standalone `node tests/xxSession.test.js` scripts wired individually into
    `package.json` scripts (no aggregate `test` script).
