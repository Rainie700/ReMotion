import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Guest entry (2026-10-29): guest Home first, sign-in only when a personal assessment is wanted.
 * Program logic only (no account, no camera); the browser check is scripts/guestEntryBrowserCheck.mjs.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const fnSrc = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, name);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
const constLine = (name) => { const a = appJs.indexOf(`const ${name} =`); assert.ok(a >= 0, name); return appJs.slice(a, appJs.indexOf(";\n", a) + 1); };

// ── 1. the intent: only {kind, at}; allow-listed kind; expires; cleared on cancel / logout ──
{
  const mem = new Map();
  const sessionStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
  const state = {};
  const api = new Function("state", "sessionStorage", "Date", `${constLine("AUTH_INTENT_KEY")}\n${constLine("AUTH_INTENT_MAX_AGE_MS")}\nconst AUTH_INTENTS = Object.freeze({ firstAssessment: { publicRoute: "firstAssessmentPrep" } });\n${fnSrc("setAuthIntent")}\n${fnSrc("readAuthIntent")}\n${fnSrc("clearAuthIntent")}\nreturn { setAuthIntent, readAuthIntent, clearAuthIntent };`);
  let now = 1_000_000;
  const D = { now: () => now };
  const a = api(state, sessionStorage, D);
  a.setAuthIntent("firstAssessment");
  const stored = JSON.parse(mem.get("remotion.authIntent.v1"));
  assert.deepEqual(Object.keys(stored).sort(), ["at", "kind"], "nothing but the kind and the time is stored");
  state.authIntent = null; // a reload: memory gone, this tab's sessionStorage kept
  assert.equal(a.readAuthIntent().kind, "firstAssessment", "restored after a reload");
  a.setAuthIntent("https://evil.example/");
  assert.equal(state.authIntent.kind, "firstAssessment", "an unknown kind is never stored");
  mem.set("remotion.authIntent.v1", JSON.stringify({ kind: "goTo", at: now, url: "https://evil.example" }));
  state.authIntent = null;
  assert.equal(a.readAuthIntent(), null, "a forged kind is dropped");
  assert.equal(mem.has("remotion.authIntent.v1"), false);
  a.setAuthIntent("firstAssessment");
  now += 31 * 60 * 1000; state.authIntent = { ...state.authIntent };
  assert.equal(a.readAuthIntent(), null, "an intent older than 30 minutes is dropped");
  const block = appJs.slice(appJs.indexOf("const AUTH_INTENTS = Object.freeze("), appJs.indexOf("function setAuthIntent("));
  assert.ok(block.includes('firstAssessment: { publicRoute: "firstAssessmentPrep" }'), "the way back is a fixed in-app route");
  assert.ok(!/location\.(href|assign|replace)|window\.open/.test(fnSrc("resumeFirstAssessmentRoute") + fnSrc("cancelAuth") + fnSrc("setSession")), "never navigates to a URL");
  assert.ok(fnSrc("logout").includes("clearAuthIntent();") && fnSrc("cancelAuth").includes("clearAuthIntent();"), "cleared on logout and on cancel");
  assert.ok(!fnSrc("login").includes("clearAuthIntent"), "a failed login keeps the intent");
}

// ── 2. where 「繼續首次評估」 continues — the existing rules, by role and the account's state ──
{
  const make = ({ completed = false, cycle = null, intake = null }) => {
    const state = { authIntent: { kind: "firstAssessment", at: 1 } };
    const fn = new Function("state", "functionalAssessmentService", "trackingCycleService", "assessmentService", "FUNCTIONAL_ASSESSMENT_TYPES", "clearAuthIntent",
      `${fnSrc("resumeFirstAssessmentRoute")}\nreturn resumeFirstAssessmentRoute;`)(
      state, { hasCompletedByPatientId: () => completed }, { getLatestTrackingCycle: () => cycle }, { getActiveByPatientId: () => intake },
      { FIVE_TIMES_SIT_TO_STAND: "five_times_sit_to_stand" }, () => { state.authIntent = null; });
    return { state, fn };
  };
  let t = make({});
  assert.equal(t.fn({ id: "u", role: "therapist" }), "dashboard", "a therapist goes to its own home (role rules)");
  assert.equal(t.state.authIntent, null);
  t = make({});
  assert.equal(t.fn({ id: "u", role: "patient" }), "patientAssessmentIntro", "onboarding not done -> that step first");
  assert.ok(t.state.authIntent, "the intent stays for after the onboarding");
  t = make({ intake: { id: "a" } });
  assert.equal(t.fn({ id: "u", role: "patient" }), "fiveTimesSitToStandAssessment", "ready -> the existing preparation page (camera only from its 開始評估)");
  assert.equal(t.state.authIntent, null);
  t = make({ completed: true, intake: { id: "a" } });
  assert.equal(t.fn({ id: "u", role: "patient" }), "dashboard", "already assessed -> own home / next step, never a new 「first」 assessment");
  assert.ok(String(t.state.assessmentSuccessMessage).includes("你已經有五次坐站紀錄"));
  t = make({ cycle: { id: "c" }, intake: { id: "a" } });
  assert.equal(t.fn({ id: "u", role: "patient" }), "dashboard", "a tracking week -> own home");
  // the landing rule for everyone else is untouched
  assert.ok(fnSrc("setSession").includes('intent && intent.kind === "firstAssessment" ? resumeFirstAssessmentRoute(user) : determinePatientLandingRoute(user)'));
  assert.ok(fnSrc("determinePatientLandingRoute").includes('return active ? "dashboard" : "patientAssessmentIntro";'));
  // after the onboarding (saved or 稍後再填) a pending intent continues
  assert.ok(fnSrc("skipAssessmentIntro").includes("if (continueAuthIntentAfterSetup()) return;") && fnSrc("confirmAssessment").includes("if (continueAuthIntentAfterSetup()) return;"));
}

// ── 3. signed out: only public routes render; guest pages read no account data ──
{
  const guard = appJs.slice(appJs.lastIndexOf("const GUEST_PUBLIC_ROUTES"));
  assert.ok(guard.includes('new Set(["splash", "auth", "dashboard", "guestExercise", "firstAssessmentPrep"])'));
  assert.ok(guard.includes('if (!state.user && !GUEST_PUBLIC_ROUTES.has(state.route)) { state.route = "dashboard"; state.tab = "home"; }'), "any other route without a session -> guest Home");
  assert.equal(appJs.indexOf("render = function", appJs.lastIndexOf("const GUEST_PUBLIC_ROUTES") + 200), -1, "the guard is the outermost render layer");
  assert.ok(fnSrc("renderDashboard").startsWith("function renderDashboard() {\n  if (!state.user) {"), "signed out 首頁/訓練/數據/我的 = the guest pages");
  for (const n of ["guestHomePage", "guestTrainingPage", "guestExercisePage", "guestDataPage", "guestProfilePage", "firstAssessmentPrepPage", "guestExerciseList", "renderGuestExerciseRow"]) {
    const src = fnSrc(n);
    assert.ok(!/analysisService|trackingCycleService|functionalAssessmentService|dailyTrainingFeedbackService|storageService|getCurrentPatientId|recommendationService|f01FixedPracticeService|selfReportedTrainingService/.test(src), `${n} reads no account data`);
    assert.ok(!/getUserMedia|startCamera|goFiveTimesSitToStandDetection|beginLe05CameraSession/.test(src), `${n} never starts the camera`);
  }
  const ex = fnSrc("guestExercisePage") + fnSrc("renderGuestExerciseRow");
  assert.ok(!/dosage|組 ×|每組|適合你/.test(ex), "動作介紹 shows no personal amounts and no 「適合你」");
  const home = fnSrc("guestHomePage");
  for (const t of ["了解身體狀態，記錄每次練習", "從五次坐站評估開始，查看練習安排，追蹤自己的紀錄與感受。", "開始首次評估", "先查看準備說明，正式評估前需登入。", "部分情況需要補充資料或由復健師確認。", "動作介紹", "使用說明"]) assert.ok(home.includes(t), t);
  assert.ok(home.indexOf("開始首次評估") < home.indexOf("使用流程") && home.indexOf("使用流程") < home.indexOf("動作介紹") && home.indexOf("動作介紹") < home.indexOf("使用說明"), "the asked order");
  assert.ok(!/插畫預留位置|>圖示<|後續版本推出|一定會|保證/.test(home + fnSrc("renderSplash")), "no placeholders, no out-of-date or promising text");
  const prep = fnSrc("firstAssessmentPrepPage");
  assert.ok(prep.includes("${FA5X_PREP_STEPS_HTML}") && prep.includes("${FA5X_SAFETY_TEXT}") && prep.includes("登入並繼續") && prep.includes("建立帳號後繼續") && prep.includes("登入是為了保存評估與後續追蹤紀錄") && prep.includes('"繼續"'), "the approved text; signed-in -> 繼續");
}

// ── 4. boot: waits for the session check; never a blank page ──
{
  const boot = appJs.slice(appJs.indexOf("if (!LOCAL_DEMO_MODE) authService.subscribe("), appJs.indexOf("/** Emulator mode only: the emulators are not reachable"));
  assert.ok(boot.includes('if (state.route === "splash") {') && boot.includes('state.route = intent ? AUTH_INTENTS[intent.kind].publicRoute : "dashboard";'), "no session -> guest Home (or the page a pending intent came from); an open login screen stays");
  assert.ok(boot.includes("state.bootSlow = true") && fnSrc("renderSplash").includes("重新整理"), "a slow check offers 重新整理");
  assert.ok(appJs.includes('  route: "splash",'), "the app starts in the boot state (not a guest or login page)");
}

console.log("guest entry tests passed");
