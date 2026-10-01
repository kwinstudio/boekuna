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

STARTED_AT:
2026-10-01T18:22:00+02:00

LAST_UPDATED:
2026-10-01T18:22:00+02:00

TOTAL_CHECKPOINTS:
34

CURRENT_CHECKPOINT:
5

LAST_COMPLETED_CHECKPOINT:
4

CURRENT_TEST_ID:
INV-001

LAST_COMPLETED_TEST_ID:
SRV-009

NEXT_TEST_ID:
INV-001

TOTAL_SCENARIOS:
421

PASS:
8

FAIL:
1

BLOCKED:
44

NOT_TESTED:
367

NOT_APPLICABLE:
1

OPEN_P0:
0

OPEN_P1:
0

STATUS:
RUNNING

## Checkpoint 4 — relations + KVK + services

Processed without product changes.

- Relation and service CRUD/user-flow scenarios are blocked by absence of an interactive authenticated browser runner.
- REL-005 is NOT_APPLICABLE because current frozen source has no relation delete/archive/remove action.
- KVK-009 PASS: deployed Edge Function consumes an atomic service-role-only budget with per-user/global windows.
- KVK-010 PASS: deployed Edge Function is JWT protected, authenticates a non-anonymous user, enforces MFA assurance when required, restricts origins and keeps KVK credentials/raw upstream responses server-side.
- KVK search/result/profile UI flow remains BLOCKED until actual authenticated browser execution is available.
