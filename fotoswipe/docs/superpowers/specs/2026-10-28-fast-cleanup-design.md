# Fast cleanup and complete review tools

The user approved applying all six previously presented features and fixing the repeated loading. Keep the app native SwiftUI + PhotoKit, iOS 17+, without login, backend, photo uploads, analytics or paid dependencies. Work only under fotoswipe and its dedicated workflows/branches in kwinstudio/boekuna. Existing decisions remain readable.

Use a bounded, retained preview pipeline with actual ready images, staged light/sharp delivery, current-card priority, and request cancellation on scope changes. Do not accept destructive decisions on invisible previews. Keep the rolling deck and gesture-local state; never run duplicate scans or full-library downloads as a prerequisite for swiping. Expose photo/video playback on demand rather than autoplaying every video. No guarantee of zero network wait for cloud-only assets.

Add persistent Later decisions and a Later category with undo and review/reset semantics; random ordering and a fixed random 30-item session; actual reversible Photos favorite toggling; adding the current asset to an existing editable album or a newly created album; video categories/posters with explicit playback; and a separate on-device similar-photo scan/review. Comparison must retain one image, avoid auto-deletion, show cancellation/progress and preserve global confirmation flow.

Secondary actions live under a More menu; keep left/right and the existing three main buttons. Date/category filters and global review remain. Album/favorite changes cannot trigger repeated full-deck reloads during active swiping; apply external refresh once safe. Store identifiers/choices only. New media text must say items rather than only photos where video deletion is possible.

Approaches: merely increasing PhotoKit preheating is insufficient because completion is not guaranteed; replacing the whole app with a third-party cleaner risks existing data and integration. Selected approach is an explicit bounded image-ready cache and independent standard PhotoKit mutation/scanning services. Public repositories and Apple docs are references, not evidence of measured competitor performance; inspect license before copying substantial code and avoid private KVC file-size APIs.

Physical-device performance must be measured by the tester; cloud Mac simulator tests can verify pipeline lifetime/memory scheduling, decisions, grouping, and successful native builds. Publish to existing internal Kwin test group after tests, archive, signing and upload succeed.
