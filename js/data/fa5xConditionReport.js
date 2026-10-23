/**
 * F01-A01 五次坐站 — test-condition reports (pure, read-only helpers).
 *
 * Design: docs/verification/fa5x-criteria-evidence/RESULT_USABILITY_DESIGN.md (第四版, A 批).
 *
 * A condition report is the user's own statement about how the test was done
 * (arms used to push up? physical help from someone? chair). Reports live in
 * `session.conditionReports` — a list NEXT TO `session.result`, never inside it:
 * the machine measurement and the reported conditions are stored apart, and
 * nothing here ever writes either of them.
 *
 *   - The latest report is the one that counts; earlier ones are kept as history.
 *   - Missing / malformed values read as "unknown" — never as "no".
 *   - A report is a user statement. It is not verified and does not by itself
 *     make a result usable for comparison or recommendation (that is batch B).
 *
 * The App only ever APPENDS reports (functionalAssessmentService.appendFa5xConditionReport).
 * That is an App-side rule; the cloud guarantee comes only from firestore.rules
 * once deployed and verified — the two are not the same thing.
 */

export const FA5X_CONDITION_REPORT_SCHEMA = "fa5x-condition-report-1";

export const FA5X_CONDITION_ANSWER = Object.freeze({ NO: "no", YES: "yes", UNKNOWN: "unknown" });
export const FA5X_SAME_CHAIR_ANSWER = Object.freeze({ YES: "yes", NO: "no", UNKNOWN: "unknown", NOT_APPLICABLE: "not_applicable" });
/** Who gave the answers. Both are entered from the patient's own account; both are user statements. */
export const FA5X_CONDITION_SOURCE = Object.freeze({ SELF_REPORT: "self_report", CAREGIVER_REPORT: "caregiver_report" });

const ANSWERS = Object.values(FA5X_CONDITION_ANSWER);
const SAME_CHAIR_ANSWERS = Object.values(FA5X_SAME_CHAIR_ANSWER);
const SOURCES = Object.values(FA5X_CONDITION_SOURCE);
/** Exactly the fields a stored report may have (firestore.rules checks the same list). */
export const FA5X_CONDITION_REPORT_FIELDS = Object.freeze(["schemaVersion", "armsUsed", "physicalAssistance", "chairHeightCm", "sameChairAsBaseline", "source", "reportedBy", "reportedAt"]);
/** Plausible chair height range accepted as a typed number (cm); anything else is refused, not clamped. */
export const FA5X_CHAIR_HEIGHT_RANGE_CM = Object.freeze({ min: 20, max: 90 });

export const FA5X_CONDITION_LABEL = Object.freeze({
  armsUsed: { no: "沒有用手撐", yes: "有用手撐", unknown: "是否用手撐：不確定" },
  physicalAssistance: { no: "沒有人協助", yes: "有人協助", unknown: "是否有人協助：不確定" },
  source: { self_report: "本人回報", caregiver_report: "家人或照顧者代答" },
});

/**
 * Validates the answers of a NEW report (before it is stored). Unanswered
 * questions must be passed as "unknown" explicitly — the form maps an empty
 * radio group to "unknown", never to "no".
 * @returns {{ ok: true, answers } | { ok: false, error: string }}
 */
export function validateFa5xConditionAnswers(input = {}) {
  const { armsUsed, physicalAssistance, chairHeightCm = null, sameChairAsBaseline = FA5X_SAME_CHAIR_ANSWER.NOT_APPLICABLE, source } = input || {};
  if (!ANSWERS.includes(armsUsed)) return { ok: false, error: "invalid_arms_used" };
  if (!ANSWERS.includes(physicalAssistance)) return { ok: false, error: "invalid_physical_assistance" };
  if (!SAME_CHAIR_ANSWERS.includes(sameChairAsBaseline)) return { ok: false, error: "invalid_same_chair" };
  if (!SOURCES.includes(source)) return { ok: false, error: "invalid_source" };
  if (chairHeightCm !== null && !(typeof chairHeightCm === "number" && Number.isFinite(chairHeightCm)
    && chairHeightCm >= FA5X_CHAIR_HEIGHT_RANGE_CM.min && chairHeightCm <= FA5X_CHAIR_HEIGHT_RANGE_CM.max)) {
    return { ok: false, error: "invalid_chair_height" };
  }
  return { ok: true, answers: { armsUsed, physicalAssistance, chairHeightCm, sameChairAsBaseline, source } };
}

/** One stored report read defensively: any missing / malformed value becomes "unknown" (never "no"). */
export function readFa5xConditionReport(report) {
  const r = report && typeof report === "object" ? report : {};
  return {
    armsUsed: ANSWERS.includes(r.armsUsed) ? r.armsUsed : FA5X_CONDITION_ANSWER.UNKNOWN,
    physicalAssistance: ANSWERS.includes(r.physicalAssistance) ? r.physicalAssistance : FA5X_CONDITION_ANSWER.UNKNOWN,
    chairHeightCm: typeof r.chairHeightCm === "number" && Number.isFinite(r.chairHeightCm) ? r.chairHeightCm : null,
    sameChairAsBaseline: SAME_CHAIR_ANSWERS.includes(r.sameChairAsBaseline) ? r.sameChairAsBaseline : FA5X_SAME_CHAIR_ANSWER.UNKNOWN,
    source: SOURCES.includes(r.source) ? r.source : null,
    reportedBy: typeof r.reportedBy === "string" ? r.reportedBy : null,
    reportedAt: typeof r.reportedAt === "string" ? r.reportedAt : null,
  };
}

/** The effective (latest) report of a session, or null when there is none. */
export function getLatestFa5xConditionReport(session) {
  const list = session && Array.isArray(session.conditionReports) ? session.conditionReports : [];
  return list.length ? readFa5xConditionReport(list[list.length - 1]) : null;
}

/**
 * Display description of a session's reported conditions — every open issue at
 * once (never just one), plus the time label. No eligibility decision is made
 * here (batch B).
 * @returns {{ reported: boolean, reportCount: number, latest: object|null,
 *             issues: string[], timeLabel: string, conditionText: string|null }}
 */
export function describeFa5xConditions(session) {
  const reportCount = session && Array.isArray(session.conditionReports) ? session.conditionReports.length : 0;
  const latest = getLatestFa5xConditionReport(session);
  const issues = [];
  if (!latest) issues.push("no_condition_report");
  else {
    if (latest.armsUsed === "yes") issues.push("arms_used");
    if (latest.armsUsed === "unknown") issues.push("arms_unknown");
    if (latest.physicalAssistance === "yes") issues.push("assistance_given");
    if (latest.physicalAssistance === "unknown") issues.push("assistance_unknown");
    if (!latest.source) issues.push("source_unrecognized");
    if (latest.reportedBy && session && latest.reportedBy !== session.patientId) issues.push("reporter_not_owner");
  }
  const clear = !!latest && issues.length === 0;
  const conditionText = latest
    ? [FA5X_CONDITION_LABEL.armsUsed[latest.armsUsed], FA5X_CONDITION_LABEL.physicalAssistance[latest.physicalAssistance]].join("、")
    : null;
  return {
    reported: !!latest,
    reportCount,
    latest,
    issues,
    // 「完成時間」 only when the reported conditions are clear — and even then it says
    // the conditions are the user's own report. Otherwise 「觀察時間」 with the reason.
    timeLabel: clear ? "完成時間（依使用者回報的條件）" : "觀察時間",
    conditionText,
  };
}

/** Plain sentence for each issue code (display only). */
export const FA5X_CONDITION_ISSUE_TEXT = Object.freeze({
  no_condition_report: "測試條件尚未回報",
  arms_used: "回報有用手撐起身",
  arms_unknown: "是否用手撐：不確定",
  assistance_given: "回報有人協助",
  assistance_unknown: "是否有人協助：不確定",
  source_unrecognized: "回報來源無法辨識",
  reporter_not_owner: "回報者不是受測者本人帳號",
});
