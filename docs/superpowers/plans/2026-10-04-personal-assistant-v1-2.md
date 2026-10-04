# BOEKUNA Personal Assistant V1.2 — Implementation Plan

Date: 2026-10-04
Spec: `docs/superpowers/specs/2026-10-04-personal-assistant-v1-2-design.md`
Branch: `01/personal-assistant-v1-2-character-kpi-qna`
Base: `d5dcf5b8ba8ec27b082e31b4807665f1aae55310`

## File map

### New
- `public/assets/personal-assistant-qna.js` — pure deterministic intent router, curated beginner knowledge, dynamic suggestions and safe answer model.
- `tests/personal-assistant-v1-2.test.mjs` — unit/contract TDD for Q&A, KPI-source contracts and safety.
- `tests/personal-assistant-v1-2-browser.test.mjs` — production-build Chromium/WebKit, responsive, Axe, dashboard hierarchy, Ask Boekuna and deep-link QA.
- `docs/engineering/personal-assistant-v1-2-open-source-evaluation.md` — current OSS/license decision record.

### Modify
- `kwinest/index.html` — authoritative KPI view model, fifth KPI, compact hierarchy and safe Q&A fact adapter.
- `public/assets/personal-insights-ui.js` — Ask Boekuna modal/sheet presentation and dynamic suggestions.
- `public/assets/personal-insights.css` — compact KPI/assistant responsive presentation only.
- `scripts/build-app.mjs` — ship Q&A asset and cache-bust assistant assets.
- `.github/workflows/boekuna-app.yml` — run V1.2 unit/browser tests and include their evidence.
- `.github/workflows/boekuna-document-integrity.yml` — trigger document-integrity for the new assistant module/tests without modifying document-review logic.

### Must remain byte-unmodified by this PR
- `public/assets/document-review-v2.js`
- `public/assets/document-review-v2.css`
- `kwinest/app-assets/document-review-v2.js`
- `kwinest/app-assets/document-review-v2.css`
- `kwinest/docprocessor/**`

## Task 1 — RED: Q&A contracts

Create `tests/personal-assistant-v1-2.test.mjs` first.

Prove failure before production module exists for:
1. AI disabled and no network/DOM/database access contract.
2. intent routing for all required personal questions.
3. educational knowledge coverage.
4. unsupported fallback.
5. financial-unreliable fail-safe.
6. dynamic suggestions for overdue, cost spike, VAT uncertainty, document attention, bank attention, cold start and all-clear.
7. goal reranking changes order only, not facts.
8. bounded question length and safe plain-text output.
9. action targets come only from the fixed internal allowlist.

Run:
`node tests/personal-assistant-v1-2.test.mjs`

Expected RED reason: module missing / required exports absent.

Commit test only.

## Task 2 — GREEN: Pure deterministic Q&A module

Create `public/assets/personal-assistant-qna.js`.

Public API:
- `BoekunaAssistantQna.AI_ENABLED === false`
- `routeIntent(question)`
- `suggestQuestions(facts, insights, preferences)`
- `answer(question, facts, options)`
- `knowledgeTopics()`
- `sanitizeActionTarget(target)`

Answer object:
```js
{
  intent,
  state,
  title,
  answer,
  detail,
  actionLabel,
  actionTarget,
  supported
}
```

No I/O and no arbitrary execution.

Run unit test until GREEN.

Commit module.

## Task 3 — RED: Authoritative KPI view-model contract

Extend `tests/personal-assistant-v1-2.test.mjs` with source assertions against `kwinest/index.html`:

- one `dashboardKpiViewModel()`/equivalent selector;
- dashboard consumes that selector;
- five named KPIs;
- receivables derive from `invoiceOutstanding()`;
- revenue uses current invoice semantics and excludes cancelled invoices;
- VAT derives from current existing helpers;
- no action/problem KPI added;
- existing #166 cancelled-invoice regression remains present.

Run and confirm RED.

## Task 4 — GREEN: KPI selector and dashboard hierarchy

Modify `kwinest/index.html` minimally.

Add:
- one KPI view model;
- helper for safe prior-comparison only if comparable data exists;
- fifth KPI “Nog te ontvangen”;
- subtle overdue context inside that KPI;
- existing “Nog te ontvangen” summary duplication removed/replaced by useful non-duplicate supporting action;
- a Q&A fact adapter that passes structured values only.

Desktop:
- primary Winst;
- four supporting KPI cards.

Mobile:
- primary Winst full-width/primary;
- secondary KPI cards compact 2-column where width permits;
- “Voor jou” follows without excessive scroll.

Do not modify document-review code.

Run unit/source contracts and existing production integrity.

## Task 5 — RED: Browser Q&A and UX

Create `tests/personal-assistant-v1-2-browser.test.mjs` before UI production changes.

Fixture scenarios:
- all-clear;
- overdue;
- cost spike;
- VAT unresolved document;
- partial payment;
- cold start;
- unreliable source.

Assertions:
- “Vraag Boekuna” entry exists;
- modal/sheet opens;
- dynamic suggested questions reflect fixture state;
- personal answer uses exact authoritative facts;
- educational answer works;
- unsupported fallback works;
- no hallucinated amount;
- user question is not inserted as unsafe HTML;
- action target opens existing route;
- document attention routes to documents/result-first journey;
- 44px mobile targets;
- keyboard focus/close;
- Axe zero violations;
- no horizontal overflow at required widths;
- dashboard five-KPI hierarchy and no duplicate “Nog te ontvangen” summary.

Run Chromium first and confirm RED because UI is absent.

## Task 6 — GREEN: Ask Boekuna presentation

Modify `personal-insights-ui.js` and `personal-insights.css`.

Add:
- “Vraag Boekuna” entry within assistant surfaces;
- modal/sheet using existing `modal()`;
- input with max length;
- dynamic prompt buttons;
- live answer region;
- one optional safe CTA;
- privacy-safe aggregate metrics only;
- calm/attention/action/insight/uncertain/explaining state presentation.

Keep UI small and consistent with Calm Control.

Run Chromium, then WebKit and Axe.

## Task 7 — Build integration

Modify `scripts/build-app.mjs`:
- copy/inject Q&A script before assistant UI runtime;
- bump assistant cache keys;
- preserve #170 app-only document assets untouched.

Modify workflows:
- app workflow paths + unit/browser test steps;
- document integrity path trigger only for new assistant module/test changes;
- add screenshot artifact directory.

Run split/build-boundary tests.

## Task 8 — Security/privacy and open-source record

Create `docs/engineering/personal-assistant-v1-2-open-source-evaluation.md` with current 2026-10-04 repository status and license decisions.

Verify:
- no new dependency;
- no raw SQL;
- no raw OCR;
- no cross-tenant learning;
- no user-question analytics content;
- no unsafe HTML;
- fixed route allowlist;
- oversized question handling.

Run:
- tenant isolation;
- production integrity;
- cloud serialization;
- personal assistant tests.

## Task 9 — Full regression and exact-head QA

Run/require CI:
- Boekuna app tests;
- Boekuna document integrity;
- Chromium;
- WebKit;
- Axe;
- personal assistant V1.2 unit/browser;
- financial regressions;
- document review regressions;
- tenant isolation.

Inspect screenshots for:
- desktop/mobile all clear;
- desktop/mobile attention;
- Ask Boekuna desktop/mobile;
- educational/personal/insufficient-data answers;
- Voor jou.

Freeze HEAD only after all green.

## Task 10 — Exact-head review and main sync

Before PR finalization:
- fetch current main;
- compare;
- merge latest main deliberately if it advanced;
- confirm no V1.2 change to document-review-v2 files;
- rerun gates on the synced HEAD.

Review focus:
- financial truth;
- duplication;
- assistant overtalking;
- personal tax advice;
- hallucination;
- XSS;
- tenant leakage;
- source failure;
- mobile density;
- deep links;
- license record.

## Task 11 — PR, merge and release

Create dedicated PR with metadata:

```
AI_ENABLED: NO
FINANCIAL_ENGINE_CHANGED: NO
OCR_CHANGED: NO
DOCUMENT_REVIEW_CHANGED_BY_THIS_PR: NO
MARKETING_CHANGED: NO
NEW_DEPENDENCIES: NONE
```

Merge only exact green HEAD.

Deploy only Render app service:
`srv-dauebj1srm7s73bubcog`

Do not deploy:
- OCR processor;
- marketing;
- unrelated backend.

Production verification must be non-destructive and must not use real customer administration mutations.

