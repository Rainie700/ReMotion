import { authService } from "./js/data/authService.js";
import { storageService } from "./js/data/storageService.js";
import { scheduleService } from "./js/data/scheduleService.js";
import { analysisService, ANALYSIS_RECORD_SOURCES, getRecordSource } from "./js/data/analysisService.js";
import { gameService } from "./js/data/gameService.js";
import { exerciseService, resolvePoseAnalyzer, POSE_ANALYZER } from "./js/data/exerciseService.js";
import { userService } from "./js/data/userService.js";
import { relationService } from "./js/data/relationService.js";
import { generateId, nowIso } from "./js/utils/id.js";
import { SQUAT_THRESHOLDS, SQUAT_ANALYSIS_MODE, DEFAULT_SQUAT_REWARD_XP, SQUAT_REQUIRED_LANDMARKS } from "./js/ai/squatConstants.js";
import { computeKneeAngles, computeTrunkLeanDeg, computeKneeValgusSuspected, hasFullLowerBody } from "./js/ai/poseMath.js";
import { createDetectionStabilityTracker, DETECTION_DISPLAY_STATE } from "./js/ai/detectionStability.js";
import { createSquatSession } from "./js/ai/squatSession.js";
import { SQUAT_QUALITY_ISSUE, SQUAT_QUALITY_ISSUE_LABELS, SQUAT_QUALITY_ISSUE_SUGGESTIONS } from "./js/ai/squatQuality.js";
import { decideSquatFeedback, createFeedbackStabilityTracker, FEEDBACK_PRIORITY } from "./js/ai/squatFeedback.js";
import { SQUAT_FEEDBACK_INTENT, SQUAT_FEEDBACK_ICON, SQUAT_MILESTONE_ICON, createFeedbackContentSelector } from "./js/ai/squatFeedbackContent.js";
import { getSquatMilestone, createMilestoneTracker, SQUAT_MILESTONE } from "./js/ai/shared/milestones.js";
import { pickSquatRobotState } from "./js/ai/squatRobotCompanion.js";
import { SQUAT_TRAINING_STATE, SQUAT_TRAINING_EVENT, nextSquatTrainingState, isSquatTrainingLocked } from "./js/ai/shared/trainingState.js";
import { createVoicePolicyTracker } from "./js/ai/shared/voicePolicy.js";
import { pickSquatVoice, SQUAT_VOICE_SETTINGS } from "./js/ai/shared/voiceProfile.js";
import { calculateSquatScore, buildSquatRemark, buildSquatQualityExplanation, calculateQualityRatioPercent, calculateProgressRatio } from "./js/ai/squatScore.js";
import { createSquatCameraController, POSE_CONNECTIONS } from "./js/ai/shared/cameraController.js";
import { HP02_REQUIRED_LANDMARKS } from "./js/ai/exercises/hipFlexion/constants.js";
import { computeHipFlexionAngles } from "./js/ai/exercises/hipFlexion/poseMath.js";
import { createHipFlexionSession } from "./js/ai/exercises/hipFlexion/session.js";
import { CR05_REQUIRED_LANDMARKS, CR05_THRESHOLDS, CR05_ANALYSIS_MODE, DEFAULT_CR05_REWARD_XP } from "./js/ai/exercises/seatedKneeRaise/constants.js";
import { computeSeatedKneeRaiseMetrics } from "./js/ai/exercises/seatedKneeRaise/poseMath.js";
import { createSeatedKneeRaiseSession } from "./js/ai/exercises/seatedKneeRaise/session.js";
import { CR05_QUALITY_ISSUE, CR05_QUALITY_ISSUE_LABELS, CR05_QUALITY_SUGGESTIONS } from "./js/ai/exercises/seatedKneeRaise/quality.js";
import { calculateSeatedKneeRaiseScore, buildSeatedKneeRaiseRemark } from "./js/ai/exercises/seatedKneeRaise/score.js";
import { KN03_REQUIRED_LANDMARKS, KN03_THRESHOLDS, KN03_ANALYSIS_MODE, DEFAULT_KN03_REWARD_XP } from "./js/ai/exercises/seatedKneeExtension/constants.js";
import { computeSeatedKneeExtensionMetrics } from "./js/ai/exercises/seatedKneeExtension/poseMath.js";
import { createSeatedKneeExtensionSession } from "./js/ai/exercises/seatedKneeExtension/session.js";
import { KN03_QUALITY_ISSUE, KN03_QUALITY_ISSUE_LABELS, KN03_QUALITY_SUGGESTIONS } from "./js/ai/exercises/seatedKneeExtension/quality.js";
import { calculateSeatedKneeExtensionScore, buildSeatedKneeExtensionRemark } from "./js/ai/exercises/seatedKneeExtension/score.js";
import { LE05_REQUIRED_LANDMARKS, LE05_THRESHOLDS, LE05_ANALYSIS_MODE, DEFAULT_LE05_REWARD_XP } from "./js/ai/exercises/sitToStand/constants.js";
import { computeSitToStandMetrics } from "./js/ai/exercises/sitToStand/poseMath.js";
import { createSitToStandSession } from "./js/ai/exercises/sitToStand/session.js";
import { LE05_QUALITY_ISSUE, LE05_QUALITY_ISSUE_LABELS, LE05_QUALITY_SUGGESTIONS } from "./js/ai/exercises/sitToStand/quality.js";
import { calculateSitToStandScore, buildSitToStandRemark } from "./js/ai/exercises/sitToStand/score.js";
import { LE03_REQUIRED_LANDMARKS, LE03_THRESHOLDS, LE03_ANALYSIS_MODE, DEFAULT_LE03_REWARD_XP } from "./js/ai/exercises/bridge/constants.js";
import { computeBridgeMetrics } from "./js/ai/exercises/bridge/poseMath.js";
import { createBridgeSession } from "./js/ai/exercises/bridge/session.js";
import { LE03_QUALITY_ISSUE, LE03_QUALITY_ISSUE_LABELS, LE03_QUALITY_SUGGESTIONS } from "./js/ai/exercises/bridge/quality.js";
import { calculateBridgeScore, buildBridgeRemark } from "./js/ai/exercises/bridge/score.js";
import { LE04_REQUIRED_LANDMARKS, LE04_THRESHOLDS, LE04_ANALYSIS_MODE, DEFAULT_LE04_REWARD_XP } from "./js/ai/exercises/sideLegRaise/constants.js";
import { computeSideLegRaiseMetrics } from "./js/ai/exercises/sideLegRaise/poseMath.js";
import { createSideLegRaiseSession } from "./js/ai/exercises/sideLegRaise/session.js";
import { LE04_QUALITY_ISSUE, LE04_QUALITY_ISSUE_LABELS, LE04_QUALITY_SUGGESTIONS } from "./js/ai/exercises/sideLegRaise/quality.js";
import { calculateSideLegRaiseScore, buildSideLegRaiseRemark } from "./js/ai/exercises/sideLegRaise/score.js";
import { LE06_REQUIRED_LANDMARKS, LE06_THRESHOLDS, LE06_ANALYSIS_MODE, DEFAULT_LE06_REWARD_XP } from "./js/ai/exercises/balance/constants.js";
import { computeBalanceMetrics } from "./js/ai/exercises/balance/poseMath.js";
import { createBalanceSession } from "./js/ai/exercises/balance/session.js";
import { calculateBalanceScore, buildBalanceRemark } from "./js/ai/exercises/balance/score.js";
import { LE07_REQUIRED_LANDMARKS, LE07_THRESHOLDS, LE07_ANALYSIS_MODE, DEFAULT_LE07_REWARD_XP } from "./js/ai/exercises/calfRaise/constants.js";
import { computeCalfRaiseMetrics } from "./js/ai/exercises/calfRaise/poseMath.js";
import { createCalfRaiseSession } from "./js/ai/exercises/calfRaise/session.js";
import { calculateCalfRaiseScore, buildCalfRaiseRemark, LE07_ISSUE_LABELS } from "./js/ai/exercises/calfRaise/score.js";
import { SH01_REQUIRED_LANDMARKS, SH01_THRESHOLDS, SH01_ANALYSIS_MODE, DEFAULT_SH01_REWARD_XP } from "./js/ai/exercises/shoulderPendulum/constants.js";
import { computeShoulderPendulumMetrics } from "./js/ai/exercises/shoulderPendulum/poseMath.js";
import { createShoulderPendulumSession } from "./js/ai/exercises/shoulderPendulum/session.js";
import { calculateShoulderPendulumScore, buildShoulderPendulumRemark, SH01_ISSUE_LABELS } from "./js/ai/exercises/shoulderPendulum/score.js";
import { SH02_REQUIRED_LANDMARKS, SH02_THRESHOLDS, SH02_ANALYSIS_MODE, DEFAULT_SH02_REWARD_XP } from "./js/ai/exercises/shoulderExternalIsometric/constants.js";
import { computeExternalIsometricMetrics } from "./js/ai/exercises/shoulderExternalIsometric/poseMath.js";
import { createExternalIsometricSession } from "./js/ai/exercises/shoulderExternalIsometric/session.js";
import { calculateExternalIsometricScore, buildExternalIsometricRemark, SH02_ISSUE_LABELS } from "./js/ai/exercises/shoulderExternalIsometric/score.js";
import { SH03_REQUIRED_LANDMARKS, SH03_THRESHOLDS, SH03_ANALYSIS_MODE, DEFAULT_SH03_REWARD_XP } from "./js/ai/exercises/shoulderInternalIsometric/constants.js";
import { calculateInternalIsometricScore, buildInternalIsometricRemark } from "./js/ai/exercises/shoulderInternalIsometric/score.js";
import { HP04_REQUIRED_LANDMARKS, HP04_THRESHOLDS, HP04_ANALYSIS_MODE, DEFAULT_HP04_REWARD_XP } from "./js/ai/exercises/hipAbduction/constants.js";
import { calculateHipAbductionScore, buildHipAbductionRemark, HP04_ISSUE_LABELS } from "./js/ai/exercises/hipAbduction/score.js";
import { HP05_REQUIRED_LANDMARKS, HP05_THRESHOLDS, HP05_ANALYSIS_MODE, DEFAULT_HP05_REWARD_XP } from "./js/ai/exercises/hipAdduction/constants.js";
import { calculateHipAdductionScore, buildHipAdductionRemark, HP05_ISSUE_LABELS } from "./js/ai/exercises/hipAdduction/score.js";
import { HP06_REQUIRED_LANDMARKS, HP06_THRESHOLDS, HP06_ANALYSIS_MODE, DEFAULT_HP06_REWARD_XP } from "./js/ai/exercises/clamshell/constants.js";
import { computeClamshellMetrics } from "./js/ai/exercises/clamshell/poseMath.js";
import { createClamshellSession } from "./js/ai/exercises/clamshell/session.js";
import { calculateClamshellScore, buildClamshellRemark, HP06_ISSUE_LABELS } from "./js/ai/exercises/clamshell/score.js";
import { LE02_REQUIRED_LANDMARKS, LE02_THRESHOLDS, LE02_ANALYSIS_MODE, DEFAULT_LE02_REWARD_XP } from "./js/ai/exercises/straightLegRaise/constants.js";
import { createStraightLegRaiseSession } from "./js/ai/exercises/straightLegRaise/session.js";
import { calculateStraightLegRaiseScore, buildStraightLegRaiseRemark, LE02_ISSUE_LABELS } from "./js/ai/exercises/straightLegRaise/score.js";
import { assessmentService } from "./js/data/assessmentService.js";
import { PHASE1_TEST_EXERCISE_GOALS } from "./js/data/phase1SchemaTestData.js";
import { recommendationService } from "./js/data/recommendationService.js";
import { estimateExerciseMinutes as estimateRecommendationExerciseMinutes, RECOMMENDATION_CONFIG } from "./js/data/recommendationEngine.js";
import { gamificationEngine } from "./js/data/gamificationEngine.js";
import { functionalAssessmentService } from "./js/data/functionalAssessmentService.js";
import { BODY_READINESS } from "./js/ai/poseMath.js";
import { CAMERA_READY_LANDMARKS, SHOULDER_CAMERA_THRESHOLDS, SHOULDER_SIDE, SHOULDER_MEASUREMENT_LANDMARKS } from "./js/ai/exercises/shoulder/constants.js";
import { createShoulderMeasurementSession, SHOULDER_MEASUREMENT_PHASE, SHOULDER_MEASUREMENT_SIGNAL } from "./js/ai/exercises/shoulder/measurementSession.js";
import { computeShoulderMeasurementObservation } from "./js/ai/exercises/shoulder/poseMath.js";
import { createShoulderCalibrationSession, SHOULDER_CALIBRATION_MOVEMENT } from "./js/ai/exercises/shoulder/calibrationSession.js";

// One-time backfills / fixups — all idempotent, safe to run on every load.
userService.ensureTherapistInviteCodes();
userService.ensureDeveloperAccountFlags();
userService.migrateMandyAccount();

const app = document.getElementById("app");

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const SCHEDULE_STATUS_LABELS = { pending: "待開始", in_progress: "進行中", completed: "已完成" };
const SCHEDULE_STATUS_CLASSES = { pending: "pending", in_progress: "active-status", completed: "done-status" };

function formatDateStr(d) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function todayStr() {
  return formatDateStr(new Date());
}

/** "YYYY-MM-DD" -> "MM/DD", for the compact date label on Home's 今日復健 card. */
function formatMonthDay(dateStr) {
  const parts = String(dateStr || "").split("-");
  return parts.length === 3 ? `${parts[1]}/${parts[2]}` : "";
}

/** Real local "HH:MM" from a timestamp/Date -- Phase 6.3 My Progress/History/Detail's date+time display. Returns "" for a missing/invalid input rather than "NaN:NaN". */
function formatClockTime(dateLike) {
  const d = dateLike instanceof Date ? dateLike : new Date(dateLike || NaN);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Real local hour -> a natural time-of-day greeting prefix (not fabricated data, just real Date()). */
function getTimeGreetingPrefix() {
  const hour = new Date().getHours();
  if (hour < 12) return "早安";
  if (hour < 18) return "午安";
  return "晚安";
}

function buildWeekStripDates(centerDateStr) {
  const center = new Date(`${centerDateStr}T00:00:00`);
  const dates = [];
  for (let offset = -2; offset <= 2; offset++) {
    const d = new Date(center);
    d.setDate(d.getDate() + offset);
    dates.push(formatDateStr(d));
  }
  return dates;
}

/**
 * Single shared query used by both the patient home card and the "我的復健課表"
 * page, so the two never diverge on how "today's schedule" (or any other
 * selected date's schedule) is looked up.
 */
function getCurrentPatientId() {
  return state.user && state.user.role === "patient" ? state.user.id : null;
}

function getPatientScheduleForDate(patientId, date) {
  if (!patientId) return null;
  return scheduleService.getByPatientAndDate(patientId, date);
}

function getTherapistDisplayName(therapistId) {
  const therapist = therapistId ? userService.getById(therapistId) : null;
  return therapist ? therapist.name : "復健師";
}

function formatExerciseMetric(ex) {
  if (ex.repetitions != null) return `${ex.sets}組 × ${ex.repetitions}次`;
  if (ex.durationSeconds != null) return `${ex.sets}組 × ${ex.durationSeconds}秒`;
  return `${ex.sets}組`;
}

function buildDefaultScheduleTitle(date) {
  const [, mm, dd] = String(date).split("-");
  return `${mm}/${dd} 復健課表`;
}

/**
 * Rule-based (not AI/medical) suggestion based on which catalog categories
 * are represented in the draft's exercises.
 */
function generateScheduleGoal(exercises) {
  if (!exercises || !exercises.length) return "";
  const categories = new Set();
  exercises.forEach((ex) => {
    const catalog = exerciseService.getById(ex.exerciseId);
    if (catalog && catalog.category) categories.add(catalog.category);
  });
  const list = [...categories];
  const onlyHas = (...names) => list.length > 0 && list.every((c) => names.includes(c));

  if (onlyHas("下肢")) return "提升下肢肌力與動作穩定";
  if (onlyHas("髖關節")) return "改善髖關節控制與核心穩定";
  if (onlyHas("髖關節", "核心")) return "改善髖關節控制與核心穩定";
  if (onlyHas("上肢肩部")) return "維持肩關節活動度與上肢控制";
  if (onlyHas("日常生活功能")) return "提升日常活動與功能性移動能力";
  if (onlyHas("核心")) return "強化核心穩定與軀幹控制";
  if (list.length > 1) return "全身功能性訓練與動作穩定";
  return "依復健師指示完成今日訓練";
}

/**
 * Parses an Excel `estimated_minutes` field like "8分鐘" or "5-8分鐘" into a
 * single baseline number of minutes (the midpoint of a range). Returns null
 * when nothing numeric can be found.
 */
function parseMinutesRange(text) {
  if (!text) return null;
  const nums = String(text).match(/\d+(\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const values = nums.map(Number);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Pure, front-end-only time estimate for one schedule exercise, scaled from
 * the Excel baseline (estimated_minutes at the catalog's default sets/reps
 * or sets/duration) to whatever sets/reps/duration the therapist assigned.
 * Never returns NaN/undefined/Infinity — falls back to the Excel baseline,
 * or 0 when no baseline can be parsed at all.
 */
function estimateExerciseMinutes(scheduleExercise, masterExercise) {
  const baseMinutes = masterExercise ? parseMinutesRange(masterExercise.estimated_minutes) : null;
  if (baseMinutes == null) return 0;
  if (!masterExercise) return baseMinutes;

  const isDuration = masterExercise.measurementType === "duration";
  const baselineQty = isDuration
    ? (masterExercise.defaultSets || 0) * (masterExercise.defaultDurationSeconds || 0)
    : (masterExercise.defaultSets || 0) * (masterExercise.defaultRepetitions || 0);
  const assignedQty = isDuration
    ? (scheduleExercise.sets || 0) * (scheduleExercise.durationSeconds || 0)
    : (scheduleExercise.sets || 0) * (scheduleExercise.repetitions || 0);

  if (!baselineQty || !assignedQty) return baseMinutes;
  const minutes = baseMinutes * (assignedQty / baselineQty);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : baseMinutes;
}

/**
 * ReMotion 2.0 Phase 4.1 — centralized exercise -> thumbnail mapping.
 * Only 9 real illustration assets exist in public/images/exercise for 44
 * catalog exercises, so this is deliberately a best-effort keyword/category
 * match, not a 1:1 lookup table — anything that can't be matched with
 * reasonable confidence falls back to the generic exercise_plan.png rather
 * than guessing a specific (and wrong) illustration. Accepts either a raw
 * catalog record (exercise_name/category) or a normalized one (name/
 * bodyPart) so every call site can just pass whatever it already has.
 */
function getExerciseImage(exercise) {
  const name = (exercise && (exercise.exercise_name || exercise.name)) || "";
  const category = (exercise && (exercise.category || exercise.bodyPart)) || "";
  const base = "/images/exercise/";
  // Phase 4.2 audit fixes (see final report item 12): three keyword rules
  // were catching real catalog exercises with the wrong body part or the
  // wrong motion, which is worse than a plain fallback —
  //  - "外展" alone matched hip-abduction exercises (側躺髖外展, category
  //    髖關節) onto an ARM abduction picture; now gated to 上肢肩部 only.
  //  - "髖屈曲" matched a STANDING hip-flexion exercise onto a
  //    seated/lying leg-raise picture; that clause is removed outright.
  //  - "踮腳" (calf raise / rising onto toes) matched exercise_ankle_
  //    rotation.png, a different motion (rotating the ankle); removed.
  if (name.includes("深蹲")) return `${base}exercise_squat.png`;
  if (name.includes("外展") && category === "上肢肩部") return `${base}exercise_arm_abduction.png`;
  if (category === "上肢肩部" || name.includes("肩")) return `${base}exercise_shoulder_raise.png`;
  if (name.includes("踝")) return `${base}exercise_ankle_rotation.png`;
  if (name.includes("頸")) return `${base}exercise_neck_stretch.png`;
  if (name.includes("抬膝")) return `${base}exercise_knee_raise.png`;
  if (name.includes("抬腿")) return `${base}exercise_seated_leg_raise.png`;
  if (name.includes("伸展") && name.includes("膝")) return `${base}exercise_knee_extension.png`;
  return `${base}exercise_plan.png`;
}

/**
 * Reusable horizontal CSS progress bar (never a static image — width is
 * always driven by a real completed/total ratio). Used by both the 今日復健
 * card (assigned progress) and the AI 個人化建議 card (recommendation
 * progress) so Home only has one progress visual language, not two.
 */
function renderProgressBar(completed, total) {
  const safeTotal = total || 0;
  const pct = safeTotal > 0 ? Math.min(100, Math.round((completed / safeTotal) * 100)) : 0;
  const doneMark = safeTotal > 0 && completed >= safeTotal ? `<span class="home-progress-check">✓</span>` : "";
  return `<div class="home-progress-bar"><div class="home-progress-bar-track"><span style="width:${pct}%"></span></div><span class="home-progress-bar-label">${completed} / ${safeTotal}${doneMark}</span></div>`;
}

function calculateScheduleSummary(exercises) {
  const list = exercises || [];
  const totalSets = list.reduce((sum, ex) => sum + (ex.sets || 0), 0);
  const totalRewardXp = list.reduce((sum, ex) => sum + (ex.rewardXp || 0), 0);
  const categories = new Set();
  let totalMinutes = 0;
  let hasUnknownEstimate = false;
  list.forEach((ex) => {
    const master = exerciseService.getById(ex.exerciseId);
    if (master && master.category) categories.add(master.category);
    const minutes = estimateExerciseMinutes(ex, master);
    if (!minutes) hasUnknownEstimate = true;
    totalMinutes += minutes;
  });
  return {
    exerciseCount: list.length,
    totalSets,
    estimatedDurationMinutes: Math.round(totalMinutes),
    totalRewardXp,
    categories: [...categories],
    hasUnknownEstimate,
  };
}

function buildDurationComparisonText(estimatedMinutes, targetMinutes) {
  if (!targetMinutes) return "";
  const diff = estimatedMinutes - targetMinutes;
  if (diff > 0) return `目前課表預估超出目標 ${diff} 分鐘。`;
  if (diff < 0) return `目前課表距離目標時間尚有約 ${Math.abs(diff)} 分鐘。`;
  return "目前課表預估時間與目標一致。";
}

function renderScheduleExerciseAction(scheduleId, index, status) {
  const label = status === "completed" ? "查看結果" : status === "in_progress" ? "繼續訓練" : "查看並開始";
  const cls = SCHEDULE_STATUS_CLASSES[status] || "pending";
  return `<button class="pill ${cls}" onclick="goExerciseDetail('${scheduleId}', ${index})">${label}</button>`;
}

/**
 * Phase 6.5 report section 5 — LEFT (real exercise image, reused from the
 * Library's own EXERCISE_IMAGE_MAP/renderExerciseCardImage — no second
 * mapping) / CENTER (name, dose, one real instruction line, AI badge only
 * when genuinely trainingMode "pose_analysis") / RIGHT (the existing
 * status action button, unchanged). Replaces the old text-only
 * scheduleTask() row for real schedule tasks.
 */
function renderScheduleTaskCards(schedule) {
  const exercises = schedule?.exercises || [];
  if (!exercises.length) {
    return `<div class="card muted center">這一天尚未安排復健課表。</div>`;
  }
  return exercises
    .map((ex, idx) => {
      const catalog = ex.exerciseId ? exerciseService.getNormalizedById(ex.exerciseId) : null;
      const imageHtml = catalog ? renderExerciseCardImage(catalog) : `<div class="exercise-grid-card-image exercise-grid-card-image-fallback"></div>`;
      const detail = ex.instructions || ex.targetBodyPart || "";
      const actionHtml = renderScheduleExerciseAction(schedule.id, idx, ex.status);
      const trainingMode = catalog && catalog.raw && catalog.raw.trainingMode;
      const aiHtml = trainingMode === "pose_analysis" ? renderTrainingModeBadge(trainingMode) : "";
      return `<div class="schedule-task-row">
        <div class="schedule-task-image">${imageHtml}</div>
        <div class="schedule-task-center">
          <b class="schedule-task-name">${ex.exerciseName}</b>
          <div class="small">${formatExerciseMetric(ex)}</div>
          ${detail ? `<div class="small schedule-task-detail">${detail}</div>` : ""}
          ${aiHtml}
        </div>
        <div class="schedule-task-right">${actionHtml}</div>
      </div>`;
    })
    .join("");
}

/**
 * Rule-based reminder text (not an LLM call). Kept as its own function so a
 * real AI-generated version can replace the body later without touching
 * callers.
 */
function generateScheduleReminder(schedule) {
  const exercises = schedule && Array.isArray(schedule.exercises) ? schedule.exercises : [];
  if (!exercises.length) {
    return "請依復健師指示完成今日訓練，若有不適請立即停止。";
  }
  const sentences = [`今天共有 ${exercises.length} 項訓練`];
  const first = exercises[0];
  if (first && first.instructions) {
    sentences.push(`「${first.exerciseName}」請留意：${first.instructions}`);
  }
  if (exercises.some((ex) => ex.durationSeconds != null)) {
    sentences.push("持續型動作請保持穩定、量力而為，若感到不適請立即停止");
  }
  if (exercises.some((ex) => /髖|下肢|膝|臀|腿/.test(ex.targetBodyPart || ""))) {
    sentences.push("下肢／髖關節動作請注意膝蓋與腳尖方向一致，並保持核心穩定");
  }
  return `${sentences.join("；")}。`;
}

/**
 * Splits an Excel text field (steps/key_points/common_errors/precautions)
 * into readable list items — the source data mixes newline-numbered lists,
 * single-line 、/，/, separated phrases, etc.
 */
function splitToListItems(text) {
  if (!text) return [];
  const trimmed = String(text).trim();
  if (!trimmed) return [];
  let parts = trimmed.split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) {
    parts = trimmed.split(/[、，,]/).map((s) => s.trim()).filter(Boolean);
  }
  if (!parts.length) parts = [trimmed];
  return parts.map((s) => s.replace(/^\d+[.、)]\s*/, ""));
}

function renderDetailListSection(title, text) {
  const items = splitToListItems(text);
  if (!items.length) return "";
  return `<h3 class="section-title">${title}</h3><div class="card"><ul class="detail-list">${items
    .map((item) => `<li>${item}</li>`)
    .join("")}</ul></div>`;
}

function renderDetailTextSection(title, text) {
  if (!text) return "";
  return `<h3 class="section-title">${title}</h3><div class="card"><div class="small">${text}</div></div>`;
}

/**
 * Phase 5.4.4 (report section 18/I) — groups related fields into one card
 * with labeled sub-sections, instead of a separate heading+card per field.
 * Purely presentational: every original field/label/string is preserved
 * verbatim, nothing is summarized, reworded, or dropped. iconSrc is
 * optional — per report section 19, an asset is only used when it
 * genuinely fits; leave it out rather than force a mismatched image (e.g.
 * no fitting "caution" icon exists in the current asset set, so the
 * 注意什麼 card below intentionally has none).
 */
function renderDetailGroupedCard(title, iconSrc, groups) {
  const bodyHtml = groups
    .filter((g) => g.items && g.items.length)
    .map(
      (g) =>
        `<div class="detail-subsection"><div class="detail-subsection-label">${g.label}</div><ul class="detail-list${g.ordered ? " detail-list-ordered" : ""}">${g.items
          .map((item) => `<li>${item}</li>`)
          .join("")}</ul></div>`
    )
    .join("");
  if (!bodyHtml) return "";
  const iconHtml = iconSrc ? `<img class="section-title-icon" src="${iconSrc}" alt="" />` : "";
  return `<h3 class="section-title">${iconHtml}${title}</h3><div class="card detail-grouped-card">${bodyHtml}</div>`;
}

function isValidVideoUrl(url) {
  if (!url) return false;
  const trimmed = String(url).trim();
  return /^https?:\/\//i.test(trimmed);
}

function renderVideoSection(catalogExercise) {
  const url = catalogExercise?.demo_video_url;
  if (isValidVideoUrl(url)) {
    const safeUrl = String(url).trim();
    return `<h3 class="section-title">示範影片</h3><div class="card center"><button class="btn btn-primary full" onclick="window.open('${safeUrl}', '_blank')">觀看示範影片</button></div>`;
  }
  return `<h3 class="section-title">示範影片</h3><img class="demo-shot" src="/images/trainpic1.png" alt="${catalogExercise?.exercise_name || "復健動作示意圖"}" /><div class="small center" style="margin-top:6px;">目前尚無示範影片</div>`;
}

// getPatientLatestAnalysis()/getPatientWeeklyCompletionCount() (Phase 4.2)
// were superseded in Phase 6.3 by buildWeeklyTrainingProgress()/
// buildTrainingHistoryEntry() (same rolling 7-day window philosophy, now
// shared by My Progress AND Training History instead of a Home-only
// one-off) and removed since nothing else called them.

/**
 * ReMotion Phase 6.3 — canonical training-history/progress view-model
 * helpers (report section 5/6/7). Pure read adapters over analysisService
 * data: never mutate a record, never write anything back to storage, never
 * invent a number a record doesn't actually contain.
 *
 * DATE FIELD: (record.completedAt || record.createdAt) — deliberately the
 * exact same two-field fallback gamificationEngine.js's toDateStr() already
 * uses for streak calculation (not a third field), so History/My Progress
 * can never disagree with the streak the patient already sees elsewhere.
 * (record.capturedAt exists on the old Phase 1 seed/mock records too, but
 * on every one of them it's already identical to createdAt, so including it
 * in the fallback chain would never change an actual date — see report
 * section 4/8 for the full audit trail.)
 */
function resolveRecordTimestamp(record) {
  return (record && (record.completedAt || record.createdAt)) || null;
}

/**
 * exerciseName resolution order: the record's own persisted exerciseName
 * (every real LE01/HP02-style record has this) -> current catalog lookup by
 * exerciseId (works for any record whose exerciseId matches a real
 * exercise_id) -> the raw exerciseId string itself (the old Phase 1 seed
 * records use a legacy "ex_squat"/"ex_arm_stretch" id scheme that matches
 * neither of the above -- showing the raw id is honest, not a guess) ->
 * a final "未命名動作" only if the record has no exerciseId at all.
 */
function resolveRecordExerciseName(record) {
  if (!record) return "未命名動作";
  if (record.exerciseName) return record.exerciseName;
  const catalog = record.exerciseId ? exerciseService.getById(record.exerciseId) : null;
  if (catalog && catalog.exercise_name) return catalog.exercise_name;
  return record.exerciseId || "未命名動作";
}

/**
 * Report section 6 — single source of truth for how a record's source is
 * labeled everywhere (My Progress recent session, History cards/filter,
 * Record Detail). Directly reuses analysisService's existing
 * getRecordSource() (a DIRECT field read with its own documented legacy
 * default, not a new fallback layer) rather than re-deriving it here.
 *
 * IMPORTANT AUDIT FINDING (report section 4/6): analysisRecord.source is
 * only ever "assigned" or "self_practice" — a recommendation-originated
 * session is persisted with source: "self_practice" (Phase 3.1's
 * navigateAfterSquat()/persistSquatSession() confirm navigationOrigin is
 * pure in-memory UI state, never written onto the record). There is
 * currently NO way to distinguish a past recommendation completion from a
 * genuine self-practice one, so "AI 推薦/今日建議" is NOT offered as a
 * distinct, real history source this phase (see report section 33 for why
 * no schema field was added to make this distinction retroactively
 * possible).
 */
function normalizeTrainingSource(record) {
  const raw = getRecordSource(record);
  if (raw === ANALYSIS_RECORD_SOURCES.ASSIGNED) return { key: "assigned", label: "復健師安排" };
  if (raw === ANALYSIS_RECORD_SOURCES.SELF_PRACTICE) return { key: "self_practice", label: "自主練習" };
  return { key: "unknown", label: "練習紀錄" };
}

/**
 * Report section 5 — the canonical per-record view model every
 * History/Progress/Detail renderer reads from, instead of each page poking
 * at raw record fields with its own ad-hoc logic. This is a UI adapter
 * only, NOT a new persistence shape — nothing here is ever written back to
 * analysisService.
 *
 * durationSeconds is always null: audited and confirmed no field anywhere
 * captures true session wall-clock duration (summary.averageRepDuration is
 * a PER-REP average, not a session total) — rather than approximate one by
 * multiplying reps x average duration (which would silently exclude
 * countdown/pause time and misrepresent a real measurement), this phase
 * leaves it unavailable and never displays a duration figure for it.
 *
 * XP: report section 23 Option B — no record persists its own session XP,
 * so this recomputes through gamificationEngine.computeSessionXp(record),
 * the exact same engine getPatientXP()/Home/Profile already use. No second
 * XP formula exists anywhere in this file.
 */
function buildTrainingHistoryEntry(record) {
  const source = normalizeTrainingSource(record);
  const summary = record.summary || null;
  const completedReps = summary ? (summary.totalReps ?? null) : null;
  const targetReps = summary ? (summary.targetReps ?? null) : (record.targetReps ?? null);
  const completionRatio = completedReps != null && targetReps ? Math.min(1, completedReps / targetReps) : null;
  const qualityValidReps = summary ? (summary.qualityValidReps ?? null) : null;
  const qualityRatio = calculateQualityRatioPercent(completedReps || 0, qualityValidReps || 0);
  const prototypeScore = record.score ?? record.overallScore ?? null;
  const xpResult = gamificationEngine.computeSessionXp(record);
  const isSquatDetail = record.analysisMode === SQUAT_ANALYSIS_MODE;
  const isCr05Detail = record.analysisMode === CR05_ANALYSIS_MODE;
  const isKn03Detail = record.analysisMode === KN03_ANALYSIS_MODE;
  const isLe05Detail = record.analysisMode === LE05_ANALYSIS_MODE;
  const isLe03Detail = record.analysisMode === LE03_ANALYSIS_MODE;
  const isLe04Detail = record.analysisMode === LE04_ANALYSIS_MODE;

  const summaryParts = [];
  if (completedReps != null && targetReps) summaryParts.push(`${completedReps} / ${targetReps} 次`);
  else if (completedReps != null) summaryParts.push(`${completedReps} 次`);
  if ((isCr05Detail || isKn03Detail || isLe05Detail || isLe03Detail || isLe04Detail) && prototypeScore != null) summaryParts.push(`品質 ${prototypeScore} 分`);
  else if (qualityRatio != null) summaryParts.push(`品質 ${qualityRatio}%`);

  return {
    recordId: record.id,
    exerciseId: record.exerciseId || null,
    exerciseName: resolveRecordExerciseName(record),
    completedAt: resolveRecordTimestamp(record),
    sourceType: source.key,
    sourceLabel: source.label,
    analysisMode: record.analysisMode || null,
    durationSeconds: null,
    xpEarned: xpResult ? xpResult.xp : null,
    completion: { completedReps, targetReps, completionRatio },
    quality: { qualityValidReps, qualityRatio, prototypeScore },
    summaryLabel: summaryParts.join("｜") || "—",
    detailType: isSquatDetail ? "squat" : isCr05Detail ? "cr05" : isKn03Detail ? "kn03" : isLe05Detail ? "le05" : isLe03Detail ? "le03" : isLe04Detail ? "le04" : "generic",
  };
}

/**
 * Report section 7 — rolling 7-day window (today + 6 days back), the same
 * boundary the old (now-removed) Phase 4.2 getPatientWeeklyCompletionCount()
 * used — this phase does not invent a second, Monday-start definition of
 * "week" alongside it.
 */
function buildWeeklyTrainingProgress(records, now = new Date()) {
  const cutoffStart = new Date(now);
  cutoffStart.setDate(cutoffStart.getDate() - 6);
  cutoffStart.setHours(0, 0, 0, 0);
  const prevCutoffStart = new Date(cutoffStart);
  prevCutoffStart.setDate(prevCutoffStart.getDate() - 7);

  const dated = records
    .map((r) => ({ record: r, ts: resolveRecordTimestamp(r) }))
    .filter((x) => x.ts)
    .map((x) => ({ ...x, date: new Date(x.ts) }));

  const thisWeek = dated.filter((x) => x.date >= cutoffStart && x.date <= now);
  const prevWeek = dated.filter((x) => x.date >= prevCutoffStart && x.date < cutoffStart);

  // Phase 6.4 report section 7/26 — holds a real per-day COUNT (not just a
  // boolean) so the Weekly Activity visual can show "2次" under a day with
  // multiple real sessions, not just an active/inactive dot. Every existing
  // consumer only ever checked truthiness (`!!completedByDay[dateStr]`),
  // so a count > 0 is a safe, backward-compatible superset of the old
  // boolean shape.
  const completedByDay = {};
  thisWeek.forEach((x) => {
    const dateStr = formatDateStr(x.date);
    completedByDay[dateStr] = (completedByDay[dateStr] || 0) + 1;
  });

  const sortedByRecency = [...dated].sort((a, b) => b.date - a.date);

  return {
    sessionCount: thisWeek.length,
    activeDays: Object.keys(completedByDay).length,
    totalXp: thisWeek.reduce((sum, x) => sum + gamificationEngine.computeSessionXp(x.record).xp, 0),
    totalCompletedReps: thisWeek.reduce((sum, x) => sum + (x.record.summary ? (x.record.summary.totalReps || 0) : 0), 0),
    completedByDay,
    latestRecord: sortedByRecency.length ? sortedByRecency[0].record : null,
    previousWeekSessionCount: prevWeek.length,
    sessionDelta: thisWeek.length - prevWeek.length,
    // extra field beyond the spec's minimum shape, used only by the
    // deterministic (non-AI) History summary sentence (report section 21)
    thisWeekRecords: thisWeek.map((x) => x.record),
  };
}

/** Report section 11 — 7-day strip (oldest to today, left to right), reusing the app's existing WEEKDAY_LABELS/formatDateStr rather than a new date formatter. */
function buildWeekdayStrip(completedByDay, now = new Date()) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dateStr = formatDateStr(d);
    const count = completedByDay[dateStr] || 0;
    days.push({ dateStr, label: WEEKDAY_LABELS[d.getDay()], active: count > 0, count, isToday: i === 0 });
  }
  return days;
}

/**
 * Phase 6.4.2 report section 4/7 — the compact Home card's tiny 7-star
 * trail. Same star-language rule as the full Weekly Activity card: an
 * active day is a real progress_star_green (star_gold specifically for
 * today when today is active, per report section 4's "star_gold =
 * highlight" rule), an inactive day is the SAME asset dimmed+grayscaled
 * (never a fake weekly-goal fraction — always exactly 7 stars, one per
 * calendar day, matching the report's explicit "not 3/5 unless a real
 * 5-day goal exists" instruction).
 */
function renderHomeWeekStarMini(days) {
  return days
    .map((d) => {
      const src = d.isToday && d.active ? "/images/gamification/star_gold.png" : "/images/gamification/progress_star_green.png";
      const classes = ["home-week-star-mini"];
      if (!d.active) classes.push("inactive");
      if (d.isToday) classes.push("is-today");
      return `<img class="${classes.join(" ")}" src="${src}" alt="" />`;
    })
    .join("");
}

/** Report section 15 — "今天"/"昨天"/"YYYY/MM/DD" group headers, using real Date arithmetic (not string math) for the same reason todayStr() already does. */
function formatHistoryGroupLabel(dateStr) {
  if (dateStr === todayStr()) return "今天";
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateStr === formatDateStr(y)) return "昨天";
  return dateStr.replace(/-/g, "/");
}

/** "今天 14:32" / "08/03 09:12" -- shared by My Progress's recent session and the History card list. */
function formatRecordDateTime(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatHistoryGroupLabel(formatDateStr(d))} ${formatClockTime(d)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// ReMotion 2.0 Phase 4 — AI companion (robot) helper. A single reusable
// mapping + renderer so no page hardcodes an /images/robot/... path
// directly; every caller just names the semantic state it wants.
// ─────────────────────────────────────────────────────────────────────────
const ROBOT_ASSETS = {
  idle: "/images/robot/robot_idle.png",
  happy: "/images/robot/robot_happy.png",
  thinking: "/images/robot/robot_thinking.png",
  encourage: "/images/robot/robot_encourage.png",
  loading: "/images/robot/robot_loading.png",
  search: "/images/robot/robot_search.png",
  success: "/images/robot/robot_success.png",
  warning: "/images/robot/robot_warning.png",
  wave: "/images/robot/robot_wave.png",
  listening: "/images/robot/robot_listening.png",
  celebrate: "/images/robot/robot_celebrate.png",
  sleep: "/images/robot/robot_sleep.png",
  sad: "/images/robot/robot_sad.png",
};

function renderRobot(stateKey, size) {
  const src = ROBOT_ASSETS[stateKey] || ROBOT_ASSETS.idle;
  return `<img class="robot-avatar robot-avatar-${size || "md"}" src="${src}" alt="AI 復健陪伴機器人" />`;
}

/**
 * Single deterministic mapping from real UI state to a robot mood — used by
 * the Home greeting so the robot always reflects the patient's actual
 * progress today rather than a random/decorative pick. See Phase 4 spec
 * section 9 for the intended mapping table this follows.
 */
function pickHomeRobotState(status) {
  if (!status.hasAnyTaskToday) return "listening";
  if (status.allDone) return "celebrate";
  if (status.totalCompleted > 0) return "encourage";
  return "wave";
}

/**
 * Combines the two independently-tracked "today" progress sources —
 * therapist-assigned schedule (schedule.exercises[].status) and today's AI
 * recommendation (isRecommendationItemCompleted heuristic) — WITHOUT
 * merging them into one number. They're kept and displayed as two separate
 * counts on purpose: assigned completion and recommendation completion are
 * different `source` semantics (Phase 3.1), and an exerciseId can
 * legitimately appear in both on the same day. Rather than attempting a
 * cross-source dedup (which would need to guess whether one completion
 * should "count for" the other), every caller shows both counts clearly
 * labeled, side by side, and only ever sums them for a plain item count —
 * never a merged/deduplicated completion fraction.
 */
function getTodayStructuredStatus(patientId) {
  const dateStr = todayStr();
  const schedule = getPatientScheduleForDate(patientId, dateStr);
  const assignedExercises = schedule?.exercises || [];
  const assignedTotal = assignedExercises.length;
  const assignedCompleted = assignedExercises.filter((e) => e.status === "completed").length;

  let recommendationTotal = 0;
  let recommendationCompleted = 0;
  const active = assessmentService.getActiveByPatientId(patientId);
  if (active) {
    const recommendation = getTodaysRecommendationForPatient(patientId, active);
    const items = recommendation ? recommendation.items : [];
    const recommendationDateStr = recommendation ? (recommendation.createdAt || "").slice(0, 10) : dateStr;
    recommendationTotal = items.length;
    recommendationCompleted = items.filter((it) => isRecommendationItemCompleted(it.exerciseId, recommendationDateStr, patientId)).length;
  }

  const totalItems = assignedTotal + recommendationTotal;
  const totalCompleted = assignedCompleted + recommendationCompleted;
  return {
    assignedTotal,
    assignedCompleted,
    recommendationTotal,
    recommendationCompleted,
    totalItems,
    totalCompleted,
    hasAnyTaskToday: totalItems > 0,
    allDone: totalItems > 0 && totalCompleted === totalItems,
  };
}

/**
 * Home's single primary action, per Phase 4 spec section 6 priority order:
 * unfinished assigned task > unfinished recommendation > free self practice.
 * Never auto-navigates — this only decides what the one CTA button says
 * and where it points; the patient still has to tap it.
 */
function getPrimaryHomeAction(status) {
  if (status.assignedTotal > 0 && status.assignedCompleted < status.assignedTotal) {
    return { label: "繼續今日復健", fn: "goSchedule()" };
  }
  if (status.recommendationTotal > 0 && status.recommendationCompleted < status.recommendationTotal) {
    return { label: "繼續今日建議", fn: "goTodaysRecommendation()" };
  }
  return { label: "自由練習", fn: "goSelfPracticeLibrary()" };
}

/**
 * Phase 4.2 — more specific state-aware greeting copy, still built only
 * from real getTodayStructuredStatus() numbers (never a fabricated count).
 * Ordered from most to least specific so the most useful real distinction
 * (what's actually left to do, and where) always wins over a generic line.
 */
/**
 * Phase 4.4 — returns { status, next } instead of one combined sentence:
 * a long comma-joined line reads as clutter and its length varies wildly
 * with the underlying numbers, so status and next-step are always split
 * into two short fragments (no trailing period on either — spec section
 * 3). `next` is null for the single-line states, so the caller can skip
 * rendering an empty second line.
 */
function buildHomeGreetingLines(status) {
  const { assignedTotal, assignedCompleted, recommendationTotal, recommendationCompleted, hasAnyTaskToday, allDone, totalCompleted } = status;
  if (!hasAnyTaskToday) return { status: "今天可以自由安排", next: "從適合自己的練習開始" };
  if (allDone) return { status: "今天的復健都完成了", next: "可以好好休息一下" };
  const assignedDone = assignedTotal > 0 && assignedCompleted === assignedTotal;
  if (assignedDone && recommendationTotal > recommendationCompleted) {
    return { status: "復健師課表完成了", next: `接著還有 ${recommendationTotal - recommendationCompleted} 個個人化練習` };
  }
  if (assignedTotal === 0 && recommendationTotal > 0 && recommendationCompleted === 0) {
    return { status: "今天沒有指定課表", next: `我幫你整理了 ${recommendationTotal} 個適合的練習` };
  }
  if (totalCompleted > 0) return { status: `今天已完成 ${totalCompleted} 項練習`, next: "繼續照自己的節奏前進" };
  return { status: "今天也一起動一動吧", next: null };
}

/**
 * Phase 4.3 — short third-line encouragement microcopy for the greeting
 * hero. Still derived from real status (not random), but deliberately
 * generic/short — this is tone, not a new data point.
 */
function buildHomeEncouragementText(status) {
  if (!status.hasAnyTaskToday) return "放輕鬆，找一個適合的練習開始吧。";
  if (status.allDone) return "今天辛苦了，好好休息一下！";
  if (status.totalCompleted > 0) return "保持這個節奏，繼續加油！";
  return "準備好了嗎？我們開始吧！";
}

// ─────────────────────────────────────────────────────────────────────────
// ReMotion 2.0 Phase 3 — Recommendation Engine wiring. Both patientHome's
// summary card and the detail page need the same "today's session for
// this patient" lookup, so it's centralized here rather than duplicated —
// UI stays limited to calling this + rendering, all scoring/session logic
// lives in js/data/recommendationEngine.js.
// ─────────────────────────────────────────────────────────────────────────

/** Idempotent for the day: returns the same stored recommendation on repeated calls until the active assessment changes (see recommendationService.getTodaysRecommendation). */
function getTodaysRecommendationForPatient(patientId, assessment) {
  if (!patientId || !assessment) return null;
  const result = recommendationService.getTodaysRecommendation({
    patientId,
    assessment,
    dateStr: todayStr(),
    candidates: exerciseService.listNormalizedWithKnownGoals(),
  });
  return result.error ? null : result.recommendation;
}

/** Real per-item minute estimates re-derived from the catalog at render time (stored items don't carry them) — sums only when every item's estimate is known, never a fabricated approximate total. */
function summarizeRecommendationItems(items) {
  const list = items || [];
  const minutesList = list.map((it) => {
    const ex = exerciseService.getNormalizedById(it.exerciseId);
    return ex ? estimateRecommendationExerciseMinutes(ex) : null;
  });
  const allKnown = list.length > 0 && minutesList.every((m) => m != null);
  const estimatedMinutes = allKnown ? Math.round(minutesList.reduce((a, b) => a + b, 0)) : null;
  return { itemCount: list.length, estimatedMinutes };
}

/**
 * ReMotion 2.0 Phase 3.1 — Session Progress "is this item completed"
 * check. IMPORTANT LIMITATION (see Phase 3.1 report item 9/11):
 * analysisRecord has no recommendationId field, and Phase 3.1 deliberately
 * does not add one (spec: "如果現有schema無法可靠關聯recommendationId，
 * 請先回報，不要自行大改schema"). This is a best-effort heuristic instead
 * of a precise link: an exercise counts as "completed" for today's session
 * if the patient has ANY self_practice analysisRecord for that exact
 * exerciseId dated the same day the recommendation was generated. This
 * reuses existing analysisRecord data only — no second completion-tracking
 * system — but can't distinguish "completed because of this recommendation"
 * from "happened to self-practice the same exercise the same day for
 * unrelated reasons." In practice this is rare and not harmful (it just
 * shows as completed a little generously), but it's not a precise link.
 */
function isRecommendationItemCompleted(exerciseId, recommendationDateStr, patientId) {
  return analysisService.getByPatientId(patientId).some(
    (r) =>
      r.exerciseId === exerciseId &&
      getRecordSource(r) === "self_practice" &&
      (r.completedAt || r.createdAt || "").slice(0, 10) === recommendationDateStr
  );
}

function renderInviteCodeCard() {
  const messageHtml = state.inviteMessage
    ? `<div class="small" style="color:#c0392b; margin:6px 0;">${state.inviteMessage}</div>`
    : "";

  if (state.inviteLookupResult) {
    const { therapist, code, isReactivation } = state.inviteLookupResult;
    const confirmText = isReactivation ? "您曾加入此復健師，是否重新加入？" : "確認加入此復健師的個案名單？";
    return `<div class="card" style="margin-bottom:14px;">
      <b>找到復健師</b>
      <div class="small" style="margin-top:6px;">姓名：${therapist.name}</div>
      <div class="small">身分：復健師</div>
      <div class="small">邀請碼：${code}</div>
      <div class="small" style="margin-top:6px;">${confirmText}</div>
      ${messageHtml}
      <div class="row" style="margin-top:10px;">
        <button class="btn btn-light" style="flex:1" onclick="onInviteCodeCancel()">取消</button>
        <button class="btn btn-primary" style="flex:1" onclick="onInviteCodeConfirm()">確認加入</button>
      </div>
    </div>`;
  }

  return `<div class="card" style="margin-bottom:14px;">
    <b>尚未加入復健師</b>
    <div class="small" style="margin:6px 0;">請輸入復健師提供的邀請碼，加入其個案管理名單。</div>
    ${messageHtml}
    <input id="inviteCodeInput" placeholder="RM-XXXXXX" oninput="this.value = this.value.toUpperCase()" />
    <div style="height:8px"></div>
    <button class="btn btn-primary full" onclick="onInviteCodeQuery()">查詢復健師</button>
  </div>`;
}

function onInviteCodeQuery() {
  const raw = document.getElementById("inviteCodeInput").value;
  const code = raw.trim().toUpperCase();
  if (!code) {
    state.inviteMessage = "請輸入邀請碼";
    state.inviteLookupResult = null;
    return render();
  }
  const therapist = relationService.findTherapistByInviteCode(code);
  if (!therapist) {
    state.inviteMessage = "找不到此邀請碼，請確認後再試一次。";
    state.inviteLookupResult = null;
    return render();
  }
  const existing = relationService.findAcceptedRelation(therapist.id, state.user.id);
  if (existing) {
    state.inviteMessage = "您已經加入此復健師的個案名單。";
    state.inviteLookupResult = null;
    return render();
  }
  const activeElsewhere = relationService.findActiveByPatientId(state.user.id);
  if (activeElsewhere.length) {
    state.inviteMessage = "請先離開目前復健師，再加入新的復健師。";
    state.inviteLookupResult = null;
    return render();
  }
  const past = relationService.findPastRelation(therapist.id, state.user.id);
  state.inviteMessage = null;
  state.inviteLookupResult = { therapist, code, isReactivation: !!past };
  render();
}

function onInviteCodeCancel() {
  state.inviteLookupResult = null;
  state.inviteMessage = null;
  render();
}

function onInviteCodeConfirm() {
  const { therapist, code } = state.inviteLookupResult;
  const result = relationService.acceptByInviteCode(state.user.id, code);
  if (result.error) {
    state.inviteMessage = result.error;
    state.inviteLookupResult = null;
    return render();
  }
  state.inviteLookupResult = null;
  state.inviteMessage = `已成功加入${therapist.name}復健師的個案名單。`;
  render();
}

const PATIENT_LEAVE_REASONS = ["更換復健師", "療程已結束", "不再接受服務", "其他"];

function renderPatientLeaveCard(relation) {
  if (!state.patientLeaveConfirming || !relation) return "";
  const reasonOptionsHtml = PATIENT_LEAVE_REASONS
    .map((r) => `<button type="button" class="reason-option ${state.patientLeaveReason === r ? "selected" : ""}" onclick="selectPatientLeaveReason('${r}')">${r}</button>`)
    .join("");
  const customReasonHtml = state.patientLeaveReason === "其他"
    ? `<input id="patientLeaveCustomReason" placeholder="請輸入原因" style="margin-top:8px;" />`
    : "";
  return `<div class="confirm-card danger">
    <b>離開後，此復健師將無法再為您安排新課表。過去課表及訓練紀錄仍會保留。</b>
    <div class="small" style="margin:8px 0 4px;">請選擇原因：</div>
    ${reasonOptionsHtml}
    ${customReasonHtml}
    <div class="row" style="margin-top:10px;">
      <button class="btn btn-light" style="flex:1" onclick="cancelPatientLeave()">取消</button>
      <button class="btn btn-primary" style="flex:1" onclick="confirmPatientLeave('${relation.id}')">確認離開</button>
    </div>
  </div>`;
}

function renderPatientCareHistory(patientId) {
  const history = relationService.findHistoryByPatientId(patientId);
  if (!history.length) return `<div class="card muted center">尚無照護歷史。</div>`;
  return history
    .map((r) => {
      const therapist = userService.getById(r.therapistId);
      const statusLabel = r.status === "completed" ? "療程完成" : "已解除";
      const startDate = (r.acceptedAt || r.createdAt || "").slice(0, 10);
      const endDate = (r.completedAt || r.revokedAt || "").slice(0, 10);
      return `<div class="card" style="margin-bottom:8px;">
        <b>${therapist ? therapist.name : "復健師"}</b>
        <div class="small">狀態：${statusLabel}</div>
        <div class="small">${startDate} ～ ${endDate}</div>
        <div class="small">原因：${r.endReason || "-"}</div>
      </div>`;
    })
    .join("");
}

function startPatientLeave() {
  state.patientLeaveConfirming = true;
  state.patientLeaveReason = null;
  render();
}

function selectPatientLeaveReason(reason) {
  state.patientLeaveReason = reason;
  render();
}

function cancelPatientLeave() {
  state.patientLeaveConfirming = false;
  state.patientLeaveReason = null;
  render();
}

function confirmPatientLeave(relationId) {
  let reason = state.patientLeaveReason;
  if (!reason) return alert("請選擇原因");
  if (reason === "其他") {
    const custom = document.getElementById("patientLeaveCustomReason");
    reason = custom && custom.value.trim() ? custom.value.trim() : "其他";
  }
  relationService.revoke(relationId, state.user.id, reason);
  state.patientLeaveConfirming = false;
  state.patientLeaveReason = null;
  alert("您已離開此復健師的個案名單。");
  render();
}

/**
 * Centralized <img> fallback: every image src currently used in the app
 * maps to another image that actually exists in public/images, so a broken
 * icon never shows blank text or a browser "broken image" glyph. Bottom-nav
 * icons fall back to their own on/off pair (never all collapse to one
 * generic icon); everything else falls back to trainpic1.png, which is
 * confirmed to exist. If the fallback itself ever fails to load, the image
 * is hidden rather than looping onerror forever.
 */
const IMAGE_FALLBACK_MAP = {
  "/images/home.png": "/images/home_selected.png",
  "/images/home_selected.png": "/images/home.png",
  "/images/data.png": "/images/data_selected.png",
  "/images/data_selected.png": "/images/data.png",
  "/images/profile.png": "/images/profile_selected.png",
  "/images/profile_selected.png": "/images/profile.png",
  "/images/files.png": "/images/files_selected.png",
  "/images/files_selected.png": "/images/files.png",
  "/images/train.png": "/images/train_selected.png",
  "/images/train_selected.png": "/images/train.png",
};
const DEFAULT_IMAGE_FALLBACK = "/images/trainpic1.png";

function handleImageError(img, fallbackPath) {
  if (!fallbackPath || img.dataset.imgFallbackApplied === "1") {
    img.onerror = null;
    img.style.display = "none";
    return;
  }
  img.dataset.imgFallbackApplied = "1";
  img.onerror = null;
  img.src = fallbackPath;
}

function attachImageFallbacks(root) {
  root.querySelectorAll("img").forEach((img) => {
    const originalSrc = img.getAttribute("src");
    img.onerror = () => {
      const fallback = IMAGE_FALLBACK_MAP[originalSrc] || DEFAULT_IMAGE_FALLBACK;
      handleImageError(img, fallback === originalSrc ? DEFAULT_IMAGE_FALLBACK : fallback);
    };
  });
}
window.handleImageError = handleImageError;

const BASE_TABS = [
  { key: "home", off: "/images/home.png", on: "/images/home_selected.png", label: "首頁" },
  { key: "data", off: "/images/data.png", on: "/images/data_selected.png", label: "數據" },
  { key: "profile", off: "/images/profile.png", on: "/images/profile_selected.png", label: "我的" },
];

const state = {
  route: "splash",
  tab: "home",
  user: null,
  // which schedule/exercise the "動作詳情頁"／"動作偵測準備頁" are currently showing;
  // memory-only like the rest of `state`, so a hard reload naturally falls back to
  // the dashboard instead of a blank page (see getSelectedScheduleExercise()).
  selectedScheduleId: null,
  selectedExerciseIndex: null,
  selectedExerciseId: null,
  // which patient the therapist is currently viewing/acting on
  selectedPatientId: null,
  // step-based auth flow: chooseMode -> chooseRole -> form -> registerSuccess
  authStep: "chooseMode",
  authMode: null, // 'login' | 'register'
  authRole: null, // 'patient' | 'therapist'
  authMessage: null,
  authLoading: false,
  // patient-side invite-code entry (on patientHome, before an accepted relation exists)
  inviteLookupResult: null,
  inviteMessage: null,
  // therapist-side complete/revoke confirmation card, and patient-side leave-therapist card
  relationActionType: null, // 'complete' | 'revoke' | null
  relationActionReason: null,
  patientLeaveConfirming: false,
  patientLeaveReason: null,
  caseListView: "active", // 'active' | 'history'
  devAccountsFilter: "all", // 'all' | 'patient' | 'therapist'
  devAccountsSearch: "",
  devAccountsRevealedIds: [], // user ids currently showing their raw password
  devAccountsResetConfirmingId: null,
  editAccountId: null,
  editAccountMessage: null,
  transferPreview: null,
  transferConfirming: false,
  transferResult: null,

  // ReMotion 2.0 Phase 2 — patient assessment intake flow
  assessmentDraft: null, // { bodyParts:[], goals:[], abilityLevel:null, preferredSessionMinutes:null }
  assessmentFormStep: 1, // 1-4
  assessmentEditMode: null, // null = fresh create | "update" (in place) | "reassess" (new version)
  assessmentSuccessMessage: null,

  // Which context the exercise-detail/AI-detection pages are currently
  // showing for — "assigned" (therapist schedule task, existing behavior)
  // or "self_practice" (patient browsing rehabExercises on their own).
  // This is what analysisRecord.source is tagged from — only ever these
  // two values, never "recommendation" (see navigationOrigin below).
  exerciseContext: "assigned",
  // ReMotion 2.0 Phase 3.1 — separate from exerciseContext: purely
  // controls where the 返回 button on exercise-related pages leads back
  // to ("assigned" | "self_practice" | "recommendation"). A recommended
  // exercise still trains/analyzes as exerciseContext "self_practice" —
  // navigationOrigin only changes the return route, never the training
  // source.
  navigationOrigin: "assigned",

  // Self Practice Library — quick-category exploration state (Phase 2.5,
  // extended Phase 6.1 with search + trainingMode, extended Phase 6.2 with
  // Discovery/Results view mode). selfPracticeBrowseAll is the only new
  // stored field Phase 6.2 adds — "which mode is the page in" is derived
  // (see getSelfPracticeViewMode()), never stored redundantly, so it can
  // never drift out of sync with the actual filter state (report section
  // 20: "避免同時建立多個互相矛盾 boolean").
  selfPracticeBodyPart: "",
  selfPracticeGoal: "",
  selfPracticeDifficultyTier: "",
  selfPracticeTrainingMode: "",
  selfPracticeSearchQuery: "",
  selfPracticeBrowseAll: false,
  selfPracticeFiltersPanelOpen: false,

  // Phase 6.3 — Training History / Single Record Detail
  selectedRecordId: null,
  trainingHistorySourceFilter: "all", // "all" | "assigned" | "self_practice" | "unknown"

  // Phase 7.1 — AI Dynamic Functional Assessment (separate from the
  // existing patient preference assessment above)
  selectedFunctionalAssessmentSessionId: null,
  // Phase 7.2 — Shoulder Session movement progress. Purely ephemeral UI
  // state (same convention as state.assessmentFormStep for the existing
  // preference-questionnaire wizard) — never persisted, never touches
  // functionalAssessmentService's frozen schema.
  functionalAssessmentShoulderMovementIndex: 0,
};

function setSession(user) {
  state.user = user;
  state.route = determinePatientLandingRoute(user);
  state.tab = "home";
  render();
}

// Firebase decides session persistence across page reloads and devices. The
// local collection cache is always refreshed before the app becomes visible.
authService.subscribe(async (user) => {
  if (user) {
    // Registration deliberately displays its confirmation screen rather than
    // briefly opening the dashboard during Firebase's temporary session.
    if (state.authMode === "register" || state.authLoading) return;
    try {
      await storageService.hydrateCloudForUser(user);
      setSession(user);
    } catch (error) {
      console.error("Unable to load cloud data", error);
      state.authMessage = "無法載入雲端資料，請稍後再試。";
      state.route = "auth";
      render();
    }
    return;
  }
  storageService.clearCloudUser();
  state.user = null;
  if (state.authStep === "registerSuccess") return;
  state.route = "auth";
  render();
});

async function logout() {
  await authService.logout();
  state.user = null;
  state.route = "auth";
  state.tab = "home";
  state.authStep = "chooseMode";
  state.authMode = null;
  state.authRole = null;
  state.authMessage = null;
  render();
}

function phone(content, withNav = false) {
  return `
    <main class="phone">
      <section class="content">${content}</section>
      ${withNav ? renderNav() : ""}
    </main>
  `;
}

function renderNav() {
  const midTab = state.user?.role === "therapist"
    ? { key: "work", off: "/images/files.png", on: "/images/files_selected.png", label: "檔案" }
    : { key: "work", off: "/images/train.png", on: "/images/train_selected.png", label: "訓練" };
  const tabs = [BASE_TABS[0], midTab, BASE_TABS[1], BASE_TABS[2]];

  return `
    <nav class="bottom-nav">
      ${tabs
        .map((v) => {
          const key = v.key;
          const active = state.tab === key;
          return `
          <button class="tab-btn ${active ? "active" : ""}" onclick="switchTab('${key}')">
            <img src="${active ? v.on : v.off}" alt="${v.label}" />
            <span>${v.label}</span>
          </button>`;
        })
        .join("")}
    </nav>
  `;
}

/**
 * Public Landing Page — shown before login (see state.route init: only
 * skipped when a session already exists). Kept as the existing "splash"
 * route/renderSplash() rather than a new parallel page, since this was
 * already the app's pre-login entry point.
 */
function renderSplash() {
  return phone(`
    <div class="landing-page">
      <div class="landing-hero">
        <div class="illustration-slot slot-hero">插畫預留位置</div>
        <h1 class="title" style="margin-bottom:0;">ReMotion</h1>
        <h2 style="margin:2px 0 0;">AI 智慧居家復健</h2>
        <p class="landing-tagline">讓每一次練習，都更了解自己的進步。</p>
      </div>

      <div class="landing-cta-group">
        <button class="btn btn-primary full" onclick="goLandingPrimaryCta()">開始使用</button>
        <button class="btn btn-light full" onclick="goAuth()">登入</button>
      </div>

      <div class="landing-features">
        <div class="landing-feature-card">
          <div class="illustration-slot slot-card">圖示</div>
          <div><b>個人化復健</b><p>依照你的復健需求，整理適合的練習方向（推薦功能將於後續版本推出）。</p></div>
        </div>
        <div class="landing-feature-card">
          <div class="illustration-slot slot-card">圖示</div>
          <div><b>AI 動作分析</b><p>透過鏡頭與人體關節點，提供即時動作回饋（目前支援深蹲）。</p></div>
        </div>
        <div class="landing-feature-card">
          <div class="illustration-slot slot-card">圖示</div>
          <div><b>復健進度紀錄</b><p>保存每次練習結果，看見自己的改變。</p></div>
        </div>
      </div>

      <div class="landing-safety-note">ReMotion 提供居家復健輔助與動作紀錄，不取代專業醫療診斷與治療建議。</div>

      <button class="btn btn-primary full" onclick="goLandingPrimaryCta()">建立我的復健計畫</button>
    </div>
  `);
}

/**
 * Same "where should a patient land" decision used right after login and
 * from the landing page's CTA (if somehow reached while already signed
 * in): therapists always go straight to dashboard; patients go to the
 * assessment intro only if they have no active assessment yet.
 */
function determinePatientLandingRoute(user) {
  if (!user || user.role !== "patient") return "dashboard";
  const active = assessmentService.getActiveByPatientId(user.id);
  return active ? "dashboard" : "patientAssessmentIntro";
}

function goLandingPrimaryCta() {
  if (!state.user) return goAuth();
  state.route = determinePatientLandingRoute(state.user);
  state.tab = "home";
  render();
}

//登入註冊
function renderAuth() {
  const step = state.authStep || "chooseMode";
  if (step === "chooseRole") return phone(renderAuthChooseRole());
  if (step === "form") return phone(renderAuthForm());
  if (step === "registerSuccess") return phone(renderAuthRegisterSuccess());
  return phone(renderAuthChooseMode());
}

function renderAuthChooseMode() {
  return `
    <div class="auth">
      <h1 class="title" style="margin-bottom:2px;">ReMotion</h1>
      <h2 style="margin-top:0;">歡迎使用 ReMotion</h2>
      <p class="small">讓復健訓練與追蹤更簡單</p>
      <p class="small" style="font-size:11px; margin-top:2px;">首次使用可先建立帳號。範例帳密：patient01 / 123456、therapist02 / 123456</p>
      <div style="height:16px"></div>
      <button class="btn btn-primary full" onclick="setAuthMode('login')">登入</button>
      <button class="btn btn-light full" onclick="setAuthMode('register')">建立帳號</button>
    </div>
  `;
}

function renderAuthChooseRole() {
  const heading = state.authMode === "register" ? "建立帳號" : "登入";
  const errorHtml = state.authMessage
    ? `<div class="small" style="color:#c0392b; margin:8px 0;">${state.authMessage}</div>`
    : "";
  return `
    <div class="auth">
      <h2>${heading}</h2>
      <p class="small">請選擇身分</p>
      <div class="role-select-group">
        <button type="button" class="role-option ${state.authRole === "patient" ? "selected" : ""}" onclick="selectAuthRole('patient')">我是患者</button>
        <button type="button" class="role-option ${state.authRole === "therapist" ? "selected" : ""}" onclick="selectAuthRole('therapist')">我是復健師</button>
      </div>
      ${errorHtml}
      <button class="btn btn-primary full" onclick="confirmAuthRole()">下一步</button>
      <button class="btn btn-light full" onclick="goAuth()">返回</button>
    </div>
  `;
}

function renderAuthForm() {
  const roleLabel = state.authRole === "therapist" ? "復健師" : "患者";
  const errorHtml = state.authMessage
    ? `<div class="small" style="color:#c0392b; margin-bottom:8px;">${state.authMessage}</div>`
    : "";

  if (state.authMode === "login") {
    return `
      <div class="auth">
        <h2>登入（${roleLabel}）</h2>
        <div class="card">
          <input id="loginAccount" type="email" autocomplete="email" placeholder="電子郵件" />
          <div style="height:8px"></div>
          <input id="loginPassword" type="password" placeholder="密碼" />
          <div style="height:10px"></div>
          ${errorHtml}
          <button class="btn btn-primary full" onclick="login()">登入</button>
        </div>
        <button class="btn btn-light full" onclick="backToChooseRole()">返回選擇身分</button>
        <p class="small center">還沒有帳號？<span class="more-link" onclick="switchAuthMode('register')">建立帳號</span></p>
      </div>
    `;
  }

  return `
    <div class="auth">
      <h2>建立帳號（${roleLabel}）</h2>
      <div class="card">
        <input id="regName" placeholder="姓名" />
        <div style="height:8px"></div>
        <input id="regAccount" type="email" autocomplete="email" placeholder="電子郵件" />
        <div style="height:8px"></div>
        <input id="regPassword" type="password" placeholder="密碼（至少 6 個字元）" />
        <div style="height:8px"></div>
        <input id="regPasswordConfirm" type="password" placeholder="確認密碼" />
        <div style="height:10px"></div>
        ${errorHtml}
        <button class="btn btn-primary full" onclick="register()">建立帳號</button>
      </div>
      <button class="btn btn-light full" onclick="backToChooseRole()">返回選擇身分</button>
      <p class="small center">已有帳號？<span class="more-link" onclick="switchAuthMode('login')">前往登入</span></p>
    </div>
  `;
}

function renderAuthRegisterSuccess() {
  return `
    <div class="auth center">
      <h2>帳號建立成功</h2>
      <p class="small">帳號建立成功，請使用新帳號登入。</p>
      <button class="btn btn-primary full" onclick="goRegisterSuccessToLogin()">前往登入</button>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// ReMotion 2.0 Phase 2 — Patient Assessment intake (Intro -> 4-step form ->
// Summary -> create/update via assessmentService). Uses ONLY the Phase 1
// Patient Assessment Schema (bodyParts/goals/abilityLevel/
// preferredSessionMinutes) — no new schema invented here.
// ─────────────────────────────────────────────────────────────────────────

const ABILITY_LEVEL_OPTIONS = [
  { value: "beginner", label: "初階", desc: "目前活動量較少，或希望從簡單動作開始。" },
  { value: "intermediate", label: "一般", desc: "可以完成一般日常活動，希望逐步增加訓練。" },
  { value: "advanced", label: "進階", desc: "已有固定活動習慣，希望進行更具挑戰性的練習。" },
];
const SESSION_MINUTES_OPTIONS = [10, 15, 20, 30];
// Preferred display order — purely cosmetic sorting of real category
// values, never invents a category that doesn't exist in the data.
const BODY_PART_DISPLAY_ORDER = ["下肢", "髖關節", "膝關節", "踝關節", "上肢肩部", "核心", "日常生活功能"];

/**
 * Display-only mapping from the real 4-value exercise `difficulty` text
 * (易/普通/非常容易/難) onto a 3-tier beginner/intermediate/advanced visual
 * language, so patient-facing UI never shows raw Excel wording. This never
 * changes the underlying `difficulty` field — only how it's labeled/badged.
 */
const DIFFICULTY_DISPLAY_MAP = {
  "非常容易": { tier: "beginner", label: "初階" },
  "易": { tier: "beginner", label: "初階" },
  "普通": { tier: "intermediate", label: "一般" },
  "難": { tier: "advanced", label: "進階" },
};
const DIFFICULTY_TIER_OPTIONS = [
  { tier: "beginner", label: "初階" },
  { tier: "intermediate", label: "一般" },
  { tier: "advanced", label: "進階" },
];
function getDifficultyDisplay(rawDifficulty) {
  return DIFFICULTY_DISPLAY_MAP[rawDifficulty] || { tier: "unknown", label: rawDifficulty || "-" };
}
function renderDifficultyBadge(rawDifficulty) {
  const d = getDifficultyDisplay(rawDifficulty);
  return `<span class="difficulty-badge tier-${d.tier}">${d.label}</span>`;
}

/**
 * Real PNG icons for the Self Practice Library's "依部位"/"依目標" quick
 * category cards (public/images/icon_body_*.png, icon_goal_*.png) —
 * ONLY used here. Never used for individual Exercise Card thumbnails,
 * which keep their own placeholder until real per-exercise art exists.
 * Keys are the exact category/goal display strings already used
 * elsewhere in the app (getAssessmentBodyPartOptions()/
 * getAssessmentGoalOptions()) — if a future category/goal has no icon
 * here yet, the card simply falls back to the plain illustration slot.
 */
const CATEGORY_ICON_MAP = {
  "下肢": "/images/icon_body_lower_limb.png",
  "髖關節": "/images/icon_body_hip.png",
  "上肢肩部": "/images/icon_body_shoulder.png",
  "核心": "/images/icon_body_core.png",
  "日常生活功能": "/images/icon_body_daily_function.png",
};
const GOAL_ICON_MAP = {
  "肌力": "/images/icon_goal_strength.png",
  "活動度": "/images/icon_goal_mobility.png",
  "平衡": "/images/icon_goal_balance.png",
};

/**
 * ReMotion Phase 6.1 — Exercise Library card thumbnails. Only maps an
 * exercise_id to a real photo when the existing public/images/exercise/
 * asset is a genuine semantic match for that specific exercise (verified
 * by reading each exercise's real steps/description text, not guessed
 * from the filename alone) — see the Phase 6.1 report's asset audit for
 * the full reasoning per mapping. Every other exercise (38 of 44) has no
 * entry here on purpose and falls back to its category icon instead (see
 * renderExerciseCardImage()) rather than a mismatched or generic photo.
 */
const EXERCISE_IMAGE_MAP = {
  LE01: "/images/exercise/exercise_squat.png", // 深蹲
  LE02: "/images/exercise/exercise_high_knees.png", // 仰躺直腿抬腿
  HP01: "/images/exercise/exercise_knee_extension.png", // 仰躺直腿抬腿 — knee held extended throughout
  HP02: "/images/exercise/exercise_knee_raise.png", // 站姿髖屈曲 — standing knee raise
  CR05: "/images/exercise/exercise_seated_leg_raise.png", // 坐姿抬膝 — seated leg/knee raise
  KN03: "/images/exercise/exercise_seated_leg_raise.png", // 若專案尚無此圖，既有 fallback 會自動處理
  LE05: "/images/exercise/exercise_sit_to_stand.png", // 若專案尚無此圖，既有 fallback 會自動處理
  LE03: "/images/exercise/exercise_bridge.png", // 若專案尚無此圖，既有 fallback 會自動處理
  LE04: "/images/exercise/exercise_side_leg_raise.png", // 若專案尚無此圖，既有 fallback 會自動處理
  LE06: "/images/exercise/exercise_balance.png",
  LE07: "/images/exercise/exercise_calf_raise.png",
  SH01: "/images/exercise/exercise_shoulder_pendulum.png",
  SH02: "/images/exercise/exercise_shoulder_external_rotation.png",
  SH03: "/images/exercise/exercise_shoulder_internal_rotation.png",
  HP04: "/images/exercise/exercise_side_leg_raise2.png",
  HP05: "/images/exercise/exercise_hip_adduction.png",
  HP06: "/images/exercise/exercise_clamshell.png",
  SH04: "/images/exercise/exercise_arm_abduction.png", // 站姿肩外展等長收縮
  SH07: "/images/exercise/exercise_shoulder_raise.png", // 站姿肩屈曲等長收縮
};

/**
 * Card image slot: a real per-exercise photo when EXERCISE_IMAGE_MAP has
 * one, otherwise the exercise's own category icon (reusing
 * CATEGORY_ICON_MAP — already real assets, already used elsewhere on this
 * same page) centered on a soft tinted tile. Never a broken image, never a
 * mismatched stock photo, never the unrelated generic trainpic1.png.
 */
/**
 * Phase 6.2 report section 14/15 — real per-exercise photos now render with
 * object-fit:contain on a tinted background (CSS) instead of Phase 6.1's
 * cover-crop, since a cropped photo can't be visually verified in this
 * environment and contain never risks cutting off the person/limb doing the
 * movement. Fallback tiles get a smaller icon + a subtle decorative sparkle
 * accent (an existing gamification asset, low-opacity, pointer-events:none)
 * so a repeated category icon across many cards visibly reads as "no photo
 * yet" rather than as a real, cropped illustration.
 */
function renderExerciseCardImage(exercise) {
  const photoSrc = EXERCISE_IMAGE_MAP[exercise.id];
  if (photoSrc) {
    return `<div class="exercise-grid-card-image"><img src="${photoSrc}" alt="${exercise.name}" /></div>`;
  }
  const iconSrc = CATEGORY_ICON_MAP[exercise.bodyPart];
  if (iconSrc) {
    return `<div class="exercise-grid-card-image exercise-grid-card-image-fallback"><img class="exercise-grid-card-image-sparkle" src="/images/gamification/sparkle_02.png" alt="" /><img src="${iconSrc}" alt="${exercise.name}" /></div>`;
  }
  return `<div class="exercise-grid-card-image exercise-grid-card-image-fallback"></div>`;
}

/**
 * ReMotion Phase 6.1 — trainingMode badge. Display text is UI-only
 * translation; the underlying rehabExercises.js trainingMode value is
 * never altered. Only pose_analysis gets an icon (reuses the already-
 * established "this is AI" marker /images/ai_robot.png, used in every
 * AI-related page header) — the other tiers stay text-only/low-key per
 * spec section 6 ("guided 低調標示", "reference_only 最弱").
 */
const TRAINING_MODE_BADGE = {
  pose_analysis: { label: "AI 姿勢分析", cls: "tier-pose", icon: "/images/ai_robot.png" },
  interactive: { label: "互動訓練", cls: "tier-interactive", icon: null },
  guided: { label: "引導練習", cls: "tier-guided", icon: null },
  reference_only: { label: "動作參考", cls: "tier-reference", icon: null },
};
function renderTrainingModeBadge(trainingMode) {
  const meta = TRAINING_MODE_BADGE[trainingMode];
  if (!meta) return "";
  const iconHtml = meta.icon ? `<img src="${meta.icon}" alt="" />` : "";
  return `<span class="training-mode-badge ${meta.cls}">${iconHtml}${meta.label}</span>`;
}

/**
 * ReMotion Phase 6.1 note: renderCategoryIconSlot()/renderCategoryQuickCard()/
 * SELF_PRACTICE_BODY_PART_ROWS/groupIntoDisplayRows()/renderCategoryQuickRow()
 * (the 80px-tall icon-card quick-category UI) were removed in Phase 6.2 —
 * the Library redesign replaced them with the compact
 * renderQuickCategoryPills() row (report section 6) and plain text chips
 * for 依目標 inside the More Filters panel. CATEGORY_ICON_MAP is still used
 * (renderExerciseCardImage()'s fallback tile); GOAL_ICON_MAP is no longer
 * referenced by any renderer but is left in place as a harmless, still-
 * accurate data mapping rather than removed for its own sake.
 */

/** Real `category` values straight from the 44-item catalog — never hardcoded independently. */
function getAssessmentBodyPartOptions() {
  const real = new Set(exerciseService.list().map((ex) => ex.category).filter(Boolean));
  const ordered = BODY_PART_DISPLAY_ORDER.filter((c) => real.has(c));
  const extras = [...real].filter((c) => !ordered.includes(c));
  return [...ordered, ...extras];
}

/** Only the goal values Phase 1 actually hand-tagged on the 9-item test set — never the other 35 exercises' guessed goals. */
function getAssessmentGoalOptions() {
  return [...new Set(Object.values(PHASE1_TEST_EXERCISE_GOALS))];
}

function getOrInitAssessmentDraft() {
  if (!state.assessmentDraft) {
    state.assessmentDraft = { bodyParts: [], goals: [], abilityLevel: null, preferredSessionMinutes: null };
  }
  return state.assessmentDraft;
}

function goPatientAssessmentIntro() {
  state.route = "patientAssessmentIntro";
  render();
}

function skipAssessmentIntro() {
  state.route = "dashboard";
  state.tab = "home";
  render();
}

/**
 * Starts the 4-step form. editMode is null for a brand-new assessment,
 * "update" for an in-place edit of the current active record, or
 * "reassess" for a full new-version re-evaluation — both of the latter
 * prefill the draft from the current active assessment so the patient
 * isn't starting from scratch.
 */
function startAssessmentForm(editMode = null) {
  const patientId = state.user.id;
  const active = assessmentService.getActiveByPatientId(patientId);
  if ((editMode === "update" || editMode === "reassess") && active) {
    state.assessmentDraft = {
      bodyParts: [...(active.bodyParts || [])],
      goals: [...(active.goals || [])],
      abilityLevel: active.abilityLevel || null,
      preferredSessionMinutes: active.preferredSessionMinutes || null,
    };
  } else {
    state.assessmentDraft = { bodyParts: [], goals: [], abilityLevel: null, preferredSessionMinutes: null };
  }
  state.assessmentEditMode = editMode;
  state.assessmentFormStep = 1;
  state.route = "patientAssessmentForm";
  render();
}

function toggleAssessmentBodyPart(value) {
  const draft = getOrInitAssessmentDraft();
  draft.bodyParts = draft.bodyParts.includes(value)
    ? draft.bodyParts.filter((v) => v !== value)
    : [...draft.bodyParts, value];
  render();
}

function toggleAssessmentGoal(value) {
  const draft = getOrInitAssessmentDraft();
  draft.goals = draft.goals.includes(value) ? draft.goals.filter((v) => v !== value) : [...draft.goals, value];
  render();
}

function selectAssessmentAbility(value) {
  getOrInitAssessmentDraft().abilityLevel = value;
  render();
}

function selectAssessmentDuration(minutes) {
  getOrInitAssessmentDraft().preferredSessionMinutes = minutes;
  render();
}

function goAssessmentNextStep() {
  const draft = getOrInitAssessmentDraft();
  const step = state.assessmentFormStep;
  if (step === 1 && draft.bodyParts.length === 0) return alert("請至少選擇一個想加強的部位");
  if (step === 2 && draft.goals.length === 0) return alert("請至少選擇一個復健目標");
  if (step === 3 && !draft.abilityLevel) return alert("請選擇目前的活動能力程度");
  if (step === 4 && !draft.preferredSessionMinutes) return alert("請選擇希望的練習時間");
  if (step >= 4) {
    state.route = "patientAssessmentSummary";
  } else {
    state.assessmentFormStep = step + 1;
  }
  render();
}

function goAssessmentPrevStep() {
  if (state.assessmentFormStep <= 1) {
    state.route = "patientAssessmentIntro";
  } else {
    state.assessmentFormStep -= 1;
  }
  render();
}

function backToAssessmentFormFromSummary() {
  state.route = "patientAssessmentForm";
  state.assessmentFormStep = 4;
  render();
}

function confirmAssessment() {
  const draft = getOrInitAssessmentDraft();
  const patientId = state.user.id;

  if (state.assessmentEditMode === "update") {
    const result = assessmentService.updateActiveAssessment(patientId, { ...draft }, patientId);
    if (result.error) return alert(result.error);
    state.assessmentSuccessMessage = "復健需求已更新";
  } else {
    const result = assessmentService.createAssessment({ ...draft, patientId, createdBy: patientId });
    if (result.error) return alert(result.error);
    state.assessmentSuccessMessage = state.assessmentEditMode === "reassess" ? "已建立新的復健需求評估" : "復健需求已建立";
  }

  state.assessmentDraft = null;
  state.assessmentEditMode = null;
  state.route = "dashboard";
  state.tab = "home";
  render();
}

function assessmentStepDots(current) {
  return `<div class="assessment-step-dots">${[1, 2, 3, 4]
    .map((n) => `<span class="${n === current ? "active" : ""}"></span>`)
    .join("")}</div>`;
}

function patientAssessmentIntroPage() {
  return `
    <div class="header"><button class="btn btn-light detail-back-btn" onclick="skipAssessmentIntro()">返回</button><b>復健需求評估</b></div>
    <div class="illustration-slot slot-hero" style="margin:16px 0;">插畫預留位置</div>
    <h2>建立我的復健需求</h2>
    <p class="small">先花一點時間了解你的復健需求，ReMotion 才能整理更適合你的練習方向。</p>
    <p class="small">約 1 分鐘完成，之後也可以重新評估。</p>
    <button class="btn btn-primary full" onclick="startAssessmentForm()">開始評估</button>
    <button class="btn btn-light full" onclick="skipAssessmentIntro()">稍後再填</button>
  `;
}

function renderAssessmentStep1(draft) {
  const options = getAssessmentBodyPartOptions();
  return `
    <h2>你目前最想加強哪些部位？</h2>
    <p class="small">可複選</p>
    <div class="chip-grid">${options
      .map((opt) => `<button type="button" class="chip-select ${draft.bodyParts.includes(opt) ? "selected" : ""}" onclick="toggleAssessmentBodyPart('${opt}')">${opt}</button>`)
      .join("")}</div>
  `;
}

function renderAssessmentStep2(draft) {
  const options = getAssessmentGoalOptions();
  return `
    <h2>你希望改善什麼？</h2>
    <p class="small">可複選</p>
    <div class="chip-grid">${options
      .map((opt) => `<button type="button" class="chip-select ${draft.goals.includes(opt) ? "selected" : ""}" onclick="toggleAssessmentGoal('${opt}')">${opt}</button>`)
      .join("")}</div>
  `;
}

function renderAssessmentStep3(draft) {
  return `
    <h2>你覺得目前的活動能力如何？</h2>
    ${ABILITY_LEVEL_OPTIONS.map(
      (opt) => `<button type="button" class="assessment-option-card ${draft.abilityLevel === opt.value ? "selected" : ""}" onclick="selectAssessmentAbility('${opt.value}')"><b>${opt.label}</b><p>${opt.desc}</p></button>`
    ).join("")}
  `;
}

function renderAssessmentStep4(draft) {
  return `
    <h2>你希望一次練習多久？</h2>
    <div class="chip-grid">${SESSION_MINUTES_OPTIONS.map(
      (m) => `<button type="button" class="chip-select ${draft.preferredSessionMinutes === m ? "selected" : ""}" onclick="selectAssessmentDuration(${m})">${m} 分鐘</button>`
    ).join("")}</div>
  `;
}

function patientAssessmentFormPage() {
  const draft = getOrInitAssessmentDraft();
  const step = state.assessmentFormStep || 1;
  const stepRenderers = { 1: renderAssessmentStep1, 2: renderAssessmentStep2, 3: renderAssessmentStep3, 4: renderAssessmentStep4 };
  const nextLabel = step >= 4 ? "下一步：確認" : "下一步";
  return `
    <div class="header"><button class="btn btn-light detail-back-btn" onclick="goAssessmentPrevStep()">返回</button><b>復健需求評估</b></div>
    ${assessmentStepDots(step)}
    ${stepRenderers[step](draft)}
    <button class="btn btn-primary full" onclick="goAssessmentNextStep()">${nextLabel}</button>
  `;
}

function patientAssessmentSummaryPage() {
  const draft = getOrInitAssessmentDraft();
  const abilityLabel = ABILITY_LEVEL_OPTIONS.find((o) => o.value === draft.abilityLevel)?.label || "-";
  const confirmLabel = state.assessmentEditMode === "update" ? "確認並更新" : state.assessmentEditMode === "reassess" ? "確認並建立新版" : "確認並建立";
  return `
    <div class="header"><button class="btn btn-light detail-back-btn" onclick="backToAssessmentFormFromSummary()">返回</button><b>確認你的復健需求</b></div>
    <div class="card">
      <div class="assessment-summary-row"><span>想加強</span><span>${draft.bodyParts.join("、") || "-"}</span></div>
      <div class="assessment-summary-row"><span>目標</span><span>${draft.goals.join("、") || "-"}</span></div>
      <div class="assessment-summary-row"><span>目前程度</span><span>${abilityLabel}</span></div>
      <div class="assessment-summary-row"><span>每次時間</span><span>${draft.preferredSessionMinutes ? `${draft.preferredSessionMinutes} 分鐘` : "-"}</span></div>
    </div>
    <button class="btn btn-primary full" onclick="confirmAssessment()">${confirmLabel}</button>
    <button class="btn btn-light full" onclick="backToAssessmentFormFromSummary()">返回修改</button>
  `;
}

/** "我的復健需求" — read the active assessment + entry points to update/reassess. Linked from profilePage. */
function goAssessmentSettings() {
  state.route = "assessmentSettings";
  render();
}

function assessmentSettingsPage() {
  const active = assessmentService.getActiveByPatientId(state.user.id);
  if (!active) {
    return `
      <div class="header"><button class="btn btn-light detail-back-btn" onclick="switchTab('profile')">返回</button><b>我的復健需求</b></div>
      <div class="card muted center">尚未建立復健需求評估</div>
      <button class="btn btn-primary full" onclick="startAssessmentForm()">開始評估</button>
    `;
  }
  const abilityLabel = ABILITY_LEVEL_OPTIONS.find((o) => o.value === active.abilityLevel)?.label || "-";
  return `
    <div class="header"><button class="btn btn-light detail-back-btn" onclick="switchTab('profile')">返回</button><b>我的復健需求</b></div>
    <div class="card">
      <div class="assessment-summary-row"><span>想加強部位</span><span>${(active.bodyParts || []).join("、") || "-"}</span></div>
      <div class="assessment-summary-row"><span>目標</span><span>${(active.goals || []).join("、") || "-"}</span></div>
      <div class="assessment-summary-row"><span>程度</span><span>${abilityLabel}</span></div>
      <div class="assessment-summary-row"><span>每次時間</span><span>${active.preferredSessionMinutes ? `${active.preferredSessionMinutes} 分鐘` : "-"}</span></div>
      <div class="assessment-summary-row"><span>最近評估時間</span><span>${(active.assessedAt || "").slice(0, 10) || "-"}</span></div>
    </div>
    <button class="btn btn-light full" onclick="startAssessmentUpdate()">修改目前資料</button>
    <button class="btn btn-primary full" onclick="startAssessmentReassess()">重新評估</button>
  `;
}

function startAssessmentUpdate() {
  startAssessmentForm("update");
}

function startAssessmentReassess() {
  startAssessmentForm("reassess");
}

//患者主畫面
function patientHome() {
  return `
    <div class="top-profile-container">
      
      <div class="header">
        <h1 class="page-title">Re<span class="logo-dark">Motion</span></h1>
        <div class="top-actions">
          <img class="icon" src="/images/notice.png" alt="通知" />
        </div>
      </div>

      <div class="user-row">
        <div class="avatar">${state.user.name[0]}</div>
        <div class="user-info">
          <strong>${state.user.name} 👋</strong><br />
          <small class="small">Lv.5 復健達人｜XP 850 / 1000</small>
          <div class="xp-track"><span style="width:85%"></span></div>
        </div>
        <div class="top-right-icon"></div>
      </div>

    </div>

    <div class="section-header">
      <h3 class="section-title">今日訓練計畫</h3>
      <span class="ai-tag">AI 智能推薦</span>
    </div>
    
    <div class="train-card-group">
      
      <div class="train-item-row" onclick="goSquatDetail()">
        <img class="train-img" src="/images/trainpic1.png" alt="深蹲訓練" />
        <div class="train-info">
          <b class="train-name">深蹲訓練</b>
          <div class="train-meta">3組 x 15次</div>
          <div class="train-desc">強化下肢力量</div>
        </div>
        <div class="train-right-status">
          <span class="pill active-status">進行中</span>
          
        </div>
      </div>
      
      <div class="train-item-row">
        <img class="train-img" src="/images/trainpic2.png" alt="手臂伸展訓練" />
        <div class="train-info">
          <b class="train-name">手臂伸展訓練</b>
          <div class="train-meta">2組 x 30秒</div>
          <div class="train-desc">增加肩關節活動度</div>
        </div>
        <div class="train-right-status">
          <span class="pill pending">待開始</span>
        </div>
      </div>

    </div>

    <h3 class="section-title">AI 動作品質分析</h3>
    <div class="ai-box clickable" onclick="goAnalysis()">
      <div class="ai-content">
        <img src="/images/ai_robot.png" alt="AI 助手" class="ai-avatar" />
        <p class="ai-text">
          深蹲品質 82 分，膝蓋穩定度提升 12%。點擊查看 AI 分析結果。
        </p>
      </div>
    </div>

    <div class="section-header">
      <h3 class="section-title">本週進度</h3>
      <span class="more-link" onclick="switchTab('data')">查看詳情 &gt;</span>
    </div>

    <div class="stats">
      <div class="stat">
        <div class="stat-label">
          <img src="/images/stat_count.png" alt="次數" />
          <span>訓練次數</span>
        </div>
        <div class="stat-value">
          <span class="num-big">5</span><span class="num-small">/7 次</span>
        </div>
      </div>
      
      <div class="stat">
        <div class="stat-label">
          <img src="/images/stat_time.png" alt="時間" />
          <span>總訓練時間</span>
        </div>
        <div class="stat-value">
          <span class="num-big">125</span><span class="num-small"> 分鐘</span>
        </div>
      </div>
      
      <div class="stat">
        <div class="stat-label">
          <img src="/images/stat_cal.png" alt="熱量" />
          <span>消耗熱量</span>
        </div>
        <div class="stat-value">
          <span class="num-big">620</span><span class="num-small"> 大卡</span>
        </div>
      </div>
    </div>
    <button class="btn btn-primary full" onclick="switchTab('work')">開始訓練 →</button>
    
  `;
}
//患者主畫面（動態版，暫時保留靜態版測試）
// function patientHome() {
//   // 1. 先把動態的訓練計畫資料轉成 HTML 字串（假設你的 state.todayPlans 是一個陣列）
//   // 如果目前沒資料，就先用你原本的預設資料當備用
//   const plans = state.todayPlans || [
//     { id: 1, title: '深蹲訓練', detail: '3組 x 15次', status: '進行中', statusClass: 'active-status', onClick: 'goSquatDetail()' },
//     { id: 2, title: '手臂伸展訓練', detail: '2組 x 30秒', status: '待開始', statusClass: 'pending', onClick: '' }
//   ];

//   // 把資料陣列 map 成 HTML
//   const planItemsHtml = plans.map(plan => `
//     <div class="train-item" onclick="${plan.onClick || ''}">
//       <img src="/images/image_1.png" alt="${plan.title}" />
//       <div class="train-info">
//         <b>${plan.title}</b>
//         <div class="small">${plan.detail}</div>
//       </div>
//       <span class="pill ${plan.statusClass}">${plan.status}</span>
//       <button class="delete-plan-btn" onclick="deletePlan(${plan.id}, event)">×</button>
//     </div>
//   `).join('');

//   // 2. 回傳整個頁面的 HTML
//   return `
//     <div class="header">
//       <h1 class="page-title">ReMotion</h1>
//       <div class="top-actions">
//         <img class="icon" src="/images/notice.png" alt="通知" />
//       </div>
//     </div>

//     <div class="user-row">
//       <div class="avatar">${state.user.name[0]}</div>
//       <div class="user-info">
//         <strong>${state.user.name} 👋</strong><br />
//         <small class="small">一起持續進步吧！</small>
//       </div>
//     </div>

//     <div class="section-header">
//       <h3 class="section-title">今日訓練計畫</h3>
//       <button class="add-plan-btn" onclick="openAddPlanModal()">+ 新增</button>
//     </div>
    
//     <div class="train-list">
//       ${planItemsHtml}
//     </div>

//     <h3 class="section-title">AI 分析建議</h3>
//     <div class="ai-box">
//       建議降低膝蓋負擔，並加強核心訓練，有助於提升穩定性！
//     </div>

//     <h3 class="section-title">本週進度</h3>
//     <div class="stats">
//       <div class="stat"><b>5/7</b><span class="small">次數</span></div>
//       <div class="stat"><b>125</b><span class="small">分鐘</span></div>
//       <div class="stat"><b>620</b><span class="small">卡路里</span></div>
//     </div>
    
//     <button class="btn btn-primary full" onclick="switchTab('work')">開始訓練 →</button>
    
//     <div class="card muted center" style="height:100px; display:flex; align-items:center; justify-content:center;">
//       ( 向下捲動測試內容 )
//     </div>
//   `;
// }

//復健師主畫面
function therapistHome() {
  return `
    <div class="header">
      <h1 class="page-title">ReMotion</h1>
      <img class="icon" src="/images/notice.png" alt="通知" />
    </div>
    <div class="user-row">
      <div class="avatar">${state.user.name[0]}</div>
      <div>
        <strong>${state.user.name} 復健師</strong><br />
        <small class="small">專業守護每一步進步</small>
      </div>
    </div>

    <div class="card dashboard-card">
      <b>個案列表</b>
      <div class="small">今日待辦：3，AI風險提醒：2，通知：3</div>
    </div>
    <h3 class="section-title">追蹤中的個案</h3>
    <div class="coach-list">
      <div class="train-item clickable" onclick="goCaseDetail('黃小謙')"><img src="/images/image_1.png" alt="" /><div><b>黃小謙</b><div class="small">膝關節術後復健｜AI品質 82分</div></div><span class="pill active-status">進步中</span></div>
      <div class="train-item clickable" onclick="goCaseDetail('陳小莉')"><img src="/images/image_1.png" alt="" /><div><b>陳小莉</b><div class="small">肩關節活動訓練｜動作偏移</div></div><span class="pill pending">需調整</span></div>
      <div class="train-item clickable" onclick="goCaseDetail('林阿姨')"><img src="/images/image_1.png" alt="" /><div><b>林阿姨</b><div class="small">下肢肌力訓練｜穩定度 89%</div></div><span class="pill active-status">穩定中</span></div>
    </div>
    <h3 class="section-title">個案分析（黃小謙）</h3>
    <div class="stats">
      <div class="stat"><span class="small">動作正確率</span><b>82%</b></div>
      <div class="stat"><span class="small">本週完成率</span><b>85%</b></div>
      <div class="stat"><span class="small">風險等級</span><b>低</b></div>
    </div>
    <div class="card ai-risk clickable" onclick="goCaseDetail('黃小謙')">
      <b>AI 風險預測</b>
      <div class="small">膝蓋內夾風險 18%，建議下週增加核心穩定與髖部控制訓練。</div>
    </div>
    <button class="btn btn-primary full" onclick="goCaseDetail('黃小謙')">查看個案詳細分析 →</button>
  `;
}
//訓練頁面
function trainPage() {
  return `
    <div class="header">
      <div>
        <h1 class="page-title">訓練</h1>
        <div class="small">早安，${state.user.name} 👋 今日完成 2/3 項</div>
      </div>
      <img class="icon" src="/images/notice.png" alt="通知" />
    </div>
    <div class="card demo-flow-card">
      <b>今日 AI 復健任務</b>
      <div class="small">完成訓練後可取得動作品質分數、熱區分析與改善建議。</div>
    </div>
    <div class="train-item clickable" onclick="goSquatDetail()">
      <img src="/images/trainpic1.png" alt="膝蓋復健訓練" />
      <div><b>膝蓋復健訓練</b><div class="small">初階，15 分鐘｜AI品質 89%</div></div>
      <span class="pill active-status">查看</span>
    </div>
    <div class="train-item clickable" onclick="goAnalysis()">
      <img src="/images/trainpic2.png" alt="肩膀活動訓練" />
      <div><b>肩膀活動訓練</b><div class="small">初階，12 分鐘｜AI品質 92%</div></div>
      <span class="pill active-status">完成</span>
    </div>
    <div class="train-item clickable" onclick="goHeatmap()">
      <img src="/images/image_1.png" alt="平衡訓練" />
      <div><b>平衡訓練</b><div class="small">初階，8 分鐘｜AI品質 85%</div></div>
      <span class="pill pending">待開始</span>
    </div>
    <div class="row" style="margin-top:12px;">
      <button class="btn btn-light" style="flex:1" onclick="goActionRecords()">動作紀錄</button>
      <button class="btn btn-light" style="flex:1" onclick="goAchievements()">成就徽章</button>
    </div>
  `;
}
//復健師檔案頁面
function therapistFilesPage() {
  return `
    <div class="header">
      <div>
        <h1 class="page-title">檔案</h1>
        <div class="small">個案報告與訓練紀錄管理</div>
      </div>
      <img class="icon" src="/images/files.png" alt="檔案" />
    </div>
    <h3 class="section-title">最新檔案</h3>
    <div class="train-item">
      <img src="/images/image_1.png" alt="黃小謙每週報告" />
      <div>
        <b>黃小謙_每週復健報告.pdf</b>
        <div class="small">更新：今天 10:30</div>
      </div>
      <span class="pill active-status">已同步</span>
    </div>
    <div class="train-item">
      <img src="/images/image_1.png" alt="陳小莉動作評估" />
      <div>
        <b>陳小莉_動作評估紀錄.docx</b>
        <div class="small">更新：昨天 16:20</div>
      </div>
      <span class="pill pending">待審核</span>
    </div>
    <div class="train-item">
      <img src="/images/image_1.png" alt="林阿姨訓練回饋" />
      <div>
        <b>林阿姨_訓練回饋單.xlsx</b>
        <div class="small">更新：04/30 14:40</div>
      </div>
      <span class="pill active-status">完成</span>
    </div>
    <div class="card">
      <b>檔案提醒</b>
      <div class="small">目前有 2 份個案檔案待你確認。</div>
    </div>
  `;
}
//訓練內部細節頁面
function squatDetailPage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="backToTrain()">返回</button>
      <b>深蹲訓練</b>
      <img class="icon" src="/images/data.png" alt="設定" />
    </div>
    <img class="demo-shot" src="/images/image_1.png" alt="深蹲動作偵測" />
    <div class="row" style="margin-top:10px;">
      <div class="card" style="flex:1"><div class="small">次數</div><b>12 / 15</b></div>
      <div class="card" style="flex:1"><div class="small">時間</div><b>00:28</b></div>
      <div class="card" style="flex:1"><div class="small">大卡</div><b>98</b></div>
    </div>
    <div class="card" style="margin-top:10px">
      <b>膝蓋彎曲角度偏小</b>
      <div class="small">建議下蹲再低一點，保持膝蓋與腳尖同向。</div>
    </div>
    <button class="btn btn-primary" style="width:100%; margin-top:10px;" onclick="goAnalysis()">完成訓練並查看 AI 分析</button>
  `;
}

//數據頁面
function dataPage() {
  return `
    <div class="header">
      <div><h1 class="page-title">我的數據</h1><div class="small">5/12 - 5/18</div></div>
      <img class="icon" src="/images/calendar.png" alt="日曆" />
    </div>
    <div class="stats">
      <div class="stat"><span class="small">訓練次數</span><b>5</b><span class="small">次</span></div>
      <div class="stat"><span class="small">訓練時間</span><b>125</b><span class="small">分鐘</span></div>
      <div class="stat"><span class="small">平均品質</span><b>82</b><span class="small">分</span></div>
    </div>
    <h3 class="section-title">AI 品質趨勢</h3>
    <div class="mini-chart" onclick="goHistory()">
      <div class="chart-line"></div>
      <div class="chart-dots"><span>71</span><span>78</span><span>85</span></div>
    </div>
    <div class="row" style="margin-top:10px;">
      <button class="btn btn-light" style="flex:1" onclick="goHistory()">歷史趨勢</button>
      <button class="btn btn-light" style="flex:1" onclick="goHeatmap()">色階熱區</button>
    </div>
    <h3 class="section-title">AI 建議</h3>
    <div class="card">
      <div class="small">你的膝蓋穩定度進步很多，建議增加訓練強度並保持膝蓋與腳尖同向。</div>
    </div>
  `;
}

function analysisPage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="backToTrain()">返回</button>
      <b>AI 動作品質分析</b>
      <button class="btn btn-light" onclick="goHeatmap()">熱區</button>
    </div>
    <div class="score-hero">
      <div class="score-ring"><span>82</span><small>分</small></div>
      <div>
        <h2>深蹲訓練完成</h2>
        <p class="small">CNN 動作品質辨識｜模擬分析結果</p>
        <span class="pill active-status">+50 XP</span>
      </div>
    </div>
    <h3 class="section-title">評分細項</h3>
    ${metricBar('深蹲深度', 75)}
    ${metricBar('膝蓋穩定度', 88)}
    ${metricBar('身體平衡度', 84)}
    ${metricBar('動作流暢度', 80)}
    <h3 class="section-title">AI 判定</h3>
    <div class="card analysis-card">
      <div>✅ 動作基本正確</div>
      <div>⚠️ 膝蓋彎曲角度偏小</div>
      <div>⚠️ 下蹲速度稍快</div>
    </div>
    <h3 class="section-title">改善建議</h3>
    <div class="ai-box">
      <div class="ai-content">
        <img src="/images/ai_robot.png" alt="AI" class="ai-avatar" />
        <p class="ai-text">建議下蹲時膝蓋與腳尖保持同方向，速度降低約 20%，並增加核心穩定訓練。</p>
      </div>
    </div>
    <button class="btn btn-primary full" onclick="goHistory()">查看歷史趨勢 →</button>
  `;
}

function historyPage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="switchTab('data')">返回</button>
      <b>歷史趨勢</b>
      <img class="icon" src="/images/data.png" alt="數據" />
    </div>
    <div class="card progress-summary">
      <b>深蹲品質分數</b>
      <div class="big-number">71 → 85</div>
      <div class="small">近三週進步率 +19.7%</div>
    </div>
    <div class="trend-list">
      ${historyRow('05/01', '深蹲訓練', 71)}
      ${historyRow('05/08', '深蹲訓練', 78)}
      ${historyRow('05/15', '深蹲訓練', 85)}
    </div>
    <h3 class="section-title">AI 趨勢摘要</h3>
    <div class="card">
      <div class="small">膝蓋穩定度逐週改善，但深蹲深度仍略低。建議下週維持 3 組 x 15 次，並加入髖部活動訓練。</div>
    </div>
    <button class="btn btn-primary full" onclick="goHeatmap()">查看色階熱區分析 →</button>
  `;
}

function heatmapPage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="goAnalysis()">返回</button>
      <b>色階熱區分析</b>
      <img class="icon" src="/images/data.png" alt="分析" />
    </div>
    <div class="heatmap-card">
      <div class="body-map">
        <div class="joint head"></div><div class="body-line torso"></div>
        <div class="body-line arm-l"></div><div class="body-line arm-r"></div>
        <div class="body-line leg-l"></div><div class="body-line leg-r"></div>
        <div class="joint shoulder ok"></div>
        <div class="joint hip warn"></div>
        <div class="joint knee danger"></div>
        <div class="joint ankle ok"></div>
      </div>
      <div class="legend"><span><i class="danger-dot"></i>高風險</span><span><i class="warn-dot"></i>需注意</span><span><i class="ok-dot"></i>穩定</span></div>
    </div>
    <h3 class="section-title">CNN 色階判讀</h3>
    <div class="card analysis-card">
      <div><b>左膝：</b>紅色，高風險，疑似膝蓋內夾</div>
      <div><b>髖關節：</b>黃色，活動度不足</div>
      <div><b>肩膀：</b>綠色，穩定</div>
    </div>
    <h3 class="section-title">改善方向</h3>
    <div class="card">
      <div class="small">建議加強核心與臀中肌訓練，並於下蹲時維持膝蓋與腳尖同方向，降低關節代償風險。</div>
    </div>
  `;
}

function metricBar(label, score) {
  return `<div class="metric"><div><b>${label}</b><span>${score}分</span></div><div class="bar"><i style="width:${score}%"></i></div></div>`;
}

function historyRow(date, name, score) {
  return `<div class="history-row"><div><b>${date}</b><span>${name}</span></div><strong>${score}分</strong></div>`;
}


/** "assigned"/"self_practice"/"unknown" -> the matching .source-tag-badge modifier class. */
function sourceBadgeClassFor(sourceType) {
  if (sourceType === "assigned") return "assigned";
  if (sourceType === "self_practice") return "self-practice";
  return "unknown";
}

/**
 * Report section 14 — a source chip is only offered when at least one real
 * record of that source exists (never a permanently-empty dead option).
 * "全部" is always shown. Deliberately only 3 possible non-"all" chips:
 * there is no "AI 推薦" chip here because normalizeTrainingSource() can
 * never produce that value — recommendation-origin is not persisted
 * anywhere on analysisRecord (see its own comment for the full audit).
 */
function getTrainingHistorySourceChips(records) {
  const counts = { assigned: 0, self_practice: 0, unknown: 0 };
  records.forEach((r) => { counts[normalizeTrainingSource(r).key]++; });
  const chips = [{ key: "all", label: "全部" }];
  if (counts.assigned > 0) chips.push({ key: "assigned", label: "復健師安排" });
  if (counts.self_practice > 0) chips.push({ key: "self_practice", label: "自主練習" });
  if (counts.unknown > 0) chips.push({ key: "unknown", label: "練習紀錄" });
  return chips;
}

function setTrainingHistorySourceFilter(key) {
  state.trainingHistorySourceFilter = key;
  render();
}

// buildDeterministicHistorySummary() (Phase 6.3's plain-text weekly
// sentence, report section 21) was superseded in Phase 6.4 by the visual
// Hero + Weekly Activity cards (report section 6-8), which cover the same
// real numbers (sessionCount/XP/activeDays) more legibly. Removed since
// nothing called it anymore.
/**
 * Report section 13 — reuses the Library's real per-exercise photo mapping
 * (EXERCISE_IMAGE_MAP via renderExerciseCardImage()) instead of building a
 * second image mapping. exerciseService.getNormalizedById() gives the
 * {id,bodyPart,name} shape renderExerciseCardImage() expects; a legacy
 * record whose exerciseId doesn't match any real catalog entry (old
 * "ex_squat"-style ids) safely falls through to the same plain fallback
 * tile renderExerciseCardImage() itself uses for a real exercise with no
 * photo and no known category.
 */
function renderHistoryCardImage(entry) {
  const catalogExercise = entry.exerciseId ? exerciseService.getNormalizedById(entry.exerciseId) : null;
  if (catalogExercise) return renderExerciseCardImage(catalogExercise);
  return `<div class="exercise-grid-card-image exercise-grid-card-image-fallback"></div>`;
}

/**
 * Phase 6.4.1 report section 4/5/8 — strict LEFT / CENTER / RIGHT card
 * structure, as three SIBLING flex children of .history-card (not XP
 * nested inside a name row, not chevron nested inside a facts row). This
 * is the fix for the exact bug the report calls out: putting XP on the
 * same narrow sub-row as the name and using justify-content:space-between
 * there pushes XP however far a short name happens to leave — sometimes
 * right next to it, sometimes clear across the card. Making RIGHT its own
 * fixed-position flex sibling (not sharing a row with CENTER's text)
 * means XP always sits in the same compact spot regardless of name length.
 *
 * Phase 6.4.3 root-cause note: this DOM structure was already correct
 * since 6.4.1, but `.history-card` itself never had `display: flex` set in
 * styles.css — without it, these three sibling divs rendered as plain
 * stacked blocks (align-items/flex:1/flex:none all do nothing without a
 * flex container), which is what actually caused the reported vertical
 * scatter and row-to-row overlap. See styles.css's own comment on
 * `.history-card` for the fix.
 *
 * LEFT: exercise thumbnail (reused, see renderHistoryCardImage's own doc).
 * CENTER (flex:1, min-width:0 so a long name still ellipses instead of
 *   pushing RIGHT off-card): name, then source+time, then completion+quality.
 * RIGHT: XP (top) and the chevron (bottom), a compact column that never
 *   grows — no duration anywhere (still no real field for it).
 */
function renderTrainingHistoryCard(entry) {
  const factParts = [];
  if (entry.completion.completedReps != null && entry.completion.targetReps) {
    factParts.push(`${entry.completion.completedReps} / ${entry.completion.targetReps} 次`);
  } else if (entry.completion.completedReps != null) {
    factParts.push(`${entry.completion.completedReps} 次`);
  }
  if (entry.quality.qualityRatio != null) factParts.push(`品質 ${entry.quality.qualityRatio}%`);
  else if (entry.detailType === "generic" && entry.quality.prototypeScore != null) factParts.push(`${entry.quality.prototypeScore} 分`);
  const factsHtml = factParts.length
    ? `<span class="small history-card-facts"><img class="history-card-facts-star" src="/images/gamification/progress_star_green.png" alt="" />${factParts.join(" · ")}</span>`
    : "";
  return `<div class="history-card clickable" onclick="goTrainingRecordDetail('${entry.recordId}')">
    <div class="history-card-image">${renderHistoryCardImage(entry)}</div>
    <div class="history-card-center">
      <b class="history-card-name">${entry.exerciseName}</b>
      <div class="history-card-meta"><span class="source-tag-badge ${sourceBadgeClassFor(entry.sourceType)}">${entry.sourceLabel}</span><span class="small">${formatRecordDateTime(entry.completedAt)}</span></div>
      ${factsHtml}
    </div>
    <div class="history-card-right">
      ${entry.xpEarned != null ? `<span class="history-card-xp"><img class="history-card-xp-icon" src="/images/gamification/xp_coin.png" alt="" />+${entry.xpEarned}</span>` : "<span></span>"}
      <span class="more-link">›</span>
    </div>
  </div>`;
}

/**
 * Report section 4/10/26 — one weekday's activity node using the same
 * star visual language as everywhere else: a real progress_star_green for
 * an active day, star_gold specifically for an active TODAY (the
 * "highlight" semantic), the identical asset dimmed+grayscaled for an
 * inactive day (never a plain CSS circle — report section 10 explicitly
 * upgrades the old checkmark/circle system to stars). A same-day count
 * only shows when it's genuinely more than one real session.
 */
function renderWeeklyActivityRow(weekdayStripDays) {
  return weekdayStripDays
    .map((d) => {
      const src = d.isToday && d.active ? "/images/gamification/star_gold.png" : "/images/gamification/progress_star_green.png";
      const classes = ["weekday-activity-icon"];
      if (!d.active) classes.push("inactive");
      return `<div class="weekday-activity-day ${d.isToday ? "is-today" : ""}">
        <div class="weekday-activity-label">${d.label}</div>
        <img class="${classes.join(" ")}" src="${src}" alt="" />
        <div class="weekday-activity-count">${d.count > 1 ? `${d.count}次` : ""}</div>
      </div>`;
    })
    .join("");
}

/** Report section 11 — deterministic microcopy from the real activeDays count. Never a medical claim, never an outcome claim — purely how many distinct days this week had a real record. */
function buildWeeklyActivityMicrocopy(activeDays) {
  if (activeDays === 0) return "這週還沒有訓練紀錄";
  if (activeDays <= 2) return "已經開始累積本週進度";
  if (activeDays <= 5) return "這週保持得不錯，繼續累積";
  return "這週幾乎每天都有訓練紀錄";
}

/** Report section 9 — sessionCount-only comparison, never a fabricated quality trend. Returns null when there's nothing meaningful to compare (both weeks empty). */
function buildWeeklyComparisonLabel(weekly) {
  if (weekly.sessionCount === 0 && weekly.previousWeekSessionCount === 0) return null;
  if (weekly.previousWeekSessionCount === 0 && weekly.sessionCount > 0) return "本週開始累積訓練紀錄";
  if (weekly.sessionDelta > 0) return `↑ 比上週多 ${weekly.sessionDelta} 次`;
  if (weekly.sessionDelta < 0) return `↓ 比上週少 ${Math.abs(weekly.sessionDelta)} 次`;
  return "與上週相同";
}

/**
 * Phase 6.4 report section 5-11 — this page is now the real "我的進度"
 * dashboard (Weekly Hero + Weekly Activity + Training History), not just
 * "動作紀錄"; Home/My Page only ever shows the compact summary that links
 * here (report section 3/24: Home answers "did I train recently?", this
 * page answers "what did I do this week, which days, how much XP?").
 * Function/route names are unchanged (goActionRecords()/"records") since
 * they're just internal wiring — only the page's title and content changed.
 */
function actionRecordsPage() {
  const patientId = state.user.id;
  const allRecords = analysisService.getByPatientId(patientId);
  const weekly = buildWeeklyTrainingProgress(allRecords);
  const chips = getTrainingHistorySourceChips(allRecords);
  const activeFilterKey = state.trainingHistorySourceFilter || "all";
  // Report section 10 — the SAME real gamificationEngine.getCurrentStreak()
  // result the Home level/XP card and profilePage already show (this
  // function has no access to patientHome()'s local `gamification` var, so
  // it's fetched directly here — same engine, same patientId, never a
  // second/independent streak calculation).
  const streak = gamificationEngine.getCurrentStreak(patientId);

  const header = `<div class="header">
      <button class="btn btn-light" onclick="switchTab('work')">返回</button>
      <b>我的進度</b>
      <span></span>
    </div>`;

  if (allRecords.length === 0) {
    // Report section 25 — "完全沒有歷史": one honest empty state, no Hero/Weekly Activity/filters to show yet.
    return `${header}<div class="empty-state"><img src="/images/robot/robot_encourage.png" alt="" /><div class="small">還沒有訓練紀錄</div><div class="small" style="color:var(--color-text-secondary);">完成第一次練習後，這裡會顯示你的訓練狀況。</div></div>`;
  }

  // ---- Hero: horizontal story (report section 8/9) — main number + robot
  // share the top row (never robot-above-text-above-stats stacking), a
  // subtle low-opacity star_glow sits behind as background texture (never
  // more than one, never a full-bleed confetti/balloon), and the 3 stats
  // are compact tinted tiles directly under the headline, not stretched
  // to the card's full width. ----
  let heroHtml;
  if (weekly.sessionCount > 0) {
    const comparisonLabel = buildWeeklyComparisonLabel(weekly);
    const trainedToday = (weekly.completedByDay[todayStr()] || 0) > 0;
    const streakEncourageHtml = streak === 0 && trainedToday
      ? `<div class="small progress-hero-streak-encourage">今天完成一次練習，開始累積連續紀錄</div>`
      : "";
    heroHtml = `<div class="card progress-hero-card">
      <img class="progress-hero-decor" src="/images/gamification/star_glow_01.png" alt="" />
      <div class="progress-hero-header-row">
        <div>
          <div class="small">本週訓練</div>
          <div class="progress-hero-number">${weekly.sessionCount} 次</div>
          ${comparisonLabel ? `<div class="small progress-week-delta">${comparisonLabel}</div>` : ""}
        </div>
        <img class="progress-hero-image" src="/images/robot/robot_happy.png" alt="" />
      </div>
      <div class="progress-week-stats-row">
        <div class="progress-week-stat-tile"><img class="progress-week-stat-icon" src="/images/gamification/progress_star_green.png" alt="" style="${weekly.activeDays > 0 ? "" : "opacity:.3;filter:grayscale(1);"}" /><b>${weekly.activeDays}</b><span class="small">訓練日</span></div>
        <div class="progress-week-stat-tile"><img class="progress-week-stat-icon" src="/images/gamification/xp_coin.png" alt="" style="${weekly.totalXp > 0 ? "" : "opacity:.3;filter:grayscale(1);"}" /><b>+${weekly.totalXp}</b><span class="small">本週 XP</span></div>
        <div class="progress-week-stat-tile"><img class="progress-week-stat-icon" src="/images/gamification/streak_fire.png" alt="" style="${streak > 0 ? "" : "opacity:.3;filter:grayscale(1);"}" /><b>${streak}</b><span class="small">連續天數</span></div>
      </div>
      ${streakEncourageHtml}
    </div>`;
  } else {
    const recentEntry = weekly.latestRecord ? buildTrainingHistoryEntry(weekly.latestRecord) : null;
    heroHtml = `<div class="card progress-hero-card">
      <div class="progress-hero-header-row">
        <div>
          <div class="small">本週尚無訓練紀錄</div>
          ${recentEntry ? `<div class="small">最近一次：${recentEntry.exerciseName} · ${formatHistoryGroupLabel(formatDateStr(new Date(recentEntry.completedAt)))}</div>` : ""}
        </div>
        <img class="progress-hero-image" src="/images/robot/robot_idle.png" alt="" />
      </div>
    </div>`;
  }

  // ---- Weekly Activity (report section 10/11) — star nodes with a subtle
  // connector line, a real weekly count in the header, and a deterministic
  // microcopy line at the bottom. ----
  const weekdayStripDays = buildWeekdayStrip(weekly.completedByDay);
  const weeklyActivityHtml = `<div class="card progress-weekly-activity-card">
    <div class="row" style="justify-content:space-between; align-items:center;">
      <b>本週活動</b><span class="small">${weekly.sessionCount} 次</span>
    </div>
    <div class="weekday-activity-row">${renderWeeklyActivityRow(weekdayStripDays)}</div>
    <div class="small progress-weekly-activity-copy">${buildWeeklyActivityMicrocopy(weekly.activeDays)}</div>
  </div>`;

  // ---- Training History ----
  const filteredRecords = activeFilterKey === "all"
    ? allRecords
    : allRecords.filter((r) => normalizeTrainingSource(r).key === activeFilterKey);

  const sortedEntries = filteredRecords
    .map((r) => buildTrainingHistoryEntry(r))
    .filter((e) => e.completedAt)
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));

  const groups = [];
  sortedEntries.forEach((entry) => {
    const dateStr = formatDateStr(new Date(entry.completedAt));
    const relLabel = formatHistoryGroupLabel(dateStr);
    const label = relLabel === "今天" || relLabel === "昨天" ? `${relLabel} · ${formatMonthDay(dateStr)}` : relLabel;
    let group = groups.find((g) => g.label === label);
    if (!group) { group = { label, entries: [] }; groups.push(group); }
    group.entries.push(entry);
  });

  const chipsHtml = chips
    .map((c) => `<span class="history-filter-chip ${c.key === activeFilterKey ? "active" : ""}" onclick="setTrainingHistorySourceFilter('${c.key}')">${c.label}</span>`)
    .join("");

  let historyBodyHtml;
  if (sortedEntries.length === 0) {
    historyBodyHtml = `<div class="empty-state"><img src="/images/robot/robot_search.png" alt="" /><div class="small">沒有符合篩選條件的紀錄</div><span class="more-link clickable" onclick="setTrainingHistorySourceFilter('all')">清除篩選</span></div>`;
  } else {
    // Report section 16 — group label de-emphasized (small gray text), not a big section-title heading.
    historyBodyHtml = groups.map((g) => `<div class="history-date-group-label small">${g.label}</div>${g.entries.map(renderTrainingHistoryCard).join("")}`).join("");
  }

  return `
    ${header}
    ${heroHtml}
    ${weeklyActivityHtml}
    <div class="history-section-header"><b>最近訓練</b><span class="small">${sortedEntries.length} 筆</span></div>
    <div class="history-filter-row">${chipsHtml}</div>
    ${historyBodyHtml}
  `;
}

function goTrainingRecordDetail(recordId) {
  state.selectedRecordId = recordId;
  state.route = "trainingRecordDetail";
  state.tab = "work";
  render();
}

/**
 * Report sections 18-21 — LE01/mediapipe_squat detail, redesigned into
 * compact visual pieces instead of one paragraph-heavy card. Every value
 * still comes straight from record.summary/record — only the presentation
 * changed. Prototype score is deliberately tucked into the collapsed
 * "詳細數據" section, last and smallest, never the page's first visual
 * (report section 21).
 */
function renderSquatRecordDetail(record) {
  const s = record.summary || {};
  const fmtDeg = (v) => (v == null ? "—" : `${Math.round(v)}°`);
  const fmtSec = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} 秒`);
  const totalReps = s.totalReps ?? record.totalReps ?? 0;
  const targetReps = s.targetReps ?? record.targetReps ?? 0;
  const qualityValidReps = s.qualityValidReps ?? null;
  const qualityRatio = calculateQualityRatioPercent(totalReps, qualityValidReps || 0);
  const prototypeScore = record.score ?? record.overallScore ?? null;

  // Report section 18/19 — a real completion progress bar (targetReps is a
  // genuine per-record field, never a fabricated weekly goal) with a real
  // star marker at the fill position, not a 5-star rating over quality.
  const completionRatio = targetReps > 0 ? Math.min(1, totalReps / targetReps) : 0;
  const completionBarHtml = targetReps > 0
    ? `<div class="xp-track gamified completion-progress-bar"><span style="width:${Math.round(completionRatio * 100)}%"></span><img class="xp-track-marker" src="/images/gamification/progress_star_green.png" alt="" style="left:${Math.round(completionRatio * 100)}%" /></div>`
    : "";
  const completionCardHtml = `<div class="card detail-block-card">
    <b class="detail-section-label">完成表現</b>
    <div class="result-summary-row">
      <div class="result-summary-col"><div class="result-summary-value">${totalReps}<span class="result-summary-value-sep">/${targetReps}</span></div><div class="small">完成次數</div></div>
      <div class="result-summary-col"><div class="result-summary-value">${qualityValidReps != null ? `${qualityValidReps}/${totalReps}` : "—"}</div><div class="small">符合品質條件</div></div>
      <div class="result-summary-col"><div class="result-summary-value">${qualityRatio != null ? qualityRatio + "%" : "—"}</div><div class="small">品質比例</div></div>
    </div>
    ${completionBarHtml}
  </div>`;

  // Report section 19 — neutral, non-alarm visual: a real low-key green
  // check when a given issue never occurred, a plain count when it did.
  // Never a red medical-warning style, per spec.
  const issueRows = [
    { label: "下蹲深度", count: s.insufficientDepthCount },
    { label: "軀幹穩定", count: s.trunkLeanCount },
    { label: "膝蓋方向", count: s.kneeValgusCount },
  ].filter((i) => i.count != null);
  const qualityIssueHtml = issueRows.length
    ? `<div class="card detail-block-card">
        <b class="detail-section-label">動作觀察</b>
        ${issueRows
          .map((i) => `<div class="quality-issue-row">
              <span class="small">${i.label}</span>
              ${i.count > 0
                ? `<span class="small quality-issue-count">${i.count} 次提醒</span>`
                : `<span class="quality-issue-ok"><img class="quality-issue-check" src="/images/gamification/checkmark_01.png" alt="" />0 次</span>`}
            </div>`)
          .join("")}
      </div>`
    : "";

  // Report section 20 — only shown when it actually happened; framed as a
  // tracking-reliability note (robot_thinking, neutral), never a quality error.
  const trackingHtml = s.repsWithTrackingGap > 0
    ? `<div class="card detail-block-card tracking-reliability-card">
        <img class="tracking-reliability-icon" src="/images/robot/robot_thinking.png" alt="" />
        <div><b class="detail-section-label">追蹤穩定度</b><div class="small">有 ${s.repsWithTrackingGap} 次動作曾出現短暫追蹤中斷</div></div>
      </div>`
    : "";

  // Report section 21/22 — collapsed "詳細數據". Prototype score joins the
  // same compact tile grid (still de-emphasized: still collapsed, still
  // last) instead of a separate paragraph line, for visual consistency
  // with the other two real metrics.
  const detailAnalysisHtml = `<details class="result-tech-details">
    <summary>詳細數據</summary>
    <div class="detail-metrics-grid">
      <div class="detail-metric-col"><div class="small">膝角度</div><b>${fmtDeg(s.averageMinKneeAngle)}</b></div>
      <div class="detail-metric-col"><div class="small">平均時間</div><b>${fmtSec(s.averageRepDuration)}</b></div>
      ${prototypeScore != null ? `<div class="detail-metric-col"><div class="small">Prototype</div><b>${prototypeScore}</b></div>` : ""}
    </div>
    ${record.remark ? `<div class="small" style="margin-top:8px;"><b>AI 建議：</b>${record.remark}</div>` : ""}
    <div class="small" style="margin-top:4px; color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div>
  </details>`;

  return `${completionCardHtml}${qualityIssueHtml}${trackingHtml}${detailAnalysisHtml}`;
}

function renderCr05RecordDetail(record) {
  const s = record.summary || {};
  const fmtDeg = (v) => (v == null ? "—" : `${Math.round(v)}°`);
  const fmtSec = (ms) => (ms == null ? "—" : `${(ms / 1000).toFixed(1)} 秒`);
  const totalReps = s.totalReps ?? record.totalReps ?? 0;
  const targetReps = s.targetReps ?? record.targetReps ?? 0;
  const qualityValidReps = s.qualityValidReps ?? record.validReps ?? null;
  const qualityRatio = calculateQualityRatioPercent(totalReps, qualityValidReps || 0);
  const prototypeScore = record.score ?? record.overallScore ?? null;
  const completionRatio = targetReps > 0 ? Math.min(1, totalReps / targetReps) : 0;
  const completionBarHtml = targetReps > 0
    ? `<div class="xp-track gamified completion-progress-bar"><span style="width:${Math.round(completionRatio * 100)}%"></span><img class="xp-track-marker" src="/images/gamification/progress_star_green.png" alt="" style="left:${Math.round(completionRatio * 100)}%" /></div>`
    : "";
  const completionCardHtml = `<div class="card detail-block-card">
    <b class="detail-section-label">完成表現</b>
    <div class="result-summary-row">
      <div class="result-summary-col"><div class="result-summary-value">${totalReps}<span class="result-summary-value-sep">/${targetReps}</span></div><div class="small">完成次數</div></div>
      <div class="result-summary-col"><div class="result-summary-value">${qualityValidReps != null ? `${qualityValidReps}/${totalReps}` : "—"}</div><div class="small">符合品質條件</div></div>
      <div class="result-summary-col"><div class="result-summary-value">${prototypeScore != null ? `${prototypeScore}<span class="result-summary-value-sep">/100</span>` : "—"}</div><div class="small">品質分數</div></div>
    </div>
    ${completionBarHtml}
  </div>`;
  const issueRows = [
    { label: "抬膝幅度", count: s.insufficientRaiseCount },
    { label: "軀幹穩定", count: s.excessiveTrunkLeanCount },
    { label: "左右交替", count: s.rhythmIssueCount },
    { label: "動作速度", count: s.tooFastCount },
  ].filter((i) => i.count != null);
  const qualityIssueHtml = issueRows.length
    ? `<div class="card detail-block-card"><b class="detail-section-label">動作觀察</b>${issueRows.map((i) => `<div class="quality-issue-row"><span class="small">${i.label}</span>${i.count > 0 ? `<span class="small quality-issue-count">${i.count} 次提醒</span>` : `<span class="quality-issue-ok"><img class="quality-issue-check" src="/images/gamification/checkmark_01.png" alt="" />0 次</span>`}</div>`).join("")}</div>`
    : "";
  const trackingCount = s.trackingInterruptionCount ?? s.repsWithTrackingGap ?? 0;
  const trackingHtml = trackingCount > 0
    ? `<div class="card detail-block-card tracking-reliability-card"><img class="tracking-reliability-icon" src="/images/robot/robot_thinking.png" alt="" /><div><b class="detail-section-label">追蹤穩定度</b><div class="small">動作途中曾出現 ${trackingCount} 次短暫追蹤中斷</div></div></div>`
    : "";
  const detailAnalysisHtml = `<details class="result-tech-details"><summary>詳細數據</summary><div class="detail-metrics-grid"><div class="detail-metric-col"><div class="small">髖角度</div><b>${fmtDeg(s.averageMinHipAngle)}</b></div><div class="detail-metric-col"><div class="small">平均時間</div><b>${fmtSec(s.averageRepDuration)}</b></div>${prototypeScore != null ? `<div class="detail-metric-col"><div class="small">Prototype</div><b>${prototypeScore}</b></div>` : ""}</div>${record.remark ? `<div class="small" style="margin-top:8px;"><b>AI 建議：</b>${record.remark}</div>` : ""}<div class="small" style="margin-top:4px; color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details>`;
  return `${completionCardHtml}${qualityIssueHtml}${trackingHtml}${detailAnalysisHtml}`;
}

function renderKn03RecordDetail(record) {
  const s = record.summary || {};
  const totalReps = s.totalReps ?? record.totalReps ?? 0;
  const targetReps = s.targetReps ?? record.targetReps ?? 0;
  const validReps = s.qualityValidReps ?? record.validReps ?? null;
  const score = record.score ?? record.overallScore ?? null;
  const ratio = targetReps > 0 ? Math.min(1, totalReps / targetReps) : 0;
  const issueRows = [
    { label: "膝蓋伸直", count: s.insufficientExtensionCount },
    { label: "軀幹穩定", count: s.excessiveTrunkLeanCount },
    { label: "大腿穩定", count: s.thighLiftCount },
    { label: "左右交替", count: s.rhythmIssueCount },
    { label: "動作速度", count: s.tooFastCount },
  ].filter((i) => i.count != null);
  const completion = `<div class="card detail-block-card"><b class="detail-section-label">完成表現</b><div class="result-summary-row">
    <div class="result-summary-col"><div class="result-summary-value">${totalReps}<span class="result-summary-value-sep">/${targetReps}</span></div><div class="small">完成次數</div></div>
    <div class="result-summary-col"><div class="result-summary-value">${validReps != null ? `${validReps}/${totalReps}` : "—"}</div><div class="small">符合品質條件</div></div>
    <div class="result-summary-col"><div class="result-summary-value">${score != null ? `${score}<span class="result-summary-value-sep">/100</span>` : "—"}</div><div class="small">品質分數</div></div>
  </div>${targetReps > 0 ? `<div class="xp-track gamified completion-progress-bar"><span style="width:${Math.round(ratio * 100)}%"></span><img class="xp-track-marker" src="/images/gamification/progress_star_green.png" alt="" style="left:${Math.round(ratio * 100)}%" /></div>` : ""}</div>`;
  const observations = issueRows.length ? `<div class="card detail-block-card"><b class="detail-section-label">動作觀察</b>${issueRows.map((i) => `<div class="quality-issue-row"><span class="small">${i.label}</span>${i.count > 0 ? `<span class="small quality-issue-count">${i.count} 次提醒</span>` : `<span class="quality-issue-ok"><img class="quality-issue-check" src="/images/gamification/checkmark_01.png" alt="" />0 次</span>`}</div>`).join("")}</div>` : "";
  const trackingCount = s.trackingInterruptionCount ?? s.repsWithTrackingGap ?? 0;
  const tracking = trackingCount > 0 ? `<div class="card detail-block-card tracking-reliability-card"><img class="tracking-reliability-icon" src="/images/robot/robot_thinking.png" alt="" /><div><b class="detail-section-label">追蹤穩定度</b><div class="small">動作途中曾出現 ${trackingCount} 次短暫追蹤中斷</div></div></div>` : "";
  const details = `<details class="result-tech-details"><summary>詳細數據</summary><div class="detail-metrics-grid"><div class="detail-metric-col"><div class="small">最大膝角度</div><b>${s.averageMaxKneeAngle == null ? "—" : `${Math.round(s.averageMaxKneeAngle)}°`}</b></div><div class="detail-metric-col"><div class="small">平均時間</div><b>${s.averageRepDuration == null ? "—" : `${(s.averageRepDuration / 1000).toFixed(1)} 秒`}</b></div>${score != null ? `<div class="detail-metric-col"><div class="small">Prototype</div><b>${score}</b></div>` : ""}</div>${record.remark ? `<div class="small" style="margin-top:8px;"><b>AI 建議：</b>${record.remark}</div>` : ""}<div class="small" style="margin-top:4px; color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details>`;
  return `${completion}${observations}${tracking}${details}`;
}

function renderLe05RecordDetail(record) {
  const s=record.summary||{}, total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,valid=s.qualityValidReps??record.validReps??null,score=record.score??record.overallScore??null,ratio=target>0?Math.min(1,total/target):0;
  const rows=[{label:"完全站直",count:s.incompleteStandCount},{label:"軀幹控制",count:s.excessiveTrunkLeanCount},{label:"膝蓋方向",count:s.kneeValgusCount},{label:"左右出力",count:s.asymmetryCount},{label:"起身速度",count:s.tooFastCount},{label:"坐下控制",count:s.fastDescentCount}].filter(i=>i.count!=null);
  const completion=`<div class="card detail-block-card"><b class="detail-section-label">完成表現</b><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">${total}<span class="result-summary-value-sep">/${target}</span></div><div class="small">完成次數</div></div><div class="result-summary-col"><div class="result-summary-value">${valid!=null?`${valid}/${total}`:"—"}</div><div class="small">符合品質條件</div></div><div class="result-summary-col"><div class="result-summary-value">${score!=null?`${score}<span class="result-summary-value-sep">/100</span>`:"—"}</div><div class="small">品質分數</div></div></div>${target>0?`<div class="xp-track gamified completion-progress-bar"><span style="width:${Math.round(ratio*100)}%"></span><img class="xp-track-marker" src="/images/gamification/progress_star_green.png" alt="" style="left:${Math.round(ratio*100)}%" /></div>`:""}</div>`;
  const observations=rows.length?`<div class="card detail-block-card"><b class="detail-section-label">動作觀察</b>${rows.map(i=>`<div class="quality-issue-row"><span class="small">${i.label}</span>${i.count>0?`<span class="small quality-issue-count">${i.count} 次提醒</span>`:`<span class="quality-issue-ok"><img class="quality-issue-check" src="/images/gamification/checkmark_01.png" alt="" />0 次</span>`}</div>`).join("")}</div>`:"";
  const tc=s.trackingInterruptionCount??s.repsWithTrackingGap??0,tracking=tc>0?`<div class="card detail-block-card tracking-reliability-card"><img class="tracking-reliability-icon" src="/images/robot/robot_thinking.png" alt="" /><div><b class="detail-section-label">追蹤穩定度</b><div class="small">動作途中曾出現 ${tc} 次短暫追蹤中斷</div></div></div>`:"";
  const details=`<details class="result-tech-details"><summary>詳細數據</summary><div class="detail-metrics-grid"><div class="detail-metric-col"><div class="small">站立膝角度</div><b>${s.averageMaxKneeAngle==null?"—":`${Math.round(s.averageMaxKneeAngle)}°`}</b></div><div class="detail-metric-col"><div class="small">平均時間</div><b>${s.averageRepDuration==null?"—":`${(s.averageRepDuration/1000).toFixed(1)} 秒`}</b></div>${score!=null?`<div class="detail-metric-col"><div class="small">Prototype</div><b>${score}</b></div>`:""}</div>${record.remark?`<div class="small" style="margin-top:8px;"><b>AI 建議：</b>${record.remark}</div>`:""}<div class="small" style="margin-top:4px;color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details>`;
  return `${completion}${observations}${tracking}${details}`;
}
function renderLe03RecordDetail(record){const s=record.summary||{},total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,valid=s.qualityValidReps??record.validReps??null,score=record.score??record.overallScore??null,ratio=target>0?Math.min(1,total/target):0,rows=[{label:"臀部抬升",count:s.insufficientLiftCount},{label:"髖部高度",count:s.overextensionCount},{label:"骨盆對稱",count:s.asymmetryCount},{label:"抬起速度",count:s.tooFastCount},{label:"放下控制",count:s.fastLoweringCount}].filter(i=>i.count!=null),tc=s.trackingInterruptionCount??s.repsWithTrackingGap??0;return `<div class="card detail-block-card"><b class="detail-section-label">完成表現</b><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">${total}<span class="result-summary-value-sep">/${target}</span></div><div class="small">完成次數</div></div><div class="result-summary-col"><div class="result-summary-value">${valid!=null?`${valid}/${total}`:"—"}</div><div class="small">符合品質條件</div></div><div class="result-summary-col"><div class="result-summary-value">${score!=null?`${score}<span class="result-summary-value-sep">/100</span>`:"—"}</div><div class="small">品質分數</div></div></div>${target>0?`<div class="xp-track gamified completion-progress-bar"><span style="width:${Math.round(ratio*100)}%"></span><img class="xp-track-marker" src="/images/gamification/progress_star_green.png" alt="" style="left:${Math.round(ratio*100)}%" /></div>`:""}</div>${rows.length?`<div class="card detail-block-card"><b class="detail-section-label">動作觀察</b>${rows.map(i=>`<div class="quality-issue-row"><span class="small">${i.label}</span>${i.count>0?`<span class="small quality-issue-count">${i.count} 次提醒</span>`:`<span class="quality-issue-ok"><img class="quality-issue-check" src="/images/gamification/checkmark_01.png" alt="" />0 次</span>`}</div>`).join("")}</div>`:""}${tc>0?`<div class="card detail-block-card tracking-reliability-card"><img class="tracking-reliability-icon" src="/images/robot/robot_thinking.png" alt="" /><div><b class="detail-section-label">追蹤穩定度</b><div class="small">動作途中曾出現 ${tc} 次短暫追蹤中斷</div></div></div>`:""}<details class="result-tech-details"><summary>詳細數據</summary><div class="detail-metrics-grid"><div class="detail-metric-col"><div class="small">最大髖角度</div><b>${s.averageMaxHipAngle==null?"—":`${Math.round(s.averageMaxHipAngle)}°`}</b></div><div class="detail-metric-col"><div class="small">平均時間</div><b>${s.averageRepDuration==null?"—":`${(s.averageRepDuration/1000).toFixed(1)} 秒`}</b></div>${score!=null?`<div class="detail-metric-col"><div class="small">Prototype</div><b>${score}</b></div>`:""}</div>${record.remark?`<div class="small" style="margin-top:8px;"><b>AI 建議：</b>${record.remark}</div>`:""}<div class="small" style="margin-top:4px;color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details>`;}

/**
 * Report section 19 — Generic/Legacy detail renderer for any non-squat
 * record (old "mock" seed records, or a stray HP02-ish record that should
 * never formally exist per report section 20 — either way, rendered here,
 * never given a fake formal-analysis look). Only ever shows fields
 * confirmed to actually exist on the record; always carries the explicit
 * "舊版紀錄" disclaimer so it's never mistaken for real MediaPipe analysis.
 */
function renderLe04RecordDetail(record){const s=record.summary||{},total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,valid=s.qualityValidReps??record.validReps??null,score=record.score??record.overallScore??null,ratio=target>0?Math.min(1,total/target):0,rows=[{label:"抬腿高度",count:s.insufficientRaiseCount},{label:"高度控制",count:s.excessiveRaiseCount},{label:"膝蓋伸直",count:s.kneeBendCount},{label:"骨盆穩定",count:s.bodyRollCount},{label:"動作速度",count:s.tooFastCount}].filter(i=>i.count!=null),tc=s.trackingInterruptionCount??s.repsWithTrackingGap??0;return `<div class="card detail-block-card"><b class="detail-section-label">完成表現</b><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">${total}<span class="result-summary-value-sep">/${target}</span></div><div class="small">完成次數</div></div><div class="result-summary-col"><div class="result-summary-value">${valid!=null?`${valid}/${total}`:"—"}</div><div class="small">符合品質條件</div></div><div class="result-summary-col"><div class="result-summary-value">${score!=null?`${score}<span class="result-summary-value-sep">/100</span>`:"—"}</div><div class="small">品質分數</div></div></div>${target>0?`<div class="xp-track gamified completion-progress-bar"><span style="width:${Math.round(ratio*100)}%"></span><img class="xp-track-marker" src="/images/gamification/progress_star_green.png" alt="" style="left:${Math.round(ratio*100)}%" /></div>`:""}</div><div class="card detail-block-card"><b class="detail-section-label">左右完成</b><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">${s.leftReps||0}</div><div class="small">左腿</div></div><div class="result-summary-col"><div class="result-summary-value">${s.rightReps||0}</div><div class="small">右腿</div></div></div></div>${rows.length?`<div class="card detail-block-card"><b class="detail-section-label">動作觀察</b>${rows.map(i=>`<div class="quality-issue-row"><span class="small">${i.label}</span>${i.count>0?`<span class="small quality-issue-count">${i.count} 次提醒</span>`:`<span class="quality-issue-ok"><img class="quality-issue-check" src="/images/gamification/checkmark_01.png" alt="" />0 次</span>`}</div>`).join("")}</div>`:""}${tc>0?`<div class="card detail-block-card tracking-reliability-card"><img class="tracking-reliability-icon" src="/images/robot/robot_thinking.png" alt="" /><div><b class="detail-section-label">追蹤穩定度</b><div class="small">動作途中曾出現 ${tc} 次短暫追蹤中斷</div></div></div>`:""}<details class="result-tech-details"><summary>詳細數據</summary><div class="detail-metrics-grid"><div class="detail-metric-col"><div class="small">最低髖角度</div><b>${s.averageMinHipAngle==null?"—":`${Math.round(s.averageMinHipAngle)}°`}</b></div><div class="detail-metric-col"><div class="small">平均時間</div><b>${s.averageRepDuration==null?"—":`${(s.averageRepDuration/1000).toFixed(1)} 秒`}</b></div>${score!=null?`<div class="detail-metric-col"><div class="small">Prototype</div><b>${score}</b></div>`:""}</div>${record.remark?`<div class="small" style="margin-top:8px;"><b>AI 建議：</b>${record.remark}</div>`:""}<div class="small" style="margin-top:4px;color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details>`;}

function renderGenericRecordDetail(record, entry) {
  const score = record.overallScore ?? record.score ?? null;
  return `<div class="card detail-block-card">
    <div class="small" style="color:#b8860b; margin-bottom:6px;">此筆為舊版紀錄，詳細動作品質資料有限。</div>
    ${entry.completion.completedReps != null ? `<div class="small">完成次數：${entry.completion.completedReps}${entry.completion.targetReps ? ` / ${entry.completion.targetReps}` : ""}</div>` : ""}
    ${score != null ? `<div class="small">分數：${score} 分</div>` : ""}
    ${Array.isArray(record.recommendations) && record.recommendations.length ? `<div class="small" style="margin-top:6px;"><b>建議：</b>${record.recommendations.join("；")}</div>` : ""}
  </div>`;
}

/**
 * Report section 17 — shared Hero (exercise thumbnail/name/date/source/
 * completion/XP) + branch by analysisMode. Single-record read only; never
 * mutates analysisService data. The exercise name now appears exactly
 * once (inside the Hero) — the page header itself carries a plain, generic
 * "單次紀錄" label instead of repeating the exercise name a second time.
 */
function trainingRecordDetailPage() {
  const record = analysisService.getById(state.selectedRecordId);
  if (!record) {
    return `<div class="header"><button class="btn btn-light" onclick="goActionRecords()">返回</button><b>單次紀錄</b><span></span></div>
      <div class="empty-state"><div class="small">找不到這筆紀錄，可能已被移除。</div></div>`;
  }
  const entry = buildTrainingHistoryEntry(record);
  // Report section 17 — image/name/date/source share one horizontal
  // composition (no separate text block below the image), XP anchored to
  // the card's bottom-right corner so the Hero reads as a single unit.
  const heroHtml = `<div class="card record-detail-hero-card">
    <div class="record-detail-hero-top-row">
      <div class="record-detail-hero-image">${renderHistoryCardImage(entry)}</div>
      <div class="record-detail-hero-text">
        <h2 class="record-detail-hero-name">${entry.exerciseName}</h2>
        <div class="small">${formatRecordDateTime(entry.completedAt)}</div>
        <span class="source-tag-badge ${sourceBadgeClassFor(entry.sourceType)}">${entry.sourceLabel}</span>
      </div>
    </div>
    ${entry.xpEarned != null ? `<div class="record-detail-hero-xp"><img class="history-card-xp-icon" src="/images/gamification/xp_coin.png" alt="" />+${entry.xpEarned} XP</div>` : ""}
  </div>`;
  const detailHtml = entry.detailType === "squat"
    ? renderSquatRecordDetail(record)
    : entry.detailType === "cr05"
    ? renderCr05RecordDetail(record)
    : entry.detailType === "kn03"
    ? renderKn03RecordDetail(record)
    : entry.detailType === "le05"
    ? renderLe05RecordDetail(record)
    : entry.detailType === "le03"
    ? renderLe03RecordDetail(record)
    : entry.detailType === "le04"
    ? renderLe04RecordDetail(record)
    : renderGenericRecordDetail(record, entry);
  return `
    <div class="header">
      <button class="btn btn-light" onclick="goActionRecords()">返回</button>
      <b>單次紀錄</b>
      <span></span>
    </div>
    ${heroHtml}
    ${detailHtml}
  `;
}

function patientAchievementsPage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="switchTab('profile')">返回</button>
      <b>成就徽章</b>
      <img class="icon" src="/images/profile_selected.png" alt="成就" />
    </div>
    <div class="score-hero">
      <div class="score-ring"><span>12</span><small>Lv.</small></div>
      <div>
        <h2>復健達人</h2>
        <p class="small">XP 3850 / 4200，距離 Lv.13 還差 350 XP</p>
        <div class="xp-track wide"><span style="width:92%"></span></div>
      </div>
    </div>
    <h3 class="section-title">已解鎖徽章</h3>
    <div class="badge-grid">
      ${badge('🏅','初次訓練','完成第一項復健任務')}
      ${badge('🔥','連續7天','連續一週完成課表')}
      ${badge('🌟','復健達人','累積訓練達200次')}
      ${badge('🦵','動作穩定王','動作品質達85分以上')}
      ${badge('📈','進步曲線','連續三週分數提升')}
      ${badge('🤖','AI挑戰者','完成AI分析任務')}
    </div>
    <h3 class="section-title">下一個目標</h3>
    <div class="card"><b>連續30天挑戰者</b><div class="small">目前 28 / 30 天，再完成 2 天即可解鎖。</div></div>
  `;
}

/**
 * Local-only dev/demo tool — lets you see every account (including raw
 * passwords, on demand) in the current browser's localStorage. Only
 * reachable by the therapist01 demo account (checked both at the nav
 * function and again here, in case someone lands on this route without
 * going through the nav function).
 *
 * SECURITY / DEMO-ONLY NOTES — read before touching this function:
 *  - Revealing a raw password is only acceptable because this whole app is
 *    a localStorage-only prototype with no real backend or real users.
 *  - Once real auth (e.g. Firebase Authentication) is wired up, this entire
 *    page (and password-reveal capability) MUST be removed — a real backend
 *    should never return raw passwords to a client at all.
 *  - Never console.log a password or account list from this page.
 *  - Never add a "copy/export all accounts" or "export all passwords"
 *    feature — reveal/copy stays strictly per-row, one account at a time.
 *  - Never write real or demo credentials into new files, commit messages,
 *    or README/docs.
 */
function getPatientRelationStatus(patientId) {
  const active = relationService.findActiveByPatientId(patientId);
  if (active.length) {
    return { label: "照護中", value: "active", therapistId: active[0].therapistId };
  }
  const history = relationService.findHistoryByPatientId(patientId);
  if (history.length) {
    const latest = [...history].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    return {
      label: latest.status === "completed" ? "療程完成" : "已解除",
      value: latest.status,
      therapistId: latest.therapistId,
    };
  }
  return { label: "尚未綁定", value: "none", therapistId: null };
}

function sortDevAccounts(list, demoAccount) {
  return [...list].sort((a, b) => {
    if (a.account === demoAccount) return -1;
    if (b.account === demoAccount) return 1;
    return new Date(b.createdAt) - new Date(a.createdAt);
  });
}

function renderDevDataMaintenanceSection() {
  const confirmHtml = state.transferConfirming && state.transferPreview
    ? `<div class="confirm-card" style="margin-top:8px;">
        <b>此操作會將 therapist01 目前照護中的患者移交給 ${state.transferPreview.to.name}（therapist02）。尚未完成及未來課表也會同步移交，已完成的歷史課表與分析紀錄會保留原負責人。確定執行嗎？</b>
        <div class="small" style="margin-top:8px;">預計轉移患者數：${state.transferPreview.patientCount}</div>
        <div class="small">預計更新課表數：${state.transferPreview.scheduleUpdateCount}</div>
        <div class="small">已存在重複關係數：${state.transferPreview.duplicateCount}</div>
        <div class="small">不會修改的歷史課表數：${state.transferPreview.scheduleKeepCount}</div>
        <div class="row" style="margin-top:10px;">
          <button class="btn btn-light" style="flex:1" onclick="cancelTherapistTransfer()">取消</button>
          <button class="btn btn-primary" style="flex:1" onclick="confirmTherapistTransfer()">確定執行</button>
        </div>
      </div>`
    : "";
  const resultHtml = state.transferResult
    ? (state.transferResult.error
        ? `<div class="card" style="margin-top:8px;"><div class="small" style="color:#c0392b;">${state.transferResult.error}</div></div>`
        : `<div class="card" style="margin-top:8px;">
            <b>上次轉移結果</b>
            <div class="small">已轉移患者數：${state.transferResult.transferredCount}</div>
            <div class="small">已更新課表數：${state.transferResult.scheduleUpdateCount}</div>
            <div class="small">跳過重複數：${state.transferResult.skippedDuplicateCount}</div>
            <div class="small">保留歷史課表數：${state.transferResult.scheduleKeepCount}</div>
          </div>`)
    : "";
  return `<h3 class="section-title">開發資料維護</h3>
    <div class="card">
      <div class="small">將 therapist01 目前照護中的患者，連同尚未完成／未來的課表，一併移交給 therapist02（Judy）。已完成的歷史課表與分析紀錄會保留原負責人不變。</div>
      <button class="btn btn-light full" onclick="startTherapistTransfer()">將 therapist01 現行個案轉移給 therapist02</button>
      ${confirmHtml}
      ${resultHtml}
    </div>`;
}

function devAccountsPage() {
  if (!state.user || state.user.isDeveloperAccount !== true) {
    return therapistHome();
  }
  const filter = state.devAccountsFilter || "all";
  const search = (state.devAccountsSearch || "").trim().toLowerCase();
  const revealedIds = state.devAccountsRevealedIds || [];
  const allUsers = userService.list();

  const matchesSearch = (u) =>
    !search || u.name.toLowerCase().includes(search) || u.account.toLowerCase().includes(search);
  const matchesFilter = (u) => {
    if (filter === "all") return true;
    if (filter === "patient") return u.role === "patient";
    if (filter === "therapist") return u.role === "therapist";
    // 照護中／療程完成／已解除 describe a patient's relation status, so
    // these three filter down to patients only.
    if (u.role !== "patient") return false;
    return getPatientRelationStatus(u.id).value === filter;
  };

  const therapists = sortDevAccounts(
    allUsers.filter((u) => u.role === "therapist" && matchesSearch(u) && matchesFilter(u)),
    "therapist01"
  );
  const patients = sortDevAccounts(
    allUsers.filter((u) => u.role === "patient" && matchesSearch(u) && matchesFilter(u)),
    "patient01"
  );

  const renderAccountCard = (u) => {
    const isDemoAccount = u.account === "therapist01" || u.account === "patient01";
    const isRevealed = revealedIds.includes(u.id);
    const passwordDisplay = u.password != null
      ? (isRevealed ? u.password : "••••••")
      : "無法查看，請重設密碼";
    const demoPasswordHint = isDemoAccount && u.password != null && !isRevealed ? "（測試密碼：123456）" : "";
    const relationStatus = u.role === "patient" ? getPatientRelationStatus(u.id) : null;
    const boundTherapistName = u.role === "patient" && relationStatus.therapistId
      ? (userService.getById(relationStatus.therapistId)?.name || "-")
      : "-";
    const currentCaseCount = u.role === "therapist" ? relationService.findActiveByTherapistId(u.id).length : null;
    const accountTypeLabel = u.role === "patient" ? "患者" : (u.isDeveloperAccount === true ? "開發管理帳號" : "一般復健師");

    const resetConfirmHtml = state.devAccountsResetConfirmingId === u.id
      ? `<div class="confirm-card" style="margin-top:8px;">
          <b>確定將此帳號密碼重設為 123456？</b>
          <div class="row" style="margin-top:10px;">
            <button class="btn btn-light" style="flex:1" onclick="cancelResetPassword()">取消</button>
            <button class="btn btn-primary" style="flex:1" onclick="confirmResetPassword('${u.id}')">確認重設</button>
          </div>
        </div>`
      : "";

    const editAccountHtml = state.editAccountId === u.id
      ? `<div class="confirm-card" style="margin-top:8px;">
          <div class="small">目前帳號：${u.account}</div>
          <input id="editAccountNew" placeholder="新帳號（英數與底線，至少4碼）" style="margin-top:6px;" />
          <div style="height:8px"></div>
          <input id="editAccountConfirm" placeholder="確認新帳號" />
          ${state.editAccountMessage ? `<div class="small" style="color:#c0392b; margin-top:6px;">${state.editAccountMessage}</div>` : ""}
          <div class="row" style="margin-top:10px;">
            <button class="btn btn-light" style="flex:1" onclick="cancelEditAccount()">取消</button>
            <button class="btn btn-primary" style="flex:1" onclick="confirmEditAccount('${u.id}')">確認修改</button>
          </div>
        </div>`
      : "";

    return `<div class="card" style="margin-bottom:8px;">
      <div><b>${u.name}</b>　<span class="small">帳號：${u.account}${isDemoAccount ? "（範例帳號）" : ""}</span></div>
      <div class="small">身分：${u.role === "therapist" ? "復健師" : "患者"}</div>
      <div class="small">帳號類型：${accountTypeLabel}</div>
      <div class="small">使用者 ID：${u.id}</div>
      <div class="small">建立時間：${(u.createdAt || "").slice(0, 10)}</div>
      ${u.role === "therapist" ? `<div class="small">復健師邀請碼：${u.inviteCode || "-"}</div>` : ""}
      <div class="small">關係狀態：${u.role === "patient" ? relationStatus.label : "-"}</div>
      <div class="small">所屬／綁定復健師：${u.role === "patient" ? boundTherapistName : "-"}</div>
      ${u.role === "therapist" ? `<div class="small">目前個案數：${currentCaseCount}</div>` : ""}
      <div class="small">密碼：${passwordDisplay}${demoPasswordHint}</div>
      <div class="row" style="margin-top:8px;">
        <button class="btn btn-light" style="flex:1" onclick="togglePasswordVisibility('${u.id}')">${isRevealed ? "隱藏密碼" : "顯示密碼"}</button>
        <button class="btn btn-light" style="flex:1" onclick="copyDevAccountText('${u.account}')">複製帳號</button>
      </div>
      <div class="row" style="margin-top:6px;">
        <button class="btn btn-light" style="flex:1" onclick="copyDevAccountPassword('${u.id}')">複製密碼</button>
        <button class="btn btn-light" style="flex:1" onclick="startResetPassword('${u.id}')">重設為 123456</button>
      </div>
      <div class="row" style="margin-top:6px;">
        <button class="btn btn-light full" onclick="startEditAccount('${u.id}')">修改帳號</button>
      </div>
      ${resetConfirmHtml}
      ${editAccountHtml}
    </div>`;
  };

  const therapistListHtml = therapists.length
    ? therapists.map(renderAccountCard).join("")
    : `<div class="card muted center">沒有符合條件的復健師帳號</div>`;
  const patientListHtml = patients.length
    ? patients.map(renderAccountCard).join("")
    : `<div class="card muted center">沒有符合條件的患者帳號</div>`;

  const showTherapists = filter === "all" || filter === "therapist";
  const showPatients = filter !== "therapist";
  const activeRelationCount = relationService.list().filter((r) => r.status === "accepted").length;

  return `
    <div class="header">
      <button class="btn btn-light" onclick="switchTab('profile')">返回</button>
      <b>測試帳號管理</b>
      <img class="icon" src="/images/profile_selected.png" alt="帳號" />
    </div>
    <div class="card muted">僅供本機開發與驗收使用，正式版本必須移除。正式系統不得查看使用者原始密碼。</div>
    <div class="card muted" style="margin-top:8px;">開發管理帳號：therapist01 / 123456</div>
    ${renderDevDataMaintenanceSection()}
    <div class="stats" style="margin-top:10px;">
      <div class="stat"><span class="small">總帳號數</span><b>${allUsers.length}</b></div>
      <div class="stat"><span class="small">患者數</span><b>${allUsers.filter((u) => u.role === "patient").length}</b></div>
      <div class="stat"><span class="small">復健師數</span><b>${allUsers.filter((u) => u.role === "therapist").length}</b></div>
      <div class="stat"><span class="small">照護關係數</span><b>${activeRelationCount}</b></div>
    </div>
    <h3 class="section-title">篩選與搜尋</h3>
    <div class="card">
      <select id="devAccountsFilter" onchange="onDevAccountsFilterChange()">
        <option value="all" ${filter === "all" ? "selected" : ""}>全部</option>
        <option value="patient" ${filter === "patient" ? "selected" : ""}>患者</option>
        <option value="therapist" ${filter === "therapist" ? "selected" : ""}>復健師</option>
        <option value="active" ${filter === "active" ? "selected" : ""}>照護中</option>
        <option value="completed" ${filter === "completed" ? "selected" : ""}>療程完成</option>
        <option value="revoked" ${filter === "revoked" ? "selected" : ""}>已解除</option>
      </select>
      <div style="height:8px"></div>
      <input id="devAccountsSearch" placeholder="依姓名或帳號搜尋" value="${state.devAccountsSearch || ""}" onchange="onDevAccountsSearchChange()" />
    </div>
    ${showTherapists ? `<h3 class="section-title">A. 復健師帳號（${therapists.length}）</h3>${therapistListHtml}` : ""}
    ${showPatients ? `<h3 class="section-title">B. 患者帳號（${patients.length}）</h3>${patientListHtml}` : ""}
  `;
}

function goDevAccounts() {
  if (!state.user || state.user.isDeveloperAccount !== true) {
    alert("您沒有權限進入此頁面。");
    return;
  }
  state.route = "devAccounts";
  render();
}

function onDevAccountsFilterChange() {
  state.devAccountsFilter = document.getElementById("devAccountsFilter").value;
  render();
}

function onDevAccountsSearchChange() {
  state.devAccountsSearch = document.getElementById("devAccountsSearch").value;
  render();
}

function togglePasswordVisibility(userId) {
  const revealed = new Set(state.devAccountsRevealedIds || []);
  if (revealed.has(userId)) revealed.delete(userId);
  else revealed.add(userId);
  state.devAccountsRevealedIds = [...revealed];
  render();
}

function copyDevAccountsText(text, successMessage) {
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => alert(successMessage),
      () => alert(`請手動選取複製：${text}`)
    );
  } else {
    alert(`請手動選取複製：${text}`);
  }
}

function copyDevAccountText(account) {
  copyDevAccountsText(account, "已複製帳號");
}

function copyDevAccountPassword(userId) {
  const user = userService.getById(userId);
  if (!user || user.password == null) {
    return alert("無法複製，此帳號密碼欄位不存在。");
  }
  copyDevAccountsText(user.password, "已複製密碼");
}

function startResetPassword(userId) {
  state.devAccountsResetConfirmingId = userId;
  render();
}

function cancelResetPassword() {
  state.devAccountsResetConfirmingId = null;
  render();
}

function confirmResetPassword(userId) {
  const user = userService.getById(userId);
  if (!user) return;
  userService.update(userId, { password: "123456" });
  state.devAccountsResetConfirmingId = null;
  alert("密碼已重設為 123456。");
  render();
}

/* ---- 帳號修改（自訂卡片，不使用 window.prompt） ---- */

function startEditAccount(userId) {
  state.editAccountId = userId;
  state.editAccountMessage = null;
  render();
}

function cancelEditAccount() {
  state.editAccountId = null;
  state.editAccountMessage = null;
  render();
}

function confirmEditAccount(userId) {
  const newAccount = (document.getElementById("editAccountNew").value || "").trim();
  const confirmAccount = (document.getElementById("editAccountConfirm").value || "").trim();

  if (!newAccount) {
    state.editAccountMessage = "新帳號不得為空";
    return render();
  }
  if (!/^[A-Za-z0-9_]+$/.test(newAccount)) {
    state.editAccountMessage = "新帳號僅能使用英文、數字與底線";
    return render();
  }
  if (newAccount.length < 4) {
    state.editAccountMessage = "新帳號長度至少 4 個字元";
    return render();
  }
  if (newAccount !== confirmAccount) {
    state.editAccountMessage = "新帳號與確認帳號不一致";
    return render();
  }

  const result = userService.updateAccount(userId, newAccount);
  if (result.error) {
    state.editAccountMessage = result.error;
    return render();
  }

  // keep the live session (and in-memory state.user) in sync if the
  // currently logged-in account is the one that just got renamed
  if (state.user && state.user.id === userId) {
    state.user = { ...state.user, account: result.user.account };
    authService.refreshSessionUser(state.user);
  }

  state.editAccountId = null;
  state.editAccountMessage = null;
  alert("帳號已更新，之後請使用新帳號登入。");
  render();
}

/* ---- therapist01 → therapist02 個案轉移（開發資料維護） ---- */

function previewTherapistTransfer() {
  const from = userService.findByAccount("therapist01");
  const to = userService.findByAccount("therapist02");
  if (!from || !to) return null;

  const activeRelations = relationService.findAcceptedByTherapistId(from.id);
  const today = todayStr();
  let duplicateCount = 0;
  let scheduleUpdateCount = 0;
  let scheduleKeepCount = 0;

  activeRelations.forEach((rel) => {
    if (relationService.findAcceptedRelation(to.id, rel.patientId)) duplicateCount += 1;
    scheduleService.getByPatientId(rel.patientId)
      .filter((s) => s.therapistId === from.id)
      .forEach((s) => {
        if (s.status !== "completed" || s.date >= today) scheduleUpdateCount += 1;
        else scheduleKeepCount += 1;
      });
  });

  return { from, to, patientCount: activeRelations.length, duplicateCount, scheduleUpdateCount, scheduleKeepCount };
}

function executeTherapistTransfer() {
  const from = userService.findByAccount("therapist01");
  const to = userService.findByAccount("therapist02");
  if (!from || !to) return { error: "找不到 therapist01 或 therapist02 帳號" };

  // snapshot the patient list *before* transferActivePatients revokes the
  // source relations, so we know whose schedules to touch.
  const patientIds = relationService.findAcceptedByTherapistId(from.id).map((r) => r.patientId);
  const today = todayStr();
  let scheduleUpdateCount = 0;
  let scheduleKeepCount = 0;

  patientIds.forEach((patientId) => {
    scheduleService.getByPatientId(patientId)
      .filter((s) => s.therapistId === from.id)
      .forEach((s) => {
        if (s.status !== "completed" || s.date >= today) {
          scheduleService.update(s.id, {
            therapistId: to.id,
            transferredFromTherapistId: from.id,
            transferredAt: nowIso(),
            updatedAt: nowIso(),
          });
          scheduleUpdateCount += 1;
        } else {
          scheduleKeepCount += 1;
        }
      });
  });

  const relationResult = relationService.transferActivePatients(
    from.id,
    to.id,
    state.user.id,
    "由 therapist01 轉移至 therapist02"
  );

  return {
    transferredCount: relationResult.transferredCount,
    skippedDuplicateCount: relationResult.skippedDuplicateCount,
    scheduleUpdateCount,
    scheduleKeepCount,
  };
}

function startTherapistTransfer() {
  const preview = previewTherapistTransfer();
  if (!preview) {
    alert("找不到 therapist01 或 therapist02 帳號，無法執行轉移。");
    return;
  }
  state.transferPreview = preview;
  state.transferConfirming = true;
  render();
}

function cancelTherapistTransfer() {
  state.transferConfirming = false;
  state.transferPreview = null;
  render();
}

function confirmTherapistTransfer() {
  const result = executeTherapistTransfer();
  state.transferConfirming = false;
  state.transferPreview = null;
  state.transferResult = result;
  render();
}

function renderCaseHistoryList(therapistId) {
  const history = relationService.findHistoryByTherapistId(therapistId);
  if (!history.length) return `<div class="card muted center">尚無歷史個案紀錄。</div>`;
  return history
    .map((r) => {
      const patient = userService.getById(r.patientId);
      if (!patient) return "";
      const statusLabel = r.status === "completed" ? "療程完成" : "已解除";
      const statusClass = r.status === "completed" ? "done-status" : "pending";
      const startDate = (r.acceptedAt || r.createdAt || "").slice(0, 10);
      const endDate = (r.completedAt || r.revokedAt || "").slice(0, 10);
      return `<div class="train-item">
        <img src="/images/image_1.png" alt="${patient.name}" />
        <div>
          <b>${patient.name}</b>
          <div class="small">帳號：${patient.account}｜${startDate} ～ ${endDate}</div>
          <div class="small">結束原因：${r.endReason || "-"}（唯讀查看歷史）</div>
        </div>
        <span class="pill ${statusClass}">${statusLabel}</span>
      </div>`;
    })
    .join("");
}

function therapistCaseListPage() {
  const isDev = state.user.isDeveloperAccount === true;
  const inviteCode = state.user.inviteCode || "";
  const view = state.caseListView || "active";
  const relations = relationService.findActiveByTherapistId(state.user.id);
  const patients = relations
    .map((r) => ({ relation: r, patient: userService.getById(r.patientId) }))
    .filter((p) => p.patient);

  const emptyMessage = isDev
    ? "開發管理帳號不管理個案，個案已全數移交給其他復健師。"
    : "目前尚無個案。請將邀請碼提供給患者完成加入。";
  const listHtml = patients.length
    ? patients
        .map(({ relation, patient }) => {
          const schedule = scheduleService.getByPatientAndDate(patient.id, todayStr());
          const joinedDate = (relation.acceptedAt || relation.createdAt || "").slice(0, 10);
          return `<div class="train-item clickable" onclick="goCaseDetail('${patient.id}')">
            <img src="/images/image_1.png" alt="${patient.name}" />
            <div>
              <b>${patient.name}</b>
              <div class="small">帳號：${patient.account}｜加入日期：${joinedDate}</div>
              <div class="small">${schedule ? "今日已有課表" : "今日尚無課表"}</div>
            </div>
            <span class="pill ${schedule ? "active-status" : "pending"}">查看個案</span>
          </div>`;
        })
        .join("")
    : `<div class="card muted center">${emptyMessage}</div>`;

  const tabsHtml = `<div class="row" style="margin:10px 0;">
    <button class="btn ${view === "active" ? "btn-primary" : "btn-light"}" style="flex:1" onclick="switchCaseListView('active')">目前個案</button>
    <button class="btn ${view === "history" ? "btn-primary" : "btn-light"}" style="flex:1" onclick="switchCaseListView('history')">歷史個案</button>
  </div>`;

  const bodyHtml = view === "active"
    ? `<h3 class="section-title">我的個案（${patients.length}）</h3>${listHtml}`
    : `<h3 class="section-title">歷史個案</h3>${renderCaseHistoryList(state.user.id)}`;

  // developer accounts don't invite/manage patients — no invite-code card,
  // no "new case" prompt.
  const inviteCardHtml = isDev
    ? `<div class="card muted">此帳號為開發管理帳號，不提供患者邀請功能。</div>`
    : `<h3 class="section-title">邀請新患者</h3>
       <div class="card">
         <div class="small">您的復健師邀請碼</div>
         <h2 style="margin:6px 0;">${inviteCode}</h2>
         <div class="small">請將此邀請碼提供給患者。患者登入後輸入邀請碼，即可加入您的個案名單。</div>
         <button class="btn btn-light full" onclick="copyInviteCode('${inviteCode}')">複製邀請碼</button>
       </div>`;

  return `
    <div class="header">
      <button class="btn btn-light" onclick="switchTab('home')">返回</button>
      <b>個案管理</b>
      <img class="icon" src="/images/files_selected.png" alt="個案" />
    </div>
    ${inviteCardHtml}
    ${tabsHtml}
    ${bodyHtml}
  `;
}

function therapistCaseDetailPage() {
  const patientId = state.selectedPatientId;
  const patient = patientId ? userService.getById(patientId) : null;
  const relation = patient ? relationService.findAcceptedRelation(state.user.id, patientId) : null;
  if (!patient || !relation) {
    return therapistCaseListPage();
  }

  const schedule = scheduleService.getByPatientAndDate(patientId, todayStr());
  const exercises = schedule?.exercises || [];
  const completedCount = exercises.filter((ex) => ex.status === "completed").length;
  const records = analysisService.getByPatientId(patientId);
  const latest = records.length
    ? [...records].sort((a, b) => new Date(b.capturedAt || b.createdAt) - new Date(a.capturedAt || a.createdAt))[0]
    : null;

  return `
    <div class="header">
      <button class="btn btn-light" onclick="goCaseList()">返回</button>
      <b>個案分析</b>
      <button class="btn btn-light" onclick="goAssignPlan()">派課</button>
    </div>
    <div class="user-row case-head">
      <div class="avatar">${patient.name[0]}</div>
      <div><strong>${patient.name}</strong><br><small class="small">帳號：${patient.account}</small></div>
    </div>
    <div class="stats">
      <div class="stat"><span class="small">今日任務</span><b>${exercises.length}</b></div>
      <div class="stat"><span class="small">今日完成</span><b>${completedCount}</b></div>
      <div class="stat"><span class="small">最近分析分數</span><b>${latest ? (latest.score ?? latest.overallScore ?? "-") : "-"}</b></div>
    </div>
    <h3 class="section-title">個案關係</h3>
    <div class="card">
      <div>療程狀態：照護中</div>
      <div class="small">加入日期：${(relation.acceptedAt || relation.createdAt || "").slice(0, 10)}</div>
      <div class="row" style="margin-top:10px;">
        <button class="btn btn-light" style="flex:1" onclick="startRelationAction('complete')">完成療程</button>
        <button class="btn btn-light" style="flex:1" onclick="startRelationAction('revoke')">解除個案關係</button>
      </div>
    </div>
    ${renderRelationActionCard(relation)}
    <h3 class="section-title">今日課表</h3>
    ${renderScheduleTaskCards(schedule)}
    <button class="btn btn-primary full" onclick="goAssignPlan()">派發或更新課表 →</button>
  `;
}

function switchCaseListView(view) {
  state.caseListView = view;
  render();
}

function copyInviteCode(code) {
  if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(
      () => alert("邀請碼已複製"),
      () => alert(`請手動選取複製：${code}`)
    );
  } else {
    alert(`請手動選取複製：${code}`);
  }
}

const COMPLETE_REASONS = ["療程完成", "達成階段性目標", "轉介其他專業人員", "其他"];
const REVOKE_REASONS = ["誤綁定", "患者更換復健師", "中止服務", "其他"];

function renderRelationActionCard(relation) {
  if (!state.relationActionType) return "";
  const isComplete = state.relationActionType === "complete";
  const reasons = isComplete ? COMPLETE_REASONS : REVOKE_REASONS;
  const title = isComplete
    ? "確定將此患者標記為療程完成嗎？"
    : "解除後，您將無法再為此患者派課，但過去紀錄仍會保留。";
  const cardClass = isComplete ? "confirm-card" : "confirm-card danger";
  const reasonOptionsHtml = reasons
    .map((r) => `<button type="button" class="reason-option ${state.relationActionReason === r ? "selected" : ""}" onclick="selectRelationActionReason('${r}')">${r}</button>`)
    .join("");
  const customReasonHtml = state.relationActionReason === "其他"
    ? `<input id="relationActionCustomReason" placeholder="請輸入原因" style="margin-top:8px;" />`
    : "";
  return `<div class="${cardClass}">
    <b>${title}</b>
    <div class="small" style="margin:8px 0 4px;">請選擇原因：</div>
    ${reasonOptionsHtml}
    ${customReasonHtml}
    <div class="row" style="margin-top:10px;">
      <button class="btn btn-light" style="flex:1" onclick="cancelRelationAction()">取消</button>
      <button class="btn btn-primary" style="flex:1" onclick="confirmRelationAction('${relation.id}')">確認${isComplete ? "完成" : "解除"}</button>
    </div>
  </div>`;
}

function startRelationAction(type) {
  state.relationActionType = type;
  state.relationActionReason = null;
  render();
}

function selectRelationActionReason(reason) {
  state.relationActionReason = reason;
  render();
}

function cancelRelationAction() {
  state.relationActionType = null;
  state.relationActionReason = null;
  render();
}

function confirmRelationAction(relationId) {
  let reason = state.relationActionReason;
  if (!reason) return alert("請選擇原因");
  if (reason === "其他") {
    const custom = document.getElementById("relationActionCustomReason");
    reason = custom && custom.value.trim() ? custom.value.trim() : "其他";
  }
  if (state.relationActionType === "complete") {
    relationService.complete(relationId, state.user.id, reason);
    alert("此患者的療程已標記為完成。");
  } else {
    relationService.revoke(relationId, state.user.id, reason);
    alert("個案關係已解除。");
  }
  state.relationActionType = null;
  state.relationActionReason = null;
  goCaseList();
}

// placeholder declaration — the real implementation is assigned further down
// (`assignPlanPage = function() {...}`); this stub only exists so that later
// reassignment has a variable to bind to (see module-scope note near the top
// of this file about the "v3 override" pattern used throughout).
function assignPlanPage() {}

function badge(icon, title, desc) {
  return `<div class="badge-card"><div class="badge-icon">${icon}</div><b>${title}</b><span>${desc}</span></div>`;
}
function caseItem(name, id, progress, status, desc, cls) {
  return `<div class="train-item clickable" onclick="goCaseDetail('${name}')"><img src="/images/image_1.png" alt="${name}"><div><b>${name}</b><div class="small">${id}｜${desc}</div><div class="progress-mini"><i style="width:${progress}"></i></div></div><span class="pill ${cls}">${status}</span></div>`;
}

//個人資料頁面
//個人資料頁面
function profilePage() {
  if (state.user.role === "therapist") {
    const caseCount = relationService.findAcceptedByTherapistId(state.user.id).length;
    return `
      <div class="center">
        <div class="avatar" style="margin: 12px auto 8px;">${state.user.name[0]}</div>
        <h2>${state.user.name} 復健師</h2>
        <p class="muted">專長：術後復健／下肢訓練／遠距追蹤</p>
      </div>
      <div class="stats">
        <div class="stat"><span class="small">追蹤個案</span><b>${caseCount}</b></div>
        <div class="stat"><span class="small">待檢報告</span><b>5</b></div>
        <div class="stat"><span class="small">今日待辦</span><b>3</b></div>
      </div>
      <button class="btn btn-primary full" onclick="goCaseList()">查看個案管理 →</button>
      <div class="therapist-profile-actions">
        ${state.user.isDeveloperAccount === true ? `<button class="btn btn-light dev-account-entry" onclick="goDevAccounts()">開發測試：帳號管理</button>` : ""}
        <button class="logout-secondary" onclick="logout()">登出</button>
      </div>
    `;
  }

  const myRelations = relationService.findActiveByPatientId(state.user.id);
  const myTherapistsHtml = myRelations.length
    ? myRelations
        .map((r) => {
          const therapist = userService.getById(r.therapistId);
          const joinedDate = (r.acceptedAt || r.createdAt || "").slice(0, 10);
          return `<div class="card" style="margin-bottom:8px;">
            <b>${therapist ? therapist.name : "復健師"}</b>
            <div class="small">加入日期：${joinedDate}</div>
            <div class="small">狀態：照護中</div>
            <button class="btn btn-light full" onclick="startPatientLeave()">離開此復健師</button>
          </div>`;
        })
        .join("") + renderPatientLeaveCard(myRelations[0])
    : `<div class="card muted center">尚未加入任何復健師</div>`;

  const careHistoryHtml = renderPatientCareHistory(state.user.id);

  // Real numbers only — no invented patient ID, XP, training count, or
  // accuracy figure. Missing data shows "—", never a fabricated number.
  // Phase 4: level/streak/achievements now come from gamificationEngine
  // (deterministically derived from real analysisRecords), replacing the
  // old gameService seeded profile so this page can never disagree with
  // Patient Home's numbers.
  const gamification = gamificationEngine.getGamificationSummary(state.user.id);
  const patientRecords = analysisService.getByPatientId(state.user.id);
  const trainingCount = patientRecords.length;
  const avgScore = patientRecords.length
    ? Math.round(patientRecords.reduce((sum, r) => sum + (r.overallScore ?? r.score ?? 0), 0) / patientRecords.length)
    : null;
  const unlockedAchievements = gamification.achievements.filter((a) => a.unlocked);

  return `
    <div class="center">
      <div class="avatar" style="margin: 12px auto 8px;">${state.user.name[0]}</div>
      <h2>${state.user.name}</h2>
    </div>
    <div class="score-hero">
      <div class="score-ring"><span>${gamification.level}</span><small>Lv.</small></div>
      <div><h3>${gamification.title}</h3><p class="small">XP ${gamification.currentLevelXp} / ${gamification.nextLevelXp}</p><div class="xp-track wide"><span style="width:${gamification.xpPercent}%"></span></div></div>
    </div>
    <div class="stats">
      <div class="stat"><span class="small">累積訓練</span><b>${trainingCount}</b><span class="small">次</span></div>
      <div class="stat"><span class="small">連續天數</span><b>${gamification.streak > 0 ? gamification.streak : "—"}</b></div>
      <div class="stat"><span class="small">平均品質分數</span><b>${avgScore != null ? avgScore : "—"}</b></div>
    </div>
    <h3 class="section-title">我的復健需求</h3>
    <div class="card clickable row" style="justify-content:space-between; align-items:center;" onclick="goAssessmentSettings()"><b>查看／修改我的復健需求評估</b><span class="more-link">前往 →</span></div>
    <h3 class="section-title">我的復健師</h3>
    ${myTherapistsHtml}
    <h3 class="section-title">照護歷史</h3>
    ${careHistoryHtml}
    <h3 class="section-title">我的成就</h3>
    ${unlockedAchievements.length
      ? `<div class="badge-row">${unlockedAchievements.map((a) => `<span><img class="badge-row-icon" src="${a.icon}" alt="" />${a.title}</span>`).join("")}</div>`
      : `<div class="small">完成第一次練習即可解鎖第一個成就。</div>`}
    <!-- 冒險地圖 moved here in Phase 6.5 (report section 3/21): its only
         entry point used to live inside the now-deprecated trainPage()
         Landing. goMap()/rehabMapPage() themselves are unchanged — this is
         a navigation-only relocation, not a Growth Map redesign. -->
    <div class="row" style="margin-top:10px;"><button class="btn btn-light" style="flex:1" onclick="goAchievements()">成就牆</button><button class="btn btn-light" style="flex:1" onclick="goActionRecords()">動作紀錄</button><button class="btn btn-light" style="flex:1" onclick="goMap()">冒險地圖</button></div>
    <div style="height:10px"></div>
    <button class="btn btn-light" style="width:100%" onclick="logout()">登出</button>
  `;
}
//主畫面（根據不同角色與選單顯示不同內容）
/**
 * Phase 6.5 report section 2/3/21 — the bottom-nav "訓練" tab now renders
 * 我的復健課表 (todaySchedulePage) directly instead of the old trainPage()
 * Landing (which only ever contained a shortcut INTO this same page, plus
 * 自主練習/動作紀錄/冒險地圖 links now moved onto the schedule page itself
 * — see todaySchedulePage()'s own comment). trainPage() itself is kept,
 * unreachable from any primary navigation, per the report's "don't delete,
 * mark deprecated" instruction — nothing else calls it (confirmed via a
 * full-file audit).
 */
function renderDashboard() {
  const body = state.tab === "home"
    ? state.user.role === "patient" ? patientHome() : therapistHome()
    : state.tab === "work"
      ? state.user.role === "patient" ? todaySchedulePage() : therapistFilesPage()
      : state.tab === "data"
        ? dataPage()
        : profilePage();
  return phone(body, true);
}

function renderSquat() {
  return phone(squatDetailPage(), true);
}

function render() {
  if (state.route === "splash") app.innerHTML = renderSplash();
  if (state.route === "auth") app.innerHTML = renderAuth();
  if (state.route === "dashboard") app.innerHTML = renderDashboard();
  if (state.route === "squat") app.innerHTML = renderSquat();
  if (state.route === "analysis") app.innerHTML = phone(analysisPage(), true);
  if (state.route === "history") app.innerHTML = phone(historyPage(), true);
  if (state.route === "heatmap") app.innerHTML = phone(heatmapPage(), true);
  if (state.route === "records") app.innerHTML = phone(actionRecordsPage(), true);
  if (state.route === "achievements") app.innerHTML = phone(patientAchievementsPage(), true);
  if (state.route === "caseList") app.innerHTML = phone(therapistCaseListPage(), true);
  if (state.route === "caseDetail") app.innerHTML = phone(therapistCaseDetailPage(), true);
  if (state.route === "assignPlan") app.innerHTML = phone(assignPlanPage(), true);
}

function goAuth() {
  state.route = "auth";
  state.authStep = "chooseMode";
  state.authMode = null;
  state.authRole = null;
  state.authMessage = null;
  render();
}

function setAuthMode(mode) {
  state.authMode = mode;
  state.authStep = "chooseRole";
  state.authRole = null;
  state.authMessage = null;
  render();
}

function selectAuthRole(role) {
  state.authRole = role;
  state.authMessage = null;
  render();
}

function confirmAuthRole() {
  if (!state.authRole) {
    state.authMessage = "請先選擇使用身分。";
    return render();
  }
  state.authMessage = null;
  state.authStep = "form";
  render();
}

function backToChooseRole() {
  state.authStep = "chooseRole";
  state.authMessage = null;
  render();
}

function switchAuthMode(mode) {
  state.authMode = mode;
  state.authMessage = null;
  render();
}

function goRegisterSuccessToLogin() {
  state.authMode = "login";
  state.authStep = "form";
  state.authMessage = null;
  render();
}

async function login() {
  const account = document.getElementById("loginAccount").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  if (!account || !password) {
    state.authMessage = "請輸入帳號與密碼";
    return render();
  }
  state.authLoading = true;
  const result = await authService.login(account, password, state.authRole);
  state.authLoading = false;
  if (result.error) {
    state.authMessage = result.error;
    return render();
  }
  try {
    await storageService.hydrateCloudForUser(result.user);
  } catch (error) {
    console.error("Unable to load cloud data", error);
    await authService.logout();
    state.authMessage = "無法載入雲端資料，請稍後再試。";
    return render();
  }
  state.authMessage = null;
  setSession(result.user);
}

async function register() {
  const name = document.getElementById("regName").value.trim();
  const account = document.getElementById("regAccount").value.trim();
  const password = document.getElementById("regPassword").value;
  const passwordConfirm = document.getElementById("regPasswordConfirm").value;
  const role = state.authRole || "patient";

  if (!name || !account || !password || !passwordConfirm) {
    state.authMessage = "請填寫所有欄位";
    return render();
  }
  if (password.length < 6) {
    state.authMessage = "密碼至少需要 6 個字元";
    return render();
  }
  if (password !== passwordConfirm) {
    state.authMessage = "密碼與確認密碼不一致";
    return render();
  }
  state.authLoading = true;
  const result = await authService.register({ name, account, password, role });
  state.authLoading = false;
  if (result.error) {
    state.authMessage = result.error;
    return render();
  }
  state.authMessage = null;
  state.authStep = "registerSuccess";
  render();
}

function switchTab(tab) {
  state.route = "dashboard";
  state.tab = tab;
  state.patientLeaveConfirming = false;
  state.patientLeaveReason = null;
  render();
}

function goSquatDetail() {
  state.route = "squat";
  state.tab = "work";
  render();
}

function backToTrain() {
  state.route = "dashboard";
  state.tab = "work";
  render();
}


function goAnalysis() {
  state.route = "analysis";
  state.tab = "work";
  render();
}

function goHistory() {
  state.route = "history";
  state.tab = "data";
  render();
}

function goHeatmap() {
  state.route = "heatmap";
  state.tab = "data";
  render();
}

function goActionRecords() {
  state.route = "records";
  state.tab = "work";
  render();
}

function goAchievements() {
  state.route = "achievements";
  state.tab = "profile";
  render();
}

function goCaseList() {
  state.caseListView = "active";
  state.route = "caseList";
  state.tab = "work";
  render();
}

function goCaseDetail(patientId) {
  const relation = relationService.findAcceptedRelation(state.user.id, patientId);
  if (!relation) {
    alert("您沒有管理此患者的權限。");
    return goCaseList();
  }
  state.selectedPatientId = patientId;
  state.relationActionType = null;
  state.relationActionReason = null;
  state.route = "caseDetail";
  state.tab = "work";
  render();
}

/**
 * Loads the one schedule for this patient+date (if any) into the in-memory
 * draft, or starts a blank draft — this is the single place that decides
 * "edit existing" vs "start new", so assignPlanPage/submitAssignPlan never
 * have to re-derive that decision themselves.
 */
function loadAssignDraftForDate(patientId, patientName, date) {
  const existing = scheduleService.getByPatientAndDate(patientId, date);
  if (existing) {
    state.assignDraft = {
      patientId,
      patientName,
      date,
      scheduleId: existing.id,
      title: existing.title || buildDefaultScheduleTitle(date),
      goal: existing.goal || generateScheduleGoal(existing.exercises || []),
      targetDurationMinutes: existing.targetDurationMinutes ?? 20,
      exercises: (existing.exercises || []).map((ex) => ({ ...ex })),
    };
    // an existing schedule's goal (whether auto-generated or hand-written
    // last time) is treated as final — adding more exercises won't silently
    // overwrite it.
    state.assignGoalManuallyEdited = true;
  } else {
    state.assignDraft = {
      patientId,
      patientName,
      date,
      scheduleId: null,
      title: buildDefaultScheduleTitle(date),
      goal: generateScheduleGoal([]),
      targetDurationMinutes: 20,
      exercises: [],
    };
    state.assignGoalManuallyEdited = false;
  }
  state.assignDraftDirty = false;
  state.assignCategory = "";
  state.assignPickedId = "";
}

function syncAssignGoalIfNeeded() {
  if (state.assignGoalManuallyEdited) return;
  state.assignDraft.goal = generateScheduleGoal(state.assignDraft.exercises);
}

function confirmLeaveAssignDraft() {
  if (!state.assignDraftDirty) return true;
  return confirm("目前課表尚未儲存，確定要離開嗎？");
}

function validateAssignDraft(draft) {
  if (!draft.patientId) return "請先選擇患者";
  if (!draft.date) return "請先選擇日期";
  if (!draft.exercises.length) return "請至少加入一個動作";
  if (!draft.title || !draft.title.trim()) return "課表名稱不得為空";
  for (const ex of draft.exercises) {
    if (!ex.sets || ex.sets <= 0) return `「${ex.exerciseName}」的組數必須大於 0`;
    if (ex.repetitions != null && ex.repetitions <= 0) return `「${ex.exerciseName}」的次數必須大於 0`;
    if (ex.durationSeconds != null && ex.durationSeconds <= 0) return `「${ex.exerciseName}」的秒數必須大於 0`;
  }
  return null;
}

function goAssignPlan() {
  const patientId = state.selectedPatientId;
  const relation = patientId ? relationService.findAcceptedRelation(state.user.id, patientId) : null;
  if (!relation) {
    alert("您沒有管理此患者的權限。");
    return goCaseList();
  }
  const patient = userService.getById(patientId);
  const patientName = patient ? patient.name : "個案";
  loadAssignDraftForDate(patientId, patientName, todayStr());
  state.route = "assignPlan";
  state.tab = "work";
  render();
}

window.goAuth = goAuth;
window.setAuthMode = setAuthMode;
window.selectAuthRole = selectAuthRole;
window.confirmAuthRole = confirmAuthRole;
window.backToChooseRole = backToChooseRole;
window.switchAuthMode = switchAuthMode;
window.goRegisterSuccessToLogin = goRegisterSuccessToLogin;
window.onInviteCodeQuery = onInviteCodeQuery;
window.onInviteCodeCancel = onInviteCodeCancel;
window.onInviteCodeConfirm = onInviteCodeConfirm;
window.startRelationAction = startRelationAction;
window.selectRelationActionReason = selectRelationActionReason;
window.cancelRelationAction = cancelRelationAction;
window.confirmRelationAction = confirmRelationAction;
window.copyInviteCode = copyInviteCode;
window.switchCaseListView = switchCaseListView;
window.startPatientLeave = startPatientLeave;
window.selectPatientLeaveReason = selectPatientLeaveReason;
window.cancelPatientLeave = cancelPatientLeave;
window.confirmPatientLeave = confirmPatientLeave;
window.goDevAccounts = goDevAccounts;
window.onDevAccountsFilterChange = onDevAccountsFilterChange;
window.onDevAccountsSearchChange = onDevAccountsSearchChange;
window.togglePasswordVisibility = togglePasswordVisibility;
window.copyDevAccountText = copyDevAccountText;
window.copyDevAccountPassword = copyDevAccountPassword;
window.startResetPassword = startResetPassword;
window.cancelResetPassword = cancelResetPassword;
window.confirmResetPassword = confirmResetPassword;
window.startEditAccount = startEditAccount;
window.cancelEditAccount = cancelEditAccount;
window.confirmEditAccount = confirmEditAccount;
window.startTherapistTransfer = startTherapistTransfer;
window.cancelTherapistTransfer = cancelTherapistTransfer;
window.confirmTherapistTransfer = confirmTherapistTransfer;
window.login = login;
window.register = register;
window.switchTab = switchTab;
window.goSquatDetail = goSquatDetail;
window.backToTrain = backToTrain;
window.goAnalysis = goAnalysis;
window.goHistory = goHistory;
window.goHeatmap = goHeatmap;
window.goActionRecords = goActionRecords;
window.goAchievements = goAchievements;
window.setTrainingHistorySourceFilter = setTrainingHistorySourceFilter;
window.goTrainingRecordDetail = goTrainingRecordDetail;
// Phase 6.3 pure view-model helpers — exposed on window so test harnesses
// (which load this file the same way the browser does, no real ES export
// exists anywhere in app.js) can call them directly with fixture records.
window.resolveRecordTimestamp = resolveRecordTimestamp;
window.normalizeTrainingSource = normalizeTrainingSource;
window.resolveRecordExerciseName = resolveRecordExerciseName;
window.buildTrainingHistoryEntry = buildTrainingHistoryEntry;
window.buildWeeklyTrainingProgress = buildWeeklyTrainingProgress;
window.buildWeekdayStrip = buildWeekdayStrip;
window.formatHistoryGroupLabel = formatHistoryGroupLabel;
window.formatRecordDateTime = formatRecordDateTime;
window.formatClockTime = formatClockTime;
window.getTrainingHistorySourceChips = getTrainingHistorySourceChips;
window.goCaseList = goCaseList;
window.goCaseDetail = goCaseDetail;
window.goAssignPlan = goAssignPlan;
window.logout = logout;
window.onAssignCategoryChange = onAssignCategoryChange;
window.onAssignExerciseChange = onAssignExerciseChange;
window.onAssignDateChange = onAssignDateChange;
window.onAssignTitleChange = onAssignTitleChange;
window.onAssignGoalChange = onAssignGoalChange;
window.onAssignTargetDurationChange = onAssignTargetDurationChange;
window.updateDraftExerciseField = updateDraftExerciseField;
window.confirmLeaveAssignDraft = confirmLeaveAssignDraft;
window.addExerciseToAssignDraft = addExerciseToAssignDraft;
window.removeExerciseFromAssignDraft = removeExerciseFromAssignDraft;
window.submitAssignPlan = submitAssignPlan;


/* ===== ReMotion Demo v3：課表接收 × 遊戲化展示補強 ===== */
/**
 * Phase 6.5 report section 2/3 — promoted to the canonical Training Home:
 * the bottom-nav 訓練 tab now renders this page directly instead of the
 * old trainPage() Landing (which only ever shortcut into this exact page).
 * Header changed from a "返回" back-button to a plain tab-root title (no
 * page above this one to return to, same convention as dataPage()/
 * profilePage()). 自主練習/動作紀錄 — previously only reachable from the
 * old Landing — moved onto this page as a compact secondary-actions row so
 * nothing that Landing offered was lost. 冒險地圖 is NOT added here per
 * the report's explicit instruction not to force it into the schedule
 * home; its one remaining real entry point moved to profilePage() instead
 * (see that page's own comment).
 */
function todaySchedulePage() {
  const patientId = getCurrentPatientId();
  const viewDate = state.scheduleViewDate || todayStr();
  const schedule = getPatientScheduleForDate(patientId, viewDate);
  const exercises = schedule?.exercises || [];
  const completedCount = exercises.filter((ex) => ex.status === "completed").length;
  const pendingXp = exercises
    .filter((ex) => ex.status !== "completed")
    .reduce((sum, ex) => sum + (ex.rewardXp || 0), 0);

  const [, mStr, dStr] = viewDate.split("-");
  const dayNum = dStr;
  const monthAbbr = MONTH_ABBR[Number(mStr) - 1];

  const heroLabel = schedule ? `${getTherapistDisplayName(schedule.therapistId)}已派發` : "尚無復健師派發課表";
  const heroTitle = schedule ? schedule.title : `${mStr}/${dStr} 課表`;
  const heroSummary = schedule
    ? `完成 ${completedCount} / ${exercises.length} 項｜預計 +${pendingXp} XP`
    : "這一天尚未安排復健課表。";

  const weekStripHtml = buildWeekStripDates(todayStr())
    .map((date) => {
      const dt = new Date(`${date}T00:00:00`);
      const label = WEEKDAY_LABELS[dt.getDay()];
      const num = String(dt.getDate()).padStart(2, "0");
      const activeClass = date === viewDate ? "active" : "";
      return `<span class="${activeClass}" onclick="selectScheduleDate('${date}')">${label}<br><b>${num}</b></span>`;
    })
    .join("");

  return `
    <div class="header">
      <h1 class="page-title">我的復健課表</h1>
      <img class="icon" src="/images/calendar.png" alt="課表" />
    </div>
    <div class="schedule-hero">
      <div>
        <div class="small">${heroLabel}</div>
        <h2>${heroTitle}</h2>
        <p>${heroSummary}</p>
      </div>
      <div class="calendar-badge"><b>${dayNum}</b><span>${monthAbbr}</span></div>
    </div>
    <div class="week-strip">
      ${weekStripHtml}
    </div>
    <h3 class="section-title">復健師派發任務</h3>
    ${renderScheduleTaskCards(schedule)}
    <h3 class="section-title">AI 課表提醒</h3>
    <div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">${generateScheduleReminder(schedule)}</p></div></div>
    <div class="schedule-secondary-actions">
      <button class="btn btn-light" onclick="goSelfPracticeLibrary()">自主練習</button>
      <button class="btn btn-light" onclick="goActionRecords()">動作紀錄</button>
    </div>
  `;
}

/**
 * Looks up the schedule + the specific exercise instance the patient is
 * currently viewing/acting on, from the shared selection state
 * (selectedScheduleId/selectedExerciseIndex). Returns nulls if the
 * selection is missing or stale so callers can fall back gracefully
 * instead of crashing into a white screen.
 */
function getSelectedScheduleExercise() {
  const schedule = state.selectedScheduleId ? scheduleService.getById(state.selectedScheduleId) : null;
  const ex = schedule && schedule.exercises[state.selectedExerciseIndex] ? schedule.exercises[state.selectedExerciseIndex] : null;
  return { schedule, ex };
}

/**
 * Unifies the two ways a patient can land on exercise detail / AI
 * detection: a therapist-assigned schedule task ("assigned", the
 * original/only behavior before Phase 2) or the patient browsing the
 * catalog on their own ("self_practice", new in Phase 2). Self-practice
 * has no schedule at all, so a synthetic `ex`-like object is built
 * directly from the catalog entry — same shape (exerciseId/exerciseName/
 * sets/repetitions/durationSeconds/rewardXp) so every downstream reader
 * (exerciseDetailPage, detectionPrepPage, the squat flow) can stay
 * mode-agnostic wherever possible. `status` is always "pending" for
 * self-practice since there's no single "the" completion to lock — a
 * patient can repeat it anytime.
 */
function getExercisePageContext() {
  if (state.exerciseContext === "self_practice") {
    const catalog = exerciseService.getById(state.selectedExerciseId);
    if (!catalog) return null;
    return {
      mode: "self_practice",
      schedule: null,
      ex: {
        exerciseId: catalog.exercise_id,
        exerciseName: catalog.exercise_name,
        sets: catalog.defaultSets,
        repetitions: catalog.measurementType === "repetition" ? catalog.defaultRepetitions : null,
        durationSeconds: catalog.measurementType === "duration" ? catalog.defaultDurationSeconds : null,
        status: "pending",
        rewardXp: catalog.rewardXp,
        analysisRecordId: null,
      },
      catalog,
    };
  }
  const { schedule, ex } = getSelectedScheduleExercise();
  if (!schedule || !ex) return null;
  const catalog = exerciseService.getById(ex.exerciseId) || {};
  return { mode: "assigned", schedule, ex, catalog };
}

/**
 * ReMotion 2.0 Phase 3.1 — single centralized place that decides where the
 * 返回 button on exercise-related pages leads, based on state.navigationOrigin
 * (assigned / self_practice / recommendation). Used by both
 * exerciseDetailPage() (`level: "listing"` — exits exercise detail
 * entirely) and detectionPrepPage() (`level: "detail"` — one step back up
 * to exercise detail, same exercise) so this logic lives in exactly one
 * place instead of being hardcoded per page.
 */
function getExerciseReturnRoute(level) {
  const context = getExercisePageContext();
  const exerciseId = context ? context.ex.exerciseId : state.selectedExerciseId;

  if (state.exerciseContext === "assigned") {
    if (level === "listing") return { fn: "goSchedule()", label: "返回今日課表" };
    const scheduleId = context && context.schedule ? context.schedule.id : state.selectedScheduleId;
    return { fn: `goExerciseDetail('${scheduleId}', ${state.selectedExerciseIndex})`, label: "返回" };
  }

  if (state.navigationOrigin === "recommendation") {
    if (level === "listing") return { fn: "goTodaysRecommendation()", label: "返回今日建議" };
    return { fn: `goRecommendationExerciseDetail('${exerciseId}')`, label: "返回" };
  }

  if (level === "listing") return { fn: "goSelfPracticeLibrary()", label: "返回自主練習" };
  return { fn: `goSelfPracticeExerciseDetail('${exerciseId}')`, label: "返回" };
}

// ─────────────────────────────────────────────────────────────────────────
// ReMotion 2.0 Phase 2 — Self Practice Library. Reads exerciseService.
// listNormalized() only — no separate mock exercise database. A patient
// with no therapist can reach every exercise here without ever needing a
// schedule.
// ─────────────────────────────────────────────────────────────────────────

function goSelfPracticeLibrary() {
  state.route = "selfPracticeLibrary";
  state.tab = "work";
  render();
}

function toggleSelfPracticeBodyPart(value) {
  state.selfPracticeBodyPart = state.selfPracticeBodyPart === value ? "" : value;
  render();
}

function toggleSelfPracticeGoal(value) {
  state.selfPracticeGoal = state.selfPracticeGoal === value ? "" : value;
  render();
}

function selectSelfPracticeDifficultyTier(tier) {
  state.selfPracticeDifficultyTier = state.selfPracticeDifficultyTier === tier ? "" : tier;
  render();
}

/** Also reused as the "查看全部" action from the Discovery Mode AI section (report section 8) — same state, same filter, just a second entry point into it. */
function toggleSelfPracticeTrainingMode(mode) {
  state.selfPracticeTrainingMode = state.selfPracticeTrainingMode === mode ? "" : mode;
  render();
}

function setSelfPracticeSearch(value) {
  state.selfPracticeSearchQuery = value;
  render();
}

/** Shared by clearSelfPracticeFilters() and backToSelfPracticeDiscovery() below — the five actual filter/search dimensions, nothing view-mode-related. */
function resetSelfPracticeFilterFields() {
  state.selfPracticeBodyPart = "";
  state.selfPracticeGoal = "";
  state.selfPracticeDifficultyTier = "";
  state.selfPracticeTrainingMode = "";
  state.selfPracticeSearchQuery = "";
}

/** "清除全部" inside the Results Mode active-filter summary (report section 12) — clears filters only; if the patient reached Results Mode via 瀏覽全部 rather than a filter, that explicit browse-all choice is left alone (see backToSelfPracticeDiscovery() for the stronger "leave Results Mode entirely" action). */
function clearSelfPracticeFilters() {
  resetSelfPracticeFilterFields();
  render();
}

/** Panel-scoped reset (report section 7 footer "[重設]") — only the three dimensions actually inside the More Filters panel; search and category live outside it and are left alone. */
function resetSelfPracticeMoreFilters() {
  state.selfPracticeGoal = "";
  state.selfPracticeDifficultyTier = "";
  state.selfPracticeTrainingMode = "";
  render();
}

function toggleSelfPracticeFiltersPanel() {
  state.selfPracticeFiltersPanelOpen = !state.selfPracticeFiltersPanelOpen;
  render();
}

/** Discovery Mode's "瀏覽全部動作" entry point (report section 10) — the ONLY way to see the full unfiltered result set besides searching/filtering. */
function browseAllSelfPracticeExercises() {
  state.selfPracticeBrowseAll = true;
  render();
}

/** Results Mode header's "返回探索" (report section 11) — unlike clearSelfPracticeFilters(), this always leaves Results Mode entirely, including an explicit browse-all choice. */
function backToSelfPracticeDiscovery() {
  resetSelfPracticeFilterFields();
  state.selfPracticeBrowseAll = false;
  state.selfPracticeFiltersPanelOpen = false;
  render();
}

/**
 * ReMotion Phase 6.2 — single source of truth for which mode the Library is
 * in (report section 20). Deliberately NOT a stored field: it's fully
 * derived from the existing filter state + the one new selfPracticeBrowseAll
 * flag, so it can never drift out of sync with the actual filter state the
 * way a second, independently-maintained boolean could.
 */
function getSelfPracticeViewMode() {
  const hasActiveFilter = !!(
    state.selfPracticeBodyPart ||
    state.selfPracticeGoal ||
    state.selfPracticeDifficultyTier ||
    state.selfPracticeTrainingMode ||
    state.selfPracticeSearchQuery
  );
  return hasActiveFilter || state.selfPracticeBrowseAll ? "results" : "discovery";
}

/**
 * ReMotion Phase 6.1 — search matches exercise_name/category/target_muscle/
 * description (report section 4). Pure UI/filter-layer helper: never
 * mutates the exercise object, never touches rehabExercises.js. Plain
 * case-insensitive substring match (Chinese text compares fine with
 * .includes() — no fuzzy-search dependency needed for ~100 items).
 * UNCHANGED in Phase 6.2 — reused as-is (report section 3).
 */
function selfPracticeSearchMatches(e, rawQuery) {
  const query = (rawQuery || "").trim().toLowerCase();
  if (!query) return true;
  const haystack = [e.name, e.bodyPart, e.raw && e.raw.target_muscle, e.raw && e.raw.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

/** UNCHANGED in Phase 6.2 (report section 3) — the one and only filter engine; Discovery Mode's sections read the raw catalog directly (see getSelfPracticeDiscoverySections()) rather than through this, but Results Mode always goes through this same function. */
function getFilteredSelfPracticeExercises() {
  const all = exerciseService.listNormalized();
  return all.filter((e) => {
    if (state.selfPracticeBodyPart && e.bodyPart !== state.selfPracticeBodyPart) return false;
    if (state.selfPracticeGoal && PHASE1_TEST_EXERCISE_GOALS[e.id] !== state.selfPracticeGoal) return false;
    if (state.selfPracticeDifficultyTier && getDifficultyDisplay(e.difficulty).tier !== state.selfPracticeDifficultyTier) return false;
    if (state.selfPracticeTrainingMode && (e.raw && e.raw.trainingMode) !== state.selfPracticeTrainingMode) return false;
    if (!selfPracticeSearchMatches(e, state.selfPracticeSearchQuery)) return false;
    return true;
  });
}

/**
 * ReMotion Phase 6.2 — Exercise Library card. options.showCategory (report
 * section 13's card-density rule): when the result set is already scoped to
 * one category (a single bodyPart filter active, no search/browse-all
 * context), the category text is redundant with the page's own heading and
 * is omitted; Browse All / search / multi-dimension results still show it.
 * Full steps/common_errors/precautions/correct_angle/cnn_label are
 * deliberately NOT here — those stay on Exercise Detail (unchanged from
 * Phase 6.1).
 */
function renderSelfPracticeExerciseCard(e, options = {}) {
  const showCategory = options.showCategory !== false;
  const metricParts = [];
  const estMinutes = parseMinutesRange(e.raw && e.raw.estimated_minutes);
  if (estMinutes) metricParts.push(`約 ${Math.round(estMinutes)} 分鐘`);
  else if (e.duration != null) metricParts.push(`${e.duration} 秒`);
  else if (e.reps != null) metricParts.push(`${e.reps} 次`);

  const trainingMode = e.raw && e.raw.trainingMode;
  const metaLine = showCategory ? `${e.bodyPart || "-"} · ${getDifficultyDisplay(e.difficulty).label}` : getDifficultyDisplay(e.difficulty).label;
  return `<div class="exercise-grid-card" onclick="goSelfPracticeExerciseDetail('${e.id}')">
    ${renderExerciseCardImage(e)}
    <div class="exercise-grid-card-body">
      <b class="exercise-grid-card-name">${e.name}</b>
      <div class="exercise-grid-card-meta">${metaLine}</div>
      ${metricParts.length ? `<div class="exercise-grid-card-meta">${metricParts.join("・")}</div>` : ""}
      ${renderTrainingModeBadge(trainingMode)}
    </div>
  </div>`;
}

/**
 * ReMotion Phase 6.2 — compact horizontal-scroll category pills (report
 * section 6), replacing Phase 6.1's 3+2 grid of 80px-tall cards. "全部" is
 * handled by reusing toggleSelfPracticeBodyPart('') unconditionally, which
 * already clears the field correctly whether or not a category was
 * selected (no new toggle/set variant needed — report section 3).
 */
function renderQuickCategoryPills(bodyPartOptions) {
  const allPill = `<button type="button" class="category-pill ${!state.selfPracticeBodyPart ? "selected" : ""}" onclick="toggleSelfPracticeBodyPart('')">全部</button>`;
  const pillsHtml = bodyPartOptions
    .map((c) => `<button type="button" class="category-pill ${state.selfPracticeBodyPart === c ? "selected" : ""}" onclick="toggleSelfPracticeBodyPart('${c}')">${c}</button>`)
    .join("");
  return `<div class="category-pill-row">${allPill}${pillsHtml}</div>`;
}

// Discovery Mode section caps (report section 9) — Category B engineering/
// UX pacing, not derived from any product rule: keeps the discovery page
// short regardless of catalog size (5 categories today, ~100 exercises
// eventually). AI section (if any pose_analysis exists) plus up to this
// many category sections stays within the spec's "3-5 sections" guidance.
const DISCOVERY_CATEGORY_SECTION_LIMIT = 3;
const DISCOVERY_SECTION_PREVIEW_COUNT = 3;

/**
 * ReMotion Phase 6.2 — Discovery Mode section data (report section 9).
 * Reads the catalog directly (not through getFilteredSelfPracticeExercises,
 * which is Results Mode's job) since these previews are never affected by
 * the patient's current search/filter state — they're the entry points
 * INTO that state, not a view of it.
 */
function getSelfPracticeDiscoverySections() {
  const all = exerciseService.listNormalized();
  const sections = [];
  const poseAnalysis = all.filter((e) => (e.raw && e.raw.trainingMode) === "pose_analysis");
  if (poseAnalysis.length) {
    sections.push({
      title: "AI 姿勢分析",
      subtitle: "透過鏡頭即時追蹤動作",
      items: poseAnalysis.slice(0, DISCOVERY_SECTION_PREVIEW_COUNT),
      showCategory: true,
      onViewAll: "toggleSelfPracticeTrainingMode('pose_analysis')",
    });
  }
  getAssessmentBodyPartOptions()
    .slice(0, DISCOVERY_CATEGORY_SECTION_LIMIT)
    .forEach((category) => {
      const items = all.filter((e) => e.bodyPart === category);
      if (!items.length) return;
      sections.push({
        title: category,
        subtitle: null,
        items: items.slice(0, DISCOVERY_SECTION_PREVIEW_COUNT),
        showCategory: false,
        onViewAll: `toggleSelfPracticeBodyPart('${category}')`,
      });
    });
  return sections;
}

function renderDiscoverySection(section) {
  const cardsHtml = section.items.map((e) => renderSelfPracticeExerciseCard(e, { showCategory: section.showCategory })).join("");
  return `<div class="discovery-section">
    <div class="discovery-section-header">
      <div>
        <b>${section.title}</b>
        ${section.subtitle ? `<div class="small discovery-section-subtitle">${section.subtitle}</div>` : ""}
      </div>
      <button type="button" class="ghost-btn" onclick="${section.onViewAll}">查看全部 ›</button>
    </div>
    <div class="discovery-scroll-row">${cardsHtml}</div>
  </div>`;
}

/** Report section 7 — collapsible inline panel (lowest-risk option for this single-page vanilla-JS app; no bottom-sheet/framework). */
function renderMoreFiltersPanel(goalOptions, trainingModeOptions, resultCount) {
  if (!state.selfPracticeFiltersPanelOpen) return "";
  const goalChipsHtml = goalOptions.length
    ? `<h4 class="filter-panel-label">目標</h4><div class="chip-grid">${goalOptions.map((g) => `<button type="button" class="chip-select ${state.selfPracticeGoal === g ? "selected" : ""}" onclick="toggleSelfPracticeGoal('${g}')">${g}</button>`).join("")}</div>`
    : "";
  const difficultyChipsHtml = `<h4 class="filter-panel-label">難度</h4><div class="chip-grid">${DIFFICULTY_TIER_OPTIONS.map((d) => `<button type="button" class="chip-select ${state.selfPracticeDifficultyTier === d.tier ? "selected" : ""}" onclick="selectSelfPracticeDifficultyTier('${d.tier}')">${d.label}</button>`).join("")}</div>`;
  const trainingModeChipsHtml = trainingModeOptions.length
    ? `<h4 class="filter-panel-label">訓練方式</h4><div class="chip-grid">${trainingModeOptions.map((mode) => `<button type="button" class="chip-select ${state.selfPracticeTrainingMode === mode ? "selected" : ""}" onclick="toggleSelfPracticeTrainingMode('${mode}')">${TRAINING_MODE_BADGE[mode].label}</button>`).join("")}</div>`
    : "";
  return `<div class="filters-panel">
    ${goalChipsHtml}
    ${difficultyChipsHtml}
    ${trainingModeChipsHtml}
    <div class="filters-panel-footer">
      <button type="button" class="ghost-btn" onclick="resetSelfPracticeMoreFilters()">重設</button>
      <button type="button" class="btn btn-primary" onclick="toggleSelfPracticeFiltersPanel()">顯示 ${resultCount} 個動作</button>
    </div>
  </div>`;
}

function selfPracticeLibraryPage() {
  // Categories/goals/trainingModes are derived from the real data every
  // render — if the 44-item catalog is later replaced/extended to ~100
  // items with different categories, these adapt automatically.
  const bodyPartOptions = getAssessmentBodyPartOptions();
  const goalOptions = getAssessmentGoalOptions(); // only the Phase-1-tagged goals — never guesses the other 35
  const realTrainingModes = [...new Set(exerciseService.list().map((ex) => ex.trainingMode).filter(Boolean))];
  const hasPoseAnalysis = realTrainingModes.includes("pose_analysis");

  const viewMode = getSelfPracticeViewMode();
  const filtered = getFilteredSelfPracticeExercises();

  const searchHtml = `<input type="search" class="self-practice-search-input" placeholder="搜尋動作名稱、部位或肌群" aria-label="搜尋動作" value="${state.selfPracticeSearchQuery ? String(state.selfPracticeSearchQuery).replace(/"/g, "&quot;") : ""}" oninput="setSelfPracticeSearch(this.value)" />`;
  const moreFiltersButtonHtml = `<button type="button" class="more-filters-btn ${state.selfPracticeFiltersPanelOpen ? "open" : ""}" aria-expanded="${state.selfPracticeFiltersPanelOpen ? "true" : "false"}" onclick="toggleSelfPracticeFiltersPanel()">更多篩選${(state.selfPracticeGoal || state.selfPracticeDifficultyTier || state.selfPracticeTrainingMode) ? " •" : ""}</button>`;
  const moreFiltersPanelHtml = renderMoreFiltersPanel(goalOptions, realTrainingModes, filtered.length);

  let bodyHtml;
  if (viewMode === "discovery") {
    const sections = getSelfPracticeDiscoverySections();
    bodyHtml = `
      ${sections.map(renderDiscoverySection).join("")}
      <button type="button" class="btn btn-light full" onclick="browseAllSelfPracticeExercises()">瀏覽全部動作</button>
    `;
  } else {
    // Active filter chips (report section 12) — category/goal/difficulty/
    // trainingMode/search, each individually removable, plus one "清除全部".
    const chipDefs = [
      state.selfPracticeSearchQuery ? { label: `“${state.selfPracticeSearchQuery}”`, onClick: "setSelfPracticeSearch('')" } : null,
      state.selfPracticeBodyPart ? { label: state.selfPracticeBodyPart, onClick: `toggleSelfPracticeBodyPart('${state.selfPracticeBodyPart}')` } : null,
      state.selfPracticeGoal ? { label: state.selfPracticeGoal, onClick: `toggleSelfPracticeGoal('${state.selfPracticeGoal}')` } : null,
      state.selfPracticeDifficultyTier
        ? { label: (DIFFICULTY_TIER_OPTIONS.find((d) => d.tier === state.selfPracticeDifficultyTier) || {}).label || state.selfPracticeDifficultyTier, onClick: `selectSelfPracticeDifficultyTier('${state.selfPracticeDifficultyTier}')` }
        : null,
      state.selfPracticeTrainingMode ? { label: TRAINING_MODE_BADGE[state.selfPracticeTrainingMode].label, onClick: `toggleSelfPracticeTrainingMode('${state.selfPracticeTrainingMode}')` } : null,
    ].filter(Boolean);
    const activeFilterSummaryHtml = chipDefs.length
      ? `<div class="active-filter-summary">${chipDefs.map((c) => `<button type="button" class="active-filter-chip" onclick="${c.onClick}">${c.label} ×</button>`).join("")}<button type="button" class="ghost-btn" onclick="clearSelfPracticeFilters()">清除全部</button></div>`
      : "";

    const resultsHtml = filtered.length
      ? `<div class="exercise-grid">${filtered.map((e) => renderSelfPracticeExerciseCard(e, { showCategory: !state.selfPracticeBodyPart })).join("")}</div>`
      : `<div class="self-practice-empty-state">${renderRobot("search", "md")}<div class="small">找不到符合條件的動作</div><button type="button" class="ghost-btn" onclick="clearSelfPracticeFilters()">清除篩選</button></div>`;

    bodyHtml = `
      ${activeFilterSummaryHtml}
      <div class="results-header-row">
        <h3 class="section-title" style="margin:0;">練習動作（${filtered.length}）</h3>
      </div>
      ${resultsHtml}
    `;
  }

  return `
    <div class="header">
      ${viewMode === "results" ? `<button class="btn btn-light detail-back-btn" onclick="backToSelfPracticeDiscovery()">返回探索</button>` : `<button class="btn btn-light detail-back-btn" onclick="switchTab('work')">返回</button>`}
      <b>自主練習</b>
    </div>
    ${viewMode === "discovery" ? `<p class="small">依自己的需求找適合的動作。</p><div class="self-practice-safety-note">若有疼痛、術後或特殊狀況，請依專業醫療人員建議進行。</div>` : ""}

    <div class="self-practice-search-row">
      ${searchHtml}
      ${moreFiltersButtonHtml}
    </div>
    ${moreFiltersPanelHtml}
    ${renderQuickCategoryPills(bodyPartOptions)}

    ${bodyHtml}
  `;
}

/**
 * ReMotion 2.0 Phase 3 — the real Recommendation Detail Page. Everything
 * here is either read straight from the patient's own active assessment
 * or from a real recommendationService.getTodaysRecommendation() result —
 * never a fabricated exercise list. This is a personalized PRACTICE
 * SUGGESTION, not a diagnosis/prescription — see the disclaimer at the
 * bottom of the page, which is mandatory copy, not optional.
 */
// Phase 6.5 report section 20/22 — sets tab="work" so bottom-nav 訓練
// stays active through the whole Recommendation -> Exercise -> Training
// chain, instead of silently inheriting whatever tab was active before
// (previously "home" whenever reached from Home, which incorrectly kept
// 首頁 highlighted while the patient was really inside a training flow).
function goTodaysRecommendation() {
  state.route = "todaysRecommendation";
  state.tab = "work";
  render();
}

/**
 * ReMotion 2.0 Phase 7.1 — AI Dynamic Functional Assessment entry points.
 * A deliberately separate route/naming family from the existing
 * patientAssessmentIntro/Form/Summary + assessmentSettings routes (which
 * belong to js/data/assessmentService.js's patient preference
 * questionnaire — bodyParts/goals/ability). The two "assessment" concepts
 * are unrelated; keeping "functionalAssessment*" vs "patientAssessment*"
 * consistently distinct in every route/function name avoids the ambiguity
 * flagged in the Phase 7.0 audit. tab stays "home" — this entry lives on
 * Home, not under the Training tab.
 */
function goFunctionalAssessmentBodyRegion() {
  state.route = "functionalAssessmentBodyRegion";
  render();
}

/**
 * Only "shoulder" is a real, available region in Phase 7.1 —
 * functionalAssessmentBodyRegionPage() never wires an onclick to this for
 * any other region, and functionalAssessmentService.create() itself still
 * rejects an unknown bodyRegion defensively rather than trusting the
 * caller (see that service's own comment).
 */
function selectFunctionalAssessmentBodyRegion(region) {
  const patientId = getCurrentPatientId();
  if (!patientId) return;
  const result = functionalAssessmentService.create({ patientId, bodyRegion: region });
  if (result.error) return;
  state.selectedFunctionalAssessmentSessionId = result.session.id;
  state.route = "functionalAssessmentShoulderPrep";
  render();
}

/**
 * Phase 7.1 — the region list itself communicates future multi-region
 * scalability (Phase 7.0 audit section 3: "architecture must not be
 * hardcoded shoulder-only"), even though only shoulder is interactive
 * right now. Icons reuse the real public/images/Medical/body_health/ set
 * confirmed to exist during the Phase 7.1 pre-check; "knee" genuinely has
 * no matching asset in that set, so it renders with a plain disabled
 * fallback instead of a mismatched or invented image.
 */
const FUNCTIONAL_ASSESSMENT_REGIONS = [
  { key: "shoulder", label: "肩部", icon: "/images/Medical/body_health/medical_shoulder.png", available: true },
  { key: "neck", label: "頸部", icon: "/images/Medical/body_health/medical_neck.png", available: false },
  { key: "trunk", label: "腰背／軀幹", icon: "/images/Medical/body_health/medical_spine.png", available: false },
  { key: "hip", label: "髖部", icon: "/images/Medical/body_health/medical_hip.png", available: false },
  { key: "knee", label: "膝部", icon: null, available: false },
  { key: "ankle", label: "踝部", icon: "/images/Medical/body_health/medical_ankle.png", available: false },
];

function renderFunctionalAssessmentRegionButton(region) {
  const iconHtml = region.icon
    ? `<img class="body-region-icon" src="${region.icon}" alt="" />`
    : `<span class="body-region-icon body-region-icon-fallback"></span>`;
  if (region.available) {
    return `<div class="body-region-btn available clickable" onclick="selectFunctionalAssessmentBodyRegion('${region.key}')">
      ${iconHtml}
      <span>${region.label}</span>
    </div>`;
  }
  // Genuinely non-interactive — no onclick at all, aria-disabled for
  // screen readers, never just a visual dimming (report section 17).
  return `<div class="body-region-btn disabled" aria-disabled="true">
    ${iconHtml}
    <span>${region.label}</span>
    <span class="body-region-soon">即將推出</span>
  </div>`;
}

/**
 * Phase 7.1 report section 6/7/10 — 人體主視覺 + compact region buttons,
 * not a long vertical stack of large cards. Only Shoulder is tappable;
 * every other region is visibly present (multi-region scalability) but
 * disabled and creates no session.
 */
function functionalAssessmentBodyRegionPage() {
  const regionsHtml = FUNCTIONAL_ASSESSMENT_REGIONS.map(renderFunctionalAssessmentRegionButton).join("");
  return `
    <div class="header">
      <button class="btn btn-light" onclick="switchTab('home')">返回</button>
      <b>AI 動態功能評估</b>
      <span></span>
    </div>
    <div class="body-region-intro">
      <b>選擇想評估的部位</b>
      <div class="small">透過簡單的動作，了解目前的活動表現</div>
    </div>
    <img class="body-region-main-visual" src="/images/Medical/body_health/medical_body_front.png" alt="" />
    <div class="body-region-grid">${regionsHtml}</div>
    <div class="small body-region-footer">目前僅開放肩部評估，其餘部位將陸續推出。</div>
  `;
}

/**
 * Phase 7.1 report section 12/14 — a coherent "next step" screen, not the
 * real assessment. No camera, no CV terminology shown to the patient.
 * Phase 7.2 — the CTA is now real: it moves to the Intro page using the
 * SAME session already created by selectFunctionalAssessmentBodyRegion()
 * (no second session is ever created here).
 */
function functionalAssessmentShoulderPrepPage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="goFunctionalAssessmentBodyRegion()">返回</button>
      <b>肩部功能評估</b>
      <span></span>
    </div>
    <p class="small" style="margin:12px 2px;">透過簡單的肩部動作，了解目前的活動狀況。</p>
    <div class="card functional-assessment-prep-card">
      <b class="detail-section-label">評估前準備</b>
      <div class="functional-assessment-prep-row"><img class="functional-assessment-prep-check" src="/images/gamification/checkmark_01.png" alt="" /><span class="small">確保上半身能完整入鏡</span></div>
      <div class="functional-assessment-prep-row"><img class="functional-assessment-prep-check" src="/images/gamification/checkmark_01.png" alt="" /><span class="small">保留足夠活動空間</span></div>
      <div class="functional-assessment-prep-row"><img class="functional-assessment-prep-check" src="/images/gamification/checkmark_01.png" alt="" /><span class="small">穿著方便活動的衣物</span></div>
    </div>
    <button class="btn btn-primary full" style="margin-top:12px;" onclick="goFunctionalAssessmentShoulderIntro()">開始評估</button>
  `;
}

/**
 * Phase 7.2 — Shoulder Functional Assessment: Intro + Session + Complete.
 * Still a UI/interaction demonstration only (Phase 7.2 report section 0):
 * no camera, no CV, no angle measurement, no persisted movement data. The
 * session created by selectFunctionalAssessmentBodyRegion() is reused
 * as-is throughout this whole journey — nothing here ever creates a
 * second session or writes to functionalAssessmentService, whose schema
 * stays exactly {id, patientId, bodyRegion, status, startedAt}.
 *
 * Movement images use the real, verified assets under
 * public/images/Medical/body_health/assessment/shoulder/Function/ only.
 * angle/, Before_After/, and the *_limited/*_asymmetry/uneven_height
 * Function assets are explicitly reserved for a future phase (see Phase
 * 7.2 asset re-check report) — none of them are referenced below.
 */
const FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS = [
  {
    key: "shoulder_flexion",
    label: "肩關節前屈",
    viewLabel: "側面示範",
    instruction: "從手臂自然垂下開始，慢慢將手臂向前抬起，再依自己舒服的範圍繼續向上。",
    images: [
      { src: "/images/Medical/body_health/assessment/shoulder/Function/shoulder_side_neutral.png", caption: "開始" },
      { src: "/images/Medical/body_health/assessment/shoulder/Function/shoulder_side_flexion_90.png", caption: "抬起" },
      { src: "/images/Medical/body_health/assessment/shoulder/Function/shoulder_side_overhead.png", caption: "向上" },
    ],
  },
  {
    key: "shoulder_abduction",
    label: "肩關節外展",
    viewLabel: "正面示範",
    instruction: "從手臂自然垂下開始，慢慢將雙手向身體兩側抬起，再依自己舒服的範圍繼續向上。",
    images: [
      { src: "/images/Medical/body_health/assessment/shoulder/Function/shoulder_front_neutral.png", caption: "開始" },
      { src: "/images/Medical/body_health/assessment/shoulder/Function/shoulder_front_abduction_90.png", caption: "抬起" },
      { src: "/images/Medical/body_health/assessment/shoulder/Function/shoulder_front_overhead.png", caption: "向上" },
    ],
  },
];

function goFunctionalAssessmentShoulderPrep() {
  state.route = "functionalAssessmentShoulderPrep";
  render();
}

function goFunctionalAssessmentShoulderIntro() {
  state.route = "functionalAssessmentShoulderIntro";
  render();
}

/**
 * Entry into the movement sequence — always resets the index to 0 so a
 * re-entry (e.g. after backing out and starting again) never resumes
 * mid-sequence from stale state.
 */
function startFunctionalAssessmentShoulderSession() {
  // Phase 7.3A — a fresh entry into the Session always starts at the
  // instruction phase (camera never auto-starts) and guarantees no camera
  // session survives from a previous visit.
  stopShoulderCameraSession();
  shoulderCameraPhase = "instruction";
  state.functionalAssessmentShoulderMovementIndex = 0;
  state.route = "functionalAssessmentShoulderSession";
  render();
}

/**
 * Back from a movement goes to the previous movement, or to Intro from
 * the first movement — never re-creates a session, never touches
 * selectedFunctionalAssessmentSessionId. Phase 7.3A hard requirement: back
 * navigation out of a live camera state must stop the camera first, and
 * the previous movement/Intro always starts fresh at "instruction".
 */
function goFunctionalAssessmentShoulderSessionBack() {
  stopShoulderCameraSession();
  shoulderCameraPhase = "instruction";
  if (state.functionalAssessmentShoulderMovementIndex > 0) {
    state.functionalAssessmentShoulderMovementIndex -= 1;
    render();
  } else {
    goFunctionalAssessmentShoulderIntro();
  }
}

/**
 * Advances to the next movement, or — from the last movement — finishes
 * into the Complete page. Writes nothing to functionalAssessmentService;
 * movement progress lives only in ephemeral state. Phase 7.3A hard
 * requirement: moving to the next movement (or finishing) must stop any
 * live camera session first, and the next movement always starts fresh at
 * "instruction" — it never inherits the previous movement's camera
 * controller.
 *
 * Phase 7.3A.1: this function itself is UNCHANGED, but its role changed —
 * it is no longer reachable from the camera-ready state (the Remote
 * Assessment flow is hands-free up to "measurement-ready" and stops
 * there; see report section 6G/7). It remains reachable only via a small,
 * clearly-secondary manual affordance shown once "measurement-ready" is
 * reached, purely so movement 2 stays testable before Phase 7.3B defines
 * what real progression out of measurement-ready looks like — never
 * auto-triggered, never voice-triggered, never part of the hands-free
 * promise.
 */
function advanceFunctionalAssessmentShoulderMovement() {
  stopShoulderCameraSession();
  shoulderCameraPhase = "instruction";
  if (state.functionalAssessmentShoulderMovementIndex < FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS.length - 1) {
    state.functionalAssessmentShoulderMovementIndex += 1;
    render();
  } else {
    state.route = "functionalAssessmentShoulderComplete";
    render();
  }
}

// ─────────────────────────────────────────────────────────────────────
// ReMotion 2.0 Phase 7.3A / 7.3A.1 — Shoulder Functional Assessment
// Camera Foundation + Remote Assessment UX. Ephemeral, module-level state
// only (never in `state.*`), matching the exact convention already
// established by squatCameraController/hp02CameraController below —
// camera lifecycle is UI/session plumbing, not persisted assessment data.
//
// shoulderCameraPhase is one of: "instruction" | "camera-requesting" |
// "camera-loading" | "positioning" | "ready-confirmation" | "countdown" |
// "measurement-ready" | "camera-error".
//
// CAMERA READY (internal: the moment raw per-frame readiness has held
// continuously) means ONLY: the camera can reliably see the required
// upper-body landmarks. MEASUREMENT READY (the "measurement-ready" phase)
// means ONLY: the remote positioning + ready-hold + countdown workflow has
// finished and a future Phase 7.3B MAY begin measurement. Neither means
// movement-correct, ROM-normal, assessment-complete, or scored — no angle/
// ROM/score/result logic exists anywhere in this block; that is explicitly
// Phase 7.3B+ scope. measurement-ready performs no measurement and is a
// dead end for THIS phase (see advanceFunctionalAssessmentShoulderMovement()
// below for the one, clearly-secondary, manually-triggered way to continue
// testing movement 2 before 7.3B exists).
//
// Reuses the existing shared camera/voice foundation directly (per the
// Phase 7.3A/7.3A.1 pre-checks' locked architecture decisions) —
// createSquatCameraController(), createDetectionStabilityTracker(),
// createVoicePolicyTracker(), and pickSquatVoice()/SQUAT_VOICE_SETTINGS are
// called with shoulder-specific parameters/state only; none of them, nor
// beginSquatCameraSession()/handleSquatFrame()/beginHp02CameraSession()/
// handleHp02Frame(), are modified.
// ─────────────────────────────────────────────────────────────────────
let shoulderCameraPhase = "instruction";
let shoulderCameraController = null;
let shoulderDetectionStabilityTracker = null;
let shoulderReadySince = null;
let shoulderFramingHint = null;
let shoulderCameraErrorMessage = null;
let shoulderPositioningMessageId = null;
let shoulderReadyHoldTimeoutId = null;
let shoulderCountdownIntervalId = null;
let shoulderCountdownFinishTimeoutId = null;
let shoulderCountdownRemaining = 0;
let shoulderVoicePolicy = null;
let shoulderSelectedVoice = null;
// Phase 7.3B.1 — ONE measurement-session instance per camera session (report
// section 5/14: app.js owns exactly one reference, never a second parallel
// shoulder-specific state machine). Created in beginShoulderCameraSession(),
// started only once shoulderCameraPhase first reaches "measurement-ready"
// (see beginShoulderCountdown()), discarded in stopShoulderCameraSession().
let shoulderMeasurementSession = null;
// Phase 7.3B.2C — developer-only real-device calibration state. Entirely
// separate from shoulderMeasurementSession above: this NEVER produces a
// SHOULDER_MEASUREMENT_SIGNAL and is never read by the production FSM
// (see report section 6/"Architecture Principle"). shoulderCalibrationModeOn
// is a persistent developer preference (survives Back/retry, mirroring
// squatDebugModeOn's own convention); shoulderCalibrationSession is
// per-camera-run data, discarded in stopShoulderCameraSession()/
// handleShoulderFatalError() and recreated in beginShoulderCameraSession()
// if the toggle is still on.
let shoulderCalibrationModeOn = false;
let shoulderCalibrationSession = null;
// Phase 7.3B.2C.1 — voice/status DEDUP bookkeeping only (mirrors
// shoulderPositioningMessageId's own established pattern in production
// code above): "what did we last say/show" so guidance only re-fires on a
// genuine transition, never every frame. Not clinical, not persisted, not
// part of calibrationSession's own pure state (this is purely a UI/voice
// concern tied to app.js's orchestration layer). Reset whenever a fresh
// calibration session is created or the selection/recording is reset, so
// switching configuration always re-announces the current state.
let shoulderCalibrationLastGuidanceKey = null;
let shoulderCalibrationLastStatusKey = null;

// Phase 5.4.2's exact feature-detection shape, reused verbatim for the
// shoulder flow (see squatSpeechSupported above).
const shoulderSpeechSupported = typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";

const SHOULDER_CAMERA_FRAMING_LABELS = {
  TOO_CLOSE: "請再退後一些",
  TOO_FAR: "請再靠近一些",
};

/**
 * Phase 7.3B.1 — one-shot voice text per measurement-session phase (report
 * section 6/10). MOVEMENT_IN_PROGRESS is deliberately absent (visual-only,
 * per the approved acknowledgement mapping — speaking it would interrupt a
 * patient mid-arm-raise for no benefit, since they're watching/feeling
 * their own arm, not reading the screen, at that exact moment).
 */
const SHOULDER_MEASUREMENT_VOICE_TEXT = {
  [SHOULDER_MEASUREMENT_PHASE.WAITING_FOR_MOVEMENT]: { id: "measurement_waiting", text: "請開始動作" },
  [SHOULDER_MEASUREMENT_PHASE.ENDPOINT_HOLD]: { id: "measurement_endpoint", text: "已記錄" },
  [SHOULDER_MEASUREMENT_PHASE.RETURNING]: { id: "measurement_returning", text: "請慢慢放下" },
  [SHOULDER_MEASUREMENT_PHASE.ATTEMPT_COMPLETE]: { id: "measurement_complete", text: "本次完成" },
};

function speakShoulderMeasurementTransition(phase, timestamp) {
  const entry = SHOULDER_MEASUREMENT_VOICE_TEXT[phase];
  if (!entry) return; // movement-in-progress (or an unmapped phase) is visual-only by design
  speakShoulderText(entry.id, entry.text, timestamp);
}

/**
 * Must tolerate: controller already null, camera never fully initialized,
 * stop during async model loading, and repeated calls — same contract as
 * stopSquatCamera()/stopHp02Camera(). Called from every shoulder-camera
 * exit path (back, movement transition, finishing the assessment, retry)
 * per the Phase 7.3A/7.3A.1 hard cleanup requirement — including the new
 * ready-hold/countdown timers and any in-flight speech. Never touches
 * squatCameraController/hp02CameraController.
 */
function stopShoulderCameraSession() {
  cancelShoulderReadyHold();
  cancelShoulderCountdown();
  if (shoulderSpeechSupported) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      // ignore
    }
  }
  if (shoulderCameraController) {
    shoulderCameraController.stop();
    shoulderCameraController = null;
  }
  shoulderDetectionStabilityTracker = null;
  shoulderReadySince = null;
  shoulderFramingHint = null;
  shoulderCameraErrorMessage = null;
  shoulderPositioningMessageId = null;
  shoulderVoicePolicy = null;
  // Phase 7.3B.1 — discarding the reference (not just calling reset()) is
  // deliberate: the NEXT beginShoulderCameraSession() always creates a
  // brand-new instance, so no attempt state can ever survive into a new
  // camera session, a retry, or the next movement (report section 12).
  shoulderMeasurementSession = null;
  // Phase 7.3B.2C — calibration DATA is per-camera-run and discarded here
  // exactly like every other tracker above; the shoulderCalibrationModeOn
  // TOGGLE itself is a developer preference and is deliberately NOT reset
  // here, so it survives Back/retry (report section 12).
  shoulderCalibrationSession = null;
  shoulderCalibrationLastGuidanceKey = null;
  shoulderCalibrationLastStatusKey = null;
}

/**
 * Explicit user action only — camera/MediaPipe never start when the
 * Session page first renders. Defensively stops any previous shoulder
 * session first (same guard shape as beginSquatCameraSession()'s own "a
 * fresh start can never overlap a still-live controller" comment), so a
 * repeated tap, a retry after a fatal error, or re-entry after a previous
 * attempt can never create two shoulder camera sessions at once.
 */
function beginShoulderCameraSession() {
  stopShoulderCameraSession();
  shoulderCameraPhase = "camera-requesting";
  render();
  updateShoulderCameraStatusUI();
  const videoEl = document.getElementById("shoulderCameraVideo");
  if (!videoEl) return;
  shoulderDetectionStabilityTracker = createDetectionStabilityTracker(SHOULDER_CAMERA_THRESHOLDS, CAMERA_READY_LANDMARKS);
  shoulderVoicePolicy = createVoicePolicyTracker(SHOULDER_CAMERA_THRESHOLDS);
  // Phase 7.3B.1 — created here (available for the whole camera session)
  // but only start()ed once shoulderCameraPhase first reaches
  // "measurement-ready" (see beginShoulderCountdown()) — a fresh instance
  // every camera start, never reused across sessions.
  shoulderMeasurementSession = createShoulderMeasurementSession();
  // Phase 7.3B.2C — only created if the developer preference toggle is
  // already on (e.g. surviving a retry/Back); never created just because
  // a camera started, so ordinary patient sessions never pay for it. The
  // panel markup (with its empty readout div) is already in the DOM from
  // the render() call above, so it's safe to immediately patch a clean
  // "unselected" placeholder rather than leaving stale content from a
  // previous camera run sitting there until the next frame/interaction.
  if (shoulderCalibrationModeOn) {
    shoulderCalibrationSession = createShoulderCalibrationSession();
    shoulderCalibrationLastGuidanceKey = null;
    shoulderCalibrationLastStatusKey = null;
    refreshShoulderCalibrationReadout("unselected", "");
  }
  initShoulderVoiceSelection();
  shoulderCameraController = createSquatCameraController({
    videoEl,
    thresholds: SHOULDER_CAMERA_THRESHOLDS,
    onStatus: handleShoulderCameraStatus,
    onFrame: handleShoulderFrame,
    onFatalError: handleShoulderFatalError,
  });
  shoulderCameraController.start();
}

/**
 * Phase 7.3A.1 — selects the best available zh-TW voice, same pattern as
 * initSquatVoiceSelection(). Never throws if speechSynthesis is
 * unavailable; voice selection is a nice-to-have, never blocks camera
 * start.
 */
function initShoulderVoiceSelection() {
  if (!shoulderSpeechSupported) return;
  try {
    const trySelect = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length) shoulderSelectedVoice = pickSquatVoice(voices);
    };
    trySelect();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", trySelect);
    }
  } catch (e) {
    // voice selection is a nice-to-have — never let it block camera start.
  }
}

/**
 * Phase 7.3A.1 — low-level, one-off shoulder speech helper. Whether to
 * speak at all is entirely delegated to the pure shared shoulderVoicePolicy
 * tracker (js/ai/shared/voicePolicy.js, unmodified) — this function only
 * touches window.speechSynthesis, wrapped so a missing/throwing
 * speechSynthesis can never break the always-present visual status.
 * Speech is an enhancement only; the visual status text is always the
 * source of truth (Phase 7.3A.1 report section 16/accessibility rule).
 */
function speakShoulderText(messageId, text, timestamp) {
  if (!shoulderSpeechSupported || !text || !shoulderVoicePolicy) return;
  try {
    const nativelySpeaking = window.speechSynthesis.speaking;
    if (!shoulderVoicePolicy.shouldSpeak({ id: messageId }, timestamp, nativelySpeaking)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW";
    utterance.rate = SQUAT_VOICE_SETTINGS.rate;
    utterance.pitch = SQUAT_VOICE_SETTINGS.pitch;
    utterance.volume = SQUAT_VOICE_SETTINGS.volume;
    if (shoulderSelectedVoice) utterance.voice = shoulderSelectedVoice;
    window.speechSynthesis.speak(utterance);
    shoulderVoicePolicy.markSpoken({ id: messageId }, timestamp);
  } catch (e) {
    // voice is an enhancement only — never let it break the visual UI.
  }
}

/**
 * One-time lifecycle milestones only (model loading / stream+model ready)
 * — never called per-frame. Mirrors handleSquatCameraStatus()'s exact
 * shape: only targeted DOM patches via updateShoulderCameraStatusUI(),
 * never a full render() here, since the live <video> element (with its
 * MediaStream already attached) must survive this callback.
 */
function handleShoulderCameraStatus(status) {
  if (shoulderCameraPhase === "camera-error") return; // a fatal error already ended this attempt
  if (status === "loading-model") {
    shoulderCameraPhase = "camera-loading";
  } else if (status === "ready") {
    // Stream + model are ready; actual body-readiness classification now
    // comes from handleShoulderFrame() per-frame.
    shoulderCameraPhase = "positioning";
    shoulderPositioningMessageId = "person_not_found";
  }
  updateShoulderCameraStatusUI();
}

/**
 * Per-frame (~15fps) callback — READINESS ONLY, no angle math. Never calls
 * render(); only patches the existing status DOM via
 * updateShoulderCameraStatusUI(), exactly like handleSquatFrame()'s own
 * targeted DOM calls.
 *
 * Phase 7.3A.1 hands-free flow: once "ready-confirmation" or "countdown"
 * is reached, forward progress is owned entirely by
 * beginShoulderReadyHold()/beginShoulderCountdown()'s own timers — this
 * function's only job from that point on is watching for a genuine
 * readiness LOSS (report section 10's hard requirement) and cancelling
 * back to "positioning" if it happens, so a stale/lost reading can never
 * reach measurement-ready.
 */
function handleShoulderFrame(landmarks, timestamp) {
  if (!shoulderDetectionStabilityTracker) return;
  const { displayState, framing, rawReadiness } = shoulderDetectionStabilityTracker.update(landmarks, timestamp);
  shoulderFramingHint = framing;

  // Phase 7.3B.2C — CALIBRATION-ONLY branch. Runs alongside, never instead
  // of, the production phase logic below, on the SAME real landmarks —
  // but it only ever reads them into computeShoulderMeasurementObservation()
  // (pure geometry, Phase 7.3B.2B) for developer display. It NEVER touches
  // shoulderMeasurementSession and NEVER produces a
  // SHOULDER_MEASUREMENT_SIGNAL (see report section 6/15 — the hard
  // production-signal lock). A no-op unless a developer has explicitly
  // turned calibration mode on.
  updateShoulderCalibrationFromFrame(landmarks, timestamp);

  if (shoulderCameraPhase === "measurement-ready") {
    // Phase 7.3B.1 — CRITICAL BOUNDARY: `signal` is always null here.
    // Production landmark frames never derive a semantic measurement
    // signal (movement-detected/endpoint/return/complete) from anatomical
    // geometry — that adapter is explicitly Phase 7.3B.2 scope and does
    // not exist. This only (a) forwards the existing, already-debounced
    // camera readiness so a genuine tracking loss can invalidate an
    // in-progress (synthetic-only, in this phase) attempt, and (b) reacts
    // to whatever the session reports via the same UI/voice patching used
    // everywhere else in this file. See report section 7.
    if (rawReadiness !== BODY_READINESS.READY) {
      // Sustained camera-level readiness loss: discard the measurement
      // session and fall back to positioning, the same policy already
      // applied to ready-confirmation/countdown below (Phase 7.3B
      // pre-check section 17).
      if (shoulderMeasurementSession) shoulderMeasurementSession.reset();
      shoulderCameraPhase = "positioning";
      shoulderReadySince = null;
      setShoulderPositioningMessage(displayState, framing, timestamp);
      return;
    }
    if (shoulderMeasurementSession) {
      const result = shoulderMeasurementSession.processFrame({ timestamp, bodyReady: true, signal: null });
      if (result.changed) {
        updateShoulderCameraStatusUI();
        speakShoulderMeasurementTransition(result.phase, timestamp);
      }
    }
    return;
  }

  if (shoulderCameraPhase === "ready-confirmation" || shoulderCameraPhase === "countdown") {
    if (rawReadiness !== BODY_READINESS.READY) {
      cancelShoulderReadyHold();
      cancelShoulderCountdown();
      shoulderReadySince = null;
      shoulderCameraPhase = "positioning";
      setShoulderPositioningMessage(displayState, framing, timestamp);
    }
    return; // still genuinely ready — the hold/countdown timers own the rest
  }

  if (rawReadiness === BODY_READINESS.READY) {
    if (shoulderReadySince == null) shoulderReadySince = timestamp;
    if (timestamp - shoulderReadySince >= SHOULDER_CAMERA_THRESHOLDS.READY_HOLD_MS) {
      shoulderCameraPhase = "ready-confirmation";
      updateShoulderCameraStatusUI();
      beginShoulderReadyHold(timestamp);
      return;
    }
    // Stable-but-not-yet-held-long-enough: keep showing positioning
    // guidance rather than flashing "ready" on a single good frame
    // (Phase 7.3A report section 5F).
    shoulderCameraPhase = "positioning";
    setShoulderPositioningMessage(displayState, framing, timestamp);
  } else {
    shoulderReadySince = null;
    shoulderCameraPhase = "positioning";
    setShoulderPositioningMessage(displayState, framing, timestamp);
  }
}

/**
 * Phase 7.3A.1 — classifies which positioning message applies and speaks
 * it ONLY on a real message-id change (never every frame), per report
 * section 10/12's "state-change-only speech" requirement. The visual
 * status text is always updated regardless of whether speech fires.
 */
function setShoulderPositioningMessage(displayState, framing, timestamp) {
  let messageId;
  if (displayState === DETECTION_DISPLAY_STATE.NOT_FOUND || displayState === DETECTION_DISPLAY_STATE.LOST_LONG) {
    messageId = "person_not_found";
  } else if (framing === "TOO_CLOSE") {
    messageId = "too_close";
  } else if (framing === "TOO_FAR") {
    messageId = "too_far";
  } else {
    messageId = "position_adjustment";
  }
  const changed = messageId !== shoulderPositioningMessageId;
  shoulderPositioningMessageId = messageId;
  updateShoulderCameraStatusUI();
  if (changed) {
    const text =
      messageId === "person_not_found"
        ? "請將上半身完整入鏡"
        : messageId === "too_close"
        ? SHOULDER_CAMERA_FRAMING_LABELS.TOO_CLOSE
        : messageId === "too_far"
        ? SHOULDER_CAMERA_FRAMING_LABELS.TOO_FAR
        : "請調整位置";
    speakShoulderText(messageId, text, timestamp);
  }
}

/**
 * Phase 7.3A.1 — Stage 2 UX pacing hold (report section 6E/8): shows/
 * speaks "準備完成/定位完成" once, then auto-advances into the countdown
 * after READY_CONFIRMATION_HOLD_MS, UNLESS readiness was lost in the
 * meantime (re-checked defensively, same pattern as
 * beginSquatReadyHold()'s own "body may have been lost in the meantime"
 * guard). Never calls render(); only targeted DOM patches.
 */
function beginShoulderReadyHold(timestamp) {
  updateShoulderCameraStatusUI();
  speakShoulderText("ready", "定位完成", timestamp);
  if (shoulderReadyHoldTimeoutId) clearTimeout(shoulderReadyHoldTimeoutId);
  shoulderReadyHoldTimeoutId = setTimeout(() => {
    shoulderReadyHoldTimeoutId = null;
    if (shoulderCameraPhase !== "ready-confirmation") return; // readiness may have been lost meanwhile
    beginShoulderCountdown();
  }, SHOULDER_CAMERA_THRESHOLDS.READY_CONFIRMATION_HOLD_MS);
}

function cancelShoulderReadyHold() {
  if (shoulderReadyHoldTimeoutId) {
    clearTimeout(shoulderReadyHoldTimeoutId);
    shoulderReadyHoldTimeoutId = null;
  }
}

/**
 * Phase 7.3A.1 — shoulder-local countdown, adapting (not sharing) squat's
 * proven beginSquatCountdown() pattern: numeric countdown via setInterval,
 * voice speaks only once at GO (never narrates 3-2-1, matching squat's own
 * "avoid 吵雜" rule), then a short trailing pause before landing on
 * measurement-ready. Never calls render(); targeted DOM patches only.
 */
function beginShoulderCountdown() {
  shoulderCameraPhase = "countdown";
  shoulderCountdownRemaining = SHOULDER_CAMERA_THRESHOLDS.COUNTDOWN_SECONDS;
  updateShoulderCameraStatusUI();
  if (shoulderCountdownIntervalId) clearInterval(shoulderCountdownIntervalId);
  shoulderCountdownIntervalId = setInterval(() => {
    shoulderCountdownRemaining -= 1;
    if (shoulderCountdownRemaining > 0) {
      updateShoulderCameraStatusUI();
      return;
    }
    updateShoulderCameraStatusUI();
    speakShoulderText("go", "開始", performance.now());
    clearInterval(shoulderCountdownIntervalId);
    shoulderCountdownIntervalId = null;
    shoulderCountdownFinishTimeoutId = setTimeout(() => {
      shoulderCountdownFinishTimeoutId = null;
      if (shoulderCameraPhase !== "countdown") return; // readiness may have been lost during this final beat
      shoulderCameraPhase = "measurement-ready";
      // Phase 7.3B.1 — arm the measurement-session infrastructure the
      // instant measurement-ready is first reached. This is the ONLY
      // production entry point into the session's FSM (see report section
      // 7/8) — it always lands in WAITING_FOR_MOVEMENT, never further.
      const now = performance.now();
      if (shoulderMeasurementSession) shoulderMeasurementSession.start(now);
      updateShoulderCameraStatusUI();
      speakShoulderMeasurementTransition(SHOULDER_MEASUREMENT_PHASE.WAITING_FOR_MOVEMENT, now);
    }, 500);
  }, 1000);
}

function cancelShoulderCountdown() {
  if (shoulderCountdownIntervalId) {
    clearInterval(shoulderCountdownIntervalId);
    shoulderCountdownIntervalId = null;
  }
  if (shoulderCountdownFinishTimeoutId) {
    clearTimeout(shoulderCountdownFinishTimeoutId);
    shoulderCountdownFinishTimeoutId = null;
  }
}

/**
 * Reuses the shared controller's own honest, non-technical error messages
 * (permission/no-device/busy/model-load) verbatim — no second error
 * taxonomy, no stack traces/exception names/WASM/MediaPipe terminology
 * ever shown to the patient. Also cancels any in-flight ready-hold/
 * countdown/speech, since a fatal error can interrupt any phase.
 */
function handleShoulderFatalError(message) {
  cancelShoulderReadyHold();
  cancelShoulderCountdown();
  shoulderCameraErrorMessage = message;
  shoulderCameraPhase = "camera-error";
  // cameraController.js's start() already releases its own resources
  // internally before calling onFatalError; this just clears our
  // references defensively so a later beginShoulderCameraSession() can
  // never mistake a dead controller for a live one.
  shoulderCameraController = null;
  shoulderDetectionStabilityTracker = null;
  // Phase 7.3B.2C — calibration data belongs to the now-dead camera run,
  // same reasoning as stopShoulderCameraSession()'s own cleanup.
  shoulderCalibrationSession = null;
  shoulderCalibrationLastGuidanceKey = null;
  shoulderCalibrationLastStatusKey = null;
  updateShoulderCameraStatusUI();
}

/**
 * Targeted DOM patch only (never innerHTML/render) — safe to call from the
 * ~15fps per-frame handler. No-ops harmlessly if the camera markup isn't
 * currently mounted (e.g. still on the "instruction" phase). Drives the
 * Phase 7.3A.1 remote-readable large primary status + compact dot +
 * optional secondary line, the countdown number, and the measurement-ready
 * handoff copy — never any ROM/angle/score/result text.
 */
function updateShoulderCameraStatusUI() {
  const dot = document.getElementById("shoulderCameraStatusDot");
  const primary = document.getElementById("shoulderCameraStatusPrimary");
  const secondary = document.getElementById("shoulderCameraStatusSecondary");
  const errorActions = document.getElementById("shoulderCameraErrorActions");
  const backBtn = document.getElementById("functionalAssessmentShoulderBackBtn");
  if (!dot || !primary) return;

  let dotClass = "not-found";
  let primaryLabel = "";
  let secondaryLabel = "";
  if (shoulderCameraPhase === "camera-requesting") {
    primaryLabel = "正在開啟攝影機…";
  } else if (shoulderCameraPhase === "camera-loading") {
    primaryLabel = "AI 模型載入中…";
  } else if (shoulderCameraPhase === "positioning") {
    dotClass = shoulderPositioningMessageId === "person_not_found" ? "not-found" : "partial";
    primaryLabel =
      shoulderPositioningMessageId === "person_not_found"
        ? "請將上半身完整入鏡"
        : shoulderPositioningMessageId === "too_close"
        ? SHOULDER_CAMERA_FRAMING_LABELS.TOO_CLOSE
        : shoulderPositioningMessageId === "too_far"
        ? SHOULDER_CAMERA_FRAMING_LABELS.TOO_FAR
        : "請調整位置";
  } else if (shoulderCameraPhase === "ready-confirmation") {
    dotClass = "ready";
    primaryLabel = "準備完成";
    secondaryLabel = "已穩定偵測到上半身";
  } else if (shoulderCameraPhase === "countdown") {
    dotClass = "ready";
    primaryLabel = shoulderCountdownRemaining > 0 ? String(shoulderCountdownRemaining) : "開始！";
  } else if (shoulderCameraPhase === "measurement-ready") {
    dotClass = "ready";
    // Phase 7.3B.1 — sub-phase text driven by the measurement-session
    // snapshot. In production, only WAITING_FOR_MOVEMENT is ever reachable
    // (see handleShoulderFrame()'s measurement-ready branch); the other
    // branches exist so Level 1's synthetic signal injection can prove the
    // full acknowledgement UI without inventing real shoulder geometry
    // (report section 7).
    const sessionPhase = shoulderMeasurementSession ? shoulderMeasurementSession.getSnapshot().phase : null;
    if (sessionPhase === SHOULDER_MEASUREMENT_PHASE.MOVEMENT_IN_PROGRESS) {
      primaryLabel = "已偵測到動作";
      secondaryLabel = "動作觀察中";
    } else if (sessionPhase === SHOULDER_MEASUREMENT_PHASE.ENDPOINT_HOLD) {
      primaryLabel = "已記錄";
      secondaryLabel = "動作觀察中";
    } else if (sessionPhase === SHOULDER_MEASUREMENT_PHASE.RETURNING) {
      primaryLabel = "請慢慢放下";
      secondaryLabel = "動作觀察中";
    } else if (sessionPhase === SHOULDER_MEASUREMENT_PHASE.ATTEMPT_COMPLETE) {
      primaryLabel = "本次完成";
      secondaryLabel = "動作觀察中";
    } else {
      primaryLabel = "請開始動作";
      secondaryLabel = "攝影機持續偵測中";
    }
  } else if (shoulderCameraPhase === "camera-error") {
    dotClass = "error";
    primaryLabel = shoulderCameraErrorMessage || "開啟相機時發生問題，請再試一次。";
  }

  dot.className = `functional-assessment-camera-dot ${dotClass}`;
  primary.textContent = primaryLabel;
  if (secondary) secondary.textContent = secondaryLabel;
  if (errorActions) errorActions.style.display = shoulderCameraPhase === "camera-error" ? "grid" : "none";
  if (backBtn) backBtn.textContent = shoulderCameraPhase === "instruction" ? "返回" : "← 結束評估";
}

// ─────────────────────────────────────────────────────────────────────
// Phase 7.3B.2C — Shoulder Real-device Calibration Foundation.
// Developer/test-only. Reuses the SAME already-running camera session
// (no second controller, no second MediaStream) — see
// beginShoulderCameraSession()/stopShoulderCameraSession() above, which
// own shoulderCalibrationSession's create/discard lifecycle already.
//
// HARD BOUNDARY: everything below reads real landmarks into
// computeShoulderMeasurementObservation() (pure geometry) for developer
// display only. Nothing here ever calls shoulderMeasurementSession
// .processFrame() with anything other than what handleShoulderFrame()
// already does (signal: null, unchanged), and nothing here ever imports
// or references SHOULDER_MEASUREMENT_SIGNAL. Calibration markers/selection
// changes are human annotations only — they cannot reach the production
// FSM (report section 13/15).
// ─────────────────────────────────────────────────────────────────────

/**
 * Simple per-landmark engineering facts (available/missing + raw
 * visibility number) for the selected side's four measurement landmarks —
 * NOT the same as computeShoulderMeasurementObservation()'s already-gated
 * coreAngleAvailable/elbowValidityObservable booleans. This shows the RAW
 * number so a developer can see WHY a value disappeared, per report
 * section 7. No new clinical confidence category — "detected"/"missing"/
 * "visibility: 0.xx" only.
 */
function getShoulderCalibrationLandmarkFacts(landmarks, side) {
  const set = SHOULDER_MEASUREMENT_LANDMARKS[side];
  if (!set || !landmarks) return null;
  const [hipIdx, shoulderIdx, elbowIdx] = set.core;
  const [wristIdx] = set.validity;
  const describe = (idx) => {
    const p = landmarks[idx];
    if (!p) return { available: false, visibility: null };
    const score = p.visibility != null ? p.visibility : p.presence;
    return { available: true, visibility: score == null ? null : score };
  };
  return { hip: describe(hipIdx), shoulder: describe(shoulderIdx), elbow: describe(elbowIdx), wrist: describe(wristIdx) };
}

/**
 * Phase 7.3B.2C.1 — separates RAW FACT (kept as-is, e.g. "visibility 0.03")
 * from GUIDANCE INTERPRETATION (report section 6). Reuses the existing,
 * already-approved generic tracking threshold SHOULDER_CAMERA_THRESHOLDS
 * .MIN_VISIBILITY — no new shoulder-ROM-specific threshold is introduced.
 */
function classifyShoulderCalibrationLandmarkQuality(fact) {
  if (!fact || !fact.available) return "未取得";
  if (fact.visibility == null) return "穩定取得"; // no visibility field at all -- treated as reliable, matching isReliablePoint()'s own established convention
  return fact.visibility >= SHOULDER_CAMERA_THRESHOLDS.MIN_VISIBILITY ? "穩定取得" : "辨識不穩定";
}

const SHOULDER_CALIBRATION_MOVEMENT_LABELS = {
  [SHOULDER_CALIBRATION_MOVEMENT.FLEXION]: "肩關節前屈",
  [SHOULDER_CALIBRATION_MOVEMENT.ABDUCTION]: "肩關節外展",
};
const SHOULDER_CALIBRATION_SIDE_LABELS = {
  [SHOULDER_SIDE.LEFT]: "左側",
  [SHOULDER_SIDE.RIGHT]: "右側",
};
const SHOULDER_CALIBRATION_MARKER_LABELS = {
  NEUTRAL: "自然垂下",
  MOVEMENT_START: "開始抬手",
  PERCEIVED_TOP: "我認為到頂",
  RETURNED: "回到起始",
};

/**
 * Phase 7.3B.2C.1 report section 7/8 — ONE prioritized, actionable
 * guidance message, never four at once. Priority order: SHOULDER (vertex
 * — most fundamental) > HIP (the landmark real-device testing found most
 * often lost, since it sits lowest in the frame) > ELBOW > WRIST (the
 * VALIDITY-only landmark — deliberately lowest priority, and its own
 * message never claims the core angle itself is unavailable, preserving
 * the 7.3B.2A/B contract). Returns { key: "ready", ... } once every core
 * landmark is stable, which doubles as the positive "tracking ready"
 * announcement.
 */
const SHOULDER_CALIBRATION_GUIDANCE_TEXT = {
  shoulder: "目前肩膀辨識不穩定，請調整位置讓測試側肩膀清楚入鏡。",
  hip: "目前髖部辨識不穩定，請稍微往後站，並確認髖部有完整入鏡。",
  elbow: "目前手肘辨識不穩定，請確認測試側手臂完整入鏡。",
  wrist: "目前手腕辨識不穩定，請確認手臂與手腕沒有超出畫面。",
  ready: "追蹤準備完成，目前可取得肩部角度，可以開始慢慢做動作。",
};
function classifyShoulderCalibrationGuidance(landmarkFacts) {
  if (!landmarkFacts) return { key: null, text: "" };
  const unstable = (k) => classifyShoulderCalibrationLandmarkQuality(landmarkFacts[k]) !== "穩定取得";
  if (unstable("shoulder")) return { key: "shoulder", text: SHOULDER_CALIBRATION_GUIDANCE_TEXT.shoulder };
  if (unstable("hip")) return { key: "hip", text: SHOULDER_CALIBRATION_GUIDANCE_TEXT.hip };
  if (unstable("elbow")) return { key: "elbow", text: SHOULDER_CALIBRATION_GUIDANCE_TEXT.elbow };
  if (unstable("wrist")) return { key: "wrist", text: SHOULDER_CALIBRATION_GUIDANCE_TEXT.wrist };
  return { key: "ready", text: SHOULDER_CALIBRATION_GUIDANCE_TEXT.ready };
}

/**
 * Phase 7.3B.2C.1 report section 8 — CALIBRATION OBSERVATION status only,
 * never a clinical/FSM state name. Derived purely from whether the core
 * angle was available THIS frame vs. the PREVIOUS frame (an availability
 * transition, not an angle-value threshold) — "observing" vs. "ready" is
 * just "was this already true a moment ago," never a movement-phase guess.
 */
const SHOULDER_CALIBRATION_STATUS_LABELS = {
  unselected: "尚未選擇動作／側邊",
  adjusting: "調整位置",
  ready: "已可取得肩部角度",
  observing: "正在觀察動作",
  interrupted: "追蹤暫時中斷",
};
function classifyShoulderCalibrationStatusKey(selection, coreAngleAvailable, wasCoreAvailable) {
  if (!selection.movement || !selection.side) return "unselected";
  if (!coreAngleAvailable) return wasCoreAvailable ? "interrupted" : "adjusting";
  return wasCoreAvailable ? "observing" : "ready";
}

/**
 * Pure HTML-string builder consumed by refreshShoulderCalibrationReadout()
 * below — kept separate so every call site (per-frame update, selection
 * change, marker click, reset) renders from the exact same shape, always
 * re-derived from the session's own snapshot (never ad-hoc arguments).
 * RAW ENGINEERING OBSERVATIONS ONLY (report section 8/18) — never 正常/
 * 異常/受限/通過/不通過/ROM 正常/肩關節有問題.
 *
 * Hierarchy (report section 14): big status -> raw angle -> running max
 * -> attempt-complete summary if applicable -> selection label -> landmark
 * quality (readable) -> raw visibility debug (small monospace) -> marker
 * log -> disclaimer. Movement/side/marker/reset CONTROLS render as a
 * separate static block (see functionalAssessmentShoulderCalibrationPanelHtml())
 * since they are discrete clicks, not per-frame data — grouped above this
 * readout in the DOM, but visually smaller than the big status/angle here.
 */
function renderShoulderCalibrationReadoutHtml(snapshot, statusKey, guidanceText) {
  const movementLabel = SHOULDER_CALIBRATION_MOVEMENT_LABELS[snapshot.movement] || "尚未選擇";
  const sideLabel = SHOULDER_CALIBRATION_SIDE_LABELS[snapshot.side] || "尚未選擇";
  const obs = snapshot.lastObservation;
  const fmtAngle = (v) => (v == null ? "--" : `${v.toFixed(1)}°`);
  const fmtVis = (fact) => (!fact ? "--" : !fact.available ? "missing" : `visibility ${fact.visibility == null ? "--" : fact.visibility.toFixed(2)}`);
  const facts = obs ? obs.landmarkFacts : null;

  const statusLabel = SHOULDER_CALIBRATION_STATUS_LABELS[statusKey] || SHOULDER_CALIBRATION_STATUS_LABELS.unselected;
  const guidanceHtml = guidanceText ? `<div class="small functional-assessment-calibration-guidance">${guidanceText}</div>` : "";

  const primaryAngleHtml =
    obs && obs.coreAngleAvailable
      ? `<div class="functional-assessment-calibration-primary-angle">${fmtAngle(obs.shoulderElevationAngle)}</div>`
      : `<div class="functional-assessment-calibration-primary-angle functional-assessment-calibration-unavailable">目前無法計算：肩／肘／髖關鍵點未完整取得</div>`;

  const elbowHtml =
    obs && obs.elbowValidityObservable
      ? `<div class="small">即時手肘角度：${fmtAngle(obs.elbowExtensionAngle)}</div>`
      : `<div class="small">即時手肘角度：無法取得（手腕未偵測）</div>`;

  const attemptStatus = snapshot.manualAttemptStatus;
  const attemptSummary = snapshot.manualAttemptSummary;
  const attemptHtml = attemptStatus && attemptStatus.complete && attemptSummary
    ? `<div class="functional-assessment-calibration-attempt-complete">
        <b>開發校正紀錄已完成</b>
        <div class="small">起始標記角度：${fmtAngle(attemptSummary.neutralAngle)}　開始抬手：${fmtAngle(attemptSummary.movementStartAngle)}</div>
        <div class="small">到頂標記角度：${fmtAngle(attemptSummary.perceivedTopAngle)}　回到起始：${fmtAngle(attemptSummary.returnedAngle)}</div>
        <div class="small">本段 running max：${fmtAngle(attemptSummary.runningMaxShoulderElevationAngle)}</div>
        <div class="small">核心關鍵點曾中斷：${attemptSummary.hadCoreUnavailable ? "是" : "否"}　手腕有效性曾中斷：${attemptSummary.hadElbowValidityLost ? "是" : "否"}</div>
        <div class="small functional-assessment-calibration-disclaimer">開發校正紀錄，不代表正式評估結果</div>
      </div>`
    : attemptStatus && attemptStatus.state === "out_of_order"
    ? `<div class="small functional-assessment-calibration-attempt-hint">標記順序不符預期（收到「${SHOULDER_CALIBRATION_MARKER_LABELS[attemptStatus.unexpectedMarker] || attemptStatus.unexpectedMarker}」）。若要開始新的一次校正紀錄，請先按「標記：自然垂下」。</div>`
    : attemptStatus && attemptStatus.expectedNext
    ? `<div class="small functional-assessment-calibration-attempt-hint">下一個預期標記：${SHOULDER_CALIBRATION_MARKER_LABELS[attemptStatus.expectedNext] || attemptStatus.expectedNext}</div>`
    : "";

  return `
    <div class="functional-assessment-calibration-status">${statusLabel}</div>
    ${guidanceHtml}
    <div class="small functional-assessment-calibration-label">即時肩部抬舉角度</div>
    ${primaryAngleHtml}
    <div class="functional-assessment-calibration-runningmax">本次觀察最高角度（開發校正用）：${fmtAngle(snapshot.runningMaxShoulderElevationAngle)}</div>
    ${elbowHtml}
    ${attemptHtml}
    <div class="functional-assessment-calibration-selection">${movementLabel} · ${sideLabel}</div>
    <div class="functional-assessment-calibration-landmarks">
      <div class="small">HIP：${classifyShoulderCalibrationLandmarkQuality(facts && facts.hip)}</div>
      <div class="small">SHOULDER：${classifyShoulderCalibrationLandmarkQuality(facts && facts.shoulder)}</div>
      <div class="small">ELBOW：${classifyShoulderCalibrationLandmarkQuality(facts && facts.elbow)}</div>
      <div class="small">WRIST：${classifyShoulderCalibrationLandmarkQuality(facts && facts.wrist)}</div>
    </div>
    <div class="small functional-assessment-calibration-debug">HIP ${fmtVis(facts && facts.hip)}　SHOULDER ${fmtVis(facts && facts.shoulder)}　ELBOW ${fmtVis(facts && facts.elbow)}　WRIST ${fmtVis(facts && facts.wrist)}</div>
    <div class="small functional-assessment-calibration-meta">樣本數：${snapshot.sampleCount}　標記數：${snapshot.markers.length}${obs && obs.timestamp != null ? `　t=${Math.round(obs.timestamp)}ms` : ""}</div>
    ${
      snapshot.markers.length
        ? `<div class="small functional-assessment-calibration-marker-list">${snapshot.markers
            .map((m) => `${SHOULDER_CALIBRATION_MARKER_LABELS[m.markerType] || m.markerType}@${Math.round(m.timestamp)}ms`)
            .join("　")}</div>`
        : ""
    }
    <div class="small functional-assessment-calibration-disclaimer">開發校正模式，僅供測試，不代表正式評估結果</div>
  `;
}

/**
 * Targeted DOM patch only (never render()) — safe to call from the
 * per-frame handler or from a marker/selection click while the camera is
 * live. Re-derives statusKey purely for DISPLAY from the session's own
 * snapshot (no side effect, no voice) — voice is driven separately, only
 * from updateShoulderCalibrationFromFrame()/markShoulderCalibrationMoment(),
 * so calling this to simply repaint never speaks anything.
 */
function refreshShoulderCalibrationReadout(statusKey, guidanceText) {
  if (!shoulderCalibrationSession) return;
  const el = document.getElementById("shoulderCalibrationReadout");
  if (!el) return;
  const snapshot = shoulderCalibrationSession.getSnapshot();
  snapshot.manualAttemptStatus = shoulderCalibrationSession.getManualAttemptStatus();
  snapshot.manualAttemptSummary = shoulderCalibrationSession.getManualAttemptSummary();
  el.innerHTML = renderShoulderCalibrationReadoutHtml(snapshot, statusKey || shoulderCalibrationLastStatusKey || "unselected", guidanceText);
}

/**
 * Calibration-only pose overlay (report section 4) — draws ONLY the
 * selected side's HIP/SHOULDER/ELBOW/WRIST + the HIP-SHOULDER/SHOULDER-
 * ELBOW segments calibration geometry actually uses, plus ELBOW-WRIST and
 * the contralateral shoulder as optional context. Deliberately NOT a full
 * skeleton (report section 4: "not decoration").
 *
 * MIRRORING CONTRACT (report section 5): draws RAW, unmirrored landmark
 * coordinates directly (`p.x * canvas.width`), exactly mirroring
 * drawSquatSkeleton()'s own proven technique — the CSS transform applied
 * to the canvas element (see toggleShoulderCalibrationMode() and
 * .functional-assessment-camera-wrap-mirrored below) is what makes this
 * visually follow a mirrored video, without this function ever knowing or
 * caring whether mirroring is on. GEOMETRY stays raw; only DISPLAY mirrors.
 *
 * Never calls render(); a canvas 2D context draw is inherently per-frame
 * safe (report section 15), same as drawSquatSkeleton()'s own precedent.
 */
function drawShoulderCalibrationOverlay(landmarks, side) {
  const canvas = document.getElementById("shoulderCalibrationOverlayCanvas");
  const video = document.getElementById("shoulderCameraVideo");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  if (video && video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  if (!canvas.width || !canvas.height) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const set = SHOULDER_MEASUREMENT_LANDMARKS[side];
  if (!landmarks || !set) return;

  const minVis = SHOULDER_CAMERA_THRESHOLDS.MIN_VISIBILITY;
  const [hipIdx, shoulderIdx, elbowIdx] = set.core;
  const [wristIdx] = set.validity;
  const [contralateralIdx] = set.optionalQuality;
  const isVisible = (p) => !!p && (p.visibility == null || p.visibility >= minVis);

  const drawSegment = (fromIdx, toIdx, color) => {
    const a = landmarks[fromIdx];
    const b = landmarks[toIdx];
    if (!isVisible(a) || !isVisible(b)) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, canvas.width * 0.006);
    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  };
  drawSegment(hipIdx, shoulderIdx, "#7ea866");
  drawSegment(shoulderIdx, elbowIdx, "#7ea866");
  drawSegment(elbowIdx, wristIdx, "#f0c265");

  const drawDot = (idx, color, radius) => {
    const p = landmarks[idx];
    if (!isVisible(p)) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, radius, 0, Math.PI * 2);
    ctx.fill();
  };
  drawDot(hipIdx, "#5f8d49", Math.max(3, canvas.width * 0.01));
  drawDot(shoulderIdx, "#5f8d49", Math.max(3, canvas.width * 0.01));
  drawDot(elbowIdx, "#5f8d49", Math.max(3, canvas.width * 0.01));
  drawDot(wristIdx, "#f0c265", Math.max(3, canvas.width * 0.01));
  drawDot(contralateralIdx, "#9aa89a", Math.max(2, canvas.width * 0.007));
}

/**
 * Per-frame calibration hook, called from handleShoulderFrame() on every
 * real frame regardless of shoulderCameraPhase. A no-op unless calibration
 * mode is on AND a session exists. Never mutates shoulderMeasurementSession
 * or shoulderCameraPhase — entirely read-only with respect to production
 * state. Voice fires only on a genuine guidance-key transition (report
 * section 12 — reuses the exact state-change-only pattern already
 * established by setShoulderPositioningMessage()), never every frame.
 */
function updateShoulderCalibrationFromFrame(landmarks, timestamp) {
  if (!shoulderCalibrationModeOn || !shoulderCalibrationSession) return;
  const selection = shoulderCalibrationSession.getSelection();
  drawShoulderCalibrationOverlay(landmarks, selection.side);
  if (!selection.side) {
    refreshShoulderCalibrationReadout("unselected", "");
    return;
  }
  const observation = computeShoulderMeasurementObservation(landmarks, selection.side, SHOULDER_CAMERA_THRESHOLDS);
  const landmarkFacts = getShoulderCalibrationLandmarkFacts(landmarks, selection.side);
  const wasCoreAvailable = shoulderCalibrationSession.getSnapshot().lastObservation
    ? shoulderCalibrationSession.getSnapshot().lastObservation.coreAngleAvailable === true
    : false;
  const statusKey = classifyShoulderCalibrationStatusKey(selection, observation.coreAngleAvailable, wasCoreAvailable);
  const guidance = classifyShoulderCalibrationGuidance(landmarkFacts);

  shoulderCalibrationSession.addObservation({ timestamp, movement: selection.movement, side: selection.side, ...observation, landmarkFacts });
  refreshShoulderCalibrationReadout(statusKey, guidance.text);

  shoulderCalibrationLastStatusKey = statusKey;
  if (guidance.key && guidance.key !== shoulderCalibrationLastGuidanceKey) {
    shoulderCalibrationLastGuidanceKey = guidance.key;
    speakShoulderText(`calibration_${guidance.key}`, guidance.text, timestamp);
  }
}

/**
 * Developer-only toggle (mirrors squat's toggleSquatDebugMode() exactly —
 * report section 5). Never calls render(): the calibration panel's markup
 * already exists in the DOM whenever the camera-active page is rendered
 * (see functionalAssessmentShoulderSessionPage()), with its initial
 * display/mirror state computed from shoulderCalibrationModeOn — this only
 * flips style.display + the mirror class and creates/discards the session.
 */
function toggleShoulderCalibrationMode() {
  shoulderCalibrationModeOn = !shoulderCalibrationModeOn;
  if (shoulderCalibrationModeOn && !shoulderCalibrationSession) {
    shoulderCalibrationSession = createShoulderCalibrationSession();
  } else if (!shoulderCalibrationModeOn) {
    shoulderCalibrationSession = null;
  }
  shoulderCalibrationLastGuidanceKey = null;
  shoulderCalibrationLastStatusKey = null;
  const panel = document.getElementById("shoulderCalibrationPanel");
  if (panel) panel.style.display = shoulderCalibrationModeOn ? "block" : "none";
  // Phase 7.3B.2C.1 report section 5 — mirroring is scoped to calibration
  // mode only (see Pre-check Findings in the report: the base Shoulder
  // preview was found NOT actually mirrored, unlike the phase brief's
  // assumption). Toggling this class is the ONLY mirroring change made;
  // .functional-assessment-camera-video itself is never touched, so
  // patient-facing (non-calibration) sessions are visually unaffected.
  const wrap = document.getElementById("shoulderCameraWrap");
  if (wrap) wrap.classList.toggle("functional-assessment-camera-wrap-mirrored", shoulderCalibrationModeOn);
  refreshShoulderCalibrationReadout();
}
window.toggleShoulderCalibrationMode = toggleShoulderCalibrationMode;

/** Calibration tooling only — does not resolve the future patient-facing side-selection UX (report section 6). */
function setShoulderCalibrationMovement(movement) {
  if (!shoulderCalibrationSession) return;
  shoulderCalibrationSession.setMovement(movement);
  shoulderCalibrationLastGuidanceKey = null;
  shoulderCalibrationLastStatusKey = null;
  refreshShoulderCalibrationReadout();
}
window.setShoulderCalibrationMovement = setShoulderCalibrationMovement;

function setShoulderCalibrationSide(side) {
  if (!shoulderCalibrationSession) return;
  shoulderCalibrationSession.setSide(side);
  shoulderCalibrationLastGuidanceKey = null;
  shoulderCalibrationLastStatusKey = null;
  refreshShoulderCalibrationReadout();
}
window.setShoulderCalibrationSide = setShoulderCalibrationSide;

function resetShoulderCalibrationSession() {
  if (!shoulderCalibrationSession) return;
  shoulderCalibrationSession.reset();
  shoulderCalibrationLastGuidanceKey = null;
  shoulderCalibrationLastStatusKey = null;
  refreshShoulderCalibrationReadout();
}
window.resetShoulderCalibrationSession = resetShoulderCalibrationSession;

/**
 * Human annotation only (report section 10/12) — NOT a production
 * threshold, NOT automated detection, NEVER generates a
 * SHOULDER_MEASUREMENT_SIGNAL. Always acknowledges the press (visual +
 * voice); if this completes a valid manual marker sequence, also
 * announces that separately (report section 11) — never silently.
 */
function markShoulderCalibrationMoment(markerType) {
  if (!shoulderCalibrationSession) return;
  const now = performance.now();
  shoulderCalibrationSession.addMarker(markerType, now);
  const label = SHOULDER_CALIBRATION_MARKER_LABELS[markerType] || markerType;
  refreshShoulderCalibrationReadout();
  speakShoulderText(`calibration_marker_${markerType}`, `已標記：${label}`, now);
  const status = shoulderCalibrationSession.getManualAttemptStatus();
  if (status.complete) {
    speakShoulderText("calibration_attempt_complete", "本次校正紀錄完成。", now);
  }
}
window.markShoulderCalibrationMoment = markShoulderCalibrationMoment;

/**
 * Phase 7.3B.1 — TEST/DEBUG-ONLY entry point. Drives the measurement
 * session's semantic FSM with a synthetic signal, through the exact same
 * processFrame() -> result.changed -> UI/voice patch path real frames would
 * use if they ever produced a real signal. Production camera frames (see
 * handleShoulderFrame()'s measurement-ready branch) NEVER call this and
 * NEVER pass anything but signal: null — this function exists solely so
 * Level 1 tests can prove the full waiting-for-movement -> movement-in-
 * progress -> endpoint-hold -> returning -> attempt-complete path works,
 * without inventing real shoulder geometry (report section 7). A no-op if
 * no measurement session is currently active.
 */
function injectShoulderMeasurementSignalForTesting(signal, timestamp) {
  if (!shoulderMeasurementSession) return null;
  const now = timestamp != null ? timestamp : performance.now();
  const result = shoulderMeasurementSession.processFrame({ timestamp: now, bodyReady: true, signal });
  if (result.changed) {
    updateShoulderCameraStatusUI();
    speakShoulderMeasurementTransition(result.phase, now);
  }
  return result;
}
window.injectShoulderMeasurementSignalForTesting = injectShoulderMeasurementSignalForTesting;

/**
 * Phase 7.3B.1 — TEST/DEBUG-ONLY alias for the real per-frame camera
 * callback. In production this is only ever invoked by
 * createSquatCameraController()'s internal loop() via the onFrame
 * reference passed in beginShoulderCameraSession() — never called directly
 * by any UI action. Exposed here, under an explicitly-labeled alias, only
 * so Level 1 tests can feed synthetic (but shape-valid) landmark arrays
 * through the REAL handleShoulderFrame()/readiness/ready-hold/countdown/
 * measurement-session pipeline without a real camera or network-loaded
 * MediaPipe model (the same offline-testing limitation every prior camera
 * probe in this project already has).
 */
window.pushShoulderCameraFrameForTesting = handleShoulderFrame;

function functionalAssessmentShoulderIntroPage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="goFunctionalAssessmentShoulderPrep()">返回</button>
      <b>肩部功能評估</b>
      <span></span>
    </div>
    <div class="card functional-assessment-intro-card">
      <b class="detail-section-label">肩部功能評估</b>
      <p class="small">接下來會完成 2 個簡單動作，請依照畫面示範，在自己舒服的範圍內完成即可。</p>
      <div class="functional-assessment-intro-point"><span class="small">共 2 個動作</span></div>
      <div class="functional-assessment-intro-point"><span class="small">每個動作依照示範完成</span></div>
      <div class="functional-assessment-intro-point"><span class="small">若感到不適，可隨時停止</span></div>
    </div>
    <button class="btn btn-primary full" style="margin-top:12px;" onclick="startFunctionalAssessmentShoulderSession()">開始</button>
  `;
}

function renderFunctionalAssessmentShoulderProgressDots(current, total) {
  return `<div class="functional-assessment-progress-dots">${Array.from({ length: total }, (_, i) => `<span class="${i === current ? "active" : ""}"></span>`).join("")}</div>`;
}

/**
 * Index-driven — one shared renderer for both movements (report section
 * 8's explicit "do not create one hardcoded page per movement" rule).
 * The 3-frame sequence is instructional progression only: captions are
 * plain 開始/抬起/向上, never 正常/異常/標準角度/達標 — nothing here
 * implies the patient's own movement was measured against these frames.
 */
/**
 * Phase 7.3A.1 — the instruction phase (unchanged content: progress label/
 * dots, movement title, view label, instruction paragraph, 3-frame
 * sequence, safety note) is the ONLY place that content renders — per
 * report section 15/20, once the camera is active the page switches to a
 * compact "remote" layout (movement identity + dots only, camera preview,
 * one large status, no long paragraphs, no manual Continue) so the
 * essential state stays readable from ~1-2m. Every camera-active phase
 * shares the SAME markup shape so handleShoulderCameraStatus()/
 * handleShoulderFrame() can patch it in place without ever re-rendering
 * the page (which would tear down the live <video> element mid-stream).
 */
function functionalAssessmentShoulderSessionPage() {
  const index = state.functionalAssessmentShoulderMovementIndex || 0;
  const total = FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS.length;
  const movement = FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS[index];
  const isLast = index === total - 1;
  const ctaLabel = isLast ? "完成評估" : "完成此動作，下一項";
  const framesHtml = movement.images
    .map((img) => `<div class="functional-assessment-frame"><img src="${img.src}" alt="${movement.label} - ${img.caption}" /><span class="small functional-assessment-frame-caption">${img.caption}</span></div>`)
    .join("");
  const isInstruction = shoulderCameraPhase === "instruction";
  const backLabel = isInstruction ? "返回" : "← 結束評估";
  // Phase 7.3B.2C — developer/test-only calibration toggle. Reuses the
  // EXACT existing convention already established by Squat's own
  // .squat-debug-toggle/toggleSquatDebugMode() (squatDetectionPage()) —
  // a small, unobtrusive, always-present text toggle, not gated behind
  // any account flag. state.user.isDeveloperAccount was considered but
  // rejected: it is only ever true on the seeded THERAPIST account
  // (seedData.js), while selectFunctionalAssessmentBodyRegion() requires
  // state.user.role === "patient" — no account that can ever reach this
  // route can carry that flag, so gating on it would make the toggle
  // permanently unreachable. Visible in both instruction and camera-active
  // phases (harmless pre-camera); the panel itself only exists once the
  // camera is active.
  const calibrationToggleHtml = `<span class="functional-assessment-calibration-toggle" onclick="toggleShoulderCalibrationMode()" title="開發校正模式">校正</span>`;

  const bodyHtml = isInstruction
    ? `
        <div class="small functional-assessment-progress-label">動作 ${index + 1} / ${total}</div>
        ${renderFunctionalAssessmentShoulderProgressDots(index, total)}
        <h2 class="functional-assessment-movement-title">${movement.label}</h2>
        <div class="small functional-assessment-view-label">${movement.viewLabel}</div>
        <p class="small functional-assessment-instruction">${movement.instruction}</p>
        <div class="functional-assessment-frame-grid">${framesHtml}</div>
        <div class="small center functional-assessment-safety-note">若感到不適，可隨時停止。</div>
        <button class="btn btn-primary full" style="margin-top:12px;" onclick="beginShoulderCameraSession()">開始鏡頭檢測</button>
      `
    : `
        <div class="functional-assessment-remote-identity">
          <b>${movement.label}</b>
          ${renderFunctionalAssessmentShoulderProgressDots(index, total)}
        </div>
        <div class="functional-assessment-camera-wrap${shoulderCalibrationModeOn ? " functional-assessment-camera-wrap-mirrored" : ""}" id="shoulderCameraWrap">
          <video id="shoulderCameraVideo" class="functional-assessment-camera-video" playsinline muted autoplay></video>
          <canvas id="shoulderCalibrationOverlayCanvas" class="functional-assessment-calibration-overlay-canvas"></canvas>
        </div>
        <div class="functional-assessment-remote-status">
          <span class="functional-assessment-camera-dot" id="shoulderCameraStatusDot"></span>
          <b class="functional-assessment-remote-status-primary" id="shoulderCameraStatusPrimary"></b>
          <div class="small functional-assessment-remote-status-secondary" id="shoulderCameraStatusSecondary"></div>
        </div>
        <div id="shoulderCameraErrorActions" class="functional-assessment-camera-error-actions" style="display:none;">
          <button class="btn btn-primary full" onclick="beginShoulderCameraSession()">重新嘗試</button>
          <button class="btn btn-light full" onclick="goFunctionalAssessmentShoulderSessionBack()">結束評估</button>
        </div>
        ${
          shoulderCameraPhase === "measurement-ready"
            ? `<button class="btn btn-light full functional-assessment-manual-continue" style="margin-top:14px;" onclick="advanceFunctionalAssessmentShoulderMovement()">${ctaLabel}（手動繼續，7.3B 完成後將由系統銜接）</button>`
            : ""
        }
        ${functionalAssessmentShoulderCalibrationPanelHtml()}
      `;

  return `
    <div class="header">
      <button class="btn btn-light" id="functionalAssessmentShoulderBackBtn" onclick="goFunctionalAssessmentShoulderSessionBack()">${backLabel}</button>
      <b>肩部功能評估</b>
      ${calibrationToggleHtml}
    </div>
    ${bodyHtml}
  `;
}

/**
 * Phase 7.3B.2C — calibration panel markup. Always present in the DOM
 * whenever the camera-active page renders, with
 * its initial display computed from shoulderCalibrationModeOn so a toggle
 * click that happens BEFORE the camera page has ever rendered (e.g. from
 * the instruction phase) is still reflected correctly the first time this
 * markup appears — toggleShoulderCalibrationMode() itself then only ever
 * flips style.display, never calls render() (report section 14: reusing
 * the already-running camera, never recreating the video element).
 * #shoulderCalibrationControls is static (safe to include in a normal
 * render() pass — selection/reset/marker clicks are discrete user actions,
 * not per-frame); #shoulderCalibrationReadout is the ONLY per-frame-patched
 * part (report section 9: large primary angle, compact landmark details
 * below it).
 */
function functionalAssessmentShoulderCalibrationPanelHtml() {
  return `
    <div class="functional-assessment-calibration-panel" id="shoulderCalibrationPanel" style="display:${shoulderCalibrationModeOn ? "block" : "none"};">
      <div class="functional-assessment-calibration-controls" id="shoulderCalibrationControls">
        <div class="functional-assessment-calibration-row">
          <span class="small">動作：</span>
          <button class="btn btn-light functional-assessment-calibration-btn" onclick="setShoulderCalibrationMovement('${SHOULDER_CALIBRATION_MOVEMENT.FLEXION}')">肩關節前屈</button>
          <button class="btn btn-light functional-assessment-calibration-btn" onclick="setShoulderCalibrationMovement('${SHOULDER_CALIBRATION_MOVEMENT.ABDUCTION}')">肩關節外展</button>
        </div>
        <div class="functional-assessment-calibration-row">
          <span class="small">側邊：</span>
          <button class="btn btn-light functional-assessment-calibration-btn" onclick="setShoulderCalibrationSide('${SHOULDER_SIDE.LEFT}')">左側</button>
          <button class="btn btn-light functional-assessment-calibration-btn" onclick="setShoulderCalibrationSide('${SHOULDER_SIDE.RIGHT}')">右側</button>
        </div>
        <div class="functional-assessment-calibration-row functional-assessment-calibration-markers">
          <button class="btn btn-light functional-assessment-calibration-marker-btn" onclick="markShoulderCalibrationMoment('NEUTRAL')">標記：自然垂下</button>
          <button class="btn btn-light functional-assessment-calibration-marker-btn" onclick="markShoulderCalibrationMoment('MOVEMENT_START')">標記：開始抬手</button>
          <button class="btn btn-light functional-assessment-calibration-marker-btn" onclick="markShoulderCalibrationMoment('PERCEIVED_TOP')">標記：我認為到頂</button>
          <button class="btn btn-light functional-assessment-calibration-marker-btn" onclick="markShoulderCalibrationMoment('RETURNED')">標記：回到起始</button>
        </div>
        <div class="functional-assessment-calibration-row">
          <button class="btn btn-light" onclick="resetShoulderCalibrationSession()">重設校正紀錄</button>
        </div>
      </div>
      <div class="functional-assessment-calibration-readout" id="shoulderCalibrationReadout"></div>
    </div>
  `;
}

/**
 * NOT a result page — no score/angle/ROM/symmetry/normal-abnormal
 * anywhere (report section 14). functionalAssessmentService is never
 * written to here, so this truthfully avoids claiming detailed movement
 * data was saved.
 */
function functionalAssessmentShoulderCompletePage() {
  return `
    <div class="header">
      <button class="btn btn-light" onclick="switchTab('home')">返回</button>
      <b>肩部功能評估</b>
      <span></span>
    </div>
    <div class="card reward-feedback-panel functional-assessment-complete-card">
      <b>肩部功能評估完成</b>
      <div class="small">已完成 2 個動作</div>
      <p class="small">你已完成本次肩部功能評估流程。</p>
      <div class="small functional-assessment-complete-note">目前為功能評估流程示範，分析結果將於後續功能提供。</div>
    </div>
    <button class="btn btn-primary full" style="margin-top:12px;" onclick="switchTab('home')">完成</button>
  `;
}

/**
 * ReMotion 2.0 Phase 3.1 — deterministic, template-based text builders for
 * the Recommendation Detail page. All wording is assembled from real
 * assessment/recommendation/exercise fields only — no free-generation, no
 * LLM. Every branch gracefully omits a clause when the underlying data
 * isn't there (never guesses).
 */
function buildRecommendationHeadlineText(active, itemCount) {
  if (itemCount === 0) return "目前資料較少，還沒有足夠的練習可以安排";
  if (active.goals && active.goals[0]) return `今天以${active.goals[0]}練習為主`;
  if (active.bodyParts && active.bodyParts[0]) return `今天以${active.bodyParts[0]}練習為主`;
  return "今天為你安排了練習";
}

// buildRecommendationSummarySentence() (the old paragraph-style summary
// sentence) was replaced in Phase 6.5 by the Hero's compact "N 個動作 · 約
// M 分鐘" line (report section 8/17), computed inline from the same real
// summary.itemCount/estimatedMinutes — removed since nothing called it.
function renderSummaryChip(label) {
  return `<span class="summary-chip">${label}</span>`;
}

/**
 * Phase 6.5 report section 15 — the Recommendation Engine already computes
 * a real, explainable `reason` string per item (buildRecommendationReason()
 * in recommendationEngine.js, stored on the session item at generation
 * time). The OLD code here ignored that stored field and re-derived a
 * separate, parallel headline via a UI-side buildRecommendationCardText()
 * — two independent "why" texts that could in principle drift apart. This
 * compacts the REAL stored reason (its first clause, before the "此動作
 * 支援 AI 動作分析" bonus clause which is redundant with the separate AI
 * badge already shown on the card) instead of maintaining a second
 * generator. Never invents wording the engine didn't produce.
 */
function buildCompactRecommendationReason(item) {
  if (!item.reason) return null;
  const firstClause = String(item.reason).split("。")[0].trim();
  return firstClause || null;
}

/**
 * Phase 6.5 report section 11/12/14 — image + main info share one row
 * (never image-on-its-own-row-then-a-tall-text-stack), a single compact
 * reason strip below reusing the real engine reason (see
 * buildCompactRecommendationReason), AI badge only when item.aiSupported
 * is genuinely true (report section 12 — HP02-style prototype detectors
 * never count, only exercises isSquatExercise() already flags). Visual
 * hierarchy is still Exercise Name > Metadata > Sequence Number, per the
 * original Phase 3.1 intent — the 01/02 index stays de-emphasized.
 */
function renderRecommendationSessionItem(item, index, { completed, isNextPending }) {
  const catalog = exerciseService.getNormalizedById(item.exerciseId);
  const imageHtml = catalog ? renderExerciseCardImage(catalog) : `<div class="exercise-grid-card-image exercise-grid-card-image-fallback"></div>`;
  const metricParts = [];
  if (item.suggestedReps != null) {
    metricParts.push(`${item.suggestedReps} 次${item.suggestedSets && item.suggestedSets > 1 ? ` × ${item.suggestedSets}` : ""}`);
  } else if (item.suggestedDuration != null) {
    metricParts.push(`${item.suggestedDuration} 秒${item.suggestedSets && item.suggestedSets > 1 ? ` × ${item.suggestedSets}` : ""}`);
  }
  const tagParts = [item.difficulty ? getDifficultyDisplay(item.difficulty).label : null, item.bodyPart].filter(Boolean);
  const aiHtml = item.aiSupported ? `<span class="training-mode-badge tier-pose"><img src="/images/ai_robot.png" alt="" />AI 姿勢分析</span>` : "";
  const statusTagHtml = completed
    ? `<span class="recommendation-item-done">✓ 已完成</span>`
    : isNextPending
      ? `<span class="recommendation-item-next">接著做這個</span>`
      : "";
  const compactReason = buildCompactRecommendationReason(item);

  return `<div class="recommendation-item-card clickable" onclick="goRecommendationExerciseDetail('${item.exerciseId}')">
    <div class="recommendation-item-top">
      <div class="recommendation-item-image">${imageHtml}</div>
      <div class="recommendation-item-main">
        <div class="recommendation-item-name-row"><span class="recommendation-item-index">${String(index).padStart(2, "0")}</span><b class="recommendation-item-name">${item.exerciseName}</b></div>
        <div class="small">${tagParts.join(" · ") || "-"}</div>
        <div class="small">${metricParts.join("・") || "-"}</div>
        <div class="recommendation-item-tags-row">${aiHtml}${statusTagHtml}</div>
      </div>
    </div>
    <div class="recommendation-item-reason-row">
      ${compactReason ? `<img class="recommendation-item-reason-star" src="/images/gamification/star_gold.png" alt="" /><span class="small">${compactReason}</span>` : `<span></span>`}
      <span class="more-link">›</span>
    </div>
  </div>`;
}

/**
 * Phase 6.5 report section 10 — "今天的安排依據" as compact icon rows
 * instead of a plain chip list (which read like a filter bar, not an
 * explanation). Reuses the exact real icons already established for
 * body-part/goal categories (CATEGORY_ICON_MAP/GOAL_ICON_MAP, Phase 6.1) —
 * no new mapping. Every row here is a genuine Recommendation Engine input
 * (assessment.bodyParts/goals/abilityLevel) — audited and confirmed the
 * engine reads no history/analysisRecord data at all, so no "最近訓練狀況"
 * row is added (would misrepresent what actually drove the recommendation).
 */
function renderRecommendationBasisCard(active, abilityLabel) {
  const rows = [];
  if (active.bodyParts && active.bodyParts.length) {
    rows.push({ icon: CATEGORY_ICON_MAP[active.bodyParts[0]] || null, text: active.bodyParts.join("＋") });
  }
  if (active.goals && active.goals.length) {
    rows.push({ icon: GOAL_ICON_MAP[active.goals[0]] || null, text: `提升${active.goals.join("、")}` });
  }
  if (abilityLabel) {
    rows.push({ icon: "/images/gamification/star_gold.png", text: `目前程度：${abilityLabel}` });
  }
  if (!rows.length) return "";
  return `<div class="card recommendation-basis-card">
    <b class="detail-section-label">今天的安排依據</b>
    ${rows.map((r) => `<div class="recommendation-basis-row">${r.icon ? `<img class="recommendation-basis-icon" src="${r.icon}" alt="" />` : `<span class="recommendation-basis-icon"></span>`}<span class="small">${r.text}</span></div>`).join("")}
  </div>`;
}

/**
 * Phase 6.5 report section 13 — a real mini "journey" of stars, one per
 * recommended item, reusing the SAME completion signal
 * isRecommendationItemCompleted() already computes (a documented
 * best-effort heuristic since Phase 3.1 — exerciseId + self_practice +
 * same calendar day — not a fabricated one invented for this visual). The
 * heuristic's known imprecision is unchanged; only the presentation
 * (progress_star_green solid vs dimmed, connected by a thin line) upgrades
 * from the old plain dot row.
 */
function renderTodaysTrainingRoute(enrichedItems) {
  return `<div class="recommendation-route-row">
    ${enrichedItems
      .map((it, i) => {
        const nodeClasses = ["recommendation-route-node"];
        if (it.completed) nodeClasses.push("done");
        const starClasses = ["recommendation-route-star"];
        if (!it.completed) starClasses.push("inactive");
        return `<div class="${nodeClasses.join(" ")}">
          <img class="${starClasses.join(" ")}" src="/images/gamification/progress_star_green.png" alt="" />
          <span class="small">${String(i + 1).padStart(2, "0")}</span>
        </div>`;
      })
      .join("")}
  </div>`;
}

/**
 * Phase 6.5 report section 7-17 — new IA: Header -> Hero (image+text
 * hierarchy, real data only) -> Recommendation Basis -> Today's Training
 * Route + Exercise Cards -> compact CTA summary -> Why This Plan. Replaces
 * the old text-only report-style layout. Every number/tag/reason still
 * comes from the real assessment/recommendation/exercise fields already
 * established since Phase 3.1 — this phase only changed presentation.
 */
function todaysRecommendationPage() {
  const patientId = state.user.id;
  const active = assessmentService.getActiveByPatientId(patientId);
  if (!active) {
    // Report section 19.A — no assessment at all yet.
    return `
      <div class="header"><button class="btn btn-light detail-back-btn" onclick="switchTab('home')">返回</button><b>為你安排的今日練習</b></div>
      <div class="empty-state"><img src="/images/robot/robot_thinking.png" alt="" /><div class="small">尚未建立復健需求評估</div><div class="small" style="color:var(--color-text-secondary);">完成評估後，這裡會顯示為你安排的練習。</div></div>
      <button class="btn btn-primary full" onclick="goPatientAssessmentIntro()">開始評估</button>
    `;
  }

  const recommendation = getTodaysRecommendationForPatient(patientId, active);
  const items = recommendation ? recommendation.items : [];
  const recommendationDateStr = recommendation ? (recommendation.createdAt || "").slice(0, 10) : todayStr();

  // Stored items only carry exerciseId/reason/suggestedSets/suggestedReps/
  // suggestedDuration/section/score — re-derive display fields (name/
  // bodyPart/difficulty/goal/aiSupported) from the real catalog at render
  // time, using the same goal-overlay the engine scored against so
  // "goal" here only ever reflects a real match, never a guess. Completion
  // is derived from real analysisRecord data too (see
  // isRecommendationItemCompleted's doc comment for its known limitation).
  const candidatesById = {};
  exerciseService.listNormalizedWithKnownGoals().forEach((ex) => {
    candidatesById[ex.id] = ex;
  });
  const enrichedItems = items.map((it) => {
    const ex = candidatesById[it.exerciseId] || null;
    return {
      ...it,
      exerciseName: (ex && ex.name) || it.exerciseId,
      bodyPart: ex ? ex.bodyPart : null,
      difficulty: ex ? ex.difficulty : null,
      goal: ex && ex.goal && active.goals.includes(ex.goal) ? ex.goal : null,
      aiSupported: !!(ex && ex.aiSupported),
      completed: isRecommendationItemCompleted(it.exerciseId, recommendationDateStr, patientId),
    };
  });

  const summary = summarizeRecommendationItems(items);
  const abilityLabel = ABILITY_LEVEL_OPTIONS.find((o) => o.value === active.abilityLevel)?.label || null;

  // ---- Hero (report section 8/9): headline + robot share one row, tags
  // below, at most one low-opacity decorative sparkle. ----
  const headlineText = buildRecommendationHeadlineText(active, summary.itemCount);
  const countMinutesSummary = summary.itemCount > 0
    ? `${summary.itemCount} 個動作${summary.estimatedMinutes != null ? ` · 約 ${summary.estimatedMinutes} 分鐘` : ""}`
    : null;
  const heroTagsHtml = [...active.bodyParts, ...active.goals, abilityLabel].filter(Boolean).map(renderSummaryChip).join("");
  const heroRobotSrc = summary.itemCount > 0 ? "/images/robot/robot_happy.png" : "/images/robot/robot_thinking.png";
  const heroHtml = `<div class="card recommendation-hero-card">
    <img class="recommendation-hero-decor" src="/images/gamification/sparkle_01.png" alt="" />
    <div class="recommendation-hero-top-row">
      <div>
        <span class="ai-tag-badge">AI 個人化建議</span>
        <h2 class="recommendation-hero-headline">${headlineText}</h2>
        ${countMinutesSummary ? `<div class="small">${countMinutesSummary}</div>` : ""}
      </div>
      <img class="recommendation-hero-robot" src="${heroRobotSrc}" alt="" />
    </div>
    ${heroTagsHtml ? `<div class="chip-row">${heroTagsHtml}</div>` : ""}
  </div>`;

  // ---- Recommendation Basis (report section 10) ----
  const basisHtml = renderRecommendationBasisCard(active, abilityLabel);

  const completedCount = enrichedItems.filter((it) => it.completed).length;
  const firstPendingIndex = enrichedItems.findIndex((it) => !it.completed);

  let bodyHtml;
  if (enrichedItems.length === 0) {
    // Report section 19.A — an assessment exists but nothing matched today: honest empty state + two real CTAs, never a fake session.
    bodyHtml = `
      <div class="empty-state"><img src="/images/robot/robot_search.png" alt="" /><div class="small">目前可用資料中，符合你條件的練習較少</div></div>
      <div class="row" style="margin-top:10px;">
        <button class="btn btn-light" style="flex:1" onclick="goAssessmentSettings()">更新復健需求</button>
        <button class="btn btn-light" style="flex:1" onclick="goSelfPracticeLibrary()">前往自主練習</button>
      </div>
    `;
  } else {
    const limitedNoticeHtml =
      enrichedItems.length < RECOMMENDATION_CONFIG.MIN_SESSION_ITEMS
        ? `<div class="small" style="color:#8a6d1c; margin-bottom:10px;">目前資料庫中符合此條件的動作較少。</div>`
        : "";
    // Report section 13 — real per-item completion (same heuristic as
    // before), now a visual star route instead of plain dots.
    const routeHtml = renderTodaysTrainingRoute(enrichedItems);
    const listHtml = enrichedItems
      .map((it, idx) => renderRecommendationSessionItem(it, idx + 1, { completed: it.completed, isNextPending: idx === firstPendingIndex }))
      .join("");

    // CTA text/target follows Session state — always jumps to the first
    // not-yet-completed exercise, never forces strict 01->05 order (the
    // patient can still tap any card directly).
    let ctaHtml;
    if (completedCount === 0) {
      ctaHtml = `<button class="btn btn-primary full" style="margin-top:10px;" onclick="goRecommendationExerciseDetail('${enrichedItems[0].exerciseId}')">開始今天的練習</button>`;
    } else if (completedCount < enrichedItems.length) {
      const nextItem = enrichedItems[firstPendingIndex];
      ctaHtml = `<button class="btn btn-primary full" style="margin-top:10px;" onclick="goRecommendationExerciseDetail('${nextItem.exerciseId}')">繼續下一個動作</button>`;
    } else {
      ctaHtml = `<div class="card muted center" style="margin-top:10px;"><b>今天的練習完成了！</b><div class="small" style="margin-top:4px;">完成動作數：${completedCount} / ${enrichedItems.length}</div></div>`;
    }

    bodyHtml = `
      <h3 class="section-title">今天要做什麼</h3>
      ${limitedNoticeHtml}
      ${routeHtml}
      ${listHtml}
      ${countMinutesSummary ? `<div class="small recommendation-cta-summary">${countMinutesSummary}</div>` : ""}
      ${ctaHtml}
    `;
  }

  // ---- Why This Plan (report section 16): compact bullet rows, only real
  // recommendation-basis facts, never invented reasoning. ----
  const whyRows = [
    active.goals && active.goals.length ? { icon: "/images/gamification/star_gold.png", text: `${active.goals.join("、")}是目前主要目標` } : null,
    active.bodyParts && active.bodyParts.length ? { icon: CATEGORY_ICON_MAP[active.bodyParts[0]] || null, text: `今天涵蓋${active.bodyParts.join("與")}` } : null,
    abilityLabel ? { icon: "/images/gamification/sparkle_01.png", text: `動作以${abilityLabel}為主` } : null,
  ].filter(Boolean);
  const whyHtml = `
    <div class="card recommendation-why-card">
      <div class="recommendation-why-title"><img src="/images/ai_robot.png" alt="" /><b>為什麼這樣安排</b></div>
      ${whyRows.map((r) => `<div class="recommendation-why-row">${r.icon ? `<img class="recommendation-why-icon" src="${r.icon}" alt="" />` : `<span class="recommendation-why-icon"></span>`}<span class="small">${r.text}</span></div>`).join("")}
      <button class="btn btn-light full" style="margin-top:12px;" onclick="goAssessmentSettings()">查看／修改我的復健需求 →</button>
      <p class="small" style="margin-top:12px; color:var(--color-text-secondary);">此內容為個人化練習建議，不取代復健師或其他專業醫療人員的治療安排。</p>
    </div>
  `;

  return `
    <div class="header"><button class="btn btn-light detail-back-btn" onclick="switchTab('home')">返回</button><b>為你安排的今日練習</b></div>
    ${heroHtml}
    ${basisHtml}
    ${bodyHtml}
    ${whyHtml}
  `;
}

// Phase 5.4.4 (report section 15/H) — the XP breakdown's icon+label map.
// Reused by both the Result Page reward card and the lighter inline reward
// panel so the same four categories always look the same everywhere.
const XP_BREAKDOWN_META = {
  base: { icon: "/images/gamification/checkmark_01.png", label: "基礎練習" },
  completion: { icon: "/images/gamification/progress_star_complete.png", label: "完成目標" },
  quality: { icon: "/images/gamification/star_gold.png", label: "動作品質" },
  consistency: { icon: "/images/gamification/streak_fire.png", label: "連續復健" },
};

/**
 * Phase 5.4.4 (report section 15/H) — replaces the old stacked
 * "label　+N XP" list (which read like a report/table on real devices)
 * with a compact 2-column icon grid. Only earned (>0) categories render, so
 * a 1-2-item breakdown never leaves an awkward half-empty row.
 */
function renderXpBreakdownGrid(breakdown) {
  if (!breakdown) return "";
  const items = Object.keys(XP_BREAKDOWN_META)
    .map((key) => (breakdown[key] > 0 ? { ...XP_BREAKDOWN_META[key], value: breakdown[key] } : null))
    .filter(Boolean);
  if (!items.length) return "";
  return `<div class="result-reward-grid">${items
    .map(
      (item) =>
        `<div class="result-reward-grid-item"><img src="${item.icon}" alt="" /><span class="result-reward-grid-label">${item.label}</span><span class="result-reward-grid-value">+${item.value}</span></div>`
    )
    .join("")}</div>`;
}

/**
 * Real MediaPipe squat records (analysisMode === "mediapipe_squat") get the
 * full rep-by-rep breakdown described in the squat MVP spec. Older/demo
 * records (analysisMode "mock" or missing) still render with the original,
 * minimal score+remark layout — never assumes fields that only exist on
 * squat records.
 */
/**
 * Phase 5.4.3 — Result Page major redesign (report sections 14-22). Old
 * problems being fixed: too long, too many equal-weight white cards, too
 * much text, felt like an engineering report instead of a training result.
 * New hierarchy, first-screen-first: Hero (completion+quality+robot+light
 * celebration) -> compact 3-column summary -> main feedback (top 2-3
 * issues, friendly copy) -> reward card (XP coin + level bar) -> collapsed
 * "詳細分析" for angles/prototype score/disclaimer. No standalone "分析結果"
 * heading — the Hero itself is the page's first visual (report section 15).
 */
function renderKn03AnalysisResult(record) {
  const s = record.summary || {};
  const totalReps = s.totalReps ?? record.totalReps ?? 0;
  const targetReps = s.targetReps ?? record.targetReps ?? 0;
  const score = record.score ?? record.overallScore ?? null;
  const targetReached = targetReps > 0 && totalReps >= targetReps;
  const trackingCount = s.trackingInterruptionCount ?? s.repsWithTrackingGap ?? 0;
  const xpResult = gamificationEngine.computeSessionXp(record);
  const gaminfo = gamificationEngine.getPatientLevel(record.patientId);
  const issueEntries = [
    s.insufficientExtensionCount > 0 ? { count: s.insufficientExtensionCount, code: KN03_QUALITY_ISSUE.INSUFFICIENT_EXTENSION } : null,
    s.excessiveTrunkLeanCount > 0 ? { count: s.excessiveTrunkLeanCount, code: KN03_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN } : null,
    s.thighLiftCount > 0 ? { count: s.thighLiftCount, code: KN03_QUALITY_ISSUE.THIGH_LIFT } : null,
    s.rhythmIssueCount > 0 ? { count: s.rhythmIssueCount, code: KN03_QUALITY_ISSUE.RHYTHM } : null,
    s.tooFastCount > 0 ? { count: s.tooFastCount, code: KN03_QUALITY_ISSUE.TOO_FAST } : null,
  ].filter(Boolean).sort((a, b) => b.count - a.count).slice(0, 3);
  const feedback = issueEntries.length
    ? issueEntries.map((i) => `<div class="result-feedback-row"><div class="small">↓ ${KN03_QUALITY_ISSUE_LABELS[i.code]} ×${i.count}</div><div class="small" style="color:#666;">${KN03_QUALITY_SUGGESTIONS[i.code]}</div></div>`).join("")
    : `<div class="small">這次沒有特別需要注意的地方，繼續保持！</div>`;
  const headline = targetReached ? `今天完成 ${totalReps} 次！` : `今天完成 ${totalReps} 次`;
  const sub = totalReps === 0 ? "這次沒有偵測到完整的動作。" : score != null ? `本次動作品質 ${score} 分${targetReached ? "，做得很好！" : "，再累積一些就更接近目標了。"}` : "繼續保持穩定的動作。";
  const breakdown = !xpResult.isLegacyFlatRate ? renderXpBreakdownGrid(xpResult.breakdown) : "";
  return `<div class="detail-analysis-result">
    <div class="card result-hero">${renderRobot(targetReached ? "celebrate" : totalReps > 0 ? "happy" : "encourage", "sm")}<div class="result-hero-headline">${headline}</div><div class="small result-hero-sub">${sub}</div><div class="result-hero-badges">${xpResult.xp > 0 ? `<span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="" />+${xpResult.xp} XP</span>` : ""}${targetReached ? `<span class="result-hero-badge"><img src="/images/gamification/star_sparkle.png" alt="" />目標達成</span>` : ""}</div></div>
    <div class="card" style="margin-top:10px;"><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">${totalReps}<span class="result-summary-value-sep">/${targetReps}</span></div><div class="small">完成</div></div><div class="result-summary-col"><div class="result-summary-value">${score != null ? `${score}<span class="result-summary-value-sep">/100</span>` : "-"}</div><div class="small">品質分數</div></div><div class="result-summary-col"><div class="result-summary-value">${trackingCount}</div><div class="small">追蹤中斷</div></div></div></div>
    <div class="card result-feedback-card" style="margin-top:10px;"><div class="small result-feedback-title"><b>主要提醒</b></div>${feedback}</div>
    <div class="card result-reward-card"><div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="" />本次獲得　+${xpResult.xp} XP</div><div class="result-reward-level-row small">Lv.${gaminfo.level}　${gaminfo.currentLevelXp} / ${gaminfo.nextLevelXp} XP</div><div class="result-reward-level-bar"><span style="width:${Math.round((gaminfo.currentLevelXp / gaminfo.nextLevelXp) * 100)}%"></span></div>${breakdown}</div>
    <details class="result-tech-details"><summary>詳細分析</summary><div class="small" style="margin-top:8px;">平均最大膝角度：${s.averageMaxKneeAngle == null ? "-" : `${Math.round(s.averageMaxKneeAngle)}°`}｜平均每次時間：${s.averageRepDuration == null ? "-" : `${(s.averageRepDuration / 1000).toFixed(1)}秒`}</div><div class="small" style="margin-top:6px;"><b>AI 建議：</b>${record.remark || "—"}</div><div class="small" style="margin-top:8px; color:#888;">動作品質分數（prototype）：${score ?? "—"} 分（${record.quality || "—"}）</div><div class="small" style="margin-top:4px; color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details>
  </div>`;
}

function renderLe05AnalysisResult(record){const s=record.summary||{},total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,score=record.score??record.overallScore??null,reached=target>0&&total>=target,tracking=s.trackingInterruptionCount??s.repsWithTrackingGap??0,xp=gamificationEngine.computeSessionXp(record),level=gamificationEngine.getPatientLevel(record.patientId);
const issues=[s.incompleteStandCount>0?{count:s.incompleteStandCount,code:LE05_QUALITY_ISSUE.INCOMPLETE_STAND}:null,s.excessiveTrunkLeanCount>0?{count:s.excessiveTrunkLeanCount,code:LE05_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN}:null,s.kneeValgusCount>0?{count:s.kneeValgusCount,code:LE05_QUALITY_ISSUE.KNEE_VALGUS}:null,s.asymmetryCount>0?{count:s.asymmetryCount,code:LE05_QUALITY_ISSUE.ASYMMETRY}:null,s.tooFastCount>0?{count:s.tooFastCount,code:LE05_QUALITY_ISSUE.TOO_FAST}:null,s.fastDescentCount>0?{count:s.fastDescentCount,code:LE05_QUALITY_ISSUE.FAST_DESCENT}:null].filter(Boolean).sort((a,b)=>b.count-a.count).slice(0,3);
const feedback=issues.length?issues.map(i=>`<div class="result-feedback-row"><div class="small">↓ ${LE05_QUALITY_ISSUE_LABELS[i.code]} ×${i.count}</div><div class="small" style="color:#666;">${LE05_QUALITY_SUGGESTIONS[i.code]}</div></div>`).join(""):`<div class="small">這次沒有特別需要注意的地方，繼續保持！</div>`;const sub=total===0?"這次沒有偵測到完整的動作。":score!=null?`本次動作品質 ${score} 分${reached?"，做得很好！":"，再累積一些就更接近目標了。"}`:"繼續保持穩定的動作。";const breakdown=!xp.isLegacyFlatRate?renderXpBreakdownGrid(xp.breakdown):"";
return `<div class="detail-analysis-result"><div class="card result-hero">${renderRobot(reached?"celebrate":total>0?"happy":"encourage","sm")}<div class="result-hero-headline">今天完成 ${total} 次${reached?"！":""}</div><div class="small result-hero-sub">${sub}</div><div class="result-hero-badges">${xp.xp>0?`<span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="" />+${xp.xp} XP</span>`:""}${reached?`<span class="result-hero-badge"><img src="/images/gamification/star_sparkle.png" alt="" />目標達成</span>`:""}</div></div><div class="card" style="margin-top:10px;"><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">${total}<span class="result-summary-value-sep">/${target}</span></div><div class="small">完成</div></div><div class="result-summary-col"><div class="result-summary-value">${score!=null?`${score}<span class="result-summary-value-sep">/100</span>`:"-"}</div><div class="small">品質分數</div></div><div class="result-summary-col"><div class="result-summary-value">${tracking}</div><div class="small">追蹤中斷</div></div></div></div><div class="card result-feedback-card" style="margin-top:10px;"><div class="small result-feedback-title"><b>主要提醒</b></div>${feedback}</div><div class="card result-reward-card"><div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="" />本次獲得　+${xp.xp} XP</div><div class="result-reward-level-row small">Lv.${level.level}　${level.currentLevelXp} / ${level.nextLevelXp} XP</div><div class="result-reward-level-bar"><span style="width:${Math.round((level.currentLevelXp/level.nextLevelXp)*100)}%"></span></div>${breakdown}</div><details class="result-tech-details"><summary>詳細分析</summary><div class="small" style="margin-top:8px;">平均站立膝角度：${s.averageMaxKneeAngle==null?"-":`${Math.round(s.averageMaxKneeAngle)}°`}｜平均每次時間：${s.averageRepDuration==null?"-":`${(s.averageRepDuration/1000).toFixed(1)}秒`}</div><div class="small" style="margin-top:6px;"><b>AI 建議：</b>${record.remark||"—"}</div><div class="small" style="margin-top:8px;color:#888;">動作品質分數（prototype）：${score??"—"} 分（${record.quality||"—"}）</div><div class="small" style="margin-top:4px;color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details></div>`;}

function renderLe03AnalysisResult(record){const s=record.summary||{},total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,score=record.score??record.overallScore??null,reached=target>0&&total>=target,tracking=s.trackingInterruptionCount??s.repsWithTrackingGap??0,xp=gamificationEngine.computeSessionXp(record),level=gamificationEngine.getPatientLevel(record.patientId),issues=[s.insufficientLiftCount>0?{count:s.insufficientLiftCount,code:LE03_QUALITY_ISSUE.INSUFFICIENT_LIFT}:null,s.overextensionCount>0?{count:s.overextensionCount,code:LE03_QUALITY_ISSUE.OVEREXTENSION}:null,s.asymmetryCount>0?{count:s.asymmetryCount,code:LE03_QUALITY_ISSUE.ASYMMETRY}:null,s.tooFastCount>0?{count:s.tooFastCount,code:LE03_QUALITY_ISSUE.TOO_FAST}:null,s.fastLoweringCount>0?{count:s.fastLoweringCount,code:LE03_QUALITY_ISSUE.FAST_LOWERING}:null].filter(Boolean).sort((a,b)=>b.count-a.count).slice(0,3),feedback=issues.length?issues.map(i=>`<div class="result-feedback-row"><div class="small">↓ ${LE03_QUALITY_ISSUE_LABELS[i.code]} ×${i.count}</div><div class="small" style="color:#666;">${LE03_QUALITY_SUGGESTIONS[i.code]}</div></div>`).join(""):`<div class="small">這次沒有特別需要注意的地方，繼續保持！</div>`,sub=total===0?"這次沒有偵測到完整的動作。":score!=null?`本次動作品質 ${score} 分${reached?"，做得很好！":"，再累積一些就更接近目標了。"}`:"繼續保持穩定的動作。",breakdown=!xp.isLegacyFlatRate?renderXpBreakdownGrid(xp.breakdown):"";return `<div class="detail-analysis-result"><div class="card result-hero">${renderRobot(reached?"celebrate":total>0?"happy":"encourage","sm")}<div class="result-hero-headline">今天完成 ${total} 次${reached?"！":""}</div><div class="small result-hero-sub">${sub}</div><div class="result-hero-badges">${xp.xp>0?`<span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="" />+${xp.xp} XP</span>`:""}${reached?`<span class="result-hero-badge"><img src="/images/gamification/star_sparkle.png" alt="" />目標達成</span>`:""}</div></div><div class="card" style="margin-top:10px;"><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">${total}<span class="result-summary-value-sep">/${target}</span></div><div class="small">完成</div></div><div class="result-summary-col"><div class="result-summary-value">${score!=null?`${score}<span class="result-summary-value-sep">/100</span>`:"-"}</div><div class="small">品質分數</div></div><div class="result-summary-col"><div class="result-summary-value">${tracking}</div><div class="small">追蹤中斷</div></div></div></div><div class="card result-feedback-card" style="margin-top:10px;"><div class="small result-feedback-title"><b>主要提醒</b></div>${feedback}</div><div class="card result-reward-card"><div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="" />本次獲得　+${xp.xp} XP</div><div class="result-reward-level-row small">Lv.${level.level}　${level.currentLevelXp} / ${level.nextLevelXp} XP</div><div class="result-reward-level-bar"><span style="width:${Math.round((level.currentLevelXp/level.nextLevelXp)*100)}%"></span></div>${breakdown}</div><details class="result-tech-details"><summary>詳細分析</summary><div class="small" style="margin-top:8px;">平均最大髖角度：${s.averageMaxHipAngle==null?"-":`${Math.round(s.averageMaxHipAngle)}°`}｜平均每次時間：${s.averageRepDuration==null?"-":`${(s.averageRepDuration/1000).toFixed(1)}秒`}</div><div class="small" style="margin-top:6px;"><b>AI 建議：</b>${record.remark||"—"}</div><div class="small" style="margin-top:8px;color:#888;">動作品質分數（prototype）：${score??"—"} 分（${record.quality||"—"}）</div><div class="small" style="margin-top:4px;color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details></div>`;}

function renderLe04AnalysisResult(record){const s=record.summary||{},total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,score=record.score??record.overallScore??null,reached=target>0&&total>=target,tracking=s.trackingInterruptionCount??s.repsWithTrackingGap??0,xp=gamificationEngine.computeSessionXp(record),level=gamificationEngine.getPatientLevel(record.patientId),issues=[s.insufficientRaiseCount>0?{count:s.insufficientRaiseCount,code:LE04_QUALITY_ISSUE.INSUFFICIENT_RAISE}:null,s.excessiveRaiseCount>0?{count:s.excessiveRaiseCount,code:LE04_QUALITY_ISSUE.EXCESSIVE_RAISE}:null,s.kneeBendCount>0?{count:s.kneeBendCount,code:LE04_QUALITY_ISSUE.KNEE_BEND}:null,s.bodyRollCount>0?{count:s.bodyRollCount,code:LE04_QUALITY_ISSUE.BODY_ROLL}:null,s.tooFastCount>0?{count:s.tooFastCount,code:LE04_QUALITY_ISSUE.TOO_FAST}:null].filter(Boolean).sort((a,b)=>b.count-a.count).slice(0,3),feedback=issues.length?issues.map(i=>`<div class="result-feedback-row"><div class="small">↓ ${LE04_QUALITY_ISSUE_LABELS[i.code]} ×${i.count}</div><div class="small" style="color:#666;">${LE04_QUALITY_SUGGESTIONS[i.code]}</div></div>`).join(""):`<div class="small">這次沒有特別需要注意的地方，繼續保持！</div>`,sub=total===0?"這次沒有偵測到完整的動作。":score!=null?`本次動作品質 ${score} 分${reached?"，做得很好！":"，再累積一些就更接近目標了。"}`:"繼續保持穩定的動作。",breakdown=!xp.isLegacyFlatRate?renderXpBreakdownGrid(xp.breakdown):"";return `<div class="detail-analysis-result"><div class="card result-hero">${renderRobot(reached?"celebrate":total>0?"happy":"encourage","sm")}<div class="result-hero-headline">今天完成 ${total} 次${reached?"！":""}</div><div class="small result-hero-sub">${sub}</div><div class="result-hero-badges">${xp.xp>0?`<span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="" />+${xp.xp} XP</span>`:""}${reached?`<span class="result-hero-badge"><img src="/images/gamification/star_sparkle.png" alt="" />目標達成</span>`:""}</div></div><div class="card" style="margin-top:10px;"><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">${total}<span class="result-summary-value-sep">/${target}</span></div><div class="small">完成</div></div><div class="result-summary-col"><div class="result-summary-value">${score!=null?`${score}<span class="result-summary-value-sep">/100</span>`:"-"}</div><div class="small">品質分數</div></div><div class="result-summary-col"><div class="result-summary-value">${tracking}</div><div class="small">追蹤中斷</div></div></div></div><div class="card result-feedback-card" style="margin-top:10px;"><div class="small result-feedback-title"><b>主要提醒</b></div>${feedback}</div><div class="card result-reward-card"><div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="" />本次獲得　+${xp.xp} XP</div><div class="result-reward-level-row small">Lv.${level.level}　${level.currentLevelXp} / ${level.nextLevelXp} XP</div><div class="result-reward-level-bar"><span style="width:${Math.round((level.currentLevelXp/level.nextLevelXp)*100)}%"></span></div>${breakdown}</div><details class="result-tech-details"><summary>詳細分析</summary><div class="small" style="margin-top:8px;">平均最低髖角度：${s.averageMinHipAngle==null?"-":`${Math.round(s.averageMinHipAngle)}°`}｜平均每次時間：${s.averageRepDuration==null?"-":`${(s.averageRepDuration/1000).toFixed(1)}秒`}</div><div class="small" style="margin-top:6px;"><b>AI 建議：</b>${record.remark||"—"}</div><div class="small" style="margin-top:8px;color:#888;">左右完成：${s.leftReps||0} / ${s.rightReps||0}｜動作品質分數：${score??"—"} 分</div><div class="small" style="margin-top:4px;color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div></details></div>`;}

function renderAnalysisResultSection(record, ex) {
  if (record.analysisMode === LE04_ANALYSIS_MODE) return renderLe04AnalysisResult(record);
  if (record.analysisMode === LE03_ANALYSIS_MODE) return renderLe03AnalysisResult(record);
  if (record.analysisMode === LE05_ANALYSIS_MODE) return renderLe05AnalysisResult(record);
  if (record.analysisMode === KN03_ANALYSIS_MODE) return renderKn03AnalysisResult(record);
  if (record.analysisMode === SQUAT_ANALYSIS_MODE) {
    const s = record.summary || {};
    const fmtDeg = (v) => (v == null ? "-" : `${Math.round(v)}°`);
    const fmtSec = (ms) => (ms == null ? "-" : `${(ms / 1000).toFixed(1)}秒`);
    const totalReps = record.totalReps || 0;
    const targetReps = record.targetReps || 0;
    const qualityValidReps = record.validReps || 0;
    const qualityRatio = calculateQualityRatioPercent(totalReps, qualityValidReps);
    const targetReached = targetReps > 0 && totalReps >= targetReps;

    // Computed early so the Hero (section 16) can show a light XP/quality
    // preview badge alongside the completion headline, not just below it.
    const xpResult = gamificationEngine.computeSessionXp(record);
    const gaminfo = gamificationEngine.getPatientLevel(record.patientId);

    // ---- Hero (section 16) ----
    // Never claims "目標達成" language unless the target was actually
    // reached — an honest, still-encouraging phrasing otherwise.
    const heroRobotState = targetReached ? "celebrate" : totalReps > 0 ? "happy" : "encourage";
    const heroHeadline = targetReps > 0
      ? (targetReached ? `今天完成 ${totalReps} 次！` : `今天完成 ${totalReps} 次`)
      : `今天完成 ${totalReps} 次`;
    const heroSub = totalReps === 0
      ? "這次沒有偵測到完整的動作。"
      : targetReached
      ? (qualityRatio != null ? `${qualityRatio}% 的動作符合目前品質條件，做得很好！` : "做得很好！")
      : (qualityRatio != null ? `${qualityRatio}% 的動作符合目前品質條件，再累積一些就更接近目標了。` : "再累積一些就更接近目標了。");

    // ---- Compact 3-column summary (section 17) ----
    const summaryHtml = `<div class="result-summary-row">
      <div class="result-summary-col"><div class="result-summary-value">${totalReps}<span class="result-summary-value-sep">/${targetReps}</span></div><div class="small">完成</div></div>
      <div class="result-summary-col"><div class="result-summary-value">${qualityRatio != null ? qualityRatio + "%" : "-"}</div><div class="small">品質</div></div>
      <div class="result-summary-col"><div class="result-summary-value">${s.repsWithTrackingGap || 0}</div><div class="small">追蹤中斷</div></div>
    </div>`;

    // ---- Main feedback card (section 18): top 2-3 issues, friendly copy ----
    const issueEntries = [
      s.insufficientDepthCount > 0 ? { count: s.insufficientDepthCount, code: SQUAT_QUALITY_ISSUE.INSUFFICIENT_DEPTH } : null,
      s.trunkLeanCount > 0 ? { count: s.trunkLeanCount, code: SQUAT_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN } : null,
      s.kneeValgusCount > 0 ? { count: s.kneeValgusCount, code: SQUAT_QUALITY_ISSUE.KNEE_VALGUS_SUSPECTED } : null,
    ].filter(Boolean).sort((a, b) => b.count - a.count).slice(0, 3);
    const feedbackHtml = issueEntries.length
      ? issueEntries
          .map(
            (i) =>
              `<div class="result-feedback-row"><div class="small">↓ ${SQUAT_QUALITY_ISSUE_LABELS[i.code]} ×${i.count}</div><div class="small" style="color:#666;">${SQUAT_QUALITY_ISSUE_SUGGESTIONS[i.code]}</div></div>`
          )
          .join("")
      : `<div class="small">這次沒有特別需要注意的地方，繼續保持！</div>`;

    // ---- Reward card (report section 15/H) — compact icon grid, not a
    // stacked report-style list; total XP stays the largest number. ----
    const xpBreakdownGridHtml = !xpResult.isLegacyFlatRate ? renderXpBreakdownGrid(xpResult.breakdown) : "";
    const rewardHtml = `<div class="card result-reward-card">
      <div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="" />本次獲得　+${xpResult.xp} XP</div>
      <div class="result-reward-level-row small">Lv.${gaminfo.level}　${gaminfo.currentLevelXp} / ${gaminfo.nextLevelXp} XP</div>
      <div class="result-reward-level-bar"><span style="width:${Math.round((gaminfo.currentLevelXp / gaminfo.nextLevelXp) * 100)}%"></span></div>
      ${xpBreakdownGridHtml}
    </div>`;

    // ---- Technical details (section 21): collapsed by default, data preserved not deleted ----
    const techDetailsHtml = `<details class="result-tech-details">
      <summary>詳細分析</summary>
      <div class="small" style="margin-top:8px;">平均最低膝角度：${fmtDeg(s.averageMinKneeAngle)}｜平均每次時間：${fmtSec(s.averageRepDuration)}</div>
      <div class="small" style="margin-top:6px;"><b>AI 建議：</b>${record.remark}</div>
      <div class="small" style="margin-top:8px; color:#888;">動作品質分數（prototype）：${record.score} 分（${record.quality}）</div>
      <div class="small" style="margin-top:4px; color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div>
    </details>`;

    const heroBadgesHtml = `<div class="result-hero-badges">
      ${xpResult.xp > 0 ? `<span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="" />+${xpResult.xp} XP</span>` : ""}
      ${targetReached ? `<span class="result-hero-badge"><img src="/images/gamification/star_sparkle.png" alt="" />目標達成</span>` : ""}
    </div>`;

    return `<div class="detail-analysis-result">
      <div class="card result-hero">
        ${renderRobot(heroRobotState, "sm")}
        <div class="result-hero-headline">${heroHeadline}</div>
        <div class="small result-hero-sub">${heroSub}</div>
        ${heroBadgesHtml}
      </div>
      <div class="card" style="margin-top:10px;">${summaryHtml}</div>
      <div class="card result-feedback-card" style="margin-top:10px;">
        <div class="small result-feedback-title"><b>主要提醒</b></div>
        ${feedbackHtml}
      </div>
      ${rewardHtml}
      ${techDetailsHtml}
    </div>`;
  }
  if (record.analysisMode === CR05_ANALYSIS_MODE) {
    const s = record.summary || {};
    const fmtDeg = (v) => (v == null ? "-" : `${Math.round(v)}°`);
    const fmtSec = (ms) => (ms == null ? "-" : `${(ms / 1000).toFixed(1)}秒`);
    const totalReps = s.totalReps ?? record.totalReps ?? 0;
    const targetReps = s.targetReps ?? record.targetReps ?? 0;
    const qualityValidReps = s.qualityValidReps ?? record.validReps ?? 0;
    const qualityRatio = calculateQualityRatioPercent(totalReps, qualityValidReps);
    const detectedScore = record.score ?? record.overallScore ?? null;
    const trackingCount = s.trackingInterruptionCount ?? s.repsWithTrackingGap ?? 0;
    const targetReached = targetReps > 0 && totalReps >= targetReps;
    const xpResult = gamificationEngine.computeSessionXp(record);
    const gaminfo = gamificationEngine.getPatientLevel(record.patientId);
    const heroRobotState = targetReached ? "celebrate" : totalReps > 0 ? "happy" : "encourage";
    const heroHeadline = targetReps > 0
      ? (targetReached ? `今天完成 ${totalReps} 次！` : `今天完成 ${totalReps} 次`)
      : `今天完成 ${totalReps} 次`;
    const heroSub = totalReps === 0
      ? "這次沒有偵測到完整的動作。"
      : targetReached
      ? (detectedScore != null ? `本次動作品質 ${detectedScore} 分，做得很好！` : "做得很好！")
      : (detectedScore != null ? `本次動作品質 ${detectedScore} 分，再累積一些就更接近目標了。` : "再累積一些就更接近目標了。");
    const summaryHtml = `<div class="result-summary-row">
      <div class="result-summary-col"><div class="result-summary-value">${totalReps}<span class="result-summary-value-sep">/${targetReps}</span></div><div class="small">完成</div></div>
      <div class="result-summary-col"><div class="result-summary-value">${detectedScore != null ? `${detectedScore}<span class="result-summary-value-sep">/100</span>` : "-"}</div><div class="small">品質分數</div></div>
      <div class="result-summary-col"><div class="result-summary-value">${trackingCount}</div><div class="small">追蹤中斷</div></div>
    </div>`;
    const issueEntries = [
      s.insufficientRaiseCount > 0 ? { count: s.insufficientRaiseCount, code: CR05_QUALITY_ISSUE.INSUFFICIENT_RAISE } : null,
      s.excessiveTrunkLeanCount > 0 ? { count: s.excessiveTrunkLeanCount, code: CR05_QUALITY_ISSUE.EXCESSIVE_TRUNK_LEAN } : null,
      s.rhythmIssueCount > 0 ? { count: s.rhythmIssueCount, code: CR05_QUALITY_ISSUE.RHYTHM } : null,
      s.tooFastCount > 0 ? { count: s.tooFastCount, code: CR05_QUALITY_ISSUE.TOO_FAST } : null,
    ].filter(Boolean).sort((a, b) => b.count - a.count).slice(0, 3);
    const feedbackHtml = issueEntries.length
      ? issueEntries.map((i) => `<div class="result-feedback-row"><div class="small">↓ ${CR05_QUALITY_ISSUE_LABELS[i.code]} ×${i.count}</div><div class="small" style="color:#666;">${CR05_QUALITY_SUGGESTIONS[i.code]}</div></div>`).join("")
      : `<div class="small">這次沒有特別需要注意的地方，繼續保持！</div>`;
    const xpBreakdownGridHtml = !xpResult.isLegacyFlatRate ? renderXpBreakdownGrid(xpResult.breakdown) : "";
    const rewardHtml = `<div class="card result-reward-card">
      <div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="" />本次獲得　+${xpResult.xp} XP</div>
      <div class="result-reward-level-row small">Lv.${gaminfo.level}　${gaminfo.currentLevelXp} / ${gaminfo.nextLevelXp} XP</div>
      <div class="result-reward-level-bar"><span style="width:${Math.round((gaminfo.currentLevelXp / gaminfo.nextLevelXp) * 100)}%"></span></div>
      ${xpBreakdownGridHtml}
    </div>`;
    const techDetailsHtml = `<details class="result-tech-details">
      <summary>詳細分析</summary>
      <div class="small" style="margin-top:8px;">平均最低髖角度：${fmtDeg(s.averageMinHipAngle)}｜平均每次時間：${fmtSec(s.averageRepDuration)}</div>
      <div class="small" style="margin-top:6px;"><b>AI 建議：</b>${record.remark || "—"}</div>
      <div class="small" style="margin-top:8px; color:#888;">動作品質分數（prototype）：${record.score ?? record.overallScore ?? "—"} 分（${record.quality || "—"}）</div>
      <div class="small" style="margin-top:4px; color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生的 prototype 動作品質評估，非醫療診斷。</div>
    </details>`;
    const heroBadgesHtml = `<div class="result-hero-badges">${xpResult.xp > 0 ? `<span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="" />+${xpResult.xp} XP</span>` : ""}${targetReached ? `<span class="result-hero-badge"><img src="/images/gamification/star_sparkle.png" alt="" />目標達成</span>` : ""}</div>`;
    return `<div class="detail-analysis-result">
      <div class="card result-hero">${renderRobot(heroRobotState, "sm")}<div class="result-hero-headline">${heroHeadline}</div><div class="small result-hero-sub">${heroSub}</div>${heroBadgesHtml}</div>
      <div class="card" style="margin-top:10px;">${summaryHtml}</div>
      <div class="card result-feedback-card" style="margin-top:10px;"><div class="small result-feedback-title"><b>主要提醒</b></div>${feedbackHtml}</div>
      ${rewardHtml}
      ${techDetailsHtml}
    </div>`;
  }
  return `<div class="detail-analysis-result"><div class="card"><div><b>品質分數：</b>${record.score} 分（${record.quality}）</div><div class="small" style="margin-top:6px;"><b>AI 建議：</b>${record.remark}</div></div></div>`;
}

/**
 * Phase 4 — lightweight, one-shot completion feedback (spec section 13):
 * a small panel, never a blocking full-screen modal. Stronger celebration
 * only for real milestones (level up / achievement unlocked / today's
 * structured work all done), still inline, still non-blocking.
 */
function renderRewardFeedbackPanel(feedback) {
  if (!feedback) return "";
  const milestoneHtml = [
    feedback.leveledUp
      ? `<div class="reward-milestone-row"><img src="/images/gamification/star_gold.png" alt="" />升級了！Lv.${feedback.newLevel} ${feedback.newLevelTitle}</div>`
      : "",
    feedback.newAchievements
      .map((a) => `<div class="reward-milestone-row"><img src="${a.icon}" alt="" />解鎖成就：${a.title}</div>`)
      .join(""),
    feedback.allDone
      ? `<div class="reward-milestone-row"><img src="/images/gamification/celebration_confetti.png" alt="" />今天的復健完成了，做得很好！</div>`
      : "",
  ]
    .filter(Boolean)
    .join("");
  const robotState = feedback.leveledUp || feedback.allDone || feedback.newAchievements.length ? "celebrate" : "success";
  // Phase 5.4.2/5.4.3 — only bonuses actually earned get their own line
  // (report section 17: never show a "completion bonus" line if the target
  // wasn't reached). Sessions with no breakdown data (legacy flat-rate
  // records) just show the single total, same as before.
  const b = feedback.xpBreakdown;
  const breakdownHtml = b && !feedback.xpIsLegacyFlatRate ? renderXpBreakdownGrid(b) : "";
  // Phase 5.4.3 anti-exploit (report section 12/16/26 TEST P) — a 0-rep
  // session earns 0 XP; the panel must not visually claim a reward for it.
  if (feedback.xpGained === 0 && !feedback.xpIsLegacyFlatRate) {
    return `<div class="card reward-feedback-panel">
      <div class="reward-feedback-row">${renderRobot("idle", "sm")}<div><b>本次沒有偵測到有效的動作</b><div class="small">因此這次沒有獲得 XP，再試一次吧！</div></div></div>
    </div>`;
  }
  return `<div class="card reward-feedback-panel">
    <div class="reward-feedback-row">${renderRobot(robotState, "sm")}<div><b>✓ 完成一項練習</b><div class="small reward-xp-line"><img class="reward-xp-icon" src="/images/gamification/xp_coin.png" alt="" />本次獲得 +${feedback.xpGained} XP</div></div></div>
    ${breakdownHtml}
    ${milestoneHtml}
  </div>`;
}

function exerciseDetailPage() {
  const context = getExercisePageContext();
  if (!context) return state.exerciseContext === "self_practice" ? selfPracticeLibraryPage() : todaySchedulePage();
  const { mode, schedule, ex, catalog } = context;

  let rewardFeedbackHtml = "";
  if (state.rewardFeedback) {
    rewardFeedbackHtml = renderRewardFeedbackPanel(state.rewardFeedback);
    state.rewardFeedback = null;
  }

  const statusText = SCHEDULE_STATUS_LABELS[ex.status] || "待開始";
  const statusClass = SCHEDULE_STATUS_CLASSES[ex.status] || "pending";
  const metricLabel = ex.repetitions != null ? "次數" : "秒數";
  const metricValue = ex.repetitions != null ? `${ex.repetitions}次` : (ex.durationSeconds != null ? `${ex.durationSeconds}秒` : "-");
  const isAssigned = mode === "assigned";

  const ctaLabel = isAssigned && ex.status === "completed" ? "查看分析結果" : ex.status === "in_progress" ? "繼續 AI 動作偵測" : "開始 AI 動作偵測";
  const ctaButtonHtml = isAssigned && ex.status === "completed"
    ? `<button class="pill done-status" disabled>${ctaLabel}</button>`
    : `<button class="btn btn-primary full" onclick="goDetectionPrep()">${ctaLabel}</button>`;

  const returnRoute = getExerciseReturnRoute("listing");
  const backFn = returnRoute.fn;
  const backLabel = returnRoute.label;
  const sourceTagHtml = isAssigned
    ? `<span class="source-tag-badge assigned">復健師安排</span>`
    : state.navigationOrigin === "recommendation"
      ? `<span class="source-tag-badge recommendation">今日建議</span>`
      : `<span class="source-tag-badge self-practice">自主練習</span>`;

  let analysisResultHtml = "";
  if (isAssigned) {
    const analysisRecord = ex.status === "completed" && ex.analysisRecordId ? analysisService.getById(ex.analysisRecordId) : null;
    analysisResultHtml = analysisRecord ? renderAnalysisResultSection(analysisRecord, ex) : "";
  } else {
    // self_practice has no persisted "completed" flag (it's re-practiceable
    // any time), so instead show the most recent self-practice attempt for
    // this exercise, if one exists — never gates/disables the CTA.
    const recentRecord = analysisService
      .getByPatientId(state.user.id)
      .filter((r) => r.exerciseId === ex.exerciseId && getRecordSource(r) === "self_practice")
      .sort((a, b) => new Date(b.completedAt || b.createdAt || 0) - new Date(a.completedAt || a.createdAt || 0))[0];
    analysisResultHtml = recentRecord ? renderAnalysisResultSection(recentRecord, ex) : "";
  }

  return `
    <div class="header">
      <button class="btn btn-light detail-back-btn" onclick="${backFn}">返回</button>
      <b>動作詳情</b>
      ${isAssigned ? `<span class="pill ${statusClass}">${statusText}</span>` : ""}
    </div>
    ${rewardFeedbackHtml}
    <h2 style="margin:10px 0 2px;">${catalog.exercise_name || ex.exerciseName}</h2>
    <div class="small" style="margin-bottom:10px;">${[catalog.category, catalog.difficulty ? `難度：${catalog.difficulty}` : ""].filter(Boolean).join("｜")} ${sourceTagHtml}</div>

    ${renderVideoSection(catalog)}

    <div class="stats" style="margin-top:12px;">
      <div class="stat"><span class="small">組數</span><b>${ex.sets ?? "-"}組</b></div>
      <div class="stat"><span class="small">${metricLabel}</span><b>${metricValue}</b></div>
      <div class="stat"><span class="small">預計獎勵</span><b>+${ex.rewardXp || 0} XP</b></div>
    </div>

    ${renderDetailTextSection("目標肌群", catalog.target_muscle)}
    ${renderDetailTextSection("動作描述", catalog.description)}
    ${renderDetailGroupedCard("怎麼做", "/images/gamification/checkmark_01.png", [
      { label: "執行步驟", items: splitToListItems(catalog.steps), ordered: true },
      { label: "動作重點", items: splitToListItems(catalog.key_points), ordered: false },
    ])}
    ${renderDetailGroupedCard("注意什麼", null, [
      { label: "常見錯誤", items: splitToListItems(catalog.common_errors), ordered: false },
      { label: "注意事項", items: splitToListItems(catalog.precautions), ordered: false },
    ])}
    ${catalog.reference_source && catalog.reference_source !== "待補" ? `<h3 class="section-title">資料來源</h3><div class="card"><div class="small">${catalog.reference_source}</div></div>` : ""}
    ${analysisResultHtml}

    ${ctaButtonHtml}
    <button class="btn btn-light full" onclick="${backFn}">${backLabel}</button>
  `;
}

function detectionPrepPage() {
  const context = getExercisePageContext();
  if (!context) return state.exerciseContext === "self_practice" ? selfPracticeLibraryPage() : todaySchedulePage();
  const { mode, schedule, ex, catalog } = context;

  const cameraAngleText = catalog.cameraAngle && catalog.cameraAngle !== "unspecified"
    ? catalog.cameraAngle
    : "尚未指定拍攝角度";
  // Phase 5.6.1 — widened from isSquat-only to "does this exercise have a
  // real pose analyzer at all" so the notice text/checklist/upload-button
  // stay accurate for HP02 too, without redesigning this page. The exact
  // wording still differs per analyzer so HP02's prototype status is never
  // overclaimed as a finished feature.
  const poseAnalyzer = resolvePoseAnalyzer(catalog) || resolvePoseAnalyzer(ex);
  const isSquat = poseAnalyzer === POSE_ANALYZER.SQUAT;
  const hasPoseAnalyzer = poseAnalyzer != null;
  const isCr05 = poseAnalyzer === POSE_ANALYZER.CR05_SEATED_KNEE_RAISE;
  const isKn03 = poseAnalyzer === POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION;
  const isLe05 = poseAnalyzer === POSE_ANALYZER.LE05_SIT_TO_STAND;
  const isLe03 = poseAnalyzer === POSE_ANALYZER.LE03_BRIDGE;
  const isLe04 = poseAnalyzer === POSE_ANALYZER.LE04_SIDE_LEG_RAISE;
  const isLe06 = poseAnalyzer === POSE_ANALYZER.LE06_BALANCE;
  const isLe07 = poseAnalyzer === POSE_ANALYZER.LE07_CALF_RAISE;
  const isSh01 = poseAnalyzer === POSE_ANALYZER.SH01_SHOULDER_PENDULUM;
  const isSh02 = poseAnalyzer === POSE_ANALYZER.SH02_EXTERNAL_ISOMETRIC;
  const isSh03 = poseAnalyzer === POSE_ANALYZER.SH03_INTERNAL_ISOMETRIC;
  const isHp04 = poseAnalyzer === POSE_ANALYZER.HP04_HIP_ABDUCTION;
  const isHp05 = poseAnalyzer === POSE_ANALYZER.HP05_HIP_ADDUCTION;
  const isHp06 = poseAnalyzer === POSE_ANALYZER.HP06_CLAMSHELL;
  const isLe02 = poseAnalyzer === POSE_ANALYZER.LE02_STRAIGHT_LEG_RAISE;
  const analysisItemsTitle = isSquat || isLe02 || isCr05 || isKn03 || isLe05 || isLe03 || isLe04 || isLe06 || isLe07 || isSh01 || isSh02 || isSh03 || isHp04 || isHp05 || isHp06 ? "AI 分析項目" : "展示分析項目";
  const analysisNoticeHtml =
    poseAnalyzer === POSE_ANALYZER.SQUAT
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">深蹲已支援真實 MediaPipe 動作偵測，開啟鏡頭後將即時分析您的動作。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.HP02_HIP_FLEXION
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">此動作目前為 Pose Analysis 架構原型（Phase 5.6.1），開啟鏡頭後僅顯示追蹤狀態與角度數值，尚未提供計次／評分／回饋，非正式訓練功能。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.CR05_SEATED_KNEE_RAISE
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">坐姿抬膝已支援即時骨架、左右交替計次、軀幹穩定提醒與原型評分。請將攝影機固定在身體正前方，讓肩膀、髖部與雙膝完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">坐姿膝伸直已支援左右交替計次、膝伸直角度、軀幹與大腿穩定提醒及 0–100 分品質評估。請讓肩膀、髖部、雙膝與腳踝完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.LE05_SIT_TO_STAND
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">坐站已支援完整起身與坐下計次、膝蓋方向、軀幹、左右對稱與速度提醒，以及 0–100 分品質評估。請固定椅子並讓全身完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.LE03_BRIDGE
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">橋式已支援抬臀與放下計次、髖部角度、骨盆對稱與速度提醒，以及 0–100 分品質評估。請從側面或斜側面拍攝，讓肩膀、髖部與雙膝完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.LE04_SIDE_LEG_RAISE
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">側抬腿已支援左右腿計次、抬腿角度、膝蓋伸直、骨盆穩定與速度提醒，以及 0–100 分品質評估。請採側躺並讓肩膀、髖部、膝蓋與腳踝完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.LE06_BALANCE
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">平衡訓練已支援 30 秒計時、重心晃動、軀幹側傾、疑似跨步補償與追蹤中斷分析，以及 0–100 分品質評估。請從正面拍攝並讓全身完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.LE07_CALF_RAISE
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">踮腳已支援完整踮起與下降計次、腳跟高度、左右對稱、膝蓋與軀幹穩定提醒，以及 0–100 分品質評估。請從正面拍攝並讓全身與雙腳完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.SH01_SHOULDER_PENDULUM
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">肩關節擺盪已支援擺動週期、幅度、手臂放鬆、軀幹前傾、聳肩與速度提醒，以及 0–100 分品質評估。請從側面或斜側面拍攝，讓上半身與雙手完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.SH02_EXTERNAL_ISOMETRIC
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">肩外旋等長收縮已支援每次 6 秒維持、手肘角度與貼身程度、前臂位移、軀幹旋轉與聳肩提醒，以及 0–100 分品質評估。MediaPipe 評估可見姿勢，無法直接量測肌肉出力。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.SH03_INTERNAL_ISOMETRIC
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">肩內旋等長收縮已支援每次 6 秒維持、手肘角度與貼身程度、前臂位移、身體前傾／旋轉與聳肩提醒，以及 0–100 分品質評估。MediaPipe 評估可見姿勢，無法直接量測肌肉出力。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.HP04_HIP_ABDUCTION
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">側躺髖外展已支援左右腿計次、30°～45°外展角度、膝蓋伸直、骨盆穩定與速度提醒，以及 0–100 分品質評估。請從側面或斜側面拍攝並讓肩、髖、膝與腳踝完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.HP05_HIP_ADDUCTION
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">側躺髖內收已支援下側腿與左右計次、20°～30°內收角度、膝蓋伸直、骨盆穩定與速度提醒，以及 0–100 分品質評估。請從側面或斜側面拍攝並讓肩、髖、膝與腳踝完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.HP06_CLAMSHELL
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">蚌殼式已支援膝蓋開合與左右計次、雙腳接觸、膝屈約 90°、骨盆穩定與速度提醒，以及 0–100 分品質評估。請讓肩、髖、雙膝與腳踝完整入鏡。</p></div></div>`
      : poseAnalyzer === POSE_ANALYZER.LE02_STRAIGHT_LEG_RAISE
      ? `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">仰躺直腿抬腿已支援左右腿計次、抬腿高度、膝蓋伸直、骨盆穩定與速度提醒，以及 0–100 分品質評估。請從側面或斜側面拍攝並讓肩、髖、膝與腳踝完整入鏡。</p></div></div>`
      : `<div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">目前其他動作尚未支援即時 AI 動作辨識，以上為展示分析項目。</p></div></div>`;
  const backFn = getExerciseReturnRoute("detail").fn;

  return `
    <div class="header">
      <button class="btn btn-light detail-back-btn" onclick="${backFn}">返回</button>
      <b>AI 動作偵測</b>
      <img class="icon" src="/images/ai_robot.png" alt="AI" />
    </div>
    <h2 style="margin:10px 0;">${catalog.exercise_name || ex.exerciseName}</h2>

    <h3 class="section-title">拍攝角度</h3>
    <div class="card"><div class="small">${cameraAngleText}</div></div>

    <h3 class="section-title">開始前確認</h3>
    <div class="card" style="display:grid; gap:10px;">
      <label class="check-row"><input type="checkbox" /> 全身完整入鏡</label>
      <label class="check-row"><input type="checkbox" /> 光線充足</label>
      <label class="check-row"><input type="checkbox" /> 攝影機固定</label>
    </div>

    ${renderDetailListSection("注意事項", catalog.precautions)}

    <h3 class="section-title">${analysisItemsTitle}</h3>
    <div class="card" style="display:grid; gap:8px;">
      <div class="small">✓ 身體骨架</div>
      <div class="small">✓ 關節角度</div>
      <div class="small">✓ 動作品質</div>
      <div class="small">✓ AI 建議</div>
    </div>
    ${analysisNoticeHtml}

    <button class="btn btn-primary full" onclick="openCameraPlaceholder()">開啟鏡頭</button>
    ${hasPoseAnalyzer ? "" : `<button class="btn btn-light full" onclick="openUploadPlaceholder()">上傳影片</button>`}
    <button class="btn btn-light full" onclick="${backFn}">返回動作詳情</button>
  `;
}

// ─────────────────────────────────────────────────────────────────────────
// AI 深蹲偵測（唯一支援真實 MediaPipe 辨識的動作）。Everything below is
// scoped to "LE01 深蹲" only — openCameraPlaceholder() below is the gate
// that keeps every other exercise on the old demo-only detectionPrepPage.
// ─────────────────────────────────────────────────────────────────────────

const SQUAT_STATE_LABELS = { standing: "站立", descending: "下蹲中", bottom: "蹲低", ascending: "起立中" };

// Runtime-only session state for the live camera page. Deliberately kept
// out of `state` (which drives re-renders): a full render() would tear
// down the live <video>/<canvas> and force re-acquiring the camera, so all
// per-frame updates below patch the DOM directly instead.
let squatCameraController = null;
let squatSessionTracker = null;
let squatCountdownIntervalId = null;
let squatCanvasCtx = null;
let squatCountingStarted = false;
let squatSessionFinalized = false;
let squatSessionMeta = null; // { scheduleId, exerciseIndex, exerciseId, exerciseName, targetReps, rewardXp }
// Phase 5.1 — debug-mode-only state. squatDebugModeOn defaults off in every
// new session; squatFrameTimestamps is a small rolling window used purely
// to estimate an approximate inference FPS for the debug panel.
let squatDebugModeOn = false;
let squatFrameTimestamps = [];
// Phase 5.2 — dropout-smoothed detection state (js/ai/detectionStability.js),
// recreated fresh for every camera session in beginSquatCameraSession().
let squatDetectionStability = null;
// Phase 5.2 — countdown may only begin once the model has finished loading
// AND the smoothed detection state is READY (section 7); squatModelReady
// tracks the former, squatCountdownActive the latter's in-progress timer so
// a sustained readiness loss mid-countdown can cancel it instead of letting
// rep counting start on nobody.
let squatModelReady = false;
let squatCountdownActive = false;
// Phase 5.2 — last completed rep's duration, surfaced only in Debug Mode.
let squatLastRepDurationMs = null;
// Phase 5.3 — real-time feedback + voice state, recreated fresh for every
// camera session in beginSquatCameraSession().
let squatFeedbackStability = null;
let squatVoicePolicy = null;
let squatLastRepIssues = null; // qualityIssues[] from the most recently completed rep, or null
let squatLastRepCompletedAt = null;
let squatLastSpokenPriority = null; // priority of the utterance currently in flight, for interrupt gating
// Default ON — voice is meant to help patients training at a distance from
// the device, but is always visible-first (see toggleSquatVoice()) and the
// patient can turn it off at any time; the visual UI never depends on it.
let squatVoiceEnabled = true;
const squatSpeechSupported = typeof window !== "undefined" && typeof window.speechSynthesis !== "undefined" && typeof SpeechSynthesisUtterance !== "undefined";
// Phase 5.4.2 — best-available zh-TW voice, selected once voices load (see
// initSquatVoiceSelection()). null means "let the browser use its default".
let squatSelectedVoice = null;
// Phase 5.4.2 — architecture placeholder only (report section 11): no music
// UI, no audio files. Kept false and unused until a real, licensed music
// asset + a proper on/off setting are added in a future phase.
const squatMusicEnabled = false;

// Phase 5.4.2 — content/variation + milestone + trunk-lean-instrumentation
// state, all recreated fresh per camera session in beginSquatCameraSession().
let squatFeedbackContentSelector = null;
let squatLastDisplayedFeedbackId = null;
let squatCurrentFeedbackText = "";
let squatCurrentFeedbackIcon = null;
let squatCurrentMilestone = null;
let squatMilestoneAt = null;
let squatCurrentRobotState = "idle";
// Debug-only trunk-lean instrumentation (report section 18/14): never shown
// in the formal UI, only surfaced in Debug Mode so a real-device test can
// directly compare "normal squat" vs "deliberately leaning" max values
// without touching TRUNK_LEAN_MAX_DEG itself.
let squatCurrentTrunkLeanDeg = null;
let squatMaxTrunkLeanThisRep = null;
// Phase 5.4.3 — milestone fire-once tracker, recreated/cleared fresh per
// camera session in beginSquatCameraSession().
let squatMilestoneTracker = null;

// Phase 5.4.4 — explicit UI-level Training Experience State (see
// js/ai/shared/trainingState.js). Separate from squatSessionTracker's
// biomechanical rep state (standing/descending/bottom/ascending) — this
// one drives what the PAGE shows, never MediaPipe/rep-counting rules.
let squatTrainingState = SQUAT_TRAINING_STATE.LOADING;
// READY is held briefly before countdown starts (report section 3) instead
// of jumping straight to "3" the instant a full body is detected.
let squatReadyHoldTimeoutId = null;
// Reveals the persistent SUCCESS/INCOMPLETE card after the brief entrance
// animation finishes (report section 12/13). Renamed/repurposed from Phase
// 5.4.3's squatCelebrationTimeoutId, which used to just auto-HIDE the
// overlay; now it reveals a card that stays until the patient acts.
let squatEndingRevealTimeoutId = null;
// Returns the MILESTONE experience state to ACTIVE after its badge duration.
let squatMilestoneStateTimeoutId = null;
// Hides the milestone badge itself (separate from the state-revert timer
// above) so it disappears reliably even under prefers-reduced-motion, where
// the CSS fade-out animation that would normally clear it is disabled.
let squatMilestoneBadgeTimeoutId = null;

function calculateSquatTargetReps(ex) {
  const sets = ex.sets && ex.sets > 0 ? ex.sets : 1;
  const reps = ex.repetitions && ex.repetitions > 0 ? ex.repetitions : 1;
  return sets * reps;
}

function squatDetectionPage() {
  // squatSessionMeta (set by goSquatDetection() just before this page is
  // rendered) is the source of truth for what's being trained, since it
  // already resolved assigned-vs-self_practice — re-resolving from
  // state.selectedScheduleId here would incorrectly fall through to
  // todaySchedulePage() for a self-practice session.
  const exerciseId = squatSessionMeta ? squatSessionMeta.exerciseId : state.selectedExerciseId;
  const catalog = exerciseService.getById(exerciseId) || {};
  const exerciseName = catalog.exercise_name || (squatSessionMeta ? squatSessionMeta.exerciseName : null) || "深蹲";
  const targetReps = squatSessionMeta ? squatSessionMeta.targetReps : 1;

  return `
    <div class="header">
      <button class="btn btn-light detail-back-btn" onclick="exitSquatDetection()">返回</button>
      <b>AI 深蹲偵測</b>
      <span class="squat-voice-toggle" id="squatVoiceToggle" onclick="toggleSquatVoice()" title="語音提示開關">語音：開</span>
      <span class="squat-debug-toggle" onclick="toggleSquatDebugMode()" title="偵錯模式">偵錯</span>
      <img class="icon" src="/images/ai_robot.png" alt="AI" />
    </div>
    <h2 style="margin:10px 0 4px;">${exerciseName}</h2>
    <div class="squat-camera-wrap" id="squatCameraWrap">
      <video id="squatVideo" class="squat-camera-video" playsinline muted autoplay></video>
      <canvas id="squatOverlayCanvas" class="squat-overlay-canvas"></canvas>
      <div class="squat-rep-counter" id="squatRepCounter">
        <svg class="squat-rep-ring" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
          <circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle>
          <circle class="squat-rep-ring-progress" id="squatRepRingProgress" cx="36" cy="36" r="30"></circle>
        </svg>
        <div class="squat-rep-counter-text">
          <span id="squatRepCounterValue">0</span><span class="squat-rep-counter-sep">/ ${targetReps}</span>
        </div>
      </div>
      <img class="squat-rep-sparkle" id="squatRepSparkle" src="/images/gamification/sparkle_03.png" alt="" />
      <div class="squat-readiness-indicator" id="squatReadinessIndicator"><span class="squat-readiness-dot" id="squatReadinessDot"></span><span id="squatReadinessText">尚未偵測</span></div>
      <div class="squat-milestone-badge" id="squatMilestoneBadge">
        <img id="squatMilestoneBadgeIcon" alt="" />
        <span id="squatMilestoneBadgeText"></span>
      </div>
      <div class="squat-countdown-overlay" id="squatCountdownOverlay" style="display:none;"><span id="squatCountdownText">3</span></div>
      <div class="squat-status-overlay" id="squatStatusOverlay">正在請求攝影機權限…</div>
      <img class="squat-robot-companion" id="squatRobotCompanion" src="/images/robot/robot_idle.png" alt="" style="display:none;" />
      <div class="squat-primary-feedback" id="squatPrimaryFeedback" style="display:none;">
        <img class="squat-primary-feedback-icon" id="squatPrimaryFeedbackIcon" alt="" style="display:none;" />
        <span id="squatPrimaryFeedbackText"></span>
      </div>
      <div class="squat-celebration-overlay" id="squatCelebrationOverlay">
        <img class="squat-celebration-confetti" id="squatCelebrationConfetti" src="/images/gamification/celebration_confetti.png" alt="" />
        <img class="squat-celebration-check" id="squatCelebrationCheck" src="/images/gamification/checkmark_02.png" alt="" />
        <div class="squat-celebration-text" id="squatCelebrationText"></div>
        <div class="squat-ending-card" id="squatEndingCard" style="display:none;">
          <div class="small" id="squatEndingSubtext"></div>
          <div class="squat-ending-badges" id="squatEndingBadges"></div>
          <button class="btn btn-primary" id="squatEndingCta" onclick="goSquatResultFromCamera()">查看成果</button>
        </div>
      </div>
    </div>
    <div class="card squat-debug-panel" id="squatDebugPanel" style="display:none;"></div>
    <div class="ai-box" id="squatAlertBox" style="display:none;"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text" id="squatAlertText"></p></div></div>
    <div class="small" style="margin:10px 0; color:#888;">本結果由 MediaPipe 人體關節點與規則式角度分析產生，非醫療診斷。</div>
    <div id="squatEndConfirmCard"></div>
    <button class="btn btn-primary full" id="squatEndBtn" onclick="requestEndSquatTraining()">結束訓練</button>
  `;
}

function goSquatDetection() {
  const context = getExercisePageContext();
  if (!context) {
    alert("找不到動作資訊，請重新進入。");
    if (state.exerciseContext === "assigned") return goSchedule();
    return state.navigationOrigin === "recommendation" ? goTodaysRecommendation() : goSelfPracticeLibrary();
  }
  const { mode, schedule, ex } = context;
  if (mode === "assigned" && ex.status === "completed") {
    return goExerciseDetail(schedule.id, state.selectedExerciseIndex);
  }
  // Self-practice records still carry a therapistId when the patient has
  // one, purely so a therapist can see it later — never required (a
  // patient with no therapist can still self-practice).
  const activeRelation = mode === "self_practice" ? relationService.findAcceptedByPatientId(state.user.id)[0] : null;
  squatSessionMeta = {
    mode,
    // Phase 3.1 — preserved purely for where finishing/exiting lands back
    // (recommendation vs self_practice); never affects analysisRecord.source.
    navigationOrigin: state.navigationOrigin,
    scheduleId: mode === "assigned" ? schedule.id : null,
    exerciseIndex: mode === "assigned" ? state.selectedExerciseIndex : null,
    exerciseId: ex.exerciseId,
    exerciseName: ex.exerciseName,
    patientId: state.user.id,
    therapistId: mode === "assigned" ? schedule.therapistId : (activeRelation ? activeRelation.therapistId : null),
    targetReps: calculateSquatTargetReps(ex),
    rewardXp: ex.rewardXp || DEFAULT_SQUAT_REWARD_XP,
  };
  squatSessionFinalized = false;
  squatCountingStarted = false;
  state.route = "squatDetection";
  render();
  beginSquatCameraSession();
}

function beginSquatCameraSession() {
  const videoEl = document.getElementById("squatVideo");
  const canvasEl = document.getElementById("squatOverlayCanvas");
  if (!videoEl || !canvasEl || !squatSessionMeta) return;
  // Phase 5.1 — defensive guard against duplicate camera streams/MediaPipe
  // loops: every normal exit path already calls stopSquatCamera() first,
  // but calling it again here unconditionally (it's a safe no-op when
  // there's nothing running) guarantees a fresh start can never overlap a
  // still-live controller, regardless of how this got invoked.
  stopSquatCamera();
  squatCanvasCtx = canvasEl.getContext("2d");
  squatSessionTracker = createSquatSession(squatSessionMeta.targetReps);
  squatFrameTimestamps = [];
  // Phase 5.5.2 — explicitly passes squat's own required-landmark set (see
  // js/ai/poseMath.js) rather than relying on the function's default, so
  // this call site stays correct even if the default ever changes for a
  // future exercise's sake.
  squatDetectionStability = createDetectionStabilityTracker(SQUAT_THRESHOLDS, SQUAT_REQUIRED_LANDMARKS);
  squatModelReady = false;
  squatCountdownActive = false;
  squatLastRepDurationMs = null;
  squatFeedbackStability = createFeedbackStabilityTracker();
  squatVoicePolicy = createVoicePolicyTracker();
  squatLastRepIssues = null;
  squatLastRepCompletedAt = null;
  squatLastSpokenPriority = null;
  updateSquatVoiceToggleUI();
  // Phase 5.4.2
  squatFeedbackContentSelector = createFeedbackContentSelector();
  squatLastDisplayedFeedbackId = null;
  squatCurrentFeedbackText = "";
  squatCurrentFeedbackIcon = null;
  squatCurrentMilestone = null;
  squatMilestoneAt = null;
  squatCurrentRobotState = "idle";
  squatCurrentTrunkLeanDeg = null;
  squatMaxTrunkLeanThisRep = null;
  squatMilestoneTracker = createMilestoneTracker();
  if (squatEndingRevealTimeoutId) {
    clearTimeout(squatEndingRevealTimeoutId);
    squatEndingRevealTimeoutId = null;
  }
  if (squatReadyHoldTimeoutId) {
    clearTimeout(squatReadyHoldTimeoutId);
    squatReadyHoldTimeoutId = null;
  }
  if (squatMilestoneStateTimeoutId) {
    clearTimeout(squatMilestoneStateTimeoutId);
    squatMilestoneStateTimeoutId = null;
  }
  if (squatMilestoneBadgeTimeoutId) {
    clearTimeout(squatMilestoneBadgeTimeoutId);
    squatMilestoneBadgeTimeoutId = null;
  }
  squatTrainingState = SQUAT_TRAINING_STATE.LOADING;
  resetSquatEndingScreen();
  initSquatVoiceSelection();

  squatCameraController = createSquatCameraController({
    videoEl,
    onStatus: handleSquatCameraStatus,
    onFrame: handleSquatFrame,
    onFatalError: handleSquatFatalError,
  });
  squatCameraController.start();
}

function retrySquatCamera() {
  if (state.route !== "squatDetection") return;
  const endBtn = document.getElementById("squatEndBtn");
  if (endBtn) {
    endBtn.textContent = "結束訓練";
    endBtn.setAttribute("onclick", "requestEndSquatTraining()");
  }
  const retryBtn = document.getElementById("squatRetryBtn");
  if (retryBtn) retryBtn.remove();
  setSquatStatusOverlay("正在請求攝影機權限…");
  beginSquatCameraSession();
}

function handleSquatCameraStatus(status) {
  if (state.route !== "squatDetection") return;
  if (status === "requesting-permission") {
    setSquatStatusOverlay("正在請求攝影機權限…");
  } else if (status === "loading-model") {
    setSquatStatusOverlay("AI 模型載入中，請稍候…");
  } else if (status === "ready") {
    // Phase 5.2 section 7 — do NOT start the countdown just because the
    // model finished loading. The next handleSquatFrame() call decides
    // whether to start it, gated on the smoothed detection state actually
    // being READY (i.e. a full body is really in frame), not merely on the
    // model being ready to run inference.
    squatModelReady = true;
    setSquatStatusOverlay("");
    squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.MODEL_READY);
  }
}

function handleSquatFatalError(message) {
  if (state.route !== "squatDetection") return;
  setSquatStatusOverlay(message);
  const endBtn = document.getElementById("squatEndBtn");
  if (endBtn) {
    endBtn.textContent = "返回";
    endBtn.setAttribute("onclick", "exitSquatDetection()");
  }
  // Phase 5.1 spec section 6 (STATE 4/5/6) — always offer a way to try
  // again in-page; if the browser genuinely can't re-prompt (e.g. a
  // permanently blocked permission), the retry attempt will just surface
  // the same honest error again rather than pretending to succeed.
  if (!document.getElementById("squatRetryBtn")) {
    const endBtn2 = document.getElementById("squatEndBtn");
    if (endBtn2 && endBtn2.parentNode) {
      const retryBtn = document.createElement("button");
      retryBtn.id = "squatRetryBtn";
      retryBtn.className = "btn btn-light full";
      retryBtn.style.marginBottom = "8px";
      retryBtn.textContent = "重新嘗試";
      retryBtn.setAttribute("onclick", "retrySquatCamera()");
      endBtn2.parentNode.insertBefore(retryBtn, endBtn2);
    }
  }
}

function setSquatStatusOverlay(text) {
  const el = document.getElementById("squatStatusOverlay");
  if (!el) return;
  el.textContent = text || "";
  el.style.display = text ? "flex" : "none";
}

// Phase 5.4.4 — how long the "準備好了" hold shows before the 3-2-1
// countdown begins (report section 3: "不要 READY 一瞬間直接 3"). Purely a
// UX pacing choice (Category C engineering tolerance), not clinical.
const SQUAT_READY_HOLD_MS = 800;

function showSquatCountdownVisual(text, kind) {
  const overlay = document.getElementById("squatCountdownOverlay");
  const textEl = document.getElementById("squatCountdownText");
  if (!overlay || !textEl) return;
  overlay.style.display = "flex";
  overlay.dataset.kind = kind || "count";
  textEl.textContent = text;
  textEl.classList.remove("pulse-in");
  void textEl.offsetWidth;
  textEl.classList.add("pulse-in");
}

function hideSquatCountdownVisual() {
  const overlay = document.getElementById("squatCountdownOverlay");
  if (overlay) overlay.style.display = "none";
}

/**
 * Phase 5.4.4 — the new first step of the countdown experience (report
 * section 3): "準備好了" shown (+ robot happy + spoken once) for a brief
 * hold BEFORE the numeric countdown starts, instead of jumping straight
 * from "body detected" to "3".
 */
function beginSquatReadyHold() {
  showSquatCountdownVisual("準備好了！", "ready");
  setSquatRobotMood("happy");
  speakSquatReady();
  if (squatReadyHoldTimeoutId) clearTimeout(squatReadyHoldTimeoutId);
  squatReadyHoldTimeoutId = setTimeout(() => {
    squatReadyHoldTimeoutId = null;
    if (squatTrainingState !== SQUAT_TRAINING_STATE.READY) return; // body may have been lost in the meantime
    squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.READY_HOLD_ELAPSED);
    beginSquatCountdown();
  }, SQUAT_READY_HOLD_MS);
}

function cancelSquatReadyHold() {
  if (squatReadyHoldTimeoutId) {
    clearTimeout(squatReadyHoldTimeoutId);
    squatReadyHoldTimeoutId = null;
  }
  hideSquatCountdownVisual();
}

/**
 * Phase 5.4.4 — redesigned countdown sequence (report section 4):
 * 準備好了 (beginSquatReadyHold, already shown) → 3 → 2 → 1 → 開始！, each
 * step re-triggering the same pulse-in animation so every number reads as
 * its own beat rather than a static digit swap. Voice only speaks once, at
 * GO (report section 10/F) — no "3、2、1" narration.
 */
function beginSquatCountdown() {
  squatTrainingState = SQUAT_TRAINING_STATE.COUNTDOWN;
  squatCountdownActive = true;
  setSquatRobotMood("encourage");
  const overlay = document.getElementById("squatCountdownOverlay");
  const textEl = document.getElementById("squatCountdownText");
  if (!overlay || !textEl) {
    squatCountingStarted = true;
    squatCountdownActive = false;
    squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.COUNTDOWN_FINISHED);
    return;
  }
  let remaining = SQUAT_THRESHOLDS.COUNTDOWN_SECONDS;
  showSquatCountdownVisual(String(remaining), "count");
  squatCountdownIntervalId = setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      showSquatCountdownVisual(String(remaining), "count");
      return;
    }
    showSquatCountdownVisual("開始！", "go");
    speakSquatCountdownGo();
    clearInterval(squatCountdownIntervalId);
    squatCountdownIntervalId = null;
    setTimeout(() => {
      hideSquatCountdownVisual();
      squatCountingStarted = true;
      squatCountdownActive = false;
      squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.COUNTDOWN_FINISHED);
    }, 500);
  }, 1000);
}

/**
 * Phase 5.2 section 7 — if the smoothed detection state drops out of READY
 * while the countdown is running, cancel it instead of letting rep counting
 * start on nobody. handleSquatFrame() re-triggers beginSquatCountdown()
 * automatically once the body is reliably back in frame.
 */
function cancelSquatCountdown() {
  if (squatCountdownIntervalId) {
    clearInterval(squatCountdownIntervalId);
    squatCountdownIntervalId = null;
  }
  squatCountdownActive = false;
  hideSquatCountdownVisual();
}

/**
 * Phase 5.3 — resolves this frame's ONE primary feedback message via the
 * priority/stability pipeline (js/ai/squatFeedback.js), writes it to the
 * large on-camera banner, and (if appropriate) speaks it. Returns the
 * stable feedback object (or null) purely so handleSquatFrame() can pass it
 * to the debug panel too — the decision itself already happened here.
 */
function resolveSquatFeedback(displayState, framing, timestamp) {
  const repState = squatSessionTracker ? squatSessionTracker.getState() : "standing";
  const candidate = decideSquatFeedback({
    displayState,
    framing,
    // Phase 5.4.4 — also suppressed during the READY hold, not just the
    // numeric countdown, so the dedicated countdown overlay (準備好了 → 3
    // → 2 → 1 → 開始！) is the sole focus during that whole sequence
    // instead of competing with the bottom primary-feedback banner.
    countdownActive: squatCountdownActive || squatTrainingState === SQUAT_TRAINING_STATE.READY,
    squatCountingStarted,
    repState,
    lastRepIssues: squatLastRepIssues,
    lastRepCompletedAt: squatLastRepCompletedAt,
    milestone: squatCurrentMilestone,
    milestoneAt: squatMilestoneAt,
    now: timestamp,
  });
  const stable = squatFeedbackStability ? squatFeedbackStability.update(candidate, timestamp) : candidate;

  // Phase 5.4.2 — only pick a (rotating) text/icon variation when this is a
  // NEW occurrence of the stable feedback id, so the displayed line never
  // changes mid-display (no flicker) but genuinely rotates between distinct
  // occurrences of the same intent (report section 3).
  const stableId = stable ? stable.id : null;
  if (stableId !== squatLastDisplayedFeedbackId) {
    squatLastDisplayedFeedbackId = stableId;
    if (!stable) {
      squatCurrentFeedbackText = "";
      squatCurrentFeedbackIcon = null;
    } else if (stable.priority === FEEDBACK_PRIORITY.SAFETY) {
      // Phase 5.4.4 fix (report item G — "tracking/framing feedback
      // 重複"): setSquatStatusOverlay() already shows this exact message
      // full-screen (see the displayState branch in handleSquatFrame), so
      // showing it AGAIN in the bottom primary-feedback banner was a real
      // duplication bug. The banner stays empty for safety-tier messages —
      // the readiness dot (ambient) + status overlay (primary) are now the
      // single source of truth for "can the system see me right now".
      squatCurrentFeedbackText = "";
      squatCurrentFeedbackIcon = null;
    } else if (stable.intent === SQUAT_FEEDBACK_INTENT.MILESTONE && stable.milestoneId) {
      squatCurrentFeedbackText = squatFeedbackContentSelector.pickMilestoneVisual(stable.milestoneId) || "";
      squatCurrentFeedbackIcon = SQUAT_MILESTONE_ICON[stable.milestoneId] || null;
      triggerSquatMilestoneBadge(squatCurrentFeedbackText, squatCurrentFeedbackIcon);
    } else {
      squatCurrentFeedbackText = squatFeedbackContentSelector.pickVisual(stable.intent) || "";
      squatCurrentFeedbackIcon = SQUAT_FEEDBACK_ICON[stable.intent] || null;
    }
  }

  updateSquatPrimaryFeedback(stable, squatCurrentFeedbackText, squatCurrentFeedbackIcon);
  speakSquatFeedbackIfAppropriate(stable, timestamp);
  updateSquatRobotCompanion(stable);
  return stable;
}

/**
 * The single large "what should I do right now" line shown on top of the
 * camera view, now with an optional small secondary icon (report section
 * 2). `feedback` is already the debounced, priority-resolved result of
 * resolveSquatFeedback(); `text`/`iconSrc` are the rotated variation chosen
 * for its current occurrence — this function only renders them (or hides
 * the banner entirely when there's nothing to show, e.g. countdown).
 */
function updateSquatPrimaryFeedback(feedback, text, iconSrc) {
  const el = document.getElementById("squatPrimaryFeedback");
  const textEl = document.getElementById("squatPrimaryFeedbackText");
  const iconEl = document.getElementById("squatPrimaryFeedbackIcon");
  if (!el) return;
  if (!feedback || !text) {
    el.style.display = "none";
    if (textEl) textEl.textContent = "";
    if (iconEl) {
      iconEl.style.display = "none";
      iconEl.removeAttribute("src");
    }
    return;
  }
  el.style.display = "flex";
  if (textEl) textEl.textContent = text;
  if (iconEl) {
    if (iconSrc) {
      iconEl.src = iconSrc;
      iconEl.style.display = "inline-block";
    } else {
      iconEl.style.display = "none";
      iconEl.removeAttribute("src");
    }
  }
}

/** Phase 5.4.2 — a brief, one-shot highlight on the primary feedback banner for milestones (report section 5). CSS-only, auto-clears itself. */
/**
 * Phase 5.4.4 — dedicated, prominent milestone badge (report section 8;
 * real-device finding B: the old flash-the-existing-banner approach wasn't
 * visible enough — it also turned out to reference a CSS class,
 * ".milestone-flash", that no longer existed after Phase 5.4.3 renamed the
 * animation classes, so it was silently doing nothing at all). This is a
 * separate, larger, centrally-placed element so a milestone reads as its
 * own moment instead of a subtle tweak to the small bottom banner.
 */
function triggerSquatMilestoneBadge(text, iconSrc) {
  const badge = document.getElementById("squatMilestoneBadge");
  const textEl = document.getElementById("squatMilestoneBadgeText");
  const iconEl = document.getElementById("squatMilestoneBadgeIcon");
  if (!badge || !text) return;
  if (textEl) textEl.textContent = text;
  if (iconEl) {
    if (iconSrc) {
      iconEl.src = iconSrc;
      iconEl.style.display = "inline-block";
    } else {
      iconEl.style.display = "none";
      iconEl.removeAttribute("src");
    }
  }
  badge.classList.remove("play");
  void badge.offsetWidth;
  badge.classList.add("play");
  if (squatMilestoneBadgeTimeoutId) clearTimeout(squatMilestoneBadgeTimeoutId);
  squatMilestoneBadgeTimeoutId = setTimeout(() => {
    squatMilestoneBadgeTimeoutId = null;
    badge.classList.remove("play");
  }, 1100);
}

/**
 * Phase 5.4.2 — small training companion (report section 6). Reuses the
 * existing renderRobot()/ROBOT_ASSETS mapping (already used on Patient
 * Home), never rendered every frame — only when the computed mood actually
 * changes, and never large enough to cover the camera/skeleton.
 */
/**
 * Phase 5.4.4 — single low-level entry point for changing the robot's mood.
 * Every caller (per-frame feedback resolver, READY-hold, countdown, ending
 * screen) goes through this one function, which is the only place that
 * touches the <img> element — this is what prevents the "two call sites
 * fighting over the robot on the same frame" bug found during this phase's
 * real-device review (see js/ai/squatRobotCompanion.js docstring).
 */
function setSquatRobotMood(nextState) {
  const img = document.getElementById("squatRobotCompanion");
  if (!img) return;
  if (nextState === squatCurrentRobotState && img.getAttribute("src")) return;
  squatCurrentRobotState = nextState;
  img.src = ROBOT_ASSETS[nextState] || ROBOT_ASSETS.idle;
  img.style.display = "block";
  // Small bounce ONLY on a real mood change (report section 9), never per
  // frame — this function itself already only reaches here when nextState
  // actually differs from the previous frame's.
  img.classList.remove("mood-change");
  void img.offsetWidth;
  img.classList.add("mood-change");
}

function updateSquatRobotCompanion(feedback) {
  setSquatRobotMood(pickSquatRobotState(squatTrainingState, feedback));
}

/**
 * Phase 5.3 — browser-facing voice wrapper. The decision of WHETHER to
 * speak is entirely delegated to the pure squatVoicePolicy tracker; this
 * function only touches window.speechSynthesis, and is guarded so a
 * missing/throwing speechSynthesis can never break the (always-present)
 * visual feedback above.
 */
function speakSquatFeedbackIfAppropriate(feedback, timestamp) {
  if (!squatVoiceEnabled || !squatSpeechSupported || !feedback || !squatVoicePolicy) return;
  try {
    const nativelySpeaking = window.speechSynthesis.speaking;
    if (nativelySpeaking) {
      // Only a strictly higher-priority message may interrupt what's
      // currently being spoken — everything else waits its turn.
      if (squatLastSpokenPriority == null || feedback.priority >= squatLastSpokenPriority) return;
      window.speechSynthesis.cancel();
    }
    if (!squatVoicePolicy.shouldSpeak(feedback, timestamp, nativelySpeaking)) return;
    // Phase 5.4.2 — voice text comes from its own rotating pool (only
    // advanced right when we're actually about to speak, never every
    // frame), distinct from the visual banner's own rotation.
    let voiceText = feedback.text;
    if (!voiceText) {
      voiceText =
        feedback.intent === SQUAT_FEEDBACK_INTENT.MILESTONE && feedback.milestoneId
          ? squatFeedbackContentSelector.pickMilestoneVoice(feedback.milestoneId)
          : squatFeedbackContentSelector.pickVoice(feedback.intent);
    }
    if (!voiceText) return;
    const utterance = new SpeechSynthesisUtterance(voiceText);
    utterance.lang = "zh-TW";
    utterance.rate = SQUAT_VOICE_SETTINGS.rate;
    utterance.pitch = SQUAT_VOICE_SETTINGS.pitch;
    utterance.volume = SQUAT_VOICE_SETTINGS.volume;
    if (squatSelectedVoice) utterance.voice = squatSelectedVoice;
    window.speechSynthesis.speak(utterance);
    squatVoicePolicy.markSpoken(feedback, timestamp);
    squatLastSpokenPriority = feedback.priority;
  } catch (e) {
    // speechSynthesis exists but threw (rare, platform-dependent) — voice
    // is an enhancement only, never let it break the visual training UI.
  }
}

/**
 * Phase 5.4.4 — low-level, one-off speech helper for state-transition
 * lines (READY/GO/SUCCESS/INCOMPLETE) that live OUTSIDE the per-frame
 * rotating-feedback pipeline above. `forceCancel` implements the priority
 * rule in report section 10 ("SUCCESS 必須 cancel 其他 pending speech") —
 * safety/movement lines never get to finish talking over a session ending.
 */
function speakSquatText(text, { forceCancel = false } = {}) {
  if (!squatVoiceEnabled || !squatSpeechSupported || !text) return;
  try {
    if (forceCancel) {
      window.speechSynthesis.cancel();
    } else if (window.speechSynthesis.speaking) {
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "zh-TW";
    utterance.rate = SQUAT_VOICE_SETTINGS.rate;
    utterance.pitch = SQUAT_VOICE_SETTINGS.pitch;
    utterance.volume = SQUAT_VOICE_SETTINGS.volume;
    if (squatSelectedVoice) utterance.voice = squatSelectedVoice;
    window.speechSynthesis.speak(utterance);
  } catch (e) {
    // voice is an enhancement only — never let it break the visual UI.
  }
}

function speakSquatReady() {
  speakSquatText("準備好了");
}

// Phase 5.4.4 report section 10/F — countdown speaks only once (at GO), not
// "3、2、1" narrated individually, to avoid the "吵雜" real-device complaint.
function speakSquatCountdownGo() {
  speakSquatText("開始");
}

function speakSquatEndingLine(kind) {
  speakSquatText(kind === "success" ? "完成今天的訓練了，做得很好！" : "辛苦了，這次先到這裡，已經為你保存這次紀錄。", { forceCancel: true });
}

/**
 * Phase 5.4.2 — selects the best available zh-TW voice once voices are
 * loaded. Browsers commonly load voices asynchronously (getVoices() can
 * return [] on first call), so this both tries immediately and listens for
 * the voiceschanged event. Never throws if speechSynthesis is unavailable.
 */
function initSquatVoiceSelection() {
  if (!squatSpeechSupported) return;
  try {
    const trySelect = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length) squatSelectedVoice = pickSquatVoice(voices);
    };
    trySelect();
    if (typeof window.speechSynthesis.addEventListener === "function") {
      window.speechSynthesis.addEventListener("voiceschanged", trySelect);
    }
  } catch (e) {
    // voice selection is a nice-to-have — never let it block camera start.
  }
}

function toggleSquatVoice() {
  squatVoiceEnabled = !squatVoiceEnabled;
  if (!squatVoiceEnabled && squatSpeechSupported) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      // ignore
    }
  }
  updateSquatVoiceToggleUI();
}

function updateSquatVoiceToggleUI() {
  const el = document.getElementById("squatVoiceToggle");
  if (!el) return;
  el.textContent = squatVoiceEnabled ? "語音：開" : "語音：關";
}

function setSquatAlertText(text) {
  const box = document.getElementById("squatAlertBox");
  const textEl = document.getElementById("squatAlertText");
  if (!box || !textEl) return;
  textEl.textContent = text;
  box.style.display = "flex";
}

/**
 * Phase 5.3 — short, non-blocking per-rep result (report section 14): a
 * single line, never a modal, never covering the skeleton. If a rep has
 * multiple issues, only the first (highest-priority in qualityIssues order)
 * is shown here — the full list is still persisted on the rep record for
 * the session result page.
 */
function showSquatRepAlert(rep) {
  if (rep.qualityValid) {
    setSquatAlertText(`第 ${rep.repNumber} 次：✓ 完成，動作品質良好。`);
    return;
  }
  const issue = rep.qualityIssues && rep.qualityIssues[0];
  const label = issue ? SQUAT_QUALITY_ISSUE_LABELS[issue] : null;
  setSquatAlertText(label ? `第 ${rep.repNumber} 次：△ ${label}。` : `第 ${rep.repNumber} 次：完成。`);
}

/**
 * Phase 5.4.3 — Progress Ring (report section 3). SVG stroke-dashoffset
 * math only, no canvas involved — never touches the MediaPipe/skeleton
 * canvas or its render loop. Called only on REP_COMPLETED, not per frame.
 */
function updateSquatRepRing(completedCount, targetReps) {
  const ring = document.getElementById("squatRepRingProgress");
  if (!ring) return;
  const circumference = 188.5; // 2 * PI * r(30), matches the SVG circle's radius
  const ratio = calculateProgressRatio(completedCount, targetReps);
  ring.style.strokeDashoffset = String(circumference * (1 - ratio));
}

/** LEVEL 1 — one-shot sparkle burst on a completed rep (report section 4). */
function triggerSquatRepSparkle() {
  const el = document.getElementById("squatRepSparkle");
  if (!el) return;
  el.classList.remove("play");
  void el.offsetWidth;
  el.classList.add("play");
}

/**
 * LEVEL 2 — milestone acknowledgment (report section 5/9). 25/50/75% get
 * the "subtle" variant; near-complete gets the "strong" variant plus a
 * brief ring emphasis glow. Complete is handled separately (LEVEL 3, see
 * triggerSquatCompletionCelebration) since it's the biggest moment.
 */
function triggerSquatMilestoneAnimation(milestone) {
  const feedbackEl = document.getElementById("squatPrimaryFeedback");
  const ringWrap = document.getElementById("squatRepCounter");
  const isStrong = milestone === "near_complete";
  if (feedbackEl) {
    feedbackEl.classList.remove("milestone-flash-subtle", "milestone-flash-strong");
    void feedbackEl.offsetWidth;
    feedbackEl.classList.add(isStrong ? "milestone-flash-strong" : "milestone-flash-subtle");
  }
  if (isStrong && ringWrap) {
    ringWrap.classList.remove("ring-emphasis");
    void ringWrap.offsetWidth;
    ringWrap.classList.add("ring-emphasis");
  }
}

/**
 * LEVEL 3 — session-complete celebration (report section 6). Bounded,
 * auto-hiding (~1.5s), never blocks interaction (CSS pointer-events:none)
 * and never loops. Robot switches to "celebrate" via the normal
 * updateSquatRobotCompanion() state machine (driven by the MILESTONE
 * feedback candidate), not duplicated here.
 */
function triggerSquatCompletionCelebration() {
  const overlay = document.getElementById("squatCelebrationOverlay");
  const textEl = document.getElementById("squatCelebrationText");
  if (!overlay) return;
  if (textEl) textEl.textContent = "今天的目標完成了！";
  overlay.classList.remove("play");
  void overlay.offsetWidth;
  overlay.classList.add("play");
  if (squatCelebrationTimeoutId) clearTimeout(squatCelebrationTimeoutId);
  squatCelebrationTimeoutId = setTimeout(() => {
    overlay.classList.remove("play");
    squatCelebrationTimeoutId = null;
  }, 1500);
}

function drawSquatSkeleton(landmarks) {
  const canvas = document.getElementById("squatOverlayCanvas");
  const video = document.getElementById("squatVideo");
  if (!canvas || !squatCanvasCtx) return;
  if (video && video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = squatCanvasCtx;
  if (!canvas.width || !canvas.height) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;

  const minVis = SQUAT_THRESHOLDS.MIN_VISIBILITY;
  ctx.strokeStyle = "#7ea866";
  ctx.lineWidth = Math.max(2, canvas.width * 0.004);
  POSE_CONNECTIONS.forEach(({ start, end }) => {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) return;
    if ((a.visibility != null && a.visibility < minVis) || (b.visibility != null && b.visibility < minVis)) return;
    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  });

  ctx.fillStyle = "#5f8d49";
  landmarks.forEach((p) => {
    if (!p || (p.visibility != null && p.visibility < minVis)) return;
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, Math.max(2, canvas.width * 0.006), 0, Math.PI * 2);
    ctx.fill();
  });
}

// Phase 5.2 — small, always-visible framing indicator, distinct from the
// full status overlay (which is reserved for setup/error/lost-tracking
// blocking states). Keyed by the *smoothed* DETECTION_DISPLAY_STATE, not the
// raw per-frame BODY_READINESS, so it never flickers on a single dropped
// frame. Purely a camera-framing aid, never a correctness judgment.
const SQUAT_READINESS_LABELS = {
  [DETECTION_DISPLAY_STATE.NOT_FOUND]: "請站到鏡頭前",
  [DETECTION_DISPLAY_STATE.PARTIAL]: "請稍微退後，讓全身進入畫面",
  [DETECTION_DISPLAY_STATE.READY]: "已偵測到全身",
  [DETECTION_DISPLAY_STATE.LOST_SUSTAINED]: "請保持全身入鏡",
  [DETECTION_DISPLAY_STATE.LOST_LONG]: "暫時偵測不到",
};

function updateSquatReadinessIndicator(displayState, framing) {
  const dot = document.getElementById("squatReadinessDot");
  const text = document.getElementById("squatReadinessText");
  if (!dot || !text) return;
  const dotClass =
    displayState === DETECTION_DISPLAY_STATE.READY
      ? "ready"
      : displayState === DETECTION_DISPLAY_STATE.PARTIAL || displayState === DETECTION_DISPLAY_STATE.LOST_SUSTAINED
      ? "partial"
      : "not-found";
  dot.className = `squat-readiness-dot ${dotClass}`;
  let label = SQUAT_READINESS_LABELS[displayState] || "";
  // Framing hint only ever refines the message while already READY (it
  // requires every required landmark to be reliable, same as READY itself)
  // — never used to second-guess a not-ready/lost state.
  if (displayState === DETECTION_DISPLAY_STATE.READY) {
    if (framing === "TOO_CLOSE") label = "請稍微退後";
    else if (framing === "TOO_FAR") label = "請靠近一些";
    else label = "已偵測到全身";
  }
  text.textContent = label;
}

function toggleSquatDebugMode() {
  squatDebugModeOn = !squatDebugModeOn;
  const panel = document.getElementById("squatDebugPanel");
  if (panel) panel.style.display = squatDebugModeOn ? "block" : "none";
}

/** Rolling-window average of actual onFrame call intervals — the real inference rate, not the rAF rate (which is throttled independently). */
function estimateSquatFps(timestamp) {
  squatFrameTimestamps.push(timestamp);
  if (squatFrameTimestamps.length > 15) squatFrameTimestamps.shift();
  if (squatFrameTimestamps.length < 2) return null;
  const span = squatFrameTimestamps[squatFrameTimestamps.length - 1] - squatFrameTimestamps[0];
  if (span <= 0) return null;
  return ((squatFrameTimestamps.length - 1) / span) * 1000;
}

/**
 * Phase 5.2 section 6/13 — every engineering/angle value formerly shown in
 * the normal training UI now lives only here, gated on squatDebugModeOn.
 * Deliberately shows the raw (un-smoothed) readiness/knee data — a
 * developer debugging dropout wants to SEE the flicker, not have it hidden.
 */
function updateSquatDebugPanel({
  poseDetected,
  fps,
  rawReadiness,
  displayState,
  framing,
  kneeAngles,
  repState,
  repCount,
  lastValidLandmarkAgeMs,
  lastRepDurationMs,
  feedback,
  lastRepIssues,
  currentTrunkLeanDeg,
  maxTrunkLeanThisRep,
}) {
  if (!squatDebugModeOn) return;
  const panel = document.getElementById("squatDebugPanel");
  if (!panel) return;
  const video = document.getElementById("squatVideo");
  const canvas = document.getElementById("squatOverlayCanvas");
  const fmt = (v) => (v == null ? "--" : Math.round(v));
  const issuesText = lastRepIssues && lastRepIssues.length ? lastRepIssues.map((i) => SQUAT_QUALITY_ISSUE_LABELS[i] || i).join("、") : "--";
  panel.innerHTML = `<div class="small">Pose detected: <b>${poseDetected}</b></div>
    <div class="small">FPS (approx): <b>${fps != null ? fps.toFixed(1) : "--"}</b></div>
    <div class="small">Body readiness (raw): <b>${rawReadiness}</b></div>
    <div class="small">Detection UI state: <b>${displayState}</b></div>
    <div class="small">Training Experience state: <b>${squatTrainingState}</b></div>
    <div class="small">Framing hint: <b>${framing || "--"}</b></div>
    <div class="small">Left knee: <b>${fmt(kneeAngles && kneeAngles.left)}</b>°　Right knee: <b>${fmt(kneeAngles && kneeAngles.right)}</b>°　Average: <b>${fmt(kneeAngles && kneeAngles.average)}</b>°</div>
    <div class="small">Current trunk lean: <b>${fmt(currentTrunkLeanDeg)}</b>°　Max this rep: <b>${fmt(maxTrunkLeanThisRep)}</b>°</div>
    <div class="small">Current squat state: <b>${(repState && SQUAT_STATE_LABELS[repState]) || repState || "--"}</b></div>
    <div class="small">Rep count: <b>${repCount}</b></div>
    <div class="small">Last valid landmark age: <b>${lastValidLandmarkAgeMs != null ? Math.round(lastValidLandmarkAgeMs) + "ms" : "--"}</b></div>
    <div class="small">Last rep duration: <b>${lastRepDurationMs != null ? Math.round(lastRepDurationMs) + "ms" : "--"}</b></div>
    <div class="small">Primary feedback: <b>${feedback ? feedback.text : "--"}</b> (id: ${feedback ? feedback.id : "--"}, priority: ${feedback ? feedback.priority : "--"})</div>
    <div class="small">Feedback reason: <b>${feedback ? feedback.reason : "--"}</b></div>
    <div class="small">Last rep issues: <b>${issuesText}</b></div>
    <div class="small">Voice: <b>${squatVoiceEnabled ? "on" : "off"}</b>${squatSpeechSupported ? "" : " (speechSynthesis unavailable)"}</div>
    <div class="small">Video size: <b>${video ? `${video.videoWidth}x${video.videoHeight}` : "--"}</b></div>
    <div class="small">Canvas size: <b>${canvas ? `${canvas.width}x${canvas.height}` : "--"}</b></div>`;
}

function handleSquatFrame(landmarks, timestamp) {
  if (state.route !== "squatDetection" || !squatDetectionStability) return;
  drawSquatSkeleton(landmarks);

  const fps = estimateSquatFps(timestamp);
  const { displayState, framing, rawReadiness } = squatDetectionStability.update(landmarks, timestamp);
  updateSquatReadinessIndicator(displayState, framing);

  // The true, un-smoothed per-frame gate — always what actually decides
  // whether this frame's angles are trustworthy enough to feed the rep
  // state machine. Never replaced by the smoothed displayState above.
  const bodyReady = !!landmarks && hasFullLowerBody(landmarks, SQUAT_THRESHOLDS, SQUAT_REQUIRED_LANDMARKS);
  const kneeAngles = bodyReady ? computeKneeAngles(landmarks) : { left: null, right: null, average: null, reliable: false };

  // Phase 5.4.2 — trunk-lean debug instrumentation (report section 14/18):
  // computed every frame (computeTrunkLeanDeg already returns null safely
  // when landmarks aren't reliable) so a real-device test can directly
  // compare "normal squat" vs "deliberately leaning" max values. Debug-only
  // — never shown in the formal UI, never changes TRUNK_LEAN_MAX_DEG.
  squatCurrentTrunkLeanDeg = computeTrunkLeanDeg(landmarks);
  const repStateForTrunkTracking = squatSessionTracker ? squatSessionTracker.getState() : "standing";
  if (repStateForTrunkTracking === "standing") {
    squatMaxTrunkLeanThisRep = null;
  } else if (squatCurrentTrunkLeanDeg != null) {
    squatMaxTrunkLeanThisRep = squatMaxTrunkLeanThisRep == null ? squatCurrentTrunkLeanDeg : Math.max(squatMaxTrunkLeanThisRep, squatCurrentTrunkLeanDeg);
  }

  if (displayState === DETECTION_DISPLAY_STATE.READY) {
    setSquatStatusOverlay("");
  } else {
    setSquatStatusOverlay(SQUAT_READINESS_LABELS[displayState] || "請保持全身入鏡。");
  }

  // Phase 5.2/5.4.4 — countdown may only start once the model is ready AND
  // the smoothed state actually says READY, and now goes through an
  // explicit READY hold (report section 3) before COUNTDOWN even begins.
  // A sustained loss at any point before ACTIVE cancels back to
  // WAITING_FOR_BODY instead of letting training start blind.
  if (squatModelReady && !squatCountingStarted && !isSquatTrainingLocked(squatTrainingState)) {
    if (displayState === DETECTION_DISPLAY_STATE.READY) {
      if (squatTrainingState === SQUAT_TRAINING_STATE.WAITING_FOR_BODY) {
        squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.BODY_READY);
        beginSquatReadyHold();
      }
    } else if (squatTrainingState === SQUAT_TRAINING_STATE.READY) {
      cancelSquatReadyHold();
      squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.BODY_LOST);
    } else if (squatTrainingState === SQUAT_TRAINING_STATE.COUNTDOWN) {
      cancelSquatCountdown();
      squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.BODY_LOST);
    }
  }

  // Phase 5.3 — resolves the ONE primary feedback line (priority + debounce
  // + optional voice) for this frame. Must run every frame (not just while
  // counting) so safety/framing messages still work before training starts.
  const feedback = resolveSquatFeedback(displayState, framing, timestamp);

  updateSquatDebugPanel({
    poseDetected: !!landmarks,
    fps,
    rawReadiness,
    displayState,
    framing,
    kneeAngles,
    repState: squatSessionTracker ? squatSessionTracker.getState() : null,
    repCount: squatSessionTracker ? squatSessionTracker.getCompletedCount() : 0,
    lastValidLandmarkAgeMs: (() => {
      const lastReadyAt = squatDetectionStability.getLastReadyAt();
      return lastReadyAt != null ? timestamp - lastReadyAt : null;
    })(),
    lastRepDurationMs: squatLastRepDurationMs,
    feedback,
    lastRepIssues: squatLastRepIssues,
    currentTrunkLeanDeg: squatCurrentTrunkLeanDeg,
    maxTrunkLeanThisRep: squatMaxTrunkLeanThisRep,
  });

  if (!bodyReady || !kneeAngles.reliable) return;
  if (!squatCountingStarted || !squatSessionTracker) return;

  const trunkLeanDeg = squatCurrentTrunkLeanDeg;
  const kneeValgusSuspected = computeKneeValgusSuspected(landmarks);
  const { repCompleted, completedRep } = squatSessionTracker.processFrame({
    avgKneeAngle: kneeAngles.average,
    trunkLeanDeg,
    kneeValgusSuspected,
    timestamp,
  });

  if (repCompleted) {
    // Phase 5.4.3 — everything below is triggered exactly once by this
    // REP_COMPLETED event, never per-frame (report section 24): no DOM
    // element is created or re-inserted here, only existing elements'
    // class/text/style are toggled.
    squatLastRepDurationMs = completedRep.durationMs;
    squatLastRepIssues = completedRep.qualityIssues;
    squatLastRepCompletedAt = timestamp;
    const completedCount = squatSessionTracker.getCompletedCount();
    const targetReps = squatSessionMeta ? squatSessionMeta.targetReps : 0;
    const countEl = document.getElementById("squatRepCounterValue");
    if (countEl) countEl.textContent = String(completedCount);
    updateSquatRepRing(completedCount, targetReps);
    const counterWrap = document.getElementById("squatRepCounter");
    if (counterWrap) {
      if (targetReps > 0 && completedCount >= targetReps) {
        counterWrap.classList.add("complete");
      }
      // LEVEL 1 — one-shot "rep counted" flash (report section 4/9).
      counterWrap.classList.remove("pulse");
      void counterWrap.offsetWidth; // restart the CSS animation even mid-flash
      counterWrap.classList.add("pulse");
    }
    triggerSquatRepSparkle();
    showSquatRepAlert(completedRep);

    // LEVEL 2/3 — milestone acknowledgment, target-agnostic, fire-once per
    // session (report section 5/8: "milestone 必須只觸發一次").
    const milestone = targetReps > 0 ? getSquatMilestone(completedCount, targetReps) : null;
    if (milestone && squatMilestoneTracker && squatMilestoneTracker.shouldFire(milestone)) {
      squatMilestoneTracker.markFired(milestone);
      squatCurrentMilestone = milestone;
      squatMilestoneAt = timestamp;
      if (milestone !== SQUAT_MILESTONE.COMPLETE) {
        triggerSquatMilestoneAnimation(milestone);
        if (squatTrainingState === SQUAT_TRAINING_STATE.ACTIVE) {
          squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.MILESTONE_STARTED);
          if (squatMilestoneStateTimeoutId) clearTimeout(squatMilestoneStateTimeoutId);
          squatMilestoneStateTimeoutId = setTimeout(() => {
            squatMilestoneStateTimeoutId = null;
            if (squatTrainingState === SQUAT_TRAINING_STATE.MILESTONE) {
              squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.MILESTONE_ENDED);
            }
          }, 1100);
        }
      }
    }

    // Phase 5.4.4 — THE HARD STOP (report section 11, the single most
    // important requirement this phase). The instant the target is first
    // reached, lock the session immediately and stop here — nothing below
    // this block may ever run again for this training session.
    if (targetReps > 0 && completedCount >= targetReps) {
      enterSquatSuccessState();
      return;
    }
  }
}

function stopSquatCamera() {
  if (squatCountdownIntervalId) {
    clearInterval(squatCountdownIntervalId);
    squatCountdownIntervalId = null;
  }
  if (squatReadyHoldTimeoutId) {
    clearTimeout(squatReadyHoldTimeoutId);
    squatReadyHoldTimeoutId = null;
  }
  if (squatMilestoneStateTimeoutId) {
    clearTimeout(squatMilestoneStateTimeoutId);
    squatMilestoneStateTimeoutId = null;
  }
  if (squatMilestoneBadgeTimeoutId) {
    clearTimeout(squatMilestoneBadgeTimeoutId);
    squatMilestoneBadgeTimeoutId = null;
  }
  if (squatCameraController) {
    squatCameraController.stop();
    squatCameraController = null;
  }
  squatCanvasCtx = null;
  squatCountingStarted = false;
  squatCountdownActive = false;
  squatModelReady = false;
  // Phase 5.3 — leaving the camera page must stop any in-flight speech too,
  // the same way it already stops the camera/model/animation loop.
  if (squatSpeechSupported) {
    try {
      window.speechSynthesis.cancel();
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Shared "where to land after leaving the squat page" for both abandoning
 * (exitSquatDetection) and finishing (finalizeSquatTraining). Phase 3.1:
 * a recommendation-originated session lands back on the recommendation's
 * exercise detail (not the Self Practice Library) — meta.navigationOrigin
 * carries this through from goSquatDetection(); meta.mode (assigned vs
 * self_practice) is untouched and still the only thing that ever affects
 * analysisRecord.source.
 */
function navigateAfterSquat(meta) {
  if (!meta) return goSchedule();
  if (meta.mode === "assigned") return goExerciseDetail(meta.scheduleId, meta.exerciseIndex);
  if (meta.navigationOrigin === "recommendation") return goRecommendationExerciseDetail(meta.exerciseId);
  return goSelfPracticeExerciseDetail(meta.exerciseId);
}

function exitSquatDetection() {
  stopSquatCamera();
  const meta = squatSessionMeta;
  squatSessionTracker = null;
  navigateAfterSquat(meta);
}

function requestEndSquatTraining() {
  const completed = squatSessionTracker ? squatSessionTracker.getCompletedCount() : 0;
  const target = squatSessionMeta ? squatSessionMeta.targetReps : 0;
  if (target > 0 && completed >= target) {
    // Defensive fallback — the hard-stop in handleSquatFrame's repCompleted
    // block should already have called enterSquatSuccessState() the instant
    // the target was reached, so this branch should rarely if ever run.
    return enterSquatSuccessState();
  }
  const container = document.getElementById("squatEndConfirmCard");
  if (!container) return enterSquatIncompleteState();
  const message = completed === 0
    ? "尚未完成任何一次深蹲，確定要結束嗎？"
    : `目前完成 ${completed} / ${target} 次，確定提前結束嗎？`;
  container.innerHTML = `<div class="confirm-card">
    <b>${message}</b>
    <div class="row" style="margin-top:10px;">
      <button class="btn btn-light" style="flex:1" onclick="cancelEndSquatTraining()">取消</button>
      <button class="btn btn-primary" style="flex:1" onclick="enterSquatIncompleteState()">確定結束</button>
    </div>
  </div>`;
}

function cancelEndSquatTraining() {
  const container = document.getElementById("squatEndConfirmCard");
  if (container) container.innerHTML = "";
}

/**
 * Phase 5.4.4 — extracted from the old finalizeSquatTraining(): builds the
 * analysisRecord, grants XP, updates the schedule. Deliberately does NOT
 * navigate anywhere for the normal/happy path — the caller (
 * enterSquatSuccessState / enterSquatIncompleteState) shows a persistent
 * ending screen first and only navigates once the patient presses
 * 查看成果 (see goSquatResultFromCamera). The rare error/duplicate-call
 * edge cases (schedule missing, already finalized) still navigate
 * immediately here, same as before — there's nothing meaningful to show a
 * SUCCESS/INCOMPLETE screen for in those cases.
 *
 * Returns { record, xpResult, gamificationAfter, allDone } on the normal
 * path, or null if it already handled navigation itself (edge cases).
 */
function persistSquatSession() {
  const meta = squatSessionMeta;
  const tracker = squatSessionTracker;
  squatSessionTracker = null;

  if (squatSessionFinalized || !meta) {
    navigateAfterSquat(meta);
    return null;
  }

  const isAssigned = meta.mode === "assigned";
  let schedule = null;
  let ex = null;
  if (isAssigned) {
    schedule = scheduleService.getById(meta.scheduleId);
    ex = schedule ? schedule.exercises[meta.exerciseIndex] : null;
    if (!schedule || !ex) {
      squatSessionFinalized = true;
      alert("找不到課表或動作資訊，本次結果未儲存。");
      goSchedule();
      return null;
    }
    if (ex.status === "completed") {
      // Already finalized by an earlier call (e.g. duplicate click) — never
      // create a second analysisRecord or grant XP twice.
      squatSessionFinalized = true;
      goExerciseDetail(schedule.id, meta.exerciseIndex);
      return null;
    }
  }
  // self_practice has no schedule/ex to check — squatSessionFinalized
  // (reset fresh by goSquatDetection() each time) is the only guard
  // against a duplicate finalize within one session, same as it always
  // was the FIRST guard for assigned mode too (the ex.status check above
  // is a second, belt-and-suspenders layer that only schedules can have).

  const summary = tracker
    ? tracker.getSummary()
    : { totalReps: 0, targetReps: meta.targetReps, validReps: 0, qualityValidReps: 0, insufficientDepthCount: 0, trunkLeanCount: 0, kneeValgusCount: 0, repsWithTrackingGap: 0, averageMinKneeAngle: null, averageRepDuration: null, repRecords: [] };
  const { score, quality } = calculateSquatScore(summary);
  const remark = buildSquatRemark(summary);
  const now = nowIso();

  // Captured BEFORE creating the new analysisRecord so the reward feedback
  // below can tell exactly what changed because of this one completion
  // (level-up / newly-unlocked achievements) — never a guess.
  const gamificationBefore = gamificationEngine.getGamificationSummary(meta.patientId);

  const record = analysisService.create({
    id: generateId("analysis"),
    patientId: meta.patientId,
    therapistId: meta.therapistId,
    // self_practice never has a schedule to attach to — analysisRecord
    // already tolerated a null scheduleId before Phase 2 (see the old
    // seed mock records with scheduleId: null), so this isn't a new
    // relaxation of the shape, just the first real writer of that case.
    scheduleId: isAssigned ? schedule.id : null,
    exerciseId: meta.exerciseId,
    exerciseName: meta.exerciseName,
    completedAt: now,
    analysisMode: SQUAT_ANALYSIS_MODE,
    source: isAssigned ? ANALYSIS_RECORD_SOURCES.ASSIGNED : ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,
    totalReps: summary.totalReps,
    targetReps: summary.targetReps,
    validReps: summary.validReps,
    score,
    overallScore: score,
    quality,
    remark,
    repRecords: summary.repRecords,
    summary: {
      totalReps: summary.totalReps,
      targetReps: summary.targetReps,
      validReps: summary.validReps,
      qualityValidReps: summary.qualityValidReps,
      insufficientDepthCount: summary.insufficientDepthCount,
      trunkLeanCount: summary.trunkLeanCount,
      kneeValgusCount: summary.kneeValgusCount,
      repsWithTrackingGap: summary.repsWithTrackingGap,
      averageMinKneeAngle: summary.averageMinKneeAngle,
      averageRepDuration: summary.averageRepDuration,
    },
    createdAt: now,
    capturedAt: now,
  });

  // Only reachable after analysisService.create() above returned successfully.
  if (isAssigned) {
    scheduleService.updateExerciseAt(schedule.id, meta.exerciseIndex, {
      status: "completed",
      completedAt: now,
      analysisRecordId: record.id,
    });
  }

  // Phase 5.4.2 — gameService.addXp() (legacy Phase 2/3 mechanism) writes to
  // a gameProfiles collection that gamificationEngine (the actual Home
  // Level/XP source of truth, see its own docstring) never reads — it's
  // dead weight kept only so nothing that might still reference it breaks.
  // Left untouched/unremoved as out-of-scope cleanup; the number that
  // actually matters is computeSessionXp() below.
  gameService.addXp(meta.patientId, meta.rewardXp || DEFAULT_SQUAT_REWARD_XP);

  const gamificationAfter = gamificationEngine.getGamificationSummary(meta.patientId);
  const newlyUnlockedAchievements = gamificationAfter.achievements.filter(
    (a, i) => a.unlocked && !gamificationBefore.achievements[i].unlocked
  );
  // Phase 5.4.2 — the actual session-based XP this record earned (see
  // gamificationEngine's SESSION_XP_RULES audit note), shown broken down by
  // source so the patient can see WHY, not just a bare number. Only bonuses
  // actually earned are non-zero — never fabricated.
  const xpResult = gamificationEngine.computeSessionXp(record);
  // Phase 4 — lightweight, one-shot reward feedback, still consumed by the
  // next exerciseDetailPage() render (see navigateAfterSquat) once the
  // patient actually navigates there via 查看成果.
  state.rewardFeedback = {
    xpGained: xpResult.xp,
    xpBreakdown: xpResult.breakdown,
    xpIsLegacyFlatRate: xpResult.isLegacyFlatRate,
    leveledUp: gamificationAfter.level > gamificationBefore.level,
    newLevel: gamificationAfter.level,
    newLevelTitle: gamificationAfter.title,
    newAchievements: newlyUnlockedAchievements,
    allDone: getTodayStructuredStatus(meta.patientId).allDone,
  };

  squatSessionFinalized = true;
  return { record, xpResult, gamificationAfter, allDone: state.rewardFeedback.allDone };
}

/**
 * Phase 5.4.4 — legacy entry point name kept only as a defensive fallback
 * (e.g. if some future code path bypasses the SUCCESS/INCOMPLETE screen
 * entirely); persists then immediately navigates, same as before this
 * phase. The normal patient-facing flow no longer calls this directly —
 * see enterSquatSuccessState / enterSquatIncompleteState.
 */
function finalizeSquatTraining() {
  const container = document.getElementById("squatEndConfirmCard");
  if (container) container.innerHTML = "";
  stopSquatCamera();
  const meta = squatSessionMeta;
  const result = persistSquatSession();
  if (result) navigateAfterSquat(meta);
}

/**
 * THE HARD STOP (Phase 5.4.4 report section 11 — the single most important
 * requirement this phase). Called exactly once, synchronously, from inside
 * handleSquatFrame's repCompleted block the instant completedCount first
 * reaches targetReps. stopSquatCamera() cancels the camera controller's
 * rAF loop and releases the stream/model — meaning handleSquatFrame simply
 * CANNOT be called again after this point, which is what makes "no more
 * reps, no more movement feedback, no more movement voice" a structural
 * guarantee rather than a hope: there is no more MediaPipe loop left to
 * generate any of those. Idempotent via the training-state guard below —
 * calling this twice (e.g. requestEndSquatTraining's defensive fallback
 * racing in) is always safe.
 */
function enterSquatSuccessState() {
  if (isSquatTrainingLocked(squatTrainingState)) return;
  squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.TARGET_REACHED); // -> COMPLETING
  stopSquatCamera();
  const meta = squatSessionMeta;
  const result = persistSquatSession();
  if (!result) return; // persistSquatSession() already navigated (edge case)
  squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.CELEBRATION_STARTED); // -> SUCCESS
  showSquatEndingScreen("success", result, meta);
}

/**
 * The INCOMPLETE counterpart — patient manually confirmed ending training
 * before reaching the target (report section 13). Same lock/persist/show
 * pattern, but never uses success language or confetti.
 */
function enterSquatIncompleteState() {
  const container = document.getElementById("squatEndConfirmCard");
  if (container) container.innerHTML = "";
  if (isSquatTrainingLocked(squatTrainingState)) return;
  squatTrainingState = nextSquatTrainingState(squatTrainingState, SQUAT_TRAINING_EVENT.MANUAL_STOP); // -> INCOMPLETE
  stopSquatCamera();
  const meta = squatSessionMeta;
  const result = persistSquatSession();
  if (!result) return;
  showSquatEndingScreen("incomplete", result, meta);
}

/**
 * Renders the persistent SUCCESS/INCOMPLETE screen (report section 12/13):
 * a brief entrance animation (confetti+check for success only), then a
 * card that STAYS until the patient presses 查看成果 — no auto-navigation,
 * no auto-hide. Reuses the Phase 5.4.3 celebration overlay element rather
 * than introducing a new one.
 */
function showSquatEndingScreen(kind, result, meta) {
  const overlay = document.getElementById("squatCelebrationOverlay");
  if (!overlay || !result || !result.record) return;
  const record = result.record;
  const xpResult = result.xpResult;
  const totalReps = record.totalReps || 0;
  const targetReps = record.targetReps || 0;
  const qualityPercent = calculateQualityRatioPercent(totalReps, record.validReps || 0);

  const textEl = document.getElementById("squatCelebrationText");
  const cardEl = document.getElementById("squatEndingCard");
  const subtextEl = document.getElementById("squatEndingSubtext");
  const badgesEl = document.getElementById("squatEndingBadges");
  const confettiEl = document.getElementById("squatCelebrationConfetti");
  const checkEl = document.getElementById("squatCelebrationCheck");

  overlay.classList.remove("success", "incomplete");
  overlay.classList.add(kind);
  if (textEl) textEl.textContent = kind === "success" ? "今日訓練完成！" : `今天完成 ${totalReps} 次`;
  if (subtextEl) {
    subtextEl.textContent =
      kind === "success"
        ? `${totalReps} / ${targetReps} 次${qualityPercent != null ? `｜品質 ${qualityPercent}%` : ""}`
        : "辛苦了，已經為你保存這次紀錄。";
  }
  if (badgesEl) {
    const badges = [];
    if (xpResult && xpResult.xp > 0) badges.push(`<span class="squat-ending-badge"><img src="/images/gamification/xp_coin.png" alt="" />+${xpResult.xp} XP</span>`);
    if (kind === "success") badges.push(`<span class="squat-ending-badge"><img src="/images/gamification/progress_star_complete.png" alt="" />目標達成</span>`);
    badgesEl.innerHTML = badges.join("");
  }
  if (confettiEl) confettiEl.style.display = kind === "success" ? "block" : "none";
  if (checkEl) checkEl.style.display = kind === "success" ? "block" : "none";
  if (cardEl) cardEl.style.display = "none";

  // Hide the normal training HUD — the ending card's own CTA takes over.
  const endBtn = document.getElementById("squatEndBtn");
  if (endBtn) endBtn.style.display = "none";
  const primaryFeedbackEl = document.getElementById("squatPrimaryFeedback");
  if (primaryFeedbackEl) primaryFeedbackEl.style.display = "none";
  const readinessEl = document.getElementById("squatReadinessIndicator");
  if (readinessEl) readinessEl.style.display = "none";
  const milestoneBadgeEl = document.getElementById("squatMilestoneBadge");
  if (milestoneBadgeEl) milestoneBadgeEl.classList.remove("play");

  overlay.classList.remove("play");
  void overlay.offsetWidth;
  overlay.classList.add("play");

  setSquatRobotMood(kind === "success" ? "celebrate" : "encourage");

  if (squatEndingRevealTimeoutId) clearTimeout(squatEndingRevealTimeoutId);
  squatEndingRevealTimeoutId = setTimeout(() => {
    squatEndingRevealTimeoutId = null;
    if (cardEl) cardEl.style.display = "flex";
  }, kind === "success" ? 1400 : 300);

  speakSquatEndingLine(kind);
}

/** Resets the ending overlay's visual state — used when re-entering the camera page for a fresh session (report section: repeated entry/exit safety). */
function resetSquatEndingScreen() {
  const overlay = document.getElementById("squatCelebrationOverlay");
  if (overlay) overlay.classList.remove("play", "success", "incomplete");
  const cardEl = document.getElementById("squatEndingCard");
  if (cardEl) cardEl.style.display = "none";
  const endBtn = document.getElementById("squatEndBtn");
  if (endBtn) endBtn.style.display = "";
  const primaryFeedbackEl = document.getElementById("squatPrimaryFeedback");
  if (primaryFeedbackEl) primaryFeedbackEl.style.display = "none";
  const readinessEl = document.getElementById("squatReadinessIndicator");
  if (readinessEl) readinessEl.style.display = "";
}

/** The ending screen's 查看成果 button — the ONLY thing that navigates away from the training page after a session ends (report section 12: "不要 auto navigate"). */
function goSquatResultFromCamera() {
  navigateAfterSquat(squatSessionMeta);
}

// scheduleTask() (the old #idx/time-dot text row) was replaced in Phase
// 6.5 by renderScheduleTaskCards()'s own inline LEFT/CENTER/RIGHT image row
// (report section 5) — removed since nothing else called it.
function rewardPage() {return `<div class="reward-screen"><div class="reward-stars">✨⭐✨</div><h1>任務完成！</h1><p>手臂伸展訓練已同步到復健紀錄</p><div class="reward-card"><div class="reward-xp">+50 XP</div><div class="small">Lv.12 復健達人｜XP 3900 / 4200</div><div class="xp-track wide"><span style="width:94%"></span></div></div><div class="badge-unlock">🏅 解鎖：連續訓練 28 天</div><button class="btn btn-primary full" onclick="goActionRecords()">查看動作紀錄</button><button class="btn btn-light full" onclick="goSchedule()">返回今日課表</button></div>`;}
function rehabMapPage() {return `<div class="header"><button class="btn btn-light" onclick="switchTab('profile')">返回</button><b>復健冒險地圖</b><img class="icon" src="/images/profile_selected.png" alt="地圖" /></div><div class="map-card"><div class="map-path"><div class="map-node done">1</div><div class="map-line done"></div><div class="map-node done">2</div><div class="map-line done"></div><div class="map-node active">3</div><div class="map-line"></div><div class="map-node">4</div></div><h2>第三關：膝蓋穩定挑戰</h2><p class="small">完成 3 次 AI 分析且平均分數達 85，即可解鎖下一關。</p></div><div class="stats"><div class="stat"><span class="small">目前星星</span><b>36</b></div><div class="stat"><span class="small">連續天數</span><b>28</b></div><div class="stat"><span class="small">本關進度</span><b>2/3</b></div></div><div class="card analysis-card"><div>🎁 下一關獎勵：+120 XP</div><div>🌟 徽章：膝蓋穩定王</div><div>🤖 AI建議：本週再完成一次深蹲分析</div></div>`;}
// deprecated demo page — still uses hardcoded fake patient names (黃小謙/陳小莉/林阿姨),
// not wired to relationService. No current UI links to it; keep it unreachable rather
// than restoring an entry point until it's rebuilt on real per-patient data.
function therapistScheduleTrackingPage() {return `<div class="header"><button class="btn btn-light" onclick="switchTab('home')">返回</button><b>課表追蹤</b><button class="btn btn-light" onclick="goAssignPlan()">派課</button></div><div class="card progress-summary"><b>今日課表同步狀態</b><div class="big-number">3 / 5</div><div class="small">3 位患者已完成，2 位待追蹤</div></div>${trackingItem('黃小謙','深蹲訓練','完成 2/3｜AI品質 89分','進步中','active-status')}${trackingItem('陳小莉','肩關節伸展','完成 1/3｜角度不足','需提醒','pending')}${trackingItem('林阿姨','平衡訓練','完成 3/3｜穩定度 91%','完成','done-status')}<h3 class="section-title">AI 課表建議</h3><div class="ai-box"><div class="ai-content"><img src="/images/ai_robot.png" class="ai-avatar" alt="AI"><p class="ai-text">黃小謙深蹲品質提升，可維持課表；陳小莉肩部角度不足，建議降低組數並加入暖身伸展。</p></div></div>`;}
function trackingItem(name, title, meta, status, cls) {return `<div class="train-item clickable" onclick="goCaseDetail('${name}')"><img src="/images/image_1.png" alt="${name}"><div><b>${name}｜${title}</b><div class="small">${meta}</div></div><span class="pill ${cls}">${status}</span></div>`;}

/**
 * Patient Home 2.0 (ReMotion 2.0 Phase 2, refined in Phase 2.5). Three
 * clearly distinct entry points by usage priority: A Header, B 今日復健
 * (real assigned schedule — the actual therapist-prescribed plan),
 * C AI 今日建議 (a visually distinct "feature" card, assessment-gated,
 * never an exercise list — the future Recommendation Engine's output),
 * D 自主練習 (deliberately lightweight/secondary — patient browsing the
 * catalog on their own, not therapist- or AI-driven), E 我的進度 (real
 * analysisRecords/gameProfile numbers only, one unified card).
 */
patientHome = function() {
  const patientId = getCurrentPatientId();
  const schedule = getPatientScheduleForDate(patientId, todayStr());
  const exercises = schedule?.exercises || [];
  const completedCount = exercises.filter((e) => e.status === "completed").length;

  // Phase 4 — real, deterministic gamification numbers (see
  // js/data/gamificationEngine.js). Untouched in Phase 4.1/4.2 — these
  // sections are presentation-only polish.
  const todayStatus = getTodayStructuredStatus(patientId);
  const gamification = gamificationEngine.getGamificationSummary(state.user.id);
  const greetingLines = buildHomeGreetingLines(todayStatus);
  // Phase 4.2 — priority logic (assigned > recommendation > self practice)
  // is unchanged, but it no longer renders as a standalone full-width
  // button (spec section 8): each candidate action already lives inside
  // its own natural card below, so this is only used to give the single
  // highest-priority card a subtle "look here first" focus accent.
  const primaryAction = getPrimaryHomeAction(todayStatus);
  const isAssignedFocus = primaryAction.fn === "goSchedule()";
  const isSelfPracticeFocus = primaryAction.fn === "goSelfPracticeLibrary()";

  const hasTherapist = relationService.findAcceptedByPatientId(patientId).length > 0;
  let inviteCardHtml = "";
  if (!hasTherapist) {
    inviteCardHtml = renderInviteCodeCard();
  } else if (state.inviteMessage) {
    // one-time success banner right after accepting an invite; cleared so it
    // doesn't linger on subsequent renders of this same page
    inviteCardHtml = `<div class="card" style="margin-bottom:14px;"><div class="small" style="color:#2e7d32;">${state.inviteMessage}</div></div>`;
    state.inviteMessage = null;
  }
  let successBannerHtml = "";
  if (state.assessmentSuccessMessage) {
    successBannerHtml = `<div class="card" style="margin-bottom:14px;"><div class="small" style="color:#2e7d32;">${state.assessmentSuccessMessage}</div></div>`;
    state.assessmentSuccessMessage = null;
  }

  // Greeting + robot companion — Phase 4.4: a fixed 4-line hierarchy
  // (time greeting / status / next-step / encouragement) instead of one
  // comma-joined sentence whose length varies with the underlying
  // numbers. Status and next-step are always split into two short
  // fragments — neither carries a trailing period (spec section 3) — and
  // are shown in the same strong dark weight; the encouragement line
  // stays small/muted. One very low-opacity decorative sparkle, purely
  // cosmetic (pointer-events disabled, never over the text or robot).
  const encouragementText = buildHomeEncouragementText(todayStatus);
  const companionBannerHtml = `<div class="home-companion-banner">
    <img class="home-companion-decor" src="/images/gamification/sparkle_03.png" alt="" />
    <div class="home-companion-text">
      <div class="home-companion-greeting">${getTimeGreetingPrefix()}，${state.user.name}</div>
      <b class="home-companion-message">${greetingLines.status}</b>
      ${greetingLines.next ? `<b class="home-companion-message">${greetingLines.next}</b>` : ""}
      <div class="small home-companion-encourage">${encouragementText}</div>
    </div>
    <img class="robot-avatar robot-avatar-xl" src="/images/robot/robot_encourage.png" alt="AI 復健陪伴機器人" />
  </div>`;

  // Level / XP / streak — compact status strip, still never the focal
  // point. Phase 4.4: dropped the achievement-count aux row (spec section
  // 5) — it duplicated the same number already shown in full in the 我的
  //成就 card below, and crowded out the streak number's readability. The
  // achievement count itself isn't gone from the app, just no longer
  // repeated here. Streak now gets the aux column to itself, with a
  // label under it so "2 天" reads clearly rather than being squeezed.
  const xpToNextLevel = gamification.nextLevelXp - gamification.currentLevelXp;
  const streakHtml = gamification.streak > 0
    ? `<img class="level-xp-aux-icon" src="/images/gamification/streak_fire.png" alt="" /><b>${gamification.streak} 天</b>`
    : `<img class="level-xp-aux-icon" src="/images/gamification/streak_fire.png" alt="" style="opacity:.35" /><b class="muted-value">—</b>`;
  const levelXpCardHtml = `<div class="level-xp-card">
    <div class="level-xp-badge"><span class="level-xp-badge-num">${gamification.level}</span><span class="level-xp-badge-label">Lv.</span></div>
    <div class="level-xp-main">
      <div class="level-xp-title-row"><b>${gamification.title}</b><span class="small level-xp-amount"><img class="xp-icon-inline" src="/images/gamification/xp_coin.png" alt="" />${gamification.currentLevelXp} / ${gamification.nextLevelXp} XP</span></div>
      <div class="xp-track gamified"><span style="width:${gamification.xpPercent}%"></span><img class="xp-track-marker" src="/images/gamification/star_gold.png" alt="" style="left:${gamification.xpPercent}%" /></div>
      <div class="level-xp-next-hint">再獲得 ${xpToNextLevel} XP 升級 Lv.${gamification.level + 1}</div>
    </div>
    <div class="level-xp-aux">
      <div class="level-xp-aux-row">${streakHtml}</div>
      <span class="level-xp-aux-label">連續復健</span>
    </div>
  </div>`;

  // Recommendation data is computed here (once) because both the 今日復健
  // empty-state (which offers to route into it) and the AI 建議 card below
  // need it — avoids fetching/enriching it twice.
  const activeAssessment = assessmentService.getActiveByPatientId(patientId);
  const recommendation = activeAssessment ? getTodaysRecommendationForPatient(patientId, activeAssessment) : null;
  const recommendationItems = recommendation ? recommendation.items : [];
  const recommendationSummary = summarizeRecommendationItems(recommendationItems);
  const hasUsableRecommendation = !!activeAssessment && recommendationSummary.itemCount > 0;

  // Phase 7.1.1 — 我的課表: a compact full-width horizontal summary card
  // (Home IA restructure spec section 6), reusing the exact same
  // schedule/exercises/completedCount data already computed above. The
  // previous richer "今日復健" hero (thumbnail + inline status pill as
  // Home's main task card) is intentionally replaced with a shorter
  // summary row here — full detail still lives on todaySchedulePage()
  // via goSchedule(), unchanged.
  // Phase 7.1.2 — added a real existing calendar/checklist illustration
  // (streak_calendar.png) on the left; this asset was not used anywhere
  // else in the app (grepped app.js before adding it), and its semantics
  // (calendar + checkmarks) are a genuine match for "my schedule". Text/
  // CTA/data/route below are unchanged.
  const scheduleImageHtml = `<img class="home-schedule-image" src="/images/gamification/streak_calendar.png" alt="" />`;
  let myScheduleCardHtml;
  if (schedule && exercises.length) {
    const isScheduleComplete = schedule.status === "completed";
    const scheduleCtaLabel = isScheduleComplete ? "查看" : "繼續復健";
    myScheduleCardHtml = `
      <div class="card home-schedule-card ${isAssignedFocus ? "home-focus-card" : ""}">
        <div class="home-schedule-row clickable" onclick="goSchedule()">
          ${scheduleImageHtml}
          <div class="home-schedule-main">
            <div class="home-schedule-text">
              <b>我的課表</b>
              <div class="small">今日 ${exercises.length} 項・已完成 ${completedCount} / ${exercises.length}</div>
            </div>
            <span class="card-inline-cta">${scheduleCtaLabel} →</span>
          </div>
        </div>
        <div class="home-schedule-bar">${renderProgressBar(completedCount, exercises.length)}</div>
      </div>`;
  } else {
    // Compact, friendly empty state — never a bare "目前沒有……" message.
    const emptyCtaLabel = hasUsableRecommendation ? "查看今日建議" : "前往自主練習";
    const emptyCtaFn = hasUsableRecommendation ? "goTodaysRecommendation()" : "goSelfPracticeLibrary()";
    myScheduleCardHtml = `
      <div class="card home-schedule-card">
        <div class="home-schedule-row">
          ${scheduleImageHtml}
          <div class="home-schedule-main">
            <div class="home-schedule-text">
              <b>我的課表</b>
              <div class="small">今天沒有指定課表</div>
            </div>
            <span class="card-inline-cta" onclick="${emptyCtaFn}">${emptyCtaLabel} →</span>
          </div>
        </div>
      </div>`;
  }

  // 自主練習 — compact full-width row (icon + text + arrow), ~72-88px tall.
  // exercise_plan.png was replaced with a genuinely transparent asset
  // (verified via raw alpha channel — corners/edges are alpha=0), so the
  // icon-tile wrapper that used to hide its old opaque white canvas has
  // been removed; the icon now sits directly in the row.
  const selfPracticeSectionHtml = `<div class="secondary-section-card clickable ${isSelfPracticeFocus ? "home-focus-card" : ""}" onclick="goSelfPracticeLibrary()">
    <img class="secondary-section-icon" src="/images/exercise/exercise_plan.png" alt="" />
    <div class="secondary-section-text"><b>想自己練？</b><div class="small">依部位、難度或目標自由選擇</div></div>
    <span class="more-link">→</span>
  </div>`;

  // Phase 7.1.1 — AI 動態功能評估 becomes Home's primary featured section
  // (IA restructure spec sections 3-4), replacing the old AI 個人化建議
  // hero's visual role/position. Reuses the exact same soft-green gradient
  // card language already established for that old hero (.ai-recommend-card)
  // via a new class with the same declarations — no new colors, no new
  // visual system.
  //
  // Phase 7.1.1 UI Asset Integration — the real hero illustration
  // (ai_dynamic_assessment_hero.png, "女生＋肩部偵測＋人體分析板") and the
  // 動態功能檢測 action icon (ai_dynamic_assessment_icon.png, ReMotion
  // waving robot) were manually added to public/images/Medical/body_health/
  // and are wired in here; robot_wave.png is no longer used by this action
  // (other pages that used it are untouched).
  //
  // "評估結果" stays a real disabled state driven by real data: the
  // functionalAssessmentSessions schema (Phase 7.1) never produces a
  // "completed" status yet, and no Result route exists yet either — so
  // this is never rendered as fake-clickable, per this phase's explicit
  // "do not build a fake result page" rule.
  const hasCompletedFunctionalAssessment = functionalAssessmentService
    .getByPatientId(patientId)
    .some((s) => s.status === "completed");
  const functionalAssessmentResultSub = hasCompletedFunctionalAssessment ? "查看功能評估結果" : "完成首次評估後查看";
  const functionalAssessmentSectionHtml = `<div class="card functional-assessment-feature-card">
    <div class="functional-assessment-feature-header">
      <div class="functional-assessment-feature-text">
        <b class="functional-assessment-feature-title">AI 動態功能評估</b>
        <div class="small">先了解目前的活動表現，再提供更適合你的復健建議</div>
      </div>
      <img class="functional-assessment-feature-hero-img" src="/images/Medical/body_health/ai_dynamic_assessment_hero.png" alt="" />
    </div>
    <div class="functional-assessment-actions">
      <div class="functional-assessment-action primary clickable" onclick="goFunctionalAssessmentBodyRegion()">
        <img class="functional-assessment-action-icon" src="/images/Medical/body_health/ai_dynamic_assessment_icon.png" alt="" />
        <b class="functional-assessment-action-title">動態功能檢測</b>
        <div class="small functional-assessment-action-sub">開始進行動作檢測</div>
      </div>
      <div class="functional-assessment-action secondary locked" aria-disabled="true">
        <img class="functional-assessment-action-icon" src="/images/Medical/body_health/medical_recovery_progress.png" alt="" />
        <b class="functional-assessment-action-title">評估結果</b>
        <div class="small functional-assessment-action-sub">${functionalAssessmentResultSub}</div>
      </div>
    </div>
  </div>`;

  // 我的成就 preview — at most 3 unlocked badges + the next locked one
  // (never all 5), real "下一個目標" hint from gamificationEngine's
  // remainingHint (unlock thresholds unchanged). Its own "我的成就" header
  // lives INSIDE the card — no external section title (Phase 4.3 spec
  // section 1: no duplicated heading-then-card pattern).
  const unlockedAchievements = gamification.achievements.filter((a) => a.unlocked);
  const nextLockedAchievement = gamification.achievements.find((a) => !a.unlocked);
  const shownBadges = [...unlockedAchievements.slice(0, 3), ...(nextLockedAchievement ? [nextLockedAchievement] : [])];
  const nextGoalHtml = nextLockedAchievement
    ? `<div class="small achievement-next-goal">下一個目標：${nextLockedAchievement.remainingHint ? `${nextLockedAchievement.remainingHint}「${nextLockedAchievement.title}」` : nextLockedAchievement.title}</div>`
    : `<div class="small achievement-next-goal">目前的成就已經全部解鎖了！</div>`;
  // Phase 6.4.2 report section 5/29 — restored to a half-width card
  // (home-half-card) sitting side by side with 我的進度 again. Only the
  // CONTAINER changed back from Phase 6.4's full-width stack; achievement
  // data/logic/thresholds are completely untouched below.
  const achievementPreviewHtml = `<div class="card home-half-card achievement-preview-card clickable" onclick="goAchievements()">
    <div class="row" style="justify-content:space-between; align-items:center;">
      <b>我的成就</b><span class="more-link">查看全部 →</span>
    </div>
    <div class="small" style="margin:2px 0 8px;">已解鎖 ${gamification.unlockedCount} / ${gamification.totalAchievements}</div>
    <div class="achievement-badge-row">
      ${shownBadges
        .map((a) => `<div class="achievement-badge-mini ${a.unlocked ? "" : "locked"}" title="${a.title}">${a.unlocked ? `<img src="${a.icon}" alt="${a.title}" />` : `<span class="achievement-badge-lock">?</span>`}</div>`)
        .join("")}
    </div>
    ${nextGoalHtml}
  </div>`;

  // 我的進度 — Phase 6.4.2 report section 6/7: still the compact summary
  // Phase 6.4 established (Home only ever answers "did I train recently?"),
  // now made more visual: a 7-day mini star trail (reusing
  // buildWeekdayStrip() — the exact same real per-day data the full
  // Progress page's Weekly Activity card uses, just rendered tiny) plus a
  // small highlight visual, instead of plain text-only stats. Every number
  // still comes from buildWeeklyTrainingProgress()/buildTrainingHistoryEntry()
  // over real analysisRecords.
  const patientIdForProgress = state.user.id;
  const allAnalysisRecords = analysisService.getByPatientId(patientIdForProgress);
  const weeklyProgress = buildWeeklyTrainingProgress(allAnalysisRecords);
  const recentEntry = weeklyProgress.latestRecord ? buildTrainingHistoryEntry(weeklyProgress.latestRecord) : null;

  let homeProgressBodyHtml;
  if (allAnalysisRecords.length === 0) {
    // Section 25 (Phase 6.4) empty state: small robot + a plain CTA line, no fabricated stat.
    homeProgressBodyHtml = `<div class="home-progress-empty">
      <img class="home-progress-empty-robot" src="/images/robot/robot_encourage.png" alt="" />
      <div class="small">開始第一次練習吧</div>
    </div>`;
  } else {
    // Right-side visual: star_glow marks "there was real activity this
    // week" (report section 4's "milestone/active state" semantic),
    // robot_encourage marks "not yet" — never a fabricated star-count.
    const visualSrc = weeklyProgress.sessionCount > 0 ? "/images/gamification/star_glow_01.png" : "/images/robot/robot_encourage.png";
    const recentLabel = recentEntry ? formatHistoryGroupLabel(formatDateStr(new Date(recentEntry.completedAt))) : "";
    const weekStarMiniHtml = renderHomeWeekStarMini(buildWeekdayStrip(weeklyProgress.completedByDay));
    homeProgressBodyHtml = `<div class="home-progress-main-row">
        <div>
          <div class="small">本週完成</div>
          <div class="home-progress-week-number">${weeklyProgress.sessionCount} 次</div>
        </div>
        <img class="home-progress-visual" src="${visualSrc}" alt="" />
      </div>
      <div class="home-week-star-mini-row">${weekStarMiniHtml}</div>
      <div class="home-progress-bottom-row">
        ${recentEntry && recentEntry.xpEarned != null ? `<span class="home-progress-xp-line"><img class="home-progress-xp-icon" src="/images/gamification/xp_coin.png" alt="" />+${recentEntry.xpEarned} XP</span>` : ""}
        ${recentEntry ? `<span class="small home-progress-recent-line">最近：${recentEntry.exerciseName} · ${recentLabel}</span>` : ""}
      </div>`;
  }

  const progressCardHtml = `<div class="card home-half-card home-progress-compact clickable" onclick="goActionRecords()">
    <div class="row" style="justify-content:space-between; align-items:center;">
      <b>我的進度</b><span class="more-link">›</span>
    </div>
    ${homeProgressBodyHtml}
  </div>`;

  // Phase 4.4 — the bell was a non-functional placeholder (no notification
  // feature exists anywhere in the app). Replaced with a real account
  // entry point into the existing Profile tab — reuses switchTab(), no
  // new auth architecture, no risk of accidentally logging anyone out.
  const accountIconHtml = `<img class="icon clickable" src="/images/profile.png" alt="帳號" onclick="switchTab('profile')" />`;

  // Phase 7.1.1 — Home IA restructure: Header -> Greeting/Level/XP
  // (unchanged) -> AI 動態功能評估 (new featured section) -> 我的課表 ->
  // 想自己練？ -> 我的進度｜我的成就. The old AI 個人化建議 hero
  // (aiPlanCardHtml) is intentionally no longer rendered here — the
  // Recommendation engine/service/routes/pages themselves are untouched,
  // reachable via 我的課表's own CTA when no assigned schedule exists.
  return `<div class="top-profile-container"><div class="header"><h1 class="page-title">Re<span class="logo-dark">Motion</span></h1><div class="top-actions">${accountIconHtml}</div></div></div>${companionBannerHtml}${levelXpCardHtml}${inviteCardHtml}${successBannerHtml}${functionalAssessmentSectionHtml}${myScheduleCardHtml}${selfPracticeSectionHtml}<div class="home-two-col">${progressCardHtml}${achievementPreviewHtml}</div>`;
};
// DEPRECATED (Phase 6.5 report section 21) — this was the "Training
// Landing" page previously rendered by the bottom-nav 訓練 tab. It only
// ever duplicated a shortcut into todaySchedulePage() (我的復健課表, via
// goSchedule()) plus 自主練習/動作紀錄/冒險地圖 links, none of which were
// unique to this page. renderDashboard() now renders todaySchedulePage()
// directly for the "work" tab, and those three secondary links moved onto
// todaySchedulePage() itself (冒險地圖 moved to profilePage() instead —
// see that page's own comment on why). No remaining caller references
// trainPage() anywhere (confirmed via a full-file audit) — kept, not
// deleted, per this phase's explicit instruction.
trainPage = function() {
  const patientId = getCurrentPatientId();
  const schedule = getPatientScheduleForDate(patientId, todayStr());
  const exercises = schedule?.exercises || [];
  const completedCount = exercises.filter((ex) => ex.status === "completed").length;
  const subtitle = schedule
    ? `今日課表由復健師派發，完成 ${completedCount}/${exercises.length} 項。`
    : "今日課表由復健師派發，完成後將同步數據。";
  return `<div class="header"><div><h1 class="page-title">訓練</h1><div class="small">${subtitle}</div></div><img class="icon" src="/images/calendar.png" alt="課表" /></div><div class="card demo-flow-card clickable" onclick="goSchedule()"><b>我的課表 / 日程表</b><div class="small">查看今日任務、執行時間與完成狀態。</div></div>${renderScheduleTaskCards(schedule)}<div class="card clickable" style="margin-top:12px;" onclick="goSelfPracticeLibrary()"><b>自主練習</b><div class="small">不需要復健師，自行瀏覽並練習復健動作。</div></div><div class="row" style="margin-top:12px;"><button class="btn btn-light" style="flex:1" onclick="goActionRecords()">動作紀錄</button><button class="btn btn-light" style="flex:1" onclick="goMap()">冒險地圖</button></div>`;
};
therapistHome = function() {
  const isDev = state.user.isDeveloperAccount === true;
  const relations = relationService.findAcceptedByTherapistId(state.user.id);
  const patients = relations.map((r) => userService.getById(r.patientId)).filter(Boolean);
  const caseListHtml = patients.length
    ? patients
        .map((p) => `<div class="train-item clickable" onclick="goCaseDetail('${p.id}')"><img src="/images/image_1.png" alt="${p.name}" /><div><b>${p.name}</b><div class="small">帳號：${p.account}</div></div><span class="pill active-status">查看</span></div>`)
        .join("")
    : `<div class="card muted center">${isDev ? "開發管理帳號不管理個案。" : "目前尚無個案，請至「個案」查看您的邀請碼。"}</div>`;
  const nameTagHtml = isDev
    ? `<strong>${state.user.name} 復健師</strong><br /><small class="small" style="color: var(--primary-dark); font-weight:700;">開發管理帳號</small>`
    : `<strong>${state.user.name} 復健師</strong><br /><small class="small">專業守護每一步進步</small>`;
  const dashboardCardHtml = isDev
    ? `<div class="card dashboard-card"><b>開發管理帳號</b><div class="small">此帳號不派發課表，個案管理功能請改用 therapist02。</div></div>`
    : `<div class="card dashboard-card clickable" onclick="goCaseList()"><b>個案管理</b><div class="small">查看或複製您的邀請碼，管理已加入的個案。</div></div>`;

  return `<div class="header"><h1 class="page-title">ReMotion</h1><img class="icon" src="/images/notice.png" alt="通知" /></div><div class="user-row"><div class="avatar">${state.user.name[0]}</div><div>${nameTagHtml}</div></div><div class="stats"><div class="stat"><span class="small">追蹤個案</span><b>${patients.length}</b></div><div class="stat"><span class="small">邀請碼</span><b style="font-size:14px;">${state.user.inviteCode || ""}</b></div></div>${dashboardCardHtml}<h3 class="section-title">我的個案</h3><div class="coach-list">${caseListHtml}</div><button class="btn btn-primary full" onclick="goCaseList()">查看個案管理 →</button>`;
};
assignPlanPage = function() {
  if (!state.assignDraft) {
    const patient = userService.getById(state.selectedPatientId);
    loadAssignDraftForDate(state.selectedPatientId, patient ? patient.name : "個案", todayStr());
  }
  const draft = state.assignDraft;
  const isUpdate = !!draft.scheduleId;

  const categories = [...new Set(exerciseService.list().map((ex) => ex.category).filter(Boolean))];
  const category = state.assignCategory || "";
  const filtered = category ? exerciseService.findByCategory(category) : [];
  const pickedId = category && filtered.some((ex) => ex.exercise_id === state.assignPickedId)
    ? state.assignPickedId
    : "";
  state.assignPickedId = pickedId;
  const pickedExercise = pickedId ? exerciseService.getById(pickedId) : null;
  const isPickedDuration = pickedExercise && pickedExercise.measurementType === "duration";
  const metricLabel = pickedExercise ? (isPickedDuration ? "秒數" : "次數") : "次數／秒數";
  const metricDefault = pickedExercise
    ? (isPickedDuration ? pickedExercise.defaultDurationSeconds : pickedExercise.defaultRepetitions)
    : null;

  const addedListHtml = draft.exercises.length
    ? draft.exercises
        .map((ex, idx) => {
          const metricInputHtml = ex.repetitions != null
            ? `<input type="number" min="1" placeholder="次數" value="${ex.repetitions}" style="flex:1" onchange="updateDraftExerciseField(${idx}, 'repetitions', this.value)" />`
            : `<input type="number" min="1" placeholder="秒數" value="${ex.durationSeconds}" style="flex:1" onchange="updateDraftExerciseField(${idx}, 'durationSeconds', this.value)" />`;
          return `<div class="card" style="margin-bottom:8px;">
            <div class="row" style="justify-content:space-between; align-items:center;">
              <b>${ex.exerciseName}</b>
              <span class="more-link" onclick="removeExerciseFromAssignDraft(${idx})">移除</span>
            </div>
            <div class="row" style="margin-top:8px;">
              <input type="number" min="1" placeholder="組數" value="${ex.sets}" style="flex:1" onchange="updateDraftExerciseField(${idx}, 'sets', this.value)" />
              ${metricInputHtml}
            </div>
            <input placeholder="注意事項" value="${ex.instructions || ""}" style="margin-top:8px;" onchange="updateDraftExerciseField(${idx}, 'instructions', this.value)" />
            <div class="small" style="margin-top:6px;">狀態：${SCHEDULE_STATUS_LABELS[ex.status] || "待開始"}｜獎勵 +${ex.rewardXp || 0} XP</div>
          </div>`;
        })
        .join("")
    : `<div class="card muted center">尚未加入任何動作</div>`;

  const summary = calculateScheduleSummary(draft.exercises);
  const comparisonText = buildDurationComparisonText(summary.estimatedDurationMinutes, draft.targetDurationMinutes);

  return `<div class="header"><button class="btn btn-light detail-back-btn" onclick="if(confirmLeaveAssignDraft()) goCaseDetail('${draft.patientId}')">返回</button><b>${isUpdate ? "編輯課表" : "派發課表"}</b><img class="icon" src="/images/calendar.png" alt="課表" /></div><div class="card"><b>指派對象：${draft.patientName}</b><div class="small">${isUpdate ? "此日期已有課表，修改後請按下方按鈕更新。" : "此日期尚無課表，填寫後可建立新課表。"}</div></div><h3 class="section-title">課表日期</h3><div class="card"><input type="date" id="assignDateInput" value="${draft.date}" onchange="onAssignDateChange()" /></div><h3 class="section-title">課表基本資料</h3><div class="card"><div class="small">課表名稱</div><input id="assignTitleInput" value="${draft.title}" onchange="onAssignTitleChange()" /><div style="height:10px"></div><div class="small">課表目標（可手動修改，系統會依動作自動建議）</div><input id="assignGoalInput" value="${draft.goal}" onchange="onAssignGoalChange()" /><div style="height:10px"></div><div class="small">目標訓練時間（分鐘，僅供排程參考，非醫療建議）</div><input id="assignTargetDurationInput" type="number" min="1" value="${draft.targetDurationMinutes}" onchange="onAssignTargetDurationChange()" /></div><h3 class="section-title">新增訓練動作</h3><div class="card"><select id="categoryFilter" onchange="onAssignCategoryChange()"><option value="" ${category === "" ? "selected" : ""}>請選擇分類</option>${categories.map((c) => `<option value="${c}" ${category === c ? "selected" : ""}>${c}</option>`).join("")}</select><div style="height:8px"></div><select id="exercisePicker" onchange="onAssignExerciseChange()" ${category ? "" : "disabled"}><option value="" ${pickedId === "" ? "selected" : ""}>請先選擇動作</option>${filtered.map((ex) => `<option value="${ex.exercise_id}" ${ex.exercise_id === pickedId ? "selected" : ""}>${ex.exercise_name}</option>`).join("")}</select><div style="height:8px"></div><div class="row"><input id="pickSets" type="number" min="1" placeholder="組數" value="${pickedExercise ? pickedExercise.defaultSets : ""}" style="flex:1" /><input id="pickMetricValue" type="number" min="1" placeholder="${metricLabel}" value="${metricDefault != null ? metricDefault : ""}" style="flex:1" /></div><div style="height:8px"></div><input id="pickInstructions" placeholder="注意事項" value="${pickedExercise ? (pickedExercise.precautions || "") : ""}" /><div style="height:10px"></div><button class="btn btn-light" style="width:100%" onclick="addExerciseToAssignDraft()">+ 新增此動作到課表</button></div><h3 class="section-title">已加入的動作（${draft.exercises.length}）</h3>${addedListHtml}<h3 class="section-title">課表摘要</h3><div class="card"><div>已加入：${summary.exerciseCount} 個動作</div><div>總組數：${summary.totalSets} 組</div><div>預估時間：約 ${summary.estimatedDurationMinutes} 分鐘${summary.hasUnknownEstimate ? "（部分動作時間待確認）" : ""}</div><div>目標時間：${draft.targetDurationMinutes} 分鐘</div><div>完成獎勵：${summary.totalRewardXp} XP</div>${comparisonText ? `<div class="small" style="margin-top:6px;">${comparisonText}</div>` : ""}</div><button class="btn btn-primary full" onclick="submitAssignPlan()">${isUpdate ? "更新課表" : "派發並同步至患者端"}</button>`;
};

function onAssignCategoryChange() {
  state.assignCategory = document.getElementById("categoryFilter").value;
  state.assignPickedId = "";
  render();
}

function onAssignExerciseChange() {
  state.assignPickedId = document.getElementById("exercisePicker").value;
  render();
}

function onAssignDateChange() {
  const newDate = document.getElementById("assignDateInput").value;
  if (!newDate) return render();
  if (!confirmLeaveAssignDraft()) return render();
  const draft = state.assignDraft;
  loadAssignDraftForDate(draft.patientId, draft.patientName, newDate);
  render();
}

function onAssignTitleChange() {
  state.assignDraft.title = document.getElementById("assignTitleInput").value;
  state.assignDraftDirty = true;
  render();
}

function onAssignGoalChange() {
  state.assignDraft.goal = document.getElementById("assignGoalInput").value;
  state.assignGoalManuallyEdited = true;
  state.assignDraftDirty = true;
  render();
}

function onAssignTargetDurationChange() {
  const val = parseInt(document.getElementById("assignTargetDurationInput").value, 10);
  state.assignDraft.targetDurationMinutes = Number.isFinite(val) && val > 0 ? val : 0;
  state.assignDraftDirty = true;
  render();
}

function updateDraftExerciseField(index, field, rawValue) {
  const ex = state.assignDraft.exercises[index];
  if (!ex) return;
  if (field === "sets" || field === "repetitions" || field === "durationSeconds") {
    const num = parseInt(rawValue, 10);
    ex[field] = Number.isFinite(num) ? num : 0;
  } else {
    ex[field] = rawValue;
  }
  state.assignDraftDirty = true;
  syncAssignGoalIfNeeded();
  render();
}

function addExerciseToAssignDraft() {
  const categoryEl = document.getElementById("categoryFilter");
  const picker = document.getElementById("exercisePicker");
  if (!categoryEl.value) return alert("請先選擇動作分類");
  if (!picker.value) return alert("請先選擇動作");
  const ex = exerciseService.getById(picker.value);
  if (!ex) return alert("請選擇一個動作");

  if (state.assignDraft.exercises.some((e) => e.exerciseId === ex.exercise_id)) {
    return alert("此動作已加入課表，可直接修改原有設定。");
  }

  const sets = parseInt(document.getElementById("pickSets").value, 10);
  const metricValue = parseInt(document.getElementById("pickMetricValue").value, 10);
  const instructions = document.getElementById("pickInstructions").value.trim();
  if (!sets || sets < 1) return alert("請輸入有效組數");
  if (!metricValue || metricValue < 1) {
    return alert(ex.measurementType === "duration" ? "請輸入有效秒數" : "請輸入有效次數");
  }
  state.assignDraft.exercises.push({
    exerciseId: ex.exercise_id,
    exerciseName: ex.exercise_name,
    targetBodyPart: ex.target_muscle,
    sets,
    repetitions: ex.measurementType === "repetition" ? metricValue : null,
    durationSeconds: ex.measurementType === "duration" ? metricValue : null,
    instructions,
    status: "pending",
    analysisRequired: ex.analysisRequired,
    completedAt: null,
    analysisRecordId: null,
    rewardXp: ex.rewardXp,
    rewardStars: ex.rewardStars,
  });
  state.assignCategory = "";
  state.assignPickedId = "";
  state.assignDraftDirty = true;
  syncAssignGoalIfNeeded();
  render();
}

function removeExerciseFromAssignDraft(index) {
  state.assignDraft.exercises.splice(index, 1);
  state.assignDraftDirty = true;
  syncAssignGoalIfNeeded();
  render();
}

function submitAssignPlan() {
  const draft = state.assignDraft;
  const error = validateAssignDraft(draft);
  if (error) return alert(error);

  const isUpdate = !!draft.scheduleId;
  const summary = calculateScheduleSummary(draft.exercises);
  const completedCount = draft.exercises.filter((ex) => ex.status === "completed").length;
  const status = completedCount === 0 ? "pending" : (completedCount === draft.exercises.length ? "completed" : "in_progress");

  const payload = {
    patientId: draft.patientId,
    therapistId: state.user.id,
    date: draft.date,
    title: draft.title.trim(),
    goal: draft.goal || "",
    targetDurationMinutes: draft.targetDurationMinutes || 0,
    estimatedDurationMinutes: summary.estimatedDurationMinutes,
    status,
    exercises: draft.exercises,
    updatedAt: nowIso(),
  };

  const schedule = isUpdate
    ? scheduleService.update(draft.scheduleId, payload)
    : scheduleService.create({ id: generateId("schedule"), createdAt: nowIso(), ...payload });

  state.assignDraftDirty = false;
  alert(isUpdate ? "課表已成功更新。" : "課表已成功派發。");
  goCaseDetail(draft.patientId);
}
patientAchievementsPage = function() {
  // Phase 4: real, deterministic level/XP/achievement data — replaces the
  // old hardcoded demo numbers (Lv.12, XP 3850, six fake badges) so this
  // page can never disagree with Patient Home / Profile.
  const gamification = gamificationEngine.getGamificationSummary(state.user.id);
  const badgeGridHtml = gamification.achievements
    .map((a) =>
      a.unlocked
        ? badge(`<img class="badge-icon-img" src="${a.icon}" alt="" />`, a.title, a.desc)
        : `<div class="badge-card locked"><div class="badge-icon"><span class="achievement-badge-lock">?</span></div><b>${a.title}</b><span>${a.desc}</span></div>`
    )
    .join("");
  const nextLocked = gamification.achievements.find((a) => !a.unlocked);
  const nextGoalHtml = nextLocked
    ? `<h3 class="section-title">下一個目標</h3><div class="card"><b>${nextLocked.title}</b><div class="small">${nextLocked.desc}</div></div>`
    : `<h3 class="section-title">下一個目標</h3><div class="card muted center">目前的成就已經全部解鎖了！</div>`;
  return `<div class="header"><button class="btn btn-light" onclick="switchTab('profile')">返回</button><b>成就徽章</b></div><div class="score-hero"><div class="score-ring"><span>${gamification.level}</span><small>Lv.</small></div><div><h2>${gamification.title}</h2><p class="small">XP ${gamification.currentLevelXp} / ${gamification.nextLevelXp}</p><div class="xp-track wide"><span style="width:${gamification.xpPercent}%"></span></div></div></div><h3 class="section-title">已解鎖徽章（${gamification.unlockedCount} / ${gamification.totalAchievements}）</h3><div class="badge-grid">${badgeGridHtml}</div>${nextGoalHtml}`;
};
/**
 * ReMotion Phase 5.6.1 — HP02 (站姿髖屈曲) Pose Analysis PROTOTYPE.
 *
 * Deliberately minimal: proves Exercise Detail -> Camera -> MediaPipe
 * landmarks -> HP02 required landmarks -> readiness/framing -> hip flexion
 * angle can run end to end for a SECOND exercise, without building rep
 * counting, an FSM, quality scoring, feedback, or a polished training UI —
 * all of that is explicitly out of scope for this phase (see Phase 5.6.1
 * spec section 8/12). This block is a self-contained parallel path: it
 * does not call, modify, or share any module-level state with the squat
 * functions above (squatSessionMeta/squatSessionTracker/squatCameraController/
 * squatDetectionStability/squatTrainingState are all untouched by this code).
 *
 * Reused as-is, zero modification: getExercisePageContext(), navigateAfterSquat()
 * (already generic — keyed only on meta.mode/navigationOrigin/scheduleId/
 * exerciseIndex/exerciseId, no squat-specific checks inside it),
 * createSquatCameraController() (shared/cameraController.js, already has no
 * squat knowledge), createDetectionStabilityTracker()/getBodyReadiness()/
 * getFramingDistanceHint() (Phase 5.5.2 parameterized), computeHipFlexionAngles()
 * (js/ai/exercises/hipFlexion/poseMath.js).
 *
 * Phase 5.6.2 adds the rep FSM (js/ai/exercises/hipFlexion/session.js) —
 * still architecture-only: no target/hard-stop, no quality, no feedback,
 * no XP, no persistence. See Phase 5.6.2 report for the exact boundary.
 */
let hp02SessionMeta = null;
let hp02CameraController = null;
let hp02CanvasCtx = null;
let hp02DetectionStability = null;
let hp02SessionTracker = null;

function goHp02Detection() {
  const context = getExercisePageContext();
  if (!context) {
    alert("找不到動作資訊，請重新進入。");
    if (state.exerciseContext === "assigned") return goSchedule();
    return state.navigationOrigin === "recommendation" ? goTodaysRecommendation() : goSelfPracticeLibrary();
  }
  const { mode, schedule, ex } = context;
  hp02SessionMeta = {
    mode,
    navigationOrigin: state.navigationOrigin,
    scheduleId: mode === "assigned" ? schedule.id : null,
    exerciseIndex: mode === "assigned" ? state.selectedExerciseIndex : null,
    exerciseId: ex.exerciseId,
    exerciseName: ex.exerciseName,
    // Phase 5.6.2 report section 9 — draft skeleton field only. Left/right
    // target semantics (per-side fixed count vs therapist-configurable) are
    // explicitly [A DATA NEEDED]; nothing reads this field this phase, and
    // no hard-stop is wired to it.
    targetPerSide: null,
  };
  state.route = "hp02Detection";
  render();
  beginHp02CameraSession();
}

function hp02DetectionPage() {
  const exerciseName = hp02SessionMeta ? hp02SessionMeta.exerciseName : "站姿髖屈曲";
  return `
    <div class="header">
      <button class="btn btn-light detail-back-btn" onclick="exitHp02Detection()">返回</button>
      <b>Pose Analysis 原型（HP02）</b>
      <img class="icon" src="/images/ai_robot.png" alt="AI" />
    </div>
    <h2 style="margin:10px 0 4px;">${exerciseName}</h2>
    <div class="small" style="margin:0 0 10px; color:#888;">Phase 5.6.1 架構原型：僅顯示追蹤狀態與髖屈曲角度數值，尚未提供計次／評分／回饋，非正式訓練畫面。</div>
    <div class="squat-camera-wrap" id="hp02CameraWrap">
      <video id="hp02Video" class="squat-camera-video" playsinline muted autoplay></video>
      <canvas id="hp02OverlayCanvas" class="squat-overlay-canvas"></canvas>
      <div class="squat-status-overlay" id="hp02StatusOverlay">正在請求攝影機權限…</div>
    </div>
    <div class="card" id="hp02DebugPanel" style="display:grid; gap:4px; font-family:monospace;">
      <div class="small">Readiness: <b id="hp02Readiness">--</b></div>
      <div class="small">Framing: <b id="hp02Framing">--</b></div>
      <div class="small">Left hip angle (raw geometry, not a validated ROM): <b id="hp02LeftAngle">--</b></div>
      <div class="small">Right hip angle (raw geometry, not a validated ROM): <b id="hp02RightAngle">--</b></div>
      <div class="small">Left FSM state: <b id="hp02LeftState">--</b>　reps: <b id="hp02LeftReps">0</b>　last dur: <b id="hp02LeftLastDur">--</b></div>
      <div class="small">Right FSM state: <b id="hp02RightState">--</b>　reps: <b id="hp02RightReps">0</b>　last dur: <b id="hp02RightLastDur">--</b></div>
    </div>
    <div class="small" style="margin:6px 0; color:#888;">Rep counting here is an ENGINEERING PROTOTYPE (Phase 5.6.2): counts "did a deliberate raise-and-lower cycle happen", not movement quality. Thresholds are provisional defaults pending real-device calibration, not validated clinical values.</div>
    <div class="small" style="margin:10px 0; color:#888;">本頁面僅為 Pose Analysis 架構驗證原型，角度數值為原始幾何量測，尚未經過臨床驗證，不代表醫療判斷。</div>
    <button class="btn btn-light full" onclick="exitHp02Detection()">結束原型測試</button>
  `;
}

function beginHp02CameraSession() {
  const videoEl = document.getElementById("hp02Video");
  const canvasEl = document.getElementById("hp02OverlayCanvas");
  if (!videoEl || !canvasEl) return;
  stopHp02Camera();
  hp02CanvasCtx = canvasEl.getContext("2d");
  hp02DetectionStability = createDetectionStabilityTracker(SQUAT_THRESHOLDS, HP02_REQUIRED_LANDMARKS);
  hp02SessionTracker = createHipFlexionSession();
  hp02CameraController = createSquatCameraController({
    videoEl,
    onStatus: handleHp02CameraStatus,
    onFrame: handleHp02Frame,
    onFatalError: handleHp02FatalError,
  });
  hp02CameraController.start();
}

function handleHp02CameraStatus(status) {
  if (state.route !== "hp02Detection") return;
  const overlay = document.getElementById("hp02StatusOverlay");
  if (!overlay) return;
  if (status === "requesting-permission") overlay.textContent = "正在請求攝影機權限…";
  else if (status === "loading-model") overlay.textContent = "AI 模型載入中，請稍候…";
  else if (status === "ready") overlay.textContent = "";
}

function handleHp02FatalError(message) {
  if (state.route !== "hp02Detection") return;
  const overlay = document.getElementById("hp02StatusOverlay");
  if (overlay) overlay.textContent = message;
}

/**
 * Deliberately a small duplicate of drawSquatSkeleton() rather than a
 * shared/parameterized function — this phase's minimal-diff principle
 * favors a cheap ~15-line duplicate over touching squat's own drawing
 * function or its hardcoded "squatOverlayCanvas"/"squatVideo" element ids.
 */
function drawHp02Skeleton(landmarks) {
  const canvas = document.getElementById("hp02OverlayCanvas");
  const video = document.getElementById("hp02Video");
  if (!canvas || !hp02CanvasCtx) return;
  if (video && video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = hp02CanvasCtx;
  if (!canvas.width || !canvas.height) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  const minVis = SQUAT_THRESHOLDS.MIN_VISIBILITY;
  ctx.strokeStyle = "#7ea866";
  ctx.lineWidth = Math.max(2, canvas.width * 0.004);
  POSE_CONNECTIONS.forEach(({ start, end }) => {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) return;
    if ((a.visibility != null && a.visibility < minVis) || (b.visibility != null && b.visibility < minVis)) return;
    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  });
  ctx.fillStyle = "#5f8d49";
  landmarks.forEach((p) => {
    if (!p || (p.visibility != null && p.visibility < minVis)) return;
    ctx.beginPath();
    ctx.arc(p.x * canvas.width, p.y * canvas.height, Math.max(2, canvas.width * 0.006), 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * Phase 5.6.2 adds rep-FSM counting (js/ai/exercises/hipFlexion/session.js)
 * on top of Phase 5.6.1's readiness/framing/angle display — still no
 * quality/score/feedback/XP/hard-stop, all explicitly deferred (see report
 * section 12/13/18/19). bodyReady reuses the exact same parameterized
 * hasFullLowerBody() gate LE01 uses, just with HP02_REQUIRED_LANDMARKS.
 */
function handleHp02Frame(landmarks, timestamp) {
  if (state.route !== "hp02Detection" || !hp02DetectionStability) return;
  drawHp02Skeleton(landmarks);
  const { displayState, framing } = hp02DetectionStability.update(landmarks, timestamp);
  const readinessEl = document.getElementById("hp02Readiness");
  if (readinessEl) readinessEl.textContent = displayState;
  const framingEl = document.getElementById("hp02Framing");
  if (framingEl) framingEl.textContent = framing || "--";
  const angles = computeHipFlexionAngles(landmarks, SQUAT_THRESHOLDS);
  const leftEl = document.getElementById("hp02LeftAngle");
  if (leftEl) leftEl.textContent = angles.left != null ? `${Math.round(angles.left)}°` : "--";
  const rightEl = document.getElementById("hp02RightAngle");
  if (rightEl) rightEl.textContent = angles.right != null ? `${Math.round(angles.right)}°` : "--";

  if (!hp02SessionTracker) return;
  const bodyReady = !!landmarks && hasFullLowerBody(landmarks, SQUAT_THRESHOLDS, HP02_REQUIRED_LANDMARKS);
  hp02SessionTracker.processFrame({ timestamp, leftHipAngle: angles.left, rightHipAngle: angles.right, bodyReady });
  const summary = hp02SessionTracker.getSummary();
  const fmtDur = (ms) => (ms == null ? "--" : `${Math.round(ms)}ms`);
  const leftStateEl = document.getElementById("hp02LeftState");
  if (leftStateEl) leftStateEl.textContent = summary.left.state;
  const leftRepsEl = document.getElementById("hp02LeftReps");
  if (leftRepsEl) leftRepsEl.textContent = String(summary.left.completedReps);
  const leftDurEl = document.getElementById("hp02LeftLastDur");
  if (leftDurEl) leftDurEl.textContent = fmtDur(summary.left.lastRepDurationMs);
  const rightStateEl = document.getElementById("hp02RightState");
  if (rightStateEl) rightStateEl.textContent = summary.right.state;
  const rightRepsEl = document.getElementById("hp02RightReps");
  if (rightRepsEl) rightRepsEl.textContent = String(summary.right.completedReps);
  const rightDurEl = document.getElementById("hp02RightLastDur");
  if (rightDurEl) rightDurEl.textContent = fmtDur(summary.right.lastRepDurationMs);
}

function stopHp02Camera() {
  if (hp02CameraController) {
    hp02CameraController.stop();
    hp02CameraController = null;
  }
  hp02CanvasCtx = null;
  hp02DetectionStability = null;
  hp02SessionTracker = null;
}

/**
 * Phase 5.6.2 report section 17 — no persistence this phase (no
 * analysisRecord, no schedule write, no XP). The session summary would
 * otherwise just be lost on exit, so it's logged to the console only
 * (manual "結束原型測試" is the only way to leave, matching report section
 * 19: no SUCCESS/hard-stop, this is always a manual stop).
 */
function exitHp02Detection() {
  if (hp02SessionTracker) {
    console.log("HP02 prototype session summary (Phase 5.6.2, engineering data only):", hp02SessionTracker.getSummary());
  }
  stopHp02Camera();
  const meta = hp02SessionMeta;
  hp02SessionMeta = null;
  navigateAfterSquat(meta);
}

// ─────────────────────────────────────────────────────────────────────────
// CR05 坐姿抬膝：獨立於 HP02 的完整訓練路徑。
// ─────────────────────────────────────────────────────────────────────────
let cr05SessionMeta = null;
let cr05CameraController = null;
let cr05CanvasCtx = null;
let cr05DetectionStability = null;
let cr05SessionTracker = null;
let cr05TargetReached = false;
let cr05SessionFinalized = false;

function goCr05Detection() {
  const context = getExercisePageContext();
  if (!context) {
    alert("找不到動作資訊，請重新進入。");
    return state.exerciseContext === "assigned" ? goSchedule() : goSelfPracticeLibrary();
  }
  const { mode, schedule, ex } = context;
  if (mode === "assigned" && ex.status === "completed") return goExerciseDetail(schedule.id, state.selectedExerciseIndex);
  const activeRelation = mode === "self_practice" ? relationService.findAcceptedByPatientId(state.user.id)[0] : null;
  cr05SessionMeta = {
    mode,
    navigationOrigin: state.navigationOrigin,
    scheduleId: mode === "assigned" ? schedule.id : null,
    exerciseIndex: mode === "assigned" ? state.selectedExerciseIndex : null,
    exerciseId: ex.exerciseId,
    exerciseName: ex.exerciseName,
    patientId: state.user.id,
    therapistId: mode === "assigned" ? schedule.therapistId : (activeRelation ? activeRelation.therapistId : null),
    targetReps: calculateSquatTargetReps(ex),
    rewardXp: ex.rewardXp || DEFAULT_CR05_REWARD_XP,
  };
  cr05TargetReached = false;
  cr05SessionFinalized = false;
  state.route = "cr05Detection";
  render();
  beginCr05CameraSession();
}

function cr05DetectionPage() {
  const meta = cr05SessionMeta || { exerciseName: "坐姿抬膝", targetReps: 10 };
  return `
    <div class="header">
      <button class="btn btn-light detail-back-btn" onclick="exitCr05Detection()">返回</button>
      <b>AI 坐姿抬膝</b>
      <img class="icon" src="/images/ai_robot.png" alt="AI" />
    </div>
    <h2 style="margin:10px 0 4px;">${meta.exerciseName}</h2>
    <div class="small" style="margin-bottom:10px;">坐穩後左右腳輪流抬起；肩膀、髖部與雙膝需完整入鏡。</div>
    <div class="squat-camera-wrap" id="cr05CameraWrap">
      <video id="cr05Video" class="squat-camera-video" playsinline muted autoplay></video>
      <canvas id="cr05OverlayCanvas" class="squat-overlay-canvas"></canvas>
      <div class="squat-rep-counter" id="cr05RepCounter">
        <svg class="squat-rep-ring" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">
          <circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle>
          <circle class="squat-rep-ring-progress" id="cr05RepRingProgress" cx="36" cy="36" r="30"></circle>
        </svg>
        <div class="squat-rep-counter-text">
          <span id="cr05RepCounterValue">0</span><span class="squat-rep-counter-sep">/ ${meta.targetReps}</span>
        </div>
      </div>
      <div class="squat-readiness-indicator" id="cr05CameraReadinessIndicator"><span class="squat-readiness-dot" id="cr05CameraReadinessDot"></span><span id="cr05CameraReadinessText">尚未偵測</span></div>
      <div class="squat-status-overlay" id="cr05StatusOverlay">正在請求攝影機權限…</div>
    </div>
    <div class="stats" style="margin-top:12px;">
      <div class="stat"><span class="small">總次數</span><b><span id="cr05TotalReps">0</span> / ${meta.targetReps}</b></div>
      <div class="stat"><span class="small">左腳</span><b id="cr05LeftReps">0</b></div>
      <div class="stat"><span class="small">右腳</span><b id="cr05RightReps">0</b></div>
    </div>
    <div class="card" style="display:grid; gap:8px; margin-top:12px;">
      <div class="small">追蹤狀態：<b id="cr05Readiness">--</b></div>
      <div class="small">左髖角度：<b id="cr05LeftAngle">--</b>　右髖角度：<b id="cr05RightAngle">--</b></div>
      <div class="small">軀幹傾斜：<b id="cr05TrunkLean">--</b></div>
      <div class="small">即時提醒：<b id="cr05Feedback">請坐好並保持身體入鏡</b></div>
      <div class="small">目前原型分數：<b id="cr05LiveScore">--</b></div>
    </div>
    <div class="small" style="margin:10px 0; color:#888;">角度與分數是依 ReMotion 資料庫建立的原型工程判定，不代表醫療診斷。</div>
    <button class="btn btn-primary full" id="cr05FinishBtn" onclick="finalizeCr05Training()">結束並儲存結果</button>
    <button class="btn btn-light full" onclick="exitCr05Detection()">放棄本次訓練</button>
  `;
}

function beginCr05CameraSession() {
  const videoEl = document.getElementById("cr05Video");
  const canvasEl = document.getElementById("cr05OverlayCanvas");
  if (!videoEl || !canvasEl || !cr05SessionMeta) return;
  stopCr05Camera();
  cr05CanvasCtx = canvasEl.getContext("2d");
  cr05SessionTracker = createSeatedKneeRaiseSession({ targetReps: cr05SessionMeta.targetReps });
  cr05DetectionStability = createDetectionStabilityTracker(
    { ...SQUAT_THRESHOLDS, MIN_VISIBILITY: CR05_THRESHOLDS.MIN_VISIBILITY },
    CR05_REQUIRED_LANDMARKS,
  );
  cr05CameraController = createSquatCameraController({
    videoEl,
    onStatus: handleCr05CameraStatus,
    onFrame: handleCr05Frame,
    onFatalError: handleCr05FatalError,
  });
  cr05CameraController.start();
}

function handleCr05CameraStatus(status) {
  if (state.route !== "cr05Detection") return;
  const overlay = document.getElementById("cr05StatusOverlay");
  if (!overlay) return;
  if (status === "requesting-permission") overlay.textContent = "正在請求攝影機權限…";
  else if (status === "loading-model") overlay.textContent = "AI 模型載入中，請稍候…";
  else if (status === "ready") overlay.textContent = "";
}

function handleCr05FatalError(message) {
  if (state.route !== "cr05Detection") return;
  const overlay = document.getElementById("cr05StatusOverlay");
  if (overlay) overlay.textContent = message;
}

function drawCr05Skeleton(landmarks) {
  const canvas = document.getElementById("cr05OverlayCanvas");
  const video = document.getElementById("cr05Video");
  if (!canvas || !cr05CanvasCtx) return;
  if (video && video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  const ctx = cr05CanvasCtx;
  if (!canvas.width || !canvas.height) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!landmarks) return;
  ctx.strokeStyle = "#7ea866";
  ctx.fillStyle = "#5f8d49";
  ctx.lineWidth = Math.max(2, canvas.width * 0.004);
  POSE_CONNECTIONS.forEach(({ start, end }) => {
    const a = landmarks[start];
    const b = landmarks[end];
    if (!a || !b) return;
    if ((a.visibility != null && a.visibility < CR05_THRESHOLDS.MIN_VISIBILITY) || (b.visibility != null && b.visibility < CR05_THRESHOLDS.MIN_VISIBILITY)) return;
    ctx.beginPath();
    ctx.moveTo(a.x * canvas.width, a.y * canvas.height);
    ctx.lineTo(b.x * canvas.width, b.y * canvas.height);
    ctx.stroke();
  });
  landmarks.forEach((point) => {
    if (!point || (point.visibility != null && point.visibility < CR05_THRESHOLDS.MIN_VISIBILITY)) return;
    ctx.beginPath();
    ctx.arc(point.x * canvas.width, point.y * canvas.height, Math.max(2, canvas.width * 0.006), 0, Math.PI * 2);
    ctx.fill();
  });
}

function setCr05Text(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function updateCr05ReadinessIndicator(displayState, framing) {
  const dot = document.getElementById("cr05CameraReadinessDot");
  const text = document.getElementById("cr05CameraReadinessText");
  if (!dot || !text) return;
  const dotClass = displayState === DETECTION_DISPLAY_STATE.READY
    ? "ready"
    : displayState === DETECTION_DISPLAY_STATE.PARTIAL || displayState === DETECTION_DISPLAY_STATE.LOST_SUSTAINED
    ? "partial"
    : "not-found";
  dot.className = `squat-readiness-dot ${dotClass}`;
  let label = SQUAT_READINESS_LABELS[displayState] || "請保持肩膀、髖部與雙膝入鏡";
  if (displayState === DETECTION_DISPLAY_STATE.READY) {
    if (framing === "TOO_CLOSE") label = "請稍微退後，讓身體完整入鏡";
    else if (framing === "TOO_FAR") label = "請靠近一些";
    else label = "已偵測到身體，可以開始抬膝";
  }
  text.textContent = label;
}

function updateCr05RepRing(completedCount, targetReps) {
  const ring = document.getElementById("cr05RepRingProgress");
  if (!ring) return;
  const circumference = 188.5;
  const ratio = calculateProgressRatio(completedCount, targetReps);
  ring.style.strokeDashoffset = String(circumference * (1 - ratio));
}

function handleCr05Frame(landmarks, timestamp) {
  if (state.route !== "cr05Detection" || !cr05DetectionStability || !cr05SessionTracker || cr05TargetReached) return;
  drawCr05Skeleton(landmarks);
  const { displayState, framing } = cr05DetectionStability.update(landmarks, timestamp);
  updateCr05ReadinessIndicator(displayState, framing);
  setCr05Text("cr05Readiness", framing ? `${displayState}（${framing}）` : displayState);
  const metrics = computeSeatedKneeRaiseMetrics(landmarks, CR05_THRESHOLDS);
  setCr05Text("cr05LeftAngle", metrics.leftHipAngle == null ? "--" : `${Math.round(metrics.leftHipAngle)}°`);
  setCr05Text("cr05RightAngle", metrics.rightHipAngle == null ? "--" : `${Math.round(metrics.rightHipAngle)}°`);
  setCr05Text("cr05TrunkLean", metrics.trunkLeanDeg == null ? "--" : `${Math.round(metrics.trunkLeanDeg)}°`);
  const bodyReady = !!landmarks && hasFullLowerBody(landmarks, CR05_THRESHOLDS, CR05_REQUIRED_LANDMARKS);
  const result = cr05SessionTracker.processFrame({ timestamp, ...metrics, bodyReady });
  const summary = result.summary;
  setCr05Text("cr05TotalReps", String(summary.totalReps));
  setCr05Text("cr05RepCounterValue", String(summary.totalReps));
  updateCr05RepRing(summary.totalReps, summary.targetReps);
  if (result.completedReps.length) {
    const counter = document.getElementById("cr05RepCounter");
    if (counter) {
      counter.classList.toggle("complete", summary.completed);
      counter.classList.remove("pulse");
      void counter.offsetWidth;
      counter.classList.add("pulse");
    }
  }
  setCr05Text("cr05LeftReps", String(summary.leftReps));
  setCr05Text("cr05RightReps", String(summary.rightReps));
  setCr05Text("cr05LiveScore", summary.totalReps ? String(calculateSeatedKneeRaiseScore(summary).score) : "--");
  if (!bodyReady) {
    setCr05Text("cr05Feedback", "請調整位置，讓肩膀、髖部與雙膝完整入鏡");
  } else if (result.completedReps.length) {
    const rep = result.completedReps.at(-1);
    const issue = rep.issues[0];
    setCr05Text("cr05Feedback", issue ? CR05_QUALITY_ISSUE_LABELS[issue] : "很好，回到坐姿後換另一腳");
  } else if (metrics.trunkLeanDeg != null && metrics.trunkLeanDeg > CR05_THRESHOLDS.TRUNK_LEAN_MAX_DEG) {
    setCr05Text("cr05Feedback", "上半身盡量保持直立");
  } else {
    setCr05Text("cr05Feedback", "左右腳輪流抬起");
  }
  if (summary.completed) {
    cr05TargetReached = true;
    stopCr05Camera();
    const overlay = document.getElementById("cr05StatusOverlay");
    if (overlay) overlay.textContent = "訓練次數已完成！請儲存結果";
    const button = document.getElementById("cr05FinishBtn");
    if (button) button.textContent = "儲存並查看結果";
  }
}

function stopCr05Camera() {
  if (cr05CameraController) {
    cr05CameraController.stop();
    cr05CameraController = null;
  }
  cr05CanvasCtx = null;
  cr05DetectionStability = null;
}

function persistCr05Session() {
  if (cr05SessionFinalized || !cr05SessionMeta || !cr05SessionTracker) return false;
  const meta = cr05SessionMeta;
  const summary = cr05SessionTracker.getSummary();
  const isAssigned = meta.mode === "assigned";
  let schedule = null;
  let ex = null;
  if (isAssigned) {
    schedule = scheduleService.getById(meta.scheduleId);
    ex = schedule ? schedule.exercises[meta.exerciseIndex] : null;
    if (!schedule || !ex) {
      alert("找不到課表或動作資訊，本次結果未儲存。");
      return false;
    }
    if (ex.status === "completed") return false;
  }
  const { score, quality } = calculateSeatedKneeRaiseScore(summary);
  const now = nowIso();
  const record = analysisService.create({
    id: generateId("analysis"),
    patientId: meta.patientId,
    therapistId: meta.therapistId,
    scheduleId: isAssigned ? schedule.id : null,
    exerciseId: meta.exerciseId,
    exerciseName: meta.exerciseName,
    completedAt: now,
    capturedAt: now,
    createdAt: now,
    analysisMode: CR05_ANALYSIS_MODE,
    source: isAssigned ? ANALYSIS_RECORD_SOURCES.ASSIGNED : ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,
    totalReps: summary.totalReps,
    targetReps: summary.targetReps,
    validReps: summary.validReps,
    score,
    overallScore: score,
    quality,
    remark: buildSeatedKneeRaiseRemark(summary),
    repRecords: summary.repRecords,
    summary: {
      totalReps: summary.totalReps,
      targetReps: summary.targetReps,
      leftReps: summary.leftReps,
      rightReps: summary.rightReps,
      qualityValidReps: summary.qualityValidReps,
      insufficientRaiseCount: summary.insufficientRaiseCount,
      excessiveTrunkLeanCount: summary.excessiveTrunkLeanCount,
      rhythmIssueCount: summary.rhythmIssueCount,
      tooFastCount: summary.tooFastCount,
      trackingInterruptionCount: summary.trackingInterruptionCount,
      repsWithTrackingGap: summary.repsWithTrackingGap,
      averageMinHipAngle: summary.averageMinHipAngle,
      averageRepDuration: summary.averageRepDuration,
    },
  });
  if (isAssigned) {
    scheduleService.updateExerciseAt(schedule.id, meta.exerciseIndex, { status: "completed", completedAt: now, analysisRecordId: record.id });
  }
  gameService.addXp(meta.patientId, meta.rewardXp || DEFAULT_CR05_REWARD_XP);
  cr05SessionFinalized = true;
  return true;
}

function finalizeCr05Training() {
  if (!cr05SessionTracker || !cr05SessionTracker.getSummary().totalReps) {
    alert("尚未偵測到完整動作，請至少完成一次後再儲存。");
    return;
  }
  stopCr05Camera();
  const meta = cr05SessionMeta;
  if (persistCr05Session()) {
    cr05SessionTracker = null;
    cr05SessionMeta = null;
    navigateAfterSquat(meta);
  }
}

function exitCr05Detection() {
  stopCr05Camera();
  const meta = cr05SessionMeta;
  cr05SessionTracker = null;
  cr05SessionMeta = null;
  navigateAfterSquat(meta);
}

// KN03 坐姿膝伸直：完整 Pose Analysis 訓練路徑。
let kn03SessionMeta = null;
let kn03CameraController = null;
let kn03CanvasCtx = null;
let kn03DetectionStability = null;
let kn03SessionTracker = null;
let kn03TargetReached = false;
let kn03SessionFinalized = false;

function goKn03Detection() {
  const context = getExercisePageContext();
  if (!context) return;
  const { mode, schedule, ex } = context;
  if (mode === "assigned" && ex.status === "completed") return goExerciseDetail(schedule.id, state.selectedExerciseIndex);
  const relation = mode === "self_practice" ? relationService.findAcceptedByPatientId(state.user.id)[0] : null;
  kn03SessionMeta = { mode, navigationOrigin: state.navigationOrigin, scheduleId: mode === "assigned" ? schedule.id : null, exerciseIndex: mode === "assigned" ? state.selectedExerciseIndex : null, exerciseId: ex.exerciseId, exerciseName: ex.exerciseName, patientId: state.user.id, therapistId: mode === "assigned" ? schedule.therapistId : (relation ? relation.therapistId : null), targetReps: calculateSquatTargetReps(ex), rewardXp: ex.rewardXp || DEFAULT_KN03_REWARD_XP };
  kn03TargetReached = false;
  kn03SessionFinalized = false;
  state.route = "kn03Detection";
  render();
  beginKn03CameraSession();
}

function kn03DetectionPage() {
  const meta = kn03SessionMeta || { exerciseName: "坐姿膝伸直", targetReps: 10 };
  return `<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitKn03Detection()">返回</button><b>AI 坐姿膝伸直</b><img class="icon" src="/images/ai_robot.png" alt="AI" /></div>
    <h2 style="margin:10px 0 4px;">${meta.exerciseName}</h2><div class="small" style="margin-bottom:10px;">坐穩後左右腳輪流伸直；肩膀、髖部、雙膝與腳踝需完整入鏡。</div>
    <div class="squat-camera-wrap"><video id="kn03Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="kn03OverlayCanvas" class="squat-overlay-canvas"></canvas>
      <div class="squat-rep-counter" id="kn03RepCounter"><svg class="squat-rep-ring" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="kn03RepRingProgress" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="kn03RepCounterValue">0</span><span class="squat-rep-counter-sep">/ ${meta.targetReps}</span></div></div>
      <div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="kn03ReadinessDot"></span><span id="kn03ReadinessText">尚未偵測</span></div><div class="squat-status-overlay" id="kn03StatusOverlay">正在請求攝影機權限…</div></div>
    <div class="stats" style="margin-top:12px;"><div class="stat"><span class="small">總次數</span><b><span id="kn03TotalReps">0</span> / ${meta.targetReps}</b></div><div class="stat"><span class="small">左腳</span><b id="kn03LeftReps">0</b></div><div class="stat"><span class="small">右腳</span><b id="kn03RightReps">0</b></div></div>
    <div class="card" style="display:grid; gap:8px; margin-top:12px;"><div class="small">追蹤狀態：<b id="kn03Readiness">--</b></div><div class="small">左膝角度：<b id="kn03LeftAngle">--</b>　右膝角度：<b id="kn03RightAngle">--</b></div><div class="small">軀幹傾斜：<b id="kn03TrunkLean">--</b></div><div class="small">即時提醒：<b id="kn03Feedback">請坐好並保持身體入鏡</b></div><div class="small">目前品質分數：<b id="kn03LiveScore">--</b></div></div>
    <div class="small" style="margin:10px 0; color:#888;">角度與分數是依 ReMotion 資料庫建立的原型工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="kn03FinishBtn" onclick="finalizeKn03Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitKn03Detection()">放棄本次訓練</button>`;
}

function beginKn03CameraSession() {
  const videoEl = document.getElementById("kn03Video");
  const canvasEl = document.getElementById("kn03OverlayCanvas");
  if (!videoEl || !canvasEl || !kn03SessionMeta) return;
  stopKn03Camera();
  kn03CanvasCtx = canvasEl.getContext("2d");
  kn03SessionTracker = createSeatedKneeExtensionSession({ targetReps: kn03SessionMeta.targetReps });
  kn03DetectionStability = createDetectionStabilityTracker({ ...SQUAT_THRESHOLDS, MIN_VISIBILITY: KN03_THRESHOLDS.MIN_VISIBILITY }, KN03_REQUIRED_LANDMARKS);
  kn03CameraController = createSquatCameraController({ videoEl, onStatus: handleKn03CameraStatus, onFrame: handleKn03Frame, onFatalError: handleKn03FatalError });
  kn03CameraController.start();
}

function handleKn03CameraStatus(status) {
  const el = document.getElementById("kn03StatusOverlay"); if (!el) return;
  el.textContent = status === "requesting-permission" ? "正在請求攝影機權限…" : status === "loading-model" ? "AI 模型載入中，請稍候…" : status === "ready" ? "" : el.textContent;
}
function handleKn03FatalError(message) { const el = document.getElementById("kn03StatusOverlay"); if (el) el.textContent = message; }

function drawKn03Skeleton(landmarks) {
  const canvas = document.getElementById("kn03OverlayCanvas"); const video = document.getElementById("kn03Video"); if (!canvas || !kn03CanvasCtx) return;
  if (video && video.videoWidth && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) { canvas.width = video.videoWidth; canvas.height = video.videoHeight; }
  const ctx = kn03CanvasCtx; if (!canvas.width) return; ctx.clearRect(0, 0, canvas.width, canvas.height); if (!landmarks) return;
  ctx.strokeStyle = "#7ea866"; ctx.fillStyle = "#5f8d49"; ctx.lineWidth = Math.max(2, canvas.width * 0.004);
  POSE_CONNECTIONS.forEach(({ start, end }) => { const a = landmarks[start], b = landmarks[end]; if (!a || !b || (a.visibility != null && a.visibility < KN03_THRESHOLDS.MIN_VISIBILITY) || (b.visibility != null && b.visibility < KN03_THRESHOLDS.MIN_VISIBILITY)) return; ctx.beginPath(); ctx.moveTo(a.x * canvas.width, a.y * canvas.height); ctx.lineTo(b.x * canvas.width, b.y * canvas.height); ctx.stroke(); });
  landmarks.forEach((p) => { if (!p || (p.visibility != null && p.visibility < KN03_THRESHOLDS.MIN_VISIBILITY)) return; ctx.beginPath(); ctx.arc(p.x * canvas.width, p.y * canvas.height, Math.max(2, canvas.width * 0.006), 0, Math.PI * 2); ctx.fill(); });
}

function setKn03Text(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function updateKn03Readiness(displayState, framing) {
  const dot = document.getElementById("kn03ReadinessDot"), text = document.getElementById("kn03ReadinessText"); if (!dot || !text) return;
  dot.className = `squat-readiness-dot ${displayState === DETECTION_DISPLAY_STATE.READY ? "ready" : displayState === DETECTION_DISPLAY_STATE.PARTIAL || displayState === DETECTION_DISPLAY_STATE.LOST_SUSTAINED ? "partial" : "not-found"}`;
  let label = SQUAT_READINESS_LABELS[displayState] || "請保持身體完整入鏡";
  if (displayState === DETECTION_DISPLAY_STATE.READY) label = framing === "TOO_CLOSE" ? "請稍微退後，讓腳踝完整入鏡" : framing === "TOO_FAR" ? "請靠近一些" : "已偵測到身體，可以開始伸膝";
  text.textContent = label;
}
function updateKn03Ring(count, target) { const ring = document.getElementById("kn03RepRingProgress"); if (ring) ring.style.strokeDashoffset = String(188.5 * (1 - calculateProgressRatio(count, target))); }

function handleKn03Frame(landmarks, timestamp) {
  if (state.route !== "kn03Detection" || !kn03DetectionStability || !kn03SessionTracker || kn03TargetReached) return;
  drawKn03Skeleton(landmarks);
  const { displayState, framing } = kn03DetectionStability.update(landmarks, timestamp); updateKn03Readiness(displayState, framing); setKn03Text("kn03Readiness", framing ? `${displayState}（${framing}）` : displayState);
  const metrics = computeSeatedKneeExtensionMetrics(landmarks, KN03_THRESHOLDS);
  setKn03Text("kn03LeftAngle", metrics.leftKneeAngle == null ? "--" : `${Math.round(metrics.leftKneeAngle)}°`); setKn03Text("kn03RightAngle", metrics.rightKneeAngle == null ? "--" : `${Math.round(metrics.rightKneeAngle)}°`); setKn03Text("kn03TrunkLean", metrics.trunkLeanDeg == null ? "--" : `${Math.round(metrics.trunkLeanDeg)}°`);
  const bodyReady = !!landmarks && hasFullLowerBody(landmarks, KN03_THRESHOLDS, KN03_REQUIRED_LANDMARKS);
  const result = kn03SessionTracker.processFrame({ timestamp, ...metrics, bodyReady }); const s = result.summary;
  setKn03Text("kn03TotalReps", String(s.totalReps)); setKn03Text("kn03RepCounterValue", String(s.totalReps)); setKn03Text("kn03LeftReps", String(s.leftReps)); setKn03Text("kn03RightReps", String(s.rightReps)); setKn03Text("kn03LiveScore", s.totalReps ? String(calculateSeatedKneeExtensionScore(s).score) : "--"); updateKn03Ring(s.totalReps, s.targetReps);
  if (result.completedReps.length) { const counter = document.getElementById("kn03RepCounter"); if (counter) { counter.classList.toggle("complete", s.completed); counter.classList.remove("pulse"); void counter.offsetWidth; counter.classList.add("pulse"); } const issue = result.completedReps.at(-1).issues[0]; setKn03Text("kn03Feedback", issue ? KN03_QUALITY_ISSUE_LABELS[issue] : "很好，放下小腿後換另一腳"); }
  else if (!bodyReady) setKn03Text("kn03Feedback", "請讓肩膀、髖部、雙膝與腳踝完整入鏡"); else if (metrics.trunkLeanDeg > KN03_THRESHOLDS.TRUNK_LEAN_MAX_DEG) setKn03Text("kn03Feedback", "上半身盡量保持直立"); else setKn03Text("kn03Feedback", "左右腳輪流伸直膝蓋");
  if (s.completed) { kn03TargetReached = true; stopKn03Camera(); const overlay = document.getElementById("kn03StatusOverlay"); if (overlay) overlay.textContent = "訓練次數已完成！請儲存結果"; const button = document.getElementById("kn03FinishBtn"); if (button) button.textContent = "儲存並查看結果"; }
}

function stopKn03Camera() { if (kn03CameraController) kn03CameraController.stop(); kn03CameraController = null; kn03CanvasCtx = null; kn03DetectionStability = null; }
function persistKn03Session() {
  if (kn03SessionFinalized || !kn03SessionMeta || !kn03SessionTracker) return false;
  const meta = kn03SessionMeta, s = kn03SessionTracker.getSummary(); const assigned = meta.mode === "assigned"; let schedule = null, ex = null;
  if (assigned) { schedule = scheduleService.getById(meta.scheduleId); ex = schedule ? schedule.exercises[meta.exerciseIndex] : null; if (!schedule || !ex) { alert("找不到課表或動作資訊，本次結果未儲存。"); return false; } if (ex.status === "completed") return false; }
  const { score, quality } = calculateSeatedKneeExtensionScore(s); const now = nowIso();
  const record = analysisService.create({ id: generateId("analysis"), patientId: meta.patientId, therapistId: meta.therapistId, scheduleId: assigned ? schedule.id : null, exerciseId: meta.exerciseId, exerciseName: meta.exerciseName, completedAt: now, capturedAt: now, createdAt: now, analysisMode: KN03_ANALYSIS_MODE, source: assigned ? ANALYSIS_RECORD_SOURCES.ASSIGNED : ANALYSIS_RECORD_SOURCES.SELF_PRACTICE, totalReps: s.totalReps, targetReps: s.targetReps, validReps: s.validReps, score, overallScore: score, quality, remark: buildSeatedKneeExtensionRemark(s), repRecords: s.repRecords, summary: { totalReps: s.totalReps, targetReps: s.targetReps, leftReps: s.leftReps, rightReps: s.rightReps, qualityValidReps: s.qualityValidReps, insufficientExtensionCount: s.insufficientExtensionCount, excessiveTrunkLeanCount: s.excessiveTrunkLeanCount, thighLiftCount: s.thighLiftCount, rhythmIssueCount: s.rhythmIssueCount, tooFastCount: s.tooFastCount, trackingInterruptionCount: s.trackingInterruptionCount, repsWithTrackingGap: s.repsWithTrackingGap, averageMaxKneeAngle: s.averageMaxKneeAngle, averageRepDuration: s.averageRepDuration } });
  if (assigned) scheduleService.updateExerciseAt(schedule.id, meta.exerciseIndex, { status: "completed", completedAt: now, analysisRecordId: record.id }); gameService.addXp(meta.patientId, meta.rewardXp || DEFAULT_KN03_REWARD_XP); kn03SessionFinalized = true; return true;
}
function finalizeKn03Training() { if (!kn03SessionTracker || !kn03SessionTracker.getSummary().totalReps) { alert("尚未偵測到完整動作，請至少完成一次後再儲存。"); return; } stopKn03Camera(); const meta = kn03SessionMeta; if (persistKn03Session()) { kn03SessionTracker = null; kn03SessionMeta = null; navigateAfterSquat(meta); } }
function exitKn03Detection() { stopKn03Camera(); const meta = kn03SessionMeta; kn03SessionTracker = null; kn03SessionMeta = null; navigateAfterSquat(meta); }

let le05SessionMeta=null,le05CameraController=null,le05CanvasCtx=null,le05DetectionStability=null,le05SessionTracker=null,le05TargetReached=false,le05SessionFinalized=false;
function goLe05Detection(){const c=getExercisePageContext();if(!c)return;const{mode,schedule,ex}=c;if(mode==="assigned"&&ex.status==="completed")return goExerciseDetail(schedule.id,state.selectedExerciseIndex);const rel=mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;le05SessionMeta={mode,navigationOrigin:state.navigationOrigin,scheduleId:mode==="assigned"?schedule.id:null,exerciseIndex:mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:ex.exerciseId,exerciseName:ex.exerciseName,patientId:state.user.id,therapistId:mode==="assigned"?schedule.therapistId:(rel?rel.therapistId:null),targetReps:calculateSquatTargetReps(ex),rewardXp:ex.rewardXp||DEFAULT_LE05_REWARD_XP};le05TargetReached=false;le05SessionFinalized=false;state.route="le05Detection";render();beginLe05CameraSession();}
function le05DetectionPage(){const m=le05SessionMeta||{exerciseName:"坐站",targetReps:10};return `<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitLe05Detection()">返回</button><b>AI 坐站偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI" /></div><h2 style="margin:10px 0 4px;">${m.exerciseName}</h2><div class="small" style="margin-bottom:10px;">使用穩固椅子，雙腳踩穩；完整站起後再慢慢坐下，並讓全身入鏡。</div><div class="squat-camera-wrap"><video id="le05Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="le05OverlayCanvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="le05RepCounter"><svg class="squat-rep-ring" viewBox="0 0 72 72" width="72" height="72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="le05RepRingProgress" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="le05RepCounterValue">0</span><span class="squat-rep-counter-sep">/ ${m.targetReps}</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="le05ReadinessDot"></span><span id="le05ReadinessText">尚未偵測</span></div><div class="squat-status-overlay" id="le05StatusOverlay">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px;"><div class="stat"><span class="small">完成次數</span><b><span id="le05TotalReps">0</span> / ${m.targetReps}</b></div><div class="stat"><span class="small">動作狀態</span><b id="le05MotionState">坐姿</b></div><div class="stat"><span class="small">品質分數</span><b id="le05LiveScore">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px;"><div class="small">追蹤狀態：<b id="le05Readiness">--</b></div><div class="small">平均膝角度：<b id="le05KneeAngle">--</b>　軀幹傾斜：<b id="le05TrunkLean">--</b></div><div class="small">即時提醒：<b id="le05Feedback">請坐好並保持全身入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888;">角度與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="le05FinishBtn" onclick="finalizeLe05Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitLe05Detection()">放棄本次訓練</button>`;}
function beginLe05CameraSession(){const v=document.getElementById("le05Video"),c=document.getElementById("le05OverlayCanvas");if(!v||!c||!le05SessionMeta)return;stopLe05Camera();le05CanvasCtx=c.getContext("2d");le05SessionTracker=createSitToStandSession({targetReps:le05SessionMeta.targetReps});le05DetectionStability=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:LE05_THRESHOLDS.MIN_VISIBILITY},LE05_REQUIRED_LANDMARKS);le05CameraController=createSquatCameraController({videoEl:v,onStatus:handleLe05Status,onFrame:handleLe05Frame,onFatalError:m=>{const e=document.getElementById("le05StatusOverlay");if(e)e.textContent=m;}});le05CameraController.start();}
function handleLe05Status(s){const e=document.getElementById("le05StatusOverlay");if(!e)return;e.textContent=s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":s==="ready"?"":e.textContent;}
function drawLe05Skeleton(l){const c=document.getElementById("le05OverlayCanvas"),v=document.getElementById("le05Video");if(!c||!le05CanvasCtx)return;if(v&&v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight;}const x=le05CanvasCtx;if(!c.width)return;x.clearRect(0,0,c.width,c.height);if(!l)return;x.strokeStyle="#7ea866";x.fillStyle="#5f8d49";x.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b||(a.visibility!=null&&a.visibility<LE05_THRESHOLDS.MIN_VISIBILITY)||(b.visibility!=null&&b.visibility<LE05_THRESHOLDS.MIN_VISIBILITY))return;x.beginPath();x.moveTo(a.x*c.width,a.y*c.height);x.lineTo(b.x*c.width,b.y*c.height);x.stroke();});l.forEach(p=>{if(!p||(p.visibility!=null&&p.visibility<LE05_THRESHOLDS.MIN_VISIBILITY))return;x.beginPath();x.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);x.fill();});}
function setLe05(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function updateLe05Readiness(d,f){const dot=document.getElementById("le05ReadinessDot"),text=document.getElementById("le05ReadinessText");if(!dot||!text)return;dot.className=`squat-readiness-dot ${d===DETECTION_DISPLAY_STATE.READY?"ready":d===DETECTION_DISPLAY_STATE.PARTIAL||d===DETECTION_DISPLAY_STATE.LOST_SUSTAINED?"partial":"not-found"}`;let label=SQUAT_READINESS_LABELS[d]||"請保持全身入鏡";if(d===DETECTION_DISPLAY_STATE.READY)label=f==="TOO_CLOSE"?"請稍微退後，讓全身進入畫面":f==="TOO_FAR"?"請靠近一些":"已偵測到全身，可以開始坐站";text.textContent=label;}
function updateLe05Ring(n,t){const r=document.getElementById("le05RepRingProgress");if(r)r.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(n,t)));}
function handleLe05Frame(l,time){if(state.route!=="le05Detection"||!le05DetectionStability||!le05SessionTracker||le05TargetReached)return;drawLe05Skeleton(l);const{displayState,framing}=le05DetectionStability.update(l,time);updateLe05Readiness(displayState,framing);setLe05("le05Readiness",framing?`${displayState}（${framing}）`:displayState);const m=computeSitToStandMetrics(l,LE05_THRESHOLDS),ready=!!l&&hasFullLowerBody(l,LE05_THRESHOLDS,LE05_REQUIRED_LANDMARKS),result=le05SessionTracker.processFrame({timestamp:time,...m,kneeValgus:ready?computeKneeValgusSuspected(l):false,bodyReady:ready}),s=result.summary;setLe05("le05KneeAngle",m.averageKneeAngle==null?"--":`${Math.round(m.averageKneeAngle)}°`);setLe05("le05TrunkLean",m.trunkLeanDeg==null?"--":`${Math.round(m.trunkLeanDeg)}°`);setLe05("le05TotalReps",String(s.totalReps));setLe05("le05RepCounterValue",String(s.totalReps));setLe05("le05LiveScore",s.totalReps?String(calculateSitToStandScore(s).score):"--");setLe05("le05MotionState",{seated:"坐姿",rising:"起身中",standing:"站立",lowering:"坐下中"}[s.state]||s.state);updateLe05Ring(s.totalReps,s.targetReps);if(result.repCompleted){const c=document.getElementById("le05RepCounter");if(c){c.classList.toggle("complete",s.completed);c.classList.remove("pulse");void c.offsetWidth;c.classList.add("pulse");}const issue=result.completedRep.issues[0];setLe05("le05Feedback",issue?LE05_QUALITY_ISSUE_LABELS[issue]:"很好，完整站起並穩定坐下");}else if(!ready)setLe05("le05Feedback","請調整位置，讓全身完整入鏡");else if(m.trunkLeanDeg>LE05_THRESHOLDS.TRUNK_LEAN_MAX_DEG)setLe05("le05Feedback","身體前傾後記得穩定站直");else setLe05("le05Feedback",s.state==="standing"?"很好，慢慢控制坐下":"雙腳踩穩後平順站起");if(s.completed){le05TargetReached=true;stopLe05Camera();const o=document.getElementById("le05StatusOverlay");if(o)o.textContent="訓練次數已完成！請儲存結果";const b=document.getElementById("le05FinishBtn");if(b)b.textContent="儲存並查看結果";}}
function stopLe05Camera(){if(le05CameraController)le05CameraController.stop();le05CameraController=null;le05CanvasCtx=null;le05DetectionStability=null;}
function persistLe05Session(){if(le05SessionFinalized||!le05SessionMeta||!le05SessionTracker)return false;const m=le05SessionMeta,s=le05SessionTracker.getSummary(),assigned=m.mode==="assigned";let schedule=null,ex=null;if(assigned){schedule=scheduleService.getById(m.scheduleId);ex=schedule?schedule.exercises[m.exerciseIndex]:null;if(!schedule||!ex){alert("找不到課表或動作資訊，本次結果未儲存。");return false;}if(ex.status==="completed")return false;}const{score,quality}=calculateSitToStandScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:assigned?schedule.id:null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:LE05_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score,overallScore:score,quality,remark:buildSitToStandRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(assigned)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp||DEFAULT_LE05_REWARD_XP);le05SessionFinalized=true;return true;}
function finalizeLe05Training(){if(!le05SessionTracker||!le05SessionTracker.getSummary().totalReps){alert("尚未偵測到完整動作，請至少完成一次後再儲存。");return;}stopLe05Camera();const m=le05SessionMeta;if(persistLe05Session()){le05SessionTracker=null;le05SessionMeta=null;navigateAfterSquat(m);}}
function exitLe05Detection(){stopLe05Camera();const m=le05SessionMeta;le05SessionTracker=null;le05SessionMeta=null;navigateAfterSquat(m);}
let le03SessionMeta=null,le03CameraController=null,le03CanvasCtx=null,le03DetectionStability=null,le03SessionTracker=null,le03TargetReached=false,le03SessionFinalized=false;
function goLe03Detection(){const c=getExercisePageContext();if(!c)return;const{mode,schedule,ex}=c;if(mode==="assigned"&&ex.status==="completed")return goExerciseDetail(schedule.id,state.selectedExerciseIndex);const rel=mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;le03SessionMeta={mode,navigationOrigin:state.navigationOrigin,scheduleId:mode==="assigned"?schedule.id:null,exerciseIndex:mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:ex.exerciseId,exerciseName:ex.exerciseName,patientId:state.user.id,therapistId:mode==="assigned"?schedule.therapistId:(rel?rel.therapistId:null),targetReps:calculateSquatTargetReps(ex),rewardXp:ex.rewardXp||DEFAULT_LE03_REWARD_XP};le03TargetReached=false;le03SessionFinalized=false;state.route="le03Detection";render();beginLe03CameraSession();}
function le03DetectionPage(){const m=le03SessionMeta||{exerciseName:"橋式",targetReps:10};return `<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitLe03Detection()">返回</button><b>AI 橋式偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI" /></div><h2 style="margin:10px 0 4px;">${m.exerciseName}</h2><div class="small" style="margin-bottom:10px;">側面或斜側面拍攝；屈膝踩穩，抬臀至肩、髖、膝接近一直線後慢慢放下。</div><div class="squat-camera-wrap"><video id="le03Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="le03OverlayCanvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="le03RepCounter"><svg class="squat-rep-ring" viewBox="0 0 72 72" width="72" height="72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="le03RepRingProgress" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="le03RepCounterValue">0</span><span class="squat-rep-counter-sep">/ ${m.targetReps}</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="le03ReadinessDot"></span><span id="le03ReadinessText">尚未偵測</span></div><div class="squat-status-overlay" id="le03StatusOverlay">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px;"><div class="stat"><span class="small">完成次數</span><b><span id="le03TotalReps">0</span> / ${m.targetReps}</b></div><div class="stat"><span class="small">動作狀態</span><b id="le03MotionState">墊面</b></div><div class="stat"><span class="small">品質分數</span><b id="le03LiveScore">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px;"><div class="small">追蹤狀態：<b id="le03Readiness">--</b></div><div class="small">平均髖角度：<b id="le03HipAngle">--</b>　左右差異：<b id="le03Asymmetry">--</b></div><div class="small">即時提醒：<b id="le03Feedback">請躺好並保持肩膀、髖部與膝蓋入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888;">角度與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="le03FinishBtn" onclick="finalizeLe03Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitLe03Detection()">放棄本次訓練</button>`;}
function beginLe03CameraSession(){const v=document.getElementById("le03Video"),c=document.getElementById("le03OverlayCanvas");if(!v||!c||!le03SessionMeta)return;stopLe03Camera();le03CanvasCtx=c.getContext("2d");le03SessionTracker=createBridgeSession({targetReps:le03SessionMeta.targetReps});le03DetectionStability=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:LE03_THRESHOLDS.MIN_VISIBILITY},LE03_REQUIRED_LANDMARKS);le03CameraController=createSquatCameraController({videoEl:v,onStatus:s=>{const e=document.getElementById("le03StatusOverlay");if(e)e.textContent=s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":s==="ready"?"":e.textContent;},onFrame:handleLe03Frame,onFatalError:m=>{const e=document.getElementById("le03StatusOverlay");if(e)e.textContent=m;}});le03CameraController.start();}
function drawLe03Skeleton(l){const c=document.getElementById("le03OverlayCanvas"),v=document.getElementById("le03Video");if(!c||!le03CanvasCtx)return;if(v&&v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight;}const x=le03CanvasCtx;if(!c.width)return;x.clearRect(0,0,c.width,c.height);if(!l)return;x.strokeStyle="#7ea866";x.fillStyle="#5f8d49";x.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b||(a.visibility!=null&&a.visibility<LE03_THRESHOLDS.MIN_VISIBILITY)||(b.visibility!=null&&b.visibility<LE03_THRESHOLDS.MIN_VISIBILITY))return;x.beginPath();x.moveTo(a.x*c.width,a.y*c.height);x.lineTo(b.x*c.width,b.y*c.height);x.stroke();});l.forEach(p=>{if(!p||(p.visibility!=null&&p.visibility<LE03_THRESHOLDS.MIN_VISIBILITY))return;x.beginPath();x.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);x.fill();});}
function setLe03(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}function updateLe03Ready(d,f){const dot=document.getElementById("le03ReadinessDot"),text=document.getElementById("le03ReadinessText");if(!dot||!text)return;dot.className=`squat-readiness-dot ${d===DETECTION_DISPLAY_STATE.READY?"ready":d===DETECTION_DISPLAY_STATE.PARTIAL||d===DETECTION_DISPLAY_STATE.LOST_SUSTAINED?"partial":"not-found"}`;let label=SQUAT_READINESS_LABELS[d]||"請保持肩膀、髖部與膝蓋入鏡";if(d===DETECTION_DISPLAY_STATE.READY)label=f==="TOO_CLOSE"?"請稍微退後，讓身體完整入鏡":f==="TOO_FAR"?"請靠近一些":"已偵測到身體，可以開始橋式";text.textContent=label;}function updateLe03Ring(n,t){const r=document.getElementById("le03RepRingProgress");if(r)r.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(n,t)));}
function handleLe03Frame(l,time){if(state.route!=="le03Detection"||!le03DetectionStability||!le03SessionTracker||le03TargetReached)return;drawLe03Skeleton(l);const{displayState,framing}=le03DetectionStability.update(l,time);updateLe03Ready(displayState,framing);setLe03("le03Readiness",framing?`${displayState}（${framing}）`:displayState);const m=computeBridgeMetrics(l,LE03_THRESHOLDS),ready=!!l&&hasFullLowerBody(l,LE03_THRESHOLDS,LE03_REQUIRED_LANDMARKS),result=le03SessionTracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=result.summary;setLe03("le03HipAngle",m.averageHipAngle==null?"--":`${Math.round(m.averageHipAngle)}°`);setLe03("le03Asymmetry",m.hipAsymmetryDeg==null?"--":`${Math.round(m.hipAsymmetryDeg)}°`);setLe03("le03TotalReps",String(s.totalReps));setLe03("le03RepCounterValue",String(s.totalReps));setLe03("le03LiveScore",s.totalReps?String(calculateBridgeScore(s).score):"--");setLe03("le03MotionState",{down:"墊面",rising:"抬臀中",top:"頂點",lowering:"放下中"}[s.state]||s.state);updateLe03Ring(s.totalReps,s.targetReps);if(result.repCompleted){const c=document.getElementById("le03RepCounter");if(c){c.classList.toggle("complete",s.completed);c.classList.remove("pulse");void c.offsetWidth;c.classList.add("pulse");}const issue=result.completedRep.issues[0];setLe03("le03Feedback",issue?LE03_QUALITY_ISSUE_LABELS[issue]:"很好，抬升與放下都很穩定");}else if(!ready)setLe03("le03Feedback","請讓肩膀、髖部與雙膝完整入鏡");else if(m.hipAsymmetryDeg>LE03_THRESHOLDS.HIP_ASYMMETRY_MAX_DEG)setLe03("le03Feedback","雙腳平均出力，保持骨盆水平");else setLe03("le03Feedback",s.state==="top"?"很好，慢慢控制骨盆放下":"收緊臀部並穩定抬起");if(s.completed){le03TargetReached=true;stopLe03Camera();const o=document.getElementById("le03StatusOverlay");if(o)o.textContent="訓練次數已完成！請儲存結果";const b=document.getElementById("le03FinishBtn");if(b)b.textContent="儲存並查看結果";}}
function stopLe03Camera(){if(le03CameraController)le03CameraController.stop();le03CameraController=null;le03CanvasCtx=null;le03DetectionStability=null;}function persistLe03Session(){if(le03SessionFinalized||!le03SessionMeta||!le03SessionTracker)return false;const m=le03SessionMeta,s=le03SessionTracker.getSummary(),assigned=m.mode==="assigned";let schedule=null,ex=null;if(assigned){schedule=scheduleService.getById(m.scheduleId);ex=schedule?schedule.exercises[m.exerciseIndex]:null;if(!schedule||!ex){alert("找不到課表或動作資訊，本次結果未儲存。");return false;}if(ex.status==="completed")return false;}const{score,quality}=calculateBridgeScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:assigned?schedule.id:null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:LE03_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score,overallScore:score,quality,remark:buildBridgeRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(assigned)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp||DEFAULT_LE03_REWARD_XP);le03SessionFinalized=true;return true;}function finalizeLe03Training(){if(!le03SessionTracker||!le03SessionTracker.getSummary().totalReps){alert("尚未偵測到完整動作，請至少完成一次後再儲存。");return;}stopLe03Camera();const m=le03SessionMeta;if(persistLe03Session()){le03SessionTracker=null;le03SessionMeta=null;navigateAfterSquat(m);}}function exitLe03Detection(){stopLe03Camera();const m=le03SessionMeta;le03SessionTracker=null;le03SessionMeta=null;navigateAfterSquat(m);}

render = function() {if (state.route === "splash") app.innerHTML = renderSplash(); if (state.route === "auth") app.innerHTML = renderAuth(); if (state.route === "dashboard") app.innerHTML = renderDashboard(); if (state.route === "squat") app.innerHTML = renderSquat(); if (state.route === "analysis") app.innerHTML = phone(analysisPage(), true); if (state.route === "history") app.innerHTML = phone(historyPage(), true); if (state.route === "heatmap") app.innerHTML = phone(heatmapPage(), true); if (state.route === "records") app.innerHTML = phone(actionRecordsPage(), true); if (state.route === "achievements") app.innerHTML = phone(patientAchievementsPage(), true); if (state.route === "caseList") app.innerHTML = phone(therapistCaseListPage(), true); if (state.route === "caseDetail") app.innerHTML = phone(therapistCaseDetailPage(), true); if (state.route === "assignPlan") app.innerHTML = phone(assignPlanPage(), true); if (state.route === "schedule") app.innerHTML = phone(todaySchedulePage(), true); if (state.route === "reward") app.innerHTML = phone(rewardPage(), true); if (state.route === "map") app.innerHTML = phone(rehabMapPage(), true); if (state.route === "scheduleTracking") app.innerHTML = phone(therapistScheduleTrackingPage(), true); if (state.route === "exerciseDetail") app.innerHTML = phone(exerciseDetailPage(), true); if (state.route === "detectionPrep") app.innerHTML = phone(detectionPrepPage(), true); if (state.route === "squatDetection") app.innerHTML = phone(squatDetectionPage(), true); if (state.route === "hp02Detection") app.innerHTML = phone(hp02DetectionPage(), true); if (state.route === "cr05Detection") app.innerHTML = phone(cr05DetectionPage(), true); if (state.route === "kn03Detection") app.innerHTML = phone(kn03DetectionPage(), true); if (state.route === "le05Detection") app.innerHTML = phone(le05DetectionPage(), true); if (state.route === "le03Detection") app.innerHTML = phone(le03DetectionPage(), true); if (state.route === "devAccounts") app.innerHTML = phone(devAccountsPage(), true); if (state.route === "patientAssessmentIntro") app.innerHTML = phone(patientAssessmentIntroPage(), true); if (state.route === "patientAssessmentForm") app.innerHTML = phone(patientAssessmentFormPage(), true); if (state.route === "patientAssessmentSummary") app.innerHTML = phone(patientAssessmentSummaryPage(), true); if (state.route === "assessmentSettings") app.innerHTML = phone(assessmentSettingsPage(), true); if (state.route === "selfPracticeLibrary") app.innerHTML = phone(selfPracticeLibraryPage(), true); if (state.route === "todaysRecommendation") app.innerHTML = phone(todaysRecommendationPage(), true); if (state.route === "functionalAssessmentBodyRegion") app.innerHTML = phone(functionalAssessmentBodyRegionPage(), true); if (state.route === "functionalAssessmentShoulderPrep") app.innerHTML = phone(functionalAssessmentShoulderPrepPage(), false); if (state.route === "functionalAssessmentShoulderIntro") app.innerHTML = phone(functionalAssessmentShoulderIntroPage(), false); if (state.route === "functionalAssessmentShoulderSession") app.innerHTML = phone(functionalAssessmentShoulderSessionPage(), false); if (state.route === "functionalAssessmentShoulderComplete") app.innerHTML = phone(functionalAssessmentShoulderCompletePage(), false); if (state.route === "trainingRecordDetail") app.innerHTML = phone(trainingRecordDetailPage(), true); attachImageFallbacks(app);};
function goSchedule(){ state.scheduleViewDate = todayStr(); state.route = "schedule"; state.tab = "work"; render(); }
function goReward(){ state.route = "reward"; state.tab = "work"; render(); }
function goMap(){ state.route = "map"; state.tab = "profile"; render(); }
function goScheduleTracking(){ state.route = "scheduleTracking"; state.tab = "work"; render(); }
function selectScheduleDate(date){ state.scheduleViewDate = date; render(); }

function goExerciseDetail(scheduleId, index) {
  const schedule = scheduleService.getById(scheduleId);
  const ex = schedule ? schedule.exercises[index] : null;
  state.exerciseContext = "assigned";
  state.navigationOrigin = "assigned";
  state.selectedScheduleId = scheduleId;
  state.selectedExerciseIndex = index;
  state.selectedExerciseId = ex ? ex.exerciseId : null;
  state.route = "exerciseDetail";
  state.tab = "work";
  render();
}

/** Self-practice counterpart to goExerciseDetail() — no schedule, just a raw catalog exerciseId. */
function goSelfPracticeExerciseDetail(exerciseId) {
  state.exerciseContext = "self_practice";
  state.navigationOrigin = "self_practice";
  state.selectedExerciseId = exerciseId;
  state.selectedScheduleId = null;
  state.selectedExerciseIndex = null;
  state.route = "exerciseDetail";
  state.tab = "work";
  render();
}

/**
 * ReMotion 2.0 Phase 3.1 — entry point for a Recommendation Session item.
 * Trains/analyzes identically to self_practice (exerciseContext stays
 * "self_practice" — analysisRecord.source is never "recommendation", see
 * Phase 3.1 spec section 7); only navigationOrigin differs, so the 返回
 * button on exercise-related pages leads back to 為你安排的今日練習
 * instead of the Self Practice Library.
 */
function goRecommendationExerciseDetail(exerciseId) {
  state.exerciseContext = "self_practice";
  state.navigationOrigin = "recommendation";
  state.selectedExerciseId = exerciseId;
  state.selectedScheduleId = null;
  state.selectedExerciseIndex = null;
  state.route = "exerciseDetail";
  state.tab = "work";
  render();
}

function goDetectionPrep() {
  // Pure navigation only in this phase — no schedule/analysisRecord/XP
  // side effects happen until real detection is wired up in a later phase.
  const context = getExercisePageContext();
  if (!context) return state.exerciseContext === "self_practice" ? goSelfPracticeLibrary() : goSchedule();
  state.route = "detectionPrep";
  render();
}

function openCameraPlaceholder() {
  const context = getExercisePageContext();
  if (!context) {
    alert("找不到動作資訊，請重新進入。");
    return state.exerciseContext === "self_practice" ? goSelfPracticeLibrary() : goSchedule();
  }
  const { ex, catalog } = context;
  // Phase 5.6.1 — explicit dispatch by "which pose analyzer does this
  // exercise use" instead of a single isSquatExercise()-only gate. Checks
  // the catalog entry first (authoritative), falling back to the schedule
  // exercise shape, same pattern isSquatExercise() itself already used.
  const analyzer = resolvePoseAnalyzer(catalog) || resolvePoseAnalyzer(ex);
  if (analyzer === POSE_ANALYZER.SQUAT) return goSquatDetection();
  if (analyzer === POSE_ANALYZER.HP02_HIP_FLEXION) return goHp02Detection();
  if (analyzer === POSE_ANALYZER.CR05_SEATED_KNEE_RAISE) return goCr05Detection();
  if (analyzer === POSE_ANALYZER.KN03_SEATED_KNEE_EXTENSION) return goKn03Detection();
  if (analyzer === POSE_ANALYZER.LE05_SIT_TO_STAND) return goLe05Detection();
  if (analyzer === POSE_ANALYZER.LE03_BRIDGE) return goLe03Detection();
  alert("目前此動作尚未支援即時 AI 動作辨識。");
}

function openUploadPlaceholder() {
  alert("目前尚未串接影片分析");
}

function startScheduleExercise(scheduleId, index) {
  scheduleService.updateExerciseAt(scheduleId, index, { status: "in_progress" });
}

function completeScheduleExercise(scheduleId, index) {
  const schedule = scheduleService.getById(scheduleId);
  const ex = schedule ? schedule.exercises[index] : null;
  if (!schedule || !ex || ex.status === "completed") return;

  const now = nowIso();
  const record = analysisService.create({
    id: generateId("analysis"),
    patientId: schedule.patientId,
    therapistId: schedule.therapistId,
    scheduleId: schedule.id,
    exerciseId: ex.exerciseId,
    exerciseName: ex.exerciseName,
    completedAt: now,
    score: 92,
    quality: "Excellent",
    remark: "AI分析：本次動作品質良好，建議維持目前訓練方式。",
    // kept for compatibility with the existing "最近分析分數" card on patientHome
    overallScore: 92,
    capturedAt: now,
    createdAt: now,
    analysisMode: "mock",
    source: ANALYSIS_RECORD_SOURCES.ASSIGNED,
  });

  scheduleService.updateExerciseAt(schedule.id, index, {
    status: "completed",
    completedAt: now,
    analysisRecordId: record.id,
  });

  gameService.addXp(schedule.patientId, 30);

  render();
}

window.goSchedule = goSchedule; window.goReward = goReward; window.goMap = goMap; window.goScheduleTracking = goScheduleTracking;
window.selectScheduleDate = selectScheduleDate;
window.startScheduleExercise = startScheduleExercise;
window.completeScheduleExercise = completeScheduleExercise;
window.goExerciseDetail = goExerciseDetail;
window.goDetectionPrep = goDetectionPrep;
window.openCameraPlaceholder = openCameraPlaceholder;
window.openUploadPlaceholder = openUploadPlaceholder;
window.goSquatDetection = goSquatDetection;
window.exitSquatDetection = exitSquatDetection;
window.goHp02Detection = goHp02Detection;
window.exitHp02Detection = exitHp02Detection;
window.goCr05Detection = goCr05Detection;
window.exitCr05Detection = exitCr05Detection;
window.finalizeCr05Training = finalizeCr05Training;
window.goKn03Detection = goKn03Detection;
window.exitKn03Detection = exitKn03Detection;
window.finalizeKn03Training = finalizeKn03Training;
window.goLe05Detection = goLe05Detection;
window.exitLe05Detection = exitLe05Detection;
window.finalizeLe05Training = finalizeLe05Training;
window.goLe03Detection = goLe03Detection;
window.exitLe03Detection = exitLe03Detection;
window.finalizeLe03Training = finalizeLe03Training;
window.requestEndSquatTraining = requestEndSquatTraining;
window.cancelEndSquatTraining = cancelEndSquatTraining;
window.finalizeSquatTraining = finalizeSquatTraining;
window.toggleSquatDebugMode = toggleSquatDebugMode;
window.retrySquatCamera = retrySquatCamera;
window.toggleSquatVoice = toggleSquatVoice;
// Phase 5.4.4
window.enterSquatSuccessState = enterSquatSuccessState;
window.enterSquatIncompleteState = enterSquatIncompleteState;
window.goSquatResultFromCamera = goSquatResultFromCamera;

// ReMotion 2.0 Phase 2
window.goLandingPrimaryCta = goLandingPrimaryCta;
window.goPatientAssessmentIntro = goPatientAssessmentIntro;
window.skipAssessmentIntro = skipAssessmentIntro;
window.startAssessmentForm = startAssessmentForm;
window.toggleAssessmentBodyPart = toggleAssessmentBodyPart;
window.toggleAssessmentGoal = toggleAssessmentGoal;
window.selectAssessmentAbility = selectAssessmentAbility;
window.selectAssessmentDuration = selectAssessmentDuration;
window.goAssessmentNextStep = goAssessmentNextStep;
window.goAssessmentPrevStep = goAssessmentPrevStep;
window.backToAssessmentFormFromSummary = backToAssessmentFormFromSummary;
window.confirmAssessment = confirmAssessment;
window.goAssessmentSettings = goAssessmentSettings;
window.startAssessmentUpdate = startAssessmentUpdate;
window.startAssessmentReassess = startAssessmentReassess;
window.goSelfPracticeLibrary = goSelfPracticeLibrary;
window.toggleSelfPracticeBodyPart = toggleSelfPracticeBodyPart;
window.toggleSelfPracticeGoal = toggleSelfPracticeGoal;
window.selectSelfPracticeDifficultyTier = selectSelfPracticeDifficultyTier;
window.toggleSelfPracticeTrainingMode = toggleSelfPracticeTrainingMode;
window.setSelfPracticeSearch = setSelfPracticeSearch;
window.clearSelfPracticeFilters = clearSelfPracticeFilters;
window.resetSelfPracticeMoreFilters = resetSelfPracticeMoreFilters;
window.toggleSelfPracticeFiltersPanel = toggleSelfPracticeFiltersPanel;
window.browseAllSelfPracticeExercises = browseAllSelfPracticeExercises;
window.backToSelfPracticeDiscovery = backToSelfPracticeDiscovery;
window.goSelfPracticeExerciseDetail = goSelfPracticeExerciseDetail;
window.goRecommendationExerciseDetail = goRecommendationExerciseDetail;
window.goTodaysRecommendation = goTodaysRecommendation;
window.goFunctionalAssessmentBodyRegion = goFunctionalAssessmentBodyRegion;
window.selectFunctionalAssessmentBodyRegion = selectFunctionalAssessmentBodyRegion;
window.goFunctionalAssessmentShoulderPrep = goFunctionalAssessmentShoulderPrep;
window.goFunctionalAssessmentShoulderIntro = goFunctionalAssessmentShoulderIntro;
window.startFunctionalAssessmentShoulderSession = startFunctionalAssessmentShoulderSession;
window.goFunctionalAssessmentShoulderSessionBack = goFunctionalAssessmentShoulderSessionBack;
window.advanceFunctionalAssessmentShoulderMovement = advanceFunctionalAssessmentShoulderMovement;
window.beginShoulderCameraSession = beginShoulderCameraSession;

render();

// LE04 側抬腿：沿用既有偵測頁版型，並維持舊動作程式不變。
let le04Meta,le04Cam,le04Ctx,le04Stable,le04Tracker,le04Done=false;
function le04Set(id,value){const el=document.getElementById(id);if(el)el.textContent=value;}
function goLe04Detection(){const c=getExercisePageContext();if(!c)return;const{mode,schedule,ex}=c,rel=mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;le04Meta={mode,navigationOrigin:state.navigationOrigin,scheduleId:mode==="assigned"?schedule.id:null,exerciseIndex:mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:ex.exerciseId,exerciseName:ex.exerciseName,patientId:state.user.id,therapistId:mode==="assigned"?schedule.therapistId:rel?.therapistId,targetReps:calculateSquatTargetReps(ex),rewardXp:ex.rewardXp||DEFAULT_LE04_REWARD_XP};le04Done=false;state.route="le04Detection";render();beginLe04Camera();}
function le04DetectionPage(){const m=le04Meta||{exerciseName:"側抬腿",targetReps:10};return `<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitLe04Detection()">返回</button><b>AI 側抬腿偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>${m.exerciseName}</h2><div class="small" style="margin-bottom:10px">側躺並保持身體穩定，膝蓋伸直；將上側腿抬起後慢慢放回，並讓肩、髖、膝與腳踝入鏡。</div><div class="squat-camera-wrap"><video id="le04Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="le04Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="le04Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="le04Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="le04Total">0</span><span class="squat-rep-counter-sep">/ ${m.targetReps}</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="le04Dot"></span><span id="le04ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="le04Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成次數</span><b><span id="le04StatTotal">0</span> / ${m.targetReps}</b></div><div class="stat"><span class="small">左 / 右</span><b><span id="le04Left">0</span> / <span id="le04Right">0</span></b></div><div class="stat"><span class="small">品質分數</span><b id="le04Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="le04Ready">--</b></div><div class="small">左髖：<b id="le04LeftHip">--</b>　右髖：<b id="le04RightHip">--</b></div><div class="small">身體晃動：<b id="le04Roll">--</b></div><div class="small">即時提醒：<b id="le04Feedback">請側躺並保持全身入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">角度與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="le04Finish" onclick="finalizeLe04Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitLe04Detection()">放棄本次訓練</button>`;}
function beginLe04Camera(){const v=document.getElementById("le04Video"),c=document.getElementById("le04Canvas");if(!v||!c)return;stopLe04Camera();le04Ctx=c.getContext("2d");le04Tracker=createSideLegRaiseSession({targetReps:le04Meta.targetReps});le04Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:LE04_THRESHOLDS.MIN_VISIBILITY},LE04_REQUIRED_LANDMARKS);le04Cam=createSquatCameraController({videoEl:v,onStatus:s=>le04Set("le04Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleLe04Frame,onFatalError:m=>le04Set("le04Status",m)});le04Cam.start();}
function drawLe04(l){const c=document.getElementById("le04Canvas"),v=document.getElementById("le04Video");if(!c||!le04Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}le04Ctx.clearRect(0,0,c.width,c.height);if(!l)return;le04Ctx.strokeStyle="#7ea866";le04Ctx.fillStyle="#5f8d49";le04Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;le04Ctx.beginPath();le04Ctx.moveTo(a.x*c.width,a.y*c.height);le04Ctx.lineTo(b.x*c.width,b.y*c.height);le04Ctx.stroke()});l.forEach(p=>{if(!p)return;le04Ctx.beginPath();le04Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);le04Ctx.fill()});}
function handleLe04Frame(l,time){if(state.route!=="le04Detection"||!le04Stable||!le04Tracker||le04Done)return;drawLe04(l);const d=le04Stable.update(l,time),m=computeSideLegRaiseMetrics(l,LE04_THRESHOLDS),ready=!!l&&hasFullLowerBody(l,LE04_THRESHOLDS,LE04_REQUIRED_LANDMARKS),r=le04Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary;const dot=document.getElementById("le04Dot");if(dot)dot.className=`squat-readiness-dot ${d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial"}`;le04Set("le04ReadyText",ready?"已偵測到全身，可以開始側抬腿":"請保持全身入鏡");le04Set("le04Ready",d.framing?`${d.displayState}（${d.framing}）`:d.displayState);le04Set("le04LeftHip",m.leftHipAngle==null?"--":Math.round(m.leftHipAngle)+"°");le04Set("le04RightHip",m.rightHipAngle==null?"--":Math.round(m.rightHipAngle)+"°");le04Set("le04Roll",m.bodyRollDeg==null?"--":Math.round(m.bodyRollDeg)+"°");le04Set("le04Total",s.totalReps);le04Set("le04StatTotal",s.totalReps);le04Set("le04Left",s.leftReps);le04Set("le04Right",s.rightReps);le04Set("le04Score",s.totalReps?calculateSideLegRaiseScore(s).score:"--");const ring=document.getElementById("le04Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(s.totalReps,s.targetReps)));if(r.completedReps.length){const rep=r.completedReps.at(-1),issue=rep.issues[0],counter=document.getElementById("le04Counter");le04Set("le04Feedback",issue?LE04_QUALITY_ISSUE_LABELS[issue]:`${rep.side==="left"?"左":"右"}腿完成得很好`);if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}else if(!ready)le04Set("le04Feedback","請讓肩、髖、膝與腳踝完整入鏡");else if(m.bodyRollDeg>LE04_THRESHOLDS.BODY_ROLL_MAX_DEG)le04Set("le04Feedback","收緊核心，避免身體向後翻轉");else le04Set("le04Feedback","保持膝蓋伸直，抬腿後慢慢放回");if(s.completed){le04Done=true;stopLe04Camera();le04Set("le04Status","訓練次數已完成！請儲存結果");le04Set("le04Finish","儲存並查看結果");}}
function stopLe04Camera(){le04Cam?.stop();le04Cam=null;le04Ctx=null;le04Stable=null;}
function finalizeLe04Training(){if(!le04Tracker?.getSummary().totalReps)return alert("尚未偵測到完整動作，請至少完成一次後再儲存。");stopLe04Camera();const m=le04Meta,s=le04Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,{score,quality}=calculateSideLegRaiseScore(s),now=nowIso();analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:LE04_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score,overallScore:score,quality,remark:buildSideLegRaiseRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now});gameService.addXp(m.patientId,m.rewardXp);le04Tracker=null;le04Meta=null;navigateAfterSquat(m);}
function exitLe04Detection(){stopLe04Camera();const m=le04Meta;le04Tracker=null;le04Meta=null;navigateAfterSquat(m);}
const renderBeforeLe04=render;render=function(){if(state.route==="le04Detection"){app.innerHTML=phone(le04DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeLe04();};
const openCameraBeforeLe04=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),analyzer=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return analyzer===POSE_ANALYZER.LE04_SIDE_LEG_RAISE?goLe04Detection():openCameraBeforeLe04();};
window.openCameraPlaceholder=openCameraPlaceholder;window.goLe04Detection=goLe04Detection;window.exitLe04Detection=exitLe04Detection;window.finalizeLe04Training=finalizeLe04Training;

let le06Meta,le06Cam,le06Ctx,le06Stable,le06Tracker,le06Done=false;
function le06Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goLe06Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;le06Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetSeconds:Number(c.catalog.defaultDurationSeconds||x.durationSeconds)||30,rewardXp:x.rewardXp||DEFAULT_LE06_REWARD_XP};le06Done=false;state.route="le06Detection";render();beginLe06Camera();}
function le06DetectionPage(){const m=le06Meta||{exerciseName:"平衡",targetSeconds:30};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitLe06Detection()">返回</button><b>AI 平衡偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">雙腳穩定站立、看向前方，鏡頭固定並讓全身入鏡；旁邊請保留安全扶手或由家人陪同。</div><div class="squat-camera-wrap"><video id="le06Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="le06Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="le06Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="le06Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="le06Seconds">0</span><span class="squat-rep-counter-sep">/ '+m.targetSeconds+'</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="le06Dot"></span><span id="le06ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="le06Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">維持時間</span><b><span id="le06Held">0</span> 秒</b></div><div class="stat"><span class="small">晃動提醒</span><b id="le06SwayCount">0</b></div><div class="stat"><span class="small">品質分數</span><b id="le06Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="le06Ready">--</b></div><div class="small">重心晃動：<b id="le06Sway">--</b>　軀幹側傾：<b id="le06Lean">--</b></div><div class="small">疑似跨步：<b id="le06Steps">0 次</b></div><div class="small">即時提醒：<b id="le06Feedback">請站好並保持全身入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">偵測與分數為 prototype 工程判定，不代表醫療診斷或跌倒風險診斷。</div><button class="btn btn-primary full" id="le06Finish" onclick="finalizeLe06Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitLe06Detection()">放棄本次訓練</button>';}
function beginLe06Camera(){const v=document.getElementById("le06Video"),c=document.getElementById("le06Canvas");if(!v||!c)return;stopLe06Camera();le06Ctx=c.getContext("2d");le06Tracker=createBalanceSession({targetDurationMs:le06Meta.targetSeconds*1000});le06Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:LE06_THRESHOLDS.MIN_VISIBILITY},LE06_REQUIRED_LANDMARKS);le06Cam=createSquatCameraController({videoEl:v,onStatus:s=>le06Set("le06Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleLe06Frame,onFatalError:m=>le06Set("le06Status",m)});le06Cam.start();}
function drawLe06(l){const c=document.getElementById("le06Canvas"),v=document.getElementById("le06Video");if(!c||!le06Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}le06Ctx.clearRect(0,0,c.width,c.height);if(!l)return;le06Ctx.strokeStyle="#7ea866";le06Ctx.fillStyle="#5f8d49";le06Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;le06Ctx.beginPath();le06Ctx.moveTo(a.x*c.width,a.y*c.height);le06Ctx.lineTo(b.x*c.width,b.y*c.height);le06Ctx.stroke()});l.forEach(p=>{if(!p)return;le06Ctx.beginPath();le06Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);le06Ctx.fill()});}
function handleLe06Frame(l,time){if(state.route!=="le06Detection"||!le06Stable||!le06Tracker||le06Done)return;drawLe06(l);const d=le06Stable.update(l,time),m=computeBalanceMetrics(l,LE06_THRESHOLDS),ready=!!l&&hasFullLowerBody(l,LE06_THRESHOLDS,LE06_REQUIRED_LANDMARKS),r=le06Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,dot=document.getElementById("le06Dot");if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");le06Set("le06ReadyText",ready?"已偵測到全身，計時進行中":"請保持全身入鏡");le06Set("le06Ready",d.framing?d.displayState+"（"+d.framing+"）":d.displayState);le06Set("le06Seconds",s.heldSeconds);le06Set("le06Held",s.heldSeconds);le06Set("le06Sway",m.centerX==null?"--":s.maxSwayRatio<LE06_THRESHOLDS.MODERATE_SWAY_RATIO?"穩定":s.maxSwayRatio<LE06_THRESHOLDS.LARGE_SWAY_RATIO?"中度":"明顯");le06Set("le06Lean",m.trunkLeanDeg==null?"--":Math.round(m.trunkLeanDeg)+"°");le06Set("le06SwayCount",(s.moderateSwayCount||0)+(s.largeSwayCount||0));le06Set("le06Steps",s.stepCompensationCount+" 次");le06Set("le06Score",s.heldSeconds?calculateBalanceScore(s).score:"--");le06Set("le06Feedback",r.feedback);const ring=document.getElementById("le06Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-Math.min(1,s.heldDurationMs/s.targetDurationMs)));if(s.completed){le06Done=true;stopLe06Camera();le06Set("le06Status","平衡訓練完成！請儲存結果");le06Set("le06Finish","儲存並查看結果");document.getElementById("le06Counter")?.classList.add("complete");}}
function stopLe06Camera(){le06Cam?.stop();le06Cam=null;le06Ctx=null;le06Stable=null;}
function persistLe06(){if(!le06Meta||!le06Tracker)return false;const m=le06Meta,s=le06Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateBalanceScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:LE06_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.completed?1:0,targetReps:1,validReps:s.completed?1:0,score:q.score,overallScore:q.score,quality:q.quality,remark:buildBalanceRemark(s),summary:s});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}
function finalizeLe06Training(){if(!le06Tracker?.getSummary().heldSeconds)return alert("尚未偵測到有效站立時間，請至少完成數秒後再儲存。");stopLe06Camera();const m=le06Meta;if(persistLe06()){le06Tracker=null;le06Meta=null;navigateAfterSquat(m);}}
function exitLe06Detection(){stopLe06Camera();const m=le06Meta;le06Tracker=null;le06Meta=null;navigateAfterSquat(m);}
const renderBeforeLe06=render;render=function(){if(state.route==="le06Detection"){app.innerHTML=phone(le06DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeLe06();};
const openCameraBeforeLe06=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.LE06_BALANCE?goLe06Detection():openCameraBeforeLe06();};
window.openCameraPlaceholder=openCameraPlaceholder;window.goLe06Detection=goLe06Detection;window.exitLe06Detection=exitLe06Detection;window.finalizeLe06Training=finalizeLe06Training;
function renderLe06AnalysisResult(record){const s=record.summary||{},score=record.score??record.overallScore??0,reached=!!s.completed,xp=gamificationEngine.computeSessionXp(record),level=gamificationEngine.getPatientLevel(record.patientId),issues=[];if(s.largeSwayCount)issues.push("明顯晃動 ×"+s.largeSwayCount);if(s.moderateSwayCount)issues.push("中度晃動 ×"+s.moderateSwayCount);if(s.stepCompensationCount)issues.push("疑似跨步補償 ×"+s.stepCompensationCount);if(s.trackingInterruptionCount)issues.push("追蹤中斷 ×"+s.trackingInterruptionCount);return '<div class="detail-analysis-result"><div class="card result-hero">'+renderRobot(reached?"celebrate":"encourage","sm")+'<div class="result-hero-headline">今天維持 '+(s.heldSeconds||0)+' 秒'+(reached?"！":"")+'</div><div class="small result-hero-sub">本次平衡品質 '+score+' 分。</div><div class="result-hero-badges"><span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="">+'+xp.xp+' XP</span></div></div><div class="card" style="margin-top:10px"><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">'+(s.heldSeconds||0)+'<span class="result-summary-value-sep">/'+(s.targetSeconds||30)+'</span></div><div class="small">秒數</div></div><div class="result-summary-col"><div class="result-summary-value">'+score+'<span class="result-summary-value-sep">/100</span></div><div class="small">品質分數</div></div><div class="result-summary-col"><div class="result-summary-value">'+(s.trackingInterruptionCount||0)+'</div><div class="small">追蹤中斷</div></div></div></div><div class="card result-feedback-card" style="margin-top:10px"><div class="small result-feedback-title"><b>主要提醒</b></div>'+(issues.length?issues.map(x=>'<div class="result-feedback-row"><div class="small">↓ '+x+'</div></div>').join(""):'<div class="small">站立穩定，沒有特別需要注意的地方！</div>')+'</div><div class="card result-reward-card"><div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="">本次獲得　+'+xp.xp+' XP</div><div class="result-reward-level-row small">Lv.'+level.level+'　'+level.currentLevelXp+' / '+level.nextLevelXp+' XP</div></div><details class="result-tech-details"><summary>詳細分析</summary><div class="small" style="margin-top:8px">平均晃動比例：'+((s.averageSwayRatio||0)*100).toFixed(1)+'%｜最大晃動比例：'+((s.maxSwayRatio||0)*100).toFixed(1)+'%</div><div class="small" style="margin-top:6px"><b>AI 建議：</b>'+(record.remark||"—")+'</div><div class="small" style="margin-top:4px;color:#888">本結果為 prototype 工程評估，非醫療診斷或跌倒風險診斷。</div></details></div>';}
function renderLe06RecordDetail(record){const s=record.summary||{},score=record.score??record.overallScore??"—";return '<div class="card detail-block-card"><b class="detail-section-label">完成表現</b><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">'+(s.heldSeconds||0)+'<span class="result-summary-value-sep">/'+(s.targetSeconds||30)+'</span></div><div class="small">維持秒數</div></div><div class="result-summary-col"><div class="result-summary-value">'+score+'<span class="result-summary-value-sep">/100</span></div><div class="small">品質分數</div></div></div></div><div class="card detail-block-card"><b class="detail-section-label">動作觀察</b><div class="quality-issue-row"><span class="small">中度／明顯晃動</span><span class="small">'+(s.moderateSwayCount||0)+' / '+(s.largeSwayCount||0)+' 次</span></div><div class="quality-issue-row"><span class="small">疑似跨步補償</span><span class="small">'+(s.stepCompensationCount||0)+' 次</span></div><div class="quality-issue-row"><span class="small">追蹤中斷</span><span class="small">'+(s.trackingInterruptionCount||0)+' 次</span></div></div><details class="result-tech-details"><summary>詳細數據</summary><div class="small">平均晃動 '+((s.averageSwayRatio||0)*100).toFixed(1)+'%｜最大晃動 '+((s.maxSwayRatio||0)*100).toFixed(1)+'%</div><div class="small" style="margin-top:6px"><b>AI 建議：</b>'+(record.remark||"—")+'</div></details>';}
const resultBeforeLe06=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===LE06_ANALYSIS_MODE?renderLe06AnalysisResult(record):resultBeforeLe06(record,ex);};
const historyBeforeLe06=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeLe06(record);if(record.analysisMode===LE06_ANALYSIS_MODE){const s=record.summary||{};e.summaryLabel=(s.heldSeconds||0)+" / "+(s.targetSeconds||30)+" 秒｜品質 "+(record.score??record.overallScore??"—")+" 分";}return e;};
const genericBeforeLe06=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===LE06_ANALYSIS_MODE?renderLe06RecordDetail(record):genericBeforeLe06(record,entry);};

let le07Meta,le07Cam,le07Ctx,le07Stable,le07Tracker,le07Done=false;
function le07Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goLe07Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;le07Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetReps:calculateSquatTargetReps(x),rewardXp:x.rewardXp||DEFAULT_LE07_REWARD_XP};le07Done=false;state.route="le07Detection";render();beginLe07Camera();}
function le07DetectionPage(){const m=le07Meta||{exerciseName:"踮腳",targetReps:10};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitLe07Detection()">返回</button><b>AI 踮腳偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">雙腳平行站穩，腳跟一起抬起後慢慢放下；請讓全身與雙腳完整入鏡。</div><div class="squat-camera-wrap"><video id="le07Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="le07Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="le07Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="le07Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="le07Total">0</span><span class="squat-rep-counter-sep">/ '+m.targetReps+'</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="le07Dot"></span><span id="le07ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="le07Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成次數</span><b><span id="le07StatTotal">0</span> / '+m.targetReps+'</b></div><div class="stat"><span class="small">動作狀態</span><b id="le07State">站立</b></div><div class="stat"><span class="small">品質分數</span><b id="le07Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="le07Ready">--</b></div><div class="small">腳跟抬升：<b id="le07Rise">--</b>　左右差異：<b id="le07Asym">--</b></div><div class="small">平均膝角度：<b id="le07Knee">--</b>　軀幹傾斜：<b id="le07Lean">--</b></div><div class="small">即時提醒：<b id="le07Feedback">請站好並保持雙腳入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">位移與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="le07Finish" onclick="finalizeLe07Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitLe07Detection()">放棄本次訓練</button>';}
function beginLe07Camera(){const v=document.getElementById("le07Video"),c=document.getElementById("le07Canvas");if(!v||!c)return;stopLe07Camera();le07Ctx=c.getContext("2d");le07Tracker=createCalfRaiseSession({targetReps:le07Meta.targetReps});le07Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:LE07_THRESHOLDS.MIN_VISIBILITY},LE07_REQUIRED_LANDMARKS);le07Cam=createSquatCameraController({videoEl:v,onStatus:s=>le07Set("le07Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleLe07Frame,onFatalError:m=>le07Set("le07Status",m)});le07Cam.start();}
function drawLe07(l){const c=document.getElementById("le07Canvas"),v=document.getElementById("le07Video");if(!c||!le07Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}le07Ctx.clearRect(0,0,c.width,c.height);if(!l)return;le07Ctx.strokeStyle="#7ea866";le07Ctx.fillStyle="#5f8d49";le07Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;le07Ctx.beginPath();le07Ctx.moveTo(a.x*c.width,a.y*c.height);le07Ctx.lineTo(b.x*c.width,b.y*c.height);le07Ctx.stroke()});l.forEach(p=>{if(!p)return;le07Ctx.beginPath();le07Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);le07Ctx.fill()});}
function handleLe07Frame(l,time){if(state.route!=="le07Detection"||!le07Stable||!le07Tracker||le07Done)return;drawLe07(l);const d=le07Stable.update(l,time),m=computeCalfRaiseMetrics(l,LE07_THRESHOLDS),ready=!!l&&hasFullLowerBody(l,LE07_THRESHOLDS,LE07_REQUIRED_LANDMARKS),r=le07Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,dot=document.getElementById("le07Dot");if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");le07Set("le07ReadyText",ready?"已偵測到全身，可以開始踮腳":"請保持全身與雙腳入鏡");le07Set("le07Ready",d.framing?d.displayState+"（"+d.framing+"）":d.displayState);le07Set("le07Total",s.totalReps);le07Set("le07StatTotal",s.totalReps);le07Set("le07State",{down:"站立",rising:"踮起中",top:"最高點",lowering:"放下中"}[s.state]||s.state);le07Set("le07Rise",r.riseRatio==null?"--":Math.round(r.riseRatio*100)+"%");le07Set("le07Asym",m.heelAsymmetryRatio==null?"--":(m.heelAsymmetryRatio*100).toFixed(1)+"%");le07Set("le07Knee",m.averageKneeAngle==null?"--":Math.round(m.averageKneeAngle)+"°");le07Set("le07Lean",m.trunkLeanDeg==null?"--":Math.round(m.trunkLeanDeg)+"°");le07Set("le07Score",s.totalReps?calculateCalfRaiseScore(s).score:"--");const ring=document.getElementById("le07Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(s.totalReps,s.targetReps)));if(r.repCompleted){const issue=r.completedRep.issues[0],counter=document.getElementById("le07Counter");le07Set("le07Feedback",issue?LE07_ISSUE_LABELS[issue]:"很好，雙腳穩定踮起並慢慢放下");if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}else if(!ready)le07Set("le07Feedback","請調整位置，讓全身與雙腳完整入鏡");else if(m.trunkLeanDeg>LE07_THRESHOLDS.TRUNK_LEAN_MAX_DEG)le07Set("le07Feedback","身體保持垂直，避免重心前移");else if(m.averageKneeAngle<LE07_THRESHOLDS.KNEE_EXTENSION_MIN_DEG)le07Set("le07Feedback","保持膝蓋自然伸直");else le07Set("le07Feedback",s.state==="top"?"很好，慢慢控制腳跟放下":"雙腳平均出力，穩定踮起");if(s.completed){le07Done=true;stopLe07Camera();le07Set("le07Status","訓練次數已完成！請儲存結果");le07Set("le07Finish","儲存並查看結果");document.getElementById("le07Counter")?.classList.add("complete");}}
function stopLe07Camera(){le07Cam?.stop();le07Cam=null;le07Ctx=null;le07Stable=null;}
function persistLe07(){if(!le07Meta||!le07Tracker)return false;const m=le07Meta,s=le07Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateCalfRaiseScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:LE07_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score:q.score,overallScore:q.score,quality:q.quality,remark:buildCalfRaiseRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}
function finalizeLe07Training(){if(!le07Tracker?.getSummary().totalReps)return alert("尚未偵測到完整動作，請至少完成一次後再儲存。");stopLe07Camera();const m=le07Meta;if(persistLe07()){le07Tracker=null;le07Meta=null;navigateAfterSquat(m);}}
function exitLe07Detection(){stopLe07Camera();const m=le07Meta;le07Tracker=null;le07Meta=null;navigateAfterSquat(m);}
const renderBeforeLe07=render;render=function(){if(state.route==="le07Detection"){app.innerHTML=phone(le07DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeLe07();};
const openCameraBeforeLe07=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.LE07_CALF_RAISE?goLe07Detection():openCameraBeforeLe07();};
window.openCameraPlaceholder=openCameraPlaceholder;window.goLe07Detection=goLe07Detection;window.exitLe07Detection=exitLe07Detection;window.finalizeLe07Training=finalizeLe07Training;
function renderLe07AnalysisResult(record){const s=record.summary||{},score=record.score??record.overallScore??0,total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,xp=gamificationEngine.computeSessionXp(record),level=gamificationEngine.getPatientLevel(record.patientId),issues=[];if(s.insufficientLiftCount)issues.push("腳跟抬升不足 ×"+s.insufficientLiftCount);if(s.asymmetryCount)issues.push("左右不對稱 ×"+s.asymmetryCount);if(s.kneeBendCount)issues.push("膝蓋彎曲 ×"+s.kneeBendCount);if(s.trunkLeanCount)issues.push("身體前傾 ×"+s.trunkLeanCount);if(s.tooFastCount)issues.push("速度較快 ×"+s.tooFastCount);return '<div class="detail-analysis-result"><div class="card result-hero">'+renderRobot(total>=target?"celebrate":"encourage","sm")+'<div class="result-hero-headline">今天完成 '+total+' 次'+(total>=target?"！":"")+'</div><div class="small result-hero-sub">本次動作品質 '+score+' 分。</div><div class="result-hero-badges"><span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="">+'+xp.xp+' XP</span></div></div><div class="card" style="margin-top:10px"><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">'+total+'<span class="result-summary-value-sep">/'+target+'</span></div><div class="small">完成</div></div><div class="result-summary-col"><div class="result-summary-value">'+score+'<span class="result-summary-value-sep">/100</span></div><div class="small">品質分數</div></div><div class="result-summary-col"><div class="result-summary-value">'+(s.trackingInterruptionCount||0)+'</div><div class="small">追蹤中斷</div></div></div></div><div class="card result-feedback-card" style="margin-top:10px"><div class="small result-feedback-title"><b>主要提醒</b></div>'+(issues.length?issues.slice(0,3).map(x=>'<div class="result-feedback-row"><div class="small">↓ '+x+'</div></div>').join(""):'<div class="small">雙腳踮起穩定，繼續保持！</div>')+'</div><div class="card result-reward-card"><div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="">本次獲得　+'+xp.xp+' XP</div><div class="result-reward-level-row small">Lv.'+level.level+'　'+level.currentLevelXp+' / '+level.nextLevelXp+' XP</div></div><details class="result-tech-details"><summary>詳細分析</summary><div class="small" style="margin-top:8px">平均最大抬升：'+(s.averageMaxRiseRatio==null?"—":(s.averageMaxRiseRatio*100).toFixed(1)+"%")+'｜平均每次時間：'+(s.averageRepDuration==null?"—":(s.averageRepDuration/1000).toFixed(1)+"秒")+'</div><div class="small" style="margin-top:6px"><b>AI 建議：</b>'+(record.remark||"—")+'</div><div class="small" style="margin-top:4px;color:#888">本結果為 prototype 工程評估，非醫療診斷。</div></details></div>';}
function renderLe07RecordDetail(record){const s=record.summary||{},score=record.score??record.overallScore??"—",total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0;return '<div class="card detail-block-card"><b class="detail-section-label">完成表現</b><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">'+total+'<span class="result-summary-value-sep">/'+target+'</span></div><div class="small">完成次數</div></div><div class="result-summary-col"><div class="result-summary-value">'+score+'<span class="result-summary-value-sep">/100</span></div><div class="small">品質分數</div></div></div></div><div class="card detail-block-card"><b class="detail-section-label">動作觀察</b><div class="quality-issue-row"><span class="small">抬升不足／不對稱</span><span class="small">'+(s.insufficientLiftCount||0)+' / '+(s.asymmetryCount||0)+' 次</span></div><div class="quality-issue-row"><span class="small">膝彎／身體前傾</span><span class="small">'+(s.kneeBendCount||0)+' / '+(s.trunkLeanCount||0)+' 次</span></div><div class="quality-issue-row"><span class="small">速度較快</span><span class="small">'+(s.tooFastCount||0)+' 次</span></div></div><details class="result-tech-details"><summary>詳細數據</summary><div class="small">平均最大抬升 '+(s.averageMaxRiseRatio==null?"—":(s.averageMaxRiseRatio*100).toFixed(1)+"%")+'｜平均時間 '+(s.averageRepDuration==null?"—":(s.averageRepDuration/1000).toFixed(1)+" 秒")+'</div><div class="small" style="margin-top:6px"><b>AI 建議：</b>'+(record.remark||"—")+'</div></details>';}
const resultBeforeLe07=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===LE07_ANALYSIS_MODE?renderLe07AnalysisResult(record):resultBeforeLe07(record,ex);};
const historyBeforeLe07=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeLe07(record);if(record.analysisMode===LE07_ANALYSIS_MODE)e.summaryLabel=(record.totalReps||0)+" / "+(record.targetReps||0)+" 次｜品質 "+(record.score??record.overallScore??"—")+" 分";return e;};
const genericBeforeLe07=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===LE07_ANALYSIS_MODE?renderLe07RecordDetail(record):genericBeforeLe07(record,entry);};

let sh01Meta,sh01Cam,sh01Ctx,sh01Stable,sh01Tracker,sh01Done=false;
function sh01Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goSh01Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;sh01Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetReps:calculateSquatTargetReps(x),rewardXp:x.rewardXp||DEFAULT_SH01_REWARD_XP};sh01Done=false;state.route="sh01Detection";render();beginSh01Camera();}
function sh01DetectionPage(){const m=sh01Meta||{exerciseName:"肩關節擺盪運動",targetReps:10};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitSh01Detection()">返回</button><b>AI 肩關節擺盪偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">身體前傾，健側手扶穩，患側手臂放鬆下垂並小幅擺動；請讓肩、肘、手腕與髖部入鏡。</div><div class="squat-camera-wrap"><video id="sh01Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="sh01Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="sh01Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="sh01Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="sh01Total">0</span><span class="squat-rep-counter-sep">/ '+m.targetReps+'</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="sh01Dot"></span><span id="sh01ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="sh01Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成圈數</span><b><span id="sh01StatTotal">0</span> / '+m.targetReps+'</b></div><div class="stat"><span class="small">擺動側</span><b id="sh01Side">判定中</b></div><div class="stat"><span class="small">品質分數</span><b id="sh01Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="sh01Ready">--</b></div><div class="small">擺動幅度：<b id="sh01Amp">--</b>　手臂角度：<b id="sh01Arm">--</b></div><div class="small">身體前傾：<b id="sh01Trunk">--</b>　肩膀差異：<b id="sh01Shrug">--</b></div><div class="small">即時提醒：<b id="sh01Feedback">請擺好姿勢並保持上半身入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">角度與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="sh01Finish" onclick="finalizeSh01Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitSh01Detection()">放棄本次訓練</button>';}
function beginSh01Camera(){const v=document.getElementById("sh01Video"),c=document.getElementById("sh01Canvas");if(!v||!c)return;stopSh01Camera();sh01Ctx=c.getContext("2d");sh01Tracker=createShoulderPendulumSession({targetReps:sh01Meta.targetReps});sh01Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:SH01_THRESHOLDS.MIN_VISIBILITY},SH01_REQUIRED_LANDMARKS);sh01Cam=createSquatCameraController({videoEl:v,onStatus:s=>sh01Set("sh01Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleSh01Frame,onFatalError:m=>sh01Set("sh01Status",m)});sh01Cam.start();}
function drawSh01(l){const c=document.getElementById("sh01Canvas"),v=document.getElementById("sh01Video");if(!c||!sh01Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}sh01Ctx.clearRect(0,0,c.width,c.height);if(!l)return;sh01Ctx.strokeStyle="#7ea866";sh01Ctx.fillStyle="#5f8d49";sh01Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;sh01Ctx.beginPath();sh01Ctx.moveTo(a.x*c.width,a.y*c.height);sh01Ctx.lineTo(b.x*c.width,b.y*c.height);sh01Ctx.stroke()});l.forEach(p=>{if(!p)return;sh01Ctx.beginPath();sh01Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);sh01Ctx.fill()});}
function handleSh01Frame(l,time){if(state.route!=="sh01Detection"||!sh01Stable||!sh01Tracker||sh01Done)return;drawSh01(l);const d=sh01Stable.update(l,time),m=computeShoulderPendulumMetrics(l,SH01_THRESHOLDS),ready=!!l&&SH01_REQUIRED_LANDMARKS.every(i=>l[i]&&(l[i].visibility==null||l[i].visibility>=SH01_THRESHOLDS.MIN_VISIBILITY)),r=sh01Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,dot=document.getElementById("sh01Dot"),arm=s.activeSide==="right"?m.rightArmAngle:m.leftArmAngle;if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");sh01Set("sh01ReadyText",ready?"已偵測到上半身，可以開始擺動":"請保持肩、肘、手腕與髖部入鏡");sh01Set("sh01Ready",d.displayState);sh01Set("sh01Total",s.totalReps);sh01Set("sh01StatTotal",s.totalReps);sh01Set("sh01Side",s.activeSide==="left"?"左手":s.activeSide==="right"?"右手":"判定中");sh01Set("sh01Amp",r.displacementRatio==null?"--":Math.abs(r.displacementRatio*100).toFixed(1)+"%");sh01Set("sh01Arm",arm==null?"--":Math.round(arm)+"°");sh01Set("sh01Trunk",m.trunkForwardDeg==null?"--":Math.round(m.trunkForwardDeg)+"°");sh01Set("sh01Shrug",m.shoulderAsymmetryRatio==null?"--":(m.shoulderAsymmetryRatio*100).toFixed(1)+"%");sh01Set("sh01Score",s.totalReps?calculateShoulderPendulumScore(s).score:"--");const ring=document.getElementById("sh01Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(s.totalReps,s.targetReps)));if(r.repCompleted){const issue=r.completedRep.issues[0],counter=document.getElementById("sh01Counter");sh01Set("sh01Feedback",issue?SH01_ISSUE_LABELS[issue]:"很好，手臂放鬆且擺動穩定");if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}else if(!ready)sh01Set("sh01Feedback","請讓肩、肘、手腕與髖部完整入鏡");else if(arm>SH01_THRESHOLDS.ARM_LIFT_MAX_DEG)sh01Set("sh01Feedback","放鬆肩膀，讓手臂自然下垂");else if(m.trunkForwardDeg<SH01_THRESHOLDS.TRUNK_FORWARD_MIN_DEG)sh01Set("sh01Feedback","身體再稍微前傾，健側手扶穩");else sh01Set("sh01Feedback","利用身體微動帶動手臂小幅擺動");if(s.completed){sh01Done=true;stopSh01Camera();sh01Set("sh01Status","訓練圈數已完成！請儲存結果");sh01Set("sh01Finish","儲存並查看結果");document.getElementById("sh01Counter")?.classList.add("complete");}}
function stopSh01Camera(){sh01Cam?.stop();sh01Cam=null;sh01Ctx=null;sh01Stable=null;}
function persistSh01(){if(!sh01Meta||!sh01Tracker)return false;const m=sh01Meta,s=sh01Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateShoulderPendulumScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:SH01_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score:q.score,overallScore:q.score,quality:q.quality,remark:buildShoulderPendulumRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}
function finalizeSh01Training(){if(!sh01Tracker?.getSummary().totalReps)return alert("尚未偵測到完整擺動，請至少完成一圈後再儲存。");stopSh01Camera();const m=sh01Meta;if(persistSh01()){sh01Tracker=null;sh01Meta=null;navigateAfterSquat(m);}}
function exitSh01Detection(){stopSh01Camera();const m=sh01Meta;sh01Tracker=null;sh01Meta=null;navigateAfterSquat(m);}
const renderBeforeSh01=render;render=function(){if(state.route==="sh01Detection"){app.innerHTML=phone(sh01DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeSh01();};
const cameraBeforeSh01=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.SH01_SHOULDER_PENDULUM?goSh01Detection():cameraBeforeSh01();};
window.openCameraPlaceholder=openCameraPlaceholder;window.goSh01Detection=goSh01Detection;window.exitSh01Detection=exitSh01Detection;window.finalizeSh01Training=finalizeSh01Training;
function renderSh01AnalysisResult(record){const s=record.summary||{},score=record.score??record.overallScore??0,total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,xp=gamificationEngine.computeSessionXp(record),level=gamificationEngine.getPatientLevel(record.patientId),issues=[];if(s.activeLiftCount)issues.push("手臂主動抬起 ×"+s.activeLiftCount);if(s.excessiveSwingCount)issues.push("擺動幅度過大 ×"+s.excessiveSwingCount);if(s.trunkPostureCount)issues.push("身體前傾需調整 ×"+s.trunkPostureCount);if(s.shrugCount)issues.push("聳肩 ×"+s.shrugCount);return '<div class="detail-analysis-result"><div class="card result-hero">'+renderRobot(total>=target?"celebrate":"encourage","sm")+'<div class="result-hero-headline">今天完成 '+total+' 圈'+(total>=target?"！":"")+'</div><div class="small result-hero-sub">本次動作品質 '+score+' 分。</div><div class="result-hero-badges"><span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="">+'+xp.xp+' XP</span></div></div><div class="card" style="margin-top:10px"><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">'+total+'<span class="result-summary-value-sep">/'+target+'</span></div><div class="small">完成圈數</div></div><div class="result-summary-col"><div class="result-summary-value">'+score+'<span class="result-summary-value-sep">/100</span></div><div class="small">品質分數</div></div><div class="result-summary-col"><div class="result-summary-value">'+(s.trackingInterruptionCount||0)+'</div><div class="small">追蹤中斷</div></div></div></div><div class="card result-feedback-card" style="margin-top:10px"><div class="small result-feedback-title"><b>主要提醒</b></div>'+(issues.length?issues.slice(0,3).map(x=>'<div class="result-feedback-row"><div class="small">↓ '+x+'</div></div>').join(""):'<div class="small">手臂放鬆，擺動節奏穩定！</div>')+'</div><div class="card result-reward-card"><div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="">本次獲得　+'+xp.xp+' XP</div><div class="result-reward-level-row small">Lv.'+level.level+'　'+level.currentLevelXp+' / '+level.nextLevelXp+' XP</div></div><details class="result-tech-details"><summary>詳細分析</summary><div class="small" style="margin-top:8px">主要擺動側：'+(s.activeSide==="left"?"左手":s.activeSide==="right"?"右手":"—")+'｜平均幅度：'+(s.averageAmplitudeRatio==null?"—":(s.averageAmplitudeRatio*100).toFixed(1)+"%")+'｜平均週期：'+(s.averageCycleDuration==null?"—":(s.averageCycleDuration/1000).toFixed(1)+"秒")+'</div><div class="small" style="margin-top:6px"><b>AI 建議：</b>'+(record.remark||"—")+'</div><div class="small" style="margin-top:4px;color:#888">本結果為 prototype 工程評估，非醫療診斷。</div></details></div>';}
function renderSh01RecordDetail(record){const s=record.summary||{},score=record.score??record.overallScore??"—",total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0;return '<div class="card detail-block-card"><b class="detail-section-label">完成表現</b><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">'+total+'<span class="result-summary-value-sep">/'+target+'</span></div><div class="small">完成圈數</div></div><div class="result-summary-col"><div class="result-summary-value">'+score+'<span class="result-summary-value-sep">/100</span></div><div class="small">品質分數</div></div></div></div><div class="card detail-block-card"><b class="detail-section-label">動作觀察</b><div class="quality-issue-row"><span class="small">主動抬手／幅度過大</span><span class="small">'+(s.activeLiftCount||0)+' / '+(s.excessiveSwingCount||0)+' 次</span></div><div class="quality-issue-row"><span class="small">姿勢／聳肩</span><span class="small">'+(s.trunkPostureCount||0)+' / '+(s.shrugCount||0)+' 次</span></div><div class="quality-issue-row"><span class="small">速度較快</span><span class="small">'+(s.tooFastCount||0)+' 次</span></div></div><details class="result-tech-details"><summary>詳細數據</summary><div class="small">平均擺動幅度 '+(s.averageAmplitudeRatio==null?"—":(s.averageAmplitudeRatio*100).toFixed(1)+"%")+'｜平均週期 '+(s.averageCycleDuration==null?"—":(s.averageCycleDuration/1000).toFixed(1)+" 秒")+'</div><div class="small" style="margin-top:6px"><b>AI 建議：</b>'+(record.remark||"—")+'</div></details>';}
const resultBeforeSh01=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===SH01_ANALYSIS_MODE?renderSh01AnalysisResult(record):resultBeforeSh01(record,ex);};
const historyBeforeSh01=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeSh01(record);if(record.analysisMode===SH01_ANALYSIS_MODE)e.summaryLabel=(record.totalReps||0)+" / "+(record.targetReps||0)+" 圈｜品質 "+(record.score??record.overallScore??"—")+" 分";return e;};
const genericBeforeSh01=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===SH01_ANALYSIS_MODE?renderSh01RecordDetail(record):genericBeforeSh01(record,entry);};

let sh02Meta,sh02Cam,sh02Ctx,sh02Stable,sh02Tracker,sh02Done=false;
function sh02Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goSh02Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;sh02Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetReps:Number(x.repetitions)||5,rewardXp:x.rewardXp||DEFAULT_SH02_REWARD_XP};sh02Done=false;state.route="sh02Detection";render();beginSh02Camera();}
function sh02DetectionPage(){const m=sh02Meta||{exerciseName:"站姿肩外旋等長收縮",targetReps:5};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitSh02Detection()">返回</button><b>AI 肩外旋等長偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">手肘彎曲約 90°並貼近身體，手外側抵住固定物；用力但不要產生明顯位移，每次維持 6 秒。</div><div class="squat-camera-wrap"><video id="sh02Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="sh02Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="sh02Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="sh02Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="sh02Seconds">0</span><span class="squat-rep-counter-sep">/ 6</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="sh02Dot"></span><span id="sh02ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="sh02Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成次數</span><b><span id="sh02Total">0</span> / '+m.targetReps+'</b></div><div class="stat"><span class="small">偵測側</span><b id="sh02Side">判定中</b></div><div class="stat"><span class="small">品質分數</span><b id="sh02Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="sh02Ready">--</b></div><div class="small">手肘角度：<b id="sh02Elbow">--</b>　貼身程度：<b id="sh02Close">--</b></div><div class="small">軀幹旋轉：<b id="sh02Rotation">--</b>　肩膀差異：<b id="sh02Shrug">--</b></div><div class="small">即時提醒：<b id="sh02Feedback">請擺好姿勢並保持上半身入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">MediaPipe 無法量測肌肉出力；本功能僅評估可見姿勢穩定度，非醫療診斷。</div><button class="btn btn-primary full" id="sh02Finish" onclick="finalizeSh02Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitSh02Detection()">放棄本次訓練</button>';}
function beginSh02Camera(){const v=document.getElementById("sh02Video"),c=document.getElementById("sh02Canvas");if(!v||!c)return;stopSh02Camera();sh02Ctx=c.getContext("2d");sh02Tracker=createExternalIsometricSession({targetReps:sh02Meta.targetReps});sh02Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:SH02_THRESHOLDS.MIN_VISIBILITY},SH02_REQUIRED_LANDMARKS);sh02Cam=createSquatCameraController({videoEl:v,onStatus:s=>sh02Set("sh02Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleSh02Frame,onFatalError:m=>sh02Set("sh02Status",m)});sh02Cam.start();}
function drawSh02(l){const c=document.getElementById("sh02Canvas"),v=document.getElementById("sh02Video");if(!c||!sh02Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}sh02Ctx.clearRect(0,0,c.width,c.height);if(!l)return;sh02Ctx.strokeStyle="#7ea866";sh02Ctx.fillStyle="#5f8d49";sh02Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;sh02Ctx.beginPath();sh02Ctx.moveTo(a.x*c.width,a.y*c.height);sh02Ctx.lineTo(b.x*c.width,b.y*c.height);sh02Ctx.stroke()});l.forEach(p=>{if(!p)return;sh02Ctx.beginPath();sh02Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);sh02Ctx.fill()});}
function handleSh02Frame(l,time){if(state.route!=="sh02Detection"||!sh02Stable||!sh02Tracker||sh02Done)return;drawSh02(l);const d=sh02Stable.update(l,time),m=computeExternalIsometricMetrics(l,SH02_THRESHOLDS),ready=!!l&&SH02_REQUIRED_LANDMARKS.every(i=>l[i]&&(l[i].visibility==null||l[i].visibility>=SH02_THRESHOLDS.MIN_VISIBILITY)),r=sh02Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,side=s.activeSide,a=side==="right"?m.rightElbowAngle:m.leftElbowAngle,e=side==="right"?m.rightElbowTorsoRatio:m.leftElbowTorsoRatio,dot=document.getElementById("sh02Dot");if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");sh02Set("sh02ReadyText",ready?"已偵測到上半身，可以開始維持":"請保持肩、肘、手腕與髖部入鏡");sh02Set("sh02Ready",d.displayState);sh02Set("sh02Seconds",Math.floor(s.currentHoldMs/1000));sh02Set("sh02Total",s.totalReps);sh02Set("sh02Side",side==="left"?"左手":side==="right"?"右手":"判定中");sh02Set("sh02Elbow",a==null?"--":Math.round(a)+"°");sh02Set("sh02Close",e==null?"--":e<=SH02_THRESHOLDS.ELBOW_TORSO_MAX_RATIO?"良好":"手肘偏離");sh02Set("sh02Rotation",m.torsoRotationDeg==null?"--":Math.round(m.torsoRotationDeg)+"°");sh02Set("sh02Shrug",m.shrugRatio==null?"--":(m.shrugRatio*100).toFixed(1)+"%");sh02Set("sh02Score",s.totalReps?calculateExternalIsometricScore(s).score:"--");sh02Set("sh02Feedback",r.feedback);const ring=document.getElementById("sh02Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-Math.min(1,s.currentHoldMs/s.holdTargetMs)));if(r.repCompleted){const counter=document.getElementById("sh02Counter");if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}if(s.completed){sh02Done=true;stopSh02Camera();sh02Set("sh02Status","訓練次數已完成！請儲存結果");sh02Set("sh02Finish","儲存並查看結果");document.getElementById("sh02Counter")?.classList.add("complete");}}
function stopSh02Camera(){sh02Cam?.stop();sh02Cam=null;sh02Ctx=null;sh02Stable=null;}
function persistSh02(){if(!sh02Meta||!sh02Tracker)return false;const m=sh02Meta,s=sh02Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateExternalIsometricScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:SH02_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score:q.score,overallScore:q.score,quality:q.quality,remark:buildExternalIsometricRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}
function finalizeSh02Training(){if(!sh02Tracker?.getSummary().totalReps)return alert("尚未完成一次 6 秒維持，請完成後再儲存。");stopSh02Camera();const m=sh02Meta;if(persistSh02()){sh02Tracker=null;sh02Meta=null;navigateAfterSquat(m);}}
function exitSh02Detection(){stopSh02Camera();const m=sh02Meta;sh02Tracker=null;sh02Meta=null;navigateAfterSquat(m);}
const renderBeforeSh02=render;render=function(){if(state.route==="sh02Detection"){app.innerHTML=phone(sh02DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeSh02();};
const cameraBeforeSh02=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.SH02_EXTERNAL_ISOMETRIC?goSh02Detection():cameraBeforeSh02();};
window.openCameraPlaceholder=openCameraPlaceholder;window.goSh02Detection=goSh02Detection;window.exitSh02Detection=exitSh02Detection;window.finalizeSh02Training=finalizeSh02Training;
function renderSh02AnalysisResult(record){const s=record.summary||{},score=record.score??record.overallScore??0,total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0,xp=gamificationEngine.computeSessionXp(record),level=gamificationEngine.getPatientLevel(record.patientId),issues=[];if(s.elbowAwayCount)issues.push("手肘離開身體 ×"+s.elbowAwayCount);if(s.wristMovementCount)issues.push("前臂位移過多 ×"+s.wristMovementCount);if(s.torsoRotationCount)issues.push("身體旋轉代償 ×"+s.torsoRotationCount);if(s.shrugCount)issues.push("聳肩 ×"+s.shrugCount);return '<div class="detail-analysis-result"><div class="card result-hero">'+renderRobot(total>=target?"celebrate":"encourage","sm")+'<div class="result-hero-headline">今天完成 '+total+' 次'+(total>=target?"！":"")+'</div><div class="small result-hero-sub">每次維持 6 秒，本次姿勢品質 '+score+' 分。</div><div class="result-hero-badges"><span class="result-hero-badge"><img src="/images/gamification/xp_coin.png" alt="">+'+xp.xp+' XP</span></div></div><div class="card" style="margin-top:10px"><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">'+total+'<span class="result-summary-value-sep">/'+target+'</span></div><div class="small">完成次數</div></div><div class="result-summary-col"><div class="result-summary-value">'+score+'<span class="result-summary-value-sep">/100</span></div><div class="small">品質分數</div></div><div class="result-summary-col"><div class="result-summary-value">'+(s.trackingInterruptionCount||0)+'</div><div class="small">追蹤中斷</div></div></div></div><div class="card result-feedback-card" style="margin-top:10px"><div class="small result-feedback-title"><b>主要提醒</b></div>'+(issues.length?issues.slice(0,3).map(x=>'<div class="result-feedback-row"><div class="small">↓ '+x+'</div></div>').join(""):'<div class="small">手肘與軀幹穩定，維持完整！</div>')+'</div><div class="card result-reward-card"><div class="result-reward-headline"><img class="result-reward-xp-icon" src="/images/gamification/xp_coin.png" alt="">本次獲得　+'+xp.xp+' XP</div><div class="result-reward-level-row small">Lv.'+level.level+'　'+level.currentLevelXp+' / '+level.nextLevelXp+' XP</div></div><details class="result-tech-details"><summary>詳細分析</summary><div class="small" style="margin-top:8px">偵測側：'+(s.activeSide==="left"?"左手":s.activeSide==="right"?"右手":"—")+'｜平均手肘角度：'+(s.averageElbowAngle==null?"—":Math.round(s.averageElbowAngle)+"°")+'｜平均維持：'+(s.averageHoldDuration==null?"—":(s.averageHoldDuration/1000).toFixed(1)+"秒")+'</div><div class="small" style="margin-top:6px"><b>AI 建議：</b>'+(record.remark||"—")+'</div><div class="small" style="margin-top:4px;color:#888">僅評估可見姿勢穩定度，無法量測肌肉出力，非醫療診斷。</div></details></div>';}
function renderSh02RecordDetail(record){const s=record.summary||{},score=record.score??record.overallScore??"—",total=s.totalReps??record.totalReps??0,target=s.targetReps??record.targetReps??0;return '<div class="card detail-block-card"><b class="detail-section-label">完成表現</b><div class="result-summary-row"><div class="result-summary-col"><div class="result-summary-value">'+total+'<span class="result-summary-value-sep">/'+target+'</span></div><div class="small">六秒維持</div></div><div class="result-summary-col"><div class="result-summary-value">'+score+'<span class="result-summary-value-sep">/100</span></div><div class="small">品質分數</div></div></div></div><div class="card detail-block-card"><b class="detail-section-label">動作觀察</b><div class="quality-issue-row"><span class="small">手肘偏離／前臂位移</span><span class="small">'+(s.elbowAwayCount||0)+' / '+(s.wristMovementCount||0)+' 次</span></div><div class="quality-issue-row"><span class="small">軀幹旋轉／聳肩</span><span class="small">'+(s.torsoRotationCount||0)+' / '+(s.shrugCount||0)+' 次</span></div></div><details class="result-tech-details"><summary>詳細數據</summary><div class="small">平均手肘角度 '+(s.averageElbowAngle==null?"—":Math.round(s.averageElbowAngle)+"°")+'｜平均維持 '+(s.averageHoldDuration==null?"—":(s.averageHoldDuration/1000).toFixed(1)+" 秒")+'</div><div class="small" style="margin-top:6px"><b>AI 建議：</b>'+(record.remark||"—")+'</div></details>';}
const resultBeforeSh02=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===SH02_ANALYSIS_MODE?renderSh02AnalysisResult(record):resultBeforeSh02(record,ex);};
const historyBeforeSh02=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeSh02(record);if(record.analysisMode===SH02_ANALYSIS_MODE)e.summaryLabel=(record.totalReps||0)+" / "+(record.targetReps||0)+" 次｜品質 "+(record.score??record.overallScore??"—")+" 分";return e;};
const genericBeforeSh02=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===SH02_ANALYSIS_MODE?renderSh02RecordDetail(record):genericBeforeSh02(record,entry);};

let sh03Meta,sh03Cam,sh03Ctx,sh03Stable,sh03Tracker,sh03Done=false;
function sh03Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goSh03Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;sh03Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetReps:Number(x.repetitions)||5,rewardXp:x.rewardXp||DEFAULT_SH03_REWARD_XP};sh03Done=false;state.route="sh03Detection";render();beginSh03Camera();}
function sh03DetectionPage(){const m=sh03Meta||{exerciseName:"站姿肩內旋等長收縮",targetReps:5};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitSh03Detection()">返回</button><b>AI 肩內旋等長偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">手肘彎曲約 90°並貼近身體，手掌向內推固定物；用力但不要產生明顯位移，每次維持 6 秒。</div><div class="squat-camera-wrap"><video id="sh03Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="sh03Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="sh03Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="sh03Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="sh03Seconds">0</span><span class="squat-rep-counter-sep">/ 6</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="sh03Dot"></span><span id="sh03ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="sh03Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成次數</span><b><span id="sh03Total">0</span> / '+m.targetReps+'</b></div><div class="stat"><span class="small">偵測側</span><b id="sh03Side">判定中</b></div><div class="stat"><span class="small">品質分數</span><b id="sh03Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="sh03Ready">--</b></div><div class="small">手肘角度：<b id="sh03Elbow">--</b>　貼身程度：<b id="sh03Close">--</b></div><div class="small">軀幹旋轉：<b id="sh03Rotation">--</b>　肩膀差異：<b id="sh03Shrug">--</b></div><div class="small">即時提醒：<b id="sh03Feedback">請擺好姿勢並保持上半身入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">MediaPipe 無法量測肌肉出力；本功能僅評估可見姿勢穩定度，非醫療診斷。</div><button class="btn btn-primary full" id="sh03Finish" onclick="finalizeSh03Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitSh03Detection()">放棄本次訓練</button>';}
function beginSh03Camera(){const v=document.getElementById("sh03Video"),c=document.getElementById("sh03Canvas");if(!v||!c)return;stopSh03Camera();sh03Ctx=c.getContext("2d");sh03Tracker=createExternalIsometricSession({targetReps:sh03Meta.targetReps,thresholds:SH03_THRESHOLDS});sh03Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:SH03_THRESHOLDS.MIN_VISIBILITY},SH03_REQUIRED_LANDMARKS);sh03Cam=createSquatCameraController({videoEl:v,onStatus:s=>sh03Set("sh03Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleSh03Frame,onFatalError:m=>sh03Set("sh03Status",m)});sh03Cam.start();}
function drawSh03(l){const c=document.getElementById("sh03Canvas"),v=document.getElementById("sh03Video");if(!c||!sh03Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}sh03Ctx.clearRect(0,0,c.width,c.height);if(!l)return;sh03Ctx.strokeStyle="#7ea866";sh03Ctx.fillStyle="#5f8d49";sh03Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;sh03Ctx.beginPath();sh03Ctx.moveTo(a.x*c.width,a.y*c.height);sh03Ctx.lineTo(b.x*c.width,b.y*c.height);sh03Ctx.stroke()});l.forEach(p=>{if(!p)return;sh03Ctx.beginPath();sh03Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);sh03Ctx.fill()});}
function handleSh03Frame(l,time){if(state.route!=="sh03Detection"||!sh03Stable||!sh03Tracker||sh03Done)return;drawSh03(l);const d=sh03Stable.update(l,time),m=computeExternalIsometricMetrics(l,SH03_THRESHOLDS),ready=!!l&&SH03_REQUIRED_LANDMARKS.every(i=>l[i]&&(l[i].visibility==null||l[i].visibility>=SH03_THRESHOLDS.MIN_VISIBILITY)),r=sh03Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,side=s.activeSide,a=side==="right"?m.rightElbowAngle:m.leftElbowAngle,e=side==="right"?m.rightElbowTorsoRatio:m.leftElbowTorsoRatio,dot=document.getElementById("sh03Dot");if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");sh03Set("sh03ReadyText",ready?"已偵測到上半身，可以開始維持":"請保持肩、肘、手腕與髖部入鏡");sh03Set("sh03Ready",d.displayState);sh03Set("sh03Seconds",Math.floor(s.currentHoldMs/1000));sh03Set("sh03Total",s.totalReps);sh03Set("sh03Side",side==="left"?"左手":side==="right"?"右手":"判定中");sh03Set("sh03Elbow",a==null?"--":Math.round(a)+"°");sh03Set("sh03Close",e==null?"--":e<=SH03_THRESHOLDS.ELBOW_TORSO_MAX_RATIO?"良好":"手肘偏離");sh03Set("sh03Rotation",m.torsoRotationDeg==null?"--":Math.round(m.torsoRotationDeg)+"°");sh03Set("sh03Shrug",m.shrugRatio==null?"--":(m.shrugRatio*100).toFixed(1)+"%");sh03Set("sh03Score",s.totalReps?calculateInternalIsometricScore(s).score:"--");sh03Set("sh03Feedback",r.feedback==="很好，持續穩定用力"?"很好，向內穩定用力並保持姿勢":r.feedback);const ring=document.getElementById("sh03Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-Math.min(1,s.currentHoldMs/s.holdTargetMs)));if(r.repCompleted){const counter=document.getElementById("sh03Counter");if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}if(s.completed){sh03Done=true;stopSh03Camera();sh03Set("sh03Status","訓練次數已完成！請儲存結果");sh03Set("sh03Finish","儲存並查看結果");document.getElementById("sh03Counter")?.classList.add("complete");}}
function stopSh03Camera(){sh03Cam?.stop();sh03Cam=null;sh03Ctx=null;sh03Stable=null;}
function persistSh03(){if(!sh03Meta||!sh03Tracker)return false;const m=sh03Meta,s=sh03Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateInternalIsometricScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:SH03_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score:q.score,overallScore:q.score,quality:q.quality,remark:buildInternalIsometricRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}
function finalizeSh03Training(){if(!sh03Tracker?.getSummary().totalReps)return alert("尚未完成一次 6 秒維持，請完成後再儲存。");stopSh03Camera();const m=sh03Meta;if(persistSh03()){sh03Tracker=null;sh03Meta=null;navigateAfterSquat(m);}}
function exitSh03Detection(){stopSh03Camera();const m=sh03Meta;sh03Tracker=null;sh03Meta=null;navigateAfterSquat(m);}
const renderBeforeSh03=render;render=function(){if(state.route==="sh03Detection"){app.innerHTML=phone(sh03DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeSh03();};
const cameraBeforeSh03=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.SH03_INTERNAL_ISOMETRIC?goSh03Detection():cameraBeforeSh03();};
window.openCameraPlaceholder=openCameraPlaceholder;window.goSh03Detection=goSh03Detection;window.exitSh03Detection=exitSh03Detection;window.finalizeSh03Training=finalizeSh03Training;
const resultBeforeSh03=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===SH03_ANALYSIS_MODE?renderSh02AnalysisResult(record):resultBeforeSh03(record,ex);};
const historyBeforeSh03=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeSh03(record);if(record.analysisMode===SH03_ANALYSIS_MODE)e.summaryLabel=(record.totalReps||0)+" / "+(record.targetReps||0)+" 次｜品質 "+(record.score??record.overallScore??"—")+" 分";return e;};
const genericBeforeSh03=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===SH03_ANALYSIS_MODE?renderSh02RecordDetail(record):genericBeforeSh03(record,entry);};

let hp04Meta,hp04Cam,hp04Ctx,hp04Stable,hp04Tracker,hp04Done=false;
function hp04Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goHp04Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;hp04Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetReps:calculateSquatTargetReps(x),rewardXp:x.rewardXp||DEFAULT_HP04_REWARD_XP};hp04Done=false;state.route="hp04Detection";render();beginHp04Camera();}
function hp04DetectionPage(){const m=hp04Meta||{exerciseName:"側躺髖外展",targetReps:10};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitHp04Detection()">返回</button><b>AI 側躺髖外展偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">側躺、上側腿伸直且腳尖朝前；將腿抬起約 30°～45°後慢慢放回，並保持骨盆穩定。</div><div class="squat-camera-wrap"><video id="hp04Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="hp04Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="hp04Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="hp04Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="hp04Total">0</span><span class="squat-rep-counter-sep">/ '+m.targetReps+'</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="hp04Dot"></span><span id="hp04ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="hp04Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成次數</span><b><span id="hp04StatTotal">0</span> / '+m.targetReps+'</b></div><div class="stat"><span class="small">左 / 右</span><b><span id="hp04Left">0</span> / <span id="hp04Right">0</span></b></div><div class="stat"><span class="small">品質分數</span><b id="hp04Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="hp04Ready">--</b></div><div class="small">左髖角度：<b id="hp04LeftHip">--</b>　右髖角度：<b id="hp04RightHip">--</b></div><div class="small">骨盆／身體翻轉：<b id="hp04Roll">--</b></div><div class="small">即時提醒：<b id="hp04Feedback">請側躺並保持全身入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">角度與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="hp04Finish" onclick="finalizeHp04Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitHp04Detection()">放棄本次訓練</button>';}
function beginHp04Camera(){const v=document.getElementById("hp04Video"),c=document.getElementById("hp04Canvas");if(!v||!c)return;stopHp04Camera();hp04Ctx=c.getContext("2d");hp04Tracker=createSideLegRaiseSession({targetReps:hp04Meta.targetReps,thresholds:HP04_THRESHOLDS});hp04Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:HP04_THRESHOLDS.MIN_VISIBILITY},HP04_REQUIRED_LANDMARKS);hp04Cam=createSquatCameraController({videoEl:v,onStatus:s=>hp04Set("hp04Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleHp04Frame,onFatalError:m=>hp04Set("hp04Status",m)});hp04Cam.start();}
function drawHp04(l){const c=document.getElementById("hp04Canvas"),v=document.getElementById("hp04Video");if(!c||!hp04Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}hp04Ctx.clearRect(0,0,c.width,c.height);if(!l)return;hp04Ctx.strokeStyle="#7ea866";hp04Ctx.fillStyle="#5f8d49";hp04Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;hp04Ctx.beginPath();hp04Ctx.moveTo(a.x*c.width,a.y*c.height);hp04Ctx.lineTo(b.x*c.width,b.y*c.height);hp04Ctx.stroke()});l.forEach(p=>{if(!p)return;hp04Ctx.beginPath();hp04Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);hp04Ctx.fill()});}
function handleHp04Frame(l,time){if(state.route!=="hp04Detection"||!hp04Stable||!hp04Tracker||hp04Done)return;drawHp04(l);const d=hp04Stable.update(l,time),m=computeSideLegRaiseMetrics(l,HP04_THRESHOLDS),ready=!!l&&hasFullLowerBody(l,HP04_THRESHOLDS,HP04_REQUIRED_LANDMARKS),r=hp04Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,dot=document.getElementById("hp04Dot");if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");hp04Set("hp04ReadyText",ready?"已偵測到全身，可以開始髖外展":"請保持肩、髖、膝與腳踝入鏡");hp04Set("hp04Ready",d.displayState);hp04Set("hp04Total",s.totalReps);hp04Set("hp04StatTotal",s.totalReps);hp04Set("hp04Left",s.leftReps);hp04Set("hp04Right",s.rightReps);hp04Set("hp04LeftHip",m.leftHipAngle==null?"--":Math.round(m.leftHipAngle)+"°");hp04Set("hp04RightHip",m.rightHipAngle==null?"--":Math.round(m.rightHipAngle)+"°");hp04Set("hp04Roll",m.bodyRollDeg==null?"--":Math.round(m.bodyRollDeg)+"°");hp04Set("hp04Score",s.totalReps?calculateHipAbductionScore(s).score:"--");const ring=document.getElementById("hp04Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(s.totalReps,s.targetReps)));if(r.completedReps.length){const rep=r.completedReps.at(-1),issue=rep.issues[0],counter=document.getElementById("hp04Counter");hp04Set("hp04Feedback",issue?HP04_ISSUE_LABELS[issue]:(rep.side==="left"?"左":"右")+"腿角度與控制良好");if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}else if(!ready)hp04Set("hp04Feedback","請讓肩、髖、膝與腳踝完整入鏡");else if(m.bodyRollDeg>HP04_THRESHOLDS.BODY_ROLL_MAX_DEG)hp04Set("hp04Feedback","收緊核心，固定骨盆避免向後翻");else hp04Set("hp04Feedback","上側腿伸直，腳尖朝前，緩慢抬至 30°～45°");if(s.completed){hp04Done=true;stopHp04Camera();hp04Set("hp04Status","訓練次數已完成！請儲存結果");hp04Set("hp04Finish","儲存並查看結果");document.getElementById("hp04Counter")?.classList.add("complete");}}
function stopHp04Camera(){hp04Cam?.stop();hp04Cam=null;hp04Ctx=null;hp04Stable=null;}
function persistHp04(){if(!hp04Meta||!hp04Tracker)return false;const m=hp04Meta,s=hp04Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateHipAbductionScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:HP04_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score:q.score,overallScore:q.score,quality:q.quality,remark:buildHipAbductionRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}
function finalizeHp04Training(){if(!hp04Tracker?.getSummary().totalReps)return alert("尚未偵測到完整動作，請至少完成一次後再儲存。");stopHp04Camera();const m=hp04Meta;if(persistHp04()){hp04Tracker=null;hp04Meta=null;navigateAfterSquat(m);}}
function exitHp04Detection(){stopHp04Camera();const m=hp04Meta;hp04Tracker=null;hp04Meta=null;navigateAfterSquat(m);}
const renderBeforeHp04=render;render=function(){if(state.route==="hp04Detection"){app.innerHTML=phone(hp04DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeHp04();};
const cameraBeforeHp04=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.HP04_HIP_ABDUCTION?goHp04Detection():cameraBeforeHp04();};
window.openCameraPlaceholder=openCameraPlaceholder;window.goHp04Detection=goHp04Detection;window.exitHp04Detection=exitHp04Detection;window.finalizeHp04Training=finalizeHp04Training;
const resultBeforeHp04=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===HP04_ANALYSIS_MODE?renderLe04AnalysisResult(record):resultBeforeHp04(record,ex);};
const historyBeforeHp04=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeHp04(record);if(record.analysisMode===HP04_ANALYSIS_MODE)e.summaryLabel=(record.totalReps||0)+" / "+(record.targetReps||0)+" 次｜品質 "+(record.score??record.overallScore??"—")+" 分";return e;};
const genericBeforeHp04=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===HP04_ANALYSIS_MODE?renderLe04RecordDetail(record):genericBeforeHp04(record,entry);};

let hp05Meta,hp05Cam,hp05Ctx,hp05Stable,hp05Tracker,hp05Done=false;
function hp05Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goHp05Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;hp05Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetReps:calculateSquatTargetReps(x),rewardXp:x.rewardXp||DEFAULT_HP05_REWARD_XP};hp05Done=false;state.route="hp05Detection";render();beginHp05Camera();}
function hp05DetectionPage(){const m=hp05Meta||{exerciseName:"側躺髖內收",targetReps:10};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitHp05Detection()">返回</button><b>AI 側躺髖內收偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">上側腿屈膝跨放前方，下側腿保持伸直；將下側腿抬起約 20°～30°後慢慢放回。</div><div class="squat-camera-wrap"><video id="hp05Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="hp05Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="hp05Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="hp05Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="hp05Total">0</span><span class="squat-rep-counter-sep">/ '+m.targetReps+'</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="hp05Dot"></span><span id="hp05ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="hp05Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成次數</span><b><span id="hp05StatTotal">0</span> / '+m.targetReps+'</b></div><div class="stat"><span class="small">左 / 右</span><b><span id="hp05Left">0</span> / <span id="hp05Right">0</span></b></div><div class="stat"><span class="small">品質分數</span><b id="hp05Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="hp05Ready">--</b></div><div class="small">左髖角度：<b id="hp05LeftHip">--</b>　右髖角度：<b id="hp05RightHip">--</b></div><div class="small">骨盆／身體晃動：<b id="hp05Roll">--</b></div><div class="small">即時提醒：<b id="hp05Feedback">請側躺並保持全身入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">角度與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="hp05Finish" onclick="finalizeHp05Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitHp05Detection()">放棄本次訓練</button>';}
function beginHp05Camera(){const v=document.getElementById("hp05Video"),c=document.getElementById("hp05Canvas");if(!v||!c)return;stopHp05Camera();hp05Ctx=c.getContext("2d");hp05Tracker=createSideLegRaiseSession({targetReps:hp05Meta.targetReps,thresholds:HP05_THRESHOLDS});hp05Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:HP05_THRESHOLDS.MIN_VISIBILITY},HP05_REQUIRED_LANDMARKS);hp05Cam=createSquatCameraController({videoEl:v,onStatus:s=>hp05Set("hp05Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleHp05Frame,onFatalError:m=>hp05Set("hp05Status",m)});hp05Cam.start();}
function drawHp05(l){const c=document.getElementById("hp05Canvas"),v=document.getElementById("hp05Video");if(!c||!hp05Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}hp05Ctx.clearRect(0,0,c.width,c.height);if(!l)return;hp05Ctx.strokeStyle="#7ea866";hp05Ctx.fillStyle="#5f8d49";hp05Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;hp05Ctx.beginPath();hp05Ctx.moveTo(a.x*c.width,a.y*c.height);hp05Ctx.lineTo(b.x*c.width,b.y*c.height);hp05Ctx.stroke()});l.forEach(p=>{if(!p)return;hp05Ctx.beginPath();hp05Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);hp05Ctx.fill()});}
function handleHp05Frame(l,time){if(state.route!=="hp05Detection"||!hp05Stable||!hp05Tracker||hp05Done)return;drawHp05(l);const d=hp05Stable.update(l,time),m=computeSideLegRaiseMetrics(l,HP05_THRESHOLDS),ready=!!l&&hasFullLowerBody(l,HP05_THRESHOLDS,HP05_REQUIRED_LANDMARKS),r=hp05Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,dot=document.getElementById("hp05Dot");if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");hp05Set("hp05ReadyText",ready?"已偵測到全身，可以開始髖內收":"請保持肩、髖、膝與腳踝入鏡");hp05Set("hp05Ready",d.displayState);hp05Set("hp05Total",s.totalReps);hp05Set("hp05StatTotal",s.totalReps);hp05Set("hp05Left",s.leftReps);hp05Set("hp05Right",s.rightReps);hp05Set("hp05LeftHip",m.leftHipAngle==null?"--":Math.round(m.leftHipAngle)+"°");hp05Set("hp05RightHip",m.rightHipAngle==null?"--":Math.round(m.rightHipAngle)+"°");hp05Set("hp05Roll",m.bodyRollDeg==null?"--":Math.round(m.bodyRollDeg)+"°");hp05Set("hp05Score",s.totalReps?calculateHipAdductionScore(s).score:"--");const ring=document.getElementById("hp05Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(s.totalReps,s.targetReps)));if(r.completedReps.length){const rep=r.completedReps.at(-1),issue=rep.issues[0],counter=document.getElementById("hp05Counter");hp05Set("hp05Feedback",issue?HP05_ISSUE_LABELS[issue]:(rep.side==="left"?"左":"右")+"腿內收角度與控制良好");if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}else if(!ready)hp05Set("hp05Feedback","請讓肩、髖、膝與腳踝完整入鏡");else if(m.bodyRollDeg>HP05_THRESHOLDS.BODY_ROLL_MAX_DEG)hp05Set("hp05Feedback","固定骨盆，避免身體前後晃動");else hp05Set("hp05Feedback","下側腿保持伸直，緩慢抬至 20°～30°");if(s.completed){hp05Done=true;stopHp05Camera();hp05Set("hp05Status","訓練次數已完成！請儲存結果");hp05Set("hp05Finish","儲存並查看結果");document.getElementById("hp05Counter")?.classList.add("complete");}}
function stopHp05Camera(){hp05Cam?.stop();hp05Cam=null;hp05Ctx=null;hp05Stable=null;}
function persistHp05(){if(!hp05Meta||!hp05Tracker)return false;const m=hp05Meta,s=hp05Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateHipAdductionScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:HP05_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score:q.score,overallScore:q.score,quality:q.quality,remark:buildHipAdductionRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}
function finalizeHp05Training(){if(!hp05Tracker?.getSummary().totalReps)return alert("尚未偵測到完整動作，請至少完成一次後再儲存。");stopHp05Camera();const m=hp05Meta;if(persistHp05()){hp05Tracker=null;hp05Meta=null;navigateAfterSquat(m);}}
function exitHp05Detection(){stopHp05Camera();const m=hp05Meta;hp05Tracker=null;hp05Meta=null;navigateAfterSquat(m);}
const renderBeforeHp05=render;render=function(){if(state.route==="hp05Detection"){app.innerHTML=phone(hp05DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeHp05();};
const cameraBeforeHp05=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.HP05_HIP_ADDUCTION?goHp05Detection():cameraBeforeHp05();};
window.openCameraPlaceholder=openCameraPlaceholder;window.goHp05Detection=goHp05Detection;window.exitHp05Detection=exitHp05Detection;window.finalizeHp05Training=finalizeHp05Training;
const resultBeforeHp05=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===HP05_ANALYSIS_MODE?renderLe04AnalysisResult(record):resultBeforeHp05(record,ex);};
const historyBeforeHp05=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeHp05(record);if(record.analysisMode===HP05_ANALYSIS_MODE)e.summaryLabel=(record.totalReps||0)+" / "+(record.targetReps||0)+" 次｜品質 "+(record.score??record.overallScore??"—")+" 分";return e;};
const genericBeforeHp05=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===HP05_ANALYSIS_MODE?renderLe04RecordDetail(record):genericBeforeHp05(record,entry);};

let hp06Meta,hp06Cam,hp06Ctx,hp06Stable,hp06Tracker,hp06Done=false;function hp06Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goHp06Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;hp06Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetReps:calculateSquatTargetReps(x),rewardXp:x.rewardXp||DEFAULT_HP06_REWARD_XP};hp06Done=false;state.route="hp06Detection";render();beginHp06Camera();}
function hp06DetectionPage(){const m=hp06Meta||{exerciseName:"蚌殼式",targetReps:10};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitHp06Detection()">返回</button><b>AI 蚌殼式偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">側躺、雙膝彎曲約 90°且雙腳併攏；保持腳接觸，將上側膝蓋打開後慢慢放回。</div><div class="squat-camera-wrap"><video id="hp06Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="hp06Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="hp06Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="hp06Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="hp06Total">0</span><span class="squat-rep-counter-sep">/ '+m.targetReps+'</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="hp06Dot"></span><span id="hp06ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="hp06Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成次數</span><b><span id="hp06StatTotal">0</span> / '+m.targetReps+'</b></div><div class="stat"><span class="small">左 / 右</span><b><span id="hp06Left">0</span> / <span id="hp06Right">0</span></b></div><div class="stat"><span class="small">品質分數</span><b id="hp06Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="hp06Ready">--</b></div><div class="small">膝蓋打開：<b id="hp06Open">--</b>　雙腳分離：<b id="hp06Feet">--</b></div><div class="small">骨盆／身體翻轉：<b id="hp06Roll">--</b></div><div class="small">即時提醒：<b id="hp06Feedback">請側躺並保持肩、髖、膝與腳踝入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">位移與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="hp06Finish" onclick="finalizeHp06Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitHp06Detection()">放棄本次訓練</button>';}
function beginHp06Camera(){const v=document.getElementById("hp06Video"),c=document.getElementById("hp06Canvas");if(!v||!c)return;stopHp06Camera();hp06Ctx=c.getContext("2d");hp06Tracker=createClamshellSession({targetReps:hp06Meta.targetReps});hp06Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:HP06_THRESHOLDS.MIN_VISIBILITY},HP06_REQUIRED_LANDMARKS);hp06Cam=createSquatCameraController({videoEl:v,onStatus:s=>hp06Set("hp06Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleHp06Frame,onFatalError:m=>hp06Set("hp06Status",m)});hp06Cam.start();}
function drawHp06(l){const c=document.getElementById("hp06Canvas"),v=document.getElementById("hp06Video");if(!c||!hp06Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}hp06Ctx.clearRect(0,0,c.width,c.height);if(!l)return;hp06Ctx.strokeStyle="#7ea866";hp06Ctx.fillStyle="#5f8d49";hp06Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;hp06Ctx.beginPath();hp06Ctx.moveTo(a.x*c.width,a.y*c.height);hp06Ctx.lineTo(b.x*c.width,b.y*c.height);hp06Ctx.stroke()});l.forEach(p=>{if(!p)return;hp06Ctx.beginPath();hp06Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);hp06Ctx.fill()});}
function handleHp06Frame(l,time){if(state.route!=="hp06Detection"||!hp06Stable||!hp06Tracker||hp06Done)return;drawHp06(l);const d=hp06Stable.update(l,time),m=computeClamshellMetrics(l,HP06_THRESHOLDS),ready=!!l&&HP06_REQUIRED_LANDMARKS.every(i=>l[i]&&(l[i].visibility==null||l[i].visibility>=HP06_THRESHOLDS.MIN_VISIBILITY)),r=hp06Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,dot=document.getElementById("hp06Dot");if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");hp06Set("hp06ReadyText",ready?"已偵測到身體，可以開始蚌殼式":"請保持肩、髖、膝與腳踝入鏡");hp06Set("hp06Ready",d.displayState);hp06Set("hp06Total",s.totalReps);hp06Set("hp06StatTotal",s.totalReps);hp06Set("hp06Left",s.leftReps);hp06Set("hp06Right",s.rightReps);hp06Set("hp06Open",r.openRatio==null?"--":(Math.max(0,r.openRatio)*100).toFixed(1)+"%");hp06Set("hp06Feet",m.feetSeparationRatio==null?"--":(m.feetSeparationRatio*100).toFixed(1)+"%");hp06Set("hp06Roll",m.bodyRollDeg==null?"--":Math.round(m.bodyRollDeg)+"°");hp06Set("hp06Score",s.totalReps?calculateClamshellScore(s).score:"--");const ring=document.getElementById("hp06Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(s.totalReps,s.targetReps)));if(r.repCompleted){const issue=r.completedRep.issues[0],counter=document.getElementById("hp06Counter");hp06Set("hp06Feedback",issue?HP06_ISSUE_LABELS[issue]:"很好，膝蓋開合且骨盆穩定");if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}else if(!ready)hp06Set("hp06Feedback","請保持肩、髖、膝與腳踝完整入鏡");else if(m.feetSeparationRatio>HP06_THRESHOLDS.FEET_SEPARATION_MAX_RATIO)hp06Set("hp06Feedback","雙腳保持接觸，只打開上側膝蓋");else if(m.bodyRollDeg>HP06_THRESHOLDS.BODY_ROLL_MAX_DEG)hp06Set("hp06Feedback","固定骨盆，避免身體向後翻");else hp06Set("hp06Feedback","雙腳併攏，緩慢打開上側膝蓋");if(s.completed){hp06Done=true;stopHp06Camera();hp06Set("hp06Status","訓練次數已完成！請儲存結果");hp06Set("hp06Finish","儲存並查看結果");document.getElementById("hp06Counter")?.classList.add("complete");}}
function stopHp06Camera(){hp06Cam?.stop();hp06Cam=null;hp06Ctx=null;hp06Stable=null;}function persistHp06(){if(!hp06Meta||!hp06Tracker)return false;const m=hp06Meta,s=hp06Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateClamshellScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:HP06_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score:q.score,overallScore:q.score,quality:q.quality,remark:buildClamshellRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}function finalizeHp06Training(){if(!hp06Tracker?.getSummary().totalReps)return alert("尚未偵測到完整動作，請至少完成一次後再儲存。");stopHp06Camera();const m=hp06Meta;if(persistHp06()){hp06Tracker=null;hp06Meta=null;navigateAfterSquat(m);}}function exitHp06Detection(){stopHp06Camera();const m=hp06Meta;hp06Tracker=null;hp06Meta=null;navigateAfterSquat(m);}
const renderBeforeHp06=render;render=function(){if(state.route==="hp06Detection"){app.innerHTML=phone(hp06DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeHp06();};const cameraBeforeHp06=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.HP06_CLAMSHELL?goHp06Detection():cameraBeforeHp06();};window.openCameraPlaceholder=openCameraPlaceholder;window.goHp06Detection=goHp06Detection;window.exitHp06Detection=exitHp06Detection;window.finalizeHp06Training=finalizeHp06Training;
const resultBeforeHp06=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===HP06_ANALYSIS_MODE?renderLe04AnalysisResult(record):resultBeforeHp06(record,ex);};const historyBeforeHp06=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeHp06(record);if(record.analysisMode===HP06_ANALYSIS_MODE)e.summaryLabel=(record.totalReps||0)+" / "+(record.targetReps||0)+" 次｜品質 "+(record.score??record.overallScore??"—")+" 分";return e;};const genericBeforeHp06=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===HP06_ANALYSIS_MODE?renderLe04RecordDetail(record):genericBeforeHp06(record,entry);};

// LE02 implementation follows.
let le02Meta,le02Cam,le02Ctx,le02Stable,le02Tracker,le02Done=false;function le02Set(id,v){const e=document.getElementById(id);if(e)e.textContent=v;}
function goLe02Detection(){const c=getExercisePageContext();if(!c)return;const x=c.ex,rel=c.mode==="self_practice"?relationService.findAcceptedByPatientId(state.user.id)[0]:null;le02Meta={mode:c.mode,navigationOrigin:state.navigationOrigin,scheduleId:c.mode==="assigned"?c.schedule.id:null,exerciseIndex:c.mode==="assigned"?state.selectedExerciseIndex:null,exerciseId:x.exerciseId,exerciseName:x.exerciseName,patientId:state.user.id,therapistId:c.mode==="assigned"?c.schedule.therapistId:rel?.therapistId,targetReps:calculateSquatTargetReps(x),rewardXp:x.rewardXp||DEFAULT_LE02_REWARD_XP};le02Done=false;state.route="le02Detection";render();beginLe02Camera();}
function le02DetectionPage(){const m=le02Meta||{exerciseName:"抬腿",targetReps:10};return '<div class="header"><button class="btn btn-light detail-back-btn" onclick="exitLe02Detection()">返回</button><b>AI 抬腿偵測</b><img class="icon" src="/images/ai_robot.png" alt="AI"></div><h2>'+m.exerciseName+'</h2><div class="small" style="margin-bottom:10px">仰躺並收緊核心，膝蓋保持伸直；將單腿緩慢抬至約 45°，再控制放回床面。</div><div class="squat-camera-wrap"><video id="le02Video" class="squat-camera-video" playsinline muted autoplay></video><canvas id="le02Canvas" class="squat-overlay-canvas"></canvas><div class="squat-rep-counter" id="le02Counter"><svg class="squat-rep-ring" viewBox="0 0 72 72"><circle class="squat-rep-ring-bg" cx="36" cy="36" r="30"></circle><circle class="squat-rep-ring-progress" id="le02Ring" cx="36" cy="36" r="30"></circle></svg><div class="squat-rep-counter-text"><span id="le02Total">0</span><span class="squat-rep-counter-sep">/ '+m.targetReps+'</span></div></div><div class="squat-readiness-indicator"><span class="squat-readiness-dot" id="le02Dot"></span><span id="le02ReadyText">尚未偵測</span></div><div class="squat-status-overlay" id="le02Status">正在請求攝影機權限…</div></div><div class="stats" style="margin-top:12px"><div class="stat"><span class="small">完成次數</span><b><span id="le02StatTotal">0</span> / '+m.targetReps+'</b></div><div class="stat"><span class="small">左 / 右</span><b><span id="le02Left">0</span> / <span id="le02Right">0</span></b></div><div class="stat"><span class="small">品質分數</span><b id="le02Score">--</b></div></div><div class="card" style="display:grid;gap:8px;margin-top:12px"><div class="small">追蹤狀態：<b id="le02Ready">--</b></div><div class="small">左髖：<b id="le02LeftHip">--</b>　右髖：<b id="le02RightHip">--</b></div><div class="small">左膝：<b id="le02LeftKnee">--</b>　右膝：<b id="le02RightKnee">--</b></div><div class="small">即時提醒：<b id="le02Feedback">請仰躺並讓全身完整入鏡</b></div></div><div class="small" style="margin:10px 0;color:#888">角度與分數為 prototype 工程判定，不代表醫療診斷。</div><button class="btn btn-primary full" id="le02Finish" onclick="finalizeLe02Training()">結束並儲存結果</button><button class="btn btn-light full" onclick="exitLe02Detection()">放棄本次訓練</button>';}
function beginLe02Camera(){const v=document.getElementById("le02Video"),c=document.getElementById("le02Canvas");if(!v||!c)return;stopLe02Camera();le02Ctx=c.getContext("2d");le02Tracker=createStraightLegRaiseSession({targetReps:le02Meta.targetReps});le02Stable=createDetectionStabilityTracker({...SQUAT_THRESHOLDS,MIN_VISIBILITY:LE02_THRESHOLDS.MIN_VISIBILITY},LE02_REQUIRED_LANDMARKS);le02Cam=createSquatCameraController({videoEl:v,onStatus:s=>le02Set("le02Status",s==="requesting-permission"?"正在請求攝影機權限…":s==="loading-model"?"AI 模型載入中，請稍候…":""),onFrame:handleLe02Frame,onFatalError:m=>le02Set("le02Status",m)});le02Cam.start();}
function drawLe02(l){const c=document.getElementById("le02Canvas"),v=document.getElementById("le02Video");if(!c||!le02Ctx)return;if(v.videoWidth&&(c.width!==v.videoWidth||c.height!==v.videoHeight)){c.width=v.videoWidth;c.height=v.videoHeight}le02Ctx.clearRect(0,0,c.width,c.height);if(!l)return;le02Ctx.strokeStyle="#7ea866";le02Ctx.fillStyle="#5f8d49";le02Ctx.lineWidth=Math.max(2,c.width*.004);POSE_CONNECTIONS.forEach(({start,end})=>{const a=l[start],b=l[end];if(!a||!b)return;le02Ctx.beginPath();le02Ctx.moveTo(a.x*c.width,a.y*c.height);le02Ctx.lineTo(b.x*c.width,b.y*c.height);le02Ctx.stroke()});l.forEach(p=>{if(!p)return;le02Ctx.beginPath();le02Ctx.arc(p.x*c.width,p.y*c.height,Math.max(2,c.width*.006),0,Math.PI*2);le02Ctx.fill()});}
function handleLe02Frame(l,time){if(state.route!=="le02Detection"||!le02Stable||!le02Tracker||le02Done)return;drawLe02(l);const d=le02Stable.update(l,time),m=computeSideLegRaiseMetrics(l,LE02_THRESHOLDS),ready=!!l&&LE02_REQUIRED_LANDMARKS.every(i=>l[i]&&(l[i].visibility==null||l[i].visibility>=LE02_THRESHOLDS.MIN_VISIBILITY)),r=le02Tracker.processFrame({timestamp:time,...m,bodyReady:ready}),s=r.summary,dot=document.getElementById("le02Dot");if(dot)dot.className="squat-readiness-dot "+(d.displayState===DETECTION_DISPLAY_STATE.READY?"ready":"partial");le02Set("le02ReadyText",ready?"已偵測到全身，可以開始抬腿":"請保持肩、髖、膝與腳踝入鏡");le02Set("le02Ready",d.displayState);le02Set("le02Total",s.totalReps);le02Set("le02StatTotal",s.totalReps);le02Set("le02Left",s.leftReps);le02Set("le02Right",s.rightReps);le02Set("le02LeftHip",m.leftHipAngle==null?"--":Math.round(m.leftHipAngle)+"°");le02Set("le02RightHip",m.rightHipAngle==null?"--":Math.round(m.rightHipAngle)+"°");le02Set("le02LeftKnee",m.leftKneeAngle==null?"--":Math.round(m.leftKneeAngle)+"°");le02Set("le02RightKnee",m.rightKneeAngle==null?"--":Math.round(m.rightKneeAngle)+"°");le02Set("le02Score",s.totalReps?calculateStraightLegRaiseScore(s).score:"--");const ring=document.getElementById("le02Ring");if(ring)ring.style.strokeDashoffset=String(188.5*(1-calculateProgressRatio(s.totalReps,s.targetReps)));if(r.completedReps.length){const rep=r.completedReps.at(-1),issue=rep.issues[0],counter=document.getElementById("le02Counter");le02Set("le02Feedback",issue?LE02_ISSUE_LABELS[issue]:(rep.side==="left"?"左":"右")+"腿抬起與下降控制良好");if(counter){counter.classList.remove("pulse");void counter.offsetWidth;counter.classList.add("pulse")}}else if(!ready)le02Set("le02Feedback","請讓肩、髖、膝與腳踝完整入鏡");else if(Math.min(m.leftKneeAngle||180,m.rightKneeAngle||180)<LE02_THRESHOLDS.KNEE_EXTENSION_MIN_DEG)le02Set("le02Feedback","膝蓋保持伸直，不要彎曲");else if((m.bodyRollDeg||0)>LE02_THRESHOLDS.BODY_ROLL_MAX_DEG)le02Set("le02Feedback","收緊核心並固定骨盆");else le02Set("le02Feedback","直腿緩慢抬至約 45°，再控制放下");if(s.completed){le02Done=true;stopLe02Camera();le02Set("le02Status","訓練次數已完成！請儲存結果");le02Set("le02Finish","儲存並查看結果");document.getElementById("le02Counter")?.classList.add("complete");}}
function stopLe02Camera(){le02Cam?.stop();le02Cam=null;le02Ctx=null;le02Stable=null;}function persistLe02(){if(!le02Meta||!le02Tracker)return false;const m=le02Meta,s=le02Tracker.getSummary(),assigned=m.mode==="assigned",schedule=assigned?scheduleService.getById(m.scheduleId):null,q=calculateStraightLegRaiseScore(s),now=nowIso(),record=analysisService.create({id:generateId("analysis"),patientId:m.patientId,therapistId:m.therapistId,scheduleId:schedule?.id||null,exerciseId:m.exerciseId,exerciseName:m.exerciseName,completedAt:now,capturedAt:now,createdAt:now,analysisMode:LE02_ANALYSIS_MODE,source:assigned?ANALYSIS_RECORD_SOURCES.ASSIGNED:ANALYSIS_RECORD_SOURCES.SELF_PRACTICE,totalReps:s.totalReps,targetReps:s.targetReps,validReps:s.validReps,score:q.score,overallScore:q.score,quality:q.quality,remark:buildStraightLegRaiseRemark(s),repRecords:s.repRecords,summary:{...s,repRecords:undefined}});if(schedule)scheduleService.updateExerciseAt(schedule.id,m.exerciseIndex,{status:"completed",completedAt:now,analysisRecordId:record.id});gameService.addXp(m.patientId,m.rewardXp);return true;}function finalizeLe02Training(){if(!le02Tracker?.getSummary().totalReps)return alert("尚未偵測到完整動作，請至少完成一次後再儲存。");stopLe02Camera();const m=le02Meta;if(persistLe02()){le02Tracker=null;le02Meta=null;navigateAfterSquat(m);}}function exitLe02Detection(){stopLe02Camera();const m=le02Meta;le02Tracker=null;le02Meta=null;navigateAfterSquat(m);}
const renderBeforeLe02=render;render=function(){if(state.route==="le02Detection"){app.innerHTML=phone(le02DetectionPage(),true);attachImageFallbacks(app)}else renderBeforeLe02();};const cameraBeforeLe02=openCameraPlaceholder;openCameraPlaceholder=function(){const c=getExercisePageContext(),a=c&&(resolvePoseAnalyzer(c.catalog)||resolvePoseAnalyzer(c.ex));return a===POSE_ANALYZER.LE02_STRAIGHT_LEG_RAISE?goLe02Detection():cameraBeforeLe02();};window.openCameraPlaceholder=openCameraPlaceholder;window.goLe02Detection=goLe02Detection;window.exitLe02Detection=exitLe02Detection;window.finalizeLe02Training=finalizeLe02Training;
const resultBeforeLe02=renderAnalysisResultSection;renderAnalysisResultSection=function(record,ex){return record.analysisMode===LE02_ANALYSIS_MODE?renderLe04AnalysisResult(record):resultBeforeLe02(record,ex);};const historyBeforeLe02=buildTrainingHistoryEntry;buildTrainingHistoryEntry=function(record){const e=historyBeforeLe02(record);if(record.analysisMode===LE02_ANALYSIS_MODE)e.summaryLabel=(record.totalReps||0)+" / "+(record.targetReps||0)+" 次｜品質 "+(record.score??record.overallScore??"—")+" 分";return e;};const genericBeforeLe02=renderGenericRecordDetail;renderGenericRecordDetail=function(record,entry){return record.analysisMode===LE02_ANALYSIS_MODE?renderLe04RecordDetail(record):genericBeforeLe02(record,entry);};

// 共用儲存導頁保護：結果已成功寫入時，即使 XP／成就等後續步驟發生例外，
// 仍會釋放偵測頁並回到動作詳情，避免使用者看到畫面卡住。
function installTrainingFinalizeNavigationGuard(finalizeName, exitName, getMeta) {
  const original = window[finalizeName];
  if (typeof original !== "function") return;
  window[finalizeName] = function guardedTrainingFinalize(...args) {
    const meta = getMeta();
    const beforeCount = meta?.patientId
      ? analysisService.getByPatientId(meta.patientId).filter((r) => r.exerciseId === meta.exerciseId).length
      : 0;
    let caughtError = null;
    let returnValue;
    try {
      returnValue = original.apply(this, args);
    } catch (error) {
      caughtError = error;
      console.error(`${finalizeName} completed with a post-save error`, error);
    }
    const afterCount = meta?.patientId
      ? analysisService.getByPatientId(meta.patientId).filter((r) => r.exerciseId === meta.exerciseId).length
      : beforeCount;
    const resultWasSaved = afterCount > beforeCount;
    const stillOnDetectionPage = /Detection$/.test(state.route || "");
    if (resultWasSaved && (stillOnDetectionPage || caughtError)) {
      const exit = window[exitName];
      if (stillOnDetectionPage && typeof exit === "function") exit();
      else navigateAfterSquat(meta);
      return returnValue;
    }
    if (caughtError) throw caughtError;
    return returnValue;
  };
}

[
  ["finalizeCr05Training","exitCr05Detection",()=>cr05SessionMeta],
  ["finalizeKn03Training","exitKn03Detection",()=>kn03SessionMeta],
  ["finalizeLe05Training","exitLe05Detection",()=>le05SessionMeta],
  ["finalizeLe03Training","exitLe03Detection",()=>le03SessionMeta],
  ["finalizeLe04Training","exitLe04Detection",()=>le04Meta],
  ["finalizeLe06Training","exitLe06Detection",()=>le06Meta],
  ["finalizeLe07Training","exitLe07Detection",()=>le07Meta],
  ["finalizeSh01Training","exitSh01Detection",()=>sh01Meta],
  ["finalizeSh02Training","exitSh02Detection",()=>sh02Meta],
  ["finalizeSh03Training","exitSh03Detection",()=>sh03Meta],
  ["finalizeHp04Training","exitHp04Detection",()=>hp04Meta],
  ["finalizeHp05Training","exitHp05Detection",()=>hp05Meta],
  ["finalizeHp06Training","exitHp06Detection",()=>hp06Meta],
  ["finalizeLe02Training","exitLe02Detection",()=>le02Meta],
].forEach(([finalizeName,exitName,getMeta])=>installTrainingFinalizeNavigationGuard(finalizeName,exitName,getMeta));
