/**
 * F01 goal ↔ exercise evidence trail — G01「從椅子起身更順」only (first recommendation).
 *
 * Traceability, not a rule: nothing here changes which exercises are picked, their
 * order, count, amount or the limitation filter. The relation itself still comes from
 * F01_Goal候選池 (js/data/f01RecommendationSpec.js) and stays a system rule pending
 * professional validation.
 *
 * Three facts are kept apart and never stand in for one another:
 *   studyFound          a study related to the exercise was located
 *   readLevel           how much of it was read: lead_only / abstract_read / full_text_read
 *   professionalReview  whether a professional confirmed the goal ↔ exercise relation
 *
 * Study fields copy the PubMed abstracts (NCBI E-utilities efetch, retrieved 2026-10-27);
 * no full text was read.
 */

export const EVIDENCE_READ_LEVEL = Object.freeze({
  LEAD_ONLY: "lead_only",
  ABSTRACT_READ: "abstract_read",
  FULL_TEXT_READ: "full_text_read",
});
export const EVIDENCE_READ_LEVEL_LABEL = Object.freeze({
  lead_only: "只有來源線索，尚未閱讀",
  abstract_read: "只讀過公開摘要，尚未讀全文",
  full_text_read: "已讀全文",
});
export const PROFESSIONAL_REVIEW = Object.freeze({ PENDING: "pending", CONFIRMED: "confirmed" });
export const PROFESSIONAL_REVIEW_LABEL = Object.freeze({
  pending: "尚未經專業人員確認此對應",
  confirmed: "已經專業人員確認此對應",
});

const ABSTRACT_SOURCE = "PubMed 摘要（NCBI E-utilities，2026-10-27 擷取）";

export const F01_GOAL_EVIDENCE = Object.freeze([
  Object.freeze({
    goalId: "G01",
    exerciseId: "F01-04",
    relation: "direct",
    mappingStatus: "System Rule - needs validation",
    shortReason: "你選擇「從椅子起身更順」作為目標。坐姿起立直接練習由坐到站的動作，因此列為主要候選。",
    systemRationale: "系統對應表把坐姿起立列為此目標的主要候選，原因是它與五次坐站測驗是同一個起身動作（候選池備註：F01-04 為 5xSTS 最直接對應）。",
    professionalReview: PROFESSIONAL_REVIEW.PENDING,
    studies: Object.freeze([Object.freeze({
      pmid: "11890578",
      title: "Task-specific resistance training to improve the ability of activities of daily living-impaired older adults to rise from a bed and from a chair",
      authors: "Alexander NB, et al.",
      journal: "J Am Geriatr Soc",
      year: 2001,
      url: "https://pubmed.ncbi.nlm.nih.gov/11890578/",
      doi: "10.1046/j.1532-5415.2001.4911232.x",
      readLevel: EVIDENCE_READ_LEVEL.ABSTRACT_READ,
      readVia: ABSTRACT_SOURCE,
      population: "7 處集合住宅中 65 歲以上、至少一項行動相關日常活動需要協助的住民（161 人，平均 82 歲）",
      intervention: "12 週針對床上與椅子起身分解動作的阻力訓練（例如加負重練習滑坐到椅緣），對照組為柔軟度訓練",
      mainResults: "12 週時可完成的起身任務總數較多；各項起身時間較對照組改善約 11%～20%（最多約 1.5 秒），作者認為實際改善幅度在臨床上偏小",
      supports: "在這群需要協助的長者中，針對起身分解動作的阻力訓練可以改善椅子與床上起身的表現",
      cannotInfer: "不能當成 App 單一「坐姿起立」動作或其預設組數、次數的直接驗證；研究是含分解動作與負重的 12 週課程、對象與場域不同，也不是以鏡頭量測的五次坐站",
    })]),
  }),
  Object.freeze({
    goalId: "G01",
    exerciseId: "F01-01",
    relation: "supporting",
    mappingStatus: "System Rule - needs validation",
    shortReason: "深蹲是現有系統設定中「從椅子起身更順」的輔助候選（複合下肢肌力），不是由評估結果判斷出的需求。",
    systemRationale: "系統對應表依動作資料的訓練目標與目標肌群，把深蹲列為此目標的輔助候選；候選池備註寫明「Supporting 僅作相關輔助，不等同直接訓練目標」。",
    professionalReview: PROFESSIONAL_REVIEW.PENDING,
    studies: Object.freeze([Object.freeze({
      pmid: "36853505",
      title: "Effects of home-based bodyweight squat training on neuromuscular properties in community-dwelling older adults",
      authors: "Hirono T, et al.",
      journal: "Aging Clin Exp Res",
      year: 2023,
      url: "https://pubmed.ncbi.nlm.nih.gov/36853505/",
      doi: "10.1007/s40520-023-02370-6",
      readLevel: EVIDENCE_READ_LEVEL.ABSTRACT_READ,
      readVia: ABSTRACT_SOURCE,
      population: "25 位社區長者（平均 77.7 歲）",
      intervention: "在家每天做 100 下徒手深蹲，持續 4 個月；對照組只維持日常活動",
      mainResults: "兩組的肌力、肌肉厚度與身體功能測試（包含五次坐站）都沒有觀察到改善；深蹲組低閾值運動單位的放電頻率下降",
      supports: "提供居家徒手深蹲計畫實際量測結果的參考；這份研究沒有觀察到坐站測試改善，因此不支持「深蹲可改善起身」",
      cannotInfer: "不能據此說深蹲普遍無效（樣本小、只有單一低強度高次數方案），也不能據此宣稱深蹲可改善坐站",
    })]),
  }),
  Object.freeze({
    goalId: "G01",
    exerciseId: "F01-10",
    relation: "supporting",
    mappingStatus: "System Rule - needs validation",
    shortReason: "橋式是現有系統設定中「從椅子起身更順」的輔助候選（臀髖、後側肌群輔助），不是由評估結果判斷出的需求。",
    systemRationale: "系統對應表依動作資料的訓練目標與目標肌群，把橋式列為此目標的輔助候選；候選池備註寫明「Supporting 僅作相關輔助，不等同直接訓練目標」。",
    professionalReview: PROFESSIONAL_REVIEW.PENDING,
    studies: Object.freeze([Object.freeze({
      pmid: "35815985",
      title: "Effect of progressive bridging exercise on weight-bearing during the extension phase of sit-to-stand, and on sit-to-stand ability in individuals with stroke: A randomised controlled trial",
      authors: "Pankheaw T, et al.",
      journal: "Clin Rehabil",
      year: 2022,
      url: "https://pubmed.ncbi.nlm.nih.gov/35815985/",
      doi: "10.1177/02692155221107107",
      readLevel: EVIDENCE_READ_LEVEL.ABSTRACT_READ,
      readVia: ABSTRACT_SOURCE,
      population: "48 位急性缺血性中風住院者（排除腦幹與小腦）",
      intervention: "每次 45 分鐘常規物理治療加 30 分鐘漸進式橋式；對照組只有常規物理治療",
      mainResults: "4 週訓練後與 2 個月追蹤時，站起階段兩腳承重差異較小，坐到站的量表分數在訓練後較高",
      supports: "在急性中風住院者中，常規物理治療再加上漸進式橋式，可改善坐到站時的承重對稱與坐站能力分數",
      cannotInfer: "不能直接外推到所有居家使用者，也不能代表 App 的單一橋式或其預設訓練量；研究組同時接受常規物理治療",
    })]),
  }),
]);

/** The evidence record of one goal ↔ exercise pair, or null (only G01 is recorded). */
export function getGoalEvidence(goalId, exerciseId) {
  return F01_GOAL_EVIDENCE.find((e) => e.goalId === goalId && e.exerciseId === exerciseId) || null;
}

/** The three facts, kept apart. */
export function evidenceStatus(entry) {
  const studies = (entry && entry.studies) || [];
  return {
    studyFound: studies.length > 0,
    fullTextRead: studies.some((s) => s.readLevel === EVIDENCE_READ_LEVEL.FULL_TEXT_READ),
    professionallyConfirmed: !!entry && entry.professionalReview === PROFESSIONAL_REVIEW.CONFIRMED,
  };
}
