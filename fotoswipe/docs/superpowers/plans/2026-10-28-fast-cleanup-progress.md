# Progress — 2026-10-28-fast-cleanup

User approved all options and fixes. Initial test-first Later API run failed because PhotoDecision.later was missing. Added compatible enum case without changing persisted fields.

Independent image-pipeline and similarity tasks were delegated under dispatching-parallel-agents; fresh integrated review was performed under executing-plans. Structural project validation passes. Initial Mac compilation succeeded; XCTest exposed an invalid lazy Collection filter with a stateful uniqueness predicate, causing missing scheduled requests and a Range trap. Replaced it with an eager bounded loop and retained those scheduling tests.

All five material review findings addressed: preview-ready comparison decisions; stable random-session membership; allowing a previously issued visible swipe to finish during metadata-only mutation; cancelling/rechecking observer tasks and rejecting older fetches; independently refreshing album catalogue after creation. Regression cases added for readiness, random membership, mutation gates and swipe policy.

Additional user-authorized fixes: five recent light previews retained for undo; evicted preview retries on promotion; Later replay returns kept session items to the Later stack; media copy updated for video items. Budget/cancellation tests cover buffer behavior. No new permission scope, backend, dependency or upload of photo content introduced.

Verification pending: updated native suite, archive, final signing/upload, Apple processing and internal-group distribution. No physical-device timing claim.
