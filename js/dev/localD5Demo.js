/**
 * 本機隔離展示 — F01 再評估 → LLM 推薦草稿 → 復健師確認 → 患者接受 → 下一週.
 *
 * Dev server only, URL ?localDemo=d5 (storageService.isLocalDemoStorage()):
 * every record lives under the separate "remotion_localdemo_" storage prefix,
 * Firebase login is never attached (app.js), nothing is written to the cloud,
 * and patient00 / real accounts are never touched. Every screen used is the
 * app's real page; only the INPUTS below are demo data:
 *   - the two 5xSTS results (12.0 s → 8.5 s) stand in for camera measurements;
 *   - the 6 completed training days stand in for real training records;
 *   - the model answer comes from simulateD5ModelAnswer() — 展示用模擬回應，非真實 Gemini.
 */
import { createCollection, isLocalDemoStorage, clearLocalDemoStorage } from "../data/storageService.js";
import { functionalAssessmentService, FUNCTIONAL_ASSESSMENT_TYPES } from "../data/functionalAssessmentService.js";
import { recommendationService } from "../data/recommendationService.js";
import { trackingCycleService, REASSESSMENT_ROLE } from "../data/trackingCycleService.js";
import { assessmentService } from "../data/assessmentService.js";
import { exerciseService } from "../data/exerciseService.js";
import { generateF01GoalRecommendation } from "../data/f01GoalRecommendation.js";
import { toLocalDateKey, addDaysToDateKey } from "../data/trackingCycle.js";
import { FA5X_CURRENT_MEASUREMENT_FIELDS } from "../data/fa5xMeasurementCompatibility.js";
import { D5_LLM_OUTPUT_SCHEMA_VERSION } from "../data/d5LlmRecommendation.js";

export const DEMO_PATIENT = Object.freeze({ id: "localdemo-d5-patient", name: "示範患者（本機展示）", role: "patient", account: "demo-patient@localdemo", email: "demo-patient@localdemo", isLocalDemo: true });
export const DEMO_THERAPIST = Object.freeze({ id: "localdemo-d5-therapist", name: "示範復健師（本機展示）", role: "therapist", account: "demo-therapist@localdemo", email: "demo-therapist@localdemo", inviteCode: "DEMOD5", isLocalDemo: true });
export const DEMO_MODEL_LABEL = "展示用模擬回應，非真實 Gemini";

function assertDemo() {
  if (!isLocalDemoStorage()) throw new Error("local demo only (dev server + ?localDemo=d5)");
}

const atLocal = (dateKey, hh, mm = 0) => { const [y, m, d] = dateKey.split("-").map(Number); return new Date(y, m - 1, d, hh, mm).toISOString(); };

/** True when the demo case already exists in the demo storage. */
export function hasLocalD5Demo() {
  assertDemo();
  return trackingCycleService.listTrackingCycles(DEMO_PATIENT.id).length > 0;
}

/**
 * Builds the case through the real services, dated around the REAL today so the
 * same-day acceptance starts next week immediately: baseline Day 1 = today − 6,
 * training Days 1–6, reassessment today.
 */
export function seedLocalD5Demo() {
  assertDemo();
  const users = createCollection("users");
  for (const u of [DEMO_PATIENT, DEMO_THERAPIST]) if (!users.getById(u.id)) users.create({ ...u });
  createCollection("therapistPatientRelations").create({
    id: "localdemo-d5-relation", therapistId: DEMO_THERAPIST.id, patientId: DEMO_PATIENT.id, inviteCode: DEMO_THERAPIST.inviteCode,
    status: "accepted", createdAt: new Date().toISOString(), acceptedAt: new Date().toISOString(), completedAt: null, completedBy: null, revokedAt: null, revokedBy: null, endReason: null,
  });
  if (!assessmentService.getActiveByPatientId(DEMO_PATIENT.id)) {
    assessmentService.createAssessment({ patientId: DEMO_PATIENT.id, createdBy: DEMO_PATIENT.id, bodyParts: ["下肢功能"], goals: ["肌力"], abilityLevel: "beginner", preferredSessionMinutes: 15, source: "direct" });
  }
  const today = toLocalDateKey(new Date());
  const day1 = addDaysToDateKey(today, -6);
  const measure = (ms, measuredAt, role = null) => {
    const s = functionalAssessmentService.create({ patientId: DEMO_PATIENT.id, bodyRegion: "lower_limb", assessmentType: FUNCTIONAL_ASSESSMENT_TYPES.FIVE_TIMES_SIT_TO_STAND }).session;
    functionalAssessmentService.completeSession(s.id, { result: { status: "completed", repCount: 5, completedReps: 5, targetReps: 5, totalDurationMs: ms, rejectedAttempts: [], trackingLossCount: 0, measuredAt, demoData: true, ...FA5X_CURRENT_MEASUREMENT_FIELDS, ...(role || {}) } });
    return functionalAssessmentService.getById(s.id);
  };
  const baseline = measure(12000, atLocal(day1, 9));
  const phaseC = generateF01GoalRecommendation({
    assessment: { status: "completed", sessionId: baseline.id, assessmentType: "five_times_sit_to_stand" },
    selectedGoalId: "G05", limitationIds: [], availableMinutes: 15, catalog: exerciseService.listNormalized(),
  });
  const rec = recommendationService.createF01GoalRecommendation({ patientId: DEMO_PATIENT.id, result: phaseC, createdBy: DEMO_PATIENT.id }).recommendation;
  const cycle = trackingCycleService.createOrGetTrackingCycle({ userId: DEMO_PATIENT.id, baselineSession: baseline, recommendation: rec }).cycle;
  createCollection("trackingCycles").update(cycle.id, { completedTrainingDates: Array.from({ length: 6 }, (_, i) => addDaysToDateKey(day1, i)), demoData: true });
  const nowLocal = new Date();
  const reassessment = measure(8500, new Date(Math.min(nowLocal.getTime() - 60000, Date.parse(atLocal(today, 23, 0)))).toISOString(),
    { assessmentRole: REASSESSMENT_ROLE, trackingCycleId: cycle.id, baselineAssessmentId: baseline.id });
  const closed = trackingCycleService.completeTrackingCycleWithReassessment({ cycleId: cycle.id, userId: DEMO_PATIENT.id, reassessment, todayDateKey: today });
  return { cycleId: cycle.id, recommendationId: rec.id, closed: !closed.error, error: closed.error || null };
}

/** Wipes the demo storage only. */
export function resetLocalD5Demo() {
  assertDemo();
  return clearLocalDemoStorage();
}

/**
 * 展示用模擬回應，非真實 Gemini: a deterministic answer built from the payload the
 * real model would get — the first allowed progression option if progress is
 * allowed, otherwise 維持. It goes through the same validation as a real answer.
 */
export async function simulateD5ModelAnswer({ payload }) {
  const progression = payload.allowedDecisions.includes("progress") ? payload.options.find((o) => o.decisionImplied === "progress") : null;
  const facts = new Set(payload.facts.map((f) => f.id));
  const cite = (...ids) => ids.filter((id) => facts.has(id));
  return {
    schemaVersion: D5_LLM_OUTPUT_SCHEMA_VERSION,
    inputId: payload.inputId,
    candidateSetId: payload.candidateSetId,
    decision: progression ? "progress" : "maintain",
    changes: progression ? [{ optionId: progression.optionId, fromExerciseId: progression.fromExerciseId, toExerciseId: progression.toExerciseId }] : [],
    reasons: progression
      ? [
        { text: `完成 ${payload.input.training.completedTrainingDays} / ${payload.input.training.plannedTrainingDays} 個計畫訓練日，前後完成時間少 ${Math.abs(payload.input.timeChange.changeSeconds)} 秒。`, factIds: cite("training_completion", "time_change") },
        { text: `沿規格中已確認的轉換，將${progression.fromName}換成${progression.toName}，其餘動作保留。`, factIds: cite(`option:${progression.optionId}`) },
      ]
      : [{ text: "依目前允許的判定維持原本的動作。", factIds: cite("training_completion") }],
  };
}
