# B04 second slice: incomplete training reasons

2026-10-23. Base: `19845cc9a7d312b88f115e2abf0765070fc9ec65` plus previously delivered B3 and daily feedback. This cumulative patch does not push GitHub, deploy, change production data or change clinical/decision thresholds.

## Scope

Use the existing daily self-report workflow for an optional daily overall incompletion reason. The context is limited to an owned, active F01 cycle on a training day, with an owned linked recommendation. Daily effort/discomfort reporting remains available outside this context.

Read-only progress displays frozen daily target values where available, otherwise current plan amounts explicitly labeled unfrozen. It lists individual saved attempts with actual repetitions and side counts when present. Only records with matching owner, cycle, recommendation, exercise membership, formal F01 source and plan date are included. Record IDs are deduplicated. Missing actual values remain null; no attempt means no saved matching record, not proof of no practice. There is no summation into sets or inferred completion; completion status is copied from the existing daily ledger.

The optional categories include no time, too hard, discomfort, recognition problem, saving problem, not practiced, still in progress, other and unknown. No default reason is inferred. The daily effort and discomfort fields retain explicit unknown and no default negative.

Selecting a reason adds an `incompletion` extension to the new report in the existing append-only `dailyTrainingFeedback` document. The extension contains the reason and the displayed context (`source: device_loaded_records`). Previous reports, including B04-first-slice reports without this field, remain unchanged. A fingerprint detects changes in device-loaded targets/records while the form is open; the draft is retained for review. Existing online transaction, stale revision, conflict-refresh, relation read checks and success-after-cloud-confirmation remain.

Context records the data loaded on the reporting device, not a guaranteed live server aggregate or certified clinical data. Generic training records can exist in the local cache before their own cloud writes are confirmed; this feature does not certify those writes. Context is historical as-of-report information; later training does not mutate previous feedback. It is not consumed by D5, completion credit, weekly-summary prompts, analysis scores or dose adjustment.

The context is bounded to six displayed exercise rows, three recent attempts per row, and at most 4000 encoded bytes in the client builder. Omitted rows/attempts are labeled; total counts still cover all matched data, and originals remain in training history. Optional reason reporting is for the daily plan overall, not each exercise separately. The rules bound list/string shapes and validate related cycle ownership and recommendation; they do not independently certify each subjective/context count or the patient's timezone/date truth.

## Files

New: `js/data/incompleteTrainingFeedback.js`, `js/data/incompleteTrainingFeedbackService.js`, `js/ui/incompleteTrainingFeedbackView.js`, `tests/incompleteTrainingFeedback.test.js`.

Extended: dailyTrainingFeedback model/service/view, app.js, styles.css, firestore.rules, package.json (test script only), local rules/browser verification scripts. Prior B3 source files are included in the cumulative ZIP. No dependency or lockfile changes.

## Verification

- New unit/service/UI check: owned/date/source filtering, deduplication, frozen/unfrozen target labels, missing amount retention, separate partial attempts, no inferred completion, optional reason, old-report compatibility, unchanged cycle/analysis data and stale progress protection.
- Existing daily feedback tests pass.
- New and prior feedback rule checks: 40/40. Additional cases reject unknown reasons, foreign cycle, wrong recommendation/date, complete-context incompletion, fake certified source, malformed item, and injected score; valid reason append/correction is allowed while old context mutation is denied.
- Existing recommendation/review rules: 48/48. Existing assessment rules: 49/49.
- Full suite: 125/131. Same existing failures: test:tracking, test:flow-qa, test:home-redesign, test:exercise-experience, test:self-practice-library, test:llm-weekly-summary. Preceding daily-feedback delivery was 124/130 with those same six failures.
- Production build passes; existing bundle-size warning remains.

See results for exact logs. All cloud and browser checks use local demo-remotion emulators and synthetic accounts only. No production reads/writes, camera, Gemini, or physical-phone test. The browser script exercises the actual app services/forms with synthetic F01 targets and a saved partial attempt, reason/correction history, second-device stale-write handling, and linked therapist case overview.

## Reproduction and delivery

Use the same isolated verification environment as the prior B04 slice: firebase-tools 13.35.1, @firebase/rules-unit-testing 3.0.4, firebase 10.14.1, Playwright 1.56.1 with Chromium, Java 17+. Copy scripts/dailyFeedbackRulesCheck.mjs, scripts/dailyFeedbackBrowserCheck.mjs, scripts/firestoreRulesCheck.mjs and scripts/fa5xSessionRulesCheck.mjs into that environment. Configure local Firestore :8080 and Auth :9099; set REPO to the app root and RULES_PATH to current firestore.rules. Run the scripts with firebase emulators:exec and project demo-remotion. Browser script starts/stops its own Vite and restricts requests to localhost/127.0.0.1.

Overwrite the project root with this patch and rebuild; deploy both firestore:rules and hosting. Earlier clients can still append simple daily feedback without the new optional field. The app update is required to enter/view reason context. See B4_REASONS_README.md for user instructions. Physical-device and production acceptance remain after deployment.
