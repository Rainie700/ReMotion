import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateWeeklySummary } from "../js/services/llmSummaryValidator.js";
import { buildFallbackSummary } from "../js/services/llmSummaryFallback.js";
const context = JSON.parse(readFileSync(new URL("./fixtures/llmWeeklySummaryCases.json", import.meta.url))).cases.find((c) => c.verifiedContext.functionalAssessment?.valid && c.verifiedContext.functionalAssessment.baselineMs > 0).verifiedContext;
const factual = buildFallbackSummary(context);
assert.equal(validateWeeklySummary(factual, context).passed, true);
const omitted = structuredClone(factual);
for (const audience of ["userSummary", "professionalSummary"]) {
  omitted[audience].functionSummary = "尚無資料";
  omitted[audience].trainingSummary = "尚無資料";
}
const result = validateWeeklySummary(omitted, context);
assert.equal(result.passed, false);
assert.ok(result.errors.some((e) => e.code === "KNOWN_BASELINE_OMITTED"));
console.log("Known-data omission regression passed");
