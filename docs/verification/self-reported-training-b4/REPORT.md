# B04 self-reported practice: third slice

2026-10-23, Taipei. Fresh GitHub checkout `3f765eae5028b7c202c183be715d5b8907a287dd` contains B3 and daily feedback. The preceding incomplete-reason ZIP was restored and its app/rules differences checked before applying it. This cumulative update retains those changes. No production deploy or remote write.

## Scope and rationale

Current normalized catalog has 66 exercises and all 66 resolve an AI analyzer. There is no genuine non-AI entry to test as such. This implementation provides an explicitly optional no-camera self-report entry from self-practice exercise detail, suitable for future non-AI catalog exercises. It does not change existing analyzer registrations or imply an AI exercise became unsupported.

Entry is guarded by patient role, self-practice mode and self_practice navigation origin. It is not exposed from assigned schedules or the F01 formal plan. Quantity can be total repetitions, explicitly separate left/right counts, or duration seconds according to the catalog's original measurementType. Missing side amounts are invalid; explicit zero for an unused side is allowed if at least one side is positive. No sets are inferred. Numeric upper bounds are engineering input limits, not clinical prescriptions.

New collection `selfReportedTraining` carries source=self_report, explicit unrecorded-practice attestation, actual amount, catalog identity/unit, note and relation stamp. It is separate from analysisRecords and all completion/scoring/XP pipelines. No new score, AI quality, completed sets, clinical evaluation, cycle day, schedule status or D5 input is generated. LLM prompts and existing AI summaries are unchanged. Both patient Home/exercise detail and the linked therapist case overview display a separately labeled ledger.

Same-device pending draft is persisted by owner/exercise and a stable session ID. Online transaction checks canonical document existence. An identical retry returns the stored record without another write; changed contents under that session ID are rejected and the existing record can be shown. Comparison is field-wise and does not depend on Firestore map key ordering. Only acknowledged cloud writes update the cache/clear the pending draft. Failed writes preserve input and retry ID. No offline send queue; unsent drafts are not shared across devices.

Recorded payload is immutable. Owner may make a one-way recorded -> voided update with server timestamp and fixed void reason. Historical quantity remains. Therapist cannot write/void. A voided record cannot be restored or deleted through client rules. Current accepted stamped relation is required for therapist reads. Owner may still void own historical record after a relation ends.

Idempotency is per session/document, not automatic physical-motion deduplication across different sessions. User confirms the practice was not already recorded by AI/manual reporting. Distinct IDs can still describe the same physical practice if incorrectly entered; this patch makes no stronger claim. Since this ledger never credits AI/cycle/schedule totals, it does not double-count those totals. Formal self-report credit and cross-source reconciliation remain policy work.

## Changed files

New model/service/view: js/data/selfReportedTraining.js, js/data/selfReportedTrainingService.js, js/ui/selfReportedTrainingView.js.

App: patient form route and self-practice entry/history, Home history, therapist case overview. The existing app reassigns render many times, so the new route is registered in its wrapper chain rather than only in the earlier overwritten render declaration.

Storage: optional owner/relation-scoped cloud hydration and no-delete collection list. Dedicated online transaction handles writes; no fire-and-forget success claim.

Rules: explicit schema, source, attestation, canonical session ID, units/counts, server creation timestamp, relation stamp, immutable payload and owner-only void transition. Static catalog identity/subjective truth is not independently certified by Firestore; schema and ID shape are validated.

Tests: new selfReportedTraining.test.js; no-delete safety test includes new collection. package.json changes are test scripts only, no dependency/lock changes. New emulator and browser scripts use the local demo project only.

## Results

| Check | Result |
| --- | --- |
| New feature unit/service/UI tests | PASS |
| Full npm test | 126/132; existing six failures unchanged |
| New manual-record rules | 31/31 |
| Existing daily feedback/reason rules | 40/40 |
| Existing recommendation/review rules | 48/48 |
| Existing assessment-session rules | 49/49 |
| Local patient/therapist browser integration | PASS |
| Vite production build | PASS, existing bundle-size warning |

Existing failures: test:tracking, test:flow-qa, test:home-redesign, test:exercise-experience, test:self-practice-library, test:llm-weekly-summary. The full suite is not green. Preceding incomplete-reason result was 125/131 with the same six.

Unit checks include invalid/negative/fractional/string/missing/mixed amounts, explicit zero side, attestation, unknown exercise rejection, stable pending draft, cloud failure with no false local success, same-session idempotence, immutable changed payload, owner/relation isolation, void preservation, HTML escaping and absence of analysis/schedule/cycle writes or fabricated scoring fields.

Rules checks cover anonymous/outsider/therapist writes, owner/linked scoped reads, unscoped list denial, forged source/AI score/credit, ID and relation mismatches, zero/fractional/missing/mixed units, immutable saved amount, duplicate overwrite, delete/restore, ownership after relation revocation, valid side/duration quantities and repeated transaction uniqueness.

Browser uses actual local Auth and Firestore plus synthetic users, a 390px patient and 1100px therapist. It opens the actual self-practice entry, submits side 3/0, replays the same service request and checks exactly one cloud document, then submits a duration and voids it after expanding history. Separate therapist login sees both records with void state and no edit control. It verifies no analysisRecords/trackingCycles/schedules for that patient and no score fields. No page error or unexpected dialog. All requests restricted to localhost/127.0.0.1; no camera, Gemini or production traffic. No screenshots retained.

## Reproduce

App tests use the normal npm dependencies. Emulator-only scripts use a separate folder with firebase-tools 13.35.1, @firebase/rules-unit-testing 3.0.4, firebase 10.14.1, Playwright 1.56.1 with Chromium, Java 17+. Copy the app's firestore.rules and scripts/selfReportedTrainingRulesCheck.mjs, scripts/selfReportedTrainingBrowserCheck.mjs, scripts/dailyFeedbackRulesCheck.mjs, scripts/firestoreRulesCheck.mjs and scripts/fa5xSessionRulesCheck.mjs there. Configure local Firestore :8080 and Auth :9099, UI disabled. Set REPO to the app root and RULES_PATH to current rules. Use firebase emulators:exec --only firestore,auth --project demo-remotion to run the scripts. Browser script manages its own local Vite.

## Delivery

Patch contains preceding incomplete-reason changes and this slice, excluding generated dist, environment files, node_modules and unchanged images. Install in existing project root and rebuild. Both firestore:rules and hosting must be deployed. No production or physical-phone acceptance was performed. See B4_SELF_REPORT_README.md.
