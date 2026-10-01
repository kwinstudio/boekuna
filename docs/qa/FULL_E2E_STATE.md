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
https://boekuna-split-app-preview.onrender.com — exact SHA live.

SUPABASE:
vuwfyhtejsxhdfyvkkeq — ACTIVE_HEALTHY.

DOCUMENT_PROCESSOR:
https://kwinest-docprocessor.onrender.com — source-compatible processor.

STARTED_AT:
2026-10-01T18:22:00+02:00

LAST_UPDATED:
2026-10-01T18:22:00+02:00

TOTAL_CHECKPOINTS:
34

CURRENT_CHECKPOINT:
4

LAST_COMPLETED_CHECKPOINT:
3

CURRENT_TEST_ID:
REL-001

LAST_COMPLETED_TEST_ID:
AUTH-018

NEXT_TEST_ID:
REL-001

TOTAL_SCENARIOS:
421

PASS:
6

FAIL:
1

BLOCKED:
18

NOT_TESTED:
396

OPEN_P0:
0

OPEN_P1:
0

STATUS:
RUNNING

## Checkpoint 3 — authentication + account

Processed. All 18 real-interaction authentication scenarios are BLOCKED in this execution environment because no authenticated browser/computer runner is exposed and the container cannot resolve the deployed host. Static source confirms the flows exist, and Supabase is healthy, but the QA contract explicitly requires actual interaction rather than source inspection, so no browser-dependent item is upgraded to PASS.

This is a test-environment limitation, not a demonstrated product defect. The audit continues into independently testable domains.
