import{AD05_REQUIRED_LANDMARKS as R,AD05_THRESHOLDS as T}from"./constants.js";
const ok=(p,m)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=m;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const tilt=(a,b)=>{const x=Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);return Math.min(x,180-x)};
export function computeTurningWalkMetrics(l,t=T){const bodyReady=Array.isArray(l)&&R.every(i=>ok(l[i],t.MIN_VISIBILITY));if(!bodyReady)return{bodyReady:false};const shoulder=mid(l[11],l[12]),hip=mid(l[23],l[24]),scale=Math.max(.04,dist(shoulder,hip)),torsoAngle=Math.abs(Math.atan2(shoulder.y-hip.y,shoulder.x-hip.x)*180/Math.PI),zSignal=Number.isFinite(l[11].z)&&Number.isFinite(l[12].z)?(l[11].z-l[12].z)/scale:0;return{bodyReady:true,shoulderWidthRatio:dist(l[11],l[12])/scale,hipWidthRatio:dist(l[23],l[24])/scale,centerX:(shoulder.x+hip.x)/2,trunkLeanDeg:Math.abs(90-torsoAngle),pelvisTiltDeg:tilt(l[23],l[24]),stepWidthRatio:dist(l[27],l[28])/scale,orientationSignal:zSignal};}
