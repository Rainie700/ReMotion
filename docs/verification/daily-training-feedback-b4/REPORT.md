# B04 daily subjective training feedback — first slice

Date: 2026-10-23 (Taipei). Base repository commit: `19845cc9a7d312b88f115e2abf0765070fc9ec65`, with the previously delivered B3 changes retained. No push, production deploy, clinical threshold change, or production-data migration performed.

## Behavior and boundaries

An explicit patient Home card records subjective effort, discomfort (including explicit unknown), and optional note. A saved record becomes a summary with an edit action; there is no recurring after-exercise prompt. Therapist case overview shows the seven latest reported dates and all corrections. Empty data and failed cloud loads are distinguished; absence is never converted to a negative symptom report.

One deterministic document per patient/local-calendar-date in `dailyTrainingFeedback`. Each online transaction appends one report and increments the revision. Expected revision protects against stale devices; a concurrent rule rejection is followed by an owner-only fresh server read to distinguish a conflict from a generic save failure. Only confirmed cloud writes update the local cache. Failed saves retain the form draft. No offline upload queue.

The Firestore rules validate fields, owner, enum values, author/source, append-only history, canonical ID, server update timestamp, and current relation stamp. Only the patient writes; the patient or currently linked stamped therapist reads; client deletion is denied. No fallback broad wildcard grants this collection access. A missing document may be read by authenticated users so an initial transaction can check absence; it contains no stored data. Listing remains scoped.

The client restricts submission to the current local calendar date. Rules validate the date shape, not independent proof of the patient's timezone or symptom truth. Client-reported timestamps and categorical values remain subjective user reports. Server-created/updated timestamps audit cloud writes. At most 100 revisions per day bound document growth. Clinical numeric scales, response thresholds, retrospective reporting policies, and relation-history transfer are not invented.

Existing past-relation records are not automatically restamped for a new therapist. Visibility follows the stamp at the time of the report/correction and the currently accepted relationship. No background notifications or response time promise.

No use of this collection in completion credit, D5 inputs, LLM weekly-summary prompts, AI scores, or prescription/dose adjustment. Those remain separate future work.

## Files

- `js/data/dailyTrainingFeedback.js`: pure schema, labels, validation and immutable correction builder.
- `js/data/dailyTrainingFeedbackService.js`: online Firestore transaction, conflict/failure handling, local read cache, relation-scoped therapist list.
- `js/ui/dailyTrainingFeedbackView.js`: escaped patient form and therapist history.
- `app.js`: Home card, handlers and therapist overview integration; includes preceding B3 changes.
- `styles.css`: responsive native select/textarea layout.
- `js/data/storageService.js`: optional authenticated cloud load and delete-block list for the new collection. New feedback writes use the dedicated transaction, not generic fire-and-forget writes.
- `firestore.rules`: new scoped append-only collection rules, plus B3 rules retained.
- `package.json`: one additional test script, no dependency changes.
- `tests/dailyTrainingFeedback.test.js`: feature tests; `tests/patient00DemoCloudSafety.test.js` now checks membership and the no-delete rule for all protected collections rather than assuming exactly three collections.
- `scripts/dailyFeedbackRulesCheck.mjs`, `scripts/dailyFeedbackBrowserCheck.mjs`: emulator-only integration checks.

## Verification

| Check | Result |
| --- | --- |
| New unit/service/UI tests | PASS |
| Full npm test | 124/130, same six existing failures |
| Build | PASS, existing bundle-size warning |
| New emulator feedback checks | 29/29 |
| Existing recommendation/review emulator checks | 48/48 |
| Existing assessment emulator checks | 49/49 |
| Local browser integration | PASS |

Existing failing names: test:tracking, test:flow-qa, test:home-redesign, test:exercise-experience, test:self-practice-library, test:llm-weekly-summary. The preceding B3 run after dependencies were installed was 123/129 with these same six failures. The full suite is not green.

Unit/service checks cover invalid/missing enums and dates, explicit unknown, no local success on cloud failure, original report preservation, a single daily document, stale local revisions, stale second-device revisions, ownership, revoked relation visibility and HTML escaping. Model changes do not create recommendations or analysis records.

Rule checks include outsider and therapist write denial, forged relation/author/source rejection, mismatched ID rejection, scoped and unscoped reads/queries, old-report mutation, timestamp mutation, invalid correction, accepted append, stale overwrite, delete, patient reassignment, fake score, revoked relation and an unlinked owner save. Two competing transactions preserve one successful commit and reject the other without overwriting history.

Browser check uses isolated synthetic patient and therapist users in local Auth/Firestore, a 390px patient viewport, a second isolated patient context, and an 1100px therapist viewport. Actual forms and the app's real transaction service create unknown feedback, save a yes-discomfort correction, reject a stale second-device edit while retaining its draft, and load history in therapist case overview. Page errors and dialogs must be empty. Requests are restricted to localhost/127.0.0.1, with no camera, production data, or Gemini calls. No screenshots retained.

## Reproduce

Use an isolated verification folder, not app dependencies: firebase-tools 13.35.1, @firebase/rules-unit-testing 3.0.4, firebase 10.14.1, playwright 1.56.1, Java 17+, installed Playwright Chromium. Copy the two new scripts, existing scripts/firestoreRulesCheck.mjs and scripts/fa5xSessionRulesCheck.mjs to that folder. Copy current firestore.rules. Configure Firestore 127.0.0.1:8080 and Auth 127.0.0.1:9099, UI disabled, in its firebase.json.

Set RULES_PATH to the app's absolute firestore.rules and REPO to its absolute root. Run:

```bash
firebase emulators:exec --only firestore,auth --project demo-remotion 'node dailyFeedbackRulesCheck.mjs && node firestoreRulesCheck.mjs && node fa5xSessionRulesCheck.mjs && node dailyFeedbackBrowserCheck.mjs'
```

Browser script starts/stops its own local Vite. These scripts use the demo project and synthetic data only. Logs in results show the runs, including expected permission-denied diagnostics for rejected writes.

## Delivery

The patch ZIP includes B3 + this B04 slice so there is no need to overlay an older package afterwards. It excludes dist, node_modules, environment files, and unchanged assets. Deploy both Firestore rules and rebuilt Hosting. Production and physical-phone acceptance are still to be performed after deployment. See root B4_UPDATE_README.md.
