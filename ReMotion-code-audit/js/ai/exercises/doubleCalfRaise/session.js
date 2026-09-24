import { createCalfRaiseSession } from "../calfRaise/session.js";
import { AK05_THRESHOLDS } from "./constants.js";
export function createDoubleCalfRaiseSession(config={}){return createCalfRaiseSession({...config,thresholds:config.thresholds||AK05_THRESHOLDS});}
