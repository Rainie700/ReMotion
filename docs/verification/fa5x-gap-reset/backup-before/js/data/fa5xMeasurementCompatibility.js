import { FA5X_ALGORITHM_VERSION, FA5X_GEOMETRY_COORDINATE_SPACE } from "../ai/exercises/sitToStand/assessmentConstants.js";

/**
 * 5xSTS measurement-version compatibility (pure, read-only).
 *
 * Two stored 5xSTS results may be compared — and so feed D4 comparisons, D5
 * decisions and LLM progression inputs — only when they were measured the same
 * way. fa5x-assessment-1.0 measured knee angle / shank length on per-axis
 * normalized coordinates; 1.1 measures them in isotropic image-height units, so
 * which attempts count as a rep can differ (see assessmentFeatures.js). The
 * timing definition is the same, but the two are NOT treated as comparable.
 *
 * Rules:
 *   - every known version maps to one measurement group; results compare only
 *     within the same group (1.0 vs 1.0 stays comparable, as before);
 *   - a missing or unknown version is never assumed compatible;
 *   - a 1.1 result must also carry its geometryCoordinateSpace, a 1.0 result
 *     must not (1.0 never wrote it) — anything else is inconsistent;
 *   - a NEW tracking baseline must be in the CURRENT group.
 * Nothing is rewritten: historical results keep their stored version and stay
 * viewable; they are only kept out of comparisons they are not compatible with.
 */

const LEGACY_GROUP = "fa5x_geometry_per_axis_normalized";
const ISOTROPIC_GROUP = "fa5x_geometry_isotropic_image_height";

/** algorithmVersion -> { group, coordinateSpace (what the result must store; null = must be absent) } */
export const FA5X_MEASUREMENT_VERSIONS = Object.freeze({
  "fa5x-assessment-1.0": Object.freeze({ group: LEGACY_GROUP, coordinateSpace: null }),
  "fa5x-assessment-1.1": Object.freeze({ group: ISOTROPIC_GROUP, coordinateSpace: FA5X_GEOMETRY_COORDINATE_SPACE }),
});

export const FA5X_CURRENT_MEASUREMENT_GROUP = FA5X_MEASUREMENT_VERSIONS[FA5X_ALGORITHM_VERSION].group;

/** The measurement fields a current assessment session writes (for demo seeds / fixtures that fabricate a current result). */
export const FA5X_CURRENT_MEASUREMENT_FIELDS = Object.freeze({ algorithmVersion: FA5X_ALGORITHM_VERSION, geometryCoordinateSpace: FA5X_GEOMETRY_COORDINATE_SPACE });

export const FA5X_INCOMPATIBILITY = Object.freeze({
  VERSION_MISSING: "measurement_version_missing",
  VERSION_UNKNOWN: "measurement_version_unknown",
  COORDINATE_SPACE_MISMATCH: "measurement_coordinate_space_mismatch",
  VERSION_MISMATCH: "measurement_version_mismatch",
});

/**
 * @returns {{ algorithmVersion: string|null, geometryCoordinateSpace: string|null,
 *             group: string|null, current: boolean, problem: string|null }}
 */
export function getFa5xMeasurementProfile(result) {
  const algorithmVersion = result && typeof result.algorithmVersion === "string" && result.algorithmVersion ? result.algorithmVersion : null;
  const geometryCoordinateSpace = result && result.geometryCoordinateSpace != null ? result.geometryCoordinateSpace : null;
  const profile = { algorithmVersion, geometryCoordinateSpace, group: null, current: false, problem: null };
  if (!algorithmVersion) return { ...profile, problem: FA5X_INCOMPATIBILITY.VERSION_MISSING };
  const known = Object.prototype.hasOwnProperty.call(FA5X_MEASUREMENT_VERSIONS, algorithmVersion) ? FA5X_MEASUREMENT_VERSIONS[algorithmVersion] : null;
  if (!known) return { ...profile, problem: FA5X_INCOMPATIBILITY.VERSION_UNKNOWN };
  if (geometryCoordinateSpace !== known.coordinateSpace) return { ...profile, problem: FA5X_INCOMPATIBILITY.COORDINATE_SPACE_MISMATCH };
  return { ...profile, group: known.group, current: known.group === FA5X_CURRENT_MEASUREMENT_GROUP };
}

/** May this result start a NEW tracking cycle (be a new baseline)? Only a current-version measurement. */
export function isCurrentFa5xMeasurement(result) {
  return getFa5xMeasurementProfile(result).current;
}

/**
 * @returns {{ compatible: boolean, reason: string|null, baseline, reassessment }}
 *   reason: the first problem found (baseline first), or VERSION_MISMATCH.
 */
export function checkFa5xMeasurementCompatibility(baselineResult, reassessmentResult) {
  const baseline = getFa5xMeasurementProfile(baselineResult);
  const reassessment = getFa5xMeasurementProfile(reassessmentResult);
  const reason = baseline.problem || reassessment.problem || (baseline.group !== reassessment.group ? FA5X_INCOMPATIBILITY.VERSION_MISMATCH : null);
  return { compatible: !reason, reason, baseline, reassessment };
}

/** User-facing sentence (no engineering codes) for a comparison that is refused. */
export function describeFa5xIncompatibility(reason) {
  if (!reason) return null;
  if (reason === FA5X_INCOMPATIBILITY.VERSION_MISMATCH) return "初次與再次評估使用不同版本的量測方式，無法直接比較；請以新版重新建立基準評估";
  return "評估紀錄缺少可確認的量測版本，無法直接比較；請以新版重新建立基準評估";
}
