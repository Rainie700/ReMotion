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
 * 1.2 keeps 1.1's geometry but changes how a tracking gap affects the
 * consecutive-frame confirmations (docs/verification/fa5x-gap-reset/), so a
 * 1.1 and a 1.2 result can count / time the same movement differently: 1.2 is
 * its own group and is NOT comparable with 1.1 either.
 *
 * Rules:
 *   - every known version maps to one measurement group; results compare only
 *     within the same group (1.0 vs 1.0 stays comparable, as before);
 *   - a missing or unknown version is never assumed compatible;
 *   - a 1.1 / 1.2 result must also carry its geometryCoordinateSpace, a 1.0 result
 *     must not (1.0 never wrote it) — anything else is inconsistent;
 *   - a NEW tracking baseline must be in the CURRENT group.
 * Nothing is rewritten: historical results keep their stored version and stay
 * viewable; they are only kept out of comparisons they are not compatible with.
 */

const LEGACY_GROUP = "fa5x_geometry_per_axis_normalized";
const ISOTROPIC_GROUP = "fa5x_geometry_isotropic_image_height";
const GAP_RESET_GROUP = "fa5x_isotropic_gap_resets_confirmation";

/** algorithmVersion -> { group, coordinateSpace (what the result must store; null = must be absent) } */
export const FA5X_MEASUREMENT_VERSIONS = Object.freeze({
  "fa5x-assessment-1.0": Object.freeze({ group: LEGACY_GROUP, coordinateSpace: null }),
  "fa5x-assessment-1.1": Object.freeze({ group: ISOTROPIC_GROUP, coordinateSpace: FA5X_GEOMETRY_COORDINATE_SPACE }),
  "fa5x-assessment-1.2": Object.freeze({ group: GAP_RESET_GROUP, coordinateSpace: FA5X_GEOMETRY_COORDINATE_SPACE }),
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

/** The one user-facing sentence for a measurement-version incompatibility (docs/verification/fa5x-12-browser/). */
export const FA5X_INCOMPATIBILITY_TEXT = "量測方式已更新，這兩次結果無法直接比較；舊紀錄仍會保留。";

/**
 * User-facing sentence (no engineering codes) for a comparison that is refused because of the
 * measurement version (mismatch, missing or unknown). It explains the method changed — never a
 * statement about the person (no 退步 / 未訓練 / 動作不合格).
 */
export function describeFa5xIncompatibility(reason) {
  if (!reason) return null;
  return FA5X_INCOMPATIBILITY_TEXT;
}
