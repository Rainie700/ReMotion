import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Local browser verification batch — emulator-mode guards (docs/verification/fa5x-browser-local/).
 * Source + module checks only. Whether the BUILT bundle can never enable the mode is checked
 * separately on dist/ (see the batch report); the browser run is the behavioural evidence.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");

// 1. activation: DEV build AND localhost/127.0.0.1 AND ?emulator=1 — all required
{
  const fb = read("js/data/firebase.js");
  assert.ok(fb.includes("const EMULATOR_MODE = !!(import.meta.env && import.meta.env.DEV) && (() => {"), "DEV build required first");
  assert.ok(fb.includes('(location.hostname === "localhost" || location.hostname === "127.0.0.1")'), "local host only");
  assert.ok(fb.includes('new URLSearchParams(location.search).get("emulator") === "1"'), "explicit opt-in");
  assert.ok(fb.includes('export const EMULATOR_PROJECT_ID = "demo-remotion";'), "demo- project id (never a real project)");
  assert.ok(fb.includes("initializeApp(EMULATOR_MODE ? emulatorConfig : firebaseConfig)"), "one app, never both");
  // connected at module load, before anything else can use auth / firestore
  const connectAt = fb.indexOf("connectAuthEmulator(firebaseAuth");
  assert.ok(connectAt > fb.indexOf("export const firestore = getFirestore(firebaseApp);") && fb.includes("connectFirestoreEmulator(firestore"));
  assert.ok(!/await\s+import|^await /m.test(fb), "no top-level await (production build target)");
  const { isEmulatorMode, checkEmulatorsReachable } = await import("../js/data/firebase.js");
  assert.equal(isEmulatorMode(), false, "off outside a Vite DEV page");
  assert.deepEqual(await checkEmulatorsReachable(), { ok: false, failed: ["not_emulator_mode"] }, "probe refuses outside the mode");
}

// 2. no fallback: in emulator mode the auth callback's FIRST statement waits for the probe and stops on failure
{
  const app = read("app.js");
  assert.ok(app.includes("const emulatorGate = EMULATOR_MODE ? checkEmulatorsReachable() : Promise.resolve({ ok: true, failed: [] });"));
  assert.ok(app.includes("if (EMULATOR_MODE) emulatorGate.then((r) => { if (!r.ok) showEmulatorUnavailable(r.failed); });"), "blocked overlay on failure");
  assert.ok(app.includes("if (!LOCAL_DEMO_MODE) authService.subscribe(async (user) => {\n  if (EMULATOR_MODE && !(await emulatorGate).ok) return;\n"), "gate is the first statement of the only auth callback");
  assert.equal((app.match(/authService\.subscribe\(/g) || []).length, 1, "exactly one auth subscription");
  const blocked = app.slice(app.indexOf("function showEmulatorUnavailable("), app.indexOf("async function logout()"));
  assert.ok(!/hydrateCloudForUser|authService\.|setSession/.test(blocked) && blocked.includes("不會改連正式環境"), "blocked page never logs in or loads data");
  assert.ok(app.includes("本機測試資料｜Firebase 模擬器（${EMULATOR_PROJECT_ID}）｜非正式資料"), "permanent banner text");
}

// 3. separate local cache
{
  const s = read("js/data/storageService.js");
  assert.ok(s.includes('const NAMESPACE = LOCAL_DEMO ? "remotion_localdemo" : isEmulatorMode() ? "remotion_emulator" : "remotion";'));
}

// 4. other production paths: the model service is refused before App Check / firebase/ai load
{
  const a = read("js/services/llmProviderAdapter.js");
  for (const fn of ["async function ensureAppCheck()", "export async function generateWeeklySummaryWithGemini(", "export async function generateD5RecommendationDraftWithGemini("]) {
    const body = a.slice(a.indexOf(fn), a.indexOf(fn) + 400);
    assert.ok(body.indexOf("refuseInEmulatorMode();") > 0 && body.indexOf("refuseInEmulatorMode();") < (body.indexOf('import("firebase/') === -1 ? Infinity : body.indexOf('import("firebase/')), `${fn} refuses first`);
  }
}

console.log("emulator mode guard tests passed");
