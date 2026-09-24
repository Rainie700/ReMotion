import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firebaseAuth, firestore } from "./firebase.js";

const PROFILE_COLLECTION = "users";
const INVITE_CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateInviteCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return `RM-${code}`;
}

function profileFromAuthUser(authUser, profile) {
  return {
    id: authUser.uid,
    account: authUser.email,
    email: authUser.email,
    name: profile.name || authUser.email,
    role: profile.role || "patient",
    createdAt: profile.createdAt || authUser.metadata.creationTime,
    ...(profile.inviteCode ? { inviteCode: profile.inviteCode } : {}),
  };
}

function friendlyError(error) {
  const messages = {
    "auth/email-already-in-use": "此電子郵件已經註冊。",
    "auth/invalid-email": "請輸入有效的電子郵件地址。",
    "auth/invalid-credential": "電子郵件或密碼錯誤。",
    "auth/user-not-found": "電子郵件或密碼錯誤。",
    "auth/wrong-password": "電子郵件或密碼錯誤。",
    "auth/weak-password": "密碼至少需要 6 個字元。",
    "auth/network-request-failed": "網路連線失敗，請稍後再試。",
  };
  return messages[error?.code] || error?.message || "目前無法完成登入，請稍後再試。";
}

async function getProfile(authUser) {
  const snapshot = await getDoc(doc(firestore, PROFILE_COLLECTION, authUser.uid));
  if (!snapshot.exists()) throw new Error("找不到使用者個人資料，請聯絡管理員。");

  const profile = snapshot.data();
  await setDoc(doc(firestore, "publicUsers", authUser.uid), {
    name: profile.name || authUser.email,
    role: profile.role || "patient",
    ...(profile.inviteCode ? { inviteCode: profile.inviteCode } : {}),
  }, { merge: true });
  return profileFromAuthUser(authUser, profile);
}

export const authService = {
  getCurrentUser() {
    return null;
  },
  async login(email, password, expectedRole) {
    try {
      const credential = await signInWithEmailAndPassword(firebaseAuth, email, password);
      const user = await getProfile(credential.user);
      if (expectedRole && user.role !== expectedRole) {
        await signOut(firebaseAuth);
        return { error: "此帳號的身分與你選擇的登入身分不一致。" };
      }
      return { user };
    } catch (error) {
      return { error: friendlyError(error) };
    }
  },
  async register({ name, account, password, role }) {
    try {
      const credential = await createUserWithEmailAndPassword(firebaseAuth, account, password);
      const profile = {
        name,
        role,
        account,
        createdAt: new Date().toISOString(),
        ...(role === "therapist" ? { inviteCode: generateInviteCode() } : {}),
      };
      await setDoc(doc(firestore, PROFILE_COLLECTION, credential.user.uid), profile);
      await setDoc(doc(firestore, "publicUsers", credential.user.uid), {
        name,
        role,
        ...(profile.inviteCode ? { inviteCode: profile.inviteCode } : {}),
      });
      await signOut(firebaseAuth);
      return { user: profileFromAuthUser(credential.user, profile) };
    } catch (error) {
      return { error: friendlyError(error) };
    }
  },
  async logout() {
    await signOut(firebaseAuth);
  },
  subscribe(callback) {
    return onAuthStateChanged(firebaseAuth, async (authUser) => {
      if (!authUser) {
        await callback(null);
        return;
      }
      try {
        const user = await getProfile(authUser);
        if (firebaseAuth.currentUser?.uid === authUser.uid) await callback(user);
      } catch (error) {
        console.error("Unable to load Firebase user profile", error);
        await callback(null);
      }
    });
  },
  refreshSessionUser() {
    // Firebase Auth owns the session. Account/email changes require a
    // dedicated, re-authenticated Firebase flow and are not mirrored here.
  },
};
