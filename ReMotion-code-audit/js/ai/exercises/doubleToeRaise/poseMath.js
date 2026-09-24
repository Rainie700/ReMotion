import { computeAnkleDorsiflexionMetrics } from "../ankleDorsiflexion/poseMath.js";
import { AK06_THRESHOLDS as T } from "./constants.js";
const mid=(a,b)=>({x:(a.x+b.x)/2,y:(a.y+b.y)/2});
export function computeDoubleToeRaiseMetrics(landmarks,thresholds=T){const base=computeAnkleDorsiflexionMetrics(landmarks,thresholds);if(!base.bodyReady||!landmarks?.[11]||!landmarks?.[12])return{...base,bodyReady:false};const shoulder=mid(landmarks[11],landmarks[12]),hip=mid(landmarks[23],landmarks[24]),trunkLeanDeg=Math.abs(Math.atan2(shoulder.x-hip.x,Math.max(.001,hip.y-shoulder.y))*180/Math.PI);return{...base,trunkLeanDeg};}
