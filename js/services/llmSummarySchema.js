/**
 * ReMotion Grounded LLM Weekly Summary — JSON Schema (Draft 2020-12), v1.0.
 * Single schema document with two definitions:
 *   $defs.VerifiedContextV1     what the summary layer may read (built by llmContextBuilder)
 *   $defs.WeeklySummaryOutputV1 what a summary (LLM candidate or fallback) must look like
 * docs/specs/llm-weekly-summary-schema.json is the published copy of this object
 * (a test keeps the two identical). Optional data is null / false / [] — never a
 * made-up default.
 */

const nullable = (schema) => ({ ...schema, type: [schema.type, "null"] });
const DATE = { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const EXERCISE_ID = { type: "string", pattern: "^F0[1-6]-\\d{2}$" };
const TEXT = { type: "string", minLength: 1, maxLength: 400 };

export const LLM_SUMMARY_SCHEMA_VERSION = "1.0";

export const SCHEMA_VALIDATION_NOTE = "The schema document follows JSON Schema Draft 2020-12. Runtime validation in ReMotion Phase 1A uses a project-specific deterministic subset validator (js/services/llmSummarySchema.js: $ref to $defs, type, const, enum, required, properties, additionalProperties false, items, minLength, maxLength, pattern, minimum, maximum, exclusiveMinimum, maxItems, uniqueItems). It is not a complete JSON Schema implementation; keywords outside this subset are not evaluated.";

export const LLM_WEEKLY_SUMMARY_SCHEMA = Object.freeze({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://remotion.local/schemas/llm-weekly-summary-1.0.json",
  title: "ReMotion Grounded LLM Weekly Summary v1.0",
  $comment: SCHEMA_VALIDATION_NOTE,
  $defs: {
    VerifiedContextV1: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "contextType", "cycleId", "weekNumber", "period", "functionalAssessment", "training", "goal", "currentExercises", "decision", "reportedIssues"],
      properties: {
        schemaVersion: { const: "1.0" },
        contextType: { const: "weekly_rehabilitation_summary" },
        cycleId: { type: "string", minLength: 1 },
        weekNumber: { type: ["integer", "null"], minimum: 1 },
        period: {
          type: "object",
          additionalProperties: false,
          required: ["startDate", "endDate"],
          properties: { startDate: nullable(DATE), endDate: nullable(DATE) },
        },
        functionalAssessment: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["assessmentType", "baselineMs", "baselineDisplay", "reassessmentMs", "reassessmentDisplay", "differenceMs", "differenceDisplay", "valid"],
          properties: {
            assessmentType: { const: "5xSTS" },
            baselineMs: { type: ["number", "null"], exclusiveMinimum: 0 },
            baselineDisplay: { type: ["string", "null"] },
            reassessmentMs: { type: ["number", "null"], exclusiveMinimum: 0 },
            reassessmentDisplay: { type: ["string", "null"] },
            differenceMs: { type: ["number", "null"] },
            differenceDisplay: { type: ["string", "null"] },
            valid: { type: "boolean" },
          },
        },
        training: {
          type: "object",
          additionalProperties: false,
          required: ["completedDays", "formalRecordCount", "aiPostureAverage", "aiPostureScoreAvailable"],
          properties: {
            completedDays: { type: ["integer", "null"], minimum: 0 },
            formalRecordCount: { type: ["integer", "null"], minimum: 0 },
            aiPostureAverage: { type: ["number", "null"], minimum: 0, maximum: 100 },
            aiPostureScoreAvailable: { type: "boolean" },
          },
        },
        goal: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["goalId", "label"],
          properties: { goalId: { type: "string", pattern: "^G\\d{2}$" }, label: { type: "string", minLength: 1 } },
        },
        currentExercises: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["exerciseId", "name"],
            properties: { exerciseId: EXERCISE_ID, name: { type: "string", minLength: 1 } },
          },
        },
        // D5, in the stored layers (canonical D5_DECISION values, never renamed):
        //   ruleOutcome        d5.matrixDecision — what the D5 decision rules returned
        //   confirmationStatus proposal.status — only "accepted" may reach the context (spec §4.2)
        //   confirmedAction    d5.decision — the effective decision after exercise selection
        //                      (e.g. progress -> maintain when no confirmed progression exists)
        //   transitions        the confirmed selection (current -> proposed exercises)
        decision: {
          type: ["object", "null"],
          additionalProperties: false,
          required: ["ruleOutcome", "confirmationStatus", "confirmedAction", "transitions"],
          properties: {
            ruleOutcome: { enum: ["progress", "maintain", "adjust", "no_auto_decision"] },
            confirmationStatus: { const: "accepted" },
            confirmedAction: { enum: ["progress", "maintain", "adjust", "no_auto_decision"] },
            transitions: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["fromExerciseId", "fromName", "toExerciseId", "toName", "transitionType"],
                properties: {
                  fromExerciseId: EXERCISE_ID,
                  fromName: { type: "string", minLength: 1 },
                  toExerciseId: EXERCISE_ID,
                  toName: { type: "string", minLength: 1 },
                  transitionType: { enum: ["progress", "maintain", "regression", "same_goal_replacement"] },
                },
              },
            },
          },
        },
        reportedIssues: {
          type: "object",
          additionalProperties: false,
          required: ["newDiscomfort", "newLimitation", "professionalReviewRequired"],
          properties: {
            newDiscomfort: { type: ["boolean", "null"] },
            newLimitation: { type: ["boolean", "null"] },
            professionalReviewRequired: { type: ["boolean", "null"] },
          },
        },
      },
    },
    WeeklySummaryOutputV1: {
      type: "object",
      additionalProperties: false,
      required: ["schemaVersion", "cycleId", "userSummary", "professionalSummary", "attentionNotes", "evidenceFactIds"],
      properties: {
        schemaVersion: { const: "1.0" },
        cycleId: { type: "string", minLength: 1 },
        userSummary: {
          type: "object",
          additionalProperties: false,
          required: ["headline", "functionSummary", "trainingSummary", "nextPlanSummary"],
          properties: { headline: { type: "string", minLength: 1, maxLength: 60 }, functionSummary: TEXT, trainingSummary: TEXT, nextPlanSummary: TEXT },
        },
        professionalSummary: {
          type: "object",
          additionalProperties: false,
          required: ["functionSummary", "trainingSummary", "planSummary"],
          properties: { functionSummary: TEXT, trainingSummary: TEXT, planSummary: TEXT },
        },
        attentionNotes: { type: "array", maxItems: 5, items: TEXT },
        evidenceFactIds: { type: "array", uniqueItems: true, items: { type: "string", pattern: "^[a-z_]+(\\.[A-Za-z0-9_-]+)+$" } },
      },
    },
  },
});

// ── project-specific deterministic SUBSET validator — not a full JSON Schema
//    Draft 2020-12 implementation; only the keywords listed in SCHEMA_VALIDATION_NOTE ──

const typeOf = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v);
const typeMatches = (value, t) => t === typeOf(value) || (t === "number" && typeof value === "number" && Number.isFinite(value));

/**
 * @returns {Array<{ path: string, message: string }>} empty = valid
 */
export function validateAgainstSchema(schema, value, path = "", root = schema) {
  if (schema.$ref) {
    const name = schema.$ref.replace(/^#\/\$defs\//, "");
    return validateAgainstSchema(root.$defs[name], value, path, root);
  }
  const errors = [];
  const at = path || "(root)";
  if ("const" in schema && value !== schema.const) errors.push({ path: at, message: `must be ${JSON.stringify(schema.const)}` });
  if (schema.enum && !schema.enum.includes(value)) errors.push({ path: at, message: `must be one of ${JSON.stringify(schema.enum)}` });
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => typeMatches(value, t))) return [...errors, { path: at, message: `must be ${types.join(" | ")}` }];
  }
  if (typeof value === "string") {
    if (schema.minLength != null && value.length < schema.minLength) errors.push({ path: at, message: `shorter than ${schema.minLength}` });
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push({ path: at, message: `longer than ${schema.maxLength}` });
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push({ path: at, message: `does not match ${schema.pattern}` });
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errors.push({ path: at, message: `below ${schema.minimum}` });
    if (schema.maximum != null && value > schema.maximum) errors.push({ path: at, message: `above ${schema.maximum}` });
    if (schema.exclusiveMinimum != null && value <= schema.exclusiveMinimum) errors.push({ path: at, message: `must be > ${schema.exclusiveMinimum}` });
  }
  if (Array.isArray(value)) {
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push({ path: at, message: `more than ${schema.maxItems} items` });
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length) errors.push({ path: at, message: "items must be unique" });
    if (schema.items) value.forEach((item, i) => errors.push(...validateAgainstSchema(schema.items, item, `${path}[${i}]`, root)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push({ path: path ? `${path}.${key}` : key, message: "is required" });
    const props = schema.properties || {};
    for (const [key, v] of Object.entries(value)) {
      const child = path ? `${path}.${key}` : key;
      if (props[key]) errors.push(...validateAgainstSchema(props[key], v, child, root));
      else if (schema.additionalProperties === false) errors.push({ path: child, message: "is not allowed (additionalProperties: false)" });
    }
  }
  return errors;
}

export const validateVerifiedContext = (context) => validateAgainstSchema({ $ref: "#/$defs/VerifiedContextV1" }, context, "", LLM_WEEKLY_SUMMARY_SCHEMA);
export const validateSummaryOutputSchema = (output) => validateAgainstSchema({ $ref: "#/$defs/WeeklySummaryOutputV1" }, output, "", LLM_WEEKLY_SUMMARY_SCHEMA);
