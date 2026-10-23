import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * Demo therapist seed + multi-patient workspace guards.
 *
 * Part 1 (static): the seed writes relations FIRST, keys them to the real
 *   resolved UIDs, marks a deterministic order, carries showcase names
 *   inline, is --reset-idempotent, verifies 5 cases, and prints a clean
 *   summary (no secrets).
 * Part 2 (static): app.js resolves showcase cases (no publicUsers doc) and
 *   orders Demo 患者 first without special-casing the visible name.
 * Part 3 (behavioural): the 5-case matrix → the derived status + the
 *   therapist-Home today counts, using the existing services + the same
 *   schedule-completion / recency rules the workspace uses.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const appJs = readFileSync(join(root, "app.js"), "utf8");
const seed = readFileSync(join(root, "scripts/seedDemoAccounts.mjs"), "utf8");
const sliceFn = (needle) => {
  const at = appJs.indexOf(needle);
  assert.ok(at !== -1, `expected ${needle}`);
  const end = appJs.indexOf("\n}", at);
  return appJs.slice(at, end === -1 ? at + 6000 : end + 2);
};

// ── Part 1 — seed script ──────────────────────────────────────────────
{
  // real UIDs, never hardcoded
  assert.ok(/const patientUid = await signIn\(patientApp, PATIENT_EMAIL/.test(seed), "patient UID resolved by real sign-in");
  assert.ok(/const therapistUid = await signIn\(therapistApp, THERAPIST_EMAIL/.test(seed), "therapist UID resolved by real sign-in");
  assert.ok(!/patientId: "[A-Za-z0-9]{20,}"/.test(seed), "no hardcoded Firebase UID literal");

  // relations written BEFORE any schedule write
  const relAt = seed.indexOf('therapistPatientRelations", `relation${MARK}p0`');
  const schedAt = seed.indexOf('"schedules", sId)');
  assert.ok(relAt !== -1 && schedAt !== -1 && relAt < schedAt, "the primary relation is written before schedules");

  // primary relation = accepted, deterministic order 0, keyed to real uids
  assert.ok(/relationDoc\(\{ id: `relation\$\{MARK\}p0`, therapistId: therapistUid, patientId: patientUid, demoOrder: 0, patientName: "Demo 患者" \}\)/.test(seed),
    "primary relation: therapistId=therapistUid, patientId=patientUid, status accepted, demoOrder 0");
  assert.ok(/status = "accepted"/.test(seed), "relationDoc defaults to accepted");

  // 4 showcase relations with inline name + order 1..4, no extra auth accounts
  assert.ok(/demo-showcase-patient-01[\s\S]*demo-showcase-patient-02[\s\S]*demo-showcase-patient-03[\s\S]*demo-showcase-patient-04/.test(seed),
    "4 stable deterministic showcase patient ids");
  assert.ok(/patientName: s\.name/.test(seed), "each showcase relation carries its display name inline");
  for (const n of ["林怡君", "陳冠宇", "王美玲", "張志豪"]) assert.ok(seed.includes(n), `showcase patient ${n} seeded`);

  // --reset deletes by BOTH therapistId and patientId, MARK-scoped
  assert.ok(/deleteDemoBy\(dbT, c, "therapistId", therapistUid\)/.test(seed), "--reset clears relation/schedule/record by therapistId");
  assert.ok(/deleteDemoBy\(dbT, "patientAssessments", "patientId", pid\)/.test(seed), "--reset clears assessments by each demo patientId");
  assert.ok(/if \(d\.id\.includes\(MARK\)\)/.test(seed), "--reset only touches _demo00_ docs (production users untouched)");

  // verification + summary
  assert.ok(/accepted\.length < 5/.test(seed) && /verification failed/.test(seed), "seed verifies the therapist ends with 5 accepted cases");
  assert.ok(/Demo seed complete/.test(seed) && /Managed cases: \$\{accepted\.length\}/.test(seed)
    && /Schedules: \$\{schedules\}/.test(seed) && /Analysis records: \$\{records\}/.test(seed)
    && /Functional assessments: \$\{fas\}/.test(seed), "concise summary printed");
  assert.ok(!/console\.log\([^)]*PASSWORD/.test(seed) && !/console\.log\([^)]*Uid\b/i.test(seed) && !/console\.log\([^)]*\.uid/.test(seed),
    "summary never prints a password / token / UID");
}

// ── Part 2 — app.js showcase resolution + ordering ────────────────────
{
  const r = sliceFn("function resolveCaseRelationPatient(");
  assert.ok(/userService\.getById\(relation\.patientId\)/.test(r), "real relation resolves the full profile");
  assert.ok(/if \(relation\.patientName\)/.test(r) && /name: relation\.patientName/.test(r), "showcase relation falls back to its inline name");
  assert.ok(/return null;/.test(r), "a real relation with no loaded profile is NOT given a fake name");

  const s = sliceFn("function therapistManagedCaseSummaries()");
  assert.ok(/resolveCaseRelationPatient\(relation\)/.test(s), "case summaries use the resolver (showcase cases not dropped)");
  assert.ok(/typeof x\.relation\.demoOrder === "number" \? x\.relation\.demoOrder : Number\.POSITIVE_INFINITY/.test(s),
    "sorts by additive demoOrder (production relations have none → sort last)");
  assert.ok(!/"Demo 患者"/.test(s), "no global special-casing of the visible name 'Demo 患者'");

  const list = sliceFn("function therapistCaseListPage()");
  assert.ok(/resolveCaseRelationPatient\(r\)/.test(list) && /demoOrder/.test(list), "個案列表 uses the resolver + demoOrder ordering");
  const detail = sliceFn("function therapistCaseDetailPage()");
  assert.ok(/const patient = relation \? resolveCaseRelationPatient\(relation\) : null/.test(detail),
    "case detail resolves via the relation (showcase cases open, don't bounce)");
}

// ── Part 3 — the 5-case matrix → statuses + today counts ──────────────
{
  const _store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (_store.has(k) ? _store.get(k) : null),
    setItem: (k, v) => _store.set(k, String(v)),
    removeItem: (k) => _store.delete(k),
  };
  const { relationService } = await import("../js/data/relationService.js");
  const { scheduleService } = await import("../js/data/scheduleService.js");
  const { analysisService } = await import("../js/data/analysisService.js");

  const TID = "demo_therapist_uid";
  const PID0 = "demo_patient_uid";
  const today = new Date().toISOString().slice(0, 10);
  const dAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString(); };

  // relations exactly as the seed writes them (hydration-equivalent)
  const relations = [
    { id: "relation_demo00_p0", therapistId: TID, patientId: PID0, status: "accepted", demoOrder: 0, patientName: "Demo 患者" },
    { id: "relation_demo00_s1", therapistId: TID, patientId: "demo-showcase-patient-01", status: "accepted", demoOrder: 1, patientName: "林怡君" },
    { id: "relation_demo00_s2", therapistId: TID, patientId: "demo-showcase-patient-02", status: "accepted", demoOrder: 2, patientName: "陳冠宇" },
    { id: "relation_demo00_s3", therapistId: TID, patientId: "demo-showcase-patient-03", status: "accepted", demoOrder: 3, patientName: "王美玲" },
    { id: "relation_demo00_s4", therapistId: TID, patientId: "demo-showcase-patient-04", status: "accepted", demoOrder: 4, patientName: "張志豪" },
  ];
  _store.set("remotion_collection_therapistPatientRelations", JSON.stringify(relations));

  const mkSched = (pid, exStatuses) => ({
    id: `sched_demo00_${pid}_d0`, patientId: pid, therapistId: TID, date: today, status: "in_progress",
    exercises: exStatuses.map((st, i) => ({ exerciseId: `E${i}`, exerciseName: `動作${i}`, status: st, analysisRecordId: null })),
  });
  const schedules = [
    mkSched(PID0, ["completed", "in_progress", "pending"]),                 // 1 / 3
    mkSched("demo-showcase-patient-01", ["completed", "completed"]),        // 2 / 2
    mkSched("demo-showcase-patient-02", ["pending", "pending", "pending"]), // 0 / 3
    mkSched("demo-showcase-patient-03", ["completed", "pending"]),          // 1 / 2
    // demo-showcase-patient-04: NO schedule today
  ];
  _store.set("remotion_collection_schedules", JSON.stringify(schedules));

  // 張志豪 (patient-04) — a recent record so recency logic fires
  _store.set("remotion_collection_analysisRecords", JSON.stringify([
    { id: "analysis_demo00_s4_h0", patientId: "demo-showcase-patient-04", therapistId: TID, source: "assigned",
      score: 80, overallScore: 80, completedAt: dAgo(2), createdAt: dAgo(2) },
  ]));

  // mirror buildTherapistCaseSummary's status derivation (schedule completion + 7-day recency ONLY)
  const statusOf = (pid) => {
    const sched = scheduleService.getByPatientAndDate(pid, today);
    const ex = sched && Array.isArray(sched.exercises) ? sched.exercises : [];
    const total = ex.length, done = ex.filter((e) => e.status === "completed").length;
    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const recent = analysisService.getByPatientId(pid).filter((r) => Date.now() - new Date(r.completedAt || r.createdAt).getTime() <= weekMs).length;
    if (total > 0 && done === total) return "今日已完成";
    if (total > 0 && done > 0) return "部分完成";
    if (total > 0) return "今日待訓練";
    if (recent > 0) return "近期有訓練";
    return "近期無訓練";
  };

  const accepted = relationService.findActiveByTherapistId(TID);
  assert.equal(accepted.length, 5, "seed produces 5 accepted therapist relations");

  // Demo 患者 sorts first by demoOrder
  const ordered = [...accepted].sort((a, b) => (a.demoOrder ?? Infinity) - (b.demoOrder ?? Infinity));
  assert.equal(ordered[0].patientId, PID0, "Demo 患者 (real patient00 UID) sorts first");
  assert.deepEqual(ordered.map((r) => r.patientName), ["Demo 患者", "林怡君", "陳冠宇", "王美玲", "張志豪"]);

  // statuses derived from schedules / records only
  assert.equal(statusOf(PID0), "部分完成", "Demo 患者 today 1/3 → 部分完成");
  assert.equal(statusOf("demo-showcase-patient-01"), "今日已完成", "林怡君 2/2 → 今日已完成");
  assert.equal(statusOf("demo-showcase-patient-02"), "今日待訓練", "陳冠宇 0/3 → 今日待訓練");
  assert.equal(statusOf("demo-showcase-patient-03"), "部分完成", "王美玲 1/2 → 部分完成");
  assert.equal(statusOf("demo-showcase-patient-04"), "近期有訓練", "張志豪 no schedule + recent record → 近期有訓練");

  // therapist Home 今日待處理 counts
  const withToday = ordered.filter((r) => {
    const sc = scheduleService.getByPatientAndDate(r.patientId, today);
    return sc && (sc.exercises || []).length > 0;
  });
  const doneToday = withToday.filter((r) => {
    const sc = scheduleService.getByPatientAndDate(r.patientId, today);
    const ex = sc.exercises || [];
    return ex.length > 0 && ex.every((e) => e.status === "completed");
  });
  assert.equal(withToday.length, 4, "今日有課表 = 4");
  assert.equal(doneToday.length, 1, "已完成 = 1");
  assert.equal(withToday.length - doneToday.length, 3, "待完成 / 進行中 = 3");
}

// ── Therapist Home data-source consistency (the "追蹤個案 1" bug) ──────
{
  // exactly ONE active therapistHome renderer — no later `therapistHome = function`
  // reassignment silently overriding the V2 declaration.
  assert.equal((appJs.match(/^function therapistHome\(\)/gm) || []).length, 1, "one V2 `function therapistHome()` declaration");
  assert.ok(!/\btherapistHome\s*=\s*function\s*\(/.test(appJs), "no stale `therapistHome = function()` override");
  assert.ok(/function therapistHomeLegacyV1\(\)/.test(appJs), "the V1 renderer is renamed (deprecated, non-overriding)");

  const home = sliceFn("function therapistHome()");
  assert.ok(/const cases = therapistManagedCaseSummaries\(\)/.test(home),
    "Home derives from the SAME source as 個案管理 (therapistManagedCaseSummaries)");
  // no Home-only re-query that drops showcase cases
  assert.ok(!/relationService\.findAcceptedByTherapistId/.test(home) && !/userService\.getById/.test(home),
    "Home does not independently filter by userService.getById(patientId)");
  // tracked count = summaries.length
  assert.ok(/追蹤個案 \$\{cases\.length\}/.test(home), "追蹤個案 count = cases.length (all 5)");
  // today counts come from cases, not a separate query
  assert.ok(/withToday = cases\.filter/.test(home) && /doneToday = withToday\.filter/.test(home),
    "今日待處理 counts derive from the full case set");
  // preview + CTA when > 3, count still from all cases
  assert.ok(/cases\.slice\(0, LIST_PREVIEW\)/.test(home) && /查看全部 \$\{cases\.length\} 位個案/.test(home),
    "list view previews the first rows with a 查看全部 N 位個案 CTA");
  // no undefined account placeholder anywhere in the therapist case UI
  for (const fn of ["function therapistHome()", "function renderTherapistCaseRow(", "function therapistCaseListPage()", "function renderCaseHistoryList("]) {
    assert.ok(!/帳號：\$\{[^}]*\.account\}/.test(sliceFn(fn)), `${fn} renders no "帳號：\${...account}" line`);
  }
}

// ── no unsupported clinical labels leaked into the therapist path ─────
{
  const home = sliceFn("function therapistHome()");
  const cs = sliceFn("function buildTherapistCaseSummary(");
  const strip = (s) => s.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const banned of ["高風險", "恢復良好", "病情惡化", "恢復率", "改善率", "動作正確率", "風險等級", "AI 風險預測"]) {
    assert.ok(!strip(home).includes(banned) && !strip(cs).includes(banned), `no unsupported clinical label "${banned}"`);
  }
}

console.log("Demo therapist seed + multi-patient workspace guards passed");
