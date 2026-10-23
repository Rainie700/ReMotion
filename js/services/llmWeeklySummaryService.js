import { buildVerifiedWeeklyContext } from "./llmContextBuilder.js";
import { buildFallbackSummary } from "./llmSummaryFallback.js";
import { validateWeeklySummary } from "./llmSummaryValidator.js";
import { generateWeeklySummaryWithGemini } from "./llmProviderAdapter.js";
import { LLM_SUMMARY_CONFIG } from "../config/llmSummaryConfig.js";
import { createCollection, waitForCloudWrites } from "../data/storageService.js";
import { relationService } from "../data/relationService.js";
import { buildDraftEntry, buildConfirmPatch, getDraftToken, getPendingDraft, isSummaryDocConsistent } from "../data/weeklySummaryVersions.js";

const summaries = createCollection("llmWeeklySummaries");

export function getSavedWeeklySummary(cycleId) {
  return summaries.getById(cycleId);
}

/** Every stored summary of one patient (any status) — callers filter what they may show. */
export function listWeeklySummariesForPatient(patientId) {
  return patientId ? summaries.query((s) => s.patientId === patientId) : [];
}

/** Puts back the doc as it was before a write whose cloud save failed (local only — the cloud never changed). */
function restoreLocal(cycleId, previous) {
  const others = summaries.list().filter((s) => s.id !== cycleId);
  summaries.replaceAll(previous ? [...others, previous] : others);
}

/** Writes one summary doc and waits for ITS cloud save; on failure the local copy is restored and an error thrown. */
async function writeAndSync(cycleId, previous, write, syncWrites) {
  await syncWrites(); // settle earlier writes so only this write's outcome is judged
  const result = write();
  const sync = await syncWrites();
  if (sync.failed.some((f) => f.name === "llmWeeklySummaries" && (!f.id || f.id === cycleId))) {
    restoreLocal(cycleId, previous);
    throw new Error("summary_sync_failed");
  }
  return result;
}

/**
 * Confirms the draft the therapist is looking at (`expectedDraftToken`) and
 * makes it the published version. Anything else — another draft generated in
 * the meantime, no pending draft, a doc of another cycle — is refused. The
 * previously published version stays (locally and in the cloud) unless the
 * cloud save of the confirmation succeeds.
 */
export async function confirmWeeklySummary(cycleId, therapistId, expectedDraftToken, { syncWrites = waitForCloudWrites, now = () => new Date().toISOString() } = {}) {
  const saved = summaries.getById(cycleId);
  if (!saved || saved.therapistId !== therapistId || !relationService.findAcceptedRelation(therapistId, saved.patientId)) throw new Error("not_authorized");
  if (!isSummaryDocConsistent(saved)) throw new Error("summary_cycle_mismatch");
  if (!getPendingDraft(saved)) throw new Error("no_pending_draft");
  if (!expectedDraftToken || getDraftToken(saved) !== expectedDraftToken) throw new Error("draft_changed");
  const patch = buildConfirmPatch(saved, { confirmedAt: now(), confirmedBy: therapistId });
  return writeAndSync(cycleId, saved, () => summaries.update(cycleId, patch), syncWrites);
}

/**
 * Generates a new DRAFT for the cycle. The confirmed version (if any, legacy
 * format included) is carried over untouched in `published`; a failed save
 * leaves the stored doc exactly as it was.
 */
export async function createWeeklySummary({ patientId, cycleId, therapistId }, { generate = generateWeeklySummaryWithGemini, syncWrites = waitForCloudWrites, now = () => new Date().toISOString() } = {}) {
  const relation = relationService.findAcceptedRelation(therapistId, patientId);
  if (!relation) throw new Error("not_authorized");
  const built = buildVerifiedWeeklyContext({ userId: patientId, cycleId });
  if (built.error || built.schemaErrors.length) throw new Error(built.error || "verified_context_invalid");
  let summary;
  let source = "gemini";
  let validation = null;
  try {
    summary = await generate({ verifiedContext: built.context });
    validation = validateWeeklySummary(summary, built.context);
    if (!validation.passed) throw new Error("llm_output_failed_validation");
  } catch (error) {
    summary = buildFallbackSummary(built.context);
    validation = validateWeeklySummary(summary, built.context);
    source = "fallback";
  }
  // Read the stored doc only now (after the possibly slow model call), so the version carried over is the current one.
  const existing = summaries.getById(cycleId);
  if (existing && (existing.patientId !== patientId || existing.cycleId !== cycleId)) throw new Error("summary_owner_mismatch");
  const createdAt = now();
  const entry = buildDraftEntry(existing, {
    id: cycleId,
    therapistId,
    relationId: relation.id,
    cycleId,
    patientId,
    source,
    model: source === "gemini" ? LLM_SUMMARY_CONFIG.model : null,
    promptVersion: LLM_SUMMARY_CONFIG.promptVersion,
    createdAt,
    draftId: `${cycleId}:${createdAt}`,
    summary,
    validation: { passed: validation.passed, errorCodes: validation.errors.map((e) => e.code) },
  });
  await writeAndSync(cycleId, existing, () => (existing ? summaries.update(cycleId, entry) : summaries.create(entry)), syncWrites);
  return entry;
}
