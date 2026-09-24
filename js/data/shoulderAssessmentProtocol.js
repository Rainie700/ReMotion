/**
 * ReMotion Phase 7.4.1 — Shoulder Assessment: Patient Problem / Assessment
 * Protocol / Assessment Movement.
 *
 * Pure, DOM-free, app.js-free data + resolution logic. GEOMETRY/measurement
 * is untouched by this module — it only decides ROUTING. See
 * js/ai/exercises/shoulder/{flexionMovement,abductionMovement}.js for the
 * measurement engines this routes to; this module never imports them.
 *
 * *** THREE SEPARATE CONCEPTS — never collapsed ***
 *
 *   1. PATIENT PROBLEM  (internal ids P-SH-01 .. P-SH-04)
 *        What the patient reports — the menu cards. Patient-facing `title`
 *        is natural language; the P-SH-* ids are INTERNAL and must never
 *        be rendered to a patient.
 *
 *   2. ASSESSMENT PROTOCOL
 *        The ordered list of Assessment Movements a Problem resolves to.
 *        Data-driven (problem.protocolMovementIds), never `if problem ===`
 *        branching in app.js.
 *
 *   3. ASSESSMENT MOVEMENT  (conceptual ids A01 / A02 / A03)
 *        A01 = Shoulder Flexion   / 肩關節前舉
 *        A02 = Shoulder Abduction / 肩關節外展
 *        A03 = Shoulder Shrug     / 肩部抬舉   (NOT implemented this task)
 *
 * *** LEGACY STORAGE COMPATIBILITY ***
 * Existing sessions / Firebase docs / tests persist
 * `movementResults[].movementId` as the pre-P-SH strings "A01-1" (Flexion)
 * and "A01-2" (Abduction). This task does NOT rename or migrate that. The
 * CONCEPTUAL Assessment Movement id (A01/A02) is kept SEPARATE from the
 * legacy storage id; app.js keeps persisting the legacy string and
 * additionally records `assessmentMovementId` as a new, non-breaking field.
 *
 *     conceptual A01 (Flexion)    <->  legacy storage movementId "A01-1"
 *     conceptual A02 (Abduction)  <->  legacy storage movementId "A01-2"
 *     conceptual A03 (Shrug)      <->  (no persisted data — not implemented)
 *
 * Patient Problem != Disease: `title`s describe an OBSERVABLE FUNCTIONAL
 * DIFFICULTY, never a diagnosis (no 五十肩 / 肩袖 / 關節炎 / …).
 */

// V1 side order is fixed: RIGHT measured, then LEFT. The patient never
// selects a side; app.js drives this sequence automatically.
export const SHOULDER_SIDE_ORDER = ["RIGHT", "LEFT"];

/** Returns the side after `currentSide` in SHOULDER_SIDE_ORDER, or null once the sequence is exhausted (or the input is unrecognized). */
export function getNextShoulderSide(currentSide) {
  const idx = SHOULDER_SIDE_ORDER.indexOf(currentSide);
  if (idx === -1 || idx === SHOULDER_SIDE_ORDER.length - 1) return null;
  return SHOULDER_SIDE_ORDER[idx + 1];
}

/**
 * Conceptual Assessment Movement registry. `key` links to app.js's UI
 * catalog + measurement adapter; `legacyStorageMovementId` is the string
 * still persisted (unchanged); `implemented` gates startability so an
 * unbuilt movement (A03) can be referenced by a Protocol without making
 * that Protocol runnable.
 */
export const SHOULDER_ASSESSMENT_MOVEMENTS = [
  { assessmentMovementId: "A01", key: "shoulder_flexion", label: "肩關節前舉", legacyStorageMovementId: "A01-1", implemented: true },
  { assessmentMovementId: "A02", key: "shoulder_abduction", label: "肩關節外展", legacyStorageMovementId: "A01-2", implemented: true },
  { assessmentMovementId: "A03", key: "shoulder_shrug", label: "肩部抬舉", legacyStorageMovementId: null, implemented: false },
];

export function getShoulderAssessmentMovement(assessmentMovementId) {
  return SHOULDER_ASSESSMENT_MOVEMENTS.find((m) => m.assessmentMovementId === assessmentMovementId) || null;
}

/**
 * Patient Problems (the menu). `title` is the ONLY patient-facing string;
 * `assessmentLabel` names the resulting assessment in Intro/Complete copy;
 * `protocolMovementIds` is the ordered Assessment Protocol (conceptual
 * A01/A02/A03 ids). `startable:false` + `unavailableLabel` mark a listed-
 * but-disabled problem.
 */
export const SHOULDER_PROBLEMS = [
  {
    problemId: "P-SH-01",
    title: "往前抬高手臂時不順或抬不高",
    assessmentLabel: "肩關節前舉",
    protocolMovementIds: ["A01"],
    startable: true,
  },
  {
    problemId: "P-SH-02",
    title: "往側邊抬高手臂時不順或抬不高",
    assessmentLabel: "肩關節外展",
    protocolMovementIds: ["A02"],
    startable: true,
  },
  {
    problemId: "P-SH-03",
    title: "往前、往側邊抬手都有困擾",
    assessmentLabel: "肩部抬手活動",
    protocolMovementIds: ["A01", "A02"],
    startable: true,
  },
  {
    problemId: "P-SH-04",
    title: "聳肩時僵硬或左右感覺不一樣",
    assessmentLabel: "肩部抬舉活動",
    protocolMovementIds: ["A03"],
    // Shoulder Shrug (A03) has no detector yet — listed for future
    // scalability, never wired to a working onclick.
    startable: false,
    unavailableLabel: "功能建置中",
  },
];

export function getShoulderProblem(problemId) {
  return SHOULDER_PROBLEMS.find((p) => p.problemId === problemId) || null;
}

/**
 * Resolves a Patient Problem's Protocol (conceptual A01/A02/A03 ids) into
 * the ordered app.js UI catalog entries. `uiCatalog` is app.js's
 * FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS, passed in so this module never
 * imports app.js. A movement that is not implemented, or has no
 * `assessmentMovementId` match in the catalog (A03 today), is silently
 * skipped — a Protocol may reference a not-yet-built movement without
 * breaking navigation; it just resolves to a shorter (possibly empty)
 * list. Order is preserved exactly as `protocolMovementIds`.
 */
export function resolveProtocolMovements(problemId, uiCatalog) {
  const problem = getShoulderProblem(problemId);
  if (!problem || !Array.isArray(uiCatalog)) return [];
  return problem.protocolMovementIds
    .map((amId) => {
      const registry = getShoulderAssessmentMovement(amId);
      if (!registry || registry.implemented === false) return null;
      return uiCatalog.find((m) => m.assessmentMovementId === amId) || null;
    })
    .filter(Boolean);
}

/**
 * Single source of truth for "can this Patient Problem be started right
 * now": it must exist, be `startable:true`, AND every movement in its
 * Protocol must fully resolve (implemented + present in the catalog). This
 * is what lets P-SH-04 flip from disabled to active later purely by
 * setting `startable:true`, marking A03 `implemented:true`, and adding an
 * A03 catalog entry in app.js — no change to this function or the menu.
 */
export function isShoulderProblemStartable(problemId, uiCatalog) {
  const problem = getShoulderProblem(problemId);
  if (!problem || problem.startable !== true) return false;
  const resolved = resolveProtocolMovements(problemId, uiCatalog);
  return resolved.length > 0 && resolved.length === problem.protocolMovementIds.length;
}

/**
 * Movement + side voice wording. Pure data only — no TTS, no dedup, no
 * cooldown, no DOM; app.js's speakShoulderMovementVoice() owns all of that
 * and reads through getShoulderMovementVoiceLine() below. `movementAck` /
 * `endpoint` / `rightComplete` / `movementDone` are side-independent
 * (plain strings); `orientation` / `ready` / `begin` / `stalled` are
 * side-keyed (RIGHT/LEFT read different text).
 */
export const SHOULDER_FRAMING_LOSS_VOICE = "目前無法完整偵測上半身，請調整站位。";

export const SHOULDER_MOVEMENT_VOICE = {
  shoulder_flexion: {
    orientation: { RIGHT: "請以右側身面向鏡頭。", LEFT: "請轉身，讓左側身面向鏡頭。" },
    ready: { RIGHT: "準備完成，現在測量右側肩膀。", LEFT: "準備完成，現在測量左側肩膀。" },
    begin: { RIGHT: "請將右手慢慢向前抬起。", LEFT: "請將左手慢慢向前抬起。" },
    movementAck: "很好，繼續慢慢向上。",
    endpoint: "已記錄，請慢慢放下。",
    rightComplete: "右側完成。請轉身，讓左側身面向鏡頭。",
    movementDone: "肩關節前舉評估完成。",
    stalled: { RIGHT: "還沒偵測到動作，請將右手慢慢向前抬起。", LEFT: "還沒偵測到動作，請將左手慢慢向前抬起。" },
  },
  shoulder_abduction: {
    orientation: { RIGHT: "請正面面向鏡頭。", LEFT: "請保持正面面向鏡頭。" },
    ready: { RIGHT: "準備完成，現在測量右側肩膀。", LEFT: "準備完成，現在測量左側肩膀。" },
    begin: { RIGHT: "請將右手從身體側邊慢慢向上抬起。", LEFT: "請將左手從身體側邊慢慢向上抬起。" },
    movementAck: "很好，繼續慢慢向上。",
    endpoint: "已記錄，請慢慢放下。",
    rightComplete: "右側完成，接下來測量左側。",
    movementDone: "肩關節外展評估完成。",
    stalled: { RIGHT: "還沒偵測到動作，請將右手從身體側邊慢慢向上抬起。", LEFT: "還沒偵測到動作，請將左手從身體側邊慢慢向上抬起。" },
  },
};

/**
 * Pure lookup: the exact voice text for (movementKey, stateKey, side), or
 * null if unknown / not applicable (e.g. a side-keyed state with no side,
 * or an unrecognized movement/state). Never throws.
 */
export function getShoulderMovementVoiceLine(movementKey, stateKey, side) {
  const table = SHOULDER_MOVEMENT_VOICE[movementKey];
  if (!table) return null;
  const entry = table[stateKey];
  if (entry == null) return null;
  if (typeof entry === "string") return entry;
  return side ? entry[side] || null : null;
}
