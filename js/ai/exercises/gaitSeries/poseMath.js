const visible=(p,min)=>!!p&&(p.visibility??1)>=min;
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const lineAngle=(a,b)=>Math.abs(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI);
export function computeGaitMetrics(l,t={MIN_VISIBILITY:.5}){
 const ids=[11,12,15,16,23,24,25,26,27,28],bodyReady=ids.every(i=>visible(l?.[i],t.MIN_VISIBILITY));
 if(!bodyReady)return{bodyReady:false};
 const ls=l[11],rs=l[12],lw=l[15],rw=l[16],lh=l[23],rh=l[24],la=l[27],ra=l[28];
 const shoulderMid={x:(ls.x+rs.x)/2,y:(ls.y+rs.y)/2},hipMid={x:(lh.x+rh.x)/2,y:(lh.y+rh.y)/2};
 const bodyScale=Math.max(.05,dist(shoulderMid,hipMid));
 return{bodyReady:true,bodyScale,leftFootLiftRatio:(ra.y-la.y)/bodyScale,rightFootLiftRatio:(la.y-ra.y)/bodyScale,leftAnkleY:la.y,rightAnkleY:ra.y,centerX:hipMid.x,centerY:hipMid.y,shoulderTiltDeg:lineAngle(ls,rs),pelvisTiltDeg:lineAngle(lh,rh),trunkLeanDeg:Math.abs(Math.atan2(hipMid.x-shoulderMid.x,hipMid.y-shoulderMid.y)*180/Math.PI),leftArmHeight:Math.abs(lw.y-ls.y)/bodyScale,rightArmHeight:Math.abs(rw.y-rs.y)/bodyScale};
}
