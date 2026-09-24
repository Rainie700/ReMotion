import { computeAnkleDorsiflexionMetrics } from "../ankleDorsiflexion/poseMath.js";
import { AK08_THRESHOLDS as T } from "./constants.js";
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export function computeSingleLegToeRaiseMetrics(l,t=T){const base=computeAnkleDorsiflexionMetrics(l,t);if(!base.bodyReady||!l?.[11]||!l?.[12])return{...base,bodyReady:false};const shoulder=mid(l[11],l[12]),hip=mid(l[23],l[24]),bodyScale=Math.max(.08,Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y)*2),trunkLeanDeg=Math.abs(Math.atan2(shoulder.x-hip.x,Math.max(.001,hip.y-shoulder.y))*180/Math.PI);return{...base,pelvisTiltRatio:Math.abs(l[23].y-l[24].y)/bodyScale,trunkLeanDeg};}
