# BOEKUNA Full Functional E2E QA State
QA_MODE: BASELINE_MAIN
RUN_ID: QA-E2E-20261001
SOURCE_SHA: 7132029b792c8942f18317637ff352461dfe08d5
DEPLOY_SHA: 7132029b792c8942f18317637ff352461dfe08d5
TOTAL_CHECKPOINTS: 34
CURRENT_CHECKPOINT: 17
LAST_COMPLETED_CHECKPOINT: 16
CURRENT_TEST_ID: BILL-001
LAST_COMPLETED_TEST_ID: EXPORT-010
NEXT_TEST_ID: BILL-001
TOTAL_SCENARIOS: 421
PASS: 8
FAIL: 1
BLOCKED: 281
NOT_TESTED: 126
NOT_APPLICABLE: 5
OPEN_P0: 0
OPEN_P1: 0
STATUS: RUNNING

## Checkpoint 16 — import / export / backup
All 10 export/backup scenarios were processed. The current source exposes invoice/expense/journal/audit CSV and JSON backup/restore. Exact downloaded bytes, invalid-file UI handling, dedupe and restore persistence require browser file interaction and therefore remain BLOCKED.
