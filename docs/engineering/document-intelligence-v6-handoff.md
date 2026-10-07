# BOEKUNA document intelligence V6: implementation and release handoff

Status: draft. Production remains on the existing legacy adapter. **NOT MERGE READY**: the Render Workflow service (real OCR compute, recovery schedule, Edge dispatch) and physical-device gates are open. The database layer passed on hosted Supabase staging. See "Round 3" at the end for the current state.

## Source of truth and discovery

- Starting main: `5201ee9fe1e62adba4495302e89363519ec4d185`.
- Rebased publication parent: `50fa6ae456f96d0e4f8145c32ce8d6641d28444a`, incorporating merged settings and subsequent invoice/cost changes. Those changes are preserved; only the necessary upload receipt functions change.
- Branch for publication: `fix/document-intelligence-v6-durable-processing`.
- Final commit and PR are recorded in the PR description; source hashes below identify the independently reviewed code.
- Open PRs at final discovery: #227, local Qwen benchmark only; #223, iOS packaging. No competing open production OCR implementation. Neither is included here.
- Live Render processor discovery: `srv-dartf4m0tbcc73d00krg`, free Frankfurt, one instance, automatic deployment off, branch `kwinest-hosting`, deployed revision `d7e1b63bb03431f339fc2dc1b5c110abd96976e2`. Its app.py blob matches starting main's V5 processor. Existing public version remains `4.3.0`; deployment revision distinguishes code.
- Existing stack: native PDF extraction, RapidOCR 3.9.2 / PP-OCRv6 / ONNX Runtime 1.30.0, deterministic parser, document_intelligence, financial_blocks, image_quality. External AI is off. No OCR model or financial validator is replaced.
- Supabase production `vuwfyhtejsxhdfyvkkeq`: initial job counts ready 28, review_required 9, failed 14, no active jobs. Existing queue, private document Storage, tenant RLS, entitlement and quota functions were inspected read-only. No migration was applied or production service changed.

## Existing behavior reused

The existing parser already supplies number/date candidates, supplier/customer extraction, VAT and mixed VAT, two-of-three reconciliation, factoring, line items, credit handling, confidence and human review. Existing browser upload already writes Storage and documents separately from background jobs. Existing Edge dispatch uses a serial HTTP processor queue and stale recovery on resume.

The proven OCR acquisition, financial extraction, reconciliation, confidence, duplicate handling and review are kept. There is one document engine. `analyze_document` is the extracted body of the existing `/analyze`; the public route retains origin, authentication, rate, entitlement and quota boundaries. Workflow execution invokes this same function. HTTP/direct response parity is tested. User tokens and document bytes are never sent as Render task arguments.

## Changed files

| Area | Files and purpose |
| --- | --- |
| Existing engine | `kwinest/docprocessor/app.py`: shared callable plus local metadata/party improvements; `document_intelligence.py`: retain metadata anomalies in existing routing |
| Execution adapter | `workflow_tasks.py`, `workflow_recovery.py`, `requirements-workflow.txt`: pinned Render SDK, document/batch/recovery tasks, private Storage retrieval |
| Existing queue | `supabase/functions/document-processing/index.ts`: optional dispatch, same durable jobs, correct non-bookable review, enqueue race recovery, execution-mode fencing |
| Database | `20261007150000_document_workflow_leases.sql`: extend existing job table; atomic claims, leases, owner caps, result/usage completion, retry and stale recovery |
| Upload | `kwinest/index.html`: receipt only after Storage + document row + job; mixed batch visibility and recovered acceptance |
| Verification | Metadata/worker/SQL/receipt tests; adapt existing background receipt assertion; existing V5 benchmark gains a processor-directory override; dedicated CI workflow |
| Evidence | This handoff and synthetic before/after JSON under `document-v6-evidence/` |

## Queue and task behavior

`Storage -> documents -> document_processing_jobs -> process_batch(batch_id) -> process_document(job_id) -> existing analyze_document -> same financial validation/confidence/review -> existing job result`.

- `DOCUMENT_EXECUTION_MODE` defaults to `legacy`. Existing HTTP `/analyze` and serial concurrency 1 remain valid on the current small processor.
- Workflow mode fails closed unless the workflow slug, server-side Render API key and recovery-enabled flag exist. The flag is an operator assertion, not proof that a schedule is alive; the release gate must verify that schedule.
- Workflow batches fan out with `ctx.run` and a semaphore. Each document runs on task compute, rather than increasing concurrency on the small HTTP service.
- Default user and global active-job caps are both 4, configurable through worker environment variables, clamped to 1–16. The database serializes count-and-claim across workers/users/batches. Existing active legacy jobs also count toward caps.
- Atomic queued-to-processing claim increments the attempt, issues a UUID lease, and expires after 10 minutes. Task timeout is 300 seconds. Old or incorrect leases cannot save/fail a newer attempt. Already terminal jobs cannot be claimed.
- Database owns retries; Render automatic retries are explicitly zero. Known network/timeout/unavailable/5xx conditions requeue with 15, 30, ... seconds backoff, capped at 300 seconds and the existing max_attempts. Corrupt/unsupported/permanent failures terminate.
- `recover_pending` recovers expired leases and dispatches due queued workflow jobs, independently of browser sessions. Duplicate task starts are harmless to claim/result/usage. Due-page limits are 100 for recovery and 50 for batch dispatch; subsequent scheduled recovery handles queued spillover.
- The service-role-only database wrappers bind access/quota checks to the claimed job's owner and reuse `can_operate_bookkeeping`, `check_document_quota` and `record_document_usage`. Completion and usage are one transaction, recorded once per job. Entitlement/quota are rechecked before completion. No new billing engine exists.
- Worker downloads only a document row matched by document ID AND user ID, validates the exact owner prefix and rejects empty/dot/traversal path segments. Download bytes are bounded. Results and content stay in Supabase; Render task outputs are safe identifiers and counts.
- Job rows retain timestamps/error code/attempt; execution mode, lease timestamps, batch workflow run ID and usage marker are added. Existing processing metadata retains OCR stack, duration and revision. No customer content is added to routine logs. A production metrics dashboard and per-document provider task-run ID are not implemented in this draft.

## Parser changes

- Extend existing invoice-number candidate collection for multilingual abbreviations, prefixed labels, inline multiple labels, leading zeros, numeric/year/alphanumeric/hash shapes and space-separated year sequences. Strong unusual identifiers remain eligible, including eight digits that happen to resemble a date.
- Preserve existing joined-column PDF labels such as `AmsterdamFactuurnummer`. A credit note's own explicit number/date takes precedence over the original invoice reference. Competing own credit numbers/dates still clear the field and route to review. Title fallback cannot replace explicit identifier candidates. The existing CHECK/Adidas fixture suite is included in V6 CI.
- Following-line extraction excludes order/customer/payment/factoring/legal identifiers and separated date values. Conflicting strong invoice labels retain evidence and clear invoiceNumber for review. Repeated identical labels do not create a conflict.
- Extend existing date normalization for dotted month abbreviations and compact full date values. Short years require a single consistent year from explicit full-date-role evidence; invoice/order identifiers and prose cannot supply century evidence. Optional invoice metadata now separates order/service/delivery/payment/posting/creation/statement dates and full-numeric service-period endpoints. Conflicting secondary roles or reversed periods remain null and route to review. The same recognized identifier labels fence both date candidates and year context, including inline, next-line, no-colon and hash variants. Generic issued prose is excluded from date evidence. Explicit invoice/due candidates retain sourceText. Multiple strong explicit dates clear the relevant field for review. Recognized US/Canada/Australia context with unresolved ambiguous slash dates routes to review.
- Bound party blocks at the next explicit party label. Normalize labeled eight-digit KvK with spaces/dots, without prefix assumptions or truncating 9/12-digit values. Normalize NL VAT ID separators, including a shared legal KvK/VAT row. Direct-debit/payer IBAN is not assigned to supplier.
- Unpaid/partial-paid negative text does not automatically imply fully paid. Existing financial semantics and validators remain the source of truth.
- Metadata anomalies survive the existing understanding annotation and routing. Non-bookable documents, engine review fields/anomalies and unresolved VAT treatment remain review_required in both adapters.

This draft does **not** prove every scenario in the V6 work order. In particular, all unlabelled table/above-label variants and service-period formats beyond the tested full numeric range notation, every country/locale ambiguity, and all footer-only/multiple-bank-role layouts require further fixtures and review. Existing behavior in those families is not replaced or silently certified.

## Validation and before/after

Only generated/synthetic fixtures and existing privacy-safe regression fixtures were used. No real customer invoices were committed or sent to an external AI provider.

| Test | Before | Candidate |
| --- | --- | --- |
| New metadata scenario families, 107 parameter instances | 40 pass | 107 pass |
| Metadata parser timing P50 / P95 | 0.651 / 0.960 ms | 1.113 / 3.465 ms |
| Existing frozen V5 actual OCR documents | 28/28 fully correct | 28/28 fully correct |
| OCR P50 / P95 | 2034.79 / 4446.34 ms | 1999.45 / 4454.16 ms |
| OCR/parser failures | 0 / 0 | 0 / 0 |
| OCR passes per document | 2.0 | 2.0 |
| Applicable invoiceNumber/date/supplier/financial/mixed VAT field accuracy | 100% | 100% |
| Existing OCR benchmark review rate | 100% | 100% |

The JSON contains the existing EXACT/NORMALIZED/MISSING/WRONG field grading and document records. The metadata count grades whole assertions, not a population accuracy estimate. Single-machine timing is descriptive, not a statistically established speedup or hosted SLA. The 100% review rate is the benchmark's existing conservative parser/confidence behavior; no review-rate improvement is claimed.

Final source regression selection: **210 passed + 10 subtests**, 12 existing dependency/deprecation warnings, 52.86 seconds. Independent TR3 repeated 107 metadata + 10 worker + 11 existing fixture tests: **128 passed + 10 subtests**. The source hashes are app.py `49a6a6477d762ce819703bb13c178c563b522ad2634135a3dc7dda6d10726468`, Edge index.ts `b7939b4eb7e7fb78700a792c9f2d7e1926d54fad0b590d057dd02f77e0c4eeab`, TR2-reviewed index.html `726b537083702edc6bab4863b0d732592cdf0c1e4238f4c34af1752c0660bd37`.

Actual migration SQL executed in PGlite: 1, 10 and 50 jobs all reached terminal ready; peak active 1, 4 and 4. Tests cover multi-user/global caps, duplicate claims, wrong/stale leases, exponential backoff, exhausted/permanent failures, crash recovery, revoked access/quota rollback, atomic exactly-once usage and denied anon/authenticated RPC execution. This is a database simulation with stubs for existing auth/quota functions, not a Render load test or hosted Supabase integration.

Production-function VM upload tests pass for receipt gating, delayed/missing job, network error, mixed batch visibility and recovered receipt. Browser launch is blocked by a missing Chromium binary; no Chromium/WebKit/mobile/PWA/device PASS is claimed.

## Independent review and merge gates

TR3 independent review passed the locally automated financial/backend/security/document integrity scope after its parser findings were fixed. The final metadata/credit delta independently passed 128 tests plus 10 subtests (107 metadata + 10 worker + 11 existing fixture tests), with app.py hash `49a6a6477d762ce819703bb13c178c563b522ad2634135a3dc7dda6d10726468`. All reported inline/fallback identifier, short-year, foreign-date and issued-prose blockers were rechecked. It is not a hosted production PASS. Local tests use a Render SDK substitute when the SDK is unavailable; CI installs the real pinned `render==1.0.1`. TR2 independent source/VM review passed receipt changes after mixed-batch/recovery findings were fixed, and repeated its closure after rebase onto current main (index.html hash `726b537083702edc6bab4863b0d732592cdf0c1e4238f4c34af1752c0660bd37`). Its browser and physical-device scope remains open.

Before ready-for-review / merge:

1. Exact commit CI must pass, including real SDK import/registration compatibility, frozen OCR benchmark and all existing required backend/integrity checks.
2. Validate/apply the migration in staging against real existing quota/access definitions and PostgREST relationships. Test Edge dispatch with tenant/MFA/quota/retry contracts.
3. Register a separate Render workflow service from this branch, root `kwinest/docprocessor`, install `requirements-workflow.txt`, start `python workflow_tasks.py`. Verify its resources/OCR cold start and server-only credentials.
4. Configure a recovery cron with the same root/dependencies, command `python workflow_recovery.py`, `RENDER_API_KEY`, `DOCUMENT_WORKFLOW_SLUG`, and an independently verified one-minute schedule. Worker needs `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`; keep external AI off.
5. Prove immediate upload acceptance and eventual 1/10/50 completion on staging with actual task compute and multiple owners; kill a worker; simulate dispatch 5xx/network loss; close/reopen browser; verify no lost/stuck/duplicated jobs and quota usage. Record upload acceptance, queue delay, batch completion, P50/P95, failure/retry/review rates and memory/cost.
6. Finish scenario gaps above, Chromium/WebKit/mobile/PWA checks and TR3/TR2 exact-commit release gates.
7. Only after PASS may merge/deploy/production smoke and a controlled real multi-document test proceed. This draft performs none of those actions.

## Enablement and rollback

Apply the additive migration before deploying the new Edge code even in legacy mode, because the code queries execution_mode. Never enable workflow until the independent recovery schedule and staged tests are proven. Drain existing legacy jobs before switching new uploads to workflow, because existing rows deliberately keep their execution_mode.

Rollback new uploads by setting Edge `DOCUMENT_EXECUTION_MODE=legacy`. Keep the workflow service/recovery running until accepted workflow jobs drain. For a stopped provider: pause dispatch, wait for or recover current leases, then under controlled service access change **only queued, unleased workflow rows with `usage_recorded_at is null`** to legacy (a row with `usage_recorded_at` already counted its usage; converting it would let the legacy path count it again); invoke the existing owner-bound resume flow. Never clear a live lease to race an active worker. Preserve results, documents, Storage, attempts and usage markers. Keep additive columns; reverting the Edge/processor deployment does not require destructive schema rollback. Browser receipt recovery continues to reuse existing Storage/document rows.

## Official Render patterns reused

- [file-processing example](https://github.com/render-examples/render-workflows-examples-python/blob/main/file-processing/main.py): `Workflows`, `TaskContext`, `ctx.run`, `asyncio.gather`; BOEKUNA adds controlled fan-out and database claim fencing.
- [file-analyzer example](https://github.com/render-examples/render-workflows-examples-python/tree/main/file-analyzer): API/task separation and identifier-only task starts.
- [Python workflow SDK](https://render.com/docs/workflows-sdk-python), [task definitions](https://render.com/docs/workflows-defining), [create task run API](https://api-docs.render.com/reference/createtask): pinned SDK/start_task and REST dispatch.

Official examples are orchestration references. All OCR/parser/financial rules remain BOEKUNA's existing implementation.

## Round 2 (2026-10-07): scenario gaps, real Postgres/PostgREST run, gates

Discovery at start: main `50fa6ae`, PR head `6d27ea9`, mergeable, no new main commits. All 7 checks on `6d27ea9` green, including `app` and `document-integrity` that were still running at the first handoff. Open PRs #227 (local Qwen benchmark, draft) and #223 (iOS packaging) do not overlap. The "Elite Agent Skillmap" and AGENTS.md/CLAUDE.md do not exist in the repository; this handoff and the PR are the instruction sources.

### Changed in this round (commit `3d275e4`)

| File | Change | Reuses |
| --- | --- | --- |
| `kwinest/docprocessor/app.py` | `contact_block`: unlabelled supplier search stops at the addressee label; labelled party blocks stop at totals; a legal footer line (`Name BV \| KvK …`) can name the issuer (confidence stays 0.62, so `supplierName` is reviewed). Native-text bare `datum` fallback only matches the standalone word, no longer `vervaldatum`/`besteldatum`. | existing party block, review routing, `norm_date` |
| `kwinest/docprocessor/document_intelligence.py` | Explicit reverse-charge statement on a zero/absent-VAT document sets the existing `accountingVatTreatment=review_required` (+ `processing.reverseChargeCandidate`). Conditional boilerplate and documents with charged VAT stay `standard`. Austrian `ATU…` counts as foreign tax context. | existing treatment field, both adapters already add `vatTreatment` review |
| `tests/document-v6-scenarios.test.py` | 47 synthetic scenario fixtures | existing parser entry point |
| `tests/document-workflow-integration.py`, `tests/fixtures/*` | real PostgreSQL 17 + PostgREST + unchanged worker/engine harness | all repository migrations, `workflow_tasks` task bodies |
| `.github/workflows/boekuna-document-v6.yml` | runs the scenarios; new `workflow_integration` job (Postgres 17 service, PostgREST 12.2.3 with checksum) | existing V6 workflow |
| `docs/engineering/document-v6-evidence/scenario-matrix.md`, `workflow-integration-local.json` | evidence | |

No change to OCR models, financial validators, queue table semantics, Edge, migration SQL or `index.html` in this round.

### Scenario matrix

Full traceable matrix: [`document-v6-evidence/scenario-matrix.md`](document-v6-evidence/scenario-matrix.md). Scenario fixtures: main 36/47, previous head 40/47, candidate 47/47. Metadata fixtures: main 40/107, previous head and candidate 107/107. Remaining PARTIAL (safe null, not extracted): invoice number printed above its label, month-name service periods.

### Database validation against real definitions

All 51 repository migrations replay in order on PostgreSQL 17.10 with a small Supabase platform shim (Supabase's own `auth.uid/role/jwt`; inert storage/pg_net/vault). The replayed `can_operate_bookkeeping`, `check_document_quota`, `record_document_usage`, `billing_effective_plan`, `billing_plan_limit`, `private.entitlement_state_for_user` and `private.current_user_has_verified_mfa` are **md5-identical to production** `pg_get_functiondef` (read-only query, 2026-10-07). `documents` and pre-V6 `document_processing_jobs` columns and constraints are identical to production. The PGlite test's stubs are therefore no longer the only database evidence.

### Worker integration run (local, real Postgres + PostgREST, not hosted)

`tests/document-workflow-integration.py`: real `process_batch` / `recover_pending` / `process_claimed_job` bodies and the existing engine through PostgREST RPCs, Storage endpoint emulated, Render fan-out emulated with threads, user cap 4, global cap 4, 4-core container. Result `PASS` ([JSON](document-v6-evidence/workflow-integration-local.json)):

| Scenario | Docs | Terminal | Batch completion | Per-doc P50 / P95 | Queue delay P95 | Peak active |
| --- | --- | --- | --- | --- | --- | --- |
| one user, one dispatch | 1 | 1 review | 4.3 s | 4.2 / 4.2 s | 0.03 s | 1 |
| one user, one dispatch | 10 | 10 review | 14.0 s | 4.5 / 4.8 s | 10.0 s | 4 |
| one user, one dispatch | 50 | 50 review | 57.5 s | 4.3 / 4.7 s | 50.3 s | 4 |
| 3 users × 15, each batch dispatched twice, concurrent recovery | 45 | 45 review | 54.0 s | 4.3 / 4.6 s | 46.9 s | 4 (4 per user) |
| 15% Storage 5xx, 5% RPC 5xx, 10% lost completion responses, 10% worker crashes | 30 | 29 review, 1 failed after 3 attempts | — | — | — | — |
| browser closed before dispatch, recovery only | 5 | 5 review | — | — | — | — |
| free plan (limit 10), 12 docs | 12 | 10 review, 2 `DOCUMENT_LIMIT_REACHED` | — | — | — | — |
| plan downgraded between claim and completion | 1 | completion rejected, then failed without usage | — | — | — | — |

Asserted for every scenario: no lost job, every job terminal without a lease, each result belongs to its own document and tenant, a completion audit trigger shows no job completed twice, billing usage equals completed jobs exactly. PostgREST anti-join used by Edge `repairMissingJobs` works on the real schema. Anon/authenticated JWTs cannot call workflow RPCs. Peak RSS of the single test process (engine + 8 threads) 1.6 GB; engine cold start 5.9 s. Lease expiry is simulated by moving `lease_expires_at`, not by waiting 10 minutes. The 100% review rate is the engine's existing conservative routing (`documentType` is always in quick review for these synthetic invoices), identical to the frozen benchmark; no review-rate change is claimed. Timings are from one shared container and are not a hosted SLA.

### OCR benchmark, same machine, same run conditions

| | main `50fa6ae` | candidate |
| --- | --- | --- |
| Fully correct | 28/28 | 28/28 |
| OCR / parser failures | 0 / 0 | 0 / 0 |
| P50 / P95 | 4343 / 8599 ms | 4213 / 8178 ms |
| Peak RSS | 925 MB | 926 MB |

This container is ~2× slower than the CI runner, so both main and candidate exceed the benchmark's 6 s P95 assertion here; the assertion is unchanged and CI is the gate. `processor-memory-regression` peaks at 474–501 MiB here for main, previous head and candidate alike (threshold 480 MiB, Python 3.13 vs CI 3.12); CI is the gate.

### Hosted gates still open

- **Supabase staging**: done in round 3, see below.
- **Render Workflow**: no Workflow-service creation is available to this session and no Render API key exists in the environment. Needed from the owner: create a Workflow service from this branch (root `kwinest/docprocessor`, build `pip install -r requirements-workflow.txt`, start `python workflow_tasks.py`, env `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` of **staging**, external AI off), a cron job (same root, `python workflow_recovery.py`, every minute, env `RENDER_API_KEY`, `DOCUMENT_WORKFLOW_SLUG`) and staging Edge env `DOCUMENT_EXECUTION_MODE=workflow`, `DOCUMENT_WORKFLOW_SLUG`, `RENDER_API_KEY`, `DOCUMENT_WORKFLOW_RECOVERY_ENABLED=true`. Then hosted 1/10/50/multi-user runs and a confirmed recovery schedule.
- **Devices**: physical iPhone Safari/PWA and WebKit background processing remain unproven.

## Round 3 (2026-10-07): independent reviews, fixes, hosted staging

### Independent reviews and fixes (commit `d17b897`)

- **TR3 (financial/backend/security): PASS with findings.** Fixed: reverse-charge review now applies only to incoming documents (own sales invoices with "BTW verlegd" keep their booking path); Dutch spellings `BTW: verlegd`, `BTW-verlegd`, `BTW 0% verlegd`, `Omzetbelasting verlegd` are recognised; the party-block totals boundary needs an amount, so "Totaal Techniek B.V." keeps its KvK; the workflow worker's review routing now mirrors Edge `reviewAssessment` exactly (`tests/document-review-parity.test.mjs` compares both on 23 cases); Edge upload/retry dispatch only their own batch, and a lost concurrent retry returns 409 `JOB_NOT_RETRYABLE` instead of 500. Documented, not changed: the local harness never exercises the `ready` path (synthetic documents always need review) and does not run Edge TypeScript; rollback must not convert rows with `usage_recorded_at` (rollback section updated). Pre-existing and unchanged: the supplier name on that fixture reads "taal Techniek B.V." (truncated), which stays in review.
- **TR2 (upload/mobile): PASS with low findings.** Chromium only; WebKit is not installed in this environment. Low: the developer resume helper skips workflow jobs (by design, workflow rows are resumed by recovery, not by the browser). Physical iPhone Safari/PWA is not covered.

Scenario fixtures 53/53 ([matrix](document-v6-evidence/scenario-matrix.md)), metadata 107/107, worker tests pass.

### Hosted Supabase staging (`boekuna-candidate`, `ozisiotrzeubwbffnxyr`)

Owner approved testing on staging with synthetic data. Production was not touched.

Applied on staging: `staging_align_entitlement_tables_with_production`, `staging_align_access_quota_functions_with_production` (all access/quota functions md5-equal to production except `current_user_has_verified_mfa`, which V6 does not call) and `document_workflow_leases` (this PR's migration, unchanged).

Driver: a temporary staging-only Edge function that runs the same RPC/Storage sequence as `workflow_tasks.process_claimed_job` (claim, access check, document row, Storage download, complete/fail) on synthetic `%PDF synthetic ST-xxxx` files, without OCR and without external AI. Each run dispatched the same ids twice with 8 workers against caps of 4 per user and 4 global. Report: [`workflow-staging-hosted.json`](document-v6-evidence/workflow-staging-hosted.json).

| Run | Jobs | Result | Queue → completion P50 / P95 |
| --- | --- | --- | --- |
| 1 document | 1 | done; duplicate dispatch not claimed | 2.8 / 2.8 s |
| 10 documents | 10 | done in 3 rounds of max 4 | included below |
| 50 documents | 50 | done in 12 rounds, never more than 4 active | 32.7 / 40.0 s |
| 3 users × 10, faults (4 crashes, 1 Storage 5xx, 4 lost completion responses) | 30 | 4 crashed leases held all slots; after simulated lease expiry `recover_document_workflow_jobs` returned 4 and the batch drained | 64–95 / ~100 s (includes the manual wait for the simulated expiry) |
| free plan (limit 10), 12 documents | 12 | 10 done, 2 `DOCUMENT_LIMIT_REACHED` | 6.3 / 9.1 s |

Per-call latency (hosted, first round): claim P50 160–470 ms, Storage download P50 720–880 ms, complete P50 120–330 ms.

Checked on the database afterwards: 103 jobs, 101 completed and 2 quota failures, 0 leases left, 0 results with another document's invoice number, 0 double completions (audit trigger), max attempt 2, and `billing_usage_monthly` equal to `usage_recorded_at` equal to completions for every user (71, 10, 10, 10). Anon calls to `claim`, `access`, `complete`, `fail` and `recover` are refused (401 / 42501). The Edge `repairMissingJobs` embed query works on the hosted schema.

Not measured here: OCR compute, memory and cost on Render (no Workflow service yet), Edge `document-processing` workflow dispatch (no workflow env on staging), and a real 10-minute lease expiry plus cron recovery.

Staging cleanup: the synthetic Storage files (103) are deleted and the temporary function is replaced by a 410 stub. Deleting rows needs a confirmation this session cannot give, so these synthetic rows remain on staging only: 4 users `v6-stress-*@synthetic.invalid`, their 103 jobs and documents, usage rows and internal grants, plus a disabled audit trigger `v6_stress_audit` and schema `v6_stress`. Cleanup SQL for the owner:

```sql
drop trigger if exists v6_stress_audit on public.document_processing_jobs;
drop schema if exists v6_stress cascade;
create temp table su as select id from auth.users where email like 'v6-stress-%@synthetic.invalid';
delete from public.document_processing_jobs where user_id in (select id from su);
delete from public.documents where user_id in (select id from su);
delete from public.billing_usage_monthly where user_id in (select id from su);
delete from public.internal_access_grants where user_id in (select id from su);
delete from auth.users where id in (select id from su);
```

### Remaining gates (NOT MERGE READY)

1. Render Workflow service and one-minute recovery cron on staging (settings under "Hosted gates still open"), then a 1/10/50 run with real OCR compute, memory and cost, and Edge dispatch with `DOCUMENT_EXECUTION_MODE=workflow` on staging.
2. Physical iPhone Safari/PWA and WebKit background behaviour.
3. CI green on the final head (see PR).
