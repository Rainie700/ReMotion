import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion Phase 7.4 (L3) — static-source regression guards for the
 * Shoulder Assessment UX/IA CORE slice.
 *
 * app.js is a single ~11k-line browser module (imports @mediapipe /
 * firebase, executes DOM code) — the project has NO DOM test harness
 * (no jsdom / testing-library), and zero precedent for unit-testing any
 * app.js page. These assertions therefore inspect the SOURCE for the
 * structural invariants this slice must hold (route wired, dev controls
 * gated, mirror is CSS-only, orchestration is protocol-driven not
 * hardcoded). Full rendered-DOM / camera / voice behaviour is covered by
 * the manual verification handoff.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const stylesCss = readFileSync(join(root, "styles.css"), "utf8");

// ── A. IA: Problem Menu is a real route between "肩部" and the assessment ──
assert.ok(
  /state\.route === "functionalAssessmentShoulderProblem"\) app\.innerHTML = phone\(functionalAssessmentShoulderProblemPage\(\)/.test(appJs),
  "functionalAssessmentShoulderProblem route is dispatched in render()"
);
assert.ok(
  /function functionalAssessmentShoulderProblemPage\(\)/.test(appJs) &&
    appJs.includes("目前哪一種肩部活動最困擾你？") &&
    appJs.includes("選擇最符合目前狀況的描述，系統會安排相對應的動作評估。"),
  "Problem Menu page has the required heading + supporting text"
);
// Patient-facing menu copy must not leak any internal id. Check the HTML
// that is actually EMITTED (template-literal returns), not code comments.
{
  const sliceFnBody = (needle) => {
    const at = appJs.indexOf(needle);
    const end = appJs.indexOf("\n}", at);
    return appJs.slice(at, end === -1 ? at + 4000 : end);
  };
  const stripComments = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const pageEmitted = stripComments(sliceFnBody("function functionalAssessmentShoulderProblemPage()"));
  const cardEmitted = stripComments(sliceFnBody("function renderShoulderProblemCard("));

  for (const banned of ["problem.problemId｜", "P-SH-", "A01", "A02", "A03", "protocol"]) {
    assert.ok(!pageEmitted.includes(banned), `Problem Menu page must not render "${banned}"`);
    assert.ok(!cardEmitted.includes(banned), `problem card must not render "${banned}"`);
  }
  // problem.problemId may appear ONLY inside the onclick handler, never as text.
  const displayHits = cardEmitted.split("${problem.problemId}").length - 1;
  const onclickHits = cardEmitted.split("selectShoulderProblem('${problem.problemId}')").length - 1;
  assert.equal(displayHits, onclickHits, "problem.problemId appears ONLY inside onclick, never in visible text");
  assert.ok(/<b>\$\{problem\.title\}<\/b>/.test(cardEmitted), "the card shows problem.title (natural language) only");
}
{
  const at = appJs.indexOf("function selectFunctionalAssessmentBodyRegion(region)");
  assert.ok(at !== -1);
  const body = appJs.slice(at, appJs.indexOf("\n}", at));
  assert.ok(
    body.includes('state.route = "functionalAssessmentShoulderProblem"'),
    "selecting 肩部 routes to the Problem Menu, NOT straight into the assessment"
  );
  assert.ok(
    !body.includes('state.route = "functionalAssessmentShoulderPrep"'),
    "region select no longer jumps directly to Prep"
  );
}

// ── A01 card is actually CLICKABLE end-to-end (regression: the inline
//    onclick handlers must be exposed to global scope — app.js is an ES
//    module, so module-scoped functions are NOT reachable from onclick="").
{
  const proto = readFileSync(join(root, "js/data/shoulderAssessmentProtocol.js"), "utf8");
  // 1. A01 is startable at runtime -> renderShoulderProblemCard emits the clickable branch.
  //    (the pure runtime check is in shoulderAssessmentProtocol.test.js; here we pin the wiring.)
  const cardFn = appJs.slice(appJs.indexOf("function renderShoulderProblemCard("));
  const cardBody = cardFn.slice(0, cardFn.indexOf("\n}") + 2);
  assert.ok(
    /if \(startable\) \{[\s\S]*?onclick="selectShoulderProblem\('\$\{problem\.problemId\}'\)"/.test(cardBody),
    "the startable branch of the problem card carries onclick=\"selectShoulderProblem('...')\""
  );
  assert.ok(
    /if \(startable\) \{[\s\S]*?\}\s*[\s\S]*?return `<div class="card functional-assessment-problem-card disabled" aria-disabled="true">/.test(cardBody),
    "the non-startable branch has NO onclick (disabled + aria-disabled)"
  );
  // 2. every inline-onclick handler used by the Problem Menu / Prep / fallback
  //    must be assigned to window (otherwise the click is a ReferenceError).
  for (const fn of [
    "selectShoulderProblem",
    "goFunctionalAssessmentShoulderProblem",
    "goFunctionalAssessmentShoulderPrep",
    "goFunctionalAssessmentBodyRegion",
  ]) {
    assert.ok(
      new RegExp(`window\\.${fn}\\s*=\\s*${fn}\\s*;`).test(appJs),
      `window.${fn} is exposed for inline onclick`
    );
  }
  // 3. selectShoulderProblem sets state + routes to Prep + re-renders.
  const sp = appJs.slice(appJs.indexOf("function selectShoulderProblem("));
  const spBody = sp.slice(0, sp.indexOf("\n}"));
  assert.ok(/isShoulderProblemStartable\(problemId, FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS\)/.test(spBody), "gated by isShoulderProblemStartable");
  assert.ok(/state\.shoulderSelectedProblemId = problemId/.test(spBody), "records the chosen problem");
  assert.ok(/state\.route = "functionalAssessmentShoulderPrep"/.test(spBody), "routes to Shoulder Prep");
  assert.ok(/\brender\(\)/.test(spBody), "re-renders after the state update");
  assert.ok(!/window\.selectShoulderProblem/.test(proto), "the pure module stays app.js-free");
}

// ── A. orchestration is PROTOCOL-driven, not a hardcoded 2-movement flow ──
assert.ok(
  /function advanceFunctionalAssessmentShoulderMovement\(\)[\s\S]{0,400}activeShoulderProtocolMovements\(\)\.length/.test(appJs),
  "movement progression counts the ACTIVE PROTOCOL's movements, not FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS.length"
);
assert.ok(
  !/FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS\.length/.test(appJs),
  "no code path still hardcodes the full-catalog length as the protocol length"
);
assert.ok(
  !/FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS\[\s*(index|state\.functionalAssessmentShoulderMovementIndex)/.test(appJs),
  "session/orchestration reads the resolved protocol list (currentShoulderMovement()), not a raw catalog index"
);
assert.ok(
  /function resolveProtocolMovements\b/.test(readFileSync(join(root, "js/data/shoulderAssessmentProtocol.js"), "utf8")),
  "protocol resolution lives in the pure module"
);

// ── E. developer / calibration controls are gated out of patient mode ──
assert.ok(/const SHOULDER_DEV_MODE_ENABLED\s*=/.test(appJs), "explicit dev-mode gate exists");
assert.ok(
  /new URLSearchParams\(window\.location\.search\)\.get\("shoulderDev"\) === "1"/.test(appJs),
  "dev mode is a deliberate URL opt-in, not a tappable control"
);
for (const fn of [
  "function toggleShoulderCalibrationMode()",
  "function setShoulderCalibrationMovement(",
  "function setShoulderCalibrationSide(",
  "function resetShoulderCalibrationSession()",
  "function markShoulderCalibrationMoment(",
]) {
  const at = appJs.indexOf(fn);
  assert.ok(at !== -1, `${fn} still present (calibration infra preserved)`);
  const body = appJs.slice(at, at + 260);
  assert.ok(/SHOULDER_DEV_MODE_ENABLED/.test(body), `${fn} is guarded by SHOULDER_DEV_MODE_ENABLED`);
}
assert.ok(
  /function functionalAssessmentShoulderCalibrationPanelHtml\(\)\s*\{[\s\S]{0,220}if \(!SHOULDER_DEV_MODE_ENABLED\) return "";/.test(appJs),
  "calibration panel markup is not emitted at all in patient mode"
);
assert.ok(
  /SHOULDER_DEV_MODE_ENABLED\s*\?\s*`<span class="functional-assessment-calibration-toggle"/.test(appJs),
  'the "校正" toggle is only rendered in Developer Mode'
);
// The marker / side / movement CONTROL markup (onclick wiring) must only
// appear inside the dev-gated calibration panel builder — never in a
// patient-reachable renderer. (The label strings themselves may be defined
// in module-scope calibration constants; that is harmless — what matters
// is that no patient page renders a control that calls them.)
{
  const panelStart = appJs.indexOf("function functionalAssessmentShoulderCalibrationPanelHtml()");
  assert.ok(panelStart !== -1);
  const panelEnd = appJs.indexOf("\n}\n", panelStart);
  const panelBody = appJs.slice(panelStart, panelEnd);
  for (const control of [
    'onclick="markShoulderCalibrationMoment(',
    'onclick="setShoulderCalibrationSide(',
    'onclick="setShoulderCalibrationMovement(',
    'onclick="resetShoulderCalibrationSession()',
  ]) {
    const total = appJs.split(control).length - 1;
    const inPanel = panelBody.split(control).length - 1;
    assert.ok(total > 0, `${control} present (dev tooling preserved)`);
    assert.equal(inPanel, total, `${control} is ONLY in the dev-gated calibration panel`);
  }
}

// ── D. mirror is DISPLAY-only, unconditional, and never mutates landmarks ──
assert.ok(
  /\.functional-assessment-camera-video,\s*\n\s*\.functional-assessment-calibration-overlay-canvas\s*\{\s*\n\s*transform: scaleX\(-1\);/.test(stylesCss),
  "camera preview is ALWAYS mirrored via a plain CSS rule on the video/overlay elements"
);
assert.ok(
  !/\.functional-assessment-camera-wrap-mirrored\s+\.functional-assessment-camera-video/.test(stylesCss),
  "mirroring is no longer scoped behind a calibration-only wrapper class"
);
assert.ok(
  !/classList\.toggle\("functional-assessment-camera-wrap-mirrored"/.test(appJs),
  "no JS toggles a mirror class any more"
);
// The frame handler must pass RAW landmarks straight through to the
// measurement engines — no x-coordinate negation / mirroring of the data.
const fh = appJs.slice(appJs.indexOf("function handleShoulderFrame(landmarks, timestamp)"));
const fhBody = fh.slice(0, fh.indexOf("\nfunction "));
assert.ok(
  /shoulderMovementMeasurement\.processFrame\(\{ timestamp, landmarks, bodyReady: true \}\)/.test(fhBody),
  "adapter is fed the untouched `landmarks` param"
);
assert.ok(
  !/1\s*-\s*(landmarks|lm|p)\[/.test(fhBody) && !/\.x\s*=\s*1\s*-/.test(fhBody),
  "no landmark x-coordinate is mirrored/mutated before measurement"
);

// ── C. session page shows movement name + current side + orientation ──
assert.ok(
  /functional-assessment-remote-title">\$\{sideLabelBig\}\$\{movement\.label\}/.test(appJs),
  "camera-active view shows a large '{側}側{movement}' title"
);
assert.ok(
  /const orientationLine = getShoulderMovementVoiceLine\(movement\.key, "orientation", shoulderMovementActiveSide\)/.test(appJs),
  "the on-screen orientation line reuses the same wording as the orientation voice cue"
);
assert.ok(
  /目前測量：\$\{sideLabel\}/.test(appJs),
  'the "目前測量：{右側/左側}" phrase is shown on the status line'
);

// ── F. voice wiring: new lifecycle states are dispatched ──────────────
{
  const st = appJs.indexOf("function speakShoulderMovementTransition(");
  const body = appJs.slice(st, appJs.indexOf("\n}", st));
  assert.ok(
    /MOVEMENT_IN_PROGRESS[\s\S]*?speakShoulderMovementVoice\("movementAck"/.test(body),
    "movement-acknowledged voice fires on MOVEMENT_IN_PROGRESS"
  );
  assert.ok(
    /ENDPOINT_HOLD[\s\S]*?speakShoulderMovementVoice\("endpoint"/.test(body),
    "endpoint voice fires on ENDPOINT_HOLD"
  );
  assert.ok(!body.includes("SHOULDER_MEASUREMENT_PHASE.RETURNING"), "RETURNING has no voice branch (endpoint line already said 'lower')");
}
assert.ok(
  /speakShoulderMovementVoice\("rightComplete"/.test(appJs) && /speakShoulderMovementVoice\("movementDone"/.test(appJs),
  "side-complete and movement-complete voice are dispatched from the orchestration"
);
assert.ok(
  /speakShoulderMovementVoice\("ready", \{ side: shoulderMovementActiveSide/.test(appJs),
  '"ready" cue is spoken per side at measurement-ready'
);
assert.ok(
  /speakShoulderText\("sh_framing_loss", SHOULDER_FRAMING_LOSS_VOICE/.test(appJs),
  "framing-loss instruction is wired to the readiness-loss branch"
);
assert.ok(
  /getNextShoulderSide\(shoulderMovementActiveSide\)/.test(appJs),
  "automatic side sequencing uses the pure getNextShoulderSide()"
);

// ── section 13: honest completion copy ───────────────────────────────
assert.ok(!appJs.includes("目前為功能評估流程示範，分析結果將於後續功能提供"), "misleading demo copy removed");
assert.ok(!appJs.includes("評估結果頁面即將推出"), "Phase 7.5 — completion dead-end copy removed");
assert.ok(appJs.includes("本次量測資料已儲存"), "honest 'data saved' copy present");
assert.ok(/onclick="advanceFunctionalAssessmentShoulderMovement\(\)">\$\{isLast \? "完成評估" : "開始下一項"\}/.test(appJs), "automatic next-movement CTA (no movement selector)");

// ── Phase 7.4.1: legacy movement-id storage compat + no hardcoded 2 ──
{
  const cat = appJs.slice(appJs.indexOf("const FUNCTIONAL_ASSESSMENT_SHOULDER_MOVEMENTS = ["));
  const catBody = cat.slice(0, cat.indexOf("\n];"));
  assert.ok(/movementId: "A01-1"/.test(catBody) && /movementId: "A01-2"/.test(catBody), "legacy storage movementIds A01-1 / A01-2 are UNCHANGED");
  assert.ok(/assessmentMovementId: "A01"/.test(catBody) && /assessmentMovementId: "A02"/.test(catBody), "conceptual Assessment Movement ids added alongside, not replacing");

  const asm = appJs.slice(appJs.indexOf("function assembleShoulderMovementResult()"));
  const asmBody = asm.slice(0, asm.indexOf("\n}"));
  assert.ok(/movementId: \(m && m\.movementId\) \|\| "A01-1"/.test(asmBody), "persisted result still keys on the legacy storage movementId");
  assert.ok(/assessmentMovementId: \(m && m\.assessmentMovementId\)/.test(asmBody), "persisted result additively records the conceptual id");

  // functionalAssessmentService still dedupes on movementId (legacy key) — untouched by this task.
  const svc = readFileSync(join(root, "js/data/functionalAssessmentService.js"), "utf8");
  assert.ok(/m\.movementId !== movementResult\.movementId/.test(svc), "persistence dedupe key unchanged (no destructive migration)");
}
// No copy assumes every shoulder protocol has exactly 2 movements.
for (const banned of ["共 2 個動作", "已完成 2 個動作", "下一項為外展", "下一項：肩關節外展"]) {
  assert.ok(!appJs.includes(banned), `no hardcoded 2-movement copy: "${banned}"`);
}
assert.ok(
  /const count = activeShoulderProtocolMovements\(\)\.length/.test(appJs) &&
    /共 \$\{count\} 個動作/.test(appJs),
  "Intro copy derives the movement count from the active protocol"
);
assert.ok(
  /const isTransition = index > 0;/.test(appJs),
  "a transition screen only appears when index > 0 (never for a single-movement protocol)"
);

console.log("Phase 7.4.1 shoulder assessment IA/protocol/legacy-id source guards passed");
