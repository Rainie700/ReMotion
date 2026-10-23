/**
 * ReMotion — demo therapist workspace seeding.
 *
 * WHY A SCRIPT, NOT seedData.js
 * ---------------------------------------------------------------------------
 * Identity is real Firebase Auth. A user's id is the Firebase UID; on every
 * login storageService.hydrateCloudForUser() REPLACES the local schedules /
 * analysisRecords / therapistPatientRelations / patientAssessments /
 * functionalAssessmentSessions collections with the Firestore docs whose
 * patientId/therapistId == that UID. Demo data must live in Firestore keyed
 * to the real UIDs, which do not exist until the accounts are registered.
 *
 * This script does NOT bypass auth. It signs in with the given credentials
 * (accounts must already exist) using two separate Firebase app instances,
 * resolves both REAL UIDs, and writes through the same collections/shapes
 * the app's own services produce. No fake UID is ever written. XP / level /
 * streak / achievements are NOT written (gamificationEngine derives them).
 * The invitation-code flow is untouched.
 *
 * ONE-TIME HUMAN STEPS (real ReMotion 註冊 screen, no bypass):
 *   1. Register therapist00@gmail.com / 123456 as 復健師 ("Demo 復健師").
 *   2. Register/reuse patient00@gmail.com / 123456 as 患者 ("Demo 患者").
 * Only THESE TWO need Firebase Auth accounts. The other four managed cases
 * are showcase records for the therapist demo (Firestore rules permit an
 * authed user to create relation/schedule/record/assessment docs for any
 * patientId string; publicUsers/{id} cannot be written for a non-account id,
 * so each showcase relation carries its patient's display name inline).
 *
 * THEN:  node scripts/seedDemoAccounts.mjs --reset
 *
 * Credentials may be overridden by env vars. Passwords / tokens / UIDs are
 * never printed. Not executed against the live project from this repo env —
 * verify the printed summary + PART F checklist in-app.
 */

import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, getDocs, deleteDoc, collection, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAYwhhZx_EwJDCkBqydzUlLK3lDU76zU0Y",
  authDomain: "remotion-2026.firebaseapp.com",
  projectId: "remotion-2026",
  storageBucket: "remotion-2026.firebasestorage.app",
  messagingSenderId: "378916857755",
  appId: "1:378916857755:web:058eea87d217553474633e",
};

const PATIENT_EMAIL = process.env.DEMO_PATIENT_EMAIL || "patient00@gmail.com";
const PATIENT_PASSWORD = process.env.DEMO_PATIENT_PASSWORD || "123456";
const THERAPIST_EMAIL = process.env.DEMO_THERAPIST_EMAIL || "therapist00@gmail.com";
const THERAPIST_PASSWORD = process.env.DEMO_THERAPIST_PASSWORD || "123456";
const RESET = process.argv.includes("--reset");

const patientApp = initializeApp(firebaseConfig, "demoPatientApp");
const therapistApp = initializeApp(firebaseConfig, "demoTherapistApp");
const dbP = getFirestore(patientApp);
const dbT = getFirestore(therapistApp);

const iso = (d) => d.toISOString();
const dayStr = (d) => iso(d).slice(0, 10);
function atDaysAgo(n, hour = 10) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

const MARK = "_demo00_"; // every demo doc id contains this → idempotency + --reset

const EX = {
  LE01: { id: "LE01", name: "深蹲", body: "下肢", sets: 3, reps: 15 },
  LE02: { id: "LE02", name: "仰躺直腿抬腿", body: "下肢", sets: 3, reps: 12 },
  LE03: { id: "LE03", name: "橋式", body: "下肢", sets: 3, reps: 10 },
  LE05: { id: "LE05", name: "坐到站", body: "下肢", sets: 3, reps: 10 },
  SH01: { id: "SH01", name: "肩關節擺盪運動", body: "上肢肩部", sets: 3, reps: 10 },
};

const exerciseEntry = (ex, status, analysisRecordId = null, completedAt = null) => ({
  exerciseId: ex.id,
  exerciseName: ex.name,
  targetBodyPart: ex.body,
  sets: ex.sets,
  repetitions: ex.reps,
  durationSeconds: null,
  instructions: `${ex.name}：依復健師指示，動作放慢、量力而為，若不適立即停止。`,
  status,
  analysisRequired: true,
  completedAt,
  analysisRecordId,
  rewardXp: 30,
  rewardStars: 1,
});

function analysisRecord({ id, patientId, therapistId, scheduleId, ex, when, score }) {
  const totalReps = ex.sets * ex.reps;
  const valid = Math.round(totalReps * 0.85);
  return {
    id, patientId, therapistId, scheduleId,
    exerciseId: ex.id, exerciseName: ex.name,
    completedAt: iso(when), capturedAt: iso(when), createdAt: iso(when),
    analysisMode: "mediapipe_squat", source: "assigned",
    totalReps, targetReps: totalReps, validReps: valid,
    score, overallScore: score, quality: score >= 85 ? "good" : "fair",
    remark: "動作大致正確，維持關節與動作方向一致。",
    repRecords: [],
    summary: {
      totalReps, targetReps: totalReps, validReps: valid, qualityValidReps: valid,
      insufficientDepthCount: 0, trunkLeanCount: 0, kneeValgusCount: 0, repsWithTrackingGap: 0,
      averageMinKneeAngle: 92, averageRepDuration: 2600,
    },
  };
}

function relationDoc({ id, therapistId, patientId, demoOrder, patientName, status = "accepted", ...over }) {
  return {
    id, therapistId, patientId, inviteCode: null, status,
    demoOrder, patientName, // additive: deterministic order + inline name for showcase cases
    createdAt: iso(atDaysAgo(35)), acceptedAt: iso(atDaysAgo(35)),
    completedAt: null, completedBy: null, revokedAt: null, revokedBy: null, endReason: null,
    ...over,
  };
}

function assessmentDoc({ id, patientId, bodyParts, goals }) {
  return {
    id, patientId, bodyParts, goals,
    abilityLevel: "intermediate", preferredSessionMinutes: 15,
    createdAt: iso(atDaysAgo(25)), updatedAt: iso(atDaysAgo(25)), assessedAt: iso(atDaysAgo(25)),
    createdBy: patientId, updatedBy: patientId, version: 1, status: "active",
    source: null, functionalAssessmentSessionId: null, bodyRegion: null, problemId: null, assessmentMovementIds: null,
  };
}

async function signIn(app, email, password, label) {
  try {
    const cred = await signInWithEmailAndPassword(getAuth(app), email, password);
    return cred.user.uid;
  } catch (e) {
    console.error(`\n✖ Cannot sign in the ${label} account (${email}): ${e.code || "auth error"}`);
    console.error(`  Register it once via the app's 註冊 screen, then re-run. No auth bypass is performed.\n`);
    process.exit(1);
  }
}

async function deleteDemoBy(db, colName, field, value) {
  const snap = await getDocs(query(collection(db, colName), where(field, "==", value)));
  let n = 0;
  for (const d of snap.docs) if (d.id.includes(MARK)) { await deleteDoc(d.ref); n += 1; }
  return n;
}

async function main() {
  console.log("\nReMotion demo seed — therapist00 workspace");
  const patientUid = await signIn(patientApp, PATIENT_EMAIL, PATIENT_PASSWORD, "patient");
  const therapistUid = await signIn(therapistApp, THERAPIST_EMAIL, THERAPIST_PASSWORD, "therapist");
  console.log("✓ signed in as both accounts; real UIDs resolved (not printed)");

  // ── showcase managed patients (no Firebase Auth account needed) ──────
  const SHOWCASE = [
    { pid: "demo-showcase-patient-01", name: "林怡君", order: 1, bodyParts: ["下肢"],
      today: [["LE05", true, 84], ["LE03", true, 81]], history: [1, 3] },                 // 2 / 2 → 今日已完成
    { pid: "demo-showcase-patient-02", name: "陳冠宇", order: 2, bodyParts: ["下肢"],
      today: [["LE01", false], ["LE03", false], ["LE05", false]], history: [4] },          // 0 / 3 → 今日待訓練
    { pid: "demo-showcase-patient-03", name: "王美玲", order: 3, bodyParts: ["上肢肩部"],
      today: [["SH01", true, 79], ["LE03", false]], history: [2, 4], shoulderFa: "P-SH-02" }, // 1 / 2 → 部分完成
    { pid: "demo-showcase-patient-04", name: "張志豪", order: 4, bodyParts: ["下肢"],
      today: null, history: [1, 2, 4] },                                                   // no schedule today → 近期有訓練
  ];

  if (RESET) {
    let removed = 0;
    // relation / schedule / analysisRecord are keyed by therapistId too
    for (const c of ["therapistPatientRelations", "schedules", "analysisRecords"]) {
      removed += await deleteDemoBy(dbT, c, "therapistId", therapistUid);
    }
    // patientAssessments / functionalAssessmentSessions are keyed by patientId only
    for (const pid of [patientUid, ...SHOWCASE.map((s) => s.pid)]) {
      removed += await deleteDemoBy(dbT, "patientAssessments", "patientId", pid);
      removed += await deleteDemoBy(dbT, "functionalAssessmentSessions", "patientId", pid);
      removed += await deleteDemoBy(dbT, "schedules", "patientId", pid);
      removed += await deleteDemoBy(dbT, "analysisRecords", "patientId", pid);
      removed += await deleteDemoBy(dbT, "therapistPatientRelations", "patientId", pid);
    }
    console.log(`✓ --reset removed ${removed} prior demo docs`);
  } else {
    const rel = await getDocs(query(collection(dbT, "therapistPatientRelations"), where("therapistId", "==", therapistUid)));
    if (rel.docs.some((d) => d.id === `relation${MARK}p0`)) {
      console.log("• demo data already present — nothing to do (use --reset to rebuild).\n");
      process.exit(0);
    }
  }

  // ── profiles ───────────────────────────────────────────────────────
  await setDoc(doc(dbP, "users", patientUid), { name: "Demo 患者", role: "patient", account: PATIENT_EMAIL, email: PATIENT_EMAIL }, { merge: true });
  await setDoc(doc(dbP, "publicUsers", patientUid), { name: "Demo 患者", role: "patient" }, { merge: true });
  await setDoc(doc(dbT, "users", therapistUid), { name: "Demo 復健師", role: "therapist", account: THERAPIST_EMAIL, email: THERAPIST_EMAIL }, { merge: true });
  await setDoc(doc(dbT, "publicUsers", therapistUid), { name: "Demo 復健師", role: "therapist" }, { merge: true });

  // ── RELATIONS FIRST (so a later failure never leaves the therapist unlinked) ──
  await setDoc(doc(dbT, "therapistPatientRelations", `relation${MARK}p0`),
    relationDoc({ id: `relation${MARK}p0`, therapistId: therapistUid, patientId: patientUid, demoOrder: 0, patientName: "Demo 患者" }));
  for (const s of SHOWCASE) {
    await setDoc(doc(dbT, "therapistPatientRelations", `relation${MARK}${s.pid}`),
      relationDoc({ id: `relation${MARK}${s.pid}`, therapistId: therapistUid, patientId: s.pid, demoOrder: s.order, patientName: s.name }));
  }
  // one completed relation for Demo 患者's 照護歷史
  await setDoc(doc(dbT, "therapistPatientRelations", `relation${MARK}p0past`),
    relationDoc({ id: `relation${MARK}p0past`, therapistId: therapistUid, patientId: patientUid, demoOrder: 0, patientName: "Demo 患者",
      status: "completed", createdAt: iso(atDaysAgo(160)), acceptedAt: iso(atDaysAgo(160)),
      completedAt: iso(atDaysAgo(70)), completedBy: therapistUid, endReason: "療程完成" }));
  console.log(`✓ ${1 + SHOWCASE.length} accepted therapist↔patient relations (+ 1 care-history)`);

  let schedules = 0, records = 0, fas = 0;

  // ── Demo 患者 — the real cross-account E2E dataset (today 1 / 3) ─────
  const PLAN = [
    { day: 0, status: "in_progress", title: "今日課表", items: [
        { ex: EX.LE01, done: true, score: 80 }, { ex: EX.SH01, done: false, ip: true }, { ex: EX.LE03, done: false } ] },
    { day: 1, status: "completed", title: "昨日課表", items: [
        { ex: EX.LE01, done: true, score: 76 }, { ex: EX.LE05, done: true, score: 82 } ] },
    { day: 2, status: "completed", title: "前天課表", items: [
        { ex: EX.LE03, done: true, score: 74 }, { ex: EX.SH01, done: true, score: 81 } ] },
    { day: 3, status: "in_progress", title: "3 天前課表", items: [
        { ex: EX.LE01, done: true, score: 78 }, { ex: EX.LE02, done: false }, { ex: EX.LE05, done: true, score: 80 } ] },
    { day: 5, status: "completed", title: "5 天前課表", items: [
        { ex: EX.LE01, done: true, score: 82 }, { ex: EX.LE03, done: true, score: 79 } ] },
  ];
  for (const block of PLAN) {
    const when = atDaysAgo(block.day);
    const sId = `sched${MARK}p0_d${block.day}`;
    const exercises = [];
    for (let i = 0; i < block.items.length; i += 1) {
      const it = block.items[i];
      if (it.done) {
        const rId = `analysis${MARK}p0_d${block.day}_${i}`;
        await setDoc(doc(dbT, "analysisRecords", rId),
          analysisRecord({ id: rId, patientId: patientUid, therapistId: therapistUid, scheduleId: sId, ex: it.ex, when, score: it.score }));
        records += 1;
        exercises.push(exerciseEntry(it.ex, "completed", rId, iso(when)));
      } else {
        exercises.push(exerciseEntry(it.ex, it.ip ? "in_progress" : "pending"));
      }
    }
    await setDoc(doc(dbT, "schedules", sId), {
      id: sId, patientId: patientUid, therapistId: therapistUid, date: dayStr(when),
      title: `${dayStr(when).slice(5).replace("-", "/")} ${block.title}`, status: block.status,
      createdAt: iso(atDaysAgo(block.day, 8)), updatedAt: iso(when), exercises,
    });
    schedules += 1;
  }
  await setDoc(doc(dbT, "patientAssessments", `assessment${MARK}p0`),
    { ...assessmentDoc({ id: `assessment${MARK}p0`, patientId: patientUid, bodyParts: ["下肢", "上肢肩部"], goals: ["肌力", "關節活動度"] }) });
  const p0Fa = `fa${MARK}p0_shoulder`;
  const faSide = (deg) => ({ completed: true, peakROM: { deg }, status: "completed", measurementQuality: { valid: true }, statusReason: null });
  await setDoc(doc(dbT, "functionalAssessmentSessions", p0Fa), {
    id: p0Fa, patientId: patientUid, bodyRegion: "shoulder", status: "completed",
    startedAt: iso(atDaysAgo(8, 11)), completedAt: iso(atDaysAgo(8, 11)),
    problemId: "P-SH-03", protocolMovementIds: ["A01", "A02"],
    movementResults: [
      { movementId: "A01-1", assessmentMovementId: "A01", movementName: "shoulder_flexion", left: faSide(148), right: faSide(139), savedAt: iso(atDaysAgo(8, 11)) },
      { movementId: "A01-2", assessmentMovementId: "A02", movementName: "shoulder_abduction", left: faSide(141), right: faSide(126), savedAt: iso(atDaysAgo(8, 11)) },
    ],
  });
  fas += 1;

  // ── showcase patients ──────────────────────────────────────────────
  const catalog = { LE01: EX.LE01, LE02: EX.LE02, LE03: EX.LE03, LE05: EX.LE05, SH01: EX.SH01 };
  for (const s of SHOWCASE) {
    await setDoc(doc(dbT, "patientAssessments", `assessment${MARK}${s.pid}`),
      assessmentDoc({ id: `assessment${MARK}${s.pid}`, patientId: s.pid, bodyParts: s.bodyParts, goals: ["肌力", "關節活動度"] }));

    // recent history records (so trend + recency logic have real points)
    let hi = 0;
    for (const day of s.history) {
      const when = atDaysAgo(day, 9);
      const ex = s.bodyParts[0] === "上肢肩部" ? EX.SH01 : EX.LE01;
      const rId = `analysis${MARK}${s.pid}_h${hi++}`;
      await setDoc(doc(dbT, "analysisRecords", rId),
        analysisRecord({ id: rId, patientId: s.pid, therapistId: therapistUid, scheduleId: null, ex, when, score: 74 + ((day * 3) % 12) }));
      records += 1;
    }

    // today's schedule (or none)
    if (s.today) {
      const when = atDaysAgo(0);
      const sId = `sched${MARK}${s.pid}_d0`;
      const exercises = [];
      let doneCount = 0;
      for (let i = 0; i < s.today.length; i += 1) {
        const [exId, done, score] = s.today[i];
        const ex = catalog[exId];
        if (done) {
          const rId = `analysis${MARK}${s.pid}_d0_${i}`;
          await setDoc(doc(dbT, "analysisRecords", rId),
            analysisRecord({ id: rId, patientId: s.pid, therapistId: therapistUid, scheduleId: sId, ex, when, score }));
          records += 1;
          doneCount += 1;
          exercises.push(exerciseEntry(ex, "completed", rId, iso(when)));
        } else {
          exercises.push(exerciseEntry(ex, "pending"));
        }
      }
      await setDoc(doc(dbT, "schedules", sId), {
        id: sId, patientId: s.pid, therapistId: therapistUid, date: dayStr(when),
        title: `${dayStr(when).slice(5).replace("-", "/")} 今日課表`,
        status: doneCount === s.today.length ? "completed" : "in_progress",
        createdAt: iso(atDaysAgo(0, 8)), updatedAt: iso(when), exercises,
      });
      schedules += 1;
    } else {
      // 張志豪 — a couple of past (non-today) schedules for the 過去安排 list
      for (const day of [2, 4]) {
        const when = atDaysAgo(day);
        const sId = `sched${MARK}${s.pid}_d${day}`;
        await setDoc(doc(dbT, "schedules", sId), {
          id: sId, patientId: s.pid, therapistId: therapistUid, date: dayStr(when),
          title: `${dayStr(when).slice(5).replace("-", "/")} 課表`, status: "completed",
          createdAt: iso(atDaysAgo(day, 8)), updatedAt: iso(when),
          exercises: [exerciseEntry(EX.LE01, "completed", null, iso(when)), exerciseEntry(EX.LE03, "completed", null, iso(when))],
        });
        schedules += 1;
      }
    }

    if (s.shoulderFa) {
      const faId = `fa${MARK}${s.pid}_shoulder`;
      await setDoc(doc(dbT, "functionalAssessmentSessions", faId), {
        id: faId, patientId: s.pid, bodyRegion: "shoulder", status: "completed",
        startedAt: iso(atDaysAgo(10, 11)), completedAt: iso(atDaysAgo(10, 11)),
        problemId: s.shoulderFa, protocolMovementIds: ["A02"],
        movementResults: [
          { movementId: "A01-2", assessmentMovementId: "A02", movementName: "shoulder_abduction", left: faSide(150), right: faSide(132), savedAt: iso(atDaysAgo(10, 11)) },
        ],
      });
      fas += 1;
    }
  }

  // ── verify: therapist can actually see 5 accepted cases ─────────────
  const check = await getDocs(query(collection(dbT, "therapistPatientRelations"), where("therapistId", "==", therapistUid)));
  const accepted = check.docs.filter((d) => d.id.includes(MARK) && d.data().status === "accepted");
  if (accepted.length < 5) {
    console.error(`\n✖ verification failed: therapist has ${accepted.length} accepted demo relations (expected 5). Re-run with --reset.\n`);
    process.exit(1);
  }

  console.log("\nDemo seed complete");
  console.log(`Therapist: ${THERAPIST_EMAIL}`);
  console.log(`Managed cases: ${accepted.length}`);
  console.log(`Primary linked patient: ${PATIENT_EMAIL}`);
  console.log(`Schedules: ${schedules}`);
  console.log(`Analysis records: ${records}`);
  console.log(`Functional assessments: ${fas}\n`);
  process.exit(0);
}

main().catch((e) => { console.error(e && e.message ? e.message : e); process.exit(1); });
