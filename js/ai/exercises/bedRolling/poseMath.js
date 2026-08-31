import{AD01_REQUIRED_LANDMARKS as R,AD01_THRESHOLDS as T}from"./constants.js";
const ok=(p,min)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=min;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b,c)=>{const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y},d=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);if(!d)return null;return Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/d)))*180/Math.PI};
export function computeBedRollingMetrics(l,t=T){
  const bodyReady=Array.isArray(l)&&R.every(i=>ok(l[i],t.MIN_VISIBILITY));
  if(!bodyReady)return{bodyReady:false};
  const shoulderWidth=dist(l[11],l[12]),hipWidth=dist(l[23],l[24]),torso=Math.max(.04,(dist(l[11],l[23])+dist(l[12],l[24]))/2);
  const leftKnee=angle(l[23],l[25],l[27]),rightKnee=angle(l[24],l[26],l[28]);
  const centerX=(l[11].x+l[12].x+l[23].x+l[24].x)/4;
  const noseOffset=(l[0].x-centerX)/torso;
  return{bodyReady:true,shoulderWidthRatio:shoulderWidth/torso,hipWidthRatio:hipWidth/torso,leftKneeFlexionDeg:leftKnee==null?null:180-leftKnee,rightKneeFlexionDeg:rightKnee==null?null:180-rightKnee,noseOffset,centerX,torsoScale:torso};
}
