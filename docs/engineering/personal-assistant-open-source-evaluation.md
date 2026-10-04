# Personal Assistant Open Source Evaluation

Date: 2026-10-04  
Workstream: BOEKUNA Personal Assistant / Personal Insights  
Repository: `kwinstudio/boekuna`  
Synced main for final evaluation: `63b869de6e78e229634b860ced5ff9bd47f3d6ec` (Document Intelligence V4.1–V4.3)

## Decision

BOEKUNA keeps the lightweight in-process Personal Insights rule registry.

No new production dependency, external notification platform, external workflow platform, or external AI service is introduced by this workstream.

The split remains:

```
BOEKUNA authoritative accounting/document state
→ safe fact adapter
→ lightweight deterministic rules
→ personal baseline
→ BOEKUNA priority/insight taxonomy
→ preferences
→ dashboard / Voor jou
```

Document Intelligence V4.3 remains the single tenant-local source for learned supplier/category patterns. The Personal Assistant must consume its confirmed/safe outputs when that behavior is surfaced; it must not create a second vendor-learning store.

## Build-vs-adopt result

The temporary comparison used `json-rules-engine@7.3.1` only inside CI, with install scripts disabled and no package-lock or production package change.

The proof covered:
- 10 rules;
- 100 rules;
- 1,000 evaluations per case;
- output correctness;
- priority order;
- async facts;
- missing-fact/error behavior.

The rule scenarios represented overdue invoices, partial payments, cost spikes with an absolute false-positive guard, document review, unresolved VAT, unmatched bank rows, cold start, no-action state and high outstanding balances.

| Case | BOEKUNA lightweight | json-rules-engine 7.3.1 | Relative |
| --- | ---: | ---: | ---: |
| 10 rules × 1,000 | 2.947 ms total / 0.00295 ms avg | 131.317 ms total / 0.13132 ms avg | external engine ~44.6× slower |
| 100 rules × 1,000 | 11.604 ms total / 0.01160 ms avg | 571.936 ms total / 0.57194 ms avg | external engine ~49.3× slower |

Correctness was identical in the proof. Async facts work and a missing authoritative fact fails rather than inventing a value.

Separately, the production Personal Insights engine on a synthetic large tenant (600 invoices, 1,200 expenses, 800 transactions, 150 documents) measured p50 3.12 ms, p95 3.94 ms and max 5.16 ms across 50 evaluations, with zero engine I/O.

### Why json-rules-engine is rejected for V1

The package is capable, ISC-licensed and useful when rules must be persisted as generic JSON or resolve asynchronous facts. BOEKUNA V1 does not need those advantages:
- all financial facts already exist in memory from authoritative BOEKUNA helpers;
- the current rule set is small and intentionally product-specific;
- rule functions are easier to debug alongside Dutch beginner copy and source facts;
- the current engine has zero runtime dependencies and zero network behavior;
- adding the package would add a generic abstraction and transitive dependency surface without improving current correctness or maintainability;
- npm still exposes 7.3.1 as latest while the repository changelog contains 7.3.2 changes, which adds version/release ambiguity to an otherwise unnecessary dependency.

If future BOEKUNA requirements materially change — for example a user-editable generic rule language — this decision can be revisited behind the same fact-adapter boundary.

## Open-source audit

| Component | Evaluated reference | Decision | License | Commercial SaaS fit | Why / risk | BOEKUNA alternative |
| --- | --- | --- | --- | --- | --- | --- |
| Actual Budget | `actualbudget/actual` v26.10.0 | ADOPT PATTERNS ONLY | MIT | Yes for MIT code | Mature condition/action rules, validation, ordered execution, payee normalization and default-category patterns are useful references. No source code copied. | BOEKUNA deterministic rule registry + V4.3 tenant-local learning |
| json-rules-engine | npm 7.3.1 / `CacheControl/json-rules-engine` | REJECTED FOR V1 | ISC | Yes | Correct and generic, but slower in our proof and unnecessary; adds dependencies and abstraction. 7.3.1 specifically upgraded jsonpath-plus for a CVE. | Current zero-dependency engine |
| Novu | `novuhq/novu`, current open-core repo; framework release v2.14.0 | DEFERRED | MIT core; commercial enterprise paths | Core only, subject to path/license review | Valuable later for inbox/digest/channel orchestration, but V1 is in-app only and does not justify another multi-tenant notification platform. | Current in-app assistant UI; revisit only for multi-channel requirements |
| Trigger.dev | `triggerdotdev/trigger.dev` v4.7.2 | DEFERRED | Apache-2.0 root; package licensing varies | Potentially yes after exact package review | Strong long-running/scheduled job platform, but assistant V1 computes deterministically in-process and current BOEKUNA already has Supabase Edge/background processing. Extra infrastructure is not justified. | Supabase/current background infrastructure |
| Firefly III | `firefly-iii/firefly-iii` v6.7.7 | REFERENCE ONLY | AGPL-3.0 | Legal review required for network reuse | Useful product/rule/report reference; copyleft network obligations make direct reuse inappropriate for this workstream. | Architectural reference only |
| Maybe Finance | `maybe-finance/maybe` v0.6.0 | REFERENCE ONLY | AGPL-3.0 | Legal review required; repository archived | Good finance/insight UX reference, but final release states the repository is no longer actively maintained. | Design reference only |
| Akaunting | `akaunting/akaunting` 3.2.4 | NO CODE REUSE | Business Source License 1.1 | No for BOEKUNA use without commercial license | The license explicitly restricts use as an “Accounting Service” and rebranding/scale. BOEKUNA is a hosted accounting SaaS. | Product reference only |
| Invoice Ninja | `invoiceninja/invoiceninja` v5.13.43 / v5-stable | NO CODE REUSE | Elastic License 2.0 | Hosted-service restriction conflicts with direct reuse | ELv2 disallows providing substantial functionality as a hosted/managed service. | Product reference only |

## Actual-inspired learning, implemented through existing BOEKUNA V4.3

The useful Actual pattern is not “copy a finance app”. It is:
1. normalize a supplier/payee identity;
2. collect explicit user-confirmed behavior;
3. require repeated evidence;
4. suggest a future administrative choice;
5. keep the user in control.

After the OCR V4.1–V4.3 merge, BOEKUNA already has the safer native implementation in `public/assets/document-intelligence.js`:
- tenant-scoped supplier keys;
- no global training;
- minimum 3 observations;
- retained evidence rebuilt from bounded feedback history;
- category included only from allowed confirmed categories;
- category prediction requires at least 90% support;
- user-confirmed/deferred fields are protected;
- learned output can remain shadow-only when memory is disabled;
- `autoBook:false`.

Therefore the Personal Assistant will not create a duplicate Adobe → Software learning table. Future UI can phrase the existing safe prediction as, for example, “Je gebruikt Adobe meestal als Software”, with an explicit user action. VAT rate, tax treatment, payment status and financial corrections remain authoritative BOEKUNA logic, not assistant-learned truth.

## Security / privacy review

### New production dependencies

None.

### Temporary benchmark dependency

`json-rules-engine@7.3.1` was installed only in CI with:
- `--no-save`;
- `--package-lock=false`;
- `--ignore-scripts`.

The isolated install reported zero npm audit vulnerabilities at test time. The temporary install and benchmark gate are removed after capturing the decision evidence.

### Data handling

- No financial data is sent to an external rule, notification or workflow SaaS.
- No raw OCR text is sent into the Personal Insights engine.
- Assistant facts come only from structured BOEKUNA state and existing financial helpers.
- No external AI is enabled.
- No cross-tenant learning is introduced.
- Personal Insights rule evaluation performs zero network/database I/O.
- Rendering an insight does not mutate accounting state.

## Notification and background-job decisions

### Novu

Deferred. V1 and the weekly in-app summary work without notification infrastructure. Revisit only when BOEKUNA genuinely needs multi-channel delivery, user notification-center state or digest orchestration. Any future adoption must pin exact packages/paths and exclude enterprise-licensed code.

### Trigger.dev

Deferred. Current assistant generation is fast enough to run in-process and does not need nightly recomputation. BOEKUNA's existing Supabase/Edge/background mechanisms remain the first option for future scheduled summaries or retries. Re-evaluate Trigger.dev only if concrete job durability/observability requirements exceed the existing stack.

## Third-party notices

No notice file is added because this workstream copies no third-party source and ships no new third-party package. If a future revision adopts MIT/ISC/Apache code or package artifacts, add the exact copyright/license notice required by that dependency.

## Final audit fields

```
OPEN_SOURCE_AUDIT: PASS

ACTUAL_BUDGET: ADOPTED_PATTERNS
ACTUAL_BUDGET_REFERENCE: v26.10.0
ACTUAL_BUDGET_LICENSE: MIT

JSON_RULES_ENGINE: REJECTED
JSON_RULES_ENGINE_VERSION_EVALUATED: 7.3.1
JSON_RULES_ENGINE_LICENSE: ISC

NOVU: DEFERRED
TRIGGER_DEV: DEFERRED
FIREFLY_III: REFERENCE_ONLY
MAYBE_FINANCE: REFERENCE_ONLY
AKAUNTING_CODE_USED: NO
INVOICE_NINJA_CODE_USED: NO

NEW_PRODUCTION_DEPENDENCIES: NONE
LICENSE_REVIEW: PASS
SECURITY_REVIEW: PASS
PRIVACY_REVIEW: PASS
EXTERNAL_FINANCIAL_DATA_TRANSFER: NO
EXTERNAL_AI_ENABLED: NO
OCR_CHANGED_BY_ASSISTANT_WORKSTREAM: NO
```

## Re-evaluation triggers

Revisit this ADR only when at least one becomes true:
- BOEKUNA exposes user-authored generic rules;
- rules must be externally persisted/edited independent of product code;
- notification delivery expands beyond the existing in-app surface;
- scheduled assistant jobs require durability/observability the existing Supabase stack cannot provide;
- the V4.3 learning contract changes materially.
