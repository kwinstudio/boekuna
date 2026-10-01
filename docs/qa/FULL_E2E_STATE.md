# BOEKUNA Full Functional E2E QA State
QA_MODE: BASELINE_MAIN
RUN_ID: QA-E2E-20261001
SOURCE_SHA: 7132029b792c8942f18317637ff352461dfe08d5
DEPLOY_SHA: 7132029b792c8942f18317637ff352461dfe08d5
TOTAL_CHECKPOINTS: 34
CURRENT_CHECKPOINT: 18
LAST_COMPLETED_CHECKPOINT: 17
CURRENT_TEST_ID: FLOW-001
LAST_COMPLETED_TEST_ID: BILL-011
NEXT_TEST_ID: FLOW-001
TOTAL_SCENARIOS: 421
PASS: 9
FAIL: 1
BLOCKED: 291
NOT_TESTED: 115
NOT_APPLICABLE: 5
OPEN_P0: 0
OPEN_P1: 0
STATUS: RUNNING

## Checkpoint 17 — billing
Provider-agnostic entitlement schema/writer contract is PASS on the exact current SHA via GitHub Actions step 9. Checkout, success/cancel returns, portal and live/test entitlement transitions still require safe provider/browser execution and are BLOCKED. No real charge was attempted.
