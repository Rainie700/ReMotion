import { buildVerifiedWeeklyContext } from "./llmContextBuilder.js";
import { buildFallbackSummary } from "./llmSummaryFallback.js";
import { validateWeeklySummary } from "./llmSummaryValidator.js";
import { generateWeeklySummaryWithGemini } from "./llmProviderAdapter.js";
import { LLM_SUMMARY_CONFIG } from "../config/llmSummaryConfig.js";
import { createCollection, waitForCloudWrites } from "../data/storageService.js";
import { relationService } from "../data/relationService.js";

const summaries = createCollection("llmWeeklySummaries");

export function getSavedWeeklySummary(cycleId) {
  return summaries.getById(cycleId);
}

export async function confirmWeeklySummary(cycleId, therapistId) {
  const saved = summaries.getById(cycleId);
  if (!saved || saved.therapistId !== therapistId || !relationService.findAcceptedRelation(therapistId, saved.patientId)) throw new Error("not_authorized");
  const result = summaries.update(cycleId, { status: "confirmed", confirmedAt: new Date().toISOString(), confirmedBy: therapistId });
  const sync = await waitForCloudWrites();
  if (sync.failed.some((f) => f.name === "llmWeeklySummaries")) throw new Error("summary_sync_failed");
  return result;
}

export async function createWeeklySummary({ patientId, cycleId, therapistId }) {
  const relation = relationService.findAcceptedRelation(therapistId, patientId);
  if (!relation) throw new Error("not_authorized");
  const built = buildVerifiedWeeklyContext({ userId: patientId, cycleId });
  if (built.error || built.schemaErrors.length) throw new Error(built.error || "verified_context_invalid");
  let summary;
  let source = "gemini";
  let validation = null;
  try {
    summary = await generateWeeklySummaryWithGemini({ verifiedContext: built.context });
    validation = validateWeeklySummary(summary, built.context);
    if (!validation.passed) throw new Error("llm_output_failed_validation");
  } catch (error) {
    summary = buildFallbackSummary(built.context);
    validation = validateWeeklySummary(summary, built.context);
    source = "fallback";
  }
  const entry = {
    id: cycleId,
    therapistId,
    relationId: relation.id,
    cycleId,
    patientId,
    status: "draft",
    source,
    model: source === "gemini" ? LLM_SUMMARY_CONFIG.model : null,
    promptVersion: LLM_SUMMARY_CONFIG.promptVersion,
    createdAt: new Date().toISOString(),
    summary,
    validation: { passed: validation.passed, errorCodes: validation.errors.map((e) => e.code) },
  };
  if (summaries.getById(cycleId)) summaries.update(cycleId, entry);
  else summaries.create(entry);
  const sync = await waitForCloudWrites();
  if (sync.failed.some((f) => f.name === "llmWeeklySummaries")) throw new Error("summary_sync_failed");
  return entry;
}
