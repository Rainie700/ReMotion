import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync as readdirSyncTop } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Core Mobile UX — every catalog exercise through the ONE adapter + renderer:
 * detail / preparation / result render without crashing, dose, media
 * (confirmed asset or 「示意圖待補」, never another exercise's photo), AI
 * support, instructions / precautions / common mistakes / muscles / camera
 * guidance, missing-field fallbacks, no invented content, and the app wiring
 * (sticky CTA, source badge, return context, no bottom nav during a session).
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const { rehabExercises } = await import("../js/data/rehabExercises.js");
const { resolvePoseAnalyzer } = await import("../js/data/exerciseService.js");
const A = await import("../js/data/exerciseExperienceAdapter.js");
const M = await import("../js/data/exerciseAssets.js");
const V = await import("../js/ui/exerciseExperienceView.js");

const fnSource = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `app.js has ${name}`);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
const cta = `<button class="btn btn-primary full exp-cta" onclick="goDetectionPrep()">開始訓練</button>`;
const decode = (html) => html.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");

// ── asset resolver ─────────────────────────────────────────────────────
{
  for (const [id, src] of Object.entries(M.EXERCISE_IMAGE_ASSETS)) {
    assert.ok(existsSync(join(root, "public", src)), `${id}: listed asset exists (${src})`);
  }
  for (const [id, a] of Object.entries(M.EXERCISE_ASSET_AUDIT)) {
    if (a.file && !existsSync(join(root, "public", a.file))) assert.equal(M.EXERCISE_IMAGE_ASSETS[id], undefined, `${id}: a missing file is never used`);
  }
  for (const id of M.EXERCISE_IMAGE_UNCONFIRMED) assert.equal(M.resolveExerciseMedia(id).state, "placeholder", `${id}: unconfirmed photo -> placeholder`);
  assert.equal(M.resolveExerciseMedia("F01-05").state, "placeholder");
  assert.equal(M.resolveExerciseMedia("NOPE").state, "placeholder");
  assert.equal(M.resolveExerciseMedia("F01-01", { demo_video_url: "https://example.com/v.mp4" }).state, "video");
  assert.equal(M.resolveExerciseMedia("F01-01", { demo_video_url: "待補" }).state, "image");
  const card = fnSource("renderExerciseCardImage");
  assert.ok(card.includes("resolveExerciseMedia(id)") && card.includes("示意圖待補") && !card.includes("trainpic1") && !card.includes("EXERCISE_IMAGE_MAP["), "list / Training Tab / records share the resolver");
  const detail = fnSource("exerciseDetailPage") + fnSource("detectionPrepPage");
  assert.ok(!detail.includes("trainpic1") && !detail.includes("renderVideoSection("), "no generic stand-in photo on detail / preparation");
  assert.ok(fnSource("attachImageFallbacks").includes('img.dataset.exerciseMedia === "1"'), "a broken exercise photo becomes the placeholder, never trainpic1.png");
}

// ── all catalog exercises ──────────────────────────────────────────────
assert.equal(rehabExercises.length, 66, "catalog size (the brief says 68; the database has 66)");
const domains = {};
for (const raw of rehabExercises) {
  const id = raw.exercise_id;
  const model = A.buildExerciseExperience(raw, { sourceLabel: "自主練習" });
  assert.ok(model && model.id === id && model.name, `${id}: model`);
  domains[model.domain.key] = (domains[model.domain.key] || 0) + 1;
  // dose
  assert.ok(model.dosage.text && model.dosage.sets, `${id}: dosage`);
  if (raw.measurementType === "duration") assert.ok(model.dosage.seconds && model.dosage.text.includes("秒"), `${id}: duration dose`);
  else assert.ok(model.dosage.reps && model.dosage.text.includes("次"), `${id}: repetition dose`);
  // media
  const media = model.media;
  if (media.state === "image") assert.ok(existsSync(join(root, "public", media.src)), `${id}: image exists`);
  else assert.equal(media.state, "placeholder");
  // AI support is the analyzer registry, never assumed
  assert.equal(model.aiSupported, resolvePoseAnalyzer(raw) !== null, `${id}: AI support`);
  // no fabrication: every rendered item is the database's own text
  for (const [field, items] of [["steps", model.instructions], ["common_errors", model.commonMistakes], ["precautions", model.precautions], ["target_muscle", model.targetMuscles], ["key_points", model.aiAnalysisItems.bodyPoints], ["correct_angle", model.aiAnalysisItems.angleChecks]]) {
    for (const it of items) assert.ok(String(raw[field]).includes(it), `${id}: "${it}" comes from ${field}`);
  }
  for (const it of model.aiAnalysisItems.reminders) assert.ok(String(raw.cnn_label).includes(it), `${id}: reminder from cnn_label`);
  // detail
  const html = V.renderExerciseDetailView(model, { backFn: "goSchedule()", sourceBadgeHtml: `<span class="source-tag-badge self-practice">自主練習</span>`, ctaHtml: cta });
  assert.ok(html.includes(model.name) && html.includes(model.dosage.text), `${id}: name + dose`);
  assert.equal((html.match(/class="exp-tab[ "]/g) || []).length, 3, `${id}: 3 tabs`);
  assert.ok(html.includes(">怎麼做<") && html.includes(">AI 會看<") && html.includes(">注意<"));
  assert.ok(html.includes('class="exp-cta-bar"') && html.includes("開始訓練"), `${id}: sticky CTA`);
  assert.ok(html.includes("自主練習"), `${id}: source badge`);
  assert.ok(media.state === "image" ? html.includes(`src="${media.src}"`) : html.includes("示意圖待補"), `${id}: resolved media`);
  assert.ok(!html.includes("trainpic1"), `${id}: no stand-in photo`);
  assert.ok(html.includes(model.aiSupported ? "AI 姿勢辨識" : "一般訓練"));
  const stepsShown = (html.slice(0, html.indexOf('data-panel="ai"')).match(/class="exp-step-n"/g) || []).length;
  assert.equal(stepsShown, Math.min(4, model.instructions.length), `${id}: at most 4 steps up front`);
  if (model.instructions.length > 4) assert.ok(html.includes(`查看全部 ${model.instructions.length} 步`) && html.includes(`exp-sheet-steps-${id}`), `${id}: long steps -> bottom sheet`);
  if (model.cameraGuidance) assert.ok(decode(html).includes(model.cameraGuidance), `${id}: camera guidance`);
  // preparation
  const prep = V.renderPreparationView(model, { backFn: "goSchedule()", ctaHtml: `<button class="btn btn-primary full exp-cta" onclick="openCameraPlaceholder()">開啟鏡頭</button>`, moreHtml: "<div class='ai-box'>x</div>" });
  assert.ok(prep.includes("準備開始") && prep.includes("開啟鏡頭") && prep.includes("全身入鏡") && prep.includes("光線充足") && prep.includes("相機固定"), `${id}: preparation`);
  assert.equal((prep.match(/class="exp-check"/g) || []).length, 3, `${id}: compact checklist`);
  // result
  const res = V.renderTrainingResultView(model, { backFn: "goSchedule()", completed: true, totalReps: 10, targetReps: 10, score: 80, rewardHtml: "", observations: ["a", "b", "c", "d"], detailsHtml: "<p>detail</p>", ctaHtml: `<button class="btn btn-primary full exp-cta" onclick="goSchedule()">返回今日復健</button>` });
  assert.ok(res.includes("✓ 完成本次訓練") && res.includes("10 / 10 次") && res.includes("AI 姿勢分數") && res.includes("返回今日復健"), `${id}: result core`);
  assert.equal((res.match(/<li>/g) || []).length, 3, `${id}: at most 3 observations`);
  assert.ok(/<details class="exp-fold"><summary>詳細資料<\/summary>/.test(res), `${id}: details folded`);
}
assert.deepEqual(domains, { F01: 20, F02: 9, F03: 11, F04: 7, F05: 7, F06: 12 }, "all six domains covered");

// ── missing-field coverage (synthetic records; the real catalog has every text field) ──
{
  const bare = { exercise_id: "X99-01", exercise_name: "測試動作", category: "上肢功能", difficulty: "", steps: "待補", common_errors: "", precautions: null, target_muscle: "", cameraAngle: "unspecified", defaultSets: 2, defaultRepetitions: 8, measurementType: "repetition" };
  const m = A.buildExerciseExperience(bare);
  assert.equal(m.aiSupported, false, "no analyzer -> not AI");
  assert.deepEqual([m.instructions, m.commonMistakes, m.precautions, m.targetMuscles, m.cameraGuidance, m.difficulty, m.media.state], [[], [], [], [], null, null, "placeholder"]);
  const html = V.renderExerciseDetailView(m, { backFn: "x()", ctaHtml: cta });
  assert.ok(html.includes("一般訓練") && html.includes("目前沒有步驟說明") && html.includes("目前沒有額外注意事項"), "neutral empty lines");
  assert.ok(!html.includes("目標肌群") && !html.includes("拍攝角度") && !html.includes("難度"), "absent blocks are not rendered");
  assert.ok(html.includes("2 組 × 8 次"));
  const prep = V.renderPreparationView(m, { backFn: "x()", ctaHtml: "" });
  assert.ok(prep.includes("一般訓練（無 AI 姿勢辨識）") && !prep.includes("exp-prep-safety") && !prep.includes("<details"), "non-AI prep, no empty folds");
  // only one of the two care lists present
  const one = A.buildExerciseExperience({ ...bare, precautions: "避免疼痛", common_errors: "" });
  const care = V.renderExerciseDetailView(one, { backFn: "x()", ctaHtml: cta });
  assert.ok(care.includes(">注意事項<") && !care.includes(">常見問題<"));
  // many care items -> first 3 + sheet
  const many = A.buildExerciseExperience({ ...bare, common_errors: "a、b、c、d、e" });
  const manyHtml = V.renderExerciseDetailView(many, { backFn: "x()", ctaHtml: cta });
  assert.ok(manyHtml.includes("exp-sheet-care-X99-01") && manyHtml.includes("查看全部 ›"));
  // short instructions -> no sheet
  const short = V.renderExerciseDetailView(A.buildExerciseExperience({ ...bare, steps: "站好 → 坐下" }), { backFn: "x()", ctaHtml: cta });
  assert.ok(!short.includes("exp-sheet-steps"));
  // plan dose wins over catalog defaults (therapist schedule), duration dose
  assert.equal(A.buildExerciseExperience("F01-01", { planItem: { sets: 2, repetitions: 12 } }).dosage.text, "2 組 × 12 次");
  assert.equal(A.buildExerciseDosage({ measurementType: "duration", defaultSets: 1, defaultDurationSeconds: 30 }).text, "1 組 × 30 秒");
  // escaping: data text never breaks the markup
  const esc = V.renderExerciseDetailView(A.buildExerciseExperience({ ...bare, steps: "<b>x</b> → y" }), { backFn: "x()", ctaHtml: cta });
  assert.ok(esc.includes("&lt;b&gt;x&lt;/b&gt;"));
}

// ── app wiring ─────────────────────────────────────────────────────────
{
  const detail = fnSource("exerciseDetailPage");
  assert.ok(detail.includes("buildExerciseExperience(catalog, { planItem: ex })") && detail.includes("renderExerciseDetailView(model"), "detail = shared adapter + renderer");
  assert.ok(detail.includes('onclick="goDetectionPrep()"') && detail.includes("getExerciseReturnRoute(\"listing\")"), "CTA + context-derived return");
  assert.ok(detail.includes("state.rewardFeedback = null;") && detail.includes("renderTrainingResultView(model"), "one-shot training result");
  assert.ok(detail.includes('toTraining ? "返回今日復健" : "完成"') && detail.includes("exerciseResultMode = true"), "result CTA + session chrome");
  assert.ok(/source-tag-badge assigned">復健師安排[\s\S]*source-tag-badge recommendation">ReMotion 建議[\s\S]*source-tag-badge self-practice">自主練習/.test(detail), "source badge per start context");
  const prep = fnSource("detectionPrepPage");
  assert.ok(prep.includes("renderPreparationView(buildExerciseExperience(catalog, { planItem: ex })") && prep.includes('onclick="openCameraPlaceholder()">開啟鏡頭') && prep.includes("moreHtml: analysisNoticeHtml"), "preparation = shared renderer, analyzer notice kept (folded)");
  // session: no bottom nav from preparation to result
  const load = (name, deps) => new Function(...Object.keys(deps), `${fnSource(name)}\nreturn ${name};`)(...Object.values(deps));
  const isTrainingSessionRoute = load("isTrainingSessionRoute", {});
  for (const r of ["detectionPrep", "squatDetection", "ak05Detection", "hp02TrainingDetection"]) assert.equal(isTrainingSessionRoute(r), true, r);
  for (const r of ["exerciseDetail", "schedule", "dashboard"]) assert.equal(isTrainingSessionRoute(r), false, r);
  const PA = { PAGE_ACTION_OPEN: V.PAGE_ACTION_OPEN, PAGE_ACTION_CLOSE: V.PAGE_ACTION_CLOSE };
  const phone = load("phone", { renderNav: () => "<nav class=\"bottom-nav\"></nav>", isTrainingSessionRoute, exerciseResultMode: false, state: { route: "detectionPrep" }, ...PA });
  assert.ok(!phone("x", true).includes("bottom-nav") && phone("x", true).includes("is-training-session"));

  // Exercise Detail CTA = page-level action: out of the tab content / scroll flow, one bar directly above the bottom nav.
  const detailModel = A.buildExerciseExperience(rehabExercises.find((r) => r.exercise_id === "F02-01"));
  for (const activeTab of ["how", "ai", "care"]) {
    const view = V.renderExerciseDetailView(detailModel, { backFn: "x()", ctaHtml: cta, activeTab });
    assert.equal(view.split('class="exp-cta-bar"').length - 1, 1, `${activeTab}: exactly one CTA bar`);
    const page = view.slice(0, view.indexOf(V.PAGE_ACTION_OPEN));
    assert.ok(!page.includes("exp-cta") && page.includes('class="exp-panel"'), `${activeTab}: CTA is not inside .exp-page / any tab panel`);
    const detailPhone = load("phone", { renderNav: () => "<nav class=\"bottom-nav\"></nav>", isTrainingSessionRoute, exerciseResultMode: false, state: { route: "exerciseDetail" }, ...PA });
    const shell = detailPhone(view, true);
    const contentHtml = shell.slice(shell.indexOf('<section class="content">'), shell.indexOf("</section>"));
    assert.ok(!contentHtml.includes("exp-cta") && !shell.includes(V.PAGE_ACTION_OPEN), `${activeTab}: CTA lifted out of the scrolling content`);
    assert.ok(/<\/section>\s*<div class="page-action-bar"><div class="exp-cta-bar">[\s\S]*?開始訓練[\s\S]*?<\/div><\/div>\s*<nav class="bottom-nav">/.test(shell), `${activeTab}: content -> CTA bar -> bottom nav`);
    assert.equal(shell.split('class="page-action-bar"').length - 1, 1, `${activeTab}: one detail action bar`);
  }
  assert.ok(fnSource("selectExerciseTab").includes(".exp-panel") && !fnSource("selectExerciseTab").includes("exp-cta"), "tab switch only toggles panels; all three tabs share the one CTA");
  const css = readFileSync(join(root, "styles.css"), "utf8");
  assert.ok(/\.page-action-bar \{ flex: none;/.test(css) && /\.page-action-bar \.exp-cta-bar \{ position: static;/.test(css), "action bar is a non-scrolling row of .phone, not sticky inside content");
  // Preparation (session) keeps the nav hidden even with a CTA.
  const prepPhone = load("phone", { renderNav: () => "<nav class=\"bottom-nav\"></nav>", isTrainingSessionRoute, exerciseResultMode: false, state: { route: "detectionPrep" }, ...PA });
  assert.ok(!prepPhone(V.renderPreparationView(detailModel, { backFn: "x()", ctaHtml: "<button>開啟鏡頭</button>" }), true).includes("bottom-nav"), "Training Session still hides the bottom nav");
  assert.ok(appJs.includes('window.confirm("訓練尚未完成，確定離開？")') && appJs.includes("/^exit[A-Za-z0-9]*\\(\\)$/"), "leaving a started session asks first; the page's own exit then runs");
  // naming: no prototype / 品質評估 wording left in the UI
  assert.ok(!/prototype 工程|prototype 動作品質|prototype 評估|（prototype）|分品質評估/.test(appJs), "prototype wording removed");
  // Data -> F01 追蹤歷程 (read-only sub-page with 返回; the tab itself has none)
  assert.ok(fnSource("renderDataFunctionalSection").includes("goF01TrackingHistory()") && fnSource("renderDataFunctionalSection").includes("查看追蹤歷程 →"));
  const hist = fnSource("f01TrackingHistoryPage");
  assert.ok(hist.includes("switchTab('data')") && hist.includes("functionalProgressService.getTrackingTimeline(") && !/\.create\(|\.update\(/.test(hist), "history is read-only (derived timeline) with its own back");
  assert.ok(!fnSource("patientDataOverviewPage").includes("detail-back-btn"), "Data tab has no back button");
}

// ── Exercise asset visual normalisation: transparent 800×800 PNGs, one mapping ──
{
  const NORMALISED = {
    "F01-02": "exercise_mini_squat.png",
    "F01-03": "exercise_wall_half_squat.png",
    "F02-01": "exercise_feet_together_balance.png",
    "F02-02": "exercise_semi_tandem_stance.png",
    "F02-03": "exercise_tandem_stance.png",
    "F01-19": "exercise_single_leg_calf_raise.png",
  };
  assert.equal(M.EXERCISE_ASSET_AUDIT["F01-02"].status, "confirmed", "F01-02 迷你深蹲 confirmed");
  assert.equal(M.EXERCISE_ASSET_AUDIT["F01-19"].status, "confirmed", "F01-19 單腳提踵 confirmed (new image, heel lift visible)");
  assert.ok(!readdirSyncTop(join(root, "public", "images", "exercise")).some((f) => f.endsWith(".png.png")), "no double-extension asset left in public/");
  for (const [id, file] of Object.entries(NORMALISED)) {
    const src = `/images/exercise/${file}`;
    assert.equal(M.resolveExerciseMedia(id).src, src, `${id}: resolver path`);
    assert.equal(M.resolveExerciseMedia(id).state, "image");
    const buf = readFileSync(join(root, "public", src));
    // PNG IHDR: width / height at 16 / 20, colour type at 25 (6 = RGBA -> real alpha channel)
    assert.equal(buf.readUInt32BE(16), 800, `${id}: 800 px wide`);
    assert.equal(buf.readUInt32BE(20), 800, `${id}: 800 px high`);
    assert.equal(buf[25], 6, `${id}: RGBA (transparent background, no baked mint / white)`);
    assert.ok(buf.length < 400 * 1024, `${id}: production size (${buf.length} bytes)`);
  }
  // No 404: every confirmed image exists.
  for (const [id, src] of Object.entries(M.EXERCISE_IMAGE_ASSETS)) assert.ok(existsSync(join(root, "public", src)), `${id}: ${src} exists`);
  // exerciseAssets.js is the only exerciseId -> image mapping (no EXERCISE_IMAGE_MAP-style table elsewhere).
  const pairRe = /"F0\d-\d\d"\s*:\s*"\/images\/exercise\//;
  assert.ok(!pairRe.test(appJs) && !appJs.includes("EXERCISE_IMAGE_MAP"), "app.js keeps no second image mapping");
  const { readdirSync } = await import("node:fs");
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : []);
  for (const f of walk(join(root, "js"))) {
    if (f.endsWith("exerciseAssets.js")) continue;
    assert.ok(!pairRe.test(readFileSync(f, "utf8")), `${f}: no second exerciseId -> image mapping`);
  }
  assert.ok(appJs.includes("Object.keys(EXERCISE_ASSET_AUDIT)") && appJs.includes("import { resolveExerciseMedia, EXERCISE_ASSET_AUDIT }"), "F01 pending set derives from the audit");
  // The card / detail background is CSS, not baked into the image; one contain + padding rule, no per-exercise sizing.
  const css = readFileSync(join(root, "styles.css"), "utf8");
  assert.ok(/\.exercise-grid-card-image \{[^}]*background: var\(--color-primary-soft\)/.test(css));
  assert.ok(/\.exp-media \{[^}]*background: var\(--color-primary-soft\)/.test(css));
  assert.ok(/\.sp-card \.exercise-grid-card-image img\[data-exercise-media\],\s*\.exp-media-img \{ box-sizing: border-box; padding: 12px; object-fit: contain; \}/.test(css));
  assert.ok(!/exercise_(mini_squat|wall_half_squat|feet_together|semi_tandem|tandem)/.test(css), "no per-exercise CSS");
}

console.log("Core Mobile UX exercise experience tests passed (66 / 66 exercises)");
