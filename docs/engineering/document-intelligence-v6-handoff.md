# BOEKUNA document intelligence V6: implementation and release handoff

Status: draft implementation prepared for separate PR review. Production remains on the existing legacy adapter. **Not merge-ready and not a production PASS.**

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
| New metadata scenario families, 100 parameter instances | 36 pass | 100 pass |
| Metadata parser timing P50 / P95 | 0.617 / 0.871 ms | 1.039 / 4.057 ms |
| Existing frozen V5 actual OCR documents | 28/28 fully correct | 28/28 fully correct |
| OCR P50 / P95 | 2034.79 / 4446.34 ms | 1929.91 / 4170.23 ms |
| OCR/parser failures | 0 / 0 | 0 / 0 |
| OCR passes per document | 2.0 | 2.0 |
| Applicable invoiceNumber/date/supplier/financial/mixed VAT field accuracy | 100% | 100% |
| Existing OCR benchmark review rate | 100% | 100% |

The JSON contains the existing EXACT/NORMALIZED/MISSING/WRONG field grading and document records. The metadata count grades whole assertions, not a population accuracy estimate. Single-machine timing is descriptive, not a statistically established speedup or hosted SLA. The 100% review rate is the benchmark's existing conservative parser/confidence behavior; no review-rate improvement is claimed.

Final source regression selection: **192 passed**, 12 existing dependency/deprecation warnings, 54.00 seconds. Independent TR3 repeated 100 metadata + 10 worker cases: **110 passed**. The source hashes are app.py `d8745dfeefdd899974106ccea30e809510e9393ed0bbe4b0e857baae246b1237`, Edge index.ts `b7939b4eb7e7fb78700a792c9f2d7e1926d54fad0b590d057dd02f77e0c4eeab`, TR2-reviewed index.html `726b537083702edc6bab4863b0d732592cdf0c1e4238f4c34af1752c0660bd37`.

Actual migration SQL executed in PGlite: 1, 10 and 50 jobs all reached terminal ready; peak active 1, 4 and 4. Tests cover multi-user/global caps, duplicate claims, wrong/stale leases, exponential backoff, exhausted/permanent failures, crash recovery, revoked access/quota rollback, atomic exactly-once usage and denied anon/authenticated RPC execution. This is a database simulation with stubs for existing auth/quota functions, not a Render load test or hosted Supabase integration.

Production-function VM upload tests pass for receipt gating, delayed/missing job, network error, mixed batch visibility and recovered receipt. Browser launch is blocked by a missing Chromium binary; no Chromium/WebKit/mobile/PWA/device PASS is claimed.

## Independent review and merge gates

TR3 independent review passed the locally automated financial/backend/security/document integrity scope after its parser findings were fixed. The subsequent date extension independently passed 110 tests (100 metadata + 10 worker), with app.py hash `d8745dfeefdd899974106ccea30e809510e9393ed0bbe4b0e857baae246b1237`. All reported inline/fallback identifier, short-year, foreign-date and issued-prose blockers were rechecked. It is not a hosted production PASS. Local tests use a Render SDK substitute when the SDK is unavailable; CI installs the real pinned `render==1.0.1`. TR2 independent source/VM review passed receipt changes after mixed-batch/recovery findings were fixed, and repeated its closure after rebase onto current main (index.html hash `726b537083702edc6bab4863b0d732592cdf0c1e4238f4c34af1752c0660bd37`). Its browser and physical-device scope remains open.

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

Rollback new uploads by setting Edge `DOCUMENT_EXECUTION_MODE=legacy`. Keep the workflow service/recovery running until accepted workflow jobs drain. For a stopped provider: pause dispatch, wait for or recover current leases, then under controlled service access change **only queued, unleased** workflow rows to legacy; invoke the existing owner-bound resume flow. Never clear a live lease to race an active worker. Preserve results, documents, Storage, attempts and usage markers. Keep additive columns; reverting the Edge/processor deployment does not require destructive schema rollback. Browser receipt recovery continues to reuse existing Storage/document rows.

## Official Render patterns reused

- [file-processing example](https://github.com/render-examples/render-workflows-examples-python/blob/main/file-processing/main.py): `Workflows`, `TaskContext`, `ctx.run`, `asyncio.gather`; BOEKUNA adds controlled fan-out and database claim fencing.
- [file-analyzer example](https://github.com/render-examples/render-workflows-examples-python/tree/main/file-analyzer): API/task separation and identifier-only task starts.
- [Python workflow SDK](https://render.com/docs/workflows-sdk-python), [task definitions](https://render.com/docs/workflows-defining), [create task run API](https://api-docs.render.com/reference/createtask): pinned SDK/start_task and REST dispatch.

Official examples are orchestration references. All OCR/parser/financial rules remain BOEKUNA's existing implementation.
