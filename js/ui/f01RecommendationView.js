/**
 * F01 訓練建議頁 — what the page may truthfully say, derived only from data
 * the recommendation actually used. Pure: no storage, no clock.
 *
 * What took part in an ordinary (Phase C) recommendation
 * (js/data/f01GoalRecommendation.js):
 *   R00 the 5xSTS was completed (validity gate — the seconds are NOT read, R11)
 *   R02 the chosen goal (direct before supporting)      R03 ticked limitations
 *   R06 available time (number of items only)           R07 AI support first
 *   R08 alternate the exercises' primary goals          tie-break: exercise id
 * Not used: training history, difficulty / ability (R05), equipment (R04),
 * progression. A next-stage (D5) recommendation additionally used the last
 * cycle's before / after assessment and its training-completion days.
 */
import { orderF01GoalCandidates, MATCH_LEVEL, FIVE_TIMES_SIT_TO_STAND_TYPE } from "../data/f01GoalRecommendation.js";
import { F01_GOALS, F01_EXERCISE_SPEC } from "../data/f01RecommendationSpec.js";
import { getGoalEvidence, evidenceStatus, EVIDENCE_READ_LEVEL_LABEL, PROFESSIONAL_REVIEW_LABEL } from "../data/f01GoalEvidence.js";
import { checkFirstRecommendationIntegrity } from "../data/f01InitialReview.js";
import { G01_REASON_CATEGORY, G01_SCREEN_REASON } from "../data/f01G01ConditionScreen.js";

/** Goals whose first-recommendation page shows the evidence trail (js/data/f01GoalEvidence.js). */
export const F01_EVIDENCE_TRAIL_GOALS = Object.freeze(["G01"]);
export const hasF01EvidenceTrail = (rec) => !!rec && !rec.origin && F01_EVIDENCE_TRAIL_GOALS.includes(rec.selectedGoalId);

/** 「選取方式」 — only what the Phase C engine actually does (R02 / R03 / R06 / R11). */
export const F01_SELECTION_METHOD_NOTE = "系統依你選的目標，從目標與動作的對應表取出候選動作（主要候選優先，輔助候選次之），再依可用時間決定數量、依你勾選的情況排除動作。評估秒數只用來確認這次評估有效，沒有參與動作排序、難度或訓練量的決定。";
export const F01_MAPPING_STATUS_NOTE = "目標與動作的對應是 ReMotion 的系統設定，尚待專業人員驗證。";

/**
 * The evidence trail of one recommended item for the card's expanded area, or null
 * (no record for this goal / exercise). Read level and professional review are
 * reported separately — a found study never reads as "confirmed".
 */
export function describeF01ItemEvidence(item) {
  const entry = item ? getGoalEvidence(item.selectedGoalId, item.exerciseId) : null;
  if (!entry) return null;
  const status = evidenceStatus(entry);
  return {
    shortReason: entry.shortReason,
    relationLabel: entry.relation === "direct" ? "系統設定的主要候選" : "系統設定的輔助候選",
    systemRationale: entry.systemRationale,
    statusLines: [
      `對應狀態：系統規則，待專業驗證（${entry.mappingStatus}）`,
      `相關研究：${status.studyFound ? `已找到 ${entry.studies.length} 篇` : "尚未找到"}`,
      `閱讀程度：${entry.studies.map((s) => EVIDENCE_READ_LEVEL_LABEL[s.readLevel]).join("；") || "—"}`,
      `專業確認：${PROFESSIONAL_REVIEW_LABEL[entry.professionalReview]}`,
    ],
    studies: entry.studies.map((s) => ({
      citation: `${s.authors}（${s.year}）${s.journal}`,
      title: s.title,
      url: s.url,
      pmid: s.pmid,
      population: s.population,
      intervention: s.intervention,
      mainResults: s.mainResults,
      supports: s.supports,
      cannotInfer: s.cannotInfer,
    })),
  };
}

export const F01_NOT_USED_IN_RANKING = Object.freeze(["過去的訓練紀錄", "動作難度分級", "器材條件"]);

const pad = (n) => String(n).padStart(2, "0");
/** Local "YYYY.MM.DD" of an ISO time, or null. */
function localDate(iso) {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}` : null;
}
const seconds = (ms) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(1)} 秒` : null);

/** A stored 5xSTS session as recommendation evidence, checked against the patient. */
export function describeFa5xEvidence(session, patientId) {
  if (!session) return { valid: false, problem: "missing" };
  if (session.patientId !== patientId) return { valid: false, problem: "not_owned" };
  // A session without assessmentType predates 5xSTS and is a shoulder assessment (resolveAssessmentType).
  if ((session.assessmentType || "shoulder") !== FIVE_TIMES_SIT_TO_STAND_TYPE) return { valid: false, problem: "not_5xsts" };
  const result = session.result || {};
  const completed = session.status === "completed" && (result.status ? result.status === "completed" : result.repCount >= 5 && Number.isFinite(result.totalDurationMs));
  if (!completed || !Number.isFinite(result.totalDurationMs)) return { valid: false, problem: "not_completed" };
  return {
    valid: true,
    sessionId: session.id,
    label: "五次坐站（F01 下肢功能）",
    durationText: seconds(result.totalDurationMs),
    resultText: `完成 5 次，用時 ${seconds(result.totalDurationMs)}`,
    dateText: localDate(result.measuredAt || session.completedAt),
  };
}

/**
 * Evidence of a next-stage (D5) plan: the last cycle's before / after 5xSTS
 * and its training-completion days, exactly as stored on the proposal.
 */
export function describeD5Evidence(rec, patientId, getSession) {
  const d5 = rec && rec.d5;
  if (!d5) return { valid: false, problem: "missing" };
  const before = describeFa5xEvidence(getSession(d5.baselineAssessmentId), patientId);
  const after = describeFa5xEvidence(getSession(d5.reassessmentId), patientId);
  if (!after.valid) return { valid: false, problem: after.problem };
  const days = Number.isInteger(d5.completedTrainingDays) && Number.isInteger(d5.plannedTrainingDays)
    ? `上一週完成訓練 ${d5.completedTrainingDays} / ${d5.plannedTrainingDays} 天`
    : null;
  return {
    valid: true,
    sessionId: after.sessionId,
    label: "上一週再次評估（五次坐站）",
    resultText: before.valid ? `${before.durationText} → ${after.durationText}` : after.resultText,
    dateText: after.dateText,
    extra: days,
  };
}

/**
 * Which recommendation the page shows: the one the user just opened if it is
 * theirs; otherwise the plan of their active F01 cycle; otherwise their latest
 * F01 plan. Never another account's record.
 */
export function pickF01RecommendationForPage({ patientId, requested = null, activeCycleRec = null, latest = null }) {
  // A next-stage (D5) proposal is a plan only once accepted; a draft is shown on its own proposal page.
  const own = (r) => r && r.kind === "f01_goal" && r.patientId === patientId && (!r.origin || r.status === "accepted") ? r : null;
  return own(requested) || own(activeCycleRec) || own(latest) || null;
}

/** The training amount the training page will use (same catalog fields as getExercisePageContext), or null. */
export function describeTrainingVolume(rawCatalog) {
  if (!rawCatalog) return null;
  const sets = Number(rawCatalog.defaultSets);
  const hasSets = Number.isFinite(sets) && sets > 0;
  if (rawCatalog.measurementType === "repetition" && Number(rawCatalog.defaultRepetitions) > 0) {
    return `${hasSets ? `${sets} 組 × ` : ""}每組 ${Number(rawCatalog.defaultRepetitions)} 下`;
  }
  if (rawCatalog.measurementType === "duration" && Number(rawCatalog.defaultDurationSeconds) > 0) {
    return `${hasSets ? `${sets} 組 × ` : ""}每組 ${Number(rawCatalog.defaultDurationSeconds)} 秒`;
  }
  return null;
}

/**
 * The exercise's own training focus from the exercise data: the FIRST sentence
 * of its training_goal only. The rest of that field quotes outside sources'
 * efficacy statements, which are never shown as a reason for this user.
 */
export function exerciseFocus(exerciseId) {
  const text = ((F01_EXERCISE_SPEC[exerciseId] || {}).trainingGoal || "").split("。")[0].trim();
  return text || null;
}

/**
 * Display text of a stored matched condition. The limitation filter only means
 * "no existing exclusion rule matched" — never "confirmed safe / suitable" —
 * so the stored R03 / NC-G04 wording is shown that way (stored data untouched).
 */
export function displayConditionText(condition) {
  if (condition && (condition.ruleId === "R03" || condition.ruleId === "NC-G04")) return "未命中現有的排除規則（注意事項沒有提到勾選的情況）";
  return condition ? condition.text : "";
}

/**
 * The amount the training page will use for a plan item, field by field: a
 * therapist-typed value where one was entered, otherwise the catalog default
 * (same merge as getExercisePageContext). A field the therapist left empty is
 * still "動作預設". Returns null when nothing is known.
 * @returns {{ parts: Array<{ field, value, source: "therapist"|"default" }>, byTherapist, allTherapist, text } | null}
 */
export function describePlanVolume(rawCatalog, dose) {
  const d = dose || {};
  const base = rawCatalog || {};
  const pick = (field, own, def) => (own ? { field, value: Number(own), source: "therapist" } : Number(def) > 0 ? { field, value: Number(def), source: "default" } : null);
  const sets = pick("sets", d.sets, base.defaultSets);
  const amount = base.measurementType === "repetition" ? pick("repetitions", d.repetitions, base.defaultRepetitions)
    : base.measurementType === "duration" ? pick("durationSeconds", d.durationSeconds, base.defaultDurationSeconds) : null;
  if (!amount) return null;
  const parts = [sets, amount].filter(Boolean);
  const piece = (x) => (x.field === "sets" ? `${x.value} 組` : `每組 ${x.value} ${x.field === "repetitions" ? "下" : "秒"}`);
  return {
    parts,
    byTherapist: parts.some((x) => x.source === "therapist"),
    allTherapist: parts.every((x) => x.source === "therapist"),
    text: parts.map(piece).join(" × "),
  };
}

const SOURCE_LABEL = { therapist: "復健師設定", default: "動作預設" };

/** One wording for every page: 「2 組 × 每組 10 下（動作預設）」 / 「…（復健師設定）」 / per field when mixed. */
export function formatPlanVolume(volume) {
  if (!volume) return null;
  if (!volume.byTherapist || volume.allTherapist) return `${volume.text}（${volume.byTherapist ? SOURCE_LABEL.therapist : SOURCE_LABEL.default}）`;
  return volume.parts.map((x) => `${x.field === "sets" ? `${x.value} 組` : `每組 ${x.value} ${x.field === "repetitions" ? "下" : "秒"}`}（${SOURCE_LABEL[x.source]}）`).join(" × ");
}

export const PLAN_VOLUME_SOURCE_NOTE = "標示「動作預設」的訓練量來自動作資料，未依個人狀況自動調整；標示「復健師設定」的是復健師檢視時填寫的數值。";

/** Data-backed reason lines for one recommended exercise (no claims beyond the rules that ran). */
export function explainF01Item(item, { limitationsApplied = false, isD5 = false } = {}) {
  const lines = [];
  if (!isD5) {
    if (item.matchLevel === MATCH_LEVEL.DIRECT) lines.push(`直接對應你選的目標「${item.selectedGoalLabel}」`);
    else if (item.matchLevel === MATCH_LEVEL.SUPPORTING) lines.push(`是「${item.selectedGoalLabel}」的輔助訓練`);
  }
  const focus = exerciseFocus(item.exerciseId);
  if (focus) lines.push(`動作資料的訓練重點：${focus}`);
  if (!isD5 && limitationsApplied) lines.push("未命中現有的排除規則：動作注意事項沒有提到你勾選的情況（不代表已確認安全或適合）");
  if (item.aiSupported) lines.push("支援 AI 動作辨識，練習時可即時計次與提醒");
  return lines;
}

/**
 * Exercises that met the same rules but were not picked (R06 cut the list by
 * time). Phase C only — a D5 plan was not built from this order.
 */
export function listF01OtherOptions(rec, catalog) {
  if (!rec || rec.origin) return [];
  const goal = F01_GOALS.find((g) => g.goalId === rec.selectedGoalId);
  if (!goal) return [];
  const picked = new Set((rec.items || []).map((it) => it.exerciseId));
  // G01 condition screen — what this recommendation left out is never offered back here.
  (rec.excluded || []).filter((e) => e.reasonCategory).forEach((e) => picked.add(e.exerciseId));
  return orderF01GoalCandidates({ goal, limitationIds: rec.limitationIds || [], catalog }).ordered
    .filter((c) => !picked.has(c.exercise.id))
    .map((c) => ({
      exerciseId: c.exercise.id,
      exerciseName: c.exercise.name,
      matchLevel: c.matchLevel,
      aiSupported: c.aiSupported,
      trainingGoal: exerciseFocus(c.exercise.id),
    }));
}

/** How the main list was sized — so a top-N list is never presented as a complete prescription. */
export function describeF01ListSize(rec) {
  if (rec && rec.origin) return "動作由你已接受的下一階段建議決定。";
  // G01 condition screen — fewer items than the time choice is never presented as a full-length session.
  if (rec && rec.conditionScreen && rec.shortfall) {
    return `${rec.availableMinutes ? `你選了 ${rec.availableMinutes} 分鐘，` : "未選擇可用時間；"}本版目前只提供 ${rec.items.length} 個動作，不是${rec.availableMinutes ? ` ${rec.availableMinutes} 分鐘的` : ""}完整課表或處方。`;
  }
  return rec && rec.availableMinutes
    ? `依你選的 ${rec.availableMinutes} 分鐘決定列出 ${rec.items.length} 個動作，不是完整課表或處方。`
    : `未選擇可用時間，依規則最多列出 3 個動作，不是完整課表或處方。`;
}

// ── Integrity pass: an ordinary first recommendation whose week did not start ──

/** Why a first recommendation's week did not start, and what the patient can do (never "started"). */
export const F01_CYCLE_START_ERROR_TEXT = Object.freeze({
  recommendation_not_synced: "這份訓練建議尚未同步到雲端，所以本週追蹤還沒開始。請確認網路後按「重新開始本週追蹤」。",
  cycle_sync_failed: "本週追蹤尚未同步到雲端，所以還沒開始。請確認網路後按「重新開始本週追蹤」。",
  recommendation_integrity_missing: "這份訓練建議缺少確認是否需要專業檢視的資料（可能建立於較早的版本），因此不會開始本週追蹤。請按「重新設定訓練需求」產生新的建議。",
});

/**
 * The 「本週追蹤尚未開始」 notice of an ordinary first recommendation without a running week, or null.
 * `lastError` = { recommendationId, code } of the last start attempt on this device.
 * @returns {{ code, text, action: "retry" | "reset" } | null}
 */
export function describeF01CycleStartNotice({ rec, isD5 = false, initialHold = false, activeCycle = null, cycleExists = false, lastError = null }) {
  if (isD5 || initialHold || !rec || rec.origin || activeCycle || cycleExists) return null;
  const integrity = checkFirstRecommendationIntegrity(rec);
  const code = !integrity.ok ? "recommendation_integrity_missing" : lastError && lastError.recommendationId === rec.id ? lastError.code : null;
  if (!code || !F01_CYCLE_START_ERROR_TEXT[code]) return null;
  return { code, text: F01_CYCLE_START_ERROR_TEXT[code], action: code === "recommendation_integrity_missing" ? "reset" : "retry" };
}

// ── G01 condition screen (docs/F01_G01_IMPLEMENTABLE_CONDITIONS.md) ──

/** Selection-method addition shown on a screened G01 recommendation only (older records were not screened). */
export const F01_G01_SCREEN_NOTE = "本版另依五次坐站的協助條件回報篩選坐姿起立，並暫不自動納入深蹲與橋式；這是本版的工程政策，不是臨床判斷。通過篩選只代表符合本版條件，不能據此判斷安全性、效果或訓練量是否合適。";

export const G01_REASON_CATEGORY_LABEL = Object.freeze({
  [G01_REASON_CATEGORY.NOT_INCLUDED]: "本版未納入",
  [G01_REASON_CATEGORY.NOT_SUPPORTED]: "目前未支援",
  [G01_REASON_CATEGORY.UNCONFIRMED]: "資料未確認",
});
const G01_POLICY_TEXT = Object.freeze({
  g01_squat_version_unmatched: "本版暫不自動納入。App 的深蹲是不扶物、蹲到約 90° 的版本，與目前核對的公開衛教版本（扶著椅背、蹲到自己舒適的程度）不同，目前核對的資料也不足以支持它對應這個目標。這是本版的工程政策，不是禁忌，也不代表這個動作無效。",
  g01_bridge_setting_unconfirmed: "本版暫不自動納入。目前核對的橋式衛教資料是在地面進行，維持時間與次數由治療人員依個人情況提供建議；App 目前無法確認你的練習表面，以及躺下、起身的情況。這是本版的工程政策，不是禁忌。",
});
const G01_FIELD_LABEL = Object.freeze({ armsUsed: "起身時是否用手撐", physicalAssistance: "測試時是否有人協助" });
const G01_REPORTED_LABEL = Object.freeze({ armsUsed: "有用手撐", physicalAssistance: "有人協助" });
const G01_STATE_LABEL = Object.freeze({ unknown: "回報為不確定", missing: "尚未回報", invalid: "回報內容無法辨識" });

/**
 * Reason lines of one excluded entry of a screened G01 recommendation, or null for any other entry.
 * @returns {Array<{ category, label, text }> | null}
 */
export function describeG01Exclusion(entry) {
  if (!entry || !entry.reasonCategory) return null;
  if (G01_POLICY_TEXT[entry.reason]) return [{ category: entry.reasonCategory, label: G01_REASON_CATEGORY_LABEL[entry.reasonCategory], text: G01_POLICY_TEXT[entry.reason] }];
  return (entry.screenReasons || []).map((r) => ({
    category: r.category,
    label: G01_REASON_CATEGORY_LABEL[r.category],
    text: r.code === G01_SCREEN_REASON.ASSISTANCE_NOT_COVERED
      ? `目前自動推薦未涵蓋這種協助方式：你回報測驗時${r.fields.map((f) => G01_REPORTED_LABEL[f.field]).join("、")}，而 App 的坐姿起立是以不用手、無人協助的方式示範與計次。這只是本版自動推薦的範圍限制，不是對你能否運動的判斷。`
      : `評估條件尚未確認：${r.fields.map((f) => `${G01_FIELD_LABEL[f.field]}（${G01_STATE_LABEL[f.state] || G01_STATE_LABEL.invalid}）`).join("、")}。系統不會把未回報或不確定當成「沒有」。`,
  }));
}

/**
 * The full reason page of a G01 result with no candidate (status no_candidates, never saved).
 * Backfilling the report is offered only when nothing was reported as "yes" and the assessment is the
 * patient's own: a reported assistance is never "unlocked" by changing the answer.
 * @returns {{ rows: Array<{ exerciseId, exerciseName, reasons }>, assistanceReported, canBackfill, sourceProblem } | null}
 */
export function describeG01NoCandidates(result) {
  const screen = result && result.conditionScreen;
  if (!screen || result.status !== "no_candidates") return null;
  const rows = (result.excluded || [])
    .map((e) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName, reasons: describeG01Exclusion(e) }))
    .filter((r) => r.reasons);
  const assistanceReported = (screen.reasonCodes || []).includes(G01_SCREEN_REASON.ASSISTANCE_NOT_COVERED);
  return {
    rows,
    assistanceReported,
    canBackfill: !assistanceReported && !screen.sourceProblem && (screen.reasonCodes || []).includes(G01_SCREEN_REASON.CONDITION_UNCONFIRMED),
    sourceProblem: screen.sourceProblem || null,
  };
}
