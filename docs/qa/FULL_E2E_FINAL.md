# BOEKUNA Full Functional E2E QA — Final Report

Run ID: QA-E2E-20261001  
Mode: BASELINE_MAIN  
SOURCE SHA: `7132029b792c8942f18317637ff352461dfe08d5`

## Deployment lock

Formal app deployment:
`https://boekuna-split-app-preview.onrender.com`

Render deploy:
`dep-dav7krvlk1mc73f8cg90`

Deployment SHA:
`7132029b792c8942f18317637ff352461dfe08d5`

The older public Render app at `https://boekuna-boekhouding.onrender.com` was on `ba0fd360dd200841714330d42421f6577beea88c` during source lock and was not used as formal evidence for this run.

Production Supabase:
`vuwfyhtejsxhdfyvkkeq` — ACTIVE_HEALTHY

Document processor:
`https://kwinest-docprocessor.onrender.com` — live processor SHA `aa7ae7819f893ecad429bd51a8ba5e00b7a4cedb`; no processor/docprocessor source files changed between that deployed SHA and the frozen app baseline.

## Totals

TOTAL FUNCTIONS / FUNCTIONAL TEST CONTRACTS: 421  
TOTAL SCENARIOS: 421

PASS: 10  
FAIL: 2  
BLOCKED: 404  
NOT_TESTED: 0  
NOT_APPLICABLE: 5

Matrix classification coverage: 100%  
Executed functional evidence coverage: **2.88%** = (PASS + FAIL) / (TOTAL - NOT_APPLICABLE) = 12 / 416.

BLOCKED is never counted as PASS or as executed evidence.

## Severity

P0 — CRITICAL: 0  
P1 — HIGH: 0  
P2 — MEDIUM: 2  
P3 — LOW: 1

## Confirmed findings

### FUNC-CI-001 — P2 — current integrity gate fails on stale contact placeholder contract

Exact-current GitHub Actions run `36883528292` failed Production source safety because `tests/source-safety.test.mjs` requires `Zoek op naam, e-mail of plaats`, while the product now renders `Zoek op bedrijfsnaam of contactpersoon`.

The underlying relation-search haystack still includes name, contact person, e-mail, city and VAT ID; no functional loss of e-mail/city search was demonstrated. The defect is the stale QA contract / fail-fast gate. It prevents later tenant, browser, document and billing suites in the integrity workflow from executing.

Confirmatory retry: **CONFIRMED**. Attempt 2 / job `110480215484` failed again at the identical assertion. No further retry was performed.

Owner: 03 — QA/security.

### FUNC-SEC-001 — P2 — Supabase leaked-password protection disabled

Current production Supabase security advisors report leaked-password protection disabled. This increases compromised-password reuse/account-takeover exposure. No tenant leak or accounting corruption was demonstrated.

Owner: 04 — DevOps/release.

### FUNC-SEC-002 — P3 — pg_net extension in public schema

Current Supabase security advisors report `pg_net` installed in `public`. This is a hardening concern; no exploit path or tenant leak was demonstrated.

Owner: 04 — DevOps/release.

## Security review notes

Core production tables inspected for profiles, ledger state/revisions, documents, bank imports/transactions, transaction matches and document jobs have RLS enabled with own-user `auth.uid()` policies where client access is intended.

Supabase also reports several RLS-enabled server-managed tables with no policies. In the inspected design this is fail-closed for anon/authenticated users and service-role managed, not evidence of exposure.

Four authenticated SECURITY DEFINER functions are linted by Supabase. Frozen migration source shows they derive the acting identity from `auth.uid()` and use scoped helpers. No cross-tenant bypass was demonstrated. Two-account tenant isolation still requires actual runtime testing and remains BLOCKED.

Developer Mode production fail-closed: PASS at the frozen build contract.

## Exact-current automated evidence

PASS before the current failure:
- split architecture characterization;
- split build boundaries;
- split origin boundaries;
- split CI scopes;
- provider-agnostic entitlement boundary;
- accounting integrity / financial automation.

FAIL:
- Production source safety — FUNC-CI-001.

SKIPPED/BLOCKED after the failure:
- tenant isolation regression;
- smart financial correction;
- invoice/browser dependencies;
- Chromium/WebKit browser tests;
- document upload/background processing;
- progressive onboarding;
- list controls;
- invoice status edit;
- document verification;
- cloud sync;
- invoice delivery;
- OCR/PDF/document processor regressions;
- billing source lifecycle checks;
- later Python safety steps.

Historical green runs were not counted as current PASS evidence.

## Domain verdicts

| Domain | Status | Basis |
|---|---|---|
| AUTH | BLOCKED | No authenticated browser execution; exact-current auth step skipped. |
| DASHBOARD | BLOCKED | Requires live persisted QA data. |
| RELATIES | BLOCKED | CRUD/search UI interaction unavailable; source search semantics inspected only. |
| KVK | PARTIAL | Deployed JWT/MFA/origin/budget server contract PASS; authenticated search/profile UI blocked. |
| DIENSTEN | BLOCKED | CRUD + invoice use require live interaction. |
| FACTUREN | BLOCKED | Full lifecycle and calculations not run end-to-end. |
| PDF | BLOCKED | Generated/downloaded PDF not functionally inspected. |
| VERZENDEN | BLOCKED | Native share/mail handoff requires browser/device interaction. |
| BETALINGEN | BLOCKED | Payment state/downstream effects not run. |
| KOSTEN | BLOCKED | Deterministic cost records not instantiated in app. |
| DOCUMENTEN | BLOCKED | Real upload/retry/background flow unavailable. |
| OCR | BLOCKED | Live processor interaction not executed on frozen run. |
| MIXED VAT | BLOCKED | Truth set defined, but in-app OCR/accounting chain not executed. |
| BANK | BLOCKED | CSV/manual transactions/matching require live data flow. |
| IMPORT | BLOCKED | CSV import present; CAMT.053/MT940 are NOT_APPLICABLE on this SHA. |
| MATCHING | BLOCKED | Match/unmatch/rematch chain not executed. |
| BTW | BLOCKED | Deterministic VAT truth set not instantiated. |
| RAPPORTAGES | BLOCKED | Period/KPI/export values not rendered from QA dataset. |
| GROOTBOEK | PARTIAL | Exact-current accounting-integrity automation PASS; persisted cross-feature ledger chain blocked. |
| CASHFLOW | BLOCKED | Current create/delete/prediction flow not exercised; recurring/edit planned cash absent. |
| CONTROLESCHERM | BLOCKED | Attention conditions/resolution counts require live state. |
| BOEKINGEN | BLOCKED | CRUD/status/factuur integration not executed. |
| UREN | BLOCKED | CRUD/totals not executed. |
| RITTEN | BLOCKED | CRUD/totals not executed. |
| INSTELLINGEN | BLOCKED | Save-refresh-reopen/downstream effects not executed. |
| EXPORT | BLOCKED | Downloaded file bytes/content not inspected. |
| BACKUP | BLOCKED | Isolated export/restore round-trip not executed. |
| BILLING | PARTIAL | Provider-agnostic entitlement contract PASS; checkout/portal/test-mode lifecycle blocked. |
| TENANT ISOLATION | PARTIAL | Current RLS own-row policies inspected; required two-account runtime test blocked. |
| MOBILE | BLOCKED | 320/360/375/390/393/430 browser flows not run on frozen SHA. |
| DESKTOP | BLOCKED | 768/1024/1280/1440 live flows not run. |
| CHROMIUM | BLOCKED | Exact-current browser step skipped; no live runner available. |
| WEBKIT | BLOCKED | Exact-current browser step skipped; no live runner available. |
| ACCESSIBILITY | BLOCKED | Keyboard/focus/axe/table/chart interaction not executed. |
| CI | FAIL | FUNC-CI-001 reproduced twice on exact frozen SHA. |

## Automation gap audit

See `docs/qa/FULL_E2E_AUTOMATION_GAPS.md`.

Highest priority permanent gaps:
- authenticated sales-chain E2E;
- authenticated purchase/OCR chain E2E;
- Stripe test-mode checkout/portal lifecycle;
- backup round-trip;
- multi-period accounting truth;
- auth/session security chain;
- recovery/idempotence chain;
- CI job isolation so one copy assertion cannot suppress unrelated critical evidence.

## Important blockers

1. The current assistant execution environment exposes no interactive authenticated browser/computer runner and its container cannot resolve the Render app host. Therefore browser/device/data-mutation scenarios cannot be honestly passed.
2. Exact-current integrity CI fails at source-safety before many critical suites run; the single confirmatory retry reproduces the same failure.
3. Tenant isolation, financial cross-feature truth, billing lifecycle and Chromium/WebKit/accessibility therefore lack the execution evidence required by the PASS definition.

## Final verdict

# FULL FUNCTIONAL QA — FAIL

This is a QA/release-confidence FAIL, not evidence that 404 product functions are broken. Those scenarios are BLOCKED, not failed.

PASS is prohibited by the run contract because:
- the exact-current automated suite is not green;
- critical end-to-end workflows were not executed;
- tenant-isolation runtime proof is incomplete;
- relevant browser flows are incomplete.

No P0 or P1 product defect was demonstrated in the evidence that could be independently verified.

## Durable artifacts

- `docs/qa/FULL_E2E_STATE.md`
- `docs/qa/FULL_E2E_MATRIX.md`
- `docs/qa/FULL_E2E_FINDINGS.md`
- `docs/qa/FULL_E2E_AUTOMATION_GAPS.md`
- `docs/qa/FULL_E2E_CONSISTENCY.md`
- `docs/qa/FULL_E2E_FINAL.md`
- `tests/artifacts/full-e2e/TEST_DATA.md`

QA branch:
`qa/full-functional-e2e-20261001`
