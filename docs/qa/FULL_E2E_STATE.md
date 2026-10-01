# BOEKUNA Full Functional E2E QA State
QA_MODE: BASELINE_MAIN
RUN_ID: QA-E2E-20261001
SOURCE_SHA: 7132029b792c8942f18317637ff352461dfe08d5
DEPLOY_SHA: 7132029b792c8942f18317637ff352461dfe08d5
TOTAL_CHECKPOINTS: 34
CURRENT_CHECKPOINT: 31
LAST_COMPLETED_CHECKPOINT: 30
CURRENT_TEST_ID: RETEST-FUNC-CI-001
LAST_COMPLETED_TEST_ID: GAP-AUDIT
NEXT_TEST_ID: RETEST-FUNC-CI-001
TOTAL_SCENARIOS: 421
PASS: 10
FAIL: 2
BLOCKED: 404
NOT_TESTED: 0
NOT_APPLICABLE: 5
OPEN_P0: 0
OPEN_P1: 0
OPEN_P2: 2
OPEN_P3: 1
STATUS: RUNNING

## Checkpoint 30 — coverage gap audit
Complete. See docs/qa/FULL_E2E_AUTOMATION_GAPS.md. Existing automation is broad, but current fail-fast ordering prevents much of it from producing exact-SHA evidence. Cross-feature sales/purchase chains, billing lifecycle, backup round-trip, multi-period truth, auth/session security and recovery/idempotence are priority automation gaps.
