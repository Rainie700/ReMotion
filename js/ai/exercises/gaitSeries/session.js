import {GAIT_THRESHOLDS as T} from "./constants.js";
export function createGaitSeriesSession(profile,config={}){
 const t=config.thresholds||T,target=Math.max(1,Number(config.targetReps)||profile.targetReps||1),targetMs=(profile.targetSeconds||0)*1000;
 let last=0,active=null,start=0,reps=[],left=0,right=0,activeMs=0,tilt=0,lean=0,fast=0,rhythm=0,arms=0,tracking=0,ready=false,lastSide=null,lastEvent={};
 const event=(k,now)=>{if(now-(lastEvent[k]??-Infinity)>t.EVENT_COOLDOWN_MS){lastEvent[k]=now;return true}return false};
 const summary=()=>({totalReps:profile.mode==="duration"?(activeMs>=targetMs?1:0):reps.length,targetReps:target,targetSeconds:profile.targetSeconds||null,activeMs:Math.min(activeMs,targetMs),activeSeconds:Math.floor(Math.min(activeMs,targetMs)/1000),leftSteps:left,rightSteps:right,validReps:reps.filter(r=>!r.issues.length).length,tiltCount:tilt,trunkLeanCount:lean,tooFastCount:fast,rhythmIssueCount:rhythm,armPositionCount:arms,trackingInterruptionCount:tracking,repRecords:reps.slice(),phase:active?"lifted":"ready",completed:profile.mode==="duration"?activeMs>=targetMs:reps.length>=target});
 function processFrame(f){const now=f.timestamp||0,dt=Math.min(100,Math.max(0,now-last));last=now;if(!f.bodyReady){if(ready)tracking++;ready=false;return{summary:summary(),feedback:"請保持全身、雙手與雙腳完整入鏡"}}ready=true;
  const leftLift=f.leftFootLiftRatio>=t.FOOT_LIFT_RATIO,rightLift=f.rightFootLiftRatio>=t.FOOT_LIFT_RATIO,side=leftLift&&!rightLift?"left":rightLift&&!leftLift?"right":null;
  const badTilt=f.shoulderTiltDeg>t.TILT_MAX_DEG||f.pelvisTiltDeg>t.TILT_MAX_DEG,badLean=f.trunkLeanDeg>t.TRUNK_LEAN_MAX_DEG;
  if(profile.id==="F04-02"&&(f.leftArmHeight>.25||f.rightArmHeight>.25)&&event("arms",now))arms++;
  if(profile.mode==="duration"&&side)activeMs+=dt;
  if(!active&&side){active=side;start=now;}
  if(active&&!leftLift&&!rightLift){const durationMs=now-start,issues=[];if(durationMs<t.TOO_FAST_MS){issues.push("fast");fast++;}if(badTilt){issues.push("tilt");tilt++;}if(badLean){issues.push("lean");lean++;}if(lastSide===active){issues.push("rhythm");rhythm++;}if(profile.id==="F04-02"&&(f.leftArmHeight>.25||f.rightArmHeight>.25))issues.push("arms");let rep=null;if(durationMs>=t.MIN_STEP_MS&&durationMs<=t.MAX_STEP_MS){rep={side:active,durationMs,issues};reps.push(rep);if(active==="left")left++;else right++;lastSide=active;}active=null;return{summary:summary(),completedRep:rep,feedback:issues.length?"完成一步，請依提醒調整":"很好，步伐平穩且控制良好"};}
  const feedback=badLean?"軀幹保持直立，不要過度前後傾":badTilt?"保持肩膀與骨盆穩定":profile.id==="F04-02"&&(f.leftArmHeight>.25||f.rightArmHeight>.25)?"雙臂請維持在肩膀高度":side?"控制抬腳並慢慢放回":"請開始交替抬腳";
  return{summary:summary(),feedback};
 }return{processFrame,getSummary:summary};
}
