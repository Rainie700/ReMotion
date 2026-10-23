# Self-report attestation layout fix and B04 integration review

Date: 2026-10-23 (Taipei). Target: previously delivered self-report cumulative update. User screenshot showed the checkbox occupying available width while its text wrapped outside the right edge of the form.

Cause: generic input width:100% and padding applied to the checkbox; the flex label's anonymous text item was squeezed. Fix uses a 22px/minmax(0,1fr) grid, explicit checkbox width/height/padding/margin, and a text span with min-width:0 and normal wrapping. Native label association and keyboard/click interaction remain.

Runtime changed files: styles.css and js/ui/selfReportedTrainingView.js only. No Firestore rule, source, idempotence, quantity, credit or D5 change in this patch. Only Hosting rebuild/deploy is needed when the prior self-report update is installed.

Verification:

- Existing selfReportedTraining, dailyTrainingFeedback and incompleteTrainingFeedback unit/service/view tests pass.
- Local actual-browser integration rechecks feelings/reasons with synthetic frozen F01 targets and saved partial amount, append-only corrections, stale second-device conflict retaining draft, and linked therapist history.
- Self-report browser rechecks explicit left/right values (3/0), duration, stable-session retry with one stored document, void preserving quantity and read-only linked therapist view. No AI analysis record, score, schedule/cycle credit or unexpected dialog/page error.
- At 320, 375, 390 and 430px: checkbox width is 20–24px (configured 22px), text width exceeds 100px, text bounds stay inside form, label height stays below 160px and document width does not exceed viewport. Clicking label text toggles the native checkbox.
- Chromium local verification uses installed Traditional Chinese CJK font support for the final layout check. Internal visual inspection is not an iOS Safari test. No screenshot is included as a deliverable.
- Production Vite build passes; existing large-chunk warning remains.
- This small UI patch does not rerun/claim to repair the six previously recorded full-suite failures. Prior full suite was 126/132.

Scripts use local demo-remotion Auth/Firestore and synthetic identities only, with browser requests restricted to localhost/127.0.0.1, no camera or Gemini. Raw logs are in results. selfReportedTrainingBrowserCheck.mjs includes the viewport and label assertions; an optional LAYOUT_SCREENSHOT path is for local inspection only.

Delivery includes the two runtime files, updated local browser-check script, this report/logs, installation instructions and docs/REHAB_HANDOFF_CURRENT.md. The handoff separates implemented engineering from remaining policy and physical-device work. No production deploy or GitHub push performed.
