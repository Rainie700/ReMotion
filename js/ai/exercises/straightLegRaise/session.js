import { LE02_THRESHOLDS as T } from "./constants.js";

function createLegTracker(side, t) {
  let state = "neutral", startedAt = null, minHipAngle = Infinity, minKneeAngle = Infinity;
  let maxBodyRollDeg = 0, topConfirm = 0, neutralConfirm = 0;
  const reset = () => { state="neutral";startedAt=null;minHipAngle=Infinity;minKneeAngle=Infinity;maxBodyRollDeg=0;topConfirm=0;neutralConfirm=0; };
  return {
    getState: () => state,
    update(hip, knee, roll, timestamp) {
      if (hip == null || knee == null) return null;
      let completed = null;
      if (state === "neutral" && hip <= t.REP_START_HIP_ANGLE_MAX_DEG) {
        state="raising";startedAt=timestamp;minHipAngle=hip;minKneeAngle=knee;
      } else if (state !== "neutral") {
        minHipAngle=Math.min(minHipAngle,hip);minKneeAngle=Math.min(minKneeAngle,knee);maxBodyRollDeg=Math.max(maxBodyRollDeg,roll||0);
        if (state === "raising") {
          if (hip <= t.TOP_CANDIDATE_HIP_ANGLE_MAX_DEG) { if (++topConfirm >= t.TOP_CONFIRM_FRAMES) state="top"; } else topConfirm=0;
        } else if (state === "top" && hip > t.TOP_CANDIDATE_HIP_ANGLE_MAX_DEG) state="lowering";
        else if (state === "lowering") {
          if (hip >= t.NEUTRAL_HIP_ANGLE_MIN_DEG) {
            if (++neutralConfirm >= t.NEUTRAL_CONFIRM_FRAMES) {
              const durationMs=timestamp-startedAt;
              if (durationMs>=t.MIN_REP_DURATION_MS&&durationMs<=t.MAX_REP_DURATION_MS) completed={side,durationMs,minHipAngle,minKneeAngle,maxBodyRollDeg};
              reset();
            }
          } else neutralConfirm=0;
        }
      }
      return completed;
    },
  };
}

export function createStraightLegRaiseSession(config={}) {
  const t=config.thresholds||T,targetReps=Math.max(1,Number(config.targetReps)||10);let reps=[];
  const left=createLegTracker("left",t),right=createLegTracker("right",t);
  const summary=()=>{const count=x=>reps.filter(r=>r.issues.includes(x)).length;return{totalReps:reps.length,targetReps,leftReps:reps.filter(r=>r.side==="left").length,rightReps:reps.filter(r=>r.side==="right").length,validReps:reps.filter(r=>r.qualityValid).length,qualityValidReps:reps.filter(r=>r.qualityValid).length,insufficientRaiseCount:count("insufficient_raise"),excessiveRaiseCount:count("excessive_raise"),kneeBendCount:count("knee_bend"),bodyRollCount:count("body_roll"),tooFastCount:count("too_fast"),averageMinHipAngle:reps.length?Math.round(reps.reduce((a,r)=>a+r.minHipAngle,0)/reps.length):null,averageRepDuration:reps.length?Math.round(reps.reduce((a,r)=>a+r.durationMs,0)/reps.length):null,repRecords:reps.slice(),completed:reps.length>=targetReps};};
  return {processFrame(f){if(!f.bodyReady)return{completedReps:[],summary:summary()};const completed=[left.update(f.leftHipAngle,f.leftKneeAngle,f.bodyRollDeg,f.timestamp),right.update(f.rightHipAngle,f.rightKneeAngle,f.bodyRollDeg,f.timestamp)].filter(Boolean).map(rep=>{const issues=[];if(rep.minHipAngle>t.TARGET_HIP_ANGLE_MAX_DEG)issues.push("insufficient_raise");if(rep.minHipAngle<t.EXCESSIVE_RAISE_HIP_ANGLE_MAX_DEG)issues.push("excessive_raise");if(rep.minKneeAngle<t.KNEE_EXTENSION_MIN_DEG)issues.push("knee_bend");if(rep.maxBodyRollDeg>t.BODY_ROLL_MAX_DEG)issues.push("body_roll");if(rep.durationMs<t.TOO_FAST_DURATION_MS)issues.push("too_fast");const record={...rep,repNumber:reps.length+1,issues,qualityValid:issues.length===0};reps.push(record);return record;});return{completedReps:completed,summary:summary()};},getSummary:summary};
}
