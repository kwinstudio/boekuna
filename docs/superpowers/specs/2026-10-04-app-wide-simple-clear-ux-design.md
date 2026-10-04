# BOEKUNA App-Wide Simple & Clear UX — Design Spec

**Date:** 2026-10-04  
**Branch:** `ux-app-wide-simple-clear-20261004`  
**Source of truth:** `main` @ `7e7487409b7ce8d2de8bddb74db11ed488eea3d3`  
**Repository:** `kwinstudio/boekuna`  
**Production app:** `https://app.boekuna.nl`  
**Marketing site:** `https://boekuna.nl`

## 1. Goal

Make the BOEKUNA application feel as simple, calm and obvious as the approved invoice-check mockups without weakening accounting correctness or replacing the existing product architecture.

The experience should consistently follow:

```
see what matters
→ understand the next action
→ complete the action
→ clear success
```

For document intake:

```
upload
→ check only what matters
→ save
→ done
```

The product must work for a beginner who does not want to learn bookkeeping software terminology.

## 2. Approved product principles

1. **Show only what matters now.** Secondary information remains available but does not dominate the primary workflow.
2. **One primary action per screen or task state.** Secondary actions are visually quieter.
3. **Progressive disclosure.** Essential first, optional later, advanced only when relevant.
4. **Five-second comprehension.** A new user should quickly understand where they are, what matters and what to do next.
5. **Numbers and status over explanation.** Prefer concise amounts, dates and states over instructional paragraphs.
6. **Desktop gets more room, not more complexity.**
7. **Mobile is the primary acceptance surface.**
8. **Financial safety is never simplified away.**
9. **Existing authoritative state remains authoritative.** The UX layer does not invent a second financial/document/assistant truth.
10. **Calm Control remains the BOEKUNA visual language.** This is a simplification and consolidation, not a rebrand.

## 3. Existing architecture discovered during audit

The app already contains several simplification layers:

- `kwinest/index.html` contains the primary renderers, state, handlers and much of the app shell.
- `public/assets/brand-v2.css` contains the current Calm Control / premium visual treatment.
- `public/assets/mobile-product.css` and `public/assets/mobile-product.js` contain mobile-only adaptations.
- `kwinest/app-assets/document-review-v2.js` and `.css` contain the current beginner-first two-screen document review.
- `public/assets/personal-insights-ui.js` and related assistant files contain Personal Assistant presentation.
- Prior simplification work already exists in:
  - `docs/superpowers/specs/2026-09-30-premium-app-simplification-design.md`
  - `docs/mobile-product-20261003.md`
  - Personal Assistant V1.2 spec/plan.
- Current `main` already includes:
  - Premium simplification work.
  - Complete mobile product work.
  - PR #173 two-screen document review.
  - Personal Assistant V1.2.
- One unrelated open PR exists for Google sign-in / Gmail integration hardening. This UX work must not absorb it.

### Design consequence

Do **not** create another broad override layer such as `simple-clear-v3.css/js`.

Instead:

- simplify existing render output;
- consolidate shared visual language in `brand-v2.css`;
- keep `mobile-product.*` limited to genuinely mobile-specific adaptation;
- keep document review and assistant as specialized protected surfaces;
- remove duplicate visual logic where the same pattern can live in the core design language.

## 4. Hard boundaries

This project does not change business semantics unless a later explicit requirement proves it unavoidable.

### Must not change

- OCR models.
- OCR preprocessing.
- document classification.
- document extraction.
- documentprocessor.
- scanner benchmark logic.
- financial calculation helpers.
- two-of-three financial correction rules.
- mixed VAT arithmetic.
- historical VAT handling.
- foreign VAT handling.
- reverse-charge logic.
- credit note semantics.
- invoice numbering.
- payment math.
- Stripe entitlement logic.
- Early Access logic.
- tenant isolation.
- RLS.
- auth/session semantics.
- Personal Assistant rules, signal engine, baselines or source-of-truth logic.
- marketing-site design.
- Google/Gmail behavior.
- production data.

### Boundary flags

Expected default:

- `OCR_CHANGED: NO`
- `DOCUMENTPROCESSOR_CHANGED: NO`
- `FINANCIAL_ENGINE_CHANGED: NO`
- `PERSONAL_ASSISTANT_CHANGED: NO`
- `STRIPE_LOGIC_CHANGED: NO`
- `MARKETING_CHANGED: NO`

If any flag must become YES, the work stops for an explicit design reassessment.

## 5. Information architecture

### Layer 1 — always visible

- screen title;
- primary amount/status;
- one primary action;
- compact filters needed to finish the task;
- real actionable warning;
- essential identity/date information.

### Layer 2 — on demand

- secondary metrics;
- extra metadata;
- optional fields;
- detailed breakdowns;
- original document preview on mobile;
- edit/correction controls when not immediately needed.

### Layer 3 — settings/help/audit

- technical implementation detail;
- OCR confidence and extraction detail;
- product infrastructure explanation;
- audit/diagnostic information;
- advanced configuration.

## 6. Shared visual system

The supplied invoice-check mockups define the target feel.

### Surfaces

- white primary canvas;
- very light neutral/green-tinted app background where already part of BOEKUNA;
- subtle 1px borders;
- restrained shadows;
- 12–18px radii;
- generous space between sections;
- less nested-card density.

### Typography

- strong page title;
- short supporting line only when it adds meaning;
- section titles clearly below page title;
- financial amount has highest visual weight inside financial summaries;
- helper copy muted and brief.

### Actions

- one dominant primary button;
- secondary button neutral;
- tertiary action as text/link/menu where appropriate;
- minimum 44px touch targets.

### Color

Use current BOEKUNA tokens.

Color is semantic:

- primary brand: current key action/navigation color;
- success: complete/paid/safe;
- warning: attention/review;
- error: blocked/failed/overdue;
- no decorative rainbow of statuses.

### Motion

- 150–250ms where helpful;
- step transitions, sheets, success confirmation;
- respect `prefers-reduced-motion`;
- no decorative 3D in the bookkeeping app.

## 7. Core reusable presentation patterns

These are presentation contracts, not a new framework.

- `PageHeader`
- `PrimaryAction`
- `KpiStrip`
- `SummaryCard`
- `SimpleList`
- `StatusBadge`
- `FormSection`
- `StickyActionBar`
- `SuccessState`
- `EmptyState`
- `WarningCard`
- `StepIndicator`
- `DocumentPreview`

Implementation should reuse existing markup/helpers where possible instead of introducing duplicate abstractions.

## 8. Screen matrix

| Screen | Primary user goal | Primary action | Always show | Hide / defer |
|---|---|---|---|---|
| Dashboard | understand today | action from `Voor jou` when needed | five authoritative KPIs, max few attention items | secondary detail, lower-priority explanation |
| Facturen | see/open/create invoice | Nieuwe factuur | customer, number, date, amount, status | secondary metadata/actions |
| Nieuwe factuur | create invoice | Factuur afronden / opslaan | customer, lines, totals | advanced invoice options |
| Factuurdetail | understand invoice state | state-dependent action | customer, amount, status, number | PDF/download/duplicate/credit/delete |
| Kosten | add/review expense | Bon toevoegen | supplier, date, category, total, status | technical OCR/detail |
| Bon/factuur review | validate document | Volgende / Opslaan | only current step fields | optional bookkeeping fields |
| Documenten | work through document state | Controleren / Uploaden | document, date, amount if known, status | OCR internals, archive detail |
| Relaties | find/use customer or supplier | Nieuwe relatie | name, type, useful contact detail | bookkeeping identifiers |
| Relatiedetail | maintain usable relation | Opslaan | primary business/contact fields | advanced identifiers |
| Rapportages | understand performance | PDF / relevant export | omzet, kosten, winst, one chart question | duplicate metrics/detail |
| Btw | understand VAT position | period selection / relevant next action | position, period, indicative status | technical calculation narrative |
| Controlecentrum | fix exceptions | row-specific fix | prioritized worklist | readiness/audit explanation |
| Instellingen | find category | open category | category rows | full forms until category opened |
| Bedrijfsgegevens | make company usable | Opslaan | essential company data | optional data |
| Billing | understand plan | plan/account action | plan, state, renewal/expiry facts | provider implementation detail |
| Onboarding | start using BOEKUNA | continue | minimum account/company essentials | optional profile fields |
| Assistant / Voor jou | understand what needs attention | safe deep link/action | max few useful insights | raw rules/signals |

## 9. P0 design — daily administration

### Dashboard

Preserve Personal Assistant V1.2 authoritative five-KPI model.

Hierarchy:

1. greeting;
2. primary KPI emphasis on Winst;
3. four supporting compact KPIs;
4. `Voor jou` with maximum useful attention items;
5. lower-priority summaries/charts only after primary tasks.

Do not reintroduce generic smart/marketing cards.

### Invoices overview

Header:

- `Facturen`;
- one short meaningful subline if needed;
- primary `Nieuwe factuur`;
- upload remains secondary.

Compact KPIs:

- Openstaand;
- Betaald deze maand;
- Te laat.

List prioritizes:

- customer;
- invoice number;
- date;
- amount;
- simple status.

Secondary actions move behind an actions menu.

### New invoice

Flow is task-first:

1. customer;
2. invoice lines;
3. totals / finish.

Advanced options stay collapsed by default:

- tax treatment;
- service/supply date;
- customer reference/PO;
- payment reference;
- other non-routine settings.

No existing validation or finalization requirements are removed.

### Invoice detail

Top summary:

- customer;
- total;
- status;
- invoice number.

Primary action depends on state:

- draft → `Factuur afronden`;
- final but unsent → `Versturen`;
- sent/open → `Markeer als betaald`;
- paid → no oversized primary action.

Secondary:

- PDF;
- download;
- duplicate;
- credit note;
- delete where permitted.

### Expenses

Primary action: `Bon toevoegen`.

Secondary: `Kosten boeken`.

List prioritizes:

- supplier;
- date;
- category;
- total;
- status.

### Document review

The current two-screen review is protected.

Receipt step 1:

- supplier;
- date;
- category.

Invoice step 1:

- supplier/customer;
- date;
- invoice number.

Step 2:

- gross total;
- VAT amount;
- VAT rate / VAT split.

Net amount appears only when correction is required.

Recognized optional data remains preserved in the save flow but is not forced into the primary review.

Duplicate, anomaly, mixed VAT, foreign VAT and other genuine financial exceptions remain blocking/contextual where currently authoritative.

## 10. P1 design — review and understanding

### Documents

Make the screen a worklist.

Primary groupings:

- Controle nodig;
- Wordt verwerkt;
- Klaar;
- Alle documenten.

Each item should prioritize:

- file/supplier;
- date;
- amount where known;
- human status;
- relevant action.

Do not surface OCR confidence or technical pipeline terms in the primary list.

### Contacts

Overview prioritizes:

- company/person name;
- customer/supplier type;
- useful contact information;
- optional open amount where genuinely useful.

Identifiers such as VAT ID, KVK and IBAN move to detail/secondary presentation.

KVK lookup remains available.

### Reports

Primary concepts:

- Omzet;
- Kosten;
- Winst;
- relevant VAT/receivable context only when needed.

Each chart answers one question. Avoid dashboard-like repetition inside reports.

### VAT

Preserve:

- exact authoritative calculation;
- period selector;
- KOR behavior;
- `Indicatief`;
- explicit not-submitted meaning.

Reduce duplicated instructions and make the payable/refundable amount the visual focus.

### Control center

One prioritized exception worklist.

Retain filtering/search only where it helps find actionable items.

Audit/readiness information moves lower or behind secondary disclosure.

## 11. P2 design — settings and secondary workflows

### Settings

Mobile and desktop start with categories:

- Bedrijf;
- Facturen;
- Belasting & btw;
- Betalingen;
- Abonnement;
- Beveiliging;
- Account & gegevens.

Opening a category reveals only that category.

### Company profile

Essential fields first.

Use calm sections rather than a wall of cards.

Missing fields required to finalize invoices remain clearly identified.

Optional fields do not block ordinary use.

### Billing

Presentation can be simplified.

Do not change Stripe, entitlement, Early Access or checkout semantics.

### Onboarding

Minimal route:

```
account
→ company basics
→ first meaningful action
```

Optional profile completion happens later unless legally/functionally required.

## 12. Mobile contract

Test at minimum:

- 320 × 844;
- 360 × 844;
- 375 × 844;
- 390 × 844;
- 393 × 852;
- 412 × 915;
- 430 × 932.

Normal daily tasks must avoid:

- horizontal scroll;
- hidden primary CTA;
- large compulsory forms;
- unnecessary backtracking;
- desktop-only hover behavior.

Use sticky bottom actions when useful.

Respect:

`env(safe-area-inset-bottom)`.

The on-screen keyboard must not make the primary action impossible to reach.

## 13. Desktop contract

Test at minimum:

- 1280 × 800;
- 1440 × 900;
- 1728 × 1117.

Desktop:

- keeps sidebar/navigation behavior;
- uses sensible max widths;
- does not stretch forms across huge widths;
- may show preview/context beside current task;
- does not reveal extra complexity solely because space exists.

## 14. Accessibility

Target WCAG AA where practical.

Required checks:

- semantic headings;
- explicit labels;
- keyboard access;
- visible focus;
- modal/dialog focus handling;
- status/error announcements;
- minimum touch targets;
- contrast;
- reduced motion;
- Axe on representative screens and critical flows.

## 15. Data and action flow

No new state layer is introduced.

Existing pattern remains:

```
authoritative domain state
→ existing helpers / calculations
→ renderer / presentation adapter
→ simplified UI
→ existing handler
→ existing validation
→ existing persistence
```

For documents:

```
document intelligence
→ validated document state
→ simple review UI
→ existing financial validation
→ accounting state
```

For assistant:

```
authoritative BOEKUNA state
→ assistant facts/rules
→ personal insights
→ simplified presentation
```

## 16. Error, warning, success and empty states

### Error

Format:

- what went wrong;
- what the user can do next.

Do not expose internal codes as user copy.

### Warning

Show one concrete issue per warning surface where possible.

Example:

`Controleer het btw-bedrag`

not:

`Confidence 64%`.

### Success

After important workflows show a clear done state:

- Factuur opgeslagen;
- Bon verwerkt;
- Relatie toegevoegd;
- Factuur verzonden.

Include a short summary and at most:

- one primary next action;
- one quiet secondary action.

### Empty

No empty table-only states.

Format:

- plain explanation;
- one obvious action.

## 17. Implementation waves

This design deliberately uses serial waves to reduce cross-workstream risk.

### Wave 1 — P0

- dashboard;
- invoices overview;
- invoice create/edit;
- invoice detail/actions;
- expenses;
- document review visual alignment only where needed;
- shared app primitives/tokens required by these screens.

### Wave 2 — P1

Starts from current `main` after Wave 1 merge.

- documents;
- contacts;
- reports;
- VAT;
- control center;
- related shared visual patterns.

### Wave 3 — P2

Starts from current `main` after Wave 2 merge.

- settings;
- company profile;
- billing presentation;
- onboarding;
- success/empty/error harmonization across remaining secondary screens.

Each wave must be releasable software on its own.

## 18. Testing strategy

TDD applies to critical behavior and UX contracts.

### New app-wide UX contracts

Add browser regression coverage for:

- one dominant primary CTA in normal task states;
- no optional-field overload in critical forms;
- no global horizontal overflow;
- sticky/reachable mobile action where required;
- concise empty/success/error states;
- secondary detail not visible by default where specified;
- financial blockers still block;
- document review remains two-screen;
- hidden recognized document fields survive save;
- Assistant authoritative states remain unchanged;
- marketing output remains isolated.

### Existing release gates remain authoritative

At minimum retain:

- product UI reference tests;
- premium simplification tests;
- app-wide premium simplification tests;
- complete mobile product tests;
- mobile-desktop freeze tests where applicable;
- document review beginner UX;
- document upload/background processing;
- document integrity;
- smart financial correction;
- invoice delivery;
- auth/session;
- tenant isolation;
- production integrity;
- split-surface/marketing isolation.

Run Chromium and WebKit for critical browser suites.

Firefox may be added where existing harness makes it practical, but it is not allowed to replace WebKit.

## 19. Branching and integration

Do not implement all three waves in one giant PR.

Preferred sequence:

1. create Wave 1 branch from then-current `main`;
2. TDD + implementation + QA;
3. code review;
4. PR;
5. merge only on green release gates;
6. production verification;
7. create Wave 2 from updated `main`;
8. repeat;
9. create Wave 3 from updated `main`;
10. repeat.

Use expected HEAD SHA guards for merge where available.

Do not merge or modify the unrelated Google/Gmail PR as part of this work.

## 20. Deployment and production verification

Use the existing production pipeline.

Do not create a new hosting project or deployment architecture.

After each wave:

- verify deployment identity/build;
- verify actual new UI signatures, not only HTTP 200;
- inspect core pages;
- verify no JS console errors where tooling permits;
- verify mobile navigation;
- verify desktop navigation;
- verify marketing-site non-regression;
- do not create real customer/accounting data solely for QA.

If deployment tooling requires account/workspace selection, do not guess the target workspace.

## 21. Definition of done

The project is not complete because screens look cleaner.

It is complete when:

- a beginner can identify the next action quickly;
- ordinary tasks expose only essential information;
- secondary data remains reachable;
- financial/document safety remains intact;
- mobile workflows are usable without layout friction;
- desktop remains clear without becoming denser;
- app-wide presentation is consistent;
- no duplicate broad UX layer has been added;
- each wave has passed its release gates and production verification.

The intended BOEKUNA experience is:

> Dit is wat ik al weet.  
> Controleer alleen wat nodig is.  
> Alles klopt.  
> Klaar.
