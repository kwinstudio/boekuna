# BOEKUNA app polish implementation plan

> **For agentic workers:** Use the parallel-agent workflow for independent domains and integrate each tested commit. Independent release QA remains a separate review of the frozen PR HEAD.

**Goal:** Implement the supplied app polish and functional fix round without changing marketing or booked financial truth.

**Architecture:** Keep the existing inline app and split builds. Preserve tenant-owned ledger state and invoice serializers. Cashflow recurrence expands deterministic projections from stored schedules, without creating booked transactions.

**Tech Stack:** HTML/CSS/JavaScript, Supabase/Postgres, Node regression tests, Playwright Chromium/WebKit.

**Spec:** User attachment `Geplakte tekst(20261001-233904).txt`, sections 0–32.

## Global constraints

- Base: `7134e3be64b084bef67373ac3bcac2d41364b2d5`; new feature branch.
- Preserve auth, RLS, invoice identity/numbering, VAT, mixed VAT, bank matching, billing, Developer Mode and KVK.
- Native email handoff only, with explicit sent confirmation.
- App-only changes; marketing output must remain byte equivalent.
- Minimum recurrence: oneoff, weekly, monthly; historical schedules default to oneoff.
- Test widths: 320, 360, 375, 390, 393, 430, 768, 1024, 1280, 1440, 1920.
- No merge or production deployment before independent QA PASS.

## Review focus

- Concurrent finalize clicks and retry after cloud/PDF failure preserve one identity and number.
- Month-end recurrence stays anchored to the original day across February and leap years.
- Control actions resolve the precise source item and remain truthful after reload.
- PDF exit and destructive confirmation work by keyboard and on mobile.
- Long names and large monetary values preserve alignment and financial equivalence.

## Tasks

1. **Baseline and reproduction** — run existing domain/browser suites, record root causes and both build outputs before editing. Fix test environment dependencies separately from app code.
2. **Invoice workflow** — add failing finalize/retry/booking/numbered-draft tests, fix identity and persistence gates, preserve native delivery and missing-email recovery. Run invoice status, delivery and accounting suites.
3. **Cashflow recurrence** — add failing date-boundary/projection/persistence tests; normalize recurrence in tenant ledger state, validate server metadata, add schedule create/edit/delete, retain oneoff behavior. Prove projections do not alter ledger totals.
4. **Context and safe dialogs** — add exact-item resolution tests, link/upload concrete document flow, report PDF close/back/focus controls, settings account group and typed reset confirmation. Verify cancel/error/reload behavior.
5. **Presentation** — refine financial rows and fixed action anchor, document upload/count/icon actions, floating chart tooltip and money nowrap. Preserve table semantics and financial values.
6. **Integration verification** — integrate isolated commits, run all affected source/domain/browser suites, inspect screenshots, check all widths and marketing hashes. Add new tests to app CI.
7. **PR and handoff** — commit evidence and report, push feature branch, open one PR, inspect exact-HEAD CI, freeze and hand off to 03. Report blockers honestly; no independent PASS from implementation agents.
