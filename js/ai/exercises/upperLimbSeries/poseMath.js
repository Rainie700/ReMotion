const vis=(p,m)=>!!p&&(p.visibility??1)>=m;
const d=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const angle=(a,b,c)=>{const u={x:a.x-b.x,y:a.y-b.y},v={x:c.x-b.x,y:c.y-b.y},den=Math.hypot(u.x,u.y)*Math.hypot(v.x,v.y);if(!den)return null;return Math.acos(Math.max(-1,Math.min(1,(u.x*v.x+u.y*v.y)/den)))*180/Math.PI};
const line=(a,b)=>Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);
export function computeUpperLimbMetrics(l,t={MIN_VISIBILITY:.5}){
 const ids=[11,12,13,14,15,16,23,24,27,28],bodyReady=ids.every(i=>vis(l?.[i],t.MIN_VISIBILITY));if(!bodyReady)return{bodyReady:false};
 const [ls,rs,le,re,lw,rw,lh,rh,la,ra]=ids.map(i=>l[i]),sm={x:(ls.x+rs.x)/2,y:(ls.y+rs.y)/2},hm={x:(lh.x+rh.x)/2,y:(lh.y+rh.y)/2},bodyScale=Math.max(.05,d(sm,hm));
 return{bodyReady:true,bodyScale,leftElbowAngle:angle(ls,le,lw),rightElbowAngle:angle(rs,re,rw),leftShoulderAngle:angle(lh,ls,le),rightShoulderAngle:angle(rh,rs,re),leftElbowDrift:d(le,ls)/bodyScale,rightElbowDrift:d(re,rs)/bodyScale,wristSeparation:Math.abs(lw.x-rw.x)/bodyScale,leftWristX:lw.x,rightWristX:rw.x,leftAnkleX:la.x,rightAnkleX:ra.x,leftAnkleY:la.y,rightAnkleY:ra.y,centerX:hm.x,shoulderTiltDeg:line(ls,rs),pelvisTiltDeg:line(lh,rh),trunkLeanDeg:Math.abs(Math.atan2(hm.x-sm.x,hm.y-sm.y)*180/Math.PI)};
}
