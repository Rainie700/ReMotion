import { FA5X_CONDITION_ANSWER, FA5X_SAME_CHAIR_ANSWER } from "./fa5xConditionReport.js";
import { checkFa5xMeasurementCompatibility } from "./fa5xMeasurementCompatibility.js";

/**
 * 五次坐站前後比較 — do the two tests' REPORTED conditions match? (pure)
 * docs/F01_G01_DECISION_BASIS_V1.md item 1.
 *
 * The reference MDC (Yin 2023) was measured with arms crossed, on the same chair, by one
 * assessor. This only checks what the App holds: ownership, a completed test, the
 * measurement version, and each test's own latest condition report (hands used, physical
 * assistance, and — reassessment only — the same chair as the baseline).
 *
 *   reported_conditions_consistent    both reports say no hands, no assistance, and the
 *                                     reassessment explicitly says the same chair
 *   reported_conditions_differ        an explicit report breaks that (hands / assistance
 *                                     "yes", or "not the same chair")
 *   reported_conditions_insufficient  nothing explicit breaks it, but something is missing,
 *                                     unknown, invalid, not owned or not comparable
 *
 * "Consistent" is the user's own report, matched — it does NOT verify the camera's
 * measurement error or that the study population applies. Missing ("missing"), answered
 * 不確定 ("unknown") and an explicit answer are kept apart in every reason.
 */
export const FA5X_COMPARISON_CONDITIONS_VERSION = "fa5x-comparison-conditions-1";

export const COMPARISON_CONDITION_STATUS = Object.freeze({
  CONSISTENT: "reported_conditions_consistent",
  DIFFER: "reported_conditions_differ",
  INSUFFICIENT: "reported_conditions_insufficient",
});

const ANSWERS = Object.values(FA5X_CONDITION_ANSWER);
const CHAIR_ANSWERS = Object.values(FA5X_SAME_CHAIR_ANSWER);
const stateOf = (report, key, allowed) => {
  if (!report || !(key in report) || report[key] === null || report[key] === undefined) return "missing";
  return allowed.includes(report[key]) ? report[key] : "invalid";
};

function testSnapshot(session, role, patientId) {
  const reports = session && Array.isArray(session.conditionReports) ? session.conditionReports : [];
  const report = reports.length ? reports[reports.length - 1] : null;
  const problems = [];
  if (!session) problems.push("session_missing");
  else {
    if (!patientId || session.patientId !== patientId) problems.push("session_not_owned");
    if (session.status !== "completed") problems.push("session_not_completed");
    if (!report) problems.push("no_condition_report");
    else if (report.reportedBy !== patientId) problems.push("reporter_not_owner");
  }
  const usable = !!report && !problems.includes("reporter_not_owner") && !problems.includes("session_not_owned");
  const r = usable ? report : null;
  return {
    role,
    sessionId: session ? session.id : null,
    problems,
    reportCount: reports.length,
    reportIndex: r ? reports.length - 1 : null,
    reportSchemaVersion: r && typeof r.schemaVersion === "string" ? r.schemaVersion : null,
    reportedAt: r && typeof r.reportedAt === "string" ? r.reportedAt : null,
    armsUsed: stateOf(r, "armsUsed", ANSWERS),
    physicalAssistance: stateOf(r, "physicalAssistance", ANSWERS),
    ...(role === "reassessment" ? { sameChairAsBaseline: stateOf(r, "sameChairAsBaseline", CHAIR_ANSWERS) } : {}),
    measurement: session && session.result ? { algorithmVersion: session.result.algorithmVersion || null, geometryCoordinateSpace: session.result.geometryCoordinateSpace || null } : null,
  };
}

/**
 * @param {{ patientId, baseline, reassessment }} input  the two stored 5xSTS sessions of one cycle
 * @returns {{ version, status, reasons: Array<{ code, kind: "differ"|"insufficient", test?, field?, state? }>, baseline, reassessment, measurementCompatible }}
 */
export function checkFa5xComparisonConditions({ patientId, baseline, reassessment }) {
  const b = testSnapshot(baseline, "baseline", patientId);
  const r = testSnapshot(reassessment, "reassessment", patientId);
  const reasons = [];
  for (const t of [b, r]) {
    for (const p of t.problems) reasons.push({ code: p, kind: "insufficient", test: t.role });
    for (const field of ["armsUsed", "physicalAssistance"]) {
      const state = t[field];
      if (state === "yes") reasons.push({ code: field === "armsUsed" ? "arms_used" : "assistance_given", kind: "differ", test: t.role, field, state });
      else if (state !== "no" && !(state === "missing" && t.problems.includes("no_condition_report"))) {
        reasons.push({ code: `${field === "armsUsed" ? "arms" : "assistance"}_${state}`, kind: "insufficient", test: t.role, field, state });
      }
    }
  }
  // Same chair: only an explicit "yes" on the reassessment confirms it.
  const chair = r.sameChairAsBaseline;
  if (chair === "no") reasons.push({ code: "different_chair", kind: "differ", test: "reassessment", field: "sameChairAsBaseline", state: chair });
  else if (chair !== "yes" && !(chair === "missing" && r.problems.includes("no_condition_report"))) {
    reasons.push({ code: chair === "not_applicable" ? "same_chair_not_asked" : `same_chair_${chair}`, kind: "insufficient", test: "reassessment", field: "sameChairAsBaseline", state: chair });
  }
  const compatibility = baseline && reassessment && baseline.result && reassessment.result
    ? checkFa5xMeasurementCompatibility(baseline.result, reassessment.result)
    : { compatible: false, reason: "measurement_missing" };
  if (!compatibility.compatible) reasons.push({ code: "measurement_not_comparable", kind: "insufficient", state: compatibility.reason || null });

  const status = reasons.some((x) => x.kind === "differ") ? COMPARISON_CONDITION_STATUS.DIFFER
    : reasons.length ? COMPARISON_CONDITION_STATUS.INSUFFICIENT
      : COMPARISON_CONDITION_STATUS.CONSISTENT;
  return { version: FA5X_COMPARISON_CONDITIONS_VERSION, status, reasons, baseline: b, reassessment: r, measurementCompatible: !!compatibility.compatible };
}

const TEST_LABEL = { baseline: "初次評估", reassessment: "再次評估" };
const REASON_TEXT = Object.freeze({
  arms_used: "回報起身時有用手撐",
  assistance_given: "回報測試時有人協助",
  different_chair: "回報與初次評估不是同一張椅子",
  arms_unknown: "是否用手撐回報為不確定",
  arms_missing: "沒有回報是否用手撐",
  arms_invalid: "是否用手撐的回報無法辨識",
  assistance_unknown: "是否有人協助回報為不確定",
  assistance_missing: "沒有回報是否有人協助",
  assistance_invalid: "是否有人協助的回報無法辨識",
  same_chair_unknown: "是否同一張椅子回報為不確定",
  same_chair_missing: "沒有回報是否同一張椅子",
  same_chair_not_asked: "沒有回報是否同一張椅子",
  same_chair_invalid: "是否同一張椅子的回報無法辨識",
  no_condition_report: "沒有測試條件回報",
  reporter_not_owner: "測試條件不是由受測者本人帳號回報",
  session_missing: "找不到評估紀錄",
  session_not_owned: "評估紀錄不屬於目前帳號",
  session_not_completed: "評估未完成",
  measurement_not_comparable: "兩次量測方式不同或缺少量測版本",
});

/** Plain lines for one result (display only; never a clinical statement). */
export function describeComparisonConditionReasons(result) {
  return ((result && result.reasons) || []).map((x) => `${x.test ? `${TEST_LABEL[x.test]}：` : ""}${REASON_TEXT[x.code] || x.code}`);
}

export const COMPARISON_CONDITION_STATUS_TEXT = Object.freeze({
  [COMPARISON_CONDITION_STATUS.CONSISTENT]: "前後回報的測試條件一致（使用者回報；未驗證相機量測誤差與研究族群是否適用）",
  [COMPARISON_CONDITION_STATUS.DIFFER]: "前後測試條件不同",
  [COMPARISON_CONDITION_STATUS.INSUFFICIENT]: "測試條件資料不足",
});
