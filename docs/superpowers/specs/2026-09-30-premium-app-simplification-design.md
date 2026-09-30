# BOEKUNA Premium App Simplification — Design Spec

**Date:** 2026-09-30  
**Branch:** `feature/premium-app-simplification`  
**Source of truth:** `main` @ `6f8bef74a0fe8b9b93108e4e7fdb508520f3b3e3`

## Goal

Make the existing BOEKUNA app feel significantly calmer, more premium, and faster to scan by reducing permanent explanatory copy, simplifying visual hierarchy, reducing unnecessary card surfaces, and keeping only information needed for action, financial correctness, safety, or navigation.

The target experience is **quiet administration**: powerful software that feels simple.

## Non-goals

- No rewrite or framework migration.
- No navigation redesign beyond preserving the approved mobile bottom nav.
- No change to financial calculations, VAT semantics, auth, tenant isolation, document-processing semantics, invoice numbering, or storage.
- No marketing-site redesign.
- No new database or notification system.
- Do not merge Developer Mode work from PR #108 into this branch.

## Product principles

1. **Action before explanation.** If labels, layout, status, or interaction already explain the task, remove the paragraph.
2. **Progressive disclosure.** Permanent UI shows only current status, amount, date, and action. Product/technical explanation moves behind a compact secondary disclosure or to settings/help.
3. **One primary CTA per page.** Supporting actions remain secondary.
4. **Numbers and statuses dominate.** Metrics should not need a paragraph underneath.
5. **Fewer cards.** Use cards only where they establish a real interaction or information boundary.
6. **Financial caveats remain when they prevent misinterpretation.** Shorten them, do not silently remove them.
7. **Premium = restraint.** Calm spacing, consistent typography, quiet surfaces, subtle borders, semantic color, minimal shadows.
8. **Mobile first; desktop preserved.** No global overflow, no content hidden behind fixed nav, no desktop regression.

## Information layers

### Layer 1 — always visible
- page title
- primary action
- current amounts / status / dates
- actionable warnings
- current attention items
- compact filters where needed

### Layer 2 — on demand
- secondary metrics
- explanatory notes
- detailed breakdowns
- implementation/product context
- audit/detail information

### Layer 3 — settings/help
- OCR explanation
- PSD2/open-banking explanation
- Peppol readiness explanation
- infrastructure/product-status detail
- backup/security implementation detail

## Content audit

| Screen | Keep | Shorten | Hide until needed | Remove from primary view | Premium UI change |
|---|---|---|---|---|---|
| Dashboard | greeting, attention, 4 KPIs, chart, recent invoices | attention descriptions | onboarding/profile detail only when incomplete | “Jouw administratie”, generic “bijna klaar”, 3 marketing-like smart cards, duplicate metric help | flatter KPI treatment, tighter attention rows, fewer cards |
| Facturen | title, filters, KPI row, table, create/upload | labels only | factuur-check explanation at validation time | header paragraph, permanent “Factuurcheck actief” notice | cleaner page head, table becomes dominant |
| Inkoop & kosten | title, upload/photo/camera/add, totals, table | metric labels | scanner explanation if user asks | header paragraph, repetitive metric subtitles | compact action cluster, quieter metrics |
| Bank & kas | title, import/add, processing count, transactions | “Geen live banksaldo” as small status | PSD2/open banking explanation | header paragraph, permanent PSD2 notice, unnecessary percentage emphasis if it crowds | compact metrics, table first |
| Documenten | title, upload/photo/camera, processing state, list | dropzone copy | OCR/technical explanation, archive explanation | long header paragraph, “upload complete...” permanent notice, technical OCR paragraph | status-first processor, minimal dropzone |
| Btw | title, year/quarter, VAT amounts, KOR warning, final caveat | “Indicatief · nog niet ingediend” | detailed explanation | duplicated instructional prose | calm financial summary, compact checklist |
| Controlecentrum | actionable exceptions and counts | item details | auditlog, e-invoice readiness | marketing-like smart cards and explanatory paragraphs | one prioritized worklist |
| Cashflow | forecast values, planning, personal reserve disclaimer | metric subtitles | explanatory context | marketing-like headline copy and repeated “not live bank” prose | quieter forecast strip + planning list |
| Boekingen | appointments, value, deposit/no-show state, actions | metric descriptions | rationale | “Waarom dit hier zit” explanatory block, header paragraph | task-oriented list |
| Relaties | title, list, add/edit | — | demo/help | “Klanten en leveranciers centraal beheren” | compact header |
| Diensten | title, list/form, add/edit | field help only when ambiguous | detailed invoicing explanation | “Sneller factureren”, long header paragraph | compact catalog |
| Uren & ritten | totals, tabs, add actions | metric subtitles | MVP explanation | generic header paragraph | flatter totals |
| Rapportages | period controls, key totals, exports, formal limitation | formal limitation | deeper report notes | generic explanatory copy and duplicate subtitles | stronger report hierarchy |
| Grootboek | trial balance, entries, balance warning | “automatisch afgeleid” to concise status | bookkeeping-layer explanation | generic long paragraph | dense accounting layout preserved |
| Bedrijfsgegevens | fields, missing requirements, save | section descriptions | optional field help | repeated instructions under every section | cleaner form groups |
| Instellingen | sections/actions | support/data descriptions | Productiestatus technical detail | generic header copy, infrastructure prose in primary flow | settings as compact sections |
| Quick menu | action names | one-line help only for ambiguous options | format/OCR detail | most descriptive help text | smaller, faster action picker |

## Dashboard target hierarchy

1. Greeting: `Goedemiddag, Kwin`
2. `Aandacht nodig` — compact rows, max 3
3. 4 core metrics: Omzet, Kosten, Resultaat, Btw
4. Compact omzet/kosten chart
5. Recent invoices
6. Mobile bottom nav

No marketing-like “Controlecentrum / Cashflow / Booking → boekhouding” cards on the daily dashboard.

## Copy rules

- Prefer 1–4 word labels.
- Prefer state + amount: `3 facturen vervallen`, `€850 open`.
- Never repeat a heading in its subtitle.
- Remove technical implementation terminology from daily flows.
- Retain finance/safety warnings only when the user could make a materially wrong decision without them.
- Empty states: one short sentence + one action.
- Error states: problem + retry/action, no explanatory paragraph.
- Use user/tenant data only through existing escaping and state boundaries.

## Visual system

Use existing Calm Control / `brand-v2.css` tokens.

### Typography
- Page title: clear and compact; no hero treatment.
- Section title: smaller than page title, strong weight.
- Metric value: highest visual weight inside data sections.
- Helper copy: muted and only when necessary.

### Surfaces
- Reduce nested white cards.
- Use sections/dividers for passive information.
- Reserve elevated cards for grouped interactive areas, attention states, modal/drawer layers, and financial summaries where separation is useful.

### Color
- Brand: active navigation / primary CTA.
- Success: paid/complete/clean.
- Warning: review/attention.
- Error: overdue/failure.
- No decorative status colors.

### Spacing
- Increase separation between sections, decrease padding within utility rows.
- Keep mobile above-the-fold compact enough to show greeting + attention + beginning of KPIs.

## Safety constraints

- Do not change `invoiceEffectiveStatus()`, VAT calculations, payment math, KOR semantics, credit logic, invoice numbering, or production integrity helpers.
- Do not remove the final “not submitted / indicative” meaning from VAT.
- Do not change auth/logout/session code.
- Do not change RLS/tenant behavior.
- Do not change document state semantics; only presentation and instructional copy.
- Dynamic user/account values continue to use existing escaping.
- Preserve all routes and actions.

## Files in scope

Primary:
- `kwinest/index.html` — render functions and visible UI copy.
- `public/assets/brand-v2.css` — premium density, surfaces, typography, responsive polish.
- `tests/premium-app-simplification.test.mjs` — new browser/content regression.
- `.github/workflows/boekuna-app.yml` — include new regression test and visual artifacts.

Existing suites remain authoritative:
- `tests/browser-smoke.test.mjs`
- `tests/mobile-app-layout.test.mjs`
- document/auth/list/invoice/cloud/tenant/financial/delivery suites.

## Acceptance criteria

1. Primary screens contain substantially less permanent explanatory copy while all actions remain available.
2. Dashboard no longer contains the smart marketing cards or redundant generic status copy.
3. Facturen, Bank, Documenten, Controlecentrum and Settings each have visibly simpler information hierarchy.
4. VAT still clearly communicates indicative/not-submitted status.
5. No financial, document, auth, or tenant semantics changed.
6. No global horizontal overflow at 320–820px.
7. Mobile bottom nav remains fully functional.
8. Desktop sidebar/layout remains functional at 1024/1280/1440.
9. Chromium and WebKit premium simplification tests pass.
10. Existing app CI stays green.
11. Independent QA must PASS before merge/release.
