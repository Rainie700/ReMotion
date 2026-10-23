import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * ReMotion Sarcopenia Redesign — Phase 1.5 -> Phase 2 (Patient Product IA)
 * guards.
 *
 * Phase 1.5 originally put a "功能健康追蹤" primary card (functional
 * screening -> 5xSTS -> home training -> re-assessment loop diagram) at the
 * top of Home. Phase 2 removes that card from Home's UI entirely — it
 * duplicated the newer six-Functional-Domain entry
 * (functionalAssessmentSectionHtml -> goFunctionalDomainHome() -> F01 ->
 * A｜先進行功能評估), which is now the one real path into the 5xSTS
 * assessment. This file now asserts the REMOVAL (task section 一) instead
 * of the old card's presence, while confirming every underlying
 * route/function the old card used to link to is still defined and
 * reachable elsewhere (task section 一's explicit "不要刪除底層
 * route/state/service/function").
 *
 * All static (source-slicing) checks against app.js/styles.css.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const sliceFn = (needle, span = 9000) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected to find ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + span : end + 2);
};

const home = sliceFn("patientHome = function()", 12000);

// ── 1. the old 功能健康追蹤 primary card is gone from Home ────────────
{
  assert.ok(!home.includes("功能健康追蹤"), "Home no longer renders the 功能健康追蹤 card");
  assert.ok(!home.includes("肌少症功能追蹤"), "the old 肌少症功能追蹤 card title is still gone from Home");
  assert.ok(!home.includes("sarcopeniaPrimaryCardHtml"), "the sarcopeniaPrimaryCardHtml variable/interpolation is removed from Home's template");
  assert.ok(!home.includes("sarcopeniaLoopStepsHtml"), "the 4-step loop diagram builder is removed from Home");
  assert.ok(!home.includes('sarcopenia-primary-card'), "no sarcopenia-primary-card element is rendered on Home");
  assert.equal((home.match(/class="sarcopenia-loop-step"/g) || []).length, 0, "no sarcopenia-loop-step elements remain on Home");
  assert.ok(!home.includes("開始功能初篩"), "the old 開始功能初篩 CTA is gone from Home");
}

// ── 2. removal left no stray gap — the return template concatenates
//       cleanly straight from successBannerHtml into functionalAssessmentSectionHtml ─
{
  const returnStatement = home.slice(home.indexOf("return `"));
  assert.ok(/\$\{successBannerHtml\}\$\{functionalAssessmentSectionHtml\}/.test(returnStatement),
    "no leftover empty interpolation/placeholder sits between successBannerHtml and functionalAssessmentSectionHtml");
}

// ── 3. 開始自主復健 remains Home's first featured card, now opening the
//       six-Functional-Domain grid instead of the old unified entry ──────
{
  assert.ok(home.includes("開始自主復健"), "開始自主復健 card is still present on Home");
  const primaryIdx = home.indexOf("functionalAssessmentSectionHtml =");
  assert.ok(primaryIdx !== -1, "functionalAssessmentSectionHtml is still built");
  const card = home.slice(primaryIdx, primaryIdx + 1200);
  assert.ok(/onclick="goFunctionalDomainHome\(\)"/.test(card), "its primary action now opens the Functional Domain grid");
}

// ── 4. underlying sarcopenia/5xSTS routes+functions are NOT deleted ──────
// (task section 一's explicit instruction — Home UI only, no route/service/
// function removal — these keep serving F01's assessment flow.)
{
  for (const fn of ["goSarcopeniaScreening", "goFiveTimesSitToStandAssessment", "goFiveTimesSitToStandResult", "goFunctionalChangeTrend"]) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(appJs), `${fn}() is still defined`);
    assert.ok(new RegExp(`window\\.${fn} = ${fn};`).test(appJs), `window.${fn} is still exposed`);
  }
  for (const pageFn of ["sarcopeniaScreeningPage", "fiveTimesSitToStandAssessmentPage", "fiveTimesSitToStandResultPage", "functionalChangeTrendPage"]) {
    assert.ok(new RegExp(`function ${pageFn}\\(\\)`).test(appJs), `${pageFn}() is still defined`);
  }
  const dispatch = appJs.slice(appJs.indexOf("render = function()"), appJs.indexOf("render = function()") + 6500);
  for (const route of ["sarcopeniaScreening", "fiveTimesSitToStandAssessment", "fiveTimesSitToStandResult", "functionalChangeTrend"]) {
    assert.ok(new RegExp(`state\\.route === "${route}"`).test(dispatch), `route "${route}" is still wired into render()`);
  }
}

// ── 5. shoulder assessment remains reachable ──────────────────────────
assert.ok(/onclick="goFunctionalAssessmentBodyRegion\(\)"/.test(appJs), "existing 6-region/shoulder functional assessment entry still reachable");
assert.ok(/function functionalAssessmentShoulderResultPage\(\)/.test(appJs), "shoulder assessment result page still defined");

// ── 6. training/gamification/data/profile remain intact ──────────────
{
  assert.ok(home.includes("myScheduleCardHtml"), "我的課表 (training) still rendered on Home");
  assert.ok(home.includes("levelXpCardHtml") && home.includes("achievementPreviewHtml"), "gamification (level/XP + achievements) still rendered on Home");
  assert.ok(home.includes("progressCardHtml"), "progress/Data entry still rendered on Home");
  assert.ok(/onclick="switchTab\('profile'\)"/.test(home), "Profile entry still reachable from Home");
  assert.ok(/BASE_TABS\s*=\s*\[/.test(appJs), "bottom-nav tab config (home/data/profile) still defined");
  assert.ok(/switchTab\('data'\)/.test(appJs), "the data/progress tab is still switchable");
}

// ── 7. new-flow copy does not imply confirmed sarcopenia ──────────────
{
  for (const banned of ["肌少症患者", "確診", "罹患肌少症", "你有肌少症"]) {
    assert.ok(!appJs.includes(banned), `patient-facing copy never says "${banned}"`);
  }
  const skeletonBodies = ["sarcopeniaScreeningPage", "functionalChangeTrendPage"]
    .map((fn) => sliceFn(`function ${fn}()`))
    .join("\n");
  assert.ok(!/肌少症/.test(skeletonBodies), "remaining skeleton page bodies avoid the 肌少症 label entirely (task section 六)");
  assert.ok(!/肌少症/.test(home), "Home copy avoids the 肌少症 label entirely");
  // the removed card's own "功能健康追蹤" phrase must not resurface anywhere user-visible.
  const screeningBody = sliceFn("function sarcopeniaScreeningPage()");
  assert.ok(!screeningBody.includes("功能健康追蹤"), "sarcopeniaScreeningPage() copy no longer says 功能健康追蹤 either");
}

// ── 8. Phase 1 assessmentType compatibility is untouched ─────────────
{
  assert.ok(/FUNCTIONAL_ASSESSMENT_TYPES\.SHOULDER/.test(appJs), "Phase 1's assessmentType-aware reader guards are still present");
  const shoulderFilteredCalls = (appJs.match(/getLatestCompletedByPatientId\(patientId, \{ assessmentType: FUNCTIONAL_ASSESSMENT_TYPES\.SHOULDER \}\)/g) || []).length;
  assert.ok(shoulderFilteredCalls >= 2, "therapist reader shoulder-filter guards from Phase 1 remain in place");
}

console.log("Sarcopenia Redesign Phase 1.5 -> Phase 2 (Patient Product IA) guards passed");
