import{AK04_REQUIRED_LANDMARKS as R,AK04_THRESHOLDS as T}from"./constants.js";
const ok=(p,m)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=m;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const side=(l,s)=>{const i=s==="left"?{k:25,a:27,h:29,t:31}:{k:26,a:28,h:30,t:32},scale=Math.max(.04,dist(l[i.k],l[i.a]));return{[s+"FootAxisRatio"]:(l[i.t].x-l[i.h].x)/scale,[s+"FootLengthRatio"]:Math.max(.05,dist(l[i.h],l[i.t])/scale),[s+"HeelX"]:l[i.h].x,[s+"KneeX"]:l[i.k].x,[s+"LegScale"]:scale};};
export function computeAnkleEversionMetrics(l,t=T){const bodyReady=Array.isArray(l)&&R.every(i=>ok(l[i],t.MIN_VISIBILITY));if(!bodyReady)return{bodyReady:false};const hip=mid(l[23],l[24]),ankle=mid(l[27],l[28]),scale=Math.max(.04,dist(hip,ankle));return{bodyReady:true,...side(l,"left"),...side(l,"right"),pelvisCenterX:hip.x,pelvisScale:scale};}
