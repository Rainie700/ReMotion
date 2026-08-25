import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

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

const firebaseApp = initializeApp(firebaseConfig);

export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
