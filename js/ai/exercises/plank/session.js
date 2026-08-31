import { CR01_THRESHOLDS as T } from "./constants.js";

export function createPlankSession(config = {}) {
  const thresholds = config.thresholds || T;
  const targetMs = Math.max(1000, Number(config.targetSeconds || 20) * 1000);
  let heldMs = 0, lastTimestamp = null, trackingInterruptionCount = 0;
  let totalFrames = 0, validFrames = 0, hipHighFrames = 0, hipLowFrames = 0;
  let kneeBendFrames = 0, elbowFrames = 0, inclineFrames = 0;
  let maxHipDeviationRatio = 0, completed = false;

  function summary() {
    return { targetSeconds: targetMs / 1000, heldSeconds: heldMs / 1000, heldMs, totalFrames, validFrames,
      hipHighFrames, hipLowFrames, kneeBendFrames, elbowFrames, inclineFrames,
      maxHipDeviationRatio, trackingInterruptionCount, completed };
  }
  function processFrame(frame) {
    const now = Number(frame.timestamp) || 0;
    const rawGap = lastTimestamp == null ? 0 : Math.max(0, now - lastTimestamp);
    const dt = Math.min(100, rawGap);
    lastTimestamp = now;
    if (!frame.bodyReady) {
      if (heldMs > 0 && rawGap <= thresholds.MAX_FRAME_GAP_MS) trackingInterruptionCount += 1;
      return { postureValid: false, feedback: "請側身並讓肩、手肘、髖、膝與腳踝完整入鏡", summary: summary() };
    }
    totalFrames += 1;
    const hipHigh = frame.hipLineOffsetRatio < -thresholds.HIP_LINE_MAX_RATIO;
    const hipLow = frame.hipLineOffsetRatio > thresholds.HIP_LINE_MAX_RATIO;
    const kneeBend = frame.kneeAngleDeg == null || frame.kneeAngleDeg < thresholds.KNEE_ANGLE_MIN_DEG;
    const elbowBad = frame.elbowAngleDeg == null || frame.elbowAngleDeg < thresholds.ELBOW_ANGLE_MIN_DEG || frame.elbowAngleDeg > thresholds.ELBOW_ANGLE_MAX_DEG;
    const inclineBad = frame.bodyInclineDeg == null || frame.bodyInclineDeg > thresholds.BODY_INCLINE_MAX_DEG;
    if (hipHigh) hipHighFrames += 1; if (hipLow) hipLowFrames += 1;
    if (kneeBend) kneeBendFrames += 1; if (elbowBad) elbowFrames += 1; if (inclineBad) inclineFrames += 1;
    maxHipDeviationRatio = Math.max(maxHipDeviationRatio, frame.hipDeviationRatio || 0);
    const postureValid = !hipHigh && !hipLow && !kneeBend && !elbowBad && !inclineBad;
    if (postureValid && !completed) { validFrames += 1; heldMs = Math.min(targetMs, heldMs + dt); }
    completed = heldMs >= targetMs;
    const feedback = hipLow ? "臀部下沉，收緊核心並抬回一直線" : hipHigh ? "臀部過高，讓肩、髖與腳踝回到一直線" : kneeBend ? "膝蓋伸直，維持腿部穩定" : elbowBad ? "手肘放在肩膀下方，前臂穩定支撐" : inclineBad ? "調整拍攝與身體位置，讓軀幹接近水平" : completed ? "目標時間完成！" : "姿勢很好，繼續穩定維持";
    return { postureValid, feedback, summary: summary() };
  }
  return { processFrame, getSummary: summary };
}
