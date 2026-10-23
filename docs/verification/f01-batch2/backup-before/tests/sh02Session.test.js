import assert from "node:assert/strict";
import { createExternalIsometricSession } from "../js/ai/exercises/shoulderExternalIsometric/session.js";
import { calculateExternalIsometricScore } from "../js/ai/exercises/shoulderExternalIsometric/score.js";
const session=createExternalIsometricSession({targetReps:1,thresholds:{HOLD_DURATION_MS:600,REST_DURATION_MS:100,ELBOW_ANGLE_MIN:80,ELBOW_ANGLE_MAX:100,ELBOW_TORSO_MAX_RATIO:.22,WRIST_MOVEMENT_MAX_RATIO:.07,TORSO_ROTATION_MAX_DEG:10,SHRUG_MAX_RATIO:.055}});
for(let t=0;t<=800;t+=100)session.processFrame({timestamp:t,leftElbowAngle:90,rightElbowAngle:120,leftElbowTorsoRatio:.15,rightElbowTorsoRatio:.3,leftWrist:{x:.4,y:.5},rightWrist:{x:.7,y:.5},torsoRotationDeg:2,shrugRatio:.01,bodyScale:.5,bodyReady:true});
const s=session.getSummary();assert.equal(s.totalReps,1);assert.equal(s.validReps,1);assert.equal(calculateExternalIsometricScore(s).score,100);console.log("SH02 isometric session tests passed");
