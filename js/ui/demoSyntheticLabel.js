/**
 * 展示合成資料 / 模擬確認 — on-screen labels for demo records (pure).
 *
 * A demo batch (scripts/demo/patient00History6w) marks every record it adds
 * with `demoSynthetic: true`; a therapist step it simulates is also marked
 * `simulatedReview` (d5TherapistReviews) or `simulatedConfirmation`
 * (llmWeeklySummaries). Pages must show those marks, never only store them.
 * Real records carry none of these fields and get no label.
 */

export const DEMO_SYNTHETIC_TEXT = "展示合成資料";
export const SIMULATED_CONFIRMATION_TEXT = "模擬確認（展示用，非真實復健師操作）";
export const SIMULATED_REVIEW_TEXT = "模擬檢視（展示用，非真實復健師操作）";

export const isDemoSynthetic = (record) => !!(record && record.demoSynthetic === true);
export const isSimulatedConfirmation = (summaryDoc) => !!(summaryDoc && summaryDoc.simulatedConfirmation === true);
export const isSimulatedReview = (review) => !!(review && review.simulatedReview === true);

/** Small inline badge, or "" for a real record. */
export function demoSyntheticBadge(record, text = DEMO_SYNTHETIC_TEXT) {
  return isDemoSynthetic(record) ? `<span class="demo-synthetic-badge">${text}</span>` : "";
}

/**
 * Is a tracking week (cycle + its two assessments) demo data, and which part?
 * @param getSession (id) => stored 5xSTS session or null
 * @returns {{ any: boolean, cycle: boolean, baseline: boolean, reassessment: boolean }}
 */
export function describeWeekSynthetic(cycle, getSession) {
  const s = (id) => (id ? getSession(id) : null);
  const out = {
    cycle: isDemoSynthetic(cycle),
    baseline: isDemoSynthetic(s(cycle && cycle.baselineAssessmentId)),
    reassessment: isDemoSynthetic(s(cycle && cycle.reassessmentId)),
  };
  return { ...out, any: out.cycle || out.baseline || out.reassessment };
}

/** "第 1、2、3、4、6 週" for a trend note, or null when no week is demo data. */
export function syntheticWeeksText(weekNumbers) {
  const list = (weekNumbers || []).filter((n) => Number.isInteger(n));
  return list.length ? `第 ${list.join("、")} 週` : null;
}
