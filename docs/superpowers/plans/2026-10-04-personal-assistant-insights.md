# BOEKUNA Personal Assistant / Insights V1 — implementation plan

Date: 2026-10-04
Owner: Personal Assistant workstream
Repository: kwinstudio/boekuna
Branch: 01/personal-assistant-insights-v1
MAIN_BEFORE: 175b1072f91caecdf206de77f8c9b82492b3427e

## Hard boundaries

- Do not modify `kwinest/docprocessor/**`, OCR models, preprocessing, extraction, classification, OCR confidence, scanner fixtures, or scanner logic.
- Do not merge or copy PR #57. Google login stays OFF. Gmail OAuth stays OFF.
- Financial truth remains the existing BOEKUNA deterministic helpers and validated accounting state.
- Never derive financial truth from raw OCR payloads or processor text.
- No external generative AI in V1.
- No autonomous external actions.

## Current audit

The existing app already has:
- authoritative invoice helpers: `invoiceNet`, `invoiceVat`, `invoiceGross`, `invoicePaidAmount`, `invoiceOutstanding`, `invoiceEffectiveStatus`;
- authoritative expense/VAT helpers;
- tenant-owned state in `public.ledger_state.state`;
- RLS policies on `ledger_state` that enforce `auth.uid() = user_id` for SELECT/INSERT/UPDATE/DELETE plus MFA and entitlement guards;
- dashboard attention logic, but the rules are currently coupled directly to UI in `dashboardAttentionItems()`;
- safe list filters and navigation targets;
- document review and persistent processing states;
- Chromium, WebKit, accessibility and financial regression suites.

No new database table is required for V1. Derived financial insights will be calculated on demand. Only assistant preferences, dismissals and feedback are persisted inside the existing tenant-isolated ledger state.

## Architecture

1. Add `public/assets/personal-insights.js` as a deterministic, UI-independent engine.
2. Engine contract:
   - normalized structured facts in;
   - signals;
   - versioned rule registry;
   - personal baseline;
   - priority scoring/ranking;
   - grouped/deduplicated insight objects;
   - preferences/dismissal filtering;
   - admin status and weekly summary;
   - no direct DOM access;
   - no financial formulas that duplicate BOEKUNA source-of-truth calculations.
3. Add a BOEKUNA adapter in `kwinest/index.html` that converts authoritative app state/helpers into safe facts.
4. Do not pass processor OCR text, confidence payloads, supplier OCR candidates, or raw document analysis to the engine.
5. Persist only assistant UX state:
   - goals;
   - personal tips on/off;
   - weekly summary on/off;
   - hidden P2/P3 types;
   - dismissed insight keys;
   - feedback.
6. Recompute insights from current source state on every relevant render, so resolved conditions disappear automatically.
7. Critical P0/P1 insights cannot be permanently hidden.

## Initial production rule set

Invoices:
- grouped overdue invoices;
- nearly due invoices;
- high outstanding only when the threshold is explainable from existing facts/history.

Documents:
- review required;
- failed processing;
- unresolved validated document work that can affect accounting/VAT, without reading raw OCR facts.

Bank:
- grouped unmatched transactions;
- existing probable match suggestions only; never invent a match.

VAT:
- current reserve/status copied from existing BOEKUNA VAT calculation;
- unresolved document warning, with no independent VAT recomputation.

Costs:
- significant monthly cost spike after cold-start minimum history;
- category spike after minimum history;
- recurring supplier pattern based on normalized stored supplier/vendor facts.

Administration:
- up to date / nearly up to date / attention needed;
- month wrap-up checklist from existing states.

## Baseline rules

- Require at least 3 complete comparable historical monthly periods for trend claims.
- Cost spike requires both relative and absolute impact.
- Initial central threshold: +30% and at least EUR 100 absolute difference.
- Category spike uses the same dual guard with a smaller centrally configured absolute floor only if fixture evidence supports it.
- No trend claims for new/cold-start tenants.

## Priority

- P0 = blocking financial/document consistency issue.
- P1 = action required.
- P2 = meaningful observation.
- P3 = tip.
- Dashboard renders at most 1 primary + 2 secondary insights.
- Goals can rerank P2/P3, never suppress financial safety.

## Lifecycle

- Insight IDs are deterministic from rule/type + grouped source IDs/period.
- ACTIVE is derived from current facts.
- When source facts resolve, the insight disappears/resolves automatically.
- DISMISSED is stored only for allowed P2/P3 insights.
- EXPIRED is applied to time-bounded tips/near-due conditions by reevaluation.
- No persistent copy of amounts/tax truth.

## UI

- Keep the existing BOEKUNA Calm Control visual language.
- Dashboard section becomes `Voor jou` with at most 3 relevant items.
- Add a `Voor jou` page to sidebar; mobile keeps the existing bottom navigation and reaches the page through the drawer/More.
- Add insight detail with:
  - Wat zien we?
  - Waarom zie je dit?
  - Wat kun je doen?
- Add settings section `Assistent & inzichten`.
- Plain Dutch only; no AI gradients, sparkles, chat bubbles or tax-advice language.
- All action targets are existing internal routes/filters and revalidate before mutation/navigation.

## TDD / QA

RED first:
- unit contract tests for engine loading and rule behavior;
- overdue grouping + partial payment;
- cold start;
- cost spike positive/negative/boundary;
- priority ordering;
- deduplication;
- dismissal safety;
- resolution by recomputation;
- foreign VAT/mixed VAT pass-through safety;
- bank suggestion only from existing suggestion facts.

GREEN:
- minimal engine and adapter implementation;
- dashboard / Voor jou / settings integration;
- persistence in current ledger state.

Browser:
- Chromium + WebKit;
- widths 320, 360, 375, 390, 393, 412, 430, 1024, 1280, 1366, 1440, 1920;
- no overflow;
- 44px mobile touch targets;
- keyboard and Axe;
- screenshots: dashboard desktop/mobile, Voor jou desktop/mobile, detail, settings, empty, blocking, multiple.

Regression:
- document review beginner UX;
- document processing;
- mixed VAT;
- foreign VAT;
- advance/outstanding;
- invoice calculations/payments/partial payments/credit notes;
- tenant isolation;
- invoice PDF/email;
- production integrity.

## Release gate

Before final QA:
1. fetch latest main;
2. if OCR V4 advanced, sync assistant branch onto newest main without overwriting OCR logic;
3. rerun both assistant and OCR/document/financial regression suites;
4. freeze exact HEAD;
5. independent review of exact HEAD;
6. merge only when all required checks pass;
7. deploy only app/backend components actually changed (processor must remain untouched);
8. production smoke on https://app.boekuna.nl with non-destructive QA evidence where authorization permits.

Expected PR metadata:
- AI_ENABLED: NO
- FINANCIAL_ENGINE_CHANGED: NO
- OCR_CHANGED: NO
- STRIPE_CHANGED: NO
- MARKETING_CHANGED: NO
- GOOGLE_LOGIN_ENABLED: NO
- GMAIL_OAUTH_ENABLED: NO
