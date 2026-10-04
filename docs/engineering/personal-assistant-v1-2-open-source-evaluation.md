# Personal Assistant V1.2 — Open Source Evaluation

Date: 2026-10-04  
Repository: `kwinstudio/boekuna`  
Workstream: Personal Assistant V1.2

## Decision

BOEKUNA ships no new runtime dependency for V1.2.

The existing deterministic Personal Insights engine stays. V1.2 adds a small first-party deterministic Q&A module because the product needs a fixed, explainable intent/knowledge layer rather than a generic agent framework.

## Current repository audit

| Project | Use case considered | Current state checked 2026-10-04 | License | Decision | Why | Files/package used | Risk |
| --- | --- | --- | --- | --- | --- | --- | --- |
| actualbudget/actual | rule/normalization/personal-finance patterns | Active | MIT | ADOPTED_PATTERNS | Mature local rules and payee/category patterns are relevant, but BOEKUNA already has the safer tenant-local V4.3 learning boundary. | None copied | Low |
| CacheControl/json-rules-engine | generic rules/facts/priorities | Active | ISC | KEEP_EXISTING_ENGINE | Prior BOEKUNA benchmark showed identical proof behavior with much more overhead; V1.2 has a small fixed rule set. | None | Low |
| assistant-ui/assistant-ui | accessible assistant composer/prompt UX | Active | MIT | REFERENCE_ONLY | Useful UX reference; BOEKUNA is not React-based and does not need a framework rewrite. | None | Low |
| CopilotKit/CopilotKit | assistant architecture/app control | Active | MIT | REFERENCE_ONLY | Too agentic/general for deterministic financial state; no LLM should control authoritative accounting. | None | Low |
| novuhq/novu | inbox/digest/notification preferences | Active/open-core repository | Path-dependent | DEFERRED | V1.2 is in-app and needs no external notification platform. Exact path/license review required if adopted later. | None | Medium if adopted |
| triggerdotdev/trigger.dev | scheduled summaries/retries/workflows | Active | Apache-2.0 root | DEFERRED | Current in-process assistant and existing Supabase background capabilities are sufficient. | None | Low |
| firefly-iii/firefly-iii | finance/rule/product reference | Active | AGPL-3.0 | REFERENCE_ONLY | Useful reference only; direct reuse would require copyleft/network-license review. | None | High for direct reuse |
| maybe-finance/maybe | finance UX reference | Archived | AGPL-3.0 | REFERENCE_ONLY | Archived and unsuitable as a critical dependency. | None | High for dependency |
| akaunting/akaunting | accounting product/code | Active | BSL/custom restrictions | NO_CODE_REUSE | Existing repository license review restricts Accounting Service usage; BOEKUNA is hosted accounting SaaS. | None | High |
| invoiceninja/invoiceninja | invoicing product/code | Active | Elastic License 2.0 | NO_CODE_REUSE | ELv2 disallows providing substantial functionality as a hosted/managed service. | None | High |

## License verification notes

- assistant-ui current root LICENSE: MIT.
- CopilotKit current root LICENSE: MIT.
- Invoice Ninja current root LICENSE: Elastic License 2.0 with explicit hosted/managed-service limitation.
- GitHub metadata currently reports MIT for Actual Budget, ISC for json-rules-engine, Apache-2.0 for Trigger.dev, AGPL-3.0 for Firefly III and AGPL-3.0 for Maybe.
- Novu and Akaunting require path-specific/manual license review before any future reuse; no source is copied in V1.2.

## Why no assistant framework

V1.2 requires:

- known Dutch intents;
- curated beginner explanations;
- structured tenant-local facts;
- deterministic safe answers;
- fixed deep links;
- no generative AI;
- no arbitrary tool execution;
- no conversation persistence requirement.

A generic assistant/agent framework would add bundle size, dependencies and a larger attack surface without improving this contract.

## Why no new rules package

The existing BOEKUNA rule engine is:

- deterministic;
- in-process;
- zero-network;
- zero-runtime-dependency;
- already integrated with priority, lifecycle and personalization;
- covered by current performance and financial boundary tests.

The Q&A router is deliberately separate because a user question is not a financial rule. It maps normalized language to a fixed intent, then reads an already-built structured fact bundle or curated knowledge entry.

## Privacy/security decision

V1.2 sends no financial data to third parties.

The Q&A module:
- performs no fetch/network calls;
- receives no raw OCR;
- receives no DB client;
- receives no arbitrary SQL;
- has a fixed route/filter allowlist;
- does not log question text or financial amounts.

## Final record

```
OPEN_SOURCE_AUDIT: PASS
ACTUAL_BUDGET: ADOPTED_PATTERNS
JSON_RULES_ENGINE: KEEP_EXISTING_ENGINE
ASSISTANT_UI: REFERENCE_ONLY
COPILOTKIT: REFERENCE_ONLY
NOVU: DEFERRED
TRIGGER_DEV: DEFERRED
FIREFLY: REFERENCE_ONLY
MAYBE: REFERENCE_ONLY
AKAUNTING_CODE_USED: NO
INVOICE_NINJA_CODE_USED: NO
NEW_PRODUCTION_DEPENDENCIES: NONE
LICENSE_REVIEW: PASS
EXTERNAL_AI_ENABLED: NO
```
