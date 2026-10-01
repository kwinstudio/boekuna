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


## FUNC-SEC-001

Severity:
P2 — MEDIUM

Feature:
Authentication security hardening

Source SHA:
7132029b792c8942f18317637ff352461dfe08d5

Environment:
Supabase production project vuwfyhtejsxhdfyvkkeq

Preconditions:
Current production Auth configuration.

Steps:
1. Read Supabase security advisors.
2. Inspect authentication findings.

Expected:
Leaked-password protection enabled for a production bookkeeping application.

Actual:
Supabase advisor `auth_leaked_password_protection` reports leaked-password protection disabled.

Financial impact:
No direct accounting corruption demonstrated.

Security impact:
Compromised-password reuse is not blocked by Supabase's leaked-password check, increasing account-takeover exposure.

User impact:
A user can choose a password known to be compromised if other password rules accept it.

Evidence:
Supabase security advisor observed 2026-10-01T16:45:37.062Z.

Reproduced:
YES

Owner:
04 — DevOps/release

## FUNC-SEC-002

Severity:
P3 — LOW

Feature:
Database security hardening

Source SHA:
7132029b792c8942f18317637ff352461dfe08d5

Environment:
Supabase production project vuwfyhtejsxhdfyvkkeq

Preconditions:
Current production database configuration.

Steps:
1. Read Supabase security advisors.
2. Inspect extension findings.

Expected:
Security-sensitive extensions are kept out of the exposed public schema when feasible.

Actual:
Supabase advisor `extension_in_public` reports `pg_net` installed in `public`.

Financial impact:
None demonstrated.

Security impact:
Hardening concern only; no exploit or tenant leak demonstrated in this audit.

User impact:
No direct user-visible failure demonstrated.

Evidence:
Supabase security advisor observed 2026-10-01T16:45:37.062Z.

Reproduced:
YES

Owner:
04 — DevOps/release

## Security-advisor review notes

The advisor also reports RLS-enabled server-managed tables with no policies. That is fail-closed for authenticated/anon roles rather than evidence of exposure; service-role-only access is intentional on the inspected KVK/billing internals. Four authenticated SECURITY DEFINER functions are also linted. Source review shows they derive the acting user from `auth.uid()` and use scoped server-only helpers; no cross-tenant bypass was demonstrated. These warnings are retained as review evidence but not promoted to product findings without an exploit path.
