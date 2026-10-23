/**
 * AI 週摘要 — confirmed (published) version vs. pending draft, in ONE doc per
 * cycle (llmWeeklySummaries/{cycleId}). Pure; no storage access.
 *
 *   top level   the working copy: the latest generated draft, or — right after
 *               confirmation — the same content as `published`
 *               (status "draft" | "confirmed").
 *   published   the version the patient sees: a snapshot taken at
 *               confirmation with ITS OWN summary, source, model, creation
 *               time and confirmation date. Regenerating never touches it.
 *
 * Legacy docs (before `published` existed): status "confirmed" with no
 * `published` field — the top level IS the confirmed version. They are read
 * as such, never rewritten in bulk; the first regenerate of such a doc copies
 * that confirmed content into `published` before writing the new draft.
 */

/** Identifies one generated draft; the confirm action must name it. Legacy docs fall back to createdAt. */
export function getDraftToken(doc) {
  return doc ? doc.draftId || doc.createdAt || null : null;
}

function snapshotOf(doc, { confirmedAt, confirmedBy }) {
  return {
    summary: doc.summary,
    source: doc.source || null,
    model: doc.model || null,
    promptVersion: doc.promptVersion || null,
    createdAt: doc.createdAt || null,
    validation: doc.validation || null,
    draftId: getDraftToken(doc),
    confirmedAt: confirmedAt || null,
    confirmedBy: confirmedBy || null,
  };
}

/** The confirmed version the patient may see, or null (draft-only / nothing confirmed). */
export function getPublishedVersion(doc) {
  if (!doc) return null;
  if (doc.published && doc.published.summary) return doc.published;
  if (doc.published === undefined && doc.status === "confirmed" && doc.summary) {
    return snapshotOf(doc, { confirmedAt: doc.confirmedAt, confirmedBy: doc.confirmedBy }); // legacy format
  }
  return null;
}

/** The draft waiting for confirmation, or null. */
export function getPendingDraft(doc) {
  return doc && doc.status === "draft" && doc.summary ? doc : null;
}

/**
 * The doc to write when a new draft is generated: the draft at the top level,
 * the previously confirmed version (legacy included) kept in `published`.
 */
export function buildDraftEntry(existing, draft) {
  return {
    ...draft,
    status: "draft",
    confirmedAt: null,
    confirmedBy: null,
    published: getPublishedVersion(existing),
  };
}

/** The patch that confirms the doc's current draft and makes it the published version. */
export function buildConfirmPatch(doc, { confirmedAt, confirmedBy }) {
  return {
    status: "confirmed",
    confirmedAt,
    confirmedBy,
    published: snapshotOf(doc, { confirmedAt, confirmedBy }),
  };
}

/** Doc id, doc cycleId and the content's own cycleId must all name the same cycle. */
export function isSummaryDocConsistent(doc, version = doc) {
  if (!doc || !doc.cycleId || doc.id !== doc.cycleId) return false;
  const inner = version && version.summary;
  return !!inner && (!inner.cycleId || inner.cycleId === doc.cycleId);
}
