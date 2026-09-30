process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Self Practice Library redesign + exercise asset audit. Renders the REAL
 * library functions from app.js against the live catalog (the one filter
 * engine, the one asset resolver). Counts are always derived from the catalog.
 */

const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { rehabExercises } = await import("../js/data/rehabExercises.js");
const { PHASE1_TEST_EXERCISE_GOALS } = await import("../js/data/phase1SchemaTestData.js");
const ADP = await import("../js/data/exerciseExperienceAdapter.js");
const ASSETS = await import("../js/data/exerciseAssets.js");
const V = await import("../js/ui/exerciseExperienceView.js");
const { analysisService } = await import("../js/data/analysisService.js");
const { trainingEventService } = await import("../js/data/trainingEventService.js");
const { buildExerciseAssetDocs } = await import("../scripts/generateExerciseAssetDocs.mjs");

const fnSrc = (name) => {
  const start = appJs.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `app.js has ${name}`);
  let i = appJs.indexOf("{", appJs.indexOf(")", start)), depth = 0;
  for (; i < appJs.length; i++) { if (appJs[i] === "{") depth++; else if (appJs[i] === "}" && --depth === 0) break; }
  return appJs.slice(start, i + 1);
};
const constSrc = (name) => {
  const start = appJs.indexOf(`const ${name} =`);
  assert.ok(start !== -1, `app.js has const ${name}`);
  const open = appJs.slice(start).search(/[\[{(]/);
  if (open === -1 || appJs.slice(start, start + open).includes("\n")) return appJs.slice(start, appJs.indexOf("\n", start));
  let i = start + open, depth = 0;
  for (; i < appJs.length; i++) { const ch = appJs[i]; if ("[{(".includes(ch)) depth++; else if ("]})".includes(ch) && --depth === 0) break; }
  return appJs.slice(start, appJs.indexOf("\n", i));
};

const FNS = ["normalizeSelfPracticeDomain", "getAssessmentBodyPartOptions", "getDifficultyDisplay", "selfPracticeSearchMatches", "getFilteredSelfPracticeExercises", "getSelfPracticeMuscleOptions", "renderExerciseCardImage", "renderSelfPracticeExerciseCard", "renderSelfPracticeMoreFiltersSheet", "selfPracticeLibraryPage"];
const CONSTS = ["SELF_PRACTICE_ALL_DOMAIN", "BODY_PART_DISPLAY_ORDER", "DIFFICULTY_DISPLAY_MAP", "DIFFICULTY_TIER_OPTIONS", "selfPracticeMusclesOf", "SELF_PRACTICE_MEASUREMENT_OPTIONS"];
const factory = new Function("ctx", `
  const { state, exerciseService, PHASE1_TEST_EXERCISE_GOALS, splitExerciseText, buildExerciseDosage, resolveExerciseMedia, EXERCISE_DOMAIN_ICONS, renderRobot } = ctx;
  ${CONSTS.map(constSrc).join("\n")}
  ${FNS.map(fnSrc).join("\n")}
  return { selfPracticeLibraryPage, getFilteredSelfPracticeExercises, getSelfPracticeMuscleOptions };
`);
const blank = () => ({ selfPracticeBodyPart: "", selfPracticeGoal: "", selfPracticeDifficultyTier: "", selfPracticeTrainingMode: "", selfPracticeMeasurement: "", selfPracticeMuscle: "", selfPracticeSearchQuery: "", selfPracticeFiltersPanelOpen: false });
const lib = (state = {}, service = exerciseService) => factory({ state: { ...blank(), ...state }, exerciseService: service, PHASE1_TEST_EXERCISE_GOALS, splitExerciseText: ADP.splitExerciseText, buildExerciseDosage: ADP.buildExerciseDosage, resolveExerciseMedia: ASSETS.resolveExerciseMedia, EXERCISE_DOMAIN_ICONS: ADP.EXERCISE_DOMAIN_ICONS, renderRobot: () => "<i></i>" });
const page = (state) => lib(state).selfPracticeLibraryPage();
const cardIds = (html) => [...html.matchAll(/goSelfPracticeExerciseDetail\('([^']+)'\)/g)].map((m) => m[1]);
const catalog = exerciseService.listNormalized();

// 1–3 · dynamic counts
{
  assert.equal(catalog.length, rehabExercises.length);
  assert.equal(catalog.length, 66, "today's catalog");
  const html = page();
  assert.ok(html.includes(`目前 ${catalog.length} 項已上線訓練動作可進入姿勢辨識流程`), "AI banner count = catalog count");
  const railCounts = [...html.matchAll(/<b>([^<]+)<\/b><span>(\d+) 項 ›<\/span>/g)].map((m) => Number(m[2]));
  assert.equal(railCounts.reduce((a, b) => a + b, 0), catalog.length, "「全部」 sections add up to the catalog");
  // a larger catalog (e.g. 68) updates every count with no code change
  const fake = [...rehabExercises, { ...rehabExercises[0], exercise_id: "F01-98", exercise_name: "測試一" }, { ...rehabExercises[1], exercise_id: "F01-99", exercise_name: "測試二" }];
  const bigger = lib({}, { listNormalized: () => fake.map((r) => ({ ...exerciseService.getNormalizedById(r.exercise_id === "F01-98" ? rehabExercises[0].exercise_id : r.exercise_id === "F01-99" ? rehabExercises[1].exercise_id : r.exercise_id), id: r.exercise_id, name: r.exercise_name })), list: () => fake }).selfPracticeLibraryPage();
  assert.ok(bigger.includes("目前 68 項已上線訓練動作可進入姿勢辨識流程") && cardIds(bigger).length === 68);
  const src = fnSrc("selfPracticeLibraryPage");
  assert.ok(!/\b66\b|\b68\b/.test(src), "no literal 66 / 68 in the page");
  // AI copy stays within what the product can claim
  assert.ok(html.includes("訓練時透過鏡頭追蹤動作，提供姿勢辨識與動作提示。"));
  assert.ok(!/精準|醫療級|診斷|判定動作正確|皆經驗證/.test(html));
}

// 4–5 · no AI category section; every exercise appears exactly once
{
  const html = page();
  assert.ok(!/AI 姿勢分析<\/b>|discovery-section|查看全部 ›|瀏覽全部動作/.test(html), "the old AI three-exercise section and per-domain carousels are gone");
  for (const gone of ["getSelfPracticeDiscoverySections", "renderDiscoverySection", "browseAllSelfPracticeExercises", "getSelfPracticeViewMode"]) assert.ok(!appJs.includes(`function ${gone}(`), `${gone} removed`);
  const ids = cardIds(html);
  assert.equal(ids.length, catalog.length);
  assert.equal(new Set(ids).size, ids.length, "no exercise repeated");
  assert.ok(!/toggleSelfPracticeTrainingMode|AI 支援/.test(html), "AI is not a filter");
}

// 6–7 · 功能構面 filter + counts
{
  const domains = ["下肢功能", "平衡", "功能性移動", "步行功能", "上肢功能", "柔軟度／活動能力"];
  const html = page();
  for (const d of domains) assert.ok(html.includes(`toggleSelfPracticeBodyPart('${d}')">${d}</button>`), `chip ${d}`);
  for (const d of domains) {
    const expected = rehabExercises.filter((r) => r.category === d).map((r) => r.exercise_id);
    const h = page({ selfPracticeBodyPart: d });
    assert.deepEqual(cardIds(h).sort(), expected.sort(), `${d} list`);
    assert.ok(h.includes(`<b>${d}</b>`) && h.includes(`${expected.length} 項符合條件</span>`), `${d} header count`);
  }
}

// 8–11 · search, search + domain, more filters, empty
{
  const q = "膝";
  const expected = catalog.filter((e) => [e.name, e.bodyPart, e.raw.target_muscle, e.raw.description].join(" ").includes(q)).map((e) => e.id);
  const h = page({ selfPracticeSearchQuery: q });
  assert.deepEqual(cardIds(h).sort(), expected.sort());
  assert.ok(h.includes(`${expected.length} 項符合條件`) && h.includes("清除篩選"));
  const both = page({ selfPracticeSearchQuery: q, selfPracticeBodyPart: "下肢功能" });
  assert.deepEqual(cardIds(both).sort(), catalog.filter((e) => expected.includes(e.id) && e.bodyPart === "下肢功能").map((e) => e.id).sort(), "search + domain");
  // more filters: difficulty (six-domain values included), measurement, muscle
  const beginner = cardIds(page({ selfPracticeDifficultyTier: "beginner" }));
  assert.deepEqual(beginner.sort(), rehabExercises.filter((r) => ["初階", "易", "非常容易"].includes(r.difficulty)).map((r) => r.exercise_id).sort(), "初階 includes the catalog's 初階 values");
  const timed = cardIds(page({ selfPracticeMeasurement: "duration" }));
  assert.deepEqual(timed.sort(), rehabExercises.filter((r) => r.measurementType === "duration").map((r) => r.exercise_id).sort());
  const muscle = lib().getSelfPracticeMuscleOptions(catalog)[0];
  assert.ok(cardIds(page({ selfPracticeMuscle: muscle })).every((id) => String(rehabExercises.find((r) => r.exercise_id === id).target_muscle).includes(muscle)));
  const sheet = page({ selfPracticeFiltersPanelOpen: true });
  assert.ok(sheet.includes("更多篩選") && sheet.includes(">難度<") && sheet.includes(">計次／計時<") && sheet.includes(">目標肌群<") && sheet.includes(`顯示 ${catalog.length} 個動作`));
  assert.ok(!/訓練方式|AI 支援|>目標</.test(sheet.slice(sheet.indexOf("sp-filter-sheet"))), "no AI / no goal filter");
  const empty = page({ selfPracticeSearchQuery: "zzzz" });
  assert.ok(empty.includes("找不到符合條件的動作") && empty.includes("可以試著調整搜尋內容或篩選條件。") && empty.includes('onclick="clearSelfPracticeFilters()">清除篩選</button>'));
  // one filter engine: every dimension lives in getFilteredSelfPracticeExercises
  const engine = fnSrc("getFilteredSelfPracticeExercises");
  for (const f of ["selfPracticeBodyPart", "selfPracticeDifficultyTier", "selfPracticeMeasurement", "selfPracticeMuscle", "selfPracticeSearchQuery"]) assert.ok(engine.includes(`state.${f}`));
}

// card content: name, difficulty · dose (never an estimated duration), small AI mark, 2-column grid
{
  const html = page();
  assert.ok(html.includes('class="sp-rail"') && page({ selfPracticeBodyPart: "平衡" }).includes('class="sp-grid"') && !/約 \d+ 分鐘/.test(html), "rails in 全部, grid in one domain; catalog dose, no estimated minutes");
  const squat = ADP.buildExerciseDosage(rehabExercises.find((r) => r.exercise_id === "F01-01")).text;
  assert.ok(html.includes(`初階 · ${squat}`));
  assert.equal((html.match(/class="sp-ai-badge"/g) || []).length, catalog.filter((e) => e.aiSupported).length);
  const css = readFileSync(join(root, "styles.css"), "utf8");
  assert.ok(/\.sp-grid \{ display: grid; grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/.test(css));
  assert.ok(/\.sp-domains \{ display: flex; flex-wrap: wrap/.test(css), "all six 功能構面 visible (wrapping, never clipped)");
}

// 12–13 · every exercise opens the shared detail; self source context kept
{
  for (const e of catalog) {
    const m = ADP.buildExerciseExperience(e.raw);
    assert.ok(V.renderExerciseDetailView(m, { backFn: "goSelfPracticeLibrary()", ctaHtml: "<button>開始訓練</button>" }).includes(m.name), `${e.id} detail`);
  }
  const go = fnSrc("goSelfPracticeExerciseDetail");
  assert.ok(go.includes('state.exerciseContext = "self_practice"') && go.includes('state.navigationOrigin = "self_practice"'));
  const rec = analysisService.create({ id: "sp-self-1", patientId: "sp-u", exerciseId: "F01-01", source: "self_practice", totalReps: 30, targetReps: 30, completedAt: new Date(2026, 8, 30, 9).toISOString(), summary: { totalReps: 30, targetReps: 30 } }, {});
  assert.deepEqual([rec.sourceType, rec.sourceSubtype], ["self", "self_selected"]);
  assert.equal(trainingEventService.listTrainingEvents("sp-u")[0].sourceLabel, "自主練習");
}

// 14–17 · asset audit: every id resolved, confirmed-only images, placeholders explicit, no 404
{
  const audit = ASSETS.EXERCISE_ASSET_AUDIT;
  assert.deepEqual(Object.keys(audit).sort(), rehabExercises.map((r) => r.exercise_id).sort(), "one audit entry per catalog exercise");
  for (const r of rehabExercises) {
    const a = audit[r.exercise_id];
    assert.ok(["confirmed", "wrong", "needs_review", "missing"].includes(a.status));
    const media = ASSETS.resolveExerciseMedia(r.exercise_id, r);
    if (a.status === "confirmed") assert.equal(media.src, a.file, `${r.exercise_id} shows its confirmed image`);
    else assert.deepEqual([media.state, media.src], ["placeholder", null], `${r.exercise_id} (${a.status}) -> explicit placeholder`);
    for (const f of [a.file, a.candidate].filter(Boolean)) assert.ok(existsSync(join(root, "public", f)), `${r.exercise_id} file exists: ${f}`);
  }
  const confirmedFiles = Object.values(ASSETS.EXERCISE_IMAGE_ASSETS);
  assert.equal(new Set(confirmedFiles).size, confirmedFiles.length, "no confirmed image is shared");
  assert.equal(audit["F03-07"].status, "needs_review", "F03-07 (steps sideways) differs from F02-05 (feet fixed)");
  const html = page();
  const shown = [...html.matchAll(/<img src="(\/images\/exercise\/[^"]+)"/g)].map((m) => m[1]);
  assert.ok(shown.every((src) => confirmedFiles.includes(src)), "wrong image fallback = 0");
  assert.ok(!html.includes("trainpic"));
  assert.equal((html.match(/exercise-card-placeholder/g) || []).length, rehabExercises.filter((r) => audit[r.exercise_id].status !== "confirmed").length, "every non-confirmed exercise -> placeholder");
  // docs are generated from the same source of truth
  const docs = buildExerciseAssetDocs();
  assert.deepEqual(JSON.parse(readFileSync(join(root, "docs/specs/exercise_asset_audit.json"), "utf8")), JSON.parse(JSON.stringify(docs.audit)), "audit json in sync");
  assert.deepEqual(JSON.parse(readFileSync(join(root, "docs/specs/exercise_asset_backlog.json"), "utf8")), JSON.parse(JSON.stringify(docs.backlog)), "backlog json in sync");
  assert.equal(docs.backlog.count, rehabExercises.length - confirmedFiles.length);
  for (const it of docs.backlog.items) for (const k of ["exerciseId", "name", "domain", "description", "steps", "cameraAngle", "targetMuscles", "recommendedAspectRatio", "assetFilename"]) assert.ok(it[k] != null, `${it.exerciseId}.${k}`);
}

// ── Regression: 「全部」 rendered only the controls (report 2026-09-30) ─────
// Root cause: the new markup was running with a stylesheet that predates it
// (no .sp-* rules), so the unstyled banner icon filled the screen and the
// filter button was an empty box. The data path was correct; these guards
// keep it that way and keep the page usable even without its stylesheet.
{
  const html = page();
  // A · no filters -> the whole catalog, with the right count
  assert.equal(cardIds(html).length, catalog.length, "A: all exercises render");
  assert.equal([...html.matchAll(/(\d+) 項 ›/g)].reduce((a, m) => a + Number(m[1]), 0), catalog.length);
  // B / C · an image that is missing / needs_review / wrong never removes the exercise
  for (const status of ["missing", "needs_review", "wrong"]) {
    const ids = Object.entries(ASSETS.EXERCISE_ASSET_AUDIT).filter(([, a]) => a.status === status).map(([id]) => id);
    assert.ok(ids.length > 0);
    for (const id of ids) assert.ok(cardIds(html).includes(id), `${status} ${id} stays in the library`);
  }
  // D · every spelling of 「全部」 is the full catalog
  for (const all of ["", null, undefined, "all", "ALL", "全部", " 全部 "]) {
    assert.equal(cardIds(page({ selfPracticeBodyPart: all })).length, catalog.length, `ALL domain as ${JSON.stringify(all)}`);
  }
  assert.ok(fnSrc("toggleSelfPracticeBodyPart").includes("normalizeSelfPracticeDomain(value)"), "chips go through the one ALL value");
  // E · domain counts
  const expected = { "下肢功能": 20, "平衡": 9, "功能性移動": 11, "步行功能": 7, "上肢功能": 7, "柔軟度／活動能力": 12 };
  for (const [d, n] of Object.entries(expected)) assert.equal(cardIds(page({ selfPracticeBodyPart: d })).length, n, `${d} = ${n}`);
  // F / G · banner and results section present, in order
  const order = ['class="sp-domains"', 'class="sp-ai-banner"', 'class="sp-rail-section"', 'class="sp-rail"'].map((t) => html.indexOf(t));
  assert.ok(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), "chips → AI banner → first 功能構面 section → its rail");
  // H · the empty state only when the conditions truly match nothing
  assert.ok(!html.includes("找不到符合條件的動作"));
  for (const d of Object.keys(expected)) assert.ok(!page({ selfPracticeBodyPart: d }).includes("找不到符合條件的動作"));
  assert.ok(page({ selfPracticeSearchQuery: "zzzz" }).includes("找不到符合條件的動作"));
  // I · the filter button always has visible content (icon drawn by attributes + a 篩選 label)
  const btn = html.slice(html.indexOf('class="sp-filter-btn'), html.indexOf("</button>", html.indexOf('class="sp-filter-btn')));
  assert.ok(/<svg[^>]*width="20"[^>]*height="20"[^>]*stroke="currentColor"/.test(btn) && btn.includes(">篩選<") && btn.includes('aria-label="更多篩選"'));
  // icons keep a small intrinsic size even if the stylesheet is stale
  assert.ok(/class="sp-ai-banner"><img src="\/images\/ai_robot.png" alt="" width="28" height="28"/.test(html));
  assert.ok(/<img src="\/images\/exercise\/[^"]+" alt="[^"]*" width="240" height="240"/.test(html), "card photos carry an intrinsic size");
}

// ── 「全部」 = six 功能構面 rails (F01 → F06); one domain = 2-column grid ──
{
  const DOMAINS = ["下肢功能", "平衡", "功能性移動", "步行功能", "上肢功能", "柔軟度／活動能力"];
  const sectionsOf = (h) => [...h.matchAll(/<section class="sp-rail-section" data-domain="([^"]+)">([\s\S]*?)<\/section>/g)].map((m) => ({ domain: m[1], ids: cardIds(m[2]), count: Number((m[2].match(/(\d+) 項 ›/) || [])[1]) }));
  const html = page();
  const secs = sectionsOf(html);
  assert.deepEqual(secs.map((x) => x.domain), DOMAINS, "six sections, F01 → F06");
  for (const sec of secs) {
    const expected = rehabExercises.filter((r) => r.category === sec.domain).map((r) => r.exercise_id);
    assert.equal(sec.count, expected.length, `${sec.domain} header count (derived)`);
    assert.deepEqual(sec.ids.sort(), expected.sort(), `${sec.domain}: its own exercises only`);
  }
  assert.deepEqual(secs.map((x) => x.count), [20, 9, 11, 7, 7, 12]);
  const allIds = secs.flatMap((x) => x.ids);
  assert.equal(new Set(allIds).size, allIds.length, "each exercise once, in its own domain");
  assert.ok(html.includes(`onclick="toggleSelfPracticeBodyPart('下肢功能')"><b>下肢功能</b><span>20 項 ›</span>`), "the whole 「N 項 ›」 header opens that domain");
  assert.ok(!/全部動作|查看全部/.test(html), "no single 66-item list, no second 查看全部 entry");
  assert.equal((html.match(/class="sp-ai-banner"/g) || []).length, 1, "one AI banner");
  assert.ok(!html.includes('class="sp-grid"'));
  // one domain chosen -> that domain only, as a grid
  for (const d of DOMAINS) {
    const h = page({ selfPracticeBodyPart: d });
    assert.equal(sectionsOf(h).length, 0, `${d}: no other sections`);
    assert.ok(h.includes('class="sp-grid"') && cardIds(h).every((id) => rehabExercises.find((r) => r.exercise_id === id).category === d));
  }
  // search -> only matching domains, grouped
  const q = "膝";
  const searched = sectionsOf(page({ selfPracticeSearchQuery: q }));
  const matching = DOMAINS.filter((d) => catalog.some((e) => e.bodyPart === d && [e.name, e.bodyPart, e.raw.target_muscle, e.raw.description].join(" ").includes(q)));
  assert.deepEqual(searched.map((x) => x.domain), matching, "only domains with results, in F01 → F06 order");
  assert.ok(page({ selfPracticeSearchQuery: q }).includes(`${searched.reduce((a, x) => a + x.count, 0)} 項符合條件`));
  // 更多篩選 -> empty domains hidden
  const timed = sectionsOf(page({ selfPracticeMeasurement: "duration" }));
  assert.ok(timed.length > 0 && timed.length < DOMAINS.length && timed.every((x) => x.count > 0), "domains without a match are hidden");
  // rail: horizontal scroll with snap, no visible scrollbar, fixed-width cards; the page itself only scrolls vertically
  const css = readFileSync(join(root, "styles.css"), "utf8");
  assert.ok(/\.sp-rail \{[^}]*overflow-x: auto;[^}]*scroll-snap-type: x proximity;[^}]*scrollbar-width: none;/.test(css) && /\.sp-rail::-webkit-scrollbar \{ display: none; \}/.test(css));
  assert.ok(/\.sp-rail \.sp-card \{ flex: 0 0 152px; width: 152px; scroll-snap-align: start; \}/.test(css));
  assert.ok(/overscroll-behavior-x: contain/.test(css), "a swipe on a rail never scrolls the page sideways");
}

console.log(`Self practice library tests passed (${catalog.length} exercises)`);
