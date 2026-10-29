/**
 * G01 坐站固定練習原型 (pure) — docs/F01_G01_PROGRAM_SELECTION.md 第六節 Decision A.
 *
 * ONE fixed sit-to-stand practice, the same for everyone: the NHS「Strength exercises」sit-to-stand
 * (5 repetitions). Not a personalised recommendation, not the Otago programme, not a prescription.
 * The 5xSTS seconds never choose the content or the amount; nothing here progresses or regresses,
 * and nothing here takes part in tracking cycles, plan completion days or D5.
 *
 * Every text below is either quoted / translated from the checked source (with its URL and review
 * date) or labelled as coming from another source; nothing clinical is added.
 */

export const F01_FIXED_PRACTICE_KIND = "f01_fixed_practice";
export const F01_FIXED_PRACTICE_SCHEMA = "f01-fixed-practice-1";
export const F01_FIXED_PRACTICE_VERSION = "nhs-sit-to-stand-2024-02-28-v1";
export const F01_FIXED_PRACTICE_EXERCISE_ID = "F01-04";

/** The fixed target of this version — the only amount the practice ever uses (never the catalog's 3×8). */
export const F01_FIXED_PRACTICE_TARGET = Object.freeze({ repetitions: 5, sets: null });

export const F01_FIXED_PRACTICE_SOURCE = Object.freeze({
  primary: Object.freeze({
    title: "NHS「Strength exercises」— Sit-to-stand",
    url: "https://www.nhs.uk/live-well/exercise/strength-exercises/",
    reviewed: "2024-02-28",
  }),
  guidelines: Object.freeze({
    title: "NHS「Physical activity guidelines for older adults」",
    url: "https://www.nhs.uk/live-well/exercise/physical-activity-guidelines-older-adults/",
    reviewed: "2024-08-15",
  }),
  sitting: Object.freeze({
    title: "NHS「Sitting exercises」（同系列）",
    url: "https://www.nhs.uk/live-well/exercise/sitting-exercises/",
    reviewed: "2024-01-18",
  }),
  supplementStop: Object.freeze({
    title: "Otago Exercise Programme 手冊（ACC 2007）pp. 16–17",
    url: "https://regionvasterbotten.se/VLL\\Filer\\Otago-Exercise-Programme2.pdf",
    note: "原為由專業人員指導的方案；這裡只借用它的停止提醒，不採用其等級、次數或頻率。",
  }),
});

/** NHS sit-to-stand, steps and chair (translated from the source page). */
export const F01_FIXED_PRACTICE_STEPS = Object.freeze([
  "坐在椅子前緣，雙腳與髖同寬，身體稍微前傾。",
  "用腿、不用手臂，慢慢站起來；眼睛看前方，不要往下看。",
  "站直後慢慢坐下；如果可以，手或手臂只用來引導。",
]);
export const F01_FIXED_PRACTICE_AMOUNT_TEXT = "目標 5 次。來源說：動作越慢越好。";
export const F01_FIXED_PRACTICE_PACE_TEXT = "動作越慢越好。";
export const F01_FIXED_PRACTICE_CHAIR = Object.freeze([
  "選擇穩固、沒有輪子的椅子。",
  "坐下時雙腳平放在地上，膝蓋約成直角。",
  "避免有扶手的椅子（來源說扶手會限制動作）。",
]);
/** NHS frequency — for the whole series, never presented as met by this single exercise. */
export const F01_FIXED_PRACTICE_FREQUENCY_TEXT = "NHS 建議這個系列的運動至少每週做兩次，並搭配同系列其他動作一起做。這裡只提供其中的坐姿起立一個動作；只做這一個動作，不代表已符合完整的運動建議。";

/** Before use — NHS (kept apart from the supplementary stop reminder below). */
export const F01_FIXED_PRACTICE_BEFORE_USE = Object.freeze([
  { text: "如果你有一段時間沒有運動，或有醫療狀況或疑慮，請先詢問醫師（GP）。", source: "guidelines" },
  { text: "如果不確定這些運動是否適合你，請詢問醫師或照護你的醫療人員。", source: "sitting" },
]);
/** Stop reminder — NOT from the NHS pages (they have none); labelled as from Otago. */
export const F01_FIXED_PRACTICE_STOP_REMINDER = Object.freeze([
  "如果有關節炎等會痛的情況，請在不痛的範圍內練習。",
  "出現暈眩、胸痛、喘不過氣，或肌肉疼痛一直不退時，請停止並聯絡醫師。",
]);

export const F01_FIXED_PRACTICE_FIXED_NOTE = "本版內容固定，每個人相同。你的五次坐站秒數沒有用來決定這個動作或次數，也不會因此自動調整。";
/** The camera's limit in plain words (patient screens). */
export const F01_FIXED_PRACTICE_LIMIT_TEXT = "相機協助計次，無法確認是否使用手部支撐。";
export const F01_FIXED_PRACTICE_COUNT_NOTE = `${F01_FIXED_PRACTICE_LIMIT_TEXT}計入的次數不代表動作品質合格；無法確認的動作不會計入。`;
/**
 * 使用前提醒 on the patient screen — plain restatements of CHAIR, BEFORE_USE and STOP_REMINDER above
 * (nothing added). Which source each line comes from is kept in docs/F01_G01_PROGRAM_SELECTION.md 6-3 (7),
 * not on the patient screen.
 */
export const F01_FIXED_PRACTICE_REMINDERS = Object.freeze([
  "使用穩固、沒有輪子、沒有扶手的椅子；坐下時雙腳平放，膝蓋約成直角。",
  "如果很久沒有運動、有醫療狀況，或不確定是否適合你，請先詢問醫師或照護你的醫療人員。",
  "關節會痛時，只在不痛的範圍內練習。",
  "出現暈眩、胸痛、喘不過氣，或肌肉疼痛一直不退時，請停止並聯絡醫師。",
  "這是單一動作的練習，不等於完整的運動建議。",
]);
export const F01_FIXED_PRACTICE_READ_LABEL = "我已閱讀以上說明";
export const F01_FIXED_PRACTICE_READ_NOTE = "勾選只代表你已閱讀，不代表系統已確認安全、適合你或通過評估。";

const RUN_ID = /^[A-Za-z0-9_-]{8,64}$/;
/** One record per run: the id is fixed at start, so a retry re-sends the same document (never a second one). */
export const fixedPracticeRecordId = (patientId, runId) =>
  typeof patientId === "string" && patientId && !patientId.includes("/") && RUN_ID.test(runId || "") ? `f01FixedPractice_${patientId}_${runId}` : null;

const count = (n) => Number.isInteger(n) && n >= 0 && n <= 1000;

/**
 * The AI part of a run, from the LE05 session summary (already the fixed counting of F01-04). Unconfirmed
 * attempts are kept as their own number and never added to the count.
 */
export function buildFixedPracticeAi(summary, { endedEarly }) {
  const s = summary || {};
  const counted = count(s.totalReps) ? s.totalReps : 0;
  return {
    method: "ai_pose",
    countedReps: counted,
    targetReached: counted >= F01_FIXED_PRACTICE_TARGET.repetitions,
    endedEarly: !!endedEarly && counted < F01_FIXED_PRACTICE_TARGET.repetitions,
    unconfirmedAttemptCount: count(s.unconfirmedAttemptCount) ? s.unconfirmedAttemptCount : 0,
    unconfirmedReasons: Array.isArray(s.unconfirmedAttempts) ? s.unconfirmedAttempts.map((a) => String(a.reason)).slice(0, 50) : [],
    longCycleRepCount: count(s.longCycleRepCount) ? s.longCycleRepCount : 0,
    abortedRiseCount: count(s.abortedRiseCount) ? s.abortedRiseCount : 0,
    handSupportVerified: false,
  };
}

/**
 * A fixed-practice record (one run). `ai` is the camera count (null when the run was self-reported only);
 * `selfReport` is the person's own number, stored apart and never added to `ai`.
 */
export function buildFixedPracticeRecord({ patientId, runId, exerciseName, instructionsReadAt, startedAt, completedAt, dateKey, ai = null, selfReport = null, emulatorSynthetic = false }) {
  const id = fixedPracticeRecordId(patientId, runId);
  if (!id) return { error: "invalid_run" };
  if (typeof instructionsReadAt !== "string" || !instructionsReadAt) return { error: "instructions_not_read" };
  if (ai == null && selfReport == null) return { error: "nothing_to_record" };
  if (selfReport != null && !(count(selfReport.totalReps))) return { error: "invalid_self_report" };
  return {
    record: {
      id,
      kind: F01_FIXED_PRACTICE_KIND,
      schemaVersion: F01_FIXED_PRACTICE_SCHEMA,
      programVersion: F01_FIXED_PRACTICE_VERSION,
      sourceRef: F01_FIXED_PRACTICE_SOURCE.primary.url,
      patientId,
      exerciseId: F01_FIXED_PRACTICE_EXERCISE_ID,
      exerciseName: exerciseName || "坐姿起立",
      target: { ...F01_FIXED_PRACTICE_TARGET },
      instructionsReadAt,
      startedAt: startedAt || completedAt,
      completedAt,
      dateKey,
      ai: ai ? { ...ai, unconfirmedReasons: [...ai.unconfirmedReasons] } : null,
      selfReport: selfReport ? { totalReps: selfReport.totalReps, reportedAt: selfReport.reportedAt, source: "self_report" } : null,
      createdAt: completedAt,
      updatedAt: completedAt,
      // local browser checks only: the AI input was synthetic (never real camera recognition)
      ...(emulatorSynthetic ? { emulatorSynthetic: true } : {}),
    },
  };
}

/** Display lines of one record — AI and self-report on separate lines, never summed. */
export function describeFixedPracticeRecord(record) {
  const r = record || {};
  const lines = [];
  if (r.ai) {
    lines.push(`AI 計次：${r.ai.countedReps} / ${r.target ? r.target.repetitions : F01_FIXED_PRACTICE_TARGET.repetitions} 次${r.ai.endedEarly ? "（提早結束）" : r.ai.targetReached ? "（達到本次目標）" : ""}`);
    if (r.ai.unconfirmedAttemptCount) lines.push(`另有 ${r.ai.unconfirmedAttemptCount} 次動作無法確認，沒有計入`);
  } else {
    lines.push("AI 計次：本次沒有使用相機");
  }
  lines.push(r.selfReport ? `自行回報：${r.selfReport.totalReps} 次（本人填寫，與 AI 計次分開）` : "自行回報：未填寫");
  return lines;
}
