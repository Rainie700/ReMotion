import { createCollection } from "./storageService.js";
import { seedTherapistPatientRelations } from "./seedData.js";
import { userService } from "./userService.js";
import { generateId, nowIso } from "../utils/id.js";

const relationsCollection = createCollection("therapistPatientRelations", seedTherapistPatientRelations);

function normalizeInviteCode(code) {
  return String(code || "").trim().toUpperCase();
}

/**
 * Shared by acceptByInviteCode/reactivateByInviteCode so there is one single
 * implementation of "join (or rejoin) a therapist by code" — first-time
 * patients and patients reactivating a past (completed/revoked) relation
 * both go through this same path.
 */
function joinByInviteCode(patientId, inviteCode) {
  const patient = userService.getById(patientId);
  if (!patient || patient.role !== "patient") {
    return { error: "只有患者帳號可以加入復健師的個案名單。" };
  }
  const therapist = relationService.findTherapistByInviteCode(inviteCode);
  if (!therapist) {
    return { error: "找不到此邀請碼，請確認後再試一次。" };
  }
  const alreadyThisTherapist = relationService.findAcceptedRelation(therapist.id, patientId);
  if (alreadyThisTherapist) {
    return { error: "您已經加入此復健師的個案名單。" };
  }
  const activeElsewhere = relationService.findAcceptedByPatientId(patientId);
  if (activeElsewhere.length) {
    return { error: "請先離開目前復健師，再加入新的復健師。" };
  }

  const code = normalizeInviteCode(inviteCode);
  const now = nowIso();
  const past = relationService.findPastRelation(therapist.id, patientId);

  const relation = past
    ? relationsCollection.update(past.id, {
        status: "accepted",
        inviteCode: code,
        acceptedAt: now,
        completedAt: null,
        completedBy: null,
        revokedAt: null,
        revokedBy: null,
        endReason: null,
      })
    : relationsCollection.create({
        id: generateId("relation"),
        therapistId: therapist.id,
        patientId,
        inviteCode: code,
        status: "accepted",
        createdAt: now,
        acceptedAt: now,
        completedAt: null,
        completedBy: null,
        revokedAt: null,
        revokedBy: null,
        endReason: null,
      });

  return { relation, therapist, reactivated: !!past };
}

export const relationService = {
  list() {
    return relationsCollection.list();
  },
  getById(id) {
    return relationsCollection.getById(id);
  },
  findAcceptedByTherapistId(therapistId) {
    return relationsCollection.query((r) => r.therapistId === therapistId && r.status === "accepted");
  },
  findAcceptedByPatientId(patientId) {
    return relationsCollection.query((r) => r.patientId === patientId && r.status === "accepted");
  },
  findAcceptedRelation(therapistId, patientId) {
    return relationsCollection.find(
      (r) => r.therapistId === therapistId && r.patientId === patientId && r.status === "accepted"
    );
  },
  // "active" is just the current/ongoing term for "accepted" — kept as a
  // separate name because that's the vocabulary the case-list/history UI uses.
  findActiveByTherapistId(therapistId) {
    return this.findAcceptedByTherapistId(therapistId);
  },
  findActiveByPatientId(patientId) {
    return this.findAcceptedByPatientId(patientId);
  },
  findHistoryByTherapistId(therapistId) {
    return relationsCollection.query((r) => r.therapistId === therapistId && r.status !== "accepted");
  },
  findHistoryByPatientId(patientId) {
    return relationsCollection.query((r) => r.patientId === patientId && r.status !== "accepted");
  },
  /** Most recent non-accepted (completed/revoked) relation between this pair, if any. */
  findPastRelation(therapistId, patientId) {
    const past = relationsCollection.query(
      (r) => r.therapistId === therapistId && r.patientId === patientId && r.status !== "accepted"
    );
    if (!past.length) return null;
    return [...past].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  },
  /** Read-only lookup used by the "查詢復健師" step, before anything is created. */
  findTherapistByInviteCode(inviteCode) {
    const code = normalizeInviteCode(inviteCode);
    if (!code) return null;
    return userService.list().find((u) => u.role === "therapist" && u.inviteCode === code) || null;
  },
  acceptByInviteCode(patientId, inviteCode) {
    return joinByInviteCode(patientId, inviteCode);
  },
  reactivateByInviteCode(patientId, inviteCode) {
    return joinByInviteCode(patientId, inviteCode);
  },
  complete(relationId, completedBy, reason) {
    const relation = relationsCollection.getById(relationId);
    if (!relation || relation.status !== "accepted") return null;
    return relationsCollection.update(relationId, {
      status: "completed",
      completedAt: nowIso(),
      completedBy,
      endReason: reason || "",
    });
  },
  revoke(relationId, revokedBy, reason) {
    const relation = relationsCollection.getById(relationId);
    if (!relation || relation.status !== "accepted") return null;
    return relationsCollection.update(relationId, {
      status: "revoked",
      revokedAt: nowIso(),
      revokedBy,
      endReason: reason || "",
    });
  },
  /**
   * Moves every patient the source therapist currently has an accepted
   * relation with over to the target therapist, preserving full history:
   * the old relation is retired (status "revoked", endReason explains the
   * transfer, plus transferredTo/At/By fields) rather than status enum
   * growing a new value, and — unless the patient already has an accepted
   * relation with the target therapist — a brand-new accepted relation is
   * created for the target, carrying transferredFrom/sourceRelationId/
   * originalAcceptedAt so the original join date is never lost.
   *
   * Idempotent: a second call finds zero accepted relations left on
   * fromTherapistId and does nothing.
   */
  transferActivePatients(fromTherapistId, toTherapistId, transferredBy, reason) {
    const activeRelations = this.findAcceptedByTherapistId(fromTherapistId);
    const now = nowIso();
    const finalReason = reason || "由 therapist01 轉移至 therapist02";
    let transferredCount = 0;
    let skippedDuplicateCount = 0;

    activeRelations.forEach((rel) => {
      const existing = this.findAcceptedRelation(toTherapistId, rel.patientId);

      relationsCollection.update(rel.id, {
        status: "revoked",
        revokedAt: now,
        revokedBy: transferredBy,
        endReason: finalReason,
        transferredToTherapistId: toTherapistId,
        transferredAt: now,
        transferredBy,
      });

      if (existing) {
        skippedDuplicateCount += 1;
        return;
      }

      relationsCollection.create({
        id: generateId("relation"),
        therapistId: toTherapistId,
        patientId: rel.patientId,
        inviteCode: rel.inviteCode,
        status: "accepted",
        createdAt: rel.createdAt,
        acceptedAt: now,
        completedAt: null,
        completedBy: null,
        revokedAt: null,
        revokedBy: null,
        endReason: null,
        transferredFromTherapistId: fromTherapistId,
        transferredAt: now,
        transferredBy,
        sourceRelationId: rel.id,
        originalAcceptedAt: rel.acceptedAt || rel.createdAt,
      });
      transferredCount += 1;
    });

    return { transferredCount, skippedDuplicateCount, totalActive: activeRelations.length };
  },
};
