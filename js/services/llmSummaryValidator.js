/**
 * Grounded LLM Weekly Summary — validator (Phase 1A, deterministic, no LLM).
 * Validates a candidate WeeklySummaryOutputV1 against the VerifiedContextV1 it
 * was generated from. Checks (spec §10-§12): schema + cycleId, numerical
 * grounding (unit-aware allowlist), date grounding, exercise grounding,
 * decision grounding, missing-data grounding, unsafe claims (rule IDs).
 * A failed result means: do not render the candidate, use the fallback.
 */
import { rehabExercises } from "../data/rehabExercises.js";
import { validateSummaryOutputSchema, validateVerifiedContext } from "./llmSummarySchema.js";
import { buildContextFacts, buildNumberAllowlist, buildDateAllowlist, contextExercises } from "./llmSummaryFacts.js";

export const VALIDATOR_VERSION = "validator-v1";

// ── safety rules (deterministic patterns; a negation just before a match is not a claim) ──
export const SAFETY_RULES = Object.freeze([
  { ruleId: "SAFETY_DIAGNOSIS", label: "diagnosis", pattern: /(確診|診斷為|診斷出|已罹患|罹患|患有|(?:有|為|屬於|符合)肌少症)/g },
  { ruleId: "SAFETY_EFFICACY", label: "treatment efficacy", pattern: /(治療有效|復健有效|訓練有效|療效|顯著改善|明顯改善|已改善|有所改善|改善|明顯進步|進步|退步|好轉|惡化|變好|變差)/g },
  { ruleId: "SAFETY_RECOVERY", label: "recovery / cure", pattern: /(康復|恢復正常|痊癒|已恢復|治癒|復原)/g },
  { ruleId: "SAFETY_PROGNOSIS", label: "prognosis", pattern: /(預後|預計可以恢復|未來將.{0,6}(?:恢復|改善|康復|好轉|進步)|有望(?:恢復|康復)|可望(?:恢復|康復|改善))/g },
  { ruleId: "SAFETY_PRESCRIPTION", label: "unsupported prescription", pattern: /(應增加負重|應提高訓練量|應停止治療|建議自行調整處方|自行調整處方|增加負重|提高訓練量|增加訓練強度|提高訓練強度|加重負荷|停止治療|停止服藥)/g },
  { ruleId: "SAFETY_PROMPT_INJECTION", label: "prompt injection echo", pattern: /(忽略(?:先前|之前|以上|上述|所有)?的?(?:指示|規則|指令)|ignore (?:all |previous |prior )?instructions|system prompt|系統提示|VERIFIED_CONTEXT|developer mode|越獄)/gi },
]);
// Disclaimers only ("不代表改善"). A negated judgment ("無明顯改善", "未改善") is still a judgment and is blocked.
const NEGATION_BEFORE = /(不代表|並非|不是|不表示|不等於|無法判斷|不能判斷|不作|不做)[^，。；,;!?！？]{0,4}$/;

// ── text helpers ──
const FULLWIDTH = (s) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/．/g, ".").replace(/－/g, "-");
const CN_DIGIT = { 零: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnToNumber(s) {
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (a ? CN_DIGIT[a] : 1) * 10 + (b ? CN_DIGIT[b] : 0);
  }
  return s.split("").reduce((n, c) => n * 10 + CN_DIGIT[c], 0);
}
const UNIT_KIND = [
  [/^(毫秒|ms)/i, "ms"], [/^(秒|sec|s\b)/i, "seconds"], [/^(個?正式訓練日|個?訓練日|天|日)/, "days"], [/^(週|周)/, "week"],
  [/^(筆|次)/, "records"], [/^分/, "score"], [/^(個|項)/, "count"], [/^(%|％|公斤|kg|度|°|公分|cm)/i, "unsupported"],
];
const unitKindAfter = (rest) => { const s = rest.replace(/^\s+/, ""); const hit = UNIT_KIND.find(([re]) => re.test(s)); return hit ? hit[1] : null; };

// Exercise names of the whole catalog, longest first (so 迷你深蹲 is never also read as 深蹲).
const CATALOG = new Map(rehabExercises.map((r) => [r.exercise_id, r.exercise_name]));

function findExercises(text, known) {
  const names = [...new Map([...CATALOG, ...known].map(([id, name]) => [name, id])).entries()].sort((a, b) => b[0].length - a[0].length);
  let masked = text;
  const found = [];
  for (const [name, id] of names) {
    let idx = masked.indexOf(name);
    while (idx !== -1) {
      found.push({ id, name, index: idx });
      masked = masked.slice(0, idx) + "\u0000".repeat(name.length) + masked.slice(idx + name.length);
      idx = masked.indexOf(name);
    }
  }
  for (const m of text.matchAll(/F0[1-6]-\d{2}/g)) found.push({ id: m[0], name: m[0], index: m.index });
  return found.sort((a, b) => a.index - b.index);
}

/** Every text field of an output, with its path. */
function textFields(output) {
  const out = [];
  const push = (path, v) => { if (typeof v === "string") out.push({ path, text: v }); };
  for (const k of ["headline", "functionSummary", "trainingSummary", "nextPlanSummary"]) push(`userSummary.${k}`, output.userSummary && output.userSummary[k]);
  for (const k of ["functionSummary", "trainingSummary", "planSummary"]) push(`professionalSummary.${k}`, output.professionalSummary && output.professionalSummary[k]);
  (Array.isArray(output.attentionNotes) ? output.attentionNotes : []).forEach((n, i) => push(`attentionNotes[${i}]`, n));
  return out;
}

const DATE_PATTERNS = [
  { re: /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g, parse: (m) => ({ y: +m[1], mo: +m[2], d: +m[3] }) },
  { re: /(\d{1,2})\s*月\s*(\d{1,2})\s*日/g, parse: (m) => ({ y: null, mo: +m[1], d: +m[2] }) },
  { re: /(?<![\d.])(\d{1,2})\/(\d{1,2})(?![\d/])/g, parse: (m) => ({ y: null, mo: +m[1], d: +m[2] }) },
];
const CHANGE_WORDS = /(提高|增加|加強|加重|提升|升級|進階|調整|改為|改成|換成|替換|取代|降低|減少|減輕|退階|難度)/;
const KEEP_WORDS = /(維持|保持|不變|照原|沿用|繼續)/;
const PLAN_WORDS = /(下一週|下週|下個週期|下一階段|下一次訓練)/;
const DECISION_TOKENS = /\b(progress_candidate|progress|maintain|adjust|regression|same_goal_replacement|no_auto_decision)\b/g;

/**
 * @param {object} candidate WeeklySummaryOutputV1 candidate (e.g. parsed LLM JSON)
 * @param {object} context   VerifiedContextV1
 * @returns {{ passed, errors, warnings, checks, validatorVersion }}
 */
export function validateWeeklySummary(candidate, context) {
  const errors = [];
  const warnings = [];
  const checks = { schema: true, numbers: true, exercises: true, decisions: true, dates: true, missingData: true, unsafeClaims: true };
  const fail = (check, code, message, path, detectedValue, extra = {}) => {
    checks[check] = false;
    errors.push({ code, message, path, ...(detectedValue !== undefined ? { detectedValue } : {}), ...extra });
  };

  // 1. schema + cycleId
  const ctxErrors = validateVerifiedContext(context);
  if (ctxErrors.length) {
    ctxErrors.forEach((e) => fail("schema", "INVALID_CONTEXT", `context ${e.message}`, `context.${e.path}`));
    return { passed: false, errors, warnings, checks, validatorVersion: VALIDATOR_VERSION };
  }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    fail("schema", "SCHEMA_INVALID", "output is not a JSON object", "(root)");
    return { passed: false, errors, warnings, checks, validatorVersion: VALIDATOR_VERSION };
  }
  for (const e of validateSummaryOutputSchema(candidate)) fail("schema", "SCHEMA_INVALID", e.message, e.path);
  if (typeof candidate.cycleId === "string" && candidate.cycleId !== context.cycleId) fail("schema", "CYCLE_ID_MISMATCH", "output cycleId differs from the context", "cycleId", candidate.cycleId);

  const numbers = buildNumberAllowlist(context);
  const dates = buildDateAllowlist(context);
  const known = contextExercises(context);
  const facts = buildContextFacts(context);
  const fa = context.functionalAssessment;
  const hasReassessment = !!(fa && fa.valid && Number.isFinite(fa.reassessmentMs));
  const hasBaseline = !!(fa && fa.valid && Number.isFinite(fa.baselineMs));
  const aiAvailable = !!(context.training && context.training.aiPostureScoreAvailable);
  const decision = context.decision && context.decision.confirmationStatus === "accepted" ? context.decision : null;
  const transitionsFrom = new Map(((decision && decision.transitions) || []).map((t) => [t.fromExerciseId, t]));
  const allowedDecisionTokens = new Set();
  if (decision) {
    allowedDecisionTokens.add(decision.ruleOutcome);
    allowedDecisionTokens.add(decision.confirmedAction);
    for (const t of decision.transitions) allowedDecisionTokens.add(t.transitionType);
  }

  for (const { path, text: raw } of textFields(candidate)) {
    let text = FULLWIDTH(raw);

    // 2. dates (then removed so they are not read as numbers)
    for (const { re, parse } of DATE_PATTERNS) {
      text = text.replace(re, (...m) => {
        const { y, mo, d } = parse(m);
        const ok = [...dates].some((iso) => (y === null || +iso.slice(0, 4) === y) && +iso.slice(5, 7) === mo && +iso.slice(8, 10) === d);
        if (!ok) fail("dates", "UNVERIFIED_DATE", "date not present in the verified context", path, m[0]);
        return " ";
      });
    }

    // 3. exercises (IDs / catalog names must be in the context)
    const mentioned = findExercises(text, known);
    for (const ex of mentioned) if (!known.has(ex.id)) fail("exercises", "UNKNOWN_EXERCISE", "exercise not present in currentExercises / decision.transitions", path, ex.name);

    // 4. numbers — system labels are not measurements
    const numeric = text
      .replace(/F0[1-6]-\d{2}/g, " ").replace(/\bF0[1-6]\b/g, " ").replace(/\bD[1-9]\b/g, " ")
      .replace(/5\s*x\s*STS|五次坐站|5\s*次坐站/gi, " ")
      .replace(/(上|下|前|這|本|每|同|單)一(週|周)/g, " ");
    for (const m of numeric.matchAll(/-?\d+(?:\.\d+)?/g)) {
      const value = Number(m[0]);
      const before = numeric.slice(Math.max(0, m.index - 1), m.index);
      const kind = /第\s*$/.test(numeric.slice(Math.max(0, m.index - 2), m.index)) && /^\s*(週|周)/.test(numeric.slice(m.index + m[0].length)) ? "week" : unitKindAfter(numeric.slice(m.index + m[0].length));
      const pool = kind === "unsupported" ? new Set() : kind ? numbers[kind] : numbers.any;
      const alt = m[0].startsWith("-") ? Math.abs(value) : null;
      if (!(pool.has(value) || (alt !== null && pool.has(alt)) || (before === "-" && pool.has(-value)))) {
        fail("numbers", "UNVERIFIED_NUMBER", `number ${m[0]}${kind ? ` (${kind})` : ""} is not in the verified context`, path, m[0]);
      }
    }
    for (const m of numeric.matchAll(/([零一二兩三四五六七八九十]+)(?=\s*(個?正式訓練日|個?訓練日|天|筆|秒|週|周|個動作))/g)) {
      const value = cnToNumber(m[1]);
      const kind = unitKindAfter(numeric.slice(m.index + m[0].length));
      const pool = kind ? numbers[kind] || numbers.any : numbers.any;
      if (!pool.has(value)) fail("numbers", "UNVERIFIED_NUMBER", `number ${m[1]} (${kind}) is not in the verified context`, path, m[1]);
    }

    // 5. decisions, clause by clause
    const clauses = text.split(/[，。；;！？!?\n、]/).filter((c) => c.trim());
    for (const clause of clauses) {
      const exs = findExercises(clause, known).filter((e) => known.has(e.id));
      const change = CHANGE_WORDS.test(clause);
      const keep = KEEP_WORDS.test(clause);
      if (!decision && PLAN_WORDS.test(clause) && (change || keep)) fail("decisions", "DECISION_FABRICATION", "next-plan statement without a confirmed decision", path, clause.trim());
      for (const ex of exs) {
        const t = transitionsFrom.get(ex.id);
        const isTarget = ((decision && decision.transitions) || []).some((x) => x.toExerciseId === ex.id && x.fromExerciseId !== ex.id);
        if (!t) {
          if (decision && !isTarget && (change || keep)) fail("decisions", "DECISION_FABRICATION", "plan statement for an exercise without a confirmed transition", path, ex.name);
          continue;
        }
        const clauseHasTarget = exs.some((o) => o.id === t.toExerciseId && o.id !== ex.id);
        if (t.transitionType === "maintain" && change && !exs.some((o) => o.id !== ex.id)) fail("decisions", "DECISION_MISMATCH", "maintained exercise described as changed", path, clause.trim());
        if (t.transitionType !== "maintain" && keep && !clauseHasTarget) fail("decisions", "DECISION_MISMATCH", "changed exercise described as maintained", path, clause.trim());
        const otherTargets = exs.filter((o) => o.id !== ex.id && o.id !== t.toExerciseId && !transitionsFrom.has(o.id));
        const wrongTarget = t.transitionType !== "maintain" && !clauseHasTarget && exs.some((o) => o.id !== ex.id);
        if (change && (otherTargets.length || wrongTarget)) fail("decisions", "DECISION_MISMATCH", "exercise changed to a target other than the confirmed transition", path, (otherTargets[0] || exs.find((o) => o.id !== ex.id)).name);
      }
    }
    if (decision && decision.confirmedAction === "maintain" && /進階/.test(text)) fail("decisions", "DECISION_MISMATCH", "maintain decision described as progression", path, "進階");
    for (const m of text.matchAll(DECISION_TOKENS)) if (!allowedDecisionTokens.has(m[1])) fail("decisions", "DECISION_MISMATCH", "decision label differs from the confirmed decision", path, m[1]);

    // 6. missing data
    for (const clause of clauses) {
      const nums = clause.match(/\d+(?:\.\d+)?\s*(秒|毫秒|ms)/g) || [];
      if (!hasReassessment && nums.length && /(再次評估|複測|第二次評估|前後差異|完成時間差異|差異)/.test(clause) && !/(預定|尚未|未進行)/.test(clause)) {
        fail("missingData", "MISSING_DATA_FABRICATION", "reassessment / difference stated but not available in the context", path, clause.trim());
      }
      if (!hasBaseline && nums.length) fail("missingData", "MISSING_DATA_FABRICATION", "assessment time stated but no valid assessment in the context", path, clause.trim());
      if (!aiAvailable && /(AI|姿勢分數|分數)/i.test(clause) && /\d/.test(clause.replace(/F0[1-6]-\d{2}|\bF0[1-6]\b|\bD[1-9]\b/g, ""))) {
        fail("missingData", "MISSING_DATA_FABRICATION", "AI posture score stated but not available in the context", path, clause.trim());
      }
    }

    // 7. unsafe claims
    for (const rule of SAFETY_RULES) {
      for (const m of raw.matchAll(rule.pattern)) {
        if (NEGATION_BEFORE.test(raw.slice(Math.max(0, m.index - 10), m.index))) continue;
        fail("unsafeClaims", rule.ruleId, `unsafe ${rule.label} claim`, path, m[0]);
      }
    }
  }

  // evidence fact IDs must point at facts that exist
  for (const id of Array.isArray(candidate.evidenceFactIds) ? candidate.evidenceFactIds : []) {
    if (!facts.has(id)) fail("missingData", "UNKNOWN_EVIDENCE_FACT", "evidence fact is not present in the verified context", "evidenceFactIds", id);
  }
  const allText = textFields(candidate).map((f) => f.text).join("\n");
  // A generic "no data" response must not pass merely because it invents nothing.
  for (const audience of errors.length ? [] : ["userSummary", "professionalSummary"]) {
    const fields = candidate[audience] || {};
    const functionText = fields.functionSummary || "";
    const trainingText = fields.trainingSummary || "";
    if (hasBaseline && ![String(fa.baselineMs), String(Number((fa.baselineMs / 1000).toFixed(1)))].some((n) => new RegExp(`(?<![0-9.])${n.replace(/\./g, "\\.")}(?![0-9.])`).test(functionText))) {
      fail("missingData", "KNOWN_BASELINE_OMITTED", "available baseline must be included", `${audience}.functionSummary`);
    }
    if (hasBaseline && /^(?:尚無資料|無資料|沒有資料)[。.]?$/.test(functionText.trim())) {
      fail("missingData", "KNOWN_DATA_DENIED", "available assessment described as missing", `${audience}.functionSummary`);
    }
    if (Number.isInteger(context.training && context.training.completedDays) && /^(?:尚無資料|無資料|沒有資料)[。.]?$/.test(trainingText.trim())) {
      fail("missingData", "KNOWN_DATA_DENIED", "available training count described as missing", `${audience}.trainingSummary`);
    }
  }
  if (context.reportedIssues && context.reportedIssues.professionalReviewRequired && !/專業/.test(allText)) {
    warnings.push({ code: "PROFESSIONAL_REVIEW_NOT_MENTIONED", message: "context requires professional review but the summary does not say so", path: "attentionNotes" });
  }
  return { passed: errors.length === 0, errors, warnings, checks, validatorVersion: VALIDATOR_VERSION };
}
