import { AK07_THRESHOLDS as T } from "./constants.js";
export function createSingleLegCalfRaiseSession(config={}){
  const t=config.thresholds||T,target=Math.max(1,Number(config.targetReps)||t.TARGET_REPS);
  let phase="ready",side=null,start=0,hold=0,last=0,reps=[],valid=0,left=0,right=0,insufficient=0,pelvis=0,trunk=0,knee=0,ankle=0,fast=0,balance=0,tracking=0,wasReady=false,baselineHeel=0,baselineAnkle=0,maxRise=0,maxPelvis=0,maxTrunk=0,minKnee=180,maxKnee=0,maxAnkle=0;
  const summary=()=>({totalReps:reps.length,targetReps:target,validReps:valid,leftReps:left,rightReps:right,insufficientLiftCount:insufficient,pelvisTiltCount:pelvis,trunkLeanCount:trunk,kneeControlCount:knee,ankleShiftCount:ankle,tooFastCount:fast,balanceLossCount:balance,trackingInterruptionCount:tracking,repRecords:reps,completed:reps.length>=target,state:phase,supportSide:side});
  const support=f=>{const scale=Math.max(.05,(f.leftLegScale+f.rightLegScale)/2),difference=(f.leftHeelY-f.rightHeelY)/scale;if(difference>=t.FREE_FOOT_HEIGHT_MIN_RATIO)return"left";if(difference<=-t.FREE_FOOT_HEIGHT_MIN_RATIO)return"right";return null;};
  function processFrame(f){
    const now=f.timestamp||0,dt=Math.min(100,Math.max(0,now-last));last=now;
    if(!f.bodyReady){if(wasReady)tracking++;wasReady=false;return{summary:summary(),feedback:"請保持全身與雙腳完整入鏡"};}
    wasReady=true;const candidate=support(f);
    if(phase==="ready"){
      if(!candidate)return{summary:summary(),feedback:"請抬起非訓練腳並扶穩固物保持平衡"};
      side=candidate;baselineHeel=f[side+"HeelY"];baselineAnkle=f[side+"AnkleX"];phase="armed";
      return{summary:summary(),feedback:`已辨識${side==="left"?"左":"右"}腳支撐，請穩定抬起腳跟`,riseRatio:0};
    }
    const scale=f[side+"LegScale"]||.1,rise=(baselineHeel-f[side+"HeelY"])/scale;
    if(!candidate||candidate!==side){balance++;phase="ready";side=null;return{summary:summary(),feedback:"支撐腳改變，請重新站穩"};}
    if(phase==="armed"&&rise>=t.REP_START_RISE_RATIO){phase="rising";start=now;hold=0;maxRise=0;maxPelvis=0;maxTrunk=0;minKnee=180;maxKnee=0;maxAnkle=0;}
    if(phase==="rising"){
      maxRise=Math.max(maxRise,rise);maxPelvis=Math.max(maxPelvis,f.pelvisTiltRatio||0);maxTrunk=Math.max(maxTrunk,f.trunkLeanDeg||0);
      const k=f[side+"KneeFlexionDeg"]||0;minKnee=Math.min(minKnee,k);maxKnee=Math.max(maxKnee,k);maxAnkle=Math.max(maxAnkle,Math.abs((f[side+"AnkleX"]-baselineAnkle)/scale));
      if(rise>=t.TOP_RISE_RATIO)hold+=dt;if(hold>=t.HOLD_MS)phase="returning";if(now-start>t.MAX_REP_MS){phase="ready";side=null;}
    }else if(phase==="returning"&&rise<=t.RETURN_RISE_RATIO){
      const durationMs=now-start,issues=[];
      if(maxRise<t.TARGET_RISE_RATIO){issues.push("insufficient");insufficient++;}if(maxPelvis>t.PELVIS_TILT_MAX_RATIO){issues.push("pelvis");pelvis++;}if(maxTrunk>t.TRUNK_LEAN_MAX_DEG){issues.push("trunk");trunk++;}if(minKnee<t.KNEE_FLEXION_MIN_DEG||maxKnee>t.KNEE_FLEXION_MAX_DEG){issues.push("knee");knee++;}if(maxAnkle>t.ANKLE_SHIFT_MAX_RATIO){issues.push("ankle");ankle++;}if(durationMs<t.TOO_FAST_MS){issues.push("fast");fast++;}
      if(!issues.length)valid++;if(side==="left")left++;else right++;const rep={side,durationMs,maxRiseRatio:maxRise,issues};reps.push(rep);phase="ready";side=null;
      return{summary:summary(),completedRep:rep,feedback:issues.length?"完成一次單腳提踵，請依提醒調整":"單腳提踵穩定，抬起與下降控制良好"};
    }
    const feedback=maxPelvis>t.PELVIS_TILT_MAX_RATIO?"骨盆保持水平":maxTrunk>t.TRUNK_LEAN_MAX_DEG?"身體保持直立，避免側傾":maxAnkle>t.ANKLE_SHIFT_MAX_RATIO?"腳踝保持正中，避免向內外偏移":phase==="rising"?"腳跟抬高並短暫停留":"慢慢控制腳跟下降";
    return{summary:summary(),feedback,riseRatio:rise};
  }
  return{processFrame,getSummary:summary};
}
