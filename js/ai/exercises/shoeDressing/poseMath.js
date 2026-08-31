import{AD03_REQUIRED_LANDMARKS as R,AD03_THRESHOLDS as T}from"./constants.js";
const ok=(p,m)=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&(p.visibility??1)>=m;
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b,c)=>{const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y},d=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);return d?Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/d)))*180/Math.PI:null};
const lineAngle=(a,b)=>Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);
export function computeShoeDressingMetrics(l,t=T){const bodyReady=Array.isArray(l)&&R.every(i=>ok(l[i],t.MIN_VISIBILITY));if(!bodyReady)return{bodyReady:false};const shoulder=mid(l[11],l[12]),hip=mid(l[23],l[24]),scale=Math.max(.04,dist(shoulder,hip)),trunkLeanDeg=Math.abs(90-lineAngle(hip,shoulder));const floorY=Math.max(l[27].y,l[28].y);return{bodyReady:true,leftFootLiftRatio:(floorY-l[27].y)/scale,rightFootLiftRatio:(floorY-l[28].y)/scale,leftHipFlexionDeg:180-(angle(l[11],l[23],l[25])??180),rightHipFlexionDeg:180-(angle(l[12],l[24],l[26])??180),leftHandFootRatio:Math.min(dist(l[15],l[27]),dist(l[16],l[27]))/scale,rightHandFootRatio:Math.min(dist(l[15],l[28]),dist(l[16],l[28]))/scale,trunkLeanDeg,shoulderTiltDeg:Math.min(lineAngle(l[11],l[12]),180-lineAngle(l[11],l[12])),pelvisTiltDeg:Math.min(lineAngle(l[23],l[24]),180-lineAngle(l[23],l[24]))};}
