# BOEKUNA Full Functional E2E QA State

QA_MODE: BASELINE_MAIN
RUN_ID: QA-E2E-20261001
SOURCE_SHA: 7132029b792c8942f18317637ff352461dfe08d5
DEPLOY_SHA: 7132029b792c8942f18317637ff352461dfe08d5
TOTAL_CHECKPOINTS: 34
CURRENT_CHECKPOINT: 9
LAST_COMPLETED_CHECKPOINT: 8
CURRENT_TEST_ID: REP-001
LAST_COMPLETED_TEST_ID: VAT-012
NEXT_TEST_ID: REP-001
TOTAL_SCENARIOS: 421
PASS: 8
FAIL: 1
BLOCKED: 185
NOT_TESTED: 224
NOT_APPLICABLE: 3
OPEN_P0: 0
OPEN_P1: 0
STATUS: RUNNING

## Checkpoint 8 — VAT

All 12 VAT scenarios were processed. Quarter/year, output/input VAT, multiple rates, mixed VAT, KOR/zero-output, rounding and source-document cross-checks remain BLOCKED because the synthetic truth dataset cannot be instantiated in the app in this runtime. The expected truth remains stored in tests/artifacts/full-e2e/TEST_DATA.md.
