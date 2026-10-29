import { computeUpperLimbMetrics } from "./exercises/upperLimbSeries/poseMath.js";
import { computeFlexibilityMetrics } from "./exercises/flexibilitySeries/poseMath.js";
import { computeBalanceSeriesMetrics } from "./exercises/balanceSeries/poseMath.js";
/** Engineering-only candidates. No cm / metre conversion and no clinical score. */
export function createDomainCandidateTracker(domain, side = "right") {
  let phase = "unknown", count = 0, missingFrames = 0, visibleFrames = 0, previous = null, breaks = 0;
  const events = [];
  let lastTime = null;
  return {
    resetSegment() { phase = "unknown"; previous = null; lastTime = null; },
    update(l, time, active = false) {
      const ids = domain === "F05" ? (side === "left" ? [11, 13, 15] : [12, 14, 16]) : [11, 12, 23, 24, 27, 28];
      const ready = Array.isArray(l) && ids.every(i => l[i] && Number.isFinite(l[i].x) && Number.isFinite(l[i].y) && (l[i].visibility ?? 0) >= .5);
      if (!ready || (lastTime != null && time - lastTime > 250)) { phase = "unknown"; previous = null; missingFrames++; }
      lastTime = time;
      if (!ready) return { ready: false, text: "追蹤不足；陪同者請依實際觀察操作計時。" };
      visibleFrames++;
      let text = "身體入鏡；正式測驗由陪同者確認。";
      if (domain === "F05" && active) {
        // 85/150 degrees are existing engineering hysteresis candidates, NOT sourced clinical cutoffs.
        const m = computeUpperLimbMetrics(l), angle = side === "left" ? m.leftElbowAngle : m.rightElbowAngle;
        if (Number.isFinite(angle)) {
          if (angle >= 150) { if (phase === "flexed") count++; phase = "extended"; }
          else if (angle <= 85 && phase === "extended") phase = "flexed";
          text = `候選彎舉 ${count} 次；請另由陪同者確認完整次數。`;
        }
      } else if (domain === "F02" && active) {
        const m = computeBalanceSeriesMetrics(l);
        if (m.bodyReady) {
          if (previous && Math.max(Math.abs(m.leftAnkleX - previous.leftAnkleX), Math.abs(m.rightAnkleX - previous.rightAnkleX), Math.abs(m.leftAnkleY - previous.leftAnkleY), Math.abs(m.rightAnkleY - previous.rightAnkleY)) / m.bodyScale > .15) {
            breaks++; if (events.length < 100) events.push({ event: "foot_movement_candidate", ms: Math.round(time) });
            text = "相機疑似看到腳部移動，請陪同者確認是否停止該階段。";
          }
          previous = m;
        }
      } else if (domain === "F06") {
        const m = computeFlexibilityMetrics(l);
        if (Number.isFinite(m.leftKneeAngle) && Number.isFinite(m.rightKneeAngle)) text = `膝部姿勢可見；伸取距離仍須用尺量測。`;
      }
      return { ready: true, text };
    },
    summary: () => ({ method: "mediapipe_candidates_only", visibleFrames, missingFrames, count: domain === "F05" && visibleFrames > 0 ? count : null, positionBreakCandidates: breaks, events }),
  };
}
