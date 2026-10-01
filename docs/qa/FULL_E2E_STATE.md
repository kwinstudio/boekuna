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
Render service: boekuna-split-app-preview
Render deploy: dep-dav7krvlk1mc73f8cg90
Status: live
Build: node scripts/build-app.mjs

PUBLIC_PRODUCTION_NOTE:
https://boekuna-boekhouding.onrender.com remains on ba0fd360dd200841714330d42421f6577beea88c and is not formal evidence for this run.

SUPABASE:
Production project vuwfyhtejsxhdfyvkkeq (kwinest), ACTIVE_HEALTHY, eu-central-1.
Latest repository migration 20261001112135_kvk_company_lookup_budget is present in production.

DOCUMENT_PROCESSOR:
https://kwinest-docprocessor.onrender.com
Live deploy SHA aa7ae7819f893ecad429bd51a8ba5e00b7a4cedb.
No processor/docprocessor source files changed between that SHA and SOURCE_SHA.

STARTED_AT:
2026-10-01T18:22:00+02:00

LAST_UPDATED:
2026-10-01T18:22:00+02:00

TOTAL_CHECKPOINTS:
34

CURRENT_CHECKPOINT:
2

LAST_COMPLETED_CHECKPOINT:
1

CURRENT_TEST_ID:
DATA-001

LAST_COMPLETED_TEST_ID:
INVENTORY-421

NEXT_TEST_ID:
DATA-001

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

Checkpoint 0 — source + environment lock: COMPLETE.
Checkpoint 1 — complete function inventory: COMPLETE.

## Exact-current CI observation

GitHub Actions run 36883528292 on SOURCE_SHA fails at Production source safety before most downstream suites execute. The failing assertion requires the retired contact placeholder "Zoek op naam, e-mail of plaats". Current source uses "Zoek op bedrijfsnaam of contactpersoon", while the actual search haystack still includes name, contact person, e-mail, city and VAT ID. This is currently classified as QA/CI regression, not a proven product search failure.
