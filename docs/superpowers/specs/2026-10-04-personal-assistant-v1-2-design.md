# BOEKUNA Personal Assistant V1.2 — Design Spec

Date: 2026-10-04
Branch: `01/personal-assistant-v1-2-character-kpi-qna`
Base main: `d5dcf5b8ba8ec27b082e31b4807665f1aae55310`

## 1. Goal

Extend the existing BOEKUNA Personal Assistant without creating a second assistant. V1.2 must help a beginner answer, within seconds:

- what do I keep;
- what did I earn;
- what did I spend;
- how much VAT should I reserve;
- what still needs to come in;
- whether anything needs attention;
- what an accounting term means.

The assistant remains a quiet support layer. The dashboard remains the primary product surface.

## 2. Non-goals and hard boundaries

This workstream does not change:

- document processor, OCR models, OCR extraction, OCR confidence or scanner benchmarks;
- `document-review-v2.js` / `document-review-v2.css` or the result-first review implementation merged through PR #170;
- Stripe, billing, invoice numbering, Google login, Gmail OAuth or marketing;
- the authoritative financial formulas.

External generative AI remains disabled. No new database table is required. No new runtime dependency is introduced.

## 3. Personality contract

Internal contract:

> Een rustige, scherpe administratieve copiloot die meekijkt, alleen spreekt wanneer dat nuttig is, gewone taal gebruikt en nooit gokt met financiële waarheid.

Supported presentation states:

- CALM — nothing requires action;
- ATTENTION — something should be checked;
- ACTION — there is a concrete task;
- INSIGHT — a meaningful pattern is visible;
- UNCERTAIN — source state is incomplete or unreliable;
- EXPLAINING — beginner explanation of an accounting concept.

Copy is calm, plain Dutch and non-judgmental. The assistant must never manufacture reassurance when a financial source is unreliable.

## 4. Architecture

Existing path stays intact:

```
authoritative BOEKUNA state
→ safe fact adapter
→ personal baseline
→ deterministic signal/rule engine
→ priority engine
→ insights
→ assistant presentation
```

V1.2 adds:

```
authoritative BOEKUNA state/helpers
→ KPI view model
→ dashboard KPI cards

user question
→ deterministic intent router
→ safe personal selector OR curated knowledge
→ deterministic answer model
→ assistant presentation
```

New focused module:

- `public/assets/personal-assistant-qna.js`
  - pure browser-safe module;
  - no DOM access;
  - no network access;
  - no DB access;
  - no financial calculations from raw records;
  - curated beginner knowledge;
  - deterministic intent routing;
  - dynamic suggested questions;
  - safe fallback;
  - answer objects with optional existing internal action targets.

Existing `personal-insights-ui.js` owns the modal/sheet presentation and integration with existing navigation.

## 5. Authoritative KPI view model

Add one app-owned selector that uses the same existing helpers as reports/invoices/VAT:

```js
{
  reliable,
  period: { preset, from, to, label },
  profit,
  revenue,
  costs,
  vatReserve,
  vatUncertain,
  vatUnresolvedDocumentCount,
  receivables,
  overdueReceivables,
  overdueInvoiceCount,
  comparisons
}
```

Rules:

- profit = authoritative revenue minus authoritative accounting costs;
- cancelled invoices are excluded using current invoice semantics;
- receivables use `invoiceOutstanding()`, therefore partial payments are already respected;
- credit behavior follows existing helpers and is not recreated;
- VAT uses existing VAT helpers/current VAT period logic;
- comparisons remain null unless periods are genuinely comparable and reliable;
- no UI component independently recomputes these values.

## 6. Five KPI hierarchy

Exactly five core financial KPI concepts:

1. Winst
2. Omzet
3. Kosten
4. Btw apartzetten
5. Nog te ontvangen

Actions/problems are not KPIs.

Desktop:
- Winst is visually primary.
- Four supporting KPIs stay compact.
- “Voor jou” follows the KPI strip before lower-priority dashboard detail.

Mobile:
- Winst remains the primary card.
- Four secondary KPIs are compact.
- “Voor jou” must appear without forcing a long KPI scroll.

Each KPI has at most label, value, one context line and an existing safe navigation target.

## 7. Q&A intents

Minimum deterministic personal intents:

- GET_CURRENT_STATUS
- GET_TODAY_ACTIONS
- GET_OVERDUE_INVOICES
- GET_OUTSTANDING_TOTAL
- GET_VAT_STATUS
- EXPLAIN_VAT_STATUS
- GET_COST_CHANGE
- GET_CURRENT_PROFIT
- GET_CURRENT_COSTS
- GET_DOCUMENT_ATTENTION
- GET_BANK_ATTENTION
- EXPLAIN_TERM
- UNSUPPORTED

Natural-language routing uses normalization and explicit phrase/topic patterns. It never generates SQL, routes or selectors from arbitrary input.

## 8. Safe personal facts

The Q&A module receives only the values needed to answer supported intents:

- source reliability;
- selected/current period label;
- revenue, costs, profit;
- VAT reserve and unresolved-document count;
- total receivables and overdue receivables;
- overdue count and a bounded list of overdue invoice facts needed for a user-facing answer;
- document review count;
- unmatched bank count;
- administration state;
- existing baseline/cost-spike insight facts when available.

No raw OCR text, IBAN, invoice body, document extraction candidates or arbitrary database rows enter the Q&A engine.

## 9. Curated beginner knowledge

Curated deterministic knowledge covers at least:

- omzet;
- kosten;
- winst;
- btw;
- voorbelasting;
- factuur;
- inkoopfactuur;
- creditnota;
- excl. btw;
- incl. btw;
- 21% btw;
- 9% btw;
- meerdere btw-tarieven;
- vervaldatum;
- openstaand;
- zakelijke kosten;
- bon bewaren;
- banktransactie koppelen;
- nog te ontvangen.

Knowledge entries contain an id, aliases, short answer, optional detail, related topics and safe limits. The system does not claim personal deductibility or legal/tax certainty.

## 10. Dynamic suggested questions

Suggestions derive from current state, not a global static list.

Examples:
- overdue → “Welke facturen zijn te laat?”
- cost spike → “Waarom zijn mijn kosten hoger?”
- VAT uncertainty → “Waarom kan mijn btw nog veranderen?”
- document review → “Zijn er bonnetjes die ik nog moet controleren?”
- unmatched bank → “Welke transacties moet ik nog koppelen?”
- all clear → “Hoe sta ik ervoor deze maand?” + educational suggestion
- cold start → “Wat is winst?” / “Wat is btw apartzetten?”

Goals may rerank suggestions but never change financial facts.

## 11. UI

Entry label: “Vraag Boekuna”.

Desktop:
- existing modal pattern;
- no floating overlay on financial tables;
- short answer, optional detail, optional one safe CTA;
- suggested questions shown as accessible buttons.

Mobile:
- same semantic component rendered as a lightweight near-full-width sheet/modal;
- 44px minimum question/CTA targets;
- answer remains short by default;
- no permanent chat history surface.

No robot mascot, AI gradient, sparkles or separate assistant brand.

## 12. Failure and safety states

If `financialReliable === false`:
- no financial reassurance;
- no “Alles bijgewerkt”;
- answer: current overview is temporarily not reliably available.

Unsupported question:
- state that Boekuna cannot answer it reliably;
- offer supported areas: btw, facturen, kosten, winst, bonnetjes, banktransacties.

Oversized/malformed questions:
- clamp input length;
- treat as unsupported;
- render as text only.

All answer text and user questions are escaped before HTML rendering.

## 13. Deep links

Only explicit internal targets from a fixed allowlist are accepted:
- reports;
- invoices with known status filters;
- expenses;
- vat;
- documents with known review status;
- bank with known unmatched status;
- insights.

Document attention always routes into the existing documents/result-first review journey. This PR never implements a second review UI.

## 14. Privacy and analytics

Tenant-local state remains the only source of personalization.

Allowed aggregate product metrics:
- assistant_opened;
- question_suggested;
- question_selected;
- supported_intent;
- unsupported_intent;
- insight_opened;
- action_clicked;
- helpful;
- not_relevant;
- kpi_opened.

Never log financial amounts, customer names, invoice numbers, IBANs, questions verbatim or OCR text.

## 15. Open-source decision

Current 2026-10-04 audit:

- Actual Budget — active, MIT: adopt patterns/reference only.
- json-rules-engine — active, ISC: keep existing lighter deterministic engine.
- assistant-ui — active, MIT: UX reference only; no React/runtime adoption.
- CopilotKit — active, MIT: architecture/UX reference only; no LLM-driven financial state.
- Novu — active/open-core: deferred; no multi-channel need in V1.2.
- Trigger.dev — active, Apache-2.0: deferred; current in-process/Supabase model is sufficient.
- Firefly III — active, AGPL-3.0: reference only.
- Maybe Finance — archived, AGPL-3.0: reference only.
- Akaunting — no code reuse for commercial accounting SaaS.
- Invoice Ninja — no code reuse due hosted-service license constraints.

New production dependencies: none.

## 16. Tests and acceptance

TDD first.

Unit:
- intent routing;
- personal answers;
- educational answers;
- unsupported fallback;
- no-hallucination / source-failure behavior;
- dynamic suggestions;
- cold start;
- goal reranking;
- question length/HTML safety.

Financial:
- KPI truth;
- partial payment €1,210 gross / €300 paid → €910 receivable;
- cancelled invoice excluded;
- credit semantics preserved;
- VAT uncertainty;
- cost-spike only with sufficient baseline.

Browser:
- Chromium + WebKit;
- 320, 360, 375, 390, 393, 412, 430;
- 1024, 1280, 1366, 1440, 1920;
- dashboard all-clear and attention;
- Ask Boekuna personal, educational and unsupported answers;
- keyboard;
- Axe;
- no horizontal overflow;
- document-attention deep link reaches current documents/result-first journey.

Regression:
- full app suite;
- document integrity;
- tenant isolation;
- production integrity;
- invoice delivery/persistence;
- current document review.

## 17. Release

Before PR/merge:
1. sync latest main;
2. prove no `document-review-v2.*` changes in V1.2 diff;
3. rerun app + document integrity gates;
4. exact-head review;
5. merge only on green exact HEAD;
6. deploy app service only;
7. verify production through non-destructive mechanisms available without altering real customer data.

