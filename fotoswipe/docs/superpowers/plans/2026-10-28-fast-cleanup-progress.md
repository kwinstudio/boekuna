# Progress — 2026-10-28-fast-cleanup

User approved all options and fixes. Initial test-first Later API run failed because PhotoDecision.later was missing. Added compatible enum case without changing persisted fields.

Independent image-pipeline and similarity tasks were delegated under dispatching-parallel-agents; fresh integrated review was performed under executing-plans. Structural project validation passes. Initial Mac compilation succeeded; XCTest exposed an invalid lazy Collection filter with a stateful uniqueness predicate, causing missing scheduled requests and a Range trap. Replaced it with an eager bounded loop and retained those scheduling tests.

All five material review findings addressed: preview-ready comparison decisions; stable random-session membership; allowing a previously issued visible swipe to finish during metadata-only mutation; cancelling/rechecking observer tasks and rejecting older fetches; independently refreshing album catalogue after creation. Regression cases added for readiness, random membership, mutation gates and swipe policy.

Additional user-authorized fixes: five recent light previews retained for undo; evicted preview retries on promotion; Later replay returns kept session items to the Later stack; media copy updated for video items. Budget/cancellation tests cover buffer behavior. No new permission scope, backend, dependency or upload of photo content introduced.

Verification pending: updated native suite, archive, final signing/upload, Apple processing and internal-group distribution. No physical-device timing claim.

Apple fastFormat documentation confirms one callback which may be degraded; light stages now accept that actual fast preview rather than waiting for highQualityFormat. Sharp upgrades alone require final quality. Added a stage-options regression test. Reference: https://developer.apple.com/documentation/photos/phimagerequestoptionsdeliverymode/fastformat .

Check branch run https://github.com/kwinstudio/boekuna/actions/runs/40729780302 completed the full 44-test simulator step successfully. Final release adds the fastFormat configuration test (45 expected), independent simulator screenshot capture with synthetic media, and repeated-scan exclusion of this sheet's already-queued identifiers. Release pipeline will re-run tests and archive/sign before upload. No physical performance claim.

Final pre-distribution check corrected ordering within the fixed 30-item membership and random order within Later. Preview presentation uses a dark scheme so video error labels remain legible over its black canvas. The unneeded early simulator-boot optimization was removed, retaining the test command used for the successful 44-test run. The first release run was cancelled before signing/upload; replaced by a new release run with the corrected tree.

Release run https://github.com/kwinstudio/boekuna/actions/runs/40732771917 passed all 45 simulator tests, then the extra smoke script failed because XCTest had shut down its simulator and no booted iPhone was listed. Corrected the smoke script to select an available iPhone and explicitly boot/wait before installation/capture. App product source unchanged in this verification repair; signing/upload had not started.
