/** Protocol selection: workbook 「六個 Functional Domain」 C3:F7, supplied 2026-10-29.
 * Clinical protocol constants and engineering CV candidates are deliberately separate.
 */
export const DOMAIN_ASSESSMENT_VERSION = "six-domain-assessment-1";
export const DOMAIN_ASSESSMENT_PROTOCOLS = {
  F02: { key: "F02", label: "平衡", type: "sppb_balance", name: "SPPB Balance Test", chineseName: "平衡測試", output: "各姿勢維持時間與完成階段", camera: "正面", image: "/images/assessment/assessment_sppb_balance.png", exerciseIds: ["F02-01", "F02-02", "F02-03"], steps: ["依序測雙腳併攏、半前後站及前後腳直線站，每一姿勢最多 10 秒。", "陪同者協助站好，放手並說開始時啟動計時；移動雙腳、扶物或無法保持姿勢時立刻停止該階段。", "前兩階段未維持 10 秒即結束平衡測試，不再挑戰較難姿勢。"], note: "這是 SPPB 的三種站姿，不含單腳站。只計平衡分項 0–4 分，不產生完整 SPPB 總分。", sources: ["https://cdn.who.int/media/docs/default-source/mca-documents/ageing/icope-training-programme/revised-modules-19-may-2025/who-icope_m9_locomotor-capacity.pdf"] },
  F03: { key: "F03", label: "功能性移動", type: "tug", name: "Timed Up and Go Test (TUG)", chineseName: "計時起走測試", output: "完成時間（秒）", camera: "廣角斜側面", image: "/images/assessment/assessment_tug.png", exerciseIds: ["F03-03", "F03-05"], steps: ["在穩固扶手椅前，用捲尺實際量出 3 公尺並標記折返線；穿平常鞋子，可使用平常的步行輔具。", "坐好後，陪同者說開始並啟動計時；站起、以平常安全速度走到 3 公尺線、轉身、返回。", "再次坐穩時停止計時。陪同者須全程在旁保護，並記錄各階段事件。"], note: "遠離鏡頭或轉身會影響骨架追蹤，正式時間由陪同者操作碼錶記錄；相機不會推定已走滿 3 公尺。", sources: ["https://www.cdc.gov/steadi/media/pdfs/steadi-assessment-tug-508.pdf", "https://www.cdc.gov/steadi/media/pdfs/2024/08/Telesteadi-Guide_H_WEB.pdf"] },
  F04: { key: "F04", label: "步行功能", type: "gait_speed_4m", name: "4-Meter Gait Speed Test", chineseName: "4 公尺步行速度測試", output: "4 公尺完成時間與步行速度（m/s）", camera: "側面／斜側面", image: "/images/assessment/assessment_4m_gait_speed.png", exerciseIds: ["F04-01"], steps: ["用捲尺量出 4 公尺平坦路線，標記起點與終點；確認路線安全，可使用平常的步行輔具。", "站在起點，以平常速度步行；陪同者在開始走時啟動計時，第一隻腳完全越過終點線時停止。", "依同樣條件測兩次，記錄兩次時間，取較快的一次計算 4 ÷ 秒數。"], note: "未確認實測距離就不計步速；步數、影像位移及身高都不作為 4 公尺的替代。", sources: ["https://cdn.who.int/media/docs/default-source/mca-documents/ageing/icope-training-programme/revised-modules-19-may-2025/who-icope_m9_locomotor-capacity.pdf", "https://agingresearchbiobank.nia.nih.gov/studies/life/documents/download/Manual_of_Procedures_Pilot/16.pLIFE-MOP%20Chapter%2016-Physical%20Measurements.pdf/"] },
  F05: { key: "F05", label: "上肢功能", type: "arm_curl_30s", name: "30-Second Arm Curl Test", chineseName: "30 秒手臂彎舉測試", output: "30 秒完成次數", camera: "正面／斜側面", image: "/images/assessment/assessment_arm_curl_30s.png", exerciseIds: ["F05-01", "F05-03"], steps: ["坐在穩固椅子上、腳掌著地，以慣用手握啞鈴，上臂保持身側。標準負重女性 5 磅、男性 8 磅；需事先確認適合此負重。", "開始後屈肘至完整彎舉，再控制放回伸直，反覆進行 30 秒。", "陪同者獨立確認完整次數，再填入正式結果。相機計次另外標為候選值。負重不同則標示調整版。"], note: "不以 10 次彎舉代替 30 秒測驗；此處不套用年齡／性別常模，也不把空手或水瓶視為標準啞鈴。", sources: ["https://pubmed.ncbi.nlm.nih.gov/32447125/", "https://www.cdc.gov/pcd/issues/2018/pdf/18_0326.pdf", "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=H0120013"] },
  F06: { key: "F06", label: "柔軟度／活動能力", type: "chair_sit_reach", name: "Chair Sit-and-Reach Test", chineseName: "椅子坐姿體前彎測試", output: "中指至腳尖的伸取距離（cm）", camera: "側面", image: "/images/assessment/assessment_chair_sit_and_reach.png", exerciseIds: ["F06-11", "F06-12"], steps: ["坐在穩固椅子前緣，一腳踩地，另一腳向前伸直，腳跟著地、腳尖勾起。", "雙手中指對齊，慢慢向伸直腿的腳尖延伸，不彈震或勉強拉扯。陪同者用硬尺測量中指與腳尖的距離。", "未碰到腳尖記負值，剛好碰到記 0，超過記正值。左右各記兩次，分別保留較佳值。"], note: "距離必須由實體尺量並輸入，不能從未校正的單鏡頭換算公分。Back Scratch Test 在原表標示另審，本次不加入。", sources: ["https://pubmed.ncbi.nlm.nih.gov/37046945/", "https://www.hosp.nycu.edu.tw/departments/health-care/other/rehabilitation/education/4329-銀髮族體適能檢測.html", "https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=H0120013"] },
};
export const BALANCE_STAGES = [{ id: "side", label: "雙腳併攏", instruction: "雙腳內側並攏，雙眼張開。" }, { id: "semi", label: "半前後站", instruction: "一腳腳跟內側靠在另一腳大拇趾旁。" }, { id: "tandem", label: "前後腳直線站", instruction: "前腳腳跟緊接後腳腳尖，呈一直線。" }];
export const getDomainProtocol = key => DOMAIN_ASSESSMENT_PROTOCOLS[key] || null;
const finite = n => typeof n === "number" && Number.isFinite(n);
const seconds = n => finite(n) && n > 0 && n <= 3600; // input validity limit, not a clinical cutoff
export function evaluateDomainAssessment(domain, raw) {
  if (!getDomainProtocol(domain) || !raw || typeof raw !== "object") return { valid: false, error: "缺少測驗資料。" };
  if (raw.interrupted) return { valid: false, error: "測驗曾切至背景或中斷，請重新測量；不把未完成當成零分。" };
  if (domain === "F02") {
    if (!Array.isArray(raw.stages) || raw.stages.length !== 3) return { valid: false, error: "需保留三階段狀態。" };
    let stopped = false, score = 0;
    for (let i = 0; i < 3; i++) {
      const s = raw.stages[i];
      if (!s || typeof s !== "object") return { valid: false, error: "平衡階段資料不完整。" };
      if (s.id !== BALANCE_STAGES[i].id) return { valid: false, error: "平衡階段順序不符。" };
      if (stopped) { if (s.status !== "not_attempted_after_stop" || s.seconds !== null) return { valid: false, error: "前階段未達 10 秒後，不可繼續較難階段。" }; continue; }
      if (s.status === "unable") { if (s.seconds !== 0) return { valid: false, error: "無法嘗試必須明確記錄。" }; stopped = true; continue; }
      if (s.status !== "measured" || !finite(s.seconds) || s.seconds < 0 || s.seconds > 10) return { valid: false, error: "維持時間須為 0–10 秒；未測量不能填 0。" };
      if (i < 2) { score += s.seconds >= 10 ? 1 : 0; if (s.seconds < 10) stopped = true; }
      else score += s.seconds >= 10 ? 2 : s.seconds >= 3 ? 1 : 0;
    }
    return { valid: true, value: score, unit: "分", label: "SPPB 平衡分項", details: raw.stages.map((s, i) => ({ label: BALANCE_STAGES[i].label, value: s.seconds, status: s.status, unit: "秒" })) };
  }
  if (domain === "F03") {
    const names = ["go", "walking", "turning", "returning", "seated"], e = raw.events;
    if (raw.distanceM !== 3 || !raw.routeConfirmed || !Array.isArray(e) || e.length !== names.length || !e.every((x, i) => x && x.event === names[i] && finite(x.ms) && (i === 0 ? x.ms === 0 : x.ms > e[i - 1].ms)) || !seconds(raw.durationMs / 1000) || raw.durationMs !== e[4].ms) return { valid: false, error: "需確認 3 公尺路線與開始、行走、轉身、返回、坐穩事件。" };
    return { valid: true, value: raw.durationMs / 1000, unit: "秒", label: "TUG 完成時間" };
  }
  if (domain === "F04") {
    if (!raw.routeConfirmed || raw.distanceM !== 4 || !Array.isArray(raw.trials) || raw.trials.length !== 2 || !raw.trials.every(t => seconds(t))) return { valid: false, error: "需確認實測 4 公尺，並完成兩次有效計時。" };
    const best = Math.min(...raw.trials);
    return { valid: true, value: 4 / best, unit: "m/s", label: "4 公尺步行速度", bestSeconds: best, trials: [...raw.trials] };
  }
  if (domain === "F05") {
    if (raw.durationMs !== 30000 || !Number.isInteger(raw.observerCount) || raw.observerCount < 0 || raw.observerCount > 300 || !["left", "right"].includes(raw.side) || !finite(raw.weightLb) || raw.weightLb <= 0 || !["female", "male", "adapted"].includes(raw.loadProtocol)) return { valid: false, error: "需完成 30 秒，填入陪同者確認的次數、測試手及實際負重；未填不能當成 0 次。" };
    const standardLoad = (raw.loadProtocol === "female" && raw.weightLb === 5) || (raw.loadProtocol === "male" && raw.weightLb === 8);
    return { valid: true, value: raw.observerCount, unit: "次", label: "30 秒手臂彎舉", standardLoad, variant: standardLoad ? "標準負重" : "調整版負重（不套標準常模）" };
  }
  if (!raw.rulerConfirmed || raw.reference !== "toe_zero" || !seconds(raw.chairHeightCm) || ![raw.left, raw.right].every(a => Array.isArray(a) && a.length === 2 && a.every(n => finite(n) && n >= -100 && n <= 100))) return { valid: false, error: "需用尺量測左右各兩次，填入正負公分與椅高；空白不能視為 0 公分。" };
  return { valid: true, value: null, unit: "cm", label: "椅子坐姿體前彎", leftBest: Math.max(...raw.left), rightBest: Math.max(...raw.right) };
}
export function conditionsValid(c) {
  return !!c && ["no", "yes", "unknown"].includes(c.pain) && ["none", "aid", "person", "unknown"].includes(c.support) && ["helper", "therapist"].includes(c.observer) && c.setup === true;
}
export function assessComparability(a, b) {
  if (!a || !b || a.patientId !== b.patientId || a.domain !== b.domain || a.protocolVersion !== b.protocolVersion) return { comparable: false, reason: "不是同一人、同一測驗或同一量測版本。" };
  const x = evaluateDomainAssessment(a.domain, a.raw), y = evaluateDomainAssessment(b.domain, b.raw);
  if (!x.valid || !y.valid || !a.observerConfirmed || !b.observerConfirmed || !conditionsValid(a.conditions) || !conditionsValid(b.conditions) || a.conditions.pain !== "no" || b.conditions.pain !== "no" || [a.conditions.support, b.conditions.support].includes("unknown") || a.conditions.support !== b.conditions.support || a.conditions.observer !== b.conditions.observer || a.method !== b.method) return { comparable: false, reason: "結果未確認、未完成或不適／支撐／記錄方式不同，保留兩次結果，不直接比較。" };
  if (a.domain === "F05" && ["side", "weightLb", "loadProtocol"].some(k => a.raw[k] !== b.raw[k])) return { comparable: false, reason: "測試手或負重條件不同。" };
  if (a.domain === "F06" && a.raw.chairHeightCm !== b.raw.chairHeightCm) return { comparable: false, reason: "椅高不同。" };
  return a.domain === "F06" ? { comparable: true, leftDifference: y.leftBest - x.leftBest, rightDifference: y.rightBest - x.rightBest, unit: "cm" } : { comparable: true, difference: y.value - x.value, unit: x.unit };
}
/** Events are ordered and monotonic; no duration is inferred from pose gaps. */
export function createProtocolTimer(clock = () => performance.now()) {
  let start = null, end = null;
  return { start() { if (start == null) start = clock(); }, stop(capMs = Infinity) { if (start != null && end == null) end = Math.max(start, Math.min(clock(), start + capMs)); return this.elapsed(); }, elapsed() { return start == null ? 0 : Math.max(0, (end ?? clock()) - start); }, get running() { return start != null && end == null; } };
}
