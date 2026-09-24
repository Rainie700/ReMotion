import { createCollection } from "./storageService.js";
import { seedUsers } from "./seedData.js";

const usersCollection = createCollection("users", seedUsers);

const INVITE_CODE_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // excludes 0/O and 1/I

function generateInviteCode() {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += INVITE_CODE_CHARS[Math.floor(Math.random() * INVITE_CODE_CHARS.length)];
  }
  return `RM-${code}`;
}

export const userService = {
  list() {
    return usersCollection.list();
  },
  getById(id) {
    return usersCollection.getById(id);
  },
  findByAccount(account) {
    return usersCollection.find((u) => u.account === account);
  },
  create(user) {
    return usersCollection.create(user);
  },
  update(id, patch) {
    return usersCollection.update(id, patch);
  },
  /** Generates an RM-XXXXXX code guaranteed not to collide with any existing therapist's code. */
  generateUniqueTherapistInviteCode() {
    const existingCodes = new Set(
      usersCollection.list()
        .filter((u) => u.role === "therapist" && u.inviteCode)
        .map((u) => u.inviteCode)
    );
    let code = generateInviteCode();
    while (existingCodes.has(code)) {
      code = generateInviteCode();
    }
    return code;
  },
  /**
   * Backfills inviteCode onto any therapist created before invite codes
   * existed (e.g. a therapist01 saved from an earlier session). therapist01
   * always gets the same fixed demo code so existing accepted relations
   * that reference it stay valid.
   */
  ensureTherapistInviteCodes() {
    usersCollection.list().forEach((u) => {
      if (u.role === "therapist" && !u.inviteCode) {
        const code = u.account === "therapist01" ? "RM-A7K92P" : userService.generateUniqueTherapistInviteCode();
        usersCollection.update(u.id, { inviteCode: code });
      }
    });
  },
  /**
   * Backfills isDeveloperAccount on therapist01 for sessions saved before
   * this flag existed, so permission checks can rely on
   * `user.isDeveloperAccount === true` instead of hardcoding the account
   * name everywhere.
   */
  ensureDeveloperAccountFlags() {
    usersCollection.list().forEach((u) => {
      if (u.role === "therapist" && u.account === "therapist01" && u.isDeveloperAccount !== true) {
        usersCollection.update(u.id, { isDeveloperAccount: true });
      }
    });
  },
  /**
   * Renames a user's login account. Keeps id/role/name/password/inviteCode
   * and every relation/schedule/analysisRecord/gameProfile untouched, since
   * those are all linked by id, never by account string.
   */
  updateAccount(userId, newAccount) {
    const user = usersCollection.getById(userId);
    if (!user) return { error: "找不到使用者" };
    const trimmed = String(newAccount || "").trim();
    if (!trimmed) return { error: "新帳號不得為空" };
    if (trimmed === user.account) return { error: "新帳號與目前帳號相同。" };
    const duplicate = usersCollection.find((u) => u.account === trimmed && u.id !== userId);
    if (duplicate) return { error: "此帳號已被使用" };
    const updated = usersCollection.update(userId, { account: trimmed });
    return { user: updated };
  },
  /**
   * One-time, idempotent fix for a specific mis-registered demo account:
   * a patient named "Mandy" who accidentally ended up with the login
   * account "therapist03" (still role: patient). Safe to call on every
   * app load — does nothing once the account is already "patient04", and
   * never overwrites an unrelated existing "patient04" account.
   */
  migrateMandyAccount() {
    const mandy = usersCollection.find(
      (u) => u.name === "Mandy" && u.role === "patient" && u.account === "therapist03"
    );
    if (!mandy) return { skipped: true, reason: "no-match" };
    const conflict = usersCollection.find((u) => u.account === "patient04" && u.id !== mandy.id);
    if (conflict) return { error: "patient04 已被其他帳號使用，未覆蓋。", conflictUserId: conflict.id };
    const updated = usersCollection.update(mandy.id, { account: "patient04" });
    return { user: updated };
  },
};
