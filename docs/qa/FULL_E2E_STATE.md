# BOEKUNA Full Functional E2E QA State

QA_MODE:
BASELINE_MAIN

RUN_ID:
QA-E2E-20261001

SOURCE_SHA:
7132029b792c8942f18317637ff352461dfe08d5

DEPLOY_SHA:
7132029b792c8942f18317637ff352461dfe08d5

APP_DEPLOYMENT:
https://boekuna-split-app-preview.onrender.com
Render deploy: dep-dav7krvlk1mc73f8cg90 (live, exact source SHA)

SUPABASE:
vuwfyhtejsxhdfyvkkeq (kwinest), ACTIVE_HEALTHY

DOCUMENT_PROCESSOR:
https://kwinest-docprocessor.onrender.com
Live processor code is source-compatible with frozen baseline.

STARTED_AT:
2026-10-01T18:22:00+02:00

LAST_UPDATED:
2026-10-01T18:22:00+02:00

TOTAL_CHECKPOINTS:
34

CURRENT_CHECKPOINT:
3

LAST_COMPLETED_CHECKPOINT:
2

CURRENT_TEST_ID:
AUTH-001

LAST_COMPLETED_TEST_ID:
DATA-012

NEXT_TEST_ID:
AUTH-001

TOTAL_SCENARIOS:
421

PASS:
6

FAIL:
1

BLOCKED:
0

NOT_TESTED:
414

OPEN_P0:
0

OPEN_P1:
0

STATUS:
RUNNING

## Completed checkpoints

- 0 source + environment lock: COMPLETE
- 1 complete function inventory: COMPLETE
- 2 safe synthetic test data + expected financial truth: COMPLETE

Synthetic fixture specification:
tests/artifacts/full-e2e/TEST_DATA.md

Exact-current CI remains red at FUNC-CI-001; this does not stop safe independent testing of other domains.
