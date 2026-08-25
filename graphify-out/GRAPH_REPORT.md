# Graph Report - .  (2026-08-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 608 nodes · 1379 edges · 37 communities (28 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- render
- app.js
- relationService.js
- actionRecordsPage
- persistSquatSession
- beginShoulderCameraSession
- exerciseService.js
- selfPracticeLibraryPage
- exerciseDetailPage
- squatConstants.js
- gamificationEngine.js
- shoulder/poseMath.js
- handleSquatFrame
- goAssignPlan
- renderDashboard
- ai/poseMath.js
- hipFlexion/constants.js
- phone
- hipFlexion/poseMath.js
- beginSquatCameraSession
- getOrInitAssessmentDraft
- index.html
- goLandingPrimaryCta
- milestones.js
- backToSelfPracticeDiscovery
- copyDevAccountsText
- functionalAssessmentShoulderSessionPage
- startAssessmentForm
- analysisPage
- attachImageFallbacks
- patientAchievementsPage
- functionalAssessmentBodyRegionPage
- getCurrentPatientId
- goFunctionalAssessmentShoulderSessionBack
- historyPage
- previewTherapistTransfer
- therapistScheduleTrackingPage

## God Nodes (most connected - your core abstractions)
1. `render()` - 116 edges
2. `handleSquatFrame()` - 23 edges
3. `beginSquatCameraSession()` - 17 edges
4. `actionRecordsPage()` - 15 edges
5. `todayStr()` - 14 edges
6. `beginShoulderCameraSession()` - 14 edges
7. `selfPracticeLibraryPage()` - 13 edges
8. `nowIso()` - 13 edges
9. `exerciseDetailPage()` - 12 edges
10. `persistSquatSession()` - 12 edges

## Surprising Connections (you probably didn't know these)
- `buildTrainingHistoryEntry()` --calls--> `calculateQualityRatioPercent()`  [EXTRACTED]
  app.js → js/ai/squatScore.js
- `summarizeRecommendationItems()` --calls--> `estimateExerciseMinutes()`  [EXTRACTED]
  app.js → js/data/recommendationEngine.js
- `renderSquatRecordDetail()` --calls--> `calculateQualityRatioPercent()`  [EXTRACTED]
  app.js → js/ai/squatScore.js
- `executeTherapistTransfer()` --calls--> `nowIso()`  [EXTRACTED]
  app.js → js/utils/id.js
- `beginShoulderCameraSession()` --calls--> `createDetectionStabilityTracker()`  [EXTRACTED]
  app.js → js/ai/detectionStability.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **SPA bootstrap: document loads styles/manifest and mounts app.js into #app** — index_document, index_app_mount, index_app_js, index_styles_css [INFERRED 0.85]

## Communities (37 total, 9 thin omitted)

### Community 0 - "render"
Cohesion: 0.03
Nodes (67): assignPlanPage(), backToAssessmentFormFromSummary(), backToChooseRole(), backToTrain(), browseAllSelfPracticeExercises(), cancelEditAccount(), cancelPatientLeave(), cancelRelationAction() (+59 more)

### Community 1 - "app.js"
Cohesion: 0.03
Nodes (34): ABILITY_LEVEL_OPTIONS, app, BASE_TABS, BODY_PART_DISPLAY_ORDER, CATEGORY_ICON_MAP, COMPLETE_REASONS, DIFFICULTY_DISPLAY_MAP, DIFFICULTY_TIER_OPTIONS (+26 more)

### Community 2 - "relationService.js"
Cohesion: 0.06
Nodes (40): completeScheduleExercise(), goCaseDetail(), submitAssignPlan(), validateAssignDraft(), ANALYSIS_RECORD_SOURCES, analysisRecordsCollection, analysisService, ABILITY_LEVELS (+32 more)

### Community 3 - "actionRecordsPage"
Cohesion: 0.06
Nodes (48): actionRecordsPage(), buildRecommendationHeadlineText(), buildTrainingHistoryEntry(), buildWeekdayStrip(), buildWeeklyActivityMicrocopy(), buildWeeklyComparisonLabel(), buildWeeklyTrainingProgress(), buildWeekStripDates() (+40 more)

### Community 4 - "persistSquatSession"
Cohesion: 0.06
Nodes (45): beginSquatCountdown(), beginSquatReadyHold(), enterSquatIncompleteState(), enterSquatSuccessState(), exitHp02Detection(), exitSquatDetection(), finalizeSquatTraining(), goRecommendationExerciseDetail() (+37 more)

### Community 5 - "beginShoulderCameraSession"
Cohesion: 0.07
Nodes (40): advanceFunctionalAssessmentShoulderMovement(), beginShoulderCameraSession(), beginShoulderCountdown(), beginShoulderReadyHold(), cancelShoulderCountdown(), cancelShoulderReadyHold(), classifyShoulderCalibrationGuidance(), classifyShoulderCalibrationLandmarkQuality() (+32 more)

### Community 6 - "exerciseService.js"
Cohesion: 0.12
Nodes (26): cleanText(), DIFFICULTY_TIER_MAP, getDifficultyTier(), HP02_EXERCISE_ID, isSquatExercise(), normalizeExercise(), POSE_ANALYZER, resolvePoseAnalyzer() (+18 more)

### Community 7 - "selfPracticeLibraryPage"
Cohesion: 0.09
Nodes (25): assessmentStepDots(), buildCompactRecommendationReason(), calculateScheduleSummary(), estimateExerciseMinutes(), getAssessmentBodyPartOptions(), getAssessmentGoalOptions(), getDifficultyDisplay(), getFilteredSelfPracticeExercises() (+17 more)

### Community 8 - "exerciseDetailPage"
Cohesion: 0.13
Nodes (24): calculateSquatTargetReps(), detectionPrepPage(), exerciseDetailPage(), getExercisePageContext(), getExerciseReturnRoute(), getSelectedScheduleExercise(), goDetectionPrep(), goExerciseDetail() (+16 more)

### Community 9 - "squatConstants.js"
Cohesion: 0.14
Nodes (17): createVoicePolicyTracker(), DEFAULT_SQUAT_REWARD_XP, REQUIRED_LANDMARK_INDICES, SQUAT_ANALYSIS_MODE, SQUAT_SCORE_RULES, SQUAT_THRESHOLDS, createFeedbackStabilityTracker(), FEEDBACK_PRIORITY (+9 more)

### Community 10 - "gamificationEngine.js"
Cohesion: 0.18
Nodes (21): exerciseService, computeSessionXp(), DIFFICULTY_LABEL_TO_TIER, DIFFICULTY_TIER_BASE_XP, gamificationEngine, getAchievements(), getCompletionDateSet(), getCompletionRecords() (+13 more)

### Community 11 - "shoulder/poseMath.js"
Cohesion: 0.23
Nodes (14): MANUAL_ATTEMPT_MARKER_SEQUENCE, SHOULDER_CALIBRATION_MOVEMENT, CAMERA_READY_LANDMARKS, SHOULDER_CAMERA_THRESHOLDS, SHOULDER_LANDMARK_INDEX, SHOULDER_MEASUREMENT_LANDMARKS, SHOULDER_SIDE, computeElbowExtensionAngle() (+6 more)

### Community 12 - "handleSquatFrame"
Cohesion: 0.15
Nodes (14): cancelSquatCountdown(), cancelSquatReadyHold(), drawSquatSkeleton(), estimateSquatFps(), handleSquatFrame(), hideSquatCountdownVisual(), setSquatAlertText(), showSquatRepAlert() (+6 more)

### Community 13 - "goAssignPlan"
Cohesion: 0.17
Nodes (12): addExerciseToAssignDraft(), buildDefaultScheduleTitle(), confirmLeaveAssignDraft(), confirmRelationAction(), generateScheduleGoal(), goAssignPlan(), goCaseList(), loadAssignDraftForDate() (+4 more)

### Community 14 - "renderDashboard"
Cohesion: 0.17
Nodes (12): dataPage(), devAccountsPage(), getPatientRelationStatus(), patientHome(), profilePage(), renderDashboard(), renderDevDataMaintenanceSection(), renderPatientCareHistory() (+4 more)

### Community 15 - "ai/poseMath.js"
Cohesion: 0.30
Nodes (10): DETECTION_DISPLAY_STATE, BODY_READINESS, computeKneeAngles(), computeKneeValgusSuspected(), computeTrunkLeanDeg(), getBodyReadiness(), getFramingDistanceHint(), hasFullLowerBody() (+2 more)

### Community 16 - "hipFlexion/constants.js"
Cohesion: 0.38
Nodes (5): HP02_ENGINEERING_DEFAULTS, HP02_REQUIRED_LANDMARKS, createHipFlexionSession(), createLegTracker(), LEG_STATE

### Community 17 - "phone"
Cohesion: 0.20
Nodes (10): phone(), renderAuth(), renderAuthChooseMode(), renderAuthChooseRole(), renderAuthForm(), renderAuthRegisterSuccess(), renderNav(), renderSplash() (+2 more)

### Community 18 - "hipFlexion/poseMath.js"
Cohesion: 0.40
Nodes (5): drawHp02Skeleton(), handleHp02Frame(), computeHipFlexionAngles(), isPointReliable(), POSE_LANDMARK_INDEX

### Community 19 - "beginSquatCameraSession"
Cohesion: 0.15
Nodes (15): beginHp02CameraSession(), beginSquatCameraSession(), handleHp02CameraStatus(), handleHp02FatalError(), handleSquatCameraStatus(), handleSquatFatalError(), resetSquatEndingScreen(), retrySquatCamera() (+7 more)

### Community 20 - "getOrInitAssessmentDraft"
Cohesion: 0.25
Nodes (8): confirmAssessment(), getOrInitAssessmentDraft(), goAssessmentNextStep(), patientAssessmentSummaryPage(), selectAssessmentAbility(), selectAssessmentDuration(), toggleAssessmentBodyPart(), toggleAssessmentGoal()

### Community 21 - "index.html"
Cohesion: 0.40
Nodes (5): app.js (module entry script), #app mount div, manifest.json (web app manifest link), ReMotion Web App (page title), styles.css (stylesheet link)

### Community 22 - "goLandingPrimaryCta"
Cohesion: 0.40
Nodes (5): determinePatientLandingRoute(), goAuth(), goLandingPrimaryCta(), login(), setSession()

### Community 23 - "milestones.js"
Cohesion: 0.50
Nodes (4): createMilestoneTracker(), fractionThreshold(), getSquatMilestone(), SQUAT_MILESTONE

### Community 24 - "backToSelfPracticeDiscovery"
Cohesion: 0.67
Nodes (3): backToSelfPracticeDiscovery(), clearSelfPracticeFilters(), resetSelfPracticeFilterFields()

### Community 25 - "copyDevAccountsText"
Cohesion: 0.67
Nodes (3): copyDevAccountPassword(), copyDevAccountsText(), copyDevAccountText()

### Community 26 - "functionalAssessmentShoulderSessionPage"
Cohesion: 0.67
Nodes (3): functionalAssessmentShoulderCalibrationPanelHtml(), functionalAssessmentShoulderSessionPage(), renderFunctionalAssessmentShoulderProgressDots()

### Community 27 - "startAssessmentForm"
Cohesion: 0.67
Nodes (3): startAssessmentForm(), startAssessmentReassess(), startAssessmentUpdate()

## Knowledge Gaps
- **70 isolated node(s):** `app`, `WEEKDAY_LABELS`, `MONTH_ABBR`, `SCHEDULE_STATUS_LABELS`, `SCHEDULE_STATUS_CLASSES` (+65 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `render()` connect `render` to `app.js`, `relationService.js`, `actionRecordsPage`, `persistSquatSession`, `beginShoulderCameraSession`, `exerciseDetailPage`, `goAssignPlan`, `renderDashboard`, `phone`, `getOrInitAssessmentDraft`, `goLandingPrimaryCta`, `backToSelfPracticeDiscovery`, `startAssessmentForm`, `analysisPage`, `patientAchievementsPage`, `getCurrentPatientId`, `goFunctionalAssessmentShoulderSessionBack`, `historyPage`, `previewTherapistTransfer`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `computeShoulderMeasurementObservation()` connect `shoulder/poseMath.js` to `app.js`, `beginShoulderCameraSession`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `estimateExerciseMinutes()` connect `exerciseService.js` to `app.js`, `actionRecordsPage`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `beginSquatCameraSession()` (e.g. with `handleSquatCameraStatus()` and `handleSquatFatalError()`) actually correct?**
  _`beginSquatCameraSession()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `app`, `WEEKDAY_LABELS`, `MONTH_ABBR` to the rest of the system?**
  _70 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `render` be split into smaller, more focused modules?**
  _Cohesion score 0.029850746268656716 - nodes in this community are weakly interconnected._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03225806451612903 - nodes in this community are weakly interconnected._