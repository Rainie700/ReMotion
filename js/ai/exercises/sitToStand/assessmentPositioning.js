import { FA5X_PARAMS } from "./assessmentConstants.js";
import { assessFa5xFraming, trackingPromptKey } from "./assessmentFeatures.js";

/**
 * F01-A01 5xSTS — Step 1 of the camera set-up: the user STANDS in front of
 * the chair while the framing is checked, so that the standing posture (the
 * highest point of every rep) is known to fit in the frame before the test.
 *
 * This runs in front of the assessment session (assessmentSession.js), which
 * is not modified: frames are only fed to the session after this check is
 * done. No new detection thresholds — it reuses FRAME_EDGE_MARGIN and
 * TOO_FAR_BODY_HEIGHT_MAX via assessFa5xFraming(); the two values below are UX
 * timings only.
 */

export const FA5X_POSITIONING_UX = Object.freeze({
  /** Standing framing must stay OK this long before 「拍攝位置完成」. UX timing, not a threshold. */
  STANDING_POSITION_HOLD_MS: 1000,
  /** After 「拍攝位置完成」, time given to walk back and sit before seated-stage framing warnings are shown/spoken. UX timing. */
  SIT_DOWN_GRACE_MS: 3000,
});

/**
 * Framing prompt key for a STANDING frame:
 * "OK" | "FRAME_BODY" | "FEET_MISSING" | "NO_HEADROOM" | "TOO_CLOSE" | "TOO_FAR".
 * Top AND bottom at the frame edge -> too close; only the top -> no headroom
 * above the head/shoulders; only the bottom -> feet at the edge.
 */
export function classifyStandingFraming(features, params = FA5X_PARAMS) {
  if (!features || !features.tracked) return trackingPromptKey(features);
  const edge = params.FRAME_EDGE_MARGIN;
  const topCut = features.topY < edge;
  const bottomCut = features.bottomY > 1 - edge;
  if (topCut && bottomCut) return "TOO_CLOSE";
  if (topCut) return "NO_HEADROOM";
  if (bottomCut) return "FEET_MISSING";
  const framing = assessFa5xFraming(features, params, { checkStandingHeadroom: false });
  return framing === "OK" ? "OK" : framing;
}

/**
 * update(features, t) -> { key, progress 0..1, done }. `done` latches once the
 * standing framing has been OK for STANDING_POSITION_HOLD_MS continuously.
 */
export function createStandingPositionCheck({ params = FA5X_PARAMS, holdMs = FA5X_POSITIONING_UX.STANDING_POSITION_HOLD_MS } = {}) {
  let okSince = null;
  let done = false;
  let key = "STAND_POSITION";
  return {
    update(features, t) {
      if (done) return { key: "POSITION_OK", progress: 1, done: true };
      const framing = classifyStandingFraming(features, params);
      if (framing !== "OK") {
        okSince = null;
        key = framing;
        return { key, progress: 0, done: false };
      }
      if (okSince == null) okSince = t;
      const progress = Math.min(1, (t - okSince) / holdMs);
      if (progress >= 1) {
        done = true;
        return { key: "POSITION_OK", progress: 1, done: true };
      }
      key = "STAND_POSITION";
      return { key, progress, done: false };
    },
    isDone: () => done,
  };
}
