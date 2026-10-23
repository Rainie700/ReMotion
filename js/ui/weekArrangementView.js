/**
 * 本週採用安排 — read-only history of ONE tracking week's next-stage step:
 * what the rule suggested, what a therapist changed (if reviewed), what the
 * patient accepted, and which week followed. Pure: stored records in, plain
 * view data out. Nothing here decides, re-evaluates or writes anything.
 *
 * Sources (all stored, never recomputed):
 *   rule      proposal.d5 (matrixDecision / decision / decisionRuleId) and the
 *             rule's items — review.ruleItems when a review replaced them,
 *             otherwise proposal.items
 *   review    d5TherapistReviews/{proposalId} (reason, changes, reviewedAt)
 *   accepted  proposal.status === "accepted" + d5.confirmation
 *   next      the cycle linked by previousCycleId, or (no proposal) the next
 *             cycle by date that was started on its own
 */
import { isDemoSynthetic, isSimulatedReview } from "./demoSyntheticLabel.js";

const DECISION_LABEL = { no_auto_decision: "不自動判定", maintain: "維持", progress: "進階", adjust: "調整" };

/** Same wording as the 下一階段建議 page's 復健師已檢視並確認 list. */
export function describeReviewChange(change, amountOf) {
  const amount = (x) => amountOf(x.exerciseId, x) || "動作資料未提供訓練量";
  if (change.kind === "replaced") return `第 ${change.position} 個動作：${change.from.exerciseName} → ${change.to.exerciseName}${change.to.dose ? `（${amount(change.to)}）` : ""}`;
  if (change.kind === "dose_changed") return `第 ${change.position} 個動作「${change.to.exerciseName}」訓練量：${amount(change.from)} → ${amount(change.to)}`;
  if (change.kind === "added") return `新增第 ${change.position} 個動作：${change.to.exerciseName}`;
  return `移除第 ${change.position} 個動作：${change.from.exerciseName}`;
}

/**
 * @param p.cycle          the stored week (tracking cycle)
 * @param p.proposal       its D5 proposal (d5.sourceCycleId === cycle.id) or null
 * @param p.review         d5TherapistReviews doc for that proposal, or null
 * @param p.nextCycle      the cycle created from this proposal (previousCycleId link), or null
 * @param p.followingCycle the next cycle by start date when no proposal led to it, or null
 * @param p.nameOf         (exerciseId) => display name
 * @param p.volumeOf       (exerciseId, planItem|null) => training amount text or null
 * @param p.dateOf         (iso | dateKey) => "09/15"
 */
export function describeWeekArrangement({ cycle, proposal = null, review = null, nextCycle = null, followingCycle = null, nameOf = (id) => id, volumeOf = () => null, dateOf = (x) => x }) {
  if (!cycle) return null;
  const item = (it) => ({ exerciseId: it.exerciseId, name: nameOf(it.exerciseId) || it.exerciseName || it.exerciseId, volume: volumeOf(it.exerciseId, it) });
  const ownProposal = proposal && proposal.d5 && proposal.d5.sourceCycleId === cycle.id ? proposal : null;

  if (!ownProposal) {
    let note;
    if (!cycle.reassessmentId) note = "本週尚未完成再次評估，還沒有下一階段建議。";
    else if (followingCycle) note = `本週沒有產生下一階段建議；${dateOf(followingCycle.cycleStartDateKey)} 起的一週由新的評估重新開始，沒有沿用本週安排。`;
    else note = "本週尚未產生下一階段建議。";
    return { state: "none", note, demo: isDemoSynthetic(cycle) };
  }

  const d5 = ownProposal.d5;
  const matrix = DECISION_LABEL[d5.matrixDecision] || d5.matrixDecision;
  const effective = DECISION_LABEL[d5.decision] || d5.decision;
  const ownReview = review && review.proposalId === ownProposal.id && review.patientId === ownProposal.patientId ? review : null;
  const ruleItems = (ownReview && Array.isArray(ownReview.ruleItems) ? ownReview.ruleItems : ownProposal.items) || [];
  const confirmation = ownProposal.status === "accepted" ? d5.confirmation || null : null;
  const viaReview = !!(confirmation && confirmation.therapistReviewId && ownReview && confirmation.therapistReviewId === ownReview.id);

  return {
    state: confirmation ? "accepted" : "awaiting",
    rule: {
      decisionText: `規則建議：${matrix}（${d5.decisionRuleId}）${effective !== matrix ? `；實際下一週：${effective}` : ""}`,
      items: ruleItems.map(item),
    },
    review: ownReview
      ? {
        simulated: isSimulatedReview(ownReview),
        reviewedOn: ownReview.reviewedAt ? dateOf(ownReview.reviewedAt) : null,
        reason: ownReview.reason || "",
        changes: (ownReview.changes || []).map((c) => describeReviewChange(c, volumeOf)),
      }
      : null,
    accepted: confirmation
      ? {
        acceptedOn: confirmation.confirmedAt ? dateOf(confirmation.confirmedAt) : null,
        viaReview,
        items: (ownProposal.items || []).map(item),
      }
      : null,
    next: nextCycle
      ? { text: `${dateOf(nextCycle.cycleStartDateKey)} 起依此安排進行下一週。` }
      : confirmation && confirmation.handoff && confirmation.handoff.requiresFreshBaseline
        ? { text: "已接受；下一週需先完成新的基準評估才會開始。" }
        : null,
    demo: isDemoSynthetic(ownProposal) || isDemoSynthetic(cycle),
  };
}
