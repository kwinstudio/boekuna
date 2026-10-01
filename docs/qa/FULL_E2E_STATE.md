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
Developer Mode: disabled by production-default build

PUBLIC_PRODUCTION_NOTE:
https://boekuna-boekhouding.onrender.com is currently on ba0fd360dd200841714330d42421f6577beea88c and is NOT used as formal evidence for this frozen SHA.

SUPABASE:
Production project vuwfyhtejsxhdfyvkkeq (kwinest), ACTIVE_HEALTHY, eu-central-1.
Latest repository migration 20261001112135_kvk_company_lookup_budget is present in production.
Relevant active edge functions include auth/account deletion, billing, financial automation, document processing and KVK lookup.

DOCUMENT_PROCESSOR:
https://kwinest-docprocessor.onrender.com
Render service: kwinest-docprocessor
Live deploy SHA: aa7ae7819f893ecad429bd51a8ba5e00b7a4cedb
Comparison aa7ae781.. -> SOURCE_SHA contains no processor/docprocessor file changes, so the deployed processor code is source-compatible with the frozen baseline.

BROWSER_SUPPORT:
Chromium + WebKit browser suites are defined in the current app/integrity workflows.

STARTED_AT:
2026-10-01T18:22:00+02:00

LAST_UPDATED:
2026-10-01T18:22:00+02:00

TOTAL_CHECKPOINTS:
34

CURRENT_CHECKPOINT:
1

LAST_COMPLETED_CHECKPOINT:
0

CURRENT_TEST_ID:
INVENTORY-001

LAST_COMPLETED_TEST_ID:
ENV-LOCK-001

NEXT_TEST_ID:
INVENTORY-001

TOTAL_SCENARIOS:
0

PASS:
0

FAIL:
0

BLOCKED:
0

NOT_TESTED:
0

OPEN_P0:
0

OPEN_P1:
0

STATUS:
RUNNING

## Checkpoint 0 evidence

- Repository: kwinstudio/boekuna
- Default branch: main
- main HEAD independently verified through GitHub branch API.
- Frozen baseline: 7132029b792c8942f18317637ff352461dfe08d5.
- Matching Render app-only deployment verified live by Render deployment metadata.
- Production Supabase project discovered and migration state checked.
- Production document processor discovered; no processor source drift exists between its live deploy SHA and frozen app baseline.
- Current app and integrity workflows explicitly install/test Chromium and WebKit.
- Open legacy/draft PRs were inventoried but are outside this BASELINE_MAIN source lock.
