# Graph Report - .  (2026-08-10)

## Corpus Check
- 37 files · ~60,730 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 569 nodes · 1286 edges · 29 communities (21 shown, 8 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Auth & Account Flow Actions
- HP02 Camera Lifecycle
- Home Greeting & App Constants
- Squat Camera Lifecycle & Countdown
- Core Data Services (Assessment/Analysis/Auth)
- Training History & Weekly Progress
- Exercise Catalog Normalization
- Exercise Detail & Schedule Helpers
- Training Navigation Routes
- Shoulder Remote Camera UX (Phase 7.3A/7.3A.1)
- Squat Feedback & Training State Machine
- Recommendation Engine
- Therapist Assign-Plan Draft
- Dashboard & Home Page Renderers
- Auth & Navigation Rendering
- Preference Assessment Wizard
- SPA Bootstrap (index.html)
- Login & Landing Route
- Self-Practice Filter Reset
- Dev Account Copy Helpers
- Assessment Start Variants
- Analysis Page Metric Bar
- Image Fallback Handling
- Achievement Badge Page
- Body Region Selection UI
- Shoulder Session Page
- Shoulder Intro/Back Navigation
- History Page Row Renderer
- Therapist Schedule Tracking

## God Nodes (most connected - your core abstractions)
1. `render()` - 116 edges
2. `handleSquatFrame()` - 23 edges
3. `beginSquatCameraSession()` - 17 edges
4. `actionRecordsPage()` - 15 edges
5. `todayStr()` - 14 edges
6. `selfPracticeLibraryPage()` - 13 edges
7. `nowIso()` - 13 edges
8. `exerciseDetailPage()` - 12 edges
9. `persistSquatSession()` - 12 edges
10. `todaySchedulePage()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `executeTherapistTransfer()` --calls--> `nowIso()`  [EXTRACTED]
  app.js → js/utils/id.js
- `beginShoulderCameraSession()` --calls--> `createDetectionStabilityTracker()`  [EXTRACTED]
  app.js → js/ai/detectionStability.js
- `beginShoulderCameraSession()` --calls--> `createSquatCameraController()`  [EXTRACTED]
  app.js → js/ai/shared/cameraController.js
- `beginShoulderCameraSession()` --calls--> `createVoicePolicyTracker()`  [EXTRACTED]
  app.js → js/ai/shared/voicePolicy.js
- `renderAnalysisResultSection()` --calls--> `calculateQualityRatioPercent()`  [EXTRACTED]
  app.js → js/ai/squatScore.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **SPA bootstrap: document loads styles/manifest and mounts app.js into #app** — index_document, index_app_mount, index_app_js, index_styles_css [INFERRED 0.85]

## Communities (29 total, 8 thin omitted)

### Community 0 - "Auth & Account Flow Actions"
Cohesion: 0.03
Nodes (67): assignPlanPage(), backToAssessmentFormFromSummary(), backToChooseRole(), backToTrain(), browseAllSelfPracticeExercises(), cancelEditAccount(), cancelPatientLeave(), cancelRelationAction() (+59 more)

### Community 1 - "HP02 Camera Lifecycle"
Cohesion: 0.06
Nodes (47): beginHp02CameraSession(), drawHp02Skeleton(), handleHp02CameraStatus(), handleHp02FatalError(), handleHp02Frame(), createDetectionStabilityTracker(), DETECTION_DISPLAY_STATE, HP02_ENGINEERING_DEFAULTS (+39 more)

### Community 2 - "Home Greeting & App Constants"
Cohesion: 0.04
Nodes (28): ABILITY_LEVEL_OPTIONS, app, BASE_TABS, BODY_PART_DISPLAY_ORDER, CATEGORY_ICON_MAP, COMPLETE_REASONS, DIFFICULTY_DISPLAY_MAP, DIFFICULTY_TIER_OPTIONS (+20 more)

### Community 3 - "Squat Camera Lifecycle & Countdown"
Cohesion: 0.05
Nodes (54): beginSquatCameraSession(), beginSquatCountdown(), beginSquatReadyHold(), cancelSquatCountdown(), cancelSquatReadyHold(), drawSquatSkeleton(), enterSquatIncompleteState(), enterSquatSuccessState() (+46 more)

### Community 4 - "Core Data Services (Assessment/Analysis/Auth)"
Cohesion: 0.07
Nodes (39): completeScheduleExercise(), submitAssignPlan(), validateAssignDraft(), ANALYSIS_RECORD_SOURCES, analysisRecordsCollection, analysisService, ABILITY_LEVELS, ASSESSMENT_STATUS (+31 more)

### Community 5 - "Training History & Weekly Progress"
Cohesion: 0.06
Nodes (52): actionRecordsPage(), buildRecommendationHeadlineText(), buildTrainingHistoryEntry(), buildWeekdayStrip(), buildWeeklyActivityMicrocopy(), buildWeeklyComparisonLabel(), buildWeeklyTrainingProgress(), buildWeekStripDates() (+44 more)

### Community 6 - "Exercise Catalog Normalization"
Cohesion: 0.10
Nodes (33): cleanText(), DIFFICULTY_TIER_MAP, exerciseService, HP02_EXERCISE_ID, isSquatExercise(), normalizeExercise(), POSE_ANALYZER, resolvePoseAnalyzer() (+25 more)

### Community 7 - "Exercise Detail & Schedule Helpers"
Cohesion: 0.09
Nodes (25): assessmentStepDots(), buildCompactRecommendationReason(), calculateScheduleSummary(), estimateExerciseMinutes(), getAssessmentBodyPartOptions(), getAssessmentGoalOptions(), getDifficultyDisplay(), getFilteredSelfPracticeExercises() (+17 more)

### Community 8 - "Training Navigation Routes"
Cohesion: 0.14
Nodes (23): calculateSquatTargetReps(), detectionPrepPage(), exerciseDetailPage(), getExercisePageContext(), getExerciseReturnRoute(), getSelectedScheduleExercise(), goDetectionPrep(), goHp02Detection() (+15 more)

### Community 9 - "Shoulder Remote Camera UX (Phase 7.3A/7.3A.1)"
Cohesion: 0.15
Nodes (21): advanceFunctionalAssessmentShoulderMovement(), beginShoulderCameraSession(), beginShoulderCountdown(), beginShoulderReadyHold(), cancelShoulderCountdown(), cancelShoulderReadyHold(), handleShoulderCameraStatus(), handleShoulderFatalError() (+13 more)

### Community 10 - "Squat Feedback & Training State Machine"
Cohesion: 0.10
Nodes (18): resolveSquatFeedback(), speakSquatFeedbackIfAppropriate(), triggerSquatMilestoneBadge(), updateSquatPrimaryFeedback(), updateSquatRobotCompanion(), SQUAT_TRAINING_EVENT, SQUAT_TRAINING_STATE, TRANSITIONS (+10 more)

### Community 11 - "Recommendation Engine"
Cohesion: 0.25
Nodes (15): summarizeRecommendationItems(), getDifficultyTier(), ABILITY_LABELS, buildDeterministicPoolOrder(), buildRecommendationReason(), buildSession(), estimateExerciseMinutes(), generateRecommendationForAssessment() (+7 more)

### Community 12 - "Therapist Assign-Plan Draft"
Cohesion: 0.15
Nodes (13): addExerciseToAssignDraft(), buildDefaultScheduleTitle(), confirmLeaveAssignDraft(), confirmRelationAction(), generateScheduleGoal(), goAssignPlan(), goCaseDetail(), goCaseList() (+5 more)

### Community 13 - "Dashboard & Home Page Renderers"
Cohesion: 0.17
Nodes (12): dataPage(), devAccountsPage(), getPatientRelationStatus(), patientHome(), profilePage(), renderDashboard(), renderDevDataMaintenanceSection(), renderPatientCareHistory() (+4 more)

### Community 14 - "Auth & Navigation Rendering"
Cohesion: 0.20
Nodes (10): phone(), renderAuth(), renderAuthChooseMode(), renderAuthChooseRole(), renderAuthForm(), renderAuthRegisterSuccess(), renderNav(), renderSplash() (+2 more)

### Community 15 - "Preference Assessment Wizard"
Cohesion: 0.25
Nodes (8): confirmAssessment(), getOrInitAssessmentDraft(), goAssessmentNextStep(), patientAssessmentSummaryPage(), selectAssessmentAbility(), selectAssessmentDuration(), toggleAssessmentBodyPart(), toggleAssessmentGoal()

### Community 16 - "SPA Bootstrap (index.html)"
Cohesion: 0.40
Nodes (5): app.js (module entry script), #app mount div, manifest.json (web app manifest link), ReMotion Web App (page title), styles.css (stylesheet link)

### Community 17 - "Login & Landing Route"
Cohesion: 0.40
Nodes (5): determinePatientLandingRoute(), goAuth(), goLandingPrimaryCta(), login(), setSession()

### Community 18 - "Self-Practice Filter Reset"
Cohesion: 0.67
Nodes (3): backToSelfPracticeDiscovery(), clearSelfPracticeFilters(), resetSelfPracticeFilterFields()

### Community 19 - "Dev Account Copy Helpers"
Cohesion: 0.67
Nodes (3): copyDevAccountPassword(), copyDevAccountsText(), copyDevAccountText()

### Community 20 - "Assessment Start Variants"
Cohesion: 0.67
Nodes (3): startAssessmentForm(), startAssessmentReassess(), startAssessmentUpdate()

## Knowledge Gaps
- **63 isolated node(s):** `app`, `WEEKDAY_LABELS`, `MONTH_ABBR`, `SCHEDULE_STATUS_LABELS`, `SCHEDULE_STATUS_CLASSES` (+58 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `render()` connect `Auth & Account Flow Actions` to `Home Greeting & App Constants`, `Squat Camera Lifecycle & Countdown`, `Core Data Services (Assessment/Analysis/Auth)`, `Training History & Weekly Progress`, `Training Navigation Routes`, `Shoulder Remote Camera UX (Phase 7.3A/7.3A.1)`, `Therapist Assign-Plan Draft`, `Dashboard & Home Page Renderers`, `Auth & Navigation Rendering`, `Preference Assessment Wizard`, `Login & Landing Route`, `Self-Practice Filter Reset`, `Assessment Start Variants`, `Analysis Page Metric Bar`, `Achievement Badge Page`, `Shoulder Intro/Back Navigation`, `History Page Row Renderer`?**
  _High betweenness centrality (0.020) - this node is a cross-community bridge._
- **Why does `estimateExerciseMinutes()` connect `Recommendation Engine` to `Home Greeting & App Constants`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `computeHipFlexionAngles()` connect `HP02 Camera Lifecycle` to `Home Greeting & App Constants`?**
  _High betweenness centrality (0.003) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `beginSquatCameraSession()` (e.g. with `handleSquatCameraStatus()` and `handleSquatFatalError()`) actually correct?**
  _`beginSquatCameraSession()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `app`, `WEEKDAY_LABELS`, `MONTH_ABBR` to the rest of the system?**
  _63 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Auth & Account Flow Actions` be split into smaller, more focused modules?**
  _Cohesion score 0.029850746268656716 - nodes in this community are weakly interconnected._
- **Should `HP02 Camera Lifecycle` be split into smaller, more focused modules?**
  _Cohesion score 0.060109289617486336 - nodes in this community are weakly interconnected._