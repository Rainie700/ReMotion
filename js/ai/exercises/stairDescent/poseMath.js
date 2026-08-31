import{AD07_REQUIRED_LANDMARKS as R,AD07_THRESHOLDS as T}from"./constants.js";
const ok=(p,m)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=m;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b,c)=>{const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y},d=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);return d?Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/d)))*180/Math.PI:null};
const tilt=(a,b)=>{const x=Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);return Math.min(x,180-x)};
export function computeStairDescentMetrics(l,t=T){const bodyReady=Array.isArray(l)&&R.every(i=>ok(l[i],t.MIN_VISIBILITY));if(!bodyReady)return{bodyReady:false};const shoulder=mid(l[11],l[12]),hip=mid(l[23],l[24]),ankle=mid(l[27],l[28]),scale=Math.max(.04,dist(shoulder,hip)),torsoAngle=Math.abs(Math.atan2(shoulder.y-hip.y,shoulder.x-hip.x)*180/Math.PI);return{bodyReady:true,leftFootY:l[27].y,rightFootY:l[28].y,leftKneeFlexionDeg:180-(angle(l[23],l[25],l[27])??180),rightKneeFlexionDeg:180-(angle(l[24],l[26],l[28])??180),trunkLeanDeg:Math.abs(90-torsoAngle),forwardShiftRatio:Math.abs(hip.x-ankle.x)/scale,pelvisTiltDeg:tilt(l[23],l[24]),bodyScale:scale};}
