import{AK02_REQUIRED_LANDMARKS as R,AK02_THRESHOLDS as T}from"./constants.js";
const ok=(p,m)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=m;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b,c)=>{const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y},d=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);return d?Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/d)))*180/Math.PI:null};
const side=(l,s)=>{const i=s==="left"?{h:23,k:25,a:27,heel:29,toe:31}:{h:24,k:26,a:28,heel:30,toe:32},scale=Math.max(.04,dist(l[i.k],l[i.a])),ankle=angle(l[i.k],l[i.a],l[i.toe]),knee=angle(l[i.h],l[i.k],l[i.a]),ankleZ=Number.isFinite(l[i.a].z)?l[i.a].z:0,toeZ=Number.isFinite(l[i.toe].z)?l[i.toe].z:0;return{[s+"HeelRiseRatio"]:(l[i.toe].y-l[i.heel].y)/scale,[s+"PlantarflexionDeg"]:Math.max(0,(ankle||90)-90),[s+"KneeFlexionDeg"]:Math.max(0,180-(knee||180)),[s+"ToeX"]:l[i.toe].x,[s+"AnkleRollRatio"]:Math.abs(toeZ-ankleZ)/scale,[s+"LegScale"]:scale};};
export function computeAnklePlantarflexionMetrics(l,t=T){const bodyReady=Array.isArray(l)&&R.every(i=>ok(l[i],t.MIN_VISIBILITY));if(!bodyReady)return{bodyReady:false};const hip=mid(l[23],l[24]),ankle=mid(l[27],l[28]),scale=Math.max(.04,dist(hip,ankle));return{bodyReady:true,...side(l,"left"),...side(l,"right"),pelvisCenterX:hip.x,pelvisScale:scale};}
