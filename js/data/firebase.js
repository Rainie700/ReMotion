import { initializeApp } from "firebase/app";
import { getAuth, connectAuthEmulator } from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

// Firebase client configuration is safe to ship with a web app. Access to
// private data is enforced by Firebase Authentication and Firestore rules.
const firebaseConfig = {
  apiKey: "AIzaSyAYwhhZx_EwJDCkBqydzUlLK3lDU76zU0Y",
  authDomain: "remotion-2026.firebaseapp.com",
  projectId: "remotion-2026",
  storageBucket: "remotion-2026.firebasestorage.app",
  messagingSenderId: "378916857755",
  appId: "1:378916857755:web:058eea87d217553474633e",
  measurementId: "G-9S27TXC6GN",
};

/**
 * Local browser verification (docs/verification/fa5x-browser-local/): the
 * EMULATOR MODE. All three conditions are required, otherwise it is off:
 *   1. a Vite DEV build (`import.meta.env.DEV`; false in every production build),
 *   2. the page is served from localhost / 127.0.0.1,
 *   3. the URL explicitly asks for it: `?emulator=1`.
 * In emulator mode the app uses a separate `demo-` project id (which the
 * Firebase emulators accept and which never reaches a real project) and both
 * Auth and Firestore are connected to the LOCAL emulators right here, at module
 * load, before any login or data call can run. There is no fallback to the
 * production configuration: if the emulators are unreachable, app.js stops.
 */
export const EMULATOR_PROJECT_ID = "demo-remotion";
export const EMULATOR_ENDPOINTS = Object.freeze({ auth: "http://127.0.0.1:9099", firestoreHost: "127.0.0.1", firestorePort: 8080 });
const EMULATOR_MODE = !!(import.meta.env && import.meta.env.DEV) && (() => {
  try {
    return typeof location !== "undefined"
      && (location.hostname === "localhost" || location.hostname === "127.0.0.1")
      && new URLSearchParams(location.search).get("emulator") === "1";
  } catch (e) {
    return false;
  }
})();
/** True only in the local emulator mode described above. */
export const isEmulatorMode = () => EMULATOR_MODE;

const emulatorConfig = {
  apiKey: "demo-local-emulator-key",
  authDomain: `${EMULATOR_PROJECT_ID}.firebaseapp.com`,
  projectId: EMULATOR_PROJECT_ID,
  appId: "demo-local-emulator-app",
};

export const firebaseApp = initializeApp(EMULATOR_MODE ? emulatorConfig : firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);

if (EMULATOR_MODE) {
  connectAuthEmulator(firebaseAuth, EMULATOR_ENDPOINTS.auth, { disableWarnings: true });
  connectFirestoreEmulator(firestore, EMULATOR_ENDPOINTS.firestoreHost, EMULATOR_ENDPOINTS.firestorePort);
}

/**
 * Emulator mode only: are the local Auth and Firestore emulators reachable?
 * `no-cors` because the emulators do not send CORS headers for these probe
 * URLs — a network failure still rejects. Resolves { ok, failed: [...] }.
 */
export async function checkEmulatorsReachable() {
  if (!EMULATOR_MODE) return { ok: false, failed: ["not_emulator_mode"] };
  const probes = { auth: `${EMULATOR_ENDPOINTS.auth}/`, firestore: `http://${EMULATOR_ENDPOINTS.firestoreHost}:${EMULATOR_ENDPOINTS.firestorePort}/` };
  const failed = [];
  for (const [name, url] of Object.entries(probes)) {
    try { await fetch(url, { mode: "no-cors", cache: "no-store" }); } catch (e) { failed.push(name); }
  }
  return { ok: failed.length === 0, failed };
}
