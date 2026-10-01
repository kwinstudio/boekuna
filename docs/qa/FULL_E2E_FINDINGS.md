# BOEKUNA Full Functional E2E Findings

Run: QA-E2E-20261001  
Source SHA: `7132029b792c8942f18317637ff352461dfe08d5`

## FUNC-CI-001

Severity:
P2 — MEDIUM

Feature:
CI / production source safety contract

Source SHA:
7132029b792c8942f18317637ff352461dfe08d5

Environment:
GitHub Actions run 36883528292, job 110440977379

Preconditions:
Exact frozen main SHA.

Steps:
1. Run current `tests/source-safety.test.mjs` through the repository integrity workflow.
2. Reach the contextual list placeholder assertions.
3. Compare the asserted contact placeholder with current `LIST_UI.contacts.placeholder`.

Expected:
The source-safety contract matches the current intended contact-search copy and allows the rest of the exact-current integrity suite to execute.

Actual:
The test requires `Zoek op naam, e-mail of plaats`, while source uses `Zoek op bedrijfsnaam of contactpersoon`. The underlying relation-search haystack still includes name, contact person, e-mail, city and VAT ID. The workflow exits at this assertion and downstream tenant/browser/document/billing checks are skipped.

Financial impact:
No direct financial miscalculation demonstrated.

Security impact:
Indirect QA coverage impact: current security/tenant suites in this workflow are skipped after the failure.

User impact:
No direct relation-search functionality loss proven. Release confidence is reduced because the exact-current integrity gate cannot complete.

Evidence:
GitHub Actions run 36883528292; job 110440977379; source-safety assertion at tests/source-safety.test.mjs:143; frozen LIST_UI/listSearchHaystack source inspection.

Reproduced:
YES on the exact-current CI run; one confirmatory workflow retry is reserved for Checkpoint 31.

Owner:
03 — QA/security

## QA execution constraint — interactive browser

The matching app deployment is live, but this execution environment exposes no interactive browser/computer action tool and its container DNS cannot resolve the Render deployment host. Web fetch also cannot access the Render preview. Under the QA contract, source inspection is insufficient for interactive flows, so affected scenarios are marked BLOCKED rather than PASS. This constraint does not stop source/backend/security/CI checks that remain independently testable.
