import { F02_REQUIRED_LANDMARKS as R, F02_THRESHOLDS as T } from "./constants.js";
const ok=(p,m)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=m;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const tilt=(a,b)=>Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);
export function computeBalanceSeriesMetrics(l,t=T){
  if(!Array.isArray(l)||!R.every(i=>ok(l[i],t.MIN_VISIBILITY)))return{bodyReady:false};
  const shoulder=mid(l[11],l[12]),hip=mid(l[23],l[24]),ankle=mid(l[27],l[28]);
  const scale=Math.max(.08,dist(shoulder,hip)),leftWrist=l[15],rightWrist=l[16];
  return {bodyReady:true,bodyScale:scale,centerX:(shoulder.x+hip.x)/2,centerY:(shoulder.y+hip.y)/2,
    shoulderTiltDeg:tilt(l[11],l[12]),pelvisTiltDeg:tilt(l[23],l[24]),
    ankleCenterX:ankle.x,ankleCenterY:ankle.y,ankleWidth:Math.abs(l[27].x-l[28].x)/scale,
    ankleDepth:Math.abs(l[27].y-l[28].y)/scale,leftAnkleX:l[27].x,rightAnkleX:l[28].x,leftAnkleY:l[27].y,rightAnkleY:l[28].y,
    leftWristX:leftWrist.x,leftWristY:leftWrist.y,rightWristX:rightWrist.x,rightWristY:rightWrist.y,
    leftArmHeight:Math.abs(leftWrist.y-l[11].y)/scale,rightArmHeight:Math.abs(rightWrist.y-l[12].y)/scale};
}
