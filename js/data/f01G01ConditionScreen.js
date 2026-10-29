import { FA5X_CONDITION_ANSWER, FA5X_CONDITION_REPORT_SCHEMA } from "./fa5xConditionReport.js";

/**
 * G01「從椅子起身更順」條件篩選第一版 (pure) — docs/F01_G01_IMPLEMENTABLE_CONDITIONS.md.
 *
 * An engineering screen for NEW G01 first recommendations only. It decides
 * which G01 pool exercises the system may list automatically; it is not a
 * clinical rule, and passing it does not mean an exercise is safe, effective or
 * correctly dosed for the patient.
 *
 *   F01-01 深蹲 / F01-10 橋式  not included automatically in this version (policy, not a contraindication)
 *   F01-04 坐姿起立            included only when the latest condition report of the recommendation's own
 *                              assessment says arms NOT used and NO physical assistance; a reported "yes"
 *                              (not covered) and an unknown / missing / invalid value (not confirmed) are
 *                              kept as separate reasons, both when they occur together.
 *
 * Unknown is never read as "no". Nothing here fills a slot with another exercise.
 */

export const F01_G01_CONDITION_RULE_VERSION = "f01-g01-condition-screen-1.0";
export const F01_G01_SCREEN_GOAL_ID = "G01";

/** Why an exercise is not listed — three kinds the patient page keeps apart. */
export const G01_REASON_CATEGORY = Object.freeze({
  NOT_INCLUDED: "not_included_this_version", // 本版未納入（工程政策）
  NOT_SUPPORTED: "not_supported",            // 目前自動推薦未涵蓋（已回報的協助方式）
  UNCONFIRMED: "data_unconfirmed",           // 評估條件尚未確認
});

/** Exercises of the G01 pool this version does not list automatically, with their own reason code. */
export const G01_NOT_AUTO_INCLUDED = Object.freeze({
  "F01-01": "g01_squat_version_unmatched",
  "F01-10": "g01_bridge_setting_unconfirmed",
});

export const G01_SIT_TO_STAND_ID = "F01-04";
export const G01_SCREEN_REASON = Object.freeze({
  ASSISTANCE_NOT_COVERED: "g01_assistance_not_covered",
  CONDITION_UNCONFIRMED: "g01_condition_unconfirmed",
});

/** A field's state: "no" / "yes" / "unknown" (answered 不確定) / "missing" / "invalid". */
const ANSWERS = Object.values(FA5X_CONDITION_ANSWER);
function fieldState(report, key) {
  if (!report || !(key in report) || report[key] === null || report[key] === undefined) return "missing";
  return ANSWERS.includes(report[key]) ? report[key] : "invalid";
}

/**
 * The condition snapshot the screen uses: the LATEST report of the recommendation's own,
 * completed assessment, and only when that assessment and report belong to `patientId`.
 * @param {{ patientId, assessmentId, session }} input  session = the stored 5xSTS session
 */
export function buildG01ConditionSnapshot({ patientId, assessmentId, session }) {
  const reports = session && Array.isArray(session.conditionReports) ? session.conditionReports : [];
  let sourceProblem = null;
  if (!session || !assessmentId || session.id !== assessmentId) sourceProblem = "assessment_mismatch";
  else if (!patientId || session.patientId !== patientId) sourceProblem = "assessment_not_owned";
  else if (session.status !== "completed") sourceProblem = "assessment_not_completed";
  const raw = !sourceProblem && reports.length ? reports[reports.length - 1] : null;
  if (raw && raw.reportedBy !== patientId) sourceProblem = "reporter_not_owner";
  const report = sourceProblem ? null : raw;
  return {
    ruleVersion: F01_G01_CONDITION_RULE_VERSION,
    sourceAssessmentId: assessmentId || null,
    sourceProblem,
    reportCount: sourceProblem ? 0 : reports.length,
    reportIndex: report ? reports.length - 1 : null,
    reportSchemaVersion: report ? (report.schemaVersion === FA5X_CONDITION_REPORT_SCHEMA ? report.schemaVersion : "invalid") : null,
    reportedAt: report && typeof report.reportedAt === "string" ? report.reportedAt : null,
    reportSource: report && typeof report.source === "string" ? report.source : null,
    armsUsed: fieldState(report, "armsUsed"),
    physicalAssistance: fieldState(report, "physicalAssistance"),
  };
}

/**
 * The F01-04 decision for a snapshot. Both reasons are returned when a reported "yes"
 * and an unconfirmed field occur together.
 * @returns {{ passed: boolean, reasons: Array<{ code, category, fields: Array<{ field, state }> }> }}
 */
export function screenG01SitToStand(snapshot) {
  const fields = ["armsUsed", "physicalAssistance"].map((field) => ({ field, state: snapshot ? snapshot[field] : "missing" }));
  // A source problem (another account's / mismatched assessment) leaves no report, so every field reads "missing".
  const reported = fields.filter((f) => f.state === "yes");
  const unconfirmed = fields.filter((f) => f.state !== "yes" && f.state !== "no");
  const reasons = [];
  if (reported.length) reasons.push({ code: G01_SCREEN_REASON.ASSISTANCE_NOT_COVERED, category: G01_REASON_CATEGORY.NOT_SUPPORTED, fields: reported });
  if (unconfirmed.length) reasons.push({ code: G01_SCREEN_REASON.CONDITION_UNCONFIRMED, category: G01_REASON_CATEGORY.UNCONFIRMED, fields: unconfirmed });
  return { passed: reasons.length === 0, reasons };
}
