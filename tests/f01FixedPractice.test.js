process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * G01 坐站固定練習原型 (docs/F01_G01_PROGRAM_SELECTION.md 第六節 Decision A). Isolated in-memory data through
 * the real modules; the camera count comes from the real LE05 session fed with synthetic knee angles
 * (program logic only — not real video).
 */
const mem = new Map();
globalThis.localStorage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const FP = await import("../js/data/f01FixedPractice.js");
const { f01FixedPracticeService, FIXED_PRACTICE_SYNC } = await import("../js/data/f01FixedPracticeService.js");
const { createSitToStandSession } = await import("../js/ai/exercises/sitToStand/session.js");
const { exerciseService } = await import("../js/data/exerciseService.js");
const { createCollection } = await import("../js/data/storageService.js");
const { CASES, STEP } = await import("../docs/verification/le05-slow-rep/cases.mjs");

const ok = async () => ({ total: 1, failed: [] });
const fail = (id) => async () => ({ total: 1, failed: [{ name: "f01FixedPracticeRecords", id, ok: false }] });
const feed = (session, frames) => { let t = 0; for (const k of frames) { t += STEP; k == null ? session.processFrame({ timestamp: t, bodyReady: false }) : session.processFrame({ timestamp: t, averageKneeAngle: k, trunkLeanDeg: 12, kneeAsymmetryDeg: 3, kneeValgus: false, bodyReady: true }); } return session.getSummary(); };
const base = (over = {}) => ({ patientId: "u1", runId: "run_abcdef12", exerciseName: "坐姿起立", instructionsReadAt: "2026-10-27T01:00:00.000Z", startedAt: "2026-10-27T01:01:00.000Z", completedAt: "2026-10-27T01:03:00.000Z", dateKey: "2026-10-27", ...over });

// ── 1. fixed content: 5 repetitions, never the catalog's 3×8; the catalog itself is unchanged ──
{
  assert.deepEqual({ ...FP.F01_FIXED_PRACTICE_TARGET }, { repetitions: 5, sets: null });
  const cat = exerciseService.getById("F01-04");
  assert.ok(String(cat.sets || cat.defaultSets || "").includes("3") && String(cat.repetitions || cat.defaultRepetitions || "").includes("8"), "catalog default untouched (3×8)");
  assert.ok(FP.F01_FIXED_PRACTICE_READ_NOTE.includes("不代表系統已確認安全、適合你或通過評估"));
  assert.ok(FP.F01_FIXED_PRACTICE_FREQUENCY_TEXT.includes("只做這一個動作，不代表已符合完整的運動建議"));
  // UX round 1/5: same two limits, plain wording (camera helps count; hand support unknown; a count is not a quality pass)
  assert.ok(FP.F01_FIXED_PRACTICE_COUNT_NOTE.includes("不代表動作品質合格") && FP.F01_FIXED_PRACTICE_COUNT_NOTE.includes("無法確認是否使用手部支撐") && FP.F01_FIXED_PRACTICE_COUNT_NOTE.includes("無法確認的動作不會計入"));
  assert.equal(FP.F01_FIXED_PRACTICE_LIMIT_TEXT, "相機協助計次，無法確認是否使用手部支撐。");
  assert.ok(![FP.F01_FIXED_PRACTICE_COUNT_NOTE, FP.F01_FIXED_PRACTICE_LIMIT_TEXT].some((t) => t.includes("看不到手")), "no 「系統看不到手」 wording");
  // the patient reminders restate the existing chair / before-use / stop texts — nothing new, none dropped
  assert.equal(FP.F01_FIXED_PRACTICE_REMINDERS.length, 5);
  const R = FP.F01_FIXED_PRACTICE_REMINDERS.join("");
  for (const k of ["穩固", "沒有輪子", "沒有扶手", "雙腳平放", "直角", "很久沒有運動", "醫療狀況", "不確定是否適合你", "醫師或照護你的醫療人員", "不痛的範圍", "暈眩、胸痛、喘不過氣", "肌肉疼痛一直不退", "停止並聯絡醫師", "不等於完整的運動建議"]) assert.ok(R.includes(k), `reminder kept: ${k}`);
  assert.equal(FP.F01_FIXED_PRACTICE_STEPS.length, 3, "three ordered steps (source meaning unchanged)");
  assert.ok(FP.F01_FIXED_PRACTICE_SOURCE.supplementStop.note.includes("不採用其等級、次數或頻率"), "the Otago reminder is labelled as another source");
  assert.ok(FP.F01_FIXED_PRACTICE_FIXED_NOTE.includes("五次坐站秒數沒有用來決定"));
}

// ── 2. AI part from the real LE05 session: target reached / ended early / unconfirmed kept apart ──
{
  const full = feed(createSitToStandSession({ targetReps: 5 }), CASES.find((c) => c.id === "S10").frames);
  const a = FP.buildFixedPracticeAi(full, { endedEarly: !full.completed });
  assert.deepEqual([a.countedReps, a.targetReached, a.endedEarly, a.unconfirmedAttemptCount, a.handSupportVerified, a.method], [5, true, false, 0, false, "ai_pose"]);
  const two = feed(createSitToStandSession({ targetReps: 5 }), [...CASES.find((c) => c.id === "S8").frames, ...CASES.find((c) => c.id === "S1").frames.slice(6), ...CASES.find((c) => c.id === "S1").frames.slice(6)]);
  const b = FP.buildFixedPracticeAi(two, { endedEarly: !two.completed });
  assert.equal(b.countedReps, 2);
  assert.equal(b.endedEarly, true);
  assert.equal(b.unconfirmedAttemptCount, 1, "the unconfirmed attempt is reported, never added");
  assert.deepEqual(b.unconfirmedReasons, ["rise_not_observed"]);
}

// ── 3. records: AI and self-report separate; read == instructions read only; saved once per run ──
{
  assert.equal(FP.buildFixedPracticeRecord(base({ instructionsReadAt: null, ai: FP.buildFixedPracticeAi({ totalReps: 1 }, {}) })).error, "instructions_not_read");
  assert.equal(FP.buildFixedPracticeRecord(base()).error, "nothing_to_record");
  assert.equal(FP.buildFixedPracticeRecord(base({ runId: "x" , ai: FP.buildFixedPracticeAi({ totalReps: 1 }, {}) })).error, "invalid_run");
  const ai = FP.buildFixedPracticeAi({ totalReps: 3, unconfirmedAttemptCount: 1, unconfirmedAttempts: [{ reason: "tracking_lost" }] }, { endedEarly: true });
  const res = await f01FixedPracticeService.saveRun(base({ ai }), { syncWrites: ok });
  assert.equal(res.sync, FIXED_PRACTICE_SYNC.SYNCED);
  const r = res.record;
  assert.equal(r.id, "f01FixedPractice_u1_run_abcdef12");
  assert.deepEqual([r.kind, r.exerciseId, r.programVersion, r.target.repetitions, r.ai.countedReps, r.selfReport], ["f01_fixed_practice", "F01-04", FP.F01_FIXED_PRACTICE_VERSION, 5, 3, null]);
  assert.ok(!("trackingCycleId" in r) && !("recommendationId" in r) && !("sourceSubtype" in r), "no cycle / plan / training-source linkage");
  const withSelf = await f01FixedPracticeService.addSelfReport({ patientId: "u1", recordId: r.id, totalReps: 4, reportedAt: "2026-10-27T01:05:00.000Z" }, { syncWrites: ok });
  assert.equal(withSelf.record.ai.countedReps, 3, "self-report never changes the AI count");
  assert.equal(withSelf.record.selfReport.totalReps, 4);
  assert.deepEqual(FP.describeFixedPracticeRecord(withSelf.record), ["AI 計次：3 / 5 次（提早結束）", "另有 1 次動作無法確認，沒有計入", "自行回報：4 次（本人填寫，與 AI 計次分開）"]);
  assert.equal((await f01FixedPracticeService.addSelfReport({ patientId: "someone-else", recordId: r.id, totalReps: 1, reportedAt: "x" }, { syncWrites: ok })).error, "record_not_found");
  // the same run saved again: same document, first AI result kept
  const again = await f01FixedPracticeService.saveRun(base({ ai: FP.buildFixedPracticeAi({ totalReps: 5 }, {}) }), { syncWrites: ok });
  assert.equal(again.alreadySaved, true);
  assert.equal(again.record.ai.countedReps, 3);
  assert.equal(f01FixedPracticeService.listForPatient("u1").length, 1);
  // self-report only (no camera): ai null
  const only = await f01FixedPracticeService.saveRun(base({ runId: "run_selfonly1", selfReport: { totalReps: 5, reportedAt: "2026-10-27T02:00:00.000Z" } }), { syncWrites: ok });
  assert.equal(only.record.ai, null);
  assert.deepEqual(FP.describeFixedPracticeRecord(only.record), ["AI 計次：本次沒有使用相機", "自行回報：5 次（本人填寫，與 AI 計次分開）"]);
}

// ── 4. cloud failure is never shown as synced; retry re-sends the same id (no duplicate) ──
{
  const id = "f01FixedPractice_u2_run_failsync1";
  const failed = await f01FixedPracticeService.saveRun(base({ patientId: "u2", runId: "run_failsync1", ai: FP.buildFixedPracticeAi({ totalReps: 5 }, {}) }), { syncWrites: fail(id) });
  assert.equal(failed.sync, FIXED_PRACTICE_SYNC.FAILED);
  assert.equal(f01FixedPracticeService.syncStatus(id), FIXED_PRACTICE_SYNC.FAILED);
  const stillFailing = await f01FixedPracticeService.retrySync({ patientId: "u2", recordId: id }, { syncWrites: fail(id) });
  assert.equal(stillFailing.sync, FIXED_PRACTICE_SYNC.FAILED);
  const retried = await f01FixedPracticeService.retrySync({ patientId: "u2", recordId: id }, { syncWrites: ok });
  assert.equal(retried.sync, FIXED_PRACTICE_SYNC.SYNCED);
  assert.equal(f01FixedPracticeService.listForPatient("u2").length, 1, "one record after failure + retries");
  assert.equal(f01FixedPracticeService.syncStatus("never-saved-locally"), FIXED_PRACTICE_SYNC.SYNCED, "a record without a local entry came from the cloud");
}

// ── 5. never an analysisRecord, tracking cycle or daily completion ──
{
  const analysis = createCollection("analysisRecords").list().length;
  const cycles = createCollection("trackingCycles").list().length;
  await f01FixedPracticeService.saveRun(base({ patientId: "u3", runId: "run_isolated1", ai: FP.buildFixedPracticeAi({ totalReps: 5 }, {}) }), { syncWrites: ok });
  assert.equal(createCollection("analysisRecords").list().length, analysis);
  assert.equal(createCollection("trackingCycles").list().length, cycles);
}

// ── 6. app wiring ──
{
  const fin = appJs.slice(appJs.indexOf("async function finalizeF01FixedPracticeRun("), appJs.indexOf("function goF01FixedPracticeRecord("));
  assert.ok(fin.includes("f01FixedPracticeService.saveRun(") && !fin.includes("analysisService.create(") && !fin.includes("persistLe05Session("), "saved as a fixed-practice record only");
  assert.ok(fin.includes("endedEarly: !s.completed"), "early end saved as it is");
  const start = appJs.slice(appJs.indexOf("function startF01FixedPracticeCamera("), appJs.indexOf("const fixedExerciseName"));
  assert.ok(start.includes("state.f01TrainingContext = null") && start.includes('state.navigationOrigin = "f01FixedPractice"') && !start.includes("armF01TrackingTraining("), "no cycle context is armed");
  // the cycle listener only counts f01Recommendation trainings
  assert.ok(/analysisService\.onCreate\(\(record\) => \{\s*const ctx = state\.f01TrainingContext;\s*if \(!ctx \|\| state\.navigationOrigin !== "f01Recommendation"\) return;/.test(appJs));
  assert.ok(appJs.includes("targetReps:isF01FixedPracticeRun()?state.f01FixedPracticeRun.target.repetitions:"), "camera target = the run's own snapshot");
  // prep: the run's own target snapshot next to the name; placement + camera only (no care fold / long notes)
  assert.ok(appJs.includes("targetHtml: fixedRun ? `<span class=\"exp-prep-target f01-fixed-prep-target\">本次 ${fixedRun.target.repetitions} 次</span>`"), "prep target = the run's own snapshot (shown)");
  assert.ok(appJs.includes('name: fixedRun ? "坐站練習" : undefined,') && appJs.includes("showCare: !fixedRun,"), "fixed prep: own name, no repeated care text");
  assert.ok(appJs.includes("if(le05SessionMeta&&le05SessionMeta.fixedPractice)return finalizeF01FixedPracticeRun();"));
  assert.ok(appJs.includes('onclick="goF01FixedPractice()"') && appJs.includes("固定練習，非個別訓練安排"), "entry kept apart from the recommendation");
  assert.ok(!appJs.includes("C｜坐站"), "no 「C｜」 shown");
  // entry: 訓練 tab -> 坐站練習 (and the six-domain explorer -> F01) for everyone — no cycle / assessment / account
  // condition on the entries (2026-10-28: a direct 坐站練習 card replaced the F01 row; 返回 goes straight back)
  const quick = appJs.slice(appJs.indexOf('<h3 class="section-title">探索與練習</h3>'), appJs.indexOf('utility("goActionRecords()"'));
  assert.ok(/^\s*<h3 class="section-title">探索與練習<\/h3>\s*<div class="today-explore">\s*\$\{exploreCard\("goF01FixedPracticeFrom\('work'\)"/.test(quick) && quick.includes(`exploreCard("goFunctionalDomainHome('work')"`), "坐站練習 + 六大功能構面 always rendered in 訓練 → 探索與練習");
  assert.ok(/function f01LowerLimbHomePage\(\) \{[\s\S]*?onclick="goF01FixedPracticeFrom\('f01'\)"/.test(appJs) && !/function f01LowerLimbHomePage\(\) \{\s*if/.test(appJs), "F01 page always shows 坐站練習");
  assert.ok(appJs.includes(`onclick="\${state.f01FixedFrom === "work" ? "switchTab('work')" : "goF01LowerLimbHome()"}">返回</button>`), "坐站練習 返回 goes back where it was opened");
  const page = appJs.slice(appJs.indexOf("function f01FixedPracticePage("), appJs.indexOf("const fixedPracticeHeader"));
  assert.ok(page.includes("startF01FixedPracticeCamera()\" ${read ? \"\" : \"disabled\"}>開始準備</button>"), "start (開始準備) only after reading");
  assert.ok(!/已確認安全|適合你使用|通過評估。|推薦給你/.test(page.replace("${FP.F01_FIXED_PRACTICE_READ_NOTE}", "")));
  // research / engineering detail lives in the docs, not on the patient page
  for (const k of ["NHS", "Otago", "F01_FIXED_PRACTICE_SOURCE", "FIXED_NOTE", "FREQUENCY_TEXT", "10 秒", "programVersion", "看不到手", "f01-fixed-history-row"]) assert.ok(!page.includes(k), `intro page has no ${k}`);
  const rec = appJs.slice(appJs.indexOf("function f01FixedPracticeRecordPage("), appJs.indexOf("// 本機瀏覽器驗證 only (same gate as __emulatorFinishFa5xRun)"));
  assert.ok(!rec.includes("programVersion") && !rec.includes("sourceRef"), "record page: no version code / source link");
  const hist = appJs.slice(appJs.indexOf("function f01FixedPracticeHistoryPage("), appJs.indexOf("function f01FixedPracticeRecordPage("));
  assert.ok(hist.includes("listForPatient(patientId)") && hist.includes("goF01FixedPracticeRecord('${r.id}', 'history')") && !hist.includes("slice(0, 10)"), "records on their own page, existing data");
  assert.ok(appJs.includes('state.route === "f01FixedPracticeHistory"') && appJs.includes('state.route === "f01FixedPracticeSelf"'));
  // emulator-only synthetic hook
  assert.ok(/if \(EMULATOR_MODE && typeof window !== "undefined"\) \{\s*window\.__emulatorFeedFixedPracticeFrames/.test(appJs));
  // rules: owner-only, AI fixed at create, no delete
  const rules = readFileSync(join(root, "firestore.rules"), "utf8");
  const block = rules.slice(rules.indexOf("match /f01FixedPracticeRecords/{id}"), rules.indexOf("match /f01FixedPracticeRecords/{id}") + 900);
  assert.ok(block.includes("resource.data.patientId == request.auth.uid") && block.includes("request.resource.data.ai == resource.data.ai") && block.includes("allow delete: if false"));
}
console.log("f01FixedPractice: all assertions passed");
