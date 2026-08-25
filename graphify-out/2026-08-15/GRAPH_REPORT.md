# Graph Report - .  (2026-08-15)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 601 nodes · 1365 edges · 37 communities (28 shown, 9 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 33 edges (avg confidence: 0.56)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- render
- app.js
- squatConstants.js
- relationService.js
- actionRecordsPage
- gamificationEngine.js
- exerciseDetailPage
- beginShoulderCameraSession
- selfPracticeLibraryPage
- recommendationEngine.js
- shoulder/poseMath.js
- enterSquatSuccessState
- handleSquatFrame
- squatFeedbackContent.js
- goAssignPlan
- renderDashboard
- phone
- beginSquatCameraSession
- getOrInitAssessmentDraft
- voiceProfile.js
- resolveSquatFeedback
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
- `executeTherapistTransfer()` --calls--> `nowIso()`  [EXTRACTED]
  app.js → js/utils/id.js
- `beginShoulderCameraSession()` --calls--> `createDetectionStabilityTracker()`  [EXTRACTED]
  app.js → js/ai/detectionStability.js
- `beginShoulderCameraSession()` --calls--> `createSquatCameraController()`  [EXTRACTED]
  app.js → js/ai/shared/cameraController.js
- `beginShoulderCameraSession()` --calls--> `createVoicePolicyTracker()`  [EXTRACTED]
  app.js → js/ai/shared/voicePolicy.js
- `updateShoulderCalibrationFromFrame()` --calls--> `computeShoulderMeasurementObservation()`  [EXTRACTED]
  app.js → js/ai/exercises/shoulder/poseMath.js

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
Nodes (32): ABILITY_LEVEL_OPTIONS, app, BASE_TABS, BODY_PART_DISPLAY_ORDER, CATEGORY_ICON_MAP, COMPLETE_REASONS, DIFFICULTY_DISPLAY_MAP, DIFFICULTY_TIER_OPTIONS (+24 more)

### Community 2 - "squatConstants.js"
Cohesion: 0.06
Nodes (46): beginHp02CameraSession(), drawHp02Skeleton(), handleHp02CameraStatus(), handleHp02FatalError(), handleHp02Frame(), persistSquatSession(), createDetectionStabilityTracker(), DETECTION_DISPLAY_STATE (+38 more)

### Community 3 - "relationService.js"
Cohesion: 0.07
Nodes (39): completeScheduleExercise(), submitAssignPlan(), validateAssignDraft(), ANALYSIS_RECORD_SOURCES, analysisRecordsCollection, analysisService, ABILITY_LEVELS, ASSESSMENT_STATUS (+31 more)

### Community 4 - "actionRecordsPage"
Cohesion: 0.06
Nodes (49): actionRecordsPage(), buildRecommendationHeadlineText(), buildTrainingHistoryEntry(), buildWeekdayStrip(), buildWeeklyActivityMicrocopy(), buildWeeklyComparisonLabel(), buildWeeklyTrainingProgress(), buildWeekStripDates() (+41 more)

### Community 5 - "gamificationEngine.js"
Cohesion: 0.10
Nodes (33): cleanText(), DIFFICULTY_TIER_MAP, exerciseService, HP02_EXERCISE_ID, isSquatExercise(), normalizeExercise(), POSE_ANALYZER, resolvePoseAnalyzer() (+25 more)

### Community 6 - "exerciseDetailPage"
Cohesion: 0.09
Nodes (33): calculateSquatTargetReps(), detectionPrepPage(), exerciseDetailPage(), exitHp02Detection(), exitSquatDetection(), finalizeSquatTraining(), getExercisePageContext(), getExerciseReturnRoute() (+25 more)

### Community 7 - "beginShoulderCameraSession"
Cohesion: 0.11
Nodes (29): advanceFunctionalAssessmentShoulderMovement(), beginShoulderCameraSession(), beginShoulderCountdown(), beginShoulderReadyHold(), cancelShoulderCountdown(), cancelShoulderReadyHold(), getShoulderCalibrationLandmarkFacts(), handleShoulderCameraStatus() (+21 more)

### Community 8 - "selfPracticeLibraryPage"
Cohesion: 0.10
Nodes (24): assessmentStepDots(), buildCompactRecommendationReason(), calculateScheduleSummary(), estimateExerciseMinutes(), getAssessmentBodyPartOptions(), getAssessmentGoalOptions(), getDifficultyDisplay(), getFilteredSelfPracticeExercises() (+16 more)

### Community 9 - "recommendationEngine.js"
Cohesion: 0.25
Nodes (15): summarizeRecommendationItems(), getDifficultyTier(), ABILITY_LABELS, buildDeterministicPoolOrder(), buildRecommendationReason(), buildSession(), estimateExerciseMinutes(), generateRecommendationForAssessment() (+7 more)

### Community 10 - "shoulder/poseMath.js"
Cohesion: 0.25
Nodes (13): SHOULDER_CALIBRATION_MOVEMENT, CAMERA_READY_LANDMARKS, SHOULDER_CAMERA_THRESHOLDS, SHOULDER_LANDMARK_INDEX, SHOULDER_MEASUREMENT_LANDMARKS, SHOULDER_SIDE, computeElbowExtensionAngle(), computeShoulderElevationAngle() (+5 more)

### Community 11 - "enterSquatSuccessState"
Cohesion: 0.24
Nodes (14): beginSquatCountdown(), beginSquatReadyHold(), enterSquatIncompleteState(), enterSquatSuccessState(), requestEndSquatTraining(), setSquatRobotMood(), showSquatCountdownVisual(), showSquatEndingScreen() (+6 more)

### Community 12 - "handleSquatFrame"
Cohesion: 0.15
Nodes (14): cancelSquatCountdown(), cancelSquatReadyHold(), drawSquatSkeleton(), estimateSquatFps(), handleSquatFrame(), hideSquatCountdownVisual(), setSquatAlertText(), showSquatRepAlert() (+6 more)

### Community 13 - "squatFeedbackContent.js"
Cohesion: 0.16
Nodes (11): SQUAT_TRAINING_EVENT, SQUAT_TRAINING_STATE, TRANSITIONS, createFeedbackContentSelector(), MILESTONE_VISUAL_POOLS, MILESTONE_VOICE_POOLS, SQUAT_FEEDBACK_ICON, SQUAT_FEEDBACK_INTENT (+3 more)

### Community 14 - "goAssignPlan"
Cohesion: 0.15
Nodes (13): addExerciseToAssignDraft(), buildDefaultScheduleTitle(), confirmLeaveAssignDraft(), confirmRelationAction(), generateScheduleGoal(), goAssignPlan(), goCaseDetail(), goCaseList() (+5 more)

### Community 15 - "renderDashboard"
Cohesion: 0.17
Nodes (12): dataPage(), devAccountsPage(), getPatientRelationStatus(), patientHome(), profilePage(), renderDashboard(), renderDevDataMaintenanceSection(), renderPatientCareHistory() (+4 more)

### Community 16 - "phone"
Cohesion: 0.20
Nodes (10): phone(), renderAuth(), renderAuthChooseMode(), renderAuthChooseRole(), renderAuthForm(), renderAuthRegisterSuccess(), renderNav(), renderSplash() (+2 more)

### Community 17 - "beginSquatCameraSession"
Cohesion: 0.28
Nodes (9): beginSquatCameraSession(), handleSquatCameraStatus(), handleSquatFatalError(), resetSquatEndingScreen(), retrySquatCamera(), setSquatStatusOverlay(), toggleSquatVoice(), updateSquatVoiceToggleUI() (+1 more)

### Community 18 - "getOrInitAssessmentDraft"
Cohesion: 0.25
Nodes (8): confirmAssessment(), getOrInitAssessmentDraft(), goAssessmentNextStep(), patientAssessmentSummaryPage(), selectAssessmentAbility(), selectAssessmentDuration(), toggleAssessmentBodyPart(), toggleAssessmentGoal()

### Community 19 - "voiceProfile.js"
Cohesion: 0.29
Nodes (7): initShoulderVoiceSelection(), initSquatVoiceSelection(), pickSquatVoice(), IMPORTANT: the Web Speech API does NOT reliably expose voice gender. This, scoreVoice(), SOFT_VOICE_NAME_HINTS, SQUAT_VOICE_SETTINGS

### Community 20 - "resolveSquatFeedback"
Cohesion: 0.29
Nodes (7): resolveSquatFeedback(), speakSquatFeedbackIfAppropriate(), triggerSquatMilestoneBadge(), updateSquatPrimaryFeedback(), updateSquatRobotCompanion(), decideSquatFeedback(), pickSquatRobotState()

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
- **67 isolated node(s):** `app`, `WEEKDAY_LABELS`, `MONTH_ABBR`, `SCHEDULE_STATUS_LABELS`, `SCHEDULE_STATUS_CLASSES` (+62 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `render()` connect `render` to `getCurrentPatientId`, `app.js`, `goFunctionalAssessmentShoulderSessionBack`, `relationService.js`, `actionRecordsPage`, `historyPage`, `exerciseDetailPage`, `beginShoulderCameraSession`, `previewTherapistTransfer`, `goAssignPlan`, `renderDashboard`, `phone`, `getOrInitAssessmentDraft`, `goLandingPrimaryCta`, `backToSelfPracticeDiscovery`, `startAssessmentForm`, `analysisPage`, `patientAchievementsPage`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `computeShoulderMeasurementObservation()` connect `shoulder/poseMath.js` to `app.js`, `beginShoulderCameraSession`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `estimateExerciseMinutes()` connect `recommendationEngine.js` to `app.js`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `beginSquatCameraSession()` (e.g. with `handleSquatCameraStatus()` and `handleSquatFatalError()`) actually correct?**
  _`beginSquatCameraSession()` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `app`, `WEEKDAY_LABELS`, `MONTH_ABBR` to the rest of the system?**
  _67 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `render` be split into smaller, more focused modules?**
  _Cohesion score 0.029850746268656716 - nodes in this community are weakly interconnected._
- **Should `app.js` be split into smaller, more focused modules?**
  _Cohesion score 0.03333333333333333 - nodes in this community are weakly interconnected._