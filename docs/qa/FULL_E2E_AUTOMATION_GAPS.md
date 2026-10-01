# BOEKUNA Full E2E Automation Gap Audit

Run: QA-E2E-20261001  
Source SHA: 7132029b792c8942f18317637ff352461dfe08d5

## Current permanent automation observed

Current workflows contain dedicated coverage for split architecture/build/origins/CI boundaries, developer-mode safety, KVK unit/security/browser behavior, smart financial correction, browser smoke, mobile layout, document upload/background processing, progressive onboarding, list controls, invoice status editing, document verification, cloud-sync serialization, tenant isolation, production integrity, invoice delivery, accounting integrity, OCR/PDF/document-error regression, receipt math, financial blocks and billing source/entitlement contracts.

The exact-current integrity run does not reach most of those tests because `source-safety.test.mjs` fails earlier on a stale contact-search placeholder assertion.

## MUST_AUTOMATE

1. **CI gate resilience for QA-only/copy changes** — the source-safety contract must validate the intended search capability without making unrelated critical security/browser suites unreachable because visible copy changed.
2. **Authenticated sales-chain E2E** — customer → service → invoice → definitive number → PDF → handoff confirmation → payment → bank match → dashboard → VAT → report → ledger, with deterministic financial truth.
3. **Authenticated purchase/document-chain E2E** — receipt/PDF → processor → mixed-VAT review/correction → expense → bank match → VAT → report → ledger.
4. **Stripe test-mode lifecycle** — checkout → success/cancel → server-side entitlement → portal → return, with no live charge.
5. **Backup round-trip** — export JSON → isolated restore → row/value comparison → no silent duplication → invalid-file rejection.
6. **Multi-period accounting truth** — deterministic records across month/quarter/year boundaries checked against dashboard, VAT, report and ledger.
7. **Auth/session security E2E** — login, refresh, expiry, logout, Back/Forward, reset and MFA path where enabled.
8. **Idempotence/recovery chain** — double-submit, refresh during edit/upload, duplicate document, duplicate bank import, retry/rematch and multi-tab conflict without duplicate postings.

Any future P0/P1 regression discovered by this audit is automatically MUST_AUTOMATE.

## SHOULD_AUTOMATE

- Settings save/reload plus downstream invoice-prefix/payment-term/KOR effects.
- Export byte/content validation for invoices, expenses, journal and audit CSV.
- Control-center count/resolution invariants.
- Planned cashflow persistence/projection.
- Booking, hours and mileage CRUD/persistence.
- Invoice email-template/layout/logo persistence and generated-document assertions.
- Broader list search/filter/sort combinations across all contextual lists.
- Accessibility test that runs axe plus keyboard/focus/modal/table checks in Chromium and WebKit.

## OPTIONAL

- Large exploratory matrices for Unicode, quotes, very long names, many invoice lines and rapid clicking beyond the core deterministic regressions.
- Visual-only comparisons that do not protect a functional or accessibility contract.

## Structural recommendation for CI

Do not let one non-security source-copy assertion prevent independent tenant, financial, document, billing and browser jobs from running. Separate critical jobs or use independent job boundaries so a copy-contract failure remains visible while the rest of release evidence is still produced.
